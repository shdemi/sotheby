/**
 * Verifies the promotional-code parser against a frozen copy of the Fandom
 * wikitext. No network: `/api/codes` gets no CI coverage otherwise.
 *
 *   node editor/_test/codes.test.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseExpiry, parsePromoCodes } from "../../api/_lib/parse-codes.mjs";

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

const wikitext = fs.readFileSync(path.join(HERE, "fixtures", "promo-codes.wikitext"), "utf8");
const { permanent, current } = parsePromoCodes(wikitext);

/* ------------------------------------------------------------------ *
 * Sections
 * ------------------------------------------------------------------ */

console.log("\n=== Sections ===");
check("permanent section holds 2 codes", permanent.length === 2, permanent.length);
check("current section holds 6 codes", current.length === 6, current.length);
check("permanent keeps page order", permanent.map((c) => c.code).join(",") === "5YRBRF9,1999GIFT", permanent.map((c) => c.code).join(","));
check(
  "current keeps page order",
  current.map((c) => c.code).join(",") === "Typhonomachy,AquaticGames,Fallingwater,GhostAlert,DesperateCounter,Kymaion",
  current.map((c) => c.code).join(","),
);
check("expired codes are excluded", ![...permanent, ...current].some((c) => c.code === "OldCode"));
check(
  "a code repeated in Expired appears once",
  [...permanent, ...current].filter((c) => c.code.toLowerCase() === "5yrbrf9").length === 1,
);

/* ------------------------------------------------------------------ *
 * Rewards
 * ------------------------------------------------------------------ */

console.log("\n=== Rewards ===");
const first = permanent[0];
check("first permanent code", first.code === "5YRBRF9", first.code);
check("two reward rows", first.rewards.length === 2, JSON.stringify(first.rewards));
check("thousands separator stripped", first.rewards[0].qty === 19999, first.rewards[0].qty);
check("reward name + rarity", first.rewards[0].name === "Dust" && first.rewards[0].rarity === 3);
check("linked names are cleaned", permanent[1].rewards[0].name === "Clear Drop", permanent[1].rewards[0].name);
check("two templates on one line", current[0].rewards.length === 2, current[0].rewards.length);

/* ------------------------------------------------------------------ *
 * Expiry comments
 * ------------------------------------------------------------------ */

console.log("\n=== Expiry ===");
check("unreadable date keeps raw text", current[0].expires?.raw === "??/??/2026" && current[0].expires.uncertain === true);
check("unreadable date has no ISO value", current[0].expires?.iso === null);
check("unambiguous DMY becomes ISO", current[1].expires?.iso === "2026-12-14", current[1].expires?.iso);
check("unambiguous DMY is certain", current[1].expires?.uncertain === false);
check("ambiguous 04/11 stays unparsed", current[2].expires?.iso === null && current[2].expires?.uncertain === true);
check("prose date keeps raw text", current[3].expires?.raw === "idk" && current[3].expires?.iso === null);
check("two-digit year stays unparsed", current[4].expires?.iso === null, current[4].expires?.raw);
check("missing comment means no expires field", !("expires" in current[5]));

check("parseExpiry: empty -> null", parseExpiry("") === null);
check("parseExpiry: ISO passthrough", parseExpiry("2026-03-09")?.iso === "2026-03-09" && parseExpiry("2026-03-09")?.uncertain === false);
check("parseExpiry: 31/01/2026 -> DMY", parseExpiry("31/01/2026")?.iso === "2026-01-31", parseExpiry("31/01/2026")?.iso);
check("parseExpiry: 01/31/2026 -> MDY", parseExpiry("01/31/2026")?.iso === "2026-01-31", parseExpiry("01/31/2026")?.iso);
check("parseExpiry: prefix is stripped", parseExpiry("Expires: 14/12/2026")?.raw === "14/12/2026", parseExpiry("Expires: 14/12/2026")?.raw);

/* ------------------------------------------------------------------ *
 * Snapshot
 * ------------------------------------------------------------------ */

console.log("\n=== Snapshot ===");
const snapshotPath = path.join(ROOT, "data", "promo_codes.json");
check("data/promo_codes.json exists", fs.existsSync(snapshotPath));
if (fs.existsSync(snapshotPath)) {
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
  check("snapshot has a source link", typeof snapshot.source === "string" && snapshot.source.includes("fandom.com"));
  check("snapshot has a fetchedAt stamp", typeof snapshot.fetchedAt === "string" && !Number.isNaN(Date.parse(snapshot.fetchedAt)));
  check("snapshot keeps active codes", snapshot.permanent.length + snapshot.current.length > 0);
  check(
    "snapshot codes are unique",
    new Set([...snapshot.permanent, ...snapshot.current].map((c) => c.code.toLowerCase())).size ===
      snapshot.permanent.length + snapshot.current.length,
  );
  check(
    "snapshot expiry rows carry raw text",
    snapshot.current.every((c) => !c.expires || typeof c.expires.raw === "string"),
  );
}

if (failures > 0) {
  console.log(`\n${failures} of ${checks} checks failed.`);
  process.exit(1);
}
console.log(`\nAll ${checks} checks passed.`);
