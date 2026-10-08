// Keys & State
const STORAGE_KEY = "r1999_character_roster_v2";

let characterDb = {}; // { "Name": "images/headicon_small/..." }
let characterRarityMap = {}; // { "Name": 6 }
let characterIdMap = {}; // { "Name": 3003 }
let euphoriaOptionsByName = {}; // { "Name": [1,2] }
let euphoriaNamesByTier = {}; // { "Name": { 1: "Pursuit", 2: "Conduit" } }
let euphoriaAllowedNames = new Set();
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
  separateUnbuilt: false,
  unbuiltLabel: "Unbuilt",
  unbuiltColor: "#9a9a9a",
  unownedColor: "#9a9a9a",
  tiers: [
    { id: "tier_r15", label: "R15", color: "#d1783d", rule: "r15" },
    { id: "tier_r11_14", label: "R11 - 14", color: "#6d9b6c", rule: "r11-14" },
    { id: "tier_r10", label: "R10", color: "#d7d7d7", rule: "r10" },
    { id: "tier_r1_9", label: "R1 - 9", color: "#4a77c9", rule: "r1-9" },
  ],
};

let listingConfig = JSON.parse(JSON.stringify(DEFAULT_TIERS_CONFIG));

function loadListingConfig() {
  try {
    const saved = localStorage.getItem(LISTING_STORAGE_KEY);
    if (saved) {
      listingConfig = { ...DEFAULT_TIERS_CONFIG, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.warn("Could not load listing config", e);
    listingConfig = JSON.parse(JSON.stringify(DEFAULT_TIERS_CONFIG));
  }
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
  boardHeaderBorderColor: "rgba(255, 255, 255, 0.1)",
  boardHeaderBorderWidth: 1,

  // Tier Box (Khung chứa từng tier & nhân vật)
  tierBoxOpacity: 1,
  tierBoxBorderWidth: 1,
  tierBoxRadius: 0,

  // Spacing
  spacingHeaderToTiers: 20,
  spacingBetweenTierRows: 14,

  // Character Info Badge (I/Lv Overlay)
  charInfoBgEnabled: true,
  charInfoBg: "#121212",
  charInfoBgOpacity: 0.22,
  charInfoBorderColor: "transparent",
  charInfoBorderWidth: 0,
  charInfoRadius: 0,

  euphoriaColor: "#04FFEE",
  portraitBarColor: "#FBAE31",
  patternNone: "#4F4F4F",
  patternOffensive: "#FBAE31",
  patternDefensive: "#2D8A5A",
  patternHp: "#D4AD2B",
  patternEquibalance: "#3B6DC7",

  // Custom Resonance Label Color on Character Info
  customResColorEnabled: false,
  customResColor: "#ffffff",
};

let displayOptions = {
  hideInsight: false,
  hideLevel: false,
  hideResonance: false,
  hideEuphoria: false,
  hidePortrait: false,
  hideNames: false,
  hideSkin: false,
  showPatternBg: false,
  showPatternBorder: false,
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
  document.documentElement.style.setProperty("--board-header-bg", app.boardHeaderBg || "transparent");
  document.documentElement.style.setProperty("--board-header-border-color", app.boardHeaderBorderColor || "rgba(255, 255, 255, 0.1)");
  document.documentElement.style.setProperty("--board-header-border-width", `${app.boardHeaderBorderWidth !== undefined ? app.boardHeaderBorderWidth : 1}px`);
  document.documentElement.style.setProperty("--board-header-spacing", `${app.spacingHeaderToTiers !== undefined ? app.spacingHeaderToTiers : 20}px`);

  // Tier Box Variables
  const tbOpacity = app.tierBoxOpacity !== undefined ? app.tierBoxOpacity : 1;
  const tbRawBg = "#000000";
  document.documentElement.style.setProperty("--tier-box-bg", hexToRgba(tbRawBg, tbOpacity));
  document.documentElement.style.setProperty("--tier-box-border-color", "rgba(255, 255, 255, 0.04)");
  document.documentElement.style.setProperty("--tier-box-border-width", `${app.tierBoxBorderWidth !== undefined ? app.tierBoxBorderWidth : 1}px`);
  document.documentElement.style.setProperty("--tier-box-radius", `${app.tierBoxRadius !== undefined ? app.tierBoxRadius : 0}px`);
  document.documentElement.style.setProperty("--tier-row-spacing", `${app.spacingBetweenTierRows !== undefined ? app.spacingBetweenTierRows : 14}px`);

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
  document.documentElement.style.setProperty("--portrait-bar-active", app.portraitBarColor || "#FBAE31");
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
    const [rarityRes, arcanistRes, euphoriaRes, futureRes, excludeRes] = await Promise.all([
      fetch("data/characters_by_rarity.json"),
      fetch("data/ArcanistMap.json"),
      fetch("data/euphoria_list.json"),
      fetch("data/future_sight.json").catch(() => null),
      fetch("data/exclude_character.json").catch(() => null),
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

function matchesTierRule(rule, char, rarity) {
  const res = Number(char.resonance || 1);
  const lvl = Number(char.level || 1);
  const insight = Number(char.insight || 0);
  const boxKind = char.boxKind || "none";
  const hasEuphoria = !!(char.e1 || char.e2);

  switch (rule) {
    case "r15": return res >= 15;
    case "r14": return res === 14;
    case "r13": return res === 13;
    case "r12": return res === 12;
    case "r11": return res === 11;
    case "r10": return res === 10;
    case "r11-14": return res >= 11 && res <= 14;
    case "r11-13": return res >= 11 && res <= 13;
    case "r1-9": return res >= 1 && res <= 9;
    case "r10_pattern": return res === 10 && boxKind !== "none";
    case "r10_no_pattern": return res === 10 && boxKind === "none";
    case "r10_euphoria": return res === 10 && hasEuphoria;
    case "has_euphoria": return hasEuphoria;
    case "lv60": return lvl === 60;
    case "non_lv60": return lvl < 60;
    case "i3": return insight === 3;
    case "i2": return insight === 2;
    case "i1": return insight === 1;
    case "i0": return insight === 0;
    case "rarity_6": return rarity === 6;
    case "rarity_5": return rarity === 5;
    case "rarity_4": return rarity === 4;
    case "rarity_3": return rarity === 3;
    case "rarity_2": return rarity === 2;
    case "rarity_2_4": return rarity >= 2 && rarity <= 4;
    case "unbuilt": return isCharacterUnbuilt(char);
    default: return true;
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

  // Custom tiers
  (listingConfig.tiers || []).forEach((t) => {
    tierBuckets.push({
      id: t.id,
      label: t.label,
      color: t.color || "#ffffff",
      bgColor: t.bgColor || null,
      borderColor: t.borderColor || null,
      bold: !!t.bold,
      rule: t.rule,
      cards: [],
    });
  });

  // Optional Unbuilt tier (evaluated after custom tiers or explicitly)
  let unbuiltBucket = null;
  if (listingConfig.separateUnbuilt) {
    unbuiltBucket = {
      id: "tier_unbuilt_special",
      label: listingConfig.unbuiltLabel || "Unbuilt",
      color: listingConfig.unbuiltColor || "#9a9a9a",
      bgColor: listingConfig.unbuiltBg || null,
      borderColor: listingConfig.unbuiltBorder || null,
      bold: !!listingConfig.unbuiltBold,
      cards: [],
    };
  }

  // Fallback bucket for any owned characters not matched by above tiers
  const remainingBucket = {
    id: "tier_other",
    label: "Other",
    color: "#a0a0a0",
    bgColor: null,
    borderColor: null,
    bold: false,
    cards: [],
  };

  // Populate owned cards into the first matching tier
  ownedNames.forEach((name) => {
    if (query && !name.toLowerCase().includes(query)) return;
    if (activeOwnershipFilter === "unowned") return;

    const rarity = getCharacterRarity(name);
    const char = userRoster[name] || {
      owned: true,
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

    // If separate unbuilt is on and char is unbuilt, place into unbuiltBucket
    if (unbuiltBucket && isCharacterUnbuilt(char)) {
      unbuiltBucket.cards.push(card);
      return;
    }

    let matched = false;
    for (const bucket of tierBuckets) {
      if (matchesTierRule(bucket.rule, char, rarity)) {
        bucket.cards.push(card);
        matched = true;
        break;
      }
    }

    if (!matched) {
      remainingBucket.cards.push(card);
    }
  });

  // Render all owned tier sections
  tierBuckets.forEach((bucket) => {
    renderTierRowSection(bucket.label, bucket.color, bucket.cards, bucket.bgColor, bucket.borderColor, bucket.bold);
  });

  if (unbuiltBucket) {
    renderTierRowSection(unbuiltBucket.label, unbuiltBucket.color, unbuiltBucket.cards, unbuiltBucket.bgColor, unbuiltBucket.borderColor, unbuiltBucket.bold);
  }

  if (remainingBucket.cards.length > 0) {
    renderTierRowSection(remainingBucket.label, remainingBucket.color, remainingBucket.cards, remainingBucket.bgColor, remainingBucket.borderColor, remainingBucket.bold);
  }

  // Render Unowned Tier (Fixed at the bottom)
  if (activeOwnershipFilter !== "owned") {
    const unownedCards = [];
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
      unownedCards.push(card);
    });
    renderTierRowSection(
      "Unowned",
      listingConfig.unownedColor || "#9a9a9a",
      unownedCards,
      listingConfig.unownedBg || null,
      listingConfig.unownedBorder || null,
      !!listingConfig.unownedBold
    );
  }

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
}

function renderTierRowSection(label, color, cards, customBg, customBorder, isBold) {
  const section = document.createElement("section");
  section.className = "tier-row";

  if (customBg && customBg !== "transparent") {
    section.style.background = customBg;
  }
  if (customBorder && customBorder !== "transparent") {
    section.style.borderColor = customBorder;
  }

  const app = displayOptions.appearance || DEFAULT_THEME_APPEARANCE;
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
  const patternName = getPatternDisplayName(boxKind);
  const patternSuffix = patternName ? ` · ${patternName}` : "";

  // Portrait dashes: 5 total slots (P0 = 0 dashes, P1 = 1 active dash, ... P5 = 5 active dashes)
  const dashesHtml = (char.owned && !displayOptions.hidePortrait)
    ? Array.from({ length: 5 }, (_, i) => `<span class="portrait-dash ${i < char.portrait ? "active" : ""}"></span>`).join("")
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

  const avatarBoxStyles = [];
  if (char.owned && boxKind && boxKind !== "none") {
    if (displayOptions.showPatternBg) {
      avatarBoxStyles.push(`background-color: ${resonanceColor}`);
    }
    if (displayOptions.showPatternBorder) {
      avatarBoxStyles.push(`border: 1px solid ${resonanceColor}`);
    }
  }
  const avatarBoxStyle = avatarBoxStyles.length > 0 ? ` style="${avatarBoxStyles.join("; ")};"` : "";

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
    <div class="char-avatar-box"${avatarBoxStyle}>
      <img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(name)}" class="char-avatar-img" loading="lazy" onerror="this.onerror=null;this.src='${escapeHtml(characterDb[name])}'" />
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

// Event Listeners
function setupEventListeners() {
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
  const checkShowRarityLine = document.getElementById("check-show-rarity-line");
  const checkHideI3Lv60 = document.getElementById("check-hide-i3-lv60");
  const checkHideI3Lv30 = document.getElementById("check-hide-i3-lv30");
  const checkHideI2Lv50 = document.getElementById("check-hide-i2-lv50");
  const checkHideR15 = document.getElementById("check-hide-r15");
  const checkHideR10 = document.getElementById("check-hide-r10");

  const customHideRulesList = document.getElementById("custom-hide-rules-list");
  const btnAddCustomHide = document.getElementById("btn-add-custom-hide");
  let tempCustomHideRules = [];

  const customResHideRulesList = document.getElementById("custom-res-hide-rules-list");
  const btnAddCustomResHide = document.getElementById("btn-add-custom-res-hide");
  let tempCustomResHideRules = [];

  function openOptionsModal() {
    if (checkFutureSight) checkFutureSight.checked = !!futureSightEnabled;
    if (checkShowPatternBg) checkShowPatternBg.checked = !!displayOptions.showPatternBg;
    if (checkShowPatternBorder) checkShowPatternBorder.checked = !!displayOptions.showPatternBorder;
    checkHideInsight.checked = !!displayOptions.hideInsight;
    checkHideLevel.checked = !!displayOptions.hideLevel;
    checkHideResonance.checked = !!displayOptions.hideResonance;
    checkHideEuphoria.checked = !!displayOptions.hideEuphoria;
    checkHidePortrait.checked = !!displayOptions.hidePortrait;
    checkHideNames.checked = !!displayOptions.hideNames;
    if (checkHideSkin) checkHideSkin.checked = !!displayOptions.hideSkin;
    checkShowRarityLine.checked = !!displayOptions.showRarityLine;
    checkHideI3Lv60.checked = !!displayOptions.hideI3Lv60;
    checkHideI3Lv30.checked = !!displayOptions.hideI3Lv30;
    checkHideI2Lv50.checked = !!displayOptions.hideI2Lv50;
    if (checkHideR15) checkHideR15.checked = !!displayOptions.hideR15;
    if (checkHideR10) checkHideR10.checked = !!displayOptions.hideR10;

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

  btnOptions.addEventListener("click", openOptionsModal);
  optionsBtnClose.addEventListener("click", closeOptionsModal);
  optionsBtnDone.addEventListener("click", () => {
    if (checkFutureSight) {
      futureSightEnabled = checkFutureSight.checked;
      saveFutureSightState();
    }
    if (checkShowPatternBg) displayOptions.showPatternBg = checkShowPatternBg.checked;
    if (checkShowPatternBorder) displayOptions.showPatternBorder = checkShowPatternBorder.checked;
    displayOptions.hideInsight = checkHideInsight.checked;
    displayOptions.hideLevel = checkHideLevel.checked;
    displayOptions.hideResonance = checkHideResonance.checked;
    displayOptions.hideEuphoria = checkHideEuphoria.checked;
    displayOptions.hidePortrait = checkHidePortrait.checked;
    displayOptions.hideNames = checkHideNames.checked;
    if (checkHideSkin) displayOptions.hideSkin = checkHideSkin.checked;
    displayOptions.showRarityLine = checkShowRarityLine.checked;
    displayOptions.hideI3Lv60 = checkHideI3Lv60.checked;
    displayOptions.hideI3Lv30 = checkHideI3Lv30.checked;
    displayOptions.hideI2Lv50 = checkHideI2Lv50.checked;
    displayOptions.customHideRules = tempCustomHideRules;
    if (checkHideR15) displayOptions.hideR15 = checkHideR15.checked;
    if (checkHideR10) displayOptions.hideR10 = checkHideR10.checked;
    displayOptions.customResHideRules = tempCustomResHideRules;
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
  const colorPortraitBar = document.getElementById("color-portrait-bar");
  const colorPatternNone = document.getElementById("color-pattern-none");
  const colorPatternOffensive = document.getElementById("color-pattern-offensive");
  const colorPatternDefensive = document.getElementById("color-pattern-defensive");
  const colorPatternHp = document.getElementById("color-pattern-hp");
  const colorPatternEquibalance = document.getElementById("color-pattern-equibalance");

  // Custom Resonance Label Color Elements
  const checkCustomResColor = document.getElementById("check-custom-res-color");
  const customResColorRow = document.getElementById("custom-res-color-row");
  const colorCustomResLabel = document.getElementById("color-custom-res-label");

  const btnResetCustomAppearance = document.getElementById("btn-reset-custom-appearance");

  let currentBoardHeaderBg = "transparent";
  let currentBoardHeaderBorder = "rgba(255, 255, 255, 0.1)";
  let currentCharInfoBorder = "transparent";

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
    currentBoardHeaderBorder = app.boardHeaderBorderColor || "rgba(255, 255, 255, 0.1)";
    colorBoardHeaderBorder.value = parseHexOrDefault(currentBoardHeaderBorder, "#333333");
    const bhBw = app.boardHeaderBorderWidth !== undefined ? app.boardHeaderBorderWidth : 1;
    inputBoardHeaderBorderWidth.value = bhBw;
    displayBoardHeaderBorderWidth.textContent = `${bhBw}px`;

    // Tier Box
    const tbOp = app.tierBoxOpacity !== undefined ? app.tierBoxOpacity : 1;
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
    colorPortraitBar.value = app.portraitBarColor || "#FBAE31";
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
      boardHeaderBorderColor: currentBoardHeaderBorder,
      boardHeaderBorderWidth: Number(inputBoardHeaderBorderWidth.value),

      // Tier Box
      tierBoxOpacity: inputTierBoxOpacity ? Number(inputTierBoxOpacity.value) : 1,
      tierBoxBorderWidth: Number(inputTierBoxBorderWidth.value),
      tierBoxRadius: Number(inputTierBoxRadius.value),

      // Spacing
      spacingHeaderToTiers: inputSpacingHeaderTier ? Number(inputSpacingHeaderTier.value) : 20,
      spacingBetweenTierRows: inputSpacingTierGap ? Number(inputSpacingTierGap.value) : 14,

      // Character Info Badge
      charInfoBgEnabled: checkCharInfoBgEnabled.checked,
      charInfoBg: colorCharInfoBg.value,
      charInfoBgOpacity: inputCharInfoBgOpacity ? Number(inputCharInfoBgOpacity.value) : 0.22,
      charInfoBorderColor: currentCharInfoBorder,
      charInfoBorderWidth: Number(inputCharInfoBorderWidth.value),
      charInfoRadius: Number(inputCharInfoRadius.value),

      euphoriaColor: colorEuphoriaLabel.value,
      portraitBarColor: colorPortraitBar.value,
      patternNone: colorPatternNone.value,
      patternOffensive: colorPatternOffensive.value,
      patternDefensive: colorPatternDefensive.value,
      patternHp: colorPatternHp.value,
      patternEquibalance: colorPatternEquibalance.value,

      customResColorEnabled: checkCustomResColor ? checkCustomResColor.checked : false,
      customResColor: colorCustomResLabel ? colorCustomResLabel.value : "#ffffff",
    };
  }

  inputBoardTitleSize.addEventListener("input", (e) => {
    displayBoardTitleSize.textContent = `${e.target.value}rem`;
  });

  inputTierLabelSize.addEventListener("input", (e) => {
    displayTierLabelSize.textContent = `${e.target.value}rem`;
  });

  // Board Header Box events
  colorBoardHeaderBg.addEventListener("input", (e) => {
    currentBoardHeaderBg = e.target.value;
  });
  btnClearBoardHeaderBg.addEventListener("click", () => {
    currentBoardHeaderBg = "transparent";
  });
  colorBoardHeaderBorder.addEventListener("input", (e) => {
    currentBoardHeaderBorder = e.target.value;
  });
  btnClearBoardHeaderBorder.addEventListener("click", () => {
    currentBoardHeaderBorder = "transparent";
  });
  inputBoardHeaderBorderWidth.addEventListener("input", (e) => {
    displayBoardHeaderBorderWidth.textContent = `${e.target.value}px`;
  });

  // Separator / Tier Label Width events
  if (inputTierLabelWidth) {
    inputTierLabelWidth.addEventListener("input", (e) => {
      displayTierLabelWidth.textContent = `${e.target.value}px`;
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
    });
  }
  inputTierBoxBorderWidth.addEventListener("input", (e) => {
    displayTierBoxBorderWidth.textContent = `${e.target.value}px`;
  });
  inputTierBoxRadius.addEventListener("input", (e) => {
    displayTierBoxRadius.textContent = `${e.target.value}px`;
  });

  // Custom Resonance Label Color events
  if (checkCustomResColor) {
    checkCustomResColor.addEventListener("change", (e) => {
      if (customResColorRow) {
        customResColorRow.style.display = e.target.checked ? "flex" : "none";
      }
    });
  }

  // Spacing events
  if (inputSpacingHeaderTier) {
    inputSpacingHeaderTier.addEventListener("input", (e) => {
      displaySpacingHeaderTier.textContent = `${e.target.value}px`;
    });
  }
  if (inputSpacingTierGap) {
    inputSpacingTierGap.addEventListener("input", (e) => {
      displaySpacingTierGap.textContent = `${e.target.value}px`;
    });
  }

  // Character Info Badge events
  checkCharInfoBgEnabled.addEventListener("change", (e) => {
    const controls = document.getElementById("char-info-bg-controls");
    if (controls) controls.style.opacity = e.target.checked ? "1" : "0.5";
    const bgOpacityRow = document.getElementById("char-info-bg-opacity-row");
    if (bgOpacityRow) bgOpacityRow.style.opacity = e.target.checked ? "1" : "0.5";
  });
  colorCharInfoBorder.addEventListener("input", (e) => {
    currentCharInfoBorder = e.target.value;
  });
  btnClearCharInfoBorder.addEventListener("click", () => {
    currentCharInfoBorder = "transparent";
  });
  inputCharInfoBorderWidth.addEventListener("input", (e) => {
    displayCharInfoBorderWidth.textContent = `${e.target.value}px`;
  });
  inputCharInfoRadius.addEventListener("input", (e) => {
    displayCharInfoRadius.textContent = `${e.target.value}px`;
  });
  if (inputCharInfoBgOpacity) {
    inputCharInfoBgOpacity.addEventListener("input", (e) => {
      displayCharInfoBgOpacity.textContent = `${Math.round(e.target.value * 100)}%`;
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
    if (!confirm("Are you sure you want to reset all styling and appearance settings to defaults?")) return;
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
  const listingTiersList = document.getElementById("listing-tiers-list");
  const checkEnableUnbuilt = document.getElementById("check-enable-unbuilt-tier");
  const unbuiltTierConfig = document.getElementById("unbuilt-tier-config");
  const inputUnbuiltLabel = document.getElementById("input-unbuilt-label");
  const inputUnbuiltColor = document.getElementById("input-unbuilt-color");
  const inputUnbuiltBg = document.getElementById("input-unbuilt-bg");
  const btnClearUnbuiltBg = document.getElementById("btn-clear-unbuilt-bg");
  const inputUnbuiltBorder = document.getElementById("input-unbuilt-border");
  const btnClearUnbuiltBorder = document.getElementById("btn-clear-unbuilt-border");
  const checkUnbuiltBold = document.getElementById("check-unbuilt-bold");

  const inputUnownedColor = document.getElementById("input-unowned-color");
  const inputUnownedBg = document.getElementById("input-unowned-bg");
  const btnClearUnownedBg = document.getElementById("btn-clear-unowned-bg");
  const inputUnownedBorder = document.getElementById("input-unowned-border");
  const btnClearUnownedBorder = document.getElementById("btn-clear-unowned-border");
  const checkUnownedBold = document.getElementById("check-unowned-bold");

  let currentUnbuiltBg = null;
  let currentUnbuiltBorder = null;
  let currentUnownedBg = null;
  let currentUnownedBorder = null;

  if (btnClearUnbuiltBg) {
    btnClearUnbuiltBg.addEventListener("click", () => {
      currentUnbuiltBg = null;
      if (inputUnbuiltBg) inputUnbuiltBg.value = "#000000";
    });
  }
  if (inputUnbuiltBg) {
    inputUnbuiltBg.addEventListener("input", (e) => {
      currentUnbuiltBg = e.target.value;
    });
  }
  if (btnClearUnbuiltBorder) {
    btnClearUnbuiltBorder.addEventListener("click", () => {
      currentUnbuiltBorder = null;
      if (inputUnbuiltBorder) inputUnbuiltBorder.value = "#222222";
    });
  }
  if (inputUnbuiltBorder) {
    inputUnbuiltBorder.addEventListener("input", (e) => {
      currentUnbuiltBorder = e.target.value;
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

  const TIER_RULE_OPTIONS = [
    { value: "r15", label: "Resonance: R15" },
    { value: "r11-14", label: "Resonance: R11 - 14" },
    { value: "r10", label: "Resonance: R10" },
    { value: "r10_pattern", label: "R10 + Pattern (Has Pattern)" },
    { value: "r10_no_pattern", label: "R10 + No Pattern" },
    { value: "r10_euphoria", label: "R10 + Euphoria" },
    { value: "r1-9", label: "Resonance: R1 - 9" },
    { value: "has_euphoria", label: "Euphoria: Has Euphoria" },
    { value: "lv60", label: "Level: Lv.60" },
    { value: "non_lv60", label: "Level: Non-Lv.60 (< Lv.60)" },
    { value: "i3", label: "Insight: Insight 3 (I3)" },
    { value: "i2", label: "Insight: Insight 2 (I2)" },
    { value: "i1", label: "Insight: Insight 1 (I1)" },
    { value: "i0", label: "Insight: Insight 0 (I0)" },
    { value: "rarity_6", label: "Rarity: 6✦" },
    { value: "rarity_5", label: "Rarity: 5✦" },
    { value: "rarity_2_4", label: "Rarity: 2✦ - 4✦" },
    { value: "unbuilt", label: "Unbuilt (I0 Lv.1 R1)" },
  ];

  let tempListingTiers = [];

  function renderListingTiersEditor() {
    listingTiersList.innerHTML = "";
    tempListingTiers.forEach((tier, index) => {
      const row = document.createElement("div");
      row.className = "listing-tier-item";

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
      labelInput.value = tier.label;
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

      const selectRule = document.createElement("select");
      selectRule.className = "listing-tier-select";
      TIER_RULE_OPTIONS.forEach((opt) => {
        const optionEl = document.createElement("option");
        optionEl.value = opt.value;
        optionEl.textContent = opt.label;
        if (opt.value === tier.rule) optionEl.selected = true;
        selectRule.appendChild(optionEl);
      });
      selectRule.addEventListener("change", (e) => {
        tier.rule = e.target.value;
      });

      const btnDel = document.createElement("button");
      btnDel.type = "button";
      btnDel.className = "btn-tier-del";
      btnDel.innerHTML = "&times;";
      btnDel.title = "Delete Tier";
      btnDel.addEventListener("click", () => {
        tempListingTiers.splice(index, 1);
        renderListingTiersEditor();
      });

      row.appendChild(handleDiv);
      row.appendChild(labelInput);
      row.appendChild(colorInput);
      row.appendChild(labelBg);
      row.appendChild(labelBorder);
      row.appendChild(labelBold);
      row.appendChild(selectRule);
      row.appendChild(btnDel);

      listingTiersList.appendChild(row);
    });
  }

  function openListingModal() {
    tempListingTiers = JSON.parse(JSON.stringify(listingConfig.tiers || []));
    checkEnableUnbuilt.checked = !!listingConfig.separateUnbuilt;
    unbuiltTierConfig.style.display = checkEnableUnbuilt.checked ? "flex" : "none";
    inputUnbuiltLabel.value = listingConfig.unbuiltLabel || "Unbuilt";
    inputUnbuiltColor.value = listingConfig.unbuiltColor || "#9a9a9a";
    currentUnbuiltBg = listingConfig.unbuiltBg || null;
    if (inputUnbuiltBg) inputUnbuiltBg.value = currentUnbuiltBg || "#000000";
    currentUnbuiltBorder = listingConfig.unbuiltBorder || null;
    if (inputUnbuiltBorder) inputUnbuiltBorder.value = currentUnbuiltBorder || "#222222";
    if (checkUnbuiltBold) checkUnbuiltBold.checked = !!listingConfig.unbuiltBold;

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

  checkEnableUnbuilt.addEventListener("change", () => {
    unbuiltTierConfig.style.display = checkEnableUnbuilt.checked ? "flex" : "none";
  });

  btnAddTier.addEventListener("click", () => {
    tempListingTiers.push({
      id: "tier_" + Date.now(),
      label: "New Tier",
      color: "#e0e0e0",
      rule: "r10",
    });
    renderListingTiersEditor();
  });

  btnListing.addEventListener("click", openListingModal);
  listingBtnClose.addEventListener("click", closeListingModal);
  listingModal.addEventListener("click", (e) => {
    if (e.target === listingModal) closeListingModal();
  });

  listingBtnSave.addEventListener("click", () => {
    listingConfig.separateUnbuilt = checkEnableUnbuilt.checked;
    listingConfig.unbuiltLabel = inputUnbuiltLabel.value.trim() || "Unbuilt";
    listingConfig.unbuiltColor = inputUnbuiltColor.value;
    listingConfig.unbuiltBg = currentUnbuiltBg;
    listingConfig.unbuiltBorder = currentUnbuiltBorder;
    listingConfig.unbuiltBold = checkUnbuiltBold ? checkUnbuiltBold.checked : false;

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
    if (confirm("Reset showcase tiers to defaults (R15, R11-14, R10, R1-9)?")) {
      listingConfig = JSON.parse(JSON.stringify(DEFAULT_TIERS_CONFIG));
      tempListingTiers = JSON.parse(JSON.stringify(listingConfig.tiers));
      checkEnableUnbuilt.checked = false;
      unbuiltTierConfig.style.display = "none";
      inputUnbuiltLabel.value = "Unbuilt";
      inputUnbuiltColor.value = "#9a9a9a";
      currentUnbuiltBg = null;
      currentUnbuiltBorder = null;
      if (inputUnbuiltBg) inputUnbuiltBg.value = "#000000";
      if (inputUnbuiltBorder) inputUnbuiltBorder.value = "#222222";
      if (checkUnbuiltBold) checkUnbuiltBold.checked = false;

      if (inputUnownedColor) inputUnownedColor.value = "#9a9a9a";
      currentUnownedBg = null;
      currentUnownedBorder = null;
      if (inputUnownedBg) inputUnownedBg.value = "#000000";
      if (inputUnownedBorder) inputUnownedBorder.value = "#222222";
      if (checkUnownedBold) checkUnownedBold.checked = false;

      renderListingTiersEditor();
    }
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

  function confirmRosterBulkAction(actionText) {
    const target = getRosterFilterTargetText();
    return confirm(`Are you sure you want to set ${target} to ${actionText}?`);
  }

  btnSelectAll.addEventListener("click", () => {
    if (!confirmRosterBulkAction("owned")) return;
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

  btnSelectAllUnbuilt.addEventListener("click", () => {
    if (!confirmRosterBulkAction("owned (unbuilt)")) return;
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

  if (btnSetAllP5) {
    btnSetAllP5.addEventListener("click", () => {
      if (!confirmRosterBulkAction("P5")) return;
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
  }

  btnUnselectAll.addEventListener("click", () => {
    if (!confirmRosterBulkAction("unowned")) return;
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

      // 4. Try native Web Share API on mobile
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

      let directShareSucceeded = false;
      if (isMobile && canShareFile && shareFile) {
        try {
          await navigator.share({
            files: [shareFile],
            title: "Sotheby's Mansion",
          });
          directShareSucceeded = true;
        } catch (shareErr) {
          if (shareErr.name === "AbortError") {
            return;
          }
          console.warn("Direct navigator.share could not be completed, opening preview modal:", shareErr);
        }
      }

      if (directShareSucceeded) {
        return;
      }

      // If on desktop and not shared, trigger instant file download
      if (!isMobile) {
        triggerDownload(currentExportBlobUrl, fileName);
        return;
      }

      // On mobile / iOS (or fallback): show export preview modal
      if (exportPreviewImg) exportPreviewImg.src = currentExportBlobUrl;
      if (exportModalBtnShare) {
        exportModalBtnShare.style.display = canShareFile ? "inline-flex" : "none";
      }

      if (exportHelpTip) {
        if (isIOS) {
          exportHelpTip.innerHTML = "💡 <strong>On iPhone / iPad:</strong> Tap and hold the image below and select <strong>Save to Photos</strong>, or tap <strong>Share / Save Image</strong>.";
        } else {
          exportHelpTip.innerHTML = "💡 Tap and hold the image to save, or use the buttons below.";
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

  // Export JSON (Exports user roster, tier listing config, and display appearance options)
  btnExportData.addEventListener("click", () => {
    const exportPayload = {
      version: 2,
      roster: userRoster,
      listingConfig: listingConfig,
      displayOptions: displayOptions,
      boardTitle: localStorage.getItem(TITLE_STORAGE_KEY) || "Suitcase",
    };
    const jsonBlob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" });
    const blobUrl = URL.createObjectURL(jsonBlob);
    triggerDownload(blobUrl, `r1999_roster_${new Date().toISOString().slice(0, 10)}.json`);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
  });

  // Import JSON (Supports both v2 payload and direct roster object v1)
  inputImportFile.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target.result);
        if (typeof imported === "object" && imported !== null && !Array.isArray(imported)) {
          // Detect whether imported file is v2 export format or direct roster map
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
            // Direct roster map
            userRoster = imported;
          }

          sanitizeRosterState();
          saveRoster();
          applyCustomAppearance();
          renderShowcase();
          alert("Roster imported successfully!");
        } else {
          alert("Invalid roster format. Please select a valid JSON roster file.");
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
    if (confirm("Are you sure you want to reset all character settings to their defaults? This will also reset ownership status.")) {
      localStorage.removeItem(STORAGE_KEY);
      userRoster = {};
      loadRoster();
      renderShowcase();
    }
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
