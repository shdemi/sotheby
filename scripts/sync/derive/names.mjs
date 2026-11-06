/**
 * Character identity: the single place that turns a game id into a display name.
 *
 * The app's roster key is what `canonicalName()` returns. The rule mirrors app.js:
 *   canonical(id) = override[ name ] ?? name
 * where `name` is the global `language_en` text for the character, except for
 * CN-only characters (no global text), which fall back to their `nameEng`.
 *
 * The game's English text sometimes carries markup (`<i>Lady by the Lake</i>`), so it
 * is stripped. A handful of names still disagree with the roster name the project
 * uses; those live in `maps/name-overrides.json`.
 */
import path from "node:path";
import { SRC, MAPS, EXCLUDED_CHARACTER_IDS } from "../config.mjs";
import { asArray, readJson, tryReadJson } from "../util.mjs";
import { table, text } from "../sources.mjs";

let cache = null;

/** The Myssal mapping is the aggregate of characters; it is the raw-name source. */
export function arcanistMap() {
  return asArray(readJson(path.join(SRC.assets, "mappings", "ArcanistMap.json"))).filter(
    (entry) => !EXCLUDED_CHARACTER_IDS.has(entry.id),
  );
}

function overrides() {
  const file = path.join(MAPS, "name-overrides.json");
  const data = tryReadJson(file) || {};
  return data.overrides || {};
}

/** Removes markup (`<i>`) and collapses whitespace. */
function clean(value) {
  if (value === undefined || value === null) return "";
  return String(value).replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

/** All characters from both servers, indexed by id (global wins on conflict). */
export function charactersById() {
  const map = new Map();
  for (const ch of table("cn", "character")) {
    if (!EXCLUDED_CHARACTER_IDS.has(ch.id)) map.set(ch.id, { ...ch, _server: "cn" });
  }
  for (const ch of table("global", "character")) {
    if (!EXCLUDED_CHARACTER_IDS.has(ch.id)) map.set(ch.id, { ...ch, _server: "global" });
  }
  return map;
}

/** Builds the shared identity indexes once. */
function build() {
  const chars = charactersById();
  const override = overrides();
  const raw = new Map(); // id -> raw Myssal name
  for (const entry of arcanistMap()) raw.set(entry.id, entry.nameEng || entry.name);

  const byId = new Map();
  for (const [id, ch] of chars) {
    const languages = ch._server === "global" ? clean(text("en", ch.name)) : "";
    const fallback = clean(ch.nameEng) || clean(ch.name) || String(id);
    const name = override[languages] || languages || fallback;
    byId.set(id, override[name] || name);
  }

  // Myssal may know characters St-Pavlov has not shipped yet; keep their nameEng.
  for (const [id, name] of raw) {
    if (!byId.has(id)) byId.set(id, override[name] || name);
  }

  const transfer = {};
  for (const [id, rawName] of raw) {
    const canonical = byId.get(id);
    if (rawName && canonical && rawName !== canonical) transfer[rawName] = canonical;
  }

  cache = { chars, byId, transfer, raw };
  return cache;
}

export function identity() {
  return cache || build();
}

export function canonicalName(id) {
  return identity().byId.get(id) ?? String(id);
}

export function resolveName(name) {
  return identity().transfer[name] ?? name;
}

/** `{ rawName: canonicalName }` for every character whose raw name differs. */
export function globalNameTransfer() {
  const { transfer } = identity();
  const out = {};
  for (const key of Object.keys(transfer).sort()) out[key] = transfer[key];
  return out;
}

/** `{ character: { EN: CN }, skin: { EN: CN } }`. */
export function nameMap() {
  const chars = charactersById();
  const character = {};
  for (const entry of arcanistMap()) {
    const id = entry.id;
    const name = identity().byId.get(id);
    const ch = chars.get(id);
    if (!name || !ch) continue;
    const cn = clean(text("zh", ch.name)) || clean(ch.nameEng);
    if (name !== cn) character[name] = cn;
  }
  return { character, skin: {} };
}
