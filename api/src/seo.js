import { applySeoMeta, auditSeo } from "./html.js";
import { buildPreviewUrl } from "./paths.js";
import { readDraftOrPage } from "./page-ops.js";

export async function auditPageSeo(storage, path) {
  const { html } = await readDraftOrPage(storage, path);
  return auditSeo(html, path);
}

export async function applyPageSeo(storage, path, updates) {
  const { html } = await readDraftOrPage(storage, path);
  const updated = applySeoMeta(html, updates);
  const saved = await storage.writeDraft(path, updated);
  return { path: saved, previewUrl: buildPreviewUrl(saved) };
}

export async function regenerateSitemap(storage) {
  const pages = await storage.listPages();
  const baseUrl = (process.env.SITE_BASE_URL || "https://example.com").replace(/\/+$/, "");
  const urls = pages
    .map((page) => {
      if (page === "index.html") return `${baseUrl}/`;
      if (page.endsWith(".html")) return `${baseUrl}/${page.slice(0, -".html".length)}`;
      return `${baseUrl}/${page}`;
    })
    .sort();

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((loc) => `  <url><loc>${loc}</loc></url>`),
    "</urlset>",
    "",
  ].join("\n");

  const saved = await storage.writeDraft("sitemap.xml", body);
  return { path: saved, urlCount: urls.length, previewUrl: buildPreviewUrl(saved) };
}
