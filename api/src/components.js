import { buildPreviewUrl, componentPathFromName, normalizeComponentName, PathError } from "./paths.js";
import {
  clusterComponentCandidates,
  insertHtmlAtPosition,
  syncComponentInPage,
  tagComponentHtml,
} from "./html.js";

export async function listComponents(storage) {
  if (typeof storage.listComponents !== "function") {
    throw new Error("Components are not supported by this storage backend");
  }
  return storage.listComponents();
}

export async function readComponent(storage, name) {
  const normalized = normalizeComponentName(name);
  const html = await storage.readComponent(normalized);
  return { name: normalized, html };
}

export async function writeComponent(storage, name, html) {
  const normalized = normalizeComponentName(name);
  const saved = await storage.writeComponent(normalized, html);
  return { name: saved, path: componentPathFromName(saved) };
}

export async function deleteComponent(storage, name) {
  const normalized = normalizeComponentName(name);
  await storage.deleteComponent(normalized);
  return { name: normalized };
}

export async function insertComponent(storage, pagePath, componentName, position = "before_body_end") {
  const { html: componentHtml } = await readComponent(storage, componentName);
  const tagged = tagComponentHtml(normalizeComponentName(componentName), componentHtml);
  const { html: pageHtml } = await readDraftOrPublished(storage, pagePath);
  const updated = insertHtmlAtPosition(pageHtml, tagged, position);
  const saved = await storage.writeDraft(pagePath, updated);
  return { path: saved, component: normalizeComponentName(componentName), previewUrl: buildPreviewUrl(saved) };
}

export async function syncComponent(storage, name) {
  const normalized = normalizeComponentName(name);
  const { html: componentHtml } = await readComponent(storage, normalized);
  const pages = await storage.listPages();
  const touched = [];

  for (const path of pages) {
    let html;
    try {
      html = (await storage.hasDraft(path))
        ? await storage.readDraft(path)
        : await storage.readPage(path);
    } catch {
      continue;
    }

    const result = syncComponentInPage(html, normalized, componentHtml);
    if (!result.updated) continue;
    await storage.writeDraft(path, result.html);
    touched.push({ path, previewUrl: buildPreviewUrl(path) });
  }

  return { component: normalized, touchedCount: touched.length, touched };
}

export async function suggestComponents(storage, options = {}) {
  const pages = await storage.listPages();
  const pagesWithHtml = [];
  for (const path of pages) {
    try {
      pagesWithHtml.push({ path, html: await storage.readPage(path) });
    } catch {
      // skip unreadable pages
    }
  }

  const candidates = clusterComponentCandidates(pagesWithHtml, options);
  return {
    scannedPages: pagesWithHtml.length,
    candidateCount: candidates.length,
    candidates,
    note: "Read-only report. Save approved blocks with write_component. Existing pages are not modified.",
  };
}

async function readDraftOrPublished(storage, path) {
  if (await storage.hasDraft(path)) {
    return { html: await storage.readDraft(path), source: "draft" };
  }
  try {
    return { html: await storage.readPage(path), source: "published" };
  } catch (error) {
    if (error instanceof PathError && error.status === 404) {
      throw new PathError(`Page not found: ${path}`, 404);
    }
    throw error;
  }
}
