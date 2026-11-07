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
 *
 * `global_name_transfer.json` comes from the same two names: the game's own English
 * label (`nameEng`) mapped onto the canonical key whenever they differ. Legacy
 * labels the game no longer ships (`Changeling`, `Liang`, `Black Dwarf`) are handled
 * by `NAME_ALIASES` in app.js, not here.
 */
import path from "node:path";
import { MAPS, EXCLUDED_CHARACTER_IDS } from "../config.mjs";
import { tryReadJson } from "../util.mjs";
import { table, text } from "../sources.mjs";

let cache = null;

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

  const byId = new Map();
  for (const [id, ch] of chars) {
    const languages = ch._server === "global" ? clean(text("en", ch.name)) : "";
    const fallback = clean(ch.nameEng) || clean(ch.name) || String(id);
    const name = override[languages] || languages || fallback;
    byId.set(id, override[name] || name);
  }

  // The game's own English label, mapped onto the canonical roster key.
  const transfer = {};
  for (const [id, ch] of chars) {
    const raw = clean(ch.nameEng);
    const canonical = byId.get(id);
    if (raw && canonical && raw !== canonical) transfer[raw] = canonical;
  }

  cache = { chars, byId, transfer };
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

/**
 * One character per canonical name, ascending by game id. The CN server ships a
 * second APPLe row (3999) that folds into the global one (3028), so the roster and
 * the generated ArcanistMap stay single-valued. Returns canonical name -> game id.
 */
export function charactersByCanonicalName() {
  const out = new Map();
  for (const id of [...charactersById().keys()].sort((a, b) => a - b)) {
    const canonical = canonicalName(id);
    if (canonical && !out.has(canonical)) out.set(canonical, id);
  }
  return out;
}

/** `{ rawName: canonicalName }` for every character whose game label differs. */
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
  for (const [name, id] of charactersByCanonicalName()) {
    const ch = chars.get(id);
    if (!name || !ch) continue;
    const cn = clean(text("zh", ch.name)) || clean(ch.nameEng);
    if (name !== cn) character[name] = cn;
  }
  return { character, skin: {} };
}
