/**
 * Rotation PNG export.
 *
 * The plan is taken straight off the modal card with html2canvas, so the PNG is
 * the plan the app draws — same rule, ribbons and type — rather than a second
 * design that imitates it. The ground is flat: #111111 outside the amber rule,
 * #0F0F0F inside, with no background art. `render` is the fallback for a page
 * without html2canvas: it redraws the same plan on a canvas, mirroring the
 * modal's CSS values one by one.
 *
 * All sizes below are CSS pixels; the canvas is scaled up by SCALE so the PNG
 * stays sharp on a retina display.
 */
(function () {
  const SCALE = 2;
  /* `.rotations-detail` is 20px 26px 28px inside the modal card. */
  const PAD = 26;
  const PAD_TOP = 20;
  const PAD_BOTTOM = 28;
  /* Margin between the PNG's edge and the card's own rule — the same #111111
   * gap the snapshot leaves, so both paths look alike. */
  const FRAME = 24;

  /* The export's ground is flat: #111111 outside the amber rule, #0F0F0F inside.
   * The modal keeps its background art; only the PNG drops it. */
  const PAGE_INK = "#111111";
  const SHEET_INK = "#0F0F0F";
  const SHEET_RULE = "#B55829";
  /* How much #111111 shows around the sheet. */
  const STAGE_PAD = 24;

  /* Layout constants, copied from styles.css so the PNG is the modal. */
  const GAP = 5;
  const ROUND_GAP = 22;
  const SLOT_H = 132;
  const CAPTION_H = 7.4;
  const CAPTION_GAP = 4;
  const SECTION_H = 34;
  const SECTION_GAP = 24; // `.rotations-detail` gap
  const BLOCK_GAP = 14; // `.rot-block` gap
  const EMPTY_PLATE = "images/card_modulo/Normal.png";

  const COLOR = {
    bg: "#111111",
    title: "#ECE5D9",
    text: "#ECE5D9",
    muted: "#8f8a83",
    gold: "#E09532",
    accent: "#ED7D31",
    border: "rgba(181, 181, 179, 0.3)",
    panel: "rgba(0, 0, 0, 0.22)",
    note: "#F0E6D2",
    rule: "rgba(255, 255, 255, 0.08)",
  };

  const AMIRI = 'Amiri, Georgia, "Times New Roman", serif';
  const TITLE_FONT = `700 31px ${AMIRI}`;
  const KICKER_FONT = '700 10px "gg sans", "Segoe UI", Arial, sans-serif';
  const NOTE_FONT = `400 14px ${AMIRI}`;
  const ROUND_NO_FONT = `700 22.4px ${AMIRI}`;
  const ROUND_TITLE_FONT = `700 14.4px ${AMIRI}`;
  const SECTION_FONT = '700 14px "gg sans", "Segoe UI", Arial, sans-serif';
  const META_FONT = '400 10.4px "gg sans", "Segoe UI", Arial, sans-serif';
  const CHIP_FONT = '700 9.3px "gg sans", "Segoe UI", Arial, sans-serif';
  const LABEL_FONT = '400 10px "gg sans", "Segoe UI", Arial, sans-serif';
  const BODY_FONT = '400 13px "gg sans", "Segoe UI", Arial, sans-serif';
  const NAME_FONT = '400 11.8px "gg sans", "Segoe UI", Arial, sans-serif';
  const SMALL_FONT = '400 9px "gg sans", "Segoe UI", Arial, sans-serif';
  const CAPTION_FONT = '400 7.4px "gg sans", "Segoe UI", Arial, sans-serif';
  const TEXT_FONT = '400 9.3px "gg sans", "Segoe UI", Arial, sans-serif';
  const TUNE_NOTE_FONT = '400 9.6px "gg sans", "Segoe UI", Arial, sans-serif';
  // The tag ribbon's serif; the size drops when a long tag has to fit a card.
  const tagFont = (size) => `700 ${size}px ${AMIRI}`;

  // AP Free is gold, Precast the sheet's amber, an authored tag a cool steel.
  const TAG_INK = {
    "ap-free": [204, 163, 41],
    precast: [217, 123, 31],
    custom: [110, 136, 172],
  };

  /* ---- image loading ---- */

  // Two maps: one de-duplicates the network request, the other holds the decoded
  // image the drawing code reads synchronously.
  const imagePromises = new Map();
  const imageCache = new Map();

  function loadImage(src) {
    if (!src) return Promise.resolve(null);
    if (imagePromises.has(src)) return imagePromises.get(src);
    const promise = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        imageCache.set(src, img);
        resolve(img);
      };
      img.onerror = () => resolve(null);
      img.src = src;
    });
    imagePromises.set(src, promise);
    return promise;
  }

  /** The already-decoded image for `src`, or null. */
  function image(src) {
    return (src && imageCache.get(src)) || null;
  }

  function exportLocalizeText(val) {
    if (typeof window !== "undefined" && typeof window.localizeText === "function") {
      return window.localizeText(val);
    }
    if (!val) return "";
    if (typeof val === "object") return val.en || Object.values(val)[0] || "";
    return String(val);
  }

  /* ---- the frame and surface tables, read from app.js ---- */

  function ultimateFrame() {
    // ROT_ULTIMATE_FRAME is declared in app.js; fall back to the shipped numbers.
    return (
      (typeof ROT_ULTIMATE_FRAME !== "undefined" && ROT_ULTIMATE_FRAME) || {
        image: "images/card_modulo/Ultimate.png",
        inset: { left: 6.56, top: 7.3, width: 87.98, height: 86.35 },
      }
    );
  }

  function surfaces() {
    return typeof ROT_CARD_SURFACES !== "undefined" ? ROT_CARD_SURFACES : [];
  }

  function surfaceFor(key) {
    return surfaces().find((surface) => surface.key === key) || null;
  }

  /** Skill 3 is the ultimate for every character; `frame` overrides either way. */
  function isUltimate(card) {
    if (!card) return false;
    if (card.frame === "ultimate") return true;
    if (card.frame === "normal") return false;
    if (card.special) return false;
    // The exceptions live in app.js, so the sheet and the modal agree.
    const map = typeof ROT_ULTIMATE_SKILLS !== "undefined" ? ROT_ULTIMATE_SKILLS : {};
    const key = Object.keys(map).find((entry) => entry.toLowerCase() === String(card.character || "").toLowerCase());
    return key ? Number(card.skill) === map[key] : Number(card.skill) === 3;
  }

  const NORMAL_ASPECT = 288 / 376;
  const ULTIMATE_ASPECT = 183 / 315;

  function cardSize(card, height) {
    return { w: height * (isUltimate(card) ? ULTIMATE_ASPECT : NORMAL_ASPECT), h: height };
  }

  function cardArt(card) {
    if (card.special) return card.special;
    const name = resolveCharacterName(card.character) || card.character;
    return card.icon || guideSkillIcon(name, card.skill);
  }

  /* ---- slot measuring ---- */

  const CARD_H = 84;
  const ULTIMATE_H = 126;
  const LB_H = 42;
  const OR_CARD_H = 66;
  const OR_STACK_W = 78;
  const OR_STACK_H = 86;
  const TEXT_W = 132;
  const TUNING_W = 62;
  const EMPTY_W = 62;
  const EMPTY_H = 82;

  const DOUBLE_OR_STACK_W = 88;
  const DOUBLE_OR_STACK_H = 92;

  function slotWidth(slot) {
    const type = slot.type || "normal";
    if (type === "text") return TEXT_W;
    if (type === "tuning") return TUNING_W;
    if (type === "double_or" || type === "or3") return DOUBLE_OR_STACK_W;
    if (type === "or") return (Array.isArray(slot.cards) && slot.cards.length > 2) ? DOUBLE_OR_STACK_W : OR_STACK_W;
    if (type === "lb") return LB_H * NORMAL_ASPECT;
    const cards = Array.isArray(slot.cards) ? slot.cards.filter(Boolean) : [];
    if (cards.length === 0) return EMPTY_W;
    return cardSize(cards[0], isUltimate(cards[0]) ? ULTIMATE_H : CARD_H).w;
  }

  function slotHeight(slot) {
    const type = slot.type || "normal";
    if (type === "text") return 81;
    if (type === "tuning") return 81;
    if (type === "double_or" || type === "or3") return DOUBLE_OR_STACK_H;
    if (type === "or") return (Array.isArray(slot.cards) && slot.cards.length > 2) ? DOUBLE_OR_STACK_H : OR_STACK_H;
    if (type === "lb") return LB_H;
    const cards = Array.isArray(slot.cards) ? slot.cards.filter(Boolean) : [];
    if (cards.length === 0) return EMPTY_H;
    return isUltimate(cards[0]) ? ULTIMATE_H : CARD_H;
  }

  /** The caption under a slot, or "" when the card already says it. */
  function slotCaption(slot) {
    const type = slot.type || "normal";
    if (type === "text") return "TEXT";
    if (type === "tuning") return "TUNING";
    return "";
  }

  function stripWidth(round) {
    const slots = Array.isArray(round.slots) ? round.slots : [];
    if (slots.length === 0) return 0;
    return slots.reduce((sum, slot) => sum + slotWidth(slot), 0) + GAP * (slots.length - 1);
  }

  /* ---- text helpers ---- */

  function setFont(ctx, font, color, letterSpacing) {
    ctx.font = font;
    ctx.fillStyle = color;
    // letterSpacing is supported in Chromium; ignore elsewhere.
    if ("letterSpacing" in ctx) ctx.letterSpacing = letterSpacing || "0px";
  }

  function wrapLines(ctx, text, maxWidth) {
    const words = String(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width <= maxWidth || !line) line = next;
      else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  function drawLines(ctx, lines, x, y, lineHeight, color) {
    ctx.fillStyle = color;
    lines.forEach((line, i) => ctx.fillText(line, x, y + i * lineHeight));
    return lines.length * lineHeight;
  }

  function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  /* ---- the plan, measured then drawn ---- */

  function plan(rotation) {
    const members = rotationMembers(rotation);
    const rounds = rotationRounds(rotation);
    const archetypes = rotationArchetypes(rotation);

    const strips = rounds.map(stripWidth);
    // `.rot-round`: a 36px number column, then a 10px gap, then the cards.
    const gutter = 46;
    const roundNotes = Array.isArray(rotation.roundNotes) ? rotation.roundNotes : [];
    const railW = roundNotes.length ? 150 : 0;

    const contentW = Math.max(
      520,
      ...strips.map((w) => gutter + w),
      archetypes.length ? archetypes.join("  ").length * 9 : 0
    );

    return { members, rounds, archetypes, strips, gutter, roundNotes, railW, contentW };
  }

  function teamTileWidth(ctx, member) {
    const chubeKey = psychubeKeyFromName(member.psychube);
    const chube = chubeKey ? psychubeDb[chubeKey] : null;
    setFont(ctx, NAME_FONT, COLOR.text);
    const nameW = ctx.measureText(displayCharName(member.character)).width;
    let right = nameW;
    if (chube) {
      setFont(ctx, SMALL_FONT, COLOR.muted);
      right = Math.max(right, 26 + 6 + ctx.measureText(psychubeNameFromName(member.psychube)).width);
    }
    return 7 + 56 + 10 + right + 14;
  }

  /* ---- drawing ---- */

  /**
   * `.archetype-section-header`: a black plate with a hairline and an amber
   * spine, the words in small-caps sans. The modal lays a warm wash over the
   * plate; the export keeps only the plate and the spine.
   */
  function drawSectionHeader(ctx, label, x, y, w, right = "") {
    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    ctx.fillRect(x, y, w, SECTION_H);
    ctx.strokeStyle = COLOR.rule;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, SECTION_H - 1);
    ctx.fillStyle = COLOR.gold;
    ctx.fillRect(x, y, 3, SECTION_H);

    setFont(ctx, SECTION_FONT, COLOR.title, "1.1px");
    ctx.textBaseline = "middle";
    ctx.fillText(String(label).toUpperCase(), x + 11, y + SECTION_H / 2 + 1);
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";

    if (right) {
      setFont(ctx, META_FONT, "#B5B5B3", "1.4px");
      ctx.textAlign = "right";
      ctx.fillText(String(right).toUpperCase(), x + w - 12, y + SECTION_H / 2 + 1);
      ctx.textAlign = "left";
      if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    }
    ctx.textBaseline = "alphabetic";
    return SECTION_H;
  }

  function drawMemberTile(ctx, member, x, y) {
    const w = teamTileWidth(ctx, member);
    const h = 75;

    // `.rot-member`: the page ink at 22%, a hairline, 7px 14px 7px 7px.
    ctx.fillStyle = COLOR.panel;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = COLOR.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    // Portrait, 56×56 over #2a2825.
    const avatar = characterDb[member.character];
    const img = avatar ? imageCache.get(avatar) : null;
    const value = img && img.__loaded ? img : null;
    ctx.save();
    ctx.fillStyle = "#2a2825";
    ctx.fillRect(x + 7, y + 7, 56, 56);
    if (value) {
      ctx.beginPath();
      ctx.rect(x + 7, y + 7, 56, 56);
      ctx.clip();
      coverDraw(ctx, value, x + 7, y + 7, 56, 56);
    }
    ctx.restore();

    // The portrait bar sits under the avatar: five dashes, the first N lit.
    const tier = Math.max(0, Math.min(5, Number(member.portrait) || 0));
    const dashW = 58 / 5;
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i < tier ? "#FBAE31" : "rgba(255, 255, 255, 0.14)";
      ctx.fillRect(x + 6 + i * dashW, y + 65, dashW - 1, 3);
    }

    // Name, then the psychube it runs.
    const textX = x + 7 + 56 + 10;
    setFont(ctx, NAME_FONT, "#ECE5D9");
    ctx.fillText(displayCharName(member.character), textX, y + 28);

    const chubeKey = psychubeKeyFromName(member.psychube);
    const chube = chubeKey ? psychubeDb[chubeKey] : null;
    if (chube) {
      const icon = imageCache.get(chube.iconUrl);
      if (icon && icon.__loaded) ctx.drawImage(icon, textX, y + 34, 26, 31);
      setFont(ctx, SMALL_FONT, COLOR.muted);
      ctx.fillText(psychubeNameFromName(member.psychube), textX + 32, y + 53);
    }
    return w;
  }

  /* `.rot-team-tuning`: padding 7px 14px around a 56px-high icon, capped at 84. */
  const TUNING_TILE_W = 84;

  function drawTuningTile(ctx, tuning, x, y) {
    const w = TUNING_TILE_W;
    const h = 75;

    ctx.fillStyle = COLOR.panel;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = COLOR.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    const src = `images/tuning_abilities/${encodeURIComponent(tuning)}.png`;
    const img = imageCache.get(src);
    if (img && img.__loaded) {
      // 56px tall, never wider than 84: the icon carries the tile.
      const iconH = 56;
      const ratio = img.naturalWidth / img.naturalHeight || 1;
      const iw = Math.min(84, iconH * ratio);
      ctx.drawImage(img, x + (w - iw) / 2, y + (h - iconH) / 2, iw, iconH);
    }
    return w;
  }

  function coverDraw(ctx, img, x, y, w, h) {
    const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }

  /** One card: the art, the Ultimate plate when it applies, then a surface. */
  function drawCard(ctx, card, x, bottom, height, opts) {
    const { w, h } = cardSize(card, height);
    const top = bottom - h;
    const art = image(cardArt(card));
    const ultimate = isUltimate(card);

    ctx.save();
    if (opts && opts.behind) {
      ctx.globalAlpha = 0.95;
    }

    if (ultimate) {
      const frame = ultimateFrame();
      const plate = imageCache.get(frame.image);
      if (plate && plate.__loaded) ctx.drawImage(plate, x, top, w, h);
      if (art && art.__loaded) {
        const inset = frame.inset;
        const ax = x + (w * inset.left) / 100;
        const ay = top + (h * inset.top) / 100;
        const aw = (w * inset.width) / 100;
        const ah = (h * inset.height) / 100;
        ctx.save();
        // The plate's window is an arch: clip the art to it.
        ctx.beginPath();
        ctx.moveTo(ax, ay + ah);
        ctx.lineTo(ax, ay + ah * 0.22);
        ctx.quadraticCurveTo(ax, ay, ax + aw / 2, ay);
        ctx.quadraticCurveTo(ax + aw, ay, ax + aw, ay + ah * 0.22);
        ctx.lineTo(ax + aw, ay + ah);
        ctx.closePath();
        ctx.clip();
        coverDraw(ctx, art, ax, ay, aw, ah);
        ctx.restore();
      }
    } else {
      if (art && art.__loaded) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, top, w, h);
        ctx.clip();
        coverDraw(ctx, art, x, top, w, h);
        ctx.restore();
      }
      ctx.strokeStyle = COLOR.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, top + 0.5, w - 1, h - 1);
    }

    if (opts && opts.behind) {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = "#000";
      ctx.fillRect(x, top, w, h);
      ctx.globalAlpha = 1;
    }

    // A surface is decoration laid straight over the card, at the card's size.
    const surface = surfaceFor(card.surface);
    if (surface && !(opts && opts.behind)) {
      const img = imageCache.get(surface.image);
      if (img && img.__loaded) ctx.drawImage(img, x, top, w, h);
    }
    ctx.restore();
    return w;
  }

  /**
   * The tag ribbons on the slot's first card. The ink fades into the art, a
   * halftone screen closes the ribbon, and the words shrink until they fit, so
   * a long tag never spills off the card.
   */
  function drawTagPlates(ctx, tags, x, cardTop, ultimate, tagText = "", cardWidth = 0) {
    const limit = cardWidth || 64;
    // Flush with the card, like the ribbon in the plan itself.
    const left = 0;
    const width = Math.max(26, limit);
    const h = 15;
    let y = cardTop + (ultimate ? 27 : 5);
    for (const key of tags) {
      const tag = ROT_SLOT_TAGS.find((entry) => entry.key === key);
      if (!tag) continue;
      const ink = TAG_INK[key] || TAG_INK["ap-free"];
      const [r, g, b] = ink;
      const px = x + left;

      const grad = ctx.createLinearGradient(px, 0, px + width, 0);
      grad.addColorStop(0, `rgb(${r}, ${g}, ${b})`);
      grad.addColorStop(0.9, `rgba(${r}, ${g}, ${b}, 0.5)`);
      grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(px, y, width, h);

      // Halftone tail: a grid of dark dots on the fading end of the ribbon.
      ctx.save();
      ctx.beginPath();
      ctx.rect(px + width - 14, y - 1, 14, h + 2);
      ctx.clip();
      ctx.fillStyle = "rgba(26, 26, 26, 0.72)";
      const step = 3;
      for (let gy = y - 2, row = 0; gy < y + h + 1; gy += step, row += 1) {
        for (let gx = px + width - 14; gx < px + width; gx += step) {
          ctx.beginPath();
          ctx.arc(gx + (row % 2 ? step / 2 : 0), gy, 0.9, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();

      let label = String(rotationTagLabel(tag, tagText) || "").trim();
      if (label) {
        const room = width - 17;
        let size = 11;
        setFont(ctx, tagFont(size), "#FFFFFF", "0.1px");
        while (size > 6.5 && ctx.measureText(label).width > room) {
          size -= 0.5;
          setFont(ctx, tagFont(size), "#FFFFFF", "0.1px");
        }
        if (ctx.measureText(label).width > room) {
          while (label.length > 1 && ctx.measureText(`${label}…`).width > room) label = label.slice(0, -1);
          label = `${label}…`;
        }
        ctx.save();
        ctx.beginPath();
        ctx.rect(px + 5, y, width - 16, h);
        ctx.clip();
        ctx.textBaseline = "middle";
        ctx.fillText(label, px + 5, y + h / 2 + 0.5);
        ctx.textBaseline = "alphabetic";
        ctx.restore();
      }
      if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
      y += h + 4;
    }
  }

  function drawSlot(ctx, slot, x, bodyBottom) {
    const type = slot.type || "normal";
    const cards = Array.isArray(slot.cards) ? slot.cards.filter(Boolean) : [];
    const width = slotWidth(slot);
    const tags = rotationSlotTags(slot);
    const tagText = typeof slot.tagText === "string" ? slot.tagText : "";
    const caption = slotCaption(slot);

    if (type === "text") {
      const boxTop = bodyBottom - 81;
      ctx.fillStyle = "rgba(74, 119, 201, 0.18)";
      ctx.fillRect(x, boxTop, TEXT_W, 81);
      ctx.strokeStyle = "rgba(122, 160, 224, 0.45)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, boxTop + 0.5, TEXT_W - 1, 80);
      setFont(ctx, TEXT_FONT, "#DCE6F5");
      const lines = wrapLines(ctx, slot.text || "", TEXT_W - 20);
      drawLines(ctx, lines.slice(0, 5), x + 10, boxTop + 17, 13.45, "#DCE6F5");
    } else if (type === "tuning") {
      const boxTop = bodyBottom - 81;
      ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
      ctx.fillRect(x, boxTop, TUNING_W, 81);
      ctx.strokeStyle = "rgba(237, 125, 49, 0.55)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, boxTop + 0.5, TUNING_W - 1, 80);
      setFont(ctx, TUNE_NOTE_FONT, "#ECE5D9");
      const lines = wrapLines(ctx, slot.text || "", TUNING_W - 8 - 20);
      drawLines(ctx, lines.slice(0, 4), x + 4, boxTop + 13, 12, "#ECE5D9");
      // The tuning card shrinks into the bottom-right corner.
      if (cards[0]) {
        const cw = 30 * (isUltimate(cards[0]) ? ULTIMATE_ASPECT : NORMAL_ASPECT);
        drawCard(ctx, cards[0], x + TUNING_W - 3 - cw, boxTop + 81 - 3, 30);
      }
    } else if (type === "double_or" || type === "or3" || (type === "or" && cards.length > 2)) {
      const card2 = cards[2];
      const card1 = cards[1];
      const card0 = cards[0];
      const cw = OR_CARD_H * NORMAL_ASPECT;
      if (card2) {
        ctx.save();
        const backArt = image(cardArt(card2));
        const bx = x + 36;
        const bBottom = bodyBottom - 26;
        if (backArt) {
          ctx.globalAlpha = 0.95;
          ctx.beginPath();
          ctx.rect(bx, bBottom - OR_CARD_H, cw, OR_CARD_H);
          ctx.clip();
          coverDraw(ctx, backArt, bx, bBottom - OR_CARD_H, cw, OR_CARD_H);
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = "#000";
          ctx.fillRect(bx, bBottom - OR_CARD_H, cw, OR_CARD_H);
        }
        ctx.restore();
      }
      if (card1) {
        ctx.save();
        const midArt = image(cardArt(card1));
        const mx = x + 18;
        const mBottom = bodyBottom - 13;
        if (midArt) {
          ctx.globalAlpha = 0.95;
          ctx.beginPath();
          ctx.rect(mx, mBottom - OR_CARD_H, cw, OR_CARD_H);
          ctx.clip();
          coverDraw(ctx, midArt, mx, mBottom - OR_CARD_H, cw, OR_CARD_H);
          ctx.globalAlpha = 0.2;
          ctx.fillStyle = "#000";
          ctx.fillRect(mx, mBottom - OR_CARD_H, cw, OR_CARD_H);
        }
        ctx.restore();
      }
      if (card0) {
        drawCard(ctx, card0, x, bodyBottom, OR_CARD_H);
        drawTagPlates(ctx, tags, x, bodyBottom - OR_CARD_H, isUltimate(card0), tagText, OR_CARD_H * NORMAL_ASPECT);
      }
    } else if (type === "or") {
      // The back card peeks out from behind the front one.
      const back = cards[1];
      const front = cards[0];
      if (back) {
        ctx.save();
        const backArt = image(cardArt(back));
        const bw = OR_CARD_H * NORMAL_ASPECT;
        const bx = x + 27;
        const bBottom = bodyBottom - 20;
        if (backArt) {
          ctx.globalAlpha = 0.95;
          ctx.beginPath();
          ctx.rect(bx, bBottom - OR_CARD_H, bw, OR_CARD_H);
          ctx.clip();
          coverDraw(ctx, backArt, bx, bBottom - OR_CARD_H, bw, OR_CARD_H);
          ctx.globalAlpha = 0.3;
          ctx.fillStyle = "#000";
          ctx.fillRect(bx, bBottom - OR_CARD_H, bw, OR_CARD_H);
        }
        ctx.restore();
      }
      if (front) {
        drawCard(ctx, front, x, bodyBottom, OR_CARD_H);
        drawTagPlates(ctx, tags, x, bodyBottom - OR_CARD_H, isUltimate(front), tagText, OR_CARD_H * NORMAL_ASPECT);
      }
    } else if (cards.length === 0) {
      const boxTop = bodyBottom - EMPTY_H;
      // `.rot-slot.is-empty`: the plate face at 55%, inside a dashed frame.
      ctx.strokeStyle = "rgba(181, 181, 179, 0.16)";
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, boxTop + 0.5, EMPTY_W - 1, EMPTY_H - 1);
      ctx.setLineDash([]);
      const plate = image(EMPTY_PLATE);
      if (plate && plate.__loaded) {
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.beginPath();
        ctx.rect(x, boxTop, EMPTY_W, EMPTY_H);
        ctx.clip();
        coverDraw(ctx, plate, x, boxTop, EMPTY_W, EMPTY_H);
        ctx.restore();
      }
      drawTagPlates(ctx, tags, x, boxTop, false, tagText, EMPTY_W);
    } else {
      const h = type === "lb" ? LB_H : isUltimate(cards[0]) ? ULTIMATE_H : CARD_H;
      drawCard(ctx, cards[0], x, bodyBottom, h);
      drawTagPlates(ctx, tags, x, bodyBottom - h, isUltimate(cards[0]), tagText, cardSize(cards[0], h).w);
    }

    if (caption) {
      setFont(ctx, CAPTION_FONT, type === "text" ? "#7d94b8" : type === "tuning" ? COLOR.accent : "#6f6a63", "1.2px");
      ctx.fillText(caption, x, bodyBottom + CAPTION_GAP + CAPTION_H - 1);
      if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    }
    return width;
  }

  function drawRoundNotePlaque(ctx, text, x, y) {
    setFont(ctx, ROUND_TITLE_FONT, "#DFDFDF");
    const label = String(text);
    const w = ctx.measureText(label).width + 38;
    const h = 24;
    const gradient = ctx.createLinearGradient(x, y, x + w, y);
    gradient.addColorStop(0, "#5E4524");
    gradient.addColorStop(0.25, "rgba(94, 69, 36, 0.75)");
    gradient.addColorStop(0.5, "rgba(94, 69, 36, 0.5)");
    gradient.addColorStop(0.75, "rgba(94, 69, 36, 0.25)");
    gradient.addColorStop(1, "rgba(94, 69, 36, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#E09532";
    ctx.fillRect(x, y, 4, h);
    ctx.fillStyle = "#DFDFDF";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x + 13, y + h / 2 + 1);
    ctx.textBaseline = "alphabetic";
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    return h;
  }

  /** Bracket under a run of cards, with its text centred on the span. */
  function drawAnnotation(ctx, note, slotXs, stripBottom, laneTop) {
    const a = slotXs[note.from];
    const b = slotXs[note.to] || a;
    if (!a || !b) return;
    const left = a.left;
    const right = b.right;
    const mid = (left + right) / 2;
    const top = stripBottom + 3;
    const bar = top + 5;
    const stem = laneTop;

    ctx.strokeStyle = "rgba(214, 190, 150, 0.7)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (note.style === "box") {
      ctx.moveTo(mid, top);
      ctx.lineTo(mid, stem);
    } else {
      ctx.moveTo(left, top);
      ctx.lineTo(left, bar);
      ctx.lineTo(right, bar);
      ctx.lineTo(right, top);
      ctx.moveTo(mid, bar);
      ctx.lineTo(mid, stem);
    }
    ctx.stroke();

    setFont(ctx, NOTE_FONT, COLOR.note);
    const textW = ctx.measureText(note.text).width;
    const textX = Math.max(left, Math.min(right - textW, mid - textW / 2));
    ctx.fillText(note.text, textX, stem + 13);
  }

  /**
   * Packs annotations into lanes, the same rule the modal uses: a note joins the
   * first lane whose spans it does not overlap.
   */
  function packLanes(notes) {
    const lanes = [];
    return notes.map((note) => {
      const lane = lanes.findIndex((spans) => spans.every(([a, b]) => note.to < a || note.from > b));
      if (lane === -1) {
        lanes.push([[note.from, note.to]]);
        return lanes.length - 1;
      }
      lanes[lane].push([note.from, note.to]);
      return lane;
    });
  }

  /* ---- the whole sheet ---- */

  async function render(rotation) {
    const data = plan(rotation);
    const { members, rounds, archetypes, strips, gutter, roundNotes, railW } = data;

    // Measure the parts that depend on text before sizing the canvas.
    const measure = document.createElement("canvas").getContext("2d");
    await document.fonts.ready;
    if (document.fonts && document.fonts.load) {
      await Promise.all([
        document.fonts.load(`700 14px ${AMIRI}`),
        document.fonts.load(`400 14px ${AMIRI}`),
        document.fonts.load(`700 34px ${AMIRI}`),
      ]).catch(() => {});
    }

    const tileWidths = members.map((member) => teamTileWidth(measure, member));
    const tuning = typeof rotation.tuning === "string" ? rotation.tuning.trim() : "";
    const tuningW = tuning ? TUNING_TILE_W : 0;
    const allTileWidths = tuning ? [...tileWidths, tuningW] : tileWidths;
    const teamRowW = allTileWidths.reduce((a, b) => a + b, 0) + Math.max(0, allTileWidths.length - 1) * 10;

    const contentW = Math.max(
      560,
      teamRowW,
      ...strips.map((w) => gutter + w),
      railW
    );
    const width = (FRAME + PAD) * 2 + contentW;
    const height = measureHeight(rotation, data, contentW);

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * SCALE);
    canvas.height = Math.round(height * SCALE);
    const ctx = canvas.getContext("2d");
    ctx.scale(SCALE, SCALE);
    ctx.textBaseline = "alphabetic";

    drawBackground(ctx, width, height);
    drawSheetPanel(ctx, width, height);

    let y = FRAME + PAD_TOP;
    const x0 = FRAME + PAD;

    // `.rot-hero`: a corpus kicker, the plan's name in Amiri, the chips, then a
    // hairline that closes the block.
    setFont(ctx, KICKER_FONT, "rgba(181, 181, 179, 0.5)", "3.4px");
    ctx.fillText("ROTATION", x0, y + 10);
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    y += 18;

    setFont(ctx, TITLE_FONT, COLOR.title);
    ctx.fillText(rotation.name || rotation.id || "", x0, y + 26);
    y += 34;

    // `.rot-hero-tag`: an outline chip in the archetype's own colour.
    if (archetypes.length) {
      let cx = x0;
      for (const tag of archetypes) {
        const color = ARCHETYPE_COLORS[tag] || COLOR.accent;
        const label = String(tag).toUpperCase();
        setFont(ctx, CHIP_FONT, color, "0.75px");
        const w = ctx.measureText(label).width + 20;
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.strokeRect(cx + 0.5, y + 0.5, w - 1, 19);
        ctx.textBaseline = "middle";
        ctx.fillText(label, cx + 10, y + 10.5);
        ctx.textBaseline = "alphabetic";
        if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
        cx += w + 6;
      }
      y += 19;
    }

    y += 16;
    ctx.strokeStyle = COLOR.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, y + 0.5);
    ctx.lineTo(x0 + contentW, y + 0.5);
    ctx.stroke();
    y += SECTION_GAP;

    // Team: the section plate, then the member row.
    y += drawSectionHeader(ctx, "Team", x0, y, contentW) + BLOCK_GAP;

    const teamEntries = members.map((member, i) => ({ kind: "member", index: i, w: tileWidths[i] }));
    if (tuning) teamEntries.push({ kind: "tuning", w: tuningW });
    const teamRows = [];
    let teamRow = [];
    let tx = 0;
    for (const entry of teamEntries) {
      if (tx > 0 && tx + entry.w > contentW) {
        teamRows.push(teamRow);
        teamRow = [];
        tx = 0;
      }
      teamRow.push({ ...entry, x: tx });
      tx += entry.w + 10;
    }
    if (teamRow.length) teamRows.push(teamRow);

    if (teamRows.length) {
      teamRows.forEach((row, rowIndex) => {
        const rowY = y + rowIndex * 85;
        row.forEach((cell) => {
          if (cell.kind === "tuning") drawTuningTile(ctx, tuning, x0 + cell.x, rowY);
          else drawMemberTile(ctx, members[cell.index], x0 + cell.x, rowY);
        });
      });
      y += teamRows.length * 75 + (teamRows.length - 1) * 10;
      y += SECTION_GAP;
    }

    // Rotation notes, as body copy under their own plate.
    if (rotation.notes) {
      y += drawSectionHeader(ctx, "Notes", x0, y, contentW) + BLOCK_GAP;
      setFont(ctx, BODY_FONT, "rgba(236, 229, 217, 0.82)");
      for (const paragraph of String(exportLocalizeText(rotation.notes)).split("\n")) {
        const lines = wrapLines(ctx, paragraph, contentW);
        y += drawLines(ctx, lines, x0, y + 13, 19, "rgba(236, 229, 217, 0.82)");
        y += 4;
      }
      y += SECTION_GAP - 4;
    }

    // Rounds.
    y += drawSectionHeader(ctx, "Rounds", x0, y, contentW, `${rounds.length} ROUNDS`) + BLOCK_GAP;

    const stripLeft = x0 + gutter;
    const roundTop = [];
    const roundBottom = [];

    rounds.forEach((round, index) => {
      const slots = Array.isArray(round.slots) ? round.slots : [];
      roundTop[index] = y;

      // The per-round note is the round's title. It starts at the section's
      // left edge, the same place the "Rounds" header does, not above the cards.
      let stripTop = y;
      if (round.note) {
        stripTop = y + drawRoundNotePlaque(ctx, exportLocalizeText(round.note), x0, y) + 8;
      }

      // The number brackets the cards' top; both start 24px down the round.
      const noTop = stripTop + 24;
      drawRoundBadge(ctx, String(index + 1).padStart(2, "0"), x0, noTop);

      // `.rot-slot` is 132 high; the caption keeps its room even when blank.
      const slotBottom = stripTop + SLOT_H;
      const bodyBottom = slotBottom - CAPTION_H - CAPTION_GAP;

      // Slots.
      const slotXs = [];
      let sx = stripLeft;
      slots.forEach((slot) => {
        const w = slotWidth(slot);
        slotXs.push({ left: sx, right: sx + w });
        drawSlot(ctx, slot, sx, bodyBottom);
        sx += w + GAP;
      });

      y = slotBottom;

      // Annotations under the cards.
      const last = Math.max(0, slots.length - 1);
      const notes = (Array.isArray(round.annotations) ? round.annotations : [])
        .map((note) => {
          const text = String(exportLocalizeText(note.text) || "").trim();
          if (!text) return null;
          const from = Math.max(0, Math.min(last, Number(note.from) || 0));
          const to = Math.max(from, Math.min(last, Number(note.to) || 0));
          const style = ["bracket", "box", "fork"].includes(note.style) ? note.style : "bracket";
          return { text, from, to, style };
        })
        .filter(Boolean);

      if (notes.length) {
        const lanes = packLanes(notes);
        const laneCount = Math.max(...lanes) + 1;
        notes.forEach((note, i) => {
          drawAnnotation(ctx, note, slotXs, slotBottom, y + lanes[i] * 26 + 10);
        });
        y += laneCount * 26;
      }

      y += ROUND_GAP;
      roundBottom[index] = y - ROUND_GAP;
    });

    // Round notes: a spine beside the rounds with a tick at each end.
    if (roundNotes.length) {
      const spineX = x0 + contentW - railW + 8;
      roundNotes.forEach((note, index) => {
        const from = roundTop[Math.max(0, Math.min(rounds.length - 1, Number(note.from) || 0))];
        const to = roundBottom[Math.max(0, Math.min(rounds.length - 1, Number(note.to) || 0))];
        if (from === undefined || to === undefined) return;
        const x = spineX + index * 16;
        ctx.strokeStyle = "rgba(214, 190, 150, 0.7)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (note.style === "box") {
          ctx.moveTo(x, from);
          ctx.lineTo(x, to);
        } else {
          ctx.moveTo(x, from);
          ctx.lineTo(x - 5, from);
          ctx.moveTo(x, to);
          ctx.lineTo(x - 5, to);
          ctx.moveTo(x, from);
          ctx.lineTo(x, to);
        }
        ctx.stroke();

        const label = String(exportLocalizeText(note.text) || "").trim();
        if (label) {
          setFont(ctx, NOTE_FONT, COLOR.note);
          ctx.fillText(label, x + 8, (from + to) / 2 + 5);
        }
      });
    }

    // Footer mark: a quiet signature at the sheet's edge.
    setFont(ctx, KICKER_FONT, "rgba(181, 181, 179, 0.45)", "1.4px");
    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";
    ctx.fillText("SOTHEBY'S MANSION   ·   ROTATION", width - FRAME - PAD, height - FRAME - 12);
    ctx.textAlign = "left";
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";

    return canvas;
  }

  /** `.rot-round-no`: an amber bracket with the number set in Amiri inside it. */
  function drawRoundBadge(ctx, noText, x, y) {
    const w = 36;
    const h = 36;
    // Only the bottom and right edges remain, as an ⌟ bracket around the
    // number's lower-right corner, rounded at that one corner.
    ctx.beginPath();
    ctx.moveTo(x + w, y);
    ctx.lineTo(x + w, y + h - 10);
    ctx.quadraticCurveTo(x + w, y + h, x + w - 10, y + h);
    ctx.lineTo(x, y + h);
    ctx.strokeStyle = COLOR.gold;
    ctx.lineWidth = 2;
    ctx.stroke();

    setFont(ctx, ROUND_NO_FONT, "#EADCC9");
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(noText, x + w / 2, y + h / 2 + 1);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
  }

  /**
   * The modal card's own edge — `.archetype-modal-card`: a 1px #B55829 rule with
   * a single rounded corner at the top right. In the export the sheet is filled
   * flat (#0F0F0F) instead of carrying the page's art.
   */
  function drawSheetPanel(ctx, width, height) {
    const l = FRAME + 0.5;
    const t = FRAME + 0.5;
    const r = width - FRAME - 0.5;
    const b = height - FRAME - 0.5;
    ctx.fillStyle = SHEET_INK;
    ctx.beginPath();
    ctx.moveTo(l, t);
    ctx.lineTo(r - 20, t);
    ctx.quadraticCurveTo(r, t, r, t + 20);
    ctx.lineTo(r, b);
    ctx.lineTo(l, b);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = SHEET_RULE;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  /** The page ink outside the sheet; no art in the export. */
  function drawBackground(ctx, width, height) {
    ctx.fillStyle = PAGE_INK;
    ctx.fillRect(0, 0, width, height);
  }

  /** A dry run that walks the same steps without drawing, to size the canvas. */
  function measureHeight(rotation, data, contentW) {
    const { members, rounds, archetypes } = data;
    const measure = document.createElement("canvas").getContext("2d");
    let y = FRAME + PAD_TOP;
    y += 18; // kicker
    y += 34; // name
    if (archetypes.length) y += 19; // chips
    y += 16 + 1; // the hero's padding-bottom and its hairline
    y += SECTION_GAP;

    y += SECTION_H + BLOCK_GAP;

    // Team tiles wrap exactly as they will when drawn.
    const widths = members.map((member) => teamTileWidth(measure, member));
    const tuning = typeof rotation.tuning === "string" ? rotation.tuning.trim() : "";
    const tuningW = tuning ? TUNING_TILE_W : 0;
    const allWidths = tuning ? [...widths, tuningW] : widths;
    let tx = 0;
    let rows = allWidths.length ? 1 : 0;
    allWidths.forEach((w) => {
      if (tx > 0 && tx + w > contentW) {
        rows += 1;
        tx = 0;
      }
      tx += w + 10;
    });
    if (rows) {
      y += rows * 75 + Math.max(0, rows - 1) * 10;
      y += SECTION_GAP;
    }

    if (rotation.notes) {
      y += SECTION_H + BLOCK_GAP;
      setFont(measure, BODY_FONT, "#ECE5D9");
      for (const paragraph of String(exportLocalizeText(rotation.notes)).split("\n")) {
        y += Math.max(1, wrapLines(measure, paragraph, contentW).length) * 19 + 4;
      }
      y += SECTION_GAP - 4;
    }

    y += SECTION_H + BLOCK_GAP;

    rounds.forEach((round) => {
      if (round.note) y += 24 + 8;
      y += SLOT_H;

      const slots = Array.isArray(round.slots) ? round.slots : [];
      const last = Math.max(0, slots.length - 1);
      const notes = (Array.isArray(round.annotations) ? round.annotations : []).filter(
        (note) => String(exportLocalizeText(note && note.text ? note.text : "")).trim()
      );
      if (notes.length) {
        const mapped = notes.map((note) => ({
          from: Math.max(0, Math.min(last, Number(note.from) || 0)),
          to: Math.max(0, Math.min(last, Number(note.to) || 0)),
        }));
        y += (Math.max(...packLanes(mapped)) + 1) * 26;
      }
      y += ROUND_GAP;
    });

    // Back out the trailing round gap, then add the footer line and the frame.
    return y - ROUND_GAP + 20 + PAD_BOTTOM + FRAME;
  }

  /* ---- the download ---- */

  function collectImages(rotation) {
    const urls = new Set();
    const add = (src) => {
      if (src) urls.add(src);
    };

    add(ultimateFrame().image);
    add(EMPTY_PLATE);
    surfaces().forEach((surface) => add(surface.image));

    rotationMembers(rotation).forEach((member) => {
      add(characterDb[member.character]);
      const chubeKey = psychubeKeyFromName(member.psychube);
      const chube = chubeKey ? psychubeDb[chubeKey] : null;
      if (chube) add(chube.iconUrl);
    });

    const tuning = rotation.tuning || "";
    if (tuning) add(`images/tuning_abilities/${encodeURIComponent(tuning)}.png`);

    rotationRounds(rotation).forEach((round) => {
      const slots = Array.isArray(round.slots) ? round.slots : [];
      slots.forEach((slot) => {
        (Array.isArray(slot.cards) ? slot.cards : []).filter(Boolean).forEach((card) => add(cardArt(card)));
      });
    });

    return [...urls];
  }

  /* ---- the modal snapshot ---- */

  /**
   * The plan exactly as the modal draws it, on a flat ground.
   *
   * html2canvas repaints the card itself — its ribbons, brackets and Amiri type —
   * so the PNG is the plan the app draws rather than a second design imitating
   * it. The export differs from the modal in three deliberate ways: the card's
   * background art is replaced by #0F0F0F inside the amber rule with #111111
   * around it, the section headers drop their warm gradient, and the round
   * numbers keep only a bottom-right bracket.
   *
   * A clone is expanded to its full height off-screen first, because the real
   * detail pane scrolls and only shows one screenful.
   *
   * Returns null when the modal is closed or html2canvas is not on the page;
   * `render` then draws the sheet by hand instead.
   */
  async function snapshot() {
    if (typeof html2canvas !== "function") return null;
    const card = document.getElementById("rotations-card");
    if (!card || !card.offsetWidth || !card.offsetHeight) return null;

    if (document.fonts && document.fonts.ready) await document.fonts.ready.catch(() => {});

    const clone = card.cloneNode(true);
    // The modal animates its blocks in; a clone would restart those animations
    // and be caught half-faded, so the snapshot switches them off wholesale.
    clone.setAttribute("data-rot-export", "1");
    clone.style.animation = "none";
    clone.style.opacity = "1";
    clone.style.transform = "none";
    clone.style.height = "auto";
    clone.style.maxHeight = "none";
    clone.style.width = "max-content";
    // `.archetype-modal-card` sets its art with !important, so the override has
    // to outrank it: the sheet is filled flat instead of carrying the art.
    clone.style.setProperty("background-image", "none", "important");
    clone.style.setProperty("background-color", SHEET_INK, "important");
    clone.style.setProperty("border", `1px solid ${SHEET_RULE}`, "important");
    clone.style.setProperty("border-radius", "0 20px 0 0", "important");
    clone.style.setProperty("box-shadow", "none", "important");

    // The plan, not the modal chrome around it.
    clone
      .querySelectorAll(
        ".archetype-modal-header, .rotations-browse, .guide-rail-resizer, .rot-scale-control, .rot-share-btn"
      )
      .forEach((el) => {
        el.style.display = "none";
      });

    // Section plates: the black plate and its amber spine stay, the warm wash
    // that only reads on the artwork goes.
    clone.querySelectorAll(".rot-block > .archetype-section-header").forEach((el) => {
      el.style.setProperty("background-image", "none", "important");
      el.style.setProperty("background-color", "rgba(0, 0, 0, 0.4)", "important");
    });

    // The round number keeps only the bottom-right bracket.
    clone.querySelectorAll(".rot-round-no").forEach((el) => {
      el.style.border = "none";
      el.style.borderRight = `2px solid ${COLOR.gold}`;
      el.style.borderBottom = `2px solid ${COLOR.gold}`;
      el.style.borderRadius = "0 0 10px 0";
    });

    const body = clone.querySelector(".rotations-body");
    if (body) {
      body.style.height = "auto";
      body.style.maxHeight = "none";
      body.style.width = "max-content";
    }
    const detail = clone.querySelector(".rotations-detail");
    if (detail) {
      detail.style.overflow = "visible";
      detail.style.height = "auto";
      detail.style.maxHeight = "none";
      detail.style.width = "max-content";
      detail.style.paddingBottom = "26px";
    }
    clone.querySelectorAll(".rot-rounds-body").forEach((el) => {
      el.style.overflow = "visible";
      el.style.paddingRight = "0";
      el.style.paddingBottom = "0";
    });

    // #111111 sits outside the amber rule, so the PNG still has a margin when
    // it is dropped on a white page.
    const stage = document.createElement("div");
    stage.setAttribute("data-rot-export", "1");
    stage.style.cssText = `background:${PAGE_INK};padding:${STAGE_PAD}px;width:max-content;`;

    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:-20000px;top:0;pointer-events:none;";
    host.setAttribute("aria-hidden", "true");
    const freeze = document.createElement("style");
    freeze.textContent =
      "[data-rot-export], [data-rot-export] * { animation: none !important; transition: none !important; }";
    stage.appendChild(clone);
    host.appendChild(freeze);
    host.appendChild(stage);
    document.body.appendChild(host);

    try {
      // `max-content` can land on a half pixel; pinning the sheet to whole
      // pixels keeps the four #111111 margins identical instead of leaving one
      // side half a pixel wider.
      const sheet = clone.getBoundingClientRect();
      clone.style.width = `${Math.ceil(sheet.width)}px`;

      // The sheet's own bottom edge, plus the same #111111 margin the other
      // three sides get. Measuring the last round instead would eat into the
      // sheet's bottom padding and leave a thinner gap than the sides.
      const origin = stage.getBoundingClientRect().top;
      const width = stage.offsetWidth;
      const height = Math.ceil(clone.getBoundingClientRect().bottom - origin) + STAGE_PAD;
      if (!width || !height) return null;

      return await html2canvas(stage, {
        backgroundColor: PAGE_INK,
        scale: SCALE,
        useCORS: true,
        logging: false,
        scrollX: 0,
        scrollY: 0,
        width,
        height,
        windowWidth: Math.max(width, window.innerWidth),
        windowHeight: Math.max(height, window.innerHeight),
      });
    } finally {
      host.remove();
    }
  }

  async function exportRotation(rotation) {
    const shot = await snapshot().catch((error) => {
      console.warn("Rotation snapshot failed; drawing the sheet instead.", error);
      return null;
    });
    if (shot) return shot;

    await Promise.all(
      collectImages(rotation).map((src) =>
        loadImage(src).then((img) => {
          if (img) img.__loaded = true;
          return img;
        })
      )
    );
    const canvas = await render(rotation);
    return canvas;
  }

  function download(canvas, filename) {
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Revoking immediately can cancel the download in some browsers.
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }, "image/png");
  }

  function slugify(value) {
    return (
      String(value || "rotation")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "rotation"
    );
  }

  /* ---- the button ---- */

  function wire() {
    const button = document.getElementById("rotations-export-btn");
    if (!button) return;
    const label = button.querySelector("span") || button;

    // The label follows the active language. Reading the text once at startup
    // would restore the English label after an export, even in another language.
    const tr = (key, fallback) => (typeof window.t === "function" ? window.t(key) : fallback);
    const setIdle = () => {
      label.textContent = tr("rotations.exportPng", "Export PNG");
    };

    button.addEventListener("click", async () => {
      const rotation = typeof rotationsSelected === "string" ? rotationEntry(rotationsSelected) : null;
      if (!rotation) {
        button.classList.add("is-error");
        label.textContent = tr("rotations.exportSelect", "Select a rotation first");
        setTimeout(() => {
          setIdle();
          button.classList.remove("is-error");
        }, 2200);
        return;
      }

      button.disabled = true;
      label.textContent = tr("rotations.exporting", "Exporting...");
      try {
        const canvas = await exportRotation(rotation);
        download(canvas, `${slugify(rotation.name || rotation.id)}-rotation.png`);
        label.textContent = tr("rotations.exportSaved", "Saved");
        setTimeout(() => {
          setIdle();
        }, 1800);
      } catch (error) {
        console.error("Rotation export failed", error);
        label.textContent = tr("rotations.exportFailed", "Export failed");
        setTimeout(() => {
          setIdle();
        }, 2400);
      } finally {
        button.disabled = false;
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire);
  else wire();

  window.RotationExport = { exportRotation, download, slugify };
})();
