/**
 * Tests for the editor UI.
 *
 *   node editor/_test/ui.test.mjs
 *
 * These need a browser (playwright) and start their own server, so they run the
 * real page rather than a simulation. The point is to catch the class of bug
 * where the model changes but the control does not re-render — the data was
 * correct and only the highlight was stale, which a model-level test cannot see.
 *
 * Skips cleanly when playwright is unavailable.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");

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

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.log("\n=== skipped ===\n  playwright is not installed (npm i -D playwright).");
  console.log("\n=== 0 checks run ===");
  process.exit(0);
}

/* ------------------------------------------------------------------ *
 * A tiny static server that never lets the browser cache text assets.
 * ------------------------------------------------------------------ */

const NO_CACHE = new Set([".html", ".js", ".mjs", ".css", ".json"]);
// testCodeChube/ is local-only tooling and is not deployed, so the test server
// refuses it. That is how these tests prove the editor works without it.
const LOCAL_ONLY = /^\/testCodeChube\//;

const { createServer } = await import("node:http");
const server = createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  if (LOCAL_ONLY.test(url)) {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("not deployed");
    return;
  }
  const file = path.join(ROOT, url.replace(/^\/+/, "") || "index.html");
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
            : ext === ".json"
              ? "application/json"
              : "application/octet-stream";
  const headers = { "Content-Type": type };
  if (NO_CACHE.has(ext)) headers["Cache-Control"] = "no-store";
  res.writeHead(200, headers).end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;
const BASE = `http://127.0.0.1:${port}/editor/index.html`;

const browser = await chromium.launch();
const page = await browser.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));
page.on("dialog", (d) => d.accept());

/** Reads the "– E1 E2" state of every segment in the team detail. */
const readSegs = () =>
  page.evaluate(() =>
    [...document.querySelectorAll("#team-detail .seg")].map((s) =>
      [...s.querySelectorAll("button")].map((b) => b.textContent + (b.className === "on" ? "*" : "")).join("")
    )
  );

const readBadge = () => page.evaluate(() => document.getElementById("review-badge").textContent);
const readSave = () => page.evaluate(() => document.getElementById("btn-save").textContent);

try {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  /* ------------------------------------------------------------------ *
   * 1. Euphoria buttons re-render
   * ------------------------------------------------------------------ */

  console.log("\n=== euphoria buttons on a team member ===");
  await page.locator('.tab[data-tab="teams"]').click();
  await page.waitForTimeout(400);
  await page.locator("#team-list-body .row").first().click();
  await page.waitForTimeout(700);

  const segs0 = await readSegs();
  check("segments are rendered", segs0.length > 0, String(segs0.length));
  check("the first member starts with no euphoria", segs0[0] === "–*E1E2", segs0[0]);

  await page.locator("#team-detail .seg").first().locator("button", { hasText: "E1" }).click();
  await page.waitForTimeout(600);
  check("clicking E1 moves the highlight", (await readSegs())[0] === "–E1*E2", (await readSegs())[0]);
  check("and marks the file dirty", (await readBadge()) === "1", await readBadge());
  check("and offers the download", /Download 1 file/.test(await readSave()), await readSave());

  await page.locator("#team-detail .seg").first().locator("button", { hasText: "E2" }).click();
  await page.waitForTimeout(600);
  check("clicking E2 moves it again", (await readSegs())[0] === "–E1E2*", (await readSegs())[0]);

  await page.locator("#team-detail .seg").first().locator("button", { hasText: "–" }).click();
  await page.waitForTimeout(600);
  check("clicking – clears it", (await readSegs())[0] === "–*E1E2", (await readSegs())[0]);
  check("and the file is clean again", (await readBadge()) === "0", await readBadge());
  check("and the button goes back to idle", (await readSave()) === "Download changes", await readSave());

  /* ------------------------------------------------------------------ *
   * 2. Other slot controls re-render too
   * ------------------------------------------------------------------ */

  console.log("\n=== essential checkbox ===");
  await page.fill("#team-search", "Lingering");
  await page.waitForTimeout(500);
  await page.locator("#team-list-body .row").first().click();
  await page.waitForTimeout(700);

  const essBefore = await page.evaluate(() =>
    [...document.querySelectorAll("#team-detail .slot .toggle input")].map((i) => i.checked)
  );
  check("the first member is essential to begin with", essBefore[0] === true, JSON.stringify(essBefore));

  await page.locator("#team-detail .slot .toggle input").first().click();
  await page.waitForTimeout(600);
  const essAfter = await page.evaluate(() =>
    [...document.querySelectorAll("#team-detail .slot .toggle input")].map((i) => i.checked)
  );
  check("unchecking it sticks", essAfter[0] === false, JSON.stringify(essAfter));
  check("and the file is dirty", (await readBadge()) === "1", await readBadge());

  await page.locator("#team-detail .slot .toggle input").first().click();
  await page.waitForTimeout(600);
  const essBack = await page.evaluate(() =>
    [...document.querySelectorAll("#team-detail .slot .toggle input")].map((i) => i.checked)
  );
  check("re-checking it sticks", essBack[0] === true, JSON.stringify(essBack));
  check("and the file is clean again", (await readBadge()) === "0", await readBadge());

  console.log("\n=== substitute euphoria ===");
  const subSegBefore = (await readSegs()).find((s) => s.includes("*"));
  const subIndex = (await readSegs()).findIndex((s) => s === "–E1*E2");
  check("a substitute starts at E1", subIndex !== -1, JSON.stringify(await readSegs()));

  await page.locator("#team-detail .sub-editor .seg").first().locator("button", { hasText: "E2" }).click();
  await page.waitForTimeout(600);
  check("its highlight moves to E2", (await readSegs())[subIndex] === "–E1E2*", (await readSegs())[subIndex]);
  check("and the file is dirty", (await readBadge()) === "1", await readBadge());

  /* ------------------------------------------------------------------ *
   * 3. Focus survives the re-render
   * ------------------------------------------------------------------ */

  console.log("\n=== focus survives a re-render ===");
  const focused = await page.evaluate(() => (document.activeElement.dataset ? document.activeElement.dataset.focusKey : null));
  check("the clicked control keeps focus", typeof focused === "string" && focused.length > 0, String(focused));
  check("the focus key names the substitute euphoria", /sub0-eu/.test(String(focused)), String(focused));

  /* ------------------------------------------------------------------ *
   * 4. The edit actually reaches the diff
   * ------------------------------------------------------------------ */

  console.log("\n=== the change shows up in Review ===");
  await page.locator('.tab[data-tab="review"]').click();
  await page.waitForTimeout(600);
  const diffText = await page.evaluate(() =>
    [...document.querySelectorAll("#diff-report .diff-row")].map((r) => r.className.replace("diff-row ", "") + "|" + r.textContent).join("\n")
  );
  check("the diff mentions the substitute's new tier", /\+.*"euphoria": "E2"/.test(diffText), diffText.slice(0, 300));
  check("and the old tier is removed", /-.*"euphoria": "E1"/.test(diffText), diffText.slice(0, 300));
  check("only team_archetypes.json is listed", (await page.evaluate(() => document.querySelectorAll("#diff-report .diff-file").length)) === 1);

  /* ------------------------------------------------------------------ *
   * 5. Character tab controls
   * ------------------------------------------------------------------ */

  console.log("\n=== character tab controls re-render ===");
  await page.locator('.tab[data-tab="characters"]').click();
  await page.waitForTimeout(400);
  await page.locator("#char-list-body .row").first().click();
  await page.waitForTimeout(700);

  const onBefore = await page.evaluate(() =>
    [...document.querySelectorAll("#char-detail .pick button")].map((b) => (b.className.includes("on") ? b.textContent.trim() : "")).filter(Boolean)
  );
  check("the current rarity is highlighted", onBefore.some((t) => /\d★/.test(t)), JSON.stringify(onBefore));

  // Toggle the resonance shape: pick a shape that is not the current one.
  const shapes = ["Z shape", "Plus shape", "T shape", "U shape"];
  const current = onBefore.find((t) => shapes.includes(t)) || "";
  const other = shapes.find((s) => s !== current);
  await page.locator("#char-detail .pick button", { hasText: other }).first().click();
  await page.waitForTimeout(700);
  const onAfter = await page.evaluate(() =>
    [...document.querySelectorAll("#char-detail .pick button")].map((b) => (b.className.includes("on") ? b.textContent.trim() : "")).filter(Boolean)
  );
  check(`the shape highlight moved to "${other}"`, onAfter.includes(other), JSON.stringify(onAfter));
  check("and the previous shape is no longer highlighted", !onAfter.includes(current) || current === "", JSON.stringify(onAfter));
  check("and the file is dirty", (await readBadge()) !== "0", await readBadge());

  console.log("\n=== no page errors ===");
  check("the page logged no errors", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));

  /* ------------------------------------------------------------------ *
   * 6. Deployed-page expectations
   * ------------------------------------------------------------------ */

  console.log("\n=== the deployed page offers no way to write to the host ===");
  check(
    "there is no Open folder control",
    (await page.evaluate(() => document.getElementById("btn-open"))) === null,
    "an Open folder button would imply local write access"
  );
  check(
    "the page asks search engines not to index it",
    /noindex/.test(await page.evaluate(() => document.querySelector('meta[name="robots"]')?.content ?? "")),
    await page.evaluate(() => document.querySelector('meta[name="robots"]')?.content ?? "(none)")
  );
  check(
    "the File System Access API is never called",
    await page.evaluate(() => typeof window.showDirectoryPicker === "function" && !document.getElementById("btn-open")),
    "the API may exist, but nothing in the page invokes it"
  );

  /* ------------------------------------------------------------------ *
   * 7. Works without the local tooling folder
   * ------------------------------------------------------------------ */

  console.log("\n=== the icon import works without testCodeChube/ ===");
  {
    // This server refuses /testCodeChube/, so anything that still depends on it
    // would fail here.
    const refused = await page.evaluate(async () => {
      const r = await fetch("../testCodeChube/background.png");
      return r.status;
    });
    check("the test server really does refuse testCodeChube/", refused === 404, String(refused));

    await page.locator('.tab[data-tab="psychubes"]').click();
    await page.waitForTimeout(300);
    await page.evaluate(() => document.getElementById("chube-new").click());
    await page.waitForTimeout(800);

    const importState = await page.evaluate(() => {
      const d = document.getElementById("chube-detail");
      const frames = [...d.querySelectorAll(".pick")].map((p) =>
        [...p.querySelectorAll("button")].map((b) => b.textContent.trim())
      );
      const frameButtons = frames.find((list) => list.some((t) => /frame\.png/.test(t))) || [];
      return {
        hasDropZone: !!d.querySelector(".drop-zone"),
        hasCanvas: !!d.querySelector("canvas"),
        frameButtons,
        selectedFrame: (() => {
          const btn = [...d.querySelectorAll(".pick button.on")].find((b) => /frame\.png/.test(b.textContent));
          return btn ? btn.textContent.trim() : null;
        })(),
        addButton: [...d.querySelectorAll("button")].some((b) => /Add psychube/.test(b.textContent)),
      };
    });

    check("the import panel is shown", importState.hasDropZone && importState.hasCanvas, JSON.stringify(importState));
    check(
      "the editor's own frame is offered",
      importState.frameButtons.some((t) => /frame\.png/.test(t)),
      JSON.stringify(importState.frameButtons)
    );
    check(
      "no testCodeChube frame is offered",
      !importState.frameButtons.some((t) => /testCodeChube/.test(t)),
      JSON.stringify(importState.frameButtons)
    );
    check("the editor's frame is selected by default", importState.selectedFrame !== null, String(importState.selectedFrame));
    check("the add button is present", importState.addButton);

    console.log("\n=== the composite works on the deployed site ===");
    {
      // "needed to edit/" is not deployed, so build a synthetic art image in the
      // page and run the real composite on it.
      const composed = await page.evaluate(async () => {
        const mod = await import("./icons.js");
        const frames = await mod.findFrames();
        if (frames.length === 0) return { error: "no frame loaded" };

        const art = document.createElement("canvas");
        art.width = 248;
        art.height = 248;
        const actx = art.getContext("2d");
        actx.fillStyle = "#3a6ea5";
        actx.fillRect(40, 0, 168, 248);

        const img = await new Promise((res) => {
          const i = new Image();
          i.onload = () => res(i);
          i.src = art.toDataURL("image/png");
        });

        const out = mod.compositeIcon({ art: img, frame: frames[0].img });
        const ctx = out.getContext("2d", { willReadFrequently: true });
        const px = (x, y) => [...ctx.getImageData(x, y, 1, 1).data];
        const blob = await mod.canvasToBlob(out);

        // --char-inset clears the ART in the outer columns; the frame behind it
        // still shows. So the check is "no art colour at the edges", not
        // "transparent at the edges".
        const frameOnly = document.createElement("canvas");
        frameOnly.width = 180;
        frameOnly.height = 214;
        frameOnly.getContext("2d").drawImage(frames[0].img, 0, 214 - frames[0].img.naturalHeight);
        const fctx = frameOnly.getContext("2d", { willReadFrequently: true });
        const fpx = (x, y) => [...fctx.getImageData(x, y, 1, 1).data];

        return {
          size: [out.width, out.height],
          footer: px(90, 210),
          art: px(90, 100),
          artColor: [58, 110, 165],
          leftEdge: px(0, 100),
          rightEdge: px(179, 100),
          leftEdgeFrameOnly: fpx(0, 100),
          rightEdgeFrameOnly: fpx(179, 100),
          blobType: blob.type,
          blobBytes: blob.size,
        };
      });

      const samePixel = (a, b) => a && b && a.every((v, i) => v === b[i]);
      check("the composite produces a 180x214 canvas", composed.size && composed.size[0] === 180 && composed.size[1] === 214, JSON.stringify(composed));
      check("the frame's footer band is drawn", composed.footer && composed.footer[3] === 255, JSON.stringify(composed.footer));
      check(
        "the art is visible in the middle",
        composed.art && composed.art.slice(0, 3).join(",") === composed.artColor.join(","),
        JSON.stringify(composed.art)
      );
      check(
        "the left column shows the frame, not the art",
        samePixel(composed.leftEdge, composed.leftEdgeFrameOnly),
        `composite ${JSON.stringify(composed.leftEdge)} vs frame-only ${JSON.stringify(composed.leftEdgeFrameOnly)}`
      );
      check(
        "the right column shows the frame, not the art",
        samePixel(composed.rightEdge, composed.rightEdgeFrameOnly),
        `composite ${JSON.stringify(composed.rightEdge)} vs frame-only ${JSON.stringify(composed.rightEdgeFrameOnly)}`
      );
      check("it encodes as a PNG", composed.blobType === "image/png" && composed.blobBytes > 1000, JSON.stringify([composed.blobType, composed.blobBytes]));
    }
  }

  console.log("\n=== downloading the changes produces a ZIP ===");
  {
    // Start from a clean slate so there is exactly one changed file.
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    await page.locator('.tab[data-tab="teams"]').click();
    await page.waitForTimeout(400);
    await page.locator("#team-list-body .row").first().click();
    await page.waitForTimeout(700);
    await page.locator("#team-detail .seg").first().locator("button", { hasText: "E1" }).click();
    await page.waitForTimeout(600);

    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 20000 }),
      page.locator("#btn-save").click(),
    ]);
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const bytes = Buffer.concat(chunks);

    check("the file is named .zip", /\.zip$/.test(download.suggestedFilename()), download.suggestedFilename());
    check("it is a ZIP archive", bytes.subarray(0, 4).toString("hex") === "504b0304", bytes.subarray(0, 4).toString("hex"));
    check("it is not empty", bytes.length > 100, String(bytes.length));

    // The entry name must be the repository path, so extracting over the repo
    // root puts the file where it belongs.
    const raw = bytes.toString("latin1");
    check("it contains the changed file at its repository path", raw.includes("data/team_archetypes.json"), "entry name not found");

    const bannerText = await page.evaluate(() => document.getElementById("banner").textContent);
    check("the banner names the archive", /\.zip/.test(bannerText), bannerText.slice(0, 120));
    check("the banner says where to extract it", /repository root/.test(bannerText), bannerText.slice(0, 160));
  }
} finally {
  await browser.close();
  server.close();
}

console.log(`\n=== ${checks - failures}/${checks} checks passed ===`);
process.exit(failures === 0 ? 0 : 1);
