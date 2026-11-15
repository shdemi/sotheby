/**
 * `banners.json` + `gacha_rules.json` — everything the Planner's **Calculator**
 * tab needs to answer "how many pulls can I afford by banner X, and what are my
 * odds of P0…P5?" (AGENTS.md §15).
 *
 * Two joins happen here:
 *
 *   1. **Sheet → pool.** `data/banner_history.json` (the frozen community
 *      spreadsheet, produced by `npm run sync:banners`) knows *when* a banner
 *      ran; `summon_pool.json` knows *what* was on it. They share a name and
 *      nothing else — the game tables carry no dates at all — so the join
 *      normalises the banner name (case, accents, punctuation, NBSP, tabs) and
 *      consults `maps/banner-aliases.json` for the handful of names the sheet
 *      spells differently (`Into the Mirrors` is `Observation into the Mirrors`
 *      in the tables).
 *
 *   2. **Pool → rate-up hero.** `upWeight` is `"<6★ ids>|<5★ ids>"`. The 6★
 *      side is who the banner advertises: one id means a real rate-up (the
 *      character whose P0…P5 the tab reports), several ids mean a "choose one of
 *      these N" selector, where the reader picks one and every 6★ is one of them.
 *
 * ## Rules are per banner, not per game
 *
 * Every pull costs 1 Unilog and the pity curve is the same everywhere, but *who
 * the 6★ is* is not: a Debut banner is a 50/50, `Revelation of the Water` is
 * 70/30, `Boon of the Water` guarantees the 6★ is one of three, a Thread banner
 * hands out one Thread and nothing else. The spreadsheet writes those rules into
 * its `Rate-Up 5★` cell as prose ("Pity Explained: …"), which `banner_history`
 * keeps as `note`; `maps/gacha.json` is the hand-written translation of that
 * prose into numbers (`kind`, `share`, `freePulls`, …) because no game table
 * states them.
 *
 * A banner whose type and name have no rule ships `kind: "none"` — the tab then
 * says it cannot price the odds instead of inventing a rate.
 */
import fs from "node:fs";
import path from "node:path";
import { MAPS, ROOT } from "../config.mjs";
import { indexBy, language, lookup, table } from "../sources.mjs";
import { readJson } from "../util.mjs";

const HISTORY_FILE = path.join(ROOT, "data", "banner_history.json");

/**
 * Banner kinds that **always** reach Global — Debuts, Limiteds, Events, Ripples,
 * Collabs and Yearning pools are all scheduled content, so a CN-only run of one of
 * these kinds is a Global banner that has not been announced yet. Only a **Rerun**
 * is excluded: a CN rerun is the same banner coming back on a calendar Global has
 * already spent, so Global gets no second run of it. (Standard and Beginner are
 * never offered at all — see `CALC_SKIP_TYPES` in `app.js`.)
 */
const PREDICTED_TYPES = new Set(["Debut", "Limited", "Event", "Ripples", "Collab", "Yearning"]);
/** How many of the newest CN→Global pairs the lag median is taken over. */
const LAG_SAMPLE = 20;
/** Used only if the sheet has no matched pair at all (it always does). */
const LAG_FALLBACK = 84;
/**
 * How far a Global run may sit from `cnStart + lag` and still be considered the run
 * the CN banner became. Half a patch (see `patchDays`), because a recurring banner
 * (Ripples on the Water, Boon of the Water) opens again every 42 days: a whole patch
 * of tolerance lets one Global run absorb two consecutive CN runs and the newest copy
 * of the banner goes missing.
 */
export const MATCH_TOLERANCE_DAYS = 21;

/** Sheet rows that resolved to no pool; reported by `sync:verify`. */
const unresolved = [];
/** Sheet rate-up names that resolved to no hero; reported by `sync:verify`. */
const unresolvedHeroes = [];

/**
 * Banner names, normalised for matching: case-folded, accents stripped,
 * punctuation and runs of whitespace collapsed. The sheet and the game tables
 * disagree on `&`, `：`, `’`, NBSP and tabs, never on wording.
 */
export function normName(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u00a0\u2000-\u200b\u3000]/g, " ")
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const asText = (value) =>
  String(value === undefined || value === null ? "" : value)
    .replace(/[\u00a0\u2000-\u200b\u3000]/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();

/** `2026-11-05` + 84 -> `2027-01-28`. Pure UTC arithmetic, no local time zone. */
export function addDays(iso, days) {
  const [y, m, d] = String(iso).split("-").map(Number);
  const at = Date.UTC(y, m - 1, d) + Math.round(Number(days) || 0) * 86400000;
  const date = new Date(at);
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Whole days from `a` to `b` (negative when `b` is earlier). */
export function dayGap(a, b) {
  const at = (iso) => {
    const [y, m, d] = String(iso).split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((at(b) - at(a)) / 86400000);
}

function shipped(relPath) {
  if (!relPath) return false;
  return fs.existsSync(path.join(ROOT, ...relPath.split("/")));
}

/**
 * `upWeight` -> `{ sixStar: [...], fiveStar: [...] }`.
 * `"3025|3011#3010"` = Regulus is the 6★ rate-up, two 5★s;
 * `"3007#3039#3048#3062"` = no single rate-up, four 6★s to choose from.
 */
export function parseUpWeight(value) {
  const str = String(value || "").trim();
  if (!str) return { sixStar: [], fiveStar: [] };
  const [head, tail] = str.split("|");
  const ids = (part) =>
    String(part || "")
      .split("#")
      .map((id) => Number(id))
      .filter((id) => Number.isFinite(id) && id > 0);
  if (tail === undefined) return { sixStar: ids(head), fiveStar: [] };
  return { sixStar: ids(head), fiveStar: ids(tail) };
}

/** `<initWeight>` -> the weight map `{ 5: 150, 4: 850, … }` (the 6★ is id 5). */
function parseWeights(value) {
  const out = {};
  for (const part of String(value || "").split("|")) {
    const [id, weight] = part.split("#");
    const key = Number(id);
    const num = Number(weight);
    if (Number.isFinite(key) && Number.isFinite(num)) out[key] = num;
  }
  return out;
}

/**
 * The pity curve and the pull price, read out of the pools that actually define
 * them. 244 of the 250 pools share `5#150…` / `60|70` / `5#500`; the outliers are
 * the beginner banners (`5#75|…`, `30|40`), which the Calculator does not price.
 *
 * `initWeight` totals 10,000, so the 6★ weight *is* the rate in basis points and
 * `changeWeight`'s `5#500` is the soft-pity rate: 1.5% before pull 61, 5% from
 * pull 61 through 69, guaranteed on 70.
 */
export function readPoolRules(pools) {
  const tally = new Map();
  for (const pool of pools) {
    const key = [pool.initWeight, pool.awardTime, pool.changeWeight].join("|");
    tally.set(key, (tally.get(key) || 0) + 1);
  }
  const [winner] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0] || ["", 0];
  const sample =
    pools.find((pool) => [pool.initWeight, pool.awardTime, pool.changeWeight].join("|") === winner) ||
    pools[0] ||
    {};

  const weights = parseWeights(sample.initWeight);
  const total = Object.values(weights).reduce((sum, n) => sum + n, 0) || 1;
  const softWeights = parseWeights(sample.changeWeight);
  const [soft, hard] = String(sample.awardTime || "")
    .split("|")
    .map((n) => Number(n) || 0);

  // `cost1` is `type#id#qty`: one pull costs 1 Unilog (item 140001).
  const [, costId, costQty] = String(sample.cost1 || "").split("#");

  return {
    weights,
    total,
    sixStarRate: (weights[5] || 0) / total,
    fiveStarRate: (weights[4] || 0) / total,
    softPityStart: soft,
    hardPity: hard,
    softPityRate: (softWeights[5] || 0) / total,
    cost: { itemId: String(costId || ""), amount: Number(costQty) || 1 },
  };
}

/** `rare` -> the rarity the UI prints (a 6★ is `rare: 5`). */
const rarityOf = (rare) => Number(rare) + 1;

/**
 * Sheet placeholders that name no character. The sheet also writes a sentence
 * instead of names ("Choose 1 Standard Banner character"), which yields nothing.
 */
const NO_HERO = /^(none|n\/a|-)$/i;

/**
 * `"Choose 1:\nUlrich, Shamane, 37"` -> `["Ulrich", "Shamane", "37"]`. The sheet
 * lists rate-up characters one per line or comma-separated.
 */
export function splitHeroNames(value) {
  return String(value || "")
    .replace(/^choose\s*\d+\s*:?\s*/i, "")
    .split(/[,\n]/)
    .map((part) => asText(part))
    .filter(
      (part) =>
        part && !NO_HERO.test(part) && !/^choose\b/i.test(part) && !/character/i.test(part)
    );
}

/**
 * Hero ids and names -> `{ id, name, nameZh, icon, rarity }`. Names resolve
 * through the roster index (`resolveByName`), ids through the character table.
 *
 * `name` is the **canonical roster key** the rest of the app uses, not the game's
 * label: `ArcanistMap` ships `Six` / `Thirty-seven` / `Ezra Theodore`, and
 * `global_name_transfer.json` maps those onto the roster keys.
 */
function heroIndex(arcanistRows, transfer) {
  const chars = indexBy(table("global", "character"), "id");
  const arcanists = new Map(arcanistRows.map((entry) => [Number(entry.id), entry]));
  const heroAliases = readJson(path.join(MAPS, "hero-aliases.json")) || {};

  const describe = (id) => {
    const row = chars.get(id);
    const arcanist = arcanists.get(id);
    const gameName = arcanist ? asText(arcanist.nameEng) : "";
    if (!row && !gameName) return null;
    const canonical = asText(transfer[gameName]) || asText(row?.nameEng) || gameName;
    const nameZh = asText(lookup("zh", row ? row.name : "").value) || asText(arcanist?.name || "");
    // The default skin is the first skin `ArcanistMap` lists for the arcanist;
    // the `<heroId>01` convention is the fallback.
    const skinId = Number(arcanist?.live2d?.[0]?.id) || 0;
    const icon =
      [`images/headicon_small/${skinId}.png`, `images/headicon_small/${id}01.png`].find(shipped) || "";
    return {
      id,
      name: canonical || String(id),
      nameZh,
      icon,
      rarity: row ? rarityOf(row.rare) : 6,
    };
  };

  // Every spelling a hero answers to -> his entry. `describe()` is memoised so a
  // hero looked up by name and by id is the same object.
  const memo = new Map();
  const byId = (id) => {
    const key = Number(id);
    if (!memo.has(key)) memo.set(key, describe(key));
    return memo.get(key);
  };

  const byName = new Map();
  const register = (key, id) => {
    const norm = normName(key);
    if (!norm || byName.has(norm)) return;
    byName.set(norm, Number(id));
  };
  for (const arcanist of arcanistRows) {
    register(arcanist.nameEng, arcanist.id);
    register(transfer[asText(arcanist.nameEng)], arcanist.id);
  }
  for (const [alias, target] of Object.entries(heroAliases)) {
    if (alias.startsWith("_")) continue;
    const id = byName.get(normName(target));
    if (id) register(alias, id);
  }

  return {
    byId,
    byName: (name) => {
      const id = byName.get(normName(name));
      return id ? byId(id) : null;
    },
  };
}

/** Pools grouped by every name they answer to, so a rerun shares its debut's row. */
function poolIndex(pools) {
  const en = language("en");
  const map = new Map();
  for (const pool of pools) {
    const keys = new Set([normName(pool.nameEn)]);
    const localized = en.get(String(pool.nameCn || ""));
    if (localized) keys.add(normName(localized));
    for (const key of keys) {
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(pool);
    }
  }
  return map;
}

/**
 * Every pool registered under one name should describe the same 6★ reward — a
 * rerun repeats the character it reruns. Where they disagree the oldest pool wins
 * and the row is flagged, so `sync:verify` prints it instead of the app quietly
 * picking one.
 */
function resolvePool(candidates) {
  if (!candidates || !candidates.length) return null;
  const six = candidates.map((pool) => parseUpWeight(pool.upWeight).sixStar.join("#"));
  const same = six.every((ids) => ids === six[0]);
  const pool = [...candidates].sort((a, b) => Number(a.id) - Number(b.id))[0];
  return { pool, ambiguous: !same };
}

/**
 * Everything a rule carries unless its type or its banner row says otherwise.
 * `guarantee` is deliberately absent: it is inferred below, because a `rateUp`
 * banner guarantees the 6★ that follows a lost 50/50 *unless* it opts out.
 */
const DEFAULTS = {
  kind: "none",
  share: 0.5,
  choose: 0,
  separatePity: false,
  freePulls: 0,
  discountFirst10: 0,
  maxPulls: 0,
  track: "solo",
  selectFirstSix: false,
};

/** A map entry is either a bare kind (`"rateUp"`) or a full rule object. */
function asRule(entry) {
  if (!entry) return null;
  return typeof entry === "string" ? { kind: entry } : { ...entry };
}

/**
 * A banner's rule: the **type** rule (`Debut`, `Rerun`, `Ripples`, …) is the base
 * and the **banner** rule (exact spreadsheet name) is merged on top, so an outlier
 * keeps everything its type implies — its pity track, its free pulls, its ten-pull
 * discount — and only overrides what it actually changes. A `rateUp` rule always
 * guarantees the rate-up on the 6★ that follows a lost 50/50 unless it says
 * otherwise, which is what every non-selector banner in the sheet does.
 */
function makeRule(config, type, name) {
  const merged = {
    ...DEFAULTS,
    ...(asRule((config.byType || {})[type]) || {}),
    ...(asRule((config.byBanner || {})[name]) || {}),
  };
  merged.kind = merged.kind || DEFAULTS.kind;
  if (merged.guarantee === undefined) merged.guarantee = merged.kind === "rateUp";
  return merged;
}

/**
 * **How late Global is behind CN**, in whole days.
 *
 * The two servers run the same banners on different dates, so a banner name that
 * appears on both sides is a natural experiment: the gap between the two debuts is
 * how long Global waited. Early Global lagged by years and the 2025 stretch by
 * ~120 days, so only the newest `LAG_SAMPLE` pairs count — those cluster at 84
 * days, i.e. exactly two 42-day patches.
 *
 * A pair is the **first** run of a name on each server (a rerun repeats its
 * debut's gap, which would double-count the banner). Same-day pairs are skipped:
 * a Global-first banner (a collab) says nothing about CN lead time.
 */
export function globalLag(rows) {
  const first = new Map();
  for (const row of rows) {
    if (!row.start) continue;
    const key = normName(row.name);
    if (!key) continue;
    const slot = first.get(key) || {};
    if (!slot[row.server] || row.start < slot[row.server]) slot[row.server] = row.start;
    first.set(key, slot);
  }
  const pairs = [];
  for (const slot of first.values()) {
    if (!slot.global || !slot.cn) continue;
    const lag = dayGap(slot.cn, slot.global);
    if (lag > 0) pairs.push({ global: slot.global, lag });
  }
  pairs.sort((a, b) => (a.global < b.global ? -1 : a.global > b.global ? 1 : 0));
  const recent = pairs.slice(-LAG_SAMPLE).map((pair) => pair.lag).sort((a, b) => a - b);
  if (!recent.length) return LAG_FALLBACK;
  return recent[Math.floor(recent.length / 2)];
}

/**
 * **Which CN runs Global has not scheduled yet.**
 *
 * A banner recurs — Ripples on the Water opens again every patch, a Limited run comes
 * back every rerun — so neither "this name never ran on Global" nor "compare a CN run
 * with *every* Global run of its name" is the right test: the second one lets a single
 * Global run absorb two consecutive CN runs, and the next patch's copy of the banner
 * then silently disappears (that is how Ripples on the Water for 4.0 went missing).
 *
 * The runs are therefore paired **one to one**. Walking the CN runs newest first, each
 * claims the nearest still-unclaimed Global run of the same name within
 * `MATCH_TOLERANCE_DAYS` of `cnStart + lag`, and may only claim one older than the run
 * the *newer* CN banner claimed (the calendar is monotone). Whatever is left over is a
 * banner Global has not listed yet — the prediction list.
 */
export function unmatchedCnRuns(rows, lag) {
  const byName = new Map();
  for (const row of rows) {
    if (!row.start) continue;
    const key = normName(row.name);
    if (!key) continue;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(row);
  }
  const newestFirst = (a, b) => (a.start < b.start ? 1 : a.start > b.start ? -1 : 0);
  const out = [];
  for (const group of byName.values()) {
    const cn = group.filter((row) => row.server === "cn").sort(newestFirst);
    if (!cn.length) continue;
    const global = group.filter((row) => row.server === "global").sort(newestFirst);
    const claimed = new Set();
    let floor = ""; // the start of the newest Global run already claimed
    for (const row of cn) {
      const target = addDays(row.start, lag);
      let best = null;
      for (const candidate of global) {
        if (claimed.has(candidate)) continue;
        if (floor && !(candidate.start < floor)) continue;
        const gap = Math.abs(dayGap(target, candidate.start));
        if (gap > MATCH_TOLERANCE_DAYS) continue;
        if (!best || gap < best.gap) best = { candidate, gap };
      }
      if (best) {
        claimed.add(best.candidate);
        floor = best.candidate.start;
      } else {
        out.push(row);
      }
    }
  }
  return out;
}

/**
 * The patch length the Calculator's ledger declares (`calc-income.json` → `patch.days`,
 * 42). Used to tell one Limited banner from the next one's patch; `sync:verify` pins the
 * ledger constant, so this never drifts from the schedule's own grid.
 */
function sheetPatchDays() {
  try {
    const income = readJson(path.join(MAPS, "calc-income.json")) || {};
    return Number((income.patch || {}).days) || 0;
  } catch {
    return 0;
  }
}

export function bannerData({ config, arcanists, transfer } = {}) {
  const gachaConfig = config || readJson(path.join(MAPS, "gacha.json"));
  const raw = readJson(HISTORY_FILE);
  const aliases = readJson(path.join(MAPS, "banner-aliases.json")) || {};
  const hero = heroIndex(
    arcanists || readJson(path.join(ROOT, "data", "ArcanistMap.json")) || [],
    transfer || readJson(path.join(ROOT, "data", "global_name_transfer.json")) || {}
  );

  // A CN banner runs on a CN pool; a global banner on a global one. The CN table
  // is a subset, so a CN row falls back to the global table before giving up.
  const pools = {
    global: poolIndex(table("global", "summon_pool")),
    cn: poolIndex(table("cn", "summon_pool")),
  };
  const findPools = (key, server) =>
    server === "cn" ? pools.cn.get(key) || pools.global.get(key) : pools.global.get(key);

  const rows = [];
  for (const server of ["global", "cn"]) {
    for (const entry of raw[server] || []) {
      const key = normName(entry.name);
      const aliasTarget = aliases[key];
      const resolved = resolvePool(findPools(aliasTarget ? normName(aliasTarget) : key, server));
      if (!resolved) {
        unresolved.push(`${server}: ${entry.name}`);
        continue;
      }
      const { pool, ambiguous } = resolved;
      const weight = parseUpWeight(pool.upWeight);
      // The spreadsheet names the rate-up of **this run**; the pool only names the
      // rate-up of the banner, and the rotating ones (`Yearning of the Water`,
      // `Over the New Leaf`) share one pool across runs. So the sheet wins when
      // it names anyone the roster knows, and `upWeight` is the fallback.
      const sheetTargets = splitHeroNames(entry.rateUp6)
        .map((name) => {
          const found = hero.byName(name);
          if (!found) unresolvedHeroes.push(`${entry.name}: ${name}`);
          return found;
        })
        .filter(Boolean);
      const targets = sheetTargets.length
        ? sheetTargets
        : weight.sixStar.map(hero.byId).filter(Boolean);
      const fiveStar = weight.fiveStar.map(hero.byId).filter(Boolean);
      const rule = makeRule(gachaConfig, entry.type, entry.name);

      rows.push({
        id: `${server}:${pool.id}:${entry.start || "x"}`,
        server,
        name: entry.name,
        nameZh: asText(lookup("zh", pool.nameCn).value) || entry.name,
        // The patch the sheet groups the run under (`4.0`, `3.9`, `AH Collab`). It
        // labels the *content*, which both servers ship, so a Global row and the CN
        // row it was predicted from carry the same one.
        version: entry.version || "",
        type: entry.type,
        note: entry.note,
        start: entry.start,
        end: entry.end,
        poolId: Number(pool.id),
        // The 6★ the tab reports odds for. One entry is a real rate-up; several
        // mean the banner is a selector and the reader picks which one to chase.
        targets: targets.map(({ id, name }) => ({ id, name })),
        fiveStar: fiveStar.map(({ id, name }) => ({ id, name })),
        rule,
        // Pool candidates that disagree only matter when the sheet could not name
        // the run's rate-up, i.e. when `targets` had to come from the pool.
        ambiguous: ambiguous && !sheetTargets.length,
      });
    }
  }

  rows.sort((a, b) => {
    const sa = a.start || "9999";
    const sb = b.start || "9999";
    if (sa !== sb) return sa < sb ? -1 : 1;
    if (a.server !== b.server) return a.server < b.server ? -1 : 1;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });

  // **A patch's first Limited banner trades portraits.** A Limited patch opens with
  // one Limited banner — the patch's headline — and 200 pulls on it earn an exchange
  // token that buys a copy (a portrait) of its rate-up, so its P1…P5 read higher than
  // a plain Limited banner's (`copyExchange`, priced by `calcDistribution()` in
  // `app.js`). "First" is positional, not a hand list: a Limited run opens its patch
  // when no other Limited run opened within one patch before it, so the second banner
  // beside it (On Fate's Cue, one day after The Unswerving Navigator) keeps the plain
  // odds. The patch length is the ledger's own 42 days, never re-typed here.
  const exchange = gachaConfig.patchFirstLimited;
  if (exchange && exchange.pulls) {
    const { _comment: _ignored, ...copyExchange } = exchange;
    const patchDays = Number(sheetPatchDays()) || 42;
    for (const server of ["global", "cn"]) {
      const limited = rows
        .filter((row) => row.server === server && row.type === "Limited" && row.start)
        .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
      limited.forEach((row, index) => {
        const previous = limited[index - 1];
        if (previous && dayGap(previous.start, row.start) < patchDays) return;
        row.rule = { ...row.rule, copyExchange: { ...copyExchange } };
      });
    }
  }

  // **Future Sight in Global.** A CN run of a scheduled kind that Global has not
  // scheduled yet — `lag` days after its CN debut, the measured lead time — is a
  // banner Global will run too. The row is a *copy* of the CN row with shifted
  // dates and `predicted: true`, so the app can list it exactly like an announced
  // banner: same pool, same rule, same rate-up.
  //
  // "Not scheduled yet" is a **pairing**, not a window: every CN run claims one Global
  // run (`unmatchedCnRuns()`), so a recurring banner whose newest Global copy has not
  // been listed yet still produces a prediction for the patch it belongs to.
  const lag = globalLag(rows);
  // An unpaired CN run is only worth predicting in the future. The sheet's newest
  // Global row is the horizon: an earlier `cnStart + lag` is history — its Global run
  // happened later than the median lag (the early servers drifted by years), so it is
  // already on the calendar under its own date.
  const horizon = rows
    .filter((row) => row.server === "global" && row.start)
    .reduce((latest, row) => (row.start > latest ? row.start : latest), "");
  const predicted = [];
  for (const row of unmatchedCnRuns(rows, lag)) {
    if (!PREDICTED_TYPES.has(row.type)) continue;
    const start = addDays(row.start, lag);
    if (start < horizon) continue;
    predicted.push({
      id: `global:pred:${row.poolId}:${row.start}`,
      server: "global",
      name: row.name,
      nameZh: row.nameZh,
      version: row.version,
      type: row.type,
      note: row.note,
      start,
      end: row.end ? addDays(row.end, lag) : null,
      poolId: row.poolId,
      targets: row.targets,
      fiveStar: row.fiveStar,
      rule: row.rule,
      ambiguous: row.ambiguous,
      predicted: true,
      lagDays: lag,
      cnId: row.id,
      cnStart: row.start,
      cnEnd: row.end,
    });
  }
  rows.push(...predicted);
  rows.sort((a, b) => {
    const sa = a.start || "9999";
    const sb = b.start || "9999";
    if (sa !== sb) return sa < sb ? -1 : 1;
    if (a.server !== b.server) return a.server < b.server ? -1 : 1;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });

  if (unresolved.length) {
    console.log(`banners: ${unresolved.length} sheet rows matched no pool`);
    for (const line of [...new Set(unresolved)]) console.log(`   ${line}`);
  }
  if (unresolvedHeroes.length) {
    console.log(`banners: ${unresolvedHeroes.length} rate-up names matched no hero`);
    for (const line of [...new Set(unresolvedHeroes)]) console.log(`   ${line}`);
  }
  if (predicted.length) {
    console.log(`banners: ${predicted.length} CN-only banners predicted for Global (+${lag} days)`);
    for (const row of predicted) console.log(`   ${row.start}  ${row.type}  ${row.name}`);
  }

  return {
    source: raw.source || "",
    fetchedAt: raw.fetchedAt || null,
    predictedLagDays: lag,
    banners: rows,
  };
}

/** `gacha_rules.json` — the pull price, the pity curve and the class-B constants. */
export function gachaRules({ items = [], config } = {}) {
  const gachaConfig = config || readJson(path.join(MAPS, "gacha.json"));
  const income = readJson(path.join(MAPS, "calc-income.json")) || {};
  const rules = readPoolRules(table("global", "summon_pool"));
  const byId = new Map(items.map((item) => [String(item.id), item]));
  // 180 Crystal Drops buy one Unilog. No table states it: it is the shop price.
  const dropsPerUnilog = Number(gachaConfig.dropsPerUnilog) || 180;

  const currency = (id, fallback) => {
    const item = byId.get(String(id));
    const rel = `images/items/icon/${id}.png`;
    return {
      id: String(id),
      name: item ? item.name : fallback,
      nameZh: item ? item.nameZh || fallback : fallback,
      icon: item?.icon || (shipped(rel) ? rel : ""),
    };
  };

  return {
    pull: {
      itemId: rules.cost.itemId,
      amount: rules.cost.amount,
      dropsPerUnilog,
    },
    rates: {
      sixStar: Number(rules.sixStarRate.toFixed(6)),
      fiveStar: Number(rules.fiveStarRate.toFixed(6)),
      softPity: Number(rules.softPityRate.toFixed(6)),
    },
    pity: { soft: rules.softPityStart, hard: rules.hardPity },
    rateUpShare: Number(gachaConfig.rateUpShare ?? 0.5),
    portraitCopies: Number(gachaConfig.portraitCopies) || 6,
    // The Drop Income / Drop Outcome ledger (§15): the reader's toggles are priced
    // from constants only the spreadsheet carries, so they ship as data.
    income: { ...income, _comment: undefined, _source: undefined },
    currencies: [
      currency(1, "Crystal Drop"),
      currency(2, "Clear Drop"),
      currency(rules.cost.itemId || 140001, "Unilog"),
    ],
  };
}

export function bannerUnresolved() {
  return { pools: [...unresolved], heroes: [...unresolvedHeroes] };
}
