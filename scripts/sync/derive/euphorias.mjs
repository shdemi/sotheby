/**
 * `character_euphorias.json` — every Euphoria tree, keyed by character name.
 *
 * The game calls them "destiny": `character_destiny` points a hero at one or
 * more facet ids, `character_destiny_facets` holds the rank rows, and
 * `character_destiny_facets_consume` carries the display name, tags and the
 * upgrade cost. `destiny_facets_ex_level` adds the "portrait" tiers for the
 * handful of heroes that have them.
 *
 * Numbers and structure come from those tables. The global server wins, but the
 * CN server is ahead, so a hero's facet list is the union of both and CN rows
 * fill in whatever global has not shipped yet — that is how the CN-only trees
 * appear. Text always comes from the GLOBAL language files: global rows point at
 * `language_*` keys, while CN-only rows carry literal Chinese, which is why
 * literal text is only accepted for `zh`.
 *
 * English for CN-only rows and the `version` label (editorial, not game data)
 * come from `content/translations/euphorias.json`.
 *
 * Rank descriptions embed skill names as `▩N%s`, where N indexes:
 *   0 insight passive, 1 first incantation, 2 second incantation, 3 ultimate.
 * `skillNameResolver()` is the only place that mapping lives.
 */
import path from "node:path";
import { CONTENT, LANGS } from "../config.mjs";
import { parseMaterialList, sortKeys, tryReadJson } from "../util.mjs";
import { lookup, stripMarkup, table } from "../sources.mjs";
import { canonicalName, charactersById } from "./names.mjs";

/** Brackets the game uses around skill names, per language. */
const BRACKETS = {
  en: ["[", "]"],
  zh: ["【", "】"],
  tw: ["【", "】"],
  jp: ["【", "】"],
  kr: ["[", "]"],
};

/** Placeholder used in the rank text for "the skill at index N". */
const PLACEHOLDER = /▩(\d+)%s/g;

/** CN-only rows store literal Chinese instead of a `language_*` key. */
function isLiteral(key) {
  return key !== undefined && key !== null && String(key) !== "" && !String(key).startsWith("language_");
}

/** Global rows win over CN rows; CN only fills in ids the global server lacks. */
function mergedTable(name, key) {
  const map = new Map();
  for (const server of ["cn", "global"]) {
    for (const row of table(server, name)) map.set(row[key], row);
  }
  return map;
}

/** heroId -> facet ids, in the order the game lists them (global order, CN extras appended). */
function destinyFacets() {
  const map = new Map();
  for (const server of ["global", "cn"]) {
    for (const row of table(server, "character_destiny")) {
      const ids = String(row.facetsId || "").split("#").filter(Boolean);
      const seen = map.get(row.heroId) || [];
      for (const id of ids) if (!seen.includes(id)) seen.push(id);
      map.set(row.heroId, seen);
    }
  }
  return map;
}

/** `facetsId:level` -> facet row. */
function facetRows() {
  const map = new Map();
  for (const server of ["cn", "global"]) {
    for (const row of table(server, "character_destiny_facets")) {
      map.set(`${row.facetsId}:${row.level}`, row);
    }
  }
  return map;
}

/** facetsId -> `{ [skillLevel]: facet row }` for the portrait tiers. */
function portraitRows() {
  const map = new Map();
  for (const server of ["cn", "global"]) {
    for (const row of table(server, "destiny_facets_ex_level")) {
      if (!map.has(row.heroId)) map.set(row.heroId, new Map());
      map.get(row.heroId).set(row.skillLevel, row);
    }
  }
  return map;
}

/** The insight passive is the first `skillGroup: 1` row of `skill_passive_level`. */
function passiveSkills() {
  const map = new Map();
  for (const server of ["global", "cn"]) {
    for (const row of table(server, "skill_passive_level")) {
      if (row.skillGroup === 1 && !map.has(row.heroId)) map.set(row.heroId, row.skillPassive);
    }
  }
  return map;
}

/**
 * The ultimate of heroes whose `character.exSkill` is 0 lives at the group-3
 * skill of their default skin family (`<skinId><group><rank>`). Nautika is the
 * only character in the roster that needs this.
 */
function ultimateSkills(chars) {
  const map = new Map();
  for (const server of ["cn", "global"]) {
    for (const row of table(server, "skill")) {
      const id = String(row.id);
      if (!row.heroId || id.length !== 8 || id[6] !== "3") continue;
      const ch = chars.get(row.heroId);
      if (!ch || id.slice(0, 6) !== String(ch.skinId)) continue;
      const rank = Number(id.slice(7));
      const prev = map.get(ch.id);
      if (prev === undefined || rank < Number(String(prev).slice(7))) map.set(ch.id, row.id);
    }
  }
  return map;
}

/** id -> skill row (global wins). */
function skillRows() {
  const map = new Map();
  for (const server of ["cn", "global"]) {
    for (const row of table(server, "skill")) map.set(row.id, row);
  }
  return map;
}

/** Per character, per language: the four names a rank description can embed. */
function skillNameResolver() {
  const chars = charactersById();
  const passives = passiveSkills();
  const ultimates = ultimateSkills(chars);
  const skills = skillRows();

  const name = (lang, id) => {
    const row = id ? skills.get(Number(id)) : null;
    if (!row) return "";
    if (isLiteral(row.name)) return lang === "zh" ? stripMarkup(row.name) : "";
    const found = lookup(lang, row.name);
    return found.found ? found.value : "";
  };

  return (charId, lang) => {
    const ch = chars.get(charId);
    if (!ch) return [];
    const groups = String(ch.skill || "").split("|");
    const first = (group) => Number(String(group || "").split("#")[1]) || 0;
    return [
      name(lang, passives.get(charId)),
      name(lang, first(groups[0])),
      name(lang, first(groups[1])),
      name(lang, Number(ch.exSkill) || ultimates.get(charId)),
    ];
  };
}

/** Replaces every `▩N%s` with the bracketed skill name for that language. */
function resolvePlaceholders(text, names, lang) {
  const [open, close] = BRACKETS[lang] || BRACKETS.en;
  return String(text ?? "").replace(PLACEHOLDER, (token, index) => {
    const name = names[Number(index)] || "";
    return name ? `${open}${name}${close}` : "";
  });
}

/** One game text field in one language, placeholders resolved. */
function localized(lang, key, charId, resolve) {
  if (key === undefined || key === null || key === "") return "";
  if (isLiteral(key)) {
    // CN-only rows carry literal Chinese, so they can only feed `zh`.
    return lang === "zh" ? resolvePlaceholders(stripMarkup(key), resolve(charId, lang), lang).trim() : "";
  }
  const found = lookup(lang, key);
  if (!found.found) return "";
  return resolvePlaceholders(found.value, resolve(charId, lang), lang).trim();
}

/** Hand-authored English for CN-only rows and the edition label of each tree. */
function overlay() {
  return tryReadJson(path.join(CONTENT, "translations", "euphorias.json")) || {};
}

export function characterEuphorias() {
  const chars = charactersById();
  const destiny = destinyFacets();
  const consume = mergedTable("character_destiny_facets_consume", "facetsId");
  const facets = facetRows();
  const portraits = portraitRows();
  const resolve = skillNameResolver();
  const content = overlay();

  const out = {};
  for (const [charId] of chars) {
    const ids = destiny.get(charId);
    if (!ids) continue;
    const entries = [];
    for (const rawId of ids) {
      const id = Number(rawId);
      const cost = consume.get(id) || {};
      const extra = content[String(id)] || {};

      const name = {};
      for (const lang of LANGS) name[lang] = localized(lang, cost.name, charId, resolve);
      if (!name.en) name.en = extra.nameEn || "";
      if (!name.zh) name.zh = extra.nameZh || "";
      for (const lang of LANGS) {
        if (lang !== "en" && lang !== "zh" && !name[lang]) name[lang] = "N/A";
      }

      // The game's keyword field is one localized string, with `#` between labels.
      const tags = localized("en", cost.keyword, charId, resolve)
        .split("#")
        .map((part) => part.trim())
        .filter(Boolean);
      if (!tags.length) tags.push(...(extra.tags || []));

      const levels = [];
      for (let level = 1; level <= 5; level += 1) {
        const row = facets.get(`${id}:${level}`);
        if (row) levels.push(row);
      }

      const ranks = levels.map((row) => {
        const description = {};
        for (const lang of LANGS) {
          let value = localized(lang, row.desc, charId, resolve);
          if (!value && lang === "en") value = extra.ranks?.[String(row.level)] || "";
          description[lang] = value || "N/A";
        }
        // Vietnamese is hand-authored (the game has no vi locale); empty falls
        // back to English in the app.
        description.vi = extra.vi?.ranks?.[String(row.level)] || "";
        return { rank: row.level, description };
      });

      const entry = {
        name,
        id,
        tags,
        materials: parseMaterialList(cost.consume)
          .filter((item) => item.type === 1)
          .map((item) => ({ id: Number(item.id), amount: item.amount })),
        ranks,
      };

      const portraitLevels = [...(portraits.get(id)?.values() || [])].sort((a, b) => a.skillLevel - b.skillLevel);
      if (portraitLevels.length) {
        entry.portraits = portraitLevels.map((row) => {
          const key = `p${row.skillLevel}`;
          const description = {};
          for (const lang of LANGS) {
            let value = localized(lang, row.desc, charId, resolve);
            if (!value && lang === "en") value = extra.portraits?.[key] || "";
            description[lang] = value || "N/A";
          }
          return { [key]: { description } };
        });
      }

      if (extra.version) entry.version = String(extra.version);

      entries.push(entry);
    }
    if (entries.length) out[canonicalName(charId)] = entries;
  }
  return sortKeys(out);
}
