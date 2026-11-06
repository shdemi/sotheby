/**
 * `psychubes_data.json` — the detailed psychube records the InfoBook renders.
 *
 * Everything structural comes from the game tables:
 *   identity   <- equip.json (name_en, rare, tag)
 *   baseStats  <- equip_strengthen.json (via equip.strengthType)
 *   breakAttrs <- equip_break_attr.json (breakLevel 0..3)
 *   amps       <- equip_skill.json (skillLv 1..5) + global language text
 *
 * Text rules:
 *   - English/Chinese come from the GLOBAL language files, because the CN repo
 *     ships empty language stubs.
 *   - CN-only rows still carry literal Chinese in `equip.desc` / `baseDesc`, and
 *     their English has not shipped yet.
 *   - Vietnamese is project content, not game data.
 *   The gaps are filled from `content/translations/psychubes.json`; game text wins
 *   whenever it exists, so the overlay only ever describes what the game lacks.
 */
import path from "node:path";
import { CONTENT, RARITY_OFFSET } from "../config.mjs";
import { tryReadJson } from "../util.mjs";
import { lookup, table } from "../sources.mjs";
import { allEquipRows, isRealPsychube, tagLabels } from "./psychubes.mjs";

/** Fields the app reads off each breakthrough tier, in the shipped order. */
const BREAK_KEYS = [
  "breakLevel",
  "attack",
  "hp",
  "def",
  "mdef",
  "cri",
  "recri",
  "criDmg",
  "criDef",
  "addDmg",
  "dropDmg",
  "heal",
  "clutch",
  "normalSkillRate",
];

/** id -> Map(breakLevel -> row); global rows win over CN rows. */
function breakRows() {
  const byId = new Map();
  for (const server of ["cn", "global"]) {
    for (const row of table(server, "equip_break_attr")) {
      if (!byId.has(row.id)) byId.set(row.id, new Map());
      byId.get(row.id).set(row.breakLevel, row);
    }
  }
  return byId;
}

/** strengthType -> stat row; global rows win. */
function strengthenRows() {
  const byType = new Map();
  for (const server of ["cn", "global"]) {
    for (const row of table(server, "equip_strengthen")) byType.set(row.strengthType, row);
  }
  return byType;
}

/** id -> Map(skillLv -> row); global rows win. */
function skillRows() {
  const byId = new Map();
  for (const server of ["cn", "global"]) {
    for (const row of table(server, "equip_skill")) {
      if (!byId.has(row.id)) byId.set(row.id, new Map());
      byId.get(row.id).set(row.skillLv, row);
    }
  }
  return byId;
}

/** Hand-authored translations, keyed by game id (see the extraction tool). */
function translations() {
  return tryReadJson(path.join(CONTENT, "translations", "psychubes.json")) || {};
}

/** True when a string still carries Chinese text (i.e. is not an English translation). */
function hasChinese(value) {
  return /[\u3400-\u9fff\uf900-\ufaff]/.test(String(value ?? ""));
}

export function psychubesData() {
  const rows = allEquipRows();
  const breakById = breakRows();
  const strengthenByType = strengthenRows();
  const skillById = skillRows();
  const labels = tagLabels();
  const release = tryReadJson(path.join(import.meta.dirname, "..", "legacy", "psychube-release.json")) || {};
  const content = translations();

  const psychubes = [...rows.values()]
    .filter(isRealPsychube)
    .map((row) => ({ rarity: row.rare + RARITY_OFFSET, row }))
    .filter(({ rarity }) => rarity === 5 || rarity === 6)
    .sort((a, b) => b.rarity - a.rarity || b.row.id - a.row.id);

  const out = {};
  for (const { rarity, row } of psychubes) {
    const id = String(row.id);
    const overlay = content[id] || {};
    const name = lookup("en", row.name_en || row.name).value || String(row.name ?? "");
    const nameCN = lookup("zh", row.name).value || String(row.name ?? "");

    const en = lookup("en", row.desc);
    const zh = lookup("zh", row.desc);
    const descEn = en.found && !hasChinese(en.value) ? en.value : overlay.descEn || "";
    const descZh = zh.found ? zh.value : String(row.desc ?? "");
    const descVi = overlay.descVi || descEn;

    const stats = strengthenByType.get(row.strengthType) || {};
    const breaks = [...(breakById.get(row.id)?.values() || [])].sort((a, b) => a.breakLevel - b.breakLevel);
    const skills = [...(skillById.get(row.id)?.values() || [])].sort((a, b) => a.skillLv - b.skillLv);

    out[`${rarity}:${id}`] = {
      id,
      gameId: Number(id),
      rarity,
      name,
      nameCN,
      nameVi: name,
      tags: labels(row.tag),
      releasePatch: release[id] ? String(release[id]) : "",
      icon: `images/psychube_icon/${rarity}/${id}.png`,
      descZh,
      descEn,
      descVi,
      baseStats: { atk: stats.atk ?? 0, hp: stats.hp ?? 0, def: stats.def ?? 0, mdef: stats.mdef ?? 0 },
      breakAttrs: breaks.map((b) => Object.fromEntries(BREAK_KEYS.map((key) => [key, b[key] ?? 0]))),
      amplifications: skills.map((skill) => {
        const amp = overlay.amplifications?.[String(skill.skillLv)] || {};
        const ampEn = lookup("en", skill.baseDesc);
        const ampZh = lookup("zh", skill.baseDesc);
        const textEn = ampEn.found && !hasChinese(ampEn.value) ? ampEn.value : amp.descEn || "";
        return {
          level: skill.skillLv,
          descZh: ampZh.found ? ampZh.value : String(skill.baseDesc ?? ""),
          descEn: textEn,
          descVi: amp.descVi || textEn,
        };
      }),
    };
  }
  return out;
}
