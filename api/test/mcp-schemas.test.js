import { describe, expect, test } from "bun:test";
import {
  editPageInput,
  inputObject,
  listPagesInput,
  searchPagesInput,
  suggestComponentsInput,
  writePageInput,
} from "../src/mcp-schemas.js";

describe("MCP input schemas (Zod)", () => {
  test("write_page requires path and html strings", () => {
    const schema = inputObject(writePageInput);
    expect(schema.safeParse({ path: "index.html", html: "<p>hi</p>" }).success).toBe(true);
    expect(schema.safeParse({ path: "index.html" }).success).toBe(false);
    expect(schema.safeParse({ html: "<p>hi</p>" }).success).toBe(false);
    expect(schema.safeParse({ path: 1, html: "<p>hi</p>" }).success).toBe(false);
  });

  test("search_pages maxResults must be an int from 1 to 100", () => {
    const schema = inputObject(searchPagesInput);
    expect(schema.safeParse({ query: "nav" }).success).toBe(true);
    expect(schema.safeParse({ query: "nav", maxResults: 20 }).success).toBe(true);
    expect(schema.safeParse({ query: "nav", maxResults: 0 }).success).toBe(false);
    expect(schema.safeParse({ query: "nav", maxResults: 101 }).success).toBe(false);
    expect(schema.safeParse({ query: "nav", maxResults: 1.5 }).success).toBe(false);
    expect(schema.safeParse({ query: "nav", maxResults: "20" }).success).toBe(false);
  });

  test("list_pages accepts optional boolean and detail enum", () => {
    const schema = inputObject(listPagesInput);
    expect(schema.safeParse({}).success).toBe(true);
    expect(schema.safeParse({ changedOnly: true, detail: "paths" }).success).toBe(true);
    expect(schema.safeParse({ detail: "status" }).success).toBe(true);
    expect(schema.safeParse({ changedOnly: "yes" }).success).toBe(false);
    expect(schema.safeParse({ detail: "full" }).success).toBe(false);
  });

  test("suggest_components enforces minMatches and maxCandidates bounds", () => {
    const schema = inputObject(suggestComponentsInput);
    expect(schema.safeParse({}).success).toBe(true);
    expect(schema.safeParse({ minMatches: 2, maxCandidates: 50 }).success).toBe(true);
    expect(schema.safeParse({ minMatches: 1 }).success).toBe(false);
    expect(schema.safeParse({ maxCandidates: 0 }).success).toBe(false);
    expect(schema.safeParse({ maxCandidates: 51 }).success).toBe(false);
  });

  test("edit_page replaceAll is an optional boolean", () => {
    const schema = inputObject(editPageInput);
    const base = { path: "a.html", find: "x", replace: "y" };
    expect(schema.safeParse(base).success).toBe(true);
    expect(schema.safeParse({ ...base, replaceAll: true }).success).toBe(true);
    expect(schema.safeParse({ ...base, replaceAll: "true" }).success).toBe(false);
    expect(schema.safeParse({ path: "a.html", find: "x" }).success).toBe(false);
  });
});
