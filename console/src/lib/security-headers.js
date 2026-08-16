const SHELL_CSP =
  "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'";

export function applySecurityHeaders(set) {
  set.headers = set.headers || {};
  set.headers["Cache-Control"] = "no-store";
  set.headers["X-Content-Type-Options"] = "nosniff";
  set.headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
  set.headers["Content-Security-Policy"] = SHELL_CSP;
  set.headers["X-Frame-Options"] = "DENY";
}

export function componentFrameCsp(siteOrigin) {
  const origin = siteOrigin.replace(/\/+$/, "");
  return `default-src 'none'; style-src ${origin} 'unsafe-inline'; img-src ${origin} data:; font-src ${origin}; sandbox allow-same-origin`;
}
