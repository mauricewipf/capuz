import SftpClient from "ssh2-sftp-client";
import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { normalizePagePath, PathError } from "../paths.js";

const ALLOWED_EXTENSIONS = [".html", ".xml"];

function isAllowedPage(name) {
  const lower = name.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required when STORAGE_BACKEND=sftp`);
  }
  return value;
}

export class SftpStorage {
  client = null;
  connecting = null;
  host = requireEnv("SFTP_HOST");
  port = Number(process.env.SFTP_PORT || 22);
  username = requireEnv("SFTP_USER");
  keyPath = requireEnv("SFTP_KEY_PATH");
  remoteRoot = requireEnv("SFTP_REMOTE_ROOT").replace(/\/+$/, "");

  remotePath(relativePath) {
    const normalized = normalizePagePath(relativePath);
    return `${this.remoteRoot}/${normalized}`;
  }

  async connect() {
    if (this.client) return;
    if (this.connecting) {
      await this.connecting;
      return;
    }

    this.connecting = (async () => {
      const privateKey = await readFile(this.keyPath, "utf8");
      const client = new SftpClient();
      await client.connect({
        host: this.host,
        port: this.port,
        username: this.username,
        privateKey,
        readyTimeout: 20_000,
      });
      this.client = client;
    })();

    try {
      await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  async withClient(fn) {
    try {
      await this.connect();
      if (!this.client) {
        throw new Error("SFTP client is not connected");
      }
      return await fn(this.client);
    } catch (error) {
      if (this.client) {
        try {
          await this.client.end();
        } catch {
          // ignore disconnect errors
        }
        this.client = null;
      }
      throw error;
    }
  }

  async walk(client, dir, pages) {
    let entries;
    try {
      entries = await client.list(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const fullPath = `${dir}/${entry.name}`;
      if (entry.type === "d") {
        await this.walk(client, fullPath, pages);
        continue;
      }
      if (isAllowedPage(entry.name)) {
        const relative = fullPath.slice(this.remoteRoot.length + 1);
        pages.push(relative.split("\\").join("/"));
      }
    }
  }

  async listPages() {
    const pages = [];
    await this.withClient(async (client) => {
      await this.walk(client, this.remoteRoot, pages);
    });
    pages.sort();
    return pages;
  }

  async readPage(relativePath) {
    const remote = this.remotePath(relativePath);
    return await this.withClient(async (client) => {
      const exists = await client.exists(remote);
      if (!exists) {
        throw new PathError("Page not found", 404);
      }
      const buffer = await client.get(remote);
      if (Buffer.isBuffer(buffer)) {
        return buffer.toString("utf8");
      }
      if (typeof buffer === "string") {
        return buffer;
      }
      throw new Error("Unexpected SFTP response type");
    });
  }

  async writePage(relativePath, html) {
    const normalized = normalizePagePath(relativePath);
    const remote = this.remotePath(normalized);
    await this.withClient(async (client) => {
      await client.mkdir(dirname(remote), true);
      await client.put(Buffer.from(html, "utf8"), remote);
    });
    return normalized;
  }

  async deletePage(relativePath) {
    const remote = this.remotePath(relativePath);
    await this.withClient(async (client) => {
      const exists = await client.exists(remote);
      if (!exists) {
        throw new PathError("Page not found", 404);
      }
      await client.delete(remote);
    });
  }
}
