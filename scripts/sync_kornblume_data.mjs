/**
 * scripts/sync_kornblume_data.mjs
 * 
 * Synchronizes and extracts character materials and item metadata directly
 * from GitHub (windbow27/kornblume) or local fallback into Sotheby's Mansion clean schema:
 * - data/items.json
 * - data/characters_mats_required.json
 * - data/item_formulas.json
 * 
 * Usage:
 *   node scripts/sync_kornblume_data.mjs [--offline]
 */

import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const KORNBLUME_RAW_BASE = "https://raw.githubusercontent.com/windbow27/kornblume/main";

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to fetch ${url} (status: ${res.statusCode})`));
      }
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on("error", reject);
  });
}

function slugify(name) {
  return name.toLowerCase().replace(/['\.]/g, "").replace(/\s+/g, "-");
}

async function loadSourceData() {
  const isOffline = process.argv.includes("--offline");
  if (!isOffline) {
    try {
      console.log("==> Fetching latest data directly from GitHub (windbow27/kornblume)...");
      const [items, arcanists, formulas, zhItems] = await Promise.all([
        fetchJson(`${KORNBLUME_RAW_BASE}/public/data/items.json`),
        fetchJson(`${KORNBLUME_RAW_BASE}/public/data/arcanists.json`),
        fetchJson(`${KORNBLUME_RAW_BASE}/public/data/formulas.json`).catch(() => []),
        fetchJson(`${KORNBLUME_RAW_BASE}/lang/static/items/zh-CN.json`).catch(() => ({})),
      ]);
      console.log(`==> Downloaded ${items.length} items and ${arcanists.length} arcanists from GitHub.`);
      return { rawItems: items, rawArcanists: arcanists, rawFormulas: formulas, zhItemNames: zhItems };
    } catch (err) {
      console.warn("==> GitHub fetch failed or network unavailable, falling back to local files:", err.message);
    }
  }

  // Local fallback
  const localData = path.join(ROOT, "ignore", "kornblume-main", "public", "data");
  const localLang = path.join(ROOT, "ignore", "kornblume-main", "lang");
  if (!fs.existsSync(localData)) {
    throw new Error("Local kornblume data folder not found and GitHub fetch failed.");
  }
  console.log("==> Reading from local ignore/kornblume-main directory...");
  return {
    rawItems: JSON.parse(fs.readFileSync(path.join(localData, "items.json"), "utf8")),
    rawArcanists: JSON.parse(fs.readFileSync(path.join(localData, "arcanists.json"), "utf8")),
    rawFormulas: fs.existsSync(path.join(localData, "formulas.json"))
      ? JSON.parse(fs.readFileSync(path.join(localData, "formulas.json"), "utf8"))
      : [],
    zhItemNames: fs.existsSync(path.join(localLang, "static", "items", "zh-CN.json"))
      ? JSON.parse(fs.readFileSync(path.join(localLang, "static", "items", "zh-CN.json"), "utf8"))
      : {},
  };
}

async function run() {
  const { rawItems, rawArcanists, rawFormulas, zhItemNames } = await loadSourceData();

  // Read name mappings & aliases
  const arcanistMapPath = path.join(ROOT, "data", "ArcanistMap.json");
  const arcanistMap = fs.existsSync(arcanistMapPath) ? JSON.parse(fs.readFileSync(arcanistMapPath, "utf8")) : [];
  const canonicalMap = new Map();
  for (const a of arcanistMap) {
    if (a.nameEng) canonicalMap.set(a.nameEng.toLowerCase(), a.nameEng);
  }

  /* ----------------------------------------------------
   * 1. Process Items -> data/items.json
   * ---------------------------------------------------- */
  const cleanItems = rawItems.map((item) => {
    const slug = slugify(item.Name);
    return {
      id: item.Id,
      name: item.Name,
      nameZh: zhItemNames[slug] || "",
      rarity: item.Rarity || 1,
    category: item.Category || "Build Material",
    description: item.Description || "",
    source: item.Source || "",
    usage: item.Usage || "",
    isReleased: item.IsReleased !== false,
    icon: `images/items/icon/thumbnails/${item.Id}.webp`,
    border: `images/items/border/thumbnails/${item.Rarity || 1}.webp`,
  };
});

// Sort items: Category priority, then Rarity desc, then Id
const categoryOrder = {
  "Base Item": 0,
  "Resonate Material": 1,
  "Insight Material": 2,
  "Build Material": 3,
};
cleanItems.sort((a, b) => {
  const catA = categoryOrder[a.category] ?? 99;
  const catB = categoryOrder[b.category] ?? 99;
  if (catA !== catB) return catA - catB;
  if (b.rarity !== a.rarity) return b.rarity - a.rarity;
  return a.id - b.id;
});

fs.writeFileSync(
  path.join(ROOT, "data", "items.json"),
  JSON.stringify(cleanItems, null, 2) + "\n",
  "utf8"
);
console.log(`Generated data/items.json (${cleanItems.length} items)`);

/* ----------------------------------------------------
 * 2. Process Formulas -> data/item_formulas.json
 * ---------------------------------------------------- */
const cleanFormulas = {};
for (const f of rawFormulas) {
  if (f.Name && Array.isArray(f.Material)) {
    cleanFormulas[f.Name] = f.Material.map((mat, idx) => ({
      material: mat,
      quantity: f.Quantity?.[idx] || 1,
    }));
  }
}
fs.writeFileSync(
  path.join(ROOT, "data", "item_formulas.json"),
  JSON.stringify(cleanFormulas, null, 2) + "\n",
  "utf8"
);
console.log(`Generated data/item_formulas.json (${Object.keys(cleanFormulas).length} formulas)`);

/* ----------------------------------------------------
 * 3. Process Arcanist Materials -> data/characters_mats_required.json
 * ---------------------------------------------------- */
const cleanMatsRequired = {};

for (const arc of rawArcanists) {
  const canonicalName = canonicalMap.get(arc.Name.toLowerCase()) || arc.Name;

  // Process Insight
  const insights = (arc.Insight || []).map((ins) => {
    const materials = [];
    if (Array.isArray(ins.Material)) {
      ins.Material.forEach((mat, idx) => {
        materials.push({
          material: mat,
          quantity: ins.Quantity?.[idx] || 0,
        });
      });
    }
    return {
      insight: ins.Id,
      materials,
    };
  });

  // Process Resonance
  const resonances = (arc.Resonance || []).map((res) => {
    const materials = [];
    if (Array.isArray(res.Material)) {
      res.Material.forEach((mat, idx) => {
        materials.push({
          material: mat,
          quantity: res.Quantity?.[idx] || 0,
        });
      });
    }
    return {
      resonance: res.Id,
      materials,
    };
  });

  // Process Frequency (Modulations)
  const frequency = (arc.Frequency || []).map((freq) => {
    const materials = [];
    if (Array.isArray(freq.Material)) {
      freq.Material.forEach((mat, idx) => {
        materials.push({
          material: mat,
          quantity: freq.Quantity?.[idx] || 0,
        });
      });
    }
    return {
      id: freq.Id,
      type: freq.Type || "",
      materials,
    };
  });

  // Process Euphoria
  const euphoria = (arc.Euphoria || []).map((eup) => {
    const materials = [];
    if (Array.isArray(eup.Material)) {
      eup.Material.forEach((mat, idx) => {
        materials.push({
          material: mat,
          quantity: eup.Quantity?.[idx] || 0,
        });
      });
    }
    return {
      id: eup.Id,
      materials,
    };
  });

  // Process Mastery
  const mastery = (arc.Mastery || []).map((mas) => {
    const materials = [];
    if (Array.isArray(mas.Material)) {
      mas.Material.forEach((mat, idx) => {
        materials.push({
          material: mat,
          quantity: mas.Quantity?.[idx] || 0,
        });
      });
    }
    return {
      level: mas.Id,
      materials,
    };
  });

  cleanMatsRequired[canonicalName] = {
    id: arc.Id,
    name: canonicalName,
    rarity: arc.Rarity,
    afflatus: arc.Afflatus,
    stats: arc.Stats || {},
    insight: insights,
    resonance: resonances,
    frequency,
    euphoria,
    mastery,
  };
}

fs.writeFileSync(
  path.join(ROOT, "data", "characters_mats_required.json"),
  JSON.stringify(cleanMatsRequired, null, 2) + "\n",
  "utf8"
);
console.log(`Generated data/characters_mats_required.json (${Object.keys(cleanMatsRequired).length} characters)`);
}

run().catch((err) => {
  console.error("==> Sync failed:", err);
  process.exit(1);
});
