# Handoff prompt — Ocean Atlas site card + depth research

Paste everything below the line into the next coding agent.

---

You are continuing work on the DMZ Scuba app (Expo; read AGENTS.md first — Expo v57 docs at
https://docs.expo.dev/versions/v57.0.0/). Work is in /Users/dmz/dmzscuba-app on branch `main`, **uncommitted**.
Start with `git status` and `git diff --stat` to see it. Do not discard any of it.

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

## Current task: fill missing max depths (~3,200 sites) within legal limits

Rules (also in `docs/SITE_RESEARCH.md` and the header of `scripts/build-depth-research.cjs`):
- Facts only (a depth + who published it). Never copy descriptions. Short quotes stay in evidence files, never in the app.
- Never use directory databases as sources: padi.com, wannadive.net, divesitedirectory.com, divebuddy.com, divessi.com,
  scubaboard.com, tripadvisor, zentacle, deepblu, diveadvisor, dive.site, diveplannerpro, sea-seek, duikersgids.
- Accept a depth with one agency/park source, or two independent publishers (different websites) agreeing within 20 %.
- No bulk crawling of a single website (≤ ~20 pages per site per batch).

Pipeline: evidence JSON per batch in `scripts/data/depth-research/<batch>.json` (format in the build script header) →
`node scripts/build-depth-research.cjs --check` (read-only report) → `node scripts/build-depth-research.cjs` (writes
siteProfiles.json) → `npm run test:site-profiles` and the other Atlas tests.

Status of batches:
- Done: `florida.json`, `red-sea-south.json`, `red-sea-north.json`, `us-florida-1.json`, `us-florida-2.json`,
  `us-inland-1.json`, `us-inland-2.json`, and `us-coasts.json`. Together they contain 194 unique researched sites;
  the build accepts 160 sourced depths and holds 34 for review. No research agents are still running.
- Not started (wave 2, in this order): Indonesia (~192 sites), Philippines + Malaysia (~150), Maldives + Thailand + Sri Lanka
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
`docs/SITE_RESEARCH.md`. Ask the user before committing; they have not committed this work yet.
