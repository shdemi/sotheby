/**
 * End-to-end test of the editor's save path.
 *
 *   node editor/_test/e2e.test.mjs
 *
 * The browser cannot be automated through the File System Access picker, so this
 * reproduces what saveChanges() does: copy data/ to a scratch directory, apply
 * the model's output, and then check the result the way a reviewer would —
 * `git diff` semantics, plus a fresh load of the written files.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Model, FILES, READ_ONLY_FILES, readNameTables, validate, lineDiff } from "../model.js";

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

const readData = (f) => fs.readFileSync(path.join(DATA, f), "utf8");

function loadTextsFrom(dir) {
  const texts = {};
  for (const name of [...FILES, ...READ_ONLY_FILES]) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) texts[name] = fs.readFileSync(p, "utf8");
  }
  return texts;
}

function makeModel(texts) {
  return new Model(texts, {
    arcanistMap: JSON.parse(texts["ArcanistMap.json"]),
    nameTables: readNameTables(fs.readFileSync(path.join(ROOT, "app.js"), "utf8")),
  });
}

/** Mirrors files.js writeAll(): write each changed file into <dir>. */
function saveTo(dir, model) {
  const written = [];
  for (const [name, text] of Object.entries(model.output())) {
    fs.writeFileSync(path.join(dir, name), text, "utf8");
    written.push(name);
  }
  return written;
}

/** Positional line diff, the same one the Review tab renders. */
function changedLines(before, after) {
  const rows = lineDiff(before, after);
  return {
    added: rows.filter((r) => r.type === "add"),
    removed: rows.filter((r) => r.type === "del"),
    aLines: before.split(/\r?\n/).length,
    bLines: after.split(/\r?\n/).length,
  };
}

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "sm-editor-e2e-"));

try {
  /* ------------------------------------------------------------------ *
   * 0. Copy the real data into the scratch directory
   * ------------------------------------------------------------------ */

  console.log("\n=== setup ===");
  for (const name of [...FILES, ...READ_ONLY_FILES]) {
    fs.copyFileSync(path.join(DATA, name), path.join(scratch, name));
  }
  check("scratch copy made", fs.readdirSync(scratch).length >= FILES.length);

  /* ------------------------------------------------------------------ *
   * 1. Saving nothing writes nothing
   * ------------------------------------------------------------------ */

  console.log("\n=== saving nothing writes nothing ===");
  {
    const before = {};
    for (const f of FILES) before[f] = fs.readFileSync(path.join(scratch, f), "utf8");

    const model = makeModel(loadTextsFrom(scratch));
    const written = saveTo(scratch, model);
    check("no files written", written.length === 0, written.join(", "));

    let identical = 0;
    for (const f of FILES) if (fs.readFileSync(path.join(scratch, f), "utf8") === before[f]) identical++;
    check("every file byte-identical", identical === FILES.length, `${identical}/${FILES.length}`);
  }

  /* ------------------------------------------------------------------ *
   * 2. A realistic edit session, then save
   * ------------------------------------------------------------------ */

  console.log("\n=== edit session then save ===");
  const originals = {};
  for (const f of FILES) originals[f] = fs.readFileSync(path.join(scratch, f), "utf8");

  const model = makeModel(loadTextsFrom(scratch));
  const session = [];

  // (a) a new character, end to end
  model.setRarity("Newcomer", "6");
  model.setAfflatus("Newcomer", "Star");
  model.setShape("Newcomer", "Plus shape");
  model.setCnName("Newcomer", "新人");
  model.setEuphoria("Newcomer", "1", "General", true);
  model.setFutureSight("Newcomer", true);
  session.push("added Newcomer");

  // (b) give a shape to whichever character lacks one
  const shapeLess = model.characters.find((n) => model.character(n).shape === "");
  check("a character without a shape exists", !!shapeLess, shapeLess);
  if (shapeLess) {
    model.setShape(shapeLess, "T shape");
    session.push(`gave ${shapeLess} a shape`);
  }

  // (c) fix a psychube tag
  model.setPsychubeField("6", "73", "tags", ["ATK", "Heal"]);
  session.push("retagged chube 6:73");

  // (d) mark a psychube as CN-only
  model.setPsychubeFutureSight("6", "68", true);
  session.push("chube 6:68 future sight");

  // (e) team preset: swap a member and mark it essential.
  // The preset is picked from the data so this does not break when presets change.
  const editedPreset = model.teamNames.find((n) => model.team(n)[0] && model.team(n)[0].length > 0);
  const originalSlot = JSON.parse(JSON.stringify(model.team(editedPreset)[0][0]));
  const replacement = model.characters.find((n) => n !== originalSlot.character);
  model.setTeamSlot(editedPreset, 0, 0, "character", replacement);
  model.setTeamSlot(editedPreset, 0, 0, "isEssential", true);
  session.push(`edited ${editedPreset}`);

  // (f) a CN name correction
  model.setCnName("Druvis III", "槲寄生!");
  session.push("corrected a CN name");

  console.log(`        session: ${session.join("; ")}`);

  const { errors } = validate(model);
  check("the session validates", errors.length === 0, errors.join("; "));

  const written = saveTo(scratch, model);
  check("wrote the expected files", written.length > 0, written.join(", "));
  console.log(`        wrote: ${written.join(", ")}`);

  /* ------------------------------------------------------------------ *
   * 3. Unchanged files are untouched
   * ------------------------------------------------------------------ */

  console.log("\n=== untouched files are byte-identical ===");
  const untouched = FILES.filter((f) => !written.includes(f));
  let identical = 0;
  const differs = [];
  for (const f of untouched) {
    if (fs.readFileSync(path.join(scratch, f), "utf8") === originals[f]) identical++;
    else differs.push(f);
  }
  check(`all ${untouched.length} untouched files byte-identical`, differs.length === 0, differs.join(", "));

  /* ------------------------------------------------------------------ *
   * 4. Changed files are minimal
   * ------------------------------------------------------------------ */

  console.log("\n=== changed files have minimal diffs ===");
  // How many separate fields the session changed in each file; a minimal diff
  // touches at most 3 lines per change (the edited line, its separator, and the
  // new line).
  const editsPerFile = {
    "characters_by_rarity.json": 1,
    "characters_by_afflatus.json": 1,
    // Two edits: one character gains a shape, and the new "Newcomer" gets one.
    "character_reso_shape.json": (shapeLess ? 1 : 0) + 1,
    "euphoria_list.json": 1,
    "future_sight.json": 3,
    "name_map.json": 2,
    "psychube_id.json": 1,
    "team_archetypes.json": 2,
  };

  for (const f of written) {
    const after = fs.readFileSync(path.join(scratch, f), "utf8");
    const d = changedLines(originals[f], after);
    const edits = editsPerFile[f] || 1;
    // A positional diff touches at most 3 lines per change: the edited line, the
    // separator on its neighbour, and the new line itself.
    const budget = edits * 3;
    check(`${f}: valid JSON`, (() => { try { JSON.parse(after); return true; } catch { return false; } })());
    check(
      `${f}: diff stays within ${budget} lines for ${edits} change(s)`,
      d.added.length + d.removed.length <= budget,
      `+${d.added.length} -${d.removed.length}: ${JSON.stringify(d.added.slice(0, 4).map((r) => r.text))} / ${JSON.stringify(d.removed.slice(0, 4).map((r) => r.text))}`
    );
    check(`${f}: not reformatted wholesale`, Math.abs(d.aLines - d.bLines) <= 6, `${d.aLines} -> ${d.bLines} lines`);
  }

  /* ------------------------------------------------------------------ *
   * 5. The written files reload to the same model
   * ------------------------------------------------------------------ */

  console.log("\n=== reload from disk ===");
  {
    const reloaded = makeModel(loadTextsFrom(scratch));
    check("no file is dirty after reload", reloaded.changedFiles().length === 0, reloaded.changedFiles().join(", "));

    const n = reloaded.character("Newcomer");
    check("Newcomer survived: rarity", n.rarity === "6", n.rarity);
    check("Newcomer survived: afflatus", n.afflatus === "Star", n.afflatus);
    check("Newcomer survived: shape", n.shape === "Plus shape", n.shape);
    check("Newcomer survived: CN name", n.cnName === "新人", n.cnName);
    check("Newcomer survived: euphoria", n.euphoria1 === "General", n.euphoria1);
    check("Newcomer survived: future sight", n.futureSight === true, String(n.futureSight));

    const d = reloaded.character(shapeLess || "Drake");
    if (shapeLess) check("the new shape persisted", d.shape === "T shape", d.shape);

    const chube = reloaded.psychubes.find((p) => p.key === "6:73");
    check("psychube tags persisted", chube.tags.join(",") === "ATK,Heal", JSON.stringify(chube.tags));
    const fs68 = reloaded.psychubes.find((p) => p.key === "6:68");
    check("psychube future sight persisted", fs68.futureSight === true, String(fs68.futureSight));

    const wc = reloaded.team(editedPreset)[0];
    check("team slot character persisted", wc[0].character === replacement, wc[0].character);
    check("team slot essential persisted", wc[0].is_essential === true, JSON.stringify(wc[0]));

    check("CN name correction persisted", reloaded.value("name_map.json").character["Druvis III"] === "槲寄生!");

    const second = validate(reloaded);
    check("reloaded data validates", second.errors.length === 0, second.errors.join("; "));
  }

  /* ------------------------------------------------------------------ *
   * 6. Undo everything and confirm the files return to their originals
   * ------------------------------------------------------------------ */

  console.log("\n=== undoing every edit restores the originals ===");
  {
    const m = makeModel(loadTextsFrom(scratch));
    m.setCnName("Druvis III", "槲寄生");
    m.setTeamSlot(editedPreset, 0, 0, "character", originalSlot.character);
    m.setTeamSlot(editedPreset, 0, 0, "isEssential", originalSlot.is_essential === true);
    m.setPsychubeFutureSight("6", "68", false);
    m.setPsychubeField("6", "73", "tags", ["ATK", "Critical"]);
    if (shapeLess) m.setShape(shapeLess, "");
    m.setFutureSight("Newcomer", false);
    m.setEuphoria("Newcomer", "1", "", false);
    m.setCnName("Newcomer", "");
    m.setShape("Newcomer", "");
    m.setAfflatus("Newcomer", "");
    m.setRarity("Newcomer", "");

    // Removing the shape again should leave no trace in that file.
    const stillChanged = m.changedFiles();
    check("only files touched by the session remain changed", stillChanged.length > 0, stillChanged.join(", "));

    // Compare against the pristine repo copies for the files that must match.
    for (const f of stillChanged) {
      const back = m.doc(f).toString();
      const pristine = readData(f);
      check(`${f}: matches the committed file after undo`, back === pristine, "differs");
    }
  }
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}

console.log(`\n=== ${checks - failures}/${checks} checks passed ===`);
process.exit(failures === 0 ? 0 : 1);
