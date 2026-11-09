/**
 * Renders the OG image for `/api/og`.
 *
 * The function takes the raw query string so it accepts both link shapes:
 *
 *   /api/og?c=308601                        compact share link
 *   /api/og?t=308601-3-60-5-1527,302801-…   compact team
 *   /api/og?character=Lucy&lang=en          legacy
 *   /api/og?team=Lucy,Jessica,6,37&chubes=6:1527,5:1434,6:1579,6:1500&name=My%20Team
 *   /api/og                                 brand card
 *
 * `normalizeSim` owns the parsing, so the card and the `/sim` page never disagree.
 * Everything resolves against `data/og_index.json`, so an unknown id is dropped instead
 * of failing the request: a shared link with stale data still yields a card.
 */
import { ImageResponse } from "@vercel/og";

import { loadAll, ogFonts, ogIndex } from "./assets.mjs";
import { characterCard, defaultCard, teamCard } from "./cards.mjs";
import { normalizeSim } from "../sim/params.mjs";
import { findCharacter } from "./resolve.mjs";

const SHOWCASE = ["Lucy", "Jessica", "6", "Windsong"];

function afflatusIcon(afflatus) {
  return afflatus ? `images/afflatus_icon/${afflatus}.png` : "";
}

function insightIcon(insight) {
  const value = Number(insight) || 0;
  return value > 0 ? `images/insight_icon/I${value}.png` : "";
}

async function characterArt(index, char, origin) {
  const chubeIcons = char.psychubes.map((key) => index.psychubes[key]?.icon || "");
  const chubeNames = {};
  for (const key of char.psychubes) {
    const row = index.psychubes[key];
    chubeNames[key] = row ? { en: row.name || key, zh: row.nameZh || "" } : { en: key, zh: "" };
  }

  const [head, afflatus, shape, ...chubes] = await loadAll(
    [char.head, afflatusIcon(char.afflatus), char.patternIcon, ...chubeIcons],
    origin,
  );
  return { head, afflatus, shape, chubes, chubeNames };
}

async function teamArt(members, origin) {
  return Promise.all(
    members.map(async (member) => {
      const [head, afflatus, chube, insight] = await loadAll(
        [member.head, afflatusIcon(member.afflatus), member.psychubeIcon, insightIcon(member.insight)],
        origin,
      );
      return { head, afflatus, chube, insight };
    }),
  );
}

/**
 * `query` is the raw request query (preferred); the legacy named parameters are still
 * accepted so `scripts/og/render.mjs` and old callers keep working. When `query` is
 * absent the whole argument is used as the query, which is what the sample script passes.
 */
export async function renderOg(input = {}) {
  const index = ogIndex();
  const sim = normalizeSim(input.query || input);
  const locale = sim.lang;
  const origin = input.origin || "";

  if (sim.mode === "default") {
    const heads = await loadAll(
      SHOWCASE.map((n) => findCharacter(index, n)?.head).filter(Boolean),
      origin,
    );
    return new ImageResponse(defaultCard({ lang: locale, art: { heads } }), {
      width: 1200,
      height: 630,
      fonts: ogFonts(),
    });
  }

  if (sim.mode === "team") {
    const art = await teamArt(sim.members, origin);
    return new ImageResponse(
      teamCard({ team: sim.name, members: sim.members, lang: locale, art }),
      { width: 1200, height: 630, fonts: ogFonts() },
    );
  }

  const art = await characterArt(index, sim.character, origin);
  return new ImageResponse(characterCard({ char: sim.character, lang: locale, art }), {
    width: 1200,
    height: 630,
    fonts: ogFonts(),
  });
}
