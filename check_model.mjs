import fs from "node:fs";
import path from "node:path";
import { Model, readNameTables, validate } from "./editor/model.js";

const DATA = "./data";
const read = (f) => fs.readFileSync(path.join(DATA, f), "utf8");
const texts = {};
for (const f of fs.readdirSync(DATA)) {
  if (f.endsWith(".json")) texts[f] = read(f);
}
const appJs = fs.readFileSync("./app.js", "utf8");
const nameTables = readNameTables(appJs);
const arcanistMap = JSON.parse(read("ArcanistMap.json"));

const model = new Model(texts, { arcanistMap, nameTables });
const tempData = JSON.parse(read("temp_data.json"));

const known = new Set(model.characters);
console.log("Total model characters:", known.size);

const unmapped = [];
const resolvedMap = new Map();
for (const item of tempData) {
  const canonical = model.resolve(item.name);
  resolvedMap.set(item.name, canonical);
  if (!known.has(canonical)) {
    unmapped.push({ raw: item.name, canonical });
  }
}
console.log("Unmapped characters from temp_data:", unmapped);
console.log("Duplicates after canonical resolution:");
const counts = {};
for (const item of tempData) {
  const canonical = model.resolve(item.name);
  counts[canonical] = (counts[canonical] || 0) + 1;
}
// Let's test merging all temp_data into guide_builds format
const guideBuildsOriginal = JSON.parse(texts["guide_builds.json"]);
const newBuilds = { ...guideBuildsOriginal };

// Psychube lookup
const psychubeId = JSON.parse(texts["psychube_id.json"]);
const canonicalChubes = new Map();
for (const [r, list] of Object.entries(psychubeId)) {
  for (const p of list) {
    if (p.name) {
      canonicalChubes.set(p.name.toLowerCase(), p.name);
      canonicalChubes.set(p.name.replace(/\u2019/g, "'").toLowerCase(), p.name);
    }
  }
}

function normalizeChube(name) {
  if (!name) return "";
  const key = name.replace(/\u2019/g, "'").toLowerCase();
  return canonicalChubes.get(key) || name;
}

// Group items by canonical character name
const grouped = new Map();
for (const item of tempData) {
  const canonical = model.resolve(item.name);
  if (!grouped.has(canonical)) grouped.set(canonical, []);
  grouped.get(canonical).push(item);
}

for (const [canonical, items] of grouped.entries()) {
  const existing = newBuilds[canonical] || {};
  
  // Combine psychubes
  const psychubes = [];
  for (const item of items) {
    for (const p of item.psychubes || []) {
      const norm = normalizeChube(p);
      if (norm && !psychubes.includes(norm)) {
        psychubes.push(norm);
      }
    }
  }

  // Combine resonance
  const resonance = { ...(existing.resonance || {}) };
  for (const item of items) {
    const res = item.resonance || {};
    for (const b of Object.values(res)) {
      if (b && typeof b === "object") {
        const bName = String(b.name || "").trim();
        const bCode = String(b.code || "").trim();
        if (bName && bCode) {
          resonance[bName] = bCode;
        }
      }
    }
  }

  // Pattern
  let pattern = existing.pattern || "";
  for (const item of items) {
    if (item.pattern && item.pattern !== "N/A" && item.pattern.trim()) {
      pattern = item.pattern.trim();
      break;
    }
  }

  // Portrait recommended & notes
  let portrait = existing.portrait || "";
  let notes = existing.notes || "";
  for (const item of items) {
    const p = item.portrait_recommended ? item.portrait_recommended.trim() : "";
    if (p) {
      if (p.includes("\n") || p.length > 20) {
        if (!notes) notes = p;
      } else if (!portrait) {
        portrait = p;
      }
    }
  }

  const entry = {};
  if (pattern) entry.pattern = pattern;
  if (psychubes.length) entry.psychubes = psychubes.slice(0, 2);
  if (Object.keys(resonance).length) entry.resonance = resonance;
  if (portrait) entry.portrait = portrait;
  if (notes) entry.notes = notes;


  newBuilds[canonical] = entry;
}

console.log("Total builds after merge:", Object.keys(newBuilds).length);
// Let's write the merged data directly to data/guide_builds.json
// Sort keys alphabetically for clean diff
const sortedBuilds = {};
const sortedKeys = Object.keys(newBuilds).sort((a, b) => a.localeCompare(b));
for (const k of sortedKeys) {
  sortedBuilds[k] = newBuilds[k];
}
fs.writeFileSync("./data/guide_builds.json", JSON.stringify(sortedBuilds, null, 2) + "\n", "utf8");
console.log("Successfully wrote data/guide_builds.json with", sortedKeys.length, "entries.");





