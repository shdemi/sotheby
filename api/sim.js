/**
 * GET /sim — the share page for a team build or a character build.
 *
 * Crawlers (Discord, Twitter/X, Reddit) do not run JavaScript, so the page they fetch has
 * to carry the Open Graph tags itself. This function serves the normal `index.html` shell
 * with three injections:
 *
 *   1. `<title>` + description rewritten for the shared build
 *   2. `og:*` / `twitter:*` tags pointing at `/api/og` (content-addressed by `v`)
 *   3. `window.__SIM__` — the parsed payload, so `app.js` renders the same build
 *
 * `vercel.json` rewrites `/sim` here. `serve.py` maps `/sim` to `index.html` for local
 * development, where `app.js` reads the query string itself.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  normalizeSim,
  simDescription,
  simImageQuery,
  simTitle,
  simVersion,
} from "./_lib/sim/params.mjs";

// The bundle root, so `index.html` resolves whether the function runs from the repo
// checkout (tests, local `vercel dev`) or from /var/task.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const CACHE = "public, s-maxage=300, stale-while-revalidate=3600";

const esc = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

function metaTags(sim, origin, canonicalUrl, fullTitle) {
  const description = simDescription(sim);
  const image = `${origin}/api/og?${simImageQuery(sim)}&v=${simVersion(sim)}`;

  return [
    `<meta name="description" content="${esc(description)}" />`,
    `<link rel="canonical" href="${esc(canonicalUrl)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Sotheby's Mansion" />`,
    `<meta property="og:title" content="${esc(fullTitle)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:url" content="${esc(canonicalUrl)}" />`,
    `<meta property="og:image" content="${esc(image)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${esc(simTitle(sim))}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(fullTitle)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
    `<meta name="twitter:image" content="${esc(image)}" />`,
  ].join("\n    ");
}

export default async function handler(req, res) {
  const query = req.query || {};
  const proto = (req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const host = (req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  const origin = host ? `${proto}://${host}` : "";

  const sim = normalizeSim(query);
  const search = new URLSearchParams();
  if (sim.mode === "team") {
    search.set("team", sim.members.map((m) => m.name).join(","));
    const chubes = sim.members.map((m) => m.psychube).filter(Boolean);
    if (chubes.length) search.set("chubes", chubes.join(","));
    if (sim.name) search.set("name", sim.name);
  } else if (sim.mode === "character") {
    search.set("character", sim.character.name);
  }
  if (sim.lang) search.set("lang", sim.lang);

  const canonicalUrl = `${origin}/sim${search.toString() ? `?${search.toString()}` : ""}`;

  let html;
  try {
    html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  } catch {
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.end("index.html is missing from the function bundle");
    return;
  }

  const payload = JSON.stringify(sim).replaceAll("<", "\\u003c");
  const fullTitle = `${simTitle(sim)} · Sotheby's Mansion`;

  // `index.html` ships a base card between the `og:base` markers; a share page replaces
  // the whole block so no duplicate `og:title` reaches the crawler.
  const BASE_BLOCK = /[ \t]*<!-- og:base[\s\S]*?<!-- \/og:base -->/;

  html = html
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(fullTitle)}</title>`)
    .replace(BASE_BLOCK, `    ${metaTags(sim, origin, canonicalUrl, fullTitle)}`)
    .replace(
      '<script src="app.js"></script>',
      `<script>window.__SIM__ = ${payload};</script>\n  <script src="app.js"></script>`,
    );

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", CACHE);
  res.end(html);
}
