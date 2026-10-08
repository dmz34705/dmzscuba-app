# Handoff prompt — Ocean Atlas site card + depth research

Paste everything below the line into the next coding agent.

---

You are continuing work on the DMZ Scuba app (Expo; read AGENTS.md first — Expo v57 docs at
https://docs.expo.dev/versions/v57.0.0/). Work is in /Users/dmz/dmzscuba-app on branch `main`.
Start with `git status` and `git diff --stat`. Do not discard another agent's work.

## What was done (uncommitted)

1. **Researched site profiles** — `src/features/oceanAtlas/data/siteProfiles.json` (new Atlas update dataset, 25th key in
   `updateContract.js` / `datasets.js`), read by `src/features/oceanAtlas/siteProfiles.js`. Two kinds of entries:
   - `basis` absent/"research": hand-researched Lake Michigan wrecks (93) with depth `[top, bottom]` in metres, entry, level,
     mooring, hazards, highlights, original summary, sources, optional corrected `position`, `status: ashore|unlocated` hides a pin.
   - `basis: "depth"`: depth-only entries produced by `scripts/build-depth-research.cjs` from evidence files.
   Corrections (position, depth, entry, hidden) apply after duplicate merging in `catalog.js` (`applySiteCorrections`) and are
   mirrored in `atlasRuntime.js` via `DATA.siteCorrections` (built in `document.js`).
2. **Site guide payload** moved out of `src/screens/OceanAtlasScreen.js` into `src/features/oceanAtlas/siteGuide.js`
   (`buildSiteGuide`), which now includes `profile`.
3. **Site card redesign** in `src/features/oceanAtlas/atlasRuntime.js` + `atlasStyles.js`:
   peek with level/fit, tags and 4 stats (depth, water at depth, vis, current); Overview = cross-section hero SVG
   (`crossSection`), dive-slate tiles (`slate`), highlight chips, facts, "Watch for" chips; Conditions = this month, season
   strip (`seasonStrip`), in-the-water specs; the expanded sheet scrolls as one page with a sticky tab bar (`pinHeader`).
   **After editing atlasRuntime.js / model.js / rendering.js always run `npm run bundle:ocean-atlas`** (regenerates
   `data/runtimeSource.js`; the app runs that bundle, not the source).
4. Docs: `docs/SITE_RESEARCH.md` (rules + Lake Michigan review sheet), `docs/OCEAN_ATLAS.md`, `docs/ATLAS_UPDATES.md`.
5. Tests: `npm run test:site-profiles` (new), plus `test:ocean-atlas`, `test:atlas-updates`, `test:atlas-journey`,
   `test:site-dives`, `test:atlas-places`, `test:atlas-species`, `test:planner` — all passing at handoff.
   (`scripts/verify-ocean-atlas-browser.cjs` was already failing before this work at the `#species` selector — not ours.)
   Visual check: `PLAYWRIGHT_MODULE=<path to playwright-core> CHROME=<chrome binary> node scripts/preview-atlas-site-card.cjs "Site A|Site B" /tmp/out`
   writes peek/expanded/tab screenshots using the real native data.

## 2026-10-08 checkpoint — Claude owns research batches

The user assigned all further internet research to Claude. Codex may build, verify, audit and publish the evidence,
but must not start or edit research batches unless the user explicitly reassigns that work. No research process or
agent was running at this checkpoint. The 45 completed comprehensive batches and all 9 legacy depth batches have been
compiled into `siteProfiles.json`. The current whole-catalog audit is:

- 7,139 active sites (142 researched non-dive/closed/too-deep records are deliberately hidden).
- 4,285 (60.0%) have a published site depth; 4,609 (64.6%) have an entry method; 7,072 (99.1%) have a water
  environment; 3,067 (43.0%) have a site type/topology.
- 1,444 (20.2%) have all four confirmed core facts. A separate, explicitly estimated planning tier covers
  1,976 (27.7%). Never merge those two metrics.
- 529 visible sites (7.4%) have a researched profile: 464 full profiles and 65 depth-only profiles. Across visible
  sites, full-profile fields cover 464 summaries, 57 visibility records, 67 current records, 115 access records,
  295 highlight sets, 264 hazard sets, 44 mooring records and 17 penetration records.
- The generated file contains 671 records total: 468 full profiles and 203 legacy depth-only entries, including
  hidden records retained for provenance. The comprehensive evidence set contains 632 unique IDs; overlaps with the
  legacy depth pipeline are intentional and the comprehensive result wins deterministically.
- Supporting context: 3,037 community visibility aggregates, 988 encyclopedia records, 879 photos, 2,203 protected
  area matches, 1,077 shore-context rows, 5,306 seafloor estimates, 653 higher-resolution bathymetry rows and 491
  lake-depth rows.

Run `npm run audit:site-coverage` for the live counts; the numbers above are a checkpoint, not constants.

## Comprehensive site research queue (resume here)

Everything is driven by files, so the assigned research owner can continue without hidden state:
- `npm run research:plan` builds `scripts/data/site-research/queue.json`: 430 batches of ≤ 25 sites (same country),
  ordered: sites with a verified depth (upgrade to full profiles) → notable sites (Wikipedia/photo) → everything
  else by region (US, Red Sea, Indonesia, Philippines/Malaysia, Maldives/Thailand, UK/Ireland, Caribbean, Pacific…).
  Re-running keeps finished batches. `npm run research:next` prints the next unfinished batch.
- A batch is done when `scripts/data/site-research/<batch>.json` exists. Research instructions for whoever does a
  batch (human or agent): `scripts/data/site-research/BRIEF.md` (sources, rules, file format).
- After each batch: `npm run research:verify -- <batch>` (re-downloads every cited page; drops claims whose numbers
  aren't on the page — per quote, results in `verified.json`), then `npm run research:build` (regenerates every
  automated entry in siteProfiles.json from all evidence; hand-researched Lake Michigan profiles are untouched),
  then `npm run test:site-profiles` and the other Atlas tests, and `npm run bundle:ocean-atlas` only if runtime
  code changed. `build-depth-research.cjs` is now an alias of `build-site-research.cjs`.
- Calibration (2026-10-07): a Haiku agent misquoted ~half its sources (24/47 quotes not on the page), cited banned
  directories and put factual errors into summaries (e.g. Vandenberg as a "cargo ship sunk in 1984"); its batch was
  discarded. A Sonnet agent's batch verified 24/24 at similar token use (~125k tokens per 25-site batch).
  **Run batches on Sonnet-class models only**, two at a time (web-search budgets are per session).
- The committed-in-worktree OpenDiveMap snapshot still has four-field community rows. The importer can now add a fifth
  field, average logged-dive duration, but the snapshot was intentionally not re-synced after research was paused.
  `updateContract.js` and `verify-ocean-atlas.cjs` accept both four- and five-field rows, so tests pass and old Atlas
  updates remain compatible. When research resumes, `npm run sync:global-dive-sites` will populate the fifth field.

Current queue position: 45/430 batches complete; `notable-mexico-1` (16 sites) is next. Claude is the only agent that
should claim it. The evidence directory and generated dataset are now tracked so future work is incremental and auditable.

### Broad enrichment already implemented

- `scripts/sync-open-dive-map.cjs` now imports conservative topology facts from unambiguous site names plus numeric
  OpenDiveMap aggregates: visibility, rating, logged dives and (after the next sync) average logged-dive time. It does
  **not** import directory descriptions or thumbnails. Cards label these numbers as community averages/estimates.
- Exact OSM objects were fetched and run through `scripts/enrich-osm-site-snapshot.cjs`. The compact OSM rows can now
  carry mapped current, permit/private/customer/permissive access, fees, ten hazard categories, mooring/descent lines,
  site-finding difficulty and steps/ladder/rocky/steep entry details. These are delivered only with the selected native
  site guide, not added to the WebView bootstrap, and the UI says to confirm locally.
- `scripts/enrich-global-site-topologies.cjs` performs resumable exact spatial joins for still-untyped OpenDiveMap sites:
  reef within 250 m; wreck or cave entrance within 150 m. The last run was interrupted before it wrote a final snapshot,
  so rerun `npm run enrich:global-site-types`; do not count the temporary cache as completed data.
- `scripts/fetch-osm-site-source.cjs`, `scripts/audit-atlas-site-coverage.cjs` and
  `scripts/report-site-research-gaps.cjs` provide reproducible source refresh, coverage and country-level gap reports.
  Current largest queues include the US, Indonesia, France, UK, Germany and Switzerland.

Research evidence rules remain strict: factual fields only; original summaries; official/agency/park sources can stand
alone; otherwise require two independent publishers agreeing within 20%; directory sites never count as proof. Preserve
the distinction between researched facts, structured community map tags, community aggregates and model estimates.

## Display work completed after research was paused

The depth cross-sections now use the four finished SVG illustrations in `src/features/oceanAtlas/diagrams/`, supplied by
the user, and were visually checked at phone-card width:

- `wreck.svg`, `reef.svg`, `cenote.svg` and `inland.svg` share the same 960×560 canvas and finished illustration style.
  Walls, pinnacles and other ocean profiles use the reef artwork; caves, caverns and mines use cenote; freshwater sites use
  inland. The original procedural scene generator is unreachable and removed from the production bundle by minification.
- `atlasRuntime.js` injects live surface/deep temperature, numeric depth ruler, top/bottom markers, training/recreational
  limit line and illustration caption over the selected artwork. The art remains illustrative; the ruler and markers are
  driven by the real published or modelled site values.
- Artwork selection uses all structured signals with explicit precedence: cave/cavern/cenote/mine/overhead → cenote,
  wreck → wreck, any remaining freshwater site → inland, wall/pinnacle/reef/other ocean site → reef artwork. This prevents
  a generic `spring` label from hiding a cave topology and prevents untyped freshwater sites from falling through to reef.
- The SVG sources are embedded into the offline WebView bundle by `scripts/bundle-ocean-atlas-runtime.cjs`. The runtime hash
  and `verify-ocean-atlas.cjs` now include and validate all four assets, so changing one without rebundling fails tests.
- Exact screenshot-site visual checks: C-53 Felipe Xicoténcatl Wreck (72 ft), Palace Reef (59 ft) and Cenote Tajma Ha
  (46 ft), plus Tauragnas (194 ft lake).
- `scripts/preview-ocean-atlas.cjs` now mirrors the native site-guide bridge so the complete cards work in the localhost
  browser preview. `npm run bundle:ocean-atlas` was run afterward.
- Passing after this work: `test:ocean-atlas`, `test:site-profiles`, `test:atlas-updates`, and `test:atlas-journey`.
  Journey validation now recognizes every intentionally hidden research status (including too-deep wrecks) when checking
  retained photo/fact provenance, and accepts sourced depth precision instead of one obsolete rounded value.

## Background: coverage goals across all 7,277 sites

Depth is one part of this task, not the finish line. The 2026-10-06 baseline from
`npm run audit:site-coverage` is: 258 active sites (3.5%) with any researched
profile, 89 (1.2%) with a full profile, and only 235 (3.2%) with all four core facts
(published site depth, entry, water environment, and site type). Track access,
difficulty, visibility, current, hazards, mooring/descent details, highlights,
summary, sources, and an open photo where publishers make them available.

Use exact source identifiers first. The 2,630 OSM catalog records can be read by
their node/way/relation IDs and currently expose hundreds of structured entry,
difficulty, access, hazard, mooring, and Wikipedia/Wikidata link tags that the
compact catalog does not fully use. Then use open agency/park/preserve datasets;
targeted publisher research fills gaps. Keep regional estimates clearly separate
from site-specific facts.

### Legacy depth-only research history (~3,100 sites still lack a published depth)

Rules (also in `docs/SITE_RESEARCH.md` and the header of `scripts/build-depth-research.cjs`):
- Facts only (a depth + who published it). Never copy descriptions. Short quotes stay in evidence files, never in the app.
- Never use directory databases as sources: padi.com, wannadive.net, divesitedirectory.com, divebuddy.com, divessi.com,
  scubaboard.com, tripadvisor, zentacle, deepblu, diveadvisor, dive.site, diveplannerpro, sea-seek, duikersgids.
- Accept a depth with one agency/park source, or two independent publishers (different websites) agreeing within 20 %.
- No bulk crawling of a single website (≤ ~20 pages per site per batch).

Pipeline: evidence JSON per batch in `scripts/data/depth-research/<batch>.json` (format in the build script header) →
`node scripts/build-depth-research.cjs --check` (read-only report) → `node scripts/build-depth-research.cjs` (writes
siteProfiles.json) → `npm run test:site-profiles` and the other Atlas tests.

Historical evidence-batch status (the newer `research:*` pipeline above is now the continuation path; use the live audit,
not these historical accepted-depth totals, for current profile counts):
- Done: `florida.json`, `red-sea-south.json`, `red-sea-north.json`, `us-florida-1.json`, `us-florida-2.json`,
  `us-inland-1.json`, `us-inland-2.json`, `us-coasts.json`, and `indonesia-1.json`. Together they contain 203 unique
  researched sites; the build accepts 169 sourced depths and holds 34 for review. No research agents are still running.
- Paused after Indonesia batch 1. It accepts 9 of the original 192 missing-depth Indonesia sites, covering defensible
  Komodo and Bunaken matches. Many remaining catalog entries are businesses or generic labels, so match them conservatively.
- Remaining wave 2, in this order: finish Indonesia, Philippines + Malaysia (~150), Maldives + Thailand + Sri Lanka
  (~181), UK + Ireland (~313). Then Swiss/German/Austrian lake entry points (~600) last.
  To build a work list: catalog sites where `!maxDepthMeters || depthIsWholeLake` and no entry in siteProfiles.json, grouped by
  country via `placesForSite` (`src/features/oceanAtlas/places.js`); include lat/lon and the modelled seafloor from
  `data/siteBathymetry.json` / `siteSeafloor.json` as a sanity check.
- Bulk official data that worked: Florida FWC artificial reefs (ArcGIS:
  https://gis.myfwc.com/mapping/rest/services/Open_Data/Artificial_Reef_Locations_in_Florida/MapServer/12 — Depth + Relief ft).
  Dead ends: NOAA ENC/AWOIS chart wrecks (unnamed, imprecise), OSM depth tags, foreign-language Wikipedia (little yield).

Before running the build, review these flagged items:
- Resolved: Weeki Wachee, Eagle's Nest, and Peacock Springs are labelled as cave-system maxima requiring technical cave
  training. Circle of Heroes and Zion Train use their Florida FWC positions.
- Aida wreck was flagged as possibly misplaced near Little Brother; confirm against a reliable exact position before moving it.
- Catalog cleanups found: town pins listed as dive sites (Safaga, Hurghada, El Gouna, Dahab, Taba, Makna, Haql, Al-Bad',
  Tayyib Al-Ism); HMS Medway/Eridge/Attack/Zealous are Mediterranean wrecks tagged Egypt; Kormoran duplicated under two ids;
  USCGC Duane appears twice (x-wikipedia-222 and noaa-fknms-duane-wreck, ~2 km apart).
- Weak sources to double-check in evidence (e.g. airguide.info, wikivoyage) — drop anything that isn't a real publisher.

When a batch is done: run the build, run tests, re-bundle if runtime code changed, and update the counts in
`docs/SITE_RESEARCH.md`.

- 2026-10-07: `build-site-research.cjs` keeps a coastal `area` pin (shallowest nearby seafloor ≤ 40 m) on the map when no
  other listed site lies within 20 km, so a destination like Puerto Galera never loses its only pin. Whole seas and
  inland towns are still hidden. Kept pins are listed as `held` with "area pin kept".
