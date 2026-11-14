/**
 * Shared configuration for the data pipeline.
 *
 * Sources (never committed, see AGENTS.md §2):
 *   - St-Pavlov global: numbers + all languages
 *   - St-Pavlov CN:     newer numbers (content ahead of global)
 *   - Myssal:           images only
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(HERE, "..", "..");

export const SRC = {
  global: path.join(ROOT, "githubfetch", "St-Pavlov-Foundation", "re1999-data-global-main", "data"),
  cn: path.join(ROOT, "githubfetch", "St-Pavlov-Foundation", "re1999-data-main", "data"),
  assets: path.join(ROOT, "githubfetch", "Myssal", "Reverse-1999-CN-Asset"),
};

export const OUT = path.join(ROOT, "data");
export const CONTENT = path.join(ROOT, "content");
export const MAPS = path.join(HERE, "maps");

/** Languages available in the global repo. The CN repo has empty language stubs. */
export const LANGS = ["en", "zh", "tw", "jp", "kr"];

/**
 * The game stores `rare` one below the rarity the UI shows: a 6★ is `rare: 5`,
 * a 5★ is `rare: 4`, and the lowest arcanists are `rare: 1` (shown as 2★).
 * Both characters and psychubes follow the same rule.
 */
export const RARITY_OFFSET = 1;

/** Rarity keys as the app uses them (displayed rarity), newest/highest first. */
export const RARITIES = [6, 5, 4, 3, 2];

/**
 * `skill_effect.showTag` → the card-type label the game prints (AGENTS.md §10).
 * The app's own heuristic guesses from the rank-1 text and gets it wrong on cards
 * whose effect lands on a later rank, so the table is the reference where it is
 * filled in. Only ultimates carry it into `data/` (the other cards keep the
 * hand-pinned labels in `maps/skill-badges.json`).
 */
export const SKILL_SHOW_TAGS = {
  1: { en: "Attack", zh: "攻击" },
  2: { en: "Attack", zh: "攻击" },
  3: { en: "Debuff", zh: "减益" },
  4: { en: "Buff", zh: "增益" },
  5: { en: "Counter", zh: "反制" },
  6: { en: "Health", zh: "治疗" },
  9: { en: "Channel", zh: "吟诵" },
  11: { en: "Versatile", zh: "万能" },
  14: { en: "Energy", zh: "交感" },
};

/** The two psychube rarities the app tracks (5★ and 6★). */
export const PSYCHUBE_RARITIES = [6, 5];

/** Placeholder rows that exist in `character.json` but are not real arcanists. */
export const EXCLUDED_CHARACTER_IDS = new Set([9998]);
