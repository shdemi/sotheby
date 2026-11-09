/**
 * Locale strings for the OG cards.
 *
 * The labels live in `content/i18n.json` (class C, hand-authored) so a translator
 * edits them in the same file as the rest of the UI. Keys used here:
 *
 *   card.portrait     "Portrait"        / 塑造        / Portrait
 *   card.resonance    "Resonance"       / 共鸣        / Resonance
 *   builds.psychubes  "Recommended …"   / 推荐塑造    / Psychube đề xuất
 *   og.teamBuild      "Team Build"      / 队伍        / Đội hình
 *   og.noBuild        "No build data"   / 暂无推荐    / Chưa có dữ liệu build
 *   og.members        "4 members"       / 4 名角色    / 4 thành viên
 *   afflatus.<X>      Plant/Beast/…     / 木/兽/…     / Mộc/Thú/…
 *   pattern.<x>       Elucidation/…     / 洞彻/…      / Elucidation/…
 *
 * Anything missing falls back to English, then to the caller's default.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const LANGS = ["en", "cn", "vi"];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

let dictionary = null;

function dict() {
  if (dictionary) return dictionary;
  try {
    dictionary = JSON.parse(fs.readFileSync(path.join(ROOT, "content", "i18n.json"), "utf8"));
  } catch {
    dictionary = {};
  }
  return dictionary;
}

export function normalizeLang(value) {
  const lang = String(value || "").trim().toLowerCase();
  return LANGS.includes(lang) ? lang : "en";
}

export function t(lang, key, fallback = "") {
  const table = dict()[lang] || {};
  if (typeof table[key] === "string" && table[key]) return table[key];
  const en = (dict().en || {})[key];
  if (typeof en === "string" && en) return en;
  return fallback;
}

/** Afflatus label; `Mineral_Star` reuses the Mineral label, like `displayAfflatus()` does. */
export function afflatusLabel(lang, afflatus) {
  if (!afflatus) return "";
  const base = afflatus === "Mineral_Star" ? "Mineral" : afflatus;
  return t(lang, `afflatus.${base}`, afflatus);
}

/** Resonance pattern label; the key is lower-cased (`pattern.elucidation`). */
export function patternLabel(lang, pattern) {
  if (!pattern) return "";
  return t(lang, `pattern.${String(pattern).toLowerCase()}`, pattern);
}
