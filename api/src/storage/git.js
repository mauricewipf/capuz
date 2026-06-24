import git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import fs from "node:fs";
import { readFile, writeFile, unlink, mkdir, access } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import {
  getComponentsDirName,
  getDraftsDirName,
  isSkippedStorageSegment,
  normalizeAssetPath,
  normalizeComponentName,
  normalizePagePath,
  PathError,
} from "../paths.js";

const ALLOWED_EXTENSIONS = [".html", ".xml"];
const DRAFTS_SEGMENT = getDraftsDirName();
const COMPONENTS_SEGMENT = getComponentsDirName();

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required when STORAGE_BACKEND=git`);
  }
  return value;
}

async function pathExists(path) {
  try {
    await fs.promises.stat(path);
    return true;
  } catch {
    return false;
  }
}

async function walk(dir, pages, root) {
  let entries;
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (isSkippedStorageSegment(entry.name)) continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, pages, root);
      continue;
    }
    const lower = entry.name.toLowerCase();
    if (ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
      pages.push(relative(root, fullPath).split("\\").join("/"));
    }
  }
}

async function walkAssets(dir, assets, root) {
  let entries;
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (isSkippedStorageSegment(entry.name)) continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkAssets(fullPath, assets, root);
      continue;
    }
    assets.push(relative(root, fullPath).split("\\").join("/"));
  }
}

async function walkComponents(dir, components, root) {
  let entries;
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkComponents(fullPath, components, root);
      continue;
    }
    if (entry.name.toLowerCase().endsWith(".html")) {
      const rel = relative(root, fullPath).split("\\").join("/");
      components.push(rel.replace(/\.html$/i, ""));
    }
  }
}

function isEnoent(err) {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    err.code === "ENOENT"
  );
}

export class GitStorage {
  remote = requireEnv("GIT_REMOTE");
  branch = process.env.GIT_BRANCH?.trim() || "main";
  cloneDir = process.env.GIT_CLONE_DIR?.trim() || "/app/repo";
  authorName = requireEnv("GIT_AUTHOR_NAME");
  authorEmail = requireEnv("GIT_AUTHOR_EMAIL");
  keyPath = requireEnv("GIT_KEY_PATH");
  initPromise = null;
  privateKey = null;

  draftsRoot() {
    return join(this.cloneDir, DRAFTS_SEGMENT);
  }

  componentsRoot() {
    return join(this.cloneDir, COMPONENTS_SEGMENT);
  }

  async getPrivateKey() {
    if (!this.privateKey) {
      this.privateKey = await readFile(this.keyPath, "utf8");
    }
    return this.privateKey;
  }

  async ensureRepo() {
    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = (async () => {
      const privateKey = await this.getPrivateKey();
      const gitDir = join(this.cloneDir, ".git");
      const hasRepo = await pathExists(gitDir);

      if (!hasRepo) {
        await mkdir(this.cloneDir, { recursive: true });
        await git.clone({
          fs,
          http,
          dir: this.cloneDir,
          url: this.remote,
          ref: this.branch,
          singleBranch: true,
          depth: 1,
          onAuth: () => ({ privateKey }),
        });
        return;
      }

      await git.fetch({
        fs,
        http,
        dir: this.cloneDir,
        ref: this.branch,
        singleBranch: true,
        onAuth: () => ({ privateKey }),
      });
      await git.checkout({
        fs,
        dir: this.cloneDir,
        ref: this.branch,
        force: true,
      });
    })();

    await this.initPromise;
  }

  absolutePath(relativePath) {
    const normalized = normalizePagePath(relativePath);
    return join(this.cloneDir, normalized);
  }

  draftAbsolutePath(relativePath) {
    const normalized = normalizePagePath(relativePath);
    return join(this.draftsRoot(), normalized);
  }

  componentAbsolutePath(name) {
    const normalized = normalizeComponentName(name);
    return join(this.componentsRoot(), `${normalized}.html`);
  }

  assetAbsolutePath(relativePath) {
    const normalized = normalizeAssetPath(relativePath);
    return join(this.cloneDir, normalized);
  }

  async listPages() {
    await this.ensureRepo();
    const pages = [];
    await walk(this.cloneDir, pages, this.cloneDir);
    pages.sort();
    return pages;
  }

  async listDrafts() {
    await this.ensureRepo();
    const pages = [];
    await walk(this.draftsRoot(), pages, this.draftsRoot());
    pages.sort();
    return pages;
  }

  async listAssets(prefix = "") {
    await this.ensureRepo();
    const assets = [];
    await walkAssets(this.cloneDir, assets, this.cloneDir);
    const cleaned = prefix.replace(/^\/+/, "");
    return assets.filter((path) => !cleaned || path.startsWith(cleaned)).sort();
  }

  async listComponents() {
    await this.ensureRepo();
    const components = [];
    await walkComponents(this.componentsRoot(), components, this.componentsRoot());
    components.sort();
    return components;
  }

  async hasDraft(relativePath) {
    const absolute = this.draftAbsolutePath(relativePath);
    try {
      await access(absolute);
      return true;
    } catch (err) {
      if (isEnoent(err)) return false;
      throw err;
    }
  }

  async readPage(relativePath) {
    await this.ensureRepo();
    const absolute = this.absolutePath(relativePath);
    try {
      return await readFile(absolute, "utf8");
    } catch (err) {
      if (isEnoent(err)) {
        throw new PathError("Page not found", 404);
      }
      throw err;
    }
  }

  async readDraft(relativePath) {
    await this.ensureRepo();
    const absolute = this.draftAbsolutePath(relativePath);
    try {
      return await readFile(absolute, "utf8");
    } catch (err) {
      if (isEnoent(err)) {
        throw new PathError("Draft not found", 404);
      }
      throw err;
    }
  }

  async readAsset(relativePath) {
    await this.ensureRepo();
    const absolute = this.assetAbsolutePath(relativePath);
    try {
      return await readFile(absolute);
    } catch (err) {
      if (isEnoent(err)) {
        throw new PathError("Asset not found", 404);
      }
      throw err;
    }
  }

  async readComponent(name) {
    await this.ensureRepo();
    const absolute = this.componentAbsolutePath(name);
    try {
      return await readFile(absolute, "utf8");
    } catch (err) {
      if (isEnoent(err)) {
        throw new PathError("Component not found", 404);
      }
      throw err;
    }
  }

  async writeDraft(relativePath, html) {
    await this.ensureRepo();
    const normalized = normalizePagePath(relativePath);
    const absolute = this.draftAbsolutePath(normalized);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, html, "utf8");
    return normalized;
  }

  async commitAndPush(normalized, message) {
    const privateKey = await this.getPrivateKey();
    await git.add({ fs, dir: this.cloneDir, filepath: normalized });
    const sha = await git.commit({
      fs,
      dir: this.cloneDir,
      message,
      author: {
        name: this.authorName,
        email: this.authorEmail,
      },
    });

    try {
      await git.push({
        fs,
        http,
        dir: this.cloneDir,
        remote: "origin",
        ref: this.branch,
        onAuth: () => ({ privateKey }),
      });
    } catch {
      await git.pull({
        fs,
        http,
        dir: this.cloneDir,
        ref: this.branch,
        singleBranch: true,
        author: {
          name: this.authorName,
          email: this.authorEmail,
        },
        onAuth: () => ({ privateKey }),
      });
      await git.push({
        fs,
        http,
        dir: this.cloneDir,
        remote: "origin",
        ref: this.branch,
        onAuth: () => ({ privateKey }),
      });
    }

    return sha;
  }

  async writePage(relativePath, html) {
    await this.ensureRepo();
    const normalized = normalizePagePath(relativePath);
    const absolute = join(this.cloneDir, normalized);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, html, "utf8");

    const sha = await this.commitAndPush(normalized, `Update ${normalized}`);
    return `${normalized} (commit ${sha.slice(0, 7)}; deploy typically live in ~30s)`;
  }

  async writeComponent(name, html) {
    await this.ensureRepo();
    const normalized = normalizeComponentName(name);
    const absolute = this.componentAbsolutePath(normalized);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, html, "utf8");
    return normalized;
  }

  async writeAsset(relativePath, buffer) {
    await this.ensureRepo();
    const normalized = normalizeAssetPath(relativePath);
    const absolute = this.assetAbsolutePath(normalized);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, buffer);
    return normalized;
  }

  async publishDraft(relativePath) {
    const normalized = normalizePagePath(relativePath);
    const html = await this.readDraft(normalized);
    const result = await this.writePage(normalized, html);
    await this.discardDraft(normalized);
    return result;
  }

  async discardDraft(relativePath) {
    const absolute = this.draftAbsolutePath(relativePath);
    try {
      await unlink(absolute);
    } catch (err) {
      if (isEnoent(err)) {
        throw new PathError("Draft not found", 404);
      }
      throw err;
    }
  }

  async deletePage(relativePath) {
    await this.ensureRepo();
    const normalized = normalizePagePath(relativePath);
    const absolute = join(this.cloneDir, normalized);
    try {
      await unlink(absolute);
    } catch (err) {
      if (isEnoent(err)) {
        throw new PathError("Page not found", 404);
      }
      throw err;
    }

    const privateKey = await this.getPrivateKey();
    await git.remove({ fs, dir: this.cloneDir, filepath: normalized });
    await git.commit({
      fs,
      dir: this.cloneDir,
      message: `Delete ${normalized}`,
      author: {
        name: this.authorName,
        email: this.authorEmail,
      },
    });
    await git.push({
      fs,
      http,
      dir: this.cloneDir,
      remote: "origin",
      ref: this.branch,
      onAuth: () => ({ privateKey }),
    });
  }

  async deleteComponent(name) {
    const absolute = this.componentAbsolutePath(name);
    try {
      await unlink(absolute);
    } catch (err) {
      if (isEnoent(err)) {
        throw new PathError("Component not found", 404);
      }
      throw err;
    }
  }

  async deleteAsset(relativePath) {
    const absolute = this.assetAbsolutePath(relativePath);
    try {
      await unlink(absolute);
    } catch (err) {
      if (isEnoent(err)) {
        throw new PathError("Asset not found", 404);
      }
      throw err;
    }
  }
}
