// Keys & State
const STORAGE_KEY = "r1999_character_roster_v2";

/* ================= i18n ================= */
const LANG_STORAGE_KEY = "r1999_language_v1";
const SUPPORTED_LANGS = ["en", "cn", "vi"];

let currentLang = "en";
let i18nStrings = {};      // { en: {...}, cn: {...}, vi: {...} }
let nameMap = { character: {}, skin: {} };

/** Looks up a UI string for the active language (falls back to English). */
function t(key, vars) {
  const table = i18nStrings[currentLang] || i18nStrings.en || {};
  let str = table[key];
  if (str === undefined) str = (i18nStrings.en || {})[key];
  if (str === undefined) return key;
  if (vars) {
    str = str.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
  }
  return str;
}

/**
 * Display name for a character. Storage always keeps the English key,
 * so only the rendered label changes with the language.
 *
 * Precedence: CN display name (when the language has its own translation) →
 * global name transfer (data/global_name_transfer.json) → ArcanistMap English
 * name → the canonical key itself.
 */
function displayCharName(name) {
  if (currentLang === "cn") {
    const cn = characterDisplayCn[name] || nameMap.character[name];
    if (cn) return cn;
  }
  // The transfer file is keyed by the raw ArcanistMap name, so look that up first
  const raw = characterDisplayEn[name] || name;
  const transferred = globalNameTransfer[raw] || globalNameTransfer[name];
  return transferred || raw;
}

/** Display name for a garment/skin. Falls back to the English name. */
function displaySkinName(skin) {
  if (!skin) return "";
  if (typeof skin === "string") {
    if (currentLang === "cn") return nameMap.skin[skin] || skin;
    return skin;
  }
  if (skin.isDefault) return t("action.default");
  if (currentLang === "cn") return skin.nameCn || nameMap.skin[skin.name] || skin.name;
  return skin.name;
}

/** Localised afflatus label (e.g. Beast -> 兽). */
function displayAfflatus(afflatus) {
  if (!afflatus) return afflatus;
  const base = afflatus === "Mineral_Star" ? "Mineral" : afflatus;
  const translated = t(`afflatus.${base}`);
  return translated === `afflatus.${base}` ? afflatus : translated;
}

/** Localised pattern name (always returns a label, including Placidity). */
function patternLabel(patternName) {
  if (!patternName) return "";
  const key = `pattern.${patternName.toLowerCase()}`;
  const translated = t(key);
  return translated === key ? patternName : translated;
}

/** Localised resonance build label (e.g. General -> 通用, Crit -> 暴击). */
function displayResonanceLabel(label) {
  if (!label) return "";
  const key = `reso.${label}`;
  const translated = t(key);
  if (translated !== key) return translated;
  return label;
}

/**
 * Localises free-form text or notes (from guide_rotations, guide_builds, etc.).
 * Supports both string (with auto-translation for common patterns or i18n keys)
 * and localized objects: { en: "...", vi: "...", cn: "..." }.
 */
function localizeText(val) {
  if (!val) return "";
  if (typeof val === "object") {
    return val[currentLang] || val.en || Object.values(val)[0] || "";
  }
  if (typeof val === "string") {
    if (val.startsWith("Recommended Portrait:")) {
      const p = val.replace("Recommended Portrait:", "").trim();
      if (currentLang === "cn") return `推荐塑造：${p}`;
      if (currentLang === "vi") return `Portrait đề xuất: ${p}`;
      return val;
    }
    const matchRepeat = val.match(/^Repeat (?:turn|round) (\d+)-(\d+)\.?$/i);
    if (matchRepeat) {
      if (currentLang === "cn") return `重复第${matchRepeat[1]}-${matchRepeat[2]}回合。`;
      if (currentLang === "vi") return `Lặp lại lượt ${matchRepeat[1]}-${matchRepeat[2]}.`;
      return val;
    }
    const translated = t(val);
    if (translated && translated !== val) return translated;
    return val;
  }
  return String(val);
}
window.localizeText = localizeText;

/* ---------------- Stat value formatters ----------------
   EN:  I3 / Lv.60 / R10 / P0 / A5
   CN:  洞3 / 60级 / 共10 / 0塑 / 增5                      */
function fmtInsight(n) {
  const v = Number(n);
  if (currentLang === "cn") return `洞${v}`;
  return `I${v}`;
}
function fmtLevel(n) {
  if (currentLang === "cn") return `${n}级`;
  return `Lv.${n}`;
}
function fmtResonance(n) {
  if (currentLang === "cn") return `共${n}`;
  return `R${n}`;
}
function fmtPortrait(n) {
  if (currentLang === "cn") return `${n}塑`;
  return `P${n}`;
}
function fmtEuphoria(n) {
  if (currentLang === "cn") return `狂${n}`;
  return `E${n}`;
}
function fmtAmp(n) {
  const v = Number(n);
  if (currentLang === "cn") return `增${v}`;
  return `A${v}`;
}

/** Tooltip text for a pattern icon, honouring main/owned state. */
function patternTooltipText(patternName, state) {
  const base = patternLabel(patternName);
  if (state === "main") return `${base} (${t("pattern.tagPrimary")})`;
  if (state === "owned") return `${base} (${t("pattern.tagOwned")})`;
  return base;
}

function loadLanguage() {
  const saved = localStorage.getItem(LANG_STORAGE_KEY);
  if (SUPPORTED_LANGS.includes(saved)) currentLang = saved;
}

async function setLanguage(lang) {
  if (!SUPPORTED_LANGS.includes(lang)) return;
  currentLang = lang;
  localStorage.setItem(LANG_STORAGE_KEY, lang);
  document.documentElement.setAttribute("lang", lang === "cn" ? "zh-Hans" : lang);
  if (!i18nStrings[lang]) {
    try {
      const res = await fetch(`locales/${lang}.json`);
      if (res.ok) {
        i18nStrings[lang] = await res.json();
      }
    } catch (e) {
      console.warn(`Could not load locales/${lang}.json`, e);
    }
  }
  applyTranslations();
  refreshDynamicTranslations();
  renderShowcase();

  const rosterModalEl = document.getElementById("roster-modal");
  if (rosterModalEl && rosterModalEl.style.display === "flex") renderRosterManager();
  refreshOpenTeamModals();
  // Toggle labels depend on their current state, not just the locale.
  syncBuildsToggleLabel();
  syncRotationsToggleLabel();

  // The rotation cards carry generated labels (the Preset tag, remove tooltip).
  const rotationsModalEl = document.getElementById("rotations-modal");
  if (rotationsModalEl && rotationsModalEl.style.display === "flex") renderRotations();
  const presetsModalEl = document.getElementById("rotation-presets-modal");
  if (presetsModalEl && presetsModalEl.style.display === "flex") renderRotationPresets();

  // The credits modal's empty state is translated too.
  renderCredits();

  const buildsModalEl = document.getElementById("builds-modal");
  if (buildsModalEl && buildsModalEl.style.display === "flex") renderBuilds();

  // Slide the highlight to the language that was just picked.
  syncSlidingThumbs({ animate: true });
}

/* ---- Language switcher: a highlight that slides to the chosen language ---- */

/** Controls that get a sliding highlight. */
const SLIDING_CONTROLS = [{ container: ".lang-switcher", item: ".lang-btn", thumb: "lang-thumb" }];

/**
 * Injects the highlight element into each control. It is absolutely positioned
 * and sits behind the buttons, so the labels keep their own contrast and the
 * buttons keep their layout.
 */
function setupSlidingThumbs() {
  SLIDING_CONTROLS.forEach(({ container, thumb: className }) => {
    document.querySelectorAll(container).forEach((host) => {
      if (host.querySelector(`.${className}`)) return;
      const thumb = document.createElement("span");
      thumb.className = className;
      thumb.setAttribute("aria-hidden", "true");
      host.insertBefore(thumb, host.firstChild);
    });
  });
  refreshSlidingThumbs();
  // Fonts can settle after the first paint, so measure once more next frame.
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(refreshSlidingThumbs);
}

/**
 * Moves a highlight under `active`.
 *
 * The items are real buttons whose widths depend on their translated labels,
 * so the position comes from the measured offset rather than a fixed share of
 * the container. A hidden control measures as zero and is skipped until it is
 * shown again.
 */
function placeSlidingThumb(thumb, active, { animate = true } = {}) {
  const width = active.offsetWidth;
  if (!width) return;

  if (!animate) {
    // Jump to the spot, then re-arm the transition for the next switch.
    thumb.style.transition = "none";
  }
  thumb.style.width = `${width}px`;
  thumb.style.transform = `translateX(${active.offsetLeft}px)`;
  if (!animate) {
    void thumb.offsetWidth;
    thumb.style.transition = "";
  }
}

/**
 * Syncs every control. `animate` is false for placement after a layout change
 * (first paint, drawer open, resize) so the highlight does not slide in from
 * the left edge.
 */
function syncSlidingThumbs({ animate = false } = {}) {
  SLIDING_CONTROLS.forEach(({ container, item, thumb: className }) => {
    document.querySelectorAll(container).forEach((host) => {
      const thumb = host.querySelector(`.${className}`);
      const active = host.querySelector(`${item}.active`);
      if (!thumb || !active) return;
      placeSlidingThumb(thumb, active, { animate });
    });
  });
}

/** Re-measures without animating. */
function refreshSlidingThumbs() {
  syncSlidingThumbs({ animate: false });
}

/** Re-renders whichever Team Building modal is currently open (i18n / CN toggle). */
function refreshOpenTeamModals() {
  const isOpen = (id) => {
    const el = document.getElementById(id);
    return !!el && el.style.display === "flex";
  };
  if (isOpen("team-modal")) renderTeamModal();
  if (isOpen("team-select-char-modal")) renderTeamSelectCharacter();
  if (isOpen("team-select-chube-modal")) renderTeamSelectPsychube();
  if (isOpen("team-presets-modal")) renderTeamPresets();
}

/**
 * Rewrites every element carrying a data-i18n / data-i18n-* attribute.
 * Supported: data-i18n (text), data-i18n-placeholder, data-i18n-title,
 * data-i18n-aria-label.
 */
function applyTranslations() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.getAttribute("data-i18n"));
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder")));
  });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    el.setAttribute("title", t(el.getAttribute("data-i18n-title")));
  });
  document.querySelectorAll("[data-i18n-aria-label]").forEach((el) => {
    el.setAttribute("aria-label", t(el.getAttribute("data-i18n-aria-label")));
  });
  // Strings that intentionally contain inline markup (e.g. footer credits)
  document.querySelectorAll("[data-i18n-html]").forEach((el) => {
    el.innerHTML = t(el.getAttribute("data-i18n-html"));
  });
  document.querySelectorAll(".lang-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.lang === currentLang);
  });

  const langLabel = document.getElementById("lang-current-label");
  if (langLabel) {
    const names = { en: "English", vi: "Tiếng Việt", cn: "简体中文" };
    langLabel.textContent = names[currentLang] || currentLang.toUpperCase();
  }

  // Narrow screens show the short code instead of the full name.
  const langShort = document.getElementById("lang-current-short");
  if (langShort) {
    const codes = { en: "EN", vi: "VI", cn: "中" };
    langShort.textContent = codes[currentLang] || currentLang.toUpperCase();
  }

  // The wordmark has localised artwork for Chinese and Vietnamese
  const logo = document.getElementById("app-logo-img");
  if (logo) {
    if (currentLang === "cn") logo.src = "images/sotheby_mansion_cn.png";
    else if (currentLang === "vi") logo.src = "images/dinhthusotheby.png";
    else logo.src = "images/sotheby_mansion.webp";
  }

  // Localised document title
  document.title = t("misc.siteTitle");

  // Keep <html lang> in sync (also on first load, where setLanguage isn't called)
  document.documentElement.setAttribute("lang", currentLang === "cn" ? "zh-Hans" : currentLang);
}

/**
 * Updates a button's visible label without destroying an inner [data-i18n] span.
 * If such a span exists we retarget its key so later language switches keep working.
 */
function setButtonLabel(btn, text, key) {
  if (!btn) return;
  // Icon-only buttons have no label slot, so writing text would replace the
  // artwork with a word. Their name lives in the tooltip instead.
  if (btn.classList.contains("mainboard-icon-btn")) {
    btn.title = text;
    btn.setAttribute("aria-label", text);
    if (key) {
      btn.setAttribute("data-i18n-title", key);
      btn.setAttribute("data-i18n-aria-label", key);
    }
    return;
  }
  const span = btn.querySelector("[data-i18n]");
  if (span) {
    span.textContent = text;
    if (key) span.setAttribute("data-i18n", key);
    return;
  }
  btn.textContent = text;
}

/** Re-applies JS-driven strings that are not covered by data-i18n attributes. */
function refreshDynamicTranslations() {
  const status = document.getElementById("board-bg-image-status");
  if (status) {
    setButtonLabel(status, customBoardBgImageUrl ? t("styling.bgActive") : t("styling.noImage"),
      customBoardBgImageUrl ? "styling.bgActive" : "styling.noImage");
  }

  // Insight quick-pick tooltips (e.g. "Insight 3")
  document.querySelectorAll(".btn-pill-i").forEach((btn) => {
    const n = Number(btn.dataset.i);
    btn.removeAttribute("title");
    btn.dataset.patternName = fmtInsight(n);
  });

  // Portrait quick-picks (P0 -> 0塑) + tooltip. Skip the Psychube A1-A5 picks,
  // which share the .btn-pill-p class but carry their own labels.
  document.querySelectorAll(".btn-pill-p:not(.btn-pill-a)").forEach((btn) => {
    const p = Number(btn.dataset.p);
    btn.textContent = fmtPortrait(p);
    btn.dataset.patternName = fmtPortrait(p);
  });

  // Psychube amplification quick-picks (A1-A5 -> 增1-增5)
  document.querySelectorAll(".btn-pill-a").forEach((btn) => {
    btn.textContent = fmtAmp(Number(btn.dataset.a));
  });

  // Static roster stat tooltip labels
  const statTip = document.getElementById("roster-stat-tooltip");
  if (statTip) {
    const labels = statTip.querySelectorAll(".stat-tip-label");
    if (labels[0]) labels[0].textContent = t("stats.level60");
    if (labels[1]) labels[1].textContent = t("stats.r10plus");
  }

  // The Guide builds its section titles in JS, so re-render it on a language change.
  // Both guide modals build their section titles in JS, so re-render them.
  const buildsModal = document.getElementById("builds-modal");
  if (buildsModal && buildsModal.style.display !== "none") renderBuilds();
  const rotationsModal = document.getElementById("rotations-modal");
  if (rotationsModal && rotationsModal.style.display !== "none") {
    renderRotations();
  }
  // The Planner builds its section titles and row labels in JS too.
  const plannerModal = document.getElementById("planner-modal");
  if (plannerModal && plannerModal.style.display !== "none") renderPlanner();
}

let characterDb = {}; // { "Name": "images/headicon_small/..." }
let characterDisplayEn = {}; // { canonicalName: "English display name" } from ArcanistMap
let characterDisplayCn = {}; // { canonicalName: "Chinese display name" } from ArcanistMap

/* ---------------- Psychube (Trấn) ---------------- */
const PSYCHUBE_STORAGE_KEY = "r1999_psychube_v1";
const PSYCHUBE_MAX_LEVEL = 60;
const PSYCHUBE_MAX_AMP = 5;
const PSYCHUBE_MIN_AMP = 1;
// Special chubes (Gluttony / Greed) track a raw quantity, so it is not capped
// at the game's usual 99 — only a sanity bound is applied.
const PSYCHUBE_MAX_COUNT = 9999;
// Special "count-only" chubes by game id: Gluttony (6★) and Greed (5★).
const PSYCHUBE_SPECIAL_IDS = ["1000", "1001"];
let psychubeDb = {};        // { "6:1579": { rarity, id, name, nameCn, tags, releasePatch, iconUrl } }
let psychubeOrder = [];     // ordered keys for stable listing
let userPsychubes = {};     // { "6:1579": { owned, level, amplification, count } }
// Old saves keyed chubes by invented sequential ids; this maps them to game ids.
let psychubeKeyMapCache = {}; // { "6:1": "6:1000", ... }
let characterRarityMap = {}; // { "Name": 6 }
let characterIdMap = {}; // { "Name": 3003 }
let euphoriaOptionsByName = {}; // { "Name": [1,2] }
let euphoriaNamesByTier = {}; // { "Name": { 1: "Pursuit", 2: "Conduit" } }
let euphoriaAllowedNames = new Set();
let characterAfflatus = {}; // { "Name": "Beast" | "Plant" | "Star" | "Mineral" | "Spirit" | "Intellect" | "Mineral_Star" }
let characterResoShape = {}; // { "Name": "Z shape" | "T shape" | "U shape" | "Plus shape" }
let shapePatterns = {};      // { "Z shape": ["Placidity", ...], ... }
let futureSightData = { Character: [], Euphoria: [], Skin: [] };
let futureSightChars = new Set();
let futureSightEuphorias = new Map(); // name -> Set of future tiers e.g. "37" -> Set([1])
let futureSightSkins = new Set(); // Set of skin IDs (Numbers) exclusive to future sight
let futureSightPsychubes = new Set(); // Set of psychube keys ("6:73") exclusive to future sight
let globalNameTransfer = {}; // { rawName: canonicalName } for global display names
let excludedCharacters = new Set(); // Set of character names to exclude
let collabCharacters = new Set();   // Collab names excluded from board chess pieces only
let userRoster = {};  // { "Name": { owned: true/false, insight: 3, level: 60, resonance: 10, portrait: 0, e1: false, e2: false } }
let currentEditingName = null;
let futureSightEnabled = false;

const FUTURE_SIGHT_STORAGE_KEY = "r1999_future_sight_v1";

let customBoardBgImageUrl = null; // Session-only uploaded background image DataURL

let characterSkinsMap = {}; // { "Druvis III": [ { id: 300301, name: "Default", isDefault: true, iconUrl: "images/headicon_small/300301.png" }, ... ] }

const NAME_ALIASES = {
  "37": ["37", "Thirty-seven"],
  "6": ["6", "Six"],
  "Ezra": ["Ezra", "Ezra Theodore"],
  "J": ["J", "Joe"],
  "Jessica": ["Jessica", "Changeling"],
  "Kaalaa Baunaa": ["Kaalaa Baunaa", "Black Dwarf"],
  "Liang Yue": ["Liang Yue", "Liang"],
  "Vila": ["Vila", "Вила"],
  "Coppélia": ["Coppélia", "Coppelia"],
  "Avgust": ["Avgust", "Авксивий"],
  "Yenisei": ["Yenisei", "Енисей"],
  "Matilda": ["Matilda", "Matilda Bouanich"],
  "AliEn T": ["AliEn T", "aliEn T"],
  "3F3F": ["3F3F", "???", "Machine D III"],
};

/**
 * True when `name` (a canonical English key) matches a search query.
 * Character names are stored in English, so the query is matched against the
 * canonical key, its aliases, and the localised display names — which is what
 * makes Chinese searches work.
 */
function characterMatchesQuery(name, query) {
  if (!query) return true;
  const q = query.toLowerCase();

  if (name.toLowerCase().includes(q)) return true;

  const aliases = NAME_ALIASES[name];
  if (Array.isArray(aliases) && aliases.some((a) => String(a).toLowerCase().includes(q))) return true;

  const cn = characterDisplayCn[name] || nameMap.character[name];
  if (cn && String(cn).toLowerCase().includes(q)) return true;

  const en = characterDisplayEn[name];
  if (en && String(en).toLowerCase().includes(q)) return true;

  return false;
}

function getCharacterRarity(name) {
  if (characterRarityMap[name] !== undefined) return characterRarityMap[name];
  return 5;
}

function getCharacterReleaseId(name) {
  if (characterIdMap[name] !== undefined) return characterIdMap[name];
  return 0;
}

function getMaxInsightForRarity(rarity) {
  return Number(rarity) >= 5 ? 3 : 2;
}

function getMaxLevelForInsight(insight) {
  switch (Number(insight)) {
    case 0: return 30;
    case 1: return 40;
    case 2: return 50;
    case 3:
    default: return 60;
  }
}

function getMaxResonanceForInsight(insight) {
  switch (Number(insight)) {
    case 0: return 1;
    case 1: return 5;
    case 2: return 10;
    case 3:
    default: return 15;
  }
}

/* ---------------- Arcanist levelling costs ----------------
 * `data/progression_levels.json`, generated from the game's `character_cosume`
 * table by `scripts/sync/derive/progressionLevels.mjs`. It is grouped by app
 * rarity + insight: 5★ and 6★ share one curve, 2★ and 3★ another. The band totals
 * are the ones the InfoBook's progression panel has always shown, and
 * `npm run sync:verify` asserts they still add up.
 */
let levelCostGroups = [];

function buildLevelCostData(data) {
  levelCostGroups = data && Array.isArray(data.groups) ? data.groups : [];
}

function levelCostGroup(rarity, insight) {
  const r = Number(rarity) || 5;
  const ins = Number(insight) || 0;
  return levelCostGroups.find((g) => g.insight === ins && (g.rarities || []).includes(r)) || null;
}

/** Dust + Sharpodonty spent going from level 1 to `level` inside one insight tier. */
function levelCostToLevel(rarity, insight, level) {
  const total = { dust: 0, sharpodonty: 0 };
  const group = levelCostGroup(rarity, insight);
  if (!group || !group.levels) return total;
  const to = Math.min(Number(level) || 1, getMaxLevelForInsight(insight));
  for (let lv = 2; lv <= to; lv++) {
    const row = group.levels[String(lv)];
    if (!row) continue;
    total.dust += Number(row.dust) || 0;
    total.sharpodonty += Number(row.sharpodonty) || 0;
  }
  return total;
}

/** The levels `from + 1 .. to` of one insight tier (both ends are levels there). */
function levelCostBetween(rarity, insight, from, to) {
  const end = levelCostToLevel(rarity, insight, to);
  const start = levelCostToLevel(rarity, insight, from);
  return { dust: end.dust - start.dust, sharpodonty: end.sharpodonty - start.sharpodonty };
}

/**
 * Dust + Sharpodonty for a whole progression: every tier between the two
 * insights, counted from the current level in the first one and up to the goal
 * level in the last one.
 */
function levelExpBetween(rarity, curInsight, curLevel, goalInsight, goalLevel) {
  const total = { dust: 0, sharpodonty: 0 };
  const first = Number(curInsight) || 0;
  const last = Number(goalInsight) || 0;
  if (last < first) return total;
  for (let ins = first; ins <= last; ins++) {
    const from = ins === first ? Number(curLevel) || 1 : 1;
    const to = ins === last ? Number(goalLevel) || 1 : getMaxLevelForInsight(ins);
    const part = levelCostBetween(rarity, ins, from, to);
    total.dust += part.dust;
    total.sharpodonty += part.sharpodonty;
  }
  return total;
}

// DOM Elements
const tierRowsContainer = document.getElementById("tier-rows-container");

const rosterStat = document.getElementById("roster-stat");
const filterSearch = document.getElementById("filter-search");
const inputBoardTitle = document.getElementById("input-board-title");
const boardTitleLabel = document.getElementById("board-title-label");
const filterOwnershipBtns = document.querySelectorAll("#filter-ownership-group .filter-btn");
const filterRarityBtns = document.querySelectorAll("#filter-rarity-group .filter-btn");

const TITLE_STORAGE_KEY = "r1999_board_title_v1";
const LISTING_STORAGE_KEY = "r1999_tier_listing_v1";
const FILTER_STORAGE_KEY = "r1999_filters_v1";
const TEAMS_STORAGE_KEY = "r1999_teams_v1";

/* ---------------- Team Building ---------------- */
const TEAM_NAME_MAX_LEN = 40;
const TEAM_SLOT_COUNT = 4;
/* Teams per row: the option only appears when the viewport can host it, and the
   modal widens for the 3-column layout. Keys are the column counts. */
const TEAM_COLUMN_MIN_VIEWPORT = { 1: 0, 2: 1000, 3: 1480 };
const TEAM_MODAL_MAX_WIDTH = { 1: 1040, 2: 1040, 3: 1500 };
const TEAM_MAX_COLUMNS = 3;
let teamArchetypes = {};   // { presetName: [ [ {character, psychube, euphoria?}, ... ], ... ] }
let teamsConfig = { teams: [] };
let teamsAllowUnowned = false;  // "Show Unowned" toggle inside the Team Building modal
let teamsFormableOnly = false;  // Team Presets: only presets the roster can field
let teamsManualPick = false;    // Team Presets: take the main card, substitutes on demand
let teamsHideWarning = false;   // "Hide Warning": suppresses every Used marker
let teamModalDirty = false;     // Defers the board re-render until the modal closes
let pendingTeamCharacter = null; // Carried from the unused strip into a team slot
const teamSlotPicker = { teamId: null, slotIndex: 0 };
const teamCollapsedGroups = new Set(); // Preset names whose extra variants are collapsed
// Manual mode: the substitute the player promoted into a slot, keyed "preset#variant#slot".
const presetManualChoices = new Map();
let teamModalSearch = null;     // #team-search (assigned in setupEventListeners)
let teamPresetSearch = null;    // #team-preset-search
let teamRecommendTeamId = null; // Team whose Recommend modal is open (null = closed)
let teamRecommendSearch = null; // #team-recommend-search
let teamStripRatio = 0.32;      // Share of the modal height given to the unused strip
let teamColumns = 2;            // Preferred teams per row (clamped by the viewport)
let teamModalRarityFilters = new Set([6]);
let teamSelectCharRarityFilters = new Set([6]);
let teamSelectChubeRarityFilters = new Set([6, 5]);

const DEFAULT_TIERS_CONFIG = {
  tiers: [
    { id: "tier_r15", label: "R15", color: "#d1783d", ruleGroups: [[{ field: "resonance", op: "=", value: 15 }]] },
    { id: "tier_r11_14", label: "R11 - 14", color: "#6d9b6c", ruleGroups: [[{ field: "resonance", op: ">=", value: 11 }, { field: "resonance", op: "<=", value: 14 }]] },
    { id: "tier_r10", label: "R10", color: "#d7d7d7", ruleGroups: [[{ field: "resonance", op: "=", value: 10 }]] },
    { id: "tier_r1_9", label: "R1 - 9", color: "#4a77c9", ruleGroups: [[{ field: "resonance", op: ">=", value: 1 }, { field: "resonance", op: "<=", value: 9 }]] },
    { id: "tier_other", type: "other", label: "Remaining Characters", color: "#a0a0a0", bgColor: null, borderColor: null, bold: false },
    { id: "tier_unowned", type: "unowned", label: "Unowned Characters", color: "#9a9a9a", bgColor: null, borderColor: null, bold: false },
    { id: "tier_chube_owned", type: "psychube", isDefaultPsychubeOwned: true, label: "Psychubes", color: "#d7d7d7", bgColor: null, borderColor: null, bold: false, ruleGroups: [[{ field: "rarity", op: "<=", value: 6 }]] },
    { id: "tier_chube_other", type: "psychube_other", label: "Other", color: "#a0a0a0", bgColor: null, borderColor: null, bold: false },
    { id: "tier_chube_unowned", type: "psychube_unowned", label: "Unowned", color: "#9a9a9a", bgColor: null, borderColor: null, bold: false },
  ],
};

let listingConfig = JSON.parse(JSON.stringify(DEFAULT_TIERS_CONFIG));

function ensureSystemTiersInList(list) {
  if (!Array.isArray(list)) return;
  const hasOther = list.some((t) => t.type === "other" || t.id === "tier_other");
  if (!hasOther) {
    list.push({
      id: "tier_other",
      type: "other",
      label: listingConfig.otherLabel || "Remaining Characters",
      color: listingConfig.otherColor || "#a0a0a0",
      bgColor: listingConfig.otherBg || null,
      borderColor: listingConfig.otherBorder || null,
      bold: !!listingConfig.otherBold,
    });
  }

  // The Unowned Psychube row is a fixed system tier (holds every unowned chube)
  // and cannot be removed. The Owned Psychube row is a normal tier.
  const hasUnownedChube = list.some((t) => t.type === "psychube_unowned" || t.id === "tier_chube_unowned");
  if (!hasUnownedChube) {
    const row = {
      id: "tier_chube_unowned",
      type: "psychube_unowned",
      label: "Unowned",
      color: "#9a9a9a",
      bgColor: null,
      borderColor: null,
      bold: false,
    };
    // Default placement: right after the last Psychube tier
    const lastPsychubeIdx = list.map((t) => typeof t.type === "string" && t.type.startsWith("psychube")).lastIndexOf(true);
    if (lastPsychubeIdx >= 0) list.splice(lastPsychubeIdx + 1, 0, row);
    else list.push(row);
  }

  const hasUnowned = list.some((t) => t.type === "unowned" || t.id === "tier_unowned");
  if (!hasUnowned) {
    list.push({
      id: "tier_unowned",
      type: "unowned",
      label: "Unowned Characters",
      color: listingConfig.unownedColor || "#9a9a9a",
      bgColor: listingConfig.unownedBg || null,
      borderColor: listingConfig.unownedBorder || null,
      bold: !!listingConfig.unownedBold,
    });
  }

  // Other Psychubes: fixed catch-all row for owned chubes with no matching tier.
  const hasChubeOther = list.some((t) => t.type === "psychube_other" || t.id === "tier_chube_other");
  if (!hasChubeOther) {
    const row = {
      id: "tier_chube_other",
      type: "psychube_other",
      label: "Other",
      color: "#a0a0a0",
      bgColor: null,
      borderColor: null,
      bold: false,
    };
    // Default placement: above the first Psychube tier
    const firstPsychubeIdx = list.findIndex((x) => typeof x.type === "string" && x.type.startsWith("psychube"));
    if (firstPsychubeIdx >= 0) list.splice(firstPsychubeIdx, 0, row);
    else list.push(row);
  }

  // The Owned Psychube row is seeded once so it shows up by default, but it is
  // an ordinary tier: deletable, reorderable and fully rule-driven.
  if (!listingConfig.psychubeTiersSeeded) {
    const hasOwnedChube = list.some((x) => x.isDefaultPsychubeOwned);
    if (!hasOwnedChube) {
      const row = {
        id: "tier_chube_owned",
        type: "psychube",
        isDefaultPsychubeOwned: true,
        label: "Psychubes",
        color: "#d7d7d7",
        bgColor: null,
        borderColor: null,
        bold: false,
        ruleGroups: [[{ field: "rarity", op: "<=", value: 6 }]],
      };
      // Default placement: below Other, above the Other Psychubes row
      const otherChubeIdx = list.findIndex((x) => x.type === "psychube_other");
      if (otherChubeIdx >= 0) list.splice(otherChubeIdx, 0, row);
      else list.push(row);
    }
    listingConfig.psychubeTiersSeeded = true;
  }

  // One-time migration: the character Unowned row used to sit after every
  // Psychube tier. Lift it above the first Psychube tier. Runs once so a
  // deliberate manual reorder is never undone.
  if (!listingConfig.unownedAbovePsychubeMigrated) {
    const isPsychubeTier = (t) => typeof t.type === "string" && t.type.startsWith("psychube");
    const unownedIdx = list.findIndex((t) => t.type === "unowned" || t.id === "tier_unowned");
    const firstPsychubeIdx = list.findIndex(isPsychubeTier);
    if (unownedIdx >= 0 && firstPsychubeIdx >= 0 && unownedIdx > firstPsychubeIdx) {
      const [unownedRow] = list.splice(unownedIdx, 1);
      list.splice(firstPsychubeIdx, 0, unownedRow);
    }
    listingConfig.unownedAbovePsychubeMigrated = true;
  }

  // One-time migration: rename the "Remaining" / "Unowned" system tier labels
  // to their clearer names. Only untitled/legacy labels are touched, so a
  // custom label the user typed is preserved.
  if (!listingConfig.systemTierLabelsMigrated) {
    const renames = { other: "Remaining Characters", unowned: "Unowned Characters" };
    list.forEach((t) => {
      const target = renames[t.type];
      if (!target) return;
      const current = (t.label || "").trim();
      if (current === "" || current === "Other" || current === "Remaining" || current === "Unowned") {
        t.label = target;
      }
    });
    listingConfig.otherLabel = "Remaining Characters";
    listingConfig.systemTierLabelsMigrated = true;
  }
}

function loadListingConfig() {
  try {
    const saved = localStorage.getItem(LISTING_STORAGE_KEY);
    if (saved) {
      listingConfig = JSON.parse(saved);
      if (!Array.isArray(listingConfig.tiers)) {
        listingConfig.tiers = JSON.parse(JSON.stringify(DEFAULT_TIERS_CONFIG.tiers));
      }
    }
  } catch (e) {
    console.warn("Could not load listing config", e);
    listingConfig = JSON.parse(JSON.stringify(DEFAULT_TIERS_CONFIG));
  }
  ensureSystemTiersInList(listingConfig.tiers);
  // The system-tier bootstrap and the ordering migration both mutate config
  // flags, so persist them before anything can overwrite them.
  saveListingConfig();
}

function saveListingConfig() {
  localStorage.setItem(LISTING_STORAGE_KEY, JSON.stringify(listingConfig));
}

let activeOwnershipFilter = "all"; // "all" | "owned" | "unowned"
let activeRarityFilters = new Set(); // Set of active rarities (empty = all)

// Edit Modal Elements
const editModal = document.getElementById("edit-modal");
const modalBtnClose = document.getElementById("modal-btn-close");
const modalCharImg = document.getElementById("modal-char-img");
const modalCharName = document.getElementById("modal-char-name");
const modalCharStatus = document.getElementById("modal-char-status");
const modalBtnFavourite = document.getElementById("modal-btn-favourite");
const modalBtnFavouriteImg = document.getElementById("modal-btn-favourite-img");
const btnStatusOwned = document.getElementById("btn-status-owned");
const btnStatusUnowned = document.getElementById("btn-status-unowned");
const groupSkin = document.getElementById("group-skin");
const displaySkin = document.getElementById("display-skin");
const skinQuickPicks = document.getElementById("skin-quick-picks");
const groupInsight = document.getElementById("group-insight");
const groupLevel = document.getElementById("group-level");
const groupResonance = document.getElementById("group-resonance");
const groupPattern = document.getElementById("group-pattern");
const groupPortrait = document.getElementById("group-portrait");
const groupEuphoria = document.getElementById("group-euphoria");

const displayInsight = document.getElementById("display-insight");
const displayLevel = document.getElementById("display-level");
const inputLevel = document.getElementById("input-level");

const inputResonance = document.getElementById("input-resonance");
const displayResonance = document.getElementById("display-resonance");
const displayPortrait = document.getElementById("display-portrait");
const modalPortraitBarPreview = document.getElementById("modal-portrait-bar-preview");
const checkE1 = document.getElementById("check-e1");
const checkE2 = document.getElementById("check-e2");
const labelTextE1 = document.getElementById("label-text-e1");
const labelTextE2 = document.getElementById("label-text-e2");
const modalBtnSave = document.getElementById("modal-btn-save");
const shapePatternGrid = document.getElementById("shape-pattern-grid");

// Manage Modal Elements (shared by the Characters and Psychubes tabs)
const rosterModal = document.getElementById("roster-modal");
const btnManageAll = document.getElementById("btn-manage-all");
const rosterBtnClose = document.getElementById("roster-btn-close");
const rosterSearch = document.getElementById("roster-search");
const rosterGridList = document.getElementById("roster-grid-list");
const rosterFilterRarityBtns = document.querySelectorAll("#roster-filter-rarity-group .filter-btn");

/** Which tab of the Manage modal is showing: "characters" (default) or "chubes". */
let manageActiveTab = "characters";

let rosterActiveRarityFilters = new Set(); // Set of active rarities in Roster Manager
let rosterNeedsShowcaseRefresh = false;    // Defers board re-render until the modal closes
let rosterSelectMode = false;              // Bulk-selection mode in Quick Edit
const rosterSelection = new Set();         // Names currently selected for bulk apply
let rosterVisibleNames = [];               // Names passing the current search/rarity filter

// Action Buttons
const btnExportImage = document.getElementById("btn-export-image");
const btnJson = document.getElementById("btn-json");
const inputImportFile = document.getElementById("input-import-file");
const btnResetData = document.getElementById("btn-roster-reset");

const OPTIONS_STORAGE_KEY = "r1999_display_options_v1";

const DEFAULT_THEME_APPEARANCE = {
  boardFont: "default",
  boardUppercase: true,
  boardTitleSize: 0.74,
  tierLabelSize: 0.70,
  tierLabelWidth: 110,
  boardBg: "#111111",
  boardTitleColor: "#f4efe9",

  // Board Header Box
  boardHeaderBg: "transparent",
  boardHeaderBgOpacity: 1,
  boardHeaderBorderColor: "rgba(255, 255, 255, 0.1)",
  boardHeaderBorderWidth: 1,

  // Tier Box (Khung chứa từng tier & nhân vật)
  tierBoxOpacity: 0.1,
  tierBoxBorderWidth: 1,
  tierBoxRadius: 0,

  // Spacing
  spacingHeaderToTiers: 20,
  spacingBetweenTierRows: 14,

  // Character Card Scale Size
  charCardScale: 1.0,

  // Character Info Badge (I/Lv Overlay)
  charInfoBgEnabled: true,
  charInfoBg: "#121212",
  charInfoBgOpacity: 0.22,
  charInfoBorderColor: "transparent",
  charInfoBorderWidth: 0,
  charInfoRadius: 0,

  euphoriaColor: "#04FFEE",
  chubeLevelColor: "#ffffff",
  chubeAmpColor: "#ffffff",
  chubeAmpMaxColor: "#DF7526",
  chubeCountColor: "#04FFEE",
  customPortraitColorsEnabled: true,
  portraitColorR6: "#DD9925",
  portraitColorR5: "#C7AF6C",
  portraitColorR4: "#6A4972",
  portraitColorR3: "#545C7D",
  portraitColorR2: "#496441",
  patternNone: "#4F4F4F",
  patternOffensive: "#F67E26",
  patternDefensive: "#62A771",
  patternHp: "#E6AE34",
  patternEquibalance: "#4A70B3",

  // Custom Resonance Label Color on Character Info
  customResColorEnabled: false,
  customResColor: "#ffffff",

  // Unowned Character Dimming
  unownedOpacity: 0.35,

  // Chess Pieces (Rarity Counter)
  chessPiecesEnabled: true,
  chessPiecesPosition: "top",
  chessPiecesSize: 20,
  chessPiecesOpacity: 1,
};

let displayOptions = {
  hideInsight: false,
  hideLevel: false,
  hideResonance: false,
  hideEuphoria: false,
  hidePortrait: false,
  hideNames: false,
  hideOwnedNames: false,
  hidePatterns: false,
  hideSkin: false,
  hideAfflatus: false,
  hideCharacterTier: false,
  hidePsychubeTier: false,
  showPatternBg: false,
  showNonePatternBg: false,
  colorNonePatternBg: "#4F4F4F",
  showNonePatternBorder: false,
  colorNonePatternBorder: "#4F4F4F",
  showRarityLine: true,
  hideRarityLine: false,
  hideI3Lv60: false,
  hideI3Lv30: false,
  hideI2Lv50: false,
  customHideRules: [], // array of { id, insight: 3, level: 59, enabled: true }
  hideR15: false,
  hideR10: false,
  customResHideRules: [], // array of { id, resonance: 10, enabled: true }
  // Psychube detail hiding (mirrors the character Insight/Level + Resonance rows)
  hideAmplification: false,
  hidePsychubeLevel: false,
  hideGluttony: false,
  hideGreed: false,
  hideA1: false,
  hideA5: false,
  hideLv1: false,
  hideLv60: false,
  customAmpHideRules: [],   // array of { id, amplification: 5, enabled: true }
  customLevelHideRules: [], // array of { id, level: 60, enabled: true }
  appearance: { ...DEFAULT_THEME_APPEARANCE },
};

function loadDisplayOptions() {
  try {
    const saved = localStorage.getItem(OPTIONS_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      displayOptions = {
        ...displayOptions,
        ...parsed,
        appearance: { ...DEFAULT_THEME_APPEARANCE, ...(parsed.appearance || {}) },
      };
      if (!Array.isArray(displayOptions.customHideRules)) {
        displayOptions.customHideRules = [];
      }
      if (!Array.isArray(displayOptions.customResHideRules)) {
        displayOptions.customResHideRules = [];
      }
      if (!Array.isArray(displayOptions.customAmpHideRules)) {
        displayOptions.customAmpHideRules = [];
      }
      if (!Array.isArray(displayOptions.customLevelHideRules)) {
        displayOptions.customLevelHideRules = [];
      }

      // Migration: older saves stored showRarityLine=false before the rarity line
      // was reworked into an always-on feature. If the user never explicitly hid it,
      // turn it on so the rarity line appears on existing saves.
      const neverHidRarity = parsed.hideRarityLine !== true;
      if (parsed.showRarityLine !== true && neverHidRarity) {
        displayOptions.showRarityLine = true;
        saveDisplayOptions();
      }

      // Migration: the Pattern colour pickers used to be inert and shipped with
      // placeholder defaults that never matched the real palette. Now that they
      // actually drive rendering, snap any untouched legacy values to the palette
      // so nobody's board changes colour on its own.
      const app = displayOptions.appearance;
      const legacyPatternDefaults = {
        patternOffensive: "#FBAE31",
        patternDefensive: "#2D8A5A",
        patternHp: "#D4AD2B",
        patternEquibalance: "#3B6DC7",
      };
      let migratedPattern = false;
      Object.entries(legacyPatternDefaults).forEach(([key, legacy]) => {
        if (app[key] === legacy) {
          app[key] = DEFAULT_THEME_APPEARANCE[key];
          migratedPattern = true;
        }
      });
      if (migratedPattern) saveDisplayOptions();
    }
  } catch (e) {
    console.warn("Could not parse display options", e);
  }
}

function getBoardFontFamily(fontKey) {
  switch (fontKey) {
    case "mono":
      return "var(--mono-font)";
    case "serif":
      return "var(--serif-font)";
    case "sans":
      return 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    case "arial":
      return 'Arial, "Helvetica Neue", Helvetica, sans-serif';
    case "georgia":
      return 'Georgia, "Noto Serif TC", serif';
    case "courier":
      return '"Courier New", Courier, monospace';
    case "default":
    default:
      return "var(--board-font)";
  }
}

function hexToRgba(color, alpha) {
  if (!color || color === "transparent") return "transparent";
  const numAlpha = alpha !== undefined ? Number(alpha) : 1;
  const clampedAlpha = Math.max(0, Math.min(1, isNaN(numAlpha) ? 1 : numAlpha));
  if (color.startsWith("rgba")) {
    const match = color.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (match) {
      return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${clampedAlpha})`;
    }
  }
  let hex = color.replace("#", "");
  if (hex.length === 3) {
    hex = hex.split("").map((c) => c + c).join("");
  }
  if (hex.length === 6) {
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${clampedAlpha})`;
  }
  return color;
}

function applyCustomAppearance() {
  const app = displayOptions.appearance || DEFAULT_THEME_APPEARANCE;
  const showcaseBoard = document.getElementById("showcase-board");
  const fontValue = getBoardFontFamily(app.boardFont);

  document.documentElement.style.setProperty("--board-font", fontValue);

  const uppercaseValue = app.boardUppercase === false ? "none" : "uppercase";
  document.documentElement.style.setProperty("--board-title-case", uppercaseValue);
  document.documentElement.style.setProperty("--tier-label-case", uppercaseValue);
  document.documentElement.style.setProperty("--tier-label-width", `${app.tierLabelWidth !== undefined ? app.tierLabelWidth : 110}px`);

  if (showcaseBoard) {
    if (customBoardBgImageUrl) {
      showcaseBoard.style.backgroundColor = "transparent";
      showcaseBoard.style.backgroundImage = `url("${customBoardBgImageUrl}")`;
      showcaseBoard.style.backgroundSize = "cover";
      showcaseBoard.style.backgroundPosition = "center";
      showcaseBoard.style.backgroundRepeat = "no-repeat";
    } else {
      showcaseBoard.style.backgroundImage = "none";
      showcaseBoard.style.backgroundColor = app.boardBg || "#111111";
    }
    showcaseBoard.style.setProperty("--board-font", fontValue);
    showcaseBoard.style.fontFamily = fontValue;
  }

  if (boardTitleLabel) {
    boardTitleLabel.style.color = app.boardTitleColor || "rgba(244, 239, 233, 0.84)";
    const size = app.boardTitleSize !== undefined ? app.boardTitleSize : 0.74;
    boardTitleLabel.style.fontSize = `${size}rem`;
    boardTitleLabel.style.fontFamily = fontValue;
    boardTitleLabel.style.textTransform = uppercaseValue;
  }

  // Board Header Box Variables
  const bhOpacity = app.boardHeaderBgOpacity !== undefined ? app.boardHeaderBgOpacity : 1;
  const rawBhBg = app.boardHeaderBg || "transparent";
  const boardHeaderBgFinal = (rawBhBg === "transparent") ? "transparent" : hexToRgba(rawBhBg, bhOpacity);
  document.documentElement.style.setProperty("--board-header-bg", boardHeaderBgFinal);
  document.documentElement.style.setProperty("--board-header-border-color", app.boardHeaderBorderColor || "rgba(255, 255, 255, 0.1)");
  document.documentElement.style.setProperty("--board-header-border-width", `${app.boardHeaderBorderWidth !== undefined ? app.boardHeaderBorderWidth : 1}px`);
  document.documentElement.style.setProperty("--board-header-spacing", `${app.spacingHeaderToTiers !== undefined ? app.spacingHeaderToTiers : 20}px`);

  // Tier Box Variables
  const tbOpacity = app.tierBoxOpacity !== undefined ? app.tierBoxOpacity : 0.1;
  const tbRawBg = "#000000";
  document.documentElement.style.setProperty("--tier-box-bg", hexToRgba(tbRawBg, tbOpacity));
  document.documentElement.style.setProperty("--tier-box-border-color", "rgba(255, 255, 255, 0.04)");
  document.documentElement.style.setProperty("--tier-box-border-width", `${app.tierBoxBorderWidth !== undefined ? app.tierBoxBorderWidth : 1}px`);
  document.documentElement.style.setProperty("--tier-box-radius", `${app.tierBoxRadius !== undefined ? app.tierBoxRadius : 0}px`);
  document.documentElement.style.setProperty("--tier-row-spacing", `${app.spacingBetweenTierRows !== undefined ? app.spacingBetweenTierRows : 14}px`);

  // Character Card Scale
  const charScale = app.charCardScale !== undefined ? app.charCardScale : 1.0;
  document.documentElement.style.setProperty("--char-card-scale", charScale);
  document.documentElement.style.setProperty("--char-card-width", `${Math.round(60 * charScale)}px`);
  document.documentElement.style.setProperty("--char-avatar-size", `${Math.round(60 * charScale)}px`);

  // Character Info Badge Variables
  const bgOpacity = app.charInfoBgOpacity !== undefined ? app.charInfoBgOpacity : 0.22;
  const rawBg = app.charInfoBg || "#121212";
  const charInfoBg = app.charInfoBgEnabled === false ? "transparent" : hexToRgba(rawBg, bgOpacity);
  document.documentElement.style.setProperty("--char-info-bg", charInfoBg);
  document.documentElement.style.setProperty("--char-info-border-color", app.charInfoBorderColor || "transparent");
  document.documentElement.style.setProperty("--char-info-border-width", `${app.charInfoBorderWidth !== undefined ? app.charInfoBorderWidth : 0}px`);
  document.documentElement.style.setProperty("--char-info-radius", `${app.charInfoRadius !== undefined ? app.charInfoRadius : 0}px`);

  // Update root CSS variables for live styles
  document.documentElement.style.setProperty("--accent-e", app.euphoriaColor || "#04FFEE");
  document.documentElement.style.setProperty("--chube-lv-color", app.chubeLevelColor || "#ffffff");
  document.documentElement.style.setProperty("--chube-amp-color", app.chubeAmpColor || "#ffffff");
  document.documentElement.style.setProperty("--chube-amp-max-color", app.chubeAmpMaxColor || "#DF7526");
  document.documentElement.style.setProperty("--chube-count-color", app.chubeCountColor || "#04FFEE");
  document.documentElement.style.setProperty("--unowned-char-opacity", app.unownedOpacity !== undefined ? app.unownedOpacity : 0.35);

  // Character Name Color
  document.documentElement.style.setProperty("--char-name-color", app.charNameColor || "rgba(244, 239, 233, 0.8)");

  // Chess Pieces Variables
  document.documentElement.style.setProperty("--chess-piece-size", `${app.chessPiecesSize !== undefined ? app.chessPiecesSize : 20}px`);
  const chessOpacity = app.chessPiecesOpacity !== undefined ? app.chessPiecesOpacity : (app.chessPiecesContainerOpacity !== undefined ? app.chessPiecesContainerOpacity : 1);
  document.documentElement.style.setProperty("--chess-piece-opacity", chessOpacity);
}

function saveDisplayOptions() {
  localStorage.setItem(OPTIONS_STORAGE_KEY, JSON.stringify(displayOptions));
}

function loadFutureSightState() {
  const saved = localStorage.getItem(FUTURE_SIGHT_STORAGE_KEY);
  futureSightEnabled = saved === "true"; // default false
}

function saveFutureSightState() {
  localStorage.setItem(FUTURE_SIGHT_STORAGE_KEY, String(futureSightEnabled));
}

// Persist the toolbar filters (ownership + rarity) so they survive reloads
function saveFilterState() {
  try {
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({
      ownership: activeOwnershipFilter,
      rarities: [...activeRarityFilters],
    }));
  } catch (e) {
    console.warn("Could not save filter state", e);
  }
}

function loadFilterState() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(FILTER_STORAGE_KEY) || "null");
  } catch (e) {
    saved = null;
  }
  if (!saved || typeof saved !== "object") return;

  if (saved.ownership === "all" || saved.ownership === "owned" || saved.ownership === "unowned") {
    activeOwnershipFilter = saved.ownership;
  }
  if (Array.isArray(saved.rarities)) {
    activeRarityFilters = new Set(saved.rarities.map(Number).filter((n) => !isNaN(n)));
  }
}

/** Syncs the filter buttons' .active class with the restored state. */
function applyFilterButtonState() {
  filterOwnershipBtns.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.ownership === activeOwnershipFilter);
  });
  filterRarityBtns.forEach((btn) => {
    btn.classList.toggle("active", activeRarityFilters.has(Number(btn.dataset.rarity)));
  });
}

function buildFutureSightMap(data) {
  futureSightChars = new Set();
  futureSightEuphorias = new Map();
  futureSightSkins = new Set();
  futureSightPsychubes = new Set();

  if (!data || typeof data !== "object") return;

  if (Array.isArray(data.Character)) {
    data.Character.forEach((raw) => {
      const canonical = resolveCharacterName(raw);
      if (canonical) futureSightChars.add(canonical);
    });
  }

  if (Array.isArray(data.Euphoria)) {
    data.Euphoria.forEach((entry) => {
      // Format is "CharacterName: tierNumber" e.g. "37: 1"
      const parts = String(entry).split(":");
      if (parts.length === 2) {
        const canonical = resolveCharacterName(parts[0].trim());
        const tier = Number(parts[1].trim());
        if (canonical && !isNaN(tier)) {
          if (!futureSightEuphorias.has(canonical)) {
            futureSightEuphorias.set(canonical, new Set());
          }
          futureSightEuphorias.get(canonical).add(tier);
        }
      }
    });
  }

  if (Array.isArray(data.Skin)) {
    data.Skin.forEach((entry) => {
      const skinId = Number(String(entry).trim());
      if (!isNaN(skinId)) {
        futureSightSkins.add(skinId);
      }
    });
  }

  // Psychube is { "6": [ids...], "5": [ids...] }
  if (data.Psychube && typeof data.Psychube === "object") {
    Object.entries(data.Psychube).forEach(([rarity, ids]) => {
      if (!Array.isArray(ids)) return;
      ids.forEach((id) => {
        futureSightPsychubes.add(psychubeKey(rarity, String(id).trim()));
      });
    });
  }
}

function buildExcludeMap(data) {
  excludedCharacters = new Set();
  if (!data) return;

  let list = [];
  if (Array.isArray(data)) {
    list = data;
  } else if (typeof data === "object") {
    if (Array.isArray(data.Character)) list = data.Character;
    else if (Array.isArray(data.characters)) list = data.characters;
    else if (Array.isArray(data.exclude)) list = data.exclude;
    else list = Object.keys(data);
  }

  list.forEach((item) => {
    if (item && typeof item === "string") {
      const trimmed = item.trim();
      if (trimmed) excludedCharacters.add(trimmed);
    }
  });
}

/**
 * Characters whose displayed name is set in italics. "Lady by the Lake" is an
 * in-game artwork title rather than an Arcanist name, so it is styled apart.
 */
const ITALIC_NAME_CHARS = new Set(["Lady by the Lake"]);

/** True when the character's rendered name should be italicised. */
function isItalicNameCharacter(name) {
  return ITALIC_NAME_CHARS.has(name);
}

/** Global name transfers: maps a raw/alternate name to the canonical roster key. */function buildGlobalNameTransfer(data) {
  globalNameTransfer = {};
  if (!data || typeof data !== "object" || Array.isArray(data)) return;
  Object.entries(data).forEach(([from, to]) => {
    if (typeof from === "string" && typeof to === "string" && from.trim() && to.trim()) {
      globalNameTransfer[from.trim()] = to.trim();
    }
  });
}

/** Collab characters: counted in Statistics but excluded from board chess pieces. */
function buildCollabMap(data) {
  collabCharacters = new Set();
  if (!data) return;

  let list = [];
  if (Array.isArray(data)) {
    list = data;
  } else if (typeof data === "object") {
    if (Array.isArray(data.Character)) list = data.Character;
    else if (Array.isArray(data.characters)) list = data.characters;
    else list = Object.keys(data);
  }

  list.forEach((item) => {
    if (item && typeof item === "string") {
      const trimmed = item.trim();
      if (trimmed) collabCharacters.add(trimmed);
    }
  });
}

/** Resolves aliases so a collab entry matches the canonical roster key. */
function isCollabCharacter(name) {
  if (!name) return false;
  if (collabCharacters.has(name)) return true;
  for (const [standardName, aliases] of Object.entries(NAME_ALIASES)) {
    if (standardName === name || aliases.includes(name)) {
      if (collabCharacters.has(standardName)) return true;
      for (const al of aliases) {
        if (collabCharacters.has(al)) return true;
      }
    }
  }
  return false;
}

function isCharacterExcluded(name, item) {
  if (!name) return false;
  if (excludedCharacters.has(name)) return true;
  for (const [standardName, aliases] of Object.entries(NAME_ALIASES)) {
    if (standardName === name || aliases.includes(name)) {
      if (excludedCharacters.has(standardName)) return true;
      for (const al of aliases) {
        if (excludedCharacters.has(al)) return true;
      }
    }
  }
  if (item) {
    if (item.nameEng && excludedCharacters.has(item.nameEng)) return true;
    if (item.name && excludedCharacters.has(item.name)) return true;
    if (item.id && (excludedCharacters.has(String(item.id)) || excludedCharacters.has(item.id))) return true;
  }
  return false;
}

// Initial Setup
async function initApp() {
  try {
    const [rarityRes, arcanistRes, futureRes, excludeRes, afflatusRes, resoShapeRes, shapePatternRes, i18nRes, nameMapRes, psychubeRes, collabRes, nameTransferRes, teamArchRes, guideBuildsRes, guideRotationsRes, guideSkillsRes, guideProgRes, creditsRes, itemsRes, matsReqRes, itemFormulasRes, charProfilesRes, patternCostsRes, charSkillsRes, charEuphoriasRes, skillGlossaryRes, psychubesDataRes, psychubeKeyMapRes, codeRewardsRes, eventShopRes, levelCostsRes, farmStagesRes, bannersRes, gachaRes] = await Promise.all([
      fetch("data/characters_by_rarity.json"),
      fetch("data/ArcanistMap.json"),
      fetch("data/future_sight.json").catch(() => null),
      fetch("data/exclude_character.json").catch(() => null),
      fetch("data/characters_by_afflatus.json").catch(() => null),
      fetch("data/character_reso_shape.json").catch(() => null),
      fetch("data/shape_patterns.json").catch(() => null),
      fetch("content/i18n.json").catch(() => null),
      fetch("data/name_map.json").catch(() => null),
      fetch("data/psychube_id.json").catch(() => null),
      fetch("data/collab_character.json").catch(() => null),
      fetch("data/global_name_transfer.json").catch(() => null),
      fetch("content/teams.json").catch(() => null),
      fetch("content/builds.json").catch(() => null),
      fetch("content/rotations.json").catch(() => null),
      fetch("content/guide_skills.json").catch(() => null),
      fetch("content/progressions.json").catch(() => null),
      fetch("content/credits.json").catch(() => null),
      fetch("data/items.json").catch(() => null),
      fetch("data/characters_mats_required.json").catch(() => null),
      fetch("data/item_formulas.json").catch(() => null),
      fetch("data/character_profiles.json").catch(() => null),
      fetch("data/pattern_costs.json").catch(() => null),
      fetch("data/character_skills.json").catch(() => null),
      fetch("data/character_euphorias.json").catch(() => null),
      fetch("content/skill_glossary.json").catch(() => null),
      fetch("data/psychubes_data.json").catch(() => null),
      fetch("data/psychube_key_map.json").catch(() => null),
      fetch("data/code_reward_index.json").catch(() => null),
      fetch("data/event_shop.json").catch(() => null),
      fetch("data/progression_levels.json").catch(() => null),
      fetch("data/stages/farm.json").catch(() => null),
      fetch("data/banners.json").catch(() => null),
      fetch("data/gacha_rules.json").catch(() => null),
    ]);

    if (excludeRes && excludeRes.ok) {
      try {
        const excludeData = await excludeRes.json();
        buildExcludeMap(excludeData);
      } catch (e) {
        console.warn("Could not parse exclude_character.json", e);
      }
    }

    if (collabRes && collabRes.ok) {
      try {
        const collabData = await collabRes.json();
        buildCollabMap(collabData);
      } catch (e) {
        console.warn("Could not parse collab_character.json", e);
      }
    }

    if (nameTransferRes && nameTransferRes.ok) {
      try {
        const transferData = await nameTransferRes.json();
        buildGlobalNameTransfer(transferData);
      } catch (e) {
        console.warn("Could not parse global_name_transfer.json", e);
      }
    }

    try {
      const arcanistData = await arcanistRes.json();
      buildArcanistData(arcanistData);
    } catch (e) {
      console.warn("Could not parse ArcanistMap.json", e);
    }

    try {
      const rarityData = await rarityRes.json();
      buildRarityMap(rarityData);
    } catch (e) {
      console.warn("Could not parse characters_by_rarity.json", e);
    }

    if (futureRes && futureRes.ok) {
      try {
        futureSightData = await futureRes.json();
        buildFutureSightMap(futureSightData);
      } catch (e) {
        console.warn("Could not parse future_sight.json", e);
      }
    }

    if (afflatusRes && afflatusRes.ok) {
      try {
        const afflatusData = await afflatusRes.json();
        buildAfflatusMap(afflatusData);
      } catch (e) {
        console.warn("Could not parse characters_by_afflatus.json", e);
      }
    }

    if (resoShapeRes && resoShapeRes.ok) {
      try {
        const resoShapeData = await resoShapeRes.json();
        buildResoShapeMap(resoShapeData);
      } catch (e) {
        console.warn("Could not parse character_reso_shape.json", e);
      }
    }

    if (shapePatternRes && shapePatternRes.ok) {
      try {
        const shapePatternData = await shapePatternRes.json();
        buildShapePatternMap(shapePatternData);
      } catch (e) {
        console.warn("Could not parse shape_patterns.json", e);
      }
    }

    if (i18nRes && i18nRes.ok) {
      try {
        i18nStrings = await i18nRes.json();
      } catch (e) {
        console.warn("Could not parse i18n.json", e);
      }
    }
    // Fallback or augment from locales/ if needed
    if (!i18nStrings || !i18nStrings[currentLang]) {
      try {
        const locRes = await fetch(`locales/${currentLang}.json`);
        if (locRes.ok) {
          i18nStrings = i18nStrings || {};
          i18nStrings[currentLang] = await locRes.json();
        }
      } catch (e) {
        console.warn(`Could not load locales/${currentLang}.json`, e);
      }
    }

    if (nameMapRes && nameMapRes.ok) {
      try {
        const nm = await nameMapRes.json();
        nameMap = {
          character: nm.character || {},
          skin: nm.skin || {},
        };
      } catch (e) {
        console.warn("Could not parse name_map.json", e);
      }
    }

    if (psychubeRes && psychubeRes.ok) {
      try {
        const psychubeData = await psychubeRes.json();
        buildPsychubeData(psychubeData);
      } catch (e) {
        console.warn("Could not parse psychube_id.json", e);
      }
    }

    if (psychubeKeyMapRes && psychubeKeyMapRes.ok) {
      try {
        psychubeKeyMapCache = (await psychubeKeyMapRes.json()) || {};
      } catch (e) {
        console.warn("Could not parse psychube_key_map.json", e);
      }
    }

    if (teamArchRes && teamArchRes.ok) {
      try {
        const teamArchData = await teamArchRes.json();
        buildTeamArchetypes(teamArchData);
      } catch (e) {
        console.warn("Could not parse team_archetypes.json", e);
      }
    }

    // Guide content is optional: a missing file just leaves that tab empty.
    const readJson = async (res) => {
      if (!res || !res.ok) return null;
      try {
        return await res.json();
      } catch (e) {
        console.warn("Could not parse guide data", e);
        return null;
      }
    };
    buildGuideData({
      builds: await readJson(guideBuildsRes),
      rotations: (await readJson(guideRotationsRes))?.rotations,
      skills: await readJson(guideSkillsRes),
      progressions: await readJson(guideProgRes),
    });
    buildInfoBookData({
      items: await readJson(itemsRes),
      formulas: await readJson(itemFormulasRes),
      matsRequired: await readJson(matsReqRes),
      profiles: await readJson(charProfilesRes),
      patternCosts: await readJson(patternCostsRes),
      skillsData: await readJson(charSkillsRes),
      euphoriasData: await readJson(charEuphoriasRes),
      glossaryData: await readJson(skillGlossaryRes),
      psychubesDetail: await readJson(psychubesDataRes),
      codeRewards: await readJson(codeRewardsRes),
    });
    loadRotationList();
    buildCredits(await readJson(creditsRes));
    buildEventShopData(await readJson(eventShopRes));
    buildLevelCostData(await readJson(levelCostsRes));
    buildPlannerFarmData(await readJson(farmStagesRes));
    // The Calculator needs the roster (head art) and the pity curve, both already
    // built by this point.
    buildCalculatorData(await readJson(bannersRes), await readJson(gachaRes));
    plannerLoadActivity();
    plannerLoadWilderness();
    plannerLoadChars();
    // Reopen the Planner on the tab the reader left, not always on Calculator.
    loadPlannerTab();

    loadLanguage();
    applyTranslations();
    refreshDynamicTranslations();
    setupSlidingThumbs();
    loadTitle();
    loadListingConfig();
    loadFutureSightState();
    loadDisplayOptions();
    loadFilterState();
    applyCustomAppearance();
    loadRoster();
    loadPsychubes();
    loadTeams();
    applyFilterButtonState();
    renderShowcase();
    setupEventListeners();
  } catch (err) {
    console.error("Failed to load initial data:", err);
  }
}

function loadTitle() {
  const savedTitle = localStorage.getItem(TITLE_STORAGE_KEY);
  if (savedTitle !== null) {
    boardTitleLabel.textContent = savedTitle.trim() || "Suitcase";
    inputBoardTitle.value = savedTitle;
  } else {
    boardTitleLabel.textContent = "Suitcase";
    inputBoardTitle.value = "";
  }
}

/* ---------------- Psychube helpers ---------------- */

/** Stable key for a psychube: "rarity:id" (e.g. "6:73"). */
function psychubeKey(rarity, id) {
  return `${rarity}:${id}`;
}

function isSpecialPsychube(key) {
  const id = String(key).split(":")[1];
  return PSYCHUBE_SPECIAL_IDS.includes(id);
}

function psychubeName(key) {
  const c = psychubeDb[key];
  if (!c) return key;
  if (currentLang === "cn" && c.nameCn) return c.nameCn;
  return c.name;
}

/**
 * True when a psychube matches a search query. Both the English and Chinese
 * names are tested so a CN query works regardless of the active language.
 */
function psychubeMatchesQuery(key, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  const c = psychubeDb[key];
  if (!c) return false;
  if (String(c.name || "").toLowerCase().includes(q)) return true;
  if (String(c.nameCn || "").toLowerCase().includes(q)) return true;
  return psychubeName(key).toLowerCase().includes(q);
}

function psychubeIconUrl(key) {
  const c = psychubeDb[key];
  return c ? c.iconUrl : "";
}

/**
 * InfoBook psychube detail art: `images/equip_defaulticon/<id>.png`, copied from
 * Myssal `singlebg/equip_defaulticon` by `npm run sync:assets`. It is the wide
 * illustration (276x228) the game's psychube detail screen shows, whereas
 * `p.icon` is the 180x214 board icon (the same art with the rarity line along the
 * bottom). The rail keeps `p.icon` — this is the detail pane only.
 */
function psychubeDetailArt(p) {
  return p && p.id ? `images/equip_defaulticon/${p.id}.png` : (p && p.icon) || "";
}

function buildPsychubeData(data) {
  psychubeDb = {};
  psychubeOrder = [];
  if (!data || typeof data !== "object") return;

  // Rarity 6 first, then 5 — each list already comes newest-id-first
  ["6", "5"].forEach((rarity) => {
    const list = data[rarity];
    if (!Array.isArray(list)) return;
    list.forEach((item) => {
      if (!item || item.id === undefined) return;
      const key = psychubeKey(rarity, item.id);
      psychubeDb[key] = {
        rarity: Number(rarity),
        id: String(item.id),
        name: item.name || `Chube ${item.id}`,
        nameCn: item.nameCN || "",
        tags: Array.isArray(item.tags) ? item.tags.slice() : [],
        releasePatch: item.release_patch || "",
        iconUrl: `images/psychube_icon/${rarity}/${item.id}.png`,
      };
      psychubeOrder.push(key);
    });
  });
}

/** Psychube state, defaulting to unowned. */
function getPsychubeState(key) {
  if (!userPsychubes[key]) {
    userPsychubes[key] = { owned: false, level: 1, amplification: PSYCHUBE_MIN_AMP, count: 0 };
  }
  return userPsychubes[key];
}

function sanitizePsychubeState() {
  let changed = false;
  // Drop entries that no longer exist in the data
  Object.keys(userPsychubes).forEach((key) => {
    if (!psychubeDb[key]) {
      delete userPsychubes[key];
      changed = true;
    }
  });
  // Ensure every chube exists with sane values
  psychubeOrder.forEach((key) => {
    const c = psychubeDb[key];
    let s = userPsychubes[key];
    if (!s) {
      s = userPsychubes[key] = { owned: false, level: 1, amplification: PSYCHUBE_MIN_AMP, count: 0 };
      changed = true;
    }
    if (isSpecialPsychube(key)) {
      // Special chubes only track a count
      const n = Math.max(0, Math.min(PSYCHUBE_MAX_COUNT, Math.floor(Number(s.count) || 0)));
      if (s.count !== n) { s.count = n; changed = true; }
      if (s.owned !== n > 0) { s.owned = n > 0; changed = true; }
      if (s.level !== 1) { s.level = 1; changed = true; }
      if (s.amplification !== PSYCHUBE_MIN_AMP) { s.amplification = PSYCHUBE_MIN_AMP; changed = true; }
      return;
    }
    const lvl = Math.max(1, Math.min(PSYCHUBE_MAX_LEVEL, Number(s.level) || 1));
    const amp = Math.max(PSYCHUBE_MIN_AMP, Math.min(PSYCHUBE_MAX_AMP, Number(s.amplification) || PSYCHUBE_MIN_AMP));
    if (s.level !== lvl) { s.level = lvl; changed = true; }
    if (s.amplification !== amp) { s.amplification = amp; changed = true; }
    if (typeof s.owned !== "boolean") { s.owned = !!s.owned; changed = true; }
    void c;
  });
  return changed;
}

function loadPsychubes() {
  try {
    const saved = localStorage.getItem(PSYCHUBE_STORAGE_KEY);
    userPsychubes = saved ? JSON.parse(saved) : {};
    if (!userPsychubes || typeof userPsychubes !== "object") userPsychubes = {};
  } catch (e) {
    console.warn("Could not parse psychube state", e);
    userPsychubes = {};
  }
  if (migratePsychubeKeys()) savePsychubes();
  if (sanitizePsychubeState()) savePsychubes();
}

/**
 * One-time translation of saved chube keys from the old invented sequential ids to
 * game ids (e.g. "6:73" -> "6:1579"), using data/psychube_key_map.json. Without this
 * every existing player's psychube collection would be silently dropped.
 */
function migratePsychubeKeys() {
  let changed = false;
  const out = {};
  for (const [key, state] of Object.entries(userPsychubes)) {
    const next = psychubeKeyMapCache[key] || key;
    if (next !== key) changed = true;
    out[next] = out[next] ? mergePsychubeState(out[next], state) : state;
  }
  if (changed) userPsychubes = out;
  return changed;
}

function mergePsychubeState(a, b) {
  const norm = (s) => ({
    owned: !!s.owned,
    level: Number(s.level) || 1,
    amplification: Number(s.amplification) || PSYCHUBE_MIN_AMP,
    count: Number(s.count) || 0,
  });
  const x = norm(a), y = norm(b);
  return {
    owned: x.owned || y.owned,
    level: Math.max(x.level, y.level),
    amplification: Math.max(x.amplification, y.amplification),
    count: x.count + y.count,
  };
}

function savePsychubes() {
  localStorage.setItem(PSYCHUBE_STORAGE_KEY, JSON.stringify(userPsychubes));
}

/** Rank a special chube: Gluttony (✦6) then Greed (✦5). */
function specialPsychubeRank(key) {
  const c = psychubeDb[key];
  if (!c || !isSpecialPsychube(key)) return 999;
  return c.rarity === 6 ? 0 : 1;
}

/** Sort with special chubes first (Gluttony, then Greed), then Rarity > Level > ID. */
function comparePsychubesSpecialFirst(a, b) {
  const sa = isSpecialPsychube(a), sb = isSpecialPsychube(b);
  if (sa !== sb) return sa ? -1 : 1;
  if (sa && sb) return specialPsychubeRank(a) - specialPsychubeRank(b);
  return comparePsychubes(a, b);
}

/** Sort with special chubes first (Gluttony, then Greed), then Rarity > ID.
 *  Used for unowned rows, which have no build data to sort by. */
function comparePsychubesSpecialFirstUnowned(a, b) {
  const sa = isSpecialPsychube(a), sb = isSpecialPsychube(b);
  if (sa !== sb) return sa ? -1 : 1;
  if (sa && sb) return specialPsychubeRank(a) - specialPsychubeRank(b);
  return comparePsychubesUnowned(a, b);
}

/** Psychube sort order: Rarity (6 first) > Level desc > ID desc. */
function comparePsychubes(keyA, keyB) {
  const a = psychubeDb[keyA], b = psychubeDb[keyB];
  if (!a || !b) return 0;
  if (a.rarity !== b.rarity) return b.rarity - a.rarity;
  const sa = userPsychubes[keyA] || {}, sb = userPsychubes[keyB] || {};
  const la = Number(sa.level) || 1, lb = Number(sb.level) || 1;
  if (la !== lb) return lb - la;
  return Number(b.id) - Number(a.id);
}

/** Unowned chubes have no build data, so they sort by Rarity (6 first) > ID desc. */
function comparePsychubesUnowned(keyA, keyB) {
  const a = psychubeDb[keyA], b = psychubeDb[keyB];
  if (!a || !b) return 0;
  if (a.rarity !== b.rarity) return b.rarity - a.rarity;
  return Number(b.id) - Number(a.id);
}

function buildRarityMap(rarityData) {
  characterRarityMap = {};
  for (const [star, list] of Object.entries(rarityData)) {
    if (Array.isArray(list)) {
      list.forEach((name) => {
        characterRarityMap[name] = Number(star);
      });
    }
  }

  // Map alias names to standard names in icon.json
  for (const [standardName, aliases] of Object.entries(NAME_ALIASES)) {
    if (characterRarityMap[standardName] === undefined) {
      for (const al of aliases) {
        if (characterRarityMap[al] !== undefined) {
          characterRarityMap[standardName] = characterRarityMap[al];
          break;
        }
      }
    }
  }
}

const CANONICAL_NAME_OVERRIDES = {
  3066: "37",
  3079: "6",
  3074: "Ezra",
  3094: "J",
  3056: "Jessica",
  3070: "Kaalaa Baunaa",
  3110: "Liang Yue",
  3087: "Vila",
  3078: "Avgust",
  3082: "Yenisei",
  3041: "Matilda",
  3034: "AliEn T",
};

function buildArcanistData(arcanistData) {
  characterDb = {};
  characterIdMap = {};
  characterSkinsMap = {};
  characterDisplayEn = {};
  characterDisplayCn = {};

  if (!Array.isArray(arcanistData)) return;

  arcanistData.forEach((item) => {
    if (!item || !item.id || item.id === 9998) return;

    const charName = CANONICAL_NAME_OVERRIDES[item.id] || item.nameEng || item.name;
    if (!charName) return;

    if (isCharacterExcluded(charName, item)) return;

    characterIdMap[charName] = item.id;
    if (item.nameEng) characterIdMap[item.nameEng] = item.id;
    if (item.name) characterIdMap[item.name] = item.id;

    // Display names come straight from ArcanistMap.json so the data file is the
    // single source of truth, while the canonical key stays stable for saves.
    if (item.nameEng) characterDisplayEn[charName] = item.nameEng;
    if (item.name) characterDisplayCn[charName] = item.name;

    const rawSkins = Array.isArray(item.live2d) ? item.live2d : [];
    const skins = [];

    rawSkins.forEach((skin, idx) => {
      const sId = String(skin.id || "");
      if (!skin.id || sId.length > 6) return;

      const isDefault = idx === 0 || skin.des === "初始皮肤" || sId.endsWith("01");
      const skinName = isDefault
        ? "Default"
        : (skin.characterSkinNameEng || skin.characterSkin || skin.des || `Skin ${idx + 1}`);

      skins.push({
        id: skin.id,
        name: skinName,
        // Chinese label from ArcanistMap, used when the UI language is Chinese
        nameCn: skin.characterSkin || "",
        isDefault: isDefault,
        iconUrl: `images/headicon_small/${skin.id}.png`,
      });
    });

    characterSkinsMap[charName] = skins;

    const defaultSkin = skins.find((s) => s.isDefault) || skins[0];
    const defaultIcon = defaultSkin ? defaultSkin.iconUrl : `images/headicon_small/${item.id}01.png`;
    characterDb[charName] = defaultIcon;
  });

  // Map alias names to standard character ID
  for (const [standardName, aliases] of Object.entries(NAME_ALIASES)) {
    if (characterIdMap[standardName] !== undefined) {
      for (const al of aliases) {
        if (characterIdMap[al] === undefined) {
          characterIdMap[al] = characterIdMap[standardName];
        }
      }
    }
  }
}

function getCharacterSkins(name) {
  const allSkins = characterSkinsMap[name] || [];
  if (futureSightEnabled) {
    return allSkins;
  }
  return allSkins.filter((s) => !futureSightSkins.has(Number(s.id)));
}

function getSkinInfo(name, skinId) {
  const skins = getCharacterSkins(name);
  if (!skins || skins.length === 0) return null;
  return skins.find((s) => Number(s.id) === Number(skinId)) || null;
}

function getCardAvatarUrl(name, char, defaultUrl) {
  const fallback = defaultUrl || characterDb[name];
  if (!char || !char.owned || displayOptions.hideSkin || !char.skin) {
    return fallback;
  }
  const skinInfo = getSkinInfo(name, char.skin);
  if (!skinInfo || skinInfo.isDefault) {
    return fallback;
  }
  return skinInfo.iconUrl || fallback;
}

function normalizeCharacterKey(name) {
  if (!name) return "";
  return String(name).trim();
}

function resolveCharacterName(name) {
  const raw = normalizeCharacterKey(name);
  if (!raw) return "";

  if (globalNameTransfer[raw]) return globalNameTransfer[raw];
  for (const [from, to] of Object.entries(globalNameTransfer)) {
    if (to === raw) return raw;
  }

  if (characterDb[raw] !== undefined) return raw;

  for (const [standardName, aliases] of Object.entries(NAME_ALIASES)) {
    if (standardName === raw || aliases.includes(raw)) {
      return standardName;
    }
  }

  const normalizedRaw = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const key of Object.keys(characterDb)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (normalizedKey === normalizedRaw) return key;
    if (normalizedKey.startsWith(normalizedRaw)) return key;
  }

  return raw;
}

function buildAfflatusMap(afflatusData) {
  characterAfflatus = {};

  if (!afflatusData || typeof afflatusData !== "object") return;

  Object.entries(afflatusData).forEach(([afflatusType, names]) => {
    if (!Array.isArray(names)) return;

    names.forEach((rawName) => {
      const canonical = resolveCharacterName(rawName);
      if (canonical) {
        characterAfflatus[canonical] = afflatusType;
      }
    });
  });
}

function getCharacterAfflatus(name) {
  const canonical = resolveCharacterName(name);
  return characterAfflatus[canonical] || null;
}

/* ---------------- Resonance shape patterns ---------------- */

const DEFAULT_PATTERN = "Placidity";

// Colour families shared by every shape's pattern list
const PATTERN_COLORS = {
  orange: "#F67E26",
  green: "#62A771",
  yellow: "#E6AE34",
  blue: "#4A70B3",
  placidity: "#E5E7EB",
};

// Which colour family each pattern belongs to (Placidity is the neutral default)
const PATTERN_COLOR_FAMILY = {
  // Orange — offensive-leaning
  Aspirational: "orange",
  Delirament: "orange",
  Elucidation: "orange",
  Genuinity: "orange",
  Hyper: "orange",
  Hyperphrenia: "orange",
  Inspire: "orange",
  // Green — defensive-leaning
  Equanimity: "green",
  Mercy: "green",
  Overindulgence: "green",
  Prudentiality: "green",
  Quiescence: "green",
  // Yellow / Blue — special
  Stupefaction: "yellow",
  Equibalance: "blue",
  // Default
  Placidity: "placidity",
};

function buildResoShapeMap(data) {
  characterResoShape = {};
  if (!data || typeof data !== "object") return;
  Object.entries(data).forEach(([shape, names]) => {
    if (!Array.isArray(names)) return;
    names.forEach((rawName) => {
      const canonical = resolveCharacterName(rawName);
      if (canonical) characterResoShape[canonical] = shape;
    });
  });
}

function buildShapePatternMap(data) {
  shapePatterns = {};
  if (!data || typeof data !== "object") return;
  Object.entries(data).forEach(([shape, patterns]) => {
    if (Array.isArray(patterns)) shapePatterns[shape] = patterns.slice();
  });
}

function getCharacterResoShape(name) {
  const canonical = resolveCharacterName(name);
  return characterResoShape[canonical] || null;
}

/** Pattern list available to a character, based on its resonance shape.
 *  Placidity is the implicit default, so it is excluded from the picker. */
function getPatternsForCharacter(name) {
  const shape = getCharacterResoShape(name);
  const all = (shape && shapePatterns[shape]) ? shapePatterns[shape] : [DEFAULT_PATTERN];
  const selectable = all.filter((p) => p !== DEFAULT_PATTERN);
  return selectable.length ? selectable : [DEFAULT_PATTERN];
}

function isKnownPattern(patternName) {
  return Object.prototype.hasOwnProperty.call(PATTERN_COLOR_FAMILY, patternName);
}

function getPatternColor(patternName) {
  const family = PATTERN_COLOR_FAMILY[patternName] || "placidity";
  const app = displayOptions.appearance || {};
  // User-configured colours from the Styling modal override the defaults
  switch (family) {
    case "orange": return app.patternOffensive || PATTERN_COLORS.orange;
    case "green": return app.patternDefensive || PATTERN_COLORS.green;
    case "yellow": return app.patternHp || PATTERN_COLORS.yellow;
    case "blue": return app.patternEquibalance || PATTERN_COLORS.blue;
    default: return app.patternNone || PATTERN_COLORS.placidity;
  }
}

/** Path to the pattern icon for a character (null when unknown). */
function getPatternIconPath(name, patternName) {
  const shape = getCharacterResoShape(name);
  if (!shape || !patternName) return null;
  return `images/shape_pattern/${shape}/${patternName}.png`;
}

/** Same as getPatternIconPath, but for a shape name directly. */
function getPatternIconPathForShape(shape, patternName) {
  if (!shape || !patternName) return "";
  return `images/shape_pattern/${shape}/${patternName}.png`;
}

/* ---------------- Owned patterns & the chosen "main" ---------------- */

/**
 * Normalises a roster entry's pattern data into { owned: string[], main: string }.
 * Handles both the current schema and the legacy single-value `boxKind`.
 */
function normalizePatternState(name, char) {
  const allowed = getPatternsForCharacter(name);
  const allowedSet = new Set(allowed);

  // New schema: { patterns: [...], patternMain: "..." } stored on the roster entry
  if (Array.isArray(char.patterns) || typeof char.patternMain === "string") {
    let owned = Array.isArray(char.patterns) ? char.patterns.filter((p) => allowedSet.has(p)) : [];
    let main = allowedSet.has(char.patternMain) ? char.patternMain : null;
    if (main && !owned.includes(main)) owned.unshift(main);
    if (!main && owned.length) main = owned[0];
    return { owned, main };
  }

  // Legacy: a single boxKind value (already migrated to a valid pattern or Placidity)
  if (char.boxKind && allowedSet.has(char.boxKind)) {
    return { owned: [char.boxKind], main: char.boxKind };
  }

  return { owned: [], main: null };
}

/** The colour-driving pattern for a card: the main one, else the neutral default. */
function getMainPattern(name, char) {
  const { main } = normalizePatternState(name, char || {});
  return main || DEFAULT_PATTERN;
}

/**
 * Builds the per-character Euphoria index from `character_euphorias.json`.
 *
 * A character's entries are ordered: the first tree is Euphoria 1 (`E1`), the
 * second (only nine characters have one) is Euphoria 2 (`E2`). The stored names
 * are the real, localized tree names, e.g. "Shine Bright Like Regulus".
 */
function buildEuphoriaMap(euphoriaData) {
  euphoriaOptionsByName = {};
  euphoriaNamesByTier = {};
  euphoriaAllowedNames = new Set();

  if (!euphoriaData || typeof euphoriaData !== "object") return;

  Object.entries(euphoriaData).forEach(([rawName, entries]) => {
    if (!Array.isArray(entries) || !entries.length) return;
    const canonical = resolveCharacterName(rawName);
    if (!canonical) return;

    euphoriaOptionsByName[canonical] = [];
    euphoriaNamesByTier[canonical] = {};

    entries.slice(0, 2).forEach((entry, index) => {
      const tier = index + 1;
      euphoriaOptionsByName[canonical].push(tier);
      if (entry && entry.name) euphoriaNamesByTier[canonical][tier] = entry.name;
    });
    euphoriaAllowedNames.add(canonical);
  });
}

/** Locates the localized name of a character's Euphoria tree for a given tier. */
function getEuphoriaTreeName(name, tier) {
  const canonical = resolveCharacterName(name);
  const stored = euphoriaNamesByTier[canonical] && euphoriaNamesByTier[canonical][tier];
  if (!stored) return "";
  return currentLang === "cn" ? stored.zh || stored.en || "" : stored.en || stored.zh || "";
}

function getEuphoriaDisplayName(name, tier) {
  const treeName = getEuphoriaTreeName(name, tier);
  const tag = fmtEuphoria(tier);
  if (treeName) return `${treeName} (${tag})`;
  return `Euphoria ${tier} (${tag})`;
}

/**
 * The character editor labels each Euphoria checkbox with the tree's icon
 * (`images/arcanists/euphoria/<charId>_<tier>.webp`) so the checkbox reads at a
 * glance. Ezra and J never shipped art, so those fall back to the tree name.
 */
function setEuphoriaCheckLabel(host, name, tier) {
  if (!host) return;
  const displayName = getEuphoriaDisplayName(name, tier);
  host.textContent = displayName;

  const mats = getCharacterMats(name);
  const charId = mats && mats.id;
  if (!charId || !getEligibleEuphoriaLevels(name).includes(tier)) return;

  const img = document.createElement("img");
  img.className = "euphoria-check-icon";
  img.alt = displayName;
  img.title = displayName;
  // A missing file keeps the text label instead of showing a broken image.
  img.addEventListener("error", () => {
    host.textContent = displayName;
  }, { once: true });
  img.src = `images/arcanists/euphoria/${charId}_${tier}.webp`;

  const thumb = document.createElement("span");
  thumb.className = "euphoria-check-thumb";
  const badge = document.createElement("span");
  badge.className = "euphoria-check-tier";
  badge.textContent = fmtEuphoria(tier);
  thumb.append(img, badge);

  host.textContent = "";
  host.appendChild(thumb);
}

function getEligibleEuphoriaLevels(name) {
  const canonical = resolveCharacterName(name);
  if (!canonical) return [];
  const allLevels = Array.isArray(euphoriaOptionsByName[canonical]) ? [...euphoriaOptionsByName[canonical]] : [];
  if (futureSightEnabled) {
    return allLevels;
  }
  // Filter out tiers that belong to future sight
  const futureTiers = futureSightEuphorias.get(canonical);
  if (!futureTiers) return allLevels;
  return allLevels.filter((t) => !futureTiers.has(t));
}

function isCharacterEligibleForEuphoria(name) {
  return getEligibleEuphoriaLevels(name).length > 0;
}

function sanitizeEuphoriaState(name, char) {
  const eligibleLevels = getEligibleEuphoriaLevels(name);
  const meetsLevelRequirement = Number(char.insight) === 3 && Number(char.level) >= 30;
  if (!eligibleLevels.length || !meetsLevelRequirement) {
    return {
      e1: false,
      e2: false,
    };
  }

  return {
    e1: eligibleLevels.includes(1) ? !!char.e1 : false,
    e2: eligibleLevels.includes(2) ? !!char.e2 : false,
  };
}

// Load Roster from LocalStorage or Generate Default
function sanitizeRosterState() {
  // Remove any excluded or non-existent characters from roster
  let changed = false;
  for (const name in userRoster) {
    if (isCharacterExcluded(name) || !characterDb[name]) {
      delete userRoster[name];
      changed = true;
    }
  }

  // Ensure all characters exist in roster with default values (default unowned)
  for (const name in characterDb) {
    const rarity = getCharacterRarity(name);
    const maxInsight = getMaxInsightForRarity(rarity);
    const maxLevel = getMaxLevelForInsight(maxInsight);

    if (!userRoster[name]) {
      userRoster[name] = {
        owned: false,
        insight: maxInsight,
        level: maxLevel,
        resonance: 10,
        portrait: 0,
        e1: false,
        e2: false,
        patterns: [],
        patternMain: null,
        boxKind: DEFAULT_PATTERN,
        skin: null,
        favourite: false,
      };
      changed = true;
    } else {
      if (userRoster[name].insight === undefined || userRoster[name].insight > maxInsight) {
        userRoster[name].insight = maxInsight;
        changed = true;
      }
      const charMaxLvl = getMaxLevelForInsight(userRoster[name].insight);
      if (userRoster[name].level === undefined || userRoster[name].level > charMaxLvl) {
        userRoster[name].level = charMaxLvl;
        changed = true;
      }
      const charMaxRes = getMaxResonanceForInsight(userRoster[name].insight);
      if (userRoster[name].resonance === undefined || userRoster[name].resonance > charMaxRes) {
        userRoster[name].resonance = charMaxRes;
        changed = true;
      }
      // Migrate legacy pattern keys ("offensive"/"defensive"/"hp"/"equibalance"/"none")
            // into the current shape-based pattern set.
            const patternState = normalizePatternState(name, userRoster[name]);
            const currentOwned = Array.isArray(userRoster[name].patterns) ? userRoster[name].patterns : null;
            const currentMain = typeof userRoster[name].patternMain === "string" ? userRoster[name].patternMain : null;
            if (
              !currentOwned ||
              currentOwned.join("|") !== patternState.owned.join("|") ||
              currentMain !== patternState.main
            ) {
              userRoster[name].patterns = patternState.owned;
              userRoster[name].patternMain = patternState.main;
              userRoster[name].boxKind = patternState.main || DEFAULT_PATTERN;
              changed = true;
            }
            if (userRoster[name].skin === undefined) {
              userRoster[name].skin = null;
              changed = true;
            }
            if (typeof userRoster[name].favourite !== "boolean") {
              userRoster[name].favourite = !!userRoster[name].favourite;
              changed = true;
            }

      const sanitizedEuphoria = sanitizeEuphoriaState(name, userRoster[name]);
      if (userRoster[name].e1 !== sanitizedEuphoria.e1 || userRoster[name].e2 !== sanitizedEuphoria.e2) {
        userRoster[name].e1 = sanitizedEuphoria.e1;
        userRoster[name].e2 = sanitizedEuphoria.e2;
        changed = true;
      }
    }
  }

  if (changed) {
    saveRoster();
  }
}

function loadRoster() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      userRoster = JSON.parse(saved);
    } catch (e) {
      userRoster = {};
    }
  }
  sanitizeRosterState();
}

function saveRoster() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(userRoster));
}

// Sorting helper for owned characters: Rarity > Insight > Level > Portrait > Release order (ArcanistMap ID descending)
function compareCharacters(nameA, nameB) {
  const charA = userRoster[nameA] || {
    owned: false,
    insight: 3,
    level: 60,
    resonance: 10,
    portrait: 0,
  };
  const charB = userRoster[nameB] || {
    owned: false,
    insight: 3,
    level: 60,
    resonance: 10,
    portrait: 0,
  };

  // 0. Favourites are pinned to the front of their tier. Among several
  //    favourites the normal ordering below still applies.
  const favA = charA.favourite ? 1 : 0;
  const favB = charB.favourite ? 1 : 0;
  if (favA !== favB) {
    return favB - favA;
  }

  // 1. Rarity (6-star > 5-star > 4-star ...)
  const rarityA = getCharacterRarity(nameA);
  const rarityB = getCharacterRarity(nameB);
  if (rarityA !== rarityB) {
    return rarityB - rarityA;
  }

  // 2. Insight (I3 > I2 > I1 > I0)
  const insightA = charA.insight !== undefined ? charA.insight : 3;
  const insightB = charB.insight !== undefined ? charB.insight : 3;
  if (insightA !== insightB) {
    return insightB - insightA;
  }

  // 3. Level (Lv.60 > Lv.50 > ...)
  const levelA = charA.level !== undefined ? charA.level : 60;
  const levelB = charB.level !== undefined ? charB.level : 60;
  if (levelA !== levelB) {
    return levelB - levelA;
  }

  // 4. Portrait (P5 > P4 > ... > P0)
  const portraitA = charA.portrait !== undefined ? charA.portrait : 0;
  const portraitB = charB.portrait !== undefined ? charB.portrait : 0;
  if (portraitA !== portraitB) {
    return portraitB - portraitA;
  }

  // 5. Release order based on ArcanistMap id (newest to oldest, higher ID first)
  const idA = getCharacterReleaseId(nameA);
  const idB = getCharacterReleaseId(nameB);
  if (idA !== idB) {
    return idB - idA;
  }

  return nameA.localeCompare(nameB);
}

// Sorting helper for unowned characters: Rarity > Release order by ID (newest to oldest)
function compareUnownedCharacters(nameA, nameB) {
  // 1. Rarity (6-star > 5-star > 4-star ...)
  const rarityA = getCharacterRarity(nameA);
  const rarityB = getCharacterRarity(nameB);
  if (rarityA !== rarityB) {
    return rarityB - rarityA;
  }

  // 2. Release order based on ArcanistMap id (newest to oldest, higher ID first)
  const idA = getCharacterReleaseId(nameA);
  const idB = getCharacterReleaseId(nameB);
  if (idA !== idB) {
    return idB - idA;
  }
  return nameA.localeCompare(nameB);
}

function isCharacterUnbuilt(char) {
  return Number(char.insight || 0) === 0 && Number(char.level || 1) === 1 && Number(char.resonance || 1) === 1;
}

// Check single atomic condition
function evalSingleCondition(cond, char, rarity) {
  if (!cond || !cond.field) return true;
  const field = cond.field;
  const op = cond.op || "=";
  const targetVal = cond.value;

  const res = Number(char.resonance !== undefined ? char.resonance : 1);
  const lvl = Number(char.level !== undefined ? char.level : 1);
  const insight = Number(char.insight !== undefined ? char.insight : 0);
  const portrait = Number(char.portrait !== undefined ? char.portrait : 0);
  const boxKind = char.boxKind || DEFAULT_PATTERN;
  const hasEuphoria = !!(char.e1 || char.e2);
  const hasPattern = boxKind !== DEFAULT_PATTERN;
  const hasSkin = !!(char.skin && !String(char.skin).endsWith("01"));

  if (field === "has_euphoria") {
    const want = String(targetVal) !== "false";
    return hasEuphoria === want;
  }
  if (field === "has_pattern") {
    const want = String(targetVal) !== "false";
    return hasPattern === want;
  }
  if (field === "has_skin") {
    const want = String(targetVal) !== "false";
    return hasSkin === want;
  }
  if (field === "favourite") {
    const want = String(targetVal) !== "false";
    return !!char.favourite === want;
  }
  if (field === "afflatus") {
    const actual = getCharacterAfflatus(char.name) || "";
    const want = String(targetVal || "");
    if (!want) return true;
    if (op === "!=") return actual !== want;
    // "Mineral_Star" hybrid characters satisfy both Mineral and Star
    if (want === "Mineral" && actual === "Mineral_Star") return true;
    if (want === "Star" && actual === "Mineral_Star") return true;
    return actual === want;
  }
  if (field === "name") {
    const wantName = String(targetVal || "").trim().toLowerCase();
    if (!wantName) return true;
    const actualName = String(char.name || "").trim().toLowerCase();
    if (actualName === wantName || actualName.includes(wantName)) return true;

    // Check alias mapping
    const canonical = resolveCharacterName(char.name);
    if (canonical && canonical.toLowerCase().includes(wantName)) return true;
    const aliases = (NAME_ALIASES[char.name] || []).concat(NAME_ALIASES[canonical] || []);
    return aliases.some((a) => a.toLowerCase().includes(wantName));
  }

  let charVal = 0;
  if (field === "portrait") charVal = portrait;
  else if (field === "resonance") charVal = res;
  else if (field === "insight") charVal = insight;
  else if (field === "level") charVal = lvl;
  else if (field === "rarity") charVal = Number(rarity || 5);

  const numTarget = Number(targetVal !== undefined ? targetVal : 0);

  switch (op) {
    case "=": return charVal === numTarget;
    case ">=": return charVal >= numTarget;
    case "<=": return charVal <= numTarget;
    case ">": return charVal > numTarget;
    case "<": return charVal < numTarget;
    case "!=": return charVal !== numTarget;
    default: return charVal === numTarget;
  }
}

// Convert legacy string rule (e.g. 'r15', 'lv60') into ruleGroups: [[cond, ...], [cond, ...]]
function convertLegacyRuleToGroups(rule) {
  if (typeof rule !== "string") return [];
  switch (rule) {
    case "r15": return [[{ field: "resonance", op: ">=", value: 15 }]];
    case "r14": return [[{ field: "resonance", op: "=", value: 14 }]];
    case "r13": return [[{ field: "resonance", op: "=", value: 13 }]];
    case "r12": return [[{ field: "resonance", op: "=", value: 12 }]];
    case "r11": return [[{ field: "resonance", op: "=", value: 11 }]];
    case "r10": return [[{ field: "resonance", op: "=", value: 10 }]];
    case "r11-14": return [[{ field: "resonance", op: ">=", value: 11 }, { field: "resonance", op: "<=", value: 14 }]];
    case "r11-13": return [[{ field: "resonance", op: ">=", value: 11 }, { field: "resonance", op: "<=", value: 13 }]];
    case "r1-9": return [[{ field: "resonance", op: ">=", value: 1 }, { field: "resonance", op: "<=", value: 9 }]];
    case "r10_pattern": return [[{ field: "resonance", op: "=", value: 10 }, { field: "has_pattern", op: "=", value: true }]];
    case "r10_no_pattern": return [[{ field: "resonance", op: "=", value: 10 }, { field: "has_pattern", op: "=", value: false }]];
    case "r10_euphoria": return [[{ field: "resonance", op: "=", value: 10 }, { field: "has_euphoria", op: "=", value: true }]];
    case "has_euphoria": return [[{ field: "has_euphoria", op: "=", value: true }]];
    case "lv60": return [[{ field: "level", op: "=", value: 60 }]];
    case "non_lv60": return [[{ field: "level", op: "<", value: 60 }]];
    case "i3": return [[{ field: "insight", op: "=", value: 3 }]];
    case "i2": return [[{ field: "insight", op: "=", value: 2 }]];
    case "i1": return [[{ field: "insight", op: "=", value: 1 }]];
    case "i0": return [[{ field: "insight", op: "=", value: 0 }]];
    case "rarity_6": return [[{ field: "rarity", op: "=", value: 6 }]];
    case "rarity_5": return [[{ field: "rarity", op: "=", value: 5 }]];
    case "rarity_4": return [[{ field: "rarity", op: "=", value: 4 }]];
    case "rarity_3": return [[{ field: "rarity", op: "=", value: 3 }]];
    case "rarity_2": return [[{ field: "rarity", op: "=", value: 2 }]];
    case "rarity_2_4": return [[{ field: "rarity", op: ">=", value: 2 }, { field: "rarity", op: "<=", value: 4 }]];
    case "unbuilt": return [[{ field: "insight", op: "=", value: 0 }, { field: "level", op: "=", value: 1 }, { field: "resonance", op: "=", value: 1 }]];
    default: return [];
  }
}

// Matches tier rule using nested groups: (Group1 AND) OR (Group2 AND) ...
function matchesTierRule(tier, char, rarity) {
  let groups = tier.ruleGroups;
  if (!Array.isArray(groups) || groups.length === 0) {
    if (tier.rule && typeof tier.rule === "string") {
      groups = convertLegacyRuleToGroups(tier.rule);
    } else {
      return true;
    }
  }

  if (groups.length === 0) return true;

  // OR across groups
  return groups.some((group) => {
    if (!Array.isArray(group) || group.length === 0) return true;
    // AND within a group
    return group.every((cond) => evalSingleCondition(cond, char, rarity));
  });
}

/** Evaluates a single psychube condition. */
function evalPsychubeCondition(cond, chube, state) {
  if (!cond || !cond.field) return true;
  const op = cond.op || "=";
  const target = cond.value;

  if (cond.field === "owned") {
    const want = String(target) !== "false";
    return !!state.owned === want;
  }
  if (cond.field === "tag") {
    const want = String(target || "").trim();
    if (!want) return true;
    const has = (chube.tags || []).includes(want);
    return op === "!=" ? !has : has;
  }

  if (cond.field === "name") {
    const want = String(target || "").trim().toLowerCase();
    if (!want) return true;
    const actual = psychubeName(chube.__key || "").toLowerCase();
    // fall back to both language names when the key is not attached
    const en = String(chube.name || "").toLowerCase();
    const cn = String(chube.nameCn || "").toLowerCase();
    const hit = actual.includes(want) || en.includes(want) || cn.includes(want);
    return op === "!=" ? !hit : hit;
  }

  let actual = 0;
  if (cond.field === "amplification") actual = Number(state.amplification) || 0;
  else if (cond.field === "level") actual = Number(state.level) || 1;
  else if (cond.field === "rarity") actual = Number(chube.rarity) || 5;
  else return true;

  const numTarget = Number(target !== undefined ? target : 0);
  switch (op) {
    case "=": return actual === numTarget;
    case "!=": return actual !== numTarget;
    case ">=": return actual >= numTarget;
    case "<=": return actual <= numTarget;
    case ">": return actual > numTarget;
    case "<": return actual < numTarget;
    default: return actual === numTarget;
  }
}

/** Psychube tier rule: OR across groups, AND within a group. */
function matchesPsychubeRule(tier, chube, state) {
  const groups = tier.ruleGroups;
  if (!Array.isArray(groups) || groups.length === 0) return true;
  return groups.some((group) => {
    if (!Array.isArray(group) || group.length === 0) return true;
    return group.every((cond) => evalPsychubeCondition(cond, chube, state));
  });
}

function renderChessPieces() {
  const existingContainer = document.getElementById("chess-pieces-container");
  if (existingContainer) {
    existingContainer.remove();
  }

  const app = displayOptions.appearance || DEFAULT_THEME_APPEARANCE;
  if (!app.chessPiecesEnabled) return;

  const showcaseBoard = document.getElementById("showcase-board");
  if (!showcaseBoard) return;

  const totalByRarity = { 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  const ownedByRarity = { 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };

  const allNames = Object.keys(characterDb);
  allNames.forEach((name) => {
    if (!futureSightEnabled && futureSightChars.has(name)) return;
    // Collab characters are not counted on the board's chess pieces.
    // The Statistics modal intentionally still includes them.
    if (isCollabCharacter(name)) return;
    const rarity = getCharacterRarity(name);
    if (rarity >= 2 && rarity <= 6) {
      totalByRarity[rarity]++;
      const char = userRoster[name];
      if (char && char.owned) {
        ownedByRarity[rarity]++;
      }
    }
  });

  const chessPieces = [
    { rarity: 2, name: "Rook", empty: "images/chess_pieces/crook_empty.png", filled: "images/chess_pieces/crook_filled.png", w: 41, h: 92 },
    { rarity: 3, name: "Knight", empty: "images/chess_pieces/knight_empty.png", filled: "images/chess_pieces/knight_filled.png", w: 48, h: 95 },
    { rarity: 4, name: "Bishop", empty: "images/chess_pieces/bishop_empty.png", filled: "images/chess_pieces/bishop_filled.png", w: 41, h: 99 },
    { rarity: 5, name: "King", empty: "images/chess_pieces/king_empty.png", filled: "images/chess_pieces/king_filled.png", w: 42, h: 109 },
    { rarity: 6, name: "Queen", empty: "images/chess_pieces/queen_empty.png", filled: "images/chess_pieces/queen_filled.png", w: 43, h: 105 },
  ];

  const container = document.createElement("div");
  container.id = "chess-pieces-container";
  container.className = "chess-pieces-container";

  chessPieces.forEach((piece) => {
    const total = totalByRarity[piece.rarity];
    const owned = ownedByRarity[piece.rarity];
    const pct = total > 0 ? (owned / total) * 100 : 0;
    const insetTop = Math.max(0, Math.min(100, 100 - pct));

    const wrapper = document.createElement("div");
    wrapper.className = "chess-piece-wrapper";
    wrapper.dataset.piece = piece.name;
    wrapper.style.width = `calc(var(--chess-piece-size) * ${piece.w} / 41)`;
    wrapper.style.height = `calc(var(--chess-piece-size) * ${piece.h} / 41)`;

    const imgEmpty = document.createElement("img");
    imgEmpty.className = "chess-piece-empty";
    imgEmpty.src = piece.empty;
    imgEmpty.alt = `${piece.name} Empty`;

    const imgFilled = document.createElement("img");
    imgFilled.className = "chess-piece-filled";
    imgFilled.src = piece.filled;
    imgFilled.alt = `${piece.name} Filled`;
    imgFilled.style.height = `calc(var(--chess-piece-size) * ${piece.h} / 41)`;

    const fillMask = document.createElement("div");
    fillMask.className = "chess-piece-fill-mask";
    fillMask.style.top = `${insetTop}%`;
    fillMask.appendChild(imgFilled);

    const tooltip = document.createElement("div");
    tooltip.className = "chess-piece-tooltip";
    tooltip.innerHTML = `
      <div style="font-weight: 700; color: #fff; margin-bottom: 2px;">${piece.name} (✦${piece.rarity})</div>
      <div>${t("action.owned")}: ${owned}/${total} (${Math.round(pct)}%)</div>
    `;

    wrapper.appendChild(imgEmpty);
    wrapper.appendChild(fillMask);
    wrapper.appendChild(tooltip);
    container.appendChild(wrapper);
  });

  if (app.chessPiecesPosition === "bottom") {
    container.classList.add("pos-bottom");
    showcaseBoard.appendChild(container);
  } else {
    container.classList.add("pos-top");
    const boardHeader = showcaseBoard.querySelector(".board-header");
    if (boardHeader) {
      boardHeader.appendChild(container);
    } else {
      showcaseBoard.insertBefore(container, showcaseBoard.firstChild);
    }
  }
}

// Render Showcase Board
function renderShowcase() {
  const query = filterSearch.value.trim().toLowerCase();

  tierRowsContainer.innerHTML = "";

  let ownedCount = 0;
  let totalCount = 0;

  const allNames = Object.keys(characterDb);
  const ownedNames = [];
  const unownedNames = [];

  allNames.forEach((name) => {
    if (!futureSightEnabled && futureSightChars.has(name)) return;

    const rarity = getCharacterRarity(name);
    if (activeRarityFilters.size > 0 && !activeRarityFilters.has(rarity)) return;

    totalCount++;
    const char = userRoster[name] || { owned: false };
    if (char.owned) {
      ownedCount++;
      ownedNames.push(name);
    } else {
      unownedNames.push(name);
    }
  });

  // Sort owned characters by: Rarity > Insight > Level > Portrait > Release ID
  ownedNames.sort(compareCharacters);

  // Sort unowned characters solely by Release ID (newest to oldest)
  unownedNames.sort(compareUnownedCharacters);

  // Build Tier buckets based on listingConfig
  const tierBuckets = [];

  (listingConfig.tiers || []).forEach((t) => {
    tierBuckets.push({
      id: t.id,
      type: t.type || "custom",
      label: t.label || "Tier",
      color: t.color || "#ffffff",
      bgColor: t.bgColor || null,
      borderColor: t.borderColor || null,
      bold: !!t.bold,
      tierConfig: t,
      cards: [],
    });
  });

  // ---- Psychube bucketing (mirrors the character flow) ----
  // "Owned" means a normal chube is owned, or a special chube (id 1) has count > 0.
  const chubeQuery = query;
  const chubeMatchesQuery = (key) => psychubeMatchesQuery(key, chubeQuery);
  const isChubeOwned = (key) => {
    const st = userPsychubes[key] || {};
    return isSpecialPsychube(key) ? (Number(st.count) || 0) > 0 : !!st.owned;
  };
  const chubePassesRarity = (key) => activeRarityFilters.size === 0 || activeRarityFilters.has(psychubeDb[key].rarity);
  // Gluttony (✦6) / Greed (✦5) can be hidden from the board entirely
  const chubeHiddenBySpecialToggle = (key) => {
    if (!isSpecialPsychube(key)) return false;
    const rarity = psychubeDb[key].rarity;
    if (displayOptions.hideGluttony && rarity === 6) return true;
    if (displayOptions.hideGreed && rarity === 5) return true;
    return false;
  };
  const chubeBase = psychubeOrder.filter((key) =>
    chubeMatchesQuery(key) && chubePassesRarity(key) && !chubeHiddenBySpecialToggle(key) &&
    (futureSightEnabled || !futureSightPsychubes.has(key))
  );
  const unmatchedChubes = new Set(chubeBase.filter((key) => isChubeOwned(key)));
  const unmatchedUnownedChubes = new Set(
    chubeBase.filter((key) => !isChubeOwned(key))
  );

  const unmatchedOwned = new Set(ownedNames);

  // Evaluate each tier in user's configured order
  tierBuckets.forEach((bucket) => {
    if (bucket.type === "unowned") {
      // Unowned characters are placed here
      if (activeOwnershipFilter !== "owned") {
        unownedNames.forEach((name) => {
          if (!characterMatchesQuery(name, query)) return;
          const char = userRoster[name] || {
            owned: false,
            insight: 3,
            level: 60,
            resonance: 10,
            portrait: 0,
            e1: false,
            e2: false,
            boxKind: DEFAULT_PATTERN,
          };
          const iconUrl = characterDb[name];
          const card = createCharacterCard(name, char, iconUrl);
          bucket.cards.push(card);
        });
      }
    } else if (bucket.type === "other") {
      // Remaining / Other catches any owned characters not matched by previous tiers
      if (activeOwnershipFilter !== "unowned") {
        const remainingToCatch = [...unmatchedOwned];
        remainingToCatch.forEach((name) => {
          if (!characterMatchesQuery(name, query)) return;
          const char = {
            ...(userRoster[name] || {
              owned: true,
              insight: 3,
              level: 60,
              resonance: 10,
              portrait: 0,
              e1: false,
              e2: false,
              boxKind: DEFAULT_PATTERN,
            }),
            name: name,
          };
          const iconUrl = characterDb[name];
          const card = createCharacterCard(name, char, iconUrl);
          bucket.cards.push(card);
          unmatchedOwned.delete(name);
        });
      }
    } else if (bucket.type === "psychube_unowned") {
      // Fixed row: every chube you do not own yet (no build data, so Rarity > ID)
      [...unmatchedUnownedChubes]
        .sort(comparePsychubesSpecialFirstUnowned)
        .forEach((key) => {
          bucket.isChube = true;
          bucket.cards.push(createPsychubeCard(key));
          unmatchedUnownedChubes.delete(key);
        });
    } else if (bucket.type === "psychube_other") {
      // Fixed catch-all: owned chubes matching no tier above
      [...unmatchedChubes]
        .sort(comparePsychubesSpecialFirst)
        .forEach((key) => {
          bucket.isChube = true;
          bucket.cards.push(createPsychubeCard(key));
          unmatchedChubes.delete(key);
        });
    } else if (bucket.type === "psychube") {
      // Psychube tier
      let candidates = [...unmatchedChubes];
      candidates = bucket.tierConfig.isDefaultPsychubeOwned
        ? candidates.sort(comparePsychubesSpecialFirst)
        : candidates.sort((a, b) => {
            const sa = isSpecialPsychube(a), sb = isSpecialPsychube(b);
            if (sa !== sb) return sa ? -1 : 1;
            if (sa && sb) return specialPsychubeRank(a) - specialPsychubeRank(b);
            return comparePsychubes(a, b);
          });
      candidates.forEach((key) => {
        const chube = psychubeDb[key];
        const st = userPsychubes[key] || {};
        if (matchesPsychubeRule(bucket.tierConfig, chube, st)) {
          bucket.isChube = true;
          bucket.cards.push(createPsychubeCard(key));
          unmatchedChubes.delete(key);
        }
      });
    } else {      // Custom tier: matches owned characters that satisfy ruleGroups
      if (activeOwnershipFilter !== "unowned") {
        const currentCandidates = [...unmatchedOwned];
        currentCandidates.forEach((name) => {
          if (!characterMatchesQuery(name, query)) return;
          const rarity = getCharacterRarity(name);
          const char = {
            ...(userRoster[name] || {
              owned: true,
              insight: 3,
              level: 60,
              resonance: 10,
              portrait: 0,
              e1: false,
              e2: false,
              boxKind: DEFAULT_PATTERN,
            }),
            name: name,
          };
          if (matchesTierRule(bucket.tierConfig, char, rarity)) {
            const iconUrl = characterDb[name];
            const card = createCharacterCard(name, char, iconUrl);
            bucket.cards.push(card);
            unmatchedOwned.delete(name);
          }
        });
      }
    }
  });

  // Safety net: any owned chube that matched no tier is appended to the first
  // Psychube tier so it can never silently disappear from the board.
  if (unmatchedChubes.size > 0) {
    const firstChubeTier = tierBuckets.find((b) => b.type === "psychube");
    if (firstChubeTier) {
      [...unmatchedChubes].sort(comparePsychubesSpecialFirst).forEach((key) => {
        firstChubeTier.cards.push(createPsychubeCard(key));
        unmatchedChubes.delete(key);
      });
    }
  }

  // Render all tier sections in the exact order configured
  tierBuckets.forEach((bucket) => {
    // Hidden tiers never render on the board
    if (bucket.tierConfig && bucket.tierConfig.hidden) return;
    const isPsychubeTier = bucket.type === "psychube" || bucket.type === "psychube_other" || bucket.type === "psychube_unowned";
    // The new Display toggles hide every tier of the matching kind
    if (displayOptions.hideCharacterTier && !isPsychubeTier) return;
    if (displayOptions.hidePsychubeTier && isPsychubeTier) return;
    // The All / Owned / Unowned filter also applies to psychubes
    if (activeOwnershipFilter === "owned" && bucket.type === "psychube_unowned") return;
    if (activeOwnershipFilter === "unowned" && (bucket.type === "psychube" || bucket.type === "psychube_other")) return;
    // Owned filter hides the character Unowned row too
    if (activeOwnershipFilter === "owned" && bucket.type === "unowned") return;
    // Rows only render when they actually hold cards, so an empty Unowned
    // row disappears while searching instead of showing a bare label.
    if (bucket.cards.length > 0) {
      renderTierRowSection(bucket.label, bucket.color, bucket.cards, bucket.bgColor, bucket.borderColor, bucket.bold);
    }
  });

  rosterStat.innerHTML = `<span data-i18n="toolbar.crew">${t("toolbar.crew")}</span> ${ownedCount}/${totalCount} <img src="images/random_icon/vertin_crew_icon.png" alt="Crew" class="roster-stat-icon" />`;

  renderChessPieces();
}

// Create Psychube Card Element (mirrors the character card)
function createPsychubeCard(key) {
  const chube = psychubeDb[key];
  const card = document.createElement("div");
  if (!chube) return card;

  const state = getPsychubeState(key);
  const special = isSpecialPsychube(key);

  card.className = `char-card chube-card ${!state.owned ? "is-unowned" : ""}`;
  card.dataset.chubeKey = key;

  const rarityVal = chube.rarity;

  // Badge row above the icon: Amplification on the left (A5 highlights),
  // Level centred — mirroring the character card's layout.
  // Both badges honour the Psychube Details Hiding rules.
  const ampVal = Number(state.amplification) || PSYCHUBE_MIN_AMP;
  const levelVal = Number(state.level) || 1;

  const ampHiddenByPreset =
    (displayOptions.hideA1 && ampVal === PSYCHUBE_MIN_AMP) ||
    (displayOptions.hideA5 && ampVal === PSYCHUBE_MAX_AMP);
  const ampHiddenByRule = (displayOptions.customAmpHideRules || []).some(
    (rule) => rule.enabled && Number(rule.amplification) === ampVal
  );
  const showAmp = !displayOptions.hideAmplification && !ampHiddenByPreset && !ampHiddenByRule;

  const levelHiddenByPreset =
    (displayOptions.hideLv1 && levelVal === 1) ||
    (displayOptions.hideLv60 && levelVal === PSYCHUBE_MAX_LEVEL);
  const levelHiddenByRule = (displayOptions.customLevelHideRules || []).some(
    (rule) => rule.enabled && Number(rule.level) === levelVal
  );
  const showChubeLevel = !displayOptions.hidePsychubeLevel && !levelHiddenByPreset && !levelHiddenByRule;

  const ampClass = ampVal >= PSYCHUBE_MAX_AMP ? "chube-amp-badge is-max" : "chube-amp-badge";
  const ampBadgeHtml = special
    ? ((Number(state.count) || 0) > 0 ? `<span class="chube-amp-badge chube-count-badge">x${Number(state.count) || 0}</span>` : "")
    : (state.owned && showAmp ? `<span class="${ampClass}">${fmtAmp(ampVal)}</span>` : "");
  const levelBadgeHtml = (state.owned && !special && showChubeLevel)
    ? `<span class="chube-level-badge">Lv.${levelVal}</span>` : "";
  const badgeRowHtml = ampBadgeHtml + levelBadgeHtml;

  // Psychube cards never show the character rarity line
  const rarityLineHtml = "";

  // Owned names follow "Hide Owned"; unowned names follow "Hide Unowned"
  const showChubeName = state.owned ? !displayOptions.hideOwnedNames : !displayOptions.hideNames;
  const nameRowHtml = showChubeName
    ? `<div class="char-name-below">${escapeHtml(psychubeName(key))}</div>`
    : "";

  const tooltipHtml = `
    <div class="char-tooltip chube-tooltip no-export">
      <div class="ct-head">
        <span class="ct-name">${escapeHtml(psychubeName(key))}</span>
      </div>
      <div class="ct-body">
        ${special
          ? `<div class="ct-row"><span class="ct-label">${t("chube.owned")}</span><span class="ct-value">x${Number(state.count) || 0}</span></div>`
          : state.owned
            ? `
            <div class="ct-row"><span class="ct-label">${t("chube.level")}</span><span class="ct-value">${Number(state.level) || 1}</span></div>
            <div class="ct-row"><span class="ct-label">${t("chube.amplification")}</span><span class="ct-value">${fmtAmp(Number(state.amplification) || PSYCHUBE_MIN_AMP)}</span></div>
          `
            : `<div class="ct-row"><span class="ct-value ct-unowned">${escapeHtml(t("action.unowned"))}</span></div>`}
      </div>
    </div>
  `;

  card.innerHTML = `
    <div class="char-avatar-box">
      <img src="${escapeHtml(chube.iconUrl)}" alt="${escapeHtml(chube.name)}" class="char-avatar-img chube-avatar-img" loading="lazy" decoding="async" />
      ${badgeRowHtml}
    </div>
    ${rarityLineHtml}
    ${nameRowHtml}
    ${tooltipHtml}
  `;

  card.addEventListener("click", () => openPsychubeModal(key));
  return card;
}

function renderTierRowSection(label, color, cards, customBg, customBorder, isBold) {
  const section = document.createElement("section");
  section.className = "tier-row";

  const app = displayOptions.appearance || DEFAULT_THEME_APPEARANCE;
  const tbOpacity = app.tierBoxOpacity !== undefined ? app.tierBoxOpacity : 0.1;

  if (customBg && customBg !== "transparent") {
    section.style.background = hexToRgba(customBg, tbOpacity);
  }
  if (customBorder && customBorder !== "transparent") {
    section.style.borderColor = customBorder;
  }

  const tierSize = app.tierLabelSize !== undefined ? app.tierLabelSize : 0.70;

  const labelEl = document.createElement("div");
  labelEl.className = "tier-label";
  labelEl.textContent = label;
  labelEl.style.color = color;
  labelEl.style.fontSize = `${tierSize}rem`;
  labelEl.style.fontFamily = getBoardFontFamily(app.boardFont);
  if (isBold) {
    labelEl.style.fontWeight = "900";
  }
  // Count tooltip follows the cursor over the tier label.
  // Psychube rows report psychubes instead of characters.
  const isChubeRow = cards.some((c) => c.classList.contains("chube-card"));
  labelEl.dataset.tierCount = String(cards.length);
  labelEl.dataset.tierUnit = isChubeRow ? "psychube" : "character";
  labelEl.dataset.tierLabel = label;

  const contentEl = document.createElement("div");
  contentEl.className = "tier-content";

  cards.forEach((card) => contentEl.appendChild(card));

  section.appendChild(labelEl);
  section.appendChild(contentEl);
  tierRowsContainer.appendChild(section);
}

function getPatternDisplayName(patternName) {
  if (!patternName || patternName === DEFAULT_PATTERN) return "";
  if (!isKnownPattern(patternName)) return "";
  return patternLabel(patternName);
}

/**
 * Renders the pattern picker for the character being edited.
 *
 * Model: a character may OWN several patterns but only one is "main".
 *  - First pattern clicked becomes the main one (marked with a badge).
 *  - Clicking an owned, non-main pattern promotes it to main.
 *  - Clicking the main pattern demotes it; the next owned pattern takes over.
 *  - Placidity is the implicit default and is never shown here.
 */
function renderShapePatternGrid() {
  if (!shapePatternGrid) return;
  const name = currentEditingName;
  const patterns = getPatternsForCharacter(name);
  const state = normalizePatternState(name, tempEditState);

  shapePatternGrid.innerHTML = "";
  patterns.forEach((patternName) => {
    const isOwned = state.owned.includes(patternName);
    const isMain = state.main === patternName;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "shape-pattern-btn";
    btn.dataset.pattern = patternName;
    btn.dataset.patternName = patternTooltipText(patternName, isMain ? "main" : isOwned ? "owned" : "none");
    if (isOwned) btn.classList.add("is-owned");
    if (isMain) btn.classList.add("is-main");
    btn.style.setProperty("--pattern-color", getPatternColor(patternName));

    const iconPath = getPatternIconPath(name, patternName);
    const iconHtml = iconPath
      ? `<img src="${escapeHtml(iconPath)}" alt="${escapeHtml(patternName)}" loading="lazy" decoding="async" />`
      : `<span class="shape-pattern-fallback"></span>`;
    const badgeHtml = isMain
      ? `<span class="shape-pattern-main-badge"><img src="images/random_icon/selected_pattern.png" alt="main" /></span>`
      : "";
    btn.innerHTML = `${iconHtml}${badgeHtml}`;

    btn.addEventListener("click", () => {
      togglePatternSelection(name, patternName);
    });

    shapePatternGrid.appendChild(btn);
  });
}

/**
 * Applies the ownership rule:
 *  - Clicking an unowned pattern adds it. The FIRST owned pattern becomes main.
 *  - Clicking a non-main owned pattern keeps the main unchanged (no demote).
 *  - Clicking the main pattern removes it; the next owned pattern (in click order)
 *    takes over as main, or Placidity when none remain.
 */
function togglePatternSelection(name, patternName) {
  const state = normalizePatternState(name, tempEditState);
  const owned = state.owned.slice();
  const idx = owned.indexOf(patternName);

  if (idx === -1) {
    // Not owned yet — add it. First-ever pattern becomes the main one.
    owned.push(patternName);
    tempEditState.patterns = owned;
    tempEditState.patternMain = state.main || patternName;
  } else {
    // Already owned — remove it (the current main stays main unless it was removed)
    owned.splice(idx, 1);
    tempEditState.patterns = owned;
    tempEditState.patternMain = state.main === patternName
      ? (owned.length ? owned[0] : null)
      : state.main;
  }

  tempEditState.boxKind = tempEditState.patternMain || DEFAULT_PATTERN;
  updateModalView();
}

// Create Character Card Element
function createCharacterCard(name, char, iconUrl) {
  const card = document.createElement("div");
  card.className = `char-card ${!char.owned ? "is-unowned" : ""}`;
  const insightVal = char.insight !== undefined ? char.insight : 3;
  const levelVal = char.level !== undefined ? char.level : 60;
  const rarityVal = getCharacterRarity(name);

  // Euphoria badge:
  //   one  -> "E1" / "E2"      (CN: "1狂" / "2狂")
  //   both -> "E1,2"           (CN: "狂1,2")
  let euphoriaText = "";
  if (char.e1 && char.e2) {
    euphoriaText = currentLang === "cn" ? `狂${1},${2}` : `E${1},${2}`;
  } else if (char.e2) {
    euphoriaText = fmtEuphoria(2);
  } else if (char.e1) {
    euphoriaText = fmtEuphoria(1);
  }

  // The card colour follows the character's chosen (main) pattern
    const boxKind = getMainPattern(name, char);
    const resonanceColor = getCardResonanceTextColor(boxKind);
    const patternColor = getResonanceTextColor(boxKind);
  const patternName = getPatternDisplayName(boxKind);
  const patternSuffix = patternName ? ` · ${patternName}` : "";

  // Portrait dashes: 5 total slots (P0 = 0 dashes, P1 = 1 active dash, ... P5 = 5 active dashes)
  let activeDashColor = "";
  if (displayOptions.appearance && displayOptions.appearance.customPortraitColorsEnabled) {
    switch (rarityVal) {
      case 6: activeDashColor = displayOptions.appearance.portraitColorR6 || "#DD9925"; break;
      case 5: activeDashColor = displayOptions.appearance.portraitColorR5 || "#C7AF6C"; break;
      case 4: activeDashColor = displayOptions.appearance.portraitColorR4 || "#6A4972"; break;
      case 3: activeDashColor = displayOptions.appearance.portraitColorR3 || "#545C7D"; break;
      case 2: activeDashColor = displayOptions.appearance.portraitColorR2 || "#496441"; break;
      default: activeDashColor = ""; break;
    }
  }
  const dashStyle = activeDashColor ? ` style="background-color: ${activeDashColor};"` : "";

  const dashesHtml = (char.owned && !displayOptions.hidePortrait)
    ? Array.from({ length: 5 }, (_, i) => `<span class="portrait-dash ${i < char.portrait ? "active" : ""}"${i < char.portrait ? dashStyle : ""}></span>`).join("")
    : "";

  let topHeaderHtml = "";
  if (!char.owned) {
    topHeaderHtml = `<div class="char-top-info">${!displayOptions.hideNames ? `<span class="char-unowned-name${isItalicNameCharacter(name) ? " is-italic-name" : ""}">${escapeHtml(displayCharName(name))}</span>` : ""}</div>`;
  } else {
    const resVal = Number(char.resonance);
    const matchesCustomResRule = (displayOptions.customResHideRules || []).some(
      (rule) => rule.enabled && Number(rule.resonance) === resVal
    );
    const isResHiddenByPreset =
      (displayOptions.hideR15 && resVal === 15) ||
      (displayOptions.hideR10 && resVal === 10) ||
      matchesCustomResRule;

    const showResonance = !displayOptions.hideResonance && !isResHiddenByPreset;
    const showEuphoria = !displayOptions.hideEuphoria && !!euphoriaText;

    // Main pattern icon sits next to the resonance badge
    const patternState = normalizePatternState(name, char);
    const shape = getCharacterResoShape(name);
    const mainPattern = patternState.main;
    const mainPatternPath = (mainPattern && shape) ? `images/shape_pattern/${shape}/${mainPattern}.png` : null;
    const showMainPattern = !displayOptions.hidePatterns && !!mainPatternPath;

    topHeaderHtml = `
      <div class="char-top-info">
        ${showResonance ? `<span class="badge-resonance ${boxKind}" style="color: ${resonanceColor};">${fmtResonance(char.resonance)}</span>` : `<span></span>`}
        ${showMainPattern ? `<img src="${escapeHtml(mainPatternPath)}" alt="${escapeHtml(mainPattern)}" data-pattern-name="${escapeHtml(patternTooltipText(mainPattern, "main"))}" class="char-main-pattern-icon" loading="lazy" decoding="async" />` : ""}
        ${showEuphoria ? `<span class="badge-euphoria">${euphoriaText}</span>` : ""}
      </div>
    `;
  }

  // Below the portrait bar: the name of OWNED characters.
  // Unowned cards already show their name above the avatar, so no duplicate here.
  let nameRowHtml = "";
  if (char.owned && !displayOptions.hideOwnedNames) {
    nameRowHtml = `<div class="char-name-below${isItalicNameCharacter(name) ? " is-italic-name" : ""}">${escapeHtml(displayCharName(name))}</div>`;
  }

  let portraitBarHtml = "";
  if (char.owned && !displayOptions.hidePortrait) {
    portraitBarHtml = `
      <div class="char-portrait-bar-below">
        ${dashesHtml}
      </div>
    `;
  }

  const matchesCustomRule = (displayOptions.customHideRules || []).some(
    (rule) => rule.enabled && Number(rule.insight) === Number(insightVal) && Number(rule.level) === Number(levelVal)
  );

  const isHiddenByPreset =
    (displayOptions.hideI3Lv60 && Number(insightVal) === 3 && Number(levelVal) === 60) ||
    (displayOptions.hideI3Lv30 && Number(insightVal) === 3 && Number(levelVal) === 30) ||
    (displayOptions.hideI2Lv50 && Number(insightVal) === 2 && Number(levelVal) === 50) ||
    matchesCustomRule;

  const showInsight = !displayOptions.hideInsight && !isHiddenByPreset && Number(insightVal) > 0;
  const showLevel = !displayOptions.hideInsight && !isHiddenByPreset;

  const insightIconHtml = showInsight ? `
    <span class="char-info-insight">
      <img src="images/insight_icon/I${insightVal}.png" alt="I${insightVal}" class="badge-insight-img" />
    </span>
  ` : "";

  const levelTextHtml = showLevel ? `
    <span class="char-info-level">${levelVal}</span>
  ` : "";

  const afflatus = getCharacterAfflatus(name);
  const showAfflatus = !displayOptions.hideAfflatus && !!afflatus;

  const insightLevelOverlay = (char.owned && (showInsight || showLevel)) ? `
    <div class="char-info-overlay">
      ${insightIconHtml}
      ${levelTextHtml}
    </div>
  ` : "";

  const rarityLineHtml = char.owned && !displayOptions.hideRarityLine ? `
    <img src="images/colour_references/${rarityVal}.png" alt="" class="char-rarity-line" loading="lazy" decoding="async" />
  ` : "";

  const avatarUrl = getCardAvatarUrl(name, char, iconUrl);

  // Decorative pin on the top-right of the portrait for favourited characters.
  // The wedge behind it darkens the corner so the pale pin stays legible on
  // bright portrait art.
  const favouriteBadgeHtml = char.favourite
    ? `<span class="char-favourite-corner"></span><img src="images/random_icon/unfavourite_icon.png" alt="" class="char-favourite-badge" loading="lazy" decoding="async" />`
    : "";

  const avatarImgStyles = [];
  if (char.owned) {
    if (boxKind && boxKind !== DEFAULT_PATTERN) {
      if (displayOptions.showPatternBg) {
        avatarImgStyles.push(`background-color: ${patternColor}`);
      }
      if (displayOptions.showPatternBorder) {
        avatarImgStyles.push(`border: 1px solid ${patternColor}`);
      }
    } else {
      // None Pattern characters
      if (displayOptions.showNonePatternBg) {
        const noneBgColor = displayOptions.colorNonePatternBg || "#4F4F4F";
        avatarImgStyles.push(`background-color: ${noneBgColor}`);
      }
      if (displayOptions.showNonePatternBorder) {
        const noneBorderColor = displayOptions.colorNonePatternBorder || "#4F4F4F";
        avatarImgStyles.push(`border: 1px solid ${noneBorderColor}`);
      }
    }
  }

  const afflatusIconHtml = showAfflatus ? `
    <div class="char-afflatus-icon">
      <img src="images/afflatus_icon/${afflatus}.png" alt="${afflatus}" title="${escapeHtml(displayAfflatus(afflatus))}" />
    </div>
  ` : "";
  const avatarImgStyle = avatarImgStyles.length > 0 ? ` style="${avatarImgStyles.join("; ")};"` : "";

  let tooltipHtml = "";
  {
    const patternState = normalizePatternState(name, char);
    const shape = getCharacterResoShape(name);

    // Pattern icons row (main first, then the rest)
    const orderedPatterns = patternState.main
      ? [patternState.main, ...patternState.owned.filter((p) => p !== patternState.main)]
      : patternState.owned;
    const patternRowHtml = orderedPatterns.length
      ? `<div class="ct-patterns">${orderedPatterns.map((p) => {
           const path = shape ? `images/shape_pattern/${shape}/${p}.png` : null;
           const isMain = p === patternState.main;
           return path
             ? `<img src="${escapeHtml(path)}" alt="${escapeHtml(p)}" data-pattern-name="${escapeHtml(patternTooltipText(p, isMain ? "main" : "owned"))}" class="ct-pattern-icon${isMain ? " is-main" : ""}" loading="lazy" decoding="async" />`
             : "";
         }).join("")}</div>`
      : "";

    const euphoriaRowHtml = euphoriaText
      ? `<div class="ct-row"><span class="ct-label">${t("card.euphoria")}</span><span class="ct-value ct-euphoria">${escapeHtml(euphoriaText)}</span></div>`
      : "";

    tooltipHtml = `
      <div class="char-tooltip no-export" style="--pattern-color: ${getPatternColor(patternState.main || DEFAULT_PATTERN)};">
        <div class="ct-head">
          <span class="ct-name${isItalicNameCharacter(name) ? " is-italic-name" : ""}">${escapeHtml(displayCharName(name))}</span>
        </div>
        <div class="ct-body">
          ${
            char.owned
              ? `<div class="ct-row"><span class="ct-label">${t("card.insight")}</span><span class="ct-value">${fmtInsight(insightVal)}</span></div>
          <div class="ct-row"><span class="ct-label">${t("card.level")}</span><span class="ct-value">${fmtLevel(levelVal)}</span></div>
          <div class="ct-row"><span class="ct-label">${t("card.resonance")}</span><span class="ct-value">${fmtResonance(char.resonance)}</span></div>
          <div class="ct-row"><span class="ct-label">${t("card.portrait")}</span><span class="ct-value">${fmtPortrait(char.portrait)}</span></div>
          ${euphoriaRowHtml}
          ${patternRowHtml}`
              : `<div class="ct-row"><span class="ct-value ct-unowned">${escapeHtml(t("action.unowned"))}</span></div>`
          }
        </div>
      </div>
    `;
  }

  card.innerHTML = `
    ${topHeaderHtml}
    <div class="char-avatar-box">
      <img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(name)}" class="char-avatar-img"${avatarImgStyle} loading="lazy" onerror="this.onerror=null;this.src='${escapeHtml(characterDb[name])}'" />
      ${afflatusIconHtml}
      ${insightLevelOverlay}
      ${favouriteBadgeHtml}
    </div>
    ${rarityLineHtml}
    ${portraitBarHtml}
    ${nameRowHtml}
    ${tooltipHtml}
  `;

  card.addEventListener("click", () => openEditModal(name));
  return card;
}

// Edit Modal Functions
let tempEditState = {};

function openEditModal(name) {
  currentEditingName = name;
  const rarity = getCharacterRarity(name);
  const maxAllowedInsight = getMaxInsightForRarity(rarity);

  const char = userRoster[name] || {
    owned: true,
    insight: maxAllowedInsight,
    level: getMaxLevelForInsight(maxAllowedInsight),
    resonance: 10,
    portrait: 0,
    e1: false,
    e2: false,
    boxKind: DEFAULT_PATTERN,
  };

  const rawInsight = char.insight !== undefined ? Number(char.insight) : maxAllowedInsight;
  const insight = Math.min(rawInsight, maxAllowedInsight);
  const maxLvl = getMaxLevelForInsight(insight);
  const rawLevel = char.level !== undefined ? Number(char.level) : maxLvl;
  const level = Math.min(Math.max(1, rawLevel), maxLvl);

  const maxRes = getMaxResonanceForInsight(insight);
  const rawRes = Math.max(1, Number(char.resonance || 1));
  const resonance = Math.min(rawRes, maxRes);

  const sanitizedEuphoria = sanitizeEuphoriaState(name, char);

  const charSkins = getCharacterSkins(name);
  const defaultSkin = charSkins.find((s) => s.isDefault) || charSkins[0];
  const defaultSkinId = defaultSkin ? defaultSkin.id : null;
  const currentSkinId = (char.skin !== undefined && char.skin !== null && charSkins.some((s) => Number(s.id) === Number(char.skin)))
    ? char.skin
    : defaultSkinId;

  const initialPatternState = normalizePatternState(name, char);
  tempEditState = {
    ...char,
    insight: insight,
    level: level,
    resonance: resonance,
    patterns: initialPatternState.owned,
    patternMain: initialPatternState.main,
    boxKind: initialPatternState.main || DEFAULT_PATTERN,
    e1: sanitizedEuphoria.e1,
    e2: sanitizedEuphoria.e2,
    skin: currentSkinId,
    favourite: !!char.favourite,
  };

  modalCharName.textContent = displayCharName(name);
  modalCharName.classList.toggle("is-italic-name", isItalicNameCharacter(name));
  modalCharStatus.textContent = tempEditState.owned ? t("setting.owned") : t("setting.unowned");
  syncFavouriteButton();

  renderSkinSelector(name);
  updateModalView();
  editModal.style.display = "flex";
}

/** Reflects the modal's favourite state on the pin button. */
function syncFavouriteButton() {
  if (!modalBtnFavourite) return;
  const fav = !!tempEditState.favourite;
  modalBtnFavourite.classList.toggle("is-favourite", fav);
  modalBtnFavourite.setAttribute("aria-pressed", String(fav));
  modalBtnFavourite.title = fav ? t("action.unfavourite") : t("action.favourite");
  if (modalBtnFavouriteImg) {
    modalBtnFavouriteImg.src = fav
      ? "images/random_icon/unfavourite_icon.png"
      : "images/random_icon/favourite_icon.png";
    modalBtnFavouriteImg.alt = fav ? t("action.unfavourite") : t("action.favourite");
  }
}

function renderSkinSelector(name) {
  if (!skinQuickPicks) return;
  skinQuickPicks.innerHTML = "";
  const charSkins = getCharacterSkins(name);

  if (!charSkins || charSkins.length === 0) {
    if (groupSkin) groupSkin.style.display = "none";
    return;
  }

  charSkins.forEach((skin) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-pill-skin";
    btn.dataset.skinId = String(skin.id);
    btn.title = displaySkinName(skin);

    const img = document.createElement("img");
    img.src = skin.iconUrl;
    img.alt = skin.name;
    img.className = "skin-btn-img";
    img.onerror = () => {
      img.onerror = null;
      img.src = characterDb[name];
    };

    btn.appendChild(img);

    btn.addEventListener("click", () => {
      tempEditState.skin = skin.id;
      updateSkinSelectionUI(name);
    });

    skinQuickPicks.appendChild(btn);
  });

  updateSkinSelectionUI(name);
}

function updateSkinSelectionUI(name) {
  const charSkins = getCharacterSkins(name);
  const selectedSkin = charSkins.find((s) => Number(s.id) === Number(tempEditState.skin)) || charSkins[0];

  if (displaySkin) {
    displaySkin.textContent = selectedSkin ? displaySkinName(selectedSkin) : t("action.default");
  }

  document.querySelectorAll(".btn-pill-skin").forEach((btn) => {
    const btnSkinId = Number(btn.dataset.skinId);
    const isSelected = selectedSkin && btnSkinId === selectedSkin.id;
    btn.classList.toggle("active", isSelected);
  });

  // Update modal preview image
  if (modalCharImg) {
    if (tempEditState.owned && selectedSkin && !selectedSkin.isDefault) {
      modalCharImg.src = selectedSkin.iconUrl;
      modalCharImg.onerror = () => {
        modalCharImg.onerror = null;
        modalCharImg.src = characterDb[name];
      };
    } else {
      modalCharImg.src = characterDb[name];
    }
  }
}

function updateModalView() {
  const charSkins = currentEditingName ? getCharacterSkins(currentEditingName) : [];
  if (tempEditState.owned) {
    btnStatusOwned.classList.add("active");
    btnStatusUnowned.classList.remove("active");
    if (groupSkin) groupSkin.style.display = charSkins.length > 0 ? "flex" : "none";
    groupInsight.style.display = "flex";
    groupLevel.style.display = "flex";
    groupResonance.style.display = "flex";
    groupPattern.style.display = tempEditState.resonance >= 10 ? "flex" : "none";
    groupPortrait.style.display = "flex";
    groupEuphoria.style.display = "flex";
    if (currentEditingName) updateSkinSelectionUI(currentEditingName);
  } else {
    btnStatusOwned.classList.remove("active");
    btnStatusUnowned.classList.add("active");
    if (groupSkin) groupSkin.style.display = "none";
    groupInsight.style.display = "none";
    groupLevel.style.display = "none";
    groupResonance.style.display = "none";
    groupPattern.style.display = "none";
    groupPortrait.style.display = "none";
    groupEuphoria.style.display = "none";
    if (currentEditingName && modalCharImg) {
      modalCharImg.src = characterDb[currentEditingName];
    }
  }

  // Insight based on Rarity limit (6✦ & 5✦: I0-I3; 4✦, 3✦, 2✦: I0-I2)
  const currentRarity = currentEditingName ? getCharacterRarity(currentEditingName) : 6;
  const maxAllowedInsight = getMaxInsightForRarity(currentRarity);

  let currentInsight = tempEditState.insight !== undefined ? tempEditState.insight : maxAllowedInsight;
  if (currentInsight > maxAllowedInsight) {
    currentInsight = maxAllowedInsight;
    tempEditState.insight = maxAllowedInsight;
  }

  displayInsight.textContent = fmtInsight(currentInsight);
  document.querySelectorAll(".btn-pill-i").forEach((btn) => {
    const btnInsight = Number(btn.dataset.i);
    if (btnInsight > maxAllowedInsight) {
      btn.style.display = "none";
    } else {
      btn.style.display = "";
    }
    btn.removeAttribute("title");
    btn.dataset.patternName = fmtInsight(btnInsight);
    btn.classList.toggle("active", btnInsight === currentInsight);
  });

  // Level slider
  const maxLvl = getMaxLevelForInsight(currentInsight);
  inputLevel.min = "1";
  inputLevel.max = String(maxLvl);
  if (tempEditState.level > maxLvl) {
    tempEditState.level = maxLvl;
  }
  if (!tempEditState.level || tempEditState.level < 1) {
    tempEditState.level = 1;
  }
  inputLevel.value = tempEditState.level;
  displayLevel.textContent = fmtLevel(tempEditState.level);

  // Resonance
  const maxRes = getMaxResonanceForInsight(currentInsight);
  inputResonance.min = "1";
  inputResonance.max = String(maxRes);
  if (tempEditState.resonance > maxRes) {
    tempEditState.resonance = maxRes;
  }
  if (!tempEditState.resonance || tempEditState.resonance < 1) {
    tempEditState.resonance = 1;
  }
  inputResonance.value = tempEditState.resonance;
  inputResonance.disabled = maxRes <= 1;
  displayResonance.textContent = fmtResonance(tempEditState.resonance);
  displayResonance.style.color = getResonanceTextColor(tempEditState.boxKind || "none");

  // If resonance < 10 the pattern feature is locked; keep owned patterns but show none
  const patternLocked = tempEditState.resonance < 10;

  document.querySelectorAll(".btn-pill").forEach((btn) => {
    const btnRes = Number(btn.dataset.r);
    if (btnRes > maxRes) {
      btn.style.display = "none";
    } else {
      btn.style.display = "";
    }
    const isActive = btnRes === tempEditState.resonance;
    btn.classList.toggle("active", isActive);
  });

  renderShapePatternGrid();

  // Portrait
  displayPortrait.textContent = fmtPortrait(tempEditState.portrait);
  document.querySelectorAll("#edit-modal .btn-pill-p").forEach((btn) => {
    const p = Number(btn.dataset.p);
    btn.textContent = fmtPortrait(p);
    btn.dataset.patternName = fmtPortrait(p);
    btn.classList.toggle("active", p === tempEditState.portrait);
  });

  // Euphoria
  const eligibleEuphoriaLevels = getEligibleEuphoriaLevels(currentEditingName || "");
  const meetsLevelRequirement = Number(currentInsight) === 3 && Number(tempEditState.level) >= 30;
  const isEuphoriaEligible = eligibleEuphoriaLevels.length > 0 && meetsLevelRequirement;
  if (tempEditState.owned) {
    groupEuphoria.style.display = isEuphoriaEligible ? "flex" : "none";
  }

  if (labelTextE1) {
    setEuphoriaCheckLabel(labelTextE1, currentEditingName || "", 1);
  }
  if (labelTextE2) {
    setEuphoriaCheckLabel(labelTextE2, currentEditingName || "", 2);
  }

  checkE1.checked = !!tempEditState.e1 && eligibleEuphoriaLevels.includes(1);
  checkE2.checked = !!tempEditState.e2 && eligibleEuphoriaLevels.includes(2);
  checkE1.closest("label").style.display = eligibleEuphoriaLevels.includes(1) ? "flex" : "none";
  checkE2.closest("label").style.display = eligibleEuphoriaLevels.includes(2) ? "flex" : "none";
}

function closeEditModal() {
  editModal.style.display = "none";
  currentEditingName = null;
}

function saveEditModal() {
  if (!currentEditingName) return;
  const eligibleEuphoriaLevels = getEligibleEuphoriaLevels(currentEditingName);
  const meetsLevelRequirement = Number(tempEditState.insight) === 3 && Number(inputLevel.value) >= 30;
  const finalE1 = meetsLevelRequirement && eligibleEuphoriaLevels.includes(1) && checkE1.checked;
  const finalE2 = meetsLevelRequirement && eligibleEuphoriaLevels.includes(2) && checkE2.checked;

  const patternState = normalizePatternState(currentEditingName, tempEditState);

  userRoster[currentEditingName] = {
    owned: tempEditState.owned,
    insight: tempEditState.insight !== undefined ? tempEditState.insight : 3,
    level: Number(inputLevel.value),
    resonance: Number(inputResonance.value),
    portrait: tempEditState.portrait,
    e1: finalE1,
    e2: finalE2,
    patterns: patternState.owned,
    patternMain: patternState.main,
    // boxKind mirrors the main pattern so legacy code keeps working
    boxKind: patternState.main || DEFAULT_PATTERN,
    skin: tempEditState.skin,
    favourite: !!tempEditState.favourite,
  };
  saveRoster();
  renderShowcase();
  closeEditModal();
}

/* ---------------- Psychube Setting Modal ---------------- */
let currentEditingChube = null;
let tempChubeState = {};

function openPsychubeModal(key) {
  const chube = psychubeDb[key];
  if (!chube) return;
  currentEditingChube = key;
  const state = getPsychubeState(key);
  tempChubeState = {
    owned: !!state.owned,
    level: Number(state.level) || 1,
    amplification: Number(state.amplification) || PSYCHUBE_MIN_AMP,
    count: Number(state.count) || 0,
  };

  const special = isSpecialPsychube(key);
  const img = document.getElementById("chube-modal-img");
  const nameEl = document.getElementById("chube-modal-name");
  const statusEl = document.getElementById("chube-modal-status");
  if (img) img.src = chube.iconUrl;
  if (nameEl) nameEl.textContent = psychubeName(key);

  // Special chubes only expose a quantity
  document.getElementById("chube-group-status").style.display = special ? "none" : "flex";
  document.getElementById("chube-group-level").style.display = special ? "none" : "flex";
  document.getElementById("chube-group-amp").style.display = special ? "none" : "flex";
  document.getElementById("chube-group-count").style.display = special ? "flex" : "none";

  updatePsychubeModalView();
  if (statusEl) {
    statusEl.textContent = special
      ? t("chube.countLabel", { n: tempChubeState.count })
      : (tempChubeState.owned ? t("setting.owned") : t("setting.unowned"));
  }
  document.getElementById("chube-modal").style.display = "flex";
}

function updatePsychubeModalView() {
  const key = currentEditingChube;
  if (!key) return;
  const special = isSpecialPsychube(key);

  document.getElementById("chube-btn-owned").classList.toggle("active", tempChubeState.owned);
  document.getElementById("chube-btn-unowned").classList.toggle("active", !tempChubeState.owned);

  // Level / Amplification are only editable once the chube is owned
  document.getElementById("chube-group-level").style.display =
    (!special && tempChubeState.owned) ? "flex" : "none";
  document.getElementById("chube-group-amp").style.display =
    (!special && tempChubeState.owned) ? "flex" : "none";

  const lvlInput = document.getElementById("chube-input-level");
  const cntInput = document.getElementById("chube-input-count");
  lvlInput.value = tempChubeState.level;
  cntInput.value = tempChubeState.count;

  document.getElementById("chube-display-level").textContent = String(tempChubeState.level);
  const ampDisplay = document.getElementById("chube-display-amp");
  ampDisplay.textContent = fmtAmp(tempChubeState.amplification);
  ampDisplay.classList.toggle("is-max", Number(tempChubeState.amplification) >= PSYCHUBE_MAX_AMP);
  document.getElementById("chube-display-count").textContent = String(tempChubeState.count);

  // Amplification quick picks (A1 - A5), with A5 highlighted
  document.querySelectorAll("#chube-modal .btn-pill-a").forEach((btn) => {
    const a = Number(btn.dataset.a);
    btn.classList.toggle("active", a === Number(tempChubeState.amplification));
    btn.classList.toggle("is-max", a === 5);
  });

  const statusEl = document.getElementById("chube-modal-status");
  if (statusEl) {
    statusEl.textContent = special
      ? t("chube.countLabel", { n: tempChubeState.count })
      : (tempChubeState.owned ? t("setting.owned") : t("setting.unowned"));
  }
}

function savePsychubeModal() {
  const key = currentEditingChube;
  if (!key) return;
  const special = isSpecialPsychube(key);
  const prev = getPsychubeState(key);

  if (special) {
    const count = Math.max(0, Math.min(PSYCHUBE_MAX_COUNT, Math.floor(Number(document.getElementById("chube-input-count").value) || 0)));
    userPsychubes[key] = { owned: count > 0, level: 1, amplification: PSYCHUBE_MIN_AMP, count };
  } else {
    userPsychubes[key] = {
      owned: !!tempChubeState.owned,
      level: Math.max(1, Math.min(PSYCHUBE_MAX_LEVEL, Number(document.getElementById("chube-input-level").value) || 1)),
      amplification: Math.max(PSYCHUBE_MIN_AMP, Math.min(PSYCHUBE_MAX_AMP, Number(tempChubeState.amplification) || PSYCHUBE_MIN_AMP)),
      count: Number(prev.count) || 0,
    };
  }
  savePsychubes();
  renderShowcase();
  closePsychubeModal();
}

function closePsychubeModal() {
  const modal = document.getElementById("chube-modal");
  if (modal) modal.style.display = "none";
  currentEditingChube = null;
}

/**
 * Shows one tab of the Manage modal and hides the other.
 *
 * The two managers keep their own state (search box, rarity filters, selection),
 * so switching tabs only toggles visibility and re-renders the newly shown grid.
 */
function setManageTab(tab) {
  const next = tab === "chubes" ? "chubes" : "characters";
  manageActiveTab = next;

  // Only the Manage modal's own tabs: the Appearance modal reuses `.manage-tab`
  // for its look, and must keep whatever tab it switched to.
  document.querySelectorAll("#roster-modal .manage-tab").forEach((btn) => {
    const on = btn.dataset.manageTab === next;
    btn.classList.toggle("active", on);
    btn.setAttribute("aria-selected", on ? "true" : "false");
  });

  document.querySelectorAll(".manage-panel").forEach((panel) => {
    const on = panel.dataset.managePanel === next;
    // Respect panels that hide themselves (e.g. the bulk bar when idle).
    panel.hidden = !on || panel.dataset.keepHidden === "true";
  });

  // Bulk-selection bars stay hidden until their own Select mode is switched on
  // and their tab is the active one.
  const rosterBar = document.getElementById("roster-select-bar");
  if (rosterBar) rosterBar.hidden = !(rosterSelectMode && next === "characters");
  const chubesBar = document.getElementById("chubes-select-bar");
  if (chubesBar) chubesBar.hidden = !(chubesSelectMode && next === "chubes");

  if (next === "chubes") {
    renderChubesManager();
  } else {
    renderRosterManager();
  }
}

// Roster Manager Modal Functions
function openRosterModal() {
  renderRosterManager();
  rosterNeedsShowcaseRefresh = false;
  rosterModal.style.display = "flex";
  setManageTab("characters");
}

function closeRosterModal() {
  rosterModal.style.display = "none";
  exitRosterSelectMode();
  chubesSelectMode = false;
  chubesSelection.clear();
  // Board refresh is deferred until the modal closes, so bulk edits stay fast
  if (rosterNeedsShowcaseRefresh) {
    rosterNeedsShowcaseRefresh = false;
    renderShowcase();
  }
}

/* ---------------- Bulk selection ---------------- */

function setRosterSelectMode(on) {
  const toggle = document.getElementById("btn-roster-select-mode");
  const bar = document.getElementById("roster-select-bar");

  if (!on) {
    // Leaving select mode must also strip tile styling, not just clear the Set
    exitRosterSelectMode();
    return;
  }

  rosterSelectMode = true;
  if (toggle) {
    toggle.classList.add("active");
    toggle.setAttribute("aria-pressed", "true");
  }
  if (bar) bar.hidden = false;
  rosterGridList.classList.add("roster-select-mode");
  updateRosterSelectionUI();
}

function exitRosterSelectMode() {
  const wasActive = rosterSelectMode || rosterSelection.size > 0;
  rosterSelectMode = false;
  rosterSelection.clear();

  const toggle = document.getElementById("btn-roster-select-mode");
  const bar = document.getElementById("roster-select-bar");
  if (toggle) {
    toggle.classList.remove("active");
    toggle.setAttribute("aria-pressed", "false");
  }
  if (bar) bar.hidden = true;
  rosterGridList.classList.remove("roster-select-mode");

  // Strip lingering selection styling from the tiles themselves
  rosterGridList.querySelectorAll(".roster-char-item.is-selected").forEach((el) => {
    el.classList.remove("is-selected");
  });

  updateRosterSelectionUI();
  return wasActive;
}

function updateRosterSelectionUI() {
  const countEl = document.getElementById("roster-select-count");
  const applyBtn = document.getElementById("btn-roster-bulk-apply");
  if (countEl) {
    countEl.textContent = t("bulk.selectedCount", { n: rosterSelection.size });
  }
  if (applyBtn) applyBtn.disabled = rosterSelection.size === 0;
}

function toggleRosterTileSelection(name, el) {
  if (rosterSelection.has(name)) {
    rosterSelection.delete(name);
    el.classList.remove("is-selected");
  } else {
    rosterSelection.add(name);
    el.classList.add("is-selected");
  }
  updateRosterSelectionUI();
}

function selectAllVisibleRosterTiles() {
  rosterGridList.querySelectorAll(".roster-char-item").forEach((el) => {
    const name = el.dataset.name;
    if (!name) return;
    rosterSelection.add(name);
    el.classList.add("is-selected");
  });
  updateRosterSelectionUI();
}

function clearRosterSelection() {
  rosterSelection.clear();
  rosterGridList.querySelectorAll(".roster-char-item.is-selected").forEach((el) => {
    el.classList.remove("is-selected");
  });
  updateRosterSelectionUI();
}

/* ---------------- Bulk Apply spec ---------------- */

// null === "no change" for that field
let bulkSpec = {
  level: null,
  insight: null,
  resonance: null,
  portrait: null,
  owned: null,
};

const BULK_INSIGHT_PRESETS = [0, 1, 2, 3];
const BULK_PORTRAIT_PRESETS = [0, 1, 2, 3, 4, 5];
const BULK_OWNED_PRESETS = [
  { value: false, labelKey: "action.unowned" },
  { value: true, labelKey: "action.owned" },
];

function renderBulkRow(containerId, options, current, onPick) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = "";

  options.forEach((opt) => {
    const value = opt.value !== undefined ? opt.value : opt;
    // labelKey lets an option resolve its label from the active language
    const label = opt.labelKey ? t(opt.labelKey) : (opt.label !== undefined ? opt.label : String(opt));
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `bulk-opt${current !== null && current === value ? " is-active" : ""}`;
    if (opt.icon) {
      btn.innerHTML = `<img src="${opt.icon}" alt="${label}" />`;
      btn.title = label;
    } else {
      btn.textContent = label;
    }
    // Clicking the active option again clears it back to "untouched"
    btn.addEventListener("click", () => {
      onPick(current !== null && current === value ? null : value);
    });
    container.appendChild(btn);
  });
}

/** Insight row: icons instead of text, click again to clear. */
function renderBulkInsightRow() {
  const container = document.getElementById("bulk-insight-options");
  if (!container) return;
  container.innerHTML = "";

  BULK_INSIGHT_PRESETS.forEach((i) => {
    const btn = document.createElement("button");
    btn.type = "button";
    const isActive = bulkSpec.insight === i;
    btn.className = `bulk-opt bulk-opt-icon${isActive ? " is-active" : ""}`;
    btn.innerHTML = `<img src="images/insight_icon/I${i}.png" alt="I${i}" />`;
    btn.title = fmtInsight(i);
    btn.addEventListener("click", () => {
      bulkSpec.insight = isActive ? null : i;
      renderBulkApplyModal();
    });
    container.appendChild(btn);
  });
}

/** Wires a slider; dragging it marks the field as touched. */
function bindBulkSlider(prefix, maxValue, labelPrefix) {
  const slider = document.getElementById(`bulk-${prefix}-slider`);
  if (!slider) return;

  const fmt = prefix === "level" ? fmtLevel : fmtResonance;

  const isUntouched = bulkSpec[prefix] === null;
  slider.max = String(maxValue);
  slider.value = String(isUntouched ? 1 : Math.min(bulkSpec[prefix], maxValue));

  slider.oninput = () => {
    bulkSpec[prefix] = Number(slider.value);
    const valueEl = document.getElementById(`bulk-${prefix}-value`);
    if (valueEl) valueEl.textContent = fmt(Number(slider.value));
    const row = document.getElementById(`bulk-row-${prefix}`);
    if (row) row.classList.remove("is-untouched");
  };

  // Re-render on release so the caps (driven by insight) stay accurate
  slider.onchange = () => renderBulkApplyModal();
}

function renderBulkApplyModal() {
  const count = rosterSelection.size;
  const hint = document.getElementById("bulk-apply-hint");
  const confirm = document.getElementById("bulk-apply-confirm");

  if (hint) {
    hint.textContent = t("bulk.hintSimple", { n: count });
  }
  if (confirm) {
    confirm.textContent = t("action.apply");
    confirm.disabled = count === 0;
  }

  renderBulkApplyPreview();

  // Insight (icons)
  renderBulkInsightRow();

  // Level / Resonance (sliders with a "no change" toggle above)
  const levelMax = bulkSpec.insight !== null ? getMaxLevelForInsight(bulkSpec.insight) : 60;
  const resMax = bulkSpec.insight !== null ? getMaxResonanceForInsight(bulkSpec.insight) : 15;
  if (bulkSpec.level !== null) bulkSpec.level = Math.min(bulkSpec.level, levelMax);
  if (bulkSpec.resonance !== null) bulkSpec.resonance = Math.min(bulkSpec.resonance, resMax);
  bindBulkSlider("level", levelMax, "level");
  bindBulkSlider("resonance", resMax, "resonance");

  // Simple option rows
  renderBulkRow("bulk-portrait-options", BULK_PORTRAIT_PRESETS.map((p) => ({ value: p, label: fmtPortrait(p) })), bulkSpec.portrait, (v) => {
    bulkSpec.portrait = v; renderBulkApplyModal();
  });
  renderBulkRow("bulk-owned-options", BULK_OWNED_PRESETS, bulkSpec.owned, (v) => {
    bulkSpec.owned = v; renderBulkApplyModal();
  });

  const setVal = (id, text) => {
    const el = document.getElementById(id);
    if (!el) return;
    // Empty string means "untouched" — the readout stays hidden
    el.textContent = text || "";
  };
  setVal("bulk-level-value", bulkSpec.level === null ? "" : fmtLevel(bulkSpec.level));
  setVal("bulk-insight-value", bulkSpec.insight === null ? "" : fmtInsight(bulkSpec.insight));
  setVal("bulk-resonance-value", bulkSpec.resonance === null ? "" : fmtResonance(bulkSpec.resonance));
  setVal("bulk-portrait-value", bulkSpec.portrait === null ? "" : fmtPortrait(bulkSpec.portrait));
  setVal("bulk-owned-value", bulkSpec.owned === null ? "" : (bulkSpec.owned ? "Owned" : "Unowned"));

  // Rows without a chosen value read as untouched
  const rowState = {
    insight: bulkSpec.insight === null,
    level: bulkSpec.level === null,
    resonance: bulkSpec.resonance === null,
    portrait: bulkSpec.portrait === null,
    owned: bulkSpec.owned === null,
  };
  Object.keys(rowState).forEach((key) => {
    const row = document.getElementById(`bulk-row-${key}`);
    if (row) row.classList.toggle("is-untouched", rowState[key]);
  });
}

/** Shows small avatars of the selected characters inside the modal. */
function renderBulkApplyPreview() {
  const wrap = document.getElementById("bulk-apply-preview");
  if (!wrap) return;
  wrap.innerHTML = "";

  const names = [...rosterSelection];
  const MAX_SHOWN = 12;
  names.slice(0, MAX_SHOWN).forEach((name) => {
    const url = characterDb[name];
    if (!url) return;
    const img = document.createElement("img");
    img.src = url;
    img.alt = name;
    img.title = name;
    img.loading = "lazy";
    img.decoding = "async";
    wrap.appendChild(img);
  });

  if (names.length > MAX_SHOWN) {
    const more = document.createElement("div");
    more.className = "bulk-preview-more";
    more.textContent = `+${names.length - MAX_SHOWN}`;
    wrap.appendChild(more);
  }
}

function openBulkApplyModal() {
  if (rosterSelection.size === 0) return;
  bulkSpec = { level: null, insight: null, resonance: null, portrait: null, owned: null };
  renderBulkApplyModal();
  const modal = document.getElementById("bulk-apply-modal");
  if (modal) modal.style.display = "flex";
}

function closeBulkApplyModal() {
  const modal = document.getElementById("bulk-apply-modal");
  if (modal) modal.style.display = "none";
}

function applyBulkSpec() {
  const names = [...rosterSelection];
  if (names.length === 0) return;

  names.forEach((name) => {
    const rarity = getCharacterRarity(name);
    const existing = userRoster[name] || {
      owned: true,
      insight: getMaxInsightForRarity(rarity),
      level: getMaxLevelForInsight(getMaxInsightForRarity(rarity)),
      resonance: 10,
      portrait: 0,
      e1: false,
      e2: false,
      patterns: [],
      patternMain: null,
      boxKind: DEFAULT_PATTERN,
    };
    const char = { ...existing };

    if (bulkSpec.owned !== null) char.owned = bulkSpec.owned;

    // Insight must land first: it caps level and resonance
    if (bulkSpec.insight !== null) {
      char.insight = Math.min(bulkSpec.insight, getMaxInsightForRarity(rarity));
    }
    const effectiveInsight = char.insight !== undefined ? char.insight : getMaxInsightForRarity(rarity);

    if (bulkSpec.level !== null) {
      char.level = Math.min(bulkSpec.level, getMaxLevelForInsight(effectiveInsight));
    }
    if (bulkSpec.resonance !== null) {
      char.resonance = Math.min(bulkSpec.resonance, getMaxResonanceForInsight(effectiveInsight));
    }

    // Clamp existing values so nothing exceeds the new insight cap
    if (bulkSpec.insight !== null) {
      char.level = Math.min(Number(char.level || 1), getMaxLevelForInsight(effectiveInsight));
      char.resonance = Math.min(Number(char.resonance || 1), getMaxResonanceForInsight(effectiveInsight));
    }

    if (bulkSpec.portrait !== null) char.portrait = bulkSpec.portrait;

    userRoster[name] = char;
  });

  saveRoster();
  closeBulkApplyModal();
  exitRosterSelectMode();
  renderRosterManager();
  rosterNeedsShowcaseRefresh = true;
}

function renderRosterManager() {
  const query = rosterSearch.value.trim().toLowerCase();
  rosterGridList.innerHTML = "";

  // Sort characters strictly by: Rarity > Release Date Order (ArcanistMap ID descending)
  const sortedNames = Object.keys(characterDb).sort(compareUnownedCharacters);

  sortedNames.forEach((name) => {
    if (!futureSightEnabled && futureSightChars.has(name)) return;
    if (!characterMatchesQuery(name, query)) return;
    const rarity = getCharacterRarity(name);
    if (rosterActiveRarityFilters.size > 0 && !rosterActiveRarityFilters.has(rarity)) return;

    const char = userRoster[name] || { owned: true };
    const iconUrl = characterDb[name];

    const item = document.createElement("div");
    item.className = `roster-char-item ${char.owned ? "is-owned" : "not-owned"}`;
    item.dataset.name = name;
    item.innerHTML = `
      <div class="roster-avatar-box">
        <img src="${escapeHtml(iconUrl)}" alt="${escapeHtml(name)}" class="roster-avatar-img" loading="lazy" decoding="async" />
      </div>
      <span class="roster-char-name${isItalicNameCharacter(name) ? " is-italic-name" : ""}">${escapeHtml(displayCharName(name))}</span>
    `;

    if (rosterSelection.has(name)) {
      item.classList.add("is-selected");
    }

    item.addEventListener("click", () => {
      // In select mode a tap toggles selection instead of ownership
      if (rosterSelectMode) {
        toggleRosterTileSelection(name, item);
        return;
      }
      char.owned = !char.owned;
      userRoster[name] = char;
      saveRoster();
      // Update just this tile instead of rebuilding the whole grid (much cheaper)
      item.classList.toggle("is-owned", !!char.owned);
      item.classList.toggle("not-owned", !char.owned);
      rosterNeedsShowcaseRefresh = true;
    });

    rosterGridList.appendChild(item);
  });

  updateRosterSelectionUI();
}

/* ---------------- Chubes Manager ---------------- */
let chubesActiveRarityFilters = new Set();
let chubesSelectMode = false;
const chubesSelection = new Set();
let chubeBulkSpec = { level: null, amplification: null, owned: null };

function chubesVisibleKeys() {
  return psychubeOrder.filter((key) => {
    if (isSpecialPsychube(key)) return false; // special chubes are excluded from the manager
    if (!futureSightEnabled && futureSightPsychubes.has(key)) return false;
    if (chubesActiveRarityFilters.size > 0 && !chubesActiveRarityFilters.has(psychubeDb[key].rarity)) return false;
    return true;
  });
}

function openChubesModal() {
  chubesSelectMode = false;
  chubesSelection.clear();
  rosterNeedsShowcaseRefresh = false;
  renderChubesManager();
  rosterModal.style.display = "flex";
  setManageTab("chubes");
}

function closeChubesModal() {
  closeRosterModal();
}

function renderChubesManager() {
  const grid = document.getElementById("chubes-grid-list");
  if (!grid) return;
  const query = (document.getElementById("chubes-search").value || "").trim().toLowerCase();
  grid.innerHTML = "";

  const keys = chubesVisibleKeys().filter((key) => psychubeMatchesQuery(key, query));

  keys.forEach((key) => {
    const chube = psychubeDb[key];
    const state = getPsychubeState(key);

    const item = document.createElement("div");
    item.className = `roster-char-item ${state.owned ? "is-owned" : "not-owned"}`;
    item.dataset.chubeKey = key;
    item.innerHTML = `
      <div class="roster-avatar-box">
        <img src="${escapeHtml(chube.iconUrl)}" alt="${escapeHtml(chube.name)}" class="roster-avatar-img" loading="lazy" decoding="async" />
        <img src="images/random_icon/selected_psychube.png" alt="" class="chube-selected-mark" />
      </div>
      <span class="roster-char-name">${escapeHtml(psychubeName(key))}</span>
      <span class="chube-manage-meta">Lv.${Number(state.level) || 1} · ${fmtAmp(Number(state.amplification) || PSYCHUBE_MIN_AMP)}</span>
    `;
    if (chubesSelection.has(key)) item.classList.add("is-selected");

    item.addEventListener("click", () => {
      if (chubesSelectMode) {
        if (chubesSelection.has(key)) chubesSelection.delete(key);
        else chubesSelection.add(key);
        item.classList.toggle("is-selected", chubesSelection.has(key));
        updateChubesSelectionUI();
        return;
      }
      const s = getPsychubeState(key);
      s.owned = !s.owned;
      savePsychubes();
      item.classList.toggle("is-owned", !!s.owned);
      item.classList.toggle("not-owned", !s.owned);
      renderShowcase();
    });

    grid.appendChild(item);
  });

  updateChubesSelectionUI();
}

function updateChubesSelectionUI() {
  const bar = document.getElementById("chubes-select-bar");
  const countEl = document.getElementById("chubes-select-count");
  const applyBtn = document.getElementById("btn-chubes-bulk-apply");
  if (bar) bar.hidden = !chubesSelectMode;
  if (countEl) countEl.textContent = `${chubesSelection.size} selected`;
  if (applyBtn) applyBtn.disabled = chubesSelection.size === 0;
  const toggle = document.getElementById("btn-chubes-select-mode");
  if (toggle) toggle.setAttribute("aria-pressed", String(chubesSelectMode));
  document.getElementById("chubes-modal")?.classList.toggle("select-mode", chubesSelectMode);
}

function setChubesSelectMode(on) {
  chubesSelectMode = on;
  if (!on) chubesSelection.clear();
  renderChubesManager();
}

function renderChubeBulkModal() {
  const count = chubesSelection.size;
  const hint = document.getElementById("chube-bulk-hint");
  if (hint) hint.textContent = t("bulk.chubeHint", { n: count });

  const preview = document.getElementById("chube-bulk-preview");
  if (preview) {
    preview.innerHTML = [...chubesSelection].slice(0, 12).map((key) => {
      const c = psychubeDb[key];
      return `<img src="${escapeHtml(c.iconUrl)}" alt="${escapeHtml(c.name)}" class="chube-bulk-preview-avatar" />`;
    }).join("");
  }

  const lvl = document.getElementById("chube-bulk-level-slider");
  const lvlVal = document.getElementById("chube-bulk-level-value");
  const ampVal = document.getElementById("chube-bulk-amp-value");
  const ownedVal = document.getElementById("chube-bulk-owned-value");

  if (chubeBulkSpec.level !== null) { lvl.value = String(chubeBulkSpec.level); lvlVal.textContent = String(chubeBulkSpec.level); }
  else { lvl.value = lvl.min || "1"; lvlVal.textContent = ""; }
  if (ampVal) {
    ampVal.textContent = chubeBulkSpec.amplification === null ? "" : fmtAmp(chubeBulkSpec.amplification);
    ampVal.classList.toggle("is-max", chubeBulkSpec.amplification >= PSYCHUBE_MAX_AMP);
  }
  if (ownedVal) ownedVal.textContent = chubeBulkSpec.owned === null ? "" : (chubeBulkSpec.owned ? t("action.owned") : t("action.unowned"));

  document.getElementById("chube-bulk-row-level").classList.toggle("is-untouched", chubeBulkSpec.level === null);
  document.getElementById("chube-bulk-row-amp").classList.toggle("is-untouched", chubeBulkSpec.amplification === null);
  document.getElementById("chube-bulk-row-owned").classList.toggle("is-untouched", chubeBulkSpec.owned === null);

  // Amplification quick picks (A1 - A5)
  const ampOpts = document.getElementById("chube-bulk-amp-options");
  if (ampOpts) {
    ampOpts.innerHTML = "";
    [1, 2, 3, 4, 5].forEach((a) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `bulk-opt${chubeBulkSpec.amplification === a ? " is-active" : ""}${a === 5 ? " is-max" : ""}`;
      b.textContent = fmtAmp(a);
      b.addEventListener("click", () => {
        chubeBulkSpec.amplification = chubeBulkSpec.amplification === a ? null : a;
        renderChubeBulkModal();
      });
      ampOpts.appendChild(b);
    });
  }

  const ownedOpts = document.getElementById("chube-bulk-owned-options");
  if (ownedOpts) {
    ownedOpts.innerHTML = "";
    [{ value: false, key: "action.unowned" }, { value: true, key: "action.owned" }].forEach((o) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `bulk-opt${chubeBulkSpec.owned === o.value ? " is-active" : ""}`;
      b.textContent = t(o.key);
      b.addEventListener("click", () => {
        chubeBulkSpec.owned = chubeBulkSpec.owned === o.value ? null : o.value;
        renderChubeBulkModal();
      });
      ownedOpts.appendChild(b);
    });
  }
}

function openChubeBulkModal() {
  chubeBulkSpec = { level: null, amplification: null, owned: null };
  renderChubeBulkModal();
  document.getElementById("chube-bulk-modal").style.display = "flex";
}

function closeChubeBulkModal() {
  // Leaving without applying discards the pending spec so the next open starts clean
  chubeBulkSpec = { level: null, amplification: null, owned: null };
  document.getElementById("chube-bulk-modal").style.display = "none";
}

function applyChubeBulkSpec() {
  [...chubesSelection].forEach((key) => {
    if (isSpecialPsychube(key)) return;
    const s = getPsychubeState(key);
    if (chubeBulkSpec.level !== null) s.level = chubeBulkSpec.level;
    if (chubeBulkSpec.amplification !== null) s.amplification = chubeBulkSpec.amplification;
    if (chubeBulkSpec.owned !== null) s.owned = chubeBulkSpec.owned;
  });
  savePsychubes();
  closeChubeBulkModal();
  chubesSelection.clear();
  setChubesSelectMode(false);
  renderShowcase();
}

/* ---------------- Team Building ---------------- */

/** Preset variants are authored with a display name; the app keys chubes by "rarity:id". */
function psychubeKeyByName(name) {
  const want = String(name || "").trim().toLowerCase();
  if (!want) return null;
  for (const key of psychubeOrder) {
    const c = psychubeDb[key];
    if (!c) continue;
    if (String(c.name || "").toLowerCase() === want) return key;
    if (String(c.nameCn || "").toLowerCase() === want) return key;
  }
  return null;
}

function buildTeamArchetypes(data) {
  teamArchetypes = (data && typeof data === "object" && !Array.isArray(data)) ? data : {};
}

/**
 * The `euphoria` field on a preset member is a display chip (e.g. "E1") AND a
 * Future-Sight gate: when that euphoria tier is CN-only, the chip is hidden while
 * Future Sight is off — so a comp that needs Matilda's E2 does not advertise it.
 */
function presetMemberEuphoria(entry) {
  const raw = entry.euphoria;
  if (raw === undefined || raw === null || raw === "") return null;
  const label = String(raw).trim();
  if (!label) return null;

  if (!futureSightEnabled) {
    // Accepts "E1" / "e1" / "1" — the leading "E" is optional in the data
    const tier = Number(label.replace(/^e/i, ""));
    if (!isNaN(tier)) {
      const canonical = resolveCharacterName(entry.character);
      const futureTiers = canonical ? futureSightEuphorias.get(canonical) : null;
      if (futureTiers && futureTiers.has(tier)) return null;
    }
  }
  return label;
}

/**
 * Substitutes are optional alternatives for a slot. Unusable entries are dropped
 * silently (unlike a primary member, a bad substitute must not kill the variant),
 * and CN-only alternatives disappear while Future Sight is off.
 * A bare string is accepted as shorthand for `{ "character": "..." }`.
 */
function normalizeSubstitutes(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const entry of raw) {
    const source = typeof entry === "string" ? { character: entry } : entry;
    if (!source || typeof source !== "object") continue;
    const character = resolveCharacterName(source.character);
    if (!character || !characterDb[character]) continue;
    if (!futureSightEnabled && futureSightChars.has(character)) continue;
    out.push({
      character,
      psychube: psychubeKeyByName(source.psychube),
      euphoria: presetMemberEuphoria({ character, euphoria: source.euphoria }),
    });
  }
  return out;
}

/** A preset variant is only usable when every member resolves to a real character. */
function presetVariantMembers(variant) {
  if (!Array.isArray(variant) || variant.length === 0) return [];
  const members = [];
  for (const entry of variant) {
    if (!entry || typeof entry !== "object") return [];
    const character = resolveCharacterName(entry.character);
    if (!character || !characterDb[character]) return [];
    members.push({
      character,
      psychube: psychubeKeyByName(entry.psychube),
      isEssential: !!entry.is_essential,
      euphoria: presetMemberEuphoria(entry),
      substitutes: normalizeSubstitutes(entry.substitutes),
    });
  }
  return members;
}

/** True when a preset team contains CN-only content (gated behind Future Sight). */
function presetVariantHasFutureSight(members) {
  return members.some((m) => futureSightChars.has(m.character) ||
    (m.psychube && futureSightPsychubes.has(m.psychube)));
}

function createTeamId() {
  return "team_" + Date.now().toString(36) + "_" + Math.floor(Math.random() * 1e4).toString(36);
}

function createEmptyTeamSlots() {
  return Array.from({ length: TEAM_SLOT_COUNT }, () => ({ character: null, psychube: null }));
}

function createTeam(name) {
  return { id: createTeamId(), name: name || t("team.defaultName"), slots: createEmptyTeamSlots() };
}

function findTeam(teamId) {
  return teamsConfig.teams.find((tm) => tm.id === teamId) || null;
}

/** Keeps a slot array exactly TEAM_SLOT_COUNT long with the expected shape. */
function normalizeTeamSlots(slots) {
  const out = createEmptyTeamSlots();
  if (!Array.isArray(slots)) return out;
  slots.slice(0, TEAM_SLOT_COUNT).forEach((slot, i) => {
    if (!slot || typeof slot !== "object") return;
    const character = slot.character && characterDb[slot.character] ? slot.character : null;
    const psychube = slot.psychube && psychubeDb[slot.psychube] ? slot.psychube : null;
    out[i] = { character, psychube: character ? psychube : null };
  });
  return out;
}

/** Drops unknown members, duplicate characters and duplicate psychubes within a team. */
function sanitizeTeamsState() {
  const seenTeamIds = new Set();
  const teams = [];

  (Array.isArray(teamsConfig.teams) ? teamsConfig.teams : []).forEach((raw) => {
    if (!raw || typeof raw !== "object") return;
    let id = typeof raw.id === "string" && raw.id ? raw.id : createTeamId();
    while (seenTeamIds.has(id)) id = createTeamId();
    seenTeamIds.add(id);

    const name = String(raw.name || "").slice(0, TEAM_NAME_MAX_LEN) || t("team.defaultName");
    const slots = normalizeTeamSlots(raw.slots);

    // One character and one psychube may appear at most once per team
    const usedChars = new Set();
    const usedChubes = new Set();
    slots.forEach((slot) => {
      if (slot.character) {
        if (usedChars.has(slot.character)) slot.character = null;
        else usedChars.add(slot.character);
      }
      if (slot.psychube) {
        if (usedChubes.has(slot.psychube) || !slot.character) slot.psychube = null;
        else usedChubes.add(slot.psychube);
      }
    });

    teams.push({ id, name, slots });
  });

  teamsConfig = { teams };
  return teams;
}

function loadTeams() {
  try {
    const saved = localStorage.getItem(TEAMS_STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : null;
    if (parsed && typeof parsed === "object") {
      teamsConfig = { teams: Array.isArray(parsed.teams) ? parsed.teams : [] };
      teamsAllowUnowned = !!parsed.allowUnowned;
      teamsFormableOnly = !!parsed.formableOnly;
      teamsManualPick = !!parsed.manualPick;
      teamsHideWarning = !!parsed.hideWarning;
      if (typeof parsed.stripRatio === "number") {
        teamStripRatio = Math.min(0.75, Math.max(0.12, parsed.stripRatio));
      }
      if (typeof parsed.columns === "number") {
        teamColumns = Math.min(TEAM_MAX_COLUMNS, Math.max(1, Math.round(parsed.columns)));
      }
    }
  } catch (e) {
    teamsConfig = { teams: [] };
  }
  sanitizeTeamsState();
  return false;
}

function saveTeams() {
  localStorage.setItem(TEAMS_STORAGE_KEY, JSON.stringify({
    teams: teamsConfig.teams,
    allowUnowned: teamsAllowUnowned,
    formableOnly: teamsFormableOnly,
    manualPick: teamsManualPick,
    hideWarning: teamsHideWarning,
    stripRatio: teamStripRatio,
    columns: teamColumns,
  }));
}

/** How many teams the viewport can host side by side. */
function maxTeamColumnsForViewport() {
  const w = window.innerWidth;
  let max = 1;
  for (let n = 1; n <= TEAM_MAX_COLUMNS; n++) {
    if (w >= TEAM_COLUMN_MIN_VIEWPORT[n]) max = n;
  }
  return max;
}

/** The user's preference, clamped to what the viewport actually supports. */
function effectiveTeamColumns() {
  return Math.min(teamColumns, maxTeamColumnsForViewport());
}

/**
 * Writes the teams-per-row layout onto the modal. The column selector only
 * offers counts the viewport can host, so narrow screens never get a cramped grid.
 */
function applyTeamColumns() {
  const cols = effectiveTeamColumns();
  const list = document.getElementById("team-list");
  if (list) list.style.setProperty("--team-columns", String(cols));

  const card = document.querySelector("#team-modal .team-modal-card");
  if (card) card.style.setProperty("--team-modal-max-width", `${TEAM_MODAL_MAX_WIDTH[cols]}px`);

  const group = document.getElementById("team-columns-group");
  if (!group) return;
  const max = maxTeamColumnsForViewport();
  // "1" is never offered: it only appears when the viewport cannot host two
  // columns, and then there is nothing to choose, so the selector is hidden.
  const options = [];
  for (let n = 2; n <= max; n++) options.push(n);
  group.hidden = options.length < 2;
  group.querySelectorAll(".team-cols-btn").forEach((btn) => {
    const n = Number(btn.dataset.cols);
    btn.hidden = !options.includes(n);
    btn.classList.toggle("active", n === cols);
    btn.setAttribute("aria-pressed", String(n === cols));
  });
}

/** How many DISTINCT teams field this character. */
function teamCountForCharacter(name) {
  if (!name) return 0;
  let n = 0;
  teamsConfig.teams.forEach((tm) => {
    if (tm.slots.some((slot) => slot.character === name)) n++;
  });
  return n;
}

/** Characters duplicated across two or more teams — these get the Used marker. */
function duplicatedTeamCharacters() {
  const seen = new Set();
  const dupes = new Set();
  teamsConfig.teams.forEach((team) => {
    const inTeam = new Set();
    team.slots.forEach((slot) => {
      if (!slot.character || inTeam.has(slot.character)) return;
      inTeam.add(slot.character);
      if (seen.has(slot.character)) dupes.add(slot.character);
      else seen.add(slot.character);
    });
  });
  return dupes;
}

/** True when a team holds any CN-only character or psychube. */
function teamHasFutureSightContent(team) {  if (!team) return false;
  return team.slots.some((slot) =>
    (slot.character && futureSightChars.has(slot.character)) ||
    (slot.psychube && futureSightPsychubes.has(slot.psychube))
  );
}

/** Teams that should appear in the modal right now (CN content is gated). */
function visibleTeams() {
  return teamsConfig.teams.filter((team) => futureSightEnabled || !teamHasFutureSightContent(team));
}

/* ---------------- PNG export ---------------- */

/* Shared by the showcase and Team Building exports: the preview modal's
   Share / Download buttons work off the latest blob. */
let currentExportBlob = null;
let currentExportBlobUrl = null;
let currentExportFileName = "";

function triggerDownload(url, fileName) {
  const link = document.createElement("a");
  link.download = fileName;
  link.href = url;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    if (link.parentNode) link.parentNode.removeChild(link);
  }, 1000);
}

/**
 * Hands a finished PNG to the user. Desktop downloads straight away; phones get
 * the preview sheet so the image can be saved to Photos or shared.
 */
function deliverExportBlob(blob, fileName) {
  currentExportBlob = blob;
  const oldBlobUrl = currentExportBlobUrl;
  currentExportBlobUrl = URL.createObjectURL(blob);
  if (oldBlobUrl) {
    setTimeout(() => URL.revokeObjectURL(oldBlobUrl), 10000);
  }
  currentExportFileName = fileName;

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isMobileDevice = /Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const isMobile = isIOS || isMobileDevice || window.innerWidth <= 768;

  // Native Web Share API capability
  let canShareFile = false;
  if (typeof File !== "undefined" && navigator.canShare) {
    try {
      const file = new File([blob], fileName, { type: "image/png" });
      canShareFile = navigator.canShare({ files: [file] });
    } catch (e) {
      canShareFile = false;
    }
  }

  if (!isMobile) {
    triggerDownload(currentExportBlobUrl, fileName);
    return;
  }

  // On Android / Mobile: try the direct download first, so the image lands in
  // Downloads / Gallery, then always show the preview sheet as a fallback.
  if (!isIOS) {
    try {
      triggerDownload(currentExportBlobUrl, fileName);
    } catch (dlErr) {
      console.warn("Auto download failed:", dlErr);
    }
  }

  const exportModal = document.getElementById("export-modal");
  const exportPreviewImg = document.getElementById("export-preview-img");
  const exportModalBtnShare = document.getElementById("export-modal-btn-share");
  const exportHelpTip = document.getElementById("export-help-tip");

  if (exportPreviewImg) exportPreviewImg.src = currentExportBlobUrl;
  if (exportModalBtnShare) {
    exportModalBtnShare.style.display = canShareFile ? "inline-flex" : "none";
  }
  if (exportHelpTip) {
    if (isIOS) {
      exportHelpTip.innerHTML = "💡 <strong>On iPhone / iPad:</strong> Tap and hold the image below and select <strong>Save to Photos</strong>, or tap <strong>Share / Save Image</strong>.";
    } else {
      exportHelpTip.innerHTML = "💡 <strong>Tip for Android:</strong> Tap <strong>Download</strong> below, or <strong>tap & hold (long press)</strong> on the image to select <strong>Download image / Save image</strong>.";
    }
  }
  if (exportModal) exportModal.style.display = "flex";
}

/* ---------------- Team: Export PNG ---------------- */

/** Teams worth drawing: visible ones that field at least one character. */
function exportableTeams() {
  return visibleTeams().filter((team) => team.slots.some((slot) => slot.character));
}

/** Resolves once every image inside `root` has loaded (failures count as done). */
function waitForExportImages(root) {
  const imgs = Array.from(root.querySelectorAll("img"));
  imgs.forEach((img) => { img.loading = "eager"; });
  return Promise.all(imgs.map((img) => {
    if (img.complete) return Promise.resolve();
    return new Promise((resolve) => {
      img.addEventListener("load", resolve, { once: true });
      img.addEventListener("error", resolve, { once: true });
    });
  }));
}

/**
 * Exports the teams as a PNG, always three cards per row — 3x3 for up to nine
 * teams, 3xN beyond that. The sheet is built offscreen at the desktop 3-column
 * width so a phone gets the same picture a wide screen shows. Teams without
 * characters and the "create your own team" tile are left out.
 *
 * If `includeUnused` is true, an unused characters section is added beneath the
 * teams list, reflecting the currently active team unused filter (e.g. 6* only).
 *
 * Resolves to false when there is nothing to export; throws when the capture
 * itself fails.
 */
async function exportTeamsPng(includeUnused = false) {
  const teams = exportableTeams();
  if (teams.length === 0) return false;
  if (typeof html2canvas !== "function") {
    throw new Error("html2canvas is not available");
  }

  // Offscreen sheet: same markup as the modal, pinned to the desktop width.
  const sheet = document.createElement("div");
  sheet.className = "team-export-sheet";
  sheet.style.width = `${TEAM_MODAL_MAX_WIDTH[TEAM_MAX_COLUMNS]}px`;
  sheet.setAttribute("aria-hidden", "true");
  sheet.inert = true; // keep focus out of the temporary copy
  const list = document.createElement("div");
  list.className = "team-list";
  teams.forEach((team) => {
    const card = renderTeamCard(team);
    // Replace <input class="team-name-input"> with clean static text span for high quality rendering in canvas
    const nameInput = card.querySelector(".team-name-input");
    if (nameInput) {
      const nameSpan = document.createElement("span");
      nameSpan.className = "team-name-text";
      const rawName = (nameInput.value || team.name || "").trim();
      nameSpan.textContent = rawName ? `✦ ${rawName}` : "✦";
      nameInput.parentNode.replaceChild(nameSpan, nameInput);
    }
    // Remove drag handle, delete button, and recommend button from the export capture
    card.querySelectorAll(".team-drag-handle, .btn-team-del, .btn-team-recommend").forEach((el) => el.remove());
    list.appendChild(card);
  });
  sheet.appendChild(list);

  if (includeUnused) {
    const unusedNames = teamUnusedCharacters();
    if (unusedNames.length > 0) {
      const unusedWrap = document.createElement("div");
      unusedWrap.className = "team-export-unused";
      const head = document.createElement("div");
      head.className = "team-export-unused-head";
      head.innerHTML = `<span class="team-unused-title">${escapeHtml(t("team.unusedCharacters"))}</span>`;
      const grid = document.createElement("div");
      grid.className = "team-export-unused-grid";
      unusedNames.forEach((name) => {
        const char = userRoster[name] || {};
        const tile = document.createElement("div");
        tile.className = "team-unused-tile" + (char.owned ? "" : " is-unowned");
        tile.innerHTML = `
          <img src="${escapeHtml(characterDb[name])}" alt="${escapeHtml(displayCharName(name))}" />
          <span class="team-unused-name${isItalicNameCharacter(name) ? " is-italic-name" : ""}">${escapeHtml(displayCharName(name))}</span>
        `;
        grid.appendChild(tile);
      });
      unusedWrap.appendChild(head);
      unusedWrap.appendChild(grid);
      sheet.appendChild(unusedWrap);
    }
  }

  document.body.appendChild(sheet);

  try {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    await waitForExportImages(sheet);

    // Keep the canvas inside the 4096px WebKit limit. Unlike a board, the sheet
    // grows one row per three teams, so very long lists may need scale < 1.
    const maxDim = Math.max(sheet.offsetWidth, sheet.offsetHeight);
    let scale = 2;
    if (maxDim * scale > 4096) {
      scale = Math.max(0.5, Math.floor((4096 / maxDim) * 100) / 100);
    }

    const canvas = await html2canvas(sheet, {
      backgroundColor: "#1b1613",
      scale,
      useCORS: true,
      logging: false,
      scrollX: 0,
      scrollY: 0,
      onclone: (clonedDoc) => {
        clonedDoc.querySelectorAll(".team-export-sheet img").forEach((img) => img.removeAttribute("loading"));
      },
    });

    let blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) {
      const dataUrl = canvas.toDataURL("image/png");
      blob = await (await fetch(dataUrl)).blob();
    }

    const fileName = `Sothebys_Mansion_Teams_${new Date().toISOString().slice(0, 10)}.png`;
    deliverExportBlob(blob, fileName);
    return true;
  } finally {
    sheet.remove();
  }
}

/* ---------------- Team Recommendation ---------------- */

/** Every preset variant that has an is_essential member, resolved and FS-filtered. */
function recommendableVariants() {
  const out = [];
  presetNames().forEach((presetName) => {
    (teamArchetypes[presetName] || []).forEach((variant, index) => {
      const members = resolvePresetVariant(variant);
      if (!members) return;
      // CN psychubes stay gated even after the character fallback ran
      if (!futureSightEnabled && presetVariantHasFutureSight(members)) return;
      if (!members.some((m) => m.isEssential)) return;
      out.push({ presetName, index, members });
    });
  });
  return out;
}

/** Characters this team actually fields. */
function teamCharacters(team) {
  return new Set((team ? team.slots : []).map((slot) => slot.character).filter(Boolean));
}

/** True when the roster owns this character. */
function isCharacterOwned(name) {
  return !!(userRoster[name] && userRoster[name].owned);
}

/** A slot is satisfiable when the primary member or one of its substitutes is owned. */
function memberIsFormable(member) {
  return isCharacterOwned(member.character) ||
    (member.substitutes || []).some((sub) => isCharacterOwned(sub.character));
}

/**
 * Which character actually fills a slot.
 *
 * Preference order, so a freshly added team spreads across the roster instead of
 * piling onto characters that are already committed elsewhere:
 *   1. the primary member, when owned and not fielded by ANY team
 *   2. the first substitute that is owned and not fielded by any team
 *   3. fallback to the plain owned preference (primary, else first owned
 *      substitute, else the primary even when unowned) — the "original team"
 *      behaviour used when every option is already taken.
 *
 * An `is_essential` member is never swapped for a substitute: the archetype
 * requires that exact character.
 */
function preferredVariantChoice(member) {
  const primary = { character: member.character, psychube: member.psychube };
  const unused = (name) => teamCountForCharacter(name) === 0;

  if (!member.isEssential) {
    if (isCharacterOwned(member.character) && unused(member.character)) return primary;

    const fresh = (member.substitutes || []).find(
      (sub) => isCharacterOwned(sub.character) && unused(sub.character)
    );
    if (fresh) return { character: fresh.character, psychube: fresh.psychube };
  }

  if (isCharacterOwned(member.character)) return primary;

  const alt = (member.substitutes || []).find((sub) => isCharacterOwned(sub.character));
  if (alt) return { character: alt.character, psychube: alt.psychube };
  return primary;
}

/**
 * Preset variants whose essential members are all covered by the team's
 * characters. This is what makes the Recommend button appear on a team.
 */
function recommendableVariantsForTeam(team) {
  const chars = teamCharacters(team);
  if (chars.size === 0) return [];
  return recommendableVariants().filter((v) =>
    v.members.some((m) => m.isEssential && chars.has(m.character))
  );
}

/**
 * Resolves one authored variant into the members to show for the CURRENT Future
 * Sight state, or `null` when the variant cannot be fielded.
 *
 * When CN content is off, a member whose primary is CN-only is replaced by its
 * first global substitute — that substitute is *promoted* into the primary slot
 * so the archetype stays usable on the Global build. A CN member with no global
 * replacement makes the whole variant unavailable.
 */
function resolvePresetVariant(variant) {
  const members = presetVariantMembers(variant);
  if (members.length === 0) return null;
  if (futureSightEnabled) return members;

  const resolved = [];
  for (const m of members) {
    if (!futureSightChars.has(m.character)) {
      resolved.push(m);
      continue;
    }

    const subs = m.substitutes || [];
    const idx = subs.findIndex((s) => !futureSightChars.has(s.character));
    if (idx < 0) return null;

    const promoted = subs[idx];
    resolved.push({
      character: promoted.character,
      psychube: promoted.psychube,
      isEssential: m.isEssential,
      euphoria: promoted.euphoria,
      substitutes: subs.filter((_, i) => i !== idx),
    });
  }
  return resolved;
}

/**
 * Characters that should carry the Used marker right now.
 *
 * Team Presets flags anything fielded by >= 1 team, so the board reads as a
 * whole. Team Recommendation ignores the team being recommended *for* — its own
 * members are not a conflict — but flags anything another team already holds.
 * "Hide Warning" empties the set everywhere.
 */
function usedMarkerSet(exceptTeamId) {
  if (teamsHideWarning) return new Set();
  return usedTeamCharacters(exceptTeamId);
}

/** Variants shown in the Recommend modal, honouring the search box + Formable Only. */
function recommendedVariantsForTeam(team) {
  let variants = recommendableVariantsForTeam(team);

  if (teamsFormableOnly) {
    variants = variants.filter((v) => v.members.every(memberIsFormable));
  }

  const query = (teamRecommendSearch ? teamRecommendSearch.value : "").trim();
  if (query) {
    variants = variants.filter((v) =>
      v.presetName.toLowerCase().includes(query.toLowerCase()) ||
      v.members.some((m) => characterMatchesQuery(m.character, query))
    );
  }
  return variants;
}

/** Fills a team's empty slots with a recommended variant, preserving the essentials. */
function applyRecommendedVariant(team, variant, isManual) {
  if (!team || !variant) return;
  const members = variant.members.slice();
  const essentials = members.filter((m) => m.isEssential);
  const rest = members.filter((m) => !m.isEssential);
  const ordered = essentials.concat(rest).slice(0, TEAM_SLOT_COUNT);

  const slots = createEmptyTeamSlots();
  ordered.forEach((member, i) => {
    slots[i] = isManual
      ? { character: member.character, psychube: member.psychube }
      : preferredVariantChoice(member);
  });

  // An existing slot keeps its occupant unless the variant wants that slot for an essential
  team.slots.forEach((slot, i) => {
    const wanted = ordered[i];
    if (slot.character && (!wanted || !wanted.isEssential)) {
      if (!slots.some((s) => s.character === slot.character)) {
        slots[i] = { character: slot.character, psychube: slot.psychube };
      }
    }
  });

  team.slots = slots;
  // Re-runs the one-character / one-psychube-per-team rules the merge could have broken
  sanitizeTeamsState();
  saveTeams();
  teamModalDirty = true;
  renderTeamModal();
}

function openTeamRecommend(teamId) {
  teamRecommendTeamId = teamId;
  presetManualChoices.clear();
  if (teamRecommendSearch) teamRecommendSearch.value = "";
  renderTeamRecommend();
  document.getElementById("team-recommend-modal").style.display = "flex";
}

function closeTeamRecommend() {
  document.getElementById("team-recommend-modal").style.display = "none";
  teamRecommendTeamId = null;
}

/** Characters already committed to some team, optionally ignoring one team. */
function usedTeamCharacters(exceptTeamId) {
  const used = new Set();
  teamsConfig.teams.forEach((tm) => {
    if (tm.id === exceptTeamId) return;
    tm.slots.forEach((slot) => { if (slot.character) used.add(slot.character); });
  });
  return used;
}

/** Psychubes already committed to some team, optionally ignoring one team. */
function usedTeamPsychubes(exceptTeamId) {
  const used = new Set();
  teamsConfig.teams.forEach((tm) => {
    if (tm.id === exceptTeamId) return;
    tm.slots.forEach((slot) => { if (slot.psychube) used.add(slot.psychube); });
  });
  return used;
}

function nextEmptyTeamSlot(team) {
  if (!team) return -1;
  return team.slots.findIndex((slot) => !slot.character);
}

function addTeam() {
  const team = createTeam();
  teamsConfig.teams.push(team);
  saveTeams();
  teamModalDirty = true;
  renderTeamModal();
  // Focus the freshly created name so it can be renamed straight away
  const input = document.querySelector(`#team-list .team-name-input[data-team-id="${team.id}"]`);
  if (input) {
    input.focus();
    input.select();
  }
}

function deleteTeam(teamId) {
  const idx = teamsConfig.teams.findIndex((tm) => tm.id === teamId);
  if (idx < 0) return;
  teamsConfig.teams.splice(idx, 1);
  saveTeams();
  teamModalDirty = true;
  renderTeamModal();
}

/**
 * Moves a team to `target` in the stored order. Used by drag and drop in the
 * Team Building modal. The visible list can hide teams (search / ownable
 * filters), so the target index is in the full list.
 */
function moveTeamTo(teamId, target) {
  const teams = teamsConfig.teams;
  const from = teams.findIndex((tm) => tm.id === teamId);
  if (from < 0) return false;
  const to = Math.max(0, Math.min(teams.length - 1, target));
  if (from === to) return false;
  const [team] = teams.splice(from, 1);
  teams.splice(to, 0, team);
  saveTeams();
  teamModalDirty = true;
  return true;
}

function renameTeam(teamId, name) {
  const team = findTeam(teamId);
  if (!team) return;
  team.name = String(name || "").slice(0, TEAM_NAME_MAX_LEN);
  saveTeams();
}

/** Writes a character into a slot, clearing the psychube if the character is removed. */
function setTeamSlotCharacter(teamId, slotIndex, character) {
  const team = findTeam(teamId);
  if (!team || slotIndex < 0 || slotIndex >= TEAM_SLOT_COUNT) return;

  // A character may only appear once per team
  if (character && team.slots.some((slot, i) => i !== slotIndex && slot.character === character)) return;

  team.slots[slotIndex].character = character;
  if (!character) team.slots[slotIndex].psychube = null;
  saveTeams();
  teamModalDirty = true;
}

/** Writes a psychube into a slot, enforcing one psychube per team. */
function setTeamSlotPsychube(teamId, slotIndex, key) {
  const team = findTeam(teamId);
  if (!team || slotIndex < 0 || slotIndex >= TEAM_SLOT_COUNT) return;
  if (!team.slots[slotIndex].character) return;

  if (key && team.slots.some((slot, i) => i !== slotIndex && slot.psychube === key)) return;

  team.slots[slotIndex].psychube = key;
  saveTeams();
  teamModalDirty = true;
}

/**
 * Portrait art for a slot: the character image with the afflatus emblem in the
 * top-left corner, a dark band carrying the insight icon + level and, under that
 * band, a two-pixel portrait tier line. Unowned characters show none of them.
 * Presets use their own markup, so they never get the tier line. The psychube
 * tile is a separate
 * sibling block (see renderTeamCard) so the two never share a hover frame.
 */
function teamSlotPortraitHtml(character) {
  const char = userRoster[character] || {};
  const iconUrl = getCardAvatarUrl(character, char, characterDb[character]);
  const insight = Number(char.insight) || 0;
  const level = Number(char.level) || 0;
  const afflatus = getCharacterAfflatus(character);

  const afflatusHtml = afflatus
    ? `<span class="team-slot-afflatus"><img src="images/afflatus_icon/${escapeHtml(afflatus)}.png" alt="${escapeHtml(displayAfflatus(afflatus))}" loading="lazy" decoding="async" /></span>`
    : "";

  const dupeHtml = !teamsHideWarning && duplicatedTeamCharacters().has(character)
    ? `<img src="images/random_icon/Used_icon.png" alt="" class="team-slot-used" loading="lazy" decoding="async" />`
    : "";

  // Insight sits beside the level in the bottom band; the portrait tier line
  // runs under that band.
  const insightHtml = char.owned && insight > 0
    ? `<img src="images/insight_icon/I${insight}.png" alt="${escapeHtml(fmtInsight(insight))}" class="team-slot-insight" loading="lazy" decoding="async" />`
    : "";

  const metaHtml = char.owned
    ? `<span class="team-slot-meta">${insightHtml}<span class="team-slot-level">${escapeHtml(fmtLevel(level))}</span></span>`
    : "";

  // Portrait tier line: two pixels of dashes inside the portrait, under the level
  const portraitBarHtml = char.owned
    ? `<span class="team-slot-portrait-bar">${rotationPortraitDashesHtml(char.portrait, getCharacterRarity(character))}</span>`
    : "";

  return `
    <span class="team-slot-portrait${char.owned ? "" : " is-unowned"}">
      <img src="${escapeHtml(iconUrl)}" alt="${escapeHtml(displayCharName(character))}" class="team-slot-img" loading="lazy" decoding="async" />
      ${afflatusHtml}
      ${metaHtml}
      ${portraitBarHtml}
    </span>
    ${dupeHtml}
  `;
}

/* ---- Team card drag and drop ---- */

/** The team card being dragged (null when no card drag is in progress). */
let teamDragId = null;

function clearTeamDropMarks(exceptCard) {
  document.querySelectorAll("#team-list .team-card").forEach((card) => {
    if (card === exceptCard) return;
    card.classList.remove("is-dragging", "drop-above", "drop-below");
  });
}

function onTeamCardDragStart(event, team, card) {
  teamDragId = team.id;
  card.classList.add("is-dragging");
  event.dataTransfer.effectAllowed = "move";
  // Firefox refuses to start a drag without payload data.
  event.dataTransfer.setData("text/plain", team.id);
}

function endTeamCardDrag(card) {
  teamDragId = null;
  clearTeamDropMarks(null);
  if (card) card.classList.remove("is-dragging");
}

function onTeamCardDragOver(event, team, card) {
  if (!teamDragId || teamDragId === team.id) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";

  const rect = card.getBoundingClientRect();
  const above = event.clientY < rect.top + rect.height / 2;
  clearTeamDropMarks(card);
  card.classList.toggle("drop-above", above);
  card.classList.toggle("drop-below", !above);
}

function onTeamCardDrop(event, team, card) {
  if (!teamDragId || teamDragId === team.id) return;
  event.preventDefault();

  const rect = card.getBoundingClientRect();
  const above = event.clientY < rect.top + rect.height / 2;
  const draggedId = teamDragId;
  teamDragId = null;
  clearTeamDropMarks(null);

  const from = teamsConfig.teams.findIndex((tm) => tm.id === draggedId);
  const to = teamsConfig.teams.findIndex((tm) => tm.id === team.id);
  if (from < 0 || to < 0) return;

  // Removing the dragged team first shifts every team after it down by one.
  let target = above ? to : to + 1;
  if (from < target) target -= 1;

  if (moveTeamTo(draggedId, target)) renderTeamModal();
}

function renderTeamCard(team) {
  const card = document.createElement("div");
  card.className = "team-card";
  card.dataset.teamId = team.id;

  const head = document.createElement("div");
  head.className = "team-card-head";

  // The handle is the only drag source, so renaming and the buttons stay usable.
  const dragHandle = document.createElement("span");
  dragHandle.className = "team-drag-handle";
  dragHandle.textContent = "⠿";
  dragHandle.title = t("team.dragReorder");
  dragHandle.setAttribute("draggable", "true");
  dragHandle.setAttribute("role", "button");
  dragHandle.setAttribute("tabindex", "0");
  dragHandle.addEventListener("dragstart", (e) => onTeamCardDragStart(e, team, card));
  dragHandle.addEventListener("dragend", () => endTeamCardDrag(card));
  // Keyboard fallback: arrow keys move the team without a mouse.
  dragHandle.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const from = teamsConfig.teams.findIndex((tm) => tm.id === team.id);
    if (from < 0) return;
    if (moveTeamTo(team.id, from + (e.key === "ArrowUp" ? -1 : 1))) {
      renderTeamModal();
      const next = document.querySelector(`#team-list .team-card[data-team-id="${team.id}"] .team-drag-handle`);
      if (next) next.focus();
    }
  });
  head.appendChild(dragHandle);

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "team-name-input";
  nameInput.dataset.teamId = team.id;
  nameInput.value = team.name;
  nameInput.maxLength = TEAM_NAME_MAX_LEN;
  nameInput.title = t("team.rename");
  nameInput.addEventListener("input", (e) => renameTeam(team.id, e.target.value));

  const btnDel = document.createElement("button");
  btnDel.type = "button";
  btnDel.className = "btn-team-del";
  btnDel.innerHTML = "&times;";
  btnDel.title = t("team.delete");
  btnDel.addEventListener("click", () => deleteTeam(team.id));

  head.appendChild(nameInput);

  // Share: icon-only, copies the /sim link for this exact team.
  const btnShare = document.createElement("button");
  btnShare.type = "button";
  btnShare.className = "btn-team-share";
  btnShare.title = t("team.share");
  btnShare.setAttribute("aria-label", t("team.share"));
  btnShare.innerHTML = `<img src="images/random_icon/share_icon.png" alt="" class="btn-team-share-icon" />`;
  btnShare.addEventListener("click", () => copyShareLink(btnShare, simShareUrlForTeam(team), t("team.share")));
  head.appendChild(btnShare);

  // Recommend: only offered when the team fields an essential member of a preset
  if (recommendableVariantsForTeam(team).length > 0) {
    const btnRec = document.createElement("button");
    btnRec.type = "button";
    btnRec.className = "btn-team-recommend";
    btnRec.title = t("team.recommend");
    btnRec.innerHTML = `<img src="images/random_icon/Recommend_icon.png" alt="" class="btn-team-recommend-icon" />`;
    btnRec.addEventListener("click", () => openTeamRecommend(team.id));
    head.appendChild(btnRec);
  }

  head.appendChild(btnDel);
  card.appendChild(head);

  // The whole card accepts the drop; drop listeners are attached on every
  // render because dragstart does not re-render the list.
  card.addEventListener("dragover", (e) => onTeamCardDragOver(e, team, card));
  card.addEventListener("dragleave", (e) => {
    if (!card.contains(e.relatedTarget)) {
      card.classList.remove("drop-above", "drop-below");
      if (!teamDragId) card.classList.remove("is-dragging");
    }
  });
  card.addEventListener("drop", (e) => onTeamCardDrop(e, team, card));

  const slotRow = document.createElement("div");
  slotRow.className = "team-slots";

  team.slots.forEach((slot, i) => {
    const slotEl = document.createElement("div");
    slotEl.className = "team-slot" + (slot.character ? " is-filled" : "");

    const charBtn = document.createElement("button");
    charBtn.type = "button";
    charBtn.className = "team-slot-char";
    charBtn.title = slot.character ? displayCharName(slot.character) : t("team.addCharacter");
    charBtn.innerHTML = slot.character
      ? teamSlotPortraitHtml(slot.character)
      : `<span class="team-slot-plus">+</span>`;
    charBtn.addEventListener("click", () => onTeamSlotClick(team.id, i, slot));
    slotEl.appendChild(charBtn);

    // Separate sibling block: hovering the portrait must not frame the psychube too
    if (slot.character) {
      // An unowned psychube dims exactly like an unowned character portrait
      const chubeUnowned = slot.psychube && !getPsychubeState(slot.psychube).owned;
      const chubeBtn = document.createElement("button");
      chubeBtn.type = "button";
      chubeBtn.className = "team-slot-chube" +
        (slot.psychube ? " is-filled" : "") +
        (chubeUnowned ? " is-unowned" : "");
      chubeBtn.title = slot.psychube ? psychubeName(slot.psychube) : t("team.addPsychube");
      chubeBtn.innerHTML = slot.psychube
        ? `<img src="${escapeHtml(psychubeIconUrl(slot.psychube))}" alt="${escapeHtml(psychubeName(slot.psychube))}" loading="lazy" decoding="async" />`
        : `<span class="team-slot-chube-plus">+</span>`;
      chubeBtn.addEventListener("click", () => openTeamSelectPsychube(team.id, i));
      slotEl.appendChild(chubeBtn);
    }

    slotRow.appendChild(slotEl);
  });

  card.appendChild(slotRow);
  return card;
}

/**
 * A pending character (picked in the unused strip) drops straight into the
 * clicked slot. Otherwise an empty slot opens the picker and an occupied slot
 * is cleared.
 */
function onTeamSlotClick(teamId, slotIndex, slot) {
  if (pendingTeamCharacter) {
    setTeamSlotCharacter(teamId, slotIndex, pendingTeamCharacter);
    pendingTeamCharacter = null;
    renderTeamModal();
    return;
  }
  if (slot.character) {
    setTeamSlotCharacter(teamId, slotIndex, null);
    renderTeamModal();
    return;
  }
  openTeamSelectCharacter(teamId, slotIndex);
}

function renderTeamAddCard() {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "team-card team-add-card";
  card.innerHTML = `
    <span class="team-add-plus">+</span>
    <span class="team-add-label">${escapeHtml(t("team.createOwn"))}</span>
  `;
  card.addEventListener("click", addTeam);
  return card;
}

/** Characters eligible for the bottom strip: not in any team, honouring filters. */
function teamUnusedCharacters() {
  const used = usedTeamCharacters(null);
  const query = (teamModalSearch ? teamModalSearch.value : "").trim().toLowerCase();
  return Object.keys(characterDb)
    .filter((name) => !isCharacterExcluded(name))
    .filter((name) => futureSightEnabled || !futureSightChars.has(name))
    .filter((name) => !used.has(name))
    .filter((name) => teamModalRarityFilters.size === 0 || teamModalRarityFilters.has(getCharacterRarity(name)))
    .filter((name) => {
      const char = userRoster[name];
      return teamsAllowUnowned || (char && char.owned);
    })
    .filter((name) => characterMatchesQuery(name, query))
    .sort(compareUnownedCharacters);
}

function renderTeamModal() {
  const list = document.getElementById("team-list");
  if (!list) return;

  applyTeamColumns();

  list.innerHTML = "";
  visibleTeams().forEach((team) => list.appendChild(renderTeamCard(team)));
  list.appendChild(renderTeamAddCard());

  const btnUnowned = document.getElementById("btn-team-allow-unowned");
  if (btnUnowned) {
    btnUnowned.classList.toggle("active", teamsAllowUnowned);
    btnUnowned.setAttribute("aria-pressed", String(teamsAllowUnowned));
  }

  const btnHideWarning = document.getElementById("btn-team-hide-warning");
  if (btnHideWarning) {
    btnHideWarning.classList.toggle("active", teamsHideWarning);
    btnHideWarning.setAttribute("aria-pressed", String(teamsHideWarning));
  }

  const grid = document.getElementById("team-unused-grid");
  if (grid) {
    grid.innerHTML = "";
    const names = teamUnusedCharacters();
    if (names.length === 0) {
      const empty = document.createElement("div");
      empty.className = "team-unused-empty";
      empty.textContent = t("team.noUnused");
      grid.appendChild(empty);
    }
    names.forEach((name) => {
      const char = userRoster[name] || {};
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "team-unused-tile" + (char.owned ? "" : " is-unowned");
      if (pendingTeamCharacter === name) tile.classList.add("is-pending");
      tile.title = displayCharName(name);
      tile.innerHTML = `
        <img src="${escapeHtml(characterDb[name])}" alt="${escapeHtml(displayCharName(name))}" loading="lazy" decoding="async" />
        <span class="team-unused-name${isItalicNameCharacter(name) ? " is-italic-name" : ""}">${escapeHtml(displayCharName(name))}</span>
      `;
      // Picking a character arms the next slot click; picking it again disarms.
      tile.addEventListener("click", () => {
        pendingTeamCharacter = pendingTeamCharacter === name ? null : name;
        renderTeamModal();
      });
      grid.appendChild(tile);
    });
  }
}

function openTeamModal() {
  pendingTeamCharacter = null;
  renderTeamModal();
  document.getElementById("team-modal").style.display = "flex";
}

function closeTeamModal() {
  document.getElementById("team-modal").style.display = "none";
  pendingTeamCharacter = null;
  // The board itself does not show teams, but the roster may have changed
  if (teamModalDirty) {
    teamModalDirty = false;
    renderShowcase();
  }
}

/* ---------------- Team: Select Character ---------------- */

function openTeamSelectCharacter(teamId, slotIndex) {
  teamSlotPicker.teamId = teamId;
  teamSlotPicker.slotIndex = slotIndex;
  const search = document.getElementById("team-select-char-search");
  if (search) search.value = "";
  renderTeamSelectCharacter();
  document.getElementById("team-select-char-modal").style.display = "flex";
}

function closeTeamSelectCharacter() {
  document.getElementById("team-select-char-modal").style.display = "none";
  teamSlotPicker.teamId = null;
}

function renderTeamSelectCharacter() {
  const grid = document.getElementById("team-select-char-grid");
  if (!grid) return;
  grid.innerHTML = "";

  const team = findTeam(teamSlotPicker.teamId);
  const query = (document.getElementById("team-select-char-search").value || "").trim().toLowerCase();

  // Characters already in THIS team are hidden, except the one occupying the
  // slot being edited, so re-picking the same character stays possible.
  const inThisTeam = new Set(
    (team ? team.slots : [])
      .filter((_, i) => i !== teamSlotPicker.slotIndex)
      .map((slot) => slot.character)
      .filter(Boolean)
  );

  const names = Object.keys(characterDb)
    .filter((name) => !isCharacterExcluded(name))
    .filter((name) => futureSightEnabled || !futureSightChars.has(name))
    .filter((name) => !inThisTeam.has(name))
    .filter((name) => teamSelectCharRarityFilters.size === 0 || teamSelectCharRarityFilters.has(getCharacterRarity(name)))
    .filter((name) => {
      const char = userRoster[name];
      return teamsAllowUnowned || (char && char.owned);
    })
    .filter((name) => characterMatchesQuery(name, query))
    .sort(compareUnownedCharacters);

  const dupes = teamsHideWarning ? new Set() : duplicatedTeamCharacters();

  names.forEach((name) => {
    const char = userRoster[name] || {};
    const item = document.createElement("div");
    item.className = "roster-char-item" + (char.owned ? " is-owned" : " not-owned");
    item.innerHTML = `
      <div class="roster-avatar-box">
        <img src="${escapeHtml(getCardAvatarUrl(name, char, characterDb[name]))}" alt="${escapeHtml(name)}" class="roster-avatar-img" loading="lazy" decoding="async" />
        ${dupes.has(name) ? `<img src="images/random_icon/Used_icon.png" alt="${escapeHtml(t("team.usedElsewhere"))}" title="${escapeHtml(t("team.usedElsewhere"))}" class="team-used-badge" />` : ""}
      </div>
      <span class="roster-char-name${isItalicNameCharacter(name) ? " is-italic-name" : ""}">${escapeHtml(displayCharName(name))}</span>
    `;
    item.addEventListener("click", () => {
      setTeamSlotCharacter(teamSlotPicker.teamId, teamSlotPicker.slotIndex, name);
      closeTeamSelectCharacter();
      renderTeamModal();
    });
    grid.appendChild(item);
  });

  if (names.length === 0) {
    const empty = document.createElement("div");
    empty.className = "team-unused-empty";
    empty.textContent = t("team.noCharacters");
    grid.appendChild(empty);
  }
}

/* ---------------- Team: Select Psychube ---------------- */

function openTeamSelectPsychube(teamId, slotIndex) {
  teamSlotPicker.teamId = teamId;
  teamSlotPicker.slotIndex = slotIndex;
  const search = document.getElementById("team-select-chube-search");
  if (search) search.value = "";
  renderTeamSelectPsychube();
  document.getElementById("team-select-chube-modal").style.display = "flex";
}

function closeTeamSelectPsychube() {
  document.getElementById("team-select-chube-modal").style.display = "none";
  teamSlotPicker.teamId = null;
}

function renderTeamSelectPsychube() {
  const grid = document.getElementById("team-select-chube-grid");
  if (!grid) return;
  grid.innerHTML = "";

  const team = findTeam(teamSlotPicker.teamId);
  const query = (document.getElementById("team-select-chube-search").value || "").trim().toLowerCase();

  // Same rule as characters: at most one copy of a psychube per team.
  const inThisTeam = new Set(
    (team ? team.slots : [])
      .filter((_, i) => i !== teamSlotPicker.slotIndex)
      .map((slot) => slot.psychube)
      .filter(Boolean)
  );

  const keys = psychubeOrder
    .filter((key) => !isSpecialPsychube(key))
    .filter((key) => futureSightEnabled || !futureSightPsychubes.has(key))
    .filter((key) => !inThisTeam.has(key))
    // Owned-only unless the Show Unowned toggle is on
    .filter((key) => teamsAllowUnowned || !!getPsychubeState(key).owned)
    .filter((key) => teamSelectChubeRarityFilters.size === 0 || teamSelectChubeRarityFilters.has(psychubeDb[key].rarity))
    .filter((key) => psychubeMatchesQuery(key, query));

  keys.forEach((key) => {
    const chube = psychubeDb[key];
    const state = getPsychubeState(key);
    const item = document.createElement("div");
    item.className = "roster-char-item" + (state.owned ? " is-owned" : " not-owned");
    item.innerHTML = `
      <div class="roster-avatar-box is-chube">
        <img src="${escapeHtml(chube.iconUrl)}" alt="${escapeHtml(chube.name)}" class="roster-avatar-img" loading="lazy" decoding="async" />
      </div>
      <span class="roster-char-name">${escapeHtml(psychubeName(key))}</span>
      <span class="chube-manage-meta">Lv.${Number(state.level) || 1} · ${fmtAmp(Number(state.amplification) || PSYCHUBE_MIN_AMP)}</span>
    `;
    item.addEventListener("click", () => {
      setTeamSlotPsychube(teamSlotPicker.teamId, teamSlotPicker.slotIndex, key);
      closeTeamSelectPsychube();
      renderTeamModal();
    });
    grid.appendChild(item);
  });

  if (keys.length === 0) {
    const empty = document.createElement("div");
    empty.className = "team-unused-empty";
    empty.textContent = t("team.noPsychubes");
    grid.appendChild(empty);
  }
}

/* ---------------- Team Presets ---------------- */

function presetNames() {
  return Object.keys(teamArchetypes).filter((name) => Array.isArray(teamArchetypes[name]));
}

/**
 * Manual mode: the member a slot shows. The authored primary stays put until the
 * player promotes a substitute by clicking its chip; the previous primary then
 * becomes a chip of its own, so the choice is always reversible.
 */
function manualVariantMembers(presetName, variantIndex, members) {
  return members.map((member, slotIndex) => {
    const chosen = presetManualChoices.get(`${presetName}#${variantIndex}#${slotIndex}`);
    const subs = member.substitutes || [];
    const idx = subs.findIndex((sub) => sub.character === chosen);
    if (idx < 0) return member;

    const picked = subs[idx];
    return {
      character: picked.character,
      psychube: picked.psychube,
      isEssential: member.isEssential,
      euphoria: picked.euphoria,
      substitutes: [
        { character: member.character, psychube: member.psychube, euphoria: member.euphoria },
        ...subs.filter((_, i) => i !== idx),
      ],
    };
  });
}

function renderTeamPresets() {
  const body = document.getElementById("team-presets-body");
  if (!body) return;

  const btnFormable = document.getElementById("btn-preset-formable-only");
  if (btnFormable) {
    btnFormable.classList.toggle("active", teamsFormableOnly);
    btnFormable.setAttribute("aria-pressed", String(teamsFormableOnly));
  }

  // Manual mode keeps the authored mains and lets the player promote a substitute.
  const btnMode = document.getElementById("btn-preset-mode");
  if (btnMode) {
    btnMode.classList.toggle("active", teamsManualPick);
    btnMode.setAttribute("aria-pressed", String(teamsManualPick));
    const label = btnMode.querySelector(".preset-mode-label");
    if (label) label.textContent = t(teamsManualPick ? "team.modeManual" : "team.modeAutomatic");
  }

  const query = (teamPresetSearch ? teamPresetSearch.value : "").trim();
  const presetQuery = query.toLowerCase();

  // Group the resolved variants by archetype name, preserving authoring order
  const groups = [];
  presetNames().forEach((presetName) => {
    let variants = (teamArchetypes[presetName] || [])
      .map((variant, index) => ({ index, members: resolvePresetVariant(variant) }))
      .filter((entry) => entry.members !== null)
      .filter((entry) => futureSightEnabled || !presetVariantHasFutureSight(entry.members));

    // "Formable Only": every slot must be satisfiable (primary or a substitute)
    if (teamsFormableOnly) {
      variants = variants.filter((entry) => entry.members.every(memberIsFormable));
    }

    // Search matches the preset name or any member's name
    if (query) {
      const hitName = presetName.toLowerCase().includes(presetQuery);
      const hitMember = variants.some((entry) => entry.members.some((m) => characterMatchesQuery(m.character, query)));
      if (!hitName && !hitMember) return;
    }

    if (variants.length === 0) return;
    groups.push({ presetName, variants });
  });

  renderArchetypeBlocks(body, groups, {
    emptyText: t("team.noPresets"),
    usedSet: usedMarkerSet(null),
    keyOf: (presetName, entry) => `${presetName}#${entry.index}`,
    membersOf: (presetName, entry) =>
      teamsManualPick ? manualVariantMembers(presetName, entry.index, entry.members) : entry.members,
    onSubstitutePick: teamsManualPick
      ? (key, slotIndex, character) => {
          presetManualChoices.set(`${key}#${slotIndex}`, character);
          renderTeamPresets();
        }
      : null,
    onToggle: (presetName) => {
      if (teamCollapsedGroups.has(presetName)) teamCollapsedGroups.delete(presetName);
      else teamCollapsedGroups.add(presetName);
      renderTeamPresets();
    },
    actionLabel: t("team.add"),
    onAction: (presetName, members) => {
      const team = createTeam(presetName);
      members.forEach((member, i) => {
        if (i >= TEAM_SLOT_COUNT) return;
        // Manual mode fields exactly what the row shows.
        team.slots[i] = teamsManualPick
          ? { character: member.character, psychube: member.psychube }
          : preferredVariantChoice(member);
      });
      teamsConfig.teams.push(team);
      saveTeams();
      teamModalDirty = true;
      renderTeamModal();
      closeTeamPresets();
      document.getElementById("team-modal").style.display = "flex";
    },
  });
}

/**
 * Shared archetype renderer for Team Presets and the Team Recommendation modal.
 * Each archetype is one block; its variants stack inside it, so the modal's
 * grid decides how many archetypes share a row.
 */
function renderArchetypeBlocks(body, groups, opts) {
  body.innerHTML = "";

  // Computed once per render — every member cell and substitute chip needs it.
  // Callers choose the scope: Presets flags any team, Recommendation ignores its own.
  const usedSet = opts.usedSet || new Set();

  if (groups.length === 0) {
    const empty = document.createElement("div");
    empty.className = "team-unused-empty";
    empty.textContent = opts.emptyText;
    body.appendChild(empty);
    return;
  }

  groups.forEach(({ presetName, variants }) => {
    const block = document.createElement("div");
    block.className = "preset-block";
    const head = document.createElement("div");
    head.className = "preset-head";
    head.innerHTML = `<span class="preset-name">${escapeHtml(presetName)}</span>`;

    // Multiple variants of the same archetype start collapsed behind a chevron
    const collapsed = variants.length > 1 && !teamCollapsedGroups.has(presetName);
    if (variants.length > 1) {
      const btnToggle = document.createElement("button");
      btnToggle.type = "button";
      btnToggle.className = "preset-toggle" + (collapsed ? " is-collapsed" : "");
      btnToggle.textContent = "\u25BC";
      btnToggle.title = t("team.toggleVariants");
      btnToggle.setAttribute("aria-expanded", String(!collapsed));
      btnToggle.addEventListener("click", () => opts.onToggle(presetName));
      head.appendChild(btnToggle);
    }
    block.appendChild(head);

    const rows = document.createElement("div");
    rows.className = "preset-rows";

    const shown = collapsed ? variants.slice(0, 1) : variants;
    shown.forEach((entry) => {
      // Presets pass keyed entries (so a manual pick can be remembered);
      // Recommendation passes plain member arrays.
      const members = opts.membersOf ? opts.membersOf(presetName, entry) : Array.isArray(entry) ? entry : entry.members;
      const key = opts.keyOf ? opts.keyOf(presetName, entry) : "";

      const row = document.createElement("div");
      row.className = "preset-row";

      const membersWrap = document.createElement("div");
      membersWrap.className = "preset-members";
      members.forEach((member, slotIndex) =>
        membersWrap.appendChild(
          presetSlotCell(
            member,
            usedSet,
            opts.onSubstitutePick ? (character) => opts.onSubstitutePick(key, slotIndex, character) : null
          )
        )
      );

      const btnAction = document.createElement("button");
      btnAction.type = "button";
      btnAction.className = "preset-add-btn";
      btnAction.textContent = opts.actionLabel;
      btnAction.addEventListener("click", () => opts.onAction(presetName, members));

      row.appendChild(membersWrap);
      row.appendChild(btnAction);
      rows.appendChild(row);
    });

    block.appendChild(rows);
    body.appendChild(block);
  });
}

/** Team Recommendation: presets whose essential members this team already fields. */
function renderTeamRecommend() {
  const body = document.getElementById("team-recommend-body");
  if (!body) return;

  const team = findTeam(teamRecommendTeamId);
  const title = document.getElementById("team-recommend-title-name");
  if (title) title.textContent = team ? team.name : "";

  const btnFormable = document.getElementById("btn-recommend-formable-only");
  if (btnFormable) {
    btnFormable.classList.toggle("active", teamsFormableOnly);
    btnFormable.setAttribute("aria-pressed", String(teamsFormableOnly));
  }

  // Same Automatic/Manual switch as Team Presets: Automatic lets the app pick
  // owned substitutes, Manual fields exactly the row the player configured.
  const btnMode = document.getElementById("btn-recommend-mode");
  if (btnMode) {
    btnMode.classList.toggle("active", teamsManualPick);
    btnMode.setAttribute("aria-pressed", String(teamsManualPick));
    const label = btnMode.querySelector(".preset-mode-label");
    if (label) label.textContent = t(teamsManualPick ? "team.modeManual" : "team.modeAutomatic");
  }

  const variants = recommendedVariantsForTeam(team);

  // Regroup the flat list by archetype so several variants share one block
  const groups = [];
  variants.forEach((v) => {
    let g = groups.find((x) => x.presetName === v.presetName);
    if (!g) { g = { presetName: v.presetName, variants: [] }; groups.push(g); }
    g.variants.push(v);
  });

  renderArchetypeBlocks(body, groups, {
    emptyText: t("team.noRecommendations"),
    // The team being recommended for is not a conflict — only OTHER teams count
    usedSet: usedMarkerSet(teamRecommendTeamId),
    keyOf: (presetName, entry) => `${presetName}#${entry.index}`,
    membersOf: (presetName, entry) =>
      teamsManualPick ? manualVariantMembers(presetName, entry.index, entry.members) : entry.members,
    onSubstitutePick: teamsManualPick
      ? (key, slotIndex, character) => {
          presetManualChoices.set(`${key}#${slotIndex}`, character);
          renderTeamRecommend();
        }
      : null,
    onToggle: (presetName) => {
      if (teamCollapsedGroups.has(presetName)) teamCollapsedGroups.delete(presetName);
      else teamCollapsedGroups.add(presetName);
      renderTeamRecommend();
    },
    actionLabel: t("team.use"),
    onAction: (presetName, members) => {
      applyRecommendedVariant(team, { presetName, members }, teamsManualPick);
      closeTeamRecommend();
    },
  });
}

/** One preset member: portrait + insight/level band + afflatus + psychube on the right. */
function presetMemberCell(member, dupes) {
  const char = userRoster[member.character] || {};
  const insight = Number(char.insight) || 0;
  const level = Number(char.level) || 0;
  const afflatus = getCharacterAfflatus(member.character);
  const isUsed = (dupes || duplicatedTeamCharacters()).has(member.character);

  const cell = document.createElement("div");
  cell.className = "preset-member" + (member.isEssential ? " is-essential" : "");
  cell.title = `${displayCharName(member.character)}${member.psychube ? " · " + psychubeName(member.psychube) : ""}${member.isEssential ? " · Essential" : ""}${isUsed ? " · " + t("team.usedElsewhere") : ""}`;
  cell.innerHTML = `
    <span class="preset-member-portrait${char.owned ? "" : " is-unowned"}">
      <img src="${escapeHtml(characterDb[member.character])}" alt="${escapeHtml(displayCharName(member.character))}" class="preset-member-img" loading="lazy" decoding="async" />
      ${afflatus ? `<span class="team-slot-afflatus"><img src="images/afflatus_icon/${escapeHtml(afflatus)}.png" alt="" loading="lazy" decoding="async" /></span>` : ""}
      ${char.owned ? `<span class="team-slot-meta">
        ${insight > 0 ? `<img src="images/insight_icon/I${insight}.png" alt="${escapeHtml(fmtInsight(insight))}" class="team-slot-insight" loading="lazy" decoding="async" />` : ""}
        <span class="team-slot-level">${escapeHtml(fmtLevel(level))}</span>
      </span>` : ""}
      ${member.euphoria || isUsed ? `<span class="preset-member-badges">
        ${member.euphoria ? `<span class="preset-member-euphoria">${escapeHtml(member.euphoria)}</span>` : ""}
        ${isUsed ? `<img src="images/random_icon/Used_icon.png" alt="${escapeHtml(t("team.usedElsewhere"))}" class="preset-member-used" loading="lazy" decoding="async" />` : ""}
      </span>` : ""}
    </span>
    <span class="preset-member-chube${member.psychube ? "" : " is-empty"}${member.psychube && !getPsychubeState(member.psychube).owned ? " is-unowned" : ""}">
      ${member.psychube
        ? `<img src="${escapeHtml(psychubeIconUrl(member.psychube))}" alt="${escapeHtml(psychubeName(member.psychube))}" loading="lazy" decoding="async" />`
        : ""}
    </span>
  `;
  return cell;
}

/**
 * A slot: the primary member with its interchangeable alternatives underneath.
 * Substitutes render as portrait-only chips — their psychube is the player's call.
 * When `onPick` is given (manual mode), a chip is a button that promotes that
 * substitute into the main slot.
 */
function presetSlotCell(member, dupes, onPick) {
  const usedSet = dupes || duplicatedTeamCharacters();
  const slot = document.createElement("div");
  slot.className = "preset-slot";
  slot.appendChild(presetMemberCell(member, usedSet));

  const subs = member.substitutes || [];
  if (subs.length > 0) {
    const row = document.createElement("div");
    row.className = "preset-subs";

    const label = document.createElement("span");
    label.className = "preset-subs-label";
    label.textContent = t("team.or");
    row.appendChild(label);

    subs.forEach((sub) => {
      const isUsed = usedSet.has(sub.character);
      const chip = document.createElement(onPick ? "button" : "span");
      chip.className =
        "preset-sub" +
        (isCharacterOwned(sub.character) ? "" : " is-unowned") +
        (onPick ? " is-pickable" : "");
      if (onPick) {
        chip.type = "button";
        chip.setAttribute("aria-label", t("team.pickSubstitute", { name: displayCharName(sub.character) }));
        chip.addEventListener("click", () => onPick(sub.character));
      }
      chip.title = `${displayCharName(sub.character)}${sub.psychube ? " · " + psychubeName(sub.psychube) : ""}${sub.euphoria ? " · " + sub.euphoria : ""}${isUsed ? " · " + t("team.usedElsewhere") : ""}`;
      chip.innerHTML = `
        <img src="${escapeHtml(characterDb[sub.character])}" alt="${escapeHtml(displayCharName(sub.character))}" loading="lazy" decoding="async" />
        ${isUsed ? `<img src="images/random_icon/Used_icon.png" alt="${escapeHtml(t("team.usedElsewhere"))}" class="preset-sub-used" loading="lazy" decoding="async" />` : ""}
      `;
      row.appendChild(chip);
    });

    slot.appendChild(row);
  }
  return slot;
}

function openTeamPresets() {
  presetManualChoices.clear();
  renderTeamPresets();
  document.getElementById("team-presets-modal").style.display = "flex";
}

function closeTeamPresets() {
  document.getElementById("team-presets-modal").style.display = "none";
}

/* ---------------- Team Building ---------------- */

/** Wires the Team Building modals. Called once from setupEventListeners(). */
function setupTeamBuildingListeners() {
  const teamModal = document.getElementById("team-modal");
  const btnTeam = document.getElementById("btn-team");
  if (!teamModal || !btnTeam) return;

  teamModalSearch = document.getElementById("team-search");
  teamPresetSearch = document.getElementById("team-preset-search");
  teamRecommendSearch = document.getElementById("team-recommend-search");

  btnTeam.addEventListener("click", openTeamModal);
  document.getElementById("team-btn-close").addEventListener("click", closeTeamModal);
  teamModal.addEventListener("click", (e) => { if (e.target === teamModal) closeTeamModal(); });

  // Export PNG modal & action handlers
  const btnTeamExport = document.getElementById("btn-team-export");
  const teamExportModal = document.getElementById("team-export-modal");
  const teamExportBtnClose = document.getElementById("team-export-btn-close");
  const teamExportBtnCancel = document.getElementById("team-export-btn-cancel");
  const btnExportTeams = document.getElementById("btn-team-export-teams");
  const btnExportWithUnused = document.getElementById("btn-team-export-with-unused");

  function openTeamExportModal() {
    if (teamExportModal) teamExportModal.style.display = "flex";
  }

  function closeTeamExportModal() {
    if (teamExportModal) teamExportModal.style.display = "none";
  }

  if (btnTeamExport) {
    btnTeamExport.addEventListener("click", openTeamExportModal);
  }
  if (teamExportBtnClose) teamExportBtnClose.addEventListener("click", closeTeamExportModal);
  if (teamExportBtnCancel) teamExportBtnCancel.addEventListener("click", closeTeamExportModal);
  if (teamExportModal) {
    teamExportModal.addEventListener("click", (e) => {
      if (e.target === teamExportModal) closeTeamExportModal();
    });
  }

  async function handleTeamExport(withUnused) {
    closeTeamExportModal();
    if (!btnTeamExport) return;
    btnTeamExport.disabled = true;
    setButtonLabel(btnTeamExport, t("action.rendering"), "action.rendering");
    try {
      if (!(await exportTeamsPng(withUnused))) alert(t("team.nothingToExport"));
    } catch (err) {
      console.error("Team export failed:", err);
      alert(t("team.exportFailed"));
    } finally {
      btnTeamExport.disabled = false;
      setButtonLabel(btnTeamExport, t("team.exportPng"), "team.exportPng");
    }
  }

  if (btnExportTeams) {
    btnExportTeams.addEventListener("click", () => handleTeamExport(false));
  }
  if (btnExportWithUnused) {
    btnExportWithUnused.addEventListener("click", () => handleTeamExport(true));
  }

  // Hide Warning: suppresses every Used marker in the team surfaces
  const btnHideWarning = document.getElementById("btn-team-hide-warning");
  if (btnHideWarning) {
    btnHideWarning.addEventListener("click", () => {
      teamsHideWarning = !teamsHideWarning;
      saveTeams();
      teamModalDirty = true; // the board's Used badge must follow on close
      renderTeamModal();
    });
  }

  // Show Unowned: unlocks unowned characters/psychubes in the strip and both pickers
  const btnAllowUnowned = document.getElementById("btn-team-allow-unowned");
  if (btnAllowUnowned) {
    btnAllowUnowned.addEventListener("click", () => {
      teamsAllowUnowned = !teamsAllowUnowned;
      saveTeams();
      renderTeamModal();
    });
  }

  if (teamModalSearch) {
    teamModalSearch.addEventListener("input", renderTeamModal);
  }

  // Team Presets: search + Formable Only + Automatic/Manual mode
  const btnFormableOnly = document.getElementById("btn-preset-formable-only");
  if (btnFormableOnly) {
    btnFormableOnly.addEventListener("click", () => {
      teamsFormableOnly = !teamsFormableOnly;
      saveTeams();
      renderTeamPresets();
    });
  }
  const btnPresetMode = document.getElementById("btn-preset-mode");
  if (btnPresetMode) {
    btnPresetMode.addEventListener("click", () => {
      teamsManualPick = !teamsManualPick;
      presetManualChoices.clear();
      saveTeams();
      renderTeamPresets();
    });
  }
  if (teamPresetSearch) {
    teamPresetSearch.addEventListener("input", renderTeamPresets);
  }

  // Teams per row: each option is only offered when the viewport can host it
  const columnsGroup = document.getElementById("team-columns-group");
  if (columnsGroup) {
    columnsGroup.querySelectorAll(".team-cols-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        teamColumns = Number(btn.dataset.cols);
        saveTeams();
        applyTeamColumns();
      });
    });
  }
  window.addEventListener("resize", () => {
    if (teamModal.style.display !== "none") applyTeamColumns();
  });

  setupTeamStripResizer();

  // Drag handle between the team list and the unused strip
  function setupTeamStripResizer() {
    const body = document.querySelector("#team-modal .team-body");
    const handle = document.getElementById("team-strip-resizer");
    if (!body || !handle) return;

    const applyRatio = () => {
      body.style.setProperty("--team-strip-ratio", String(teamStripRatio));
    };
    applyRatio();

    let dragging = false;
    const onMove = (clientY) => {
      const rect = body.getBoundingClientRect();
      if (rect.height <= 0) return;
      // Ratio measured from the BOTTOM, because the strip is pinned there
      const ratio = (rect.bottom - clientY) / rect.height;
      teamStripRatio = Math.min(0.75, Math.max(0.12, ratio));
      applyRatio();
    };

    const stop = () => {
      if (!dragging) return;
      dragging = false;
      handle.classList.remove("is-dragging");
      document.body.classList.remove("team-resizing");
      saveTeams();
    };

    handle.addEventListener("pointerdown", (e) => {
      dragging = true;
      handle.classList.add("is-dragging");
      document.body.classList.add("team-resizing");
      handle.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    handle.addEventListener("pointermove", (e) => {
      if (dragging) onMove(e.clientY);
    });
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);

    // Keyboard support: arrow keys nudge the split
    handle.addEventListener("keydown", (e) => {
      const step = 0.04;
      if (e.key === "ArrowUp") teamStripRatio = Math.min(0.75, teamStripRatio + step);
      else if (e.key === "ArrowDown") teamStripRatio = Math.max(0.12, teamStripRatio - step);
      else return;
      applyRatio();
      saveTeams();
      e.preventDefault();
    });
  }

  // Search / rarity filters
  function wireRarityGroup(groupId, filterSet, rerender) {
    document.querySelectorAll(`#${groupId} .filter-btn`).forEach((btn) => {
      btn.classList.toggle("active", filterSet.has(Number(btn.dataset.rarity)));
      btn.addEventListener("click", () => {
        const r = Number(btn.dataset.rarity);
        if (filterSet.has(r)) filterSet.delete(r);
        else filterSet.add(r);
        btn.classList.toggle("active", filterSet.has(r));
        rerender();
      });
    });
  }

  wireRarityGroup("team-filter-rarity-group", teamModalRarityFilters, renderTeamModal);
  wireRarityGroup("team-select-char-filter-group", teamSelectCharRarityFilters, renderTeamSelectCharacter);
  wireRarityGroup("team-select-chube-filter-group", teamSelectChubeRarityFilters, renderTeamSelectPsychube);

  // Presets
  const presetsModal = document.getElementById("team-presets-modal");
  document.getElementById("btn-team-presets").addEventListener("click", openTeamPresets);
  document.getElementById("team-presets-btn-close").addEventListener("click", closeTeamPresets);
  presetsModal.addEventListener("click", (e) => { if (e.target === presetsModal) closeTeamPresets(); });

  // Team Recommendation
  const recommendModal = document.getElementById("team-recommend-modal");
  document.getElementById("team-recommend-btn-close").addEventListener("click", closeTeamRecommend);
  recommendModal.addEventListener("click", (e) => { if (e.target === recommendModal) closeTeamRecommend(); });
  const btnRecFormable = document.getElementById("btn-recommend-formable-only");
  if (btnRecFormable) {
    btnRecFormable.addEventListener("click", () => {
      teamsFormableOnly = !teamsFormableOnly;
      saveTeams();
      renderTeamRecommend();
    });
  }
  const btnRecMode = document.getElementById("btn-recommend-mode");
  if (btnRecMode) {
    btnRecMode.addEventListener("click", () => {
      teamsManualPick = !teamsManualPick;
      presetManualChoices.clear();
      saveTeams();
      renderTeamRecommend();
    });
  }
  if (teamRecommendSearch) {
    teamRecommendSearch.addEventListener("input", renderTeamRecommend);
  }

  // Select Character
  const selCharModal = document.getElementById("team-select-char-modal");
  document.getElementById("team-select-char-btn-close").addEventListener("click", closeTeamSelectCharacter);
  selCharModal.addEventListener("click", (e) => { if (e.target === selCharModal) closeTeamSelectCharacter(); });
  const selCharSearch = document.getElementById("team-select-char-search");
  if (selCharSearch) selCharSearch.addEventListener("input", renderTeamSelectCharacter);

  // Select Psychube
  const selChubeModal = document.getElementById("team-select-chube-modal");
  document.getElementById("team-select-chube-btn-close").addEventListener("click", closeTeamSelectPsychube);
  selChubeModal.addEventListener("click", (e) => { if (e.target === selChubeModal) closeTeamSelectPsychube(); });
  const selChubeSearch = document.getElementById("team-select-chube-search");
  if (selChubeSearch) selChubeSearch.addEventListener("input", renderTeamSelectPsychube);
}

/* ---------------- Statistics Modal ---------------- */

/** Builds the statistic rows for the Statistics modal. */
function buildStatsModel() {
  const names = Object.keys(characterDb).filter((n) => futureSightEnabled || !futureSightChars.has(n));

  let ownedChars = 0, totalChars = 0;
  const euphoriaByRarity = {}; // rarity -> { hit, total } (owned euphoria tiers)
  const r10ByRarity = {};      // rarity -> { hit, total }
  const patternByRarity = {};  // rarity -> { hit, total }
  let overInvested = 0;
  // Characters at the level cap (60) — a character capped lower (e.g. I2 Lv.50)
  // never qualifies, so this is a plain level === max check.
  let maxLevelChars = 0;

  names.forEach((name) => {
    const rarity = getCharacterRarity(name);
    const char = userRoster[name] || {};
    totalChars++;
    if (char.owned) ownedChars++;
    if (rarity >= 2 && rarity <= 6) {
      r10ByRarity[rarity] = r10ByRarity[rarity] || { hit: 0, total: 0 };
      r10ByRarity[rarity].total++;
      if (char.owned && Number(char.resonance) >= 10) r10ByRarity[rarity].hit++;

      patternByRarity[rarity] = patternByRarity[rarity] || { hit: 0, total: 0 };
      patternByRarity[rarity].total++;
      if (char.owned && getMainPattern(name, char) !== DEFAULT_PATTERN) patternByRarity[rarity].hit++;
    }
    if (char.owned && Number(char.resonance) >= 11) overInvested++;
    if (char.owned && Number(char.level) >= PSYCHUBE_MAX_LEVEL) maxLevelChars++;

    // Euphoria is counted per TIER (a character with E1+E2 contributes 2),
    // matching how the game lists them. Future-Sight tiers only count when on.
    const levels = getEligibleEuphoriaLevels(name);
    if (levels.length > 0 && rarity >= 2 && rarity <= 6) {
      euphoriaByRarity[rarity] = euphoriaByRarity[rarity] || { hit: 0, total: 0 };
      levels.forEach((tier) => {
        euphoriaByRarity[rarity].total++;
        if (!char.owned) return;
        if (tier === 1 && char.e1) euphoriaByRarity[rarity].hit++;
        if (tier === 2 && char.e2) euphoriaByRarity[rarity].hit++;
      });
    }
  });

  // Psychubes (special count-only chubes are excluded from all ratios)
  const chubeTotalByRarity = { 6: 0, 5: 0 };
  const chubeOwnedByRarity = { 6: 0, 5: 0 };
  const chubeLv60 = { 6: { hit: 0, total: 0 }, 5: { hit: 0, total: 0 } };
  const chubeAmpMax = { 6: { hit: 0, total: 0 }, 5: { hit: 0, total: 0 } };
  let chubeCount6 = 0, chubeCount5 = 0;

  psychubeOrder.forEach((key) => {
    // Future Sight chubes only count when the toggle is on
    if (!futureSightEnabled && futureSightPsychubes.has(key)) return;
    if (isSpecialPsychube(key)) {
      // Special chubes contribute their count, not an owned/total ratio
      const c = psychubeDb[key];
      const n = Number((userPsychubes[key] || {}).count) || 0;
      if (c.rarity === 6) chubeCount6 += n; else chubeCount5 += n;
      return;
    }
    const c = psychubeDb[key];
    const st = userPsychubes[key] || {};
    chubeTotalByRarity[c.rarity]++;
    chubeLv60[c.rarity].total++;
    chubeAmpMax[c.rarity].total++;
    if (st.owned) {
      chubeOwnedByRarity[c.rarity]++;
      if (Number(st.level) >= PSYCHUBE_MAX_LEVEL) chubeLv60[c.rarity].hit++;
      if (Number(st.amplification) >= PSYCHUBE_MAX_AMP) chubeAmpMax[c.rarity].hit++;
    }
  });

  const chubeOwned = chubeOwnedByRarity[6] + chubeOwnedByRarity[5];
  const chubeTotal = chubeTotalByRarity[6] + chubeTotalByRarity[5];

  return {
    characters: { hit: ownedChars, total: totalChars },
    overInvested,
    maxLevelChars,
    euphoriaByRarity, r10ByRarity, patternByRarity,
    chubeOwned: { hit: chubeOwned, total: chubeTotal },
    chubeOwnedByRarity, chubeTotalByRarity,
    chubeCount: { 6: chubeCount6, 5: chubeCount5 },
    chubeLv60, chubeAmpMax,
  };
}

function statsBarHtml(label, hit, total, sub) {
  const pct = total > 0 ? Math.round((hit / total) * 100) : 0;
  return `
    <div class="stat-row${sub ? " stat-row-sub" : ""}">
      <div class="stat-row-head">
        <span class="stat-row-label">${label}</span>
        <span class="stat-row-value">${hit}/${total} · ${pct}%</span>
      </div>
      <div class="stat-bar"><span class="stat-bar-fill" style="width: ${pct}%;"></span></div>
    </div>
  `;
}

function statsValueRowHtml(label, value) {
  return `
    <div class="stat-row">
      <div class="stat-row-head">
        <span class="stat-row-label">${label}</span>
        <span class="stat-row-value">${value}</span>
      </div>
    </div>
  `;
}

/** Rarity block (✦6…✦2 or a custom list) with a shared colour per rarity. */
function statsRarityBlockHtml(title, byRarity, colorMap, opts) {
  const o = opts || {};
  const rarities = o.rarities || [6, 5, 4, 3, 2];
  const rows = rarities.map((r) => {
    const e = byRarity[r];
    if (!e || e.total === 0) return "";
    const color = (colorMap && colorMap[r]) || "var(--accent-gold)";
    if (o.bar === false) return statsValueRowHtml(`✦${r}`, `${e.hit}`);
    const pct = Math.round((e.hit / e.total) * 100);
    return `
      <div class="stat-row stat-row-sub">
        <div class="stat-row-head">
          <span class="stat-row-label">✦${r}</span>
          <span class="stat-row-value">${e.hit}/${e.total} · ${pct}%</span>
        </div>
        <div class="stat-bar"><span class="stat-bar-fill" style="width: ${pct}%; background: ${color};"></span></div>
      </div>
    `;
  }).join("");
  return `<div class="stat-block"><div class="stat-block-title">${title}</div>${rows}</div>`;
}

/** Gluttony / Greed icons with their quantity, centred above Total Chube Count. */
function statsSpecialChubesHtml() {
  const rows = psychubeOrder
    .filter((key) => isSpecialPsychube(key))
    .sort((a, b) => psychubeDb[b].rarity - psychubeDb[a].rarity)
    .map((key) => {
      const c = psychubeDb[key];
      const n = Number((userPsychubes[key] || {}).count) || 0;
      return `
        <div class="stats-special-chube">
          <img src="${escapeHtml(c.iconUrl)}" alt="${escapeHtml(c.name)}" class="stats-special-chube-img" />
          <span class="stats-special-chube-count">x${n}</span>
        </div>
      `;
    }).join("");
  if (!rows) return "";
  return `<div class="stats-special-chubes">${rows}</div>`;
}

/** Renders the five chess pieces as a centred, fixed-scale progress row. */
function statsChessHtml() {
  const pieces = [
    { rarity: 2, empty: "images/chess_pieces/crook_empty.png", filled: "images/chess_pieces/crook_filled.png", w: 41, h: 92 },
    { rarity: 3, empty: "images/chess_pieces/knight_empty.png", filled: "images/chess_pieces/knight_filled.png", w: 48, h: 95 },
    { rarity: 4, empty: "images/chess_pieces/bishop_empty.png", filled: "images/chess_pieces/bishop_filled.png", w: 41, h: 99 },
    { rarity: 5, empty: "images/chess_pieces/king_empty.png", filled: "images/chess_pieces/king_filled.png", w: 42, h: 109 },
    { rarity: 6, empty: "images/chess_pieces/queen_empty.png", filled: "images/chess_pieces/queen_filled.png", w: 43, h: 105 },
  ];
  const total = { 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  const owned = { 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  Object.keys(characterDb).forEach((name) => {
    if (!futureSightEnabled && futureSightChars.has(name)) return;
    const r = getCharacterRarity(name);
    if (r < 2 || r > 6) return;
    total[r]++;
    if ((userRoster[name] || {}).owned) owned[r]++;
  });

  const size = 22;
  const cells = pieces.map((p) => {
    const pct = total[p.rarity] > 0 ? (owned[p.rarity] / total[p.rarity]) * 100 : 0;
    const insetTop = Math.max(0, Math.min(100, 100 - pct));
    const w = Math.round(size * p.w / 41);
    const h = Math.round(size * p.h / 41);
    return `
      <div class="stats-chess-piece" style="width: ${w}px; height: ${h}px;"
           data-chess-rarity="${p.rarity}"
           data-chess-owned="${owned[p.rarity]}"
           data-chess-total="${total[p.rarity]}">
        <img src="${p.empty}" alt="" class="stats-chess-empty" />
        <div class="stats-chess-mask" style="top: ${insetTop}%;">
          <img src="${p.filled}" alt="" style="height: ${h}px;" />
        </div>
      </div>
    `;
  }).join("");

  return `<div class="stats-chess-row">${cells}</div>`;
}

/** Tooltip for the Statistics chess pieces — reuses the pattern-tooltip surface. */
function setupStatsChessTooltip() {
  const tip = document.getElementById("pattern-tooltip");
  const row = document.querySelector("#stats-modal-body .stats-chess-row");
  if (!tip) return;

  let hovered = null;

  const show = (el, x, y) => {
    const owned = el.dataset.chessOwned;
    const total = el.dataset.chessTotal;
    const rarity = el.dataset.chessRarity;
    const pct = total > 0 ? Math.round((owned / total) * 100) : 0;
    tip.innerHTML = `<strong>✦${rarity}</strong> · ${owned}/${total} (${pct}%)`;
    tip.classList.add("is-visible");
    tip.setAttribute("aria-hidden", "false");
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let left = x + 14;
    if (left + tw > window.innerWidth - 6) left = x - tw - 14;
    let top = y - th - 12;
    if (top < 6) top = y + 18;
    tip.style.left = `${Math.max(6, left)}px`;
    tip.style.top = `${Math.max(6, top)}px`;
  };

  const hide = () => {
    hovered = null;
    tip.classList.remove("is-visible");
    tip.setAttribute("aria-hidden", "true");
  };

  // Delegated so it keeps working after the modal body is re-rendered
  document.addEventListener("mouseover", (e) => {
    const el = e.target.closest && e.target.closest("#stats-modal-body .stats-chess-piece");
    if (el && el !== hovered) {
      hovered = el;
      show(el, e.clientX, e.clientY);
    }
  });
  document.addEventListener("mousemove", (e) => {
    if (hovered) show(hovered, e.clientX, e.clientY);
  });
  document.addEventListener("mouseout", (e) => {
    if (e.target.closest && e.target.closest("#stats-modal-body .stats-chess-piece")) hide();
  });
  document.addEventListener("scroll", hide, true);
}

function renderStatsModal() {
  const body = document.getElementById("stats-modal-body");
  if (!body) return;
  const m = buildStatsModel();
  const app = displayOptions.appearance || DEFAULT_THEME_APPEARANCE;
  const rarityColors = {
    6: app.portraitColorR6 || "#DD9925",
    5: app.portraitColorR5 || "#C7AF6C",
    4: app.portraitColorR4 || "#6A4972",
    3: app.portraitColorR3 || "#545C7D",
    2: app.portraitColorR2 || "#496441",
  };

  body.innerHTML = `
    <div class="stat-section">
      <div class="stat-el">${t("stats.characters")}</div>
      ${statsBarHtml(t("stats.ownedAmount"), m.characters.hit, m.characters.total)}
      ${statsChessHtml()}
      <div class="stat-note">${t("stats.includesCollab")}</div>
    </div>
    <div class="stat-sep"></div>
    <div class="stat-section">
      ${statsValueRowHtml(t("stats.maxLevel"), m.maxLevelChars)}
    </div>
    <div class="stat-sep"></div>
    <div class="stat-section">
      ${statsRarityBlockHtml(t("stats.euphorias"), m.euphoriaByRarity, rarityColors, { rarities: [6, 5] })}
    </div>
    <div class="stat-sep"></div>
    <div class="stat-section">
      ${statsRarityBlockHtml(t("stats.totalR10"), m.r10ByRarity, rarityColors)}
    </div>
    <div class="stat-sep"></div>
    <div class="stat-section">
      ${statsValueRowHtml(t("stats.overInvestment"), m.overInvested)}
    </div>
    <div class="stat-sep"></div>
    <div class="stat-section">
      ${statsRarityBlockHtml(t("stats.patternUnlocked"), m.patternByRarity, rarityColors)}
    </div>
    <div class="stat-sep"></div>
    <div class="stat-section">
      <div class="stat-el">${t("stats.psychubes")}</div>
      ${statsBarHtml(t("stats.ownedPsychube"), m.chubeOwned.hit, m.chubeOwned.total)}
      ${statsSpecialChubesHtml()}
      ${statsRarityBlockHtml(t("stats.chubeCount"), {
        6: { hit: m.chubeOwnedByRarity[6], total: m.chubeTotalByRarity[6] },
        5: { hit: m.chubeOwnedByRarity[5], total: m.chubeTotalByRarity[5] },
      }, rarityColors, { rarities: [6, 5] })}
    </div>
    <div class="stat-sep"></div>
    <div class="stat-section">
      ${statsRarityBlockHtml(t("stats.chubeLv60"), m.chubeLv60, rarityColors, { rarities: [6, 5] })}
    </div>
    <div class="stat-sep"></div>
    <div class="stat-section">
      ${statsRarityBlockHtml(t("stats.chubeAmp"), m.chubeAmpMax, rarityColors, { rarities: [6, 5] })}
    </div>
  `;

  // Stagger the sections so the modal fills in top-down as it opens.
  body.querySelectorAll(".stat-section").forEach((section, index) => {
    section.style.setProperty("--stat-index", String(index));
  });
}

function openStatsModal() {
  renderStatsModal();
  document.getElementById("stats-modal").style.display = "flex";
}

function closeStatsModal() {
  document.getElementById("stats-modal").style.display = "none";
}

// Confirm Action Modal Helper
let onConfirmActionCallback = null;
function showConfirmModal(title, message, onConfirm) {
  const confirmModal = document.getElementById("confirm-modal");
  const confirmTitle = document.getElementById("confirm-modal-title");
  const confirmMessage = document.getElementById("confirm-modal-message");
  if (!confirmModal) {
    if (confirm(message)) onConfirm();
    return;
  }
  if (confirmTitle) confirmTitle.textContent = title || "Confirm Action";
  if (confirmMessage) confirmMessage.textContent = message || "Are you sure you want to proceed?";
  onConfirmActionCallback = onConfirm;
  confirmModal.style.display = "flex";
}

function closeConfirmModal() {
  const confirmModal = document.getElementById("confirm-modal");
  if (confirmModal) confirmModal.style.display = "none";
  onConfirmActionCallback = null;
}

/** Custom tooltip for pattern icons (native title bubbles cannot be styled). */
function setupPatternTooltip() {
  const tip = document.getElementById("pattern-tooltip");
  if (!tip) return;

  const show = (target) => {
    const text = target.getAttribute("data-pattern-name");
    if (!text) return;
    tip.textContent = text;
    tip.classList.add("is-visible");
    tip.setAttribute("aria-hidden", "false");

    const r = target.getBoundingClientRect();
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    let left = r.left + r.width / 2 - tw / 2;
    left = Math.max(6, Math.min(left, window.innerWidth - tw - 6));
    let top = r.top - th - 7;
    if (top < 6) top = r.bottom + 7; // flip below when there is no room above

    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  };

  const hide = () => {
    tip.classList.remove("is-visible");
    tip.setAttribute("aria-hidden", "true");
  };

  document.addEventListener("mouseover", (e) => {
    const el = e.target.closest("[data-pattern-name]");
    if (el) show(el);
  });
  document.addEventListener("mouseout", (e) => {
    if (e.target.closest("[data-pattern-name]")) hide();
  });
  document.addEventListener("scroll", hide, true);

  // Touch devices: a tap shows it briefly
  document.addEventListener("touchstart", (e) => {
    const el = e.target.closest("[data-pattern-name]");
    if (el) {
      show(el);
      setTimeout(hide, 1600);
    }
  }, { passive: true });
}

/** Tooltip that reports how many characters sit in a tier row. It follows the
 *  cursor, reusing the pattern tooltip's look. */
function setupTierCountTooltip() {
  const tip = document.getElementById("tier-count-tooltip");
  if (!tip) return;

  let currentLabel = null;

  const position = (x, y) => {
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    let left = x + 14;
    if (left + tw > window.innerWidth - 6) left = x - tw - 14;
    left = Math.max(6, left);
    let top = y + 18;
    if (top + th > window.innerHeight - 6) top = y - th - 14;
    top = Math.max(6, top);
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  };

  const show = (labelEl, x, y) => {
    const count = labelEl.dataset.tierCount;
    if (count === undefined) return;
    const unit = labelEl.dataset.tierUnit === "psychube" ? "label.tierCountPsychube" : "label.tierCount";
    tip.textContent = t(unit, { n: count });
    tip.classList.add("is-visible");
    tip.setAttribute("aria-hidden", "false");
    position(x, y);
  };

  const hide = () => {
    currentLabel = null;
    tip.classList.remove("is-visible");
    tip.setAttribute("aria-hidden", "true");
  };

  const isTierLabel = (node) => node && node.closest && node.closest(".tier-label[data-tier-count]");

  document.addEventListener("mouseover", (e) => {
    const el = isTierLabel(e.target);
    if (el && el !== currentLabel) {
      currentLabel = el;
      show(el, e.clientX, e.clientY);
    }
  });
  document.addEventListener("mousemove", (e) => {
    if (currentLabel) position(e.clientX, e.clientY);
  });
  document.addEventListener("mouseout", (e) => {
    // Ignore transitions between descendants of the same label
    if (!isTierLabel(e.target)) return;
    if (isTierLabel(e.relatedTarget) === currentLabel) return;
    hide();
  });
  document.addEventListener("scroll", hide, true);

  // Touch devices: a tap shows it briefly
  document.addEventListener("touchstart", (e) => {
    const el = e.target.closest(".tier-label[data-tier-count]");
    if (el) {
      currentLabel = el;
      const touch = e.touches[0];
      show(el, touch ? touch.clientX : 0, touch ? touch.clientY : 0);
      setTimeout(hide, 1600);
    }
  }, { passive: true });
}

/* ================= GUIDE DATA (Builds + Rotations) ================= */

// { name: { tags: [string], psychubes: [string], resonance: {label: code}, pattern, notes } }
let buildsData = {};
let rotationPresets = [];    // Bundled, read-only rotations shipped with the site
let rotationList = [];       // The user's list: [{ uid, presetId }]
let guideSkills = {};        // { name: [{ skill, icon }] }
let guideProgressions = {};  // { name: [{ badge, val }] }
let specialCards = [];       // ["images/skills/760001.png", ...]

/** The user's rotation list. Presets are added to it, and removed from it. */
const ROTATION_LIST_STORAGE_KEY = "r1999_rotation_list_v1";
const ROTATION_SCALE_STORAGE_KEY = "r1999_rotation_scale_v1";

let rotationRoundsScale = 1.0;
// Watches the rounds body so the tag ribbons re-fit whenever the cards settle at
// a new width (scale slider, splitter drag, late font metrics).
let rotationTagFitObserver = null;
try {
  const savedRotScale = parseFloat(localStorage.getItem(ROTATION_SCALE_STORAGE_KEY));
  if (Number.isFinite(savedRotScale) && savedRotScale >= 0.4 && savedRotScale <= 1.5) {
    rotationRoundsScale = savedRotScale;
  }
} catch (e) {
  rotationRoundsScale = 1.0;
}

/** Team-archetype tags a build or a rotation can carry. */
const ROTATION_ARCHETYPES = [
  // Raid and Focused Flashback lead the list and never appear together.
  "Raid", "Focused Flashback",
  "Burn", "HP Sacrifice", "Poison", "Ritual", "Rank Up", "Extra Action", "Bloodtithe",
  "Dynamo", "Inspiration", "Lingering Glow", "Shift", "Conduit", "Pursuit",
];

/** Archetypes that exclude each other: a rotation carries at most one. */
const EXCLUSIVE_ARCHETYPES = ["Raid", "Focused Flashback"];

/** Each lead archetype's chip colour. */
const ARCHETYPE_COLORS = {
  Raid: "#F5E1C3",
  "Focused Flashback": "#A5B9E7",
};

/** Bar colour per rarity, taken from the game's rarity palette. */
const RARITY_COLORS = { 6: "#CB7820", 5: "#C8AF6C", 4: "#9E6BAD", 3: "#555E7F", 2: "#496441" };

const GUIDE_AFFLATUS = [
  { key: "Beast", icon: "images/tag_afflatus/Beast_Icon.webp" },
  { key: "Plant", icon: "images/tag_afflatus/Plant_Icon.webp" },
  { key: "Star", icon: "images/tag_afflatus/star_icon.webp" },
  { key: "Mineral", icon: "images/tag_afflatus/mineral_Icon.webp" },
  { key: "Spirit", icon: "images/tag_afflatus/Spirit_Icon.webp" },
  { key: "Intellect", icon: "images/tag_afflatus/intellect_icon.webp" },
];

const GUIDE_AFFLATUS_ICONS = Object.fromEntries(GUIDE_AFFLATUS.map((a) => [a.key, a.icon]));

function guideAfflatusKey(afflatus) {
  if (!afflatus) return "";
  return afflatus === "Mineral_Star" ? "Mineral" : afflatus;
}

function guideAfflatusIcon(afflatus) {
  return GUIDE_AFFLATUS_ICONS[guideAfflatusKey(afflatus)] || "";
}

function rarityColor(rarity) {
  return RARITY_COLORS[Number(rarity)] || "#B5B5B3";
}

function buildGuideData(data) {
  const clean = data || {};
  buildsData = clean.builds && typeof clean.builds === "object" && !Array.isArray(clean.builds) ? clean.builds : {};
  rotationPresets = Array.isArray(clean.rotations) ? clean.rotations.filter((r) => r && (r.id || r.name)) : [];
  guideSkills = clean.skills && typeof clean.skills === "object" ? clean.skills : {};
  guideProgressions = clean.progressions && typeof clean.progressions === "object" ? clean.progressions : {};
  specialCards = Array.isArray(clean.cards && clean.cards.special) ? clean.cards.special : [];
}

/* ---- Rotation list: presets are copied in, never edited in place ---- */

function loadRotationList() {
  try {
    const raw = localStorage.getItem(ROTATION_LIST_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    rotationList = Array.isArray(parsed)
      ? parsed.filter((entry) => entry && typeof entry.uid === "string" && typeof entry.presetId === "string")
      : [];
  } catch (e) {
    rotationList = [];
  }
}

function saveRotationList() {
  try {
    localStorage.setItem(ROTATION_LIST_STORAGE_KEY, JSON.stringify(rotationList));
  } catch (e) {
    // A full quota should not break the modal; the list just is not persisted.
  }
}

function rotationPresetById(presetId) {
  return rotationPresets.find((preset) => preset.id === presetId) || null;
}

/** A list entry resolved against its preset. Presets are read-only. */
function rotationEntry(uid) {
  const entry = rotationList.find((item) => item.uid === uid);
  if (!entry) return null;
  const preset = rotationPresetById(entry.presetId);
  if (!preset) return null;
  return { ...preset, uid: entry.uid, presetId: preset.id, isPreset: true };
}

function rotationEntries() {
  return rotationList.map((entry) => rotationEntry(entry.uid)).filter(Boolean);
}

function rotationPresetAdded(presetId) {
  return rotationList.some((entry) => entry.presetId === presetId);
}

/** Copies a preset into the user's list and returns the new entry's uid. */
function addRotationPreset(presetId) {
  const preset = rotationPresetById(presetId);
  if (!preset || rotationPresetAdded(presetId)) return null;
  const uid = `preset-${preset.id}-${Date.now().toString(36)}`;
  rotationList.push({ uid, presetId: preset.id });
  saveRotationList();
  return uid;
}

function removeRotationEntry(uid) {
  const before = rotationList.length;
  rotationList = rotationList.filter((entry) => entry.uid !== uid);
  if (rotationList.length === before) return false;
  saveRotationList();
  return true;
}

/* ---------------- InfoBook Data Stores ---------------- */
let itemsData = [];
let codeRewardIndex = {};
let itemFormulasData = {};
let charactersMatsData = {};
let characterProfilesData = {};
let patternCostsData = {};
let characterSkillsData = {};
let characterEuphoriasData = {};
let skillGlossaryData = {};
let psychubesDetailedData = {};
let infoBookActiveTab = "characters"; // "characters" | "psychubes" | "items" | "glossary" | "codes"
let selectedItemId = null;
let selectedPsychubeKey = null;
let selectedGlossaryKey = null;
let psychubeDetailLevel = 60;
let psychubeDetailAmp = 1;
let itemSearchQuery = "";
let itemCategoryFilter = "all";

function buildInfoBookData({ items, formulas, matsRequired, profiles, patternCosts, skillsData, euphoriasData, glossaryData, psychubesDetail, codeRewards }) {
  if (Array.isArray(items)) itemsData = items;
  if (codeRewards && typeof codeRewards === "object") codeRewardIndex = codeRewards;
  if (formulas && typeof formulas === "object") itemFormulasData = formulas;
  if (matsRequired && typeof matsRequired === "object") charactersMatsData = matsRequired;
  if (profiles && typeof profiles === "object") characterProfilesData = profiles;
  if (patternCosts && typeof patternCosts === "object") patternCostsData = patternCosts;
  if (skillsData && typeof skillsData === "object") characterSkillsData = skillsData;
  if (euphoriasData && typeof euphoriasData === "object") {
    characterEuphoriasData = euphoriasData;
    buildEuphoriaMap(euphoriasData);
  }
  if (glossaryData && typeof glossaryData === "object") skillGlossaryData = glossaryData;
  if (psychubesDetail && typeof psychubesDetail === "object") psychubesDetailedData = psychubesDetail;
}

function getItemByName(name) {
  if (!name) return null;
  const n = String(name).trim().toLowerCase();
  const item = itemsData.find((it) => String(it.name || "").toLowerCase() === n);
  if (item) return item;
  // Promo-code rewards can name things that have no `data/items.json` row
  // (stamina candy, EXP-fodder psychubes); see `data/code_reward_index.json`.
  const extra = codeRewardIndex[n];
  if (!extra) return null;
  return {
    id: extra.id,
    name: extra.name,
    icon: extra.icon,
    // Same rarity frame the Items tab draws (`rare + 1`, so 2..6).
    border: extra.rarity ? `images/items/border/${extra.rarity}.webp` : "",
  };
}

function formatMaterialQuantity(quantity) {
  const q = Number(quantity) || 0;
  if (q >= 1000000) return `${(q / 1000000).toFixed(1)}m`;
  if (q >= 10000) return `${(q / 1000).toFixed(0)}k`;
  return String(q);
}

function renderItemStickerHtml(itemOrName, qty = null, extraClass = "") {
  const item = typeof itemOrName === "object" && itemOrName !== null ? itemOrName : getItemByName(itemOrName);
  if (!item) {
    const fallbackTitle = typeof itemOrName === "string" ? escapeHtml(itemOrName) : "";
    const qtyHtml = qty !== null && qty !== undefined ? `<span class="item-sticker-qty">${formatMaterialQuantity(qty)}</span>` : "";
    return `<div class="item-sticker ${extraClass}" title="${fallbackTitle}"><div style="padding:4px;font-size:9px;color:#8f8a83;text-align:center;word-break:break-all;">${fallbackTitle}</div>${qtyHtml}</div>`;
  }
  const qtyHtml = qty !== null && qty !== undefined ? `<span class="item-sticker-qty">${formatMaterialQuantity(qty)}</span>` : "";
  const title = escapeHtml(item.name || "");
  const iconSrc = item.icon || "";
  const borderSrc = item.border || "";
  return `
    <div class="item-sticker ${extraClass}" data-item-id="${item.id}" data-item-name="${escapeHtml(item.name)}" title="${title}">
      ${borderSrc ? `<img src="${escapeHtml(borderSrc)}" alt="" class="item-sticker-border" loading="lazy" />` : ""}
      ${iconSrc ? `<img src="${escapeHtml(iconSrc)}" alt="${title}" class="item-sticker-img" loading="lazy" />` : ""}
      ${qtyHtml}
    </div>
  `;
}

/** Material ordering: currency first, then the two ritual materials, then the rest. */
const ITEM_CATEGORY_PRIORITY = {
  Currency: 0,
  "Resonate Materials": 1,
  "Insight Materials": 2,
  "Portrait Materials": 2,
  "General Materials": 2,
  "Psychube Material": 2,
};

function sortMaterialsByCategory(array) {
  return array.slice().sort((matA, matB) => {
    const itemA = getItemByName(matA.material);
    const itemB = getItemByName(matB.material);

    if (itemA && itemB) {
      const catA = ITEM_CATEGORY_PRIORITY[itemA.category] !== undefined ? ITEM_CATEGORY_PRIORITY[itemA.category] : 99;
      const catB = ITEM_CATEGORY_PRIORITY[itemB.category] !== undefined ? ITEM_CATEGORY_PRIORITY[itemB.category] : 99;
      if (catA !== catB) return catA - catB;
      if (itemB.rarity !== itemA.rarity) return (itemB.rarity || 0) - (itemA.rarity || 0);
      return (itemA.id || 0) - (itemB.id || 0);
    }
    if (itemA) return -1;
    if (itemB) return 1;
    return String(matA.material).localeCompare(String(matB.material));
  });
}

function getCharacterMats(name) {
  const canonical = resolveCharacterName(name);
  return charactersMatsData[canonical] || charactersMatsData[name] || null;
}


function getCharacterStatsAt(name, insight, level) {
  const mats = getCharacterMats(name);
  if (!mats || !mats.stats) return null;
  const s = mats.stats;
  const rarity = Number(mats.rarity || getCharacterRarity(name) || 5);
  const maxInsight = getMaxInsightForRarity(rarity);
  const ins = Math.min(maxInsight, Math.max(0, insight));
  const maxLvl = getMaxLevelForInsight(ins);
  const lvl = Math.min(maxLvl, Math.max(1, level));

  const milestoneKeys = [
    { start: "0-1", end: "0-30", max: 30 },
    { start: "0-30", end: "1-40", max: 40 },
    { start: "1-40", end: "2-50", max: 50 },
    { start: "2-50", end: "3-60", max: 60 }
  ];
  const m = milestoneKeys[ins] || milestoneKeys[0];
  const startStats = s[m.start] || s["0-1"];
  const endStats = s[m.end] || startStats;
  if (!startStats) return null;

  const frac = m.max > 1 ? (lvl - 1) / (m.max - 1) : 0;
  const result = [];
  for (let i = 0; i < 7; i++) {
    const v1 = startStats[i] || 0;
    const v2 = endStats[i] !== undefined ? endStats[i] : v1;
    const val = v1 + (v2 - v1) * frac;
    result.push(i >= 5 ? val.toFixed(1) + "%" : Math.round(val));
  }
  return {
    atk: result[0],
    hp: result[1],
    def: result[2],
    mdef: result[3],
    technic: result[4],
    critRate: result[5],
    critDmg: result[6]
  };
}

let charSelectedSkinId = null;

/* State for character skills tabs (Skills / Weapons / Insights / Portrays / Euphoria) */
let charSkillsActiveTab = "skills"; // "skills" | "weapons" | "insights" | "portrays" | "euphoria"
let charSkillSelectedIdx = 0; // Index of selected skill card
let charSkillSelectedRank = 3; // Selected rank for active skill (1, 2, or 3)
// Rank picked inside each cast option of an Adaptive card (Brume / Nautika), keyed by
// the option's ★1 skill id — each option has its own ★1/★2/★3 picker.
let charSkillAdaptiveRanks = {};
let charSkillsActiveStance = null; // Active stance for multi-form characters (e.g. "Base", "Bendith", "Set A")
let charSkillsEuphoriaRank = 0; // 0 = hide Euphoria-gated cards; N = show cards unlocked up to EN
let charSkillsEuphoriaChar = null; // Character the Euphoria switch belongs to
// Reinforce switch (Lucy): 0 = base card, 1 = its reinforced text (初始 / 升华).
let charSkillsReinforceLevel = 0;
let charSkillsReinforceChar = null; // Character the Reinforce switch belongs to
let charWeaponsSelectedIdx = 0; // Index of selected weapon for Collab chars (Ezio / Kassandra)
let charEzioPrimary = "venetian-falchion"; // "venetian-falchion" | "condottiero-war-hammer" | "captain-s-sword"
let charEzioSecondary = "channeled-cinquedea"; // "channeled-cinquedea" | "butcher-knife" | "sultan-s-knife"
let charKassandraSelections = {
  hunter: null,
  warrior: null,
  assassin: null
};
let charKassandraActiveTooltip = null; // Node to show detail info for

function getCharacterSkillsInfo(name) {
  const canonical = resolveCharacterName(name);
  return characterSkillsData[canonical] || characterSkillsData[name] || null;
}

function getCharacterStances(skills) {
  if (!Array.isArray(skills)) return [];
  const incantations = skills.filter((s) => s.type === "Incantation" && (s.nameEn || s.nameZh));

  const slotGroups = new Map();
  incantations.forEach((s) => {
    if (!slotGroups.has(s.slot)) slotGroups.set(s.slot, []);
    slotGroups.get(s.slot).push(s);
  });

  const namedSubSlots = [];
  let hasEmptySubSlot = false;

  for (const [, skList] of slotGroups.entries()) {
    if (skList.length > 1) {
      skList.forEach((s) => {
        const sub = (s.subSlot || "").trim();
        if (sub && !namedSubSlots.includes(sub)) namedSubSlots.push(sub);
        else if (!sub) hasEmptySubSlot = true;
      });
    }
  }

  if (namedSubSlots.length === 0) return [];

  const stances = [];
  if (hasEmptySubSlot) stances.push("Base");
  namedSubSlots.forEach((sub) => stances.push(sub));
  return stances;
}

function getSkillsForStance(skills, activeStance) {
  if (!activeStance) return skills;

  return skills.filter((s) => {
    if (s.type === "Ultimate") return true;
    if (!s.nameEn && !s.nameZh) return false;

    const sub = (s.subSlot || "").trim();
    const effectiveSub = sub === "" ? "Base" : sub;

    if (s.type === "Special") {
      if (effectiveSub === activeStance) return true;
      const isStanceTag = ["Base", "Bendith", "Set A", "Set B", "Set C", "Set D"].includes(effectiveSub);
      if (!isStanceTag) return true;
      return false;
    }

    if (effectiveSub === activeStance) return true;

    // Check if another skill with matching slot has activeStance
    const slotHasActiveStanceSkill = skills.some((other) => {
      if (other === s || other.type !== "Incantation") return false;
      if (other.slot !== s.slot) return false;
      const otherSub = (other.subSlot || "").trim();
      const otherEff = otherSub === "" ? "Base" : otherSub;
      return otherEff === activeStance;
    });

    if (!slotHasActiveStanceSkill && sub === "") return true;

    return false;
  });
}

// The Adaptive card's own line names the rank it casts at ("Choose 1 out of rank 1 [A]
// and [B]"), but each option panel has its own ★ picker, so that token is dropped.
function stripSkillRankMention(text) {
  return String(text || "")
    .replace(/\brank\s*\d+\s*/gi, "")
    .replace(/\s*hạng\s*\d+\s*/gi, " ")
    .replace(/\s*\d+\s*阶\s*/g, "")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function getSkillBadgeText(sk, isCn = false, rank = 1) {
  if (sk.type === "Ultimate") {
    return isCn ? "至终" : "Ultimate";
  }
  return getCardTypeLabel(sk, isCn, rank);
}

/**
 * The card-type word itself (Attack / Buff / Debuff / …), without the strip's
 * "Ultimate" badge. The game's own `skill_effect.showTag` wins when the generated row
 * carries it (`attribute`), then the text heuristic. Empty for an ultimate the
 * heuristic cannot read, so the detail board prints `Ultimate` alone instead of `S3`.
 */
function getCardTypeLabel(sk, isCn = false, rank = 1) {

  // Explicit attribute override if specified. A single rank can be relabelled on its
  // own (Click's S1 is Attack at ★1 but Debuff at ★2), and then that rank wins.
  const rankObj = sk.ranks ? (sk.ranks[rank] || sk.ranks["1"] || Object.values(sk.ranks)[0] || {}) : sk;
  const attribute = (rankObj && rankObj.attribute) || sk.attribute;
  if (attribute) {
    const attributeZh = (rankObj && rankObj.attributeZh) || sk.attributeZh;
    return isCn && attributeZh ? attributeZh : attribute;
  }

  const nameEn = (sk.nameEn || "").toLowerCase();
  const nameZh = sk.nameZh || "";

  // Specific name-based attribute recognition
  if (
    nameEn.includes("energy") ||
    nameEn.includes("conversion") ||
    nameEn.includes("pulse") ||
    nameEn.includes("flame undying") ||
    nameZh.includes("复燃再燃") ||
    nameZh.includes("交感")
  ) {
    return isCn ? "交感" : "Energy";
  }
  if (nameEn.includes("versatile") || nameEn.includes("omni card") || nameZh.includes("万能")) {
    return isCn ? "万能" : "Versatile";
  }

  // Inspect specific rank description
  const descEn = (rankObj.descEn || sk.descEn || "").toLowerCase();
  const descZh = rankObj.descZh || sk.descZh || "";

  if (descEn.includes("channel") || descZh.includes("吟诵")) {
    return isCn ? "吟诵" : "Channel";
  }
  if (descEn.includes("counter") || descEn.includes("riposte") || descZh.includes("反击") || descZh.includes("反制")) {
    return isCn ? "反制" : "Counter";
  }
  if (
    descEn.includes("healing") ||
    descEn.includes("heal") ||
    descEn.includes("recovers") ||
    descEn.includes("cure") ||
    descZh.includes("治疗") ||
    descZh.includes("回复")
  ) {
    if (!descEn.includes("deals") && !descEn.includes("attack") && !descZh.includes("攻击") && !descZh.includes("创伤")) {
      return isCn ? "治疗" : "Health";
    }
  }

  // Pure control / debuff (inflicts Daze, Disarm, Silence, Petrify, Freeze, Stun, Corrode, Poison, etc. without primary attack label or with explicit control)
  if (
    descEn.includes("1-target control") ||
    descEn.includes("mass control") ||
    descEn.includes("1-target debuff") ||
    descEn.includes("mass debuff") ||
    descZh.includes("单体控制") ||
    descZh.includes("群体控制") ||
    descZh.includes("单体削弱") ||
    descZh.includes("群体削弱")
  ) {
    return isCn ? "减益" : "Debuff";
  }

  if (
    descEn.includes("debuff") ||
    descZh.includes("减益") ||
    descZh.includes("削弱") ||
    (descEn.includes("inflicts") && !descEn.includes("deals") && !descEn.includes("attack") && !descZh.includes("攻击") && !descZh.includes("创伤"))
  ) {
    return isCn ? "减益" : "Debuff";
  }

  // Skills like An-an Lee S1 Rank 3: "Inflicts [Daze] for 1 round" or control states that classify as Debuff in game
  if (
    descEn.includes("inflicts [daze]") ||
    descEn.includes("inflicts [petrify]") ||
    descEn.includes("inflicts [freeze]") ||
    descEn.includes("inflicts [disarm]") ||
    descEn.includes("inflicts [silence]") ||
    descZh.includes("【眩晕】") ||
    descZh.includes("【石化】") ||
    descZh.includes("【冰冻】") ||
    descZh.includes("【缴械】") ||
    descZh.includes("【缄默】")
  ) {
    return isCn ? "减益" : "Debuff";
  }

  if (descEn.includes("buff") || descZh.includes("增强") || descZh.includes("增益")) {
    return isCn ? "增益" : "Buff";
  }
  if (descEn.includes("attack") || descEn.includes("deals") || descZh.includes("攻击") || descZh.includes("造成")) {
    return isCn ? "攻击" : "Attack";
  }
  if (descEn.includes("grants") || descEn.includes("gains") || descZh.includes("获得") || descZh.includes("赋予")) {
    return isCn ? "增益" : "Buff";
  }

  if (sk.type === "Special") {
    return isCn ? "特殊" : "Special";
  }

  // The ultimate itself names the type in the detail board, so a slot fallback would
  // only produce noise (`Ultimate · S3`).
  if (sk.type === "Ultimate") return "";

  return isCn ? `术${sk.slot}` : `S${sk.slot}`;
}


function pickLocalizedDesc(obj) {
  if (!obj) return "";
  if (currentLang === "vi" && (obj.descVi || obj.descVI)) return obj.descVi || obj.descVI;
  if (currentLang === "cn" && (obj.descZh || obj.descZH || obj.descCn)) return obj.descZh || obj.descZH || obj.descCn;
  return obj.descEn || obj.descEN || obj.descZh || obj.descVi || "";
}

/**
 * The flavour line under a card's text (`skill.desc_art` in the game tables, carried as
 * `artEn` / `artZh` / `artVi`). Vietnamese is an overlay like the description, so without
 * this the `vi` UI printed the English line.
 */
function pickLocalizedArt(obj) {
  if (!obj) return "";
  if (currentLang === "vi" && obj.artVi) return obj.artVi;
  if (currentLang === "cn") return obj.artZh || obj.artEn || obj.artVi || "";
  return obj.artEn || obj.artZh || obj.artVi || "";
}

/** A panel label carried by the data (`label: { en, zh, vi }`). */
function pickLocalizedLabel(label) {
  if (!label) return "";
  if (currentLang === "vi") return label.vi || label.en || label.zh || "";
  if (currentLang === "cn") return label.zh || label.en || "";
  return label.en || label.zh || "";
}

function formatSkillKeywords(text) {
  if (!text) return "";
  let s = String(text)
    .replace(/<id:[^>]+>/g, "")
    .replace(/<\/?nobr>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n");

  const tokens = [];
  const addToken = (html) => {
    const placeholder = `___SKILL_KW_TOKEN_${tokens.length}___`;
    tokens.push(html);
    return placeholder;
  };

  // 1. Extract bracketed terms: [keyword] and 【keyword】
  s = s.replace(/\[(.*?)\]/g, (match, p1) => {
    const cleanTerm = p1.replace(/<id:[^>]+>/g, "").trim();
    return addToken(`<span class="skill-kw-bracket" data-term="${escapeHtml(cleanTerm)}">[${escapeHtml(cleanTerm)}]</span>`);
  });
  s = s.replace(/【(.*?)】/g, (match, p1) => {
    const cleanTerm = p1.replace(/<id:[^>]+>/g, "").trim();
    return addToken(`<span class="skill-kw-bracket" data-term="${escapeHtml(cleanTerm)}">【${escapeHtml(cleanTerm)}】</span>`);
  });

  // 2. Escape HTML on surrounding text
  s = escapeHtml(s);

  // 3. Highlight numbers & percentages (e.g. 350%, 40%, -35%, 1-star, 0-10, 6;, standalone digits like "by 2, to 2 enemies", "x40%", etc.)
  // Excludes hyphenated target prefixes like 1-target, 2-target, etc., and excludes HTML entity numbers like &#039;
  s = s.replace(/(?:(?<=[x×*+\-–—±/])|\b)(\d+(?:\.\d+)?%|\d+(?:\.\d+)?\b)(?!-target\b)/gi, (match, p1, offset, str) => {
    // Safety check: verify not inside an HTML entity like &#039;, &amp;, &quot;, etc.
    const before = str.slice(0, offset);
    const after = str.slice(offset + match.length);
    if (/(?:&|&amp;)[#\w]*$/.test(before) && /^[\w]*;/.test(after)) {
      return match;
    }
    return addToken(`<span class="skill-kw-number">${escapeHtml(match)}</span>`);
  });

  // 4. Restore tokens
  s = s.replace(/___SKILL_KW_TOKEN_(\d+)___/g, (match, idx) => tokens[Number(idx)] || "");
  return s;
}

let activeTermPopovers = [];

function closeAllTermPopovers() {
  activeTermPopovers.forEach((pop) => pop.remove());
  activeTermPopovers = [];
}

function closeTermPopover(targetPopover) {
  if (targetPopover) {
    targetPopover.remove();
    activeTermPopovers = activeTermPopovers.filter((p) => p !== targetPopover);
  } else {
    closeAllTermPopovers();
  }
}

// Close all popovers when scrolling on window or outside containers, but allow scrolling inside the tooltip itself
window.addEventListener("scroll", (e) => {
  if (activeTermPopovers.length === 0) return;
  // If the scroll target is inside any active popover, do not close
  if (e.target && e.target.closest && e.target.closest(".uttu-term-popover")) {
    return;
  }
  closeAllTermPopovers();
}, { capture: true, passive: true });

// Close all popovers when clicking anywhere on the screen outside active popovers and outside keyword buttons
document.addEventListener("click", (e) => {
  if (activeTermPopovers.length === 0) return;
  // If clicked inside any term popover or clicked on a keyword element, do not dismiss all
  if (e.target.closest(".uttu-term-popover") || e.target.closest(".skill-kw-bracket") || e.target.closest(".skill-kw-stat")) {
    return;
  }
  closeAllTermPopovers();
});

function showTermPopover(targetEl, termText, charName) {
  if (!termText || !targetEl) return;

  const isCn = currentLang === "cn";
  // Some game terms keep the quotes the game wraps around a name
  // (`["Seven Friends"]`, `【“七友人”】`); the glossary keys are unquoted.
  const lookupTerm = termText.trim().replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();
  const cleanTerm = lookupTerm.toLowerCase();

  let found = null;
  // 1. Look in skillGlossaryData (exact key, lowercase, or by nameZh/nameEn matching)
  if (skillGlossaryData) {
    if (skillGlossaryData[lookupTerm]) {
      found = skillGlossaryData[lookupTerm];
    } else if (skillGlossaryData[cleanTerm]) {
      found = skillGlossaryData[cleanTerm];
    } else {
      for (const [k, v] of Object.entries(skillGlossaryData)) {
        if (!v) continue;
        if ((v.nameZh && v.nameZh === lookupTerm) || (v.nameEn && v.nameEn.toLowerCase() === cleanTerm)) {
          found = v;
          break;
        }
      }
    }
  }

  // 2. Look in character's own skills / insights / weapons
  if (!found && charName && characterSkillsData && characterSkillsData[charName]) {
    const c = characterSkillsData[charName];
    for (const s of (c.skills || [])) {
      if ((s.nameEn && s.nameEn.toLowerCase() === cleanTerm) || (s.nameZh && (s.nameZh === lookupTerm || s.nameZh.toLowerCase() === cleanTerm))) {
        const r1 = s.ranks ? (s.ranks["1"] || Object.values(s.ranks)[0] || {}) : s;
        found = {
          nameEn: s.nameEn,
          nameZh: s.nameZh || s.nameEn,
          descEn: r1.descEn || s.descEn,
          descZh: r1.descZh || s.descZh || r1.descEn || s.descEn,
          descVi: r1.descVi || s.descVi || "",
          tagEn: s.type || "Skill",
          tagZh: s.type === "Ultimate" ? "至终仪式" : (s.type === "Special" ? "特殊术式" : "神秘术"),
        };
        break;
      }
    }
    if (!found) {
      for (const ins of (c.insights || [])) {
        if ((ins.nameEn && ins.nameEn.toLowerCase() === cleanTerm) || (ins.nameZh && (ins.nameZh === lookupTerm || ins.nameZh.toLowerCase() === cleanTerm))) {
          found = {
            nameEn: ins.nameEn,
            nameZh: ins.nameZh || ins.nameEn,
            descEn: ins.descEn,
            descZh: ins.descZh || ins.descEn,
            descVi: ins.descVi || "",
            tagEn: "Insight",
            tagZh: "传承",
          };
          break;
        }
      }
    }
    if (!found && Array.isArray(c.weapons)) {
      for (const w of c.weapons) {
        if ((w.nameEn && w.nameEn.toLowerCase() === cleanTerm) || (w.nameZh && (w.nameZh === lookupTerm || w.nameZh.toLowerCase() === cleanTerm))) {
          found = {
            nameEn: w.nameEn,
            nameZh: w.nameZh || w.nameEn,
            descEn: w.mainDescEn,
            descZh: w.mainDescZh || w.mainDescEn,
            descVi: w.mainDescVi || "",
            tagEn: "Weapon",
            tagZh: "武器",
          };
          break;
        }
        for (const cb of (w.combos || [])) {
          if ((cb.daggerEn && cb.daggerEn.toLowerCase() === cleanTerm) || (cb.daggerZh && (cb.daggerZh === lookupTerm || cb.daggerZh.toLowerCase() === cleanTerm))) {
            found = {
              nameEn: cb.daggerEn,
              nameZh: cb.daggerZh || cb.daggerEn,
              descEn: cb.descEn,
              descZh: cb.descZh || cb.descEn,
              descVi: cb.descVi || "",
              tagEn: "Combo",
              tagZh: "组合",
            };
            break;
          }
        }
        if (found) break;
      }
    }
  }

  if (!found) return;

  // Measure target coordinates before creating popover
  const rect = targetEl.getBoundingClientRect();

  // If clicked term is NOT inside an existing popover, close previous popovers
  const parentPopover = targetEl.closest(".uttu-term-popover");
  if (!parentPopover) {
    closeAllTermPopovers();
  }

  const title = isCn ? (found.nameZh || found.nameEn) : (found.nameEn || found.nameZh);
  const desc = pickLocalizedDesc(found);
  const tag = isCn ? (found.tagZh || found.tagEn) : (found.tagEn || found.tagZh);

  const popover = document.createElement("div");
  popover.className = "uttu-term-popover";
  popover.innerHTML = `
    <div class="uttu-term-popover-head">
      <div class="uttu-term-popover-head-left">
        <h5 class="uttu-term-popover-title">${escapeHtml(title)}</h5>
        ${tag ? `<span class="uttu-term-popover-tag">${escapeHtml(tag)}</span>` : ""}
      </div>
      <button type="button" class="uttu-term-popover-close" aria-label="Close">✕</button>
    </div>
    <div class="uttu-term-popover-body">${formatSkillKeywords(desc)}</div>
  `;

  popover.querySelector(".uttu-term-popover-close").addEventListener("click", (e) => {
    e.stopPropagation();
    closeTermPopover(popover);
  });

  // Allow clicking inside terms within this popover body to stack/open nested term popover
  popover.querySelectorAll(".skill-kw-bracket, .skill-kw-stat").forEach((innerKw) => {
    innerKw.addEventListener("click", (e) => {
      e.stopPropagation();
      showTermPopover(innerKw, innerKw.dataset.term, charName);
    });
  });

  document.body.appendChild(popover);
  activeTermPopovers.push(popover);

  // Position popover ABOVE the target element by default
  const popRect = popover.getBoundingClientRect();

  let left = rect.left;
  let top = rect.top - popRect.height - 8;

  // If overflows top, flip and position below the target
  if (top < 16) {
    top = rect.bottom + 8;
  }

  // Clamp right edge within viewport
  if (left + popRect.width > window.innerWidth - 16) {
    left = window.innerWidth - popRect.width - 16;
  }
  if (left < 16) left = 16;

  popover.style.left = `${Math.round(left)}px`;
  popover.style.top = `${Math.round(top)}px`;
  // Ensure newer stacked popover appears on top of earlier ones
  popover.style.zIndex = `${10005 + activeTermPopovers.length}`;
}

function renderCharacterSkillsSection(name) {
  const skillInfo = getCharacterSkillsInfo(name);
  if (!skillInfo) return "";

  const isCn = currentLang === "cn";

  // Top mode buttons: Skills / Weapons / Insight / Portrait / Euphoria
  const canonicalName = resolveCharacterName(name);
  const heroEuphoriaList = characterEuphoriasData[name] || characterEuphoriasData[canonicalName] || null;
  const hasCharEuphoria = Array.isArray(heroEuphoriaList) && heroEuphoriaList.length > 0;
  const hasWeapons = Array.isArray(skillInfo.weapons) && skillInfo.weapons.length > 0;

  const tabsHtml = `
    <div class="uttu-mode-bar">
      <button type="button" class="uttu-mode-btn ${charSkillsActiveTab === "skills" ? "is-active" : ""}" data-skill-tab="skills">
        ${isCn ? "神秘术" : "Arcane Skills"}
      </button>
      ${
        hasWeapons
          ? `<button type="button" class="uttu-mode-btn ${charSkillsActiveTab === "weapons" ? "is-active" : ""}" data-skill-tab="weapons">
              ${isCn ? (canonicalName === "Kassandra" ? "能力" : "武器") : (canonicalName === "Kassandra" ? "Ability" : "Weapon")}
            </button>`
          : ""
      }
      <button type="button" class="uttu-mode-btn ${charSkillsActiveTab === "insights" ? "is-active" : ""}" data-skill-tab="insights">
        ${isCn ? "传承洞悉" : "Inheritance"}
      </button>
      <button type="button" class="uttu-mode-btn ${charSkillsActiveTab === "portrays" ? "is-active" : ""}" data-skill-tab="portrays">
        ${isCn ? "塑造" : "Portray"}
      </button>
      ${
        hasCharEuphoria
          ? `<button type="button" class="uttu-mode-btn ${charSkillsActiveTab === "euphoria" ? "is-active" : ""}" data-skill-tab="euphoria">
              ${isCn ? "狂想" : "Euphoria"}
            </button>`
          : ""
      }
    </div>
  `;

  let mainBodyHtml = "";

  if (charSkillsActiveTab === "skills") {
    const rawList = skillInfo.skills || [];
    const availableStances = getCharacterStances(rawList);

    // Euphoria-gated cards (e.g. 37's [Reductio ad Absurdum]) stay hidden until
    // the reader turns on the E1/E2 switch that unlocks them.
    if (charSkillsEuphoriaChar !== canonicalName) {
      charSkillsEuphoriaChar = canonicalName;
      charSkillsEuphoriaRank = 0;
    }
    const euphoriaRanks = [...new Set(rawList.filter((s) => s.requires).map((s) => Number(s.requires.rank) || 1))].sort((a, b) => a - b);
    if (!euphoriaRanks.includes(charSkillsEuphoriaRank)) charSkillsEuphoriaRank = 0;
    const gatedList = rawList.filter((s) => !s.requires || Number(s.requires.rank) === charSkillsEuphoriaRank);

    // Reinforce (Lucy): the game shows the incantation in two states only, 初始 (Base)
    // and 升华 (Reinforce). The generator stores the reinforced rank set on the card
    // (`reinforce: { ranks }`), so this is only a view switch.
    if (charSkillsReinforceChar !== canonicalName) {
      charSkillsReinforceChar = canonicalName;
      charSkillsReinforceLevel = 0;
    }
    const hasReinforce = rawList.some((s) => s.reinforce?.ranks);
    if (!hasReinforce) charSkillsReinforceLevel = 0;

    if (availableStances.length > 0) {
      if (!charSkillsActiveStance || !availableStances.includes(charSkillsActiveStance)) {
        charSkillsActiveStance = availableStances[0];
      }
    } else {
      charSkillsActiveStance = null;
    }

    const list = availableStances.length > 0 ? getSkillsForStance(gatedList, charSkillsActiveStance) : gatedList;

    if (!list.length) {
      mainBodyHtml = `<p class="hint">No skill details available.</p>`;
    } else {
      if (charSkillSelectedIdx >= list.length) charSkillSelectedIdx = 0;
      const currentSkill = list[charSkillSelectedIdx];
      const isUlt = currentSkill.type === "Ultimate";
      // When the Reinforce switch is on, a card's text comes from its reinforced rank
      // set instead of the base one; the strip keeps the same card.
      const reinforceRanks =
        charSkillsReinforceLevel > 0 && currentSkill.reinforce?.ranks
          ? currentSkill.reinforce.ranks
          : null;
      const viewSkill = reinforceRanks ? { ...currentSkill, ranks: reinforceRanks } : currentSkill;

      // Stance switcher bar if character has multiple skill stances (e.g. Rhiannon, The Twins, Nautika)
      let stanceBarHtml = "";
      if (availableStances.length > 0) {
        stanceBarHtml = `
          <div class="uttu-stance-bar">
            ${availableStances
              .map(
                (st) => `
              <button type="button" class="uttu-stance-btn ${st === charSkillsActiveStance ? "is-active" : ""}" data-skill-stance="${escapeHtml(st)}">
                ${escapeHtml(st)}
              </button>
            `
              )
              .join("")}
          </div>
        `;
      }

      // Euphoria switch: E1/E2 reveal the cards that Euphoria unlocks
      let euphoriaBarHtml = "";
      if (euphoriaRanks.length > 0) {
        const euphoriaName = (index) => {
          const tree = heroEuphoriaList?.[index];
          if (!tree) return "";
          return isCn ? tree.name?.zh || tree.name?.en || "" : tree.name?.en || tree.name?.zh || "";
        };
        euphoriaBarHtml = `
          <div class="uttu-stance-bar uttu-euphoria-bar">
            <span class="uttu-euphoria-bar-label">${isCn ? "狂想" : "Euphoria"}</span>
            ${euphoriaRanks
              .map((rank) => {
                const gate = rawList.find((s) => Number(s.requires?.rank) === rank)?.requires || {};
                const title = euphoriaName(Number(gate.euphoria) || 0);
                return `<button type="button" class="uttu-stance-btn ${charSkillsEuphoriaRank === rank ? "is-active" : ""}" data-skill-euphoria="${rank}" title="${escapeHtml(title)}">E${rank}</button>`;
              })
              .join("")}
          </div>
        `;
      }

      // Reinforce switch (Lucy): the incantation has two states, 初始 (Base) and
      // 升华 (Reinforce). It only swaps the text of the cards that carry a reinforced
      // rank set, so the strip stays at 4 cards. No leading label: the two buttons
      // already say what the switch is.
      let reinforceBarHtml = "";
      if (hasReinforce) {
        reinforceBarHtml = `
          <div class="uttu-stance-bar uttu-reinforce-bar">
            <button type="button" class="uttu-stance-btn ${charSkillsReinforceLevel === 0 ? "is-active" : ""}" data-skill-reinforce="0">${isCn ? "初始" : currentLang === "vi" ? "Gốc" : "Base"}</button>
            <button type="button" class="uttu-stance-btn ${charSkillsReinforceLevel === 1 ? "is-active" : ""}" data-skill-reinforce="1">${isCn ? "升华" : currentLang === "vi" ? "Cường hóa" : "Reinforce"}</button>
          </div>
        `;
      }

      // Selector card strip at top
      const cardsStripHtml = list
        .map((sk, idx) => {
          const isSelected = idx === charSkillSelectedIdx;
          const isSkUlt = sk.type === "Ultimate";
          const badgeText = getSkillBadgeText(sk, isCn);

          const ultFrameHtml = isSkUlt
            ? `<img class="rot-card-frame" src="${ROT_ULTIMATE_FRAME.image}" alt="" /><img class="rot-card-unique-text" src="images/card_modulo/unique-card-text.png" alt="" />`
            : "";

          return `
            <div class="uttu-skill-card-item ${isSelected ? "is-selected" : ""} ${isSkUlt ? "is-ult" : ""}" data-skill-idx="${idx}">
              <div class="rot-card ${isSkUlt ? "is-ultimate" : ""}">
                <img class="rot-card-art" src="${escapeHtml(sk.icon || "")}" alt="" />
                ${ultFrameHtml}
              </div>
              <span class="uttu-skill-card-badge">${escapeHtml(badgeText)}</span>
            </div>
          `;
        })
        .join("");

      // Rank selector for non-ultimate skills (★1, ★2, ★3)
      let rankSelectorHtml = "";
      let activeDesc = "";
      let activeArt = "";

      // Adaptive cards (Brume / Nautika) are one card whose variants are chosen when
      // casting ("choose 1 out of [A] and [B]"). The card itself has no ★ selector;
      // each option panel carries its own ★1/★2/★3 picker instead.
      const adaptiveOptions =
        !isUlt && Array.isArray(currentSkill.adaptiveOptions) ? currentSkill.adaptiveOptions : [];

      if (isUlt) {
        const ultRank = reinforceRanks?.["1"] || currentSkill;
        activeDesc = pickLocalizedDesc(ultRank);
        activeArt = pickLocalizedArt(ultRank);
        if (!activeArt) activeArt = pickLocalizedArt(currentSkill);
      } else if (viewSkill.ranks) {
        const availableRanks = Object.keys(viewSkill.ranks).map(Number).sort((a, b) => a - b);
        if (!availableRanks.includes(charSkillSelectedRank)) {
          charSkillSelectedRank = availableRanks[availableRanks.length - 1] || 1;
        }

        if (availableRanks.length > 1 && !adaptiveOptions.length) {
          rankSelectorHtml = `
            <div class="uttu-rank-selector">
              ${availableRanks
                .map((rk) => {
                  const rkObj = viewSkill.ranks[rk];
                  const isRkActive = rk === charSkillSelectedRank;
                  return `
                    <div class="uttu-rank-card-col ${isRkActive ? "is-active" : ""}" data-rank-num="${rk}">
                      <div class="rot-card">
                        <img class="rot-card-art" src="${escapeHtml(currentSkill.icon || "")}" alt="" />
                      </div>
                      <span class="uttu-rank-pill">${"✦".repeat(rk)}</span>
                    </div>
                  `;
                })
                .join("")}
            </div>
          `;
        }

        const chosenRank = adaptiveOptions.length
          ? viewSkill.ranks["1"] || {}
          : viewSkill.ranks[charSkillSelectedRank] || viewSkill.ranks["1"] || {};
        activeDesc = pickLocalizedDesc(chosenRank);
        activeArt = pickLocalizedArt(chosenRank);
        if (adaptiveOptions.length) activeDesc = stripSkillRankMention(activeDesc);
      }

      const chosenRankObj = isUlt
        ? reinforceRanks?.["1"] || currentSkill
        : (viewSkill.ranks ? (viewSkill.ranks[charSkillSelectedRank] || viewSkill.ranks[1] || {}) : viewSkill);

      let conduitStatsHtml = "";
      const hasCost = chosenRankObj.cost !== undefined;
      const hasHarm = chosenRankObj.harmonization !== undefined;
      if (hasCost || hasHarm) {
        const costLabel = isCn ? "消耗" : "Cost";
        const harmLabel = isCn ? "同调" : "Harmonization";
        // The game prints Cost as a spend, so its number always carries the minus
        // sign (-0, -2, -3) even though `fight_device` stores it as a positive.
        const costValue = Number(chosenRankObj.cost);
        const costText = Number.isFinite(costValue) ? `-${Math.abs(costValue)}` : `${chosenRankObj.cost}`;
        const harmVal = chosenRankObj.harmonization;
        const harmSign = typeof harmVal === "number" && harmVal > 0 ? `+${harmVal}` : `${harmVal}`;
        const harmClass = typeof harmVal === "number" && harmVal < 0 ? "is-negative" : "is-positive";
        conduitStatsHtml = `
          <div class="uttu-conduit-metrics">
            ${hasCost ? `
              <div class="uttu-conduit-metric u-cost">
                <span class="uttu-metric-label">${costLabel}</span>
                <img class="uttu-conduit-cost" src="images/random_icon/costDiamond.png" alt="" aria-hidden="true" />
                <span class="uttu-metric-value">${costText}</span>
              </div>
            ` : ""}
            ${hasHarm ? `
              <div class="uttu-conduit-metric u-harm ${harmClass}">
                <span class="uttu-metric-label">${harmLabel}</span>
                <span class="uttu-conduit-harm" aria-hidden="true"></span>
                <span class="uttu-metric-value">${harmSign}</span>
              </div>
            ` : ""}
          </div>
        `;
      }

      const skillNameText = isCn ? currentSkill.nameZh || currentSkill.nameEn : currentSkill.nameEn || currentSkill.nameZh;
      // "Special 1" / "Special 2" is just the generator's sub-slot for a hero's extra
      // cards, not something the game prints next to the card type.
      const subSlotRaw = (currentSkill.subSlot || "").trim();
      const subSlotTag = subSlotRaw && !/^special\s*\d*$/i.test(subSlotRaw) ? ` · ${subSlotRaw}` : "";
      const currentRankNum = isUlt ? 1 : charSkillSelectedRank;
      const attrBadge = getSkillBadgeText(viewSkill, isCn, currentRankNum);
      // The detail board prints an ultimate's own card type next to the type word
      // (`Ultimate · Buff`), while its strip badge stays "Ultimate".
      const ultBadge = isUlt ? getCardTypeLabel(currentSkill, isCn, 1) : "";
      const typeTag = isUlt
        ? `${isCn ? "至终仪式" : "Ultimate"}${ultBadge ? ` · ${ultBadge}` : ""}`
        : `${attrBadge}${subSlotTag}`;

      // Adaptive cards (Brume / Nautika) are one card whose variants the game lets you
      // pick when casting ("choose 1 out of [A] and [B]"). Instead of a Set A/B/C stance
      // bar the board stacks one panel per option, and each panel has its own ★1/★2/★3
      // picker with the option's card art — exactly what the game shows on tap.
      const adaptiveOptionKey = (opt) => String(opt.ranks?.["1"]?.id || opt.nameEn || "");
      const adaptiveOptionRank = (opt) => {
        const available = Object.keys(opt.ranks || { 1: {} }).map(Number).sort((a, b) => a - b);
        const chosen = Number(charSkillAdaptiveRanks[adaptiveOptionKey(opt)]);
        return available.includes(chosen) ? chosen : available[available.length - 1] || 1;
      };
      const adaptiveOptionPickerHtml = (opt) => {
        const key = adaptiveOptionKey(opt);
        const selectedRank = adaptiveOptionRank(opt);
        const available = Object.keys(opt.ranks || { 1: {} }).map(Number).sort((a, b) => a - b);
        return available
          .map(
            (rk) => `
            <button type="button" class="uttu-skill-option-rank ${rk === selectedRank ? "is-active" : ""}" data-adaptive-opt="${escapeHtml(key)}" data-rank-num="${rk}">
              <span class="rot-card">
                <img class="rot-card-art" src="${escapeHtml(opt.icon || "")}" alt="" />
              </span>
              <span class="uttu-rank-pill">${"✦".repeat(rk)}</span>
            </button>
          `,
          )
          .join("");
      };
      const adaptiveOptionDescHtml = (opt) => {
        const selectedRank = adaptiveOptionRank(opt);
        const optRank = opt.ranks ? opt.ranks[selectedRank] || opt.ranks["1"] || {} : opt;
        // Every cast option carries its own flavour line (the game's `desc_art`), and it
        // changes per ✦ rank, so each panel prints its own above the description — the
        // same order the plain cards use. Brume's base card ships no `desc_art` at all, so
        // S1 reads from the options only.
        const optArt = pickLocalizedArt(optRank);
        return `${optArt ? `<div class="uttu-skill-flavor"><span class="uttu-flavor-symbol">Φ</span> ${escapeHtml(optArt)}</div>` : ""}
          <div class="uttu-skill-panel-desc">${formatSkillKeywords(pickLocalizedDesc(optRank))}</div>`;
      };
      const adaptiveOptionsHtml = adaptiveOptions.length
        ? `<div class="uttu-skill-panels is-stacked">
          ${adaptiveOptions
            .map((opt) => {
              const optName = isCn ? opt.nameZh || opt.nameEn || "" : opt.nameEn || opt.nameZh || "";
              const optTag = getSkillBadgeText(opt, isCn, adaptiveOptionRank(opt));
              return `
            <div class="uttu-skill-panel uttu-skill-panel-option">
              <div class="uttu-skill-panel-head">
                <span class="uttu-skill-panel-label">${escapeHtml(optName)}</span>
                <span class="uttu-skill-option-tag">${escapeHtml(optTag)}</span>
              </div>
              <div class="uttu-skill-option-picker">${adaptiveOptionPickerHtml(opt)}</div>
              ${adaptiveOptionDescHtml(opt)}
            </div>
          `;
            })
            .join("")}
        </div>`
        : "";
      const adaptiveDetailHtml = `
        <div class="uttu-skill-info-head">
          <h3 class="uttu-skill-title">${escapeHtml(skillNameText)}</h3>
          <span class="uttu-skill-type-tag">${escapeHtml(typeTag)}</span>
        </div>
        ${activeArt ? `<div class="uttu-skill-flavor"><span class="uttu-flavor-symbol">Φ</span> ${escapeHtml(activeArt)}</div>` : ""}
        <div class="uttu-skill-body-desc">${formatSkillKeywords(activeDesc)}</div>
        ${adaptiveOptionsHtml}
      `;

      // Perception Incantation cards split their detail board into three equal
      // panels: the base incantation plus one panel per Perception Ability.
      const hasPerceptionPanels =
        !isUlt && Array.isArray(currentSkill.panels) && currentSkill.panels.length > 0;
      const costLabelText = isCn ? "消耗" : currentLang === "vi" ? "Tiêu hao" : "Cost";
      const pointLabelText = isCn ? "洞知点" : "Perception Point";
      const perceptionCostHtml =
        typeof currentSkill.perceptionCost === "number"
          ? `<span class="uttu-skill-panel-cost">${costLabelText} ${pointLabelText} <img class="uttu-skill-perception-icon" src="images/random_icon/costPerceptionPoint.png" alt="" /> ×${currentSkill.perceptionCost}</span>`
          : "";
      const abilityPanelsHtml = hasPerceptionPanels
        ? currentSkill.panels
            .map(
              (panel) => `
            <div class="uttu-skill-panel">
              <div class="uttu-skill-panel-head">
                <span class="uttu-skill-panel-label">${escapeHtml(pickLocalizedLabel(panel.label))}</span>
              </div>
              <div class="uttu-skill-panel-desc">${formatSkillKeywords(pickLocalizedDesc(panel))}</div>
            </div>
          `,
            )
            .join("")
        : "";

      // The panels replace the plain body, so the head has to be repeated here or
      // a Perception card would show no name and no type tag at all.
      const perceptionPanelsHtml = `
        <div class="uttu-skill-info-head">
          <h3 class="uttu-skill-title">${escapeHtml(skillNameText)}</h3>
          <span class="uttu-skill-type-tag">${escapeHtml(typeTag)}</span>
        </div>
        <div class="uttu-skill-panels is-stacked">
          <div class="uttu-skill-panel">
            ${activeArt ? `<div class="uttu-skill-flavor"><span class="uttu-flavor-symbol">Φ</span> ${escapeHtml(activeArt)}</div>` : ""}
            <div class="uttu-skill-panel-desc">${formatSkillKeywords(activeDesc)}</div>
            <div class="uttu-skill-panel-foot">
              <span class="uttu-skill-panel-foot-left">
                <span class="uttu-skill-panel-label">${escapeHtml(pickLocalizedLabel(currentSkill.perceptionTag))}</span>
                ${perceptionCostHtml}
              </span>
            </div>
          </div>
          ${abilityPanelsHtml}
        </div>
      `;

      const standardDetailHtml = `
        <div class="uttu-skill-info-head">
          <h3 class="uttu-skill-title">${escapeHtml(skillNameText)}</h3>
          <span class="uttu-skill-type-tag">${escapeHtml(typeTag)}</span>
        </div>
        ${activeArt ? `<div class="uttu-skill-flavor"><span class="uttu-flavor-symbol">Φ</span> ${escapeHtml(activeArt)}</div>` : ""}
        <div class="uttu-skill-body-desc">${formatSkillKeywords(activeDesc)}</div>
      `;

      mainBodyHtml = `
        <div class="uttu-skills-showcase">
          ${stanceBarHtml}
          ${euphoriaBarHtml}
          ${reinforceBarHtml}
          <!-- Top Card Selection Strip -->
          <div class="uttu-cards-strip">${cardsStripHtml}</div>

          <!-- Bottom Card Detail Panel -->
          <div class="uttu-detail-board">
            ${rankSelectorHtml}
            ${conduitStatsHtml}
            ${hasPerceptionPanels ? perceptionPanelsHtml : adaptiveOptions.length ? adaptiveDetailHtml : standardDetailHtml}
          </div>
        </div>
      `;
    }
  } else if (charSkillsActiveTab === "weapons") {
    if (canonicalName === "Ezio Auditore") {
      const primaryWeapons = [
        { code: "venetian-falchion", nameEn: "Venetian Falchion", nameZh: "威尼斯弯刀", nameVi: "Venetian Falchion", file: "venetian-falchion.png" },
        { code: "condottiero-war-hammer", nameEn: "Condottiero War Hammer", nameZh: "佣兵战锤", nameVi: "Condottiero War Hammer", file: "condottiero-war-hammer.png" },
        { code: "captain-s-sword", nameEn: "Captain's Sword", nameZh: "队长之剑", nameVi: "Captain's Sword", file: "captain-s-sword.png" }
      ];
      const secondaryWeapons = [
        { code: "channeled-cinquedea", nameEn: "Channeled Cinquedea", nameZh: "多槽五指剑", nameVi: "Channeled Cinquedea", file: "channeled-cinquedea.png" },
        { code: "butcher-knife", nameEn: "Butcher Knife", nameZh: "屠刀", nameVi: "Butcher Knife", file: "butcher-knife.png" },
        { code: "sultan-s-knife", nameEn: "Sultan's Knife", nameZh: "苏丹短刀", nameVi: "Sultan's Knife", file: "sultan-s-knife.png" }
      ];

      const activePriObj = primaryWeapons.find((w) => w.code === charEzioPrimary) || primaryWeapons[0];
      const activeSecObj = secondaryWeapons.find((w) => w.code === charEzioSecondary) || secondaryWeapons[0];

      const priHtml = primaryWeapons
        .map((w) => {
          const isAct = w.code === charEzioPrimary;
          const wName = currentLang === "vi" ? w.nameVi : (isCn ? w.nameZh : w.nameEn);
          return `
            <div class="ezio-weapon-card is-primary ${isAct ? "is-active" : ""}" data-ezio-primary="${w.code}">
              <div class="ezio-weapon-box">
                <img src="images/ezio_weapon/${w.file}" alt="${escapeHtml(wName)}" class="ezio-weapon-img" />
              </div>
              <span class="ezio-weapon-label">${escapeHtml(wName)}</span>
            </div>
          `;
        })
        .join("");

      const secHtml = secondaryWeapons
        .map((w) => {
          const isAct = w.code === charEzioSecondary;
          const wName = currentLang === "vi" ? w.nameVi : (isCn ? w.nameZh : w.nameEn);
          return `
            <div class="ezio-weapon-card is-secondary ${isAct ? "is-active" : ""}" data-ezio-secondary="${w.code}">
              <div class="ezio-weapon-box">
                <img src="images/ezio_weapon/${w.file}" alt="${escapeHtml(wName)}" class="ezio-weapon-img" />
              </div>
              <span class="ezio-weapon-label">${escapeHtml(wName)}</span>
            </div>
          `;
        })
        .join("");

      // Primary desc and combo desc from skillsData
      const weaponsList = skillInfo.weapons || [];
      const currentPriData = weaponsList.find((w) => (w.nameEn || "").toLowerCase().replace(/[^a-z0-9]+/g, "-") === charEzioPrimary) || weaponsList[0] || {};
      let priMainDesc = isCn ? currentPriData.mainDescZh || currentPriData.mainDescEn : (currentLang === "vi" ? currentPriData.mainDescVi || currentPriData.mainDescEn : currentPriData.mainDescEn);

      const currentComboData = (currentPriData.combos || []).find((c) => (c.daggerEn || "").toLowerCase().replace(/[^a-z0-9]+/g, "-") === charEzioSecondary) || {};
      let comboDesc = isCn ? currentComboData.descZh || currentComboData.descEn : (currentLang === "vi" ? currentComboData.descVi || currentComboData.descEn : currentComboData.descEn);

      const priTitleText = currentLang === "vi" ? activePriObj.nameVi : (isCn ? activePriObj.nameZh : activePriObj.nameEn);
      const secTitleText = currentLang === "vi" ? activeSecObj.nameVi : (isCn ? activeSecObj.nameZh : activeSecObj.nameEn);

      mainBodyHtml = `
        <div class="ezio-weapon-board">
          <div class="ezio-weapon-stage">
            <div class="ezio-weapon-col is-left">
              ${priHtml}
            </div>

            <div class="ezio-weapon-center-preview">
              <div class="ezio-center-slot">
                <div class="ezio-center-box">
                  <img src="images/ezio_weapon/${activePriObj.file}" alt="" class="ezio-center-img" />
                </div>
                <span class="ezio-center-name">${escapeHtml(priTitleText)}</span>
              </div>
              <span class="ezio-center-cross">×</span>
              <div class="ezio-center-slot">
                <div class="ezio-center-box">
                  <img src="images/ezio_weapon/${activeSecObj.file}" alt="" class="ezio-center-img" />
                </div>
                <span class="ezio-center-name">${escapeHtml(secTitleText)}</span>
              </div>
            </div>

            <div class="ezio-weapon-col is-right">
              ${secHtml}
            </div>
          </div>

          <div class="ezio-weapon-detail-paper">
            <div class="ezio-effect-section">
              <div class="ezio-effect-badge">${escapeHtml(priTitleText)}</div>
              <div class="ezio-effect-desc">${formatSkillKeywords(priMainDesc || "")}</div>
            </div>

            <div class="ezio-effect-divider"></div>

            <div class="ezio-effect-section">
              <div class="ezio-effect-badge is-combo">${escapeHtml(priTitleText)} × ${escapeHtml(secTitleText)}</div>
              <div class="ezio-effect-desc">${formatSkillKeywords(comboDesc || "")}</div>
            </div>
          </div>
        </div>
      `;
    } else if (canonicalName === "Kassandra") {
      // Kassandra Ability Tree
      const abilityTrees = [
        {
          key: "hunter",
          nameEn: "Hunter",
          nameZh: "猎人",
          nameVi: "Hunter",
          icon: "images/kassandra_ability/Hunter.png",
          color: "#4FA89B",
          skills: [
            {
              index: 0,
              cost: 3,
              nameEn: "Archery Master",
              nameZh: "射术大师",
              nameVi: "Archery Master",
              icon: "images/kassandra_ability/archery_master.png",
              descVi: "[Sparta Kick], [Rain of Destruction] và [Rush Assassination] kích hoạt thêm 1 stack [Lethal Injury].\nThêm hiệu ứng mới cho [Force Field] hiện tại: Khi [Assassination] của một đồng minh được kích hoạt, gây thêm 75% DMG cùng loại với người tấn công.\nHiệu ứng [Way of Artemis] được cường hóa: Tất cả đồng minh nhận Critical Rate +15%. Đồng minh [Assassination] nhận thêm Critical Rate +10%.",
              descEn: "[Sparta Kick], [Rain of Destruction], and [Rush Assassination] trigger 1 additional stack of [Lethal Injury].\nAdd new effect to current [Force Field]: When an allied [Assassination] is triggered, deal an additional 75% DMG of the attacker's type.\nEnhanced [Way of Artemis]: All allies gain Critical Rate +15%. [Assassination] allies gain an extra Critical Rate +10%.",
              descZh: "【斯巴达踢击】、【毁灭之雨】与【急速刺杀】额外附加1层【致命伤】。\n当前【术阵】新增效果：友方【刺杀】触发时，额外造成攻击者类型75%的创伤。\n【阿尔忒弥斯之路】强化：己方全体暴击率+15%，【刺杀】角色额外暴击率+10%。"
            },
            {
              index: 1,
              cost: 2,
              nameEn: "Sixth Sense",
              nameZh: "第六感",
              nameVi: "Sixth Sense",
              icon: "images/kassandra_ability/sixth_sense.png",
              descVi: "Khi [Fury of Ares], [Advent of Artemis] hoặc [Rain of Destruction] đánh trúng mục tiêu, gây thêm 1 stack [Lethal Injury] lên chúng.\n\nThêm hiệu ứng mới cho [Force Field] hiện tại: Khi [Assassination] của một đồng minh được kích hoạt, gây thêm 50% DMG cùng loại với người tấn công.",
              descEn: "When [Fury of Ares], [Advent of Artemis], or [Rain of Destruction] hits a target, inflict 1 additional stack of [Lethal Injury] on them.\n\nAdd new effect to current [Force Field]: When an allied [Assassination] is triggered, deal an additional 50% DMG of the attacker's type.",
              descZh: "【阿瑞斯的忿怒】、【阿尔忒弥斯之临】或【毁灭之雨】命中目标时，对其额外施加1层【致命伤】。\n\n当前【术阵】新增效果：友方【刺杀】触发时，额外造成攻击者类型50%的创伤。"
            },
            {
              index: 2,
              cost: 1,
              nameEn: "Predator Shot",
              nameZh: "掠食者之击",
              nameVi: "Predator Shot",
              icon: "images/kassandra_ability/predator_shot.png",
              descVi: "[Advent of Artemis] gây thêm 1 stack [Lethal Injury].\nKhi vào trận, nhận [Way of Artemis]; nếu bản thân đã có [Way of Ares] hoặc [Way of Nyx], thay vào đó nhận Critical Rate +15%.\n[Way of Artemis]: Hiệu ứng [Force Field]: Tất cả đồng minh nhận Critical DMG +(27% + số stack [Guidance of Three Gods] ×5.4%). Đồng minh [Assassination] nhận thêm Critical DMG +(số stack [Guidance of Three Gods] ×5.4%).",
              descEn: "[Advent of Artemis] inflicts 1 additional stack of [Lethal Injury].\nWhen entering battle, gain [Way of Artemis]; if already having [Way of Ares] or [Way of Nyx], gain Critical Rate +15% instead.\n[Way of Artemis]: [Force Field] Effect: All allies gain Critical DMG +(27% + [Guidance of Three Gods] stacks x5.4%). [Assassination] allies gain extra Critical DMG +([Guidance of Three Gods] stacks x5.4%).",
              descZh: "【阿尔忒弥斯之临】额外施加1层【致命伤】。\n进入战斗时获得【阿尔忒弥斯之路】；若已有【阿瑞斯之路】或【倪克斯之路】，则改为获得暴击率+15%。\n【阿尔忒弥斯之路】：【术阵】效果：己方全体暴击创伤+(27% + 【三神指引】层数×5.4%)，【刺杀】角色额外暴击创伤+(【三神指引】层数×5.4%)。"
            }
          ]
        },
        {
          key: "warrior",
          nameEn: "Warrior",
          nameZh: "战士",
          nameVi: "Warrior",
          icon: "images/kassandra_ability/Warrior.png",
          color: "#C25D51",
          skills: [
            {
              index: 0,
              cost: 3,
              nameEn: "Overpower Attacks",
              nameZh: "狂袭攻击",
              nameVi: "Overpower Attacks",
              icon: "images/kassandra_ability/overpower_attacks.png",
              descVi: "[Fury of Ares]: Với mỗi loại [Gash] khác nhau trên mục tiêu chính, thi triển thêm [Sparta Kick] lên mục tiêu đó.\n\nHiệu ứng [Way of Ares] được cường hóa: Tất cả đồng minh nhận Incantation Might +18%. Đồng minh [Assassination] nhận thêm Incantation Might +12%.",
              descEn: "[Fury of Ares]: For each different type of [Gash] on the main target, cast [Sparta Kick] on that target again.\n\nEnhanced [Way of Ares]: All allies gain Incantation Might +18%. [Assassination] allies gain an extra Incantation Might +12%.",
              descZh: "【阿瑞斯的忿怒】：主目标每有1种不同类型的【裂伤】，便对其额外施放一次【斯巴达踢击】。\n\n【阿瑞斯之路】强化：己方全体术法威力+18%，【刺杀】角色额外术法威力+12%。"
            },
            {
              index: 1,
              cost: 2,
              nameEn: "Weapons Master",
              nameZh: "武器大师",
              nameVi: "Weapons Master",
              icon: "images/kassandra_ability/weapons_master.png",
              descVi: "[Sparta Kick] gây [Kick Gash] lên mục tiêu trúng đòn trong 3 round. [Rain of Destruction] gây [Arrow Gash] lên các mục tiêu trúng đòn trong 3 round. [Rush Assassination] và [Rush Assassination - Combo] gây [Assassination Gash] lên mục tiêu trúng đòn trong 3 round.",
              descEn: "[Sparta Kick] inflicts [Kick Gash] on target for 3 rounds. [Rain of Destruction] inflicts [Arrow Gash] on targets for 3 rounds. [Rush Assassination] and [Rush Assassination - Combo] inflict [Assassination Gash] on target for 3 rounds.",
              descZh: "【斯巴达踢击】对命中的目标施加【踢击裂伤】3回合；【毁灭之雨】对命中的目标施加【箭术裂伤】3回合；【急速刺杀】及【急速刺杀·连击】对命中的目标施加【刺杀裂伤】3回合。"
            },
            {
              index: 2,
              cost: 1,
              nameEn: "Charge Attack",
              nameZh: "蓄力重击",
              nameVi: "Charge Attack",
              icon: "images/kassandra_ability/charge_attack.png",
              descVi: "Extra Action DMG +20%.\nKhi vào trận, nhận [Way of Ares]; nếu bản thân đã có [Way of Artemis] hoặc [Way of Nyx], thay vào đó nhận Incantation Might +18%.\n[Way of Ares]: Hiệu ứng [Force Field]: Tất cả đồng minh nhận DMG Bonus +(14% + số stack [Guidance of Three Gods] ×2.8%). Đồng minh [Assassination] nhận thêm DMG Bonus +(số stack [Guidance of Three Gods] ×2.8%).",
              descEn: "Extra Action DMG +20%.\nWhen entering battle, gain [Way of Ares]; if already having [Way of Artemis] or [Way of Nyx], gain Incantation Might +18% instead.\n[Way of Ares]: [Force Field] Effect: All allies gain DMG Bonus +(14% + [Guidance of Three Gods] stacks x2.8%). [Assassination] allies gain extra DMG Bonus +([Guidance of Three Gods] stacks x2.8%).",
              descZh: "额外行动创伤+20%。\n进入战斗时获得【阿瑞斯之路】；若已有【阿尔忒弥斯之路】或【倪克斯之路】，则改为获得术法威力+18%。\n【阿瑞斯之路】：【术阵】效果：己方全体创伤加成+(14% + 【三神指引】层数×2.8%)，【刺杀】角色额外创伤加成+(【三神指引】层数×2.8%)。"
            }
          ]
        },
        {
          key: "assassin",
          nameEn: "Assassin",
          nameZh: "刺客",
          nameVi: "Assassin",
          icon: "images/kassandra_ability/Assassin.png",
          color: "#9F70B8",
          skills: [
            {
              index: 0,
              cost: 3,
              nameEn: "Shadow of Nyx",
              nameZh: "倪克斯之影",
              nameVi: "Shadow of Nyx",
              icon: "images/kassandra_ability/shadow_of_nyx.png",
              descVi: "Thêm hiệu ứng mới cho [Rush Assassination]: Sau khi gây critical hit, nhận [Preparation · Kassandra].\nKhi [Assassination] của một đồng minh được kích hoạt hoặc khi một đồng minh thi triển Ultimate, nhận Adrenaline +1.\nHiệu ứng [Way of Nyx] được cường hóa: Tất cả đồng minh nhận Penetration Rate +24%. Đồng minh [Assassination] nhận thêm Penetration Rate +16%.",
              descEn: "New effect for [Rush Assassination]: After scoring a critical hit, gain [Preparation · Kassandra].\nWhen an allied [Assassination] is triggered or an allied Ultimate is cast, gain Adrenaline +1.\nEnhanced [Way of Nyx]: All allies gain Penetration Rate +24%. [Assassination] allies gain an extra Penetration Rate +16%.",
              descZh: "【急速刺杀】新增效果：暴击后获得【筹备·卡珊德拉】。\n友方触发【刺杀】或释放至终仪式时，获得肾上腺素+1。\n【倪克斯之路】强化：己方全体穿透率+24%，【刺杀】角色额外穿透率+16%。"
            },
            {
              index: 1,
              cost: 2,
              nameEn: "Critical Assassination",
              nameZh: "致命暗杀",
              nameVi: "Critical Assassination",
              icon: "images/kassandra_ability/critical_assassin.png",
              descVi: "Cấp [Assassination] thay cho [Fury of Ares], [Advent of Artemis].\n\n[Falconer's Instinct] không còn cấp [Sparta Kick] hoặc [Rain of Destruction].",
              descEn: "Grants [Assassination] instead of [Fury of Ares] and [Advent of Artemis].\n\n[Falconer's Instinct] no longer grants [Sparta Kick] or [Rain of Destruction].",
              descZh: "使用【刺杀】代替【阿瑞斯的忿怒】、【阿尔忒弥斯之临】。\n\n【驯鹰人的直觉】不再生成【斯巴达踢击】或【毁灭之雨】。"
            },
            {
              index: 2,
              cost: 1,
              nameEn: "Shadow Assassin",
              nameZh: "暗影刺客",
              nameVi: "Shadow Assassin",
              icon: "images/kassandra_ability/shadow_assassin.png",
              descVi: "Khi Kassandra thực hiện một [Assassination], với mỗi 100 điểm Critical Technique mà người tấn công cao hơn mục tiêu, đòn tấn công nhận thêm Final DMG Dealt +1%.\nKhi vào trận, nhận [Way of Nyx]; nếu bản thân đã có [Way of Artemis] hoặc [Way of Ares], thay vào đó nhận Penetration Rate +24%.\n[Way of Nyx]: Hiệu ứng [Force Field]: Tất cả đồng minh nhận ATK +(7% + số stack [Guidance of Three Gods] ×1.4%). Đồng minh [Assassination] nhận thêm ATK +(số stack [Guidance of Three Gods] ×1.4%).",
              descEn: "When Kassandra performs an [Assassination], for every 100 points of Critical Technique the attacker has more than the target, the attack gains Final DMG Dealt +1%.\nWhen entering battle, gain [Way of Nyx]; if already having [Way of Artemis] or [Way of Ares], gain Penetration Rate +24% instead.\n[Way of Nyx]: [Force Field] Effect: All allies gain ATK +(7% + [Guidance of Three Gods] stacks x1.4%). [Assassination] allies gain extra ATK +([Guidance of Three Gods] stacks x1.4%).",
              descZh: "卡珊德拉执行【刺杀】时，攻击者暴击技巧每比目标高100点，攻击造成的最终创伤额外+1%。\n进入战斗时获得【倪克斯之路】；若已有【阿尔忒弥斯之路】或【阿瑞斯之路】，则改为获得穿透率+24%。\n【倪克斯之路】：【术阵】效果：己方全体攻击+(7% + 【三神指引】层数×1.4%)，【刺杀】角色额外攻击+(【三神指引】层数×1.4%)。"
            }
          ]
        }
      ];

      // Calculate total points used
      let usedPoints = 0;
      Object.keys(charKassandraSelections).forEach((tKey) => {
        const idx = charKassandraSelections[tKey];
        if (idx !== null && idx !== undefined) {
          usedPoints += (3 - idx);
        }
      });
      const remainingPoints = Math.max(0, 5 - usedPoints);

      // Determine Primary Tree (highest cost selected, or first 3pt)
      let primaryTreeKey = null;
      let maxCost = 0;
      ["hunter", "warrior", "assassin"].forEach((tKey) => {
        const idx = charKassandraSelections[tKey];
        if (idx !== null && idx !== undefined) {
          const c = 3 - idx;
          if (c > maxCost) {
            maxCost = c;
            primaryTreeKey = tKey;
          }
        }
      });

      // Build 3 Tree Columns HTML
      const treesHtml = abilityTrees
        .map((tree) => {
          const selIdx = charKassandraSelections[tree.key];
          const tName = currentLang === "vi" ? tree.nameVi : (isCn ? tree.nameZh : tree.nameEn);

          const nodesHtml = tree.skills
            .map((sk) => {
              // Trong game (như ảnh 1): sk.index = 0 là Tầng 3 (đỉnh), 1 là Tầng 2 (giữa), 2 là Tầng 1 (đáy)
              // Khi chọn Tầng 3 (selIdx === 0): cả Tầng 1, 2, 3 đều sáng
              // Khi chọn Tầng 2 (selIdx === 1): Tầng 1 và 2 sáng
              // Khi chọn Tầng 1 (selIdx === 2): chỉ Tầng 1 sáng
              const isUnlocked = selIdx !== null && selIdx !== undefined && sk.index >= selIdx;
              const isTargetTier = selIdx === sk.index;
              const skName = currentLang === "vi" ? sk.nameVi : (isCn ? sk.nameZh : sk.nameEn);
              const cost = 3 - sk.index;

              return `
                <button type="button" class="ability-node ability-node-${sk.index + 1} ${isUnlocked ? "active" : ""} ${isTargetTier ? "is-target" : ""}" data-tree="${tree.key}" data-index="${sk.index}">
                  <span class="ability-node-ring"></span>
                  <span class="ability-node-media">
                    <img src="${sk.icon}" alt="${escapeHtml(skName)}" />
                  </span>
                  ${!isUnlocked ? `<span class="ability-node-lock"><img src="images/kassandra_ability/lock_icon.png" alt="" class="ability-lock-img" /></span>` : ""}
                </button>
              `;
            })
            .join("");

          // SVG branch path matching ảnh 1:
          // Segment 1: từ Emblem (90, 264) lên Node 3 (90, 201)
          // Segment 2: từ Node 3 lên Node 2 (hunter: 50, 119; warrior: 90, 119; assassin: 130, 119)
          // Segment 3: từ Node 2 lên Node 1 (90, 37)
          let midX = 90;
          if (tree.key === "hunter") midX = 50;
          else if (tree.key === "assassin") midX = 130;

          // Đường sáng (active lines) tùy theo tầng mở khóa:
          // selIdx === 2 (Tầng 1): sáng đoạn 90,264 -> 90,201
          // selIdx === 1 (Tầng 2): sáng đoạn 90,264 -> 90,201 -> midX, 119
          // selIdx === 0 (Tầng 3): sáng toàn bộ
          let activeSvgPathD = "";
          if (selIdx === 2) {
            activeSvgPathD = "M90 264 L90 201";
          } else if (selIdx === 1) {
            activeSvgPathD = `M90 264 L90 201 L${midX} 119`;
          } else if (selIdx === 0) {
            activeSvgPathD = `M90 264 L90 201 L${midX} 119 L90 37`;
          }

          const fullPathD = `M90 37 L${midX} 119 L90 201 L90 264`;
          const hasUnlocked = selIdx !== null && selIdx !== undefined;

          return `
            <div class="ability-tree ability-tree-${tree.key} ${hasUnlocked ? "has-unlocked" : ""}">
              <div class="ability-tree-path">
                <svg class="ability-tree-lines" viewBox="0 0 180 292" preserveAspectRatio="none" aria-hidden="true">
                  <!-- Đường nền mờ tối -->
                  <path class="tree-line-base" d="${fullPathD}"></path>
                  <!-- Đường sáng khi mở khóa (nằm dưới icon node) -->
                  ${activeSvgPathD ? `<path class="tree-line-active" d="${activeSvgPathD}"></path>` : ""}
                </svg>
                ${nodesHtml}
                <div class="ability-tree-emblem ${hasUnlocked ? "is-active" : ""}">
                  <img src="${tree.icon}" alt="" />
                </div>
              </div>
              <div class="ability-tree-label">
                <span class="tree-label-text">${escapeHtml(tName)}</span>
              </div>
            </div>
          `;
        })
        .join("");

      // Primary Force Field Description based on primaryTreeKey
      let forceFieldTitle = "";
      let forceFieldDesc = "";

      if (primaryTreeKey === "hunter") {
        forceFieldTitle = isCn ? "【阿尔忒弥斯之路】术阵" : (currentLang === "vi" ? "[Way of Artemis] Force Field" : "[Way of Artemis] Force Field");
        const critDmgBonus = "5.4%";
        const critRateBonus = "+15% (+10%)";
        forceFieldDesc = isCn
          ? `【阿尔忒弥斯之路】力场效果：全队暴击创伤 +(27% + 【三神指引】×${critDmgBonus})，【刺杀】角色额外获得相同增益。\n全队暴击率 ${critRateBonus}。友方触发【刺杀】时，额外造成攻击者类型75%的创伤。`
          : (currentLang === "vi"
            ? `Hiệu ứng [Force Field]: Tất cả đồng minh nhận Critical DMG +(27% + số stack [Guidance of Three Gods] ×${critDmgBonus}). Đồng minh [Assassination] nhận thêm Critical DMG +(số stack [Guidance of Three Gods] ×${critDmgBonus}).\nToàn đội nhận Critical Rate ${critRateBonus}. Khi [Assassination] của phe ta kích hoạt, gây thêm 75% DMG cùng loại với người tấn công.`
            : `[Force Field] Effect: All allies gain Critical DMG +(27% + [Guidance of Three Gods] stacks x${critDmgBonus}). [Assassination] allies gain an extra Critical DMG +([Guidance of Three Gods] stacks x${critDmgBonus}).\nAll allies gain Critical Rate ${critRateBonus}. When an allied [Assassination] triggers, deal 75% extra DMG of attacker's type.`);
      } else if (primaryTreeKey === "warrior") {
        forceFieldTitle = isCn ? "【阿瑞斯之路】术阵" : (currentLang === "vi" ? "[Way of Ares] Force Field" : "[Way of Ares] Force Field");
        const dmgBonusVal = "2.8%";
        const incantMightVal = "+18% (+12%)";
        forceFieldDesc = isCn
          ? `【阿瑞斯之路】力场效果：全队创伤加成 +(14% + 【三神指引】×${dmgBonusVal})，【刺杀】角色额外获得相同增益。\n全队术法威力 ${incantMightVal}。主目标每有1种不同【裂伤】，施放额外【斯巴达踢击】。`
          : (currentLang === "vi"
            ? `Hiệu ứng [Force Field]: Tất cả đồng minh nhận DMG Bonus +(14% + số stack [Guidance of Three Gods] ×${dmgBonusVal}). Đồng minh [Assassination] nhận thêm DMG Bonus +(số stack [Guidance of Three Gods] ×${dmgBonusVal}).\nToàn đội nhận Incantation Might ${incantMightVal}. Với mỗi loại [Gash] khác nhau trên mục tiêu chính, thi triển thêm [Sparta Kick].`
            : `[Force Field] Effect: All allies gain DMG Bonus +(14% + [Guidance of Three Gods] stacks x${dmgBonusVal}). [Assassination] allies gain an extra DMG Bonus +([Guidance of Three Gods] stacks x${dmgBonusVal}).\nAll allies gain Incantation Might ${incantMightVal}. For each different [Gash] on main target, cast additional [Sparta Kick].`);
      } else {
        forceFieldTitle = isCn ? "【倪克斯之路】术阵" : (currentLang === "vi" ? "[Way of Nyx] Force Field" : "[Way of Nyx] Force Field");
        const atkBonusVal = "1.4%";
        const penRateVal = "+24% (+16%)";
        forceFieldDesc = isCn
          ? `【倪克斯之路】力场效果：全队攻击 +(7% + 【三神指引】×${atkBonusVal})，【刺杀】角色额外获得相同增益。\n全队穿透率 ${penRateVal}。【急速刺杀】暴击后获得【筹备·卡珊德拉】；友方触发【刺杀】或释放至终仪式时肾上腺素+1。`
          : (currentLang === "vi"
            ? `Hiệu ứng [Force Field]: Tất cả đồng minh nhận ATK +(7% + số stack [Guidance of Three Gods] ×${atkBonusVal}). Đồng minh [Assassination] nhận thêm ATK +(số stack [Guidance of Three Gods] ×${atkBonusVal}).\nToàn đội nhận Penetration Rate ${penRateVal}. [Rush Assassination] bạo kích nhận [Preparation · Kassandra]; đồng minh kích hoạt [Assassination] hoặc Ultimate giúp nhận Adrenaline +1.`
            : `[Force Field] Effect: All allies gain ATK +(7% + [Guidance of Three Gods] stacks x${atkBonusVal}). [Assassination] allies gain an extra ATK +([Guidance of Three Gods] stacks x${atkBonusVal}).\nAll allies gain Penetration Rate ${penRateVal}. [Rush Assassination] crit grants [Preparation · Kassandra]; allied [Assassination] or Ultimate grants Adrenaline +1.`);
      }

      // Selected skills summary
      const activeEffectsList = [];
      abilityTrees.forEach((t) => {
        const sIdx = charKassandraSelections[t.key];
        if (sIdx !== null && sIdx !== undefined) {
          const sk = t.skills.find((s) => s.index === sIdx);
          if (sk) {
            const skTitle = currentLang === "vi" ? `${t.nameVi} — ${sk.nameVi}` : (isCn ? `${t.nameZh} — ${sk.nameZh}` : `${t.nameEn} — ${sk.nameEn}`);
            const skDesc = currentLang === "vi" ? sk.descVi : (isCn ? sk.descZh : sk.descEn);
            const darkIcon = sk.icon.replace("images/kassandra_ability/", "images/kassandra_ability/dark/");
            activeEffectsList.push({ title: skTitle, desc: skDesc, icon: darkIcon });
          }
        }
      });

      const effectsHtml = activeEffectsList
        .map((ef) => `
          <div class="kassandra-effect-item">
            <div class="kassandra-effect-head">
              <img src="${ef.icon}" alt="" class="kassandra-effect-icon" />
              <span class="kassandra-effect-title">${escapeHtml(ef.title)}</span>
            </div>
            <div class="kassandra-effect-body">${formatSkillKeywords(ef.desc)}</div>
          </div>
        `)
        .join("");

      mainBodyHtml = `
        <div class="kassandra-ability-board">
          <div class="kassandra-top-bar">
            <div class="kassandra-points-badge">
              <span class="kassandra-pts-num">${remainingPoints}</span>
              <span class="kassandra-pts-label">${isCn ? "技能点" : (currentLang === "vi" ? "Ability Points" : "Ability Points")}</span>
            </div>

            <button type="button" class="kassandra-reset-btn" id="btn-kassandra-reset">
              ${isCn ? "重置点数" : (currentLang === "vi" ? "Đặt lại" : "Reset")}
            </button>
          </div>

          <div class="kassandra-trees-container">
            ${treesHtml}
          </div>

          ${
            primaryTreeKey
              ? `
                <div class="ezio-weapon-detail-paper">
                  <div class="ezio-effect-section">
                    <div class="ezio-effect-badge is-combo">${escapeHtml(forceFieldTitle)}</div>
                    <div class="ezio-effect-desc">${formatSkillKeywords(forceFieldDesc)}</div>
                  </div>

                  ${effectsHtml ? `<div class="ezio-effect-divider"></div><div class="kassandra-effects-list">${effectsHtml}</div>` : ""}
                </div>
              `
              : `
                <div class="ezio-weapon-detail-paper">
                  <p class="hint" style="margin: 0; color: #5f574f; font-style: italic; text-align: center;">
                    ${isCn ? "请在上方分配能力点数以查看力场与技能效果。" : (currentLang === "vi" ? "Vui lòng phân bổ Ability Points ở trên để xem hiệu ứng Force Field và kỹ năng." : "Please allocate Ability Points above to preview Force Field and ability effects.")}
                  </p>
                </div>
              `
          }
        </div>
      `;
    } else {
      const list = skillInfo.weapons || [];
      if (!list.length) {
        mainBodyHtml = `<p class="hint">No weapon details available.</p>`;
      } else {
        if (charWeaponsSelectedIdx >= list.length) charWeaponsSelectedIdx = 0;
        const currentWeapon = list[charWeaponsSelectedIdx];

        const weaponButtonsHtml = list
          .map((w, idx) => {
            const isSelected = idx === charWeaponsSelectedIdx;
            const wName = isCn ? w.nameZh || w.nameEn : w.nameEn || w.nameZh;
            return `
              <button type="button" class="uttu-weapon-btn ${isSelected ? "is-active" : ""}" data-weapon-idx="${idx}">
                ${escapeHtml(wName)}
              </button>
            `;
          })
          .join("");

        const wTitle = isCn ? currentWeapon.nameZh || currentWeapon.nameEn : currentWeapon.nameEn || currentWeapon.nameZh;
        const wMainDesc = isCn ? currentWeapon.mainDescZh || currentWeapon.mainDescEn : (currentLang === "vi" ? currentWeapon.mainDescVi || currentWeapon.mainDescEn : currentWeapon.mainDescEn || currentWeapon.mainDescZh);

        const combosHtml = (currentWeapon.combos || [])
          .map((c) => {
            const cName = isCn ? c.daggerZh || c.daggerEn : c.daggerEn || c.daggerZh;
            const cDesc = isCn ? c.descZh || c.descEn : (currentLang === "vi" ? c.descVi || c.descEn : c.descEn || c.descZh);
            return `
              <div class="uttu-weapon-combo-card">
                <span class="uttu-weapon-combo-name">${escapeHtml(cName)}</span>
                <div class="uttu-weapon-combo-desc">${formatSkillKeywords(cDesc)}</div>
              </div>
            `;
          })
          .join("");

        mainBodyHtml = `
          <div class="uttu-weapons-board">
            <div class="uttu-weapons-strip">${weaponButtonsHtml}</div>
            <div class="uttu-weapon-detail">
              <h4 class="uttu-weapon-title">${escapeHtml(wTitle)}</h4>
              <div class="uttu-weapon-main-desc">${formatSkillKeywords(wMainDesc)}</div>
              ${combosHtml ? `<div class="uttu-weapon-combos">${combosHtml}</div>` : ""}
            </div>
          </div>
        `;
      }
    }
  } else if (charSkillsActiveTab === "insights") {
    const list = skillInfo.insights || [];
    const insightName = (ins) => {
      if (currentLang === "vi" && ins.nameVi) return ins.nameVi;
      return isCn ? ins.nameZh || ins.nameEn : ins.nameEn || ins.nameZh;
    };
    const roman = ["I", "II", "III", "IV"];
    // The Inheritance name is the Insight I title; Insight II/III only append a numeral
    // to it, so that one title heads the whole board and each row is labelled by level.
    const baseInsight = list.find((ins) => Number(ins.insight) === 1) || list[0];
    const inheritanceName = baseInsight ? insightName(baseInsight) : "";

    const listHtml = list.length
      ? list
          .map((ins) => {
            const insightNo = Math.min(3, Math.max(0, Number(ins.insight) || 0));
            const insLabel =
              insightNo === 0
                ? insightName(ins)
                : `${isCn ? "洞悉" : "Insight"} ${roman[insightNo - 1] || insightNo}`;
            const desc = pickLocalizedDesc(ins);
            const iconSrc = `images/insight_icon_dark/I${insightNo}.png`;
            // Precognition (the pre-Insight badge) and Insight I draw a step smaller
            // than the Insight II/III ones.
            const iconClass =
              insightNo <= 1 ? "uttu-insight-icon is-small" : "uttu-insight-icon";

            return `
              <div class="uttu-insight-row">
                <div class="uttu-insight-badge-col">
                  <img src="${iconSrc}" alt="${escapeHtml(insLabel)}" class="${iconClass}" />
                </div>
                <div class="uttu-insight-content">
                  <div class="uttu-insight-tag">[${escapeHtml(insLabel)}]</div>
                  <div class="uttu-insight-desc">${formatSkillKeywords(desc)}</div>
                </div>
              </div>
            `;
          })
          .join("")
      : `<p class="hint">No insight details available.</p>`;

    mainBodyHtml = `
      <div class="uttu-insights-board">
        ${inheritanceName ? `<div class="uttu-insight-head"><span class="uttu-insight-title">${escapeHtml(inheritanceName)}</span></div>` : ""}
        <div class="uttu-insight-list">
          ${listHtml}
        </div>
      </div>
    `;
  } else if (charSkillsActiveTab === "portrays") {
    const list = skillInfo.portrays || [];
    const listHtml = list.length
      ? list
          .map((port) => {
            const desc = pickLocalizedDesc(port);
            return `
              <div class="uttu-portray-row">
                <span class="uttu-portray-lvl">Lv. <span class="uttu-portray-num">${port.level}</span></span>
                <div class="uttu-portray-desc">${formatSkillKeywords(desc)}</div>
              </div>
            `;
          })
          .join("")
      : `<p class="hint">No portrait details available.</p>`;

    mainBodyHtml = `
      <div class="uttu-portrays-board">
        <div class="uttu-portrays-head">
          <span class="uttu-portrays-title">${isCn ? "塑造信息" : "Portrait Info"}</span>
        </div>
        <div class="uttu-portrays-list">
          ${listHtml}
        </div>
      </div>
    `;
  } else if (charSkillsActiveTab === "euphoria") {
    const list = heroEuphoriaList || [];
    if (!list.length) {
      mainBodyHtml = `<div class="uttu-insights-board"><p class="hint">No euphoria details available.</p></div>`;
    } else {
      const charMats = getCharacterMats(name);
      const kornId = charMats?.kornId || charMats?.id || skillInfo.id;
      const eupCardsHtml = list
        .map((eup, eupIdx) => {
          const title = isCn ? eup.name?.zh || eup.name?.en : eup.name?.en || eup.name?.zh;
          const tags = eup.tags || [];
          const ranks = eup.ranks || [];
          const imgTier = eupIdx + 1;
          const imgPath = kornId ? `images/arcanists/euphoria/${kornId}_${imgTier}.webp` : "";

          const ranksHtml = ranks
            .map((rk) => {
              const rkDesc = currentLang === "vi" && rk.description?.vi
                ? rk.description.vi
                : (isCn ? rk.description?.zh || rk.description?.en : rk.description?.en || rk.description?.zh);
              return `
                <div class="uttu-euphoria-rank-card">
                  <div class="uttu-euphoria-rank-title">Rank ${rk.rank}</div>
                  <div class="uttu-euphoria-rank-desc">${formatSkillKeywords(rkDesc)}</div>
                </div>
              `;
            })
            .join("");

          return `
            <div class="uttu-euphoria-tree-card">
              <div class="uttu-euphoria-tree-header">
                <div class="uttu-euphoria-tree-title-row">
                  <h3 class="uttu-euphoria-tree-title">${escapeHtml(title || "Euphoria")}</h3>
                  <div class="uttu-euphoria-tags">
                    ${tags.map((t) => `<span class="uttu-euphoria-tag">${escapeHtml(t)}</span>`).join("")}
                  </div>
                </div>
              </div>

              <div class="uttu-euphoria-layout">
                ${
                  imgPath
                    ? `<div class="uttu-euphoria-visual-center">
                        <img src="${escapeHtml(imgPath)}" alt="" class="uttu-euphoria-art-img" onerror="this.parentElement.style.display='none'" />
                      </div>`
                    : ""
                }
                <div class="uttu-euphoria-ranks-grid">
                  ${ranksHtml}
                </div>
              </div>
            </div>
          `;
        })
        .join("");

      mainBodyHtml = `
        <div class="uttu-euphoria-board">
          ${eupCardsHtml}
        </div>
      `;
    }
  }

  return `
    <section class="build-section char-skills-section" id="char-skills-section-panel">
      <h4 class="build-section-title">${escapeHtml(t("builds.skillsInsight"))}</h4>
      ${tabsHtml}
      <div class="uttu-skills-container">${mainBodyHtml}</div>
    </section>
  `;
}

function setupCharacterSkillsListeners(host) {
  // Mode tabs (Skills, Insight, Portrait)
  host.querySelectorAll("[data-skill-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      charSkillsActiveTab = btn.dataset.skillTab;
      refreshSkillsPanel();
    });
  });

  // Stance switcher buttons (e.g. Base vs Bendith, Set A vs Set B)
  host.querySelectorAll("[data-skill-stance]").forEach((btn) => {
    btn.addEventListener("click", () => {
      charSkillsActiveStance = btn.dataset.skillStance;
      charSkillSelectedIdx = 0;
      charSkillSelectedRank = 3;
      refreshSkillsPanel();
    });
  });

  // Euphoria switch (E1, E2, …) for cards the tree unlocks
  host.querySelectorAll("[data-skill-euphoria]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const rank = Number(btn.dataset.skillEuphoria);
      if (Number.isNaN(rank)) return;
      charSkillsEuphoriaRank = charSkillsEuphoriaRank === rank ? 0 : rank;
      charSkillSelectedIdx = 0;
      charSkillSelectedRank = 3;
      refreshSkillsPanel();
    });
  });

  // Reinforce switch (Base / Reinforce I…III) — swaps the selected card's text
  host.querySelectorAll("[data-skill-reinforce]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const level = Number(btn.dataset.skillReinforce);
      if (Number.isNaN(level)) return;
      charSkillsReinforceLevel = level;
      refreshSkillsPanel();
    });
  });

  // Card selector in strip
  host.querySelectorAll(".uttu-skill-card-item").forEach((cardEl) => {
    cardEl.addEventListener("click", () => {
      const idx = Number(cardEl.dataset.skillIdx);
      if (!Number.isNaN(idx)) {
        charSkillSelectedIdx = idx;
        charSkillSelectedRank = 3;
        refreshSkillsPanel();
      }
    });
  });

  // Rank selector in detail
  host.querySelectorAll(".uttu-rank-card-col").forEach((colEl) => {
    colEl.addEventListener("click", () => {
      const rk = Number(colEl.dataset.rankNum);
      if (!Number.isNaN(rk)) {
        charSkillSelectedRank = rk;
        refreshSkillsPanel();
      }
    });
  });

  // ★ picker inside an Adaptive card's option panel — one per cast option
  host.querySelectorAll(".uttu-skill-option-rank").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.adaptiveOpt;
      const rk = Number(btn.dataset.rankNum);
      if (!key || Number.isNaN(rk)) return;
      charSkillAdaptiveRanks[key] = rk;
      refreshSkillsPanel();
    });
  });

  // Weapon selector buttons
  host.querySelectorAll(".uttu-weapon-btn").forEach((wBtn) => {
    wBtn.addEventListener("click", () => {
      const idx = Number(wBtn.dataset.weaponIdx);
      if (!Number.isNaN(idx)) {
        charWeaponsSelectedIdx = idx;
        refreshSkillsPanel();
      }
    });
  });

  // Ezio weapon selector cards
  host.querySelectorAll(".ezio-weapon-card.is-primary").forEach((card) => {
    card.addEventListener("click", () => {
      const code = card.dataset.ezioPrimary;
      if (code && charEzioPrimary !== code) {
        charEzioPrimary = code;
        refreshSkillsPanel();
      }
    });
  });

  host.querySelectorAll(".ezio-weapon-card.is-secondary").forEach((card) => {
    card.addEventListener("click", () => {
      const code = card.dataset.ezioSecondary;
      if (code && charEzioSecondary !== code) {
        charEzioSecondary = code;
        refreshSkillsPanel();
      }
    });
  });

  // Kassandra Ability Node click listeners
  host.querySelectorAll(".ability-node").forEach((card) => {
    card.addEventListener("click", () => {
      const tree = card.dataset.tree;
      const idx = Number(card.dataset.index);
      if (tree && !Number.isNaN(idx)) {
        const currentSelected = charKassandraSelections[tree];
        if (currentSelected === idx) {
          // Deselect node to refund points
          charKassandraSelections[tree] = null;
        } else {
          // Check points limit
          const currentCost = currentSelected !== null && currentSelected !== undefined ? (3 - currentSelected) : 0;
          const newCost = 3 - idx;
          let currentUsed = 0;
          Object.keys(charKassandraSelections).forEach((tKey) => {
            const sIdx = charKassandraSelections[tKey];
            if (sIdx !== null && sIdx !== undefined) currentUsed += (3 - sIdx);
          });
          const nextUsed = currentUsed - currentCost + newCost;
          if (nextUsed <= 5) {
            charKassandraSelections[tree] = idx;
          } else {
            // Flash points badge or warn
            const badge = host.querySelector(".kassandra-points-badge");
            if (badge) {
              badge.classList.add("is-error");
              setTimeout(() => badge.classList.remove("is-error"), 400);
            }
            return;
          }
        }
        refreshSkillsPanel();
      }
    });
  });

  // Kassandra Reset button
  const kResetBtn = host.querySelector("#btn-kassandra-reset");
  if (kResetBtn) {
    kResetBtn.addEventListener("click", () => {
      charKassandraSelections = { hunter: null, warrior: null, assassin: null };
      refreshSkillsPanel();
    });
  }

  // Keyword term popover click listeners
  host.querySelectorAll(".skill-kw-bracket, .skill-kw-stat").forEach((kwEl) => {
    kwEl.addEventListener("click", (e) => {
      e.stopPropagation();
      const term = kwEl.dataset.term;
      showTermPopover(kwEl, term, buildsSelected);
    });
  });

  function refreshSkillsPanel() {
    const currentName = buildsSelected;
    const panel = document.getElementById("char-skills-section-panel");
    if (panel) {
      panel.outerHTML = renderCharacterSkillsSection(currentName);
      const newPanel = document.getElementById("char-skills-section-panel");
      if (newPanel) setupCharacterSkillsListeners(newPanel);
    }
  }
}

let creditEntries = [];   // [{ name, url, description }]

function buildCredits(data) {
  const list = data && Array.isArray(data.entries) ? data.entries : [];
  creditEntries = list
    .filter((entry) => entry && (entry.name || entry.description))
    .map((entry) => ({
      name: String(entry.name || ""),
      url: String(entry.url || ""),
      description: String(entry.description || ""),
    }));
  renderCredits();
}

/** Only http(s) links become anchors; anything else is shown as plain text. */
function creditSafeUrl(url) {
  const value = String(url || "").trim();
  return /^https?:\/\//i.test(value) ? value : "";
}

function renderCredits() {
  const host = document.getElementById("credits-list");
  if (!host) return;

  host.innerHTML = creditEntries.length
    ? creditEntries
        .map((entry) => {
          const href = creditSafeUrl(entry.url);
          const name = escapeHtml(entry.name || entry.url || "");
          const title = href
            ? `<a class="credit-name" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${name}</a>`
            : `<span class="credit-name">${name}</span>`;
          return `
            <li class="credit-entry">
              <div class="credit-head">
                <svg class="credit-link-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M10.6 13.4a1 1 0 0 1 0-1.4l3.5-3.5a3 3 0 0 1 4.2 4.2l-1.8 1.8a1 1 0 0 1-1.4-1.4l1.8-1.8a1 1 0 0 0-1.4-1.4l-3.5 3.5a1 1 0 0 1-1.4 0Z" />
                  <path d="M13.4 10.6a1 1 0 0 1 0 1.4l-3.5 3.5a3 3 0 0 1-4.2-4.2l1.8-1.8a1 1 0 0 1 1.4 1.4l-1.8 1.8a1 1 0 0 0 1.4 1.4l3.5-3.5a1 1 0 0 1 1.4 0Z" />
                </svg>
                ${title}
              </div>
              ${entry.description ? `<p class="credit-desc">${escapeHtml(entry.description)}</p>` : ""}
            </li>`;
        })
        .join("")
    : guideEmptyState("credits.empty");
}

function openCreditsModal() {
  renderCredits();
  const modal = document.getElementById("credits-modal");
  if (modal) modal.style.display = "flex";
}

function closeCreditsModal() {
  const modal = document.getElementById("credits-modal");
  if (modal) modal.style.display = "none";
}

function setupCreditsListeners() {
  const trigger = document.getElementById("btn-credits");
  if (trigger) trigger.addEventListener("click", openCreditsModal);

  const modal = document.getElementById("credits-modal");
  if (!modal) return;
  const close = document.getElementById("credits-btn-close");
  if (close) close.addEventListener("click", closeCreditsModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeCreditsModal();
  });
}

/** Skill cards for a character, as `{ skill, icon }`. */
function guideSkillsFor(name) {
  return guideSkills[resolveCharacterName(name)] || [];
}

function guideSkillIcon(name, skill) {
  const hit = guideSkillsFor(name).find((s) => Number(s.skill) === Number(skill));
  return hit ? hit.icon : (characterDb[name] || "");
}

function guideProgressionFor(name) {
  const canonical = resolveCharacterName(name);
  const raw = Array.isArray(guideProgressions[canonical])
    ? guideProgressions[canonical]
    : Array.isArray(guideProgressions[name])
      ? guideProgressions[name]
      : [];

  // Legacy shape: one flat bar list, which is a single chart with no title.
  const isLegacy = raw.every((entry) => entry && typeof entry === "object" && !Array.isArray(entry.bars));
  if (isLegacy) return raw.length ? [{ label: "", bars: raw }] : [];

  return raw
    .filter((chart) => chart && typeof chart === "object")
    .map((chart) => ({
      label: String(chart.label || "").trim(),
      bars: Array.isArray(chart.bars) ? chart.bars.filter(Boolean) : [],
    }))
    .filter((chart) => chart.bars.length);
}

/** Build record for a character, resolved through aliases. */
function getBuild(name) {
  const canonical = resolveCharacterName(name);
  return buildsData[canonical] || buildsData[name] || null;
}

/** Psychube name -> "rarity:id" key. */
function psychubeKeyFromName(name) {
  const wanted = String(name || "").trim().toLowerCase();
  if (!wanted) return "";
  for (const key of Object.keys(psychubeDb)) {
    const chube = psychubeDb[key];
    if (!chube) continue;
    if (String(chube.name || "").toLowerCase() === wanted) return key;
    if (String(chube.nameCn || "").toLowerCase() === wanted) return key;
  }
  return "";
}

function psychubeNameFromName(name) {
  const key = psychubeKeyFromName(name);
  return key && psychubeDb[key] ? psychubeName(key) : name;
}

/** Characters sorted the way the editor lists them: ArcanistMap id descending. */
function guideCharacterNames() {
  return Object.keys(characterDb)
    .sort((a, b) => {
      // Rarity first, then release order (ArcanistMap id descending).
      const rarity = getCharacterRarity(b) - getCharacterRarity(a);
      if (rarity !== 0) return rarity;
      const id = getCharacterReleaseId(b) - getCharacterReleaseId(a);
      return id !== 0 ? id : a.localeCompare(b);
    });
}

/** Copies text, with a textarea fallback for non-secure origins. */
async function guideCopyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

function guideEmptyState(key) {
  return `<div class="guide-empty"><span>${escapeHtml(t(key))}</span></div>`;
}

/**
 * The "nothing here" sign for an empty pane. The text moves into the image's
 * alt attribute, so screen readers and the tooltip still get the message.
 */
function guideEmptySign(key, extraClass = "") {
  return `<div class="guide-empty guide-empty-sign${extraClass ? ` ${extraClass}` : ""}">
    <img src="images/random_icon/empty_sign.png" alt="${escapeHtml(t(key))}" title="${escapeHtml(t(key))}" />
  </div>`;
}

/** The shared "el" section header used across the modals. */
function guideSectionHeader(key, extra) {
  return `<div class="archetype-section-header">
    <span class="archetype-section-title"><span>${escapeHtml(t(key))}</span></span>
    <div class="archetype-section-divider"></div>
    ${extra || ""}
  </div>`;
}

/* ---------------- Character Build Recommendations ---------------- */

let buildsSelected = null;
const buildsRarityFilter = new Set();
const buildsAfflatusFilter = new Set();

/**
 * Phones use a master-detail flow: the modal opens on the list and a pick
 * replaces it with the full detail. Wider layouts keep both panes visible.
 */
const guideStackedMedia = window.matchMedia("(max-width: 768px)");
function guideIsStacked() {
  return guideStackedMedia.matches;
}

/**
 * Shows or hides the character list, so the build can use the full modal.
 * Works at every resolution; the choice is kept while the page is open.
 */
let buildsListVisible = true;

/** Which pane the stacked InfoBook layout shows: "list" or "detail". */
let buildsView = "list";

function openBuildsModal() {
  renderBuilds();
  document.getElementById("builds-modal").style.display = "flex";
  // Remember the list visibility across openings.
  setBuildsListVisible(buildsListVisible);
  // Phones start on the list; a pick opens the detail.
  setBuildsView("list");
}

function closeBuildsModal() {
  const buildsCard = document.querySelector("#builds-modal .builds-modal-card");
  if (buildsCard) buildsCard.classList.remove("is-sotheby-theme");
  document.getElementById("builds-modal").style.display = "none";
}

/** Switches the stacked layout between the list and one detail pane. */
function setBuildsView(view) {
  const detail = view === "detail";
  buildsView = detail ? "detail" : "list";
  const body = document.querySelector("#builds-modal .builds-body");
  if (body) body.classList.toggle("is-detail", detail);

  const back = document.getElementById("builds-back");
  if (back) back.hidden = !(detail && guideIsStacked());
}

/** Opens the picked entry's detail on phones; wide layouts already show it. */
function showBuildsDetail() {
  if (guideIsStacked()) setBuildsView("detail");
}

function setBuildsListVisible(visible) {
  buildsListVisible = !!visible;
  const body = document.querySelector("#builds-modal .builds-body");
  // The stacked layout drives its own panes, so the desktop toggle is ignored there.
  if (body) body.classList.toggle("is-list-hidden", !buildsListVisible && !guideIsStacked());

  const toggle = document.getElementById("builds-rail-toggle");
  if (toggle) toggle.setAttribute("aria-pressed", String(buildsListVisible));
  syncBuildsToggleLabel();
}

/** The button label follows the current state (and the current language). */
function syncBuildsToggleLabel() {
  const label = document.querySelector("#builds-rail-toggle [data-i18n]");
  if (!label) return;
  const key = buildsListVisible ? "builds.toggleList" : "builds.showList";
  label.setAttribute("data-i18n", key);
  label.textContent = t(key);
}

function buildsVisibleNames() {
  const input = document.getElementById("builds-search");
  const query = (input ? input.value : "").trim();
  return guideCharacterNames().filter((name) => {
    if (!characterMatchesQuery(name, query)) return false;
    if (buildsRarityFilter.size > 0 && !buildsRarityFilter.has(getCharacterRarity(name))) return false;
    if (buildsAfflatusFilter.size > 0 && !buildsAfflatusFilter.has(guideAfflatusKey(getCharacterAfflatus(name)))) return false;
    return true;
  });
}

/** Whether a character has anything recorded to show in InfoBook. */
function characterHasBuild(name) {
  const build = getBuild(name) || {};
  const resonance = build.resonance && typeof build.resonance === "object" ? build.resonance : {};
  return !!(
    (Array.isArray(build.psychubes) && build.psychubes.length) ||
    Object.keys(resonance).length ||
    build.pattern ||
    build.notes ||
    guideProgressionFor(name).length
  );
}

function renderBuilds() {
  const rarityGroup = document.getElementById("builds-rarity-group");
  const afflatusGroup = document.getElementById("builds-afflatus-group");
  const searchInput = document.getElementById("builds-search");

  if (infoBookActiveTab === "glossary") {
    if (rarityGroup) rarityGroup.style.display = "none";
    if (afflatusGroup) afflatusGroup.style.display = "none";
    if (searchInput) {
      searchInput.placeholder = t("builds.searchGlossary") || "Search Glossary";
    }
    renderGlossaryRail();
    return;
  }

  if (infoBookActiveTab === "psychubes") {
    if (rarityGroup) rarityGroup.style.display = "none";
    if (afflatusGroup) afflatusGroup.style.display = "none";
    if (searchInput) searchInput.placeholder = t("builds.searchPsychubes") || "Search Psychubes";
    renderPsychubesRail();
    return;
  }

  if (infoBookActiveTab === "codes") {
    if (rarityGroup) rarityGroup.style.display = "none";
    if (afflatusGroup) afflatusGroup.style.display = "none";
    if (searchInput) searchInput.placeholder = t("codes.search") || "Search codes";
    renderCodesRail();
    return;
  }

  if (infoBookActiveTab === "items") {
    if (rarityGroup) rarityGroup.style.display = "none";
    if (afflatusGroup) afflatusGroup.style.display = "none";
    if (searchInput) searchInput.placeholder = t("builds.searchItems") || "Search Items";
    renderItemsRail();
    return;
  }

  if (rarityGroup) rarityGroup.style.display = "";
  if (afflatusGroup) afflatusGroup.style.display = "";
  if (searchInput) searchInput.placeholder = t("toolbar.search") || "Search Characters";

  const names = buildsVisibleNames();
  const list = document.getElementById("builds-list");
  const count = document.getElementById("builds-count");
  if (!list) return;

  if (count) count.textContent = t("builds.count", { n: names.length });

  // Keep the current selection; only fall back when it is filtered out. The
  // whole roster is listed now, so prefer a character with a full build.
  if (!buildsSelected || !names.includes(buildsSelected)) {
    buildsSelected = names.find((name) => getBuild(name)) || names.find(characterHasBuild) || names[0] || null;
  }

  list.innerHTML = names.length
    ? names
        .map((name) => {
          const stars = Math.max(0, Number(getCharacterRarity(name)) || 0);
          return `
            <button type="button" class="builds-row${name === buildsSelected ? " is-active" : ""}" data-name="${escapeHtml(name)}">
              <span class="builds-row-portrait"><img src="${escapeHtml(characterDb[name] || "")}" alt="" loading="lazy" /></span>
              <span class="builds-row-text">
                <span class="builds-row-name">${escapeHtml(displayCharName(name))}</span>
                <span class="builds-row-stars" style="color:${rarityColor(stars)}">${"✦".repeat(stars)}</span>
              </span>
            </button>`;
        })
        .join("")
    : guideEmptyState("builds.noData");

  list.querySelectorAll(".builds-row").forEach((row) => {
    row.addEventListener("click", () => {
      if (buildsSelected !== row.dataset.name) {
        buildsSelected = row.dataset.name;
        // If current tab is weapons/ability or euphoria and not available for new character, reset to skills
        const nextSkillInfo = getCharacterSkillsInfo(buildsSelected);
        const hasNextWeapons = Array.isArray(nextSkillInfo?.weapons) && nextSkillInfo.weapons.length > 0;
        const nextCanonical = resolveCharacterName(buildsSelected);
        const nextEuphoriaList = characterEuphoriasData[buildsSelected] || characterEuphoriasData[nextCanonical] || null;
        const hasNextEuphoria = Array.isArray(nextEuphoriaList) && nextEuphoriaList.length > 0;

        if (charSkillsActiveTab === "weapons" && !hasNextWeapons) {
          charSkillsActiveTab = "skills";
        }
        if (charSkillsActiveTab === "euphoria" && !hasNextEuphoria) {
          charSkillsActiveTab = "skills";
        }
      }
      renderBuilds();
      showBuildsDetail();
    });
  });

  const active = list.querySelector(".builds-row.is-active");
  if (active && list.scrollHeight > list.clientHeight) {
    const top = active.offsetTop;
    if (top < list.scrollTop || top + active.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = Math.max(0, top - list.clientHeight / 2);
    }
  }

  renderBuildsDetail();
}

function renderItemsRail() {
  const list = document.getElementById("builds-list");
  const count = document.getElementById("builds-count");
  if (!list) return;

  const searchInput = document.getElementById("builds-search");
  const query = (searchInput ? searchInput.value : "").trim().toLowerCase();

  const filtered = itemsData.filter((it) => {
    if (!query) return true;
    return (
      it.name.toLowerCase().includes(query) ||
      (it.nameZh && it.nameZh.includes(query)) ||
      (it.nameVi && it.nameVi.toLowerCase().includes(query))
    );
  });

  if (count) count.textContent = `${filtered.length} items`;

  if (!selectedItemId || !filtered.some((it) => it.id === selectedItemId)) {
    selectedItemId = filtered[0] ? filtered[0].id : null;
  }

  list.innerHTML = filtered.length
    ? `<div class="items-grid-container">
        ${filtered.map((item) => renderItemStickerHtml(item, null, item.id === selectedItemId ? "is-active" : "")).join("")}
       </div>`
    : guideEmptyState("builds.noData");

  list.querySelectorAll(".item-sticker").forEach((el) => {
    el.addEventListener("click", () => {
      selectedItemId = Number(el.dataset.itemId);
      renderItemsRail();
      showBuildsDetail();
    });
  });

  renderItemDetail();
}

function renderItemDetail() {
  const host = document.getElementById("builds-detail");
  if (!host) return;

  const item = itemsData.find((it) => it.id === selectedItemId);
  if (!item) {
    host.innerHTML = guideEmptyState("builds.select");
    return;
  }

  const isCn = currentLang === "cn";
  const isVi = currentLang === "vi";
  const displayName = isVi && item.nameVi ? item.nameVi : (isCn && item.nameZh ? item.nameZh : item.name);
  const displayCategory = isVi && item.categoryVi ? item.categoryVi : (isCn && item.categoryZh ? item.categoryZh : item.category);
  const displayDesc = isVi && item.descriptionVi ? item.descriptionVi : item.description;
  const displayUsage = isVi && item.usageVi ? item.usageVi : item.usage;
  const displaySource = isVi && item.sourceVi ? item.sourceVi : item.source;

  // Formula craft items (Wishing Spring)
  const formula = itemFormulasData[item.id];
  const formulaHtml = formula && formula.length
    ? `<div class="build-section" style="margin-top: 16px;">
        <h4 class="build-section-title">${isVi ? "Công thức Chế tạo (Suối Ước)" : (isCn ? "不绝瀑流配方" : "Wishing Spring Formula")}</h4>
        <div class="mats-result-grid">
          ${formula.map((m) => renderItemStickerHtml(m.material, m.quantity)).join("")}
        </div>
       </div>`
    : "";

  const iconSrc = item.icon || "";
  const borderSrc = item.border || "";

  host.innerHTML = `
    <div class="material-detail-card">
      <div class="material-detail-hero">
        <div class="material-detail-icon-wrap">
          ${borderSrc ? `<img src="${escapeHtml(borderSrc)}" alt="" class="item-sticker-border" />` : ""}
          ${iconSrc ? `<img src="${escapeHtml(iconSrc)}" alt="" class="item-sticker-img" />` : ""}
        </div>
        <div class="material-detail-info">
          <h3 class="material-detail-name">${escapeHtml(displayName)}</h3>
          <span class="material-detail-stars" style="font-size: 0.72rem; color: #ED7D31; font-weight: 700;">${"✦".repeat(item.rarity || 1)}</span>
          ${displayCategory ? `<span class="flag" style="width: max-content;">${escapeHtml(displayCategory)}</span>` : ""}
          ${displayDesc ? `<p class="material-detail-desc">${escapeHtml(displayDesc)}</p>` : ""}
          ${displayUsage ? `<p class="material-detail-usage"><strong>${isVi ? "Công dụng:" : (isCn ? "用途:" : "Usage:")}</strong> ${escapeHtml(displayUsage)}</p>` : ""}
          ${displaySource ? `<span class="material-detail-source"><strong>${isVi ? "Nguồn thu thập:" : (isCn ? "来源:" : "Source:")}</strong> ${escapeHtml(displaySource)}</span>` : ""}
        </div>
      </div>
      ${formulaHtml}
    </div>
  `;
}

// ----------------- PSYCHUBES IN INFOBOOK -----------------
const PSYCHUBE_ATTR_RATES = {
  1: 150, 2: 159, 3: 168, 4: 177, 5: 186, 6: 195, 7: 204, 8: 213, 9: 222, 10: 230,
  11: 239, 12: 248, 13: 257, 14: 266, 15: 275, 16: 284, 17: 293, 18: 302, 19: 311, 20: 320,
  21: 333, 22: 346, 23: 359, 24: 372, 25: 385, 26: 398, 27: 411, 28: 424, 29: 437, 30: 450,
  31: 463, 32: 476, 33: 489, 34: 502, 35: 515, 36: 528, 37: 541, 38: 554, 39: 567, 40: 580,
  41: 601, 42: 622, 43: 643, 44: 664, 45: 685, 46: 706, 47: 727, 48: 748, 49: 769, 50: 790,
  51: 811, 52: 832, 53: 853, 54: 874, 55: 895, 56: 916, 57: 937, 58: 958, 59: 979, 60: 1000,
};

function getSortedPsychubeKeys() {
  const keys = Object.keys(psychubesDetailedData);
  return keys.sort((a, b) => {
    const pa = psychubesDetailedData[a];
    const pb = psychubesDetailedData[b];
    if (pa.rarity !== pb.rarity) return pb.rarity - pa.rarity;
    return Number(pb.id) - Number(pa.id);
  });
}

function renderPsychubesRail() {
  const list = document.getElementById("builds-list");
  const count = document.getElementById("builds-count");
  if (!list) return;

  const searchInput = document.getElementById("builds-search");
  const query = (searchInput ? searchInput.value : "").trim().toLowerCase();

  const allKeys = getSortedPsychubeKeys();
  const filtered = allKeys.filter((key) => {
    const p = psychubesDetailedData[key];
    if (!query) return true;
    return (
      (p.name && p.name.toLowerCase().includes(query)) ||
      (p.nameCN && p.nameCN.toLowerCase().includes(query)) ||
      String(p.id).includes(query)
    );
  });

  if (count) count.textContent = `${filtered.length} psychubes`;

  if (!selectedPsychubeKey || !filtered.includes(selectedPsychubeKey)) {
    selectedPsychubeKey = filtered[0] || null;
  }

  list.innerHTML = filtered.length
    ? filtered
        .map((key) => {
          const p = psychubesDetailedData[key];
          const isCn = currentLang === "cn";
          const title = isCn && p.nameCN ? p.nameCN : p.name;
          const stars = p.rarity;
          const iconUrl = p.icon;
          return `
            <button type="button" class="builds-row${key === selectedPsychubeKey ? " is-active" : ""}" data-chube-key="${escapeHtml(key)}">
              <span class="builds-row-portrait"><img src="${escapeHtml(iconUrl)}" alt="" loading="lazy" /></span>
              <span class="builds-row-text">
                <span class="builds-row-name">${escapeHtml(title)}</span>
                <span class="builds-row-stars" style="color:${rarityColor(stars)}">${"✦".repeat(stars)}</span>
              </span>
            </button>`;
        })
        .join("")
    : guideEmptyState("builds.noData");

  list.querySelectorAll(".builds-row").forEach((row) => {
    row.addEventListener("click", () => {
      selectedPsychubeKey = row.dataset.chubeKey;
      renderPsychubesRail();
      showBuildsDetail();
    });
  });

  renderPsychubeDetail();
}

function getBreakLevelForLvl(lvl) {
  if (lvl <= 20) return 0;
  if (lvl <= 40) return 1;
  if (lvl <= 50) return 2;
  return 3;
}

function calculatePsychubeStats(p, lvl) {
  const rate = (PSYCHUBE_ATTR_RATES[lvl] || 1000) / 1000;
  const base = p.baseStats || { atk: 380, hp: 2800, def: 160, mdef: 160 };
  const breakLevel = getBreakLevelForLvl(lvl);

  const curAtk = Math.round(base.atk * rate);
  const curHp = Math.round(base.hp * rate);
  const curDef = Math.round(base.def * rate);
  const curMdef = Math.round(base.mdef * rate);

  // Special stat from breakAttrs
  const bAttrs = p.breakAttrs || [];
  const bAttr = bAttrs.find((b) => b.breakLevel === breakLevel) || bAttrs[bAttrs.length - 1] || {};

  const specialStats = [];
  const isCn = currentLang === "cn";
  if (bAttr.attack) specialStats.push({ name: isCn ? "攻击" : "ATK", val: `${(bAttr.attack / 10).toFixed(0)}%` });
  if (bAttr.cri) specialStats.push({ name: isCn ? "暴击率" : "Crit Rate", val: `${(bAttr.cri / 10).toFixed(0)}%` });
  if (bAttr.criDmg) specialStats.push({ name: isCn ? "暴击创伤" : "Crit DMG", val: `${(bAttr.criDmg / 10).toFixed(0)}%` });
  if (bAttr.heal) specialStats.push({ name: isCn ? "治疗率" : "Healing Done", val: `${(bAttr.heal / 10).toFixed(0)}%` });
  if (bAttr.clutch) specialStats.push({ name: isCn ? "仪式威力" : "Ultimate Might", val: `${(bAttr.clutch / 10).toFixed(0)}%` });
  if (bAttr.normalSkillRate) specialStats.push({ name: isCn ? "术法威力" : "Incantation Might", val: `${(bAttr.normalSkillRate / 10).toFixed(0)}%` });
  if (bAttr.addDmg) specialStats.push({ name: isCn ? "创伤加成" : "DMG Dealt", val: `${(bAttr.addDmg / 10).toFixed(0)}%` });
  if (bAttr.dropDmg) specialStats.push({ name: isCn ? "受创减免" : "DMG Taken Reduction", val: `${(bAttr.dropDmg / 10).toFixed(0)}%` });

  return {
    atk: curAtk,
    hp: curHp,
    def: curDef,
    mdef: curMdef,
    specialStats,
  };
}

function renderPsychubeDetail() {
  const host = document.getElementById("builds-detail");
  if (!host) return;

  const key = selectedPsychubeKey;
  const p = psychubesDetailedData[key];
  if (!p) {
    host.innerHTML = guideEmptyState("builds.select");
    return;
  }

  const isCn = currentLang === "cn";
  const displayName = isCn && p.nameCN ? p.nameCN : p.name;
  const desc = pickLocalizedDesc(p);

  const stats = calculatePsychubeStats(p, psychubeDetailLevel);

  // Amplification description
  const amps = p.amplifications || [];
  const ampObj = amps.find((a) => a.level === psychubeDetailAmp) || amps[0] || {};
  let ampDesc = pickLocalizedDesc(ampObj) || "No description";
  ampDesc = formatSkillKeywords(ampDesc.replace(/\{(\d+(?:\.\d+)?%?)\}/g, "$1"));

  // Level upgrade materials breakdown (Lv20, Lv40, Lv50)
  const is6Star = p.rarity === 6;
  const matsBreakdownHtml = `
    <div class="psychube-mats-breakdown">
      <h4 class="build-section-title">${escapeHtml(t("builds.breakMats"))}</h4>
      <div class="psychube-break-tiers-grid">
        <div class="psychube-break-tier">
          <span class="psychube-break-title">Lv. 20</span>
          <div class="psychube-break-mats">
            ${renderItemStickerHtml("LF Polarization", is6Star ? 5 : 4)}
            ${renderItemStickerHtml("Sharpodonty", is6Star ? 10000 : 7500)}
          </div>
        </div>
        <div class="psychube-break-tier">
          <span class="psychube-break-title">Lv. 40</span>
          <div class="psychube-break-mats">
            ${renderItemStickerHtml("MF Polarization", is6Star ? 5 : 4)}
            ${renderItemStickerHtml("Sharpodonty", is6Star ? 15000 : 11250)}
          </div>
        </div>
        <div class="psychube-break-tier">
          <span class="psychube-break-title">Lv. 50</span>
          <div class="psychube-break-mats">
            ${renderItemStickerHtml("HF Polarization", is6Star ? 5 : 4)}
            ${renderItemStickerHtml("Sharpodonty", is6Star ? 25000 : 18750)}
          </div>
        </div>
      </div>
    </div>
  `;

  host.innerHTML = `
    <div class="psychube-detail-card">
      <div class="psychube-detail-hero">
        <div class="psychube-detail-icon-wrap">
          <img src="${escapeHtml(psychubeDetailArt(p))}" alt="${escapeHtml(displayName)}" class="psychube-detail-img" />
        </div>
        <div class="psychube-detail-info">
          <h3 class="psychube-detail-name">${escapeHtml(displayName)}</h3>
          <span class="psychube-detail-stars" style="font-size: 0.76rem; color: ${rarityColor(p.rarity)}; font-weight: 700;">${"✦".repeat(p.rarity)}</span>
          <div class="psychube-detail-tags">
            ${(p.tags || []).map((t) => `<span class="flag">${escapeHtml(t)}</span>`).join(" ")}
            ${p.releasePatch ? `<span class="flag" style="opacity: 0.8;">v${escapeHtml(p.releasePatch)}</span>` : ""}
          </div>
          ${desc ? `<p class="psychube-detail-desc">${escapeHtml(desc)}</p>` : ""}
        </div>
      </div>

      <!-- Level & Amplification Interactive Controls -->
      <div class="psychube-interactive-box">
        <div class="psychube-interactive-row">
          <div class="psychube-level-input-wrap">
            <span class="char-mats-sublabel">${isCn ? "等级" : "Level"}:</span>
            <input type="range" min="1" max="60" value="${psychubeDetailLevel}" class="custom-slider psychube-level-slider" id="chube-detail-lvl-slider" />
            <span class="psychube-level-number" id="chube-detail-lvl-text">Lv.${psychubeDetailLevel}</span>
          </div>

          <div style="display: flex; align-items: center; gap: 8px; margin-left: auto;">
            <span class="char-mats-sublabel">${isCn ? "增幅" : "Amplify"}:</span>
            <div class="psychube-amp-boxes">
              ${[1, 2, 3, 4, 5]
                .map(
                  (a) =>
                    `<button type="button" class="psychube-amp-btn ${psychubeDetailAmp === a ? "is-active" : ""}" data-amp-val="${a}">${a}</button>`
                )
                .join("")}
            </div>
          </div>
        </div>

        <!-- Dynamic stats -->
        <div class="psychube-stats-grid" id="chube-detail-stats-grid">
          <div class="psychube-stat-item">
            <span class="psychube-stat-name">${isCn ? "攻击" : "ATK"}</span>
            <span class="psychube-stat-val">${stats.atk}</span>
          </div>
          <div class="psychube-stat-item">
            <span class="psychube-stat-name">${isCn ? "生命" : "HP"}</span>
            <span class="psychube-stat-val">${stats.hp}</span>
          </div>
          <div class="psychube-stat-item">
            <span class="psychube-stat-name">${isCn ? "现实防御" : "Reality DEF"}</span>
            <span class="psychube-stat-val">${stats.def}</span>
          </div>
          <div class="psychube-stat-item">
            <span class="psychube-stat-name">${isCn ? "精神防御" : "Mental DEF"}</span>
            <span class="psychube-stat-val">${stats.mdef}</span>
          </div>
          ${stats.specialStats
            .map(
              (sp) => `
            <div class="psychube-stat-item">
              <span class="psychube-stat-name">${escapeHtml(sp.name)}</span>
              <span class="psychube-stat-val" style="color: #ED7D31;">${escapeHtml(sp.val)}</span>
            </div>`
            )
            .join("")}
        </div>

        <!-- Dynamic amplification text -->
        <div class="psychube-amp-desc-box" id="chube-detail-amp-box">
          ${ampDesc}
        </div>
      </div>

      ${matsBreakdownHtml}
    </div>
  `;

  // Attach event listeners for interactive slider and amplify buttons
  const lvlSlider = host.querySelector("#chube-detail-lvl-slider");
  if (lvlSlider) {
    lvlSlider.addEventListener("input", (e) => {
      psychubeDetailLevel = Number(e.target.value);
      const lvlText = host.querySelector("#chube-detail-lvl-text");
      if (lvlText) lvlText.textContent = `Lv.${psychubeDetailLevel}`;

      const newStats = calculatePsychubeStats(p, psychubeDetailLevel);
      const grid = host.querySelector("#chube-detail-stats-grid");
      if (grid) {
        grid.innerHTML = `
          <div class="psychube-stat-item">
            <span class="psychube-stat-name">${isCn ? "攻击" : "ATK"}</span>
            <span class="psychube-stat-val">${newStats.atk}</span>
          </div>
          <div class="psychube-stat-item">
            <span class="psychube-stat-name">${isCn ? "生命" : "HP"}</span>
            <span class="psychube-stat-val">${newStats.hp}</span>
          </div>
          <div class="psychube-stat-item">
            <span class="psychube-stat-name">${isCn ? "现实防御" : "Reality DEF"}</span>
            <span class="psychube-stat-val">${newStats.def}</span>
          </div>
          <div class="psychube-stat-item">
            <span class="psychube-stat-name">${isCn ? "精神防御" : "Mental DEF"}</span>
            <span class="psychube-stat-val">${newStats.mdef}</span>
          </div>
          ${newStats.specialStats
            .map(
              (sp) => `
            <div class="psychube-stat-item">
              <span class="psychube-stat-name">${escapeHtml(sp.name)}</span>
              <span class="psychube-stat-val" style="color: #ED7D31;">${escapeHtml(sp.val)}</span>
            </div>`
            )
            .join("")}
        `;
      }
    });
  }

  host.querySelectorAll(".psychube-amp-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      psychubeDetailAmp = Number(btn.dataset.ampVal);
      host.querySelectorAll(".psychube-amp-btn").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");

      const amps = p.amplifications || [];
      const curAmp = amps.find((a) => a.level === psychubeDetailAmp) || amps[0] || {};
      let curDesc = pickLocalizedDesc(curAmp) || "No description";
      curDesc = formatSkillKeywords(curDesc.replace(/\{(\d+(?:\.\d+)?%?)\}/g, "$1"));

      const ampBox = host.querySelector("#chube-detail-amp-box");
      if (ampBox) {
        ampBox.innerHTML = curDesc;
        bindPsychubeTerms();
      }
    });
  });

  function bindPsychubeTerms() {
    host.querySelectorAll(".skill-kw-bracket, .skill-kw-stat").forEach((kwEl) => {
      kwEl.addEventListener("click", (e) => {
        e.stopPropagation();
        showTermPopover(kwEl, kwEl.dataset.term, null);
      });
    });
  }

  bindPsychubeTerms();
}

// ----------------- GLOSSARY IN INFOBOOK -----------------
function getSortedGlossaryList() {
  const map = new Map();
  for (const [k, v] of Object.entries(skillGlossaryData || {})) {
    const key = (v.nameEn || k).trim();
    const lower = key.toLowerCase();
    if (!map.has(lower)) {
      map.set(lower, { ...v, _key: lower });
    }
  }
  return Array.from(map.values()).sort((a, b) => (a.nameEn || "").localeCompare(b.nameEn || ""));
}

function renderGlossaryRail() {
  const list = document.getElementById("builds-list");
  const count = document.getElementById("builds-count");
  if (!list) return;

  const searchInput = document.getElementById("builds-search");
  const query = (searchInput ? searchInput.value : "").trim().toLowerCase();

  const allTerms = getSortedGlossaryList();
  const filtered = allTerms.filter((item) => {
    if (!query) return true;
    return (
      (item.nameEn && item.nameEn.toLowerCase().includes(query)) ||
      (item.nameZh && item.nameZh.toLowerCase().includes(query)) ||
      (item.descEn && item.descEn.toLowerCase().includes(query)) ||
      (item.descZh && item.descZh.toLowerCase().includes(query))
    );
  });

  if (count) count.textContent = `${filtered.length} terms`;

  if (!selectedGlossaryKey || !filtered.some((t) => t._key === selectedGlossaryKey)) {
    selectedGlossaryKey = filtered[0] ? filtered[0]._key : null;
  }

  list.innerHTML = filtered.length
    ? filtered
        .map((term) => {
          const isCn = currentLang === "cn";
          const title = isCn && term.nameZh ? term.nameZh : term.nameEn;
          const tag = isCn && term.tagZh ? term.tagZh : term.tagEn;
          return `
            <button type="button" class="glossary-row${term._key === selectedGlossaryKey ? " is-active" : ""}" data-glossary-key="${escapeHtml(term._key)}">
              <span class="glossary-row-title">${escapeHtml(title)}</span>
              ${tag ? `<span class="glossary-row-tag">${escapeHtml(tag)}</span>` : ""}
            </button>`;
        })
        .join("")
    : guideEmptyState("builds.noData");

  list.querySelectorAll(".glossary-row").forEach((row) => {
    row.addEventListener("click", () => {
      selectedGlossaryKey = row.dataset.glossaryKey;
      renderGlossaryRail();
      showBuildsDetail();
    });
  });

  renderGlossaryDetail();
}

function renderGlossaryDetail() {
  const host = document.getElementById("builds-detail");
  if (!host) return;

  const allTerms = getSortedGlossaryList();
  const term = allTerms.find((t) => t._key === selectedGlossaryKey);
  if (!term) {
    host.innerHTML = guideEmptyState("builds.select");
    return;
  }

  const isCn = currentLang === "cn";
  const title = isCn && term.nameZh ? term.nameZh : term.nameEn;
  const tag = isCn && term.tagZh ? term.tagZh : term.tagEn;
  const desc = pickLocalizedDesc(term);

  host.innerHTML = `
    <div class="glossary-detail-card">
      <div class="glossary-detail-head">
        <div>
          <h3 class="glossary-detail-title">${escapeHtml(title)}</h3>
          ${!isCn && term.nameZh ? `<span style="font-size: 0.82rem; color: #8f8a83; margin-top: 4px; display: block;">${escapeHtml(term.nameZh)}</span>` : ""}
          ${isCn && term.nameEn ? `<span style="font-size: 0.82rem; color: #8f8a83; margin-top: 4px; display: block;">${escapeHtml(term.nameEn)}</span>` : ""}
        </div>
        ${tag ? `<span class="glossary-detail-tag">${escapeHtml(tag)}</span>` : ""}
      </div>
      <div class="glossary-detail-body">${formatSkillKeywords(desc)}</div>
    </div>
  `;

  host.querySelectorAll(".skill-kw-bracket, .skill-kw-stat").forEach((kwEl) => {
    kwEl.addEventListener("click", (e) => {
      e.stopPropagation();
      showTermPopover(kwEl, kwEl.dataset.term, null);
    });
  });
}

/* ---------------- InfoBook: promotional codes ---------------- */

let promoCodeData = null;
let promoCodeStatus = "idle"; // idle | loading | ready | error
let promoCodeSelected = null;
let promoCodeError = "";
let promoCodesPromise = null;

/** `permanent` and `current` flattened into one list, each row tagged. */
function promoCodeEntries() {
  if (!promoCodeData) return [];
  const rows = [];
  (promoCodeData.permanent || []).forEach((entry) => rows.push({ ...entry, permanent: true }));
  (promoCodeData.current || []).forEach((entry) => rows.push({ ...entry, permanent: false }));
  return rows;
}

function promoCodeDate(iso) {
  if (!iso) return "";
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  const locale = currentLang === "cn" ? "zh-CN" : currentLang === "vi" ? "vi-VN" : "en-US";
  try {
    return date.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
  } catch {
    return iso;
  }
}

/** Badge text + tone for one row. Never hides a code on an unreadable date. */
function promoExpiryBadge(entry) {
  if (entry.permanent) return { label: t("codes.permanent"), kind: "permanent" };
  const expires = entry.expires;
  if (!expires) return { label: t("codes.expiresUncertain"), kind: "unknown" };
  if (expires.uncertain || !expires.iso) {
    return { label: `${t("codes.expiresUncertain")} (${expires.raw})`, kind: "unknown" };
  }
  const today = new Date().toISOString().slice(0, 10);
  return {
    label: t("codes.expires", { date: promoCodeDate(expires.iso) || expires.raw }),
    kind: expires.iso < today ? "expired" : "date",
  };
}

function fetchJsonWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } })
    .then((res) => {
      if (!res.ok) throw new Error(`${url} responded ${res.status}`);
      return res.json();
    })
    .finally(() => clearTimeout(timer));
}

/**
 * Loads the code list once. `/api/codes` is the live Vercel function; when it
 * is missing (a plain `python serve.py` has no functions) or the wiki is down,
 * the committed snapshot under `data/` answers instead.
 */
function ensurePromoCodes() {
  if (promoCodeStatus === "ready" && promoCodeData) return Promise.resolve(promoCodeData);
  if (promoCodeStatus === "loading" && promoCodesPromise) return promoCodesPromise;

  promoCodeStatus = "loading";
  promoCodeError = "";
  promoCodesPromise = (async () => {
    let data = null;
    let error = null;
    try {
      data = await fetchJsonWithTimeout("/api/codes", 9000);
    } catch (err) {
      error = err;
    }
    const valid = data && (Array.isArray(data.permanent) || Array.isArray(data.current));
    if (!valid) {
      try {
        const snapshot = await fetchJsonWithTimeout("data/promo_codes.json", 9000);
        if (snapshot && (Array.isArray(snapshot.permanent) || Array.isArray(snapshot.current))) {
          data = snapshot;
        }
      } catch (err) {
        error = error || err;
      }
    }

    if (data && (Array.isArray(data.permanent) || Array.isArray(data.current))) {
      promoCodeData = data;
      promoCodeStatus = "ready";
      const entries = promoCodeEntries();
      if (!promoCodeSelected || !entries.some((entry) => entry.code === promoCodeSelected)) {
        promoCodeSelected = entries[0] ? entries[0].code : null;
      }
      return promoCodeData;
    }

    promoCodeStatus = "error";
    promoCodeError = String((error && error.message) || error || "unknown error");
    console.warn("Could not load promotional codes", error);
    return null;
  })();

  return promoCodesPromise;
}

function renderCodesRail() {
  const list = document.getElementById("builds-list");
  const count = document.getElementById("builds-count");
  if (!list) return;

  if (promoCodeStatus === "idle") {
    ensurePromoCodes().then(() => {
      if (infoBookActiveTab === "codes") renderBuilds();
    });
  }

  if (promoCodeStatus === "loading") {
    if (count) count.textContent = "";
    list.innerHTML = guideEmptyState("codes.loading");
    renderCodesDetail();
    return;
  }

  if (promoCodeStatus === "error") {
    if (count) count.textContent = "";
    list.innerHTML = guideEmptyState("codes.error");
    renderCodesDetail();
    return;
  }

  const searchInput = document.getElementById("builds-search");
  const query = (searchInput ? searchInput.value : "").trim().toLowerCase();
  const entries = promoCodeEntries().filter((entry) => {
    if (!query) return true;
    return (
      entry.code.toLowerCase().includes(query) ||
      (entry.rewards || []).some((reward) => String(reward.name || "").toLowerCase().includes(query))
    );
  });

  if (count) count.textContent = t("codes.count", { n: entries.length });

  if (!promoCodeSelected || !entries.some((entry) => entry.code === promoCodeSelected)) {
    promoCodeSelected = entries[0] ? entries[0].code : null;
  }

  list.innerHTML = entries.length
    ? entries
        .map((entry) => {
          const badge = promoExpiryBadge(entry);
          return `
            <button type="button" class="codes-row${entry.code === promoCodeSelected ? " is-active" : ""}" data-code="${escapeHtml(entry.code)}">
              <span class="codes-row-code">${escapeHtml(entry.code)}</span>
              <span class="codes-row-meta codes-badge-${badge.kind}">${escapeHtml(badge.label)}</span>
            </button>`;
        })
        .join("")
    : guideEmptyState("codes.empty");

  list.querySelectorAll(".codes-row").forEach((row) => {
    row.addEventListener("click", () => {
      promoCodeSelected = row.dataset.code;
      renderCodesRail();
      showBuildsDetail();
    });
  });

  renderCodesDetail();
}

function renderCodesDetail() {
  const host = document.getElementById("builds-detail");
  if (!host) return;

  if (promoCodeStatus === "loading") {
    host.innerHTML = guideEmptyState("codes.loading");
    return;
  }

  if (promoCodeStatus === "error") {
    host.innerHTML = `
      <div class="codes-detail-card codes-detail-error">
        <p class="codes-error-text">${escapeHtml(t("codes.error"))}</p>
        <p class="codes-error-detail">${escapeHtml(promoCodeError)}</p>
        <button type="button" class="btn btn-secondary btn-sm" id="codes-retry">${escapeHtml(t("codes.retry"))}</button>
      </div>`;
    const retry = host.querySelector("#codes-retry");
    if (retry) {
      retry.addEventListener("click", () => {
        promoCodeStatus = "idle";
        promoCodesPromise = null;
        renderBuilds();
      });
    }
    return;
  }

  const entry = promoCodeEntries().find((row) => row.code === promoCodeSelected);
  if (!entry) {
    host.innerHTML = guideEmptyState("codes.select");
    return;
  }

  const badge = promoExpiryBadge(entry);
  const rewards = Array.isArray(entry.rewards) ? entry.rewards : [];
  const rewardsHtml = rewards.length
    ? `<div class="codes-rewards-grid">${rewards
        .map(
          (reward) => `
            <div class="codes-reward">
              ${renderItemStickerHtml(reward.name, reward.qty)}
              <span class="codes-reward-name">${escapeHtml(reward.name || "")}</span>
            </div>`,
        )
        .join("")}</div>`
    : `<p class="codes-empty-text">${escapeHtml(t("codes.noRewards"))}</p>`;

  const staleBadge = promoCodeData && promoCodeData.stale
    ? `<span class="codes-badge codes-badge-stale">${escapeHtml(t("codes.stale"))}</span>`
    : "";
  const updated = promoCodeData && promoCodeData.fetchedAt
    ? `<span class="codes-updated">${escapeHtml(
        t("codes.updated", { date: promoCodeDate(String(promoCodeData.fetchedAt).slice(0, 10)) }),
      )}</span>`
    : "";

  host.innerHTML = `
    <div class="codes-detail-card">
      <div class="codes-detail-head">
        <div class="codes-code-line">
          <span class="codes-code">${escapeHtml(entry.code)}</span>
          <button type="button" class="btn btn-secondary btn-sm codes-copy" data-copy="${escapeHtml(entry.code)}">${escapeHtml(t("codes.copy"))}</button>
        </div>
        <div class="codes-badges">
          <span class="codes-badge codes-badge-${badge.kind}">${escapeHtml(badge.label)}</span>
          ${staleBadge}
        </div>
      </div>
      <div class="codes-rewards">
        ${guideSectionHeader("codes.rewards")}
        ${rewardsHtml}
      </div>
      <div class="codes-source">
        <a href="${escapeHtml(promoCodeData?.source || "https://reverse1999.fandom.com/wiki/Promotional_Code")}" target="_blank" rel="noopener noreferrer">${escapeHtml(t("codes.source"))}</a>
        ${updated}
      </div>
    </div>`;

  host.querySelectorAll(".codes-copy").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const ok = await guideCopyText(btn.dataset.copy || "");
      btn.textContent = t(ok ? "codes.copied" : "codes.copyFailed");
      btn.classList.toggle("is-copied", ok);
      setTimeout(() => {
        btn.textContent = t("codes.copy");
        btn.classList.remove("is-copied");
      }, 1600);
    });
  });
}

function renderBuildsDetail() {
  const host = document.getElementById("builds-detail");
  if (!host) return;

  const buildsCard = document.querySelector("#builds-modal .builds-modal-card");

  const name = buildsSelected;
  if (!name) {
    if (buildsCard) buildsCard.classList.remove("is-sotheby-theme");
    host.innerHTML = guideEmptyState("builds.select");
    return;
  }

  // Easter egg: check if current character is Sotheby
  const canonicalName = resolveCharacterName(name);
  if (canonicalName === "Sotheby" || name === "Sotheby") {
    if (buildsCard) buildsCard.classList.add("is-sotheby-theme");
  } else {
    if (buildsCard) buildsCard.classList.remove("is-sotheby-theme");
  }

  const build = getBuild(name) || {};
  const rarity = Math.max(0, Number(getCharacterRarity(name)) || 0);
  const accent = rarityColor(rarity);

  const psychubes = (Array.isArray(build.psychubes) ? build.psychubes : []).slice(0, 2);
  const resonance = build.resonance && typeof build.resonance === "object" ? build.resonance : {};
  const charts = guideProgressionFor(name);

  // A character with no recorded build gets one clear message instead of
  // four empty cards.
  if (!characterHasBuild(name)) {
    host.innerHTML = guideEmptyState("builds.noBuild");
    return;
  }

  const chartHtml = (chart) => {
    return `<div class="build-chart" style="--build-accent:${accent}">${chart.bars
      .map((p, index) => {
        const val = Math.max(0, Number(p.val) || 0);
        // The axis is a fixed 0–100 scale, so bars compare across charts and a
        // full bar always means 100%. A 0% bar is omitted entirely: a minimum
        // height would draw a line at the baseline and read as a real value.
        const bar =
          val > 0
            ? `<span class="build-chart-bar" style="height:${Math.min(100, val)}%"></span>`
            : "";
        return `
            <div class="build-chart-col" style="--bar-index:${index}">
              <span class="build-chart-val">${val}%</span>
              <span class="build-chart-track">${bar}</span>
              <span class="build-chart-badge">${escapeHtml(p.badge || "")}</span>
            </div>`;
      })
      .join("")}</div>`;
  };

  const psychubeHtml = psychubes.length
    ? psychubes
        .map((entry) => {
          const key = psychubeKeyFromName(entry);
          const chube = key ? psychubeDb[key] : null;
          return `<span class="build-psychube">${
            chube ? `<img src="${escapeHtml(chube.iconUrl)}" alt="" />` : `<span class="build-psychube-blank"></span>`
          }<span class="build-psychube-name">${escapeHtml(psychubeNameFromName(entry))}</span></span>`;
        })
        .join("")
    : `<span class="builds-muted">${escapeHtml(t("builds.noData"))}</span>`;

  const resonanceHtml = Object.keys(resonance).length
    ? Object.entries(resonance)
        .map(
          ([label, code]) => `
            <button type="button" class="build-resonance-btn" data-code="${escapeHtml(code)}" title="${escapeHtml(
              t("builds.copyHint")
            )}">${escapeHtml(displayResonanceLabel(label))}</button>`
        )
        .join("")
    : `<span class="builds-muted">${escapeHtml(t("builds.noData"))}</span>`;

  const patternIcon = build.pattern ? getPatternIconPath(name, build.pattern) : "";
  const patternHtml = build.pattern
    ? `<div class="build-pattern">
         ${patternIcon ? `<img src="${escapeHtml(patternIcon)}" alt="" />` : ""}
         <span class="build-pattern-name" style="color:${getResonanceTextColor(build.pattern)}">${escapeHtml(
           patternLabel(build.pattern)
         )}</span>
       </div>`
    : `<span class="builds-muted">${escapeHtml(t("builds.noData"))}</span>`;

  const chartSection = charts.length
    ? `<section class="build-section build-section-chart">
         <h4 class="build-section-title">${escapeHtml(t("builds.portrait"))}</h4>
         <div class="build-charts${charts.length > 1 ? " is-multi" : ""}${charts.length > 2 ? " is-many" : ""}">${charts
           .map(
             (chart, index) => `<div class="build-chart-block">
               ${
                 chart.label
                   ? `<span class="build-chart-label">${escapeHtml(localizeText(chart.label))}</span>`
                   : charts.length > 1
                     ? `<span class="build-chart-label">${escapeHtml(t("builds.chartN", { n: index + 1 }))}</span>`
                     : ""
               }
               ${chartHtml(chart)}
             </div>`
           )
           .join("")}</div>
       </section>`
    : "";

  const psychubeSection = psychubes.length
    ? `<section class="build-section">
         <h4 class="build-section-title">${escapeHtml(t("builds.psychubes"))}</h4>
         <div class="build-psychubes">${psychubeHtml}</div>
       </section>`
    : "";

  const resonanceSection =
    build.pattern || Object.keys(resonance).length
      ? `<section class="build-section">
           <h4 class="build-section-title">${escapeHtml(t("builds.resonance"))}</h4>
           <div class="build-resonance-block">
             ${patternHtml}
             <div class="build-resonance-buttons">${resonanceHtml}</div>
           </div>
         </section>`
      : "";

  const sideSections = psychubeSection + resonanceSection;
  // One chart keeps the two-column layout; several charts take the full width
  // so they can sit side by side above the loadout cards.
  const stacked = charts.length > 2;
  const singleColumn = !chartSection || !sideSections;

  const notesHtml = build.notes
    ? `<div class="build-notes-box">
         <span class="build-notes-label">${escapeHtml(t("builds.notes"))}</span>
         <p class="build-notes">${escapeHtml(localizeText(build.notes))}</p>
       </div>`
    : "";

  let profile = characterProfilesData[name] || characterProfilesData[canonicalName] || null;
  if (!profile) {
    for (const [k, v] of Object.entries(characterProfilesData)) {
      if (resolveCharacterName(k) === canonicalName || resolveCharacterName(k) === name) {
        profile = v;
        break;
      }
    }
  }
  let profileMetaHtml = "";
  if (profile) {
    const isCn = currentLang === "cn";
    const dmgLabel = isCn ? (profile.dmgTypeZh || (profile.dmgType === "Reality" ? "现实创伤" : "精神创伤")) : profile.dmgType;
    let roleTagsList = isCn && profile.roleTagsZh && profile.roleTagsZh.length ? profile.roleTagsZh : (profile.roleTags || []);
    roleTagsList = roleTagsList.map((tg) => {
      let clean = String(tg || "").replace(/<\/?nobr>/gi, "").trim();
      if (!isCn && clean === "洞知") clean = "Pursuit";
      return clean;
    });
    const dmgIcon = profile.dmgType === "Reality" ? "images/dmg_type_icon/reality_dmg.png" : "images/dmg_type_icon/mental_dmg.png";
    const tagsHtml = roleTagsList.map((tg) => `<span class="flag" style="font-size: 0.6rem; padding: 2px 6px;">${escapeHtml(tg)}</span>`).join(" ");
    profileMetaHtml = `
      <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 4px;">
        <span style="display: inline-flex; align-items: center; gap: 4px; font-size: 0.7rem; color: #ECE5D9;">
          <img src="${escapeHtml(dmgIcon)}" alt="${escapeHtml(dmgLabel)}" style="width: 14px; height: 14px; object-fit: contain;" />
          ${escapeHtml(dmgLabel)}
        </span>
        ${tagsHtml}
      </div>
    `;
  }

  host.innerHTML = `
    <div class="builds-hero" style="--build-accent:${accent}">
      <span class="builds-hero-portrait"><img src="${escapeHtml(characterDb[name] || "")}" alt="" /></span>
      <div class="builds-hero-text">
        <div class="builds-hero-head">
          <h3 class="builds-hero-name">${escapeHtml(displayCharName(name))}</h3>
          <span class="builds-hero-stars" style="color:${accent}">${"✦".repeat(rarity)}</span>
        </div>
        ${profileMetaHtml}
      </div>
      <button type="button" class="builds-share-btn" data-builds-share title="${escapeHtml(t("builds.share"))}" aria-label="${escapeHtml(t("builds.share"))}"><img src="images/random_icon/share_icon.png" alt="" /></button>
    </div>

    ${renderCharacterSkillsSection(name)}

    ${notesHtml}

    <div class="builds-grid${singleColumn ? " is-single" : ""}${stacked ? " is-stacked" : ""}">
      ${chartSection}
      ${sideSections ? `<div class="builds-column">${sideSections}</div>` : ""}
    </div>
  `;
  setupCharacterSkillsListeners(host);

  const shareBtn = host.querySelector("[data-builds-share]");
  if (shareBtn) {
    shareBtn.addEventListener("click", () =>
      copyShareLink(shareBtn, simShareUrlForCharacter(name), t("builds.share")),
    );
  }

  // The label is the copy button for its code.
  host.querySelectorAll(".build-resonance-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const original = btn.textContent;
      const ok = await guideCopyText(btn.dataset.code || "");
      btn.textContent = ok ? t("builds.copied") : t("builds.copyFailed");
      btn.classList.toggle("is-copied", ok);
      setTimeout(() => {
        btn.textContent = original;
        btn.classList.remove("is-copied");
      }, 1100);
    });
  });
}

/* ---------------- Skill Rotations ---------------- */

let rotationsSelected = null;
const rotationArchetypeFilter = new Set();
/** The presets modal keeps its own archetype filter, so the two lists differ. */
const rotationPresetArchetypeFilter = new Set();

/** Rotation members accept the legacy `"Name"` shorthand and `{character, psychube}`. */
function rotationMembers(rotation) {
  return (rotation.members || [])
    .map((entry) => {
      if (typeof entry === "string") {
        return { character: resolveCharacterName(entry) || entry, psychube: "", portrait: 0 };
      }
      if (!entry || !entry.character) return null;
      const portrait = Number(entry.portrait);
      return {
        character: resolveCharacterName(entry.character) || entry.character,
        psychube: entry.psychube || "",
        // Portrait tier drives the 5-dash bar under the member's avatar.
        portrait: Number.isFinite(portrait) ? Math.max(0, Math.min(5, portrait)) : 0,
      };
    })
    .filter(Boolean);
}

/**
 * Colour of the active portrait dash for a rarity, honouring the custom
 * portrait colours from the Styling modal.
 */
function portraitDashColor(rarity) {
  const app = displayOptions.appearance;
  if (!app || !app.customPortraitColorsEnabled) return "";
  const colors = {
    6: app.portraitColorR6 || "#DD9925",
    5: app.portraitColorR5 || "#C7AF6C",
    4: app.portraitColorR4 || "#6A4972",
    3: app.portraitColorR3 || "#545C7D",
    2: app.portraitColorR2 || "#496441",
  };
  return colors[Number(rarity)] || "";
}

/** The five-slot portrait bar, reusing the board's dash markup and colours. */
function rotationPortraitDashesHtml(portrait, rarity) {
  const activeColor = portraitDashColor(rarity);
  const style = activeColor ? ` style="background-color: ${activeColor};"` : "";
  const tier = Math.max(0, Math.min(5, Number(portrait) || 0));
  return Array.from({ length: 5 }, (_, i) =>
    `<span class="portrait-dash ${i < tier ? "active" : ""}"${i < tier ? style : ""}></span>`
  ).join("");
}

/** Rounds accept the legacy `turns` key, whose cards were a flat list. */
function rotationRounds(rotation) {
  if (Array.isArray(rotation.rounds)) return rotation.rounds;
  if (!Array.isArray(rotation.turns)) return [];
  return rotation.turns.map((turn) => ({
    note: "",
    slots: (turn.cards || []).map((card) => ({ cards: card ? [card] : [] })),
  }));
}

function rotationArchetypes(rotation) {
  const list = Array.isArray(rotation.archetypes)
    ? rotation.archetypes.filter(Boolean)
    : rotation.archetype
      ? [rotation.archetype]
      : [];
  // Raid and Focused Flashback lead the chips; the rest keep their order.
  const lead = EXCLUSIVE_ARCHETYPES.filter((tag) => list.includes(tag));
  return [...lead, ...list.filter((tag) => !lead.includes(tag))];
}

function rotationsVisible() {
  const input = document.getElementById("rotations-search");
  const query = (input ? input.value : "").trim().toLowerCase();
  return rotationEntries().filter((rotation) => {
    const archetypes = rotationArchetypes(rotation);
    if (rotationArchetypeFilter.size > 0 && !archetypes.some((a) => rotationArchetypeFilter.has(a))) return false;
    if (!query) return true;
    const notesStr =
      typeof rotation.notes === "object" && rotation.notes !== null
        ? Object.values(rotation.notes).join(" ")
        : rotation.notes || "";
    const haystack = [
      rotation.name || "",
      rotation.tuning || "",
      ...archetypes,
      ...rotationMembers(rotation).map((m) => displayCharName(m.character)),
      notesStr,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
}

function renderRotationFilters() {
  const host = document.getElementById("rotations-filters");
  if (!host) return;
  host.innerHTML = ROTATION_ARCHETYPES.map(
    (tag) =>
      `<button type="button" class="rotation-filter${rotationArchetypeFilter.has(tag) ? " is-active" : ""}" data-tag="${escapeHtml(
        tag
      )}">${escapeHtml(tag)}</button>`
  ).join("");

  host.querySelectorAll(".rotation-filter").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tag = btn.dataset.tag;
      if (rotationArchetypeFilter.has(tag)) rotationArchetypeFilter.delete(tag);
      else rotationArchetypeFilter.add(tag);
      renderRotations();
    });
  });
}

/** The modal keeps the list on the left and the plan on the right. */
function setRotationsView(view) {
  const card = document.getElementById("rotations-card");
  if (card) card.classList.toggle("is-detail", view === "detail");

  // Phones replace the list with the plan; the back button returns to it.
  const back = document.getElementById("rotations-back");
  if (back) back.hidden = !(view === "detail" && guideIsStacked());
}

/** Shows or hides the rotation list, so the plan can use the full modal. */
let rotationsListVisible = true;

function setRotationsListVisible(visible) {
  rotationsListVisible = !!visible;
  const body = document.querySelector("#rotations-modal .rotations-body");
  // The stacked layout drives its own panes, so the desktop toggle is ignored there.
  if (body) body.classList.toggle("is-list-hidden", !rotationsListVisible && !guideIsStacked());

  const toggle = document.getElementById("rotations-rail-toggle");
  if (toggle) toggle.setAttribute("aria-pressed", String(rotationsListVisible));
  syncRotationsToggleLabel();
}

/** The button label follows the current state (and the current language). */
function syncRotationsToggleLabel() {
  const label = document.querySelector("#rotations-rail-toggle [data-i18n]");
  if (!label) return;
  const key = rotationsListVisible ? "rotations.toggleList" : "rotations.showList";
  label.setAttribute("data-i18n", key);
  label.textContent = t(key);
}

/** Opens one rotation: the plan fills the right pane, the list stays put. */
function openRotationDetail(id) {
  rotationsSelected = id || null;
  setRotationsView(rotationsSelected ? "detail" : "browse");
  renderRotationsDetail();
  const detail = document.getElementById("rotations-detail");
  if (detail) detail.scrollTop = 0;
}

/** Back to the empty plan pane, keeping the filters and search as they were. */
function showRotationsList() {
  // Re-rendering the list would jump it back to the top, so remember where
  // the reader was before restoring it.
  const browse = document.querySelector("#rotations-modal .rotations-browse");
  const scrollTop = browse ? browse.scrollTop : 0;
  rotationsSelected = null;
  setRotationsView("browse");
  renderRotations();
  if (browse) browse.scrollTop = scrollTop;
}

function openRotationsModal() {
  rotationsSelected = null;
  setRotationsView("browse");
  renderRotations();
  document.getElementById("rotations-modal").style.display = "flex";
  // Remember the list visibility across openings.
  setRotationsListVisible(rotationsListVisible);
}

function closeRotationsModal() {
  document.getElementById("rotations-modal").style.display = "none";
}

/* ---- Rotation presets: the bundled rotations, copied into the user's list ---- */

/** Draws the archetype filter row inside the presets modal. */
function renderRotationPresetFilters() {
  const host = document.getElementById("rotation-presets-filters");
  if (!host) return;
  host.innerHTML = ROTATION_ARCHETYPES.map(
    (tag) =>
      `<button type="button" class="rotation-filter${rotationPresetArchetypeFilter.has(tag) ? " is-active" : ""}" data-tag="${escapeHtml(
        tag
      )}">${escapeHtml(tag)}</button>`
  ).join("");

  host.querySelectorAll(".rotation-filter").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tag = btn.dataset.tag;
      if (rotationPresetArchetypeFilter.has(tag)) rotationPresetArchetypeFilter.delete(tag);
      else rotationPresetArchetypeFilter.add(tag);
      renderRotationPresetFilters();
      renderRotationPresets();
    });
  });
}

function openRotationPresetsModal() {
  const search = document.getElementById("rotation-presets-search");
  if (search) search.value = "";
  renderRotationPresetFilters();
  renderRotationPresets();
  const modal = document.getElementById("rotation-presets-modal");
  if (modal) modal.style.display = "flex";
}

function closeRotationPresetsModal() {
  const modal = document.getElementById("rotation-presets-modal");
  if (modal) modal.style.display = "none";
}

function renderRotationPresets() {
  const host = document.getElementById("rotation-presets-list");
  if (!host) return;

  const searchEl = document.getElementById("rotation-presets-search");
  const query = (searchEl ? searchEl.value : "").trim().toLowerCase();

  const filtered = rotationPresets.filter((preset) => {
    // The archetype filter narrows first, so the search only has to look inside
    // the presets that already match.
    const presetArchetypes = rotationArchetypes(preset);
    if (
      rotationPresetArchetypeFilter.size > 0 &&
      !presetArchetypes.some((tag) => rotationPresetArchetypeFilter.has(tag))
    ) {
      return false;
    }
    if (!query) return true;
    const name = String(preset.name || preset.id || "").toLowerCase();
    if (name.includes(query)) return true;
    const tuning = String(preset.tuning || "").toLowerCase();
    if (tuning.includes(query)) return true;
    if (presetArchetypes.some((tag) => tag.toLowerCase().includes(query))) return true;
    const members = rotationMembers(preset);
    if (
      members.some((member) => {
        const charName = String(member.character || "").toLowerCase();
        const dispName = String(displayCharName(member.character) || "").toLowerCase();
        return charName.includes(query) || dispName.includes(query);
      })
    ) {
      return true;
    }
    const notesStr =
      typeof preset.notes === "object" && preset.notes !== null
        ? Object.values(preset.notes).join(" ")
        : preset.notes || "";
    if (notesStr.toLowerCase().includes(query)) return true;
    return false;
  });

  host.innerHTML = rotationPresets.length === 0
    ? guideEmptyState("rotations.presetsEmpty")
    : filtered.length
      ? filtered
          .map((preset) => {
            const added = rotationPresetAdded(preset.id);
            const members = rotationMembers(preset);
            const archetypes = rotationArchetypes(preset);
            const tuning = preset.tuning || "";
            return `
              <div class="rotation-card rotation-preset${added ? " is-added" : ""}" data-preset-id="${escapeHtml(preset.id)}">
                <span class="rotation-card-top">
                  <span class="rotation-card-name">${escapeHtml(preset.name || preset.id)}</span>
                  ${
                    tuning
                      ? `<img class="rotation-card-tuning" src="images/tuning_abilities/${encodeURIComponent(
                          tuning
                        )}.png" alt="" title="${escapeHtml(tuning)}" />`
                      : ""
                  }
                </span>
                <span class="rotation-card-team">
                  ${members
                    .map(
                      (member) =>
                        `<span class="rotation-card-face" title="${escapeHtml(displayCharName(member.character))}"><img src="${escapeHtml(
                          characterDb[member.character] || ""
                        )}" alt="" /></span>`
                    )
                    .join("")}
                </span>
                ${
                  archetypes.length
                    ? `<span class="rotation-card-tags">${archetypes
                        .map((tag) => `<span class="rotation-card-tag">${escapeHtml(tag)}</span>`)
                        .join("")}</span>`
                    : ""
                }
                <button type="button" class="rotation-preset-add" data-add="${escapeHtml(
                  preset.id
                )}" ${added ? "disabled" : ""}>${escapeHtml(added ? t("rotations.added") : t("rotations.add"))}</button>
              </div>`;
          })
          .join("")
      : guideEmptyState("rotations.noData");

  host.querySelectorAll(".rotation-preset-add").forEach((btn) => {
    btn.addEventListener("click", () => {
      const uid = addRotationPreset(btn.dataset.add);
      if (!uid) return;
      renderRotationPresets();
      // Selecting what was just added makes the copy obvious.
      openRotationDetail(uid);
      renderRotations();
    });
  });
}

function renderRotations() {
  renderRotationFilters();

  const list = document.getElementById("rotations-list");
  if (!list) return;

  // A selection that no longer resolves (its preset was removed) is dropped,
  // so the modal never keeps a plan that is no longer in the list.
  if (rotationsSelected && !rotationEntry(rotationsSelected)) {
    rotationsSelected = null;
    setRotationsView("browse");
  }

  const visible = rotationsVisible();

  const count = document.getElementById("rotations-count");
  if (count) count.textContent = t("rotations.count", { n: visible.length });

  list.innerHTML = visible.length
    ? visible
        .map((rotation, index) => {
          const members = rotationMembers(rotation);
          const archetypes = rotationArchetypes(rotation);
          const tuning = rotation.tuning || "";
          return `
            <div class="rotation-card${rotation.uid === rotationsSelected ? " is-active" : ""}" role="button" tabindex="0" data-uid="${escapeHtml(
              rotation.uid
            )}" style="--card-index:${index}">
              <span class="rotation-card-top">
                <span class="rotation-card-name">${escapeHtml(rotation.name || rotation.id || "")}</span>
                ${
                  tuning
                    ? `<img class="rotation-card-tuning" src="images/tuning_abilities/${encodeURIComponent(
                        tuning
                      )}.png" alt="" title="${escapeHtml(tuning)}" />`
                    : ""
                }
                <button type="button" class="rotation-card-remove" data-remove="${escapeHtml(
                  rotation.uid
                )}" title="${escapeHtml(t("rotations.remove"))}" aria-label="${escapeHtml(t("rotations.remove"))}">×</button>
              </span>
              <span class="rotation-card-team">
                ${members
                  .map(
                    (member) =>
                      `<span class="rotation-card-face" title="${escapeHtml(displayCharName(member.character))}"><img src="${escapeHtml(
                        characterDb[member.character] || ""
                      )}" alt="" /></span>`
                  )
                  .join("")}
              </span>
              ${
                rotation.isPreset || archetypes.length
                  ? `<span class="rotation-card-tags">
                      ${rotation.isPreset ? `<span class="rotation-card-tag is-preset">${escapeHtml(t("rotations.preset"))}</span>` : ""}
                      ${archetypes
                        .map((tag) => `<span class="rotation-card-tag">${escapeHtml(tag)}</span>`)
                        .join("")}
                    </span>`
                  : ""
              }
            </div>`;
        })
        .join("")
    : rotationList.length === 0
      ? guideEmptySign("rotations.listEmpty", "is-rail")
      : guideEmptyState("rotations.empty");

  list.querySelectorAll(".rotation-card").forEach((card) => {
    const open = () => openRotationDetail(card.dataset.uid);
    card.addEventListener("click", (e) => {
      if (e.target.closest(".rotation-card-remove")) return;
      open();
    });
    card.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      open();
    });
  });

  list.querySelectorAll(".rotation-card-remove").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const uid = btn.dataset.remove;
      if (!removeRotationEntry(uid)) return;
      if (rotationsSelected === uid) {
        showRotationsList();
      } else {
        renderRotations();
      }
      renderRotationPresets();
    });
  });

  // The detail pane always follows the list: a removed rotation must not keep
  // showing its plan, and an empty selection falls back to the hint state.
  renderRotationsDetail();
}

/** Legacy slot types and the tag they stand for. */
const ROT_LEGACY_SLOT_TAGS = { free: "ap-free", precast: "precast" };

/**
 * Slot tags. The layout lives in `type`; the meaning lives here, so a slot can
 * carry both AP Free and Precast. The ribbon itself is drawn in CSS/canvas, so
 * no plate art ships.
 */
const ROT_SLOT_TAGS = [
  { key: "ap-free", label: "AP Free", kind: "badge" },
  { key: "precast", label: "Precast", kind: "plaque" },
  // The blank ribbon the author types into.
  { key: "custom", label: "Custom", kind: "plaque", text: true },
];

/** The words a tag's plate draws: the typed text for the blank tag, else its name. */
function rotationTagLabel(tag, slotTagText) {
  if (!tag) return "";
  if (tag.key === "custom") return String(slotTagText || "");
  return tag.label;
}

/**
 * The one card frame: a skill-3 card is drawn in the arched Ultimate plate.
 * Every other card is just its art, so there is no frame to choose.
 */
const ROT_ULTIMATE_FRAME = {
  image: "images/card_modulo/Ultimate.png",
  inset: { left: 6.56, top: 7.30, width: 87.98, height: 86.35 },
  radius: "50% 50% 0 0 / 22% 22% 0 0",
};

/**
 * Card surfaces. A surface is translucent decoration laid straight over the art,
 * so it is drawn at the full card size — each surface PNG matches the box of the
 * card shape it belongs to.
 */
const ROT_CARD_SURFACES = [
  { key: "ramona", label: "Ramona", image: "images/card_modulo/surface/Ramona_Normal_Card.png" },
  { key: "ramona-ultimate", label: "Ramona Ultimate", image: "images/card_modulo/surface/Ramona_Ultimate_Card.png" },
  { key: "conduit", label: "Conduit", image: "images/card_modulo/surface/Conduit.png" },
  { key: "conduit-ultimate", label: "Conduit Ultimate", image: "images/card_modulo/surface/Conduit_Ultimate.png" },
];

function rotationCardSurface(key) {
  return ROT_CARD_SURFACES.find((surface) => surface.key === key) || null;
}

/**
 * Characters whose ultimate is not skill 3, mirroring the editor
 * (`ULTIMATE_SKILLS` in editor/model.js). The card panel and the modal must
 * agree, or the same plan draws two different shapes.
 */
const ROT_ULTIMATE_SKILLS = { Rhiannon: 4, Brume: 4, Kassandra: 5 };

/** Whether a skill card belongs to a character's ultimate. */
function rotationSkillIsUltimate(character, skill) {
  const name = String(character || "");
  const key = Object.keys(ROT_ULTIMATE_SKILLS).find((entry) => entry.toLowerCase() === name.toLowerCase());
  if (key) return Number(skill) === ROT_ULTIMATE_SKILLS[key];
  return Number(skill) === 3;
}

/** Skill 3 is the ultimate for every character; `frame` overrides either way. */
function rotationCardIsUltimate(card) {
  if (!card) return false;
  if (card.frame === "ultimate") return true;
  if (card.frame === "normal") return false;
  if (card.special) return false;
  return rotationSkillIsUltimate(card.character, card.skill);
}

/** A card's art: a special card is its own image, else the pinned icon wins. */
function rotationCardArtSrc(card) {
  if (!card) return "";
  if (card.special) return card.special;
  return card.icon || guideSkillIcon(resolveCharacterName(card.character) || card.character, card.skill);
}

/** One tag's ribbon: the ink, the halftone tail and the tag's words. */
function rotationTagPlateHtml(tag, text = "") {
  return `<span class="rot-tag-plate is-${tag.kind} is-text" data-tag="${escapeHtml(tag.key)}" title="${escapeHtml(text)}">
      <span class="rot-tag-plate-text">${escapeHtml(text)}</span>
    </span>`;
}

function rotationSlotLayout(slot) {
  const type = slot?.type || "normal";
  return ROT_LEGACY_SLOT_TAGS[type] ? "normal" : type;
}

function rotationSlotTags(slot) {
  const tags = Array.isArray(slot?.tags) ? slot.tags.filter((tag) => typeof tag === "string") : [];
  const legacy = ROT_LEGACY_SLOT_TAGS[slot?.type];
  return legacy && !tags.includes(legacy) ? [...tags, legacy] : tags;
}

function rotationTagInfo(key) {
  return ROT_SLOT_TAGS.find((tag) => tag.key === key) || null;
}

/** One skill card: character art, or a special card with no owner. */
function rotationCardHtml(card, variant, plates = "", hasBadge = false) {
  if (!card) return "";
  const ultimate = rotationCardIsUltimate(card);
  const cls = ["rot-card"];
  if (ultimate) cls.push("is-ultimate");
  // `variant` is "lb" for a quarter-size card, or "mid" / "behind" for the cards
  // stacked behind an OR slot's front card.
  if (variant) cls.push(`is-${variant}`);
  if (card.preferred) cls.push("is-preferred");
  if (hasBadge) cls.push("has-badge");
  const className = cls.join(" ");

  const art = escapeHtml(rotationCardArtSrc(card));
  const surface = rotationCardSurface(card.surface);
  const title = card.special
    ? ""
    : ` title="${escapeHtml(displayCharName(resolveCharacterName(card.character) || card.character))}"`;

  return `<span class="${className}"${title}>
      <img class="rot-card-art" src="${art}" alt="" />
      ${ultimate ? `<img class="rot-card-frame" src="${ROT_ULTIMATE_FRAME.image}" alt="" />` : ""}
      ${surface ? `<img class="rot-card-surface" src="${escapeHtml(surface.image)}" alt="" />` : ""}
      ${plates}
    </span>`;
}

/** A slot renders by type: normal AP, either/or AP, a quarter-size LB card, or text. */
const SLOT_TYPE_LABELS = {
  normal: "AP",
  or: "OR",
  double_or: "OR",
  or3: "OR",
  lb: "1/4 AP",
  text: "TEXT",
  tuning: "TUNING",
};

function rotationSlotHtml(slot) {
  if (!slot) return "";
  const type = rotationSlotLayout(slot);
  const tags = rotationSlotTags(slot);
  const cards = Array.isArray(slot.cards) ? slot.cards.filter(Boolean) : [];
  const label = SLOT_TYPE_LABELS[type] || SLOT_TYPE_LABELS.normal;

  const infos = tags.map(rotationTagInfo).filter(Boolean);
  const badge = infos.find((tag) => tag.kind === "badge");
  const plaques = infos.filter((tag) => tag.kind === "plaque");
  const tagText = typeof slot.tagText === "string" ? slot.tagText : "";
  // Both plates sit on the slot's first card, badge first, so the plaque lands
  // 3px under it. Every tag draws its words on the blank ribbon.
  const platesHtml =
    (badge ? rotationTagPlateHtml(badge, rotationTagLabel(badge, tagText)) : "") +
    plaques.map((tag) => rotationTagPlateHtml(tag, rotationTagLabel(tag, tagText))).join("");

  // A normal AP card says nothing a card does not already say, a 1/4 AP card is
  // already visibly smaller, and an OR slot's overlapping cards already say
  // "either", so all keep an empty caption for the baseline.
  const plain = type === "normal" || type === "lb" || type === "or" || type === "double_or" || type === "or3";
  // The plates hang off the slot's first card, so they sit on its corner whatever
  // shape the card is; `has-badge` keeps the plaque 3px under the badge.
  const wrap = (inner, extraClass = "") =>
    `<span class="rot-slot${extraClass}"><span class="rot-slot-body">${inner}</span><span class="rot-slot-type${
      plain ? " is-plain" : ""
    }">${escapeHtml(label)}</span></span>`;

  if (type === "text") {
    const text = slot.text || "";
    if (!text) return `<span class="rot-slot is-empty"><span class="rot-slot-body"></span></span>`;
    return wrap(`<span class="rot-slot-text">${escapeHtml(text)}</span>`, " is-text");
  }

  if (cards.length === 0) {
    // An empty slot shows the placeholder face, so the AP order reads before
    // any art exists.
    return `<span class="rot-slot is-empty"><span class="rot-slot-body"><span class="rot-card is-empty${badge ? " has-badge" : ""}">${platesHtml}<img class="rot-card-art" src="images/card_modulo/Normal.png" alt="" /></span></span></span>`;
  }

  if (type === "lb") {
    return wrap(rotationCardHtml(cards[0], "lb", platesHtml, !!badge), " is-lb");
  }

  if (type === "double_or" || type === "or3" || (type === "or" && cards.length > 2)) {
    // Every card goes through the same renderer, so a special card (Any, Move, …)
    // keeps its art and an ultimate keeps its plate wherever it sits in the stack.
    const front = cards[0] ? rotationCardHtml(cards[0], "", platesHtml, !!badge) : "";
    const mid = cards[1] ? rotationCardHtml(cards[1], "mid") : "";
    const behind = cards[2] ? rotationCardHtml(cards[2], "behind") : "";
    return wrap(`<span class="rot-or-stack is-double">${front}${mid}${behind}</span>`, " is-or is-double-or");
  }

  if (type === "or") {
    // The second card peeks out behind the first: together they take the same
    // room as one normal card.
    const front = cards[0] ? rotationCardHtml(cards[0], "", platesHtml, !!badge) : "";
    const behind = cards[1] ? rotationCardHtml(cards[1], "behind") : "";
    return wrap(`<span class="rot-or-stack">${front}${behind}</span>`, " is-or");
  }

  // A tuning slot is a text box with the tuning card shrunk into its bottom-right
  // corner, so the note never sits on top of the art.
  if (type === "tuning") {
    const text = slot.text || "";
    return wrap(
      `<span class="rot-slot-tuning">` +
        `<span class="rot-slot-tuning-note${text ? "" : " is-empty"}">${escapeHtml(text)}</span>` +
        `<span class="rot-slot-tuning-card">${rotationCardHtml(cards[0], "tiny")}</span>` +
        `</span>`,
      " is-tuning"
    );
  }

  return wrap(rotationCardHtml(cards[0], "", platesHtml, !!badge));
}

/**
 * Packs callouts into lanes: a note joins the first lane whose spans it does not
 * overlap, so notes over different cards sit side by side instead of stacking.
 * Returns each note's lane index.
 */
function packAnnotationLanes(notes) {
  const lanes = [];
  return notes.map((note) => {
    const lane = lanes.findIndex((spans) => spans.every(([a, b]) => note.to < a || note.from > b));
    if (lane === -1) {
      lanes.push([[note.from, note.to]]);
      return lanes.length - 1;
    }
    lanes[lane].push([note.from, note.to]);
    return lane;
  });
}

/**
 * Shrinks a tag's words until its plate fits inside the card. The plate is
 * capped at the card's width, so a long tag gets smaller type instead of
 * spilling off the art.
 */
function fitRotationTagPlates(root = document) {
  for (const plate of root.querySelectorAll(".rot-card > .rot-tag-plate.is-text")) {
    const text = plate.querySelector(".rot-tag-plate-text");
    const card = plate.parentElement;
    if (!text || !card) continue;
    plate.style.fontSize = "";
    // Measure the words themselves against the ribbon's content box. Integer
    // `scrollWidth` rounds down, so a label a fraction of a pixel too wide still
    // painted an ellipsis while the fit pass called it fine.
    const range = document.createRange();
    const words = () => {
      range.selectNodeContents(text);
      return range.getBoundingClientRect().width;
    };
    const fits = () => {
      const style = getComputedStyle(plate);
      const pad = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const room = plate.getBoundingClientRect().width - pad;
      return words() <= room - 0.5;
    };
    let size = parseFloat(getComputedStyle(plate).fontSize) || 12;
    // Shrink until the words fit. The label is never dropped: at thumbnail zoom
    // it keeps its (small) type, and a very narrow card falls back to the
    // ribbon's ellipsis. A tag without its name would tell the reader nothing.
    while (size > 4 && !fits()) {
      size -= 0.5;
      plate.style.fontSize = `${size}px`;
    }
  }
}

/**
 * Draws the rail of notes that span several rounds: a vertical spine beside the
 * rounds list with a tick pointing back at the first and last round it covers,
 * and the text centred on it. Runs after layout, because the span follows the
 * round heights.
 */
function drawRoundNoteRail(root = document) {
  const NS = "http://www.w3.org/2000/svg";
  for (const body of root.querySelectorAll(".rot-rounds-body")) {
    const rail = body.querySelector(".rot-round-notes-rail");
    const svg = rail?.querySelector(".rot-round-notes-rail-svg");
    const column = body.querySelector(".rot-rounds-column");
    if (!rail || !svg || !column) continue;

    const labels = [...rail.querySelectorAll(".rot-round-note-label")];
    const rounds = [...column.querySelectorAll(".rot-round")];
    svg.replaceChildren();
    if (labels.length === 0 || rounds.length === 0) continue;

    const bodyBox = body.getBoundingClientRect();
    // The spine hugs the last card, not the row: a flex row is as wide as its
    // column, so measuring it would leave the bracket floating far right.
    const contentRight = Math.max(
      ...rounds.map((round) => {
        const slots = [...round.querySelectorAll(".rot-slot")];
        if (slots.length === 0) return round.getBoundingClientRect().left;
        return slots[slots.length - 1].getBoundingClientRect().right;
      })
    );
    const spineX = contentRight - bodyBox.left + 10;
    svg.setAttribute("width", String(Math.max(1, bodyBox.width)));
    svg.setAttribute("height", String(Math.max(1, bodyBox.height)));

    labels.forEach((label, index) => {
      const from = rounds[Number(label.dataset.from)];
      const to = rounds[Number(label.dataset.to)] || from;
      if (!from || !to) return;

      const a = from.getBoundingClientRect();
      const b = to.getBoundingClientRect();
      const top = Math.min(a.top, b.top) - bodyBox.top;
      const bottom = Math.max(a.bottom, b.bottom) - bodyBox.top;
      const x = spineX + index * 16;
      const style = label.dataset.style || "bracket";

      const line = (d) => {
        const path = document.createElementNS(NS, "path");
        path.setAttribute("d", d);
        path.setAttribute("class", "rot-connector");
        svg.appendChild(path);
      };
      if (style === "box") {
        line(`M ${x} ${top} V ${bottom}`);
      } else {
        // The ticks point back at the rounds, so the bracket reads "] rounds".
        line(`M ${x} ${top} H ${x - 5} M ${x} ${bottom} H ${x - 5} M ${x} ${top} V ${bottom}`);
      }

      // The label sits beside the spine, vertically centred on its span.
      label.style.top = `${Math.round((top + bottom) / 2)}px`;
      label.style.left = `${Math.round(x + 8)}px`;
    });
  }
}

/**
 * Draws the bracket / box / fork connectors and lays the notes out in lanes.
 * Runs after layout because the spans follow the card widths, which the CSS
 * alone cannot know.
 */
function drawRotationConnectors(root = document) {
  const NS = "http://www.w3.org/2000/svg";
  const GAP = 7;

  for (const box of root.querySelectorAll(".rot-annotations")) {
    const round = box.closest(".rot-round");
    const rail = box.querySelector(".rot-annotation-rail");
    const notes = [...box.querySelectorAll(".rot-annotation")];
    if (!round || !rail || notes.length === 0) continue;

    const slots = [...round.querySelectorAll(".rot-round-slots > .rot-slot")];
    const artOf = (slot) => slot.querySelector(".rot-slot-body") || slot;

    // Measure first: an absolutely positioned note keeps its size even at top 0,
    // which is what the lane heights are read from.
    const laneHeight = [];
    for (const note of notes) {
      const lane = Number(note.dataset.lane) || 0;
      const height = note.getBoundingClientRect().height;
      laneHeight[lane] = Math.max(laneHeight[lane] || 0, height);
    }
    const laneTop = [];
    let y = 0;
    for (let i = 0; i < laneHeight.length; i++) {
      laneTop[i] = y;
      y += (laneHeight[i] || 0) + GAP;
    }

    const base = box.getBoundingClientRect();
    box.style.position = "relative";
    box.style.height = `${Math.max(0, y - GAP)}px`;
    rail.replaceChildren();

    notes.forEach((note) => {
      const lane = Number(note.dataset.lane) || 0;
      const from = slots[Number(note.dataset.from)];
      const to = slots[Number(note.dataset.to)] || from;
      if (!from || !to) return;

      // Centre the note on its span, then drop it into its lane.
      note.style.top = `${laneTop[lane]}px`;
      note.style.marginLeft = "0px";
      const width = note.getBoundingClientRect().width;
      const a = artOf(from).getBoundingClientRect();
      const b = artOf(to).getBoundingClientRect();
      const left = Math.min(a.left, b.left) - base.left;
      const right = Math.max(a.right, b.right) - base.left;
      const mid = (left + right) / 2;
      const limit = Math.max(0, box.clientWidth - width);
      note.style.marginLeft = `${Math.max(0, Math.min(limit, mid - width / 2))}px`;

      // The stem starts a hair under the cards and lands on the note's top edge.
      const gap = 3;
      const top = Math.min(a.bottom, b.bottom) - base.top + gap;
      const bar = top + 5;
      const stem = laneTop[lane];
      const style = note.dataset.style || "bracket";
      const line = (d) => {
        const path = document.createElementNS(NS, "path");
        path.setAttribute("d", d);
        path.setAttribute("class", "rot-connector");
        rail.appendChild(path);
      };
      if (style === "box") {
        line(`M ${mid} ${top} V ${stem}`);
      } else if (style === "fork") {
        line(`M ${left} ${top} V ${bar} H ${right} V ${top}`);
        line(`M ${mid} ${bar} V ${stem}`);
      } else {
        // Both ends start on the cards' bottom edge, then a bar, then a stem.
        line(`M ${left} ${top} V ${bar} H ${right} V ${top}`);
        line(`M ${mid} ${bar} V ${stem}`);
      }
    });
  }
}


/**
 * Grows or shrinks a tuning note until it fills its box: a short note gets big
 * type, a long one shrinks to fit rather than being cut off.
 */
function fitRotationTuningNotes(root = document) {
  for (const note of root.querySelectorAll(".rot-slot-tuning-note")) {
    const text = (note.textContent || "").trim();
    if (!text) continue;
    const max = 20;
    const min = 5.5;
    let low = min;
    let high = max;
    const overflows = (size) => {
      note.style.fontSize = `${size}px`;
      return note.scrollHeight > note.clientHeight + 1 || note.scrollWidth > note.clientWidth + 1;
    };
    note.style.fontSize = `${max}px`;
    for (let i = 0; i < 8; i++) {
      const size = (low + high) / 2;
      if (overflows(size)) high = size;
      else low = size;
    }
    // The corner card only matters when the note is long enough to reach it:
    // the text area is shortened by the overlap so the type can stay larger.
    const corner = note.parentElement?.querySelector(".rot-slot-tuning-card");
    if (corner) {
      const card = corner.getBoundingClientRect();
      const box = (note.parentElement || note).getBoundingClientRect();
      note.style.setProperty("--tuning-reserve", "0px");
      const overlap = note.scrollHeight - note.clientHeight;
      const bottom = box.bottom - card.top - 3;
      if (overlap > 0 && bottom > 0) {
        note.style.setProperty("--tuning-reserve", `${Math.round(bottom)}px`);
        low = min;
        high = max;
        for (let i = 0; i < 8; i++) {
          const size = (low + high) / 2;
          if (overflows(size)) high = size;
          else low = size;
        }
      }
    }
    note.style.fontSize = `${low}px`;
  }
}

/**
 * The plan markup: hero, team, notes and rounds. The modal and the `/sim` share page
 * draw the same block, so a shared rotation is literally the plan the modal shows.
 * The share page drops the share button — nothing there is re-shareable.
 */
function rotationPlanHtml(rotation, { share = true } = {}) {
  const members = rotationMembers(rotation);
  const rounds = rotationRounds(rotation);
  const archetypes = rotationArchetypes(rotation);
  const tuning = rotation.tuning || "";

  // Only the chosen tuning is shown, as a bare icon in a team-sized tile.
  const tuningHtml = tuning
    ? `<span class="rot-team-tuning" title="${escapeHtml(tuning)}">
         <img src="images/tuning_abilities/${encodeURIComponent(tuning)}.png" alt="" />
       </span>`
    : "";

  const teamHtml = members.length
    ? members
        .map((member) => {
          const chubeKey = psychubeKeyFromName(member.psychube);
          const chube = chubeKey ? psychubeDb[chubeKey] : null;
          const rarity = getCharacterRarity(member.character);
          return `
            <span class="rot-member">
              <span class="rot-member-avatar">
                <span class="rot-member-portrait">
                  <img src="${escapeHtml(characterDb[member.character] || "")}" alt="" />
                </span>
                <span class="rot-member-portrait-bar">${rotationPortraitDashesHtml(member.portrait, rarity)}</span>
              </span>
              <span class="rot-member-text">
                <span class="rot-member-name">${escapeHtml(displayCharName(member.character))}</span>
                ${
                  chube
                    ? `<span class="rot-member-chube" title="${escapeHtml(psychubeNameFromName(member.psychube))}">
                         <img src="${escapeHtml(chube.iconUrl)}" alt="" />
                         <span>${escapeHtml(psychubeNameFromName(member.psychube))}</span>
                       </span>`
                    : ""
                }
              </span>
            </span>`;
        })
        .join("")
    : `<span class="builds-muted">${escapeHtml(t("builds.noData"))}</span>`;

  const roundsHtml = rounds.length
    ? rounds
        .map((round, index) => {          const slots = Array.isArray(round.slots) ? round.slots : [];
          const slotsHtml = slots.length
            ? slots.map(rotationSlotHtml).join("")
            : `<span class="builds-muted">${escapeHtml(t("builds.noData"))}</span>`;

          // A callout underlines the cards it explains, so its ends are slot
          // indices rather than free text in the round header. Two notes that do
          // not share a card share a lane, so a round needs no extra height for
          // notes that never overlap.
          const last = Math.max(0, slots.length - 1);
          const notes = (Array.isArray(round.annotations) ? round.annotations : [])
            .map((annotation) => {
              const text = String(localizeText(annotation.text) || "").trim();
              if (!text) return null;
              const from = Math.max(0, Math.min(last, Number(annotation.from) || 0));
              const to = Math.max(from, Math.min(last, Number(annotation.to) || 0));
              const style = ["bracket", "box", "fork"].includes(annotation.style) ? annotation.style : "bracket";
              return { text, from, to, style };
            })
            .filter(Boolean);
          const lanes = packAnnotationLanes(notes);
          const annotationsHtml = notes.length
            ? `<div class="rot-annotations">
                 <svg class="rot-annotation-rail" aria-hidden="true"></svg>
                 ${notes
                   .map(
                     (note, i) => `<div class="rot-annotation is-${note.style}" data-lane="${lanes[i]}" data-from="${note.from}" data-to="${note.to}" data-style="${note.style}">
                      <span class="rot-annotation-text">${escapeHtml(note.text)}</span>
                    </div>`
                   )
                   .join("")}
               </div>`
            : "";

          return `
            <div class="rot-round" role="group" data-round="${index + 1}" aria-label="${escapeHtml(
              t("rotations.round", { n: String(index + 1).padStart(2, "0") })
            )}">
              <span class="rot-round-no">${String(index + 1).padStart(2, "0")}</span>
              ${
                round.note
                  ? `<div class="rot-round-head"><span class="rot-round-note">${escapeHtml(localizeText(round.note))}</span></div>`
                  : ""
              }
              <div class="rot-round-slots">${slotsHtml}</div>
              ${annotationsHtml}
            </div>`;
        })
        .join("")
    : guideEmptyState("rotations.empty");

  // Round notes span several rounds, so they are drawn on a rail beside the whole
  // list rather than inside one round.
  const roundNotes = (Array.isArray(rotation.roundNotes) ? rotation.roundNotes : [])
    .map((note) => {
      const text = String(localizeText(note.text) || "").trim();
      if (!text) return null;
      const lastRound = Math.max(0, rounds.length - 1);
      const from = Math.max(0, Math.min(lastRound, Number(note.from) || 0));
      const to = Math.max(from, Math.min(lastRound, Number(note.to) || 0));
      const style = ["bracket", "box", "fork"].includes(note.style) ? note.style : "bracket";
      return { text, from, to, style };
    })
    .filter(Boolean);
  const roundsBodyHtml = rounds.length
    ? `<div class="rot-rounds-body${roundNotes.length ? " has-round-notes" : ""}">
         <div class="rot-rounds-column">${roundsHtml}</div>
         <div class="rot-round-notes-rail">
           <svg class="rot-round-notes-rail-svg" aria-hidden="true"></svg>
           ${roundNotes
             .map(
               (note, i) => `<span class="rot-round-note-label" data-lane="${i}" data-from="${note.from}" data-to="${note.to}" data-style="${note.style}">${escapeHtml(
                 note.text
               )}</span>`
             )
             .join("")}
         </div>
       </div>`
    : roundsHtml;

  const roundsHeader = guideSectionHeader(
    "rotations.rounds",
    `<div class="rot-scale-control">
       <span class="rot-scale-label">Size:</span>
       <input type="range" class="rot-scale-slider" id="rot-rounds-scale-slider" min="0.4" max="1.2" step="0.05" value="${rotationRoundsScale}" title="Rounds scale" />
       <span class="rot-scale-val" id="rot-rounds-scale-val">${Math.round(rotationRoundsScale * 100)}%</span>
       <button type="button" class="rot-scale-reset" id="rot-rounds-scale-reset" title="Reset scale">100%</button>
     </div>`
  );

  return `
    <div class="rot-hero">
      <div class="rot-hero-head">
        <h3 class="rot-hero-name">${escapeHtml(rotation.name || rotation.id || "")}</h3>
        ${
          share
            ? `<button type="button" class="builds-share-btn rot-share-btn" data-rot-share title="${escapeHtml(
                t("rotations.share")
              )}" aria-label="${escapeHtml(t("rotations.share"))}"><img src="images/random_icon/share_icon.png" alt="" /></button>`
            : ""
        }
      </div>
      ${
        archetypes.length
          ? `<div class="rot-hero-tags">${archetypes
              .map((tag) => `<span class="rot-hero-tag" data-archetype="${escapeHtml(tag)}">${escapeHtml(tag)}</span>`)
              .join("")}</div>`
          : ""
      }
    </div>

    <section class="rot-block">
      ${guideSectionHeader("rotations.team")}
      <div class="rot-team">${teamHtml}${tuningHtml}</div>
    </section>

    ${
      rotation.notes
        ? `<section class="rot-block">
             ${guideSectionHeader("rotations.notes")}
             <p class="build-notes">${escapeHtml(localizeText(rotation.notes))}</p>
           </section>`
        : ""
    }

    <section class="rot-block">
      ${roundsHeader}
      ${roundsBodyHtml}
    </section>
  `;
}

function renderRotationsDetail() {
  const host = document.getElementById("rotations-detail");
  if (!host) return;

  const rotation = rotationEntry(rotationsSelected);
  if (!rotation) {
    host.innerHTML = guideEmptyState("rotations.select");
    return;
  }

  host.innerHTML = rotationPlanHtml(rotation);
  wireRotationPlan(host, rotation);
}

/**
 * Wires one rendered plan: the stored scale, the share button, the size slider and the
 * re-fit passes. The modal hands in its rotation so the button can build a link; the
 * `/sim` page renders with `share: false` and passes `null`.
 */
function wireRotationPlan(host, rotation) {
  // Apply current scale to the container
  const roundsBlock = host.querySelector(".rot-rounds-body") || host.querySelector(".rot-rounds-column");
  if (roundsBlock) {
    roundsBlock.style.setProperty("--rot-scale", String(rotationRoundsScale));
  }

  const shareBtn = host.querySelector("[data-rot-share]");
  if (shareBtn && rotation) {
    shareBtn.addEventListener("click", () =>
      copyShareLink(shareBtn, simShareUrlForRotation(rotation), t("rotations.share")),
    );
  }

  const slider = host.querySelector("#rot-rounds-scale-slider");
  const scaleVal = host.querySelector("#rot-rounds-scale-val");
  const resetBtn = host.querySelector("#rot-rounds-scale-reset");

  const updateScale = (newScale) => {
    rotationRoundsScale = newScale;
    try {
      localStorage.setItem(ROTATION_SCALE_STORAGE_KEY, String(newScale));
    } catch (e) {}

    if (roundsBlock) {
      roundsBlock.style.setProperty("--rot-scale", String(newScale));
    }
    if (slider) slider.value = String(newScale);
    if (scaleVal) scaleVal.textContent = `${Math.round(newScale * 100)}%`;

    // Reading a metric forces layout, so fitting now already sees the new card
    // widths. The frames after it are a safety net for late font metrics.
    fitRotationTuningNotes(host);
    fitRotationTagPlates(host);

    requestAnimationFrame(() => {
      fitRotationTuningNotes(host);
      fitRotationTagPlates(host);
      drawRotationConnectors(host);
      drawRoundNoteRail(host);
    });
  };

  if (slider) {
    slider.addEventListener("input", (e) => {
      const val = parseFloat(e.target.value);
      if (Number.isFinite(val)) updateScale(val);
    });
  }
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      updateScale(1.0);
    });
  }

  // The tuning notes only have a size once they are in the document, and the
  // callout connectors need the final card widths.
  requestAnimationFrame(() => {
    fitRotationTuningNotes(host);
    fitRotationTagPlates(host);
    drawRotationConnectors(host);
    drawRoundNoteRail(host);
    // Amiri arrives after the first pass; re-fit once its wider glyphs are in.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => fitRotationTagPlates(host));
    }
  });

  // Whatever moves the cards (window resize, splitter, fonts) ends with the pane
  // at a new width, so re-fit the ribbons there instead of trusting one timing.
  if (roundsBlock && typeof ResizeObserver === "function") {
    if (rotationTagFitObserver) rotationTagFitObserver.disconnect();
    rotationTagFitObserver = new ResizeObserver(() => fitRotationTagPlates(host));
    rotationTagFitObserver.observe(roundsBlock);
  }
}

// Card widths change with the viewport, so the connectors are redrawn on resize.
window.addEventListener("resize", () => {
  const modal = document.getElementById("rotations-modal");
  if (modal && modal.style.display === "flex") {
    fitRotationTagPlates();
    drawRotationConnectors();
    drawRoundNoteRail();
  }
  // A shared rotation is outside that modal, so it gets its own redraw.
  const sim = document.getElementById("sim-view");
  if (sim) {
    fitRotationTagPlates(sim);
    drawRotationConnectors(sim);
    drawRoundNoteRail(sim);
  }
});

/**
 * Wires the drag handle that splits a stacked modal body (list on top, detail
 * below). Only the stacked layout has a handle: on a side-by-side layout the
 * rail keeps its CSS width. The chosen height is remembered per modal.
 */
function setupGuideRailResizer({ bodySelector, handleId, cssVar, storageKey }) {
  const body = document.querySelector(bodySelector);
  const handle = document.getElementById(handleId);
  if (!body || !handle) return;

  const stacked = window.matchMedia("(max-width: 768px)");

  const clamp = (height) => {
    // A hidden modal measures as zero; keep the stored value untouched then.
    if (body.clientHeight <= 0) return height;
    // Keep a sliver of both panes visible: 120px list, 160px detail.
    const max = Math.max(120, body.clientHeight - 160);
    return Math.min(max, Math.max(120, height));
  };

  const applyHeight = (height) => {
    body.style.setProperty(cssVar, `${Math.round(clamp(height))}px`);
  };

  const saved = Number(localStorage.getItem(storageKey));
  if (Number.isFinite(saved) && saved > 0) applyHeight(saved);

  let dragging = false;
  const onMove = (clientY) => {
    const rect = body.getBoundingClientRect();
    applyHeight(clientY - rect.top);
  };

  const stop = () => {
    if (!dragging) return;
    dragging = false;
    handle.classList.remove("is-dragging");
    document.body.classList.remove("guide-rail-resizing");
    const height = parseFloat(body.style.getPropertyValue(cssVar));
    if (Number.isFinite(height)) localStorage.setItem(storageKey, String(Math.round(height)));
  };

  handle.addEventListener("pointerdown", (e) => {
    if (!stacked.matches) return;
    dragging = true;
    handle.classList.add("is-dragging");
    document.body.classList.add("guide-rail-resizing");
    handle.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  handle.addEventListener("pointermove", (e) => {
    if (dragging) onMove(e.clientY);
  });
  handle.addEventListener("pointerup", stop);
  handle.addEventListener("pointercancel", stop);

  handle.addEventListener("dblclick", () => {
    body.style.removeProperty(cssVar);
    localStorage.removeItem(storageKey);
  });

  // Keyboard support: arrow keys nudge the split.
  handle.addEventListener("keydown", (e) => {
    const rail = body.firstElementChild;
    if (!rail || !stacked.matches) return;
    const step = 16;
    const current = rail.getBoundingClientRect().height;
    if (e.key === "ArrowUp") applyHeight(current - step);
    else if (e.key === "ArrowDown") applyHeight(current + step);
    else return;
    const height = parseFloat(body.style.getPropertyValue(cssVar));
    if (Number.isFinite(height)) localStorage.setItem(storageKey, String(Math.round(height)));
    e.preventDefault();
  });
}

/**
 * Keeps the stacked master-detail panes in sync when the viewport crosses the
 * phone breakpoint (for example when a tablet is rotated).
 */
function syncGuideResponsiveLayout() {
  const stacked = guideIsStacked();

  const buildsBody = document.querySelector("#builds-modal .builds-body");
  if (buildsBody) buildsBody.classList.toggle("is-list-hidden", !buildsListVisible && !stacked);
  const buildsBack = document.getElementById("builds-back");
  if (buildsBack) buildsBack.hidden = !(stacked && buildsView === "detail");

  const rotationsBody = document.querySelector("#rotations-modal .rotations-body");
  if (rotationsBody) rotationsBody.classList.toggle("is-list-hidden", !rotationsListVisible && !stacked);
  const rotationsBack = document.getElementById("rotations-back");
  if (rotationsBack) rotationsBack.hidden = !(stacked && !!rotationsSelected);
}

/* ================= Planner (event shop) =================
 * The Planner's Event tab answers "how much does this patch's event shop cost
 * me?". `data/event_shop.json` (scripts/sync/derive/eventShop.mjs) already
 * carries the shop the global client is running, section by section, with each
 * row's name, icon, price and purchase cap — so re-running `npm run sync` moves
 * the tab to the new patch without a hand edit here.
 *
 * The only state is the user's picks: `r1999_planner_v1` keeps
 * `{ patch, shop, limits }`, where `limits` maps "<shopId>|<goodsUid>" ->
 * quantity. This is a planner, so a row the user has not touched starts at its
 * **purchase cap** (`maxBuy`), i.e. the tab opens on "buy the shop out"; an
 * unlimited row (`maxBuy: 0`) has no such maximum and starts at zero.
 *
 * The blob is stamped with the patch it was made for: `npm run sync` moving
 * `data/event_shop.json` to a new patch drops the whole thing (the goods slots
 * are activity rows, so old picks cannot mean anything on a new shop), and a
 * key the shipped data no longer names is dropped even within one patch.
 */
const PLANNER_STORAGE_KEY = "r1999_planner_v1";

let eventShopDb = { patch: "", current: "", shops: [] };
let plannerShopId = "";
let plannerLimits = {};
let plannerOwned = {}; // shopId -> number
let plannerActiveSliderItem = null;

function plannerLimitKey(shopId, uid) {
  return `${shopId}|${uid}`;
}

/** The shop the tab shows: the picked one, else the patch's current shop. */
function plannerShop() {
  const shops = eventShopDb.shops || [];
  return (
    shops.find((shop) => shop.id === plannerShopId) ||
    shops.find((shop) => shop.isCurrent) ||
    shops[0] ||
    null
  );
}

function plannerFindItem(shop, uid) {
  for (const group of shop.groups || []) {
    const item = (group.items || []).find((row) => row.uid === uid);
    if (item) return item;
  }
  return null;
}

/** `maxBuy: 0` means the game sells it without a cap. */
function plannerClamp(item, value) {
  const n = Math.floor(Number(value) || 0);
  if (n <= 0) return 0;
  return item.maxBuy > 0 ? Math.min(n, item.maxBuy) : n;
}

/** Untouched rows are planned at their full cap; unlimited ones stay at zero. */
function plannerDefaultLimit(item) {
  return item.maxBuy > 0 ? item.maxBuy : 0;
}

function plannerLimit(item, shopId) {
  const key = plannerLimitKey(shopId || plannerShopId, item.uid);
  const saved = plannerLimits[key];
  return saved === undefined ? plannerDefaultLimit(item) : plannerClamp(item, saved);
}

/** An explicit 0 is stored (not deleted): it differs from the default cap. */
function plannerSetLimit(item, shopId, value) {
  plannerLimits[plannerLimitKey(shopId, item.uid)] = plannerClamp(item, value);
}

function savePlannerState() {
  try {
    localStorage.setItem(
      PLANNER_STORAGE_KEY,
      JSON.stringify({ patch: eventShopDb.patch || "", shop: plannerShopId, limits: plannerLimits, owned: plannerOwned })
    );
  } catch (e) {
    /* private mode / quota: the plan still works, it just is not remembered */
  }
}

/** Loads the saved picks; a patch change (or a vanished slot) discards them. */
function loadPlannerState() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(PLANNER_STORAGE_KEY) || "null");
  } catch (e) {
    saved = null;
  }
  plannerLimits = {};
  plannerOwned = {};
  const samePatch = saved && saved.patch && saved.patch === eventShopDb.patch;
  if (!samePatch) {
    // New patch downloaded: the saved shop and quantities describe a shop that
    // no longer exists, so wipe them instead of half-applying them.
    if (saved) {
      try {
        localStorage.removeItem(PLANNER_STORAGE_KEY);
      } catch (e) {
        /* nothing to clean up */
      }
    }
  }
  const stored = samePatch && saved.limits && typeof saved.limits === "object" ? saved.limits : {};
  const known = new Set();
  for (const shop of eventShopDb.shops || []) {
    for (const group of shop.groups || []) {
      for (const item of group.items || []) known.add(plannerLimitKey(shop.id, item.uid));
    }
  }
  for (const [key, value] of Object.entries(stored)) {
    const n = Number(value);
    if (known.has(key) && Number.isFinite(n) && n >= 0) plannerLimits[key] = Math.floor(n);
  }
  if (samePatch && saved.owned && typeof saved.owned === "object") {
    for (const [sid, val] of Object.entries(saved.owned)) {
      const n = Number(val);
      if (Number.isFinite(n) && n >= 0) plannerOwned[sid] = Math.floor(n);
    }
  }
  const shops = eventShopDb.shops || [];
  const wanted = samePatch && typeof saved.shop === "string" ? saved.shop : "";
  plannerShopId =
    (shops.find((shop) => shop.id === wanted) || {}).id ||
    (shops.find((shop) => shop.isCurrent) || {}).id ||
    (shops[0] || {}).id ||
    "";
}

function buildEventShopData(data) {
  if (!data || !Array.isArray(data.shops) || !data.shops.length) {
    eventShopDb = { patch: "", current: "", shops: [] };
    plannerShopId = "";
    plannerLimits = {};
    return;
  }
  eventShopDb = data;
  loadPlannerState();
}

/** Thousands separators follow the UI language: 71,250 / 71 250 / 71,250. */
function plannerLocale() {
  return currentLang === "cn" ? "zh-CN" : currentLang === "vi" ? "vi-VN" : "en-US";
}

function plannerNumber(value) {
  const n = Number(value) || 0;
  try {
    return n.toLocaleString(plannerLocale());
  } catch (e) {
    return String(n);
  }
}

/** Item names are English game text; Chinese has its own column. */
function plannerItemName(item) {
  return currentLang === "cn" ? item.nameZh || item.name : item.name;
}

function plannerGroupName(group) {
  const name = currentLang === "cn" ? group.nameZh || group.name : group.name;
  return name || t("planner.groupN", { n: group.index });
}

function plannerShopLabel(shop) {
  const name = currentLang === "cn" ? shop.nameZh || shop.name : shop.name;
  return shop.retro ? `${name} · ${t("planner.rerun")}` : name;
}

function plannerGroupSpend(shop, group) {
  return (group.items || []).reduce(
    (sum, item) => sum + plannerLimit(item, shop.id) * item.cost,
    0
  );
}

function plannerTotalSpend(shop) {
  return (shop.groups || []).reduce((sum, group) => sum + plannerGroupSpend(shop, group), 0);
}

function plannerMoneyIcon(shop) {
  const money = (shop && shop.money) || {};
  if (!money.icon) return "";
  return `<img class="planner-money-icon" src="${escapeHtml(money.icon)}" alt="${escapeHtml(
    money.name || ""
  )}" />`;
}

/**
 * One goods slot, drawn as a board-style card: square art, the name under it,
 * then the price and a horizontal stepper — the same shape as a character card
 * on the mainboard, so the shop reads as a collection instead of a form.
 *
 * The card itself is also a button: a press anywhere but the stepper opens the
 * quantity popup (`openPlannerSlider`), which is the fast way to set a big cap.
 */
function plannerCardHtml(shop, item) {
  const limit = plannerLimit(item, shop.id);
  const name = escapeHtml(plannerItemName(item));
  const unlimited = item.maxBuy === 0;
  const canAdd = unlimited || limit < item.maxBuy;
  // Only a *capped* slot can sell out. An unlimited slot (Regular Reserve's
  // currency sink) starts at 0 because it has no cap to default to — that is a
  // plan of "none yet", not a shop that has run out.
  const soldOut = !unlimited && limit === 0;
  // The quantity box reads "n/max" so the cap is visible while stepping
  // (0/1 means the one-per-shop slot has been cleared). An unlimited slot has
  // no denominator.
  const countText = `${limit}/${unlimited ? "∞" : item.maxBuy}`;
  const capLabel = unlimited ? t("planner.unlimited") : t("planner.limit", { n: item.maxBuy });
  const art = item.icon
    ? `<img src="${escapeHtml(item.icon)}" alt="" loading="lazy" />`
    : `<span class="planner-card-art-empty" aria-hidden="true"></span>`;
  // `originalCost` is the struck-through "before the discount" price.
  const was =
    item.originalCost > item.cost
      ? `<span class="planner-cost-original">${escapeHtml(plannerNumber(item.originalCost))}</span>`
      : "";
  const bundle = item.amount > 1 ? `<span class="planner-card-bundle">×${item.amount}</span>` : "";
  // A row planned at zero is drawn as sold out: the art dims and a label sits
  // across it, the same way the shop board greys a slot the player cannot buy.
  const soldTag = soldOut
    ? `<span class="planner-card-soldout">${escapeHtml(t("planner.soldOut"))}</span>`
    : "";
  const money = (shop.money || {}).icon
    ? `<img class="planner-cost-money" src="${escapeHtml(shop.money.icon)}" alt="" />`
    : "";
  return `
        <div class="planner-card${soldOut ? " is-soldout" : ""}" data-uid="${escapeHtml(
          item.uid
        )}" data-key="${escapeHtml(item.key)}" data-max="${item.maxBuy}">
          <div class="planner-card-art">${art}${soldTag}${bundle}</div>
          <span class="planner-card-name">${name}</span>
          <div class="planner-card-price">
            ${money}<span class="planner-cost-value">${escapeHtml(plannerNumber(item.cost))}</span>${was}
          </div>
          <div class="planner-stepper">
            <button type="button" class="planner-step" data-step="-1" ${
              limit > 0 ? "" : "disabled "
            }aria-label="${t("planner.subtract")}" title="${t("planner.subtract")}">−</button>
            <span class="planner-count${limit > 0 ? "" : " is-zero"}" title="${escapeHtml(
              capLabel
            )}">${escapeHtml(countText)}</span>
            <button type="button" class="planner-step" data-step="1" ${
              canAdd ? "" : "disabled "
            }aria-label="${t("planner.add")}" title="${t("planner.add")}">+</button>
          </div>
        </div>`;
}

/**
 * The cards of one section, sold-out slots pushed to the end.
 *
 * `Array.prototype.sort` is stable, so everything still planned keeps the order
 * the shop ships; only the cleared slots move, which puts the things still on
 * the list at the top-left of the grid where the eye starts.
 *
 * Only a capped slot that has been planned down to zero counts as sold out; an
 * unlimited row sits at zero by default and keeps its shipped position.
 */
function plannerCards(shop, group) {
  const items = (group.items || []).map((item) => ({
    item,
    soldOut: item.maxBuy > 0 && plannerLimit(item, shop.id) === 0,
  }));
  return items
    .sort((a, b) => (a.soldOut === b.soldOut ? 0 : a.soldOut ? 1 : -1))
    .map((entry) => plannerCardHtml(shop, entry.item))
    .join("");
}

function plannerGroupHtml(shop, group) {
  const spend = plannerGroupSpend(shop, group);
  // The section bar is the Appearance modal's section title (`.archetype-…`), so
  // "Divine Treasure" and "DISPLAY FILTERS" are the same object.
  return `
      <section class="planner-group" data-group="${group.index}">
        <div class="archetype-section-header planner-group-head">
          <span class="archetype-section-title"><span>${escapeHtml(plannerGroupName(group))}</span></span>
          <span class="planner-group-total${spend > 0 ? " is-set" : ""}">${spend > 0 ? plannerMoneyIcon(shop) : ""}${escapeHtml(
            plannerNumber(spend)
          )}</span>
        </div>
        <div class="planner-grid">${plannerCards(shop, group)}</div>
      </section>`;
}

function renderPlannerEvent() {
  const sections = document.getElementById("planner-sections");
  if (!sections) return;
  const select = document.getElementById("planner-shop-select");
  const patchEl = document.getElementById("planner-patch");
  const totalEl = document.getElementById("planner-total-value");
  const totalIcon = document.getElementById("planner-total-icon");
  const shops = eventShopDb.shops || [];

  if (!shops.length) {
    if (patchEl) patchEl.textContent = "";
    if (select) {
      select.innerHTML = "";
      select.dataset.sig = "";
    }
    if (totalEl) totalEl.textContent = "0";
    if (totalIcon) totalIcon.hidden = true;
    sections.innerHTML = `<div class="guide-empty"><span>${escapeHtml(t("planner.noData"))}</span></div>`;
    return;
  }

  const shop = plannerShop();

  // Rebuild the picker only when the shop list or the language changed.
  if (select) {
    const sig = shops
      .map((row) => `${row.id}|${plannerShopLabel(row)}`)
      .join("::");
    if (select.dataset.sig !== sig) {
      select.dataset.sig = sig;
      select.innerHTML = shops
        .map((row) => `<option value="${escapeHtml(row.id)}">${escapeHtml(plannerShopLabel(row))}</option>`)
        .join("");
    }
    select.value = shop.id;
    select.hidden = shops.length < 2;
  }
  if (patchEl) patchEl.textContent = shop.patch ? t("planner.patch", { v: shop.patch }) : "";

  // Stepping rebuilds the list, so keep the pane where the reader left it and
  // hand focus back to the same (±1) button.
  const scrollTop = sections.scrollTop;
  const active = document.activeElement;
  const focusedRow = active && sections.contains(active) ? active.closest(".planner-card") : null;
  const focusedStep = focusedRow ? active.dataset.step : "";

  sections.innerHTML = (shop.groups || []).map((group) => plannerGroupHtml(shop, group)).join("");
  sections.scrollTop = scrollTop;

  if (focusedRow && focusedStep) {
    const esc = window.CSS && CSS.escape ? CSS.escape(focusedRow.dataset.uid) : focusedRow.dataset.uid;
    const row = sections.querySelector(`.planner-card[data-uid="${esc}"]`);
    const same = row && row.querySelector(`.planner-step[data-step="${focusedStep}"]:not([disabled])`);
    const other = row && row.querySelector(".planner-step:not([disabled])");
    if (same) same.focus();
    else if (other) other.focus();
  }

  // The total is a number only: the currency art sits next to it, so printing
  // its name would repeat what the icon already says.
  const money = shop.money || {};
  const totalSpend = plannerTotalSpend(shop);
  if (totalEl) totalEl.textContent = plannerNumber(totalSpend);
  if (totalIcon) {
    if (money.icon) {
      totalIcon.src = money.icon;
      totalIcon.alt = money.name || "";
      totalIcon.hidden = false;
    } else {
      totalIcon.hidden = true;
      totalIcon.removeAttribute("src");
    }
  }

  // Update Owned input & tooltip
  const ownedInput = document.getElementById("planner-owned-input");
  const currentOwned = Number(plannerOwned[shop.id]) || 0;
  if (ownedInput && document.activeElement !== ownedInput) {
    ownedInput.value = currentOwned > 0 ? currentOwned : "";
  }
  const currencyEl = document.getElementById("planner-tooltip-currency");
  if (currencyEl) {
    const currencyName =
      currentLang === "cn" ? money.nameZh || money.name || "" : money.name || "";
    currencyEl.textContent = currencyName;
    // No currency name (a shop whose cost row resolves to nothing) means no
    // header bar rather than an empty one.
    const tipEl = document.getElementById("planner-owned-tooltip");
    if (tipEl) tipEl.classList.toggle("has-head", !!currencyName);
  }

  // The shop's own currency art sits inside the field, right beside the number
  // ("123 <icon>") and again right beside the "still need" figure inside the
  // tooltip, so the numbers always name their unit without a lookup.
  const ownedIcon = document.getElementById("planner-owned-icon");
  if (ownedIcon) {
    if (money.icon) {
      ownedIcon.src = money.icon;
      ownedIcon.alt = money.name || "";
      ownedIcon.hidden = false;
    } else {
      ownedIcon.hidden = true;
      ownedIcon.removeAttribute("src");
    }
    // The field reserves the icon's room only while it is drawn.
    const field = ownedIcon.closest(".planner-owned-field");
    if (field) field.classList.toggle("has-icon", !!money.icon);
  }
  const needIcon = document.getElementById("planner-tooltip-need-icon");
  if (needIcon) {
    if (money.icon) {
      needIcon.src = money.icon;
      needIcon.alt = "";
      needIcon.hidden = false;
    } else {
      needIcon.hidden = true;
      needIcon.removeAttribute("src");
    }
  }
  // The remainder is the same currency, so it carries the same art.
  const restIcon = document.getElementById("planner-tooltip-rest-icon");
  if (restIcon) {
    if (money.icon) {
      restIcon.src = money.icon;
      restIcon.alt = "";
      restIcon.hidden = false;
    } else {
      restIcon.hidden = true;
      restIcon.removeAttribute("src");
    }
  }

  updatePlannerOwnedTooltip(totalSpend, currentOwned);
}

/**
 * The Owned tooltip follows the cursor (it is `position: fixed`, so the same
 * numbers work over the toolbar wherever it sits). It is the character card's
 * surface — `.char-tooltip` — with `.is-visible` as the switch, exactly like
 * `setupPatternTooltip()` and the tier-count tooltip.
 */
function setupPlannerOwnedTooltip() {
  const wrap = document.querySelector(".planner-owned-wrap");
  const tip = document.getElementById("planner-owned-tooltip");
  const input = document.getElementById("planner-owned-input");
  if (!wrap || !tip) return;

  const place = (x, y) => {
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    let left = x + 14;
    if (left + tw > window.innerWidth - 8) left = x - tw - 14;
    let top = y + 18;
    if (top + th > window.innerHeight - 8) top = y - th - 12;
    tip.style.left = `${Math.max(8, left)}px`;
    tip.style.top = `${Math.max(8, top)}px`;
  };

  const show = (x, y) => {
    tip.classList.add("is-visible");
    tip.setAttribute("aria-hidden", "false");
    place(x, y);
  };

  const hide = () => {
    tip.classList.remove("is-visible");
    tip.setAttribute("aria-hidden", "true");
  };

  wrap.addEventListener("pointerenter", (e) => show(e.clientX, e.clientY));
  wrap.addEventListener("pointermove", (e) => {
    if (tip.classList.contains("is-visible")) place(e.clientX, e.clientY);
  });
  wrap.addEventListener("pointerleave", () => {
    // Typing keeps it open: the field still has focus, and the figures are the
    // reason it is on screen.
    if (document.activeElement !== input) hide();
  });

  if (input) {
    // A keyboard reader never moves the pointer, so focus anchors it under the
    // field instead of leaving it wherever the mouse last was.
    input.addEventListener("focus", () => {
      const r = wrap.getBoundingClientRect();
      show(r.left + r.width / 2, r.bottom);
    });
    input.addEventListener("blur", hide);
  }
}

/**
 * A tooltip line is "label <art> figure": the word, then the art it counts, then
 * the number. The i18n string is split at its `{n}` / `{stamina}` placeholder so
 * the word and the figure can be separate nodes with the icon between them,
 * while the translators still own the whole sentence.
 */
function setPlannerTooltipLine(labelEl, valueEl, template, marker, figure) {
  // A template that lost its placeholder still reads as "label figure".
  const raw = template.indexOf(marker) >= 0 ? template : `${marker} ${template}`;
  const at = raw.indexOf(marker);
  if (labelEl) labelEl.textContent = raw.slice(0, at).trim();
  if (valueEl) valueEl.textContent = `${figure}${raw.slice(at + marker.length)}`.trim();
}

/**
 * One run of an event's currency stage costs 20 Activity and pays 300 of the
 * shop's currency, so a shop bill is paid in **whole runs**: 3,000 held against
 * an 80,850 plan is 260 runs — 5,200 Activity, not the 7,917 a fractional
 * `stillNeed / 15` produced — and those runs leave 150 of the currency over.
 */
const PLANNER_EVENT_RUN_ACTIVITY = 20;
const PLANNER_EVENT_RUN_CURRENCY = 300;

/** The runs a shop shortfall takes, the Activity they cost and the cash they bring. */
function plannerShopFarmRuns(stillNeed) {
  const runs = Math.ceil(Math.max(0, Number(stillNeed) || 0) / PLANNER_EVENT_RUN_CURRENCY);
  return {
    runs,
    activity: runs * PLANNER_EVENT_RUN_ACTIVITY,
    currency: runs * PLANNER_EVENT_RUN_CURRENCY,
  };
}

function updatePlannerOwnedTooltip(totalSpend, owned) {
  const labelEl = document.getElementById("planner-tooltip-need-label");
  const needEl = document.getElementById("planner-tooltip-need");
  const runsLabelEl = document.getElementById("planner-tooltip-runs-label");
  const runsEl = document.getElementById("planner-tooltip-runs");
  const stamLabelEl = document.getElementById("planner-tooltip-stamina-label");
  const stamEl = document.getElementById("planner-tooltip-stamina");
  const restLabelEl = document.getElementById("planner-tooltip-rest-label");
  const restEl = document.getElementById("planner-tooltip-rest");
  if (!needEl || !stamEl) return;
  const spend = Math.max(0, Number(totalSpend) || 0);
  const held = Math.max(0, Number(owned) || 0);
  const stillNeed = Math.max(0, spend - held);
  const farm = plannerShopFarmRuns(stillNeed);

  setPlannerTooltipLine(
    labelEl,
    needEl,
    t("planner.stillNeed", { n: "{n}" }),
    "{n}",
    plannerNumber(stillNeed)
  );

  setPlannerTooltipLine(
    runsLabelEl,
    runsEl,
    t("planner.farmRuns", { n: "{n}" }),
    "{n}",
    plannerNumber(farm.runs)
  );

  // The Activity is the runs' own cost, so it is always a multiple of 20. The two day
  // counts compare the day *without* the Roaring Month against the day with it, so the
  // pair never collapses into the same figure when the card is already switched on.
  const perDay = plannerActivityStaminaBase();
  const perDayRoaring = plannerActivityStaminaRoaring();
  const days = plannerNumber(Number((perDay > 0 ? farm.activity / perDay : 0).toFixed(1)));
  const daysRoaring = plannerNumber(
    Number((perDayRoaring > 0 ? farm.activity / perDayRoaring : 0).toFixed(1))
  );
  setPlannerTooltipLine(
    stamLabelEl,
    stamEl,
    t("planner.staminaCalcRoaring", { stamina: "{stamina}", days, daysRoaring }),
    "{stamina}",
    plannerNumber(farm.activity)
  );

  // What the whole runs leave once the shop is paid for: a run never lands on the
  // exact figure, so the overshoot (or a hold already past the bill) is printed
  // rather than silently dropped.
  setPlannerTooltipLine(
    restLabelEl,
    restEl,
    t("planner.remainder", { n: "{n}" }),
    "{n}",
    plannerNumber(held + farm.currency - spend)
  );
}

function openPlannerSlider(item, shop) {
  const modal = document.getElementById("planner-slider-modal");
  if (!modal || !item || !shop) return;
  plannerActiveSliderItem = { item, shop };

  const artWrap = document.getElementById("planner-slider-art-wrap");
  const nameEl = document.getElementById("planner-slider-name");
  const limitEl = document.getElementById("planner-slider-limit");
  const unitCostEl = document.getElementById("planner-slider-unit-cost");
  const rangeInput = document.getElementById("planner-slider-range");
  const numInput = document.getElementById("planner-slider-input");
  const denomEl = document.getElementById("planner-slider-denom");
  const minBtn = document.getElementById("planner-slider-min");
  const maxBtn = document.getElementById("planner-slider-max");

  const isPsychube = item.type === 9;
  const rarity = item.rarity || 5;
  const borderSrc = `images/items/border/${rarity}.webp`;
  const iconSrc = item.icon || "";
  if (artWrap) {
    artWrap.innerHTML = `
      ${!isPsychube && borderSrc ? `<img class="planner-slider-border" src="${escapeHtml(borderSrc)}" alt="" />` : ""}
      ${iconSrc ? `<img class="planner-slider-icon${isPsychube ? " is-psychube" : ""}" src="${escapeHtml(iconSrc)}" alt="" />` : ""}
    `;
  }
  if (nameEl) nameEl.textContent = plannerItemName(item);

  const unlimited = item.maxBuy === 0;
  const maxCap = unlimited ? 999 : item.maxBuy;
  if (limitEl) {
    limitEl.textContent = unlimited ? t("planner.unlimited") : t("planner.purchaseLimit", { n: item.maxBuy });
  }

  const moneyIcon = (shop.money || {}).icon
    ? `<img class="planner-cost-money" src="${escapeHtml(shop.money.icon)}" alt="" />`
    : "";
  if (unitCostEl) {
    unitCostEl.innerHTML = `${moneyIcon}<span>${escapeHtml(plannerNumber(item.cost))}</span>`;
  }

  const currentVal = plannerLimit(item, shop.id);
  if (rangeInput) {
    rangeInput.min = "0";
    rangeInput.max = String(maxCap);
    rangeInput.value = String(currentVal);
  }
  if (numInput) {
    numInput.min = "0";
    numInput.max = String(maxCap);
    numInput.value = String(currentVal);
  }
  const denomDisplay = document.getElementById("planner-slider-denom-display");
  if (denomDisplay) {
    denomDisplay.textContent = `${currentVal} / ${unlimited ? "∞" : item.maxBuy}`;
  }

  updatePlannerSliderCost(item, shop, currentVal);
  modal.hidden = false;
  if (numInput) numInput.focus();
}

function updatePlannerSliderCost(item, shop, qty) {
  const totalEl = document.getElementById("planner-slider-total-cost");
  if (!totalEl) return;
  const count = Math.max(0, Number(qty) || 0);
  const total = count * (item.cost || 0);
  const moneyIcon = (shop.money || {}).icon
    ? `<img class="planner-cost-money" src="${escapeHtml(shop.money.icon)}" alt="" />`
    : "";
  totalEl.innerHTML = `${moneyIcon}<span>${escapeHtml(plannerNumber(total))}</span>`;
}

function closePlannerSlider() {
  const modal = document.getElementById("planner-slider-modal");
  if (modal) modal.hidden = true;
  plannerActiveSliderItem = null;
}

/* ================= Planner (Calculator) =================
 * The Calculator tab answers two questions (AGENTS.md §15): how many pulls can I
 * afford by the day a banner closes, and what are the odds of owning 1…6 copies of
 * its rate-up if I spend them? It is a **ledger**, not a table:
 *
 *   data/gacha_rules.json   the price of a pull (1 Unilog = 180 Crystal Drops), the
 *                           pity curve, and `income` — the Drop Income / Drop
 *                           Outcome constants transcribed from calculator.xlsx
 *   data/banners.json       every banner the community sheet dates, joined to its
 *                           pool, with the rate-up hero and the banner's rule. The
 *                           CN-only rows of a scheduled kind carry a **predicted**
 *                           Global window (`cnStart + predictedLagDays`).
 *
 * The reader adds the banners they care about with "+ Add banner", types the pulls
 * each one gets, and the tab draws the balance those pulls leave over the span they
 * pick (1 / 2 / 3 / 6 months) — one dot per planned banner on the curve, under its
 * rate-up's portrait. Nothing is pre-selected and nothing is projected into a second
 * pane: the cards carry their own odds.
 *
 * P0…P5 is **not** a binomial: a pull is not independent because the counter that
 * guarantees a 6★ at 70 makes it a Markov chain. `calcDistribution()` runs the
 * exact distribution over `(pity, lost 50/50, copies)` — 980 states, one pass per
 * pull — so the numbers are right in the 60–70 band where a binomial is wildly
 * optimistic.
 *
 * **Pity is not one counter.** A pull banks into the counter its banner actually
 * spends, and the game keeps them apart: Debut and Rerun share one (`rateUp`),
 * Ripples on the Water keeps its own (`ripples`), and Limited / Event / Collab /
 * Yearning banners each carry a counter nothing else can see (`solo`). So the tab
 * asks for two "pulls since 6★" figures, not one — see `calcPityOf()`.
 *
 * State lives in `r1999_calculator_v1`. Like a build plan it spans patches, so it
 * is not patch-stamped; only a banner id the shipped data no longer names (or one
 * whose window closed) is dropped on load.
 */
const CALC_STORAGE_KEY = "r1999_calculator_v1";
/** The chart's window, in months: the reader picks one of these. */
const CALC_SPANS = [1, 2, 3, 6];
const CALC_DEFAULT_SPAN = 6;
/** A month is 30 days — the ledger's own unit (`/month` yields are priced the same). */
const CALC_DAYS_PER_MONTH = 30;
/** How many days the curve draws: the span the reader picked. */
function calcChartDays() {
  return Math.max(1, calcMonths) * CALC_DAYS_PER_MONTH;
}
/** Kinds the banner picker never offers: no rate-up, and they never close. */
const CALC_SKIP_TYPES = new Set(["Standard", "Beginner"]);
/** How many rate-up heads a picker row draws before it prints an ellipsis (`…`). */
const CALC_PICK_HEADS = 3;
/** The fields that are tick boxes rather than number inputs. */
const CALC_TOGGLES = new Set([
  "guaranteedRateUp",
  "guaranteedRipples",
  "roaring",
  "jukebox",
  "offer",
  "limbo",
  "login",
  "jukeboxFree",
  "bass",
  "storyStage",
  "characterStory",
  "webEvent",
  "eventShop",
  "useCrystal",
]);
/** `data/banners.json` / `data/gacha_rules.json`, filled by `buildCalculatorData`. */
let calcHistory = null;
let calcRules = null;
/** `(rule, pulls, pity)` -> `[P0…P5]`; see `calcDistribution()`. */
const calcDistCache = new Map();
/** The `calcSchedule()` memo: the tab repaints on every keystroke. */
let calcScheduleCache = { key: "", value: null };

/* Current amounts. */
let calcCrystal = 0; // Crystal Drop (paid)
let calcClear = 0; // Clear Drop (freely earned)
let calcUnilog = 0; // Unilog — the pull token itself
/* Pity, one counter per track the game keeps. A Debut or a Rerun banks into the
 * `rateUp` counter; Ripples on the Water banks into its own; every other kind keeps
 * a counter of its own that nothing shares, so it always starts at zero. */
let calcPityRateUp = 0;
let calcGuaranteedRateUp = false;
let calcPityRipples = 0;
let calcGuaranteedRipples = false;

/* Drop income — the free half (F2P). The purses are kept apart because the reader
 * earns them from different sources: the tasks, Limbo and the patch bundles pay
 * **Clear Drops**, and the login events, the event shop and the Jukebox pay
 * **Unilogs**. Everything in this half is free, so everything starts ticked: a reader
 * who does not clear a story stage can untick it, but the default is the whole free set. */
let calcLimbo = true; // Limbo (1st) / Lucidscape (16th): 700 Clear Drops each
let calcBass = true; // Bass Counter: 10 Unilogs a month, on the 1st
let calcLogin = true; // the 7 / 15 / 25-day login track: 180 Clear Drops a month
let calcJukeboxFree = true; // the Roar Jukebox's two free Unilogs a patch
let calcStoryStage = true; // every story stage cleared, 1,200 Clear Drops a patch
let calcCharacterStory = true; // every character story, 480 Clear Drops a patch
let calcWebEvent = true; // web events and surveys, 120 Clear Drops a patch
let calcEventShop = true; // the event shop's free Unilogs, 2 a patch

/* Drop income — the paid half (Spender). Buying any of these is a purchase, so all
 * three start off and the reader opts in. */
let calcRoaring = false; // Roaring Month: 300 Crystal Drops up front, then 90 Clear a day for 30 days
let calcJukebox = false; // Collector's Edition (Roar Jukebox): 5 extra Unilogs a patch
let calcOffer = false; // Offer of the Month: 1,800 Clear Drops + 10 Unilogs on the 1st
let calcMonthly = 0; // Unilogs in the monthly package, on the 1st
let calcPatchly = 0; // Unilogs in the patchly package, on the patch start

/* Drop outcome — all of it is Crystal Drop. */
let calcDaily = 0; // index into `income.dailyPurchasing`
let calcOther = 0; // Crystal Drops spent on the 1st
let calcUseCrystal = false; // count Crystal Drop toward the pulls at all

/* The chart's span, in months. */
let calcMonths = CALC_DEFAULT_SPAN;

/* The plan: the banners the reader added, and the pulls each one gets. */
let calcList = [];
let calcPlans = {};

/* The two popups. */
let calcPickerQuery = "";
let calcInfoId = "";

function calcNumber(value) {
  return plannerNumber(Math.max(0, Math.round(Number(value) || 0)));
}

/** A signed figure: `-1,240` keeps its minus, which the ledger needs. */
function calcSigned(value) {
  const n = Math.round(Number(value) || 0);
  return `${n < 0 ? "-" : ""}${plannerNumber(Math.abs(n))}`;
}

/** One of the three currency rows of `data/gacha_rules.json` (0 crystal, 1 clear, 2 unilog). */
function calcCurrency(index) {
  return ((calcRules && calcRules.currencies) || [])[index] || {};
}

/** The art of a currency, sized for a figure: it stands in for the word "pulls". */
function calcCurrencyIcon(index) {
  const row = calcCurrency(index);
  const src = row.icon || "";
  if (!src) return "";
  return `<img class="calc-pull-icon" src="${escapeHtml(src)}" alt="${escapeHtml(calcCurrencyName(index))}" />`;
}

/** A currency's name in the reader's language: `Unilog` / 独一律. */
function calcCurrencyName(index) {
  const row = calcCurrency(index);
  if (currentLang === "cn") return row.nameZh || row.name || "";
  return row.name || "";
}

/** `132` -> `132 <unilog>`, the figure every bar, pill and summary cell prints. */
function calcPullFigure(value) {
  return `${calcNumber(value)}${calcCurrencyIcon(2)}`;
}

/** `0.4712` -> `"47.1%"`; the extremes print exactly, everything else has a decimal. */
function calcPercent(ratio) {
  const value = Math.max(0, Math.min(1, Number(ratio) || 0));
  if (value <= 0.0005) return "0%";
  if (value >= 0.9995) return "100%";
  return `${(value * 100).toFixed(1)}%`;
}

const calcPad = (n) => String(n).padStart(2, "0");

/** Today, in the reader's own calendar (the ledger's weekdays are local days). */
function calcToday() {
  const d = new Date();
  return `${d.getFullYear()}-${calcPad(d.getMonth() + 1)}-${calcPad(d.getDate())}`;
}

/** `2026-11-05` -> a Date at 00:00 UTC, so day arithmetic never sees a time zone. */
function calcDate(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function calcIso(date) {
  return `${date.getUTCFullYear()}-${calcPad(date.getUTCMonth() + 1)}-${calcPad(date.getUTCDate())}`;
}

/** Whole days from `today` to `iso` (negative when the date already passed). */
function calcDaysUntil(iso) {
  if (!iso) return 0;
  return Math.round((calcDate(iso).getTime() - calcDate(calcToday()).getTime()) / 86400000);
}

/** `2026-11-05` -> `11/05`, the way the sheet writes a date. */
function calcShortDate(iso) {
  return iso ? `${iso.slice(5, 7)}/${iso.slice(8, 10)}` : "—";
}

/** The banner's name, in the reader's language and nothing else — the patch it ships
 * in is a tag of its own (`calcVersionTag()`), printed beside the name. */
function calcBannerName(banner) {
  if (!banner) return "";
  return currentLang === "cn" ? banner.nameZh || banner.name : banner.name;
}

/**
 * The patch the community sheet files the banner under (`3.9`, `4.0`, `AH Collab`).
 * It labels the *content*, which both servers ship, so a prediction carries its CN
 * run's label. It is data, never translated, and every banner surface prints it as a
 * tag rather than inside the name.
 */
function calcVersionTag(banner) {
  return String((banner && banner.version) || "").trim();
}

/** The ledger constants `data/gacha_rules.json` ships (transcribed from the sheet). */
function calcLedger() {
  return (calcRules && calcRules.income) || {};
}

/** The shop price of one pull: 180 Crystal Drops in `data/gacha_rules.json`. */
function calcDropsPerPull() {
  return Math.max(1, Number((calcRules && calcRules.pull && calcRules.pull.dropsPerUnilog) || 180));
}

/* ---------- the day-by-day balance ---------- */

/**
 * A patch starts every `patch.days` days from `patch.anchor`. Everything the client
 * hands over when a patch goes live lands on that day — the maintenance and warm-up
 * compensations, the login event, the Jukebox pulls, the free event-shop Unilogs and
 * the patchly package — so the lattice is all the ledger needs.
 */
function calcPatchStart(date) {
  const patch = calcLedger().patch || {};
  const span = Math.max(1, Number(patch.days) || 42) * 86400000;
  const anchor = patch.anchor ? calcDate(patch.anchor).getTime() : calcDate("2026-08-13").getTime();
  const diff = date.getTime() - anchor;
  return ((diff % span) + span) % span === 0;
}

/** Whole days from one ISO date to another (negative when `to` already passed). */
function calcDaysBetween(fromIso, toIso) {
  return Math.round((calcDate(toIso).getTime() - calcDate(fromIso).getTime()) / 86400000);
}

/**
 * Does the patch that opened on `iso` run a **Limited** banner? The cumulative login
 * event pays 20 Unilogs on such a patch and 14 on any other, so the sign-in figure is
 * read off the banner schedule rather than guessed.
 */
function calcPatchLimited(iso) {
  const patch = calcLedger().patch || {};
  const start = calcDate(iso).getTime();
  const end = start + (Math.max(1, Number(patch.days) || 42) - 1) * 86400000;
  return ((calcHistory && calcHistory.banners) || []).some((row) => {
    if (row.server !== "global" || row.type !== "Limited" || !row.start) return false;
    const at = calcDate(row.start).getTime();
    return at >= start && at <= end;
  });
}

/**
 * What one calendar day pays in, split by the purse it lands in. Every line is a
 * column of the ledger: the tasks every day and every Monday, Limbo on its two
 * resets, the monthly resets on the 1st, and the patch-stamped sources on a patch
 * start. The reader's tick boxes only switch the optional ones on.
 *
 * Returns `{ unilog, clear, crystal, total }`, where `total` is what the whole day is
 * worth in drops (one Unilog is 180 of them).
 */
function calcIncomeOn(date) {
  const ledger = calcLedger();
  const per = calcDropsPerPull();
  const dom = date.getUTCDate();
  const dow = date.getUTCDay();
  const out = { unilog: 0, clear: 0, crystal: 0 };

  // The free daily baseline: Daily Tasks pay 90 Clear Drops every day and the Weekly
  // Task another 100 on its own weekday.
  const tasks = ledger.dailyTasks || {};
  out.clear += Number(tasks.weekday) || 0;
  const weekly = ledger.weeklyTask || {};
  if (dow === (Number(weekly.weekday) || 0)) out.clear += Number(weekly.drops) || 0;

  // Limbo (1st) and Lucidscape (16th) are two resets of the same 1,400 reward.
  const limbo = ledger.limbo || {};
  if (calcLimbo && (limbo.days || []).includes(dom)) out.clear += Number(limbo.drops) || 0;

  // The login track (7 / 15 / 25 days) hands its Clear Drops over once a month.
  const login = ledger.cumulativeLogin || {};
  if (calcLogin && dom === (Number(login.day) || 1)) out.clear += Number(login.drops) || 0;

  // Roaring Month is a 30-day pass, not a permanent rate: 300 Crystal Drops on its
  // first day, then 90 Clear Drops a day until it lapses, and then it renews. The
  // clock is anchored to the day the tab is opened, so the curve is stable.
  if (calcRoaring) {
    const roaring = ledger.roaringMonth || {};
    const span = Math.max(1, Number(roaring.days) || 30);
    const phase = ((calcDaysBetween(calcToday(), calcIso(date)) % span) + span) % span;
    if (phase === 0) out.crystal += Number(roaring.instantCrystal) || 0;
    out.clear += Number(roaring.drops) || 0;
  }

  // The monthly resets, all on the 1st unless the ledger says otherwise.
  const offer = ledger.offerOfTheMonth || {};
  if (calcOffer && dom === (Number(offer.day) || 1)) {
    out.clear += Number(offer.clear) || 0;
    out.unilog += Number(offer.unilog) || 0;
  }
  const bass = ledger.bassCounter || {};
  if (calcBass && dom === (Number(bass.day) || 1)) out.unilog += Number(bass.pulls) || 0;
  if (calcMonthly > 0 && dom === 1) out.unilog += calcMonthly;

  // Everything a new patch hands over on its first day.
  const patch = ledger.patch || {};
  if (calcPatchStart(date)) {
    out.clear += Number(patch.maintenanceCompensation) || 0;
    out.clear += Number(patch.warmupLogin) || 0;
    out.clear += Number(patch.devBroadcast) || 0;
    // The Jukebox pays two free pulls to everyone and five more to a Collector's
    // Edition owner, so the two are separate lines (and separate tick boxes) rather
    // than one 7.
    if (calcJukeboxFree) out.unilog += Number(patch.jukeboxFreePulls) || 0;
    if (calcJukebox) out.unilog += Number(patch.jukeboxCollectorPulls) || 0;
    // The cumulative login event pays more on a patch that runs a Limited banner.
    const signIn = patch.signIn || {};
    out.unilog += calcPatchLimited(calcIso(date))
      ? Number(signIn.limited) || 0
      : Number(signIn.standard) || 0;
    if (calcStoryStage) out.clear += Number(patch.storyStage) || 0;
    if (calcCharacterStory) out.clear += Number(patch.characterStory) || 0;
    if (calcWebEvent) out.clear += Number(patch.webEventSurvey) || 0;
    if (calcEventShop) out.unilog += Number(patch.eventShopPulls) || 0;
    if (calcPatchly > 0) out.unilog += calcPatchly;
  }
  out.total = out.clear + out.crystal + out.unilog * per;
  return out;
}


/** What one calendar day costs *besides* pulls. Everything here is Crystal Drop. */
function calcOutcomeOn(date) {
  const ledger = calcLedger();
  const table = Array.isArray(ledger.dailyPurchasing) ? ledger.dailyPurchasing : [];
  let total = Number(table[calcDaily]) || 0;
  if (calcOther > 0 && date.getUTCDate() === 1) total += calcOther;
  return total;
}

/**
 * The chart's window, day by day: income, spending, and the balance the plan leaves.
 *
 * Three purses are walked — Unilog, Clear Drop, Crystal Drop — because the reader
 * does not pre-convert one into the other. `calcUseCrystal` decides whether the paid
 * purse counts toward the pulls at all (it is off by default: a reader who does not
 * touch Crystal Drop should not be told they can afford more than they can).
 *
 * Two balances are tracked: `balance` is what the reader is left with (the planned
 * pulls deducted) and is what the chart draws; `gross` ignores the plan and is what a
 * card's "by end" pill reports, so planning a banner never changes how many pulls
 * that banner says you can afford.
 */
function calcSchedule() {
  const per = calcDropsPerPull();
  const today = calcToday();
  const start = calcDate(today);
  const days = calcChartDays();
  const held = {
    unilog: Math.max(0, Math.floor(Number(calcUnilog) || 0)),
    clear: Math.max(0, Math.floor(Number(calcClear) || 0)),
    crystal: Math.max(0, Math.floor(Number(calcCrystal) || 0)),
  };
  /** What a set of purses is worth in drops — the paid one only when it counts. */
  const worth = (purse) => purse.unilog * per + purse.clear + (calcUseCrystal ? purse.crystal : 0);

  // A banner spends its pulls on its release day, or today when it is already
  // running — the reader is pulling now, not in the past. A banner that releases
  // past the chart's window is spent on the last day the chart draws, so the plan
  // still costs what it costs and its dot is still on the curve.
  const lastDay = calcIso(new Date(start.getTime() + days * 86400000));
  const pullDays = new Map();
  for (const banner of calcListBanners()) {
    const pulls = calcPulls(banner.id);
    if (!pulls) continue;
    const cost = calcBannerCostPulls(banner, pulls);
    let when = banner.start && banner.start > today ? banner.start : today;
    if (when > lastDay) when = lastDay;
    if (!pullDays.has(when)) pullDays.set(when, []);
    pullDays.get(when).push({ id: banner.id, pulls, cost });
  }

  const points = [];
  const dots = [];
  let balance = worth(held);
  let gross = balance;
  let planned = 0;
  // The purses as they stand, so the summary can print what is left in each.
  const purse = { ...held };

  /**
   * Pays `pulls` out of the purses, Unilogs first (they *are* the token), then Clear
   * Drops, then Crystal Drops when that purse counts. What the purses cannot cover is
   * not withdrawn — the balance below goes negative instead, which is the signal the
   * plan is out of reach.
   */
  const pay = (pulls) => {
    let owed = pulls;
    const fromUni = Math.min(Math.max(0, purse.unilog), owed);
    purse.unilog -= fromUni;
    owed -= fromUni;
    const fromClear = Math.min(Math.floor(Math.max(0, purse.clear) / per), owed);
    purse.clear -= fromClear * per;
    owed -= fromClear;
    if (calcUseCrystal) {
      const fromCrystal = Math.min(Math.floor(Math.max(0, purse.crystal) / per), owed);
      purse.crystal -= fromCrystal * per;
      owed -= fromCrystal;
    }
    return owed;
  };

  for (let i = 0; i <= days; i += 1) {
    const date = new Date(start.getTime() + i * 86400000);
    const iso = calcIso(date);
    const income = calcIncomeOn(date);
    const spend = calcOutcomeOn(date);
    purse.unilog += income.unilog;
    purse.clear += income.clear;
    purse.crystal += income.crystal - spend;
    const net = income.unilog * per + income.clear + (calcUseCrystal ? income.crystal - spend : 0);

    const entries = pullDays.get(iso) || [];
    const pulled = entries.reduce((sum, entry) => sum + entry.cost, 0);
    const asked = entries.reduce((sum, entry) => sum + entry.pulls, 0);
    balance += net - pulled * per;
    gross += net;
    planned += pulled;
    pay(pulled);
    points.push({
      iso,
      index: i,
      income: income.total,
      spend: spend + pulled * per,
      pulls: pulled,
      asked,
      balance,
      gross,
    });
    entries.forEach((entry, slot) => {
      dots.push({
        id: entry.id,
        index: i,
        iso,
        pulls: entry.pulls,
        cost: entry.cost,
        balance,
        slot,
        slots: entries.length,
      });
    });
  }
  return { points, dots, per, today, days, held: worth(held), heldPurse: held, purse, planned };
}

/**
 * Every input the schedule reads, as one string. The balance memo and the
 * max-pulls memo share it, so both move with the same fields.
 */
function calcScheduleKey() {
  return [
    calcCrystal,
    calcClear,
    calcUnilog,
    calcLimbo ? 1 : 0,
    calcBass ? 1 : 0,
    calcStoryStage ? 1 : 0,
    calcCharacterStory ? 1 : 0,
    calcWebEvent ? 1 : 0,
    calcEventShop ? 1 : 0,
    calcRoaring ? 1 : 0,
    calcJukebox ? 1 : 0,
    calcOffer ? 1 : 0,
    calcMonthly,
    calcPatchly,
    calcDaily,
    calcOther,
    calcUseCrystal ? 1 : 0,
    calcMonths,
    calcListBanners()
      .map((banner) => `${banner.id}:${calcPulls(banner.id)}`)
      .join(","),
  ].join("|");
}

/** The schedule, rebuilt only when one of its inputs moved. */
function calcScheduleMemo() {
  const key = calcScheduleKey();
  if (calcScheduleCache.key !== key) calcScheduleCache = { key, value: calcSchedule() };
  return calcScheduleCache.value;
}

/** The max-pulls walk per banner, rebuilt only when the schedule's inputs moved. */
let calcMaxPullsCache = { key: "", value: null };
/** A year of walk at most, so a hand-edited banner date cannot spin here. */
const CALC_MAX_PULLS_DAYS = 366;

/**
 * The most pulls the reader can put into the banner, by that banner's own closing day:
 * everything held and earned up to then, minus what the *rest* of the plan spends on
 * the way there. A card never shrinks its own ceiling as the reader types into it —
 * its own planned pulls are handed back — so the box answers "how far can I go on this
 * one?" rather than "how much is left after I decided?".
 *
 * Every figure here is in **pulls**: the earnings are floored into pulls the day they
 * land, so one planned pull costs exactly one of them. Charging pulls against drops
 * under-charged the plan and let a typed count *raise* the ceiling.
 *
 * Unlike the `By end` pill (the income alone, plan ignored) this follows the plan, and
 * unlike the chart it reaches past the picked span: a banner's end is what decides how
 * long the reader has to save for it.
 */
function calcMaxPullsMap() {
  const key = calcScheduleKey();
  if (calcMaxPullsCache.key === key) return calcMaxPullsCache.value;

  const per = calcDropsPerPull();
  const today = calcToday();
  const start = calcDate(today);
  const held = {
    unilog: Math.max(0, Math.floor(Number(calcUnilog) || 0)),
    clear: Math.max(0, Math.floor(Number(calcClear) || 0)),
    crystal: Math.max(0, Math.floor(Number(calcCrystal) || 0)),
  };
  const worth = (purse) => purse.unilog * per + purse.clear + (calcUseCrystal ? purse.crystal : 0);

  // Each planned banner is charged on the day `calcSchedule()` charges it: its release
  // day, or today when it is already running.
  const rows = calcListBanners().map((row) => {
    const pulls = calcPulls(row.id);
    return {
      id: row.id,
      own: pulls ? calcBannerCostPulls(row, pulls) : 0,
      when: row.start && row.start > today ? row.start : today,
      end: row.end || row.start || today,
    };
  });

  const horizon = rows.reduce((max, row) => (row.end > max ? row.end : max), today);
  const days = Math.max(0, Math.min(CALC_MAX_PULLS_DAYS, calcDaysUntil(horizon)));
  // Both columns are **pulls**, never drops: the earnings are floored into pulls the
  // day they land, so a planned pull costs one of them. Mixing the two — drops earned
  // against pulls spent — under-charged the plan and made a typed count *raise* the
  // ceiling, because the add-back below was in drops while the charge was in pulls.
  const earnings = [];
  const spends = [];
  let gross = worth(held);
  let planned = 0;
  for (let i = 0; i <= days; i += 1) {
    const date = new Date(start.getTime() + i * 86400000);
    const iso = calcIso(date);
    const income = calcIncomeOn(date);
    const outcome = calcOutcomeOn(date);
    gross += income.unilog * per + income.clear + (calcUseCrystal ? income.crystal - outcome : 0);
    planned += rows.filter((row) => row.when === iso).reduce((sum, row) => sum + row.own, 0);
    earnings.push(Math.floor(gross / per));
    spends.push(planned);
  }

  const out = {};
  for (const row of rows) {
    const day = Math.max(0, Math.min(days, calcDaysUntil(row.end)));
    // What the rest of the plan takes on the way to this banner's last day, and this
    // banner's own pulls handed back so the box never shrinks under the reader's typing.
    const available = earnings[day] - (spends[day] - row.own);
    out[row.id] = Math.max(0, Math.min(9999, available));
  }
  calcMaxPullsCache = { key, value: out };
  return out;
}

/** The max-pulls ceiling of one banner (`0` for one that is not in the plan). */
function calcMaxPulls(banner) {
  if (!banner) return 0;
  return calcMaxPullsMap()[banner.id] || 0;
}

/** How many pulls the income alone covers by the end of `iso`. */
function calcPullsBy(iso) {
  const schedule = calcScheduleMemo();
  if (!iso) return 0;
  const day = Math.max(0, Math.min(schedule.days, calcDaysUntil(iso)));
  return Math.max(0, Math.floor(schedule.points[day].gross / schedule.per));
}

/** How many pulls the reader is left with when the plan is done. */
function calcPullsLeft() {
  const schedule = calcScheduleMemo();
  return Math.floor(schedule.points[schedule.points.length - 1].balance / schedule.per);
}

/* ---------- the banners ---------- */

function calcBanner(id) {
  const rows = (calcHistory && calcHistory.banners) || [];
  return rows.find((row) => row.id === id) || null;
}

/** `ended` / `current` / `upcoming`, from the sheet's two dates. */
function calcStatus(banner) {
  const today = calcToday();
  if (banner.end && banner.end < today) return "ended";
  if (banner.start && banner.start > today) return "upcoming";
  return "current";
}

function calcSortByStart(a, b) {
  const sa = a.start || "9999";
  const sb = b.start || "9999";
  if (sa !== sb) return sa < sb ? -1 : 1;
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

/**
 * The reader's plan, by release date: the banner that opened first comes first, so
 * the list reads like the schedule. A banner whose window closed is gone — there is
 * nothing left to pull on — even if it was in the saved list.
 */
function calcListBanners() {
  const today = calcToday();
  return calcList
    .map((id) => calcBanner(id))
    .filter((banner) => banner && !(banner.end && banner.end < today))
    .sort(calcSortByStart);
}

/**
 * The picker's pool: every Global banner of a scheduled kind that can still be
 * pulled on and is not already in the plan — announced runs and the CN-only
 * predictions alike, in release order.
 */
function calcPickerPool() {
  const today = calcToday();
  const added = new Set(calcList);
  return ((calcHistory && calcHistory.banners) || [])
    .filter((row) => row.server === "global" && !CALC_SKIP_TYPES.has(row.type) && row.start)
    .filter((row) => !added.has(row.id))
    .filter((row) => (row.end || row.start) >= today)
    .sort(calcSortByStart);
}

/** What the picker shows: the pool narrowed by the search box. */
function calcPickerBanners() {
  const query = calcPickerQuery.trim().toLowerCase();
  return calcPickerPool()
    .filter(
      (row) =>
        !query ||
        String(row.name || "").toLowerCase().includes(query) ||
        // The version is part of the printed name (`[3.9] …`), so it is searchable too.
        String(row.version || "").toLowerCase().includes(query) ||
        String(row.nameZh || "").includes(calcPickerQuery.trim())
    )
    .sort(calcSortByStart);
}

/**
 * How large a field may get. The drop fields hold drops, so they need room for a
 * real hoard (100 pulls is 18,000); the rest count pulls or Unilogs, which never
 * run that high. A hand-edited localStorage blob is clamped to the same bound.
 */
function calcFieldCap(key) {
  return key === "crystal" || key === "clear" || key === "other" ? 999999 : 9999;
}

/** The pull count planned for one banner. */
function calcPulls(bannerId) {
  return Math.max(0, Math.min(9999, Math.floor(Number(calcPlans[bannerId]) || 0)));
}

function calcSetPulls(bannerId, pulls) {
  const value = Math.max(0, Math.min(9999, Math.floor(Number(pulls) || 0)));
  if (value) calcPlans[bannerId] = value;
  else delete calcPlans[bannerId];
  calcSaveState();
}

function calcAddBanner(id) {
  if (!id || calcList.includes(id) || !calcBanner(id)) return;
  calcList.push(id);
  calcSaveState();
}

function calcRemoveBanner(id) {
  calcList = calcList.filter((entry) => entry !== id);
  delete calcPlans[id];
  if (calcInfoId === id) calcInfoId = "";
  calcSaveState();
}

/**
 * The banner's rule with its per-6★ chance resolved. `inGroup` has no 50/50: the
 * game guarantees every 6★ is one of the N the reader picked, so the chance a
 * given one arrives is `1/choose`. A `thread` banner hands out a Thread and
 * nothing else, so it can never grant a second copy.
 */
function calcRuleOf(banner) {
  const rule = Object.assign(
    {
      kind: "none",
      share: 0.5,
      choose: 0,
      guarantee: false,
      separatePity: false,
      freePulls: 0,
      discountFirst10: 0,
      maxPulls: 0,
      track: "solo",
      selectFirstSix: false,
      copyExchange: null,
    },
    (banner && banner.rule) || {}
  );
  const copies = Math.max(1, Number((calcRules && calcRules.portraitCopies) || 6));
  if (rule.kind === "inGroup") {
    const n = Number(rule.choose) || (banner.targets || []).length || 1;
    return { ...rule, share: 1 / Math.max(1, n), maxCopies: copies };
  }
  if (rule.kind === "thread") return { ...rule, share: 1, guarantee: false, maxCopies: 1 };
  return { ...rule, maxCopies: copies };
}

/**
 * Which pity counter a banner spends and banks. The game keeps three kinds apart:
 * Debut and Rerun share the `rateUp` counter, Ripples on the Water has one of its
 * own (`ripples`), and Limited / Event / Collab / Yearning banners each carry a
 * counter nothing else can see (`solo`) — so a freshly planned one always starts
 * at zero. The track rides on the banner's rule, so a data change moves the tab.
 */
function calcTrackOf(banner) {
  return (banner && banner.rule && banner.rule.track) || "solo";
}

/** The reader's counter for the track the banner spends. */
function calcPityOf(banner) {
  const track = calcTrackOf(banner);
  if (track === "rateUp") return { track, pity: calcPityRateUp, guaranteed: calcGuaranteedRateUp };
  if (track === "ripples") return { track, pity: calcPityRipples, guaranteed: calcGuaranteedRipples };
  return { track, pity: 0, guaranteed: false };
}

/**
 * What a banner's plan actually costs, in pulls. The typed count is not always the
 * price: a Limited banner hands out a free ten-pull at its patch start, and Ripples
 * charges 7 Unilogs for the first ten-pull of a patch instead of 10.
 */
function calcBannerCostPulls(banner, pulls) {
  const count = Math.max(0, Math.floor(Number(pulls) || 0));
  if (!count) return 0;
  const rule = calcRuleOf(banner);
  let cost = count - Math.max(0, Number(rule.freePulls) || 0);
  const discount = Math.max(0, Number(rule.discountFirst10) || 0);
  if (discount && count >= 10) cost -= discount;
  return Math.max(0, cost);
}

/**
 * The odds of the planned pulls on *this* banner: the counter it spends, plus the
 * banner's own quirks. Ripples hands its first 6★ to a character selector, which is
 * the same arithmetic as a banked 50/50 loss, so `selectFirstSix` is folded into the
 * guaranteed flag rather than growing a second state in the chain.
 */
function calcOddsOf(banner, pulls) {
  const rule = calcRuleOf(banner);
  if (rule.kind !== "rateUp") return calcDistribution(rule, pulls, 0, false);
  const state = calcPityOf(banner);
  return calcDistribution(rule, pulls, state.pity, state.guaranteed || !!rule.selectFirstSix);
}


/**
 * The exact distribution of how many copies of the rate-up a run of `pulls` buys.
 *
 * State is `(pity, lost, copies)`: `pity` is how many pulls in a row missed, so
 * the pull about to happen is number `pity + 1`; `lost` says the last 6★ was not
 * the rate-up (only meaningful on a banner with a guarantee); `copies` is capped
 * at the number of portraits, since P5 is the last thing reported.
 *
 * Returns `[P0…P5]`, where `Pk = P(owning at least k+1 copies)`.
 */
function calcDistribution(rule, pulls, pity, guaranteed) {
  const rates = (calcRules && calcRules.rates) || {};
  const curve = (calcRules && calcRules.pity) || {};
  const hard = Number(curve.hard) || 70;
  const soft = Number(curve.soft) || 60;
  const base = Number(rates.sixStar) || 0.015;
  const softRate = Number(rates.softPity) || 0.05;
  const cap = Math.max(1, Number(rule.maxCopies) || 6);
  const share = Math.max(0, Math.min(1, Number(rule.share) || 0));
  const guarantee = !!rule.guarantee;

  // The chain has to be walked pull by pull: more pulls can always add a copy, so
  // stopping early would understate P5. 4,000 pulls is ~720k drops and puts the
  // last level within float precision of certainty, which is the only ceiling worth
  // applying — a hand-edited blob claiming a billion pulls must not freeze the tab.
  const runs = Math.max(0, Math.min(Math.floor(Number(pulls) || 0), 4000));
  // The pull that ends a window is guaranteed, so the counter never reaches it.
  const span = hard; // 0 .. hard-1 are reachable counters
  const slots = span * 2 * (cap + 1);
  const at = (p, lost, count) => (p * 2 + lost) * (cap + 1) + count;

  const memo = `${base}|${softRate}|${soft}|${hard}|${share}|${guarantee ? 1 : 0}|${cap}|${runs}|${
    guaranteed ? 1 : 0
  }|${Math.max(0, Math.min(span - 1, Math.floor(Number(pity) || 0)))}|${calcExchangeKey(rule)}`;
  if (calcDistCache.has(memo)) return calcDistCache.get(memo);

  let cur = new Float64Array(slots);
  const startPity = Math.max(0, Math.min(span - 1, Math.floor(Number(pity) || 0)));
  cur[at(startPity, guaranteed ? 1 : 0, 0)] = 1;

  for (let n = 0; n < runs; n += 1) {
    const next = new Float64Array(slots);
    for (let p = 0; p < span; p += 1) {
      const pull = p + 1;
      const p6 = pull >= hard ? 1 : pull > soft ? softRate : base;
      for (let lost = 0; lost < 2; lost += 1) {
        for (let count = 0; count <= cap; count += 1) {
          const weight = cur[at(p, lost, count)];
          if (!weight) continue;
          if (p6 < 1) {
            next[at(p + 1, lost, count)] += weight * (1 - p6);
          }
          const chance = lost ? 1 : share;
          if (chance > 0) {
            next[at(0, 0, count < cap ? count + 1 : cap)] += weight * p6 * chance;
          }
          if (chance < 1 && p6 > 0) {
            next[at(0, guarantee ? 1 : 0, count)] += weight * p6 * (1 - chance);
          }
        }
      }
    }
    cur = next;
  }

  const odds = new Array(cap + 1).fill(0);
  for (let p = 0; p < span; p += 1) {
    for (let lost = 0; lost < 2; lost += 1) {
      for (let count = 0; count <= cap; count += 1) {
        odds[count] += cur[at(p, lost, count)];
      }
    }
  }
  // `odds[k]` counts owners of *exactly* k copies; Pn is "at least n+1".
  const out = [];
  for (let level = 0; level < 6; level += 1) {
    let sum = 0;
    for (let count = level + 1; count <= cap; count += 1) sum += odds[count];
    out.push(sum);
  }
  // **The patch's first Limited banner sells portraits.** Every `copyExchange.pulls`
  // pulls of the run can be traded for `copyExchange.copies` bonus copies, and the
  // trade **repeats**: 560 pulls on a 200-pull banner buys two of them. Each traded
  // copy is not a roll, so it lifts every level by that many — P5 becomes what P3 was,
  // P4 what P2 was, and the levels it fills are a certainty. The trade costs the pulls
  // already made, not extra Unilogs, which is why the price is untouched.
  const exchange = calcExchange(rule);
  const traded = exchange ? exchange.copies * Math.floor(runs / exchange.pulls) : 0;
  if (traded > 0) {
    const base = out.slice();
    const shift = Math.min(6, traded);
    for (let level = 0; level < 6; level += 1) {
      out[level] = level < shift ? 1 : base[level - shift];
    }
  }
  // One entry per (rule, plan, pity) combination; the tab repaints on every
  // keystroke, and an unchanged banner must not re-walk its chain.
  if (calcDistCache.size > 800) calcDistCache.clear();
  calcDistCache.set(memo, out);
  return out;
}

/** A rule's copy exchange as `{ pulls, copies }`, or `null` when it has none. */
function calcExchange(rule) {
  const exchange = rule && rule.copyExchange;
  if (!exchange) return null;
  const pulls = Math.floor(Number(exchange.pulls) || 0);
  const copies = Math.floor(Number(exchange.copies) || 0);
  if (pulls < 1 || copies < 1) return null;
  return { pulls, copies };
}

/** The exchange as a cache-key fragment, so a rule with it never reuses a plain run. */
function calcExchangeKey(rule) {
  const exchange = calcExchange(rule);
  return exchange ? `${exchange.pulls}x${exchange.copies}` : "-";
}

function calcRuleNote(banner) {
  const rule = calcRuleOf(banner);
  if (rule.kind === "inGroup") return t("planner.calcRuleInGroup", { n: Math.round(1 / rule.share) });
  if (rule.kind === "thread") return t("planner.calcRuleThread");
  if (rule.kind === "rateUp") return t("planner.calcRuleRateUp", { p: calcPercent(rule.share) });
  return t("planner.calcRuleNone");
}

/**
 * A banner's own mechanical quirks, as one sentence each: the pity counter it
 * shares, the free ten-pull a Limited banner opens its patch with, the ten-pull
 * discount Ripples gives, the selector its first 6★ is, and the portrait a Limited
 * patch's first banner trades for 200 pulls. They are generated from the rule the data
 * ships, so a new quirk only has to be declared once.
 */
function calcRuleNotes(banner) {
  const rule = calcRuleOf(banner);
  const notes = [];
  const track = calcTrackOf(banner);
  if (track === "rateUp") notes.push(t("planner.calcTrackRateUp"));
  else if (track === "ripples") notes.push(t("planner.calcTrackRipples"));
  else notes.push(t("planner.calcTrackSolo"));
  if (Number(rule.freePulls) > 0) notes.push(t("planner.calcFreePulls", { n: calcNumber(rule.freePulls) }));
  if (Number(rule.discountFirst10) > 0) {
    notes.push(t("planner.calcDiscount", { n: calcNumber(rule.discountFirst10) }));
  }
  if (rule.selectFirstSix) notes.push(t("planner.calcSelectFirst"));
  const exchange = calcExchange(rule);
  if (exchange) {
    notes.push(
      t("planner.calcExchangeNote", { n: calcNumber(exchange.pulls), c: calcNumber(exchange.copies) })
    );
  }
  return notes;
}


/* ---------- markup ---------- */

/** A rounded tag on a banner card: `Release 11/05`, `132 <unilog>`. */
function calcPillHtml(label, value, tone, raw) {
  const key = label ? `<span class="calc-pill-key">${escapeHtml(label)}</span>` : "";
  const text = raw ? value : escapeHtml(value);
  return `<span class="calc-pill${tone ? ` ${tone}` : ""}">${key}${text}</span>`;
}

/** The art a rate-up hero draws: the banner row's own icon, else the roster head. */
function calcTargetIcon(target) {
  if (!target) return "";
  return target.icon || characterDb[target.name] || "";
}

/**
 * The head art of the banner's rate-up hero (or heroes). `max` caps how many draw —
 * the picker's rows are one line high, so a banner with six rate-ups shows three and
 * an ellipsis for the rest, while the plan's cards draw them all.
 */
function calcTargetsHtml(banner, max = 0) {
  const targets = banner.targets || [];
  const shown = max > 0 && targets.length > max ? targets.slice(0, max) : targets;
  const heads = shown
    .map((target) => {
      const art = calcTargetIcon(target);
      const name = escapeHtml(displayCharName(target.name));
      if (!art) return `<span class="calc-head calc-head-empty" title="${name}"></span>`;
      return `<img class="calc-head" src="${escapeHtml(art)}" alt="${name}" title="${name}" loading="lazy" />`;
    })
    .join("");
  const more =
    shown.length < targets.length
      ? `<span class="calc-head calc-head-more" title="${escapeHtml(
          targets.map((target) => displayCharName(target.name)).join(", ")
        )}">…</span>`
      : "";
  if (heads) return heads + more;
  return `<span class="calc-head calc-head-any" title="${escapeHtml(t("planner.calcAnyHero"))}">?</span>`;
}

/** The six P0…P5 chips for a banner, or the note that it cannot be priced. */
function calcOddsChips(banner, pulls) {
  const rule = calcRuleOf(banner);
  if (rule.kind === "none") {
    return `<span class="calc-card-note">${escapeHtml(t("planner.calcRuleNone"))}</span>`;
  }
  return calcOddsOf(banner, pulls)
    .map(
      (value, level) =>
        `<span class="calc-chip" data-p="${level}" data-odds="${value.toFixed(4)}"><b>P${level}</b>${calcPercent(
          value
        )}</span>`
    )
    .join("");
}

/**
 * A banner kind as the reader's language spells it (`Rerun` / 复刻 / `Rerun`). The
 * kind itself stays the sheet's word — it is what the data is keyed by — so only the
 * label is translated, and an unknown kind prints as it is.
 */
function calcKindLabel(type) {
  if (!type) return "—";
  const key = `planner.kind${type}`;
  const label = t(key);
  return label && label !== key ? label : type;
}

/**
 * The round tags every banner surface wears: the patch the run ships in, the kind, the
 * two dates, the pulls the income alone buys by the closing day, `Predicted` when the
 * row is a forecast, and the banner's own mechanical quirks (a free ten-pull, a
 * discounted ten-pull, a selector on the first 6★) so the reader knows why the typed
 * count is not always the price. The pull count is the Unilog art, never the word —
 * every figure on the tab reads the same way.
 */
function calcPillsHtml(banner) {
  const rule = calcRuleOf(banner);
  const version = calcVersionTag(banner);
  const pills = [
    calcPillHtml("", calcKindLabel(banner.type), "is-type"),
    ...(version ? [calcPillHtml("", version, "is-version")] : []),
    calcPillHtml(t("planner.calcRelease"), calcShortDate(banner.start)),
    calcPillHtml(t("planner.calcEnds"), calcShortDate(banner.end)),
    calcPillHtml(t("planner.calcByEnd"), calcPullFigure(calcPullsBy(banner.end)), "is-pulls", true),
  ];
  if (banner.predicted) pills.push(calcPillHtml("", t("planner.calcPredicted"), "is-predicted"));
  if (Number(rule.freePulls) > 0) {
    pills.push(calcPillHtml("", t("planner.calcPillFree", { n: calcNumber(rule.freePulls) }), "is-perk"));
  }
  if (Number(rule.discountFirst10) > 0) {
    pills.push(calcPillHtml("", t("planner.calcPillDiscount", { n: calcNumber(rule.discountFirst10) }), "is-perk"));
  }
  if (rule.selectFirstSix) pills.push(calcPillHtml("", t("planner.calcPillSelect"), "is-perk"));
  const exchange = calcExchange(rule);
  if (exchange) {
    pills.push(
      calcPillHtml(
        "",
        t("planner.calcPillExchange", { n: calcNumber(exchange.pulls), c: calcNumber(exchange.copies) }),
        "is-perk"
      )
    );
  }
  return pills.join("");
}

/**
 * One banner card, read like a pull ticket: the rate-up heads and the name on top,
 * the type / release / end / projected-pulls tags under it, then the odds the
 * planned pulls buy and the number field that sets them.
 */
function calcCardHtml(banner) {
  const pulls = calcPulls(banner.id);
  const chips = calcOddsChips(banner, pulls);
  const maxPulls = calcMaxPulls(banner);
  return `
        <article class="calc-card" data-banner="${escapeHtml(banner.id)}" data-kind="${escapeHtml(
    banner.type || ""
  )}">
          <div class="calc-card-head">
            <span class="calc-card-heads">${calcTargetsHtml(banner)}</span>
            <span class="calc-card-title">
              <span class="calc-card-name" title="${escapeHtml(calcBannerName(banner))}">${escapeHtml(
    calcBannerName(banner)
  )}</span>
              <span class="calc-card-pills">${calcPillsHtml(banner)}</span>
            </span>
            <button type="button" class="calc-card-remove" data-calc-action="remove" data-banner-id="${escapeHtml(
              banner.id
            )}" title="${escapeHtml(t("planner.calcRemoveBanner"))}" aria-label="${escapeHtml(
    t("planner.calcRemoveBanner")
  )}">×</button>
          </div>
          <div class="calc-card-odds">${chips}</div>
          <div class="calc-card-foot">
            <label class="calc-pull-field">
              <span class="calc-pull-label">${escapeHtml(t("planner.calcPulls"))}</span>
              <input type="number" min="0" max="9999" step="1" inputmode="numeric" class="calc-pull-input"
                data-calc-pulls="${escapeHtml(banner.id)}" value="${pulls}"
                aria-label="${escapeHtml(`${t("planner.calcPulls")} — ${calcBannerName(banner)}`)}" />
            </label>
            <div class="calc-pull-field calc-max-field" title="${escapeHtml(
              t("planner.calcMaxPullsHint", { date: calcShortDate(banner.end) })
            )}">
              <span class="calc-pull-label">${escapeHtml(t("planner.calcMaxPulls"))}</span>
              <span class="calc-max-value" data-max-pulls="${escapeHtml(banner.id)}">${calcPullFigure(
    maxPulls
  )}</span>
            </div>
          </div>
        </article>`;
}

/** Everything below the section bars: the chart and the cards. */
function calcBannersHtml() {
  const rows = calcListBanners();
  if (!rows.length) {
    return `<div class="guide-empty"><span>${escapeHtml(t("planner.calcNoBanners"))}</span></div>`;
  }
  return rows.map((banner) => calcCardHtml(banner)).join("");
}

/* ---------- the chart ---------- */

/** `137` -> `100`, so the y axis lands on a round number. */
function calcNiceStep(raw) {
  const value = Math.max(1e-6, Number(raw) || 1);
  const pow = Math.pow(10, Math.floor(Math.log10(value)));
  const base = value / pow;
  const mult = base <= 1 ? 1 : base <= 2 ? 2 : base <= 5 ? 5 : 10;
  return mult * pow;
}

/**
 * The balance as a polyline, in pulls, from today to the end of the span the reader
 * picked. A planned banner puts a dot on the day it spends, with its rate-up's
 * portrait above and what it costs below; pressing that dot opens the banner's sheet.
 */
function calcChartHtml() {
  const schedule = calcScheduleMemo();
  const { points, dots, per } = schedule;
  const W = 760;
  const H = 258;
  const padL = 48;
  const padR = 16;
  // Room above the curve for a dot's whole label — the date, then the rate-up art.
  const padT = 74;
  const padB = 26;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const values = points.map((point) => point.balance / per);
  const low = Math.min(0, ...values);
  const high = Math.max(1, ...values);
  const step = calcNiceStep((high - low) / 4);
  const min = Math.floor(low / step) * step;
  const max = Math.ceil(high / step) * step;
  const x = (index) => padL + (index / Math.max(1, points.length - 1)) * innerW;
  const y = (value) => padT + (1 - (value - min) / Math.max(1e-6, max - min)) * innerH;
  const line = points
    .map((point, index) => `${x(index).toFixed(1)},${y(point.balance / per).toFixed(1)}`)
    .join(" ");

  const grid = [];
  for (let value = min; value <= max + 1e-9; value += step) {
    grid.push(
      `<line class="calc-grid-line" x1="${padL}" y1="${y(value).toFixed(1)}" x2="${W - padR}" y2="${y(
        value
      ).toFixed(1)}" />` +
        `<text class="calc-axis-label" x="${padL - 8}" y="${(y(value) + 3).toFixed(1)}" text-anchor="end">${calcNumber(
          value
        )}</text>`
    );
  }
  const zero =
    min < 0
      ? `<line class="calc-zero-line" x1="${padL}" y1="${y(0).toFixed(1)}" x2="${W - padR}" y2="${y(0).toFixed(
          1
        )}" />`
      : "";
  const ticks = [0, Math.floor((points.length - 1) / 2), points.length - 1]
    .map(
      (index, order) =>
        `<text class="calc-axis-label" x="${x(index).toFixed(1)}" y="${H - 8}" text-anchor="${
          order === 0 ? "start" : order === 1 ? "middle" : "end"
        }">${escapeHtml(calcShortDate(points[index].iso))}</text>`
    )
    .join("");

  // The dot carries its banner: the date it starts on, the rate-up's head art under
  // that says which one it is (`−80` under the point only says what it costs). The art
  // is clipped to a circle so a square head icon still reads as a portrait, and it is
  // drawn large enough to see at low resolution on a phone. A banner with several
  // rate-ups (a Ripples pool) draws three at most — and only one when several banners
  // spend the same day, because a 3-wide portrait group would cover its neighbour.
  const clips = [];
  const markers = dots
    .map((dot, order) => {
      const banner = calcBanner(dot.id);
      const name = escapeHtml(calcBannerName(banner));
      const cx = x(dot.index) + (dot.slot - (dot.slots - 1) / 2) * 28;
      const cy = y(dot.balance / per);
      const heads = ((banner && banner.targets) || [])
        .map((target) => calcTargetIcon(target))
        .filter(Boolean)
        .slice(0, dot.slots > 1 ? 1 : 3);
      const size = 22;
      const top = cy - 18 - size;
      const draw = heads
        .map((src, slot) => {
          const span = heads.length * size + (heads.length - 1) * 2;
          const left = cx - span / 2 + slot * (size + 2);
          const headTop = cy - 18 - size;
          const clip = `calc-dot-clip-${order}-${slot}`;
          clips.push(
            `<clipPath id="${clip}"><circle cx="${(left + size / 2).toFixed(1)}" cy="${(headTop + size / 2).toFixed(
              1
            )}" r="${size / 2}" /></clipPath>`
          );
          return `<image class="calc-dot-head" href="${escapeHtml(
            src
          )}" x="${left.toFixed(1)}" y="${headTop.toFixed(1)}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid slice" clip-path="url(#${clip})" />`;
        })
        .join("");
      // The banner's own date, above the art: the icon says *who*, the date says
      // *when*, so a dot reads without opening its sheet.
      const date = calcShortDate((banner && banner.start) || dot.iso);
      const stamp = `<text class="calc-dot-date" x="${cx.toFixed(1)}" y="${(top - 6).toFixed(
        1
      )}" text-anchor="middle">${escapeHtml(date)}</text>`;
      const title =
        dot.cost !== dot.pulls
          ? `${name} · ${date} — ${t("planner.calcPulls")} ${dot.pulls} → ${dot.cost} ${t("planner.calcPullsUnit")}`
          : `${name} · ${date} — ${dot.pulls} ${t("planner.calcPullsUnit")}`;
      return `<g class="calc-dot" data-banner="${escapeHtml(dot.id)}" role="button" tabindex="0" aria-label="${escapeHtml(
        title
      )}"><title>${escapeHtml(title)}</title>${stamp}${draw}<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(
        1
      )}" r="4.6" /><text class="calc-dot-label" x="${cx.toFixed(1)}" y="${(cy + 19).toFixed(
        1
      )}" text-anchor="middle">−${dot.cost}</text></g>`;
    })
    .join("");

  return `<svg class="calc-chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img"
      aria-label="${escapeHtml(t("planner.calcChartHint"))}">
      <defs>${clips.join("")}</defs>
      ${grid.join("")}
      ${zero}
      <polyline class="calc-chart-line" points="${line}" />
      ${ticks}
      ${markers}
    </svg>`;
}

/**
 * The row under the chart: what the plan leaves in each purse. A reader who has not
 * pre-converted Clear Drop into Unilogs needs the three counts side by side, so
 * `Expected` is the pulls the plan leaves and the line under it says where the pulls
 * come from.
 */
function calcSummaryHtml() {
  const schedule = calcScheduleMemo();
  const { per, purse } = schedule;
  const last = schedule.points[schedule.points.length - 1];
  const expected = Math.floor(last.balance / per);
  const cell = (name, value, index, signed) => `
        <span class="calc-summary-cell" title="${escapeHtml(name)}">
          <span class="calc-summary-label">${escapeHtml(name)}</span>
          <span class="calc-summary-value">${signed && value < 0 ? calcSigned(value) : calcNumber(value)}${calcCurrencyIcon(
    index
  )}</span>
        </span>`;
  return [
    cell(t("planner.calcExpected"), expected, 2, true),
    cell(calcCurrencyName(2) || "Unilog", Math.max(0, purse.unilog), 2, false),
    cell(calcCurrencyName(1) || "Clear Drop", Math.max(0, purse.clear), 1, false),
    cell(calcCurrencyName(0) || "Crystal Drop", Math.max(0, purse.crystal), 0, false),
  ].join("");
}

/* ---------- the two popups ---------- */

/**
 * The "?" sheet beside Drop income: every source the ledger knows, grouped the way
 * the tab groups it, each with the purse it pays and how often it pays. Every figure
 * is read from `data/gacha_rules.json → income`, so the sheet follows the ledger
 * rather than restating it by hand.
 */
function calcHelpHtml() {
  const ledger = calcLedger();
  const per = calcDropsPerPull();
  const patch = ledger.patch || {};
  const limbo = ledger.limbo || {};
  const offer = ledger.offerOfTheMonth || {};
  const bass = ledger.bassCounter || {};
  const tasks = ledger.dailyTasks || {};
  const weekly = ledger.weeklyTask || {};
  const login = ledger.cumulativeLogin || {};
  const roaring = ledger.roaringMonth || {};
  const signIn = patch.signIn || {};
  const limboMonthly =
    Number(limbo.monthlyDrops) || (Number(limbo.drops) || 0) * ((limbo.days || []).length || 1);

  /** `1,400 <icon>` — a figure with the purse art it is paid in. */
  const money = (value, index) => `${calcNumber(value)}${calcCurrencyIcon(index)}`;
  const row = (name, amount, when, note) => `
      <div class="calc-help-row">
        <span class="calc-help-name">${escapeHtml(name)}</span>
        <span class="calc-help-amount">${amount}</span>
        <span class="calc-help-when">${escapeHtml(when)}</span>
        <span class="calc-help-note">${escapeHtml(note)}</span>
      </div>`;
  const group = (title, rows) => `
      <div class="calc-help-group">
        <span class="calc-help-group-title">${escapeHtml(title)}</span>
        ${rows}
      </div>`;

  return `
      <p class="calc-help-lead">${escapeHtml(t("planner.calcHelpLead", { per: calcNumber(per) }))}</p>
      ${group(
        t("planner.calcFree"),
        row(
          t("planner.calcDailyTasks"),
          money(tasks.weekday, 1),
          t("planner.calcWhenDay"),
          t("planner.calcHelpDailyTasks", { n: calcNumber(tasks.weekday) })
        ) +
          row(
            t("planner.calcWeeklyTask"),
            money(weekly.drops, 1),
            t("planner.calcWhenWeek"),
            t("planner.calcHelpWeeklyTask", { n: calcNumber(weekly.drops) })
          ) +
          row(
            t("planner.calcLimbo"),
            money(limboMonthly, 1),
            t("planner.calcWhenMonth"),
            t("planner.calcHelpLimbo", {
              drops: calcNumber(limbo.drops),
              monthly: calcNumber(limboMonthly),
            })
          ) +
          row(
            t("planner.calcLogin"),
            money(login.drops, 1),
            t("planner.calcWhenMonth"),
            t("planner.calcHelpLogin", { n: calcNumber(login.drops) })
          ) +
          row(
            t("planner.calcBass"),
            money(bass.pulls, 2),
            t("planner.calcWhenReset"),
            t("planner.calcHelpBass", { n: calcNumber(bass.pulls) })
          ) +
          row(
            t("planner.calcStoryStage"),
            money(patch.storyStage, 1),
            t("planner.calcWhenPatch"),
            t("planner.calcHelpStoryStage", { n: calcNumber(patch.storyStage) })
          ) +
          row(
            t("planner.calcCharacterStory"),
            money(patch.characterStory, 1),
            t("planner.calcWhenPatch"),
            t("planner.calcHelpCharacterStory", { n: calcNumber(patch.characterStory) })
          ) +
          row(
            t("planner.calcWebEvent"),
            money(patch.webEventSurvey, 1),
            t("planner.calcWhenPatch"),
            t("planner.calcHelpWebEvent", { n: calcNumber(patch.webEventSurvey) })
          ) +
          row(
            t("planner.calcJukeboxFree"),
            money(patch.jukeboxFreePulls, 2),
            t("planner.calcWhenPatch"),
            t("planner.calcHelpJukeboxFree", { n: calcNumber(patch.jukeboxFreePulls) })
          ) +
          row(
            t("planner.calcEventShop"),
            money(patch.eventShopPulls, 2),
            t("planner.calcWhenPatch"),
            t("planner.calcHelpEventShop", { n: calcNumber(patch.eventShopPulls) })
          )
      )}
      ${group(
        t("planner.calcSpender"),
        row(
          t("planner.calcRoaring"),
          money(roaring.drops, 1),
          t("planner.calcWhenDay"),
          t("planner.calcHelpRoaring", {
            crystal: calcNumber(roaring.instantCrystal),
            drops: calcNumber(roaring.drops),
            days: calcNumber(roaring.days),
          })
        ) +
          row(
            t("planner.calcJukebox"),
            money(patch.jukeboxCollectorPulls, 2),
            t("planner.calcWhenPatch"),
            t("planner.calcHelpJukebox", {
              free: calcNumber(patch.jukeboxFreePulls),
              collector: calcNumber(patch.jukeboxCollectorPulls),
            })
          ) +
          row(
            t("planner.calcOffer"),
            money(offer.unilog, 2),
            t("planner.calcWhenReset"),
            t("planner.calcHelpOffer", {
              clear: calcNumber(offer.clear),
              unilog: calcNumber(offer.unilog),
            })
          ) +
          row(t("planner.calcMonthly"), "", t("planner.calcWhenReset"), t("planner.calcHelpMonthly")) +
          row(t("planner.calcPatchly"), "", t("planner.calcWhenPatch"), t("planner.calcHelpPatchly"))
      )}
      ${group(
        t("planner.calcHelpAlways"),
        row(
          t("planner.calcSignIn"),
          `${calcNumber(signIn.limited)} / ${calcNumber(signIn.standard)}${calcCurrencyIcon(2)}`,
          t("planner.calcWhenPatch"),
          t("planner.calcHelpSignIn", {
            limited: calcNumber(signIn.limited),
            standard: calcNumber(signIn.standard),
          })
        ) +
          row(
            t("planner.calcMaintenance"),
            money(patch.maintenanceCompensation, 1),
            t("planner.calcWhenPatch"),
            t("planner.calcHelpMaintenance", { n: calcNumber(patch.maintenanceCompensation) })
          ) +
          row(
            t("planner.calcWarmup"),
            money(patch.warmupLogin, 1),
            t("planner.calcWhenPatch"),
            t("planner.calcHelpWarmup", { n: calcNumber(patch.warmupLogin) })
          ) +
          row(
            t("planner.calcDevBroadcast"),
            money(patch.devBroadcast, 1),
            t("planner.calcWhenPatch"),
            t("planner.calcHelpDevBroadcast", { n: calcNumber(patch.devBroadcast) })
          )
      )}`;
}

function calcPickerHtml() {
  const rows = calcPickerBanners();
  if (!rows.length) {
    return `<div class="guide-empty"><span>${escapeHtml(t("planner.calcPickerEmpty"))}</span></div>`;
  }
  return rows
    .map((banner) => {
      const meta = [calcKindLabel(banner.type), `${calcShortDate(banner.start)} → ${calcShortDate(banner.end)}`]
        .filter(Boolean)
        .join(" · ");
      const version = calcVersionTag(banner);
      const predicted = banner.predicted
        ? `<span class="calc-pill is-predicted">${escapeHtml(t("planner.calcPredicted"))}</span>`
        : "";
      // The patch is a tag of its own, at the row's right edge — in front of
      // `Predicted` when the row is a forecast, so the two read as one cluster and
      // the name keeps the room the tag used to take beside it.
      const tags = `${
        version ? `<span class="calc-pick-version">${escapeHtml(version)}</span>` : ""
      }${predicted}`;
      return `
        <button type="button" class="calc-pick" data-pick-banner="${escapeHtml(banner.id)}" data-kind="${escapeHtml(
        banner.type || ""
      )}">
          <span class="calc-pick-heads">${calcTargetsHtml(banner, CALC_PICK_HEADS)}</span>
          <span class="calc-pick-main">
            <span class="calc-pick-name">${escapeHtml(calcBannerName(banner))}</span>
            <span class="calc-pick-meta">${escapeHtml(meta)}</span>
          </span>
          ${tags ? `<span class="calc-pick-tags">${tags}</span>` : ""}
        </button>`;
    })
    .join("");
}

function calcInfoHtml() {
  const banner = calcBanner(calcInfoId);
  if (!banner) return "";
  const rule = calcRuleOf(banner);
  const pulls = calcPulls(banner.id);
  const cost = calcBannerCostPulls(banner, pulls);
  const odds =
    rule.kind === "none"
      ? `<p class="calc-note">${escapeHtml(t("planner.calcRuleNone"))}</p>`
      : `<div class="calc-odds-grid">${calcOddsOf(banner, pulls)
          .map(
            (value, level) => `
          <div class="calc-odd-card" data-p="${level}" data-odds="${value.toFixed(4)}">
            <span class="calc-odd-label">P${level}</span>
            <span class="calc-odd-value">${calcPercent(value)}</span>
            <span class="calc-odd-hint">${escapeHtml(t("planner.calcCopies", { n: level + 1 }))}</span>
          </div>`
          )
          .join("")}</div>`;
  const prediction = banner.predicted
    ? `<p class="calc-note">${escapeHtml(
        t("planner.calcPredictedNote", { date: banner.cnStart, n: banner.lagDays })
      )}</p>`
    : "";
  const notes = calcRuleNotes(banner)
    .map((note) => `<li class="calc-info-note">${escapeHtml(note)}</li>`)
    .join("");
  return `
      <div class="calc-card-pills calc-info-pills">${calcPillsHtml(banner)}</div>
      <p class="calc-info-rule">${escapeHtml(calcRuleNote(banner))}</p>
      <ul class="calc-info-notes">${notes}</ul>
      ${prediction}
      <div class="calc-figures">
        <div class="calc-figure">
          <span class="calc-figure-label">${escapeHtml(t("planner.calcPulls"))}</span>
          <span class="calc-figure-value">${calcPullFigure(pulls)}</span>
        </div>
        <div class="calc-figure${cost !== pulls ? " is-strong" : ""}">
          <span class="calc-figure-label">${escapeHtml(t("planner.calcInfoCost"))}</span>
          <span class="calc-figure-value">${calcPullFigure(cost)}</span>
        </div>
        <div class="calc-figure is-strong">
          <span class="calc-figure-label">${escapeHtml(t("planner.calcByEnd"))}</span>
          <span class="calc-figure-value">${calcPullFigure(calcPullsBy(banner.end))}</span>
        </div>
      </div>
      ${odds}`;
}

/* ---------- the tab ---------- */

/** Reads/writes the reader's numbers, the plan, and nothing the data can derive. */
function calcSaveState() {
  try {
    localStorage.setItem(
      CALC_STORAGE_KEY,
      JSON.stringify({
        crystal: calcCrystal,
        clear: calcClear,
        unilog: calcUnilog,
        pityRateUp: calcPityRateUp,
        guaranteedRateUp: calcGuaranteedRateUp,
        pityRipples: calcPityRipples,
        guaranteedRipples: calcGuaranteedRipples,
        limbo: calcLimbo,
        login: calcLogin,
        jukeboxFree: calcJukeboxFree,
        bass: calcBass,
        storyStage: calcStoryStage,
        characterStory: calcCharacterStory,
        webEvent: calcWebEvent,
        eventShop: calcEventShop,
        roaring: calcRoaring,
        jukebox: calcJukebox,
        offer: calcOffer,
        monthly: calcMonthly,
        patchly: calcPatchly,
        daily: calcDaily,
        other: calcOther,
        useCrystal: calcUseCrystal,
        months: calcMonths,
        list: calcList,
        plans: calcPlans,
      })
    );
  } catch (e) {
    /* A blocked storage leaves the calculator at its defaults every visit. */
  }
}

/** Reads the saved blob back, dropping anything the shipped data no longer names. */
function calcLoadState() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(CALC_STORAGE_KEY) || "null");
  } catch (e) {
    saved = null;
  }
  const blob = saved && typeof saved === "object" ? saved : {};
  const int = (value) => Math.max(0, Math.floor(Number(value) || 0));
  const hard = (calcRules && calcRules.pity && calcRules.pity.hard) || 70;
  const today = calcToday();

  calcCrystal = Math.min(calcFieldCap("crystal"), int(blob.crystal));
  calcClear = Math.min(calcFieldCap("clear"), int(blob.clear));
  calcUnilog = Math.min(calcFieldCap("unilog"), int(blob.unilog));
  // Pity is one counter per track the game keeps. A round-2 blob has a single
  // `pity` / `guaranteed` pair and no Ripples counter at all, so it is read into the
  // Debut/Rerun track — the one the old tab meant — and Ripples starts fresh.
  calcPityRateUp = Math.min(hard - 1, int(blob.pityRateUp !== undefined ? blob.pityRateUp : blob.pity));
  calcGuaranteedRateUp = !!(
    blob.guaranteedRateUp !== undefined ? blob.guaranteedRateUp : blob.guaranteed
  );
  calcPityRipples = Math.min(hard - 1, int(blob.pityRipples));
  calcGuaranteedRipples = !!blob.guaranteedRipples;

  // The free half of the income. Every one of these sources is free, so the tick box
  // starts on and only a reader who turned it off reads as off — an absent key is the
  // whole free set, which is what a fresh tab shows.
  calcLimbo = blob.limbo === undefined ? true : !!blob.limbo;
  calcLogin = blob.login === undefined ? true : !!blob.login;
  calcJukeboxFree = blob.jukeboxFree === undefined ? true : !!blob.jukeboxFree;
  // The Bass Counter is a tick box: 10 Unilogs a month. It used to be a numeric field,
  // so a positive number still reads as "on"; an absent key is on, like the rest of the
  // free half.
  calcBass = blob.bass === undefined ? true : blob.bass === true || Number(blob.bass) > 0;
  calcStoryStage = blob.storyStage === undefined ? true : !!blob.storyStage;
  calcCharacterStory = blob.characterStory === undefined ? true : !!blob.characterStory;
  calcWebEvent = blob.webEvent === undefined ? true : !!blob.webEvent;
  calcEventShop = blob.eventShop === undefined ? true : !!blob.eventShop;

  // The paid half.
  calcRoaring = !!blob.roaring;
  calcJukebox = !!blob.jukebox;
  calcOffer = !!blob.offer;
  calcMonthly = Math.min(calcFieldCap("monthly"), int(blob.monthly));
  calcPatchly = Math.min(calcFieldCap("patchly"), int(blob.patchly));
  const table = Array.isArray(calcLedger().dailyPurchasing) ? calcLedger().dailyPurchasing : [];
  calcDaily = Math.min(Math.max(0, table.length - 1), int(blob.daily));
  calcOther = Math.min(calcFieldCap("other"), int(blob.other));
  calcUseCrystal = !!blob.useCrystal;
  calcMonths = CALC_SPANS.includes(Number(blob.months)) ? Number(blob.months) : CALC_DEFAULT_SPAN;

  const rows = (calcHistory && calcHistory.banners) || [];
  const known = new Map(rows.map((row) => [row.id, row]));
  // An old blob has no `list`: its `plans` keys are the plan it meant.
  const savedList = Array.isArray(blob.list) ? blob.list : Object.keys(blob.plans || {});
  const list = [];
  for (const id of savedList) {
    const banner = known.get(id);
    if (!banner || CALC_SKIP_TYPES.has(banner.type)) continue;
    if (banner.end && banner.end < today) continue;
    if (!list.includes(id)) list.push(id);
  }
  calcList = list;
  const plans = {};
  for (const [id, value] of Object.entries(blob.plans || {})) {
    const pulls = Math.floor(Number(value) || 0);
    if (known.has(id) && pulls > 0) plans[id] = Math.min(9999, pulls);
  }
  calcPlans = plans;
}

/** The static half of the tab: the three input groups, the chart, the cards. */
function calcSkeleton() {
  const currencies = (calcRules && calcRules.currencies) || [];
  const icon = (index) => escapeHtml((currencies[index] || {}).icon || "");
  const label = (index, fallback) => {
    const row = currencies[index] || {};
    return escapeHtml(currentLang === "cn" ? row.nameZh || row.name || fallback : row.name || fallback);
  };
  const hard = (calcRules && calcRules.pity && calcRules.pity.hard) || 70;
  const ledger = calcLedger();
  const per = calcDropsPerPull();
  const purchasing = Array.isArray(ledger.dailyPurchasing) ? ledger.dailyPurchasing : [];
  const patch = ledger.patch || {};
  const limbo = ledger.limbo || {};
  const offer = ledger.offerOfTheMonth || {};
  const bassRow = ledger.bassCounter || {};
  const roaring = ledger.roaringMonth || {};

  // Limbo and Lucidscape are two resets of the same reward: the ledger names the
  // monthly total, so the yield does not depend on how many dates it lands on.
  const limboMonthly =
    Number(limbo.monthlyDrops) || (Number(limbo.drops) || 0) * ((limbo.days || []).length || 1);

  // A yield prints the purse the source actually pays, not a pull-equivalent: the
  // Clear-Drop sources read `+1,400 <clear>/month`, the Unilog sources
  // `+10 <unilog>/month`. The balance curve still values every purse at `per`
  // drops a pull, so only the badge changes — the plan's total does not.
  const yieldMonth = (amount, index = 2) =>
    t("planner.calcYieldMonth", { n: calcNumber(amount), icon: calcCurrencyIcon(index) });
  /** A source that pays once a patch: `+1,200 <clear>/patch`. */
  const yieldPatch = (amount, index = 2) =>
    t("planner.calcYieldPatch", { n: calcNumber(amount), icon: calcCurrencyIcon(index) });

  const field = (id, key, name, options) => `
          <label class="calc-field">
            <span class="calc-field-label">${escapeHtml(name)}</span>
            <span class="planner-owned-field${options.icon ? " has-icon" : ""}">
              ${options.icon ? `<img class="planner-owned-icon" src="${options.icon}" alt="" />` : ""}
              <input type="number" min="0" max="${options.max || calcFieldCap(key)}" step="1" ${
    options.inputmode ? `inputmode="${options.inputmode}" ` : ""
  }class="planner-owned-input" id="${id}" data-calc-field="${key}" placeholder="0" aria-label="${escapeHtml(name)}" />
            </span>
          </label>`;
  // A tick box is a card: the box, the name, and what ticking it is worth. Left bare
  // in the grid it read as loose text on a phone, with nothing to say how much it pays.
  const toggle = (key, name, checked, extra, title) => `
          <label class="calc-check"${title ? ` title="${escapeHtml(title)}"` : ""}>
            <input type="checkbox" id="calc-${key}" data-calc-field="${key}" ${checked ? "checked " : ""}/>
            <span class="calc-check-text">
              <span class="calc-field-label">${escapeHtml(name)}</span>
              ${extra ? `<span class="calc-check-yield">${extra}</span>` : ""}
            </span>
          </label>`;
  /** A titled block of tick boxes, so free and paid income never read as one list.
   *  `extra` is markup that belongs to the block but not to one cell of its grid (the
   *  package pair), so it never stretches the cards' shared row height. */
  const group = (title, body, extra = "") => `
          <div class="calc-group">
            <span class="calc-group-title">${escapeHtml(title)}</span>
            <div class="calc-group-grid">${body}</div>
            ${extra}
          </div>`;

  const spans = CALC_SPANS.map(
    (months) =>
      `<button type="button" class="calc-span-btn${months === calcMonths ? " is-active" : ""}"
        data-calc-span="${months}" aria-pressed="${months === calcMonths}"
        title="${escapeHtml(t(`planner.calcSpan${months}`))}">${escapeHtml(t(`planner.calcSpan${months}`))}</button>`
  ).join("");

  // Limbo and Lucidscape reset on the 1st and the 16th and pay the same reward each
  // time; the note spells the two apart so the reader knows both resets are counted.
  const limboNote = t("planner.calcLimboNote", { drops: calcNumber(Number(limbo.drops) || 0) });

  return `
      <section class="calc-section">
        <div class="archetype-section-header">
          <span class="archetype-section-title"><span>${escapeHtml(t("planner.calcCurrent"))}</span></span>
          <span class="calc-hold-total" id="calc-hold-total"></span>
        </div>
        <div class="calc-hold">
          <div class="calc-hold-purses">
            ${field("calc-crystal", "crystal", label(0, "Crystal Drop"), { icon: icon(0), inputmode: "numeric" })}
            ${field("calc-clear", "clear", label(1, "Clear Drop"), { icon: icon(1), inputmode: "numeric" })}
            ${field("calc-unilog", "unilog", label(2, "Unilog"), { icon: icon(2), inputmode: "numeric" })}
          </div>
          <!-- One pity track per row: its counter and the guarantee box it sets. -->
          <div class="calc-pair-row">
            ${field("calc-pityRateUp", "pityRateUp", t("planner.calcPityRateUp"), {
              max: hard - 1,
              inputmode: "numeric",
            })}
            ${toggle("guaranteedRateUp", t("planner.calcGuaranteedRateUp"), calcGuaranteedRateUp, "", t("planner.calcTrackRateUp"))}
          </div>
          <div class="calc-pair-row">
            ${field("calc-pityRipples", "pityRipples", t("planner.calcPityRipples"), {
              max: hard - 1,
              inputmode: "numeric",
            })}
            ${toggle("guaranteedRipples", t("planner.calcGuaranteedRipples"), calcGuaranteedRipples, "", t("planner.calcTrackRipples"))}
          </div>
        </div>
      </section>
      <section class="calc-section">
        <div class="archetype-section-header">
          <span class="archetype-section-title"><span>${escapeHtml(t("planner.calcIncome"))}</span></span>
          <span class="calc-section-tail">
            <span class="calc-hold-total" id="calc-income-total"></span>
            <button type="button" class="calc-help-btn" id="calc-help-open"
              title="${escapeHtml(t("planner.calcHelpOpen"))}" aria-label="${escapeHtml(
    t("planner.calcHelpOpen")
  )}">?</button>
          </span>
        </div>
        <div class="calc-income">
          ${group(
            t("planner.calcFree"),
            toggle("limbo", t("planner.calcLimbo"), calcLimbo, yieldMonth(limboMonthly, 1), limboNote) +
              toggle(
                "login",
                t("planner.calcLogin"),
                calcLogin,
                yieldMonth(Number((ledger.cumulativeLogin || {}).drops) || 0, 1)
              ) +
              toggle("bass", t("planner.calcBass"), calcBass, yieldMonth(Number(bassRow.pulls) || 0, 2)) +
              toggle(
                "storyStage",
                t("planner.calcStoryStage"),
                calcStoryStage,
                yieldPatch(Number(patch.storyStage) || 0, 1)
              ) +
              toggle(
                "characterStory",
                t("planner.calcCharacterStory"),
                calcCharacterStory,
                yieldPatch(Number(patch.characterStory) || 0, 1)
              ) +
              toggle(
                "webEvent",
                t("planner.calcWebEvent"),
                calcWebEvent,
                yieldPatch(Number(patch.webEventSurvey) || 0, 1)
              ) +
              toggle(
                "jukeboxFree",
                t("planner.calcJukeboxFree"),
                calcJukeboxFree,
                yieldPatch(Number(patch.jukeboxFreePulls) || 0, 2)
              ) +
              toggle(
                "eventShop",
                t("planner.calcEventShop"),
                calcEventShop,
                yieldPatch(Number(patch.eventShopPulls) || 0, 2)
              )
          )}
          ${group(
            t("planner.calcSpender"),
            toggle(
              "roaring",
              t("planner.calcRoaring"),
              calcRoaring,
              // Roaring Month pays Clear Drops a day, so its badge is the month of them.
              yieldMonth((Number(roaring.drops) || 0) * CALC_DAYS_PER_MONTH, 1)
            ) +
              toggle(
                "jukebox",
                t("planner.calcJukebox"),
                calcJukebox,
                yieldPatch(Number(patch.jukeboxCollectorPulls) || 0, 2)
              ) +
              toggle(
                "offer",
                t("planner.calcOffer"),
                calcOffer,
                // The Offer pays one Clear Drop lump *and* Unilogs: priced in drops, so
                // the badge is what the whole offer is worth in its Clear Drop purse.
                yieldMonth(Number(offer.clear) + (Number(offer.unilog) || 0) * per, 1)
              ),
            `<div class="calc-pair-row calc-pair-row-packages">
                ${field("calc-monthly", "monthly", t("planner.calcMonthly"), { inputmode: "numeric" })}
                ${field("calc-patchly", "patchly", t("planner.calcPatchly"), { inputmode: "numeric" })}
              </div>`
          )}
        </div>
        <p class="calc-hint">${escapeHtml(limboNote)}</p>
      </section>
      <section class="calc-section">
        <div class="archetype-section-header">
          <span class="archetype-section-title"><span>${escapeHtml(t("planner.calcOutcome"))}</span></span>
        </div>
        <div class="calc-outcome">
          <label class="calc-field">
            <span class="calc-field-label">${escapeHtml(t("planner.calcDaily"))}</span>
            <select class="planner-shop-select" id="calc-daily" data-calc-field="daily" aria-label="${escapeHtml(
              t("planner.calcDaily")
            )}">
              ${purchasing
                .map(
                  (value, level) =>
                    `<option value="${level}">${
                      level === 0 ? escapeHtml(t("planner.calcNone")) : `${calcNumber(value)} ${escapeHtml(t("planner.calcDrops"))}`
                    }</option>`
                )
                .join("")}
            </select>
          </label>
          ${field("calc-other", "other", t("planner.calcOther"), { icon: icon(0), inputmode: "numeric" })}
          ${toggle("useCrystal", t("planner.calcUseCrystal"), calcUseCrystal, "", t("planner.calcCrystalHint"))}
        </div>
        <p class="calc-hint">${escapeHtml(t("planner.calcCrystalHint"))}</p>
      </section>
      <section class="calc-section">
        <div class="archetype-section-header">
          <span class="archetype-section-title"><span>${escapeHtml(t("planner.calcChart"))}</span></span>
          <span class="calc-chart-bar">
            <span class="calc-span" id="calc-span" role="group" aria-label="${escapeHtml(t("planner.calcSpan"))}">${spans}</span>
            <span class="calc-hold-total" id="calc-chart-total"></span>
          </span>
        </div>
        <div class="calc-chart" id="calc-chart"></div>
        <div class="calc-summary" id="calc-summary"></div>
        <p class="calc-hint">${escapeHtml(t("planner.calcChartHint"))}</p>
      </section>
      <section class="calc-section">
        <div class="archetype-section-header">
          <span class="archetype-section-title"><span>${escapeHtml(t("planner.calcBanners"))}</span></span>
          <span class="calc-hold-total" id="calc-banner-total"></span>
        </div>
        <div class="calc-banner-list" id="calc-banners"></div>
      </section>`;
}

/** Paints the saved numbers back into the fields after a (re)mount. */
function calcFillFields() {
  const set = (id, value) => {
    const el = document.getElementById(id);
    if (el && String(el.value) !== String(value)) el.value = value;
  };
  set("calc-crystal", calcCrystal || "");
  set("calc-clear", calcClear || "");
  set("calc-unilog", calcUnilog || "");
  set("calc-pityRateUp", calcPityRateUp || "");
  set("calc-pityRipples", calcPityRipples || "");
  set("calc-monthly", calcMonthly || "");
  set("calc-patchly", calcPatchly || "");
  set("calc-other", calcOther || "");
  const daily = document.getElementById("calc-daily");
  if (daily) daily.value = String(calcDaily);
  const boxes = {
    guaranteedRateUp: calcGuaranteedRateUp,
    guaranteedRipples: calcGuaranteedRipples,
    limbo: calcLimbo,
    login: calcLogin,
    jukeboxFree: calcJukeboxFree,
    bass: calcBass,
    storyStage: calcStoryStage,
    characterStory: calcCharacterStory,
    webEvent: calcWebEvent,
    eventShop: calcEventShop,
    roaring: calcRoaring,
    jukebox: calcJukebox,
    offer: calcOffer,
    useCrystal: calcUseCrystal,
  };
  for (const [key, on] of Object.entries(boxes)) {
    const box = document.getElementById(`calc-${key}`);
    if (box) box.checked = !!on;
  }
}

/**
 * The max-pulls boxes, rewritten in place. Typing into one card changes what the rest
 * of the plan can reach, and the list is not rebuilt while a field has focus — so the
 * figures are refreshed instead of the cards.
 */
function calcRefreshMaxPulls() {
  for (const box of document.querySelectorAll("#calc-banners [data-max-pulls]")) {
    const banner = calcBanner(box.dataset.maxPulls);
    if (banner) box.innerHTML = calcPullFigure(calcMaxPulls(banner));
  }
}

/**
 * Repaints the derived half of the tab — the chart, the cards and the totals —
 * without touching the fields the reader is typing in. Every pull figure prints the
 * Unilog art, not the word: `132 <icon>` is the tab's one way of saying a count.
 */
function calcRefresh(parts) {
  const which = parts || {};
  const schedule = calcScheduleMemo();
  const banners = document.getElementById("calc-banners");
  if (banners && which.list !== false) {
    const scrollTop = document.querySelector("#planner-calculator")?.scrollTop || 0;
    banners.innerHTML = calcBannersHtml();
    const host = document.querySelector("#planner-calculator");
    if (host) host.scrollTop = scrollTop;
  }
  calcRefreshMaxPulls();
  const chart = document.getElementById("calc-chart");
  if (chart) chart.innerHTML = calcChartHtml();
  const summary = document.getElementById("calc-summary");
  if (summary) summary.innerHTML = calcSummaryHtml();
  const today = document.getElementById("calc-today");
  if (today) today.textContent = t("planner.calcAsOf", { date: schedule.today });
  const hold = document.getElementById("calc-hold-total");
  if (hold) {
    hold.innerHTML = calcPullFigure(Math.floor(schedule.held / schedule.per));
    hold.title = t("planner.calcHoldTotal", { n: calcNumber(Math.floor(schedule.held / schedule.per)) });
  }
  const income = document.getElementById("calc-income-total");
  if (income) {
    // Everything the window pays in, whatever the reader switches on.
    const earned = schedule.points.reduce((sum, point) => sum + point.income, 0);
    income.innerHTML = `+${calcPullFigure(earned / schedule.per)}`;
    income.title = t("planner.calcHoldTotal", { n: calcNumber(earned / schedule.per) });
  }
  const chartTotal = document.getElementById("calc-chart-total");
  if (chartTotal) {
    const left = calcPullsLeft();
    chartTotal.innerHTML = `${escapeHtml(t("planner.calcChartLeft", { n: calcSigned(left) }))}${calcCurrencyIcon(2)}`;
    chartTotal.title = t("planner.calcHoldTotal", { n: calcNumber(left) });
  }
  const bannerTotal = document.getElementById("calc-banner-total");
  if (bannerTotal) {
    // "1 banner · 80 <unilog>": the count picks its own key so English does not
    // print "1 banners", and the pulls reuse the Unilog figure every bar prints.
    const count = calcListBanners().length;
    const label = count === 1 ? t("planner.calcBannerOne") : t("planner.calcBannerMany", { n: calcNumber(count) });
    bannerTotal.innerHTML = `${escapeHtml(label)} · ${calcPullFigure(schedule.planned)}`;
  }
  // The span chips are static markup, so only their active state moves.
  for (const chip of document.querySelectorAll("#calc-span .calc-span-btn")) {
    const on = Number(chip.dataset.calcSpan) === calcMonths;
    chip.classList.toggle("is-active", on);
    chip.setAttribute("aria-pressed", String(on));
  }
  if (!document.getElementById("calc-picker")?.hidden) renderCalcPicker();
  if (calcInfoId) renderCalcInfo();
}

/** The card the reader is typing in: its odds, without a repaint. */
function calcRefreshCard(card) {
  const banner = calcBanner(card.dataset.banner);
  if (!banner) return;
  const pulls = calcPulls(banner.id);
  const odds = card.querySelector(".calc-card-odds");
  if (odds) odds.innerHTML = calcOddsChips(banner, pulls);
}

function renderCalcPicker() {
  const list = document.getElementById("calc-picker-list");
  if (list) list.innerHTML = calcPickerHtml();
}

function renderCalcInfo() {
  const host = document.getElementById("calc-info");
  if (!host) return;
  const banner = calcBanner(calcInfoId);
  if (!banner) {
    host.hidden = true;
    return;
  }
  host.hidden = false;
  const title = document.getElementById("calc-info-title");
  if (title) title.textContent = calcBannerName(banner);
  const heads = document.getElementById("calc-info-heads");
  if (heads) heads.innerHTML = calcTargetsHtml(banner);
  const body = document.getElementById("calc-info-body");
  if (body) body.innerHTML = calcInfoHtml();
}

function openCalcPicker() {
  const picker = document.getElementById("calc-picker");
  if (!picker) return;
  calcPickerQuery = "";
  const search = document.getElementById("calc-picker-search");
  if (search) search.value = "";
  picker.hidden = false;
  renderCalcPicker();
  if (search) search.focus();
}

function closeCalcPicker() {
  const picker = document.getElementById("calc-picker");
  if (picker) picker.hidden = true;
}

function openCalcInfo(id) {
  calcInfoId = id || "";
  renderCalcInfo();
}

function closeCalcInfo() {
  calcInfoId = "";
  const host = document.getElementById("calc-info");
  if (host) host.hidden = true;
}

/** The "?" sheet beside Drop income: every source, what it pays and how often. */
function openCalcHelp() {
  const host = document.getElementById("calc-help");
  if (!host) return;
  const body = document.getElementById("calc-help-body");
  if (body) body.innerHTML = calcHelpHtml();
  host.hidden = false;
}

function closeCalcHelp() {
  const host = document.getElementById("calc-help");
  if (host) host.hidden = true;
}

function renderPlannerCalculator() {
  const host = document.getElementById("planner-calculator");
  if (!host) return;
  if (!calcHistory || !calcRules) {
    host.innerHTML = `<div class="guide-empty"><span>${escapeHtml(t("planner.noData"))}</span></div>`;
    return;
  }
  // The skeleton depends on the currency and ledger labels, so it is rebuilt on a
  // language change as well as a first mount.
  const signature = currentLang;
  if (host.dataset.calcSig !== signature) {
    host.dataset.calcSig = signature;
    host.innerHTML = calcSkeleton();
  }
  calcFillFields();
  calcRefresh();
}

function buildCalculatorData(banners, rules) {
  calcHistory = banners && Array.isArray(banners.banners) ? banners : null;
  calcRules = rules && rules.rates ? rules : null;
  calcLoadState();
  const host = document.getElementById("planner-calculator");
  if (host) host.dataset.calcSig = "";
  if (plannerActiveTab === "calculator") renderPlannerCalculator();
}

/** The calculator's own delegated wiring; `setupPlannerListeners` calls it once. */
function setupPlannerCalculator() {
  const add = document.getElementById("calc-add");
  if (add) add.addEventListener("click", openCalcPicker);

  const reset = document.getElementById("calc-reset");
  if (reset) {
    reset.addEventListener("click", () => {
      calcCrystal = 0;
      calcClear = 0;
      calcUnilog = 0;
      calcPityRateUp = 0;
      calcGuaranteedRateUp = false;
      calcPityRipples = 0;
      calcGuaranteedRipples = false;
      calcLimbo = true;
      calcLogin = true;
      calcJukeboxFree = true;
      calcBass = true;
      calcStoryStage = true;
      calcCharacterStory = true;
      calcWebEvent = true;
      calcEventShop = true;
      calcRoaring = false;
      calcJukebox = false;
      calcOffer = false;
      calcMonthly = 0;
      calcPatchly = 0;
      calcDaily = 0;
      calcOther = 0;
      calcUseCrystal = false;
      calcMonths = CALC_DEFAULT_SPAN;
      calcList = [];
      calcPlans = {};
      closeCalcInfo();
      closeCalcPicker();
      closeCalcHelp();
      calcSaveState();
      renderPlannerCalculator();
    });
  }

  // The picker is a lightbox over the tab: its own close affordances, plus the
  // backdrop, and a pick closes it because the banner is now in the list.
  const picker = document.getElementById("calc-picker");
  if (picker) {
    picker.addEventListener("click", (event) => {
      if (event.target === picker || event.target.closest("#calc-picker-backdrop")) return closeCalcPicker();
      if (event.target.closest("#calc-picker-close")) return closeCalcPicker();
      const pick = event.target.closest("[data-pick-banner]");
      if (pick) {
        calcAddBanner(pick.dataset.pickBanner);
        closeCalcPicker();
        calcRefresh();
      }
    });
    const search = document.getElementById("calc-picker-search");
    if (search) {
      search.addEventListener("input", () => {
        calcPickerQuery = search.value;
        const list = document.getElementById("calc-picker-list");
        if (list) list.innerHTML = calcPickerHtml();
      });
    }
  }

  const info = document.getElementById("calc-info");
  if (info) {
    info.addEventListener("click", (event) => {
      if (
        event.target === info ||
        event.target.closest("#calc-info-backdrop") ||
        event.target.closest("#calc-info-close")
      ) {
        closeCalcInfo();
      }
    });
  }

  const help = document.getElementById("calc-help");
  if (help) {
    help.addEventListener("click", (event) => {
      if (
        event.target === help ||
        event.target.closest("#calc-help-backdrop") ||
        event.target.closest("#calc-help-close")
      ) {
        closeCalcHelp();
      }
    });
  }

  const host = document.getElementById("planner-calculator");
  if (!host) return;

  host.addEventListener("input", (event) => {
    const pullsField = event.target.closest("[data-calc-pulls]");
    if (pullsField) {
      calcSetPulls(pullsField.dataset.calcPulls, pullsField.value);
      // Repaint everything except the list, so the field keeps its focus, then fix
      // up the card the reader is in.
      calcRefresh({ list: false });
      const card = pullsField.closest(".calc-card");
      if (card) calcRefreshCard(card);
      return;
    }
    const field = event.target.closest("[data-calc-field]");
    if (!field) return;
    const key = field.dataset.calcField;
    if (CALC_TOGGLES.has(key)) {
      calcToggleFromBox(key, !!field.checked);
    } else {
      const hard = (calcRules && calcRules.pity && calcRules.pity.hard) || 70;
      let value = Math.max(0, Math.floor(Number(field.value) || 0));
      if (key === "pityRateUp" || key === "pityRipples") value = Math.min(hard - 1, value);
      else value = Math.min(calcFieldCap(key), value);
      if (key === "crystal") calcCrystal = value;
      else if (key === "clear") calcClear = value;
      else if (key === "unilog") calcUnilog = value;
      else if (key === "monthly") calcMonthly = value;
      else if (key === "patchly") calcPatchly = value;
      else if (key === "daily") calcDaily = value;
      else if (key === "other") calcOther = value;
      else if (key === "pityRateUp") calcPityRateUp = value;
      else if (key === "pityRipples") calcPityRipples = value;
    }
    calcSaveState();
    // Repaint only the derived half: the field keeps both its value and its focus.
    calcRefresh();
  });

  host.addEventListener("change", (event) => {
    const field = event.target.closest("[data-calc-field]");
    if (!field) return;
    const key = field.dataset.calcField;
    if (!CALC_TOGGLES.has(key) && key !== "daily") return;
    if (key === "daily") calcDaily = Math.max(0, Math.floor(Number(field.value) || 0));
    else calcToggleFromBox(key, !!field.checked);
    calcSaveState();
    calcRefresh();
  });

  host.addEventListener("click", (event) => {
    if (event.target.closest("#calc-help-open")) {
      openCalcHelp();
      return;
    }
    const span = event.target.closest("[data-calc-span]");
    if (span) {
      const months = Number(span.dataset.calcSpan);
      if (CALC_SPANS.includes(months)) {
        calcMonths = months;
        calcSaveState();
        calcRefresh();
      }
      return;
    }
    const action = event.target.closest("[data-calc-action]");
    if (action && action.dataset.calcAction === "remove") {
      calcRemoveBanner(action.dataset.bannerId);
      calcRefresh();
      return;
    }
    const dot = event.target.closest(".calc-dot");
    if (dot) openCalcInfo(dot.dataset.banner);
  });

  host.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const dot = event.target.closest(".calc-dot");
    if (!dot) return;
    event.preventDefault();
    openCalcInfo(dot.dataset.banner);
  });
}

/** A tick box by its key, so the input and change handlers agree. */
function calcToggleFromBox(key, on) {
  if (key === "guaranteedRateUp") calcGuaranteedRateUp = on;
  else if (key === "guaranteedRipples") calcGuaranteedRipples = on;
  else if (key === "limbo") calcLimbo = on;
  else if (key === "login") calcLogin = on;
  else if (key === "jukeboxFree") calcJukeboxFree = on;
  else if (key === "bass") calcBass = on;
  else if (key === "storyStage") calcStoryStage = on;
  else if (key === "characterStory") calcCharacterStory = on;
  else if (key === "webEvent") calcWebEvent = on;
  else if (key === "eventShop") calcEventShop = on;
  else if (key === "roaring") calcRoaring = on;
  else if (key === "jukebox") calcJukebox = on;
  else if (key === "offer") calcOffer = on;
  else if (key === "useCrystal") calcUseCrystal = on;
}

/* ================= Planner (character progression) =================
 * The Character tab is the other half of the Planner: the arcanists you still
 * have to build, the bill they add up to, and the farm route that pays for it.
 *
 * The grid is head icons only. Pressing one opens that arcanist's panel — the
 * same from → to controls the character card shows — with their own bill
 * underneath; right-clicking one takes them out of the plan without losing their
 * settings, which is what the "Goal" lightbox and the farm route read.
 *
 * Everything the bill needs is already generated:
 *   data/characters_mats_required.json   insight / resonance / euphoria /
 *                                        mastery / frequency steps, by name
 *   data/progression_levels.json         Dust + Sharpodonty, per level
 *   data/pattern_costs.json              the Frequency grids, by pattern name
 *   data/items.json                      the art and the names
 *
 * The farm route is the one hand-sourced table in the app (§14):
 *   data/stages/farm.json                what one run of each stage drops
 * and it is solved as an integer program (`glpk.js`, the same solver Kornblume
 * uses) rather than by picking the best stage per material: a material is
 * usually a side drop of a stage farmed for something else, so the cheapest set
 * of stages is not the cheapest stage per material.
 *
 * State lives in `r1999_planner_characters_v1`. Unlike the event shop's picks it
 * is not stamped with a patch: a build plan spans several patches, so it has to
 * survive an update. Anything the shipped data no longer names — a removed
 * arcanist, a material tier that moved — is dropped or clamped on load.
 */
const PLANNER_CHARS_KEY = "r1999_planner_characters_v1";
const PLANNER_ACTIVITY_KEY = "r1999_planner_activity_v1";
const PLANNER_WILDERNESS_KEY = "r1999_planner_wilderness_v1";

let plannerChars = [];
let plannerCharSelected = "";
let plannerPickerQuery = "";
const plannerPickerRarities = new Set();
let plannerActiveTab = "calculator";

/**
 * Every pane the modal knows, in the order the tab row draws them. A tab is
 * nothing more than a `.builds-mode-btn` with `data-mode` plus a `.planner-pane`
 * with the same `data-pane`, so adding one means adding its name here and the
 * markup — `setPlannerTab()` needs no branch.
 */
const PLANNER_TABS = ["calculator", "character", "event"];

/** Which lightbox is up: "picker" | "editor" | "goal" | "activity" | "". */
let plannerActiveSheet = "";

/**
 * Stamina per day, the way the game's own "activity" works: 240 a day, +60 with
 * a Roaring Month, and a seventh of a day for keeping the weekly bar full.
 */
let plannerActivity = { roaringMonth: false, weeklyActivity: false };

/**
 * Wilderness, the idle board: three Dust Bell Towers and three Sharpodonty
 * Markets, each built to a level 0-6, plus the Vigor bonus. It pays out once a
 * day, so `plannerWildernessOutput()` is Dust and Sharpodonty per day — not
 * stamina. The route subtracts it instead of buying it (§14).
 */
let plannerWilderness = {
  enabled: false,
  dust1: 6,
  dust2: 6,
  dust3: 6,
  gold1: 6,
  gold2: 6,
  gold3: 6,
  // A free figure, typed in the sheet: the game's Vigor is not capped at the 50%
  // the old slider offered, so neither is this.
  vigor: 50,
};
/** Level 0-6 → the multiplier the building adds (Kornblume's own tables). */
const PLANNER_WILDERNESS_DUST = [0, 120, 150, 175, 210, 240, 270];
const PLANNER_WILDERNESS_GOLD = [0, 60, 75, 80, 96, 108, 120];

/**
 * The farm route. `plannerFarmData` is `data/stages/farm.json`, `plannerFarmCache`
 * the last solved plan keyed by the bill it was solved for, so stepping through
 * an arcanist's levels does not re-solve the same bill twice.
 */
let plannerFarmData = null;
let plannerFarmCache = null;
/** Signature of the solve in flight, or null. */
let plannerFarmSolving = null;
/** The plan moved while a solve was running: solve it again when that one lands. */
let plannerFarmPending = false;
let plannerFarmError = false;

/**
 * The solve budget. The model is a real material-balance MIP once a recipe has to
 * *pay* for its inputs, and its integrality gap is around 2% on a full arcanist —
 * wider than the 1% the old, craft-for-free model reached in 100 ms, so the search
 * cannot stop on the gap and the clock is what bounds it. 1.2 s lands within a
 * fifth of a percent of the best plan found in 8 s, and the route has to appear.
 */
const PLANNER_FARM_SOLVE = { tmlim: 1.2, mipgap: 0.02 };

/** What the farm route cannot buy with stamina: the two shops' own currencies. */
const PLANNER_SHOP_FAMILIES = { "Resonate Materials": "oneiric", "Euphoria Materials": "reveries" };

/** The tab the modal reopens on: the one the reader left, or Calculator. */
const PLANNER_TAB_KEY = "r1999_planner_tab_v1";

function loadPlannerTab() {
  try {
    const saved = localStorage.getItem(PLANNER_TAB_KEY);
    plannerActiveTab = PLANNER_TABS.includes(saved) ? saved : PLANNER_TABS[0];
  } catch (e) {
    plannerActiveTab = PLANNER_TABS[0];
  }
}

function savePlannerTab() {
  try {
    localStorage.setItem(PLANNER_TAB_KEY, plannerActiveTab);
  } catch (e) {
    /* A blocked storage just means the modal opens on Character. */
  }
}

/* ---- Activity settings ---------------------------------------------------- */

function plannerActivityStamina() {
  let value = 240;
  if (plannerActivity.roaringMonth) value += 60;
  if (plannerActivity.weeklyActivity) value += Math.floor(240 / 7);
  return value;
}

/** The same day with the Roaring Month left out — what the tooltip compares against. */
function plannerActivityStaminaBase() {
  let value = 240;
  if (plannerActivity.weeklyActivity) value += Math.floor(240 / 7);
  return value;
}

/**
 * The same day with a Roaring Month on, which is what the tooltip compares. It is
 * always the base + 60, never "the day you already have" — otherwise a reader with the
 * card switched on saw the same day count twice (`{days} / {days} Roaring Month`).
 */
function plannerActivityStaminaRoaring() {
  return plannerActivityStaminaBase() + 60;
}

function plannerSaveActivity() {
  try {
    localStorage.setItem(PLANNER_ACTIVITY_KEY, JSON.stringify(plannerActivity));
  } catch (e) {
    /* private mode: the figures still work for this session */
  }
}

function plannerLoadActivity() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(PLANNER_ACTIVITY_KEY) || "null");
  } catch (e) {
    saved = null;
  }
  plannerActivity = {
    roaringMonth: !!(saved && saved.roaringMonth === true),
    weeklyActivity: !!(saved && saved.weeklyActivity === true),
  };
}

/* ---- Wilderness ----------------------------------------------------------- */

/** A level 0-6, clamped to the table the game's own board uses. */
function plannerWildernessLevel(value, fallback) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(6, Math.max(0, n)) : fallback;
}

/**
 * Dust and Sharpodonty a day. Three buildings of each kind, multiplied by the
 * Vigor bonus (a free percentage, typed in the sheet), over the 24 collections a
 * board takes in a day.
 */
function plannerWildernessOutput(settings) {
  const state = settings || plannerWilderness;
  const dust = [state.dust1, state.dust2, state.dust3].reduce(
    (sum, level) => sum + (PLANNER_WILDERNESS_DUST[plannerWildernessLevel(level, 6)] || 0),
    0
  );
  const gold = [state.gold1, state.gold2, state.gold3].reduce(
    (sum, level) => sum + (PLANNER_WILDERNESS_GOLD[plannerWildernessLevel(level, 6)] || 0),
    0
  );
  const vigor = 1 + Math.max(0, Number(state.vigor) || 0) / 100;
  return {
    dust: Math.ceil(dust * vigor * 24),
    gold: Math.ceil(gold * vigor * 24),
  };
}

/** What the solve gets to subtract: nothing at all while Wilderness is off. */
function plannerWildernessDaily() {
  if (!plannerWilderness.enabled) return { dust: 0, gold: 0 };
  return plannerWildernessOutput();
}

/** The Wilderness settings are part of what a solved route was solved for. */
function plannerWildernessSignature() {
  if (!plannerWilderness.enabled) return "wild=off";
  const out = plannerWildernessOutput();
  return `wild=${out.dust}:${out.gold}:${plannerActivityStamina()}`;
}

function plannerSaveWilderness() {
  try {
    localStorage.setItem(PLANNER_WILDERNESS_KEY, JSON.stringify(plannerWilderness));
  } catch (e) {
    /* private mode: the figures still work for this session */
  }
}

function plannerLoadWilderness() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(PLANNER_WILDERNESS_KEY) || "null");
  } catch (e) {
    saved = null;
  }
  const row = saved && typeof saved === "object" ? saved : {};
  plannerWilderness = {
    enabled: row.enabled === true,
    dust1: plannerWildernessLevel(row.dust1, 6),
    dust2: plannerWildernessLevel(row.dust2, 6),
    dust3: plannerWildernessLevel(row.dust3, 6),
    gold1: plannerWildernessLevel(row.gold1, 6),
    gold2: plannerWildernessLevel(row.gold2, 6),
    gold3: plannerWildernessLevel(row.gold3, 6),
    // An absent Vigor is the default 50; a stored one is whatever was typed.
    vigor:
      row.vigor === undefined || row.vigor === null
        ? 50
        : Math.max(0, Math.round(Number(row.vigor) || 0)),
  };
}

/** The farm table, handed over by `initApp` once `data/stages/farm.json` is in. */
function buildPlannerFarmData(data) {
  plannerFarmData = data && Array.isArray(data.stages) && data.stages.length ? data : null;
  plannerFarmCache = null;
  plannerFarmError = false;
}

/* ---- The plan ------------------------------------------------------------- */

function plannerCurrentPlan() {
  return plannerChars.find((plan) => plan.name === plannerCharSelected) || null;
}

/** Resonance is capped by insight (R5 / R10 / R15) and locked at Insight 0. */
function plannerResoMax(insight) {
  const ins = Number(insight) || 0;
  return ins <= 0 ? 0 : getMaxResonanceForInsight(ins);
}

/** What "add this arcanist" starts at: level 1, built to its cap. */
function plannerPlanDefaults(name) {
  const mats = getCharacterMats(name);
  const rarity = Number((mats && mats.rarity) || getCharacterRarity(name) || 5);
  const maxInsight = getMaxInsightForRarity(rarity);
  return {
    name,
    enabled: true,
    curInsight: 0,
    curLevel: 1,
    goalInsight: maxInsight,
    goalLevel: getMaxLevelForInsight(maxInsight),
    curReso: 0,
    goalReso: Math.min(10, plannerResoMax(maxInsight)),
    curMastery: 0,
    goalMastery: 0,
    euphoria: [],
    frequency: [],
  };
}

/**
 * Fits a plan to the shipped data: unknown arcanists are rejected, every
 * number is clamped to the range the game allows, and the goal never sits below
 * the current state.
 */
function plannerClampPlan(plan) {
  if (!plan || typeof plan.name !== "string") return null;
  const mats = getCharacterMats(plan.name);
  if (!mats) return null;
  const rarity = Number(mats.rarity || getCharacterRarity(plan.name) || 5);
  const maxInsight = getMaxInsightForRarity(rarity);
  const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
  const int = (value, fallback) => {
    const n = Math.round(Number(value));
    return Number.isFinite(n) ? n : fallback;
  };

  plan.enabled = plan.enabled !== false;
  plan.curInsight = clamp(int(plan.curInsight, 0), 0, maxInsight);
  plan.curLevel = clamp(int(plan.curLevel, 1), 1, getMaxLevelForInsight(plan.curInsight));
  plan.goalInsight = clamp(int(plan.goalInsight, maxInsight), plan.curInsight, maxInsight);
  if (plan.goalInsight === plan.curInsight) {
    plan.goalLevel = clamp(
      int(plan.goalLevel, plan.curLevel),
      plan.curLevel,
      getMaxLevelForInsight(plan.goalInsight)
    );
  } else {
    plan.goalLevel = clamp(int(plan.goalLevel, 1), 1, getMaxLevelForInsight(plan.goalInsight));
  }
  plan.curReso = clamp(int(plan.curReso, 0), 0, plannerResoMax(plan.curInsight));
  plan.goalReso = clamp(int(plan.goalReso, plan.curReso), plan.curReso, plannerResoMax(plan.goalInsight));

  const euphoriaIds = (mats.euphoria || []).map((e) => Number(e.id));
  plan.euphoria = (Array.isArray(plan.euphoria) ? plan.euphoria : [])
    .map(Number)
    .filter((id) => euphoriaIds.includes(id));
  // Mastery is gated by Euphoria: the game only offers the tiers once a facet is on,
  // so a plan with no facet ticked carries none — and clearing the last facet drops
  // whatever mastery it had.
  const masteryCap = plan.euphoria.length ? 4 : 0;
  plan.curMastery = clamp(int(plan.curMastery, 0), 0, masteryCap);
  plan.goalMastery = clamp(int(plan.goalMastery, plan.curMastery), plan.curMastery, masteryCap);
  const frequencyIds = (mats.frequency || []).map((f) => Number(f.id));
  plan.frequency = (Array.isArray(plan.frequency) ? plan.frequency : [])
    .map(Number)
    .filter((id) => frequencyIds.includes(id));
  return plan;
}

function plannerSaveChars() {
  try {
    localStorage.setItem(
      PLANNER_CHARS_KEY,
      JSON.stringify({ chars: plannerChars, selected: plannerCharSelected })
    );
  } catch (e) {
    /* private mode / quota: the plan still works, it just is not remembered */
  }
}

function plannerLoadChars() {
  plannerChars = [];
  plannerCharSelected = "";
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(PLANNER_CHARS_KEY) || "null");
  } catch (e) {
    saved = null;
  }
  if (!saved || !Array.isArray(saved.chars)) return;
  const seen = new Set();
  for (const raw of saved.chars) {
    if (!raw || typeof raw.name !== "string" || seen.has(raw.name)) continue;
    const plan = plannerClampPlan({ ...raw });
    if (!plan) continue;
    seen.add(plan.name);
    plannerChars.push(plan);
  }
  const wanted = typeof saved.selected === "string" ? saved.selected : "";
  plannerCharSelected = plannerChars.some((plan) => plan.name === wanted)
    ? wanted
    : (plannerChars[0] || {}).name || "";
}

function plannerAddMaterials(acc, list) {
  for (const row of list || []) {
    if (!row || !row.material) continue;
    acc[row.material] = (acc[row.material] || 0) + (Number(row.quantity) || 0);
  }
}

/**
 * The materials one arcanist still needs: every step between the two states
 * (insight, resonance, mastery), the picked euphoria facets and frequency
 * nodes, plus the Dust and Sharpodonty of the levels in between.
 */
function plannerCharMaterials(plan) {
  const mats = plan && getCharacterMats(plan.name);
  if (!mats) return [];
  const acc = {};
  const rarity = Number(mats.rarity || getCharacterRarity(plan.name) || 5);

  for (let ins = plan.curInsight + 1; ins <= plan.goalInsight; ins++) {
    const row = (mats.insight || []).find((x) => x.insight === ins);
    if (row) plannerAddMaterials(acc, row.materials);
  }
  for (let res = plan.curReso + 1; res <= plan.goalReso; res++) {
    const row = (mats.resonance || []).find((x) => x.resonance === res);
    if (row) plannerAddMaterials(acc, row.materials);
  }
  for (const node of mats.euphoria || []) {
    if (plan.euphoria.includes(Number(node.id))) plannerAddMaterials(acc, node.materials);
  }
  for (let lv = plan.curMastery + 1; lv <= plan.goalMastery; lv++) {
    const row = (mats.mastery || []).find((x) => x.level === lv);
    if (row) plannerAddMaterials(acc, row.materials);
  }
  for (const node of mats.frequency || []) {
    if (plan.frequency.includes(Number(node.id))) plannerAddMaterials(acc, node.materials);
  }

  const exp = levelExpBetween(rarity, plan.curInsight, plan.curLevel, plan.goalInsight, plan.goalLevel);
  if (exp.dust > 0) acc["Dust"] = (acc["Dust"] || 0) + exp.dust;
  if (exp.sharpodonty > 0) acc["Sharpodonty"] = (acc["Sharpodonty"] || 0) + exp.sharpodonty;

  return sortMaterialsByCategory(
    Object.entries(acc)
      .filter(([, quantity]) => quantity > 0)
      .map(([material, quantity]) => ({ material, quantity }))
  );
}

/** The arcanists the plan still counts; a right-clicked tile is skipped. */
function plannerEnabledChars() {
  return plannerChars.filter((plan) => plan.enabled !== false);
}

/** The bill for the whole enabled list: what is still missing everywhere. */
function plannerGoalMaterials() {
  const acc = {};
  for (const plan of plannerEnabledChars()) {
    for (const row of plannerCharMaterials(plan)) {
      acc[row.material] = (acc[row.material] || 0) + row.quantity;
    }
  }
  return sortMaterialsByCategory(
    Object.entries(acc).map(([material, quantity]) => ({ material, quantity }))
  );
}

/**
 * One material, as the game's own item sticker: rarity frame, art, and the
 * quantity in the dark corner badge. There is no card box and no name under it
 * — the bill is a wall of art, and the name lives in the tooltip.
 */
function plannerMatCardHtml(entry) {
  const item = getItemByName(entry.material);
  const fallback = entry.material;
  const name = escapeHtml(
    item ? (currentLang === "cn" ? item.nameZh || item.name || fallback : item.name || fallback) : fallback
  );
  const exact = Number(entry.quantity) || 0;
  const qty = escapeHtml(plannerNumber(exact));
  // The badge is the InfoBook sticker's: compact the way the game prints a big
  // quantity (893,980 -> 894k), with the exact figure in the tooltip and in
  // `data-qty` so nothing is lost.
  const badge = escapeHtml(formatMaterialQuantity(exact));
  const title = `${name} × ${qty}`;
  const art = item && item.icon
    ? `<img src="${escapeHtml(item.icon)}" alt="" class="item-sticker-img" loading="lazy" />`
    : `<span class="planner-mat-art-empty" aria-hidden="true"></span>`;
  return `
        <div class="planner-mat" data-item="${escapeHtml(entry.material)}" data-qty="${exact}" title="${title}">
          <div class="item-sticker planner-mat-sticker">
            ${item && item.border ? `<img src="${escapeHtml(item.border)}" alt="" class="item-sticker-border" loading="lazy" />` : ""}
            ${art}
            <span class="item-sticker-qty planner-mat-qty">${badge}</span>
          </div>
        </div>`;
}

function plannerMatGridHtml(list, emptyKey) {
  if (!list.length) {
    return `<div class="guide-empty"><span>${escapeHtml(t(emptyKey))}</span></div>`;
  }
  return `<div class="planner-mat-grid">${list.map(plannerMatCardHtml).join("")}</div>`;
}

function plannerSeries(from, to) {
  const out = [];
  for (let v = from; v <= to; v++) out.push(v);
  return out;
}

function plannerInsightLabel(insight) {
  return insight === 0 ? "0" : ["I", "II", "III"][insight - 1] || String(insight);
}

/**
 * Insight is a row of the game's own tier pips — the same
 * `images/insight_icon/I<n>.png` buttons the InfoBook's progression panel draws —
 * instead of a text select, so a step reads as a tier rather than as a number.
 * Both ends get a row: the current tier may be any tier up to the cap (the goal
 * follows it up), the goal any tier from the current one up.
 */
function plannerInsightPicksHtml(plan, maxInsight) {
  const row = (field, values, current, roleKey) => `
              <span class="planner-field-mini">${escapeHtml(t(roleKey))}</span>
              <div class="char-mats-ins-boxes">${values
                .map((ins) => {
                  const active = current === ins;
                  return `<button type="button" class="char-mats-ins-btn planner-insight-btn${
                    active ? " is-active" : ""
                  }" data-set="${field}" data-value="${ins}" title="${escapeHtml(
                    `${t(roleKey)} I${ins}`
                  )}" aria-pressed="${active ? "true" : "false"}">
                    <img src="images/insight_icon/I${ins}.png" alt="${escapeHtml(plannerInsightLabel(ins))}" />
                  </button>`;
                })
                .join("")}</div>`;
  return `
        <div class="setting-group planner-range">
          <div class="setting-label-row">
            <label class="setting-label"><span>${escapeHtml(t("builds.insight"))}</span></label>
            <span class="setting-val-display" data-readout="insight">${escapeHtml(
              `${plannerInsightLabel(plan.curInsight)} → ${plannerInsightLabel(plan.goalInsight)}`
            )}</span>
          </div>
          <div class="planner-insight-picks">
            <div class="planner-insight-row">${row(
              "curInsight",
              plannerSeries(0, maxInsight),
              plan.curInsight,
              "builds.from"
            )}</div>
            <div class="planner-insight-row">${row(
              "goalInsight",
              plannerSeries(plan.curInsight, maxInsight),
              plan.goalInsight,
              "builds.to"
            )}</div>
          </div>
        </div>`;
}

/**
 * How each end of a from → to slider prints its figure. One table, so the panel and
 * the live drag preview (`plannerPreviewField`) cannot disagree about a `Lv.` or an `R`.
 */
const PLANNER_SLIDER_FIELDS = {
  curLevel: (value) => `Lv.${value}`,
  goalLevel: (value) => `Lv.${value}`,
  curReso: (value) => `R${value}`,
  goalReso: (value) => `R${value}`,
  curMastery: (value) => String(value),
  goalMastery: (value) => String(value),
};

/**
 * One from → to setting drawn as a slider per end, the way the InfoBook levels a
 * character: a range input with the figure beside it. Level needs it (a 5★ arcanist
 * has 180 levels, which no select can offer), and Resonance and Mastery follow so
 * every bounded number in the editor is set the same way.
 *
 * `disabled` greys the pair without hiding it — mastery is a real setting that the
 * game only offers once a Euphoria facet is on — and `wrapper` lets a caller that
 * already sits inside another `setting-group` (mastery) open its own box instead.
 */
function plannerSliderGroupHtml(labelKey, readoutKey, readout, rows, disabled, wrapper) {
  const slider = ({ field, lo, hi, value, roleKey }) => `
              <span class="planner-field-mini">${escapeHtml(t(roleKey))}</span>
              <input type="range" class="custom-slider planner-level-slider" data-slider="${field}"
                min="${lo}" max="${hi}" value="${value}" step="1"${disabled ? " disabled" : ""}
                aria-label="${escapeHtml(`${t(roleKey)} ${t(labelKey)}`)}" />
              <span class="psychube-level-number planner-level-number" data-number="${field}">${escapeHtml(
                (PLANNER_SLIDER_FIELDS[field] || String)(value)
              )}</span>`;
  return `
        <div class="${wrapper || "setting-group planner-range"}">
          <div class="setting-label-row">
            <label class="setting-label"><span>${escapeHtml(t(labelKey))}</span></label>
            <span class="setting-val-display" data-readout="${readoutKey}">${escapeHtml(readout)}</span>
          </div>
          <div class="planner-level-sliders">
            ${rows
              .map((row) => `<div class="planner-level-row">${slider(row)}</div>`)
              .join("")}
          </div>
        </div>`;
}

function plannerLevelSlidersHtml(plan) {
  return plannerSliderGroupHtml(
    "builds.level",
    "level",
    `Lv.${plan.curLevel} → Lv.${plan.goalLevel}`,
    [
      {
        field: "curLevel",
        lo: 1,
        hi: getMaxLevelForInsight(plan.curInsight),
        value: plan.curLevel,
        roleKey: "builds.from",
      },
      {
        field: "goalLevel",
        lo: plan.goalInsight === plan.curInsight ? plan.curLevel : 1,
        hi: getMaxLevelForInsight(plan.goalInsight),
        value: plan.goalLevel,
        roleKey: "builds.to",
      },
    ]
  );
}

/** Resonance is a slider too: R0…R15, capped by each end's insight the way the game caps it. */
function plannerResoSlidersHtml(plan) {
  return plannerSliderGroupHtml(
    "builds.resonance",
    "reso",
    `R${plan.curReso} → R${plan.goalReso}`,
    [
      {
        field: "curReso",
        lo: 0,
        hi: plannerResoMax(plan.curInsight),
        value: plan.curReso,
        roleKey: "builds.from",
      },
      {
        field: "goalReso",
        lo: plan.curReso,
        hi: plannerResoMax(plan.goalInsight),
        value: plan.goalReso,
        roleKey: "builds.to",
      },
    ]
  );
}

/** Mastery is 0…4, and only switchable once a Euphoria facet is ticked. */
function plannerMasterySlidersHtml(plan, gated) {
  return plannerSliderGroupHtml(
    "builds.mastery",
    "mastery",
    `${plan.curMastery} → ${plan.goalMastery}`,
    [
      {
        field: "curMastery",
        lo: 0,
        hi: 4,
        value: plan.curMastery,
        roleKey: "builds.from",
      },
      {
        field: "goalMastery",
        lo: plan.curMastery,
        hi: 4,
        value: plan.goalMastery,
        roleKey: "builds.to",
      },
    ],
    gated,
    // Mastery already sits inside the Euphoria · Mastery group, so it must not open a
    // second `setting-group` — it wears the `.planner-subsetting` wrapper its gate and
    // opacity rules already key off.
    `planner-subsetting${gated ? " is-disabled" : ""}`
  );
}

/**
 * Euphoria and Mastery are one setting here: the game only offers a mastery tier
 * once a Euphoria facet is on, so the two sit in the same group and the mastery
 * range stays switched off until one facet is ticked. That is also why clearing
 * the last facet clears mastery (`plannerClampPlan`).
 */
function plannerEuphoriaMasteryHtml(mats, plan) {
  const nodes = mats.euphoria || [];
  const hasMastery = Array.isArray(mats.mastery) && mats.mastery.length > 0;
  if (!nodes.length && !hasMastery) return "";
  const picked = nodes
    .filter((node) => plan.euphoria.includes(Number(node.id)))
    .map((node) => `E${node.id}`)
    .join(", ");
  const gated = !plan.euphoria.length;
  const charId = mats.id;
  const checks = nodes
    .map((node) => {
      const id = Number(node.id);
      const active = plan.euphoria.includes(id);
      const label = getEuphoriaDisplayName(plan.name, id) || `Euphoria ${id}`;
      // The facet is its own portrait, the way the Character Setting modal labels the
      // same box; the tree's name stays in the tooltip, and takes over if art is missing.
      const icon = charId ? `images/arcanists/euphoria/${charId}_${id}.webp` : "";
      const face = icon
        ? `<span class="euphoria-check-thumb">
            <img class="euphoria-check-icon" src="${escapeHtml(icon)}" alt="${escapeHtml(
              label
            )}" onerror="this.parentElement.hidden=true;this.closest('.check-text').querySelector('.planner-euphoria-label').hidden=false" />
            <span class="euphoria-check-tier">E${id}</span>
          </span>
          <span class="planner-euphoria-label" hidden>${escapeHtml(label)}</span>`
        : `<span class="planner-euphoria-label">${escapeHtml(label)}</span>`;
      return `<label class="check-container planner-euphoria-check" title="${escapeHtml(label)}">
          <input type="checkbox" data-euphoria="${id}"${active ? " checked" : ""} />
          <span class="check-box"></span>
          <span class="check-text">${face}</span>
        </label>`;
    })
    .join("");
  const mastery = hasMastery
    ? `${
        plannerMasterySlidersHtml(plan, gated)
      }
          ${
            gated
              ? `<p class="planner-subsetting-hint">${escapeHtml(t("planner.masteryNeedsEuphoria"))}</p>`
              : ""
          }`
    : "";
  return `
        <div class="setting-group is-wide planner-euphoria-mastery">
          <div class="setting-label-row">
            <label class="setting-label"><span>${escapeHtml(
              `${t("builds.euphoria")} · ${t("builds.mastery")}`
            )}</span></label>
            <span class="setting-val-display">${escapeHtml(picked || "—")}</span>
          </div>
          ${checks ? `<div class="euphoria-checkboxes planner-euphoria-checks">${checks}</div>` : ""}
          ${mastery}
        </div>`;
}

/**
 * Frequency picks a resonance pattern: five craftable patterns per board, each with
 * its own bill (`data/characters_mats_required.json -> frequency[]`, generated from
 * `talent_style_cost`). The tile shows the pattern's own glyph — the same art the
 * InfoBook's pattern panel uses — with its name underneath and the bill in the
 * tooltip; the materials also land in the arcanist's list when a pattern is picked.
 */
function plannerFrequencyHtml(mats, plan) {
  const nodes = mats.frequency || [];
  if (!nodes.length) return "";
  const shape = getCharacterResoShape(plan.name);
  const tiles = nodes
    .map((node) => {
      const active = plan.frequency.includes(Number(node.id));
      const art = getPatternIconPathForShape(shape, node.name);
      const label = patternLabel(node.name);
      const bill = (node.materials || [])
        .map((m) => `${m.material} ×${plannerNumber(m.quantity)}`)
        .join(", ");
      return `<button type="button" class="planner-freq-tile${
        active ? " is-active" : ""
      }" data-pattern="${node.id}" title="${escapeHtml(bill)}" aria-pressed="${active ? "true" : "false"}">
            ${
              art
                ? `<img src="${escapeHtml(art)}" alt="" loading="lazy" />`
                : `<span class="planner-freq-fallback"></span>`
            }
            <span class="planner-freq-name">${escapeHtml(label)}</span>
          </button>`;
    })
    .join("");
  const picked = nodes
    .filter((node) => plan.frequency.includes(Number(node.id)))
    .map((node) => patternLabel(node.name))
    .join(", ");
  return `
        <div class="setting-group is-wide">
          <div class="setting-label-row">
            <label class="setting-label"><span>${escapeHtml(t("planner.pattern"))}</span></label>
            <span class="setting-val-display">${escapeHtml(picked || "—")}</span>
          </div>
          <div class="planner-freq-row">${tiles}</div>
        </div>`;
}

/** One arcanist's panel: the head, the four ranges, the picks, their own bill. */
function plannerCharDetailHtml() {
  const plan = plannerCurrentPlan();
  if (!plan) {
    return `<div class="guide-empty"><span>${escapeHtml(t("planner.noCharacters"))}</span></div>`;
  }
  const mats = getCharacterMats(plan.name);
  if (!mats) return "";
  const rarity = Number(mats.rarity || getCharacterRarity(plan.name) || 5);
  const maxInsight = getMaxInsightForRarity(rarity);

  const materials = plannerCharMaterials(plan);

  return `
      <div class="planner-char-controls">
        ${plannerInsightPicksHtml(plan, maxInsight)}
        ${plannerLevelSlidersHtml(plan)}
        ${plannerResoSlidersHtml(plan)}
        ${plannerEuphoriaMasteryHtml(mats, plan)}
        ${plannerFrequencyHtml(mats, plan)}
      </div>

      <div class="planner-char-actions">
        <button type="button" class="btn btn-secondary planner-quick-goal" id="planner-quick-goal">${escapeHtml(
          t("planner.quickGoal")
        )}</button>
      </div>

      <div class="archetype-section-header planner-char-mats-head">
        <span class="archetype-section-title"><span>${escapeHtml(t("planner.charMaterials"))}</span></span>
      </div>
      ${plannerMatGridHtml(materials, "planner.charMaterialsEmpty")}`;
}

/**
 * The grid: head icons and nothing else, so the whole plan is visible at once.
 * A tile the reader has taken out of the plan stays in place, dimmed, so it is
 * one press away from coming back.
 */
function plannerCharRailHtml() {
  if (!plannerChars.length) {
    return `<p class="planner-rail-empty">${escapeHtml(t("planner.noCharacters"))}</p>`;
  }
  return plannerChars
    .map((plan) => {
      const enabled = plan.enabled !== false;
      const icon = characterDb[plan.name] || "";
      const label = escapeHtml(displayCharName(plan.name));
      return `<button type="button" class="planner-char-tile${
        enabled ? "" : " is-disabled"
      }" data-char="${escapeHtml(plan.name)}" title="${label}" aria-label="${label}" aria-pressed="${
        enabled ? "true" : "false"
      }">
          ${
            icon
              ? `<img class="planner-char-tile-img" src="${escapeHtml(icon)}" alt="" loading="lazy" />`
              : `<span class="planner-char-tile-img" aria-hidden="true"></span>`
          }
        </button>`;
    })
    .join("");
}

/**
 * The Goal lightbox body: every enabled character's bill, added up. It is the bill
 * and nothing else — the wall of art says whose it is by what it asks for, and the
 * sheet's own title says what the panel is.
 */
function plannerGoalHtml() {
  if (!plannerChars.length) {
    return `<div class="guide-empty"><span>${escapeHtml(t("planner.noCharacters"))}</span></div>`;
  }
  if (!plannerEnabledChars().length) {
    return `<div class="guide-empty"><span>${escapeHtml(t("planner.farmEmpty"))}</span></div>`;
  }
  return plannerMatGridHtml(plannerGoalMaterials(), "planner.goalEmpty");
}

/* ---- The farm route ------------------------------------------------------- */

/** The bill the route has to cover: every enabled arcanist, added up. */
function plannerFarmBill() {
  const acc = {};
  for (const plan of plannerEnabledChars()) {
    for (const row of plannerCharMaterials(plan)) {
      acc[row.material] = (acc[row.material] || 0) + row.quantity;
    }
  }
  return acc;
}

/**
 * Cache key for a solved route. The Wilderness settings belong in it because they
 * change the Dust/Sharpodonty coefficients the solve works with, so turning a Dust
 * Bell Tower up is a different problem, not just a different label.
 */
function plannerFarmSignature(bill) {
  const rows = Object.entries(bill)
    .filter(([, qty]) => qty > 0)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([material, qty]) => `${material}=${qty}`)
    .join("|");
  return `${rows}§${plannerWildernessSignature()}`;
}

let plannerGlpkFactory = null;
let plannerGlpk = null;

/** Loads `vendor/glpk.min.js` once. It bundles its wasm and runs in a worker. */
async function plannerGlpkInstance() {
  if (plannerGlpk) return plannerGlpk;
  if (!plannerGlpkFactory) plannerGlpkFactory = import("./vendor/glpk.min.js");
  const mod = await plannerGlpkFactory;
  plannerGlpk = await mod.default();
  return plannerGlpk;
}

/**
 * Solves the bill as an integer program: one variable per stage (how many times
 * to run it) and per Wishing Spring recipe (how many times to craft it), each
 * constraint one material that has to be covered, the objective total stamina.
 *
 * Crafting is a variable rather than a constant because a recipe is often the
 * cheapest way to *make* a tier out of a lower one — the model then decides
 * whether to farm the drop or craft it, which is exactly the question.
 *
 * Returns `{ sig, stamina, groups, oneiric, reveries, unreachable }`.
 */
async function plannerFarmSolve(bill, sig) {
  const stages = (plannerFarmData && plannerFarmData.stages) || [];
  const glpk = await plannerGlpkInstance();

  /** name -> { stamina, coefs: Map<material, amount per unit> } */
  const variables = new Map();
  const craftCost = new Map();
  /** Every material a recipe spends. Each one needs a balance row of its own. */
  const craftInputs = new Set();

  const itemByName = new Map(itemsData.map((item) => [String(item.name).toLowerCase(), item]));
  const itemById = new Map(itemsData.map((item) => [String(item.id), item]));

  for (const [id, inputs] of Object.entries(itemFormulasData || {})) {
    const out = itemById.get(String(id));
    if (!out || !Array.isArray(inputs) || !inputs.length) continue;
    const coefs = new Map([[out.name, 1]]);
    let sharpo = 0;
    for (const row of inputs) {
      if (!row || !row.material) continue;
      const amount = Number(row.quantity) || 0;
      if (row.material === "Sharpodonty") sharpo += amount;
      coefs.set(row.material, (coefs.get(row.material) || 0) - amount);
      craftInputs.add(row.material);
    }
    variables.set(`craft␟${out.name}`, { stamina: 0, coefs });
    craftCost.set(out.name, sharpo);
  }

  // Wilderness pays out per real day, so it is worth `daily × (a run's share of a
  // day)` to every run: a stage that costs 25 stamina also earns 25/240 of a day's
  // Dust. Wiring it into the two resource coefficients is what makes the solve
  // need fewer Dust runs, which is exactly the question it answers.
  const wildDaily = plannerWildernessDaily();
  const dayShare = wildDaily.dust > 0 || wildDaily.gold > 0 ? 1 / Math.max(1, plannerActivityStamina()) : 0;

  const stageByName = new Map();
  for (const stage of stages) {
    const coefs = new Map();
    for (const [material, rate] of Object.entries(stage.drops || {})) {
      const amount = Number(rate) || 0;
      if (amount > 0) coefs.set(material, amount);
    }
    if (!coefs.size && !dayShare) continue;
    const cost = Number(stage.cost) || 0;
    if (dayShare) {
      if (wildDaily.dust > 0) coefs.set("Dust", (coefs.get("Dust") || 0) + wildDaily.dust * cost * dayShare);
      if (wildDaily.gold > 0)
        coefs.set("Sharpodonty", (coefs.get("Sharpodonty") || 0) + wildDaily.gold * cost * dayShare);
    }
    variables.set(`stage␟${stage.name}`, { stamina: cost, coefs });
    stageByName.set(stage.name, stage);
  }

  // Only a positive coefficient can pay a material in: a stage drop or a recipe's
  // output. A material that only ever gets *spent* (a shop currency a recipe eats)
  // must not look farmable, or its constraint would be unsatisfiable.
  const reachable = new Set();
  for (const variable of variables.values()) {
    for (const [key, amount] of variable.coefs) if (amount > 0) reachable.add(key);
  }

  const needs = new Map();
  const shop = { oneiric: [], reveries: [] };
  const unreachable = [];
  // A 6★ Resonate Material is not bought from the Oneiric Shop: the game only
  // hands it out through a Crystal Casket, so the four of them collapse into the
  // caskets they cost (Kornblume's `processResonanceMaterials`).
  let casketCount = 0;
  for (const [material, quantity] of Object.entries(bill)) {
    if (!(quantity > 0)) continue;
    const item = itemByName.get(material.toLowerCase());
    const family = item && PLANNER_SHOP_FAMILIES[item.category];
    if (family) {
      if (family === "oneiric" && Number(item.rarity) >= 6) {
        casketCount += quantity;
        continue;
      }
      shop[family].push({ material, quantity });
      continue;
    }
    if (!reachable.has(material)) {
      unreachable.push(material);
      continue;
    }
    needs.set(material, quantity);
  }
  if (casketCount > 0) {
    const casket = itemByName.get("crystal casket");
    shop.oneiric.push({
      material: (casket && casket.name) || "Crystal Casket",
      quantity: casketCount,
    });
  }
  shop.oneiric.sort((a, b) => b.quantity - a.quantity);
  shop.reveries.sort((a, b) => b.quantity - a.quantity);

  const empty = {
    sig,
    stamina: 0,
    groups: [],
    oneiric: shop.oneiric,
    reveries: shop.reveries,
    unreachable,
    empty: true,
  };
  if (!needs.size) return empty;

  // A recipe spends its inputs, and the model may only spend what it also pays for.
  // Without a row per input the solver consumes them out of nothing: every craftable
  // item would cost 0 stamina, which is what made "craft 10 Bifurcated Skeleton, 0
  // stamina" the answer instead of farming the fodder. Materials that are already a
  // bill line get their row from `needs`; every other input gets a plain `>= 0`.
  const balance = [...craftInputs].filter(
    (material) => !needs.has(material) && reachable.has(material)
  );

  const subjectTo = [
    ...[...needs].map(([material, quantity]) => ({ material, quantity })),
    ...balance.map((material) => ({ material, quantity: 0 })),
  ].map(({ material, quantity }) => ({
    name: material,
    vars: [...variables]
      .filter(([, variable]) => variable.coefs.has(material))
      .map(([name, variable]) => ({ name, coef: variable.coefs.get(material) })),
    bnds: { type: glpk.GLP_LO, lb: quantity, ub: 0 },
  }));

  const model = {
    name: "farm",
    objective: {
      direction: glpk.GLP_MIN,
      name: "stamina",
      vars: [...variables].map(([name, variable]) => ({ name, coef: variable.stamina })),
    },
    subjectTo,
    // Whole runs and whole crafts are the only thing the game can do. A 1% MIP
    // gap keeps the solve in the low hundreds of milliseconds instead of the
    // tens of seconds a proven optimum takes, and the 1% is stamina noise.
    generals: [...variables.keys()],
  };
  // The ESM build returns a promise here (the CJS one is synchronous), so the
  // solve has to be awaited either way.
  const solved = await glpk.solve(model, {
    tmlim: PLANNER_FARM_SOLVE.tmlim,
    mipgap: PLANNER_FARM_SOLVE.mipgap,
    msglev: glpk.GLP_MSG_OFF,
  });
  // 2 = feasible (the 1% gap was reached), 5 = proven optimal. Anything else means
  // the model found no plan at all, and returning `vars: {}` would print an empty
  // route at 0 stamina as if the plan were free.
  const status = Number((solved.result && solved.result.status) || 0);
  if (status !== 2 && status !== 5) {
    throw new Error(`farm solve found no plan (status ${status})`);
  }
  const vars = (solved.result && solved.result.vars) || {};

  const resources = [];
  const insight = [];
  const hard = [];
  const crafting = [];
  let stamina = 0;

  for (const [name, value] of Object.entries(vars)) {
    const runs = Math.round(Number(value) || 0);
    if (runs <= 0) continue;
    if (name.startsWith("craft␟")) {
      const material = name.slice("craft␟".length);
      const sharpo = runs * (craftCost.get(material) || 0);
      stamina += 0;
      crafting.push({ kind: "craft", material, runs, sharpodonty: sharpo });
      continue;
    }
    const stage = stageByName.get(name.slice("stage␟".length));
    if (!stage) continue;
    const cost = runs * (Number(stage.cost) || 0);
    stamina += cost;
    const drops = [];
    for (const [material, rate] of Object.entries(stage.drops || {})) {
      const exact = (Number(rate) || 0) * runs;
      // Kornblume's rounding: `.9` and up counts as the next whole item.
      const rounded = exact % 1 >= 0.9 ? Math.ceil(exact) : Math.floor(exact);
      if (rounded > 0) drops.push({ material, quantity: rounded });
    }
    if (!drops.length) continue;
    const card = { kind: "stage", stage: stage.name, category: stage.category, runs, stamina: cost, drops };
    if (stage.category === "Resource") resources.push(card);
    else if (stage.category === "Insight") insight.push(card);
    else hard.push(card);
  }

  const byStamina = (a, b) => b.stamina - a.stamina || a.stage.localeCompare(b.stage);
  resources.sort(byStamina);
  insight.sort(byStamina);
  hard.sort(byStamina);
  crafting.sort((a, b) => b.runs - a.runs || a.material.localeCompare(b.material));

  // The Wilderness credit is the one card that is not a run: it is what the board
  // pays out over the days the route takes, so it is stated once, on top of the
  // resources, instead of being smeared across every stage card.
  if (wildDaily.dust > 0 || wildDaily.gold > 0) {
    const wantsDust = needs.has("Dust");
    const wantsGold = needs.has("Sharpodonty");
    const days = stamina > 0 ? stamina / Math.max(1, plannerActivityStamina()) : 0;
    const drops = [];
    if (wantsDust) drops.push({ material: "Dust", quantity: Math.floor(wildDaily.dust * days) });
    if (wantsGold) drops.push({ material: "Sharpodonty", quantity: Math.floor(wildDaily.gold * days) });
    if (drops.length) {
      resources.unshift({ kind: "wilderness", stage: "Wilderness", days, drops, stamina: 0, runs: 0 });
    }
  }

  const groups = [];
  if (resources.length) groups.push({ key: "planner.farmResources", cards: resources });
  if (insight.length) groups.push({ key: "planner.farmInsight", cards: insight });
  if (hard.length) groups.push({ key: "planner.farmStages", cards: hard });
  if (crafting.length) groups.push({ key: "planner.farmCrafting", cards: crafting });

  return { sig, stamina, groups, oneiric: shop.oneiric, reveries: shop.reveries, unreachable };
}

/** Starts the solve for the current bill, unless that bill is already solved. */
function plannerFarmRefresh() {
  if (!plannerFarmData) return;
  const bill = plannerFarmBill();
  const sig = plannerFarmSignature(bill);
  if (plannerFarmCache && plannerFarmCache.sig === sig) return;
  // One solve at a time. Each one pays its whole time budget, so a solve started per
  // slider press would queue up behind the one before it and the route would trail
  // the plan by seconds. A plan that moves meanwhile is solved when this one lands.
  if (plannerFarmSolving) {
    if (plannerFarmSolving !== sig) plannerFarmPending = true;
    return;
  }
  plannerFarmSolving = sig;
  plannerFarmPending = false;
  plannerFarmError = false;
  const settle = (plan) => {
    plannerFarmSolving = null;
    // A solve for a bill the reader has already moved past is not the answer.
    if (plan && sig === plannerFarmSignature(plannerFarmBill())) plannerFarmCache = plan;
    plannerFarmPaint();
    if (plannerFarmPending) {
      plannerFarmPending = false;
      plannerFarmRefresh();
    }
  };
  plannerFarmSolve(bill, sig)
    .then(settle)
    .catch((error) => {
      console.warn("Could not solve the farm route", error);
      plannerFarmSolving = null;
      plannerFarmPending = false;
      plannerFarmError = true;
      plannerFarmPaint();
    });
}

function plannerFarmStickerHtml(material, quantity, exact) {
  const item = getItemByName(material);
  const name = escapeHtml(
    item ? (currentLang === "cn" ? item.nameZh || item.name || material : item.name || material) : material
  );
  const badge = escapeHtml(formatMaterialQuantity(quantity));
  const art = item && item.icon
    ? `<img src="${escapeHtml(item.icon)}" alt="" class="item-sticker-img" loading="lazy" />`
    : `<span class="planner-mat-art-empty" aria-hidden="true"></span>`;
  return `<div class="planner-farm-drop item-sticker" data-item="${escapeHtml(material)}" data-qty="${exact}" title="${name} × ${escapeHtml(plannerNumber(exact))}">
      ${item && item.border ? `<img src="${escapeHtml(item.border)}" alt="" class="item-sticker-border" loading="lazy" />` : ""}
      ${art}
      <span class="item-sticker-qty planner-mat-qty">${badge}</span>
    </div>`;
}

function plannerFarmCardHtml(card) {
  // Wilderness is not a run: it pays out over the days the rest of the route takes,
  // so the card shows the days instead of runs and stamina.
  if (card.kind === "wilderness") {
    const drops = card.drops
      .map((drop) => plannerFarmStickerHtml(drop.material, drop.quantity, drop.quantity))
      .join("");
    const days = plannerNumber(Number(card.days.toFixed(1)));
    return `
      <div class="planner-farm-card is-wilderness" data-wilderness="1" data-days="${card.days}">
        <div class="planner-farm-card-head">
          <img src="images/items/wilderness_icon.png" alt="" class="planner-farm-wild-icon" />
          <span class="planner-farm-stage">${escapeHtml(t("planner.wilderness"))}</span>
          <span class="planner-farm-days">${escapeHtml(t("planner.farmDays", { days }))}</span>
        </div>
        <div class="planner-farm-drops">${drops}</div>
      </div>`;
  }
  if (card.kind === "craft") {
    const item = getItemByName(card.material);
    const name = escapeHtml(
      item ? (currentLang === "cn" ? item.nameZh || item.name : item.name) : card.material
    );
    const sharpo = getItemByName("Sharpodonty");
    const sharpoIcon = (sharpo && sharpo.icon) || "";
    const sharpoName = escapeHtml(
      sharpo ? (currentLang === "cn" ? sharpo.nameZh || sharpo.name : sharpo.name) : "Sharpodonty"
    );
    return `
        <div class="planner-farm-card is-craft" data-stage="Wishing Spring" data-craft="${escapeHtml(
          card.material
        )}" data-runs="${card.runs}">
          <div class="planner-farm-card-head">
            <span class="planner-farm-stage">${name}</span>
            <span class="planner-farm-runs">×${escapeHtml(plannerNumber(card.runs))}</span>
          </div>
          <div class="planner-farm-sharpo" title="${sharpoName}">
            ${sharpoIcon ? `<img src="${escapeHtml(sharpoIcon)}" alt="" class="planner-farm-sharpo-icon" />` : ""}
            <span>${escapeHtml(plannerNumber(card.sharpodonty))}</span>
          </div>
        </div>`;
  }
  const drops = card.drops
    .map((drop) => plannerFarmStickerHtml(drop.material, drop.quantity, drop.quantity))
    .join("");
  return `
      <div class="planner-farm-card" data-stage="${escapeHtml(card.stage)}" data-runs="${card.runs}" data-stamina="${card.stamina}">
        <div class="planner-farm-card-head">
          <span class="planner-farm-stage">${escapeHtml(card.stage)}</span>
          <span class="planner-farm-runs">×${escapeHtml(plannerNumber(card.runs))}</span>
          <span class="planner-farm-stamina">
            <img src="images/random_icon/Stamina.webp" alt="" />
            <span>${escapeHtml(plannerNumber(card.stamina))}</span>
          </span>
        </div>
        <div class="planner-farm-drops">${drops}</div>
      </div>`;
}

function plannerFarmShopHtml(list) {
  return list
    .map((row) => {
      const item = getItemByName(row.material);
      const name = escapeHtml(
        item ? (currentLang === "cn" ? item.nameZh || item.name : item.name) : row.material
      );
      // A shop row is a purchase, not a run: these two currencies are not farmed with
      // stamina, so the row carries no stamina figure at all.
      return `
          <div class="planner-farm-shop-row" data-item="${escapeHtml(row.material)}" data-qty="${
        row.quantity
      }" title="${name} × ${escapeHtml(plannerNumber(row.quantity))}">
            ${plannerFarmStickerHtml(row.material, row.quantity, row.quantity)}
            <span class="planner-farm-shop-name">${name}</span>
          </div>`;
    })
    .join("");
}

/** Draws whatever the cache holds; the solve itself is started elsewhere. */
function plannerFarmPaint() {
  const host = document.getElementById("planner-farm");
  if (!host) return;
  // The Wilderness switch rides on the route's own title, so it is reachable
  // before the plan says anything (turn it on, then look at what shortens).
  const wildOn = plannerWilderness.enabled;
  const title = `<div class="archetype-section-header planner-farm-head">
      <span class="archetype-section-title"><span>${escapeHtml(t("planner.farmTitle"))}</span></span>
      <button type="button" class="planner-farm-toggle${wildOn ? " is-active" : ""}" id="planner-farm-wilderness" data-enabled="${
        wildOn ? "true" : "false"
      }" aria-pressed="${wildOn ? "true" : "false"}">${escapeHtml(t("planner.wilderness"))}</button>
    </div>`;

  if (!plannerEnabledChars().length) {
    host.innerHTML = `${title}<div class="guide-empty"><span>${escapeHtml(t("planner.farmEmpty"))}</span></div>`;
    return;
  }
  if (!plannerFarmData) {
    host.innerHTML = `${title}<div class="guide-empty"><span>${escapeHtml(t("planner.farmFailed"))}</span></div>`;
    return;
  }
  const bill = plannerFarmBill();
  const sig = plannerFarmSignature(bill);
  if (plannerFarmError && !plannerFarmCache) {
    host.innerHTML = `${title}<div class="guide-empty"><span>${escapeHtml(t("planner.farmFailed"))}</span></div>`;
    return;
  }
  if (!plannerFarmCache || plannerFarmCache.sig !== sig) {
    host.innerHTML = `${title}<div class="guide-empty is-busy"><span>${escapeHtml(
      t("planner.farmSolving")
    )}</span></div>`;
    return;
  }

  const plan = plannerFarmCache;
  const perDay = plannerActivityStamina();
  const days = perDay > 0 ? Number((plan.stamina / perDay).toFixed(1)) : 0;

  const oneiricHtml = plan.oneiric.length
    ? `<div class="archetype-section-header planner-farm-head">
        <span class="archetype-section-title"><span>${escapeHtml(t("planner.farmOneiric"))}</span></span>
      </div>
      <div class="planner-farm-shoplist">${plannerFarmShopHtml(plan.oneiric)}</div>`
    : "";
  const reveriesHtml = plan.reveries.length
    ? `<div class="archetype-section-header planner-farm-head">
        <span class="archetype-section-title"><span>${escapeHtml(t("planner.farmReveries"))}</span></span>
      </div>
      <div class="planner-farm-shoplist">${plannerFarmShopHtml(plan.reveries)}</div>`
    : "";

  const groupsHtml = plan.groups
    .map(
      (group) => `<div class="archetype-section-header planner-farm-head">
        <span class="archetype-section-title"><span>${escapeHtml(t(group.key))}</span></span>
      </div>
      <div class="planner-farm-grid">${group.cards.map(plannerFarmCardHtml).join("")}</div>`
    )
    .join("");

  const empty =
    !plan.groups.length && !plan.oneiric.length && !plan.reveries.length
      ? `<div class="guide-empty"><span>${escapeHtml(t("planner.farmEmpty"))}</span></div>`
      : "";

  host.innerHTML = `${title}
    <div class="planner-farm-total">
      <span class="planner-farm-total-label">${escapeHtml(t("planner.farmTotal"))}</span>
      <img src="images/random_icon/Stamina.webp" alt="" />
      <span class="planner-farm-total-value" id="planner-farm-stamina">${escapeHtml(
        plannerNumber(plan.stamina)
      )}</span>
      <span class="planner-farm-total-days" id="planner-farm-days">${escapeHtml(
        t("planner.farmDays", { days: plannerNumber(days) })
      )}</span>
    </div>
    ${reveriesHtml}${oneiricHtml}${groupsHtml}${empty}`;
}

function renderPlannerCharacter() {
  const rail = document.getElementById("planner-char-rail");
  const detail = document.getElementById("planner-char-detail");
  const goal = document.getElementById("planner-goal");
  const count = document.getElementById("planner-char-count");
  const hint = document.getElementById("planner-rail-hint");
  const activityValue = document.getElementById("planner-activity-value");
  if (count) {
    count.textContent = plannerChars.length ? t("planner.charCount", { n: plannerChars.length }) : "";
  }
  if (rail) rail.innerHTML = plannerCharRailHtml();
  if (hint) hint.textContent = plannerChars.length ? t("planner.railHint") : "";
  // The activity panel is a lightbox of this tab, so its readouts follow the
  // language with the rest of it (the numbers are formatted for the locale).
  syncPlannerActivitySheet();
  if (detail) detail.innerHTML = plannerCharDetailHtml();
  if (goal) goal.innerHTML = plannerGoalHtml();
  const editorTitle = document.getElementById("planner-editor-title");
  const selected = plannerCurrentPlan();
  if (editorTitle) {
    editorTitle.textContent = selected ? displayCharName(selected.name) : t("planner.editCharacter");
  }
  // The editor wears the Character Setting modal's head, so it carries the same
  // portrait and the arcanist's name — nothing else: the plan's own numbers are the
  // settings under it.
  const portrait = document.getElementById("planner-editor-portrait");
  if (portrait) {
    const icon = selected ? characterDb[selected.name] || "" : "";
    if (icon) {
      portrait.src = icon;
      portrait.hidden = false;
    } else {
      portrait.removeAttribute("src");
      portrait.hidden = true;
    }
  }
  const removeBtn = document.getElementById("planner-editor-remove");
  if (removeBtn) removeBtn.dataset.remove = selected ? selected.name : "";
  if (activityValue) activityValue.textContent = plannerNumber(plannerActivityStamina());
  plannerFarmRefresh();
  plannerFarmPaint();
}

/**
 * The picker is the Manage modal's roster list, restricted to what the plan can
 * price: the same characters that modal shows (so a curated exclusion such as
 * Schneider never appears), highest rarity first, newest release first inside a
 * rarity — `compareUnownedCharacters` is that ordering.
 */
function plannerPickerNames() {
  const added = new Set(plannerChars.map((plan) => plan.name));
  const query = plannerPickerQuery.trim().toLowerCase();
  return Object.keys(characterDb)
    .filter((name) => {
      if (added.has(name)) return false;
      // No billed steps, no card to plan.
      if (!charactersMatsData[name]) return false;
      if (isCharacterExcluded(name)) return false;
      if (!futureSightEnabled && futureSightChars.has(name)) return false;
      if (plannerPickerRarities.size > 0 && !plannerPickerRarities.has(getCharacterRarity(name))) return false;
      if (!query) return true;
      return characterMatchesQuery(name, query);
    })
    .sort(compareUnownedCharacters);
}

/**
 * The tiles are the Manage modal's own roster tile (`roster-char-item` +
 * `roster-avatar-box`), so the picker reads as the same object as the roster
 * manager: search box, rarity chips, head icon and name.
 */
function renderPlannerPicker() {
  const grid = document.getElementById("planner-picker-grid");
  if (!grid) return;
  const names = plannerPickerNames();
  if (!names.length) {
    grid.innerHTML = `<div class="guide-empty"><span>${escapeHtml(t("planner.pickerEmpty"))}</span></div>`;
    return;
  }
  grid.innerHTML = names
    .map((name) => {
      const icon = characterDb[name] || "";
      const label = escapeHtml(displayCharName(name));
      return `<div class="roster-char-item planner-pick" data-pick="${escapeHtml(
        name
      )}" role="button" tabindex="0" title="${label}">
          <div class="roster-avatar-box">
            ${
              icon
                ? `<img src="${escapeHtml(icon)}" alt="" class="roster-avatar-img" loading="lazy" decoding="async" />`
                : ""
            }
          </div>
          <span class="roster-char-name${
            isItalicNameCharacter(name) ? " is-italic-name" : ""
          }">${label}</span>
        </div>`;
    })
    .join("");
  syncPlannerPickerRarity();
}

function syncPlannerPickerRarity() {
  const group = document.getElementById("planner-picker-rarity");
  if (!group) return;
  group.querySelectorAll(".filter-btn").forEach((btn) => {
    const rarity = Number(btn.dataset.rarity);
    btn.classList.toggle("active", plannerPickerRarities.has(rarity));
  });
}

/* ---- Lightboxes ----------------------------------------------------------- */

function plannerOpenSheet(id) {
  const sheet = document.getElementById(id);
  if (!sheet) return;
  plannerActiveSheet = id;
  document.querySelectorAll("#planner-pane-character .planner-sheet").forEach((el) => {
    if (el.id !== id) el.hidden = true;
  });
  sheet.hidden = false;
  if (id === "planner-picker") {
    plannerPickerQuery = "";
    plannerPickerRarities.clear();
    const search = document.getElementById("planner-picker-search");
    if (search) search.value = "";
    renderPlannerPicker();
    syncPlannerPickerRarity();
    if (search) search.focus();
  }
  if (id === "planner-goal-sheet") {
    const goal = document.getElementById("planner-goal");
    if (goal) goal.innerHTML = plannerGoalHtml();
  }
  if (id === "planner-activity-sheet") syncPlannerActivitySheet();
  if (id === "planner-wilderness-sheet") syncPlannerWildernessSheet();
}

function plannerCloseSheets() {
  plannerActiveSheet = "";
  document.querySelectorAll("#planner-pane-character .planner-sheet").forEach((el) => {
    el.hidden = true;
  });
}

function openPlannerPicker() {
  plannerOpenSheet("planner-picker");
}

function closePlannerPicker() {
  const picker = document.getElementById("planner-picker");
  if (picker) picker.hidden = true;
  if (plannerActiveSheet === "planner-picker") plannerActiveSheet = "";
}

/** The one arcanist's panel; a left press on a head icon lands here. */
function openPlannerEditor(name) {
  if (!name || !plannerChars.some((plan) => plan.name === name)) return;
  plannerCharSelected = name;
  plannerSaveChars();
  renderPlannerCharacter();
  plannerOpenSheet("planner-char-editor");
}

function openPlannerGoal() {
  renderPlannerCharacter();
  plannerOpenSheet("planner-goal-sheet");
}

/** Sets a two-button on/off group (`.toggle-group` + `.btn-toggle`). */
function plannerSyncToggle(id, on) {
  const group = document.getElementById(id);
  if (!group) return;
  group.querySelectorAll(".btn-toggle").forEach((btn) => {
    const active = (btn.dataset.value === "1") === !!on;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function plannerOnOff(on) {
  return t(on ? "planner.on" : "planner.off");
}

/** Writes the activity ticks back into the form, and the day they are worth. */
function syncPlannerActivitySheet() {
  const roaring = document.getElementById("planner-set-roaring");
  if (roaring) roaring.checked = plannerActivity.roaringMonth === true;
  const weekly = document.getElementById("planner-set-weekly");
  if (weekly) weekly.checked = plannerActivity.weeklyActivity === true;
  const perDay = document.getElementById("planner-activity-perday");
  if (perDay) perDay.textContent = t("planner.activityPerDay", { n: plannerNumber(plannerActivityStamina()) });
}

function openPlannerActivity() {
  syncPlannerActivitySheet();
  plannerOpenSheet("planner-activity-sheet");
}

function plannerSetActivity(patch) {
  plannerActivity = { ...plannerActivity, ...patch };
  plannerSaveActivity();
  syncPlannerActivitySheet();
  const activityValue = document.getElementById("planner-activity-value");
  if (activityValue) activityValue.textContent = plannerNumber(plannerActivityStamina());
  // Wilderness is worth a share of a day, so a day's stamina also changes what it
  // is worth to a run — the route is solved again, not merely re-totalled.
  plannerFarmRefresh();
  plannerFarmPaint();
  const shop = plannerShop();
  if (shop) {
    updatePlannerOwnedTooltip(
      plannerTotalSpend(shop),
      Number(plannerOwned[plannerShopId]) || 0
    );
  }
}

/* ---- Wilderness sheet ------------------------------------------------------ */

/** The levels a building can be built to, which is what the game's board offers. */
const PLANNER_WILDERNESS_KEYS = ["dust1", "dust2", "dust3", "gold1", "gold2", "gold3"];

function plannerWildernessSelectHtml(key, label) {
  const value = plannerWilderness[key];
  const options = plannerSeries(0, 6)
    .map((level) => `<option value="${level}"${level === value ? " selected" : ""}>Lv.${level}</option>`)
    .join("");
  return `<select class="planner-field-select" id="planner-wild-${key}" data-wild="${key}" aria-label="${escapeHtml(
    label
  )}" title="${escapeHtml(label)}">${options}</select>`;
}

/** Dust and Sharpodonty a day, as the same item sticker the bill uses. */
function plannerWildernessOutputHtml(output) {
  return [
    { material: "Dust", quantity: output.dust },
    { material: "Sharpodonty", quantity: output.gold },
  ]
    .filter((row) => row.quantity > 0)
    .map(
      (row) => `<div class="planner-wilderness-stat" data-item="${escapeHtml(row.material)}" data-qty="${
        row.quantity
      }">
          ${plannerFarmStickerHtml(row.material, row.quantity, row.quantity)}
          <span class="planner-wilderness-stat-value">${escapeHtml(plannerNumber(row.quantity))}</span>
        </div>`
    )
    .join("");
}

function syncPlannerWildernessSheet() {
  plannerSyncToggle("planner-wilderness-toggle", plannerWilderness.enabled);
  const state = document.getElementById("planner-wilderness-state");
  if (state) state.textContent = plannerOnOff(plannerWilderness.enabled);

  const dustHost = document.getElementById("planner-wilderness-dust");
  if (dustHost && !dustHost.querySelector("select")) {
    dustHost.innerHTML = ["dust1", "dust2", "dust3"]
      .map((key) => plannerWildernessSelectHtml(key, t("planner.dustBellTowers")))
      .join("");
  }
  const goldHost = document.getElementById("planner-wilderness-gold");
  if (goldHost && !goldHost.querySelector("select")) {
    goldHost.innerHTML = ["gold1", "gold2", "gold3"]
      .map((key) => plannerWildernessSelectHtml(key, t("planner.sharpodontyMarkets")))
      .join("");
  }
  PLANNER_WILDERNESS_KEYS.forEach((key) => {
    const el = document.getElementById(`planner-wild-${key}`);
    if (el) el.value = String(plannerWilderness[key]);
  });

  const vigor = document.getElementById("planner-wilderness-vigor");
  if (vigor) vigor.value = String(plannerWilderness.vigor);

  const output = document.getElementById("planner-wilderness-output");
  if (output) output.innerHTML = plannerWildernessOutputHtml(plannerWildernessOutput());
}

function openPlannerWilderness() {
  syncPlannerWildernessSheet();
  plannerOpenSheet("planner-wilderness-sheet");
}

function plannerSetWilderness(patch) {
  plannerWilderness = { ...plannerWilderness, ...patch };
  // The sheet writes back through here, so a hand-edited value is clamped once.
  plannerWilderness = {
    ...plannerWilderness,
    enabled: plannerWilderness.enabled === true,
    dust1: plannerWildernessLevel(plannerWilderness.dust1, 6),
    dust2: plannerWildernessLevel(plannerWilderness.dust2, 6),
    dust3: plannerWildernessLevel(plannerWilderness.dust3, 6),
    gold1: plannerWildernessLevel(plannerWilderness.gold1, 6),
    gold2: plannerWildernessLevel(plannerWilderness.gold2, 6),
    gold3: plannerWildernessLevel(plannerWilderness.gold3, 6),
    vigor: Math.max(0, Math.round(Number(plannerWilderness.vigor) || 0)),
  };
  plannerSaveWilderness();
  syncPlannerWildernessSheet();
  // The board's output is a coefficient of the solve, so the route has to be solved
  // again; the signature carries the new figure, so a repeat press is still cheap.
  plannerFarmRefresh();
  plannerFarmPaint();
}

function plannerAddCharacter(name) {
  if (!name || plannerChars.some((plan) => plan.name === name)) return;
  const plan = plannerClampPlan(plannerPlanDefaults(name));
  if (!plan) return;
  plannerChars.push(plan);
  plannerCharSelected = plan.name;
  plannerSaveChars();
  closePlannerPicker();
  renderPlannerCharacter();
  plannerOpenSheet("planner-char-editor");
}

/** Right-click on a tile: keep the settings, drop it from the plan's totals. */
function plannerToggleCharacterEnabled(name) {
  const plan = plannerChars.find((row) => row.name === name);
  if (!plan) return;
  plan.enabled = plan.enabled === false;
  plannerCharSelected = name;
  plannerSaveChars();
  renderPlannerCharacter();
}

function plannerRemoveCharacter(name) {
  const before = plannerChars.length;
  plannerChars = plannerChars.filter((plan) => plan.name !== name);
  if (plannerChars.length === before) return;
  if (plannerCharSelected === name) {
    plannerCharSelected = (plannerChars[0] || {}).name || "";
  }
  plannerSaveChars();
  if (!plannerChars.length) plannerCloseSheets();
  renderPlannerCharacter();
}

function plannerSetField(field, value) {
  const plan = plannerCurrentPlan();
  if (!plan || !field) return;
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return;
  plan[field] = n;
  plannerClampPlan(plan);
  plannerSaveChars();
  renderPlannerCharacter();
  // Rebuilding the pane throws focus away; hand it back to the same control. Every
  // control names its field (a pip its `data-set`, a slider its `data-slider`), so two
  // lookups cover all three.
  const pick =
    document.querySelector(`#planner-char-detail [data-set="${field}"][data-value="${plan[field]}"]`) ||
    document.querySelector(`#planner-char-detail [data-slider="${field}"]`);
  if (pick) pick.focus();
}

/**
 * A slider drag, painted without a re-render: the plan takes the value so the
 * figure and (on release) the bill and the farm route follow, but the pane is left
 * alone so the thumb never disappears from under the reader's finger. `change`
 * calls `plannerSetField`, which is what rebuilds the panel.
 */
function plannerPreviewField(field, value) {
  const plan = plannerCurrentPlan();
  if (!plan || !field) return;
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return;
  plan[field] = n;
  plannerClampPlan(plan);
  plannerSaveChars();
  const detail = document.getElementById("planner-char-detail");
  if (!detail) return;
  // A clamp can move the other end too (a goal level below the current one, a resonance
  // cap following the insight down), so every readout and every thumb is repainted from
  // the clamped plan rather than from the value the drag reported.
  const setText = (selector, text) => {
    const el = detail.querySelector(selector);
    if (el) el.textContent = text;
  };
  setText(
    '[data-readout="insight"]',
    `${plannerInsightLabel(plan.curInsight)} → ${plannerInsightLabel(plan.goalInsight)}`
  );
  setText('[data-readout="level"]', `Lv.${plan.curLevel} → Lv.${plan.goalLevel}`);
  setText('[data-readout="reso"]', `R${plan.curReso} → R${plan.goalReso}`);
  setText('[data-readout="mastery"]', `${plan.curMastery} → ${plan.goalMastery}`);
  Object.entries(PLANNER_SLIDER_FIELDS).forEach(([key, format]) => {
    setText(`[data-number="${key}"]`, format(plan[key]));
    const input = detail.querySelector(`[data-slider="${key}"]`);
    if (input && input.value !== String(plan[key])) input.value = String(plan[key]);
  });
}

function plannerToggleList(key, id) {
  const plan = plannerCurrentPlan();
  if (!plan) return;
  const list = Array.isArray(plan[key]) ? plan[key] : [];
  const at = list.indexOf(id);
  if (at === -1) list.push(id);
  else list.splice(at, 1);
  plan[key] = list;
  plannerSaveChars();
  renderPlannerCharacter();
}

/**
 * The usual "this arcanist can fight now" breakpoint: 5★/6★ stop at Insight III
 * Lv.30, everything else at Insight II Lv.50, and Resonance goes to R10 (the
 * board is full there). The current state is never moved.
 */
function plannerQuickGoal() {
  const plan = plannerCurrentPlan();
  const mats = plan && getCharacterMats(plan.name);
  if (!plan || !mats) return;
  const rarity = Number(mats.rarity || getCharacterRarity(plan.name) || 5);
  if (rarity >= 5) {
    plan.goalInsight = 3;
    plan.goalLevel = 30;
  } else {
    plan.goalInsight = getMaxInsightForRarity(rarity);
    plan.goalLevel = 50;
  }
  plan.goalReso = Math.min(10, plannerResoMax(plan.goalInsight));
  plannerClampPlan(plan);
  plannerSaveChars();
  renderPlannerCharacter();
}

function setPlannerTab(tab) {
  plannerActiveTab = PLANNER_TABS.includes(tab) ? tab : PLANNER_TABS[0];
  savePlannerTab();
  document.querySelectorAll("#planner-modal .builds-mode-btn").forEach((btn) => {
    const active = btn.dataset.mode === plannerActiveTab;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
  // Each pane names itself through `data-pane`, so showing the active one never
  // needs a section per tab.
  document.querySelectorAll("#planner-modal .planner-pane").forEach((pane) => {
    pane.hidden = pane.dataset.pane !== plannerActiveTab;
  });
  closePlannerPicker();
  closeCalcPicker();
  closeCalcInfo();
  closeCalcHelp();
  plannerCloseSheets();
  renderPlanner();
}

function renderPlanner() {
  if (plannerActiveTab === "calculator") renderPlannerCalculator();
  else if (plannerActiveTab === "event") renderPlannerEvent();
  else renderPlannerCharacter();
}

function openPlannerModal() {
  const modal = document.getElementById("planner-modal");
  if (!modal) return;
  setPlannerTab(plannerActiveTab);
  modal.style.display = "flex";
}

function closePlannerModal() {
  const modal = document.getElementById("planner-modal");
  if (modal) modal.style.display = "none";
  plannerCloseSheets();
}


function setupPlannerListeners() {
  const plannerBtn = document.getElementById("btn-planner");
  const modal = document.getElementById("planner-modal");
  if (!modal) return;

  if (plannerBtn) plannerBtn.addEventListener("click", openPlannerModal);
  const closeBtn = document.getElementById("planner-btn-close");
  if (closeBtn) closeBtn.addEventListener("click", closePlannerModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closePlannerModal();
  });

  const select = document.getElementById("planner-shop-select");
  if (select) {
    select.addEventListener("change", () => {
      plannerShopId = select.value;
      savePlannerState();
      renderPlannerEvent();
    });
  }

  // Reset drops the shop's saved picks, so every row falls back to its default
  // (the full purchase cap). It throws away real work, so it asks first.
  const clearBtn = document.getElementById("planner-clear");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      const shop = plannerShop();
      if (!shop) return;
      showConfirmModal(t("planner.reset"), t("planner.resetMsg"), () => {
        for (const group of shop.groups || []) {
          for (const item of group.items || []) {
            delete plannerLimits[plannerLimitKey(shop.id, item.uid)];
          }
        }
        savePlannerState();
        renderPlannerEvent();
      });
    });
  }

  const sections = document.getElementById("planner-sections");
  if (sections) {
    sections.addEventListener("click", (e) => {
      // The stepper's own buttons step by one...
      const btn = e.target.closest(".planner-step");
      if (btn) {
        const row = btn.closest(".planner-card");
        const shop = plannerShop();
        if (!row || !shop) return;
        const item = plannerFindItem(shop, row.dataset.uid);
        if (!item) return;
        const next = plannerLimit(item, shop.id) + Number(btn.dataset.step);
        plannerSetLimit(item, shop.id, next);
        savePlannerState();
        renderPlannerEvent();
        return;
      }

      // ...and a press anywhere else on the card opens the quantity popup, which
      // is the fast way to set a quantity against a big cap.
      const card = e.target.closest(".planner-card");
      if (card) {
        const shop = plannerShop();
        if (!shop) return;
        const item = plannerFindItem(shop, card.dataset.uid);
        if (item) openPlannerSlider(item, shop);
      }
    });
  }

  // Owned input handling
  const ownedInput = document.getElementById("planner-owned-input");
  if (ownedInput) {
    ownedInput.addEventListener("input", () => {
      const shop = plannerShop();
      if (!shop) return;
      const val = Math.max(0, Math.floor(Number(ownedInput.value) || 0));
      plannerOwned[shop.id] = val;
      savePlannerState();
      updatePlannerOwnedTooltip(plannerTotalSpend(shop), val);
    });
  }
  setupPlannerOwnedTooltip();

  // Slider modal event listeners
  const sliderModal = document.getElementById("planner-slider-modal");
  const sliderBackdrop = document.getElementById("planner-slider-backdrop");
  const sliderCloseBtn = document.getElementById("planner-slider-close");
  const sliderRange = document.getElementById("planner-slider-range");
  const sliderInput = document.getElementById("planner-slider-input");
  const sliderMinus = document.getElementById("planner-slider-minus");
  const sliderPlus = document.getElementById("planner-slider-plus");
  const sliderMin = document.getElementById("planner-slider-min");
  const sliderMax = document.getElementById("planner-slider-max");
  const sliderConfirm = document.getElementById("planner-slider-confirm");

  function syncSliderVal(val) {
    if (!plannerActiveSliderItem) return;
    const { item, shop } = plannerActiveSliderItem;
    const clamped = plannerClamp(item, val);
    if (sliderRange) sliderRange.value = String(clamped);
    if (sliderInput) sliderInput.value = String(clamped);
    const denomDisplay = document.getElementById("planner-slider-denom-display");
    if (denomDisplay) {
      denomDisplay.textContent = `${clamped} / ${item.maxBuy === 0 ? "∞" : item.maxBuy}`;
    }
    updatePlannerSliderCost(item, shop, clamped);
  }

  if (sliderBackdrop) sliderBackdrop.addEventListener("click", closePlannerSlider);
  if (sliderCloseBtn) sliderCloseBtn.addEventListener("click", closePlannerSlider);

  if (sliderRange) {
    sliderRange.addEventListener("input", () => syncSliderVal(sliderRange.value));
  }
  if (sliderInput) {
    sliderInput.addEventListener("input", () => syncSliderVal(sliderInput.value));
  }
  if (sliderMinus) {
    sliderMinus.addEventListener("click", () => {
      const cur = Number(sliderRange ? sliderRange.value : sliderInput.value) || 0;
      syncSliderVal(cur - 1);
    });
  }
  if (sliderPlus) {
    sliderPlus.addEventListener("click", () => {
      const cur = Number(sliderRange ? sliderRange.value : sliderInput.value) || 0;
      syncSliderVal(cur + 1);
    });
  }
  if (sliderMin) {
    sliderMin.addEventListener("click", () => syncSliderVal(0));
  }
  if (sliderMax) {
    sliderMax.addEventListener("click", () => {
      if (!plannerActiveSliderItem) return;
      const { item } = plannerActiveSliderItem;
      const maxVal = item.maxBuy > 0 ? item.maxBuy : 999;
      syncSliderVal(maxVal);
    });
  }
  if (sliderConfirm) {
    sliderConfirm.addEventListener("click", () => {
      if (!plannerActiveSliderItem) return;
      const { item, shop } = plannerActiveSliderItem;
      const val = Number(sliderRange ? sliderRange.value : sliderInput.value) || 0;
      plannerSetLimit(item, shop.id, val);
      savePlannerState();
      closePlannerSlider();
      renderPlannerEvent();
    });
  }

  /* ---- Calculator tab ---- */

  setupPlannerCalculator();

  /* ---- Character tab ---- */

  const tabCalculator = document.getElementById("planner-tab-calculator");
  const tabCharacter = document.getElementById("planner-tab-character");
  const tabEvent = document.getElementById("planner-tab-event");
  if (tabCalculator) tabCalculator.addEventListener("click", () => setPlannerTab("calculator"));
  if (tabCharacter) tabCharacter.addEventListener("click", () => setPlannerTab("character"));
  if (tabEvent) tabEvent.addEventListener("click", () => setPlannerTab("event"));

  // The grid is head icons only: a left press opens that arcanist's panel, a
  // right press takes them out of the plan's totals without losing the settings
  // (the tile stays, dimmed, one press away from coming back).
  const charRail = document.getElementById("planner-char-rail");
  if (charRail) {
    charRail.addEventListener("click", (e) => {
      const tile = e.target.closest("[data-char]");
      if (!tile) return;
      openPlannerEditor(tile.dataset.char);
    });
    charRail.addEventListener("contextmenu", (e) => {
      const tile = e.target.closest("[data-char]");
      if (!tile) return;
      e.preventDefault();
      plannerToggleCharacterEnabled(tile.dataset.char);
    });
  }

  const charDetail = document.getElementById("planner-char-detail");
  if (charDetail) {
    charDetail.addEventListener("change", (e) => {
      // Euphoria is a tick box: the box is what toggles the facet.
      const euphoria = e.target.closest("[data-euphoria]");
      if (euphoria) {
        plannerToggleList("euphoria", Number(euphoria.dataset.euphoria));
        return;
      }
      // A slider commits on release, which is when `change` fires; the drag itself
      // is painted in place by the `input` listener below. Insight is a pip press
      // (`click`), not a change, so this is the only control shape left here.
      const slider = e.target.closest("[data-slider]");
      if (!slider) return;
      plannerSetField(slider.dataset.slider, slider.value);
    });
    // A drag must not rebuild the pane — that would drop the thumb out from under
    // the reader's finger — so the readouts are repainted and the plan is only
    // stored; the `change` above is what re-renders.
    charDetail.addEventListener("input", (e) => {
      const slider = e.target.closest("[data-slider]");
      if (!slider) return;
      plannerPreviewField(slider.dataset.slider, slider.value);
    });
    charDetail.addEventListener("click", (e) => {
      // Insight is four tier pips, one row per end: a press sets that end outright.
      const pick = e.target.closest("[data-set]");
      if (pick) {
        plannerSetField(pick.dataset.set, pick.dataset.value);
        return;
      }
      const pattern = e.target.closest("[data-pattern]");
      if (pattern) {
        plannerToggleList("frequency", Number(pattern.dataset.pattern));
        return;
      }
      const remove = e.target.closest("[data-remove]");
      if (remove) {
        plannerRemoveCharacter(remove.dataset.remove);
        return;
      }
      if (e.target.closest("#planner-quick-goal")) plannerQuickGoal();
    });
  }

  const addCharBtn = document.getElementById("planner-char-add");
  if (addCharBtn) addCharBtn.addEventListener("click", openPlannerPicker);
  const goalBtn = document.getElementById("planner-goal-btn");
  if (goalBtn) goalBtn.addEventListener("click", openPlannerGoal);
  const activityBtn = document.getElementById("planner-activity-btn");
  if (activityBtn) activityBtn.addEventListener("click", openPlannerActivity);

  /* ---- Lightboxes --------------------------------------------------------- */

  // Every sheet closes on its backdrop, so a press outside the card is always
  // the way out and the panels need no per-panel wiring.
  document.querySelectorAll("#planner-pane-character .planner-sheet").forEach((sheet) => {
    sheet.addEventListener("click", (e) => {
      if (e.target === sheet) plannerCloseSheets();
    });
  });
  document.querySelectorAll("#planner-pane-character [data-sheet]").forEach((btn) => {
    btn.addEventListener("click", () => plannerCloseSheets());
  });

  const picker = document.getElementById("planner-picker");
  if (picker) {
    picker.addEventListener("click", (e) => {
      const pick = e.target.closest("[data-pick]");
      if (pick) plannerAddCharacter(pick.dataset.pick);
    });
  }
  const pickerGrid = document.getElementById("planner-picker-grid");
  if (pickerGrid) {
    pickerGrid.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const pick = e.target.closest("[data-pick]");
      if (!pick) return;
      e.preventDefault();
      plannerAddCharacter(pick.dataset.pick);
    });
  }
  const pickerSearch = document.getElementById("planner-picker-search");
  if (pickerSearch) {
    pickerSearch.addEventListener("input", () => {
      plannerPickerQuery = pickerSearch.value;
      renderPlannerPicker();
    });
  }
  // Rarity chips are the Manage modal's: one or more rarities narrow the grid,
  // and pressing the same chip again widens it back.
  const pickerRarity = document.getElementById("planner-picker-rarity");
  if (pickerRarity) {
    pickerRarity.addEventListener("click", (e) => {
      const btn = e.target.closest(".filter-btn");
      if (!btn) return;
      const rarity = Number(btn.dataset.rarity);
      if (plannerPickerRarities.has(rarity)) plannerPickerRarities.delete(rarity);
      else plannerPickerRarities.add(rarity);
      renderPlannerPicker();
    });
  }

  /* ---- Activity settings -------------------------------------------------- */

  // Both settings are tick boxes, drawn with the Character Setting modal's own
  // checkbox, so the panel reads as one more setting of that modal.
  const roaring = document.getElementById("planner-set-roaring");
  if (roaring) {
    roaring.addEventListener("change", () => plannerSetActivity({ roaringMonth: roaring.checked }));
  }
  const weekly = document.getElementById("planner-set-weekly");
  if (weekly) {
    weekly.addEventListener("change", () => plannerSetActivity({ weeklyActivity: weekly.checked }));
  }

  /* ---- Wilderness --------------------------------------------------------- */

  // The route's tree button opens the board; the sheet owns everything else.
  const farmHost = document.getElementById("planner-farm");
  if (farmHost) {
    farmHost.addEventListener("click", (e) => {
      if (e.target.closest("#planner-farm-wilderness")) openPlannerWilderness();
    });
  }
  const wildToggle = document.getElementById("planner-wilderness-toggle");
  if (wildToggle) {
    wildToggle.addEventListener("click", (e) => {
      const btn = e.target.closest(".btn-toggle");
      if (btn) plannerSetWilderness({ enabled: btn.dataset.value === "1" });
    });
  }
  const wildSheet = document.getElementById("planner-wilderness-sheet");
  if (wildSheet) {
    wildSheet.addEventListener("change", (e) => {
      const select = e.target.closest("[data-wild]");
      if (select) {
        plannerSetWilderness({ [select.dataset.wild]: Number(select.value) });
        return;
      }
      const vigor = e.target.closest("#planner-wilderness-vigor");
      if (vigor) {
        plannerSetWilderness({ vigor: Number(vigor.value) });
        return;
      }
    });
    // Typing is a preview: the payout follows the box, and the solve waits for the
    // box to settle so one figure stays one solve.
    wildSheet.addEventListener("input", (e) => {
      const vigor = e.target.closest("#planner-wilderness-vigor");
      if (!vigor) return;
      plannerWilderness.vigor = Math.max(0, Math.round(Number(vigor.value) || 0));
      const output = document.getElementById("planner-wilderness-output");
      if (output) output.innerHTML = plannerWildernessOutputHtml(plannerWildernessOutput());
    });
  }

  // The header button and everything inside the body: remove lives in the header.
  const editorRemove = document.getElementById("planner-editor-remove");
  if (editorRemove) {
    editorRemove.addEventListener("click", () => {
      if (editorRemove.dataset.remove) plannerRemoveCharacter(editorRemove.dataset.remove);
    });
  }

  const charClear = document.getElementById("planner-char-clear");
  if (charClear) {
    charClear.addEventListener("click", () => {
      if (!plannerChars.length) return;
      showConfirmModal(t("planner.resetPlan"), t("planner.resetPlanMsg"), () => {
        plannerChars = [];
        plannerCharSelected = "";
        plannerSaveChars();
        plannerCloseSheets();
        renderPlannerCharacter();
      });
    });
  }
}

function setupGuideListeners() {
  const buildsBtn = document.getElementById("btn-builds");
  const buildsModal = document.getElementById("builds-modal");
  if (buildsBtn && buildsModal) {
    buildsBtn.addEventListener("click", openBuildsModal);
    document.getElementById("builds-btn-close").addEventListener("click", closeBuildsModal);
    buildsModal.addEventListener("click", (e) => {
      if (e.target === buildsModal) closeBuildsModal();
    });

    const back = document.getElementById("builds-back");
    if (back) back.addEventListener("click", () => setBuildsView("list"));

    const railToggle = document.getElementById("builds-rail-toggle");
    if (railToggle) {
      railToggle.addEventListener("click", () => setBuildsListVisible(!buildsListVisible));
    }

    const search = document.getElementById("builds-search");
    if (search) search.addEventListener("input", renderBuilds);

    setupGuideRailResizer({
      bodySelector: "#builds-modal .builds-body",
      handleId: "builds-rail-resizer",
      cssVar: "--builds-rail-h",
      storageKey: "r1999_builds_rail_height_v1",
    });

    // InfoBook mode switcher (Characters / Psychubes / Items / Glossary / Codes)
    const btnTabChars = document.getElementById("builds-tab-characters");
    const btnTabPsychubes = document.getElementById("builds-tab-psychubes");
    const btnTabItems = document.getElementById("builds-tab-items");
    const btnTabGlossary = document.getElementById("builds-tab-glossary");
    const btnTabCodes = document.getElementById("builds-tab-codes");
    const buildsSearchInput = document.getElementById("builds-search");

    const updateModeTabsUI = () => {
      [btnTabChars, btnTabPsychubes, btnTabItems, btnTabGlossary, btnTabCodes].forEach((b) => {
        if (b) b.classList.remove("is-active");
      });
      if (infoBookActiveTab === "characters" && btnTabChars) btnTabChars.classList.add("is-active");
      if (infoBookActiveTab === "psychubes" && btnTabPsychubes) btnTabPsychubes.classList.add("is-active");
      if (infoBookActiveTab === "items" && btnTabItems) btnTabItems.classList.add("is-active");
      if (infoBookActiveTab === "glossary" && btnTabGlossary) btnTabGlossary.classList.add("is-active");
      if (infoBookActiveTab === "codes" && btnTabCodes) btnTabCodes.classList.add("is-active");
    };

    const selectMode = (mode) => {
      // The Items tab is parked for now; its button carries `hidden` in index.html.
      // The renderer stays in place so removing that attribute brings it back.
      if (mode === "items" && btnTabItems && btnTabItems.hidden) return;
      infoBookActiveTab = mode;
      if (buildsSearchInput) buildsSearchInput.value = "";
      updateModeTabsUI();
      renderBuilds();
      setBuildsView("list");
    };

    if (btnTabChars) btnTabChars.addEventListener("click", () => selectMode("characters"));
    if (btnTabPsychubes) btnTabPsychubes.addEventListener("click", () => selectMode("psychubes"));
    if (btnTabItems) btnTabItems.addEventListener("click", () => selectMode("items"));
    if (btnTabGlossary) btnTabGlossary.addEventListener("click", () => selectMode("glossary"));
    if (btnTabCodes) btnTabCodes.addEventListener("click", () => selectMode("codes"));

    document.querySelectorAll("#builds-rarity-group .filter-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const rarity = Number(btn.dataset.rarity);
        if (buildsRarityFilter.has(rarity)) buildsRarityFilter.delete(rarity);
        else buildsRarityFilter.add(rarity);
        btn.classList.toggle("active", buildsRarityFilter.has(rarity));
        renderBuilds();
      });
    });

    document.querySelectorAll("#builds-afflatus-group .builds-afflatus-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const afflatus = btn.dataset.afflatus;
        if (buildsAfflatusFilter.has(afflatus)) buildsAfflatusFilter.delete(afflatus);
        else buildsAfflatusFilter.add(afflatus);
        btn.classList.toggle("is-active", buildsAfflatusFilter.has(afflatus));
        renderBuilds();
      });
    });
  }

  const rotationsBtn = document.getElementById("btn-rotations");
  const rotationsModal = document.getElementById("rotations-modal");
  if (rotationsBtn && rotationsModal) {
    rotationsBtn.addEventListener("click", openRotationsModal);
    document.getElementById("rotations-btn-close").addEventListener("click", closeRotationsModal);
    rotationsModal.addEventListener("click", (e) => {
      if (e.target === rotationsModal) closeRotationsModal();
    });

    const search = document.getElementById("rotations-search");
    if (search) search.addEventListener("input", renderRotations);

    setupGuideRailResizer({
      bodySelector: "#rotations-modal .rotations-body",
      handleId: "rotations-rail-resizer",
      cssVar: "--rotations-rail-h",
      storageKey: "r1999_rotations_rail_height_v1",
    });

    const back = document.getElementById("rotations-back");
    if (back) back.addEventListener("click", showRotationsList);

    const railToggle = document.getElementById("rotations-rail-toggle");
    if (railToggle) {
      railToggle.addEventListener("click", () => setRotationsListVisible(!rotationsListVisible));
    }

    const clear = document.getElementById("rotations-clear-filters");
    if (clear) {
      clear.addEventListener("click", () => {
        rotationArchetypeFilter.clear();
        renderRotations();
      });
    }

    const presetsBtn = document.getElementById("rotations-presets-btn");
    if (presetsBtn) presetsBtn.addEventListener("click", openRotationPresetsModal);

    const presetsClear = document.getElementById("rotation-presets-clear-filters");
    if (presetsClear) {
      presetsClear.addEventListener("click", () => {
        rotationPresetArchetypeFilter.clear();
        renderRotationPresetFilters();
        renderRotationPresets();
      });
    }

    const presetsModal = document.getElementById("rotation-presets-modal");
    const presetsClose = document.getElementById("rotation-presets-btn-close");
    if (presetsClose) presetsClose.addEventListener("click", closeRotationPresetsModal);
    if (presetsModal) {
      presetsModal.addEventListener("click", (e) => {
        if (e.target === presetsModal) closeRotationPresetsModal();
      });
    }

    const presetsSearch = document.getElementById("rotation-presets-search");
    if (presetsSearch) presetsSearch.addEventListener("input", renderRotationPresets);
  }

  // Crossing the phone breakpoint changes which pane is visible, so re-sync.
  if (typeof guideStackedMedia.addEventListener === "function") {
    guideStackedMedia.addEventListener("change", syncGuideResponsiveLayout);
  }
}

// Event Listeners
function setupEventListeners() {
  setupPatternTooltip();
  setupTierCountTooltip();
  setupGuideListeners();
  setupPlannerListeners();
  setupCreditsListeners();

  // Close term popover on document click
  document.addEventListener("click", (e) => {
    if (activeTermPopovers.length > 0 && !e.target.closest(".uttu-term-popover") && !e.target.closest(".skill-kw-bracket")) {
      closeAllTermPopovers();
    }
  });

  // Language switcher
  document.querySelectorAll(".lang-btn").forEach((btn) => {
    btn.addEventListener("click", () => setLanguage(btn.dataset.lang));
  });
  const confirmModal = document.getElementById("confirm-modal");
  const confirmBtnClose = document.getElementById("confirm-modal-btn-close");
  const confirmBtnCancel = document.getElementById("confirm-modal-btn-cancel");
  const confirmBtnYes = document.getElementById("confirm-modal-btn-yes");

  if (confirmBtnClose) confirmBtnClose.addEventListener("click", closeConfirmModal);
  if (confirmBtnCancel) confirmBtnCancel.addEventListener("click", closeConfirmModal);
  if (confirmModal) {
    confirmModal.addEventListener("click", (e) => {
      if (e.target === confirmModal) closeConfirmModal();
    });
  }
  if (confirmBtnYes) {
    confirmBtnYes.addEventListener("click", () => {
      if (onConfirmActionCallback) {
        const cb = onConfirmActionCallback;
        closeConfirmModal();
        cb();
      } else {
        closeConfirmModal();
      }
    });
  }

  // Statistics modal (opened from the roster stat badge)
  const statsModal = document.getElementById("stats-modal");
  if (statsModal && rosterStat) {
    rosterStat.addEventListener("click", openStatsModal);
    document.getElementById("stats-btn-close").addEventListener("click", closeStatsModal);
    statsModal.addEventListener("click", (e) => { if (e.target === statsModal) closeStatsModal(); });
    setupStatsChessTooltip();
  }

  setupTeamBuildingListeners();

  // Web Icon Lightbox Preview
  const btnWebIcon = document.getElementById("btn-web-icon");  const webIconModal = document.getElementById("web-icon-modal");

  if (btnWebIcon && webIconModal) {
    btnWebIcon.addEventListener("click", () => {
      webIconModal.style.display = "flex";
      // Trigger transition next frame
      requestAnimationFrame(() => {
        webIconModal.classList.add("active");
      });
    });

    webIconModal.addEventListener("click", () => {
      webIconModal.classList.remove("active");
      setTimeout(() => {
        webIconModal.style.display = "none";
      }, 300);
    });
  }

  filterSearch.addEventListener("input", renderShowcase);

  inputBoardTitle.addEventListener("input", (e) => {
    const val = e.target.value.trim();
    boardTitleLabel.textContent = val || "Suitcase";
    localStorage.setItem(TITLE_STORAGE_KEY, e.target.value);
  });

  // Ownership Filter Buttons
  filterOwnershipBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      filterOwnershipBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activeOwnershipFilter = btn.dataset.ownership;
      saveFilterState();
      renderShowcase();
    });
  });

  // Rarity Filter Buttons (multi-select toggle)
  filterRarityBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const selectedRarity = Number(btn.dataset.rarity);
      if (activeRarityFilters.has(selectedRarity)) {
        activeRarityFilters.delete(selectedRarity);
        btn.classList.remove("active");
      } else {
        activeRarityFilters.add(selectedRarity);
        btn.classList.add("active");
      }
      saveFilterState();
      renderShowcase();
    });
  });

  // Insight pills
  document.querySelectorAll(".btn-pill-i").forEach((btn) => {
    btn.addEventListener("click", () => {
      const newInsight = Number(btn.dataset.i);
      tempEditState.insight = newInsight;
      const maxLvl = getMaxLevelForInsight(newInsight);
      if (!tempEditState.level || tempEditState.level > maxLvl) {
        tempEditState.level = maxLvl;
      }
      const maxRes = getMaxResonanceForInsight(newInsight);
      if (!tempEditState.resonance || tempEditState.resonance > maxRes) {
        tempEditState.resonance = maxRes;
      }
      updateModalView();
    });
  });

  // Level slider
  inputLevel.addEventListener("input", (e) => {
    tempEditState.level = Number(e.target.value);
    displayLevel.textContent = fmtLevel(tempEditState.level);
    updateModalView();
  });

  // Status toggle
  btnStatusOwned.addEventListener("click", () => {
    tempEditState.owned = true;
    updateModalView();
  });
  btnStatusUnowned.addEventListener("click", () => {
    tempEditState.owned = false;
    updateModalView();
  });

  // Resonance slider & pills
  inputResonance.addEventListener("input", (e) => {
    tempEditState.resonance = Number(e.target.value);
    updateModalView();
  });
  document.querySelectorAll(".btn-pill").forEach((btn) => {
    btn.addEventListener("click", () => {
      tempEditState.resonance = Number(btn.dataset.r);
      updateModalView();
    });
  });

  // Pattern picker is rebuilt per character (see renderShapePatternGrid)

  // Portrait pills (character edit modal only — the Psychube modal has its own A picks)
  document.querySelectorAll("#edit-modal .btn-pill-p").forEach((btn) => {
    btn.addEventListener("click", () => {
      tempEditState.portrait = Number(btn.dataset.p);
      updateModalView();
    });
  });

  // Euphoria checkbox change handlers to persist selection in state
  checkE1.addEventListener("change", () => {
    tempEditState.e1 = checkE1.checked;
  });
  checkE2.addEventListener("change", () => {
    tempEditState.e2 = checkE2.checked;
  });

  // Favourite (pin) toggle — pinned characters lead their tier
  if (modalBtnFavourite) {
    modalBtnFavourite.addEventListener("click", () => {
      tempEditState.favourite = !tempEditState.favourite;
      syncFavouriteButton();
    });
  }

  modalBtnClose.addEventListener("click", closeEditModal);
  modalBtnSave.addEventListener("click", saveEditModal);
  editModal.addEventListener("click", (e) => {
    if (e.target === editModal) closeEditModal();
  });

  // Appearance Modal & Tabs (Options, Styling, Tiers)
  const appearanceModal = document.getElementById("appearance-modal");
  const appearanceBtnClose = document.getElementById("appearance-btn-close");
  const btnAppearance = document.getElementById("btn-appearance");
  const tabBtnOptions = document.getElementById("tab-btn-options");
  const tabBtnStyling = document.getElementById("tab-btn-styling");
  const tabBtnTiers = document.getElementById("tab-btn-tiers");
  const panelOptions = document.getElementById("appearance-panel-options");
  const panelStyling = document.getElementById("appearance-panel-styling");
  const panelTiers = document.getElementById("appearance-panel-tiers");

  /* The tab the modal reopens on: the one the reader left, or Options. It is a UI
     preference, not part of the display options blob, so Reset leaves it alone. */
  const APPEARANCE_TAB_KEY = "r1999_appearance_tab_v1";
  const APPEARANCE_TABS = ["options", "styling", "tiers"];

  function loadAppearanceTab() {
    try {
      const saved = localStorage.getItem(APPEARANCE_TAB_KEY);
      return APPEARANCE_TABS.includes(saved) ? saved : APPEARANCE_TABS[0];
    } catch (e) {
      return APPEARANCE_TABS[0];
    }
  }

  function saveAppearanceTab(tabName) {
    try {
      localStorage.setItem(APPEARANCE_TAB_KEY, tabName);
    } catch (e) {
      /* A blocked storage just means the modal opens on Options. */
    }
  }

  let currentAppearanceTab = loadAppearanceTab();

  function switchAppearanceTab(tabName) {
    currentAppearanceTab = tabName;
    saveAppearanceTab(tabName);
    if (tabBtnOptions) {
      tabBtnOptions.classList.toggle("active", tabName === "options");
      tabBtnOptions.setAttribute("aria-selected", tabName === "options" ? "true" : "false");
    }
    if (tabBtnStyling) {
      tabBtnStyling.classList.toggle("active", tabName === "styling");
      tabBtnStyling.setAttribute("aria-selected", tabName === "styling" ? "true" : "false");
    }
    if (tabBtnTiers) {
      tabBtnTiers.classList.toggle("active", tabName === "tiers");
      tabBtnTiers.setAttribute("aria-selected", tabName === "tiers" ? "true" : "false");
    }

    if (panelOptions) panelOptions.style.display = tabName === "options" ? "block" : "none";
    if (panelStyling) panelStyling.style.display = tabName === "styling" ? "block" : "none";
    if (panelTiers) panelTiers.style.display = tabName === "tiers" ? "block" : "none";

    // Options and Styling keep the old 440px modal width; Tiers stays the wide sheet.
    if (appearanceModal) appearanceModal.dataset.appearanceTab = tabName;

    if (tabName === "options") initOptionsState();
    else if (tabName === "styling") initCustomizeState();
    else if (tabName === "tiers") initListingState();
  }

  function openAppearanceModal(tabName = currentAppearanceTab) {
    if (!appearanceModal) return;
    switchAppearanceTab(tabName);
    appearanceModal.style.display = "flex";
  }

  function closeAppearanceModal() {
    if (appearanceModal) appearanceModal.style.display = "none";
  }

  if (appearanceBtnClose) appearanceBtnClose.addEventListener("click", closeAppearanceModal);
  if (appearanceModal) {
    appearanceModal.addEventListener("click", (e) => {
      if (e.target === appearanceModal) closeAppearanceModal();
    });
  }
  if (btnAppearance) {
    btnAppearance.addEventListener("click", () => openAppearanceModal());
  }
  if (tabBtnOptions) {
    tabBtnOptions.addEventListener("click", () => switchAppearanceTab("options"));
  }
  if (tabBtnStyling) {
    tabBtnStyling.addEventListener("click", () => switchAppearanceTab("styling"));
  }
  if (tabBtnTiers) {
    tabBtnTiers.addEventListener("click", () => switchAppearanceTab("tiers"));
  }

  // Options Modal
  const btnOptions = document.getElementById("btn-options");
  const optionsModal = document.getElementById("options-modal");
  const optionsBtnClose = document.getElementById("options-btn-close");
  const optionsBtnDone = document.getElementById("options-btn-done");
  const checkHideInsight = document.getElementById("check-hide-insight");
  const checkHideResonance = document.getElementById("check-hide-resonance");
  const checkHideEuphoria = document.getElementById("check-hide-euphoria");
  const checkHidePortrait = document.getElementById("check-hide-portrait");
  const checkHideNames = document.getElementById("check-hide-names");
  const checkHidePatterns = document.getElementById("check-hide-patterns");
  const checkHideOwnedNames = document.getElementById("check-hide-owned-names");
  const checkHideRarityLine = document.getElementById("check-hide-rarity-line");
  const checkHideSkin = document.getElementById("check-hide-skin");
  const checkFutureSight = document.getElementById("check-future-sight");
  const checkShowPatternBg = document.getElementById("check-show-pattern-bg");
  const checkShowPatternBorder = document.getElementById("check-show-pattern-border");
  const checkShowNonePatternBg = document.getElementById("check-show-none-pattern-bg");
  const colorNonePatternBg = document.getElementById("color-none-pattern-bg");
  const checkShowNonePatternBorder = document.getElementById("check-show-none-pattern-border");
  const colorNonePatternBorder = document.getElementById("color-none-pattern-border");
  const checkHideAfflatus = document.getElementById("check-hide-afflatus");
  const checkHideI3Lv60 = document.getElementById("check-hide-i3-lv60");
  const checkHideI3Lv30 = document.getElementById("check-hide-i3-lv30");
  const checkHideR15 = document.getElementById("check-hide-r15");
  const checkHideR10 = document.getElementById("check-hide-r10");

  const optionsCharPreviewCard = document.getElementById("options-char-preview-card");

  const customHideRulesList = document.getElementById("custom-hide-rules-list");
  const btnAddCustomHide = document.getElementById("btn-add-custom-hide");
  let tempCustomHideRules = [];

  const customResHideRulesList = document.getElementById("custom-res-hide-rules-list");
  const btnAddCustomResHide = document.getElementById("btn-add-custom-res-hide");
  let tempCustomResHideRules = [];

  const checkHideAmplification = document.getElementById("check-hide-amplification");
  const checkHideChubeLevel = document.getElementById("check-hide-chube-level");
  const checkHideGluttony = document.getElementById("check-hide-gluttony");
  const checkHideGreed = document.getElementById("check-hide-greed");
  const checkHideA1 = document.getElementById("check-hide-a1");
  const checkHideA5 = document.getElementById("check-hide-a5");
  const checkHideLv1 = document.getElementById("check-hide-lv1");
  const checkHideLv60 = document.getElementById("check-hide-lv60");

  const customAmpHideRulesList = document.getElementById("custom-amp-hide-rules-list");
  const btnAddCustomAmpHide = document.getElementById("btn-add-custom-amp-hide");
  let tempCustomAmpHideRules = [];

  const customLevelHideRulesList = document.getElementById("custom-level-hide-rules-list");
  const btnAddCustomLevelHide = document.getElementById("btn-add-custom-level-hide");
  let tempCustomLevelHideRules = [];

  function renderOptionsPreviewCard() {
    if (!optionsCharPreviewCard) return;

    const hideInsightLevel = checkHideInsight ? checkHideInsight.checked : false;
    const hideResonance = checkHideResonance ? checkHideResonance.checked : false;
    const hideEuphoria = checkHideEuphoria ? checkHideEuphoria.checked : false;
    const hidePortrait = checkHidePortrait ? checkHidePortrait.checked : false;
    const hideNames = checkHideNames ? checkHideNames.checked : false;
    const hidePatterns = checkHidePatterns ? checkHidePatterns.checked : false;
    const hideOwnedNames = checkHideOwnedNames ? checkHideOwnedNames.checked : false;
    const hideRarityLine = checkHideRarityLine ? checkHideRarityLine.checked : false;
    const hideSkin = checkHideSkin ? checkHideSkin.checked : false;
    const hideAfflatus = checkHideAfflatus ? checkHideAfflatus.checked : false;

    const charName = "Vertin";
    const rarityVal = 6;
    const insightVal = 3;
    const levelVal = 60;
    const resonanceVal = 10;
    const portraitVal = 5;
    // Mirror a real patterned character so the preview shows the correct colours.
    // "Z shape" is used because it contains Elucidation, Mercy and Equibalance.
    const previewShape = "Z shape";
    const boxKind = "Equibalance";
    const euphoriaText = "E1";
    const previewAfflatus = "Star";

    const resonanceColor = "#4F4F4F";
    const euphoriaColor = (displayOptions.appearance && displayOptions.appearance.euphoriaColor) || "#04FFEE";
    const patternColor = getResonanceTextColor(boxKind);

    let activeDashColor = "";
    if (displayOptions.appearance && displayOptions.appearance.customPortraitColorsEnabled) {
      activeDashColor = displayOptions.appearance.portraitColorR6 || "#DD9925";
    }
    const dashStyle = activeDashColor ? ` style="background-color: ${activeDashColor};"` : "";
    const dashesHtml = !hidePortrait
      ? Array.from({ length: 5 }, (_, i) => `<span class="portrait-dash ${i < portraitVal ? "active" : ""}"${i < portraitVal ? dashStyle : ""}></span>`).join("")
      : "";

    const showRes = !hideResonance;
    const showEupho = !hideEuphoria;

    // Preview main pattern (mirrors a real character's badge row)
    const previewMainPattern = "Elucidation";
    const previewMainPatternPath = getPatternIconPathForShape(previewShape, previewMainPattern);
    const showPreviewPattern = !hidePatterns;

    const topHeaderHtml = `
      <div class="char-top-info">
        ${showRes ? `<span class="badge-resonance ${boxKind}" style="color: ${resonanceColor};">${fmtResonance(resonanceVal)}</span>` : `<span></span>`}
        ${showPreviewPattern ? `<img src="${escapeHtml(previewMainPatternPath)}" alt="${escapeHtml(previewMainPattern)}" data-pattern-name="${escapeHtml(patternTooltipText(previewMainPattern, "main"))}" class="char-main-pattern-icon" />` : ""}
        ${showEupho ? `<span class="badge-euphoria" style="color: ${euphoriaColor};">${euphoriaText}</span>` : ""}
      </div>
    `;

    const portraitBarHtml = !hidePortrait ? `
      <div class="char-portrait-bar-below">
        ${dashesHtml}
      </div>
    ` : "";

    const showIn = !hideInsightLevel;
    const showLv = !hideInsightLevel;
    const showAff = !hideAfflatus && !!previewAfflatus;

    const afflatusIconHtml = showAff ? `
      <div class="char-afflatus-icon">
        <img src="images/afflatus_icon/${previewAfflatus}.png" alt="${previewAfflatus}" title="${escapeHtml(displayAfflatus(previewAfflatus))}" />
      </div>
    ` : "";
    const insightIconHtml = showIn ? `
      <span class="char-info-insight">
        <img src="images/insight_icon/I${insightVal}.png" alt="I${insightVal}" class="badge-insight-img" />
      </span>
    ` : "";
    const levelTextHtml = showLv ? `
      <span class="char-info-level">${levelVal}</span>
    ` : "";
    const insightLevelOverlay = (showIn || showLv) ? `
      <div class="char-info-overlay">
        ${insightIconHtml}
        ${levelTextHtml}
      </div>
    ` : "";

    // Preview rarity line (mirrors the card, controlled by Hide Rarity Line)
    const previewRarityLineHtml = !hideRarityLine
      ? `<img src="images/colour_references/${rarityVal}.png" alt="" class="char-rarity-line" />`
      : "";

    // 300101 default headicon vs 652902 garment
    const avatarImgSrc = hideSkin ? "images/headicon_small/300101.png" : "images/headicon_small/652902.png";

    const isPatternBgActive = checkShowPatternBg ? checkShowPatternBg.checked : !!displayOptions.showPatternBg;
    const isPatternBorderActive = checkShowPatternBorder ? checkShowPatternBorder.checked : !!displayOptions.showPatternBorder;

    const avatarImgStyles = [];
    if (isPatternBgActive) {
      avatarImgStyles.push(`background-color: ${patternColor}`);
    }
    if (isPatternBorderActive) {
      avatarImgStyles.push(`border: 1px solid ${patternColor}`);
    }
    const avatarImgStyle = avatarImgStyles.length > 0 ? ` style="${avatarImgStyles.join("; ")};"` : "";

    // Preview name row (the preview character is owned, so it follows "Hide Owned")
    const previewNameHtml = !hideOwnedNames
      ? `<div class="char-name-below${isItalicNameCharacter(charName) ? " is-italic-name" : ""}">${escapeHtml(charName)}</div>`
      : "";

    optionsCharPreviewCard.innerHTML = `
      ${topHeaderHtml}
      <div class="char-avatar-box">
        <img src="${avatarImgSrc}" alt="${charName}" class="char-avatar-img"${avatarImgStyle} />
        ${afflatusIconHtml}
        ${insightLevelOverlay}
      </div>
      ${previewRarityLineHtml}
      ${portraitBarHtml}
      ${previewNameHtml}
    `;
  }

  function initOptionsState() {
    if (checkFutureSight) checkFutureSight.checked = !!futureSightEnabled;
    if (checkShowPatternBg) checkShowPatternBg.checked = !!displayOptions.showPatternBg;
    if (checkShowPatternBorder) checkShowPatternBorder.checked = !!displayOptions.showPatternBorder;

    if (checkShowNonePatternBg) {
      checkShowNonePatternBg.checked = !!displayOptions.showNonePatternBg;
    }
    if (colorNonePatternBg) {
      colorNonePatternBg.value = displayOptions.colorNonePatternBg || "#4F4F4F";
      colorNonePatternBg.style.display = displayOptions.showNonePatternBg ? "inline-block" : "none";
    }
    if (checkShowNonePatternBorder) {
      checkShowNonePatternBorder.checked = !!displayOptions.showNonePatternBorder;
    }
    if (colorNonePatternBorder) {
      colorNonePatternBorder.value = displayOptions.colorNonePatternBorder || "#4F4F4F";
      colorNonePatternBorder.style.display = displayOptions.showNonePatternBorder ? "inline-block" : "none";
    }

    checkHideInsight.checked = !!displayOptions.hideInsight;
    checkHideResonance.checked = !!displayOptions.hideResonance;
    checkHideEuphoria.checked = !!displayOptions.hideEuphoria;
    checkHidePortrait.checked = !!displayOptions.hidePortrait;
    checkHideNames.checked = !!displayOptions.hideNames;
    if (checkHidePatterns) checkHidePatterns.checked = !!displayOptions.hidePatterns;
    if (checkHideOwnedNames) checkHideOwnedNames.checked = !!displayOptions.hideOwnedNames;
    if (checkHideRarityLine) checkHideRarityLine.checked = !!displayOptions.hideRarityLine;
    if (checkHideSkin) checkHideSkin.checked = !!displayOptions.hideSkin;
    if (checkHideAfflatus) checkHideAfflatus.checked = !!displayOptions.hideAfflatus;
    checkHideI3Lv60.checked = !!displayOptions.hideI3Lv60;
    checkHideI3Lv30.checked = !!displayOptions.hideI3Lv30;
    if (checkHideR15) checkHideR15.checked = !!displayOptions.hideR15;
    if (checkHideR10) checkHideR10.checked = !!displayOptions.hideR10;

    const checkHideChess = document.getElementById("check-hide-chess-pieces");
    if (checkHideChess) {
      const app = displayOptions.appearance || DEFAULT_THEME_APPEARANCE;
      checkHideChess.checked = app.chessPiecesEnabled === false;
    }
    const checkHideCharacterTier = document.getElementById("check-hide-character-tier");
    if (checkHideCharacterTier) checkHideCharacterTier.checked = !!displayOptions.hideCharacterTier;
    const checkHidePsychubeTier = document.getElementById("check-hide-psychube-tier");
    if (checkHidePsychubeTier) checkHidePsychubeTier.checked = !!displayOptions.hidePsychubeTier;

    renderOptionsPreviewCard();

    tempCustomHideRules = JSON.parse(JSON.stringify(displayOptions.customHideRules || []));
    renderCustomHideRulesUI();

    tempCustomResHideRules = JSON.parse(JSON.stringify(displayOptions.customResHideRules || []));
    renderCustomResHideRulesUI();

    if (checkHideAmplification) checkHideAmplification.checked = !!displayOptions.hideAmplification;
    if (checkHideChubeLevel) checkHideChubeLevel.checked = !!displayOptions.hidePsychubeLevel;
    if (checkHideGluttony) checkHideGluttony.checked = !!displayOptions.hideGluttony;
    if (checkHideGreed) checkHideGreed.checked = !!displayOptions.hideGreed;
    if (checkHideA1) checkHideA1.checked = !!displayOptions.hideA1;
    if (checkHideA5) checkHideA5.checked = !!displayOptions.hideA5;
    if (checkHideLv1) checkHideLv1.checked = !!displayOptions.hideLv1;
    if (checkHideLv60) checkHideLv60.checked = !!displayOptions.hideLv60;

    tempCustomAmpHideRules = JSON.parse(JSON.stringify(displayOptions.customAmpHideRules || []));
    renderCustomAmpHideRulesUI();

    tempCustomLevelHideRules = JSON.parse(JSON.stringify(displayOptions.customLevelHideRules || []));
    renderCustomLevelHideRulesUI();
  }

  function openOptionsModal() {
    openAppearanceModal("options");
  }

  function closeOptionsModal() {
    closeAppearanceModal();
  }

  function renderCustomHideRulesUI() {
    customHideRulesList.innerHTML = "";
    tempCustomHideRules.forEach((rule, idx) => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "8px";
      row.style.background = "rgba(0,0,0,0.03)";
      row.style.padding = "6px 8px";
      row.style.border = "1px solid var(--panel-border)";

      const checkWrap = document.createElement("label");
      checkWrap.className = "archetype-grid-item";
      checkWrap.style.padding = "4px 8px";
      const check = document.createElement("input");
      check.type = "checkbox";
      check.checked = !!rule.enabled;
      check.addEventListener("change", () => {
        rule.enabled = check.checked;
      });
      checkWrap.appendChild(check);
      const diamond = document.createElement("span");
      diamond.className = "archetype-diamond";
      checkWrap.appendChild(diamond);

      const labelInsight = document.createElement("span");
      labelInsight.style.fontSize = "0.7rem";
      labelInsight.style.fontFamily = "var(--mono-font)";
      labelInsight.textContent = `${t("setting.insight")}:`;

      const selInsight = document.createElement("select");
      selInsight.className = "listing-tier-select";
      selInsight.style.minWidth = "60px";
      selInsight.style.padding = "4px";
      [0, 1, 2, 3].forEach((i) => {
        const opt = document.createElement("option");
        opt.value = i;
        opt.textContent = fmtInsight(i);
        if (Number(rule.insight) === i) opt.selected = true;
        selInsight.appendChild(opt);
      });
      selInsight.addEventListener("change", () => {
        rule.insight = Number(selInsight.value);
        // adjust level max
        const maxLvl = getMaxLevelForInsight(rule.insight);
        if (rule.level > maxLvl) {
          rule.level = maxLvl;
          inputLvl.value = maxLvl;
        }
        inputLvl.max = maxLvl;
      });

      const labelLvl = document.createElement("span");
      labelLvl.style.fontSize = "0.7rem";
      labelLvl.style.fontFamily = "var(--mono-font)";
      labelLvl.textContent = "Lv:";

      const inputLvl = document.createElement("input");
      inputLvl.type = "number";
      inputLvl.className = "search-input";
      inputLvl.style.width = "50px";
      inputLvl.style.height = "26px";
      inputLvl.style.padding = "2px 4px";
      inputLvl.min = "1";
      inputLvl.max = String(getMaxLevelForInsight(rule.insight));
      inputLvl.value = rule.level;
      inputLvl.addEventListener("input", (e) => {
        rule.level = Number(e.target.value);
      });

      const btnDel = document.createElement("button");
      btnDel.type = "button";
      btnDel.className = "btn-tier-del";
      btnDel.innerHTML = "&times;";
      btnDel.title = "Delete Rule";
      btnDel.addEventListener("click", () => {
        tempCustomHideRules.splice(idx, 1);
        renderCustomHideRulesUI();
      });

      row.appendChild(checkWrap);
      row.appendChild(labelInsight);
      row.appendChild(selInsight);
      row.appendChild(labelLvl);
      row.appendChild(inputLvl);
      row.appendChild(btnDel);

      customHideRulesList.appendChild(row);
    });
  }

  btnAddCustomHide.addEventListener("click", () => {
    tempCustomHideRules.push({
      id: "hide_" + Date.now(),
      insight: 3,
      level: 59,
      enabled: true,
    });
    renderCustomHideRulesUI();
  });

  function renderCustomResHideRulesUI() {
    if (!customResHideRulesList) return;
    customResHideRulesList.innerHTML = "";
    tempCustomResHideRules.forEach((rule, idx) => {
      const row = document.createElement("div");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "8px";
      row.style.background = "rgba(0,0,0,0.03)";
      row.style.padding = "6px 8px";
      row.style.border = "1px solid var(--panel-border)";

      const checkWrap = document.createElement("label");
      checkWrap.className = "archetype-grid-item";
      checkWrap.style.padding = "4px 8px";
      const check = document.createElement("input");
      check.type = "checkbox";
      check.checked = !!rule.enabled;
      check.addEventListener("change", () => {
        rule.enabled = check.checked;
      });
      checkWrap.appendChild(check);
      const diamond = document.createElement("span");
      diamond.className = "archetype-diamond";
      checkWrap.appendChild(diamond);

      const labelRes = document.createElement("span");
      labelRes.style.fontSize = "0.7rem";
      labelRes.style.fontFamily = "var(--mono-font)";
      labelRes.textContent = `${t("setting.resonanceShort")}:`;

      const selRes = document.createElement("select");
      selRes.className = "listing-tier-select";
      selRes.style.minWidth = "70px";
      selRes.style.padding = "4px";
      for (let r = 15; r >= 1; r--) {
        const opt = document.createElement("option");
        opt.value = r;
        opt.textContent = fmtResonance(r);
        if (Number(rule.resonance) === r) opt.selected = true;
        selRes.appendChild(opt);
      }
      selRes.addEventListener("change", () => {
        rule.resonance = Number(selRes.value);
      });

      const btnDel = document.createElement("button");
      btnDel.type = "button";
      btnDel.className = "btn-tier-del";
      btnDel.innerHTML = "&times;";
      btnDel.title = "Delete Rule";
      btnDel.addEventListener("click", () => {
        tempCustomResHideRules.splice(idx, 1);
        renderCustomResHideRulesUI();
      });

      row.appendChild(checkWrap);
      row.appendChild(labelRes);
      row.appendChild(selRes);
      row.appendChild(btnDel);

      customResHideRulesList.appendChild(row);
    });
  }

  if (btnAddCustomResHide) {
    btnAddCustomResHide.addEventListener("click", () => {
      tempCustomResHideRules.push({
        id: "res_hide_" + Date.now(),
        resonance: 10,
        enabled: true,
      });
      renderCustomResHideRulesUI();
    });
  }

  /**
   * Shared builder for the Psychube detail hide-rule rows (Amplification and
   * Level), which mirror the Resonance rule rows exactly.
   */
  function buildCustomRuleRow(rule, idx, opts) {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "8px";
    row.style.background = "rgba(0,0,0,0.03)";
    row.style.padding = "6px 8px";
    row.style.border = "1px solid var(--panel-border)";

    const checkWrap = document.createElement("label");
    checkWrap.className = "archetype-grid-item";
    checkWrap.style.padding = "4px 8px";
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = !!rule.enabled;
    check.addEventListener("change", () => { rule.enabled = check.checked; });
    checkWrap.appendChild(check);
    const diamond = document.createElement("span");
    diamond.className = "archetype-diamond";
    checkWrap.appendChild(diamond);

    const labelEl = document.createElement("span");
    labelEl.style.fontSize = "0.7rem";
    labelEl.style.fontFamily = "var(--mono-font)";
    labelEl.textContent = `${opts.labelKey ? t(opts.labelKey) : opts.label}:`;

    const sel = document.createElement("select");
    sel.className = "listing-tier-select";
    sel.style.minWidth = "70px";
    sel.style.padding = "4px";
    opts.values.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = opts.format(v);
      if (Number(rule[opts.field]) === v) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.addEventListener("change", () => { rule[opts.field] = Number(sel.value); });

    const btnDel = document.createElement("button");
    btnDel.type = "button";
    btnDel.className = "btn-tier-del";
    btnDel.innerHTML = "&times;";
    btnDel.title = "Delete Rule";
    btnDel.addEventListener("click", () => {
      opts.list.splice(idx, 1);
      opts.rerender();
    });

    row.appendChild(checkWrap);
    row.appendChild(labelEl);
    row.appendChild(sel);
    row.appendChild(btnDel);
    return row;
  }

  function renderCustomAmpHideRulesUI() {
    if (!customAmpHideRulesList) return;
    customAmpHideRulesList.innerHTML = "";
    const values = [];
    for (let a = PSYCHUBE_MAX_AMP; a >= PSYCHUBE_MIN_AMP; a--) values.push(a);
    tempCustomAmpHideRules.forEach((rule, idx) => {
      customAmpHideRulesList.appendChild(buildCustomRuleRow(rule, idx, {
        field: "amplification",
        labelKey: "chube.amplification",
        values,
        format: fmtAmp,
        list: tempCustomAmpHideRules,
        rerender: renderCustomAmpHideRulesUI,
      }));
    });
  }

  function renderCustomLevelHideRulesUI() {
    if (!customLevelHideRulesList) return;
    customLevelHideRulesList.innerHTML = "";
    const values = [];
    for (let l = PSYCHUBE_MAX_LEVEL; l >= 1; l--) values.push(l);
    tempCustomLevelHideRules.forEach((rule, idx) => {
      customLevelHideRulesList.appendChild(buildCustomRuleRow(rule, idx, {
        field: "level",
        labelKey: "chube.level",
        values,
        format: (v) => String(v),
        list: tempCustomLevelHideRules,
        rerender: renderCustomLevelHideRulesUI,
      }));
    });
  }

  if (btnAddCustomAmpHide) {
    btnAddCustomAmpHide.addEventListener("click", () => {
      tempCustomAmpHideRules.push({
        id: "amp_hide_" + Date.now(),
        amplification: PSYCHUBE_MAX_AMP,
        enabled: true,
      });
      renderCustomAmpHideRulesUI();
    });
  }

  if (btnAddCustomLevelHide) {
    btnAddCustomLevelHide.addEventListener("click", () => {
      tempCustomLevelHideRules.push({
        id: "level_hide_" + Date.now(),
        level: PSYCHUBE_MAX_LEVEL,
        enabled: true,
      });
      renderCustomLevelHideRulesUI();
    });
  }

  if (checkShowNonePatternBg) {
    checkShowNonePatternBg.addEventListener("change", (e) => {
      if (colorNonePatternBg) {
        colorNonePatternBg.style.display = e.target.checked ? "inline-block" : "none";
      }
    });
  }

  if (checkShowNonePatternBorder) {
    checkShowNonePatternBorder.addEventListener("change", (e) => {
      if (colorNonePatternBorder) {
        colorNonePatternBorder.style.display = e.target.checked ? "inline-block" : "none";
      }
    });
  }

  // Flattened option sections: no collapse toggle, content always visible.
  ["char-decor-collapse-content", "insight-hide-collapse-content", "res-hide-collapse-content"].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = "flex";
  });

  // Character Info Box Checkbox Live Preview events
  [
    checkHideAfflatus,
    checkHideInsight,
    checkHideResonance,
    checkHideEuphoria,
    checkHidePortrait,
    checkHideNames,
    checkHidePatterns,
    checkHideOwnedNames,
    checkHideRarityLine,
    checkHideSkin,
    checkShowPatternBg,
    checkShowPatternBorder,
  ].forEach((chk) => {
    if (chk) {
      chk.addEventListener("change", () => {
        renderOptionsPreviewCard();
      });
    }
  });

  if (btnOptions) btnOptions.addEventListener("click", openOptionsModal);
  if (optionsBtnClose) optionsBtnClose.addEventListener("click", closeOptionsModal);
  if (optionsBtnDone) {
    optionsBtnDone.addEventListener("click", () => {
    if (checkFutureSight) {
      futureSightEnabled = checkFutureSight.checked;
      saveFutureSightState();
    }
    if (checkShowPatternBg) displayOptions.showPatternBg = checkShowPatternBg.checked;
    if (checkShowPatternBorder) displayOptions.showPatternBorder = checkShowPatternBorder.checked;

    if (checkShowNonePatternBg) displayOptions.showNonePatternBg = checkShowNonePatternBg.checked;
    if (colorNonePatternBg) displayOptions.colorNonePatternBg = colorNonePatternBg.value;
    if (checkShowNonePatternBorder) displayOptions.showNonePatternBorder = checkShowNonePatternBorder.checked;
    if (colorNonePatternBorder) displayOptions.colorNonePatternBorder = colorNonePatternBorder.value;

    displayOptions.hideInsight = checkHideInsight.checked;
    displayOptions.hideResonance = checkHideResonance.checked;
    displayOptions.hideEuphoria = checkHideEuphoria.checked;
    displayOptions.hidePortrait = checkHidePortrait.checked;
    displayOptions.hideNames = checkHideNames.checked;
    if (checkHidePatterns) displayOptions.hidePatterns = checkHidePatterns.checked;
    if (checkHideOwnedNames) displayOptions.hideOwnedNames = checkHideOwnedNames.checked;
    if (checkHideRarityLine) displayOptions.hideRarityLine = checkHideRarityLine.checked;
    if (checkHideSkin) displayOptions.hideSkin = checkHideSkin.checked;
    if (checkHideAfflatus) displayOptions.hideAfflatus = checkHideAfflatus.checked;
    displayOptions.hideI3Lv60 = checkHideI3Lv60.checked;
    displayOptions.hideI3Lv30 = checkHideI3Lv30.checked;
    displayOptions.customHideRules = tempCustomHideRules;
    if (checkHideR15) displayOptions.hideR15 = checkHideR15.checked;
    if (checkHideR10) displayOptions.hideR10 = checkHideR10.checked;
    displayOptions.customResHideRules = tempCustomResHideRules;
    if (checkHideAmplification) displayOptions.hideAmplification = checkHideAmplification.checked;
    if (checkHideChubeLevel) displayOptions.hidePsychubeLevel = checkHideChubeLevel.checked;
    if (checkHideGluttony) displayOptions.hideGluttony = checkHideGluttony.checked;
    if (checkHideGreed) displayOptions.hideGreed = checkHideGreed.checked;
    if (checkHideA1) displayOptions.hideA1 = checkHideA1.checked;
    if (checkHideA5) displayOptions.hideA5 = checkHideA5.checked;
    if (checkHideLv1) displayOptions.hideLv1 = checkHideLv1.checked;
    if (checkHideLv60) displayOptions.hideLv60 = checkHideLv60.checked;
    displayOptions.customAmpHideRules = tempCustomAmpHideRules;
    displayOptions.customLevelHideRules = tempCustomLevelHideRules;

    const checkHideChess = document.getElementById("check-hide-chess-pieces");
    if (checkHideChess) {
      if (!displayOptions.appearance) {
        displayOptions.appearance = { ...DEFAULT_THEME_APPEARANCE };
      }
      displayOptions.appearance.chessPiecesEnabled = !checkHideChess.checked;
    }
    const checkHideCharacterTier = document.getElementById("check-hide-character-tier");
    if (checkHideCharacterTier) displayOptions.hideCharacterTier = checkHideCharacterTier.checked;
    const checkHidePsychubeTier = document.getElementById("check-hide-psychube-tier");
    if (checkHidePsychubeTier) displayOptions.hidePsychubeTier = checkHidePsychubeTier.checked;

    saveDisplayOptions();
    renderShowcase();
    refreshOpenTeamModals();
    closeOptionsModal();
    });
  }

  optionsModal.addEventListener("click", (e) => {
    if (e.target === optionsModal) closeOptionsModal();
  });

  // Customize Modal
  const btnCustomize = document.getElementById("btn-customize");
  const customizeModal = document.getElementById("customize-modal");
  const customizeBtnClose = document.getElementById("customize-btn-close");
  const customizeBtnDone = document.getElementById("customize-btn-done");
  const selectBoardFont = document.getElementById("select-board-font");
  const checkBoardUppercase = document.getElementById("check-board-uppercase");
  const inputBoardTitleSize = document.getElementById("input-board-title-size");
  const displayBoardTitleSize = document.getElementById("display-board-title-size");
  const inputTierLabelSize = document.getElementById("input-tier-label-size");
  const displayTierLabelSize = document.getElementById("display-tier-label-size");
  const inputTierLabelWidth = document.getElementById("input-tier-label-width");
  const displayTierLabelWidth = document.getElementById("display-tier-label-width");
  const colorBoardBg = document.getElementById("color-board-bg");
  const colorBoardTitle = document.getElementById("color-board-title");

  // Custom Board Background Image Upload Elements
  const inputBoardBgImage = document.getElementById("input-board-bg-image");
  const btnClearBoardBgImage = document.getElementById("btn-clear-board-bg-image");
  const boardBgImageStatus = document.getElementById("board-bg-image-status");

  // Board Header Box Elements
  const colorBoardHeaderBg = document.getElementById("color-board-header-bg");
  const btnClearBoardHeaderBg = document.getElementById("btn-clear-board-header-bg");
  const inputBoardHeaderBgOpacity = document.getElementById("input-board-header-bg-opacity");
  const displayBoardHeaderBgOpacity = document.getElementById("display-board-header-bg-opacity");
  const colorBoardHeaderBorder = document.getElementById("color-board-header-border");
  const btnClearBoardHeaderBorder = document.getElementById("btn-clear-board-header-border");
  const inputBoardHeaderBorderWidth = document.getElementById("input-board-header-border-width");
  const displayBoardHeaderBorderWidth = document.getElementById("display-board-header-border-width");

  // Tier Box Elements (Opacity replaces color & border color)
  const inputTierBoxOpacity = document.getElementById("input-tier-box-opacity");
  const displayTierBoxOpacity = document.getElementById("display-tier-box-opacity");
  const inputTierBoxBorderWidth = document.getElementById("input-tier-box-border-width");
  const displayTierBoxBorderWidth = document.getElementById("display-tier-box-border-width");
  const inputTierBoxRadius = document.getElementById("input-tier-box-radius");
  const displayTierBoxRadius = document.getElementById("display-tier-box-radius");

  // Spacing Elements
  const inputSpacingHeaderTier = document.getElementById("input-spacing-header-tier");
  const displaySpacingHeaderTier = document.getElementById("display-spacing-header-tier");
  const inputSpacingTierGap = document.getElementById("input-spacing-tier-gap");
  const displaySpacingTierGap = document.getElementById("display-spacing-tier-gap");

  // Character Card Scale Elements
  const inputCharCardSize = document.getElementById("input-char-card-size");
  const displayCharCardSize = document.getElementById("display-char-card-size");

  // Character Info Badge Elements
  const checkCharInfoBgEnabled = document.getElementById("check-char-info-bg-enabled");
  const colorCharInfoBg = document.getElementById("color-char-info-bg");
  const colorCharInfoBorder = document.getElementById("color-char-info-border");
  const btnClearCharInfoBorder = document.getElementById("btn-clear-char-info-border");
  const inputCharInfoBorderWidth = document.getElementById("input-char-info-border-width");
  const displayCharInfoBorderWidth = document.getElementById("display-char-info-border-width");
  const inputCharInfoRadius = document.getElementById("input-char-info-radius");
  const displayCharInfoRadius = document.getElementById("display-char-info-radius");
  const inputCharInfoBgOpacity = document.getElementById("input-char-info-bg-opacity");
  const displayCharInfoBgOpacity = document.getElementById("display-char-info-bg-opacity");

  const colorEuphoriaLabel = document.getElementById("color-euphoria-label");
  const colorChubeLevel = document.getElementById("color-chube-level");
  const colorChubeAmp = document.getElementById("color-chube-amp");
  const colorChubeAmpMax = document.getElementById("color-chube-amp-max");
  const colorChubeCount = document.getElementById("color-chube-count");
  const checkCustomPortraitColors = document.getElementById("check-custom-portrait-colors");
  const portraitRarityColorsGrid = document.getElementById("portrait-rarity-colors-grid");
  const colorPortraitR6 = document.getElementById("color-portrait-r6");
  const colorPortraitR5 = document.getElementById("color-portrait-r5");
  const colorPortraitR4 = document.getElementById("color-portrait-r4");
  const colorPortraitR3 = document.getElementById("color-portrait-r3");
  const colorPortraitR2 = document.getElementById("color-portrait-r2");

  const colorPatternNone = document.getElementById("color-pattern-none");
  const colorPatternOffensive = document.getElementById("color-pattern-offensive");
  const colorPatternDefensive = document.getElementById("color-pattern-defensive");
  const colorPatternHp = document.getElementById("color-pattern-hp");
  const colorPatternEquibalance = document.getElementById("color-pattern-equibalance");

  // Custom Resonance Label Color Elements
  const checkCustomResColor = document.getElementById("check-custom-res-color");
  const customResColorRow = document.getElementById("custom-res-color-row");
  const colorCustomResLabel = document.getElementById("color-custom-res-label");

  // Unowned Characters Dimming Elements
  const inputUnownedOpacity = document.getElementById("input-unowned-opacity");
  const displayUnownedOpacity = document.getElementById("display-unowned-opacity");

  // Chess Pieces Elements
  const checkChessPiecesEnabled = document.getElementById("check-chess-pieces-enabled");
  const selectChessPiecesPosition = document.getElementById("select-chess-pieces-position");
  const inputChessPieceSize = document.getElementById("input-chess-piece-size");
  const displayChessPieceSize = document.getElementById("display-chess-piece-size");
  const inputChessContainerOpacity = document.getElementById("input-chess-container-opacity");
  const displayChessContainerOpacity = document.getElementById("display-chess-container-opacity");

  const btnResetCustomAppearance = document.getElementById("btn-reset-custom-appearance");

  const previewBoardHeaderBox = document.getElementById("preview-board-header-box");
  const previewBoardHeaderTitle = document.getElementById("preview-board-header-title");
  const previewTierRowBox = document.getElementById("preview-tier-row-box");
  const previewTierLabelText = document.getElementById("preview-tier-label-text");
  const previewTierSeparatorBar = document.getElementById("preview-tier-separator-bar");
  const previewSpacingHeaderGap = document.getElementById("preview-spacing-header-gap");
  const previewSpacingTierGap = document.getElementById("preview-spacing-tier-gap");
  const previewCharCardBox = document.getElementById("preview-char-card-box");
  const previewCharInfoOverlay = document.getElementById("preview-char-info-overlay");
  const previewUnownedCharImg = document.getElementById("preview-unowned-char-img");

  const previewChessPiecesRow = document.getElementById("preview-chess-pieces-row");

  function updateCustomizePreviews() {
    const fontValue = getBoardFontFamily(selectBoardFont.value);
    const uppercaseValue = checkBoardUppercase && checkBoardUppercase.checked ? "uppercase" : "none";

    // 1. Board Header Box Preview
    if (previewBoardHeaderBox) {
      const bhOpacity = inputBoardHeaderBgOpacity ? Number(inputBoardHeaderBgOpacity.value) : 1;
      const rawBhBg = currentBoardHeaderBg || "transparent";
      previewBoardHeaderBox.style.background = (rawBhBg === "transparent") ? "transparent" : hexToRgba(rawBhBg, bhOpacity);
      previewBoardHeaderBox.style.borderBottomColor = currentBoardHeaderBorder || "rgba(255, 255, 255, 0.1)";
      previewBoardHeaderBox.style.borderBottomWidth = `${inputBoardHeaderBorderWidth ? inputBoardHeaderBorderWidth.value : 1}px`;
    }
    if (previewBoardHeaderTitle) {
      previewBoardHeaderTitle.textContent = (inputBoardTitle && inputBoardTitle.value.trim()) || "SUITCASE";
      previewBoardHeaderTitle.style.color = colorBoardTitle ? colorBoardTitle.value : "#f4efe9";
      previewBoardHeaderTitle.style.fontFamily = fontValue;
      previewBoardHeaderTitle.style.textTransform = uppercaseValue;
      const tSize = inputBoardTitleSize ? Number(inputBoardTitleSize.value) : 0.74;
      previewBoardHeaderTitle.style.fontSize = `${tSize}rem`;
    }

    // 2. Tier Row Box Preview
    if (previewTierRowBox) {
      const tbOpacity = inputTierBoxOpacity ? Number(inputTierBoxOpacity.value) : 0.1;
      previewTierRowBox.style.background = hexToRgba("#000000", tbOpacity);
      previewTierRowBox.style.borderWidth = `${inputTierBoxBorderWidth ? inputTierBoxBorderWidth.value : 1}px`;
      previewTierRowBox.style.borderRadius = `${inputTierBoxRadius ? inputTierBoxRadius.value : 0}px`;
    }
    if (previewTierLabelText) {
      previewTierLabelText.style.fontFamily = fontValue;
      previewTierLabelText.style.textTransform = uppercaseValue;
      const tierSize = inputTierLabelSize ? Number(inputTierLabelSize.value) : 0.70;
      previewTierLabelText.style.fontSize = `${tierSize}rem`;
    }

    // 3. Tier Separator Preview
    if (previewTierSeparatorBar) {
      const sepWidth = inputTierLabelWidth ? Number(inputTierLabelWidth.value) : 110;
      // Scale proportionally for mini preview (max ~130px)
      const miniWidth = Math.round(35 + (sepWidth - 40) * (95 / 200));
      previewTierSeparatorBar.style.width = `${miniWidth}px`;
    }

    // 4. Spacing Preview
    if (previewSpacingHeaderGap) {
      const hGap = inputSpacingHeaderTier ? Number(inputSpacingHeaderTier.value) : 20;
      previewSpacingHeaderGap.style.height = `${Math.max(4, Math.round(hGap * 0.5))}px`;
    }
    if (previewSpacingTierGap) {
      const tGap = inputSpacingTierGap ? Number(inputSpacingTierGap.value) : 14;
      previewSpacingTierGap.style.height = `${Math.max(4, Math.round(tGap * 0.5))}px`;
    }

    // 5. Chess Pieces Preview
    if (previewChessPiecesRow) {
      const pSize = inputChessPieceSize ? Number(inputChessPieceSize.value) : 20;
      const pOpacity = inputChessContainerOpacity ? Number(inputChessContainerOpacity.value) : 1;
      previewChessPiecesRow.style.opacity = pOpacity;

      const piecesData = [
        { w: 41, h: 92 },
        { w: 48, h: 95 },
        { w: 41, h: 99 },
        { w: 42, h: 109 },
        { w: 43, h: 105 },
      ];
      const pieceEls = previewChessPiecesRow.querySelectorAll(".preview-chess-piece");
      pieceEls.forEach((el, i) => {
        if (piecesData[i]) {
          el.style.width = `${Math.round(pSize * piecesData[i].w / 41)}px`;
          el.style.height = `${Math.round(pSize * piecesData[i].h / 41)}px`;
        }
      });
    }

    // 6. Character Card Size Preview
    if (previewCharCardBox) {
      const cardScale = inputCharCardSize ? Number(inputCharCardSize.value) : 1.0;
      const cardPx = Math.round(54 * cardScale);
      previewCharCardBox.style.width = `${cardPx}px`;
      previewCharCardBox.style.height = `${cardPx}px`;
    }

    // 7. Insight / Level Badge Preview
    if (previewCharInfoOverlay) {
      const isEnabled = checkCharInfoBgEnabled && checkCharInfoBgEnabled.checked;
      const rawBg = colorCharInfoBg ? colorCharInfoBg.value : "#121212";
      const bgOpacity = inputCharInfoBgOpacity ? Number(inputCharInfoBgOpacity.value) : 0.22;
      previewCharInfoOverlay.style.background = isEnabled ? hexToRgba(rawBg, bgOpacity) : "transparent";
      previewCharInfoOverlay.style.borderColor = currentCharInfoBorder || "transparent";
      previewCharInfoOverlay.style.borderWidth = `${inputCharInfoBorderWidth ? inputCharInfoBorderWidth.value : 0}px`;
      previewCharInfoOverlay.style.borderRadius = `${inputCharInfoRadius ? inputCharInfoRadius.value : 0}px`;
    }

    // 8. Unowned Dimming Preview
    if (previewUnownedCharImg) {
      const unOp = inputUnownedOpacity ? Number(inputUnownedOpacity.value) : 0.35;
      previewUnownedCharImg.style.opacity = unOp;
    }
  }

  function parseHexOrDefault(val, fallbackHex) {
    if (!val || val === "transparent") return fallbackHex;
    if (val.startsWith("#") && (val.length === 7 || val.length === 4)) return val;
    return fallbackHex;
  }

  function syncAppearanceFormWithState(app) {
    if (inputBoardTitle) {
      inputBoardTitle.value = localStorage.getItem(TITLE_STORAGE_KEY) || "";
    }
    selectBoardFont.value = app.boardFont || "default";
    if (checkBoardUppercase) {
      checkBoardUppercase.checked = app.boardUppercase !== false;
    }
    const titleSize = app.boardTitleSize !== undefined ? app.boardTitleSize : 0.74;
    inputBoardTitleSize.value = titleSize;
    displayBoardTitleSize.textContent = `${titleSize}rem`;

    const tierSize = app.tierLabelSize !== undefined ? app.tierLabelSize : 0.70;
    inputTierLabelSize.value = tierSize;
    displayTierLabelSize.textContent = `${tierSize}rem`;

    const tierWidth = app.tierLabelWidth !== undefined ? app.tierLabelWidth : 110;
    if (inputTierLabelWidth) inputTierLabelWidth.value = tierWidth;
    if (displayTierLabelWidth) displayTierLabelWidth.textContent = `${tierWidth}px`;

    colorBoardBg.value = app.boardBg || "#111111";
    colorBoardTitle.value = app.boardTitleColor || "#f4efe9";

    if (boardBgImageStatus) {
      boardBgImageStatus.textContent = customBoardBgImageUrl ? t("styling.bgActive") : t("styling.noImage");
    }

    // Board Header Box
    currentBoardHeaderBg = app.boardHeaderBg || "transparent";
    colorBoardHeaderBg.value = parseHexOrDefault(currentBoardHeaderBg, "#000000");
    const bhOp = app.boardHeaderBgOpacity !== undefined ? app.boardHeaderBgOpacity : 1;
    if (inputBoardHeaderBgOpacity) inputBoardHeaderBgOpacity.value = bhOp;
    if (displayBoardHeaderBgOpacity) displayBoardHeaderBgOpacity.textContent = `${Math.round(bhOp * 100)}%`;
    currentBoardHeaderBorder = app.boardHeaderBorderColor || "rgba(255, 255, 255, 0.1)";
    colorBoardHeaderBorder.value = parseHexOrDefault(currentBoardHeaderBorder, "#333333");
    const bhBw = app.boardHeaderBorderWidth !== undefined ? app.boardHeaderBorderWidth : 1;
    inputBoardHeaderBorderWidth.value = bhBw;
    displayBoardHeaderBorderWidth.textContent = `${bhBw}px`;

    // Tier Box
    const tbOp = app.tierBoxOpacity !== undefined ? app.tierBoxOpacity : 0.1;
    if (inputTierBoxOpacity) inputTierBoxOpacity.value = tbOp;
    if (displayTierBoxOpacity) displayTierBoxOpacity.textContent = `${Math.round(tbOp * 100)}%`;
    const tbBw = app.tierBoxBorderWidth !== undefined ? app.tierBoxBorderWidth : 1;
    inputTierBoxBorderWidth.value = tbBw;
    displayTierBoxBorderWidth.textContent = `${tbBw}px`;
    const tbRad = app.tierBoxRadius !== undefined ? app.tierBoxRadius : 0;
    inputTierBoxRadius.value = tbRad;
    displayTierBoxRadius.textContent = `${tbRad}px`;

    // Spacing
    const spHeader = app.spacingHeaderToTiers !== undefined ? app.spacingHeaderToTiers : 20;
    if (inputSpacingHeaderTier) inputSpacingHeaderTier.value = spHeader;
    if (displaySpacingHeaderTier) displaySpacingHeaderTier.textContent = `${spHeader}px`;

    const spTier = app.spacingBetweenTierRows !== undefined ? app.spacingBetweenTierRows : 14;
    if (inputSpacingTierGap) inputSpacingTierGap.value = spTier;
    if (displaySpacingTierGap) displaySpacingTierGap.textContent = `${spTier}px`;

    // Character Card Scale
    const ccScale = app.charCardScale !== undefined ? app.charCardScale : 1.0;
    if (inputCharCardSize) inputCharCardSize.value = ccScale;
    if (displayCharCardSize) displayCharCardSize.textContent = `${Number(ccScale).toFixed(2)}x`;

    // Character Info Badge
    checkCharInfoBgEnabled.checked = app.charInfoBgEnabled !== false;
    const bgControls = document.getElementById("char-info-bg-controls");
    if (bgControls) bgControls.style.opacity = checkCharInfoBgEnabled.checked ? "1" : "0.5";
    const bgOpacityRow = document.getElementById("char-info-bg-opacity-row");
    if (bgOpacityRow) bgOpacityRow.style.opacity = checkCharInfoBgEnabled.checked ? "1" : "0.5";

    colorCharInfoBg.value = parseHexOrDefault(app.charInfoBg, "#121212");
    currentCharInfoBorder = app.charInfoBorderColor || "transparent";
    colorCharInfoBorder.value = parseHexOrDefault(currentCharInfoBorder, "#ffffff");
    const ciBw = app.charInfoBorderWidth !== undefined ? app.charInfoBorderWidth : 0;
    inputCharInfoBorderWidth.value = ciBw;
    displayCharInfoBorderWidth.textContent = `${ciBw}px`;
    const ciRad = app.charInfoRadius !== undefined ? app.charInfoRadius : 0;
    inputCharInfoRadius.value = ciRad;
    displayCharInfoRadius.textContent = `${ciRad}px`;

    let ciBgOpacity = app.charInfoBgOpacity;
    if (ciBgOpacity === undefined) {
      if (typeof app.charInfoBg === "string" && app.charInfoBg.startsWith("rgba")) {
        const m = app.charInfoBg.match(/rgba\s*\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)/i);
        ciBgOpacity = m ? parseFloat(m[1]) : 0.22;
      } else {
        ciBgOpacity = 0.22;
      }
    }
    if (inputCharInfoBgOpacity) inputCharInfoBgOpacity.value = ciBgOpacity;
    if (displayCharInfoBgOpacity) displayCharInfoBgOpacity.textContent = `${Math.round(ciBgOpacity * 100)}%`;

    colorEuphoriaLabel.value = app.euphoriaColor || "#04FFEE";
    if (colorChubeLevel) colorChubeLevel.value = app.chubeLevelColor || "#ffffff";
    if (colorChubeAmp) colorChubeAmp.value = app.chubeAmpColor || "#ffffff";
    if (colorChubeAmpMax) colorChubeAmpMax.value = app.chubeAmpMaxColor || "#DF7526";
    if (colorChubeCount) colorChubeCount.value = app.chubeCountColor || "#04FFEE";

    if (checkCustomPortraitColors) {
      checkCustomPortraitColors.checked = !!app.customPortraitColorsEnabled;
    }
    if (portraitRarityColorsGrid) {
      portraitRarityColorsGrid.style.display = app.customPortraitColorsEnabled ? "grid" : "none";
    }
    if (colorPortraitR6) colorPortraitR6.value = app.portraitColorR6 || "#DD9925";
    if (colorPortraitR5) colorPortraitR5.value = app.portraitColorR5 || "#C7AF6C";
    if (colorPortraitR4) colorPortraitR4.value = app.portraitColorR4 || "#6A4972";
    if (colorPortraitR3) colorPortraitR3.value = app.portraitColorR3 || "#545C7D";
    if (colorPortraitR2) colorPortraitR2.value = app.portraitColorR2 || "#496441";

    colorPatternNone.value = app.patternNone || "#4F4F4F";
    colorPatternOffensive.value = app.patternOffensive || "#FBAE31";
    colorPatternDefensive.value = app.patternDefensive || "#2D8A5A";
    colorPatternHp.value = app.patternHp || "#D4AD2B";
    colorPatternEquibalance.value = app.patternEquibalance || "#3B6DC7";

    // Custom Resonance Label Color
    if (checkCustomResColor) {
      checkCustomResColor.checked = !!app.customResColorEnabled;
    }
    if (customResColorRow) {
      customResColorRow.style.display = app.customResColorEnabled ? "flex" : "none";
    }
    if (colorCustomResLabel) {
      colorCustomResLabel.value = app.customResColor || "#ffffff";
    }

    // Unowned Character Dimming
    const unOp = app.unownedOpacity !== undefined ? app.unownedOpacity : 0.35;
    if (inputUnownedOpacity) inputUnownedOpacity.value = unOp;
    if (displayUnownedOpacity) displayUnownedOpacity.textContent = `${Math.round(unOp * 100)}%`;

    // Character Names Color
    const colorCharName = document.getElementById("color-char-name");
    if (colorCharName) {
      colorCharName.value = app.charNameColor || "#ffffff";
    }

    // Chess Pieces
    const chessControls = document.getElementById("chess-pieces-controls");
    if (chessControls) {
      chessControls.style.opacity = (app.chessPiecesEnabled !== false) ? "1" : "0.5";
    }
    if (selectChessPiecesPosition) {
      selectChessPiecesPosition.value = app.chessPiecesPosition || "top";
    }
    const pieceSize = app.chessPiecesSize !== undefined ? app.chessPiecesSize : 20;
    if (inputChessPieceSize) inputChessPieceSize.value = pieceSize;
    if (displayChessPieceSize) displayChessPieceSize.textContent = `${pieceSize}px`;

    const chessOp = app.chessPiecesOpacity !== undefined ? app.chessPiecesOpacity : (app.chessPiecesContainerOpacity !== undefined ? app.chessPiecesContainerOpacity : 1);
    if (inputChessContainerOpacity) inputChessContainerOpacity.value = chessOp;
    if (displayChessContainerOpacity) displayChessContainerOpacity.textContent = `${Math.round(chessOp * 100)}%`;

    updateCustomizePreviews();
  }

  function readAppearanceForm() {
    return {
      boardFont: selectBoardFont.value,
      boardUppercase: checkBoardUppercase ? checkBoardUppercase.checked : true,
      boardTitleSize: Number(inputBoardTitleSize.value),
      tierLabelSize: Number(inputTierLabelSize.value),
      tierLabelWidth: inputTierLabelWidth ? Number(inputTierLabelWidth.value) : 110,
      boardBg: colorBoardBg.value,
      boardTitleColor: colorBoardTitle.value,

      // Board Header Box
      boardHeaderBg: currentBoardHeaderBg,
      boardHeaderBgOpacity: inputBoardHeaderBgOpacity ? Number(inputBoardHeaderBgOpacity.value) : 1,
      boardHeaderBorderColor: currentBoardHeaderBorder,
      boardHeaderBorderWidth: Number(inputBoardHeaderBorderWidth.value),

      // Tier Box
      tierBoxOpacity: inputTierBoxOpacity ? Number(inputTierBoxOpacity.value) : 0.1,
      tierBoxBorderWidth: Number(inputTierBoxBorderWidth.value),
      tierBoxRadius: Number(inputTierBoxRadius.value),

      // Spacing
      spacingHeaderToTiers: inputSpacingHeaderTier ? Number(inputSpacingHeaderTier.value) : 20,
      spacingBetweenTierRows: inputSpacingTierGap ? Number(inputSpacingTierGap.value) : 14,

      // Character Card Scale
      charCardScale: inputCharCardSize ? Number(inputCharCardSize.value) : 1.0,

      // Character Info Badge
      charInfoBgEnabled: checkCharInfoBgEnabled.checked,
      charInfoBg: colorCharInfoBg.value,
      charInfoBgOpacity: inputCharInfoBgOpacity ? Number(inputCharInfoBgOpacity.value) : 0.22,
      charInfoBorderColor: currentCharInfoBorder,
      charInfoBorderWidth: Number(inputCharInfoBorderWidth.value),
      charInfoRadius: Number(inputCharInfoRadius.value),

      euphoriaColor: colorEuphoriaLabel.value,
      chubeLevelColor: colorChubeLevel ? colorChubeLevel.value : "#ffffff",
      chubeAmpColor: colorChubeAmp ? colorChubeAmp.value : "#ffffff",
      chubeAmpMaxColor: colorChubeAmpMax ? colorChubeAmpMax.value : "#DF7526",
      chubeCountColor: colorChubeCount ? colorChubeCount.value : "#04FFEE",
      customPortraitColorsEnabled: checkCustomPortraitColors ? checkCustomPortraitColors.checked : false,
      portraitColorR6: colorPortraitR6 ? colorPortraitR6.value : "#DD9925",
      portraitColorR5: colorPortraitR5 ? colorPortraitR5.value : "#C7AF6C",
      portraitColorR4: colorPortraitR4 ? colorPortraitR4.value : "#6A4972",
      portraitColorR3: colorPortraitR3 ? colorPortraitR3.value : "#545C7D",
      portraitColorR2: colorPortraitR2 ? colorPortraitR2.value : "#496441",

      patternNone: colorPatternNone.value,
      patternOffensive: colorPatternOffensive.value,
      patternDefensive: colorPatternDefensive.value,
      patternHp: colorPatternHp.value,
      patternEquibalance: colorPatternEquibalance.value,

      customResColorEnabled: checkCustomResColor ? checkCustomResColor.checked : false,
      customResColor: colorCustomResLabel ? colorCustomResLabel.value : "#ffffff",

      unownedOpacity: inputUnownedOpacity ? Number(inputUnownedOpacity.value) : 0.35,

      // Character Name Color
      charNameColor: (document.getElementById("color-char-name") && document.getElementById("color-char-name").value) || "#ffffff",

      // Chess Pieces
      chessPiecesEnabled: (displayOptions.appearance && displayOptions.appearance.chessPiecesEnabled !== undefined) ? displayOptions.appearance.chessPiecesEnabled : true,
      chessPiecesPosition: selectChessPiecesPosition ? selectChessPiecesPosition.value : "top",
      chessPiecesSize: inputChessPieceSize ? Number(inputChessPieceSize.value) : 20,
      chessPiecesOpacity: inputChessContainerOpacity ? Number(inputChessContainerOpacity.value) : 1,
    };
  }

  inputBoardTitleSize.addEventListener("input", (e) => {
    displayBoardTitleSize.textContent = `${e.target.value}rem`;
    updateCustomizePreviews();
  });

  if (inputBoardTitle) {
    inputBoardTitle.addEventListener("input", () => {
      updateCustomizePreviews();
    });
  }

  if (colorBoardTitle) {
    colorBoardTitle.addEventListener("input", () => {
      updateCustomizePreviews();
    });
  }

  if (checkBoardUppercase) {
    checkBoardUppercase.addEventListener("change", () => {
      updateCustomizePreviews();
    });
  }

  inputTierLabelSize.addEventListener("input", (e) => {
    displayTierLabelSize.textContent = `${e.target.value}rem`;
    updateCustomizePreviews();
  });

  // Board Header Box events
  colorBoardHeaderBg.addEventListener("input", (e) => {
    currentBoardHeaderBg = e.target.value;
    updateCustomizePreviews();
  });
  btnClearBoardHeaderBg.addEventListener("click", () => {
    currentBoardHeaderBg = "transparent";
    updateCustomizePreviews();
  });
  if (inputBoardHeaderBgOpacity) {
    inputBoardHeaderBgOpacity.addEventListener("input", (e) => {
      if (displayBoardHeaderBgOpacity) {
        displayBoardHeaderBgOpacity.textContent = `${Math.round(e.target.value * 100)}%`;
      }
      updateCustomizePreviews();
    });
  }
  colorBoardHeaderBorder.addEventListener("input", (e) => {
    currentBoardHeaderBorder = e.target.value;
    updateCustomizePreviews();
  });
  btnClearBoardHeaderBorder.addEventListener("click", () => {
    currentBoardHeaderBorder = "transparent";
    updateCustomizePreviews();
  });
  inputBoardHeaderBorderWidth.addEventListener("input", (e) => {
    displayBoardHeaderBorderWidth.textContent = `${e.target.value}px`;
    updateCustomizePreviews();
  });

  // Separator / Tier Label Width events
  if (inputTierLabelWidth) {
    inputTierLabelWidth.addEventListener("input", (e) => {
      displayTierLabelWidth.textContent = `${e.target.value}px`;
      updateCustomizePreviews();
    });
  }

  // Board Background Image Upload events
  if (inputBoardBgImage) {
    inputBoardBgImage.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (uploadEvt) => {
        customBoardBgImageUrl = uploadEvt.target.result;
        if (boardBgImageStatus) {
          boardBgImageStatus.textContent = t("styling.bgLoaded");
        }
        applyCustomAppearance();
      };
      reader.readAsDataURL(file);
    });
  }

  if (btnClearBoardBgImage) {
    btnClearBoardBgImage.addEventListener("click", () => {
      customBoardBgImageUrl = null;
      if (inputBoardBgImage) inputBoardBgImage.value = "";
      if (boardBgImageStatus) {
        boardBgImageStatus.textContent = t("styling.noImage");
      }
      applyCustomAppearance();
    });
  }

  // Tier Box events
  if (inputTierBoxOpacity) {
    inputTierBoxOpacity.addEventListener("input", (e) => {
      if (displayTierBoxOpacity) {
        displayTierBoxOpacity.textContent = `${Math.round(e.target.value * 100)}%`;
      }
      updateCustomizePreviews();
    });
  }
  inputTierBoxBorderWidth.addEventListener("input", (e) => {
    displayTierBoxBorderWidth.textContent = `${e.target.value}px`;
    updateCustomizePreviews();
  });
  inputTierBoxRadius.addEventListener("input", (e) => {
    displayTierBoxRadius.textContent = `${e.target.value}px`;
    updateCustomizePreviews();
  });

  // Character Card Scale events
  if (inputCharCardSize) {
    inputCharCardSize.addEventListener("input", (e) => {
      if (displayCharCardSize) {
        displayCharCardSize.textContent = `${Number(e.target.value).toFixed(2)}x`;
      }
      updateCustomizePreviews();
    });
  }

  // Custom Portrait Colors by Rarity events
  if (checkCustomPortraitColors) {
    checkCustomPortraitColors.addEventListener("change", (e) => {
      if (portraitRarityColorsGrid) {
        portraitRarityColorsGrid.style.display = e.target.checked ? "grid" : "none";
      }
    });
  }

  // Custom Resonance Label Color events
  if (checkCustomResColor) {
    checkCustomResColor.addEventListener("change", (e) => {
      if (customResColorRow) {
        customResColorRow.style.display = e.target.checked ? "flex" : "none";
      }
    });
  }

  // Unowned Character Dimming events
  if (inputUnownedOpacity) {
    inputUnownedOpacity.addEventListener("input", (e) => {
      if (displayUnownedOpacity) {
        displayUnownedOpacity.textContent = `${Math.round(e.target.value * 100)}%`;
      }
      updateCustomizePreviews();
    });
  }

  // Chess Pieces events
  if (checkChessPiecesEnabled) {
    checkChessPiecesEnabled.addEventListener("change", (e) => {
      const controls = document.getElementById("chess-pieces-controls");
      if (controls) controls.style.opacity = e.target.checked ? "1" : "0.5";
    });
  }
  if (inputChessPieceSize) {
    inputChessPieceSize.addEventListener("input", (e) => {
      if (displayChessPieceSize) displayChessPieceSize.textContent = `${e.target.value}px`;
      updateCustomizePreviews();
    });
  }
  if (inputChessContainerOpacity) {
    inputChessContainerOpacity.addEventListener("input", (e) => {
      if (displayChessContainerOpacity) displayChessContainerOpacity.textContent = `${Math.round(e.target.value * 100)}%`;
      updateCustomizePreviews();
    });
  }

  // Spacing events
  if (inputSpacingHeaderTier) {
    inputSpacingHeaderTier.addEventListener("input", (e) => {
      displaySpacingHeaderTier.textContent = `${e.target.value}px`;
      updateCustomizePreviews();
    });
  }
  if (inputSpacingTierGap) {
    inputSpacingTierGap.addEventListener("input", (e) => {
      displaySpacingTierGap.textContent = `${e.target.value}px`;
      updateCustomizePreviews();
    });
  }

  // Character Info Badge events
  checkCharInfoBgEnabled.addEventListener("change", (e) => {
    const controls = document.getElementById("char-info-bg-controls");
    if (controls) controls.style.opacity = e.target.checked ? "1" : "0.5";
    const bgOpacityRow = document.getElementById("char-info-bg-opacity-row");
    if (bgOpacityRow) bgOpacityRow.style.opacity = e.target.checked ? "1" : "0.5";
    updateCustomizePreviews();
  });
  if (colorCharInfoBg) {
    colorCharInfoBg.addEventListener("input", () => {
      updateCustomizePreviews();
    });
  }
  colorCharInfoBorder.addEventListener("input", (e) => {
    currentCharInfoBorder = e.target.value;
    updateCustomizePreviews();
  });
  btnClearCharInfoBorder.addEventListener("click", () => {
    currentCharInfoBorder = "transparent";
    updateCustomizePreviews();
  });
  inputCharInfoBorderWidth.addEventListener("input", (e) => {
    displayCharInfoBorderWidth.textContent = `${e.target.value}px`;
    updateCustomizePreviews();
  });
  inputCharInfoRadius.addEventListener("input", (e) => {
    displayCharInfoRadius.textContent = `${e.target.value}px`;
    updateCustomizePreviews();
  });
  if (inputCharInfoBgOpacity) {
    inputCharInfoBgOpacity.addEventListener("input", (e) => {
      displayCharInfoBgOpacity.textContent = `${Math.round(e.target.value * 100)}%`;
      updateCustomizePreviews();
    });
  }

  selectBoardFont.addEventListener("change", (e) => {
    const fontValue = getBoardFontFamily(e.target.value);
    document.documentElement.style.setProperty("--board-font", fontValue);
    const showcaseBoard = document.getElementById("showcase-board");
    if (showcaseBoard) {
      showcaseBoard.style.setProperty("--board-font", fontValue);
      showcaseBoard.style.fontFamily = fontValue;
    }
    if (boardTitleLabel) {
      boardTitleLabel.style.fontFamily = fontValue;
    }
    document.querySelectorAll(".tier-label").forEach((el) => {
      el.style.fontFamily = fontValue;
    });
  });

  btnResetCustomAppearance.addEventListener("click", () => {
    showConfirmModal(
      t("confirm.resetDefaultsTitle"),
      t("confirm.resetDefaultsMsg"),
      () => {
        syncAppearanceFormWithState(DEFAULT_THEME_APPEARANCE);
        const fontValue = getBoardFontFamily(DEFAULT_THEME_APPEARANCE.boardFont);
        document.documentElement.style.setProperty("--board-font", fontValue);
        const showcaseBoard = document.getElementById("showcase-board");
        if (showcaseBoard) {
          showcaseBoard.style.setProperty("--board-font", fontValue);
          showcaseBoard.style.fontFamily = fontValue;
        }
        if (boardTitleLabel) {
          boardTitleLabel.style.fontFamily = fontValue;
        }
        document.querySelectorAll(".tier-label").forEach((el) => {
          el.style.fontFamily = fontValue;
        });
      }
    );
  });

  function initCustomizeState() {
    syncAppearanceFormWithState(displayOptions.appearance || DEFAULT_THEME_APPEARANCE);
  }

  function openCustomizeModal() {
    openAppearanceModal("styling");
  }

  function closeCustomizeModal() {
    closeAppearanceModal();
  }

  if (btnCustomize) btnCustomize.addEventListener("click", openCustomizeModal);
  if (customizeBtnClose) customizeBtnClose.addEventListener("click", closeCustomizeModal);
  if (customizeBtnDone) {
    customizeBtnDone.addEventListener("click", () => {
      displayOptions.appearance = readAppearanceForm();
      saveDisplayOptions();
      applyCustomAppearance();
      renderShowcase();
      closeCustomizeModal();
    });
  }

  customizeModal.addEventListener("click", (e) => {
    if (e.target === customizeModal) closeCustomizeModal();
  });

  optionsModal.addEventListener("click", (e) => {
    if (e.target === optionsModal) closeOptionsModal();
  });

  // Listing Modal
  const btnListing = document.getElementById("btn-listing");
  const listingModal = document.getElementById("listing-modal");
  const listingBtnClose = document.getElementById("listing-btn-close");
  const listingBtnSave = document.getElementById("btn-save-listing");
  const listingBtnReset = document.getElementById("btn-reset-listing");
  const btnAddTier = document.getElementById("btn-add-tier");
  const listingTiersList = document.getElementById("listing-tiers-list");

  const inputOtherLabel = document.getElementById("input-other-label");
  const inputOtherColor = document.getElementById("input-other-color");
  const inputOtherBg = document.getElementById("input-other-bg");
  const btnClearOtherBg = document.getElementById("btn-clear-other-bg");
  const inputOtherBorder = document.getElementById("input-other-border");
  const btnClearOtherBorder = document.getElementById("btn-clear-other-border");
  const checkOtherBold = document.getElementById("check-other-bold");

  const inputUnownedColor = document.getElementById("input-unowned-color");
  const inputUnownedBg = document.getElementById("input-unowned-bg");
  const btnClearUnownedBg = document.getElementById("btn-clear-unowned-bg");
  const inputUnownedBorder = document.getElementById("input-unowned-border");
  const btnClearUnownedBorder = document.getElementById("btn-clear-unowned-border");
  const checkUnownedBold = document.getElementById("check-unowned-bold");

  let currentOtherBg = null;
  let currentOtherBorder = null;
  let currentUnownedBg = null;
  let currentUnownedBorder = null;

  if (btnClearOtherBg) {
    btnClearOtherBg.addEventListener("click", () => {
      currentOtherBg = null;
      if (inputOtherBg) inputOtherBg.value = "#000000";
    });
  }
  if (inputOtherBg) {
    inputOtherBg.addEventListener("input", (e) => {
      currentOtherBg = e.target.value;
    });
  }
  if (btnClearOtherBorder) {
    btnClearOtherBorder.addEventListener("click", () => {
      currentOtherBorder = null;
      if (inputOtherBorder) inputOtherBorder.value = "#222222";
    });
  }
  if (inputOtherBorder) {
    inputOtherBorder.addEventListener("input", (e) => {
      currentOtherBorder = e.target.value;
    });
  }

  if (btnClearUnownedBg) {
    btnClearUnownedBg.addEventListener("click", () => {
      currentUnownedBg = null;
      if (inputUnownedBg) inputUnownedBg.value = "#000000";
    });
  }
  if (inputUnownedBg) {
    inputUnownedBg.addEventListener("input", (e) => {
      currentUnownedBg = e.target.value;
    });
  }
  if (btnClearUnownedBorder) {
    btnClearUnownedBorder.addEventListener("click", () => {
      currentUnownedBorder = null;
      if (inputUnownedBorder) inputUnownedBorder.value = "#222222";
    });
  }
  if (inputUnownedBorder) {
    inputUnownedBorder.addEventListener("input", (e) => {
      currentUnownedBorder = e.target.value;
    });
  }

  const FIELD_DEFINITIONS = [
    { value: "resonance", labelKey: "setting.resonanceShort", type: "number", min: 1, max: 15, defaultVal: 10 },
    { value: "insight", labelKey: "setting.insight", type: "select", options: [
      { value: 3, label: "I3" },
      { value: 2, label: "I2" },
      { value: 1, label: "I1" },
      { value: 0, label: "I0" },
    ], defaultVal: 3 },
    { value: "level", labelKey: "setting.level", type: "number", min: 1, max: 60, defaultVal: 60 },
    { value: "portrait", labelKey: "setting.portrait", type: "select", options: [
      { value: 5, label: "P5" },
      { value: 4, label: "P4" },
      { value: 3, label: "P3" },
      { value: 2, label: "P2" },
      { value: 1, label: "P1" },
      { value: 0, label: "P0" },
    ], defaultVal: 0 },
    { value: "rarity", labelKey: "field.rarity", type: "select", options: [
      { value: 6, label: "✦6" },
      { value: 5, label: "✦5" },
      { value: 4, label: "✦4" },
      { value: 3, label: "✦3" },
      { value: 2, label: "✦2" },
    ], defaultVal: 6 },
    { value: "afflatus", labelKey: "field.afflatus", type: "select", options: [
      { value: "Beast", labelKey: "afflatus.Beast" },
      { value: "Plant", labelKey: "afflatus.Plant" },
      { value: "Star", labelKey: "afflatus.Star" },
      { value: "Mineral", labelKey: "afflatus.Mineral" },
      { value: "Spirit", labelKey: "afflatus.Spirit" },
      { value: "Intellect", labelKey: "afflatus.Intellect" },
    ], defaultVal: "Beast" },
    { value: "has_euphoria", labelKey: "field.hasEuphoria", type: "boolean", defaultVal: true },
    { value: "has_pattern", labelKey: "field.hasPattern", type: "boolean", defaultVal: true },
    { value: "has_skin", labelKey: "field.hasSkin", type: "boolean", defaultVal: true },
    { value: "favourite", labelKey: "field.favourite", type: "boolean", defaultVal: true },
    { value: "name", labelKey: "field.name", type: "text", defaultVal: "" },
  ];

  // Fields available to Psychube tiers (Tag / Amplification / Level / Rarity / Name)
  const CHUBE_FIELD_DEFINITIONS = [
    { value: "tag", labelKey: "field.tag", type: "select", options: [
      { value: "ATK", label: "ATK" },
      { value: "Critical", label: "Critical" },
      { value: "Heal", label: "Heal" },
      { value: "Support", label: "Support" },
      { value: "Survival", label: "Survival" },
    ], defaultVal: "ATK" },
    { value: "amplification", labelKey: "field.amplification", type: "select", options: [
      { value: 5, labelKey: "amp.5" },
      { value: 4, labelKey: "amp.4" },
      { value: 3, labelKey: "amp.3" },
      { value: 2, labelKey: "amp.2" },
      { value: 1, labelKey: "amp.1" },
    ], defaultVal: 1 },
    { value: "level", labelKey: "field.level", type: "number", min: 1, max: PSYCHUBE_MAX_LEVEL, defaultVal: PSYCHUBE_MAX_LEVEL },
    { value: "rarity", labelKey: "field.rarity", type: "select", options: [
      { value: 6, label: "✦6" },
      { value: 5, label: "✦5" },
    ], defaultVal: 6 },
    { value: "name", labelKey: "field.name", type: "text", defaultVal: "" },
  ];

  const COMPARISON_OPS = [
    { value: "=", label: "=" },
    { value: ">=", label: "≥" },
    { value: "<=", label: "≤" },
    { value: ">", label: ">" },
    { value: "<", label: "<" },
    { value: "!=", label: "≠" },
  ];

  // Default condition for a newly added rule row. Psychube tiers use their own
  // field set, so a character field such as `resonance` would be invalid there.
  function defaultTierCondition(isChubeTier) {
    return isChubeTier
      ? { field: "level", op: "=", value: PSYCHUBE_MAX_LEVEL }
      : { field: "resonance", op: ">=", value: 10 };
  }

  let tempListingTiers = [];

  function ensureTierRuleGroups(tier) {
    if (!Array.isArray(tier.ruleGroups) || tier.ruleGroups.length === 0) {
      if (tier.rule && typeof tier.rule === "string") {
        tier.ruleGroups = convertLegacyRuleToGroups(tier.rule);
      }
      if (!Array.isArray(tier.ruleGroups) || tier.ruleGroups.length === 0) {
        tier.ruleGroups = [[{ field: "resonance", op: ">=", value: 10 }]];
      }
    }
  }

  function renderListingTiersEditor() {
    listingTiersList.innerHTML = "";
    tempListingTiers.forEach((tier, index) => {
      const isSystemTier = tier.type === "other" || tier.type === "unowned"
        || tier.type === "psychube_unowned" || tier.type === "psychube_other";
      const isChubeTier = tier.type === "psychube";
      const fieldDefs = isChubeTier ? CHUBE_FIELD_DEFINITIONS : FIELD_DEFINITIONS;
      if (!isSystemTier) {
        ensureTierRuleGroups(tier);
      }

      const itemCard = document.createElement("div");
      itemCard.className = "listing-tier-item";
      // The header rail follows the tier's text colour
      itemCard.style.setProperty("--tier-color", tier.color || "#ffffff");

      // Row 1: Header (Move, Label, Text color, BG, Border, Bold, Delete)
      const headerRow = document.createElement("div");
      headerRow.className = "listing-tier-header-row";

      const handleDiv = document.createElement("div");
      handleDiv.className = "listing-tier-handle";

      const btnUp = document.createElement("button");
      btnUp.type = "button";
      btnUp.className = "btn-tier-move";
      btnUp.textContent = "▲";
      btnUp.disabled = index === 0;
      btnUp.addEventListener("click", () => {
        const temp = tempListingTiers[index - 1];
        tempListingTiers[index - 1] = tempListingTiers[index];
        tempListingTiers[index] = temp;
        renderListingTiersEditor();
      });

      const btnDown = document.createElement("button");
      btnDown.type = "button";
      btnDown.className = "btn-tier-move";
      btnDown.textContent = "▼";
      btnDown.disabled = index === tempListingTiers.length - 1;
      btnDown.addEventListener("click", () => {
        const temp = tempListingTiers[index + 1];
        tempListingTiers[index + 1] = tempListingTiers[index];
        tempListingTiers[index] = temp;
        renderListingTiersEditor();
      });

      handleDiv.appendChild(btnUp);
      handleDiv.appendChild(btnDown);

      const labelInput = document.createElement("input");
      labelInput.type = "text";
      labelInput.className = "listing-tier-label-input";
      labelInput.value = tier.label || (tier.type === "unowned" ? t("label.unownedCharacters") : (tier.type === "other" ? t("label.remainingCharacters") : t("label.tier")));
      labelInput.placeholder = "Label...";
      labelInput.addEventListener("input", (e) => {
        tier.label = e.target.value;
      });

      const colorInput = document.createElement("input");
      colorInput.type = "color";
      colorInput.className = "listing-tier-color-input";
      colorInput.value = tier.color || "#ffffff";
      colorInput.title = "Text Color";
      colorInput.addEventListener("input", (e) => {
        tier.color = e.target.value;
        // Keep the header rail in sync with the chosen text colour
        itemCard.style.setProperty("--tier-color", tier.color);
      });

      const labelBg = document.createElement("label");
      labelBg.style.display = "flex";
      labelBg.style.alignItems = "center";
      labelBg.style.gap = "4px";
      labelBg.style.fontSize = "0.62rem";
      labelBg.style.fontFamily = "var(--mono-font)";
      labelBg.title = "Tier Background Color";
      labelBg.innerHTML = `<span>${t("misc.bg")}</span>`;

      const bgInput = document.createElement("input");
      bgInput.type = "color";
      bgInput.className = "listing-tier-color-input";
      bgInput.value = tier.bgColor || "#000000";
      bgInput.addEventListener("input", (e) => {
        tier.bgColor = e.target.value;
      });

      const btnClearBg = document.createElement("button");
      btnClearBg.type = "button";
      btnClearBg.className = "custom-color-clear-btn";
      btnClearBg.textContent = t("opt.clear");
      btnClearBg.title = "Set transparent";
      btnClearBg.addEventListener("click", () => {
        tier.bgColor = null;
        bgInput.value = "#000000";
      });

      labelBg.appendChild(bgInput);
      labelBg.appendChild(btnClearBg);

      const labelBorder = document.createElement("label");
      labelBorder.style.display = "flex";
      labelBorder.style.alignItems = "center";
      labelBorder.style.gap = "4px";
      labelBorder.style.fontSize = "0.62rem";
      labelBorder.style.fontFamily = "var(--mono-font)";
      labelBorder.title = "Tier Border Color";
      labelBorder.innerHTML = `<span>${t("misc.border")}</span>`;

      const borderInput = document.createElement("input");
      borderInput.type = "color";
      borderInput.className = "listing-tier-color-input";
      borderInput.value = tier.borderColor || "#222222";
      borderInput.addEventListener("input", (e) => {
        tier.borderColor = e.target.value;
      });

      const btnClearBorder = document.createElement("button");
      btnClearBorder.type = "button";
      btnClearBorder.className = "custom-color-clear-btn";
      btnClearBorder.textContent = t("opt.clear");
      btnClearBorder.title = "Set default / transparent";
      btnClearBorder.addEventListener("click", () => {
        tier.borderColor = null;
        borderInput.value = "#222222";
      });

      labelBorder.appendChild(borderInput);
      labelBorder.appendChild(btnClearBorder);

      const labelBold = document.createElement("label");
      labelBold.className = "check-container";
      labelBold.style.margin = "0";
      labelBold.title = "Bold Text";
      labelBold.innerHTML = `
        <input type="checkbox" ${tier.bold ? "checked" : ""} />
        <span class="check-box"></span>
        <span class="check-text" style="font-size: 0.62rem; font-weight: 700;">${t("misc.bold")}</span>
      `;
      const boldCheck = labelBold.querySelector("input");
      boldCheck.addEventListener("change", () => {
        tier.bold = boldCheck.checked;
      });

      headerRow.appendChild(handleDiv);
      headerRow.appendChild(labelInput);
      headerRow.appendChild(colorInput);
      headerRow.appendChild(labelBg);
      headerRow.appendChild(labelBorder);
      headerRow.appendChild(labelBold);

      // Hide toggle: turns the icon red and drops the tier from the board
      const btnHide = document.createElement("button");
      btnHide.type = "button";
      btnHide.className = "btn-tier-hide" + (tier.hidden ? " is-hidden" : "");
      btnHide.title = t("action.hideTier");
      btnHide.setAttribute("aria-pressed", String(!!tier.hidden));
      const hideIcon = document.createElement("img");
      hideIcon.src = "images/random_icon/hide_tier.png";
      hideIcon.alt = t("action.hideTier");
      btnHide.appendChild(hideIcon);
      btnHide.addEventListener("click", () => {
        tier.hidden = !tier.hidden;
        btnHide.classList.toggle("is-hidden", !!tier.hidden);
        btnHide.setAttribute("aria-pressed", String(!!tier.hidden));
      });
      headerRow.appendChild(btnHide);

      // System tiers (Other, Unowned, Unowned Psychube) cannot be removed
      if (!isSystemTier) {
        const btnClone = document.createElement("button");
        btnClone.type = "button";
        btnClone.className = "btn-tier-clone";
        btnClone.textContent = t("action.clone");
        btnClone.title = "Duplicate this tier below";
        btnClone.style.marginLeft = "auto";
        btnClone.addEventListener("click", () => {
          // Deep copy so nested rule groups are independent
          const clone = JSON.parse(JSON.stringify(tier));
          clone.id = "tier_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
          clone.label = `${tier.label || t("label.tier")} ${t("label.copySuffix")}`;
          tempListingTiers.splice(index + 1, 0, clone);
          renderListingTiersEditor();
        });
        headerRow.appendChild(btnClone);

        const btnDel = document.createElement("button");
        btnDel.type = "button";
        btnDel.className = "btn-tier-del";
        btnDel.innerHTML = "&times;";
        btnDel.title = "Delete Tier";
        btnDel.addEventListener("click", () => {
          tempListingTiers.splice(index, 1);
          renderListingTiersEditor();
        });
        headerRow.appendChild(btnDel);
      } else {
        const tagSpan = document.createElement("span");
        tagSpan.style.marginLeft = "auto";
        tagSpan.style.fontFamily = "var(--mono-font)";
        tagSpan.style.fontSize = "0.58rem";
        tagSpan.style.color = "#D7B155";
        tagSpan.style.fontWeight = "700";
        tagSpan.style.letterSpacing = "0.06em";
        tagSpan.style.textTransform = "uppercase";
        tagSpan.textContent = tier.type === "unowned" ? t("label.unownedCharacters")
          : tier.type === "psychube_unowned" ? t("label.unownedPsychubes")
          : tier.type === "psychube_other" ? t("label.otherPsychubes")
          : t("label.remainingCharacters");
        headerRow.appendChild(tagSpan);
      }

      itemCard.appendChild(headerRow);

      // Row 2: Dynamic Rules Container (or info description for System Tiers)
      const rulesContainer = document.createElement("div");
      rulesContainer.className = "listing-tier-rules-container";

      if (tier.type === "other") {
        rulesContainer.innerHTML = `
          <div style="font-family: var(--mono-font); font-size: 0.62rem; color: var(--text-muted); padding: 4px 6px;">
            ${t("label.catOther")}
          </div>
        `;
        itemCard.appendChild(rulesContainer);
        listingTiersList.appendChild(itemCard);
        return;
      }

      if (tier.type === "unowned") {
        rulesContainer.innerHTML = `
          <div style="font-family: var(--mono-font); font-size: 0.62rem; color: var(--text-muted); padding: 4px 6px;">
            ${t("label.catUnowned")}
          </div>
        `;
        itemCard.appendChild(rulesContainer);
        listingTiersList.appendChild(itemCard);
        return;
      }

      // Unowned Psychube: fixed container, no conditions
      if (tier.type === "psychube_unowned") {
        rulesContainer.innerHTML = `
          <div style="font-family: var(--mono-font); font-size: 0.62rem; color: var(--text-muted); padding: 4px 6px;">
            ${t("label.catUnownedPsychube")}
          </div>
        `;
        itemCard.appendChild(rulesContainer);
        listingTiersList.appendChild(itemCard);
        return;
      }

      // Other Psychubes: fixed catch-all, no conditions
      if (tier.type === "psychube_other") {
        rulesContainer.innerHTML = `
          <div style="font-family: var(--mono-font); font-size: 0.62rem; color: var(--text-muted); padding: 4px 6px;">
            ${t("label.catOtherPsychubes")}
          </div>
        `;
        itemCard.appendChild(rulesContainer);
        listingTiersList.appendChild(itemCard);
        return;
      }
      tier.ruleGroups.forEach((group, gIdx) => {
        if (gIdx > 0) {
          const orDivider = document.createElement("div");
          orDivider.className = "listing-rule-or-divider";
          orDivider.innerHTML = `<span class="listing-rule-or-badge">OR</span>`;
          rulesContainer.appendChild(orDivider);
        }

        const groupBox = document.createElement("div");
        groupBox.className = "listing-rule-group-box";

        const groupHeader = document.createElement("div");
        groupHeader.className = "listing-rule-group-header";

        const groupTag = document.createElement("span");
        groupTag.className = "listing-rule-group-tag";
        groupTag.textContent = tier.ruleGroups.length > 1
          ? t("label.conditionGroup", { n: gIdx + 1 })
          : t("label.criteria");
        groupHeader.appendChild(groupTag);

        const groupActions = document.createElement("div");
        groupActions.style.display = "flex";
        groupActions.style.gap = "6px";
        groupActions.style.alignItems = "center";

        const btnAddCond = document.createElement("button");
        btnAddCond.type = "button";
        btnAddCond.className = "btn btn-secondary btn-sm";
        btnAddCond.textContent = t("action.addAnd");
        btnAddCond.style.padding = "2px 6px";
        btnAddCond.style.fontSize = "0.58rem";
        btnAddCond.title = "Add another condition to this group (AND)";
        btnAddCond.addEventListener("click", () => {
          group.push(defaultTierCondition(isChubeTier));
          renderListingTiersEditor();
        });
        groupActions.appendChild(btnAddCond);

        if (tier.ruleGroups.length > 1) {
          const btnDelGroup = document.createElement("button");
          btnDelGroup.type = "button";
          btnDelGroup.className = "btn-tier-del";
          btnDelGroup.innerHTML = "&times;";
          btnDelGroup.title = "Delete this condition group (OR)";
          btnDelGroup.style.fontSize = "0.9rem";
          btnDelGroup.addEventListener("click", () => {
            tier.ruleGroups.splice(gIdx, 1);
            renderListingTiersEditor();
          });
          groupActions.appendChild(btnDelGroup);
        }

        groupHeader.appendChild(groupActions);
        groupBox.appendChild(groupHeader);

        // Conditions in group
        group.forEach((cond, cIdx) => {
          const condRow = document.createElement("div");
          condRow.className = "listing-rule-condition-row";

          // Field selector
          const fieldSel = document.createElement("select");
          fieldSel.className = "listing-rule-select";
          fieldDefs.forEach((fd) => {
            const opt = document.createElement("option");
            opt.value = fd.value;
            opt.textContent = fd.labelKey ? t(fd.labelKey) : fd.label;
            if (fd.value === cond.field) opt.selected = true;
            fieldSel.appendChild(opt);
          });

          // Operator selector
          const opSel = document.createElement("select");
          opSel.className = "listing-rule-select";
          COMPARISON_OPS.forEach((opDef) => {
            const opt = document.createElement("option");
            opt.value = opDef.value;
            opt.textContent = opDef.label;
            if (opDef.value === (cond.op || "=")) opt.selected = true;
            opSel.appendChild(opt);
          });

          // Value input container
          const valContainer = document.createElement("div");
          valContainer.style.display = "inline-flex";
          valContainer.style.alignItems = "center";

          function updateValueControl() {
            valContainer.innerHTML = "";
            const currentFieldDef = fieldDefs.find((f) => f.value === cond.field) || fieldDefs[0];

            if (currentFieldDef.type === "boolean") {
              opSel.style.display = "none";
              cond.op = "=";
              const boolSel = document.createElement("select");
              boolSel.className = "listing-rule-select";
              const optTrue = document.createElement("option");
              optTrue.value = "true";
              optTrue.textContent = "True";
              const optFalse = document.createElement("option");
              optFalse.value = "false";
              optFalse.textContent = "False";
              boolSel.appendChild(optTrue);
              boolSel.appendChild(optFalse);
              boolSel.value = String(cond.value !== false);
              boolSel.addEventListener("change", (e) => {
                cond.value = e.target.value === "true";
              });
              valContainer.appendChild(boolSel);
            } else if (currentFieldDef.type === "text") {
              opSel.style.display = "none";
              cond.op = "=";
              const txtInput = document.createElement("input");
              txtInput.type = "text";
              txtInput.className = "listing-rule-value-input";
              txtInput.style.width = "125px";
              txtInput.placeholder = isChubeTier ? t("label.psychubeName") : t("label.characterName");
              txtInput.value = cond.value !== undefined ? cond.value : "";
              txtInput.addEventListener("input", (e) => {
                cond.value = e.target.value;
              });
              valContainer.appendChild(txtInput);
            } else if (currentFieldDef.type === "select") {
              const selEl = document.createElement("select");
              selEl.className = "listing-rule-select";
              const numeric = currentFieldDef.options.every((o) => !isNaN(Number(o.value)));
              // Text-based selects (e.g. Afflatus) have no meaningful comparison operator
              opSel.style.display = numeric ? "inline-block" : "none";
              if (!numeric) cond.op = "=";
              currentFieldDef.options.forEach((o) => {
                const opt = document.createElement("option");
                opt.value = o.value;
                opt.textContent = o.labelKey ? t(o.labelKey) : o.label;
                if (String(o.value) === String(cond.value)) opt.selected = true;
                selEl.appendChild(opt);
              });
              selEl.addEventListener("change", (e) => {
                cond.value = numeric ? Number(e.target.value) : e.target.value;
              });
              valContainer.appendChild(selEl);
            } else {
              opSel.style.display = "inline-block";
              const numInput = document.createElement("input");
              numInput.type = "number";
              numInput.className = "listing-rule-value-input";
              numInput.min = currentFieldDef.min !== undefined ? currentFieldDef.min : 1;
              numInput.max = currentFieldDef.max !== undefined ? currentFieldDef.max : 100;
              numInput.value = cond.value !== undefined ? cond.value : currentFieldDef.defaultVal;
              numInput.addEventListener("input", (e) => {
                cond.value = Number(e.target.value);
              });
              valContainer.appendChild(numInput);
            }
          }

          fieldSel.addEventListener("change", (e) => {
            cond.field = e.target.value;
            const newFDef = fieldDefs.find((f) => f.value === cond.field);
            cond.value = newFDef ? newFDef.defaultVal : 0;
            updateValueControl();
          });

          opSel.addEventListener("change", (e) => {
            cond.op = e.target.value;
          });

          updateValueControl();

          condRow.appendChild(fieldSel);
          condRow.appendChild(opSel);
          condRow.appendChild(valContainer);

          if (group.length > 1) {
            const btnDelCond = document.createElement("button");
            btnDelCond.type = "button";
            btnDelCond.className = "btn-tier-del";
            btnDelCond.innerHTML = "&times;";
            btnDelCond.title = "Delete condition";
            btnDelCond.style.fontSize = "0.85rem";
            btnDelCond.addEventListener("click", () => {
              group.splice(cIdx, 1);
              renderListingTiersEditor();
            });
            condRow.appendChild(btnDelCond);
          }

          groupBox.appendChild(condRow);
        });

        rulesContainer.appendChild(groupBox);
      });

      // Button to add OR Group
      const btnAddOrGroup = document.createElement("button");
      btnAddOrGroup.type = "button";
      btnAddOrGroup.className = "btn btn-secondary btn-sm";
      btnAddOrGroup.textContent = t("action.addOrGroupFull");
      btnAddOrGroup.style.fontSize = "0.6rem";
      btnAddOrGroup.style.marginTop = "4px";
      btnAddOrGroup.style.alignSelf = "flex-start";
      btnAddOrGroup.addEventListener("click", () => {
        tier.ruleGroups.push([defaultTierCondition(isChubeTier)]);
        renderListingTiersEditor();
      });
      rulesContainer.appendChild(btnAddOrGroup);

      itemCard.appendChild(rulesContainer);
      listingTiersList.appendChild(itemCard);
    });
  }

  function initListingState() {
    tempListingTiers = JSON.parse(JSON.stringify(listingConfig.tiers || []));

    if (inputOtherLabel) inputOtherLabel.value = listingConfig.otherLabel || "Other";
    if (inputOtherColor) inputOtherColor.value = listingConfig.otherColor || "#a0a0a0";
    currentOtherBg = listingConfig.otherBg || null;
    if (inputOtherBg) inputOtherBg.value = currentOtherBg || "#000000";
    currentOtherBorder = listingConfig.otherBorder || null;
    if (inputOtherBorder) inputOtherBorder.value = currentOtherBorder || "#222222";
    if (checkOtherBold) checkOtherBold.checked = !!listingConfig.otherBold;

    if (inputUnownedColor) inputUnownedColor.value = listingConfig.unownedColor || "#9a9a9a";
    currentUnownedBg = listingConfig.unownedBg || null;
    if (inputUnownedBg) inputUnownedBg.value = currentUnownedBg || "#000000";
    currentUnownedBorder = listingConfig.unownedBorder || null;
    if (inputUnownedBorder) inputUnownedBorder.value = currentUnownedBorder || "#222222";
    if (checkUnownedBold) checkUnownedBold.checked = !!listingConfig.unownedBold;

    renderListingTiersEditor();
  }

  function openListingModal() {
    openAppearanceModal("tiers");
  }

  function closeListingModal() {
    closeAppearanceModal();
  }

  btnAddTier.addEventListener("click", () => {
    // New tiers are inserted at the top of the list
    tempListingTiers.unshift({
      id: "tier_" + Date.now(),
      label: t("label.newTier"),
      color: "#e0e0e0",
      ruleGroups: [[{ field: "resonance", op: ">=", value: 10 }]],
    });
    renderListingTiersEditor();
  });

  // Psychube tiers land at the bottom and default to owned = true
  const btnAddChubeTier = document.getElementById("btn-add-chube-tier");
  if (btnAddChubeTier) {
    btnAddChubeTier.addEventListener("click", () => {
      tempListingTiers.push({
        id: "chube_tier_" + Date.now(),
        type: "psychube",
        label: t("label.psychubeTier"),
        color: "#7fb3d5",
        ruleGroups: [[{ field: "owned", op: "=", value: true }]],
      });
      renderListingTiersEditor();
    });
  }

  if (btnListing) btnListing.addEventListener("click", openListingModal);
  if (listingBtnClose) listingBtnClose.addEventListener("click", closeListingModal);
  if (listingModal) {
    listingModal.addEventListener("click", (e) => {
      if (e.target === listingModal) closeListingModal();
    });
  }

  if (listingBtnSave) {
    listingBtnSave.addEventListener("click", () => {
    if (inputOtherLabel) listingConfig.otherLabel = inputOtherLabel.value.trim() || "Other";
    if (inputOtherColor) listingConfig.otherColor = inputOtherColor.value;
    listingConfig.otherBg = currentOtherBg;
    listingConfig.otherBorder = currentOtherBorder;
    listingConfig.otherBold = checkOtherBold ? checkOtherBold.checked : false;

    if (inputUnownedColor) listingConfig.unownedColor = inputUnownedColor.value;
    listingConfig.unownedBg = currentUnownedBg;
    listingConfig.unownedBorder = currentUnownedBorder;
    listingConfig.unownedBold = checkUnownedBold ? checkUnownedBold.checked : false;

    listingConfig.tiers = tempListingTiers;
    saveListingConfig();
    renderShowcase();
    closeListingModal();
    });
  }

  if (listingBtnReset) {
    listingBtnReset.addEventListener("click", () => {
    showConfirmModal(
      t("confirm.resetTiers"),
      t("confirm.resetTiersMsg"),
      () => {
        listingConfig = JSON.parse(JSON.stringify(DEFAULT_TIERS_CONFIG));
        tempListingTiers = JSON.parse(JSON.stringify(listingConfig.tiers));

        if (inputOtherLabel) inputOtherLabel.value = "Other";
        if (inputOtherColor) inputOtherColor.value = "#a0a0a0";
        currentOtherBg = null;
        currentOtherBorder = null;
        if (inputOtherBg) inputOtherBg.value = "#000000";
        if (inputOtherBorder) inputOtherBorder.value = "#222222";
        if (checkOtherBold) checkOtherBold.checked = false;

        if (inputUnownedColor) inputUnownedColor.value = "#9a9a9a";
        currentUnownedBg = null;
        currentUnownedBorder = null;
        if (inputUnownedBg) inputUnownedBg.value = "#000000";
        if (inputUnownedBorder) inputUnownedBorder.value = "#222222";
        if (checkUnownedBold) checkUnownedBold.checked = false;

        renderListingTiersEditor();
      }
    );
    });
  }

  // Navbar menu: a small dropdown (like the language one) that carries the nav
  // links on narrow screens where `.navbar-nav` is hidden.
  const btnToolsToggle = document.getElementById("btn-tools-toggle");
  const navbarMenuWrap = document.getElementById("navbar-menu-wrap");

  function setNavMenuOpen(isOpen) {
    if (!navbarMenuWrap) return;
    navbarMenuWrap.classList.toggle("open", isOpen);
    if (btnToolsToggle) btnToolsToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
  }

  function closeNavMenu() {
    setNavMenuOpen(false);
  }

  if (btnToolsToggle && navbarMenuWrap) {
    btnToolsToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      setNavMenuOpen(!navbarMenuWrap.classList.contains("open"));
    });
  }

  // Brand Logo click scrolls to top
  const appLogo = document.getElementById("app-logo-img");
  if (appLogo) {
    appLogo.style.cursor = "pointer";
    appLogo.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  // Nav links — the navbar buttons and the small menu's items run the same handlers.
  const navMenuTeam = document.getElementById("drawer-nav-team");
  if (navMenuTeam) {
    navMenuTeam.addEventListener("click", () => {
      closeNavMenu();
      openTeamModal();
    });
  }

  const navMenuRotations = document.getElementById("drawer-nav-rotations");
  if (navMenuRotations) {
    navMenuRotations.addEventListener("click", () => {
      closeNavMenu();
      openRotationsModal();
    });
  }

  const navMenuBuilds = document.getElementById("drawer-nav-builds");
  if (navMenuBuilds) {
    navMenuBuilds.addEventListener("click", () => {
      closeNavMenu();
      openBuildsModal();
    });
  }

  const navMenuPlanner = document.getElementById("drawer-nav-planner");
  if (navMenuPlanner) {
    navMenuPlanner.addEventListener("click", () => {
      closeNavMenu();
      openPlannerModal();
    });
  }

  // Language Dropdown toggle & outside click handling
  const langDropdownWrap = document.getElementById("lang-dropdown-wrap");
  const langDropdownBtn = document.getElementById("lang-dropdown-btn");
  if (langDropdownBtn && langDropdownWrap) {
    langDropdownBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeNavMenu();
      const isOpen = langDropdownWrap.classList.toggle("open");
      langDropdownBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });
  }

  document.addEventListener("click", (e) => {
    if (langDropdownWrap && !langDropdownWrap.contains(e.target)) {
      langDropdownWrap.classList.remove("open");
      if (langDropdownBtn) langDropdownBtn.setAttribute("aria-expanded", "false");
    }
    // The menu closes on any outside click, like the language dropdown.
    if (navbarMenuWrap && !navbarMenuWrap.contains(e.target)) closeNavMenu();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    closeNavMenu();
    if (langDropdownWrap) langDropdownWrap.classList.remove("open");
    if (langDropdownBtn) langDropdownBtn.setAttribute("aria-expanded", "false");
  });

  document.querySelectorAll(".lang-dropdown-item").forEach((item) => {
    item.addEventListener("click", () => {
      if (langDropdownWrap) langDropdownWrap.classList.remove("open");
      if (langDropdownBtn) langDropdownBtn.setAttribute("aria-expanded", "false");
    });
  });

  // Keep the highlights aligned when the layout reflows.
  window.addEventListener("resize", refreshSlidingThumbs);

  /* ---- Board tooltips stay inside the board ---------------------------
     A card is ~60px wide but its tooltip reads ~190-260px wide and is centred
     on the card, so the last card of a row had its tooltip clipped by the
     board's edge. Nudge it back inside while it is shown. */
  const TOOLTIP_EDGE_MARGIN = 14;
  function clampBoardTooltip(card) {
    const tip = card.querySelector(".char-tooltip");
    if (!tip) return;
    tip.style.setProperty("--tooltip-shift", "0px");
    const board = document.getElementById("showcase-board");
    if (!board) return;
    const bounds = board.getBoundingClientRect();
    const rect = tip.getBoundingClientRect();
    const minLeft = Math.max(bounds.left, 0) + TOOLTIP_EDGE_MARGIN;
    const maxRight = Math.min(bounds.right, window.innerWidth) - TOOLTIP_EDGE_MARGIN;
    let shift = 0;
    if (rect.left < minLeft) shift = minLeft - rect.left;
    else if (rect.right > maxRight) shift = maxRight - rect.right;
    if (shift) tip.style.setProperty("--tooltip-shift", `${Math.round(shift)}px`);
  }

  document.addEventListener(
    "pointerover",
    (e) => {
      const target = e.target instanceof Element ? e.target : null;
      const card = target ? target.closest("#showcase-board .char-card") : null;
      if (card) clampBoardTooltip(card);
    },
    { passive: true }
  );

  // Roster Manager
  if (btnManageAll) btnManageAll.addEventListener("click", openRosterModal);
  if (rosterBtnClose) rosterBtnClose.addEventListener("click", closeRosterModal);
  if (rosterModal) {
    rosterModal.addEventListener("click", (e) => {
      if (e.target === rosterModal) closeRosterModal();
    });
  }
  if (rosterSearch) rosterSearch.addEventListener("input", renderRosterManager);

  // Roster Manager — bulk selection
  const btnRosterSelectMode = document.getElementById("btn-roster-select-mode");
  const btnRosterSelectPage = document.getElementById("btn-roster-select-page");
  const btnRosterSelectNone = document.getElementById("btn-roster-select-none");
  const btnRosterBulkApply = document.getElementById("btn-roster-bulk-apply");
  const bulkApplyModal = document.getElementById("bulk-apply-modal");

  if (btnRosterSelectMode) {
    btnRosterSelectMode.addEventListener("click", () => setRosterSelectMode(!rosterSelectMode));
  }
  if (btnRosterSelectPage) btnRosterSelectPage.addEventListener("click", selectAllVisibleRosterTiles);
  if (btnRosterSelectNone) btnRosterSelectNone.addEventListener("click", clearRosterSelection);
  if (btnRosterBulkApply) btnRosterBulkApply.addEventListener("click", openBulkApplyModal);

  if (bulkApplyModal) {
    const closeBtn = document.getElementById("bulk-apply-btn-close");
    const confirmBtn = document.getElementById("bulk-apply-confirm");
    if (closeBtn) closeBtn.addEventListener("click", closeBulkApplyModal);
    if (confirmBtn) confirmBtn.addEventListener("click", applyBulkSpec);
    bulkApplyModal.addEventListener("click", (e) => {
      if (e.target === bulkApplyModal) closeBulkApplyModal();
    });
  }

  // Psychube Setting modal
  const chubeModal = document.getElementById("chube-modal");
  if (chubeModal) {
    document.getElementById("chube-modal-btn-close").addEventListener("click", closePsychubeModal);
    document.getElementById("chube-modal-btn-save").addEventListener("click", savePsychubeModal);
    chubeModal.addEventListener("click", (e) => { if (e.target === chubeModal) closePsychubeModal(); });

    document.getElementById("chube-btn-owned").addEventListener("click", () => {
      tempChubeState.owned = true; updatePsychubeModalView();
    });
    document.getElementById("chube-btn-unowned").addEventListener("click", () => {
      tempChubeState.owned = false; updatePsychubeModalView();
    });
    document.getElementById("chube-input-level").addEventListener("input", (e) => {
      tempChubeState.level = Number(e.target.value);
      document.getElementById("chube-display-level").textContent = String(tempChubeState.level);
    });
    document.querySelectorAll("#chube-modal .btn-pill-a").forEach((btn) => {
      btn.addEventListener("click", () => {
        tempChubeState.amplification = Number(btn.dataset.a);
        updatePsychubeModalView();
      });
    });
    document.getElementById("chube-input-count").addEventListener("input", (e) => {
      // Accept a raw typed number (Gluttony / Greed can exceed the game's 99);
      // the value is clamped only when the modal is saved.
      const parsed = Math.floor(Number(e.target.value));
      tempChubeState.count = Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, PSYCHUBE_MAX_COUNT) : 0;
      document.getElementById("chube-display-count").textContent = String(tempChubeState.count);
      const statusEl = document.getElementById("chube-modal-status");
      if (statusEl) statusEl.textContent = t("chube.countLabel", { n: tempChubeState.count });
    });
  }

  // Chubes manager — lives in the second tab of the Manage modal
  const chubesModal = document.getElementById("chubes-grid-list");
  if (chubesModal) {
    document.getElementById("chubes-search").addEventListener("input", renderChubesManager);
    document.querySelectorAll("#chubes-filter-rarity-group .filter-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const r = Number(btn.dataset.rarity);
        if (chubesActiveRarityFilters.has(r)) chubesActiveRarityFilters.delete(r);
        else chubesActiveRarityFilters.add(r);
        btn.classList.toggle("active", chubesActiveRarityFilters.has(r));
        renderChubesManager();
      });
    });
    document.getElementById("btn-chubes-select-mode").addEventListener("click", () => setChubesSelectMode(!chubesSelectMode));
    document.getElementById("btn-chubes-select-page").addEventListener("click", () => {
      chubesVisibleKeys().forEach((key) => chubesSelection.add(key));
      renderChubesManager();
    });
    document.getElementById("btn-chubes-select-none").addEventListener("click", () => {
      chubesSelection.clear();
      renderChubesManager();
    });
    document.getElementById("btn-chubes-bulk-apply").addEventListener("click", openChubeBulkModal);
  }

  // Manage modal tabs: Characters (default) / Psychubes. Scoped to the roster
  // modal — the Appearance modal's tabs share the `.manage-tab` look only.
  document.querySelectorAll("#roster-modal .manage-tab").forEach((btn) => {
    btn.addEventListener("click", () => setManageTab(btn.dataset.manageTab));
  });

  const chubeBulkModal = document.getElementById("chube-bulk-modal");
  if (chubeBulkModal) {
    document.getElementById("chube-bulk-btn-close").addEventListener("click", closeChubeBulkModal);
    document.getElementById("chube-bulk-confirm").addEventListener("click", applyChubeBulkSpec);
    chubeBulkModal.addEventListener("click", (e) => { if (e.target === chubeBulkModal) closeChubeBulkModal(); });
    document.getElementById("chube-bulk-level-slider").addEventListener("input", (e) => {
      chubeBulkSpec.level = Number(e.target.value); renderChubeBulkModal();
    });
  }

  // Roster Manager Rarity Filter Buttons (multi-select toggle)
  rosterFilterRarityBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const selectedRarity = Number(btn.dataset.rarity);
      if (rosterActiveRarityFilters.has(selectedRarity)) {
        rosterActiveRarityFilters.delete(selectedRarity);
        btn.classList.remove("active");
      } else {
        rosterActiveRarityFilters.add(selectedRarity);
        btn.classList.add("active");
      }
      renderRosterManager();
    });
  });

  /** Resolves which character names a bulk action should touch. */
  function getRosterBulkTargets() {
    if (rosterSelection.size > 0) {
      return new Set(rosterSelection);
    }
    const targets = new Set();
    for (const name in userRoster) {
      const rarity = getCharacterRarity(name);
      if (rosterActiveRarityFilters.size === 0 || rosterActiveRarityFilters.has(rarity)) {
        targets.add(name);
      }
    }
    return targets;
  }

  // Export Modal Elements
  const exportModal = document.getElementById("export-modal");
  const exportModalBtnClose = document.getElementById("export-modal-btn-close");
  const exportModalBtnCloseAction = document.getElementById("export-modal-btn-close-action");
  const exportModalBtnShare = document.getElementById("export-modal-btn-share");
  const exportModalBtnDownload = document.getElementById("export-modal-btn-download");
  const exportPreviewImg = document.getElementById("export-preview-img");

  function closeExportModal() {
    if (exportModal) exportModal.style.display = "none";
  }

  if (exportModalBtnClose) exportModalBtnClose.addEventListener("click", closeExportModal);
  if (exportModalBtnCloseAction) exportModalBtnCloseAction.addEventListener("click", closeExportModal);
  if (exportModal) {
    exportModal.addEventListener("click", (e) => {
      if (e.target === exportModal) closeExportModal();
    });
  }

  if (exportModalBtnShare) {
    exportModalBtnShare.addEventListener("click", async () => {
      if (!currentExportBlob) return;
      try {
        const file = new File([currentExportBlob], currentExportFileName, { type: "image/png" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: "Sotheby's Mansion",
          });
        }
      } catch (err) {
        if (err.name !== "AbortError") {
          console.warn("Share failed:", err);
        }
      }
    });
  }

  if (exportModalBtnDownload) {
    exportModalBtnDownload.addEventListener("click", () => {
      if (!currentExportBlobUrl) return;
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      if (isIOS) {
        const opened = window.open(currentExportBlobUrl, "_blank");
        if (!opened) {
          triggerDownload(currentExportBlobUrl, currentExportFileName);
        }
      } else {
        triggerDownload(currentExportBlobUrl, currentExportFileName);
      }
    });
  }

  // Allow clicking/tapping the preview image itself to trigger download on Android
  if (exportPreviewImg) {
    exportPreviewImg.style.cursor = "pointer";
    exportPreviewImg.title = "Tap to download or long-press to save image";
  }

  // Export PNG via html2canvas with mobile / iOS support
  btnExportImage.addEventListener("click", async () => {
    const board = document.getElementById("showcase-board");
    if (!board) return;

    setButtonLabel(btnExportImage, t("action.rendering"));
    btnExportImage.classList.add("is-busy");
    btnExportImage.disabled = true;

    try {
      // 1. Ensure all images in the board are fully loaded
      const imgs = Array.from(board.querySelectorAll("img"));
      imgs.forEach((img) => {
        if (img.loading === "lazy") img.loading = "eager";
      });
      await Promise.all(
        imgs.map((img) => {
          if (img.complete) return Promise.resolve();
          return new Promise((resolve) => {
            img.addEventListener("load", resolve, { once: true });
            img.addEventListener("error", resolve, { once: true });
          });
        })
      );

      // 2. Safe scale calculation (iOS WebKit max single canvas dimension is 4096px)
      const boardW = board.scrollWidth || board.offsetWidth;
      const boardH = board.scrollHeight || board.offsetHeight;
      const maxDim = Math.max(boardW, boardH);
      const maxCanvasDim = 4096;
      let scale = 2; // high-quality default
      if (maxDim * scale > maxCanvasDim) {
        scale = Math.max(1, Math.floor((maxCanvasDim / maxDim) * 100) / 100);
      }

      const app = displayOptions.appearance || DEFAULT_THEME_APPEARANCE;
      const unOp = app.unownedOpacity !== undefined ? app.unownedOpacity : 0.35;

      const canvas = await html2canvas(board, {
        backgroundColor: customBoardBgImageUrl ? null : (app.boardBg || "#111111"),
        scale: scale,
        useCORS: true,
        logging: false,
        scrollX: 0,
        scrollY: 0,
        onclone: (clonedDoc) => {
          const clonedImgs = clonedDoc.querySelectorAll("#showcase-board img");
          clonedImgs.forEach((img) => img.removeAttribute("loading"));
          clonedDoc.querySelectorAll(".char-tooltip").forEach((el) => el.remove());

          // Replicate unowned opacity on cloned elements for html2canvas
          clonedDoc.querySelectorAll(".char-card.is-unowned").forEach((unownedCard) => {
            const img = unownedCard.querySelector(".char-avatar-img");
            if (img) {
              img.style.opacity = String(unOp);
            }
          });
        },
      });

      // 3. Convert canvas to Blob
      let blob = await new Promise((resolve) => {
        canvas.toBlob(resolve, "image/png");
      });
      if (!blob) {
        const dataUrl = canvas.toDataURL("image/png");
        const res = await fetch(dataUrl);
        blob = await res.blob();
      }

      deliverExportBlob(blob, `Sothebys_Mansion_${new Date().toISOString().slice(0, 10)}.png`);
    } catch (err) {
      console.error("Export failed:", err);
      alert("Failed to export image. Please try again.");
    } finally {
      setButtonLabel(btnExportImage, t("action.exportPng"));
      btnExportImage.classList.remove("is-busy");
      btnExportImage.disabled = false;
    }
  });

  // Export JSON Modal Elements (Export Theme vs Export All)
  const exportJsonModal = document.getElementById("export-json-modal");
  const exportJsonBtnClose = document.getElementById("export-json-btn-close");
  const exportJsonBtnCancel = document.getElementById("export-json-btn-cancel");
  const btnExportJsonTheme = document.getElementById("btn-export-json-theme");
  const btnExportJsonRoster = document.getElementById("btn-export-json-roster");
  const btnExportJsonAll = document.getElementById("btn-export-json-all");

  function closeExportJsonModal() {
    if (exportJsonModal) exportJsonModal.style.display = "none";
  }

  if (btnJson) {
    btnJson.addEventListener("click", () => {
      if (exportJsonModal) {
        exportJsonModal.style.display = "flex";
      }
    });
  }

  // The import control lives inside this modal now, so picking a file closes it.
  const labelImportFile = document.getElementById("label-import-file");
  if (labelImportFile && inputImportFile) {
    labelImportFile.addEventListener("click", () => {
      // Let the label's own click open the file picker; close afterwards so the
      // import confirmation is not hidden behind the dialog.
      setTimeout(closeExportJsonModal, 0);
    });
  }

  if (exportJsonBtnClose) exportJsonBtnClose.addEventListener("click", closeExportJsonModal);
  if (exportJsonBtnCancel) exportJsonBtnCancel.addEventListener("click", closeExportJsonModal);
  if (exportJsonModal) {
    exportJsonModal.addEventListener("click", (e) => {
      if (e.target === exportJsonModal) closeExportJsonModal();
    });
  }

  // 1. Export Theme Only (Không bao gồm roster, cho người dùng chia sẻ UI)
  if (btnExportJsonTheme) {
    btnExportJsonTheme.addEventListener("click", () => {
      const themePayload = {
        version: 2,
        isThemeOnly: true,
        boardTitle: localStorage.getItem(TITLE_STORAGE_KEY) || "Suitcase",
        listingConfig: listingConfig,
        displayOptions: displayOptions,
      };
      const jsonBlob = new Blob([JSON.stringify(themePayload, null, 2)], { type: "application/json" });
      const blobUrl = URL.createObjectURL(jsonBlob);
      triggerDownload(blobUrl, `r1999_theme_${new Date().toISOString().slice(0, 10)}.json`);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
      closeExportJsonModal();
    });
  }

  // 2. Export Roster Only (Chỉ xuất danh sách nhân vật, không đổi UI/Theme của người nhận)
  if (btnExportJsonRoster) {
    btnExportJsonRoster.addEventListener("click", () => {
      const rosterPayload = {
        version: 2,
        isRosterOnly: true,
        roster: userRoster,
      };
      const jsonBlob = new Blob([JSON.stringify(rosterPayload, null, 2)], { type: "application/json" });
      const blobUrl = URL.createObjectURL(jsonBlob);
      triggerDownload(blobUrl, `r1999_roster_${new Date().toISOString().slice(0, 10)}.json`);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
      closeExportJsonModal();
    });
  }

  // 3. Export All (Full backup bao gồm cả roster, teams, psychubes và styling)
  if (btnExportJsonAll) {
    btnExportJsonAll.addEventListener("click", () => {
      const exportPayload = {
        version: 2,
        roster: userRoster,
        listingConfig: listingConfig,
        displayOptions: displayOptions,
        boardTitle: localStorage.getItem(TITLE_STORAGE_KEY) || "Suitcase",
        // Teams ride along in the full backup only, shaped exactly like
        // r1999_teams_v1 so a round-trip is lossless.
        teams: {
          teams: teamsConfig.teams,
          allowUnowned: teamsAllowUnowned,
          formableOnly: teamsFormableOnly,
          manualPick: teamsManualPick,
          hideWarning: teamsHideWarning,
          columns: teamColumns,
          stripRatio: teamStripRatio,
        },
        psychubes: userPsychubes,
      };
      const jsonBlob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" });
      const blobUrl = URL.createObjectURL(jsonBlob);
      triggerDownload(blobUrl, `r1999_full_backup_${new Date().toISOString().slice(0, 10)}.json`);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
      closeExportJsonModal();
    });
  }

  // Import JSON (Hỗ trợ: File theme độc lập, File full backup v2, File roster v1 cũ)
  inputImportFile.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target.result);
        if (typeof imported === "object" && imported !== null && !Array.isArray(imported)) {
          // Trường hợp 1: File Theme Only (không có hoặc không cần roster)
          const isTheme = imported.isThemeOnly || (imported.listingConfig && imported.displayOptions && !imported.roster);

          if (isTheme) {
            if (imported.listingConfig && typeof imported.listingConfig === "object") {
              listingConfig = { ...DEFAULT_TIERS_CONFIG, ...imported.listingConfig };
              saveListingConfig();
            }
            if (imported.displayOptions && typeof imported.displayOptions === "object") {
              displayOptions = {
                ...displayOptions,
                ...imported.displayOptions,
                appearance: { ...DEFAULT_THEME_APPEARANCE, ...(imported.displayOptions.appearance || {}) },
              };
              saveDisplayOptions();
            }
            if (imported.boardTitle) {
              localStorage.setItem(TITLE_STORAGE_KEY, imported.boardTitle);
              if (boardTitleLabel) boardTitleLabel.textContent = imported.boardTitle;
              if (inputBoardTitle) inputBoardTitle.value = imported.boardTitle;
            }
            applyCustomAppearance();
            renderShowcase();
            alert("Theme settings imported successfully! Your roster remains untouched.");
            return;
          }

          // Trường hợp 2: File Roster Only (chỉ chứa roster, không thay đổi theme/styling)
          if (imported.isRosterOnly && imported.roster && typeof imported.roster === "object" && !Array.isArray(imported.roster)) {
            userRoster = imported.roster;
            sanitizeRosterState();
            saveRoster();
            renderShowcase();
            alert("Roster imported successfully! Your theme settings remain untouched.");
            return;
          }

          // Trường hợp 3: File Full Backup v2 (chứa cả roster và config)
          if (imported.roster && typeof imported.roster === "object" && !Array.isArray(imported.roster)) {
            userRoster = imported.roster;
            if (imported.listingConfig && typeof imported.listingConfig === "object") {
              listingConfig = { ...DEFAULT_TIERS_CONFIG, ...imported.listingConfig };
              saveListingConfig();
            }
            if (imported.displayOptions && typeof imported.displayOptions === "object") {
              displayOptions = {
                ...displayOptions,
                ...imported.displayOptions,
                appearance: { ...DEFAULT_THEME_APPEARANCE, ...(imported.displayOptions.appearance || {}) },
              };
              saveDisplayOptions();
            }
            if (imported.boardTitle) {
              localStorage.setItem(TITLE_STORAGE_KEY, imported.boardTitle);
              if (boardTitleLabel) boardTitleLabel.textContent = imported.boardTitle;
              if (inputBoardTitle) inputBoardTitle.value = imported.boardTitle;
            }

            // Teams + psychubes (full backup only). Teams REPLACE the current set,
            // then go through the usual sanitizers so a hand-edited file can't
            // inject duplicate characters or unknown ids.
            if (imported.teams && typeof imported.teams === "object" && !Array.isArray(imported.teams)) {
              const t = imported.teams;
              teamsConfig = { teams: Array.isArray(t.teams) ? t.teams : [] };
              teamsAllowUnowned = !!t.allowUnowned;
              teamsFormableOnly = !!t.formableOnly;
              teamsManualPick = !!t.manualPick;
              teamsHideWarning = !!t.hideWarning;
              if (typeof t.columns === "number") {
                teamColumns = Math.min(TEAM_MAX_COLUMNS, Math.max(1, Math.round(t.columns)));
              }
              if (typeof t.stripRatio === "number") {
                teamStripRatio = Math.min(0.75, Math.max(0.12, t.stripRatio));
              }
              sanitizeTeamsState();
              saveTeams();
              renderTeamModal();
            }

            if (imported.psychubes && typeof imported.psychubes === "object" && !Array.isArray(imported.psychubes)) {
              userPsychubes = imported.psychubes;
              sanitizePsychubeState();
              savePsychubes();
            }
          } else {
            // Trường hợp 4: Direct roster map v1 cũ
            userRoster = imported;
          }

          sanitizeRosterState();
          saveRoster();
          applyCustomAppearance();
          renderShowcase();
          alert("Data imported successfully!");
        } else {
          alert("Invalid JSON format. Please select a valid JSON file.");
        }
      } catch (err) {
        alert("Invalid JSON file.");
      } finally {
        inputImportFile.value = ""; // Reset file input so re-importing the same file works
      }
    };
    reader.readAsText(file);
  });

  // Reset Data (lives in the Manage modal, left of the Characters/Psychubes tabs)
  btnResetData.addEventListener("click", () => {
    showConfirmModal(
      t("confirm.resetRosterTitle"),
      t("confirm.resetRosterMsg"),
      () => {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(TEAMS_STORAGE_KEY);
        localStorage.removeItem(PSYCHUBE_STORAGE_KEY);
        userRoster = {};
        userPsychubes = {};
        teamsConfig = { teams: [] };
        pendingTeamCharacter = null;
        loadRoster();
        loadPsychubes();
        if (rosterModal.style.display !== "none") {
          setManageTab(manageActiveTab);
          exitRosterSelectMode();
          setChubesSelectMode(false);
        }
        renderShowcase();
      }
    );
  });
}

// Outside modal label: pattern colour, falling back to the neutral tone.
function getResonanceTextColor(patternName) {
  return getPatternColor(patternName || DEFAULT_PATTERN);
}

// Inside roster card label: same palette, but honours a user override if set.
function getCardResonanceTextColor(patternName) {
  const app = displayOptions.appearance || DEFAULT_THEME_APPEARANCE;
  if (app.customResColorEnabled && app.customResColor) {
    return app.customResColor;
  }
  return getPatternColor(patternName || DEFAULT_PATTERN);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* ---------------- /sim share page ---------------- */

const SIM_MAX_MEMBERS = 4;

/**
 * True when this load is a share link. `api/sim.js` injects `window.__SIM__`;
 * locally `serve.py` serves `index.html` for `/sim` and the query string is the
 * only signal.
 */
function isSimPage() {
  if (window.__SIM__ && typeof window.__SIM__ === "object") return true;
  const params = new URLSearchParams(window.location.search);
  return (
    params.has("t") ||
    params.has("c") ||
    params.has("r") ||
    params.has("team") ||
    params.has("character")
  );
}

/* ---- Compact link ids -------------------------------------------------
   A link stores the game ids, not display names: `t=<skinId>-<insight>-<level>-
   <portrait>-<chube>,…` per team member and `c=<charId|skinId>` per character.
   The skin id already carries the character (`<charId><skinSuffix>`), and a
   psychube's game id is unique across rarities. */

/** Reverse of `characterIdMap`: game id -> canonical roster key (built once). */
let simCharacterIdIndex = null;
function simCanonicalForId(id) {
  if (!simCharacterIdIndex) {
    simCharacterIdIndex = new Map();
    for (const name of Object.keys(characterDb)) {
      const charId = Number(characterIdMap[name]);
      if (charId && !simCharacterIdIndex.has(charId)) simCharacterIdIndex.set(charId, name);
    }
  }
  return simCharacterIdIndex.get(Number(id)) || "";
}

/** Reverse of the psychube keys: bare game id -> `<rarity>:<id>` (built once). */
let simPsychubeIdIndex = null;
function simPsychubeKeyForId(id) {
  const bare = String(id || "").trim();
  if (!/^\d+$/.test(bare)) return "";
  if (!simPsychubeIdIndex) {
    simPsychubeIdIndex = new Map();
    for (const key of Object.keys(psychubeDb)) {
      const idPart = String(key).split(":").pop();
      if (!simPsychubeIdIndex.has(idPart)) simPsychubeIdIndex.set(idPart, key);
    }
  }
  return simPsychubeIdIndex.get(bare) || "";
}

/** Default skin id for a character (`<charId>01`). */
function simDefaultSkinId(canonical) {
  const charId = Number(characterIdMap[canonical]);
  return charId ? charId * 100 + 1 : 0;
}

/** Skin id to share: the equipped one, or the default when skins are hidden. */
function simSkinIdFor(canonical, char) {
  const fallback = simDefaultSkinId(canonical);
  if (!char || !char.owned || displayOptions.hideSkin || !char.skin) return fallback;
  const skin = getSkinInfo(canonical, char.skin);
  if (!skin || skin.isDefault) return fallback;
  return Number(skin.id) || fallback;
}

/** Head art for a skin id, falling back to the character's default head. */
function simHeadForSkin(canonical, skinId) {
  const fallback = characterDb[canonical] || "";
  if (!skinId) return fallback;
  if (Number(skinId) === simDefaultSkinId(canonical)) return fallback;
  const skin = (characterSkinsMap[canonical] || []).find((s) => Number(s.id) === Number(skinId));
  return (skin && skin.iconUrl) || fallback;
}

/** `<skinId>-<insight>-<level>-<portrait>-<chube>`, trailing empty fields dropped. */
function simCompactToken(member) {
  const fields = [
    member.skinId || 0,
    Number(member.insight) || 0,
    Number(member.level) || 0,
    Number(member.portraitTier) || 0,
    member.psychube ? String(member.psychube).split(":").pop() : "",
  ];
  while (fields.length > 1 && !fields[fields.length - 1]) fields.pop();
  return fields.join("-");
}

/**
 * Share link for a team card. Every member is self-contained, so a slot the sharer
 * left empty is simply skipped instead of shifting the others.
 */
function simShareUrlForTeam(team) {
  const tokens = [];
  (team.slots || []).forEach((slot) => {
    if (!slot || !slot.character) return;
    const canonical = resolveCharacterName(slot.character) || slot.character;
    if (!characterDb[canonical]) return;
    const char = userRoster[canonical] || {};
    const owned = Boolean(char.owned);
    tokens.push(
      simCompactToken({
        skinId: simSkinIdFor(canonical, char),
        insight: owned ? char.insight : 0,
        level: owned ? char.level : 0,
        portraitTier: owned ? char.portrait : 0,
        psychube: slot.psychube || "",
      }),
    );
  });

  const params = new URLSearchParams();
  if (tokens.length) params.set("t", tokens.join(","));
  const name = String(team.name || "").trim();
  if (name) params.set("name", name);
  // The language travels with the link: the card the crawler caches and the page
  // the visitor lands on then agree.
  params.set("lang", currentLang);
  return `${window.location.origin}/sim?${params.toString()}`;
}

/** Share link for a character build: just the skin id (`<charId>01` by default). */
function simShareUrlForCharacter(name) {
  const canonical = resolveCharacterName(name) || name || "";
  const skinId = simSkinIdFor(canonical, userRoster[canonical] || {});
  const params = new URLSearchParams();
  if (skinId) params.set("c", String(skinId));
  else if (canonical) params.set("character", canonical);
  params.set("lang", currentLang);
  return `${window.location.origin}/sim?${params.toString()}`;
}

/** Share link for a rotation: the bundled preset id, so the link never goes stale. */
function simShareUrlForRotation(rotation) {
  const presetId = rotation && (rotation.presetId || rotation.id);
  const params = new URLSearchParams();
  if (presetId) params.set("r", String(presetId));
  params.set("lang", currentLang);
  return `${window.location.origin}/sim?${params.toString()}`;
}

/**
 * Copies a share link and flashes the icon button. The button has no text, so
 * the only feedback is the colour change plus the title swap.
 */
async function copyShareLink(button, url, label) {
  const ok = await guideCopyText(url);
  button.classList.toggle("is-copied", ok);
  button.classList.toggle("is-failed", !ok);
  const message = ok ? t("sim.copied") : t("builds.copyFailed");
  button.title = message;
  button.setAttribute("aria-label", message);
  window.setTimeout(() => {
    button.classList.remove("is-copied", "is-failed");
    button.title = label;
    button.setAttribute("aria-label", label);
  }, 1200);
}

/** One payload member, filled from the local data so the view and the app agree. */
function simMemberPayload(canonical, extra) {
  const row = extra.psychube && psychubeDb[extra.psychube] ? psychubeDb[extra.psychube] : null;
  return {
    id: Number(characterIdMap[canonical]) || 0,
    name: characterDisplayEn[canonical] || canonical,
    nameZh: characterDisplayCn[canonical] || "",
    rarity: getCharacterRarity(canonical),
    afflatus: getCharacterAfflatus(canonical) || "",
    head: simHeadForSkin(canonical, extra.skinId),
    skinId: Number(extra.skinId) || 0,
    insight: Number(extra.insight) || 0,
    level: Number(extra.level) || 0,
    portraitTier: Number(extra.portraitTier) || 0,
    psychube: extra.psychube || "",
    psychubeName: row ? row.name : "",
    psychubeNameZh: row ? row.nameCn : "",
    psychubeIcon: extra.psychube ? psychubeIconUrl(extra.psychube) : "",
  };
}

/** A legacy `team=` token: a name (plus its positional chube). */
function simMemberFromToken(token, chubeToken) {
  const canonical = resolveCharacterName(token);
  if (!canonical || !characterDb[canonical]) return null;
  const chube = chubeToken && psychubeDb[chubeToken] ? chubeToken : psychubeKeyFromName(chubeToken);
  return simMemberPayload(canonical, {
    skinId: simDefaultSkinId(canonical),
    psychube: chube || "",
  });
}

/** A compact `t=` token: `skinId-insight-level-portrait-chube`. */
function simMemberFromCompact(token) {
  const raw = String(token || "").trim();
  if (!raw) return null;
  const parts = raw.split("-");
  const numeric = Number(parts[0]);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;

  const digits = String(Math.trunc(numeric));
  const isSkin = digits.length > 4;
  const charId = isSkin ? Math.trunc(numeric / 100) : Math.trunc(numeric);
  const skinId = isSkin ? Math.trunc(numeric) : charId * 100 + 1;
  const canonical = simCanonicalForId(charId);
  if (!canonical) return null;

  return simMemberPayload(canonical, {
    skinId,
    insight: Number(parts[1]) || 0,
    level: Number(parts[2]) || 0,
    portraitTier: Number(parts[3]) || 0,
    psychube: simPsychubeKeyForId(parts.slice(4).join("-")),
  });
}

/** A character card from a roster key, using the local build data. */
function simCharacterFromToken(token, skinId) {
  const canonical = resolveCharacterName(token);
  if (!canonical || !characterDb[canonical]) return null;
  const build = getBuild(canonical) || {};
  const profile = characterProfilesData[canonical] || {};
  const pattern = build.pattern || "";
  const shape = characterResoShape[canonical] || "";
  const skin = Number(skinId) || simDefaultSkinId(canonical);
  return {
    id: Number(characterIdMap[canonical]) || 0,
    name: characterDisplayEn[canonical] || canonical,
    nameZh: characterDisplayCn[canonical] || "",
    rarity: getCharacterRarity(canonical),
    afflatus: getCharacterAfflatus(canonical) || "",
    dmgType: profile.dmgType || "",
    dmgTypeZh: profile.dmgTypeZh || "",
    head: simHeadForSkin(canonical, skin),
    skinId: skin,
    pattern,
    shape,
    patternIcon: shape && pattern ? `images/shape_pattern/${shape}/${pattern}.png` : "",
    portrait: build.portrait || "",
    psychubes: (Array.isArray(build.psychubes) ? build.psychubes : [])
      .map(psychubeKeyFromName)
      .filter(Boolean),
  };
}

/** A compact `c=` token: a character id or a skin id. */
function simCharacterFromCompact(token) {
  const numeric = Number(String(token || "").trim().split("-")[0]);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const digits = String(Math.trunc(numeric));
  const isSkin = digits.length > 4;
  const charId = isSkin ? Math.trunc(numeric / 100) : Math.trunc(numeric);
  const skinId = isSkin ? Math.trunc(numeric) : charId * 100 + 1;
  const canonical = simCanonicalForId(charId);
  if (!canonical) return null;
  return simCharacterFromToken(canonical, skinId);
}

/**
 * The payload `api/sim.js` injects carries the server's view of the build; the
 * local data is authoritative for names, art and build content, so fill from it.
 */
function simNormalizeInjectedMember(member) {
  if (!member || typeof member !== "object") return null;
  const canonical = resolveCharacterName(member.name || "");
  if (!canonical || !characterDb[canonical]) return member;
  return simMemberPayload(canonical, {
    skinId: Number(member.skinId) || simDefaultSkinId(canonical),
    insight: member.insight,
    level: member.level,
    portraitTier: member.portraitTier,
    psychube: member.psychube || "",
  });
}

function simNormalizeInjectedCharacter(char) {
  if (!char || typeof char !== "object") return null;
  const canonical = resolveCharacterName(char.name || "");
  if (!canonical || !characterDb[canonical]) return char;
  return simCharacterFromToken(canonical, char.skinId);
}

/**
 * A rotation link names a preset id. The local `content/rotations.json` copy is what
 * draws the plan, so an injected server payload (id + name) is expanded here; if the
 * preset is gone the identity still gives the page its title.
 */
function simRotationPayload(value) {
  const id = typeof value === "string" ? value : value && value.id;
  const preset = id ? rotationPresetById(String(id).trim()) : null;
  if (preset) return preset;
  if (value && typeof value === "object" && value.id) {
    return { id: String(value.id), name: String(value.name || value.id) };
  }
  return null;
}

/**
 * The share payload, normalised to one shape whether it came from `window.__SIM__`
 * or from the query string (`python serve.py` has no serverless function).
 */
function readSimParams() {
  const injected = window.__SIM__;
  if (injected && typeof injected === "object") {
    const members = (Array.isArray(injected.members) ? injected.members : [])
      .map(simNormalizeInjectedMember)
      .filter(Boolean)
      .slice(0, SIM_MAX_MEMBERS);
    const character = members.length ? null : simNormalizeInjectedCharacter(injected.character);
    const rotation = members.length || character ? null : simRotationPayload(injected.rotation);
    return {
      // A link copied by the app names its language; one without it follows the
      // visitor's own setting.
      lang:
        injected.langExplicit && SUPPORTED_LANGS.includes(injected.lang)
          ? injected.lang
          : currentLang,
      name: String(injected.name || ""),
      mode: members.length
        ? "team"
        : character
          ? "character"
          : rotation
            ? "rotation"
            : "default",
      members,
      character,
      rotation,
    };
  }

  const params = new URLSearchParams(window.location.search);
  let members = [];

  if (params.get("t")) {
    members = String(params.get("t"))
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map(simMemberFromCompact)
      .filter(Boolean)
      .slice(0, SIM_MAX_MEMBERS);
  } else {
    const chubeTokens = String(params.get("chubes") || "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    members = String(params.get("team") || "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((token, i) => simMemberFromToken(token, chubeTokens[i]))
      .filter(Boolean)
      .slice(0, SIM_MAX_MEMBERS);
  }

  const character = members.length
    ? null
    : params.get("c")
      ? simCharacterFromCompact(params.get("c"))
      : simCharacterFromToken(params.get("character"));
  const rotation = members.length || character ? null : simRotationPayload(params.get("r"));

  return {
    lang: SUPPORTED_LANGS.includes(params.get("lang")) ? params.get("lang") : currentLang,
    name: String(params.get("name") || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 40),
    mode: members.length
      ? "team"
      : character
        ? "character"
        : rotation
          ? "rotation"
          : "default",
    members,
    character,
    rotation,
  };
}

/** Name in the active language; the payload carries both spellings. */
function simDisplayName(item) {
  if (!item) return "";
  if (currentLang === "cn") return item.nameZh || item.name || "";
  return item.name || item.nameZh || "";
}

/**
 * One team slot, emitted with the modal's own classes so the team-card CSS (the
 * same rules the PNG export uses) does all the design work.
 */
function simTeamSlotHtml(member) {
  if (!member) {
    return `<div class="team-slot"><div class="team-slot-char"><span class="team-slot-plus">+</span></div></div>`;
  }

  const label = escapeHtml(simDisplayName(member));
  const insight = Number(member.insight) || 0;
  const level = Number(member.level) || 0;
  const portraitTier = Number(member.portraitTier) || 0;
  const hasRoster = insight > 0 || level > 0 || portraitTier > 0;

  const afflatusHtml = member.afflatus
    ? `<span class="team-slot-afflatus"><img src="images/afflatus_icon/${escapeHtml(member.afflatus)}.png" alt="${escapeHtml(displayAfflatus(member.afflatus))}" loading="lazy" decoding="async" /></span>`
    : "";
  const insightHtml =
    insight > 0
      ? `<img src="images/insight_icon/I${insight}.png" alt="${escapeHtml(fmtInsight(insight))}" class="team-slot-insight" loading="lazy" decoding="async" />`
      : "";
  const metaHtml = hasRoster
    ? `<span class="team-slot-meta">${insightHtml}<span class="team-slot-level">${escapeHtml(fmtLevel(level))}</span></span>`
    : "";
  const barHtml = hasRoster
    ? `<span class="team-slot-portrait-bar">${rotationPortraitDashesHtml(portraitTier, member.rarity)}</span>`
    : "";
  const chubeHtml = member.psychube
    ? `<div class="team-slot-chube is-filled"><img src="${escapeHtml(member.psychubeIcon || psychubeIconUrl(member.psychube))}" alt="${escapeHtml(psychubeName(member.psychube))}" loading="lazy" decoding="async" /></div>`
    : `<div class="team-slot-chube"><span class="team-slot-chube-plus">+</span></div>`;

  return `
    <div class="team-slot is-filled">
      <div class="team-slot-char" role="img" aria-label="${label}">
        <span class="team-slot-portrait">
          <img src="${escapeHtml(member.head || "")}" alt="${label}" class="team-slot-img" loading="lazy" decoding="async" />
          ${afflatusHtml}${metaHtml}${barHtml}
        </span>
      </div>
      ${chubeHtml}
    </div>`;
}

/** The exported team card: one parchment card, four slots, the name in the head. */
function simTeamCardHtml(sim) {
  const name = sim.name || t("og.teamBuild");
  const slots = [];
  for (let i = 0; i < SIM_MAX_MEMBERS; i += 1) slots.push(simTeamSlotHtml(sim.members[i]));
  return `
    <div class="team-list sim-team-list">
      <div class="team-card">
        <div class="team-card-head"><span class="team-name-text">${escapeHtml(name)}</span></div>
        <div class="team-slots">${slots.join("")}</div>
      </div>
    </div>`;
}

/**
 * The InfoBook build pane, rendered by the modal itself and copied out, so the share
 * page is literally the same markup. Skills and materials are dropped: a share card
 * shows the build, not the farming list.
 */
function simBuildHtml(char) {
  const canonical = resolveCharacterName(char.name || "");
  const host = document.getElementById("builds-detail");
  // The build sits inside the InfoBook's own card, so a shared character looks like
  // the modal it was copied from rather than a loose block on the wallpaper.
  const shell = (inner, accent, extraClass = "") =>
    `<div class="modal-card archetype-modal-card builds-modal-card sim-build-card${extraClass}">
      <div class="builds-body">
        <div class="builds-detail sim-builds" style="--build-accent:${accent}">${inner}</div>
      </div>
    </div>`;

  if (!canonical || !host || !characterDb[canonical]) {
    const accent = RARITY_COLORS[Number(char.rarity) || 0] || "var(--accent-gold)";
    return shell(
      `<div class="builds-hero">
          <span class="builds-hero-portrait"><img src="${escapeHtml(char.head || "")}" alt="" /></span>
          <div class="builds-hero-text"><div class="builds-hero-head"><h3 class="builds-hero-name">${escapeHtml(simDisplayName(char))}</h3></div></div>
        </div>`,
      accent,
    );
  }

  const previous = buildsSelected;
  buildsSelected = canonical;
  let html = "";
  try {
    renderBuildsDetail();
    html = host.innerHTML;
  } finally {
    // Put the modal back the way the visitor left it.
    buildsSelected = previous;
    renderBuildsDetail();
  }

  // Trim in a detached node so no listener ever touches the modal's own copy. Skills are
  // the InfoBook's own reading pane, and the notes callout just repeats the portrait chart
  // ("Recommended Portrait: 0/1/2/5"), so a share page shows the build.
  const holder = document.createElement("div");
  holder.innerHTML = html;
  holder
    .querySelectorAll(".builds-share-btn, .char-skills-section, .build-notes-box")
    .forEach((el) => el.remove());

  const accent = rarityColor(getCharacterRarity(canonical));
  // Sotheby keeps her easter-egg theme on the share page too.
  return shell(holder.innerHTML, accent, canonical === "Sotheby" ? " is-sotheby-theme" : "");
}

/** Resonance codes stay copyable on the share page. */
function setupSimBuildListeners(view) {
  view.querySelectorAll(".build-resonance-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const original = btn.textContent;
      const ok = await guideCopyText(btn.dataset.code || "");
      btn.textContent = ok ? t("builds.copied") : t("builds.copyFailed");
      btn.classList.toggle("is-copied", ok);
      window.setTimeout(() => {
        btn.textContent = original;
        btn.classList.remove("is-copied");
      }, 1100);
    });
  });
}

/**
 * The rotation plan in the modal's own frame. The list and the share button are left
 * out: the page shows one plan and the toolbar owns the only action. The size slider
 * stays, because it only changes how the cards are drawn.
 */
function simRotationHtml(rotation) {
  return `
    <div class="modal-card archetype-modal-card rotations-modal-card sim-rotation-card">
      <div class="rotations-body sim-rotations-body">
        <div class="rotations-detail sim-rotations-detail">${rotationPlanHtml(rotation, {
          share: false,
        })}</div>
      </div>
    </div>`;
}

/** Same wiring as the modal, minus the share button the page does not render. */
function setupSimRotationListeners(view) {
  const host = view.querySelector(".sim-rotation-card");
  if (!host) return;
  wireRotationPlan(host, null);
}

/** Draws the share page over the app; the app itself keeps running underneath. */
function renderSimView(sim) {
  const previous = document.getElementById("sim-view");
  if (previous) previous.remove();

  const teamTitle = sim.name || t("og.teamBuild");
  const charTitle = sim.mode === "character" ? simDisplayName(sim.character) : "";
  const rotationTitle =
    sim.mode === "rotation" ? sim.rotation.name || sim.rotation.id || "" : "";
  const title =
    sim.mode === "team"
      ? teamTitle
      : sim.mode === "character"
        ? charTitle
        : sim.mode === "rotation"
          ? rotationTitle
          : "Sotheby's Mansion";
  const kicker =
    sim.mode === "team"
      ? `Reverse: 1999 · ${t("og.teamBuild")}`
      : sim.mode === "character"
        ? `Reverse: 1999 · ${t("sim.character")}`
        : sim.mode === "rotation"
          ? `Reverse: 1999 · ${t("sim.rotation")}`
          : "Reverse: 1999";

  let body = "";
  if (sim.mode === "team") {
    body = simTeamCardHtml(sim);
  } else if (sim.mode === "character") {
    body = simBuildHtml(sim.character);
  } else if (sim.mode === "rotation") {
    body = simRotationHtml(sim.rotation);
  } else {
    body = `
      <section class="sim-hero sim-hero-default">
        <p class="sim-kicker">${escapeHtml(kicker)}</p>
        <h1 class="sim-title">Sotheby's Mansion</h1>
        <p class="sim-sub">${escapeHtml(t("sim.noShare"))}</p>
      </section>`;
  }

  const view = document.createElement("div");
  view.id = "sim-view";
  view.className = "sim-view no-export";
  // The toolbar is the app's own: same `.top-controls` panel, same `.btn`s, same
  // sliding `.lang-switcher`, only the centre cluster (search/manage/export) is
  // dropped because nothing here is editable.
  const logo =
    currentLang === "cn"
      ? "images/sotheby_mansion_cn.png"
      : currentLang === "vi"
        ? "images/dinhthusotheby.png"
        : "images/sotheby_mansion.webp";
  view.innerHTML = `
    <div class="sim-shell">
      <header class="top-controls sim-head">
        <div class="header-primary-bar">
          <div class="header-brand-row">
            <a class="app-brand sim-brand" href="./" title="Sotheby's Mansion">
              <span class="app-brand-icon-box"><img src="images/web_icon.png" alt="" class="app-brand-icon" /></span>
              <span class="app-logo-wrap"><img src="${logo}" alt="Sotheby's Mansion" class="app-logo-img" /></span>
            </a>
          </div>
          <div class="header-actions-row"></div>
          <div class="header-stats-row">
            <div class="lang-switcher lang-switcher-header" role="group" aria-label="Language">
              ${["cn", "vi", "en"]
                .map(
                  (lang) =>
                    `<button type="button" class="lang-btn${lang === currentLang ? " active" : ""}" data-lang="${lang}" data-sim-lang="${lang}">${lang === "cn" ? "CN" : lang.toUpperCase()}</button>`,
                )
                .join("")}
            </div>
            <button type="button" class="btn btn-secondary" data-sim-copy>${escapeHtml(t("sim.copy"))}</button>
            <a class="btn btn-primary sim-open" href="./">${escapeHtml(t("sim.open"))}</a>
          </div>
        </div>
      </header>
      ${body}
    </div>`;

  document.body.appendChild(view);
  document.body.classList.add("sim-mode");
  // Give the copy of the switcher the same sliding highlight the app header has.
  setupSlidingThumbs();
  if (sim.mode === "character") setupSimBuildListeners(view);
  if (sim.mode === "rotation") setupSimRotationListeners(view);

  view.querySelectorAll("[data-sim-lang]").forEach((button) => {
    button.addEventListener("click", async () => {
      const next = button.getAttribute("data-sim-lang");
      if (!next || next === currentLang) return;
      await setLanguage(next);
      // The link carries its language, so the URL (and the copied link) follows the
      // switch instead of drifting away from what is on screen.
      const url = new URL(window.location.href);
      url.searchParams.set("lang", next);
      window.history.replaceState(null, "", url.toString());
      renderSimView(sim);
    });
  });

  const copyButton = view.querySelector("[data-sim-copy]");
  if (copyButton) {
    copyButton.addEventListener("click", async () => {
      const done = () => {
        copyButton.textContent = t("sim.copied");
        copyButton.classList.add("is-done");
        window.setTimeout(() => {
          copyButton.textContent = t("sim.copy");
          copyButton.classList.remove("is-done");
        }, 1800);
      };
      try {
        await navigator.clipboard.writeText(window.location.href);
        done();
      } catch (e) {
        // Clipboard needs a secure context; select the URL instead of failing silently.
        window.prompt(t("sim.copy"), window.location.href);
      }
    });
  }

  document.title =
    sim.mode === "default" ? "Sotheby's Mansion" : `${title} · Sotheby's Mansion`;
}

// Start
initApp().then(() => {
  if (!isSimPage()) return;
  const sim = readSimParams();
  if (sim.lang && sim.lang !== currentLang) {
    setLanguage(sim.lang).then(() => renderSimView(sim));
    return;
  }
  renderSimView(sim);
});
