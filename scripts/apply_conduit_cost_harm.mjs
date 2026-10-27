import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const skillsPath = path.join(ROOT, "data", "character_skills.json");

const COST_MAP = {
  "31440111": 2, "31440121": 0, "31441111": 2, "31441121": 0, "31444111": 2,
  "31450111": 0, "31450112": 0, "31450113": 0, "31450114": 0, "31450121": 0, "31450122": 0,
  "31490111": 0, "31490121": 3, "31490131": 0, "31490141": 1,
  "31491121": 3, "31491141": 1,
  "31492111": 0, "31492121": 3, "31492131": 0, "31492141": 1,
  "31493121": 3, "31493141": 1,
  "31494111": 0, "31494131": 0,
  "31495121": 3, "31495141": 1,
  "31560111": 0, "31560112": 0, "31560113": 0, "31560114": 0,
  "31560121": 2, "31560122": 2, "31560123": 2,
  "302501112": 1, "302501212": 1, "302503112": 1, "302503212": 1,
  "302514112": 1, "302514212": 1, "302521112": 1, "302523112": 1,
  "302524112": 1, "302531212": 1, "302533212": 1, "302534212": 1,
  "302544112": 1, "302544212": 1
};

const HARM_MAP = {
  "31440111": 10, "31440121": 15, "31441111": 10, "31441121": 15, "31444111": 10,
  "31450111": 5, "31450112": 5, "31450113": 5, "31450114": 5, "31450121": 10, "31450122": 10,
  "31490111": 8, "31490121": 8, "31490131": 8, "31490141": 5,
  "31491121": 8, "31491141": 5,
  "31492111": 20, "31492121": 10, "31492131": 20, "31492141": 6,
  "31493121": 10, "31493141": 6,
  "31494111": 20, "31494131": 20,
  "31495121": 10, "31495141": 6,
  "31560111": 20, "31560112": 30, "31560113": 30, "31560114": 30,
  "31560121": 20, "31560122": 30, "31560123": 30,
  "302501112": 7, "302501212": 7, "302503112": 7, "302503212": 7,
  "302514112": 7, "302514212": 7, "302521112": 7, "302523112": 7,
  "302524112": 7, "302531212": 7, "302533212": 7, "302534212": 7,
  "302544112": 8, "302544212": 8
};

const cs = JSON.parse(fs.readFileSync(skillsPath, "utf8"));

let updatedCost = 0;
let updatedHarm = 0;

for (const [charName, charData] of Object.entries(cs)) {
  for (const skill of (charData.skills || [])) {
    if (skill.ranks) {
      for (const [rk, rankData] of Object.entries(skill.ranks)) {
        const sid = String(rankData.id);
        if (COST_MAP[sid] !== undefined) {
          rankData.cost = COST_MAP[sid];
          updatedCost++;
        }
        if (HARM_MAP[sid] !== undefined) {
          rankData.harmonization = HARM_MAP[sid];
          updatedHarm++;
        }
      }
    }
  }
}

// 4. Update Harmonization for Ultimates of Conduit characters
const CONDUIT_ULTS = {
  "The Twins": -100,
  "Coppélia": -100,
  "Everecho": -100,
  "Hedone": -100
};

for (const [charName, harmVal] of Object.entries(CONDUIT_ULTS)) {
  if (cs[charName]) {
    const ult = (cs[charName].skills || []).find(s => s.slot === 3 || s.type === "Ultimate");
    if (ult) {
      ult.harmonization = harmVal;
      updatedHarm++;
    }
  }
}

console.log(`Updated ${updatedCost} cost entries and ${updatedHarm} harmonization entries in character_skills.json.`);
fs.writeFileSync(skillsPath, JSON.stringify(cs, null, 2) + "\n", "utf8");
