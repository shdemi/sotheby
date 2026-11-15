/**
 * Banner history snapshot — the **only** thing that knows when a banner ran.
 *
 * The game tables (`summon_pool`, `summon.json`, …) describe a banner's
 * contents and its pity rules, but they carry **no dates**: banner windows are
 * server-side, so the client never sees them. The community-maintained
 * *Banner History* spreadsheet is therefore the one source for `start`/`end`,
 * and this script freezes it into `data/banner_history.json` so:
 *
 *   - `npm run sync` stays offline and reproducible (it reads the snapshot,
 *     never the network — the same contract `data/promo_codes.json` has, §12);
 *   - a spreadsheet edit cannot silently change what the app ships without a
 *     commit;
 *   - the file is rewritten only when the rows actually changed.
 *
 *   npm run sync:banners            # fetch, normalise, write if changed
 *   npm run sync:banners -- --check # report only, never write
 *
 * ## The sheet's shape (and why the parser looks like this)
 *
 * `pub?output=csv` gives 13 columns: the **CN block** at 0..5, a shared
 * `Version` column at 6, and the **GLB block** at 7..12. The two blocks are
 * independent — they only share a row by coincidence — but the version cell is a
 * merged cell spanning a patch block, so each block reads its own half of it
 * (`parseVersionCell()`). It is the patch label the Calculator prints in front of
 * a banner's name (`[3.9] Cognitive Dynamics`), which is why it is kept.
 *
 * A row is kept when it names a banner. The sheet also carries:
 *   - `-` placeholders (an empty slot in the schedule),
 *   - `Rerun` rows with no name (a rerun whose character was not announced yet),
 *   - hand-typed dates that are simply wrong (a `1/9/23` inside the 12/2023
 *     block, a `11/9/24` between 2023 rows).
 * Nothing here repairs those: a wrong date stays wrong and is visible in the
 * app, which is better than a silently guessed one. Unparseable dates become
 * `null` and the banner is kept, exactly like an unreadable promo-code expiry
 * (§12).
 */
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../sync/config.mjs";
import { writeJson } from "../sync/util.mjs";

const SHEET_ID = "2PACX-1vSZ_xS_5dfuvV7-yfitOqCw7e8VVkqtfWCAkcFpXLYTvx7XXR7lg2e1wjTLBZJJAleeEKm-f1Y7gNI_";
const CSV_URL = `https://docs.google.com/spreadsheets/d/e/${SHEET_ID}/pub?output=csv`;
const OUT_FILE = path.join(ROOT, "data", "banner_history.json");

/** The published-doc URL, quoted in the file and on the app's About/credits. */
export const SOURCE_URL = `https://docs.google.com/spreadsheets/d/e/${SHEET_ID}/pubhtml`;

/** RFC 4180 CSV reader: quoted fields, embedded newlines, doubled quotes. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  let i = 0;
  const src = String(text || "").replace(/^\uFEFF/, "");
  while (i < src.length) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (ch === "\r") {
      i += 1;
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const asText = (value) =>
  String(value === undefined || value === null ? "" : value)
    .replace(/[\u00a0\u2000-\u200b\u3000]/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();

/**
 * `M/D/YY` -> `YYYY-MM-DD`. The sheet is US-formatted throughout (`11/5/26` is
 * 5 November, not 3 May — the surrounding schedule proves it), so the first
 * component is the month. Anything else (`-`, `None`, an impossible date) is
 * `null` rather than a guess.
 */
export function parseSheetDate(value) {
  const str = asText(value);
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(str);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  let year = Number(match[3]);
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2023 || year > 2100) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  // Reject a day that rolled over (2/30 -> 3/2): the sheet has no such dates.
  if (date.getUTCMonth() !== month - 1) return null;
  return date.toISOString().slice(0, 10);
}

/**
 * The `Rate-Up 5*` cell doubles as the banner's rules note. A note (rather than
 * names) is anything that explains pity instead of listing characters — the
 * sheet's own wording for it, and the only place the "choose 3, every 6* is one
 * of them" / "only 6* is a Thread" rules are written down.
 */
function splitFiveStarCell(value) {
  const text = String(value || "").replace(/\r/g, "");
  const cleaned = asText(text);
  if (!cleaned || cleaned === "-" || cleaned.toLowerCase() === "none") {
    return { fiveStar: [], note: "" };
  }
  if (/pity explained/i.test(cleaned) || /^no rate-up/i.test(cleaned)) {
    return { fiveStar: [], note: cleaned };
  }
  // Names arrive one per line (and sometimes as "A + B").
  const names = cleaned
    .split(/\n+/)
    .map((line) => asText(line))
    .filter(Boolean);
  return { fiveStar: names, note: "" };
}

/** `Choose 1:\nA, B, C` -> "A, B, C" so the app can print it as prose. */
function flattenChooser(value) {
  return asText(String(value || "").replace(/\r/g, "")).replace(/^choose\s*\d+\s*:\s*/i, "");
}

/**
 * The `Version` cell -> `{ cn, global }`.
 *
 * The cell labels the **content** of the patch block it sits on, and the sheet writes
 * it three ways:
 *
 *   `4.1`                         one label; both blocks ship that patch
 *   `3.8 (CN) / 3.7 (GLB)`        each server is on a different version
 *   `AH Collab (CN) / 3.8 (GLB)`  a collab patch has no number at all
 *
 * An empty cell is `null` (the caller forward-fills: it is a merged cell).
 */
export function parseVersionCell(value) {
  // The cell is multi-line (`"AH\nCollab\n(CN)\n\n3.8\n(GLB)"`), so it is flattened
  // to one line before the tags are read.
  const text = String(value || "")
    .replace(/[\u00a0\u2000-\u200b\u3000]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  const both = /^(.*?)\s*\(CN\)\s*(.*?)\s*\(GLB\)$/i.exec(text);
  if (both) return { cn: asText(both[1]), global: asText(both[2]) };
  const cnOnly = /^(.*?)\s*\(CN\)$/i.exec(text);
  if (cnOnly) return { cn: asText(cnOnly[1]), global: "" };
  const globalOnly = /^(.*?)\s*\(GLB\)$/i.exec(text);
  if (globalOnly) return { cn: "", global: asText(globalOnly[1]) };
  return { cn: text, global: text };
}

/**
 * Column 6 per sheet row -> `{ cn, global }` with the merged cell forward-filled, so
 * every banner row can ask for its own block's version.
 */
function readVersions(rows) {
  const out = [];
  let current = { cn: "", global: "" };
  // Rows 0 and 1 are the two header lines (`… | Version | …`), not a version.
  for (let r = 2; r < rows.length; r += 1) {
    const parsed = parseVersionCell((rows[r] || [])[6]);
    if (parsed) {
      current = { cn: parsed.cn || current.cn, global: parsed.global || current.global };
    }
    out[r] = current;
  }
  return out;
}

/**
 * One block of the sheet (`offset` 0 for CN, 7 for GLB) -> banner rows.
 * Rows whose name is a placeholder are dropped; a nameless `Rerun` is dropped
 * too, because a banner with no identity can never be joined to a pool.
 */
function readBlock(rows, offset, server, versions) {
  const out = [];
  for (let r = 2; r < rows.length; r += 1) {
    const row = rows[r] || [];
    const type = asText(row[offset]);
    const name = asText(row[offset + 1]);
    if (!name || name === "-") continue;
    const five = splitFiveStarCell(row[offset + 3]);
    out.push({
      server,
      type: type && type !== "-" ? type : "",
      name,
      version: (versions[r] && versions[r][server]) || "",
      rateUp6: flattenChooser(row[offset + 2]),
      rateUp5: five.fiveStar,
      note: five.note,
      start: parseSheetDate(row[offset + 4]),
      end: parseSheetDate(row[offset + 5]),
    });
  }
  return out;
}

/** Sheet CSV -> the committed snapshot shape. */
export function normalise(text) {
  const rows = parseCsv(text);
  const versions = readVersions(rows);
  const cn = readBlock(rows, 0, "cn", versions);
  const global = readBlock(rows, 7, "global", versions);

  // The sheet repeats a banner across patch blocks; keep the first sighting of
  // an identical (server, name, start) so the app never draws the same run twice.
  const seen = new Set();
  const dedupe = (list) =>
    list.filter((row) => {
      const key = `${row.server}|${row.name.toLowerCase()}|${row.start || ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return { cn: dedupe(cn), global: dedupe(global) };
}

async function fetchCsv() {
  const res = await fetch(CSV_URL, {
    headers: { "user-agent": "sothebymansion-banner-snapshot/1.0" },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return res.text();
}

async function main() {
  const checkOnly = process.argv.includes("--check");
  let raw;
  try {
    raw = await fetchCsv();
  } catch (err) {
    console.error(`banners: fetch failed (${err.message})`);
    process.exitCode = 1;
    return;
  }
  const parsed = normalise(raw);
  const snapshot = {
    source: SOURCE_URL,
    fetchedAt: new Date().toISOString(),
    global: parsed.global,
    cn: parsed.cn,
  };

  let previous = null;
  try {
    previous = JSON.parse(fs.readFileSync(OUT_FILE, "utf8"));
  } catch {
    previous = null;
  }
  const same =
    previous &&
    JSON.stringify(previous.global) === JSON.stringify(snapshot.global) &&
    JSON.stringify(previous.cn) === JSON.stringify(snapshot.cn);

  console.log(
    `banners: ${snapshot.global.length} global, ${snapshot.cn.length} cn (${checkOnly ? "check" : "write"})`
  );
  if (same) {
    console.log("  unchanged, not rewritten");
    return;
  }
  if (checkOnly) {
    console.log("  would rewrite data/banner_history.json");
    return;
  }
  // Keep the old `fetchedAt` when the rows are unchanged; a rewrite means the
  // sheet moved, so the new stamp is the honest one.
  writeJson(OUT_FILE, snapshot);
  console.log("  wrote data/banner_history.json");
}

if (process.argv[1] && process.argv[1].endsWith("snapshot.mjs")) {
  main();
}
