import { Hono } from "hono";
import { requireAuth, warnIfInsecureApiKey } from "./auth.js";
import { handleMcpRequest } from "./mcp.js";
import { openApiDocument } from "./openapi.js";
import { handlePathError } from "./pages.js";
import { buildPreviewUrl } from "./paths.js";
import { previewMiddleware } from "./preview.js";
import { getStorage, listPagesWithStatus } from "./storage/index.js";

const app = new Hono();
const storage = getStorage();

app.use("*", previewMiddleware());

app.get("/health", (c) => c.json({ ok: true }));

app.get("/openapi.json", (c) => c.json(openApiDocument));

app.all("/mcp", requireAuth, async (c) => handleMcpRequest(c.req.raw));
app.all("/mcp/*", requireAuth, async (c) => handleMcpRequest(c.req.raw));

app.get("/api/pages", async (c) => {
  try {
    const detail = c.req.query("detail");
    if (detail === "status") {
      const pages = await listPagesWithStatus(storage);
      return c.json({ pages });
    }
    const pages = await storage.listPages();
    return c.json({ pages });
  } catch (error) {
    const { message, status } = handlePathError(error);
    return c.json({ error: message }, status);
  }
});

app.get("/api/drafts", async (c) => {
  try {
    const pages = await storage.listDrafts();
    return c.json({ pages });
  } catch (error) {
    const { message, status } = handlePathError(error);
    return c.json({ error: message }, status);
  }
});

app.post("/api/drafts/*/publish", requireAuth, async (c) => {
  const path = c.req.path
    .replace(/^\/api\/drafts\/?/, "")
    .replace(/\/publish$/, "");
  try {
    const saved = await storage.publishDraft(path);
    return c.json({ ok: true, path: saved });
  } catch (error) {
    const { message, status } = handlePathError(error);
    return c.json({ error: message }, status);
  }
});

app.post("/api/pages/*/publish", requireAuth, async (c) => {
  const path = c.req.path
    .replace(/^\/api\/pages\/?/, "")
    .replace(/\/publish$/, "");
  try {
    const saved = await storage.publishDraft(path);
    return c.json({ ok: true, path: saved });
  } catch (error) {
    const { message, status } = handlePathError(error);
    return c.json({ error: message }, status);
  }
});

app.get("/api/drafts/*", async (c) => {
  const path = c.req.path.replace(/^\/api\/drafts\/?/, "");
  try {
    const html = await storage.readDraft(path);
    return c.text(html, 200, { "Content-Type": "text/html; charset=utf-8" });
  } catch (error) {
    const { message, status } = handlePathError(error);
    return c.json({ error: message }, status);
  }
});

app.delete("/api/drafts/*", requireAuth, async (c) => {
  const path = c.req.path.replace(/^\/api\/drafts\/?/, "");
  try {
    await storage.discardDraft(path);
    return c.json({ ok: true, path });
  } catch (error) {
    const { message, status } = handlePathError(error);
    return c.json({ error: message }, status);
  }
});

app.get("/api/pages/*", async (c) => {
  const path = c.req.path.replace(/^\/api\/pages\/?/, "");
  try {
    const html = await storage.readPage(path);
    return c.text(html, 200, { "Content-Type": "text/html; charset=utf-8" });
  } catch (error) {
    const { message, status } = handlePathError(error);
    return c.json({ error: message }, status);
  }
});

app.put("/api/drafts/*", requireAuth, async (c) => {
  const path = c.req.path.replace(/^\/api\/drafts\/?/, "");
  const html = await c.req.text();
  try {
    const saved = await storage.writeDraft(path, html);
    return c.json({ ok: true, path: saved, previewUrl: buildPreviewUrl(saved) });
  } catch (error) {
    const { message, status } = handlePathError(error);
    return c.json({ error: message }, status);
  }
});

app.put("/api/pages/*", requireAuth, async (c) => {
  const path = c.req.path.replace(/^\/api\/pages\/?/, "");
  const html = await c.req.text();
  try {
    const saved = await storage.writeDraft(path, html);
    return c.json({ ok: true, path: saved, previewUrl: buildPreviewUrl(saved) });
  } catch (error) {
    const { message, status } = handlePathError(error);
    return c.json({ error: message }, status);
  }
});

app.delete("/api/pages/*", requireAuth, async (c) => {
  const path = c.req.path.replace(/^\/api\/pages\/?/, "");
  try {
    await storage.deletePage(path);
    return c.json({ ok: true, path });
  } catch (error) {
    const { message, status } = handlePathError(error);
    return c.json({ error: message }, status);
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
