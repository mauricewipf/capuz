import { Hono } from "hono";
import { requireAuth, warnIfInsecureApiKey } from "./auth.ts";
import { handleMcpRequest } from "./mcp.ts";
import { openApiDocument } from "./openapi.ts";
import { handlePathError } from "./pages.ts";
import { getStorage } from "./storage/index.ts";

const app = new Hono();
const storage = getStorage();

app.get("/health", (c) => c.json({ ok: true }));

app.get("/openapi.json", (c) => c.json(openApiDocument));

app.all("/mcp", requireAuth, async (c) => handleMcpRequest(c.req.raw));
app.all("/mcp/*", requireAuth, async (c) => handleMcpRequest(c.req.raw));

app.get("/api/pages", async (c) => {
  try {
    const pages = await storage.listPages();
    return c.json({ pages });
  } catch (error) {
    const { message, status } = handlePathError(error);
    return c.json({ error: message }, status as 400);
  }
});

app.get("/api/pages/*", async (c) => {
  const path = c.req.path.replace(/^\/api\/pages\/?/, "");
  try {
    const html = await storage.readPage(path);
    return c.text(html, 200, { "Content-Type": "text/html; charset=utf-8" });
  } catch (error) {
    const { message, status } = handlePathError(error);
    return c.json({ error: message }, status as 400);
  }
});

app.put("/api/pages/*", requireAuth, async (c) => {
  const path = c.req.path.replace(/^\/api\/pages\/?/, "");
  const html = await c.req.text();
  try {
    const saved = await storage.writePage(path, html);
    return c.json({ ok: true, path: saved });
  } catch (error) {
    const { message, status } = handlePathError(error);
    return c.json({ error: message }, status as 400);
  }
});

app.delete("/api/pages/*", requireAuth, async (c) => {
  const path = c.req.path.replace(/^\/api\/pages\/?/, "");
  try {
    await storage.deletePage(path);
    return c.json({ ok: true, path });
  } catch (error) {
    const { message, status } = handlePathError(error);
    return c.json({ error: message }, status as 400);
  }
});

const port = Number(process.env.API_PORT || 3000);
const backend = process.env.STORAGE_BACKEND || "fs";

warnIfInsecureApiKey();
console.log(`CMS API listening on :${port} (STORAGE_BACKEND=${backend})`);

export default {
  port,
  hostname: "0.0.0.0",
  fetch: app.fetch,
};
