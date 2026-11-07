/**
 * `data/ArcanistMap.json` — the character/skin identity map the app and the editor read.
 *
 * Until now this file was a copy of `mappings/ArcanistMap.json` from the Myssal asset
 * repo. It is derived from St-Pavlov now, so game data has game sources and Myssal is
 * only an image source (AGENTS.md §4):
 *
 *   entry   character.json (global + CN)  id, name (zh), nameEng, roleBirthday
 *   live2d  skin.json (global + CN)       id, name (zh), nameEng, des (zh),
 *                                         characterSkin (zh), characterSkinNameEng
 *                                         (literal English), skinDescription (zh)
 *
 * Characters are deduplicated by canonical name (`charactersByCanonicalName()`), so the
 * CN server's second APPLe row (`3999`) folds into the global one (`3028`) and the dummy
 * `9998` is dropped like everywhere else in the pipeline. Myssal-only fields the app
 * never reads (`signature`, `spine`, `cubism`, `alternateSpine`) are not emitted.
 *
 * Skins come from the union of both servers, global first so its language keys win over
 * the CN literals; the one difference the app can see is the two characters whose game
 * `nameEng` is newer than the Myssal copy.
 */
import { table, text } from "../sources.mjs";
import { charactersByCanonicalName, charactersById } from "./names.mjs";

/** Chinese game text: `text()` resolves a global `language_*` key and passes CN literals through. */
function zh(value) {
  if (value === undefined || value === null) return "";
  return text("zh", value);
}

/** Display names are trimmed; descriptive text keeps its line breaks. */
function trim(value) {
  if (value === undefined || value === null) return "";
  return String(value).trim();
}

/** Skin rows of the kept characters, indexed by id (global row wins), then by hero. */
function skinsByCharacter(charIds) {
  const rows = new Map();
  for (const server of ["global", "cn"]) {
    for (const row of table(server, "skin")) {
      if (!charIds.has(row.characterId)) continue;
      if (!rows.has(row.id)) rows.set(row.id, row);
    }
  }

  const grouped = new Map();
  for (const row of rows.values()) {
    if (!grouped.has(row.characterId)) grouped.set(row.characterId, []);
    grouped.get(row.characterId).push(row);
  }
  for (const list of grouped.values()) list.sort((a, b) => a.id - b.id);
  return grouped;
}

/** One `live2d` skin, copied from the game row (the Myssal copy kept the same text). */
function skinEntry(row) {
  return {
    id: row.id,
    name: trim(zh(row.name)) || trim(row.nameEng),
    nameEng: trim(row.nameEng),
    des: zh(row.des),
    characterSkin: trim(zh(row.characterSkin)),
    characterSkinNameEng: trim(row.characterSkinNameEng),
    skinDescription: zh(row.skinDescription),
  };
}

/** The full map, ascending by game id: one entry per real arcanist. */
export function arcanistMap() {
  const chars = charactersById();
  const kept = [...charactersByCanonicalName().values()].sort((a, b) => a - b);
  const skins = skinsByCharacter(new Set(kept));

  return kept.map((id) => {
    const ch = chars.get(id);
    return {
      id,
      name: trim(zh(ch.name)) || trim(ch.nameEng),
      nameEng: trim(ch.nameEng),
      roleBirthday: trim(ch.roleBirthday),
      live2d: (skins.get(id) || []).map(skinEntry),
    };
  });
}

/** Ids of the real arcanists (the map's key set), used to gate future-sight rows. */
export function arcanistIds() {
  return new Set(arcanistMap().map((entry) => entry.id));
}
