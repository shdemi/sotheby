/**
 * Tests for editor/icons.js — the psychube icon composite.
 *
 *   node editor/_test/icon.test.mjs
 *
 * Two halves:
 *
 *  1. Geometry and frame detection, checked directly in Node.
 *  2. The composite itself, checked by rendering it in a real browser and
 *     comparing against the icons compose.py produced. That half needs the
 *     `playwright` package; without it the comparison is skipped and reported.
 *
 * The pixel comparison tolerates a max delta of 8/255 on a handful of pixels.
 * A canvas stores colours premultiplied by alpha, so a translucent edge pixel can
 * round differently from Pillow's straight alpha — observed at 2 pixels per icon
 * with a delta of 1..4. A geometry or layering mistake shows up instead as
 * thousands of differing pixels with a large delta, which is not tolerated.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as icons from "../icons.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const TOOL = path.join(ROOT, "testCodeChube");
const INPUT = path.join(TOOL, "needed to edit");
const RESULTS = path.join(TOOL, "results");

let checks = 0;
let failures = 0;
function check(label, ok, detail) {
  checks++;
  if (ok) console.log(`  PASS  ${label}`);
  else {
    failures++;
    console.log(`  FAIL  ${label}`);
    if (detail !== undefined) console.log(`        ${detail}`);
  }
}

/* ------------------------------------------------------------------ *
 * 1. Geometry (pure, no browser)
 * ------------------------------------------------------------------ */

console.log("\n=== constants match compose.py ===");
check("canvas is 180x214", icons.ICON_W === 180 && icons.ICON_H === 214, `${icons.ICON_W}x${icons.ICON_H}`);
check("the frame is 180x180", icons.FRAME_SIZE === 180, String(icons.FRAME_SIZE));
check("--char-inset defaults to 1", icons.CHAR_INSET === 1, String(icons.CHAR_INSET));
check("the footer threshold is 250", icons.FOOTER_ALPHA_THRESHOLD === 250, String(icons.FOOTER_ALPHA_THRESHOLD));

console.log("\n=== offsets match compose.py ===");
// compose.py: dx = (canvas_w - char.width) // 2, dy = 0
check("a 248px source gets dx = -34", icons.artOffsetX(180, 248) === -34, String(icons.artOffsetX(180, 248)));
check("a 180px source gets dx = 0", icons.artOffsetX(180, 180) === 0, String(icons.artOffsetX(180, 180)));
check("an odd difference floors, like // in Python", icons.artOffsetX(180, 249) === -35, String(icons.artOffsetX(180, 249)));
check("the art is flush to the top", icons.artOffsetY() === 0, String(icons.artOffsetY()));
// compose.py: y = canvas_h - bg.height
check("the frame sits at y = 34", icons.frameOffsetY(214, 180) === 34, String(icons.frameOffsetY(214, 180)));
check("the frame is centred horizontally", icons.frameOffsetX(180, 180) === 0, String(icons.frameOffsetX(180, 180)));

console.log("\n=== footer band detection matches compose.py ===");
{
  const alpha = (x, y) => (y >= 3 ? 255 : x === 1 ? 100 : 255);
  check("finds the top of the solid band", icons.footerBandTop(alpha, 4, 5) === 3, String(icons.footerBandTop(alpha, 4, 5)));
  check("returns -1 when no row is solid", icons.footerBandTop(() => 200, 4, 5) === -1);

  const gapped = (x, y) => (y === 2 && x === 0 ? 0 : 255);
  check("stops at the first gap above the band", icons.footerBandTop(gapped, 4, 5) === 3, String(icons.footerBandTop(gapped, 4, 5)));

  // The threshold decides whether a near-opaque row counts as the band.
  // Rows 0..2 are semi-transparent (100), rows 3..4 are 249.
  const nearSolid = (x, y) => (y >= 3 ? 249 : 100);
  check("a 249 row is not solid at the default threshold", icons.footerBandTop(nearSolid, 4, 5) === -1);
  check("but the same row is solid at a threshold of 240", icons.footerBandTop(nearSolid, 4, 5, 240) === 3);
}

console.log("\n=== frame candidates ===");
check("the editor ships its own frame", icons.FRAME_URL === "frame.png", icons.FRAME_URL);
check("frame.png is the only candidate", icons.FRAME_CANDIDATES.length === 1, String(icons.FRAME_CANDIDATES.length));
check("its url matches FRAME_URL", icons.FRAME_CANDIDATES[0].url === icons.FRAME_URL);
check("it has a label", typeof icons.FRAME_CANDIDATES[0].label === "string" && icons.FRAME_CANDIDATES[0].label.length > 0);
check("defaultFrame picks the first one", icons.defaultFrame([{ label: "a" }, { label: "b" }]).label === "a");
check("defaultFrame tolerates an empty list", icons.defaultFrame([]) === null);

/* ------------------------------------------------------------------ *
 * 2. The real composite, in a browser
 * ------------------------------------------------------------------ */

if (!fs.existsSync(INPUT) || !fs.existsSync(RESULTS)) {
  console.log("\n=== browser composite: skipped (testCodeChube is not present) ===");
} else {
  let chromium = null;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    console.log("\n=== browser composite: skipped (playwright is not installed) ===");
    console.log("    Install it with `npm i -D playwright` to run the pixel comparison.");
  }

  if (chromium) {
    const names = fs
      .readdirSync(INPUT)
      .filter((f) => f.toLowerCase().endsWith(".png"))
      .map((f) => path.basename(f, ".png"))
      .filter((n) => fs.existsSync(path.join(RESULTS, `${n}.png`)))
      .sort((a, b) => Number(a) - Number(b));

    const { createServer } = await import("node:http");
    const server = createServer((req, res) => {
      const url = decodeURIComponent(req.url.split("?")[0]);
      const file = path.join(ROOT, url.replace(/^\/+/, ""));
      if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404).end("not found");
        return;
      }
      const ext = path.extname(file).toLowerCase();
      const type =
        ext === ".js" || ext === ".mjs"
          ? "text/javascript"
          : ext === ".png"
            ? "image/png"
            : ext === ".css"
              ? "text/css"
              : ext === ".html"
                ? "text/html"
                : "application/octet-stream";
      res.writeHead(200, { "Content-Type": type }).end(fs.readFileSync(file));
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const port = server.address().port;

    const browser = await chromium.launch();
    const page = await browser.newPage();

    try {
      await page.goto(`http://127.0.0.1:${port}/editor/index.html`, { waitUntil: "domcontentloaded" });

      console.log(`\n=== browser composite vs compose.py (${names.length} icons) ===`);
      const report = await page.evaluate(async (list) => {
        const mod = await import("./icons.js");
        const frame = await mod.loadImageFromUrl("../testCodeChube/background.png");

        const readPixels = (source, w, h) => {
          const c = document.createElement("canvas");
          c.width = w;
          c.height = h;
          const ctx = c.getContext("2d", { willReadFrequently: true });
          ctx.drawImage(source, 0, 0, w, h);
          return ctx.getImageData(0, 0, w, h).data;
        };

        const out = [];
        for (const n of list) {
          const art = await mod.loadImageFromUrl(`../testCodeChube/needed to edit/${n}.png`);
          const canvas = mod.compositeIcon({ art, frame });
          const mine = canvas.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, 180, 214).data;

          const ref = await mod.loadImageFromUrl(`../testCodeChube/results/${n}.png`);
          const theirs = readPixels(ref, 180, 214);

          let diffPixels = 0;
          let maxDelta = 0;
          let footerDiff = 0;
          // Every observed difference is +-1..4 on the alpha channel only, on the
          // anti-aliased top row of the art, from premultiplied-alpha rounding.
          // Track colour and alpha separately so a real colour error stands out.
          let maxColorDelta = 0;
          let maxAlphaDelta = 0;
          const rows = new Set();

          for (let y = 0; y < 214; y++) {
            for (let x = 0; x < 180; x++) {
              const i = (y * 180 + x) * 4;
              let d = 0;
              for (let k = 0; k < 4; k++) d = Math.max(d, Math.abs(mine[i + k] - theirs[i + k]));
              const colorD = Math.max(
                Math.abs(mine[i] - theirs[i]),
                Math.abs(mine[i + 1] - theirs[i + 1]),
                Math.abs(mine[i + 2] - theirs[i + 2])
              );
              const alphaD = Math.abs(mine[i + 3] - theirs[i + 3]);
              maxColorDelta = Math.max(maxColorDelta, colorD);
              maxAlphaDelta = Math.max(maxAlphaDelta, alphaD);
              if (d > 0) {
                diffPixels++;
                if (d > maxDelta) maxDelta = d;
                if (y >= 203) footerDiff++;
                rows.add(y);
              }
            }
          }
          out.push({ n, diffPixels, maxDelta, maxColorDelta, maxAlphaDelta, footerDiff, rows: [...rows] });
        }
        return out;
      }, names);

      const worst = report.reduce((a, b) => (b.diffPixels > a.diffPixels ? b : a), report[0]);
      const totalDiff = report.reduce((sum, r) => sum + r.diffPixels, 0);
      const maxColor = Math.max(...report.map((r) => r.maxColorDelta));
      const maxAlpha = Math.max(...report.map((r) => r.maxAlphaDelta));

      check(
        "no icon has a meaningful colour difference",
        report.every((r) => r.maxColorDelta <= 8),
        `max colour delta ${maxColor}/255 — a real compositing error would be far larger`
      );
      check(
        "alpha differences stay within premultiplied rounding (<= 8/255)",
        report.every((r) => r.maxAlphaDelta <= 8),
        `max alpha delta ${maxAlpha}/255`
      );
      check(
        "the differing pixels are a tiny fraction of the icon",
        report.every((r) => r.diffPixels < 214 * 180 * 0.01),
        `worst = icon ${worst.n} with ${worst.diffPixels} of ${214 * 180} pixels`
      );
      console.log(
        `        ${names.length} icons; worst = icon ${worst.n} (${worst.diffPixels} px, ` +
          `alpha delta ${worst.maxAlphaDelta}/255); total differing pixels = ${totalDiff}`
      );
      check(
        "the footer band is drawn on top identically",
        report.every((r) => r.footerDiff === 0),
        report.filter((r) => r.footerDiff).map((r) => `icon ${r.n}: ${r.footerDiff} px`).join(", ")
      );
      check(
        "every difference is on the art's anti-aliased top edge, not the frame",
        report.every((r) => r.rows.every((y) => y <= 40)),
        report.filter((r) => r.rows.some((y) => y > 40)).map((r) => `icon ${r.n}: rows ${r.rows.join(",")}`).join(" | ")
      );

      console.log("\n=== the editor's own frame is present and correct ===");
      {
        const frameInfo = await page.evaluate(async () => {
          const mod = await import("./icons.js");
          const frames = await mod.findFrames();
          const own = frames.find((f) => f.label.startsWith("frame.png"));
          if (!own) return { missing: true, labels: frames.map((f) => f.label) };
          const c = document.createElement("canvas");
          c.width = own.img.naturalWidth;
          c.height = own.img.naturalHeight;
          c.getContext("2d").drawImage(own.img, 0, 0);
          return {
            missing: false,
            labels: frames.map((f) => f.label),
            size: [own.img.naturalWidth, own.img.naturalHeight],
            isDefault: mod.defaultFrame(frames).label === own.label,
          };
        });
        check("editor/frame.png loads", !frameInfo.missing, JSON.stringify(frameInfo.labels ?? []));
        check("it is 180x180", frameInfo.size && frameInfo.size[0] === 180 && frameInfo.size[1] === 180, JSON.stringify(frameInfo.size));
        check("it is the default frame", frameInfo.isDefault === true);
      }

      console.log("\n=== output properties ===");
      const props = await page.evaluate(async () => {
        const mod = await import("./icons.js");
        const art = await mod.loadImageFromUrl("../testCodeChube/needed to edit/1.png");
        const frame = await mod.loadImageFromUrl("../testCodeChube/background.png");
        const canvas = mod.compositeIcon({ art, frame });
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        const blob = await mod.canvasToBlob(canvas);
        const noFrame = mod.compositeIcon({ art, frame: null });
        const nfCtx = noFrame.getContext("2d", { willReadFrequently: true });
        return {
          w: canvas.width,
          h: canvas.height,
          type: blob.type,
          bytes: blob.size,
          left: ctx.getImageData(0, 0, 1, 1).data[3],
          right: ctx.getImageData(179, 0, 1, 1).data[3],
          footer: ctx.getImageData(90, 210, 1, 1).data[3],
          noFrameCorner: nfCtx.getImageData(5, 5, 1, 1).data[3],
          noFrameSize: [noFrame.width, noFrame.height],
        };
      });
      check("the canvas is 180x214", props.w === 180 && props.h === 214, `${props.w}x${props.h}`);
      check("the blob is a PNG", props.type === "image/png", props.type);
      check("the PNG has content", props.bytes > 1000, String(props.bytes));
      check("the outer 1px column is cleared on the left", props.left === 0, String(props.left));
      check("the outer 1px column is cleared on the right", props.right === 0, String(props.right));
      check("the footer band is opaque", props.footer === 255, String(props.footer));
      check(
        "without a frame the canvas is still 180x214",
        props.noFrameSize[0] === 180 && props.noFrameSize[1] === 214,
        JSON.stringify(props.noFrameSize)
      );
      check("without a frame the background stays transparent", props.noFrameCorner === 0, String(props.noFrameCorner));
    } finally {
      await browser.close();
      server.close();
    }
  }
}

console.log(`\n=== ${checks - failures}/${checks} checks passed ===`);
process.exit(failures === 0 ? 0 : 1);
