import { getDataRoot, getDraftsDirName, getPreviewBaseUrl, getPreviewHost } from "./paths.js";
import { VERSION } from "./version.js";

function envOrNull(name) {
  const value = process.env[name]?.trim();
  return value || null;
}

export function getStatusInfo() {
  return {
    ok: true,
    version: VERSION,
    commit: envOrNull("COMMIT_SHA"),
    builtAt: envOrNull("BUILD_TIME"),
    storageBackend: (process.env.STORAGE_BACKEND || "fs").trim().toLowerCase(),
    dataRoot: getDataRoot(),
    draftsDir: getDraftsDirName(),
    previewHost: getPreviewHost(),
    previewBaseUrl: getPreviewBaseUrl(),
    apiPort: Number(process.env.API_PORT || 3000),
    uptimeSeconds: Math.floor(process.uptime()),
    runtime: {
      name: "bun",
      version: typeof Bun !== "undefined" ? Bun.version : process.versions.bun,
    },
  };
}
