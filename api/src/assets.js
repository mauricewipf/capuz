import { basename } from "node:path";
import { normalizeAssetPath } from "./paths.js";
import { readChatFileBytes } from "./openwebui-files.js";

function sanitizeFilename(name) {
  const base = basename(String(name))
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!base || base === "." || base === "..") {
    return "upload.bin";
  }
  return base;
}

function extname(filePath) {
  const idx = filePath.lastIndexOf(".");
  return idx === -1 ? "" : filePath.slice(idx).toLowerCase();
}

function defaultAssetPath(filename) {
  const safe = sanitizeFilename(filename);
  const ext = extname(safe);
  const imageExtensions = new Set([
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".svg",
    ".webp",
    ".ico",
  ]);
  if (imageExtensions.has(ext)) {
    return `assets/images/${safe}`;
  }
  return `assets/uploads/${safe}`;
}

async function assetExists(storage, path) {
  try {
    await readAssetInfo(storage, path);
    return true;
  } catch {
    return false;
  }
}

async function resolveImportTargetPath(storage, targetPath, filename) {
  let path = targetPath ? normalizeAssetPath(targetPath) : defaultAssetPath(filename);
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
  return { path: normalized, size: body.length };
}

export async function uploadAsset(storage, path, contentBase64) {
  const buffer = Buffer.from(contentBase64, "base64");
  return uploadAssetBuffer(storage, path, buffer);
}

export async function importChatFile(storage, { fileId, fileName, targetPath } = {}) {
  const source = readChatFileBytes({ fileId, fileName });
  const path = await resolveImportTargetPath(storage, targetPath, source.filename);
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
  return { path: normalized };
}
