import git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import fs from "node:fs";
import { readFile, writeFile, unlink, mkdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { normalizePagePath, PathError } from "../paths.ts";
import type { Storage } from "./types.ts";

const ALLOWED_EXTENSIONS = [".html", ".xml"];

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required when STORAGE_BACKEND=git`);
  }
  return value;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await fs.promises.stat(path);
    return true;
  } catch {
    return false;
  }
}

async function walk(dir: string, pages: string[], root: string): Promise<void> {
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

function isEnoent(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as NodeJS.ErrnoException).code === "ENOENT"
  );
}

export class GitStorage implements Storage {
  private readonly remote = requireEnv("GIT_REMOTE");
  private readonly branch = process.env.GIT_BRANCH?.trim() || "main";
  private readonly cloneDir = process.env.GIT_CLONE_DIR?.trim() || "/app/repo";
  private readonly authorName = process.env.GIT_AUTHOR_NAME?.trim() || "Capuzzella CMS";
  private readonly authorEmail =
    process.env.GIT_AUTHOR_EMAIL?.trim() || "cms@capuzzella.local";
  private readonly keyPath = requireEnv("GIT_KEY_PATH");
  private initPromise: Promise<void> | null = null;
  private privateKey: string | null = null;

  private async getPrivateKey(): Promise<string> {
    if (!this.privateKey) {
      this.privateKey = await readFile(this.keyPath, "utf8");
    }
    return this.privateKey;
  }

  private async ensureRepo(): Promise<void> {
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

  private absolutePath(relativePath: string): string {
    const normalized = normalizePagePath(relativePath);
    return join(this.cloneDir, normalized);
  }

  async listPages(): Promise<string[]> {
    await this.ensureRepo();
    const pages: string[] = [];
    await walk(this.cloneDir, pages, this.cloneDir);
    pages.sort();
    return pages;
  }

  async readPage(relativePath: string): Promise<string> {
    await this.ensureRepo();
    const absolute = this.absolutePath(relativePath);
    try {
      return await readFile(absolute, "utf8");
    } catch (err: unknown) {
      if (isEnoent(err)) {
        throw new PathError("Page not found", 404);
      }
      throw err;
    }
  }

  async writePage(relativePath: string, html: string): Promise<string> {
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

  async deletePage(relativePath: string): Promise<void> {
    await this.ensureRepo();
    const normalized = normalizePagePath(relativePath);
    const absolute = join(this.cloneDir, normalized);
    try {
      await unlink(absolute);
    } catch (err: unknown) {
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
