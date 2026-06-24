import { createTwoFilesPatch } from "diff";
import { buildPreviewUrl, PathError } from "./paths.js";
import { searchHtmlLines } from "./html.js";

export async function readDraftOrPage(storage, path) {
  if (await storage.hasDraft(path)) {
    return { html: await storage.readDraft(path), source: "draft" };
  }
  return { html: await storage.readPage(path), source: "published" };
}

export async function editPage(storage, path, find, replace, replaceAll = false) {
  const { html } = await readDraftOrPage(storage, path);
  if (!html.includes(find)) {
    throw new PathError(`Find string not found in ${path}`, 404);
  }

  const updated = replaceAll
    ? html.split(find).join(replace)
    : html.replace(find, replace);
  const saved = await storage.writeDraft(path, updated);
  return { path: saved, previewUrl: buildPreviewUrl(saved), replacements: replaceAll ? "all" : 1 };
}

export async function copyPage(storage, from, to) {
  const normalizedTo = to;
  const { html } = await readDraftOrPage(storage, from);
  const saved = await storage.writeDraft(normalizedTo, html);
  return { from, path: saved, previewUrl: buildPreviewUrl(saved) };
}

export async function movePage(storage, from, to) {
  const { html } = await readDraftOrPage(storage, from);
  await storage.writeDraft(to, html);
  try {
    await storage.deletePage(from);
  } catch (error) {
    if (!(error instanceof PathError && error.status === 404)) throw error;
  }
  try {
    await storage.discardDraft(from);
  } catch (error) {
    if (!(error instanceof PathError && error.status === 404)) throw error;
  }
  return { from, to, previewUrl: buildPreviewUrl(to) };
}

export async function renamePage(storage, from, to) {
  return movePage(storage, from, to);
}

export async function searchPages(storage, query, maxResults = 20) {
  const pages = await storage.listPages();
  const results = [];
  for (const path of pages) {
    if (results.length >= maxResults) break;
    let html;
    try {
      html = await storage.readPage(path);
    } catch {
      continue;
    }
    const matches = searchHtmlLines(html, query, path);
    for (const match of matches) {
      results.push(match);
      if (results.length >= maxResults) break;
    }
  }
  return { query, count: results.length, results };
}

export async function diffPage(storage, path) {
  let published;
  try {
    published = await storage.readPage(path);
  } catch (error) {
    if (error instanceof PathError && error.status === 404) {
      published = "";
    } else {
      throw error;
    }
  }

  let draft;
  try {
    draft = await storage.readDraft(path);
  } catch (error) {
    if (error instanceof PathError && error.status === 404) {
      throw new PathError("No draft found to diff", 404);
    }
    throw error;
  }

  const patch = createTwoFilesPatch(
    `${path} (published)`,
    `${path} (draft)`,
    published,
    draft,
    "",
    "",
    { context: 3 },
  );

  return { path, hasChanges: patch.includes("@@"), diff: patch };
}
