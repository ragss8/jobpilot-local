import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, test } from "node:test";
import pg from "pg";
import { createApp, type GoogleProfile } from "../server/app.ts";
import { schema } from "../server/schema.ts";

const url = process.env.DATABASE_URL;
const run = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const profile = (name: string, emailVerified = true): GoogleProfile => ({
  sub: `test-${run}-${name}`,
  email: `${name}-${run}@example.com`,
  emailVerified,
  name,
});
const accounts: Record<string, GoogleProfile> = {
  alice: profile("alice"),
  bob: profile("bob"),
  mallory: profile("mallory"),
  unverified: profile("unverified", false),
};
const conversation = (...texts: string[]) => ({
  messages: texts.map((text, i) => ({
    role: i % 2 ? "assistant" : "user",
    text,
  })),
  brief: { site: { width: 30, depth: 40 } },
  result: null,
  choice: 0,
});

describe(
  "accounts and conversation history API",
  { skip: url ? false : "set DATABASE_URL (npm run test:server) to run against Postgres" },
  () => {
    let db: pg.Pool, server: Server, base: string;
    const call = async (
      path: string,
      init: { method?: string; token?: string; body?: unknown } = {},
    ) => {
      const response = await fetch(base + path, {
        method: init.method ?? "GET",
        headers: {
          "content-type": "application/json",
          ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
      return { status: response.status, body: await response.json().catch(() => null) };
    };
    const signIn = (credential: string) =>
      call("/auth/google", { method: "POST", body: { credential } });

    before(async () => {
      db = new pg.Pool({ connectionString: url });
      await db.query(schema);
      const app = createApp({
        db,
        jwtSecret: "test-secret-".padEnd(40, "x"),
        googleClientId: "test-client",
        allowedEmails: [accounts.alice.email, accounts.bob.email, accounts.unverified.email],
        verifyGoogle: async (credential) => {
          if (!accounts[credential]) throw Error("invalid token");
          return accounts[credential];
        },
      });
      server = app.listen(0, "127.0.0.1");
      await once(server, "listening");
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
    });

    after(async () => {
      await db.query("delete from users where google_sub like $1", [`test-${run}-%`]);
      server.close();
      await db.end();
    });

    test("Google sign-in returns a JWT that authorises API calls", async () => {
      const { status, body } = await signIn("alice");
      assert.equal(status, 200);
      assert.equal(body.user.email, accounts.alice.email);
      assert.equal((await call("/conversations", { token: body.token })).status, 200);
      assert.equal((await call("/conversations")).status, 401);
      assert.equal((await call("/conversations", { token: body.token + "x" })).status, 401);
    });

    test("sign-in rejects invalid tokens, unlisted accounts and unverified emails", async () => {
      assert.equal((await signIn("forged")).status, 401);
      assert.equal((await signIn("mallory")).status, 403);
      assert.equal((await signIn("unverified")).status, 403);
    });

    test("each user sees only their own conversations, and every message is recorded", async () => {
      const alice = (await signIn("alice")).body.token;
      const bob = (await signIn("bob")).body.token;
      const id = crypto.randomUUID();
      const first = await call(`/conversations/${id}`, {
        method: "PUT",
        token: alice,
        body: conversation("A 30 × 40 G+3 house", "I found 3 concepts."),
      });
      assert.equal(first.status, 200);
      assert.equal(first.body.title, "A 30 × 40 G+3 house");
      const longer = conversation(
        "A 30 × 40 G+3 house",
        "I found 3 concepts.",
        "Use 20 × 30 instead",
        "I couldn’t find a layout.",
      );
      const saved = await call(`/conversations/${id}`, { method: "PUT", token: alice, body: longer });
      assert.equal(saved.body.messageCount, 4);
      assert.deepEqual((await call(`/conversations/${id}`, { token: alice })).body, longer);

      assert.equal((await call(`/conversations/${id}`, { token: bob })).status, 404);
      const hijack = await call(`/conversations/${id}`, {
        method: "PUT",
        token: bob,
        body: conversation("overwrite"),
      });
      assert.equal(hijack.status, 404);
      assert.deepEqual((await call(`/conversations/${id}`, { token: alice })).body, longer);
      assert.deepEqual((await call("/conversations", { token: bob })).body, []);
      const list: { id: string; messageCount: number }[] = (
        await call("/conversations", { token: alice })
      ).body;
      assert.deepEqual(list.map((c) => [c.id, c.messageCount]), [[id, 4]]);
      const { rows } = await db.query(
        "select role, text from messages where conversation_id = $1 order by position",
        [id],
      );
      assert.deepEqual(rows, longer.messages);
    });

    test("malformed conversations are rejected", async () => {
      const alice = (await signIn("alice")).body.token;
      const put = (body: unknown) =>
        call(`/conversations/${crypto.randomUUID()}`, { method: "PUT", token: alice, body });
      assert.equal((await put({ messages: [] })).status, 400);
      assert.equal((await put({ messages: [{ role: "system", text: "x" }] })).status, 400);
      assert.equal((await call("/conversations/not-a-uuid", { token: alice })).status, 404);
    });
  },
);
