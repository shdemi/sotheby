/**
 * `data/stages/farm.json` — the drop table the Planner's farm plan solves.
 *
 * The game's own tables say what a stage *costs* (`episode.cost`) but never how
 * much of each material it drops: drop rates are community data. The owner
 * therefore allows exactly one static source for them (AGENTS.md §1.3
 * exception, §14 "The drop table"):
 *
 *   windbow27/kornblume -> public/data/stages<major>_<minor>_greedy.json
 *
 * The file is a local checkout under `ignore/kornblume-main/` (git-ignored, like
 * every other source). When it is absent — CI, a fresh clone — the committed
 * `data/stages/farm.json` is left untouched, the same way `sync:assets` behaves
 * without the Myssal checkout.
 *
 * Two details matter:
 *
 *   - Kornblume's numbers are *sample totals*: `drops[name]` is what a batch of
 *     `count` runs produced, so the expected yield of one run is the ratio. The
 *     generated row keeps that ratio, rounded to six decimals, and drops `count`
 *     itself — nothing in the app reads it.
 *   - Kornblume's item names lag the game ("Rhine Gold", "Pyroxene Ore",
 *     "Alopecurus Pratensis"). `maps/kornblume-names.json` carries the renames;
 *     a drop that still does not resolve to `data/items.json` is a hard error,
 *     because a farm plan that silently ignores a material is worse than no plan.
 *
 * Run alone with `node scripts/sync/derive/farm.mjs` (`--check` to only report).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { MAPS, OUT, ROOT } from "../config.mjs";
import { tryReadJson, writeJson } from "../util.mjs";
import { itemsData } from "./items.mjs";

const KORNBLUME_DATA = path.join(ROOT, "ignore", "kornblume-main", "public", "data");
const OUT_FILE = path.join(OUT, "stages", "farm.json");

/** Newest `stages<major>_<minor>_greedy.json` in the checkout, or null. */
function newestGreedy() {
  let entries;
  try {
    entries = fs.readdirSync(KORNBLUME_DATA);
  } catch {
    return null;
  }
  const found = entries
    .map((name) => {
      const m = /^stages(\d+)_(\d+)_greedy\.json$/.exec(name);
      return m ? { name, major: Number(m[1]), minor: Number(m[2]) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.major - b.major || a.minor - b.minor);
  const last = found[found.length - 1];
  return last ? { file: path.join(KORNBLUME_DATA, last.name), patch: `${last.major}.${last.minor}` } : null;
}

const round = (value) => Number(Number(value).toFixed(6));

/**
 * The farm table, or `null` when the Kornblume checkout is not on disk. Names are
 * mapped onto `data/items.json`; an unresolvable one throws.
 *
 * `items` is the already-derived item list so the pipeline does not have to
 * re-derive it; run standalone, it derives its own.
 */
export function farmStages(items = itemsData()) {
  const source = newestGreedy();
  if (!source) return null;

  const renames = tryReadJson(path.join(MAPS, "kornblume-names.json")) || {};
  const known = new Set(items.map((item) => item.name));
  const raw = JSON.parse(fs.readFileSync(source.file, "utf8"));
  const unknown = new Set();

  const resolve = (name) => {
    const target = renames[name] || name;
    if (known.has(target)) return target;
    unknown.add(name);
    return null;
  };

  const stages = [];
  for (const row of Object.values(raw)) {
    const drops = {};
    for (const [name, total] of Object.entries(row.drops || {})) {
      const material = resolve(name);
      if (!material) continue;
      const perRun = row.count ? total / row.count : total;
      if (perRun > 0) drops[material] = round(perRun);
    }
    if (!Object.keys(drops).length) continue;
    stages.push({
      name: row.name,
      category: row.category,
      cost: Number(row.cost) || 0,
      drops,
    });
  }

  if (unknown.size) {
    throw new Error(
      `farm: ${unknown.size} drop name(s) do not resolve to data/items.json: ${[...unknown].join(", ")}`,
    );
  }
  // Newest chapter first is not useful here: the app sorts by its own layers, so
  // the file keeps Kornblume's order (which is the game's) and nothing else.
  return {
    patch: source.patch,
    source: "https://github.com/windbow27/kornblume -> public/data/" + path.basename(source.file),
    stages,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const data = farmStages();
  if (!data) {
    console.log("farm: no local Kornblume checkout, data/stages/farm.json left as committed");
  } else if (process.argv.includes("--check")) {
    console.log(`farm: ${data.stages.length} stages, patch ${data.patch} (not written)`);
  } else {
    writeJson(OUT_FILE, data);
    console.log(`farm: wrote ${data.stages.length} stages (patch ${data.patch}) to data/stages/farm.json`);
  }
}
