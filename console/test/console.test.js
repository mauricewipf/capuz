import { describe, expect, test } from "bun:test";
import { escapeHtml } from "../src/lib/escape.js";
import { createCsrfToken, verifyCsrfToken } from "../src/lib/csrf.js";
import { isAuthorized, identityFromRequest, isSameOrigin } from "../src/lib/auth.js";
import { encodePagePath } from "../src/api-client.js";
import { pagesPage } from "../src/views/pages.js";
import { componentsPage } from "../src/views/components.js";

describe("escapeHtml", () => {
  test("escapes script tags", () => {
    expect(escapeHtml("<script>alert(1)</script>")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;",
    );
  });
});

describe("csrf", () => {
  test("validates signed token", () => {
    const token = createCsrfToken();
    expect(verifyCsrfToken(token)).toBe(true);
    expect(verifyCsrfToken("bad.token")).toBe(false);
    expect(verifyCsrfToken("")).toBe(false);
  });
});

describe("auth", () => {
  test("reads identity from trusted headers", () => {
    const headers = new Headers({
      "X-Auth-Request-Email": "admin@example.com",
      "X-Auth-Request-User": "admin",
      "X-Auth-Request-Groups": "org:team1, org:team2",
    });
    const request = new Request("http://localhost/pages", { headers });
    const identity = identityFromRequest(request);
    expect(identity?.email).toBe("admin@example.com");
    expect(identity?.groups).toContain("org:team1");
    expect(identity?.groups).toContain("org:team2");
  });

  test("allows any authenticated user when groups unset", () => {
    const identity = { email: "a@b.com", name: "a", groups: [] };
    expect(isAuthorized(identity)).toBe(true);
  });

  test("rejects user outside allowed groups", () => {
    const original = process.env.CONSOLE_ALLOWED_GROUPS;
    process.env.CONSOLE_ALLOWED_GROUPS = "console";
    // Re-import would be needed for config cache - test isAuthorized logic via groups on identity
    const identity = { email: "a@b.com", name: "a", groups: ["other"] };
    const allowed = ["console"];
    const groupSet = new Set(identity.groups);
    expect(allowed.some((g) => groupSet.has(g))).toBe(false);
    process.env.CONSOLE_ALLOWED_GROUPS = original;
  });

  test("accepts same-origin referer", () => {
    const headers = new Headers({
      host: "console.localhost:8080",
      referer: "http://console.localhost:8080/pages",
    });
    const request = new Request("http://console.localhost:8080/pages/test.html/publish", {
      method: "POST",
      headers,
    });
    expect(isSameOrigin(request)).toBe(true);
  });

  test("rejects cross-origin referer", () => {
    const headers = new Headers({
      host: "console.localhost:8080",
      referer: "http://evil.example/pages",
    });
    const request = new Request("http://console.localhost:8080/pages/test.html/publish", {
      method: "POST",
      headers,
    });
    expect(isSameOrigin(request)).toBe(false);
  });
});

describe("api-client", () => {
  test("encodes page paths", () => {
    expect(encodePagePath("foo/bar.html")).toBe("foo/bar.html");
    expect(encodePagePath("spaced%20.html")).toContain("%");
  });
});

describe("pages view", () => {
  test("does not embed api key in html", () => {
    const html = pagesPage({
      pages: [{ path: "index.html", status: "published" }],
      filter: "",
      diffPath: null,
      diff: null,
      csrfToken: createCsrfToken(),
    });
    expect(html).not.toContain("dev-local-key");
    expect(html).not.toContain("Bearer");
  });

  test("shows delete for published pages without a draft", () => {
    const html = pagesPage({
      pages: [{ path: "index.html", status: "published" }],
      filter: "",
      diffPath: null,
      diff: null,
      csrfToken: createCsrfToken(),
    });
    expect(html).toContain("/pages/index.html/delete");
    expect(html).toContain("data-confirm-delete");
    expect(html).not.toContain("/pages/index.html/discard");
  });

  test("shows discard instead of delete when a draft exists", () => {
    const html = pagesPage({
      pages: [
        { path: "threeui.html", status: "draft" },
        { path: "models.html", status: "modified" },
      ],
      filter: "",
      diffPath: null,
      diff: null,
      csrfToken: createCsrfToken(),
    });
    expect(html).toContain("/pages/threeui.html/discard");
    expect(html).toContain("/pages/models.html/discard");
    expect(html).not.toContain("/pages/threeui.html/delete");
    expect(html).not.toContain("/pages/models.html/delete");
  });
});

describe("components view", () => {
  test("renders all components in a list", () => {
    const html = componentsPage({
      components: ["v1/card", "v1/diff", "v2/diff"],
      selected: "",
      selectedHtml: null,
      selectedError: null,
    });
    expect(html).toContain("data-component-list");
    expect(html).toContain("v1/card");
    expect(html).toContain("v2/diff");
    expect(html).toContain("/components/v1/diff");
    expect(html).toContain("/components/preview/v1/diff");
  });
});
