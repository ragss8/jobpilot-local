import { createRemoteJWKSet, jwtVerify } from "jose";
import pg from "pg";
import { createApp } from "./app.ts";
import { schema } from "./schema.ts";

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw Error(`Set ${name} in .env (see .env.example).`);
  return value;
}

const jwtSecret = required("JWT_SECRET");
if (jwtSecret.length < 32)
  throw Error("JWT_SECRET must be at least 32 characters.");
const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim() ?? "";
const db = new pg.Pool({ connectionString: required("DATABASE_URL") });
await db.query(schema);

const googleKeys = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);
const app = createApp({
  db,
  jwtSecret,
  googleClientId,
  allowedEmails: (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
  async verifyGoogle(credential) {
    const { payload } = await jwtVerify(credential, googleKeys, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: googleClientId,
    });
    if (!payload.sub || typeof payload.email !== "string")
      throw Error("The Google ID token has no account identity.");
    return {
      sub: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified === true,
      name: typeof payload.name === "string" ? payload.name : undefined,
      picture: typeof payload.picture === "string" ? payload.picture : undefined,
    };
  },
});

const port = Number(process.env.API_PORT ?? 8787);
app.listen(port, "127.0.0.1", (error) => {
  if (error) throw error;
  console.log(
    `Aangan API on http://127.0.0.1:${port}${googleClientId ? "" : " (Google sign-in not configured)"}`,
  );
});
