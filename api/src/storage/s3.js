import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { normalizePagePath, PathError } from "../paths.js";

const ALLOWED_EXTENSIONS = [".html", ".xml"];

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required when STORAGE_BACKEND=s3`);
  }
  return value;
}

function isAllowedPage(key) {
  const lower = key.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function contentTypeForPath(path) {
  return path.toLowerCase().endsWith(".xml")
    ? "application/xml; charset=utf-8"
    : "text/html; charset=utf-8";
}

async function streamToString(body) {
  if (!body) return "";
  if (typeof body === "string") return body;
  if (body instanceof Uint8Array) return new TextDecoder().decode(body);
  if (typeof body.transformToString === "function") {
    return await body.transformToString();
  }

  const chunks = [];
  for await (const chunk of body) {
    chunks.push(chunk);
  }
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(merged);
}

export class S3Storage {
  bucket = requireEnv("S3_BUCKET");
  prefix = (process.env.S3_KEY_PREFIX || "")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
  publicUrl = (process.env.S3_PUBLIC_URL || "").replace(/\/+$/, "");
  cacheControl = process.env.S3_CACHE_CONTROL?.trim() || "public, max-age=60";

  constructor() {
    const endpoint = process.env.S3_ENDPOINT?.trim();
    const region = process.env.S3_REGION?.trim() || "auto";
    this.client = new S3Client({
      region,
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
      credentials: {
        accessKeyId: requireEnv("S3_ACCESS_KEY_ID"),
        secretAccessKey: requireEnv("S3_SECRET_ACCESS_KEY"),
      },
    });
  }

  objectKey(relativePath) {
    const normalized = normalizePagePath(relativePath);
    return this.prefix ? `${this.prefix}/${normalized}` : normalized;
  }

  publicPath(relativePath) {
    const normalized = normalizePagePath(relativePath);
    if (!this.publicUrl) return normalized;
    return `${this.publicUrl}/${normalized}`;
  }

  async listPages() {
    const pages = [];
    let continuationToken;

    do {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: this.prefix ? `${this.prefix}/` : undefined,
          ContinuationToken: continuationToken,
        }),
      );

      for (const item of response.Contents || []) {
        if (!item.Key) continue;
        const key = this.prefix ? item.Key.slice(this.prefix.length + 1) : item.Key;
        if (key && isAllowedPage(key)) {
          pages.push(key);
        }
      }

      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);

    pages.sort();
    return pages;
  }

  async readPage(relativePath) {
    const key = this.objectKey(relativePath);
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      return await streamToString(response.Body);
    } catch (error) {
      const name =
        typeof error === "object" && error !== null && "name" in error
          ? String(error.name)
          : "";
      if (name === "NoSuchKey" || name === "NotFound") {
        throw new PathError("Page not found", 404);
      }
      throw error;
    }
  }

  async writePage(relativePath, html) {
    const normalized = normalizePagePath(relativePath);
    const key = this.objectKey(normalized);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: html,
        ContentType: contentTypeForPath(normalized),
        CacheControl: this.cacheControl,
      }),
    );
    return this.publicUrl ? this.publicPath(normalized) : normalized;
  }

  async deletePage(relativePath) {
    const key = this.objectKey(relativePath);
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
    } catch (error) {
      const name =
        typeof error === "object" && error !== null && "name" in error
          ? String(error.name)
          : "";
      if (name === "NoSuchKey" || name === "NotFound") {
        throw new PathError("Page not found", 404);
      }
      throw error;
    }
  }
}
