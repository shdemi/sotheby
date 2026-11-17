/**
 * Tests for rotation export/import (`Model.exportGuideRotation` /
 * `Model.importGuideRotations`).
 *
 *   node editor/_test/rotation-transfer.test.mjs
 *
 * The interesting property is that a file written here and read in another
 * checkout lands as the same plan: the rounds, the cards, the tags and the
 * callouts all survive, and anything this dataset cannot name is dropped with a
 * warning instead of failing validation later.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  Model,
  FILES,
  READ_ONLY_FILES,
  readNameTables,
  validate,
  rotationTransferFile,
  readRotationTransfer,
  normalizeNoteText,
  ROTATION_TRANSFER_KIND,
  ROTATION_TRANSFER_VERSION,
} from "../model.js";
import { dirFor } from "../files.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");

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

const filePath = (name) => path.join(ROOT, dirFor(name), name);
function loadTexts() {
  const texts = {};
  for (const name of [...FILES, ...READ_ONLY_FILES]) {
    const p = filePath(name);
    if (fs.existsSync(p)) texts[name] = fs.readFileSync(p, "utf8");
  }
  return texts;
}

const texts = loadTexts();
const nameTables = readNameTables(fs.readFileSync(path.join(ROOT, "app.js"), "utf8"));
const freshModel = () =>
  new Model({ ...loadTexts() }, { arcanistMap: JSON.parse(texts["ArcanistMap.json"]), nameTables });

/**
 * Deep comparison that ignores what a round trip may legitimately rewrite: the
 * id (it has to be unique locally) and the explicit `"type": "normal"` the
 * editor writes on every slot it touches.
 */
function canon(value) {
  if (Array.isArray(value)) return value.map(canon);
  if (value && typeof value === "object") {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (key === "id") continue;
      if (key === "type" && value[key] === "normal") continue;
      out[key] = canon(value[key]);
    }
    return out;
  }
  return value;
}

const throwsWith = (fn) => {
  try {
    fn();
    return "";
  } catch (e) {
    return e.message;
  }
};

/* ------------------------------------------------------------------ *
 * 1. The file
 * ------------------------------------------------------------------ */

console.log("\n=== the export file ===");
{
  const model = freshModel();
  const rotation = model.guideRotations()[0];
  const file = model.exportGuideRotation(rotation.id);
  check("the file names its kind", file.kind === ROTATION_TRANSFER_KIND, file.kind);
  check("and its version", file.version === ROTATION_TRANSFER_VERSION, String(file.version));
  check("it carries a timestamp", !Number.isNaN(Date.parse(file.exportedAt)), file.exportedAt);
  check("the rotation is the one asked for", file.rotation.id === rotation.id, file.rotation.id);
  check("the shipped rotation is not mutated by exporting", JSON.stringify(model.guideRotation(rotation.id)) === JSON.stringify(rotation));

  check("an unknown id exports nothing", model.exportGuideRotation("no-such-rotation") === null);
  check(
    "a shallow copy, so editing the file cannot touch the model",
    file.rotation !== rotation && typeof rotationTransferFile(rotation).rotation === "object"
  );
}

/* ------------------------------------------------------------------ *
 * 2. Round trip
 * ------------------------------------------------------------------ */

console.log("\n=== round trip ===");
{
  const source = freshModel();
  const target = freshModel();
  const rotations = source.guideRotations();
  check("the file ships rotations to test with", rotations.length > 0, String(rotations.length));

  let same = 0;
  const warnings = [];
  const ids = [];
  for (const rotation of rotations) {
    const text = JSON.stringify(source.exportGuideRotation(rotation.id));
    const result = target.importGuideRotations(text);
    ids.push(...result.ids);
    warnings.push(...result.warnings);
    const imported = target.guideRotation(result.ids[0]);
    if (imported && JSON.stringify(canon(imported)) === JSON.stringify(canon(rotation))) same++;
  }
  check("every rotation comes back the same plan", same === rotations.length, `${same}/${rotations.length}`);
  check("every import is warning-free", warnings.length === 0, warnings.join(" | "));
  check("every imported rotation has its own id", new Set(ids).size === ids.length, ids.join(", "));
  check("the list grew by one rotation each time", target.guideRotations().length === rotations.length * 2, String(target.guideRotations().length));
  check("the imported rotations validate", validate(target).errors.length === 0, validate(target).errors.join(" | "));

  const out = target.output();
  const dirty = Object.keys(out);
  check("only rotations.json is rewritten", dirty.length === 1 && dirty[0] === "rotations.json", dirty.join(", "));
  const original = texts["rotations.json"];
  check(
    "the shipped entries above the import are byte-identical",
    out["rotations.json"].startsWith(original.replace(/\r?\n}\s*$/, "").slice(0, -1).split("]")[0] + "]"),
    "the file's own text was reformatted"
  );
}

/* ------------------------------------------------------------------ *
 * 3. Ids
 * ------------------------------------------------------------------ */

console.log("\n=== ids ===");
{
  const model = freshModel();
  const rotation = model.guideRotations()[0];
  const file = JSON.stringify(rotationTransferFile(rotation));
  const first = model.importGuideRotations(file).ids[0];
  const second = model.importGuideRotations(file).ids[0];
  check("a colliding id becomes -2", first === `${rotation.id}-2`, first);
  check("and the next -3", second === `${rotation.id}-3`, second);

  // Two different rotations with the same id inside one file must not collide either.
  const twin = { id: "twin", name: "Twin", members: [], rounds: [] };
  const both = model.importGuideRotations(JSON.stringify({ rotations: [twin, { ...twin }] }));
  check("two identical ids in one file are told apart", new Set(both.ids).size === 2, both.ids.join(", "));
}

/* ------------------------------------------------------------------ *
 * 4. What this dataset cannot name
 * ------------------------------------------------------------------ */

console.log("\n=== unknown names are dropped, not written ===");
{
  const model = freshModel();
  const result = model.importGuideRotations(
    JSON.stringify({
      kind: ROTATION_TRANSFER_KIND,
      version: 1,
      rotation: {
        id: "other-checkout",
        name: "Other checkout",
        archetypes: ["Raid", "Nonsense", "Focused Flashback"],
        tuning: "A Tune Nobody Has",
        members: [
          { character: "Lucy", psychube: "long night talk" },
          { character: "Nobody At All", psychube: "" },
        ],
        notes: "",
        rounds: [
          {
            note: "",
            slots: [
              { cards: [{ character: "Lucy", skill: 1 }, { character: "Ghost Hero", skill: 2 }] },
              { type: "or", cards: [{ character: "Lucy", skill: 1 }, { character: "Lucy", skill: 2 }, { character: "Lucy", skill: 3 }, { character: "Lucy", skill: 4 }] },
            ],
            annotations: [{ from: 5, to: 9, style: "slanted", text: { en: "note", de: "notiz" } }],
          },
        ],
        roundNotes: [{ from: 0, to: 3, style: "bracket", text: "clamped" }],
      },
    })
  );
  const imported = model.guideRotation(result.ids[0]);
  check("the rotation is still imported", Boolean(imported), result.ids.join(", "));
  check("its name survives", imported.name === "Other checkout", imported.name);
  check("the unknown member is gone", imported.members.length === 1 && imported.members[0].character === "Lucy", JSON.stringify(imported.members));
  check("the psychube name is matched case-insensitively", imported.members[0].psychube === "Long Night Talk", imported.members[0].psychube);
  check("the unknown archetype is gone", !imported.archetypes.includes("Nonsense"), JSON.stringify(imported.archetypes));
  check("the exclusive archetype does not stack", imported.archetypes.filter((t) => t === "Raid" || t === "Focused Flashback").length === 1, JSON.stringify(imported.archetypes));
  check("the unknown tuning is cleared", imported.tuning === "", JSON.stringify(imported.tuning));
  check("the unknown card is gone", imported.rounds[0].slots[0].cards.length === 1, JSON.stringify(imported.rounds[0].slots[0].cards));
  check("an OR slot keeps at most two cards", imported.rounds[0].slots[1].cards.length === 2, JSON.stringify(imported.rounds[0].slots[1]));
  check("the out-of-range callout is clamped", JSON.stringify(imported.rounds[0].annotations[0]) === JSON.stringify({ from: 1, to: 1, text: { en: "note" } }), JSON.stringify(imported.rounds[0].annotations));
  check("a round note covering a missing round is clamped", imported.roundNotes[0].from === 0 && imported.roundNotes[0].to === 0, JSON.stringify(imported.roundNotes));
  check("every drop is reported", result.warnings.length >= 6, result.warnings.join(" | "));
  check("and the file still validates", validate(model).errors.length === 0, validate(model).errors.join(" | "));
}

/* ------------------------------------------------------------------ *
 * 5. Slots that are not plain cards
 * ------------------------------------------------------------------ */

console.log("\n=== tuning slots, text slots and legacy shapes ===");
{
  const model = freshModel();
  const result = model.importGuideRotations(
    JSON.stringify({
      id: "slot-shapes",
      name: "Slot shapes",
      members: [{ character: "Lucy" }],
      rounds: [
        {
          slots: [
            { type: "tuning", text: "Tune it", cards: [{ special: "images/skills/Tuning_S2.png" }] },
            { type: "text", text: "typed", cards: [{ character: "Lucy", skill: 1 }] },
            { type: "free", cards: [{ character: "Lucy", skill: 2 }] },
            { cards: [{ special: "images/skills/Tuning_S1.png" }], tags: ["custom"], tagText: "kept" },
            { cards: [{ character: "Lucy", skill: 3 }], tags: ["precast"], tagText: "stray" },
            { cards: [{ special: "images/card_modulo/Any.png", surface: "ramona" }] },
          ],
        },
      ],
    })
  );
  const slots = model.guideRotation(result.ids[0]).rounds[0].slots;
  check("a tuning slot keeps its S2 card", slots[0].cards?.[0]?.special === "images/skills/Tuning_S2.png", JSON.stringify(slots[0]));
  check("a text slot keeps only its text", slots[1].text === "typed" && slots[1].cards === undefined, JSON.stringify(slots[1]));
  check("a legacy free slot becomes normal + ap-free", slots[2].type === "normal" && slots[2].tags.includes("ap-free"), JSON.stringify(slots[2]));
  check("a custom tag keeps its plate text", slots[3].tagText === "kept", JSON.stringify(slots[3]));
  check("a tag without its plate text drops the stray tagText", slots[4].tagText === undefined, JSON.stringify(slots[4]));
  check("a stand-in card keeps its surface", slots[5].cards?.[0]?.surface === "ramona", JSON.stringify(slots[5]));
}

/* ------------------------------------------------------------------ *
 * 6. Every shape a payload can arrive in
 * ------------------------------------------------------------------ */

console.log("\n=== accepted payloads ===");
{
  const model = freshModel();
  const rotation = model.guideRotations()[0];
  check("an export file", model.importGuideRotations(rotationTransferFile(rotation)).ids.length === 1);
  check("a bare rotation object", model.importGuideRotations(rotation).ids.length === 1);
  check("pasted text", model.importGuideRotations(JSON.stringify(rotation)).ids.length === 1);
  const inFile = JSON.parse(texts["rotations.json"]).rotations.length;
  check("a plain array", model.importGuideRotations([rotation, rotation]).ids.length === 2);
  check("a whole rotations.json", model.importGuideRotations(JSON.stringify(JSON.parse(texts["rotations.json"]))).ids.length === inFile);

  check("empty text is refused", /nothing to import/i.test(throwsWith(() => model.importGuideRotations("  "))));
  check("broken JSON is refused", /not valid JSON/i.test(throwsWith(() => model.importGuideRotations("{ nope"))));
  check("an empty object is refused", /No rotation in there/i.test(throwsWith(() => model.importGuideRotations("{}"))));
  check("an empty array is refused", /list is empty/i.test(throwsWith(() => model.importGuideRotations("[]"))));
  check("an empty rotations.json is refused", /no rotations/i.test(throwsWith(() => model.importGuideRotations('{"rotations": []}'))));
  check("readRotationTransfer reads a bare entry", readRotationTransfer({ id: "x" }).length === 1);
  check(
    "a note keeps only the languages the editor writes",
    JSON.stringify(normalizeNoteText({ en: "a", vi: "b", jp: "c", de: "d" })) === JSON.stringify({ en: "a", vi: "b" }),
    JSON.stringify(normalizeNoteText({ en: "a", vi: "b", jp: "c", de: "d" }))
  );
}

/* ------------------------------------------------------------------ *
 * 7. Nothing else moves
 * ------------------------------------------------------------------ */

console.log("\n=== the rest of the data ===");
{
  const model = freshModel();
  const before = Object.fromEntries(Object.keys(texts).map((name) => [name, model.value(name)]));
  model.importGuideRotations(rotationTransferFile(model.guideRotations()[5]));
  const changed = model.changedFiles();
  check("only rotations.json changed", changed.length === 1 && changed[0] === "rotations.json", changed.join(", "));
  const others = Object.keys(texts).filter((name) => name !== "rotations.json");
  check(
    "every other document is untouched",
    others.every((name) => JSON.stringify(model.value(name)) === JSON.stringify(before[name])),
    "a document changed"
  );
}

console.log(`\n=== ${checks - failures}/${checks} checks passed ===`);
process.exit(failures === 0 ? 0 : 1);
