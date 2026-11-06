/**
 * Item artwork: Myssal -> `images/items/icon/<gameId>.png`.
 *
 * `data/items.json` lists which items exist and whether they have art (`icon`
 * is empty when they do not). This script copies the matching PNG out of the
 * Myssal checkout, keyed by the game id so the cache is stable across patches:
 *
 *   item       singlebg/propitem/prop/<icon or id>.png
 *   currency   singlebg/currencyitem/<icon or id>.png
 *
 *   node scripts/sync/assets.mjs [--check]
 *
 * `--check` only reports what is missing or stale (used by `sync:verify`).
 * Everything under `images/` is committed; this script is how it got there.
 */
import fs from "node:fs";
import path from "node:path";
import { OUT, ROOT, SRC } from "./config.mjs";
import { readJson } from "./util.mjs";
import { table } from "./sources.mjs";

const ITEM_SRC = path.join(SRC.assets, "singlebg", "propitem", "prop");
const CURRENCY_SRC = path.join(SRC.assets, "singlebg", "currencyitem");
const DEST = path.join(ROOT, "images", "items", "icon");

const check = process.argv.includes("--check");

const items = readJson(path.join(OUT, "items.json"));
const itemRows = new Map(table("global", "item").map((row) => [row.id, row]));
const currencyRows = new Map(table("global", "currency").map((row) => [row.id, row]));

const sourceFor = (id) => {
  const item = itemRows.get(id);
  if (item) {
    for (const name of [String(item.icon), String(item.id)]) {
      const file = path.join(ITEM_SRC, `${name}.png`);
      if (fs.existsSync(file)) return file;
    }
  }
  const currency = currencyRows.get(id);
  if (currency) {
    for (const name of [String(currency.icon), String(currency.id)]) {
      const file = path.join(CURRENCY_SRC, `${name}.png`);
      if (fs.existsSync(file)) return file;
    }
  }
  return null;
};

if (!check) fs.mkdirSync(DEST, { recursive: true });

let copied = 0;
let present = 0;
const missing = [];
for (const item of items) {
  const target = path.join(DEST, `${item.id}.png`);
  const exists = fs.existsSync(target);
  const source = sourceFor(item.id);
  if (!source) {
    missing.push(item.id);
    continue;
  }
  if (exists) {
    present++;
    continue;
  }
  if (!check) fs.copyFileSync(source, target);
  copied++;
}

if (check) {
  console.log(`items: ${present}/${items.length} icons present, ${missing.length} without artwork`);
  if (missing.length) console.log(`  no artwork: ${missing.join(", ")}`);
} else {
  console.log(`items: copied ${copied}, already present ${present}, no artwork ${missing.length}`);
  if (missing.length) console.log(`  no artwork: ${missing.join(", ")}`);
}
