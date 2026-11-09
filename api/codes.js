import fs from "node:fs";
import path from "node:path";

import { parsePromoCodes } from "./_lib/parse-codes.mjs";
import { fetchPromoWikitext, WIKI_PAGE } from "./_lib/wiki.mjs";

const CACHE_OK = "public, s-maxage=21600, stale-while-revalidate=86400";
const CACHE_STALE = "public, s-maxage=300, stale-while-revalidate=60";

function readSnapshot() {
  try {
    const file = path.join(process.cwd(), "data", "promo_codes.json");
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function payload({ permanent, current, revid, title, fetchedAt, stale }) {
  return {
    source: WIKI_PAGE,
    title: title || "Promotional Code",
    revid: revid || null,
    fetchedAt,
    stale: !!stale,
    permanent,
    current,
  };
}

/**
 * GET /api/codes
 *
 * The wiki page changes a few times a month, so the response is cached at the
 * edge for six hours and served stale for a day while it revalidates (the
 * plain-function equivalent of ISR; see AGENTS.md). If the wiki is unreachable
 * the last committed snapshot is served with a short TTL instead of an error.
 */
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method && !["GET", "HEAD"].includes(req.method)) {
    res.setHeader("Allow", "GET, HEAD");
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ error: "method_not_allowed" }));
    return;
  }

  try {
    const { wikitext, revid, title } = await fetchPromoWikitext();
    const parsed = parsePromoCodes(wikitext);
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", CACHE_OK);
    res.setHeader("X-Codes-Source", "live");
    res.setHeader("ETag", `W/"codes-${revid || parsed.current.length}"`);
    res.end(
      JSON.stringify(
        payload({
          ...parsed,
          revid,
          title,
          fetchedAt: new Date().toISOString(),
        }),
      ),
    );
  } catch (error) {
    const snapshot = readSnapshot();
    res.setHeader("X-Codes-Source", snapshot ? "snapshot" : "error");
    if (snapshot) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", CACHE_STALE);
      res.end(JSON.stringify({ ...snapshot, stale: true }));
      return;
    }
    res.statusCode = 502;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify({ error: "wiki_unavailable", detail: String(error?.message || error) }));
  }
}
