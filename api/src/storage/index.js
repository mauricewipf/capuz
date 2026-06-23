import { FsStorage } from "./fs.js";
import { GitStorage } from "./git.js";
import { S3Storage } from "./s3.js";
import { SftpStorage } from "./sftp.js";

let storageInstance = null;

export function createStorage() {
  const backend = (process.env.STORAGE_BACKEND || "fs").trim().toLowerCase();

  switch (backend) {
    case "fs":
      return new FsStorage();
    case "sftp":
      return new SftpStorage();
    case "git":
      return new GitStorage();
    case "s3":
      return new S3Storage();
    default:
      throw new Error(
        `Unknown STORAGE_BACKEND "${backend}". Supported values: fs, sftp, git, s3`,
      );
  }
}

export function getStorage() {
  if (!storageInstance) {
    storageInstance = createStorage();
  }
  return storageInstance;
}

export async function listPagesWithStatus(storage) {
  const [published, drafts] = await Promise.all([
    storage.listPages(),
    storage.listDrafts(),
  ]);
  const publishedSet = new Set(published);
  const draftSet = new Set(drafts);
  const allPaths = new Set([...published, ...drafts]);

  const pages = [...allPaths]
    .sort()
    .map((path) => {
      const hasPublished = publishedSet.has(path);
      const hasDraft = draftSet.has(path);
      let status = "published";
      if (hasDraft && hasPublished) {
        status = "modified";
      } else if (hasDraft) {
        status = "draft";
      }
      return { path, status };
    });

  return pages;
}
