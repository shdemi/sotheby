/**
 * Data, fonts and images for the OG renderer.
 *
 * The function runs on the Node runtime, so everything is read from disk:
 *
 *   data/og_index.json   characters + psychubes + build rows (generated, ~78 KB)
 *   assets/og/*.ttf      Be Vietnam Pro (Latin/VI) + Noto Sans SC (CN subset)
 *   images/**            fetched over HTTP when an origin is known, else read from disk
 *
 * Reading the images over HTTP keeps the function bundle small: they are already served
 * by the same deployment. The local preview script passes no origin and reads from disk.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Anchored to the module, not `process.cwd()`: the test harness runs from the repo
// root, and Vercel runs the bundle from /var/task where the same layout applies.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const MIME = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

let index = null;

export function ogIndex() {
  if (!index) {
    index = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "og_index.json"), "utf8"));
  }
  return index;
}

const fonts = new Map();

function readFont(name) {
  if (!fonts.has(name)) {
    fonts.set(name, fs.readFileSync(path.join(ROOT, "assets", "og", name)));
  }
  return fonts.get(name);
}

/** Font list for satori; `OG-CJK` is a fallback so Chinese names keep their glyphs. */
export function ogFonts() {
  return [
    { name: "OG", data: readFont("be-vietnam-pro-400.ttf"), weight: 400, style: "normal" },
    { name: "OG", data: readFont("be-vietnam-pro-700.ttf"), weight: 700, style: "normal" },
    { name: "OG-CJK", data: readFont("noto-sans-sc-400.ttf"), weight: 400, style: "normal" },
    { name: "OG-CJK", data: readFont("noto-sans-sc-700.ttf"), weight: 700, style: "normal" },
  ];
}

const images = new Map();

/**
 * Turns a repo-relative image path into a data URI satori can draw.
 * Returns null when the artwork is missing (eight head icons have no art yet),
 * so a card can fall back to a text placeholder instead of failing.
 */
export async function imageSrc(relPath, origin) {
  if (!relPath) return null;
  if (images.has(relPath)) return images.get(relPath);

  let buffer = null;
  if (origin) {
    try {
      const res = await fetch(new URL(relPath, origin), { headers: { "user-agent": "sothebys-mansion-og" } });
      if (res.ok) buffer = Buffer.from(await res.arrayBuffer());
    } catch {
      buffer = null;
    }
  }
  if (!buffer) {
    try {
      buffer = fs.readFileSync(path.join(ROOT, relPath));
    } catch {
      buffer = null;
    }
  }

  const uri = buffer
    ? `data:${MIME[path.extname(relPath).toLowerCase()] || "image/png"};base64,${buffer.toString("base64")}`
    : null;
  if (uri) images.set(relPath, uri);
  return uri;
}

/** Warms every image a card needs in parallel; failures resolve to null. */
export function loadAll(paths, origin) {
  return Promise.all([...new Set(paths.filter(Boolean))].map((p) => imageSrc(p, origin)));
}
