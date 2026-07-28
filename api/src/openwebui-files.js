import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, relative, resolve, sep } from "node:path";
import { Database } from "bun:sqlite";
import { getDataRoot, PathError } from "./paths.js";

export function resolveOpenWebUiDataDir() {
  const configured = process.env.DATA_DIR?.trim();
  if (configured) {
    return resolve(configured);
  }
  return resolve(getDataRoot(), ".open-webui");
}

export function isOpenWebUiDataAvailable() {
  const dataDir = resolveOpenWebUiDataDir();
  return existsSync(dataDir) && existsSync(resolve(dataDir, "webui.db"));
}

function isPathInside(root, target) {
  const rel = relative(resolve(root), resolve(target));
  return rel === "" || (!rel.startsWith("..") && !rel.includes(`..${sep}`));
}

function parseMeta(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return {};
}

function resolveStoredFilePath(dataDir, storedPath, filename) {
  const uploadsDir = resolve(dataDir, "uploads");
  const candidates = [];

  if (storedPath) {
    candidates.push(storedPath);
    candidates.push(resolve(dataDir, storedPath));
    candidates.push(resolve(uploadsDir, storedPath));
    candidates.push(resolve(uploadsDir, basename(storedPath)));
  }

  if (filename) {
    candidates.push(resolve(uploadsDir, filename));
    candidates.push(resolve(uploadsDir, basename(filename)));
  }

  const seen = new Set();
  for (const candidate of candidates) {
    const absolute = resolve(candidate);
    if (seen.has(absolute)) continue;
    seen.add(absolute);
    if (!isPathInside(dataDir, absolute)) continue;
    try {
      if (existsSync(absolute) && statSync(absolute).isFile()) {
        return absolute;
      }
    } catch {
      // try next candidate
    }
  }

  throw new PathError("Chat file not found on disk", 404);
}

function lookupFileRow(dataDir, { fileId, fileName }) {
  const dbPath = resolve(dataDir, "webui.db");
  const db = new Database(dbPath, { readonly: true });

  try {
    if (fileId) {
      const row = db
        .query("SELECT id, filename, path, meta FROM file WHERE id = ?")
        .get(fileId);
      if (!row) {
        throw new PathError("Chat file not found", 404);
      }
      return row;
    }

    if (fileName) {
      const rows = db
        .query(
          "SELECT id, filename, path, meta FROM file ORDER BY created_at DESC",
        )
        .all();
      const normalizedName = fileName.trim().toLowerCase();
      for (const row of rows) {
        const meta = parseMeta(row.meta);
        const candidates = [row.filename, meta.name]
          .filter(Boolean)
          .map((value) => String(value).toLowerCase());
        if (candidates.includes(normalizedName)) {
          return row;
        }
      }
      throw new PathError("Chat file not found", 404);
    }

    throw new PathError("fileId or fileName is required", 400);
  } finally {
    db.close();
  }
}

export function readChatFileBytes({ fileId, fileName }) {
  if (!isOpenWebUiDataAvailable()) {
    throw new PathError(
      "Chat file import requires Open WebUI data on shared disk (bundled, stack, or reference production with DATA_DIR). Not available in this deployment.",
      503,
    );
  }

  const dataDir = resolveOpenWebUiDataDir();
  const row = lookupFileRow(dataDir, { fileId, fileName });
  const meta = parseMeta(row.meta);
  // Prefer a name that still has a file extension. Open WebUI's meta.name is a
  // display label and is sometimes stored without one even when filename/path keep it.
  const displayName =
    [meta.name, row.filename, fileName]
      .filter((value) => value != null && String(value).trim() !== "")
      .find((value) => String(value).includes(".")) ||
    meta.name ||
    row.filename ||
    fileName ||
    row.id;
  const absolutePath = resolveStoredFilePath(dataDir, row.path, row.filename);
  const buffer = readFileSync(absolutePath);

  return {
    buffer,
    fileId: row.id,
    filename: displayName,
    rowFilename: row.filename || null,
    diskPath: absolutePath,
    contentType: meta.content_type || null,
  };
}
