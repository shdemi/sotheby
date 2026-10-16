/**
 * Psychube icon compositing.
 *
 * The game ships psychube art as raw square images; the app needs 180x214 icons
 * with the rarity frame behind them. testCodeChube/compose.py does this with
 * Pillow, but it needs Python, a manual file shuffle and a manual rename.
 *
 * This module does the same composite in the browser so the editor can import an
 * icon in one step. The geometry is a direct port of compose.py, and
 * editor/_test/icon.test.mjs checks the output against the icons compose.py
 * produced.
 *
 * The composite, in compose.py's terms:
 *   1. canvas 180x214, transparent
 *   2. frame (180x180) pasted centred horizontally at y = 214 - 180 = 34
 *   3. art kept at its own size, centred horizontally, flush to the top
 *      (a 248x248 source gets dx = -34, so 34 columns are cropped each side)
 *   4. the outer 1px column on each canvas edge is made transparent
 *      (compose.py's --char-inset 1)
 *   5. the frame's solid footer band is drawn ON TOP of the art
 */

export const ICON_W = 180;
export const ICON_H = 214;
export const FRAME_SIZE = 180;
export const CHAR_INSET = 1;

/** compose.py detects the footer as the rows where every column is opaque. */
export const FOOTER_ALPHA_THRESHOLD = 250;

/**
 * Horizontal placement of the art: centred, floored.
 * compose.py: dx = (canvas_w - char.width) // 2
 */
export function artOffsetX(canvasW, artWidth) {
  return Math.floor((canvasW - artWidth) / 2);
}

/** compose.py aligns the art's top edge with the canvas top: dy = 0. */
export function artOffsetY() {
  return 0;
}

/** Vertical placement of the frame: bottom-aligned. */
export function frameOffsetY(canvasH, frameHeight) {
  return canvasH - frameHeight;
}

/** Horizontal placement of the frame: centred, floored. */
export function frameOffsetX(canvasW, frameWidth) {
  return Math.floor((canvasW - frameWidth) / 2);
}

/**
 * Finds the first fully opaque row from the bottom, scanning upwards.
 * Returns the index of the topmost row of that contiguous band, or -1.
 * compose.py: footer_band()
 */
export function footerBandTop(alphaAt, width, height, threshold = FOOTER_ALPHA_THRESHOLD) {
  let start = height;
  for (let y = height - 1; y >= 0; y--) {
    let allOpaque = true;
    for (let x = 0; x < width; x++) {
      if (alphaAt(x, y) < threshold) {
        allOpaque = false;
        break;
      }
    }
    if (allOpaque) start = y;
    else break;
  }
  return start >= height ? -1 : start;
}

/* ------------------------------------------------------------------ *
 * Canvas composite
 * ------------------------------------------------------------------ */

function makeCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/**
 * Draws one icon.
 *
 * @param {{art: HTMLImageElement, frame: HTMLImageElement|null}} sources
 * @param {{width?: number, height?: number, frameFooter?: boolean}} [opts]
 * @returns {HTMLCanvasElement}
 */
export function compositeIcon(sources, opts = {}) {
  const width = opts.width || ICON_W;
  const height = opts.height || ICON_H;
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, width, height);

  let footer = null;

  if (sources.frame) {
    const frame = sources.frame;
    const fx = frameOffsetX(width, frame.naturalWidth);
    const fy = frameOffsetY(height, frame.naturalHeight);
    ctx.drawImage(frame, fx, fy);

    // The footer band is drawn last, over the art.
    if (opts.frameFooter !== false) {
      const frameCanvas = makeCanvas(frame.naturalWidth, frame.naturalHeight);
      const frameCtx = frameCanvas.getContext("2d", { willReadFrequently: true });
      frameCtx.drawImage(frame, 0, 0);
      const data = frameCtx.getImageData(0, 0, frame.naturalWidth, frame.naturalHeight).data;
      const alphaAt = (x, y) => data[(y * frame.naturalWidth + x) * 4 + 3];
      const top = footerBandTop(alphaAt, frame.naturalWidth, frame.naturalHeight);
      if (top >= 0) footer = { top, fx, fy: fy + top, height: frame.naturalHeight - top };
    }
  }

  const art = sources.art;
  const dx = artOffsetX(width, art.naturalWidth);
  const dy = artOffsetY();

  // compose.py's --char-inset: blank the art in the outer columns of the canvas.
  // Equivalent to drawing the art with the outermost 1px column of the canvas
  // cleared, which is what keep_lo/keep_hi compute there.
  const artCanvas = makeCanvas(art.naturalWidth, art.naturalHeight);
  const artCtx = artCanvas.getContext("2d", { willReadFrequently: true });
  artCtx.drawImage(art, 0, 0);

  if (CHAR_INSET > 0) {
    const keepLo = Math.max(0, Math.min(art.naturalWidth, CHAR_INSET - dx));
    const keepHi = Math.max(0, Math.min(art.naturalWidth, width - CHAR_INSET - dx));
    if (keepLo > 0 || keepHi < art.naturalWidth) {
      artCtx.clearRect(0, 0, keepLo, art.naturalHeight);
      artCtx.clearRect(keepHi, 0, art.naturalWidth - keepHi, art.naturalHeight);
    }
  }

  ctx.drawImage(artCanvas, dx, dy);

  if (footer) {
    const frame = sources.frame;
    ctx.drawImage(
      frame,
      0,
      footer.top,
      frame.naturalWidth,
      footer.height,
      footer.fx,
      footer.fy,
      frame.naturalWidth,
      footer.height
    );
  }

  return canvas;
}

/* ------------------------------------------------------------------ *
 * Loading
 * ------------------------------------------------------------------ */

export function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not read ${file.name} as an image.`));
    };
    img.src = url;
  });
}

export function loadImageFromUrl(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${url}`));
    img.src = url;
  });
}

export function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not encode the icon."))), "image/png");
  });
}

/* ------------------------------------------------------------------ *
 * Frame
 * ------------------------------------------------------------------ */

/**
 * The rarity frame, shipped with the editor at `editor/frame.png`.
 *
 * It is a copy of `testCodeChube/background.png`, the frame every shipped
 * psychube icon was composited with. It lives here so the editor works when
 * deployed on its own, without the local tooling folder.
 */
export const FRAME_URL = "frame.png";

/** Candidate frames, in preference order. */
export const FRAME_CANDIDATES = [
  { label: "frame.png (editor)", url: "frame.png" },
  // Present only in a local checkout; testCodeChube/ is not deployed.
  { label: "testCodeChube/background.png", url: "../testCodeChube/background.png" },
];

/**
 * Loads whichever frames are actually reachable.
 *
 * On the deployed site only `editor/frame.png` exists; locally the extra frames
 * in testCodeChube/ show up as alternatives.
 *
 * @returns {Promise<Array<{label: string, url: string, img: HTMLImageElement}>>}
 */
export async function findFrames() {
  const found = [];
  for (const candidate of FRAME_CANDIDATES) {
    try {
      found.push({ ...candidate, img: await loadImageFromUrl(candidate.url) });
    } catch {
      // Not present in this deployment; skip it.
    }
  }
  return found;
}

/** The frame to use by default: the first one that loaded. */
export function defaultFrame(frames) {
  return frames.length > 0 ? frames[0] : null;
}

/* ------------------------------------------------------------------ *
 * Saving the composited icon
 * ------------------------------------------------------------------ */

/**
 * Saves the composited icon as a download.
 *
 * There is no way to write into `images/psychube_icon/` from a static page, so
 * the icon comes back as a file named after its id — which is exactly the name
 * the folder expects.
 *
 * @returns {string} the path the file should end up at
 */
export function downloadIcon(rarity, id, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${id}.png`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return `images/psychube_icon/${rarity}/${id}.png`;
}
