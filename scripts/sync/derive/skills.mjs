/**
 * `character_skills.json` — every arcanist's incantations, insight passives and
 * portrays, keyed by the canonical roster name.
 *
 * Numbers and text come from the two St-Pavlov checkouts: `character` says which
 * skill ids a hero owns (and `character_rank_replace` overrides that for the
 * heroes whose kit was reworked), `skill` carries names/icons/art, `skill_effect`
 * carries descriptions, `skill_passive_level` the three insights and
 * `skill_ex_level` the five portrays. The CN server fills in heroes global has
 * not shipped yet, so every table is merged CN-then-global (global wins).
 *
 * Text always comes from the global language files. CN-only rows carry literal
 * Chinese instead of `language_*` keys, so literal text is only accepted for
 * `zh`; their English and every Vietnamese string live in
 * `content/translations/skills.json`.
 *
 * Device heroes (Coppélia, Everecho and The Twins) take their incantation sets
 * from `fight_device` because those are the real in-battle stances; Hedone also
 * has a device but its `character.skill` is already the full kit, so it uses the
 * normal path (the device is still consulted for `cost`).
 *
 * Rank text embeds skill names as `▩N%s` with the same mapping as Euphoria:
 *   0 insight passive, 1 first incantation, 2 second incantation, 3 ultimate.
 * Placeholders are resolved per language instead of being deleted.
 */
import path from "node:path";
import { CONTENT, MAPS } from "../config.mjs";
import { sortKeys, tryReadJson } from "../util.mjs";
import { language, lookup, stripMarkup, table } from "../sources.mjs";
import { canonicalName, charactersById } from "./names.mjs";

/** Brackets the game uses around embedded skill names, per output language. */
const BRACKETS = {
  en: ["[", "]"],
  zh: ["【", "】"],
  vi: ["[", "]"],
};

const PLACEHOLDER = /▩(\d+)%s/g;

/** CN-only rows store literal Chinese instead of a `language_*` key. */
function isLiteral(key) {
  return key !== undefined && key !== null && String(key) !== "" && !String(key).startsWith("language_");
}

/** CN then global; global rows win on id conflicts, CN fills the gaps. */
function mergedById(name) {
  const map = new Map();
  for (const server of ["cn", "global"]) {
    for (const row of table(server, name)) map.set(row.id, row);
  }
  return map;
}

/** Same merge, keyed by `heroId#skillLevel` for the passive/portray tables. */
function mergedByHeroLevel(name) {
  const map = new Map();
  for (const server of ["cn", "global"]) {
    for (const row of table(server, name)) map.set(`${row.heroId}#${row.skillLevel}`, row);
  }
  return map;
}

/** One game text field in one language. Literal Chinese is only valid for `zh`. */
function localized(lang, key) {
  if (key === undefined || key === null || key === "") return "";
  if (isLiteral(key)) return lang === "zh" ? stripMarkup(String(key)) : "";
  const found = lookup(lang, key);
  return found.found ? found.value : "";
}

/** Like `localized()`, but keeps the game's inline markup (`<i>`, `<1>`). */
function rawLocalized(lang, key) {
  if (key === undefined || key === null || key === "") return "";
  if (isLiteral(key)) return lang === "zh" ? String(key) : "";
  const value = language(lang).get(String(key));
  return value === undefined ? "" : value;
}

/**
 * The same tag cleanup the legacy generator applied: drop references and
 * formatting wrappers, but keep the `<1>`/`<2>` entry markers the game uses to
 * tell repeated portray lines apart.
 */
function cleanGame(value, name = "") {
  let text = String(value ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<id:.*?>/g, "")
    .replace(/<color=.*?>/g, "")
    .replace(/<\/color>/g, "")
    .replace(/<link=.*?>/g, "")
    .replace(/<\/link>/g, "")
    .replace(/<nobr>/g, "")
    .replace(/<\/nobr>/g, "")
    .replace(/\[\d+\]/g, "");
  if (name) text = text.replace(/\{name\}/g, name);
  return text.trim();
}

/** Replaces every `▩N%s` with the bracketed name `nameFor(N)` supplies. */
function resolve(value, nameFor, lang) {
  const [open, close] = BRACKETS[lang] || BRACKETS.en;
  return String(value ?? "").replace(PLACEHOLDER, (token, index) => {
    const name = nameFor(Number(index)) || "";
    return name ? `${open}${name}${close}` : "";
  });
}

/** First id of a `#`/`|` list (`31490171#31492171|…` -> `31490171`). */
function firstId(value) {
  return String(value || "").split("|")[0].split("#")[0];
}

/** Hand-authored Vietnamese and CN-only English, plus the collab weapon charts. */
function overlay() {
  return tryReadJson(path.join(CONTENT, "translations", "skills.json")) || {};
}

export function characterSkills() {
  const chars = charactersById();
  const skills = mergedById("skill");
  const effects = mergedById("skill_effect");
  const devices = mergedById("fight_device");
  const replaces = mergedById("character_rank_replace");
  const passives = mergedByHeroLevel("skill_passive_level");
  const portrays = mergedByHeroLevel("skill_ex_level");
  const extras = tryReadJson(path.join(MAPS, "skill-extras.json")) || {};
  const deviceRanks = tryReadJson(path.join(MAPS, "device-ranks.json")) || {};
  const content = overlay();

  /** `<skillId> -> harmonisation cost` from the device's `skill1`/`skill2` fields. */
  const costs = new Map();
  for (const device of devices.values()) {
    for (const slot of ["skill1", "skill2"]) {
      if (!device[slot]) continue;
      for (const part of String(device[slot]).split("|")) {
        const [, , cost] = part.split("#");
        if (cost !== undefined) costs.set(Number(part.split("#")[0]), Number(cost));
      }
    }
  }

  /** The `60292#<n>` behaviour on a skill effect carries the harmonisation cost. */
  function harmonization(skillEffect) {
    const effect = effects.get(skillEffect);
    if (!effect) return null;
    for (let i = 1; i <= 20; i += 1) {
      const behavior = effect[`behavior${i}`];
      if (typeof behavior === "string" && behavior.startsWith("60292#")) {
        return Number(behavior.split("#")[1]);
      }
    }
    return null;
  }

  function skillName(lang, id) {
    const row = id ? skills.get(Number(id)) : null;
    return row ? localized(lang, row.name) : "";
  }

  /** The four skill names a rank description can embed, per language. */
  function slotNames(charId, lang) {
    const ch = chars.get(charId);
    const replace = replaces.get(charId);
    const groups = String(replace?.skill || ch.skill || "")
      .split("|")
      .filter(Boolean);
    const firstOf = (group) => (group ? group.split(",")[0].split("#")[1] : "");
    const passive = passives.get(`${charId}#1`);
    const ultimate = Number(replace?.exSkill) || ch.exSkill;
    return [
      skillName(lang, passive?.skillPassive),
      skillName(lang, firstOf(groups[0])),
      skillName(lang, firstOf(groups[1])),
      skillName(lang, ultimate),
    ];
  }

  /** A game-text field, resolved and cleaned; empty when the game has no text. */
  function gameText(lang, key, name, names) {
    const raw = rawLocalized(lang, key);
    if (!raw) return "";
    return cleanGame(resolve(raw, (n) => names[n], lang), name);
  }

  function makeRank(sid, index, ctx) {
    const row = skills.get(sid);
    if (!row) return null;
    const effect = effects.get(row.skillEffect);
    const extra = ctx.skillOverlay.ranks?.[String(index)] || {};
    const entry = { id: sid };

    entry.descEn = gameText("en", effect?.desc, ctx.nameEn, ctx.names.en) || extra.descEn || "";
    entry.descZh = gameText("zh", effect?.desc, ctx.nameZh, ctx.names.zh) || extra.descZh || "";
    entry.descVi = extra.descVi || "";
    entry.artEn = gameText("en", row.desc_art, ctx.nameEn, ctx.names.en) || extra.artEn || "";
    entry.artZh = gameText("zh", row.desc_art, ctx.nameZh, ctx.names.zh) || extra.artZh || "";
    if (extra.artVi) entry.artVi = extra.artVi;

    if (costs.has(sid)) entry.cost = costs.get(sid);
    const harm = harmonization(row.skillEffect || sid);
    if (harm !== null) entry.harmonization = harm;
    return entry;
  }

  function buildRanks(rankIds, ctx) {
    const ranks = {};
    rankIds.forEach((sid, index) => {
      const rank = makeRank(sid, index + 1, ctx);
      if (rank) ranks[index + 1] = rank;
    });
    return ranks;
  }

  /** Common context for one hero: names plus the overlay row for a given skill. */
  function context(charId, ch, entry) {
    return {
      nameEn: entry.nameEn,
      nameZh: entry.nameZh,
      names: { en: slotNames(charId, "en"), zh: slotNames(charId, "zh") },
    };
  }

  /**
   * @param badge `{ en, zh }` card-type label a hero's extra skill overrides the
   *   heuristic with (e.g. Ms. Stranger's special card is a "Versatile" card even
   *   though its own name says nothing about it).
   */
  function incantation(slot, subSlot, type, rankIds, ctx, skillOverlay, badge = {}) {
    const first = skills.get(rankIds[0]);
    const inner = { ...ctx, skillOverlay };
    return {
      slot,
      subSlot,
      type,
      ...(badge.en ? { attribute: badge.en } : {}),
      ...(badge.zh ? { attributeZh: badge.zh } : {}),
      nameEn: localized("en", first?.name) || skillOverlay.nameEn || "",
      nameZh: localized("zh", first?.name) || skillOverlay.nameZh || "",
      nameVi: skillOverlay.nameVi || "",
      icon: first?.icon ? `images/skills/${first.icon}.png` : "",
      ranks: buildRanks(rankIds, inner),
    };
  }

  function ultimate(rankIds, ctx, skillOverlay, char) {
    const row = skills.get(rankIds[0]);
    const effect = effects.get(row?.skillEffect);
    const inner = { ...ctx, skillOverlay };
    const item = {
      slot: 3,
      type: "Ultimate",
      nameEn: localized("en", row?.name) || skillOverlay.nameEn || "",
      nameZh: localized("zh", row?.name) || skillOverlay.nameZh || "",
      nameVi: skillOverlay.nameVi || "",
      icon: row?.icon ? `images/skills/${row.icon}.png` : "",
      descEn: gameText("en", effect?.desc, ctx.nameEn, ctx.names.en) || skillOverlay.descEn || "",
      descZh: gameText("zh", effect?.desc, ctx.nameZh, ctx.names.zh) || skillOverlay.descZh || "",
      descVi: skillOverlay.descVi || "",
      artEn: gameText("en", row?.desc_art, ctx.nameEn, ctx.names.en) || skillOverlay.artEn || "",
      artZh: gameText("zh", row?.desc_art, ctx.nameZh, ctx.names.zh) || skillOverlay.artZh || "",
    };
    if (skillOverlay.artVi) item.artVi = skillOverlay.artVi;
    if (char.uniqueSkill_point && String(char.uniqueSkill_point).startsWith("4#")) {
      const harmCost = Number(String(char.uniqueSkill_point).split("#")[1]) || 100;
      item.harmonization = -harmCost;
    }
    return item;
  }

  function portrayDescription(row, charId, ctx, extra) {
    const make = (lang, name) => {
      const raw = rawLocalized(lang, row.desc);
      if (!raw) return "";
      const passiveId = firstId(row.passiveSkill) || (charId === 3149 ? 31490171 : "");
      const device = row.deviceId ? devices.get(row.deviceId) : null;
      const exId = row.skillEx || device?.uniqueSkill;
      const names = new Map([
        [0, skillName(lang, passiveId)],
        [1, skillName(lang, firstId(row.skillGroup1))],
        [2, skillName(lang, firstId(row.skillGroup2))],
        [3, skillName(lang, exId)],
      ]);
      if (device) {
        const s1 = String(device.skill1 || "").split("|");
        const s2 = String(device.skill2 || "").split("|");
        names.set(11, skillName(lang, firstId(s1[0])));
        names.set(12, skillName(lang, firstId(s1[1])));
        names.set(21, skillName(lang, firstId(s2[0])));
        names.set(22, skillName(lang, firstId(s2[1])));
      }
      return cleanGame(resolve(raw, (n) => names.get(n), lang), name);
    };

    return {
      descEn: make("en", ctx.nameEn) || extra.descEn || "",
      descZh: make("zh", ctx.nameZh) || extra.descZh || "",
      descVi: extra.descVi || "",
    };
  }

  // The CN server carries a duplicate APPLe row (3999) alongside the global one
  // (3028); both canonicalise to the same roster name, so keep the global row.
  const roster = new Map();
  for (const [charId, ch] of chars) {
    const name = canonicalName(charId);
    const previous = roster.get(name);
    if (!previous || (previous.ch._server === "cn" && ch._server === "global")) {
      roster.set(name, { charId, ch });
    }
  }

  const out = {};

  for (const [name, { charId, ch }] of roster) {
    const id = String(charId);
    const extra = content[id] || {};
    const entry = {
      id: charId,
      nameEn:
        ch._server === "global"
          ? lookup("en", ch.name).value.trim() || stripMarkup(ch.nameEng).trim() || extra.nameEn || ""
          : stripMarkup(ch.nameEng).trim() || extra.nameEn || "",
      nameZh: localized("zh", ch.name) || extra.nameZh || "",
      nameVi: extra.nameVi || "",
      skills: [],
      insights: [],
      portrays: [],
    };

    const ctx = context(charId, ch, entry);
    const skillOverlay = (slot, subSlot) => extra.skills?.[`${slot}|${subSlot || ""}`] || {};

    const device = ch.deviceId ? devices.get(ch.deviceId) : null;
    const deviceStances =
      device &&
      (device.specialPowerSkill ||
        String(device.skill1 || "").includes("|") ||
        String(device.skill2 || "").includes("|"));

    if (deviceStances) {
      const parseSlot = (value, slot) => {
        const parts = String(value || "").split("|").filter(Boolean);
        return parts.map((part, index) => {
          const sid = Number(part.split("#")[0]);
          const rankIds = deviceRanks[id]?.[sid] || [sid];
          const subSlot = parts.length > 1 ? `Set ${String.fromCharCode(65 + index)}` : "";
          return incantation(slot, subSlot, "Incantation", rankIds, ctx, skillOverlay(slot, subSlot));
        });
      };

      entry.skills.push(...parseSlot(device.skill1, 1));
      entry.skills.push(...parseSlot(device.skill2, 2));

      const ultId = Number(device.uniqueSkill) || ch.exSkill;
      if (ultId && skills.has(ultId)) {
        entry.skills.push(ultimate([ultId], ctx, skillOverlay(3, ""), ch));
      }

      for (const [index, part] of String(device.specialPowerSkill || "").split("|").filter(Boolean).entries()) {
        const sid = Number(part.split("#")[0]);
        const subSlot = `Special ${index + 1}`;
        entry.skills.push(incantation(4, subSlot, "Special", [sid], ctx, skillOverlay(4, subSlot)));
      }
    } else {
      const replace = replaces.get(charId);
      const skillStr = String(replace?.skill || ch.skill || "");
      const ultId = Number(replace?.exSkill) || ch.exSkill;

      for (const [groupIndex, group] of skillStr.split("|").filter(Boolean).entries()) {
        const subGroups = group.split(",").filter(Boolean);
        const slot = Number(subGroups[0].split("#")[0]) || (groupIndex === 0 ? 1 : 2);
        subGroups.forEach((subGroup, subIndex) => {
          const parts = subGroup.split("#").filter(Boolean);
          const rankIds = (subIndex === 0 ? parts.slice(1) : parts).map(Number);
          const subSlot = subGroups.length > 1 ? `Set ${String.fromCharCode(65 + subIndex)}` : "";
          entry.skills.push(incantation(slot, subSlot, "Incantation", rankIds, ctx, skillOverlay(slot, subSlot)));
        });
      }

      if (ultId && skills.has(ultId)) {
        entry.skills.push(ultimate([ultId], ctx, skillOverlay(3, ""), ch));
      }

      for (const extraSkill of extras[id] || []) {
        const { slot, subSlot, type, ranks, badge } = extraSkill;
        entry.skills.push(incantation(slot, subSlot, type, ranks, ctx, skillOverlay(slot, subSlot), badge));
      }
    }

    for (const row of [...passives.values()]
      .filter((p) => p.heroId === charId)
      .sort((a, b) => a.skillLevel - b.skillLevel)) {
      const skill = skills.get(row.skillPassive);
      const effect = skill ? effects.get(skill.skillEffect) : null;
      const own = extra.insights?.[String(row.skillLevel)] || {};
      entry.insights.push({
        insight: row.skillLevel,
        nameEn: localized("en", skill?.name) || own.nameEn || "",
        nameZh: localized("zh", skill?.name) || own.nameZh || "",
        nameVi: own.nameVi || "",
        descEn: gameText("en", effect?.desc, ctx.nameEn, ctx.names.en) || own.descEn || "",
        descZh: gameText("zh", effect?.desc, ctx.nameZh, ctx.names.zh) || own.descZh || "",
        descVi: own.descVi || "",
      });
    }

    for (const row of [...portrays.values()]
      .filter((p) => p.heroId === charId)
      .sort((a, b) => a.skillLevel - b.skillLevel)) {
      const own = extra.portrays?.[String(row.skillLevel)] || {};
      entry.portrays.push({ level: row.skillLevel, ...portrayDescription(row, charId, ctx, own) });
    }

    if (Array.isArray(extra.weapons) && extra.weapons.length) entry.weapons = extra.weapons;

    out[name] = entry;
  }

  return sortKeys(out);
}
