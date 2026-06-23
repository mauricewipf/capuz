import { isPreviewHost, PathError } from "./paths.js";
import { handlePathError } from "./pages.js";
import { isPageRequest, previewPageCandidates } from "./preview-paths.js";
import { getStorage } from "./storage/index.js";

function contentTypeForAsset(path) {
  const lower = path.toLowerCase();
  if (lower.endsWith(".css")) return "text/css; charset=utf-8";
  if (lower.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (lower.endsWith(".json")) return "application/json; charset=utf-8";
  if (lower.endsWith(".xml")) return "application/xml; charset=utf-8";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".ico")) return "image/x-icon";
  if (lower.endsWith(".woff2")) return "font/woff2";
  if (lower.endsWith(".woff")) return "font/woff";
  if (lower.endsWith(".html")) return "text/html; charset=utf-8";
  return "application/octet-stream";
}

function pageContentType(path) {
  return path.toLowerCase().endsWith(".xml")
    ? "application/xml; charset=utf-8"
    : "text/html; charset=utf-8";
}

async function readPreviewPage(storage, uriPath) {
  const candidates = previewPageCandidates(uriPath);

  for (const pagePath of candidates) {
    if (await storage.hasDraft(pagePath)) {
      const html = await storage.readDraft(pagePath);
      return { body: html, source: "draft", pagePath };
    }
  }

  for (const pagePath of candidates) {
    try {
      const html = await storage.readPage(pagePath);
      return { body: html, source: "published", pagePath };
    } catch (error) {
      const { status } = handlePathError(error);
      if (status !== 404) throw error;
    }
  }

  throw new PathError("Page not found", 404);
}

export async function handlePreviewRequest(c) {
  const storage = getStorage();
  const url = new URL(c.req.url);
  const uriPath = url.pathname;

  try {
    if (isPageRequest(uriPath)) {
      const { body, source, pagePath } = await readPreviewPage(storage, uriPath);
      return c.text(body, 200, {
        "Content-Type": pageContentType(pagePath),
        "X-Preview-Source": source,
      });
    }

    const assetPath = uriPath.replace(/^\/+/, "");
    const buffer = await storage.readAsset(assetPath);
    const body = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    return c.body(body, 200, {
      "Content-Type": contentTypeForAsset(assetPath),
    });
  } catch (error) {
    const { message, status } = handlePathError(error);
    if (status === 404) {
      return c.text(message, 404);
    }
    return c.json({ error: message }, status);
  }
}

export function previewMiddleware() {
  return async (c, next) => {
    if (!isPreviewHost(c.req.header("host"))) {
      return next();
    }
    return handlePreviewRequest(c);
  };
}
