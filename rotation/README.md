# Rotation workbench

A standalone editor for `content/rotations.json`, served at `/rotation/`. It is the
Rotation half of `editor/`, split out on 2026-11-17 so a plan can be authored on a
surface built for it instead of inside a 23-tab editor.

It is **an editor, not a reader-facing page**: nothing here is linked from the app, and
it never writes to the host. Plans are loaded from the repo, edited in memory, and
handed back as a download.

```
rotation/
  index.html      the shell — topbar, 01 PLANS rail, 02 PLAN detail, palette, statusbar
  rotation.css    the whole chrome; the plan itself is the shipped `.guide-*` geometry
  app.js          the workbench client (ES module, no build step)
```

No new dependencies and no build step: three static files, opened over HTTP.

## Running it

```powershell
python serve.py
```

Then open <http://localhost:8000/rotation/>. `serve.py` already maps the folder and
sends `Cache-Control: no-store`, so an edited `app.js` is not served from cache. A
plain `python -m http.server 8000` works too; hard-refresh after changes.

`file://` will not work — the page fetches `content/` and `data/`.

## What it shares with `editor/`

It **imports** rather than copies:

- `../editor/model.js` — the `Model`, the rotation helpers, `validate()`, the slot
  types/tags, `ULTIMATE_SKILLS`, `GUIDE_OTHER_CARDS`.
- `../editor/files.js` — `loadAll()`, `downloadFile()`, `WRITABLE` / `READ_ONLY`.
  `loadAll()` already prefixes `../`, which is what makes it work from this folder.

So a change to the rotation data model lands here for free, and the two editors cannot
disagree about a plan's shape. Asset paths are the same `../images/…` the editor uses.

## What it downloads

**Download** collects `Model.validate()` problems that start with `rotations.` and
writes a ZIP containing only `content/rotations.json` — never the other `content/`
files the editor can also edit. Import accepts one plan or an exported bundle, matches
on the plan id, and reports what it added or replaced.

## The surface

- **`01 PLANS`** — search, archetype chips, the plan list (drag to reorder), New and
  Import.
- **`02 PLAN`** — the plan's head: title, archetype, patch, and the plan editor.
- **`03 IDENTITY`** / **`04 TEAM`** — who the plan is for and the four slots, each a
  character + psychube cell with a portrait segment.
- **`05 ROUNDS`** — the printed plan: rounds, slots, tag plates, brackets and callouts
  drawn with the app's own `.guide-*` rules, so what you see is what the site shows.
- **The palette** (floating, draggable and resizable; `AP` / `Cards` / `Extra`) arms a
  card; clicking a drop gap or a slot inserts it. The frame is remembered in
  `localStorage["rotation.cardPanel.v1"]`.

Notes are multilingual (`EN` / `VI` / `CN`) and only collapse to a plain string when
nothing but English exists. Callouts pack into lanes and a note that spans several
rounds gets a spine in the round-note rail.

## Styling

Black, as dark as the owner asked: the ground is `#000000`, panels sit two to five
levels above it (`--panel`, `--panel-2`, `--panel-3`, `--plate`), and elevation is
carried by those panels plus hairlines and contact shadows — never by glow or a large
soft gradient, which reads as haze on pure black. The gold `--signal` is the only
accent and appears as microtype (`--signal-ink`), numbered heads and selection, not as
fill.

Legacy editor tokens (`--gold`, `--border`, `--text`, `--text-muted`, …) are shimmed
onto the new palette so the ported `.guide-*` geometry needed no rewrite. Keep it that
way: restyle the chrome in `rotation.css`, not the plan rules that mirror the app.

Type is `JetBrains Mono` for the instrument, `Noto Sans TC` for CJK, and the local
`Regular` serif (from `images/regular-webfont.woff2`) for plan titles.

## Responsive

- ≥1181px: rail + plan side by side, palette floating at the right.
- ≤1180 / ≤860: the rail narrows (280 → 244px), source label drops, plan head wraps.
- ≤720: one column. The rail becomes a horizontal strip of 232px plan cards, the top
  nav takes its own row, the palette docks to the bottom (46vh), and the statusbar
  sticks to the bottom of the viewport. No sideways scroll.
- ≤460: cards step down to 72px (108px for ultimates).

## Gotchas

- `requestAnimationFrame` never fires in a hidden tab, so every measurement (tag
  plates, bracket lanes, round-note spines) runs through `afterLayout()`, which is a
  guarded `requestAnimationFrame` pair with a `setTimeout(…, 120)` fallback.
- The slot model is `{ type, tags[], tagText?, text?, cards[] }` with
  `type` in `normal` / `or` / `double_or` / `or3` / `lb` / `text` / `tuning`.
  `GUIDE_SLOT_TYPES` has no `or3` even though `guideSlotLayout()` can return it;
  `SLOT_LABELS` in `app.js` covers it.
- An ultimate is skill 3 except for `ULTIMATE_SKILLS` (`Rhiannon: 4`, `Brume: 4`,
  `Kassandra: 5`).
- Tags draw on a slot's first card: `ap-free` is a corner badge, `precast` / `custom`
  are plaques, and `fitGuideTagPlates()` shrinks a plate to fit (floor 6px).
