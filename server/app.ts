import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { SignJWT, jwtVerify } from "jose";
import type { Pool } from "pg";

export interface GoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
}

export interface AppOptions {
  db: Pool;
  jwtSecret: string;
  googleClientId: string;
  /** Lower-case addresses allowed to sign in. Empty allows any verified Google account. */
  allowedEmails: string[];
  /** Verifies a Google Identity Services ID token. */
  verifyGoogle: (credential: string) => Promise<GoogleProfile>;
}

interface Message {
  role: "user" | "assistant";
  text: string;
}

const ISSUER = "aangan";
const AUDIENCE = "aangan-web";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isMessage = (m: unknown): m is Message =>
  typeof m === "object" &&
  m !== null &&
  ["user", "assistant"].includes((m as Message).role) &&
  typeof (m as Message).text === "string";

const notFound = (res: Response) =>
  res.status(404).json({ error: "Conversation not found." });

export function createApp(options: AppOptions) {
  const { db, googleClientId, allowedEmails, verifyGoogle } = options;
  const key = new TextEncoder().encode(options.jwtSecret);
  const app = express();
  app.use(express.json({ limit: "20mb" }));

  app.get("/api/auth/config", (_req, res) => {
    res.json({ googleClientId });
  });

  // Exchanges a Google ID token for this app's own session JWT.
  app.post("/api/auth/google", async (req, res) => {
    if (!googleClientId) {
      res.status(503).json({
        error:
          "Google sign-in isn't configured. Set GOOGLE_CLIENT_ID in .env and restart the API.",
      });
      return;
    }
    let profile: GoogleProfile;
    try {
      profile = await verifyGoogle(String(req.body?.credential ?? ""));
    } catch {
      res
        .status(401)
        .json({ error: "Google sign-in couldn't be verified. Try again." });
      return;
    }
    const email = profile.email.toLowerCase();
    if (
      !profile.emailVerified ||
      (allowedEmails.length > 0 && !allowedEmails.includes(email))
    ) {
      res
        .status(403)
        .json({ error: `${profile.email} isn't allowed to sign in to this demo.` });
      return;
    }
    const {
      rows: [user],
    } = await db.query(
      `insert into users (google_sub, email, name, picture) values ($1, $2, $3, $4)
       on conflict (google_sub) do update
         set email = excluded.email, name = excluded.name, picture = excluded.picture, last_login_at = now()
       returning id, email, name, picture`,
      [profile.sub, email, profile.name ?? null, profile.picture ?? null],
    );
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(user.id)
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(key);
    res.json({ token, user });
  });

  async function authenticate(req: Request, res: Response, next: NextFunction) {
    const token = /^Bearer (.+)$/.exec(req.get("authorization") ?? "")?.[1];
    try {
      const { payload } = await jwtVerify(token ?? "", key, {
        issuer: ISSUER,
        audience: AUDIENCE,
        algorithms: ["HS256"],
      });
      res.locals.userId = payload.sub;
    } catch {
      res.status(401).json({ error: "Your session has ended. Sign in again." });
      return;
    }
    next();
  }

  app.get("/api/conversations", authenticate, async (_req, res) => {
    const { rows } = await db.query(
      `select c.id, c.title, c.updated_at as "updatedAt",
              (select count(*)::int from messages m where m.conversation_id = c.id) as "messageCount"
         from conversations c
        where c.user_id = $1
        order by c.updated_at desc`,
      [res.locals.userId],
    );
    res.json(rows);
  });

  app.get("/api/conversations/:id", authenticate, async (req, res) => {
    const id = String(req.params.id);
    if (!UUID.test(id)) {
      notFound(res);
      return;
    }
    const {
      rows: [row],
    } = await db.query(
      `select c.state,
              coalesce(json_agg(json_build_object('role', m.role, 'text', m.text) order by m.position)
                filter (where m.conversation_id is not null), '[]'::json) as messages
         from conversations c
         left join messages m on m.conversation_id = c.id
        where c.id = $1 and c.user_id = $2
        group by c.id`,
      [id, res.locals.userId],
    );
    if (!row) {
      notFound(res);
      return;
    }
    res.json({ ...row.state, messages: row.messages });
  });

  // Creates or updates a conversation owned by the signed-in user.
  app.put("/api/conversations/:id", authenticate, async (req, res) => {
    const id = String(req.params.id);
    if (!UUID.test(id)) {
      notFound(res);
      return;
    }
    const { messages, ...state } = (req.body ?? {}) as {
      messages?: unknown;
    };
    if (
      !Array.isArray(messages) ||
      !messages.length ||
      !messages.every(isMessage)
    ) {
      res.status(400).json({
        error: "A conversation needs at least one user or assistant message.",
      });
      return;
    }
    const first = messages.find((m) => m.role === "user") ?? messages[0];
    const title =
      first.text.replace(/\s+/g, " ").trim().slice(0, 80) ||
      "Untitled conversation";
    const client = await db.connect();
    try {
      await client.query("begin");
      const {
        rows: [saved],
      } = await client.query(
        `insert into conversations (id, user_id, title, state) values ($1, $2, $3, $4)
         on conflict (id) do update
           set title = excluded.title, state = excluded.state, updated_at = now()
           where conversations.user_id = excluded.user_id
         returning id, title, updated_at as "updatedAt"`,
        [id, res.locals.userId, title, JSON.stringify(state)],
      );
      if (!saved) {
        // The id belongs to another user.
        await client.query("rollback");
        notFound(res);
        return;
      }
      // The studio only appends messages, so each position keeps its first recorded text and time.
      await client.query(
        `insert into messages (conversation_id, position, role, text)
         select $1, (m.n - 1)::int, m.role, m.text
           from unnest($2::text[], $3::text[]) with ordinality as m (role, text, n)
         on conflict (conversation_id, position) do nothing`,
        [id, messages.map((m) => m.role), messages.map((m) => m.text)],
      );
      await client.query("commit");
      res.json({ ...saved, messageCount: messages.length });
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });

  app.use(
    (
      error: Error & { status?: number },
      _req: Request,
      res: Response,
      _next: NextFunction,
    ) => {
      const status = error.status ?? 500;
      if (status >= 500) console.error(error);
      res.status(status).json({
        error:
          status === 413
            ? "This conversation is too large to save."
            : status < 500
              ? "The request couldn't be read."
              : "Something went wrong on the server.",
      });
    },
  );

  return app;
}
