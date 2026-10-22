/**
 * Tests for the rotation card-plan editor: the AP stamps, the tag panel and the
 * bracket callouts.
 *
 *   node editor/_test/rotation-ui.test.mjs
 *
 * Runs the real page against a throwaway static server, because the point is
 * the drag-and-drop wiring rather than the model. Skips cleanly when playwright
 * is unavailable.
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

const NO_CACHE = new Set([".html", ".js", ".mjs", ".css", ".json"]);
const { createServer } = await import("node:http");
const server = createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
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
const BASE = `http://127.0.0.1:${server.address().port}/editor/index.html`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(e.message));

/** Fires one HTML5 drag from `fromSelector` to `toSelector` inside a round. */
const dragTo = (roundIndex, fromSelector, toSelector) =>
  page.evaluate(
    ({ roundIndex, fromSelector, toSelector }) => {
      const round = document.querySelectorAll("#rotation-detail .guide-round-editor")[roundIndex];
      const source = document.querySelector(fromSelector);
      const target = round.querySelector(toSelector);
      if (!source || !target) return false;
      const data = new DataTransfer();
      const fire = (node, type) =>
        node.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: data }));
      fire(source, "dragstart");
      fire(target, "dragover");
      fire(target, "drop");
      fire(source, "dragend");
      return true;
    },
    { roundIndex, fromSelector, toSelector }
  );

const roundInfo = (roundIndex) =>
  page.evaluate((i) => {
    const round = document.querySelectorAll("#rotation-detail .guide-round-editor")[i];
    if (!round) return null;
    return {
      slots: round.querySelectorAll(".guide-slot-editor").length,
      gaps: round.querySelectorAll(".guide-drop-gap").length,
      placeholders: round.querySelectorAll(".guide-slot-card.is-empty").length,
      annotations: round.querySelectorAll(".guide-annotation").length,
      headButtons: [...round.querySelectorAll(".guide-turn-head button")].map((b) => b.textContent),
    };
  }, roundIndex);

/** The tags drawn on one slot, so a tag already present elsewhere cannot skew it. */
const slotTags = (roundIndex, slotIndex) =>
  page.evaluate(
    ({ roundIndex, slotIndex }) => {
      const round = document.querySelectorAll("#rotation-detail .guide-round-editor")[roundIndex];
      const slot = round?.querySelectorAll(".guide-slot-editor")[slotIndex];
      if (!slot) return null;
      return {
        // Every plate draws its words on the blank ribbon, so the text is the label.
        plates: [...slot.querySelectorAll(".guide-tag-plate .guide-tag-plate-text")].map((n) => n.textContent),
        hasTags: slot.className.includes("has-tags"),
      };
    },
    { roundIndex, slotIndex }
  );

/* ------------------------------------------------------------------ */

await page.goto(BASE);
await page.waitForFunction(() => document.getElementById("source-label")?.textContent !== "…", { timeout: 15000 });
await page.click('button[data-tab="rotations"]');
await page.waitForTimeout(300);
await page.click("#rotation-list-body .row");
await page.waitForTimeout(400);

console.log("\n=== the round header no longer carries the AP buttons ===");
const head = await roundInfo(0);
check("the first rotation has rounds", head && head.slots > 0, JSON.stringify(head));
check(
  "only note / duplicate / remove are offered",
  head.headButtons.length === 3 && head.headButtons[0] === "+ Note",
  JSON.stringify(head.headButtons)
);
check("every slot has an insertion gap on both sides", head.gaps === head.slots + 1, `${head.gaps} gaps for ${head.slots} slots`);

console.log("\n=== the card panel opens on the AP tab ===");
await page.click('#rotation-detail .card button:has-text("Open card panel")');
await page.waitForTimeout(400);
const tabs = await page.evaluate(() =>
  [...document.querySelectorAll("#float-hand .hand-tabs .chip")].map((c) => ({ label: c.textContent, on: c.className.includes("on") }))
);
check("there are three tabs", tabs.length === 3, JSON.stringify(tabs));
check("AP is selected first", tabs[0]?.on && tabs[0]?.label === "AP", JSON.stringify(tabs));
const stamps = await page.evaluate(() =>
  [...document.querySelectorAll("#float-hand .guide-stamp")].map((s) => s.querySelector(".guide-stamp-label")?.textContent)
);
check(
  "Normal AP, OR AP and 1/4 AP are draggable stamps",
  stamps.includes("Normal AP") && stamps.includes("OR AP") && stamps.includes("1/4 AP"),
  JSON.stringify(stamps)
);

console.log("\n=== dropping a stamp inserts an empty slot ===");
const before = await roundInfo(0);
await dragTo(0, '#float-hand .guide-stamp.is-normal', ".guide-drop-gap");
await page.waitForTimeout(600);
const afterStamp = await roundInfo(0);
check("one slot was inserted", afterStamp.slots === before.slots + 1, `${before.slots} -> ${afterStamp.slots}`);
check("the new slot shows the Normal AP placeholder", afterStamp.placeholders === before.placeholders + 1, JSON.stringify(afterStamp));

console.log("\n=== dropping a card fills the placeholder ===");
await page.click('#float-hand .hand-tabs .chip:has-text("Cards")');
await page.waitForTimeout(300);
await dragTo(0, "#float-hand .guide-hand-card", ".guide-slot-editor");
await page.waitForTimeout(600);
const afterCard = await roundInfo(0);
check("the placeholder became a card", afterCard.placeholders === afterStamp.placeholders - 1, JSON.stringify(afterCard));
check("the slot count is unchanged", afterCard.slots === afterStamp.slots, `${afterCard.slots}`);

console.log("\n=== a tag toggles on a slot ===");
await page.click('#float-hand .hand-tabs .chip:has-text("Extra")');
await page.waitForTimeout(300);
const tagTiles = await page.evaluate(() =>
  [...document.querySelectorAll("#float-hand .guide-tag-tile .guide-tag-key")].map((n) => n.textContent)
);
check("AP Free and Precast are offered", tagTiles.includes("ap-free") && tagTiles.includes("precast"), JSON.stringify(tagTiles));
check("Move and Merge are gone", !tagTiles.includes("move") && !tagTiles.includes("merge"), JSON.stringify(tagTiles));
// The shipped rotation may already tag some slots, so this reads one slot only.
const tagsBefore = await slotTags(0, 0);
await dragTo(0, '#float-hand .guide-tag-tile[data-tag="ap-free"]', ".guide-slot-editor");
await page.waitForTimeout(600);
const tagged = await slotTags(0, 0);
check(
  "dropping AP Free flips the plate on that slot",
  tagged.plates.includes("AP Free") !== tagsBefore.plates.includes("AP Free"),
  `${JSON.stringify(tagsBefore)} -> ${JSON.stringify(tagged)}`
);
await dragTo(0, '#float-hand .guide-tag-tile[data-tag="ap-free"]', ".guide-slot-editor");
await page.waitForTimeout(600);
const untagged = await slotTags(0, 0);
check(
  "dragging it again puts the slot back",
  JSON.stringify(untagged) === JSON.stringify(tagsBefore),
  `${JSON.stringify(tagged)} -> ${JSON.stringify(untagged)}`
);

// Both tags draw on the blank ribbon, and the plaque stacks 5px under the badge.
await dragTo(0, '#float-hand .guide-tag-tile[data-tag="ap-free"]', ".guide-slot-editor");
await page.waitForTimeout(500);
await dragTo(0, '#float-hand .guide-tag-tile[data-tag="precast"]', ".guide-slot-editor");
await page.waitForTimeout(700);
const both = await page.evaluate(() => {
  const round = document.querySelectorAll("#rotation-detail .guide-round-editor")[0];
  const card = round.querySelector(".guide-slot-card");
  if (!card) return null;
  const cr = card.getBoundingClientRect();
  return [...card.querySelectorAll(":scope > .guide-tag-plate")].map((p) => {
    const r = p.getBoundingClientRect();
    return {
      text: p.querySelector(".guide-tag-plate-text")?.textContent || "",
      top: Math.round(r.top - cr.top),
      h: Math.round(r.height),
      w: Math.round(r.width),
    };
  });
});
check(
  "both plates are drawn",
  both && both.length === 2 && both.every((p) => p.w > 0 && p.h > 0),
  JSON.stringify(both)
);
check(
  "and they carry their own words on the blank ribbon",
  both && both[0]?.text === "AP Free" && both[1]?.text === "Precast",
  JSON.stringify(both)
);
check(
  "the plates are 13px tall",
  both && both.every((p) => p.h === 13),
  JSON.stringify(both && both.map((p) => p.h))
);
check(
  "Precast sits 5px under AP Free",
  both && both[1] && both[1].top === both[0].top + both[0].h + 5,
  JSON.stringify(both)
);

console.log("\n=== + Note adds a bracket note straight away ===");
// The shipped rotation may already carry notes, so this counts the difference.
const notesBefore = await roundInfo(0);
await page.locator("#rotation-detail .guide-round-editor").first().locator('button:has-text("+ Note")').click();
await page.waitForTimeout(500);
const withNote = await roundInfo(0);
check(
  "a note row is added without any further clicks",
  withNote.annotations === notesBefore.annotations + 1,
  `${notesBefore.annotations} -> ${withNote.annotations}`
);
const noteStart = await page.evaluate(() => {
  const rows = document.querySelectorAll("#rotation-detail .guide-round-editor")[0].querySelectorAll(".guide-annotation");
  const row = rows[rows.length - 1];
  if (!row) return null;
  const slots = document.querySelectorAll("#rotation-detail .guide-round-editor")[0].querySelectorAll(".guide-slot-editor").length;
  return {
    from: row.querySelector(".guide-annotation-index").value,
    to: [...row.querySelectorAll(".guide-annotation-index")][1].value,
    slots,
  };
});
check(
  "it starts out spanning the whole round",
  noteStart && noteStart.from === "1" && noteStart.to === String(noteStart.slots),
  JSON.stringify(noteStart)
);

console.log("\n=== Pick narrows a note to two cards ===");
await page.locator("#rotation-detail .guide-annotation button:has-text('Pick')").last().click();
await page.waitForTimeout(300);
await page.evaluate(() => {
  const slots = document.querySelectorAll("#rotation-detail .guide-round-editor")[0].querySelectorAll(".guide-slot-editor");
  slots[0].click();
  slots[1].click();
});
await page.waitForTimeout(600);
const note = await page.evaluate(() => {
  const rows = document.querySelectorAll("#rotation-detail .guide-round-editor")[0].querySelectorAll(".guide-annotation");
  const row = rows[rows.length - 1];
  if (!row) return null;
  return {
    style: row.className,
    from: row.querySelector(".guide-annotation-index").value,
    to: [...row.querySelectorAll(".guide-annotation-index")][1].value,
  };
});
check("it spans the two picked slots", note && note.from === "1" && note.to === "2", JSON.stringify(note));
await page.evaluate(() => {
  const input = document.querySelector("#rotation-detail .guide-annotation-text");
  input.value = "Activate [Sensory Bond] whenever it is available.";
  input.dispatchEvent(new Event("change", { bubbles: true }));
});
await page.waitForTimeout(500);
const noteText = await page.evaluate(() => document.querySelector("#rotation-detail .guide-annotation-text")?.value);
check("the text is kept", noteText === "Activate [Sensory Bond] whenever it is available.", noteText);

console.log("\n=== a note can be deleted ===");
const notesBeforeDelete = await roundInfo(0);
const removeBtn = await page.evaluate(() => {
  const btn = document.querySelector("#rotation-detail .guide-annotation-remove");
  if (!btn) return null;
  const r = btn.getBoundingClientRect();
  return { title: btn.title, visible: r.width > 0 && r.height > 0, opacity: getComputedStyle(btn).opacity };
});
check(
  "each note row has a visible remove button",
  removeBtn && removeBtn.visible && removeBtn.opacity === "1" && removeBtn.title === "Remove this note",
  JSON.stringify(removeBtn)
);
await page.locator("#rotation-detail .guide-annotation-remove").last().click();
await page.waitForTimeout(600);
const notesAfterDelete = await roundInfo(0);
check(
  "clicking it removes that note",
  notesAfterDelete.annotations === notesBeforeDelete.annotations - 1,
  `${notesBeforeDelete.annotations} -> ${notesAfterDelete.annotations}`
);

console.log("\n=== a surface dragged from Extra decorates one card ===");
const surfaceTiles = await page.evaluate(() =>
  [...document.querySelectorAll("#float-hand .guide-surface-tile")].map((t) => t.dataset.surface)
);
check("the Ramona surface is offered", surfaceTiles.includes("ramona"), JSON.stringify(surfaceTiles));
check("Ramona Ultimate is no longer offered", !surfaceTiles.includes("ramona-ultimate"), JSON.stringify(surfaceTiles));
const surfacesBefore = await page.evaluate(() =>
  [...document.querySelectorAll("#rotation-detail .guide-round-editor")[0].querySelectorAll(".guide-slot-card")]
    .map((c) => c.dataset.surface)
);
await page.evaluate(() => {
  const round = document.querySelectorAll("#rotation-detail .guide-round-editor")[0];
  const tile = document.querySelector('#float-hand .guide-surface-tile[data-surface="ramona"]');
  const card = round.querySelector(".guide-slot-card");
  const data = new DataTransfer();
  const fire = (n, t) => n.dispatchEvent(new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: data }));
  fire(tile, "dragstart");
  fire(card, "dragover");
  fire(card, "drop");
  fire(tile, "dragend");
});
await page.waitForTimeout(700);
const surfacesAfter = await page.evaluate(() =>
  [...document.querySelectorAll("#rotation-detail .guide-round-editor")[0].querySelectorAll(".guide-slot-card")]
    .map((c) => c.dataset.surface)
);
check("the dropped card takes the surface", surfacesAfter[0] === "ramona", JSON.stringify(surfacesAfter));
check(
  "the other cards are untouched",
  surfacesAfter.slice(1).join() === surfacesBefore.slice(1).join(),
  `${JSON.stringify(surfacesBefore)} -> ${JSON.stringify(surfacesAfter)}`
);
const surfaceImg = await page.evaluate(() =>
  !!document.querySelector("#rotation-detail .guide-round-editor .guide-card-surface")
);
check("the surface is drawn over the card", surfaceImg, String(surfaceImg));

console.log("\n=== Conduit is offered as a second surface ===");
check("the Conduit surface is offered", surfaceTiles.includes("conduit"), JSON.stringify(surfaceTiles));

console.log("\n=== the free-text tag carries the author's words ===");
await page.evaluate(() => {
  const round = document.querySelectorAll("#rotation-detail .guide-round-editor")[0];
  const tile = document.querySelector('#float-hand .guide-tag-tile[data-tag="custom"]');
  const slot = round.querySelector(".guide-slot-editor");
  const data = new DataTransfer();
  const fire = (n, t) => n.dispatchEvent(new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: data }));
  fire(tile, "dragstart");
  fire(slot, "dragover");
  fire(slot, "drop");
  fire(tile, "dragend");
});
await page.waitForTimeout(700);
const tagTextInput = await page.$("#rotation-detail .guide-slot-editor .guide-tag-text-input");
check("a text box appears under the slot", !!tagTextInput);
if (tagTextInput) {
  await tagTextInput.fill("Repeat loop");
  await tagTextInput.press("Enter");
  await page.waitForTimeout(600);
}
/** The plate on the slot that carries the free-text input. */
const readTextTagPlate = () =>
  page.evaluate(() => {
    const plate = document.querySelector('#rotation-detail .guide-slot-card > .guide-tag-plate[data-tag="custom"]');
    if (!plate) return null;
    const r = plate.getBoundingClientRect();
    const card = plate.parentElement.getBoundingClientRect();
    return {
      text: plate.querySelector(".guide-tag-plate-text")?.textContent,
      src: plate.querySelector("img")?.getAttribute("src").split("/").pop(),
      h: Math.round(r.height),
      w: Math.round(r.width),
      cardW: Math.round(card.width),
      size: parseFloat(getComputedStyle(plate).fontSize),
      font: getComputedStyle(plate).fontFamily.split(",")[0],
    };
  });
const customPlate = await readTextTagPlate();
check(
  "the plate draws the typed words on the blank tag art",
  customPlate && customPlate.text === "Repeat loop" && customPlate.src === "Tag_Empty.png",
  JSON.stringify(customPlate)
);
check(
  "the plate stays inside the card",
  customPlate && customPlate.w <= customPlate.cardW,
  JSON.stringify(customPlate)
);
check(
  "and it keeps the plate's height and serif",
  customPlate && customPlate.h === 13 && /Regular/.test(customPlate.font),
  JSON.stringify(customPlate)
);
// A long tag must shrink rather than spill: the plate is capped at the card and
// the words lose a point of size until they fit.
const longInput = await page.$("#rotation-detail .guide-slot-editor .guide-tag-text-input");
if (longInput) {
  await longInput.fill("asdasdasdasdasdasdasdas");
  await longInput.press("Enter");
  await page.waitForTimeout(700);
}
const longPlate = await readTextTagPlate();
check(
  "a long tag shrinks to stay inside the card",
  longPlate && longPlate.w <= longPlate.cardW && longPlate.size < 9,
  JSON.stringify(longPlate)
);

console.log("\n=== Other offers the ownerless cards ===");
const otherCards = await page.evaluate(() =>
  [...document.querySelectorAll("#float-hand .special-card-grid .guide-hand-card")].map((c) => c.dataset.other)
);
check(
  "Any, Move, Generate, Remove and Refresh are offered",
  ["any", "move", "generate", "remove", "refresh"].every((key) => otherCards.includes(key)),
  JSON.stringify(otherCards)
);
await page.evaluate(() => {
  const round = document.querySelectorAll("#rotation-detail .guide-round-editor")[0];
  const tile = document.querySelector('#float-hand .guide-hand-card[data-other="move"]');
  const slot = round.querySelector(".guide-slot-editor");
  const data = new DataTransfer();
  const fire = (n, t) => n.dispatchEvent(new DragEvent(t, { bubbles: true, cancelable: true, dataTransfer: data }));
  fire(tile, "dragstart");
  fire(slot, "dragover");
  fire(slot, "drop");
  fire(tile, "dragend");
});
await page.waitForTimeout(700);
const otherArt = await page.evaluate(() =>
  document.querySelector("#rotation-detail .guide-slot-editor .guide-slot-card .guide-card-art")?.getAttribute("src")
);
check("dropping Move fills the slot with its art", otherArt === "../images/card_modulo/Move.png", String(otherArt));

console.log("\n=== no page errors ===");
check("the page stayed clean", pageErrors.length === 0, pageErrors.join(" | "));

await browser.close();
server.close();
console.log(`\n=== ${checks - failures}/${checks} checks passed ===`);
process.exit(failures === 0 ? 0 : 1);

