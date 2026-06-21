import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { handlePathError } from "./pages.js";
import { getStorage } from "./storage/index.js";

export function createMcpServer() {
  const storage = getStorage();
  const server = new McpServer({
    name: "cms-pages",
    version: "1.0.0",
  });

  server.tool(
    "list_pages",
    "List all HTML and XML page paths on the site",
    {},
    async () => {
      const pages = await storage.listPages();
      return {
        content: [{ type: "text", text: JSON.stringify(pages, null, 2) }],
      };
    },
  );

  server.tool(
    "read_page",
    "Read the HTML content of a page by path (e.g. index.html)",
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
    "write_page",
    "Write HTML content to a page path. Creates parent directories if needed.",
    {
      path: z.string().describe("Relative page path such as index.html"),
      html: z.string().describe("Full HTML content to save"),
    },
    async ({ path, html }) => {
      try {
        const saved = await storage.writePage(path, html);
        return {
          content: [{ type: "text", text: `Saved ${saved}` }],
        };
      } catch (error) {
        const { message } = handlePathError(error);
        return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
      }
    },
  );

  server.tool(
    "delete_page",
    "Delete a page by path",
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
