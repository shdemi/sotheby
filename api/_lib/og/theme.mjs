/**
 * Satori-safe element helpers.
 *
 * Satori is flexbox-only: no grid, no `box-shadow`, no `position: absolute` stacking
 * beyond a simple case, and every element with more than one child needs an explicit
 * `display: flex`. Elements are plain `{ type, props }` objects, so the function needs
 * no JSX and no build step.
 */

export const C = {
  bg: "linear-gradient(150deg, #0b0c10 0%, #17120c 55%, #0a0b0e 100%)",
  panel: "rgba(11, 12, 16, 0.72)",
  gold: "#F6C34A",
  goldSoft: "#D98224",
  text: "#EDE7DC",
  muted: "#9C968C",
  line: "rgba(246, 195, 74, 0.30)",
  lineSoft: "rgba(255, 255, 255, 0.08)",
  chip: "rgba(255, 255, 255, 0.06)",
  empty: "rgba(255, 255, 255, 0.04)",
};

/** Rarity colours, copied from `app.js` `RARITY_COLORS`. */
export const RARITY = {
  6: "#CB7820",
  5: "#C8AF6C",
  4: "#9E6BAD",
  3: "#555E7F",
  2: "#496441",
};

export const FONT = "OG, OG-CJK";

export function h(type, style, children) {
  const props = { style };
  if (children !== undefined) props.children = children;
  return { type, props };
}

export function img(src, style) {
  return { type: "img", props: { src, style } };
}

/** Filters falsy children so optional pieces can be written inline. */
export function kids(...items) {
  return items.flat().filter((item) => item !== null && item !== undefined && item !== false);
}

export function stars(rarity) {
  const count = Math.max(0, Math.min(6, Number(rarity) || 0));
  return h(
    "div",
    { display: "flex", alignItems: "center" },
    Array.from({ length: count }, (_, i) =>
      h("div", {
        display: "flex",
        width: "16px",
        height: "16px",
        marginLeft: i === 0 ? "0" : "6px",
        borderRadius: "4px",
        background: RARITY[rarity] || C.gold,
      }),
    ),
  );
}

export function header(badge) {
  return h("div", { display: "flex", alignItems: "center", justifyContent: "space-between" }, [
    h("div", { display: "flex", alignItems: "center" }, [
      h("div", { display: "flex", width: "10px", height: "26px", borderRadius: "3px", background: C.gold, marginRight: "12px" }),
      h(
        "div",
        { display: "flex", fontSize: "20px", fontWeight: 700, letterSpacing: "5px", color: C.gold },
        "SOTHEBY'S MANSION",
      ),
      h(
        "div",
        { display: "flex", fontSize: "15px", letterSpacing: "2px", color: C.muted, marginLeft: "14px" },
        "REVERSE: 1999",
      ),
    ]),
    badge,
  ]);
}

export function footer(note) {
  return h(
    "div",
    {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      borderTop: `1px solid ${C.lineSoft}`,
      paddingTop: "14px",
      marginTop: "10px",
    },
    [
      h("div", { display: "flex", fontSize: "18px", letterSpacing: "1px", color: C.muted }, "sothebymansion.com"),
      h("div", { display: "flex", fontSize: "17px", color: C.muted }, note || "Reverse: 1999 · Build Guide"),
    ],
  );
}

/** The outer parchment-ish frame every card shares. */
export function frame(children) {
  return h(
    "div",
    {
      width: "100%",
      height: "100%",
      display: "flex",
      padding: "34px",
      background: C.bg,
      fontFamily: FONT,
      color: C.text,
    },
    h(
      "div",
      {
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        border: `2px solid ${C.line}`,
        borderRadius: "26px",
        padding: "28px 32px",
        background: C.panel,
      },
      children,
    ),
  );
}

/** Rounded portrait frame with the rarity colour on the border. */
export function portrait(src, size, rarity, fallbackLetter) {
  return h(
    "div",
    {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: `${Math.round(size * 0.07)}px`,
      border: `3px solid ${RARITY[rarity] || C.line}`,
      background: "#0c0e12",
      overflow: "hidden",
    },
    src
      ? img(src, { width: `${size}px`, height: `${size}px`, objectFit: "cover" })
      : h("div", { display: "flex", fontSize: `${Math.round(size * 0.3)}px`, color: C.muted }, fallbackLetter || "?"),
  );
}

export function chip(iconSrc, label, iconSize = 24) {
  return h(
    "div",
    {
      display: "flex",
      alignItems: "center",
      height: "40px",
      padding: "0 15px",
      marginRight: "10px",
      borderRadius: "20px",
      background: C.chip,
      border: `1px solid ${C.lineSoft}`,
      fontSize: "19px",
      color: C.text,
    },
    kids(iconSrc ? img(iconSrc, { width: `${iconSize}px`, height: `${iconSize}px`, marginRight: "9px" }) : null, label),
  );
}

/** `label` on the left, value on the right — the three build rows of a character card. */
export function infoRow(label, value) {
  return h("div", { display: "flex", alignItems: "center", marginTop: "15px" }, [
    h(
      "div",
      {
        display: "flex",
        width: "196px",
        fontSize: "16px",
        letterSpacing: "1.5px",
        textTransform: "uppercase",
        color: C.muted,
      },
      label,
    ),
    h("div", { display: "flex", alignItems: "center", flex: 1 }, value),
  ]);
}

export function dash() {
  return h("div", { display: "flex", fontSize: "22px", color: C.muted }, "—");
}
