/**
 * The three OG cards: character, team and the default brand card.
 *
 * `art` is a map of already-resolved data URIs (see `assets.mjs` `loadAll`):
 *
 *   head, afflatus, shape, chubes[]   character card
 *   members[].head/afflatus/chube     team card
 *
 * A missing URI is fine — every piece falls back to a text placeholder.
 */
import { afflatusLabel, patternLabel, t } from "./labels.mjs";
import {
  C,
  FONT,
  P,
  RARITY,
  chip,
  dash,
  footer,
  frame,
  h,
  header,
  img,
  infoRow,
  kids,
  portrait,
  stars,
} from "./theme.mjs";

const PSYCHUBE_NAME_WIDTH = 176;

function psychubeBlock(name, src) {
  return h("div", { display: "flex", alignItems: "center", marginRight: "16px" }, [
    kids(
      src
        ? img(src, { width: "56px", height: "56px", borderRadius: "10px", marginRight: "10px" })
        : h(
            "div",
            {
              display: "flex",
              width: "56px",
              height: "56px",
              borderRadius: "10px",
              background: C.empty,
              marginRight: "10px",
            },
            "",
          ),
      h("div", { display: "flex", width: `${PSYCHUBE_NAME_WIDTH}px`, fontSize: "17px", lineHeight: 1.25 }, name),
    ),
  ]);
}

function portraitPills(portrait) {
  const values = String(portrait || "")
    .split("/")
    .map((v) => v.trim())
    .filter(Boolean);
  if (!values.length) return dash();
  return h(
    "div",
    { display: "flex", alignItems: "center" },
    values.map((value) =>
      h(
        "div",
        {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "46px",
          height: "46px",
          marginRight: "10px",
          borderRadius: "11px",
          border: `2px solid ${C.gold}`,
          color: C.gold,
          fontSize: "23px",
          fontWeight: 700,
        },
        value,
      ),
    ),
  );
}

function resonanceBlock(pattern, shape, shapeSrc, lang) {
  if (!pattern) return dash();
  return h("div", { display: "flex", alignItems: "center" }, [
    kids(
      shapeSrc ? img(shapeSrc, { width: "44px", height: "44px", marginRight: "12px" }) : null,
      h("div", { display: "flex", flexDirection: "column" }, [
        h("div", { display: "flex", fontSize: "25px", fontWeight: 700 }, patternLabel(lang, pattern)),
        shape ? h("div", { display: "flex", fontSize: "16px", color: C.muted, marginTop: "2px" }, shape) : null,
      ]),
    ),
  ]);
}

export function characterCard({ char, lang, art }) {
  const primary = lang === "cn" ? char.nameZh || char.name : char.name;
  const secondary = lang === "cn" ? char.name : char.nameZh;
  const chubeNames = char.psychubes.map((key) => {
    const row = art.chubeNames?.[key];
    if (!row) return key;
    return (lang === "cn" && row.zh) || row.en || row.zh || key;
  });

  const chips = kids(
    char.afflatus ? chip(art.afflatus, afflatusLabel(lang, char.afflatus)) : null,
    char.dmgType ? chip(null, lang === "cn" ? char.dmgTypeZh || char.dmgType : char.dmgType) : null,
  );

  return frame([
    header(stars(char.rarity)),
    h("div", { display: "flex", flex: 1, alignItems: "center", marginTop: "18px" }, [
      portrait(art.head, 330, char.rarity, primary),
      h("div", { display: "flex", flexDirection: "column", flex: 1, justifyContent: "center", marginLeft: "34px" }, [
        h("div", { display: "flex", flexDirection: "column" }, [
          h("div", { display: "flex", fontSize: "54px", fontWeight: 700, lineHeight: 1.05 }, primary),
          secondary ? h("div", { display: "flex", fontSize: "25px", color: C.muted, marginTop: "6px" }, secondary) : null,
        ]),
        h("div", { display: "flex", alignItems: "center", marginTop: "16px" }, chips),
        // A character with no recorded portrait tiers drops the row instead of printing a
        // lone em dash, which reads like a broken card.
        char.portrait ? infoRow(t(lang, "card.portrait", "Portrait"), portraitPills(char.portrait)) : null,
        infoRow(
          t(lang, "card.resonance", "Resonance"),
          resonanceBlock(char.pattern, char.shape, art.shape, lang),
        ),
        infoRow(
          t(lang, "builds.psychubes", "Recommended Psychubes"),
          char.psychubes.length
            ? h(
                "div",
                { display: "flex", alignItems: "center" },
                char.psychubes.map((key, i) => psychubeBlock(chubeNames[i], art.chubes?.[i])),
              )
            : dash(),
        ),
      ]),
    ]),
    footer(lang === "cn" ? "Reverse: 1999 · 培养指南" : "Reverse: 1999 · Build Guide"),
  ]);
}

/* ---- Team card: the exported PNG card (parchment), not the dark build sheet ---- */

const TEAM_SLOT_W = 261;
const TEAM_SLOT_H = 174;
const TEAM_CHUBE_W = 87;
const TEAM_CHUBE_H = 103;
const TEAM_GAP = 14;

/**
 * Five portrait dashes, drawn inside the portrait just above its bottom edge, matching
 * `.team-slot-portrait-bar` in styles.css: 2px tall, 1px apart, inset 12% per side.
 *
 * The widths are explicit pixels because satori's flex shrinking fused the five
 * children into two long segments when each one asked for `100%`.
 */
function portraitDashes(portraitTier) {
  const tier = Math.max(0, Math.min(5, Number(portraitTier) || 0));
  const inset = Math.round(TEAM_SLOT_H * 0.12);
  const total = TEAM_SLOT_H - inset * 2;
  const gap = 1;
  const dashWidth = Math.round(((total - gap * 4) / 5) * 10) / 10;
  return h(
    "div",
    {
      display: "flex",
      position: "absolute",
      left: `${inset}px`,
      bottom: "2px",
      width: `${total}px`,
      height: "2px",
    },
    Array.from({ length: 5 }, (_, i) =>
      h("div", {
        display: "flex",
        flexGrow: 0,
        flexShrink: 0,
        width: `${dashWidth}px`,
        height: "2px",
        marginLeft: i === 0 ? "0" : `${gap}px`,
        backgroundColor: i < tier ? P.dashOn : P.dashOff,
      }),
    ),
  );
}

/** One team slot: portrait (afflatus, level band, portrait dashes) + psychube. */
function teamSlot(member, art, index, lang) {
  const insight = Number(member.insight) || 0;
  const level = Number(member.level) || 0;
  const portraitTier = Number(member.portraitTier) || 0;
  const showMeta = insight > 0 || level > 0;
  const levelText = lang === "cn" ? `${level}级` : `Lv.${level}`;

  const layers = kids(
    art.head
      ? img(art.head, {
          position: "absolute",
          top: "0",
          left: "0",
          width: `${TEAM_SLOT_H}px`,
          height: `${TEAM_SLOT_H}px`,
          objectFit: "cover",
        })
      : null,
    art.afflatus
      ? h(
          "div",
          {
            display: "flex",
            position: "absolute",
            top: "0",
            left: "0",
            height: "38%",
            width: `${Math.round(TEAM_SLOT_H * 0.38 * (74 / 118))}px`,
          },
          img(art.afflatus, { width: "100%", height: "100%", objectFit: "fill" }),
        )
      : null,
    showMeta
      ? h(
          "div",
          {
            display: "flex",
            position: "absolute",
            left: "0",
            right: "0",
            bottom: "0",
            alignItems: "center",
            justifyContent: "center",
            height: "26px",
            background: P.band,
          },
          kids(
            art.insight ? img(art.insight, { width: "14px", height: "14px", marginRight: "4px" }) : null,
            h("div", { display: "flex", fontSize: "15px", fontWeight: 700, color: "#FFFFFF" }, levelText),
          ),
        )
      : null,
    showMeta || portraitTier > 0 ? portraitDashes(portraitTier) : null,
  );

  return h(
    "div",
    {
      display: "flex",
      alignItems: "flex-end",
      width: `${TEAM_SLOT_W}px`,
      height: `${TEAM_SLOT_H}px`,
      marginLeft: index === 0 ? "0" : `${TEAM_GAP}px`,
    },
    [
      h(
        "div",
        {
          display: "flex",
          position: "relative",
          width: `${TEAM_SLOT_H}px`,
          height: `${TEAM_SLOT_H}px`,
          overflow: "hidden",
          backgroundColor: "#0f0e0c",
          border: `1px solid ${P.slot}`,
        },
        layers,
      ),
      h(
        "div",
        {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: `${TEAM_CHUBE_W}px`,
          height: `${TEAM_CHUBE_H}px`,
          alignSelf: "flex-end",
        },
        kids(
          art.chube
            ? img(art.chube, { width: `${TEAM_CHUBE_W}px`, height: `${TEAM_CHUBE_H}px`, objectFit: "contain" })
            : null,
        ),
      ),
    ],
  );
}

function emptySlot(index) {
  return h(
    "div",
    {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: `${TEAM_SLOT_W}px`,
      height: `${TEAM_SLOT_H}px`,
      marginLeft: index === 0 ? "0" : `${TEAM_GAP}px`,
      border: `1px dashed rgba(50, 60, 52, 0.35)`,
    },
    h("div", { display: "flex", fontSize: "38px", color: "#7d857c" }, "+"),
  );
}

export function teamCard({ team, members, lang, art }) {
  const title = team || t(lang, "og.teamBuild", "Team Build");
  const count = t(lang, "og.members", "{n} members").replace("{n}", String(members.length));

  const slots = [];
  for (let i = 0; i < 4; i += 1) {
    const member = members[i];
    slots.push(member ? teamSlot(member, art[i] || {}, i, lang) : emptySlot(i));
  }

  return h(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      width: "100%",
      height: "100%",
      padding: "30px",
      backgroundColor: P.sheet,
      fontFamily: FONT,
      color: P.ink,
    },
    [
      h(
        "div",
        {
          display: "flex",
          flexDirection: "column",
          width: "100%",
          padding: "22px 26px",
          background: P.bg,
          border: `1px solid ${P.line}`,
        },
        [
          h("div", { display: "flex", alignItems: "center", justifyContent: "space-between" }, [
            h(
              "div",
              { display: "flex", fontSize: "30px", fontWeight: 700, letterSpacing: "0.02em", color: P.ink },
              title,
            ),
            h("div", { display: "flex", fontSize: "15px", letterSpacing: "1px", color: P.sub }, count),
          ]),
          h("div", { display: "flex", alignItems: "flex-start", marginTop: "16px" }, slots),
        ],
      ),
      h(
        "div",
        {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          marginTop: "18px",
          fontSize: "15px",
          color: C.muted,
        },
        [
          h("div", { display: "flex", letterSpacing: "1px" }, "sothebymansion.com"),
          h("div", { display: "flex" }, lang === "cn" ? "Reverse: 1999 · 培养指南" : "Reverse: 1999 · Team Build"),
        ],
      ),
    ],
  );
}

export function defaultCard({ lang, art }) {
  const title = "Sotheby's Mansion";
  const subtitle =
    lang === "cn"
      ? "手提箱 · 有资料 · R1999"
      : lang === "vi"
        ? "Suitcase. Có thông tin. R1999."
        : "Suitcase. With information. R1999.";
  const list =
    lang === "cn"
      ? "角色 · 心相 · 共鸣 · 队伍 · 攻略"
      : "Characters · Psychubes · Resonance · Teams · Guides";

  return frame([
    header(h("div", { display: "flex", fontSize: "18px", letterSpacing: "2px", color: C.muted }, "R1999")),
    h("div", { display: "flex", flexDirection: "column", flex: 1, justifyContent: "center" }, [
      h("div", { display: "flex", fontSize: "86px", fontWeight: 700, lineHeight: 1.02 }, title),
      h("div", { display: "flex", fontSize: "30px", color: C.gold, marginTop: "14px" }, subtitle),
      h("div", { display: "flex", fontSize: "21px", color: C.muted, marginTop: "14px", letterSpacing: "0.5px" }, list),
      art.heads?.length
        ? h(
            "div",
            { display: "flex", alignItems: "center", marginTop: "26px" },
            art.heads.map((src, i) =>
              h(
                "div",
                {
                  display: "flex",
                  width: "150px",
                  height: "150px",
                  marginLeft: i === 0 ? "0" : "14px",
                  borderRadius: "14px",
                  border: `2px solid ${C.line}`,
                  overflow: "hidden",
                  background: "#0c0e12",
                },
                img(src, { width: "150px", height: "150px", objectFit: "cover" }),
              ),
            ),
          )
        : null,
    ]),
    footer(lang === "cn" ? "Reverse: 1999 · 培养指南" : "Reverse: 1999 · Build Guide"),
  ]);
}
