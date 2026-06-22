import git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import fs from "node:fs";
import { readFile, writeFile, unlink, mkdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { normalizePagePath, PathError } from "../paths.js";

const ALLOWED_EXTENSIONS = [".html", ".xml"];

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
    if (entry.name.startsWith(".")) continue;
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

  async listPages() {
    await this.ensureRepo();
    const pages = [];
    await walk(this.cloneDir, pages, this.cloneDir);
    pages.sort();
    return pages;
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

  async writePage(relativePath, html) {
    await this.ensureRepo();
    const normalized = normalizePagePath(relativePath);
    const absolute = join(this.cloneDir, normalized);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, html, "utf8");

    const privateKey = await this.getPrivateKey();
    await git.add({ fs, dir: this.cloneDir, filepath: normalized });
    const sha = await git.commit({
      fs,
      dir: this.cloneDir,
      message: `Update ${normalized}`,
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

    return `${normalized} (commit ${sha.slice(0, 7)}; deploy typically live in ~30s)`;
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
}
