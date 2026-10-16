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
import { Model, FILES, READ_ONLY_FILES, RARITIES, AFFLATUSES, SHAPES, PSYCHUBE_TAGS, PSYCHUBE_RARITIES, validate, readNameTables, diffHunks } from "./model.js";
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
  filters: { rarity: null, afflatus: null, flags: new Set() },
  chubeRarities: new Set(PSYCHUBE_RARITIES),
  picker: null,
  drag: null,
  import: { art: null, frame: null, frames: [], rarity: "6", id: "", name: "", nameCN: "", tags: [], releasePatch: "", futureSight: false, open: false },
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
  }
  if (detail) {
    if (state.tab === "characters") renderCharacterDetail();
    if (state.tab === "psychubes") renderPsychubeDetail();
    if (state.tab === "teams") renderTeamDetail();
  }
  if (state.tab === "patterns") renderPatterns();
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
function renderFileTouchCard(name) {
  const model = state.model;
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
      state.drag = { name, index };
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
      if (!state.drag || state.drag.name === name) return;
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
      if (!drag || drag.name === name) return;
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

      /* substitutes */
      const subs = member.substitutes || [];
      if (subs.length) {
        const subHost = el("div", { class: "subs" });
        subs.forEach((sub, subi) => {
          const subName = typeof sub === "string" ? sub : sub.character;
          const subPsychube = typeof sub === "string" ? "" : sub.psychube || "";
          const subEuphoria = typeof sub === "string" ? "" : String(sub.euphoria || "").replace(/^e/i, "");
          const subKey = `${slotKey}-sub${subi}`;

          subHost.appendChild(
            el("div", { class: "sub-editor" }, [
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
                class: "btn btn-sm btn-ghost",
                text: "×",
                title: "Remove substitute",
                onclick: () => {
                  model.removeSubstitute(archetype, vi, si, subi);
                  afterEdit({ list: false });
                },
              }),
            ])
          );
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

  $("char-search").addEventListener("input", renderCharacterList);
  $("chube-search").addEventListener("input", renderPsychubeList);
  $("team-search").addEventListener("input", renderTeamList);

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

  $("picker-search").addEventListener("input", (e) => renderPicker(e.target.value));
  $("picker-cancel").addEventListener("click", closePicker);
  $("picker").addEventListener("click", (e) => {
    if (e.target === $("picker")) closePicker();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.picker) closePicker();
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
