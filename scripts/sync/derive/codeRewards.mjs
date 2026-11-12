/**
 * `code_reward_index.json` — the reward names the Codes tab cannot resolve.
 *
 * The InfoBook Codes tab prints its rewards from the Fandom wiki, which names
 * whatever the in-game mail carried. Nearly all of those names are `item` /
 * `currency` rows and resolve through `items.json`, but two families never do:
 *
 *   - `power_item` rows (Picrasma Candy, Jar of Picrasma Candy, ...). That table
 *     is a stamina-item list the app has no other use for, so no item row exists.
 *   - low-rarity `equip` rows (Enlighten I/II/III, ...). They are psychube EXP
 *     fodder, and `psychube_id.json` deliberately keeps only 5★/6★ chubes.
 *
 * Both ship art in the Myssal repo under their own ids, so the index carries the
 * display name plus the cached icon path, and `getItemByName()` falls back to it.
 * Keys are the display name lowercased, matching that lookup.
 */
import fs from "node:fs";
import path from "node:path";
import { RARITY_OFFSET, SRC } from "../config.mjs";
import { lookup, table } from "../sources.mjs";

const PROP_DIR = path.join(SRC.assets, "singlebg", "propitem", "prop");
const EQUIP_DIR = path.join(SRC.assets, "singlebg", "equipment", "icon");
const EQUIP_DEFAULT_DIR = path.join(SRC.assets, "singlebg", "equip_defaulticon");

/** Where the copied art lives, relative to the repo root. */
const DEST_DIR = path.join("images", "code_items");

/** EXP fodder and the `Just Test` rows stay out of the psychube tab. */
const FODDER_MAX_RARE = 3;

function pick(folder, names) {
  for (const name of names) {
    if (name === undefined || name === null || name === "") continue;
    const file = path.join(folder, `${name}.png`);
    if (fs.existsSync(file)) return file;
  }
  return null;
}

const hasChinese = (value) => /[\u3400-\u9fff]/.test(String(value || ""));

/** The shipped English label, or `""` when the game only has a literal CN string. */
function displayName(row) {
  const en = lookup("en", row.name);
  if (en.found && en.value && !hasChinese(en.value)) return en.value.trim();
  return hasChinese(row.name_en) ? "" : String(row.name_en || "").trim();
}

/** Power items, deduplicated across both servers by their icon. */
function powerRows() {
  const seen = new Set();
  const out = [];
  for (const server of ["global", "cn"]) {
    for (const row of table(server, "power_item")) {
      const key = `power-${row.icon || row.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ key, row });
    }
  }
  return out;
}

/** Every low-rarity psychube row (Enlighten and friends), global first. */
function fodderRows() {
  const byId = new Map();
  for (const row of table("global", "equip")) byId.set(row.id, row);
  for (const row of table("cn", "equip")) if (!byId.has(row.id)) byId.set(row.id, row);
  return [...byId.values()].filter((row) => row.rare <= FODDER_MAX_RARE);
}

/**
 * The art to copy into `images/code_items/`, in the same shape `assets.mjs`
 * consumes: one row per file, keyed by the game id (or the power icon id).
 * Rows with no English label are skipped: the index keys on the name, so their
 * art could never be reached.
 */
export function codeItemAssets() {
  const assets = [];

  for (const { key, row } of powerRows()) {
    if (!displayName(row)) continue;
    const source = pick(PROP_DIR, [row.icon, row.id]);
    if (!source) continue;
    assets.push({ id: key, dest: path.join(DEST_DIR, `${key}.png`), source, row, kind: "power" });
  }

  for (const row of fodderRows()) {
    if (!displayName(row)) continue;
    const key = `equip-${row.id}`;
    const source = pick(EQUIP_DIR, [row.icon, row.id]) || pick(EQUIP_DEFAULT_DIR, [row.icon]);
    if (!source) continue;
    assets.push({ id: key, dest: path.join(DEST_DIR, `${key}.png`), source, row, kind: "psychube" });
  }

  return assets;
}

/** `{ "<name lowercased>": { id, name, icon, kind } }` for the client fallback. */
export function codeRewardIndex() {
  const out = {};
  for (const asset of codeItemAssets()) {
    const name = displayName(asset.row);
    if (!name) continue;
    out[name.toLowerCase()] = {
      id: asset.id,
      name,
      icon: asset.dest.split(path.sep).join("/"),
      kind: asset.kind,
      rarity: Number(asset.row.rare) + RARITY_OFFSET,
    };
  }
  return Object.fromEntries(Object.entries(out).sort((a, b) => a[0].localeCompare(b[0])));
}
