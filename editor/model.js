/**
 * Editor data model.
 *
 * `data/*.json` stays the source of truth — the editor edits those files
 * directly, so there is no master table and no build step.
 *
 * A "character" is not one file. It is assembled from eight of them, exactly
 * the way app.js assembles its lookup maps. This module mirrors that assembly so
 * the editor can present one row per character while writing back to the right
 * file for each field.
 *
 * Pure logic: no DOM, no file system. editor/app.js does the UI, editor/files.js
 * does the reading and writing.
 */
import { JsonDoc } from "./json-patch.js";

/** Every file the editor owns, in the order they are shown. */
export const FILES = [
  "characters_by_rarity.json",
  "characters_by_afflatus.json",
  "character_reso_shape.json",
  "shape_patterns.json",
  "reso_shape.json",
  "euphoria_list.json",
  "exclude_character.json",
  "collab_character.json",
  "future_sight.json",
  "global_name_transfer.json",
  "name_map.json",
  "psychube_id.json",
  "team_archetypes.json",
  "characters_progressions.json",
  "guide_builds.json",
  "guide_rotations.json",
  "guide_skills.json",
  "guide_cards.json",
];

/** Read-only inputs: maintained elsewhere, never written by the editor. */
export const READ_ONLY_FILES = ["ArcanistMap.json", "i18n.json"];

export const RARITIES = ["2", "3", "4", "5", "6"];
export const AFFLATUSES = ["Beast", "Plant", "Star", "Mineral", "Spirit", "Intellect", "Mineral_Star"];
export const SHAPES = ["Z shape", "Plus shape", "T shape", "U shape"];
export const PSYCHUBE_TAGS = ["ATK", "Critical", "Heal", "Survival", "Support"];
export const PSYCHUBE_RARITIES = ["6", "5"];

/** Team-archetype tags a rotation may carry (mirrors app.js). */
export const ROTATION_ARCHETYPES = [
  "Burn", "HP Sacrifice", "Poison", "Ritual", "Rank Up", "Extra Action", "Bloodtithe",
  "Dynamo", "Inspiration", "Lingering Glow", "Shift", "Conduit", "Pursuit",
];

/** Tags that have a dedicated icon: the two damage types plus the six afflatus. */
export const GUIDE_ICON_TAGS = [
  { label: "Reality DMG", icon: "images/dmg_type_icon/reality_dmg.png" },
  { label: "Mental DMG", icon: "images/dmg_type_icon/mental_dmg.png" },
  { label: "Beast", icon: "images/tag_afflatus/Beast_Icon.webp" },
  { label: "Plant", icon: "images/tag_afflatus/Plant_Icon.webp" },
  { label: "Star", icon: "images/tag_afflatus/star_icon.webp" },
  { label: "Mineral", icon: "images/tag_afflatus/mineral_Icon.webp" },
  { label: "Spirit", icon: "images/tag_afflatus/Spirit_Icon.webp" },
  { label: "Intellect", icon: "images/tag_afflatus/intellect_icon.webp" },
];

/** The four tunings a rotation can be built around. */
export const TUNINGS = ["First Melody", "Grand Orchestra", "Unfinished Tune", "Atonal Sequence"];

/* ------------------------------------------------------------------ *
 * Name resolution (mirrors app.js)
 * ------------------------------------------------------------------ */

/** Pull `const NAME = { ... };` out of app.js and evaluate it. */
function readAppConstant(source, name) {
  const start = source.indexOf(`const ${name} = {`);
  if (start === -1) return null;
  const open = source.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(
            source
              .slice(open, i + 1)
              .replace(/,\s*([}\]])/g, "$1")
              .replace(/([{,]\s*)(\d+)(\s*:)/g, '$1"$2"$3')
          );
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** Reads the alias tables out of app.js. They are not editable here. */
export function readNameTables(appJsSource) {
  return {
    aliases: readAppConstant(appJsSource, "NAME_ALIASES") || {},
    canonicalOverrides: readAppConstant(appJsSource, "CANONICAL_NAME_OVERRIDES") || {},
  };
}

/* ------------------------------------------------------------------ *
 * Line diff (for the review panel)
 * ------------------------------------------------------------------ */

/**
 * Line-level diff by longest common subsequence. Enough to show a reviewer
 * exactly which lines a pending change touches.
 */
export function lineDiff(before, after) {
  // Split on CRLF too, so a Windows file does not render a trailing "\r".
  const a = before.split(/\r?\n/);
  const b = after.split(/\r?\n/);

  // LCS table; files here are small enough that O(n*m) is fine.
  const n = a.length;
  const m = b.length;
  const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const out = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: "same", text: a[i], aLine: i + 1, bLine: j + 1 });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ type: "del", text: a[i], aLine: i + 1, bLine: null });
      i++;
    } else {
      out.push({ type: "add", text: b[j], aLine: null, bLine: j + 1 });
      j++;
    }
  }
  while (i < n) out.push({ type: "del", text: a[i], aLine: ++i, bLine: null });
  while (j < m) out.push({ type: "add", text: b[j], aLine: null, bLine: ++j });
  return out;
}

/** Diff collapsed to changed lines plus surrounding context. */
export function diffHunks(before, after, context = 3) {
  const rows = lineDiff(before, after);
  const keep = new Array(rows.length).fill(false);
  rows.forEach((r, idx) => {
    if (r.type === "same") return;
    for (let k = Math.max(0, idx - context); k <= Math.min(rows.length - 1, idx + context); k++) keep[k] = true;
  });

  const hunks = [];
  let current = null;
  rows.forEach((r, idx) => {
    if (keep[idx]) {
      if (!current) {
        current = [];
        hunks.push(current);
      }
      current.push(r);
    } else {
      current = null;
    }
  });
  return hunks;
}

/* ------------------------------------------------------------------ *
 * Model
 * ------------------------------------------------------------------ */

export class Model {
  /**
   * @param {Record<string,string>} texts raw contents of FILES
   * @param {object} [opts]
   * @param {object[]} [opts.arcanistMap] parsed ArcanistMap.json (read-only)
   * @param {object} [opts.nameTables] output of readNameTables()
   */
  constructor(texts, opts = {}) {
    this.docs = {};
    for (const name of FILES) {
      if (texts[name] === undefined) continue;
      this.docs[name] = new JsonDoc(texts[name]);
    }
    this.arcanistMap = opts.arcanistMap || [];
    this.aliases = (opts.nameTables && opts.nameTables.aliases) || {};
    this.canonicalOverrides = (opts.nameTables && opts.nameTables.canonicalOverrides) || {};

    this.arcanistById = new Map();
    this.arcanistByNameEng = new Map();
    this.arcanistByCanonical = new Map();
    this.arcanistIdByCanonical = new Map();
    for (const item of this.arcanistMap) {
      if (!item || !item.id || item.id === 9998) continue;
      this.arcanistById.set(String(item.id), item);
      if (item.nameEng) this.arcanistByNameEng.set(item.nameEng, item);

      // The canonical key may differ from nameEng: ArcanistMap stores "Six"
      // while the app keys the character as "6".
      const canonical =
        this.canonicalOverrides[String(item.id)] || this.resolve(item.nameEng) || item.nameEng;
      if (canonical && !this.arcanistByCanonical.has(canonical)) {
        this.arcanistByCanonical.set(canonical, item);
        this.arcanistIdByCanonical.set(canonical, Number(item.id));
      }
    }

    this.reload();
  }

  /* ---- accessors ---- */

  value(name) {
    const doc = this.docs[name];
    return doc ? doc.value : null;
  }

  doc(name) {
    return this.docs[name] || null;
  }

  /** Resolves a raw name to its canonical key, mirroring resolveCharacterName(). */
  resolve(raw) {
    if (raw === undefined || raw === null) return "";
    const key = String(raw).trim();
    if (key === "") return "";
    for (const [canonical, aliases] of Object.entries(this.aliases)) {
      if (canonical === key) return canonical;
      if (Array.isArray(aliases) && aliases.includes(key)) return canonical;
    }
    return key;
  }

  /** Rebuilds every derived lookup from the current document contents. */
  reload() {
    this.rarityOf = new Map();
    this.afflatusOf = new Map();
    this.shapeOf = new Map();
    this.euphoriaOf = new Map();
    this.cnNameOf = new Map();

    const rarity = this.value("characters_by_rarity.json") || {};
    for (const [star, list] of Object.entries(rarity)) {
      if (!Array.isArray(list)) continue;
      for (const raw of list) {
        const name = this.resolve(raw);
        if (name) this.rarityOf.set(name, star);
      }
    }

    const afflatus = this.value("characters_by_afflatus.json") || {};
    for (const [type, list] of Object.entries(afflatus)) {
      if (!Array.isArray(list)) continue;
      for (const raw of list) {
        const name = this.resolve(raw);
        if (name) this.afflatusOf.set(name, type);
      }
    }

    const shape = this.value("character_reso_shape.json") || {};
    for (const [shapeName, list] of Object.entries(shape)) {
      if (!Array.isArray(list)) continue;
      for (const raw of list) {
        const name = this.resolve(raw);
        if (name) this.shapeOf.set(name, shapeName);
      }
    }

    const euphoria = this.value("euphoria_list.json") || {};
    for (const [tier, list] of Object.entries(euphoria)) {
      if (!Array.isArray(list)) continue;
      for (const entry of list) {
        const [rawName, ...rest] = String(entry).split(":");
        const name = this.resolve(rawName.trim());
        if (!name) continue;
        if (!this.euphoriaOf.has(name)) this.euphoriaOf.set(name, {});
        this.euphoriaOf.get(name)[tier] = rest.join(":").trim();
      }
    }

    const nameMap = this.value("name_map.json") || {};
    for (const [raw, cn] of Object.entries(nameMap.character || {})) {
      const name = this.resolve(raw);
      if (name && !this.cnNameOf.has(name)) this.cnNameOf.set(name, cn);
    }

    this.excluded = new Set((this.value("exclude_character.json") || []).map((n) => this.resolve(n)));
    this.collab = new Set((this.value("collab_character.json") || []).map((n) => this.resolve(n)));

    const fs = this.value("future_sight.json") || {};
    this.futureSight = new Set((fs.Character || []).map((n) => this.resolve(n)));
    this.futureSkins = new Set((fs.Skin || []).map((n) => String(n)));
    this.futurePsychubes = new Set();
    for (const [rarity, ids] of Object.entries(fs.Psychube || {})) {
      for (const id of ids) this.futurePsychubes.add(`${rarity}:${String(id)}`);
    }
    this.futureEuphoria = new Set((fs.Euphoria || []).map((e) => String(e).trim()));
    this.transfer = this.value("global_name_transfer.json") || {};

    // Canonical character list: every name mentioned anywhere, resolved.
    const names = new Set();
    for (const n of this.rarityOf.keys()) names.add(n);
    for (const n of this.afflatusOf.keys()) names.add(n);
    for (const n of this.shapeOf.keys()) names.add(n);
    for (const n of this.euphoriaOf.keys()) names.add(n);
    for (const n of this.excluded) names.add(n);
    for (const n of this.collab) names.add(n);
    for (const n of this.futureSight) names.add(n);
    for (const n of Object.keys(this.transfer)) names.add(this.resolve(n));
    for (const n of Object.values(this.transfer)) names.add(this.resolve(n));
    for (const n of this.cnNameOf.keys()) names.add(n);
    for (const [id, canonical] of Object.entries(this.canonicalOverrides)) {
      if (this.arcanistById.has(String(id))) names.add(canonical);
    }
    for (const item of this.arcanistMap) {
      if (!item || !item.id || item.id === 9998) continue;
      const canonical = this.canonicalOverrides[String(item.id)] || item.nameEng;
      if (canonical) names.add(canonical);
    }
    names.delete("");
    // Newest first, the way the app's own board sorts: ArcanistMap id
    // descending. Characters with no ArcanistMap entry fall to the bottom.
    this.characters = [...names].sort((a, b) => {
      const ia = this.arcanistIdByCanonical.get(a);
      const ib = this.arcanistIdByCanonical.get(b);
      if (ia !== undefined && ib !== undefined) return ib - ia;
      if (ia !== undefined) return -1;
      if (ib !== undefined) return 1;
      return a < b ? -1 : a > b ? 1 : 0;
    });

    // psychubes — rarity 6 before 5, newest id first within each rarity.
    // psychube_id.json stores them the other way round ("5" then "6"), so the
    // rarity order is imposed here rather than taken from the file.
    this.psychubes = [];
    const psychubeId = this.value("psychube_id.json") || {};
    for (const rarity of PSYCHUBE_RARITIES) {
      const list = psychubeId[rarity];
      if (!Array.isArray(list)) continue;
      for (const item of list) {
        this.psychubes.push({
          rarity,
          id: String(item.id),
          key: `${rarity}:${String(item.id)}`,
          name: item.name || "",
          nameCN: item.nameCN || "",
          tags: Array.isArray(item.tags) ? item.tags : [],
          releasePatch: item.release_patch || "",
          futureSight: this.futurePsychubes.has(`${rarity}:${String(item.id)}`),
        });
      }
    }

    this.teamNames = Object.keys(this.value("team_archetypes.json") || {});
    this.shapeNames = Object.keys(this.value("shape_patterns.json") || {});
  }

  /* ---- character view ---- */

  character(name) {
    const item = this.arcanistByCanonical.get(name) || null;
    const arcanistEng = item ? item.nameEng : "";
    const tiered = this.euphoriaOf.get(name) || {};
    return {
      name,
      arcanistEng,
      arcanistId: item ? String(item.id) : "",
      cnName: this.cnNameOf.get(name) || "",
      rarity: this.rarityOf.get(name) || "",
      afflatus: this.afflatusOf.get(name) || "",
      shape: this.shapeOf.get(name) || "",
      euphoria1: tiered["1"] || "",
      euphoria2: tiered["2"] || "",
      euphoria1Future: this.futureEuphoria.has(`${name}: 1`),
      euphoria2Future: this.futureEuphoria.has(`${name}: 2`),
      excluded: this.excluded.has(name),
      collab: this.collab.has(name),
      futureSight: this.futureSight.has(name),
      transfer: arcanistEng !== "" && this.transfer[arcanistEng] === name,
      avatar: item ? `../images/headicon_small/${item.id}01.png` : "",
      skins: item ? (item.live2d || []).length : 0,
      eu1FutureSightFlag: this.futureEuphoria.has(`${name}: 1`),
      eu2FutureSightFlag: this.futureEuphoria.has(`${name}: 2`),
    };
  }

  /* ---- list helpers ---- */
  /** Patterns available to a character, taken from its resonance shape. */
  buildPatterns(name) {
    const shape = this.shapeOf.get(this.resolve(name)) || "";
    const table = this.value("shape_patterns.json") || {};
    const list = Array.isArray(table[shape]) ? table[shape] : [];
    return list.map((pattern) => ({ shape, pattern }));
  }

  /** The array at `path`, plus the index of `name` inside it (-1 when absent). */
  findInList(file, path, name) {
    const node = this.doc(file)?.nodeAt(path);
    if (!node || node.type !== "array") return { index: -1 };
    const index = node.items.findIndex((it) => it.type === "string" && it.value === name);
    return { index };
  }

  /** Adds or removes `name` from the list at `path`, so membership matches `want`. */
  setMembership(file, path, name, want) {
    const doc = this.doc(file);
    if (!doc) return false;
    const { index } = this.findInList(file, path, name);
    if (want && index === -1) {
      doc.append(path, name);
      return true;
    }
    if (!want && index !== -1) {
      doc.removeAt(path, index);
      return true;
    }
    return false;
  }

  /* ---- character mutators ---- */

  setRarity(name, rarity) {
    let changed = false;
    for (const star of RARITIES) {
      changed = this.setMembership("characters_by_rarity.json", [star], name, star === rarity) || changed;
    }
    if (changed) this.reload();
    return changed;
  }

  setAfflatus(name, afflatus) {
    let changed = false;
    for (const type of AFFLATUSES) {
      changed = this.setMembership("characters_by_afflatus.json", [type], name, type === afflatus) || changed;
    }
    if (changed) this.reload();
    return changed;
  }

  setShape(name, shape) {
    let changed = false;
    for (const shapeName of SHAPES) {
      changed = this.setMembership("character_reso_shape.json", [shapeName], name, shapeName === shape) || changed;
    }
    if (changed) this.reload();
    return changed;
  }

  /**
   * Sets a euphoria tier. `effect` is the effect name only; the file stores
   * "Name: Effect". Pass an empty effect to remove the entry.
   */
  setEuphoria(name, tier, effect, futureSight) {
    const doc = this.doc("euphoria_list.json");
    if (!doc) return false;
    const list = doc.value[tier];
    if (!Array.isArray(list)) return false;

    const prefix = `${name}:`;
    const index = list.findIndex((e) => String(e).split(":")[0].trim() === name);
    const want = String(effect || "").trim();
    let changed = false;

    if (want === "") {
      if (index !== -1) {
        doc.removeAt([tier], index);
        changed = true;
      }
    } else {
      const entry = `${name}: ${want}`;
      if (index === -1) {
        doc.append([tier], entry);
        changed = true;
      } else if (String(list[index]) !== entry) {
        doc.set([tier, index], entry);
        changed = true;
      }
    }

    // The Future Sight flag for a tier only exists alongside a real effect.
    const fsDoc = this.doc("future_sight.json");
    if (fsDoc) {
      const fsList = fsDoc.value.Euphoria || [];
      const fsIndex = fsList.findIndex((e) => {
        const parts = String(e).split(":");
        return parts[0].trim() === name && parts[1] !== undefined && parts[1].trim() === tier;
      });
      const wantFlag = want !== "" && !!futureSight;
      if (wantFlag && fsIndex === -1) {
        fsDoc.append(["Euphoria"], `${name}: ${tier}`);
        changed = true;
      } else if (!wantFlag && fsIndex !== -1) {
        fsDoc.removeAt(["Euphoria"], fsIndex);
        changed = true;
      }
    }

    if (changed) this.reload();
    return changed;
  }

  setExcluded(name, want) {
    const changed = this.setMembership("exclude_character.json", [], name, want);
    if (changed) this.reload();
    return changed;
  }

  setCollab(name, want) {
    const changed = this.setMembership("collab_character.json", [], name, want);
    if (changed) this.reload();
    return changed;
  }

  setFutureSight(name, want) {
    const changed = this.setMembership("future_sight.json", ["Character"], name, want);
    if (changed) this.reload();
    return changed;
  }

  /** Writes the CN display name, or removes the mapping when blank. */
  setCnName(name, cn) {
    const doc = this.doc("name_map.json");
    if (!doc) return false;
    const value = String(cn || "").trim();
    const node = doc.nodeAt(["character", name]);
    let changed = false;

    if (value === "") {
      if (node) changed = doc.deleteProperty(["character"], name);
    } else if (node) {
      changed = doc.set(["character", name], value);
    } else {
      changed = doc.setProperty(["character"], name, value);
    }

    if (changed) this.reload();
    return changed;
  }

  /**
   * Marks whether the raw ArcanistMap name should display as the canonical one.
   * This is the `transfer` flag, stored in global_name_transfer.json.
   */
  setTransfer(name, want) {
    const item = this.arcanistByCanonical.get(name);
    const raw = item ? item.nameEng : "";
    if (!raw || raw === name) return false;
    const doc = this.doc("global_name_transfer.json");
    if (!doc) return false;

    const node = doc.nodeAt([raw]);
    let changed = false;
    if (want && !node) {
      doc.setProperty([], raw, name);
      changed = true;
    } else if (!want && node) {
      changed = doc.deleteProperty([], raw);
    }
    if (changed) this.reload();
    return changed;
  }

  /** Adds a transfer entry, or updates the target of an existing one. */
  addTransfer(raw, canonical) {
    const doc = this.doc("global_name_transfer.json");
    if (!doc) return false;
    const from = String(raw || "").trim();
    const to = String(canonical || "").trim();
    if (from === "" || to === "") throw new Error("Both names are required.");
    if (from === to) throw new Error("A name cannot transfer to itself.");

    let changed;
    if (doc.nodeAt([from])) changed = doc.set([from], to);
    else changed = doc.setProperty([], from, to);

    if (changed) this.reload();
    return changed;
  }

  /** Removes a transfer entry. */
  removeTransfer(raw) {
    const doc = this.doc("global_name_transfer.json");
    if (!doc) return false;
    const changed = doc.deleteProperty([], String(raw));
    if (changed) this.reload();
    return changed;
  }

  /* ---- psychube mutators ---- */
  setPsychubeField(rarity, id, field, value) {
    const doc = this.doc("psychube_id.json");
    if (!doc) return false;
    const list = doc.value[rarity];
    if (!Array.isArray(list)) return false;
    const index = list.findIndex((it) => String(it.id) === String(id));
    if (index === -1) return false;

    let changed = false;
    if (field === "tags") {
      const want = Array.isArray(value) ? value : [];
      const have = list[index].tags || [];
      if (have.join("|") !== want.join("|")) {
        doc.set([rarity, index, "tags"], want);
        changed = true;
      }
    } else if (field === "releasePatch") {
      const node = doc.nodeAt([rarity, index, "release_patch"]);
      const want = String(value || "");
      if (node) {
        changed = doc.set([rarity, index, "release_patch"], want);
      } else if (want !== "") {
        changed = doc.setProperty([rarity, index], "release_patch", want);
      }
    } else {
      changed = doc.set([rarity, index, field], value);
    }

    if (changed) this.reload();
    return changed;
  }

  setPsychubeFutureSight(rarity, id, want) {
    const doc = this.doc("future_sight.json");
    if (!doc) return false;
    const list = doc.value.Psychube?.[rarity];
    if (!Array.isArray(list)) return false;
    const index = list.findIndex((v) => String(v) === String(id));
    let changed = false;
    if (want && index === -1) {
      doc.append(["Psychube", rarity], String(id));
      changed = true;
    } else if (!want && index !== -1) {
      doc.removeAt(["Psychube", rarity], index);
      changed = true;
    }
    if (changed) this.reload();
    return changed;
  }

  /** The id a new psychube of this rarity would get: one above the current max. */
  nextPsychubeId(rarity) {
    const list = this.value("psychube_id.json")?.[rarity] || [];
    let max = 1;
    for (const item of list) {
      const n = Number(item.id);
      if (Number.isFinite(n) && n > max) max = n;
    }
    return String(max + 1);
  }

  /**
   * Adds a psychube. The list is kept sorted by id descending, which is how the
   * file is written and how the app lists them.
   */
  addPsychube(rarity, id, fields = {}) {
    const doc = this.doc("psychube_id.json");
    if (!doc) return false;
    const list = doc.value[rarity];
    if (!Array.isArray(list)) throw new Error(`Unknown rarity "${rarity}"`);

    const wanted = String(id).trim();
    if (!/^\d+$/.test(wanted)) throw new Error(`"${wanted}" is not a numeric id.`);
    if (wanted === "1") throw new Error("Id 1 is reserved for the special chube.");
    if (list.some((item) => String(item.id) === wanted)) {
      throw new Error(`Psychube ${rarity}:${wanted} already exists.`);
    }
    const name = String(fields.name || "").trim();
    if (name === "") throw new Error("A psychube needs a name.");

    const entry = {
      id: wanted,
      name,
      nameCN: String(fields.nameCN || ""),
      tags: Array.isArray(fields.tags) ? fields.tags : [],
      release_patch: String(fields.releasePatch || ""),
    };

    // Insert so the ids stay descending.
    let at = list.findIndex((item) => Number(item.id) < Number(wanted));
    if (at === -1) at = list.length;
    doc.insertAt([rarity], at, entry);

    if (fields.futureSight) {
      const fsDoc = this.doc("future_sight.json");
      const ids = fsDoc?.value.Psychube?.[rarity];
      if (Array.isArray(ids) && !ids.some((v) => String(v) === wanted)) {
        fsDoc.append(["Psychube", rarity], wanted);
      }
    }

    this.reload();
    return true;
  }

  /** Removes a psychube and its Future Sight flag. */
  removePsychube(rarity, id) {
    const doc = this.doc("psychube_id.json");
    if (!doc) return false;
    const list = doc.value[rarity];
    if (!Array.isArray(list)) return false;
    const index = list.findIndex((item) => String(item.id) === String(id));
    if (index === -1) return false;

    doc.removeAt([rarity], index);

    const fsDoc = this.doc("future_sight.json");
    const ids = fsDoc?.value.Psychube?.[rarity];
    if (Array.isArray(ids)) {
      const fsIndex = ids.findIndex((v) => String(v) === String(id));
      if (fsIndex !== -1) fsDoc.removeAt(["Psychube", rarity], fsIndex);
    }

    this.reload();
    return true;
  }

  /* ---- small tables ---- */

  /** Adds or removes a skin id in future_sight.json -> Skin. */
  setFutureSkin(skinId, want) {
    const changed = this.setMembership("future_sight.json", ["Skin"], String(skinId), want);
    if (changed) this.reload();
    return changed;
  }

  /* ---- team presets ---- */

  team(archetype) {
    const all = this.value("team_archetypes.json") || {};
    return all[archetype] || [];
  }

  /** Creates an empty-ish preset: one variant with one essential member. */
  addTeam(name) {
    const label = String(name || "").trim();
    if (label === "") throw new Error("A preset needs a name.");
    const doc = this.doc("team_archetypes.json");
    if (!doc) return false;
    if (doc.value[label] !== undefined) throw new Error(`Preset "${label}" already exists.`);

    const first = this.characters[0] || "";
    doc.setProperty([], label, [[{ character: first, is_essential: true }]]);
    this.reload();
    return true;
  }

  /** Moves a preset up or down the display order. */
  moveTeam(name, toIndex) {
    const doc = this.doc("team_archetypes.json");
    if (!doc) return false;
    const changed = doc.reorderProperty([], name, toIndex);
    if (changed) this.reload();
    return changed;
  }

  /** Moves a member up or down inside one variant. All indices are 0-based. */
  moveTeamSlot(archetype, variant, from, to) {
    const doc = this.doc("team_archetypes.json");
    if (!doc) return false;
    const changed = doc.reorderAt([archetype, variant], from, to);
    if (changed) this.reload();
    return changed;
  }

  /**
   * Sets a member's euphoria chip. `tier` is "", "1" or "2"; the file stores
   * "E1"/"E2" (or nothing at all).
   */
  setTeamMemberEuphoria(archetype, variant, slot, tier) {
    const value = tier === "" || tier === null || tier === undefined ? "" : `E${tier}`;
    return this.setTeamSlot(archetype, variant, slot, "euphoria", value);
  }

  /** Sets one slot field. `variant` and `slot` are 0-based indices. */
  setTeamSlot(archetype, variant, slot, field, value) {
    const doc = this.doc("team_archetypes.json");
    if (!doc) return false;
    const path = [archetype, variant, slot];
    if (!doc.nodeAt(path)) return false;

    let changed;
    if (field === "isEssential") {
      if (value) changed = doc.setProperty(path, "is_essential", true);
      else changed = doc.deleteProperty(path, "is_essential");
    } else if (value === "" || value === null || value === undefined) {
      changed = doc.deleteProperty(path, field === "character" ? "character" : field);
    } else {
      const key = field;
      if (doc.nodeAt([...path, key])) changed = doc.set([...path, key], value);
      else changed = doc.setProperty(path, key, value);
    }

    if (changed) this.reload();
    return changed;
  }

  /** Appends a substitute to a slot, creating the array when it is missing. */
  addSubstitute(archetype, variant, slot, character) {
    const doc = this.doc("team_archetypes.json");
    if (!doc) return false;
    const path = [archetype, variant, slot];
    if (!doc.nodeAt(path)) return false;

    const list = doc.value[archetype]?.[variant]?.[slot]?.substitutes;
    const entry = { character: String(character || this.characters[0] || "") };

    let changed;
    if (Array.isArray(list)) changed = doc.append([...path, "substitutes"], entry);
    else changed = doc.setProperty(path, "substitutes", [entry]);

    if (changed) this.reload();
    return changed;
  }

  /**
   * Sets one field on a substitute.
   *
   * Substitutes may be written as a bare string (`"J"`); setting any other field
   * on one rewrites it as an object, because the shorthand has nowhere to put it.
   */
  setSubstituteField(archetype, variant, slot, subIndex, field, value) {
    const doc = this.doc("team_archetypes.json");
    if (!doc) return false;
    const listPath = [archetype, variant, slot, "substitutes"];
    const node = doc.nodeAt([...listPath, subIndex]);
    if (!node) return false;

    const want = value === null || value === undefined ? "" : String(value);
    let changed;

    if (node.type === "string") {
      if (field === "character") {
        changed = want === "" ? false : doc.set([...listPath, subIndex], want);
      } else if (want === "") {
        changed = false;
      } else {
        // Promote the shorthand to an object so it can carry the extra field.
        const existing = node.value;
        changed = doc.set([...listPath, subIndex], { character: existing, [field]: want });
      }
    } else if (field === "character") {
      changed = want === "" ? false : doc.set([...listPath, subIndex, "character"], want);
    } else if (want === "") {
      changed = doc.deleteProperty([...listPath, subIndex], field);
    } else if (doc.nodeAt([...listPath, subIndex, field])) {
      changed = doc.set([...listPath, subIndex, field], want);
    } else {
      changed = doc.setProperty([...listPath, subIndex], field, want);
    }

    if (changed) this.reload();
    return changed;
  }

  /** Moves a substitute up or down inside its slot. All indices are 0-based. */
  moveSubstitute(archetype, variant, slot, from, to) {
    const doc = this.doc("team_archetypes.json");
    if (!doc) return false;
    const changed = doc.reorderAt([archetype, variant, slot, "substitutes"], from, to);
    if (changed) this.reload();
    return changed;
  }

  /** Removes a substitute, dropping the array when it becomes empty. */
  removeSubstitute(archetype, variant, slot, subIndex) {
    const doc = this.doc("team_archetypes.json");
    if (!doc) return false;
    const memberPath = [archetype, variant, slot];
    const listPath = [...memberPath, "substitutes"];
    const list = doc.value[archetype]?.[variant]?.[slot]?.substitutes;
    if (!Array.isArray(list) || subIndex < 0 || subIndex >= list.length) return false;

    let changed;
    if (list.length === 1) changed = doc.deleteProperty(memberPath, "substitutes");
    else {
      doc.removeAt(listPath, subIndex);
      changed = true;
    }

    if (changed) this.reload();
    return changed;
  }

  /* ---- guide: character builds ---- */

  /** `{ name: { tags, psychubes, resonance, pattern, portrait, notes } }`. */
  guideBuilds() {
    const value = this.value("guide_builds.json") || {};
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  guideBuild(name) {
    const canonical = this.resolve(name);
    return this.guideBuilds()[canonical] || null;
  }

  /** Creates the entry for a character with an empty shape. */
  ensureGuideBuild(name) {
    const doc = this.doc("guide_builds.json");
    if (!doc) return false;
    const canonical = this.resolve(name);
    if (!canonical) return false;
    if (doc.nodeAt([canonical])) return false;
    doc.setProperty([], canonical, { tags: [], psychubes: [], resonance: {}, pattern: "", portrait: "", notes: "" });
    this.reload();
    return true;
  }

  removeGuideBuild(name) {
    const doc = this.doc("guide_builds.json");
    if (!doc) return false;
    const changed = doc.deleteProperty([], this.resolve(name));
    if (changed) this.reload();
    return changed;
  }

  /**
   * Sets one build field. `tags` takes a list of plain labels, `psychubes` a list
   * of names, `resonance` a `{label: code}` map; the rest are plain strings.
   * A blank value removes the property.
   */
  setGuideBuildField(name, field, value) {
    const doc = this.doc("guide_builds.json");
    if (!doc) return false;
    const canonical = this.resolve(name);
    if (!canonical) return false;
    // Every edit may create the entry: a character starts filling in immediately.
    if (!doc.nodeAt([canonical])) doc.setProperty([], canonical, {});

    let payload = value;
    if (field === "psychubes") {
      payload = (Array.isArray(value) ? value : String(value || "").split("|"))
        .map((v) => String(v).trim())
        .filter(Boolean);
    } else if (field === "resonance") {
      const map = {};
      for (const [label, code] of Object.entries(value || {})) {
        const cleanLabel = String(label).trim();
        // An empty code is kept: the editor writes the row first, then fills it.
        if (cleanLabel) map[cleanLabel] = String(code ?? "").trim();
      }
      payload = map;
    } else {
      payload = String(value ?? "").trim();
    }

    const empty =
      payload === "" || (Array.isArray(payload) && payload.length === 0) ||
      (payload && typeof payload === "object" && !Array.isArray(payload) && Object.keys(payload).length === 0);

    let changed;
    if (empty) changed = doc.deleteProperty([canonical], field);
    else if (doc.nodeAt([canonical, field])) changed = doc.set([canonical, field], payload);
    else changed = doc.setProperty([canonical], field, payload);

    // An entry with no fields left is noise; drop it so the list stays honest.
    if (changed) {
      const current = doc.nodeAt([canonical]);
      if (current && current.type === "object" && current.entries.length === 0) {
        doc.deleteProperty([], canonical);
      }
    }

    if (changed) this.reload();
    return changed;
  }

  /* ---- guide: rotations ---- */

  guideRotations() {
    const value = this.value("guide_rotations.json") || {};
    return Array.isArray(value.rotations) ? value.rotations : [];
  }

  guideRotation(id) {
    return this.guideRotations().find((r) => r && r.id === id) || null;
  }

  guideRotationIndex(id) {
    return this.guideRotations().findIndex((r) => r && r.id === id);
  }

  /** A URL-safe id that does not collide with an existing rotation. */
  guideRotationId(name) {
    const base =
      String(name || "rotation")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "rotation";
    const taken = new Set(this.guideRotations().map((r) => r && r.id));
    let id = base;
    let n = 2;
    while (taken.has(id)) id = `${base}-${n++}`;
    return id;
  }

  addGuideRotation(name) {
    const doc = this.doc("guide_rotations.json");
    if (!doc) return null;
    const label = String(name || "New rotation").trim() || "New rotation";
    if (!doc.nodeAt(["rotations"])) doc.setProperty([], "rotations", []);
    const id = this.guideRotationId(label);
    const first = this.characters[0] || "";
    // Eight empty rounds is the usual cycle length; each starts with four slots.
    const rounds = Array.from({ length: 8 }, () => ({
      note: "",
      slots: Array.from({ length: 4 }, () => ({ cards: [] })),
    }));
    doc.append(["rotations"], {
      id,
      name: label,
      archetypes: [],
      tuning: "",
      members: [{ character: first, psychube: "" }],
      notes: "",
      rounds,
    });
    this.reload();
    return id;
  }

  removeGuideRotation(id) {
    const doc = this.doc("guide_rotations.json");
    if (!doc) return false;
    const index = this.guideRotationIndex(id);
    if (index === -1) return false;
    doc.removeAt(["rotations"], index);
    this.reload();
    return true;
  }

  /** Sets `name`, `notes`, `tuning` or `archetypes` on a rotation. */
  setGuideRotationField(id, field, value) {
    const doc = this.doc("guide_rotations.json");
    if (!doc) return false;
    const index = this.guideRotationIndex(id);
    if (index === -1) return false;
    const path = ["rotations", index, field];

    let payload = value;
    if (field === "archetypes") payload = (Array.isArray(value) ? value : []).filter(Boolean);
    else payload = String(value ?? "");

    // An empty list or string has no meaning, so drop the key instead of writing it.
    const empty = payload === "" || (Array.isArray(payload) && payload.length === 0);
    const changed = empty && field !== "tuning" && field !== "notes" && field !== "name"
      ? doc.deleteProperty(["rotations", index], field)
      : doc.nodeAt(path)
        ? doc.set(path, payload)
        : doc.setProperty(["rotations", index], field, payload);
    if (changed) this.reload();
    return changed;
  }

  /** Sets one member slot's character or psychube. */
  setGuideRotationMember(id, slotIndex, field, value) {
    const doc = this.doc("guide_rotations.json");
    if (!doc) return false;
    const index = this.guideRotationIndex(id);
    if (index === -1) return false;
    const rotation = this.guideRotations()[index];
    const members = (Array.isArray(rotation.members) ? rotation.members : []).map((entry) =>
      typeof entry === "string" ? { character: this.resolve(entry) || entry, psychube: "" } : { ...entry }
    );
    const slot = Math.max(0, Number(slotIndex) || 0);
    while (members.length <= slot) members.push({ character: "", psychube: "" });

    if (field === "character") {
      members[slot].character = this.resolve(value) || String(value || "");
    } else {
      members[slot].psychube = String(value || "");
    }
    if (!members[slot].psychube) delete members[slot].psychube;
    if (!members[slot].character && !members[slot].psychube) members.splice(slot, 1);
    else if (!members[slot].character) members.splice(slot, 1);

    const changed = this.writeValue(["rotations", index], "members", members);
    if (changed) this.reload();
    return changed;
  }

  /* ---- guide: rounds ---- */

  guideRound(id, roundIndex) {
    const rotation = this.guideRotation(id);
    if (!rotation || !Array.isArray(rotation.rounds)) return null;
    return rotation.rounds[roundIndex] || null;
  }

  addGuideRound(id) {
    return this.appendToRotation(id, "rounds", { note: "", slots: [] });
  }

  removeGuideRound(id, roundIndex) {
    return this.removeFromRotation(id, "rounds", roundIndex);
  }

  setGuideRoundNote(id, roundIndex, note) {
    return this.setRoundField(id, roundIndex, "note", String(note || ""));
  }

  addGuideSlot(id, roundIndex, type = "normal") {
    const kind = ["normal", "or", "lb", "text"].includes(type) ? type : "normal";
    return this.appendRoundSlot(id, roundIndex, kind === "text" ? { type: kind, text: "" } : { type: kind, cards: [] });
  }

  /** Sets a slot's type; switching to text drops the cards and vice versa. */
  setGuideSlotType(id, roundIndex, slotIndex, type) {
    const doc = this.doc("guide_rotations.json");
    if (!doc) return false;
    const index = this.guideRotationIndex(id);
    if (index === -1) return false;
    const path = ["rotations", index, "rounds", roundIndex, "slots", slotIndex];
    if (!doc.nodeAt(path)) return false;
    const kind = ["normal", "or", "lb", "text"].includes(type) ? type : "normal";
    let changed = doc.nodeAt([...path, "type"]) ? doc.set([...path, "type"], kind) : doc.setProperty(path, "type", kind);
    if (kind === "text") {
      if (doc.nodeAt([...path, "cards"])) changed = doc.deleteProperty(path, "cards") || changed;
      if (!doc.nodeAt([...path, "text"])) changed = doc.setProperty(path, "text", "") || changed;
    } else {
      if (doc.nodeAt([...path, "text"])) changed = doc.deleteProperty(path, "text") || changed;
      if (!doc.nodeAt([...path, "cards"])) changed = doc.setProperty(path, "cards", []) || changed;
    }
    if (changed) this.reload();
    return changed;
  }

  /** Sets the free text of a text slot. */
  setGuideSlotText(id, roundIndex, slotIndex, text) {
    const doc = this.doc("guide_rotations.json");
    if (!doc) return false;
    const index = this.guideRotationIndex(id);
    if (index === -1) return false;
    const path = ["rotations", index, "rounds", roundIndex, "slots", slotIndex];
    if (!doc.nodeAt(path)) return false;
    const value = String(text || "");
    const changed = doc.nodeAt([...path, "text"])
      ? doc.set([...path, "text"], value)
      : doc.setProperty(path, "text", value);
    if (changed) this.reload();
    return changed;
  }

  removeGuideSlot(id, roundIndex, slotIndex) {
    const doc = this.doc("guide_rotations.json");
    if (!doc) return false;
    const index = this.guideRotationIndex(id);
    if (index === -1) return false;
    const path = ["rotations", index, "rounds", roundIndex, "slots"];
    if (!doc.nodeAt([...path, slotIndex])) return false;
    doc.removeAt(path, slotIndex);
    this.reload();
    return true;
  }

  setGuideSlotNote(id, roundIndex, slotIndex, note) {
    const doc = this.doc("guide_rotations.json");
    if (!doc) return false;
    const index = this.guideRotationIndex(id);
    if (index === -1) return false;
    const path = ["rotations", index, "rounds", roundIndex, "slots", slotIndex];
    if (!doc.nodeAt(path)) return false;
    const text = String(note || "");
    const changed = text
      ? doc.nodeAt([...path, "note"]) ? doc.set([...path, "note"], text) : doc.setProperty(path, "note", text)
      : doc.deleteProperty(path, "note");
    if (changed) this.reload();
    return changed;
  }

  /** Adds a card to a slot. A second card makes the slot an either/or choice. */
  addGuideSlotCard(id, roundIndex, slotIndex, card) {
    const doc = this.doc("guide_rotations.json");
    if (!doc) return false;
    const index = this.guideRotationIndex(id);
    if (index === -1) return false;
    const slot = this.guideRotations()[index].rounds?.[roundIndex]?.slots?.[slotIndex];
    if (!slot) return false;

    const entry = this.normalizeCard(card);
    if (!entry) return false;
    const cards = Array.isArray(slot.cards) ? slot.cards.slice() : [];
    const limit = slot.type === "or" ? 2 : 1;
    // A normal or LB slot holds one card: a drop replaces it.
    if (limit === 1) cards.length = 0;
    else if (cards.length >= limit) return false;
    cards.push(entry);

    const path = ["rotations", index, "rounds", roundIndex, "slots", slotIndex, "cards"];
    const changed = doc.nodeAt(path) ? doc.set(path, cards) : doc.setProperty([...path.slice(0, -1)], "cards", cards);
    if (changed) this.reload();
    return changed;
  }

  removeGuideSlotCard(id, roundIndex, slotIndex, cardIndex) {
    const doc = this.doc("guide_rotations.json");
    if (!doc) return false;
    const index = this.guideRotationIndex(id);
    if (index === -1) return false;
    const path = ["rotations", index, "rounds", roundIndex, "slots", slotIndex, "cards"];
    if (!doc.nodeAt([...path, cardIndex])) return false;
    doc.removeAt(path, cardIndex);
    this.reload();
    return true;
  }

  normalizeCard(card) {
    if (!card) return null;
    if (card.special) return { special: String(card.special) };
    if (!card.character) return null;
    const entry = { character: this.resolve(card.character) || String(card.character), skill: Number(card.skill) || 1 };
    // The exact icon variant (e.g. an alternative card) is pinned when known.
    if (card.icon) entry.icon = String(card.icon);
    return entry;
  }

  setRoundField(id, roundIndex, field, value) {
    const doc = this.doc("guide_rotations.json");
    if (!doc) return false;
    const index = this.guideRotationIndex(id);
    if (index === -1) return false;
    const path = ["rotations", index, "rounds", roundIndex];
    if (!doc.nodeAt(path)) return false;
    const changed = value
      ? doc.nodeAt([...path, field]) ? doc.set([...path, field], value) : doc.setProperty(path, field, value)
      : doc.deleteProperty(path, field);
    if (changed) this.reload();
    return changed;
  }

  appendRoundSlot(id, roundIndex, slot) {
    const doc = this.doc("guide_rotations.json");
    if (!doc) return false;
    const index = this.guideRotationIndex(id);
    if (index === -1) return false;
    const path = ["rotations", index, "rounds", roundIndex, "slots"];
    const changed = doc.nodeAt(path) ? doc.append(path, slot) : doc.setProperty(["rotations", index, "rounds", roundIndex], "slots", [slot]);
    if (changed) this.reload();
    return changed;
  }

  appendToRotation(id, field, entry) {
    const doc = this.doc("guide_rotations.json");
    if (!doc) return false;
    const index = this.guideRotationIndex(id);
    if (index === -1) return false;
    const path = ["rotations", index, field];
    const changed = doc.nodeAt(path) ? doc.append(path, entry) : doc.setProperty(["rotations", index], field, [entry]);
    if (changed) this.reload();
    return changed;
  }

  removeFromRotation(id, field, at) {
    const doc = this.doc("guide_rotations.json");
    if (!doc) return false;
    const index = this.guideRotationIndex(id);
    if (index === -1) return false;
    const path = ["rotations", index, field];
    if (!doc.nodeAt([...path, at])) return false;
    doc.removeAt(path, at);
    this.reload();
    return true;
  }

  /** Writes an object property, replacing or creating it as needed. */
  writeValue(parentPath, key, value) {
    const doc = this.doc("guide_rotations.json");
    if (!doc) return false;
    const path = [...parentPath, key];
    const changed = doc.nodeAt(path)
      ? doc.set(path, value)
      : doc.setProperty(parentPath, key, value);
    return changed;
  }

  /* ---- guide: portrait progressions ---- */

   /**
   * Charts for one character, always `[{ label, bars: [{badge, val}] }]`.
   * The original flat `[{badge, val}]` shape is read as one untitled chart.
   */
  progressionCharts(name) {
    const value = this.value("characters_progressions.json") || {};
    const raw = value[this.resolve(name)];
    if (!Array.isArray(raw)) return [];
    if (raw.every((entry) => entry && typeof entry === "object" && !Array.isArray(entry.bars))) {
      return raw.length ? [{ label: "", bars: raw }] : [];
    }
    return raw
      .filter((chart) => chart && typeof chart === "object")
      .map((chart) => ({
        label: String(chart.label || ""),
        bars: Array.isArray(chart.bars) ? chart.bars : [],
      }));
  }

  progression(name) {
    return this.progressionCharts(name)[0]?.bars || [];
  }

  /** Writes every chart back, dropping the key when the list is empty. */
  setProgressionCharts(name, charts) {
    const doc = this.doc("characters_progressions.json");
    if (!doc) return false;
    const canonical = this.resolve(name);
    if (!canonical) return false;

    const clean = (Array.isArray(charts) ? charts : [])
      .map((chart) => ({
        label: String(chart && chart.label ? chart.label : "").trim(),
        bars: (Array.isArray(chart && chart.bars) ? chart.bars : [])
          .map((bar) => ({
            badge: String(bar && bar.badge !== undefined ? bar.badge : "").trim(),
            val: Number(bar && bar.val) || 0,
          })),
      }))
      .filter((chart) => chart.bars.length);

    let changed;
    if (clean.length === 0) {
      changed = doc.nodeAt([canonical]) ? doc.deleteProperty([], canonical) : false;
    } else if (doc.nodeAt([canonical])) {
      changed = doc.set([canonical], clean);
    } else {
      changed = doc.setProperty([], canonical, clean);
    }
    if (changed) this.reload();
    return changed;
  }

  /** Sets one badge's percentage inside one chart. */
  setProgressionValue(name, badge, val, chartIndex = 0) {
    const charts = this.progressionCharts(name).map((chart) => ({
      label: chart.label,
      bars: chart.bars.slice(),
    }));
    const chart = charts[chartIndex];
    if (!chart) return false;
    const at = chart.bars.findIndex((bar) => bar && bar.badge === badge);
    if (at === -1) return false;
    chart.bars[at] = { ...chart.bars[at], val: Number(val) || 0 };
    return this.setProgressionCharts(name, charts);
  }

  /** Renames one chart; an empty title is allowed and reads as "Chart N". */
  setProgressionLabel(name, chartIndex, label) {
    const charts = this.progressionCharts(name).map((chart) => ({
      label: chart.label,
      bars: chart.bars.slice(),
    }));
    if (!charts[chartIndex]) return false;
    charts[chartIndex].label = String(label || "").trim();
    return this.setProgressionCharts(name, charts);
  }

  /** Appends a chart. A character with no data starts with one P1–P5 chart. */
  addProgressionChart(name, label = "", bars = null) {
    const charts = this.progressionCharts(name).map((chart) => ({
      label: chart.label,
      bars: chart.bars.slice(),
    }));
    const seed = Array.isArray(bars)
      ? bars
      : charts[charts.length - 1]?.bars.map((bar) => ({ badge: bar.badge, val: 0 })) ||
        [1, 2, 3, 4, 5].map((n) => ({ badge: `P${n}`, val: 0 }));
    charts.push({ label: String(label || "").trim(), bars: seed });
    return this.setProgressionCharts(name, charts);
  }

  /** Removes one chart; removing the last one drops the character's data. */
  removeProgressionChart(name, chartIndex) {
    const charts = this.progressionCharts(name)
      .filter((_, index) => index !== chartIndex)
      .map((chart) => ({ label: chart.label, bars: chart.bars.slice() }));
    return this.setProgressionCharts(name, charts);
  }

  /** Adds one bar to a chart, continuing the P1…Pn badge numbering. */
  addProgressionBar(name, chartIndex) {
    const charts = this.progressionCharts(name).map((chart) => ({
      label: chart.label,
      bars: chart.bars.slice(),
    }));
    const chart = charts[chartIndex];
    if (!chart) return false;
    let n = chart.bars.length + 1;
    while (chart.bars.some((bar) => bar.badge === `P${n}`)) n++;
    chart.bars.push({ badge: `P${n}`, val: 0 });
    return this.setProgressionCharts(name, charts);
  }

  /** Removes one bar from a chart. */
  removeProgressionBar(name, chartIndex, badge) {
    const charts = this.progressionCharts(name).map((chart) => ({
      label: chart.label,
      bars: chart.bars.filter((bar) => bar.badge !== badge),
    }));
    return this.setProgressionCharts(name, charts);
  }

  /** Renames one bar's badge (P1, P2, … or any label). */
  setProgressionBadge(name, chartIndex, badge, nextBadge) {
    const wanted = String(nextBadge || "").trim();
    if (!wanted) return false;
    const charts = this.progressionCharts(name).map((chart) => ({
      label: chart.label,
      bars: chart.bars.map((bar) => ({ ...bar })),
    }));
    const chart = charts[chartIndex];
    if (!chart) return false;
    const at = chart.bars.findIndex((bar) => bar.badge === badge);
    if (at === -1) return false;
    if (chart.bars.some((bar, index) => index !== at && bar.badge === wanted)) return false;
    chart.bars[at].badge = wanted;
    return this.setProgressionCharts(name, charts);
  }

  /** Creates the default P1–P5 chart for a character that has none. */
  ensureProgression(name) {
    if (this.progressionCharts(name).length > 0) return false;
    return this.addProgressionChart(name);
  }

  /* ---- output ---- */

  /** Files whose content differs from what was loaded. */
  changedFiles() {
    return FILES.filter((name) => this.docs[name] && this.docs[name].changedFromOriginal());
  }

  /** { filename: patched text } for the changed files only. */
  output() {
    const out = {};
    for (const name of this.changedFiles()) out[name] = this.docs[name].toString();
    return out;
  }

  /** { filename: original text } for the changed files only. */
  originals() {
    const out = {};
    for (const name of this.changedFiles()) out[name] = this.docs[name].original;
    return out;
  }
}

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

/**
 * Checks the model for the mistakes that are otherwise silent. Returns
 * { errors, warnings }; errors should block a save.
 */
export function validate(model) {
  const errors = [];
  const warnings = [];
  const err = (m) => errors.push(m);
  const warn = (m) => warnings.push(m);

  /* every file parses (the JsonDoc constructor would have thrown already, but
     check the outputs too, since an edit could produce invalid text) */
  for (const name of FILES) {
    const doc = model.doc(name);
    if (!doc) continue;
    try {
      JSON.parse(doc.toString());
    } catch (e) {
      err(`${name}: the edited file would not be valid JSON — ${e.message}`);
    }
  }

  /* names must resolve to something the app knows */
  const known = new Set(model.characters);
  const checkList = (file, path, list) => {
    list.forEach((raw, i) => {
      if (typeof raw !== "string") {
        err(`${file}${path ? " → " + path : ""}[${i}]: expected a string, found ${typeof raw}`);
        return;
      }
      if (!known.has(raw)) err(`${file}${path ? " → " + path : ""}[${i}]: "${raw}" is not a known character`);
    });
  };

  const rarity = model.value("characters_by_rarity.json") || {};
  const seenRarity = new Map();
  for (const [star, list] of Object.entries(rarity)) {
    if (!RARITIES.includes(star)) err(`characters_by_rarity.json: unknown rarity key "${star}"`);
    if (!Array.isArray(list)) continue;
    checkList("characters_by_rarity.json", star, list);
    for (const n of list) {
      if (seenRarity.has(n)) err(`characters_by_rarity.json: "${n}" appears under ${seenRarity.get(n)} and ${star}`);
      else seenRarity.set(n, star);
    }
    const dupes = list.filter((n, i) => list.indexOf(n) !== i);
    if (dupes.length) err(`characters_by_rarity.json → ${star}: duplicate entries ${[...new Set(dupes)].join(", ")}`);
  }

  for (const [type, list] of Object.entries(model.value("characters_by_afflatus.json") || {})) {
    if (!AFFLATUSES.includes(type)) err(`characters_by_afflatus.json: unknown afflatus key "${type}"`);
    if (Array.isArray(list)) checkList("characters_by_afflatus.json", type, list);
  }

  for (const [shape, list] of Object.entries(model.value("character_reso_shape.json") || {})) {
    if (!SHAPES.includes(shape)) err(`character_reso_shape.json: unknown shape key "${shape}"`);
    if (Array.isArray(list)) checkList("character_reso_shape.json", shape, list);
  }

  for (const file of ["exclude_character.json", "collab_character.json"]) {
    const list = model.value(file);
    if (Array.isArray(list)) checkList(file, "", list);
  }

  const fs = model.value("future_sight.json") || {};
  if (Array.isArray(fs.Character)) checkList("future_sight.json", "Character", fs.Character);

  /* euphoria entries: "Name: Effect" */
  for (const [tier, list] of Object.entries(model.value("euphoria_list.json") || {})) {
    if (!["1", "2"].includes(tier)) err(`euphoria_list.json: unexpected tier key "${tier}"`);
    if (!Array.isArray(list)) continue;
    list.forEach((entry, i) => {
      const text = String(entry);
      const idx = text.indexOf(":");
      if (idx === -1) {
        warn(`euphoria_list.json → ${tier}[${i}]: "${text}" has no effect name`);
        return;
      }
      const rawName = text.slice(0, idx).trim();
      const effect = text.slice(idx + 1).trim();
      if (!known.has(rawName)) err(`euphoria_list.json → ${tier}[${i}]: "${rawName}" is not a known character`);
      if (effect === "") warn(`euphoria_list.json → ${tier}[${i}]: "${text}" has an empty effect name`);
    });
  }

  /* future sight euphoria: "Name: tier" */
  (fs.Euphoria || []).forEach((entry, i) => {
    const text = String(entry);
    const idx = text.indexOf(":");
    if (idx === -1) {
      err(`future_sight.json → Euphoria[${i}]: "${text}" must be "Name: tier"`);
      return;
    }
    const rawName = text.slice(0, idx).trim();
    const tier = text.slice(idx + 1).trim();
    if (!known.has(rawName)) err(`future_sight.json → Euphoria[${i}]: "${rawName}" is not a known character`);
    if (!["1", "2"].includes(tier)) err(`future_sight.json → Euphoria[${i}]: tier must be 1 or 2, found "${tier}"`);
  });

  /* shape patterns */
  const patterns = model.value("shape_patterns.json") || {};
  const reso = model.value("reso_shape.json") || {};
  for (const shape of SHAPES) {
    const list = patterns[shape];
    if (!Array.isArray(list)) {
      err(`shape_patterns.json: missing "${shape}"`);
      continue;
    }
    if (list.length !== 6) err(`shape_patterns.json → ${shape}: expected 6 patterns, found ${list.length}`);
    if (list[0] !== "Placidity") warn(`shape_patterns.json → ${shape}: first pattern is "${list[0]}", expected "Placidity"`);
    const dupes = list.filter((p, i) => list.indexOf(p) !== i);
    if (dupes.length) err(`shape_patterns.json → ${shape}: duplicate patterns ${[...new Set(dupes)].join(", ")}`);
  }
  for (const shape of SHAPES) {
    const a = (patterns[shape] || []).join("|");
    const b = (reso[shape] || []).join("|");
    if (a !== b) err(`reso_shape.json → ${shape} no longer matches shape_patterns.json (the app only reads the latter)`);
  }

  /* psychubes */
  const psychubeId = model.value("psychube_id.json") || {};
  const seenKeys = new Set();
  const seenNames = new Map();
  for (const [rarity, list] of Object.entries(psychubeId)) {
    if (!PSYCHUBE_RARITIES.includes(rarity)) err(`psychube_id.json: unknown rarity key "${rarity}"`);
    if (!Array.isArray(list)) continue;
    list.forEach((item, i) => {
      const label = `psychube_id.json → ${rarity}[${i}]`;
      const id = String(item.id ?? "");
      if (!/^\d+$/.test(id)) err(`${label}: id must be numeric, found "${id}"`);
      const key = `${rarity}:${id}`;
      if (seenKeys.has(key)) err(`${label}: duplicate psychube ${key}`);
      seenKeys.add(key);
      if (!item.name) err(`${label}: name is empty`);
      if (!item.nameCN) warn(`${label}: nameCN is empty`);
      if (item.release_patch === undefined || item.release_patch === "") warn(`${label}: release_patch is empty`);
      else if (!/^\d+\.\d+$/.test(String(item.release_patch))) {
        warn(`${label}: release_patch "${item.release_patch}" is not "<major>.<minor>"`);
      }
      for (const tag of item.tags || []) {
        if (!PSYCHUBE_TAGS.includes(tag)) err(`${label}: unknown tag "${tag}"`);
      }
      if (item.name) {
        const lower = String(item.name).toLowerCase();
        if (seenNames.has(lower)) err(`psychube_id.json: name "${item.name}" is used by ${seenNames.get(lower)} and ${label}`);
        else seenNames.set(lower, label);
      }
      if (id === "1") warn(`${label}: id 1 is the reserved special chube`);
    });
  }

  const psychubeNames = new Set(seenNames.keys());
  for (const [rarity, ids] of Object.entries(fs.Psychube || {})) {
    ids.forEach((id, i) => {
      if (!psychubeId[rarity]) {
        err(`future_sight.json → Psychube.${rarity}[${i}]: no such rarity in psychube_id.json`);
        return;
      }
      if (!psychubeId[rarity].some((p) => String(p.id) === String(id))) {
        err(`future_sight.json → Psychube.${rarity}[${i}]: id "${id}" is not in psychube_id.json`);
      }
    });
  }

  /* team presets */
  const teams = model.value("team_archetypes.json") || {};
  const psychubeByName = new Map();
  for (const [rarity, list] of Object.entries(psychubeId)) {
    for (const item of list) {
      if (item.name) psychubeByName.set(String(item.name).toLowerCase(), `${rarity}:${item.id}`);
    }
  }

  for (const [archetype, variants] of Object.entries(teams)) {
    if (!Array.isArray(variants)) {
      err(`team_archetypes.json → ${archetype}: expected an array of variants`);
      continue;
    }
    variants.forEach((slots, vi) => {
      const label = `team_archetypes.json → ${archetype} #${vi + 1}`;
      if (!Array.isArray(slots)) {
        err(`${label}: expected an array of slots`);
        return;
      }
      if (slots.length === 0) warn(`${label}: has no members`);
      const used = [];
      slots.forEach((member, si) => {
        const slotLabel = `${label} slot ${si + 1}`;
        if (!member || typeof member !== "object") {
          err(`${slotLabel}: expected an object`);
          return;
        }
        if (!member.character) err(`${slotLabel}: character is empty`);
        else if (!known.has(member.character)) err(`${slotLabel}: "${member.character}" is not a known character`);
        else used.push(member.character);

        if (member.psychube && !psychubeByName.has(String(member.psychube).toLowerCase())) {
          err(`${slotLabel}: psychube "${member.psychube}" does not match any name in psychube_id.json`);
        }
        if (member.euphoria !== undefined && !/^e?[12]$/i.test(String(member.euphoria))) {
          warn(`${slotLabel}: euphoria "${member.euphoria}" is not E1/E2`);
        }
        for (const sub of member.substitutes || []) {
          const name = typeof sub === "string" ? sub : sub.character;
          const subPsychube = typeof sub === "string" ? "" : sub.psychube;
          if (!name) err(`${slotLabel}: a substitute has no character`);
          else if (!known.has(name)) err(`${slotLabel}: substitute "${name}" is not a known character`);
          if (subPsychube && !psychubeByName.has(String(subPsychube).toLowerCase())) {
            err(`${slotLabel}: substitute psychube "${subPsychube}" does not match any name in psychube_id.json`);
          }
        }
      });
      const dupes = used.filter((n, i) => used.indexOf(n) !== i);
      if (dupes.length) err(`${label}: "${[...new Set(dupes)].join('", "')}" appears more than once in one team`);
      if (!slots.some((m) => m && m.is_essential === true)) {
        warn(`${label}: no member is marked essential, so the Recommend button has nothing to protect`);
      }
    });
  }

  /* name_map duplicates (case-insensitive) */
  const nmChar = (model.value("name_map.json") || {}).character || {};
  const lower = new Map();
  for (const [key, value] of Object.entries(nmChar)) {
    const lk = key.toLowerCase();
    if (lower.has(lk)) {
      const prev = lower.get(lk);
      if (prev.value !== value) {
        warn(`name_map.json: "${prev.key}" and "${key}" differ only by case but map to different names`);
      } else {
        err(`name_map.json: "${prev.key}" and "${key}" are duplicate keys (JSON.parse would keep only one)`);
      }
    } else {
      lower.set(lk, { key, value });
    }
  }

  /* skins */
  const skinIds = new Set();
  for (const item of model.arcanistMap) {
    for (const skin of item.live2d || []) if (skin && skin.id) skinIds.add(String(skin.id));
  }
  (fs.Skin || []).forEach((id, i) => {
    if (!skinIds.has(String(id))) err(`future_sight.json → Skin[${i}]: "${id}" is not a skin id in ArcanistMap.json`);
  });
  const dupSkin = (fs.Skin || []).filter((s, i) => (fs.Skin || []).indexOf(s) !== i);
  if (dupSkin.length) err(`future_sight.json → Skin: duplicate ids ${[...new Set(dupSkin)].join(", ")}`);

  /* global name transfer */
  for (const [raw, canonical] of Object.entries(model.value("global_name_transfer.json") || {})) {
    if (!model.arcanistByNameEng.has(raw)) {
      warn(`global_name_transfer.json: "${raw}" is not a nameEng in ArcanistMap.json, so it never applies`);
    }
    if (!known.has(canonical)) {
      err(`global_name_transfer.json: "${raw}" maps to "${canonical}", which is not a known character`);
    }
  }

  /* guide: character builds */
  {
    const builds = model.value("guide_builds.json") || {};
    for (const [name, build] of Object.entries(builds)) {
      const label = `guide_builds.json → ${name}`;
      if (!known.has(name)) {
        err(`${label}: "${name}" is not a known character`);
        continue;
      }
      if (!build || typeof build !== "object" || Array.isArray(build)) {
        err(`${label}: expected an object`);
        continue;
      }
      for (const key of Object.keys(build)) {
        if (!["psychubes", "resonance", "pattern", "portrait", "notes"].includes(key)) {
          warn(`${label}: unknown field "${key}"`);
        }
      }
      for (const item of build.psychubes || []) {
        const text = String(item || "").trim();
        if (text && !psychubeNames.has(text.toLowerCase())) {
          warn(`${label}: psychube "${text}" does not match any name in psychube_id.json`);
        }
      }
      if (build.resonance !== undefined && (typeof build.resonance !== "object" || Array.isArray(build.resonance))) {
        err(`${label}: resonance must be an object of {label: code}`);
      }
    }
  }

  /* guide: rotations */
  {
    const value = model.value("guide_rotations.json") || {};
    const rotations = value.rotations;
    if (!Array.isArray(rotations)) {
      warn("guide_rotations.json: no rotations array, so the Guide's Rotations tab stays empty");
    } else {
      const seenIds = new Set();
      rotations.forEach((rotation, i) => {
        const label = `guide_rotations.json → rotation ${i + 1}`;
        if (!rotation || typeof rotation !== "object") {
          err(`${label}: expected an object`);
          return;
        }
        if (!String(rotation.name || "").trim()) warn(`${label}: has no name`);
        if (!String(rotation.id || "").trim()) err(`${label}: has no id`);
        else if (seenIds.has(rotation.id)) err(`${label}: duplicate id "${rotation.id}"`);
        else seenIds.add(rotation.id);

        if (rotation.archetypes !== undefined && !Array.isArray(rotation.archetypes)) {
          err(`${label}: archetypes must be an array of tag names`);
        }
        for (const tag of rotation.archetypes || []) {
          if (!ROTATION_ARCHETYPES.includes(tag)) warn(`${label}: unknown archetype "${tag}"`);
        }

        for (const member of rotation.members || []) {
          const name = typeof member === "string" ? member : member && member.character;
          if (name && !known.has(name)) err(`${label}: member "${name}" is not a known character`);
          const chube = typeof member === "object" && member ? member.psychube : "";
          if (chube && !psychubeNames.has(String(chube).toLowerCase())) {
            warn(`${label}: member psychube "${chube}" does not match any name in psychube_id.json`);
          }
        }

        const rounds = Array.isArray(rotation.rounds)
          ? rotation.rounds
          : Array.isArray(rotation.turns)
            ? rotation.turns.map((turn) => ({
                slots: (turn.cards || []).map((card) => ({ cards: card ? [card] : [] })),
              }))
            : [];

        rounds.forEach((round, ri) => {
          const roundLabel = `${label} round ${ri + 1}`;
          if (!round || typeof round !== "object") {
            err(`${roundLabel}: expected an object`);
            return;
          }
          const slots = Array.isArray(round.slots) ? round.slots : [];
          slots.forEach((slot, si) => {
            const slotLabel = `${roundLabel} slot ${si + 1}`;
            if (!slot || typeof slot !== "object") {
              err(`${slotLabel}: expected an object`);
              return;
            }
            const type = slot.type || "normal";
            if (!["normal", "or", "lb", "text"].includes(type)) warn(`${slotLabel}: unknown type "${type}"`);
            const cards = Array.isArray(slot.cards) ? slot.cards : [];
            const limit = type === "or" ? 2 : 1;
            if (type !== "text" && cards.length > limit) err(`${slotLabel}: a ${type} slot holds at most ${limit} card(s)`);
            cards.forEach((card, ci) => {
              if (!card || typeof card !== "object") {
                err(`${slotLabel} card ${ci + 1}: expected an object`);
                return;
              }
              if (card.special) {
                if (!String(card.special).startsWith("images/skills/")) {
                  warn(`${slotLabel} card ${ci + 1}: special "${card.special}" is not under images/skills/`);
                }
                return;
              }
              if (!card.character) err(`${slotLabel} card ${ci + 1}: no character`);
              else if (!known.has(card.character)) err(`${slotLabel} card ${ci + 1}: "${card.character}" is not a known character`);
              if (!Number.isInteger(Number(card.skill)) || Number(card.skill) < 1) {
                err(`${slotLabel} card ${ci + 1}: skill must be a positive number`);
              }
            });
          });
        });
      });
    }
  }

  /* portrait progressions */
  for (const [name, list] of Object.entries(model.value("characters_progressions.json") || {})) {
    const label = `characters_progressions.json → ${name}`;
    if (!known.has(name)) err(`${label}: "${name}" is not a known character`);
    if (!Array.isArray(list)) {
      err(`${label}: expected an array of charts`);
      continue;
    }
    if (list.length === 0) warn(`${label}: has no charts, so nothing is drawn`);

    // A flat bar list is the legacy single-chart shape.
    const legacy = list.every((entry) => entry && typeof entry === "object" && !Array.isArray(entry.bars));
    if (legacy) {
      list.forEach((entry, i) => {
        if (!entry || typeof entry !== "object") err(`${label}[${i}]: expected an object`);
        else if (entry.val !== undefined && !Number.isFinite(Number(entry.val))) err(`${label}[${i}]: val must be a number`);
      });
      continue;
    }

    const seenLabels = new Set();
    list.forEach((chart, i) => {
      if (!chart || typeof chart !== "object" || Array.isArray(chart)) {
        err(`${label}[${i}]: expected a chart object`);
        return;
      }
      for (const key of Object.keys(chart)) {
        if (!["label", "bars"].includes(key)) warn(`${label}[${i}]: unknown field "${key}"`);
      }
      if (!Array.isArray(chart.bars)) {
        err(`${label}[${i}]: expected a bars array`);
        return;
      }
      if (chart.bars.length === 0) warn(`${label}[${i}]: has no bars, so nothing is drawn`);

      const title = String(chart.label || "").trim();
      if (title) {
        if (seenLabels.has(title.toLowerCase())) warn(`${label}: two charts are both called "${title}"`);
        seenLabels.add(title.toLowerCase());
      }

      const seenBadges = new Set();
      chart.bars.forEach((bar, j) => {
        if (!bar || typeof bar !== "object") {
          err(`${label}[${i}].bars[${j}]: expected an object`);
          return;
        }
        const badge = String(bar.badge ?? "").trim();
        if (!badge) warn(`${label}[${i}].bars[${j}]: has no badge label`);
        else if (seenBadges.has(badge)) warn(`${label}[${i}]: two bars are both called "${badge}"`);
        seenBadges.add(badge);
        if (bar.val !== undefined && !Number.isFinite(Number(bar.val))) err(`${label}[${i}].bars[${j}]: val must be a number`);
      });
    });
  }

  return { errors, warnings };
}
