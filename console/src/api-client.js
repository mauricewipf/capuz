import { config } from "./config.js";

export class ApiError extends Error {
  constructor(message, status = 500, body = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

function encodePathSegment(segment) {
  return encodeURIComponent(segment).replace(/%2F/gi, "/");
}

export function encodePagePath(path) {
  return path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

async function apiFetch(path, options = {}) {
  const url = `${config.cmsApiUrl}${path.startsWith("/") ? path : `/${path}`}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.upstreamTimeoutMs);
  try {
    const headers = new Headers(options.headers || {});
    if (!headers.has("Authorization") && config.cmsApiKey) {
      headers.set("Authorization", `Bearer ${config.cmsApiKey}`);
    }
    const response = await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });
    const contentType = response.headers.get("content-type") || "";
    let body;
    if (contentType.includes("application/json")) {
      body = await response.json();
    } else if (contentType.includes("text/")) {
      body = await response.text();
    } else {
      body = null;
    }
    if (!response.ok) {
      const message =
        typeof body === "object" && body?.error
          ? body.error
          : `CMS API error (${response.status})`;
      throw new ApiError(message, response.status, body);
    }
    return body;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new ApiError("CMS API request timed out", 504);
    }
    if (error instanceof ApiError) throw error;
    throw new ApiError(error.message || "CMS API unreachable", 502);
  } finally {
    clearTimeout(timeout);
  }
}

export async function getHealth() {
  return apiFetch("/health");
}

export async function getStatus() {
  return apiFetch("/status");
}

export async function listPagesWithStatus() {
  const data = await apiFetch("/api/pages");
  return data.pages || [];
}

export async function getPageDiff(path) {
  return apiFetch(`/api/pages/${encodePagePath(path)}/diff`);
}

export async function publishPage(path) {
  return apiFetch(`/api/pages/${encodePagePath(path)}/publish`, { method: "POST" });
}

export async function discardDraft(path) {
  return apiFetch(`/api/drafts/${encodePagePath(path)}`, { method: "DELETE" });
}

export async function deletePage(path) {
  return apiFetch(`/api/pages/${encodePagePath(path)}`, { method: "DELETE" });
}

export async function listComponents() {
  const data = await apiFetch("/api/components");
  return data.components || [];
}

export async function getComponent(name) {
  return apiFetch(`/api/components/${encodePagePath(name)}`);
}
