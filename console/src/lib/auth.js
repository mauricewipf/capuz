import { config } from "../config.js";

const FORGED_HEADERS = [
  config.authEmailHeader.toLowerCase(),
  config.authUserHeader.toLowerCase(),
  config.authGroupsHeader.toLowerCase(),
  "x-forwarded-email",
  "x-forwarded-user",
  "x-forwarded-groups",
];

/**
 * Read trusted identity from headers set by Caddy (dev) or oauth2-proxy (prod).
 * Client-supplied identity headers are ignored — Caddy must strip them before injection.
 */
export function identityFromRequest(request) {
  const email = readHeader(request, config.authEmailHeader)?.trim().toLowerCase();
  const name = readHeader(request, config.authUserHeader)?.trim();
  const groups = readGroups(request);
  if (!email) return null;
  return { email, name: name || email, groups };
}

function readHeader(request, name) {
  return request.headers.get(name) || request.headers.get(name.toLowerCase());
}

function readGroups(request) {
  const values = [];
  for (const [key, value] of request.headers.entries()) {
    if (key.toLowerCase() === config.authGroupsHeader.toLowerCase()) {
      for (const part of value.split(",")) {
        const g = part.trim();
        if (g) values.push(g);
      }
    }
  }
  return values;
}

export function isAuthorized(identity) {
  if (!identity?.email) return false;
  if (config.allowedGroups.length === 0) return true;
  const groupSet = new Set(identity.groups);
  return config.allowedGroups.some((g) => groupSet.has(g));
}

/** Reject cross-origin form posts (CSRF defense alongside signed tokens). */
export function isSameOrigin(request) {
  const hostHeader = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (!hostHeader) return false;
  const expectedHost = hostHeader.split(",")[0].trim().toLowerCase();

  const origin = request.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).host.toLowerCase() === expectedHost;
    } catch {
      return false;
    }
  }

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).host.toLowerCase() === expectedHost;
    } catch {
      return false;
    }
  }

  return false;
}

export function stripForgedIdentityHeaders(headers) {
  const cleaned = new Headers(headers);
  for (const name of FORGED_HEADERS) {
    cleaned.delete(name);
  }
  return cleaned;
}
