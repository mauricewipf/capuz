import { normalizeAssetPath, PathError } from "./paths.js";

const MAX_FETCH_BYTES = 25 * 1024 * 1024;

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

function getOpenWebUiConfig() {
  return {
    baseUrl: (process.env.OPENWEBUI_BASE_URL || "").replace(/\/+$/, ""),
    apiKey: (process.env.OPENWEBUI_API_KEY || "").trim(),
  };
}

function openWebUiHeaders(apiKey) {
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

const OPENWEBUI_FILE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function resolveAssetSource(source) {
  const cleaned = (source || "").trim();
  if (!cleaned) {
    throw new PathError("Source url is required", 400);
  }

  const { baseUrl, apiKey } = getOpenWebUiConfig();

  // Bare Open WebUI file id or a relative file URL like /api/v1/files/{id}/content
  if (OPENWEBUI_FILE_ID_PATTERN.test(cleaned) || cleaned.startsWith("/")) {
    if (!baseUrl) {
      throw new PathError(
        "OPENWEBUI_BASE_URL is not configured, so Open WebUI file references cannot be resolved. Pass an absolute http(s) URL instead.",
        400,
      );
    }
    const relative = OPENWEBUI_FILE_ID_PATTERN.test(cleaned)
      ? `/api/v1/files/${cleaned}/content`
      : cleaned;
    return {
      url: `${baseUrl}${relative}`,
      headers: openWebUiHeaders(apiKey),
      isOpenWebUi: true,
    };
  }

  let parsed;
  try {
    parsed = new URL(cleaned);
  } catch {
    throw new PathError("Invalid source url", 400);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new PathError("Only http and https source urls are supported", 400);
  }

  // Absolute URLs pointing at an Open WebUI files endpoint are re-targeted to
  // the configured instance: clients often see Open WebUI under a public host
  // (e.g. http://localhost:8081) that is unreachable from this container.
  const isFilesApiPath = /^\/api\/v1\/files\/[^/]+\/content/.test(parsed.pathname);
  if (baseUrl && isFilesApiPath) {
    return {
      url: `${baseUrl}${parsed.pathname}${parsed.search}`,
      headers: openWebUiHeaders(apiKey),
      isOpenWebUi: true,
    };
  }

  // Attach the Open WebUI key only when the URL targets the configured instance,
  // so the key is never leaked to arbitrary hosts.
  const targetsOpenWebUi = Boolean(
    baseUrl && (cleaned === baseUrl || cleaned.startsWith(`${baseUrl}/`)),
  );
  return {
    url: parsed.toString(),
    headers: targetsOpenWebUi ? openWebUiHeaders(apiKey) : {},
    isOpenWebUi: targetsOpenWebUi,
  };
}

export async function uploadAssetFromUrl(storage, path, source) {
  if (typeof storage.writeAsset !== "function") {
    throw new Error("Asset upload is not supported by this storage backend");
  }
  const normalized = normalizeAssetPath(path);
  const { url, headers, isOpenWebUi } = resolveAssetSource(source);

  let response;
  try {
    response = await fetch(url, { headers, redirect: "follow" });
  } catch (error) {
    throw new PathError(`Failed to fetch source url: ${error.message}`, 502);
  }
  if (!response.ok) {
    const hint =
      isOpenWebUi && (response.status === 401 || response.status === 403)
        ? " (set OPENWEBUI_API_KEY to an API key created in Open WebUI under Settings > Account)"
        : "";
    throw new PathError(
      `Source url returned ${response.status} ${response.statusText}${hint}`,
      502,
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0) {
    throw new PathError("Fetched file is empty", 502);
  }
  if (buffer.length > MAX_FETCH_BYTES) {
    throw new PathError(
      `Fetched file exceeds the ${Math.floor(MAX_FETCH_BYTES / (1024 * 1024))} MB limit`,
      413,
    );
  }

  await storage.writeAsset(normalized, buffer);
  return {
    path: normalized,
    size: buffer.length,
    contentType: response.headers.get("content-type") || null,
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
