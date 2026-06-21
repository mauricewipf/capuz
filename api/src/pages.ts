import { readdir, readFile, writeFile, unlink, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import {
  getDataRoot,
  PathError,
  resolvePagePath,
  toPublicPath,
} from "./paths.ts";

const ALLOWED_EXTENSIONS = [".html", ".xml"];

export async function listPages(): Promise<string[]> {
  const pages: string[] = [];
  await walk(getDataRoot(), pages);
  pages.sort();
  return pages;
}

async function walk(dir: string, pages: string[]): Promise<void> {
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

export async function readPage(relativePath: string): Promise<string> {
  const absolute = resolvePagePath(relativePath);
  try {
    return await readFile(absolute, "utf8");
  } catch (err: unknown) {
    if (isEnoent(err)) {
      throw new PathError("Page not found", 404);
    }
    throw err;
  }
}

export async function writePage(
  relativePath: string,
  html: string,
): Promise<string> {
  const absolute = resolvePagePath(relativePath);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, html, "utf8");
  return toPublicPath(absolute);
}

export async function deletePage(relativePath: string): Promise<void> {
  const absolute = resolvePagePath(relativePath);
  try {
    await unlink(absolute);
  } catch (err: unknown) {
    if (isEnoent(err)) {
      throw new PathError("Page not found", 404);
    }
    throw err;
  }
}

function isEnoent(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as NodeJS.ErrnoException).code === "ENOENT"
  );
}

export function handlePathError(error: unknown): { message: string; status: number } {
  if (error instanceof PathError) {
    return { message: error.message, status: error.status };
  }
  throw error;
}
