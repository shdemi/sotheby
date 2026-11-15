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
import { MATCH_TOLERANCE_DAYS, normName, unmatchedCnRuns } from "./derive/banners.mjs";
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

// ---- event shop (Planner) ---------------------------------------------------
// The Planner's Event tab renders this file directly, so a broken shape shows as
// an empty or mislabeled list. `maxBuy: 0` is the game's "unlimited" and must
// survive as 0; a group whose title could not be resolved is left as an empty
// string on purpose (the tab prints a generic label rather than a wrong one).
const eventShop = read("event_shop.json");
const eventShops = eventShop.shops || [];
const eventCurrent = eventShops.find((shop) => shop.id === eventShop.current);
ok("event_shop has a current shop", Boolean(eventCurrent), eventShop.current);
ok("event_shop current shop is the flagged one", Boolean(eventCurrent && eventCurrent.isCurrent));
ok("event_shop carries a patch label", /^\d+\.\d+$/.test(String(eventShop.patch || "")), eventShop.patch);
ok("event_shop shops all carry the current patch", eventShops.every((shop) => shop.patch === eventShop.patch));
const eventRows = eventShops.flatMap((shop) => (shop.groups || []).flatMap((group) => group.items || []));
ok("event_shop shops have rows", eventRows.length > 0, String(eventRows.length));
ok("event_shop groups are numbered", eventShops.every((shop) => shop.groups.every((group) => Number.isInteger(group.index) && group.index > 0)));
ok(
  "event_shop every row has a key + name",
  eventRows.every((row) => row.key && row.name),
  eventRows.filter((row) => !row.key || !row.name).map((row) => row.key).join(","),
);
ok(
  "event_shop every row names its goods slot",
  eventRows.every((row) => typeof row.uid === "string" && /^\d+$/.test(row.uid)),
  eventRows.filter((row) => !(typeof row.uid === "string" && /^\d+$/.test(row.uid))).map((row) => row.key).join(","),
);
ok("event_shop every row has a price", eventRows.every((row) => Number.isFinite(row.cost) && row.cost > 0));
ok(
  "event_shop purchase caps are non-negative",
  eventRows.every((row) => Number.isInteger(row.maxBuy) && row.maxBuy >= 0),
  eventRows.filter((row) => !(Number.isInteger(row.maxBuy) && row.maxBuy >= 0)).map((row) => row.key).join(","),
);
ok("event_shop has at least one unlimited row", eventRows.some((row) => row.maxBuy === 0));
// The current patch's own shop must name its sections: the prefab strings exist.
ok(
  "event_shop current shop names its sections",
  Boolean(eventCurrent) && eventCurrent.groups.every((group) => typeof group.name === "string" && group.name),
  eventCurrent ? eventCurrent.groups.map((group) => group.name).join(" / ") : "",
);
// Art is optional per row (Myssal does not ship every icon), but a path the tab
// prints must resolve, or the row draws a broken image.
const eventIconsMissing = eventRows
  .filter((row) => row.icon)
  .filter((row) => !fs.existsSync(path.join(OUT, "..", row.icon)))
  .map((row) => row.icon);
ok("every event shop icon exists", eventIconsMissing.length === 0, eventIconsMissing.slice(0, 6).join(","));
const eventMoneyMissing = eventShops
  .map((shop) => shop.money || {})
  .filter((money) => money.icon)
  .filter((money) => !fs.existsSync(path.join(OUT, "..", money.icon)))
  .map((money) => money.icon);
ok("every event shop currency icon exists", eventMoneyMissing.length === 0, eventMoneyMissing.join(","));
ok(
  "event_shop goods slots are unique per shop",
  eventShops.every((shop) => {
    const uids = (shop.groups || []).flatMap((group) => (group.items || []).map((row) => row.uid));
    return new Set(uids).size === uids.length;
  }),
);
// `type 13` is a wilderness land block, not a currency. Its names come from
// `block_package` (Summer Haven Harbor / Evergreen Ground I), and the app draws
// every block with one hand-added icon.
const eventBlocks = eventRows.filter((row) => row.type === 13);
if (eventBlocks.length) {
  ok(
    "event_shop wilderness blocks use their real names",
    eventBlocks.every((row) => row.name && !/^(Tamer Badge|Perpetual Clef|Currency )/.test(row.name)),
    eventBlocks.map((row) => row.name).join(", "),
  );
  ok(
    "event_shop wilderness blocks share the wilderness icon",
    eventBlocks.every((row) => row.icon === "images/items/wilderness_icon.png"),
    eventBlocks.map((row) => `${row.name}: ${row.icon || "(none)"}`).join(", "),
  );
  ok("the wilderness icon exists", fs.existsSync(path.join(OUT, "..", "images", "items", "wilderness_icon.png")));
}

// ---- progression levels (per-level Dust + Sharpodonty) ----------------------
// `character_cosume` prices every (rare, level) pair; `derive/progressionLevels.mjs`
// turns its cumulative level column into one group per (rarity set, insight). The
// InfoBook's progression panel and the Planner's Character tab both read it, so the
// band totals below are the numbers the panel has always shown; if an edit changes
// them, one of the two surfaces changes silently.
const levelCosts = read("progression_levels.json");
const levelGroups = (levelCosts && levelCosts.groups) || [];
const levelMaxFor = (ins) => (ins >= 3 ? 60 : ins === 2 ? 50 : ins === 1 ? 40 : 30);
const levelBandTotal = (group) =>
  Object.values(group.levels).reduce(
    (acc, row) => ({ dust: acc.dust + row.dust, sharpodonty: acc.sharpodonty + row.sharpodonty }),
    { dust: 0, sharpodonty: 0 },
  );
ok("progression_levels has ten groups", levelGroups.length === 10, String(levelGroups.length));
ok(
  "progression_levels groups carry rarities + insight",
  levelGroups.every((g) => Array.isArray(g.rarities) && g.rarities.length && Number.isInteger(g.insight)),
);
ok(
  "progression_levels rarities only use 2/3/4/5/6",
  levelGroups.every((g) => g.rarities.every((r) => r >= 2 && r <= 6)),
);
ok(
  "progression_levels levels are 2..max for their insight",
  levelGroups.every((g) => {
    const keys = Object.keys(g.levels).map(Number).sort((a, b) => a - b);
    const max = levelMaxFor(g.insight);
    return keys.length === max - 1 && keys[0] === 2 && keys[keys.length - 1] === max;
  }),
);
ok(
  "progression_levels costs are positive integers",
  levelGroups.every((g) =>
    Object.values(g.levels).every(
      (row) => Number.isInteger(row.dust) && row.dust > 0 && Number.isInteger(row.sharpodonty) && row.sharpodonty > 0,
    ),
  ),
);
// Every arcanist rarity must find a group for every insight it can reach.
const levelCovered = [];
for (const rarityValue of [2, 3, 4, 5, 6]) {
  const maxInsight = rarityValue >= 5 ? 3 : 2;
  for (let ins = 0; ins <= maxInsight; ins++) {
    const group = levelGroups.find((g) => g.insight === ins && g.rarities.includes(rarityValue));
    if (!group) levelCovered.push(`${rarityValue}/${ins}`);
  }
}
ok("progression_levels covers every rarity and insight", levelCovered.length === 0, levelCovered.join(","));
const LEVEL_BANDS = {
  "5,6": [[27700, 15080], [100200, 53100], [406700, 137200], [810880, 400600]],
  "4": [[20680, 11200], [75040, 39720], [305020, 102780]],
  "2,3": [[16620, 8930], [60120, 31860], [244020, 82320]],
};
const levelBandMismatch = [];
for (const [key, bands] of Object.entries(LEVEL_BANDS)) {
  for (let ins = 0; ins < bands.length; ins++) {
    const group = levelGroups.find((g) => g.insight === ins && g.rarities.join(",") === key);
    if (!group) {
      levelBandMismatch.push(`${key}/${ins}: missing`);
      continue;
    }
    const total = levelBandTotal(group);
    const [dust, sharpodonty] = bands[ins];
    if (total.dust !== dust || total.sharpodonty !== sharpodonty) {
      levelBandMismatch.push(`${key}/${ins}: ${total.dust}/${total.sharpodonty} != ${dust}/${sharpodonty}`);
    }
  }
}
ok("progression_levels band totals match the InfoBook", levelBandMismatch.length === 0, levelBandMismatch.join(" | "));

// ---- resonance patterns (the "Frequency" system) ----------------------------
// `talent_style` names the six patterns of each board and `talent_style_cost`
// prices the five craftable ones per hero (styleId 0, Placidity, is already on the
// board). The Planner's Frequency picker reads `frequency[]` and the InfoBook's
// pattern panel reads `pattern_costs.json`; both come from that pair, so they must
// agree with each other and with `shape_patterns.json`.
const patternCosts = read("pattern_costs.json");
const patternNames = new Set(Object.values(read("shape_patterns.json")).flat());
const patternEntries = Object.entries(patternCosts);
ok("pattern_costs covers the roster", patternEntries.length >= 130, String(patternEntries.length));
ok(
  "pattern_costs keys are roster names",
  patternEntries.every(([name]) => !!matsBook[name]),
  patternEntries.filter(([name]) => !matsBook[name]).map(([n]) => n).join(","),
);
ok(
  "pattern_costs patterns come from shape_patterns",
  patternEntries.every(([, rows]) => Object.keys(rows).every((p) => patternNames.has(p))),
  patternEntries
    .flatMap(([, rows]) => Object.keys(rows).filter((p) => !patternNames.has(p)))
    .join(","),
);
ok(
  "pattern_costs bills are non-empty",
  patternEntries.every(([, rows]) =>
    Object.values(rows).every(
      (list) => list.length >= 2 && list.every((m) => m.material && Number(m.quantity) > 0),
    ),
  ),
);
const freqProblems = [];
for (const [name, rows] of patternEntries) {
  const steps = (matsBook[name] && matsBook[name].frequency) || [];
  const names = steps.map((step) => step.name);
  if (steps.length !== Object.keys(rows).length) freqProblems.push(`${name}: ${steps.length} steps`);
  if (new Set(names).size !== names.length) freqProblems.push(`${name}: duplicate patterns`);
  if (steps.some((step) => !patternNames.has(step.name))) freqProblems.push(`${name}: unknown pattern`);
  // The Planner and the InfoBook must be able to read the same bill.
  for (const step of steps) {
    if (JSON.stringify(step.materials) !== JSON.stringify(rows[step.name])) {
      freqProblems.push(`${name}/${step.name}: bill differs`);
    }
  }
}
ok("frequency steps match pattern_costs", freqProblems.length === 0, freqProblems.slice(0, 6).join(" | "));
ok(
  "frequency ids are the game's styleId 1..5",
  Object.values(matsBook).every(
    (row) =>
      (row.frequency || []).every((step) => Number.isInteger(step.id) && step.id >= 1 && step.id <= 5) &&
      new Set((row.frequency || []).map((step) => step.id)).size === (row.frequency || []).length,
  ),
);
ok(
  "frequency covers the roster (incl. CN-only arcanists)",
  Object.values(matsBook).every((row) => (row.frequency || []).length === 5),
  Object.entries(matsBook)
    .filter(([, row]) => (row.frequency || []).length !== 5)
    .map(([name, row]) => `${name}:${(row.frequency || []).length}`)
    .join(","),
);
const sixPatterns = ((matsBook["6"] || {}).frequency || []).map((step) => step.name).join(",");
ok(
  "frequency names the Z-shape board in game order",
  sixPatterns === "Elucidation,Genuinity,Mercy,Equanimity,Equibalance",
  sixPatterns,
);

// ---- banners (Planner Calculator) -------------------------------------------
// `banner_history.json` is the frozen community spreadsheet (`npm run sync:banners`)
// and `banners.json` is that history joined to a `summon_pool` row. The join is the
// only place a sheet banner name becomes a game object, so the invariants are:
// every row resolved, every rate-up resolved to a roster name, and no duplicates.
// `banner_history.json` is not a `sync` output — it is frozen by `npm run
// sync:banners` (§15) and merely *read* by the pipeline — so it always comes
// from `data/`, even when verifying a `--out` directory.
const history = readJson(path.join(OUT, "banner_history.json"));
const bannerFile = read("banners.json");
const gacha = read("gacha_rules.json");
const banners = bannerFile.banners || [];
// A CN-only banner of a scheduled kind is copied into the list with shifted dates
// and `predicted: true` (§15); everything below that is about the *sheet* join
// reads the sheet rows alone.
const sheetRows = banners.filter((b) => !b.predicted);
const predictedRows = banners.filter((b) => b.predicted);

ok("banner_history points at the spreadsheet", /^https:\/\/docs\.google\.com\/spreadsheets\//.test(history.source || ""), history.source);
ok("banner_history has both servers", (history.global || []).length >= 190 && (history.cn || []).length >= 190, `${history.global?.length} / ${history.cn?.length}`);
ok(
  "banner_history dates are ISO or null",
  [...(history.global || []), ...(history.cn || [])].every(
    (row) => [row.start, row.end].every((d) => d === null || /^\d{4}-\d{2}-\d{2}$/.test(d)),
  ),
);
const sheetKeys = sheetRows.map((b) => `${b.server}|${b.name}|${b.start || ""}`);
ok("banners cover every sheet row (no dropped join)", sheetRows.length === (history.global || []).length + (history.cn || []).length, `${sheetRows.length} vs ${(history.global?.length || 0) + (history.cn?.length || 0)}`);
ok("banner ids are unique", new Set(banners.map((b) => b.id)).size === banners.length);
ok("banner names+starts are unique per server", new Set(sheetKeys).size === sheetKeys.length, sheetKeys.filter((k, i) => sheetKeys.indexOf(k) !== i).slice(0, 6).join(","));
ok("no banner fell back to an ambiguous pool", sheetRows.every((b) => !b.ambiguous), sheetRows.filter((b) => b.ambiguous).map((b) => b.name).join(","));

// The prediction is the Calculator's Future Sight (§15): everything CN schedules
// reaches Global eventually — only a **Rerun** is not expected, because a rerun
// repeats a banner Global has already run under its own name. The CN and Global runs
// of a name are paired **one to one** (`unmatchedCnRuns()`), so a recurring banner
// whose newest Global copy has not been listed yet still gets a prediction for its own
// patch; whatever is left unpaired is a prediction, landing exactly
// `predictedLagDays` after its CN run.
const PREDICTED_TYPES = ["Debut", "Limited", "Event", "Ripples", "Collab", "Yearning"];
const dayShift = (iso) => Date.parse(`${iso}T00:00:00Z`);
const globalSheet = sheetRows.filter((b) => b.server === "global" && b.start);
const unpaired = new Set(unmatchedCnRuns(sheetRows, bannerFile.predictedLagDays).map((row) => row.id));
const badPrediction = predictedRows.filter(
  (b) =>
    b.server !== "global" ||
    !PREDICTED_TYPES.includes(b.type) ||
    !b.start ||
    b.lagDays !== bannerFile.predictedLagDays ||
    !unpaired.has(b.cnId),
);
ok("CN-only banners are predicted for Global", predictedRows.length >= 1, String(predictedRows.length));
ok(
  "a prediction is a scheduled kind with no Global run of its own",
  badPrediction.length === 0,
  badPrediction.map((b) => `${b.type}:${b.name}`).join(","),
);
// Every unpaired CN run must still be one of those banners, or the pairing and the
// projection would disagree about what Global is waiting for.
const missed = [...unpaired].filter(
  (id) => !predictedRows.some((b) => b.cnId === id),
);
ok(
  "every unpaired CN run is either predicted or already in the past",
  missed.length === 0 ||
    missed.every((id) => (sheetRows.find((row) => row.id === id)?.start || "") < (globalSheet.map((b) => b.start).sort().pop() || "")),
  missed.join(","),
);
// Only the future is worth predicting: the sheet's newest Global row is the horizon,
// so a prediction always lands after everything Global has already scheduled.
const horizon = globalSheet.map((b) => b.start).sort().pop() || "";
const earlyPrediction = predictedRows.filter((b) => !(b.start >= horizon));
ok(
  "a prediction lands after Global's newest scheduled banner",
  earlyPrediction.length === 0,
  `${earlyPrediction.map((b) => `${b.name}:${b.start}`).join(",") || horizon}`,
);
const lagged = predictedRows.every((b) => {
  const cn = sheetRows.find((row) => row.id === b.cnId);
  if (!cn) return false;
  const shift = (iso) => Date.parse(`${iso}T00:00:00Z`);
  return Math.round((shift(b.start) - shift(cn.start)) / 86400000) === b.lagDays;
});
ok("a prediction is its CN run shifted by the measured lag", lagged, predictedRows.map((b) => `${b.name}+${b.lagDays}`).join(","));
ok("the CN→Global lag is the recent median", bannerFile.predictedLagDays >= 60 && bannerFile.predictedLagDays <= 200, String(bannerFile.predictedLagDays));
// A recurring banner has to arrive once per patch: two runs of one name may never be
// collapsed into one prediction, which is what let 4.0's Ripples on the Water vanish.
const byName = new Map();
for (const b of predictedRows) {
  const key = normName(b.name);
  byName.set(key, [...(byName.get(key) || []), b.start]);
}
const spaced = [...byName.entries()].every(([, starts]) =>
  starts.every((start, i) => i === 0 || Math.abs(dayShift(start) - dayShift(starts[i - 1])) / 86400000 >= MATCH_TOLERANCE_DAYS),
);
ok("a recurring banner is predicted once per patch", spaced, JSON.stringify([...byName.entries()]));

// The version prefix every banner surface prints (`[3.9] Cognitive Dynamics`) is the
// patch the sheet files the run under. Every row carries one, and a prediction inherits
// its CN run's, because the content is the same.
const versionless = banners.filter((b) => !String(b.version || "").trim());
ok("every banner carries the sheet's version", versionless.length === 0, versionless.map((b) => b.name).join(","));
const versionMismatch = predictedRows.filter((b) => {
  const cn = sheetRows.find((row) => row.id === b.cnId);
  return !cn || cn.version !== b.version;
});
ok("a prediction keeps its CN run's version", versionMismatch.length === 0, versionMismatch.map((b) => b.name).join(","));


const poolIds = {
  global: new Set(table("global", "summon_pool").map((p) => Number(p.id))),
  cn: new Set(table("cn", "summon_pool").map((p) => Number(p.id))),
};
const badPools = banners.filter(
  (b) =>
    !poolIds.global.has(b.poolId) &&
    !poolIds.cn.has(b.poolId) &&
    !(b.server === "cn" && poolIds[b.server]?.has(b.poolId)),
);
ok("every banner resolved to a real summon_pool row", badPools.length === 0, badPools.map((b) => `${b.name}:${b.poolId}`).join(","));

const arcanistIds = new Set(read("ArcanistMap.json").map((entry) => Number(entry.id)));
const rosterNames = new Set(rarities);
const targetIds = banners.flatMap((b) => b.targets.map((t) => t.id));
ok("every rate-up id is a known arcanist", targetIds.every((id) => arcanistIds.has(Number(id))), [...new Set(targetIds.filter((id) => !arcanistIds.has(Number(id))))].join(","));
const targetNames = banners.flatMap((b) => [...b.targets, ...b.fiveStar].map((t) => t.name));
ok("rate-up names are canonical roster names", targetNames.every((n) => rosterNames.has(n)), [...new Set(targetNames.filter((n) => !rosterNames.has(n)))].join(","));

const KINDS = ["rateUp", "inGroup", "thread", "none"];
ok("banner rules use known kinds", banners.every((b) => KINDS.includes(b.rule.kind)), banners.filter((b) => !KINDS.includes(b.rule.kind)).map((b) => b.name).join(","));
ok("banner rule shares are a probability", banners.every((b) => Number(b.rule.share) > 0 && Number(b.rule.share) <= 1));
ok("inGroup banners name how many are guaranteed", banners.filter((b) => b.rule.kind === "inGroup").every((b) => b.rule.choose >= 1), banners.filter((b) => b.rule.kind === "inGroup" && !(b.rule.choose >= 1)).map((b) => b.name).join(","));
const noRate = banners.filter((b) => b.rule.kind === "none");
ok("only the standard and beginner banners have no odds rule", noRate.every((b) => ["Standard", "Beginner"].includes(b.type)), noRate.map((b) => `${b.type}:${b.name}`).join(","));
const missingGuarantee = banners.filter((b) => b.rule.kind === "rateUp" && !b.rule.guarantee).map((b) => b.name);
ok("every rateUp banner keeps its guarantee", missingGuarantee.length === 0, [...new Set(missingGuarantee)].slice(0, 6).join(","));

// Which pity counter a banner spends is a property of its **type**, not of the row:
// Debut and Rerun share one, Ripples on the Water keeps its own, and Limited / Event /
// Collab / Yearning never carry a counter between runs (§15). The tab draws one
// field per track, so a type landing on the wrong track would silently price the
// wrong starting point.
const TRACKS = { Debut: "rateUp", Rerun: "rateUp", Ripples: "ripples", Limited: "solo", Event: "solo", Collab: "solo", Yearning: "solo" };
const badTrack = banners.filter((b) => TRACKS[b.type] && b.rule.track !== TRACKS[b.type]);
ok(
  "each banner spends the pity counter its type implies",
  badTrack.length === 0,
  [...new Set(badTrack.map((b) => `${b.type}:${b.rule.track}`))].join(","),
);
// The perks a banner can carry: the free ten-pull a Limited patch always hands out,
// the ten-pull discount, and the first-6★ selector. Each is a property of the *type*
// except where an exact sheet name overrides it in `maps/gacha.json → byBanner`, so a
// stray perk has to be a declared outlier rather than a copy-paste.
const gachaMap = readJson(path.join(ROOT, "scripts", "sync", "maps", "gacha.json")) || {};
const outliers = new Set(Object.keys(gachaMap.byBanner || {}));
const limitedRows = banners.filter((b) => b.type === "Limited");
ok(
  "a Limited banner always hands out the free ten-pull",
  limitedRows.length > 0 && limitedRows.every((b) => b.rule.freePulls >= 10),
  [...new Set(limitedRows.map((b) => b.rule.freePulls))].join(","),
);
const strayFree = banners.filter((b) => b.rule.freePulls > 0 && b.type !== "Limited" && !outliers.has(b.name));
ok(
  "a free ten-pull outside a Limited banner is a declared outlier",
  strayFree.length === 0,
  [...new Set(strayFree.map((b) => `${b.type}:${b.name}`))].join(","),
);
const strayDiscount = banners.filter((b) => b.rule.discountFirst10 > 0 && b.type !== "Ripples" && !outliers.has(b.name));
ok(
  "a ten-pull discount outside Ripples is a declared outlier",
  strayDiscount.length === 0,
  [...new Set(strayDiscount.map((b) => `${b.type}:${b.name}`))].join(","),
);
const ripplesRows = banners.filter((b) => b.type === "Ripples");
ok(
  "every Ripples run discounts its first ten-pull",
  ripplesRows.length > 0 && ripplesRows.every((b) => b.rule.discountFirst10 === 3),
  [...new Set(ripplesRows.map((b) => b.rule.discountFirst10))].join(","),
);
const selectors = banners.filter((b) => b.rule.selectFirstSix);
ok(
  "only Ripples on the Water selects the first 6★",
  selectors.every((b) => b.type === "Ripples"),
  [...new Set(selectors.map((b) => b.type))].join(","),
);
// A Limited patch opens with one Limited banner that trades a bonus portrait at 200
// pulls (`maps/gacha.json → patchFirstLimited`), so the tab prices one extra copy above
// what the pulls alone buy. "First" is positional — no other Limited run may open within
// a patch before it — which is why the second banner beside it keeps the plain odds.
const exchangeRule = gachaMap.patchFirstLimited || {};
ok(
  "the patch's first Limited banner trades a portrait at 200 pulls",
  exchangeRule.pulls === 200 && exchangeRule.copies === 1,
  JSON.stringify(exchangeRule),
);
const exchangers = banners.filter((b) => b.rule.copyExchange);
ok(
  "only a Limited banner trades a portrait",
  exchangers.length > 0 &&
    exchangers.every(
      (b) =>
        b.type === "Limited" &&
        b.rule.copyExchange.pulls === exchangeRule.pulls &&
        b.rule.copyExchange.copies === exchangeRule.copies,
    ),
  [...new Set(exchangers.map((b) => `${b.type}:${b.name}`))].join(","),
);
const exchangePatchDays = gacha.income?.patch?.days || 42;
const crowdedExchange = ["global", "cn"].flatMap((server) => {
  const starts = banners
    .filter((b) => b.server === server && b.type === "Limited" && b.start && b.rule.copyExchange)
    .map((b) => b.start)
    .sort();
  return starts.filter(
    (start, i) => i > 0 && Math.round((dayShift(start) - dayShift(starts[i - 1])) / 86400000) < exchangePatchDays,
  );
});
ok(
  "each patch has exactly one exchanging Limited banner",
  crowdedExchange.length === 0,
  crowdedExchange.join(","),
);

// The pity curve must reproduce the community figure (≈43 pulls per 6★, i.e. two
// 6★s per 50/50 pair at ~64) by itself; if a game update moves a weight this fails.
const expectPulls = (() => {
  let sum = 0;
  let alive = 1;
  for (let n = 1; n <= gacha.pity.hard; n += 1) {
    const p = n >= gacha.pity.hard ? 1 : n > gacha.pity.soft ? gacha.rates.softPity : gacha.rates.sixStar;
    sum += alive * p * n;
    alive *= 1 - p;
  }
  return sum;
})();
ok("6★ expected pulls is the community figure", expectPulls > 42 && expectPulls < 44, expectPulls.toFixed(2));

ok("one pull is one Unilog", gacha.pull.amount === 1 && gacha.pull.itemId === "140001");
ok("180 Crystal Drops buy a Unilog", gacha.pull.dropsPerUnilog === 180);
ok("6★ base rate is 1.5%", Math.abs(gacha.rates.sixStar - 0.015) < 1e-9, String(gacha.rates.sixStar));
ok("soft pity is 5% from pull 61, hard at 70", gacha.pity.soft === 60 && gacha.pity.hard === 70 && Math.abs(gacha.rates.softPity - 0.05) < 1e-9);
ok("P5 needs six copies", gacha.portraitCopies === 6, String(gacha.portraitCopies));
ok("three currencies for the Calculator", gacha.currencies.length === 3 && gacha.currencies.every((c) => c.name && c.nameZh && c.icon));
ok("currency icons are real PNG/JPEG", gacha.currencies.every((c) => isRealBitmap(c.icon)), gacha.currencies.filter((c) => !isRealBitmap(c.icon)).map((c) => c.icon).join(","));

// The Drop Income ledger is transcribed from calculator.xlsx (§15) and is the only
// place those constants exist; the chart, the tick boxes' yields and the "?" sheet
// all read it. It is grouped the way the tab groups it: what every player earns
// (`dailyTasks`, `weeklyTask`, `limbo`, `cumulativeLogin`, `bassCounter`, `patch`),
// what a purchase adds (`roaringMonth`, `offerOfTheMonth`), and the patch payouts
// nobody has to switch on.
const ledger = gacha.income || {};
ok(
  "the Drop Income ledger ships the spreadsheet constants",
  ledger.dailyTasks?.weekday === 90 &&
    // The daily task is flat: a Sunday bonus would be an invented figure, not a
    // spreadsheet one, so its absence is part of the check.
    ledger.dailyTasks?.sunday === undefined &&
    ledger.weeklyTask?.drops === 100 &&
    ledger.cumulativeLogin?.drops === 180 &&
    ledger.bassCounter?.pulls === 10 &&
    ledger.limbo?.drops === 700 &&
    ledger.limbo?.monthlyDrops === 1400 &&
    Array.isArray(ledger.dailyPurchasing) &&
    ledger.dailyPurchasing.length === 9,
  JSON.stringify(ledger).slice(0, 160),
);
// The 7 / 15 / 25-day login track pays its Clear Drops once a month, on the 1st.
ok(
  "the login track pays once a month on the 1st",
  ledger.cumulativeLogin?.day === 1 && ledger.cumulativeLogin?.drops === 180,
  JSON.stringify(ledger.cumulativeLogin),
);
ok(
  "the Weekly Task pays on a named weekday",
  Number.isInteger(ledger.weeklyTask?.weekday) && ledger.weeklyTask.weekday >= 0 && ledger.weeklyTask.weekday <= 6,
  JSON.stringify(ledger.weeklyTask),
);
// Limbo (1st) and Lucidscape (16th) are two resets of one reward, so the tab shows
// a **whole** monthly figure (1,400 / 180 = 7.78 reads as 8) instead of a fraction.
ok(
  "Limbo and Lucidscape are the two resets of one monthly reward",
  Array.isArray(ledger.limbo?.days) &&
    ledger.limbo.days.join(",") === "1,16" &&
    ledger.limbo.monthlyDrops === ledger.limbo.drops * ledger.limbo.days.length,
  JSON.stringify(ledger.limbo),
);
ok(
  "the Limbo yield prints as a whole number of pulls",
  Math.round(ledger.limbo.monthlyDrops / gacha.pull.dropsPerUnilog) === 8,
  String(ledger.limbo.monthlyDrops / gacha.pull.dropsPerUnilog),
);
ok(
  "the Bass Counter pays its Unilogs on the 1st",
  ledger.bassCounter?.day === 1 && ledger.bassCounter?.pulls === 10,
  JSON.stringify(ledger.bassCounter),
);
// Roaring Month is a pass, not a rate: it hands 300 Crystal Drops over the moment it
// is bought and then 90 Clear Drops a day until it lapses.
ok(
  "Roaring Month pays its Crystal Drops up front and then daily",
  ledger.roaringMonth?.instantCrystal === 300 &&
    ledger.roaringMonth?.drops === 90 &&
    ledger.roaringMonth?.days === 30,
  JSON.stringify(ledger.roaringMonth),
);
// The Offer of the Month is one Clear Drop lump **and** ten Unilogs - the second half
// is what the old sheet lost, and what the tab prices as 20 pulls a month.
ok(
  "the Offer of the Month pays Clear Drops and Unilogs",
  ledger.offerOfTheMonth?.clear === 1800 && ledger.offerOfTheMonth?.unilog === 10,
  JSON.stringify(ledger.offerOfTheMonth),
);
const patchPayouts = ledger.patch || {};
ok(
  "the patch payouts are the sheet's figures",
  patchPayouts.days === 42 &&
    patchPayouts.jukeboxFreePulls === 2 &&
    patchPayouts.jukeboxCollectorPulls === 5 &&
    patchPayouts.maintenanceCompensation === 480 &&
    patchPayouts.warmupLogin === 400 &&
    patchPayouts.devBroadcast === 120 &&
    patchPayouts.webEventSurvey === 120 &&
    patchPayouts.storyStage === 1200 &&
    patchPayouts.characterStory === 480 &&
    patchPayouts.eventShopPulls === 2,
  JSON.stringify(patchPayouts),
);
// The login event pays more on a patch that runs a Limited banner, so the two figures
// and the 14 < 20 ordering are both load-bearing.
ok(
  "the sign-in event pays more on a Limited patch",
  patchPayouts.signIn?.limited === 20 && patchPayouts.signIn?.standard === 14,
  JSON.stringify(patchPayouts.signIn),
);
ok(
  "the ledger's patch anchor is the sheet's Jukebox date",
  /^\d{4}-\d{2}-\d{2}$/.test(patchPayouts.anchor || "") &&
    (Date.parse(`${patchPayouts.anchor}T00:00:00Z`) - Date.parse("2026-11-05T00:00:00Z")) % (patchPayouts.days * 86400000) === 0,
  String(patchPayouts.anchor),
);
// ---- farm drop table --------------------------------------------------------
// `data/stages/farm.json` is the one table that does not come from St-Pavlov:
// drop rates are community data (AGENTS.md §14, "The drop table"). It exists so
// the Planner can
// solve a farm route, so the checks are about it being usable, not about the
// numbers themselves.
const farm = (() => {
  try {
    return readJson(path.join(dir, "stages", "farm.json"));
  } catch {
    return null;
  }
})();
const itemRows = read("items.json");
const itemByName = new Map(itemRows.map((row) => [row.name, row]));
const formulas = read("item_formulas.json");
const craftableNames = new Set(
  Object.keys(formulas).map((id) => (itemRows.find((row) => String(row.id) === String(id)) || {}).name).filter(Boolean),
);
const farmableNames = new Set();
let farmProblems = [];
if (!farm) {
  farmProblems.push("missing");
} else {
  if (!/^\d+\.\d+$/.test(String(farm.patch || ""))) farmProblems.push("patch");
  if (!Array.isArray(farm.stages) || farm.stages.length < 100) farmProblems.push("stages");
  for (const stage of farm.stages || []) {
    if (!stage.name || !stage.category) farmProblems.push(`row:${stage.name}`);
    if (!(Number(stage.cost) > 0)) farmProblems.push(`cost:${stage.name}`);
    const drops = Object.entries(stage.drops || {});
    if (!drops.length) farmProblems.push(`empty:${stage.name}`);
    for (const [name, rate] of drops) {
      if (!itemByName.has(name)) farmProblems.push(`unknown:${name}`);
      if (!(Number(rate) > 0)) farmProblems.push(`rate:${name}`);
      farmableNames.add(name);
    }
    if (!["Story", "Hard", "Resource", "Insight"].includes(stage.category)) {
      farmProblems.push(`category:${stage.category}`);
    }
  }
  const names = (farm.stages || []).map((stage) => stage.name);
  if (new Set(names).size !== names.length) farmProblems.push("duplicate stages");
  // The two resource stages are what prices Dust and Sharpodonty.
  for (const required of ["The Poussiere VI", "Mintage Aesthetics VI"]) {
    if (!names.includes(required)) farmProblems.push(`missing stage ${required}`);
  }
}
ok("farm table is usable", farmProblems.length === 0, farmProblems.slice(0, 6).join(" | "));

// Every material a build plan can ask for must be reachable: either a stage drops
// it, a Wishing Spring recipe makes it, or it belongs to one of the two shops the
// farm plan lists separately (Oneiric Shop / Reveries). A material outside those
// families would be silently dropped from a plan, which is the one failure a
// reader would never notice.
const neededNames = new Set();
for (const row of Object.values(matsBook)) {
  for (const key of ["insight", "resonance", "euphoria", "mastery", "frequency"]) {
    for (const step of row[key] || []) {
      for (const mat of step.materials || []) neededNames.add(mat.material);
    }
  }
}
neededNames.add("Dust");
neededNames.add("Sharpodonty");
const shopFamilies = new Set(["Resonate Materials", "Euphoria Materials"]);
const unreachable = [...neededNames].filter((name) => {
  if (farmableNames.has(name) || craftableNames.has(name)) return false;
  const item = itemByName.get(name);
  return !item || !shopFamilies.has(item.category);
});
ok("every plan material is reachable", unreachable.length === 0, unreachable.join(","));

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
