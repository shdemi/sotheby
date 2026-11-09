/**
 * Renders the OG cards to `.tmp-og/*.png` so the layout can be checked without a
 * Vercel deploy (the local dev server is Python and cannot run `api/`).
 *
 *   node scripts/og/render.mjs                 # all sample cards
 *   node scripts/og/render.mjs Lucy cn         # one card: <character|team> <lang>
 *
 * Images are read from disk (no origin), so this works offline.
 */
import fs from "node:fs";
import path from "node:path";

import { renderOg } from "../../api/_lib/og/render.mjs";

const OUT = path.join(process.cwd(), ".tmp-og");

const CASES = [
  { file: "character-lucy-en", params: { c: "308601", lang: "en" } },
  { file: "character-lucy-cn", params: { c: "308601", lang: "cn" } },
  { file: "character-lucy-vi", params: { c: "308601", lang: "vi" } },
  { file: "character-jessica-en", params: { c: "305601", lang: "en" } },
  // The share link from the bug report: the InfoBook frame, chart and loadout panels.
  { file: "character-rubuska-en", params: { c: "312503", lang: "en" } },
  { file: "character-rubuska-vi", params: { c: "312503", lang: "vi" } },
  // No progression chart: the sheet is only as tall as the two loadout panels.
  { file: "character-charlie-en", params: { character: "Charlie", lang: "en" } },
  // Chartless with the sparsest build there is (no psychubes, one preset).
  { file: "character-alien-en", params: { c: "303401", lang: "en" } },
  // Chartless with both panels full.
  { file: "character-37-en", params: { c: "306601", lang: "en" } },
  // No build data at all: a centred hero row in a shorter name card.
  { file: "character-schneider-en", params: { c: "302901", lang: "en" } },
  // A head icon that shipped as WebP under a `.png` name (empty portrait once).
  { file: "character-perchta-vi", params: { c: "315901", lang: "vi" } },
  // Legacy name links keep rendering the same card.
  { file: "character-lucy-legacy", params: { character: "Lucy", lang: "en" } },
  {
    file: "team-en",
    params: {
      t: "308601-3-60-5-1527,305601-3-60-3-1504,307901-3-60-2-1545,307701-3-60-1-1539",
      name: "FUA Hypercarry",
      lang: "en",
    },
  },
  {
    file: "team-cn",
    params: { t: "308601-3-60-5-1527,305601-3-60-3-1504,307901-3-60-2-1545,307701-3-60-1-1539", name: "追击队", lang: "cn" },
  },
  { file: "team-legacy", params: { team: "Lucy,Jessica,6,Windsong", chubes: "6:1527,6:1504,6:1545,6:1539", name: "FUA Hypercarry" } },
  { file: "team-two", params: { t: "313401-3-60-0-1515,315801-3-60-0-1560", name: "Lingering Glow", lang: "en" } },
  { file: "default-en", params: { lang: "en" } },
  { file: "default-cn", params: { lang: "cn" } },
];

async function write(file, params) {
  const started = Date.now();
  const res = await renderOg(params);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(OUT, { recursive: true });
  const target = path.join(OUT, `${file}.png`);
  fs.writeFileSync(target, buf);
  console.log(`${file.padEnd(24)} ${String(Math.round(buf.length / 1024)).padStart(5)} KB  ${Date.now() - started} ms`);
}

const only = process.argv[2];
const lang = process.argv[3];

if (only) {
  const match = CASES.filter((c) => c.file.startsWith(only) && (!lang || c.file.endsWith(`-${lang}`)));
  if (!match.length) {
    console.error(`no case matches "${only}"${lang ? ` + "${lang}"` : ""}`);
    process.exit(1);
  }
  for (const c of match) await write(c.file, c.params);
} else {
  for (const c of CASES) await write(c.file, c.params);
}
