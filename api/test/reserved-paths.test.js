import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Page and asset routes must not reach internal storage: the drafts tree, the
// immutable components tree, or hidden directories that share the data root
// (Open WebUI's DATA_DIR is /app/data/.open-webui in compose).
describe("reserved storage paths", () => {
  let dataRoot;
  let fetchApp;
  const apiKey = "test-reserved-paths-key";
  const auth = { Authorization: `Bearer ${apiKey}` };

  const req = (path, init) =>
    fetchApp(new Request(`http://localhost${path}`, init));

  beforeAll(async () => {
    process.env.DATA_ROOT = await mkdtemp(join(tmpdir(), "capuz-reserved-paths-"));
    process.env.CMS_API_KEY = apiKey;
    process.env.STORAGE_BACKEND = "fs";
    process.env.PREVIEW_HOST = "preview.localhost";

    const { app } = await import(`../src/server.js?reserved-paths=${Date.now()}`);
    fetchApp = app.fetch.bind(app);

    // paths.js resolves DATA_ROOT once at module load, and earlier test files in
    // the same run may already have loaded it, so seed whichever root is live.
    const { getDataRoot } = await import("../src/paths.js");
    dataRoot = getDataRoot();

    await mkdir(join(dataRoot, ".drafts"), { recursive: true });
    await mkdir(join(dataRoot, ".components"), { recursive: true });
    await mkdir(join(dataRoot, ".open-webui", "uploads"), { recursive: true });
    await writeFile(join(dataRoot, "index.html"), "<p>live</p>\n");
    await writeFile(join(dataRoot, ".drafts", "victim.html"), "<p>victim draft</p>\n");
    await writeFile(join(dataRoot, ".components", "footer.html"), "<footer>real</footer>\n");
    await writeFile(join(dataRoot, ".open-webui", "uploads", "chat.json"), '{"private":true}\n');
  });

  afterAll(async () => {
    for (const dir of new Set([dataRoot, process.env.DATA_ROOT])) {
      if (dir?.startsWith(tmpdir())) {
        await rm(dir, { recursive: true, force: true });
      }
    }
  });

  test("page write into the drafts tree is rejected", async () => {
    const res = await req("/api/pages/.drafts/victim.html", {
      method: "PUT",
      headers: auth,
      body: "<p>pwned</p>",
    });
    expect(res.status).toBe(400);
    expect(await readFile(join(dataRoot, ".drafts", "victim.html"), "utf8")).toBe(
      "<p>victim draft</p>\n",
    );
  });

  test("page write into the components tree is rejected", async () => {
    const res = await req("/api/pages/.components/footer.html", {
      method: "PUT",
      headers: auth,
      body: "<footer>pwned</footer>",
    });
    expect(res.status).toBe(400);
    expect(await readFile(join(dataRoot, ".components", "footer.html"), "utf8")).toBe(
      "<footer>real</footer>\n",
    );
  });

  test("page delete cannot remove a component", async () => {
    const res = await req("/api/pages/.components/footer.html", {
      method: "DELETE",
      headers: auth,
    });
    expect(res.status).toBe(400);
    expect(await readFile(join(dataRoot, ".components", "footer.html"), "utf8")).toBe(
      "<footer>real</footer>\n",
    );
  });

  test("publish cannot target a reserved path", async () => {
    const res = await req("/api/pages/.drafts/victim.html/publish", {
      method: "POST",
      headers: auth,
    });
    expect(res.status).toBe(400);
  });

  test("move and copy cannot escape into reserved paths", async () => {
    for (const route of ["/api/pages/move", "/api/pages/copy"]) {
      const res = await req(route, {
        method: "POST",
        headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ from: "index.html", to: ".drafts/victim.html" }),
      });
      expect(res.status).toBe(400);
    }
  });

  test("asset routes cannot read or write the Open WebUI data dir", async () => {
    const read = await req("/api/assets/.open-webui/uploads/chat.json", {
      headers: auth,
    });
    expect(read.status).toBe(400);

    const write = await req("/api/assets/.open-webui/uploads/chat.json", {
      method: "PUT",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ contentBase64: Buffer.from("x").toString("base64") }),
    });
    expect(write.status).toBe(400);
    expect(await readFile(join(dataRoot, ".open-webui", "uploads", "chat.json"), "utf8")).toBe(
      '{"private":true}\n',
    );
  });

  test("preview host does not serve hidden directories", async () => {
    const res = await req("/.open-webui/uploads/chat.json", {
      headers: { Host: "preview.localhost" },
    });
    expect(res.status).toBe(400);
  });

  test("normal page and asset paths still work", async () => {
    const page = await req("/api/pages/index.html");
    expect(page.status).toBe(200);

    const write = await req("/api/pages/about.html", {
      method: "PUT",
      headers: auth,
      body: "<p>about</p>",
    });
    expect(write.status).toBe(200);
    expect((await write.json()).path).toBe("about.html");

    const publish = await req("/api/pages/about.html/publish", {
      method: "POST",
      headers: auth,
    });
    expect(publish.status).toBe(200);
  });

  test("over-long file names return 400 without leaking a server path", async () => {
    const res = await req(`/api/pages/${"a".repeat(300)}.html`, {
      method: "PUT",
      headers: auth,
      body: "<p>x</p>",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).not.toContain(dataRoot);
    expect(body.error).not.toContain("ENAMETOOLONG");
  });

  test("malformed percent-encoding on preview returns 400", async () => {
    const res = await req("/%ff", { headers: { Host: "preview.localhost" } });
    expect(res.status).toBe(400);
  });

  test("an API key with a trailing newline still accepts the trimmed token", async () => {
    process.env.CMS_API_KEY = `${apiKey}\n`;
    try {
      const res = await req("/api/pages/newline.html", {
        method: "PUT",
        headers: auth,
        body: "<p>x</p>",
      });
      expect(res.status).toBe(200);
    } finally {
      process.env.CMS_API_KEY = apiKey;
    }
  });
});
