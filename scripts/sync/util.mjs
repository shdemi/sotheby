import fs from "node:fs";
import path from "node:path";

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/** The game tables are sometimes an array, sometimes an object keyed by id. */
export function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return Object.values(value);
  return [];
}

export function tryReadJson(file) {
  try {
    return readJson(file);
  } catch {
    return null;
  }
}

/**
 * Pretty-prints JSON the way the editor does (see `editor/json-patch.js`
 * `renderValue`): two-space indent, but arrays of short primitives stay on one
 * line so tag lists diff as a single line. Everything else matches
 * `JSON.stringify(data, null, 2)`.
 */
function renderScalar(value) {
  if (value === undefined) return "null";
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return renderValue(value, 0);
}

function renderValue(value, depth) {
  const INDENT = "  ";
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const allPrimitive = value.every((v) => v === null || typeof v !== "object");
    const inline = "[" + value.map(renderScalar).join(", ") + "]";
    if (allPrimitive && inline.length <= 48) return inline;
    const padIn = INDENT.repeat(depth + 1);
    const pad = INDENT.repeat(depth);
    return "[\n" + value.map((v) => padIn + renderValue(v, depth + 1)).join(",\n") + "\n" + pad + "]";
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value).filter((k) => value[k] !== undefined);
    if (keys.length === 0) return "{}";
    const padIn = INDENT.repeat(depth + 1);
    const pad = INDENT.repeat(depth);
    return (
      "{\n" +
      keys.map((k) => padIn + JSON.stringify(k) + ": " + renderValue(value[k], depth + 1)).join(",\n") +
      "\n" +
      pad +
      "}"
    );
  }
  return renderScalar(value);
}

/** Writes JSON with a trailing newline, matching the editor's file style. */
export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, renderValue(data, 0) + "\n", "utf8");
}

/** Stable key order for output objects: numbers first ascending, then strings. */
export function sortKeys(obj) {
  const out = {};
  for (const key of Object.keys(obj).sort(compareKeys)) out[key] = obj[key];
  return out;
}

export function compareKeys(a, b) {
  const na = Number(a), nb = Number(b);
  const aNum = !Number.isNaN(na), bNum = !Number.isNaN(nb);
  if (aNum && bNum) return na - nb;
  if (aNum) return -1;
  if (bNum) return 1;
  return String(a).localeCompare(String(b));
}

/** Sorts an array of {id} objects by numeric id descending (newest first). */
export function byIdDesc(a, b) {
  return Number(b.id) - Number(a.id);
}

/** Parses `1#111007#2|1#111013#3` into [{type,id,amount}]. */
export function parseMaterialList(cost) {
  if (!cost || typeof cost !== "string") return [];
  return cost
    .split("|")
    .map((part) => part.split("#"))
    .filter((p) => p.length >= 3)
    .map((p) => ({ type: Number(p[0]), id: String(p[1]), amount: Number(p[2]) }));
}
