import { normalizeAssetPath } from "./paths.js";

export async function listAssets(storage, prefix = "") {
  if (typeof storage.listAssets !== "function") {
    throw new Error("Asset listing is not supported by this storage backend");
  }
  return storage.listAssets(prefix);
}

export async function uploadAsset(storage, path, contentBase64) {
  if (typeof storage.writeAsset !== "function") {
    throw new Error("Asset upload is not supported by this storage backend");
  }
  const normalized = normalizeAssetPath(path);
  const buffer = Buffer.from(contentBase64, "base64");
  await storage.writeAsset(normalized, buffer);
  return { path: normalized, size: buffer.length };
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
