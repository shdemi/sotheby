/**
 * Resonance patterns (the "Frequency" system).
 *
 * `talent_style` lists the six patterns of a resonance board (`talentMould`).
 * `styleId 0` is Placidity, the default the board already carries; `1..5` are the
 * ones a player crafts, and `talent_style_cost` prices them per hero — the same
 * five bills regardless of the hero's board shape, but each hero has its own rows.
 *
 * Two outputs come from here:
 *   `characters_mats_required.json -> frequency[]`  one entry per craftable pattern
 *   `pattern_costs.json`                            name -> pattern -> materials, for
 *                                                  the InfoBook's pattern panel
 *
 * Before this the numbers lived in hand-authored content with invented node ids
 * and board names that did not exist in the game; they are game data.
 */
import { lookup, table } from "../sources.mjs";
import { charactersByCanonicalName } from "./names.mjs";
import { materialsFrom } from "./consume.mjs";

/** heroId -> talentMould (global rows win; CN fills the gaps). */
function moulds() {
  const byHero = new Map();
  for (const server of ["cn", "global"]) {
    for (const row of table(server, "character_talent")) byHero.set(row.heroId, row.talentMould);
  }
  return byHero;
}

/** heroId -> Map(styleId -> materials), CN then global. */
function costsByHero() {
  const byHero = new Map();
  for (const server of ["cn", "global"]) {
    for (const row of table(server, "talent_style_cost")) {
      if (!byHero.has(row.heroId)) byHero.set(row.heroId, new Map());
      byHero.get(row.heroId).set(row.styleId, materialsFrom(row.consume));
    }
  }
  return byHero;
}

/** mould -> Map(styleId -> pattern name), Placidity excluded. */
function patternNames() {
  const byMould = new Map();
  const rows = table("global", "talent_style")
    .filter((row) => row.styleId > 0)
    .sort((a, b) => a.styleId - b.styleId);
  for (const row of rows) {
    if (!byMould.has(row.talentMould)) byMould.set(row.talentMould, new Map());
    const name = lookup("en", row.name);
    if (name.found && name.value) byMould.get(row.talentMould).set(row.styleId, name.value);
  }
  return byMould;
}

/**
 * The five craftable patterns of one hero, in game order.
 * Empty when the hero has no board or no cost rows yet.
 */
export function frequencySteps(heroId, mouldMap, costMap, nameMap) {
  const mould = mouldMap.get(heroId);
  if (mould === undefined) return [];
  const names = nameMap.get(mould) || new Map();
  const costs = costMap.get(heroId) || new Map();
  return [...costs.keys()]
    .sort((a, b) => a - b)
    .filter((styleId) => names.has(styleId))
    .map((styleId) => ({
      id: styleId,
      name: names.get(styleId),
      materials: costs.get(styleId),
    }));
}

/** Builders are shared so `mats.mjs` and `patternCosts()` read the tables once. */
export function patternTables() {
  return { mouldMap: moulds(), costMap: costsByHero(), nameMap: patternNames() };
}

/** `{ "<canonical name>": { "<pattern>": [{ material, quantity }] } }` */
export function patternCosts() {
  const { mouldMap, costMap, nameMap } = patternTables();
  const out = {};
  for (const [name, id] of charactersByCanonicalName()) {
    const steps = frequencySteps(id, mouldMap, costMap, nameMap);
    if (!steps.length) continue;
    const byPattern = {};
    for (const step of steps) byPattern[step.name] = step.materials;
    out[name] = byPattern;
  }
  return out;
}
