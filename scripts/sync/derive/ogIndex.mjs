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
 *   dmgType   <- character_profiles.json
 *   shape     <- character_reso_shape.json (the resonance board shape)
 *   pattern / portrait / psychubes <- content/builds.json (class C, hand-authored)
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
import { CONTENT } from "../config.mjs";
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

  // `content/builds.json` is authored by display name; accept the game's English label
  // as an alias for the canonical key.
  const buildsByCanonical = {};
  for (const [key, value] of Object.entries(builds)) {
    buildsByCanonical[(transfer && transfer[key]) || key] = value;
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
      name: entry.nameEng || name,
      nameZh: entry.name || profile.nameZh || "",
      rarity: Number(rarityOf.get(name)) || 0,
      afflatus: afflatusOf.get(name) || "",
      dmgType: profile.dmgType || "",
      dmgTypeZh: profile.dmgTypeZh || "",
      head: `images/headicon_small/${defaultSkin}.png`,
      shape,
      pattern,
      patternIcon: shape && pattern ? `${PATTERN_DIR}/${shape}/${pattern}.png` : "",
      portrait: build.portrait || "",
      psychubes: chubes,
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
