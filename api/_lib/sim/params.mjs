/**
 * Shared parsing for a `/sim` share link.
 *
 * `/sim?team=Lucy,Jessica,6,Windsong&chubes=6:1527,6:1504,6:1579,6:1500&name=FUA&lang=en`
 * `/sim?character=Lucy&lang=vi`
 *
 * `api/sim.js` uses this to write the `<meta og:*>` tags a crawler reads; `app.js` uses
 * the same shape (injected as `window.__SIM__`) to draw the page. Unknown names are
 * dropped instead of failing, so an old link keeps working after a roster change.
 */
import crypto from "node:crypto";

import { ogIndex } from "../og/assets.mjs";
import { normalizeLang, t } from "../og/labels.mjs";
import { findCharacter, findPsychube, parseList } from "../og/resolve.mjs";

export const MAX_MEMBERS = 4;

function slim(char) {
  if (!char) return null;
  return {
    name: char.name || "",
    nameZh: char.nameZh || "",
    rarity: char.rarity || 0,
    afflatus: char.afflatus || "",
    dmgType: char.dmgType || "",
    dmgTypeZh: char.dmgTypeZh || "",
    head: char.head || "",
    pattern: char.pattern || "",
    shape: char.shape || "",
    patternIcon: char.patternIcon || "",
    portrait: char.portrait || "",
    psychubes: Array.isArray(char.psychubes) ? char.psychubes : [],
  };
}

export function normalizeSim(query = {}) {
  const index = ogIndex();
  const lang = normalizeLang(query.lang);
  const chubeTokens = parseList(query.chubes);

  // Filter before truncating: a junk token must neither consume one of the four slots
  // nor shift the positional `chubes` list onto the wrong member.
  const members = parseList(query.team)
    .map((token, i) => {
      const char = findCharacter(index, token);
      if (!char) return null;
      const chube = findPsychube(index, chubeTokens[i]);
      return {
        ...slim(char),
        psychube: chube?.key || "",
        psychubeName: chube?.name || "",
        psychubeNameZh: chube?.nameZh || "",
        psychubeIcon: chube?.icon || "",
      };
    })
    .filter(Boolean)
    .slice(0, MAX_MEMBERS);

  const character = members.length ? null : slim(findCharacter(index, query.character));

  return {
    lang,
    name: String(query.name || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 40),
    mode: members.length ? "team" : character ? "character" : "default",
    members,
    character,
  };
}

/** Canonical query string for `/api/og` (no `v`), so the shell and the card agree. */
export function simImageQuery(sim) {
  const params = new URLSearchParams();
  if (sim.mode === "team") {
    params.set("team", sim.members.map((m) => m.name).join(","));
    const chubes = sim.members.map((m) => m.psychube).filter(Boolean);
    if (chubes.length) params.set("chubes", chubes.join(","));
    if (sim.name) params.set("name", sim.name);
  } else if (sim.mode === "character") {
    params.set("character", sim.character.name);
  }
  if (sim.lang) params.set("lang", sim.lang);
  return params.toString();
}

/** Short content hash: Discord caches an OG image by URL, so the URL must change with it. */
export function simVersion(sim) {
  return crypto.createHash("sha1").update(simImageQuery(sim)).digest("hex").slice(0, 10);
}

export function simTitle(sim) {
  const { lang } = sim;
  if (sim.mode === "team") {
    return sim.name || t(lang, "og.teamBuild", "Team Build");
  }
  if (sim.mode === "character") {
    return lang === "cn" ? sim.character.nameZh || sim.character.name : sim.character.name;
  }
  return "Sotheby's Mansion";
}

export function simDescription(sim) {
  const { lang } = sim;

  if (sim.mode === "team") {
    const names = sim.members.map((m) => (lang === "cn" ? m.nameZh || m.name : m.name));
    const count = t(lang, "og.members", "{n} members").replace("{n}", String(names.length));
    return `${count} · ${names.join(", ")} — ${t(lang, "og.teamBuild", "Team Build")}, R1999.`;
  }

  if (sim.mode === "character") {
    const char = sim.character;
    const parts = [];
    if (char.portrait) parts.push(`${t(lang, "card.portrait", "Portrait")}: ${char.portrait}`);
    if (char.pattern) parts.push(`${t(lang, "card.resonance", "Resonance")}: ${char.pattern}`);
    if (char.psychubes.length) {
      parts.push(`${t(lang, "builds.psychubes", "Recommended Psychubes")}: ${char.psychubes.length}`);
    }
    const name = lang === "cn" ? char.nameZh || char.name : char.name;
    return parts.length ? `${name} — ${parts.join(" · ")}` : `${name} — R1999 build.`;
  }

  return lang === "cn"
    ? "手提箱 · 有资料 · R1999"
    : lang === "vi"
      ? "Suitcase. Có thông tin. R1999."
      : "Suitcase. With information. R1999.";
}
