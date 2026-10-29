const DEV_DEFAULT_KEY = "dev-local-key";

export function requireAuth(c, next) {
  // Trimmed on both sides: keys sourced from a secret file commonly carry a
  // trailing newline, which would otherwise reject every correct token.
  const expected = process.env.CMS_API_KEY?.trim();
  if (!expected) {
    return c.json({ error: "CMS_API_KEY is not configured" }, 500);
  }

  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = header.slice("Bearer ".length).trim();
  if (token !== expected) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  return next();
}

export function warnIfInsecureApiKey() {
  const raw = process.env.CMS_API_KEY;
  const key = raw?.trim();
  if (!key) {
    console.warn("WARNING: CMS_API_KEY is not set. MCP and write endpoints will reject requests.");
    return;
  }
  if (raw !== key) {
    console.warn(
      "WARNING: CMS_API_KEY has surrounding whitespace (often a trailing newline from a secret file). It is trimmed before comparison; clients must send the trimmed value.",
    );
  }
  if (key === DEV_DEFAULT_KEY) {
    console.warn(
      "WARNING: CMS_API_KEY is set to the development default. Generate a secure key before publishing.",
    );
  }
}
