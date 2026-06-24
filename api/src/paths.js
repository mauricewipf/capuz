import { normalize, relative, resolve } from "node:path";

const DATA_ROOT = resolve(process.env.DATA_ROOT || "/app/data");
const DRAFTS_DIR = (process.env.DRAFTS_DIR || ".drafts").replace(/^\/+|\/+$/g, "");
const COMPONENTS_DIR = (process.env.COMPONENTS_DIR || ".components").replace(
  /^\/+|\/+$/g,
  "",
);
const ALLOWED_PAGE_EXTENSIONS = new Set([".html", ".xml"]);
const ALLOWED_ASSET_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".webp",
  ".ico",
  ".css",
  ".js",
  ".woff",
  ".woff2",
  ".json",
]);

export function getDataRoot() {
  return DATA_ROOT;
}

export function getDraftsDirName() {
  return DRAFTS_DIR;
}

export function getComponentsDirName() {
  return COMPONENTS_DIR;
}

export function getDraftsRoot() {
  return resolve(DATA_ROOT, DRAFTS_DIR);
}

export function getComponentsRoot() {
  return resolve(DATA_ROOT, COMPONENTS_DIR);
}

export function isHiddenStorageSegment(name) {
  return name.startsWith(".");
}

export function isSkippedStorageSegment(name) {
  return isHiddenStorageSegment(name) || name === COMPONENTS_DIR;
}

export function isReservedStoragePath(relativePath) {
  const cleaned = relativePath.replace(/^\/+/, "").trim();
  if (!cleaned) return false;
  const normalized = normalize(cleaned).split(sep()).join("/");
  return (
    normalized === DRAFTS_DIR ||
    normalized.startsWith(`${DRAFTS_DIR}/`) ||
    normalized === COMPONENTS_DIR ||
    normalized.startsWith(`${COMPONENTS_DIR}/`)
  );
}

export function getPreviewHost() {
  return (process.env.PREVIEW_HOST || "preview.localhost").trim().toLowerCase();
}

export function getPreviewBaseUrl() {
  return (process.env.PREVIEW_BASE_URL || "http://preview.localhost:8081").replace(
    /\/+$/,
    "",
  );
}

export function isPreviewHost(hostHeader) {
  const host = (hostHeader || "").split(":")[0].trim().toLowerCase();
  return host === getPreviewHost();
}

export function buildPreviewUrl(pagePath) {
  const normalized = normalizePagePath(pagePath);
  const base = getPreviewBaseUrl();
  if (normalized === "index.html") {
    return `${base}/`;
  }
  if (normalized.endsWith("/index.html")) {
    const dir = normalized.slice(0, -"/index.html".length);
    return `${base}/${dir}`;
  }
  if (normalized.endsWith(".html")) {
    return `${base}/${normalized.slice(0, -".html".length)}`;
  }
  return `${base}/${normalized}`;
}

export function normalizePagePath(relativePath) {
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
  if (!ALLOWED_PAGE_EXTENSIONS.has(ext)) {
    throw new PathError("Only .html and .xml files are allowed", 400);
  }

  return normalized.split(sep()).join("/");
}

export function normalizeComponentName(name) {
  const cleaned = name.replace(/^\/+/, "").trim().replace(/\.html$/i, "");
  if (!cleaned) {
    throw new PathError("Component name is required", 400);
  }
  if (cleaned.includes("\0") || cleaned.includes("..")) {
    throw new PathError("Invalid component name", 400);
  }
  const normalized = normalize(cleaned).split(sep()).join("/");
  if (normalized.startsWith("..") || normalized.includes("../")) {
    throw new PathError("Path traversal not allowed", 400);
  }
  return normalized;
}

export function componentPathFromName(name) {
  return `${normalizeComponentName(name)}.html`;
}

export function resolvePagePath(relativePath) {
  const normalized = normalizePagePath(relativePath);
  const absolute = resolve(DATA_ROOT, normalized);
  const rel = relative(DATA_ROOT, absolute);
  if (rel.startsWith("..") || rel.includes(`..${sep()}`)) {
    throw new PathError("Path outside data root", 400);
  }

  return absolute;
}

export function toPublicPath(absolutePath) {
  return relative(DATA_ROOT, absolutePath).split(sep()).join("/");
}

export function resolveDraftPath(relativePath) {
  const normalized = normalizePagePath(relativePath);
  const absolute = resolve(getDraftsRoot(), normalized);
  const rel = relative(getDraftsRoot(), absolute);
  if (rel.startsWith("..") || rel.includes(`..${sep()}`)) {
    throw new PathError("Path outside drafts root", 400);
  }
  return absolute;
}

export function resolveComponentPath(name) {
  const relativePath = componentPathFromName(name);
  const absolute = resolve(getComponentsRoot(), relativePath);
  const rel = relative(getComponentsRoot(), absolute);
  if (rel.startsWith("..") || rel.includes(`..${sep()}`)) {
    throw new PathError("Path outside components root", 400);
  }
  return absolute;
}

export function normalizeAssetPath(relativePath) {
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

  const lower = normalized.toLowerCase();
  const ext = extname(lower);
  if (ALLOWED_PAGE_EXTENSIONS.has(ext)) {
    throw new PathError("Use page routes for HTML and XML files", 400);
  }
  if (!ALLOWED_ASSET_EXTENSIONS.has(ext)) {
    throw new PathError(
      `Asset extension not allowed. Supported: ${[...ALLOWED_ASSET_EXTENSIONS].join(", ")}`,
      400,
    );
  }

  return normalized.split(sep()).join("/");
}

export function resolveAssetPath(relativePath) {
  const normalized = normalizeAssetPath(relativePath);
  const absolute = resolve(DATA_ROOT, normalized);
  const rel = relative(DATA_ROOT, absolute);
  if (rel.startsWith("..") || rel.includes(`..${sep()}`)) {
    throw new PathError("Path outside data root", 400);
  }
  if (isReservedStoragePath(rel)) {
    throw new PathError("Path not allowed", 400);
  }
  return absolute;
}

export class PathError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "PathError";
    this.status = status;
  }
}

function sep() {
  return process.platform === "win32" ? "\\" : "/";
}

function extname(filePath) {
  const idx = filePath.lastIndexOf(".");
  return idx === -1 ? "" : filePath.slice(idx);
}
