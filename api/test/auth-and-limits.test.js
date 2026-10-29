import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("unpublished reads, preview API block, and body limits", () => {
  let dataRoot;
  let fetchApp;
  const apiKey = "test-auth-limits-key";
  const auth = { Authorization: `Bearer ${apiKey}` };

  const req = (path, init) =>
    fetchApp(new Request(`http://localhost${path}`, init));

  beforeAll(async () => {
    process.env.DATA_ROOT = await mkdtemp(join(tmpdir(), "capuz-auth-limits-"));
    process.env.CMS_API_KEY = apiKey;
    process.env.STORAGE_BACKEND = "fs";
    process.env.PREVIEW_HOST = "preview.localhost";
    process.env.MAX_BODY_BYTES = String(1024);

    const { app } = await import(`../src/server.js?auth-limits=${Date.now()}`);
    fetchApp = app.fetch.bind(app);

    const { getDataRoot } = await import("../src/paths.js");
    dataRoot = getDataRoot();

    await mkdir(join(dataRoot, ".drafts"), { recursive: true });
    await mkdir(join(dataRoot, "assets"), { recursive: true });
    await writeFile(join(dataRoot, "index.html"), "<p>live</p>\n");
    await writeFile(join(dataRoot, ".drafts", "index.html"), "<p>draft</p>\n");
    await writeFile(join(dataRoot, "assets", "site.css"), "body{}\n");
  });

  afterAll(async () => {
    for (const dir of new Set([dataRoot, process.env.DATA_ROOT])) {
      if (dir?.startsWith(tmpdir())) {
        await rm(dir, { recursive: true, force: true });
      }
    }
  });

  test("draft list and content require a key", async () => {
    expect((await req("/api/drafts")).status).toBe(401);
    expect((await req("/api/drafts/index.html")).status).toBe(401);

    const list = await req("/api/drafts", { headers: auth });
    expect(list.status).toBe(200);
    expect((await list.json()).pages).toContain("index.html");

    const draft = await req("/api/drafts/index.html", { headers: auth });
    expect(draft.status).toBe(200);
    expect(await draft.text()).toContain("draft");
  });

  test("page diff and changedOnly list require a key", async () => {
    expect((await req("/api/pages/index.html/diff")).status).toBe(401);
    expect((await req("/api/pages?changedOnly=true")).status).toBe(401);

    const diff = await req("/api/pages/index.html/diff", { headers: auth });
    expect(diff.status).toBe(200);

    const changed = await req("/api/pages?changedOnly=true", { headers: auth });
    expect(changed.status).toBe(200);
  });

  test("asset content requires a key; asset listing stays public", async () => {
    expect((await req("/api/assets/assets/site.css")).status).toBe(401);
    const listed = await req("/api/assets");
    expect(listed.status).toBe(200);

    const asset = await req("/api/assets/assets/site.css", { headers: auth });
    expect(asset.status).toBe(200);
    expect((await asset.json()).path).toBe("assets/site.css");
  });

  test("published page GETs stay public", async () => {
    expect((await req("/api/pages")).status).toBe(200);
    expect((await req("/api/pages/index.html")).status).toBe(200);
  });

  test("preview host serves pages without auth but blocks API and MCP", async () => {
    const page = await req("/about-missing", {
      headers: { Host: "preview.localhost" },
    });
    expect(page.status).toBe(404);

    const home = await req("/", { headers: { Host: "preview.localhost" } });
    expect(home.status).toBe(200);
    expect(await home.text()).toContain("draft");

    for (const path of ["/api/pages", "/api/drafts", "/openapi.json", "/mcp"]) {
      const res = await req(path, { headers: { Host: "preview.localhost" } });
      expect(res.status).toBe(403);
    }

    const health = await req("/health", { headers: { Host: "preview.localhost" } });
    expect(health.status).toBe(200);
  });

  test("oversized Content-Length is rejected with 413", async () => {
    const res = await req("/api/pages/huge.html", {
      method: "PUT",
      headers: {
        ...auth,
        "Content-Length": "2048",
      },
      body: "x".repeat(2048),
    });
    expect(res.status).toBe(413);
  });
});
