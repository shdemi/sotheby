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
import { OUT, ROOT } from "./config.mjs";
import { table } from "./sources.mjs";
import { allEquipRows, isRealPsychube } from "./derive/psychubes.mjs";
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
const builds = (() => {
  try {
    return readJson(path.join(ROOT, "content", "builds.json")) || {};
  } catch {
    return {};
  }
})();

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
// The InfoBook detail hero loads `images/equip_defaulticon/<id>.png` (§4), a different
// drawing from the board icon above, so presence is its own invariant.
ok(
  "every psychube has detail art",
  chubeEntries.every((e) => fs.existsSync(path.join(OUT, "..", "images", "equip_defaulticon", `${e.id}.png`))),
  chubeEntries.filter((e) => !fs.existsSync(path.join(OUT, "..", "images", "equip_defaulticon", `${e.id}.png`))).map((e) => e.key).join(","),
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
  // A psychube the CN build has shipped ahead of its `equip_skill` rows has no
  // amplifications to show yet (113.0.1421: `6:1581`). That is a real data gap,
  // so an empty list is accepted only when the game ships no rows at all.
  const ampIds = new Set(
    ["cn", "global"].flatMap((server) => table(server, "equip_skill").map((row) => String(row.id))),
  );
  ok(
    "psychubes_data amplifications are 1..5 levels",
    detailRows.every(({ row }) => {
      const n = row.amplifications.length;
      if (n >= 1 && n <= 5) return true;
      return n === 0 && !ampIds.has(String(row.id));
    }),
    detailRows.filter(({ row }) => row.amplifications.length === 0).map(({ key }) => key).join(","),
  );
}

// ---- future sight -----------------------------------------------------------
ok("future characters is a non-empty list", Array.isArray(future.Character) && future.Character.length > 0, String(future.Character.length));
const futureChubes = flat(future.Psychube);
// The list is the set difference CN-minus-global, so derive it instead of pinning a
// count: every CN-ahead patch adds psychubes without touching this file.
const globalEquipIds = new Set(table("global", "equip").map((e) => e.id));
const cnOnlyChubes = [...allEquipRows().values()]
  .filter((row) => isRealPsychube(row) && !globalEquipIds.has(row.id))
  .map((row) => String(row.id));
ok(
  "future psychubes are CN-only game ids",
  futureChubes.length === cnOnlyChubes.length && cnOnlyChubes.every((id) => futureChubes.includes(id)),
  futureChubes.join(","),
);
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

// ---- arcanist map -----------------------------------------------------------
const arcanistMap = read("ArcanistMap.json");
const arcanistSkins = arcanistMap.flatMap((entry) => entry.live2d);
const arcanistSkinIds = new Set(arcanistSkins.map((skin) => String(skin.id)));
ok("arcanist map is one entry per roster character", arcanistMap.length === rarities.length, `${arcanistMap.length} vs ${rarities.length}`);
ok("arcanist map ids are unique", new Set(arcanistMap.map((e) => e.id)).size === arcanistMap.length);
ok("arcanist map drops the dummy arcanist", !arcanistMap.some((e) => e.id === 9998));
ok("arcanist map has zh + en names and a birthday", arcanistMap.every((e) => e.name && e.nameEng && e.roleBirthday));
ok("arcanist map has skins", arcanistMap.every((e) => Array.isArray(e.live2d) && e.live2d.length > 0));
ok("arcanist skin ids are unique", arcanistSkinIds.size === arcanistSkins.length);
ok("every future-sight skin is in the arcanist map", future.Skin.every((id) => arcanistSkinIds.has(String(id))), future.Skin.filter((id) => !arcanistSkinIds.has(String(id))).join(","));

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
  "euphoria rank text has all six languages",
  euphoriaEntries.every((e) =>
    e.ranks.every((r) => ["en", "zh", "tw", "jp", "kr", "vi"].every((lang) => Object.keys(r.description).includes(lang) && r.description[lang])),
  ),
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
const perceptionCards = allSkills.filter((s) => Array.isArray(s.panels));
ok(
  "perception cards carry two translated ability panels",
  perceptionCards.length === 3 &&
    perceptionCards.every(
      (s) =>
        typeof s.perceptionCost === "number" &&
        s.perceptionTag?.en &&
        s.perceptionTag?.zh &&
        s.perceptionTag?.vi &&
        s.panels.length === 2 &&
        s.panels.every(
          (p) => p.label?.en && p.label?.zh && p.label?.vi && p.descEn && p.descZh && p.descVi,
        ),
    ),
  `${perceptionCards.length} cards`,
);
ok(
  "perception panels belong to 37, Huntsworn Lilya and Perchta",
  JSON.stringify(
    skillEntries
      .filter((e) => e.skills.some((s) => Array.isArray(s.panels)))
      .map((e) => e.id)
      .sort((a, b) => a - b),
  ) === JSON.stringify([3066, 3155, 3159]),
);
ok("every non-ultimate skill has ranks", allSkills.filter((s) => s.type !== "Ultimate").every((s) => Object.keys(s.ranks || {}).length > 0));
ok("every rank has en/zh/vi text", allRanks.every((r) => r.id && r.descEn && r.descZh && r.descVi));
ok("rank cost/harmonisation are numbers", allRanks.every((r) => (r.cost === undefined || typeof r.cost === "number") && (r.harmonization === undefined || typeof r.harmonization === "number")));
ok("ultimates have en/zh text", allSkills.filter((s) => s.type === "Ultimate").every((s) => s.descEn && s.descZh));
ok(
  "insights have en/zh/vi text",
  skillEntries.every((e) => e.insights.length > 0 && e.insights.every((i) => i.nameEn && i.nameZh && i.nameVi && i.descEn && i.descZh && i.descVi)),
);
ok("every character has five portrays", skillEntries.every((e) => e.portrays.length === 5 && e.portrays.every((p, i) => p.level === i + 1)));

// ---- progression ------------------------------------------------------------
const matsBook = read("characters_mats_required.json");
const matsKeys = Object.keys(matsBook);
const matsEntries = Object.values(matsBook);
const tierShape = (list, key) => list.every((tier, i) => tier[key] === i + (key === "insight" ? 1 : 2));
const allMaterials = matsEntries.flatMap((e) => [...e.insight, ...e.resonance].flatMap((t) => t.materials));
ok("characters_mats_required covers the roster", rarities.every((name) => matsBook[name]), rarities.filter((n) => !matsBook[n]).join(","));
ok("characters_mats_required has no extra keys", matsKeys.every((name) => rarities.includes(name)), matsKeys.filter((n) => !rarities.includes(n)).join(","));
ok("characters_mats_required ids are unique", new Set(matsEntries.map((e) => e.id)).size === matsKeys.length);
ok("characters_mats_required drops the dummy arcanist", !matsKeys.includes("Machine D III"));
ok("mats names match their keys", matsEntries.every((e, i) => e.name === matsKeys[i]));
ok("every character has insight and resonance costs", matsEntries.every((e) => e.insight.length > 0 && e.resonance.length > 0));
ok("insight tiers are 1..N in order", matsEntries.every((e) => tierShape(e.insight, "insight")));
ok("resonance tiers are 2..N in order", matsEntries.every((e) => tierShape(e.resonance, "resonance")));
ok("every material has a name and a positive quantity", allMaterials.every((m) => m.material && Number(m.quantity) > 0));
ok(
  "stats carry four or five level bands of seven numbers",
  matsEntries.every((e) => {
    const bands = Object.values(e.stats || {});
    return bands.length >= 4 && bands.length <= 5 && bands.every((b) => Array.isArray(b) && b.length === 7 && b.every((n) => typeof n === "number"));
  }),
);
ok("rarity/afflatus agree with the roster files", matsEntries.every((e) => {
  const bucket = Object.entries(afflatus).find(([, names]) => names.includes(e.name));
  return Boolean(rarity[e.rarity]?.includes(e.name)) && Boolean(bucket);
}));

// ---- items ------------------------------------------------------------------
const items = read("items.json");
const itemFormulas = read("item_formulas.json");
const itemIds = new Set(items.map((item) => item.id));
const itemNames = new Set(items.map((item) => item.name.toLowerCase()));
const itemCategories = new Set(items.map((item) => item.category));
const formulaMaterials = Object.values(itemFormulas).flat();
ok("items are keyed by game id", items.every((item) => Number.isInteger(item.id) && item.id > 0));
ok("item ids are unique", itemIds.size === items.length);
ok("item names are unique", itemNames.size === items.length);
ok("every item has artwork", items.every((item) => !!item.icon));
ok("every item has a name and a category", items.every((item) => item.name && item.nameZh && item.category));
ok("item rarities are 1..6", items.every((item) => item.rarity >= 1 && item.rarity <= 6));
ok("every category has en/zh/vi labels", items.every((item) => item.category && item.categoryZh && item.categoryVi));
ok("item icons point at the game id", items.every((item) => !item.icon || item.icon === `images/items/icon/${item.id}.png`));
ok("item borders follow the rarity", items.every((item) => !item.border || item.border === `images/items/border/${item.rarity}.webp`));
ok("format highlights match the game name", items.every((item) => !item.nameZh.includes("<")));
ok("every crafting formula produces a known item", Object.keys(itemFormulas).every((id) => itemIds.has(Number(id))));
ok("every formula material is a known item", formulaMaterials.every((m) => itemNames.has(m.material.toLowerCase())));
ok("formula quantities are positive", formulaMaterials.every((m) => Number(m.quantity) > 0));
ok("every mats material is a known item", allMaterials.every((m) => itemNames.has(m.material.toLowerCase())));

// ---- og index ---------------------------------------------------------------
const ogIndex = read("og_index.json");
const ogChars = Object.entries(ogIndex.characters);
const ogChubes = Object.entries(ogIndex.psychubes);
ok("og_index covers the roster", ogChars.length === rarities.length, `${ogChars.length} vs ${rarities.length}`);
ok("og_index keys are canonical roster names", ogChars.every(([name]) => rarities.includes(name)), ogChars.filter(([n]) => !rarities.includes(n)).map(([n]) => n).join(","));
ok("og_index covers every psychube", ogChubes.length === ids.length, `${ogChubes.length} vs ${ids.length}`);
ok(
  "og_index keys are `<rarity>:<gameId>`",
  ogChubes.every(([key, row]) => /^[56]:\d{3,}$/.test(key) && key === `${row.rarity}:${key.split(":")[1]}`),
  ogChubes.filter(([key, row]) => key !== `${row.rarity}:${key.split(":")[1]}`).map(([k]) => k).join(","),
);
ok("og_index characters carry a rarity and an afflatus", ogChars.every(([, c]) => c.rarity >= 2 && c.rarity <= 6 && c.afflatus));
ok("og_index characters carry an en + zh name", ogChars.every(([, c]) => c.name && c.nameZh));
ok("og_index head icons follow the skin id", ogChars.every(([, c]) => /^images\/headicon_small\/\d+\.png$/.test(c.head)));
// Myssal ships a handful of head icons as WebP data under a `.png` name. The browser
// sniffs the bytes, but satori reads the extension, so such a file draws an empty
// portrait on the share card. Check the magic number, not just that the file exists.
function isRealBitmap(relPath) {
  const file = path.join(OUT, "..", relPath);
  if (!fs.existsSync(file)) return false;
  const head = Buffer.alloc(8);
  const fd = fs.openSync(file, "r");
  try {
    fs.readSync(fd, head, 0, 8, 0);
  } finally {
    fs.closeSync(fd);
  }
  const png = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
  const jpeg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  return png || jpeg;
}
const ogHeadsMissing = ogChars.filter(([, c]) => !fs.existsSync(path.join(OUT, "..", c.head))).map(([n]) => n);
ok("every og head icon file exists", ogHeadsMissing.length === 0, ogHeadsMissing.join(","));
const ogHeadsFake = ogChars.filter(([, c]) => fs.existsSync(path.join(OUT, "..", c.head)) && !isRealBitmap(c.head)).map(([n]) => n);
ok("every og head icon is a real PNG/JPEG", ogHeadsFake.length === 0, ogHeadsFake.join(","));
ok(
  "og_index build psychubes resolve to a known key",
  ogChars.every(([, c]) => c.psychubes.every((key) => ogIndex.psychubes[key])),
  ogChars.flatMap(([n, c]) => c.psychubes.filter((key) => !ogIndex.psychubes[key]).map((key) => `${n}:${key}`)).join(","),
);
ok("og_index pattern icons only exist with a shape", ogChars.every(([, c]) => (c.patternIcon ? Boolean(c.shape && c.pattern) : true)));
ok(
  "og_index characters with a build have a pattern",
  ogChars.filter(([name]) => builds[name]).every(([name, c]) => !builds[name].pattern || c.pattern === builds[name].pattern),
);
ok(
  "og_index resonance presets are labels",
  ogChars.every(([, c]) => (c.resonance || []).every((label) => typeof label === "string" && label)),
  ogChars.flatMap(([n, c]) => (c.resonance || []).filter((label) => typeof label !== "string" || !label).map(() => n)).join(","),
);

// ---- misc -------------------------------------------------------------------
// ---- code rewards -----------------------------------------------------------
// The Codes tab resolves a wiki reward name against `items.json`, then against
// this index (stamina candy, EXP-fodder psychubes). Both the art and the names
// must be there, or the reward sticker renders as bare text.
const codeRewards = read("code_reward_index.json");
const codeRewardEntries = Object.entries(codeRewards);
ok("code_reward_index is keyed by lowercased name", codeRewardEntries.every(([key, row]) => key === row.name.toLowerCase()));
ok("code_reward_index rows carry an icon", codeRewardEntries.every(([, row]) => /^images\/code_items\/.+\.png$/.test(row.icon)));
const codeRewardIcons = codeRewardEntries.filter(([, row]) => !isRealBitmap(row.icon)).map(([, row]) => row.name);
ok("every code reward icon exists", codeRewardIcons.length === 0, codeRewardIcons.join(","));
const codeRewardsNamed = ["picrasma candy", "jar of picrasma candy", "enlighten ii", "enlighten iii"];
ok("code_reward_index covers the known gaps", codeRewardsNamed.every((name) => codeRewards[name]), codeRewardsNamed.filter((n) => !codeRewards[n]).join(","));

ok("global_name_transfer has no self-maps", Object.entries(transfer).every(([k, v]) => k !== v));
ok("_meta has both versions", !!meta.globalVersion && !!meta.cnVersion, `${meta.globalVersion} / ${meta.cnVersion}`);

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
