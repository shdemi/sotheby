/**
 * Sotheby's Mansion — Rotation Workbench.
 *
 * A standalone editor for `content/rotations.json`. It is the editor's
 * Rotations tab with the rest of the data editor taken away: the plan list, the
 * plan itself, and the floating card palette.
 *
 * Nothing is written to the host. The page reads the published data over HTTP
 * and hands the changed files back as a ZIP, exactly like `editor/`. The model,
 * the rotation helpers and the file access all come from `../editor/` rather
 * than being copied, so a fix there lands here too.
 */
import {
  Model,
  ROTATION_ARCHETYPES,
  EXCLUSIVE_ARCHETYPES,
  ARCHETYPE_COLORS,
  TUNINGS,
  GUIDE_SLOT_TAGS,
  PANEL_SLOT_TAGS,
  GUIDE_SLOT_TAG_TEXT_KEY,
  PANEL_CARD_SURFACES,
  GUIDE_OTHER_CARDS,
  GUIDE_ANNOTATION_STYLES,
  guideSlotLayout,
  guideSlotTags,
  guideSlotTagText,
  guideSlotTagLabel,
  guideCardIsUltimate,
  guideSkillIsUltimate,
  guideCardSurface,
  validate,
  readNameTables,
} from "../editor/model.js";
import * as files from "../editor/files.js";

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */

const state = {
  model: null,
  appJs: "",
  picker: null,
  drag: null,
  filters: { archetypes: new Set() },
  guide: {
    rotation: null,
    hand: null,
    panelTab: "ap",
    lastPanelTab: "ap",
    panelOpen: true,
    notePick: null,
    focusNote: null,
    focusRoundNote: null,
  },
  noteLang: "en",
};

const $ = (id) => document.getElementById(id);

const el = (tag, props = {}, children = []) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k === "html") node.innerHTML = v;
    else if (k === "dataset") Object.assign(node.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, "");
    else if (v !== false && v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
};

/** Icon paths, resolved from the `rotation/` folder. */
const ICON = {
  psychube: (rarity, id) => `../images/psychube_icon/${rarity}/${id}.png`,
};

function banner(message, kind = "error") {
  const node = $("banner");
  if (!node) return;
  if (!message) {
    node.hidden = true;
    return;
  }
  node.hidden = false;
  node.className = `banner${kind === "info" ? " info" : ""}`;
  node.textContent = message;
}

/* ------------------------------------------------------------------ *
 * Loading
 * ------------------------------------------------------------------ */

function bootStep(pct, label) {
  const bar = $("boot-bar");
  const status = $("boot-status");
  if (bar) bar.style.width = `${pct}%`;
  if (status && label) status.textContent = label;
}

async function boot() {
  document.body.classList.add("is-booting");
  bootStep(10, "READING MANIFEST 010%");
  let failed = false;
  try {
    await load();
  } catch (e) {
    failed = true;
    bootStep(100, "LOAD FAILED");
    banner(`Could not load the data: ${e.message}. Serve the site over HTTP (python serve.py).`);
  }
  if (!failed) bootStep(100, "READY");

  const overlay = $("boot");
  window.setTimeout(() => {
    if (overlay) overlay.classList.add("is-done");
    document.body.classList.remove("is-booting");
  }, failed ? 1400 : 320);
}

async function load() {
  bootStep(34, "FETCHING DATASET 034%");
  const loaded = await files.loadAll();
  state.appJs = loaded.appJs;
  bootStep(72, "COMPILING MODEL 072%");

  const missing = [...files.WRITABLE, ...files.READ_ONLY].filter((n) => loaded.texts[n] === undefined);
  const nameTables = readNameTables(loaded.appJs);
  state.model = new Model(loaded.texts, {
    arcanistMap: JSON.parse(loaded.texts["ArcanistMap.json"]),
    nameTables,
  });

  $("source-label").textContent =
    location.protocol === "file:"
      ? "file:// — use a local server"
      : "read-only · downloads a zip";

  if (missing.length) banner(`Missing data files: ${missing.join(", ")}`);
  else banner("");

  bootStep(88, "LINKING ROTATIONS 088%");
  renderRotationList();
  updateSaveState();
}

/* ------------------------------------------------------------------ *
 * Chrome: save state + re-render
 * ------------------------------------------------------------------ */

function updateSaveState() {
  const changed = state.model ? state.model.changedFiles() : [];

  const save = $("btn-save");
  if (save) {
    save.disabled = changed.length === 0;
    save.textContent = changed.length === 0 ? "Download" : `Download ${changed.length}`;
    save.title =
      changed.length === 0
        ? "Nothing has changed yet"
        : `Download a ZIP holding ${changed.join(", ")}`;
  }

  const pending = $("pending-label");
  if (pending) {
    pending.textContent = changed.length === 0 ? "NO CHANGES" : `${changed.length} PENDING`;
    pending.classList.toggle("has-changes", changed.length > 0);
  }

  const dot = $("status-dot");
  if (dot) {
    dot.classList.toggle("is-dirty", changed.length > 0);
    dot.classList.toggle("is-error", false);
  }

  const text = $("status-text");
  if (text && state.model) {
    const count = state.model.guideRotations().length;
    text.textContent = `${String(count).padStart(2, "0")} PLANS · READ-ONLY · DOWNLOADS A ZIP OF YOUR CHANGES`;
  }
}

/**
 * Re-renders what changed. The plan list rebuilds the detail pane too, so a list
 * edit only needs one call; any control that opts in with `data-focus-key` gets
 * its focus back afterwards, because re-rendering replaces the node.
 */
function afterEdit({ list = true, detail = true } = {}) {
  const active = document.activeElement;
  const focusKey = active && active.dataset ? active.dataset.focusKey : null;

  if (list) renderRotationList();
  else if (detail) renderRotationDetail();

  updateSaveState();

  if (focusKey) {
    const next = document.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`);
    if (next) next.focus();
  }
}

/* ------------------------------------------------------------------ *
 * Rotation helpers — the card plan
 * ------------------------------------------------------------------ */

/** Skill cards for a character, read from guide_skills.json. */
function rotationSkills(name) {
  const table = state.model.value("guide_skills.json") || {};
  const list = table[state.model.resolve(name)];
  return Array.isArray(list) ? list : [];
}

const SLOT_LABELS = { normal: "AP", or: "OR", double_or: "OR", or3: "OR", lb: "1/4 AP", text: "TEXT", tuning: "TUNING" };

/** A tag's label and rendering style, or null for an unknown key. */
function guideTagInfo(key) {
  return GUIDE_SLOT_TAGS.find((tag) => tag.key === key) || null;
}

/** The card layers: the art, the Ultimate plate when it applies, then a surface. */
function guideCardLayers(card, artSrc) {
  const ultimate = guideCardIsUltimate(card);
  const inset = ultimate
    ? { left: 6.56, top: 7.3, width: 87.98, height: 86.35 }
    : { left: 0, top: 0, width: 100, height: 100 };
  const artStyle =
    `left:${inset.left}%;top:${inset.top}%;width:${inset.width}%;height:${inset.height}%;` +
    `border-radius:${ultimate ? "50% 50% 0 0 / 22% 22% 0 0" : "0"}`;
  const surface = guideCardSurface(card.surface);
  const layers = [el("img", { class: "guide-card-art", src: artSrc, alt: "", style: artStyle })];
  if (ultimate) {
    layers.push(el("img", { class: "guide-card-frame", src: "../images/card_modulo/Ultimate.png", alt: "" }));
  }
  // A surface is the same size as its card shape, so it is simply laid on top.
  if (surface) layers.push(el("img", { class: "guide-card-surface", src: `../${surface.image}`, alt: "" }));
  return { ultimate, surface, html: layers };
}

/** Reads the payload a drag carries, falling back to the armed one. */
function readDragPayload(e) {
  try {
    const raw = e?.dataTransfer?.getData("text/plain");
    if (raw && raw.startsWith("{")) return JSON.parse(raw);
  } catch {
    // keep the armed payload
  }
  return state.drag;
}

/** A tag's plate, drawn from the shipped art with its words laid on it. */
function guideTagPlate(tag, text = "") {
  return el(
    "span",
    { class: `guide-tag-plate is-${tag.kind} is-text`, title: text || tag.label, dataset: { tag: tag.key } },
    [el("img", { src: `../${tag.image}`, alt: "" }), el("span", { class: "guide-tag-plate-text", text })]
  );
}

/**
 * Shrinks a tag's words until the plate fits inside its card. Runs after layout,
 * because the width the words may use is the card's, not the plate's.
 */
function fitGuideTagPlates(root = document) {
  for (const plate of root.querySelectorAll(".guide-slot-card > .guide-tag-plate.is-text")) {
    const text = plate.querySelector(".guide-tag-plate-text");
    const card = plate.parentElement;
    if (!text || !card) continue;
    plate.style.fontSize = "";
    const pad = parseFloat(getComputedStyle(plate).paddingLeft) + parseFloat(getComputedStyle(plate).paddingRight);
    const available = card.clientWidth;
    let size = parseFloat(getComputedStyle(plate).fontSize) || 9;
    // Stop at 6px: below that the words stop reading, so the plate clips instead.
    while (size > 6 && text.scrollWidth + pad > available) {
      size -= 0.5;
      plate.style.fontSize = `${size}px`;
    }
  }
}

/**
 * Runs a measurement pass after the browser has laid the new nodes out.
 *
 * `requestAnimationFrame` is the right primitive, but it never fires in a hidden
 * or unfocused tab — and layout boxes are still correct there — so a timer
 * guards it. The first one to run wins.
 */
function afterLayout(fn) {
  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    fn();
  };
  requestAnimationFrame(() => requestAnimationFrame(run));
  window.setTimeout(run, 120);
}

/** The icon for one card: the pinned icon wins, else the skill's first variant. */
function cardIcon(card) {
  if (card.special) return `../${card.special}`;
  if (card.icon) return `../${card.icon}`;
  const hit = rotationSkills(card.character).find((s) => Number(s.skill) === Number(card.skill));
  return hit ? `../${hit.icon}` : "";
}

/** The two tuning cards a Tuning AP slot can carry. */
const TUNING_ICONS = {
  S1: "images/skills/Tuning_S1.png",
  S2: "images/skills/Tuning_S2.png",
};

function rotationMembers(rotation) {
  return (rotation.members || [])
    .map((entry) => (typeof entry === "string" ? { character: entry, psychube: "" } : entry))
    .filter((entry) => entry && entry.character);
}

function rotationRounds(rotation) {
  if (Array.isArray(rotation.rounds)) return rotation.rounds;
  if (!Array.isArray(rotation.turns)) return [];
  return rotation.turns.map((turn) => ({
    note: "",
    slots: (turn.cards || []).map((card) => ({ cards: card ? [card] : [] })),
  }));
}

/* ------------------------------------------------------------------ *
 * Notes: one field per language, switched from the plan head
 * ------------------------------------------------------------------ */

const NOTE_LANGS = [
  { id: "en", label: "EN", title: "English", placeholder: "Note" },
  { id: "vi", label: "VI", title: "Tiếng Việt", placeholder: "Ghi chú" },
  { id: "cn", label: "CN", title: "中文", placeholder: "注释" },
];

function currentNoteLang() {
  const id = state.noteLang || "en";
  return NOTE_LANGS.find((lang) => lang.id === id) || NOTE_LANGS[0];
}

function renderNoteLangSwitch() {
  const current = currentNoteLang().id;
  return el(
    "div",
    {
      class: "note-lang-switch",
      title: "Language used for round and bracket notes",
      role: "group",
      "aria-label": "Note language",
    },
    [
      el("span", { class: "note-lang-label", text: "Notes" }),
      ...NOTE_LANGS.map((lang) =>
        el("button", {
          class: `chip${current === lang.id ? " on" : ""}`,
          text: lang.label,
          title: lang.title,
          type: "button",
          "aria-pressed": current === lang.id ? "true" : "false",
          onclick: () => {
            if (state.noteLang === lang.id) return;
            state.noteLang = lang.id;
            afterEdit({ list: false });
          },
        })
      ),
    ]
  );
}

function getMultiText(val, lang) {
  if (!val) return "";
  if (typeof val === "object" && val !== null) return val[lang] || "";
  return lang === "en" ? String(val) : "";
}

function updateMultiText(current, lang, newText) {
  let obj;
  if (typeof current === "object" && current !== null) obj = { ...current };
  else obj = { en: current || "" };
  obj[lang] = (newText || "").trim();

  const en = (obj.en || "").trim();
  const vi = (obj.vi || "").trim();
  const cn = (obj.cn || "").trim();

  if (!vi && !cn) return en;
  const result = {};
  if (en) result.en = obj.en;
  if (vi) result.vi = obj.vi;
  if (cn) result.cn = obj.cn;
  return Object.keys(result).length > 0 ? result : "";
}

function renderMultilingualNotesEditor({ value, onSave, placeholder = "Notes" }) {
  const container = el("div", { class: "field" });
  container.appendChild(el("label", { class: "field-label", text: "Notes" }));

  const noteLang = currentNoteLang();
  const lang = noteLang.id;
  const label = noteLang.label;
  const title = noteLang.title;

  const enText = getMultiText(value, "en");
  if (lang !== "en" && enText) {
    container.appendChild(
      el("div", {
        class: "field-note",
        text: `EN: ${enText}`,
        title: enText,
      })
    );
  }

  const row = el("div", { class: "field-row", style: "margin-top: 0;" });
  const badge = el("span", { class: "flag", text: label, title });
  const textarea = el("textarea", {
    rows: 2,
    style: "flex: 1; min-width: 0;",
    placeholder: `${placeholder} (${label} · ${title})`,
  });
  textarea.value = getMultiText(value, lang);
  textarea.addEventListener("change", () => {
    const next = updateMultiText(value, lang, textarea.value);
    value = next;
    onSave(next);
  });

  row.appendChild(badge);
  row.appendChild(textarea);
  container.appendChild(row);
  return container;
}

/* ------------------------------------------------------------------ *
 * Team cells
 * ------------------------------------------------------------------ */

/** A small segmented control for the portrait tier: "–", "P1" … "P5". */
function portraitSeg(current, onPick, focusKey) {
  const wrap = el("div", { class: "seg seg-portrait" });
  const tier = Math.max(0, Math.min(5, Number(current) || 0));
  for (const [value, label] of [
    [0, "–"],
    [1, "P1"],
    [2, "P2"],
    [3, "P3"],
    [4, "P4"],
    [5, "P5"],
  ]) {
    wrap.appendChild(
      el("button", {
        class: tier === value ? "on" : "",
        text: label,
        title: value === 0 ? "No portrait" : `Portrait ${value}`,
        dataset: focusKey ? { focusKey: `${focusKey}-${value}` } : {},
        onclick: (e) => {
          e.stopPropagation();
          onPick(value);
        },
      })
    );
  }
  return wrap;
}

/** Opens the psychube picker, offering "(none)" first. */
function pickPsychube(current, onPick) {
  const model = state.model;
  const options = ["", ...model.psychubes.map((p) => p.name)];
  openPicker(options, onPick, current || "", (name) => {
    const found = model.psychubes.find((x) => x.name === name);
    return found
      ? { label: `${name}\n${found.rarity}★`, img: ICON.psychube(found.rarity, found.id) }
      : { label: "(none)", img: "" };
  });
}

/** A clickable psychube cell showing the icon and name. */
function psychubeCell(name, onPick, focusKey) {
  const model = state.model;
  const found = model.psychubes.find((x) => x.name.toLowerCase() === String(name || "").toLowerCase());
  return el(
    "button",
    {
      class: `sub-pick${name ? "" : " empty"}`,
      title: name ? "Click to change" : "Click to add a psychube",
      dataset: focusKey ? { focusKey } : {},
      onclick: (e) => {
        e.stopPropagation();
        pickPsychube(name, onPick);
      },
    },
    [
      found ? el("img", { src: ICON.psychube(found.rarity, found.id), class: "chube", alt: "" }) : null,
      el("span", { class: "name", text: name || "(no psychube)" }),
    ]
  );
}

/** A clickable character cell showing the avatar and name. */
function characterCell(name, onPick, focusKey) {
  const model = state.model;
  const c = model.character(name);
  return el(
    "button",
    {
      class: `sub-pick${name ? "" : " empty"}`,
      title: "Click to change",
      dataset: focusKey ? { focusKey } : {},
      onclick: (e) => {
        e.stopPropagation();
        openPicker(model.characters, onPick, name, (n) => ({ label: n, img: model.character(n).avatar }));
      },
    },
    [
      c.avatar ? el("img", { src: c.avatar, class: "face", alt: "" }) : null,
      el("span", { class: "name", text: name || "(none)" }),
    ]
  );
}

/* ------------------------------------------------------------------ *
 * Picker
 * ------------------------------------------------------------------ */

function openPicker(items, onPick, current, describe) {
  state.picker = { items, onPick, current, describe };
  $("picker").hidden = false;
  $("picker-search").value = "";
  renderPicker("");
  $("picker-search").focus();
}

function renderPicker(query) {
  const picker = state.picker;
  if (!picker) return;
  const host = $("picker-body");
  host.replaceChildren();

  const q = query.trim().toLowerCase();
  const frag = document.createDocumentFragment();
  for (const item of picker.items) {
    const info = picker.describe(item);
    if (q && !String(info.label).toLowerCase().includes(q)) continue;

    const btn = el("button", { class: item === picker.current ? "on" : "" }, [
      info.img ? el("img", { src: info.img, alt: "", loading: "lazy" }) : el("div", { style: "height:66px" }),
      el("div", { class: "n", text: info.label }),
    ]);
    btn.addEventListener("click", () => {
      picker.onPick(item);
      closePicker();
    });
    frag.appendChild(btn);
  }
  host.appendChild(frag);
}

function closePicker() {
  state.picker = null;
  $("picker").hidden = true;
}

/* ------------------------------------------------------------------ *
 * Plan list
 * ------------------------------------------------------------------ */

function filteredRotations() {
  const query = ($("rotation-search").value || "").trim().toLowerCase();
  return state.model.guideRotations().filter((rotation) => {
    const tags = Array.isArray(rotation.archetypes) ? rotation.archetypes : [];
    if (state.filters.archetypes.size > 0 && !tags.some((tag) => state.filters.archetypes.has(tag))) return false;
    if (!query) return true;
    const haystack = [
      rotation.name || "",
      rotation.id || "",
      rotation.notes || "",
      rotation.tuning || "",
      ...tags,
      ...rotationMembers(rotation).map((m) => m.character),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
}

function renderRotationFilters() {
  const host = $("rotation-filters");
  if (!host) return;
  host.replaceChildren();
  for (const tag of ROTATION_ARCHETYPES) {
    host.appendChild(
      el("button", {
        class: `chip${state.filters.archetypes.has(tag) ? " on" : ""}`,
        text: tag,
        onclick: () => {
          if (state.filters.archetypes.has(tag)) state.filters.archetypes.delete(tag);
          else state.filters.archetypes.add(tag);
          renderRotationList();
        },
      })
    );
  }
}

function renderRotationList() {
  if (!state.model) return;
  renderRotationFilters();

  const body = $("rotation-list-body");
  const scrollTop = body.scrollTop;
  body.replaceChildren();
  const rotations = filteredRotations();
  const total = state.model.guideRotations().length;

  const count = $("rotation-count");
  if (count) {
    count.textContent = `${String(rotations.length).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;
  }

  for (const rotation of rotations) {
    const tags = Array.isArray(rotation.archetypes) ? rotation.archetypes : [];
    // The index in the full list, so a filtered view still reorders correctly.
    const index = state.model.guideRotations().findIndex((r) => r && r.id === rotation.id);
    const row = el(
      "div",
      {
        class: `row${state.guide.rotation === rotation.id ? " on" : ""}`,
        onclick: () => {
          state.guide.rotation = rotation.id;
          state.guide.hand = null;
          state.guide.notePick = null;
          renderRotationList();
          renderRotationDetail();
        },
      },
      [
        el("span", { class: "drag-handle rot-handle", text: "⠿", title: "Drag to reorder", draggable: "true" }),
        el("div", { class: "row-main" }, [
          el("div", { class: "row-name", text: rotation.name || rotation.id || "" }),
          el("div", {
            class: "row-sub",
            text: `${String(rotationRounds(rotation).length).padStart(2, "0")} rnd${
              tags.length ? ` · ${tags.join(", ")}` : ""
            }`,
          }),
        ]),
        el(
          "div",
          { class: "row-flags" },
          rotationMembers(rotation)
            .slice(0, 4)
            .map((member) => el("img", { src: state.model.character(member.character).avatar, class: "row-face", alt: "", title: member.character }))
        ),
        // A plan is the unit people pass around, so it leaves as its own file.
        el("button", {
          class: "row-act",
          text: "Export",
          title: `Download “${rotation.name || rotation.id}” as a .rotation.json file`,
          "aria-label": `Export ${rotation.name || rotation.id}`,
          onclick: (e) => {
            e.stopPropagation();
            exportRotation(rotation.id);
          },
        }),
      ]
    );

    // Only the handle starts a drag, so clicking the row still selects it; the
    // drop listeners live on every row because dragstart does not re-render.
    const handle = row.querySelector(".rot-handle");
    handle.addEventListener("dragstart", (e) => {
      state.drag = { kind: "rotation", id: rotation.id, index };
      row.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", rotation.id || "");
      e.stopPropagation();
    });
    handle.addEventListener("dragend", () => {
      row.classList.remove("dragging");
      state.drag = null;
      for (const r of body.querySelectorAll(".row")) r.classList.remove("drop-above", "drop-below");
    });

    row.addEventListener("dragover", (e) => {
      const drag = state.drag;
      if (!drag || drag.kind !== "rotation" || drag.id === rotation.id) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      const rect = row.getBoundingClientRect();
      const above = e.clientY < rect.top + rect.height / 2;
      row.classList.toggle("drop-above", above);
      row.classList.toggle("drop-below", !above);
    });
    row.addEventListener("dragleave", () => row.classList.remove("drop-above", "drop-below"));
    row.addEventListener("drop", (e) => {
      const drag = state.drag;
      row.classList.remove("drop-above", "drop-below");
      if (!drag || drag.kind !== "rotation" || drag.id === rotation.id) return;
      e.preventDefault();
      e.stopPropagation();

      const totalRounds = state.model.guideRotations().length;
      const rect = row.getBoundingClientRect();
      const above = e.clientY < rect.top + rect.height / 2;
      // Removing the dragged rotation first shifts the rest down by one.
      let target = above ? index : index + 1;
      if (drag.index < target) target -= 1;
      target = Math.max(0, Math.min(totalRounds - 1, target));

      state.drag = null;
      state.model.moveGuideRotation(drag.index, target);
      afterEdit();
    });

    body.appendChild(row);
  }

  if (rotations.length === 0) {
    body.appendChild(
      el("div", { class: "empty", text: total === 0 ? "No plans yet." : "No plan matches these filters." })
    );
  }

  body.scrollTop = scrollTop;

  if (!state.guide.rotation || !rotations.some((r) => r.id === state.guide.rotation)) {
    state.guide.rotation = rotations[0] ? rotations[0].id : null;
  }
  renderRotationDetail();
}

/* ------------------------------------------------------------------ *
 * Rotation transfer — one rotation out as a file, one back in
 * ------------------------------------------------------------------ */

function exportRotation(id) {
  const payload = state.model.exportGuideRotation(id);
  if (!payload) {
    banner("That rotation is no longer in the list.");
    return;
  }
  const filename = `${payload.rotation.id}.rotation.json`;
  files.downloadFile(filename, `${JSON.stringify(payload, null, 2)}\n`);
  banner(`Exported “${payload.rotation.name || payload.rotation.id}” as ${filename}.`, "info");
}

function openRotationImport() {
  const dialog = $("rotation-import");
  if (!dialog) return;
  $("rotation-import-text").value = "";
  const report = $("rotation-import-report");
  report.hidden = true;
  report.replaceChildren();
  dialog.hidden = false;
  $("rotation-import-text").focus();
}

function closeRotationImport() {
  const dialog = $("rotation-import");
  if (dialog) dialog.hidden = true;
}

function rotationImportLine(text, kind) {
  return el("div", { class: `import-line ${kind}`, text });
}

/**
 * Imports whatever is in the box. The dialog stays open afterwards, so several
 * files can be dropped one after another.
 */
function runRotationImport() {
  const report = $("rotation-import-report");
  const text = $("rotation-import-text").value;
  report.replaceChildren();
  report.hidden = false;

  if (!text.trim()) {
    report.appendChild(rotationImportLine("Drop a file or paste the JSON first.", "err"));
    return;
  }

  let result;
  try {
    result = state.model.importGuideRotations(text);
  } catch (e) {
    report.appendChild(rotationImportLine(e.message, "err"));
    return;
  }

  if (result.ids.length === 0) {
    report.appendChild(rotationImportLine("Nothing could be imported — every entry in there was skipped.", "err"));
    for (const warning of result.warnings) report.appendChild(rotationImportLine(warning, "warn"));
    return;
  }

  const names = result.ids.map((id) => (state.model.guideRotation(id) || {}).name || id);
  report.appendChild(
    rotationImportLine(
      result.ids.length === 1
        ? `Imported “${names[0]}” as ${result.ids[0]}, at the end of the list, as a pending change.`
        : `Imported ${result.ids.length} rotations: ${names.join(", ")}.`,
      "ok"
    )
  );
  for (const warning of result.warnings) report.appendChild(rotationImportLine(warning, "warn"));

  state.guide.rotation = result.ids[0] || state.guide.rotation;
  state.guide.hand = null;
  state.guide.notePick = null;
  $("rotation-import-text").value = "";
  afterEdit();
  banner(`Imported ${result.ids.length} rotation(s) into rotations.json. Download the ZIP to keep them.`, "info");
}

function loadRotationImportFile(file) {
  if (!file) return;
  const report = $("rotation-import-report");
  const reader = new FileReader();
  reader.onload = () => {
    $("rotation-import-text").value = String(reader.result || "");
    runRotationImport();
  };
  reader.onerror = () => {
    report.hidden = false;
    report.replaceChildren(rotationImportLine(`Could not read ${file.name}.`, "err"));
  };
  reader.readAsText(file);
}

/* ------------------------------------------------------------------ *
 * Floating card palette — frame, tabs, draggables
 * ------------------------------------------------------------------ */

const HAND_PANEL_KEY = "rotation.cardPanel.v1";

function restoreHandPanelFrame(panel) {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(HAND_PANEL_KEY) || "null");
  } catch {
    saved = null;
  }
  if (!saved) return;
  if (Number.isFinite(saved.x)) panel.style.left = `${saved.x}px`;
  if (Number.isFinite(saved.y)) panel.style.top = `${saved.y}px`;
  else panel.style.top = "96px";
  panel.style.right = "auto";
  if (Number.isFinite(saved.w)) panel.style.width = `${saved.w}px`;
  if (Number.isFinite(saved.h)) panel.style.height = `${saved.h}px`;
}

function saveHandPanelFrame(panel) {
  const rect = panel.getBoundingClientRect();
  localStorage.setItem(HAND_PANEL_KEY, JSON.stringify({ x: rect.left, y: rect.top, w: rect.width, h: rect.height }));
}

/** Keeps the panel on screen after the window shrinks or it is dragged out. */
function clampHandPanel(panel) {
  const rect = panel.getBoundingClientRect();
  const maxLeft = Math.max(0, window.innerWidth - 80);
  const maxTop = Math.max(0, window.innerHeight - 60);
  const left = Math.min(Math.max(0, rect.left), maxLeft);
  const top = Math.min(Math.max(0, rect.top), maxTop);
  if (left !== rect.left) panel.style.left = `${left}px`;
  if (top !== rect.top) panel.style.top = `${top}px`;
}

function wireHandPanel(panel) {
  const head = $("float-hand-head");
  if (!head || panel.dataset.wired) return;
  panel.dataset.wired = "1";

  const MIN_W = 180;
  const MIN_H = 150;

  /** Follows the pointer until it is released, then stores the new frame. */
  const startGesture = (e, move) => {
    e.preventDefault();
    const rect = panel.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    panel.style.right = "auto";
    panel.style.left = `${rect.left}px`;
    panel.style.top = `${rect.top}px`;
    const onMove = (ev) => move(ev.clientX - startX, ev.clientY - startY, rect);
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      saveHandPanelFrame(panel);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  head.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".hand-close") || e.target.closest(".fh-grip")) return;
    startGesture(e, (dx, dy, rect) => {
      panel.style.left = `${Math.max(-rect.width + 80, Math.min(window.innerWidth - 80, rect.left + dx))}px`;
      panel.style.top = `${Math.max(0, Math.min(window.innerHeight - 40, rect.top + dy))}px`;
    });
  });

  // Every edge and corner resizes from that side, so the opposite edge stays put.
  for (const grip of panel.querySelectorAll(".fh-grip")) {
    const edge = grip.dataset.edge || "";
    grip.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      startGesture(e, (dx, dy, rect) => {
        let left = rect.left;
        let top = rect.top;
        let width = rect.width;
        let height = rect.height;
        if (edge.includes("e")) width = rect.width + dx;
        if (edge.includes("s")) height = rect.height + dy;
        if (edge.includes("w")) {
          width = rect.width - dx;
          left = rect.left + dx;
        }
        if (edge.includes("n")) {
          height = rect.height - dy;
          top = rect.top + dy;
        }
        // A shrink stops at the minimum instead of pushing the near edge further.
        if (width < MIN_W) {
          if (edge.includes("w")) left -= MIN_W - width;
          width = MIN_W;
        }
        if (height < MIN_H) {
          if (edge.includes("n")) top -= MIN_H - height;
          height = MIN_H;
        }
        width = Math.min(width, window.innerWidth - 8);
        height = Math.min(height, window.innerHeight - 8);
        panel.style.left = `${Math.max(0, left)}px`;
        panel.style.top = `${Math.max(0, top)}px`;
        panel.style.width = `${width}px`;
        panel.style.height = `${height}px`;
      });
    });
  }

  window.addEventListener("resize", () => clampHandPanel(panel));
}

/** The floating panel's tabs: slot stamps, the card art, and the extras. */
const PANEL_TABS = [
  { key: "ap", label: "AP" },
  { key: "cards", label: "Cards" },
  { key: "extra", label: "Extra" },
];

/** Carries a card, a slot stamp or a tag from the panel to a round. */
function armDrag(e, payload) {
  state.drag = payload;
  if (e?.dataTransfer) {
    e.dataTransfer.setData("text/plain", JSON.stringify(payload));
    e.dataTransfer.effectAllowed = "copy";
  }
}

/** A click-to-place fallback for every draggable in the panel. */
function armClick(payload, message) {
  state.drag = payload;
  banner(message, "info");
}

function renderRotationHand(id) {
  const panel = $("float-hand");
  const body = $("float-hand-body");
  const model = state.model;
  if (!panel || !body) return;

  // The panel is rebuilt whenever the rotation re-renders, so the body keeps its
  // scroll position (a tab change still starts at the top).
  const scrollTop = body.scrollTop;
  const sameTab = state.guide.panelTab === state.guide.lastPanelTab;
  const rotation = id ? model.guideRotation(id) : null;
  if (!rotation || !state.guide.panelOpen) {
    panel.hidden = true;
    body.replaceChildren();
    return;
  }
  panel.hidden = false;
  // The grips have no size until the panel is visible, so wire it here.
  wireHandPanel(panel);

  const tab = state.guide.panelTab || "ap";
  const head = el(
    "div",
    { class: "pick hand-tabs" },
    PANEL_TABS.map((entry) =>
      el("button", {
        class: `chip${tab === entry.key ? " on" : ""}`,
        text: entry.label,
        onclick: () => {
          state.guide.panelTab = entry.key;
          renderRotationDetail();
        },
      })
    )
  );
  const children = [head];

  if (tab === "ap") {
    // Each stamp is a slot waiting to be dropped in; the card that fills it is
    // dragged afterwards, so the AP order can be laid out before the art.
    const stamp = (type, label, preview) => {
      const node = el(
        "button",
        {
          class: `guide-stamp is-${type}`,
          title: `${label} — drag onto a round, or click then click a gap`,
          draggable: "true",
          onclick: () => armClick({ kind: "slot", slotType: type }, `${label} armed — click a gap between cards.`),
        },
        [
          preview === "text" || preview === "tuning"
            ? el("span", { class: `guide-stamp-glyph is-${type}`, text: preview === "text" ? "TEXT" : "TUNE" })
            : preview === "lb"
              ? el("span", { class: "guide-stamp-art is-lb" }, [
                  el("span", { class: "guide-stamp-slot is-full" }),
                  el("span", { class: "guide-stamp-slot is-quarter" }),
                ])
              : preview === "double_or"
                ? el("span", { class: "guide-stamp-art is-double_or" }, [
                    el("span", { class: "guide-stamp-slot is-back-2" }),
                    el("span", { class: "guide-stamp-slot is-back" }),
                    el("span", { class: "guide-stamp-slot" }),
                  ])
                : el(
                    "span",
                    { class: `guide-stamp-art is-${preview}` },
                    Array.from({ length: preview === "or" ? 2 : 1 }, (_, i) =>
                      el("span", { class: `guide-stamp-slot${i ? " is-back" : ""}` })
                    )
                  ),
          el("span", { class: "guide-stamp-label", text: label }),
        ]
      );
      node.addEventListener("dragstart", (e) => armDrag(e, { kind: "slot", slotType: type }));
      return node;
    };

    children.push(
      el("div", { class: "guide-stamp-grid" }, [
        stamp("normal", "Normal AP", "normal"),
        stamp("or", "OR AP", "or"),
        stamp("double_or", "Double OR AP", "double_or"),
        stamp("lb", "1/4 AP", "lb"),
      ]),
      el("h3", { class: "hand-group-title", text: "Notes" }),
      el("div", { class: "guide-stamp-grid" }, [stamp("text", "Text", "text"), stamp("tuning", "Tuning", "tuning")]),
      el("p", {
        class: "hand-help",
        text: "Drop a stamp between two cards to insert a slot. Dropping a card straight into the round creates the slot for you.",
      })
    );
    panel.title = "AP slots";
  } else if (tab === "extra") {
    // Tags change what a slot means; surfaces change how a card is drawn.
    children.push(
      el("h3", { class: "hand-group-title", text: "Tags" }),
      el("p", {
        class: "hand-help",
        text: "Drop the tag on a slot to add it, or on a tagged slot to remove it. Type its words under the slot — the plate shrinks to fit the card.",
      }),
      el(
        "div",
        { class: "guide-tag-grid" },
        PANEL_SLOT_TAGS.map((tag) => {
          const sample = el("span", { class: "guide-tag-sample is-text" }, [
            el("img", { src: `../${tag.image}`, alt: "" }),
            el("span", { text: tag.text ? "Tag" : tag.label }),
          ]);
          const tile = el(
            "button",
            {
              class: "guide-tag-tile",
              title: `${tag.label} — drag onto a slot`,
              draggable: "true",
              dataset: { tag: tag.key },
              onclick: () => armClick({ kind: "tag", tag: tag.key }, `${tag.label} armed — click a slot to toggle it.`),
            },
            [sample, el("span", { class: "guide-tag-key", text: tag.key })]
          );
          tile.addEventListener("dragstart", (e) => armDrag(e, { kind: "tag", tag: tag.key }));
          return tile;
        })
      ),

      el("h3", { class: "hand-group-title", text: "Surface" }),
      el("p", {
        class: "hand-help",
        text: "Drop a surface on a card to lay it over that card's art. Skill 3 cards are drawn in the Ultimate plate.",
      }),
      el(
        "div",
        { class: "guide-surface-grid" },
        PANEL_CARD_SURFACES.map((surface) => {
          const tile = el(
            "button",
            {
              class: "guide-surface-tile",
              title: `${surface.label} — drag onto a card`,
              draggable: "true",
              dataset: { surface: surface.key },
              onclick: () => armClick({ kind: "surface", surface: surface.key }, `${surface.label} surface armed — click a card.`),
            },
            [
              el("span", { class: "guide-surface-art" }, [el("img", { src: `../${surface.image}`, alt: "" })]),
              el("span", { class: "guide-surface-label", text: surface.label }),
            ]
          );
          tile.addEventListener("dragstart", (e) => armDrag(e, { kind: "surface", surface: surface.key }));
          return tile;
        })
      ),

      el("h3", { class: "hand-group-title", text: "Other" }),
      el("p", { class: "hand-help", text: "Ownerless cards — drop one on a slot like a skill card." }),
      el(
        "div",
        { class: "special-card-grid" },
        GUIDE_OTHER_CARDS.map((entry) => {
          const payload = { kind: "card", special: entry.image };
          const card = el(
            "button",
            {
              class: "guide-hand-card is-special",
              title: `${entry.label} — drag onto a slot`,
              draggable: "true",
              dataset: { other: entry.key },
              onclick: () => armClick(payload, `${entry.label} armed — click a slot to place it.`),
            },
            [el("img", { src: `../${entry.image}`, alt: entry.label })]
          );
          card.addEventListener("dragstart", (e) => armDrag(e, payload));
          return card;
        })
      )
    );
    panel.title = "Extra";
  } else {
    // Every member's cards are shown at once, so placing a card never needs a
    // trip back to a character tab.
    const seen = new Set();
    for (const member of rotationMembers(rotation)) {
      const memberName = model.resolve(member.character);
      if (!memberName || seen.has(memberName)) continue;
      seen.add(memberName);
      const c = model.character(memberName);
      const skills = rotationSkills(memberName);
      const block = el("div", { class: "hand-member", dataset: { member: memberName } }, [
        el("div", { class: "hand-member-title", title: memberName }, [
          c.avatar ? el("img", { src: c.avatar, alt: "" }) : null,
          el("span", { text: memberName }),
          skills.length === 0 ? el("span", { class: "hand-member-note", text: "no icons" }) : null,
        ]),
        el(
          "div",
          { class: "guide-hand" },
          skills.map((entry) => {
            const payload = { kind: "card", character: memberName, skill: entry.skill, icon: entry.icon };
            const ultimate = guideSkillIsUltimate(memberName, entry.skill);
            const card = el(
              "button",
              {
                class: `guide-hand-card${ultimate ? " is-ultimate" : ""}`,
                title: `${memberName} · ${entry.skill}${ultimate ? " (ultimate)" : ""} — drag onto a slot, or click then click a slot`,
                draggable: "true",
                onclick: () => armClick(payload, `${memberName} card armed — click a slot to place it.`),
              },
              [el("img", { src: `../${entry.icon}`, alt: "" })]
            );
            card.addEventListener("dragstart", (e) => armDrag(e, payload));
            return card;
          })
        ),
      ]);
      children.push(block);
    }

    if (children.length === 1) {
      children.push(el("p", { class: "hand-help", text: "Add a character to the team and their cards appear here." }));
    }
    panel.title = "Cards";
  }

  $("float-hand-title").textContent = panel.title;
  body.replaceChildren(...children);
  body.scrollTop = sameTab ? scrollTop : 0;
  state.guide.lastPanelTab = tab;
}

/* ------------------------------------------------------------------ *
 * Bracket notes under a round
 * ------------------------------------------------------------------ */

function renderRoundAnnotations(id, roundIndex, round, slotCount) {
  const annotations = Array.isArray(round.annotations) ? round.annotations : [];
  const picking = state.guide.notePick && state.guide.notePick.round === roundIndex;
  if (annotations.length === 0 && !picking) return el("div", { class: "guide-annotations is-empty" });

  const model = state.model;
  const max = Math.max(1, slotCount);
  const host = el("div", { class: "guide-annotations" });
  host.appendChild(el("h3", { class: "hand-group-title", text: "Bracket notes" }));
  if (picking) {
    host.appendChild(el("p", { class: "field-note", text: "Click the first card of the note, then the last one. Esc cancels." }));
  }

  annotations.forEach((annotation, annotationIndex) => {
    const style = GUIDE_ANNOTATION_STYLES.includes(annotation.style) ? annotation.style : "bracket";
    const from = Math.max(0, Math.min(max - 1, Number(annotation.from) || 0));
    const to = Math.max(from, Math.min(max - 1, Number(annotation.to) || 0));

    const styleSelect = el(
      "select",
      { class: "guide-annotation-style", title: "Callout style" },
      GUIDE_ANNOTATION_STYLES.map((value) => el("option", { value, text: value, selected: value === style }))
    );
    styleSelect.addEventListener("change", () => {
      model.setGuideAnnotationField(id, roundIndex, annotationIndex, "style", styleSelect.value);
      afterEdit({ list: false });
    });

    const rangeInput = (field, value) => {
      const input = el("input", { type: "number", min: 1, max, value: value + 1, class: "guide-annotation-index", title: `Slot ${field}` });
      input.addEventListener("change", () => {
        model.setGuideAnnotationField(id, roundIndex, annotationIndex, field, Math.max(0, Number(input.value) - 1));
        afterEdit({ list: false });
      });
      return input;
    };

    const makeAnnotationInput = (lang, label, placeholder) => {
      const input = el("input", {
        type: "text",
        value: getMultiText(annotation.text, lang),
        placeholder: `${placeholder} (${label})`,
        class: `guide-annotation-text view-${lang}`,
        title: `${placeholder} (${label})`,
      });
      input.addEventListener("change", () => {
        const next = updateMultiText(annotation.text, lang, input.value);
        annotation.text = next;
        model.setGuideAnnotationField(id, roundIndex, annotationIndex, "text", next);
        afterEdit({ list: false });
      });

      // A freshly added note takes the focus on its EN input.
      const focus = state.guide.focusNote;
      if (lang === "en" && focus && focus.round === roundIndex && focus.index === annotationIndex) {
        state.guide.focusNote = null;
        requestAnimationFrame(() => input.focus());
      }

      const enText = getMultiText(annotation.text, "en");
      const showEnHint = lang !== "en" && enText;

      const inputBlock = showEnHint
        ? el("div", { style: "display: flex; flex-direction: column; flex: 1; min-width: 0;" }, [
            el("div", { class: "field-note", style: "margin: 0 0 2px;", text: `EN: ${enText}`, title: enText }),
            input,
          ])
        : input;

      return el("div", { class: `guide-lang-input-group view-${lang}` }, [
        el("span", { class: "flag", text: label }),
        inputBlock,
      ]);
    };

    // The note is edited in the language picked at the top of the panel.
    const noteLang = currentNoteLang();
    const inputsRow = el("div", { class: "guide-annotation-langs" }, [
      makeAnnotationInput(noteLang.id, noteLang.label, noteLang.placeholder),
    ]);

    host.appendChild(
      el(
        "div",
        {
          class: `guide-annotation is-${style}`,
          dataset: { from, to, style, index: annotationIndex, text: getMultiText(annotation.text, noteLang.id) },
        },
        [
          styleSelect,
          rangeInput("from", from),
          el("span", { class: "guide-annotation-dash", text: "–" }),
          rangeInput("to", to),
          el("button", {
            class: "btn btn-sm",
            text: "Pick",
            title: "Pick the first and last card of this note",
            onclick: () => {
              state.guide.notePick = { round: roundIndex, index: annotationIndex, from: null };
              renderRotationDetail();
              banner("Click the first card of the note, then the last one. Esc cancels.", "info");
            },
          }),
          el("button", {
            class: "guide-annotation-remove",
            text: "×",
            title: "Remove this note",
            onclick: () => {
              model.removeGuideAnnotation(id, roundIndex, annotationIndex);
              afterEdit({ list: false });
            },
          }),
          inputsRow,
        ]
      )
    );
  });

  return host;
}

/** The controls for notes that span several rounds. */
function renderRoundNotes(id, rotation, roundCount) {
  const notes = Array.isArray(rotation.roundNotes) ? rotation.roundNotes : [];
  const host = el("div", { class: "guide-round-notes" });
  if (notes.length === 0) return host;

  const model = state.model;
  const max = Math.max(1, roundCount);
  host.appendChild(el("h3", { class: "hand-group-title", text: "Round notes" }));

  notes.forEach((note, noteIndex) => {
    const style = GUIDE_ANNOTATION_STYLES.includes(note.style) ? note.style : "bracket";
    const from = Math.max(0, Math.min(max - 1, Number(note.from) || 0));
    const to = Math.max(from, Math.min(max - 1, Number(note.to) || 0));

    const styleSelect = el(
      "select",
      { class: "guide-annotation-style", title: "Callout style" },
      GUIDE_ANNOTATION_STYLES.map((value) => el("option", { value, text: value, selected: value === style }))
    );
    styleSelect.addEventListener("change", () => {
      model.setGuideRoundNoteField(id, noteIndex, "style", styleSelect.value);
      afterEdit({ list: false });
    });

    const roundInput = (field, value) => {
      const input = el("input", { type: "number", min: 1, max, value: value + 1, class: "guide-annotation-index", title: `Round ${field}` });
      input.addEventListener("change", () => {
        model.setGuideRoundNoteField(id, noteIndex, field, Math.max(0, Number(input.value) - 1));
        afterEdit({ list: false });
      });
      return input;
    };

    const makeRoundNoteInput = (lang, label, placeholder) => {
      const input = el("input", {
        type: "text",
        value: getMultiText(note.text, lang),
        placeholder: `${placeholder} (${label})`,
        class: `guide-annotation-text view-${lang}`,
        title: `${placeholder} (${label})`,
      });
      input.addEventListener("change", () => {
        const next = updateMultiText(note.text, lang, input.value);
        note.text = next;
        model.setGuideRoundNoteField(id, noteIndex, "text", next);
        afterEdit({ list: false });
      });

      // A freshly added note takes the focus on its EN input.
      if (lang === "en" && state.guide.focusRoundNote === noteIndex) {
        state.guide.focusRoundNote = null;
        requestAnimationFrame(() => input.focus());
      }

      const enText = getMultiText(note.text, "en");
      const showEnHint = lang !== "en" && enText;

      const inputBlock = showEnHint
        ? el("div", { style: "display: flex; flex-direction: column; flex: 1; min-width: 0;" }, [
            el("div", { class: "field-note", style: "margin: 0 0 2px;", text: `EN: ${enText}`, title: enText }),
            input,
          ])
        : input;

      return el("div", { class: `guide-lang-input-group view-${lang}` }, [
        el("span", { class: "flag", text: label }),
        inputBlock,
      ]);
    };

    // The note follows the language switch at the top of the panel.
    const noteLang = currentNoteLang();
    const inputsRow = el("div", { class: "guide-annotation-langs" }, [
      makeRoundNoteInput(noteLang.id, noteLang.label, noteLang.placeholder),
    ]);

    host.appendChild(
      el(
        "div",
        {
          class: `guide-annotation is-${style}`,
          dataset: { from, to, style, index: noteIndex, text: getMultiText(note.text, noteLang.id) },
        },
        [
          styleSelect,
          roundInput("from", from),
          el("span", { class: "guide-annotation-dash", text: "–" }),
          roundInput("to", to),
          el("button", {
            class: "guide-annotation-remove",
            text: "×",
            title: "Remove this note",
            onclick: () => {
              model.removeGuideRoundNote(id, noteIndex);
              afterEdit({ list: false });
            },
          }),
          inputsRow,
        ]
      )
    );
  });

  return host;
}

/** Draws the round-note brackets beside the rounds. */
function drawRoundNoteBrackets(root) {
  const NS = "http://www.w3.org/2000/svg";
  const rail = root.querySelector(".guide-round-note-rail");
  const body = root.querySelector(".guide-rounds-body");
  if (!rail || !body) return;
  rail.replaceChildren();

  const rounds = [...root.querySelectorAll(".guide-round-editor")];
  const notes = [...root.querySelectorAll(".guide-round-notes .guide-annotation")];
  if (rounds.length === 0 || notes.length === 0) return;

  // Measure Y against the rounds body and X against the last card: a slot row is
  // as wide as its column, so the row's own right edge is not the content edge.
  const bodyBox = body.getBoundingClientRect();
  const contentRight = Math.max(
    ...rounds.map((round) => {
      const slots = [...round.querySelectorAll(".guide-slot-editor")];
      if (slots.length === 0) return round.getBoundingClientRect().left;
      return slots[slots.length - 1].getBoundingClientRect().right;
    })
  );
  const spineX = contentRight - bodyBox.left + 10;

  notes.forEach((note, index) => {
    const from = rounds[Number(note.dataset.from)];
    const to = rounds[Number(note.dataset.to)] || from;
    if (!from || !to) return;

    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    const top = Math.min(a.top, b.top) - bodyBox.top;
    const bottom = Math.max(a.bottom, b.bottom) - bodyBox.top;
    // One lane per note, so several notes stack instead of overlapping.
    const x = spineX + index * 16;

    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("width", String(Math.max(1, bodyBox.width)));
    svg.setAttribute("height", String(Math.max(1, bodyBox.height)));
    const line = (d) => {
      const path = document.createElementNS(NS, "path");
      path.setAttribute("d", d);
      path.setAttribute("class", "rot-connector");
      svg.appendChild(path);
    };
    const style = note.dataset.style || "bracket";
    if (style === "box") {
      line(`M ${x} ${top} V ${bottom}`);
    } else {
      // The spine runs beside the rounds and its ticks point back at them, so the
      // bracket reads as "] rounds" with the text on the outside.
      line(`M ${x} ${top} H ${x - 5} M ${x} ${bottom} H ${x - 5} M ${x} ${top} V ${bottom}`);
    }

    const label = note.dataset.text || "";
    if (label) {
      const text = document.createElementNS(NS, "text");
      text.setAttribute("x", String(x + 8));
      text.setAttribute("y", String(Math.round((top + bottom) / 2)));
      text.setAttribute("class", "guide-round-note-label");
      text.textContent = label;
      svg.appendChild(text);
      // The rail is only as wide as the room beside the rounds, so a long note
      // is clipped to what fits instead of running off the panel.
      const room = bodyBox.width - (x + 8) - 2;
      if (room > 0 && text.getComputedTextLength() > room) {
        let cut = label;
        while (cut.length > 1 && text.getComputedTextLength() > room) {
          cut = cut.slice(0, -1);
          text.textContent = `${cut.trimEnd()}…`;
        }
      }
    }
    rail.appendChild(svg);
  });
}

/**
 * Packs callouts into lanes: a note joins the first lane whose spans it does not
 * overlap, so notes over different cards sit side by side instead of stacking.
 */
function packNoteLanes(notes) {
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

/** Draws the notes under the cards, the same bracket the published plan uses. */
function drawEditorBrackets(root) {
  const NS = "http://www.w3.org/2000/svg";
  const LANE = 16;

  for (const round of root.querySelectorAll(".guide-round-editor")) {
    const layer = round.querySelector(".guide-bracket-layer");
    if (!layer) continue;
    const slots = [...round.querySelectorAll(".guide-slot-editor")];
    const rows = [...round.querySelectorAll(".guide-annotation")];
    layer.replaceChildren();
    if (rows.length === 0 || slots.length === 0) {
      layer.style.height = "0px";
      continue;
    }

    const lanes = packNoteLanes(
      rows.map((row) => ({ from: Number(row.dataset.from) || 0, to: Number(row.dataset.to) || 0 }))
    );
    const laneCount = Math.max(...lanes) + 1;
    layer.style.height = `${laneCount * LANE}px`;

    // The SVG is attached before measuring: an empty layer is display:none and
    // would report a zero box.
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "guide-bracket-rail");
    layer.appendChild(svg);
    const base = layer.getBoundingClientRect();
    svg.setAttribute("width", String(base.width));
    svg.setAttribute("height", String(base.height));

    rows.forEach((row, index) => {
      const from = Number(row.dataset.from) || 0;
      const to = Math.max(from, Number(row.dataset.to) || 0);
      // The span covers every card between the two ends, which matters when the
      // slot row has wrapped onto several lines.
      const spanned = slots.slice(from, to + 1);
      if (spanned.length === 0) return;
      const boxes = spanned.map((slot) => (slot.querySelector(".guide-slot-cards") || slot).getBoundingClientRect());
      const left = Math.min(...boxes.map((box) => box.left)) - base.left;
      const right = Math.max(...boxes.map((box) => box.right)) - base.left;
      const mid = (left + right) / 2;
      // Hang the bracket under the lowest card of the span: a wrapped row puts
      // the earlier cards on the first line, so their bottom is not the edge.
      const top = Math.max(...boxes.map((box) => box.bottom)) - base.top + 3;
      const bar = top + 5;
      const stem = lanes[index] * LANE + 12;
      const style = row.dataset.style || "bracket";

      const line = (d) => {
        const path = document.createElementNS(NS, "path");
        path.setAttribute("d", d);
        path.setAttribute("class", "rot-connector");
        svg.appendChild(path);
      };
      if (style === "box") {
        line(`M ${mid} ${top} V ${stem}`);
      } else if (style === "fork") {
        line(`M ${left} ${top} V ${bar} H ${right} V ${top}`);
        line(`M ${mid} ${bar} V ${stem}`);
      } else {
        line(`M ${left} ${top} V ${bar} H ${right} V ${top}`);
        line(`M ${mid} ${bar} V ${stem}`);
      }
    });
  }
}

/* ------------------------------------------------------------------ *
 * The plan
 * ------------------------------------------------------------------ */

function renderRotationDetail() {
  const host = $("rotation-detail");
  // Re-rendering replaces every node, which would otherwise throw the pane back
  // to the top — painful when the card panel is used far down a long plan.
  const keepScroll = host.scrollTop;
  host.replaceChildren();
  const model = state.model;
  const rotation = model.guideRotation(state.guide.rotation);

  if (!rotation) {
    host.appendChild(
      el("div", { class: "empty-state" }, [
        el("span", { class: "empty-mark", text: "?" }),
        el("span", { class: "empty-text", text: "SELECT A PLAN" }),
        el("button", {
          class: "btn btn-sm",
          text: "+ New plan",
          onclick: () => {
            const name = window.prompt("Name for the new rotation:");
            if (name === null) return;
            const id = state.model.addGuideRotation(name);
            if (id) state.guide.rotation = id;
            afterEdit();
          },
        }),
      ])
    );
    renderRotationHand(null);
    return;
  }

  const id = rotation.id;
  const members = rotationMembers(rotation);
  const rounds = rotationRounds(rotation);
  const archetypes = Array.isArray(rotation.archetypes) ? rotation.archetypes : [];

  /* --- 02 · plan head --- */
  host.appendChild(
    el("div", { class: "detail-head", id: "plan" }, [
      el("div", { style: "flex: 1; min-width: 200px;" }, [
        el("div", { class: "detail-title", text: rotation.name || id }),
        el("div", {
          class: "detail-sub",
          text: `${String(rounds.length).padStart(2, "0")} ROUNDS · ${id} → rotations.json`,
        }),
      ]),
      renderNoteLangSwitch(),
      el("button", {
        class: "btn btn-sm",
        text: "Export",
        title: "Download this rotation as a .rotation.json file to hand to another editor",
        onclick: () => exportRotation(id),
      }),
      el("button", {
        class: "btn btn-sm",
        text: "Duplicate",
        title: "Copy this rotation, placed right after it",
        onclick: () => {
          const copyId = model.duplicateGuideRotation(id);
          if (copyId) state.guide.rotation = copyId;
          state.guide.hand = null;
          afterEdit();
        },
      }),
      el("button", {
        class: "btn btn-sm btn-danger",
        text: "Remove",
        onclick: () => {
          model.removeGuideRotation(id);
          state.guide.rotation = null;
          afterEdit();
        },
      }),
    ])
  );

  /* --- 03 · identity --- */
  const nameInput = el("input", { type: "text", value: rotation.name || "", class: "field-input" });
  nameInput.addEventListener("change", () => {
    model.setGuideRotationField(id, "name", nameInput.value);
    afterEdit();
  });

  const notesField = renderMultilingualNotesEditor({
    value: rotation.notes,
    onSave: (val) => {
      model.setGuideRotationField(id, "notes", val);
      afterEdit({ list: false });
    },
    placeholder: "General rotation instructions, substitutes, notes…",
  });

  const tuningRow = el("div", { class: "pick" });
  for (const tuning of TUNINGS) {
    const active = rotation.tuning === tuning;
    tuningRow.appendChild(
      el(
        "button",
        {
          class: `chip chip-icon${active ? " on" : ""}`,
          title: tuning,
          onclick: () => {
            model.setGuideRotationField(id, "tuning", active ? "" : tuning);
            afterEdit();
          },
        },
        [
          el("img", { src: `../images/tuning_abilities/${encodeURIComponent(tuning)}.png`, alt: "" }),
          el("span", { text: tuning }),
        ]
      )
    );
  }

  const archetypeRow = el("div", { class: "pick" });
  for (const tag of ROTATION_ARCHETYPES) {
    const active = archetypes.includes(tag);
    const exclusive = EXCLUSIVE_ARCHETYPES.includes(tag);
    archetypeRow.appendChild(
      el("button", {
        class: `chip is-archetype${active ? " on" : ""}`,
        text: tag,
        dataset: { archetype: tag },
        style: ARCHETYPE_COLORS[tag] ? `--chip-color:${ARCHETYPE_COLORS[tag]}` : "",
        onclick: () => {
          // Raid and Focused Flashback replace each other instead of stacking.
          const base = active
            ? archetypes.filter((t) => t !== tag)
            : [...archetypes.filter((t) => !(exclusive && EXCLUSIVE_ARCHETYPES.includes(t))), tag];
          model.setGuideRotationField(id, "archetypes", base);
          afterEdit();
        },
      })
    );
  }

  host.appendChild(
    el("div", { class: "card", id: "identity" }, [
      el("h2", { text: "Identity" }),
      el("div", { class: "field" }, [el("label", { class: "field-label", text: "Name" }), nameInput]),
      el("div", { class: "field" }, [el("label", { class: "field-label", text: "Tuning" }), tuningRow]),
      el("div", { class: "field" }, [el("label", { class: "field-label", text: "Archetype tags" }), archetypeRow]),
      notesField,
    ])
  );

  /* --- 04 · team --- */
  const memberHost = el("div", { class: "pick" });
  for (let slot = 0; slot < 4; slot++) {
    const member = members[slot] || { character: "", psychube: "" };
    memberHost.appendChild(
      el("div", { class: "pick pick-member" }, [
        characterCell(
          member.character,
          (value) => {
            model.setGuideRotationMember(id, slot, "character", value);
            if (!state.guide.hand && value) state.guide.hand = model.resolve(value);
            afterEdit();
          },
          `rotation-member-${slot}`
        ),
        psychubeCell(
          member.psychube,
          (value) => {
            model.setGuideRotationMember(id, slot, "psychube", value);
            afterEdit({ list: false });
          },
          `rotation-member-chube-${slot}`
        ),
        portraitSeg(
          member.portrait || 0,
          (tier) => {
            model.setGuideRotationMember(id, slot, "portrait", tier);
            afterEdit({ list: false });
          },
          `rotation-member-portrait-${slot}`
        ),
      ])
    );
  }
  host.appendChild(
    el("div", { class: "card", id: "team" }, [
      el("h2", { text: "Team" }),
      el("p", {
        class: "hint",
        text: "Up to four characters, each with the psychube they run and their portrait tier (the five dashes under the avatar).",
      }),
      memberHost,
    ])
  );

  /* --- 05 · rounds --- */
  const roundsCard = el("div", { class: "card", id: "rounds" }, [
    el("div", { class: "card-head" }, [
      el("h2", { text: "Rounds" }),
      el("div", { class: "pick" }, [
        el("button", {
          class: `btn btn-sm${state.guide.panelOpen ? " btn-primary" : ""}`,
          text: "Cards",
          title: "Show or hide the floating card panel",
          "aria-pressed": state.guide.panelOpen ? "true" : "false",
          onclick: () => {
            state.guide.panelOpen = !state.guide.panelOpen;
            renderRotationDetail();
          },
        }),
        el("button", {
          class: "btn btn-sm",
          text: "+ Note",
          title: "A bracket beside several rounds, for “repeat these rounds”",
          onclick: () => {
            const count = rounds.length;
            if (count === 0) {
              banner("Add a round first, so the note has something to span.", "info");
              return;
            }
            const existing = Array.isArray(rotation.roundNotes) ? rotation.roundNotes.length : 0;
            state.guide.focusRoundNote = existing;
            model.addGuideRoundNote(id, 0, Math.min(count - 1, 1), "", "bracket");
            afterEdit({ list: false });
          },
        }),
        el("button", {
          class: "btn btn-sm",
          text: "+ Round",
          onclick: () => {
            model.addGuideRound(id);
            afterEdit();
          },
        }),
      ]),
    ]),
    el("p", {
      class: "hint",
      text: "Lay the turn out from the card panel: drag Normal AP, OR AP or 1/4 AP between two cards to insert a slot, then drop a card onto the placeholder. Tags (AP Free, Precast) and the card surfaces come from the Extra tab. Hover a card to mark it as an ultimate or as the preferred side of an OR slot.",
    }),
  ]);

  const hasRoundNotes = Array.isArray(rotation.roundNotes) && rotation.roundNotes.length > 0;
  const roundsBody = el("div", { class: `guide-rounds-body${hasRoundNotes ? " has-round-notes" : ""}` }, [
    el("div", { class: "guide-rounds-column" }),
    el("div", { class: "guide-round-note-rail" }),
  ]);
  const roundsColumn = roundsBody.firstChild;

  rounds.forEach((round, roundIndex) => {
    const roundEl = el("div", { class: "guide-round-editor" });
    const noteLang = state.noteLang || "en";

    const makeRoundNoteInput = (lang, label, placeholder) => {
      const input = el("input", {
        type: "text",
        value: getMultiText(round.note, lang),
        placeholder: `${placeholder} (${label})`,
        class: "guide-round-note-input",
        title: `Round note (${label})`,
      });
      input.addEventListener("change", () => {
        const next = updateMultiText(round.note, lang, input.value);
        round.note = next;
        model.setGuideRoundNote(id, roundIndex, next);
        afterEdit({ list: false });
      });

      const enText = getMultiText(round.note, "en");
      const showEnHint = lang !== "en" && enText;

      const inputBlock = showEnHint
        ? el("div", { style: "display: flex; flex-direction: column; flex: 1; min-width: 90px;" }, [
            el("div", { class: "field-note", style: "margin: 0 0 2px;", text: `EN: ${enText}`, title: enText }),
            input,
          ])
        : input;

      return el("div", { style: "display: flex; gap: 4px; align-items: center; flex: 1; min-width: 90px;" }, [
        el("span", { class: "flag", text: label }),
        inputBlock,
      ]);
    };

    // One note field in the language picked at the top, so the other two columns
    // do not take room away from the cards.
    const roundNotesGroup = makeRoundNoteInput(noteLang, noteLang.toUpperCase(), "Round note");

    roundEl.appendChild(
      el("span", { class: "guide-turn-no", text: String(roundIndex + 1).padStart(2, "0"), title: `Round ${roundIndex + 1}` })
    );

    roundEl.appendChild(
      el("div", { class: "guide-turn-head" }, [
        roundNotesGroup,
        el("div", { class: "pick" }, [
          el("button", {
            class: "btn btn-sm",
            text: "+ Note",
            title: "Add a free bracket note under the cards",
            onclick: () => {
              const count = Array.isArray(round.slots) ? round.slots.length : 0;
              if (count === 0) {
                banner("Add a card first, so the note has something to point at.", "info");
                return;
              }
              const existing = Array.isArray(round.annotations) ? round.annotations.length : 0;
              state.guide.focusNote = { round: roundIndex, index: existing };
              model.addGuideAnnotation(id, roundIndex, 0, count - 1, "", "bracket");
              afterEdit({ list: false });
            },
          }),
          el("button", {
            class: "btn btn-sm",
            text: "Duplicate",
            title: "Copy this round, placed right after it",
            onclick: () => {
              model.duplicateGuideRound(id, roundIndex);
              afterEdit();
            },
          }),
          el("button", {
            class: "btn btn-sm btn-danger",
            text: "Remove",
            onclick: () => {
              model.removeGuideRound(id, roundIndex);
              afterEdit();
            },
          }),
        ]),
      ])
    );

    const slotRow = el("div", { class: "guide-slot-row" });
    const slots = Array.isArray(round.slots) ? round.slots : [];

    /** One insertion point between two slots. */
    const gap = (at) => {
      const node = el("span", {
        class: `guide-drop-gap${slots.length === 0 ? " is-empty" : ""}`,
        title: "Drop a card or a slot here",
      });
      node.addEventListener("dragover", (e) => {
        const drag = state.drag;
        if (!drag || drag.kind === "rotation-slot") return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = drag.kind === "tag" ? "none" : "copy";
        node.classList.add("is-target");
      });
      node.addEventListener("dragleave", () => node.classList.remove("is-target"));
      node.addEventListener("drop", (e) => {
        node.classList.remove("is-target");
        const drag = readDragPayload(e);
        if (!drag || drag.kind === "rotation-slot" || drag.kind === "tag") return;
        e.preventDefault();
        e.stopPropagation();
        if (drag.kind === "slot") model.insertRoundSlot(id, roundIndex, at, { type: drag.slotType });
        else model.insertRoundSlot(id, roundIndex, at, { type: "normal", cards: [drag] });
        state.drag = null;
        afterEdit();
      });
      // Clicking a gap works only while something is armed, so a stray click
      // never adds a slot.
      node.addEventListener("click", () => {
        const drag = state.drag;
        if (!drag || drag.kind === "rotation-slot" || drag.kind === "tag") return;
        if (drag.kind === "slot") model.insertRoundSlot(id, roundIndex, at, { type: drag.slotType });
        else model.insertRoundSlot(id, roundIndex, at, { type: "normal", cards: [drag] });
        state.drag = null;
        afterEdit();
      });
      return node;
    };

    slotRow.appendChild(gap(0));

    slots.forEach((slot, slotIndex) => {
      const type = guideSlotLayout(slot);
      const tags = guideSlotTags(slot);
      const cards = Array.isArray(slot.cards) ? slot.cards : [];
      const slotEl = el("div", { class: `guide-slot-editor is-${type}${tags.length ? " has-tags" : ""}` });

      // Every slot is draggable by its handle, so a turn's AP order can be
      // rearranged without deleting and re-adding cards.
      const orderHandle = el("span", {
        class: "drag-handle slot-order-handle",
        text: "⠿",
        title: "Drag to reorder this AP slot",
        draggable: "true",
      });
      slotEl.appendChild(orderHandle);
      orderHandle.addEventListener("dragstart", (e) => {
        state.drag = { kind: "rotation-slot", id, round: roundIndex, index: slotIndex };
        slotEl.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", `slot:${slotIndex}`);
        e.stopPropagation();
      });
      orderHandle.addEventListener("dragend", () => {
        slotEl.classList.remove("dragging");
        state.drag = null;
        for (const s of slotRow.querySelectorAll(".guide-slot-editor")) s.classList.remove("drop-before", "drop-after");
      });

      if (type === "text" || type === "tuning") {
        const textInput = el("textarea", { rows: 3, class: "guide-slot-text", placeholder: "Text" });
        textInput.value = slot.text || "";
        textInput.addEventListener("change", () => {
          model.setGuideSlotText(id, roundIndex, slotIndex, textInput.value);
          afterEdit({ list: false });
        });
        slotEl.appendChild(textInput);

        if (type === "tuning") {
          // The tuning icon is a choice, not a drop target. Read the current card
          // on every click, because the slot is not re-created in place.
          const currentIcon = () =>
            slot.cards?.[0]?.special ||
            model.guideRotations().find((r) => r && r.id === id)?.rounds?.[roundIndex]?.slots?.[slotIndex]?.cards?.[0]?.special ||
            "";
          const iconRow = el("div", { class: "guide-slot-tuning-icons" });
          for (const [key, icon] of Object.entries(TUNING_ICONS)) {
            iconRow.appendChild(
              el(
                "button",
                {
                  class: `guide-tuning-icon${currentIcon() === icon ? " on" : ""}`,
                  title: `Tuning ${key}`,
                  "aria-pressed": currentIcon() === icon ? "true" : "false",
                  onclick: (e) => {
                    e.stopPropagation();
                    model.setGuideTuningIcon(id, roundIndex, slotIndex, currentIcon() === icon ? "" : icon);
                    afterEdit({ list: false });
                  },
                },
                [el("img", { src: `../${icon}`, alt: key })]
              )
            );
          }
          slotEl.appendChild(iconRow);
        }
      } else {
        const cardRow = el("div", { class: "guide-slot-cards" });
        const badge = tags.map(guideTagInfo).find((tag) => tag && tag.kind === "badge");
        const plaques = tags.map(guideTagInfo).filter((tag) => tag && tag.kind === "plaque");
        const tagText = guideSlotTagText(slot);
        // Both plates hang off the slot's first card, so they stay on its corner
        // whatever shape the card is.
        const plates = [
          ...(badge ? [guideTagPlate(badge, guideSlotTagLabel(badge, tagText))] : []),
          ...plaques.map((tag) => guideTagPlate(tag, guideSlotTagLabel(tag, tagText))),
        ];

        // An OR slot shows two or three places; a normal slot one.
        const places = type === "double_or" || type === "or3" ? 3 : type === "or" ? 2 : 1;
        for (let cardIndex = 0; cardIndex < Math.max(places, cards.length); cardIndex++) {
          const card = cards[cardIndex];
          if (cardIndex > 0) cardRow.appendChild(el("span", { class: "guide-or", text: "or" }));
          if (!card) {
            // An empty slot shows the placeholder face, so the AP order reads
            // before any art exists.
            cardRow.appendChild(
              el("span", { class: `guide-slot-card is-empty${badge ? " has-badge" : ""}`, title: "Drop a card here" }, [
                ...(cardIndex === 0 ? plates : []),
                el("img", { class: "guide-card-art", src: "../images/card_modulo/Normal.png", alt: "" }),
              ])
            );
            continue;
          }
          const layers = guideCardLayers(card, cardIcon(card));
          const cardEl = el(
            "span",
            {
              class: `guide-slot-card${layers.ultimate ? " is-ultimate" : ""}${
                layers.surface ? ` has-surface is-surface-${layers.surface.key}` : ""
              }${type === "lb" ? " is-lb" : ""}${card.preferred ? " is-preferred" : ""}${
                cardIndex === 0 && badge ? " has-badge" : ""
              }`,
              title: card.special ? "Special card" : `${card.character} · ${card.skill}`,
              dataset: { frame: layers.ultimate ? "ultimate" : "normal", surface: layers.surface?.key || "" },
            },
            [
              ...layers.html,
              ...(cardIndex === 0 ? plates : []),
              el("span", { class: "guide-card-tools" }, [
                el("button", {
                  class: `guide-card-tool${layers.ultimate ? " on" : ""}`,
                  text: "U",
                  title: "Toggle the Ultimate plate",
                  onclick: (e) => {
                    e.stopPropagation();
                    model.setGuideCardField(id, roundIndex, slotIndex, cardIndex, "frame", layers.ultimate ? "normal" : "ultimate");
                    afterEdit({ list: false });
                  },
                }),
                type === "or" || type === "double_or" || type === "or3"
                  ? el("button", {
                      class: `guide-card-tool${card.preferred ? " on" : ""}`,
                      text: "★",
                      title: "Preferred card of this OR slot",
                      onclick: (e) => {
                        e.stopPropagation();
                        model.setGuideCardField(id, roundIndex, slotIndex, cardIndex, "preferred", !card.preferred);
                        afterEdit({ list: false });
                      },
                    })
                  : null,
              ]),
              el("button", {
                class: "guide-slot-remove",
                text: "×",
                title: "Remove this card",
                onclick: (e) => {
                  e.stopPropagation();
                  model.removeGuideSlotCard(id, roundIndex, slotIndex, cardIndex);
                  afterEdit();
                },
              }),
            ]
          );

          // A surface dragged from the Extra tab decorates this card.
          const applySurface = (key) => {
            model.setGuideCardField(id, roundIndex, slotIndex, cardIndex, "surface", key);
            afterEdit({ list: false });
          };
          cardEl.addEventListener("dragover", (e) => {
            if (state.drag?.kind !== "surface") return;
            e.preventDefault();
            e.stopPropagation();
            cardEl.classList.add("is-target");
          });
          cardEl.addEventListener("dragleave", () => cardEl.classList.remove("is-target"));
          cardEl.addEventListener("drop", (e) => {
            const drag = readDragPayload(e);
            if (drag?.kind !== "surface") return;
            e.preventDefault();
            e.stopPropagation();
            cardEl.classList.remove("is-target");
            state.drag = null;
            applySurface(drag.surface);
          });
          cardEl.addEventListener("click", (e) => {
            if (state.drag?.kind !== "surface") return;
            e.stopPropagation();
            const key = state.drag.surface;
            state.drag = null;
            applySurface(key);
          });

          cardRow.appendChild(cardEl);
        }
        slotEl.appendChild(cardRow);

        // The free-text plate needs somewhere to type; the field sits under the
        // cards, so the plate on the card stays the preview.
        if (tags.includes(GUIDE_SLOT_TAG_TEXT_KEY)) {
          const tagTextInput = el("input", {
            type: "text",
            class: "guide-tag-text-input",
            value: tagText,
            placeholder: "Tag text",
            title: "Text on the tag plate",
          });
          tagTextInput.addEventListener("change", () => {
            model.setGuideSlotTagText(id, roundIndex, slotIndex, tagTextInput.value);
            afterEdit({ list: false });
          });
          slotEl.appendChild(tagTextInput);
        }
      }

      // The layout caption only appears when it says something the cards do not
      // already say.
      if (type !== "normal" && type !== "lb" && type !== "or" && type !== "double_or" && type !== "or3") {
        slotEl.appendChild(el("span", { class: "guide-slot-type", text: SLOT_LABELS[type] || type }));
      }
      slotEl.appendChild(
        el("button", {
          class: "guide-slot-remove-slot",
          text: "×",
          title: "Remove this slot",
          onclick: () => {
            model.removeGuideSlot(id, roundIndex, slotIndex);
            afterEdit();
          },
        })
      );

      // Reordering an AP slot inside this round takes precedence over dropping a
      // card onto it, so both gestures can share the same element.
      slotEl.addEventListener("dragover", (e) => {
        const drag = state.drag;
        if (!drag) return;
        if (drag.kind === "rotation-slot") {
          if (drag.round !== roundIndex || drag.index === slotIndex) return;
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = "move";
          const rect = slotEl.getBoundingClientRect();
          const before = e.clientX < rect.left + rect.width / 2;
          slotEl.classList.toggle("drop-before", before);
          slotEl.classList.toggle("drop-after", !before);
          return;
        }
        if (drag.kind === "tag") {
          e.preventDefault();
          e.stopPropagation();
          slotEl.classList.add("is-target-tag");
          return;
        }
        if (drag.kind === "slot") {
          e.preventDefault();
          e.stopPropagation();
          slotEl.classList.add("is-target");
          return;
        }
        if (type === "text" || type === "tuning") return;
        e.preventDefault();
        e.stopPropagation();
        slotEl.classList.add("is-target");
      });

      slotEl.addEventListener("dragleave", () => {
        slotEl.classList.remove("is-target", "is-target-tag", "drop-before", "drop-after");
      });

      slotEl.addEventListener("drop", (e) => {
        const drag = readDragPayload(e);
        slotEl.classList.remove("is-target", "is-target-tag", "drop-before", "drop-after");
        if (!drag) return;

        if (drag.kind === "rotation-slot") {
          if (drag.round !== roundIndex || drag.index === slotIndex) return;
          e.preventDefault();
          e.stopPropagation();

          const rect = slotEl.getBoundingClientRect();
          const before = e.clientX < rect.left + rect.width / 2;
          // Removing the dragged slot first shifts the rest left by one.
          let target = before ? slotIndex : slotIndex + 1;
          if (drag.index < target) target -= 1;
          target = Math.max(0, Math.min(slots.length - 1, target));

          state.drag = null;
          model.moveRotationSlot(id, roundIndex, drag.index, target);
          afterEdit();
          return;
        }

        if (drag.kind === "tag") {
          e.preventDefault();
          e.stopPropagation();
          model.setGuideSlotTag(id, roundIndex, slotIndex, drag.tag, !tags.includes(drag.tag));
          state.drag = null;
          afterEdit({ list: false });
          return;
        }

        if (drag.kind === "slot") {
          e.preventDefault();
          e.stopPropagation();
          model.insertRoundSlot(id, roundIndex, slotIndex + 1, { type: drag.slotType });
          state.drag = null;
          afterEdit();
          return;
        }

        // A Tuning slot picks S1/S2 with its icon buttons instead of taking cards.
        if (type === "text" || type === "tuning") return;
        e.preventDefault();
        e.stopPropagation();
        model.addGuideSlotCard(id, roundIndex, slotIndex, drag);
        state.drag = null;
        afterEdit();
      });

      slotEl.addEventListener("click", (e) => {
        if (e.target.closest("button, textarea, input, select")) return;

        // Picking the ends of a note wins over placing a card.
        const pick = state.guide.notePick;
        if (pick && pick.round === roundIndex) {
          if (pick.from === null) {
            pick.from = slotIndex;
            banner("Now click the last card of the note.", "info");
          } else {
            const a = Math.min(pick.from, slotIndex);
            const b = Math.max(pick.from, slotIndex);
            if (typeof pick.index === "number") {
              model.setGuideAnnotationField(id, roundIndex, pick.index, "from", a);
              model.setGuideAnnotationField(id, roundIndex, pick.index, "to", b);
            } else {
              model.addGuideAnnotation(id, roundIndex, a, b);
            }
            state.guide.notePick = null;
            afterEdit({ list: false });
          }
          return;
        }

        const drag = state.drag;
        if (!drag) return;
        if (drag.kind === "tag") {
          model.setGuideSlotTag(id, roundIndex, slotIndex, drag.tag, !tags.includes(drag.tag));
          state.drag = null;
          afterEdit({ list: false });
          return;
        }
        if (drag.kind === "slot") return;
        if (type === "text" || type === "tuning") return;
        model.addGuideSlotCard(id, roundIndex, slotIndex, drag);
        state.drag = null;
        afterEdit();
      });

      slotRow.appendChild(slotEl);
      slotRow.appendChild(gap(slotIndex + 1));
    });

    roundEl.appendChild(slotRow);

    // The notes are drawn under the cards exactly as they appear in the plan; the
    // rows below are the controls for them.
    const annotations = Array.isArray(round.annotations) ? round.annotations : [];
    const bracketLayer = el("div", { class: "guide-bracket-layer" });
    bracketLayer.style.height = `${Math.max(0, annotations.length) * 16}px`;
    roundEl.appendChild(bracketLayer);
    roundEl.appendChild(renderRoundAnnotations(id, roundIndex, round, slots.length));
    roundsColumn.appendChild(roundEl);
  });

  if (rounds.length === 0) roundsColumn.appendChild(el("p", { class: "hint", text: "No rounds yet." }));
  roundsCard.appendChild(roundsBody);
  roundsCard.appendChild(renderRoundNotes(id, rotation, rounds.length));
  host.appendChild(roundsCard);

  renderRotationHand(id);

  host.scrollTop = keepScroll;
  // The note brackets follow the cards, and the tag plates have to be measured
  // against the card they sit on, so both wait for layout.
  afterLayout(() => {
    fitGuideTagPlates(host);
    drawEditorBrackets(host);
    drawRoundNoteBrackets(host);
  });
}

/* ------------------------------------------------------------------ *
 * Download
 * ------------------------------------------------------------------ */

/**
 * Packages the pending changes and downloads them.
 *
 * Validation runs first. This workbench only writes `rotations.json`, so only
 * errors the rotation document raises block the download — a stale unrelated
 * row elsewhere in the dataset is not this page's problem.
 */
function downloadChanges() {
  const model = state.model;
  if (!model) return;

  const { errors } = validate(model);
  const blocking = errors.filter((message) => /^rotations\.json\b/.test(message));
  if (blocking.length > 0) {
    const dot = $("status-dot");
    if (dot) dot.classList.add("is-error");
    banner(
      `Nothing downloaded: ${blocking.length} rotation error(s). ${blocking.slice(0, 3).join(" · ")}${
        blocking.length > 3 ? " …" : ""
      }`
    );
    return;
  }

  const changed = model.changedFiles();
  if (changed.length === 0) return;

  try {
    const { filename, files: names } = files.downloadZip(model.output());
    banner(
      `Downloaded ${filename} with ${names.length} file(s): ${names.join(", ")}. ` +
        "Extract it over the repository root, then review with git diff.",
      "info"
    );
  } catch (e) {
    banner(`Download failed: ${e.message}`);
  }
}

/* ------------------------------------------------------------------ *
 * Wiring
 * ------------------------------------------------------------------ */

function wire() {
  $("btn-save").addEventListener("click", downloadChanges);

  $("rotation-search").addEventListener("input", renderRotationList);

  $("rotation-new").addEventListener("click", () => {
    const name = window.prompt("Name for the new rotation:");
    if (name === null) return;
    const id = state.model.addGuideRotation(name);
    if (id) state.guide.rotation = id;
    afterEdit();
  });

  $("rotation-import-open").addEventListener("click", openRotationImport);

  // The floating card panel keeps its frame, and closes without losing the tab.
  const handPanel = $("float-hand");
  if (handPanel) restoreHandPanelFrame(handPanel);
  $("float-hand-close").addEventListener("click", () => {
    state.guide.panelOpen = false;
    renderRotationDetail();
  });

  $("picker-search").addEventListener("input", (e) => renderPicker(e.target.value));
  $("picker-cancel").addEventListener("click", closePicker);
  $("picker").addEventListener("click", (e) => {
    if (e.target === $("picker")) closePicker();
  });

  // Rotation import: a dropped file imports itself, pasted JSON waits for the button.
  const importDialog = $("rotation-import");
  importDialog.addEventListener("click", (e) => {
    if (e.target === importDialog) closeRotationImport();
  });
  $("rotation-import-cancel").addEventListener("click", closeRotationImport);
  $("rotation-import-go").addEventListener("click", runRotationImport);
  $("rotation-import-file").addEventListener("change", (e) => {
    loadRotationImportFile(e.target.files && e.target.files[0]);
    e.target.value = "";
  });
  const drop = $("rotation-import-drop");
  drop.addEventListener("click", () => $("rotation-import-file").click());
  drop.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      $("rotation-import-file").click();
    }
  });
  for (const type of ["dragenter", "dragover"]) {
    drop.addEventListener(type, (e) => {
      e.preventDefault();
      drop.classList.add("over");
    });
  }
  for (const type of ["dragleave", "dragend"]) {
    drop.addEventListener(type, () => drop.classList.remove("over"));
  }
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("over");
    loadRotationImportFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !$("rotation-import").hidden) {
      closeRotationImport();
      return;
    }
    if (e.key === "Escape" && state.picker) closePicker();
    if (e.key === "Escape" && state.guide.notePick) {
      state.guide.notePick = null;
      banner("Callout cancelled.", "info");
      renderRotationDetail();
    }
  });

  // A warning before losing unsaved edits.
  window.addEventListener("beforeunload", (e) => {
    if (state.model && state.model.changedFiles().length > 0) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
}

wire();
boot();
