# AGENTS.md

Instructions for AI agents (and humans) working on **Sotheby's Mansion**.
Read this file first. It supersedes the old `README.md` (deleted 2026-11-06).

Owner language: Vietnamese. Codebase language: English. UI locales: `en`, `cn`, `vi`.

---

## 0. What this project is

A static resource hub for the game *Reverse: 1999*: **one page with 23 modals**
(`index.html` + `app.js`, ~13,960 lines) plus three Vercel functions: promo codes (§12),
share cards and share pages (§13).

| Feature | How it ships today |
|---|---|
| Suitcase (mainboard + settings) | the page itself |
| Team Building | modal |
| Rotations | modal |
| InfoBook | modal |
| Planner (event shop) | modal (§14) |
| Stages | data generated in `data/stages/`, UI missing |
| Timeline | no data yet |
| Share card / share page | `/api/og` PNG + `/sim` shell (§13) |

The multi-route rebuild (hub + `#/suitcase`, `#/teams`, …) was **cancelled on 2026-11-09**.
The single page is the shipped design: there is no `src/` layer, no `styles/` split and no
data manifest. Do not start that refactor unless the owner asks for it again.

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
   The Fandom wiki (`reverse1999.fandom.com`, read-only) is the **one** allowed runtime
   source, and only for promotional codes (§12). It never feeds `data/` other than
   `data/promo_codes.json`.
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
- CN: `113.0.1421`

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
| `character_skills.json` | `character.json`, `character_rank_replace.json`, `skill.json`, `skill_effect.json`, `skill_passive_level.json`, `skill_ex_level.json`, `fight_device.json` + global `language_*` | **derived**: 139 characters; device heroes take stances/specials from `fight_device`; CN-only English + all Vietnamese live in `content/translations/skills.json` |
| `characters_mats_required.json` | `character_rank.json`, `character_talent.json`, `item.json` + global `language_*` | **mixed**: `insight`/`resonance` derived; `stats`/`euphoria`/`mastery`/`frequency` come from `content/progression_costs.json` |
| `items.json` | `item.json` (`isShow === 1`), `currency.json`, `item_use.json` (category) + global `language_*` | **derived**: 425 entries keyed by game id; `subType` → category label; Vietnamese + the editorial `source` live in `content/translations/items.json` |
| `item_formulas.json` | `formula.json` (`produce`, `costMaterial`, `costScore`) | key = produced item id; inputs are `costMaterial` + `costScore` |
| `psychube_id.json` | `equip.json` | key = `equip.id` (see §5) |
| `psychubes_data.json` | `equip.json` + global `language_*` (and equip effect tables, to verify) | |
| `character_euphorias.json` | `character_destiny.json`, `character_destiny_facets.json`, `character_destiny_facets_consume.json`, `destiny_facets_ex_level.json` + global `language_*` | **derived**: 47 characters / 57 trees; there is no table named "euphoria" - `destiny` is the internal name. CN-only trees are included (union of both servers); their English lives in `content/translations/euphorias.json` |
| `skill_glossary.json` | skill/buff effect tables + global `language_*` | |
| `name_map.json` | `character.json` + `language_en.json` + `language_zh.json` | EN↔CN name pairs |
| `global_name_transfer.json` | `character.json → nameEng` + the canonical roster name | maps the game's own English label → canonical key whenever they differ |
| `ArcanistMap.json` | `character.json`, `skin.json` (global + CN) + global `language_*` | **derived**: 139 entries / 431 skins, ascending by game id; one entry per canonical name (CN APPLe `3999` folds into `3028`); the dummy `9998` and the Myssal-only URL fields are not emitted (§4) |
| `future_sight.json` | `diff(CN, global)` on characters, equips, skins, destiny | **verified**: 6 CN-only characters + 10 psychubes |
| `code_reward_index.json` | `power_item.json` + `equip.json` (`rare <= 3`) + global `language_*` | **derived**: the reward names the Codes tab cannot resolve through `items.json` (stamina candy, EXP-fodder psychubes like Enlighten II/III). Keyed by lowercased name; art copied to `images/code_items/` |
| `stages/*.json` | `chapter.json`, `episode.json`, `battle.json`, `monster*.json`, `tower_permanent_episode.json`, `activity128_*.json` (CN) | already produced by `scripts/build_stages_data.mjs` |
| `event_shop.json` | `activity107` + `activity` + `language_prefab` + `item`/`currency`/`equip`/`skin`/`character`/`block_package` + global `language_*` | **derived**: the event shops the client ships, with per-slot name/icon/price/cap for the Planner (§14). Patch-invariant: the shop is keyed by `activityId`, the patch by `activityId / 100` |

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
| `character_skills.json` | `skill-extras.json` (Rhiannon's two Bendith cards, Beryl's three emanations, Ms. Stranger's `[A Moth to a Flame]` omni card, Huntsworn Lilya's `Shoot Down`, the four base-kit specials, and 37's / Regulus's Euphoria-gated cards), `skill-badges.json` (card-type overrides), `adaptive.json` (cards whose variants are cast options instead of stance cards: Brume S1, Nautika S2) and `single-rank.json` (heroes whose Conduit incantations ship one rank: The Twins, Hedone) |

### Class C — human-authored content (NOT derivable)

Owned by the project, not the game. Lives in `content/` (moved out of `data/` in Phase 2).

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
| `translations/euphorias.json` | English for CN-only Euphoria trees, the editorial `version` of each tree, and every Vietnamese rank description (`vi.ranks`) |
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

`data/ArcanistMap.json` is generated from St-Pavlov now (see §3). It is the
character/skin identity map the app and the editor read: `character.json` (id, zh
name, `nameEng`, `roleBirthday`) plus `skin.json` (the union of both servers,
global first so its Chinese language keys win over the CN literals). It is sorted
by ascending game id and only carries fields something reads, so the Myssal
mapping file is no longer a data source — only `images/` comes from that repo.

`scripts/sync/assets.mjs` owns the cache (`npm run sync:assets`, `--check` to
report). It copies six groups, each keyed by game id and each driven by a
generated `data/` file (skills by `content/guide_skills.json`) so only showable
art is downloaded:

| Group | Needed | Source | Local path |
|---|---|---|---|
| Items + currencies | 425 | `propitem/prop/`, `currencyitem/` | `images/items/icon/<id>.png` |
| Psychubes | 119 (3 without art) | `equipment/icon/` | `images/psychube_icon/<rarity>/<id>.png` |
| Psychube detail art | 119 | `equip_defaulticon/` (276x228) | `images/equip_defaulticon/<id>.png` |
| Character heads | 431 (8 without art) | `headicon_small/` | `images/headicon_small/<skinId>.png` |
| Skill cards | 456 (7 without art) | `fight/skill/` | `images/skills/<name>.png` |
| Code-reward items | 19 | `propitem/prop/` (power items), `equipment/icon/` (EXP fodder) | `images/code_items/<key>.png` |
| Event shop goods (§14) | 47 | `propitem/prop/`, `currencyitem/`, `equipment/icon/` | `images/items/icon/`, `images/psychube_icon/<rarity>/` |

`images/equip_defaulticon/` is the **detail pane only**: the InfoBook psychube detail
hero (`psychubeDetailArt()` in `app.js`) loads it because it is the wide illustration
the game's own psychube screen shows. The psychube **rail** keeps `p.icon`
(`images/psychube_icon/`), the 180x214 board icon. The folder is flat, keyed by game
id, and refreshed by `npm run sync:assets`; `npm run sync:prune` trims it to the 119
ids `data/psychube_id.json` names.

CN 113.0.1421 landed ahead of the Myssal art sweep (that checkout is already at its
remote HEAD, 2026-09-28), so a few assets had to be added by hand: Perchta's three skill
cards (`31590111/21/31`) and the Euphoria portraits
`images/arcanists/euphoria/3072_2.webp` (Shamane E2) and `3107_1.webp` (Ulrich E1). The
four long-standing skill gaps (Beryl's three crystals and `31460151`) are unrelated.

**Eight head icons were WebP data under a `.png` name** (`305903`, `311304`, `312704`,
`313703`, `313904`, `314404`, `315901`, `315902`). A browser sniffs the bytes, so the app
looked fine; satori trusts the extension, drew nothing and left an **empty portrait box**
on those characters' share cards (Perchta `315901` was the visible one). They are real
PNGs now. `scripts/sync/assets.mjs` copies whatever bytes Myssal ships, so a re-sync can
bring the problem back: `api/_lib/og/assets.mjs` detects the format from the magic number
(PNG/JPEG only — resvg cannot decode WebP) and `npm run sync:verify` asserts that every
`og_index` head icon is a real PNG or JPEG, not merely present.

The oldest head gap is `302902` (a Schneider skin; Schneider is excluded anyway); the
dummy `Machine D III` is gone from the map, so its placeholder head is no longer needed.
The four long-standing skill icons Myssal never shipped are Beryl's three crystal variants
and `31460151`; they are editorial entries in `guide_skills.json` and stay as committed.
Signature art is not copied: nothing in the app reads it.

`scripts/sync/tools/prune-images.mjs` keeps `images/` honest (`npm run sync:prune`,
`--delete` to act). It prunes two things and reports everything else:

- **dead directories** — a folder under `images/` whose path prefix
  (`images/<dir>/`) occurs nowhere in the shipped text. Every image path in the
  codebase names its folder literally and only interpolates the leaf, so such a
  folder cannot be reached. This is what retired `attribute/`, `bossrush/`,
  `fight/`, `headicon_middle/`, `headicon_monster/` and `arcanists/misc/`.
- **stale cache files** — the generated caches (`items`, `psychube_icon`,
  `equip_defaulticon`, `headicon_small`, `skills`, `arcanists/euphoria`,
  `shape_pattern`) are reduced to the set the data names, plus any literal
  reference found in the repo.

It is idempotent (a second run reports zero) and refuses to prune a file that its
own needed set names. `images/dungeon/` is left whole on purpose: `data/stages/*.json`
references it and stage data is unfinished (§10.1), so unused covers stay until
Phase 6. `images/.git/` (a nested checkout) is never touched.

After the first prune `images/` went from 8,251 files / 337.7 MB to 1,801 files /
90.8 MB. `npm run sync:assets --check` reports the same coverage before and after,
which is the invariant: pruning removes only what the data does not name.

---

## 5. Psychube re-key migration (id → game id) — DONE

The old pipeline (`ignore/testCodeChube/compose.py`) composed icons by hand and
**invented sequential ids** (e.g. `6:73`), storing the real id separately as `gameId`.
That is retired.

Rule: **the psychube key is `"<appRarity>:<equip.id>"` using the game id**, where
`appRarity = equip.rare + 1`. The chube once stored as `"6:73"` is now `"6:1579"`.

Facts preserved during the migration:

- `equip.json` (global) has 128 rows; `name_en` is populated on all of them.
- Display name: EN = `language_en[equip.name]`, then `equip.name_en` as the fallback
  (the CN client's `name_en` column is stale for a few rows: `1433` ships as "The
  Unknown Artist" but the global client shows "The Loner"; `1512` "The Carat of A Heart"
  → "The Carat of a Heart"); CN = `language_zh[equip.name]`.
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

## 6. Repo layout

```
/
  index.html                 the app shell (header/footer + all 23 modals)
  app.js                     the whole client app (~13,960 lines)
  styles.css                 all styling (~283 KB, one file)
  rotation-export.js         rotation export helper
  serve.py                   dev server (HTTP, not file://)
  AGENTS.md                  this file
  data/                      GENERATED  (committed, never hand-edited)
    _meta.json               { globalVersion, cnVersion, generatedAt, sources[] }
    global_name_transfer.json  name_map.json
    characters_by_rarity.json  characters_by_afflatus.json
    psychube_id.json  psychube_key_map.json  future_sight.json  code_reward_index.json
    characters_mats_required.json  items.json  item_formulas.json
    psychubes_data.json      detail rows; regenerate with `npm run sync`
    character_skills.json  character_euphorias.json  skill_glossary.json
    ArcanistMap.json  promo_codes.json  og_index.json  stages/*.json
    event_shop.json          the Planner's event shops (§14)
  api/                       Vercel Node functions
    codes.js                 GET /api/codes + edge cache (§12)
    og.js                    GET /api/og PNG share card (§13)
    sim.js                   GET /sim share page shell (§13)
    _lib/wiki.mjs            the one outbound request
    _lib/parse-codes.mjs     pure wikitext parser (unit-tested)
    _lib/og/*.mjs            card renderer (labels, assets, theme, cards, render, resolve)
    _lib/sim/params.mjs      share payload, title/description, cache key (§13)
  assets/og/*.ttf            TTF fonts satori can load (§13, generated once)
  vercel.json .vercelignore  function config + upload exclusions
  content/                   HAND-AUTHORED (class C)
    builds.json rotations.json teams.json progressions.json
    guide_skills.json skill_glossary.json progression_costs.json
    i18n.json curation.json credits.json translations/
  scripts/
    sync/
      config.mjs  util.mjs  sources.mjs
      derive/names.mjs  derive/characters.mjs
      derive/psychubes.mjs  derive/futureSight.mjs
      derive/ogIndex.mjs     the compact lookup the share cards read
      maps/*.json            hand-written mappings (class B)
      legacy/                frozen migration inputs (do not regenerate)
      tools/                 one-time migration scripts
      index.mjs              run the whole pipeline
      verify.mjs             assert the generated invariants
    og/
      fetch-fonts.py         rebuild assets/og/*.ttf (fonttools)
      pattern-icons.py       rebuild assets/og/pattern/*.png (Pillow, 44px)
      render.mjs             render sample cards to .tmp-og/*.png
    build_stages_data.mjs    (existing, fold into sync/)
  editor/                    JSON editor (keep working; reads/writes `content/`)
  images/                    asset cache (generated from Myssal)
```

There is **no** `src/` layer and no data manifest: `app.js` owns its own `fetch()` calls and
cache for `data/*.json`, and `editor/files.js` (`dirFor()`) is what maps a file to
`data/` or `content/` for the editor.

---

## 7. Phases

Ordered. Each phase must leave the site working. Do work on a branch and keep `main`
deployable. Phase numbers are **not** renumbered: the old Phase 4 (frontend shell) and
Phase 5 (port features route by route) were cancelled on 2026-11-09 with the multi-route
rebuild, so the list jumps from 3 to 6.

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

- The site is deployed on **Vercel** (Phase 8 landed early, 2026-11-09). `vercel.json`
  configures the one Node function, `api/codes.js`; `.vercelignore` keeps the raw
  checkouts, test artifacts and `scripts/` out of the upload. `CNAME` is kept for the
  GitHub Pages copy.
- **Web Analytics is the HTML install, not the npm package.** This page has no Next.js
  build step, so `@vercel/analytics/next` cannot resolve; `index.html` instead queues
  through `window.va` and loads `/_vercel/insights/script.js` (deferred, last in
  `<head>`). Vercel serves that file only once Analytics is enabled for the project —
  every other host, including `python serve.py` and GitHub Pages, just 404s it and the
  page carries on. Custom events are `window.va("event", { name: "…" })`.
- **A force-push does not re-point production.** Vercel ties the production alias to the
  deployment it built; rewinding `main` onto a commit it has already built creates no new
  deployment, so the site keeps serving the newer build. Redeploy/promote that commit in
  the dashboard, or push a new commit (any new SHA, even `--allow-empty`) to force a build.
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
npm run sync:assets   # fills the images/ cache from Myssal (items, psychubes, heads, skills)
npm run sync:prune    # reports unreachable art under images/ (--delete to remove)
npm run codes:snapshot  # refreshes data/promo_codes.json from the Fandom wiki

# Share cards (see §13)
python scripts/og/fetch-fonts.py   # rebuild assets/og/*.ttf (needs fonttools)
node scripts/og/render.mjs         # render sample PNGs to .tmp-og/ (no server needed)

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
- **Roster is 139 characters** (was 141). The pipeline drops the dummy `9998`
  (“Machine D III” / `???`), de-duplicates `aliEn T`, `Joe`, and skips CN rows the CN
  client has not released yet (`isOnline: "0"`, placeholder skills and no art — e.g.
  Evelyn `3160`; global rows are exempt because there `isOnline: "0"` just means NPC).
- **Psychubes are 119** = 109 global real (68 six-star, 41 five-star) + 10 CN-only
  (7 six-star, 3 five-star). Two global rows (`5:1448` Growing Pains, `6:1534` Stray
  off the Path) exist in `psychube_id.json` but not yet in `psychubes_data.json`; the
  app handles that gracefully. A CN-ahead chube whose `equip_skill` rows have not
  shipped yet (`6:1581`) gets an empty `amplifications` list.
- **`future_sight` is derived completely.** The old hand file was stale: it listed 11 skins,
  the derived set has 32 (CN-only skins for CN-only arcanists), and Euphoria is now in
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
  57 trees over 47 characters; 8 are CN-only and take their English from
  `content/translations/euphorias.json`. Their `tags` are supplied by that overlay too,
  because the CN `keyword` is literal Chinese (2026-11-08: Ulrich `310701` → `Dynamo`,
  Shamane `307202` → `Shift`).
- **New-mechanic vocabulary (no official EN yet, invented once and reused).** The CN-ahead
  rows lean on two systems the overlays already name: 洞知 is **Perception** (`[Eye of
  Perception]`, `[Perception Incantation]`, `Perception Points`, `Perception Skill Set`,
  `[Perception Ability-N]`, `[Full Pursuit]` for 弱点洞穿) and 脉络 is **Thread**
  (`Thread Points`, `[Thread: Clear Sight]`). Perchta `3159` adds 砍创 **`[Cleave]`**,
  七友人 **`["Seven Friends"]`**, 七友人守护 **`["Seven Friends' Ward"]`**, 圆满结局
  **`[Happy Ending]`**, 复仇线索 **`[Vengeance Clue]`** and 雪恨 **`[Vengeance Sated]`**;
  Shamane's `307202` adds 沃土 **`[Fertile Soil]`**. Replace them if a global build ships
  official wording.
- **Rank text embeds skill names as `▩N%s`**, where N is 0 insight passive, 1/2 the two
  incantations, 3 the ultimate. `derive/euphorias.mjs` resolves them per language and
  brackets them `[X]` for en/kr, `【X】` for zh/tw/jp. Two heroes need the family-skill
  fallback: `exSkill: 0` falls back to the `<skinId>3<rank>` skill (Nautika), and Nautika's
  `character.skill` ids are from her reworked skin family, so the first `#` id can still
  point at a renamed skill — the generated text is correct, the legacy file was stale.
- **CN-only rows carry literal Chinese instead of `language_*` keys**, so literal text is
  only accepted for `zh`; `tw/jp/kr` fall back to `"N/A"` rather than mislabeling Chinese.
- **Vietnamese Euphoria text lives in the same overlay.** `content/translations/euphorias.json`
  carries a `"vi": { "ranks": { "<rank>": "..." } }` block for every one of the 57 trees
  (228 rank rows); `derive/euphorias.mjs` copies it to `description.vi`, so all six
  languages are non-empty and `sync:verify` asserts that. Tree names stay English in VI
  (proper nouns), so there is no `vi` name field. Portraits (25, five tiers on five heroes)
  are not rendered by the app and carry no VI.
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
  The app shows both in the skills detail board only, as label → shape → number:
  Cost is the game's own diamond icon (`images/random_icon/costDiamond.png`, 34×34
  RGBA cropped from the game) and its value always carries the minus the game prints
  (`-0`, `-2`, `-3`) even though the table stores it positive; Harmonization is an
  empty skewed chip (`#fddf7a`) followed by a signed value. Numbers are `#DD3838` for
  Cost and `#60A566` for Harmonization (both signs). Nothing is drawn on the card art
  itself.
- **The legacy file invented slot-4 "Special" skills** for Regulus, Vila, Argus, Barbara,
  Recoleta, Hissabeth, Ms. Stranger, Hedone, 37 and Huntsworn Lilya (some pointing at the
  nonexistent skill ids `790001`/`790002` — `790001` is only 37's card icon). Those rows
  are not in any game table and are gone. Only game-declared specials remain: device
  `specialPowerSkill`, plus the hand-mapped Rhiannon and Beryl entries in
  `scripts/sync/maps/skill-extras.json`.
- **Six of those slot-4 cards were real, and are back through `skill-extras.json`.**
  Ms. Stranger's special card is skill `31470131` — `[A Moth to a Flame]`, the only
  "Sovereign Incantation" (主格特殊咒语) in the game besides Beryl's three emanations —
  and Huntsworn Lilya's is `31550151` (`Shoot Down` / 击毁), her `[Full Pursuit]` pursuit
  skill. Both ids carry `showInBattle: 0` and are absent from `character.skill`, so no
  table walks you to them: the map names them. Four more are base-kit cards the legacy
  file had merely guessed at: Recoleta `31140151` (`Flood of Fiction`), Hissabeth
  `31160101/102/103` (`Hiss!`), Vila `30870191` (`Song of Inspiration`) and Argus
  `30970171/172/173` (`Grave Digger`, the only one that is an "Attack" card). All six
  are `showInBattle: 0` too. A map entry may carry `badge: { en, zh }` to force the
  card-type label the heuristic would get wrong — `attribute` / `attributeZh` in the
  generated row — because `[A Moth to a Flame]` is an omni ("Versatile" / 万能) card
  whose own name says nothing about it. Barbara's legacy "special" is still invented (a
  duplicate of insight 0); Hedone's is real — the device's `specialPowerSkill` gives her the
  Energy card `Flame Undying` (`31560182/183/184`), and by editorial choice only the rank-1
  row ships (`"ranks": [31560182]`), so the app shows a single Energy card instead of three
  star tiers of it.
- **Rhiannon ships no Feast Call card.** `31460181` (`Feast Call` / 祝宴) used to sit in
  `skill-extras.json` as her Conduit special; the owner had it dropped on 2026-11-11, so
  her extras entry now carries only the two `Bendith` cards and the Arcane Skills strip
  reads S1, S2, Ultimate in both stances. The game casts it from the queue, not from a
  card the player picks. Its `4|Feast Call` Vietnamese overlay in
  `content/translations/skills.json` is kept (unused) rather than deleted with the card.
- **Lucy's `Conservation of Energy` is a one-rank card, not a three-rank one.**
  `30860141/142/143` are the same rank-2 ascension incantation at portray 0, 1 and 4
  (100/150/200% Reality DMG — P1 and P4 say exactly that), so
  `skill-extras.json` ships only `30860141`. It is base kit: her Insight III passive casts
  it, and every row carries `showInBattle: 0`, so only the map walks to it. Its card art
  `760001.png` is Lucy's, not an item id.
- **A Perception Incantation card carries ability panels.** 37 `3066`, Perchta `3159` and
  Huntsworn Lilya `3155` sit their passives in separate CN skill rows, so their
  `skill-extras.json` entries name them as `"abilities": [<id>, <id>]`
  (37 `306601521/306601531`, Perchta `31590152/31590153`, Lilya `31550154/31550155`).
  The generator copies them onto the skill row as `panels: [{ label, descEn, descZh,
  descVi }, …]` and adds `perceptionTag` (`Perception Incantation` / `洞知咒语`) plus
  `perceptionCost`, parsed from the base skill's `skill_effect.qtePowerCost` (`"2#N"` → N
  Perception Points; 37 = 1, Perchta = 8, Lilya = 1). The game ships no EN text for these
  CN rows, so EN and VI live in the per-hero overlay under
  `skills["4|Special 1"].abilities["1"|"2"]`. `app.js` renders the card as three equal
  side-by-side panels — the base incantation (with its cost tag) and one panel per
  ability; there is no card-art column and no rank pips. Lilya's rank-1 text is trimmed
  to the incantation line because the cost and her two pursuit abilities moved into the
  panels.
- **Euphoria-gated cards carry `requires`, and the E1/E2 switch is exclusive.** 37's
  `306601511` (`Reductio ad Absurdum` / 归谬) and Regulus's two cards — `228101`
  (`Rock 'n' Roll Forever!` / 摇滚永生！, tree 0) and `31447002`
  (`Carbonation Explosion` / 碳酸释放, tree 1 `Rock 'n' Roar`) — carry
  `"requires": { "euphoria": <tree index>, "rank": N }` (index into that hero's
  `character_euphorias.json` array). Regulus has two facets, so his Conduit card is the
  E2 one: its `rank` is the E-button that reveals it, not the facet level the game uses
  (the device and its `specialPowerSkill` ship with facet level 1). `app.js` hides gated
  cards until a button is pressed and shows only the cards whose `rank` matches the
  active button, never the lower ones. `790001` is a real icon id (37's card art), not
  one of the invented ones.
- **Reinforce is a view switch on the card, not a second card (Lucy).** The game shows
  an incantation in two states, 初始 (Base) and 升华 (Reinforce), and `hero_upgrade_options`
  is the table that says which heroes own the system (only Lucy). `hero_upgrade_breaklevel`
  then maps each base skill id onto its reinforced one (`30860111` → `30861111`), so
  `derive/skills.mjs` attaches `reinforce: { ranks }` to every card of a listed hero (the
  ultimate needs `id` on its row for this). Two filters keep the table's other rows out:
  `hero_upgrade_breaklevel` also carries Rhiannon's Bendith stance (`31460111` → `31460211`,
  already a stance tab) and two parallel copies of Lucy's chain (`30863211` → `30863111`,
  `30865211` → `30865111`) whose source ids are duplicates of the base card. Only the
  chain starting from the card's real id (the `01` family) is the in-game step. `app.js`
  draws a Base / Reinforce bar next to the Euphoria switch (`charSkillsReinforceLevel`,
  0/1, reset per hero), keeps the 4-card strip and the ★ selector, and swaps the
  description of every card that carries a reinforced set. These rows are global, so
  Vietnamese sits in `content/translations/skills.json` under
  `<hero>.reinforce.<slot>.ranks.<n>.descVi`.
- **Cards are emitted slot-ascending (S1, S2, Ultimate, Special).** The build loop walks
  `character.skill` group by group and then appends the hand-mapped `skill-extras` rows, so
  a stance hero would otherwise list its ultimate first and its base S1/S2 last once the
  stance filter drops the other block. `skills.mjs` stable-sorts `entry.skills` by `slot`
  at the end, which keeps each stance's cards in order (`Rhiannon`: S1, S2, Ultimate in
  both Base and Bendith) and moves The Twins' rows to S1 Set A/B, S2 Set A/B
  without changing what either stance shows.
- **A card's type label is a heuristic plus a hand override.** `getSkillBadgeText()` in
  `app.js` guesses from the name and the rank-1 text, and gets it wrong often: it only reads
  the rank-1 wording, so a card whose debuff arrives at ★2 or whose text merely *mentions*
  a status ("[Counter] status", "channeling state") lands in the wrong bucket. The game's own
  `skill_effect.showTag` is the reference (`1`/`2` Attack, `3` Debuff, `4` Buff, `5` Counter,
  `6` Health, `9` Channel, `11` Versatile, `14` Energy — the label is **Health** / 治疗, not
  "Heal"; empty on 107 legacy rows and mixed on
  Blonney S2 / Marcus S2 / Yenisei S1) — it agreed with all 16 badges confirmed against the
  game by hand, so the mismatches were pinned from it. `skill-extras.json` `badge` pins a card
  the map *adds*, and `maps/skill-badges.json` patches one the loop already built (matched on
  slot + sub-slot: 83 cards over 67 heroes, of which 25 pin a single rank, because the game
  relabels a card when a later rank adds an effect — Click's S1 is Attack at ★1 and Debuff
  at ★2). Both copy to `attribute` / `attributeZh`, and `app.js` `getSkillBadgeText()`
  prefers `ranks[rank].attribute` over the card's own. Five
  known "mismatches" are deliberate: Cornerstone S1 and Desert Flannel S1 stay `Counter`,
  Huntsworn Lilya S1 stays `Channel`, and Horropedia S2 / Jessica S2 stay as they are — the
  owner confirmed all five against the game, so `showTag` loses to the eye there.
- **Ultimates carry their own card type in the data.** `derive/skills.mjs` copies
  `skill_effect.showTag` onto every ultimate row as `attribute` / `attributeZh`
  (`config.mjs` → `SKILL_SHOW_TAGS`), so all 139 have a label; where the global row
  leaves the column blank the CN row fills it (Perchta's ultimate). Only ultimates get
  this — every other card keeps the hand-pinned labels above. The strip badge still
  reads `Ultimate` / `至终`; the detail board prints the pair as `Ultimate · Buff`
  (`app.js` `getCardTypeLabel()`, which also returns `""` instead of `S3` when an
  ultimate's text cannot be read).
- **Brume's four "sets" are really three.** `character.skill` spells Calculated Path as
  `…,313501112#313501122,313501132` — the rank-3 row sits in its own comma group. The
  ids step evenly and both groups share a name key, so `mergeSetRanks()` folds that
  trailing single-rank group back into the set it continues; Set D no longer exists.
- **An Adaptive card picks its variant when cast, so it has no stance bar.** Brume's S1
  (`31350111`) and Nautika's S2 (`31200121`) are one card whose text says "choose 1 out of
  [A] and [B]"; the variants (`313501111`/`313501112`, `31200151`/`31200161`) are not
  stances the reader flips between, so `scripts/sync/maps/adaptive.json` names the card and
  its option ids. `derive/skills.mjs` then moves them onto the card as `adaptiveOptions`
  (each keeps its own `ranks`, so every option has its own ★1/★2/★3 rows), drops them from
  the strip and clears the card's `subSlot`. `app.js` renders one panel per option under the
  base text, each with its own art + ★ picker (`charSkillAdaptiveRanks`, keyed by the
  option's ★1 skill id) — which is exactly what the game shows on tap. The card's own type
  label is pinned to `Adaptive` / 自适应 in `maps/skill-badges.json`, and the base line
  loses the redundant "rank N" token via `stripSkillRankMention()` because the picker
  already says it.
- **A device field is a stance, not a slot.** `fight_device.skill1` is the first incantation
  set and `skill2` the second, and each `|` part inside one field is a card of that set
  (slot 1, slot 2, …). That is why The Twins read as "Set A: Atomic Fusion, Polymeric Ray"
  and "Set B: Extreme Overclocking, Balancé Across the Stars" — the pairs are stances, not
  slots. A device with one part per field (Coppélia, Everecho) has no stance at all, so its
  parts stay slot 1 / slot 2. `scripts/sync/maps/device-ranks.json` is gone: it used to
  expand The Twins' ids into ★1/★2/★3 variant rows with numbers the game does not ship.
- **Conduit incantations have exactly one rank.** The Twins' and Hedone's cards are never
  upgraded (their scaling comes from portrays, not from ★), so each card carries only
  `ranks["1"]` and the app draws no ★ selector. The game does ship ★2/★3 rows for both
  heroes, but they repeat the ★1 text verbatim — only the Harmonization number moves
  (The Twins 8→20, Hedone 20→30) — so the list lives in
  `scripts/sync/maps/single-rank.json` and `incantation()` keeps just the first id.
  Their portrays still quote the rank-2/3 numbers because that is what P2/P3 unlock —
  the card itself stays at its base value.
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
  an invented bucket. 425 entries, 31 categories, every one with artwork.
- **`item_formulas.json` is of the Wishing Spring crafting list.** `formula.produce` is
  `type#id#qty`; the inputs are `costMaterial` *and* `costScore` (the latter is the
  Sharpodonty fee, which legacy Kornblume dropped for two recipes). Keys are the produced
  item ids, and only recipes whose output is in `items.json` are kept (40).
- **Artwork is keyed by game id.** `npm run sync:assets` copies
  `singlebg/propitem/prop/<icon|id>.png` (items) and `singlebg/currencyitem/<icon|id>.png`
  (currencies) to `images/items/icon/<id>.png`, `singlebg/equipment/icon/<icon|id>.png` to
  `images/psychube_icon/<rarity>/<id>.png` (116), `singlebg/headicon_small/<skinId>.png`
  to `images/headicon_small/<skinId>.png` (421) and `singlebg/fight/skill/<name>.png` to
  `images/skills/<name>.png` (453, the icons `guide_skills.json` points at). 92 items share
  art through `icon`. The Kornblume `images/items/icon/*.webp` cache is gone. `item.icon` is
  empty when Myssal has no art, and the app skips the `<img>` in that case. Rarity frames
  stay at `images/items/border/<rarity>.webp`.
- **`ArcanistMap.json` is derived too (Phase 3).** The Myssal mapping file is no longer a
  data source. The generator keeps `character.json` rows from both servers, one per
  canonical name (the CN APPLe `3999` folds into global `3028`; the dummy `9998` is
  dropped), and takes each hero's skins from the union of both `skin.json` tables, global
  first. It emits only what the app/editor read — `id`, zh name, `nameEng`,
  `roleBirthday`, and per skin `id`, zh name, `nameEng`, `des`, `characterSkin`,
  `characterSkinNameEng`, `skinDescription`. The Myssal-only `signature`, `spine`,
  `cubism` and `alternateSpine` URLs are not emitted, and the file is sorted by ascending
  game id (138 entries / 423 skins). The game's `nameEng` is newer than the Myssal copy for
  two heroes — `3056` "Changeling"→"Jessica" and `3110` "Liang"→"Liang Yue" — and that is
  what the app now shows (both were already covered by `CANONICAL_NAME_OVERRIDES`).
- **`global_name_transfer.json` now comes from the game.** It maps a character's `nameEng`
  onto the canonical roster key whenever they differ (9 entries: `Six`, `Thirty-seven`,
  `Ezra Theodore`, `Matilda Bouanich`, `Joe`, `aliEn T`, `Авксивий`, `Вила`, `Енисей`).
  The legacy labels the game no longer ships — `Changeling`, `Liang`, `Black Dwarf` — are
  handled by `NAME_ALIASES` in app.js instead, so the editor's "transfer key must be an
  ArcanistMap `nameEng`" check stays clean.
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

## 11. Legacy: what stays

- `app.js` (repo root, ~13,960 lines): the shipped single-page app with all 23 modals.
  It is **not** being replaced — the multi-route rebuild was cancelled 2026-11-09, so
  changes go into this file rather than a new `src/` tree.
- `styles.css` (~283 KB): the shipped stylesheet. It stays one file; do not split it into
  `styles/base.css` + per-route files unless the owner approves a new plan.
- Root `README.md`: deleted 2026-11-06 (out of date: claimed "14 JSON files", documented
  only 14 of the 30 shipped files).
- `editor/`: keep. It reads/writes data over HTTP and exports a ZIP; it points at
  `content/` for hand-authored files and does not offer generated files.

---

## 12. Promotional codes (`/api/codes`)

The InfoBook **Codes** tab (`#builds-tab-codes`) lists only the codes the Fandom page
still marks Active. This is the one feature that reads the internet at runtime.

**Source.** `https://reverse1999.fandom.com/wiki/Promotional_Code` (CC BY-SA), read
through `api.php?action=parse&prop=wikitext|revid&formatversion=2&origin=*`. The shared
fetcher is `api/_lib/wiki.mjs` (browser UA, 8 s timeout, 2 attempts); the pure parser is
`api/_lib/parse-codes.mjs` (no network, unit-tested).

**Parser rules.**

- Only `== Active ==` / `=== Permanent ===` / `=== Current ===` rows are kept; `Expired`
  is ignored and duplicate codes (case-insensitive) are dropped.
- A row is `|CODE<!-- Expires: date -->` followed by `{{Item Box|qty|name|rarity}}`
  templates, which may share a line. Names inside `[[…]]` are unwrapped.
- Expiry comments are hand-written and unreliable (`idk`, `??/??/2026`, `04/11/2026`).
  The parser keeps `{ raw, iso, uncertain }` and only sets `iso` when the date is
  unambiguous (ISO, or a slash date where one part is > 12). **Never hide a code
  because its date cannot be read**; the UI shows "Expiry unknown (idk)" instead.
- Seeing a code here does not prove it still redeems — the wiki lags the game sometimes.

**Function.** `api/codes.js` returns `{ source, title, revid, fetchedAt, stale,
permanent[], current[] }` with `Cache-Control: public, s-maxage=21600,
stale-while-revalidate=86400`. This is the plain-function equivalent of ISR, **not ISR
itself** (ISR is a Next.js feature and does not exist for Vercel Functions): the CDN
serves the cached response for six hours, then serves it stale for a day while it
revalidates. If Fandom is unreachable (Cloudflare can block datacenter IPs) the handler
returns the committed snapshot with `s-maxage=300` and `stale: true`; only when that
file is missing does it return 502.

**Snapshot.** `npm run codes:snapshot` = fetch → parse → `data/promo_codes.json`
(`scripts/codes/snapshot.mjs`), written with `writeJson` and skipped when `revid` and
the rows are unchanged. It exists so `python serve.py` (no functions), the GitHub Pages
copy and the function's error path all have data. Regenerate it instead of editing it.
The app calls `/api/codes` first and falls back to `data/promo_codes.json` on any
failure, so local development needs no Vercel CLI.

**UI.** The tab is a mode tab next to Characters / Psychubes / Glossary
(`#builds-tab-codes`, `renderCodesRail()` + `renderCodesDetail()` in `app.js`). The rail
lists the active codes with an expiry badge; the detail pane shows the code with a Copy
button (`guideCopyText`), its rewards as item stickers (`renderItemStickerHtml`), a
`Permanent` / `Expires …` / `Expiry unknown` badge, and the CC BY-SA source link. The
`data/promo_codes.json` file is added to the function bundle with
`vercel.json → functions["api/codes.js"].includeFiles`.

A reward name is resolved by `getItemByName()` against `data/items.json`; when it misses,
the function falls back to `data/code_reward_index.json` (generated, §3), which covers the
two families that table never holds: `power_item` stamina candy ("Picrasma Candy", "Jar of
Picrasma Candy") and EXP-fodder psychubes ("Enlighten II/III", `equip.rare <= 3`). Their art
is copied to `images/code_items/` by `npm run sync:assets`, and `npm run sync:verify` asserts
every index icon is a real PNG/JPEG and that the four known gaps still resolve.

**Tests.** `editor/_test/codes.test.mjs` runs against
`editor/_test/fixtures/promo-codes.wikitext`; it never touches the network. It covers
section filtering, duplicate handling, reward parsing, every expiry shape and the
snapshot shape.

---

## 13. Share images (`/api/og`) and share pages (`/sim`)

A team build, a character build or a skill rotation can be shared as a link. **Since
2026-11-09 the link preview is deliberately plain**: no generated image, no build summary —
Discord shows the same title + "Suitcase. With information. R1999." snippet as any other
page of the site.
The card renderer is still deployed (and still what `scripts/og/render.mjs` uses for local
previews) but **nothing links to it any more**; re-enabling cards means putting the four
`og:image*` / `twitter:image` tags back in `api/sim.js` and `index.html`.

| Route | What it returns |
|---|---|
| `GET /api/og?…` | 1200-wide PNG (character card, team card, or the brand card; 630 tall, or shorter for a character without a progression chart). Direct hits still work; no page references it |
| `GET /sim?…` | the app shell with `<title>`, the plain description, and `window.__SIM__` |

Link scheme (both routes take the same parameters). The canonical, compact shape stores
**game ids**, so a link is short and never goes stale on a rename:

```
/sim?t=308601-3-60-5-1527,305601-3-60,307901-3-60,307701-3-60&name=FUA&lang=en
/sim?c=308601&lang=vi
/sim?r=huntsman-lilya-w-rhiannon&lang=en
```

- A team member is `<skinId>-<insight>-<level>-<portrait>-<chubeGameId>`; **trailing zero
  fields are omitted**, so `305601-3-60` is a member with no portrait and no psychube.
- `skinId` is `<charId><skinSuffix>` (`01` = the default skin), so it already carries the
  character: `308601` is Lucy's first skin. A bare `charId` (`t=3086`, `c=3086`) is
  accepted and expands to the default skin.
- A psychube is the bare game id (`1527`, not `6:1527`); the id is unique across
  rarities, so `findPsychube()` maps it back to its `<rarity>:<id>` key.
- A rotation is `r=<presetId>` from `content/rotations.json`. The link carries the id,
  not the plan, so updating a preset updates every shared link. The client resolves the
  full rotation from its own copy; an unknown id falls back to the plain brand page.
- Unknown ids are **dropped** (a dropped member takes its psychube with it) so a stale
  link still renders. An empty team slot is skipped entirely rather than kept as a gap.
- `lang` is written by both share buttons so the title/description a crawler caches and the
  page the visitor lands on are the same language; the switcher on the page rewrites it in
  the URL. It stays optional: a hand-written link without it gets `en` tags for crawlers and
  the visitor's saved language on the page (`normalizeSim` reports `langExplicit`).

The **legacy** shape is still parsed, so links already posted keep working:

```
/sim?team=Lucy,Jessica,6,Windsong&chubes=6:1527,6:1504,6:1545,6:1539&name=FUA&lang=en
/sim?character=Lucy&lang=vi
```

- `team` is at most four names; `character` is used when `team` is absent.
- `chubes` is positional: the *n*-th psychube belongs to the *n*-th team member. Names and
  chubes resolve case-insensitively against `data/og_index.json`; unknown tokens are
  dropped before the four-member cut, so a junk token cannot consume a slot.

**Why `/sim` is server-rendered.** Discord, X and Reddit read the HTML of the URL; they do
not run JavaScript. `api/sim.js` therefore loads `index.html` from disk and injects
`<title>`, `og:*` / `twitter:*`, `<link rel="canonical">`, and a
`<script>window.__SIM__ = {…}</script>` before `app.js`. `index.html` keeps its base tags
between `<!-- og:base -->` and `<!-- /og:base -->`; the function **replaces that block**,
so a crawler never sees two `og:title` / description tags.

**The preview is plain — on purpose.** `simDescription()` returns the site tagline for
every mode (`Suitcase. With information. R1999.`, translated for `vi`/`cn`); team links do
not list members and character links do not print the build. There is **no `og:image`** in
either `api/sim.js` or `index.html`, so Discord renders title + description only. Keep it
that way unless the owner asks for cards again: the tags are the switch, the renderer is
still there.

**The client view.** `app.js` `renderSimView()` draws a fixed overlay (`#sim-view`,
`body.sim-mode`) over the app, so one page serves both the crawler and the visitor. It
reads `window.__SIM__` when present and otherwise parses `location.search` itself
(`readSimParams()`), which is what makes `python serve.py` work without Vercel: `serve.py`
maps `/sim` onto `index.html`. The overlay has a language switch (which rewrites `lang` in
the URL, so the copied link keeps following the visitor) and a copy-link button.

The two views are **the app's own markup**, not a second design: the team view emits
`.team-card` / `.team-slots` / `.team-slot*` (the exact card the PNG export renders) straight
on the page's `images/background.png`, and the character view calls `renderBuildsDetail()`
and copies `#builds-detail` out — inside the InfoBook's own `.modal-card` frame
(`.sim-build-card`) — dropping `.builds-share-btn`, `.char-skills-section`,
`.char-mats-panel` and `.build-notes-box` so only the build shows. The notes callout is
dropped because 105 of the 107 notes are just "Recommended Portrait: 0/1/2/5", which the
chart already draws (only Charlie and Matilda carry prose). The rotation view reuses
`rotationPlanHtml()` — the same hero, team, notes and rounds the Rotations modal draws —
inside `.sim-rotation-card`, with its own share button left out. The rounds **size
slider stays**: it only changes how the cards are drawn, and it is wired by the same
`wireRotationPlan()` the modal uses. The card frame is transparent — the page already
paints the wallpaper (`.sim-view::before`), so the plan sits straight on it and only the
section rows carry a surface — but the border, corner radius and glow of
`.archetype-modal-card` stay.
The toolbar is the app's
`.top-controls` / `.header-*` / `.lang-switcher` / `.btn` markup with the middle cluster
(search, Manage, JSON, Export PNG) left out. Keep new visuals in `styles.css` modal rules;
do not add a parallel `/sim` look.

One rule exists because of that reuse: below 768px the InfoBook swaps rail + detail for a
master-detail flow, so `.builds-body .builds-detail` is `display: none` until the body
carries `.is-detail` — which `/sim` never sets (there is no rail to come back from). The
share pane was therefore **blank on a phone**. `.sim-build-card .builds-detail
{ display: flex }` sits after that media query on purpose (same specificity, later in the
file) and keeps the copied pane visible at every width. The rotations modal has the same
master-detail rule, so `.sim-rotation-card .rotations-detail` repeats the override.

The wallpaper is painted on `.sim-view::before` (`position: fixed` + `inset: 0`), the same
trick as the app's `body::before`, **not** as `background-attachment: fixed` on the
scrolling overlay: iOS Safari does not support fixed backgrounds, sizes the 1920x800 art
against the scroll container's content box instead, and the page shows a few giant torn
pixels. The overlay is `position: fixed` with a z-index (so it is a stacking context), which
keeps the negative layer above the panel colour and below the shell.

**Share buttons.** Each team card's head carries an icon-only button
(`.btn-team-share`, `images/random_icon/share_icon.png`) as does the InfoBook character
build hero (`.builds-share-btn`) and the rotation plan hero (`.rot-share-btn`, the same
`.builds-share-btn` art). All call `copyShareLink()` → `guideCopyText()` and
flash green/red for 1.2s, since there is no text label.
`simShareUrlForTeam()` builds
`/sim?t=<skinId>-<insight>-<level>-<portrait>-<chube>,…&name=…&lang=…` from the roster + slot
data (skin id is the equipped skin, or `01` when skins are hidden),
`simShareUrlForCharacter()` builds `/sim?c=<skinId>&lang=…`, and
`simShareUrlForRotation()` builds `/sim?r=<presetId>&lang=…`. All append the current
language. The export PNG sheet hides the share button (`.team-export-sheet .btn-team-share`).

**Caching.** `/sim` answers with `s-maxage=300` (five minutes), so a title or description
fix reaches Discord after one revalidation. `/api/og` — which no page references any more —
still uses the content-addressed scheme it always had: `&v=<sha1, first 10 hex, of
"<CARD_RENDER_VERSION>:<canonical query>">` with `s-maxage=31536000`, because Discord caches
an OG image by URL forever. `simVersion()` / `CARD_RENDER_VERSION` in
`api/_lib/sim/params.mjs` are kept for that endpoint and its tests; `/sim` no longer appends
`v`, so nothing there needs a bump when card layout changes.

**The renderer.** `@vercel/og` 0.6.8 on the **Node runtime** (not Edge: the Edge bundle cap
is 4 MB and the fonts alone are ~600 KB). 1.0.x crashes on Node 24
(`Dynamic require of "fs" is not supported`), so the version is pinned.

- `api/_lib/og/render.mjs` `renderOg({ query, origin })` — takes the **raw query string**
  (falls back to the argument itself), normalises it with `normalizeSim`, then loads art and
  builds the `ImageResponse`. `/api/og` therefore parses a link and a card identically.
- `api/_lib/og/cards.mjs` — the three card trees. The **team card is the parchment export
  card** (`P` palette in `theme.mjs`): one `.team-card`-style sheet with four slots of
  portrait + afflatus emblem + insight/Lv band + five portrait dashes + a side psychube,
  `+` placeholders for empty slots and the site footer. The **character card is the
  InfoBook's detail pane** (`BUILD` palette, `#B55829` frame, flat `#111111` field — the
  wallpaper was cropped past recognition at 1200x630 and read as noise): hero row (84px
  portrait, rarity diamonds, damage icon + role tags), the Portrait Value bars, Recommended
  Psychubes and the Resonance panel with its orange preset buttons. It is **1200x630 when a
  chart fills the sheet and shorter when it does not** — `characterCardHeight()` returns the
  natural height of the two loadout panels for the 85 heroes without a progression chart,
  so the sheet is never half empty and the preview keeps the `/sim` pane's proportions.
  `theme.mjs` also has palette, rarity colours, `h()` / `img()` / `frame()` / `safeText()`;
  `labels.mjs` — locale lookup from `content/i18n.json`.
- Satori's `objectFit` is not reliable: the 170x114 pattern glyphs were drawn stretched into
  the 44x44 `.build-pattern img` box, and even the corrected ratio came out muddy because
  resvg's bilinear downscale drops the 1px strokes. The fix is pre-scaled art: **the glyphs
  are 44px PNGs** in `assets/og/pattern/<shape>/<pattern>.png`, generated once by
  `scripts/og/pattern-icons.py` (Pillow, LANCZOS) from `images/shape_pattern/**`.
  `render.mjs` prefers them and only falls back to the originals. `assets.mjs`
  `imageSize()` still reads the PNG header, so a fallback glyph keeps its real ratio inside
  the fixed 44x44 box (psychube art is 180x214 in a 54x64 box — near enough to need no help).
- `safeText()` runs on every string the cards print: it maps the site's decorative
  codepoints (`✦ ★ ⌽ → …`) to ASCII and **drops anything the fonts cannot draw**, because
  an unknown codepoint makes satori attempt a Google-font download that 400s and kills the
  whole card. `builds.json` notes carry `⌽`/`✦`, and six heroes have a Cyrillic `nameEng`
  (`Авксивий`, `Вила`, `Енисей`, `Зима`); the Chinese name is the fallback there.
- Satori is **flexbox only**: no grid, no `box-shadow`, and every element with more than
  one child needs `display: flex`. Do not print `★` / `✦`: satori treats the codepoint as
  a missing glyph and tries a **dynamic Google-font download that 400s**. Rarity is drawn
  as gold pips instead.
- Art is fetched over HTTP from the deployment origin (`x-forwarded-host`), falling back to
  reading `images/**` from disk, then cached per instance as data URIs. That keeps the
  function bundle free of the asset cache.

**Fonts.** Satori only accepts TTF/OTF/WOFF (WOFF2 throws
`Unsupported OpenType signature wOF2`), so `assets/og/` ships:

| File | Covers |
|---|---|
| `be-vietnam-pro-400.ttf` / `-700.ttf` | Latin + full Vietnamese diacritics |
| `noto-sans-sc-400.ttf` / `-700.ttf` | **subset**: the Chinese glyphs a card can print |

Regenerate with `python scripts/og/fetch-fonts.py` (needs `fonttools`) after the roster,
the psychube names or the `i18n.json` card labels change — the subset is built from
`ArcanistMap.json`, `psychube_id.json` and the CN strings of `content/i18n.json`
(`og.*`, `card.portrait`, `card.resonance`, `builds.psychubes`, `afflatus.*`, `pattern.*`).
A missing glyph renders as tofu, not as an error.

**Data.** `data/og_index.json` (~130 KB) is generated by `scripts/sync/derive/ogIndex.mjs`
and joins, once, what a card prints: `ArcanistMap` (id + default-skin head icon),
`characters_by_rarity` / `characters_by_afflatus` (buckets), `character_profiles`
(`dmgType`), `character_reso_shape` (board shape), `content/builds.json` (pattern,
portrait, recommended psychubes, and the `resonance` preset **labels** — the codes stay in
`builds.json`) and `psychubes_data` (name + icon). Characters are keyed by **canonical
roster name** — `ArcanistMap` ships the game's own label (`Six`, `Thirty-seven`), which is
resolved through the `character_profiles` id. `sync:verify` asserts the roster/psychube
counts, the head paths, the pattern icons, the resonance preset labels and that every
recommended chube resolves to a key.

**Local development.**

```powershell
python serve.py                       # /sim works through index.html
node scripts/og/render.mjs            # writes .tmp-og/*.png, no server needed
node scripts/og/render.mjs team cn    # one case: <character|team|default|character-…> <lang>
```

`scripts/og/render.mjs` reads art from disk, so it works offline; it is the fastest way to
see a layout change. Its `CASES` use compact links (`c=` / `t=`) plus one `team-legacy`
case, so both parsers stay rendered.

**Deployment.** `vercel.json`:

- `rewrites`: `/sim` → `/api/sim`.
- `functions["api/og.js"].includeFiles`: `data/og_index.json`, `content/i18n.json`,
  `assets/og/**`.
- `functions["api/sim.js"].includeFiles`: `index.html`, `data/og_index.json`,
  `content/i18n.json`, `content/rotations.json` — no fonts, since it no longer renders a card.
- `images/**` is **not** bundled; `/api/og` fetches art over HTTP.

Paths are anchored to the module (`import.meta.url`), not to `process.cwd()`, so the same
code resolves `/var/task/...` in the bundle and the repo checkout in tests.

**Tests.** `editor/_test/og.test.mjs` (wired into `npm test`) covers `parseList`, the
name/psychube resolvers (EN, CN, case-insensitive, bare game id, unknown), `normalizeSim`
in all four modes and every link shape, compact round-tripping, chube alignment,
truncation, name sanitising, `langExplicit`, the canonical image query, the content hash,
the title/description strings and the label fallbacks. It never renders a PNG; satori's
WASM is not a unit-test dependency.

---

## 14. Planner (event shop)

The 23rd modal: an InfoBook-shaped window with **one tab, Event**, that prices the event
shop the global client is currently running. Data is `data/event_shop.json`, generated by
`scripts/sync/derive/eventShop.mjs` — so `npm run sync` moves the tab to a new patch with
no hand edit in `app.js`.

**What the tables say.**

- `activity107` is one row per goods slot: `product` and `cost` are `type#id#qty`
  strings, `maxBuyCount` is the purchase cap (`0` = unlimited), `isOnline` says the slot
  is switched on.
- `activity` is the catalogue row (display name, `isRetroAcitivity`).
- `language_prefab`'s `p_v<major>a<minor>_storeview_txt_title<N>` names the Nth section
  of that patch's shop (3.9: Divine Treasure / Ceremonial Offering / Regular Reserve).
- `type` selects the table (see `TYPE_TABLES`): `1` item, `2` currency, `4` character,
  `5` skin, `9` psychube, **`13` wilderness land block (`block_package`)**. `11` / `24` /
  `31` are unresolved and ship as `type11 #id` rather than as an invented name.
- **`type 13` is not a currency.** `3902`/`3903` exist in *both* tables; reading them out
  of `currency` labelled a wilderness plot "Tamer Badge" / "Perpetual Clef". The real rows
  are `block_package` `3902 Summer Haven Harbor`, `3903 Evergreen Ground I`, `3202 City of
  Light`, `3203 The Flow of Imagery I`. Myssal ships no per-block art, so every block draws
  one hand-added icon, `images/items/wilderness_icon.png` (256×256 PNG).

**Which shop is "current".** The client never deletes old shops and `activity107` carries
no date, so the patch is read from the activity id: `activityId / 100` is
`100 + major*10 + minor` (3.9 → `139xx`; a `1385xx` sub-batch is ignored). The newest such
patch that still has an online shop wins. Activity windows themselves are server-side, so
no open/close dates exist in client data. `13903 Hedone's Hoard` (Confetti Strip) is the
3.9 current shop; `13915 Musae's Store` (Marvelous Marble) and retro `13923 Glittering
Parlor` (Shard of Prophecy) ship beside it and are reachable through the modal's picker.

**Identity is the goods slot, not the product.** `uid` is the `activity107` row id,
because the same product can sit in two sections at different prices (Old Ticket 230 vs
750) and each carries its own cap.

**State.** `r1999_planner_v1` holds `{ patch, shop, limits }`, where `limits` maps
`"<shopId>|<goodsUid>"` → quantity. On load, a blob whose `patch` differs from
`data/event_shop.json`'s patch is **removed entirely** (the goods slots are activity rows,
so old picks cannot mean anything on a new shop); uids the shipped data no longer names
are dropped even within one patch. This is a planner, so an untouched capped row starts
at its **cap** (`maxBuy`) and an unlimited row (`maxBuy: 0`) starts at 0; an explicit `0`
is stored rather than deleted so it differs from the default. Reset deletes the shop's
entries, so every row falls back to its default.

**UI.** Cards, not rows: the grid is `repeat(auto-fill, minmax(112px, 1fr))` and each card
is art / clamped name / price / `[−][n/max][+]`. Conventions the owner pinned:

- The item art draws **no frame of its own** (no background, no border) and is 76px, since
  the game's item art already carries its border.
- The quantity box reads **`n/max`** (`1/1`, then `0/1`), `n/∞` when the slot has no cap;
  `data-max` carries the numeric cap for tests.
- A card planned at **zero reads as sold out**: `.is-soldout` greys the art and prints
  `Sold Out` / `售罄` / `Hết hàng` across it, and `plannerCards()` stable-sorts those to the
  end of their section. Stepping back up returns the card to its shop position.
- A card's price carries the shop's currency icon on **its left** (`<icon> 1000`), and the
  toolbar total reads label → currency icon → number, with the reset button to the **right**
  of the number.
- A picked card is **not** tinted: `.planner-card.is-picked` does nothing on purpose, the
  `n/max` box already says what is planned.
- The name box is always two lines tall and `.planner-stepper` is `margin-top: auto`, so
  every card in a grid row lines its stepper up whatever the name wrapped to.
- Section bars are the Appearance modal's `.archetype-section-header` /
  `.archetype-section-title`, so "Divine Treasure" is the same object as "DISPLAY FILTERS".
- The shop picker is a native `<select>` with `appearance: none` and an inline SVG caret,
  so it matches the modal instead of showing the OS arrow.

**Assets.** `scripts/sync/assets.mjs` `eventShopAssets()` copies the shop's icons into
`images/items/icon/` and `images/psychube_icon/`; `prune-images.mjs` `eventShopNeeded()`
is unioned into both groups, so a slot the data names is never pruned.

**Verify.** `scripts/sync/verify.mjs` asserts the `event_shop` shape (slot uniqueness, real
section names, every icon present) plus the wilderness rules above. `editor/_test/ui.test.mjs`
drives the modal itself: card layout, `n/max`, defaults at cap, unlimited climbing, separate
quantities per slot, sold-out label + reordering, reset, persistence, patch wipe, the
toolbar order, the card's currency icon and the row alignment.
