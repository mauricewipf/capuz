import { Elysia } from "elysia";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  discardDraft,
  getComponent,
  getHealth,
  getPageDiff,
  getStatus,
  listComponents,
  listPagesWithStatus,
  publishPage,
  ApiError,
} from "./api-client.js";
import { config } from "./config.js";
import { identityFromRequest, isAuthorized, isSameOrigin } from "./lib/auth.js";
import { createCsrfToken, verifyCsrfToken } from "./lib/csrf.js";
import { applyComponentPreviewHeaders, applySecurityHeaders } from "./lib/security-headers.js";
import { layout, forbiddenPage, errorPage } from "./views/layout.js";
import { pagesPage } from "./views/pages.js";
import { componentsPage, componentPreviewPage } from "./views/components.js";
import { statusPage } from "./views/status.js";

const rootDir = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const staticDir = join(rootDir, "static");

function htmlResponse(set, body, status = 200) {
  applySecurityHeaders(set);
  set.headers["Content-Type"] = "text/html; charset=utf-8";
  set.status = status;
  return body;
}

function parseFlash(query) {
  const raw = query?.flash;
  if (!raw || typeof raw !== "string") return null;
  const [type, ...rest] = raw.split(":");
  const message = rest.join(":");
  if (!message) return null;
  return { type, message };
}

function requireIdentity(request, set) {
  const identity = identityFromRequest(request);
  if (!identity) {
    set.status = 401;
    applySecurityHeaders(set);
    return { error: "Unauthorized — missing trusted identity headers." };
  }
  if (!isAuthorized(identity)) {
    return { forbidden: identity };
  }
  return { identity };
}

function requireMutation(request, set) {
  const auth = requireIdentity(request, set);
  if (auth.error) return { ...auth, httpStatus: 401 };
  if (auth.forbidden) return auth;
  if (!isSameOrigin(request)) {
    return { error: "Forbidden — cross-origin request.", httpStatus: 403 };
  }
  return auth;
}

function pathFromWildcard(wild) {
  return decodeURIComponent(String(wild || "").replace(/^\/+/, ""));
}

const app = new Elysia()
  .get("/health", () => ({ ok: true, service: "cms-console" }))

  .get("/static/*", async ({ request, set }) => {
    const url = new URL(request.url);
    const rel = url.pathname.replace(/^\/static\//, "");
    if (!rel || rel.includes("..")) {
      set.status = 404;
      return "Not found";
    }
    const filePath = join(staticDir, rel);
    const file = Bun.file(filePath);
    if (!(await file.exists())) {
      set.status = 404;
      return "Not found";
    }
    if (rel.endsWith(".css")) set.headers["Content-Type"] = "text/css; charset=utf-8";
    if (rel.endsWith(".js")) set.headers["Content-Type"] = "application/javascript; charset=utf-8";
    set.headers["Cache-Control"] = "public, max-age=86400";
    return file;
  })

  .get("/", ({ set }) => {
    set.status = 302;
    set.headers.Location = "/pages";
    return "";
  })

  .get("/pages", async ({ request, set, query }) => {
    const auth = requireIdentity(request, set);
    if (auth.error) return htmlResponse(set, auth.error, 401);
    if (auth.forbidden) return htmlResponse(set, forbiddenPage(auth.forbidden), 403);

    const csrfToken = createCsrfToken();
    const filter = typeof query.status === "string" ? query.status : "";
    const diffPath = typeof query.diff === "string" ? query.diff : "";

    try {
      const pages = await listPagesWithStatus();
      let diff = null;
      if (diffPath) {
        try {
          diff = await getPageDiff(diffPath);
        } catch (error) {
          if (error instanceof ApiError && error.status === 404) {
            diff = { path: diffPath, diff: "No draft found to diff.", hasChanges: false };
          } else {
            throw error;
          }
        }
      }
      const flash = parseFlash(query);
      const content = pagesPage({
        pages,
        filter,
        diffPath: diffPath || null,
        diff,
        csrfToken,
      });
      return htmlResponse(
        set,
        layout({
          title: "Pages",
          active: "pages",
          identity: auth.identity,
          csrfToken,
          flash,
          content,
        }),
      );
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Failed to load pages.";
      return htmlResponse(
        set,
        errorPage("Pages", message, auth.identity, csrfToken),
        error instanceof ApiError ? error.status : 500,
      );
    }
  })

  // Elysia only supports "*" as the final path segment, so publish/discard
  // share one wildcard route and the action is parsed off the end of the path.
  .post("/pages/*", async ({ request, set, params }) => {
    const wild = String(params["*"] || "").replace(/^\/+/, "");
    const separator = wild.lastIndexOf("/");
    const action = separator === -1 ? "" : wild.slice(separator + 1);
    const pagePath = separator === -1 ? "" : decodeURIComponent(wild.slice(0, separator));
    if ((action !== "publish" && action !== "discard") || !pagePath) {
      applySecurityHeaders(set);
      set.status = 404;
      return "Not found";
    }

    const auth = requireMutation(request, set);
    if (auth.error) return htmlResponse(set, auth.error, auth.httpStatus || 401);
    if (auth.forbidden) return htmlResponse(set, forbiddenPage(auth.forbidden), 403);

    const form = await request.formData();
    const csrf = form.get("_csrf");
    if (!verifyCsrfToken(String(csrf || ""))) {
      set.status = 403;
      applySecurityHeaders(set);
      return "Invalid CSRF token";
    }

    try {
      if (action === "publish") {
        await publishPage(pagePath);
        set.headers.Location = `/pages?flash=success:Published ${encodeURIComponent(pagePath)}`;
      } else {
        await discardDraft(pagePath);
        set.headers.Location = `/pages?flash=success:Discarded draft for ${encodeURIComponent(pagePath)}`;
      }
      set.status = 302;
      return "";
    } catch (error) {
      const fallback = action === "publish" ? "Publish failed." : "Discard failed.";
      const message = error instanceof ApiError ? error.message : fallback;
      set.status = 302;
      set.headers.Location = `/pages?flash=error:${encodeURIComponent(message)}`;
      return "";
    }
  })

  .get("/components/preview/*", async ({ request, set, params }) => {
    const auth = requireIdentity(request, set);
    if (auth.error) return htmlResponse(set, auth.error, 401);
    if (auth.forbidden) return htmlResponse(set, forbiddenPage(auth.forbidden), 403);

    const name = pathFromWildcard(params["*"]);
    if (!name) {
      return htmlResponse(set, "Missing component name", 400);
    }

    try {
      const selectedHtml = await getComponent(name);
      applyComponentPreviewHeaders(set);
      set.headers["Content-Type"] = "text/html; charset=utf-8";
      set.status = 200;
      return componentPreviewPage({ html: selectedHtml.html });
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Failed to load component.";
      return htmlResponse(set, message, error instanceof ApiError ? error.status : 500);
    }
  })

  .get("/components/*", async ({ request, set, params, query }) => {
    const auth = requireIdentity(request, set);
    if (auth.error) return htmlResponse(set, auth.error, 401);
    if (auth.forbidden) return htmlResponse(set, forbiddenPage(auth.forbidden), 403);

    const csrfToken = createCsrfToken();
    const selected = pathFromWildcard(params["*"]);

    try {
      const components = await listComponents();
      let selectedHtml = null;
      let selectedError = null;
      if (selected) {
        try {
          selectedHtml = await getComponent(selected);
        } catch (error) {
          selectedError =
            error instanceof ApiError ? error.message : "Failed to load component.";
        }
      }
      const content = componentsPage({
        components,
        selected,
        selectedHtml,
        selectedError,
      });
      return htmlResponse(
        set,
        layout({
          title: "Components",
          active: "components",
          identity: auth.identity,
          csrfToken,
          flash: parseFlash(query),
          content,
        }),
      );
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Failed to load components.";
      return htmlResponse(
        set,
        errorPage("Components", message, auth.identity, csrfToken),
        error instanceof ApiError ? error.status : 500,
      );
    }
  })

  .get("/components", async ({ request, set, query }) => {
    const auth = requireIdentity(request, set);
    if (auth.error) return htmlResponse(set, auth.error, 401);
    if (auth.forbidden) return htmlResponse(set, forbiddenPage(auth.forbidden), 403);

    const csrfToken = createCsrfToken();

    try {
      const components = await listComponents();
      const content = componentsPage({
        components,
        selected: "",
        selectedHtml: null,
        selectedError: null,
      });
      return htmlResponse(
        set,
        layout({
          title: "Components",
          active: "components",
          identity: auth.identity,
          csrfToken,
          flash: parseFlash(query),
          content,
        }),
      );
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Failed to load components.";
      return htmlResponse(
        set,
        errorPage("Components", message, auth.identity, csrfToken),
        error instanceof ApiError ? error.status : 500,
      );
    }
  })

  .get("/status", async ({ request, set, query }) => {
    const auth = requireIdentity(request, set);
    if (auth.error) return htmlResponse(set, auth.error, 401);
    if (auth.forbidden) return htmlResponse(set, forbiddenPage(auth.forbidden), 403);

    const csrfToken = createCsrfToken();
    let apiStatus = null;
    let apiError = null;
    try {
      apiStatus = await getStatus();
    } catch (error) {
      apiError = error instanceof ApiError ? error.message : "cms-api unreachable";
    }

    const content = statusPage({
      consoleHealth: { ok: true },
      apiStatus,
      apiError,
    });
    return htmlResponse(
      set,
      layout({
        title: "Status",
        active: "status",
        identity: auth.identity,
        csrfToken,
        flash: parseFlash(query),
        content,
      }),
    );
  });

console.log(`CMS Console listening on :${config.port}`);
app.listen(config.port);

export default app;
