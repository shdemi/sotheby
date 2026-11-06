/**
 * Sanity checks for the generated data. Run after `node scripts/sync/index.mjs`.
 *
 *   node scripts/sync/verify.mjs [dir]
 *
 * Every assertion below is a fact we verified by hand while building the pipeline;
 * if a game update breaks one, the pipeline needs a look before it is committed.
 */
import fs from "node:fs";
import path from "node:path";
import { OUT } from "./config.mjs";
import { readJson } from "./util.mjs";

const dir = process.argv[2] ? path.resolve(process.argv[2]) : OUT;
const read = (name) => readJson(path.join(dir, name));

let failures = 0;
const ok = (label, cond, detail = "") => {
  console.log(`${cond ? "ok  " : "FAIL"} ${label}${detail ? "  (" + detail + ")" : ""}`);
  if (!cond) failures++;
};

const rarity = read("characters_by_rarity.json");
const afflatus = read("characters_by_afflatus.json");
const psychubes = read("psychube_id.json");
const details = (() => {
  try {
    return readJson(path.join(OUT, "psychubes_data.json"));
  } catch {
    return null;
  }
})();
const future = read("future_sight.json");
const transfer = read("global_name_transfer.json");
const meta = read("_meta.json");

const flat = (obj) => Object.values(obj).flat();
const dups = (arr) => arr.filter((x, i) => arr.indexOf(x) !== i);

/** Every psychube as `{ key, rarity, id, row }`. */
const chubeEntries = Object.entries(psychubes).flatMap(([rarity, list]) =>
  list.map((row) => ({ key: `${rarity}:${row.id}`, rarity, id: String(row.id), row })),
);

// ---- characters -------------------------------------------------------------
const rarities = flat(rarity);
ok("rarity buckets are 2..6", Object.keys(rarity).every((k) => ["2", "3", "4", "5", "6"].includes(k)));
ok("no duplicate names in rarity", dups(rarities).length === 0, dups(rarities).join(","));
ok("no duplicate names in afflatus", dups(flat(afflatus)).length === 0, dups(flat(afflatus)).join(","));
ok("afflatus has no empty bucket", Object.values(afflatus).every((l) => l.length > 0));
ok("rarity and afflatus cover the same roster", rarities.length === flat(afflatus).length, `${rarities.length} vs ${flat(afflatus).length}`);

// ---- psychubes --------------------------------------------------------------
ok("psychube rarities are 5 and 6", Object.keys(psychubes).every((k) => k === "5" || k === "6"));
const chubes = flat(psychubes);
const ids = chubes.map((c) => String(c.id));
ok("psychube ids are unique", new Set(ids).size === ids.length);
ok("psychube keys are game ids (>= 1000)", chubes.every((c) => Number(c.id) >= 1000));
ok("psychube name + nameCN present", chubes.every((c) => c.name && c.nameCN));
ok("psychube tags are known labels", chubes.every((c) => c.tags.every((t) => ["ATK", "Critical", "Heal", "Survival", "Support"].includes(t))));
ok("psychube count is 6★+5★", chubes.length === (psychubes["6"]?.length || 0) + (psychubes["5"]?.length || 0));
ok(
  "every psychube has an icon file",
  chubeEntries.every((e) => fs.existsSync(path.join(OUT, "..", "images", "psychube_icon", e.rarity, `${e.id}.png`))),
  chubeEntries.filter((e) => !fs.existsSync(path.join(OUT, "..", "images", "psychube_icon", e.rarity, `${e.id}.png`))).map((e) => e.key).join(","),
);

if (details) {
  const missing = chubeEntries.filter((e) => !details[e.key]).map((e) => e.key);
  ok("psychubes_data covers psychube_id", missing.length === 0, missing.join(","));
  const detailRows = Object.entries(details).map(([key, row]) => ({ key, row }));
  ok("psychubes_data keys are `<rarity>:<gameId>`", detailRows.every(({ key, row }) => key === `${row.rarity}:${row.id}`));
  ok("psychubes_data has text in en/zh", detailRows.every(({ row }) => row.name && row.nameCN && row.descEn && row.descZh));
  ok("psychubes_data has vi text", detailRows.every(({ row }) => row.descVi));
  ok(
    "psychubes_data breakAttrs are 4 tiers or empty",
    detailRows.every(({ row }) => row.breakAttrs.length === 0 || row.breakAttrs.length === 4),
  );
  ok(
    "psychubes_data amplifications are 1..5 levels",
    detailRows.every(({ row }) => row.amplifications.length >= 1 && row.amplifications.length <= 5),
  );
}

// ---- future sight -----------------------------------------------------------
ok("future characters is a non-empty list", Array.isArray(future.Character) && future.Character.length > 0, String(future.Character.length));
const futureChubes = flat(future.Psychube);
ok("future psychubes are CN-only game ids", futureChubes.length === 7, futureChubes.join(","));
const knownKeys = new Set(ids);
ok("future psychubes exist in psychube_id", futureChubes.every((id) => knownKeys.has(id)));
ok("future skins are numeric strings", future.Skin.every((s) => /^\d+$/.test(s)));

// ---- misc -------------------------------------------------------------------
ok("global_name_transfer has no self-maps", Object.entries(transfer).every(([k, v]) => k !== v));
ok("_meta has both versions", !!meta.globalVersion && !!meta.cnVersion, `${meta.globalVersion} / ${meta.cnVersion}`);

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
