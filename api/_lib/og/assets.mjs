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
 * The real image format, read from the bytes rather than the file name.
 *
 * Eight head icons shipped from Myssal as WebP data under a `.png` name; declaring them
 * as PNG made satori draw nothing (or, declared as WebP, throw), which is why those
 * characters' cards had an empty portrait box. WebP is not supported here, so anything
 * that is neither PNG nor JPEG resolves to null and the card keeps its text fallback.
 */
function magicMime(buffer) {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return "image/png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  return null;
}

/**
 * Turns a repo-relative image path into a data URI satori can draw.
 * Returns null when the artwork is missing, so a card can fall back to a text
 * placeholder instead of failing.
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

  const mime = buffer ? magicMime(buffer) : null;
  const uri = mime ? `data:${mime};base64,${buffer.toString("base64")}` : null;
  if (uri) images.set(relPath, uri);
  return uri;
}

/** Warms every image a card needs in parallel; failures resolve to null. */
export function loadAll(paths, origin) {
  return Promise.all([...new Set(paths.filter(Boolean))].map((p) => imageSrc(p, origin)));
}

/**
 * Intrinsic size of a data URI, read from the PNG or JPEG header.
 *
 * Satori's `objectFit: contain` does not scale every image (the 170x114 pattern glyphs were
 * drawn stretched into a 44x44 box), so a card that needs the real ratio asks for it here
 * and draws the art at that size inside a fixed box.
 */
export function imageSize(uri) {
  if (!uri) return null;
  const buffer = Buffer.from(uri.slice(uri.indexOf(",") + 1), "base64");
  if (buffer.length >= 24 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  return null;
}
