import { Hono } from "hono";
import { requireAuth } from "./auth.ts";
import {
  deletePage,
  handlePathError,
  listPages,
  readPage,
  writePage,
} from "./pages.ts";
import { handleMcpRequest } from "./mcp.ts";

const app = new Hono();

app.get("/health", (c) => c.json({ ok: true }));

app.get("/openapi.json", (c) =>
  c.json({
    openapi: "3.0.0",
    info: {
      title: "Capuzzella CMS API",
      version: "1.0.0",
    },
    paths: {
      "/api/pages": {
        get: { summary: "List pages", operationId: "listPages" },
      },
      "/api/pages/{path}": {
        get: { summary: "Read page", operationId: "readPage" },
        put: { summary: "Write page", operationId: "writePage" },
        delete: { summary: "Delete page", operationId: "deletePage" },
      },
    },
  }),
);

app.all("/mcp", async (c) => handleMcpRequest(c.req.raw));
app.all("/mcp/*", async (c) => handleMcpRequest(c.req.raw));

app.get("/api/pages", async (c) => {
  try {
    const pages = await listPages();
    return c.json({ pages });
  } catch (error) {
    const { message, status } = handlePathError(error);
    return c.json({ error: message }, status as 400);
  }
});

app.get("/api/pages/*", async (c) => {
  const path = c.req.path.replace(/^\/api\/pages\/?/, "");
  try {
    const html = await readPage(path);
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
    const saved = await writePage(path, html);
    return c.json({ ok: true, path: saved });
  } catch (error) {
    const { message, status } = handlePathError(error);
    return c.json({ error: message }, status as 400);
  }
});

app.delete("/api/pages/*", requireAuth, async (c) => {
  const path = c.req.path.replace(/^\/api\/pages\/?/, "");
  try {
    await deletePage(path);
    return c.json({ ok: true, path });
  } catch (error) {
    const { message, status } = handlePathError(error);
    return c.json({ error: message }, status as 400);
  }
});

const port = Number(process.env.API_PORT || 3000);

console.log(`CMS API listening on :${port}`);

export default {
  port,
  hostname: "0.0.0.0",
  fetch: app.fetch,
};
