import { createHash } from "node:crypto";
import { parse } from "node-html-parser";

const SIGNIFICANT_TAGS = new Set([
  "nav",
  "header",
  "footer",
  "main",
  "section",
  "article",
  "aside",
  "form",
  "button",
  "a",
]);

export function parseHtmlDocument(html) {
  return parse(html, {
    lowerCaseTagName: true,
    comment: false,
  });
}

export function extractPageMeta(html) {
  const doc = parseHtmlDocument(html);
  const title = doc.querySelector("title")?.text?.trim() || "";
  const description =
    doc.querySelector('meta[name="description"]')?.getAttribute("content")?.trim() ||
    "";
  const canonical =
    doc.querySelector('link[rel="canonical"]')?.getAttribute("href")?.trim() || "";
  const ogTitle =
    doc.querySelector('meta[property="og:title"]')?.getAttribute("content")?.trim() ||
    "";
  const ogDescription =
    doc
      .querySelector('meta[property="og:description"]')
      ?.getAttribute("content")
      ?.trim() || "";
  const ogImage =
    doc.querySelector('meta[property="og:image"]')?.getAttribute("content")?.trim() ||
    "";
  const twitterCard =
    doc
      .querySelector('meta[name="twitter:card"]')
      ?.getAttribute("content")
      ?.trim() || "";
  const jsonLd = doc
    .querySelectorAll('script[type="application/ld+json"]')
    .map((node) => node.text?.trim())
    .filter(Boolean);

  const headings = doc
    .querySelectorAll("h1, h2, h3, h4, h5, h6")
    .map((node) => ({
      tag: node.tagName?.toLowerCase() || "",
      text: node.text?.trim() || "",
    }))
    .filter((item) => item.text);

  return {
    title,
    description,
    canonical,
    ogTitle,
    ogDescription,
    ogImage,
    twitterCard,
    jsonLd,
    headings,
  };
}

export function extractLinks(html, pagePath = "") {
  const doc = parseHtmlDocument(html);
  const links = [];
  for (const node of doc.querySelectorAll("a[href]")) {
    const href = node.getAttribute("href")?.trim();
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
      continue;
    }
    links.push({ href, text: node.text?.trim() || "" });
  }
  for (const node of doc.querySelectorAll("img[src]")) {
    const href = node.getAttribute("src")?.trim();
    if (href) {
      links.push({ href, text: node.getAttribute("alt")?.trim() || "", kind: "asset" });
    }
  }
  for (const node of doc.querySelectorAll("link[href]")) {
    const href = node.getAttribute("href")?.trim();
    const rel = node.getAttribute("rel")?.trim() || "";
    if (href && (rel.includes("stylesheet") || rel.includes("icon"))) {
      links.push({ href, text: rel, kind: "asset" });
    }
  }
  for (const node of doc.querySelectorAll("script[src]")) {
    const href = node.getAttribute("src")?.trim();
    if (href) {
      links.push({ href, text: "script", kind: "asset" });
    }
  }
  return links.map((link) => ({ ...link, pagePath }));
}

export function extractComponentBlocks(html) {
  const doc = parseHtmlDocument(html);
  const blocks = [];
  for (const node of doc.querySelectorAll("[data-capuz-component]")) {
    blocks.push({
      name: node.getAttribute("data-capuz-component") || "",
      html: node.outerHTML,
    });
  }
  return blocks;
}

function normalizeStructure(node) {
  const tag = node.tagName?.toLowerCase() || "";
  const attrs = Object.entries(node.attributes || {})
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join("|");
  const childTags = (node.childNodes || [])
    .filter((child) => child.nodeType === 1)
    .map((child) => normalizeStructure(child));
  return `${tag}[${attrs}]{${childTags.join(",")}}`;
}

function hashStructure(node) {
  return createHash("sha256").update(normalizeStructure(node)).digest("hex").slice(0, 16);
}

function proposedComponentName(node) {
  const tag = node.tagName?.toLowerCase() || "block";
  const id = node.getAttribute("id");
  if (id) return id;
  const classes = (node.getAttribute("class") || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (classes.length) return `${tag}-${classes.join("-")}`;
  return tag;
}

function lineNumberForMatch(html, snippet) {
  const index = html.indexOf(snippet);
  if (index === -1) return null;
  return html.slice(0, index).split("\n").length;
}

export function clusterComponentCandidates(pagesWithHtml, options = {}) {
  const minMatches = options.minMatches ?? 2;
  const maxCandidates = options.maxCandidates ?? 20;
  const clusters = new Map();

  for (const { path, html } of pagesWithHtml) {
    const doc = parseHtmlDocument(html);
    const body = doc.querySelector("body");
    if (!body) continue;

    const candidates = [];
    for (const child of body.childNodes || []) {
      if (child.nodeType !== 1) continue;
      const tag = child.tagName?.toLowerCase() || "";
      if (!SIGNIFICANT_TAGS.has(tag) && child.outerHTML.length < 120) continue;
      candidates.push(child);
    }

    for (const node of candidates) {
      const hash = hashStructure(node);
      const outer = node.outerHTML.trim();
      if (!outer) continue;
      const entry = clusters.get(hash) || {
        hash,
        proposedName: proposedComponentName(node),
        representativeHtml: outer,
        matchCount: 0,
        examples: [],
      };
      entry.matchCount += 1;
      if (entry.examples.length < 5) {
        entry.examples.push({
          path,
          line: lineNumberForMatch(html, outer),
        });
      }
      clusters.set(hash, entry);
    }
  }

  return [...clusters.values()]
    .filter((item) => item.matchCount >= minMatches)
    .sort((a, b) => b.matchCount - a.matchCount)
    .slice(0, maxCandidates)
    .map((item) => ({
      proposedName: item.proposedName,
      representativeHtml: item.representativeHtml,
      matchCount: item.matchCount,
      similarityScore: Math.min(1, item.matchCount / pagesWithHtml.length),
      examples: item.examples,
    }));
}

export function auditSeo(html, pagePath) {
  const meta = extractPageMeta(html);
  const issues = [];
  const suggestions = [];

  if (!meta.title) {
    issues.push("Missing <title>");
  } else if (meta.title.length < 20 || meta.title.length > 70) {
    issues.push("Title length should be roughly 20-70 characters");
  }

  if (!meta.description) {
    issues.push("Missing meta description");
  } else if (meta.description.length < 50 || meta.description.length > 160) {
    issues.push("Meta description should be roughly 50-160 characters");
  }

  if (!meta.canonical) {
    suggestions.push("Add a canonical link");
  }
  if (!meta.ogTitle) suggestions.push("Add og:title");
  if (!meta.ogDescription) suggestions.push("Add og:description");
  if (!meta.ogImage) suggestions.push("Add og:image");
  if (!meta.twitterCard) suggestions.push("Add twitter:card");
  if (!meta.jsonLd.length) suggestions.push("Add JSON-LD structured data");

  const h1s = meta.headings.filter((item) => item.tag === "h1");
  if (h1s.length === 0) issues.push("Missing H1");
  if (h1s.length > 1) issues.push("Multiple H1 tags");

  const images = parseHtmlDocument(html).querySelectorAll("img");
  const missingAlt = images.filter((img) => !(img.getAttribute("alt") || "").trim());
  if (missingAlt.length) {
    issues.push(`${missingAlt.length} image(s) missing alt text`);
  }

  return {
    path: pagePath,
    meta,
    issues,
    suggestions,
    score: Math.max(0, 100 - issues.length * 12 - suggestions.length * 4),
  };
}

export function applySeoMeta(html, updates = {}) {
  const doc = parseHtmlDocument(html);
  const head = doc.querySelector("head") || doc.querySelector("html");

  function upsertMeta(name, content, property = false) {
    if (!content) return;
    const selector = property
      ? `meta[property="${name}"]`
      : `meta[name="${name}"]`;
    let node = doc.querySelector(selector);
    if (!node) {
      node = parse(`<meta ${property ? "property" : "name"}="${name}">`).firstChild;
      head?.appendChild(node);
    }
    node.setAttribute("content", content);
  }

  if (updates.title) {
    let title = doc.querySelector("title");
    if (!title) {
      title = parse("<title></title>").firstChild;
      head?.appendChild(title);
    }
    title.set_content(updates.title);
  }

  upsertMeta("description", updates.description);
  upsertMeta("og:title", updates.ogTitle, true);
  upsertMeta("og:description", updates.ogDescription, true);
  upsertMeta("og:image", updates.ogImage, true);
  upsertMeta("twitter:card", updates.twitterCard || "summary_large_image");

  if (updates.canonical) {
    let link = doc.querySelector('link[rel="canonical"]');
    if (!link) {
      link = parse('<link rel="canonical">').firstChild;
      head?.appendChild(link);
    }
    link.setAttribute("href", updates.canonical);
  }

  return doc.toString();
}

export function tagComponentHtml(name, html) {
  const doc = parseHtmlDocument(html.trim());
  const root = doc.childNodes.find((node) => node.nodeType === 1);
  if (!root) {
    throw new Error("Component HTML must contain a single root element");
  }
  root.setAttribute("data-capuz-component", name);
  return root.outerHTML;
}

export function insertHtmlAtPosition(pageHtml, componentHtml, position = "before_body_end") {
  const doc = parseHtmlDocument(pageHtml);
  const body = doc.querySelector("body");
  if (!body) {
    throw new Error("Page has no <body> element");
  }

  if (position === "after_body_start") {
    body.innerHTML = `${componentHtml}${body.innerHTML}`;
  } else if (position === "before_body_end") {
    body.innerHTML = `${body.innerHTML}${componentHtml}`;
  } else {
    throw new Error('position must be "after_body_start" or "before_body_end"');
  }

  return doc.toString();
}

export function syncComponentInPage(pageHtml, name, componentHtml) {
  const doc = parseHtmlDocument(pageHtml);
  const tagged = tagComponentHtml(name, componentHtml);
  const nodes = doc.querySelectorAll(`[data-capuz-component="${name}"]`);
  if (!nodes.length) return { html: pageHtml, updated: false };

  for (const node of nodes) {
    node.outerHTML = tagged;
  }

  return { html: doc.toString(), updated: true };
}

export function searchHtmlLines(html, query, path) {
  const needle = query.toLowerCase();
  const lines = html.split("\n");
  const matches = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].toLowerCase().includes(needle)) {
      matches.push({
        path,
        line: i + 1,
        text: lines[i].trim(),
      });
    }
  }
  return matches;
}
