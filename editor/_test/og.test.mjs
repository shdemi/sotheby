/**
 * Verifies the share-link parser, the resolver and the Open Graph card's own rules.
 *
 *   node editor/_test/og.test.mjs
 *
 * No network and no rendering: `renderOg` needs satori's WASM, which the unit suite
 * should not depend on. The PNG output is checked by `scripts/og/render.mjs` instead.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeSim, simDescription, simImageQuery, simTitle, simVersion } from "../../api/_lib/sim/params.mjs";
import { findCharacter, findPsychube, parseList } from "../../api/_lib/og/resolve.mjs";
import { afflatusLabel, normalizeLang, patternLabel, t } from "../../api/_lib/og/labels.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");

let checks = 0;
let failures = 0;
function check(label, ok, detail) {
  checks++;
  if (ok) console.log(`  PASS  ${label}`);
  else {
    failures++;
    console.log(`  FAIL  ${label}`);
    if (detail !== undefined) console.log(`        ${detail}`);
  }
}

const index = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "og_index.json"), "utf8"));

/* ------------------------------------------------------------------ *
 * parseList
 * ------------------------------------------------------------------ */

console.log("\n=== parseList ===");
check("splits and trims", JSON.stringify(parseList(" Lucy , Jessica ,,6 ")) === '["Lucy","Jessica","6"]');
check("keeps order", parseList("c,a,b").join("") === "cab");
check("empty value is an empty list", parseList("").length === 0 && parseList(undefined).length === 0);
check("arrays are joined", parseList(["Lucy", "6"]).join(",") === "Lucy,6");

/* ------------------------------------------------------------------ *
 * findCharacter / findPsychube
 * ------------------------------------------------------------------ */

console.log("\n=== resolve ===");
check("exact canonical key", findCharacter(index, "Lucy")?.name === "Lucy");
check("case-insensitive", findCharacter(index, "lucy")?.name === "Lucy");
check("display name resolves to the canonical row", findCharacter(index, "Six")?.nameZh === "6");
check("canonical key beats the display label", findCharacter(index, "6")?.name === "Six");
check("chinese name resolves", findCharacter(index, "露西")?.name === "Lucy");
check("unknown name is null", findCharacter(index, "Nobody") === null);
check("blank name is null", findCharacter(index, "   ") === null);

const chube = findPsychube(index, "6:1527");
check("psychube key resolves", chube?.key === "6:1527" && Boolean(chube.name), JSON.stringify(chube));
check("psychube by english name", findPsychube(index, chube.name)?.key === "6:1527");
check("psychube by chinese name", findPsychube(index, chube.nameZh)?.key === "6:1527");
check("unknown psychube is null", findPsychube(index, "9:9") === null);

/* ------------------------------------------------------------------ *
 * normalizeSim — team
 * ------------------------------------------------------------------ */

console.log("\n=== normalizeSim: team ===");
const team = normalizeSim({
  team: "Lucy,Jessica,6,Windsong",
  chubes: "6:1527,6:1504,6:1545,6:1539",
  name: "FUA Hypercarry",
  lang: "en",
});
check("mode is team", team.mode === "team", team.mode);
check("four members", team.members.length === 4, team.members.length);
check("member keeps its displayed name", team.members[2].name === "Six", team.members[2].name);
check("member keeps its chinese name", team.members[0].nameZh === "露西", team.members[0].nameZh);
check("chubes are positional", team.members.map((m) => m.psychube).join(",") === "6:1527,6:1504,6:1545,6:1539");
check("chube names are carried", team.members[0].psychubeName === "Steps Forward", team.members[0].psychubeName);
check("chube icons are carried", team.members[0].psychubeIcon.startsWith("images/psychube_icon/"));
check("hero art is carried", team.members[0].head.startsWith("images/headicon_small/"));
check("team name is kept", team.name === "FUA Hypercarry");

const noisy = normalizeSim({
  team: " Lucy , Nobody ,, Jessica ,Windsong,37,6",
  chubes: "6:1527,6:1504",
  lang: "en",
});
check(
  "unknown names are dropped",
  noisy.members.map((m) => m.name).join(",") === "Lucy,Jessica,Windsong,Thirty-seven",
  noisy.members.map((m) => m.name).join(","),
);

const shifted = normalizeSim({ team: "Lucy,Nobody,Jessica", chubes: "6:1527,6:1504,6:1545", lang: "en" });
check("a dropped name does not shift the chubes", shifted.members[1].psychube === "6:1545", shifted.members.map((m) => m.psychube).join(","));

const five = normalizeSim({ team: "Lucy,Jessica,6,Windsong,37", lang: "en" });
check("more than four members is truncated", five.members.length === 4, five.members.length);

const strayChube = normalizeSim({ team: "Lucy", chubes: "9:9", lang: "en" });
check("an unknown chube leaves the slot empty", strayChube.members[0].psychube === "", strayChube.members[0].psychube);

/* ------------------------------------------------------------------ *
 * normalizeSim — character / default / language / name
 * ------------------------------------------------------------------ */

console.log("\n=== normalizeSim: character, default, lang ===");
const character = normalizeSim({ character: "Lucy", lang: "vi" });
check("mode is character", character.mode === "character", character.mode);
check("no members", character.members.length === 0);
check("build data is carried", character.character.pattern === "Elucidation" && character.character.portrait === "0/1/3/5");
check("recommended chubes resolve to keys", character.character.psychubes.every((key) => /^\d:\d+$/.test(key)), JSON.stringify(character.character.psychubes));
check("language is kept", character.lang === "vi", character.lang);

const fallback = normalizeSim({ character: "Nobody", lang: "en" });
check("an unknown character falls back to the brand card", fallback.mode === "default", fallback.mode);
check("no character payload in default mode", fallback.character === null);
check("unknown language falls back to en", normalizeSim({ lang: "xx" }).lang === "en");
check("language is case-insensitive", normalizeSim({ lang: "CN" }).lang === "cn");

const longName = normalizeSim({ team: "Lucy", name: "x".repeat(80), lang: "en" });
check("team name is capped at 40 chars", longName.name.length === 40, longName.name.length);

const controlName = normalizeSim({ team: "Lucy", name: "a\u0000b\nc", lang: "en" });
check("control characters are stripped", controlName.name === "abc", JSON.stringify(controlName.name));

/* ------------------------------------------------------------------ *
 * Query string, version, title and description
 * ------------------------------------------------------------------ */

console.log("\n=== image query, version, text ===");
const teamQuery = new URLSearchParams(simImageQuery(team));
check("query repeats the canonical team order", teamQuery.get("team") === "Lucy,Jessica,Six,Windsong", teamQuery.get("team"));
check("query carries the chubes", teamQuery.get("chubes") === "6:1527,6:1504,6:1545,6:1539");
check("query carries the name", teamQuery.get("name") === "FUA Hypercarry");
check("query carries the language", teamQuery.get("lang") === "en");

const emptyChubes = new URLSearchParams(simImageQuery(normalizeSim({ team: "Lucy", lang: "en" })));
check("an unset chube list is omitted", !emptyChubes.has("chubes"));

const charQuery = new URLSearchParams(simImageQuery(character));
check("character query names the character", charQuery.get("character") === "Lucy", charQuery.get("character"));
check("character query has no team", !charQuery.has("team"));

const version = simVersion(team);
check("version is ten hex chars", /^[0-9a-f]{10}$/.test(version), version);
check("version is stable for the same payload", simVersion(normalizeSim({ team: "Lucy,Jessica,6,Windsong", chubes: "6:1527,6:1504,6:1545,6:1539", name: "FUA Hypercarry", lang: "en" })) === version);
check(
  "version changes with the payload",
  simVersion(normalizeSim({ team: "Lucy,Jessica,6,Windsong", chubes: "6:1527,6:1504,6:1545,6:1539", name: "Other", lang: "en" })) !== version,
);

check("team title uses the given name", simTitle(team) === "FUA Hypercarry", simTitle(team));
check("untitled team falls back to the label", simTitle(normalizeSim({ team: "Lucy", lang: "en" })) === "Team Build", simTitle(normalizeSim({ team: "Lucy", lang: "en" })));
check("character title uses the english name", simTitle(character) === "Lucy", simTitle(character));
check("cn character title uses the chinese name", simTitle(normalizeSim({ character: "Lucy", lang: "cn" })) === "露西", simTitle(normalizeSim({ character: "Lucy", lang: "cn" })));

const teamDescription = simDescription(team);
check("team description counts members", teamDescription.startsWith("4 members"), teamDescription);
check("team description lists the names", teamDescription.includes("Lucy, Jessica, Six, Windsong"), teamDescription);
check("cn team description uses chinese names", simDescription(normalizeSim({ team: "Lucy,6", lang: "cn" })).includes("露西, 6"), simDescription(normalizeSim({ team: "Lucy,6", lang: "cn" })));
check("character description lists the build", /Portrait: 0\/1\/3\/5/.test(simDescription(character)), simDescription(character));
check("default description is the site tagline", simDescription(normalizeSim({})) === "Suitcase. With information. R1999.", simDescription(normalizeSim({})));

/* ------------------------------------------------------------------ *
 * Labels
 * ------------------------------------------------------------------ */

console.log("\n=== labels ===");
check("afflatus label in en", afflatusLabel("en", "Plant") === "Plant");
check("afflatus label in cn", afflatusLabel("cn", "Plant") === "木", afflatusLabel("cn", "Plant"));
check("afflatus label in vi", afflatusLabel("vi", "Beast") === "Thú", afflatusLabel("vi", "Beast"));
check("hybrid afflatus reuses Mineral", afflatusLabel("cn", "Mineral_Star") === afflatusLabel("cn", "Mineral"));
check("unknown afflatus falls back to the value", afflatusLabel("en", "Void") === "Void");
check("pattern label in cn", patternLabel("cn", "Elucidation") === "洞彻", patternLabel("cn", "Elucidation"));
check("unknown pattern falls back to the value", patternLabel("en", "Mystery") === "Mystery");
check("normalizeLang rejects unknown languages", normalizeLang("de") === "en");
check("t falls back to english", t("cn", "no.such.key", "fallback") === "fallback");

/* ------------------------------------------------------------------ *
 * Result
 * ------------------------------------------------------------------ */

console.log(`\n${checks - failures}/${checks} checks passed.`);
if (failures > 0) process.exit(1);
