/**
 * Prune the committed image cache to what the site can actually load.
 *
 *   node scripts/sync/tools/prune-images.mjs            # report only
 *   node scripts/sync/tools/prune-images.mjs --delete   # remove dead files
 *
 * `images/` accumulated art from the retired Kornblume pipeline and full Myssal
 * dumps. Two rules decide what stays, both derived from the repo (never a hand
 * list of filenames):
 *
 *   1. Dead directory — a directory under `images/` whose path prefix
 *      (`images/<dir>/`) never occurs in any shipped text (app, editor, scripts,
 *      data/, content/). Every image path in the codebase names its folder
 *      literally and only interpolates the leaf (`images/skills/${icon}.png`),
 *      so a prefix that appears nowhere cannot be reached.
 *
 *   2. Generated cache — `images/items`, `images/psychube_icon`,
 *      `images/equip_defaulticon`, `images/headicon_small`, `images/skills` and
 *      `images/arcanists/euphoria` hold art keyed by game id. Their needed set
 *      comes from the same generated data `assets.mjs` reads, plus every literal
 *      reference found in the corpus; anything else in them is a stale download.
 *
 * Two directories are deliberately left whole:
 *   - `images/dungeon/` is stage art. `data/stages/*.json` references it and
 *     stage data is unfinished (AGENTS.md §10.1), so unused covers stay until
 *     Phase 6 rather than being re-downloaded.
 *   - `images/.git/` is a nested checkout and is never touched.
 *
 * This is a maintenance tool, not part of `npm run sync`: run it by hand when
 * the art sources change, then `npm run sync:assets --check` must still report
 * the same coverage.
 */
import fs from "node:fs";
import path from "node:path";
import { CONTENT, OUT, ROOT } from "../config.mjs";
import { readJson } from "../util.mjs";

const DELETE = process.argv.includes("--delete");
const IMG = path.join(ROOT, "images");

/* ------------------------------------------------------------------ *
 * Corpus: every shipped text that can name an image path
 * ------------------------------------------------------------------ */

const CORPUS_FILES = [
  "app.js", "index.html", "styles.css", "rotation-export.js", "serve.py",
  "AGENTS.md", "editor/README.md", "editor/index.html", "editor/editor.css",
  "editor/app.js", "editor/model.js", "editor/icons.js", "editor/files.js",
  "editor/json-patch.js", "editor/zip.js",
];

function walkFiles(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(p, out);
    else out.push(p);
  }
  return out;
}

function corpus() {
  const files = CORPUS_FILES.filter((f) => fs.existsSync(path.join(ROOT, f)))
    .map((f) => path.join(ROOT, f));

  for (const dir of ["editor/_test", "scripts", "data", "content"]) {
    const base = path.join(ROOT, dir);
    if (!fs.existsSync(base)) continue;
    for (const p of walkFiles(base, [])) {
      if (/\.(mjs|js|html|css|json|md|py)$/.test(p)) files.push(p);
    }
  }

  let text = "";
  for (const file of files) text += fs.readFileSync(file, "utf8") + "\n";
  return text;
}

const TEXT = corpus();

/** Every `images/...` path named literally in the corpus. */
function literalPaths() {
  const found = new Set();
  for (const m of TEXT.matchAll(/images\/[A-Za-z0-9_\-./ ]+\.(?:png|webp|woff2|woff|jpg|jpeg|svg|gif)/g)) {
    found.add(m[0]);
  }
  return found;
}
const LITERAL = literalPaths();

/* ------------------------------------------------------------------ *
 * Rule 2: needed set of the generated caches
 * ------------------------------------------------------------------ */

const rel = (p) => p.replace(/\\/g, "/");

/** items + currencies: icon and border exactly as `data/items.json` lists them. */
function itemNeeded() {
  const need = new Set();
  for (const item of readJson(path.join(OUT, "items.json"))) {
    if (item.icon) need.add(item.icon);
    if (item.border) need.add(item.border);
  }
  return need;
}

/** psychube icons, `<rarity>:<equip.id>` -> `images/psychube_icon/<rarity>/<id>.png`. */
function psychubeNeeded() {
  const need = new Set();
  for (const [rarity, list] of Object.entries(readJson(path.join(OUT, "psychube_id.json")))) {
    for (const entry of list) need.add(`images/psychube_icon/${rarity}/${entry.id}.png`);
  }
  for (const value of Object.values(readJson(path.join(OUT, "psychubes_data.json")))) {
    if (value && value.icon) need.add(value.icon);
  }
  return need;
}

/** Psychube detail art: one flat folder named by `data/psychube_id.json`. */
function psychubeDetailNeeded() {
  const need = new Set();
  for (const list of Object.values(readJson(path.join(OUT, "psychube_id.json")))) {
    for (const entry of list) need.add(`images/equip_defaulticon/${entry.id}.png`);
  }
  return need;
}

/** Character heads: one per ArcanistMap skin (the app skips ids over six digits). */
function headNeeded() {
  const need = new Set();
  for (const entry of readJson(path.join(OUT, "ArcanistMap.json"))) {
    for (const skin of entry.live2d || []) {
      const id = String(skin.id || "");
      if (id && id.length <= 6) need.add(`images/headicon_small/${id}.png`);
    }
  }
  return need;
}

/** Skill cards: guide_skills.json plus every icon the generated skills carry. */
function skillNeeded() {
  const need = new Set();
  for (const list of Object.values(readJson(path.join(CONTENT, "guide_skills.json")))) {
    for (const row of Array.isArray(list) ? list : []) if (row && row.icon) need.add(row.icon);
  }
  const walk = (value) => {
    if (typeof value === "string") {
      if (value.startsWith("images/skills/")) need.add(value);
    } else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") Object.values(value).forEach(walk);
  };
  walk(readJson(path.join(OUT, "character_skills.json")));
  return need;
}

/**
 * Euphoria portraits: `<mats.id>_<n>.webp`, where `n` is the tree's position in
 * `character_euphorias.json` (the app uses `index + 1`, not the tier id). The
 * mats file only lists the trees a player can buy, so a tree whose costs are not
 * in `content/progression_costs.json` (Ulrich 3107) has no tiers there and its
 * portrait would be reported stale even though the app loads it.
 */
function euphoriaNeeded() {
  const need = new Set();
  const mats = readJson(path.join(OUT, "characters_mats_required.json"));
  for (const [name, trees] of Object.entries(readJson(path.join(OUT, "character_euphorias.json")))) {
    const id = mats[name]?.id;
    if (!id) continue;
    for (let tier = 1; tier <= (Array.isArray(trees) ? trees.length : 0); tier += 1) {
      need.add(`images/arcanists/euphoria/${id}_${tier}.webp`);
    }
  }
  return need;
}

/**
 * Resonance shapes: `shape_patterns.json` is the whole tree. The folder names
 * ("Plus shape") only ever appear through a template (`${shape}`), so this
 * directory needs its own rule rather than the literal-prefix one.
 */
function shapeNeeded() {
  const need = new Set();
  for (const [shape, patterns] of Object.entries(readJson(path.join(OUT, "shape_patterns.json")))) {
    for (const pattern of patterns) need.add(`images/shape_pattern/${shape}/${pattern}.png`);
  }
  return need;
}

/**
 * Planner (event shop) art. Its rows are usually *not* in `data/items.json` —
 * event-only packs, a 4★ EXP psychube, the event currency itself — yet the icons
 * land in `images/items/icon` and `images/psychube_icon`, so both caches have to
 * count them or a prune would delete art the Planner prints.
 */
function eventShopNeeded() {
  const need = new Set();
  let plan = { shops: [] };
  try {
    plan = readJson(path.join(OUT, "event_shop.json"));
  } catch {
    return need;
  }
  for (const shop of plan.shops || []) {
    if (shop.money?.icon) need.add(shop.money.icon);
    for (const group of shop.groups || []) {
      for (const item of group.items || []) if (item.icon) need.add(item.icon);
    }
  }
  return need;
}

const CACHES = [
  { dir: "images/items", needed: () => new Set([...itemNeeded(), ...eventShopNeeded()]) },
  { dir: "images/psychube_icon", needed: () => new Set([...psychubeNeeded(), ...eventShopNeeded()]) },
  { dir: "images/equip_defaulticon", needed: psychubeDetailNeeded },
  { dir: "images/headicon_small", needed: headNeeded },
  { dir: "images/skills", needed: skillNeeded },
  { dir: "images/arcanists/euphoria", needed: euphoriaNeeded },
  { dir: "images/shape_pattern", needed: shapeNeeded },
];

/* ------------------------------------------------------------------ *
 * Compare against disk
 * ------------------------------------------------------------------ */

const PROTECTED = ["images/.git", "images/dungeon"];

const files = walkFiles(IMG, []).map((p) => rel(path.relative(ROOT, p)));
const under = (prefix, p) => p === prefix || p.startsWith(prefix + "/");
const isProtected = (p) => PROTECTED.some((prefix) => under(prefix, p));

// Rule 1: directories whose prefix appears nowhere in the corpus. Cache dirs and
// protected trees are decided elsewhere, so they are skipped here.
const cacheDirs = CACHES.map((cache) => cache.dir);
const isCache = (p) => cacheDirs.some((dir) => under(dir, p));
const dirs = new Set();
for (const file of files) {
  const parts = file.split("/");
  for (let i = 2; i < parts.length; i++) dirs.add(parts.slice(0, i).join("/"));
}
const deadDirs = [...dirs].filter(
  (dir) => !isCache(dir) && !PROTECTED.some((prefix) => under(prefix, dir)) && !TEXT.includes(dir + "/")
);

// Rule 2: generated caches, pruned to their needed set plus literal references.
const dead = new Map(); // rel path -> reason
const needOf = new Map(); // cache dir -> Set of needed paths
for (const { dir, needed } of CACHES) {
  needOf.set(dir, new Set([...needed(), ...[...LITERAL].filter((p) => p.startsWith(dir + "/"))]));
}
for (const file of files) {
  if (isProtected(file)) continue;
  if (deadDirs.some((dir) => under(dir, file))) {
    dead.set(file, "dead directory");
  }
}
for (const { dir } of CACHES) {
  const need = needOf.get(dir);
  for (const file of files) {
    if (isProtected(file) || dead.has(file)) continue;
    if (!file.startsWith(dir + "/")) continue;
    if (!need.has(file)) dead.set(file, `stale in ${dir}`);
  }
}

// Safety: a needed path must never be marked dead.
for (const [dir, need] of needOf) {
  for (const p of need) {
    if (dead.has(p)) throw new Error(`refusing to prune a needed file: ${p} (${dir})`);
  }
}

/* ------------------------------------------------------------------ *
 * Report
 * ------------------------------------------------------------------ */

const size = (p) => fs.statSync(path.join(ROOT, p)).size;
const mb = (bytes) => (bytes / 1048576).toFixed(2);

console.log(`corpus: ${LITERAL.size} literal image paths`);
console.log(`dead directories: ${deadDirs.length ? deadDirs.join(", ") : "(none)"}`);

const byReason = new Map();
for (const [file, reason] of dead) {
  if (!byReason.has(reason)) byReason.set(reason, { files: 0, bytes: 0, sample: [] });
  const row = byReason.get(reason);
  row.files++;
  row.bytes += size(file);
  if (row.sample.length < 3) row.sample.push(file);
}
console.log("");
for (const [reason, row] of [...byReason].sort((a, b) => b[1].bytes - a[1].bytes)) {
  console.log(`${String(row.files).padStart(5)} files  ${mb(row.bytes).padStart(8)} MB  ${reason}`);
  console.log(`            e.g. ${row.sample.join(", ")}`);
}

const totalFiles = files.length;
const totalBytes = files.reduce((sum, f) => sum + size(f), 0);
const deadBytes = [...dead.keys()].reduce((sum, f) => sum + size(f), 0);

const missing = [...new Set([...needOf.values()].flatMap((set) => [...set]))]
  .filter((p) => !fs.existsSync(path.join(ROOT, p)))
  .sort();
console.log(`\nneeded but absent (${missing.length}): ${missing.length ? missing.join(", ") : "(none)"}`);
console.log(
  `\ntotal: ${totalFiles} files / ${mb(totalBytes)} MB -> keep ${totalFiles - dead.size} / ${mb(totalBytes - deadBytes)} MB`
);

if (!DELETE) {
  console.log("\n(report only; re-run with --delete to remove)");
} else {
  for (const file of dead.keys()) fs.unlinkSync(path.join(ROOT, file));
  // Drop directories the prune emptied, deepest first.
  const dirsOnDisk = [...dirs].sort((a, b) => b.length - a.length);
  for (const dir of dirsOnDisk) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) continue;
    if (fs.readdirSync(abs).length === 0) fs.rmdirSync(abs);
  }
  console.log(`\nremoved ${dead.size} files (${mb(deadBytes)} MB)`);
}
