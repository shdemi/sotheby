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
import { characterResoShape, shapePatterns } from "./derive/resonance.mjs";
import { characterEuphorias } from "./derive/euphorias.mjs";
import { characterSkills } from "./derive/skills.mjs";
import { charactersMatsRequired } from "./derive/mats.mjs";
import { itemsData, itemFormulas } from "./derive/items.mjs";
import { arcanistMap } from "./derive/arcanistMap.mjs";
import { collabCharacters, excludeCharacters } from "./derive/curation.mjs";
import { futureSight } from "./derive/futureSight.mjs";
import { ogIndex } from "./derive/ogIndex.mjs";
import { codeRewardIndex } from "./derive/codeRewards.mjs";
import { eventShopData } from "./derive/eventShop.mjs";

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

const items = itemsData();

// The expensive derivations run once so `og_index.json` can reuse them.
const arcanists = arcanistMap();
const profiles = characterProfiles();
const rarityBuckets = charactersByRarity();
const afflatusBuckets = charactersByAfflatus();
const resoShape = characterResoShape();
const chubeDetails = psychubesData();
const transfer = globalNameTransfer();

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
  "global_name_transfer.json": transfer,
  "name_map.json": { character: nameMap().character, skin: {} },
  "ArcanistMap.json": arcanists,
  "characters_by_rarity.json": rarityBuckets,
  "characters_by_afflatus.json": afflatusBuckets,
  "character_profiles.json": profiles,
  "character_reso_shape.json": resoShape,
  "shape_patterns.json": shapePatterns(),
  "character_euphorias.json": characterEuphorias(),
  "character_skills.json": characterSkills(),
  "characters_mats_required.json": charactersMatsRequired(),
  "items.json": items,
  "item_formulas.json": itemFormulas(new Set(items.map((item) => item.id))),
  "exclude_character.json": excludeCharacters(),
  "collab_character.json": collabCharacters(),
  "psychube_id.json": psychubeId(),
  "psychube_key_map.json": psychubeKeyMap(),
  "psychubes_data.json": chubeDetails,
  "future_sight.json": futureSight(),
  "code_reward_index.json": codeRewardIndex(),
  "event_shop.json": eventShopData(),
  "og_index.json": ogIndex({
    arcanists,
    profiles,
    rarity: rarityBuckets,
    afflatus: afflatusBuckets,
    resoShape,
    psychubesData: chubeDetails,
    transfer,
  }),
};

for (const [name, data] of Object.entries(files)) {
  writeJson(path.join(argOut, name), data);
}

console.log(`wrote ${Object.keys(files).length} files to ${path.relative(ROOT, argOut) || "."}`);
console.log(`  global ${globalMeta.version} | cn ${cnMeta.version} | ${generatedAt}`);
