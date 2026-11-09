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
import { patternLabel, t } from "./labels.mjs";
import { C, FONT, P, RARITY, footer, frame, h, header, img, kids, safeText } from "./theme.mjs";

/**
 * The character card is the InfoBook's detail pane, not the dark brand sheet: the
 * `#B55829` modal frame, the Portrait Value bars and the two loadout panels, on a flat
 * `#111111` field (the wallpaper was cropped at 1200x630 and read as noise). Colours and
 * sizes are copied from the `.builds-*` / `.build-section` rules in styles.css so the
 * Discord preview and the `/sim` page read as one design.
 */
const BUILD = {
  ink: "#ECE5D9",
  body: "#D6D1C8",
  sub: "#B5B5B3",
  frame: "#B55829",
  accent: "#D05126",
  panel: "rgba(0, 0, 0, 0.28)",
  well: "rgba(0, 0, 0, 0.20)",
  line: "rgba(255, 255, 255, 0.08)",
  lineSoft: "rgba(255, 255, 255, 0.05)",
  track: "rgba(255, 255, 255, 0.045)",
  trackLine: "rgba(181, 181, 179, 0.30)",
  divider: "rgba(255, 255, 255, 0.06)",
};

/** Card geometry. The chart track is the only piece that has to be computed. */
const CARD_H = 630;
const CARD_PAD_X = 26;
const CARD_PAD_TOP = 20;
const CARD_PAD_BOTTOM = 24;
const HERO_H = 84 + 16 + 1; // portrait + padding-bottom + hairline
const GRID_MT = 18;
const SECTION_CHROME_H = 14 * 2 + 11 + 12 + 12 * 2; // section padding, title, well gap, well padding
const CHART_LABEL_H = 11 + 7 + 7 + 11; // value, gap, gap, badge
const CHART_TRACK_W = 55;

/** Row metrics inside the loadout wells, mirrored from `psychubeRow` / `resonanceBlock`. */
const PSYCHUBE_ROW_H = 64;
const PSYCHUBE_ROW_GAP = 20; // margin-top + padding-top on every row after the first
const PATTERN_H = 44;
const PRESET_MT = 14;
const PRESET_H = 30;
/** A hero with no build data gets a centred name card this tall instead of a thin strip. */
const NO_BUILD_H = 320;

/**
 * A chart fills the fixed 630px sheet, but a build without one only has the two loadout
 * panels. Those are natural-height in the InfoBook, so the sheet shortens to them instead
 * of drawing two half-empty frames (85 of the 139 heroes have no progression chart).
 * The estimate only has to be close: the panels are `flexGrow: 1`, so they absorb a few
 * pixels of slack. A hero with no build at all (Schneider) gets a name card, not a 205px
 * strip, and then the hero row is centred in it.
 */
export function characterCardHeight(char) {
  if (char.chart && char.chart.bars.length) return CARD_H;
  const chubes = Math.min(2, (char.psychubes || []).length);
  const presets = Math.min(2, (char.resonance || []).length);
  const sections = [];
  if (chubes) {
    sections.push(SECTION_CHROME_H + chubes * PSYCHUBE_ROW_H + (chubes - 1) * PSYCHUBE_ROW_GAP);
  }
  if (char.pattern || presets) {
    sections.push(
      SECTION_CHROME_H +
        (char.pattern ? PATTERN_H : 0) +
        (presets ? (char.pattern ? PRESET_MT : 0) + PRESET_H : 0),
    );
  }
  if (!sections.length) return NO_BUILD_H;
  const body = Math.max(...sections);
  return 20 * 2 + CARD_PAD_TOP + CARD_PAD_BOTTOM + 2 + HERO_H + GRID_MT + body;
}

/**
 * How tall the bar track is, so the five columns end exactly at the panel's bottom edge:
 * whatever the hero and the right-hand loadout panels leave over. Every small label sets
 * `lineHeight: 1` so those heights are exact and not font-metric guesses.
 */
function trackHeight() {
  const content = CARD_H - 20 * 2 - CARD_PAD_TOP - CARD_PAD_BOTTOM - 2; // minus the frame border
  return content - HERO_H - GRID_MT - SECTION_CHROME_H - CHART_LABEL_H;
}

/** `.build-section-title`: an orange tick and a small uppercase label. */
function buildTitle(text) {
  return h("div", { display: "flex", alignItems: "center" }, [
    kids(
      h("div", {
        display: "flex",
        width: "3px",
        height: "11px",
        marginRight: "9px",
        background: BUILD.accent,
      }),
      h(
        "div",
        {
          display: "flex",
          fontSize: "11px",
          fontWeight: 700,
          lineHeight: 1,
          letterSpacing: "1.3px",
          color: BUILD.sub,
        },
        String(safeText(text)).toUpperCase(),
      ),
    ),
  ]);
}

/** `.build-section`: bordered dark panel with a ticked title and one inner well. */
function buildSection(title, well, style = {}) {
  return h(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      padding: "14px 16px",
      border: `1px solid ${BUILD.line}`,
      background: BUILD.panel,
      flexShrink: 0,
      ...style,
    },
    [buildTitle(title), h("div", { display: "flex", flexDirection: "column", marginTop: "12px", flexGrow: 1 }, well)],
  );
}

/** Inner well shared by the chart, the psychubes and the resonance block. */
function well(children, style = {}) {
  return h(
    "div",
    {
      display: "flex",
      flexDirection: "column",
      justifyContent: "flex-end",
      flexGrow: 1,
      padding: "12px 14px",
      background: BUILD.well,
      border: `1px solid ${BUILD.lineSoft}`,
      ...style,
    },
    children,
  );
}

/** Five rarity diamonds; the site prints ✦, which satori cannot draw. */
function rarityPips(rarity, accent) {
  const count = Math.max(0, Math.min(6, Number(rarity) || 0));
  return Array.from({ length: count }, (_, i) =>
    h("div", {
      display: "flex",
      width: "9px",
      height: "9px",
      marginLeft: "11px",
      background: accent,
      transform: "rotate(45deg)",
      flexShrink: 0,
    }),
  );
}

/**
 * `.build-chart`: one column per portrait tier, value above, badge below, a fixed 0-100
 * track between them so a 10% bar reads as a tenth of the height. A 0% bar is omitted,
 * exactly like the InfoBook.
 */
function portraitChart(chart, accent, height) {
  return h(
    "div",
    { display: "flex", alignItems: "flex-end" },
    chart.bars.map((bar, i) => {
      const val = Math.max(0, Math.min(100, Number(bar.val) || 0));
      return h(
        "div",
        {
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          flexGrow: 1,
          flexBasis: "0px",
          marginLeft: i === 0 ? "0" : "18px",
        },
        kids(
          h(
            "div",
            { display: "flex", fontSize: "11px", lineHeight: 1, color: BUILD.ink, marginBottom: "7px" },
            `${val}%`,
          ),
          h(
            "div",
            {
              display: "flex",
              alignItems: "flex-end",
              width: `${CHART_TRACK_W}px`,
              height: `${height}px`,
              background: BUILD.track,
              borderBottom: `1px solid ${BUILD.trackLine}`,
            },
            val > 0
              ? h("div", {
                  display: "flex",
                  width: `${CHART_TRACK_W}px`,
                  height: `${Math.max(2, Math.round((height * val) / 100))}px`,
                  background: accent,
                })
              : null,
          ),
          bar.badge
            ? h(
                "div",
                {
                  display: "flex",
                  fontSize: "11px",
                  fontWeight: 700,
                  lineHeight: 1,
                  letterSpacing: "0.8px",
                  color: BUILD.sub,
                  marginTop: "7px",
                },
                safeText(bar.badge),
              )
            : null,
        ),
      );
    }),
  );
}

/** `.build-psychube`: art on the left, name on the right, a hairline between rows. */
function psychubeRow(name, src, index) {
  return h(
    "div",
    {
      display: "flex",
      alignItems: "center",
      marginTop: index === 0 ? "0" : "10px",
      paddingTop: index === 0 ? "0" : "10px",
      borderTop: index === 0 ? "none" : `1px solid ${BUILD.divider}`,
    },
    kids(
      src
        ? img(src, { width: "54px", height: "64px", objectFit: "contain", marginRight: "12px" })
        : h("div", {
            display: "flex",
            width: "54px",
            height: "64px",
            marginRight: "12px",
            border: `1px dashed ${BUILD.trackLine}`,
          }),
      h("div", { display: "flex", flexGrow: 1, fontSize: "15px", lineHeight: 1.35, color: BUILD.ink }, safeText(name)),
    ),
  );
}

/**
 * `.build-pattern img`: a 44x44 box with the art contained, sized by hand. Satori does not
 * honour `objectFit` for these 170x114 glyphs and drew them stretched into the square.
 */
function patternIcon(art) {
  if (!art.shape) return null;
  const box = 44;
  const size = art.shapeSize;
  const scale = size ? Math.min(box / size.width, box / size.height) : 1;
  const width = Math.max(1, Math.round(size ? size.width * scale : box));
  const height = Math.max(1, Math.round(size ? size.height * scale : box));
  return h(
    "div",
    {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: `${box}px`,
      height: `${box}px`,
      flexShrink: 0,
      marginRight: "12px",
    },
    img(art.shape, { width: `${width}px`, height: `${height}px` }),
  );
}

/** `.build-pattern` + `.build-resonance-btn`: the coloured pattern name and its presets. */
function resonanceBlock(char, lang, art, wellStyle = {}) {
  const pattern = char.pattern ? safeText(patternLabel(lang, char.pattern)) : "";
  const color = char.patternColor || BUILD.ink;
  const presets = char.resonance.slice(0, 2);

  return well(
    kids(
      pattern
        ? h(
            "div",
            { display: "flex", alignItems: "center" },
            kids(
              art.shape
                ? img(art.shape, { width: "44px", height: "44px", objectFit: "contain", marginRight: "12px" })
                : null,
              h(
                "div",
                { display: "flex", fontSize: "16px", fontWeight: 700, letterSpacing: "0.4px", color },
                pattern,
              ),
            ),
          )
        : null,
      presets.length
        ? h(
            "div",
            { display: "flex", alignItems: "center", marginTop: pattern ? "14px" : "0" },
            presets.map((label, i) =>
              h(
                "div",
                {
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexGrow: 1,
                  flexBasis: "0px",
                  height: "30px",
                  marginLeft: i === 0 ? "0" : "8px",
                  padding: "0 10px",
                  background: BUILD.accent,
                  border: "1px solid #E9853F",
                  color: "#FFFFFF",
                  fontSize: "11px",
                  fontWeight: 700,
                  letterSpacing: "0.7px",
                  overflow: "hidden",
                },
                safeText(t(lang, `reso.${label}`, label)).toUpperCase(),
              ),
            ),
          )
        : null,
    ),
    wellStyle,
  );
}

export function characterCard({ char, lang, art }) {
  const accent = RARITY[char.rarity] || BUILD.accent;
  // Six heroes ship a Cyrillic `nameEng` ("Авксивий", "Зима") that the card's fonts cannot
  // draw; the Chinese name is the readable fallback when the English one drops out.
  const wanted = lang === "cn" ? char.nameZh || char.display || char.name : char.display || char.name;
  const primary = safeText(wanted).trim() || safeText(char.nameZh) || String(char.id || "");
  const chart = char.chart && char.chart.bars.length ? char.chart : null;

  const chubeNames = char.psychubes.slice(0, 2).map((key) => {
    const row = art.chubeNames?.[key];
    if (!row) return key;
    return safeText((lang === "cn" && row.zh) || row.en || row.zh || key);
  });

  const dmgLabel = safeText(
    lang === "cn" ? char.dmgTypeZh || (char.dmgType === "Reality" ? "现实创伤" : "精神创伤") : char.dmgType,
  );
  const tags = (lang === "cn" && char.roleTagsZh.length ? char.roleTagsZh : char.roleTags)
    .map((tag) => String(tag || "").replace(/<\/?nobr>/gi, "").trim())
    .filter(Boolean)
    .map((tag) => (lang !== "cn" && tag === "洞知" ? "Pursuit" : tag))
    .slice(0, 4)
    .map(safeText)
    .filter(Boolean);

  const hero = h(
    "div",
    {
      display: "flex",
      alignItems: "center",
      flexShrink: 0,
      paddingBottom: "16px",
      borderBottom: `1px solid ${BUILD.line}`,
    },
    kids(
      h(
        "div",
        {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "84px",
          height: "84px",
          flexShrink: 0,
          marginRight: "16px",
          background: "#2a2825",
          border: `1px solid ${accent}`,
          overflow: "hidden",
        },
        art.head
          ? img(art.head, { width: "84px", height: "84px", objectFit: "cover" })
          : h("div", { display: "flex", fontSize: "32px", color: BUILD.sub }, String(primary || "?").slice(0, 1)),
      ),
      h("div", { display: "flex", flexDirection: "column", flexGrow: 1, minWidth: "0" }, [
        h(
          "div",
          { display: "flex", alignItems: "center" },
          kids(
            h(
              "div",
              { display: "flex", fontSize: "34px", lineHeight: 1.1, color: BUILD.ink },
              primary,
            ),
            rarityPips(char.rarity, accent),
          ),
        ),
        h(
          "div",
          { display: "flex", alignItems: "center", marginTop: "10px" },
          kids(
            char.dmgType
              ? h(
                  "div",
                  { display: "flex", alignItems: "center", marginRight: "10px" },
                  kids(
                    art.dmg
                      ? img(art.dmg, { width: "14px", height: "14px", marginRight: "5px", objectFit: "contain" })
                      : null,
                    h("div", { display: "flex", fontSize: "12px", lineHeight: 1, color: BUILD.ink }, dmgLabel),
                  ),
                )
              : null,
            tags.map((tag) =>
              h(
                "div",
                { display: "flex", marginLeft: "8px", fontSize: "12px", lineHeight: 1, color: BUILD.body },
                tag,
              ),
            ),
          ),
        ),
      ]),
    ),
  );

  const sideSections = [];
  // With a chart the panels sit in the right column and hug the top; without one the
  // sheet is sized to them (`characterCardHeight`), so any slack is centred.
  const rowAlign = chart ? "flex-start" : "center";
  if (chubeNames.length) {
    sideSections.push({
      title: t(lang, "builds.psychubes", "Recommended Psychubes"),
      body: well(chubeNames.map((name, i) => psychubeRow(name, art.chubes?.[i], i)), {
        justifyContent: rowAlign,
      }),
    });
  }
  if (char.pattern || char.resonance.length) {
    sideSections.push({
      title: t(lang, "builds.resonance", "Resonance"),
      body: resonanceBlock(char, lang, art, chart ? {} : { justifyContent: "center" }),
    });
  }

  const chartSection = chart
    ? buildSection(
        t(lang, "builds.portrait", "Portrait Value"),
        well(portraitChart(chart, accent, trackHeight()), { flexGrow: 0 }),
        { flexGrow: 1.08, flexBasis: "0px" },
      )
    : null;

  let grid;
  if (chartSection) {
    grid = h(
      "div",
      { display: "flex", alignItems: "stretch", marginTop: `${GRID_MT}px`, flexGrow: 1 },
      kids(
        chartSection,
        sideSections.length
          ? h(
              "div",
              {
                display: "flex",
                flexDirection: "column",
                flexGrow: 0.92,
                flexBasis: "0px",
                minWidth: "0",
                marginLeft: "14px",
              },
              sideSections.map((section, i) =>
                i === 0
                  ? buildSection(section.title, section.body)
                  : buildSection(section.title, section.body, { marginTop: "14px", flexGrow: 1 }),
              ),
            )
          : null,
      ),
    );
  } else if (sideSections.length) {
    // No chart: the loadout panels share the row, like `.builds-grid.is-single` does. They
    // take whatever the computed sheet height leaves (see `characterCardHeight`), so the
    // card never draws two half-empty frames.
    grid = h(
      "div",
      { display: "flex", alignItems: "stretch", marginTop: `${GRID_MT}px`, flexGrow: 1 },
      sideSections.map((section, i) =>
        buildSection(section.title, section.body, {
          flexGrow: 1,
          flexBasis: "0px",
          marginLeft: i === 0 ? "0" : "14px",
        }),
      ),
    );
  } else {
    // No build at all (Schneider): the hero row sits centred in a name card.
    grid = null;
  }

  return h(
    "div",
    {
      display: "flex",
      width: "100%",
      height: "100%",
      padding: "20px",
      backgroundColor: "#111111",
      fontFamily: FONT,
      color: BUILD.ink,
    },
    h(
      "div",
      {
        display: "flex",
        flexDirection: "column",
        justifyContent: grid ? "flex-start" : "center",
        width: "100%",
        height: "100%",
        padding: `${CARD_PAD_TOP}px ${CARD_PAD_X}px ${CARD_PAD_BOTTOM}px`,
        border: `1px solid ${BUILD.frame}`,
        borderRadius: "0 20px 0 0",
        overflow: "hidden",
      },
      kids(hero, grid),
    ),
  );
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
  const title = safeText(team || t(lang, "og.teamBuild", "Team Build"));
  const count = safeText(t(lang, "og.members", "{n} members").replace("{n}", String(members.length)));

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
