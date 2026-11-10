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
import { characterCardHeight } from "../../api/_lib/og/cards.mjs";

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
check("psychube by bare game id", findPsychube(index, "1527")?.key === "6:1527");
check("psychube by english name", findPsychube(index, chube.name)?.key === "6:1527");
check("psychube by chinese name", findPsychube(index, chube.nameZh)?.key === "6:1527");
check("unknown psychube is null", findPsychube(index, "9:9") === null);
check("unknown bare id is null", findPsychube(index, "999999") === null);

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
 * normalizeSim — compact links (`t=` / `c=`)
 * ------------------------------------------------------------------ */

console.log("\n=== normalizeSim: compact ===");
const compact = normalizeSim({ t: "308601-3-60-5-1527,305601-3-60", name: "FUA Hypercarry" });
check("compact mode is team", compact.mode === "team", compact.mode);
check("compact keeps both members", compact.members.length === 2, compact.members.length);
check("compact carries the character id", compact.members[0].id === 3086, compact.members[0].id);
check("compact carries insight/level/portrait", compact.members[0].insight === 3 && compact.members[0].level === 60 && compact.members[0].portraitTier === 5);
check("compact chube resolves by game id", compact.members[0].psychube === "6:1527", compact.members[0].psychube);
check("compact names the skin art", compact.members[0].head === "images/headicon_small/308601.png", compact.members[0].head);
check("compact skin carries the character", compact.members[0].name === "Lucy", compact.members[0].name);
check("trailing zero fields are optional", compact.members[1].psychube === "" && compact.members[1].insight === 3);
check("name is kept", compact.name === "FUA Hypercarry", compact.name);

const bareChar = normalizeSim({ t: "3086" });
check("a bare character id uses the default skin", bareChar.members[0].skinId === 308601, bareChar.members[0].skinId);

const compactNoise = normalizeSim({ t: "308601-3,999999-3,305601" });
check("unknown compact ids are dropped", compactNoise.members.map((m) => m.name).join(",") === "Lucy,Jessica", compactNoise.members.map((m) => m.name).join(","));

const compactChar = normalizeSim({ c: "308601" });
check("compact character mode", compactChar.mode === "character", compactChar.mode);
check("compact character carries the skin", compactChar.character.skinId === 308601 && compactChar.character.name === "Lucy");
check("compact character uses the skin art", compactChar.character.head === "images/headicon_small/308601.png");
check("compact character keeps the build data", compactChar.character.portrait === "0/1/3/5");
check(
  "resonance presets are preset labels",
  compactChar.character.resonance.every((label) => typeof label === "string" && label),
  JSON.stringify(compactChar.character.resonance),
);

const bareCharLink = normalizeSim({ c: "3086" });
check("a bare id in c= uses the default skin", bareCharLink.character.skinId === 308601, bareCharLink.character.skinId);
check("an unknown c= falls back to the brand card", normalizeSim({ c: "999999" }).mode === "default");
check("a link with no lang marks its language implicit", compact.langExplicit === false && compact.lang === "en");
check("an old link marks its language explicit", team.langExplicit === true && team.lang === "en");

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
check(
  "query uses the compact team tokens",
  teamQuery.get("t") === "308601-0-0-0-1527,305601-0-0-0-1504,307901-0-0-0-1545,307701-0-0-0-1539",
  teamQuery.get("t"),
);
check("query carries the name", teamQuery.get("name") === "FUA Hypercarry");
check("legacy query carries the language", teamQuery.get("lang") === "en");
check("query has no verbose team param", !teamQuery.has("team") && !teamQuery.has("chubes"));

const compactQuery = new URLSearchParams(simImageQuery(compact));
check("compact query round-trips", compactQuery.get("t") === "308601-3-60-5-1527,305601-3-60", compactQuery.get("t"));
check("a query without an explicit language omits lang", !compactQuery.has("lang"), compactQuery.toString());

const sharedQuery = new URLSearchParams(simImageQuery(normalizeSim({ t: "308601-3-60-5-1527", name: "FUA", lang: "vi" })));
check("a shared compact link carries its language", sharedQuery.get("lang") === "vi", sharedQuery.toString());

const emptyChubes = new URLSearchParams(simImageQuery(normalizeSim({ team: "Lucy", lang: "en" })));
check("trailing empty fields are dropped", emptyChubes.get("t") === "308601", emptyChubes.get("t"));

const charQuery = new URLSearchParams(simImageQuery(character));
check("character query names the skin", charQuery.get("c") === "308601", charQuery.get("c"));
check("character query has no team", !charQuery.has("t") && !charQuery.has("team"));

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

const TAGLINE_EN = "Suitcase. With information. R1999.";
const TAGLINE_VI = "Suitcase. Có thông tin. R1999.";
const TAGLINE_CN = "手提箱 · 有资料 · R1999";

check("team description is the site tagline", simDescription(team) === TAGLINE_EN, simDescription(team));
check("character description is the site tagline", simDescription(character) === TAGLINE_VI, simDescription(character));
check("a team link does not list its members", !/members|Lucy/.test(simDescription(team)), simDescription(team));
check("a character link does not print its build", !/Portrait|Resonance|Psychubes|R10-11/.test(simDescription(character)), simDescription(character));
check("cn description uses the chinese tagline", simDescription(normalizeSim({ team: "Lucy,6", lang: "cn" })) === TAGLINE_CN, simDescription(normalizeSim({ team: "Lucy,6", lang: "cn" })));
check("default description is the site tagline", simDescription(normalizeSim({})) === TAGLINE_EN, simDescription(normalizeSim({})));

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
 * Card height
 * ------------------------------------------------------------------ */

console.log("\n=== card height ===");
const everyChar = Object.values(index.characters);
const chartless = everyChar.filter((c) => !(c.chart && c.chart.bars.length));
check("a chart fills the 630px sheet", everyChar.filter((c) => c.chart && c.chart.bars.length).every((c) => characterCardHeight(c) === 630));
check("no chart shortens the sheet", chartless.every((c) => characterCardHeight(c) < 630));
check("a build card keeps a usable height", chartless.every((c) => !((c.psychubes || []).length || c.pattern || (c.resonance || []).length) || characterCardHeight(c) >= 300));
check("a hero with no build gets a name card", characterCardHeight({ psychubes: [], resonance: [] }) === 320);
check("a chart wins over the empty build", characterCardHeight({ chart: { bars: [{ val: 1 }] }, psychubes: [], resonance: [] }) === 630);

/* ------------------------------------------------------------------ *
 * Result
 * ------------------------------------------------------------------ */

console.log(`\n${checks - failures}/${checks} checks passed.`);
if (failures > 0) process.exit(1);
