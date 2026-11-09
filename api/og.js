/**
 * GET /api/og — the share image for a team build or a character build.
 *
 *   /api/og?character=Lucy&lang=en
 *   /api/og?team=Lucy,Jessica,6,Windsong&chubes=6:1527,6:1504,6:1579,6:1500&name=FUA
 *   /api/og                      brand card
 *
 * `v` is a cache-busting token only: Discord caches an OG image by URL forever, so the
 * page that emits the meta tag appends a short hash of the payload and changes it when
 * the build changes.
 *
 * The response is cached at the edge for a year because the URL is content-addressed by
 * `v`. Rendering is a cold start + a handful of CDN image fetches, so the first share of
 * a link pays ~0.3–1 s and every later one is served from cache.
 */
import { renderOg } from "./_lib/og/render.mjs";

const CACHE = "public, s-maxage=31536000, stale-while-revalidate=604800";

function first(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function str(value, max = 80) {
  return String(first(value) ?? "").replace(/[\u0000-\u001f]/g, "").slice(0, max);
}

export default async function handler(req, res) {
  const query = req.query || {};
  const proto = (req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const host = (req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  const origin = host ? `${proto}://${host}` : "";

  try {
    const image = await renderOg({ query, origin });

    const buffer = Buffer.from(await image.arrayBuffer());
    res.statusCode = 200;
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", CACHE);
    res.setHeader("Content-Length", buffer.length);
    res.end(buffer);
  } catch (error) {
    // A broken card must not break the share: fall back to the brand card once.
    try {
      const fallback = await renderOg({ query: { lang: str(query.lang, 4) }, origin });
      const buffer = Buffer.from(await fallback.arrayBuffer());
      res.statusCode = 200;
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, s-maxage=300");
      res.end(buffer);
    } catch {
      res.statusCode = 500;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end(`og image failed: ${error?.message || "unknown error"}`);
    }
  }
}
