/**
 * `data/og_index.json` — the compact lookup the OG image renderer (`api/og.js`) needs.
 *
 * The renderer runs inside a serverless function, so it must not load the big books
 * (`character_skills.json` is 1.6 MB, `characters_mats_required.json` 1.2 MB). This file
 * carries only what a card prints, joined once here:
 *
 *   head      <- ArcanistMap.live2d[0].id (the default skin = the small head icon)
 *   rarity    <- characters_by_rarity.json (bucket key)
 *   afflatus  <- characters_by_afflatus.json (bucket key)
 *   dmgType   <- character_profiles.json (plus `roleTags`, the hero's role labels)
 *   shape     <- character_reso_shape.json (the resonance board shape)
 *   pattern / portrait / psychubes / resonance <- content/builds.json (class C)
 *   chart     <- content/progressions.json (the first Portrait Value chart)
 *   patternColor <- scripts/sync/maps/pattern-colors.json (app.js PATTERN_COLORS)
 *
 * The pattern icon lives at `images/shape_pattern/<shape>/<pattern>.png`; the folder is
 * only meaningful when both halves are known, so the path is emitted empty otherwise and
 * the renderer skips the image.
 *
 * Characters are keyed by canonical roster name, exactly like `character_profiles.json`,
 * and `content/builds.json` already uses those keys (its one non-canonical label,
 * `Thirty-seven`, is resolved by `global_name_transfer.json` in the app, not here).
 */
import path from "node:path";
import { CONTENT, MAPS } from "../config.mjs";
import { readJson, sortKeys } from "../util.mjs";

const PATTERN_DIR = "images/shape_pattern";

/** Inverts `{ bucket: [names] }` into `name -> bucket`. */
function bucketMap(buckets) {
  const out = new Map();
  for (const [bucket, names] of Object.entries(buckets || {})) {
    for (const name of names) out.set(name, bucket);
  }
  return out;
}

/**
 * First progression chart of a character, in the shape the share card prints.
 *
 * `content/progressions.json` has two shapes: a bare bar list (legacy, one untitled
 * chart) and a list of `{ label, bars }` charts. The InfoBook shows every chart; a card
 * has room for one, so the first one wins.
 */
function firstChart(raw) {
  if (!Array.isArray(raw) || !raw.length) return null;
  const isLegacy = raw.every((entry) => entry && typeof entry === "object" && !Array.isArray(entry.bars));
  const charts = isLegacy
    ? [{ label: "", bars: raw }]
    : raw
        .filter((chart) => chart && typeof chart === "object")
        .map((chart) => ({
          label: String(chart.label || "").trim(),
          bars: Array.isArray(chart.bars) ? chart.bars.filter(Boolean) : [],
        }))
        .filter((chart) => chart.bars.length);
  const chart = charts[0];
  if (!chart) return null;
  return {
    label: chart.label,
    bars: chart.bars.slice(0, 6).map((bar) => ({
      badge: String(bar.badge || ""),
      val: Math.max(0, Math.min(100, Number(bar.val) || 0)),
    })),
  };
}

/**
 * `content/builds.json` `resonance` is `{ "<preset label>": "<import code>" }`. The card
 * needs the label, the description needs the code, so both are kept. Rows without a usable
 * code are dropped: an empty pair would print as "R10-11: " in the share text.
 */
function resonancePresets(raw) {
  if (!raw || typeof raw !== "object") return [];
  return Object.entries(raw)
    .filter(([label, code]) => label && typeof code === "string" && code.trim())
    .map(([label, code]) => ({ label, code: code.trim() }));
}

export function ogIndex({ arcanists, profiles, rarity, afflatus, resoShape, psychubesData, transfer }) {
  const rarityOf = bucketMap(rarity);
  const afflatusOf = bucketMap(afflatus);
  const shapeOf = bucketMap(resoShape);

  // ArcanistMap carries the game's own English label, which differs from the canonical
  // roster key for nine heroes (`Six` vs `6`, `Thirty-seven` vs `37`, …). The profile row
  // carries the id, so it is the reliable way back to the canonical name.
  const canonicalById = new Map();
  for (const [name, profile] of Object.entries(profiles || {})) {
    if (profile && profile.id) canonicalById.set(Number(profile.id), name);
  }
  const canonical = (entry) => {
    const byId = canonicalById.get(Number(entry.id));
    if (byId) return byId;
    const name = entry.nameEng || entry.name;
    return (transfer && transfer[name]) || name;
  };

  // Psychubes are authored by display name in content/builds.json; both languages resolve.
  const chubeKeyByName = new Map();
  for (const [key, row] of Object.entries(psychubesData || {})) {
    if (row.name) chubeKeyByName.set(String(row.name).toLowerCase(), key);
    if (row.nameCN) chubeKeyByName.set(String(row.nameCN).toLowerCase(), key);
  }

  let builds = {};
  try {
    builds = readJson(path.join(CONTENT, "builds.json")) || {};
  } catch {
    builds = {};
  }

  let progressions = {};
  try {
    progressions = readJson(path.join(CONTENT, "progressions.json")) || {};
  } catch {
    progressions = {};
  }

  let patternColors = { families: {}, patterns: {} };
  try {
    patternColors = readJson(path.join(MAPS, "pattern-colors.json")) || patternColors;
  } catch {
    patternColors = { families: {}, patterns: {} };
  }
  const patternColor = (pattern) => {
    const family = patternColors.patterns?.[pattern] || "placidity";
    return patternColors.families?.[family] || "";
  };

  // `content/builds.json` is authored by display name; accept the game's English label
  // as an alias for the canonical key.
  const buildsByCanonical = {};
  for (const [key, value] of Object.entries(builds)) {
    buildsByCanonical[(transfer && transfer[key]) || key] = value;
  }

  const progressionsByCanonical = {};
  for (const [key, value] of Object.entries(progressions)) {
    progressionsByCanonical[(transfer && transfer[key]) || key] = value;
  }

  const characters = {};
  for (const entry of arcanists || []) {
    const name = canonical(entry);
    if (!name) continue;

    const profile = profiles[name] || {};
    const build = buildsByCanonical[name] || {};
    const defaultSkin = entry.live2d?.[0]?.id ?? `${entry.id}01`;
    const shape = shapeOf.get(name) || "";
    const pattern = build.pattern || "";
    const chubes = Array.isArray(build.psychubes)
      ? build.psychubes.map((n) => chubeKeyByName.get(String(n).toLowerCase())).filter(Boolean)
      : [];

    characters[name] = {
      id: entry.id,
      // `nameEng` is the game's own label; it stays here because old links were written
      // with it (`team=Six`). `display` is what the app prints: the roster name, with the
      // game's label transferred for nine heroes and the Cyrillic ones (`Авксивий`).
      name: entry.nameEng || name,
      display: (transfer && transfer[entry.nameEng]) || entry.nameEng || name,
      nameZh: entry.name || profile.nameZh || "",
      rarity: Number(rarityOf.get(name)) || 0,
      afflatus: afflatusOf.get(name) || "",
      dmgType: profile.dmgType || "",
      dmgTypeZh: profile.dmgTypeZh || "",
      roleTags: Array.isArray(profile.roleTags) ? profile.roleTags : [],
      roleTagsZh: Array.isArray(profile.roleTagsZh) ? profile.roleTagsZh : [],
      head: `images/headicon_small/${defaultSkin}.png`,
      shape,
      pattern,
      patternIcon: shape && pattern ? `${PATTERN_DIR}/${shape}/${pattern}.png` : "",
      patternColor: patternColor(pattern),
      portrait: build.portrait || "",
      // First progression chart: the portrait-value bars the InfoBook draws.
      chart: firstChart(progressionsByCanonical[name]),
      psychubes: chubes,
      // Resonance presets. `label` is the orange copy button's text (localised through
      // `reso.<label>` in content/i18n.json, like the InfoBook does); `code` is the import
      // string itself, which the share description prints instead of restating the card.
      resonance: resonancePresets(build.resonance),
    };
  }

  const psychubes = {};
  for (const [key, row] of Object.entries(psychubesData || {})) {
    psychubes[key] = {
      name: row.name || "",
      nameZh: row.nameCN || "",
      icon: row.icon || "",
      rarity: Number(row.rarity) || Number(String(key).split(":")[0]) || 0,
    };
  }

  return { characters: sortKeys(characters), psychubes: sortKeys(psychubes) };
}
