import { readdir, readFile, writeFile, unlink, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import {
  getDataRoot,
  PathError,
  resolvePagePath,
  toPublicPath,
} from "../paths.js";

const ALLOWED_EXTENSIONS = [".html", ".xml"];

function isEnoent(err) {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    err.code === "ENOENT"
  );
}

async function walk(dir, pages) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = `${dir}/${entry.name}`;
    if (entry.isDirectory()) {
      await walk(fullPath, pages);
      continue;
    }
    const lower = entry.name.toLowerCase();
    if (ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
      pages.push(toPublicPath(fullPath));
    }
  }
}

export class FsStorage {
  async listPages() {
    const pages = [];
    await walk(getDataRoot(), pages);
    pages.sort();
    return pages;
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

  async writePage(relativePath, html) {
    const absolute = resolvePagePath(relativePath);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, html, "utf8");
    return toPublicPath(absolute);
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
}
