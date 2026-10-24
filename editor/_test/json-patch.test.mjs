/**
 * Tests for editor/json-patch.js.
 *
 *   node editor/_test/json-patch.test.mjs
 *
 * The two things that matter:
 *   1. An unedited document is byte-identical to its input (no reformatting).
 *   2. Each edit changes only the lines it must, so `git diff` stays readable.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JsonDoc, detectIndent, parseJson, toValue } from "../json-patch.js";
import { WRITABLE, READ_ONLY } from "../files.js";

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
const lines = (s) => s.split(/\r?\n/);
const parses = (s) => {
  try {
    JSON.parse(s);
    return true;
  } catch {
    return false;
  }
};

/* ------------------------------------------------------------------ *
 * 1. Byte-identical round trip on every real file
 * ------------------------------------------------------------------ */

console.log("\n=== round trip: no edits means no diff ===");
const files = [...WRITABLE, ...READ_ONLY].sort();
for (const f of files) {
  const original = read(f);
  const doc = new JsonDoc(original);
  const same = doc.toString() === original;
  check(`${f} (indent=${JSON.stringify(detectIndent(original))})`, same, same ? "" : "output differs from input");
  if (!same) {
    for (let i = 0; i < Math.max(original.length, doc.text.length); i++) {
      if (original[i] !== doc.text[i]) {
        console.log(`        first diff at char ${i}:`);
        console.log(`          in : ${JSON.stringify(original.slice(Math.max(0, i - 30), i + 30))}`);
        console.log(`          out: ${JSON.stringify(doc.text.slice(Math.max(0, i - 30), i + 30))}`);
        break;
      }
    }
  }
}

/* ------------------------------------------------------------------ *
 * 2. Scalar set touches one line
 * ------------------------------------------------------------------ */

console.log("\n=== set: a scalar edit changes one line ===");
{
  const original = read("characters_by_rarity.json");
  const doc = new JsonDoc(original);
  const idx = doc.value["6"].indexOf("Drake");
  check("Drake is in rarity 6 to begin with", idx !== -1, String(idx));

  doc.set(["6", idx], "Drake!");
  const out = doc.toString();
  const before = lines(original);
  const after = lines(out);
  check("line count is unchanged", before.length === after.length, `${before.length} -> ${after.length}`);

  const changed = [];
  for (let i = 0; i < Math.max(before.length, after.length); i++) {
    if (before[i] !== after[i]) changed.push(i + 1);
  }
  check("exactly one line changed", changed.length === 1, `lines ${changed.join(", ")}`);
  check("that line is Drake's", /Drake!/.test(after[changed[0] - 1]), after[changed[0] - 1]);
  check("the file still parses", parses(out));

  const a = JSON.parse(original);
  const b = JSON.parse(out);
  a["6"][idx] = "Drake!";
  check("the rest of the data is unchanged", JSON.stringify(a) === JSON.stringify(b));
}

/* ------------------------------------------------------------------ *
 * 3. Append / remove preserve the file's own indentation
 * ------------------------------------------------------------------ */

console.log("\n=== append then remove restores the file exactly ===");
/** Indent actually used by the children of the array at `path`, per the source. */
function localIndentOf(text, path) {
  const doc = new JsonDoc(text);
  const node = doc.nodeAt(path);
  if (!node) return null;
  const first = node.type === "array" ? node.items[0] : (node.entries[0] || {}).value;
  if (first === undefined || first === null) return null;
  const start = node.type === "array" ? first.start : first.start;
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const lead = text.slice(lineStart, start);
  return /^[ \t]+$/.test(lead) ? lead : null;
}

for (const [file, path, sample] of [
  ["characters_by_rarity.json", ["6"], "Test Character"],
  ["character_reso_shape.json", ["Z shape"], "Test Character"],
  ["exclude_character.json", [], "Test Character"],
  ["euphoria_list.json", ["1"], "Test Character: General"],
]) {
  const original = read(file);
  const doc = new JsonDoc(original);
  const parsedBefore = JSON.parse(original);
  const listBefore = path.length === 0 ? parsedBefore : parsedBefore[path[0]];
  const wasInline = !doc.isInline ? false : doc.isInline(path);
  const expectedIndent = localIndentOf(original, path);

  const newIndex = doc.append(path, sample);
  const appended = doc.toString();
  check(`${file}: append yields valid JSON`, parses(appended));

  const parsedAfter = JSON.parse(appended);
  const listAfter = path.length === 0 ? parsedAfter : parsedAfter[path[0]];
  check(`${file}: item was added`, listAfter.includes(sample), JSON.stringify(listAfter.slice(-2)));
  check(`${file}: returned index is correct`, listAfter[newIndex] === sample, `${newIndex} -> ${JSON.stringify(listAfter[newIndex])}`);
  check(`${file}: length grew by one`, listAfter.length === listBefore.length + 1, `${listBefore.length} -> ${listAfter.length}`);

  const addedLine = appended.split(/\r?\n/).find((l) => l.includes(JSON.stringify(sample)));
  if (wasInline) {
    check(`${file}: stays inline`, lines(appended).length === lines(original).length, JSON.stringify(addedLine));
  } else {
    check(
      `${file}: new line reuses the existing child indent`,
      expectedIndent !== null && addedLine.startsWith(expectedIndent),
      `expected ${JSON.stringify(expectedIndent)}, got ${JSON.stringify(addedLine)}`
    );
    check(
      `${file}: line count grew by one`,
      lines(appended).length === lines(original).length + 1,
      `${lines(original).length} -> ${lines(appended).length}`
    );
  }

  doc.removeAt(path, newIndex);
  check(`${file}: remove restores the file byte-for-byte`, doc.toString() === original, "output differs after undo");
}

/* ------------------------------------------------------------------ *
 * 4. removeAt on first / middle / last of a multi-line list
 * ------------------------------------------------------------------ */

console.log("\n=== removeAt positions ===");
for (const target of [0, 5, null]) {
  const original = read("characters_by_rarity.json");
  const doc = new JsonDoc(original);
  const list = doc.value["6"];
  const index = target === null ? list.length - 1 : target;
  const removed = list[index];

  doc.removeAt(["6"], index);
  const out = doc.toString();
  check(`remove index ${index} (${removed}): valid JSON`, parses(out));

  const after = JSON.parse(out)["6"];
  check(`remove index ${index}: gone from the list`, !after.includes(removed));
  check(`remove index ${index}: length shrank`, after.length === list.length - 1, `${list.length} -> ${after.length}`);
  check(`remove index ${index}: order preserved`, after.join("|") === list.filter((_, i) => i !== index).join("|"));
  check(
    `remove index ${index}: line count dropped by one`,
    lines(out).length === lines(original).length - 1,
    `${lines(original).length} -> ${lines(out).length}`
  );
}

/* ------------------------------------------------------------------ *
 * 5. Removing the only element collapses to []
 * ------------------------------------------------------------------ */

console.log("\n=== removeAt on a single-element list ===");
{
  const original = read("exclude_character.json");
  const doc = new JsonDoc(original);
  doc.removeAt([], 0);
  check("becomes an empty array", doc.toString().trim() === "[]", JSON.stringify(doc.toString()));
  check("is valid JSON", parses(doc.toString()));
}

/* ------------------------------------------------------------------ *
 * 6. Objects: setProperty / deleteProperty
 * ------------------------------------------------------------------ */

console.log("\n=== object properties ===");
{
  const original = read("global_name_transfer.json");
  const doc = new JsonDoc(original);
  const keysBefore = Object.keys(doc.value).length;

  doc.setProperty([], "Liang", "Liang Yue");
  check("setProperty on an existing key is a no-op", doc.toString() === original, "file changed");

  doc.setProperty([], "Test Key", "Test Value");
  const out = doc.toString();
  check("new property: valid JSON", parses(out));
  check("new property: present", JSON.parse(out)["Test Key"] === "Test Value");
  check("new property: one key added", Object.keys(JSON.parse(out)).length === keysBefore + 1);
  check("new property: existing keys untouched", JSON.parse(out)["Liang"] === "Liang Yue");
  check(
    "new property: line count grew by one",
    lines(out).length === lines(original).length + 1,
    `${lines(original).length} -> ${lines(out).length}`
  );

  doc.deleteProperty([], "Test Key");
  check("deleteProperty restores the file byte-for-byte", doc.toString() === original, "output differs after undo");
}

/* ------------------------------------------------------------------ *
 * 7. deleteProperty at each position in a nested object
 * ------------------------------------------------------------------ */

console.log("\n=== deleteProperty positions (psychube record) ===");
for (const key of ["id", "nameCN", "release_patch"]) {
  const original = read("psychube_id.json");
  const doc = new JsonDoc(original);
  check(`first chube has "${key}"`, Object.prototype.hasOwnProperty.call(doc.value["6"][0], key));

  doc.deleteProperty(["6", 0], key);
  const out = doc.toString();
  check(`delete "${key}": valid JSON`, parses(out));

  const item = JSON.parse(out)["6"][0];
  check(`delete "${key}": gone`, !Object.prototype.hasOwnProperty.call(item, key));
  check(`delete "${key}": sibling keys survive`, item.name === "Flows in All Things Alike", JSON.stringify(item));
  check(`delete "${key}": no other chube affected`, JSON.parse(out)["6"].length === JSON.parse(original)["6"].length);
}

/* ------------------------------------------------------------------ *
 * 8. Inline arrays stay inline when a tag is appended
 * ------------------------------------------------------------------ */

console.log("\n=== inline tag arrays ===");
{
  const original = read("psychube_id.json");
  const doc = new JsonDoc(original);
  const tagsLineBefore = lines(original).find((l) => l.includes('"tags"'));
  check("tags start on one line", /"tags": \[[^\]]*\]/.test(tagsLineBefore), tagsLineBefore);

  doc.append(["6", 0, "tags"], "Support");
  const out = doc.toString();
  check("appended tag: valid JSON", parses(out));
  check("appended tag: present", JSON.parse(out)["6"][0].tags.includes("Support"));

  const tagsLineAfter = lines(out).find((l) => l.includes('"tags"'));
  check("appended tag: still one line", /"tags": \[[^\]]*\]/.test(tagsLineAfter), tagsLineAfter);
  check("appended tag: exactly one line changed", lines(out).filter((l, i) => l !== lines(original)[i]).length === 1);
}

/* ------------------------------------------------------------------ *
 * 9. Multi-line append for a record (team preset slot)
 * ------------------------------------------------------------------ */

console.log("\n=== multi-line record append ===");
{
  const original = read("team_archetypes.json");
  const doc = new JsonDoc(original);
  const countBefore = doc.value.Conduit[0].length;

  doc.append(["Conduit", 0], { character: "Sotheby", psychube: "Her Third Life", is_essential: true });
  const out = doc.toString();
  check("append record: valid JSON", parses(out));

  const variant = JSON.parse(out).Conduit[0];
  check("append record: added", variant.length === countBefore + 1, `${countBefore} -> ${variant.length}`);
  check("append record: content correct", variant[variant.length - 1].character === "Sotheby", JSON.stringify(variant[variant.length - 1]));
  check("append record: is_essential stays a boolean", variant[variant.length - 1].is_essential === true);
  const addedLine = lines(out).find((l) => l.includes('"character": "Sotheby"'));
  check("append record: rendered multi-line", addedLine !== undefined, "no line contains the new record");
  check(
    "append record: record fields are on separate lines",
    lines(out).filter((l) => l.includes('"character": "Sotheby"') || l.includes('"psychube": "Her Third Life"')).length === 2,
    JSON.stringify(lines(out).filter((l) => /Sotheby|Her Third Life/.test(l)))
  );

  doc.removeAt(["Conduit", 0], countBefore);
  check("append record: undo restores the file byte-for-byte", doc.toString() === original, "output differs after undo");
}

/* ------------------------------------------------------------------ *
 * 10. Parser rejects malformed input
 * ------------------------------------------------------------------ */

console.log("\n=== malformed input ===");
for (const [label, text] of [
  ["unclosed object", '{"a": 1'],
  ["trailing comma", '{"a": 1,}'],
  ["single quotes", "{'a': 1}"],
  ["unquoted key", "{a: 1}"],
  ["raw newline in string", '{"a": "x\ny"}'],
  ["trailing content", '{"a": 1} extra'],
]) {
  let threw = false;
  try {
    new JsonDoc(text);
  } catch {
    threw = true;
  }
  check(`rejects ${label}`, threw);
}

console.log("\n=== inline objects keep their spacing (regression) ===");
{
  // Adding then removing the last property of a single-line object must not
  // disturb the space before the closing brace.
  const original = '{\n  "a": [{ "x": 1, "y": 2 }, { "x": 3, "y": 4 }]\n}';
  const doc = new JsonDoc(original);

  doc.setProperty(["a", 0], "z", true);
  const added = doc.toString();
  check("added property is valid JSON", (() => { try { JSON.parse(added); return true; } catch { return false; } })());
  check("added property has a clean separator", /"y": 2, "z": true \}/.test(added), added.split("\n")[1]);
  check("no space-before-comma was introduced", !/"y": 2 ,/.test(added), added.split("\n")[1]);
  check("the closing brace keeps its space", !/true\}/.test(added), added.split("\n")[1]);

  doc.deleteProperty(["a", 0], "z");
  check("removing it restores the original bytes", doc.toString() === original, JSON.stringify(doc.toString()));
}

console.log("\n=== inline arrays keep their spacing (regression) ===");
{
  const original = '{\n  "a": [1, 2 ]\n}';
  const doc = new JsonDoc(original);
  doc.append(["a"], 3);
  const out = doc.toString();
  check("appended item is valid JSON", (() => { try { JSON.parse(out); return true; } catch { return false; } })());
  check("no space-before-comma was introduced", !/2 ,/.test(out), out.split("\n")[1]);
  check("the original space before ] survives", /\s\]/.test(out), out.split("\n")[1]);
}

console.log("\n=== reorderProperty ===");
{
  const original = read("team_archetypes.json");
  const doc = new JsonDoc(original);
  const keysBefore = Object.keys(doc.value);

  const moved = doc.reorderProperty([], "Conduit", 3);
  check("reorder reports a change", moved === true);
  const after = doc.toString();
  check("reordered file is valid JSON", parses(after));

  const keysAfter = Object.keys(JSON.parse(after));
  check("key count unchanged", keysAfter.length === keysBefore.length, `${keysBefore.length} -> ${keysAfter.length}`);
  check("the moved key is at index 3", keysAfter[3] === "Conduit", JSON.stringify(keysAfter.slice(0, 5)));
  check(
    "the other keys kept their relative order",
    keysAfter.filter((k) => k !== "Conduit").join("|") === keysBefore.filter((k) => k !== "Conduit").join("|")
  );
  check("no key was lost", keysBefore.every((k) => keysAfter.includes(k)));

  // Every entry's own text must survive verbatim.
  const entryText = (src, key) => {
    const d = new JsonDoc(src);
    const e = d.root.entries.find((x) => x.key === key);
    return src.slice(e.keyStart, e.value.end);
  };
  let verbatim = 0;
  for (const k of keysBefore) {
    if (entryText(original, k) === entryText(after, k)) verbatim++;
    else console.log(`        entry "${k}" was reformatted`);
  }
  check("every entry block is byte-identical after the move", verbatim === keysBefore.length, `${verbatim}/${keysBefore.length}`);

  // Moving it back must restore the file exactly.
  doc.reorderProperty([], "Conduit", 0);
  check("moving it back is byte-identical", doc.toString() === original, "differs");

  // A no-op reorder must not touch the file.
  const doc2 = new JsonDoc(original);
  check("reordering to the same index is a no-op", doc2.reorderProperty([], "Conduit", 0) === false);
  check("and it did not change the text", doc2.toString() === original);

  // Out-of-range indices clamp instead of throwing.
  const doc3 = new JsonDoc(original);
  doc3.reorderProperty([], "Conduit", 999);
  const clamped = Object.keys(JSON.parse(doc3.toString()));
  check("an out-of-range index clamps to the end", clamped[clamped.length - 1] === "Conduit", JSON.stringify(clamped.slice(-2)));

  // An unknown key is a no-op.
  const doc4 = new JsonDoc(original);
  check("an unknown key is a no-op", doc4.reorderProperty([], "No Such Preset", 1) === false);
}

console.log("\n=== reorderAt ===");
{
  const original = read("team_archetypes.json");
  const doc = new JsonDoc(original);
  const preset = Object.keys(doc.value).find((k) => Array.isArray(doc.value[k][0]) && doc.value[k][0].length >= 2);
  check("a preset with two members is available", typeof preset === "string", String(preset));

  const before = doc.value[preset][0].map((m) => m.character);
  const moved = doc.reorderAt([preset, 0], 0, 1);
  check("reorder reports a change", moved === true);
  const after = doc.toString();
  check("reordered file is valid JSON", parses(after));

  const afterNames = JSON.parse(after)[preset][0].map((m) => m.character);
  check("the first two members swapped", afterNames[0] === before[1] && afterNames[1] === before[0], JSON.stringify(afterNames.slice(0, 2)));
  check("no member was lost", afterNames.length === before.length, `${before.length} -> ${afterNames.length}`);

  doc.reorderAt([preset, 0], 1, 0);
  check("moving it back is byte-identical", doc.toString() === original, "differs");

  const doc2 = new JsonDoc(original);
  check("reordering to the same index is a no-op", doc2.reorderAt([preset, 0], 0, 0) === false);
  check("and it did not change the text", doc2.toString() === original);

  const doc3 = new JsonDoc(original);
  check("an out-of-range source is a no-op", doc3.reorderAt([preset, 0], 99, 0) === false);
  doc3.reorderAt([preset, 0], 0, 999);
  const clamped = JSON.parse(doc3.toString())[preset][0].map((m) => m.character);
  check("an out-of-range target clamps to the end", clamped[clamped.length - 1] === before[0], JSON.stringify(clamped.slice(-2)));
}

console.log("\n=== reorderProperty on a nested object ===");
{
  const original = read("psychube_id.json");
  const doc = new JsonDoc(original);
  const first = doc.value["6"][0];
  const keysBefore = Object.keys(first);

  doc.reorderProperty(["6", 0], "release_patch", 1);
  const after = doc.toString();
  check("nested reorder is valid JSON", parses(after));
  const keysAfter = Object.keys(JSON.parse(after)["6"][0]);
  check("the nested key moved to index 1", keysAfter[1] === "release_patch", JSON.stringify(keysAfter));
  check("all nested keys survive", keysBefore.every((k) => keysAfter.includes(k)));

  doc.reorderProperty(["6", 0], "release_patch", keysBefore.length - 1);
  check("moving it back restores the file", doc.toString() === original, "differs");
}

console.log("\n=== duplicate keys are preserved, not collapsed ===");
{
  // name_map.json used to ship a duplicate "AliEn T" key. The parser must keep
  // both entries so the editor can show and fix them.
  const root = parseJson('{\n  "a": "1",\n  "a": "2"\n}');
  check("both entries kept", root.entries.length === 2, String(root.entries.length));
  check("toValue keeps the last one, like JSON.parse", toValue(root).a === "2", toValue(root).a);
}

/* ------------------------------------------------------------------ *
 * 11. Every generated file survives a realistic edit cycle
 * ------------------------------------------------------------------ */

console.log("\n=== realistic edit cycle on every file ===");
for (const f of files) {
  const original = read(f);
  const doc = new JsonDoc(original);
  const value = doc.value;
  if (!value || typeof value !== "object") continue;

  // Find something addressable and change it, then change it back.
  const firstKey = Object.keys(value)[0];
  const target = value[firstKey];
  let restored;
  if (Array.isArray(target) && target.length > 0 && typeof target[0] === "string") {
    doc.set([firstKey, 0], target[0] + "!");
    doc.set([firstKey, 0], target[0]);
    restored = doc.toString() === original;
  } else if (target && typeof target === "object" && !Array.isArray(target)) {
    const innerKey = Object.keys(target)[0];
    if (typeof target[innerKey] === "string") {
      doc.set([firstKey, innerKey], target[innerKey] + "!");
      doc.set([firstKey, innerKey], target[innerKey]);
      restored = doc.toString() === original;
    }
  }
  if (restored !== undefined) {
    check(`${f}: edit then revert is byte-identical`, restored, "not restored");
  }
}

console.log(`\n=== ${checks - failures}/${checks} checks passed ===`);
process.exit(failures === 0 ? 0 : 1);
