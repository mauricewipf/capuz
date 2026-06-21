import type { Context, Next } from "hono";

const DEV_DEFAULT_KEY = "dev-local-key";

export function requireAuth(c: Context, next: Next) {
  const expected = process.env.CMS_API_KEY;
  if (!expected) {
    return c.json({ error: "CMS_API_KEY is not configured" }, 500);
  }

  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = header.slice("Bearer ".length);
  if (token !== expected) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  return next();
}

export function warnIfInsecureApiKey(): void {
  const key = process.env.CMS_API_KEY?.trim();
  if (!key) {
    console.warn("WARNING: CMS_API_KEY is not set. MCP and write endpoints will reject requests.");
    return;
  }
  if (key === DEV_DEFAULT_KEY) {
    console.warn(
      "WARNING: CMS_API_KEY is set to the development default. Generate a secure key before publishing.",
    );
  }
}
