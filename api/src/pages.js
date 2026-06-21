import { PathError } from "./paths.js";

export function handlePathError(error) {
  if (error instanceof PathError) {
    return { message: error.message, status: error.status };
  }
  throw error;
}
