/**
 * Thin readers over the two St-Pavlov checkouts.
 *
 * Only these two repos are data sources. Text always comes from the GLOBAL repo,
 * because the CN repo ships empty (2-byte) language files.
 */
import path from "node:path";
import { SRC, LANGS } from "./config.mjs";
import { asArray, readJson } from "./util.mjs";

const tableCache = new Map();
const langCache = new Map();

/** Reads `data/json/<name>.json` from a server ("global" | "cn"). */
export function table(server, name) {
  const file = path.join(SRC[server], "json", name + ".json");
  const key = file;
  if (!tableCache.has(key)) tableCache.set(key, asArray(readJson(file)));
  return tableCache.get(key);
}

/** Reads `data/configs/language/language_<lang>.json` (global server only). */
export function language(lang) {
  if (!LANGS.includes(lang)) throw new Error(`unsupported language: ${lang}`);
  if (!langCache.has(lang)) {
    const file = path.join(SRC.global, "configs", "language", `language_${lang}.json`);
    const map = new Map(asArray(readJson(file)).map((row) => [row.key, row.content]));
    langCache.set(lang, map);
  }
  return langCache.get(lang);
}

/** Resolves a game text key (`language_123`) through a language map. */
export function text(lang, key) {
  if (key === undefined || key === null) return "";
  const str = String(key);
  if (!str.startsWith("language_")) return str;
  return language(lang).get(str) ?? str;
}

/** Indexes an array table by a field (default `id`). */
export function indexBy(rows, field = "id") {
  const map = new Map();
  for (const row of rows) map.set(row[field], row);
  return map;
}
