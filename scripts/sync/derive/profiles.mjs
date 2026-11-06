/**
 * `character_profiles.json` — damage type + role tags for the InfoBook.
 *
 *   dmgType  <- character.dmgType (1 = Reality, 2 = Mental)
 *   roleTags <- character.battleTag ids, resolved through character_battle_tag.json
 *
 * The battle-tag table is not language-keyed on the CN server (it ships literal
 * Chinese), so the English label for tags that only exist in CN comes from
 * `maps/battle-tags.json`. Everything else is read from the global language files.
 */
import path from "node:path";
import { MAPS } from "../config.mjs";
import { tryReadJson } from "../util.mjs";
import { lookup, table } from "../sources.mjs";
import { canonicalName, charactersById } from "./names.mjs";

/** battleTag id -> row, global first then CN-only additions. */
function battleTags() {
  const byId = new Map();
  for (const row of table("cn", "character_battle_tag")) byId.set(String(row.id), row);
  for (const row of table("global", "character_battle_tag")) byId.set(String(row.id), row);
  return byId;
}

/** Hand-written English/Chinese labels for tags the global server has not shipped. */
function overrides() {
  return (tryReadJson(path.join(MAPS, "battle-tags.json")) || {}).overrides || {};
}

const DMG_LABELS = {
  1: { en: "Reality", zh: "现实创伤" },
  2: { en: "Mental", zh: "精神创伤" },
};

export function characterProfiles() {
  const rows = [];
  const tags = battleTags();
  const override = overrides();
  const nameMap = (() => {
    const out = {};
    for (const [id, ch] of charactersById()) {
      out[id] = { ch, name: canonicalName(id) };
    }
    return out;
  })();

  for (const [id, { ch, name }] of Object.entries(nameMap)) {
    const dmg = DMG_LABELS[ch.dmgType] || { en: "", zh: "" };
    const ids = String(ch.battleTag || "")
      .split("#")
      .filter(Boolean)
      .filter((tagId) => String(tags.get(tagId)?.typeid ?? "") !== "1");
    const roleTags = [];
    const roleTagsZh = [];
    for (const tagId of new Set(ids)) {
      const tag = tags.get(tagId);
      const custom = override[tagId] || {};
      const en = custom.en || lookup("en", tag?.tagName).value;
      const zh = custom.zh || lookup("zh", tag?.tagName).value;
      if (en) roleTags.push(en);
      if (zh) roleTagsZh.push(zh);
    }

    rows.push({
      id: Number(id),
      key: name,
      value: {
        id: Number(id),
        dmgType: dmg.en,
        dmgTypeZh: dmg.zh,
        roleTags,
        roleTagsZh,
        nameZh: lookup("zh", ch.name).value || String(ch.nameEng ?? name),
      },
    });
  }

  rows.sort((a, b) => b.id - a.id);
  const out = {};
  for (const { key, value } of rows) out[key] = value;
  return out;
}
