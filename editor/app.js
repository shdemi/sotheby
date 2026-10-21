/**
 * Sotheby's Mansion — local data editor.
 *
 * Edits data/*.json in place through the File System Access API, so the files
 * stay the single source of truth and `git diff` is the review step. There is no
 * server, no build step and no account.
 *
 * The editor only rewrites the ranges it changes (see json-patch.js), so an
 * untouched file is never modified and a one-field edit is a one-line diff.
 */
import { Model, FILES, READ_ONLY_FILES, RARITIES, AFFLATUSES, SHAPES, PSYCHUBE_TAGS, PSYCHUBE_RARITIES, ROTATION_ARCHETYPES, TUNINGS, GUIDE_SLOT_TAGS, GUIDE_CARD_SURFACES, GUIDE_ANNOTATION_STYLES, guideSlotLayout, guideSlotTags, guideCardIsUltimate, guideCardSurface, validate, readNameTables, diffHunks } from "./model.js";
import * as files from "./files.js";
import * as icons from "./icons.js";

/* ------------------------------------------------------------------ *
 * State
 * ------------------------------------------------------------------ */

const state = {
  model: null,
  appJs: "",
  tab: "characters",
  selected: { characters: null, psychubes: null, teams: null },
  filters: { rarity: null, afflatus: null, flags: new Set(), archetypes: new Set() },
  buildFilters: { rarity: null, afflatus: null, onlyWithBuild: false },
  chubeRarities: new Set(PSYCHUBE_RARITIES),
  picker: null,
  drag: null,
  guide: { build: null, rotation: null, hand: null, panelTab: "ap", panelOpen: false, notePick: null, focusNote: null, focusRoundNote: null },
  import: { art: null, frame: null, frames: [], rarity: "6", id: "", name: "", nameCN: "", tags: [], releasePatch: "", futureSight: false, open: false },
  i18n: { selectedKey: null, filterNs: null, search: "" },
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

/** Icon paths, resolved from the editor/ folder. */
const ICON = {
  afflatus: (name) => `../images/afflatus_icon/${name}.png`,
  rarity: (star) => `../images/colour_references/${star}.png`,
  insight: (i) => `../images/insight_icon/I${i}.png`,
  pattern: (shape, pattern) => `../images/shape_pattern/${encodeURIComponent(shape)}/${encodeURIComponent(pattern)}.png`,
  psychube: (rarity, id) => `../images/psychube_icon/${rarity}/${id}.png`,
  headicon: (id) => `../images/headicon_small/${id}.png`,
  random: (name) => `../images/random_icon/${name}.png`,
};

function banner(message, kind = "error") {
  const node = $("banner");
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

async function boot() {
  try {
    await load();
  } catch (e) {
    banner(`Could not load the data: ${e.message}. The editor must be served over HTTP (see editor/README.md).`);
  }
}

async function load() {
  const loaded = await files.loadAll();
  state.appJs = loaded.appJs;

  const missing = [...files.WRITABLE, ...files.READ_ONLY].filter((n) => loaded.texts[n] === undefined);
  const nameTables = readNameTables(loaded.appJs);
  state.model = new Model(loaded.texts, {
    arcanistMap: JSON.parse(loaded.texts["ArcanistMap.json"]),
    nameTables,
  });

  $("source-label").textContent =
    location.protocol === "file:"
      ? "file:// — the data cannot be read, use a local server"
      : "read-only · downloads a ZIP of your changes";

  if (missing.length) banner(`Missing data files: ${missing.join(", ")}`);
  else banner("");

  // The frame used to composite a new psychube icon. editor/frame.png ships with
  // the editor; the testCodeChube copies are only present locally.
  state.import.frames = await icons.findFrames();
  if (!state.import.frame || !state.import.frames.some((f) => f.label === state.import.frame.label)) {
    state.import.frame = icons.defaultFrame(state.import.frames);
  }
  if (!state.import.id) state.import.id = state.model.nextPsychubeId(state.import.rarity);

  renderAll();
}

/* ------------------------------------------------------------------ *
 * Render orchestration
 * ------------------------------------------------------------------ */

function renderAll() {
  renderCharacterList();
  renderCharacterDetail();
  renderPsychubeList();
  renderPsychubeDetail();
  renderTeamList();
  renderTeamDetail();
  renderPatterns();
  renderCredits();
  renderBuildList();
  renderRotationList();
  renderI18nList();
  renderI18nDetail();
  renderReview();
  updateSaveState();
}
function updateSaveState() {
  const changed = state.model ? state.model.changedFiles() : [];
  const badge = $("review-badge");
  badge.hidden = changed.length === 0;
  badge.textContent = String(changed.length);

  const save = $("btn-save");
  save.disabled = changed.length === 0;
  save.textContent =
    changed.length === 0
      ? "Download changes"
      : `Download ${changed.length} file${changed.length === 1 ? "" : "s"} (.zip)`;
}

/**
 * Re-renders whatever the current tab shows, after a model change.
 *
 * Re-rendering the detail panel is what makes a control reflect its new state —
 * without it the data changes but the button keeps its old highlight. The only
 * cost is that focus is lost, so any control that opts in with `data-focus-key`
 * gets it back afterwards.
 */
function afterEdit({ list = true, detail = true } = {}) {
  const active = document.activeElement;
  const focusKey = active && active.dataset ? active.dataset.focusKey : null;

  if (list) {
    if (state.tab === "characters") renderCharacterList();
    if (state.tab === "psychubes") renderPsychubeList();
    if (state.tab === "teams") renderTeamList();
    if (state.tab === "builds") renderBuildList();
    if (state.tab === "rotations") renderRotationList();
    if (state.tab === "i18n") renderI18nList();
  }
  if (detail) {
    if (state.tab === "characters") renderCharacterDetail();
    if (state.tab === "psychubes") renderPsychubeDetail();
    if (state.tab === "teams") renderTeamDetail();
    if (state.tab === "builds") renderBuildDetail();
    if (state.tab === "rotations") renderRotationDetail();
    if (state.tab === "i18n") renderI18nDetail();
  }
  if (state.tab === "patterns") renderPatterns();
  if (state.tab === "credits") renderCredits();
  renderReview();
  updateSaveState();

  if (focusKey) {
    const next = document.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`);
    if (next) next.focus();
  }
}

/* ------------------------------------------------------------------ *
 * Tab switching
 * ------------------------------------------------------------------ */

function setTab(name) {
  state.tab = name;
  for (const tab of document.querySelectorAll(".tab")) tab.classList.toggle("active", tab.dataset.tab === name);
  for (const pane of document.querySelectorAll(".pane")) pane.classList.toggle("active", pane.dataset.pane === name);
  // The card panel belongs to the Rotations tab; it must not float over others.
  const handPanel = $("float-hand");
  if (handPanel && name !== "rotations") handPanel.hidden = true;
  afterEdit({ list: true, detail: true });
}

/* ------------------------------------------------------------------ *
 * Characters — list
 * ------------------------------------------------------------------ */

const FLAG_FILTERS = [
  { id: "excluded", label: "Excluded" },
  { id: "collab", label: "Collab" },
  { id: "future", label: "Future Sight" },
  { id: "transfer", label: "Transfer" },
  { id: "incomplete", label: "Incomplete" },
  { id: "dirty", label: "Edited" },
];

function characterIssues(c) {
  const issues = [];
  if (!c.rarity && !c.excluded) issues.push("no rarity");
  if (!c.afflatus && !c.excluded) issues.push("no afflatus");
  if (!c.shape && !c.excluded) issues.push("no shape");
  if (!c.cnName) issues.push("no CN name");
  if (!c.arcanistEng) issues.push("not in ArcanistMap");
  return issues;
}

function characterIsDirty(name) {
  if (!state.model) return false;
  const c = state.model.character(name);
  const original = new Model(
    Object.fromEntries(Object.entries(state.model.docs).map(([k, d]) => [k, d.original])),
    { arcanistMap: state.model.arcanistMap, nameTables: { aliases: state.model.aliases, canonicalOverrides: state.model.canonicalOverrides } }
  );
  const o = original.character(name);
  return JSON.stringify(c) !== JSON.stringify(o);
}

function filteredCharacters() {
  const model = state.model;
  const query = $("char-search").value.trim().toLowerCase();
  const { rarity, afflatus, flags } = state.filters;

  return model.characters.filter((name) => {
    const c = model.character(name);
    if (rarity && c.rarity !== rarity) return false;
    if (afflatus && c.afflatus !== afflatus) return false;
    if (flags.has("excluded") && !c.excluded) return false;
    if (flags.has("collab") && !c.collab) return false;
    if (flags.has("future") && !c.futureSight) return false;
    if (flags.has("transfer") && !c.transfer) return false;
    if (flags.has("incomplete") && characterIssues(c).length === 0) return false;
    if (flags.has("dirty") && !characterIsDirty(name)) return false;
    if (!query) return true;

    const haystack = [name, c.cnName, c.arcanistEng].join(" ").toLowerCase();
    if (haystack.includes(query)) return true;
    const aliases = model.aliases[name] || [];
    return aliases.some((a) => String(a).toLowerCase().includes(query));
  });
}

function renderCharacterFilters() {
  const host = $("char-filters");
  host.replaceChildren();

  for (const star of RARITIES) {
    host.appendChild(
      el("button", {
        class: `chip${state.filters.rarity === star ? " on" : ""}`,
        text: `${star}★`,
        onclick: () => {
          state.filters.rarity = state.filters.rarity === star ? null : star;
          renderCharacterFilters();
          renderCharacterList();
        },
      })
    );
  }

  const sep = el("span", { style: "width:100%;height:1px" });
  host.appendChild(sep);

  for (const a of AFFLATUSES) {
    const btn = el("button", {
      class: `chip${state.filters.afflatus === a ? " on" : ""}`,
      title: a.replace("_", " "),
      onclick: () => {
        state.filters.afflatus = state.filters.afflatus === a ? null : a;
        renderCharacterFilters();
        renderCharacterList();
      },
    });
    btn.appendChild(el("img", { src: ICON.afflatus(a), alt: "", style: "width:14px;height:14px;object-fit:contain;vertical-align:-2px" }));
    host.appendChild(btn);
  }

  host.appendChild(el("span", { style: "width:100%;height:1px" }));
  for (const f of FLAG_FILTERS) {
    host.appendChild(
      el("button", {
        class: `chip${state.filters.flags.has(f.id) ? " on" : ""}`,
        text: f.label,
        onclick: () => {
          if (state.filters.flags.has(f.id)) state.filters.flags.delete(f.id);
          else state.filters.flags.add(f.id);
          renderCharacterFilters();
          renderCharacterList();
        },
      })
    );
  }
}

function renderCharacterList() {
  if (!state.model) return;
  const host = $("char-list-body");
  host.replaceChildren();

  const names = filteredCharacters();
  $("char-count").textContent = `${names.length} of ${state.model.characters.length}`;

  const frag = document.createDocumentFragment();
  for (const name of names) {
    const c = state.model.character(name);
    const issues = characterIssues(c);

    const flags = [];
    if (c.excluded) flags.push(el("span", { class: "flag", text: "EXCL" }));
    if (c.collab) flags.push(el("span", { class: "flag", text: "COLLAB" }));
    if (c.futureSight) flags.push(el("span", { class: "flag", text: "CN" }));
    if (c.transfer) flags.push(el("span", { class: "flag", text: "TR" }));
    if (issues.length) flags.push(el("span", { class: "flag bad", text: "!", title: issues.join(", ") }));
    if (characterIsDirty(name)) flags.push(el("span", { class: "flag dirty", text: "•" }));

    frag.appendChild(
      el("div", {
        class: `row${state.selected.characters === name ? " on" : ""}`,
        dataset: { name },
        onclick: () => {
          state.selected.characters = name;
          renderCharacterList();
          renderCharacterDetail();
        },
      }, [
        c.avatar ? el("img", { src: c.avatar, alt: "", loading: "lazy" }) : el("img", { src: ICON.random("cross"), alt: "" }),
        el("div", { class: "row-main" }, [
          el("div", { class: "row-name", text: name }),
          el("div", { class: "row-sub", text: [c.cnName, c.arcanistEng && c.arcanistEng !== name ? c.arcanistEng : ""].filter(Boolean).join(" · ") || "—" }),
        ]),
        el("div", { class: "row-flags" }, flags),
      ])
    );
  }
  host.appendChild(frag);
}

/* ------------------------------------------------------------------ *
 * Characters — detail
 * ------------------------------------------------------------------ */

function dirtyClass(isDirty) {
  return isDirty ? "dirty" : "";
}

/** Rebuilds the detail panel for the selected character. */
function renderCharacterDetail() {
  const host = $("char-detail");
  host.replaceChildren();

  const name = state.selected.characters;
  if (!name || !state.model) {
    host.appendChild(el("div", { class: "empty", text: "Select a character." }));
    return;
  }

  const model = state.model;
  const c = model.character(name);
  const issues = characterIssues(c);

  /* header */
  host.appendChild(
    el("div", { class: "detail-head" }, [
      c.avatar ? el("img", { class: "avatar", src: c.avatar, alt: "" }) : el("img", { class: "avatar", src: ICON.random("cross"), alt: "" }),
      el("div", {}, [
        el("div", { class: "detail-title", text: name }),
        el("div", { class: "detail-sub", text: [c.cnName || "(no CN name)", c.arcanistEng ? `ArcanistMap: ${c.arcanistEng} (id ${c.arcanistId})` : "not in ArcanistMap.json", `${c.skins} skins`].join(" · ") }),
      ]),
    ])
  );

  if (issues.length) {
    host.appendChild(el("div", { class: "card", style: "border-color: rgba(226,114,91,.45)" }, [
      el("h2", { text: "Incomplete" }),
      el("p", { class: "hint", text: issues.join(", ") }),
    ]));
  }

  /* --- identity --- */
  const identity = el("div", { class: "card" }, [el("h2", { text: "Identity" })]);

  const cnInput = el("input", { type: "text", value: c.cnName, placeholder: "Chinese display name" });
  cnInput.addEventListener("change", () => {
    model.setCnName(name, cnInput.value);
    afterEdit();
  });
  identity.appendChild(
    el("div", { class: "field" }, [
      el("label", { class: "field-label", text: "Chinese name → name_map.json" }),
      cnInput,
      el("div", { class: "field-note", text: "Used by the CN language mode. Blank removes the mapping." }),
    ])
  );

  const transferToggle = el("input", { type: "checkbox", checked: c.transfer, disabled: !c.arcanistEng || c.arcanistEng === name });
  transferToggle.addEventListener("change", () => {
    model.setTransfer(name, transferToggle.checked);
    afterEdit();
  });
  identity.appendChild(
    el("div", { class: "field" }, [
      el("label", { class: "field-label", text: "English display name → global_name_transfer.json" }),
      el("label", { class: "toggle" }, [
        transferToggle,
        el("span", { text: `Show as "${name}" instead of "${c.arcanistEng || name}"` }),
      ]),
      el("div", {
        class: "field-note",
        text:
          c.arcanistEng === name || !c.arcanistEng
            ? "Not applicable: the ArcanistMap name already matches."
            : "Also affects name resolution: the alias table in app.js covers the raw name.",
      }),
    ])
  );

  host.appendChild(identity);

  /* --- classification --- */
  const classification = el("div", { class: "card" }, [el("h2", { text: "Classification" })]);

  const rarityPick = el("div", { class: "pick" });
  for (const star of RARITIES) {
    rarityPick.appendChild(
      el("button", {
        class: c.rarity === star ? "on" : "",
        onclick: () => {
          model.setRarity(name, model.character(name).rarity === star ? "" : star);
          afterEdit();
        },
      }, [
        el("img", { src: ICON.rarity(star), alt: "" }),
        `${star}★`,
      ])
    );
  }
  classification.appendChild(el("div", { class: "field" }, [el("label", { class: "field-label", text: "Rarity → characters_by_rarity.json" }), rarityPick]));

  const afflatusPick = el("div", { class: "pick" });
  for (const a of AFFLATUSES) {
    afflatusPick.appendChild(
      el("button", {
        class: c.afflatus === a ? "on" : "",
        onclick: () => {
          model.setAfflatus(name, model.character(name).afflatus === a ? "" : a);
          afterEdit();
        },
      }, [
        el("img", { src: ICON.afflatus(a), alt: "" }),
        a.replace("_", " "),
      ])
    );
  }
  classification.appendChild(
    el("div", { class: "field" }, [
      el("label", { class: "field-label", text: "Afflatus → characters_by_afflatus.json" }),
      afflatusPick,
      el("div", { class: "field-note", text: "Mineral_Star is the hybrid that satisfies both Mineral and Star." }),
    ])
  );

  const shapePick = el("div", { class: "pick" });
  for (const shape of SHAPES) {
    const patterns = (model.value("shape_patterns.json") || {})[shape] || [];
    shapePick.appendChild(
      el("button", {
        class: c.shape === shape ? "on" : "",
        onclick: () => {
          model.setShape(name, model.character(name).shape === shape ? "" : shape);
          afterEdit();
        },
      }, [
        patterns[0] ? el("img", { src: ICON.pattern(shape, patterns[0]), alt: "" }) : null,
        shape,
      ])
    );
  }
  classification.appendChild(el("div", { class: "field" }, [el("label", { class: "field-label", text: "Resonance shape → character_reso_shape.json" }), shapePick]));

  host.appendChild(classification);

  /* --- euphoria --- */
  const euphoriaCard = el("div", { class: "card" }, [
    el("h2", { text: "Euphoria" }),
    el("p", { class: "hint", text: "Effect name only — the file stores \"Name: Effect\". Clearing the effect also clears its Future Sight flag." }),
  ]);

  for (const tier of ["1", "2"]) {
    const effect = tier === "1" ? c.euphoria1 : c.euphoria2;
    const future = tier === "1" ? c.euphoria1Future : c.euphoria2Future;

    const input = el("input", { type: "text", value: effect, placeholder: "e.g. General" });
    const flag = el("input", { type: "checkbox", checked: future, disabled: effect === "" });
    flag.addEventListener("change", () => {
      model.setEuphoria(name, tier, input.value, flag.checked);
      afterEdit();
    });
    input.addEventListener("change", () => {
      model.setEuphoria(name, tier, input.value, flag.checked);
      afterEdit();
    });

    euphoriaCard.appendChild(
      el("div", { class: "field" }, [
        el("label", { class: "field-label", text: `Tier ${tier} → euphoria_list.json` }),
        el("div", { class: "field-row" }, [
          input,
          el("label", { class: "toggle", title: "Marks this tier as CN-only in future_sight.json" }, [
            flag,
            el("span", { text: "Future Sight (CN-only)" }),
          ]),
        ]),
      ])
    );
  }
  host.appendChild(euphoriaCard);

  /* --- flags --- */
  const flagsCard = el("div", { class: "card" }, [
    el("h2", { text: "Flags" }),
    el("p", { class: "hint", text: "Membership in the app-wide lists." }),
  ]);

  const flagRow = (label, file, checked, onChange, note) => {
    const input = el("input", { type: "checkbox", checked });
    input.addEventListener("change", () => onChange(input.checked));
    return el("div", { class: "field" }, [
      el("label", { class: "field-label", text: `${label} → ${file}` }),
      el("label", { class: "toggle" }, [input, el("span", { text: label })]),
      note ? el("div", { class: "field-note", text: note }) : null,
    ]);
  };

  flagsCard.appendChild(
    flagRow("Excluded", "exclude_character.json", c.excluded, (v) => {
      model.setExcluded(name, v);
      afterEdit();
    }, "Removed from the app entirely.")
  );
  flagsCard.appendChild(
    flagRow("Collab", "collab_character.json", c.collab, (v) => {
      model.setCollab(name, v);
      afterEdit();
    }, "Counted in statistics, but excluded from the board's chess pieces.")
  );
  flagsCard.appendChild(
    flagRow("Future Sight", "future_sight.json → Character", c.futureSight, (v) => {
      model.setFutureSight(name, v);
      afterEdit();
    }, "CN-only content: hidden while Future Sight is off.")
  );

  host.appendChild(flagsCard);


  /* --- aliases (read-only) --- */
  const aliases = model.aliases[name] || [];
  const rawAliases = Object.entries(model.aliases)
    .filter(([, list]) => Array.isArray(list) && list.includes(name) && list[0] !== name)
    .map(([canonical]) => canonical);

  host.appendChild(
    el("div", { class: "card" }, [
      el("h2", { text: "Name resolution" }),
      el("p", { class: "hint", text: "Read-only: these live in app.js as NAME_ALIASES, so a wrong name here would silently break lookups." }),
      el("div", { class: "field" }, [
        el("label", { class: "field-label", text: "Aliases that resolve to this character" }),
        el("div", { class: "field-note", text: aliases.length ? aliases.join(", ") : "(none)" }),
      ]),
      el("div", { class: "field" }, [
        el("label", { class: "field-label", text: "This name is an alias of" }),
        el("div", { class: "field-note", text: rawAliases.length ? rawAliases.join(", ") : "(it is canonical)" }),
      ]),
    ])
  );

  /* --- files touched --- */
  host.appendChild(renderFileTouchCard(name));
}

/** Which files this character currently appears in. */
function renderFileTouchCard(name) {  const model = state.model;
  const touches = [];
  const push = (file, where) => touches.push(`${file}${where ? ` → ${where}` : ""}`);

  for (const [star, list] of Object.entries(model.value("characters_by_rarity.json") || {})) {
    if (Array.isArray(list) && list.includes(name)) push("characters_by_rarity.json", star);
  }
  for (const [type, list] of Object.entries(model.value("characters_by_afflatus.json") || {})) {
    if (Array.isArray(list) && list.includes(name)) push("characters_by_afflatus.json", type);
  }
  for (const [shape, list] of Object.entries(model.value("character_reso_shape.json") || {})) {
    if (Array.isArray(list) && list.includes(name)) push("character_reso_shape.json", shape);
  }
  for (const [tier, list] of Object.entries(model.value("euphoria_list.json") || {})) {
    if (Array.isArray(list) && list.some((e) => String(e).split(":")[0].trim() === name)) push("euphoria_list.json", `tier ${tier}`);
  }
  if ((model.value("exclude_character.json") || []).includes(name)) push("exclude_character.json");
  if ((model.value("collab_character.json") || []).includes(name)) push("collab_character.json");
  if ((model.value("future_sight.json")?.Character || []).includes(name)) push("future_sight.json", "Character");
  for (const e of model.value("future_sight.json")?.Euphoria || []) {
    if (String(e).split(":")[0].trim() === name) push("future_sight.json", `Euphoria ${e.split(":")[1]?.trim()}`);
  }
  if (model.value("name_map.json")?.character?.[name] !== undefined) push("name_map.json", "character");
  for (const [raw, canonical] of Object.entries(model.value("global_name_transfer.json") || {})) {
    if (canonical === name) push("global_name_transfer.json", raw);
  }
  for (const [archetype, variants] of Object.entries(model.value("team_archetypes.json") || {})) {
    const used = variants.some((slots) =>
      slots.some(
        (m) =>
          m.character === name ||
          (m.substitutes || []).some((s) => (typeof s === "string" ? s : s.character) === name)
      )
    );
    if (used) push("team_archetypes.json", archetype);
  }

  const card = el("div", { class: "card" }, [el("h2", { text: "Present in" })]);
  const list = el("ul", { class: "report" });
  for (const t of touches) list.appendChild(el("li", {}, [el("span", { class: "mark", text: "·" }), el("span", { class: "msg", text: t })]));
  card.appendChild(list);
  return card;
}

/* ------------------------------------------------------------------ *
 * Psychubes
 * ------------------------------------------------------------------ */

function renderPsychubeList() {
  if (!state.model) return;
  const host = $("chube-list-body");
  host.replaceChildren();

  const query = $("chube-search").value.trim().toLowerCase();
  const all = state.model.psychubes;
  const shown = all.filter(
    (p) =>
      state.chubeRarities.has(p.rarity) &&
      (!query || p.name.toLowerCase().includes(query) || p.id.includes(query) || p.nameCN.includes(query))
  );

  const counts = {};
  for (const p of all) counts[p.rarity] = (counts[p.rarity] || 0) + 1;
  $("chube-count").textContent = `${shown.length} of ${all.length}`;
  $("chube-rarity-6").textContent = `6★ (${counts["6"] || 0})`;
  $("chube-rarity-5").textContent = `5★ (${counts["5"] || 0})`;
  $("chube-rarity-6").classList.toggle("on", state.chubeRarities.has("6"));
  $("chube-rarity-5").classList.toggle("on", state.chubeRarities.has("5"));

  const originalIds = new Set(
    Object.values(JSON.parse(state.model.doc("psychube_id.json").original))
      .flat()
      .map((p) => `${p.id}`)
  );

  const frag = document.createDocumentFragment();
  let lastRarity = null;
  for (const p of shown) {
    if (p.rarity !== lastRarity) {
      lastRarity = p.rarity;
      frag.appendChild(el("div", { class: "list-count", style: "padding:6px 10px 2px", text: `${p.rarity}★` }));
    }

    const isNew = !originalIds.has(p.id) || !state.model.doc("psychube_id.json").original.includes(`"id": "${p.id}"`);

    frag.appendChild(
      el("div", {
        class: `row${state.selected.psychubes === p.key ? " on" : ""}`,
        onclick: () => {
          state.selected.psychubes = p.key;
          renderPsychubeList();
          renderPsychubeDetail();
        },
      }, [
        el("img", { src: ICON.psychube(p.rarity, p.id), alt: "", loading: "lazy" }),
        el("div", { class: "row-main" }, [
          el("div", { class: "row-name", text: p.name || `(id ${p.id})` }),
          el("div", { class: "row-sub", text: `id ${p.id} · ${p.nameCN || "no CN name"}` }),
        ]),
        el("div", { class: "row-flags" }, [
          p.futureSight ? el("span", { class: "flag", text: "CN" }) : null,
          isNew ? el("span", { class: "flag dirty", text: "NEW" }) : null,
        ]),
      ])
    );
  }
  host.appendChild(frag);
}

function renderPsychubeDetail() {
  const host = $("chube-detail");
  host.replaceChildren();
  const key = state.selected.psychubes;
  if (!state.model) return;

  const model = state.model;
  const p = key ? model.psychubes.find((x) => x.key === key) : null;

  if (!p) {
    // Nothing selected. In "new" mode that is the point, so show the import card
    // on its own; otherwise show it below a hint, so adding is always one click
    // away rather than a dead end.
    if (!state.import.open) {
      host.appendChild(el("div", { class: "empty", text: "Select a psychube, or press “+ New psychube”." }));
      return;
    }
    host.appendChild(
      el("div", { class: "detail-head" }, [
        el("div", { style: "flex:1" }, [
          el("div", { class: "detail-title", text: "New psychube" }),
          el("div", { class: "detail-sub", text: "Drop the art, fill in the fields, then add it." }),
        ]),
        el("button", {
          class: "btn btn-sm",
          text: "Cancel",
          onclick: () => {
            state.import.open = false;
            renderPsychubeDetail();
          },
        }),
      ])
    );
    host.appendChild(renderIconImportCard());
    return;
  }

  host.appendChild(
    el("div", { class: "detail-head" }, [
      el("img", { class: "avatar", src: ICON.psychube(p.rarity, p.id), alt: "" }),
      el("div", { style: "flex:1" }, [
        el("div", { class: "detail-title", text: p.name }),
        el("div", { class: "detail-sub", text: `${p.rarity}★ · id ${p.id} · ${p.nameCN || "(no CN name)"}` }),
      ]),
      el("button", {
        class: "btn btn-sm btn-danger",
        text: "Delete",
        onclick: () => {
          if (!window.confirm(`Delete ${p.rarity}:${p.id} "${p.name}"? The icon file is left on disk.`)) return;
          model.removePsychube(p.rarity, p.id);
          state.selected.psychubes = null;
          afterEdit();
        },
      }),
    ])
  );

  const card = el("div", { class: "card" }, [el("h2", { text: "Metadata → psychube_id.json" })]);

  const nameInput = el("input", { type: "text", value: p.name });
  nameInput.addEventListener("change", () => {
    model.setPsychubeField(p.rarity, p.id, "name", nameInput.value);
    afterEdit();
  });
  card.appendChild(el("div", { class: "field" }, [el("label", { class: "field-label", text: "English name" }), nameInput]));

  const cnInput = el("input", { type: "text", value: p.nameCN });
  cnInput.addEventListener("change", () => {
    model.setPsychubeField(p.rarity, p.id, "nameCN", cnInput.value);
    afterEdit();
  });
  card.appendChild(el("div", { class: "field" }, [el("label", { class: "field-label", text: "Chinese name" }), cnInput]));

  const patchInput = el("input", { type: "text", value: p.releasePatch, placeholder: "e.g. 4.0" });
  patchInput.addEventListener("change", () => {
    model.setPsychubeField(p.rarity, p.id, "releasePatch", patchInput.value);
    afterEdit();
  });
  card.appendChild(
    el("div", { class: "field" }, [
      el("label", { class: "field-label", text: "Release patch" }),
      patchInput,
      el("div", { class: "field-note", text: "Kept as text so \"4.0\" does not become the number 4." }),
    ])
  );

  const tagPick = el("div", { class: "pick" });
  for (const tag of PSYCHUBE_TAGS) {
    tagPick.appendChild(
      el("button", {
        class: p.tags.includes(tag) ? "on" : "",
        text: tag,
        onclick: () => {
          const current = model.psychubes.find((x) => x.key === key).tags.slice();
          const next = current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag];
          model.setPsychubeField(p.rarity, p.id, "tags", next);
          afterEdit();
        },
      })
    );
  }
  card.appendChild(el("div", { class: "field" }, [el("label", { class: "field-label", text: "Tags" }), tagPick]));

  const fsInput = el("input", { type: "checkbox", checked: p.futureSight });
  fsInput.addEventListener("change", () => {
    model.setPsychubeFutureSight(p.rarity, p.id, fsInput.checked);
    afterEdit();
  });
  card.appendChild(
    el("div", { class: "field" }, [
      el("label", { class: "field-label", text: "Future Sight → future_sight.json → Psychube" }),
      el("label", { class: "toggle" }, [fsInput, el("span", { text: "CN-only" })]),
      el("div", { class: "field-note", text: "Psychube ids are unique per rarity, so the flag is stored as {\"<rarity>\": [id]}." }),
    ])
  );

  host.appendChild(card);

  host.appendChild(
    el("div", { class: "card" }, [
      el("h2", { text: "Icon" }),
      el("p", { class: "hint", text: `Expected at images/psychube_icon/${p.rarity}/${p.id}.png` }),
      el("div", { class: "preview-pair" }, [
        el("div", {}, [
          el("div", { class: "preview-box" }, [el("img", { src: ICON.psychube(p.rarity, p.id), alt: "", style: "width:180px;height:214px" })]),
          el("div", { class: "preview-caption", text: "on disk" }),
        ]),
      ]),
    ])
  );

  host.appendChild(renderIconImportCard());
}

/* ------------------------------------------------------------------ *
 * Icon import
 * ------------------------------------------------------------------ */

/**
 * The psychube icon workflow: pick the raw art, composite it onto the rarity
 * frame in the browser, and write both the PNG and the psychube_id.json entry.
 *
 * This replaces the manual path (run compose.py, move results/ into
 * images/psychube_icon/<rarity>/, rename to the id, then hand-add the JSON entry).
 */
function renderIconImportCard() {
  const imp = state.import;
  const model = state.model;

  const card = el("div", { class: "card" }, [
    el("h2", { text: "Import a new icon" }),
    el("p", {
      class: "hint",
      text:
        "Drop the raw psychube art below. It is composited onto the rarity frame at 180x214, " +
        "written to images/psychube_icon/<rarity>/<id>.png, and the JSON entry is added in one go.",
    }),
  ]);

  const grid = el("div", { class: "import-grid" });

  /* ---- left: the art ---- */
  const left = el("div", { class: "import-col" });

  const fileInput = el("input", { type: "file", accept: "image/*", id: "import-file" });
  const drop = el("div", { class: "drop-zone", text: imp.art ? `✓ ${imp.art.name}` : "Drop art here, or click to choose" });
  drop.addEventListener("click", () => fileInput.click());
  drop.addEventListener("dragover", (e) => {
    e.preventDefault();
    drop.classList.add("over");
  });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", async (e) => {
    e.preventDefault();
    drop.classList.remove("over");
    const file = e.dataTransfer.files[0];
    if (file) await setImportArt(file);
  });
  fileInput.addEventListener("change", async () => {
    if (fileInput.files[0]) await setImportArt(fileInput.files[0]);
  });

  left.appendChild(fileInput);
  left.appendChild(drop);
  left.appendChild(
    el("div", { class: "field-note", text: "Tested with the 248×248 art in testCodeChube/\"needed to edit\"/." })
  );

  /* frame selector */
  const framePick = el("div", { class: "pick" });
  const frames = imp.frames;
  for (const frame of frames) {
    framePick.appendChild(
      el("button", {
        class: imp.frame && imp.frame.label === frame.label ? "on" : "",
        text: frame.label,
        onclick: () => {
          imp.frame = frame;
          renderPsychubeDetail();
        },
      })
    );
  }
  left.appendChild(el("div", { class: "field" }, [
    el("label", { class: "field-label", text: "Rarity frame" }),
    frames.length > 0 ? framePick : el("div", { class: "field-note", text: "No frame could be loaded." }),
    el("div", {
      class: "field-note",
      text:
        frames.length > 1
          ? `${frames.length} frames are reachable. Every shipped icon uses the same frame for both rarities.`
          : "Every shipped icon — 5★ and 6★ alike — uses this one frame.",
    }),
  ]));

  /* ---- right: the fields ---- */
  const right = el("div", { class: "import-col" });

  const rarityPick = el("div", { class: "pick" });
  for (const rarity of PSYCHUBE_RARITIES) {
    rarityPick.appendChild(
      el("button", {
        class: imp.rarity === rarity ? "on" : "",
        text: `${rarity}★`,
        onclick: () => {
          imp.rarity = rarity;
          imp.id = model.nextPsychubeId(rarity);
          renderPsychubeDetail();
        },
      })
    );
  }
  right.appendChild(el("div", { class: "field" }, [
    el("label", { class: "field-label", text: "Rarity" }),
    rarityPick,
    el("div", { class: "field-note", text: `Next free id: ${model.nextPsychubeId(imp.rarity)}` }),
  ]));

  const idInput = el("input", { type: "text", value: imp.id || model.nextPsychubeId(imp.rarity), style: "width:100px" });
  idInput.addEventListener("input", () => {
    imp.id = idInput.value.trim();
    refreshPreview();
  });
  right.appendChild(el("div", { class: "field" }, [
    el("label", { class: "field-label", text: "Icon id" }),
    idInput,
    el("div", { class: "field-note", text: `Will be written to images/psychube_icon/${imp.rarity}/${imp.id || "…"}.png` }),
  ]));

  const nameInput = el("input", { type: "text", value: imp.name, placeholder: "English name", style: "width:100%" });
  nameInput.addEventListener("input", () => {
    imp.name = nameInput.value;
  });
  right.appendChild(el("div", { class: "field" }, [el("label", { class: "field-label", text: "English name" }), nameInput]));

  const cnInput = el("input", { type: "text", value: imp.nameCN, placeholder: "Chinese name", style: "width:100%" });
  cnInput.addEventListener("input", () => {
    imp.nameCN = cnInput.value;
  });
  right.appendChild(el("div", { class: "field" }, [el("label", { class: "field-label", text: "Chinese name" }), cnInput]));

  const patchInput = el("input", { type: "text", value: imp.releasePatch, placeholder: "e.g. 4.1", style: "width:100px" });
  patchInput.addEventListener("input", () => {
    imp.releasePatch = patchInput.value;
  });
  right.appendChild(el("div", { class: "field" }, [el("label", { class: "field-label", text: "Release patch" }), patchInput]));

  const tagPick = el("div", { class: "pick" });
  for (const tag of PSYCHUBE_TAGS) {
    tagPick.appendChild(
      el("button", {
        class: imp.tags.includes(tag) ? "on" : "",
        text: tag,
        onclick: () => {
          imp.tags = imp.tags.includes(tag) ? imp.tags.filter((t) => t !== tag) : [...imp.tags, tag];
          renderPsychubeDetail();
        },
      })
    );
  }
  right.appendChild(el("div", { class: "field" }, [el("label", { class: "field-label", text: "Tags" }), tagPick]));

  const fsInput = el("input", { type: "checkbox", checked: imp.futureSight });
  fsInput.addEventListener("change", () => {
    imp.futureSight = fsInput.checked;
  });
  right.appendChild(el("div", { class: "field" }, [
    el("label", { class: "field-label", text: "Future Sight (CN-only)" }),
    el("label", { class: "toggle" }, [fsInput, el("span", { text: "CN-only" })]),
  ]));

  grid.appendChild(left);
  grid.appendChild(right);
  card.appendChild(grid);

  /* ---- preview ---- */
  const previewWrap = el("div", { class: "field" }, [el("label", { class: "field-label", text: "Preview" })]);
  const pair = el("div", { class: "preview-pair" });

  const artBox = el("div", {}, [
    el("div", { class: "preview-box" }, [imp.art ? el("img", { src: imp.art.url, alt: "", style: "width:120px;height:120px;object-fit:contain" }) : el("div", { class: "preview-caption", text: "no art" })]),
    el("div", { class: "preview-caption", text: imp.art ? `source ${imp.art.width}×${imp.art.height}` : "source" }),
  ]);
  pair.appendChild(artBox);

  const resultCanvas = el("canvas", { width: 180, height: 214 });
  pair.appendChild(
    el("div", {}, [
      el("div", { class: "preview-box" }, [resultCanvas]),
      el("div", { class: "preview-caption", text: "180×214 result" }),
    ])
  );
  previewWrap.appendChild(pair);
  card.appendChild(previewWrap);

  function refreshPreview() {
    const ctx = resultCanvas.getContext("2d");
    ctx.clearRect(0, 0, resultCanvas.width, resultCanvas.height);
    if (!imp.art || !imp.frame) return;
    const composed = icons.compositeIcon({ art: imp.art.img, frame: imp.frame.img });
    ctx.drawImage(composed, 0, 0);
  }

  const status = el("div", { class: "field-note" });

  card.appendChild(
    el("div", { style: "margin-top:14px;display:flex;gap:8px;align-items:center;flex-wrap:wrap" }, [
      el("button", {
        class: "btn btn-primary",
        text: "Add psychube + download icon",
        onclick: async () => {
          try {
            if (!imp.art) throw new Error("Drop the art first.");
            if (!imp.frame) throw new Error("No frame could be loaded.");
            const id = (imp.id || "").trim();
            if (!id) throw new Error("The icon needs an id.");

            const composed = icons.compositeIcon({ art: imp.art.img, frame: imp.frame.img });
            const blob = await icons.canvasToBlob(composed);
            const where = icons.downloadIcon(imp.rarity, id, blob);

            model.addPsychube(imp.rarity, id, {
              name: imp.name,
              nameCN: imp.nameCN,
              tags: imp.tags,
              releasePatch: imp.releasePatch,
              futureSight: imp.futureSight,
            });

            state.selected.psychubes = `${imp.rarity}:${id}`;
            const nextId = model.nextPsychubeId(imp.rarity);
            state.import = { ...state.import, art: null, id: nextId, name: "", nameCN: "", tags: [], releasePatch: "", futureSight: false };
            afterEdit();
            banner(
              `Downloaded the icon for ${imp.rarity}:${id} (as ${id}.png) and added the JSON entry. ` +
                `Put the PNG in ${where.replace(/\/[^/]+$/, "/")} and include ${"psychube_id.json"} in the ZIP download.`,
              "info"
            );
          } catch (e) {
            banner(e.message);
          }
        },
      }),
      el("button", {
        class: "btn",
        text: "Reset",
        onclick: () => {
          state.import = { ...state.import, art: null, name: "", nameCN: "", tags: [], releasePatch: "", futureSight: false };
          renderPsychubeDetail();
        },
      }),
      status,
    ])
  );

  async function setImportArt(file) {
    try {
      const img = await icons.loadImageFromFile(file);
      state.import.art = { name: file.name, url: URL.createObjectURL(file), img, width: img.naturalWidth, height: img.naturalHeight };
      banner("");
      renderPsychubeDetail();
    } catch (e) {
      banner(e.message);
    }
  }

  refreshPreview();
  return card;
}

/* ------------------------------------------------------------------ *
 * Team presets
 * ------------------------------------------------------------------ */

function renderTeamList() {
  if (!state.model) return;
  const host = $("team-list-body");
  host.replaceChildren();

  const query = $("team-search").value.trim().toLowerCase();
  const all = state.model.teamNames;
  const names = all.filter((n) => !query || n.toLowerCase().includes(query));
  $("team-count").textContent =
    names.length === all.length ? `${all.length} presets` : `${names.length} of ${all.length}`;

  const frag = document.createDocumentFragment();
  names.forEach((name, position) => {
    const variants = state.model.team(name);
    const index = all.indexOf(name);

    const row = el("div", {
      class: `row${state.selected.teams === name ? " on" : ""}`,
      dataset: { name, index: String(index) },
      onclick: () => {
        state.selected.teams = name;
        renderTeamList();
        renderTeamDetail();
      },
    }, [
      el("span", {
        class: "drag-handle",
        text: "⠿",
        title: "Drag to reorder",
        draggable: "true",
      }),
      el("div", { class: "row-main" }, [
        el("div", { class: "row-name", text: name }),
        el("div", { class: "row-sub", text: `${variants.length} variant${variants.length === 1 ? "" : "s"}` }),
      ]),
    ]);

    // HTML5 drag and drop. Only the handle starts a drag, so clicking the row
    // still selects it.
    //
    // The drop listeners are attached on every render, not only while a drag is
    // in progress: dragstart sets state.drag without re-rendering, so a
    // conditional attach would leave nothing able to receive the drop.
    const handle = row.firstChild;
    handle.addEventListener("dragstart", (e) => {
      state.drag = { kind: "team", name, index };
      row.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      // Firefox needs data set for the drag to start at all.
      e.dataTransfer.setData("text/plain", name);
      e.stopPropagation();
    });
    handle.addEventListener("dragend", () => {
      row.classList.remove("dragging");
      state.drag = null;
      for (const r of host.querySelectorAll(".row")) r.classList.remove("drop-above", "drop-below");
    });

    row.addEventListener("dragover", (e) => {
      if (!state.drag || state.drag.kind !== "team" || state.drag.name === name) return;
      e.preventDefault();
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
      if (!drag || drag.kind !== "team" || drag.name === name) return;
      e.preventDefault();
      e.stopPropagation();

      const rect = row.getBoundingClientRect();
      const above = e.clientY < rect.top + rect.height / 2;
      // Removing the dragged item first shifts everything after it down by one.
      let target = above ? index : index + 1;
      if (drag.index < target) target -= 1;
      target = Math.max(0, Math.min(all.length - 1, target));

      state.model.moveTeam(drag.name, target);
      afterEdit({ list: true, detail: false });
    });

    frag.appendChild(row);
  });
  host.appendChild(frag);
}

/** A small segmented control: "–", "E1", "E2". */
function euphoriaSeg(current, onPick, focusKey) {
  const wrap = el("div", { class: "seg" });
  for (const [value, label, title] of [
    ["", "–", "No euphoria"],
    ["1", "E1", "Euphoria 1"],
    ["2", "E2", "Euphoria 2"],
  ]) {
    wrap.appendChild(
      el("button", {
        class: current === value ? "on" : "",
        text: label,
        title,
        dataset: focusKey ? { focusKey: `${focusKey}-${value || "none"}` } : {},
        onclick: (e) => {
          e.stopPropagation();
          onPick(value);
        },
      })
    );
  }
  return wrap;
}

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
  return el("button", {
    class: `sub-pick${name ? "" : " empty"}`,
    title: name ? "Click to change" : "Click to add a psychube",
    dataset: focusKey ? { focusKey } : {},
    onclick: (e) => {
      e.stopPropagation();
      pickPsychube(name, onPick);
    },
  }, [
    found ? el("img", { src: ICON.psychube(found.rarity, found.id), class: "chube", alt: "" }) : null,
    el("span", { class: "name", text: name || "(no psychube)" }),
  ]);
}

/** A clickable character cell showing the avatar and name. */
function characterCell(name, onPick, focusKey) {
  const model = state.model;
  const c = model.character(name);
  return el("button", {
    class: `sub-pick${name ? "" : " empty"}`,
    title: "Click to change",
    dataset: focusKey ? { focusKey } : {},
    onclick: (e) => {
      e.stopPropagation();
      openPicker(model.characters, onPick, name, (n) => ({ label: n, img: model.character(n).avatar }));
    },
  }, [
    c.avatar ? el("img", { src: c.avatar, class: "face", alt: "" }) : null,
    el("span", { class: "name", text: name || "(none)" }),
  ]);
}

function renderTeamDetail() {
  const host = $("team-detail");
  host.replaceChildren();
  const archetype = state.selected.teams;
  if (!archetype || !state.model) {
    host.appendChild(el("div", { class: "empty", text: "Select a team preset." }));
    return;
  }

  const model = state.model;
  const variants = model.team(archetype);
  const position = model.teamNames.indexOf(archetype);

  host.appendChild(
    el("div", { class: "detail-head" }, [
      el("div", { style: "flex:1" }, [
        el("div", { class: "detail-title", text: archetype }),
        el("div", {
          class: "detail-sub",
          text: `preset ${position + 1} of ${model.teamNames.length} · ${variants.length} variant(s) → team_archetypes.json`,
        }),
      ]),
      el("button", {
        class: "btn btn-sm",
        text: "↑ Up",
        disabled: position <= 0,
        onclick: () => {
          model.moveTeam(archetype, position - 1);
          afterEdit({ list: true, detail: false });
        },
      }),
      el("button", {
        class: "btn btn-sm",
        text: "↓ Down",
        disabled: position >= model.teamNames.length - 1,
        onclick: () => {
          model.moveTeam(archetype, position + 1);
          afterEdit({ list: true, detail: false });
        },
      }),
      el("button", {
        class: "btn btn-sm btn-danger",
        text: "Delete preset",
        onclick: () => {
          if (!window.confirm(`Delete the preset "${archetype}"?`)) return;
          model.doc("team_archetypes.json").deleteProperty([], archetype);
          model.reload();
          state.selected.teams = null;
          afterEdit();
        },
      }),
    ])
  );

  variants.forEach((slots, vi) => {
    const card = el("div", { class: "card" }, [
      el("div", { class: "card-head" }, [
        el("h2", { text: `Variant ${vi + 1}` }),
        el("span", { class: "hint", style: "margin:0", text: "The Recommend button protects the essential members." }),
      ]),
    ]);

    const slotHost = el("div", { class: "slots" });

    slots.forEach((member, si) => {
      const row = el("div", { class: "slot" });
      const slotKey = `${archetype}-${vi}-${si}`;

      row.appendChild(
        el("span", {
          class: "drag-handle slot-handle",
          text: "⠿",
          title: "Drag to reorder",
          draggable: "true",
        })
      );

      row.appendChild(
        el("div", {}, [
          el("div", { class: "field-label", text: "Character" }),
          characterCell(member.character, (name) => {
            model.setTeamSlot(archetype, vi, si, "character", name);
            afterEdit({ list: false });
          }, `${slotKey}-char`),
        ])
      );

      row.appendChild(
        el("div", {}, [
          el("div", { class: "field-label", text: "Psychube" }),
          psychubeCell(member.psychube, (name) => {
            model.setTeamSlot(archetype, vi, si, "psychube", name);
            afterEdit({ list: false });
          }, `${slotKey}-chube`),
        ])
      );

      const essential = el("input", {
        type: "checkbox",
        checked: member.is_essential === true,
        dataset: { focusKey: `${slotKey}-essential` },
      });
      essential.addEventListener("change", () => {
        model.setTeamSlot(archetype, vi, si, "isEssential", essential.checked);
        afterEdit({ list: false });
      });
      row.appendChild(
        el("div", {}, [
          el("div", { class: "field-label", text: "Essential" }),
          el("label", { class: "toggle" }, [essential, el("span", { text: "must-have" })]),
        ])
      );

      const euphoriaTier = String(member.euphoria || "").replace(/^e/i, "");
      row.appendChild(
        el("div", {}, [
          el("div", { class: "field-label", text: "Euphoria" }),
          euphoriaSeg(
            ["1", "2"].includes(euphoriaTier) ? euphoriaTier : "",
            (tier) => {
              model.setTeamMemberEuphoria(archetype, vi, si, tier);
              afterEdit({ list: false });
            },
            `${slotKey}-eu`
          ),
        ])
      );

      slotHost.appendChild(row);

      // Drag the ⠿ handle to move this member up or down within the variant.
      // As in the preset list, only the handle starts a drag so the inputs in
      // the row stay usable, and the drop listeners are attached on every
      // render because dragstart does not re-render.
      const handle = row.querySelector(".slot-handle");
      handle.addEventListener("dragstart", (e) => {
        state.drag = { kind: "slot", archetype, variant: vi, index: si };
        row.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", member.character || "");
        e.stopPropagation();
      });
      handle.addEventListener("dragend", () => {
        row.classList.remove("dragging");
        state.drag = null;
        for (const r of host.querySelectorAll(".slot")) r.classList.remove("drop-above", "drop-below");
      });

      row.addEventListener("dragover", (e) => {
        const drag = state.drag;
        if (!drag || drag.kind !== "slot" || drag.variant !== vi || drag.index === si) return;
        e.preventDefault();
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
        if (!drag || drag.kind !== "slot" || drag.variant !== vi || drag.index === si) return;
        e.preventDefault();
        e.stopPropagation();

        const rect = row.getBoundingClientRect();
        const above = e.clientY < rect.top + rect.height / 2;
        // Removing the dragged member first shifts everything after it down by one.
        let target = above ? si : si + 1;
        if (drag.index < target) target -= 1;
        target = Math.max(0, Math.min(slots.length - 1, target));

        state.drag = null;
        model.moveTeamSlot(archetype, vi, drag.index, target);
        afterEdit({ list: false });
      });

      /* substitutes */
      const subs = member.substitutes || [];
      let subHost = null;
      if (subs.length) {
        subHost = el("div", { class: "subs" });
        subs.forEach((sub, subi) => {
          const subName = typeof sub === "string" ? sub : sub.character;
          const subPsychube = typeof sub === "string" ? "" : sub.psychube || "";
          const subEuphoria = typeof sub === "string" ? "" : String(sub.euphoria || "").replace(/^e/i, "");
          const subKey = `${slotKey}-sub${subi}`;

          const subRow = el("div", { class: "sub-editor" }, [
            el("span", {
              class: "drag-handle sub-handle",
              text: "⠿",
              title: "Drag to reorder",
              draggable: "true",
            }),
            el("span", { class: "flag", text: "SUB" }),
            characterCell(subName, (name) => {
              model.setSubstituteField(archetype, vi, si, subi, "character", name);
              afterEdit({ list: false });
            }, `${subKey}-char`),
            psychubeCell(subPsychube, (name) => {
              model.setSubstituteField(archetype, vi, si, subi, "psychube", name);
              afterEdit({ list: false });
            }, `${subKey}-chube`),
            euphoriaSeg(
              ["1", "2"].includes(subEuphoria) ? subEuphoria : "",
              (tier) => {
                model.setSubstituteField(archetype, vi, si, subi, "euphoria", tier === "" ? "" : `E${tier}`);
                afterEdit({ list: false });
              },
              `${subKey}-eu`
            ),
            el("button", {
              class: "btn btn-sm btn-danger",
              text: "×",
              title: "Remove substitute",
              onclick: () => {
                model.removeSubstitute(archetype, vi, si, subi);
                afterEdit({ list: false });
              },
            }),
          ]);
          subRow.dataset.index = String(subi);

          // Same pattern as the member rows above: only the handle starts a
          // drag so the cells stay clickable, and the drop listeners live on
          // every row because dragstart does not trigger a re-render.
          const subHandle = subRow.querySelector(".sub-handle");
          subHandle.addEventListener("dragstart", (e) => {
            state.drag = { kind: "sub", archetype, variant: vi, slot: si, index: subi };
            subRow.classList.add("dragging");
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", subName || "");
            // Keep the outer slot (and the preset list) from starting a drag.
            e.stopPropagation();
          });
          subHandle.addEventListener("dragend", () => {
            subRow.classList.remove("dragging");
            state.drag = null;
            for (const r of subHost.querySelectorAll(".sub-editor")) r.classList.remove("drop-above", "drop-below");
          });

          subRow.addEventListener("dragover", (e) => {
            const drag = state.drag;
            if (!drag || drag.kind !== "sub" || drag.archetype !== archetype) return;
            if (drag.variant !== vi || drag.slot !== si || drag.index === subi) return;
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = "move";
            const rect = subRow.getBoundingClientRect();
            const above = e.clientY < rect.top + rect.height / 2;
            subRow.classList.toggle("drop-above", above);
            subRow.classList.toggle("drop-below", !above);
          });
          subRow.addEventListener("dragleave", () => subRow.classList.remove("drop-above", "drop-below"));
          subRow.addEventListener("drop", (e) => {
            const drag = state.drag;
            subRow.classList.remove("drop-above", "drop-below");
            if (!drag || drag.kind !== "sub" || drag.archetype !== archetype) return;
            if (drag.variant !== vi || drag.slot !== si || drag.index === subi) return;
            e.preventDefault();
            e.stopPropagation();

            const rect = subRow.getBoundingClientRect();
            const above = e.clientY < rect.top + rect.height / 2;
            // Removing the dragged substitute first shifts the rest down by one.
            let target = above ? subi : subi + 1;
            if (drag.index < target) target -= 1;
            target = Math.max(0, Math.min(subs.length - 1, target));

            state.drag = null;
            model.moveSubstitute(archetype, vi, si, drag.index, target);
            afterEdit({ list: false });
          });

          subHost.appendChild(subRow);
        });
        slotHost.appendChild(subHost);
      }

      slotHost.appendChild(
        el("div", { class: "slot-actions" }, [
          el("button", {
            class: "btn btn-sm",
            text: "+ Substitute",
            title: "Add an interchangeable alternative for this slot",
            onclick: () => {
              model.addSubstitute(archetype, vi, si, model.characters[0]);
              afterEdit({ list: false });
            },
          }),
          el("button", {
            class: "btn btn-sm btn-danger",
            text: "Remove slot",
            onclick: () => {
              model.doc("team_archetypes.json").removeAt([archetype, vi], si);
              model.reload();
              afterEdit({ list: false });
            },
          }),
        ])
      );
    });

    card.appendChild(slotHost);

    card.appendChild(
      el("div", { style: "margin-top:14px;display:flex;gap:8px" }, [
        el("button", {
          class: "btn btn-sm",
          text: "+ Add slot",
          onclick: () => {
            model.doc("team_archetypes.json").append([archetype, vi], { character: model.characters[0] });
            model.reload();
            afterEdit({ list: false });
          },
        }),
        el("button", {
          class: "btn btn-sm",
          text: "+ Duplicate variant",
          onclick: () => {
            model.doc("team_archetypes.json").append([archetype], JSON.parse(JSON.stringify(slots)));
            model.reload();
            afterEdit({ list: false });
          },
        }),
        el("button", {
          class: "btn btn-sm btn-danger",
          text: "Delete variant",
          onclick: () => {
            model.doc("team_archetypes.json").removeAt([archetype], vi);
            model.reload();
            afterEdit({ list: false });
          },
        }),
      ])
    );

    host.appendChild(card);
  });

  host.appendChild(
    el("div", { style: "display:flex;gap:8px;margin-bottom:18px" }, [
      el("button", {
        class: "btn",
        text: "+ Add variant",
        onclick: () => {
          model.doc("team_archetypes.json").append([archetype], [{ character: model.characters[0], is_essential: true }]);
          model.reload();
          afterEdit({ list: false });
        },
      }),
    ])
  );
}

/** "+ New preset": asks for a name, then creates and selects it. */
function addTeamFlow() {
  const name = window.prompt("Name for the new team preset:");
  if (name === null) return;
  try {
    state.model.addTeam(name);
    state.selected.teams = name.trim();
    setTab("teams");
    banner(`Created the preset "${name.trim()}".`, "info");
  } catch (e) {
    banner(e.message);
  }
}

/* ------------------------------------------------------------------ *
 * Patterns & skins
 * ------------------------------------------------------------------ */

function renderPatterns() {
  if (!state.model) return;
  const model = state.model;

  /* future sight skins */
  const skinHost = $("skin-editor");
  skinHost.replaceChildren();

  const skinMap = new Map();
  for (const item of model.arcanistMap) {
    for (const skin of item.live2d || []) {
      if (!skin || !skin.id) continue;
      const id = String(skin.id);
      if (id.length > 6) continue;
      skinMap.set(id, { id, char: item.nameEng || "", nameEn: skin.characterSkinNameEng || "", nameCn: skin.characterSkin || "" });
    }
  }

  const current = model.value("future_sight.json")?.Skin || [];
  const table = el("div", { class: "slots" });
  for (const id of current) {
    const info = skinMap.get(String(id));
    table.appendChild(
      el("div", { class: "slot", style: "grid-template-columns: 1fr auto" }, [
        el("div", { class: "slot-char" }, [
          el("img", { src: ICON.headicon(id), alt: "" }),
          el("div", {}, [
            el("div", { class: "n", text: info ? info.nameEn || `skin ${id}` : `skin ${id}` }),
            el("div", { class: "row-sub", text: info ? `${info.char} · ${info.nameCn}` : "not found in ArcanistMap.json" }),
          ]),
        ]),
        el("button", {
          class: "btn btn-sm btn-danger",
          text: "Remove",
          onclick: () => {
            model.setFutureSkin(id, false);
            afterEdit({ list: false });
          },
        }),
      ])
    );
  }
  skinHost.appendChild(table);

  const addRow = el("div", { style: "margin-top:12px;display:flex;gap:8px;align-items:center" });
  const skinInput = el("input", { type: "text", placeholder: "skin id, e.g. 315503" });
  addRow.appendChild(skinInput);
  addRow.appendChild(
    el("button", {
      class: "btn btn-sm",
      text: "Add skin",
      onclick: () => {
        const id = skinInput.value.trim();
        if (!id) return;
        if (!skinMap.has(id)) {
          banner(`Skin id ${id} is not in ArcanistMap.json.`);
          return;
        }
        banner("");
        model.setFutureSkin(id, true);
        afterEdit({ list: false });
      },
    })
  );
  addRow.appendChild(
    el("button", {
      class: "btn btn-sm",
      text: "Pick from list…",
      onclick: () => {
        const ids = [...skinMap.keys()];
        openPicker(ids, (id) => {
          model.setFutureSkin(id, true);
          afterEdit({ list: false });
        }, "", (id) => {
          const info = skinMap.get(id);
          return { label: `${info.nameEn || id}\n${info.char}`, img: ICON.headicon(id) };
        });
      },
    })
  );
  skinHost.appendChild(addRow);

  /* name transfer */
  const transferHost = $("transfer-editor");
  transferHost.replaceChildren();
  const transfer = model.value("global_name_transfer.json") || {};

  if (Object.keys(transfer).length === 0) {
    transferHost.appendChild(el("p", { class: "hint", text: "No entries yet." }));
  }

  const rows = el("div", { class: "slots" });
  for (const [raw, canonical] of Object.entries(transfer)) {
    const inArcanist = model.arcanistByNameEng.has(raw);
    const known = model.characters.includes(canonical);

    const rawInput = el("input", { type: "text", value: raw, style: "width:100%" });
    rawInput.addEventListener("change", () => {
      const next = rawInput.value.trim();
      if (!next || next === raw) return;
      try {
        model.removeTransfer(raw);
        model.addTransfer(next, canonical);
        afterEdit({ list: false });
      } catch (e) {
        banner(e.message);
        renderPatterns();
      }
    });

    const targetBtn = el("button", {
      class: `sub-pick${known ? "" : " empty"}`,
      text: canonical,
      title: "Click to change the target character",
      onclick: () => {
        openPicker(model.characters, (name) => {
          try {
            model.addTransfer(raw, name);
            afterEdit({ list: false });
          } catch (e) {
            banner(e.message);
          }
        }, canonical, (name) => ({ label: name, img: model.character(name).avatar }));
      },
    });

    rows.appendChild(
      el("div", { class: "slot", style: "grid-template-columns: 1fr 1fr auto" }, [
        el("div", {}, [
          el("div", { class: "field-label", text: "ArcanistMap name" }),
          rawInput,
          inArcanist
            ? el("div", { class: "field-note", text: "exists in ArcanistMap.json" })
            : el("div", { class: "field-note", style: "color:var(--warn)", text: "not a nameEng in ArcanistMap.json, so it never applies" }),
        ]),
        el("div", {}, [
          el("div", { class: "field-label", text: "Displays as" }),
          targetBtn,
          known
            ? el("div", { class: "field-note", text: `resolves to ${model.resolve(canonical)}` })
            : el("div", { class: "field-note", style: "color:var(--bad)", text: "not a known character" }),
        ]),
        el("button", {
          class: "btn btn-sm btn-danger",
          text: "Remove",
          onclick: () => {
            model.removeTransfer(raw);
            afterEdit({ list: false });
          },
        }),
      ])
    );
  }
  transferHost.appendChild(rows);
}

/* ------------------------------------------------------------------ *
 * Credits
 * ------------------------------------------------------------------ */

function renderCredits() {
  if (!state.model) return;
  const model = state.model;
  const host = $("credit-editor");
  if (!host) return;
  host.replaceChildren();

  const entries = model.creditEntries();
  if (entries.length === 0) {
    host.appendChild(el("p", { class: "hint", text: "No credits yet. Use + Credit to add one." }));
    return;
  }

  const rows = el("div", { class: "slots" });
  entries.forEach((entry, index) => {
    const nameInput = el("input", { type: "text", value: entry.name || "", placeholder: "Name", style: "width:100%" });
    nameInput.addEventListener("change", () => {
      model.setCreditField(index, "name", nameInput.value.trim());
      afterEdit({ list: false });
    });

    const urlInput = el("input", { type: "text", value: entry.url || "", placeholder: "https://…", style: "width:100%" });
    urlInput.addEventListener("change", () => {
      model.setCreditField(index, "url", urlInput.value.trim());
      afterEdit({ list: false });
    });

    const descInput = el("textarea", { rows: 2, placeholder: "What this credit is for", style: "width:100%" });
    descInput.value = entry.description || "";
    descInput.addEventListener("change", () => {
      model.setCreditField(index, "description", descInput.value.trim());
      afterEdit({ list: false });
    });

    const move = (delta) => {
      const target = index + delta;
      if (target < 0 || target >= entries.length) return;
      model.moveCredit(index, target);
      afterEdit({ list: false });
    };

    rows.appendChild(
      el("div", { class: "slot", style: "grid-template-columns: 1fr auto" }, [
        el("div", {}, [
          el("div", { class: "field-label", text: "Name" }),
          nameInput,
          el("div", { class: "field-label", text: "Link (optional)" }),
          urlInput,
          el("div", { class: "field-label", text: "Description" }),
          descInput,
        ]),
        el("div", { class: "pick", style: "flex-direction:column" }, [
          el("button", { class: "btn btn-sm", text: "↑", title: "Move up", onclick: () => move(-1) }),
          el("button", { class: "btn btn-sm", text: "↓", title: "Move down", onclick: () => move(1) }),
          el("button", {
            class: "btn btn-sm btn-danger",
            text: "Remove",
            onclick: () => {
              model.removeCredit(index);
              afterEdit({ list: false });
            },
          }),
        ]),
      ])
    );
  });
  host.appendChild(rows);
}

/** "+ Name transfer": pick the raw name, then the canonical target. */
function addTransferFlow() {
  const model = state.model;
  const rawCandidates = [];
  for (const item of model.arcanistMap) {
    if (!item || !item.id || item.id === 9998 || !item.nameEng) continue;
    const canonical = model.canonicalOverrides[String(item.id)] || model.resolve(item.nameEng);
    if (canonical !== item.nameEng) rawCandidates.push(item.nameEng);
  }
  rawCandidates.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  openPicker(rawCandidates, (raw) => {
    const item = model.arcanistByNameEng.get(raw);
    const canonical = item ? model.canonicalOverrides[String(item.id)] || model.resolve(item.nameEng) : "";
    openPicker(model.characters, (target) => {
      try {
        model.addTransfer(raw, target);
        afterEdit({ list: false });
        banner(`Added: "${raw}" displays as "${target}".`, "info");
      } catch (e) {
        banner(e.message);
      }
    }, canonical || model.characters[0], (name) => ({ label: name, img: model.character(name).avatar }));
  }, "", (raw) => ({ label: `${raw}\n→ ${model.canonicalOverrides[String(model.arcanistByNameEng.get(raw)?.id)] || model.resolve(raw)}`, img: "" }));
}

/* ------------------------------------------------------------------ *
 * Review
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * Builds — per-character build data (guide_builds.json)
 * ------------------------------------------------------------------ */

/** Characters that already have an entry in guide_builds.json. */
function buildNames() {
  return new Set(Object.keys(state.model.guideBuilds()));
}

function filteredBuilds() {
  const model = state.model;
  const query = ($("build-search").value || "").trim().toLowerCase();
  const withBuild = buildNames();
  return model.characters.filter((name) => {
    const c = model.character(name);
    if (state.buildFilters.rarity && c.rarity !== state.buildFilters.rarity) return false;
    if (state.buildFilters.afflatus && c.afflatus !== state.buildFilters.afflatus) return false;
    if (state.buildFilters.onlyWithBuild && !withBuild.has(name)) return false;
    if (!query) return true;
    const haystack = [name, c.cnName, c.arcanistEng].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(query);
  });
}

function renderBuildFilters() {
  const host = $("build-filters");
  host.replaceChildren();

  const rarityRow = el("div", { class: "pick" });
  for (const rarity of [...RARITIES].reverse()) {
    rarityRow.appendChild(
      el("button", {
        class: `chip${state.buildFilters.rarity === rarity ? " on" : ""}`,
        text: `${rarity}★`,
        onclick: () => {
          state.buildFilters.rarity = state.buildFilters.rarity === rarity ? null : rarity;
          renderBuildList();
        },
      })
    );
  }
  host.appendChild(rarityRow);

  const afflatusRow = el("div", { class: "pick" });
  for (const afflatus of AFFLATUSES) {
    afflatusRow.appendChild(
      el("button", {
        class: `chip chip-icon${state.buildFilters.afflatus === afflatus ? " on" : ""}`,
        title: afflatus.replace("_", " "),
        onclick: () => {
          state.buildFilters.afflatus = state.buildFilters.afflatus === afflatus ? null : afflatus;
          renderBuildList();
        },
      }, [el("img", { src: ICON.afflatus(afflatus), alt: "" })])
    );
  }
  host.appendChild(afflatusRow);

  host.appendChild(
    el("div", { class: "pick" }, [
      el("button", {
        class: `chip${state.buildFilters.onlyWithBuild ? " on" : ""}`,
        text: "Has build",
        onclick: () => {
          state.buildFilters.onlyWithBuild = !state.buildFilters.onlyWithBuild;
          renderBuildList();
        },
      }),
    ])
  );
}

function renderBuildList() {
  if (!state.model) return;
  renderBuildFilters();

  const body = $("build-list-body");
  body.replaceChildren();
  const names = filteredBuilds();
  const withBuild = buildNames();

  $("build-count").textContent = `${names.length} character(s) · ${withBuild.size} with a build`;

  // Open on a character that already has a build when there is one.
  if (!state.guide.build || !names.includes(state.guide.build)) {
    state.guide.build = names.find((name) => withBuild.has(name)) || names[0] || null;
  }

  for (const name of names) {
    const c = state.model.character(name);
    const flags = withBuild.has(name) ? [el("span", { class: "flag ok", text: "build" })] : [];

    body.appendChild(
      el("div", {
        class: `row${state.guide.build === name ? " on" : ""}`,
        onclick: () => {
          state.guide.build = name;
          renderBuildList();
          renderBuildDetail();
        },
      }, [
        c.avatar ? el("img", { src: c.avatar, alt: "" }) : el("span", { class: "row-avatar-empty" }),
        el("div", { class: "row-main" }, [
          el("div", { class: "row-name", text: name }),
          el("div", { class: "row-sub", text: [c.cnName, c.afflatus, c.shape].filter(Boolean).join(" · ") || "—" }),
        ]),
        el("div", { class: "row-flags" }, flags),
      ])
    );
  }

  if (names.length === 0) body.appendChild(el("div", { class: "empty", text: "No character matches these filters." }));

  renderBuildDetail();
}

function renderBuildDetail() {
  const host = $("build-detail");
  host.replaceChildren();
  const model = state.model;
  const name = state.guide.build;

  if (!name) {
    host.appendChild(el("div", { class: "empty", text: "Select a character." }));
    return;
  }

  const c = model.character(name);
  const build = model.guideBuild(name) || {};
  const psychubes = Array.isArray(build.psychubes) ? build.psychubes : [];

  host.appendChild(
    el("div", { class: "detail-head" }, [
      c.avatar ? el("img", { src: c.avatar, class: "avatar", alt: "" }) : null,
      el("div", { style: "flex:1" }, [
        el("div", { class: "detail-title", text: name }),
        el("div", { class: "detail-sub", text: [c.cnName, c.afflatus, c.shape].filter(Boolean).join(" · ") || "guide_builds.json" }),
      ]),
    ])
  );

  /* --- psychubes: two slots --- */
  const chubeCard = el("div", { class: "card" }, [
    el("h2", { text: "Recommended psychubes" }),
    el("p", { class: "hint", text: "Two at most, ordered by priority. Click a slot to change it." }),
  ]);
  const chubeSlots = el("div", { class: "pick" });
  for (let at = 0; at < 2; at++) {
    chubeSlots.appendChild(
      psychubeCell(psychubes[at] || "", (value) => {
        const next = psychubes.slice(0, 2);
        if (value) next[at] = value;
        else next.splice(at, 1);
        model.setGuideBuildField(name, "psychubes", next.filter(Boolean));
        afterEdit({ list: false });
      }, `build-chube-${at}`)
    );
  }
  chubeCard.appendChild(chubeSlots);
  host.appendChild(chubeCard);

  /* --- resonance codes --- */
  const resonanceCard = el("div", { class: "card" }, [
    el("h2", { text: "Resonance codes" }),
    el("p", { class: "hint", text: "The label is what the app shows as the copy button." }),
  ]);
  const resonance = build.resonance && typeof build.resonance === "object" ? { ...build.resonance } : {};
  const resHost = el("div", { style: "display:flex;flex-direction:column;gap:6px" });
  const commitResonance = (next) => {
    model.setGuideBuildField(name, "resonance", next);
    afterEdit({ list: false });
  };
  const drawResonance = () => {
    resHost.replaceChildren();
    const current = model.guideBuild(name)?.resonance || {};
    const labels = Object.keys(current);
    if (labels.length === 0) resHost.appendChild(el("div", { class: "field-note", text: "No codes yet." }));

    for (const label of labels) {
      const resoKey = `reso.${label}`;
      const entry = model.i18nEntry(resoKey);

      const labelInput = el("input", {
        type: "text",
        value: label,
        placeholder: "Name (EN)",
        style: "width:130px",
        title: "Resonance build code name (English / Key)",
      });
      const codeInput = el("input", {
        type: "text",
        value: current[label],
        placeholder: "Resonance code",
        style: "flex:1;min-width:180px",
        title: "Game resonance code string",
      });

      labelInput.addEventListener("change", () => {
        const nextLabel = labelInput.value.trim();
        if (!nextLabel || nextLabel === label) {
          labelInput.value = label;
          return;
        }
        const rebuilt = {};
        for (const key of labels) rebuilt[key === label ? nextLabel : key] = current[key];
        if (entry.vi || entry.cn) {
          model.setI18nEntry("vi", `reso.${nextLabel}`, entry.vi || "");
          model.setI18nEntry("cn", `reso.${nextLabel}`, entry.cn || "");
          model.setI18nEntry("en", `reso.${nextLabel}`, nextLabel);
        }
        commitResonance(rebuilt);
      });
      codeInput.addEventListener("change", () => {
        commitResonance({ ...current, [label]: codeInput.value.trim() });
      });

      const viInput = el("input", {
        type: "text",
        value: entry.vi || "",
        placeholder: "Tên Tiếng Việt (VI)",
        style: "flex: 1; font-size: 11px;",
        title: `Vietnamese translation for "${label}"`,
      });
      viInput.addEventListener("change", () => {
        model.setI18nEntry("vi", resoKey, viInput.value.trim());
        model.setI18nEntry("en", resoKey, label);
        afterEdit({ list: false });
      });

      const cnInput = el("input", {
        type: "text",
        value: entry.cn || "",
        placeholder: "中文翻译 (CN)",
        style: "flex: 1; font-size: 11px;",
        title: `Chinese translation for "${label}"`,
      });
      cnInput.addEventListener("change", () => {
        model.setI18nEntry("cn", resoKey, cnInput.value.trim());
        model.setI18nEntry("en", resoKey, label);
        afterEdit({ list: false });
      });

      const rowBlock = el(
        "div",
        {
          class: "reso-code-entry",
          style:
            "margin-bottom: 8px; padding: 6px 8px; background: rgba(255,255,255,0.02); border: 1px solid var(--border-subtle); border-radius: var(--radius);",
        },
        [
          el("div", { class: "pick", style: "align-items: center; gap: 6px; margin-bottom: 4px;" }, [
            el("span", { class: "flag flag-ns", text: "NAME" }),
            labelInput,
            codeInput,
            el("button", {
              class: "btn btn-sm btn-ghost",
              text: "×",
              title: "Delete code",
              onclick: () => {
                const next = { ...current };
                delete next[label];
                commitResonance(next);
              },
            }),
          ]),
          el("div", { style: "display: flex; gap: 6px; align-items: center; padding-left: 20px;" }, [
            el("span", { class: "flag", text: "VI" }),
            viInput,
            el("span", { class: "flag", text: "CN" }),
            cnInput,
          ]),
        ]
      );

      resHost.appendChild(rowBlock);
    }

    resHost.appendChild(
      el("div", { style: "margin-top:8px" }, [
        el("button", {
          class: "btn btn-sm",
          text: "+ Add code",
          onclick: () => {
            const currentNow = model.guideBuild(name)?.resonance || {};
            let label = "Option";
            let i = 2;
            while (label in currentNow) label = `Option ${i++}`;
            commitResonance({ ...currentNow, [label]: "" });
          },
        }),
      ])
    );
  };
  drawResonance();
  resonanceCard.appendChild(resHost);
  host.appendChild(resonanceCard);

  /* --- pattern: only the ones the character's shape offers --- */
  const patternCard = el("div", { class: "card" }, [
    el("h2", { text: "Resonance pattern" }),
    el("p", { class: "hint", text: "Limited to the patterns of this character's shape. Click the current one again to clear it." }),
  ]);
  const patterns = model.buildPatterns(name);
  if (patterns.length === 0) {
    patternCard.appendChild(el("p", { class: "hint", text: "This character has no resonance shape, so there are no patterns to pick." }));
  } else {
    const grid = el("div", { class: "pattern-grid" });
    for (const entry of patterns) {
      const active = build.pattern === entry.pattern;
      grid.appendChild(
        el("button", {
          class: `pattern-cell${active ? " on" : ""}`,
          title: entry.pattern,
          onclick: () => {
            model.setGuideBuildField(name, "pattern", active ? "" : entry.pattern);
            afterEdit({ list: false });
          },
        }, [
          el("img", { src: ICON.pattern(entry.shape, entry.pattern), alt: "" }),
          el("span", { text: entry.pattern }),
        ])
      );
    }
    patternCard.appendChild(grid);
  }
  host.appendChild(patternCard);

  /* --- portrait value charts: any number, each with an editable title --- */
  const charts = model.progressionCharts(name);
  const chartCard = el("div", { class: "card" }, [
    el("h2", { text: "Portrait value charts" }),
    el("p", {
      class: "hint",
      text: "From characters_progressions.json. Each chart has a title and its own bars; an untitled chart shows as “Chart N” in the app.",
    }),
  ]);

  const commitCharts = (fn) => {
    fn();
    afterEdit({ list: false });
  };

  if (charts.length === 0) {
    chartCard.appendChild(
      el("div", { class: "field-row" }, [
        el("span", { class: "field-note", text: "This character has no progression data yet." }),
        el("button", {
          class: "btn btn-sm",
          text: "+ Add chart",
          onclick: () => commitCharts(() => model.addProgressionChart(name)),
        }),
      ])
    );
  } else {
    charts.forEach((chart, chartIndex) => {
      const block = el("div", { class: "chart-editor" });
      const chartCurLang = state.chartLang || state.noteLang || "en";

      const getChartLabel = (l) => {
        if (!chart.label) return "";
        if (typeof chart.label === "object") return chart.label[l] || "";
        return l === "en" ? chart.label : "";
      };

      const titleInput = el("input", {
        type: "text",
        value: getChartLabel(chartCurLang),
        placeholder: `Title (${chartCurLang.toUpperCase()})`,
        class: "chart-editor-title",
      });
      titleInput.addEventListener("change", () => {
        let newLabel;
        const txt = titleInput.value.trim();
        if (typeof chart.label === "object" && chart.label !== null) {
          newLabel = { ...chart.label, [chartCurLang]: txt };
        } else if (chartCurLang === "en") {
          newLabel = txt;
        } else {
          newLabel = { en: chart.label || "", [chartCurLang]: txt };
        }
        if (typeof newLabel === "object" && !newLabel.vi && !newLabel.cn) newLabel = newLabel.en || "";
        commitCharts(() => model.setProgressionLabel(name, chartIndex, newLabel));
      });

      const langChips = el(
        "div",
        { class: "note-inline-langs" },
        ["en", "vi", "cn"].map((l) =>
          el("button", {
            class: `chip chip-xs${chartCurLang === l ? " on" : ""}`,
            text: l.toUpperCase(),
            type: "button",
            onclick: (e) => {
              e.stopPropagation();
              state.chartLang = l;
              afterEdit({ list: false });
            },
          })
        )
      );

      block.appendChild(
        el("div", { class: "chart-editor-head" }, [
          el("span", { class: "field-label", text: `Chart ${chartIndex + 1}` }),
          langChips,
          titleInput,
          el("button", {
            class: "btn btn-sm btn-ghost",
            text: "Remove chart",
            title: "Delete this chart",
            onclick: () => commitCharts(() => model.removeProgressionChart(name, chartIndex)),
          }),
        ])
      );

      const grid = el("div", { class: "pattern-grid" });
      chart.bars.forEach((entry) => {
        const badgeInput = el("input", {
          type: "text",
          value: entry.badge || "",
          placeholder: "P1",
          class: "chart-bar-badge",
          title: "Bar label",
        });
        badgeInput.addEventListener("change", () => {
          commitCharts(() => model.setProgressionBadge(name, chartIndex, entry.badge, badgeInput.value));
        });

        const valInput = el("input", { type: "number", step: "0.1", value: entry.val, style: "width:100%" });
        valInput.addEventListener("change", () => {
          commitCharts(() => model.setProgressionValue(name, entry.badge, valInput.value, chartIndex));
        });

        grid.appendChild(
          el("div", { class: "pattern-cell static" }, [
            badgeInput,
            valInput,
            el("button", {
              class: "btn btn-sm btn-ghost",
              text: "×",
              title: "Remove this bar",
              onclick: () => commitCharts(() => model.removeProgressionBar(name, chartIndex, entry.badge)),
            }),
          ])
        );
      });

      block.appendChild(grid);
      block.appendChild(
        el("div", { class: "field-row" }, [
          el("button", {
            class: "btn btn-sm",
            text: "+ Add bar",
            onclick: () => commitCharts(() => model.addProgressionBar(name, chartIndex)),
          }),
        ])
      );

      chartCard.appendChild(block);
    });

    chartCard.appendChild(
      el("div", { class: "field-row", style: "margin-top:10px" }, [
        el("button", {
          class: "btn btn-sm",
          text: "+ Add chart",
          onclick: () => commitCharts(() => model.addProgressionChart(name)),
        }),
      ])
    );
  }
  host.appendChild(chartCard);

  /* --- notes --- */
  host.appendChild(
    renderMultilingualNotesEditor({
      value: build.notes,
      onSave: (val) => {
        model.setGuideBuildField(name, "notes", val);
        afterEdit({ list: false });
      },
      placeholder: "Recommended Portrait, playstyle notes…",
    })
  );
}

/* ------------------------------------------------------------------ *
 * Rotations — card plans (guide_rotations.json)
 * ------------------------------------------------------------------ */

/** Skill cards for a character, read from guide_skills.json. */
function rotationSkills(name) {
  const table = state.model.value("guide_skills.json") || {};
  const list = table[state.model.resolve(name)];
  return Array.isArray(list) ? list : [];
}

const SLOT_LABELS = { normal: "AP", or: "OR", lb: "1/4 AP", text: "TEXT", tuning: "TUNING" };

/** A tag's label and rendering style, or null for an unknown key. */
function guideTagInfo(key) {
  return GUIDE_SLOT_TAGS.find((tag) => tag.key === key) || null;
}

/** The card layers: the art, the Ultimate plate when it applies, then a surface. */
function guideCardLayers(card, artSrc) {
  const ultimate = guideCardIsUltimate(card);
  const inset = ultimate
    ? { left: 6.56, top: 7.30, width: 87.98, height: 86.35 }
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

/** A tag's plate, drawn from the shipped art. */
function guideTagPlate(tag) {
  return el("img", { class: `guide-tag-plate is-${tag.kind}`, src: `../${tag.image}`, alt: tag.label, title: tag.label });
}

/** The callout editor under a round's cards, plus a mini bracket preview. */
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

    const curVal = annotation.text;
    const curLang = state.noteLang || "en";
    const getAnnText = () => {
      if (!curVal) return "";
      if (typeof curVal === "object") return curVal[curLang] || "";
      return curLang === "en" ? curVal : "";
    };
    const text = el("input", {
      type: "text",
      value: getAnnText(),
      placeholder: `Note text (${curLang.toUpperCase()})`,
      class: "guide-annotation-text",
    });
    text.addEventListener("change", () => {
      let newVal;
      const t = text.value;
      if (typeof curVal === "object" && curVal !== null) {
        newVal = { ...curVal, [curLang]: t };
      } else if (curLang === "en") {
        newVal = t;
      } else {
        newVal = { en: curVal || "", [curLang]: t };
      }
      if (typeof newVal === "object" && !newVal.vi && !newVal.cn) newVal = newVal.en || "";
      model.setGuideAnnotationField(id, roundIndex, annotationIndex, "text", newVal);
      afterEdit({ list: false });
    });

    // A freshly added note takes the focus, so the next keystroke types into it.
    const focus = state.guide.focusNote;
    if (focus && focus.round === roundIndex && focus.index === annotationIndex) {
      state.guide.focusNote = null;
      requestAnimationFrame(() => text.focus());
    }

    const langChips = el(
      "div",
      { class: "note-inline-langs" },
      ["en", "vi", "cn"].map((l) =>
        el("button", {
          class: `chip chip-xs${curLang === l ? " on" : ""}`,
          text: l.toUpperCase(),
          type: "button",
          onclick: (e) => {
            e.stopPropagation();
            state.noteLang = l;
            afterEdit({ list: false });
          },
        })
      )
    );

    host.appendChild(
      el("div", { class: `guide-annotation is-${style}`, dataset: { from, to, style, index: annotationIndex } }, [
        styleSelect,
        rangeInput("from", from),
        el("span", { class: "guide-annotation-dash", text: "–" }),
        rangeInput("to", to),
        langChips,
        text,
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
      ])
    );
  });

  return host;
}

/**
 * The controls for notes that span several rounds. They live in the Rounds card,
 * not in a round, because the bracket points at the gaps between rounds.
 */
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
      const input = el("input", {
        type: "number",
        min: 1,
        max,
        value: value + 1,
        class: "guide-annotation-index",
        title: `Round ${field}`,
      });
      input.addEventListener("change", () => {
        model.setGuideRoundNoteField(id, noteIndex, field, Math.max(0, Number(input.value) - 1));
        afterEdit({ list: false });
      });
      return input;
    };

    const curVal = note.text;
    const curLang = state.noteLang || "en";
    const getRoundNoteText = () => {
      if (!curVal) return "";
      if (typeof curVal === "object") return curVal[curLang] || "";
      return curLang === "en" ? curVal : "";
    };
    const text = el("input", {
      type: "text",
      value: getRoundNoteText(),
      placeholder: `Note text (${curLang.toUpperCase()})`,
      class: "guide-annotation-text",
    });
    text.addEventListener("change", () => {
      let newVal;
      const t = text.value;
      if (typeof curVal === "object" && curVal !== null) {
        newVal = { ...curVal, [curLang]: t };
      } else if (curLang === "en") {
        newVal = t;
      } else {
        newVal = { en: curVal || "", [curLang]: t };
      }
      if (typeof newVal === "object" && !newVal.vi && !newVal.cn) newVal = newVal.en || "";
      model.setGuideRoundNoteField(id, noteIndex, "text", newVal);
      afterEdit({ list: false });
    });

    // A freshly added note takes the focus, so the next keystroke types into it.
    if (state.guide.focusRoundNote === noteIndex) {
      state.guide.focusRoundNote = null;
      requestAnimationFrame(() => text.focus());
    }

    const langChips = el(
      "div",
      { class: "note-inline-langs" },
      ["en", "vi", "cn"].map((l) =>
        el("button", {
          class: `chip chip-xs${curLang === l ? " on" : ""}`,
          text: l.toUpperCase(),
          type: "button",
          onclick: (e) => {
            e.stopPropagation();
            state.noteLang = l;
            afterEdit({ list: false });
          },
        })
      )
    );

    host.appendChild(
      el("div", { class: `guide-annotation is-${style}`, dataset: { from, to, style, index: noteIndex } }, [
        styleSelect,
        roundInput("from", from),
        el("span", { class: "guide-annotation-dash", text: "–" }),
        roundInput("to", to),
        langChips,
        text,
        el("button", {
          class: "guide-annotation-remove",
          text: "×",
          title: "Remove this note",
          onclick: () => {
            model.removeGuideRoundNote(id, noteIndex);
            afterEdit({ list: false });
          },
        }),
      ])
    );
  });

  return host;
}

/**
 * Draws the round-note brackets beside the rounds: a vertical line from the first
 * round to the last, with a tick at each end and the text centred on it.
 */
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

    const label = note.querySelector(".guide-annotation-text")?.value || "";
    if (label) {
      const text = document.createElementNS(NS, "text");
      text.setAttribute("x", String(x + 8));
      text.setAttribute("y", String(Math.round((top + bottom) / 2)));
      text.setAttribute("class", "guide-round-note-label");
      text.textContent = label;
      svg.appendChild(text);
    }
    rail.appendChild(svg);
  });
}

/**
 * Packs callouts into lanes: a note joins the first lane whose spans it does not
 * overlap, so notes over different cards sit side by side instead of stacking.
 * Returns each note's lane index.
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

/**
 * Draws the notes under the cards, the same bracket + stem the published plan
 * uses, so the editor shows what the reader will see. Runs after layout because
 * the spans follow the card widths.
 */
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
      const from = slots[Number(row.dataset.from)];
      const to = slots[Number(row.dataset.to)] || from;
      if (!from || !to) return;
      const a = (from.querySelector(".guide-slot-cards") || from).getBoundingClientRect();
      const b = (to.querySelector(".guide-slot-cards") || to).getBoundingClientRect();
      const left = Math.min(a.left, b.left) - base.left;
      const right = Math.max(a.right, b.right) - base.left;
      const mid = (left + right) / 2;
      const top = Math.min(a.bottom, b.bottom) - base.top + 3;
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

/** The icon for one card: the pinned icon wins, else the skill's first variant. */
function cardIcon(card) {
  if (card.special) return `../${card.special}`;
  if (card.icon) return `../${card.icon}`;
  const hit = rotationSkills(card.character).find((s) => Number(s.skill) === Number(card.skill));
  return hit ? `../${hit.icon}` : "";
}

/** The special card icons, read from guide_cards.json. */
function specialCardIcons() {
  const value = state.model.value("guide_cards.json") || {};
  return Array.isArray(value.special) ? value.special : [];
}

/** The two tuning cards a Tuning AP slot can carry. */
const TUNING_ICONS = {
  S1: "images/skills/Tuning_S1.png",
  S2: "images/skills/Tuning_S2.png",
};

/** Special cards are grouped by id; Tuning_S*.png are not special cards. */
const SPECIAL_GROUPS = [
  { key: "archetype", label: "Archetype cards", test: (id) => id === "760100" },
  { key: "energy", label: "Energy cards", test: (id) => id.startsWith("780") },
  { key: "myth", label: "Myth cards", test: (id) => id.startsWith("770") },
];

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
  body.replaceChildren();
  const rotations = filteredRotations();
  $("rotation-count").textContent = `${rotations.length} rotation(s)`;

  for (const rotation of rotations) {
    const tags = Array.isArray(rotation.archetypes) ? rotation.archetypes : [];
    // The index in the full list, so a filtered view still reorders correctly.
    const index = state.model.guideRotations().findIndex((r) => r && r.id === rotation.id);
    const row = el("div", {
      class: `row${state.guide.rotation === rotation.id ? " on" : ""}`,
      onclick: () => {
        state.guide.rotation = rotation.id;
        state.guide.hand = null;
        state.guide.notePick = null;
        renderRotationList();
        renderRotationDetail();
      },
    }, [
      el("span", {
        class: "drag-handle rot-handle",
        text: "⠿",
        title: "Drag to reorder",
        draggable: "true",
      }),
      el("div", { class: "row-main" }, [
        el("div", { class: "row-name", text: rotation.name || rotation.id || "" }),
        el("div", { class: "row-sub", text: `${rotationRounds(rotation).length} round(s)${tags.length ? ` · ${tags.join(", ")}` : ""}` }),
      ]),
      el("div", { class: "row-flags" }, rotationMembers(rotation).slice(0, 4).map((member) =>
        el("img", { src: state.model.character(member.character).avatar, class: "row-face", alt: "", title: member.character })
      )),
    ]);

    // Same pattern as the team presets list: only the handle starts a drag so
    // clicking the row still selects it, and the drop listeners live on every
    // row because dragstart does not re-render.
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

      const total = state.model.guideRotations().length;
      const rect = row.getBoundingClientRect();
      const above = e.clientY < rect.top + rect.height / 2;
      // Removing the dragged rotation first shifts the rest down by one.
      let target = above ? index : index + 1;
      if (drag.index < target) target -= 1;
      target = Math.max(0, Math.min(total - 1, target));

      state.drag = null;
      state.model.moveGuideRotation(drag.index, target);
      afterEdit();
    });

    body.appendChild(row);
  }

  if (rotations.length === 0) body.appendChild(el("div", { class: "empty", text: "No rotation matches these filters." }));

  body.appendChild(
    el("div", { class: "list-filters" }, [
      el("button", {
        class: "chip",
        text: "+ New rotation",
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

  if (!state.guide.rotation || !rotations.some((r) => r.id === state.guide.rotation)) {
    state.guide.rotation = rotations[0] ? rotations[0].id : null;
  }
  renderRotationDetail();
}

/** The panel's position and size survive a reload of the page. */
const HAND_PANEL_KEY = "editor.cardPanel.v1";

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

  const MIN_W = 170;
  const MIN_H = 140;

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
    if (e.target.closest(".float-hand-close") || e.target.closest(".fh-grip")) return;
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

/** Draws the AP / Cards / Tags panel into the floating palette. */
function renderRotationHand(id) {
  const panel = $("float-hand");
  const body = $("float-hand-body");
  const model = state.model;
  if (!panel || !body) return;
  const rotation = id ? model.guideRotation(id) : null;
  if (!rotation) {
    panel.hidden = true;
    body.replaceChildren();
    return;
  }
  if (!state.guide.panelOpen) {
    panel.hidden = true;
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
    // Tags change what a slot means; frames change how a card is drawn.
    children.push(
      el("h3", { class: "hand-group-title", text: "Tags" }),
      el("p", { class: "hand-help", text: "Drop a tag on a slot to add it, or on a tagged slot to remove it." }),
      el("div", { class: "guide-tag-grid" }, GUIDE_SLOT_TAGS.map((tag) => {
        const sample = tag.image
          ? el("img", { class: "guide-tag-sample is-image", src: `../${tag.image}`, alt: tag.label })
          : el("span", { class: "guide-tag-sample", text: tag.label });
        const tile = el("button", {
          class: "guide-tag-tile",
          title: `${tag.label} — drag onto a slot`,
          draggable: "true",
          dataset: { tag: tag.key },
          onclick: () => armClick({ kind: "tag", tag: tag.key }, `${tag.label} armed — click a slot to toggle it.`),
        }, [sample, el("span", { class: "guide-tag-key", text: tag.key })]);
        tile.addEventListener("dragstart", (e) => armDrag(e, { kind: "tag", tag: tag.key }));
        return tile;
      })),

      el("h3", { class: "hand-group-title", text: "Surface" }),
      el("p", { class: "hand-help", text: "Drop a surface on a card to lay it over that card's art. Skill 3 cards are drawn in the Ultimate plate." }),
      el("div", { class: "guide-surface-grid" }, GUIDE_CARD_SURFACES.map((surface) => {
        const tile = el("button", {
          class: "guide-surface-tile",
          title: `${surface.label} — drag onto a card`,
          draggable: "true",
          dataset: { surface: surface.key },
          onclick: () => armClick({ kind: "surface", surface: surface.key }, `${surface.label} surface armed — click a card.`),
        }, [
          el("span", { class: "guide-surface-art" }, [el("img", { src: `../${surface.image}`, alt: "" })]),
          el("span", { class: "guide-surface-label", text: surface.label }),
        ]);
        tile.addEventListener("dragstart", (e) => armDrag(e, { kind: "surface", surface: surface.key }));
        return tile;
      }))
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
      children.push(
        el("div", { class: "hand-member" }, [
          el("div", { class: "hand-member-title", title: memberName }, [
            c.avatar ? el("img", { src: c.avatar, alt: "" }) : null,
            el("span", { text: memberName }),
            skills.length === 0 ? el("span", { class: "hand-member-note", text: "no icons" }) : null,
          ]),
          el("div", { class: "guide-hand" }, skills.map((entry) => {
            const payload = { kind: "card", character: memberName, skill: entry.skill, icon: entry.icon };
            const card = el("button", {
              class: "guide-hand-card",
              title: `${memberName} · ${entry.skill} — drag onto a slot, or click then click a slot`,
              draggable: "true",
              onclick: () => armClick(payload, `${memberName} card armed — click a slot to place it.`),
            }, [el("img", { src: `../${entry.icon}`, alt: "" })]);
            card.addEventListener("dragstart", (e) => armDrag(e, payload));
            return card;
          })),
        ])
      );
    }

    const specials = specialCardIcons().filter((icon) => !/\/Tuning_S\d+\.png$/i.test(icon));
    for (const group of SPECIAL_GROUPS) {
      const icons = specials.filter((icon) => group.test((icon.split("/").pop() || "").replace(/\.png$/i, "")));
      if (icons.length === 0) continue;
      children.push(el("h3", { class: "hand-group-title", text: group.label }));
      const grid = el("div", { class: "special-card-grid" });
      for (const icon of icons) {
        const payload = { kind: "card", special: icon };
        const card = el("button", {
          class: "guide-hand-card is-special",
          title: group.label.replace(/s$/, ""),
          draggable: "true",
          onclick: () => armClick(payload, `${group.label.replace(/s$/, "")} armed — click a slot to place it.`),
        }, [el("img", { src: `../${icon}`, alt: "" })]);
        card.addEventListener("dragstart", (e) => armDrag(e, payload));
        grid.appendChild(card);
      }
      children.push(grid);
    }
    panel.title = "Cards";
  }

  $("float-hand-title").textContent = panel.title;
  body.replaceChildren(...children);
}

function renderRotationDetail() {
  const host = $("rotation-detail");
  host.replaceChildren();
  const model = state.model;
  const rotation = model.guideRotation(state.guide.rotation);

  if (!rotation) {
    host.appendChild(el("div", { class: "empty", text: "Select a rotation, or create one with “+ New rotation”." }));
    renderRotationHand(null);
    return;
  }

  const id = rotation.id;
  const members = rotationMembers(rotation);
  const rounds = rotationRounds(rotation);
  const archetypes = Array.isArray(rotation.archetypes) ? rotation.archetypes : [];
  if (!state.guide.hand && members[0]) state.guide.hand = model.resolve(members[0].character);

  host.appendChild(
    el("div", { class: "detail-head" }, [
      el("div", { style: "flex:1" }, [
        el("div", { class: "detail-title", text: rotation.name || id }),
        el("div", { class: "detail-sub", text: `${rounds.length} round(s) → guide_rotations.json` }),
      ]),
      el("button", {
        class: "btn btn-sm",
        text: "Duplicate rotation",
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
        text: "Remove rotation",
        onclick: () => {
          model.removeGuideRotation(id);
          state.guide.rotation = null;
          afterEdit();
        },
      }),
    ])
  );

  /* --- identity, tuning, archetypes, notes --- */
  const nameInput = el("input", { type: "text", value: rotation.name || "", style: "width:100%" });
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
    asCard: false,
  });

  const tuningRow = el("div", { class: "pick" });
  for (const tuning of TUNINGS) {
    const active = rotation.tuning === tuning;
    tuningRow.appendChild(
      el("button", {
        class: `chip chip-icon${active ? " on" : ""}`,
        title: tuning,
        onclick: () => {
          model.setGuideRotationField(id, "tuning", active ? "" : tuning);
          afterEdit();
        },
      }, [
        el("img", { src: `../images/tuning_abilities/${encodeURIComponent(tuning)}.png`, alt: "" }),
        el("span", { text: tuning }),
      ])
    );
  }

  const archetypeRow = el("div", { class: "pick" });
  for (const tag of ROTATION_ARCHETYPES) {
    const active = archetypes.includes(tag);
    archetypeRow.appendChild(
      el("button", {
        class: `chip${active ? " on" : ""}`,
        text: tag,
        onclick: () => {
          const next = active ? archetypes.filter((t) => t !== tag) : [...archetypes, tag];
          model.setGuideRotationField(id, "archetypes", next);
          afterEdit();
        },
      })
    );
  }

  host.appendChild(
    el("div", { class: "card" }, [
      el("h2", { text: "Rotation" }),
      el("div", { class: "field" }, [el("label", { class: "field-label", text: "Name" }), nameInput]),
      el("div", { class: "field" }, [el("label", { class: "field-label", text: "Tuning" }), tuningRow]),
      el("div", { class: "field" }, [el("label", { class: "field-label", text: "Archetype tags" }), archetypeRow]),
      notesField,
    ])
  );

  /* --- team: character + psychube + portrait per slot --- */
  const memberHost = el("div", { class: "pick" });
  for (let slot = 0; slot < 4; slot++) {
    const member = members[slot] || { character: "", psychube: "" };
    memberHost.appendChild(
      el("div", { class: "pick pick-member" }, [
        characterCell(member.character, (value) => {
          model.setGuideRotationMember(id, slot, "character", value);
          if (!state.guide.hand && value) state.guide.hand = model.resolve(value);
          afterEdit();
        }, `rotation-member-${slot}`),
        psychubeCell(member.psychube, (value) => {
          model.setGuideRotationMember(id, slot, "psychube", value);
          afterEdit({ list: false });
        }, `rotation-member-chube-${slot}`),
        portraitSeg(member.portrait || 0, (tier) => {
          model.setGuideRotationMember(id, slot, "portrait", tier);
          afterEdit({ list: false });
        }, `rotation-member-portrait-${slot}`),
      ])
    );
  }
  host.appendChild(
    el("div", { class: "card" }, [
      el("h2", { text: "Team" }),
      el("p", { class: "hint", text: "Up to four characters, each with the psychube they run and their portrait tier (the five dashes under the avatar)." }),
      memberHost,
    ])
  );

  /* --- skill hand (floating palette, so a long list of rounds never hides it) --- */
  const handCard = el("div", { class: "card" }, [
    el("div", { class: "card-head" }, [
      el("h2", { text: "Cards" }),
      el("button", {
        class: "btn btn-sm",
        text: "Open card panel",
        title: "A card panel you can drag anywhere and resize",
        onclick: () => {
          state.guide.panelOpen = true;
          renderRotationDetail();
        },
      }),
    ]),
    el("p", { class: "hint", text: "The cards live in a floating panel: drag it by its title bar and resize it from the corner, then drag a card onto a slot. While the panel is open it stays in view however far you scroll." }),
  ]);
  host.appendChild(handCard);
  renderRotationHand(id);

  /* --- rounds --- */
  const roundsCard = el("div", { class: "card" }, [
    el("div", { class: "card-head" }, [
      el("h2", { text: "Rounds" }),
      el("div", { class: "pick", style: "align-items: center; gap: 8px;" }, [
        el(
          "div",
          { class: "list-filters", style: "margin: 0;", title: "Language for editing bracket & round notes" },
          ["en", "vi", "cn"].map((l) =>
            el("button", {
              class: `chip${(state.noteLang || "en") === l ? " on" : ""}`,
              text: l.toUpperCase(),
              type: "button",
              onclick: () => {
                state.noteLang = l;
                afterEdit({ list: false });
              },
            })
          )
        ),
        el("button", {
          class: "btn btn-sm",
          text: "+ Round note",
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
        el("button", { class: "btn btn-sm", text: "+ Round", onclick: () => { model.addGuideRound(id); afterEdit(); } }),
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
    const curRoundNoteVal = round.note;
    const curLang = state.noteLang || "en";
    const getRoundNoteTitle = () => {
      if (!curRoundNoteVal) return "";
      if (typeof curRoundNoteVal === "object") return curRoundNoteVal[curLang] || "";
      return curLang === "en" ? curRoundNoteVal : "";
    };
    const roundNote = el("input", {
      type: "text",
      value: getRoundNoteTitle(),
      placeholder: `Round note (${curLang.toUpperCase()})`,
      class: "guide-round-note-input",
    });
    roundNote.addEventListener("change", () => {
      let newVal;
      const t = roundNote.value;
      if (typeof curRoundNoteVal === "object" && curRoundNoteVal !== null) {
        newVal = { ...curRoundNoteVal, [curLang]: t };
      } else if (curLang === "en") {
        newVal = t;
      } else {
        newVal = { en: curRoundNoteVal || "", [curLang]: t };
      }
      if (typeof newVal === "object" && !newVal.vi && !newVal.cn) newVal = newVal.en || "";
      model.setGuideRoundNote(id, roundIndex, newVal);
      afterEdit({ list: false });
    });

    roundEl.appendChild(
      el("span", {
        class: "guide-turn-no",
        text: String(roundIndex + 1).padStart(2, "0"),
        title: `Round ${roundIndex + 1}`,
      })
    );

    roundEl.appendChild(
      el("div", { class: "guide-turn-head" }, [
        roundNote,
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
              // The note appears straight away and spans the round; the ends are
              // then adjusted with the arrows or by picking two cards.
              const existing = Array.isArray(round.annotations) ? round.annotations.length : 0;
              state.guide.focusNote = { round: roundIndex, index: existing };
              model.addGuideAnnotation(id, roundIndex, 0, count - 1, "", "bracket");
              afterEdit({ list: false });
            },
          }),
          el("button", {
            class: "btn btn-sm",
            text: "Duplicate round",
            title: "Copy this round, placed right after it",
            onclick: () => { model.duplicateGuideRound(id, roundIndex); afterEdit(); },
          }),
          el("button", { class: "btn btn-sm btn-danger", text: "Remove round", onclick: () => { model.removeGuideRound(id, roundIndex); afterEdit(); } }),
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
        for (const s of slotRow.querySelectorAll(".guide-slot-editor")) {
          s.classList.remove("drop-before", "drop-after");
        }
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
          // The tuning icon is a choice, not a drop target. Read the current
          // card on every click, because the slot is not re-created in place.
          const currentIcon = () => slot.cards?.[0]?.special
            || model.guideRotations().find((r) => r && r.id === id)?.rounds?.[roundIndex]?.slots?.[slotIndex]?.cards?.[0]?.special
            || "";
          const iconRow = el("div", { class: "guide-slot-tuning-icons" });
          for (const [key, icon] of Object.entries(TUNING_ICONS)) {
            iconRow.appendChild(
              el("button", {
                class: `guide-tuning-icon${currentIcon() === icon ? " on" : ""}`,
                title: `Tuning ${key}`,
                "aria-pressed": currentIcon() === icon ? "true" : "false",
                onclick: (e) => {
                  e.stopPropagation();
                  model.setGuideTuningIcon(id, roundIndex, slotIndex, currentIcon() === icon ? "" : icon);
                  afterEdit({ list: false });
                },
              }, [el("img", { src: `../${icon}`, alt: key })])
            );
          }
          slotEl.appendChild(iconRow);
        }
      } else {
        const cardRow = el("div", { class: "guide-slot-cards" });
        const badge = tags.map(guideTagInfo).find((tag) => tag && tag.kind === "badge");
        const plaques = tags.map(guideTagInfo).filter((tag) => tag && tag.kind === "plaque");
        // Both plates hang off the slot's first card, so they stay on its corner
        // whatever shape the card is.
        const plates = [
          ...(badge ? [guideTagPlate(badge)] : []),
          ...plaques.map((tag) => guideTagPlate(tag)),
        ];

        // An OR slot always shows two places; a normal slot one. The second
        // placeholder is what makes "either of two" visible before a drop.
        const places = type === "or" ? 2 : 1;
        for (let cardIndex = 0; cardIndex < Math.max(places, cards.length); cardIndex++) {
          const card = cards[cardIndex];
          if (cardIndex > 0) {
            cardRow.appendChild(el("span", { class: "guide-or", text: "or" }));
          }
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
          const cardEl = el("span", {
            class: `guide-slot-card${layers.ultimate ? " is-ultimate" : ""}${layers.surface ? ` has-surface is-surface-${layers.surface.key}` : ""}${type === "lb" ? " is-lb" : ""}${card.preferred ? " is-preferred" : ""}${cardIndex === 0 && badge ? " has-badge" : ""}`,
            title: card.special ? "Special card" : `${card.character} · ${card.skill}`,
            dataset: { frame: layers.ultimate ? "ultimate" : "normal", surface: layers.surface?.key || "" },
          }, [
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
              type === "or"
                ? el("button", {
                    class: `guide-card-tool${card.preferred ? " on" : ""}`,
                    text: "\u2605",
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
              text: "\u00d7",
              title: "Remove this card",
              onclick: (e) => {
                e.stopPropagation();
                model.removeGuideSlotCard(id, roundIndex, slotIndex, cardIndex);
                afterEdit();
              },
            }),
          ]);

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
                                }

      // The layout caption only appears when it says something the cards do not
      // already say: an OR slot's pair and a 1/4 AP card's size speak for
      // themselves.
      if (type !== "normal" && type !== "lb" && type !== "or") {
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

      // Reordering an AP slot inside this round takes precedence over dropping
      // a card onto it, so both gestures can share the same element.
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

    // The notes are drawn under the cards exactly as they appear in the plan;
    // the rows below are the controls for them.
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
  // The note brackets follow the cards, so they are measured once laid out.
  requestAnimationFrame(() => {
    drawEditorBrackets(host);
    drawRoundNoteBrackets(host);
  });
}

/* ------------------------------------------------------------------ *
 * Multilingual notes helper
 * ------------------------------------------------------------------ */

function renderMultilingualNotesEditor({ value, onSave, placeholder = "Optional notes", asCard = true }) {
  let noteLang = state.noteLang || "en";

  const getVal = (lang) => {
    if (!value) return "";
    if (typeof value === "object") return value[lang] || "";
    return lang === "en" ? value : "";
  };

  const container = el("div", { class: asCard ? "card" : "field" });
  const headRow = el(
    "div",
    { style: "display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;" },
    [
      asCard
        ? el("h2", { text: "Notes", style: "margin: 0;" })
        : el("label", { class: "field-label", text: "Notes", style: "margin: 0;" }),
    ]
  );

  const tabGroup = el("div", { class: "list-filters", style: "margin: 0;" });
  ["en", "vi", "cn"].forEach((l) => {
    const chip = el("button", {
      class: `chip${noteLang === l ? " on" : ""}`,
      text: l.toUpperCase(),
      type: "button",
      onclick: () => {
        noteLang = l;
        state.noteLang = l;
        textarea.value = getVal(l);
        textarea.placeholder = `${placeholder} (${l.toUpperCase()})`;
        [...tabGroup.children].forEach((c, idx) => {
          c.classList.toggle("on", ["en", "vi", "cn"][idx] === l);
        });
      },
    });
    tabGroup.appendChild(chip);
  });
  headRow.appendChild(tabGroup);
  container.appendChild(headRow);

  const textarea = el("textarea", {
    rows: asCard ? 3 : 2,
    style: "width:100%",
    placeholder: `${placeholder} (${noteLang.toUpperCase()})`,
  });
  textarea.value = getVal(noteLang);

  textarea.addEventListener("change", () => {
    let newVal;
    const txt = textarea.value;
    if (typeof value === "object" && value !== null) {
      newVal = { ...value, [noteLang]: txt };
    } else if (noteLang === "en") {
      newVal = txt;
    } else {
      newVal = { en: value || "", [noteLang]: txt };
    }
    if (typeof newVal === "object") {
      if (!newVal.vi && !newVal.cn) newVal = newVal.en || "";
    }
    onSave(newVal);
  });

  container.appendChild(textarea);
  return container;
}

/* ------------------------------------------------------------------ *
 * i18n — translations (i18n.json)
 * ------------------------------------------------------------------ */

function renderI18nList() {
  const host = $("i18n-list-body");
  if (!host || !state.model) return;
  host.replaceChildren();

  const allKeys = state.model.i18nKeys;
  const searchInput = $("i18n-search");
  const query = (searchInput ? searchInput.value : state.i18n.search || "").trim().toLowerCase();

  // Namespace filter chips
  const filtersHost = $("i18n-filters");
  if (filtersHost) {
    const namespaces = ["all", "action", "afflatus", "builds", "pattern", "reso", "rotations", "team", "toolbar"];
    filtersHost.replaceChildren();
    namespaces.forEach((ns) => {
      const active = (state.i18n.filterNs === null && ns === "all") || state.i18n.filterNs === ns;
      const chip = el("button", {
        class: `chip${active ? " on" : ""}`,
        text: ns === "all" ? "All" : ns,
        onclick: () => {
          state.i18n.filterNs = ns === "all" ? null : ns;
          renderI18nList();
        },
      });
      filtersHost.appendChild(chip);
    });

    const newBtn = el("button", {
      class: "chip",
      text: "+ New key",
      onclick: () => promptNewI18nKey(),
    });
    filtersHost.appendChild(newBtn);
  }

  const filtered = allKeys.filter((key) => {
    if (state.i18n.filterNs && !key.startsWith(state.i18n.filterNs + ".")) return false;
    if (!query) return true;
    if (key.toLowerCase().includes(query)) return true;
    const entry = state.model.i18nEntry(key);
    if (String(entry.en).toLowerCase().includes(query)) return true;
    if (String(entry.cn).toLowerCase().includes(query)) return true;
    if (String(entry.vi).toLowerCase().includes(query)) return true;
    return false;
  });

  const countEl = $("i18n-count");
  if (countEl) countEl.textContent = `${filtered.length} key${filtered.length === 1 ? "" : "s"}`;

  if (!state.i18n.selectedKey || !filtered.includes(state.i18n.selectedKey)) {
    state.i18n.selectedKey = filtered[0] || null;
  }

  filtered.forEach((key) => {
    const entry = state.model.i18nEntry(key);
    const parts = key.split(".");
    const ns = parts.length > 1 ? parts[0] : "";
    const nameWithoutNs = parts.length > 1 ? parts.slice(1).join(".") : key;

    const isCurrent = key === state.i18n.selectedKey;
    const item = el(
      "div",
      {
        class: `i18n-row${isCurrent ? " on" : ""}`,
        onclick: () => {
          state.i18n.selectedKey = key;
          renderI18nList();
          renderI18nDetail();
        },
      },
      [
        el("div", { class: "i18n-row-main" }, [
          el("div", { class: "i18n-row-header" }, [
            ns ? el("span", { class: "flag flag-ns", text: ns }) : null,
            el("span", { class: "i18n-key", text: nameWithoutNs, title: key }),
          ]),
          el("div", { class: "i18n-preview", text: entry.en || entry.cn || entry.vi || "—" }),
        ]),
        el("div", { class: "i18n-lang-dots" }, [
          el("span", {
            class: `i18n-dot${entry.en ? " has" : ""}`,
            title: entry.en ? `EN: ${entry.en}` : "EN missing",
            text: "EN",
          }),
          el("span", {
            class: `i18n-dot${entry.vi ? " has" : ""}`,
            title: entry.vi ? `VI: ${entry.vi}` : "VI missing",
            text: "VI",
          }),
          el("span", {
            class: `i18n-dot${entry.cn ? " has" : ""}`,
            title: entry.cn ? `CN: ${entry.cn}` : "CN missing",
            text: "CN",
          }),
        ]),
      ]
    );
    host.appendChild(item);
  });

  renderI18nDetail();
}

function promptNewI18nKey() {
  const key = window.prompt("Enter new translation key (e.g. reso.MyKey or custom.text):");
  if (!key || !key.trim()) return;
  const trimmed = key.trim();
  state.model.addI18nKey(trimmed, { en: "", cn: "", vi: "" });
  state.i18n.selectedKey = trimmed;
  afterEdit({ list: true, detail: true });
}

function renderI18nDetail() {
  const host = $("i18n-detail");
  if (!host || !state.model) return;
  host.replaceChildren();

  const key = state.i18n.selectedKey;
  if (!key) {
    host.appendChild(el("div", { class: "empty", text: "Select a translation key." }));
    return;
  }

  const entry = state.model.i18nEntry(key);
  const parts = key.split(".");
  const ns = parts.length > 1 ? parts[0] : "general";

  const head = el("div", { class: "detail-head" }, [
    el("div", { class: "title-row" }, [
      el("h1", { text: key }),
      el("span", { class: "tag", text: ns }),
    ]),
  ]);

  const makeLangField = (langCode, langLabel, value) => {
    const isMultiLine = String(value).includes("\n") || String(value).length > 60;
    const input = isMultiLine
      ? el("textarea", { rows: 3, style: "width:100%" })
      : el("input", { type: "text", style: "width:100%" });
    input.value = value;
    input.addEventListener("change", () => {
      state.model.setI18nEntry(langCode, key, input.value);
      afterEdit({ list: true, detail: false });
    });
    return el("div", { class: "field", style: "margin-bottom: 14px;" }, [
      el(
        "label",
        {
          class: "field-label",
          style: "font-weight: 600; display: flex; align-items: center; gap: 6px; margin-bottom: 4px;",
        },
        [
          el("span", { text: langLabel }),
          el("span", { class: "tag", text: langCode.toUpperCase() }),
        ]
      ),
      input,
    ]);
  };

  const fieldsCard = el("div", { class: "card" }, [
    el("h2", { text: "Translations" }),
    makeLangField("en", "English", entry.en),
    makeLangField("vi", "Tiếng Việt", entry.vi),
    makeLangField("cn", "中文 (Chinese)", entry.cn),
  ]);

  const actionsCard = el("div", { class: "card", style: "margin-top: 16px;" }, [
    el("button", {
      class: "btn btn-danger",
      text: "Delete key",
      onclick: () => {
        if (confirm(`Delete key "${key}" across all languages?`)) {
          state.model.removeI18nKey(key);
          state.i18n.selectedKey = null;
          afterEdit({ list: true, detail: true });
        }
      },
    }),
  ]);

  host.appendChild(head);
  host.appendChild(fieldsCard);
  host.appendChild(actionsCard);
}

/* ------------------------------------------------------------------ *
 * Review
 * ------------------------------------------------------------------ */

function renderReview() {
  if (!state.model) return;
  const model = state.model;

  /* validation */
  const report = $("validation-report");
  report.replaceChildren();
  const { errors, warnings } = validate(model);

  if (errors.length === 0 && warnings.length === 0) {
    report.appendChild(el("p", { class: "report-ok", text: "No problems found." }));
  } else {
    const list = el("ul", { class: "report" });
    for (const e of errors) {
      list.appendChild(el("li", {}, [el("span", { class: "mark err", text: "x" }), el("span", { class: "msg", text: e })]));
    }
    for (const w of warnings) {
      list.appendChild(el("li", {}, [el("span", { class: "mark warn", text: "!" }), el("span", { class: "msg", text: w })]));
    }
    report.appendChild(list);
  }
  $("validation-card").style.borderColor = errors.length ? "rgba(226,114,91,.5)" : "var(--border)";

  /* diff */
  const diffHost = $("diff-report");
  diffHost.replaceChildren();

  const changed = model.changedFiles();
  if (changed.length === 0) {
    diffHost.appendChild(el("p", { class: "hint", text: "No pending changes." }));
  } else {
    for (const name of changed) {
      const doc = model.doc(name);
      const wrap = el("div", { class: "diff-file" }, [el("div", { class: "name", text: `data/${name}` })]);
      const body = el("div", { class: "diff" });

      for (const hunk of diffHunks(doc.original, doc.toString(), 2)) {
        for (const row of hunk) {
          const prefix = row.type === "add" ? "+ " : row.type === "del" ? "- " : "  ";
          body.appendChild(el("div", { class: `diff-row ${row.type}`, text: prefix + row.text }));
        }
        body.appendChild(el("div", { class: "diff-gap", text: "⋯" }));
      }
      wrap.appendChild(body);
      diffHost.appendChild(wrap);
    }
  }

  /* how to take the changes away */
  const actions = el("div", { style: "margin-top:14px;display:flex;gap:8px;align-items:center;flex-wrap:wrap" });
  if (changed.length > 0) {
    actions.appendChild(
      el("button", {
        class: "btn",
        text: `Download ${changed.length} file${changed.length === 1 ? "" : "s"} (.zip)`,
        onclick: downloadChanges,
      })
    );
    actions.appendChild(
      el("div", {
        class: "field-note",
        style: "margin:0",
        text: "Extract the archive over the repository root — the entries are already at data/<name>.json.",
      })
    );
  }
  diffHost.appendChild(actions);
}

/* ------------------------------------------------------------------ *
 * Picker modal
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
      info.img ? el("img", { src: info.img, alt: "", loading: "lazy" }) : el("div", { style: "height:52px" }),
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
 * Actions
 * ------------------------------------------------------------------ */

/**
 * Packages the pending changes and downloads them.
 *
 * Validation runs first: a download that would not load in the app is worse than
 * no download at all, because it is easy to drop the files in without looking.
 */
function downloadChanges() {
  const model = state.model;
  if (!model) return;

  const { errors } = validate(model);
  if (errors.length > 0) {
    setTab("review");
    banner(`Nothing downloaded: ${errors.length} validation error(s). See the Review tab.`);
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
  for (const tab of document.querySelectorAll(".tab")) {
    tab.addEventListener("click", () => setTab(tab.dataset.tab));
  }

  $("btn-save").addEventListener("click", downloadChanges);

  // The floating card panel keeps its frame, and closes without losing the tab.
  const handPanel = $("float-hand");
  if (handPanel) restoreHandPanelFrame(handPanel);
  $("float-hand-close").addEventListener("click", () => {
    state.guide.panelOpen = false;
    renderRotationDetail();
  });

  $("char-search").addEventListener("input", renderCharacterList);
  $("chube-search").addEventListener("input", renderPsychubeList);
  $("team-search").addEventListener("input", renderTeamList);
  $("build-search").addEventListener("input", renderBuildList);
  $("rotation-search").addEventListener("input", renderRotationList);
  $("i18n-search")?.addEventListener("input", renderI18nList);

  // psychube rarity filters and the new-psychube action
  for (const rarity of PSYCHUBE_RARITIES) {
    $(`chube-rarity-${rarity}`).addEventListener("click", () => {
      if (state.chubeRarities.has(rarity)) state.chubeRarities.delete(rarity);
      else state.chubeRarities.add(rarity);
      renderPsychubeList();
    });
  }
  $("chube-new").addEventListener("click", () => {
    state.import.open = true;
    state.import.id = state.model ? state.model.nextPsychubeId(state.import.rarity) : "";
    state.selected.psychubes = null;
    setTab("psychubes");
    renderPsychubeDetail();
    const card = $("chube-detail").lastElementChild;
    if (card) card.scrollIntoView({ block: "start" });
  });

  $("team-new").addEventListener("click", addTeamFlow);
  $("transfer-add").addEventListener("click", addTransferFlow);
  $("credit-add").addEventListener("click", () => {
    state.model.addCredit();
    afterEdit({ list: false });
  });

  $("picker-search").addEventListener("input", (e) => renderPicker(e.target.value));
  $("picker-cancel").addEventListener("click", closePicker);
  $("picker").addEventListener("click", (e) => {
    if (e.target === $("picker")) closePicker();
  });
  document.addEventListener("keydown", (e) => {
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
renderCharacterFilters();
boot();
