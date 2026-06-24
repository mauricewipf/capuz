import { buildPreviewUrl } from "./paths.js";

export function getScreenshotRendererUrl() {
  return (process.env.SCREENSHOT_RENDERER_URL || "").trim();
}

export async function renderPreviewScreenshot(storage, path) {
  const rendererUrl = getScreenshotRendererUrl();
  if (!rendererUrl) {
    throw new Error(
      "Screenshot rendering is disabled. Set SCREENSHOT_RENDERER_URL to a service that accepts { url } and returns PNG bytes.",
    );
  }

  const previewUrl = buildPreviewUrl(path);
  const response = await fetch(rendererUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: previewUrl }),
  });

  if (!response.ok) {
    throw new Error(`Screenshot renderer failed: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") || "image/png";
  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    path,
    previewUrl,
    contentType,
    contentBase64: buffer.toString("base64"),
    size: buffer.length,
  };
}
