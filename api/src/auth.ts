import type { Context, Next } from "hono";

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
