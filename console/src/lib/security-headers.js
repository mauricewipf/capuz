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

export function applyComponentPreviewHeaders(set) {
  set.headers = set.headers || {};
  set.headers["Cache-Control"] = "no-store";
  set.headers["X-Content-Type-Options"] = "nosniff";
  set.headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
  set.headers["X-Frame-Options"] = "DENY";
  set.headers["Content-Security-Policy"] =
    "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'; style-src 'self' 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data: https://img.daisyui.com; font-src 'self'";
}
