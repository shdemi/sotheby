/**
 * ONE-TIME legacy extractor for the psychube id migration (see AGENTS.md §5).
 *
 * The old pipeline invented sequential psychube ids and stored the real game id in
 * `gameId`. User saves in localStorage (`r1999_psychube_v1`) are keyed by the old
 * `"<oldRarity>:<oldId>"`. When we switch to `"<appRarity>:<gameId>"`, every existing
 * save would be orphaned unless we ship an explicit translation table.
 *
 * This script reads the last legacy `data/psychubes_data.json` and freezes two files:
 *   - `legacy/psychube-migration.json` : old key -> new key
 *   - `legacy/psychube-release.json`   : gameId -> releasePatch (has no game-data source)
 *
 * The legacy file is regenerable from git history:
 *   git show <commit>:data/psychubes_data.json > _legacy_psychubes_data.json
 *   node scripts/sync/legacy/extract-psychube-migration.mjs _legacy_psychubes_data.json
 *
 * It is intentionally NOT part of the normal pipeline run.
 */
import fs from "node:fs";
import path from "node:path";
import { SRC, MAPS } from "../config.mjs";
import { asArray, readJson, writeJson } from "../util.mjs";

const legacyFile = process.argv[2] || path.join(MAPS, "..", "..", "..", "data", "psychubes_data.json");
const legacy = readJson(path.resolve(legacyFile));

function equipById(server) {
  const map = new Map();
  for (const row of asArray(readJson(path.join(SRC[server], "json", "equip.json")))) {
    map.set(row.id, row);
  }
  return map;
}

const globalEq = equipById("global");
const cnEq = equipById("cn");

/** app rarity = equip.rare + 1 (the game calls them 5★/6★, the app 5/6). */
function appRarity(row) {
  return row ? row.rare + 1 : null;
}

const migration = {};
const release = {};
const problems = [];

for (const [oldKey, entry] of Object.entries(legacy)) {
  const gameId = entry.gameId;
  const row = globalEq.get(gameId) || cnEq.get(gameId);
  const rarity = appRarity(row) ?? entry.rarity;
  if (!row) problems.push(`${oldKey} (${entry.name}) has no equip row for gameId ${gameId}`);
  const newKey = `${rarity}:${gameId}`;
  if (migration[oldKey] && migration[oldKey] !== newKey) {
    problems.push(`${oldKey} maps twice: ${migration[oldKey]} vs ${newKey}`);
  }
  migration[oldKey] = newKey;
  if (entry.releasePatch) release[gameId] = entry.releasePatch;
}

const sortedMigration = {};
for (const key of Object.keys(migration).sort(compareOldKey)) sortedMigration[key] = migration[key];
const sortedRelease = {};
for (const key of Object.keys(release).sort((a, b) => Number(a) - Number(b))) sortedRelease[key] = release[key];

writeJson(path.join(import.meta.dirname, "psychube-migration.json"), sortedMigration);
writeJson(path.join(import.meta.dirname, "psychube-release.json"), sortedRelease);

console.log(`legacy entries: ${Object.keys(legacy).length}`);
console.log(`migration keys: ${Object.keys(sortedMigration).length}`);
console.log(`release patches: ${Object.keys(sortedRelease).length}`);
if (problems.length) {
  console.log(`\n!! problems (${problems.length}):`);
  for (const p of problems) console.log("   " + p);
}

function compareOldKey(a, b) {
  const [ra, ia] = a.split(":");
  const [rb, ib] = b.split(":");
  if (ra !== rb) return Number(rb) - Number(ra);
  return Number(ia) - Number(ib);
}
