/**
 * `characters_mats_required.json` — per-character progression costs.
 *
 * Three of the six fields are game data:
 *   insight   <- `character_rank`      (rank 2..N -> insight 1..N-1, each `consume`)
 *   resonance <- `character_talent`    (talent 2..N -> resonance N, each `consume`)
 *   frequency <- `talent_style_cost`   (style 1..5 -> the craftable resonance patterns)
 * All are merged CN-then-global so CN-only arcanists get their rows too, and the
 * material names come from the global `item` table.
 *
 * The other three are hand-authored — no table reproduces them:
 *   stats, euphoria, mastery
 * They live in `content/progression_costs.json` (extracted once by
 * `scripts/sync/tools/extract-progression.mjs`) and are copied through here.
 *
 * The key is the canonical roster name (AGENTS.md §1.5), and `rarity`/`afflatus`
 * follow the shared `character.rare + 1` and `career` rules.
 */
import path from "node:path";
import { CONTENT, RARITY_OFFSET } from "../config.mjs";
import { tryReadJson } from "../util.mjs";
import { table } from "../sources.mjs";
import { canonicalName, charactersById } from "./names.mjs";
import { afflatusFor } from "./characters.mjs";
import { materialsFrom } from "./consume.mjs";
import { frequencySteps, patternTables } from "./patterns.mjs";

/** Fallback used only when the curated file has no row for a hero. */
const DEFAULT_STATS = {
  "0-1": [200, 1200, 100, 100, 200, 5, 130],
  "0-30": [350, 2000, 180, 180, 200, 5, 130],
  "1-40": [600, 3500, 300, 300, 250, 7, 135],
  "2-50": [900, 5000, 450, 450, 300, 10, 140],
  "3-60": [1100, 6500, 550, 550, 350, 12, 145],
};

/** CN then global, keyed by `heroId#tier`; global wins on conflicts. */
function mergedTiers(name, key) {
  const map = new Map();
  for (const server of ["cn", "global"]) {
    for (const row of table(server, name)) map.set(`${row.heroId}#${row[key]}`, row);
  }
  return [...map.values()];
}

function groupByHero(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.heroId)) map.set(row.heroId, []);
    map.get(row.heroId).push(row);
  }
  return map;
}

export function charactersMatsRequired() {
  const rankBy = groupByHero(mergedTiers("character_rank", "rank"));
  const talentBy = groupByHero(mergedTiers("character_talent", "talentId"));
  const curated = tryReadJson(path.join(CONTENT, "progression_costs.json")) || {};
  const patterns = patternTables();

  // Deduplicate the roster by canonical name; the global row wins.
  const roster = new Map();
  for (const [id, ch] of charactersById()) {
    const name = canonicalName(id);
    const previous = roster.get(name);
    if (!previous || (previous.ch._server === "cn" && ch._server === "global")) {
      roster.set(name, { id, ch });
    }
  }

  const out = {};
  for (const [name, { id, ch }] of roster) {
    const own = curated[name] || {};
    const ranks = (rankBy.get(id) || [])
      .filter((row) => row.rank > 1 && row.consume)
      .sort((a, b) => a.rank - b.rank)
      .map((row) => ({ insight: row.rank - 1, materials: materialsFrom(row.consume) }));
    const talents = (talentBy.get(id) || [])
      .filter((row) => row.talentId > 1 && row.consume)
      .sort((a, b) => a.talentId - b.talentId)
      .map((row) => ({ resonance: row.talentId, materials: materialsFrom(row.consume) }));

    out[name] = {
      id,
      name,
      rarity: Number(ch.rare) + RARITY_OFFSET,
      afflatus: afflatusFor(name, ch),
      stats: own.stats || DEFAULT_STATS,
      insight: ranks,
      resonance: talents,
      euphoria: own.euphoria || [],
      mastery: own.mastery || [],
      frequency: frequencySteps(id, patterns.mouldMap, patterns.costMap, patterns.nameMap),
    };
  }

  return out;
}
