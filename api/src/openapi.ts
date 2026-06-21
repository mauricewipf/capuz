export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Capuzzella CMS API",
    version: "1.0.0",
    description:
      "AI-editable HTML and XML pages for static sites. Use as an Open WebUI Tool Server or direct REST API.",
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
      WriteResponse: {
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
        summary: "List pages",
        operationId: "listPages",
        responses: {
          "200": {
            description: "List of page paths",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/PageList" },
              },
            },
          },
          "400": {
            description: "Invalid request",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
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
        summary: "Read page",
        operationId: "readPage",
        responses: {
          "200": {
            description: "Page HTML content",
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
        summary: "Write page",
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
            description: "Page saved",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/WriteResponse" },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
      delete: {
        summary: "Delete page",
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
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
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
    },
  },
} as const;
