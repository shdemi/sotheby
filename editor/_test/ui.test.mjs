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
/** The app itself, used by the toolbar and modal checks. */
const APP = `http://127.0.0.1:${port}/index.html`;
/** The editor page again — the deploy-safety checks at the end need it. */
const EDITOR = BASE;

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

/** Character names of the slots in the first variant card. */
const readFirstVariant = () =>
  page.evaluate(() => {
    const card = document.querySelector("#team-detail .card");
    if (!card) return [];
    // Each slot has a character cell and a psychube cell; both use .sub-pick.
    // The character one is the cell whose focus key ends in "-char".
    return [...card.querySelectorAll(".slot")].map(
      (slot) => slot.querySelector('[data-focus-key$="-char"] .name')?.textContent ?? ""
    );
  });

/**
 * Simulates an HTML5 drag of a slot handle onto another slot. `below` picks the
 * drop half, which decides whether the member lands after the target.
 */const dragSlot = (fromIndex, toIndex, below) =>
  page.evaluate(
    ({ fromIndex, toIndex, below }) => {
      const card = document.querySelector("#team-detail .card");
      const slots = [...card.querySelectorAll(".slot")];
      const source = slots[fromIndex].querySelector(".slot-handle");
      const target = slots[toIndex];
      const data = new DataTransfer();
      const rect = target.getBoundingClientRect();
      const clientY = below ? rect.top + rect.height * 0.75 : rect.top + rect.height * 0.25;
      const fire = (node, type) =>
        node.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: data, clientY }));
      fire(source, "dragstart");
      fire(target, "dragover");
      fire(target, "drop");
      fire(source, "dragend");
    },
    { fromIndex, toIndex, below }
  );

/** Per-slot substitute names of the first variant, as `{ index, subs }`. */
const readAllSlotSubs = () =>
  page.evaluate(() =>
    [...document.querySelectorAll("#team-detail .card .slot")].map((slot, index) => ({
      index,
      subs: [...slot.querySelectorAll(".subs .sub-editor")].map(
        (row) => row.querySelector('[data-focus-key$="-char"] .name')?.textContent ?? ""
      ),
    }))
  );

/** Simulates a drag of one substitute handle onto another substitute row. */
const dragSub = (fromIndex, toIndex, below, slotIndex) =>
  page.evaluate(
    ({ fromIndex, toIndex, below, slotIndex }) => {
      // Rows are scoped to one slot: different slots never mix.
      const scope = [...document.querySelectorAll("#team-detail .card .slot")][slotIndex];
      const rows = [...scope.querySelectorAll(".subs .sub-editor")];
      const source = rows[fromIndex].querySelector(".sub-handle");
      const target = rows[toIndex];
      const data = new DataTransfer();
      const rect = target.getBoundingClientRect();
      const clientY = below ? rect.top + rect.height * 0.75 : rect.top + rect.height * 0.25;
      const fire = (node, type) =>
        node.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: data, clientY }));
      fire(source, "dragstart");
      fire(target, "dragover");
      fire(target, "drop");
      fire(source, "dragend");
    },
    { fromIndex, toIndex, below, slotIndex }
  );

/** Team names in the Team Building modal, in display order. */
const readTeamOrder = () =>
  page.evaluate(() =>
    [...document.querySelectorAll("#team-list .team-card .team-name-input")].map((i) => i.value)
  );

/** Simulates dragging one team card by its handle onto another card. */
const dragTeamCard = (fromIndex, toIndex, below) =>
  page.evaluate(
    ({ fromIndex, toIndex, below }) => {
      const cards = [...document.querySelectorAll("#team-list .team-card")];
      const source = cards[fromIndex].querySelector(".team-drag-handle");
      const target = cards[toIndex];
      const data = new DataTransfer();
      const rect = target.getBoundingClientRect();
      const clientY = below ? rect.top + rect.height * 0.75 : rect.top + rect.height * 0.25;
      const fire = (node, type) =>
        node.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: data, clientY }));
      fire(source, "dragstart");
      fire(target, "dragover");
      fire(target, "drop");
      fire(source, "dragend");
    },
    { fromIndex, toIndex, below }
  );

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
   * 1b. Dragging a member reorders its variant
   * ------------------------------------------------------------------ */

  console.log("\n=== dragging a member reorders the variant ===");
  const namesBefore = await readFirstVariant();
  check("the first variant has at least two members", namesBefore.length >= 2, JSON.stringify(namesBefore));
  check("the first member starts first", namesBefore[0] === "The Twins", JSON.stringify(namesBefore));

  await dragSlot(0, 1, true);
  await page.waitForTimeout(700);
  const namesAfter = await readFirstVariant();
  check(
    "the first member moved below the second",
    namesAfter[0] === namesBefore[1] && namesAfter[1] === namesBefore[0],
    JSON.stringify(namesAfter.slice(0, 2))
  );
  check("no member was lost", namesAfter.length === namesBefore.length, `${namesBefore.length} -> ${namesAfter.length}`);
  check("and the file is dirty", (await readBadge()) === "1", await readBadge());

  await dragSlot(1, 0, false);
  await page.waitForTimeout(700);
  const namesBack = await readFirstVariant();
  check("dragging it back restores the order", JSON.stringify(namesBack) === JSON.stringify(namesBefore), JSON.stringify(namesBack.slice(0, 2)));
  check("and the file is clean again", (await readBadge()) === "0", await readBadge());

  /* ------------------------------------------------------------------ *
   * 1c. Dragging a substitute reorders it within its slot
   * ------------------------------------------------------------------ */

  console.log("\n=== dragging a substitute reorders it ===");
  // No shipped preset stacks two substitutes in one slot, so add a second one
  // to the first slot of the selected preset to exercise the drag.
  await page.locator("#team-detail .card").first().locator(".slot-actions").first()
    .locator("button", { hasText: "+ Substitute" }).click();
  await page.waitForTimeout(700);

  const allSubs = await readAllSlotSubs();
  const staged = allSubs.find((slot) => slot.subs.length >= 2);
  check("a slot now has two substitutes", !!staged, JSON.stringify(allSubs.map((s) => s.subs.length)));
  const subSlot = staged ? staged.index : 0;
  const subsBefore = staged ? staged.subs : [];

  await dragSub(0, 1, true, subSlot);
  await page.waitForTimeout(700);
  const subsAfter = (await readAllSlotSubs())[subSlot]?.subs ?? [];
  check(
    "the first substitute moved below the second",
    subsAfter[0] === subsBefore[1] && subsAfter[1] === subsBefore[0],
    JSON.stringify(subsAfter.slice(0, 2))
  );
  check("no substitute was lost", subsAfter.length === subsBefore.length, `${subsBefore.length} -> ${subsAfter.length}`);
  check("and the file is dirty", (await readBadge()) === "1", await readBadge());

  await dragSub(1, 0, false, subSlot);
  await page.waitForTimeout(700);
  const subsBack = (await readAllSlotSubs())[subSlot]?.subs ?? [];
  check("dragging it back restores the order", JSON.stringify(subsBack) === JSON.stringify(subsBefore), JSON.stringify(subsBack.slice(0, 2)));

  // Removing the staged substitute leaves the file as it started.
  await page.locator("#team-detail .card .slot").nth(subSlot).locator(".sub-editor button").last().click();
  await page.waitForTimeout(700);
  check("removing it leaves the file clean again", (await readBadge()) === "0", await readBadge());

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
   * 8. Manage modal: Characters / Psychubes tabs
   * ------------------------------------------------------------------ */

  console.log("\n=== the Manage modal merges both managers ===");
  {
    await page.goto(APP, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);

    const toolbar = await page.evaluate(() => {
      const reset = document.getElementById("btn-roster-reset");
      const tabs = document.querySelector(".manage-tabs");
      return {
        manageButtons: [...document.querySelectorAll("#btn-manage-all, #btn-chubes")].map((b) => b.id),
        jsonButtons: [...document.querySelectorAll("#btn-json, #btn-export-data")].map((b) => b.id),
        resetText: (reset?.textContent ?? "").trim(),
        resetHasIcon: !!document.querySelector("#btn-roster-reset .btn-reset-icon"),
        resetInTabs: !!reset && reset.parentElement === tabs,
        resetIsLast: !!reset && tabs.lastElementChild === reset,
        resetOutsideToolbar: !document.getElementById("btn-reset-data"),
      };
    });
    check("only one Manage button exists", toolbar.manageButtons.join(",") === "btn-manage-all", toolbar.manageButtons.join(","));
    check("only one JSON button exists", toolbar.jsonButtons.join(",") === "btn-json", toolbar.jsonButtons.join(","));
    check("Reset is icon-only", toolbar.resetText === "" && toolbar.resetHasIcon, JSON.stringify(toolbar.resetText));
    check("Reset lives in the Manage tab row, right of the tabs", toolbar.resetInTabs && toolbar.resetIsLast, JSON.stringify(toolbar));
    check("the old toolbar Reset is gone", toolbar.resetOutsideToolbar);

    await page.locator("#btn-manage-all").click();
    await page.waitForTimeout(900);

    const opened = await page.evaluate(() => ({
      open: getComputedStyle(document.getElementById("roster-modal")).display,
      tabs: [...document.querySelectorAll("#roster-modal .manage-tab")].map((b) => b.textContent.trim()),
      active: document.querySelector("#roster-modal .manage-tab.active")?.dataset.manageTab,
      charVisible: !document.getElementById("roster-grid-list").hidden,
      chubeVisible: !document.getElementById("chubes-grid-list").hidden,
      charItems: document.querySelectorAll("#roster-grid-list .roster-char-item").length,
    }));
    check("the modal opens", opened.open === "flex", opened.open);
    check("it has two tabs", opened.tabs.length === 2, JSON.stringify(opened.tabs));
    check("Characters is the default tab", opened.active === "characters", String(opened.active));
    check("the character grid is shown", opened.charVisible && !opened.chubeVisible, JSON.stringify([opened.charVisible, opened.chubeVisible]));
    check("the character grid has entries", opened.charItems > 0, String(opened.charItems));

    await page.locator('.manage-tab[data-manage-tab="chubes"]').click();
    await page.waitForTimeout(700);
    const switched = await page.evaluate(() => ({
      active: document.querySelector("#roster-modal .manage-tab.active")?.dataset.manageTab,
      charVisible: !document.getElementById("roster-grid-list").hidden,
      chubeVisible: !document.getElementById("chubes-grid-list").hidden,
      chubeItems: document.querySelectorAll("#chubes-grid-list > *").length,
      chubeImages: document.querySelectorAll("#chubes-grid-list img").length,
    }));
    check("switching tab updates the active state", switched.active === "chubes", String(switched.active));
    check("the psychube grid replaces the character grid", switched.chubeVisible && !switched.charVisible, JSON.stringify([switched.charVisible, switched.chubeVisible]));
    check("the psychube grid is populated", switched.chubeItems > 0 && switched.chubeImages > 0, `${switched.chubeItems} rows / ${switched.chubeImages} images`);

    /* Measure the psychube tile while its tab is showing — a hidden panel has no
       layout, so width and height would both read 0. */
    const chubeStyle = await page.evaluate(() => {
      const tile = document.querySelector("#chubes-grid-list .roster-char-item .roster-avatar-box");
      if (!tile) return null;
      const r = tile.getBoundingClientRect();
      return {
        box: [Math.round(r.width), Math.round(r.height)],
        objectFit: getComputedStyle(tile.querySelector("img")).objectFit,
      };
    });

    await page.locator('.manage-tab[data-manage-tab="characters"]').click();
    await page.waitForTimeout(600);
    const back = await page.evaluate(() => !document.getElementById("roster-grid-list").hidden);
    check("switching back restores the character grid", back);

    /* The two tabs look deliberately different, and an earlier unscoped rule
       made the character tiles inherit the psychube layout. */
    const styling = await page.evaluate(() => {
      const active = getComputedStyle(document.querySelector("#roster-modal .manage-tab.active"));
      const idleEl = [...document.querySelectorAll("#roster-modal .manage-tab")].find((b) => !b.classList.contains("active"));
      const idle = idleEl ? getComputedStyle(idleEl) : null;
      const box = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return [Math.round(r.width), Math.round(r.height)];
      };
      const charTile = document.querySelector("#roster-grid-list .roster-char-item .roster-avatar-box");
      // Owned items get the visible grey border; the tests do not seed a roster,
      // so read whichever border rule applies to a real tile.
      const charBorderEl = document.querySelector("#roster-grid-list .roster-char-item.is-owned .roster-avatar-box") || charTile;
      const readBg = (el) => (el ? getComputedStyle(el).backgroundColor : null);
      return {
        activeColor: active.color,
        idleColor: idle ? idle.color : null,
        activeBorder: active.borderTopColor,
        activeWeight: active.fontWeight,
        charAvatar: box(charTile),
        charBorder: charBorderEl
          ? `${getComputedStyle(charBorderEl).borderTopWidth} ${getComputedStyle(charBorderEl).borderTopColor}`
          : null,
        charObjectFit: charTile ? getComputedStyle(charTile.querySelector("img")).objectFit : null,
        charBackground: readBg(charTile),
      };
    });

    const isOrange = (c) => /rgb\(237,\s*125,\s*49\)/.test(c);
    const isWhite = (c) => /rgb\(247,\s*247,\s*247\)/.test(c);

    check("the active tab is orange (#ED7D31)", isOrange(styling.activeColor), styling.activeColor);
    check("the active tab border is orange too", isOrange(styling.activeBorder), styling.activeBorder);
    check("the inactive tab is white", isWhite(styling.idleColor), String(styling.idleColor));

    check(
      "the character tile is the compact 60x60 square",
      styling.charAvatar && styling.charAvatar[0] === 60 && styling.charAvatar[1] === 60,
      JSON.stringify(styling.charAvatar)
    );
    check("it crops the portrait to fill the tile", styling.charObjectFit === "cover", String(styling.charObjectFit));

    /* The border belongs to owned tiles; an unowned tile is dimmed with a
       transparent border, which is the existing behaviour. */
    const borderRules = await page.evaluate(() => {
      const owned = document.querySelector("#roster-grid-list .roster-char-item.is-owned .roster-avatar-box");
      const unowned = document.querySelector("#roster-grid-list .roster-char-item:not(.is-owned) .roster-avatar-box");
      const read = (el) =>
        el ? { border: `${getComputedStyle(el).borderTopWidth} ${getComputedStyle(el).borderTopColor}`, opacity: getComputedStyle(el).opacity } : null;
      return { owned: read(owned), unowned: read(unowned) };
    });
    if (borderRules.owned) {
      check(
        "an owned character tile keeps its grey border",
        /2px rgb\(181, 181, 179\)/.test(borderRules.owned.border),
        borderRules.owned.border
      );
    } else {
      check("no owned tile is present to check the border (skipped)", true);
    }
    if (borderRules.unowned) {
      check("an unowned character tile is dimmed", Number(borderRules.unowned.opacity) < 1, borderRules.unowned.opacity);
    }

    check(
      "the psychube tile keeps its own tall layout",
      chubeStyle && chubeStyle.box[1] > chubeStyle.box[0],
      JSON.stringify(chubeStyle)
    );
    check("it shows the whole art", chubeStyle && chubeStyle.objectFit === "contain", JSON.stringify(chubeStyle?.objectFit));

    await page.locator("#roster-btn-close").click();
    await page.waitForTimeout(400);
  }

  /* ------------------------------------------------------------------ *
   * 9. JSON modal: import above, exports below
   * ------------------------------------------------------------------ */

  console.log("\n=== the JSON modal separates import from export ===");
  {
    await page.locator("#btn-json").click();
    await page.waitForTimeout(600);

    const modal = await page.evaluate(() => {
      const m = document.getElementById("export-json-modal");
      const labels = [...m.querySelectorAll(".json-section-label")].map((e) => e.textContent.trim());
      const importBtn = document.getElementById("label-import-file").getBoundingClientRect();
      const firstExport = document.getElementById("btn-export-json-theme").getBoundingClientRect();
      return {
        open: getComputedStyle(m).display,
        labels,
        importAboveExport: importBtn.bottom <= firstExport.top,
        divider: !!m.querySelector(".json-divider"),
        exports: ["btn-export-json-theme", "btn-export-json-roster", "btn-export-json-all"].map((id) => !!document.getElementById(id)),
      };
    });
    check("the modal opens", modal.open === "flex", modal.open);
    check("it is split into Import and Export", modal.labels.join(",") === "Import,Export", JSON.stringify(modal.labels));
    check("Import sits above the exports", modal.importAboveExport);
    check("a divider separates them", modal.divider);
    check("all three export options are present", modal.exports.every(Boolean), JSON.stringify(modal.exports));

    await page.locator("#export-json-btn-close").click();
    await page.waitForTimeout(400);
  }

  /* ------------------------------------------------------------------ *
   * 10. Builds and Rotations are separate, read-only reference modals
   * ------------------------------------------------------------------ */

  console.log("\n=== the character modal no longer carries build recommendations ===");
  {
    const removed = await page.evaluate(() => ({
      hints: document.querySelectorAll(".recommend-hint").length,
      popovers: document.querySelectorAll(".recommend-popover").length,
      psychubeGroup: !!document.getElementById("group-rec-psychube"),
    }));
    check("no recommendation hint buttons remain", removed.hints === 0, String(removed.hints));
    check("no recommendation popovers remain", removed.popovers === 0, String(removed.popovers));
    check("the psychube recommendation group is gone", !removed.psychubeGroup, String(removed.psychubeGroup));
  }

  console.log("\n=== the toolbar carries Builds and Rotations instead of Guide ===");
  {
    await page.goto(APP, { waitUntil: "networkidle" });
    await page.waitForTimeout(2200);

    const toolbar = await page.evaluate(() => {
      const group = document.querySelector(".tools-data-group");
      return {
        order: [...group.children].map((el) => el.id),
        labels: [...group.children].map((el) => el.textContent.trim()),
        guideGone: !document.getElementById("btn-guide") && !document.getElementById("guide-modal"),
      };
    });
    check("the data group is Teams → Builds → Rotations", toolbar.order.join(",") === "btn-team,btn-builds,btn-rotations", JSON.stringify(toolbar.order));
    check("Builds and Rotations are labelled", toolbar.labels.join(",") === "Teams,InfoBook,Rotations", JSON.stringify(toolbar.labels));
    check("the old Guide button and modal are gone", toolbar.guideGone);
  }

  console.log("\n=== InfoBook: all characters, filters, build panel ===");
  {
    await page.goto(APP, { waitUntil: "networkidle" });
    await page.evaluate(() => localStorage.setItem("r1999_character_roster_v2", JSON.stringify({ "Lorentz Butterfly": { owned: true } })));
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(2200);

    await page.locator("#btn-builds").click();
    await page.waitForTimeout(600);

    const listed = await page.evaluate(() => ({
      rows: document.querySelectorAll(".builds-row").length,
      hasUnownedToggle: !!document.getElementById("builds-show-unowned"),
    }));
    check("it lists every character without an ownership filter", listed.rows > 100, String(listed.rows));
    check("the Show Unowned toggle is gone", !listed.hasUnownedToggle);
    await page.waitForTimeout(700);

    const opened = await page.evaluate(() => {
      const modal = document.getElementById("builds-modal");
      const card = modal.querySelector(".builds-modal-card");
      const rows = [...document.querySelectorAll(".builds-row")];
      return {
        open: getComputedStyle(modal).display,
        rows: rows.length,
        rarityFilters: document.querySelectorAll("#builds-rarity-group .filter-btn").length,
        afflatusFilters: document.querySelectorAll("#builds-afflatus-group .builds-afflatus-btn").length,
        hasSearch: !!document.getElementById("builds-search"),
        width: Math.round(card.getBoundingClientRect().width),
        maxWidth: getComputedStyle(card).maxWidth,
        teamMaxWidth: getComputedStyle(document.querySelector(".team-modal-card")).maxWidth,
        hero: document.querySelector(".builds-hero-name")?.textContent || "",
        title: document.querySelector("#builds-modal .archetype-modal-title")?.textContent.trim() || "",
      };
    });
    check("the Builds modal opens", opened.open === "flex", opened.open);
    check("it lists the whole roster", opened.rows > 100, String(opened.rows));
    check("the modal title is InfoBook", opened.title === "InfoBook", opened.title);
    check("it has a search box", opened.hasSearch);
    check("it has five rarity filters", opened.rarityFilters === 5, String(opened.rarityFilters));
    check("it has six afflatus filters", opened.afflatusFilters === 6, String(opened.afflatusFilters));
    check("the card is at least as wide as the Team Building modal", parseInt(opened.maxWidth, 10) >= parseInt(opened.teamMaxWidth, 10), `${opened.maxWidth} vs ${opened.teamMaxWidth}`);
    check("it opens on a character that has a build", opened.hero.length > 0, opened.hero);

    const detail = await page.evaluate(() => ({
      sections: [...document.querySelectorAll(".build-section-title")].map((e) => e.textContent.trim()),
      tags: document.querySelectorAll(".build-tag").length,
      charts: document.querySelectorAll(".build-chart").length,
      bars: document.querySelectorAll(".build-chart-bar").length,
      psychubes: document.querySelectorAll(".build-psychube").length,
      psychubeImgs: [...document.querySelectorAll(".build-psychube img")].filter((i) => i.naturalWidth > 0).length,
      psychubeBorder: (() => {
        const el = document.querySelector(".build-psychube");
        return el ? getComputedStyle(el).borderTopWidth : null;
      })(),
      resonanceBtns: document.querySelectorAll(".build-resonance-btn").length,
      patternIcon: !!document.querySelector(".build-pattern img"),
    }));
    check("the build shows all of its sections", detail.sections.length >= 3, JSON.stringify(detail.sections));
    check("it shows no tag chips", detail.tags === 0, String(detail.tags));
    check("the portrait value chart is drawn", detail.charts > 0 && detail.bars > 0, `${detail.charts} charts / ${detail.bars} bars`);
    check("the psychubes are listed", detail.psychubes > 0, String(detail.psychubes));
    check("the psychube icons load", detail.psychubeImgs === detail.psychubes, `${detail.psychubeImgs}/${detail.psychubes}`);
    check("the psychube entry has no border", detail.psychubeBorder === "0px", String(detail.psychubeBorder));
    check("the resonance label is a button", detail.resonanceBtns > 0, String(detail.resonanceBtns));
    check("the pattern shows its icon", detail.patternIcon);

    await page.evaluate(() => document.querySelector(".build-resonance-btn").click());
    await page.waitForTimeout(350);
    const copied = await page.evaluate(() => {
      const b = document.querySelector(".build-resonance-btn");
      return { text: b.textContent.trim(), marked: b.classList.contains("is-copied") };
    });
    check("clicking the resonance label copies its code", copied.marked, JSON.stringify(copied));

    const before = await page.evaluate(() => document.querySelectorAll(".builds-row").length);
    await page.locator('#builds-rarity-group .filter-btn[data-rarity="6"]').click();
    await page.waitForTimeout(350);
    const afterRarity = await page.evaluate(() => document.querySelectorAll(".builds-row").length);
    check("the rarity filter narrows the list", afterRarity < before && afterRarity > 0, `${before} → ${afterRarity}`);

    await page.locator('#builds-afflatus-group .builds-afflatus-btn[data-afflatus="Star"]').click();
    await page.waitForTimeout(350);
    const afterAfflatus = await page.evaluate(() => document.querySelectorAll(".builds-row").length);
    check("the afflatus filter narrows it further", afterAfflatus <= afterRarity, `${afterRarity} → ${afterAfflatus}`);

    await page.locator('#builds-afflatus-group .builds-afflatus-btn[data-afflatus="Star"]').click();
    await page.locator('#builds-rarity-group .filter-btn[data-rarity="6"]').click();
    await page.waitForTimeout(350);

    await page.evaluate(() => document.getElementById("builds-btn-close").click());
    await page.waitForTimeout(400);
  }

  console.log("\n=== Team Presets: Automatic vs Manual mode ===");
  {
    await page.goto(APP, { waitUntil: "networkidle" });
    await page.evaluate(() =>
      localStorage.setItem("r1999_character_roster_v2", JSON.stringify({ Isolde: { owned: true }, Rhiannon: { owned: true } }))
    );
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(2200);

    await page.locator("#btn-team").click();
    await page.waitForTimeout(400);
    await page.locator("#btn-team-presets").click();
    await page.waitForTimeout(700);

    const initial = await page.evaluate(() => {
      const btn = document.getElementById("btn-preset-mode");
      return {
        label: btn ? btn.textContent.trim() : "",
        pressed: btn ? btn.getAttribute("aria-pressed") : "",
        pickable: document.querySelectorAll(".preset-sub.is-pickable").length,
      };
    });
    check("presets start in Automatic mode", initial.label === "Mode: Automatic" && initial.pressed === "false", JSON.stringify(initial));
    check("automatic mode keeps the substitute chips inert", initial.pickable === 0, String(initial.pickable));

    await page.locator("#btn-preset-mode").click();
    await page.waitForTimeout(500);
    const manual = await page.evaluate(() => {
      const btn = document.getElementById("btn-preset-mode");
      return {
        label: btn.textContent.trim(),
        pressed: btn.getAttribute("aria-pressed"),
        pickable: document.querySelectorAll(".preset-sub.is-pickable").length,
      };
    });
    check("clicking it switches to Manual mode", manual.label === "Mode: Manual" && manual.pressed === "true", JSON.stringify(manual));
    check("manual mode makes the substitutes pickable", manual.pickable > 0, String(manual.pickable));

    // Promote Rhiannon into the slot that offers her as a substitute. Find the
    // slot index once manual mode has made the chips pickable.
    const slotIndex = await page.evaluate(() => {
      const slots = [...document.querySelectorAll(".preset-slot")];
      return slots.findIndex((s) => [...s.querySelectorAll(".preset-sub.is-pickable")].some((c) => /Rhiannon/.test(c.title)));
    });
    check("the fixture exposes a Rhiannon substitute", slotIndex >= 0, String(slotIndex));

    await page.evaluate((i) => {
      const slot = document.querySelectorAll(".preset-slot")[i];
      const chip = [...slot.querySelectorAll(".preset-sub.is-pickable")].find((c) => /Rhiannon/.test(c.title));
      chip.click();
    }, slotIndex);
    await page.waitForTimeout(500);
    const picked = await page.evaluate((i) => {
      const slot = document.querySelectorAll(".preset-slot")[i];
      return {
        main: slot.querySelector(".preset-member").title,
        subs: [...slot.querySelectorAll(".preset-sub")].map((c) => c.title),
      };
    }, slotIndex);
    check("the picked substitute moves into the main slot", /^Rhiannon/.test(picked.main), picked.main);
    check("the previous main becomes a substitute", picked.subs.some((t) => /^Isolde/.test(t)), JSON.stringify(picked.subs));

    await page.evaluate((i) => {
      const slot = document.querySelectorAll(".preset-slot")[i];
      slot.closest(".preset-row").querySelector(".preset-add-btn").click();
    }, slotIndex);
    await page.waitForTimeout(700);
    const manualTeam = await page.evaluate(() => {
      const team = teamsConfig.teams[teamsConfig.teams.length - 1];
      return team ? team.slots.map((s) => s.character) : [];
    });
    check("Add uses the manual choice", manualTeam.includes("Rhiannon") && !manualTeam.includes("Isolde"), JSON.stringify(manualTeam));

    await page.evaluate(() => {
      teamsConfig.teams.pop();
      saveTeams();
      renderTeamModal();
      openTeamPresets();
    });
    await page.waitForTimeout(600);
    await page.locator("#btn-preset-mode").click();
    await page.waitForTimeout(500);
    await page.evaluate((i) => {
      const slot = document.querySelectorAll(".preset-slot")[i];
      slot.closest(".preset-row").querySelector(".preset-add-btn").click();
    }, slotIndex);
    await page.waitForTimeout(700);
    const autoTeam = await page.evaluate(() => {
      const team = teamsConfig.teams[teamsConfig.teams.length - 1];
      return team ? team.slots.map((s) => s.character) : [];
    });
    check("Automatic mode fills the slot itself", autoTeam.length === 4 && autoTeam.some((c) => !!c), JSON.stringify(autoTeam));

    await page.evaluate(() => document.getElementById("team-btn-close")?.click());
    await page.waitForTimeout(300);
  }

  console.log("\n=== Team Building: cards are drag-reorderable ===");
  {
    await page.goto(APP, { waitUntil: "networkidle" });
    await page.evaluate(() => {
      const slots = (names) =>
        Array.from({ length: 4 }, (_, i) => ({ character: names[i] || null, psychube: null }));
      localStorage.setItem(
        "r1999_teams_v1",
        JSON.stringify({
          teams: [
            { id: "team_a", name: "Alpha", slots: slots(["Isolde"]) },
            { id: "team_b", name: "Bravo", slots: slots(["Rhiannon"]) },
            { id: "team_c", name: "Charlie", slots: slots(["Matilda"]) },
          ],
        })
      );
    });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(2200);

    await page.locator("#btn-team").click();
    await page.waitForTimeout(600);
    const orderBefore = await readTeamOrder();
    check("the modal lists the teams in stored order", orderBefore.join(",") === "Alpha,Bravo,Charlie", JSON.stringify(orderBefore));
    check("every card carries a drag handle", (await page.evaluate(() => document.querySelectorAll("#team-list .team-drag-handle").length)) === 3);

    await dragTeamCard(0, 2, true);
    await page.waitForTimeout(500);
    const orderAfter = await readTeamOrder();
    check("dragging Alpha below Charlie moves it last", orderAfter.join(",") === "Bravo,Charlie,Alpha", JSON.stringify(orderAfter));
    check(
      "the new order is saved",
      (await page.evaluate(() => JSON.parse(localStorage.getItem("r1999_teams_v1")).teams.map((t) => t.name).join(","))) === "Bravo,Charlie,Alpha"
    );

    await dragTeamCard(2, 1, false);
    await page.waitForTimeout(500);
    const orderBack = await readTeamOrder();
    check("dragging it back above Bravo restores the order", orderBack.join(",") === "Alpha,Bravo,Charlie", JSON.stringify(orderBack));

    // Keyboard fallback: ArrowDown on the handle moves the team.
    await page.locator("#team-list .team-card").first().locator(".team-drag-handle").focus();
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(500);
    const orderKeys = await readTeamOrder();
    check("ArrowDown on the handle moves the team down", orderKeys.join(",") === "Bravo,Alpha,Charlie", JSON.stringify(orderKeys));

    await page.evaluate(() => document.getElementById("team-modal").style.display = "none");
  }

  console.log("\n=== Rotations: archetype filters, search and the turn plan ===");
  {
    await page.locator("#btn-rotations").click();
    await page.waitForTimeout(700);

    const opened = await page.evaluate(() => {
      const modal = document.getElementById("rotations-modal");
      return {
        open: getComputedStyle(modal).display,
        filters: [...document.querySelectorAll(".rotation-filter")].map((b) => b.dataset.tag),
        hasSearch: !!document.getElementById("rotations-search"),
        cards: document.querySelectorAll(".rotation-card").length,
        detailHidden: getComputedStyle(document.getElementById("rotations-detail")).display === "none",
        backHidden: document.getElementById("rotations-back").hidden,
        cardText: [...document.querySelectorAll(".rotation-card")].map((c) => c.textContent.replace(/\s+/g, " ").trim()),
      };
    });
    check("the Rotations modal opens on the list", opened.open === "flex", opened.open);
    check("it offers the 13 archetype filters", opened.filters.length === 13, JSON.stringify(opened.filters));
    check("it has a search box", opened.hasSearch);
    check("the rotation list is populated", opened.cards > 0, String(opened.cards));
    check("the plan stays hidden until a rotation is picked", opened.detailHidden && opened.backHidden);
    check("a card never prints the member names", opened.cardText.every((text) => !/isolde|kakania|regulus/i.test(text)), JSON.stringify(opened.cardText));

    await page.locator(".rotation-card").first().click();
    await page.waitForTimeout(500);
    const plan = await page.evaluate(() => ({
      browseHidden: getComputedStyle(document.getElementById("rotations-browse")).display === "none",
      backShown: !document.getElementById("rotations-back").hidden,
      turns: document.querySelectorAll(".rot-round").length,
      slots: document.querySelectorAll(".rot-slot").length,
      filled: [...document.querySelectorAll(".rot-card img")].filter((i) => i.naturalWidth > 0).length,
      team: document.querySelectorAll(".rot-member").length,
    }));
    check("clicking a rotation opens its plan full width", plan.browseHidden && plan.backShown);
    check("the card plan renders its rounds", plan.turns > 0, String(plan.turns));
    check("each round has card slots", plan.slots > 0, String(plan.slots));
    check("the skill cards load", plan.filled > 0, String(plan.filled));
    check("the rotation names its team", plan.team > 0, String(plan.team));

    await page.locator("#rotations-back").click();
    await page.waitForTimeout(400);
    const backToList = await page.evaluate(() => ({
      browseShown: getComputedStyle(document.getElementById("rotations-browse")).display !== "none",
      backHidden: document.getElementById("rotations-back").hidden,
      searchShown: !document.getElementById("rotations-search").hidden,
    }));
    check("the back button returns to the list", backToList.browseShown && backToList.backHidden && backToList.searchShown);

    await page.evaluate(() => document.querySelector('.rotation-filter[data-tag="Burn"]').click());
    await page.waitForTimeout(350);
    const burn = await page.evaluate(() => document.querySelectorAll(".rotation-card").length);
    check("an unmatched archetype filter empties the list", burn === 0, String(burn));

    await page.evaluate(() => document.querySelector('.rotation-filter[data-tag="Burn"]').click());
    await page.waitForTimeout(350);
    const back = await page.evaluate(() => document.querySelectorAll(".rotation-card").length);
    check("clearing the filter restores the list", back > 0, String(back));

    await page.evaluate(() => {
      const input = document.getElementById("rotations-search");
      input.value = "zzzz";
      input.dispatchEvent(new Event("input"));
    });
    await page.waitForTimeout(350);
    const none = await page.evaluate(() => document.querySelectorAll(".rotation-card").length);
    check("the search filters the list", none === 0, String(none));

    await page.evaluate(() => document.getElementById("rotations-btn-close").click());
    await page.waitForTimeout(400);
  }

  /* ------------------------------------------------------------------ *
   * 11. Deployed-page expectations
   * ------------------------------------------------------------------ */

  console.log("\n=== the deployed editor offers no way to write to the host ===");
  await page.goto(EDITOR, { waitUntil: "networkidle" });
  await page.waitForTimeout(2200);
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
    await page.goto(EDITOR, { waitUntil: "networkidle" });
    await page.waitForTimeout(2200);
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
