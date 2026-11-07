/**
 * `items.json` and `item_formulas.json`.
 *
 * Items are the union of two game tables plus the CN-only rows we can name:
 *   - `item`      where `isShow === 1`   (materials, packs, portraits, ...)
 *   - `currency`  where the row has a real name (Sharpodonty, Crystal Drop, ...)
 *   - `item` (CN) where the row is CN-only and `content/translations/items.json`
 *     supplies an English name. The CN repo stores literal Chinese and has no
 *     language files, so an item without that overlay entry cannot be shown in
 *     the `en` locale and is skipped (AGENTS.md §1.3, §2).
 *
 * `subType` is an `item_use` id; its name/zh are the category label. The
 * Vietnamese label and the few broken game labels live in
 * `maps/item-categories.json`. Currencies are not in `item_use` at all and take
 * the `currency` label from that map.
 *
 * Text precedence: the game wins; `content/translations/items.json` only fills
 * gaps (CN-only English, every Vietnamese string, and the editorial `source`,
 * which no table carries).
 *
 * `item_formulas.json` is the Wishing Spring crafting list, keyed by the id of
 * the produced item (`formula.produce`), with `costMaterial` + `costScore` as
 * the inputs.
 *
 * Two editorial filters keep the list usable: a row without artwork is dropped
 * (a sticker with no icon is a broken entry), and rows that share a display
 * name collapse to one, because the game reissues the same event currency under
 * a fresh id every patch.
 */
import fs from "node:fs";
import path from "node:path";
import { CONTENT, MAPS, RARITY_OFFSET, ROOT, SRC } from "../config.mjs";
import { lookup, stripMarkup, table } from "../sources.mjs";
import { parseMaterialList, sortKeys, tryReadJson } from "../util.mjs";

const ITEM_ICON_DIR = path.join(SRC.assets, "singlebg", "propitem", "prop");
const CURRENCY_ICON_DIR = path.join(SRC.assets, "singlebg", "currencyitem");

/** Static rarity frames that ship with the site (`images/items/border/*.webp`). */
const ITEM_BORDER_DIR = path.join(ROOT, "images", "items", "border");
let borderFrames = null;

/**
 * The frame path for a rarity, or "" when that frame is not shipped. The game
 * has no rarity-1 frame art, and an `<img>` pointing at a missing file logs a
 * console error, so a frameless rarity is left unframed instead.
 */
function borderFrame(rarity) {
  if (!rarity) return "";
  if (!borderFrames) {
    try {
      borderFrames = new Set(fs.readdirSync(ITEM_BORDER_DIR));
    } catch {
      borderFrames = new Set();
    }
  }
  return borderFrames.has(`${rarity}.webp`) ? `images/items/border/${rarity}.webp` : "";
}

/** filenames present in an asset folder, cached per folder */
function artwork(folder) {
  try {
    return new Set(fs.readdirSync(folder));
  } catch {
    return new Set();
  }
}

function categoryMap() {
  return tryReadJson(path.join(MAPS, "item-categories.json")) || {};
}

/** `item_use` id -> { en, zh, vi } */
function categories() {
  const map = categoryMap();
  const merge = new Map();
  for (const server of ["cn", "global"]) {
    for (const row of table(server, "item_use")) merge.set(row.id, row);
  }

  const out = new Map();
  for (const [id, row] of merge) {
    const zh = lookup("zh", row.name);
    out.set(String(id), {
      en: lookup("en", row.name).value,
      zh: zh.value,
      vi: (map.vi || {})[String(id)] || "",
    });
  }
  for (const [id, value] of Object.entries(map.overrides || {})) {
    out.set(String(id), { en: value.en, zh: value.zh, vi: value.vi });
  }
  if (map.currency) out.set("currency", { ...map.currency });
  return out;
}

// The game uses non-breaking spaces in a few names ("Wish in a Bottle"), which
// would break search and name lookups, so collapse them to plain spaces.
const asText = (value) =>
  stripMarkup(value || "")
    .replace(/[\u00a0\u2000-\u200b\u3000]/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();

/** The shared item shape. `icon` stays empty when Myssal has no artwork. */
function makeItem({ id, nameEn, nameZh, rarity, category, game, overlay, art }) {
  const description = asText(lookup("en", game.desc).value);
  const usage = asText(lookup("en", game.useDesc).value);
  return {
    id,
    name: nameEn,
    nameZh,
    rarity,
    category: category.en,
    categoryZh: category.zh,
    categoryVi: category.vi,
    description: description || overlay.desc || "",
    descriptionVi: overlay.descVi || "",
    source: overlay.source || "",
    sourceVi: overlay.sourceVi || "",
    usage: usage || overlay.usage || "",
    usageVi: overlay.usageVi || "",
    isReleased: true,
    icon: art ? `images/items/icon/${id}.png` : "",
    border: borderFrame(rarity),
  };
}

export function itemsData() {
  const cats = categories();
  const fallbackCategory = { en: "Other", zh: "其他", vi: "Khác" };
  const overlay = tryReadJson(path.join(CONTENT, "translations", "items.json")) || {};

  const itemArt = artwork(ITEM_ICON_DIR);
  const currencyArt = artwork(CURRENCY_ICON_DIR);
  const has = (set, row) => set.has(`${row.icon}.png`) || set.has(`${row.id}.png`);

  const globalRows = table("global", "item");
  const globalIds = new Set(globalRows.map((row) => row.id));
  const cnOnly = table("cn", "item").filter((row) => !globalIds.has(row.id) && row.isShow === 1);

  const entries = [];
  const skippedTypes = new Set();

  const push = (row, category, rarity, nameEn, nameZh, art) => {
    entries.push(
      makeItem({
        id: row.id,
        nameEn,
        nameZh,
        rarity,
        category,
        game: row,
        overlay: overlay[row.id] || {},
        art,
      }),
    );
  };

  for (const row of globalRows) {
    if (row.isShow !== 1) continue;
    const nameEn = asText(lookup("en", row.name).value);
    if (!nameEn) continue;
    // Only families the game labels in `item_use` are shown: a subType the game
    // itself does not name would otherwise land in an invented bucket.
    const category = cats.get(String(row.subType));
    if (!category) {
      skippedTypes.add(String(row.subType));
      continue;
    }
    push(
      row,
      category,
      Number(row.rare) + RARITY_OFFSET,
      nameEn,
      asText(lookup("zh", row.name).value),
      has(itemArt, row),
    );
  }

  for (const row of table("global", "currency")) {
    const nameEn = asText(lookup("en", row.name).value);
    if (!nameEn || nameEn === "0") continue;
    push(
      row,
      cats.get("currency"),
      Number(row.rare) + RARITY_OFFSET,
      nameEn,
      asText(lookup("zh", row.name).value),
      has(currencyArt, row),
    );
  }

  const unknown = [];
  for (const row of cnOnly) {
    const own = overlay[row.id];
    if (!own || !own.name) {
      unknown.push(row.id);
      continue;
    }
    const category = cats.get(String(row.subType)) || fallbackCategory;
    push(
      row,
      category,
      Number(row.rare) + RARITY_OFFSET,
      own.name,
      asText(row.name),
      has(itemArt, row),
    );
  }
  if (unknown.length) {
    console.log(`items: ${unknown.length} CN-only rows have no English overlay, skipped`);
  }
  if (skippedTypes.size) {
    console.log(`items: skipped unlabelled item families: ${[...skippedTypes].sort((a, b) => a - b).join(", ")}`);
  }

  // Same ordering as the legacy file: category first (currency at the top, then
  // item_use order), newest rarity first, then id.
  const catOrder = new Map([["currency", -1]]);
  const numeric = [...cats.keys()].filter((key) => key !== "currency").sort((a, b) => Number(a) - Number(b));
  for (const key of numeric) catOrder.set(key, catOrder.size);
  const idToType = new Map();
  for (const row of [...globalRows, ...cnOnly]) idToType.set(row.id, String(row.subType));
  for (const row of table("global", "currency")) idToType.set(row.id, "currency");

  const rank = (entry) => catOrder.get(idToType.get(entry.id)) ?? 999;
  entries.sort(
    (a, b) => rank(a) - rank(b) || b.rarity - a.rarity || a.id - b.id,
  );

  // A sticker without art is a broken row in the list, so it is not shipped.
  // The game also reissues the same event currency under a new id every patch
  // (Reading Chance, UTTU Points, UTTU Voucher, ...), so one row per name is
  // kept: the one with the most text, falling back to the lowest id.
  const completeness = (entry) =>
    (entry.description ? 2 : 0) + (entry.usage && entry.usage !== "DNT" ? 1 : 0);
  const byName = new Map();
  for (const entry of entries) {
    if (!entry.icon) continue;
    const previous = byName.get(entry.name);
    if (!previous || completeness(entry) > completeness(previous)) {
      byName.set(entry.name, entry);
    }
  }

  return [...byName.values()];
}

export function itemFormulas(knownIds) {
  const items = new Map(table("global", "item").map((row) => [row.id, row]));
  const currencies = new Map(table("global", "currency").map((row) => [row.id, row]));

  const materialName = (type, id) => {
    const row = type === 2 ? currencies.get(Number(id)) : items.get(Number(id));
    if (!row) return `Item_${id}`;
    return asText(lookup("en", row.name).value) || String(row.name);
  };

  const out = {};
  for (const row of table("global", "formula")) {
    const produce = String(row.produce || "").split("#");
    if (produce.length < 3) continue;
    if (knownIds && !knownIds.has(Number(produce[1]))) continue;
    const cost = [...parseMaterialList(row.costMaterial), ...parseMaterialList(row.costScore)];
    if (!cost.length) continue;
    out[produce[1]] = cost.map((part) => ({
      material: materialName(part.type, part.id),
      quantity: part.amount,
    }));
  }
  return sortKeys(out);
}
