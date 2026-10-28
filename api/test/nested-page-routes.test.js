import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";

// Hono "*" matches one segment when a suffix follows (e.g. /pages/*/diff).
// Nested pages need :path{.+}/diff so impressum/index.html/diff hits the diff handler.
describe("Hono nested page path patterns", () => {
  test("star/diff only matches a single path segment", async () => {
    const app = new Hono();
    app.get("/api/pages/*/diff", (c) =>
      c.json({
        route: "diff",
        path: c.req.path.replace(/^\/api\/pages\/?/, "").replace(/\/diff$/, ""),
      }),
    );
    app.get("/api/pages/*", (c) =>
      c.json({
        route: "get",
        path: c.req.path.replace(/^\/api\/pages\/?/, ""),
      }),
    );

    const flat = await (await app.request("/api/pages/index.html/diff")).json();
    expect(flat).toEqual({ route: "diff", path: "index.html" });

    const nested = await (
      await app.request("/api/pages/impressum/index.html/diff")
    ).json();
    expect(nested).toEqual({
      route: "get",
      path: "impressum/index.html/diff",
    });
  });

  test("regex path param matches nested and flat page paths", async () => {
    const app = new Hono();
    app.get("/api/pages/:path{.+}/diff", (c) =>
      c.json({ route: "diff", path: c.req.param("path") }),
    );
    app.get("/api/pages/*", (c) =>
      c.json({
        route: "get",
        path: c.req.path.replace(/^\/api\/pages\/?/, ""),
      }),
    );

    for (const [url, path] of [
      ["/api/pages/index.html/diff", "index.html"],
      ["/api/pages/impressum/index.html/diff", "impressum/index.html"],
      ["/api/pages/a/b/c.html/diff", "a/b/c.html"],
    ]) {
      const body = await (await app.request(url)).json();
      expect(body).toEqual({ route: "diff", path });
    }

    const page = await (await app.request("/api/pages/impressum/index.html")).json();
    expect(page).toEqual({ route: "get", path: "impressum/index.html" });
  });
});

describe("CMS API nested page routes", () => {
  let dataRoot;
  let fetchApp;
  const apiKey = "test-nested-routes-key";

  beforeAll(async () => {
    dataRoot = await mkdtemp(join(tmpdir(), "capuz-nested-routes-"));
    process.env.DATA_ROOT = dataRoot;
    process.env.CMS_API_KEY = apiKey;
    process.env.STORAGE_BACKEND = "fs";

    await mkdir(join(dataRoot, "impressum"), { recursive: true });
    await mkdir(join(dataRoot, ".drafts", "impressum"), { recursive: true });
    await writeFile(join(dataRoot, "impressum", "index.html"), "<p>live</p>\n");
    await writeFile(join(dataRoot, ".drafts", "impressum", "index.html"), "<p>draft</p>\n");
    await writeFile(join(dataRoot, "index.html"), "<p>home live</p>\n");
    await mkdir(join(dataRoot, ".drafts"), { recursive: true });
    await writeFile(join(dataRoot, ".drafts", "index.html"), "<p>home draft</p>\n");
    await mkdir(join(dataRoot, ".drafts", "news"), { recursive: true });
    await writeFile(join(dataRoot, ".drafts", "news", "hello.html"), "<p>news draft</p>\n");

    const { app } = await import(`../src/server.js?nested-routes=${Date.now()}`);
    fetchApp = app.fetch.bind(app);
  });

  afterAll(async () => {
    if (dataRoot) {
      await rm(dataRoot, { recursive: true, force: true });
    }
  });

  test("GET diff works for nested impressum/index.html", async () => {
    const res = await fetchApp(
      new Request("http://localhost/api/pages/impressum/index.html/diff"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.path).toBe("impressum/index.html");
    expect(body.hasChanges).toBe(true);
    expect(body.diff).toContain("draft");
  });

  test("GET diff still works for flat index.html", async () => {
    const res = await fetchApp(new Request("http://localhost/api/pages/index.html/diff"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.path).toBe("index.html");
    expect(body.hasChanges).toBe(true);
  });

  test("nested diff without draft returns 404, not extension error", async () => {
    const res = await fetchApp(
      new Request("http://localhost/api/pages/missing/page.html/diff"),
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("No draft found to diff");
  });

  test("POST publish accepts nested page path", async () => {
    const res = await fetchApp(
      new Request("http://localhost/api/pages/news/hello.html/publish", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, path: "news/hello.html" });
  });
});
