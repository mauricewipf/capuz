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
