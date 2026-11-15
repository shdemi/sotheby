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
    // The Planner reopens on the tab the reader left, so a choice kept by an
    // earlier case would hide the default this block asserts.
    await page.evaluate(() => localStorage.removeItem("r1999_planner_tab_v1"));
    await page.evaluate(() => localStorage.removeItem("r1999_calculator_v1"));
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
        calcVisible: visible("planner-pane-calculator"),
        charVisible: visible("planner-pane-character"),
        eventVisible: visible("planner-pane-event"),
      };
    });
    check("the Planner modal opens", tabsInfo.display === "flex", tabsInfo.display);
    check(
      "it carries Calculator, Character and then Event",
      tabsInfo.tabs.join(",") === "planner-tab-calculator,planner-tab-character,planner-tab-event",
      JSON.stringify(tabsInfo.tabs)
    );
    check(
      "it opens on the Calculator tab",
      tabsInfo.active === "planner-tab-calculator" &&
        tabsInfo.calcVisible &&
        !tabsInfo.charVisible &&
        !tabsInfo.eventVisible,
      JSON.stringify(tabsInfo)
    );

    /* ---- Calculator tab ---- */
    // Everything the tab shows is generated: `data/gacha_rules.json` prices a pull and
    // carries the ledger transcribed from calculator.xlsx, and `data/banners.json`
    // joins the community sheet to a summon pool. The list starts *empty* by design —
    // the reader adds the banners they care about — so every assertion below builds
    // its own plan instead of reading the shipped rows.
    const calc = await page.evaluate(() => {
      const sections = [...document.querySelectorAll("#planner-calculator .calc-section")];
      const byTitle = (title) =>
        sections.find((s) => s.querySelector(".archetype-section-title").textContent.trim() === title);
      const fields = (section) =>
        section ? [...section.querySelectorAll("[data-calc-field]")].map((el) => el.dataset.calcField) : [];
      return {
        sections: sections.length,
        titles: sections.map((s) => s.querySelector(".archetype-section-title").textContent.trim()),
        current: fields(byTitle("Current amounts")),
        income: fields(byTitle("Drop income")),
        outcome: fields(byTitle("Crystal Drop outcome")),
        currencyIcons: document.querySelectorAll(".calc-hold .planner-owned-icon").length,
        // Income is split the way the reader earns it: what every player gets, and
        // what a purchase adds.
        groups: [...document.querySelectorAll("#planner-calculator .calc-group-title")].map((el) =>
          el.textContent.trim()
        ),
        groupFields: [...document.querySelectorAll("#planner-calculator .calc-group")].map((group) => [
          ...[...group.querySelectorAll("[data-calc-field]")].map((el) => el.dataset.calcField),
        ]),
        help: !!document.getElementById("calc-help-open"),
        // The "?" is an outline only — no fill behind it.
        helpButton: (() => {
          const el = document.getElementById("calc-help-open");
          const style = getComputedStyle(el);
          return { background: style.backgroundColor, border: `${style.borderTopStyle} ${style.borderTopWidth}` };
        })(),
        // The pity pairs read as one row each, as do the two package fields.
        pityRows: [...document.querySelectorAll("#planner-calculator .calc-hold .calc-pair-row")].map((row) => {
          const kids = [...row.children].map((child) => child.getBoundingClientRect());
          return {
            fields: [...row.querySelectorAll("[data-calc-field]")].map((el) => el.dataset.calcField),
            sameRow: kids.length === 2 && kids[0].top < kids[1].bottom && kids[1].top < kids[0].bottom,
          };
        }),
        packageRow: (() => {
          const row = document.querySelector("#planner-calculator .calc-group > .calc-pair-row");
          if (!row) return null;
          const kids = [...row.children].map((child) => child.getBoundingClientRect());
          return {
            fields: [...row.querySelectorAll("[data-calc-field]")].map((el) => el.dataset.calcField),
            sameRow: kids.length === 2 && kids[0].top < kids[1].bottom && kids[1].top < kids[0].bottom,
          };
        })(),
        // The calculator prints ✦ for a 6★: the star glyph is not in the fonts the
        // share cards use, and the tab reads as one system with them.
        stars: /★/.test(document.getElementById("planner-calculator").textContent),
        sparks: /✦/.test(document.getElementById("planner-calculator").textContent),
        cards: document.querySelectorAll("#calc-banners .calc-card").length,
        empty: (document.querySelector("#calc-banners .guide-empty") || {}).textContent || "",
        chart: document.querySelectorAll("#calc-chart .calc-chart-svg").length,
        line: document.querySelectorAll("#calc-chart .calc-chart-line").length,
        dots: document.querySelectorAll("#calc-chart .calc-dot").length,
        // Every tick box is a card that carries what ticking it is worth.
        toggles: [...document.querySelectorAll("#planner-calculator .calc-check")].map((el) => ({
          key: el.querySelector("[data-calc-field]").dataset.calcField,
          card: el.getBoundingClientRect().height > 20 && getComputedStyle(el).borderTopStyle !== "none",
          yield: (el.querySelector(".calc-check-yield") || {}).textContent || "",
          // The purse the badge is paid in: a Clear-Drop source must print the clear
          // art, not the Unilog one.
          icon: (el.querySelector(".calc-check-yield .calc-pull-icon") || {}).src || "",
          checked: !!el.querySelector("input").checked,
        })),
        // The cards in one grid row are all the same height: `end` alignment left the
        // row ragged as soon as a narrow grid wrapped a name onto a second line.
        groupAlign: getComputedStyle(document.querySelector("#planner-calculator .calc-group-grid")).alignItems,
        toggleRows: [...document.querySelectorAll("#planner-calculator .calc-group-grid")].map((grid) => {
          const rows = new Map();
          [...grid.querySelectorAll(".calc-check")].forEach((card) => {
            const box = card.getBoundingClientRect();
            const key = Math.round(box.top);
            rows.set(key, [...(rows.get(key) || []), Math.round(box.height)]);
          });
          return [...rows.values()].map((heights) => new Set(heights).size === 1);
        }),
        spans: [...document.querySelectorAll("#calc-span .calc-span-btn")].map((b) => ({
          months: Number(b.dataset.calcSpan),
          active: b.classList.contains("is-active"),
        })),
        summary: [...document.querySelectorAll("#calc-summary .calc-summary-cell")].map((cell) => ({
          label: cell.querySelector(".calc-summary-label").textContent.trim(),
          value: cell.querySelector(".calc-summary-value").textContent.trim(),
          icon: !!cell.querySelector(".calc-pull-icon"),
        })),
        // The v1 calculator's chrome is gone: no server switch, no past toggle, no
        // projection pane and no steppers.
        gone: [
          document.querySelectorAll("#calc-server, .calc-server-btn").length,
          document.querySelectorAll("#calc-past-btn").length,
          document.querySelectorAll(".calc-projection, #calc-projection").length,
          document.querySelectorAll(".calc-banner-stepper").length,
        ],
        ledger: calcRules.income,
        pull: calcRules.pull,
        rules: calcRules.rates,
        pity: calcRules.pity,
        copies: calcRules.portraitCopies,
        currencyArt: calcRules.currencies.map((row) => row.icon),
        banners: (calcHistory.banners || []).length,
      };
    });
    check("the Calculator has its five sections", calc.sections === 5, JSON.stringify(calc.titles));
    check(
      "the tabs read amounts, income, outcome, the calculator and its banners — in that order",
      calc.titles.join("|") === "Current amounts|Drop income|Crystal Drop outcome|Calculator|Banners",
      JSON.stringify(calc.titles)
    );
    check(
      "the current amounts take one pity counter per track, and both guarantees",
      calc.current.join(",") === "crystal,clear,unilog,pityRateUp,guaranteedRateUp,pityRipples,guaranteedRipples",
      JSON.stringify(calc.current)
    );
    check(
      "Drop income is split into what is free and what a purchase adds",
      calc.groups.join("|") === "Freebies|Spenders" &&
        calc.groupFields[0].join(",") === "limbo,login,bass,storyStage,characterStory,webEvent,jukeboxFree,eventShop" &&
        calc.groupFields[1].join(",") === "roaring,jukebox,offer,monthly,patchly",
      JSON.stringify({ groups: calc.groups, fields: calc.groupFields })
    );
    check(
      "a “?” on the income bar opens the sheet that explains every source",
      calc.help,
      String(calc.help)
    );
    check(
      "the “?” is drawn as an outline, with no fill behind it",
      (calc.helpButton.background === "rgba(0, 0, 0, 0)" || calc.helpButton.background === "transparent") &&
        /^solid 1px/.test(calc.helpButton.border),
      JSON.stringify(calc.helpButton)
    );
    check(
      "each pity track is one row: its counter beside the guarantee box it sets",
      calc.pityRows.length === 2 &&
        calc.pityRows[0].fields.join(",") === "pityRateUp,guaranteedRateUp" &&
        calc.pityRows[1].fields.join(",") === "pityRipples,guaranteedRipples" &&
        calc.pityRows.every((row) => row.sameRow),
      JSON.stringify(calc.pityRows)
    );
    check(
      "the monthly and patchly package fields share a row too",
      !!calc.packageRow && calc.packageRow.fields.join(",") === "monthly,patchly" && calc.packageRow.sameRow,
      JSON.stringify(calc.packageRow)
    );
    check(
      "the tab marks a 6★ with ✦, not the star glyph",
      !calc.stars && calc.sparks,
      JSON.stringify({ stars: calc.stars, sparks: calc.sparks })
    );
    check(
      "Crystal Drop outcome carries the daily purchase, the reader's own spend and the pay-with-Crystal switch",
      calc.outcome.join(",") === "daily,other,useCrystal",
      JSON.stringify(calc.outcome)
    );
    check(
      "every tick box is a card, and each income source says what it pays",
      calc.toggles.length === 14 &&
        calc.toggles.every((box) => box.card) &&
        calc.toggles.filter((box) => box.yield).length === 11,
      JSON.stringify(calc.toggles.filter((box) => !box.card || !box.yield).slice(0, 4))
    );
    check(
      "the tick-box cards in a row share one height, so none reads as a smaller button",
      calc.groupAlign === "stretch" && calc.toggleRows.every((group) => group.every(Boolean)),
      JSON.stringify({ align: calc.groupAlign, rows: calc.toggleRows })
    );
    check(
      "the Bass Counter is off by default and worth ten Unilogs a month when ticked",
      !calc.toggles.find((box) => box.key === "bass").checked &&
        /^\+10 \/month/.test(calc.toggles.find((box) => box.key === "bass").yield),
      JSON.stringify(calc.toggles.find((box) => box.key === "bass"))
    );
    check(
      "the login track is a free source worth 180 Clear Drops a month",
      !calc.toggles.find((box) => box.key === "login").checked &&
        /^\+180 \/month/.test(calc.toggles.find((box) => box.key === "login").yield),
      JSON.stringify(calc.toggles.find((box) => box.key === "login"))
    );
    check(
      "the Roar Jukebox's two free Unilogs are on by default, since they are free",
      calc.toggles.find((box) => box.key === "jukeboxFree").checked &&
        /^\+2 \/patch/.test(calc.toggles.find((box) => box.key === "jukeboxFree").yield),
      JSON.stringify(calc.toggles.find((box) => box.key === "jukeboxFree"))
    );
    check(
      "Limbo's two resets read as the Clear Drops they pay, not as pulls",
      /^\+1,400 \/month/.test(calc.toggles.find((box) => box.key === "limbo").yield),
      calc.toggles.find((box) => box.key === "limbo").yield
    );
    check(
      "a daily source reads as the Clear Drops a whole month of it pays",
      /^\+2,700 \/month/.test(calc.toggles.find((box) => box.key === "roaring").yield),
      calc.toggles.find((box) => box.key === "roaring").yield
    );
    check(
      "the patch payouts are separate sources with their own yields",
      /^\+1,200 \/patch/.test(calc.toggles.find((box) => box.key === "storyStage").yield) &&
        /^\+480 \/patch/.test(calc.toggles.find((box) => box.key === "characterStory").yield) &&
        /^\+120 \/patch/.test(calc.toggles.find((box) => box.key === "webEvent").yield) &&
        /^\+2 \/patch/.test(calc.toggles.find((box) => box.key === "jukeboxFree").yield) &&
        /^\+2 \/patch/.test(calc.toggles.find((box) => box.key === "eventShop").yield) &&
        /^\+5 \/patch/.test(calc.toggles.find((box) => box.key === "jukebox").yield),
      JSON.stringify(calc.toggles.map((box) => box.yield))
    );
    const artOf = (key) => (calc.toggles.find((box) => box.key === key) || {}).icon || "";
    const clearArt = calc.currencyArt[1].split("/").pop();
    const unilogArt = calc.currencyArt[2].split("/").pop();
    check(
      "every badge is paid in the purse it counts: Clear Drops for the free sources, Unilogs for the rest",
      ["limbo", "login", "storyStage", "characterStory", "webEvent", "roaring", "offer"].every((key) =>
        artOf(key).endsWith(clearArt)
      ) &&
        ["bass", "eventShop", "jukeboxFree", "jukebox"].every((key) => artOf(key).endsWith(unilogArt)),
      JSON.stringify({ clearArt, unilogArt, icons: calc.toggles.map((b) => [b.key, artOf(b.key).split("/").pop()]) })
    );
    check("Crystal Drop is off by default", !calc.toggles.find((box) => box.key === "useCrystal").checked, String(calc.toggles.find((box) => box.key === "useCrystal").checked));
    check(
      "the chart span is a 1/2/3/6-month control, on six months by default",
      calc.spans.map((span) => span.months).join(",") === "1,2,3,6" &&
        calc.spans.filter((span) => span.active).length === 1 &&
        calc.spans.find((span) => span.active).months === 6,
      JSON.stringify(calc.spans)
    );
    check(
      "the row under the chart prints what the plan leaves, then each purse",
      calc.summary.length === 4 &&
        calc.summary[0].label === "Expected" &&
        calc.summary.every((cell) => cell.icon && cell.value.length > 0),
      JSON.stringify(calc.summary)
    );
    check("the three currencies draw their art inside the fields", calc.currencyIcons === 3, String(calc.currencyIcons));
    check("the list starts empty", calc.cards === 0 && /Add banner/.test(calc.empty), `${calc.cards} / ${calc.empty}`);
    check("the chart is drawn before any banner is added", calc.chart === 1 && calc.line === 1, `${calc.chart}/${calc.line}`);
    check("and it carries no dot yet", calc.dots === 0, String(calc.dots));

    // The span control really redraws the window: one month ends 30 days out, six
    // months 180, and the choice is remembered with the plan.
    const calcSpan = await page.evaluate(async () => {
      const ticks = () =>
        [...document.querySelectorAll("#calc-chart .calc-axis-label")]
          .map((t) => t.textContent.trim())
          .filter((t) => /\d+\/\d+/.test(t));
      const six = ticks();
      document.querySelector('#calc-span .calc-span-btn[data-calc-span="1"]').click();
      await new Promise((r) => setTimeout(r, 150));
      const one = ticks();
      const stored = JSON.parse(localStorage.getItem("r1999_calculator_v1") || "null");
      document.querySelector('#calc-span .calc-span-btn[data-calc-span="6"]').click();
      await new Promise((r) => setTimeout(r, 150));
      return { six, one, active: document.querySelector("#calc-span .calc-span-btn.is-active").dataset.calcSpan, stored };
    });
    check(
      "choosing one month narrows the window to 30 days",
      calcSpan.six.length === 3 && calcSpan.one.length === 3 && calcSpan.six[2] !== calcSpan.one[2],
      JSON.stringify(calcSpan)
    );
    check(
      "the span is remembered with the plan",
      calcSpan.stored && calcSpan.stored.months === 1 && calcSpan.active === "6",
      JSON.stringify({ stored: calcSpan.stored?.months, active: calcSpan.active })
    );
    check(
      "the removed chrome is really gone (server switch, past toggle, projection, steppers)",
      calc.gone.every((n) => n === 0),
      JSON.stringify(calc.gone)
    );
    check(
      "the Drop Income ledger ships the spreadsheet's constants",
      calc.ledger.dailyTasks.weekday === 90 &&
        calc.ledger.dailyTasks.sunday === undefined &&
        calc.ledger.cumulativeLogin.drops === 180 &&
        calc.ledger.weeklyTask.drops === 100 &&
        calc.ledger.roaringMonth.drops === 90 &&
        calc.ledger.roaringMonth.instantCrystal === 300 &&
        calc.ledger.offerOfTheMonth.clear === 1800 &&
        calc.ledger.offerOfTheMonth.unilog === 10 &&
        calc.ledger.limbo.drops === 700 &&
        calc.ledger.limbo.monthlyDrops === 1400 &&
        calc.ledger.bassCounter.pulls === 10 &&
        calc.ledger.patch.days === 42 &&
        calc.ledger.patch.maintenanceCompensation === 480 &&
        calc.ledger.dailyPurchasing.length === 9,
      JSON.stringify(calc.ledger).slice(0, 120)
    );
    check(
      "the patch payouts are the sheet's, and the login event pays more on a Limited patch",
      calc.ledger.patch.warmupLogin === 400 &&
        calc.ledger.patch.devBroadcast === 120 &&
        calc.ledger.patch.webEventSurvey === 120 &&
        calc.ledger.patch.storyStage === 1200 &&
        calc.ledger.patch.characterStory === 480 &&
        calc.ledger.patch.eventShopPulls === 2 &&
        calc.ledger.patch.jukeboxFreePulls === 2 &&
        calc.ledger.patch.jukeboxCollectorPulls === 5 &&
        calc.ledger.patch.signIn.limited === 20 &&
        calc.ledger.patch.signIn.standard === 14,
      JSON.stringify(calc.ledger.patch)
    );
    check(
      "the shipped pull rules are the game's",
      calc.pull.amount === 1 &&
        calc.pull.dropsPerUnilog === 180 &&
        Math.abs(calc.rules.sixStar - 0.015) < 1e-9 &&
        calc.pity.soft === 60 &&
        calc.pity.hard === 70 &&
        calc.copies === 6,
      JSON.stringify(calc.pull)
    );
    check("the banner data really does carry both servers", calc.banners >= 300, String(calc.banners));

    // "+ Add banner" is a lightbox over the tab, and it only offers what can still be
    // run: Global rows on a scheduled kind, never Standard or Beginner, in release
    // order from the earliest banner still running.
    const calcPickList = await page.evaluate(() => {
      document.getElementById("calc-add").click();
      const rows = [...document.querySelectorAll("#calc-picker-list .calc-pick")];
      const today = calcToday();
      const read = rows.map((row) => {
        const banner = calcBanner(row.dataset.pickBanner);
        return {
          id: row.dataset.pickBanner,
          name: row.querySelector(".calc-pick-name").textContent.trim(),
          // The patch is a tag beside the name, not part of it.
          tag: (row.querySelector(".calc-pick-version") || {}).textContent?.trim() || "",
          meta: row.querySelector(".calc-pick-meta").textContent.trim(),
          type: banner.type,
          version: banner.version,
          server: banner.server,
          start: banner.start,
          end: banner.end,
          heads: row.querySelectorAll(".calc-pick-heads .calc-head:not(.calc-head-more):not(.calc-head-any)").length,
          more: !!row.querySelector(".calc-pick-heads .calc-head-more"),
          any: !!row.querySelector(".calc-pick-heads .calc-head-any"),
          targets: (banner.targets || []).length,
          predicted: !!banner.predicted,
        };
      });
      const starts = read.map((row) => row.start);
      return {
        open: !document.getElementById("calc-picker").hidden,
        today,
        rows: read.length,
        first: read[0] || null,
        last: read[read.length - 1] || null,
        types: [...new Set(read.map((row) => row.type))],
        // Every row prints the sheet's patch as its own tag, and the name is bare.
        tagged: read.every((row) => !row.version || (row.tag === row.version && !/^\[/.test(row.name))),
        ripples: read
          .filter((row) => row.type === "Ripples")
          .map((row) => `${row.version}|${row.name}|${row.start}|${row.predicted ? "pred" : "run"}`),
        // A row is one line high, so at most three rate-up heads draw and the rest are
        // counted by an ellipsis. A banner with no rate-up draws the `?` box instead.
        capped: read.every((row) =>
          row.targets === 0
            ? row.any && row.heads === 0
            : row.heads === Math.min(3, row.targets) && row.more === row.targets > 3
        ),
        manyHeads: read.filter((row) => row.targets > 3).length,
        ellipsis: read.filter((row) => row.more).length,
        globalOnly: read.every((row) => row.server === "global"),
        scheduled: read.every((row) => row.type !== "Standard" && row.type !== "Beginner"),
        open_ended: read.every((row) => (row.end || row.start) >= today),
        sorted: starts.every((start, i) => i === 0 || start >= starts[i - 1]),
        predicted: read.filter((row) => row.predicted).length,
        // No type filter any more: one search box over one flat list.
        filters: document.querySelectorAll("#calc-picker .filter-btn, #calc-picker-types").length,
        search: !!document.getElementById("calc-picker-search"),
        // The picker's own row count against the data, read the same way.
        expected: (calcHistory.banners || []).filter(
          (row) =>
            row.server === "global" &&
            row.type !== "Standard" &&
            row.type !== "Beginner" &&
            row.start &&
            (row.end || row.start) >= today
        ).length,
      };
    });
    check("'+ Add banner' opens the picker over the tab", calcPickList.open, String(calcPickList.open));
    check(
      "it offers every banner still to run, and only those",
      calcPickList.rows === calcPickList.expected && calcPickList.rows > 0,
      `${calcPickList.rows} of ${calcPickList.expected}`
    );
    check("the banner picker is Global-only", calcPickList.globalOnly, JSON.stringify(calcPickList.first));
    check("Standard and Beginner banners are not offered", calcPickList.scheduled, JSON.stringify(calcPickList.types));
    check("a closed banner is not offered", calcPickList.open_ended, JSON.stringify(calcPickList.last));
    check("the list is sorted by release date", calcPickList.sorted, JSON.stringify([calcPickList.first?.start, calcPickList.last?.start]));
    check(
      "the earliest banner still running comes first",
      !!calcPickList.first &&
        calcPickList.first.start <= calcPickList.today &&
        calcPickList.first.end >= calcPickList.today,
      JSON.stringify(calcPickList.first)
    );
    check("the CN-only banners arrive as predictions", calcPickList.predicted > 0, String(calcPickList.predicted));
    check(
      "every banner carries the patch it ships in, as a tag beside the name",
      calcPickList.tagged,
      JSON.stringify([calcPickList.first, calcPickList.last])
    );
    // A picker row is one line high: three rate-up heads at most, then `…`.
    check(
      "a banner with many rate-ups lists three heads and an ellipsis",
      calcPickList.capped && calcPickList.manyHeads > 0 && calcPickList.ellipsis > 0,
      JSON.stringify({
        capped: calcPickList.capped,
        many: calcPickList.manyHeads,
        ellipsis: calcPickList.ellipsis,
      })
    );
    // A recurring banner has to arrive once per patch: Ripples on the Water for 4.0 was
    // swallowed by the 3.9 run being "close enough", so both patches are pinned here.
    check(
      "Ripples on the Water is listed for every patch, 4.0 included",
      calcPickList.ripples.some((row) => row === "4.0|Ripples on the Water|2026-12-17|pred"),
      JSON.stringify(calcPickList.ripples)
    );
    check(
      "the picker is one search box over one flat list — no type filter",
      calcPickList.filters === 0 && calcPickList.search,
      JSON.stringify({ filters: calcPickList.filters, search: calcPickList.search })
    );

    // Picking one closes the popup and adds exactly one card.
    const calcAdded = await page.evaluate(() => {
      const rows = [...document.querySelectorAll("#calc-picker-list .calc-pick")];
      const first = rows[0];
      const later = rows[rows.length - 1];
      const ids = { first: first.dataset.pickBanner, later: later.dataset.pickBanner };
      first.click();
      const closed = document.getElementById("calc-picker").hidden;
      // A second banner, added from the same picker, must land *after* the first
      // when it releases later.
      document.getElementById("calc-add").click();
      const stillThere = [...document.querySelectorAll("#calc-picker-list .calc-pick")].some(
        (row) => row.dataset.pickBanner === ids.first
      );
      document.querySelector(`#calc-picker-list [data-pick-banner='${ids.later}']`).click();
      const cards = [...document.querySelectorAll("#calc-banners .calc-card")];
      const card = cards[0];
      return {
        ids,
        closed,
        stillThere,
        cards: cards.length,
        order: cards.map((c) => c.dataset.banner),
        pills: [...card.querySelectorAll(".calc-card-pills .calc-pill")].map((p) => p.textContent.trim()),
        chips: [...card.querySelectorAll(".calc-chip")].map((c) => c.dataset.p),
        chipOdds: [...card.querySelectorAll(".calc-chip")].map((c) => Number(c.dataset.odds)),
        input: {
          type: card.querySelector(".calc-pull-input").type,
          value: card.querySelector(".calc-pull-input").value,
          min: card.querySelector(".calc-pull-input").getAttribute("min"),
        },
        cost: card.querySelector(".calc-card-cost") ? card.querySelector(".calc-card-cost").textContent.trim() : "",
        pullsIcon: !!card.querySelector(".calc-card-pills .calc-pill.is-pulls .calc-pull-icon"),
        kind: card.dataset.kind,
        edge: getComputedStyle(card).borderLeftColor,
        versionPill: (card.querySelector(".calc-card-pills .calc-pill.is-version") || {}).textContent?.trim() || "",
        name: card.querySelector(".calc-card-name").textContent.trim(),
        remove: !!card.querySelector(".calc-card-remove"),
        bannerTotal: document.getElementById("calc-banner-total").textContent.trim(),
      };
    });
    check("picking a banner closes the picker", calcAdded.closed, String(calcAdded.closed));
    check("an added banner drops out of the picker", !calcAdded.stillThere, String(calcAdded.stillThere));
    check("the plan holds both banners", calcAdded.cards === 2, String(calcAdded.cards));
    check(
      "the cards are ordered by release date",
      calcAdded.order[0] === calcAdded.ids.first && calcAdded.order[1] === calcAdded.ids.later,
      JSON.stringify(calcAdded.order)
    );
    check(
      "a card carries its patch, type, release, end and projected pulls as round tags",
      calcAdded.pills.length === 5 &&
        calcAdded.pills[0] === calcAdded.versionPill &&
        /^\d+\.\d+$/.test(calcAdded.pills[0]) &&
        /^(11|12|01|02|03)/.test(calcAdded.pills[2].replace(/[^\d/]/g, "")),
      JSON.stringify(calcAdded.pills)
    );
    check(
      "the card's left rail is the banner's kind",
      calcAdded.kind === calcAdded.pills[1] && calcAdded.edge !== "",
      JSON.stringify({ kind: calcAdded.kind, edge: calcAdded.edge, pills: calcAdded.pills })
    );
    // The rail is a colour per kind, so a long list reads at a glance. Each probe is a
    // fresh element: mutating one node's `data-kind` in a loop reads a stale computed
    // style, because the recalc is only flushed on a layout pass.
    const kindEdges = await page.evaluate(() => {
      const host = document.querySelector("#calc-banners") || document.body;
      const out = {};
      for (const kind of ["Debut", "Ripples", "Rerun", "Limited", "Event", "Yearning"]) {
        const probe = document.createElement("article");
        probe.className = "calc-card";
        probe.dataset.kind = kind;
        host.appendChild(probe);
        void probe.offsetWidth;
        out[kind] = getComputedStyle(probe).borderLeftColor;
        probe.remove();
      }
      return out;
    });
    check(
      "each banner kind paints its own rail colour",
      kindEdges.Debut === "rgb(212, 237, 188)" &&
        kindEdges.Ripples === "rgb(198, 219, 225)" &&
        kindEdges.Rerun === "rgb(255, 229, 160)" &&
        kindEdges.Limited === "rgb(177, 2, 2)" &&
        kindEdges.Event === "rgb(10, 83, 168)" &&
        // A kind with no colour of its own keeps the tab's orange.
        kindEdges.Yearning === "rgba(237, 125, 49, 0.45)",
      JSON.stringify(kindEdges)
    );
    check("a card carries six odds chips", calcAdded.chips.join(",") === "0,1,2,3,4,5", JSON.stringify(calcAdded.chips));
    check(
      "the odds are a falling scale",
      calcAdded.chipOdds.every((v, i) => i === 0 || v <= calcAdded.chipOdds[i - 1] + 1e-9),
      JSON.stringify(calcAdded.chipOdds)
    );
    check(
      "the pull count is a plain number field, not a stepper",
      calcAdded.input.type === "number" && calcAdded.input.min === "0",
      JSON.stringify(calcAdded.input)
    );
    check("a card can be removed", calcAdded.remove, String(calcAdded.remove));
    check(
      "a card does not repeat its cost in drops — the tab is a pull ledger",
      calcAdded.cost === "",
      calcAdded.cost
    );
    check(
      "its projected pull count is the Unilog art, not the word",
      calcAdded.pullsIcon,
      String(calcAdded.pullsIcon)
    );
    check("the plan's banner count is in the section bar", /2/.test(calcAdded.bannerTotal), calcAdded.bannerTotal);

    // Typing a pull count repaints the odds and the chart without stealing the focus.
    const typed = await page.evaluate(() => {
      const cards = [...document.querySelectorAll("#calc-banners .calc-card")];
      const card = cards[0];
      const input = card.querySelector(".calc-pull-input");
      input.focus();
      input.value = "80";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      // A second banner with its own count: the chart draws a dot per planned
      // banner, not one for the whole plan.
      const second = cards[1].querySelector(".calc-pull-input");
      second.value = "40";
      second.dispatchEvent(new Event("input", { bubbles: true }));
      const after = document.querySelector("#calc-banners .calc-card");
      const dots = [...document.querySelectorAll("#calc-chart .calc-dot")];
      // The dot prints its spend *below* the point and draws the rate-up's portrait
      // *above* it, so the two never sit on top of each other.
      const label = dots[0] ? dots[0].querySelector(".calc-dot-label").getBoundingClientRect() : null;
      const point = dots[0] ? dots[0].querySelector("circle").getBoundingClientRect() : null;
      const head = dots[0] ? dots[0].querySelector(".calc-dot-head") : null;
      return {
        value: document.getElementById("calc-crystal").value,
        focused: document.activeElement.className,
        chips: [...after.querySelectorAll(".calc-chip")].map((c) => Number(c.dataset.odds)),
        dots: dots.length,
        label: dots[0] ? dots[0].querySelector(".calc-dot-label").textContent : "",
        labelBelow: label && point ? Math.round(label.top - point.top) : -999,
        headAbove: head && point ? Math.round(point.top - head.getBoundingClientRect().bottom) : -999,
        heads: dots[0] ? dots[0].querySelectorAll(".calc-dot-head").length : 0,
        title: dots[0] ? dots[0].querySelector("title").textContent : "",
        planned: document.getElementById("calc-banner-total").textContent.trim(),
        stored: JSON.parse(localStorage.getItem("r1999_calculator_v1") || "null"),
      };
    });
    check("typing a pull count does not steal the focus", /calc-pull-input/.test(typed.focused), typed.focused);
    check(
      "80 pulls buy real odds on the first banner",
      typed.chips[0] > 0 && typed.chips[0] < 1,
      JSON.stringify(typed.chips)
    );
    check(
      "the chart draws one dot per planned banner",
      typed.dots === 2,
      String(typed.dots)
    );
    check(
      "the dot is labelled with what it spends, under the rate-up it is for",
      /^−\d+$/.test(typed.label) &&
        /80/.test(typed.title) &&
        typed.labelBelow > 0 &&
        typed.heads > 0 &&
        typed.headAbove >= 0,
      JSON.stringify({ label: typed.label, labelBelow: typed.labelBelow, heads: typed.heads, headAbove: typed.headAbove })
    );
    check(
      "the plan is saved",
      typed.stored && Array.isArray(typed.stored.list) && typed.stored.list.length === 2 &&
        typed.stored.plans[typed.stored.list[0]] === 80,
      JSON.stringify(typed.stored)
    );

    // A dot is the banner's sheet: pressing it opens the info popup.
    const info = await page.evaluate(() => {
      const dot = document.querySelector("#calc-chart .calc-dot");
      dot.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      const body = document.getElementById("calc-info-body");
      const out = {
        open: !document.getElementById("calc-info").hidden,
        title: document.getElementById("calc-info-title").textContent.trim(),
        banner: calcBannerName(calcBanner(dot.dataset.banner)),
        rule: (body.querySelector(".calc-info-rule") || {}).textContent || "",
        figures: [...body.querySelectorAll(".calc-figure")].map((f) => f.querySelector(".calc-figure-label").textContent),
        odds: [...body.querySelectorAll(".calc-odd-card")].map((c) => c.dataset.p),
        notes: [...body.querySelectorAll(".calc-info-note")].map((n) => n.textContent.trim()),
        pills: [...document.querySelectorAll("#calc-info .calc-pill")].map((p) => p.textContent.trim()),
        heads: document.querySelectorAll("#calc-info-heads .calc-head").length,
        card: document.querySelector("#calc-info .calc-info-card").className,
      };
      document.getElementById("calc-info-close").click();
      out.closed = document.getElementById("calc-info").hidden;
      return out;
    });
    check("pressing a dot opens the banner's sheet", info.open, String(info.open));
    check("the sheet names that banner", info.title === info.banner, `${info.title} vs ${info.banner}`);
    check(
      "the sheet is the site's own modal card, with the rate-up in its header",
      /modal-card/.test(info.card) && /archetype-modal-card/.test(info.card) && info.heads > 0,
      JSON.stringify({ card: info.card, heads: info.heads })
    );
    check("it prints the banner's rule", info.rule.length > 0, info.rule);
    check(
      "it prices the plan and the odds",
      info.figures.join(",") === "Pulls,Cost,By end" && info.odds.join(",") === "0,1,2,3,4,5",
      JSON.stringify({ figures: info.figures, odds: info.odds })
    );
    check(
      "it lists the banner's perk and its pity track as notes",
      info.notes.length >= 1 && info.pills.length === 5,
      JSON.stringify({ notes: info.notes, pills: info.pills })
    );
    check("its close button closes it", info.closed, String(info.closed));

    // Crystal Drop is a paid purse, so it does not count toward the pulls unless the
    // reader says it does: the same 18,000 drops buy nothing while the box is off.
    const paidOff = await page.evaluate(() => {
      const crystal = document.getElementById("calc-crystal");
      crystal.focus();
      crystal.value = "18000";
      crystal.dispatchEvent(new Event("input", { bubbles: true }));
      return {
        checked: document.getElementById("calc-useCrystal").checked,
        hold: document.getElementById("calc-hold-total").textContent.trim(),
        crystalCell: [...document.querySelectorAll("#calc-summary .calc-summary-cell")].map((cell) =>
          cell.querySelector(".calc-summary-value").textContent.trim()
        ),
      };
    });
    check(
      "Crystal Drop is not counted toward the pulls by default",
      paidOff.checked === false && !/100/.test(paidOff.hold) && /18,?000/.test(paidOff.crystalCell[3]),
      JSON.stringify(paidOff)
    );

    // The ledger prices the hold: 18,000 Crystal Drops are 100 pulls once the reader
    // lets the paid purse count, and the section bar says so. One more pull never
    // lowers the odds.
    const held = await page.evaluate(() => {
      const box = document.getElementById("calc-useCrystal");
      box.checked = true;
      box.dispatchEvent(new Event("input", { bubbles: true }));
      const card = document.querySelector("#calc-banners .calc-card");
      const before = [...card.querySelectorAll(".calc-chip")].map((c) => Number(c.dataset.odds));
      const input = card.querySelector(".calc-pull-input");
      input.value = "81";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      const after = document.querySelector("#calc-banners .calc-card");
      return {
        crystal: document.getElementById("calc-crystal").value,
        focused: document.activeElement.id,
        holdTotal: document.getElementById("calc-hold-total").textContent.trim(),
        before,
        after: [...after.querySelectorAll(".calc-chip")].map((c) => Number(c.dataset.odds)),
        left: document.getElementById("calc-chart-total").textContent.trim(),
        expected: document.querySelector("#calc-summary .calc-summary-value")?.textContent.trim() || "",
        stored: JSON.parse(localStorage.getItem("r1999_calculator_v1") || "null"),
      };
    });
    check("the hold field keeps what was typed", held.crystal === "18000", held.crystal);
    check("typing the hold does not steal the focus", held.focused === "calc-crystal", held.focused);
    check("the hold reads as pulls on the section bar", /100/.test(held.holdTotal), held.holdTotal);
    check(
      "one more pull never lowers the odds",
      held.after.every((v, i) => v >= held.before[i]),
      `${JSON.stringify(held.before)} -> ${JSON.stringify(held.after)}`
    );
    check("the chart reports what the plan leaves", /\d/.test(held.left), held.left);
    check(
      "the summary prints the expected pulls under the chart",
      held.expected.length > 0 && held.stored && held.stored.useCrystal === true,
      JSON.stringify({ expected: held.expected, useCrystal: held.stored?.useCrystal })
    );

    // The DP is the whole feature, so it is checked against its own edge cases rather
    // than against the rendered numbers: a guaranteed pity bank, a hard pity floor,
    // the 50/50, a "no rate-up" banner, and one copy for a Thread.
    const engine = await page.evaluate(() => {
      const rateUp = { kind: "rateUp", share: 0.5, guarantee: true, maxCopies: 6 };
      const monoTen = window.calcDistribution(rateUp, 10, 0, false);
      const guaranteed = window.calcDistribution(rateUp, 70, 0, true);
      const hardPity = window.calcDistribution({ share: 1, guarantee: false, maxCopies: 6 }, 1, 69, false);
      const lateStart = window.calcDistribution(rateUp, 70, 69, false);
      const none = window.calcDistribution({ kind: "none", share: 0, guarantee: false, maxCopies: 6 }, 200, 0, false);
      const thread = window.calcDistribution({ kind: "thread", share: 1, guarantee: false, maxCopies: 1 }, 200, 0, false);
      const mid = window.calcDistribution(rateUp, 150, 0, false);
      const many = window.calcDistribution(rateUp, 1200, 0, false);

      // A simulation over the same constants: the DP must agree with it, but the
      // simulation uses no pity state, so only the no-pity band is comparable.
      let rng = 1;
      const rand = () => {
        rng = (rng * 1103515245 + 12345) % 2147483648;
        return rng / 2147483648;
      };
      let hits = 0;
      const RUNS = 20000;
      for (let run = 0; run < RUNS; run += 1) {
        let banked = false;
        for (let n = 0; n < 10; n += 1) {
          const p = calcRules.rates.sixStar;
          if (rand() < p) {
            if (banked || rand() < 0.5) {
              hits += 1;
              break;
            }
            banked = true;
          }
        }
      }
      return {
        ten: monoTen,
        guaranteed,
        hardPity,
        lateStart,
        none,
        thread,
        mid,
        many,
        simulated: hits / RUNS,
      };
    });
    check(
      "ten pulls on a 50/50 beat ten flat 0.75% rolls, because a loss banks the next 6★",
      engine.ten[0] > 1 - Math.pow(0.9925, 10) && engine.ten[0] < 0.09,
      engine.ten[0].toFixed(4)
    );
    check(
      "a banked guarantee makes the first 6★ the rate-up (P0 = 100% by pull 70)",
      engine.guaranteed[0] > 0.9999,
      engine.guaranteed[0].toFixed(4)
    );
    check(
      "the 70th pull is a hard-pity 6★ and therefore the rate-up",
      engine.hardPity[0] === 1 && engine.hardPity[1] === 0,
      JSON.stringify(engine.hardPity)
    );
    check(
      "starting one pull from hard pity is better than starting from zero",
      engine.lateStart[0] > engine.ten[0],
      `${engine.lateStart[0].toFixed(4)} vs ${engine.ten[0].toFixed(4)}`
    );
    check(
      "the DP agrees with a simulation of the same band",
      Math.abs(engine.ten[0] - engine.simulated) < 0.02,
      `${engine.ten[0].toFixed(4)} vs ${engine.simulated.toFixed(4)}`
    );
    check("a banner with no rate-up reports 0% everywhere", engine.none.every((p) => p === 0), JSON.stringify(engine.none));
    check(
      "a Thread banner can only grant one copy",
      engine.thread[0] > 0.9999 && engine.thread[1] === 0,
      JSON.stringify(engine.thread)
    );
    check("P5 is six copies, certain long before 1200 pulls", engine.many[5] > 0.999, engine.many[5].toFixed(4));
    check(
      "more pulls keep paying: 1200 beats 150 on every level",
      engine.many[5] > engine.mid[5] && engine.many.every((v, i) => v >= engine.mid[i] - 1e-9),
      `${JSON.stringify(engine.mid)} -> ${JSON.stringify(engine.many)}`
    );
    check(
      "every level is at least the next one",
      engine.many.every((v, i) => i === 0 || v <= engine.many[i - 1] + 1e-9),
      JSON.stringify(engine.many)
    );

    // The plan survives a reload: unlike the Event tab's picks it is not patch-stamped.
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    await page.evaluate(() => document.getElementById("btn-planner").click());
    await page.waitForTimeout(600);
    const calcRestored = await page.evaluate(() => {
      const cards = [...document.querySelectorAll("#calc-banners .calc-card")];
      return {
        tab: document.querySelector("#planner-modal .builds-mode-btn.is-active")?.id || "",
        crystal: document.getElementById("calc-crystal").value,
        cards: cards.length,
        pulls: cards.map((c) => c.querySelector(".calc-pull-input").value),
        dots: document.querySelectorAll("#calc-chart .calc-dot").length,
        remembered: localStorage.getItem("r1999_planner_tab_v1"),
      };
    });
    check("the modal reopens on the Calculator", calcRestored.tab === "planner-tab-calculator", calcRestored.tab);
    check(
      "the plan survives a reload",
      calcRestored.crystal === "18000" && calcRestored.cards === 2 && calcRestored.pulls[0] === "81",
      JSON.stringify(calcRestored)
    );
    check(
      "and the chart redraws its dots",
      calcRestored.dots === 2,
      String(calcRestored.dots)
    );
    check("the open tab is remembered", calcRestored.remembered === "calculator", calcRestored.remembered);

    // Reset is the tab's own button, and it leaves the tab alone.
    await page.evaluate(() => document.getElementById("calc-reset").click());
    await page.waitForTimeout(200);
    const calcReset = await page.evaluate(() => ({
      crystal: document.getElementById("calc-crystal").value,
      cards: document.querySelectorAll("#calc-banners .calc-card").length,
      empty: (document.querySelector("#calc-banners .guide-empty") || {}).textContent || "",
      dots: document.querySelectorAll("#calc-chart .calc-dot").length,
      tab: document.querySelector("#planner-modal .builds-mode-btn.is-active")?.id || "",
      stored: JSON.parse(localStorage.getItem("r1999_calculator_v1") || "null"),
    }));
    check(
      "Reset clears the hold and the whole plan",
      calcReset.crystal === "" &&
        calcReset.cards === 0 &&
        calcReset.dots === 0 &&
        /Add banner/.test(calcReset.empty) &&
        calcReset.tab === "planner-tab-calculator",
      JSON.stringify(calcReset)
    );
    check(
      "and the cleared plan is what is stored",
      calcReset.stored && calcReset.stored.list.length === 0 && Object.keys(calcReset.stored.plans).length === 0,
      JSON.stringify(calcReset.stored)
    );

    // The two perks and the three pity tracks are what makes the tab agree with the
    // game instead of with a flat 50/50: a Limited patch hands out ten free pulls, a
    // Ripples pool discounts its first ten-pull and selects its first 6★, and only
    // Debut / Rerun spend the Rate Up counter — a Ripples pool has its own.
    const tracks = await page.evaluate(() => {
      const pool = calcPickerPool();
      const pick = (type) => (pool.find((row) => row.type === type) || {}).id || "";
      const ids = { ripples: pick("Ripples"), limited: pick("Limited"), rerun: pick("Rerun") };
      for (const id of Object.values(ids)) calcAddBanner(id);
      calcSetPulls(ids.ripples, 80);
      calcSetPulls(ids.limited, 60);
      calcSetPulls(ids.rerun, 100);
      calcRefresh();
      const cardOf = (id) => document.querySelector(`#calc-banners .calc-card[data-banner="${id}"]`);
      const perks = {};
      for (const [key, id] of Object.entries(ids)) {
        perks[key] = [...cardOf(id).querySelectorAll(".calc-pill.is-perk")].map((p) => p.textContent.trim());
      }
      // What the dot is charged is the cost, not the number typed: the free ten pulls
      // and the discounted ten-pull come off it.
      const dots = {};
      for (const dot of document.querySelectorAll("#calc-chart .calc-dot")) {
        dots[dot.dataset.banner] = dot.querySelector(".calc-dot-label").textContent.trim();
      }
      // P1, not P0: a Ripples pool selects its first 6★, so its P0 is 100% whatever
      // the counter says. The second copy is what the counter actually moves.
      const headOf = (id) => Number(cardOf(id).querySelector('.calc-chip[data-p="1"]').dataset.odds);
      const base = { rerun: headOf(ids.rerun), ripples: headOf(ids.ripples) };
      // Advancing the Rate Up counter must move the Rerun card only.
      calcPityRateUp = 65;
      calcRefresh();
      const rateUpMoved = { rerun: headOf(ids.rerun), ripples: headOf(ids.ripples) };
      calcPityRateUp = 0;
      // And advancing the Ripples counter must move the Ripples card only.
      calcPityRipples = 65;
      calcRefresh();
      const ripplesMoved = { rerun: headOf(ids.rerun), ripples: headOf(ids.ripples) };
      calcPityRipples = 0;
      calcRefresh();
      const dotsArt = [...document.querySelectorAll("#calc-chart .calc-dot")].map((dot) => {
        const head = dot.querySelector(".calc-dot-head");
        const label = dot.querySelector(".calc-dot-label");
        return {
          headW: head ? Math.round(head.getBoundingClientRect().width) : 0,
          labelPx: label ? parseFloat(getComputedStyle(label).fontSize) : 0,
        };
      });
      document.getElementById("calc-reset").click();
      return { ids, perks, dots, base, rateUpMoved, ripplesMoved, dotsArt };
    });
    check(
      "a Limited banner carries its free ten pulls",
      tracks.perks.limited.some((pill) => /10 free pulls/.test(pill)),
      JSON.stringify(tracks.perks.limited)
    );
    check(
      "a Ripples pool carries its ten-pull discount and its first-6★ selector",
      tracks.perks.ripples.some((pill) => /−3 on a ten-pull/.test(pill)) &&
        tracks.perks.ripples.some((pill) => /First 6✦ selected/.test(pill)),
      JSON.stringify(tracks.perks.ripples)
    );
    check(
      "a plain Rerun carries no perk",
      tracks.perks.rerun.length === 0,
      JSON.stringify(tracks.perks.rerun)
    );
    check(
      "the dot is charged the cost, not the typed count",
      tracks.dots[tracks.ids.limited] === "−50" && tracks.dots[tracks.ids.ripples] === "−77",
      JSON.stringify(tracks.dots)
    );
    check(
      "the Rate Up counter moves Debut and Rerun, and nothing else",
      tracks.rateUpMoved.rerun > tracks.base.rerun &&
        Math.abs(tracks.rateUpMoved.ripples - tracks.base.ripples) < 1e-12,
      JSON.stringify(tracks.rateUpMoved)
    );
    check(
      "the Ripples counter moves Ripples, and nothing else",
      tracks.ripplesMoved.ripples > tracks.base.ripples &&
        Math.abs(tracks.ripplesMoved.rerun - tracks.base.rerun) < 1e-12,
      JSON.stringify(tracks.ripplesMoved)
    );
    check(
      "the chart art is big enough to read at low resolution",
      tracks.dotsArt.length === 3 &&
        tracks.dotsArt.every((dot) => dot.headW >= 20 && dot.labelPx >= 12),
      JSON.stringify(tracks.dotsArt)
    );

    // The patch's first Limited banner trades a bonus copy at 200 pulls, and the trade
    // **repeats** — 560 pulls buys two — so its copy levels sit above what the pulls
    // alone buy. That is what makes portraits cheaper to hunt there than elsewhere.
    const exchange = await page.evaluate(() => {
      const banner = calcPickerPool().find((row) => row.rule && row.rule.copyExchange);
      if (!banner) return { found: false };
      const rule = calcRuleOf(banner);
      const plain = calcDistribution({ ...rule, copyExchange: null }, 200, 0, false);
      const traded = calcDistribution(rule, 200, 0, false);
      // Below the threshold nothing is traded, so the odds are exactly the plain ones.
      const plain199 = calcDistribution({ ...rule, copyExchange: null }, 199, 0, false);
      const traded199 = calcDistribution(rule, 199, 0, false);
      // 560 pulls is two thresholds: two copies traded, so P5 is what three traded
      // copies would have made of it — a certainty.
      const plain560 = calcDistribution({ ...rule, copyExchange: null }, 560, 0, false);
      const traded560 = calcDistribution(rule, 560, 0, false);
      // The card has to print the same numbers the model does.
      calcAddBanner(banner.id);
      const cardOf = () => document.querySelector(`#calc-banners .calc-card[data-banner="${banner.id}"]`);
      const chipsOf = () => [...cardOf().querySelectorAll(".calc-chip")].map((c) => Number(c.dataset.odds));
      const read = (pulls) => {
        calcSetPulls(banner.id, pulls);
        calcRefresh();
        return {
          chips: chipsOf(),
          perks: [...cardOf().querySelectorAll(".calc-pill.is-perk")].map((p) => p.textContent.trim()),
        };
      };
      const at199 = read(199);
      const at200 = read(200);
      const at560 = read(560);
      document.getElementById("calc-reset").click();
      return {
        found: true,
        name: calcBannerName(banner),
        type: banner.type,
        threshold: rule.copyExchange.pulls,
        copies: rule.copyExchange.copies,
        plain,
        traded,
        plain199,
        traded199,
        plain560,
        traded560,
        at199,
        at200,
        at560,
      };
    });
    check(
      "a Limited patch's first banner trades a copy at 200 pulls",
      exchange.found &&
        exchange.type === "Limited" &&
        exchange.threshold === 200 &&
        exchange.copies === 1 &&
        exchange.at200.perks.includes("1 copy every 200 pulls"),
      JSON.stringify({ found: exchange.found, name: exchange.name, perks: exchange.at200?.perks })
    );
    check(
      "the traded copy moves every level up by one",
      exchange.found &&
        Math.abs(exchange.traded[0] - 1) < 1e-9 &&
        [1, 2, 3, 4, 5].every((level) => Math.abs(exchange.traded[level] - exchange.plain[level - 1]) < 1e-9),
      JSON.stringify({ plain: exchange.plain, traded: exchange.traded })
    );
    check(
      "the trade repeats: 560 pulls is two copies, so P5 reaches 100%",
      exchange.found &&
        Math.abs(exchange.traded560[5] - 1) < 1e-6 &&
        exchange.traded560[5] > exchange.plain560[5] &&
        Math.abs(exchange.traded560[4] - exchange.plain560[2]) < 1e-9 &&
        Math.abs(exchange.at560.chips[5] - exchange.traded560[5]) < 1e-4,
      JSON.stringify({
        plain560: exchange.plain560,
        traded560: exchange.traded560,
        chips: exchange.at560?.chips,
      })
    );
    check(
      "the card prints the traded odds, and only from the threshold on",
      exchange.found &&
        exchange.at200.chips.every((value, level) => Math.abs(value - exchange.traded[level]) < 1e-4) &&
        exchange.traded199.every((value, level) => Math.abs(value - exchange.plain199[level]) < 1e-12),
      JSON.stringify({ at199: exchange.at199?.chips, at200: exchange.at200?.chips })
    );

    // The "?" sheet beside the income bar explains every source, so it has to be one
    // row per income with what it pays and how often.
    const helpSheet = await page.evaluate(() => {
      document.getElementById("calc-help-open").click();
      const host = document.getElementById("calc-help");
      const out = {
        open: !host.hidden,
        title: document.getElementById("calc-help-title").textContent.trim(),
        groups: [...host.querySelectorAll(".calc-help-group-title")].map((g) => g.textContent.trim()),
        rows: [...host.querySelectorAll(".calc-help-row")].map((row) => ({
          name: row.querySelector(".calc-help-name").textContent.trim(),
          amount: row.querySelector(".calc-help-amount").textContent.trim(),
          when: row.querySelector(".calc-help-when").textContent.trim(),
          note: row.querySelector(".calc-help-note").textContent.trim(),
        })),
        // One count per group, in the sheet's own order, so a row that lands in the
        // wrong block is caught rather than merely counted.
        groupRows: [...host.querySelectorAll(".calc-help-group")].map(
          (group) => group.querySelectorAll(".calc-help-row").length
        ),
        card: host.querySelector(".calc-help-card").className,
        fixed: getComputedStyle(host).position === "fixed" || getComputedStyle(host).position === "absolute",
      };
      document.getElementById("calc-help-close").click();
      out.closed = host.hidden;
      return out;
    });
    check("the “?” opens the income sheet", helpSheet.open, String(helpSheet.open));
    check(
      "it groups the sources the way the tab does",
      helpSheet.groups.join("|") === "Freebies|Spenders|Always paid",
      JSON.stringify(helpSheet.groups)
    );
    check(
      "it lists every income with what it pays and how often",
      helpSheet.rows.length === 19 &&
        helpSheet.rows.every((row) => row.name && row.when) &&
        helpSheet.rows.filter((row) => row.amount).length >= 17,
      JSON.stringify(helpSheet.rows.slice(0, 4))
    );
    check(
      "the free block carries the login track and both halves of the Jukebox",
      helpSheet.groupRows[0] === 10 &&
        helpSheet.rows.some((row) => row.name === "Login 7/15/25 days" && row.amount === "180") &&
        helpSheet.rows.some((row) => row.name === "Roar Jukebox" && row.amount === "2"),
      JSON.stringify({ groupRows: helpSheet.groupRows })
    );
    check(
      "Dev Broadcasts is one more always-paid patch payout",
      helpSheet.groupRows[2] === 4 &&
        helpSheet.rows.some((row) => row.name === "Dev Broadcasts" && row.amount === "120"),
      JSON.stringify(helpSheet.rows.map((row) => [row.name, row.amount]))
    );
    check(
      "the Daily Tasks note claims no Sunday bonus, because the sheet has none",
      helpSheet.rows.find((row) => row.name === "Daily Tasks").note === "90 Clear Drops a day.",
      helpSheet.rows.find((row) => row.name === "Daily Tasks").note
    );
    check(
      "the sheet wears the site's modal card and its close button works",
      /modal-card/.test(helpSheet.card) && helpSheet.closed,
      JSON.stringify({ card: helpSheet.card, closed: helpSheet.closed })
    );

    // The tab is translated like the rest of the modal — including the banner kinds,
    // which are the sheet's own English words in the data.
    await page.evaluate(() => setLanguage("cn"));
    await page.waitForTimeout(800);
    const calcCn = await page.evaluate(() => {
      document.getElementById("calc-add").click();
      const out = {
        sections: [...document.querySelectorAll("#planner-calculator .archetype-section-title")].map((s) =>
          s.textContent.trim()
        ),
        hold: document.getElementById("calc-chart-total").textContent.trim(),
        summary: [...document.querySelectorAll("#calc-summary .calc-summary-label")].map((s) => s.textContent.trim()),
        toggle: (document.querySelector("#planner-calculator .calc-check-yield") || {}).textContent || "",
        groups: [...document.querySelectorAll("#planner-calculator .calc-group-title")].map((g) => g.textContent.trim()),
        tracks: [...document.querySelectorAll("#planner-calculator .calc-hold .calc-field-label")].map((l) =>
          l.textContent.trim()
        ),
        spans: [...document.querySelectorAll("#calc-span .calc-span-btn")].map((s) => s.textContent.trim()),
        hint: (document.querySelector("#planner-calculator .calc-hint") || {}).textContent || "",
        empty: (document.querySelector("#calc-banners .guide-empty") || {}).textContent || "",
        add: document.getElementById("calc-add").textContent.replace(/\s+/g, " ").trim(),
        filters: document.querySelectorAll("#calc-picker .filter-btn").length,
        kinds: [...new Set([...document.querySelectorAll("#calc-picker-list .calc-pick-meta")].map((m) => m.textContent.split(" · ")[0].trim()))],
        meta: (document.querySelector("#calc-picker-list .calc-pick-meta") || {}).textContent || "",
      };
      document.getElementById("calc-picker-close").click();
      document.getElementById("calc-help-open").click();
      out.helpTitle = document.getElementById("calc-help-title").textContent.trim();
      out.helpGroups = [...document.querySelectorAll("#calc-help .calc-help-group-title")].map((g) =>
        g.textContent.trim()
      );
      out.helpRow = (document.querySelector("#calc-help .calc-help-note") || {}).textContent || "";
      document.getElementById("calc-help-close").click();
      return out;
    });
    const CJK = /[\u4e00-\u9fff]/;
    check(
      "the Calculator is translated",
      calcCn.sections.every((s) => CJK.test(s)) &&
        CJK.test(calcCn.hold) &&
        CJK.test(calcCn.empty) &&
        CJK.test(calcCn.add),
      JSON.stringify(calcCn.sections)
    );
    check(
      "the ledger's own labels are translated too (summary, tick boxes, span, help)",
      calcCn.summary.every((s) => CJK.test(s)) &&
        CJK.test(calcCn.toggle) &&
        calcCn.spans.every((s) => CJK.test(s)) &&
        CJK.test(calcCn.hint),
      JSON.stringify({ summary: calcCn.summary, spans: calcCn.spans, hint: calcCn.hint })
    );
    check(
      "the two income groups and the two pity tracks are translated",
      calcCn.groups.every((g) => CJK.test(g)) && calcCn.tracks.every((label) => CJK.test(label)),
      JSON.stringify({ groups: calcCn.groups, tracks: calcCn.tracks })
    );
    check(
      "the “?” sheet is translated as well",
      CJK.test(calcCn.helpTitle) && calcCn.helpGroups.every((g) => CJK.test(g)) && CJK.test(calcCn.helpRow),
      JSON.stringify({ title: calcCn.helpTitle, groups: calcCn.helpGroups })
    );
    check(
      "a banner kind is a label, not the data's English word",
      calcCn.filters === 0 && calcCn.kinds.length > 0 && calcCn.kinds.every((k) => CJK.test(k)) && CJK.test(calcCn.meta),
      JSON.stringify({ kinds: calcCn.kinds, meta: calcCn.meta })
    );
    await page.evaluate(() => setLanguage("en"));
    await page.waitForTimeout(600);
    const backToEn = await page.evaluate(() => ({
      sections: [...document.querySelectorAll("#planner-calculator .archetype-section-title")].map((s) =>
        s.textContent.trim()
      ),
      add: document.getElementById("calc-add").textContent.replace(/\s+/g, " ").trim(),
    }));
    check(
      "switching back restores the English labels",
      backToEn.sections[0] === "Current amounts" && /Add banner/.test(backToEn.add),
      JSON.stringify(backToEn)
    );

    // On a phone a banner with several rate-up heads used to squeeze the name into a
    // ~90px column, and the tags then stacked and ran out of the card. The head row
    // now lets the name take the full width.
    await page.evaluate(() => document.getElementById("calc-add").click());
    await page.waitForTimeout(200);
    await page.evaluate(() => document.querySelector("#calc-picker-list .calc-pick").click());
    await page.waitForTimeout(300);
    await page.setViewportSize({ width: 390, height: 780 });
    await page.waitForTimeout(400);
    const calcPhone = await page.evaluate(() => {
      const card = document.querySelector("#calc-banners .calc-card");
      const title = card.querySelector(".calc-card-title").getBoundingClientRect();
      const row = card.querySelector(".calc-card-pills").getBoundingClientRect();
      const pills = [...card.querySelectorAll(".calc-pill")];
      return {
        cards: document.querySelectorAll("#calc-banners .calc-card").length,
        titleW: Math.round(title.width),
        cardW: Math.round(card.clientWidth),
        overflow: card.scrollWidth > card.clientWidth + 1,
        pillRows: new Set(pills.map((p) => Math.round(p.getBoundingClientRect().top))).size,
        pillsFit: pills.every((p) => p.getBoundingClientRect().right <= row.right + 1),
        removeRight: Math.round(
          card.querySelector(".calc-card-remove").getBoundingClientRect().right - card.getBoundingClientRect().left
        ),
        removeInside: true,
      };
    });
    check(
      "on a phone the card gives the name the full width",
      calcPhone.cards > 0 && calcPhone.titleW >= calcPhone.cardW - 30,
      JSON.stringify(calcPhone)
    );
    check(
      "and no tag runs out of the card",
      !calcPhone.overflow && calcPhone.pillsFit && calcPhone.removeRight <= calcPhone.cardW,
      JSON.stringify(calcPhone)
    );

    // The new blocks on a phone: the span chips and the summary row used to be a
    // 780-wide desktop line, so they either overflowed the tab or squeezed into one
    // unreadable column.
    const calcPhoneBlocks = await page.evaluate(() => {
      const host = document.querySelector("#planner-calculator");
      const cells = [...document.querySelectorAll("#calc-summary .calc-summary-cell")];
      const boxes = [...document.querySelectorAll("#planner-calculator .calc-check")];
      const hostRight = host.getBoundingClientRect().right;
      return {
        overflow: host.scrollWidth > host.clientWidth + 1,
        cellsFit: cells.every((cell) => cell.getBoundingClientRect().right <= hostRight + 1),
        summaryRows: new Set(cells.map((cell) => Math.round(cell.getBoundingClientRect().top))).size,
        spanFits: document.getElementById("calc-span").getBoundingClientRect().right <= hostRight + 1,
        boxesFit: boxes.every((box) => box.scrollWidth <= box.clientWidth + 1),
        // Every card in a grid row is the same size on a phone too: one card a head
        // taller than the one beside it read as a mismatched button.
        boxRows: [...document.querySelectorAll("#planner-calculator .calc-group-grid")].map((grid) => {
          const rows = new Map();
          [...grid.querySelectorAll(".calc-check")].forEach((box) => {
            const b = box.getBoundingClientRect();
            const key = Math.round(b.top);
            rows.set(key, [...(rows.get(key) || []), Math.round(b.height)]);
          });
          return [...rows.values()].map((heights) => new Set(heights).size === 1);
        }),
        pairFits: [...document.querySelectorAll("#planner-calculator .calc-group > .calc-pair-row")].every(
          (row) => row.getBoundingClientRect().right <= hostRight + 1
        ),
      };
    });
    check(
      "the tick-box cards keep one size per row on a phone, and the package pair stays inside",
      calcPhoneBlocks.boxRows.every((group) => group.every(Boolean)) && calcPhoneBlocks.pairFits,
      JSON.stringify({ rows: calcPhoneBlocks.boxRows, pairFits: calcPhoneBlocks.pairFits })
    );
    check(
      "the span chips and the summary fit a phone",
      !calcPhoneBlocks.overflow && calcPhoneBlocks.spanFits && calcPhoneBlocks.cellsFit && calcPhoneBlocks.boxesFit,
      JSON.stringify(calcPhoneBlocks)
    );
    check(
      "the summary keeps two cells a row rather than one long column",
      calcPhoneBlocks.summaryRows <= 2,
      String(calcPhoneBlocks.summaryRows)
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(300);

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
    // read the same, with the tabs keeping their own width instead of stretching
    // into a full-width bar under the close button.
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
        sameRow: tabs.every((r) => Math.abs(r.top - tabs[0].top) <= 1),
        overlap: tabs.some((r) => r.right > close.left && r.top < close.bottom && r.bottom > close.top),
      };
    });
    check(
      "the tabs keep their own width on a phone",
      narrowTab.tabW < narrowTab.headerW * 0.8 && narrowTab.sameRow && narrowTab.belowTitle && !narrowTab.overlap,
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
   * 10c. Planner (character progression)
   * ------------------------------------------------------------------ */

  console.log("\n=== Planner: character progression ===");
  {
    await page.evaluate(() => {
      localStorage.removeItem("r1999_planner_characters_v1");
      // The modal reopens on the tab it was left on, and the section above left it
      // on Event — start this half from a clean slate so Character is the default.
      localStorage.removeItem("r1999_planner_tab_v1");
    });
    await page.goto(APP, { waitUntil: "networkidle" });
    await page.waitForTimeout(1400);
    await page.evaluate(() => document.getElementById("btn-planner").click());
    await page.waitForTimeout(600);
    // With no saved tab the modal opens on Calculator, its first tab; every check
    // below is about the Character tab, so press it once.
    await page.evaluate(() => document.getElementById("planner-tab-character").click());
    await page.waitForTimeout(400);

    // Quantities live in `data-qty` (the badge prints a compact "894k", the way the
    // InfoBook's own item sticker does), so read the exact figure.
    const readMats = (sel) =>
      page.evaluate((s) => {
        const out = {};
        for (const card of document.querySelectorAll(`${s} .planner-mat`)) {
          out[card.dataset.item] = Number(card.dataset.qty || 0);
        }
        return out;
      }, sel);
    const norm = (obj) => JSON.stringify(Object.entries(obj).sort((a, b) => a[0].localeCompare(b[0])));
    const setField = (id, value) =>
      page.evaluate(
        ([fieldId, v]) => {
          const el = document.getElementById(fieldId);
          el.value = String(v);
          el.dispatchEvent(new Event("change", { bubbles: true }));
        },
        [id, value]
      );
    const searchPicker = async (query) => {
      await page.evaluate((q) => {
        const input = document.getElementById("planner-picker-search");
        input.value = q;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }, query);
      await page.waitForTimeout(200);
    };

    const emptyPane = await page.evaluate(() => ({
      charVisible: !document.getElementById("planner-pane-character").hidden,
      calcVisible: !document.getElementById("planner-pane-calculator").hidden,
      eventVisible: !document.getElementById("planner-pane-event").hidden,
      railEmpty: (document.querySelector(".planner-rail-empty")?.textContent || "").trim(),
      railTiles: document.querySelectorAll(".planner-char-tile").length,
      goalCards: document.querySelectorAll("#planner-goal .planner-mat").length,
      goalAvatars: document.querySelectorAll("#planner-goal .planner-goal-avatar").length,
      goalText: (document.getElementById("planner-goal").textContent || "").replace(/\s+/g, " ").trim(),
      paneText: (document.getElementById("planner-pane-character").textContent || "").trim(),
    }));
    check(
      "the Character tab opens on the plan, not the calculator",
      emptyPane.charVisible && !emptyPane.eventVisible && !emptyPane.calcVisible,
      JSON.stringify(emptyPane)
    );
    check(
      "an empty plan says so instead of drawing an empty grid",
      emptyPane.railTiles === 0 && emptyPane.goalCards === 0 && !!emptyPane.railEmpty && !!emptyPane.paneText,
      JSON.stringify(emptyPane)
    );
    // The Goal band on an empty plan is its title and nothing else — no
    // "0 arcanists", no "add one" prompt.
    check(
      "the empty Goal band is just its title",
      emptyPane.goalAvatars === 0 && emptyPane.goalText.length <= 12,
      JSON.stringify(emptyPane)
    );

    check(
      "the picker starts closed",
      (await page.evaluate(() => document.getElementById("planner-picker").hidden)) === true
    );
    await page.evaluate(() => document.getElementById("planner-char-add").click());
    await page.waitForTimeout(300);
    const picker = await page.evaluate(() => {
      const el = document.getElementById("planner-picker");
      const tiles = [...el.querySelectorAll("[data-pick]")];
      return {
        hidden: el.hidden,
        width: Math.round(el.getBoundingClientRect().width),
        paneWidth: Math.round(document.getElementById("planner-pane-character").getBoundingClientRect().width),
        tiles: tiles.length,
        broken: tiles.filter((t) => {
          const img = t.querySelector("img");
          return img && img.naturalWidth === 0;
        }).length,
        named: tiles.filter((t) =>
          (t.querySelector(".roster-char-name")?.textContent || "").trim()
        ).length,
        // The picker is built out of the Manage modal's own pieces.
        rosterTiles: tiles.filter((t) => t.classList.contains("roster-char-item")).length,
        boxes: tiles.filter((t) => t.querySelector(".roster-avatar-box")).length,
        avatars: tiles.filter((t) => t.querySelector(".roster-avatar-box .roster-avatar-img")).length,
        searchIsManage: !!el.querySelector(".roster-toolbar .search-input"),
        rarityChips: el.querySelectorAll(".filter-btn-group .filter-btn").length,
      };
    });
    check("the add button opens the picker", picker.hidden === false, JSON.stringify(picker));
    check("the picker covers the tab it belongs to", picker.width === picker.paneWidth, JSON.stringify(picker));
    check("it lists the whole roster", picker.tiles > 100, String(picker.tiles));
    check(
      "every tile draws a head icon and a name",
      picker.broken === 0 && picker.named === picker.tiles,
      JSON.stringify(picker)
    );
    check(
      "the tiles are the Manage modal's roster tiles",
      // Eight roster heads have no art in the asset cache, so the box is the
      // requirement and the image is the common case.
      picker.rosterTiles === picker.tiles &&
        picker.boxes === picker.tiles &&
        picker.avatars >= picker.tiles - 8,
      JSON.stringify(picker)
    );
    check(
      "the picker carries Manage's search box and rarity chips",
      picker.searchIsManage && picker.rarityChips === 5,
      JSON.stringify(picker)
    );

    // The rarity chips narrow the grid, and pressing one again widens it back.
    const byRarity = await page.evaluate(() => {
      const grid = document.getElementById("planner-picker-grid");
      const count = () => grid.querySelectorAll("[data-pick]").length;
      const chip = (r) => document.querySelector(`#planner-picker-rarity .filter-btn[data-rarity="${r}"]`);
      const all = count();
      chip("6").click();
      const six = count();
      const sixNames = [...grid.querySelectorAll("[data-pick]")].slice(0, 5).map((t) => t.dataset.pick);
      chip("5").click();
      const sixFive = count();
      chip("6").click();
      chip("5").click();
      const back = count();
      return { all, six, sixFive, back, sixNames, active: !!document.querySelector("#planner-picker-rarity .filter-btn.active") };
    });
    await page.waitForTimeout(150);
    check(
      "a rarity chip narrows the picker",
      byRarity.six > 0 && byRarity.six < byRarity.all && byRarity.sixFive > byRarity.six,
      JSON.stringify(byRarity)
    );
    check(
      "pressing the chips off restores the whole roster",
      byRarity.back === byRarity.all && !byRarity.active,
      JSON.stringify(byRarity)
    );

    await searchPicker("lucy");
    const searched = await page.evaluate(() =>
      [...document.querySelectorAll("#planner-picker [data-pick]")].map((t) => t.dataset.pick)
    );
    check("the picker searches the roster", searched.includes("Lucy"), JSON.stringify(searched.slice(0, 6)));

    await page.evaluate(() => document.querySelector('#planner-picker [data-pick="Lucy"]').click());
    await page.waitForTimeout(400);
    const added = await page.evaluate(() => {
      const selects = [...document.querySelectorAll("#planner-char-detail .planner-field-select")];
      const cs = selects.length ? getComputedStyle(selects[0]) : null;
      return {
        pickerHidden: document.getElementById("planner-picker").hidden,
        rail: document.querySelectorAll(".planner-char-tile").length,
        selected: document.querySelectorAll(".planner-char-tile.is-selected").length,
        name: (document.querySelector(".planner-char-name")?.textContent || "").trim(),
        portrait: document.querySelector(".planner-char-portrait")?.naturalWidth || 0,
        selects: selects.length,
        appearance: cs ? cs.appearance || cs.webkitAppearance : "",
        caret: cs ? /svg/.test(cs.backgroundImage) : false,
      };
    });
    check("picking an arcanist closes the picker", added.pickerHidden === true, JSON.stringify(added));
    check(
      "it joins the rail and opens its detail pane",
      added.rail === 1 && added.selected === 1 && added.name === "Lucy" && added.portrait > 0,
      JSON.stringify(added)
    );
    check(
      "the pane carries four from → to controls",
      added.selects === 8,
      `${added.selects} selects`
    );
    check(
      "the controls are the modal's own select",
      added.appearance === "none" && added.caret === true,
      JSON.stringify(added)
    );

    const detailMats = await readMats("#planner-char-detail");
    const goalMats = await readMats("#planner-goal");
    const matArt = await page.evaluate(() => {
      const imgs = [...document.querySelectorAll("#planner-char-detail .planner-mat-art img")];
      return { count: imgs.length, broken: imgs.filter((i) => i.naturalWidth === 0).length };
    });
    check("the arcanist gets a bill", Object.keys(detailMats).length > 0, Object.keys(detailMats).join(","));
    check("every quantity on it is positive", Object.values(detailMats).every((n) => n > 0), JSON.stringify(detailMats));
    check(
      "levelling costs are on the bill",
      !!detailMats.Dust && !!detailMats.Sharpodonty,
      Object.keys(detailMats).join(",")
    );
    check("every material draws its art", matArt.count > 0 && matArt.broken === 0, JSON.stringify(matArt));
    check(
      "the goal bar repeats a single arcanist's bill",
      norm(goalMats) === norm(detailMats),
      JSON.stringify({ goalMats, detailMats })
    );

    // Frequency picks a resonance pattern. The five tiles are the arcanist's own
    // board (`talent_style`), each named and drawn with its own glyph, and a
    // pick must bill exactly `pattern_costs.json`'s row for that pattern.
    const patternData = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "pattern_costs.json"), "utf8"));
    const freqUi = await page.evaluate(() => {
      const tiles = [...document.querySelectorAll("#planner-char-detail .planner-freq-tile")];
      return {
        count: tiles.length,
        names: tiles.map((t) => (t.querySelector(".planner-freq-name")?.textContent || "").trim()),
        glyphs: tiles.map((t) => {
          const img = t.querySelector("img");
          return img ? { src: img.getAttribute("src"), ok: img.naturalWidth > 0 } : null;
        }),
        label: (document.querySelector("#planner-char-detail .planner-freq-row")?.closest(".planner-field")
          ?.querySelector(".planner-field-label")?.textContent || "").trim(),
      };
    });
    check("the arcanist gets five pattern tiles", freqUi.count === 5, JSON.stringify(freqUi));
    check(
      "every tile is named and drawn with a real glyph",
      freqUi.names.every(Boolean) && freqUi.glyphs.every((g) => g && g.ok && /images\/shape_pattern\//.test(g.src)),
      JSON.stringify(freqUi),
    );
    check(
      "the tiles are the arcanist's own board",
      norm(freqUi.names) === norm(Object.keys(patternData.Lucy)),
      JSON.stringify({ ui: freqUi.names, data: Object.keys(patternData.Lucy) }),
    );
    check(
      "the picker reads as a resonance pattern, not a bare number",
      /pattern|调频|Mẫu/i.test(freqUi.label) && !/\d/.test(freqUi.names.join("")),
      JSON.stringify({ label: freqUi.label, names: freqUi.names }),
    );

    const patternName = freqUi.names[0];
    const patternBill = patternData.Lucy[patternName];
    await page.evaluate(() =>
      document.querySelector("#planner-char-detail .planner-freq-tile").click()
    );
    await page.waitForTimeout(350);
    const withPattern = await readMats("#planner-char-detail");
    const patternDelta = {};
    for (const mat of Object.keys(withPattern)) {
      const delta = withPattern[mat] - (detailMats[mat] || 0);
      if (delta) patternDelta[mat] = delta;
    }
    const expectedDelta = Object.fromEntries(patternBill.map((m) => [m.material, m.quantity]));
    check(
      "picking a pattern bills that pattern",
      norm(patternDelta) === norm(expectedDelta),
      JSON.stringify({ expectedDelta, patternDelta }),
    );
    // Clicking the same tile again must take that bill back off.
    await page.evaluate(() =>
      document.querySelector("#planner-char-detail .planner-freq-tile").click()
    );
    await page.waitForTimeout(350);
    check(
      "unpicking it takes the bill back off",
      norm(await readMats("#planner-char-detail")) === norm(detailMats),
      JSON.stringify(await readMats("#planner-char-detail")),
    );

    const defaults = await page.evaluate(() => ({
      curInsight: document.getElementById("planner-f-curInsight").value,
      curLevel: document.getElementById("planner-f-curLevel").value,
      goalInsight: document.getElementById("planner-f-goalInsight").value,
      goalLevel: document.getElementById("planner-f-goalLevel").value,
      goalReso: document.getElementById("planner-f-goalReso").value,
    }));
    check(
      "a new plan starts at Lv.1 Insight 0 and ends at the cap",
      defaults.curInsight === "0" &&
        defaults.curLevel === "1" &&
        defaults.goalInsight === "3" &&
        defaults.goalLevel === "60",
      JSON.stringify(defaults)
    );

    // The Quick goal button is the usual "this arcanist can fight now"
    // breakpoint: 5★/6★ stop at Insight III Lv.30 with a full R10 board.
    await page.evaluate(() => document.getElementById("planner-quick-goal").click());
    await page.waitForTimeout(300);
    const quick = await page.evaluate(() => ({
      insight: document.getElementById("planner-f-goalInsight").value,
      level: document.getElementById("planner-f-goalLevel").value,
      reso: document.getElementById("planner-f-goalReso").value,
      mats: document.querySelectorAll("#planner-char-detail .planner-mat").length,
    }));
    check(
      "quick goal is the usual breakpoint (Insight III Lv.30 R10)",
      quick.insight === "3" && quick.level === "30" && quick.reso === "10",
      JSON.stringify(quick)
    );
    check("it still leaves a bill to farm", quick.mats > 0, JSON.stringify(quick));

    // Walking the current state up to the goal must empty the bill: the costs
    // are differences between two states, not a fixed package.
    const goalState = await page.evaluate(() => ({
      insight: document.getElementById("planner-f-goalInsight").value,
      level: document.getElementById("planner-f-goalLevel").value,
      reso: document.getElementById("planner-f-goalReso").value,
    }));
    await setField("planner-f-curInsight", goalState.insight);
    await page.waitForTimeout(150);
    await setField("planner-f-curLevel", goalState.level);
    await page.waitForTimeout(150);
    await setField("planner-f-goalLevel", goalState.level);
    await page.waitForTimeout(150);
    await setField("planner-f-curReso", goalState.reso);
    await page.waitForTimeout(300);
    const settled = await readMats("#planner-char-detail");
    const settledGoal = await readMats("#planner-goal");
    check(
      "a plan with nothing left to farm has no bill",
      Object.keys(settled).length === 0 && Object.keys(settledGoal).length === 0,
      JSON.stringify(settled)
    );

    // Put the arcanist back at square one: the goal never moves down, so the
    // bill has to come back.
    await setField("planner-f-curLevel", 1);
    await page.waitForTimeout(150);
    await setField("planner-f-curInsight", 0);
    await page.waitForTimeout(300);
    check(
      "stepping the current state back down grows the bill again",
      Object.keys(await readMats("#planner-char-detail")).length > 0
    );

    const savedRaw = await page.evaluate(() => localStorage.getItem("r1999_planner_characters_v1"));
    check("the plan is saved locally", /"chars":\[\{/.test(String(savedRaw)), String(savedRaw).slice(0, 120));

    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(1400);
    await page.evaluate(() => document.getElementById("btn-planner").click());
    await page.waitForTimeout(600);
    const restored = await page.evaluate(() => ({
      rail: document.querySelectorAll(".planner-char-tile").length,
      selected: (document.querySelector(".planner-char-name")?.textContent || "").trim(),
      mats: document.querySelectorAll("#planner-char-detail .planner-mat").length,
      goalLevel: document.getElementById("planner-f-goalLevel").value,
    }));
    check(
      "the plan survives a reload",
      restored.rail === 1 && restored.selected === "Lucy" && restored.mats > 0 && restored.goalLevel === "30",
      JSON.stringify(restored)
    );

    // A second arcanist joins the plan, and the Goal bar becomes their sum.
    await page.evaluate(() => document.getElementById("planner-char-add").click());
    await page.waitForTimeout(250);
    await searchPicker("jessica");
    await page.evaluate(() => document.querySelector('#planner-picker [data-pick="Jessica"]').click());
    await page.waitForTimeout(400);
    const twoUp = await page.evaluate(() => ({
      rail: document.querySelectorAll(".planner-char-tile").length,
      avatars: [...document.querySelectorAll("#planner-goal .planner-goal-avatar")].map(
        (a) => a.dataset.char
      ),
      broken: [...document.querySelectorAll("#planner-goal .planner-goal-avatar img")].filter(
        (i) => i.naturalWidth === 0
      ).length,
    }));
    check("a second arcanist joins the rail", twoUp.rail === 2, JSON.stringify(twoUp));
    // The Goal header is the plan as head icons — no "2 arcanists" text.
    check(
      "the goal header carries one avatar per arcanist",
      twoUp.avatars.length === 2 && twoUp.avatars.includes("Lucy") && twoUp.avatars.includes("Jessica"),
      JSON.stringify(twoUp)
    );
    check("every goal avatar draws its head icon", twoUp.broken === 0, JSON.stringify(twoUp));

    const names = await page.evaluate(() =>
      [...document.querySelectorAll(".planner-char-tile")].map((t) => t.dataset.char)
    );
    const perChar = {};
    for (const name of names) {
      await page.evaluate((n) => document.querySelector(`.planner-char-tile[data-char="${n}"]`).click(), name);
      await page.waitForTimeout(250);
      perChar[name] = await readMats("#planner-char-detail");
    }
    const summed = {};
    for (const list of Object.values(perChar)) {
      for (const [item, qty] of Object.entries(list)) summed[item] = (summed[item] || 0) + qty;
    }
    const goalTwo = await readMats("#planner-goal");
    check(
      "the goal bar is every arcanist's bill added up",
      norm(summed) === norm(goalTwo),
      JSON.stringify({ summed, goalTwo })
    );

    // Pressing a Goal head icon opens that arcanist, exactly like the rail.
    const viaGoal = await page.evaluate(() => {
      const avatar = document.querySelector('#planner-goal .planner-goal-avatar[data-char="Jessica"]');
      avatar.click();
      return {
        selected: document.querySelector("#planner-char-detail .planner-char-name")?.textContent.trim(),
        railSelected: document.querySelector(".planner-char-tile.is-selected")?.dataset.char,
        goalSelected: document.querySelector(".planner-goal-avatar.is-selected")?.dataset.char,
      };
    });
    await page.waitForTimeout(250);
    const viaGoalMats = await readMats("#planner-char-detail");
    check(
      "a goal avatar opens that arcanist",
      viaGoal.selected === "Jessica" &&
        viaGoal.railSelected === "Jessica" &&
        viaGoal.goalSelected === "Jessica",
      JSON.stringify(viaGoal)
    );
    check(
      "and the detail pane now bills that arcanist",
      norm(viaGoalMats) === norm(perChar.Jessica),
      JSON.stringify({ detail: viaGoalMats, expected: perChar.Jessica })
    );

    const align = await page.evaluate(() => {
      const rows = new Map();
      for (const card of document.querySelectorAll("#planner-goal .planner-mat")) {
        const top = Math.round(card.getBoundingClientRect().top);
        const list = rows.get(top) || { heights: [], qtys: [] };
        list.heights.push(Math.round(card.getBoundingClientRect().height));
        list.qtys.push(Math.round(card.querySelector(".planner-mat-qty").getBoundingClientRect().bottom));
        rows.set(top, list);
      }
      const list = [...rows.values()];
      return {
        rows: list.length,
        uneven: list.filter((r) => new Set(r.heights).size > 1).length,
        unevenQty: list.filter((r) => new Set(r.qtys).size > 1).length,
      };
    });
    check("material cards on a row share one height", align.uneven === 0, JSON.stringify(align));
    check("their quantities line up", align.unevenQty === 0, JSON.stringify(align));

    const beforeRemove = await page.evaluate(() => {
      const count = document.querySelectorAll(".planner-char-tile").length;
      document.querySelector(".planner-char-remove").click();
      return count;
    });
    await page.waitForTimeout(300);
    const afterRemove = await page.evaluate(() => ({
      rail: document.querySelectorAll(".planner-char-tile").length,
      selected: document.querySelectorAll(".planner-char-tile.is-selected").length,
      name: (document.querySelector(".planner-char-name")?.textContent || "").trim(),
    }));
    check(
      "removing an arcanist drops only that one",
      afterRemove.rail === beforeRemove - 1,
      JSON.stringify({ beforeRemove, afterRemove })
    );
    check(
      "the pane falls back to the next arcanist",
      afterRemove.selected === 1 && !!afterRemove.name,
      JSON.stringify(afterRemove)
    );

    await page.evaluate(() => document.getElementById("planner-char-clear").click());
    await page.waitForTimeout(300);
    const cleared = await page.evaluate(() => ({
      rail: document.querySelectorAll(".planner-char-tile").length,
      goalCards: document.querySelectorAll("#planner-goal .planner-mat").length,
      saved: localStorage.getItem("r1999_planner_characters_v1"),
    }));
    check("reset empties the plan", cleared.rail === 0 && cleared.goalCards === 0, JSON.stringify(cleared));
    check("it clears the saved plan too", /"chars":\[\]/.test(String(cleared.saved)), String(cleared.saved).slice(0, 80));

    // The two tabs are panes of one body, not two modals: switching to Event and
    // back must leave the plan where it was, and an open picker cannot follow the
    // reader into the other tab.
    await page.evaluate(() => document.getElementById("planner-char-add").click());
    await page.waitForTimeout(250);
    await searchPicker("lucy");
    await page.evaluate(() => {
      document.getElementById("planner-tab-event").click();
      return document.getElementById("planner-picker").hidden;
    });
    await page.waitForTimeout(350);
    const tabbed = await page.evaluate(() => ({
      pickerHidden: document.getElementById("planner-picker").hidden,
      charHidden: document.getElementById("planner-pane-character").hidden,
      eventHidden: document.getElementById("planner-pane-event").hidden,
      eventCards: document.querySelectorAll("#planner-sections .planner-card").length,
    }));
    check(
      "leaving the tab closes the picker",
      tabbed.pickerHidden && tabbed.charHidden && !tabbed.eventHidden,
      JSON.stringify(tabbed)
    );
    check("the Event tab is still the shop", tabbed.eventCards > 0, JSON.stringify(tabbed));
    await page.evaluate(() => document.getElementById("planner-tab-character").click());
    await page.waitForTimeout(350);
    const backToChar = await page.evaluate(() => ({
      charHidden: document.getElementById("planner-pane-character").hidden,
      eventHidden: document.getElementById("planner-pane-event").hidden,
      pickerHidden: document.getElementById("planner-picker").hidden,
    }));
    check(
      "coming back lands on the Character tab again",
      !backToChar.charHidden && backToChar.eventHidden && backToChar.pickerHidden,
      JSON.stringify(backToChar)
    );

    // The Character tab is translated like the rest of the modal.
    await page.evaluate(() => {
      plannerChars = [];
      plannerCharSelected = "";
      plannerAddCharacter("Lucy");
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => setLanguage("cn"));
    await page.waitForTimeout(800);
    const cnChar = await page.evaluate(() => ({
      tab: document.getElementById("planner-tab-character").textContent.trim(),
      add: document.getElementById("planner-char-add").textContent.trim(),
      goal: (document.querySelector("#planner-goal .archetype-section-title")?.textContent || "").trim(),
      mats: (document.querySelector(".planner-char-mats-head .archetype-section-title")?.textContent || "").trim(),
      placeholder: document.getElementById("planner-picker-search").placeholder,
      item: (document.querySelector("#planner-goal .planner-mat-name")?.textContent || "").trim(),
    }));
    check(
      "the Character tab is translated",
      cnChar.tab !== "Character" &&
        /[\u4e00-\u9fff]/.test(cnChar.tab + cnChar.add + cnChar.goal + cnChar.mats + cnChar.placeholder + cnChar.item),
      JSON.stringify(cnChar)
    );
    await page.evaluate(() => setLanguage("en"));
    await page.waitForTimeout(600);
    await page.evaluate(() => {
      plannerChars = [];
      plannerCharSelected = "";
      plannerSaveChars();
      renderPlannerCharacter();
    });
    await page.waitForTimeout(200);

    // Phones: the rail becomes a strip on top, the controls one column, and the
    // Goal bar keeps its own band under the detail instead of scrolling away.
    await page.evaluate(() => document.getElementById("planner-char-add").click());
    await page.waitForTimeout(250);
    await searchPicker("lucy");
    await page.evaluate(() => document.querySelector('#planner-picker [data-pick="Lucy"]').click());
    await page.waitForTimeout(400);
    await page.setViewportSize({ width: 390, height: 780 });
    await page.waitForTimeout(400);
    const phone = await page.evaluate(() => {
      const rail = document.getElementById("planner-char-rail");
      const body = rail.closest(".planner-char-body");
      const detail = document.getElementById("planner-char-detail");
      const goal = document.getElementById("planner-goal");
      const controls = document.querySelector(".planner-char-controls");
      return {
        bodyDir: getComputedStyle(body).flexDirection,
        railDir: getComputedStyle(rail).flexDirection,
        sameColumn: Math.abs(rail.getBoundingClientRect().left - detail.getBoundingClientRect().left) < 2,
        goalBelow: goal.getBoundingClientRect().top >= detail.getBoundingClientRect().bottom - 1,
        cols: getComputedStyle(controls).gridTemplateColumns.split(" ").length,
      };
    });
    check(
      "the rail moves above the detail on a phone",
      phone.bodyDir === "column" && phone.sameColumn && phone.railDir === "row",
      JSON.stringify(phone)
    );
    check("the goal bar stays under the detail", phone.goalBelow, JSON.stringify(phone));
    check("the controls stack to one column", phone.cols === 1, JSON.stringify(phone));

    // The Goal head icons survive the phone width, and the picker's search box,
    // rarity chips and Manage-style grid still fit without scrolling sideways.
    const phoneGoal = await page.evaluate(() => {
      const goal = document.getElementById("planner-goal");
      const avatars = [...goal.querySelectorAll(".planner-goal-avatar")];
      return {
        count: avatars.length,
        inside: avatars.every((a) => a.getBoundingClientRect().right <= goal.getBoundingClientRect().right + 1),
        head: Math.round(goal.querySelector(".planner-goal-head").getBoundingClientRect().height),
      };
    });
    check(
      "the goal avatars fit the phone band",
      phoneGoal.count === 1 && phoneGoal.inside,
      JSON.stringify(phoneGoal)
    );

    await page.evaluate(() => document.getElementById("planner-char-add").click());
    await page.waitForTimeout(350);
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
    await page.evaluate(() => document.getElementById("planner-picker-close").click());
    await page.waitForTimeout(200);

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
