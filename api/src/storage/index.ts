import { FsStorage } from "./fs.ts";
import { GitStorage } from "./git.ts";
import { S3Storage } from "./s3.ts";
import { SftpStorage } from "./sftp.ts";
import type { Storage } from "./types.ts";

let storageInstance: Storage | null = null;

export function createStorage(): Storage {
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

export function getStorage(): Storage {
  if (!storageInstance) {
    storageInstance = createStorage();
  }
  return storageInstance;
}

export type { Storage } from "./types.ts";
