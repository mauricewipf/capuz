import { basename } from "node:path";
import { normalizeAssetPath, PathError } from "./paths.js";
import { readChatFileBytes } from "./openwebui-files.js";

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

const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".webp",
  ".ico",
]);

const MIME_TO_EXT = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
  "image/webp": ".webp",
  "image/x-icon": ".ico",
  "image/vnd.microsoft.icon": ".ico",
  "text/css": ".css",
  "application/javascript": ".js",
  "text/javascript": ".js",
  "application/json": ".json",
  "font/woff": ".woff",
  "font/woff2": ".woff2",
  "application/font-woff": ".woff",
  "application/font-woff2": ".woff2",
};

function sanitizeFilename(name) {
  const base = basename(String(name))
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!base || base === "." || base === "..") {
    return "upload";
  }
  return base;
}

function extname(filePath) {
  const idx = filePath.lastIndexOf(".");
  return idx === -1 ? "" : filePath.slice(idx).toLowerCase();
}

function stemname(filePath) {
  const base = sanitizeFilename(filePath);
  const ext = extname(base);
  if (!ext) return base;
  const stem = base.slice(0, -ext.length);
  return stem || "upload";
}

function extensionFromContentType(contentType) {
  if (!contentType) return "";
  const mime = String(contentType).split(";")[0].trim().toLowerCase();
  return MIME_TO_EXT[mime] || "";
}

function firstAllowedExtension(...candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const ext = extname(String(candidate));
    if (ALLOWED_ASSET_EXTENSIONS.has(ext)) {
      return ext;
    }
  }
  return "";
}

/**
 * Build a destination filename that always includes an allowed extension.
 * Prefers display/original names that already have an extension; otherwise
 * keeps their stem and attaches an extension from the on-disk Open WebUI
 * upload path or Content-Type.
 */
export function resolveImportFilename({
  filename,
  rowFilename,
  diskPath,
  contentType,
} = {}) {
  const displayCandidates = [filename, rowFilename]
    .filter((value) => value != null && String(value).trim() !== "")
    .map((value) => sanitizeFilename(value));

  for (const candidate of displayCandidates) {
    if (ALLOWED_ASSET_EXTENSIONS.has(extname(candidate))) {
      return candidate;
    }
  }

  const diskBase = diskPath ? sanitizeFilename(basename(diskPath)) : "";
  const ext =
    firstAllowedExtension(diskBase) || extensionFromContentType(contentType);

  if (!ext) {
    throw new PathError(
      "Could not determine asset file extension from filename, disk path, or content type",
      400,
    );
  }

  if (diskBase && ALLOWED_ASSET_EXTENSIONS.has(extname(diskBase)) && !displayCandidates.length) {
    return diskBase;
  }

  const stem = stemname(displayCandidates[0] || diskBase || "upload");
  return `${stem}${ext}`;
}

function defaultAssetPath(safeFilename) {
  const ext = extname(safeFilename);
  if (IMAGE_EXTENSIONS.has(ext)) {
    return `assets/images/${safeFilename}`;
  }
  return `assets/uploads/${safeFilename}`;
}

function ensureAssetPathExtension(path, ext) {
  const existingExt = extname(path);
  if (ALLOWED_ASSET_EXTENSIONS.has(existingExt)) {
    return path;
  }
  if (!ext) {
    throw new PathError(
      "Asset path must include a file extension (e.g. assets/images/hero.jpg)",
      400,
    );
  }
  // If the path ends with an unknown/disallowed "extension", replace it rather
  // than appending (e.g. assets/images/hero.bmp + .jpg → hero.jpg).
  if (existingExt) {
    return `${path.slice(0, -existingExt.length)}${ext}`;
  }
  return `${path}${ext}`;
}

async function assetExists(storage, path) {
  if (typeof storage.hasAsset === "function") {
    try {
      const normalized = normalizeAssetPath(path);
      return await storage.hasAsset(normalized);
    } catch {
      return false;
    }
  }
  try {
    await readAssetInfo(storage, path);
    return true;
  } catch {
    return false;
  }
}

async function resolveImportTargetPath(storage, targetPath, source) {
  const safeFilename = resolveImportFilename(source);
  const inferredExt = extname(safeFilename);

  let path;
  if (targetPath) {
    const cleaned = String(targetPath).replace(/^\/+/, "").trim();
    path = ensureAssetPathExtension(cleaned, inferredExt);
    path = normalizeAssetPath(path);
  } else {
    path = normalizeAssetPath(defaultAssetPath(safeFilename));
  }

  if (!(await assetExists(storage, path))) {
    return path;
  }

  const dot = path.lastIndexOf(".");
  const stem = dot > 0 ? path.slice(0, dot) : path;
  const ext = dot > 0 ? path.slice(dot) : "";
  for (let index = 2; index < 100; index += 1) {
    const candidate = `${stem}-${index}${ext}`;
    if (!(await assetExists(storage, candidate))) {
      return candidate;
    }
  }

  return path;
}

function publicAssetUrl(path) {
  return `/${String(path).replace(/^\/+/, "")}`;
}

const HEAD_ASSET_EXTENSIONS = new Set([".css", ".js", ".ico"]);
const CONTENT_HASH_RE = /\.[a-f0-9]{8}(?=\.[^.]+$)/i;

function isHeadAssetPath(path) {
  const cleaned = String(path).replace(/^\/+/, "");
  if (!cleaned.startsWith("assets/")) return false;
  if (cleaned.endsWith(".br")) return false;
  return HEAD_ASSET_EXTENSIONS.has(extname(cleaned));
}

function logicalAssetKey(path) {
  const cleaned = String(path).replace(/^\/+/, "");
  const slash = cleaned.lastIndexOf("/");
  const dir = slash === -1 ? "" : cleaned.slice(0, slash + 1);
  const base = slash === -1 ? cleaned : cleaned.slice(slash + 1);
  return `${dir}${base.replace(CONTENT_HASH_RE, "")}`.toLowerCase();
}

function hasContentHash(path) {
  const cleaned = String(path).replace(/^\/+/, "");
  const slash = cleaned.lastIndexOf("/");
  const base = slash === -1 ? cleaned : cleaned.slice(slash + 1);
  return CONTENT_HASH_RE.test(base);
}

function headSortKey(path) {
  const cleaned = String(path).replace(/^\/+/, "").toLowerCase();
  const base = basename(cleaned);
  const ext = extname(cleaned);
  if (ext === ".ico") return [0, cleaned];
  if (ext === ".css" && base.includes("daisyui")) return [1, cleaned];
  if (ext === ".js" && base.includes("browser")) return [2, cleaned];
  if (ext === ".css" && base.includes("theme")) return [3, cleaned];
  if (ext === ".css") return [4, cleaned];
  if (ext === ".js") return [5, cleaned];
  return [6, cleaned];
}

function compareHeadAssets(a, b) {
  const [rankA, keyA] = headSortKey(a);
  const [rankB, keyB] = headSortKey(b);
  if (rankA !== rankB) return rankA - rankB;
  return keyA.localeCompare(keyB);
}

function pageHeadEntryForPath(path) {
  const href = publicAssetUrl(path);
  const ext = extname(path);
  if (ext === ".ico") {
    return { tag: "link", rel: "icon", href, type: "image/x-icon" };
  }
  if (ext === ".css") {
    return { tag: "link", rel: "stylesheet", href };
  }
  return { tag: "script", src: href };
}

function pageHeadEntryToHtml(entry) {
  if (entry.tag === "script") {
    return `<script src="${entry.src}"></script>`;
  }
  const typeAttr = entry.type ? ` type="${entry.type}"` : "";
  return `<link rel="${entry.rel}" href="${entry.href}"${typeAttr} />`;
}

/**
 * Pick favicon/CSS/JS head tags from a list_assets path list.
 * Deduplicates logical names (stripping 8-hex content hashes) and prefers hashed filenames.
 */
export function buildPageHeadFromAssets(paths = []) {
  const bestByKey = new Map();
  for (const path of paths) {
    if (!isHeadAssetPath(path)) continue;
    const cleaned = String(path).replace(/^\/+/, "");
    const key = logicalAssetKey(cleaned);
    const existing = bestByKey.get(key);
    if (!existing) {
      bestByKey.set(key, cleaned);
      continue;
    }
    const preferNew =
      (hasContentHash(cleaned) && !hasContentHash(existing)) ||
      (hasContentHash(cleaned) === hasContentHash(existing) &&
        cleaned.length > existing.length);
    if (preferNew) {
      bestByKey.set(key, cleaned);
    }
  }

  const selected = [...bestByKey.values()].sort(compareHeadAssets);
  const pageHead = selected.map(pageHeadEntryForPath);
  const pageHeadHtml = pageHead.map(pageHeadEntryToHtml).join("\n");
  return { pageHead, pageHeadHtml };
}

export function assetsListPayload(assets) {
  const { pageHead, pageHeadHtml } = buildPageHeadFromAssets(assets);
  return { assets, pageHead, pageHeadHtml };
}

export async function listAssets(storage, prefix = "") {
  if (typeof storage.listAssets !== "function") {
    throw new Error("Asset listing is not supported by this storage backend");
  }
  return storage.listAssets(prefix);
}

export async function uploadAssetBuffer(storage, path, buffer) {
  if (typeof storage.writeAsset !== "function") {
    throw new Error("Asset upload is not supported by this storage backend");
  }
  const normalized = normalizeAssetPath(path);
  const body = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  await storage.writeAsset(normalized, body);
  return { path: normalized, url: publicAssetUrl(normalized), size: body.length };
}

export async function uploadAsset(storage, path, contentBase64) {
  const buffer = Buffer.from(contentBase64, "base64");
  return uploadAssetBuffer(storage, path, buffer);
}

export async function importChatFile(storage, { fileId, fileName, targetPath } = {}) {
  const source = readChatFileBytes({ fileId, fileName });
  const path = await resolveImportTargetPath(storage, targetPath, {
    filename: source.filename,
    rowFilename: source.rowFilename,
    diskPath: source.diskPath,
    contentType: source.contentType,
  });
  const result = await uploadAssetBuffer(storage, path, source.buffer);
  return {
    ...result,
    sourceFileId: source.fileId,
    sourceFileName: source.filename,
  };
}

export async function readAssetInfo(storage, path) {
  const normalized = normalizeAssetPath(path);
  const buffer = await storage.readAsset(normalized);
  const body = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  return {
    path: normalized,
    url: publicAssetUrl(normalized),
    size: body.length,
    contentBase64: body.toString("base64"),
  };
}

export async function deleteAsset(storage, path) {
  if (typeof storage.deleteAsset !== "function") {
    throw new Error("Asset deletion is not supported by this storage backend");
  }
  const normalized = normalizeAssetPath(path);
  await storage.deleteAsset(normalized);
  return { path: normalized, url: publicAssetUrl(normalized) };
}
