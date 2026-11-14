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
const LOCAL_ONLY = /^\/(?:ignore\/)?testCodeChube\//;

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
    [...document.querySelectorAll("#team-detail .card .slots")].map((cardSlots) => {
      // In the DOM, each slot is .slot followed optionally by .subs and .slot-actions as siblings
      const slots = [];
      const children = [...cardSlots.children];
      let currentSlotIndex = -1;
      for (const child of children) {
        if (child.classList.contains("slot")) {
          currentSlotIndex++;
          slots.push({ index: currentSlotIndex, subs: [] });
        } else if (child.classList.contains("subs") && currentSlotIndex >= 0) {
          slots[currentSlotIndex].subs = [...child.querySelectorAll(".sub-editor")].map(
            (row) => row.querySelector('[data-focus-key$="-char"] .name')?.textContent ?? ""
          );
        }
      }
      return slots;
    })[0] || []
  );

/** Simulates a drag of one substitute handle onto another substitute row. */
const dragSub = (fromIndex, toIndex, below, slotIndex) =>
  page.evaluate(
    ({ fromIndex, toIndex, below, slotIndex }) => {
      // Rows are scoped to one slot: find the .subs container corresponding to slotIndex
      const cardSlots = document.querySelector("#team-detail .card .slots");
      if (!cardSlots) return;
      let currentSlotIndex = -1;
      let targetSubsHost = null;
      for (const child of cardSlots.children) {
        if (child.classList.contains("slot")) {
          currentSlotIndex++;
        } else if (child.classList.contains("subs") && currentSlotIndex === slotIndex) {
          targetSubsHost = child;
          break;
        }
      }
      if (!targetSubsHost) return;
      const rows = [...targetSubsHost.querySelectorAll(".sub-editor")];
      const source = rows[fromIndex]?.querySelector(".sub-handle");
      const target = rows[toIndex];
      if (!source || !target) return;
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
  // Slot 0 has 0 substitutes, Slot 1 has 1 substitute (Rhiannon).
  // Click + Substitute on Slot 1 (the second .slot-actions) to give it 2 substitutes.
  await page.locator("#team-detail .card").first().locator(".slot-actions").nth(1)
    .locator("button", { hasText: "+ Substitute" }).click();
  await page.waitForTimeout(700);

  const allSubs = await readAllSlotSubs();
  const staged = allSubs.find((slot) => slot.subs.length >= 2);
  check("a slot now has two substitutes", !!staged, JSON.stringify(allSubs.map((s) => s.subs.length)));
  const subSlot = staged ? staged.index : 1;
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
  await page.locator("#team-detail .card .subs").nth(subSlot - 1).locator(".sub-editor button").last().click();
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
  check("only teams.json is listed", (await page.evaluate(() => document.querySelectorAll("#diff-report .diff-file").length)) === 1);

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
      // The appearance modal also uses `.manage-tabs`, so scope to the roster modal.
      const tabs = document.querySelector("#roster-modal .manage-tabs");
      // Visual left-to-right order of the sub-toolbar's first row.
      const box = (id) => {
        const el = document.getElementById(id);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right) };
      };
      return {
        manageButtons: [...document.querySelectorAll("#btn-manage-all, #btn-chubes")].map((b) => b.id),
        jsonButtons: [...document.querySelectorAll("#btn-json, #btn-export-data")].map((b) => b.id),
        resetText: (reset?.textContent ?? "").trim(),
        resetHasIcon: !!document.querySelector("#btn-roster-reset .btn-reset-icon"),
        resetInTabs: !!reset && reset.parentElement === tabs,
        resetIsLast: !!reset && tabs.lastElementChild === reset,
        resetOutsideToolbar: !document.getElementById("btn-reset-data"),
        boxes: {
          appearance: box("btn-appearance"),
          manage: box("btn-manage-all"),
          search: box("filter-search"),
          export: box("btn-export-image"),
        },
        iconOnly: ["btn-appearance", "btn-manage-all", "btn-export-image"].map((id) => {
          const b = document.getElementById(id);
          return { id, text: b.textContent.trim(), img: !!b.querySelector("img"), aria: b.getAttribute("aria-label") };
        }),
      };
    });
    check("only one Manage button exists", toolbar.manageButtons.join(",") === "btn-manage-all", toolbar.manageButtons.join(","));
    check("only one JSON button exists", toolbar.jsonButtons.join(",") === "btn-json", toolbar.jsonButtons.join(","));
    check("Reset is icon-only", toolbar.resetText === "" && toolbar.resetHasIcon, JSON.stringify(toolbar.resetText));
    check("Reset lives in the Manage tab row, right of the tabs", toolbar.resetInTabs && toolbar.resetIsLast, JSON.stringify(toolbar));
    check("the old toolbar Reset is gone", toolbar.resetOutsideToolbar);
    const b = toolbar.boxes;
    const sameRow =
      b.appearance && b.manage && b.search &&
      Math.abs(b.appearance.top - b.manage.top) <= 2 &&
      Math.abs(b.manage.top - b.search.top) <= 2;
    check(
      "the sub-toolbar reads Appearance → Manage → Search on one row",
      !!sameRow && b.appearance.right <= b.manage.left && b.manage.right <= b.search.left,
      JSON.stringify(b)
    );
    check(
      "the three actions are icon-only but still named",
      toolbar.iconOnly.every((b) => b.text === "" && b.img && !!b.aria),
      JSON.stringify(toolbar.iconOnly)
    );

    /* The ownership and rarity chips are two groups of one row; the drawer's
       hairline separator used to appear between them and must stay gone. */
    const chips = await page.evaluate(() => {
      const groups = [...document.querySelectorAll("#mainboard-toolbar .filter-btn-group")];
      const widths = (g) => [...g.querySelectorAll(".filter-btn")].map((b) => Math.round(b.getBoundingClientRect().width));
      return {
        separator: !!document.querySelector("#mainboard-toolbar .filter-group-separator"),
        adjacent: groups[0]?.nextElementSibling === groups[1],
        desktop: groups.map(widths),
        padding: getComputedStyle(groups[0].querySelector(".filter-btn")).padding,
      };
    });
    check("no separator sits between the ownership and rarity chips", !chips.separator && chips.adjacent, JSON.stringify(chips));

    /* The chips must not shrink on a narrow screen: they wrap instead. */
    await page.setViewportSize({ width: 390, height: 780 });
    await page.waitForTimeout(400);
    const narrow = await page.evaluate(() => {
      const groups = [...document.querySelectorAll("#mainboard-toolbar .filter-btn-group")];
      return {
        widths: groups.map((g) => [...g.querySelectorAll(".filter-btn")].map((b) => Math.round(b.getBoundingClientRect().width))),
        padding: getComputedStyle(groups[0].querySelector(".filter-btn")).padding,
        clipped: groups.some((g) => [...g.querySelectorAll(".filter-btn")].some((b) => b.scrollWidth > b.getBoundingClientRect().width + 1)),
        toolbarOverflow: document.getElementById("mainboard-toolbar").scrollWidth > document.getElementById("mainboard-toolbar").clientWidth + 1,
      };
    });
    check("the chips keep their desktop size when the toolbar narrows", JSON.stringify(narrow.widths) === JSON.stringify(chips.desktop), JSON.stringify([chips.desktop, narrow.widths]));
    check("their labels are never clipped", !narrow.clipped && !narrow.toolbarOverflow && narrow.padding === chips.padding, JSON.stringify(narrow));
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.waitForTimeout(400);

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
   * 8b. Appearance modal: the tab highlight follows the selected tab
   * ------------------------------------------------------------------ */

  console.log("\n=== the Appearance modal highlights the selected tab ===");
  {
    const readTabs = () =>
      page.evaluate(() =>
        [...document.querySelectorAll("#appearance-modal .appearance-tab")].map((t) => ({
          id: t.id.replace("tab-btn-", ""),
          active: t.classList.contains("active"),
          aria: t.getAttribute("aria-selected"),
          color: getComputedStyle(t).color,
          border: getComputedStyle(t).borderTopColor,
          bg: getComputedStyle(t).backgroundColor,
        }))
      );
    const oranges = (tabs) => tabs.filter((t) => /rgb\(237,\s*125,\s*49\)/.test(t.color)).map((t) => t.id);
    const activeTab = (tabs) => tabs.filter((t) => t.active).map((t) => t.id).join(",");

    await page.locator("#btn-appearance").click();
    await page.waitForTimeout(500);
    const first = await readTabs();
    check("the Appearance modal opens on Options", activeTab(first) === "options", activeTab(first));
    check("only the selected tab is orange", oranges(first).join(",") === "options", JSON.stringify(oranges(first)));

    await page.locator("#tab-btn-styling").click();
    await page.waitForTimeout(450);
    const second = await readTabs();
    check("choosing Styling moves the active state", activeTab(second) === "styling", activeTab(second));
    check("and the orange follows it, leaving Options white", oranges(second).join(",") === "styling", JSON.stringify(oranges(second)));
    check("the selected tab keeps aria-selected", second.find((t) => t.id === "styling")?.aria === "true");

    const compact = await page.evaluate(() => {
      const card = document.querySelector("#appearance-modal .appearance-modal-card");
      return Math.round(card.getBoundingClientRect().width);
    });

    await page.locator("#tab-btn-tiers").click();
    await page.waitForTimeout(450);
    const third = await readTabs();
    check("choosing Tiers moves the active state again", activeTab(third) === "tiers", activeTab(third));
    check("and only Tiers is orange", oranges(third).join(",") === "tiers", JSON.stringify(oranges(third)));

    const wide = await page.evaluate(() => {
      const card = document.querySelector("#appearance-modal .appearance-modal-card");
      return Math.round(card.getBoundingClientRect().width);
    });
    check("Tiers keeps the wide sheet", wide > compact + 150, `${wide}px vs ${compact}px`);

    /* The Manage modal shares the `.manage-tab` look; its own switch must not
       clear the Appearance tabs (that was why the highlight froze). */
    const manageUntouched = await page.evaluate(() =>
      document.querySelector("#roster-modal .manage-tab.active")?.dataset.manageTab ?? null
    );
    check("the Manage tabs were not switched by the Appearance tabs", manageUntouched === null || manageUntouched === "characters", String(manageUntouched));

    /* The highlight is the Manage modal's own look — orange label + border and
       no filled background, rather than a tinted pill of its own. */
    const tabLook = await page.evaluate(() =>
      [...document.querySelectorAll("#appearance-modal .appearance-tab")].map((t) => {
        const c = getComputedStyle(t);
        return { id: t.id.replace("tab-btn-", ""), bg: c.backgroundColor, border: c.borderTopColor, color: c.color };
      })
    );
    check(
      "the active tab has no filled background",
      tabLook.every((t) => t.bg === "rgba(0, 0, 0, 0)"),
      JSON.stringify(tabLook.map((t) => `${t.id}:${t.bg}`))
    );

    await page.locator("#appearance-btn-close").click();
    await page.waitForTimeout(300);
    const closedOnce = await page.evaluate(() => getComputedStyle(document.getElementById("appearance-modal")).display);
    check("the modal closes", closedOnce === "none", closedOnce);

    await page.locator("#btn-appearance").click();
    await page.waitForTimeout(400);
    const backToOptions = await readTabs();
    check("reopening starts on Options again", activeTab(backToOptions) === "options", activeTab(backToOptions));

    await page.locator("#appearance-btn-close").click();
    await page.waitForTimeout(300);
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
      // The redesign moved the nav links into the global navbar (`.navbar-nav`);
      // the old `.tools-data-group` wrapper no longer exists.
      const group = document.querySelector("#navbar-nav");
      const links = group ? [...group.querySelectorAll(":scope > button")] : [];
      return {
        hasGroup: !!group,
        order: links.map((el) => el.id),
        labels: links.map((el) => el.textContent.trim()),
        guideGone: !document.getElementById("btn-guide") && !document.getElementById("guide-modal"),
      };
    });
    check("the navbar carries the data group", toolbar.hasGroup);
    check(
      "the data group is Teams → Rotations → Planner → InfoBook",
      toolbar.order.join(",") === "btn-team,btn-rotations,btn-planner,btn-builds",
      JSON.stringify(toolbar.order)
    );
    check(
      "Rotations, Planner and InfoBook are labelled",
      toolbar.labels.join(",") === "Teams,Rotations,Planner,InfoBook",
      JSON.stringify(toolbar.labels)
    );
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
    // Isolde slot specifically: several presets offer Rhiannon, and which of them
    // are visible depends on the Future Sight filter.
    const slotIndex = await page.evaluate(() => {
      const slots = [...document.querySelectorAll(".preset-slot")];
      return slots.findIndex(
        (s) =>
          /^Isolde/.test(s.querySelector(".preset-member")?.title || "") &&
          [...s.querySelectorAll(".preset-sub.is-pickable")].some((c) => /Rhiannon/.test(c.title))
      );
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

    await dragTeamCard(2, 0, false);
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
    // Seed the user's rotation list so rotations are present in the list
    await page.evaluate(async () => {
      const res = await fetch("content/rotations.json");
      const data = await res.json();
      const list = (data.rotations || []).map((r) => ({ uid: `preset-${r.id}`, presetId: r.id }));
      localStorage.setItem("r1999_rotation_list_v1", JSON.stringify(list));
    });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    await page.evaluate(() => document.getElementById("btn-rotations").click());
    await page.waitForTimeout(700);

    const opened = await page.evaluate(() => {
      const modal = document.getElementById("rotations-modal");
      return {
        open: getComputedStyle(modal).display,
        filters: [...document.querySelectorAll(".rotation-filter")].map((b) => b.dataset.tag),
        hasSearch: !!document.getElementById("rotations-search"),
        cards: document.querySelectorAll(".rotation-card").length,
        detailVisible: getComputedStyle(document.getElementById("rotations-detail")).display !== "none",
        backHidden: document.getElementById("rotations-back").hidden,
        cardText: [...document.querySelectorAll(".rotation-card")].map((c) => c.textContent.replace(/\s+/g, " ").trim()),
      };
    });
    check("the Rotations modal opens on the list", opened.open === "flex", opened.open);
    check("it offers the 15 archetype filters", opened.filters.length === 15, JSON.stringify(opened.filters));
    check("it has a search box", opened.hasSearch);
    check("the rotation list is populated", opened.cards > 0, String(opened.cards));
    check("the plan is shown in side-by-side mode", opened.detailVisible && opened.backHidden);
    check("a card never prints the member names", opened.cardText.every((text) => !text.includes("Kakania") && !text.includes("Regulus")), JSON.stringify(opened.cardText));

    await page.locator(".rotation-card").first().click();
    await page.waitForTimeout(500);
    const plan = await page.evaluate(() => ({
      browseVisible: getComputedStyle(document.getElementById("rotations-browse")).display !== "none",
      detailVisible: getComputedStyle(document.getElementById("rotations-detail")).display !== "none",
      turns: document.querySelectorAll(".rot-round").length,
      slots: document.querySelectorAll(".rot-slot").length,
      filled: [...document.querySelectorAll(".rot-card img")].filter((i) => i.naturalWidth > 0).length,
      team: document.querySelectorAll(".rot-member").length,
    }));
    check("clicking a rotation renders its plan", plan.browseVisible && plan.detailVisible);
    check("the card plan renders its rounds", plan.turns > 0, String(plan.turns));
    check("each round has card slots", plan.slots > 0, String(plan.slots));
    check("the skill cards load", plan.filled > 0, String(plan.filled));
    check("the rotation names its team", plan.team > 0, String(plan.team));

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
   * 10b. Planner (event shop)
   * ------------------------------------------------------------------ */

  console.log("\n=== Planner: event shop cost calculator ===");
  {
    await page.evaluate(() => localStorage.removeItem("r1999_planner_v1"));
    await page.goto(APP, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);

    const navOrder = await page.evaluate(() =>
      [...document.querySelectorAll("#navbar-nav .nav-link")].map((el) => el.id)
    );
    const plannerAt = navOrder.indexOf("btn-planner");
    check(
      "the Planner button sits right of Rotations",
      plannerAt > 0 && navOrder[plannerAt - 1] === "btn-rotations",
      JSON.stringify(navOrder)
    );
    check(
      "the narrow-screen menu offers the Planner too",
      await page.evaluate(() => !!document.getElementById("drawer-nav-planner"))
    );

    await page.evaluate(() => document.getElementById("btn-planner").click());
    await page.waitForTimeout(600);
    const tabsInfo = await page.evaluate(() => {
      const modal = document.getElementById("planner-modal");
      const visible = (id) => {
        const el = document.getElementById(id);
        return el ? !el.hidden : null;
      };
      return {
        display: getComputedStyle(modal).display,
        tabs: [...document.querySelectorAll("#planner-modal .builds-mode-btn")].map((b) => b.id),
        active: document.querySelector("#planner-modal .builds-mode-btn.is-active")?.id || "",
        charVisible: visible("planner-pane-character"),
        eventVisible: visible("planner-pane-event"),
      };
    });
    check("the Planner modal opens", tabsInfo.display === "flex", tabsInfo.display);
    check(
      "it carries the Character tab and then the Event tab",
      tabsInfo.tabs.join(",") === "planner-tab-character,planner-tab-event",
      JSON.stringify(tabsInfo.tabs)
    );
    check(
      "it opens on the Character tab",
      tabsInfo.active === "planner-tab-character" && tabsInfo.charVisible && !tabsInfo.eventVisible,
      JSON.stringify(tabsInfo)
    );

    // Everything below is the Event tab, so switch to it once.
    const openEventTab = async () => {
      await page.evaluate(() => document.getElementById("planner-tab-event").click());
      await page.waitForTimeout(400);
    };
    await openEventTab();
    const opened = await page.evaluate(() => {
      return {
        patch: document.getElementById("planner-patch").textContent.trim(),
        total: document.getElementById("planner-total-value").textContent.trim(),
        totalColor: getComputedStyle(document.getElementById("planner-total-value")).color,
        groups: [...document.querySelectorAll(".planner-group")].map((g) => {
          const head = g.querySelector(".planner-group-head");
          const title = g.querySelector(".planner-group-title") || g.querySelector(".archetype-section-title");
          return {
            index: g.dataset.group,
            title: title.textContent.trim(),
            headClass: head.className,
            titleClass: title.className,
            cards: g.querySelectorAll(".planner-card").length,
            grid: getComputedStyle(g.querySelector(".planner-grid")).display,
          };
        }),
        money: document.getElementById("planner-total-icon").getAttribute("src"),
        moneyHidden: document.getElementById("planner-total-icon").hidden,
      };
    });

    // On a phone the InfoBook puts its tabs on a second row; the Planner should
    // read the same, with the two tabs keeping their own width instead of
    // stretching into a full-width bar under the close button.
    await page.setViewportSize({ width: 390, height: 780 });
    await page.waitForTimeout(300);
    const narrowTab = await page.evaluate(() => {
      const tabs = [...document.querySelectorAll("#planner-modal .builds-mode-btn")].map((b) =>
        b.getBoundingClientRect()
      );
      const title = document.querySelector("#planner-modal .archetype-modal-title").getBoundingClientRect();
      const header = document.querySelector("#planner-modal .archetype-modal-header").getBoundingClientRect();
      const close = document.getElementById("planner-btn-close").getBoundingClientRect();
      return {
        tabW: Math.round(tabs.reduce((n, r) => n + r.width, 0)),
        headerW: Math.round(header.width),
        belowTitle: tabs.every((r) => r.top >= title.bottom - 1),
        overlap: tabs.some((r) => r.right > close.left && r.top < close.bottom && r.bottom > close.top),
      };
    });
    check(
      "the two tabs keep their own width on a phone",
      narrowTab.tabW < narrowTab.headerW / 2,
      JSON.stringify(narrowTab)
    );
    check("they sit on their own row, like the InfoBook's tabs", narrowTab.belowTitle, JSON.stringify(narrowTab));
    check("they do not run under the close button", !narrowTab.overlap, JSON.stringify(narrowTab));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(300);
    check("it names the patch it was built from", /\d+\.\d+/.test(opened.patch), opened.patch);
    check("the shop is split into sections", opened.groups.length > 1, String(opened.groups.length));
    check(
      "the sections use the game's own names",
      opened.groups.every((g) => g.title.length > 0 && !/^Group \d+$/.test(g.title)),
      JSON.stringify(opened.groups.map((g) => g.title))
    );
    check(
      "a section bar is the Appearance modal's section header",
      opened.groups.every(
        (g) => /archetype-section-header/.test(g.headClass) && /archetype-section-title/.test(g.titleClass)
      ),
      JSON.stringify(opened.groups.map((g) => `${g.headClass} / ${g.titleClass}`))
    );
    check("every section lists items", opened.groups.every((g) => g.cards > 0), JSON.stringify(opened.groups));
    check("the items are laid out as cards", opened.groups.every((g) => g.grid === "grid"), JSON.stringify(opened.groups.map((g) => g.grid)));
    check("the event currency art resolves", !!opened.money && !opened.moneyHidden, String(opened.money));
    check("the total is a bare number", /^[\d.,\s]+$/.test(opened.total), opened.total);
    check("the total is not the glaring gold", opened.totalColor !== "rgb(245, 197, 66)", opened.totalColor);

    const art = await page.evaluate(() => {
      const imgs = [...document.querySelectorAll(".planner-card-art img")];
      return {
        count: imgs.length,
        broken: imgs.filter((i) => i.naturalWidth === 0).length,
        wild: imgs.filter((i) => i.getAttribute("src").includes("wilderness_icon")).length,
      };
    });
    check("every card draws its item art", art.count > 0 && art.broken === 0, JSON.stringify(art));
    check("the wilderness plots share the wilderness icon", art.wild > 0, JSON.stringify(art));

    // The art carries its own frame in the game, so the card draws none: no box
    // behind the icon and no border, which lets the icon itself be big.
    const chrome = await page.evaluate(() => {
      const artBox = document.querySelector(".planner-card-art");
      const cs = getComputedStyle(artBox);
      const img = artBox.querySelector("img");
      return {
        background: cs.backgroundColor,
        border: cs.borderTopWidth,
        imgW: Math.round(img.getBoundingClientRect().width),
        boxW: Math.round(artBox.getBoundingClientRect().width),
      };
    });
    check(
      "the item art has no frame of its own",
      chrome.background === "rgba(0, 0, 0, 0)" && parseFloat(chrome.border) === 0,
      JSON.stringify(chrome)
    );
    check("the item art is drawn large", chrome.imgW >= chrome.boxW - 2 && chrome.imgW >= 60, JSON.stringify(chrome));

    // The shop picker drops the OS chrome and draws its own caret, so the
    // control matches the modal instead of looking like a raw form field.
    const picker = await page.evaluate(() => {
      const sel = document.getElementById("planner-shop-select");
      const cs = getComputedStyle(sel);
      return {
        appearance: cs.appearance || cs.webkitAppearance,
        caret: /svg/.test(cs.backgroundImage),
        options: sel.options.length,
        label: sel.options[sel.selectedIndex]?.textContent.trim() || "",
      };
    });
    check("the shop picker draws its own caret", picker.appearance === "none" && picker.caret, JSON.stringify(picker));
    check("it lists every shop in the patch", picker.options >= 1 && !!picker.label, JSON.stringify(picker));

    // The toolbar reads "<label> <currency icon> <number> [reset]": the icon sits
    // left of the amount, and reset is the rightmost control.
    const row = await page.evaluate(() => {
      const tail = document.querySelector("#planner-pane-event .planner-toolbar-tail");
      const total = tail.querySelector(".planner-total");
      const icon = document.getElementById("planner-total-icon");
      const value = document.getElementById("planner-total-value");
      const reset = document.getElementById("planner-clear");
      const ico = icon.getBoundingClientRect();
      const val = value.getBoundingClientRect();
      const rst = reset.getBoundingClientRect();
      return {
        iconBeforeValue: ico.right <= val.left + 1 && ico.width > 0,
        resetRightOfTotal: rst.left >= val.right - 1,
        resetLast: tail.lastElementChild === reset,
        order: [...total.children].map((el) => el.id || el.className),
      };
    });
    check("the currency icon sits left of the total", row.iconBeforeValue, JSON.stringify(row));
    check("the reset button sits right of the currency", row.resetRightOfTotal && row.resetLast, JSON.stringify(row));

    // Each card prices itself: "<currency icon> 1000", so a card still says what
    // it costs when it is read on its own.
    const priced = await page.evaluate(() => {
      const price = document.querySelector(".planner-card-price");
      const icon = price.querySelector(".planner-cost-money");
      const value = price.querySelector(".planner-cost-value");
      return {
        hasIcon: !!icon && icon.getAttribute("src").includes("/items/icon/"),
        resolves: !!icon && icon.naturalWidth > 0,
        iconFirst: !!icon && price.firstElementChild === icon,
        iconLeft: !!icon && icon.getBoundingClientRect().right <= value.getBoundingClientRect().left + 1,
      };
    });
    check("a card prices itself with the currency icon on the left", priced.hasIcon && priced.iconFirst && priced.iconLeft, JSON.stringify(priced));
    check("the card's currency art resolves", priced.resolves, JSON.stringify(priced));

    // The Owned field names its unit the same way: "<icon> <n>" inside one box,
    // and each tooltip line reads label → art → figure.
    const owned = await page.evaluate(() => {
      const input = document.getElementById("planner-owned-input");
      const icon = document.getElementById("planner-owned-icon");
      const box = input.getBoundingClientRect();
      const ico = icon.getBoundingClientRect();
      const tip = document.getElementById("planner-owned-tooltip");
      const lines = [...tip.querySelectorAll(".planner-tooltip-line")];
      const parts = (row) =>
        [...row.children].map((el) => ({ el, r: el.getBoundingClientRect(), id: el.id || el.className }));
      const inOrder = (row) => {
        const p = parts(row);
        return p.every((item, i) => i === 0 || p[i - 1].r.right <= item.r.left + 1);
      };
      return {
        iconShown: getComputedStyle(icon).display !== "none",
        resolves: icon.naturalWidth > 0,
        inside: ico.left > box.left && ico.right <= box.right + 1,
        iconLeftOfBox: ico.left < box.left + box.width / 2,
        padLeft: parseFloat(getComputedStyle(input).paddingLeft),
        needOrder: parts(lines[0]).map((p) => p.id),
        needInOrder: inOrder(lines[0]),
        stamOrder: parts(lines[1]).map((p) => p.id),
        stamInOrder: inOrder(lines[1]),
        needText: document.getElementById("planner-tooltip-need").textContent.trim(),
        staminaIcon: lines[1].querySelector("img").getAttribute("src"),
      };
    });
    check("the Owned field draws the shop currency art inside the box", owned.iconShown && owned.resolves && owned.inside, JSON.stringify(owned));
    check("that art sits left of the number", owned.iconLeftOfBox && owned.padLeft >= 20, JSON.stringify(owned));
    check(
      "the still-need line reads label, currency art, figure",
      owned.needOrder.join(",") === "planner-tooltip-need-label,planner-tooltip-need-icon,planner-tooltip-need" && owned.needInOrder,
      JSON.stringify(owned.needOrder)
    );
    check(
      "the stamina line reads label, stamina art, figure",
      owned.stamOrder.join(",") === "planner-tooltip-stamina-label,planner-tooltip-icon,planner-tooltip-stamina" && owned.stamInOrder,
      JSON.stringify(owned.stamOrder)
    );
    check("the figure is the bare number", /^[0-9][0-9.,]*$/.test(owned.needText), owned.needText);
    check("the stamina line keeps the game's stamina art", owned.staminaIcon === "images/random_icon/Stamina.webp", owned.staminaIcon);

    // Names clamp to two lines but the box is always two lines tall, and the
    // stepper is pinned to the card's foot — so a long name cannot push its
    // stepper below a short name's.
    const align = await page.evaluate(() => {
      const cards = [...document.querySelectorAll(".planner-card")];
      const seen = new Map();
      for (const card of cards) {
        const top = Math.round(card.getBoundingClientRect().top);
        const stepper = card.querySelector(".planner-stepper").getBoundingClientRect();
        const height = Math.round(card.getBoundingClientRect().height);
        const list = seen.get(top) || { heights: [], steppers: [] };
        list.heights.push(height);
        list.steppers.push(Math.round(stepper.bottom));
        seen.set(top, list);
      }
      const rows = [...seen.values()];
      return {
        rows: rows.length,
        unevenHeights: rows.filter((r) => new Set(r.heights).size > 1).length,
        unevenSteppers: rows.filter((r) => new Set(r.steppers).size > 1).length,
        names: cards.map((c) => c.querySelector(".planner-card-name").clientHeight),
        nameHeights: [...new Set(cards.map((c) => Math.round(c.querySelector(".planner-card-name").getBoundingClientRect().height)))],
      };
    });
    check("cards on a row share one height", align.unevenHeights === 0, JSON.stringify(align));
    check("their steppers line up", align.unevenSteppers === 0, JSON.stringify(align));
    check("the name box is always two lines tall", align.nameHeights.length === 1, JSON.stringify(align.nameHeights));

    // This is a planner: an untouched capped row starts at its whole cap, and
    // its box reads "n/max" so the cap stays visible while stepping.
    const defaults = await page.evaluate(() => {
      const rows = [...document.querySelectorAll(".planner-card")].map((card) => {
        const label = card.querySelector(".planner-count").textContent.trim();
        const [countText, maxText] = label.split("/");
        const max = Number(maxText);
        return {
          uid: card.dataset.uid,
          label,
          max: Number.isFinite(max) ? max : 0,
          count: Number(countText),
          dataMax: Number(card.dataset.max),
        };
      });
      return {
        capped: rows.filter((r) => r.max > 0),
        unlimited: rows.filter((r) => r.max === 0),
        all: rows,
      };
    });
    check(
      "a capped item starts at its maximum quantity",
      defaults.capped.length > 0 && defaults.capped.every((r) => r.count === r.max),
      JSON.stringify(defaults.capped.filter((r) => r.count !== r.max).slice(0, 4))
    );
    check(
      "the quantity box shows quantity over the limit",
      defaults.capped.length > 0 && defaults.capped.every((r) => r.label === `${r.count}/${r.max}`),
      JSON.stringify(defaults.capped.slice(0, 4).map((r) => r.label))
    );
    check(
      "an unlimited item starts at zero",
      defaults.unlimited.length > 0 && defaults.unlimited.every((r) => r.count === 0),
      JSON.stringify(defaults.unlimited.map((r) => r.label))
    );

    // The opening total is the whole shop, and it is quantity x price.
    const audit = await page.evaluate(() => {
      const num = (s) => Number(String(s).replace(/[^\d]/g, ""));
      let sum = 0;
      for (const card of document.querySelectorAll(".planner-card")) {
        const count = Number(card.querySelector(".planner-count").textContent.split("/")[0]);
        sum += count * num(card.querySelector(".planner-cost-value").textContent);
      }
      return { sum, shown: num(document.getElementById("planner-total-value").textContent) };
    });
    check("the total equals quantity x price", audit.sum === audit.shown, JSON.stringify(audit));

    // A capped card: − walks it down, + walks it back, and neither passes a bound.
    const capped = await page.evaluate(() => {
      const card = [...document.querySelectorAll(".planner-card")].find((c) => Number(c.dataset.max) > 0);
      return {
        uid: card.dataset.uid,
        cap: Number(card.dataset.max),
        cost: Number(card.querySelector(".planner-cost-value").textContent.replace(/[^\d]/g, "")),
      };
    });
    const rowSel = `.planner-card[data-uid="${capped.uid}"]`;
    const readCount = (sel) =>
      page.evaluate((s) => {
        const card = document.querySelector(s);
        const label = card.querySelector(".planner-count").textContent.trim();
        return {
          label,
          count: Number(label.split("/")[0]),
          up: card.querySelector('[data-step="1"]').disabled,
          down: card.querySelector('[data-step="-1"]').disabled,
          total: Number(document.getElementById("planner-total-value").textContent.replace(/[^\d]/g, "")),
        };
      }, sel);

    const before = await readCount(rowSel);
    await page.evaluate((s) => document.querySelector(s + ' .planner-step[data-step="-1"]').click(), rowSel);
    await page.waitForTimeout(250);
    const oneDown = await readCount(rowSel);
    check("− removes one", oneDown.count === before.count - 1, `${before.label} -> ${oneDown.label}`);
    check(
      "the box counts down against the same limit",
      oneDown.label === `${oneDown.count}/${capped.cap}`,
      `${before.label} -> ${oneDown.label}`
    );
    check("the running total follows the pick", oneDown.total === before.total - capped.cost, `${before.total} -> ${oneDown.total} (unit ${capped.cost})`);
    check(
      "a stepped card keeps the plain card background",
      await page.evaluate((s) => {
        const card = document.querySelector(s);
        const base = getComputedStyle(card).backgroundColor;
        card.classList.add("is-picked");
        const tinted = getComputedStyle(card).backgroundColor;
        card.classList.remove("is-picked");
        return base === tinted;
      }, rowSel),
      "a picked card must not change colour"
    );

    await page.evaluate((s) => document.querySelector(s + ' .planner-step[data-step="1"]').click(), rowSel);
    await page.waitForTimeout(250);
    const back = await readCount(rowSel);
    check("+ puts it back", back.count === capped.cap, `${back.label} vs ${capped.cap}`);
    check("a filled cap disables +", back.up, `cap ${capped.cap}`);

    for (let i = 0; i < capped.cap + 2; i += 1) {
      await page.evaluate((s) => document.querySelector(s + ' .planner-step[data-step="-1"]').click(), rowSel);
      await page.waitForTimeout(40);
    }
    const floored = await readCount(rowSel);
    check("− never goes below zero", floored.count === 0 && floored.down, JSON.stringify(floored));
    check("a cleared box reads 0/limit", floored.label === `0/${capped.cap}`, floored.label);

    // An unlimited card (maxBuy 0) has no ceiling.
    const unlimited = await page.evaluate(() => {
      const card = [...document.querySelectorAll(".planner-card")].find((c) => Number(c.dataset.max) === 0);
      return card ? { uid: card.dataset.uid, label: card.querySelector(".planner-count").textContent.trim() } : null;
    });
    check("the shop has an unlimited card", !!unlimited, "no maxBuy 0 card rendered");
    if (unlimited) {
      const uSel = `.planner-card[data-uid="${unlimited.uid}"]`;
      for (let i = 0; i < 4; i += 1) {
        await page.evaluate((s) => document.querySelector(s + ' .planner-step[data-step="1"]').click(), uSel);
        await page.waitForTimeout(80);
      }
      const climbed = await readCount(uSel);
      check("an unlimited card keeps climbing", climbed.count === 4 && !climbed.up, JSON.stringify(climbed));
    }

    // The same product can sit in two sections at different prices; each card
    // carries its own quantity. Both start at their cap, so the check steps the
    // first one *down* and expects the second to stand still.
    const dup = await page.evaluate(() => {
      const byKey = new Map();
      for (const card of document.querySelectorAll(".planner-card")) {
        const list = byKey.get(card.dataset.key) || [];
        list.push(card.dataset.uid);
        byKey.set(card.dataset.key, list);
      }
      for (const [key, uids] of byKey) if (uids.length > 1) return { key, uids };
      return null;
    });
    check("the shop lists a product in two sections", !!dup, "no duplicated goods key rendered");
    if (dup) {
      const readPair = (uids) =>
        page.evaluate(
          (ids) =>
            ids.map((uid) =>
              Number(document.querySelector(`.planner-card[data-uid="${uid}"] .planner-count`).textContent.split("/")[0])
            ),
          uids
        );
      const pairBefore = await readPair(dup.uids);
      await page.evaluate(
        (s) => document.querySelector(s + ' .planner-step[data-step="-1"]').click(),
        `.planner-card[data-uid="${dup.uids[0]}"]`
      );
      await page.waitForTimeout(250);
      const pair = await readPair(dup.uids);
      check(
        "two slots selling the same item keep separate quantities",
        pair[0] === pairBefore[0] - 1 && pair.slice(1).every((n, i) => n === pairBefore[i + 1]),
        `${dup.key}: ${JSON.stringify(pairBefore)} -> ${JSON.stringify(pair)}`
      );
    }

    // A slot planned at zero reads as sold out: it is labelled, and it is drawn
    // after everything still on the list. A cap-1 slot sells out in one step.
    const soldUid = await page.evaluate(() => {
      const card = [...document.querySelectorAll(".planner-card")].find((c) => c.dataset.max === "1");
      const uid = card.dataset.uid;
      card.querySelector('[data-step="-1"]').click();
      return uid;
    });
    await page.waitForTimeout(250);
    const soldAfter = await page.evaluate((uid) => {
      const card = document.querySelector(`.planner-card[data-uid="${uid}"]`);
      const cards = [...card.closest(".planner-group").querySelectorAll(".planner-card")];
      return {
        soldOutClass: card.classList.contains("is-soldout"),
        label: card.querySelector(".planner-card-soldout")?.textContent.trim() || "",
        index: cards.indexOf(card),
        last: cards.length - 1,
        box: card.querySelector(".planner-count").textContent.trim(),
      };
    }, soldUid);
    check("a cleared slot reads as sold out", soldAfter.soldOutClass, JSON.stringify(soldAfter));
    check("it prints the sold-out label", soldAfter.label === "Sold Out", soldAfter.label);
    check("it shows 0/limit", /^0\/\d+$/.test(soldAfter.box), soldAfter.box);
    check(
      "a sold-out slot moves to the end of its section",
      soldAfter.index === soldAfter.last,
      `${soldAfter.index} of ${soldAfter.last}`
    );

    // Reset is an icon-only button that restores the default plan.
    const reset = await page.evaluate(() => {
      const btn = document.getElementById("planner-clear");
      return {
        text: btn.textContent.trim(),
        icon: btn.querySelector("img")?.getAttribute("src") || "",
        title: btn.title,
      };
    });
    check("the reset control is the reset icon", /reset_png\.png$/.test(reset.icon), reset.icon);
    check("it carries no text", reset.text === "", reset.text);
    check("its tooltip still names it", !!reset.title, reset.title);

    await page.evaluate(() => document.getElementById("planner-clear").click());
    await page.waitForTimeout(300);
    const afterReset = await page.evaluate(() => {
      const rows = [...document.querySelectorAll(".planner-card")].map((card) => {
        const max = Number(card.dataset.max);
        const count = Number(card.querySelector(".planner-count").textContent.split("/")[0]);
        return { max, count };
      });
      return { rows, total: document.getElementById("planner-total-value").textContent.trim(), saved: localStorage.getItem("r1999_planner_v1") };
    });
    check(
      "reset restores the default plan",
      afterReset.rows.every((r) => r.count === r.max),
      JSON.stringify(afterReset.rows.filter((r) => r.count !== r.max).slice(0, 4))
    );
    check("the reset total is not zero", !/^0$/.test(afterReset.total), afterReset.total);
    check(
      "the plan is saved with its patch",
      !!afterReset.saved && /"patch":"[\d.]+"/.test(afterReset.saved),
      String(afterReset.saved).slice(0, 120)
    );

    // Picks survive a close/reopen, and a patch change wipes them.
    await page.evaluate((s) => document.querySelector(s + ' .planner-step[data-step="-1"]').click(), rowSel);
    await page.waitForTimeout(200);
    const savedTotal = await page.evaluate(() => document.getElementById("planner-total-value").textContent.trim());
    await page.evaluate(() => document.getElementById("planner-btn-close").click());
    await page.waitForTimeout(200);
    await page.evaluate(() => document.getElementById("btn-planner").click());
    await page.waitForTimeout(400);
    await openEventTab();
    check(
      "the picks survive a close and reopen",
      (await page.evaluate(() => document.getElementById("planner-total-value").textContent.trim())) === savedTotal,
      savedTotal
    );

    // The modal reopens on the tab the reader left, so a reader working on the
    // shop does not have to press Event every single time.
    await page.evaluate(() => document.getElementById("planner-btn-close").click());
    await page.waitForTimeout(200);
    await page.evaluate(() => document.getElementById("btn-planner").click());
    await page.waitForTimeout(400);
    const reopened = await page.evaluate(() => ({
      charHidden: document.getElementById("planner-pane-character").hidden,
      eventHidden: document.getElementById("planner-pane-event").hidden,
      saved: localStorage.getItem("r1999_planner_tab_v1"),
    }));
    check(
      "it reopens on the Event tab it was left on",
      reopened.charHidden && !reopened.eventHidden && reopened.saved === "event",
      JSON.stringify(reopened)
    );

    await page.evaluate(() => {
      const blob = JSON.parse(localStorage.getItem("r1999_planner_v1"));
      blob.patch = "0.1";
      localStorage.setItem("r1999_planner_v1", JSON.stringify(blob));
    });
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1400);
    await page.evaluate(() => document.getElementById("btn-planner").click());
    await page.waitForTimeout(500);
    await openEventTab();
    const wiped = await page.evaluate(() => {
      const rows = [...document.querySelectorAll(".planner-card")].map((card) => {
        const max = Number(card.dataset.max);
        const count = Number(card.querySelector(".planner-count").textContent.split("/")[0]);
        return { max, count };
      });
      return { rows, raw: localStorage.getItem("r1999_planner_v1") };
    });
    check(
      "a new patch drops the saved plan",
      wiped.rows.every((r) => r.count === r.max),
      JSON.stringify(wiped.rows.filter((r) => r.count !== r.max).slice(0, 4))
    );
    check(
      "the stale blob is stamped with the current patch",
      !/"patch":"0\.1"/.test(String(wiped.raw)),
      String(wiped.raw).slice(0, 120)
    );

    // A language switch rebuilds the section bars and the cards in place.
    await page.evaluate(() => setLanguage("cn"));
    await page.waitForTimeout(800);
    const cn = await page.evaluate(() => ({
      title: document.querySelector("#planner-modal .archetype-modal-title").textContent.trim(),
      group: document.querySelector(".planner-group .archetype-section-title").textContent.trim(),
      total: document.querySelector(".planner-total-label").textContent.trim(),
      card: document.querySelector(".planner-card-name").textContent.trim(),
    }));
    check(
      "the Planner is translated",
      cn.title !== "Planner" && /[\u4e00-\u9fff]/.test(cn.group + cn.total + cn.card),
      JSON.stringify(cn)
    );
    await page.evaluate(() => setLanguage("en"));
    await page.waitForTimeout(600);

    await page.evaluate(() => document.getElementById("planner-btn-close").click());
    await page.waitForTimeout(200);
    check(
      "the Planner closes",
      (await page.evaluate(() => getComputedStyle(document.getElementById("planner-modal")).display)) === "none"
    );
  }

  /* ------------------------------------------------------------------ *
   * 10c. Planner (character plan and farm route)
   * ------------------------------------------------------------------ */

  console.log("\n=== Planner: character plan and farm route ===");
  {
    await page.evaluate(() => {
      localStorage.removeItem("r1999_planner_characters_v1");
      localStorage.removeItem("r1999_planner_activity_v1");
      // The modal reopens on the tab it was left on, and the section above left it
      // on Event — start this half from a clean slate so Character is the default.
      localStorage.removeItem("r1999_planner_tab_v1");
    });
    await page.goto(APP, { waitUntil: "networkidle" });
    await page.waitForTimeout(1400);
    await page.evaluate(() => document.getElementById("btn-planner").click());
    await page.waitForTimeout(600);

    // Quantities live in `data-qty` (the badge prints a compact "894k", the way the
    // InfoBook's own item sticker does), so read the exact figure.
    const readBill = (scope) =>
      page.evaluate((selector) => {
        const out = {};
        for (const card of document.querySelectorAll(`${selector} .planner-mat`)) {
          out[card.dataset.item] = Number(card.dataset.qty || 0);
        }
        return out;
      }, scope);
    const normBill = (obj) =>
      JSON.stringify(Object.entries(obj).sort((a, b) => a[0].localeCompare(b[0])));
    const sumBill = (...maps) => {
      const acc = {};
      for (const map of maps) for (const [key, value] of Object.entries(map)) acc[key] = (acc[key] || 0) + value;
      return acc;
    };
    const pickName = (name) =>
      page.evaluate((n) => document.querySelector(`#planner-picker-grid [data-pick="${n}"]`).click(), name);
    const selectChar = (name) =>
      page.evaluate((n) => document.querySelector(`#planner-char-rail [data-char="${n}"]`).click(), name);
    const setField = (field, value) =>
      page.evaluate(
        ([f, v]) => {
          const el = document.querySelector(`#planner-char-detail select[data-field="${f}"]`);
          el.value = String(v);
          el.dispatchEvent(new Event("change", { bubbles: true }));
        },
        [field, value]
      );
    const waitForRoute = async () => {
      await page.waitForFunction(() => !!document.getElementById("planner-farm-stamina"), null, {
        timeout: 25000,
      });
      await page.waitForTimeout(120);
    };

    const empty = await page.evaluate(() => {
      const rail = document.getElementById("planner-char-rail");
      const farm = document.getElementById("planner-farm");
      return {
        charVisible: !document.getElementById("planner-pane-character").hidden,
        eventVisible: !document.getElementById("planner-pane-event").hidden,
        railEmpty: (rail.querySelector(".planner-rail-empty")?.textContent || "").trim(),
        tiles: rail.querySelectorAll(".planner-char-tile").length,
        hint: document.getElementById("planner-rail-hint").textContent.trim(),
        count: document.getElementById("planner-char-count").textContent.trim(),
        farm: farm.textContent.replace(/\s+/g, " ").trim(),
        hasStamina: !!document.getElementById("planner-farm-stamina"),
        activity: document.getElementById("planner-activity-value").textContent.trim(),
        buttons: ["planner-char-add", "planner-goal-btn", "planner-char-clear", "planner-activity-btn"].every(
          (id) => !!document.getElementById(id)
        ),
        sheets: [...document.querySelectorAll("#planner-pane-character .planner-sheet")].map((s) => s.hidden),
      };
    });
    check(
      "the Character tab is the one that opens",
      empty.charVisible && !empty.eventVisible,
      JSON.stringify(empty)
    );
    check(
      "an empty plan says so instead of drawing an empty grid",
      empty.tiles === 0 && !!empty.railEmpty && empty.hint === "" && empty.count === "",
      JSON.stringify(empty)
    );
    check(
      "the farm route starts empty",
      /Nothing left to farm/.test(empty.farm) && !empty.hasStamina,
      empty.farm
    );
    check(
      "the toolbar carries the stamina setting, Add, Goal and Reset",
      empty.buttons && empty.activity === "240",
      JSON.stringify(empty)
    );
    check(
      "every panel starts closed",
      empty.sheets.length === 4 && empty.sheets.every(Boolean),
      JSON.stringify(empty.sheets)
    );

    // ---- the picker ------------------------------------------------------
    await page.evaluate(() => document.getElementById("planner-char-add").click());
    await page.waitForTimeout(300);
    const picker = await page.evaluate(() => {
      const sheet = document.getElementById("planner-picker");
      const grid = document.getElementById("planner-picker-grid");
      const tile = grid.querySelector("[data-pick]");
      const box = sheet.getBoundingClientRect();
      const pane = document.getElementById("planner-pane-character").getBoundingClientRect();
      return {
        open: !sheet.hidden,
        covers: Math.abs(box.width - pane.width) < 2 && Math.abs(box.height - pane.height) < 2,
        tiles: grid.querySelectorAll("[data-pick]").length,
        manageStyle:
          !!tile.querySelector(".roster-avatar-box") &&
          !!tile.querySelector(".roster-avatar-img") &&
          !!tile.querySelector(".roster-char-name"),
        search: !!document.getElementById("planner-picker-search"),
        chips: document.querySelectorAll("#planner-picker-rarity .filter-btn").length,
      };
    });
    check(
      "Add arcanist opens a lightbox over the whole tab",
      picker.open && picker.covers,
      JSON.stringify(picker)
    );
    check(
      "it lists the whole roster as Manage-style tiles",
      picker.tiles > 100 && picker.manageStyle && picker.search && picker.chips === 5,
      JSON.stringify(picker)
    );

    await page.evaluate(() => {
      const input = document.getElementById("planner-picker-search");
      input.value = "lucy";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForTimeout(200);
    const searched = await page.evaluate(() =>
      [...document.querySelectorAll("#planner-picker-grid [data-pick]")].map((el) => el.dataset.pick)
    );
    check(
      "the search box narrows the grid to one arcanist",
      searched.length === 1 && /^lucy$/i.test(searched[0]),
      JSON.stringify(searched)
    );
    await page.evaluate(() => {
      const input = document.getElementById("planner-picker-search");
      input.value = "";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForTimeout(150);
    const rarity = await page.evaluate(() => {
      const grid = document.getElementById("planner-picker-grid");
      const chip = document.querySelector('#planner-picker-rarity .filter-btn[data-rarity="6"]');
      const all = grid.querySelectorAll("[data-pick]").length;
      chip.click();
      const narrowed = grid.querySelectorAll("[data-pick]").length;
      const active = chip.classList.contains("active");
      chip.click();
      return { all, narrowed, active, back: grid.querySelectorAll("[data-pick]").length };
    });
    check(
      "a rarity chip narrows the grid and pressing it again widens it",
      rarity.narrowed > 0 &&
        rarity.narrowed < rarity.all &&
        rarity.active &&
        rarity.back === rarity.all,
      JSON.stringify(rarity)
    );

    // Backdrop press closes it, the way every other lightbox does.
    const backdrop = await page.evaluate(() => {
      const sheet = document.getElementById("planner-picker");
      sheet.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      return sheet.hidden;
    });
    check("a press on the backdrop closes the picker", backdrop);

    // ---- add one arcanist ------------------------------------------------
    await page.evaluate(() => document.getElementById("planner-char-add").click());
    await page.waitForTimeout(250);
    await pickName("Lucy");
    await page.waitForTimeout(400);
    const added = await page.evaluate(() => {
      const rail = document.getElementById("planner-char-rail");
      const tile = rail.querySelector(".planner-char-tile");
      const detail = document.getElementById("planner-char-detail");
      const head = detail.querySelector(".planner-char-head");
      return {
        pickerClosed: document.getElementById("planner-picker").hidden,
        editorOpen: !document.getElementById("planner-char-editor").hidden,
        title: document.getElementById("planner-editor-title").textContent.trim(),
        tiles: rail.querySelectorAll(".planner-char-tile").length,
        grid: getComputedStyle(rail).display,
        iconOnly:
          !!tile.querySelector("img") &&
          !tile.querySelector(".planner-char-tile-name") &&
          tile.textContent.trim() === "",
        selected: tile.classList.contains("is-selected"),
        headIcon: !!head?.querySelector("img"),
        hint: document.getElementById("planner-rail-hint").textContent.trim(),
        count: document.getElementById("planner-char-count").textContent.trim(),
      };
    });
    check(
      "picking an arcanist closes the picker and opens its panel",
      added.pickerClosed && added.editorOpen && /^Lucy$/.test(added.title),
      JSON.stringify(added)
    );
    check(
      "the plan is a grid of head icons and nothing else",
      added.grid === "grid" && added.tiles === 1 && added.iconOnly && added.selected && added.headIcon,
      JSON.stringify(added)
    );
    check(
      "the rail hint and the count follow the plan",
      /right-click/.test(added.hint) && /^1\b/.test(added.count),
      JSON.stringify(added)
    );

    const editor = await page.evaluate(() => {
      const detail = document.getElementById("planner-char-detail");
      const cards = [...detail.querySelectorAll(".planner-mat")];
      const first = cards[0];
      const sticker = first?.querySelector(".planner-mat-sticker");
      return {
        fields: [...detail.querySelectorAll("select[data-field]")].map((s) => `${s.dataset.field}=${s.value}`),
        caret: getComputedStyle(detail.querySelector("select[data-field]")).backgroundImage,
        quickGoal: !!document.getElementById("planner-quick-goal"),
        remove: detail.querySelectorAll("[data-remove]").length,
        euphoria: detail.querySelectorAll("[data-euphoria]").length,
        patterns: detail.querySelectorAll("[data-pattern]").length,
        glyphs: [...detail.querySelectorAll("[data-pattern] img")].map((img) => img.getAttribute("src")),
        cards: cards.length,
        noName: !detail.querySelector(".planner-mat-name"),
        sticker: !!first?.querySelector(".item-sticker-img") && !!first?.querySelector(".item-sticker-border"),
        size: sticker ? Math.round(sticker.getBoundingClientRect().width) : 0,
        badge: first?.querySelector(".item-sticker-qty")?.textContent.trim() || "",
        qty: Number(first?.dataset.qty || 0),
      };
    });
    check(
      "the panel opens on level 1 / Insight 0, built to the arcanist's cap",
      editor.fields.join(",") ===
        "curInsight=0,goalInsight=3,curLevel=1,goalLevel=60,curReso=0,goalReso=10,curMastery=0,goalMastery=0",
      JSON.stringify(editor.fields)
    );
    check(
      "its from→to controls are the dressed-up native selects",
      /^url\(/.test(editor.caret) && editor.quickGoal && editor.remove === 1,
      JSON.stringify(editor)
    );
    check(
      "the five resonance patterns draw their own glyphs",
      editor.patterns === 5 &&
        editor.glyphs.length === 5 &&
        editor.glyphs.every((src) => src && /images\/shape_pattern\//.test(src)),
      JSON.stringify(editor.glyphs)
    );
    check(
      "the bill is a wall of item stickers with no name and no card box",
      editor.cards > 10 && editor.noName && editor.sticker && editor.size >= 55 && editor.size <= 65,
      JSON.stringify(editor)
    );
    check(
      "the quantity badge is the compact form and data-qty the exact one",
      /k|m/.test(editor.badge) && editor.qty > 10000 && String(editor.qty) !== editor.badge,
      `${editor.badge} / ${editor.qty}`
    );

    // ---- quick goal, and a plan whose current state is its goal ----------
    const quick = await page.evaluate(() => {
      document.getElementById("planner-quick-goal").click();
      const detail = document.getElementById("planner-char-detail");
      return [...detail.querySelectorAll("select[data-field]")].map((s) => `${s.dataset.field}=${s.value}`);
    });
    check(
      "Quick goal lands on the can-fight-now breakpoint",
      quick.includes("goalInsight=3") && quick.includes("goalLevel=30") && quick.includes("goalReso=10"),
      JSON.stringify(quick)
    );

    const sameState = await page.evaluate(() => {
      const detail = document.getElementById("planner-char-detail");
      const set = (field, value) => {
        const el = detail.querySelector(`select[data-field="${field}"]`);
        el.value = String(value);
        el.dispatchEvent(new Event("change", { bubbles: true }));
      };
      set("curInsight", 3);
      set("curLevel", 30);
      set("curReso", 10);
      return {
        cards: detail.querySelectorAll(".planner-mat").length,
        bill: detail.querySelector(".planner-mat-grid")?.textContent.trim() || "",
        fields: [...detail.querySelectorAll("select[data-field]")].map((s) => `${s.dataset.field}=${s.value}`),
      };
    });
    check(
      "a plan whose current state is its goal bills nothing",
      sameState.cards === 0 && sameState.bill === "",
      JSON.stringify(sameState)
    );

    const picks = await page.evaluate(() => {
      const detail = document.getElementById("planner-char-detail");
      const before = detail.querySelectorAll(".planner-mat").length;
      detail.querySelector("[data-euphoria]").click();
      const withEuphoria = detail.querySelectorAll(".planner-mat").length;
      const euphoriaActive = !!detail.querySelector("[data-euphoria].is-active");
      detail.querySelector("[data-pattern]").click();
      const withPattern = detail.querySelectorAll(".planner-mat").length;
      const patternActive = !!detail.querySelector("[data-pattern].is-active");
      return { before, withEuphoria, withPattern, euphoriaActive, patternActive };
    });
    check(
      "a picked Euphoria facet and resonance pattern add their own bill",
      picks.before === 0 &&
        picks.withEuphoria > 0 &&
        picks.withPattern > picks.withEuphoria &&
        picks.euphoriaActive &&
        picks.patternActive,
      JSON.stringify(picks)
    );

    // Step the current state back down so the route has something to pay for.
    const stepped = await page.evaluate(() => {
      const detail = document.getElementById("planner-char-detail");
      const set = (field, value) => {
        const el = detail.querySelector(`select[data-field="${field}"]`);
        el.value = String(value);
        el.dispatchEvent(new Event("change", { bubbles: true }));
      };
      set("curInsight", 0);
      set("curLevel", 1);
      set("curReso", 0);
      return {
        cards: detail.querySelectorAll(".planner-mat").length,
        fields: [...detail.querySelectorAll("select[data-field]")].map((s) => `${s.dataset.field}=${s.value}`),
      };
    });
    check(
      "stepping the current state back down grows the bill again",
      stepped.cards > 10 && stepped.fields.includes("curInsight=0") && stepped.fields.includes("curReso=0"),
      JSON.stringify(stepped)
    );

    // ---- the farm route --------------------------------------------------
    await page.evaluate(() => plannerCloseSheets());
    await waitForRoute();
    const route = await page.evaluate(() => {
      const host = document.getElementById("planner-farm");
      const cards = [...host.querySelectorAll(".planner-farm-card")];
      const farmed = cards.filter((card) => !card.classList.contains("is-craft"));
      const crafted = cards.filter((card) => card.classList.contains("is-craft"));
      const heads = [...host.querySelectorAll(".archetype-section-title span")].map((el) => el.textContent);
      const total = Number(
        (document.getElementById("planner-farm-stamina").textContent || "").replace(/[^\d]/g, "")
      );
      const daysText = document.getElementById("planner-farm-days").textContent;
      const days = Number(((daysText.match(/[\d.,]+/) || ["0"])[0] || "0").replace(",", "."));
      return {
        total,
        days,
        heads,
        cards: cards.length,
        farmed: farmed.length,
        crafted: crafted.length,
        runs: cards.every((card) => Number(card.dataset.runs) >= 1),
        drops: farmed.every((card) => card.querySelectorAll(".planner-farm-drop").length > 0),
        craftSharpo: crafted.every((card) => !!card.querySelector(".planner-farm-sharpo img")),
        shop: host.querySelectorAll(".planner-farm-shop-row").length,
        shopStamina: [...host.querySelectorAll(".planner-farm-shop-row")].every(
          (row) => row.dataset.stamina !== undefined
        ),
        shopNames: [...host.querySelectorAll(".planner-farm-shop-name")].map((el) => el.textContent),
      };
    });
    check(
      "the route prices the whole bill in stamina",
      route.total > 0 && route.cards > 5 && route.farmed > 4 && route.runs && route.drops,
      JSON.stringify({ total: route.total, cards: route.cards, farmed: route.farmed, runs: route.runs, drops: route.drops })
    );
    check(
      "a crafted material shows its Sharpodonty fee instead of drops",
      route.crafted === 0 || route.craftSharpo,
      JSON.stringify({ crafted: route.crafted, sharpo: route.craftSharpo })
    );
    {
      // The stage groups come first, then the two shops the route cannot buy
      // with stamina: the picked Euphoria facet is what puts Reveries there.
      const shops = ["Oneiric Shop", "Reveries"].map((name) => route.heads.indexOf(name)).filter((i) => i > 0);
      const stages = ["Resources", "Insight materials", "Stages"]
        .map((name) => route.heads.indexOf(name))
        .filter((i) => i > 0);
      check(
        "it groups the stages the way the game does, then the shops",
        route.heads[0] === "Farm route" &&
          stages.length === 3 &&
          shops.length === 2 &&
          Math.min(...shops) > Math.max(...stages),
        JSON.stringify(route.heads)
      );
    }
    check(
      "the days are the total over the stamina a day is worth",
      Math.abs(route.days - route.total / 240) <= 0.06,
      `${route.days} vs ${route.total} / 240`
    );
    check(
      "oneiric-only materials are listed with their stamina, not farmed",
      route.shop > 0 && route.shopStamina && route.shopNames.every((name) => !!name),
      JSON.stringify(route.shopNames)
    );
    check(
      "every farmed material resolves to real art",
      await page.evaluate(() =>
        [...document.querySelectorAll("#planner-farm .planner-farm-drop .item-sticker-img")].every(
          (img) => img.complete && img.naturalWidth > 0
        )
      )
    );

    // ---- activity settings ----------------------------------------------
    const parseDays = (text) => Number(((String(text).match(/[\d.,]+/) || ["0"])[0] || "0").replace(",", "."));

    const activity = await page.evaluate(() => {
      document.getElementById("planner-activity-btn").click();
      const sheet = document.getElementById("planner-activity-sheet");
      const cost = document.getElementById("planner-activity-cost");
      const out = {
        open: !sheet.hidden,
        switches: sheet.querySelectorAll(".planner-switch").length,
        perDay: document.getElementById("planner-activity-perday").textContent.trim(),
        costHidden: cost.hidden,
        refills: document.getElementById("planner-set-refills").value,
        daysBefore: document.getElementById("planner-farm-days").textContent,
      };
      const roar = document.getElementById("planner-set-roaring");
      roar.checked = true;
      roar.dispatchEvent(new Event("change", { bubbles: true }));
      out.afterRoar = {
        perDay: document.getElementById("planner-activity-perday").textContent.trim(),
        toolbar: document.getElementById("planner-activity-value").textContent.trim(),
        days: document.getElementById("planner-farm-days").textContent,
      };
      const refills = document.getElementById("planner-set-refills");
      refills.value = "2";
      refills.dispatchEvent(new Event("change", { bubbles: true }));
      out.afterRefills = {
        perDay: document.getElementById("planner-activity-perday").textContent.trim(),
        cost: cost.textContent.trim(),
        costHidden: cost.hidden,
        toolbar: document.getElementById("planner-activity-value").textContent.trim(),
      };
      out.stored = JSON.parse(localStorage.getItem("r1999_planner_activity_v1") || "null");
      return out;
    });
    check(
      "the activity panel holds the four switches and a per-day figure",
      activity.open && activity.switches === 4 && /240/.test(activity.perDay) && activity.refills === "0",
      JSON.stringify(activity)
    );
    check(
      "with no refills there is no Clear Drops line to read",
      activity.costHidden,
      JSON.stringify(activity)
    );
    check(
      "Roaring Month pays 60 more a day and shortens the route",
      /300/.test(activity.afterRoar.perDay) &&
        activity.afterRoar.toolbar === "300" &&
        parseDays(activity.afterRoar.days) < parseDays(activity.daysBefore),
      JSON.stringify({ before: activity.daysBefore, after: activity.afterRoar.days })
    );
    check(
      "refills add 100 a day each and price themselves in Clear Drops",
      /500/.test(activity.afterRefills.perDay) &&
        activity.afterRefills.toolbar === "500" &&
        /150/.test(activity.afterRefills.cost) &&
        !activity.afterRefills.costHidden,
      JSON.stringify(activity.afterRefills)
    );
    check(
      "the settings are saved locally",
      activity.stored?.roaringMonth === true && activity.stored?.refills === 2,
      JSON.stringify(activity.stored)
    );
    await page.evaluate(() => document.querySelector('#planner-activity-sheet [data-sheet]').click());
    await page.waitForTimeout(200);

    // ---- the Goal lightbox ----------------------------------------------
    const lucyBill = await (async () => {
      await selectChar("Lucy");
      await page.waitForTimeout(250);
      return readBill("#planner-char-detail");
    })();
    const goalOne = await page.evaluate(() => {
      document.getElementById("planner-goal-btn").click();
      const sheet = document.getElementById("planner-goal-sheet");
      return { open: !sheet.hidden, cards: document.querySelectorAll("#planner-goal .planner-mat").length };
    });
    const goalOneBill = await readBill("#planner-goal");
    check(
      "Goal opens the whole plan's bill",
      goalOne.open && goalOne.cards === Object.keys(lucyBill).length && normBill(goalOneBill) === normBill(lucyBill),
      JSON.stringify({ cards: goalOne.cards, expected: Object.keys(lucyBill).length })
    );
    await page.evaluate(() => document.querySelector('#planner-goal-sheet [data-sheet]').click());
    await page.waitForTimeout(200);

    // ---- two arcanists ---------------------------------------------------
    await page.evaluate(() => document.getElementById("planner-char-add").click());
    await page.waitForTimeout(250);
    await pickName("Jessica");
    await page.waitForTimeout(400);
    const jessBill = await readBill("#planner-char-detail");
    await page.evaluate(() => {
      if (!document.getElementById("planner-char-editor").hidden) plannerCloseSheets();
    });
    const twoTiles = await page.evaluate(() => ({
      tiles: document.querySelectorAll("#planner-char-rail .planner-char-tile").length,
      count: document.getElementById("planner-char-count").textContent.trim(),
    }));
    check(
      "a second arcanist joins the grid",
      twoTiles.tiles === 2 && /^2\b/.test(twoTiles.count),
      JSON.stringify(twoTiles)
    );
    const goalTwo = await page.evaluate(() => {
      document.getElementById("planner-goal-btn").click();
      return document.querySelectorAll("#planner-goal .planner-mat").length;
    });
    const goalTwoBill = await readBill("#planner-goal");
    check(
      "the Goal bill is both arcanists summed",
      normBill(goalTwoBill) === normBill(sumBill(lucyBill, jessBill)) && goalTwo > goalOne.cards,
      JSON.stringify({ goal: Object.keys(goalTwoBill).length, expected: Object.keys(sumBill(lucyBill, jessBill)).length })
    );
    await page.evaluate(() => document.querySelector('#planner-goal-sheet [data-sheet]').click());
    await page.waitForTimeout(200);

    // ---- right-click leaves an arcanist out ------------------------------
    const disabled = await page.evaluate(() => {
      const tile = document.querySelector('#planner-char-rail [data-char="Jessica"]');
      tile.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
      const styles = getComputedStyle(document.querySelector('#planner-char-rail [data-char="Jessica"]'));
      return {
        off: document.querySelector('#planner-char-rail [data-char="Jessica"]').classList.contains("is-disabled"),
        opacity: Number(styles.opacity),
        grayscale: /grayscale/.test(styles.filter),
        stillThere: document.querySelectorAll("#planner-char-rail .planner-char-tile").length,
        goal: (() => {
          document.getElementById("planner-goal-btn").click();
          const out = {};
          for (const card of document.querySelectorAll("#planner-goal .planner-mat")) {
            out[card.dataset.item] = Number(card.dataset.qty || 0);
          }
          document.querySelector('#planner-goal-sheet [data-sheet]').click();
          return out;
        })(),
      };
    });
    check(
      "right-click dims the tile but keeps it in the grid",
      disabled.off && disabled.opacity < 0.5 && disabled.grayscale && disabled.stillThere === 2,
      JSON.stringify(disabled)
    );
    check(
      "a disabled arcanist drops out of the Goal bill",
      normBill(disabled.goal) === normBill(lucyBill),
      JSON.stringify({ goal: Object.keys(disabled.goal).length, expected: Object.keys(lucyBill).length })
    );
    const reEnabled = await page.evaluate(() => {
      const tile = document.querySelector('#planner-char-rail [data-char="Jessica"]');
      tile.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
      document.getElementById("planner-goal-btn").click();
      const out = {};
      for (const card of document.querySelectorAll("#planner-goal .planner-mat")) {
        out[card.dataset.item] = Number(card.dataset.qty || 0);
      }
      document.querySelector('#planner-goal-sheet [data-sheet]').click();
      return out;
    });
    check(
      "right-clicking it again puts it back in",
      normBill(reEnabled) === normBill(sumBill(lucyBill, jessBill)),
      JSON.stringify({ goal: Object.keys(reEnabled).length })
    );

    // ---- the plan survives a reload --------------------------------------
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1400);
    await page.evaluate(() => document.getElementById("btn-planner").click());
    await page.waitForTimeout(700);
    const restored = await page.evaluate(() => ({
      tiles: [...document.querySelectorAll("#planner-char-rail .planner-char-tile")].map(
        (el) => el.dataset.char
      ),
      disabled: document.querySelectorAll("#planner-char-rail .planner-char-tile.is-disabled").length,
      activity: document.getElementById("planner-activity-value").textContent.trim(),
      saved: localStorage.getItem("r1999_planner_characters_v1"),
    }));
    check(
      "the plan and its activity settings come back after a reload",
      restored.tiles.length === 2 &&
        restored.disabled === 0 &&
        restored.activity === "500" &&
        /"enabled":true/.test(String(restored.saved)),
      JSON.stringify(restored)
    );
    await waitForRoute();
    check(
      "and the route is solved again without a press",
      await page.evaluate(() => {
        const total = Number(
          (document.getElementById("planner-farm-stamina")?.textContent || "").replace(/[^\d]/g, "")
        );
        return total > 0;
      })
    );

    // ---- Chinese ---------------------------------------------------------
    const cnChar = await page.evaluate(async () => {
      document.querySelector('.lang-btn[data-lang="cn"]').click();
      await new Promise((r) => setTimeout(r, 500));
      return {
        tab: document.getElementById("planner-tab-character").textContent.trim(),
        add: document.getElementById("planner-char-add").textContent.trim(),
        goal: document.getElementById("planner-goal-btn").textContent.trim(),
        hint: document.getElementById("planner-rail-hint").textContent.trim(),
        title: document.querySelector("#planner-farm .archetype-section-title span").textContent,
        total: document.querySelector(".planner-farm-total-label").textContent,
        activity: document.getElementById("planner-activity-perday").textContent.trim(),
        item: document.querySelector("#planner-goal .planner-mat")?.dataset.item || "",
      };
    });
    check(
      "the Character tab is translated",
      /[\u4e00-\u9fff]/.test(cnChar.tab + cnChar.add + cnChar.goal + cnChar.hint + cnChar.title + cnChar.total + cnChar.activity),
      JSON.stringify(cnChar)
    );
    await page.evaluate(async () => {
      document.querySelector('.lang-btn[data-lang="en"]').click();
      await new Promise((r) => setTimeout(r, 400));
    });

    // ---- phones ----------------------------------------------------------
    await page.setViewportSize({ width: 390, height: 780 });
    await page.waitForTimeout(400);
    const phone = await page.evaluate(() => {
      const rail = document.getElementById("planner-char-rail");
      const column = rail.closest(".planner-char-scroll");
      const card = document.querySelector(".planner-farm-card");
      const sheet = document.getElementById("planner-activity-sheet");
      return {
        railGrid: getComputedStyle(rail).display === "grid",
        railColumns: getComputedStyle(rail).gridTemplateColumns.split(" ").length,
        oneScroller: getComputedStyle(column).overflowY === "auto",
        cardFits: card ? card.getBoundingClientRect().width <= window.innerWidth : true,
        sheetFixed: getComputedStyle(sheet).position === "fixed",
        sideways: document.documentElement.scrollWidth <= window.innerWidth + 1,
      };
    });
    check(
      "a phone keeps the icon grid and a single scrolling column",
      phone.railGrid && phone.railColumns >= 2 && phone.oneScroller && phone.cardFits && phone.sideways,
      JSON.stringify(phone)
    );
    check("the panels are real lightboxes on a phone", phone.sheetFixed, JSON.stringify(phone));
    await page.evaluate(() => document.getElementById("planner-char-add").click());
    await page.waitForTimeout(300);
    const phonePicker = await page.evaluate(() => {
      const picker = document.getElementById("planner-picker");
      const grid = document.getElementById("planner-picker-grid");
      const card = picker.querySelector(".planner-picker-card");
      return {
        position: getComputedStyle(picker).position,
        cardFits: card.getBoundingClientRect().width <= window.innerWidth,
        sideways: grid.scrollWidth > grid.clientWidth + 1,
        tiles: grid.querySelectorAll("[data-pick]").length,
        avatars: grid.querySelectorAll(".roster-avatar-box").length,
        chips: picker.querySelectorAll(".filter-btn").length,
      };
    });
    check(
      "the picker is a lightbox that fits a phone",
      phonePicker.position === "fixed" && phonePicker.cardFits,
      JSON.stringify(phonePicker)
    );
    check(
      "its roster tiles and rarity chips still render",
      phonePicker.tiles > 100 && phonePicker.avatars === phonePicker.tiles && phonePicker.chips === 5,
      JSON.stringify(phonePicker)
    );
    check("the phone grid never scrolls sideways", !phonePicker.sideways, JSON.stringify(phonePicker));
    await page.evaluate(() => document.querySelector('#planner-picker [data-sheet]').click());
    await page.waitForTimeout(200);

    // ---- reset -----------------------------------------------------------
    const cleared = await page.evaluate(() => {
      document.getElementById("planner-char-clear").click();
      return {
        tiles: document.querySelectorAll("#planner-char-rail .planner-char-tile").length,
        railEmpty: (document.querySelector(".planner-rail-empty")?.textContent || "").trim(),
        count: document.getElementById("planner-char-count").textContent.trim(),
        farm: document.getElementById("planner-farm").textContent.replace(/\s+/g, " ").trim(),
        sheets: [...document.querySelectorAll("#planner-pane-character .planner-sheet")].every((s) => s.hidden),
        saved: localStorage.getItem("r1999_planner_characters_v1"),
      };
    });
    check(
      "Reset empties the plan and closes every panel",
      cleared.tiles === 0 && !!cleared.railEmpty && cleared.count === "" && cleared.sheets,
      JSON.stringify(cleared)
    );
    check(
      "and it clears the saved plan too",
      /"chars":\[\]/.test(String(cleared.saved)),
      String(cleared.saved).slice(0, 80)
    );

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(300);
    await page.evaluate(() => document.getElementById("planner-btn-close").click());
    await page.waitForTimeout(200);
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
    check("it contains the changed file at its repository path", raw.includes("content/teams.json"), "entry name not found");

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
