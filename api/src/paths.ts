import { normalize, relative, resolve } from "node:path";

const DATA_ROOT = resolve(process.env.DATA_ROOT || "/app/data");
const ALLOWED_EXTENSIONS = new Set([".html", ".xml"]);

export function getDataRoot(): string {
  return DATA_ROOT;
}

export function resolvePagePath(relativePath: string): string {
  const cleaned = relativePath.replace(/^\/+/, "").trim();
  if (!cleaned) {
    throw new PathError("Path is required", 400);
  }
  if (cleaned.includes("\0")) {
    throw new PathError("Invalid path", 400);
  }

  const normalized = normalize(cleaned);
  if (normalized.startsWith("..") || normalized.includes(`..${sep()}`)) {
    throw new PathError("Path traversal not allowed", 400);
  }

  const ext = extname(normalized).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new PathError("Only .html and .xml files are allowed", 400);
  }

  const absolute = resolve(DATA_ROOT, normalized);
  const rel = relative(DATA_ROOT, absolute);
  if (rel.startsWith("..") || rel.includes(`..${sep()}`)) {
    throw new PathError("Path outside data root", 400);
  }

  return absolute;
}

export function toPublicPath(absolutePath: string): string {
  return relative(DATA_ROOT, absolutePath).split(sep()).join("/");
}

export class PathError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "PathError";
  }
}

function sep(): string {
  return process.platform === "win32" ? "\\" : "/";
}

function extname(filePath: string): string {
  const idx = filePath.lastIndexOf(".");
  return idx === -1 ? "" : filePath.slice(idx);
}
