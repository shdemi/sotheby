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

/** The two psychube rarities the app tracks (5★ and 6★). */
export const PSYCHUBE_RARITIES = [6, 5];

/** Placeholder rows that exist in `character.json` but are not real arcanists. */
export const EXCLUDED_CHARACTER_IDS = new Set([9998]);
