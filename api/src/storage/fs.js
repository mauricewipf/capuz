import { readdir, readFile, writeFile, unlink, mkdir, access } from "node:fs/promises";
import { dirname, relative } from "node:path";
import {
  getComponentsDirName,
  getComponentsRoot,
  getDataRoot,
  getDraftsRoot,
  isSkippedStorageSegment,
  normalizeComponentName,
  normalizePagePath,
  PathError,
  resolveAssetPath,
  resolveComponentPath,
  resolveDraftPath,
  resolvePagePath,
  toPublicPath,
} from "../paths.js";

const ALLOWED_EXTENSIONS = [".html", ".xml"];
const COMPONENTS_SEGMENT = getComponentsDirName();

function isEnoent(err) {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    err.code === "ENOENT"
  );
}

async function walk(dir, pages, root) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (isSkippedStorageSegment(entry.name)) continue;
    const fullPath = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      await walk(fullPath, pages, root);
      continue;
    }
    const lower = entry.name.toLowerCase();
    if (ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
      pages.push(relative(root, fullPath).split(/[/\\]/).join("/"));
    }
  }
}

async function walkAssets(dir, assets, root) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (isSkippedStorageSegment(entry.name)) continue;
    const fullPath = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      await walkAssets(fullPath, assets, root);
      continue;
    }
    assets.push(relative(root, fullPath).split(/[/\\]/).join("/"));
  }
}

async function walkComponents(dir, components, root) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.isDirectory()) {
      await walkComponents(`${dir}/${entry.name}`, components, root);
      continue;
    }
    if (entry.name.toLowerCase().endsWith(".html")) {
      const rel = relative(root, `${dir}/${entry.name}`).split(/[/\\]/).join("/");
      components.push(rel.replace(/\.html$/i, ""));
    }
  }
}

export class FsStorage {
  async listPages() {
    const pages = [];
    await walk(getDataRoot(), pages, getDataRoot());
    pages.sort();
    return pages;
  }

  async listDrafts() {
    const pages = [];
    await walk(getDraftsRoot(), pages, getDraftsRoot());
    pages.sort();
    return pages;
  }

  async listAssets(prefix = "") {
    const assets = [];
    await walkAssets(getDataRoot(), assets, getDataRoot());
    const cleaned = prefix.replace(/^\/+/, "");
    return assets.filter((path) => !cleaned || path.startsWith(cleaned)).sort();
  }

  async listComponents() {
    const components = [];
    await walkComponents(getComponentsRoot(), components, getComponentsRoot());
    components.sort();
    return components;
  }

  async hasDraft(relativePath) {
    const absolute = resolveDraftPath(relativePath);
    try {
      await access(absolute);
      return true;
    } catch (err) {
      if (isEnoent(err)) return false;
      throw err;
    }
  }

  async readPage(relativePath) {
    const absolute = resolvePagePath(relativePath);
    try {
      return await readFile(absolute, "utf8");
    } catch (err) {
      if (isEnoent(err)) {
        throw new PathError("Page not found", 404);
      }
      throw err;
    }
  }

  async readDraft(relativePath) {
    const absolute = resolveDraftPath(relativePath);
    try {
      return await readFile(absolute, "utf8");
    } catch (err) {
      if (isEnoent(err)) {
        throw new PathError("Draft not found", 404);
      }
      throw err;
    }
  }

  async readComponent(name) {
    const absolute = resolveComponentPath(name);
    try {
      return await readFile(absolute, "utf8");
    } catch (err) {
      if (isEnoent(err)) {
        throw new PathError("Component not found", 404);
      }
      throw err;
    }
  }

  async readAsset(relativePath) {
    const absolute = resolveAssetPath(relativePath);
    try {
      return await readFile(absolute);
    } catch (err) {
      if (isEnoent(err)) {
        throw new PathError("Asset not found", 404);
      }
      throw err;
    }
  }

  async writeDraft(relativePath, html) {
    const normalized = normalizePagePath(relativePath);
    const absolute = resolveDraftPath(normalized);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, html, "utf8");
    return normalized;
  }

  async writePage(relativePath, html) {
    const absolute = resolvePagePath(relativePath);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, html, "utf8");
    return toPublicPath(absolute);
  }

  async writeComponent(name, html) {
    const normalized = normalizeComponentName(name);
    const absolute = resolveComponentPath(normalized);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, html, "utf8");
    return normalized;
  }

  async writeAsset(relativePath, buffer) {
    const absolute = resolveAssetPath(relativePath);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, buffer);
    return relativePath;
  }

  async publishDraft(relativePath) {
    const normalized = normalizePagePath(relativePath);
    const html = await this.readDraft(normalized);
    await this.writePage(normalized, html);
    await this.discardDraft(normalized);
    return normalized;
  }

  async discardDraft(relativePath) {
    const absolute = resolveDraftPath(relativePath);
    try {
      await unlink(absolute);
    } catch (err) {
      if (isEnoent(err)) {
        throw new PathError("Draft not found", 404);
      }
      throw err;
    }
  }

  async deletePage(relativePath) {
    const absolute = resolvePagePath(relativePath);
    try {
      await unlink(absolute);
    } catch (err) {
      if (isEnoent(err)) {
        throw new PathError("Page not found", 404);
      }
      throw err;
    }
  }

  async deleteComponent(name) {
    const absolute = resolveComponentPath(name);
    try {
      await unlink(absolute);
    } catch (err) {
      if (isEnoent(err)) {
        throw new PathError("Component not found", 404);
      }
      throw err;
    }
  }

  async deleteAsset(relativePath) {
    const absolute = resolveAssetPath(relativePath);
    try {
      await unlink(absolute);
    } catch (err) {
      if (isEnoent(err)) {
        throw new PathError("Asset not found", 404);
      }
      throw err;
    }
  }
}
