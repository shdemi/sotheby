# AGENTS.md

Instructions for AI agents (and humans) working on **Sotheby's Mansion**.
Read this file first. It supersedes the old `README.md` (deleted 2026-11-06).

Owner language: Vietnamese. Codebase language: English. UI locales: `en`, `cn`, `vi`.

---

## 0. What this project is

A static resource hub for the game *Reverse: 1999*, in the shape of **uma.moe**:
a landing page that links to independent branches.

Target branches:

| Branch | Route (planned) | Status |
|---|---|---|
| Suitcase (mainboard + settings) | `#/suitcase` | exists today, as the single page |
| Team Building | `#/teams` | exists today, as a modal |
| Rotations | `#/rotations` | exists today, as a modal |
| InfoBook | `#/infobook` | exists today, as a modal |
| Stages | `#/stages` | data generated, UI missing |
| Timeline | `#/timeline` | no data yet |

Today the whole site is **one page with 23 modals** (`index.html` + `app.js`, ~13,960 lines).
The rebuild splits that into a hub + routes. See §7 (phases).

---

## 1. Non-negotiables

1. **`data/` is machine-generated. Never hand-edit it.** If a value is wrong, fix the
   generator in `scripts/sync/`, then re-run it.
2. **`content/` is human-authored** (build guides, rotations, team archetypes, UI strings,
   translations). This is the only place a human edits data by hand.
3. **Only two data sources are allowed:**
   - `githubfetch/St-Pavlov-Foundation/re1999-data-global-main` (global server)
   - `githubfetch/St-Pavlov-Foundation/re1999-data-main` (CN server)
   Images come from a third source, assets only:
   - `githubfetch/Myssal/Reverse-1999-CN-Asset`
4. **No Kornblume.** It was a third-party data + image source; it is being removed.
5. **No hand-numbered IDs.** Every object keyed by an id must use the **game id** from
   St-Pavlov (see §5 for the psychube re-key).
6. **Never scan the big folders** (`githubfetch/**`, `ignore/**`, `images/**` recursively in
   bulk). A single recursive read can blow up context. Query specific tables.
7. **`sources`/raw checkouts are not committed.** See §2.
8. Do not delete `content/` material because it "isn't in the game data" — it is editorial
   by design.

---

## 2. Local source checkouts (not committed)

These live under `githubfetch/` locally and are git-ignored. Do not commit them.
Do not assume CI has them; CI must clone/download them itself.

```
githubfetch/
  St-Pavlov-Foundation/
    re1999-data-global-main/     # global server tables + languages
      data/json/*.json           # 1,846 tables
      data/configs/language/*.json   # en, zh, tw, jp, kr, de, fr, thai, server_*
      data/lua/**, data/meta.json
    re1999-data-main/            # CN server tables (content ahead of global)
      data/json/*.json           # 2,008 tables
      data/configs/language/*.json   # ALL EMPTY (2 bytes) -- do not read text from here
      data/meta.json
  Myssal/
    Reverse-1999-CN-Asset/       # IMAGES ONLY (no game data tables)
      singlebg/**                # icons, backgrounds, item art
      roles/**, live2d/**        # character art
      mappings/ArcanistMap.json  # aggregated character + skin mapping
      mappings/GeneralMap.json
      mappings/StorySpriteMap.json
```

Version stamps (from `data/meta.json`):

- global: `111.0.1050`
- CN: `113.0.1391`

**Rule:** numbers/tables come from St-Pavlov (global and/or CN). Text comes from
**global's** `language_*.json` even for CN-only content, because the CN repo has no text.
Images come from Myssal only.

Anything CN-only (present in CN, absent in global) is what the app calls **Future Sight**.

---

## 3. Data provenance map

Three classes. Class C is not "data" in the pipeline sense — it is content.

### Class A — fully derivable from St-Pavlov (no manual input)

| Output | Source table(s) | Notes |
|---|---|---|
| `characters_by_rarity.json` | `character.json → rare` | 134 global / 140 CN |
| `characters_by_afflatus.json` | `character.json → career` | see caveat below |
| `character_profiles.json` | `character.json → dmgType`, `character_battle_tag.json` | `dmgType`: 1=Reality, 2=Mental; `battleTag` is `101#117#122` → needs a role map |
| `character_skills.json` | `skill.json`, `skill_effect.json`, `skill_passive_level.json`, `skill_ex_level.json` + global `language_*` | |
| `characters_mats_required.json` | `character_rank.json`, `character_rank_replace.json`, `talent_style.json`, `talent_style_cost.json`, `resonance.json`, `item.json` | |
| `items.json` | `item.json` + global `language_*` | 782 raw items; app shows a curated subset |
| `item_formulas.json` | `formula.json` (`costMaterial`, `produce`) | |
| `psychube_id.json` | `equip.json` | key = `equip.id` (see §5) |
| `psychubes_data.json` | `equip.json` + global `language_*` (and equip effect tables, to verify) | |
| `character_euphorias.json` | `character_destiny.json`, `character_destiny_slots.json`, `character_destiny_facets*.json` + global `language_*` | 42 trees; there is **no table named "euphoria"** — `destiny` is the internal name |
| `euphoria_list.json` | same as above (tier 1/2 names) | |
| `skill_glossary.json` | skill/buff effect tables + global `language_*` | |
| `name_map.json` | `character.json` + `language_en.json` + `language_zh.json` | EN↔CN name pairs |
| `global_name_transfer.json` | join global↔CN `character.json` on `id` | maps raw CN name → canonical EN name |
| `future_sight.json` | `diff(CN, global)` on characters, equips, skins, destiny | **verified**: 6 chars + 7 psychubes |
| `stages/*.json` | `chapter.json`, `episode.json`, `battle.json`, `monster*.json`, `tower_permanent_episode.json`, `activity128_*.json` (CN) | already produced by `scripts/build_stages_data.mjs` |

`characters_by_afflatus` caveat: `career` is the primary afflatus key
(3=Plant, 4=Beast, 5=Spirit, 6=Intellect, 101=hybrid `Mineral_Star`), but current
hand data disagrees for ~2 entries (`Necrologist`, `The Fool`) and `career` 1/2 mix
Mineral/Spirit and Star/Spirit. **Maintain an explicit override list in
`scripts/sync/maps/afflatus.json` and verify those entries.**

### Class B — derivable but needs a small hand-written mapping table

Keep these maps in `scripts/sync/maps/`.

| Output | Needs |
|---|---|
| `character_profiles.roleTags` | `battleTag` id → label (`101`, `117`, `122`, …) → "DPS"/"Support"/"Heal" (EN + CN + VI) |
| `characters_by_afflatus` | afflatus overrides (§above) |
| `exclude_character.json` | exclusion policy (currently `["Schneider"]`) |
| `collab_character.json` | collab detection rule (`heroType` / tag / id range) |
| `pattern_costs.json` | pattern → cost mapping (currently ships `{}`) |
| `character_reso_shape.json` / `shape_patterns.json` | shape ↔ pattern list mapping from `resonance.json` |

### Class C — human-authored content (NOT derivable)

Owned by the project, not the game. Lives in `content/` after the rebuild.

| File | What it is |
|---|---|
| `guide_builds.json` | community build recommendations |
| `guide_rotations.json` | skill rotation plans |
| `guide_skills.json` | skill icon/variant mapping |
| `characters_progressions.json` | progression charts |
| `team_archetypes.json` | team presets |
| `i18n.json` | UI strings + VI translations |
| `credits.json` | acknowledgements |
| `exclude_character.json`, `collab_character.json` | curation policy (§Class B, hand-decided) |

Two current files are **orphans and can be dropped**:
`guide_cards.json` (never fetched by the app) and `reso_shape.json`
(byte-identical duplicate of `shape_patterns.json`).

---

## 4. Asset mapping (Myssal repo)

Verified paths inside `githubfetch/Myssal/Reverse-1999-CN-Asset/`:

| Kind | Path | Key |
|---|---|---|
| Psychube icon | `singlebg/equipment/icon/<equip.id>.png` | game id from `equip.json` |
| Psychube suit/bg | `singlebg/equipment/suit/<equip.id>.png` | game id |
| Psychube default fallback | `singlebg/equip_defaulticon/<equip.icon>.png` | `equip.icon` |
| Item / material | `singlebg/propitem/prop/<item.id>.png` | game id from `item.json` |
| Currency item | `singlebg/currencyitem/<id>.png` | |
| Character head (small) | `singlebg/headicon_small/<skinId>.png` | `skinId` (default = `<charId>01`) |
| Monster head | `singlebg/headicon_monster/<id>.png` | |
| Character signature | `singlebg/signature/<charId>.png` | |

IDs collide across folders (e.g. `620101.png` exists as item, monster and head icon), so
**always namespace by category folder** when caching.

**Still to verify (TBD):** skill card icons, insight icons, afflatus/dmg-type icons,
trait/tuning icons. Some live in `atlassrc/ui_*` as sprite atlases; others may not exist
as standalone PNGs.

`data/ArcanistMap.json` is currently a copy of
`mappings/ArcanistMap.json` from the Myssal repo (same 139 ids/keys). Prefer
re-deriving it from St-Pavlov `character.json` + `skin.json` + `language_*` so that
game data and images have separate sources.

---

## 5. Psychube re-key migration (id → game id)

The old pipeline (`ignore/testCodeChube/compose.py`) composed icons by hand and
**invented sequential ids** (e.g. `6:73`), storing the real id separately as `gameId`.
That is going away.

New rule: **the psychube key is `"<rare>:<equip.id>"` using the game id.** For example the
chube currently stored as `"6:73"` becomes `"6:1579"` (its real id is `1579`; rarity comes
from `equip.rare`).

Facts to preserve during migration:

- `equip.json` (global) has 128 rows; `name_en` is populated on all of them.
- Display name: EN = `equip.name_en`; CN = `language_zh[equip.name]`.
- Icon: `singlebg/equipment/icon/<equip.id>.png`.
- Old `data/psychubes_data.json` has 116 entries; **109 match `equip.json` by `gameId`**.
  The 7 that do not (`1450`, `1451`, `1575`, `1576`, `1577`, `1578`, `1579`) are exactly
  the CN-only psychubes → they belong in `future_sight.Psychube`.
- Rarity 6/5 grouping comes from `equip.rare`; keep the "newest id first" ordering the app
  assumes.
- IDs `999` and `10002` exist in `equip.json` but may not be real psychubes — filter.

When migrating, user saves in `localStorage` (`r1999_psychube_v1`) are keyed by the old
`"<rarity>:<oldId>"`. A one-time migration map must translate old key → game id, or the
key scheme change will silently drop every existing user's psychube collection.

---

## 6. Target repo layout

```
/
  index.html                 shell (header/footer + route outlet)
  AGENTS.md                  this file
  styles/
    base.css                 tokens, reset, header, footer, background
    hub.css  suitcase.css  teams.css  rotations.css
    infobook.css  stages.css  timeline.css
  src/
    main.js                  bootstrap
    router.js                hash router (#/suitcase, #/teams, …)
    core/
      store.js               pub/sub + localStorage helpers (r1999_*)
      i18n.js                t(), language switching without reload
      dom.js                 el(), qs(), modal, tooltip primitives
      format.js
    data/
      manifest.js            SINGLE list of every dataset (see below)
      loader.js              fetch + cache + lazy + explicit errors
      normalize/             characters.js psychubes.js items.js guide.js stages.js
    routes/
      hub/ suitcase/ teams/ rotations/ infobook/ stages/ timeline/
  data/                      GENERATED  (committed, never hand-edited)
    _meta.json               { globalVersion, cnVersion, generatedAt, sources[] }
  content/                   HAND-AUTHORED (class C)
    builds.json rotations.json teams.json progressions.json
    i18n/ exclude.json collab.json credits.json
  scripts/
    sync/
      adapters/global.js  adapters/cn.js
      derive/*.js
      maps/*.json          hand-written mappings (class B)
      index.mjs            run the whole pipeline
    build_stages_data.mjs  (existing, fold into sync/)
  editor/                    JSON editor (keep working; update to new paths)
  images/                    asset cache (generated from Myssal)
```

**`src/data/manifest.js` is the single place to answer "what is this file and who uses it".**
Each entry declares: `file`, `shape`, `scope` (`core` | `lazy`), `routes[]`, `normalize`,
and `source` (which repo/table). Routes declare needs; the loader loads only those.
Nothing else may call `fetch()` on `data/`.

---

## 7. Phases

Ordered. Each phase must leave the site working (old code stays until Phase 6).
Do work on a branch, e.g. `rebuild-core`; keep `main` deployable.

### Phase 0 — Freeze & document (done)
- Deleted the outdated `README.md`.
- This `AGENTS.md` is the onboarding document.

### Phase 1 — Data pipeline foundation
- Create `scripts/sync/` with global + CN adapters and `index.mjs`.
- Emit `data/_meta.json`.
- Pilot three generators and prove them against verified numbers:
  1. `future_sight.json` → expect 6 CN-only characters, 7 CN-only psychubes.
  2. `psychube_id.json` → expect 128 equips, keyed by game id.
  3. `characters_by_rarity.json` + `characters_by_afflatus.json` → 134 global characters.
- Acceptance: generated files are structurally identical to today's, except psychube ids.

### Phase 2 — Full data generation
- Implement the rest of Class A, then Class B with `scripts/sync/maps/`.
- Move Class C into `content/` and set the editor to read/write `content/` for those.
- Delete orphan files (`guide_cards.json`, `reso_shape.json`).

### Phase 3 — Asset pipeline
- Download only the assets we need from the Myssal repo, keyed by game id, into `images/`.
- Delete `ignore/testCodeChube/compose.py` from the workflow.

### Phase 4 — Frontend shell
- `index.html` = hub with 6 cards + shared header (language switcher, credits).
- `src/router.js` hash router; each route is a placeholder first.
- Verify deep links, back button, and F5 on every route.

### Phase 5 — Port existing features, route by route
- Suitcase first (board, edit modal, options, styling, tiers, roster/chube managers,
  JSON import/export, PNG export), then Teams, Rotations, InfoBook.
- Move logic out of `app.js`; keep the old file intact until every branch is ported.

### Phase 6 — Stages
- Data exists in `data/stages/`. `events.json` is ~18 MB and **must not** be one fetch:
  split into `data/stages/<mode>/index.json` + per-chapter files, load lazily.
- Drop the three orphan stage files with no generator (`main_story.json`, `resources.json`,
  `events.json` as-is) — regenerate them properly or remove.

### Phase 7 — Timeline
- New `data/timeline.json`: `[{ version, date, characters[], psychubes[], banners[], notes:{en,cn,vi} }]`.
- Seed from `psychube_id.releasePatch` / `equip` data and CN-only detection (`future_sight`).

### Phase 8 — Hosting migration
- Move from GitHub Pages to **Netlify** or **Vercel** (owner approved).
- Needed for clean paths (`/suitcase`), redirects, and serverless functions.

### Phase 9 — Accounts & public profiles
- Start with **share links** (no account): compress roster into a URL, or upload a snapshot
  and get a short id. Store a `dataVersion` with each snapshot.
- Later: Discord OAuth + `sothebymansion.com/u/<handle>`, opt-in public, per-field
  visibility, delete button. See §8.

---

## 8. Hosting & accounts notes

- Discord OAuth2 cannot be done from a static page: the token exchange needs a
  `client_secret`, so it requires a backend/serverless function.
- Clean `/u/<handle>` URLs require host rewrites — another reason for Phase 8.
- Public rosters are sensitive (they reveal spending). Default **private**, opt-in public,
  allow hiding sections (roster / psychubes / teams), support deletion.
- Use the immutable Discord user id as the primary key; treat the handle as a mutable
  unique name for the URL.
- **Shared rosters must store the `dataVersion`** so old links still render after a game
  update. This ties the data pipeline (`data/_meta.json`) to the accounts feature.

---

## 9. Commands

```powershell
# Serve the site (fetch() needs HTTP, not file://)
python serve.py
# or
python -m http.server 8000

# Editor + regression tests (see package.json)
npm test

# Data pipeline (after Phase 1)
node scripts/sync/index.mjs

# Stages data (existing)
node scripts/build_stages_data.mjs
```

- Must be served over HTTP; `file://` breaks `fetch()`.
- All user state is in `localStorage` under `r1999_*`. Preserve schema compatibility.

---

## 10. Open questions to verify with the owner

1. **Stage file set:** which of `story` / `main_story` and `resource` / `resources` and
   `events` is authoritative? Three of them have no generator. Confirm before Phase 6.
2. **Missing asset folders:** confirm paths for skill card icons, insight icons, and
   afflatus/dmg-type icons inside the Myssal repo (could not verify from the data checkout).
3. **`guide_skills.json`:** confirm it is hand-authored, not generated.
4. **`pattern_costs.json`:** currently `{}` — should it stay empty or be generated?
5. **`exclude_character` / `collab_character`:** keep as hand-curated policy (class C), confirm.
6. **Old psychube localStorage migration:** confirm we must migrate existing users' saved
   chube keys to game ids.

---

## 11. Legacy being replaced

- `app.js` (repo root, ~13,960 lines): the current single-page app with all 23 modals.
  Keep it working until Phase 6, then remove.
- `styles.css` (~283 KB): split into `styles/base.css` + per-route files.
- Root `README.md`: deleted 2026-11-06 (out of date: claimed "14 JSON files", documented
  only 14 of the 30 shipped files).
- `editor/`: keep. It reads/writes data over HTTP and exports a ZIP; after the rebuild it
  must point at `content/` for hand-authored files and stop offering generated files.
