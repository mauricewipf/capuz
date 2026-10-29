import { PathError } from "./paths.js";

/**
 * Filesystem/network errno messages embed absolute server paths and host
 * details, so they are replaced rather than forwarded to clients.
 */
const ERRNO_RESPONSES = {
  ENAMETOOLONG: { message: "Path is too long", status: 400 },
  ENOENT: { message: "Not found", status: 404 },
  EISDIR: { message: "Path is a directory", status: 400 },
  ENOTDIR: { message: "Path is not a directory", status: 400 },
  EEXIST: { message: "Path already exists", status: 409 },
  EACCES: { message: "Storage permission denied", status: 500 },
  EPERM: { message: "Storage permission denied", status: 500 },
  ENOSPC: { message: "Storage is full", status: 500 },
  EROFS: { message: "Storage is read-only", status: 500 },
};

export function handlePathError(error) {
  if (error instanceof PathError) {
    return { message: error.message, status: error.status };
  }
  if (error instanceof Error) {
    const errno = typeof error.code === "string" ? ERRNO_RESPONSES[error.code] : undefined;
    if (errno) {
      return { ...errno };
    }
    if (typeof error.code === "string" && /^E[A-Z]+$/.test(error.code)) {
      return { message: "Storage error", status: 500 };
    }
    return { message: error.message, status: 500 };
  }
  throw error;
}
