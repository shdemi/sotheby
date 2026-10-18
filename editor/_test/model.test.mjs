/**
 * Tests for editor/model.js against the real data files.
 *
 *   node editor/_test/model.test.mjs
 *
 * Verifies that the derived character view matches what app.js would compute,
 * that each edit writes only the files it must, and that the untouched files
 * come back byte-identical.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Model, FILES, READ_ONLY_FILES, validate, readNameTables, lineDiff } from "../model.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const DATA = path.join(ROOT, "data");

let checks = 0;
let failures = 0;
function check(label, ok, detail) {
  checks++;
  if (ok) console.log(`  PASS  ${label}`);
  else {
    failures++;
    console.log(`  FAIL  ${label}`);
    if (detail !== undefined) console.log(`        ${detail}`);
  }
}

const read = (f) => fs.readFileSync(path.join(DATA, f), "utf8");
const readRoot = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

/** A preset that has at least one member, so slot-level tests have a target. */
function pickPreset(model, predicate) {
  const name = model.teamNames.find((n) => {
    const variants = model.team(n);
    if (!Array.isArray(variants) || variants.length === 0) return false;
    if (!variants.every((slots) => Array.isArray(slots) && slots.length > 0)) return false;
    return predicate ? predicate(n, variants) : true;
  });
  if (!name) throw new Error("No preset matches — the tests need one.");
  return name;
}

/** A preset whose variant has a member with no is_essential flag yet. */
function pickPresetWithNonEssential(model) {
  return pickPreset(model, (_n, variants) =>
    variants.some((slots) => slots.some((m) => m && m.is_essential !== true))
  );
}

/** First character with no resonance shape, so tests never depend on one name. */
function pickShapeLess(model) {
  const name = model.characters.find((n) => model.character(n).shape === "");
  if (!name) throw new Error("No character without a shape — the tests need one.");
  return name;
}

const parses = (s) => {
  try {
    JSON.parse(s);
    return true;
  } catch {
    return false;
  }
};

/** First character with no CN name. */
function pickCnLess(model) {
  const name = model.characters.find((n) => !model.character(n).cnName);
  if (!name) throw new Error("No character without a CN name.");
  return name;
}

function loadTexts() {
  const texts = {};
  for (const name of [...FILES, ...READ_ONLY_FILES]) {
    const p = path.join(DATA, name);
    if (fs.existsSync(p)) texts[name] = read(name);
  }
  return texts;
}

const texts = loadTexts();
const arcanistMap = JSON.parse(texts["ArcanistMap.json"]);
const nameTables = readNameTables(readRoot("app.js"));

function freshModel() {
  return new Model(loadTexts(), { arcanistMap: JSON.parse(texts["ArcanistMap.json"]), nameTables });
}

/* ------------------------------------------------------------------ *
 * 1. Load and derive
 * ------------------------------------------------------------------ */

console.log("\n=== load ===");
const model = freshModel();
check("every owned file is loaded", FILES.every((f) => model.doc(f) !== null), FILES.filter((f) => !model.doc(f)).join(", "));
check("no file is dirty on load", model.changedFiles().length === 0, model.changedFiles().join(", "));
check("output() is empty on load", Object.keys(model.output()).length === 0);
check("characters were derived", model.characters.length > 100, String(model.characters.length));
check("psychubes were derived", model.psychubes.length === 116, String(model.psychubes.length));
check("team presets were derived", model.teamNames.length > 0, String(model.teamNames.length));
check("shapes were derived", model.shapeNames.length === 4, model.shapeNames.join(", "));

console.log("\n=== derived values match the shipped data ===");
{
  const druvis = model.character("Druvis III");
  check("Druvis III rarity", druvis.rarity === "6", druvis.rarity);
  check("Druvis III afflatus", druvis.afflatus === "Plant", druvis.afflatus);
  check("Druvis III shape", druvis.shape === "Z shape", druvis.shape);
  check("Druvis III euphoria T1", druvis.euphoria1 === "Petrify", druvis.euphoria1);
  check("Druvis III euphoria T2", druvis.euphoria2 === "Rank Up", druvis.euphoria2);
  check("Druvis III CN name", druvis.cnName === "槲寄生", druvis.cnName);
  check("Druvis III avatar path", /headicon_small\/300301\.png$/.test(druvis.avatar), druvis.avatar);
  check("Druvis III skins counted", druvis.skins === 4, String(druvis.skins));

  const schneider = model.character("Schneider");
  check("Schneider is excluded", schneider.excluded === true, String(schneider.excluded));
  check("Schneider rarity", schneider.rarity === "5", schneider.rarity);

  const six = model.character("6");
  check("6 rarity", six.rarity === "6", six.rarity);
  check("6 transfer flag", six.transfer === true, String(six.transfer));
  check("6 arcanistEng", six.arcanistEng === "Six", six.arcanistEng);

  const drake = model.character("Drake");
  check("Drake is future sight", drake.futureSight === true, String(drake.futureSight));
  check("Drake has an ArcanistMap entry", drake.arcanistId !== "", drake.arcanistId);
  check("some character has no shape (the tests rely on one)", model.characters.some((n) => model.character(n).shape === ""));

  const twins = model.character("The Twins");
  check("The Twins is collab", twins.collab === true, String(twins.collab));

  const thirtySeven = model.character("37");
  check("37 euphoria T1 is future sight", thirtySeven.euphoria1Future === true, String(thirtySeven.euphoria1Future));
}

/* ------------------------------------------------------------------ *
 * 2. Validation of the shipped data
 * ------------------------------------------------------------------ */

console.log("\n=== validation of the shipped data ===");
{
  const { errors, warnings } = validate(model);
  check("no errors", errors.length === 0, errors.join("\n        "));
  console.log(`        (${warnings.length} warnings)`);
  for (const w of warnings.slice(0, 6)) console.log(`          ! ${w}`);

  const expected = [
    "release_patch",
    "reserved special chube",
  ];
  for (const needle of expected) {
    check(`warns about "${needle}"`, warnings.some((w) => w.includes(needle)), warnings.join(" | ").slice(0, 200));
  }
  // Preset variants without an essential member are warned about, not rejected.
  // Which preset that is depends on the current data, so clear every member of
  // one variant and look for the warning.
  {
    const probeModel = freshModel();
    const preset = pickPreset(probeModel);
    const slots = probeModel.team(preset)[0];
    slots.forEach((_member, si) => probeModel.setTeamSlot(preset, 0, si, "isEssential", false));
    check(
      "warns when a variant has no essential member",
      validate(probeModel).warnings.some((w) => w.includes("marked essential")),
      `cleared isEssential on every member of ${preset}`
    );
  }
}

/* ------------------------------------------------------------------ *
 * 3. Each edit touches only the files it must
 * ------------------------------------------------------------------ */

console.log("\n=== edit scope ===");

function expectChanged(label, mutate, expectedFiles) {
  const m = freshModel();
  const before = {};
  for (const f of FILES) before[f] = m.doc(f).toString();
  mutate(m);
  const changed = m.changedFiles().sort();
  check(`${label}: changed files`, changed.join(",") === expectedFiles.slice().sort().join(","), changed.join(","));
  check(`${label}: untouched files are byte-identical`, FILES.every((f) => changed.includes(f) || m.doc(f).toString() === before[f]));
  check(`${label}: the model still validates`, validate(m).errors.length === 0, validate(m).errors.join("; "));
  return m;
}

expectChanged("setRarity", (m) => m.setRarity("Drake", "5"), ["characters_by_rarity.json"]);
expectChanged("setAfflatus", (m) => m.setAfflatus("Drake", "Beast"), ["characters_by_afflatus.json"]);
expectChanged("setShape", (m) => m.setShape(pickShapeLess(freshModel()), "Z shape"), ["character_reso_shape.json"]);
expectChanged("setExcluded", (m) => m.setExcluded("Drake", true), ["exclude_character.json"]);
expectChanged("setCollab", (m) => m.setCollab("Drake", true), ["collab_character.json"]);
expectChanged("setFutureSight", (m) => m.setFutureSight("Drake", false), ["future_sight.json"]);
expectChanged("setCnName (new)", (m) => m.setCnName("Newcomer", "新人"), ["name_map.json"]);
expectChanged("setCnName (change)", (m) => m.setCnName("Druvis III", "槲寄生改"), ["name_map.json"]);
expectChanged("setTransfer", (m) => m.setTransfer("6", false), ["global_name_transfer.json"]);
expectChanged("setEuphoria T1", (m) => m.setEuphoria("Druvis III", "1", "Petrify!", false), ["euphoria_list.json"]);
expectChanged("setEuphoria future flag", (m) => m.setEuphoria("Druvis III", "1", "Petrify", true), ["future_sight.json"]);
expectChanged("setFutureSkin", (m) => m.setFutureSkin("315503", false), ["future_sight.json"]);
expectChanged("setPsychubeFutureSight", (m) => m.setPsychubeFutureSight("6", "73", false), ["future_sight.json"]);
expectChanged("setPsychubeField tags", (m) => m.setPsychubeField("6", "73", "tags", ["ATK"]), ["psychube_id.json"]);
expectChanged("setTeamSlot character", (m) => m.setTeamSlot("Conduit", 0, 0, "character", "Sotheby"), ["team_archetypes.json"]);
expectChanged("setTeamSlot essential", (m) => {
  const preset = pickPresetWithNonEssential(m);
  const variant = m.team(preset).findIndex((slots) => slots.some((x) => x && x.is_essential !== true));
  const slot = m.team(preset)[variant].findIndex((x) => x && x.is_essential !== true);
  m.setTeamSlot(preset, variant, slot, "isEssential", true);
}, ["team_archetypes.json"]);

console.log("\n=== a no-op edit changes nothing ===");
for (const [label, mutate] of [
  ["setRarity to the same value", (m) => m.setRarity("Drake", "6")],
  ["setShape to the same value", (m) => m.setShape("Drake", m.character("Drake").shape)],
  ["setExcluded to the same value", (m) => m.setExcluded("Drake", false)],
  ["setCnName to the same value", (m) => m.setCnName("Druvis III", "槲寄生")],
  ["setEuphoria to the same value", (m) => m.setEuphoria("Druvis III", "1", "Petrify", false)],
  ["setTransfer to the same value", (m) => m.setTransfer("6", true)],
  ["setTeamSlot to the same value", (m) => {
    const preset = pickPreset(m);
    const member = m.team(preset)[0][0];
    m.setTeamSlot(preset, 0, 0, "character", member.character);
  }],
]) {
  const m = freshModel();
  mutate(m);
  check(`${label}: no files changed`, m.changedFiles().length === 0, m.changedFiles().join(", "));
}

/* ------------------------------------------------------------------ *
 * 4. Edits produce the right content
 * ------------------------------------------------------------------ */

console.log("\n=== edit content ===");
{
  const m = freshModel();
  const target = pickShapeLess(m);
  const hadShape = m.character(target).shape;
  check(`${target} starts with no shape`, hadShape === "", JSON.stringify(hadShape));

  m.setShape(target, "Z shape");
  const shape = m.value("character_reso_shape.json");
  check("moved into Z shape", shape["Z shape"].includes(target));
  check("gone from every other shape", ["U shape", "T shape", "Plus shape"].every((s) => !shape[s].includes(target)));
  check("only character_reso_shape.json changed", m.changedFiles().join(",") === "character_reso_shape.json", m.changedFiles().join(","));
  check("the file still parses", (() => { try { JSON.parse(m.doc("character_reso_shape.json").toString()); return true; } catch { return false; } })());
}
{
  const m = freshModel();
  m.setEuphoria("Drake", "1", "General", true);
  const list = m.value("euphoria_list.json")["1"];
  check("euphoria entry added in the right format", list.includes("Drake: General"), JSON.stringify(list.slice(-2)));
  check("future sight flag added", m.value("future_sight.json").Euphoria.includes("Drake: 1"), JSON.stringify(m.value("future_sight.json").Euphoria));
  check("two files changed", m.changedFiles().sort().join(",") === "euphoria_list.json,future_sight.json", m.changedFiles().join(","));

  m.setEuphoria("Drake", "1", "", false);
  check("clearing the effect removes it", !m.value("euphoria_list.json")["1"].includes("Drake: General"));
  check("clearing also removes the future sight flag", !m.value("future_sight.json").Euphoria.includes("Drake: 1"));
  check("both files are back to their original bytes", m.changedFiles().length === 0, m.changedFiles().join(","));
}
{
  const m = freshModel();
  check("Drake already has a CN name", m.value("name_map.json").character["Drake"] === "德雷克", JSON.stringify(m.value("name_map.json").character["Drake"]));
  check("Newcomer has no CN name", m.value("name_map.json").character["Newcomer"] === undefined);

  m.setCnName("Newcomer", "新人");
  check("CN name written", m.value("name_map.json").character["Newcomer"] === "新人");
  check("only name_map changed", m.changedFiles().join(",") === "name_map.json", m.changedFiles().join(","));

  m.setCnName("Newcomer", "");
  check("blanking the CN name removes the key", m.value("name_map.json").character["Newcomer"] === undefined);
  check("name_map is back to its original bytes", !m.changedFiles().includes("name_map.json"), m.changedFiles().join(","));
}
{
  const m = freshModel();
  m.setCnName("Druvis III", "槲寄生改");
  check("an existing CN name is replaced", m.value("name_map.json").character["Druvis III"] === "槲寄生改");
  const doc = m.doc("name_map.json");
  const touched = lineDiff(doc.original, doc.toString()).filter((d) => d.type !== "same");
  check("replacing one CN name changes one line", touched.length === 2, `${touched.length} rows changed`);
}
{
  const m = freshModel();
  m.setPsychubeField("6", "73", "tags", ["ATK", "Heal"]);
  const item = m.value("psychube_id.json")["6"].find((p) => String(p.id) === "73");
  check("tags updated", item.tags.join(",") === "ATK,Heal", JSON.stringify(item.tags));
  check("tags stay inline in the file", /"tags": \["ATK", "Heal"\]/.test(m.doc("psychube_id.json").toString()));
}
{
  const m = freshModel();
  const before = m.value("team_archetypes.json").Conduit[0].length;
  m.setTeamSlot("Conduit", 0, 0, "character", "Sotheby");
  const after = m.value("team_archetypes.json").Conduit[0];
  check("slot character replaced", after[0].character === "Sotheby", JSON.stringify(after[0]));
  check("slot count unchanged", after.length === before, `${before} -> ${after.length}`);
  check("other slot fields preserved", after[0].is_essential === true, JSON.stringify(after[0]));
}

/* ------------------------------------------------------------------ *
 * 5. Validation catches real mistakes
 * ------------------------------------------------------------------ */

console.log("\n=== validation catches mistakes ===");
{
  const m = freshModel();
  m.doc("characters_by_rarity.json").append(["6"], "Nonexistent Character");
  const { errors } = validate(m);
  check("unknown character is an error", errors.some((e) => e.includes("Nonexistent Character")), errors.join("; "));
}
{
  const m = freshModel();
  m.doc("characters_by_rarity.json").append(["6"], "Drake");
  const { errors } = validate(m);
  check("duplicate across rarities is an error", errors.some((e) => e.includes("appears under")), errors.join("; "));
}
{
  const m = freshModel();
  m.doc("psychube_id.json").append(["6"], { id: "999", name: "Broken Chube", nameCN: "x", tags: ["Nope"], release_patch: "9.9" });
  const { errors } = validate(m);
  check("unknown psychube tag is an error", errors.some((e) => e.includes("unknown tag")), errors.join("; "));
}
{
  const m = freshModel();
  m.doc("team_archetypes.json").append(["Conduit", 0], { character: "Nobody At All", psychube: "Nope" });
  const { errors } = validate(m);
  check("bad preset character is an error", errors.some((e) => e.includes("Nobody At All")), errors.join("; "));
  check("bad preset psychube is an error", errors.some((e) => e.includes("does not match any name")), errors.join("; "));
}
{
  const m = freshModel();
  // reso_shape.json and shape_patterns.json must stay identical.
  m.doc("reso_shape.json").set(["Z shape", 1], "Changed");
  const { errors } = validate(m);
  check("desync between shape_patterns and reso_shape is an error", errors.some((e) => e.includes("no longer matches")), errors.join("; "));
}
{
  const m = freshModel();
  m.doc("future_sight.json").append(["Skin"], "999999");
  const { errors } = validate(m);
  check("unknown skin id is an error", errors.some((e) => e.includes("999999")), errors.join("; "));
}
{
  const m = freshModel();
  m.doc("future_sight.json").append(["Psychube", "6"], "999");
  const { errors } = validate(m);
  check("future-sight psychube id must exist", errors.some((e) => e.includes('id "999"')), errors.join("; "));
}

/* ------------------------------------------------------------------ *
 * 6. A realistic multi-step editing session
 * ------------------------------------------------------------------ */

console.log("\n=== a realistic session: add a new character ===");
{
  const m = freshModel();
  m.setRarity("Newcomer", "6");
  m.setAfflatus("Newcomer", "Star");
  m.setShape("Newcomer", "Plus shape");
  m.setCnName("Newcomer", "新人");
  m.setEuphoria("Newcomer", "1", "General", true);
  m.setFutureSight("Newcomer", true);

  const rarity = m.value("characters_by_rarity.json");
  check("appears in rarity 6", rarity["6"].includes("Newcomer"));
  check("appears in afflatus Star", m.value("characters_by_afflatus.json").Star.includes("Newcomer"));
  check("appears in Plus shape", m.value("character_reso_shape.json")["Plus shape"].includes("Newcomer"));
  check("has a CN name", m.value("name_map.json").character["Newcomer"] === "新人");
  check("has euphoria", m.value("euphoria_list.json")["1"].includes("Newcomer: General"));
  check("marked future sight", m.value("future_sight.json").Character.includes("Newcomer"));
  check("future sight euphoria recorded", m.value("future_sight.json").Euphoria.includes("Newcomer: 1"));

  const changed = m.changedFiles().sort();
  check(
    "six files changed",
    changed.join(",") ===
      ["characters_by_rarity.json", "characters_by_afflatus.json", "character_reso_shape.json", "name_map.json", "euphoria_list.json", "future_sight.json"]
        .sort()
        .join(","),
    changed.join(",")
  );

  const { errors } = validate(m);
  check("still validates", errors.length === 0, errors.join("; "));

  // Undoing every step must bring the files back byte-for-byte.
  m.setFutureSight("Newcomer", false);
  m.setEuphoria("Newcomer", "1", "", false);
  m.setCnName("Newcomer", "");
  m.setShape("Newcomer", "");
  m.setAfflatus("Newcomer", "");
  m.setRarity("Newcomer", "");
  check("undoing everything leaves no changed files", m.changedFiles().length === 0, m.changedFiles().join(","));
}

/* ------------------------------------------------------------------ *
 * 7. Ordering
 * ------------------------------------------------------------------ */

console.log("\n=== characters are newest first ===");
{
  const m = freshModel();
  const first = m.character(m.characters[0]);
  check("the first character has the highest ArcanistMap id", first.arcanistId === "3163", `${m.characters[0]} (${first.arcanistId})`);
  check("and it is the newest one, Glyndŵr", m.characters[0] === "Glyndŵr", m.characters[0]);

  // Ids must be non-increasing down the list.
  const ids = m.characters.map((n) => m.arcanistIdByCanonical.get(n)).filter((x) => x !== undefined);
  const sorted = ids.every((v, i) => i === 0 || ids[i - 1] >= v);
  check("ids descend all the way down", sorted, `first=${ids[0]} last=${ids[ids.length - 1]}`);

  // Characters with no ArcanistMap entry come after those that have one.
  const withId = m.characters.filter((n) => m.arcanistIdByCanonical.get(n) !== undefined);
  const withoutId = m.characters.filter((n) => m.arcanistIdByCanonical.get(n) === undefined);
  check("characters without an id are last", m.characters.slice(withId.length).join("|") === withoutId.join("|"));
  check("only 3F3F has no id", withoutId.join(",") === "3F3F", withoutId.join(","));
}

console.log("\n=== psychubes list rarity 6 first ===");
{
  const m = freshModel();
  check("the list starts with a 6-star", m.psychubes[0].rarity === "6", m.psychubes[0].rarity);
  const lastSix = m.psychubes.map((p) => p.rarity).lastIndexOf("6");
  const firstFive = m.psychubes.map((p) => p.rarity).indexOf("5");
  check("every 6-star comes before every 5-star", lastSix < firstFive, `last6=${lastSix} first5=${firstFive}`);
  check("all 116 psychubes are listed", m.psychubes.length === 116, String(m.psychubes.length));
  check("the highest id is first", m.psychubes[0].id === "73", m.psychubes[0].id);
  check("the file's own order was 5 then 6", Object.keys(m.value("psychube_id.json"))[0] === "5");
}

/* ------------------------------------------------------------------ *
 * 8. Team presets
 * ------------------------------------------------------------------ */

console.log("\n=== addTeam ===");
{
  const m = freshModel();
  const before = m.teamNames.length;

  m.addTeam("Brand New Comp");
  check("the preset exists", m.value("team_archetypes.json")["Brand New Comp"] !== undefined);
  check("it is appended at the end", m.teamNames[m.teamNames.length - 1] === "Brand New Comp", m.teamNames.slice(-2).join(", "));
  check("preset count grew", m.teamNames.length === before + 1, `${before} -> ${m.teamNames.length}`);

  const variants = m.team("Brand New Comp");
  check("it has one variant", variants.length === 1, String(variants.length));
  check("with one member", variants[0].length === 1, String(variants[0].length));
  check("and that member is essential, so Recommend has something to protect", variants[0][0].is_essential === true);
  check("only team_archetypes.json changed", m.changedFiles().join(",") === "team_archetypes.json", m.changedFiles().join(","));
  check("the new preset validates", validate(m).errors.length === 0, validate(m).errors.join("; "));

  let threw = false;
  try {
    m.addTeam(m.teamNames[0]);
  } catch {
    threw = true;
  }
  check("a duplicate name is refused", threw);

  threw = false;
  try {
    m.addTeam("   ");
  } catch {
    threw = true;
  }
  check("a blank name is refused", threw);

  // Removing it again must leave the file byte-identical.
  m.doc("team_archetypes.json").deleteProperty([], "Brand New Comp");
  m.reload();
  check("deleting it restores the file byte-for-byte", m.changedFiles().length === 0, m.changedFiles().join(","));
}

console.log("\n=== moveTeam ===");
{
  const m = freshModel();
  const original = m.doc("team_archetypes.json").toString();
  const first = m.teamNames[0];
  const total = m.teamNames.length;
  check("the first preset is known", typeof first === "string" && first.length > 0, first);

  m.moveTeam(first, 4);
  check("it moved to index 4", m.teamNames[4] === first, m.teamNames.slice(0, 6).join(", "));
  check("no preset was lost", m.teamNames.length === total, `${total} -> ${m.teamNames.length}`);
  check("only team_archetypes.json changed", m.changedFiles().join(",") === "team_archetypes.json");
  check("the reordered file still validates", validate(m).errors.length === 0, validate(m).errors.join("; "));

  m.moveTeam(first, 0);
  check("moving it back restores the file byte-for-byte", m.doc("team_archetypes.json").toString() === original);
}

console.log("\n=== moveTeamSlot ===");
{
  const m = freshModel();
  const original = m.doc("team_archetypes.json").toString();
  const preset = pickPreset(m, (_n, variants) => variants.some((slots) => slots.length >= 2));
  const variant = m.team(preset).findIndex((slots) => slots.length >= 2);
  const slots = m.team(preset)[variant];
  const count = slots.length;
  const first = slots[0].character;
  const second = slots[1].character;

  m.moveTeamSlot(preset, variant, 0, 1);
  const after = m.team(preset)[variant];
  check("the first two members swapped", after[0].character === second && after[1].character === first, JSON.stringify(after.slice(0, 2).map((s) => s.character)));
  check("no member was lost", after.length === count, `${count} -> ${after.length}`);
  check("only team_archetypes.json changed", m.changedFiles().join(",") === "team_archetypes.json");
  check("the reordered file still validates", validate(m).errors.length === 0, validate(m).errors.join("; "));

  m.moveTeamSlot(preset, variant, 1, 0);
  check("moving it back restores the file byte-for-byte", m.doc("team_archetypes.json").toString() === original);
}

console.log("\n=== member euphoria ===");
{
  const m = freshModel();
  const original = m.doc("team_archetypes.json").toString();
  const preset = pickPreset(m);

  m.setTeamMemberEuphoria(preset, 0, 0, "1");
  check("E1 is written", m.team(preset)[0][0].euphoria === "E1", JSON.stringify(m.team(preset)[0][0]));

  m.setTeamMemberEuphoria(preset, 0, 0, "2");
  check("changing to E2 replaces it", m.team(preset)[0][0].euphoria === "E2", JSON.stringify(m.team(preset)[0][0]));

  m.setTeamMemberEuphoria(preset, 0, 0, "");
  check("clearing removes the field", m.team(preset)[0][0].euphoria === undefined, JSON.stringify(m.team(preset)[0][0]));
  check("and the file is byte-identical again", m.doc("team_archetypes.json").toString() === original);
}

console.log("\n=== substitutes ===");
{
  const m = freshModel();
  const original = m.doc("team_archetypes.json").toString();
  const preset = pickPreset(m);

  // A member that has none yet.
  check("the first slot has no substitutes", m.team(preset)[0][0].substitutes === undefined);
  m.addSubstitute(preset, 0, 0, "Sotheby");
  const subs = m.team(preset)[0][0].substitutes;
  check("the array was created", Array.isArray(subs) && subs.length === 1, JSON.stringify(subs));
  check("with the chosen character", subs[0].character === "Sotheby", JSON.stringify(subs[0]));

  m.setSubstituteField(preset, 0, 0, 0, "psychube", "Her Third Life");
  check("a psychube can be set on it", m.team(preset)[0][0].substitutes[0].psychube === "Her Third Life", JSON.stringify(m.team(preset)[0][0].substitutes[0]));

  m.setSubstituteField(preset, 0, 0, 0, "euphoria", "E1");
  check("so can a euphoria tier", m.team(preset)[0][0].substitutes[0].euphoria === "E1");

  m.addSubstitute(preset, 0, 0, "6");
  check("a second substitute appends", m.team(preset)[0][0].substitutes.length === 2, JSON.stringify(m.team(preset)[0][0].substitutes));

  m.removeSubstitute(preset, 0, 0, 1);
  check("removing one leaves the other", m.team(preset)[0][0].substitutes.length === 1, JSON.stringify(m.team(preset)[0][0].substitutes));
  m.removeSubstitute(preset, 0, 0, 0);
  check("removing the last one drops the array", m.team(preset)[0][0].substitutes === undefined);
  check("and the file is byte-identical again", m.doc("team_archetypes.json").toString() === original, "differs");

  // An existing object substitute keeps its own fields.
  const withSub = m.teamNames.find((n) =>
    m.team(n).some((slots, vi) =>
      slots.some((member, si) => {
        const list = member.substitutes || [];
        return list.length === 1 && typeof list[0] === "object" && list[0].character && list[0].psychube;
      })
    )
  );
  check("a preset with a single object substitute exists", !!withSub, String(withSub));
  if (withSub) {
    let vi = 0;
    let si = 0;
    m.team(withSub).forEach((slots, v) =>
      slots.forEach((member, s) => {
        const list = member.substitutes || [];
        if (list.length === 1 && typeof list[0] === "object" && list[0].character && list[0].psychube) {
          vi = v;
          si = s;
        }
      })
    );
    const before = m.team(withSub)[vi][si].substitutes[0];
    const originalPsychube = before.psychube;
    const originalCharacter = before.character;

    m.setSubstituteField(withSub, vi, si, 0, "euphoria", "E2");
    check("its euphoria can be changed", m.team(withSub)[vi][si].substitutes[0].euphoria === "E2");
    check("its psychube survived", m.team(withSub)[vi][si].substitutes[0].psychube === originalPsychube);
    m.setSubstituteField(withSub, vi, si, 0, "psychube", "");
    check("clearing a field removes it", m.team(withSub)[vi][si].substitutes[0].psychube === undefined);
    check("the character survives", m.team(withSub)[vi][si].substitutes[0].character === originalCharacter);
  }
}

console.log("\n=== the bare-string substitute shorthand is promoted ===");
{
  // app.js accepts `"substitutes": ["J"]`; setting a field on one has to turn it
  // into an object, because the shorthand has nowhere to put the value.
  const m = freshModel();
  const doc = m.doc("team_archetypes.json");
  doc.setProperty(["Conduit", 0, 0], "substitutes", ["J"]);
  m.reload();
  check("the shorthand is in place", m.team("Conduit")[0][0].substitutes[0] === "J", JSON.stringify(m.team("Conduit")[0][0].substitutes));

  m.setSubstituteField("Conduit", 0, 0, 0, "psychube", "Blasphemer of Night");
  const sub = m.team("Conduit")[0][0].substitutes[0];
  check("it was promoted to an object", sub && typeof sub === "object", JSON.stringify(sub));
  check("keeping the original character", sub.character === "J", JSON.stringify(sub));
  check("and carrying the new psychube", sub.psychube === "Blasphemer of Night", JSON.stringify(sub));
  check("the file still validates", validate(m).errors.length === 0, validate(m).errors.join("; "));
}

/* ------------------------------------------------------------------ *
 * 9. Psychubes: add / remove
 * ------------------------------------------------------------------ */

console.log("\n=== addPsychube ===");
{
  const m = freshModel();
  const original = m.doc("psychube_id.json").toString();

  check("the next id for rarity 6 is 74", m.nextPsychubeId("6") === "74", m.nextPsychubeId("6"));
  check("the next id for rarity 5 is 44", m.nextPsychubeId("5") === "44", m.nextPsychubeId("5"));

  const countBefore = m.psychubes.length;
  m.addPsychube("6", "74", { name: "Brand New Chube", nameCN: "全新心相", tags: ["ATK"], releasePatch: "4.1" });

  check("the psychube count grew", m.psychubes.length === countBefore + 1, `${countBefore} -> ${m.psychubes.length}`);
  const list = m.value("psychube_id.json")["6"];
  check("it is first, because ids descend", list[0].id === "74", list[0].id);
  check("it has the fields given", list[0].name === "Brand New Chube" && list[0].release_patch === "4.1", JSON.stringify(list[0]));
  check("tags render inline", /"tags": \["ATK"\]/.test(m.doc("psychube_id.json").toString()));
  check("only psychube_id.json changed", m.changedFiles().join(",") === "psychube_id.json", m.changedFiles().join(","));
  check("it validates", validate(m).errors.length === 0, validate(m).errors.join("; "));

  m.removePsychube("6", "74");
  check("removing it restores the file byte-for-byte", m.doc("psychube_id.json").toString() === original, "differs");

  // Ids are dense (1..73), so the only way to insert into the middle is to free a
  // slot first. Re-adding it must put it back where it belongs.
  const idxBefore = m.value("psychube_id.json")["6"].findIndex((p) => p.id === "72");
  check("id 72 sits at index 1 to start with", idxBefore === 1, String(idxBefore));
  m.removePsychube("6", "72");
  check("it is gone", m.value("psychube_id.json")["6"].findIndex((p) => p.id === "72") === -1);
  m.addPsychube("6", "72", { name: "Middle Chube" });

  const ids = m.value("psychube_id.json")["6"].map((p) => Number(p.id));
  check("re-inserting keeps the list descending", ids.every((v, i) => i === 0 || ids[i - 1] > v), ids.slice(0, 6).join(","));
  check("and it landed back at index 1", m.value("psychube_id.json")["6"][1].id === "72", m.value("psychube_id.json")["6"][1].id);

  for (const [label, fn] of [
    ["a duplicate id", () => m.addPsychube("6", "72", { name: "Dupe" })],
    ["the reserved id 1", () => m.addPsychube("6", "1", { name: "Reserved" })],
    ["a non-numeric id", () => m.addPsychube("6", "abc", { name: "Bad" })],
    ["an empty name", () => m.addPsychube("6", "75", { name: "  " })],
    ["an unknown rarity", () => m.addPsychube("4", "1", { name: "Bad" })],
  ]) {
    let threw = false;
    try {
      fn();
    } catch {
      threw = true;
    }
    check(`${label} is refused`, threw);
  }
}

console.log("\n=== a new psychube can be flagged Future Sight ===");
{
  const m = freshModel();
  m.addPsychube("6", "74", { name: "CN Only Chube", futureSight: true });
  check("the flag is in future_sight.json", m.value("future_sight.json").Psychube["6"].includes("74"), JSON.stringify(m.value("future_sight.json").Psychube));
  check("two files changed", m.changedFiles().sort().join(",") === "future_sight.json,psychube_id.json", m.changedFiles().join(","));
  check("it validates", validate(m).errors.length === 0, validate(m).errors.join("; "));

  m.removePsychube("6", "74");
  check("removing it clears the flag too", !m.value("future_sight.json").Psychube["6"].includes("74"));
  check("both files are back to their originals", m.changedFiles().length === 0, m.changedFiles().join(","));
}

/* ------------------------------------------------------------------ *
 * 10. Name transfer
 * ------------------------------------------------------------------ */

console.log("\n=== addTransfer / removeTransfer ===");
{
  const m = freshModel();
  const original = m.doc("global_name_transfer.json").toString();

  m.addTransfer("Six", "6");
  check("re-adding an existing mapping is a no-op", m.doc("global_name_transfer.json").toString() === original);

  m.addTransfer("Liang", "Liang Yue");
  check("changing the target works", m.value("global_name_transfer.json")["Liang"] === "Liang Yue");

  m.addTransfer("Brand New Raw", "Sotheby");
  check("a new mapping is added", m.value("global_name_transfer.json")["Brand New Raw"] === "Sotheby", JSON.stringify(m.value("global_name_transfer.json")));
  check("only global_name_transfer.json changed", m.changedFiles().join(",") === "global_name_transfer.json", m.changedFiles().join(","));

  m.removeTransfer("Brand New Raw");
  check("removing it restores the file byte-for-byte", m.doc("global_name_transfer.json").toString() === original, "differs");

  for (const [label, fn] of [
    ["a self-transfer", () => m.addTransfer("X", "X")],
    ["an empty source", () => m.addTransfer("", "Y")],
    ["an empty target", () => m.addTransfer("X", "")],
  ]) {
    let threw = false;
    try {
      fn();
    } catch {
      threw = true;
    }
    check(`${label} is refused`, threw);
  }
}

/* ------------------------------------------------------------------ *
 * 9b. Builds and rotations
 * ------------------------------------------------------------------ */

console.log("\n=== builds ===");
{
  const m = freshModel();
  const names = m.characters;
  const target = names.find((n) => m.guideBuild(n)) || names[0];
  check("a build can be read", !!m.guideBuild(target), String(target));

  m.setGuideBuildField(target, "tags", ["Reality DMG", "Intellect", "DPS"]);
  check("tags are stored as plain strings", JSON.stringify(m.guideBuild(target).tags) === JSON.stringify(["Reality DMG", "Intellect", "DPS"]), JSON.stringify(m.guideBuild(target).tags));

  m.setGuideBuildField(target, "resonance", { Attack: "AAA", Crit: "" });
  check("an empty resonance code is kept so it can be filled later", m.guideBuild(target).resonance.Crit === "", JSON.stringify(m.guideBuild(target).resonance));

  m.setGuideBuildField(target, "psychubes", ["Steps Forward", "A Free Heart"]);
  check("two psychubes are written", m.guideBuild(target).psychubes.length === 2, JSON.stringify(m.guideBuild(target).psychubes));

  m.setGuideBuildField(target, "pattern", "Genuinity");
  check("a pattern is written", m.guideBuild(target).pattern === "Genuinity", JSON.stringify(m.guideBuild(target).pattern));
  check("the build edits validate", validate(m).errors.length === 0, validate(m).errors.join("; "));

  m.setGuideBuildField(target, "pattern", "");
  check("a blank pattern removes the property", m.guideBuild(target).pattern === undefined, JSON.stringify(m.guideBuild(target).pattern));
}

console.log("\n=== rotations ===");
{
  const m = freshModel();
  const original = m.doc("guide_rotations.json").toString();
  const before = m.guideRotations();
  check("the file loads with at least one rotation", before.length > 0, String(before.length));

  const id = before[0].id;
  const rounds = before[0].rounds || [];
  check("a rotation has rounds with slots", rounds.length > 0 && Array.isArray(rounds[0].slots), JSON.stringify(rounds[0]));

  m.setGuideRotationField(id, "tuning", "Grand Orchestra");
  check("the tuning is written", m.guideRotation(id).tuning === "Grand Orchestra", String(m.guideRotation(id).tuning));

  // Work on a fresh round so the shipped data stays irrelevant to the assertions.
  m.addGuideRound(id);
  const ri = m.guideRotation(id).rounds.length - 1;
  m.addGuideSlot(id, ri, "normal");
  check("a normal AP slot holds one card", m.guideRotation(id).rounds[ri].slots.length === 1, String(m.guideRotation(id).rounds[ri].slots.length));

  const card = { character: m.characters[0], skill: 2 };
  m.addGuideSlotCard(id, ri, 0, card);
  // A normal slot replaces its card rather than stacking.
  m.addGuideSlotCard(id, ri, 0, { character: m.characters[1], skill: 1 });
  check("a normal slot keeps only the newest card", m.guideRotation(id).rounds[ri].slots[0].cards.length === 1, JSON.stringify(m.guideRotation(id).rounds[ri].slots[0].cards));

  m.addGuideSlot(id, ri, "or");
  const orIndex = m.guideRotation(id).rounds[ri].slots.length - 1;
  m.addGuideSlotCard(id, ri, orIndex, { character: m.characters[0], skill: 2 });
  m.addGuideSlotCard(id, ri, orIndex, { character: m.characters[1], skill: 1 });
  check("an OR slot holds two alternatives", m.guideRotation(id).rounds[ri].slots[orIndex].cards.length === 2, JSON.stringify(m.guideRotation(id).rounds[ri].slots[orIndex].cards));

  m.addGuideSlotCard(id, ri, orIndex, { character: m.characters[2], skill: 1 });
  check("an OR slot refuses a third card", m.guideRotation(id).rounds[ri].slots[orIndex].cards.length === 2, JSON.stringify(m.guideRotation(id).rounds[ri].slots[orIndex].cards));

  m.removeGuideSlotCard(id, ri, orIndex, 1);
  check("one alternative can be removed", m.guideRotation(id).rounds[ri].slots[orIndex].cards.length === 1, JSON.stringify(m.guideRotation(id).rounds[ri].slots[orIndex].cards));
  m.addGuideSlotCard(id, ri, orIndex, { special: "images/skills/760001.png" });
  check("a special card is stored by path only", m.guideRotation(id).rounds[ri].slots[orIndex].cards[1].special === "images/skills/760001.png", JSON.stringify(m.guideRotation(id).rounds[ri].slots[orIndex].cards[1]));

  m.addGuideSlot(id, ri, "text");
  const textIndex = m.guideRotation(id).rounds[ri].slots.length - 1;
  m.setGuideSlotText(id, ri, textIndex, "Hold the buff");
  check("a text slot stores its text", m.guideRotation(id).rounds[ri].slots[textIndex].text === "Hold the buff", JSON.stringify(m.guideRotation(id).rounds[ri].slots[textIndex]));

  m.setGuideRoundNote(id, ri, "Pulsing Field Lv.1");
  check("a round note is written", m.guideRotation(id).rounds[ri].note === "Pulsing Field Lv.1", String(m.guideRotation(id).rounds[ri].note));

  m.setGuideRotationMember(id, 0, "psychube", "Steps Forward");
  check("a member psychube is written", m.guideRotation(id).members[0].psychube === "Steps Forward", JSON.stringify(m.guideRotation(id).members[0]));

  const roundCount = m.guideRotation(id).rounds.length;
  m.addGuideRound(id);
  check("a round can be added", m.guideRotation(id).rounds.length === roundCount + 1, String(m.guideRotation(id).rounds.length));
  m.removeGuideRound(id, roundCount);
  check("a round can be removed", m.guideRotation(id).rounds.length === roundCount, String(m.guideRotation(id).rounds.length));

  check("the rotation edits validate", validate(m).errors.length === 0, validate(m).errors.join("; "));
  check("only guide_rotations.json changed", m.changedFiles().join(",") === "guide_rotations.json", m.changedFiles().join(","));

  m.setGuideRotationField(id, "archetypes", []);
  check("an empty archetype list removes the key", m.guideRotation(id).archetypes === undefined, JSON.stringify(m.guideRotation(id).archetypes));

  void original;
}

console.log("\n=== diff rendering ===");
{
  const before = '{\n  "a": [\n    "x",\n    "y"\n  ]\n}';
  const after = '{\n  "a": [\n    "x",\n    "z"\n  ]\n}';
  const diff = lineDiff(before, after);
  check("diff finds one add and one delete", diff.filter((d) => d.type === "add").length === 1 && diff.filter((d) => d.type === "del").length === 1, JSON.stringify(diff.map((d) => d.type)));
  check("diff keeps the context", diff.filter((d) => d.type === "same").length === 5, String(diff.filter((d) => d.type === "same").length));
  check("identical input yields no changes", lineDiff(before, before).every((d) => d.type === "same"));
  check("CRLF does not leak into the display", lineDiff('{\r\n  "a": 1\r\n}', '{\r\n  "a": 2\r\n}').every((d) => !d.text.includes("\r")));
}

console.log(`\n=== ${checks - failures}/${checks} checks passed ===`);
process.exit(failures === 0 ? 0 : 1);
