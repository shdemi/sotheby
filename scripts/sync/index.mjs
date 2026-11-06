/**
 * Data pipeline entry point.
 *
 *   node scripts/sync/index.mjs            # write into data/
 *   node scripts/sync/index.mjs --out tmp  # write elsewhere (for diffing)
 *
 * Every file under `data/` is produced here and must never be hand-edited
 * (AGENTS.md §1). Numbers/tables come from the two St-Pavlov checkouts; text always
 * comes from the global repo, because the CN repo ships empty language files.
 */
import path from "node:path";
import { OUT, ROOT, SRC } from "./config.mjs";
import { readJson, writeJson } from "./util.mjs";
import { nameMap, globalNameTransfer } from "./derive/names.mjs";
import { charactersByRarity, charactersByAfflatus } from "./derive/characters.mjs";
import { characterProfiles } from "./derive/profiles.mjs";
import { psychubeId, psychubeKeyMap } from "./derive/psychubes.mjs";
import { psychubesData } from "./derive/psychubesData.mjs";
import { futureSight } from "./derive/futureSight.mjs";

const argOut = (() => {
  const i = process.argv.indexOf("--out");
  return i >= 0 && process.argv[i + 1] ? path.resolve(process.argv[i + 1]) : OUT;
})();

const meta = (server) => {
  try {
    return readJson(path.join(SRC[server], "meta.json"));
  } catch {
    return {};
  }
};

const generatedAt = new Date().toISOString();
const globalMeta = meta("global");
const cnMeta = meta("cn");

const files = {
  "_meta.json": {
    globalVersion: globalMeta.version || null,
    cnVersion: cnMeta.version || null,
    generatedAt,
    sources: [
      "github.com/St-Pavlov-Foundation/re1999-data-global-main",
      "github.com/St-Pavlov-Foundation/re1999-data-main",
      "github.com/Myssal/Reverse-1999-CN-Asset (images only)",
    ],
  },
  "global_name_transfer.json": globalNameTransfer(),
  "name_map.json": { character: nameMap().character, skin: {} },
  "characters_by_rarity.json": charactersByRarity(),
  "characters_by_afflatus.json": charactersByAfflatus(),
  "character_profiles.json": characterProfiles(),
  "psychube_id.json": psychubeId(),
  "psychube_key_map.json": psychubeKeyMap(),
  "psychubes_data.json": psychubesData(),
  "future_sight.json": futureSight(),
};

for (const [name, data] of Object.entries(files)) {
  writeJson(path.join(argOut, name), data);
}

console.log(`wrote ${Object.keys(files).length} files to ${path.relative(ROOT, argOut) || "."}`);
console.log(`  global ${globalMeta.version} | cn ${cnMeta.version} | ${generatedAt}`);
