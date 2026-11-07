/**
 * `future_sight.json` — content present in the CN server but not yet in global.
 *
 * Everything here is a pure set difference between the two St-Pavlov checkouts:
 *   Character  CN-only characters that are real arcanists (present in ArcanistMap)
 *   Psychube   CN-only real psychubes, grouped by app rarity
 *   Skin       CN-only skins belonging to real arcanists
 *   Euphoria   characters whose destiny (euphoria) facets exist in CN but not global
 *
 * Note: the legacy hand-maintained file listed only a stale subset of skins/euphoria.
 * The derived version is complete; see AGENTS.md §10.
 */
import path from "node:path";
import { RARITY_OFFSET } from "../config.mjs";
import { writeJson } from "../util.mjs";
import { table } from "../sources.mjs";
import { canonicalName } from "./names.mjs";
import { arcanistIds } from "./arcanistMap.mjs";
import { APP_RARITIES, allEquipRows, isRealPsychube } from "./psychubes.mjs";

/** CN-only characters, newest first (CN appends new rows, so reverse its order). */
export function futureCharacters() {
  const globalIds = new Set(table("global", "character").map((c) => c.id));
  const arcanists = arcanistIds();
  const cn = table("cn", "character");
  const out = [];
  for (let i = cn.length - 1; i >= 0; i--) {
    const ch = cn[i];
    if (globalIds.has(ch.id)) continue;
    if (!arcanists.has(ch.id)) continue; // not a playable arcanist (e.g. APPLe)
    out.push(canonicalName(ch.id));
  }
  return out;
}

/** CN-only psychubes grouped by app rarity: `{ "6": ["1579", ...], "5": [...] }`. */
export function futurePsychubes() {
  const globalIds = new Set(table("global", "equip").map((e) => e.id));
  const out = {};
  for (const rarity of APP_RARITIES) out[String(rarity)] = [];
  for (const row of allEquipRows().values()) {
    if (!isRealPsychube(row)) continue;
    if (globalIds.has(row.id)) continue;
    const rarity = row.rare + RARITY_OFFSET;
    if (!out[String(rarity)]) continue;
    out[String(rarity)].push(row.id);
  }
  for (const rarity of APP_RARITIES) out[String(rarity)].sort((a, b) => b - a);
  const strings = {};
  for (const rarity of APP_RARITIES) strings[String(rarity)] = out[String(rarity)].map(String);
  return strings;
}

/** CN-only skin ids for real arcanists, newest first. */
export function futureSkins() {
  const globalIds = new Set(table("global", "skin").map((s) => s.id));
  const arcanists = arcanistIds();
  const out = [];
  for (const skin of table("cn", "skin")) {
    if (globalIds.has(skin.id)) continue;
    if (!arcanists.has(skin.characterId)) continue;
    out.push(skin.id);
  }
  out.sort((a, b) => b - a);
  return out.map(String);
}

/**
 * Characters whose destiny facets are partly or wholly absent from global.
 * Formatted `"<name>: <facetCountInCn>"` to match the legacy shape.
 */
export function futureEuphorias() {
  const globalFacets = new Map();
  for (const d of table("global", "character_destiny")) {
    globalFacets.set(d.heroId, String(d.facetsId || "").split("#").filter(Boolean));
  }
  const out = [];
  for (const d of table("cn", "character_destiny")) {
    const cnFacets = String(d.facetsId || "").split("#").filter(Boolean);
    const globalList = globalFacets.get(d.heroId) || [];
    const missing = cnFacets.filter((f) => !globalList.includes(f));
    if (!missing.length) continue;
    out.push({ heroId: d.heroId, count: cnFacets.length });
  }
  out.sort((a, b) => b.heroId - a.heroId);
  return out.map((e) => `${canonicalName(e.heroId)}: ${e.count}`);
}

export function futureSight() {
  return {
    Character: futureCharacters(),
    Euphoria: futureEuphorias(),
    Skin: futureSkins(),
    Psychube: futurePsychubes(),
  };
}

export function writeFutureSightOutput(outDir) {
  writeJson(path.join(outDir, "future_sight.json"), futureSight());
}
