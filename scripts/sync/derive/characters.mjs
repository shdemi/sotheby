/**
 * `characters_by_rarity.json` and `characters_by_afflatus.json`.
 *
 * rarity   <- character.rare + RARITY_OFFSET (the game stores one below the shown rarity)
 * afflatus <- character.career, plus a small override list (maps/afflatus.json)
 *             because a couple of hand-curated entries disagreed with `career`.
 */
import path from "node:path";
import { MAPS, RARITIES, RARITY_OFFSET } from "../config.mjs";
import { tryReadJson, writeJson } from "../util.mjs";
import { canonicalName, charactersById } from "./names.mjs";

/** career id -> afflatus key. 101 is the hybrid that satisfies Mineral + Star. */
const CAREER = {
  1: "Mineral",
  2: "Star",
  3: "Plant",
  4: "Beast",
  5: "Spirit",
  6: "Intellect",
  101: "Mineral_Star",
};

const AFFLATUS_ORDER = ["Beast", "Plant", "Star", "Mineral", "Spirit", "Intellect", "Mineral_Star"];

function afflatusOverrides() {
  const data = tryReadJson(path.join(MAPS, "afflatus.json")) || {};
  return data.overrides || {};
}

export function charactersByRarity() {
  const out = {};
  const buckets = new Map();
  for (const [id, ch] of charactersById()) {
    const rarity = Number(ch.rare) + RARITY_OFFSET;
    if (!RARITIES.includes(rarity)) continue;
    if (!buckets.has(rarity)) buckets.set(rarity, new Set());
    buckets.get(rarity).add(canonicalName(id));
  }
  for (const rarity of [...RARITIES].sort((a, b) => b - a)) {
    const set = buckets.get(rarity);
    if (set) out[String(rarity)] = [...set].sort();
  }
  return out;
}

export function charactersByAfflatus() {
  const overrides = afflatusOverrides();
  const buckets = new Map();
  for (const [id, ch] of charactersById()) {
    const name = canonicalName(id);
    const afflatus = overrides[name] || CAREER[ch.career];
    if (!afflatus) continue;
    if (!buckets.has(afflatus)) buckets.set(afflatus, new Set());
    buckets.get(afflatus).add(name);
  }
  const out = {};
  for (const key of AFFLATUS_ORDER) {
    const set = buckets.get(key);
    if (set) out[key] = [...set].sort();
  }
  return out;
}

/** The afflatus of one character, honouring the hand overrides. */
export function afflatusFor(name, ch) {
  return afflatusOverrides()[name] || CAREER[ch.career];
}

export function writeCharacterOutputs(outDir) {
  writeJson(path.join(outDir, "characters_by_rarity.json"), charactersByRarity());
  writeJson(path.join(outDir, "characters_by_afflatus.json"), charactersByAfflatus());
}
