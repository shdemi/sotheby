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
| `character_skills.json` | `character.json`, `character_rank_replace.json`, `skill.json`, `skill_effect.json`, `skill_passive_level.json`, `skill_ex_level.json`, `fight_device.json` + global `language_*` | **derived**: 138 characters; device heroes take stances/specials from `fight_device`; CN-only English + all Vietnamese live in `content/translations/skills.json` |
| `characters_mats_required.json` | `character_rank.json`, `character_talent.json`, `item.json` + global `language_*` | **mixed**: `insight`/`resonance` derived; `stats`/`euphoria`/`mastery`/`frequency` come from `content/progression_costs.json` |
| `items.json` | `item.json` (`isShow === 1`), `currency.json`, `item_use.json` (category) + global `language_*` | **derived**: 526 entries keyed by game id; `subType` → category label; Vietnamese + the editorial `source` live in `content/translations/items.json` |
| `item_formulas.json` | `formula.json` (`produce`, `costMaterial`, `costScore`) | key = produced item id; inputs are `costMaterial` + `costScore` |
| `psychube_id.json` | `equip.json` | key = `equip.id` (see §5) |
| `psychubes_data.json` | `equip.json` + global `language_*` (and equip effect tables, to verify) | |
| `character_euphorias.json` | `character_destiny.json`, `character_destiny_facets.json`, `character_destiny_facets_consume.json`, `destiny_facets_ex_level.json` + global `language_*` | **derived**: 46 characters / 55 trees; there is no table named "euphoria" — `destiny` is the internal name. CN-only trees are included (union of both servers); their English lives in `content/translations/euphorias.json` |
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
| `character_skills.json` | `skill-extras.json` (Rhiannon's Bendith/Feast Call, Beryl's three emanations) and `device-ranks.json` (frozen rank-id lists for The Twins) |

### Class C — human-authored content (NOT derivable)

Owned by the project, not the game. Lives in `content/` after the rebuild.

| File | What it is |
|---|---|
| `builds.json` | community build recommendations |
| `rotations.json` | skill rotation plans |
| `guide_skills.json` | skill icon/variant mapping |
| `progressions.json` | progression charts |
| `progression_costs.json` | the hand-authored half of `characters_mats_required.json`: `stats` (level bands), `euphoria`, `mastery`, `frequency` (seeded by `scripts/sync/tools/extract-progression.mjs`) |
| `teams.json` | team presets |
| `i18n.json` | UI strings + VI translations |
| `credits.json` | acknowledgements |
| `skill_glossary.json` | InfoBook glossary terms (editorial tags + popover text) |
| `curation.json` | exclude/collab policy; the pipeline still emits `data/exclude_character.json` and `data/collab_character.json` from it |
| `translations/psychubes.json` | English for CN-only psychubes + every Vietnamese psychube/amplification string |
| `translations/euphorias.json` | English for CN-only Euphoria trees + the editorial `version` of each tree |
| `translations/skills.json` | English for CN-only skills/insights/portrays + every Vietnamese skill string + the collab weapon charts |
| `translations/items.json` | every Vietnamese item string (description/usage/source) + the editorial `source` prose + English for CN-only items |

`guide_cards.json`, `reso_shape.json` and `pattern_costs.json` were dropped on
2026-11-06 (never fetched, byte-identical duplicate, and unused respectively).

`euphoria_list.json` was dropped on 2026-11-06: it stored stale effect tags
(“General”, “Pursuit”) instead of the trees' real names, which
`character_euphorias.json` now carries in all five languages.

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
| Skill card art | `singlebg/fight/**` | skill id |

IDs collide across folders (e.g. `620101.png` exists as item, monster and head icon), so
**always namespace by category folder** when caching.

Insight, afflatus and damage-type icons are static UI art; the pipeline ignores them.
Trait/tuning icons are still unverified.

`data/ArcanistMap.json` is currently a copy of
`mappings/ArcanistMap.json` from the Myssal repo (same 139 ids/keys). Prefer
re-deriving it from St-Pavlov `character.json` + `skin.json` + `language_*` so that
game data and images have separate sources.

`scripts/sync/assets.mjs` owns the cache (`npm run sync:assets`, `--check` to
report). It copies four groups, each keyed by game id and each driven by a
generated `data/` file (skills by `content/guide_skills.json`) so only showable
art is downloaded:

| Group | Needed | Source | Local path |
|---|---|---|---|
| Items + currencies | 526 (8 without art) | `propitem/prop/`, `currencyitem/` | `images/items/icon/<id>.png` |
| Psychubes | 116 | `equipment/icon/` | `images/psychube_icon/<rarity>/<id>.png` |
| Character heads | 422 (2 without art) | `headicon_small/` | `images/headicon_small/<skinId>.png` |
| Skill cards | 453 (4 without art) | `fight/skill/` | `images/skills/<name>.png` |

The 2 heads Myssal never shipped are `302902` (a Schneider skin; Schneider is
excluded anyway) and `999801` (the dummy `Machine D III`). The 4 skill icons
Myssal never shipped are Beryl's three crystal variants and `31460151`; they are
editorial entries in `guide_skills.json` and stay as committed. Signature art is
not copied: nothing in the app reads it.

---

## 5. Psychube re-key migration (id → game id) — DONE

The old pipeline (`ignore/testCodeChube/compose.py`) composed icons by hand and
**invented sequential ids** (e.g. `6:73`), storing the real id separately as `gameId`.
That is retired.

Rule: **the psychube key is `"<appRarity>:<equip.id>"` using the game id**, where
`appRarity = equip.rare + 1`. The chube once stored as `"6:73"` is now `"6:1579"`.

Facts preserved during the migration:

- `equip.json` (global) has 128 rows; `name_en` is populated on all of them.
- Display name: EN = `equip.name_en`; CN = `language_zh[equip.name]`.
- Icon: `singlebg/equipment/icon/<equip.id>.png`.
- Old `data/psychubes_data.json` has 116 entries; **109 match `equip.json` by `gameId`**.
  The 7 that do not (`1450`, `1451`, `1575`, `1576`, `1577`, `1578`, `1579`) are exactly
  the CN-only psychubes → they belong in `future_sight.Psychube`.
- Rarity 6/5 grouping comes from `equip.rare`; keep the "newest id first" ordering the app
  assumes.
- IDs `999` and `10002` exist in `equip.json` but may not be real psychubes — filter.

Because user saves in `localStorage` (`r1999_psychube_v1`) were keyed by the old
`"<rarity>:<oldId>"`, the scheme change would silently drop every existing collection.
`scripts/sync/legacy/psychube-migration.json` freezes what git held at the switch, and
`data/psychube_key_map.json` ships it to the app. `app.js` calls `migratePsychubeKeys()`
before sanitising state, and merges duplicate targets with `mergePsychubeState()`.
`scripts/sync/tools/migrate-psychubes-legacy.mjs` performed the one-time data + icon rename.

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
    global_name_transfer.json  name_map.json
    characters_by_rarity.json  characters_by_afflatus.json
    psychube_id.json  psychube_key_map.json  future_sight.json
    characters_mats_required.json  items.json  item_formulas.json
    psychubes_data.json      (legacy detail; re-derive in Phase 2)
  content/                   HAND-AUTHORED (class C)
    builds.json rotations.json teams.json progressions.json
    guide_skills.json skill_glossary.json progression_costs.json
    i18n.json curation.json credits.json translations/
  scripts/
    sync/
      config.mjs  util.mjs  sources.mjs
      derive/names.mjs  derive/characters.mjs
      derive/psychubes.mjs  derive/futureSight.mjs
      maps/*.json            hand-written mappings (class B)
      legacy/                frozen migration inputs (do not regenerate)
      tools/                 one-time migration scripts
      index.mjs              run the whole pipeline
      verify.mjs             assert the generated invariants
    build_stages_data.mjs    (existing, fold into sync/)
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

# Data pipeline (Phase 1)
npm run sync          # writes every generated file under data/
npm run sync:verify   # asserts the invariants (rarity, psychubes, future sight, items)
npm run sync:assets   # copies item artwork from Myssal into images/items/icon/

# Stages data (existing)
node scripts/build_stages_data.mjs
```

- Must be served over HTTP; `file://` breaks `fetch()`.
- All user state is in `localStorage` under `r1999_*`. Preserve schema compatibility.

---

## 10. Resolved questions & Phase 1 facts

These were open questions; answers are settled as of Phase 1 (2026-11-06).

1. **Stage file set:** deferred. Stage data is unfinished game content and the owner
   does not know what to keep yet. Do **not** generate or delete stage files until Phase 6
   is scheduled.
2. **Missing asset folders:** skill-card art lives under
   `singlebg/fight/` in the Myssal repo. Insight / afflatus / dmg-type icons are static
   UI and are ignored by the pipeline.
3. **`guide_skills.json`:** hand-authored. Its slot numbers and variant art (Beryl's
   crystal icons, stance duplicates for Nautika/The Twins/Rhiannon) are editorial
   choices, not a table lookup; it lives in `content/`.
4. **`pattern_costs.json`:** deleted 2026-11-06 — it was unused.
5. **`exclude_character` / `collab_character`:** hand-curated policy. Both now derive
   from `content/curation.json`.
6. **Old psychube localStorage migration:** yes. `scripts/sync/legacy/psychube-migration.json`
   maps every old key to `<appRarity>:<gameId>`; `app.js` applies it once on load and
   re-saves (`psychubeKeyMapCache` ← `data/psychube_key_map.json`).

### Phase 1 facts worth not re-deriving

- **Rarity is `game.rare + 1`** for both characters and psychubes (a 6★ is `rare: 5`).
  The generator owns this offset (`config.mjs` → `RARITY_OFFSET`); never add 1 by hand.
- **Roster is 138 characters** (was 141). The pipeline drops the dummy `9998`
  (“Machine D III” / `???`) and de-duplicates `aliEn T`, `Joe`.
- **Psychubes are 116** = 109 global real (68 six-star, 41 five-star) + 7 CN-only.
  Two global rows (`5:1448` Growing Pains, `6:1534` Stray Off the Path) exist in
  `psychube_id.json` but not yet in `psychubes_data.json`; the app handles that gracefully.
- **`future_sight` is derived completely.** The old hand file was stale: it listed 11 skins,
  the derived set has 24 (CN-only skins for CN-only arcanists), and Euphoria is now in
  descending hero id. Treat the derived file as correct.
- **`psychube_id.json` no longer carries a `gameId` field** — the id *is* the game id.
- **Data formatting mirrors the editor** (`editor/json-patch.js` `renderValue`):
  arrays of short primitives stay on one line (tag lists), everything else is 2-space
  pretty JSON. `scripts/sync/util.mjs` `writeJson` owns this.
- The pipeline writes `data/_meta.json` with both server versions and `generatedAt`.
  Every generated file is reproducible with `npm run sync`; `npm run sync:verify` asserts
  the invariants above.

### Phase 2 facts worth not re-deriving

- **Euphoria is `destiny`.** `character_destiny` lists 1–2 facet ids per hero (Regulus,
  Centurion, Matilda have two); `character_destiny_facets_consume` carries the display
  name, keyword tags and upgrade cost; `destiny_facets_ex_level` carries the 5 portrait
  tiers for 5 heroes. A character's entries map positionally to E1/E2.
- **Facet lists are the union of global + CN** (CN adds `302502`, `303202`, `304102`).
  55 trees over 46 characters; 6 are CN-only and take their English from
  `content/translations/euphorias.json`.
- **Rank text embeds skill names as `▩N%s`**, where N is 0 insight passive, 1/2 the two
  incantations, 3 the ultimate. `derive/euphorias.mjs` resolves them per language and
  brackets them `[X]` for en/kr, `【X】` for zh/tw/jp. Two heroes need the family-skill
  fallback: `exSkill: 0` falls back to the `<skinId>3<rank>` skill (Nautika), and Nautika's
  `character.skill` ids are from her reworked skin family, so the first `#` id can still
  point at a renamed skill — the generated text is correct, the legacy file was stale.
- **CN-only rows carry literal Chinese instead of `language_*` keys**, so literal text is
  only accepted for `zh`; `tw/jp/kr` fall back to `"N/A"` rather than mislabeling Chinese.
- **`character_skills.json` is keyed by canonical roster name only.** The legacy file also
  stored raw aliases (`Joe`, `Six`, `Thirty-seven`, `Вила`, …) pointing at the same object;
  those were redundant because `resolveCharacterName()` maps them through
  `global_name_transfer.json` first. The CN server's duplicate APPLe row (id `3999`)
  collapses onto the global one (`3028`).
- **The device path is chosen by data, not by hand.** A hero takes its incantations from
  `fight_device` when the device has a `specialPowerSkill` or a multi-part `skill1`/`skill2`
  (Coppélia, Everecho, The Twins). Hedone also has a device but its `character.skill` is
  already the full kit, so it uses the normal path; the device still supplies `cost`.
- **`cost` and `harmonization` are fully derived.** `cost` is the third field of the
  device's `skill1`/`skill2` entries; `harmonization` is the `60292#<n>` behaviour on the
  skill effect, and an ultimate takes its negative value from `uniqueSkill_point`
  (`4#100` → `-100`). `scripts/apply_conduit_cost_harm.mjs` (hardcoded maps) is deleted.
- **The legacy file invented slot-4 "Special" skills** for Regulus, Vila, Argus, Barbara,
  Recoleta, Hissabeth, Ms. Stranger, Hedone, 37 and Huntsworn Lilya (including the bogus
  ids `790001`/`790002`). Those rows are not in any game table and are gone. Only
  game-declared specials remain: device `specialPowerSkill`, plus the hand-mapped
  Rhiannon and Beryl entries in `scripts/sync/maps/skill-extras.json`.
- **The Twins' rank ids are frozen in `scripts/sync/maps/device-ranks.json`.** Their
  `character.skill` and the device's per-tier `skill1`/`skill2` disagree, so the base
  skill id is expanded to its three/five rank variants from that map.
- **Do not strip `<1>`/`<2>`/`<i>` from skill text.** Those are game markers (they tell
  repeated portray lines apart) and the app renders them as HTML. `cleanGame()` mirrors
  the legacy cleaner rather than calling `stripMarkup()` on descriptions.
- **`characters_mats_required.json` is split by provenance.** `insight` comes from
  `character_rank` (rank 2..N → insight 1..N-1) and `resonance` from
  `character_talent` (talent 2..N → resonance N); both merge CN + global and match the
  legacy quantities exactly. `stats`, `euphoria`, `mastery` and `frequency` cannot be
  derived from any table (`character_level` uses cumulative levels and different values),
  so they live in `content/progression.json`, keyed by canonical name. Lower-rarity
  arcanists have four stat bands, not five.
- **Material names are refreshed from `item.json`.** The legacy file carried older
  translations ("Alopecurus Pratensis", "Golden Herb Incense", "Pyroxene Ore"); the
  generated file uses the current global names ("Fox Tail", "Golden Grass Incense",
  "Luminite Ore"). Tier counts and quantities are unchanged.
- **Stale mats rows are dropped.** The legacy file also held `10081:J`, `10067:Ezra
  Theodore` and `9998:Machine D III`; J/Ezra now key on their real ids and the dummy is
  gone. Schneider and Ezra had empty costs and now get theirs from the tables.
- **Class C lives under `content/`.** `builds.json`, `rotations.json`, `teams.json`,
  `progressions.json`, `guide_skills.json`, `skill_glossary.json`,
  `progression_costs.json`, `i18n.json`, `credits.json` and `curation.json` moved out of
  `data/`; `app.js` and the editor read them from there (`editor/files.js` `dirFor()`).
  `guide_cards.json`, `reso_shape.json` and `pattern_costs.json` were deleted.
- **`items.json` is now derived (Phase 3).** Items are the union of `item` rows with
  `isShow === 1`, `currency` rows with a real name, and (when an overlay provides an
  English name) CN-only `item` rows; every key is the game id. `subType` is an
  `item_use` id, so the category label comes from that table and only the Vietnamese
  label plus a few broken game labels live in `scripts/sync/maps/item-categories.json`.
  Families the game never labels (19, 21, 22, 23, 25, 26, 27, 34, 85, 98, 100 —
  wilderness decor, critter food, explore items, …) are skipped rather than dumped into
  an invented bucket. 526 entries, 31 categories, 8 without artwork.
- **`item_formulas.json` is of the Wishing Spring crafting list.** `formula.produce` is
  `type#id#qty`; the inputs are `costMaterial` *and* `costScore` (the latter is the
  Sharpodonty fee, which legacy Kornblume dropped for two recipes). Keys are the produced
  item ids, and only recipes whose output is in `items.json` are kept (40).
- **Artwork is keyed by game id.** `npm run sync:assets` copies
  `singlebg/propitem/prop/<icon|id>.png` (items) and `singlebg/currencyitem/<icon|id>.png`
  (currencies) to `images/items/icon/<id>.png`, `singlebg/equipment/icon/<icon|id>.png` to
  `images/psychube_icon/<rarity>/<id>.png` (116), `singlebg/headicon_small/<skinId>.png`
  to `images/headicon_small/<skinId>.png` (422) and `singlebg/fight/skill/<name>.png` to
  `images/skills/<name>.png` (453, the icons `guide_skills.json` points at). 92 items share
  art through `icon`. The Kornblume `images/items/icon/*.webp` cache is gone. `item.icon` is
  empty when Myssal has no art, and the app skips the `<img>` in that case. Rarity frames
  stay at `images/items/border/<rarity>.webp`.
- **Item names changed with the patches.** The legacy file carried old translations
  (`Rhine Gold`, `Alopecurus Pratensis`, `Key of Reverie`, `Golden Herb Incense`, …); the
  generated file uses the current ones (`Rheingold`, `Fox Tail`, `Key of Thought`,
  `Golden Grass Incense`, …). `content/progression_costs.json` was rewritten to the new
  names by `scripts/sync/tools/extract-item-translations.mjs` so every material still
  resolves to an icon. Item `rarity` is `rare + 1`, same as characters and psychubes.
- **`source` is editorial.** No table carries a readable source, so the probe stays empty
  and the legacy prose ("Pawnshop", "Story", …) lives in
  `content/translations/items.json`. `usage` comes from `useDesc` unless the game has none.

---

## 11. Legacy being replaced

- `app.js` (repo root, ~13,960 lines): the current single-page app with all 23 modals.
  Keep it working until Phase 6, then remove.
- `styles.css` (~283 KB): split into `styles/base.css` + per-route files.
- Root `README.md`: deleted 2026-11-06 (out of date: claimed "14 JSON files", documented
  only 14 of the 30 shipped files).
- `editor/`: keep. It reads/writes data over HTTP and exports a ZIP; after the rebuild it
  must point at `content/` for hand-authored files and stop offering generated files.
