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
 * A device field is a stance, not a slot: `skill1` is the first set and `skill2`
 * the second, and each `|` part inside one field is a card of that set (slot 1,
 * slot 2, …). The Twins' `skill1` therefore reads as "Set A: Atomic Fusion,
 * Polymeric Ray" and `skill2` as "Set B: Extreme Overclocking, Balancé Across
 * the Stars". Devices with one part per field (Coppélia, Everecho) have no
 * stance at all, so their parts stay slot 1 / slot 2.
 *
 * Conduit incantations have **one rank**: the game never upgrades them, so the
 * card shows its base numbers and no ★ selector.
 *
 * Rank text embeds skill names as `▩N%s` with the same mapping as Euphoria:
 *   0 insight passive, 1 first incantation, 2 second incantation, 3 ultimate.
 * Placeholders are resolved per language instead of being deleted.
 */
import path from "node:path";
import { CONTENT, MAPS, SKILL_SHOW_TAGS } from "../config.mjs";
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

/**
 * Panel chrome on a Perception Incantation card (37, Perchta, Huntsworn Lilya).
 * The wording is the glossary vocabulary (`Perception Incantation`,
 * `Perception Ability-1/-2`); VI keeps the English game terms.
 */
const PERCEPTION_LABELS = {
  tag: { en: "Perception Incantation", zh: "洞知咒语", vi: "Perception Incantation" },
  panels: {
    1: { en: "Perception Ability-1", zh: "洞知能力-1", vi: "Perception Ability-1" },
    2: { en: "Perception Ability-2", zh: "洞知能力-2", vi: "Perception Ability-2" },
  },
};

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

/**
 * Folds a trailing single-rank group back into the incantation set it continues.
 *
 * Brume's `character.skill` spells Calculated Path as
 * `…,313501112#313501122,313501132` — the rank-3 row sits in its own comma
 * group. The ids step evenly and the game gives both groups the same name, so
 * that extra "Set D" is really Set C's third rank.
 */
function mergeSetRanks(groups, nameOf) {
  const merged = [];
  for (const ids of groups) {
    const prev = merged[merged.length - 1];
    const step = prev && prev.length > 1 ? prev[1] - prev[0] : 0;
    if (
      prev &&
      ids.length === 1 &&
      step > 0 &&
      ids[0] - prev[prev.length - 1] === step &&
      nameOf(prev[0]) === nameOf(ids[0])
    ) {
      prev.push(ids[0]);
      continue;
    }
    merged.push([...ids]);
  }
  return merged;
}

/** Hand-authored Vietnamese and CN-only English, plus the collab weapon charts. */
function overlay() {
  return tryReadJson(path.join(CONTENT, "translations", "skills.json")) || {};
}

export function characterSkills() {
  const chars = charactersById();
  const skills = mergedById("skill");
  const effects = mergedById("skill_effect");
  // `skill_effect.showTag` is the game's own card-type label. `mergedById` lets global
  // win, but a few global ultimates leave the column blank while the CN row has it
  // (Perchta `31590151`'s ultimate), so this map keeps the first non-empty value with
  // global first and CN filling the gaps.
  const showTags = new Map();
  for (const server of ["global", "cn"]) {
    for (const row of table(server, "skill_effect")) {
      const raw = String(row.showTag ?? "").trim();
      if (raw && !showTags.has(row.id)) showTags.set(row.id, Number(raw));
    }
  }
  const devices = mergedById("fight_device");
  const replaces = mergedById("character_rank_replace");
  const passives = mergedByHeroLevel("skill_passive_level");
  const portrays = mergedByHeroLevel("skill_ex_level");
  // A Reinforce upgrade (Lucy) replaces a card with a stronger one; the game ships a
  // single step per card (`30860111` -> `30861111`), not a tier list.
  const breaklevels = ["cn", "global"].flatMap((server) => table(server, "hero_upgrade_breaklevel"));
  const upgradeOptions = mergedById("hero_upgrade_options");
  const extras = tryReadJson(path.join(MAPS, "skill-extras.json")) || {};
  // Cards the game labels differently from the heuristic in `app.js`
  // `getSkillBadgeText()`. Keyed by hero id, matched on the built card's slot.
  const badges = tryReadJson(path.join(MAPS, "skill-badges.json")) || {};
  // Cards whose variants are cast options instead of separate stance cards.
  const adaptive = tryReadJson(path.join(MAPS, "adaptive.json")) || {};
  const singleRank = new Set(tryReadJson(path.join(MAPS, "single-rank.json")) || []);
  const content = overlay();

  /**
   * `<base skill id> -> reinforced skill id` from `hero_upgrade_breaklevel`.
   *
   * `hero_upgrade_breaklevel` is not Reinforce-only: it also maps Rhiannon's base cards
   * onto her Bendith stance (`31460111` -> `31460211`). `hero_upgrade_options` is the
   * Reinforce table, so only the heroes it mentions (Lucy) are considered. The table also
   * carries two parallel copies of the same chain (`30863211` -> `30863111`,
   * `30865211` -> `30865111`) whose source ids are duplicates of the base card, so only
   * rows starting from the card's real id (the `01` family) are the in-game step.
   */
  const reinforceHeroes = new Set();
  for (const row of upgradeOptions.values()) {
    const ids = [row.replaceSkillGroup1, row.replaceSkillGroup2, row.replaceBigSkill, row.showSkillId]
      .filter(Boolean)
      .flatMap((value) => String(value).split(/[|#]/))
      .filter(Boolean);
    for (const raw of ids) {
      const sid = String(raw);
      if (sid.length === 8) reinforceHeroes.add(Number(sid.slice(0, 4)));
    }
  }

  const upgradeTarget = new Map();
  for (const row of breaklevels) {
    const from = String(row.skillId || "");
    if (from.length !== 8 || from.slice(4, 6) !== "01") continue;
    if (!reinforceHeroes.has(Number(from.slice(0, 4)))) continue;
    if (row.upgradeSkillId) upgradeTarget.set(Number(from), Number(row.upgradeSkillId));
  }

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
      charId: String(charId),
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
  function incantation(slot, subSlot, type, rankIds, ctx, skillOverlay, badge = {}, abilities = []) {
    const first = skills.get(rankIds[0]);
    const inner = { ...ctx, skillOverlay };
    // A Conduit incantation has a single rank: the game ships the ★2/★3 rows with
    // the same text (only the Harmonization changes), so the card shows one value.
    const shown = singleRank.has(ctx.charId) ? rankIds.slice(0, 1) : rankIds;
    const item = {
      slot,
      subSlot,
      type,
      ...(badge.en ? { attribute: badge.en } : {}),
      ...(badge.zh ? { attributeZh: badge.zh } : {}),
      nameEn: localized("en", first?.name) || skillOverlay.nameEn || "",
      nameZh: localized("zh", first?.name) || skillOverlay.nameZh || "",
      nameVi: skillOverlay.nameVi || "",
      icon: first?.icon ? `images/skills/${first.icon}.png` : "",
      ranks: buildRanks(shown, inner),
    };

    // A Perception Incantation card carries its extra ability panels and the
    // number of Perception Points it spends (`qtePowerCost` = "2#<n>").
    if (abilities.length) {
      const baseEffect = effects.get(first?.skillEffect);
      const cost = String(baseEffect?.qtePowerCost || "").split("#")[1];
      if (cost !== undefined && cost !== "") item.perceptionCost = Number(cost);
      item.perceptionTag = PERCEPTION_LABELS.tag;
      item.panels = abilities.map((sid, index) => {
        const row = skills.get(sid);
        const effect = row ? effects.get(row.skillEffect) : null;
        const own = skillOverlay.abilities?.[String(index + 1)] || {};
        return {
          label: PERCEPTION_LABELS.panels[index + 1],
          descEn: gameText("en", effect?.desc, ctx.nameEn, ctx.names.en) || own.descEn || "",
          descZh: gameText("zh", effect?.desc, ctx.nameZh, ctx.names.zh) || own.descZh || "",
          descVi: own.descVi || "",
        };
      });
    }

    return item;
  }

  function ultimate(rankIds, ctx, skillOverlay, char) {
    const row = skills.get(rankIds[0]);
    const effect = effects.get(row?.skillEffect);
    const inner = { ...ctx, skillOverlay };
    // The ultimate's card-type label (`Ultimate · Buff` on the detail board). Only
    // ultimates carry it in the generated data: every other card keeps the hand-pinned
    // labels of `maps/skill-badges.json`, which beat this table on purpose (AGENTS §10).
    const showTag = SKILL_SHOW_TAGS[showTags.get(row?.skillEffect)];
    const item = {
      slot: 3,
      type: "Ultimate",
      ...(showTag ? { attribute: showTag.en, attributeZh: showTag.zh } : {}),
      id: rankIds[0],
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
      const parts = (value) => String(value || "").split("|").filter(Boolean);
      const set1 = parts(device.skill1);
      const set2 = parts(device.skill2);
      /** True when the device's two fields are stances instead of slot 1 / slot 2. */
      const multiSet = set1.length > 1 || set2.length > 1;

      const parseSet = (set, setIndex) => {
        const subSlot = multiSet ? `Set ${String.fromCharCode(65 + setIndex)}` : "";
        return set.map((part, index) => {
          const sid = Number(part.split("#")[0]);
          const slot = multiSet ? index + 1 : setIndex + 1;
          return incantation(slot, subSlot, "Incantation", [sid], ctx, skillOverlay(slot, subSlot));
        });
      };

      entry.skills.push(...parseSet(set1, 0));
      entry.skills.push(...parseSet(set2, 1));

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
        const sets = mergeSetRanks(
          subGroups.map((subGroup, subIndex) => {
            const parts = subGroup.split("#").filter(Boolean);
            return (subIndex === 0 ? parts.slice(1) : parts).map(Number);
          }),
          (sid) => skills.get(sid)?.name || "",
        );
        sets.forEach((rankIds, subIndex) => {
          const subSlot = sets.length > 1 ? `Set ${String.fromCharCode(65 + subIndex)}` : "";
          entry.skills.push(incantation(slot, subSlot, "Incantation", rankIds, ctx, skillOverlay(slot, subSlot)));
        });
      }

      if (ultId && skills.has(ultId)) {
        entry.skills.push(ultimate([ultId], ctx, skillOverlay(3, ""), ch));
      }

      for (const extraSkill of extras[id] || []) {
        const { slot, subSlot, type, ranks, badge, requires, abilities } = extraSkill;
        const item = incantation(
          slot,
          subSlot,
          type,
          ranks,
          ctx,
          skillOverlay(slot, subSlot),
          badge,
          abilities,
        );
        if (requires) item.requires = requires;
        entry.skills.push(item);
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

    // Adaptive cards (Brume, Nautika): the game ships one card whose variants are picked
    // when casting ("choose 1 out of [A] and [B]"), not cards the reader switches between
    // with a stance tab. Fold the variants into the adaptive card as `adaptiveOptions` and
    // drop them from the strip, so the hero has no Set A/B/C bar; `app.js` draws them as
    // panels under the base text.
    const baseId = (s) => Number(Object.values(s.ranks || {})[0]?.id) || 0;
    for (const { card: cardId, options } of adaptive[id] || []) {
      const card = entry.skills.find((s) => baseId(s) === cardId);
      if (!card) continue;
      const optionCards = options.map((oid) => entry.skills.find((s) => baseId(s) === oid)).filter(Boolean);
      if (!optionCards.length) continue;
      card.adaptiveOptions = optionCards.map(({ subSlot, ...rest }) => rest);
      card.subSlot = "";
      entry.skills = entry.skills.filter((s) => !optionCards.includes(s));
    }

    // Pin the card-type label the heuristic would get wrong. Matched on the built
    // card's slot (+ sub-slot), so this patches a card instead of adding one. `badge`
    // covers every rank; `ranks` overrides one rank at a time, because the game relabels
    // a card when a later rank adds an effect (Click's S1 is Attack at ★1, Debuff at ★2).
    for (const { slot, subSlot = "", badge, ranks } of badges[id] || []) {
      const card = entry.skills.find((s) => s.slot === slot && (s.subSlot || "") === subSlot);
      if (!card) continue;
      if (badge?.en) {
        card.attribute = badge.en;
        if (badge.zh) card.attributeZh = badge.zh;
      }
      for (const [rank, rankBadge] of Object.entries(ranks || {})) {
        const row = card.ranks?.[rank];
        if (!row || !rankBadge?.en) continue;
        row.attribute = rankBadge.en;
        if (rankBadge.zh) row.attributeZh = rankBadge.zh;
      }
    }

    // Reinforce (Lucy). `hero_upgrade_breaklevel` maps each card onto its reinforced
    // version, so the whole state is a second rank set on the same card. `app.js` draws
    // a Base / Reinforce switch and swaps the text in place; no extra card is added.
    if (upgradeTarget.size) {
      for (const card of entry.skills) {
        const baseIds = card.ranks
          ? Object.keys(card.ranks)
              .map(Number)
              .sort((a, b) => a - b)
              .map((rk) => Number(card.ranks[rk].id))
          : [Number(card.id)];
        if (!baseIds[0]) continue;
        const ids = baseIds.map((sid) => upgradeTarget.get(sid));
        if (!ids.every((sid) => sid && skills.has(sid))) continue;
        // Vietnamese lives in the overlay under `<hero>.reinforce.<slot>.ranks`.
        const tierOverlay = extra.reinforce?.[String(card.slot)] || {};
        card.reinforce = { ranks: buildRanks(ids, { ...ctx, skillOverlay: tierOverlay }) };
      }
    }

    // Cards read left to right as S1, S2, Ultimate, Special. The build loop above
    // emits each stance block in the order the hero's `skill` string lists them and
    // appends the hand-mapped cards afterwards, so a stance hero (Rhiannon) would
    // otherwise put the ultimate first and the base stance's S1/S2 last. Sorting by
    // slot is stable, so cards that share a slot keep their stance order.
    entry.skills.sort((a, b) => a.slot - b.slot);

    out[name] = entry;
  }

  return sortKeys(out);
}
