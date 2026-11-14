/**
 * `type#id#qty` consume strings -> `[{ material, quantity }]`.
 *
 * Four tables use the same shape: `character_rank` (insight), `character_talent`
 * (resonance), `talent_style_cost` (resonance patterns) and `character_cosume`
 * (the per-level Dust/Sharpodonty curve). `type 1` is an `item` row and `type 2`
 * is a `currency` row; only Dust (`2#5`) and Sharpodonty (`2#3`) actually appear,
 * so the two currencies are named here instead of read out of `currency`.
 */
import { table, text } from "../sources.mjs";

let itemMap = null;

function items() {
  if (!itemMap) itemMap = new Map(table("global", "item").map((item) => [item.id, item]));
  return itemMap;
}

const CURRENCIES = { "2#3": "Sharpodonty", "2#5": "Dust" };

/** "2#3" is Sharpodonty, "2#5" Dust; everything else is an `item` row. */
export function materialName(type, id) {
  const currency = CURRENCIES[`${type}#${id}`];
  if (currency) return currency;
  const item = items().get(Number(id));
  if (!item) return `Item_${id}`;
  return text("en", item.name) || String(item.name);
}

/** Splits one consume string into its material rows. */
export function materialsFrom(consume) {
  return String(consume || "")
    .split("|")
    .filter(Boolean)
    .map((part) => {
      const [type, id, quantity] = part.split("#");
      return { material: materialName(type, id), quantity: Number(quantity) };
    });
}

/** Same as `materialsFrom`, but keyed by `type#id` (the level curve needs the split). */
export function costParts(consume) {
  const out = new Map();
  for (const part of String(consume || "").split("|")) {
    if (!part) continue;
    const [type, id, quantity] = part.split("#");
    out.set(`${type}#${id}`, Number(quantity));
  }
  return out;
}
