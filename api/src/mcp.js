import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { buildPreviewUrl } from "./paths.js";
import { handlePathError } from "./pages.js";
import { getStorage, listPagesWithStatus } from "./storage/index.js";
import { VERSION } from "./version.js";

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
      if (detail === "status") {
        const pages = await listPagesWithStatus(storage);
        return {
          content: [{ type: "text", text: JSON.stringify(pages, null, 2) }],
        };
      }
      const pages = await storage.listPages();
      return {
        content: [{ type: "text", text: JSON.stringify(pages, null, 2) }],
      };
    },
  );

  server.tool(
    "list_drafts",
    "List page paths that have unpublished drafts",
    {},
    async () => {
      const pages = await storage.listDrafts();
      return {
        content: [{ type: "text", text: JSON.stringify(pages, null, 2) }],
      };
    },
  );

  server.tool(
    "read_page",
    "Read the published HTML content of a page by path (e.g. index.html)",
    { path: z.string().describe("Relative page path such as index.html") },
    async ({ path }) => {
      try {
        const html = await storage.readPage(path);
        return { content: [{ type: "text", text: html }] };
      } catch (error) {
        const { message } = handlePathError(error);
        return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
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
        const { message } = handlePathError(error);
        return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
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
        const previewUrl = buildPreviewUrl(saved);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ path: saved, previewUrl }, null, 2),
            },
          ],
        };
      } catch (error) {
        const { message } = handlePathError(error);
        return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
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
        return {
          content: [{ type: "text", text: `Published ${saved}` }],
        };
      } catch (error) {
        const { message } = handlePathError(error);
        return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
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
        const { message } = handlePathError(error);
        return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
      }
    },
  );

  server.tool(
    "delete_page",
    "Delete a published page by path",
    { path: z.string().describe("Relative page path to delete") },
    async ({ path }) => {
      try {
        await storage.deletePage(path);
        return { content: [{ type: "text", text: `Deleted ${path}` }] };
      } catch (error) {
        const { message } = handlePathError(error);
        return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
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
