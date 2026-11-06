/**
 * Sanity checks for the generated data. Run after `node scripts/sync/index.mjs`.
 *
 *   node scripts/sync/verify.mjs [dir]
 *
 * Every assertion below is a fact we verified by hand while building the pipeline;
 * if a game update breaks one, the pipeline needs a look before it is committed.
 */
import fs from "node:fs";
import path from "node:path";
import { OUT } from "./config.mjs";
import { readJson } from "./util.mjs";

const dir = process.argv[2] ? path.resolve(process.argv[2]) : OUT;
const read = (name) => readJson(path.join(dir, name));

let failures = 0;
const ok = (label, cond, detail = "") => {
  console.log(`${cond ? "ok  " : "FAIL"} ${label}${detail ? "  (" + detail + ")" : ""}`);
  if (!cond) failures++;
};

const rarity = read("characters_by_rarity.json");
const afflatus = read("characters_by_afflatus.json");
const psychubes = read("psychube_id.json");
const details = (() => {
  try {
    return readJson(path.join(OUT, "psychubes_data.json"));
  } catch {
    return null;
  }
})();
const future = read("future_sight.json");
const transfer = read("global_name_transfer.json");
const meta = read("_meta.json");

const flat = (obj) => Object.values(obj).flat();
const dups = (arr) => arr.filter((x, i) => arr.indexOf(x) !== i);

/** Every psychube as `{ key, rarity, id, row }`. */
const chubeEntries = Object.entries(psychubes).flatMap(([rarity, list]) =>
  list.map((row) => ({ key: `${rarity}:${row.id}`, rarity, id: String(row.id), row })),
);

// ---- characters -------------------------------------------------------------
const rarities = flat(rarity);
ok("rarity buckets are 2..6", Object.keys(rarity).every((k) => ["2", "3", "4", "5", "6"].includes(k)));
ok("no duplicate names in rarity", dups(rarities).length === 0, dups(rarities).join(","));
ok("no duplicate names in afflatus", dups(flat(afflatus)).length === 0, dups(flat(afflatus)).join(","));
ok("afflatus has no empty bucket", Object.values(afflatus).every((l) => l.length > 0));
ok("rarity and afflatus cover the same roster", rarities.length === flat(afflatus).length, `${rarities.length} vs ${flat(afflatus).length}`);

// ---- psychubes --------------------------------------------------------------
ok("psychube rarities are 5 and 6", Object.keys(psychubes).every((k) => k === "5" || k === "6"));
const chubes = flat(psychubes);
const ids = chubes.map((c) => String(c.id));
ok("psychube ids are unique", new Set(ids).size === ids.length);
ok("psychube keys are game ids (>= 1000)", chubes.every((c) => Number(c.id) >= 1000));
ok("psychube name + nameCN present", chubes.every((c) => c.name && c.nameCN));
ok("psychube tags are known labels", chubes.every((c) => c.tags.every((t) => ["ATK", "Critical", "Heal", "Survival", "Support"].includes(t))));
ok("psychube count is 6★+5★", chubes.length === (psychubes["6"]?.length || 0) + (psychubes["5"]?.length || 0));
ok(
  "every psychube has an icon file",
  chubeEntries.every((e) => fs.existsSync(path.join(OUT, "..", "images", "psychube_icon", e.rarity, `${e.id}.png`))),
  chubeEntries.filter((e) => !fs.existsSync(path.join(OUT, "..", "images", "psychube_icon", e.rarity, `${e.id}.png`))).map((e) => e.key).join(","),
);

if (details) {
  const missing = chubeEntries.filter((e) => !details[e.key]).map((e) => e.key);
  ok("psychubes_data covers psychube_id", missing.length === 0, missing.join(","));
  const detailRows = Object.entries(details).map(([key, row]) => ({ key, row }));
  ok("psychubes_data keys are `<rarity>:<gameId>`", detailRows.every(({ key, row }) => key === `${row.rarity}:${row.id}`));
  ok("psychubes_data has text in en/zh", detailRows.every(({ row }) => row.name && row.nameCN && row.descEn && row.descZh));
  ok("psychubes_data has vi text", detailRows.every(({ row }) => row.descVi));
  ok(
    "psychubes_data breakAttrs are 4 tiers or empty",
    detailRows.every(({ row }) => row.breakAttrs.length === 0 || row.breakAttrs.length === 4),
  );
  ok(
    "psychubes_data amplifications are 1..5 levels",
    detailRows.every(({ row }) => row.amplifications.length >= 1 && row.amplifications.length <= 5),
  );
}

// ---- future sight -----------------------------------------------------------
ok("future characters is a non-empty list", Array.isArray(future.Character) && future.Character.length > 0, String(future.Character.length));
const futureChubes = flat(future.Psychube);
ok("future psychubes are CN-only game ids", futureChubes.length === 7, futureChubes.join(","));
const knownKeys = new Set(ids);
ok("future psychubes exist in psychube_id", futureChubes.every((id) => knownKeys.has(id)));
ok("future skins are numeric strings", future.Skin.every((s) => /^\d+$/.test(s)));

// ---- profiles ---------------------------------------------------------------
const profiles = read("character_profiles.json");
const profileKeys = Object.keys(profiles);
ok("profiles cover the roster", rarities.every((name) => profiles[name]), rarities.filter((n) => !profiles[n]).join(","));
ok("profiles have no extra keys", profileKeys.every((name) => rarities.includes(name)), profileKeys.filter((n) => !rarities.includes(n)).join(","));
ok("profiles have a damage type", profileKeys.every((name) => ["Reality", "Mental"].includes(profiles[name].dmgType)));
ok("profiles role tags are arrays", profileKeys.every((name) => Array.isArray(profiles[name].roleTags)));

// ---- resonance shapes -------------------------------------------------------
const resoShape = read("character_reso_shape.json");
const patterns = read("shape_patterns.json");
const excluded = read("exclude_character.json");
ok("every character has one resonance shape", rarities.filter((n) => !excluded.includes(n)).every((n) => Object.values(resoShape).flat().includes(n)), rarities.filter((n) => !excluded.includes(n) && !Object.values(resoShape).flat().includes(n)).join(","));
ok("excluded characters are not in a shape", excluded.every((n) => !Object.values(resoShape).flat().includes(n)));
ok("every shape has patterns", Object.keys(resoShape).every((shape) => Array.isArray(patterns[shape]) && patterns[shape].length > 0));
ok("patterns are known resonance styles", Object.values(patterns).flat().every((p) => typeof p === "string" && p.length > 0));

// ---- euphorias ---------------------------------------------------------------
const euphorias = read("character_euphorias.json");
const euphoriaKeys = Object.keys(euphorias);
const euphoriaEntries = Object.values(euphorias).flat();
ok("euphoria trees are keyed by character", euphoriaKeys.length > 0 && euphoriaEntries.every((e) => Array.isArray(e.ranks) && e.ranks.length > 0));
ok(
  "euphoria ids are unique",
  new Set(euphoriaEntries.map((e) => e.id)).size === euphoriaEntries.length,
);
ok("euphoria trees are in the roster", euphoriaKeys.every((name) => rarities.includes(name)), euphoriaKeys.filter((n) => !rarities.includes(n)).join(","));
ok("euphoria name has en + zh", euphoriaEntries.every((e) => e.name.en && e.name.zh));
ok("euphoria tags are labels", euphoriaEntries.every((e) => Array.isArray(e.tags) && e.tags.length > 0));
ok("euphoria materials are numeric ids", euphoriaEntries.every((e) => e.materials.every((m) => Number(m.id) > 0 && m.amount > 0)));
ok(
  "euphoria ranks are 1..5 in order",
  euphoriaEntries.every((e) => e.ranks.every((r, i) => r.rank === i + 1) && e.ranks.length <= 5),
);
ok(
  "euphoria rank text has all five languages",
  euphoriaEntries.every((e) => e.ranks.every((r) => Object.keys(r.description).length === 5 && Object.values(r.description).every(Boolean))),
);
ok(
  "euphoria portraits are five tiers",
  euphoriaEntries.filter((e) => e.portraits).every((e) => e.portraits.length === 5 && e.portraits.every((p) => /^p[1-5]$/.test(Object.keys(p)[0]))),
);

// ---- skills -----------------------------------------------------------------
const skillBook = read("character_skills.json");
const skillKeys = Object.keys(skillBook);
const skillEntries = Object.values(skillBook);
const allSkills = skillEntries.flatMap((entry) => entry.skills);
const allRanks = allSkills.flatMap((skill) => Object.values(skill.ranks || {}));
ok("character_skills covers the roster", rarities.every((name) => skillBook[name]), rarities.filter((n) => !skillBook[n]).join(","));
ok("character_skills has no extra keys", skillKeys.every((name) => rarities.includes(name)), skillKeys.filter((n) => !rarities.includes(n)).join(","));
ok("character_skills ids are unique", new Set(skillEntries.map((entry) => entry.id)).size === skillKeys.length);
ok("character_skills has en/zh/vi character names", skillEntries.every((e) => e.nameEn && e.nameZh && e.nameVi));
ok("character_skills drops the dummy arcanist", !skillKeys.includes("Machine D III"));
ok("every skill has a name and an icon", allSkills.every((s) => s.nameEn && s.nameZh && s.nameVi && /^images\/skills\/\d+\.png$/.test(s.icon)));
ok("every non-ultimate skill has ranks", allSkills.filter((s) => s.type !== "Ultimate").every((s) => Object.keys(s.ranks || {}).length > 0));
ok("every rank has en/zh/vi text", allRanks.every((r) => r.id && r.descEn && r.descZh && r.descVi));
ok("rank cost/harmonisation are numbers", allRanks.every((r) => (r.cost === undefined || typeof r.cost === "number") && (r.harmonization === undefined || typeof r.harmonization === "number")));
ok("ultimates have en/zh text", allSkills.filter((s) => s.type === "Ultimate").every((s) => s.descEn && s.descZh));
ok(
  "insights have en/zh/vi text",
  skillEntries.every((e) => e.insights.length > 0 && e.insights.every((i) => i.nameEn && i.nameZh && i.nameVi && i.descEn && i.descZh && i.descVi)),
);
ok("every character has five portrays", skillEntries.every((e) => e.portrays.length === 5 && e.portrays.every((p, i) => p.level === i + 1)));

// ---- misc -------------------------------------------------------------------
ok("global_name_transfer has no self-maps", Object.entries(transfer).every(([k, v]) => k !== v));
ok("_meta has both versions", !!meta.globalVersion && !!meta.cnVersion, `${meta.globalVersion} / ${meta.cnVersion}`);

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
