/**
 * Rotation PNG export.
 *
 * Draws the selected card plan onto a canvas and downloads it. The drawing is
 * done by hand rather than with html2canvas, because the plan uses
 * `aspect-ratio`, `object-fit` and percentage insets that a DOM screenshot does
 * not reproduce faithfully â€” and a plan sheet is the one image people will
 * actually read.
 *
 * All sizes below are CSS pixels; the canvas is scaled up by SCALE so the PNG
 * stays sharp on a retina display.
 */
(function () {
  const SCALE = 2;
  const PAD = 28;

  /* Layout constants, mirroring styles.css. */
  const GAP = 5;
  const ROUND_GAP = 22;
  const SLOT_H = 132;
  const CAPTION_H = 8;
  const CAPTION_GAP = 4;
  const SECTION_H = 34;
  const SECTION_GAP = 14;

  const COLOR = {
    bg: "#111111",
    bgEdge: "#111111",
    title: "#ECE5D9",
    text: "#E7E0D3",
    muted: "#8f8a83",
    gold: "#E8A33D",
    accent: "#D4B235",
    border: "rgba(255, 255, 255, 0.10)",
    panel: "rgba(0, 0, 0, 0.22)",
    note: "#F0E6D2",
  };

  const TITLE_FONT = '400 30px Georgia, "Times New Roman", serif';
  const NOTE_FONT = '400 14px Georgia, "Times New Roman", serif';
  const ROUND_NO_FONT = '400 21px Georgia, "Times New Roman", serif';
  const ROUND_TITLE_FONT = '700 13px Georgia, "Times New Roman", serif';
  const LABEL_FONT = '400 10px "gg sans", "Segoe UI", Arial, sans-serif';
  const BODY_FONT = '400 13px "gg sans", "Segoe UI", Arial, sans-serif';
  const SMALL_FONT = '400 11px "gg sans", "Segoe UI", Arial, sans-serif';
  // The tag plate's serif; the size drops when a long tag has to fit a card.
  const tagFont = (size) => `700 ${size}px Georgia, "Times New Roman", serif`;

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
    const gutter = 56;
    const roundNotes = Array.isArray(rotation.roundNotes) ? rotation.roundNotes : [];
    const railW = roundNotes.length ? 150 : 0;

    const contentW = Math.max(
      520,
      ...strips.map((w) => gutter + 10 + w),
      archetypes.length ? archetypes.join("  ").length * 9 : 0
    );

    return { members, rounds, archetypes, strips, gutter, roundNotes, railW, contentW };
  }

  function teamTileWidth(ctx, member) {
    const chubeKey = psychubeKeyFromName(member.psychube);
    const chube = chubeKey ? psychubeDb[chubeKey] : null;
    setFont(ctx, LABEL_FONT, COLOR.text);
    const nameW = ctx.measureText(displayCharName(member.character)).width;
    let right = nameW;
    if (chube) {
      setFont(ctx, SMALL_FONT, COLOR.muted);
      right = Math.max(right, 26 + 6 + ctx.measureText(psychubeNameFromName(member.psychube)).width);
    }
    return 7 + 56 + 10 + right + 16;
  }

  /* ---- drawing ---- */

  function drawSectionHeader(ctx, label, x, y, w) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    ctx.fillRect(x, y, w, SECTION_H);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, SECTION_H - 1);
    ctx.fillStyle = COLOR.accent;
    ctx.fillRect(x, y, 3, SECTION_H);
    setFont(ctx, ROUND_TITLE_FONT, COLOR.text, "2px");
    ctx.textBaseline = "middle";
    ctx.fillText(String(label).toUpperCase(), x + 12, y + SECTION_H / 2 + 1);
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    ctx.textBaseline = "alphabetic";
    return SECTION_H;
  }

  function drawMemberTile(ctx, member, x, y) {
    const w = teamTileWidth(ctx, member);
    const h = 75;

    ctx.fillStyle = COLOR.panel;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(181, 181, 179, 0.3)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    // Portrait.
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

    // Portrait tier: five dashes, the first N filled.
    const tier = Math.max(0, Math.min(5, Number(member.portrait) || 0));
    const dashW = 56 / 5;
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i < tier ? "#FBAE31" : "rgba(255, 255, 255, 0.08)";
      ctx.fillRect(x + 7 + i * dashW, y + 7 + 56 + 2, dashW - 1, 3);
    }

    // Name and psychube.
    const textX = x + 7 + 56 + 10;
    setFont(ctx, BODY_FONT, COLOR.text);
    ctx.fillText(displayCharName(member.character), textX, y + 22);

    const chubeKey = psychubeKeyFromName(member.psychube);
    const chube = chubeKey ? psychubeDb[chubeKey] : null;
    if (chube) {
      const icon = imageCache.get(chube.iconUrl);
      if (icon && icon.__loaded) {
        ctx.drawImage(icon, textX, y + 30, 26, 31);
      }
      setFont(ctx, SMALL_FONT, COLOR.muted);
      ctx.fillText(psychubeNameFromName(member.psychube), textX + 32, y + 49);
    }
    return w;
  }

  const TUNING_TILE_W = 75;

  function drawTuningTile(ctx, tuning, x, y) {
    const w = TUNING_TILE_W;
    const h = 75;

    // Same surface and hairline border as a member tile.
    ctx.fillStyle = "rgba(0, 0, 0, 0.22)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(181, 181, 179, 0.3)";
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    const src = `images/tuning_abilities/${encodeURIComponent(tuning)}.png`;
    const img = imageCache.get(src);
    if (img && img.__loaded) {
      // Sized like the member portraits, so the icon carries the tile.
      const iconSize = 56;
      const ratio = img.naturalWidth / img.naturalHeight || 1;
      const iw = Math.min(w - 28, iconSize * ratio);
      const ix = Math.round(x + (w - iw) / 2);
      const iy = Math.round(y + (h - iconSize) / 2);
      ctx.drawImage(img, ix, iy, iw, iconSize);
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
   * The tag plates on the slot's first card. Every tag draws its words on the
   * blank ribbon; the plate is capped at the card's width and the words shrink
   * until they fit, so a long tag never spills off the art.
   */
  function drawTagPlates(ctx, tags, x, cardTop, ultimate, tagText = "", cardWidth = 0) {
    let y = cardTop + (ultimate ? 30 : 6);
    const limit = cardWidth || 64;
    const room = Math.max(1, limit - 11);
    for (const key of tags) {
      const tag = ROT_SLOT_TAGS.find((entry) => entry.key === key);
      if (!tag || !tag.image) continue;
      const img = imageCache.get(tag.image);
      const h = 13;
      let label = String(rotationTagLabel(tag, tagText) || "").trim();
      let size = 9;
      let textW = 0;
      setFont(ctx, tagFont(size), "#FFFFFF", "0.1px");
      textW = label ? ctx.measureText(label).width : 0;
      // The DOM shrinks the type the same way, then clips with an ellipsis.
      while (size > 6 && textW > room) {
        size -= 0.5;
        setFont(ctx, tagFont(size), "#FFFFFF", "0.1px");
        textW = label ? ctx.measureText(label).width : 0;
      }
      if (textW > room) {
        while (label.length > 1 && ctx.measureText(`${label}â€¦`).width > room) label = label.slice(0, -1);
        label = `${label}â€¦`;
        textW = ctx.measureText(label).width;
      }
      const w = Math.min(limit, Math.max(label ? 43 : 24, textW + 11));
      if (img && img.__loaded) ctx.drawImage(img, x, y, w, h);
      if (label) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x + 5, y, w - 11, h);
        ctx.clip();
        ctx.textBaseline = "middle";
        ctx.fillText(label, x + 5, y + h / 2 + 0.5);
        ctx.textBaseline = "alphabetic";
        ctx.restore();
      }
      if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
      y += h + 5;
    }
  }

  function drawSlot(ctx, slot, x, stripBottom) {
    const type = slot.type || "normal";
    const cards = Array.isArray(slot.cards) ? slot.cards.filter(Boolean) : [];
    const width = slotWidth(slot);
    const tags = rotationSlotTags(slot);
    const tagText = typeof slot.tagText === "string" ? slot.tagText : "";
    const caption = slotCaption(slot);
    const bodyBottom = stripBottom - (caption ? CAPTION_H + CAPTION_GAP : 0);
    const height = slotHeight(slot);

    if (type === "text") {
      const boxTop = bodyBottom - 81;
      ctx.fillStyle = "rgba(74, 119, 201, 0.18)";
      ctx.fillRect(x, boxTop, TEXT_W, 81);
      ctx.strokeStyle = "rgba(122, 160, 224, 0.45)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, boxTop + 0.5, TEXT_W - 1, 80);
      setFont(ctx, SMALL_FONT, "#DCE6F5");
      const lines = wrapLines(ctx, slot.text || "", TEXT_W - 16);
      drawLines(ctx, lines.slice(0, 5), x + 8, boxTop + 18, 15, "#DCE6F5");
    } else if (type === "tuning") {
      const boxTop = bodyBottom - 81;
      ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
      ctx.fillRect(x, boxTop, TUNING_W, 81);
      ctx.strokeStyle = "rgba(237, 125, 49, 0.55)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, boxTop + 0.5, TUNING_W - 1, 80);
      setFont(ctx, SMALL_FONT, "#ECE5D9");
      const lines = wrapLines(ctx, slot.text || "", TUNING_W - 8);
      drawLines(ctx, lines.slice(0, 4), x + 4, boxTop + 14, 12, "#ECE5D9");
      const artSrc = cards[0] ? cardArt(cards[0]) : null;
      const special = artSrc ? image(artSrc) : null;
      if (special && special.__loaded) ctx.drawImage(special, x + TUNING_W - 26, boxTop + 81 - 26, 23, 23);
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
      ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
      ctx.fillRect(x, boxTop, EMPTY_W, EMPTY_H);
      ctx.strokeStyle = "rgba(181, 181, 179, 0.16)";
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, boxTop + 0.5, EMPTY_W - 1, EMPTY_H - 1);
      ctx.setLineDash([]);
      drawTagPlates(ctx, tags, x, boxTop, false, tagText, EMPTY_W);
    } else {
      const h = type === "lb" ? LB_H : isUltimate(cards[0]) ? ULTIMATE_H : CARD_H;
      drawCard(ctx, cards[0], x, bodyBottom, h);
      drawTagPlates(ctx, tags, x, bodyBottom - h, isUltimate(cards[0]), tagText, cardSize(cards[0], h).w);
    }

    if (caption) {
      setFont(ctx, LABEL_FONT, type === "text" ? "#7d94b8" : type === "tuning" ? "#ED7D31" : COLOR.muted, "1.5px");
      ctx.fillText(caption, x, stripBottom - 1);
      if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
    }
    return width;
  }

  function drawRoundNotePlaque(ctx, text, x, y) {
    setFont(ctx, '700 14px Amiri, Georgia, "Times New Roman", serif', "#DFDFDF");
    const label = String(text);
    const w = ctx.measureText(label).width + 34;
    const h = 22;
    const gradient = ctx.createLinearGradient(x, y, x + w, y);
    gradient.addColorStop(0, "#86783C");
    gradient.addColorStop(0.25, "rgba(134, 120, 60, 0.75)");
    gradient.addColorStop(0.5, "rgba(134, 120, 60, 0.5)");
    gradient.addColorStop(0.75, "rgba(134, 120, 60, 0.25)");
    gradient.addColorStop(1, "rgba(134, 120, 60, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#D4B235";
    ctx.fillRect(x, y, 3, h);
    ctx.fillStyle = "#DFDFDF";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x + 10, y + h / 2 + 1);
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

    const tileWidths = members.map((member) => teamTileWidth(measure, member));
    const tuning = typeof rotation.tuning === "string" ? rotation.tuning.trim() : "";
    const tuningW = tuning ? TUNING_TILE_W : 0;
    const allTileWidths = tuning ? [...tileWidths, tuningW] : tileWidths;
    const teamRowW = allTileWidths.reduce((a, b) => a + b, 0) + Math.max(0, allTileWidths.length - 1) * 10;

    const contentW = Math.max(
      560,
      teamRowW,
      ...strips.map((w) => gutter + 10 + w),
      railW
    );
    const width = PAD * 2 + contentW;
    const height = measureHeight(rotation, data, contentW);

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * SCALE);
    canvas.height = Math.round(height * SCALE);
    const ctx = canvas.getContext("2d");
    ctx.scale(SCALE, SCALE);
    ctx.textBaseline = "alphabetic";

    drawBackground(ctx, width, height);

    let y = PAD;
    const x0 = PAD;

    // Title.
    setFont(ctx, TITLE_FONT, COLOR.title);
    ctx.fillText(rotation.name || rotation.id || "", x0, y + 26);
    y += 40;

    // Archetype chips. Raid and Focused Flashback carry their own colour.
    if (archetypes.length) {
      let cx = x0;
      for (const tag of archetypes) {
        const color = ARCHETYPE_COLORS[tag] || "#ED7D31";
        setFont(ctx, LABEL_FONT, color, "1px");
        const w = ctx.measureText(tag).width + 20;
        // An outline only: no fill behind the words, matching the modal.
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.strokeRect(cx + 0.5, y + 0.5, w - 1, 20);
        ctx.fillStyle = color;
        ctx.fillText(tag, cx + 10, y + 15);
        if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
        cx += w + 6;
      }
      y += 21;
    }

    y += 16;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, y + 0.5);
    ctx.lineTo(x0 + contentW, y + 0.5);
    ctx.stroke();
    y += 20;

    // Team.
    y += drawSectionHeader(ctx, "Team", x0, y, contentW) + 10;
    let tx = x0;
    let rowH = 0;
    members.forEach((member, i) => {
      const w = tileWidths[i];
      if (tx > x0 && tx + w > x0 + contentW) {
        tx = x0;
        y += rowH + 10;
        rowH = 0;
      }
      drawMemberTile(ctx, member, tx, y);
      tx += w + 10;
      rowH = 75;
    });
    if (tuning) {
      if (tx > x0 && tx + tuningW > x0 + contentW) {
        tx = x0;
        y += rowH + 10;
        rowH = 0;
      }
      drawTuningTile(ctx, tuning, tx, y);
      tx += tuningW + 10;
      rowH = 75;
    }
    y += rowH + 20;

    // Rotation notes.
    if (rotation.notes) {
      y += drawSectionHeader(ctx, "Notes", x0, y, contentW) + 10;
      setFont(ctx, BODY_FONT, "#b9b2a6");
      for (const paragraph of String(exportLocalizeText(rotation.notes)).split("\n")) {
        const lines = wrapLines(ctx, paragraph, contentW);
        y += drawLines(ctx, lines, x0, y + 13, 19, "#b9b2a6");
        y += 4;
      }
      y += 16;
    }

    // Rounds.
    y += drawSectionHeader(ctx, "Rounds", x0, y, contentW) + SECTION_GAP;

    const stripLeft = x0 + gutter + 10;
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

      // The number sits in a small bordered box level with the cards.
      const noTop = stripTop + 26;
      const noText = String(index + 1).padStart(2, "0");
      setFont(ctx, ROUND_NO_FONT, "#F0E6D2");
      const noW = Math.max(44, ctx.measureText(noText).width + 20);
      const noH = 38;
      ctx.fillStyle = "transparent";
      ctx.strokeStyle = COLOR.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(x0 + 0.5, noTop + 0.5, noW - 1, noH - 1);
      ctx.fillStyle = "#F0E6D2";
      ctx.fillText(noText, x0 + 10, noTop + noH - 12);
      drawCornerMark(ctx, x0, noTop, 13, "tl");
      drawCornerMark(ctx, x0 + noW, noTop + noH, 13, "br");

      const stripBottom = stripTop + SLOT_H - 12;

      // Slots.
      const slotXs = [];
      let sx = stripLeft;
      slots.forEach((slot) => {
        const w = slotWidth(slot);
        slotXs.push({ left: sx, right: sx + w });
        drawSlot(ctx, slot, sx, stripBottom);
        sx += w + GAP;
      });

      y = stripTop + SLOT_H;

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
          drawAnnotation(ctx, note, slotXs, stripBottom, y + lanes[i] * 26 + 10);
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

    return canvas;
  }

  function drawCornerMark(ctx, x, y, size, corner) {
    ctx.strokeStyle = COLOR.gold;
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (corner === "tl") {
      ctx.moveTo(x - 1, y + size);
      ctx.lineTo(x - 1, y - 1);
      ctx.lineTo(x + size, y - 1);
    } else {
      ctx.moveTo(x + 1, y - size);
      ctx.lineTo(x + 1, y + 1);
      ctx.lineTo(x - size, y + 1);
    }
    ctx.stroke();
  }

  function drawBackground(ctx, width, height) {
    ctx.fillStyle = "#111111";
    ctx.fillRect(0, 0, width, height);
  }

  /** A dry run that walks the same steps without drawing, to size the canvas. */
  function measureHeight(rotation, data, contentW) {
    const { members, rounds, archetypes } = data;
    const measure = document.createElement("canvas").getContext("2d");
    let y = PAD + 40;
    if (archetypes.length) y += 21;
    y += 16 + 20;
    y += SECTION_H + 10;

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
    y += rows * 75 + Math.max(0, rows - 1) * 10 + 20;

    if (rotation.notes) {
      y += SECTION_H + 10;
      setFont(measure, BODY_FONT, "#b9b2b6");
      for (const paragraph of String(exportLocalizeText(rotation.notes)).split("\n")) {
        y += Math.max(1, wrapLines(measure, paragraph, contentW).length) * 19 + 4;
      }
      y += 16;
    }

    y += SECTION_H + SECTION_GAP;

    rounds.forEach((round) => {
      let stripTop = y;
      if (round.note) stripTop = y + 32;
      let bottom = stripTop + SLOT_H;

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
        bottom += (Math.max(...packLanes(mapped)) + 1) * 26;
      }
      y = bottom + ROUND_GAP;
    });

    return y + PAD - ROUND_GAP;
  }

  /* ---- the download ---- */

  function collectImages(rotation) {
    const urls = new Set();
    const add = (src) => {
      if (src) urls.add(src);
    };

    add(ultimateFrame().image);
    surfaces().forEach((surface) => add(surface.image));
    ROT_SLOT_TAGS.forEach((tag) => add(tag.image));

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

  async function exportRotation(rotation) {
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
    const idle = label.textContent;

    button.addEventListener("click", async () => {
      const rotation = typeof rotationsSelected === "string" ? rotationEntry(rotationsSelected) : null;
      if (!rotation) {
        button.classList.add("is-error");
        label.textContent = "Select a rotation first";
        setTimeout(() => {
          label.textContent = idle;
          button.classList.remove("is-error");
        }, 2200);
        return;
      }

      button.disabled = true;
      label.textContent = "Exportingâ€¦";
      try {
        const canvas = await exportRotation(rotation);
        download(canvas, `${slugify(rotation.name || rotation.id)}-card-plan.png`);
        label.textContent = "Saved";
        setTimeout(() => {
          label.textContent = idle;
        }, 1800);
      } catch (error) {
        console.error("Rotation export failed", error);
        label.textContent = "Export failed";
        setTimeout(() => {
          label.textContent = idle;
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
