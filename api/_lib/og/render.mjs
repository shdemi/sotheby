/**
 * Renders the OG image for `/api/og`.
 *
 *   /api/og?character=Lucy&lang=en
 *   /api/og?team=Lucy,Jessica,6,37&chubes=6:1527,5:1434,6:1579,6:1500&name=My%20Team
 *   /api/og                       (brand card)
 *
 * Everything is resolved against `data/og_index.json`, so an unknown name is dropped
 * instead of failing the request: a shared link with stale ids still yields a card.
 */
import { ImageResponse } from "@vercel/og";

import { loadAll, ogFonts, ogIndex } from "./assets.mjs";
import { characterCard, defaultCard, teamCard } from "./cards.mjs";
import { normalizeLang } from "./labels.mjs";
import { findCharacter, findPsychube, parseList } from "./resolve.mjs";

const MAX_MEMBERS = 4;
const SHOWCASE = ["Lucy", "Jessica", "6", "Windsong"];

function afflatusIcon(afflatus) {
  return afflatus ? `images/afflatus_icon/${afflatus}.png` : "";
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
      const [head, afflatus, chube] = await loadAll(
        [member.head, afflatusIcon(member.afflatus), member.psychubeIcon],
        origin,
      );
      return { head, afflatus, chube };
    }),
  );
}

export async function renderOg({ character, team, chubes, name, lang, origin } = {}) {
  const index = ogIndex();
  const locale = normalizeLang(lang);

  const chubeTokens = parseList(chubes);
  const teamTokens = parseList(team);

  if (!teamTokens.length && !character) {
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

  if (teamTokens.length) {
    const members = teamTokens
      .map((token, i) => {
        const char = findCharacter(index, token);
        if (!char) return null;
        const chube = findPsychube(index, chubeTokens[i]);
        return {
          name: char.name,
          nameZh: char.nameZh,
          rarity: char.rarity,
          afflatus: char.afflatus,
          head: char.head,
          psychube: chube?.key || "",
          psychubeName: chube?.name || "",
          psychubeNameZh: chube?.nameZh || "",
          psychubeIcon: chube?.icon || "",
        };
      })
      .filter(Boolean)
      .slice(0, MAX_MEMBERS);

    const art = await teamArt(members, origin);
    return new ImageResponse(teamCard({ team: name, members, lang: locale, art }), {
      width: 1200,
      height: 630,
      fonts: ogFonts(),
    });
  }

  const char = findCharacter(index, character);
  if (!char) {
    return renderOg({ lang: locale, origin });
  }

  const art = await characterArt(index, char, origin);
  return new ImageResponse(characterCard({ char, lang: locale, art }), {
    width: 1200,
    height: 630,
    fonts: ogFonts(),
  });
}
