import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

const GLB_BASE = "https://raw.githubusercontent.com/St-Pavlov-Foundation/re1999-data-global/main";
const CN_BASE = "https://raw.githubusercontent.com/St-Pavlov-Foundation/re1999-data/main";

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to fetch ${url} (status: ${res.statusCode})`));
      }
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on("error", reject);
  });
}

function cleanSkillDesc(desc, name = "") {
  if (!desc || typeof desc !== "string") return "";
  let res = desc
    .replace(/<id:.*?>/g, "")
    .replace(/<color=.*?>/g, "")
    .replace(/<\/color>/g, "")
    .replace(/<link=.*?>/g, "")
    .replace(/<\/link>/g, "")
    .replace(/<nobr>/g, "")
    .replace(/<\/nobr>/g, "")
    .replace(/▩\d+%s/g, "")
    .replace(/\[\d+\]/g, "");
  if (name) {
    res = res.replace(/\{name\}/g, name);
  }
  return res.trim();
}

async function loadDataPair(filePath) {
  let glbData = null;
  let cnData = null;

  try {
    glbData = await fetchJson(`${GLB_BASE}/${filePath}`);
  } catch (err) {
    console.warn(`[Warn] Could not fetch GLB ${filePath}:`, err.message);
  }

  try {
    cnData = await fetchJson(`${CN_BASE}/${filePath}`);
  } catch (err) {
    console.warn(`[Warn] Could not fetch CN ${filePath}:`, err.message);
  }

  return { glbData, cnData };
}

async function run() {
  console.log("==> Step 1: Downloading GLB and CN dataset from St-Pavlov-Foundation...");
  const isOffline = process.argv.includes("--offline");

  let glbChars = [], cnChars = [];
  let glbSkills = [], cnSkills = [];
  let glbSkillEffects = [], cnSkillEffects = [];
  let glbPassives = [], cnPassives = [];
  let glbPortrays = [], cnPortrays = [];
  let glbBattleTags = [], cnBattleTags = [];
  let glbStyles = [], cnStyles = [];
  let glbStyleCosts = [], cnStyleCosts = [];
  let glbTalents = [], cnTalents = [];
  let glbRanks = [], cnRanks = [];
  let glbRankReplace = [], cnRankReplace = [];
  let glbDevices = [], cnDevices = [];
  let glbEquips = [], cnEquips = [];
  let glbItems = [], cnItems = [];
  let langEn = [], langZhGlb = [], langZhCn = [];

  if (!isOffline) {
    try {
      [
        { glbData: glbChars, cnData: cnChars },
        { glbData: glbSkills, cnData: cnSkills },
        { glbData: glbSkillEffects, cnData: cnSkillEffects },
        { glbData: glbPassives, cnData: cnPassives },
        { glbData: glbPortrays, cnData: cnPortrays },
        { glbData: glbBattleTags, cnData: cnBattleTags },
        { glbData: glbStyles, cnData: cnStyles },
        { glbData: glbStyleCosts, cnData: cnStyleCosts },
        { glbData: glbTalents, cnData: cnTalents },
        { glbData: glbRanks, cnData: cnRanks },
        { glbData: glbRankReplace, cnData: cnRankReplace },
        { glbData: glbDevices, cnData: cnDevices },
        { glbData: glbEquips, cnData: cnEquips },
        { glbData: glbItems, cnData: cnItems },
      ] = await Promise.all([
        loadDataPair("data/json/character.json"),
        loadDataPair("data/json/skill.json"),
        loadDataPair("data/json/skill_effect.json"),
        loadDataPair("data/json/skill_passive_level.json"),
        loadDataPair("data/json/skill_ex_level.json"),
        loadDataPair("data/json/character_battle_tag.json"),
        loadDataPair("data/json/talent_style.json"),
        loadDataPair("data/json/talent_style_cost.json"),
        loadDataPair("data/json/character_talent.json"),
        loadDataPair("data/json/character_rank.json"),
        loadDataPair("data/json/character_rank_replace.json"),
        loadDataPair("data/json/fight_device.json"),
        loadDataPair("data/json/equip.json"),
        loadDataPair("data/json/item.json"),
      ]);

      try {
        langEn = await fetchJson(`${GLB_BASE}/data/configs/language/language_en.json`);
      } catch (e) { console.warn("Failed to load langEn", e.message); }
      try {
        langZhGlb = await fetchJson(`${GLB_BASE}/data/configs/language/language_zh.json`);
      } catch (e) { console.warn("Failed to load langZhGlb", e.message); }
      try {
        langZhCn = await fetchJson(`${CN_BASE}/data/configs/language/language_zh.json`);
      } catch (e) { console.warn("Failed to load langZhCn", e.message); }
    } catch (err) {
      console.warn("==> GitHub fetch had issues, using local fallback if available:", err.message);
    }
  }

  // Local fallback from ignore/re1999-data-global-main
  const localJson = path.join(ROOT, "ignore", "re1999-data-global-main", "data", "json");
  const localConfigs = path.join(ROOT, "ignore", "re1999-data-global-main", "data", "configs");
  if (fs.existsSync(localJson) && (!glbChars || !glbChars.length)) {
    console.log("==> Loading fallback from ignore/re1999-data-global-main...");
    const readLocal = (name) => {
      const p = path.join(localJson, name);
      return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : [];
    };
    glbChars = readLocal("character.json");
    glbSkills = readLocal("skill.json");
    glbSkillEffects = readLocal("skill_effect.json");
    glbPassives = readLocal("skill_passive_level.json");
    glbPortrays = readLocal("skill_ex_level.json");
    glbBattleTags = readLocal("character_battle_tag.json");
    glbStyles = readLocal("talent_style.json");
    glbStyleCosts = readLocal("talent_style_cost.json");
    glbTalents = readLocal("character_talent.json");
    glbRanks = readLocal("character_rank.json");
    glbRankReplace = readLocal("character_rank_replace.json");
    glbDevices = readLocal("fight_device.json");
    glbEquips = readLocal("equip.json");
    glbItems = readLocal("item.json");
    const pEn = path.join(localConfigs, "language", "language_en.json");
    if (fs.existsSync(pEn)) langEn = JSON.parse(fs.readFileSync(pEn, "utf8"));
    const pZh = path.join(localConfigs, "language", "language_zh.json");
    if (fs.existsSync(pZh)) langZhGlb = JSON.parse(fs.readFileSync(pZh, "utf8"));
  }

  // Combine GLB and CN
  console.log("==> Merging GLB and CN datasets...");
  const enDict = new Map();
  for (const item of (langEn || [])) {
    if (item.key && item.content) enDict.set(item.key, item.content);
  }
  const zhDict = new Map();
  for (const item of (langZhGlb || [])) {
    if (item.key && item.content) zhDict.set(item.key, item.content);
  }
  for (const item of (langZhCn || [])) {
    if (item.key && item.content) zhDict.set(item.key, item.content);
  }

  function mergeById(glbArr = [], cnArr = []) {
    const map = new Map();
    for (const item of (glbArr || [])) if (item && item.id !== undefined) map.set(item.id, item);
    for (const item of (cnArr || [])) if (item && item.id !== undefined && !map.has(item.id)) map.set(item.id, item);
    return Array.from(map.values());
  }

  function mergePassives(glbArr = [], cnArr = []) {
    const map = new Map();
    for (const item of (glbArr || [])) if (item) map.set(`${item.heroId}#${item.skillLevel}`, item);
    for (const item of (cnArr || [])) if (item && !map.has(`${item.heroId}#${item.skillLevel}`)) map.set(`${item.heroId}#${item.skillLevel}`, item);
    return Array.from(map.values());
  }

  function mergePortrays(glbArr = [], cnArr = []) {
    const map = new Map();
    for (const item of (glbArr || [])) if (item) map.set(`${item.heroId}#${item.skillLevel}`, item);
    for (const item of (cnArr || [])) if (item && !map.has(`${item.heroId}#${item.skillLevel}`)) map.set(`${item.heroId}#${item.skillLevel}`, item);
    return Array.from(map.values());
  }

  const chars = mergeById(glbChars, cnChars);
  const skills = mergeById(glbSkills, cnSkills);
  const skillEffects = mergeById(glbSkillEffects, cnSkillEffects);
  const passives = mergePassives(glbPassives, cnPassives);
  const portrays = mergePortrays(glbPortrays, cnPortrays);
  const battleTags = mergeById(glbBattleTags, cnBattleTags);
  const styles = mergeById(glbStyles, cnStyles);
  const styleCosts = mergeById(glbStyleCosts, cnStyleCosts);
  const talents = mergeById(glbTalents, cnTalents);
  const ranks = mergeById(glbRanks, cnRanks);
  const rankReplace = mergeById(glbRankReplace, cnRankReplace);
  const devices = mergeById(glbDevices, cnDevices);
  const equips = mergeById(glbEquips, cnEquips);
  const items = mergeById(glbItems, cnItems);

  console.log(`==> Total characters available: ${chars.length}`);

  const sMap = new Map();
  for (const s of skills) sMap.set(s.id, s);

  const seMap = new Map();
  for (const se of skillEffects) seMap.set(se.id, se);

  const devMap = new Map();
  for (const d of devices) devMap.set(d.id, d);

  const repMap = new Map();
  for (const r of rankReplace) repMap.set(r.id, r);

  const itemMap = new Map();
  for (const it of items) {
    const name = enDict.get(it.name) || it.name;
    itemMap.set(it.id, name);
  }

  // Name mappings
  const nameMapPath = path.join(ROOT, "data", "name_map.json");
  const localNameMap = fs.existsSync(nameMapPath) ? JSON.parse(fs.readFileSync(nameMapPath, "utf8")) : {};
  const globalTransferPath = path.join(ROOT, "data", "global_name_transfer.json");
  const globalTransfer = fs.existsSync(globalTransferPath) ? JSON.parse(fs.readFileSync(globalTransferPath, "utf8")) : {};

  function resolveSkillText(keyOrText, isEn = true) {
    if (!keyOrText) return "";
    if (typeof keyOrText !== "string") return "";
    if (keyOrText.startsWith("language_")) {
      return isEn ? (enDict.get(keyOrText) || zhDict.get(keyOrText) || "") : (zhDict.get(keyOrText) || "");
    }
    return keyOrText;
  }

  /* ------------------------------------------------------------------
   * 1. Profiles & Battle Tags -> data/character_profiles.json
   * ------------------------------------------------------------------ */
  const tagMap = new Map();
  const tagZhMap = new Map();
  for (const t of battleTags) {
    tagMap.set(Number(t.id), enDict.get(t.tagName) || t.tagName);
    tagZhMap.set(Number(t.id), zhDict.get(t.tagName) || t.tagName);
  }

  const profiles = {};
  for (const c of chars) {
    const nameEng = c.nameEng;
    if (!nameEng) continue;

    const tagIds = String(c.battleTag || "").split("#").filter(Boolean).map(Number);
    const roleTags = tagIds.map((tid) => tagMap.get(tid)).filter(Boolean);
    const roleTagsZh = tagIds.map((tid) => tagZhMap.get(tid)).filter(Boolean);
    const dmgType = c.dmgType === 1 ? "Reality" : "Mental";
    const dmgTypeZh = c.dmgType === 1 ? "现实创伤" : "精神创伤";

    const canonical = globalTransfer[nameEng] || nameEng;
    profiles[nameEng] = {
      id: c.id,
      dmgType,
      dmgTypeZh,
      roleTags,
      roleTagsZh,
      nameZh: resolveSkillText(c.name, false) || localNameMap.character?.[nameEng] || "",
    };
    if (canonical !== nameEng) {
      profiles[canonical] = profiles[nameEng];
    }
  }

  fs.writeFileSync(path.join(ROOT, "data", "character_profiles.json"), JSON.stringify(profiles, null, 2) + "\n", "utf8");
  console.log(`Generated data/character_profiles.json (${Object.keys(profiles).length} entries)`);

  /* ------------------------------------------------------------------
   * 2. Full Character Skills & Passives & Portrays -> data/character_skills.json
   * ------------------------------------------------------------------ */
  const costMap = new Map();
  for (const d of devices) {
    for (const slot of ["skill1", "skill2"]) {
      if (!d[slot]) continue;
      d[slot].split("|").forEach((p) => {
        const [sid, lvl, cost] = p.split("#");
        if (cost !== undefined) costMap.set(Number(sid), Number(cost));
      });
    }
  }

  function getSkillHarmonization(seId) {
    const se = seMap.get(seId);
    if (!se) return null;
    for (let i = 1; i <= 20; i++) {
      const b = se["behavior" + i];
      if (b && typeof b === "string" && b.startsWith("60292#")) {
        return Number(b.split("#")[1]);
      }
    }
    return null;
  }

  function buildRanksObj(rankIds, nameEn = "", nameZh = "") {
    const ranks = {};
    for (let r = 0; r < rankIds.length; r++) {
      const sid = rankIds[r];
      const sObj = sMap.get(sid);
      if (sObj) {
        const seObj = seMap.get(sObj.skillEffect);
        const descEn = seObj ? resolveSkillText(seObj.desc, true) : "";
        const descZh = seObj ? resolveSkillText(seObj.desc, false) : "";
        const artEn = sObj.desc_art ? resolveSkillText(sObj.desc_art, true) : "";
        const artZh = sObj.desc_art ? resolveSkillText(sObj.desc_art, false) : "";
        const rankItem = {
          id: sid,
          descEn: cleanSkillDesc(descEn, nameEn),
          descZh: cleanSkillDesc(descZh, nameZh),
          artEn: cleanSkillDesc(artEn, nameEn),
          artZh: cleanSkillDesc(artZh, nameZh),
        };
        if (costMap.has(sid)) {
          rankItem.cost = costMap.get(sid);
        }
        const harm = getSkillHarmonization(sObj.skillEffect || sid);
        if (harm !== null) {
          rankItem.harmonization = harm;
        }
        ranks[r + 1] = rankItem;
      }
    }
    return ranks;
  }

  const characterSkills = {};

  for (const c of chars) {
    const nameEng = c.nameEng;
    if (!nameEng) continue;

    const charId = c.id;
    const charNameZh = resolveSkillText(c.name, false) || nameEng;
    const heroSkills = [];

    // Special case 1: Device-based multi-stance characters (e.g. The Twins, Coppélia, Everecho)
    if (c.deviceId && devMap.has(c.deviceId) && (charId === 3149 || charId === 3144 || charId === 3145)) {
      const dev = devMap.get(c.deviceId);

      const parseDevSkillSlot = (str, slotNum) => {
        if (!str) return [];
        const parts = str.split("|").filter(Boolean);
        return parts.map((part, pIdx) => {
          const sid = Number(part.split("#")[0]);
          const sObj = sMap.get(sid);
          const nameEn = sObj ? resolveSkillText(sObj.name, true) : "";
          const nameZh = sObj ? resolveSkillText(sObj.name, false) : "";
          const icon = sObj && sObj.icon ? `images/skills/${sObj.icon}.png` : "";

          let rankIds = [sid];
          if (charId === 3149) {
            if (sid === 31490111) rankIds = [31490111, 31492111, 31494111];
            else if (sid === 31490121) rankIds = [31490121, 31492121, 31493121];
            else if (sid === 31490131) rankIds = [31490131, 31492131, 31494131];
            else if (sid === 31490141) rankIds = [31490141, 31492141, 31493141];
          }

          const ranks = buildRanksObj(rankIds, nameEng, charNameZh);
          return {
            slot: slotNum,
            subSlot: parts.length > 1 ? `Set ${String.fromCharCode(65 + pIdx)}` : "",
            type: "Incantation",
            nameEn,
            nameZh,
            icon,
            ranks,
          };
        });
      };

      heroSkills.push(...parseDevSkillSlot(dev.skill1, 1));
      heroSkills.push(...parseDevSkillSlot(dev.skill2, 2));

      // Ultimate from device uniqueSkill or c.exSkill
      const ultId = Number(dev.uniqueSkill) || c.exSkill;
      if (ultId && sMap.has(ultId)) {
        const ultObj = sMap.get(ultId);
        const seObj = seMap.get(ultObj.skillEffect);
        const artEn = ultObj.desc_art ? resolveSkillText(ultObj.desc_art, true) : "";
        const artZh = ultObj.desc_art ? resolveSkillText(ultObj.desc_art, false) : "";
        const ultItem = {
          slot: 3,
          type: "Ultimate",
          nameEn: resolveSkillText(ultObj.name, true),
          nameZh: resolveSkillText(ultObj.name, false),
          icon: ultObj.icon ? `images/skills/${ultObj.icon}.png` : "",
          descEn: cleanSkillDesc(seObj ? resolveSkillText(seObj.desc, true) : "", nameEng),
          descZh: cleanSkillDesc(seObj ? resolveSkillText(seObj.desc, false) : "", charNameZh),
          artEn: cleanSkillDesc(artEn, nameEng),
          artZh: cleanSkillDesc(artZh, charNameZh),
        };
        if (c.uniqueSkill_point && String(c.uniqueSkill_point).startsWith("4#")) {
          const harmCost = Number(String(c.uniqueSkill_point).split("#")[1]) || 100;
          ultItem.harmonization = -harmCost;
        }
        heroSkills.push(ultItem);
      }

      // Special power skill if any
      if (dev.specialPowerSkill) {
        const powers = dev.specialPowerSkill.split("|").filter(Boolean);
        powers.forEach((p, pIdx) => {
          const sid = Number(p.split("#")[0]);
          const sObj = sMap.get(sid);
          if (sObj) {
            const ranks = buildRanksObj([sid], nameEng, charNameZh);
            heroSkills.push({
              slot: 4,
              subSlot: `Special ${pIdx + 1}`,
              type: "Special",
              nameEn: resolveSkillText(sObj.name, true),
              nameZh: resolveSkillText(sObj.name, false),
              icon: sObj.icon ? `images/skills/${sObj.icon}.png` : "",
              ranks,
            });
          }
        });
      }
    } else {
      // Normal or rankReplace characters (e.g. Nautika 3120, Rhiannon 3146, Brume 3135)
      let skillStr = c.skill || "";
      let ultId = c.exSkill;

      if (repMap.has(charId)) {
        const rep = repMap.get(charId);
        if (rep.skill) skillStr = rep.skill;
        if (rep.exSkill) ultId = rep.exSkill;
      }

      const rawSkillGroups = String(skillStr).split("|").filter(Boolean);
      for (let gIdx = 0; gIdx < rawSkillGroups.length; gIdx++) {
        const group = rawSkillGroups[gIdx];
        const subGroups = group.split(",").filter(Boolean);
        const groupSlot = Number(subGroups[0].split("#")[0]) || (gIdx === 0 ? 1 : 2);
        for (let sgIdx = 0; sgIdx < subGroups.length; sgIdx++) {
          const rawParts = subGroups[sgIdx].split("#").filter(Boolean);
          const hasSlotPrefix = sgIdx === 0;
          const rankIds = hasSlotPrefix ? rawParts.slice(1).map(Number) : rawParts.map(Number);

          const sObj1 = sMap.get(rankIds[0]);
          const skillNameEn = sObj1 ? resolveSkillText(sObj1.name, true) : "";
          const skillNameZh = sObj1 ? resolveSkillText(sObj1.name, false) : "";
          const skillIcon = sObj1 && sObj1.icon ? `images/skills/${sObj1.icon}.png` : "";
          const ranks = buildRanksObj(rankIds, nameEng, charNameZh);

          heroSkills.push({
            slot: groupSlot,
            subSlot: subGroups.length > 1 ? `Set ${String.fromCharCode(65 + sgIdx)}` : "",
            type: "Incantation",
            nameEn: skillNameEn,
            nameZh: skillNameZh,
            icon: skillIcon,
            ranks,
          });
        }
      }

      if (ultId && sMap.has(ultId)) {
        const ultObj = sMap.get(ultId);
        const seObj = seMap.get(ultObj.skillEffect);
        const ultItem = {
          slot: 3,
          type: "Ultimate",
          nameEn: resolveSkillText(ultObj.name, true),
          nameZh: resolveSkillText(ultObj.name, false),
          icon: ultObj.icon ? `images/skills/${ultObj.icon}.png` : "",
          descEn: cleanSkillDesc(seObj ? resolveSkillText(seObj.desc, true) : "", nameEng),
          descZh: cleanSkillDesc(seObj ? resolveSkillText(seObj.desc, false) : "", charNameZh),
          artEn: cleanSkillDesc(ultObj.desc_art ? resolveSkillText(ultObj.desc_art, true) : "", nameEng),
          artZh: cleanSkillDesc(ultObj.desc_art ? resolveSkillText(ultObj.desc_art, false) : "", charNameZh),
        };
        if (c.uniqueSkill_point && String(c.uniqueSkill_point).startsWith("4#")) {
          const harmCost = Number(String(c.uniqueSkill_point).split("#")[1]) || 100;
          ultItem.harmonization = -harmCost;
        }
        heroSkills.push(ultItem);
      }

      // Special Rhiannon extra skills (Bendith & Feast Call)
      if (charId === 3146) {
        heroSkills.push({
          slot: 1,
          subSlot: "Bendith",
          type: "Incantation",
          nameEn: resolveSkillText(sMap.get(31460211)?.name, true),
          nameZh: resolveSkillText(sMap.get(31460211)?.name, false),
          icon: "images/skills/31460112.png",
          ranks: buildRanksObj([31460211], nameEng, charNameZh),
        });
        heroSkills.push({
          slot: 2,
          subSlot: "Bendith",
          type: "Incantation",
          nameEn: resolveSkillText(sMap.get(31460221)?.name, true),
          nameZh: resolveSkillText(sMap.get(31460221)?.name, false),
          icon: "images/skills/31460122.png",
          ranks: buildRanksObj([31460221], nameEng, charNameZh),
        });
        heroSkills.push({
          slot: 4,
          subSlot: "Feast Call",
          type: "Special",
          nameEn: resolveSkillText(sMap.get(31460181)?.name, true),
          nameZh: resolveSkillText(sMap.get(31460181)?.name, false),
          icon: "images/skills/31460131.png",
          ranks: buildRanksObj([31460181], nameEng, charNameZh),
        });
      }

      // Ultimate skill
      if (ultId && sMap.has(ultId)) {
        const ultObj = sMap.get(ultId);
        const seObj = seMap.get(ultObj.skillEffect);
        const artEn = ultObj.desc_art ? resolveSkillText(ultObj.desc_art, true) : "";
        const artZh = ultObj.desc_art ? resolveSkillText(ultObj.desc_art, false) : "";
        heroSkills.push({
          slot: 3,
          type: "Ultimate",
          nameEn: resolveSkillText(ultObj.name, true),
          nameZh: resolveSkillText(ultObj.name, false),
          icon: ultObj.icon ? `images/skills/${ultObj.icon}.png` : "",
          descEn: cleanSkillDesc(seObj ? resolveSkillText(seObj.desc, true) : "", nameEng),
          descZh: cleanSkillDesc(seObj ? resolveSkillText(seObj.desc, false) : "", charNameZh),
          artEn: cleanSkillDesc(artEn, nameEng),
          artZh: cleanSkillDesc(artZh, charNameZh),
        });
      }
    }

    // Passives / Inheritance (Insight I, II, III)
    const charPassives = passives
      .filter((p) => p.heroId === charId)
      .sort((a, b) => a.skillLevel - b.skillLevel)
      .map((p) => {
        const sObj = sMap.get(p.skillPassive);
        const seObj = sObj ? seMap.get(sObj.skillEffect) : null;
        return {
          insight: p.skillLevel,
          nameEn: sObj ? resolveSkillText(sObj.name, true) : "",
          nameZh: sObj ? resolveSkillText(sObj.name, false) : "",
          descEn: cleanSkillDesc(seObj ? resolveSkillText(seObj.desc, true) : "", nameEng),
          descZh: cleanSkillDesc(seObj ? resolveSkillText(seObj.desc, false) : "", charNameZh),
        };
      });

    // Portrays P1 - P5
    function getSkillNameForPortray(sid, isEn = true) {
      if (!sid) return "";
      const s = sMap.get(Number(sid));
      if (!s) return "";
      const raw = resolveSkillText(s.name, isEn);
      return cleanSkillDesc(raw);
    }

    function formatPortrayDesc(p, isEn = true) {
      let text = resolveSkillText(p.desc, isEn);
      let pId = String(p.passiveSkill || "").split("|")[0].split("#")[0];
      if (!pId && charId === 3149) pId = "31490171";
      const pName = getSkillNameForPortray(pId, isEn);

      const sg1Id = String(p.skillGroup1 || "").split("|")[0].split("#")[0];
      const sg1Name = getSkillNameForPortray(sg1Id, isEn);
      const sg2Id = String(p.skillGroup2 || "").split("|")[0].split("#")[0];
      const sg2Name = getSkillNameForPortray(sg2Id, isEn);

      let exId = p.skillEx;
      const devObj = p.deviceId ? devMap.get(p.deviceId) : null;
      if (!exId && devObj && devObj.uniqueSkill) {
        exId = devObj.uniqueSkill;
      }
      const exName = getSkillNameForPortray(exId, isEn);

      text = text.replace(/\u25a90%s/g, pName ? `[${pName}]` : "");
      text = text.replace(/\u25a91%s/g, sg1Name ? `[${sg1Name}]` : "");
      text = text.replace(/\u25a92%s/g, sg2Name ? `[${sg2Name}]` : "");
      text = text.replace(/\u25a93%s/g, exName ? `[${exName}]` : "");

      if (devObj) {
        const s1Parts = devObj.skill1 ? devObj.skill1.split("|") : [];
        const s2Parts = devObj.skill2 ? devObj.skill2.split("|") : [];
        const n11 = s1Parts[0] ? getSkillNameForPortray(s1Parts[0].split("#")[0], isEn) : "";
        const n12 = s1Parts[1] ? getSkillNameForPortray(s1Parts[1].split("#")[0], isEn) : "";
        const n21 = s2Parts[0] ? getSkillNameForPortray(s2Parts[0].split("#")[0], isEn) : "";
        const n22 = s2Parts[1] ? getSkillNameForPortray(s2Parts[1].split("#")[0], isEn) : "";

        text = text.replace(/\u25a911%s/g, n11 ? `[${n11}]` : "");
        text = text.replace(/\u25a912%s/g, n12 ? `[${n12}]` : "");
        text = text.replace(/\u25a921%s/g, n21 ? `[${n21}]` : "");
        text = text.replace(/\u25a922%s/g, n22 ? `[${n22}]` : "");
      }

      return cleanSkillDesc(text, isEn ? nameEng : charNameZh);
    }

    const charPortrays = portrays
      .filter((p) => p.heroId === charId)
      .sort((a, b) => a.skillLevel - b.skillLevel)
      .map((p) => ({
        level: p.skillLevel,
        descEn: formatPortrayDesc(p, true),
        descZh: formatPortrayDesc(p, false),
      }));

    const canonical = globalTransfer[nameEng] || nameEng;
    const profileData = {
      id: charId,
      nameEn: nameEng,
      nameZh: resolveSkillText(c.name, false) || "",
      skills: heroSkills,
      insights: charPassives,
      portrays: charPortrays,
    };

    characterSkills[nameEng] = profileData;
    if (canonical !== nameEng) {
      characterSkills[canonical] = profileData;
    }
  }

  fs.writeFileSync(path.join(ROOT, "data", "character_skills.json"), JSON.stringify(characterSkills, null, 2) + "\n", "utf8");
  console.log(`Generated data/character_skills.json (${Object.keys(characterSkills).length} entries)`);

  /* ------------------------------------------------------------------
   * 3. Characters by Rarity & Afflatus
   * ------------------------------------------------------------------ */
  const careerToAfflatus = {
    1: "Mineral",
    2: "Star",
    3: "Plant",
    4: "Beast",
    5: "Spirit",
    6: "Intellect",
    101: "Mineral_Star",
  };

  const rareToRarity = {
    1: "2",
    2: "3",
    3: "4",
    4: "5",
    5: "6",
  };

  const afflatusObj = {
    Beast: [],
    Plant: [],
    Star: [],
    Mineral: [],
    Spirit: [],
    Intellect: [],
    Mineral_Star: [],
  };

  const rarityObj = {
    "2": [],
    "3": [],
    "4": [],
    "5": [],
    "6": [],
  };

  for (const c of chars) {
    if (!c.nameEng) continue;
    const name = c.nameEng === "Six" ? "6" : (globalTransfer[c.nameEng] || c.nameEng);
    const aff = careerToAfflatus[c.career];
    const rar = rareToRarity[c.rare];
    if (aff && afflatusObj[aff] && !afflatusObj[aff].includes(name)) {
      afflatusObj[aff].push(name);
    }
    if (rar && rarityObj[rar] && !rarityObj[rar].includes(name)) {
      rarityObj[rar].push(name);
    }
  }

  // Merge with existing characters_by_afflatus.json and characters_by_rarity.json to preserve manual additions (e.g. future sight / CN characters)
  const existingAffPath = path.join(ROOT, "data", "characters_by_afflatus.json");
  if (fs.existsSync(existingAffPath)) {
    try {
      const existAff = JSON.parse(fs.readFileSync(existingAffPath, "utf8"));
      for (const [k, arr] of Object.entries(existAff)) {
        if (!afflatusObj[k]) afflatusObj[k] = [];
        for (const nm of arr) {
          if (!afflatusObj[k].includes(nm)) afflatusObj[k].push(nm);
        }
      }
    } catch (e) {}
  }

  const existingRarPath = path.join(ROOT, "data", "characters_by_rarity.json");
  if (fs.existsSync(existingRarPath)) {
    try {
      const existRar = JSON.parse(fs.readFileSync(existingRarPath, "utf8"));
      for (const [k, arr] of Object.entries(existRar)) {
        if (!rarityObj[k]) rarityObj[k] = [];
        for (const nm of arr) {
          if (!rarityObj[k].includes(nm)) rarityObj[k].push(nm);
        }
      }
    } catch (e) {}
  }

  for (const k of Object.keys(afflatusObj)) afflatusObj[k].sort();
  for (const k of Object.keys(rarityObj)) rarityObj[k].sort();

  fs.writeFileSync(path.join(ROOT, "data", "characters_by_afflatus.json"), JSON.stringify(afflatusObj, null, 2) + "\n", "utf8");
  fs.writeFileSync(path.join(ROOT, "data", "characters_by_rarity.json"), JSON.stringify(rarityObj, null, 2) + "\n", "utf8");
  console.log(`Generated data/characters_by_afflatus.json and data/characters_by_rarity.json`);

  /* ------------------------------------------------------------------
   * 4. Pattern Costs -> data/pattern_costs.json
   * ------------------------------------------------------------------ */
  const talentMouldMap = new Map();
  for (const s of styles) {
    const key = `${s.talentMould}#${s.styleId}`;
    talentMouldMap.set(key, enDict.get(s.name) || s.name);
  }

  const heroMoulds = new Map();
  for (const t of talents) {
    if (t.talentId === 10) heroMoulds.set(t.heroId, t.talentMould);
  }

  const patternCosts = {};
  for (const sc of styleCosts) {
    const heroId = sc.heroId;
    const charObj = chars.find((x) => x.id === heroId);
    if (!charObj || !charObj.nameEng) continue;

    const heroName = charObj.nameEng;
    const mould = heroMoulds.get(heroId) || 1;
    const styleName = talentMouldMap.get(`${mould}#${sc.styleId}`);
    if (!styleName) continue;

    const mats = [];
    for (const part of String(sc.consume || "").split("|").filter(Boolean)) {
      const [typeId, idVal, qty] = part.split("#");
      let matName = itemMap.get(Number(idVal)) || `Item_${idVal}`;
      if (typeId === "2" && idVal === "3") matName = "Sharpodonty";
      mats.push({ material: matName, quantity: Number(qty) || 0 });
    }

    const canonical = globalTransfer[heroName] || heroName;
    if (!patternCosts[heroName]) patternCosts[heroName] = {};
    patternCosts[heroName][styleName] = mats;
    if (canonical !== heroName) {
      if (!patternCosts[canonical]) patternCosts[canonical] = {};
      patternCosts[canonical][styleName] = mats;
    }
  }

  fs.writeFileSync(path.join(ROOT, "data", "pattern_costs.json"), JSON.stringify(patternCosts, null, 2) + "\n", "utf8");
  console.log(`Generated data/pattern_costs.json (${Object.keys(patternCosts).length} entries)`);

  /* ------------------------------------------------------------------
   * 5. Character Leveling & Insight & Resonance Materials -> data/characters_mats_required.json
   * ------------------------------------------------------------------ */
  const existingMats = fs.existsSync(path.join(ROOT, "data", "characters_mats_required.json"))
    ? JSON.parse(fs.readFileSync(path.join(ROOT, "data", "characters_mats_required.json"), "utf8"))
    : {};

  const fullMatsRequired = { ...existingMats };

  for (const c of chars) {
    if (!c.nameEng) continue;
    const charName = c.nameEng === "Six" ? "6" : (globalTransfer[c.nameEng] || c.nameEng);
    const heroId = c.id;

    const heroRanks = ranks.filter((r) => r.heroId === heroId).sort((a, b) => a.rank - b.rank);
    const insightList = [];
    for (const r of heroRanks) {
      if (r.rank > 1 && r.consume) {
        const materials = r.consume.split("|").filter(Boolean).map((p) => {
          const [type, id, qty] = p.split("#");
          const matName = type === "2" && id === "3" ? "Sharpodonty" : itemMap.get(Number(id)) || `Item_${id}`;
          return { material: matName, quantity: Number(qty) };
        });
        insightList.push({ insight: r.rank - 1, materials });
      }
    }

    const heroTalents = talents.filter((t) => t.heroId === heroId).sort((a, b) => a.talentId - b.talentId);
    const resoList = [];
    for (const t of heroTalents) {
      if (t.talentId > 1 && t.consume) {
        const materials = t.consume.split("|").filter(Boolean).map((p) => {
          const [type, id, qty] = p.split("#");
          const matName = type === "2" && id === "3" ? "Sharpodonty" : itemMap.get(Number(id)) || `Item_${id}`;
          return { material: matName, quantity: Number(qty) };
        });
        resoList.push({ resonance: t.talentId, materials });
      }
    }

    const existing = existingMats[charName] || {};
    fullMatsRequired[charName] = {
      id: heroId,
      name: charName,
      rarity: Number(rareToRarity[c.rare] || 5),
      afflatus: careerToAfflatus[c.career] || "Beast",
      stats: existing.stats || {
        "0-1": [200, 1200, 100, 100, 200, 5, 130],
        "0-30": [350, 2000, 180, 180, 200, 5, 130],
        "1-40": [600, 3500, 300, 300, 250, 7, 135],
        "2-50": [900, 5000, 450, 450, 300, 10, 140],
        "3-60": [1100, 6500, 550, 550, 350, 12, 145],
      },
      insight: insightList.length ? insightList : (existing.insight || []),
      resonance: resoList.length ? resoList : (existing.resonance || []),
      euphoria: existing.euphoria || [],
      mastery: existing.mastery || [],
      frequency: existing.frequency || [],
    };
  }

  fs.writeFileSync(path.join(ROOT, "data", "characters_mats_required.json"), JSON.stringify(fullMatsRequired, null, 2) + "\n", "utf8");
  console.log(`Updated data/characters_mats_required.json (${Object.keys(fullMatsRequired).length} characters)`);

  /* ------------------------------------------------------------------
   * 6. Psychubes Mapping -> data/psychube_id.json
   * ------------------------------------------------------------------ */
  const pPath = path.join(ROOT, "data", "psychube_id.json");
  if (fs.existsSync(pPath)) {
    const psychubeJson = JSON.parse(fs.readFileSync(pPath, "utf8"));
    let enrichedCount = 0;
    for (const rarity of ["6", "5"]) {
      const list = psychubeJson[rarity];
      if (Array.isArray(list)) {
        list.forEach((p) => {
          const match = equips.find(
            (e) => (resolveSkillText(e.name, false) === p.nameCN) ||
                   (e.name_en && e.name_en.toLowerCase() === (p.name || "").toLowerCase())
          );
          if (match) {
            p.gameId = match.id;
            enrichedCount++;
          }
        });
      }
    }
    fs.writeFileSync(pPath, JSON.stringify(psychubeJson, null, 2) + "\n", "utf8");
    console.log(`Updated data/psychube_id.json with real game IDs (${enrichedCount} matched)`);
  }

  console.log("==> All data synchronized successfully!");
}

run().catch((err) => {
  console.error("==> Sync failed:", err);
  process.exit(1);
});
