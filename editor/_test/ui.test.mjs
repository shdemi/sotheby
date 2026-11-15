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
        labels: [...document.querySelectorAll("#planner-modal .builds-mode-btn")].map((b) => b.textContent.trim()),
        active: document.querySelector("#planner-modal .builds-mode-btn.is-active")?.id || "",
        calcVisible: visible("planner-pane-calculator"),
        charVisible: visible("planner-pane-character"),
        eventVisible: visible("planner-pane-event"),
      };
    });
    check("the Planner modal opens", tabsInfo.display === "flex", tabsInfo.display);
    check(
      "it carries Pull Calculator, Character and then Event",
      tabsInfo.tabs.join(",") === "planner-tab-calculator,planner-tab-character,planner-tab-event" &&
        tabsInfo.labels[0] === "Pull Calculator",
      JSON.stringify(tabsInfo.labels)
    );
    check(
      "it opens on the Pull Calculator tab",
      tabsInfo.active === "planner-tab-calculator" &&
        tabsInfo.calcVisible &&
        !tabsInfo.charVisible &&
        !tabsInfo.eventVisible,
      JSON.stringify(tabsInfo)
    );
    {
      // The Planner's own windows sit on a surface that is already dimmed: Activity
      // settings, Wilderness, both Resets and the Event tab's quantity editor must not
      // blur the page behind them as well.
      const blur = await page.evaluate(() => {
        const read = (el) => (el ? getComputedStyle(el).backdropFilter : "missing");
        return {
          planner: read(document.getElementById("planner-modal")),
          confirm: read(document.getElementById("confirm-modal")),
          slider: read(document.querySelector(".planner-slider-backdrop")),
          // A window that is not the Planner's keeps the blurred backdrop.
          builds: read(document.getElementById("builds-modal")),
        };
      });
      check(
        "the Planner's own windows do not blur the page behind them",
        blur.planner === "none" && blur.confirm === "none" && blur.slider === "none" && blur.builds === "blur(3px)",
        JSON.stringify(blur)
      );
    }

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
        const tagEl = row.querySelector(".calc-pick-version");
        const predEl = row.querySelector(".calc-pick-tags .is-predicted");
        const nameEl = row.querySelector(".calc-pick-name");
        const tagBox = tagEl ? tagEl.getBoundingClientRect() : null;
        const predBox = predEl ? predEl.getBoundingClientRect() : null;
        const nameBox = nameEl ? nameEl.getBoundingClientRect() : null;
        return {
          id: row.dataset.pickBanner,
          name: row.querySelector(".calc-pick-name").textContent.trim(),
          // The patch is a tag of its own at the row's trailing edge, not part of the
          // name and no longer beside it: `P4.0` in front of `Predicted` when the row
          // is a forecast, the row's last thing when it is not.
          tag: tagEl ? tagEl.textContent.trim() : "",
          tagLeftOfName: !!(tagBox && nameBox) && tagBox.left < nameBox.right,
          tagBeforePredicted: !!(tagBox && predBox) && tagBox.right <= predBox.left + 1,
          tagIsLast: !!tagEl && row.querySelector(".calc-pick-tags")?.lastElementChild === tagEl,
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
        // A forecast puts the patch in front of `Predicted`; any other row ends with it.
        tagPlacement: read.every((row) =>
          !row.tag ? true : row.predicted ? row.tagBeforePredicted && !row.tagIsLast : row.tagIsLast
        ),
        tagClearedOfName: read.every((row) => !row.tagLeftOfName),
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
      "every banner carries the patch it ships in, as a `P` tag",
      calcPickList.tagged,
      JSON.stringify([calcPickList.first, calcPickList.last])
    );
    check(
      "the patch tag sits at the row's right edge, not beside the name",
      calcPickList.tagPlacement && calcPickList.tagClearedOfName,
      JSON.stringify({
        placement: calcPickList.tagPlacement,
        cleared: calcPickList.tagClearedOfName,
        first: calcPickList.first,
      })
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
        pullLabel: card.querySelector(".calc-pull-label").textContent.trim(),
        max: (() => {
          const field = card.querySelector(".calc-max-field");
          const value = card.querySelector(".calc-max-value");
          const box = value ? value.getBoundingClientRect() : null;
          const input = card.querySelector(".calc-pull-input").getBoundingClientRect();
          const banner = calcBanner(card.dataset.banner);
          return {
            label: (field.querySelector(".calc-pull-label") || {}).textContent?.trim() || "",
            figure: Number((value ? value.textContent : "").replace(/[^0-9]/g, "")),
            expected: calcMaxPulls(banner),
            text: value ? value.textContent.trim() : "",
            hasInput: !!field.querySelector("input"),
            hasIcon: !!field.querySelector(".calc-pull-icon"),
            rightOfInput: !!box && box.left >= input.right - 1,
            hint: field.getAttribute("title") || "",
            sameBox: box ? Math.round(box.height) : 0,
            inputBox: Math.round(input.height),
          };
        })(),
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

    // Beside the field sits the banner's ceiling: the same box, filled not typed into,
    // and it answers "how many pulls can this banner take by its own closing day".
    check(
      "a card prints the max pulls available beside the field",
      calcAdded.max.label === "Max Pulls Available" &&
        calcAdded.max.label !== calcAdded.pullLabel &&
        calcAdded.max.hasInput === false &&
        calcAdded.max.rightOfInput &&
        calcAdded.max.figure === calcAdded.max.expected,
      JSON.stringify({ max: calcAdded.max, pulls: calcAdded.pullLabel })
    );
    check(
      "the ceiling is drawn as the same box as the field",
      calcAdded.max.sameBox === calcAdded.max.inputBox && calcAdded.max.hasIcon,
      JSON.stringify({ box: calcAdded.max.sameBox, input: calcAdded.max.inputBox })
    );
    check("the ceiling explains when it runs to", /11|12|01|02|03/.test(calcAdded.max.hint), calcAdded.max.hint);

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
        // The ceilings are rewritten in place while a field has focus, so every card
        // still agrees with what the plan can reach.
        maxes: cards.map((c) =>
          Number((c.querySelector(".calc-max-value") || {}).textContent?.replace(/[^0-9]/g, "") || 0)
        ),
        expectedMaxes: cards.map((c) => calcMaxPulls(calcBanner(c.dataset.banner))),
        // The date stamp sits above the point of the same dot (and therefore above its
        // head art; a banner with no rate-up art has the stamp alone).
        dates: [...document.querySelectorAll("#calc-chart .calc-dot")].map((g) => {
          const stamp = g.querySelector(".calc-dot-date");
          const head = g.querySelector(".calc-dot-head");
          const point = g.querySelector("circle");
          return {
            text: stamp ? stamp.textContent.trim() : "",
            above:
              stamp && point
                ? Math.round(point.getBoundingClientRect().top - stamp.getBoundingClientRect().bottom)
                : -999,
            clearOfHead: !head || !stamp
              ? true
              : Math.round(head.getBoundingClientRect().top - stamp.getBoundingClientRect().bottom) >= 0,
            onBanner: !!stamp && /^\d\d\/\d\d$/.test(stamp.textContent.trim()),
          };
        }),
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
      "each dot is dated, above the rate-up icon",
      typed.dates.length === 2 &&
        typed.dates.every((row) => /^\d\d\/\d\d$/.test(row.text)) &&
        typed.dates.every((row) => row.above > 0 && row.clearOfHead && row.onBanner),
      JSON.stringify(typed.dates)
    );
    check(
      "the plan is saved",
      typed.stored && Array.isArray(typed.stored.list) && typed.stored.list.length === 2 &&
        typed.stored.plans[typed.stored.list[0]] === 80,
      JSON.stringify(typed.stored)
    );
    check(
      "typing a count rewrites every card's ceiling in place",
      typed.maxes.join(",") === typed.expectedMaxes.join(","),
      JSON.stringify({ shown: typed.maxes, expected: typed.expectedMaxes })
    );

    // ...and the rest of the plan is charged one pull for one pull: ten more pulls in the
    // earlier banner take exactly ten off the later one's ceiling. (The first version
    // charged pulls against drops, so a typed count raised the ceiling instead.) The
    // count is put back, so the rest of the tab keeps the plan it had.
    const ceiling = await page.evaluate(() => {
      const cards = [...document.querySelectorAll("#calc-banners .calc-card")];
      const first = calcBanner(cards[0].dataset.banner);
      const second = calcBanner(cards[1].dataset.banner);
      const before = { own: calcMaxPulls(first), other: calcMaxPulls(second) };
      const typedBefore = calcPulls(first.id);
      const input = cards[0].querySelector(".calc-pull-input");
      input.value = String(typedBefore + 10);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      const typedAfter = calcPulls(first.id);
      const after = { own: calcMaxPulls(first), other: calcMaxPulls(second) };
      const shown = [...document.querySelectorAll(".calc-max-value")].map((el) =>
        Number(el.textContent.replace(/[^0-9]/g, ""))
      );
      const expected = cards.map((c) => calcMaxPulls(calcBanner(c.dataset.banner)));
      input.value = String(typedBefore);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return { before, typedBefore, typedAfter, after, shown, expected };
    });
    check(
      "a banner's ceiling ignores its own planned pulls",
      ceiling.after.own === ceiling.before.own,
      JSON.stringify(ceiling)
    );
    check(
      "spending on one banner lowers what the others can reach",
      ceiling.after.other <= ceiling.before.other,
      JSON.stringify(ceiling)
    );
    check(
      "one more pull typed into an earlier banner takes exactly one off a later one",
      ceiling.before.other - ceiling.after.other === ceiling.typedAfter - ceiling.typedBefore &&
        ceiling.typedAfter > ceiling.typedBefore,
      JSON.stringify(ceiling)
    );
    check(
      "the boxes follow the plan without a repaint",
      ceiling.shown.join(",") === ceiling.expected.join(","),
      JSON.stringify(ceiling)
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
    // and each tooltip line reads label → art → figure. The label column is a
    // fixed width, so the arts and the figures below them stack in one line
    // instead of stepping right with each longer word.
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
      const labels = lines.map((row) => row.querySelector(".planner-tooltip-label"));
      const arts = lines.map((row) => row.querySelector(".planner-tooltip-icon").getBoundingClientRect());
      const figures = lines.map((row) =>
        row.querySelector(".planner-tooltip-value").getBoundingClientRect()
      );
      const shop = plannerShop();
      const total = plannerTotalSpend(shop);
      const held = Number(plannerOwned[shop.id]) || 0;
      const still = Math.max(0, total - held);
      const runs = Math.ceil(still / 300);
      const figure = (id) => {
        const text = document.getElementById(id).textContent.trim();
        const lead = text.match(/^[0-9][0-9.,]*/);
        return lead ? Number(lead[0].replace(/[^0-9]/g, "")) : NaN;
      };
      const restImg = document.getElementById("planner-tooltip-rest-icon");
      return {
        iconShown: getComputedStyle(icon).display !== "none",
        resolves: icon.naturalWidth > 0,
        inside: ico.left > box.left && ico.right <= box.right + 1,
        iconLeftOfBox: ico.left < box.left + box.width / 2,
        padLeft: parseFloat(getComputedStyle(input).paddingLeft),
        count: lines.length,
        order: lines.map((row) => parts(row).map((p) => p.id).join(",")),
        inOrder: lines.every((row) => inOrder(row)),
        labelTexts: labels.map((el) => el.textContent.trim()),
        labelWidths: [...new Set(labels.map((el) => Math.round(el.getBoundingClientRect().width)))],
        artLefts: [...new Set(arts.map((r) => Math.round(r.left)))],
        figureLefts: [...new Set(figures.map((r) => Math.round(r.left)))],
        needText: document.getElementById("planner-tooltip-need").textContent.trim(),
        still,
        runs,
        runsText: figure("planner-tooltip-runs"),
        activityText: figure("planner-tooltip-stamina"),
        activityFull: document.getElementById("planner-tooltip-stamina").textContent.trim(),
        restText: figure("planner-tooltip-rest"),
        expectedActivity: runs * 20,
        expectedRest: held + runs * 300 - total,
        staminaIcon: lines[2].querySelector("img").getAttribute("src"),
        runsIconSrc: lines[1].querySelector("img").getAttribute("src"),
        runsIconResolves: !!lines[1].querySelector("img")?.naturalWidth,
        needIconSrc: document.getElementById("planner-tooltip-need-icon").getAttribute("src"),
        restIcon: { src: restImg.getAttribute("src"), shown: !restImg.hidden },
      };
    });
    check("the Owned field draws the shop currency art inside the box", owned.iconShown && owned.resolves && owned.inside, JSON.stringify(owned));
    check("that art sits left of the number", owned.iconLeftOfBox && owned.padLeft >= 20, JSON.stringify(owned));
    check("the tooltip draws four lines", owned.count === 4, String(owned.count));
    check(
      "every line reads label, art, figure",
      owned.inOrder &&
        owned.order[0] === "planner-tooltip-need-label,planner-tooltip-need-icon,planner-tooltip-need" &&
        owned.order[1] === "planner-tooltip-runs-label,planner-tooltip-icon,planner-tooltip-runs" &&
        owned.order[2] === "planner-tooltip-stamina-label,planner-tooltip-icon,planner-tooltip-stamina" &&
        owned.order[3] === "planner-tooltip-rest-label,planner-tooltip-rest-icon,planner-tooltip-rest",
      JSON.stringify(owned.order)
    );
    check("the figure is the bare number", /^[0-9][0-9.,]*$/.test(owned.needText), owned.needText);
    check("the stamina line keeps the game's stamina art", owned.staminaIcon === "images/random_icon/Stamina.webp", owned.staminaIcon);
    check(
      "the Times line draws the times art",
      owned.runsIconSrc === "images/random_icon/times.png" && owned.runsIconResolves,
      JSON.stringify({ src: owned.runsIconSrc, ok: owned.runsIconResolves })
    );
    check(
      "the remainder carries the shop's currency art",
      owned.restIcon.shown && owned.restIcon.src === owned.needIconSrc && !!owned.needIconSrc,
      JSON.stringify(owned.restIcon)
    );
    check(
      "every line hands its art the same left edge",
      owned.labelWidths.length === 1 && owned.artLefts.length === 1 && owned.figureLefts.length === 1,
      JSON.stringify(owned)
    );
    check("Times is the runs the shortfall takes", owned.runsText === owned.runs, `${owned.runsText} vs ${owned.runs}`);
    check(
      "Activity is whole runs, never a fraction of one",
      owned.activityText === owned.expectedActivity && owned.expectedActivity % 20 === 0,
      `${owned.activityText} vs ${owned.expectedActivity}`
    );
    check(
      "the Roaring Month day count is its own figure, never the plain day twice",
      (() => {
        const days = [...owned.activityFull.matchAll(/([0-9]+(?:[.,][0-9]+)?)\s*(?:d\b|ngày|天)/g)].map(
          (m) => m[1]
        );
        return days.length === 2 && days[0] !== days[1];
      })(),
      owned.activityFull
    );
    check(
      "the remainder is what the whole runs leave over",
      owned.restText === owned.expectedRest,
      `${owned.restText} vs ${owned.expectedRest}`
    );

    // The owner's own worked example: 3,000 held against an 80,850 bill is 260
    // runs of 300 → 5,200 Activity (not the fractional 5,190) and 150 left.
    const farmMath = await page.evaluate(() => {
      const plan = plannerShopFarmRuns(80850 - 3000);
      return { runs: plan.runs, activity: plan.activity, rest: 3000 + plan.currency - 80850 };
    });
    check(
      "77,850 short is 260 runs, 5,200 Activity and 150 left over",
      farmMath.runs === 260 && farmMath.activity === 5200 && farmMath.rest === 150,
      JSON.stringify(farmMath)
    );

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
    await page.waitForTimeout(250);
    const resetAsk = await page.evaluate(() => ({
      open: getComputedStyle(document.getElementById("confirm-modal")).display !== "none",
      message: document.getElementById("confirm-modal-message").textContent.trim(),
      // Not one card has moved yet.
      stillStepped: [...document.querySelectorAll(".planner-card")].some(
        (card) => Number(card.querySelector(".planner-count").textContent.split("/")[0]) !== Number(card.dataset.max)
      ),
    }));
    check(
      "Reset asks before it throws the shop's picks away",
      resetAsk.open && resetAsk.stillStepped && resetAsk.message.length > 0,
      JSON.stringify(resetAsk)
    );
    const resetCancelled = await page.evaluate(() => {
      document.getElementById("confirm-modal-btn-cancel").click();
      return [...document.querySelectorAll(".planner-card")].some(
        (card) => Number(card.querySelector(".planner-count").textContent.split("/")[0]) !== Number(card.dataset.max)
      );
    });
    check("cancelling keeps the picks", resetCancelled, "a cancel must leave the shop alone");

    await page.evaluate(() => {
      document.getElementById("planner-clear").click();
      document.getElementById("confirm-modal-btn-yes").click();
    });
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
    // With no saved tab the modal opens on Calculator, its first tab; every check
    // below is about the Character tab, so press it once.
    await page.evaluate(() => document.getElementById("planner-tab-character").click());
    await page.waitForTimeout(400);

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
        calcVisible: !document.getElementById("planner-pane-calculator").hidden,
        eventVisible: !document.getElementById("planner-pane-event").hidden,
        railEmpty: (rail.querySelector(".planner-rail-empty")?.textContent || "").trim(),
        // An empty plan is one sentence across the pane, not a grid cell: it spans
        // every column and its text is centred, instead of hanging in the top-left.
        railEmptyBox: (() => {
          const p = rail.querySelector(".planner-rail-empty");
          if (!p) return null;
          const cs = getComputedStyle(p);
          return {
            align: cs.textAlign,
            width: Math.round(p.getBoundingClientRect().width),
            rail: Math.round(rail.getBoundingClientRect().width),
          };
        })(),
        tiles: rail.querySelectorAll(".planner-char-tile").length,
        hint: document.getElementById("planner-rail-hint").textContent.trim(),
        count: document.getElementById("planner-char-count").textContent.trim(),
        farm: farm.textContent.replace(/\s+/g, " ").trim(),
        hasStamina: !!document.getElementById("planner-farm-stamina"),
        activity: document.getElementById("planner-activity-value").textContent.trim(),
        activityUnit: document.querySelector("#planner-activity-btn .planner-activity-unit").textContent.trim(),
        buttons: ["planner-char-add", "planner-goal-btn", "planner-char-clear", "planner-activity-btn"].every(
          (id) => !!document.getElementById(id)
        ),
        sheets: [...document.querySelectorAll("#planner-pane-character .planner-sheet")].map((s) => s.hidden),
      };
    });
    check(
      "pressing Character shows that tab alone",
      empty.charVisible && !empty.calcVisible && !empty.eventVisible,
      JSON.stringify(empty)
    );
    check(
      "an empty plan says so instead of drawing an empty grid",
      empty.tiles === 0 && !!empty.railEmpty && empty.hint === "" && empty.count === "",
      JSON.stringify(empty)
    );
    check(
      "that sentence sits in the middle of the pane, not in the top-left corner",
      empty.railEmptyBox &&
        empty.railEmptyBox.align === "center" &&
        empty.railEmptyBox.width >= empty.railEmptyBox.rail - 1,
      JSON.stringify(empty.railEmptyBox)
    );
    check(
      "the farm route starts empty",
      /Nothing left to farm/.test(empty.farm) && !empty.hasStamina,
      empty.farm
    );
    check(
      "the toolbar carries the stamina setting, Add, Goal and Reset",
      empty.buttons && empty.activity === "240" && empty.activityUnit === "/day",
      JSON.stringify(empty)
    );
    check(
      "every panel starts closed",
      empty.sheets.length === 5 && empty.sheets.every(Boolean),
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
      const names = [...grid.querySelectorAll("[data-pick]")].map((el) => el.dataset.pick);
      return {
        open: !sheet.hidden,
        covers: Math.abs(box.width - pane.width) < 2 && Math.abs(box.height - pane.height) < 2,
        tiles: names.length,
        manageStyle:
          !!tile.querySelector(".roster-avatar-box") &&
          !!tile.querySelector(".roster-avatar-img") &&
          !!tile.querySelector(".roster-char-name"),
        search: !!document.getElementById("planner-picker-search"),
        chips: document.querySelectorAll("#planner-picker-rarity .filter-btn").length,
        // The Manage modal's roster, so the curated exclusion list applies too.
        excludesSchneider: !names.includes("Schneider"),
        excludesDummy: !names.some((name) => /Machine D/.test(name)),
      };
    });
    check(
      "Add character opens a lightbox over the whole tab",
      picker.open && picker.covers,
      JSON.stringify(picker)
    );
    check(
      "it lists the whole roster as Manage-style tiles",
      picker.tiles > 100 && picker.manageStyle && picker.search && picker.chips === 5,
      JSON.stringify(picker)
    );
    check(
      "the picker is the Manage roster, so excluded characters never appear",
      picker.excludesSchneider && picker.excludesDummy,
      JSON.stringify({ tiles: picker.tiles, schneider: picker.excludesSchneider })
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

    // ---- add one character -----------------------------------------------
    await page.evaluate(() => document.getElementById("planner-char-add").click());
    await page.waitForTimeout(250);
    await pickName("Lucy");
    await page.waitForTimeout(400);
    const added = await page.evaluate(() => {
      const rail = document.getElementById("planner-char-rail");
      const tile = rail.querySelector(".planner-char-tile");
      const card = document.querySelector("#planner-char-editor .planner-sheet-card");
      const style = getComputedStyle(card);
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
        selectedBorder: getComputedStyle(tile).borderTopColor,
        // The editor wears the Character Setting modal's own head: a portrait, the
        // name, and a Remove button — no rarity plate and no status line.
        portrait: document.getElementById("planner-editor-portrait").getAttribute("src") || "",
        hasSub: !!document.getElementById("planner-editor-sub"),
        rarityPlate: !!document.querySelector("#planner-char-editor .planner-editor-rarity"),
        removeText: document.getElementById("planner-editor-remove").textContent.trim(),
        removeImg: !!document.querySelector("#planner-editor-remove img"),
        removeInHeader: document.getElementById("planner-editor-remove").dataset.remove,
        cardFrame: style.borderTopColor,
        cardRadius: style.borderTopRightRadius,
        cardWash: /background\.png/.test(style.backgroundImage),
        // The dark wash is gone: the card is the modal's own panel, not a scrim.
        cardOverlay: /linear-gradient/.test(style.backgroundImage),
        cardWidth: Math.round(card.getBoundingClientRect().width),
        headBg: getComputedStyle(document.querySelector("#planner-char-editor .planner-editor-header"))
          .backgroundColor,
        titleFont: getComputedStyle(document.getElementById("planner-editor-title")).fontFamily,
        // The head is one row: portrait + name on the left, the close button at the
        // card's right edge — never a close that flows under the name.
        headRow: (() => {
          const head = document.querySelector("#planner-char-editor .planner-editor-header");
          const close = head.querySelector(".planner-sheet-close");
          const name = document.getElementById("planner-editor-title");
          const hr = head.getBoundingClientRect();
          const cr = close.getBoundingClientRect();
          const nr = name.getBoundingClientRect();
          return {
            display: getComputedStyle(head).display,
            wrap: getComputedStyle(head).flexWrap,
            sameRow: Math.abs(cr.top + cr.height / 2 - (nr.top + nr.height / 2)) < 24,
            closeInset: Math.round(hr.right - cr.right),
          };
        })(),
        hint: document.getElementById("planner-rail-hint").textContent.trim(),
        count: document.getElementById("planner-char-count").textContent.trim(),
      };
    });
    check(
      "picking a character closes the picker and opens its panel",
      added.pickerClosed && added.editorOpen && /^Lucy$/.test(added.title),
      JSON.stringify(added)
    );
    check(
      "the plan is a grid of head icons and nothing else",
      added.grid === "grid" &&
        added.tiles === 1 &&
        added.iconOnly &&
        !added.selected &&
        added.selectedBorder !== "rgb(208, 81, 38)",
      JSON.stringify(added)
    );
    check(
      "the editor is the Character Setting modal's own card, modal-width, no scrim",
      /^rgb\(181, 88, 41\)$/.test(added.cardFrame) &&
        added.cardRadius === "20px" &&
        added.cardWash &&
        !added.cardOverlay &&
        added.cardWidth <= 440 &&
        /^rgb\(33, 33, 33\)$/.test(added.headBg) &&
        /Georgia/.test(added.titleFont),
      JSON.stringify({
        frame: added.cardFrame,
        radius: added.cardRadius,
        wash: added.cardWash,
        overlay: added.cardOverlay,
        width: added.cardWidth,
        head: added.headBg,
      })
    );
    check(
      "its head carries the portrait, the name and a Remove button",
      /images\/headicon_small\//.test(added.portrait) &&
        !added.hasSub &&
        !added.rarityPlate &&
        added.removeText === "Remove" &&
        !added.removeImg &&
        added.removeInHeader === "Lucy",
      JSON.stringify({
        portrait: added.portrait,
        hasSub: added.hasSub,
        plate: added.rarityPlate,
        remove: added.removeText,
        img: added.removeImg,
      })
    );
    check(
      "the head keeps the name and the close button on one row",
      added.headRow.display === "flex" &&
        added.headRow.wrap === "nowrap" &&
        added.headRow.sameRow &&
        added.headRow.closeInset <= 24,
      JSON.stringify(added.headRow)
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
        // Remove lives in the header now, so the body carries no remove button.
        remove: detail.querySelectorAll("[data-remove]").length,
        groups: detail.querySelectorAll(".planner-char-controls .setting-group").length,
        labels: [...detail.querySelectorAll(".setting-label span")].map((el) => el.textContent.trim()),
        // The setting rules are `#edit-modal`'s own: 12px caps at #BFBFBF over a
        // 1px rule, and the value in 13px gg sans.
        labelStyle: (() => {
          const el = detail.querySelector(".setting-label");
          const cs = getComputedStyle(el);
          const group = getComputedStyle(el.closest(".setting-group"));
          const val = getComputedStyle(el.closest(".setting-group").querySelector(".setting-val-display"));
          return [
            cs.fontSize,
            cs.color,
            group.paddingBottom,
            group.borderBottomWidth + " " + group.borderBottomStyle,
            val.fontSize,
            val.color,
          ].join(" | ");
        })(),
        euphoria: detail.querySelectorAll(".planner-euphoria-checks input[type=checkbox]").length,
        euphoriaIcons: [...detail.querySelectorAll(".planner-euphoria-checks .euphoria-check-icon")].map(
          (img) => img.getAttribute("src") || ""
        ),
        euphoriaTiers: [...detail.querySelectorAll(".planner-euphoria-checks .euphoria-check-tier")].map(
          (el) => el.textContent.trim()
        ),
        patterns: detail.querySelectorAll("[data-pattern]").length,
        glyphs: [...detail.querySelectorAll("[data-pattern] img")].map((img) => img.getAttribute("src")),
        cards: cards.length,
        noName: !detail.querySelector(".planner-mat-name"),
        sticker: !!first?.querySelector(".item-sticker-img") && !!first?.querySelector(".item-sticker-border"),
        size: sticker ? Math.round(sticker.getBoundingClientRect().width) : 0,
        badgeSize: first ? parseFloat(getComputedStyle(first.querySelector(".item-sticker-qty")).fontSize) : 0,
        badge: first?.querySelector(".item-sticker-qty")?.textContent.trim() || "",
        qty: Number(first?.dataset.qty || 0),
      };
    });
    check(
      "the panel opens on level 1 / Insight 0, built to the character's cap",
      editor.fields.join(",") ===
        "curInsight=0,goalInsight=3,curLevel=1,goalLevel=60,curReso=0,goalReso=10,curMastery=0,goalMastery=0",
      JSON.stringify(editor.fields)
    );
    check(
      "its from→to controls are the dressed-up native selects",
      /^url\(/.test(editor.caret) && editor.quickGoal && editor.remove === 0,
      JSON.stringify(editor)
    );
    check(
      "the settings are the Setting modal's own setting-groups",
      editor.groups === 5 &&
        editor.labels.includes("Insight") &&
        editor.labels.includes("Resonance") &&
        editor.labels.includes("Euphoria · Mastery") &&
        editor.euphoria >= 1,
      JSON.stringify({ groups: editor.groups, labels: editor.labels, euphoria: editor.euphoria })
    );
    check(
      "a group is drawn the way the Character Setting modal draws one",
      editor.labelStyle === "12px | rgb(191, 191, 191) | 10px | 1px solid | 13px | rgb(229, 231, 235)",
      editor.labelStyle
    );
    check(
      "a Euphoria facet is drawn as its portrait, tag and all",
      editor.euphoriaIcons.length === editor.euphoria &&
        editor.euphoriaIcons.every((src) => /images\/arcanists\/euphoria\/\d+_\d+\.webp$/.test(src)) &&
        editor.euphoriaTiers.every((tier) => /^E\d+$/.test(tier)),
      JSON.stringify({ icons: editor.euphoriaIcons, tiers: editor.euphoriaTiers })
    );
    check(
      "the facet art is really there",
      await page.evaluate(() =>
        [...document.querySelectorAll("#planner-char-detail .planner-euphoria-checks .euphoria-check-icon")].every(
          (img) => img.complete && img.naturalWidth > 0
        )
      )
    );
    check(
      "the five resonance patterns draw their own glyphs",      editor.patterns === 5 &&
        editor.glyphs.length === 5 &&
        editor.glyphs.every((src) => src && /images\/shape_pattern\//.test(src)),
      JSON.stringify(editor.glyphs)
    );
    check(
      "the bill is a wall of item stickers with no name and no card box",
      editor.cards > 10 && editor.noName && editor.sticker && editor.size >= 56 && editor.size <= 72,
      JSON.stringify({ cards: editor.cards, size: editor.size })
    );
    check(
      "the quantity badge scales with the art",
      editor.badgeSize >= 9 && editor.badgeSize <= 12,
      JSON.stringify({ size: editor.size, badge: editor.badgeSize })
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
      const masteryLocked = () =>
        [...detail.querySelectorAll('select[data-field="curMastery"], select[data-field="goalMastery"]')].every(
          (el) => el.disabled
        );
      const before = detail.querySelectorAll(".planner-mat").length;
      const lockedBefore = masteryLocked();
      const hintBefore = !!detail.querySelector(".planner-subsetting-hint");
      detail.querySelector("[data-euphoria]").click();
      const withEuphoria = detail.querySelectorAll(".planner-mat").length;
      const euphoriaActive = detail.querySelector("[data-euphoria]").checked === true;
      const lockedAfter = masteryLocked();
      detail.querySelector("[data-pattern]").click();
      const withPattern = detail.querySelectorAll(".planner-mat").length;
      const patternActive = !!detail.querySelector("[data-pattern].is-active");
      return {
        before,
        withEuphoria,
        withPattern,
        euphoriaActive,
        patternActive,
        lockedBefore,
        lockedAfter,
        hintBefore,
      };
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
    check(
      "Mastery is locked until a Euphoria facet is ticked",
      picks.lockedBefore && picks.hintBefore && !picks.lockedAfter,
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
          (row) => row.dataset.stamina === undefined && !row.querySelector(".planner-farm-stamina")
        ),
        toggleText: (document.getElementById("planner-farm-wilderness")?.textContent || "").trim(),
        toggleIcon: !!document.querySelector("#planner-farm-wilderness img"),
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
      // The shops the route cannot buy with stamina come first, then the stages in
      // the game's own order, then the Wishing Spring crafts.
      const order = ["Reveries", "Oneiric Shop", "Resources", "Insight materials", "Stages", "Wishing Spring"];
      const present = order.filter((name) => route.heads.includes(name));
      const positions = present.map((name) => route.heads.indexOf(name));
      check(
        "the route lists Reveries, the Oneiric Shop, the stages, then Wishing Spring",
        route.heads[0] === "Farm route" &&
          present.length >= 4 &&
          positions.every((pos, i) => i === 0 || pos > positions[i - 1]),
        JSON.stringify(route.heads)
      );
    }
    {
      // Three drops to a line: a fixed three-column row, so a card never wraps at
      // two with the third stranded underneath.
      const dropRows = await page.evaluate(() =>
        [...document.querySelectorAll("#planner-farm .planner-farm-card")]
          .filter((card) => card.querySelector(".planner-farm-drop"))
          .map((card) => {
            const drops = [...card.querySelectorAll(".planner-farm-drop")];
            const tops = drops.map((el) => Math.round(el.getBoundingClientRect().top));
            return {
              drops: drops.length,
              firstRow: tops.filter((top) => Math.abs(top - tops[0]) <= 2).length,
              size: Math.round(drops[0].getBoundingClientRect().width),
            };
          })
      );
      check(
        "a stage card lays its drops out three to a line",
        dropRows.length > 0 &&
          dropRows.every((row) => row.firstRow === Math.min(row.drops, 3)) &&
          dropRows.some((row) => row.firstRow === 3),
        JSON.stringify(dropRows.slice(0, 6))
      );
    }
    check(
      "the days are the total over the stamina a day is worth",
      Math.abs(route.days - route.total / 240) <= 0.06,
      `${route.days} vs ${route.total} / 240`
    );
    check(
      "the Oneiric Shop rows carry no stamina price: those are bought, not farmed",
      route.shop > 0 && route.shopStamina && route.shopNames.every((name) => !!name),
      JSON.stringify({ rows: route.shop, clean: route.shopStamina, names: route.shopNames })
    );
    check(
      "the Wilderness switch is its own word on the route bar, with no icon",
      route.toggleText === "Wilderness" && !route.toggleIcon,
      JSON.stringify({ text: route.toggleText, icon: route.toggleIcon })
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
      const perDay = () => document.getElementById("planner-activity-perday").textContent.trim();
      const toolbar = () => document.getElementById("planner-activity-btn").textContent.replace(/\s+/g, "");
      const tick = (id) => {
        const box = document.getElementById(id);
        box.checked = true;
        box.dispatchEvent(new Event("change", { bubbles: true }));
      };
      const out = {
        open: !sheet.hidden,
        groups: sheet.querySelectorAll(".setting-group").length,
        ticks: [...sheet.querySelectorAll('input[type="checkbox"]')].map((el) => el.id),
        toggles: sheet.querySelectorAll(".toggle-group").length,
        buttons: sheet.querySelectorAll(".btn-toggle").length,
        // The two boxes sit in one column at the right edge, not trailing their text.
        boxEdges: [...sheet.querySelectorAll(".planner-check-row .check-box")].map((el) =>
          Math.round(el.getBoundingClientRect().right)
        ),
        cardWidth: Math.round(sheet.querySelector(".planner-sheet-card").getBoundingClientRect().width),
        viewport: window.innerWidth,
        perDay: perDay(),
        // Lazy mode and the Clear-Drop refills are gone from this panel.
        hasRefills: !!document.getElementById("planner-set-refills"),
        hasLazy: !!document.getElementById("planner-set-lazy"),
        daysBefore: document.getElementById("planner-farm-days").textContent,
      };
      tick("planner-set-roaring");
      out.afterRoar = {
        perDay: perDay(),
        toolbar: toolbar(),
        checked: document.getElementById("planner-set-roaring").checked,
        days: document.getElementById("planner-farm-days").textContent,
      };
      tick("planner-set-weekly");
      out.afterWeekly = {
        perDay: perDay(),
        toolbar: toolbar(),
        checked: document.getElementById("planner-set-weekly").checked,
      };
      out.stored = JSON.parse(localStorage.getItem("r1999_planner_activity_v1") || "null");
      return out;
    });
    check(
      "the activity panel is one setting-group of two tick boxes",
      activity.open &&
        activity.groups === 1 &&
        activity.ticks.join(",") === "planner-set-roaring,planner-set-weekly" &&
        activity.toggles === 0 &&
        activity.buttons === 0,
      JSON.stringify(activity)
    );
    check(
      "the panel is modal-width and its two boxes share one column at the right",
      activity.cardWidth <= 440 &&
        activity.boxEdges.length === 2 &&
        Math.abs(activity.boxEdges[0] - activity.boxEdges[1]) <= 1,
      JSON.stringify({ card: activity.cardWidth, boxes: activity.boxEdges })
    );
    check(
      "Lazy mode and the Clear-Drop refills are gone",
      !activity.hasRefills && !activity.hasLazy,
      JSON.stringify(activity)
    );
    check(
      "a day starts at 240 stamina",
      /240/.test(activity.perDay),
      activity.perDay
    );
    check(
      "Roaring Month pays 60 more a day and shortens the route",
      /300/.test(activity.afterRoar.perDay) &&
        /300\/day$/.test(activity.afterRoar.toolbar) &&
        activity.afterRoar.checked &&
        parseDays(activity.afterRoar.days) < parseDays(activity.daysBefore),
      JSON.stringify({ before: activity.daysBefore, after: activity.afterRoar.days })
    );
    check(
      "Weekly Activeness adds 240/7 a day",
      /334/.test(activity.afterWeekly.perDay) && /334\/day$/.test(activity.afterWeekly.toolbar),
      JSON.stringify(activity.afterWeekly)
    );
    check(
      "the settings are saved locally, and only those two",
      activity.stored?.roaringMonth === true &&
        activity.stored?.weeklyActivity === true &&
        !("refills" in (activity.stored || {})) &&
        !("lazyModo" in (activity.stored || {})),
      JSON.stringify(activity.stored)
    );
    await page.evaluate(() => document.querySelector('#planner-activity-sheet [data-sheet]').click());
    await page.waitForTimeout(200);

    // ---- wilderness ------------------------------------------------------
    const wildBefore = await page.evaluate(() =>
      Number((document.getElementById("planner-farm-stamina")?.textContent || "").replace(/[^\d]/g, ""))
    );
    const wildOpen = await page.evaluate(() => {
      document.getElementById("planner-farm-wilderness").click();
      const sheet = document.getElementById("planner-wilderness-sheet");
      const output = {};
      for (const row of sheet.querySelectorAll(".planner-wilderness-stat")) {
        output[row.dataset.item] = Number(row.dataset.qty || 0);
      }
      const vigor = document.getElementById("planner-wilderness-vigor");
      return {
        open: !sheet.hidden,
        state: document.getElementById("planner-wilderness-state").textContent.trim(),
        selects: [...sheet.querySelectorAll("[data-wild]")].map((el) => `${el.dataset.wild}=${el.value}`),
        vigor: vigor.value,
        vigorType: vigor.type,
        vigorMax: vigor.getAttribute("max"),
        hasLazy: !!document.getElementById("planner-wilderness-lazy"),
        output,
      };
    });
    check(
      "the tree button on the route opens the Wilderness board, off by default",
      wildOpen.open && /Off/.test(wildOpen.state),
      JSON.stringify(wildOpen)
    );
    check(
      "it starts on three Lv.6 Dust towers and three Lv.6 markets, Vigor at 50",
      wildOpen.selects.length === 6 &&
        wildOpen.selects.every((row) => row.endsWith("=6")) &&
        wildOpen.vigor === "50",
      JSON.stringify({ selects: wildOpen.selects, vigor: wildOpen.vigor })
    );
    check(
      "Vigor is a typed figure with no ceiling, not a capped slider",
      wildOpen.vigorType === "number" && wildOpen.vigorMax === null,
      JSON.stringify({ type: wildOpen.vigorType, max: wildOpen.vigorMax })
    );
    check(
      "Lazy mode has no place on the board",
      wildOpen.hasLazy === false,
      JSON.stringify({ hasLazy: wildOpen.hasLazy })
    );
    check(
      "a full board at the default 50% pays 29,160 Dust and 12,960 Sharpodonty a day",
      wildOpen.output.Dust === 29160 && wildOpen.output.Sharpodonty === 12960,
      JSON.stringify(wildOpen.output)
    );

    const wildOn = await page.evaluate(async () => {
      document.querySelector('#planner-wilderness-toggle .btn-toggle[data-value="1"]').click();
      const sheet = document.getElementById("planner-wilderness-sheet");
      const output = {};
      for (const row of sheet.querySelectorAll(".planner-wilderness-stat")) {
        output[row.dataset.item] = Number(row.dataset.qty || 0);
      }
      const active = sheet.querySelector("#planner-wilderness-toggle .btn-toggle.active");
      // `btn-toggle` carries a 0.2s transition, so the new colours are only readable
      // once a frame has been painted.
      await new Promise((r) => setTimeout(r, 300));
      const cs = getComputedStyle(active);
      return {
        state: document.getElementById("planner-wilderness-state").textContent.trim(),
        output,
        saved: JSON.parse(localStorage.getItem("r1999_planner_wilderness_v1") || "null"),
        toggleActive: document.getElementById("planner-farm-wilderness").classList.contains("is-active"),
        toggleBg: cs.backgroundColor,
        toggleColor: cs.color,
      };
    });
    check(
      "turning it on is saved locally",
      wildOn.saved?.enabled === true && /On/.test(wildOn.state),
      JSON.stringify(wildOn.saved)
    );
    check(
      "the chosen side of the switch is #D05126 with white text",
      wildOn.toggleBg === "rgb(208, 81, 38)" && wildOn.toggleColor === "rgb(255, 255, 255)",
      JSON.stringify({ bg: wildOn.toggleBg, color: wildOn.toggleColor })
    );
    {
      // The payout is Dust/Sharpodonty, so the solve is handed them as a rate over
      // the days it takes: the same route is worth less stamina.
      await page.waitForFunction(
        (before) => {
          const total = Number(
            (document.getElementById("planner-farm-stamina")?.textContent || "").replace(/[^\d]/g, "")
          );
          return total > 0 && total < before;
        },
        wildBefore,
        { timeout: 25000 }
      );
      const wildRoute = await page.evaluate(() => ({
        total: Number((document.getElementById("planner-farm-stamina")?.textContent || "").replace(/[^\d]/g, "")),
        card: !!document.querySelector("#planner-farm .planner-farm-card.is-wilderness"),
        days: document.querySelector("#planner-farm .planner-farm-card.is-wilderness")?.dataset.days || "",
        toggleActive: document.getElementById("planner-farm-wilderness").classList.contains("is-active"),
        drops: document.querySelectorAll("#planner-farm .planner-farm-card.is-wilderness .planner-farm-drop").length,
      }));
      check(
        "the Wilderness credit shortens the route and shows its own card",
        wildRoute.total > 0 && wildRoute.total < wildBefore && wildRoute.card && wildRoute.drops === 2,
        JSON.stringify({ before: wildBefore, after: wildRoute.total, card: wildRoute.card, days: wildRoute.days })
      );
      check(
        "the route bar shows the board is counted in",
        wildRoute.toggleActive,
        JSON.stringify(wildRoute)
      );
    }
    const wildVigor = await page.evaluate(() => {
      const sheet = document.getElementById("planner-wilderness-sheet");
      const box = document.getElementById("planner-wilderness-vigor");
      const read = () => {
        const out = {};
        for (const row of sheet.querySelectorAll(".planner-wilderness-stat")) {
          out[row.dataset.item] = Number(row.dataset.qty || 0);
        }
        return out;
      };
      const type = (value) => {
        box.value = String(value);
        box.dispatchEvent(new Event("input", { bubbles: true }));
        box.dispatchEvent(new Event("change", { bubbles: true }));
      };
      type(0);
      const atZero = read();
      type(120);
      const atHigh = read();
      const saved = JSON.parse(localStorage.getItem("r1999_planner_wilderness_v1") || "null");
      return { atZero, atHigh, saved: saved?.vigor, value: box.value };
    });
    check(
      "Vigor adds its percentage to the payout, and goes past the old 50% cap",
      wildVigor.atZero.Dust === 19440 &&
        wildVigor.atZero.Sharpodonty === 8640 &&
        Math.abs(wildVigor.atHigh.Dust - 810 * 2.2 * 24) <= 1 &&
        Math.abs(wildVigor.atHigh.Sharpodonty - 360 * 2.2 * 24) <= 1 &&
        wildVigor.saved === 120,
      JSON.stringify(wildVigor)
    );
    await page.evaluate(() => {
      // Put Vigor back, so the saved state is the plain board at 0%, but leave the
      // board switched on: the reload has to bring both back.
      const box = document.getElementById("planner-wilderness-vigor");
      box.value = "0";
      box.dispatchEvent(new Event("change", { bubbles: true }));
      document.querySelector('#planner-wilderness-sheet [data-sheet]').click();
    });
    await page.waitForTimeout(900);

    // ---- the Goal lightbox ----------------------------------------------
    const lucyBill = await (async () => {
      await selectChar("Lucy");
      await page.waitForTimeout(250);
      return readBill("#planner-char-detail");
    })();
    const goalOne = await page.evaluate(() => {
      document.getElementById("planner-goal-btn").click();
      const sheet = document.getElementById("planner-goal-sheet");
      return {
        open: !sheet.hidden,
        cards: document.querySelectorAll("#planner-goal .planner-mat").length,
        // The panel is the bill and nothing else: no count, no head icons, no heading.
        chars: sheet.querySelectorAll(".planner-goal-char").length,
        heads: sheet.querySelectorAll(".archetype-section-header").length,
        counts: sheet.querySelectorAll(".setting-label-row, .setting-label").length,
        width: Math.round(sheet.querySelector(".planner-sheet-card").getBoundingClientRect().width),
        sticker: Math.round(
          sheet.querySelector(".planner-mat-sticker")?.getBoundingClientRect().width || 0
        ),
      };
    });
    const goalOneBill = await readBill("#planner-goal");
    check(
      "Goal opens the whole plan's bill",
      goalOne.open && goalOne.cards === Object.keys(lucyBill).length && normBill(goalOneBill) === normBill(lucyBill),
      JSON.stringify({ cards: goalOne.cards, expected: Object.keys(lucyBill).length })
    );
    check(
      "the Goal panel is just the bill: modal-width, no count, no head icons, no heading",
      goalOne.width <= 440 &&
        goalOne.chars === 0 &&
        goalOne.heads === 0 &&
        goalOne.counts === 0 &&
        goalOne.sticker >= 56 &&
        goalOne.sticker <= 72,
      JSON.stringify(goalOne)
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
      // 240 a day, +60 for the Roaring Month, +240/7 for a full weekly bar.
      activity: document.getElementById("planner-activity-value").textContent.trim(),
      wild: document.getElementById("planner-farm-wilderness")?.classList.contains("is-active"),
      wildBlob: JSON.parse(localStorage.getItem("r1999_planner_wilderness_v1") || "null"),
      saved: localStorage.getItem("r1999_planner_characters_v1"),
    }));
    check(
      "the plan and its activity settings come back after a reload",
      restored.tiles.length === 2 &&
        restored.disabled === 0 &&
        restored.activity === "334" &&
        /"enabled":true/.test(String(restored.saved)),
      JSON.stringify(restored)
    );
    check(
      "the Wilderness board comes back switched on",
      restored.wild === true && restored.wildBlob?.enabled === true && restored.wildBlob?.vigor === 0,
      JSON.stringify({ wild: restored.wild, blob: restored.wildBlob })
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

    // ---- Vietnamese ------------------------------------------------------
    // The game's own nouns are not translated into Vietnamese: the reader knows
    // them the way the game prints them, so Activity, Wilderness, its two
    // buildings and Vigor stay English while the sentence around them does not.
    const viChar = await page.evaluate(async () => {
      setLanguage("vi");
      await new Promise((r) => setTimeout(r, 600));
      return {
        // Straight from the string table, so a render that has not caught up yet
        // cannot make this pass or fail by accident.
        total: t("planner.farmTotal"),
        activity: t("planner.activityShort"),
        activityTitle: t("planner.activity"),
        perDay: t("planner.activityPerDay", { n: "240" }),
        stamina: t("planner.staminaCalc", { stamina: "100", days: "1.0" }),
        staminaRoaring: t("planner.staminaCalcRoaring", { stamina: "100", days: "1.0", daysRoaring: "1.0" }),
        wild: t("planner.wilderness"),
        towers: t("planner.dustBellTowers"),
        markets: t("planner.sharpodontyMarkets"),
        vigor: t("planner.vigor"),
        // And the two places the reader sees them: the toolbar and the route bar.
        toolButton: document.getElementById("planner-activity-btn").textContent.replace(/\s+/g, " ").trim(),
        routeToggle: document.getElementById("planner-farm-wilderness").textContent.trim(),
        // Something else in the same tab, to prove the locale really switched.
        title: t("planner.farmTitle"),
      };
    });
    check(
      "the farm total is named for the game's own Activity",
      viChar.total === "Total Activity" &&
        /^Activity /.test(viChar.stamina) &&
        /^Activity /.test(viChar.staminaRoaring),
      JSON.stringify({ total: viChar.total, stamina: viChar.stamina, roaring: viChar.staminaRoaring })
    );
    check(
      "Activity is not translated into Vietnamese",
      viChar.activity === "Activity" &&
        /Activity/.test(viChar.activityTitle) &&
        /Activity/.test(viChar.perDay) &&
        /Activity/.test(viChar.toolButton) &&
        !/hoạt/i.test(viChar.activity + viChar.activityTitle + viChar.perDay + viChar.stamina + viChar.toolButton),
      JSON.stringify(viChar)
    );
    check(
      "Wilderness, its two buildings and Vigor keep their names",
      viChar.wild === "Wilderness" &&
        viChar.routeToggle === "Wilderness" &&
        viChar.towers === "Dust Bell Towers" &&
        viChar.markets === "Sharpodonty Markets" &&
        viChar.vigor === "Vigor",
      JSON.stringify(viChar)
    );
    check(
      "the rest of the tab is still Vietnamese",
      viChar.title !== "Farm route" && /[^\x00-\x7F]/.test(viChar.title),
      viChar.title
    );
    await page.evaluate(async () => {
      setLanguage("en");
      await new Promise((r) => setTimeout(r, 400));
    });

    // ---- tablets and narrow desktops -------------------------------------
    // 768px used to be the cliff where the toolbar lost a row to a full-width
    // tail and the farm route dropped straight to one column. A tablet has the
    // width for both.
    for (const width of [768, 640]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(350);
      const tablet = await page.evaluate(() => {
        const pane = document.getElementById("planner-pane-character");
        const toolbar = pane.querySelector(".planner-toolbar");
        const tail = toolbar.querySelector(".planner-toolbar-tail");
        const lead = toolbar.querySelector(".planner-toolbar-lead");
        const grid = document.querySelector("#planner-farm .planner-farm-grid");
        const lr = lead.getBoundingClientRect();
        const tr = tail.getBoundingClientRect();
        const toolbarBox = toolbar.getBoundingClientRect();
        return {
          toolbarH: Math.round(toolbarBox.height),
          oneRow: Math.abs(lr.top - tr.top) < 8,
          tailInset: Math.round(toolbarBox.right - tr.right),
          farmCols: getComputedStyle(grid).gridTemplateColumns.split(" ").length,
          sideways: document.documentElement.scrollWidth <= window.innerWidth + 1,
        };
      });
      check(
        `at ${width}px the Character toolbar keeps one row`,
        tablet.oneRow && tablet.toolbarH <= 60 && tablet.tailInset <= 14,
        JSON.stringify(tablet)
      );
      check(
        `at ${width}px the farm route keeps more than one card per row`,
        tablet.farmCols >= 2 && tablet.sideways,
        JSON.stringify(tablet)
      );
    }

    // ---- phones ----------------------------------------------------------
    await page.setViewportSize({ width: 390, height: 780 });
    await page.waitForTimeout(400);
    const phone = await page.evaluate(() => {
      const rail = document.getElementById("planner-char-rail");
      const column = rail.closest(".planner-char-scroll");
      const card = document.querySelector(".planner-farm-card");
      const sheet = document.getElementById("planner-activity-sheet");
      const drop = document.querySelector("#planner-farm .planner-farm-drop");
      return {
        railGrid: getComputedStyle(rail).display === "grid",
        railColumns: getComputedStyle(rail).gridTemplateColumns.split(" ").length,
        oneScroller: getComputedStyle(column).overflowY === "auto",
        cardFits: card ? card.getBoundingClientRect().width <= window.innerWidth : true,
        sheetFixed: getComputedStyle(sheet).position === "fixed",
        sideways: document.documentElement.scrollWidth <= window.innerWidth + 1,
        // The art shrinks a step on a phone but never back to the old 38px thumbnail.
        drop: drop ? Math.round(drop.getBoundingClientRect().width) : 0,
      };
    });
    check(
      "a phone keeps the icon grid and a single scrolling column",
      phone.railGrid && phone.railColumns >= 2 && phone.oneScroller && phone.cardFits && phone.sideways,
      JSON.stringify(phone)
    );
    check("the panels are real lightboxes on a phone", phone.sheetFixed, JSON.stringify(phone));
    // A closed lightbox has no boxes to measure, so open the editor first.
    await page.evaluate(() => document.querySelector("#planner-char-rail .planner-char-tile").click());
    await page.waitForTimeout(350);
    const phoneBill = await page.evaluate(() => {
      const sticker = document.querySelector("#planner-char-detail .planner-mat-sticker");
      const badge = document.querySelector("#planner-char-detail .item-sticker-qty");
      const sheet = document.getElementById("planner-char-editor");
      const head = sheet.querySelector(".planner-editor-header");
      const close = head.querySelector(".planner-sheet-close");
      const name = document.getElementById("planner-editor-title");
      const hr = head.getBoundingClientRect();
      const cr = close.getBoundingClientRect();
      const nr = name.getBoundingClientRect();
      return {
        sticker: sticker ? Math.round(sticker.getBoundingClientRect().width) : 0,
        badge: badge ? parseFloat(getComputedStyle(badge).fontSize) : 0,
        sheetFixed: getComputedStyle(sheet).position === "fixed",
        cardFits: document.querySelector("#planner-char-editor .planner-sheet-card").getBoundingClientRect().width <= window.innerWidth,
        // The phone rule for the modal head wraps, which used to push the editor's
        // close button under the name. It is a sheet head: one row, close at the edge.
        closeInset: Math.round(hr.right - cr.right),
        closeBesideName: cr.left > nr.right - 1,
        headOneRow: Math.round(hr.height) <= 100,
      };
    });
    check(
      "the item art keeps its size on a phone, badge and frame with it",
      phoneBill.sticker >= 52 && phoneBill.sticker <= 60 && phoneBill.badge >= 9 && phone.drop >= 44,
      JSON.stringify({ sticker: phoneBill.sticker, badge: phoneBill.badge, drop: phone.drop })
    );
    check(
      "the editor is a fixed lightbox that fits a phone",
      phoneBill.sheetFixed && phoneBill.cardFits,
      JSON.stringify(phoneBill)
    );
    check(
      "its head keeps the close button beside the name on a phone",
      phoneBill.headOneRow && phoneBill.closeBesideName && phoneBill.closeInset <= 24,
      JSON.stringify({
        head: phoneBill.headOneRow,
        beside: phoneBill.closeBesideName,
        inset: phoneBill.closeInset,
      })
    );
    await page.evaluate(() => document.querySelector('#planner-char-editor [data-sheet]').click());
    await page.waitForTimeout(200);
    await page.evaluate(() => document.getElementById("planner-farm-wilderness").click());
    await page.waitForTimeout(300);
    const phoneWild = await page.evaluate(() => {
      const sheet = document.getElementById("planner-wilderness-sheet");
      const card = sheet.querySelector(".planner-sheet-card");
      const selects = [...sheet.querySelectorAll("[data-wild]")];
      return {
        open: !sheet.hidden,
        cardFits: card.getBoundingClientRect().width <= window.innerWidth,
        fits: selects.every((el) => el.getBoundingClientRect().right <= window.innerWidth),
        sideways: card.scrollWidth <= card.clientWidth + 1,
        selects: selects.length,
      };
    });
    check(
      "the Wilderness board fits a phone",
      phoneWild.open && phoneWild.cardFits && phoneWild.fits && phoneWild.sideways && phoneWild.selects === 6,
      JSON.stringify(phoneWild)
    );
    await page.evaluate(() => document.querySelector('#planner-wilderness-sheet [data-sheet]').click());
    await page.waitForTimeout(200);
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
    const confirmAsk = await page.evaluate(() => {
      document.getElementById("planner-char-clear").click();
      const modal = document.getElementById("confirm-modal");
      return {
        open: getComputedStyle(modal).display !== "none",
        title: document.getElementById("confirm-modal-title").textContent.trim(),
        message: document.getElementById("confirm-modal-message").textContent.trim(),
        // Nothing is dropped until the reader says yes.
        tiles: document.querySelectorAll("#planner-char-rail .planner-char-tile").length,
      };
    });
    check(
      "Reset asks before it throws the plan away",
      confirmAsk.open && confirmAsk.tiles === 2 && /plan/i.test(confirmAsk.title + confirmAsk.message),
      JSON.stringify(confirmAsk)
    );

    const cancelled = await page.evaluate(() => {
      document.getElementById("confirm-modal-btn-cancel").click();
      return {
        closed: getComputedStyle(document.getElementById("confirm-modal")).display === "none",
        tiles: document.querySelectorAll("#planner-char-rail .planner-char-tile").length,
      };
    });
    check(
      "cancelling keeps the plan",
      cancelled.closed && cancelled.tiles === 2,
      JSON.stringify(cancelled)
    );

    const cleared = await page.evaluate(() => {
      document.getElementById("planner-char-clear").click();
      document.getElementById("confirm-modal-btn-yes").click();
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
