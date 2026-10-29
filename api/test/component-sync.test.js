import { describe, expect, test } from "bun:test";
import { syncComponentInPage, tagComponentHtml } from "../src/html.js";
import { syncComponent } from "../src/components.js";

const page = (body) => `<html><head><title>T</title></head><body>${body}</body></html>`;

describe("syncComponentInPage", () => {
  test("replaces a tagged instance with the current component markup", () => {
    const html = page('<footer data-capuz-component="footer">old</footer>');
    const result = syncComponentInPage(html, "footer", "<footer>new</footer>");

    expect(result.updated).toBe(true);
    expect(result.html).toContain("new");
    expect(result.html).not.toContain("old");
    expect(result.html).toContain('data-capuz-component="footer"');
    expect(result.html).toContain("<title>T</title>");
  });

  test("replaces every instance on the page", () => {
    const html = page(
      '<footer data-capuz-component="footer">a</footer><div><footer data-capuz-component="footer">b</footer></div>',
    );
    const result = syncComponentInPage(html, "footer", "<footer>fresh</footer>");

    expect(result.html.match(/fresh/g)).toHaveLength(2);
    expect(result.html).not.toContain(">a<");
    expect(result.html).not.toContain(">b<");
  });

  test("leaves pages without an instance untouched", () => {
    const html = page("<p>no components</p>");
    const result = syncComponentInPage(html, "footer", "<footer>new</footer>");

    expect(result).toEqual({ html, updated: false });
  });

  test("ignores instances tagged with a different component name", () => {
    const html = page('<header data-capuz-component="header">keep</header>');
    const result = syncComponentInPage(html, "footer", "<footer>new</footer>");

    expect(result.updated).toBe(false);
    expect(result.html).toContain("keep");
  });

  test("output stays stable when synced twice", () => {
    const html = page(tagComponentHtml("footer", "<footer>v1</footer>"));
    const once = syncComponentInPage(html, "footer", "<footer>v2</footer>");
    const twice = syncComponentInPage(once.html, "footer", "<footer>v2</footer>");

    expect(twice.html).toBe(once.html);
  });
});

describe("syncComponent over a storage backend", () => {
  function fakeStorage({ pages, drafts = {}, components }) {
    const written = {};
    return {
      written,
      listPages: async () => Object.keys(pages),
      listComponents: async () => Object.keys(components),
      readComponent: async (name) => components[name],
      hasDraft: async (path) => path in drafts,
      readDraft: async (path) => drafts[path],
      readPage: async (path) => pages[path],
      writeDraft: async (path, html) => {
        written[path] = html;
        return path;
      },
    };
  }

  test("writes a draft for each page carrying the component", async () => {
    const storage = fakeStorage({
      pages: {
        "index.html": page('<footer data-capuz-component="footer">old</footer>'),
        "about.html": page("<p>nothing to sync</p>"),
      },
      components: { footer: "<footer>new</footer>" },
    });

    const result = await syncComponent(storage, "footer");

    expect(result.component).toBe("footer");
    expect(result.touchedCount).toBe(1);
    expect(result.touched[0].path).toBe("index.html");
    expect(result.touched[0].previewUrl).toContain("/");
    expect(Object.keys(storage.written)).toEqual(["index.html"]);
    expect(storage.written["index.html"]).toContain("new");
  });

  test("syncs against an existing draft rather than the live page", async () => {
    const storage = fakeStorage({
      pages: { "index.html": page('<footer data-capuz-component="footer">live</footer>') },
      drafts: {
        "index.html": page(
          '<footer data-capuz-component="footer">draft</footer><p>draft-only copy</p>',
        ),
      },
      components: { footer: "<footer>new</footer>" },
    });

    await syncComponent(storage, "footer");

    expect(storage.written["index.html"]).toContain("draft-only copy");
    expect(storage.written["index.html"]).toContain("new");
  });
});
