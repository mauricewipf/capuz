import { Hono } from "hono";
import { requireAuth, warnIfInsecureApiKey } from "./auth.js";
import { deleteAsset, listAssets, readAssetInfo, uploadAsset } from "./assets.js";
import {
  deleteComponent,
  insertComponent,
  listComponents,
  readComponent,
  suggestComponents,
  syncComponent,
  writeComponent,
} from "./components.js";
import { handleMcpRequest } from "./mcp.js";
import { checkLinks, invalidateLinkGraph, warnInboundLinks } from "./links.js";
import { openApiDocument } from "./openapi.js";
import { handlePathError } from "./pages.js";
import { buildPreviewUrl } from "./paths.js";
import {
  copyPage,
  diffPage,
  editPage,
  movePage,
  renamePage,
  searchPages,
} from "./page-ops.js";
import { previewMiddleware } from "./preview.js";
import { applyPageSeo, auditPageSeo, regenerateSitemap } from "./seo.js";
import { renderPreviewScreenshot } from "./screenshot.js";
import { getStorage, listPagesWithStatus } from "./storage/index.js";

const app = new Hono();
const storage = getStorage();

function pathFromRequest(c, prefix) {
  return c.req.path.replace(new RegExp(`^${prefix}/?`), "");
}

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

app.get("/api/search", async (c) => {
  try {
    const query = c.req.query("q") || "";
    const maxResults = Number(c.req.query("limit") || 20);
    const result = await searchPages(storage, query, maxResults);
    return c.json(result);
  } catch (error) {
    const { message, status } = handlePathError(error);
    return c.json({ error: message }, status);
  }
});

app.get("/api/links/check", async (c) => {
  try {
    const result = await checkLinks(storage);
    return c.json(result);
  } catch (error) {
    const { message, status } = handlePathError(error);
    return c.json({ error: message }, status);
  }
});

app.get("/api/assets", async (c) => {
  try {
    const prefix = c.req.query("prefix") || "";
    const assets = await listAssets(storage, prefix);
    return c.json({ assets });
  } catch (error) {
    const { message, status } = handlePathError(error);
    return c.json({ error: message }, status);
  }
});

app.get("/api/assets/*", async (c) => {
  try {
    const path = pathFromRequest(c, "/api/assets");
    const asset = await readAssetInfo(storage, path);
    return c.json(asset);
  } catch (error) {
    const { message, status } = handlePathError(error);
    return c.json({ error: message }, status);
  }
});

app.put("/api/assets/*", requireAuth, async (c) => {
  try {
    const path = pathFromRequest(c, "/api/assets");
    const body = await c.req.json();
    const result = await uploadAsset(storage, path, body.contentBase64);
    invalidateLinkGraph();
    return c.json({ ok: true, ...result });
  } catch (error) {
    const { message, status } = handlePathError(error);
    return c.json({ error: message }, status);
  }
});

app.delete("/api/assets/*", requireAuth, async (c) => {
  try {
    const path = pathFromRequest(c, "/api/assets");
    const result = await deleteAsset(storage, path);
    invalidateLinkGraph();
    return c.json({ ok: true, ...result });
  } catch (error) {
    const { message, status } = handlePathError(error);
    return c.json({ error: message }, status);
  }
});

app.get("/api/components", async (c) => {
  try {
    const components = await listComponents(storage);
    return c.json({ components });
  } catch (error) {
    const { message, status } = handlePathError(error);
    return c.json({ error: message }, status);
  }
});

app.get("/api/components/suggest", async (c) => {
  try {
    const minMatches = Number(c.req.query("minMatches") || 2);
    const maxCandidates = Number(c.req.query("maxCandidates") || 20);
    const result = await suggestComponents(storage, { minMatches, maxCandidates });
    return c.json(result);
  } catch (error) {
    const { message, status } = handlePathError(error);
    return c.json({ error: message }, status);
  }
});

app.get("/api/components/*", async (c) => {
  try {
    const name = pathFromRequest(c, "/api/components");
    const component = await readComponent(storage, name);
    return c.json(component);
  } catch (error) {
    const { message, status } = handlePathError(error);
    return c.json({ error: message }, status);
  }
});

app.put("/api/components/*", requireAuth, async (c) => {
  try {
    const name = pathFromRequest(c, "/api/components");
    const body = await c.req.json();
    const result = await writeComponent(storage, name, body.html);
    return c.json({ ok: true, ...result });
  } catch (error) {
    const { message, status } = handlePathError(error);
    return c.json({ error: message }, status);
  }
});

app.delete("/api/components/*", requireAuth, async (c) => {
  try {
    const name = pathFromRequest(c, "/api/components");
    const result = await deleteComponent(storage, name);
    return c.json({ ok: true, ...result });
  } catch (error) {
    const { message, status } = handlePathError(error);
    return c.json({ error: message }, status);
  }
});

app.post("/api/components/*/insert", requireAuth, async (c) => {
  try {
    const name = c.req.path.replace(/^\/api\/components\/?/, "").replace(/\/insert$/, "");
    const body = await c.req.json();
    const result = await insertComponent(
      storage,
      body.path,
      name,
      body.position || "before_body_end",
    );
    invalidateLinkGraph();
    return c.json({ ok: true, ...result });
  } catch (error) {
    const { message, status } = handlePathError(error);
    return c.json({ error: message }, status);
  }
});

app.post("/api/components/*/sync", requireAuth, async (c) => {
  try {
    const name = c.req.path.replace(/^\/api\/components\/?/, "").replace(/\/sync$/, "");
    const result = await syncComponent(storage, name);
    invalidateLinkGraph();
    return c.json({ ok: true, ...result });
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
    invalidateLinkGraph();
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
    invalidateLinkGraph();
    return c.json({ ok: true, path: saved });
  } catch (error) {
    const { message, status } = handlePathError(error);
    return c.json({ error: message }, status);
  }
});

app.post("/api/pages/*/edit", requireAuth, async (c) => {
  const path = c.req.path.replace(/^\/api\/pages\/?/, "").replace(/\/edit$/, "");
  try {
    const body = await c.req.json();
    const result = await editPage(
      storage,
      path,
      body.find,
      body.replace,
      Boolean(body.replaceAll),
    );
    invalidateLinkGraph();
    return c.json({ ok: true, ...result });
  } catch (error) {
    const { message, status } = handlePathError(error);
    return c.json({ error: message }, status);
  }
});

app.get("/api/pages/*/diff", async (c) => {
  const path = c.req.path.replace(/^\/api\/pages\/?/, "").replace(/\/diff$/, "");
  try {
    const result = await diffPage(storage, path);
    return c.json(result);
  } catch (error) {
    const { message, status } = handlePathError(error);
    return c.json({ error: message }, status);
  }
});

app.get("/api/pages/*/seo", async (c) => {
  const path = c.req.path.replace(/^\/api\/pages\/?/, "").replace(/\/seo$/, "");
  try {
    const result = await auditPageSeo(storage, path);
    return c.json(result);
  } catch (error) {
    const { message, status } = handlePathError(error);
    return c.json({ error: message }, status);
  }
});

app.post("/api/pages/*/seo", requireAuth, async (c) => {
  const path = c.req.path.replace(/^\/api\/pages\/?/, "").replace(/\/seo$/, "");
  try {
    const body = await c.req.json();
    const result = await applyPageSeo(storage, path, body);
    invalidateLinkGraph();
    return c.json({ ok: true, ...result });
  } catch (error) {
    const { message, status } = handlePathError(error);
    return c.json({ error: message }, status);
  }
});

app.post("/api/pages/*/preview-screenshot", requireAuth, async (c) => {
  const path = c.req.path.replace(/^\/api\/pages\/?/, "").replace(/\/preview-screenshot$/, "");
  try {
    const result = await renderPreviewScreenshot(storage, path);
    return c.json(result);
  } catch (error) {
    const { message, status } = handlePathError(error);
    return c.json({ error: message }, status);
  }
});

app.post("/api/pages/move", requireAuth, async (c) => {
  try {
    const body = await c.req.json();
    const warning = await warnInboundLinks(storage, body.from);
    const result = await movePage(storage, body.from, body.to);
    invalidateLinkGraph();
    return c.json({ ok: true, ...result, ...(warning ? { linkWarning: warning } : {}) });
  } catch (error) {
    const { message, status } = handlePathError(error);
    return c.json({ error: message }, status);
  }
});

app.post("/api/pages/rename", requireAuth, async (c) => {
  try {
    const body = await c.req.json();
    const warning = await warnInboundLinks(storage, body.from);
    const result = await renamePage(storage, body.from, body.to);
    invalidateLinkGraph();
    return c.json({ ok: true, ...result, ...(warning ? { linkWarning: warning } : {}) });
  } catch (error) {
    const { message, status } = handlePathError(error);
    return c.json({ error: message }, status);
  }
});

app.post("/api/pages/copy", requireAuth, async (c) => {
  try {
    const body = await c.req.json();
    const result = await copyPage(storage, body.from, body.to);
    invalidateLinkGraph();
    return c.json({ ok: true, ...result });
  } catch (error) {
    const { message, status } = handlePathError(error);
    return c.json({ error: message }, status);
  }
});

app.post("/api/sitemap/regenerate", requireAuth, async (c) => {
  try {
    const result = await regenerateSitemap(storage);
    invalidateLinkGraph();
    return c.json({ ok: true, ...result });
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
    invalidateLinkGraph();
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
    invalidateLinkGraph();
    return c.json({ ok: true, path: saved, previewUrl: buildPreviewUrl(saved) });
  } catch (error) {
    const { message, status } = handlePathError(error);
    return c.json({ error: message }, status);
  }
});

app.delete("/api/pages/*", requireAuth, async (c) => {
  const path = c.req.path.replace(/^\/api\/pages\/?/, "");
  try {
    const warning = await warnInboundLinks(storage, path);
    await storage.deletePage(path);
    invalidateLinkGraph();
    return c.json({ ok: true, path, ...(warning ? { linkWarning: warning } : {}) });
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
