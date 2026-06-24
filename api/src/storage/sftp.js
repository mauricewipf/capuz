import SftpClient from "ssh2-sftp-client";
import { readFile, stat } from "node:fs/promises";
import { dirname } from "node:path";
import {
  getDraftsDirName,
  isHiddenStorageSegment,
  normalizeAssetPath,
  normalizePagePath,
  PathError,
} from "../paths.js";

const ALLOWED_EXTENSIONS = [".html", ".xml"];
const DRAFTS_SEGMENT = getDraftsDirName();

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

  draftRemotePath(relativePath) {
    const normalized = normalizePagePath(relativePath);
    return `${this.remoteRoot}/${DRAFTS_SEGMENT}/${normalized}`;
  }

  assetRemotePath(relativePath) {
    const normalized = normalizeAssetPath(relativePath);
    return `${this.remoteRoot}/${normalized}`;
  }

  async readPrivateKey() {
    let info;
    try {
      info = await stat(this.keyPath);
    } catch (error) {
      if (error?.code === "ENOENT") {
        throw new PathError(
          `SFTP private key not found at SFTP_KEY_PATH=${this.keyPath}. Mount your SSH private key file to this path (e.g. -v ~/.ssh/your_key:${this.keyPath}:ro).`,
          500,
        );
      }
      throw error;
    }
    if (info.isDirectory()) {
      throw new PathError(
        `SFTP_KEY_PATH=${this.keyPath} is a directory, not a private key file. This usually means the host path in the volume mount does not exist, so Docker created an empty directory. Point the mount at an existing SSH private key file.`,
        500,
      );
    }
    const key = (await readFile(this.keyPath, "utf8")).trim();
    if (!key.includes("PRIVATE KEY")) {
      throw new PathError(
        `SFTP_KEY_PATH=${this.keyPath} does not contain a PEM private key. Provide an unencrypted OpenSSH/PEM private key file.`,
        500,
      );
    }
    return key;
  }

  async connect() {
    if (this.client) return;
    if (this.connecting) {
      await this.connecting;
      return;
    }

    this.connecting = (async () => {
      const privateKey = await this.readPrivateKey();
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

  async walk(client, dir, pages, root) {
    let entries;
    try {
      entries = await client.list(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (isHiddenStorageSegment(entry.name)) continue;
      const fullPath = `${dir}/${entry.name}`;
      if (entry.type === "d") {
        await this.walk(client, fullPath, pages, root);
        continue;
      }
      if (isAllowedPage(entry.name)) {
        const relativePath = fullPath.slice(root.length + 1);
        pages.push(relativePath.split("\\").join("/"));
      }
    }
  }

  async listPages() {
    const pages = [];
    await this.withClient(async (client) => {
      await this.walk(client, this.remoteRoot, pages, this.remoteRoot);
    });
    pages.sort();
    return pages;
  }

  async listDrafts() {
    const pages = [];
    const draftRoot = `${this.remoteRoot}/${DRAFTS_SEGMENT}`;
    await this.withClient(async (client) => {
      await this.walk(client, draftRoot, pages, draftRoot);
    });
    pages.sort();
    return pages;
  }

  async hasDraft(relativePath) {
    const remote = this.draftRemotePath(relativePath);
    return await this.withClient(async (client) => {
      return Boolean(await client.exists(remote));
    });
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

  async readDraft(relativePath) {
    const remote = this.draftRemotePath(relativePath);
    return await this.withClient(async (client) => {
      const exists = await client.exists(remote);
      if (!exists) {
        throw new PathError("Draft not found", 404);
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

  async readAsset(relativePath) {
    const remote = this.assetRemotePath(relativePath);
    return await this.withClient(async (client) => {
      const exists = await client.exists(remote);
      if (!exists) {
        throw new PathError("Asset not found", 404);
      }
      const buffer = await client.get(remote);
      if (Buffer.isBuffer(buffer)) {
        return buffer;
      }
      if (typeof buffer === "string") {
        return Buffer.from(buffer, "utf8");
      }
      throw new Error("Unexpected SFTP response type");
    });
  }

  async writeDraft(relativePath, html) {
    const normalized = normalizePagePath(relativePath);
    const remote = this.draftRemotePath(normalized);
    await this.withClient(async (client) => {
      await client.mkdir(dirname(remote), true);
      await client.put(Buffer.from(html, "utf8"), remote);
    });
    return normalized;
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

  async publishDraft(relativePath) {
    const normalized = normalizePagePath(relativePath);
    const html = await this.readDraft(normalized);
    await this.writePage(normalized, html);
    await this.discardDraft(normalized);
    return normalized;
  }

  async discardDraft(relativePath) {
    const remote = this.draftRemotePath(relativePath);
    await this.withClient(async (client) => {
      const exists = await client.exists(remote);
      if (!exists) {
        throw new PathError("Draft not found", 404);
      }
      await client.delete(remote);
    });
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
