import { PathError } from "./paths.js";

export function handlePathError(error) {
  if (error instanceof PathError) {
    return { message: error.message, status: error.status };
  }
  if (error instanceof Error) {
    return { message: error.message, status: 500 };
  }
  throw error;
}
