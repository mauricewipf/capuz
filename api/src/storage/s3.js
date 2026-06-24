import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  getComponentsDirName,
  getDraftsDirName,
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
    throw new Error(`${name} is required when STORAGE_BACKEND=s3`);
  }
  return value;
}

function isAllowedPage(key) {
  const lower = key.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function isDraftKey(key) {
  const segment = `/${DRAFTS_SEGMENT}/`;
  return key.includes(segment) || key.startsWith(`${DRAFTS_SEGMENT}/`);
}

function isComponentKey(key) {
  const segment = `/${COMPONENTS_SEGMENT}/`;
  return key.includes(segment) || key.startsWith(`${COMPONENTS_SEGMENT}/`);
}

function isPageKey(key) {
  return isAllowedPage(key) && !isDraftKey(key) && !isComponentKey(key);
}

function contentTypeForPath(path) {
  const lower = path.toLowerCase();
  if (lower.endsWith(".xml")) return "application/xml; charset=utf-8";
  if (lower.endsWith(".html")) return "text/html; charset=utf-8";
  if (lower.endsWith(".css")) return "text/css; charset=utf-8";
  if (lower.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (lower.endsWith(".json")) return "application/json; charset=utf-8";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".ico")) return "image/x-icon";
  if (lower.endsWith(".woff2")) return "font/woff2";
  if (lower.endsWith(".woff")) return "font/woff";
  return "application/octet-stream";
}

async function streamToBuffer(body) {
  if (!body) return Buffer.alloc(0);
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (typeof body.transformToByteArray === "function") {
    return Buffer.from(await body.transformToByteArray());
  }

  const chunks = [];
  for await (const chunk of body) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function streamToString(body) {
  const buffer = await streamToBuffer(body);
  return buffer.toString("utf8");
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

  draftObjectKey(relativePath) {
    const normalized = normalizePagePath(relativePath);
    const draftPath = `${DRAFTS_SEGMENT}/${normalized}`;
    return this.prefix ? `${this.prefix}/${draftPath}` : draftPath;
  }

  componentObjectKey(name) {
    const normalized = normalizeComponentName(name);
    const componentPath = `${COMPONENTS_SEGMENT}/${normalized}.html`;
    return this.prefix ? `${this.prefix}/${componentPath}` : componentPath;
  }

  assetObjectKey(relativePath) {
    const normalized = normalizeAssetPath(relativePath);
    return this.prefix ? `${this.prefix}/${normalized}` : normalized;
  }

  relativeFromKey(key) {
    return this.prefix ? key.slice(this.prefix.length + 1) : key;
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
        const key = this.relativeFromKey(item.Key);
        if (!key || isDraftKey(key) || isComponentKey(key)) continue;
        if (isAllowedPage(key)) {
          pages.push(key);
        }
      }

      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);

    pages.sort();
    return pages;
  }

  async listDrafts() {
    const pages = [];
    const draftPrefix = this.prefix
      ? `${this.prefix}/${DRAFTS_SEGMENT}/`
      : `${DRAFTS_SEGMENT}/`;
    let continuationToken;

    do {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: draftPrefix,
          ContinuationToken: continuationToken,
        }),
      );

      for (const item of response.Contents || []) {
        if (!item.Key) continue;
        const key = this.relativeFromKey(item.Key);
        const pagePath = key.startsWith(`${DRAFTS_SEGMENT}/`)
          ? key.slice(DRAFTS_SEGMENT.length + 1)
          : key;
        if (pagePath && isAllowedPage(pagePath)) {
          pages.push(pagePath);
        }
      }

      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);

    pages.sort();
    return pages;
  }

  async listAssets(prefix = "") {
    const assets = [];
    const searchPrefix = this.prefix
      ? `${this.prefix}/${prefix.replace(/^\/+/, "")}`
      : prefix.replace(/^\/+/, "");
    let continuationToken;

    do {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: searchPrefix || (this.prefix ? `${this.prefix}/` : undefined),
          ContinuationToken: continuationToken,
        }),
      );

      for (const item of response.Contents || []) {
        if (!item.Key) continue;
        const key = this.relativeFromKey(item.Key);
        if (!key || isDraftKey(key) || isComponentKey(key) || isPageKey(key)) continue;
        assets.push(key);
      }

      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);

    assets.sort();
    return assets;
  }

  async listComponents() {
    const components = [];
    const componentPrefix = this.prefix
      ? `${this.prefix}/${COMPONENTS_SEGMENT}/`
      : `${COMPONENTS_SEGMENT}/`;
    let continuationToken;

    do {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: componentPrefix,
          ContinuationToken: continuationToken,
        }),
      );

      for (const item of response.Contents || []) {
        if (!item.Key) continue;
        const key = this.relativeFromKey(item.Key);
        const pagePath = key.startsWith(`${COMPONENTS_SEGMENT}/`)
          ? key.slice(COMPONENTS_SEGMENT.length + 1)
          : key;
        if (pagePath.endsWith(".html")) {
          components.push(pagePath.slice(0, -".html".length));
        }
      }

      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);

    components.sort();
    return components;
  }

  async hasDraft(relativePath) {
    const key = this.draftObjectKey(relativePath);
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      return true;
    } catch (error) {
      const name =
        typeof error === "object" && error !== null && "name" in error
          ? String(error.name)
          : "";
      if (name === "NotFound" || name === "NoSuchKey") return false;
      throw error;
    }
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

  async readDraft(relativePath) {
    const key = this.draftObjectKey(relativePath);
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
        throw new PathError("Draft not found", 404);
      }
      throw error;
    }
  }

  async readAsset(relativePath) {
    const key = this.assetObjectKey(relativePath);
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      return await streamToBuffer(response.Body);
    } catch (error) {
      const name =
        typeof error === "object" && error !== null && "name" in error
          ? String(error.name)
          : "";
      if (name === "NoSuchKey" || name === "NotFound") {
        throw new PathError("Asset not found", 404);
      }
      throw error;
    }
  }

  async readComponent(name) {
    const key = this.componentObjectKey(name);
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      return await streamToString(response.Body);
    } catch (error) {
      const nameErr =
        typeof error === "object" && error !== null && "name" in error
          ? String(error.name)
          : "";
      if (nameErr === "NoSuchKey" || nameErr === "NotFound") {
        throw new PathError("Component not found", 404);
      }
      throw error;
    }
  }

  async writeDraft(relativePath, html) {
    const normalized = normalizePagePath(relativePath);
    const key = this.draftObjectKey(normalized);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: html,
        ContentType: contentTypeForPath(normalized),
        CacheControl: "private, no-store",
      }),
    );
    return normalized;
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

  async writeComponent(name, html) {
    const normalized = normalizeComponentName(name);
    const key = this.componentObjectKey(normalized);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: html,
        ContentType: "text/html; charset=utf-8",
        CacheControl: "private, no-store",
      }),
    );
    return normalized;
  }

  async writeAsset(relativePath, buffer) {
    const normalized = normalizeAssetPath(relativePath);
    const key = this.assetObjectKey(normalized);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentTypeForPath(normalized),
        CacheControl: this.cacheControl,
      }),
    );
    return normalized;
  }

  async publishDraft(relativePath) {
    const normalized = normalizePagePath(relativePath);
    const draftKey = this.draftObjectKey(normalized);
    const liveKey = this.objectKey(normalized);

    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${draftKey}`,
        Key: liveKey,
        ContentType: contentTypeForPath(normalized),
        CacheControl: this.cacheControl,
        MetadataDirective: "REPLACE",
      }),
    );

    await this.discardDraft(normalized);
    return this.publicUrl ? this.publicPath(normalized) : normalized;
  }

  async discardDraft(relativePath) {
    const key = this.draftObjectKey(relativePath);
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
        throw new PathError("Draft not found", 404);
      }
      throw error;
    }
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

  async deleteComponent(name) {
    const key = this.componentObjectKey(name);
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
    } catch (error) {
      const nameErr =
        typeof error === "object" && error !== null && "name" in error
          ? String(error.name)
          : "";
      if (nameErr === "NoSuchKey" || nameErr === "NotFound") {
        throw new PathError("Component not found", 404);
      }
      throw error;
    }
  }

  async deleteAsset(relativePath) {
    const key = this.assetObjectKey(relativePath);
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
    } catch (error) {
      const nameErr =
        typeof error === "object" && error !== null && "name" in error
          ? String(error.name)
          : "";
      if (nameErr === "NoSuchKey" || nameErr === "NotFound") {
        throw new PathError("Asset not found", 404);
      }
      throw error;
    }
  }
}
