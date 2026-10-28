import { describe, expect, test } from "bun:test";
import {
  assetsListPayload,
  buildPageHeadFromAssets,
} from "../src/assets.js";

const SEED_LIKE_ASSETS = [
  "assets/css/daisyui@5.css",
  "assets/css/daisyui@5.css.br",
  "assets/css/daisyui@5.6901be23.css",
  "assets/css/daisyui@5.6901be23.css.br",
  "assets/css/themes.css",
  "assets/css/themes.css.br",
  "assets/css/themes.e319f593.css",
  "assets/css/themes.e319f593.css.br",
  "assets/favicon.ico",
  "assets/favicon.a659cc08.ico",
  "assets/favicon.a659cc08.ico.br",
  "assets/js/browser@4.js",
  "assets/js/browser@4.js.br",
  "assets/js/browser@4.6d8c473e.js",
  "assets/js/browser@4.6d8c473e.js.br",
  "assets/images/hero.png",
  "assets/fonts/site.woff2",
];

describe("buildPageHeadFromAssets", () => {
  test("empty input yields empty head", () => {
    expect(buildPageHeadFromAssets([])).toEqual({ pageHead: [], pageHeadHtml: "" });
    expect(buildPageHeadFromAssets()).toEqual({ pageHead: [], pageHeadHtml: "" });
  });

  test("ignores images, fonts, and .br siblings", () => {
    const { pageHead } = buildPageHeadFromAssets(SEED_LIKE_ASSETS);
    const hrefs = pageHead.map((entry) => entry.href || entry.src);
    expect(hrefs.every((href) => !href.endsWith(".br"))).toBe(true);
    expect(hrefs.some((href) => href.includes("hero.png"))).toBe(false);
    expect(hrefs.some((href) => href.includes(".woff2"))).toBe(false);
  });

  test("prefers hashed filenames over unhashed duplicates", () => {
    const { pageHead } = buildPageHeadFromAssets(SEED_LIKE_ASSETS);
    expect(pageHead).toEqual([
      {
        tag: "link",
        rel: "icon",
        href: "/assets/favicon.a659cc08.ico",
        type: "image/x-icon",
      },
      {
        tag: "link",
        rel: "stylesheet",
        href: "/assets/css/daisyui@5.6901be23.css",
      },
      { tag: "script", src: "/assets/js/browser@4.6d8c473e.js" },
      {
        tag: "link",
        rel: "stylesheet",
        href: "/assets/css/themes.e319f593.css",
      },
    ]);
  });

  test("orders favicon, daisyUI, browser script, then themes", () => {
    const shuffled = [
      "assets/css/themes.e319f593.css",
      "assets/js/browser@4.6d8c473e.js",
      "assets/favicon.a659cc08.ico",
      "assets/css/daisyui@5.6901be23.css",
    ];
    const { pageHead } = buildPageHeadFromAssets(shuffled);
    expect(pageHead.map((entry) => entry.href || entry.src)).toEqual([
      "/assets/favicon.a659cc08.ico",
      "/assets/css/daisyui@5.6901be23.css",
      "/assets/js/browser@4.6d8c473e.js",
      "/assets/css/themes.e319f593.css",
    ]);
  });

  test("pageHeadHtml is paste-ready markup", () => {
    const { pageHeadHtml } = buildPageHeadFromAssets([
      "assets/favicon.a659cc08.ico",
      "assets/css/daisyui@5.6901be23.css",
      "assets/js/browser@4.6d8c473e.js",
    ]);
    expect(pageHeadHtml).toBe(
      [
        '<link rel="icon" href="/assets/favicon.a659cc08.ico" type="image/x-icon" />',
        '<link rel="stylesheet" href="/assets/css/daisyui@5.6901be23.css" />',
        '<script src="/assets/js/browser@4.6d8c473e.js"></script>',
      ].join("\n"),
    );
  });

  test("assetsListPayload keeps full asset list and adds head hints", () => {
    const payload = assetsListPayload(SEED_LIKE_ASSETS);
    expect(payload.assets).toEqual(SEED_LIKE_ASSETS);
    expect(payload.pageHead).toHaveLength(4);
    expect(payload.pageHeadHtml).toContain('rel="stylesheet"');
  });
});
