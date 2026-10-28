import { z } from "zod";

/** MCP tool input shapes (Zod raw shapes). Shared so tests can lock validation behavior. */

export const listPagesInput = {
  changedOnly: z
    .boolean()
    .optional()
    .describe(
      "If true, only return draft and modified pages (unpublished changes). Use this when the user asks for pages with changes.",
    ),
  detail: z
    .enum(["status", "paths"])
    .optional()
    .describe(
      'Deprecated: status is the default. Use "paths" only if you need a bare path string array without draft state.',
    ),
};

export const writePageInput = {
  path: z.string().describe("Relative page path such as index.html"),
  html: z.string().describe("Full HTML content to save"),
};

export const editPageInput = {
  path: z.string().describe("Relative page path such as index.html"),
  find: z.string().describe("Exact string to find in the page HTML"),
  replace: z.string().describe("Replacement string"),
  replaceAll: z.boolean().optional().describe("Replace all occurrences (default: first only)"),
};

export const searchPagesInput = {
  query: z.string().describe("Substring to search for"),
  maxResults: z.number().int().min(1).max(100).optional().describe("Maximum matches to return"),
};

export const suggestComponentsInput = {
  minMatches: z.number().int().min(2).optional().describe("Minimum pages a pattern must appear on"),
  maxCandidates: z.number().int().min(1).max(50).optional().describe("Maximum candidates to return"),
};

/** Same object wrapping MCP SDK applies to raw shapes before safeParse. */
export function inputObject(shape) {
  return z.object(shape);
}
