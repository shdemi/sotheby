/**
 * Writes `data/promo_codes.json`, the fallback snapshot of the Fandom page.
 *
 *   npm run codes:snapshot            # fetch, parse, write when the page moved
 *   npm run codes:snapshot -- --force # rewrite even when `revid` is unchanged
 *
 * `/api/codes` reads this file when the wiki is unreachable (see api/codes.js),
 * and a local `python serve.py` has no functions at all, so the app falls back
 * to it too. It is generated data: never hand-edit it.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parsePromoCodes } from "../../api/_lib/parse-codes.mjs";
import { fetchPromoWikitext, WIKI_PAGE } from "../../api/_lib/wiki.mjs";
import { tryReadJson, writeJson } from "../sync/util.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TARGET = path.join(ROOT, "data", "promo_codes.json");

const force = process.argv.includes("--force");

function sameCodes(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function main() {
  const { wikitext, revid, title } = await fetchPromoWikitext();
  const { permanent, current } = parsePromoCodes(wikitext);

  if (!permanent.length && !current.length) {
    throw new Error("parser found no active codes; the wiki layout probably changed");
  }

  const snapshot = {
    source: WIKI_PAGE,
    title,
    revid,
    fetchedAt: new Date().toISOString(),
    permanent,
    current,
  };

  const previous = tryReadJson(TARGET);
  if (
    !force &&
    previous &&
    previous.revid === snapshot.revid &&
    sameCodes(previous.permanent, snapshot.permanent) &&
    sameCodes(previous.current, snapshot.current)
  ) {
    console.log(`data/promo_codes.json is up to date (revid ${revid}).`);
    return;
  }

  writeJson(TARGET, snapshot);
  console.log(
    `wrote data/promo_codes.json (revid ${revid}): ${permanent.length} permanent, ${current.length} current.`,
  );
}

main().catch((error) => {
  console.error(`codes:snapshot failed: ${error?.message || error}`);
  process.exitCode = 1;
});
