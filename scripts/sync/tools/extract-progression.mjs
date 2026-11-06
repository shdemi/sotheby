/**
 * One-time extractor: pulls the hand-authored half of
 * `data/characters_mats_required.json` into `content/progression.json`.
 *
 * `insight` and `resonance` are game data (`character_rank` and
 * `character_talent`), but `stats`, `euphoria`, `mastery` and `frequency` were
 * typed in by hand and no table reproduces them. This tool copies those four
 * fields across, keyed by canonical roster name, so the generator can own the
 * rest without losing the curated numbers.
 *
 *   node scripts/sync/tools/extract-progression.mjs
 *
 * It is idempotent: re-running it overwrites `content/progression.json` with the
 * fields the current `data/` file still holds. Run it once, then delete the
 * legacy source once the generator is wired in.
 */
import fs from "node:fs";
import path from "node:path";
import { CONTENT, OUT } from "../config.mjs";
import { readJson, writeJson } from "../util.mjs";
import { canonicalName, charactersById, resolveName } from "../derive/names.mjs";

const FIELDS = ["stats", "euphoria", "mastery", "frequency"];

const legacy = readJson(path.join(OUT, "characters_mats_required.json"));

// Deduplicate the roster by canonical name; the global row wins.
const roster = new Map();
for (const [id, ch] of charactersById()) {
  const name = canonicalName(id);
  const previous = roster.get(name);
  if (!previous || (previous._server === "cn" && ch._server === "global")) roster.set(name, ch);
}

// The legacy file has a few stale rows keyed by old ids (10081:J, 10067:Ezra
// Theodore); both they and the canonical row canonicalise to the same name, and
// sometimes only one of the pair is filled in, so keep every row per name.
const rowsByName = new Map();
for (const row of Object.values(legacy)) {
  if (!row || row.id === undefined) continue;
  let name = canonicalName(row.id);
  if (!roster.has(name)) name = resolveName(row.name || "");
  if (!roster.has(name)) continue;
  if (!rowsByName.has(name)) rowsByName.set(name, []);
  rowsByName.get(name).push(row);
}

function filled(value) {
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(value);
}

const out = {};
const missing = [];
for (const name of [...roster.keys()].sort()) {
  const sources = rowsByName.get(name) || [];
  if (!sources.length) {
    missing.push(name);
    continue;
  }
  const entry = {};
  for (const field of FIELDS) {
    const value = sources.map((source) => source[field]).find(filled);
    if (field === "stats") entry[field] = value || null;
    else entry[field] = Array.isArray(value) ? value : [];
  }
  out[name] = entry;
}

const target = path.join(CONTENT, "progression.json");
fs.mkdirSync(path.dirname(target), { recursive: true });
writeJson(target, out);

const counts = Object.fromEntries(
  FIELDS.map((field) => [
    field,
    Object.values(out).filter((entry) => {
      const value = entry[field];
      return Array.isArray(value) ? value.length > 0 : Boolean(value);
    }).length,
  ]),
);

console.log(`wrote content/progression.json (${Object.keys(out).length} characters)`);
console.log(`non-empty: ${FIELDS.map((f) => `${f}=${counts[f]}`).join(" ")}`);
if (missing.length) console.log(`no legacy row for: ${missing.join(", ")}`);
