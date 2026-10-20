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

function setLanguage(lang) {
  if (!SUPPORTED_LANGS.includes(lang)) return;
  currentLang = lang;
  localStorage.setItem(LANG_STORAGE_KEY, lang);
  document.documentElement.setAttribute("lang", lang === "cn" ? "zh-Hans" : lang);
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
// id 1 of each rarity is a special "count-only" chube
const PSYCHUBE_SPECIAL_IDS = ["1"];
let psychubeDb = {};        // { "6:1": { rarity, id, name, nameCn, tags, releasePatch, iconUrl } }
let psychubeOrder = [];     // ordered keys for stable listing
let userPsychubes = {};     // { "6:1": { owned, level, amplification, count } }
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
    const [rarityRes, arcanistRes, euphoriaRes, futureRes, excludeRes, afflatusRes, resoShapeRes, shapePatternRes, i18nRes, nameMapRes, psychubeRes, collabRes, nameTransferRes, teamArchRes, guideBuildsRes, guideRotationsRes, guideSkillsRes, guideProgRes, creditsRes] = await Promise.all([
      fetch("data/characters_by_rarity.json"),
      fetch("data/ArcanistMap.json"),
      fetch("data/euphoria_list.json"),
      fetch("data/future_sight.json").catch(() => null),
      fetch("data/exclude_character.json").catch(() => null),
      fetch("data/characters_by_afflatus.json").catch(() => null),
      fetch("data/character_reso_shape.json").catch(() => null),
      fetch("data/shape_patterns.json").catch(() => null),
      fetch("data/i18n.json").catch(() => null),
      fetch("data/name_map.json").catch(() => null),
      fetch("data/psychube_id.json").catch(() => null),
      fetch("data/collab_character.json").catch(() => null),
      fetch("data/global_name_transfer.json").catch(() => null),
      fetch("data/team_archetypes.json").catch(() => null),
      fetch("data/guide_builds.json").catch(() => null),
      fetch("data/guide_rotations.json").catch(() => null),
      fetch("data/guide_skills.json").catch(() => null),
      fetch("data/characters_progressions.json").catch(() => null),
      fetch("data/credits.json").catch(() => null),
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

    try {
      const euphoriaData = await euphoriaRes.json();
      buildEuphoriaMap(euphoriaData);
    } catch (e) {
      console.warn("Could not parse euphoria_list.json", e);
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
    loadRotationList();
    buildCredits(await readJson(creditsRes));

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
  if (sanitizePsychubeState()) savePsychubes();
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

function buildEuphoriaMap(euphoriaData) {
  euphoriaOptionsByName = {};
  euphoriaNamesByTier = {};
  euphoriaAllowedNames = new Set();

  if (!euphoriaData || typeof euphoriaData !== "object") return;

  Object.entries(euphoriaData).forEach(([level, names]) => {
    if (!Array.isArray(names)) return;
    const tier = Number(level);
    if (!Number.isInteger(tier) || tier < 1 || tier > 2) return;

    names.forEach((rawEntry) => {
      // rawEntry can be "CharacterName: EuphoriaName" or just "CharacterName"
      let rawName = rawEntry;
      let euName = "";
      if (typeof rawEntry === "string" && rawEntry.includes(":")) {
        const parts = rawEntry.split(":");
        rawName = parts[0].trim();
        euName = parts[1].trim();
      }

      const canonical = resolveCharacterName(rawName);
      if (!canonical) return;
      if (!euphoriaOptionsByName[canonical]) euphoriaOptionsByName[canonical] = [];
      if (!euphoriaNamesByTier[canonical]) euphoriaNamesByTier[canonical] = {};

      if (!euphoriaOptionsByName[canonical].includes(tier)) {
        euphoriaOptionsByName[canonical].push(tier);
      }
      if (euName) {
        euphoriaNamesByTier[canonical][tier] = euName;
      }
      euphoriaAllowedNames.add(canonical);
    });
  });

  Object.keys(euphoriaOptionsByName).forEach((name) => {
    euphoriaOptionsByName[name].sort((a, b) => a - b);
  });
}

function getEuphoriaDisplayName(name, tier) {
  const canonical = resolveCharacterName(name);
  const specificName = euphoriaNamesByTier[canonical] && euphoriaNamesByTier[canonical][tier];
  const tag = fmtEuphoria(tier);
  if (specificName) {
    return `${euphoriaEffectName(specificName)} (${tag})`;
  }
  return `Euphoria ${tier} (${tag})`;
}

/** Localises a Euphoria effect name (e.g. "General" -> 一般). */
function euphoriaEffectName(effect) {
  if (!effect) return effect;
  const key = `euphoria.${effect}`;
  const translated = t(key);
  return translated === key ? effect : translated;
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
          : `
            <div class="ct-row"><span class="ct-label">${t("chube.level")}</span><span class="ct-value">${Number(state.level) || 1}</span></div>
            <div class="ct-row"><span class="ct-label">${t("chube.amplification")}</span><span class="ct-value">${fmtAmp(Number(state.amplification) || PSYCHUBE_MIN_AMP)}</span></div>
          `}
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
          <div class="ct-row"><span class="ct-label">${t("card.insight")}</span><span class="ct-value">${fmtInsight(insightVal)}</span></div>
          <div class="ct-row"><span class="ct-label">${t("card.level")}</span><span class="ct-value">${fmtLevel(levelVal)}</span></div>
          <div class="ct-row"><span class="ct-label">${t("card.resonance")}</span><span class="ct-value">${fmtResonance(char.resonance)}</span></div>
          <div class="ct-row"><span class="ct-label">${t("card.portrait")}</span><span class="ct-value">${fmtPortrait(char.portrait)}</span></div>
          ${euphoriaRowHtml}
          ${patternRowHtml}
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
    labelTextE1.textContent = getEuphoriaDisplayName(currentEditingName || "", 1);
  }
  if (labelTextE2) {
    labelTextE2.textContent = getEuphoriaDisplayName(currentEditingName || "", 2);
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

  document.querySelectorAll(".manage-tab").forEach((btn) => {
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
function applyRecommendedVariant(team, variant) {
  if (!team || !variant) return;
  const members = variant.members.slice();
  const essentials = members.filter((m) => m.isEssential);
  const rest = members.filter((m) => !m.isEssential);
  const ordered = essentials.concat(rest).slice(0, TEAM_SLOT_COUNT);

  const slots = createEmptyTeamSlots();
  ordered.forEach((member, i) => {
    slots[i] = preferredVariantChoice(member);
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
      btnAction.className = "btn preset-add-btn";
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

  const variants = recommendedVariantsForTeam(team);

  // Regroup the flat list by archetype so several variants share one block
  const groups = [];
  variants.forEach((v) => {
    let g = groups.find((x) => x.presetName === v.presetName);
    if (!g) { g = { presetName: v.presetName, variants: [] }; groups.push(g); }
    g.variants.push(v.members);
  });

  renderArchetypeBlocks(body, groups, {
    emptyText: t("team.noRecommendations"),
    // The team being recommended for is not a conflict — only OTHER teams count
    usedSet: usedMarkerSet(teamRecommendTeamId),
    onToggle: (presetName) => {
      if (teamCollapsedGroups.has(presetName)) teamCollapsedGroups.delete(presetName);
      else teamCollapsedGroups.add(presetName);
      renderTeamRecommend();
    },
    actionLabel: t("team.use"),
    onAction: (presetName, members) => {
      applyRecommendedVariant(team, { presetName, members });
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

/** Team-archetype tags a build or a rotation can carry. */
const ROTATION_ARCHETYPES = [
  "Burn", "HP Sacrifice", "Poison", "Ritual", "Rank Up", "Extra Action", "Bloodtithe",
  "Dynamo", "Inspiration", "Lingering Glow", "Shift", "Conduit", "Pursuit",
];

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

/* ---------------- Credits ---------------- */

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
    .filter((name) => futureSightEnabled || !futureSightChars.has(name))
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
 * Shows or hides the character list, so the build can use the full modal.
 * Works at every resolution; the choice is kept while the page is open.
 */
let buildsListVisible = true;

function openBuildsModal() {
  renderBuilds();
  document.getElementById("builds-modal").style.display = "flex";
  // Remember the list visibility across openings.
  setBuildsListVisible(buildsListVisible);
}

function closeBuildsModal() {
  document.getElementById("builds-modal").style.display = "none";
}

function setBuildsListVisible(visible) {
  buildsListVisible = !!visible;
  const body = document.querySelector("#builds-modal .builds-body");
  if (body) body.classList.toggle("is-list-hidden", !buildsListVisible);

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
      buildsSelected = row.dataset.name;
      renderBuilds();
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

function renderBuildsDetail() {
  const host = document.getElementById("builds-detail");
  if (!host) return;

  const name = buildsSelected;
  if (!name) {
    host.innerHTML = guideEmptyState("builds.select");
    return;
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
            )}">${escapeHtml(label)}</button>`
        )
        .join("")
    : `<span class="builds-muted">${escapeHtml(t("builds.noData"))}</span>`;

  const patternIcon = build.pattern ? getPatternIconPath(name, build.pattern) : "";
  const patternHtml = build.pattern
    ? `<div class="build-pattern">
         ${patternIcon ? `<img src="${escapeHtml(patternIcon)}" alt="" />` : ""}
         <span class="build-pattern-name" style="color:${getResonanceTextColor(build.pattern)}">${escapeHtml(
           build.pattern
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
                   ? `<span class="build-chart-label">${escapeHtml(chart.label)}</span>`
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

  host.innerHTML = `
    <div class="builds-hero" style="--build-accent:${accent}">
      <span class="builds-hero-portrait"><img src="${escapeHtml(characterDb[name] || "")}" alt="" /></span>
      <div class="builds-hero-text">
        <div class="builds-hero-head">
          <h3 class="builds-hero-name">${escapeHtml(displayCharName(name))}</h3>
          <span class="builds-hero-stars" style="color:${accent}">${"✦".repeat(rarity)}</span>
        </div>
      </div>
    </div>

    <div class="builds-grid${singleColumn ? " is-single" : ""}${stacked ? " is-stacked" : ""}">
      ${chartSection}
      ${sideSections ? `<div class="builds-column">${sideSections}</div>` : ""}
    </div>

    ${
      build.notes
        ? `<div class="build-notes-box">
             <span class="build-notes-label">${escapeHtml(t("builds.notes"))}</span>
             <p class="build-notes">${escapeHtml(build.notes)}</p>
           </div>`
        : ""
    }
  `;

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
  if (Array.isArray(rotation.archetypes)) return rotation.archetypes.filter(Boolean);
  return rotation.archetype ? [rotation.archetype] : [];
}

function rotationsVisible() {
  const input = document.getElementById("rotations-search");
  const query = (input ? input.value : "").trim().toLowerCase();
  return rotationEntries().filter((rotation) => {
    const archetypes = rotationArchetypes(rotation);
    if (rotationArchetypeFilter.size > 0 && !archetypes.some((a) => rotationArchetypeFilter.has(a))) return false;
    if (!query) return true;
    const haystack = [
      rotation.name || "",
      rotation.tuning || "",
      ...archetypes,
      ...rotationMembers(rotation).map((m) => displayCharName(m.character)),
      rotation.notes || "",
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

  // The list is always visible now, so the back button is not needed.
  const back = document.getElementById("rotations-back");
  if (back) back.hidden = true;
}

/** Shows or hides the rotation list, so the plan can use the full modal. */
let rotationsListVisible = true;

function setRotationsListVisible(visible) {
  rotationsListVisible = !!visible;
  const body = document.querySelector("#rotations-modal .rotations-body");
  if (body) body.classList.toggle("is-list-hidden", !rotationsListVisible);

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
  rotationsSelected = null;
  setRotationsView("browse");
  renderRotations();
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

function openRotationPresetsModal() {
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

  host.innerHTML = rotationPresets.length
    ? rotationPresets
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
    : guideEmptyState("rotations.presetsEmpty");

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
 * be both AP Free and Precast and the badge is drawn once per group.
 */
const ROT_SLOT_TAGS = [
  { key: "ap-free", label: "AP Free", kind: "badge" },
  { key: "precast", label: "Precast", kind: "plaque" },
  { key: "move", label: "Move", kind: "plaque" },
  { key: "merge", label: "Merge", kind: "inline" },
];

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

/** Skill 3 is the ultimate for every character; `frame` overrides either way. */
function rotationCardIsUltimate(card) {
  if (!card) return false;
  if (card.frame === "ultimate") return true;
  if (card.frame === "normal") return false;
  if (card.special) return false;
  return Number(card.skill) === 3;
}

/** One skill card: character art, or a special card with no owner. */
function rotationCardHtml(card, variant) {
  if (!card) return "";
  const cls = ["rot-card"];
  if (variant === "lb") cls.push("is-lb");
  if (rotationCardIsUltimate(card)) cls.push("is-ultimate");
  if (card.preferred) cls.push("is-preferred");
  const className = cls.join(" ");
  if (card.special) {
    return `<span class="${className}"><img class="rot-card-art" src="${escapeHtml(card.special)}" alt="" /></span>`;
  }
  const char = resolveCharacterName(card.character) || card.character;
  // A pinned icon wins: it keeps the exact variant the author picked.
  const icon = card.icon || guideSkillIcon(char, card.skill);
  const frame = rotationCardIsUltimate(card)
    ? `<img class="rot-card-frame" src="images/card_modulo/Ultimate.png" alt="" />`
    : "";
  return `<span class="${className}" title="${escapeHtml(displayCharName(char))}">
      ${frame}
      <img class="rot-card-art" src="${escapeHtml(icon)}" alt="" />
    </span>`;
}

/** A slot renders by type: normal AP, either/or AP, a quarter-size LB card, or text. */
const SLOT_TYPE_LABELS = {
  normal: "AP",
  or: "OR",
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
  const inline = infos.find((tag) => tag.kind === "inline");
  const overlay =
    (badge ? `<span class="rot-tag-badge">${escapeHtml(badge.label)}</span>` : "") +
    plaques.map((tag) => `<span class="rot-tag-plaque">${escapeHtml(tag.label)}</span>`).join("");

  const wrap = (inner, extraClass = "") =>
    `<span class="rot-slot${extraClass}"><span class="rot-slot-body">${overlay}${inner}</span><span class="rot-slot-type${
      type === "normal" ? " is-plain" : ""
    }">${escapeHtml(label)}</span></span>`;

  if (type === "text") {
    const text = slot.text || "";
    if (!text) return `<span class="rot-slot is-empty"><span class="rot-slot-body"></span></span>`;
    return wrap(`<span class="rot-slot-text">${escapeHtml(text)}</span>`, " is-text");
  }

  if (cards.length === 0) return `<span class="rot-slot is-empty"><span class="rot-slot-body">${overlay}</span></span>`;

  if (type === "lb") {
    return wrap(rotationCardHtml(cards[0], "lb"), " is-lb");
  }

  if (type === "or") {
    // The second card peeks out behind the first: together they take the same
    // room as one normal card.
    const front = cards[0] ? rotationCardHtml(cards[0]) : "";
    const behind = cards[1]
      ? `<span class="rot-card is-behind"><img class="rot-card-art" src="${escapeHtml(
          cards[1].icon || guideSkillIcon(cards[1].character, cards[1].skill)
        )}" alt="" /></span>`
      : "";
    return wrap(
      `<span class="rot-or-stack">${front}${behind}</span>${inline ? `<span class="rot-tag-inline">${escapeHtml(inline.label)}</span>` : ""}`,
      " is-or"
    );
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

  return wrap(rotationCardHtml(cards[0]) + (inline ? `<span class="rot-tag-inline">${escapeHtml(inline.label)}</span>` : ""));
}

/**
 * Draws the bracket / box / fork connector for every callout, from the cards it
 * points at down to its text box. Runs after layout because the spans follow
 * the card widths, which the CSS alone cannot know.
 */
function drawRotationConnectors(root = document) {
  const NS = "http://www.w3.org/2000/svg";
  for (const node of root.querySelectorAll(".rot-annotation")) {
    const rail = node.querySelector(".rot-annotation-rail");
    if (!rail) continue;
    const round = node.closest(".rot-round");
    const slots = [...(round?.querySelectorAll(".rot-round-slots > .rot-slot") || [])];
    const from = slots[Number(node.dataset.from)];
    const to = slots[Number(node.dataset.to)] || from;
    if (!from || !to) continue;

    const base = rail.getBoundingClientRect();
    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    const x1 = a.left + a.width / 2 - base.left;
    const x2 = b.left + b.width / 2 - base.left;
    const left = Math.min(x1, x2);
    const right = Math.max(x1, x2);
    const mid = (left + right) / 2;
    const style = node.dataset.style || "bracket";
    const height = rail.clientHeight || 12;

    const line = (d) => {
      const path = document.createElementNS(NS, "path");
      path.setAttribute("d", d);
      path.setAttribute("class", "rot-connector");
      rail.appendChild(path);
    };

    rail.replaceChildren();
    if (style === "box") {
      line(`M ${mid} 0 V ${height}`);
    } else if (style === "fork") {
      line(`M ${left} 0 V 5 H ${right} V 0`);
      line(`M ${mid} 5 V ${height}`);
    } else {
      // Ticks up toward the cards, a bar under them, then a stem to the note.
      line(`M ${left} 0 V 6 H ${right} V 0`);
      line(`M ${mid} 6 V ${height}`);
    }

    // The note box is centred under its bracket, so the stem lands on its top
    // edge instead of somewhere off to the left.
    const textNode = node.querySelector(".rot-annotation-text");
    if (textNode) {
      textNode.style.marginLeft = "0px";
      const width = textNode.getBoundingClientRect().width;
      const limit = Math.max(0, node.clientWidth - width);
      textNode.style.marginLeft = `${Math.max(0, Math.min(limit, mid - width / 2))}px`;
    }
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

function renderRotationsDetail() {
  const host = document.getElementById("rotations-detail");
  if (!host) return;

  const rotation = rotationEntry(rotationsSelected);
  if (!rotation) {
    host.innerHTML = guideEmptyState("rotations.select");
    return;
  }

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
          const showPortraitBar = !displayOptions.hidePortrait;
          return `
            <span class="rot-member">
              <span class="rot-member-avatar">
                <span class="rot-member-portrait">
                  <img src="${escapeHtml(characterDb[member.character] || "")}" alt="" />
                </span>
                ${
                  showPortraitBar
                    ? `<span class="rot-member-portrait-bar">${rotationPortraitDashesHtml(member.portrait, rarity)}</span>`
                    : ""
                }
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
        .map((round, index) => {
          const slots = Array.isArray(round.slots) ? round.slots : [];
          const slotsHtml = slots.length
            ? slots.map(rotationSlotHtml).join("")
            : `<span class="builds-muted">${escapeHtml(t("builds.noData"))}</span>`;

          // A callout underlines the cards it explains, so its ends are slot
          // indices rather than free text in the round header.
          const annotations = Array.isArray(round.annotations) ? round.annotations : [];
          const annotationsHtml = annotations.length
            ? `<div class="rot-annotations">${annotations
                .map((annotation) => {
                  const text = String(annotation.text || "").trim();
                  if (!text) return "";
                  const last = Math.max(0, slots.length - 1);
                  const from = Math.max(0, Math.min(last, Number(annotation.from) || 0));
                  const to = Math.max(from, Math.min(last, Number(annotation.to) || 0));
                  const style = ["bracket", "box", "fork"].includes(annotation.style) ? annotation.style : "bracket";
                  return `<div class="rot-annotation is-${style}" data-from="${from}" data-to="${to}" data-style="${style}">
                      <svg class="rot-annotation-rail" aria-hidden="true"></svg>
                      <span class="rot-annotation-text">${escapeHtml(text)}</span>
                    </div>`;
                })
                .join("")}</div>`
            : "";

          return `
            <div class="rot-round">
              <div class="rot-round-head">
                <span class="rot-round-label">${escapeHtml(t("rotations.round", { n: String(index + 1).padStart(2, "0") }))}</span>
                ${round.note ? `<span class="rot-round-note">${escapeHtml(round.note)}</span>` : ""}
              </div>
              <div class="rot-round-slots">${slotsHtml}</div>
              ${annotationsHtml}
            </div>`;
        })
        .join("")
    : guideEmptyState("rotations.empty");

  host.innerHTML = `
    <div class="rot-hero">
      <h3 class="rot-hero-name">${escapeHtml(rotation.name || rotation.id || "")}</h3>
      ${
        archetypes.length
          ? `<div class="rot-hero-tags">${archetypes
              .map((tag) => `<span class="rot-hero-tag">${escapeHtml(tag)}</span>`)
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
             <p class="build-notes">${escapeHtml(rotation.notes)}</p>
           </section>`
        : ""
    }

    <section class="rot-block">
      ${guideSectionHeader("rotations.rounds")}
      <div class="rot-rounds">${roundsHtml}</div>
    </section>
  `;

  // The tuning notes only have a size once they are in the document, and the
  // callout connectors need the final card widths.
  requestAnimationFrame(() => {
    fitRotationTuningNotes(host);
    drawRotationConnectors(host);
  });
}

// Card widths change with the viewport, so the connectors are redrawn on resize.
window.addEventListener("resize", () => {
  const modal = document.getElementById("rotations-modal");
  if (modal && modal.style.display === "flex") drawRotationConnectors();
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

function setupGuideListeners() {
  const buildsBtn = document.getElementById("btn-builds");
  const buildsModal = document.getElementById("builds-modal");
  if (buildsBtn && buildsModal) {
    buildsBtn.addEventListener("click", openBuildsModal);
    document.getElementById("builds-btn-close").addEventListener("click", closeBuildsModal);
    buildsModal.addEventListener("click", (e) => {
      if (e.target === buildsModal) closeBuildsModal();
    });

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

    const presetsModal = document.getElementById("rotation-presets-modal");
    const presetsClose = document.getElementById("rotation-presets-btn-close");
    if (presetsClose) presetsClose.addEventListener("click", closeRotationPresetsModal);
    if (presetsModal) {
      presetsModal.addEventListener("click", (e) => {
        if (e.target === presetsModal) closeRotationPresetsModal();
      });
    }
  }
}

// Event Listeners
function setupEventListeners() {
  setupPatternTooltip();
  setupTierCountTooltip();
  setupGuideListeners();
  setupCreditsListeners();

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

  function openOptionsModal() {
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

    optionsModal.style.display = "flex";
  }

  function closeOptionsModal() {
    optionsModal.style.display = "none";
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

  btnOptions.addEventListener("click", openOptionsModal);
  optionsBtnClose.addEventListener("click", closeOptionsModal);
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

  function openCustomizeModal() {
    syncAppearanceFormWithState(displayOptions.appearance || DEFAULT_THEME_APPEARANCE);
    customizeModal.style.display = "flex";
  }

  function closeCustomizeModal() {
    customizeModal.style.display = "none";
  }

  btnCustomize.addEventListener("click", openCustomizeModal);
  customizeBtnClose.addEventListener("click", closeCustomizeModal);
  customizeBtnDone.addEventListener("click", () => {
    displayOptions.appearance = readAppearanceForm();
    saveDisplayOptions();
    applyCustomAppearance();
    renderShowcase();
    closeCustomizeModal();
  });

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
  const btnAddPresetTier = document.getElementById("btn-add-preset-tier");
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

  function openListingModal() {
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
    listingModal.style.display = "flex";
  }

  function closeListingModal() {
    listingModal.style.display = "none";
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

  if (btnAddPresetTier) {
    btnAddPresetTier.addEventListener("click", () => {
      // The Unbuilt preset also lands at the top
      tempListingTiers.unshift({
        id: "tier_preset_unbuilt_" + Date.now(),
        label: t("label.unbuilt"),
        color: "#9a9a9a",
        ruleGroups: [[
          { field: "insight", op: "=", value: 0 },
          { field: "level", op: "=", value: 1 },
          { field: "resonance", op: "=", value: 1 },
        ]],
      });
      renderListingTiersEditor();
    });
  }

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

  btnListing.addEventListener("click", openListingModal);
  listingBtnClose.addEventListener("click", closeListingModal);
  listingModal.addEventListener("click", (e) => {
    if (e.target === listingModal) closeListingModal();
  });

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

  // Mobile Tools Drawer Toggle Button
  const btnToolsToggle = document.getElementById("btn-tools-toggle");
  const topControls = document.getElementById("top-controls");
  if (btnToolsToggle && topControls) {
    btnToolsToggle.addEventListener("click", () => {
      const isOpen = topControls.classList.toggle("tools-open");
      btnToolsToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
      const icon = btnToolsToggle.querySelector(".toggle-icon");
      if (icon) icon.textContent = isOpen ? "▴" : "▾";
      // The drawer switcher only has a measurable size once it is visible.
      if (isOpen) refreshSlidingThumbs();
    });
  }

  // Keep the highlights aligned when the layout reflows.
  window.addEventListener("resize", refreshSlidingThumbs);

  // Roster Manager
  btnManageAll.addEventListener("click", openRosterModal);
  rosterBtnClose.addEventListener("click", closeRosterModal);
  rosterModal.addEventListener("click", (e) => {
    if (e.target === rosterModal) closeRosterModal();
  });
  rosterSearch.addEventListener("input", renderRosterManager);

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

  // Manage modal tabs: Characters (default) / Psychubes
  document.querySelectorAll(".manage-tab").forEach((btn) => {
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
  const exportHelpTip = document.getElementById("export-help-tip");

  let currentExportBlob = null;
  let currentExportBlobUrl = null;
  let currentExportFileName = "";

  function closeExportModal() {
    if (exportModal) exportModal.style.display = "none";
  }

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

      const fileName = `Sothebys_Mansion_${new Date().toISOString().slice(0, 10)}.png`;
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
      const isSmallScreen = window.innerWidth <= 768;
      const isMobile = isIOS || isMobileDevice || isSmallScreen;

      // 4. Try native Web Share API capability
      let canShareFile = false;
      let shareFile = null;
      if (typeof File !== "undefined" && navigator.canShare) {
        try {
          shareFile = new File([blob], fileName, { type: "image/png" });
          canShareFile = navigator.canShare({ files: [shareFile] });
        } catch (e) {
          canShareFile = false;
        }
      }

      // If desktop, trigger download directly
      if (!isMobile) {
        triggerDownload(currentExportBlobUrl, fileName);
        return;
      }

      // On Android / Mobile:
      // Try auto-downloading directly first (so the image is immediately saved into Downloads / Gallery)
      if (!isIOS) {
        try {
          triggerDownload(currentExportBlobUrl, fileName);
        } catch (dlErr) {
          console.warn("Auto download failed:", dlErr);
        }
      }

      // Always display preview modal on mobile with buttons: Download, Share (if supported), Close
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
    } catch (err) {
      console.error("Export failed:", err);
      alert("Failed to export image. Please try again.");
    } finally {
      setButtonLabel(btnExportImage, t("action.exportPng"));
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

// Start
initApp();
