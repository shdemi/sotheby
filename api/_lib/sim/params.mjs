/**
 * Shared parsing for a `/sim` share link.
 *
 *   compact (what the app now copies):
 *     /sim?t=308601-3-60-5-1527,302801-3-60-0-1504&name=FUA&lang=en
 *     /sim?c=308601&lang=vi
 *
 *   legacy (still accepted, so links already posted keep working):
 *     /sim?team=Lucy,Jessica,6,Windsong&chubes=6:1527,6:1504,6:1579,6:1500&name=FUA&lang=en
 *     /sim?character=Lucy&lang=vi
 *
 * A compact team member is `<skinId>-<insight>-<level>-<portrait>-<chubeId>`; trailing
 * zero fields are omitted. The skin id is `<charId><skinSuffix>` (default = `01`), so it
 * already carries the character. Chubes use the game id, which is unique across rarities.
 *
 * `lang` is written by the app so the cached card matches the page the visitor lands on.
 * It stays optional: a hand-written link without it falls back to `en` for the crawler
 * and to the visitor's own setting for the page (`langExplicit`).
 *
 * `api/sim.js` uses this to write the `<meta og:*>` tags a crawler reads; `app.js` mirrors
 * the same shape locally (injected as `window.__SIM__`). Unknown ids are dropped instead
 * of failing, so a link keeps working after a roster change.
 */
import crypto from "node:crypto";

import { ogIndex } from "../og/assets.mjs";
import { normalizeLang, t } from "../og/labels.mjs";
import { findCharacter, findPsychube, parseList } from "../og/resolve.mjs";

export const MAX_MEMBERS = 4;

/** `id -> character row`, built once per process from the generated index. */
let characterByNumericId = null;

function characterForId(index, id) {
  if (!characterByNumericId) {
    characterByNumericId = new Map();
    for (const char of Object.values(index.characters)) {
      if (char.id) characterByNumericId.set(Number(char.id), char);
    }
  }
  return characterByNumericId.get(Number(id)) || null;
}

function slim(char) {
  if (!char) return null;
  return {
    id: Number(char.id) || 0,
    name: char.name || "",
    display: char.display || char.name || "",
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

/** Default skin id for a character (`<charId>01`). */
export function defaultSkinId(charId) {
  return Number(charId) * 100 + 1;
}

/**
 * The InfoBook rows only a character card prints (the team card never does). They are
 * added after `slim`, so a team member payload stays small.
 */
function cardExtras(char) {
  return {
    roleTags: Array.isArray(char.roleTags) ? char.roleTags : [],
    roleTagsZh: Array.isArray(char.roleTagsZh) ? char.roleTagsZh : [],
    patternColor: char.patternColor || "",
    chart: char.chart || null,
    resonance: Array.isArray(char.resonance) ? char.resonance : [],
  };
}

/** `slim` + the build rows the character card draws. */
function characterCardRow(char) {
  return char ? { ...slim(char), ...cardExtras(char) } : null;
}

/**
 * One compact member token -> `{ charId, skinId, insight, level, portrait, chube }`.
 * A bare 4-digit token is a character with its default skin.
 */
export function parseCompactMember(token) {
  const raw = String(token || "").trim();
  if (!raw) return null;
  const parts = raw.split("-");
  const numeric = Number(parts[0]);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;

  const digits = String(Math.trunc(numeric));
  const isSkin = digits.length > 4;
  const charId = isSkin ? Math.trunc(numeric / 100) : Math.trunc(numeric);
  const skinId = isSkin ? Math.trunc(numeric) : defaultSkinId(charId);

  return {
    charId,
    skinId,
    insight: Number(parts[1]) || 0,
    level: Number(parts[2]) || 0,
    portrait: Number(parts[3]) || 0,
    // The trailing chube may itself be `<rarity>:<id>` on a hand-written link.
    chube: String(parts.slice(4).join("-") || "").trim(),
  };
}

function skinHead(skinId) {
  return `images/headicon_small/${skinId}.png`;
}

function memberExtras(member) {
  const chube = member.chube ? findPsychube(ogIndex(), member.chube) : null;
  return {
    skinId: member.skinId,
    insight: member.insight,
    level: member.level,
    portraitTier: member.portrait,
    psychube: chube?.key || "",
    psychubeName: chube?.name || "",
    psychubeNameZh: chube?.nameZh || "",
    psychubeIcon: chube?.icon || "",
  };
}

function compactMembers(index, value) {
  return parseList(value)
    .map((token) => {
      const parsed = parseCompactMember(token);
      if (!parsed) return null;
      const char = characterForId(index, parsed.charId);
      if (!char) return null;
      return {
        ...slim(char),
        // The link names the skin, so the card shows the sharer's own art.
        head: skinHead(parsed.skinId),
        ...memberExtras(parsed),
      };
    })
    .filter(Boolean)
    .slice(0, MAX_MEMBERS);
}

function legacyMembers(index, query) {
  const chubeTokens = parseList(query.chubes);
  // Filter before truncating: a junk token must neither consume one of the four slots
  // nor shift the positional `chubes` list onto the wrong member.
  return parseList(query.team)
    .map((token, i) => {
      const char = findCharacter(index, token);
      if (!char) return null;
      const chube = findPsychube(index, chubeTokens[i]);
      return {
        ...slim(char),
        skinId: defaultSkinId(char.id),
        insight: 0,
        level: 0,
        portraitTier: 0,
        psychube: chube?.key || "",
        psychubeName: chube?.name || "",
        psychubeNameZh: chube?.nameZh || "",
        psychubeIcon: chube?.icon || "",
      };
    })
    .filter(Boolean)
    .slice(0, MAX_MEMBERS);
}

/** A compact character link (`c=`) names a skin id or a character id. */
function compactCharacter(index, value) {
  const parsed = parseCompactMember(value);
  if (!parsed) return null;
  const char = characterForId(index, parsed.charId);
  if (!char) return null;
  return {
    ...characterCardRow(char),
    head: skinHead(parsed.skinId),
    skinId: parsed.skinId,
  };
}

export function normalizeSim(query = {}) {
  const index = ogIndex();
  // The app writes `lang` into every link it copies; it stays optional here, so a
  // hand-written link still works (the card falls back to English, the page follows
  // the visitor). `langExplicit` tells the two apart.
  const lang = normalizeLang(query.lang);
  const langExplicit = query.lang !== undefined && String(query.lang).trim() !== "";

  const members = query.t
    ? compactMembers(index, query.t)
    : legacyMembers(index, query);

  const character = members.length
    ? null
    : compactCharacter(index, query.c) || characterCardRow(findCharacter(index, query.character));

  return {
    lang,
    langExplicit,
    name: String(query.name || "").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 40),
    mode: members.length ? "team" : character ? "character" : "default",
    members,
    character,
  };
}

/** Chube game id (`6:1527` -> `1527`), which is unique across rarities. */
export function chubeGameId(key) {
  const raw = String(key || "");
  const id = raw.includes(":") ? raw.split(":").pop() : raw;
  return /^\d+$/.test(id) ? id : "";
}

/** Compact member token, matching `parseCompactMember`. */
export function compactMemberToken(member) {
  const fields = [
    member.skinId || defaultSkinId(member.id || 0),
    member.insight || 0,
    member.level || 0,
    member.portraitTier || 0,
    chubeGameId(member.psychube),
  ];
  while (fields.length > 1 && !fields[fields.length - 1]) fields.pop();
  return fields.join("-");
}

/** Canonical query string for `/api/og` (no `v`), so the shell and the card agree. */
export function simImageQuery(sim) {
  const params = new URLSearchParams();
  if (sim.mode === "team") {
    params.set("t", sim.members.map((m) => compactMemberToken(m)).join(","));
    if (sim.name) params.set("name", sim.name);
  } else if (sim.mode === "character") {
    params.set("c", String(sim.character.skinId || defaultSkinId(sim.character.id)));
  }
  // The language is part of the card, so it is part of the cache key too.
  if (sim.lang && sim.langExplicit) params.set("lang", sim.lang);
  return params.toString();
}

/**
 * Short content hash: Discord caches an OG image by URL, so the URL must change with it.
 *
 * `CARD_RENDER_VERSION` is part of the hash on purpose: a layout fix (the portrait
 * dashes, the parchment team card, …) changes the picture without changing the payload,
 * and without the salt every link already posted would keep showing the old bitmap.
 */
export const CARD_RENDER_VERSION = "2026-11-09b";

export function simVersion(sim) {
  return crypto
    .createHash("sha1")
    .update(`${CARD_RENDER_VERSION}:${simImageQuery(sim)}`)
    .digest("hex")
    .slice(0, 10);
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
