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
  { file: "character-lucy-en", params: { character: "Lucy", lang: "en" } },
  { file: "character-lucy-vi", params: { character: "Lucy", lang: "vi" } },
  { file: "character-lucy-cn", params: { character: "Lucy", lang: "cn" } },
  { file: "character-six-en", params: { character: "Six", lang: "en" } },
  { file: "character-jessica-en", params: { character: "Jessica", lang: "en" } },
  {
    file: "team-en",
    params: {
      team: "Lucy,Jessica,6,Windsong",
      chubes: "6:1527,6:1504,6:1579,6:1500",
      name: "FUA Hypercarry",
      lang: "en",
    },
  },
  {
    file: "team-cn",
    params: {
      team: "Lucy,Jessica,6,Windsong",
      chubes: "6:1527,6:1504,6:1579,6:1500",
      name: "追击队",
      lang: "cn",
    },
  },
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
