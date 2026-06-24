import { VERSION } from "./version.js";

const bearerSecurity = [{ bearerAuth: [] }];
const errorResponse = {
  description: "Error",
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/ErrorResponse" },
    },
  },
};

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Capuz CMS API",
    version: VERSION,
    description:
      "AI-editable HTML and XML pages for static sites. Writes save drafts; publish explicitly to go live. Includes components, assets, SEO, link checks, and preview screenshots.",
  },
  servers: [{ url: "/" }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description: "CMS_API_KEY bearer token required for write and delete operations",
      },
    },
    schemas: {
      PageList: {
        type: "object",
        properties: { pages: { type: "array", items: { type: "string" } } },
        required: ["pages"],
      },
      PageStatusList: {
        type: "object",
        properties: {
          pages: {
            type: "array",
            items: {
              type: "object",
              properties: {
                path: { type: "string" },
                status: { type: "string", enum: ["published", "draft", "modified"] },
              },
              required: ["path", "status"],
            },
          },
        },
        required: ["pages"],
      },
      DraftWriteResponse: {
        type: "object",
        properties: {
          ok: { type: "boolean" },
          path: { type: "string" },
          previewUrl: { type: "string" },
        },
        required: ["ok", "path", "previewUrl"],
      },
      PublishResponse: {
        type: "object",
        properties: { ok: { type: "boolean" }, path: { type: "string" } },
        required: ["ok", "path"],
      },
      DeleteResponse: {
        type: "object",
        properties: { ok: { type: "boolean" }, path: { type: "string" } },
        required: ["ok", "path"],
      },
      ErrorResponse: {
        type: "object",
        properties: { error: { type: "string" } },
        required: ["error"],
      },
    },
  },
  paths: {
    "/health": {
      get: {
        summary: "Health check",
        operationId: "health",
        responses: { "200": { description: "Service is healthy" } },
      },
    },
    "/api/pages": {
      get: {
        summary: "List published pages",
        operationId: "listPages",
        parameters: [
          {
            name: "detail",
            in: "query",
            schema: { type: "string", enum: ["status"] },
          },
        ],
        responses: { "200": { description: "List of page paths" } },
      },
    },
    "/api/search": {
      get: {
        summary: "Search page HTML",
        operationId: "searchPages",
        parameters: [
          { name: "q", in: "query", required: true, schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer" } },
        ],
        responses: { "200": { description: "Search results" } },
      },
    },
    "/api/links/check": {
      get: {
        summary: "Check internal links",
        operationId: "checkLinks",
        responses: { "200": { description: "Broken link report" } },
      },
    },
    "/api/assets": {
      get: {
        summary: "List assets",
        operationId: "listAssets",
        parameters: [{ name: "prefix", in: "query", schema: { type: "string" } }],
        responses: { "200": { description: "Asset paths" } },
      },
    },
    "/api/assets/{path}": {
      get: {
        summary: "Read asset",
        operationId: "readAsset",
        parameters: [{ name: "path", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Asset metadata and base64 content" } },
      },
      put: {
        summary: "Upload asset",
        operationId: "uploadAsset",
        security: bearerSecurity,
        parameters: [{ name: "path", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { contentBase64: { type: "string" } },
                required: ["contentBase64"],
              },
            },
          },
        },
        responses: { "200": { description: "Asset uploaded" } },
      },
      delete: {
        summary: "Delete asset",
        operationId: "deleteAsset",
        security: bearerSecurity,
        parameters: [{ name: "path", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Asset deleted" } },
      },
    },
    "/api/components": {
      get: {
        summary: "List components",
        operationId: "listComponents",
        responses: { "200": { description: "Component names" } },
      },
    },
    "/api/components/suggest": {
      get: {
        summary: "Suggest reusable components from existing pages",
        operationId: "suggestComponents",
        parameters: [
          { name: "minMatches", in: "query", schema: { type: "integer" } },
          { name: "maxCandidates", in: "query", schema: { type: "integer" } },
        ],
        responses: { "200": { description: "Component candidate report" } },
      },
    },
    "/api/components/{name}": {
      get: {
        summary: "Read component",
        operationId: "readComponent",
        parameters: [{ name: "name", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Component HTML" } },
      },
      put: {
        summary: "Write component",
        operationId: "writeComponent",
        security: bearerSecurity,
        parameters: [{ name: "name", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { html: { type: "string" } },
                required: ["html"],
              },
            },
          },
        },
        responses: { "200": { description: "Component saved" } },
      },
      delete: {
        summary: "Delete component",
        operationId: "deleteComponent",
        security: bearerSecurity,
        parameters: [{ name: "name", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Component deleted" } },
      },
    },
    "/api/components/{name}/insert": {
      post: {
        summary: "Insert component into page draft",
        operationId: "insertComponent",
        security: bearerSecurity,
        parameters: [{ name: "name", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  path: { type: "string" },
                  position: { type: "string", enum: ["after_body_start", "before_body_end"] },
                },
                required: ["path"],
              },
            },
          },
        },
        responses: { "200": { description: "Component inserted into draft" } },
      },
    },
    "/api/components/{name}/sync": {
      post: {
        summary: "Sync component into tagged page drafts",
        operationId: "syncComponent",
        security: bearerSecurity,
        parameters: [{ name: "name", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Pages updated as drafts" } },
      },
    },
    "/api/drafts": {
      get: {
        summary: "List draft pages",
        operationId: "listDrafts",
        responses: { "200": { description: "Draft paths" } },
      },
    },
    "/api/drafts/{path}": {
      get: { summary: "Read draft", operationId: "readDraft", responses: { "200": { description: "Draft HTML" }, "404": errorResponse } },
      put: { summary: "Write draft", operationId: "writeDraft", security: bearerSecurity, responses: { "200": { description: "Draft saved" } } },
      delete: { summary: "Discard draft", operationId: "discardDraft", security: bearerSecurity, responses: { "200": { description: "Draft discarded" } } },
    },
    "/api/drafts/{path}/publish": {
      post: { summary: "Publish draft", operationId: "publishDraft", security: bearerSecurity, responses: { "200": { description: "Draft published" } } },
    },
    "/api/pages/{path}": {
      get: { summary: "Read published page", operationId: "readPage", responses: { "200": { description: "Published HTML" }, "404": errorResponse } },
      put: { summary: "Write draft", operationId: "writePage", security: bearerSecurity, responses: { "200": { description: "Draft saved" } } },
      delete: { summary: "Delete published page", operationId: "deletePage", security: bearerSecurity, responses: { "200": { description: "Page deleted" } } },
    },
    "/api/pages/{path}/publish": {
      post: { summary: "Publish draft", operationId: "publishPage", security: bearerSecurity, responses: { "200": { description: "Draft published" } } },
    },
    "/api/pages/{path}/edit": {
      post: {
        summary: "Edit page via find/replace patch",
        operationId: "editPage",
        security: bearerSecurity,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  find: { type: "string" },
                  replace: { type: "string" },
                  replaceAll: { type: "boolean" },
                },
                required: ["find", "replace"],
              },
            },
          },
        },
        responses: { "200": { description: "Draft saved" } },
      },
    },
    "/api/pages/{path}/diff": {
      get: { summary: "Diff draft vs published", operationId: "diffPage", responses: { "200": { description: "Unified diff" } } },
    },
    "/api/pages/{path}/seo": {
      get: { summary: "Audit SEO", operationId: "auditSeo", responses: { "200": { description: "SEO audit" } } },
      post: { summary: "Apply SEO metadata to draft", operationId: "applySeo", security: bearerSecurity, responses: { "200": { description: "Draft saved" } } },
    },
    "/api/pages/{path}/preview-screenshot": {
      post: { summary: "Render preview screenshot", operationId: "renderPreview", security: bearerSecurity, responses: { "200": { description: "Screenshot metadata and base64 PNG" } } },
    },
    "/api/pages/move": {
      post: { summary: "Move page", operationId: "movePage", security: bearerSecurity, responses: { "200": { description: "Page moved" } } },
    },
    "/api/pages/rename": {
      post: { summary: "Rename page", operationId: "renamePage", security: bearerSecurity, responses: { "200": { description: "Page renamed" } } },
    },
    "/api/pages/copy": {
      post: { summary: "Copy page", operationId: "copyPage", security: bearerSecurity, responses: { "200": { description: "Page copied as draft" } } },
    },
    "/api/sitemap/regenerate": {
      post: { summary: "Regenerate sitemap.xml draft", operationId: "regenerateSitemap", security: bearerSecurity, responses: { "200": { description: "Sitemap draft saved" } } },
    },
    "/mcp": {
      post: { summary: "MCP protocol", operationId: "mcp", security: bearerSecurity, responses: { "200": { description: "MCP response" } } },
    },
  },
};
