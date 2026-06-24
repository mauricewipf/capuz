import { extractLinks } from "./html.js";
import { normalizePagePath } from "./paths.js";

let linkGraphCache = null;
let linkGraphBuiltAt = 0;
const CACHE_TTL_MS = 30_000;

function isInternalHref(href) {
  return (
    !href.startsWith("http://") &&
    !href.startsWith("https://") &&
    !href.startsWith("//") &&
    !href.startsWith("data:")
  );
}

function resolveInternalTarget(href) {
  const cleaned = href.split("#")[0].split("?")[0].replace(/^\/+/, "");
  if (!cleaned) return "index.html";
  if (cleaned.endsWith(".html") || cleaned.endsWith(".xml")) return cleaned;
  if (cleaned.endsWith("/")) return `${cleaned}index.html`;
  return `${cleaned}.html`;
}

export async function buildLinkGraph(storage) {
  const now = Date.now();
  if (linkGraphCache && now - linkGraphBuiltAt < CACHE_TTL_MS) {
    return linkGraphCache;
  }

  const pages = await storage.listPages();
  const pageSet = new Set(pages);
  const edges = [];
  const inbound = new Map();

  for (const path of pages) {
    const html = await storage.readPage(path);
    for (const link of extractLinks(html, path)) {
      if (!isInternalHref(link.href)) continue;
      const target = resolveInternalTarget(link.href);
      edges.push({ from: path, to: target, href: link.href, kind: link.kind || "page" });
      const refs = inbound.get(target) || [];
      refs.push({ from: path, href: link.href });
      inbound.set(target, refs);
    }
  }

  linkGraphCache = { pages: [...pageSet], edges, inbound, pageSet };
  linkGraphBuiltAt = now;
  return linkGraphCache;
}

export function invalidateLinkGraph() {
  linkGraphCache = null;
  linkGraphBuiltAt = 0;
}

export async function checkLinks(storage) {
  const graph = await buildLinkGraph(storage);
  const broken = [];
  const assets = typeof storage.listAssets === "function" ? new Set(await storage.listAssets()) : null;

  for (const edge of graph.edges) {
    if (edge.kind === "asset") {
      if (!assets) continue;
      const assetPath = edge.href.replace(/^\/+/, "");
      if (!assets.has(assetPath)) {
        broken.push({ ...edge, reason: "missing asset" });
      }
      continue;
    }

    if (!graph.pageSet.has(edge.to)) {
      broken.push({ ...edge, reason: "missing page" });
    }
  }

  return { brokenCount: broken.length, broken };
}

export async function getInboundLinks(storage, targetPath) {
  const normalized = normalizePagePath(targetPath);
  const graph = await buildLinkGraph(storage);
  return graph.inbound.get(normalized) || [];
}

export async function warnInboundLinks(storage, targetPath) {
  const refs = await getInboundLinks(storage, targetPath);
  if (!refs.length) return null;
  return {
    path: targetPath,
    inboundCount: refs.length,
    inbound: refs,
    warning: `${refs.length} page(s) link to ${targetPath}`,
  };
}
