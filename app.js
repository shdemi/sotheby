// Keys & State
const STORAGE_KEY = "r1999_character_roster_v2";

let characterDb = {}; // from icon.json: { "Name": "path" }
let characterRarityMap = {}; // { "Name": 6 }
let characterIdMap = {}; // { "Name": 3003 }
let euphoriaOptionsByName = {}; // { "Name": [1,2] }
let euphoriaAllowedNames = new Set();
let userRoster = {};  // { "Name": { owned: true/false, insight: 3, level: 60, resonance: 10, portrait: 0, e1: false, e2: false } }
let currentEditingName = null;

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

// DOM Elements
const r15List = document.getElementById("tier-r15-list");
const r11to14List = document.getElementById("tier-r11-14-list");
const r10List = document.getElementById("tier-r10-list");
const r1to9List = document.getElementById("tier-r1-9-list");
const unownedList = document.getElementById("tier-unowned-list");

const rosterStat = document.getElementById("roster-stat");
const filterSearch = document.getElementById("filter-search");
const inputBoardTitle = document.getElementById("input-board-title");
const boardTitleLabel = document.getElementById("board-title-label");
const filterOwnershipBtns = document.querySelectorAll("#filter-ownership-group .filter-btn");
const filterRarityBtns = document.querySelectorAll("#filter-rarity-group .filter-btn");

const TITLE_STORAGE_KEY = "r1999_board_title_v1";

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
const btnUnselectAll = document.getElementById("btn-unselect-all");

let rosterActiveRarityFilters = new Set(); // Set of active rarities in Roster Manager

// Action Buttons
const btnExportImage = document.getElementById("btn-export-image");
const btnExportData = document.getElementById("btn-export-data");
const inputImportFile = document.getElementById("input-import-file");
const btnResetData = document.getElementById("btn-reset-data");

// Initial Setup
async function initApp() {
  try {
    const [iconRes, rarityRes, arcanistRes, euphoriaRes] = await Promise.all([
      fetch("icon.json"),
      fetch("data/characters_by_rarity.json"),
      fetch("data/ArcanistMap.json"),
      fetch("data/euphoria_list.json"),
    ]);

    const iconData = await iconRes.json();
    characterDb = iconData.characters || {};

    try {
      const rarityData = await rarityRes.json();
      buildRarityMap(rarityData);
    } catch (e) {
      console.warn("Could not parse characters_by_rarity.json", e);
    }

    try {
      const arcanistData = await arcanistRes.json();
      buildIdMap(arcanistData);
    } catch (e) {
      console.warn("Could not parse ArcanistMap.json", e);
    }

    try {
      const euphoriaData = await euphoriaRes.json();
      buildEuphoriaMap(euphoriaData);
    } catch (e) {
      console.warn("Could not parse euphoria_list.json", e);
    }

    loadTitle();
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

function buildIdMap(arcanistData) {
  characterIdMap = {};
  if (Array.isArray(arcanistData)) {
    arcanistData.forEach((item) => {
      const eng = item.nameEng || item.engName;
      if (eng && item.id) {
        characterIdMap[eng] = item.id;
      }
      if (item.name && item.id) {
        characterIdMap[item.name] = item.id;
      }
    });
  }

  // Map alias names to standard names in icon.json
  for (const [standardName, aliases] of Object.entries(NAME_ALIASES)) {
    if (characterIdMap[standardName] === undefined) {
      for (const al of aliases) {
        if (characterIdMap[al] !== undefined) {
          characterIdMap[standardName] = characterIdMap[al];
          break;
        }
      }
    }
  }
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
  euphoriaAllowedNames = new Set();

  if (!euphoriaData || typeof euphoriaData !== "object") return;

  Object.entries(euphoriaData).forEach(([level, names]) => {
    if (!Array.isArray(names)) return;
    const tier = Number(level);
    if (!Number.isInteger(tier) || tier < 1 || tier > 2) return;

    names.forEach((rawName) => {
      const canonical = resolveCharacterName(rawName);
      if (!canonical) return;
      if (!euphoriaOptionsByName[canonical]) euphoriaOptionsByName[canonical] = [];
      if (!euphoriaOptionsByName[canonical].includes(tier)) {
        euphoriaOptionsByName[canonical].push(tier);
      }
      euphoriaAllowedNames.add(canonical);
    });
  });

  Object.keys(euphoriaOptionsByName).forEach((name) => {
    euphoriaOptionsByName[name].sort((a, b) => a - b);
  });
}

function getEligibleEuphoriaLevels(name) {
  const canonical = resolveCharacterName(name);
  if (!canonical) return [];
  return Array.isArray(euphoriaOptionsByName[canonical]) ? [...euphoriaOptionsByName[canonical]] : [];
}

function isCharacterEligibleForEuphoria(name) {
  return getEligibleEuphoriaLevels(name).length > 0;
}

function sanitizeEuphoriaState(name, char) {
  const eligibleLevels = getEligibleEuphoriaLevels(name);
  if (!eligibleLevels.length) {
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
function loadRoster() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      userRoster = JSON.parse(saved);
    } catch (e) {
      userRoster = {};
    }
  }

  // Ensure all characters from icon.json exist in roster with default values (default unowned)
  let changed = false;
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
      if (userRoster[name].boxKind === undefined) {
        userRoster[name].boxKind = "none";
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

// Render Showcase Board
function renderShowcase() {
  const query = filterSearch.value.trim().toLowerCase();

  // Clear all lists
  r15List.innerHTML = "";
  r11to14List.innerHTML = "";
  r10List.innerHTML = "";
  r1to9List.innerHTML = "";
  unownedList.innerHTML = "";

  let ownedCount = 0;
  let totalCount = 0;

  const allNames = Object.keys(characterDb);
  const ownedNames = [];
  const unownedNames = [];

  allNames.forEach((name) => {
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

  // Filter and populate owned characters
  ownedNames.forEach((name) => {
    if (query && !name.toLowerCase().includes(query)) return;
    if (activeOwnershipFilter === "unowned") return;
    const rarity = getCharacterRarity(name);
    if (activeRarityFilters.size > 0 && !activeRarityFilters.has(rarity)) return;

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

    if (char.resonance >= 15) {
      r15List.appendChild(card);
    } else if (char.resonance >= 11) {
      r11to14List.appendChild(card);
    } else if (char.resonance === 10) {
      r10List.appendChild(card);
    } else {
      r1to9List.appendChild(card);
    }
  });

  // Filter and populate unowned characters
  unownedNames.forEach((name) => {
    if (query && !name.toLowerCase().includes(query)) return;
    if (activeOwnershipFilter === "owned") return;
    const rarity = getCharacterRarity(name);
    if (activeRarityFilters.size > 0 && !activeRarityFilters.has(rarity)) return;

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
    unownedList.appendChild(card);
  });

  rosterStat.textContent = `${ownedCount}/${totalCount} Owned`;
}

// Create Character Card Element
function createCharacterCard(name, char, iconUrl) {
  const card = document.createElement("div");
  card.className = `char-card ${!char.owned ? "is-unowned" : ""}`;
  const insightVal = char.insight !== undefined ? char.insight : 3;
  const levelVal = char.level !== undefined ? char.level : 60;
  card.title = `${name}\nInsight: I${insightVal} Lv.${levelVal}\nResonance: R${char.resonance}\nPortrait: P${char.portrait}`;

  // Euphoria / Pattern string e.g. "E1 E2" or "E1" or "E2"
  let euphoriaText = "";
  if (char.e2 && char.e1) euphoriaText = "E1 E2";
  else if (char.e2) euphoriaText = "E2";
  else if (char.e1) euphoriaText = "E1";

  const boxKind = char.boxKind || "none";
  const resonanceColor = getCardResonanceTextColor(boxKind);

  // Portrait dashes: 5 total slots (P0 = 0 dashes, P1 = 1 active dash, ... P5 = 5 active dashes)
  const dashesHtml = char.owned
    ? Array.from({ length: 5 }, (_, i) => `<span class="portrait-dash ${i < char.portrait ? "active" : ""}"></span>`).join("")
    : "";

  let topHeaderHtml = "";
  if (!char.owned) {
    topHeaderHtml = `<div class="char-top-info"><span class="char-unowned-name">${escapeHtml(name)}</span></div>`;
  } else {
    topHeaderHtml = `
      <div class="char-top-info">
        <span class="badge-resonance ${boxKind}" style="color: ${resonanceColor};">R${char.resonance}</span>
        <div class="badge-insight-level">
          <img src="images/insight_icon/I${insightVal}.png" alt="I${insightVal}" class="badge-insight-img" />
          <span class="badge-level-text">${levelVal}</span>
        </div>
      </div>
    `;
  }

  let portraitBarHtml = "";
  if (char.owned) {
    portraitBarHtml = `
      <div class="char-portrait-bar-below">
        ${dashesHtml}
      </div>
      ${euphoriaText ? `<div class="char-bottom-euphoria"><span class="badge-euphoria-bottom">${euphoriaText}</span></div>` : ""}
    `;
  }

  card.innerHTML = `
    ${topHeaderHtml}
    <div class="char-avatar-box">
      <img src="${escapeHtml(iconUrl)}" alt="${escapeHtml(name)}" class="char-avatar-img" loading="lazy" />
    </div>
    ${portraitBarHtml}
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

  const sanitizedEuphoria = sanitizeEuphoriaState(name, char);
  tempEditState = {
    ...char,
    insight: insight,
    level: level,
    resonance: Math.max(1, Number(char.resonance || 1)),
    boxKind: char.boxKind || "none",
    e1: sanitizedEuphoria.e1,
    e2: sanitizedEuphoria.e2,
  };

  modalCharName.textContent = name;
  modalCharImg.src = characterDb[name];
  modalCharStatus.textContent = tempEditState.owned ? "Owned" : "Unowned";

  updateModalView();
  editModal.style.display = "flex";
}

function updateModalView() {
  if (tempEditState.owned) {
    btnStatusOwned.classList.add("active");
    btnStatusUnowned.classList.remove("active");
    groupInsight.style.display = "flex";
    groupLevel.style.display = "flex";
    groupResonance.style.display = "flex";
    groupPattern.style.display = tempEditState.resonance >= 10 ? "flex" : "none";
    groupPortrait.style.display = "flex";
    groupEuphoria.style.display = "flex";
  } else {
    btnStatusOwned.classList.remove("active");
    btnStatusUnowned.classList.add("active");
    groupInsight.style.display = "none";
    groupLevel.style.display = "none";
    groupResonance.style.display = "none";
    groupPattern.style.display = "none";
    groupPortrait.style.display = "none";
    groupEuphoria.style.display = "none";
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
  inputResonance.value = tempEditState.resonance;
  displayResonance.textContent = `R${tempEditState.resonance}`;
  displayResonance.style.color = getResonanceTextColor(tempEditState.boxKind || "none");

  // If resonance < 10, pattern is reset to none
  if (tempEditState.resonance < 10) {
    tempEditState.boxKind = "none";
  }

  document.querySelectorAll(".btn-pill").forEach((btn) => {
    const isActive = Number(btn.dataset.r) === tempEditState.resonance;
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

  // Portrait bar in modal
  modalPortraitBarPreview.innerHTML = Array.from(
    { length: 5 },
    (_, i) => `<span class="bar ${i < tempEditState.portrait ? "active" : ""}"></span>`
  ).join("");

  // Euphoria
  const eligibleEuphoriaLevels = getEligibleEuphoriaLevels(currentEditingName || "");
  const isEuphoriaEligible = eligibleEuphoriaLevels.length > 0;
  if (tempEditState.owned) {
    groupEuphoria.style.display = isEuphoriaEligible ? "flex" : "none";
  }

  if (!isEuphoriaEligible) {
    tempEditState.e1 = false;
    tempEditState.e2 = false;
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
  const finalE1 = eligibleEuphoriaLevels.includes(1) && checkE1.checked;
  const finalE2 = eligibleEuphoriaLevels.includes(2) && checkE2.checked;

  userRoster[currentEditingName] = {
    owned: tempEditState.owned,
    insight: tempEditState.insight !== undefined ? tempEditState.insight : 3,
    level: Number(inputLevel.value),
    resonance: Number(inputResonance.value),
    portrait: tempEditState.portrait,
    e1: finalE1,
    e2: finalE2,
    boxKind: tempEditState.boxKind || "none",
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
      updateModalView();
    });
  });

  // Level slider
  inputLevel.addEventListener("input", (e) => {
    tempEditState.level = Number(e.target.value);
    displayLevel.textContent = `Lv.${tempEditState.level}`;
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

  modalBtnClose.addEventListener("click", closeEditModal);
  modalBtnSave.addEventListener("click", saveEditModal);
  editModal.addEventListener("click", (e) => {
    if (e.target === editModal) closeEditModal();
  });

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

  btnSelectAll.addEventListener("click", () => {
    for (const name in userRoster) userRoster[name].owned = true;
    saveRoster();
    renderRosterManager();
    renderShowcase();
  });

  btnUnselectAll.addEventListener("click", () => {
    for (const name in userRoster) userRoster[name].owned = false;
    saveRoster();
    renderRosterManager();
    renderShowcase();
  });

  // Export PNG via html2canvas
  btnExportImage.addEventListener("click", async () => {
    const board = document.getElementById("showcase-board");
    btnExportImage.textContent = "Rendering...";
    btnExportImage.disabled = true;

    try {
      const canvas = await html2canvas(board, {
        backgroundColor: "#000000",
        scale: 2, // high quality
        useCORS: true,
        logging: false,
      });

      const link = document.createElement("a");
      link.download = `Sothebys_Mansion_${new Date().toISOString().slice(0, 10)}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      console.error("Export failed:", err);
      alert("Failed to export image.");
    } finally {
      btnExportImage.textContent = "Export PNG";
      btnExportImage.disabled = false;
    }
  });

  // Export JSON
  btnExportData.addEventListener("click", () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(userRoster, null, 2));
    const link = document.createElement("a");
    link.download = `r1999_roster_${new Date().toISOString().slice(0, 10)}.json`;
    link.href = dataStr;
    link.click();
  });

  // Import JSON
  inputImportFile.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const imported = JSON.parse(event.target.result);
        if (typeof imported === "object") {
          userRoster = imported;
          saveRoster();
          renderShowcase();
          alert("Roster imported successfully!");
        }
      } catch (err) {
        alert("Invalid JSON file.");
      }
    };
    reader.readAsText(file);
  });

  // Reset Data
  btnResetData.addEventListener("click", () => {
    if (confirm("Are you sure you want to reset all character levels to default?")) {
      localStorage.removeItem(STORAGE_KEY);
      loadRoster();
      renderShowcase();
    }
  });
}

// Outside modal label: white default for None, else pattern colors.
function getResonanceTextColor(boxKind) {
  switch (boxKind) {
    case "offensive":
      return "#FBAE31";
    case "defensive":
      return "#2d8a5a";
    case "hp":
      return "#d4ad2b";
    case "equibalance":
      return "#3b6dc7";
    case "none":
    default:
      return "#4f4f4f";
  }
}

// Inside roster card label: gray default for None, else pattern colors.
function getCardResonanceTextColor(boxKind) {
  switch (boxKind) {
    case "offensive":
      return "#FBAE31";
    case "defensive":
      return "#2d8a5a";
    case "hp":
      return "#d4ad2b";
    case "equibalance":
      return "#3b6dc7";
    case "none":
    default:
      return "#4f4f4f";
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
