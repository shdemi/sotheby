/**
 * Asset cache: Myssal -> `images/`, keyed by game id.
 *
 *   node scripts/sync/assets.mjs [--check]
 *
 * Five groups, each driven by a generated `data/` file (or the hand-authored
 * `content/guide_skills.json`) so the cache only holds art the app can show:
 *
 *   items      data/items.json         singlebg/propitem/prop/<icon|id>.png
 *                                      singlebg/currencyitem/<icon|id>.png
 *                  -> images/items/icon/<id>.png
 *   psychubes  data/psychube_id.json   singlebg/equipment/icon/<icon|id>.png
 *                  -> images/psychube_icon/<rarity>/<id>.png
 *   psychube detail  data/psychube_id.json
 *                                      singlebg/equip_defaulticon/<icon|id>.png
 *                  -> images/equip_defaulticon/<id>.png
 *   heads      data/ArcanistMap.json   singlebg/headicon_small/<skinId>.png
 *                  -> images/headicon_small/<skinId>.png
 *   skills     content/guide_skills.json  singlebg/fight/skill/<name>.png
 *                  -> images/skills/<name>.png
 *   code items data/code_reward_index.json
 *                                       singlebg/propitem/prop/<icon|id>.png   (power items)
 *                                       singlebg/equipment/icon/<icon|id>.png  (EXP-fodder psychubes)
 *                  -> images/code_items/<key>.png
 *
 * Rows whose art Myssal does not ship are reported, not invented: the app skips
 * the `<img>` (items), has no skin entry (heads), or keeps the editorial icon
 * already in the repo (skills).
 *
 * Signature art is not copied: nothing in the app reads it.
 *
 * `--check` only reports (see `npm run sync:verify`). Everything under
 * `images/` is committed; this script is how it got there.
 */
import fs from "node:fs";
import path from "node:path";
import { CONTENT, OUT, ROOT, SRC } from "./config.mjs";
import { readJson } from "./util.mjs";
import { table } from "./sources.mjs";
import { codeItemAssets } from "./derive/codeRewards.mjs";

const check = process.argv.includes("--check");

const DIRS = {
  item: path.join(SRC.assets, "singlebg", "propitem", "prop"),
  currency: path.join(SRC.assets, "singlebg", "currencyitem"),
  equipment: path.join(SRC.assets, "singlebg", "equipment", "icon"),
  equipmentDefault: path.join(SRC.assets, "singlebg", "equip_defaulticon"),
  head: path.join(SRC.assets, "singlebg", "headicon_small"),
  skill: path.join(SRC.assets, "singlebg", "fight", "skill"),
};

/** First `<name>.png` that exists in `folder`, out of the given candidates. */
function pick(folder, names) {
  for (const name of names) {
    if (name === undefined || name === null || name === "") continue;
    const file = path.join(folder, `${name}.png`);
    if (fs.existsSync(file)) return file;
  }
  return null;
}

/** Items and currencies, exactly as `data/items.json` lists them. */
function itemAssets() {
  const items = readJson(path.join(OUT, "items.json"));
  const itemRows = new Map(table("global", "item").map((row) => [row.id, row]));
  const currencyRows = new Map(table("global", "currency").map((row) => [row.id, row]));

  return items.map((entry) => {
    const item = itemRows.get(entry.id);
    const currency = currencyRows.get(entry.id);
    const source =
      (item && pick(DIRS.item, [item.icon, item.id])) ||
      (currency && pick(DIRS.currency, [currency.icon, currency.id])) ||
      null;
    return { id: entry.id, dest: path.join("images", "items", "icon", `${entry.id}.png`), source };
  });
}

/** Psychube icons, one folder per app rarity (`<rarity>:<equip.id>`). */
function psychubeAssets() {
  const book = readJson(path.join(OUT, "psychube_id.json"));
  const equips = new Map();
  for (const server of ["global", "cn"]) {
    for (const row of table(server, "equip")) equips.set(row.id, row);
  }

  const assets = [];
  for (const [rarity, list] of Object.entries(book)) {
    for (const entry of list) {
      const id = Number(entry.id);
      const equip = equips.get(id);
      const source = equip
        ? pick(DIRS.equipment, [equip.icon, equip.id]) || pick(DIRS.equipmentDefault, [equip.icon])
        : null;
      assets.push({ id, dest: path.join("images", "psychube_icon", rarity, `${id}.png`), source });
    }
  }
  return assets;
}

/**
 * Psychube detail art, one flat folder. `images/equip_defaulticon/<id>.png` is the
 * wide illustration the game's psychube detail screen shows; the rail keeps the
 * 180x214 board icon written by `psychubeAssets()`.
 */
function psychubeDetailAssets() {
  const book = readJson(path.join(OUT, "psychube_id.json"));
  const ids = new Set();
  for (const list of Object.values(book)) {
    for (const entry of list) ids.add(Number(entry.id));
  }
  return [...ids].map((id) => ({
    id,
    dest: path.join("images", "equip_defaulticon", `${id}.png`),
    source: pick(DIRS.equipmentDefault, [id]),
  }));
}

/**
 * Character heads. The app renders one per skin of `data/ArcanistMap.json`
 * (and skips skin ids longer than six digits, which are concept rows), so the
 * map's skin ids are the whole head set.
 */
function headAssets() {
  const map = readJson(path.join(OUT, "ArcanistMap.json"));
  const ids = new Set();
  for (const entry of Object.values(map)) {
    for (const skin of entry.live2d || []) {
      const id = String(skin.id || "");
      if (id && id.length <= 6) ids.add(Number(id));
    }
  }
  return [...ids].map((id) => ({
    id,
    dest: path.join("images", "headicon_small", `${id}.png`),
    source: pick(DIRS.head, [id]),
  }));
}

/** Skill card art referenced by the hand-authored `content/guide_skills.json`. */
function skillAssets() {
  const guide = readJson(path.join(CONTENT, "guide_skills.json"));
  const icons = new Set();
  for (const list of Object.values(guide)) {
    for (const row of Array.isArray(list) ? list : []) {
      if (row && row.icon) icons.add(row.icon);
    }
  }
  return [...icons].map((icon) => ({
    id: path.basename(icon),
    dest: icon,
    source: pick(DIRS.skill, [path.basename(icon, ".png")]),
  }));
}

const groups = [
  ["items", itemAssets()],
  ["psychubes", psychubeAssets()],
  ["psychube detail", psychubeDetailAssets()],
  ["heads", headAssets()],
  ["skills", skillAssets()],
  ["code items", codeItemAssets()],
];

for (const [name, assets] of groups) {
  let copied = 0;
  let present = 0;
  const handAdded = [];
  const unsourced = [];
  const absent = [];

  for (const asset of assets) {
    const target = path.join(ROOT, asset.dest);
    const onDisk = fs.existsSync(target);
    if (!asset.source) {
      // Myssal never shipped this art; a hand-placed file still counts.
      if (onDisk) {
        present++;
        handAdded.push(asset.id);
      } else {
        unsourced.push(asset.id);
      }
      continue;
    }
    if (onDisk) {
      present++;
      continue;
    }
    if (!check) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(asset.source, target);
    }
    copied++;
    absent.push(asset.id);
  }

  const detail = [`${present}/${assets.length} present`];
  if (!check) detail.push(`${copied} copied`);
  else if (absent.length) detail.push(`${absent.length} missing`);
  if (handAdded.length) detail.push(`${handAdded.length} hand-added`);
  detail.push(`${unsourced.length} without artwork`);
  console.log(`${name}: ${detail.join(", ")}`);
  if (absent.length && check) console.log(`  not copied yet: ${absent.join(", ")}`);
  if (handAdded.length) console.log(`  hand-added: ${handAdded.join(", ")}`);
  if (unsourced.length) console.log(`  no artwork: ${unsourced.join(", ")}`);
}
