/**
 * One-time extraction of the hand-authored text that cannot be derived from game data.
 *
 * Writes `content/translations/psychubes.json`, which the pipeline merges into
 * `data/psychubes_data.json`:
 *
 *   <gameId>: {
 *     descEn?                     // only when the game has no English (CN-only rows)
 *     descVi                      // always (Vietnamese is project content)
 *     amplifications: {
 *       "<level>": { descEn?, descVi }
 *     }
 *   }
 *
 * Run once against the legacy `data/psychubes_data.json` before regenerating it:
 *   node scripts/sync/tools/extract-psychube-translations.mjs
 *
 * It refuses to overwrite an existing file unless `--force` is passed.
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../config.mjs";
import { table } from "../sources.mjs";
import { readJson, writeJson } from "../util.mjs";

/** Rows the global server already ships text for; their English is generated. */
const globalIds = new Set(table("global", "equip").map((e) => String(e.id)));

const force = process.argv.includes("--force");
const source = path.join(ROOT, "data", "psychubes_data.json");
const target = path.join(ROOT, "content", "translations", "psychubes.json");

if (fs.existsSync(target) && !force) {
  console.error(`${path.relative(ROOT, target)} exists; pass --force to overwrite.`);
  process.exit(1);
}

const legacy = readJson(source);
const out = {};

for (const row of Object.values(legacy)) {
  const id = String(row.id ?? row.gameId);
  const entry = {};
  // The legacy file always carried a translated Vietnamese description.
  if (row.descVi) entry.descVi = row.descVi;
  // English that the game does not ship yet (CN-only rows) is preserved verbatim.
  if (!globalIds.has(id) && row.descEn) entry.descEn = row.descEn;

  const amps = {};
  for (const amp of row.amplifications || []) {
    const sub = {};
    if (amp.descVi) sub.descVi = amp.descVi;
    if (!globalIds.has(id) && amp.descEn) sub.descEn = amp.descEn;
    if (Object.keys(sub).length) amps[String(amp.level)] = sub;
  }
  if (Object.keys(amps).length) entry.amplifications = amps;

  out[id] = entry;
}

// Descending game id reads best and keeps diffs stable.
const sorted = {};
for (const id of Object.keys(out).sort((a, b) => Number(b) - Number(a))) sorted[id] = out[id];

writeJson(target, sorted);
console.log(`wrote ${Object.keys(sorted).length} entries to ${path.relative(ROOT, target)}`);
