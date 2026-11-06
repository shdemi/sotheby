/**
 * One-time extractor: moves the hand-written parts of the Kornblume
 * `data/items.json` into `content/translations/items.json`.
 *
 * The item table itself is now generated from St-Pavlov (`derive/items.mjs`).
 * What cannot be derived is:
 *   - the Vietnamese description / usage / source text
 *   - the English name of CN-only items (the CN repo stores literal Chinese
 *     and has no language files)
 *
 * This tool matches every legacy item to a game id (by Chinese name first,
 * because the global English names were changed by later patches, then by
 * English name) and writes the overlay the generator reads.
 *
 *   node scripts/sync/tools/extract-item-translations.mjs
 *
 * Idempotent. Run once, then keep `content/translations/items.json` by hand.
 */
import path from "node:path";
import { CONTENT, OUT } from "../config.mjs";
import { readJson, writeJson } from "../util.mjs";
import { text, table } from "../sources.mjs";

const legacy = readJson(path.join(OUT, "items.json"));

const globalItems = table("global", "item");
const globalCurrency = table("global", "currency");
const cnItems = table("cn", "item");
const globalIds = new Set(globalItems.map((row) => row.id));

const clean = (value) => String(value ?? "").trim();

/** zh/en lookup over the global tables (CN rows are matched by literal name). */
const byZh = new Map();
const byEn = new Map();
const index = (row, kind) => {
  const zh = clean(text("zh", row.name));
  const en = clean(text("en", row.name));
  if (zh && !byZh.has(zh)) byZh.set(zh, row.id);
  if (en && !byEn.has(en.toLowerCase())) byEn.set(en.toLowerCase(), row.id);
  row._kind = kind;
};
for (const row of globalItems) index(row, "item");
for (const row of globalCurrency) index(row, "currency");

const cnById = new Map(cnItems.map((row) => [row.id, row]));
const cnByZh = new Map();
for (const row of cnItems) {
  const zh = clean(row.name);
  if (zh && !cnByZh.has(zh)) cnByZh.set(zh, row.id);
}

const overlay = {};
const unmatched = [];
const renamed = [];
let cnOnly = 0;
for (const item of legacy) {
  const zh = clean(item.nameZh);
  const en = clean(item.name).toLowerCase();
  let id = zh ? byZh.get(zh) : undefined;
  if (!id) id = byEn.get(en);
  if (!id && zh) id = cnByZh.get(zh);
  if (!id) {
    unmatched.push(`${item.id}:${item.name}`);
    continue;
  }
  const match = globalItems.find((row) => row.id === id) || globalCurrency.find((row) => row.id === id);
  const gameName = match ? clean(text("en", match.name)) : "";
  if (gameName && gameName.toLowerCase() !== en) renamed.push(`${item.name} -> ${gameName}`);
  const entry = {};
  if (!globalIds.has(id) && cnById.has(id)) {
    // CN-only row: the game only carries literal Chinese, so keep the legacy
    // English name here.
    entry.name = item.name;
    cnOnly++;
  }
  for (const [from, to] of [
    ["descriptionVi", "descVi"],
    ["usageVi", "usageVi"],
    ["sourceVi", "sourceVi"],
    ["source", "source"],
    ["usage", "usage"],
  ]) {
    const value = clean(item[from]);
    if (value) entry[to] = value;
  }
  if (Object.keys(entry).length) overlay[id] = entry;
}

writeJson(path.join(CONTENT, "translations", "items.json"), overlay);

/* The progression costs file is hand-authored but its material names were typed
 * with the old translations. Point them at the current game names so the item
 * lookup finds an icon. */
const renamedByName = new Map(renamed.map((line) => line.split(" -> ")));
const progressionPath = path.join(CONTENT, "progression_costs.json");
const progression = readJson(progressionPath);
let renamedMaterials = 0;
for (const entry of Object.values(progression)) {
  for (const field of ["euphoria", "mastery", "frequency"]) {
    for (const tier of entry[field] || []) {
      for (const material of tier.materials || []) {
        const next = renamedByName.get(material.material);
        if (next) {
          material.material = next;
          renamedMaterials++;
        }
      }
    }
  }
}
if (renamedMaterials) writeJson(progressionPath, progression);

console.log(`wrote content/translations/items.json (${Object.keys(overlay).length} entries, ${cnOnly} CN-only names)`);
if (renamedMaterials) console.log(`renamed ${renamedMaterials} material references in content/progression_costs.json`);
if (renamed.length) console.log(`renamed by later patches:\n  ${renamed.join("\n  ")}`);
if (unmatched.length) console.log(`unmatched legacy items: ${unmatched.join(", ")}`);
