/**
 * `progression_levels.json` — what one arcanist level costs in Dust + Sharpodonty.
 *
 * `character_cosume` prices every `(rare, level)` pair: `2#5` is Dust and `2#3` is
 * Sharpodonty. Its `level` column is *cumulative* over the four insight tiers (a 6★
 * runs 1..180), and the numbering restarts conceptually at each ascension, so the
 * band offsets below are the only translation this file needs:
 *
 *   insight 0 -> levels   1..30   (cumulative   1..30)
 *   insight 1 -> levels  31..70   (cumulative  31..70)
 *   insight 2 -> levels  71..120
 *   insight 3 -> levels 121..180
 *
 * A row is the cost of *reaching* that level, so level 1 of a band is free and the
 * bill for "level 1 -> N" is levels 2..N. That reproduces the band totals the
 * InfoBook's progression panel has always shown (5★/6★: 27700/15080, 100200/53100,
 * 406700/137200, 810880/400600; 4★: 20680/11200, 75040/39720, 305020/102780;
 * 2★/3★: 16620/8930, 60120/31860, 244020/82320).
 *
 * The app's rarity is `rare + 1`. 5★ and 6★ share one curve, and 2★ with 3★ another,
 * but the groups are detected from the data rather than assumed.
 */
import { RARITIES, RARITY_OFFSET } from "../config.mjs";
import { table } from "../sources.mjs";
import { costParts } from "./consume.mjs";

const BANDS = [
  { insight: 0, maxLevel: 30, offset: 0 },
  { insight: 1, maxLevel: 40, offset: 30 },
  { insight: 2, maxLevel: 50, offset: 70 },
  { insight: 3, maxLevel: 60, offset: 120 },
];

/** App rarity -> the insights it can reach (5★/6★ stop at III, the rest at II). */
function maxInsight(rarity) {
  return rarity >= 5 ? 3 : 2;
}

/** The rows of one game rarity, keyed by cumulative level. */
function curveFor(rare) {
  const rows = new Map();
  for (const row of table("global", "character_cosume")) {
    if (Number(row.rare) !== rare) continue;
    rows.set(Number(row.level), costParts(row.cosume));
  }
  return rows;
}

function bandsFor(rarity) {
  const rows = curveFor(rarity - RARITY_OFFSET);
  const out = [];
  for (const band of BANDS) {
    if (band.insight > maxInsight(rarity)) break;
    const levels = {};
    for (let level = 2; level <= band.maxLevel; level++) {
      const cost = rows.get(band.offset + level) || new Map();
      levels[String(level)] = {
        dust: cost.get("2#5") || 0,
        sharpodonty: cost.get("2#3") || 0,
      };
    }
    out.push({ insight: band.insight, levels });
  }
  return out;
}

export function progressionLevels() {
  const byRarity = new Map();
  for (const rarity of RARITIES) {
    if (!curveFor(rarity - RARITY_OFFSET).size) continue;
    byRarity.set(rarity, bandsFor(rarity));
  }

  // Fold rarities that ship the exact same curve into one group.
  const groups = [];
  for (const [rarity, bands] of byRarity) {
    const signature = JSON.stringify(bands);
    const same = groups.find((group) => group.signature === signature);
    if (same) same.rarities.push(rarity);
    else groups.push({ signature, rarities: [rarity], bands });
  }

  return {
    groups: groups.map(({ rarities, bands }) =>
      bands.map((band) => ({
        rarities: rarities.slice().sort((a, b) => a - b),
        insight: band.insight,
        levels: band.levels,
      }))
    ).flat(),
  };
}
