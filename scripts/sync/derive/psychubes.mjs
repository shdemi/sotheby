/**
 * `psychube_id.json` and the localized psychube summary.
 *
 * Key rule (AGENTS.md §5): a psychube is keyed by `"<appRarity>:<gameId>"` where
 * `appRarity = equip.rare + 1` (the game calls them 5★/6★, the app 5/6) and `gameId`
 * is `equip.id`. The old pipeline's invented sequential ids are gone.
 *
 * "Real" psychubes are `equip.rare >= 4`, excluding EXP materials (`isExpEquip`) and
 * the `Just Test` rows (id >= 10000). That yields 109 global rows (68 app-rarity 6,
 * 41 app-rarity 5). The 7 CN-only rows are appended so CN-ahead content still shows.
 */
import path from "node:path";
import { PSYCHUBE_RARITIES, RARITY_OFFSET } from "../config.mjs";
import { tryReadJson, writeJson } from "../util.mjs";
import { table, text } from "../sources.mjs";

/** app rarity keys, newest first. */
export const APP_RARITIES = PSYCHUBE_RARITIES;

function readEquips(server) {
  return table(server, "equip");
}

export function isRealPsychube(e) {
  return e.rare >= 4 && e.isExpEquip !== 1 && e.id < 10000;
}

/** `tag` ids ("1#2") -> human labels from `equip_tag.json`, in tag order. */
function tagLabels() {
  const tagTable = table("global", "equip_tag");
  const byId = new Map(tagTable.map((t) => [String(t.id), t]));
  return (tag) => {
    if (!tag) return [];
    return String(tag)
      .split("#")
      .filter(Boolean)
      .map((id) => text("en", byId.get(String(id))?.name) || id);
  };
}

/** gameId -> releasePatch, frozen from the legacy hand data (no game-data source). */
function releaseMap() {
  return tryReadJson(path.join(import.meta.dirname, "..", "legacy", "psychube-release.json")) || {};
}

/** index (gameId) -> raw equip row, global first then CN-only additions. */
export function allEquipRows() {
  const byId = new Map();
  for (const row of readEquips("global")) byId.set(row.id, row);
  for (const row of readEquips("cn")) if (!byId.has(row.id)) byId.set(row.id, row);
  return byId;
}

/** The clean psychube set as `{ 6: [row...], 5: [row...] }`, newest game id first. */
export function psychubeRows() {
  const rows = [...allEquipRows().values()].filter(isRealPsychube);
  const out = {};
  for (const rarity of APP_RARITIES) out[rarity] = [];
  for (const row of rows) {
    const rarity = row.rare + RARITY_OFFSET;
    if (!out[rarity]) continue;
    out[rarity].push({ rarity, row });
  }
  for (const rarity of APP_RARITIES) out[rarity].sort((a, b) => b.row.id - a.row.id);
  return out;
}

export function psychubeId() {
  const labels = tagLabels();
  const release = releaseMap();
  const rows = psychubeRows();
  const out = {};
  for (const rarity of APP_RARITIES) {
    out[String(rarity)] = rows[rarity].map(({ row }) => ({
      id: String(row.id),
      name: String(row.name_en || text("en", row.name) || row.name || "").trim(),
      nameCN: String(text("zh", row.name) || "").trim(),
      tags: labels(row.tag),
      release_patch: release[row.id] ? String(release[row.id]) : "",
    }));
  }
  return out;
}

/** old localStorage key -> new key, frozen from the last legacy `psychubes_data.json`. */
export function psychubeKeyMap() {
  return tryReadJson(path.join(import.meta.dirname, "..", "legacy", "psychube-migration.json")) || {};
}

export function writePsychubeOutputs(outDir) {
  writeJson(path.join(outDir, "psychube_id.json"), psychubeId());
  writeJson(path.join(outDir, "psychube_key_map.json"), psychubeKeyMap());
}
