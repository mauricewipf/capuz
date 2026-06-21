import { PathError } from "./paths.ts";

export function handlePathError(error: unknown): { message: string; status: number } {
  if (error instanceof PathError) {
    return { message: error.message, status: error.status };
  }
  throw error;
}
