import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { deleteAsset, listAssets, readAssetInfo, uploadAsset } from "./assets.js";
import {
  deleteComponent,
  insertComponent,
  listComponents,
  readComponent,
  suggestComponents,
  syncComponent,
  writeComponent,
} from "./components.js";
import { checkLinks, invalidateLinkGraph, warnInboundLinks } from "./links.js";
import { buildPreviewUrl } from "./paths.js";
import {
  copyPage,
  diffPage,
  editPage,
  movePage,
  renamePage,
  searchPages,
} from "./page-ops.js";
import { applyPageSeo, auditPageSeo, regenerateSitemap } from "./seo.js";
import { renderPreviewScreenshot } from "./screenshot.js";
import { getStorage, listPagesWithStatus } from "./storage/index.js";
import { VERSION } from "./version.js";

function errorResult(error) {
  const message =
    error && typeof error.message === "string" ? error.message : String(error);
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true,
  };
}

function jsonResult(payload) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}

function registerSuggestComponentsTools(server, storage) {
  const schema = {
    minMatches: z.number().int().min(2).optional().describe("Minimum pages a pattern must appear on"),
    maxCandidates: z.number().int().min(1).max(50).optional().describe("Maximum candidates to return"),
  };
  const handler = async (args) => {
    try {
      return jsonResult(await suggestComponents(storage, args));
    } catch (error) {
      return errorResult(error);
    }
  };

  server.tool(
    "suggest_components",
    "Analyze existing pages and suggest reusable component candidates. Read-only; does not modify pages.",
    schema,
    handler,
  );
  server.tool(
    "reverse_engineer",
    "Alias of suggest_components. Analyze existing pages and suggest reusable component candidates.",
    schema,
    handler,
  );
}

export function createMcpServer() {
  const storage = getStorage();
  const server = new McpServer({
    name: "cms-pages",
    version: VERSION,
  });

  server.tool(
    "list_pages",
    "List HTML and XML page paths. Use detail=status for published, draft, and modified pages.",
    {
      detail: z
        .enum(["status"])
        .optional()
        .describe('Set to "status" to include draft state per path'),
    },
    async ({ detail }) => {
      try {
        const pages =
          detail === "status"
            ? await listPagesWithStatus(storage)
            : await storage.listPages();
        return jsonResult(pages);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.tool("list_drafts", "List page paths that have unpublished drafts", {}, async () => {
    try {
      return jsonResult(await storage.listDrafts());
    } catch (error) {
      return errorResult(error);
    }
  });

  server.tool(
    "read_page",
    "Read the published HTML content of a page by path (e.g. index.html)",
    { path: z.string().describe("Relative page path such as index.html") },
    async ({ path }) => {
      try {
        const html = await storage.readPage(path);
        return { content: [{ type: "text", text: html }] };
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.tool(
    "read_draft",
    "Read the draft HTML content of a page by path",
    { path: z.string().describe("Relative page path such as index.html") },
    async ({ path }) => {
      try {
        const html = await storage.readDraft(path);
        return { content: [{ type: "text", text: html }] };
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.tool(
    "write_page",
    "Save HTML content as a draft. Call publish_page to make it live.",
    {
      path: z.string().describe("Relative page path such as index.html"),
      html: z.string().describe("Full HTML content to save"),
    },
    async ({ path, html }) => {
      try {
        const saved = await storage.writeDraft(path, html);
        invalidateLinkGraph();
        return jsonResult({ path: saved, previewUrl: buildPreviewUrl(saved) });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.tool(
    "edit_page",
    "Apply a find/replace patch to a page draft without rewriting the full HTML.",
    {
      path: z.string().describe("Relative page path such as index.html"),
      find: z.string().describe("Exact string to find in the page HTML"),
      replace: z.string().describe("Replacement string"),
      replaceAll: z.boolean().optional().describe("Replace all occurrences (default: first only)"),
    },
    async ({ path, find, replace, replaceAll }) => {
      try {
        const result = await editPage(storage, path, find, replace, Boolean(replaceAll));
        invalidateLinkGraph();
        return jsonResult(result);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.tool(
    "move_page",
    "Move a page from one path to another. Saves as draft at destination and deletes source.",
    {
      from: z.string().describe("Source page path"),
      to: z.string().describe("Destination page path"),
    },
    async ({ from, to }) => {
      try {
        const warning = await warnInboundLinks(storage, from);
        const result = await movePage(storage, from, to);
        invalidateLinkGraph();
        return jsonResult({ ...result, ...(warning ? { linkWarning: warning } : {}) });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.tool(
    "rename_page",
    "Rename a page path (alias of move_page).",
    {
      from: z.string().describe("Current page path"),
      to: z.string().describe("New page path"),
    },
    async ({ from, to }) => {
      try {
        const warning = await warnInboundLinks(storage, from);
        const result = await renamePage(storage, from, to);
        invalidateLinkGraph();
        return jsonResult({ ...result, ...(warning ? { linkWarning: warning } : {}) });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.tool(
    "copy_page",
    "Copy page content to a new path as a draft.",
    {
      from: z.string().describe("Source page path"),
      to: z.string().describe("Destination page path"),
    },
    async ({ from, to }) => {
      try {
        const result = await copyPage(storage, from, to);
        invalidateLinkGraph();
        return jsonResult(result);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.tool(
    "search_pages",
    "Search page HTML for a substring and return matching lines.",
    {
      query: z.string().describe("Substring to search for"),
      maxResults: z.number().int().min(1).max(100).optional().describe("Maximum matches to return"),
    },
    async ({ query, maxResults }) => {
      try {
        return jsonResult(await searchPages(storage, query, maxResults || 20));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.tool(
    "diff_page",
    "Return a unified diff between published and draft versions of a page.",
    { path: z.string().describe("Relative page path such as index.html") },
    async ({ path }) => {
      try {
        return jsonResult(await diffPage(storage, path));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.tool(
    "publish_page",
    "Publish a draft to the live site",
    { path: z.string().describe("Relative page path such as index.html") },
    async ({ path }) => {
      try {
        const saved = await storage.publishDraft(path);
        invalidateLinkGraph();
        return { content: [{ type: "text", text: `Published ${saved}` }] };
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.tool(
    "discard_draft",
    "Discard an unpublished draft without publishing",
    { path: z.string().describe("Relative page path such as index.html") },
    async ({ path }) => {
      try {
        await storage.discardDraft(path);
        return { content: [{ type: "text", text: `Discarded draft for ${path}` }] };
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.tool(
    "delete_page",
    "Delete a published page by path",
    { path: z.string().describe("Relative page path to delete") },
    async ({ path }) => {
      try {
        const warning = await warnInboundLinks(storage, path);
        await storage.deletePage(path);
        invalidateLinkGraph();
        return jsonResult({ deleted: path, ...(warning ? { linkWarning: warning } : {}) });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.tool(
    "list_assets",
    "List static assets (images, CSS, JS, fonts) stored on the site.",
    {
      prefix: z.string().optional().describe("Optional path prefix filter such as assets/"),
    },
    async ({ prefix }) => {
      try {
        return jsonResult(await listAssets(storage, prefix || ""));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.tool(
    "upload_asset",
    "Upload a static asset as base64-encoded content.",
    {
      path: z.string().describe("Asset path such as assets/images/logo.png"),
      contentBase64: z.string().describe("Base64-encoded file content"),
    },
    async ({ path, contentBase64 }) => {
      try {
        const result = await uploadAsset(storage, path, contentBase64);
        invalidateLinkGraph();
        return jsonResult(result);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.tool(
    "read_asset",
    "Read a static asset and return metadata plus base64 content.",
    { path: z.string().describe("Asset path such as assets/css/theme.css") },
    async ({ path }) => {
      try {
        return jsonResult(await readAssetInfo(storage, path));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.tool(
    "delete_asset",
    "Delete a static asset by path.",
    { path: z.string().describe("Asset path to delete") },
    async ({ path }) => {
      try {
        const result = await deleteAsset(storage, path);
        invalidateLinkGraph();
        return jsonResult(result);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.tool("list_components", "List reusable HTML components in the component library.", {}, async () => {
    try {
      return jsonResult(await listComponents(storage));
    } catch (error) {
      return errorResult(error);
    }
  });

  server.tool(
    "read_component",
    "Read a reusable HTML component by name.",
    { name: z.string().describe("Component name such as navbar or footer") },
    async ({ name }) => {
      try {
        return jsonResult(await readComponent(storage, name));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.tool(
    "write_component",
    "Create or update a reusable HTML component.",
    {
      name: z.string().describe("Component name such as navbar"),
      html: z.string().describe("Component HTML with a single root element"),
    },
    async ({ name, html }) => {
      try {
        return jsonResult(await writeComponent(storage, name, html));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.tool(
    "delete_component",
    "Delete a reusable HTML component.",
    { name: z.string().describe("Component name to delete") },
    async ({ name }) => {
      try {
        return jsonResult(await deleteComponent(storage, name));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.tool(
    "insert_component",
    "Embed a component into a page as tagged HTML and save a draft.",
    {
      path: z.string().describe("Target page path"),
      component: z.string().describe("Component name to insert"),
      position: z
        .enum(["after_body_start", "before_body_end"])
        .optional()
        .describe("Where to insert the component in the page body"),
    },
    async ({ path, component, position }) => {
      try {
        const result = await insertComponent(storage, path, component, position || "before_body_end");
        invalidateLinkGraph();
        return jsonResult(result);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.tool(
    "sync_component",
    "Update all pages tagged with a component to the latest component HTML (saves drafts).",
    { name: z.string().describe("Component name to sync") },
    async ({ name }) => {
      try {
        const result = await syncComponent(storage, name);
        invalidateLinkGraph();
        return jsonResult(result);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  registerSuggestComponentsTools(server, storage);

  server.tool(
    "audit_seo",
    "Audit a page for SEO issues and return structured recommendations.",
    { path: z.string().describe("Relative page path such as index.html") },
    async ({ path }) => {
      try {
        return jsonResult(await auditPageSeo(storage, path));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.tool(
    "apply_seo",
    "Apply SEO metadata updates to a page draft.",
    {
      path: z.string().describe("Relative page path such as index.html"),
      title: z.string().optional(),
      description: z.string().optional(),
      canonical: z.string().optional(),
      ogTitle: z.string().optional(),
      ogDescription: z.string().optional(),
      ogImage: z.string().optional(),
      twitterCard: z.string().optional(),
    },
    async (args) => {
      try {
        const { path, ...updates } = args;
        const result = await applyPageSeo(storage, path, updates);
        invalidateLinkGraph();
        return jsonResult(result);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.tool(
    "regenerate_sitemap",
    "Regenerate sitemap.xml as a draft from published pages.",
    {},
    async () => {
      try {
        const result = await regenerateSitemap(storage);
        invalidateLinkGraph();
        return jsonResult(result);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.tool(
    "check_links",
    "Scan the site for broken internal links and missing assets.",
    {},
    async () => {
      try {
        return jsonResult(await checkLinks(storage));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.tool(
    "render_preview",
    "Render a draft preview screenshot and return base64 PNG (requires SCREENSHOT_RENDERER_URL).",
    { path: z.string().describe("Relative page path such as index.html") },
    async ({ path }) => {
      try {
        const result = await renderPreviewScreenshot(storage, path);
        return {
          content: [
            { type: "text", text: JSON.stringify({ path: result.path, previewUrl: result.previewUrl, size: result.size }, null, 2) },
            { type: "image", data: result.contentBase64, mimeType: result.contentType },
          ],
        };
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  return server;
}

export async function handleMcpRequest(request) {
  const server = createMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}
