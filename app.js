// Keys & State
const STORAGE_KEY = "r1999_character_roster_v2";

let characterDb = {}; // { "Name": "images/headicon_small/..." }
let characterRarityMap = {}; // { "Name": 6 }
let characterIdMap = {}; // { "Name": 3003 }
let euphoriaOptionsByName = {}; // { "Name": [1,2] }
let euphoriaNamesByTier = {}; // { "Name": { 1: "Pursuit", 2: "Conduit" } }
let euphoriaAllowedNames = new Set();
let characterAfflatus = {}; // { "Name": "Beast" | "Plant" | "Star" | "Mineral" | "Spirit" | "Intellect" | "Mineral_Star" }
let futureSightData = { Character: [], Euphoria: [], Skin: [] };
let futureSightChars = new Set();
let futureSightEuphorias = new Map(); // name -> Set of future tiers e.g. "37" -> Set([1])
let futureSightSkins = new Set(); // Set of skin IDs (Numbers) exclusive to future sight
let excludedCharacters = new Set(); // Set of character names to exclude
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

const DEFAULT_TIERS_CONFIG = {
  tiers: [
    { id: "tier_r15", label: "R15", color: "#d1783d", ruleGroups: [[{ field: "resonance", op: "=", value: 15 }]] },
    { id: "tier_r11_14", label: "R11 - 14", color: "#6d9b6c", ruleGroups: [[{ field: "resonance", op: ">=", value: 11 }, { field: "resonance", op: "<=", value: 14 }]] },
    { id: "tier_r10", label: "R10", color: "#d7d7d7", ruleGroups: [[{ field: "resonance", op: "=", value: 10 }]] },
    { id: "tier_r1_9", label: "R1 - 9", color: "#4a77c9", ruleGroups: [[{ field: "resonance", op: ">=", value: 1 }, { field: "resonance", op: "<=", value: 9 }]] },
    { id: "tier_other", type: "other", label: "Other", color: "#a0a0a0", bgColor: null, borderColor: null, bold: false },
    { id: "tier_unowned", type: "unowned", label: "Unowned", color: "#9a9a9a", bgColor: null, borderColor: null, bold: false },
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
      label: listingConfig.otherLabel || "Other",
      color: listingConfig.otherColor || "#a0a0a0",
      bgColor: listingConfig.otherBg || null,
      borderColor: listingConfig.otherBorder || null,
      bold: !!listingConfig.otherBold,
    });
  }
  const hasUnowned = list.some((t) => t.type === "unowned" || t.id === "tier_unowned");
  if (!hasUnowned) {
    list.push({
      id: "tier_unowned",
      type: "unowned",
      label: listingConfig.unownedLabel || "Unowned",
      color: listingConfig.unownedColor || "#9a9a9a",
      bgColor: listingConfig.unownedBg || null,
      borderColor: listingConfig.unownedBorder || null,
      bold: !!listingConfig.unownedBold,
    });
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
const resonanceBoxChoices = document.querySelectorAll(".resonance-box-choice");

// Roster Manager Modal Elements
const rosterModal = document.getElementById("roster-modal");
const btnManageAll = document.getElementById("btn-manage-all");
const rosterBtnClose = document.getElementById("roster-btn-close");
const rosterSearch = document.getElementById("roster-search");
const rosterGridList = document.getElementById("roster-grid-list");
const rosterFilterRarityBtns = document.querySelectorAll("#roster-filter-rarity-group .filter-btn");
const btnSelectAll = document.getElementById("btn-select-all");
const btnSelectAllUnbuilt = document.getElementById("btn-select-all-unbuilt");
const btnSetAllP5 = document.getElementById("btn-set-all-p5");
const btnUnselectAll = document.getElementById("btn-unselect-all");

let rosterActiveRarityFilters = new Set(); // Set of active rarities in Roster Manager

// Action Buttons
const btnExportImage = document.getElementById("btn-export-image");
const btnExportData = document.getElementById("btn-export-data");
const inputImportFile = document.getElementById("input-import-file");
const btnResetData = document.getElementById("btn-reset-data");

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
  customPortraitColorsEnabled: true,
  portraitColorR6: "#DD9925",
  portraitColorR5: "#C7AF6C",
  portraitColorR4: "#6A4972",
  portraitColorR3: "#545C7D",
  portraitColorR2: "#496441",
  patternNone: "#4F4F4F",
  patternOffensive: "#FBAE31",
  patternDefensive: "#2D8A5A",
  patternHp: "#D4AD2B",
  patternEquibalance: "#3B6DC7",

  // Custom Resonance Label Color on Character Info
  customResColorEnabled: false,
  customResColor: "#ffffff",

  // Unowned Character Dimming
  unownedOpacity: 0.82,

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
  hideSkin: false,
  hideAfflatus: false,
  showPatternBg: false,
  showNonePatternBg: false,
  colorNonePatternBg: "#4F4F4F",
  showNonePatternBorder: false,
  colorNonePatternBorder: "#4F4F4F",
  showRarityLine: false,
  hideI3Lv60: false,
  hideI3Lv30: false,
  hideI2Lv50: false,
  customHideRules: [], // array of { id, insight: 3, level: 59, enabled: true }
  hideR15: false,
  hideR10: false,
  customResHideRules: [], // array of { id, resonance: 10, enabled: true }
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
      return "var(--primary-font)";
    case "arial":
      return 'Arial, "Helvetica Neue", Helvetica, sans-serif';
    case "georgia":
      return 'Georgia, "Noto Serif TC", serif';
    case "courier":
      return '"Courier New", Courier, monospace';
    case "default":
    default:
      return "var(--mono-font)";
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
  document.documentElement.style.setProperty("--unowned-char-opacity", app.unownedOpacity !== undefined ? app.unownedOpacity : 0.82);

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

function buildFutureSightMap(data) {
  futureSightChars = new Set();
  futureSightEuphorias = new Map();
  futureSightSkins = new Set();

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
    const [rarityRes, arcanistRes, euphoriaRes, futureRes, excludeRes, afflatusRes] = await Promise.all([
      fetch("data/characters_by_rarity.json"),
      fetch("data/ArcanistMap.json"),
      fetch("data/euphoria_list.json"),
      fetch("data/future_sight.json").catch(() => null),
      fetch("data/exclude_character.json").catch(() => null),
      fetch("data/characters_by_afflatus.json").catch(() => null),
    ]);

    if (excludeRes && excludeRes.ok) {
      try {
        const excludeData = await excludeRes.json();
        buildExcludeMap(excludeData);
      } catch (e) {
        console.warn("Could not parse exclude_character.json", e);
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

    loadTitle();
    loadListingConfig();
    loadFutureSightState();
    loadDisplayOptions();
    applyCustomAppearance();
    loadRoster();
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

  if (!Array.isArray(arcanistData)) return;

  arcanistData.forEach((item) => {
    if (!item || !item.id || item.id === 9998) return;

    const charName = CANONICAL_NAME_OVERRIDES[item.id] || item.nameEng || item.name;
    if (!charName) return;

    if (isCharacterExcluded(charName, item)) return;

    characterIdMap[charName] = item.id;
    if (item.nameEng) characterIdMap[item.nameEng] = item.id;
    if (item.name) characterIdMap[item.name] = item.id;

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
  if (specificName) {
    return `${specificName} (E${tier})`;
  }
  return `Euphoria ${tier} (E${tier})`;
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
        boxKind: "none",
        skin: null,
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
      if (userRoster[name].boxKind === undefined) {
        userRoster[name].boxKind = "none";
        changed = true;
      }
      if (userRoster[name].skin === undefined) {
        userRoster[name].skin = null;
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
  const boxKind = char.boxKind || "none";
  const hasEuphoria = !!(char.e1 || char.e2);
  const hasPattern = boxKind !== "none";
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
      <div>Owned: ${owned}/${total} (${Math.round(pct)}%)</div>
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
  let lv60Count = 0;
  let r10PlusCount = 0;
  let euphoCount = 0;

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
      if (Number(char.level) === 60) lv60Count++;
      if (Number(char.resonance) >= 10) r10PlusCount++;
      if (char.e1) euphoCount++;
      if (char.e2) euphoCount++;
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

  const unmatchedOwned = new Set(ownedNames);

  // Evaluate each tier in user's configured order
  tierBuckets.forEach((bucket) => {
    if (bucket.type === "unowned") {
      // Unowned characters are placed here
      if (activeOwnershipFilter !== "owned") {
        unownedNames.forEach((name) => {
          if (query && !name.toLowerCase().includes(query)) return;
          const char = userRoster[name] || {
            owned: false,
            insight: 3,
            level: 60,
            resonance: 10,
            portrait: 0,
            e1: false,
            e2: false,
            boxKind: "none",
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
          if (query && !name.toLowerCase().includes(query)) return;
          const char = {
            ...(userRoster[name] || {
              owned: true,
              insight: 3,
              level: 60,
              resonance: 10,
              portrait: 0,
              e1: false,
              e2: false,
              boxKind: "none",
            }),
            name: name,
          };
          const iconUrl = characterDb[name];
          const card = createCharacterCard(name, char, iconUrl);
          bucket.cards.push(card);
          unmatchedOwned.delete(name);
        });
      }
    } else {
      // Custom tier: matches owned characters that satisfy ruleGroups
      if (activeOwnershipFilter !== "unowned") {
        const currentCandidates = [...unmatchedOwned];
        currentCandidates.forEach((name) => {
          if (query && !name.toLowerCase().includes(query)) return;
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
              boxKind: "none",
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

  // Render all tier sections in the exact order configured
  tierBuckets.forEach((bucket) => {
    // For Unowned tier, render if ownership filter allows (even if empty) or if has cards
    if (bucket.type === "unowned") {
      if (activeOwnershipFilter !== "owned") {
        renderTierRowSection(bucket.label, bucket.color, bucket.cards, bucket.bgColor, bucket.borderColor, bucket.bold);
      }
    } else if (bucket.cards.length > 0) {
      renderTierRowSection(bucket.label, bucket.color, bucket.cards, bucket.bgColor, bucket.borderColor, bucket.bold);
    }
  });

  rosterStat.textContent = `${ownedCount}/${totalCount} Owned`;
  rosterStat.removeAttribute("title");

  const rosterStatTooltip = document.getElementById("roster-stat-tooltip");
  if (rosterStatTooltip) {
    rosterStatTooltip.innerHTML = `
      <div>Lv. 60: ${lv60Count}</div>
      <div>R10+: ${r10PlusCount}</div>
      <div>Eupho unlocked: ${euphoCount}</div>
    `;
  }

  renderChessPieces();
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

  const contentEl = document.createElement("div");
  contentEl.className = "tier-content";

  cards.forEach((card) => contentEl.appendChild(card));

  section.appendChild(labelEl);
  section.appendChild(contentEl);
  tierRowsContainer.appendChild(section);
}

function getPatternDisplayName(boxKind) {
  switch (boxKind) {
    case "offensive": return "Offensive";
    case "defensive": return "Defensive";
    case "hp": return "Stupefaction";
    case "equibalance": return "Equibalance";
    default: return "";
  }
}

// Create Character Card Element
function createCharacterCard(name, char, iconUrl) {
  const card = document.createElement("div");
  card.className = `char-card ${!char.owned ? "is-unowned" : ""}`;
  const insightVal = char.insight !== undefined ? char.insight : 3;
  const levelVal = char.level !== undefined ? char.level : 60;
  const rarityVal = getCharacterRarity(name);
  const rarityStars = "✦".repeat(rarityVal || 0);

  // Euphoria / Pattern string e.g. "E1 E2" or "E1" or "E2"
  let euphoriaText = "";
  if (char.e2 && char.e1) euphoriaText = "E1 E2";
  else if (char.e2) euphoriaText = "E2";
  else if (char.e1) euphoriaText = "E1";

  const boxKind = char.boxKind || "none";
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
    topHeaderHtml = `<div class="char-top-info">${!displayOptions.hideNames ? `<span class="char-unowned-name">${escapeHtml(name)}</span>` : ""}</div>`;
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
    topHeaderHtml = `
      <div class="char-top-info">
        ${showResonance ? `<span class="badge-resonance ${boxKind}" style="color: ${resonanceColor};">R${char.resonance}</span>` : `<span></span>`}
        ${showEuphoria ? `<span class="badge-euphoria">${euphoriaText}</span>` : ""}
      </div>
    `;
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
  const showLevel = !displayOptions.hideLevel && !isHiddenByPreset;

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

  const rarityLineHtml = displayOptions.showRarityLine ? `
    <div class="char-rarity-line rarity-${rarityVal}"></div>
  ` : "";

  const avatarUrl = getCardAvatarUrl(name, char, iconUrl);

  const avatarImgStyles = [];
  if (char.owned) {
    if (boxKind && boxKind !== "none") {
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
      <img src="images/afflatus_icon/${afflatus}.png" alt="${afflatus}" title="${afflatus}" />
    </div>
  ` : "";
  const avatarImgStyle = avatarImgStyles.length > 0 ? ` style="${avatarImgStyles.join("; ")};"` : "";

  let tooltipHtml = "";
  if (!char.owned) {
    tooltipHtml = `
      <div class="char-tooltip no-export">
        <div>${escapeHtml(name)}</div>
        <div>Unowned</div>
      </div>
    `;
  } else {
    tooltipHtml = `
      <div class="char-tooltip no-export">
        <div>${escapeHtml(name)}</div>
        <div>Insight: I${insightVal} Lv.${levelVal}</div>
        <div>Resonance: R${char.resonance}</div>
        <div>Portrait: P${char.portrait}</div>
        ${euphoriaText ? `<div>Euphoria: ${euphoriaText}</div>` : ""}
      </div>
    `;
  }

  card.innerHTML = `
    ${topHeaderHtml}
    <div class="char-avatar-box">
      <img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(name)}" class="char-avatar-img"${avatarImgStyle} loading="lazy" onerror="this.onerror=null;this.src='${escapeHtml(characterDb[name])}'" />
      ${afflatusIconHtml}
      ${insightLevelOverlay}
    </div>
    ${rarityLineHtml}
    ${portraitBarHtml}
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
    boxKind: "none",
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

  tempEditState = {
    ...char,
    insight: insight,
    level: level,
    resonance: resonance,
    boxKind: char.boxKind || "none",
    e1: sanitizedEuphoria.e1,
    e2: sanitizedEuphoria.e2,
    skin: currentSkinId,
  };

  modalCharName.textContent = name;
  modalCharStatus.textContent = tempEditState.owned ? "Owned" : "Unowned";

  renderSkinSelector(name);
  updateModalView();
  editModal.style.display = "flex";
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
    btn.title = skin.name;

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
    displaySkin.textContent = selectedSkin ? selectedSkin.name : "Default";
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

  displayInsight.textContent = `I${currentInsight}`;
  document.querySelectorAll(".btn-pill-i").forEach((btn) => {
    const btnInsight = Number(btn.dataset.i);
    if (btnInsight > maxAllowedInsight) {
      btn.style.display = "none";
    } else {
      btn.style.display = "";
    }
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
  displayLevel.textContent = `Lv.${tempEditState.level}`;

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
  displayResonance.textContent = `R${tempEditState.resonance}`;
  displayResonance.style.color = getResonanceTextColor(tempEditState.boxKind || "none");

  // If resonance < 10, pattern is reset to none
  if (tempEditState.resonance < 10) {
    tempEditState.boxKind = "none";
  }

  document.querySelectorAll(".btn-pill").forEach((btn) => {
    const btnRes = Number(btn.dataset.r);
    if (btnRes > maxRes) {
      btn.style.display = "none";
    } else {
      btn.style.display = "";
    }
    const isActive = btnRes === tempEditState.resonance;
    btn.classList.toggle("active", isActive);
    btn.classList.remove("none", "offensive", "defensive", "hp", "equibalance");
    if (isActive) btn.classList.add(tempEditState.boxKind || "none");
  });

  resonanceBoxChoices.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.boxKind === (tempEditState.boxKind || "none"));
  });

  // Portrait
  displayPortrait.textContent = `P${tempEditState.portrait}`;
  document.querySelectorAll(".btn-pill-p").forEach((btn) => {
    btn.classList.toggle("active", Number(btn.dataset.p) === tempEditState.portrait);
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
  const patternHelpBox = document.getElementById("pattern-help-box");
  if (patternHelpBox) patternHelpBox.style.display = "none";
}

function saveEditModal() {
  if (!currentEditingName) return;
  const eligibleEuphoriaLevels = getEligibleEuphoriaLevels(currentEditingName);
  const meetsLevelRequirement = Number(tempEditState.insight) === 3 && Number(inputLevel.value) >= 30;
  const finalE1 = meetsLevelRequirement && eligibleEuphoriaLevels.includes(1) && checkE1.checked;
  const finalE2 = meetsLevelRequirement && eligibleEuphoriaLevels.includes(2) && checkE2.checked;

  userRoster[currentEditingName] = {
    owned: tempEditState.owned,
    insight: tempEditState.insight !== undefined ? tempEditState.insight : 3,
    level: Number(inputLevel.value),
    resonance: Number(inputResonance.value),
    portrait: tempEditState.portrait,
    e1: finalE1,
    e2: finalE2,
    boxKind: tempEditState.boxKind || "none",
    skin: tempEditState.skin,
  };
  saveRoster();
  renderShowcase();
  closeEditModal();
}

// Roster Manager Modal Functions
function openRosterModal() {
  renderRosterManager();
  rosterModal.style.display = "flex";
}

function closeRosterModal() {
  rosterModal.style.display = "none";
}

function renderRosterManager() {
  const query = rosterSearch.value.trim().toLowerCase();
  rosterGridList.innerHTML = "";

  // Sort characters strictly by: Rarity > Release Date Order (ArcanistMap ID descending)
  const sortedNames = Object.keys(characterDb).sort(compareUnownedCharacters);

  sortedNames.forEach((name) => {
    if (!futureSightEnabled && futureSightChars.has(name)) return;
    if (query && !name.toLowerCase().includes(query)) return;
    const rarity = getCharacterRarity(name);
    if (rosterActiveRarityFilters.size > 0 && !rosterActiveRarityFilters.has(rarity)) return;

    const char = userRoster[name] || { owned: true };
    const iconUrl = characterDb[name];

    const item = document.createElement("div");
    item.className = `roster-char-item ${char.owned ? "is-owned" : "not-owned"}`;
    item.innerHTML = `
      <div class="roster-avatar-box">
        <img src="${escapeHtml(iconUrl)}" alt="${escapeHtml(name)}" class="roster-avatar-img" />
      </div>
      <span class="roster-char-name">${escapeHtml(name)}</span>
    `;

    item.addEventListener("click", () => {
      char.owned = !char.owned;
      userRoster[name] = char;
      saveRoster();
      renderRosterManager();
      renderShowcase();
    });

    rosterGridList.appendChild(item);
  });
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

// Event Listeners
function setupEventListeners() {
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

  // Web Icon Lightbox Preview
  const btnWebIcon = document.getElementById("btn-web-icon");
  const webIconModal = document.getElementById("web-icon-modal");

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
    displayLevel.textContent = `Lv.${tempEditState.level}`;
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

  resonanceBoxChoices.forEach((btn) => {
    btn.addEventListener("click", () => {
      tempEditState.boxKind = btn.dataset.boxKind;
      updateModalView();
    });
  });

  // Portrait pills
  document.querySelectorAll(".btn-pill-p").forEach((btn) => {
    btn.addEventListener("click", () => {
      tempEditState.portrait = Number(btn.dataset.p);
      updateModalView();
    });
  });

  // Pattern help toggle
  const btnPatternHelp = document.getElementById("btn-pattern-help");
  const patternHelpBox = document.getElementById("pattern-help-box");
  btnPatternHelp.addEventListener("click", () => {
    const isShown = patternHelpBox.style.display !== "none";
    patternHelpBox.style.display = isShown ? "none" : "block";
  });

  // Euphoria checkbox change handlers to persist selection in state
  checkE1.addEventListener("change", () => {
    tempEditState.e1 = checkE1.checked;
  });
  checkE2.addEventListener("change", () => {
    tempEditState.e2 = checkE2.checked;
  });

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
  const checkHideLevel = document.getElementById("check-hide-level");
  const checkHideResonance = document.getElementById("check-hide-resonance");
  const checkHideEuphoria = document.getElementById("check-hide-euphoria");
  const checkHidePortrait = document.getElementById("check-hide-portrait");
  const checkHideNames = document.getElementById("check-hide-names");
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

  function renderOptionsPreviewCard() {
    if (!optionsCharPreviewCard) return;

    const hideInsight = checkHideInsight ? checkHideInsight.checked : false;
    const hideLevel = checkHideLevel ? checkHideLevel.checked : false;
    const hideResonance = checkHideResonance ? checkHideResonance.checked : false;
    const hideEuphoria = checkHideEuphoria ? checkHideEuphoria.checked : false;
    const hidePortrait = checkHidePortrait ? checkHidePortrait.checked : false;
    const hideNames = checkHideNames ? checkHideNames.checked : false;
    const hideSkin = checkHideSkin ? checkHideSkin.checked : false;
    const hideAfflatus = checkHideAfflatus ? checkHideAfflatus.checked : false;

    const charName = "Vertin";
    const rarityVal = 6;
    const insightVal = 3;
    const levelVal = 60;
    const resonanceVal = 10;
    const portraitVal = 5;
    const boxKind = "equibalance";
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
    const topHeaderHtml = `
      <div class="char-top-info">
        ${showRes ? `<span class="badge-resonance ${boxKind}" style="color: ${resonanceColor};">R${resonanceVal}</span>` : `<span></span>`}
        ${showEupho ? `<span class="badge-euphoria" style="color: ${euphoriaColor};">${euphoriaText}</span>` : ""}
      </div>
    `;

    const portraitBarHtml = !hidePortrait ? `
      <div class="char-portrait-bar-below">
        ${dashesHtml}
      </div>
    ` : "";

    const showIn = !hideInsight;
    const showLv = !hideLevel;
    const showAff = !hideAfflatus && !!previewAfflatus;

    const afflatusIconHtml = showAff ? `
      <div class="char-afflatus-icon">
        <img src="images/afflatus_icon/${previewAfflatus}.png" alt="${previewAfflatus}" title="${previewAfflatus}" />
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

    const rarityLineHtml = "";

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

    const nameBelowHtml = !hideNames ? `
      <div style="font-size: 0.62rem; font-family: var(--mono-font); text-align: center; color: var(--text-primary); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 60px;">${charName}</div>
    ` : "";

    optionsCharPreviewCard.innerHTML = `
      ${topHeaderHtml}
      <div class="char-avatar-box">
        <img src="${avatarImgSrc}" alt="${charName}" class="char-avatar-img"${avatarImgStyle} />
        ${afflatusIconHtml}
        ${insightLevelOverlay}
      </div>
      ${rarityLineHtml}
      ${portraitBarHtml}
      ${nameBelowHtml}
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
    checkHideLevel.checked = !!displayOptions.hideLevel;
    checkHideResonance.checked = !!displayOptions.hideResonance;
    checkHideEuphoria.checked = !!displayOptions.hideEuphoria;
    checkHidePortrait.checked = !!displayOptions.hidePortrait;
    checkHideNames.checked = !!displayOptions.hideNames;
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

    renderOptionsPreviewCard();

    tempCustomHideRules = JSON.parse(JSON.stringify(displayOptions.customHideRules || []));
    renderCustomHideRulesUI();

    tempCustomResHideRules = JSON.parse(JSON.stringify(displayOptions.customResHideRules || []));
    renderCustomResHideRulesUI();

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

      const check = document.createElement("input");
      check.type = "checkbox";
      check.checked = !!rule.enabled;
      check.addEventListener("change", () => {
        rule.enabled = check.checked;
      });

      const labelInsight = document.createElement("span");
      labelInsight.style.fontSize = "0.7rem";
      labelInsight.style.fontFamily = "var(--mono-font)";
      labelInsight.textContent = "Insight:";

      const selInsight = document.createElement("select");
      selInsight.className = "listing-tier-select";
      selInsight.style.minWidth = "60px";
      selInsight.style.padding = "4px";
      [0, 1, 2, 3].forEach((i) => {
        const opt = document.createElement("option");
        opt.value = i;
        opt.textContent = `I${i}`;
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

      row.appendChild(check);
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

      const check = document.createElement("input");
      check.type = "checkbox";
      check.checked = !!rule.enabled;
      check.addEventListener("change", () => {
        rule.enabled = check.checked;
      });

      const labelRes = document.createElement("span");
      labelRes.style.fontSize = "0.7rem";
      labelRes.style.fontFamily = "var(--mono-font)";
      labelRes.textContent = "Resonance:";

      const selRes = document.createElement("select");
      selRes.className = "listing-tier-select";
      selRes.style.minWidth = "70px";
      selRes.style.padding = "4px";
      for (let r = 15; r >= 1; r--) {
        const opt = document.createElement("option");
        opt.value = r;
        opt.textContent = `R${r}`;
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

      row.appendChild(check);
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

  const btnToggleCharDecor = document.getElementById("btn-toggle-char-decor");
  const charDecorCollapseContent = document.getElementById("char-decor-collapse-content");
  const charDecorArrow = document.getElementById("char-decor-arrow");

  if (btnToggleCharDecor && charDecorCollapseContent) {
    btnToggleCharDecor.addEventListener("click", () => {
      const isVisible = charDecorCollapseContent.style.display !== "none";
      charDecorCollapseContent.style.display = isVisible ? "none" : "flex";
      if (charDecorArrow) {
        charDecorArrow.textContent = isVisible ? "▸" : "▾";
      }
    });
  }

  const btnToggleInsightHide = document.getElementById("btn-toggle-insight-hide");
  const insightHideCollapseContent = document.getElementById("insight-hide-collapse-content");
  const insightHideArrow = document.getElementById("insight-hide-arrow");

  if (btnToggleInsightHide && insightHideCollapseContent) {
    btnToggleInsightHide.addEventListener("click", () => {
      const isVisible = insightHideCollapseContent.style.display !== "none";
      insightHideCollapseContent.style.display = isVisible ? "none" : "flex";
      if (insightHideArrow) {
        insightHideArrow.textContent = isVisible ? "▸" : "▾";
      }
    });
  }

  const btnToggleResHide = document.getElementById("btn-toggle-res-hide");
  const resHideCollapseContent = document.getElementById("res-hide-collapse-content");
  const resHideArrow = document.getElementById("res-hide-arrow");

  if (btnToggleResHide && resHideCollapseContent) {
    btnToggleResHide.addEventListener("click", () => {
      const isVisible = resHideCollapseContent.style.display !== "none";
      resHideCollapseContent.style.display = isVisible ? "none" : "flex";
      if (resHideArrow) {
        resHideArrow.textContent = isVisible ? "▸" : "▾";
      }
    });
  }

  // Character Info Box Checkbox Live Preview events
  [
    checkHideAfflatus,
    checkHideInsight,
    checkHideLevel,
    checkHideResonance,
    checkHideEuphoria,
    checkHidePortrait,
    checkHideNames,
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
    displayOptions.hideLevel = checkHideLevel.checked;
    displayOptions.hideResonance = checkHideResonance.checked;
    displayOptions.hideEuphoria = checkHideEuphoria.checked;
    displayOptions.hidePortrait = checkHidePortrait.checked;
    displayOptions.hideNames = checkHideNames.checked;
    if (checkHideSkin) displayOptions.hideSkin = checkHideSkin.checked;
    if (checkHideAfflatus) displayOptions.hideAfflatus = checkHideAfflatus.checked;
    displayOptions.hideI3Lv60 = checkHideI3Lv60.checked;
    displayOptions.hideI3Lv30 = checkHideI3Lv30.checked;
    displayOptions.customHideRules = tempCustomHideRules;
    if (checkHideR15) displayOptions.hideR15 = checkHideR15.checked;
    if (checkHideR10) displayOptions.hideR10 = checkHideR10.checked;
    displayOptions.customResHideRules = tempCustomResHideRules;

    const checkHideChess = document.getElementById("check-hide-chess-pieces");
    if (checkHideChess) {
      if (!displayOptions.appearance) {
        displayOptions.appearance = { ...DEFAULT_THEME_APPEARANCE };
      }
      displayOptions.appearance.chessPiecesEnabled = !checkHideChess.checked;
    }

    saveDisplayOptions();
    renderShowcase();
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
      const unOp = inputUnownedOpacity ? Number(inputUnownedOpacity.value) : 0.82;
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
      boardBgImageStatus.textContent = customBoardBgImageUrl ? "Custom background active (session only)" : "No custom image selected";
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
    const unOp = app.unownedOpacity !== undefined ? app.unownedOpacity : 0.82;
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

      unownedOpacity: inputUnownedOpacity ? Number(inputUnownedOpacity.value) : 0.82,

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
          boardBgImageStatus.textContent = "Custom background image loaded (session only)";
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
        boardBgImageStatus.textContent = "No custom image selected";
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
      "Reset Defaults",
      "Are you sure you want to reset all styling and appearance settings to defaults?",
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
    { value: "resonance", label: "Resonance", type: "number", min: 1, max: 15, defaultVal: 10 },
    { value: "insight", label: "Insight", type: "select", options: [
      { value: 3, label: "I3" },
      { value: 2, label: "I2" },
      { value: 1, label: "I1" },
      { value: 0, label: "I0" },
    ], defaultVal: 3 },
    { value: "level", label: "Level", type: "number", min: 1, max: 60, defaultVal: 60 },
    { value: "portrait", label: "Portrait", type: "select", options: [
      { value: 5, label: "P5" },
      { value: 4, label: "P4" },
      { value: 3, label: "P3" },
      { value: 2, label: "P2" },
      { value: 1, label: "P1" },
      { value: 0, label: "P0" },
    ], defaultVal: 0 },
    { value: "rarity", label: "Rarity", type: "select", options: [
      { value: 6, label: "✦6" },
      { value: 5, label: "✦5" },
      { value: 4, label: "✦4" },
      { value: 3, label: "✦3" },
      { value: 2, label: "✦2" },
    ], defaultVal: 6 },
    { value: "has_euphoria", label: "Has Euphoria", type: "boolean", defaultVal: true },
    { value: "has_pattern", label: "Has Pattern", type: "boolean", defaultVal: true },
    { value: "has_skin", label: "Has Skin", type: "boolean", defaultVal: true },
    { value: "name", label: "Name", type: "text", defaultVal: "" },
  ];

  const COMPARISON_OPS = [
    { value: "=", label: "=" },
    { value: ">=", label: "≥" },
    { value: "<=", label: "≤" },
    { value: ">", label: ">" },
    { value: "<", label: "<" },
    { value: "!=", label: "≠" },
  ];

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
      const isSystemTier = tier.type === "other" || tier.type === "unowned";
      if (!isSystemTier) {
        ensureTierRuleGroups(tier);
      }

      const itemCard = document.createElement("div");
      itemCard.className = "listing-tier-item";

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
      labelInput.value = tier.label || (tier.type === "unowned" ? "Unowned" : (tier.type === "other" ? "Other" : "Tier"));
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
      });

      const labelBg = document.createElement("label");
      labelBg.style.display = "flex";
      labelBg.style.alignItems = "center";
      labelBg.style.gap = "4px";
      labelBg.style.fontSize = "0.62rem";
      labelBg.style.fontFamily = "var(--mono-font)";
      labelBg.title = "Tier Background Color";
      labelBg.innerHTML = `<span>BG</span>`;

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
      btnClearBg.textContent = "Clear";
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
      labelBorder.innerHTML = `<span>Border</span>`;

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
      btnClearBorder.textContent = "Clear";
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
        <span class="check-text" style="font-size: 0.62rem; font-weight: 700;">BOLD</span>
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

      // System tiers (Other, Unowned) cannot be removed
      if (!isSystemTier) {
        const btnDel = document.createElement("button");
        btnDel.type = "button";
        btnDel.className = "btn-tier-del";
        btnDel.innerHTML = "&times;";
        btnDel.title = "Delete Tier";
        btnDel.style.marginLeft = "auto";
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
        tagSpan.textContent = tier.type === "unowned" ? "Unowned" : "Remaining";
        headerRow.appendChild(tagSpan);
      }

      itemCard.appendChild(headerRow);

      // Row 2: Dynamic Rules Container (or info description for System Tiers)
      const rulesContainer = document.createElement("div");
      rulesContainer.className = "listing-tier-rules-container";

      if (tier.type === "other") {
        rulesContainer.innerHTML = `
          <div style="font-family: var(--mono-font); font-size: 0.62rem; color: var(--text-muted); padding: 4px 6px;">
            Catches all remaining owned characters that haven't matched any previous tiers.
          </div>
        `;
        itemCard.appendChild(rulesContainer);
        listingTiersList.appendChild(itemCard);
        return;
      }

      if (tier.type === "unowned") {
        rulesContainer.innerHTML = `
          <div style="font-family: var(--mono-font); font-size: 0.62rem; color: var(--text-muted); padding: 4px 6px;">
            Catches all unowned characters.
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
          ? `Condition Group #${gIdx + 1} (ALL must match - AND)`
          : `Criteria (ALL must match - AND)`;
        groupHeader.appendChild(groupTag);

        const groupActions = document.createElement("div");
        groupActions.style.display = "flex";
        groupActions.style.gap = "6px";
        groupActions.style.alignItems = "center";

        const btnAddCond = document.createElement("button");
        btnAddCond.type = "button";
        btnAddCond.className = "btn btn-secondary btn-sm";
        btnAddCond.textContent = "+ AND";
        btnAddCond.style.padding = "2px 6px";
        btnAddCond.style.fontSize = "0.58rem";
        btnAddCond.title = "Add another condition to this group (AND)";
        btnAddCond.addEventListener("click", () => {
          group.push({ field: "resonance", op: ">=", value: 10 });
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
          FIELD_DEFINITIONS.forEach((fd) => {
            const opt = document.createElement("option");
            opt.value = fd.value;
            opt.textContent = fd.label;
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
            const currentFieldDef = FIELD_DEFINITIONS.find((f) => f.value === cond.field) || FIELD_DEFINITIONS[0];

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
              txtInput.placeholder = "Character's Name";
              txtInput.value = cond.value !== undefined ? cond.value : "";
              txtInput.addEventListener("input", (e) => {
                cond.value = e.target.value;
              });
              valContainer.appendChild(txtInput);
            } else if (currentFieldDef.type === "select") {
              opSel.style.display = "inline-block";
              const selEl = document.createElement("select");
              selEl.className = "listing-rule-select";
              currentFieldDef.options.forEach((o) => {
                const opt = document.createElement("option");
                opt.value = o.value;
                opt.textContent = o.label;
                if (Number(o.value) === Number(cond.value)) opt.selected = true;
                selEl.appendChild(opt);
              });
              selEl.addEventListener("change", (e) => {
                cond.value = Number(e.target.value);
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
            const newFDef = FIELD_DEFINITIONS.find((f) => f.value === cond.field);
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
      btnAddOrGroup.textContent = "+ Add OR Condition Group";
      btnAddOrGroup.style.fontSize = "0.6rem";
      btnAddOrGroup.style.marginTop = "4px";
      btnAddOrGroup.style.alignSelf = "flex-start";
      btnAddOrGroup.addEventListener("click", () => {
        tier.ruleGroups.push([{ field: "resonance", op: ">=", value: 10 }]);
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
    tempListingTiers.push({
      id: "tier_" + Date.now(),
      label: "New Tier",
      color: "#e0e0e0",
      ruleGroups: [[{ field: "resonance", op: ">=", value: 10 }]],
    });
    renderListingTiersEditor();
  });

  if (btnAddPresetTier) {
    btnAddPresetTier.addEventListener("click", () => {
      tempListingTiers.push({
        id: "tier_preset_unbuilt_" + Date.now(),
        label: "Unbuilt",
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
      "Reset Tiers",
      "Reset showcase tiers to defaults (R15, R11-14, R10, R1-9)?",
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
    });
  }

  // Roster Manager
  btnManageAll.addEventListener("click", openRosterModal);
  rosterBtnClose.addEventListener("click", closeRosterModal);
  rosterModal.addEventListener("click", (e) => {
    if (e.target === rosterModal) closeRosterModal();
  });
  rosterSearch.addEventListener("input", renderRosterManager);

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

  function getRosterFilterTargetText() {
    if (rosterActiveRarityFilters.size === 0) {
      return "all characters";
    }
    const rarities = [...rosterActiveRarityFilters]
      .sort((a, b) => a - b)
      .map((r) => `rarity ${r}`);
    return `all ${rarities.join(", ")}`;
  }

  function confirmRosterBulkAction(actionText, onConfirm) {
    const target = getRosterFilterTargetText();
    showConfirmModal(
      "Confirm Update",
      `Are you sure you want to set ${target} to ${actionText}?`,
      onConfirm
    );
  }

  btnSelectAll.addEventListener("click", () => {
    confirmRosterBulkAction("owned", () => {
      for (const name in userRoster) {
        const rarity = getCharacterRarity(name);
        if (rosterActiveRarityFilters.size === 0 || rosterActiveRarityFilters.has(rarity)) {
          const maxInsight = getMaxInsightForRarity(rarity);
          const maxLvl = getMaxLevelForInsight(maxInsight);
          const maxRes = getMaxResonanceForInsight(maxInsight);
          userRoster[name].owned = true;
          userRoster[name].insight = maxInsight;
          userRoster[name].level = maxLvl;
          userRoster[name].resonance = Math.min(10, maxRes);
          userRoster[name].e1 = false;
          userRoster[name].e2 = false;
          userRoster[name].boxKind = "none";
        }
      }
      saveRoster();
      renderRosterManager();
      renderShowcase();
    });
  });

  btnSelectAllUnbuilt.addEventListener("click", () => {
    confirmRosterBulkAction("owned (unbuilt)", () => {
      for (const name in userRoster) {
        const rarity = getCharacterRarity(name);
        if (rosterActiveRarityFilters.size === 0 || rosterActiveRarityFilters.has(rarity)) {
          userRoster[name].owned = true;
          userRoster[name].insight = 0;
          userRoster[name].level = 1;
          userRoster[name].resonance = 1;
          userRoster[name].boxKind = "none";
        }
      }
      saveRoster();
      renderRosterManager();
      renderShowcase();
    });
  });

  if (btnSetAllP5) {
    btnSetAllP5.addEventListener("click", () => {
      confirmRosterBulkAction("P5", () => {
        for (const name in userRoster) {
          const rarity = getCharacterRarity(name);
          if (rosterActiveRarityFilters.size === 0 || rosterActiveRarityFilters.has(rarity)) {
            userRoster[name].portrait = 5;
          }
        }
        saveRoster();
        renderRosterManager();
        renderShowcase();
      });
    });
  }

  btnUnselectAll.addEventListener("click", () => {
    confirmRosterBulkAction("unowned", () => {
      for (const name in userRoster) {
        const rarity = getCharacterRarity(name);
        if (rosterActiveRarityFilters.size === 0 || rosterActiveRarityFilters.has(rarity)) {
          userRoster[name].owned = false;
        }
      }
      saveRoster();
      renderRosterManager();
      renderShowcase();
    });
  });

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

    btnExportImage.textContent = "Rendering...";
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
      const unOp = app.unownedOpacity !== undefined ? app.unownedOpacity : 0.82;

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
      btnExportImage.textContent = "Export PNG";
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

  if (btnExportData) {
    btnExportData.addEventListener("click", () => {
      if (exportJsonModal) {
        exportJsonModal.style.display = "flex";
      }
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

  // 3. Export All (Full backup bao gồm cả roster và styling)
  if (btnExportJsonAll) {
    btnExportJsonAll.addEventListener("click", () => {
      const exportPayload = {
        version: 2,
        roster: userRoster,
        listingConfig: listingConfig,
        displayOptions: displayOptions,
        boardTitle: localStorage.getItem(TITLE_STORAGE_KEY) || "Suitcase",
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

  // Reset Data
  btnResetData.addEventListener("click", () => {
    showConfirmModal(
      "Reset Roster Data",
      "Are you sure you want to reset all character settings to their defaults?",
      () => {
        localStorage.removeItem(STORAGE_KEY);
        userRoster = {};
        loadRoster();
        renderShowcase();
      }
    );
  });
}

// Outside modal label: white default for None, else pattern colors.
function getResonanceTextColor(boxKind) {
  const app = displayOptions.appearance || DEFAULT_THEME_APPEARANCE;
  switch (boxKind) {
    case "offensive":
      return app.patternOffensive || "#FBAE31";
    case "defensive":
      return app.patternDefensive || "#2d8a5a";
    case "hp":
      return app.patternHp || "#d4ad2b";
    case "equibalance":
      return app.patternEquibalance || "#3b6dc7";
    case "none":
    default:
      return app.patternNone || "#4f4f4f";
  }
}

// Inside roster card label: gray default for None, else pattern colors (or user custom color).
function getCardResonanceTextColor(boxKind) {
  const app = displayOptions.appearance || DEFAULT_THEME_APPEARANCE;
  if (app.customResColorEnabled && app.customResColor) {
    return app.customResColor;
  }
  switch (boxKind) {
    case "offensive":
      return app.patternOffensive || "#FBAE31";
    case "defensive":
      return app.patternDefensive || "#2d8a5a";
    case "hp":
      return app.patternHp || "#d4ad2b";
    case "equibalance":
      return app.patternEquibalance || "#3b6dc7";
    case "none":
    default:
      return app.patternNone || "#4f4f4f";
  }
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
