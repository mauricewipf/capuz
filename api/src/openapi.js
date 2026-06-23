import { VERSION } from "./version.js";

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Capuz CMS API",
    version: VERSION,
    description:
      "AI-editable HTML and XML pages for static sites. Writes save drafts; publish explicitly to go live. Use as an Open WebUI Tool Server or direct REST API.",
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
        properties: {
          pages: {
            type: "array",
            items: { type: "string" },
          },
        },
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
                status: {
                  type: "string",
                  enum: ["published", "draft", "modified"],
                },
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
        properties: {
          ok: { type: "boolean" },
          path: { type: "string" },
        },
        required: ["ok", "path"],
      },
      DeleteResponse: {
        type: "object",
        properties: {
          ok: { type: "boolean" },
          path: { type: "string" },
        },
        required: ["ok", "path"],
      },
      ErrorResponse: {
        type: "object",
        properties: {
          error: { type: "string" },
        },
        required: ["error"],
      },
    },
  },
  paths: {
    "/health": {
      get: {
        summary: "Health check",
        operationId: "health",
        responses: {
          "200": {
            description: "Service is healthy",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { ok: { type: "boolean" } },
                },
              },
            },
          },
        },
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
            required: false,
            schema: { type: "string", enum: ["status"] },
            description:
              'When "status", returns all pages with draft state (published, draft, modified)',
          },
        ],
        responses: {
          "200": {
            description: "List of page paths",
            content: {
              "application/json": {
                schema: {
                  oneOf: [
                    { $ref: "#/components/schemas/PageList" },
                    { $ref: "#/components/schemas/PageStatusList" },
                  ],
                },
              },
            },
          },
        },
      },
    },
    "/api/drafts": {
      get: {
        summary: "List draft pages",
        operationId: "listDrafts",
        responses: {
          "200": {
            description: "List of draft page paths",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PageList" },
              },
            },
          },
        },
      },
    },
    "/api/drafts/{path}": {
      parameters: [
        {
          name: "path",
          in: "path",
          required: true,
          description: "Relative page path such as index.html",
          schema: { type: "string" },
        },
      ],
      get: {
        summary: "Read draft",
        operationId: "readDraft",
        responses: {
          "200": {
            description: "Draft HTML content",
            content: {
              "text/html": { schema: { type: "string" } },
            },
          },
          "404": {
            description: "Draft not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
      put: {
        summary: "Write draft",
        operationId: "writeDraft",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "text/html": { schema: { type: "string" } },
          },
        },
        responses: {
          "200": {
            description: "Draft saved",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/DraftWriteResponse" },
              },
            },
          },
        },
      },
      delete: {
        summary: "Discard draft",
        operationId: "discardDraft",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Draft discarded",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/DeleteResponse" },
              },
            },
          },
        },
      },
    },
    "/api/drafts/{path}/publish": {
      parameters: [
        {
          name: "path",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
      ],
      post: {
        summary: "Publish draft",
        operationId: "publishDraft",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Draft published",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PublishResponse" },
              },
            },
          },
        },
      },
    },
    "/api/pages/{path}": {
      parameters: [
        {
          name: "path",
          in: "path",
          required: true,
          description: "Relative page path such as index.html or blog/post.html",
          schema: { type: "string" },
        },
      ],
      get: {
        summary: "Read published page",
        operationId: "readPage",
        responses: {
          "200": {
            description: "Published page HTML content",
            content: {
              "text/html": { schema: { type: "string" } },
            },
          },
          "404": {
            description: "Page not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
      put: {
        summary: "Write draft (alias of PUT /api/drafts/{path})",
        operationId: "writePage",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "text/html": { schema: { type: "string" } },
          },
        },
        responses: {
          "200": {
            description: "Draft saved",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/DraftWriteResponse" },
              },
            },
          },
        },
      },
      delete: {
        summary: "Delete published page",
        operationId: "deletePage",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Page deleted",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/DeleteResponse" },
              },
            },
          },
        },
      },
    },
    "/api/pages/{path}/publish": {
      parameters: [
        {
          name: "path",
          in: "path",
          required: true,
          schema: { type: "string" },
        },
      ],
      post: {
        summary: "Publish draft (shortcut)",
        operationId: "publishPage",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Draft published",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PublishResponse" },
              },
            },
          },
        },
      },
    },
  },
};
