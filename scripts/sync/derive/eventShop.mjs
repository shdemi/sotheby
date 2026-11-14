/**
 * `event_shop.json` — the event-currency shop the global client is running,
 * with each goods row resolved to a name, an icon, a price and a purchase cap.
 *
 * This is the data behind the Planner modal's **Event** tab, which answers
 * "what does this patch's event shop cost me?" (AGENTS.md §14).
 *
 * ## What it reads
 *
 *   activity107        one row per goods slot; `product` and `cost` are
 *                      `type#id#qty` strings, `maxBuyCount` is the cap,
 *                      `isOnline` says the slot is switched on
 *   activity           the catalogue row (display name, `isRetroAcitivity`)
 *   language_prefab    `p_v<major>a<minor>_storeview_txt_title<N>` names the
 *                      Nth section of that patch's shop (Divine Treasure /
 *                      Ceremonial Offering / Regular Reserve for 3.9)
 *   item / currency / equip / skin / character / block_package
 *                      `type` -> table (see TYPE_TABLES); text from the global
 *                      `language_*` files, art from the Myssal checkout. Type
 *                      `13` is a **wilderness land block** (Summer Haven
 *                      Harbor, Evergreen Ground I), not a currency — its ids
 *                      overlap `currency`, which is why reading it from there
 *                      once labeled a wilderness plot "Tamer Badge". Every block
 *                      shares one hand-added icon (`images/items/wilderness_icon.png`),
 *                      because Myssal ships no per-block art.
 *
 * ## How the "current" shop is picked
 *
 * The client never deletes old shops and `activity107` carries no date, so the
 * patch is read from the activity id: `activityId / 100` is
 * `100 + major*10 + minor` (3.9 -> 139xx, a 3.8.5 sub-batch -> 1385xx, ignored).
 * The newest such patch that still has an online shop wins; inside it the
 * non-retro shop with the most rows is the one the tab opens on. Every other
 * online shop of the same patch is kept in `shops[]` so the tab can offer them,
 * and section titles come from that patch's prefab strings — which is why a
 * patch download needs no hand edit here.
 *
 * Degradation, in order: a patch with no prefab titles still yields a shop with
 * `Group 1..N` labels; a shop whose section count does not match the prefab set
 * keeps its rows under those generic labels too. Rows whose `type` has no
 * resolvable table (`11`, `24`, `31`) are kept with a `type11 #id` label rather
 * than dropped, so the price list stays complete.
 *
 * ## The shape of a row
 *
 *   key          "<type>#<id>" of the product — what the row sells
 *   uid          the `activity107` row id — the goods slot. The same product can
 *                sit in two sections at different prices (Old Ticket is 230 in
 *                Ceremonial Offering, 750 in Regular Reserve), so this is the
 *                only safe per-row identity. The Planner keys its quantities on
 *                it.
 *   cost         unit price, in `costId` (the shop's one event currency)
 *   originalCost the struck-through "before the discount" price, 0 when none
 *   maxBuy       the purchase cap; 0 means the game sells it without a limit
 *   featured     the headline slot the game pins first in a section
 */
import fs from "node:fs";
import path from "node:path";
import { RARITY_OFFSET, ROOT, SRC } from "../config.mjs";
import { indexBy, lookup, table } from "../sources.mjs";

/** `type` prefix -> the table that resolves it (AGENTS.md §14, `type#id#qty`).
 *
 * `13` is a **wilderness land block** (`block_package`), not a currency: its ids
 * overlap `currency` (3902/3903 are also a stamina token and a Clef), so reading
 * it from `currency` labeled a Summer Haven Harbor plot "Tamer Badge". Every
 * block shares one icon in the app (`images/items/wilderness_icon.png`, see
 * `WILDERNESS_ICON`), because Myssal ships no per-block art. */
const TYPE_TABLES = {
  1: "item",
  2: "currency",
  4: "character",
  5: "skin",
  9: "equip",
  13: "block_package",
};

const ITEM_ART = path.join(SRC.assets, "singlebg", "propitem", "prop");
const CURRENCY_ART = path.join(SRC.assets, "singlebg", "currencyitem");
const EQUIP_ART = path.join(SRC.assets, "singlebg", "equipment", "icon");
const HEAD_ART = path.join(SRC.assets, "singlebg", "headicon_small");

/** One shared icon for every wilderness land block sold in a shop. */
const WILDERNESS_ICON = "images/items/wilderness_icon.png";

const asText = (value) =>
  String(value || "")
    .replace(/[\u00a0\u2000-\u200b\u3000]/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();

/** First `<name>.png` present in `folder` (cheap existsSync probe, no listing). */
function probe(folder, names) {
  for (const name of names) {
    if (!name) continue;
    if (fs.existsSync(path.join(folder, `${name}.png`))) return true;
  }
  return false;
}

/** True when the repo already ships this art (a previous sync copied it). */
function shipped(relPath) {
  return fs.existsSync(path.join(ROOT, ...relPath.split("/")));
}

function namePair(row, enField) {
  const en = asText(lookup("en", row.name).value) || asText(row.name_en || row.nameEn || enField || "");
  const zh = asText(lookup("zh", row.name).value);
  return { en, zh };
}

/**
 * Patch code (`139` for 3.9) -> { group -> { en, zh } }, from the prefab ids
 * that hold the shop's section titles. A patch whose prefab has no titles
 * simply does not appear here.
 */
function groupTitles() {
  const sets = new Map();
  for (const row of table("global", "language_prefab")) {
    const match = /^p_v(\d+)a(\d+)_storeview_txt_title(\d+)$/.exec(String(row.id || ""));
    if (!match) continue;
    const code = 100 + Number(match[1]) * 10 + Number(match[2]);
    const group = Number(match[3]);
    if (!sets.has(code)) sets.set(code, new Map());
    sets.get(code).set(group, {
      en: asText(lookup("en", row.lang).value),
      zh: asText(lookup("zh", row.lang).value),
    });
  }
  return sets;
}

/** 139 -> "3.9"; 118 -> "1.8". */
function patchLabel(code) {
  const digits = String(code).slice(1);
  if (digits.length < 2) return digits;
  return `${digits.slice(0, -1)}.${digits.slice(-1)}`;
}

/** Splits `type#id#qty`; returns null when the string is not that shape. */
function parseRef(value) {
  const parts = String(value || "").split("#");
  if (parts.length < 3) return null;
  return { type: Number(parts[0]), id: String(parts[1]), amount: Number(parts[2]) || 0 };
}

export function eventShopData() {
  const activities = indexBy(table("global", "activity"), "id");
  const rows = table("global", "activity107");
  const titles = groupTitles();

  const tables = {
    item: indexBy(table("global", "item"), "id"),
    currency: indexBy(table("global", "currency"), "id"),
    equip: indexBy(table("global", "equip"), "id"),
    skin: indexBy(table("global", "skin"), "id"),
    character: indexBy(table("global", "character"), "id"),
    block_package: indexBy(table("global", "block_package"), "id"),
  };

  /** One goods row -> the shape the Planner tab renders. */
  const makeItem = (row) => {
    const product = parseRef(row.product);
    const cost = parseRef(row.cost);
    if (!product || !cost) return null;

    const tableName = TYPE_TABLES[product.type];
    const source = tableName ? tables[tableName].get(Number(product.id)) : null;
    const { en, zh } = source ? namePair(source, source.nameEn) : { en: "", zh: "" };
    const label = en || (source ? String(source.name || "") : "") || `type${product.type} #${product.id}`;
    const rarity = source ? Number(source.rare) + RARITY_OFFSET : 0;
    // Art: only emit a path the cache can actually serve.
    let icon = "";
    if (product.type === 9 && source) {
      const rel = `images/psychube_icon/${rarity}/${product.id}.png`;
      if (shipped(rel) || probe(EQUIP_ART, [source.icon, product.id])) icon = rel;
    } else if (product.type === 13) {
      // Wilderness land blocks share one icon; Myssal has no per-block art.
      if (shipped(WILDERNESS_ICON)) icon = WILDERNESS_ICON;
    } else if (product.type === 1 || product.type === 2) {
      const rel = `images/items/icon/${product.id}.png`;
      if (shipped(rel) || probe(ITEM_ART, [source?.icon, product.id]) || probe(CURRENCY_ART, [source?.icon, product.id])) {
        icon = rel;
      }
    } else if (product.type === 5 && source) {
      const rel = `images/headicon_small/${product.id}.png`;
      if (shipped(rel) || probe(HEAD_ART, [product.id])) icon = rel;
    } else if (product.type === 4 && source) {
      const rel = `images/headicon_small/${product.id}01.png`;
      if (shipped(rel) || probe(HEAD_ART, [`${product.id}01`])) icon = rel;
    }

    return {
      // `key` names the product; `uid` names the goods slot. The same product can
      // sit in two sections at different prices (Old Ticket is 230 in Ceremonial
      // Offering and 750 in Regular Reserve), so the slot is the only safe
      // identity for the Planner's per-row quantity.
      key: `${product.type}#${product.id}`,
      uid: String(row.id),
      type: product.type,
      id: product.id,
      amount: product.amount,
      name: label,
      nameZh: zh || label,
      rarity,
      icon,
      cost: cost.amount,
      costType: cost.type,
      costId: cost.id,
      originalCost: Number(row.originalCost) || 0,
      maxBuy: Number(row.maxBuyCount) || 0,
      featured: Number(row.specProduct) === 1,
    };
  };

  // Online shops, keyed by activity id.
  const shops = new Map();
  for (const row of rows) {
    if (row.isOnline !== true) continue;
    const id = Number(row.activityId);
    if (!shops.has(id)) shops.set(id, []);
    shops.get(id).push(row);
  }

  const describe = (id) => {
    const info = activities.get(id) || {};
    const list = shops.get(id) || [];
    return {
      id: String(id),
      patchCode: Math.floor(id / 100),
      patch: "",
      retro: Number(info.isRetroAcitivity) === 1,
      rows: list.length,
      name: asText(lookup("en", info.name).value) || asText(info.nameEn || "") || `Activity ${id}`,
      nameZh: asText(lookup("zh", info.name).value),
    };
  };

  const all = [...shops.keys()].map(describe);
  // A patch code is only trusted when the prefab shipped titles for it.
  const titled = all.filter((shop) => titles.has(shop.patchCode));
  const pool = titled.length ? titled : all;
  const newestCode = Math.max(...pool.map((shop) => shop.patchCode));
  const samePatch = pool.filter((shop) => shop.patchCode === newestCode);

  const rank = (shop) => [shop.retro ? 1 : 0, -shop.rows, -Number(shop.id)];
  const ordered = [...samePatch].sort((a, b) => {
    const [ar, ...rest] = rank(a);
    const [br, ...brest] = rank(b);
    if (ar !== br) return ar - br;
    for (let i = 0; i < rest.length; i += 1) if (rest[i] !== brest[i]) return rest[i] - brest[i];
    return 0;
  });

  const build = (shop) => {
    const info = activities.get(shop.id) || activities.get(Number(shop.id)) || {};
    const patchTitles = titles.get(shop.patchCode) || new Map();
    const groups = new Map();
    for (const row of shops.get(Number(shop.id)) || []) {
      const item = makeItem(row);
      if (!item) continue;
      const group = Number(row.group) || 1;
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push({ ...item, order: Number(row.order) || 0, slot: Number(row.id) });
    }

    const outGroups = [...groups.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([group, items]) => {
        const title = patchTitles.size === groups.size ? patchTitles.get(group) || {} : {};
        return {
          index: group,
          name: title.en || "",
          nameZh: title.zh || title.en || "",
          items: items
            // `specProduct` is the headline slot the game pins to the top.
            .sort((a, b) => Number(b.featured) - Number(a.featured) || a.order - b.order || a.slot - b.slot)
            .map(({ order, slot, ...item }) => item),
        };
      });

    // The event currency: the type/id the rows price in (one per shop).
    const first = outGroups[0]?.items?.[0];
    const moneyRow = first ? tables.currency.get(Number(first.costId)) : null;
    const moneyIcon = first ? `images/items/icon/${first.costId}.png` : "";
    const money =
      first && moneyRow
        ? {
            id: first.costId,
            name: namePair(moneyRow).en || `Currency ${first.costId}`,
            nameZh: namePair(moneyRow).zh,
            // Same probe rule as the goods rows: an asset the cache can serve.
            icon:
              shipped(moneyIcon) ||
              probe(CURRENCY_ART, [moneyRow.icon, first.costId]) ||
              probe(ITEM_ART, [moneyRow.icon, first.costId])
                ? moneyIcon
                : "",
          }
        : { id: "", name: "", nameZh: "", icon: "" };

    return {
      id: shop.id,
      name: shop.name,
      nameZh: shop.nameZh || shop.name,
      patch: patchLabel(shop.patchCode),
      retro: shop.retro,
      isCurrent: false,
      desc: asText(lookup("en", info.actDesc).value),
      descZh: asText(lookup("zh", info.actDesc).value),
      money,
      groups: outGroups,
    };
  };

  const built = ordered.map(build).filter((shop) => shop.groups.length);
  if (!built.length) {
    return { patch: "", current: "", shops: [] };
  }
  built[0].isCurrent = true;

  return {
    patch: built[0].patch,
    current: built[0].id,
    shops: built,
  };
}
