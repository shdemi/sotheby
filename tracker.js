/**
 * Pull Tracker for Sotheby's Mansion — Headhunting Records Split-Pane Layout.
 *
 * Left rail: Overall & per-pool selector (All, Character, Event, Special, Standard)
 *            with live pity bars, 6✦ Avg, 50/50 WR, and clickable banner list.
 * Right pane: Selected Pool/Banner KPI cards, Pity Gauge, 6✦ Pity-Bar Timeline,
 *             and searchable/editable Pull History Table.
 */
(function () {
  const TRACKER_STORAGE_KEY = "r1999_pull_tracker_v1";
  const DUSHUO_RATEUP_KEY = "r1999_pull_tracker_dushuo_v1";
  const COMPACT_VIEW_KEY = "r1999_pull_tracker_compact_v1";
  const TESSERACT_CDN = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";

  const SPECIAL_ARCANISTS = [
    "The Golden Thread I",
    "The Golden Thread II",
    "The Golden Thread III",
  ];

  const SPECIAL_BANNER_NAMES = new Set([
    "Invitation From the Water",
    "Invitation from the Water",
    "Abundance of the Water",
    "Abundance of the Water: The First Milestone",
    "Yearning of the Water",
    "Revelation of the Water",
    "Promise of the Water",
    "Boon of the Water",
    "Golden Spindle",
    "Ripples on the Water",
    "The Snow of Dushuo",
    "From the Lake's Heart",
  ]);

  const BANNER_ALIASES = {
    "the myth at her fingertips": "myth at her fingertips",
    "abundance of the water": "abundance of the water: the first milestone",
  };

  const EVENT_LIMITED_NAMES = new Set([
    "Till the Last Drop",
    "Thoughts in Cylinder",
    "Longing for Innocence",
    "Moonbeam Guardian",
    "A Prophet Guided by Time",
    "Wine-Dark Reflections of the Eagle",
    "The Myth at Her Fingertips",
    "Myth at Her Fingertips",
    "On Fate's Cue",
    "Her Heart-Cut Spring",
    "Analysis of Metallic Dramaturgy",
    "A Newly Hatched Chapter",
  ]);

  let pulls = [];
  let selectedPool = "all"; // "all" | "char" | "event" | "special" | "standard"
  let selectedBanner = null; // null or banner name string
  let showcaseCompact = localStorage.getItem(COMPACT_VIEW_KEY) === "1";
  let dushuoRateUp = localStorage.getItem(DUSHUO_RATEUP_KEY) || "";
  let historySearch = "";
  let historyRarities = new Set([6]);
  let historyPage = 1;
  const HISTORY_PAGE_SIZE = 10;
  let editingRowIndex = -1;

  let bannersLoaded = false;
  let bannerMetaMap = new Map();
  let yearningRuns = []; // [{ startMs, endMs, targets: Set<string> }]
  let dushuoTargets = []; // string[]
  let allBannerNames = [];
  let rarityMap = {};
  let allArcanistNames = [];
  let isScanning = false;

  function tr(key, fallback) {
    if (typeof t === "function") {
      const val = t(key);
      if (val && val !== key) return val;
    }
    return fallback || key;
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function notify(msg) {
    if (typeof showToast === "function") showToast(msg);
    else console.log("[PullTracker]", msg);
  }

  const ARCANIST_ALIASES = {
    "3uma": "Зима",
    "liang": "Liang Yue",
    "ezra theodore": "Ezra",
    "joe": "J",
    "matilda bouanich": "Matilda",
    "six": "6",
    "thirty-seven": "37",
    "alien t": "AliEn T",
    "авксивий": "Avgust",
    "вила": "Vila",
    "енисей": "Yenisei",
  };

  function loadPullsFromStorage() {
    try {
      const raw = localStorage.getItem(TRACKER_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      const normalized = parsed
        .filter((p) => p && p.arcanist && p.banner && !isNaN(Number(p.timestamp)))
        .map((p) => ({ ...p, arcanist: normalizeArcanistName(p.arcanist) }));
      // Ensure oldest-first chronological order so 10-pulls with identical timestamps preserve exact order
      if (normalized.length > 1 && Number(normalized[0].timestamp) > Number(normalized[normalized.length - 1].timestamp)) {
        normalized.reverse();
      }
      return normalized;
    } catch {
      return [];
    }
  }

  function savePullsToStorage() {
    try {
      localStorage.setItem(TRACKER_STORAGE_KEY, JSON.stringify(pulls));
    } catch (e) {
      console.error("Failed to save pull tracker data", e);
    }
  }

  function normalizeArcanistName(name) {
    const clean = String(name || "").trim();
    if (!clean) return "";
    const alias = ARCANIST_ALIASES[clean.toLowerCase()];
    return alias || clean;
  }

  function getArcanistRarity(name, fallbackRarity) {
    const norm = normalizeArcanistName(name);
    if (norm.startsWith("The Golden Thread")) return 6;
    if (rarityMap[norm]) return rarityMap[norm];
    const r = Number(fallbackRarity);
    return r >= 2 && r <= 6 ? r : 3;
  }

  function getArcanistIcon(name) {
    const norm = normalizeArcanistName(name);
    if (typeof characterDb !== "undefined" && characterDb[norm]) {
      return characterDb[norm];
    }
    return "images/items/icon/140001.png";
  }

  function getArcanistLabel(name) {
    const norm = normalizeArcanistName(name);
    if (typeof getCharacterDisplayName === "function" && typeof characterDb !== "undefined" && characterDb[norm]) {
      return getCharacterDisplayName(norm);
    }
    return norm;
  }

  async function ensureMetadataLoaded() {
    if (bannersLoaded) return;
    bannersLoaded = true;
    try {
      const [bannersRes, raritiesRes] = await Promise.all([
        fetch("data/banners.json").then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch("data/characters_by_rarity.json").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);

      if (raritiesRes) {
        for (const [rStr, list] of Object.entries(raritiesRes)) {
          const rNum = Number(rStr);
          if (Array.isArray(list)) {
            list.forEach((n) => {
              rarityMap[n] = rNum;
            });
          }
        }
      }

      if (typeof characterDb !== "undefined") {
        allArcanistNames = Array.from(new Set([...Object.keys(characterDb), ...Object.keys(rarityMap), ...SPECIAL_ARCANISTS]));
      } else {
        allArcanistNames = Array.from(new Set([...Object.keys(rarityMap), ...SPECIAL_ARCANISTS]));
      }

      const nameSet = new Set();
      if (bannersRes && Array.isArray(bannersRes.banners)) {
        bannersRes.banners.forEach((b) => {
          if (!b || !b.name) return;
          nameSet.add(b.name);
          const key = b.name.toLowerCase();
          const cat = classifyBannerMeta(b);
          const existing = bannerMetaMap.get(key);
          const targets = new Set((b.targets || []).map((x) => x.name));
          const fiveStar = new Set((b.fiveStar || []).map((x) => x.name));

          if (key === "yearning of the water" && b.server === "global" && b.start && b.end && targets.size > 0) {
            yearningRuns.push({
              startMs: new Date(b.start + "T00:00:00Z").getTime() - 2 * 86400000,
              endMs: new Date(b.end + "T23:59:59Z").getTime() + 2 * 86400000,
              targets,
            });
          }
          if (key === "the snow of dushuo" && targets.size > 0 && dushuoTargets.length === 0) {
            dushuoTargets = Array.from(targets).sort();
          }

          if (!existing) {
            bannerMetaMap.set(key, {
              name: b.name,
              category: cat,
              targets,
              fiveStar,
              track: b.rule?.track || "solo",
              kind: b.rule?.kind || "none",
              version: b.version || "",
            });
          } else {
            targets.forEach((tName) => existing.targets.add(tName));
            fiveStar.forEach((fName) => existing.fiveStar.add(fName));
          }
        });
      }
      SPECIAL_BANNER_NAMES.forEach((n) => nameSet.add(n));
      EVENT_LIMITED_NAMES.forEach((n) => nameSet.add(n));
      nameSet.add("Amongst the Lake");
      nameSet.add("The First Drop of Rain");
      allBannerNames = Array.from(nameSet);
    } catch (e) {
      console.warn("Could not load tracker metadata", e);
    }
  }

  function classifyBannerMeta(b) {
    const type = String(b.type || "");
    const name = String(b.name || "");
    const nl = name.toLowerCase();
    if (type === "Beginner" || name === "The First Drop of Rain") return "beginner";
    if (type === "Standard" || name === "Amongst the Lake") return "standard";
    if (type === "Ripples" || nl === "ripples on the water" || b.rule?.track === "ripples") return "ripples";
    // Check Special Banners BEFORE Event (since Abundance / Invitation are tagged Event in banners.json)
    if (
      type === "Yearning" ||
      SPECIAL_BANNER_NAMES.has(name) ||
      nl.startsWith("abundance of the water") ||
      nl.startsWith("invitation from the water") ||
      b.rule?.kind === "thread" ||
      b.rule?.kind === "inGroup"
    ) {
      return "special";
    }
    if (type === "Limited" || type === "Event" || type === "Collab" || EVENT_LIMITED_NAMES.has(name)) return "event";
    return "char";
  }

  function getBannerInfo(bannerName) {
    const clean = String(bannerName || "").trim();
    const key = clean.toLowerCase();
    if (bannerMetaMap.has(key)) return bannerMetaMap.get(key);
    const aliasKey = BANNER_ALIASES[key] || (key.startsWith("the ") ? key.slice(4) : "");
    if (aliasKey && bannerMetaMap.has(aliasKey)) return bannerMetaMap.get(aliasKey);
    if (clean === "The First Drop of Rain") {
      return { name: clean, category: "beginner", targets: new Set(), fiveStar: new Set(), track: "solo", kind: "none", version: "1.0" };
    }
    if (clean === "Amongst the Lake") {
      return { name: clean, category: "standard", targets: new Set(), fiveStar: new Set(), track: "solo", kind: "none", version: "1.0" };
    }
    if (key === "ripples on the water") {
      return { name: clean, category: "ripples", targets: new Set(), fiveStar: new Set(), track: "ripples", kind: "none", version: "" };
    }
    if (EVENT_LIMITED_NAMES.has(clean)) {
      return { name: clean, category: "event", targets: new Set(), fiveStar: new Set(), track: "rateUp", kind: "rateUp", version: "" };
    }
    if (SPECIAL_BANNER_NAMES.has(clean)) {
      return { name: clean, category: "special", targets: new Set(), fiveStar: new Set(), track: "solo", kind: "none", version: "" };
    }
    return { name: clean, category: "char", targets: new Set(), fiveStar: new Set(), track: "rateUp", kind: "rateUp", version: "" };
  }

  function getYearningTargets(ts) {
    const run = yearningRuns.find((r) => ts >= r.startMs && ts <= r.endMs);
    return run ? run.targets : null;
  }

  function getCategoryForPull(pull) {
    return getBannerInfo(pull.banner).category;
  }

  function getAnomalyTimestamps(sortedDesc) {
    const counts = {};
    sortedDesc.forEach((p) => {
      if (p.banner === "Ripples on the Water") return;
      counts[p.timestamp] = (counts[p.timestamp] || 0) + 1;
    });
    return new Set(
      Object.entries(counts)
        .filter(([, c]) => c !== 1 && c !== 10)
        .map(([ts]) => Number(ts))
    );
  }

  function computeAnalytics() {
    const chrono = pulls
      .map((p, idx) => ({
        ...p,
        rarity: getArcanistRarity(p.arcanist, p.rarity),
        category: getCategoryForPull(p),
        _idx: idx,
      }))
      .sort((a, b) => (a.timestamp - b.timestamp) || (a._idx - b._idx));

    const trackState = new Map();
    const getTrack = (key) => {
      if (!trackState.has(key)) {
        trackState.set(key, { pity6: 0, pity5: 0, guaranteed6: false, guaranteed5: false, total: 0 });
      }
      return trackState.get(key);
    };

    const enriched = chrono.map((p, i) => {
      const info = getBannerInfo(p.banner);
      const trackKey = p.category === "char" ? "char_shared" : `${p.category}:${p.banner}`;
      const st = getTrack(trackKey);
      st.pity6 += 1;
      st.pity5 += 1;
      st.total += 1;

      let pullPity6 = null;
      let pullPity5 = null;
      let wl6 = "-";
      let wl5 = "-";

      if (p.rarity === 6) {
        pullPity6 = st.pity6;
        st.pity6 = 0;

        if (p.banner === "Ripples on the Water" || info.track === "ripples") {
          // Ripples has no 50/50 — don't count toward G or WR
          wl6 = "-";
        } else if (p.banner === "Yearning of the Water") {
          // Yearning has no guarantee — only Win (1) or Lose (0) against the 2-char pair for that run
          const yTargets = getYearningTargets(p.timestamp);
          if (yTargets && yTargets.size > 0) {
            wl6 = yTargets.has(p.arcanist) ? "W" : "L";
          }
        } else if (p.banner === "The Snow of Dushuo") {
          if (dushuoRateUp) {
            if (st.guaranteed6) {
              wl6 = "G";
              st.guaranteed6 = false;
            } else if (p.arcanist === dushuoRateUp) {
              wl6 = "W";
            } else {
              wl6 = "L";
              st.guaranteed6 = true;
            }
          }
        } else if ((p.category === "char" || p.category === "event") && info.targets.size > 0) {
          if (st.guaranteed6) {
            wl6 = "G";
            st.guaranteed6 = false;
          } else if (info.targets.has(p.arcanist)) {
            wl6 = "W";
          } else {
            wl6 = "L";
            st.guaranteed6 = true;
          }
        }
      } else if (p.rarity === 5) {
        pullPity5 = st.pity5;
        st.pity5 = 0;

        if ((p.category === "char" || p.category === "event") && info.fiveStar.size > 0) {
          if (st.guaranteed5) {
            wl5 = "G";
            st.guaranteed5 = false;
          } else if (info.fiveStar.has(p.arcanist)) {
            wl5 = "W";
          } else {
            wl5 = "L";
            st.guaranteed5 = true;
          }
        }
      }

      return {
        ...p,
        pullNumber: i + 1,
        pity6: pullPity6,
        pity5: pullPity5,
        wl6,
        wl5,
        trackKey,
      };
    });

    const summarizeList = (list, activePity6 = 0, guaranteed6 = false, activePity5 = 0) => {
      const total = list.length;
      const sixes = list.filter((x) => x.rarity === 6);
      const fives = list.filter((x) => x.rarity === 5);
      const w6 = sixes.filter((x) => x.wl6 === "W").length;
      const l6 = sixes.filter((x) => x.wl6 === "L").length;
      const g6 = sixes.filter((x) => x.wl6 === "G").length;
      const w5 = fives.filter((x) => x.wl5 === "W").length;
      const l5 = fives.filter((x) => x.wl5 === "L").length;
      const g5 = fives.filter((x) => x.wl5 === "G").length;

      const avg6 = sixes.length > 0 ? sixes.reduce((s, x) => s + (x.pity6 || 0), 0) / sixes.length : 0;
      const avg5 = fives.length > 0 ? fives.reduce((s, x) => s + (x.pity5 || 0), 0) / fives.length : 0;

      return {
        total,
        sixCount: sixes.length,
        fiveCount: fives.length,
        avg6,
        avg5,
        wr6: w6 + l6 > 0 ? (w6 / (w6 + l6)) * 100 : g6 > 0 ? 100 : null,
        wr5: w5 + l5 > 0 ? (w5 / (w5 + l5)) * 100 : g5 > 0 ? 100 : null,
        w6,
        l6,
        g6,
        w5,
        l5,
        g5,
        rate6: total > 0 ? (sixes.length / total) * 100 : 0,
        rate5: total > 0 ? (fives.length / total) * 100 : 0,
        currentPity6: activePity6,
        currentPity5: activePity5,
        guaranteed6,
      };
    };

    const byPool = {
      all: enriched,
      char: enriched.filter((x) => x.category === "char"),
      event: enriched.filter((x) => x.category === "event"),
      ripples: enriched.filter((x) => x.category === "ripples"),
      special: enriched.filter((x) => x.category === "special"),
      standard: enriched.filter((x) => x.category === "standard" || x.category === "beginner"),
    };

    const charTrack = getTrack("char_shared");
    const latestEventPull = [...byPool.event].pop();
    const latestEventTrack = latestEventPull ? getTrack(latestEventPull.trackKey) : { pity6: 0, pity5: 0, guaranteed6: false };
    const ripplesTrack = getTrack("ripples:Ripples on the Water");
    const latestSpecialPull = [...byPool.special].pop();
    const latestSpecialTrack = latestSpecialPull ? getTrack(latestSpecialPull.trackKey) : { pity6: 0, pity5: 0, guaranteed6: false };
    const standardTrack = getTrack("standard:Amongst the Lake");

    const poolSummaries = {
      all: summarizeList(byPool.all, charTrack.pity6, charTrack.guaranteed6, charTrack.pity5),
      char: summarizeList(byPool.char, charTrack.pity6, charTrack.guaranteed6, charTrack.pity5),
      event: summarizeList(byPool.event, latestEventTrack.pity6, latestEventTrack.guaranteed6, latestEventTrack.pity5),
      ripples: summarizeList(byPool.ripples, ripplesTrack.pity6, false, ripplesTrack.pity5),
      special: summarizeList(byPool.special, latestSpecialTrack.pity6, false, latestSpecialTrack.pity5),
      standard: summarizeList(byPool.standard, standardTrack.pity6, false, standardTrack.pity5),
    };

    return {
      chrono: enriched,
      desc: [...enriched].reverse(),
      byPool,
      poolSummaries,
      summarizeList,
      getTrack,
    };
  }

  function pityColorClass(pity) {
    if (pity == null) return "";
    if (pity <= 43) return "tracker-val-good";
    if (pity <= 59) return "tracker-val-mid";
    return "tracker-val-bad";
  }

  function pityBarClass(pity) {
    if (pity <= 43) return "is-good";
    if (pity <= 59) return "is-mid";
    return "is-bad";
  }

  function avgColorClass(avg, isFive = false) {
    if (!avg) return "";
    if (isFive) return avg <= 10.5 ? "tracker-val-good" : avg <= 12.5 ? "tracker-val-mid" : "tracker-val-bad";
    return avg <= 40 ? "tracker-val-good" : avg <= 50 ? "tracker-val-mid" : "tracker-val-bad";
  }

  function wrColorClass(wr) {
    if (wr == null) return "";
    return wr >= 52 ? "tracker-val-good" : wr >= 45 ? "tracker-val-mid" : "tracker-val-bad";
  }

  function renderWlTag(wl) {
    if (wl === "W") return `<span class="tracker-wl-tag is-w">WIN</span>`;
    if (wl === "L") return `<span class="tracker-wl-tag is-l">LOSE</span>`;
    if (wl === "G") return `<span class="tracker-wl-tag is-g">GUARANTEED</span>`;
    return `<span class="tracker-wl-tag is-n">—</span>`;
  }

  function renderTracker() {
    const contentEl = document.getElementById("tracker-content");
    const anomalyEl = document.getElementById("tracker-anomaly-banner");
    if (!contentEl) return;

    // Preserve scroll positions across re-renders (fixes jump-to-top on delete / pagination / filter)
    const prevDetailScroll = contentEl.querySelector(".tracker-detail")?.scrollTop || 0;
    const prevRailScroll = contentEl.querySelector(".tracker-rail")?.scrollTop || 0;

    const data = computeAnalytics();
    const anomalies = getAnomalyTimestamps(data.desc);

    if (anomalyEl) {
      if (anomalies.size > 0) {
        const list = [...anomalies]
          .slice(0, 4)
          .map((ts) => new Date(ts).toLocaleString())
          .join(", ");
        anomalyEl.style.display = "block";
        anomalyEl.textContent = `${tr("tracker.anomalyTitle", "Anomalous timestamps detected")}: ${list}${anomalies.size > 4 ? ` (+${anomalies.size - 4})` : ""}`;
      } else {
        anomalyEl.style.display = "none";
      }
    }

    if (pulls.length === 0) {
      contentEl.innerHTML = renderEmptyState();
      bindEmptyStateEvents();
      return;
    }

    contentEl.innerHTML = renderSplitLayout(data, anomalies);
    bindSplitEvents();

    const newDetail = contentEl.querySelector(".tracker-detail");
    const newRail = contentEl.querySelector(".tracker-rail");
    if (newDetail) newDetail.scrollTop = prevDetailScroll;
    if (newRail) newRail.scrollTop = prevRailScroll;
  }

  function renderEmptyState() {
    return `
      <div class="tracker-empty-wrap">
        <div class="tracker-dropzone" id="tracker-empty-dropzone">
          <img src="images/items/icon/140001.png" alt="Unilog" class="tracker-dropzone-icon" />
          <div class="tracker-dropzone-text">${escapeHtml(tr("tracker.empty", "No pull records yet."))}</div>
          <div class="tracker-dropzone-text" style="opacity:0.75;font-size:0.7rem;">${escapeHtml(tr("tracker.dropHint", "Drop or select in-game Summon Record screenshots"))}</div>
          <div class="tracker-dropzone-actions">
            <button type="button" class="btn btn-secondary btn-sm tracker-btn-accent" id="tracker-empty-upload">${escapeHtml(tr("tracker.uploadScreens", "Upload Screenshots"))}</button>
            <button type="button" class="btn btn-secondary btn-sm" id="tracker-empty-korn">${escapeHtml(tr("tracker.importKornblume", "Import from Kornblume"))}</button>
            <button type="button" class="btn btn-secondary btn-sm" id="tracker-empty-add">${escapeHtml(tr("tracker.addPull", "+ Add Pull"))}</button>
          </div>
        </div>
      </div>
    `;
  }

  function bindEmptyStateEvents() {
    document.getElementById("tracker-empty-upload")?.addEventListener("click", (e) => {
      e.stopPropagation();
      document.getElementById("tracker-ocr-input")?.click();
    });
    document.getElementById("tracker-empty-korn")?.addEventListener("click", (e) => {
      e.stopPropagation();
      document.getElementById("tracker-korn-import-input")?.click();
    });
    document.getElementById("tracker-empty-add")?.addEventListener("click", (e) => {
      e.stopPropagation();
      addManualPull();
    });
    document.getElementById("tracker-empty-dropzone")?.addEventListener("click", () => {
      document.getElementById("tracker-ocr-input")?.click();
    });
  }

  function renderSplitLayout(data, anomalies) {
    const pools = [
      { id: "all", label: tr("tracker.totalSummary", "All Pools") },
      { id: "char", label: tr("tracker.cat.char", "Character (Rate-Up)") },
      { id: "ripples", label: "Ripples on the Water" },
      { id: "event", label: tr("tracker.cat.event", "Event / Limited") },
      { id: "special", label: tr("tracker.cat.special", "Special Banners") },
      { id: "standard", label: `${tr("tracker.cat.standard", "Standard")} & ${tr("tracker.cat.beginner", "Beginner")}` },
    ];

    const railPoolsHtml = pools
      .map((p) => {
        const s = data.poolSummaries[p.id];
        const active = selectedPool === p.id && !selectedBanner;
        const noSharedPity = p.id === "all" || p.id === "event" || p.id === "special";
        const pityRowHtml = noSharedPity
          ? `
            <div class="tracker-pool-pities">
              <div class="tracker-pool-pity-item">
                <span class="tracker-pool-pity-val is-six">${s.sixCount}</span>
                <span class="tracker-pool-pity-lbl">6✦ Total</span>
              </div>
              <div class="tracker-pool-pity-item">
                <span class="tracker-pool-pity-val is-five">${s.fiveCount}</span>
                <span class="tracker-pool-pity-lbl">5✦ Total</span>
              </div>
            </div>`
          : `
            <div class="tracker-pool-pities">
              <div class="tracker-pool-pity-item">
                <span class="tracker-pool-pity-val is-six">${s.currentPity6}/70</span>
                <span class="tracker-pool-pity-lbl">6✦ Pity</span>
              </div>
              <div class="tracker-pool-pity-item">
                <span class="tracker-pool-pity-val is-five">${s.currentPity5}/20</span>
                <span class="tracker-pool-pity-lbl">5✦ Pity</span>
              </div>
            </div>`;
        return `
          <button type="button" class="tracker-pool-card ${active ? "is-active" : ""}" data-select-pool="${p.id}">
            <div class="tracker-pool-top">
              <span class="tracker-pool-name">${escapeHtml(p.label)}</span>
              <span class="tracker-pool-count">${s.total}</span>
            </div>
            ${pityRowHtml}
          </button>
        `;
      })
      .join("");

    // Filter pulls for the right detail pane
    const poolChrono = data.byPool[selectedPool] || data.chrono;
    const activeChrono = selectedBanner ? poolChrono.filter((x) => x.banner === selectedBanner) : poolChrono;
    const activeDesc = [...activeChrono].reverse();

    // Overview Highlights for the Left Rail (from current pool)
    const sixesPool = poolChrono.filter((x) => x.rarity === 6 && x.pity6 != null);
    const earlyCount = sixesPool.filter((x) => x.pity6 <= 43).length;
    const softCount = sixesPool.filter((x) => x.pity6 >= 60).length;
    const earlyPct = sixesPool.length ? ((earlyCount / sixesPool.length) * 100).toFixed(0) + "%" : "—";
    const softPct = sixesPool.length ? ((softCount / sixesPool.length) * 100).toFixed(0) + "%" : "—";

    let curWinStreak = 0;
    let bestWinStreak = 0;
    let runWin = 0;
    let curLoseStreak = 0;
    let worstLoseStreak = 0;
    let runLose = 0;
    sixesPool.forEach((x) => {
      if (x.wl6 === "W") {
        runWin += 1;
        if (runWin > bestWinStreak) bestWinStreak = runWin;
        runLose = 0;
      } else if (x.wl6 === "L") {
        runLose += 1;
        if (runLose > worstLoseStreak) worstLoseStreak = runLose;
        runWin = 0;
      }
    });
    for (let i = sixesPool.length - 1; i >= 0; i--) {
      if (sixesPool[i].wl6 === "W") curWinStreak += 1;
      else if (sixesPool[i].wl6 === "L") break;
    }
    for (let i = sixesPool.length - 1; i >= 0; i--) {
      if (sixesPool[i].wl6 === "L") curLoseStreak += 1;
      else if (sixesPool[i].wl6 === "W") break;
    }

    const c6 = poolChrono.filter((x) => x.rarity === 6).length;
    const c5 = poolChrono.filter((x) => x.rarity === 5).length;
    const c4 = poolChrono.filter((x) => x.rarity === 4).length;
    const c3 = poolChrono.filter((x) => x.rarity === 3).length;
    const c2 = poolChrono.filter((x) => x.rarity === 2).length;
    const tot = poolChrono.length || 1;
    const r6p = (c6 / tot) * 100;
    const r5p = (c5 / tot) * 100;
    const r4p = (c4 / tot) * 100;
    const r3p = Math.max(0, 100 - r6p - r5p - r4p);

    const railHighlightsHtml = `
      <div class="tracker-rail-highlights">
        <div class="tracker-hl-row">
          <span>Early (≤43) / Soft (≥60)</span>
          <span class="tracker-hl-val">${earlyPct} / ${softPct}</span>
        </div>
        <div class="tracker-hl-row">
          <span>50/50 Win Streak (Cur / Best)</span>
          <span class="tracker-hl-val tracker-val-good">${curWinStreak}W / ${bestWinStreak}W</span>
        </div>
        <div class="tracker-hl-row">
          <span>50/50 Lose Streak (Cur / Worst)</span>
          <span class="tracker-hl-val tracker-val-bad">${curLoseStreak}L / ${worstLoseStreak}L</span>
        </div>
        <div class="tracker-rarity-stack" title="6✦ ${r6p.toFixed(1)}% • 5✦ ${r5p.toFixed(1)}% • 4✦ ${r4p.toFixed(1)}% • 2-3✦ ${r3p.toFixed(1)}%">
          <div class="tracker-rarity-seg-6" style="width:${r6p.toFixed(2)}%"></div>
          <div class="tracker-rarity-seg-5" style="width:${r5p.toFixed(2)}%"></div>
          <div class="tracker-rarity-seg-4" style="width:${r4p.toFixed(2)}%"></div>
          <div class="tracker-rarity-seg-3" style="width:${r3p.toFixed(2)}%"></div>
        </div>
        <div class="tracker-rarity-legend">
          <span><i class="tracker-dot is-6"></i>6✦ ${c6}</span>
          <span><i class="tracker-dot is-5"></i>5✦ ${c5}</span>
          <span><i class="tracker-dot is-4"></i>4✦ ${c4}</span>
          <span><i class="tracker-dot is-3"></i>3✦ ${c3}</span>
          <span><i class="tracker-dot is-2"></i>2✦ ${c2}</span>
        </div>
      </div>
    `;

    let activeSummary;
    if (selectedBanner) {
      const sample = activeChrono[0];
      const trk = sample ? data.getTrack(sample.trackKey) : { pity6: 0, guaranteed6: false };
      activeSummary = data.summarizeList(activeChrono, trk.pity6, trk.guaranteed6);
    } else {
      activeSummary = data.poolSummaries[selectedPool];
    }

    const activeTitle = selectedBanner
      ? selectedBanner
      : pools.find((p) => p.id === selectedPool)?.label || tr("tracker.totalSummary", "All Pools");

    const pityPct = Math.min(100, Math.round((activeSummary.currentPity6 / 70) * 100));
    // On a single banner view, compute avg from pulls on that banner (avoid carryover > total) & hide Current Pity
    const dispAvg6 = selectedBanner
      ? activeSummary.sixCount > 0 ? activeSummary.total / activeSummary.sixCount : 0
      : activeSummary.avg6;
    const dispAvg5 = selectedBanner
      ? activeSummary.fiveCount > 0 ? activeSummary.total / activeSummary.fiveCount : 0
      : activeSummary.avg5;

    const hideCurrentPity = selectedPool === "all" || selectedPool === "event" || selectedPool === "special" || Boolean(selectedBanner);
    const currentPityCardHtml = hideCurrentPity
      ? ""
      : `
        <div class="tracker-kpi-card">
          <div class="tracker-kpi-label">
            <span>${escapeHtml(tr("tracker.currentPity", "Current Pity"))}</span>
            <span class="tracker-badge-pill ${activeSummary.guaranteed6 ? "is-guaranteed" : "is-5050"}">${activeSummary.guaranteed6 ? escapeHtml(tr("tracker.guaranteed", "Guaranteed")) : escapeHtml(tr("tracker.fiftyFifty", "50/50"))}</span>
          </div>
          <div class="tracker-kpi-num">${activeSummary.currentPity6} <span style="font-size:0.78rem;color:var(--text-muted);font-family:var(--mono-font);">/ 70</span></div>
          <div class="tracker-pity-bar-wrap">
            <div class="tracker-pity-bar-track">
              <div class="tracker-pity-bar-fill" style="width:${pityPct}%"></div>
            </div>
          </div>
        </div>
      `;

    const kpiHtml = `
      <div class="tracker-kpi-grid ${hideCurrentPity ? "is-3col" : ""}">
        <div class="tracker-kpi-card is-highlight">
          <div class="tracker-kpi-label">
            <span>${escapeHtml(tr("tracker.summons", "Summons"))}</span>
          </div>
          <div class="tracker-kpi-num">${activeSummary.total.toLocaleString()}</div>
          <div class="tracker-kpi-foot">
            <span>6✦: ${activeSummary.sixCount} (${activeSummary.rate6.toFixed(2)}%)</span>
            <span>5✦: ${activeSummary.fiveCount} (${activeSummary.rate5.toFixed(2)}%)</span>
          </div>
        </div>

        <div class="tracker-kpi-card">
          <div class="tracker-kpi-label">
            <span>${escapeHtml(tr("tracker.sixStarStats", "6✦ Summary"))}</span>
            <span>${activeSummary.w6}W / ${activeSummary.l6}L${activeSummary.g6 ? ` / ${activeSummary.g6}G` : ""}</span>
          </div>
          <div class="tracker-kpi-num ${avgColorClass(dispAvg6, false)}">${dispAvg6 ? dispAvg6.toFixed(2) : "—"} <span style="font-size:0.7rem;color:var(--text-muted);font-family:var(--mono-font);">avg</span></div>
          <div class="tracker-kpi-foot">
            <span>${escapeHtml(tr("tracker.winRate5050", "50/50 WR"))}</span>
            <span class="${wrColorClass(activeSummary.wr6)}" style="font-weight:700;">${activeSummary.wr6 != null ? activeSummary.wr6.toFixed(2) + "%" : "—"}</span>
          </div>
        </div>

        <div class="tracker-kpi-card">
          <div class="tracker-kpi-label">
            <span>${escapeHtml(tr("tracker.fiveStarStats", "5✦ Summary"))}</span>
            <span>${activeSummary.w5}W / ${activeSummary.l5}L${activeSummary.g5 ? ` / ${activeSummary.g5}G` : ""}</span>
          </div>
          <div class="tracker-kpi-num ${avgColorClass(dispAvg5, true)}">${dispAvg5 ? dispAvg5.toFixed(2) : "—"} <span style="font-size:0.7rem;color:var(--text-muted);font-family:var(--mono-font);">avg</span></div>
          <div class="tracker-kpi-foot">
            <span>${escapeHtml(tr("tracker.winRate5050", "50/50 WR"))}</span>
            <span class="${wrColorClass(activeSummary.wr5)}" style="font-weight:700;">${activeSummary.wr5 != null ? activeSummary.wr5.toFixed(2) + "%" : "—"}</span>
          </div>
        </div>

        ${currentPityCardHtml}
      </div>
    `;

    // 6✦ Showcase (Timeline vs Compact Grid)
    const sixesDesc = activeDesc.filter((p) => p.rarity === 6);
    const recordsHtml =
      sixesDesc.length === 0
        ? `<div style="padding:14px;text-align:center;font-family:var(--mono-font);font-size:0.72rem;color:var(--text-muted);">${escapeHtml(tr("tracker.noPullsInCat", "No 6✦ pulls in this selection"))}</div>`
        : showcaseCompact
          ? `<div class="tracker-compact-grid">${sixesDesc
              .map((p) => {
                const pity = p.pity6 ?? 0;
                const pCls = pity <= 43 ? "" : pity <= 59 ? "is-mid" : "is-bad";
                const wlCls = p.wl6 === "W" || p.wl6 === "G" ? "is-win" : p.wl6 === "L" ? "is-lose" : "";
                const spark = p.wl6 === "W" || p.wl6 === "G" ? `<span class="tracker-compact-spark">✦</span>` : "";
                return `
                  <div class="tracker-compact-item" data-select-banner="${escapeHtml(p.banner)}" data-c-name="${escapeHtml(getArcanistLabel(p.arcanist))}" data-c-banner="${escapeHtml(p.banner)}" data-c-pity="${pity}" data-c-wl="${escapeHtml(p.wl6)}" data-c-date="${escapeHtml(new Date(p.timestamp).toLocaleDateString())}">
                    <img src="${escapeHtml(getArcanistIcon(p.arcanist))}" alt="${escapeHtml(getArcanistLabel(p.arcanist))}" class="tracker-compact-avatar" loading="lazy" />
                    ${spark}
                    <span class="tracker-compact-pity ${pCls}">${p.pity6 ?? "?"}</span>
                  </div>
                `;
              })
              .join("")}</div>`
          : sixesDesc
              .map((p) => {
                const barPct = Math.min(100, Math.round(((p.pity6 || 0) / 70) * 100));
                return `
                  <div class="tracker-record-row">
                    <img src="${escapeHtml(getArcanistIcon(p.arcanist))}" alt="" class="tracker-record-avatar" loading="lazy" />
                    <div class="tracker-record-info">
                      <span class="tracker-record-name">${escapeHtml(getArcanistLabel(p.arcanist))}</span>
                      <button type="button" class="tracker-record-banner-btn" data-select-banner="${escapeHtml(p.banner)}" title="View banner pulls">${escapeHtml(p.banner)}</button>
                    </div>
                    <div class="tracker-record-bar-cell">
                      <div class="tracker-record-bar-track">
                        <div class="tracker-record-bar-fill ${pityBarClass(p.pity6 || 0)}" style="width:${barPct}%"></div>
                      </div>
                      <span class="tracker-record-pity-num ${pityColorClass(p.pity6)}">${p.pity6 ?? "?"}</span>
                    </div>
                    <div>${renderWlTag(p.wl6)}</div>
                    <div class="tracker-record-date">${new Date(p.timestamp).toLocaleDateString()}</div>
                  </div>
                `;
              })
              .join("");

    const hasDushuo = selectedBanner === "The Snow of Dushuo";
    const dushuoPickerHtml = hasDushuo && dushuoTargets.length > 0
      ? `<select id="tracker-dushuo-select" class="tracker-select-sm" title="Select your rate-up for The Snow of Dushuo">
          <option value="">Dushuo Rate-Up…</option>
          ${dushuoTargets.map((n) => `<option value="${escapeHtml(n)}" ${dushuoRateUp === n ? "selected" : ""}>${escapeHtml(getArcanistLabel(n))}</option>`).join("")}
        </select>`
      : "";

    // Full History Table for this selection
    const q = historySearch.trim().toLowerCase();
    const filteredHistory = activeDesc.filter((p) => {
      if (historyRarities.size > 0 && !historyRarities.has(p.rarity)) return false;
      if (q) {
        const hay = `${p.arcanist} ${getArcanistLabel(p.arcanist)} ${p.banner}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const totalPages = Math.max(1, Math.ceil(filteredHistory.length / HISTORY_PAGE_SIZE));
    if (historyPage > totalPages) historyPage = totalPages;
    const start = (historyPage - 1) * HISTORY_PAGE_SIZE;
    const pageRows = filteredHistory.slice(start, start + HISTORY_PAGE_SIZE);

    const historyRowsHtml = pageRows
      .map((p) => {
        const isEditing = editingRowIndex === p._idx;
        const isAnomaly = anomalies.has(p.timestamp);
        const rowClass = `${p.rarity === 6 ? "is-r6" : p.rarity === 5 ? "is-r5" : ""} ${isAnomaly ? "is-anomaly" : ""}`;
        if (isEditing) {
          const dtLocal = new Date(p.timestamp - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 19);
          return `
            <tr class="${rowClass}">
              <td>#${p.pullNumber}</td>
              <td><input type="text" id="tracker-edit-arcanist" class="tracker-inline-input" list="tracker-arcanist-datalist" value="${escapeHtml(p.arcanist)}" style="width:140px;" /></td>
              <td><input type="text" id="tracker-edit-banner" class="tracker-inline-input" list="tracker-banner-datalist" value="${escapeHtml(p.banner)}" style="width:170px;" /></td>
              <td>-</td>
              <td><input type="datetime-local" step="1" id="tracker-edit-date" class="tracker-inline-input" value="${dtLocal}" /></td>
              <td style="white-space:nowrap;">
                <button type="button" class="btn btn-secondary btn-sm tracker-btn-accent" data-save-idx="${p._idx}">${escapeHtml(tr("tracker.save", "Save"))}</button>
                <button type="button" class="btn btn-secondary btn-sm" data-cancel-edit="1">✕</button>
              </td>
            </tr>
          `;
        }
        const pityCell = p.rarity === 6 ? `<span style="color:#ED7D31;font-weight:700;">${p.pity6}</span>` : p.rarity === 5 ? `<span style="color:#F6C34A;font-weight:700;">${p.pity5}</span>` : "—";
        const starTag = p.rarity >= 5 ? ` (${p.rarity}✦)` : "";
        return `
          <tr class="${rowClass}">
            <td>#${p.pullNumber}</td>
            <td class="tracker-cell-name">
              <div style="display:flex;align-items:center;justify-content:center;gap:7px;">
                <img src="${escapeHtml(getArcanistIcon(p.arcanist))}" alt="" class="tracker-pull-avatar" loading="lazy" />
                <span>${escapeHtml(getArcanistLabel(p.arcanist))}${starTag}</span>
              </div>
            </td>
            <td>${escapeHtml(p.banner)}</td>
            <td>${pityCell}</td>
            <td style="font-family:var(--mono-font);font-size:0.72rem;color:#B5B5B3;">${new Date(p.timestamp).toLocaleString()}</td>
            <td style="white-space:nowrap;">
              <button type="button" class="btn btn-secondary btn-sm" data-edit-idx="${p._idx}">✎</button>
              <button type="button" class="btn btn-secondary btn-sm" data-del-idx="${p._idx}" style="color:#E2726B;">✕</button>
            </td>
          </tr>
        `;
      })
      .join("");

    const datalists = `
      <datalist id="tracker-arcanist-datalist">
        ${allArcanistNames.map((n) => `<option value="${escapeHtml(n)}"></option>`).join("")}
      </datalist>
      <datalist id="tracker-banner-datalist">
        ${allBannerNames.map((n) => `<option value="${escapeHtml(n)}"></option>`).join("")}
      </datalist>
    `;

    // Pity Distribution 6✦ (1..70, all orange) & 5✦ (1..20)
    const bins6 = Array.from({ length: 70 }, () => []);
    activeChrono.forEach((p) => {
      if (p.rarity === 6 && p.pity6 >= 1 && p.pity6 <= 70) {
        bins6[p.pity6 - 1].push(`${getArcanistLabel(p.arcanist)}\t${p.banner}`);
      }
    });
    const max6 = Math.max(1, ...bins6.map((b) => b.length));
    const total6InDist = bins6.reduce((s, b) => s + b.length, 0);
    const dist6Html = bins6
      .map((entries, idx) => {
        const cnt = entries.length;
        const hPct = cnt > 0 ? Math.max(6, Math.round((cnt / max6) * 100)) : 0;
        const softCls = idx + 1 >= 60 ? "is-soft" : "";
        const pct = total6InDist > 0 ? ((cnt / total6InDist) * 100).toFixed(1) : "0.0";
        return `<div class="tracker-dist-col" data-dist-rarity="6" data-dist-pity="${idx + 1}" data-dist-count="${cnt}" data-dist-pct="${pct}" data-dist-entries="${escapeHtml(entries.join("\n"))}"><div class="tracker-dist-bar ${softCls}" style="height:${hPct}%"></div></div>`;
      })
      .join("");

    const bins5 = Array(20).fill(0);
    activeChrono.forEach((p) => {
      if (p.rarity === 5 && p.pity5 >= 1 && p.pity5 <= 20) bins5[p.pity5 - 1] += 1;
    });
    const max5 = Math.max(1, ...bins5);
    const total5InDist = bins5.reduce((s, c) => s + c, 0);
    const dist5Html = bins5
      .map((cnt, idx) => {
        const hPct = cnt > 0 ? Math.max(6, Math.round((cnt / max5) * 100)) : 0;
        const pct = total5InDist > 0 ? ((cnt / total5InDist) * 100).toFixed(1) : "0.0";
        return `<div class="tracker-dist-col" data-dist-rarity="5" data-dist-pity="${idx + 1}" data-dist-count="${cnt}" data-dist-pct="${pct}"><div class="tracker-dist-bar" style="height:${hPct}%"></div></div>`;
      })
      .join("");

    const distSectionHtml = `
      <div class="tracker-dist-grid">
        <div class="tracker-dist-card">
          <div class="tracker-dist-title">
            <span>Pity Distribution 6✦</span>
            <span style="font-family:var(--mono-font);font-size:0.65rem;color:#8f8a83;">${sixesDesc.length}</span>
          </div>
          <div class="tracker-dist-bars">${dist6Html}</div>
          <div class="tracker-dist-axis"><span>1</span><span style="left:${((20 - 0.5) / 70 * 100).toFixed(2)}%">20</span><span style="left:${((40 - 0.5) / 70 * 100).toFixed(2)}%">40</span><span style="left:${((60 - 0.5) / 70 * 100).toFixed(2)}%">60</span><span>70</span></div>
        </div>
        <div class="tracker-dist-card">
          <div class="tracker-dist-title">
            <span>Pity Distribution 5✦</span>
            <span style="font-family:var(--mono-font);font-size:0.65rem;color:#8f8a83;">${activeSummary.fiveCount}</span>
          </div>
          <div class="tracker-dist-bars">${dist5Html}</div>
          <div class="tracker-dist-axis"><span>1</span><span style="left:${((5 - 0.5) / 20 * 100).toFixed(2)}%">5</span><span style="left:${((10 - 0.5) / 20 * 100).toFixed(2)}%">10</span><span style="left:${((15 - 0.5) / 20 * 100).toFixed(2)}%">15</span><span>20</span></div>
        </div>
      </div>
    `;

    return `
      <aside class="tracker-rail">
        <div class="tracker-rail-section-head">
          <span>${escapeHtml(tr("tracker.allCategories", "Summon Pools"))}</span>
        </div>
        ${railPoolsHtml}
        <div class="tracker-rail-sep"></div>
        <div class="tracker-rail-section-head">
          <span>Overview Stats</span>
        </div>
        ${railHighlightsHtml}
      </aside>

      <section class="tracker-detail">
        <div class="tracker-detail-head">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            ${selectedBanner ? `<button type="button" class="btn btn-secondary btn-sm" id="tracker-back-pool">← Back</button>` : ""}
            <h3 class="tracker-detail-title">${escapeHtml(activeTitle)}</h3>
          </div>
          <span class="tracker-detail-subtitle">${escapeHtml(tr("tracker.dropHint", "Drop screenshots anywhere to scan"))}</span>
        </div>

        ${kpiHtml}

        <div class="tracker-section">
          <div class="tracker-section-head">
            <h4 class="tracker-section-title">${escapeHtml(tr("tracker.showcase6", "6✦ Showcase"))} (${sixesDesc.length})</h4>
            <div style="display:flex;align-items:center;gap:8px;">
              ${dushuoPickerHtml}
              <button type="button" class="btn btn-secondary btn-sm" id="tracker-compact-toggle">${showcaseCompact ? "Timeline View" : "Compact View"}</button>
            </div>
          </div>
          <div class="tracker-records-list">${recordsHtml}</div>
        </div>

        ${distSectionHtml}

        <div class="tracker-section">
          <div class="tracker-section-head">
            <h4 class="tracker-section-title">${escapeHtml(tr("tracker.historyEditor", "Summon Log"))} (${filteredHistory.length})</h4>
            <div class="tracker-filter-bar">
              <button type="button" class="btn btn-secondary btn-sm" id="tracker-add-pull-btn">${escapeHtml(tr("tracker.addPull", "+ Add Pull"))}</button>
              <input type="text" id="tracker-history-search" class="search-input" style="max-width:210px;height:28px;" placeholder="${escapeHtml(tr("tracker.search", "Search arcanist or banner..."))}" value="${escapeHtml(historySearch)}" />
              <div style="display:flex;gap:4px;">
                ${[6, 5, 4, 3, 2]
                  .map((r) => `<button type="button" class="tracker-rarity-chip ${historyRarities.has(r) ? "is-active" : ""}" data-history-rarity="${r}">${r}✦</button>`)
                  .join("")}
              </div>
            </div>
          </div>

          ${datalists}
          <div class="tracker-history-table-wrap">
            <table class="tracker-history-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>${escapeHtml(tr("tracker.arcanist", "Name"))}</th>
                  <th>${escapeHtml(tr("tracker.banner", "Type"))}</th>
                  <th>${escapeHtml(tr("tracker.pity", "Pity"))}</th>
                  <th>${escapeHtml(tr("tracker.date", "Summon Time"))}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>${historyRowsHtml}</tbody>
            </table>
          </div>
          <div class="tracker-pagination">
            <button type="button" class="btn btn-secondary btn-sm" id="tracker-page-prev" ${historyPage <= 1 ? "disabled" : ""}>‹</button>
            <span>${historyPage} / ${totalPages}</span>
            <button type="button" class="btn btn-secondary btn-sm" id="tracker-page-next" ${historyPage >= totalPages ? "disabled" : ""}>›</button>
          </div>
        </div>
      </section>
    `;
  }

  function bindSplitEvents() {
    document.querySelectorAll("[data-select-pool]").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedPool = btn.dataset.selectPool;
        selectedBanner = null;
        historyPage = 1;
        renderTracker();
      });
    });

    document.querySelectorAll("[data-select-banner]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const bName = btn.dataset.selectBanner;
        selectedBanner = selectedBanner === bName ? null : bName;
        historyPage = 1;
        renderTracker();
      });
    });

    document.getElementById("tracker-back-pool")?.addEventListener("click", () => {
      selectedBanner = null;
      historyPage = 1;
      renderTracker();
    });

    document.getElementById("tracker-compact-toggle")?.addEventListener("click", () => {
      showcaseCompact = !showcaseCompact;
      localStorage.setItem(COMPACT_VIEW_KEY, showcaseCompact ? "1" : "0");
      renderTracker();
    });

    document.getElementById("tracker-dushuo-select")?.addEventListener("change", (e) => {
      dushuoRateUp = e.target.value;
      localStorage.setItem(DUSHUO_RATEUP_KEY, dushuoRateUp);
      renderTracker();
    });

    // Chess-piece-style hover tooltip for Pity Distribution bars
    let distTip = document.getElementById("tracker-dist-tooltip");
    if (!distTip) {
      distTip = document.createElement("div");
      distTip.id = "tracker-dist-tooltip";
      distTip.className = "tracker-dist-tooltip";
      document.body.appendChild(distTip);
    }
    document.querySelectorAll(".tracker-dist-col").forEach((col) => {
      col.addEventListener("mouseenter", () => {
        const rarity = col.dataset.distRarity;
        const pity = col.dataset.distPity;
        const count = Number(col.dataset.distCount || 0);
        const pct = col.dataset.distPct;
        const rawEntries = col.dataset.distEntries || "";
        const entriesHtml =
          rarity === "6" && rawEntries
            ? `<div style="margin-top:4px;border-top:1px solid rgba(255,255,255,0.08);padding-top:4px;display:flex;flex-direction:column;gap:2px;">${rawEntries
                .split("\n")
                .map((line) => {
                  const [arc, ban] = line.split("\t");
                  return `<div style="display:flex;justify-content:space-between;gap:14px;"><span style="color:rgba(244,239,233,0.92);">${escapeHtml(arc)}</span><span style="color:#9a9a9a;">${escapeHtml(ban || "")}</span></div>`;
                })
                .join("")}</div>`
            : "";
        distTip.innerHTML = `
          <div style="font-weight: 700; color: #fff; margin-bottom: 2px;">Pity ${pity} (${rarity}✦)</div>
          <div>${count} character${count === 1 ? "" : "s"} (${pct}%)</div>
          ${entriesHtml}
        `;
        distTip.style.display = "block";
        const r = col.getBoundingClientRect();
        const tw = distTip.offsetWidth;
        const th = distTip.offsetHeight;
        const left = Math.max(8, Math.min(window.innerWidth - tw - 8, r.left + r.width / 2 - tw / 2));
        const top = Math.max(8, r.top - th - 8);
        distTip.style.left = `${left}px`;
        distTip.style.top = `${top}px`;
      });
      col.addEventListener("mouseleave", () => {
        distTip.style.display = "none";
      });
    });

    document.querySelectorAll(".tracker-compact-item").forEach((item) => {
      item.addEventListener("mouseenter", () => {
        const name = item.dataset.cName || "";
        const banner = item.dataset.cBanner || "";
        const pity = item.dataset.cPity || "?";
        const wl = item.dataset.cWl || "-";
        const date = item.dataset.cDate || "";
        const wlText = wl === "W" ? "WIN 50/50" : wl === "L" ? "LOSE 50/50" : wl === "G" ? "GUARANTEED" : "";
        distTip.innerHTML = `
          <div style="font-weight: 700; color: #fff; margin-bottom: 2px;">${escapeHtml(name)}</div>
          <div style="color:#9a9a9a;margin-bottom:4px;">${escapeHtml(banner)}</div>
          <div>Pity: <span style="color:#fff;font-weight:700;">${escapeHtml(pity)}</span></div>
          ${wlText ? `<div>${wlText}</div>` : ""}
          ${date ? `<div style="color:#9a9a9a;">${escapeHtml(date)}</div>` : ""}
        `;
        distTip.style.display = "block";
        const r = item.getBoundingClientRect();
        const tw = distTip.offsetWidth;
        const th = distTip.offsetHeight;
        const left = Math.max(8, Math.min(window.innerWidth - tw - 8, r.left + r.width / 2 - tw / 2));
        const top = Math.max(8, r.top - th - 8);
        distTip.style.left = `${left}px`;
        distTip.style.top = `${top}px`;
      });
      item.addEventListener("mouseleave", () => {
        distTip.style.display = "none";
      });
    });

    document.getElementById("tracker-history-search")?.addEventListener("input", (e) => {
      historySearch = e.target.value;
      historyPage = 1;
      renderTracker();
    });
    document.getElementById("tracker-add-pull-btn")?.addEventListener("click", addManualPull);

    document.querySelectorAll("[data-history-rarity]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const r = Number(btn.dataset.historyRarity);
        if (historyRarities.has(r)) historyRarities.delete(r);
        else historyRarities.add(r);
        historyPage = 1;
        renderTracker();
      });
    });

    document.getElementById("tracker-page-prev")?.addEventListener("click", () => {
      if (historyPage > 1) {
        historyPage -= 1;
        renderTracker();
      }
    });

    document.getElementById("tracker-page-next")?.addEventListener("click", () => {
      historyPage += 1;
      renderTracker();
    });

    document.querySelectorAll("[data-edit-idx]").forEach((btn) => {
      btn.addEventListener("click", () => {
        editingRowIndex = Number(btn.dataset.editIdx);
        renderTracker();
      });
    });

    document.querySelectorAll("[data-cancel-edit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        editingRowIndex = -1;
        renderTracker();
      });
    });

    document.querySelectorAll("[data-save-idx]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.saveIdx);
        const arc = normalizeArcanistName(document.getElementById("tracker-edit-arcanist")?.value);
        const ban = String(document.getElementById("tracker-edit-banner")?.value || "").trim();
        const dtStr = document.getElementById("tracker-edit-date")?.value;
        const ts = dtStr ? new Date(dtStr).getTime() : pulls[idx].timestamp;
        if (!arc || !ban || isNaN(ts)) return;
        pulls[idx] = {
          ...pulls[idx],
          arcanist: arc,
          rarity: getArcanistRarity(arc, pulls[idx].rarity),
          banner: ban,
          timestamp: ts,
        };
        editingRowIndex = -1;
        savePullsToStorage();
        renderTracker();
      });
    });

    document.querySelectorAll("[data-del-idx]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.delIdx);
        pulls.splice(idx, 1);
        editingRowIndex = -1;
        savePullsToStorage();
        renderTracker();
      });
    });
  }

  function addManualPull() {
    const modal = document.getElementById("tracker-add-modal");
    if (!modal) return;
    const arcInput = document.getElementById("tracker-add-arcanist");
    const rarSelect = document.getElementById("tracker-add-rarity");
    const banInput = document.getElementById("tracker-add-banner");
    const dtInput = document.getElementById("tracker-add-date");
    if (arcInput) arcInput.value = "";
    if (rarSelect) rarSelect.value = "6";
    if (banInput) banInput.value = selectedBanner || "Amongst the Lake";
    if (dtInput) {
      const now = new Date();
      dtInput.value = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
    }
    modal.style.display = "flex";
    arcInput?.focus();
  }

  function closeAddPullModal() {
    const modal = document.getElementById("tracker-add-modal");
    if (modal) modal.style.display = "none";
  }

  /* ---------------- Dual Export / Import ---------------- */

  function downloadJson(filename, obj) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);
  }

  function stampForFilename() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
  }

  function exportNativeJson() {
    const data = computeAnalytics();
    const g = data.poolSummaries.all;
    const payload = {
      app: "sothebys-mansion",
      kind: "pull-tracker",
      version: 1,
      exportedAt: new Date().toISOString(),
      summary: {
        totalPulls: g.total,
        sixStars: g.sixCount,
        fiveStars: g.fiveCount,
        sixStarAvg: Number(g.avg6.toFixed(2)),
        sixStar5050WinRate: g.wr6 != null ? Number(g.wr6.toFixed(2)) : null,
      },
      pulls: data.chrono.map((p) => ({
        id: p.id || `p_${p.timestamp}_${p.pullNumber}`,
        arcanist: p.arcanist,
        rarity: p.rarity,
        banner: p.banner,
        category: p.category,
        timestamp: p.timestamp,
        iso: new Date(p.timestamp).toISOString(),
      })),
    };
    downloadJson(`sotheby_pulls_${stampForFilename()}.json`, payload);
    notify(`Exported ${payload.pulls.length} pulls (Sotheby JSON).`);
  }

  function exportKornblumeJson() {
    const desc = [...pulls].sort((a, b) => b.timestamp - a.timestamp);
    const kornPulls = desc.map((p) => ({
      ArcanistName: p.arcanist,
      Rarity: getArcanistRarity(p.arcanist, p.rarity),
      BannerType: p.banner,
      Timestamp: p.timestamp,
    }));
    downloadJson(`kornblume_pulls_${stampForFilename()}.json`, {
      pulls: JSON.stringify({ data: kornPulls }),
    });
    notify(`Exported ${kornPulls.length} pulls (Kornblume format).`);
  }

  function importNativeFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || "{}"));
        const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed.pulls) ? parsed.pulls : null;
        if (!list) throw new Error("Invalid Sotheby pull JSON");
        pulls = list
          .filter((x) => x && (x.arcanist || x.ArcanistName) && (x.banner || x.BannerType))
          .map((x, idx) => {
            const arc = normalizeArcanistName(x.arcanist || x.ArcanistName);
            const ban = String(x.banner || x.BannerType).trim();
            const ts = Number(x.timestamp ?? x.Timestamp);
            return {
              id: x.id || `imp_${ts}_${idx}`,
              arcanist: arc,
              rarity: getArcanistRarity(arc, x.rarity ?? x.Rarity),
              banner: ban,
              timestamp: ts,
            };
          })
          .filter((x) => !isNaN(x.timestamp));
        selectedPool = "all";
        selectedBanner = null;
        savePullsToStorage();
        renderTracker();
        notify(`Imported ${pulls.length} pulls.`);
      } catch (e) {
        notify(`Import failed: ${e.message}`);
      }
    };
    reader.readAsText(file);
  }

  function importKornblumeFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || "{}"));
        let rawList = null;
        if (typeof parsed.pulls === "string") {
          const inner = JSON.parse(parsed.pulls);
          rawList = inner.data || inner;
        } else if (parsed.pulls && Array.isArray(parsed.pulls.data)) {
          rawList = parsed.pulls.data;
        } else if (Array.isArray(parsed.data)) {
          rawList = parsed.data;
        } else if (Array.isArray(parsed)) {
          rawList = parsed;
        }
        if (!Array.isArray(rawList)) throw new Error("No Kornblume pulls array found");

        const imported = rawList
          .filter((x) => x && x.ArcanistName && x.BannerType && !isNaN(Number(x.Timestamp)))
          .map((x, idx) => {
            const arc = normalizeArcanistName(x.ArcanistName);
            return {
              id: `korn_${x.Timestamp}_${idx}`,
              arcanist: arc,
              rarity: getArcanistRarity(arc, x.Rarity),
              banner: String(x.BannerType).trim(),
              timestamp: Number(x.Timestamp),
            };
          });
        // Kornblume stores pulls newest-first; reverse to oldest-first for accurate 10-pull pity
        if (imported.length > 1 && imported[0].timestamp >= imported[imported.length - 1].timestamp) {
          imported.reverse();
        }
        pulls = imported;
        selectedPool = "all";
        selectedBanner = null;
        savePullsToStorage();
        renderTracker();
        notify(`Imported ${pulls.length} pulls from Kornblume.`);
      } catch (e) {
        notify(`Kornblume import failed: ${e.message}`);
      }
    };
    reader.readAsText(file);
  }

  /* ---------------- OCR & Preprocessing ---------------- */

  function loadTesseract() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = TESSERACT_CDN;
      s.async = true;
      s.onload = () => (window.Tesseract ? resolve(window.Tesseract) : reject(new Error("Tesseract failed to load")));
      s.onerror = () => reject(new Error("Could not load Tesseract.js from CDN"));
      document.head.appendChild(s);
    });
  }

  function preprocessCanvas(file, mode) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          const scale = img.width > 1920 ? 1920 / img.width : img.width < 1100 ? 1.5 : 1;
          const w = Math.round(img.width * scale);
          const h = Math.round(img.height * scale);
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          if (!ctx) return reject(new Error("Canvas context unavailable"));
          ctx.drawImage(img, 0, 0, w, h);

          if (mode === "raw") {
            return canvas.toBlob((blob) => resolve(blob || file), "image/png");
          }

          let cropX = 0;
          let cropY = 0;
          let cropW = w;
          let cropH = h;

          if (mode === "auto" && w > h * 1.2) {
            // In-game Summon Record dialog: table (Name | Type | Summon Time) sits in x: 26%..96%, y: 18%..88%
            cropX = Math.round(w * 0.26);
            cropY = Math.round(h * 0.18);
            cropW = Math.round(w * 0.70);
            cropH = Math.round(h * 0.70);
          }

          const outCanvas = document.createElement("canvas");
          outCanvas.width = cropW;
          outCanvas.height = cropH;
          const outCtx = outCanvas.getContext("2d", { willReadFrequently: true });
          outCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

          // High-contrast grayscale preserving both dark charcoal AND burnt-orange 6✦ names on light parchment
          const outData = outCtx.getImageData(0, 0, cropW, cropH);
          const d = outData.data;
          for (let i = 0; i < d.length; i += 4) {
            const lum = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
            const val = lum > 175 ? 255 : Math.max(0, Math.round((lum - 40) * 1.3));
            d[i] = d[i + 1] = d[i + 2] = val;
          }
          outCtx.putImageData(outData, 0, 0);
          outCanvas.toBlob((blob) => resolve(blob || file), "image/png");
        };
        img.onerror = reject;
        img.src = ev.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function levenshtein(a, b) {
    const m = a.length;
    const n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    const dp = Array.from({ length: n + 1 }, (_, i) => i);
    for (let i = 1; i <= m; i++) {
      let prev = i - 1;
      dp[0] = i;
      for (let j = 1; j <= n; j++) {
        const tmp = dp[j];
        dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
        prev = tmp;
      }
    }
    return dp[n];
  }

  function bestFuzzyMatch(query, candidates) {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    let best = null;
    let bestScore = Infinity;
    for (const c of candidates) {
      const cl = c.toLowerCase();
      if (cl === q) return c;
      const dist = levenshtein(q, cl);
      const norm = dist / Math.max(q.length, cl.length, 1);
      if (norm < bestScore) {
        bestScore = norm;
        best = c;
      }
    }
    return bestScore <= 0.45 ? best : null;
  }

  function parseOcrText(rawText) {
    const lines = String(rawText || "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const excludeRe = /(?:<\s*)?(\d+)\s*\/\s*(\d+)(?:\s*>)?|(Name\s+Type\s+Summon\s+Time)/i;
    const dateRe = /(\d{4}[-\s]?\d{2}[-\s]?\d{2}\s*\d{2}[:\s]?\d{2}[:\s]?\d{2})/;
    const arcCandidates = allArcanistNames.map((n) => (n === "Зима" ? "3uma" : n));

    const parsed = [];
    for (const line of lines) {
      if (excludeRe.test(line)) continue;
      const dMatch = line.match(dateRe);
      if (!dMatch) continue;

      const dateStr = dMatch[1].replace(
        /(\d{4})[-\s]?(\d{2})[-\s]?(\d{2})\s*(\d{2})[:\s]?(\d{2})[:\s]?(\d{2})/,
        "$1-$2-$3 $4:$5:$6"
      );
      const ts = new Date(dateStr).getTime();
      if (isNaN(ts)) continue;

      const beforeDate = line.slice(0, dMatch.index).replace(/\|/g, "  ").trim();
      const parenMatch = beforeDate.match(/^(.*?)\([^)]*\)\s*(.*)$/);
      let rawArc = "";
      let rawBanner = "";
      if (parenMatch) {
        rawArc = parenMatch[1].replace(/^\W+/, "").trim();
        rawBanner = parenMatch[2].trim();
      } else {
        const matchedBanner = allBannerNames.find((b) => beforeDate.toLowerCase().endsWith(b.toLowerCase()));
        if (matchedBanner) {
          rawBanner = matchedBanner;
          rawArc = beforeDate.slice(0, beforeDate.length - matchedBanner.length).replace(/^\W+/, "").trim();
        } else {
          const parts = beforeDate.split(/\s{2,}/);
          rawArc = (parts[0] || "").replace(/^\W+/, "").trim();
          rawBanner = (parts.slice(1).join(" ") || "").trim();
        }
      }

      if (!rawArc) continue;
      let matchedArc = bestFuzzyMatch(rawArc, arcCandidates);
      if (!matchedArc) continue;
      if (matchedArc === "3uma") matchedArc = "Зима";

      const matchedBanner = bestFuzzyMatch(rawBanner, allBannerNames) || rawBanner || "Amongst the Lake";
      parsed.push({
        id: `ocr_${ts}_${Math.random().toString(36).slice(2, 6)}`,
        arcanist: matchedArc,
        rarity: getArcanistRarity(matchedArc),
        banner: matchedBanner,
        timestamp: ts,
      });
    }
    return parsed;
  }

  function mergeOcrPulls(existing, incoming) {
    const byTs = new Map();
    const addGroup = (ts, arr) => {
      if (!byTs.has(ts)) byTs.set(ts, []);
      const existingGroups = byTs.get(ts);
      const sig = JSON.stringify(arr.map((x) => `${x.arcanist}|${x.banner}`));
      if (!existingGroups.some((g) => JSON.stringify(g.map((x) => `${x.arcanist}|${x.banner}`)) === sig)) {
        existingGroups.push(arr);
      }
    };

    const groupByTs = (list) => {
      const m = new Map();
      list.forEach((p) => {
        if (!m.has(p.timestamp)) m.set(p.timestamp, []);
        m.get(p.timestamp).push(p);
      });
      return m;
    };

    groupByTs(existing).forEach((arr, ts) => addGroup(ts, arr));
    groupByTs(incoming).forEach((arr, ts) => addGroup(ts, arr));

    const merged = [];
    Array.from(byTs.keys())
      .sort((a, b) => b - a)
      .forEach((ts) => {
        const groups = byTs.get(ts);
        if (groups.length === 1) {
          merged.push(...groups[0]);
        } else {
          const first = groups[0];
          const second = groups[groups.length - 1];
          const sumLen = first.length + second.length;
          if (sumLen <= 10) {
            merged.push(...first, ...second);
          } else {
            merged.push(...first.slice(0, Math.max(0, 10 - second.length)), ...second);
          }
        }
      });
    return merged;
  }

  async function handleOcrFiles(fileList) {
    if (!fileList || fileList.length === 0 || isScanning) return;
    await ensureMetadataLoaded();
    isScanning = true;

    const bannerEl = document.getElementById("tracker-ocr-banner");
    const statusEl = document.getElementById("tracker-ocr-status");
    const fillEl = document.getElementById("tracker-ocr-progress-fill");
    const mode = document.getElementById("tracker-ocr-mode")?.value || "auto";

    if (bannerEl) bannerEl.style.display = "flex";
    if (fillEl) fillEl.style.width = "5%";

    let worker = null;
    try {
      const Tesseract = await loadTesseract();
      worker = await Tesseract.createWorker("eng");
      let newlyFound = [];

      for (let i = 0; i < fileList.length; i++) {
        if (statusEl) {
          statusEl.textContent = tr("tracker.ocrProcessing", "Scanning screenshot {current} / {total}...")
            .replace("{current}", String(i + 1))
            .replace("{total}", String(fileList.length));
        }
        if (fillEl) fillEl.style.width = `${Math.round(((i + 0.3) / fileList.length) * 100)}%`;
        const processedBlob = await preprocessCanvas(fileList[i], mode);
        const res = await worker.recognize(processedBlob);
        const rows = parseOcrText(res?.data?.text || "");
        newlyFound = newlyFound.concat(rows);
        if (fillEl) fillEl.style.width = `${Math.round(((i + 1) / fileList.length) * 100)}%`;
      }

      if (newlyFound.length === 0) {
        notify(tr("tracker.ocrFailed", "No valid pulls recognized. Try another OCR mode or add/edit manually."));
      } else {
        pulls = mergeOcrPulls(pulls, newlyFound);
        savePullsToStorage();
        renderTracker();
        notify(`Recognized ${newlyFound.length} pull rows.`);
      }
    } catch (e) {
      console.error("OCR error:", e);
      notify(`OCR error: ${e.message}`);
    } finally {
      if (worker) {
        try {
          await worker.terminate();
        } catch {}
      }
      isScanning = false;
      if (bannerEl) bannerEl.style.display = "none";
    }
  }

  async function openTrackerModal() {
    const modal = document.getElementById("tracker-modal");
    if (!modal) return;
    modal.style.display = "flex";
    await ensureMetadataLoaded();
    pulls = loadPullsFromStorage();
    renderTracker();
  }

  function closeTrackerModal() {
    const modal = document.getElementById("tracker-modal");
    if (modal) modal.style.display = "none";
    const dataModal = document.getElementById("tracker-data-modal");
    if (dataModal) dataModal.style.display = "none";
    closeAddPullModal();
    const distTip = document.getElementById("tracker-dist-tooltip");
    if (distTip) distTip.style.display = "none";
  }

  function openTrackerDataModal() {
    const m = document.getElementById("tracker-data-modal");
    if (m) m.style.display = "flex";
  }

  function closeTrackerDataModal() {
    const m = document.getElementById("tracker-data-modal");
    if (m) m.style.display = "none";
  }

  function initTracker() {
    pulls = loadPullsFromStorage();

    document.getElementById("btn-tracker")?.addEventListener("click", openTrackerModal);
    document.getElementById("tracker-btn-close")?.addEventListener("click", closeTrackerModal);
    document.getElementById("drawer-nav-tracker")?.addEventListener("click", () => {
      document.getElementById("navbar-menu")?.classList.remove("open");
      openTrackerModal();
    });

    const modal = document.getElementById("tracker-modal");
    modal?.addEventListener("click", (e) => {
      if (e.target === modal) closeTrackerModal();
    });

    const dataModal = document.getElementById("tracker-data-modal");
    document.getElementById("tracker-data-btn")?.addEventListener("click", openTrackerDataModal);
    document.getElementById("tracker-data-btn-close")?.addEventListener("click", closeTrackerDataModal);
    dataModal?.addEventListener("click", (e) => {
      if (e.target === dataModal) closeTrackerDataModal();
    });

    const addModal = document.getElementById("tracker-add-modal");
    document.getElementById("tracker-add-btn-close")?.addEventListener("click", closeAddPullModal);
    document.getElementById("tracker-add-cancel")?.addEventListener("click", closeAddPullModal);
    addModal?.addEventListener("click", (e) => {
      if (e.target === addModal) closeAddPullModal();
    });
    document.getElementById("tracker-add-arcanist")?.addEventListener("input", (e) => {
      const norm = normalizeArcanistName(e.target.value);
      if (rarityMap[norm]) {
        const sel = document.getElementById("tracker-add-rarity");
        if (sel) sel.value = String(rarityMap[norm]);
      }
    });
    document.getElementById("tracker-add-confirm")?.addEventListener("click", () => {
      const arc = normalizeArcanistName(document.getElementById("tracker-add-arcanist")?.value);
      const rar = Number(document.getElementById("tracker-add-rarity")?.value || 6);
      const ban = String(document.getElementById("tracker-add-banner")?.value || "").trim() || "Amongst the Lake";
      const dtStr = document.getElementById("tracker-add-date")?.value;
      const ts = dtStr ? new Date(dtStr).getTime() : Date.now();
      if (!arc || isNaN(ts)) {
        notify("Please enter a valid character and date.");
        return;
      }
      pulls.push({
        id: `manual_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        arcanist: arc,
        rarity: getArcanistRarity(arc, rar),
        banner: ban,
        timestamp: ts,
      });
      pulls.sort((a, b) => a.timestamp - b.timestamp);
      savePullsToStorage();
      closeAddPullModal();
      renderTracker();
    });

    document.getElementById("tracker-upload-btn")?.addEventListener("click", () => {
      document.getElementById("tracker-ocr-input")?.click();
    });
    document.getElementById("tracker-ocr-input")?.addEventListener("change", (e) => {
      handleOcrFiles(e.target.files);
      e.target.value = "";
    });

    document.getElementById("tracker-export-native-btn")?.addEventListener("click", () => {
      closeTrackerDataModal();
      exportNativeJson();
    });
    document.getElementById("tracker-import-native-btn")?.addEventListener("click", () => {
      closeTrackerDataModal();
      document.getElementById("tracker-native-import-input")?.click();
    });
    document.getElementById("tracker-native-import-input")?.addEventListener("change", (e) => {
      const f = e.target.files?.[0];
      if (f) importNativeFile(f);
      e.target.value = "";
    });

    document.getElementById("tracker-import-korn-btn")?.addEventListener("click", () => {
      closeTrackerDataModal();
      document.getElementById("tracker-korn-import-input")?.click();
    });
    document.getElementById("tracker-korn-import-input")?.addEventListener("change", (e) => {
      const f = e.target.files?.[0];
      if (f) importKornblumeFile(f);
      e.target.value = "";
    });
    document.getElementById("tracker-export-korn-btn")?.addEventListener("click", () => {
      closeTrackerDataModal();
      exportKornblumeJson();
    });

    document.getElementById("tracker-reset-btn")?.addEventListener("click", () => {
      closeTrackerDataModal();
      const msg = tr("tracker.resetConfirm", "Delete all saved pull records? This cannot be undone.");
      if (typeof openConfirmModal === "function") {
        openConfirmModal(tr("tracker.reset", "Reset Tracker"), msg, () => {
          pulls = [];
          savePullsToStorage();
          renderTracker();
        });
      } else if (window.confirm(msg)) {
        pulls = [];
        savePullsToStorage();
        renderTracker();
      }
    });

    const bodyEl = document.getElementById("tracker-body");
    if (bodyEl) {
      bodyEl.addEventListener("dragover", (e) => {
        e.preventDefault();
        bodyEl.classList.add("is-dragover");
      });
      bodyEl.addEventListener("dragleave", () => {
        bodyEl.classList.remove("is-dragover");
      });
      bodyEl.addEventListener("drop", (e) => {
        e.preventDefault();
        bodyEl.classList.remove("is-dragover");
        if (e.dataTransfer?.files?.length) {
          handleOcrFiles(e.dataTransfer.files);
        }
      });
    }

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeTrackerModal();
    });
  }

  window.renderTrackerModal = renderTracker;
  window.openTrackerModal = openTrackerModal;
  window.closeTrackerModal = closeTrackerModal;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTracker);
  } else {
    initTracker();
  }
})();
