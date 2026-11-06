/**
 * ONE-TIME migration of the legacy psychube assets/data to game ids (AGENTS.md §5).
 *
 * 1. Rewrites `data/psychubes_data.json` keys/ids from the invented sequential ids to
 *    `"<appRarity>:<gameId>"` (content untouched; Phase 2 re-derives the numbers).
 * 2. Renames the composed icons in `images/psychube_icon/<rarity>/<oldId>.png` to
 *    `images/psychube_icon/<rarity>/<gameId>.png`, so the app keeps finding them.
 * 3. For psychubes the old hand data never shipped, drops in the raw Myssal icon so
 *    there is no 404 (Phase 3 will compose them properly).
 *
 * Safe to run more than once: already-migrated keys are skipped.
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT, SRC } from "../config.mjs";
import { readJson, writeJson } from "../util.mjs";

const migration = readJson(path.join(import.meta.dirname, "..", "legacy", "psychube-migration.json"));
const dataFile = path.join(ROOT, "data", "psychubes_data.json");
const legacy = readJson(dataFile);

const isNewKey = (key) => migration[key] === undefined && /^\d+:\d+$/.test(key);

let migrated = 0;
const out = {};
for (const [oldKey, entry] of Object.entries(legacy)) {
  const newKey = migration[oldKey] || oldKey;
  const [rarity, gameId] = newKey.split(":");
  out[newKey] = {
    ...entry,
    id: String(gameId),
    rarity: Number(rarity),
    gameId: Number(gameId),
    icon: `images/psychube_icon/${rarity}/${gameId}.png`,
  };
  if (newKey !== oldKey) migrated++;
}

// Stable order: rarity desc, then game id desc (newest first).
const ordered = {};
for (const key of Object.keys(out).sort((a, b) => {
  const [ra, ia] = a.split(":").map(Number);
  const [rb, ib] = b.split(":").map(Number);
  if (ra !== rb) return rb - ra;
  return ib - ia;
})) {
  ordered[key] = out[key];
}

writeJson(dataFile, ordered);
console.log(`psychubes_data.json: ${Object.keys(legacy).length} -> ${Object.keys(ordered).length} entries (${migrated} re-keyed)`);

// ---- icons -------------------------------------------------------------------------
const iconRoot = path.join(ROOT, "images", "psychube_icon");
const rawIcon = (gameId) =>
  path.join(SRC.assets, "singlebg", "equipment", "icon", `${gameId}.png`);

let renamed = 0;
let copied = 0;
for (const oldKey of Object.keys(migration)) {
  const newKey = migration[oldKey];
  const [oldRar, oldId] = oldKey.split(":");
  const [rar, gameId] = newKey.split(":");
  const from = path.join(iconRoot, oldRar, `${oldId}.png`);
  const to = path.join(iconRoot, rar, `${gameId}.png`);
  if (!fs.existsSync(from)) continue;
  if (fs.existsSync(to)) {
    fs.rmSync(from);
    continue;
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.renameSync(from, to);
  renamed++;
}

// Psychubes with no legacy icon (newly-included rows): use the raw game art for now.
for (const [key, entry] of Object.entries(ordered)) {
  const [rar, gameId] = key.split(":");
  const to = path.join(iconRoot, rar, `${gameId}.png`);
  if (fs.existsSync(to)) continue;
  const from = rawIcon(gameId);
  if (!fs.existsSync(from)) {
    console.log(`  ! no icon for ${key} (${entry.name})`);
    continue;
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  copied++;
}
console.log(`icons: ${renamed} renamed, ${copied} seeded from raw game art`);
