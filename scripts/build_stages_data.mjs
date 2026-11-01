import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

const GLB_DIR = path.join(ROOT, "ignore", "re1999-data-global-main");
const CN_DIR = path.join(ROOT, "ignore", "re1999-data-main");
const OUT_DIR = path.join(ROOT, "data", "stages");

function loadJsonSafe(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (e) {
    return null;
  }
}

function cleanText(txt) {
  if (!txt || typeof txt !== "string") return "";
  return txt
    .replace(/<id:.*?>/g, "")
    .replace(/<color=.*?>/g, "")
    .replace(/<\/color>/g, "")
    .replace(/<link=.*?>/g, "")
    .replace(/<\/link>/g, "")
    .replace(/<nobr>/g, "")
    .replace(/<\/nobr>/g, "")
    .replace(/▩\d+%s/g, "")
    .replace(/\[\d+\]/g, "")
    .replace(/\u00a0/g, " ")
    .trim();
}

console.log("Loading localization mappings...");
const langEnGlb = loadJsonSafe(path.join(GLB_DIR, "data", "configs", "language", "language_en.json")) || [];
const langZhCn = loadJsonSafe(path.join(CN_DIR, "data", "configs", "language", "language_zh.json")) || [];

const langEnMap = new Map();
for (const item of langEnGlb) langEnMap.set(item.key, cleanText(item.content));

const langZhMap = new Map();
for (const item of langZhCn) langZhMap.set(item.key, cleanText(item.content));

function getText(key) {
  if (!key) return "";
  if (langEnMap.has(key)) return langEnMap.get(key);
  if (langZhMap.has(key)) return langZhMap.get(key);
  return key;
}

function mergeById(glbFile, cnFile, idKey = "id") {
  const glbList = loadJsonSafe(glbFile) || [];
  const cnList = loadJsonSafe(cnFile) || [];
  const map = new Map();
  for (const item of cnList) {
    item._server = "cn";
    map.set(item[idKey], item);
  }
  for (const item of glbList) {
    item._server = "global";
    map.set(item[idKey], item);
  }
  return map;
}

console.log("Merging core tables...");
const chapters = mergeById(path.join(GLB_DIR, "data", "json", "chapter.json"), path.join(CN_DIR, "data", "json", "chapter.json"));
const episodes = mergeById(path.join(GLB_DIR, "data", "json", "episode.json"), path.join(CN_DIR, "data", "json", "episode.json"));
const battles = mergeById(path.join(GLB_DIR, "data", "json", "battle.json"), path.join(CN_DIR, "data", "json", "battle.json"));
const monsterGroups = mergeById(path.join(GLB_DIR, "data", "json", "monster_group.json"), path.join(CN_DIR, "data", "json", "monster_group.json"));
const monsters = mergeById(path.join(GLB_DIR, "data", "json", "monster.json"), path.join(CN_DIR, "data", "json", "monster.json"));
const monsterTemplates = mergeById(path.join(GLB_DIR, "data", "json", "monster_template.json"), path.join(CN_DIR, "data", "json", "monster_template.json"), "template");
const monsterSkillTemplates = mergeById(path.join(GLB_DIR, "data", "json", "monster_skill_template.json"), path.join(CN_DIR, "data", "json", "monster_skill_template.json"));
const monsterSkins = mergeById(path.join(GLB_DIR, "data", "json", "monster_skin.json"), path.join(CN_DIR, "data", "json", "monster_skin.json"));
const monsterInstances = mergeById(path.join(GLB_DIR, "data", "json", "monster_instance.json"), path.join(CN_DIR, "data", "json", "monster_instance.json"));
const monsterSubs = mergeById(path.join(GLB_DIR, "data", "json", "monster_sub.json"), path.join(CN_DIR, "data", "json", "monster_sub.json"));
const monsterJobs = mergeById(path.join(GLB_DIR, "data", "json", "monster_job.json"), path.join(CN_DIR, "data", "json", "monster_job.json"));
const monsterLevels = mergeById(path.join(GLB_DIR, "data", "json", "monster_level.json"), path.join(CN_DIR, "data", "json", "monster_level.json"));
const skills = mergeById(path.join(GLB_DIR, "data", "json", "skill.json"), path.join(CN_DIR, "data", "json", "skill.json"));
const rules = mergeById(path.join(GLB_DIR, "data", "json", "rule.json"), path.join(CN_DIR, "data", "json", "rule.json"));

// Special Mode Tables
const maneStages = loadJsonSafe(path.join(CN_DIR, "data", "json", "activity128_stage.json")) || [];
const maneEpisodes = loadJsonSafe(path.join(CN_DIR, "data", "json", "activity128_episode.json")) || [];
const towerBossEpisodes = loadJsonSafe(path.join(CN_DIR, "data", "json", "tower_boss_episode.json")) || [];
const towerPermEpisodes = loadJsonSafe(path.join(CN_DIR, "data", "json", "tower_permanent_episode.json")) || [];
const weekwalkList = loadJsonSafe(path.join(CN_DIR, "data", "json", "weekwalk.json")) || [];
const weekwalkVer2List = loadJsonSafe(path.join(CN_DIR, "data", "json", "weekwalk_ver2.json")) || [];

function getMonsterData(mId) {
  const m = monsters.get(mId);
  if (!m) return null;

  const skin = monsterSkins.get(m.skinId);
  const st = monsterSkillTemplates.get(m.skillTemplate);

  let name = "";
  if (skin && skin.nameEng) name = skin.nameEng;
  else if (st && st.nameEng) name = st.nameEng;
  else if (m.highPriorityNameEng) name = m.highPriorityNameEng;
  else if (skin && skin.name) name = skin.name;
  else if (st && st.name) name = getText(st.name);
  else name = `Enemy #${mId}`;

  const headIcon = skin?.headIcon || "";
  const career = st?.career ?? m.career ?? 0;
  const dmgType = st?.dmgType ?? 1;

  let hp = 0;
  let atk = 0;
  let def = 0;
  let mdef = 0;
  let criRate = 0;
  let criDef = 0;
  let level = m.level || 1;
  let multiHp = 1;

  const instId = st?.instance || 0;
  if (instId > 0 && monsterInstances.has(instId)) {
    const inst = monsterInstances.get(instId);
    const sub = monsterSubs.get(inst.sub);
    if (sub && monsterJobs.has(sub.job)) {
      const job = monsterJobs.get(sub.job);
      let lvlId = m.level_true > 0 ? m.level_true : inst.level || 1;
      level = lvlId;
      const lvlCfg = monsterLevels.get(lvlId);
      if (lvlCfg) {
        const calcAttr = (attr) => {
          const baseVal = (job[`${attr}_base`] || 0) * (lvlCfg.base || 0);
          const equipVal = (job[`${attr}_equip_base`] || 0) * (lvlCfg.equip_base || 0);
          return Math.floor(
            ((sub[attr] || 10000) / 10000) *
            ((baseVal + equipVal) / 10000) *
            ((inst[attr] || 10000) / 10000)
          );
        };
        hp = calcAttr("life");
        atk = calcAttr("attack");
        def = calcAttr("defense");
        mdef = calcAttr("mdefense");
        criRate = (job.cri_init_super || 0) / 100;
        criDef = (job.criDef_init_super || 0) / 100;
        if (inst.multiHp > 1) {
          multiHp = inst.multiHp;
          hp = Math.floor(hp / multiHp);
        }
      }
    }
  } else {
    const tpl = monsterTemplates.get(m.template);
    if (tpl) {
      level = m.level || 1;
      hp = (tpl.life || 0) + level * (tpl.lifeGrow || 0);
      atk = (tpl.attack || 0) + level * (tpl.attackGrow || 0);
      def = (tpl.defense || 0) + level * (tpl.defenseGrow || 0);
      mdef = (tpl.mdefense || 0) + level * (tpl.mdefenseGrow || 0);
      criRate = (tpl.cri || 0) / 100;
      criDef = (tpl.criDef || 0) / 100;
      if (tpl.multiHp) {
        const parts = String(tpl.multiHp).split("#");
        if (parts.length > 1) multiHp = parts.length;
      }
    }
  }

  // Skills
  const monsterSkillList = [];
  if (st) {
    if (st.passiveSkill) {
      const pIds = String(st.passiveSkill).split("#");
      for (const pIdStr of pIds) {
        const pId = parseInt(pIdStr, 10);
        const sk = skills.get(pId);
        if (sk) {
          monsterSkillList.push({
            id: pId,
            type: "passive",
            name: getText(sk.name),
            desc: cleanText(getText(sk.eff_desc) || getText(sk.desc_art)),
            icon: sk.icon || ""
          });
        }
      }
    }
    if (st.activeSkill) {
      const groups = String(st.activeSkill).split("|");
      for (const grp of groups) {
        const parts = grp.split("#").slice(1);
        for (const skIdStr of parts) {
          const skId = parseInt(skIdStr, 10);
          const sk = skills.get(skId);
          if (sk) {
            monsterSkillList.push({
              id: skId,
              type: "active",
              rank: sk.skillRank || 1,
              name: getText(sk.name),
              desc: cleanText(getText(sk.eff_desc) || getText(sk.desc_art)),
              icon: sk.icon || ""
            });
          }
        }
      }
    }
    if (st.uniqueSkill) {
      const uIds = String(st.uniqueSkill).split("#");
      const firstUid = parseInt(uIds[0], 10);
      const sk = skills.get(firstUid);
      if (sk) {
        monsterSkillList.push({
          id: firstUid,
          type: "ultimate",
          name: getText(sk.name),
          desc: cleanText(getText(sk.eff_desc) || getText(sk.desc_art)),
          icon: sk.icon || "",
          moxie: st.uniqueSkill_point || 5
        });
      }
    }
  }

  return {
    id: mId,
    name,
    headIcon,
    career,
    dmgType,
    level,
    hp,
    multiHp,
    atk,
    def,
    mdef,
    criRate,
    criDef,
    skills: monsterSkillList
  };
}

function buildEpisodeData(epId, customName = null) {
  const ep = episodes.get(epId);
  if (!ep) return null;

  const epName = customName || (ep.name_En ? ep.name_En.replace(/\u00a0/g, " ") : getText(ep.name));
  const battleId = ep.battleId || ep.firstBattleId;
  const b = battleId ? battles.get(battleId) : null;

  const waves = [];
  const battleRules = [];

  if (b) {
    if (b.additionRule) {
      const rentries = String(b.additionRule).split("|");
      for (const rentry of rentries) {
        const rParts = rentry.split("#");
        const rId = parseInt(rParts[1] || rParts[0], 10);
        const r = rules.get(rId);
        if (r) {
          battleRules.push({
            id: rId,
            name: getText(r.name),
            desc: cleanText(getText(r.desc)),
            icon: r.icon || ""
          });
        }
      }
    }

    if (b.monsterGroupIds) {
      const grpIds = String(b.monsterGroupIds).split("#");
      for (let wIdx = 0; wIdx < grpIds.length; wIdx++) {
        const gId = parseInt(grpIds[wIdx], 10);
        const mg = monsterGroups.get(gId);
        const waveMonsters = [];
        if (mg && mg.monster) {
          const mIds = String(mg.monster).split("#");
          for (const mIdStr of mIds) {
            const mId = parseInt(mIdStr, 10);
            const mData = getMonsterData(mId);
            if (mData) waveMonsters.push(mData);
          }
        }
        if (waveMonsters.length > 0) {
          waves.push({ waveIndex: wIdx + 1, monsters: waveMonsters });
        }
      }
    }
  }

  return {
    id: ep.id,
    name: epName,
    desc: getText(ep.desc),
    cost: ep.cost ? parseInt(ep.cost.split("#")[2] || ep.cost, 10) : 0,
    server: ep._server || "global",
    maxRound: b?.maxRound || 20,
    playerMax: b?.playerMax || 4,
    rules: battleRules,
    waves
  };
}

console.log("Generating 9 distinct game modes...");

// 1. STORY (Type 1 Normal, Type 2 Hard)
const storyChapters = [];
for (const [chId, ch] of chapters.entries()) {
  if (ch.type === 1 || ch.type === 2) {
    const chTitle = ch.name_En ? ch.name_En.replace(/\u00a0/g, " ") : getText(ch.name);
    const eps = [];
    for (const [epId, ep] of episodes.entries()) {
      if (ep.chapterId === chId) {
        const epData = buildEpisodeData(epId);
        if (epData && epData.name && !epData.name.startsWith("language_")) eps.push(epData);
      }
    }
    if (eps.length > 0) {
      storyChapters.push({
        id: ch.id,
        index: ch.chapterIndex || "",
        title: `${chTitle} (${ch.type === 2 ? "Hard" : "Normal"})`,
        server: ch._server || "global",
        episodes: eps
      });
    }
  }
}

// 2. REFLECTIONS (Anecdotes & Character Stories - Type 14, 19, 26, 27)
const reflectionChapters = [];
for (const [chId, ch] of chapters.entries()) {
  if (ch.type === 14 || ch.type === 19 || ch.type === 26 || ch.type === 27) {
    const chTitle = ch.name_En ? ch.name_En.replace(/\u00a0/g, " ") : getText(ch.name);
    const eps = [];
    for (const [epId, ep] of episodes.entries()) {
      if (ep.chapterId === chId) {
        const epData = buildEpisodeData(epId);
        if (epData && epData.name && !epData.name.startsWith("language_")) eps.push(epData);
      }
    }
    if (eps.length > 0) {
      reflectionChapters.push({
        id: ch.id,
        index: ch.chapterIndex || "REF",
        title: chTitle,
        server: ch._server || "global",
        episodes: eps
      });
    }
  }
}

// 3. RESOURCE (The Poussiere: 5, Mintage Aesthetics: 4, Harvest Prime: 13)
const resourceChapters = [];
for (const [chId, ch] of chapters.entries()) {
  if (ch.type === 4 || ch.type === 5 || ch.type === 13) {
    const chTitle = ch.name_En ? ch.name_En.replace(/\u00a0/g, " ") : getText(ch.name);
    const eps = [];
    for (const [epId, ep] of episodes.entries()) {
      if (ep.chapterId === chId) {
        const epData = buildEpisodeData(epId);
        if (epData) eps.push(epData);
      }
    }
    if (eps.length > 0) {
      resourceChapters.push({
        id: ch.id,
        index: ch.chapterIndex || "RES",
        title: chTitle,
        server: ch._server || "global",
        episodes: eps
      });
    }
  }
}

// 4. INSIGHT (Psychugram Analysis: 6, Mountain Echos, Starfall, Sylvanus, Brutes: 7)
const insightChapters = [];
for (const [chId, ch] of chapters.entries()) {
  if (ch.type === 6 || ch.type === 7) {
    const chTitle = ch.name_En ? ch.name_En.replace(/\u00a0/g, " ") : getText(ch.name);
    const eps = [];
    for (const [epId, ep] of episodes.entries()) {
      if (ep.chapterId === chId) {
        const epData = buildEpisodeData(epId);
        if (epData) eps.push(epData);
      }
    }
    if (eps.length > 0) {
      insightChapters.push({
        id: ch.id,
        index: ch.chapterIndex || "INS",
        title: chTitle,
        server: ch._server || "global",
        episodes: eps
      });
    }
  }
}

// 5. ARTIFICIAL SOMNAMBULISM (Limbo & Lucidscape)
const somnambulismChapters = [];
// Surface & Limbo from weekwalk
const surfaceEps = [];
const limboEps = [];
for (const ww of weekwalkList) {
  const fightId = ww.fightIdFront || ww.fightIdRear;
  if (!fightId) continue;
  const b = battles.get(fightId);
  const waves = [];
  if (b && b.monsterGroupIds) {
    const grpIds = String(b.monsterGroupIds).split("#");
    for (let wIdx = 0; wIdx < grpIds.length; wIdx++) {
      const mg = monsterGroups.get(parseInt(grpIds[wIdx], 10));
      const wMonsters = [];
      if (mg && mg.monster) {
        for (const mIdStr of mg.monster.split("#")) {
          const mData = getMonsterData(parseInt(mIdStr, 10));
          if (mData) wMonsters.push(mData);
        }
      }
      if (wMonsters.length > 0) waves.push({ waveIndex: wIdx + 1, monsters: wMonsters });
    }
  }
  const epObj = {
    id: ww.id,
    name: `Area ${ww.layer} - Stage ${ww.id % 100}`,
    desc: `Artificial Somnambulism depth level ${ww.layer}.`,
    cost: 0,
    server: "global",
    maxRound: b?.maxRound || 20,
    playerMax: 4,
    rules: [],
    waves
  };
  if (ww.layer <= 10) surfaceEps.push(epObj);
  else limboEps.push(epObj);
}

if (surfaceEps.length > 0) {
  somnambulismChapters.push({ id: 801, index: "SURF", title: "The Surface (Tầng Mặt 1-10)", server: "global", episodes: surfaceEps });
}
if (limboEps.length > 0) {
  somnambulismChapters.push({ id: 802, index: "LIMBO", title: "Limbo (Mộng Cảnh Hỗn Loạn)", server: "global", episodes: limboEps });
}

// Lucidscape (weekwalk_ver2)
const lucidEps = [];
for (const ww2 of weekwalkVer2List) {
  const fightId = ww2.fightIdFront || ww2.fightIdRear;
  if (!fightId) continue;
  const b = battles.get(fightId);
  const waves = [];
  if (b && b.monsterGroupIds) {
    const grpIds = String(b.monsterGroupIds).split("#");
    for (let wIdx = 0; wIdx < grpIds.length; wIdx++) {
      const mg = monsterGroups.get(parseInt(grpIds[wIdx], 10));
      const wMonsters = [];
      if (mg && mg.monster) {
        for (const mIdStr of mg.monster.split("#")) {
          const mData = getMonsterData(parseInt(mIdStr, 10));
          if (mData) wMonsters.push(mData);
        }
      }
      if (wMonsters.length > 0) waves.push({ waveIndex: wIdx + 1, monsters: wMonsters });
    }
  }
  lucidEps.push({
    id: ww2.id,
    name: `Lucidscape Phase ${ww2.layer} (Vực Sâu #${ww2.id})`,
    desc: `Lucidscape deep somnambulism simulation.`,
    cost: 0,
    server: "cn",
    maxRound: b?.maxRound || 20,
    playerMax: 4,
    rules: [],
    waves
  });
}
if (lucidEps.length > 0) {
  somnambulismChapters.push({ id: 803, index: "LUCID", title: "Lucidscape (Tỉnh Mộng Cảnh)", server: "cn", episodes: lucidEps });
}

// 6. THE WINDOW TO OTHER WORLDS (A Series of Dusks & The Syndrome of Silence: Type 29, 22)
const windowChapters = [];
for (const [chId, ch] of chapters.entries()) {
  if (ch.type === 29 || ch.type === 22) {
    const chTitle = ch.name_En ? ch.name_En.replace(/\u00a0/g, " ") : getText(ch.name);
    const eps = [];
    for (const [epId, ep] of episodes.entries()) {
      if (ep.chapterId === chId) {
        const epData = buildEpisodeData(epId);
        if (epData) eps.push(epData);
      }
    }
    windowChapters.push({
      id: ch.id,
      index: ch.chapterIndex || "WIN",
      title: chTitle || "The Window to Other Worlds",
      server: ch._server || "cn",
      episodes: eps
    });
  }
}

// 7. REVERIES IN THE RAIN (Tower permanent episodes: 迷思海 / Reveries in the Rain)
const reverieChapters = [];
const revStages = [];
for (const tp of towerPermEpisodes) {
  if (tp.episodeIds) {
    const epId = parseInt(tp.episodeIds.split("#")[0], 10);
    const epData = buildEpisodeData(epId, `Reveries in the Rain - Floor ${tp.layerId} (迷思海 ${tp.layerId})`);
    if (epData) revStages.push(epData);
  }
}
if (revStages.length > 0) {
  reverieChapters.push({
    id: 9001,
    index: "RAIN",
    title: "Sea of Myth / Reveries in the Rain (迷思海 1-50)",
    server: "cn",
    episodes: revStages
  });
}

// 8. MANE'S BULLETIN (activity128 / bossrush)
const maneChapters = [];
const maneStageList = [];
for (const ms of maneStages) {
  const epName = ms.name_en || ms.name || `Raid Boss #${ms.stage}`;
  const bossSkins = ms.skinIds ? ms.skinIds.split("#") : [];
  const waves = [];
  const waveMonsters = [];
  for (const sIdStr of bossSkins) {
    const sId = parseInt(sIdStr, 10);
    let matchedM = null;
    for (const [mId, m] of monsters.entries()) {
      if (m.skinId === sId) {
        matchedM = getMonsterData(mId);
        break;
      }
    }
    if (matchedM) waveMonsters.push(matchedM);
  }
  if (waveMonsters.length > 0) {
    waves.push({ waveIndex: 1, monsters: waveMonsters });
  }

  maneStageList.push({
    id: ms.activityId * 100 + ms.stage,
    name: epName,
    desc: `Mane's Bulletin investigation raid. Max target points: ${ms.maxPoints ? ms.maxPoints.toLocaleString() : "--"}.`,
    cost: 0,
    server: "global",
    maxRound: 30,
    playerMax: 4,
    rules: [],
    waves
  });
}
if (maneStageList.length > 0) {
  maneChapters.push({
    id: 12801,
    index: "MANE",
    title: "Mane's Bulletin Raid Encounters (鬃毛邮报)",
    server: "global",
    episodes: maneStageList
  });
}

// 9. FOCUSED FLASHBACK (Tower boss teach, Boss rush trial, type 99, 97, 3)
const flashbackChapters = [];
for (const [chId, ch] of chapters.entries()) {
  if (ch.type === 99 || ch.type === 97 || ch.type === 3) {
    const chTitle = ch.name_En ? ch.name_En.replace(/\u00a0/g, " ") : getText(ch.name);
    const eps = [];
    for (const [epId, ep] of episodes.entries()) {
      if (ep.chapterId === chId) {
        const epData = buildEpisodeData(epId);
        if (epData && epData.name && !epData.name.startsWith("language_")) eps.push(epData);
      }
    }
    if (eps.length > 0) {
      flashbackChapters.push({
        id: ch.id,
        index: ch.chapterIndex || "FLASH",
        title: chTitle || `Flashback #${ch.id}`,
        server: ch._server || "global",
        episodes: eps
      });
    }
  }
}

// Write out all 9 JSON files
fs.mkdirSync(OUT_DIR, { recursive: true });

function writeModeJson(fileName, data) {
  fs.writeFileSync(path.join(OUT_DIR, fileName), JSON.stringify(data, null, 2), "utf-8");
  console.log(`Saved ${fileName} (${data.length} chapters, ${data.reduce((a, c) => a + c.episodes.length, 0)} stages)`);
}

writeModeJson("story.json", storyChapters);
writeModeJson("reflections.json", reflectionChapters);
writeModeJson("resource.json", resourceChapters);
writeModeJson("insight.json", insightChapters);
writeModeJson("somnambulism.json", somnambulismChapters);
writeModeJson("window.json", windowChapters);
writeModeJson("reveries.json", reverieChapters);
writeModeJson("manes_bulletin.json", maneChapters);
writeModeJson("flashback.json", flashbackChapters);

console.log("All 9 game modes exported successfully!");
