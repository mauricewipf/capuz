import { normalize } from "node:path";
import { PathError } from "./paths.js";

const PAGE_EXTENSIONS = [".html", ".xml"];

function hasPageExtension(path) {
  const lower = path.toLowerCase();
  return PAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function normalizeUriPath(uriPath) {
  const cleaned = decodeURIComponent(uriPath.split("?")[0])
    .replace(/^\/+/, "")
    .trim();

  if (cleaned.includes("\0")) {
    throw new PathError("Invalid path", 400);
  }

  if (!cleaned) {
    return "";
  }

  const normalized = normalize(cleaned).split(/[/\\]/).join("/");
  if (normalized.startsWith("..") || normalized.includes("../")) {
    throw new PathError("Path traversal not allowed", 400);
  }

  return normalized;
}

/**
 * Candidate page paths in nginx try_files order:
 * $uri $uri/index.html $uri.html
 */
export function previewPageCandidates(uriPath) {
  const normalized = normalizeUriPath(uriPath);

  if (!normalized) {
    return ["index.html"];
  }

  if (hasPageExtension(normalized)) {
    return [normalized];
  }

  if (normalized.endsWith("/")) {
    return [`${normalized}index.html`];
  }

  return [`${normalized}/index.html`, `${normalized}.html`];
}

export function isPageRequest(uriPath) {
  const cleaned = uriPath.replace(/^\/+/, "").trim();
  if (!cleaned) return true;
  const lower = cleaned.toLowerCase();
  if (PAGE_EXTENSIONS.some((ext) => lower.endsWith(ext))) return true;
  if (lower.endsWith("/")) return true;
  if (!lower.includes(".")) return true;
  return false;
}
