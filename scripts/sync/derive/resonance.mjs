/**
 * `character_reso_shape.json` and `shape_patterns.json`.
 *
 * `character_talent.talentMould` is the character's resonance board; `talent_style`
 * lists the six resonance patterns of each board. The game has no display name for a
 * board, so `maps/resonance-shapes.json` maps the mould id to the label the app uses
 * ("Z shape", "Plus shape", …).
 */
import path from "node:path";
import { MAPS } from "../config.mjs";
import { tryReadJson } from "../util.mjs";
import { lookup, table } from "../sources.mjs";
import { canonicalName, charactersById } from "./names.mjs";
import { excludeCharacters } from "./curation.mjs";

function shapeLabels() {
  return (tryReadJson(path.join(MAPS, "resonance-shapes.json")) || {}).shapes || {};
}

/** heroId -> talentMould (global rows win; CN fills the gaps). */
function moulds() {
  const byHero = new Map();
  for (const server of ["cn", "global"]) {
    for (const row of table(server, "character_talent")) byHero.set(row.heroId, row.talentMould);
  }
  return byHero;
}

export function shapePatterns() {
  const labels = shapeLabels();
  const order = Object.keys(labels).sort((a, b) => Number(a) - Number(b));
  const out = {};
  for (const mould of order) {
    const styles = table("global", "talent_style")
      .filter((style) => String(style.talentMould) === String(mould))
      .sort((a, b) => a.styleId - b.styleId);
    const names = styles.map((style) => lookup("en", style.name).value).filter(Boolean);
    if (names.length) out[labels[mould]] = names;
  }
  return out;
}

export function characterResoShape() {
  const labels = shapeLabels();
  const byHero = moulds();
  const excluded = new Set(excludeCharacters());
  const buckets = new Map();

  for (const [id] of charactersById()) {
    const name = canonicalName(id);
    if (excluded.has(name)) continue;
    const label = labels[byHero.get(id)];
    if (!label) continue;
    if (!buckets.has(label)) buckets.set(label, []);
    buckets.get(label).push({ name, id: Number(id) });
  }

  const out = {};
  for (const label of Object.values(labels)) {
    const rows = buckets.get(label);
    if (!rows) continue;
    const seen = new Set();
    out[label] = rows
      .sort((a, b) => b.id - a.id)
      .map((row) => row.name)
      .filter((name) => (seen.has(name) ? false : seen.add(name)));
  }
  return out;
}
