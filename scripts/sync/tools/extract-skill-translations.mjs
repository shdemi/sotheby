/**
 * One-time extraction of the hand-authored text that the skill tables cannot provide.
 *
 * Writes `content/translations/skills.json`, which the pipeline merges into
 * `data/character_skills.json`, keyed by game id:
 *
 *   "<charId>": {
 *     nameEn? / nameZh?          // only for CN-only characters (no global text yet)
 *     nameVi                     // Vietnamese is project content
 *     skills: { "<slot>|<subSlot>": {
 *        nameEn? / nameVi
 *        descEn? / descVi / artEn? / artVi        // ultimates only
 *        ranks: { "<n>": { descEn? / descVi / artEn? / artVi } }
 *     } },
 *     insights: { "<level>": { nameEn? / nameVi / descEn? / descVi } },
 *     portrays: { "<level>": { descEn? / descVi } },
 *     weapons                                  // collab weapon charts, hand-authored
 *   }
 *
 * Run once against the legacy `data/character_skills.json` before regenerating it:
 *   node scripts/sync/tools/extract-skill-translations.mjs
 *
 * It refuses to overwrite an existing file unless `--force` is passed.
 */
import fs from "node:fs";
import path from "node:path";
import { CONTENT, ROOT } from "../config.mjs";
import { table } from "../sources.mjs";
import { readJson, sortKeys, writeJson } from "../util.mjs";

/** Characters the global server ships; everything else is CN-only. */
const globalIds = new Set(table("global", "character").map((row) => String(row.id)));

const force = process.argv.includes("--force");
const source = path.join(ROOT, "data", "character_skills.json");
const target = path.join(CONTENT, "translations", "skills.json");

if (fs.existsSync(target) && !force) {
  console.error(`${path.relative(ROOT, target)} exists; pass --force to overwrite.`);
  process.exit(1);
}

const legacy = readJson(source);
const seen = new Set();
const out = {};

/** Legacy keys alias raw names to canonical ones; only the first hit per id matters. */
for (const entry of Object.values(legacy)) {
  const id = String(entry.id);
  if (seen.has(id)) continue;
  seen.add(id);

  const cnOnly = !globalIds.has(id);
  const item = {};

  if (cnOnly && entry.nameEn) item.nameEn = entry.nameEn;
  if (cnOnly && entry.nameZh) item.nameZh = entry.nameZh;
  if (entry.nameVi) item.nameVi = entry.nameVi;

  const skills = {};
  for (const skill of entry.skills || []) {
    const slot = `${skill.slot}|${skill.subSlot || ""}`;
    const record = {};
    if (cnOnly && skill.nameEn) record.nameEn = skill.nameEn;
    if (skill.nameVi) record.nameVi = skill.nameVi;

    const hasRanks = skill.ranks && Object.keys(skill.ranks).length;
    if (hasRanks) {
      const ranks = {};
      for (const [rank, data] of Object.entries(skill.ranks)) {
        const row = {};
        if (cnOnly && data.descEn) row.descEn = data.descEn;
        if (data.descVi) row.descVi = data.descVi;
        if (cnOnly && data.artEn) row.artEn = data.artEn;
        if (data.artVi) row.artVi = data.artVi;
        if (Object.keys(row).length) ranks[rank] = row;
      }
      if (Object.keys(ranks).length) record.ranks = ranks;
    } else {
      if (cnOnly && skill.descEn) record.descEn = skill.descEn;
      if (skill.descVi) record.descVi = skill.descVi;
      if (cnOnly && skill.artEn) record.artEn = skill.artEn;
      if (skill.artVi) record.artVi = skill.artVi;
    }

    if (Object.keys(record).length) skills[slot] = record;
  }
  if (Object.keys(skills).length) item.skills = skills;

  const insights = {};
  for (const insight of entry.insights || []) {
    const row = {};
    if (cnOnly && insight.nameEn) row.nameEn = insight.nameEn;
    if (insight.nameVi) row.nameVi = insight.nameVi;
    if (cnOnly && insight.descEn) row.descEn = insight.descEn;
    if (insight.descVi) row.descVi = insight.descVi;
    if (Object.keys(row).length) insights[String(insight.insight)] = row;
  }
  if (Object.keys(insights).length) item.insights = insights;

  const portrays = {};
  for (const portray of entry.portrays || []) {
    const row = {};
    if (cnOnly && portray.descEn) row.descEn = portray.descEn;
    if (portray.descVi) row.descVi = portray.descVi;
    if (Object.keys(row).length) portrays[String(portray.level)] = row;
  }
  if (Object.keys(portrays).length) item.portrays = portrays;

  if (Array.isArray(entry.weapons) && entry.weapons.length) item.weapons = entry.weapons;

  out[id] = item;
}

writeJson(target, sortKeys(out));
console.log(`wrote ${Object.keys(out).length} entries to ${path.relative(ROOT, target)}`);
