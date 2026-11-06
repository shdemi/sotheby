/**
 * One-time extraction of the Euphoria text the game tables cannot provide.
 *
 * Writes `content/translations/euphorias.json`, which the pipeline merges into
 * `data/character_euphorias.json`:
 *
 *   <facetsId>: {
 *     nameEn?              // English for trees that only exist on the CN server
 *     nameZh?              // Chinese, when the CN row carries a bare name instead of a key
 *     tags?                // English tag labels for those same CN-only trees
 *     ranks: { "<n>": en } // English rank text for those trees
 *     portraits: { "<n>": en } // English portrait tiers for those trees
 *     version?             // "3.9" — the edition the tree shipped in (editorial)
 *   }
 *
 * Run once against the legacy `data/character_euphorias.json` before regenerating:
 *   node scripts/sync/tools/extract-euphoria-translations.mjs
 *
 * It refuses to overwrite an existing file unless `--force` is passed.
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../config.mjs";
import { table } from "../sources.mjs";
import { readJson, writeJson } from "../util.mjs";

/** Trees the global server already ships text for; everything else needs the overlay. */
const globalIds = new Set(table("global", "character_destiny_facets_consume").map((row) => String(row.facetsId)));

const force = process.argv.includes("--force");
const source = path.join(ROOT, "data", "character_euphorias.json");
const target = path.join(ROOT, "content", "translations", "euphorias.json");

if (fs.existsSync(target) && !force) {
  console.error(`${path.relative(ROOT, target)} exists; pass --force to overwrite.`);
  process.exit(1);
}

const legacy = readJson(source);
const out = {};

for (const entries of Object.values(legacy)) {
  for (const entry of entries) {
    const id = String(entry.id);
    const overlay = {};
    if (!globalIds.has(id)) {
      if (entry.name?.en) overlay.nameEn = entry.name.en;
      if (entry.name?.zh) overlay.nameZh = entry.name.zh;
      if (Array.isArray(entry.tags) && entry.tags.length) overlay.tags = entry.tags;
      const ranks = {};
      for (const rank of entry.ranks || []) {
        const text = rank.description?.en;
        if (text && text !== "N/A") ranks[String(rank.rank)] = text;
      }
      if (Object.keys(ranks).length) overlay.ranks = ranks;
      const portraits = {};
      for (const portrait of entry.portraits || []) {
        const key = Object.keys(portrait)[0];
        const text = portrait[key]?.description?.en;
        if (text && text !== "N/A") portraits[key] = text;
      }
      if (Object.keys(portraits).length) overlay.portraits = portraits;
    }
    if (entry.version) overlay.version = String(entry.version);
    if (Object.keys(overlay).length) out[id] = overlay;
  }
}

// Descending game id reads best and keeps diffs stable.
const sorted = {};
for (const id of Object.keys(out).sort((a, b) => Number(b) - Number(a))) sorted[id] = out[id];

writeJson(target, sorted);
console.log(`wrote ${Object.keys(sorted).length} entries to ${path.relative(ROOT, target)}`);
