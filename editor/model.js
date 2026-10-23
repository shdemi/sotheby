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
  "credits.json",
  "i18n.json",
];

/** Read-only inputs: maintained elsewhere, never written by the editor. */
export const READ_ONLY_FILES = ["ArcanistMap.json"];

export const RARITIES = ["2", "3", "4", "5", "6"];
export const AFFLATUSES = ["Beast", "Plant", "Star", "Mineral", "Spirit", "Intellect", "Mineral_Star"];
export const SHAPES = ["Z shape", "Plus shape", "T shape", "U shape"];
export const PSYCHUBE_TAGS = ["ATK", "Critical", "Heal", "Survival", "Support"];
export const PSYCHUBE_RARITIES = ["6", "5"];

/** Team-archetype tags a rotation may carry (mirrors app.js). */
export const ROTATION_ARCHETYPES = [
  // Raid and Focused Flashback lead the list and never appear together.
  "Raid", "Focused Flashback",
  "Burn", "HP Sacrifice", "Poison", "Ritual", "Rank Up", "Extra Action", "Bloodtithe",
  "Dynamo", "Inspiration", "Lingering Glow", "Shift", "Conduit", "Pursuit",
];

/** Archetypes that exclude each other: a rotation carries at most one. */
export const EXCLUSIVE_ARCHETYPES = ["Raid", "Focused Flashback"];

/** Each lead archetype's chip colour. */
export const ARCHETYPE_COLORS = {
  Raid: "#F5E1C3",
  "Focused Flashback": "#A5B9E7",
};

/**
 * Slot layouts. "free" and "precast" are legacy values: they only ever changed
 * the caption, so they now map to a plain normal slot plus a tag.
 */
export const GUIDE_SLOT_TYPES = ["normal", "or", "double_or", "lb", "text", "tuning"];

/** Legacy slot types and the tag they stand for. */
export const LEGACY_SLOT_TAGS = { free: "ap-free", precast: "precast" };

/**
 * Slot tags. The layout lives in `type`; the meaning lives here, so a slot can
 * carry both AP Free and Precast.
 *   badge  — plate on the group's top-left corner
 *   plaque — plate on the card, below the badge when both are present
 * Every tag draws its words on the blank `Tag_Empty.png` ribbon, so the text can
 * shrink to fit the card instead of overflowing it. `text` marks the tag whose
 * words come from the slot (`tagText`) rather than from the table.
 */
export const GUIDE_SLOT_TAGS = [
  { key: "ap-free", label: "AP Free", kind: "badge", image: "images/card_modulo/Tag_Empty.png" },
  { key: "precast", label: "Precast", kind: "plaque", image: "images/card_modulo/Tag_Empty.png" },
  // The blank plaque the author types into.
  { key: "custom", label: "Custom", kind: "plaque", image: "images/card_modulo/Tag_Empty.png", text: true },
];

/** The tag whose plate carries the author's own text. */
export const GUIDE_SLOT_TAG_TEXT_KEY = "custom";

/**
 * The tags the card panel offers. All three are the same blank ribbon: the two
 * presets print their own name on it, and `custom` prints what the author typed,
 * so the plate can shrink to fit the card instead of being a fixed bitmap.
 */
export const PANEL_SLOT_TAGS = GUIDE_SLOT_TAGS;

/**
 * The words a tag's plate draws. The blank tag shows what the author typed; the
 * two presets keep their own name.
 */
export function guideSlotTagLabel(tag, slotTagText) {
  if (!tag) return "";
  if (tag.text) return String(slotTagText || "");
  return tag.label;
}

/**
 * The one card frame: a skill-3 card is drawn in the arched Ultimate plate. A
 * card is otherwise just its art, so there is no frame list to choose from.
 * `inset` is the plate's inner window, in percent of the card box.
 */
export const GUIDE_ULTIMATE_FRAME = {
  image: "images/card_modulo/Ultimate.png",
  box: { width: 183, height: 315 },
  inset: { left: 6.56, top: 7.30, width: 87.98, height: 86.35 },
  radius: "50% 50% 0 0 / 22% 22% 0 0",
};

/**
 * The card box. `Normal.png` is the placeholder face an empty slot shows, and it
 * also fixes the shape every card is drawn in.
 */
export const GUIDE_CARD_BOXES = {
  normal: { width: 164, height: 217 },
  ultimate: { width: 183, height: 315 },
};

/** The placeholder an empty slot shows. */
export const GUIDE_EMPTY_CARD = "images/card_modulo/Normal.png";

/**
 * Card surfaces. A surface is translucent decoration laid straight over the art,
 * so it is drawn at the full card size — every surface PNG matches the box of the
 * shape it belongs to.
 */
export const GUIDE_CARD_SURFACES = [
  {
    key: "ramona",
    label: "Ramona",
    image: "images/card_modulo/surface/Ramona_Normal_Card.png",
    frame: "normal",
  },
  {
    key: "ramona-ultimate",
    label: "Ramona Ultimate",
    image: "images/card_modulo/surface/Ramona_Ultimate_Card.png",
    frame: "ultimate",
    // Still rendered where a rotation already uses it, but the card panel no
    // longer offers it.
    hidden: true,
  },
  {
    key: "conduit",
    label: "Conduit",
    image: "images/card_modulo/surface/Conduit.png",
    frame: "normal",
  },
  {
    key: "conduit-ultimate",
    label: "Conduit Ultimate",
    image: "images/card_modulo/surface/Conduit_Ultimate.png",
    frame: "ultimate",
  },
];

/** The surfaces the card panel offers in its Extra tab. */
export const PANEL_CARD_SURFACES = GUIDE_CARD_SURFACES.filter((surface) => !surface.hidden);

/**
 * Stand-in cards with no owner. "Any" and "Move" describe a step rather than a
 * skill, so they carry no character; they are stored as `special` art and are
 * dropped into a slot exactly like a skill card.
 */
export const GUIDE_OTHER_CARDS = [
  { key: "any", label: "Any", image: "images/card_modulo/Any.png" },
  { key: "move", label: "Move", image: "images/card_modulo/Move.png" },
  { key: "generate", label: "Generate", image: "images/card_modulo/Generate.png" },
  { key: "remove", label: "Remove", image: "images/card_modulo/Remove.png" },
  { key: "refresh", label: "Refresh", image: "images/card_modulo/Refresh.png" },
  { key: "merge", label: "Merge", image: "images/card_modulo/Merge.png" },
];

/** A surface by key, or null. */
export function guideCardSurface(key) {
  return GUIDE_CARD_SURFACES.find((surface) => surface.key === key) || null;
}

/**
 * Characters whose ultimate is not skill 3. One map answers both "which skill is
 * the ultimate" (the editor handles it like any skill-3 card) and "which cards
 * are drawn in the Ultimate plate".
 */
export const ULTIMATE_SKILLS = {
  Rhiannon: 4,
  Brume: 4,
  Kassandra: 5,
};

/** Whether a skill card belongs to a character's ultimate. */
export function guideSkillIsUltimate(character, skill) {
  const name = String(character || "");
  const key = Object.keys(ULTIMATE_SKILLS).find((entry) => entry.toLowerCase() === name.toLowerCase());
  if (key) return Number(skill) === ULTIMATE_SKILLS[key];
  return Number(skill) === 3;
}

/** Whether a card is drawn in the Ultimate plate. */
export function guideCardIsUltimate(card) {
  if (!card) return false;
  if (card.frame === "ultimate") return true;
  if (card.frame === "normal") return false;
  if (card.special) return false;
  return guideSkillIsUltimate(card.character, card.skill);
}

/** Bracket callout styles a round can draw under its cards. */
export const GUIDE_ANNOTATION_STYLES = ["bracket", "box", "fork"];

/** A slot's layout, with the two legacy types folded into "normal". */
export function guideSlotLayout(slot) {
  const type = slot?.type || "normal";
  return LEGACY_SLOT_TAGS[type] ? "normal" : type;
}

/** A slot's tags, including the one a legacy type implies. */
export function guideSlotTags(slot) {
  const tags = Array.isArray(slot?.tags) ? slot.tags.filter((tag) => typeof tag === "string") : [];
  const legacy = LEGACY_SLOT_TAGS[slot?.type];
  return legacy && !tags.includes(legacy) ? [...tags, legacy] : tags;
}

/** The text a text tag draws on its plate; "" when the slot has none. */
export function guideSlotTagText(slot) {
  return typeof slot?.tagText === "string" ? slot.tagText : "";
}

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
    } else if (field === "notes") {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        payload = value;
      } else {
        payload = String(value ?? "").trim();
      }
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

  /** Copies a rotation, places the copy right after it and returns its new id. */
  duplicateGuideRotation(id) {
    const doc = this.doc("guide_rotations.json");
    if (!doc) return null;
    const index = this.guideRotationIndex(id);
    if (index === -1) return null;
    const source = this.guideRotations()[index];
    const name = `${String(source.name || id).trim()} (copy)`;
    const copyId = this.guideRotationId(name);
    const copy = JSON.parse(JSON.stringify(source));
    copy.id = copyId;
    copy.name = name;
    doc.insertAt(["rotations"], index + 1, copy);
    this.reload();
    return copyId;
  }

  /** Copies a round, places the copy right after it and returns its new index. */
  duplicateGuideRound(id, roundIndex) {
    const doc = this.doc("guide_rotations.json");
    if (!doc) return -1;
    const index = this.guideRotationIndex(id);
    if (index === -1) return -1;
    const rounds = this.guideRotations()[index].rounds || [];
    if (!rounds[roundIndex]) return -1;
    const copy = JSON.parse(JSON.stringify(rounds[roundIndex]));
    doc.insertAt(["rotations", index, "rounds"], roundIndex + 1, copy);
    // Everything after the copy shifts down by one.
    this.remapRoundNotes(index, (value) => (value > roundIndex ? value + 1 : value));
    this.reload();
    return roundIndex + 1;
  }

  /** Moves a rotation up or down the list. All indices are 0-based. */
  moveGuideRotation(from, to) {
    const doc = this.doc("guide_rotations.json");
    if (!doc) return false;
    const changed = doc.reorderAt(["rotations"], from, to);
    if (changed) this.reload();
    return changed;
  }

  /** Moves one AP slot within a round, reordering the turn's card plan. */
  moveRotationSlot(id, roundIndex, from, to) {
    const doc = this.doc("guide_rotations.json");
    if (!doc) return false;
    const index = this.guideRotationIndex(id);
    if (index === -1) return false;
    const path = ["rotations", index, "rounds", roundIndex, "slots"];
    if (!doc.nodeAt(path)) return false;
    // The callouts follow the cards they point at, so the ranges are remapped
    // from the pre-move order before the array is touched.
    const mapIndex = (value) => {
      if (value === from) return to;
      if (from < to) return value > from && value <= to ? value - 1 : value;
      return value >= to && value < from ? value + 1 : value;
    };
    const changed = doc.reorderAt(path, from, to);
    if (changed) {
      this.remapAnnotations(index, roundIndex, mapIndex);
      this.reload();
    }
    return changed;
  }

  /**
   * Rewrites annotation ranges through a slot edit. `mapIndex` returns the new
   * index, or null when the slot it pointed at is gone.
   */
  remapAnnotations(rotationIndex, roundIndex, mapIndex) {
    const doc = this.doc("guide_rotations.json");
    if (!doc) return false;
    const round = this.guideRotations()[rotationIndex]?.rounds?.[roundIndex];
    const annotations = round?.annotations;
    if (!Array.isArray(annotations) || annotations.length === 0) return false;
    const count = Array.isArray(round.slots) ? round.slots.length : 0;
    if (count === 0) return false;

    const next = [];
    for (const annotation of annotations) {
      const from = mapIndex(Number(annotation.from) || 0);
      const to = mapIndex(Number(annotation.to) || 0);
      if (from === null && to === null) continue;
      // A range with one dead end shrinks to the end that survived.
      const a = Math.max(0, Math.min(count - 1, from === null ? to : from));
      const b = Math.max(0, Math.min(count - 1, to === null ? a : to));
      next.push({ ...annotation, from: Math.min(a, b), to: Math.max(a, b) });
    }

    const path = ["rotations", rotationIndex, "rounds", roundIndex, "annotations"];
    return next.length
      ? doc.set(path, next)
      : doc.deleteProperty(["rotations", rotationIndex, "rounds", roundIndex], "annotations");
  }

  /** Sets `name`, `notes`, `tuning` or `archetypes` on a rotation. */
  setGuideRotationField(id, field, value) {
    const doc = this.doc("guide_rotations.json");
    if (!doc) return false;
    const index = this.guideRotationIndex(id);
    if (index === -1) return false;
    const path = ["rotations", index, field];

    let payload = value;
    if (field === "archetypes") {
      // The list is ordered, and the lead archetypes exclude each other.
      const list = (Array.isArray(value) ? value : []).filter(Boolean);
      const kept = list.filter((tag) => !EXCLUSIVE_ARCHETYPES.includes(tag));
      const lead = EXCLUSIVE_ARCHETYPES.filter((tag) => list.includes(tag)).slice(0, 1);
      payload = ROTATION_ARCHETYPES.filter((tag) => [...lead, ...kept].includes(tag));
    } else if (field === "notes") {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        payload = value;
      } else {
        payload = String(value ?? "");
      }
    } else {
      payload = String(value ?? "");
    }

    // An empty list or string has no meaning, so drop the key instead of writing it.
    const empty =
      payload === "" ||
      (Array.isArray(payload) && payload.length === 0) ||
      (payload && typeof payload === "object" && !Array.isArray(payload) && Object.keys(payload).length === 0);
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
    } else if (field === "psychube") {
      members[slot].psychube = String(value || "");
    }

    // Portrait tier: 0 is the default, so the key is dropped instead of written.
    if (field === "portrait") {
      const tier = Math.max(0, Math.min(5, Number(value) || 0));
      if (tier > 0) members[slot].portrait = tier;
      else delete members[slot].portrait;
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
    const doc = this.doc("guide_rotations.json");
    if (!doc) return false;
    const index = this.guideRotationIndex(id);
    if (index === -1) return false;
    const path = ["rotations", index, "rounds"];
    if (!doc.nodeAt([...path, roundIndex])) return false;
    doc.removeAt(path, roundIndex);
    // A round note that pointed at the removed round shrinks; one that only
    // covered it disappears with it.
    this.remapRoundNotes(index, (value) => (value === roundIndex ? null : value > roundIndex ? value - 1 : value));
    this.reload();
    return true;
  }

  setGuideRoundNote(id, roundIndex, note) {
    const payload =
      note && typeof note === "object" && !Array.isArray(note) ? note : String(note || "");
    return this.setRoundField(id, roundIndex, "note", payload);
  }

  /* ---- guide: round notes (brackets spanning several rounds) ---- */

  /**
   * Adds a bracket beside rounds `from`..`to` (0-based, inclusive), the note that
   * says "repeat these rounds". It lives on the rotation, not on a round, because
   * it points at the gaps between them.
   */
  addGuideRoundNote(id, from, to, text = "", style = "bracket") {
    const doc = this.doc("guide_rotations.json");
    if (!doc) return false;
    const index = this.guideRotationIndex(id);
    if (index === -1) return false;
    const rotation = this.guideRotations()[index];
    const count = Array.isArray(rotation.rounds) ? rotation.rounds.length : 0;
    if (count === 0) return false;

    const a = Math.max(0, Math.min(count - 1, Number(from) || 0));
    const b = Math.max(a, Math.min(count - 1, Number(to) ?? a));
    const entry = {
      from: a,
      to: b,
      style: GUIDE_ANNOTATION_STYLES.includes(style) ? style : "bracket",
      text: String(text || ""),
    };
    const path = ["rotations", index, "roundNotes"];
    const changed = doc.nodeAt(path)
      ? doc.append(path, entry)
      : doc.setProperty(["rotations", index], "roundNotes", [entry]);
    if (changed) this.reload();
    return changed;
  }

  setGuideRoundNoteField(id, noteIndex, field, value) {
    const doc = this.doc("guide_rotations.json");
    if (!doc) return false;
    const index = this.guideRotationIndex(id);
    if (index === -1) return false;
    const rotation = this.guideRotations()[index];
    const note = rotation.roundNotes?.[noteIndex];
    if (!note) return false;
    const path = ["rotations", index, "roundNotes", noteIndex];
    const count = Array.isArray(rotation.rounds) ? rotation.rounds.length : 0;

    let payload = value;
    if (field === "from" || field === "to") {
      payload = Math.max(0, Math.min(Math.max(0, count - 1), Number(value) || 0));
    } else if (field === "style") {
      payload = GUIDE_ANNOTATION_STYLES.includes(value) ? value : "bracket";
    } else if (field === "text") {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        payload = value;
      } else {
        payload = String(value || "");
      }
    } else {
      return false;
    }
    const changed = doc.nodeAt([...path, field])
      ? doc.set([...path, field], payload)
      : doc.setProperty(path, field, payload);
    if (changed) this.reload();
    return changed;
  }

  removeGuideRoundNote(id, noteIndex) {
    const doc = this.doc("guide_rotations.json");
    if (!doc) return false;
    const index = this.guideRotationIndex(id);
    if (index === -1) return false;
    const path = ["rotations", index, "roundNotes"];
    if (!doc.nodeAt([...path, noteIndex])) return false;
    doc.removeAt(path, noteIndex);
    // An empty list carries no information, so the key goes with its last note.
    const remaining = this.guideRotations()[index].roundNotes;
    if (Array.isArray(remaining) && remaining.length === 0) {
      doc.deleteProperty(["rotations", index], "roundNotes");
    }
    this.reload();
    return true;
  }

  /**
   * Rewrites round-note ranges after a round is added, removed or moved.
   * `mapIndex` returns the new index, or null when the round it pointed at is
   * gone.
   */
  remapRoundNotes(rotationIndex, mapIndex) {
    const doc = this.doc("guide_rotations.json");
    if (!doc) return false;
    const rotation = this.guideRotations()[rotationIndex];
    const notes = rotation?.roundNotes;
    if (!Array.isArray(notes) || notes.length === 0) return false;
    const count = Array.isArray(rotation.rounds) ? rotation.rounds.length : 0;
    if (count === 0) return false;

    const next = [];
    for (const note of notes) {
      const from = mapIndex(Number(note.from) || 0);
      const to = mapIndex(Number(note.to) || 0);
      if (from === null && to === null) continue;
      const a = Math.max(0, Math.min(count - 1, from === null ? to : from));
      const b = Math.max(0, Math.min(count - 1, to === null ? a : to));
      next.push({ ...note, from: Math.min(a, b), to: Math.max(a, b) });
    }

    const path = ["rotations", rotationIndex, "roundNotes"];
    return next.length
      ? doc.set(path, next)
      : doc.deleteProperty(["rotations", rotationIndex], "roundNotes");
  }

  /**
   * Sets a tuning slot's card: Tuning_S1 or Tuning_S2. An empty value clears it.
   * A tuning slot also carries text, set through `setGuideSlotText`.
   */
  setGuideTuningIcon(id, roundIndex, slotIndex, icon) {
    const doc = this.doc("guide_rotations.json");
    if (!doc) return false;
    const index = this.guideRotationIndex(id);
    if (index === -1) return false;
    const slot = this.guideRotations()[index].rounds?.[roundIndex]?.slots?.[slotIndex];
    if (!slot) return false;
    if (icon && !/\/Tuning_S\d+\.png$/i.test(String(icon))) return false;
    const path = ["rotations", index, "rounds", roundIndex, "slots", slotIndex];
    const match = /\/Tuning_S\d+\.png$/i.exec(String(icon || ""));
    let changed = false;
    if (match) {
      changed = doc.nodeAt([...path, "cards"])
        ? doc.set([...path, "cards"], [{ special: String(icon) }])
        : doc.setProperty(path, "cards", [{ special: String(icon) }]);
    } else if (doc.nodeAt([...path, "cards"])) {
      changed = doc.deleteProperty(path, "cards");
    }
    if (changed) this.reload();
    return changed;
  }

  addGuideSlot(id, roundIndex, type = "normal", tags = []) {
    const legacy = LEGACY_SLOT_TAGS[type] ? type : null;
    const kind = GUIDE_SLOT_TYPES.includes(type) ? type : "normal";
    const list = [...(Array.isArray(tags) ? tags : [])];
    if (legacy && !list.includes(LEGACY_SLOT_TAGS[legacy])) list.push(LEGACY_SLOT_TAGS[legacy]);
    const entry = { type: kind };
    if (list.length) entry.tags = list;
    // Tuning slots take a text caption as well as their S1/S2 card.
    if (kind === "text" || kind === "tuning") entry.text = "";
    else entry.cards = [];
    return this.appendRoundSlot(id, roundIndex, entry);
  }

  /** Inserts a slot at `at`, so a card can be dropped between two others. */
  insertRoundSlot(id, roundIndex, at, slot) {
    const doc = this.doc("guide_rotations.json");
    if (!doc) return false;
    const index = this.guideRotationIndex(id);
    if (index === -1) return false;
    const path = ["rotations", index, "rounds", roundIndex, "slots"];
    if (!doc.nodeAt(path)) return false;
    const entry = this.normalizeSlot(slot);
    const list = this.guideRotations()[index].rounds?.[roundIndex]?.slots || [];
    const position = Math.max(0, Math.min(list.length, Number(at) || 0));
    const changed = doc.nodeAt(path)
      ? doc.insertAt(path, position, entry)
      : doc.setProperty(["rotations", index, "rounds", roundIndex], "slots", [entry]);
    if (changed) this.reload();
    return changed;
  }

  /** Fills in the shape of a slot the caller built by hand. */
  normalizeSlot(slot) {
    const type = guideSlotLayout(slot);
    const entry = { type };
    const tags = guideSlotTags(slot);
    if (tags.length) entry.tags = tags;
    const tagText = guideSlotTagText(slot).trim();
    if (tags.includes(GUIDE_SLOT_TAG_TEXT_KEY) && tagText) entry.tagText = tagText;
    if (type === "text" || type === "tuning") {
      entry.text = String(slot?.text || "");
    } else {
      entry.cards = (Array.isArray(slot?.cards) ? slot.cards : []).map((card) => this.normalizeCard(card)).filter(Boolean);
    }
    return entry;
  }

  /** Sets a slot's type; switching to text drops the cards and vice versa. */
  setGuideSlotType(id, roundIndex, slotIndex, type) {
    const doc = this.doc("guide_rotations.json");
    if (!doc) return false;
    const index = this.guideRotationIndex(id);
    if (index === -1) return false;
    const path = ["rotations", index, "rounds", roundIndex, "slots", slotIndex];
    if (!doc.nodeAt(path)) return false;
    const kind = GUIDE_SLOT_TYPES.includes(type) ? type : "normal";
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
    // A callout that pointed at the removed slot shrinks; one that only covered
    // it disappears with it.
    this.remapAnnotations(index, roundIndex, (value) => (value === slotIndex ? null : value > slotIndex ? value - 1 : value));
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
    const limit = slot.type === "double_or" || slot.type === "or3" ? 3 : slot.type === "or" ? 2 : 1;
    // A normal or LB slot holds one card: a drop replaces it.
    if (limit === 1) cards.length = 0;
    else if (cards.length >= limit) return false;
    cards.push(entry);

    const slotPath = ["rotations", index, "rounds", roundIndex, "slots", slotIndex];
    let changed = this.migrateGuideSlot(slotPath, slot);
    const path = [...slotPath, "cards"];
    changed = (doc.nodeAt(path) ? doc.set(path, cards) : doc.setProperty(slotPath, "cards", cards)) || changed;
    if (changed) this.reload();
    return changed;
  }

  /**
   * Rewrites a legacy "free" / "precast" slot as a normal slot plus a tag, so
   * the old caption survives while the data moves to the current shape.
   */
  migrateGuideSlot(slotPath, slot) {
    const doc = this.doc("guide_rotations.json");
    if (!doc || !LEGACY_SLOT_TAGS[slot?.type]) return false;
    const tags = guideSlotTags(slot);
    let changed = doc.nodeAt([...slotPath, "type"])
      ? doc.set([...slotPath, "type"], "normal")
      : doc.setProperty(slotPath, "type", "normal");
    changed = (doc.nodeAt([...slotPath, "tags"])
      ? doc.set([...slotPath, "tags"], tags)
      : doc.setProperty(slotPath, "tags", tags)) || changed;
    return changed;
  }

  /** Adds or removes one tag on a slot. Returns true when something changed. */
  setGuideSlotTag(id, roundIndex, slotIndex, tag, on = true) {
    const doc = this.doc("guide_rotations.json");
    if (!doc) return false;
    const index = this.guideRotationIndex(id);
    if (index === -1) return false;
    const slot = this.guideRotations()[index].rounds?.[roundIndex]?.slots?.[slotIndex];
    if (!slot) return false;
    if (!GUIDE_SLOT_TAGS.some((entry) => entry.key === tag)) return false;

    const slotPath = ["rotations", index, "rounds", roundIndex, "slots", slotIndex];
    let changed = this.migrateGuideSlot(slotPath, slot);
    const current = guideSlotTags(slot).filter((value) => value !== tag);
    if (on) current.push(tag);
    const path = [...slotPath, "tags"];
    if (current.length === 0) {
      if (doc.nodeAt(path)) changed = doc.deleteProperty(slotPath, "tags") || changed;
    } else {
      changed = (doc.nodeAt(path) ? doc.set(path, current) : doc.setProperty(slotPath, "tags", current)) || changed;
    }
    // The text only belongs to the slot while its plate is there.
    if (!current.includes(GUIDE_SLOT_TAG_TEXT_KEY) && doc.nodeAt([...slotPath, "tagText"])) {
      changed = doc.deleteProperty(slotPath, "tagText") || changed;
    }
    if (changed) this.reload();
    return changed;
  }

  /** Sets the text the free-text tag plate draws. */
  setGuideSlotTagText(id, roundIndex, slotIndex, text) {
    const doc = this.doc("guide_rotations.json");
    if (!doc) return false;
    const index = this.guideRotationIndex(id);
    if (index === -1) return false;
    const slot = this.guideRotations()[index].rounds?.[roundIndex]?.slots?.[slotIndex];
    if (!slot || !guideSlotTags(slot).includes(GUIDE_SLOT_TAG_TEXT_KEY)) return false;
    const slotPath = ["rotations", index, "rounds", roundIndex, "slots", slotIndex];
    const value = String(text || "").trim();
    const path = [...slotPath, "tagText"];
    const changed = value
      ? doc.nodeAt(path) ? doc.set(path, value) : doc.setProperty(slotPath, "tagText", value)
      : doc.deleteProperty(slotPath, "tagText");
    if (changed) this.reload();
    return changed;
  }

  /** Sets `frame`, `surface` or `preferred` on one card. */
  setGuideCardField(id, roundIndex, slotIndex, cardIndex, field, value) {
    const doc = this.doc("guide_rotations.json");
    if (!doc) return false;
    const index = this.guideRotationIndex(id);
    if (index === -1) return false;
    const card = this.guideRotations()[index].rounds?.[roundIndex]?.slots?.[slotIndex]?.cards?.[cardIndex];
    if (!card) return false;
    const path = ["rotations", index, "rounds", roundIndex, "slots", slotIndex, "cards", cardIndex];

    const write = (key, payload) => {
      if (payload === "") {
        return doc.nodeAt([...path, key]) ? doc.deleteProperty(path, key) : false;
      }
      return doc.nodeAt([...path, key])
        ? doc.set([...path, key], payload)
        : doc.setProperty(path, key, payload);
    };

    let changed = false;
    if (field === "frame") {
      // Only the Ultimate plate exists; "normal" means "no plate at all".
      if (value && value !== "ultimate" && value !== "normal") return false;
      changed = write("frame", value || "");
    } else if (field === "surface") {
      // A surface is sized to one card shape, so it carries that shape with it.
      if (value && !guideCardSurface(value)) return false;
      changed = write("surface", value || "");
      const surface = guideCardSurface(value);
      if (surface) changed = write("frame", surface.frame === "ultimate" ? "ultimate" : "") || changed;
    } else if (field === "preferred") {
      changed = write("preferred", value ? true : "");
    }
    if (changed) this.reload();
    return changed;
  }

  /* ---- guide: annotations (bracket callouts) ---- */

  /**
   * Adds a bracket callout under slots `from`..`to` (0-based, inclusive).
   * `style` is one of GUIDE_ANNOTATION_STYLES.
   */
  addGuideAnnotation(id, roundIndex, from, to, text = "", style = "bracket") {
    const doc = this.doc("guide_rotations.json");
    if (!doc) return false;
    const index = this.guideRotationIndex(id);
    if (index === -1) return false;
    const round = this.guideRotations()[index].rounds?.[roundIndex];
    if (!round) return false;
    const count = Array.isArray(round.slots) ? round.slots.length : 0;
    if (count === 0) return false;

    const a = Math.max(0, Math.min(count - 1, Number(from) || 0));
    const b = Math.max(a, Math.min(count - 1, Number(to) ?? a));
    const entry = {
      from: a,
      to: b,
      style: GUIDE_ANNOTATION_STYLES.includes(style) ? style : "bracket",
      text: String(text || ""),
    };
    const path = ["rotations", index, "rounds", roundIndex, "annotations"];
    const changed = doc.nodeAt(path)
      ? doc.append(path, entry)
      : doc.setProperty(["rotations", index, "rounds", roundIndex], "annotations", [entry]);
    if (changed) this.reload();
    return changed;
  }

  setGuideAnnotationField(id, roundIndex, annotationIndex, field, value) {
    const doc = this.doc("guide_rotations.json");
    if (!doc) return false;
    const index = this.guideRotationIndex(id);
    if (index === -1) return false;
    const round = this.guideRotations()[index].rounds?.[roundIndex];
    const annotation = round?.annotations?.[annotationIndex];
    if (!annotation) return false;
    const path = ["rotations", index, "rounds", roundIndex, "annotations", annotationIndex];
    const count = Array.isArray(round.slots) ? round.slots.length : 0;

    let payload = value;
    if (field === "from" || field === "to") {
      payload = Math.max(0, Math.min(Math.max(0, count - 1), Number(value) || 0));
    } else if (field === "style") {
      payload = GUIDE_ANNOTATION_STYLES.includes(value) ? value : "bracket";
    } else if (field === "text") {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        payload = value;
      } else {
        payload = String(value || "");
      }
    } else {
      return false;
    }
    const changed = doc.nodeAt([...path, field])
      ? doc.set([...path, field], payload)
      : doc.setProperty(path, field, payload);
    if (changed) this.reload();
    return changed;
  }

  removeGuideAnnotation(id, roundIndex, annotationIndex) {
    const doc = this.doc("guide_rotations.json");
    if (!doc) return false;
    const index = this.guideRotationIndex(id);
    if (index === -1) return false;
    const path = ["rotations", index, "rounds", roundIndex, "annotations"];
    if (!doc.nodeAt([...path, annotationIndex])) return false;
    doc.removeAt(path, annotationIndex);
    // An empty list carries no information, so the key goes with its last note.
    const remaining = this.guideRotations()[index].rounds?.[roundIndex]?.annotations;
    if (Array.isArray(remaining) && remaining.length === 0) {
      doc.deleteProperty(["rotations", index, "rounds", roundIndex], "annotations");
    }
    this.reload();
    return true;
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
    if (card.frame === "ultimate" || card.frame === "normal") entry.frame = card.frame;
    if (guideCardSurface(card.surface)) entry.surface = card.surface;
    if (card.preferred) entry.preferred = true;
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
        label: typeof chart.label === "object" && chart.label !== null ? chart.label : String(chart.label || ""),
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
        label:
          typeof chart?.label === "object" && chart.label !== null
            ? chart.label
            : String(chart && chart.label ? chart.label : "").trim(),
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
    charts[chartIndex].label =
      typeof label === "object" && label !== null ? label : String(label || "").trim();
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

  /* ---- credits ---- */

  /** The credits list, always an array of plain objects. */
  creditEntries() {
    const value = this.value("credits.json");
    const list = value && Array.isArray(value.entries) ? value.entries : [];
    return list.filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry));
  }

  /** Replaces the whole list; used by every credit mutation below. */
  setCreditEntries(entries) {
    const doc = this.doc("credits.json");
    if (!doc) return false;
    const list = (Array.isArray(entries) ? entries : []).map((entry) => ({
      name: String(entry.name || ""),
      url: String(entry.url || ""),
      description: String(entry.description || ""),
    }));
    const changed = doc.nodeAt(["entries"])
      ? doc.set(["entries"], list)
      : doc.setProperty([], "entries", list);
    if (changed) this.reload();
    return changed;
  }

  addCredit() {
    return this.setCreditEntries([...this.creditEntries(), { name: "", url: "", description: "" }]);
  }

  /** Sets `name`, `url` or `description` on one entry. */
  setCreditField(index, field, value) {
    if (!["name", "url", "description"].includes(field)) return false;
    const entries = this.creditEntries().map((entry) => ({ ...entry }));
    if (!entries[index]) return false;
    entries[index][field] = String(value || "");
    return this.setCreditEntries(entries);
  }

  removeCredit(index) {
    const entries = this.creditEntries();
    if (!entries[index]) return false;
    return this.setCreditEntries(entries.filter((_, i) => i !== index));
  }

  moveCredit(from, to) {
    const entries = this.creditEntries();
    if (from === to || from < 0 || to < 0 || from >= entries.length || to >= entries.length) return false;
    const next = entries.slice();
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return this.setCreditEntries(next);
  }

  /* ---- i18n ---- */

  get i18nKeys() {
    const data = this.doc("i18n.json")?.value;
    if (!data) return [];
    const en = data.en || {};
    const cn = data.cn || {};
    const vi = data.vi || {};
    return Array.from(new Set([...Object.keys(en), ...Object.keys(cn), ...Object.keys(vi)])).sort();
  }

  i18nEntry(key) {
    const data = this.doc("i18n.json")?.value;
    if (!data) return { en: "", cn: "", vi: "" };
    return {
      en: data.en?.[key] ?? "",
      cn: data.cn?.[key] ?? "",
      vi: data.vi?.[key] ?? "",
    };
  }

  setI18nEntry(lang, key, value) {
    const doc = this.doc("i18n.json");
    if (!doc) return;
    const data = doc.value;
    const langObj = data?.[lang];
    if (!langObj) return;
    if (Object.prototype.hasOwnProperty.call(langObj, key)) {
      doc.set([lang, key], value);
    } else {
      doc.setProperty([lang], key, value);
    }
  }

  addI18nKey(key, values = { en: "", cn: "", vi: "" }) {
    const doc = this.doc("i18n.json");
    if (!doc) return;
    for (const lang of ["en", "cn", "vi"]) {
      doc.setProperty([lang], key, values[lang] ?? "");
    }
  }

  removeI18nKey(key) {
    const doc = this.doc("i18n.json");
    if (!doc) return;
    for (const lang of ["en", "cn", "vi"]) {
      doc.deleteProperty([lang], key);
    }
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
            if (!GUIDE_SLOT_TYPES.includes(type) && !LEGACY_SLOT_TAGS[type]) warn(`${slotLabel}: unknown type "${type}"`);
            const layout = guideSlotLayout(slot);
            for (const tag of guideSlotTags(slot)) {
              if (!GUIDE_SLOT_TAGS.some((entry) => entry.key === tag)) warn(`${slotLabel}: unknown tag "${tag}"`);
            }
            const cards = Array.isArray(slot.cards) ? slot.cards : [];
            const limit = layout === "double_or" || layout === "or3" ? 3 : layout === "or" ? 2 : 1;
            if (layout !== "text" && cards.length > limit) err(`${slotLabel}: a ${layout} slot holds at most ${limit} card(s)`);
            cards.forEach((card, ci) => {
              if (!card || typeof card !== "object") {
                err(`${slotLabel} card ${ci + 1}: expected an object`);
                return;
              }
              if (card.frame !== undefined && card.frame !== "ultimate" && card.frame !== "normal") {
                warn(`${slotLabel} card ${ci + 1}: unknown frame "${card.frame}"`);
              }
              if (card.surface !== undefined && !guideCardSurface(card.surface)) {
                warn(`${slotLabel} card ${ci + 1}: unknown surface "${card.surface}"`);
              }
              if (card.special) {
                const knownSpecial = GUIDE_OTHER_CARDS.some((entry) => entry.image === card.special);
                if (!String(card.special).startsWith("images/skills/") && !knownSpecial) {
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

          // A callout has to point at real slots, or it has nothing to underline.
          const annotations = Array.isArray(round.annotations) ? round.annotations : [];
          annotations.forEach((annotation, ai) => {
            const noteLabel = `${roundLabel} note ${ai + 1}`;
            if (!annotation || typeof annotation !== "object") {
              err(`${noteLabel}: expected an object`);
              return;
            }
            if (annotation.style !== undefined && !GUIDE_ANNOTATION_STYLES.includes(annotation.style)) {
              warn(`${noteLabel}: unknown style "${annotation.style}"`);
            }
            for (const key of ["from", "to"]) {
              const value = Number(annotation[key]);
              if (!Number.isInteger(value) || value < 0 || value >= slots.length) {
                err(`${noteLabel}: ${key} must be a slot index between 1 and ${Math.max(1, slots.length)}`);
              }
            }
            if (Number(annotation.from) > Number(annotation.to)) err(`${noteLabel}: from is after to`);
          });
        });

        // A round note points at rounds, so its ends have to exist.
        const roundNotes = Array.isArray(rotation.roundNotes) ? rotation.roundNotes : [];
        roundNotes.forEach((note, ni) => {
          const noteLabel = `${label} round note ${ni + 1}`;
          if (!note || typeof note !== "object") {
            err(`${noteLabel}: expected an object`);
            return;
          }
          if (note.style !== undefined && !GUIDE_ANNOTATION_STYLES.includes(note.style)) {
            warn(`${noteLabel}: unknown style "${note.style}"`);
          }
          for (const key of ["from", "to"]) {
            const value = Number(note[key]);
            if (!Number.isInteger(value) || value < 0 || value >= rounds.length) {
              err(`${noteLabel}: ${key} must be a round index between 1 and ${Math.max(1, rounds.length)}`);
            }
          }
          if (Number(note.from) > Number(note.to)) err(`${noteLabel}: from is after to`);
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
