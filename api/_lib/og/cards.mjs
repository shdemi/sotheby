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
        infoRow(t(lang, "card.portrait", "Portrait"), portraitPills(char.portrait)),
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

function teamMember(member, lang, art) {
  const primary = lang === "cn" ? member.nameZh || member.name : member.name;
  const chubeName = member.psychube
    ? (lang === "cn" && member.psychubeNameZh) || member.psychubeName || member.psychube
    : "";
  return h("div", { display: "flex", flexDirection: "column", alignItems: "center", flex: 1, marginRight: "18px" }, [
    portrait(art.head, 190, member.rarity, primary),
    h(
      "div",
      {
        display: "flex",
        fontSize: "24px",
        fontWeight: 700,
        marginTop: "12px",
        textAlign: "center",
        lineHeight: 1.15,
        height: "30px",
      },
      primary,
    ),
    member.afflatus
      ? h("div", { display: "flex", alignItems: "center", marginTop: "6px" }, [
          kids(
            art.afflatus ? img(art.afflatus, { width: "22px", height: "22px", marginRight: "6px" }) : null,
            h("div", { display: "flex", fontSize: "16px", color: C.muted }, afflatusLabel(lang, member.afflatus)),
          ),
        ])
      : null,
    member.psychube
      ? h("div", { display: "flex", alignItems: "center", marginTop: "12px" }, [
          kids(
            art.chube
              ? img(art.chube, { width: "44px", height: "44px", borderRadius: "8px", marginRight: "8px" })
              : h("div", { display: "flex", width: "44px", height: "44px", borderRadius: "8px", background: C.empty }),
            h(
              "div",
              { display: "flex", width: "150px", fontSize: "15px", lineHeight: 1.25, color: C.text },
              chubeName,
            ),
          ),
        ])
      : h("div", { display: "flex", fontSize: "15px", color: C.muted, marginTop: "12px" }, "—"),
  ]);
}

function emptyMember() {
  return h("div", { display: "flex", flexDirection: "column", alignItems: "center", flex: 1, marginRight: "18px" }, [
    h(
      "div",
      {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "190px",
        height: "190px",
        borderRadius: "14px",
        border: `2px dashed ${C.lineSoft}`,
        background: C.empty,
        fontSize: "54px",
        color: C.muted,
      },
      "+",
    ),
  ]);
}

export function teamCard({ team, members, lang, art }) {
  const title = team || t(lang, "og.teamBuild", "Team Build");
  const count = t(lang, "og.members", "members").replace("{n}", String(members.length));
  const badge = h("div", { display: "flex", fontSize: "18px", letterSpacing: "1px", color: C.muted }, count);

  const columns = [];
  for (let i = 0; i < 4; i += 1) {
    const member = members[i];
    columns.push(member ? teamMember(member, lang, art[i] || {}) : emptyMember());
  }
  if (columns.length) columns[columns.length - 1].props.style.marginRight = "0";

  return frame([
    header(badge),
    h("div", { display: "flex", flexDirection: "column", marginTop: "10px" }, [
      h("div", { display: "flex", fontSize: "44px", fontWeight: 700, lineHeight: 1.1 }, title),
      h("div", { display: "flex", fontSize: "18px", color: C.muted, marginTop: "4px" }, "Reverse: 1999 · Team Build"),
    ]),
    h("div", { display: "flex", alignItems: "flex-start", flex: 1, marginTop: "22px" }, columns),
    footer(lang === "cn" ? "Reverse: 1999 · 培养指南" : "Reverse: 1999 · Team Build"),
  ]);
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
