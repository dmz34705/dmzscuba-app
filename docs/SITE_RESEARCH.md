# Site research

How DMZ Scuba improves dive-site data without copying anyone's database, and the
Lake Michigan pilot that tested it.

## Rules

- **Facts, not text.** Depths, positions, entry, buoys, hazards and what's on a
  site are facts and are recorded with the source they came from. Descriptions
  and reviews written by others are never copied: every summary in
  `siteProfiles.json` is written by us from several sources.
- **Sources in tiers** (see [Dive site sourcing](DIVE_SITE_SOURCING.md)): agency and
  archaeological records first (Wisconsin Historical Society, NPS, state
  preserves), then Wikipedia/Wikidata. Forums and charter pages only point to
  sites; a profile resting on diver reports alone is marked `needs-local` and
  says so on the card.
- **No bulk crawling** of any one directory or database. Research is per site,
  polite (identified User-Agent, one request at a time) and cached.
- **Regional conditions are labelled as regional.** Lake Michigan's thermocline
  temperatures, season and typical current apply to the whole lake and show as
  estimates; only site-specific facts appear without “est.”.

## Data

`src/features/oceanAtlas/data/siteProfiles.json` (an Atlas update dataset):

- `sites[id]` — depth `[top, bottom]` in metres, entry, level, visibility,
  mooring, penetration, access, highlights, hazards, summary, sources,
  and an optional confirmed `position` (applied when it moves the pin > 150 m).
  `status: ashore | unlocated | restricted | area | too-deep` removes a pin that isn't a usable scuba site.
- `regions` — shared conditions by bounding box (Lake Michigan today).
- `sources` — named sources with URL templates.

Corrections apply after duplicate merging in both `catalog.js` and the map
(`atlasRuntime.js`). Check with `npm run test:site-profiles`; preview cards with
`scripts/preview-atlas-site-card.cjs`.

## Completeness goal

The research program targets complete, useful site guides—not only missing
depths. Run `npm run audit:site-coverage` after each batch. The core facts are a
published site depth, entry method, water environment, and site type. A useful
guide should then add, where sources publish them: access or permit rules,
difficulty, typical visibility and current, hazards, mooring or descent details,
highlights, a factual summary, and an openly licensed site photo.

Work from exact source identifiers before searching by name. In particular,
the 2,630 OpenStreetMap records can be refreshed by their node/way/relation IDs;
their structured tags and Wikipedia/Wikidata/Commons links are safer to match
than search results. Next prefer open agency, park, preserve, hydrographic, and
archaeological datasets. Targeted publisher research fills the remaining gaps.
Never turn a regional estimate into a site-specific fact, and never infer that
an unmapped facility, hazard, or restriction does not exist.

The broad first pass is reproducible rather than a one-off scrape:

- `npm run sync:global-dive-sites` refreshes the licensed OpenDiveMap catalog.
  It imports names and factual numeric aggregates only (visibility, rating,
  logged dives, and average logged-dive time). Third-party descriptions and
  thumbnails are excluded. The card labels these values as community averages,
  estimates them visually, and never treats them as researched facts.
- `npm run fetch:osm-site-source` fetches the exact OpenStreetMap objects already
  in our catalog; `npm run enrich:osm-sites -- <source.json>` extracts only
  structured tags for current, access/fee, mapped hazards, mooring/descent lines,
  and unambiguous feature types.
- `npm run enrich:global-site-types` spatially joins still-untyped global sites
  to mapped reefs within 250 m and wrecks or cave entrances within 150 m. Its
  per-site cache makes the slow lookup resumable and prevents repeated requests.
- `npm run report:site-gaps -- 30` ranks the remaining country queues by field;
  `npm run audit:site-coverage` measures both confirmed core facts and a separate
  planning-ready tier that permits clearly labelled depth and shore estimates.

Baseline on 2026-10-06: 7,277 active catalog sites; 258 (3.5%) have any
researched profile, 89 (1.2%) have a full researched profile, and 235 (3.2%)
have all four core facts. (The profile file also retains four researched wrecks
hidden as ashore or unlocated.) Existing supporting datasets already cover 1,114 encyclopedia
records, 969 photos, 2,216 protected-area matches, 1,099 shore-facility matches,
and 5,406 modelled seafloor records; those do not by themselves make a site
fully researched.

Current checkpoint on 2026-10-08: 7,139 active catalog sites; 529 (7.4%) have
any researched profile, 464 (6.5%) have a full profile, and 1,444 (20.2%) have
all four confirmed core facts. The generated profile file contains 671 records
including 142 researched records intentionally hidden as non-sites, restricted,
unlocated, ashore or too deep for scuba. The comprehensive queue is 45/430
batches complete and `notable-mexico-1` is next. Claude is the sole owner of
new research batches unless the user explicitly reassigns the work; other agents
may build, validate, audit and publish completed evidence.

## Filling in missing depths

About 3,200 sites have no published depth. Open datasets cover few of them
(OpenStreetMap tags, foreign-language Wikipedia and NOAA chart wrecks were
checked and add little), so depths come from per-site research:

1. Evidence goes in \`scripts/data/depth-research/<region>.json\`: for each site,
   claims with the page URL, publisher, kind (agency, park, encyclopedia,
   operator, press), top/bottom depth and a short verbatim quote. Evidence is
   reviewable in the repo and is not shipped in the app.
2. \`node scripts/build-depth-research.cjs\` accepts a depth when one agency or
   park source states it, or two independent publishers agree within 20 %
   (the deeper figure is kept). Directory databases (PADI Travel, Wannadive,
   Divebuddy, SSI MyDiveGuide, ScubaBoard, TripAdvisor …) never count. A depth
   far deeper than the seafloor modelled around the pin is held for review.
   \`--check\` reports without writing.
3. Accepted depths become \`basis: "depth"\` entries in \`siteProfiles.json\`: the
   card shows the range and links each source. Hand-researched profiles are
   never overwritten.

Bulk official data used so far: Florida FWC artificial reef deployments
(depth and relief → top and bottom) and the NOAA Florida Keys Shipwreck Trail.
Reefs that are areas rather than points often have no single honest depth;
they keep their estimate until sources agree.

Current depth-research progress: 9 evidence batches cover 203 unique catalog
sites. The build accepts 169 sourced depths and holds 34 for a second source or
manual review. The accepted set includes the completed Florida, other U.S.
coasts, inland U.S., and northern/southern Red Sea batches, plus the first
Indonesia batch covering 9 Komodo and Bunaken matches. Indonesia remains in
progress. Cave-system maxima are explicitly labelled, and the Florida FWC
positions correct the Circle of Heroes and Zion Train pins.

## Lake Michigan pilot — review sheet

93 wrecks, north to south. Depths in feet (top–bottom where the top is
known). Sources: `whs:N` = [Wisconsin Shipwrecks](https://education.wisconsinshipwrecks.org/Vessel/Details/N),
`mup` = Michigan Underwater Preserves (Manitou Passage), `nps` = Sleeping Bear
Dunes NPS, `wikipedia:Title`, `report` = diver reports awaiting confirmation.

| Site | Depth ft | Entry | Level | Buoy | What changed | Source |
|---|---|---|---|---|---|---|
| SS Cayuga | 102–120 | boat | advanced |  | depth 102 → 120 ft | wikipedia:SS_Cayuga |
| SS Carl D. Bradley | 310–380 | boat | technical |  |  | wikipedia:SS_Carl_D._Bradley |
| Iris (1866 ship) | 0–4 | shore | beginner |  | depth added; pin moved 0.2 km | whs:295 |
| SS Louisiana | 0–18 | shore | beginner |  | depth added; pin moved 0.2 km | whs:384 |
| Grape Shot | 8 | boat | beginner |  | pin moved 1.7 km | whs:248 |
| Fleetwing | 5–25 | shore | beginner |  | depth added; pin moved 0.2 km | whs:201 |
| Meridian | 40 | boat | beginner |  | depth added; pin moved 2.9 km | whs:433 |
| Hanover | 20 | boat | beginner |  | depth added | whs:263 |
| Alvin Clark (schooner) | — | boat | beginner |  | **Removed** — no longer in the water | whs:787 |
| Sidney O. Neff | 15 | shore | beginner |  | depth added; pin moved 0.3 km | whs:568 |
| M. J. Bartelme | 15 | boat | beginner |  | depth added | whs:398 |
| Wisconsin | 85 | boat | intermediate |  | depth added | whs:651 |
| SS Erie L. Hackley | 110 | boat | advanced |  | depth added | whs:185 |
| Christina Nilsson | 12–15 | boat | beginner | yes | depth added; pin moved 0.2 km | whs:99 |
| Alva Bradley | 20–27 | boat | beginner |  | depth added | mup |
| Congress | 135–165 | boat | technical |  | depth added | mup |
| Three Brothers | 5–45 | shore | beginner |  | depth added | mup, nps |
| SS Francisco Morazan (1922) | 0–20 | shore | beginner |  | depth added | mup, nps |
| Walter L. Frost | 10–12 | shore | beginner |  | depth 20 → 12 ft | mup |
| Rising Sun | 6–12 | shore | beginner |  | depth added | mup |
| W. L. Brown | 80 | boat | intermediate |  | depth added; pin moved 0.4 km | whs:629 |
| SS Jarvis Lord | 220 | boat | technical |  |  | wikipedia:SS_Jarvis_Lord |
| SS Australasia | — | shore | beginner |  | pin moved 0.2 km | whs:47 |
| Success | 8 | shore | beginner |  | depth added | whs:590 |
| Joseph L. Hurd | 6–17 | shore | beginner |  | depth added | whs:328 |
| Ocean Wave | 110 | boat | advanced |  | depth added; pin moved 0.2 km | whs:474 |
| Joys | 10 | shore | beginner |  | depth added; pin moved 0.2 km | whs:332 |
| Fountain City | 10–30 | shore | beginner |  | depth added | whs:212 |
| Empire State | 12 | shore | beginner |  | depth added | whs:181 |
| City of Glasgow | 10 | shore | beginner |  | depth added | whs:102 |
| Adriatic | 2–15 | shore | beginner |  | depth added | whs:10 |
| SS Lakeland | 155–205 | boat | technical |  | pin moved 0.5 km | whs:358 |
| Daniel Lyons | 110 | boat | advanced | yes | depth added | whs:129 |
| Rouse Simmons | 172 | boat | technical |  | depth added | wikipedia:Rouse_Simmons, whs:541 |
| Pathfinder | 15 | shore | beginner |  | depth added; pin moved 0.7 km | whs:490 |
| SS Continental | 0–15 | shore | beginner |  | depth added | whs:119 |
| SS Vernon | 160–210 | boat | technical |  |  | whs:624 |
| SS S. C. Baldwin | 45–75 | boat | intermediate | yes | pin moved 2.9 km | whs:545 |
| LaSalle | 12 | shore | beginner |  | depth added | whs:354 |
| Major Anderson | 3–10 | shore | beginner |  | depth added | whs:408 |
| Tubal Cain | 7–10 | shore | beginner |  | depth added | whs:618 |
| Arctic (1881 tug) | 10–15 | boat | beginner |  | depth added | whs:34 |
| SS Francis Hinton | 15 | boat | beginner | yes |  | wikipedia:SS_Francis_Hinton, whs:214 |
| SS William B. Davock | 200 | boat | technical |  |  | wikipedia:SS_William_B._Davock |
| Floretta | 180 | boat | technical |  | depth added | whs:206 |
| Home | 170 | boat | technical |  | pin moved 0.2 km | whs:277 |
| Gallinipper | 210 | boat | technical |  |  | whs:230 |
| Walter B. Allen | 90–165 | boat | technical |  | depth added | whs:630 |
| Silver Lake | 200 | boat | technical |  | depth added | whs:570 |
| Abiah | 220 | boat | technical |  | depth added; position not public — pin approximate | whs:6 |
| Helvetia | 165 | boat | technical |  | depth added | whs:268 |
| SS Selah Chamberlain | 62–87 | boat | advanced | yes |  | whs:562 |
| Lottie Cooper | — | shore | beginner |  | **Removed** — no longer in the water | whs:382 |
| William A. Reiss | — | boat | beginner |  | **Removed** — no longer in the water | whs:640 |
| Robert C. Pringle | 287 | boat | technical |  | depth 299 → 287 ft | whs:534 |
| Hetty Taylor shipwreck | 105 | boat | advanced | yes | depth added | whs:274 |
| Advance | 85 | boat | intermediate |  | depth added | whs:11 |
| Byron shipwreck | 135 | boat | technical |  | depth added | whs:81 |
| SS Atlanta | 17 | boat | beginner |  |  | whs:43 |
| Toledo | 20 | shore | beginner |  | depth added | whs:610 |
| Northerner | 65–140 | boat | technical | yes | depth added; pin moved 1.1 km | whs:466 |
| Niagara (steamboat) | 55 | boat | intermediate | yes | pin moved 28.4 km | whs:455 |
| SS J. M. Allmendinger | 12 | shore | beginner |  |  | whs:302 |
| SS John V. Moran | 365 | boat | technical |  |  | wikipedia:SS_John_V._Moran |
| SS Milwaukee (1902) | 125 | boat | advanced | yes | depth 121 → 125 ft | whs:435 |
| SS Appomattox | 15–20 | shore | beginner | yes | pin moved 0.3 km | whs:31 |
| St. Albans | 165 | boat | technical |  | depth added | whs:580 |
| E. M. B. A. | 136–170 | boat | technical |  | depth added | whs:172 |
| SS Ironsides | 109–122 | boat | advanced |  | depth 108 → 122 ft | wikipedia:SS_Ironsides |
| MV Prins Willem V | 80 | boat | advanced | yes |  | whs:512 |
| Thomas A. Scott | 30 | boat | beginner |  | depth added | whs:603 |
| Sumatra | 35 | boat | beginner |  | depth added | whs:592 |
| Transfer | 120 | boat | advanced |  | depth added | whs:748 |
| Milwaukee Fireboat 23 | 72 | boat | intermediate |  | depth added | whs:745 |
| Sebastopol | 15 | shore | beginner |  | depth added; pin moved 0.4 km | whs:561 |
| Volunteer | 15 | boat | beginner |  | depth added | whs:626 |
| Norlond | 58 | boat | beginner |  | depth added | whs:460 |
| Grace A. Channon | 205 | boat | technical |  |  | whs:243 |
| Lumberman | 65 | boat | intermediate | yes | depth added; pin moved 0.4 km | whs:390 |
| SS Michigan | 270 | boat | technical |  |  | wikipedia:SS_Michigan |
| Kate Kelly | 55 | boat | intermediate | yes | depth added | wikipedia:Kate_Kelly_(shipwreck), whs:339 |
| SS Milwaukee (1868) | 360 | boat | technical |  |  | wikipedia:SS_Milwaukee_(1868) |
| SS Merchant | 25 | boat | beginner |  |  | whs:432 |
| Rosinco | 195 | boat | technical |  | depth added | whs:539 |
| SS Lac La Belle | — | boat | technical |  | **Removed** — never confirmed found | whs:355 |
| SS L.R. Doty | 320 | boat | technical |  | depth 299 → 320 ft; position not public — pin approximate | whs:346 |
| SS Wisconsin | 130 | boat | advanced | yes |  | whs:650 |
| SS Hennepin | 200 | boat | technical |  |  | wikipedia:SS_Hennepin |
| PS Lady Elgin | 50–60 | boat | intermediate |  | depth added | wikipedia:PS_Lady_Elgin |
| Wells Burt | 40 | boat | beginner |  | depth added; ⚠ diver reports only — please confirm | report |
| The Straits of Mackinac | 45–82 | boat | beginner |  | depth added; ⚠ diver reports only — please confirm | report |
| MV Material Service | 35 | boat | beginner |  | depth added; ⚠ diver reports only — please confirm | report |
| SS Muskegon | 32 | boat | beginner |  |  | wikipedia:SS_Muskegon |

### Not yet profiled

Wrecks still on the map without a profile, mostly because no confirmed depth or
position was found yet: the Chicago-area list wrecks (Flora M. Hill, David Dows,
Silver Spray, Rotarian, Iowa, Louisville…), the Straits of Mackinac group, and
recently found Wisconsin wrecks (F.J. King, Jennibel, John Evenson, Trinidad,
Thomas H. Smith, J.C. Ames). WHS also places the Thomas H. Smith and Trinidad
pins 4–6 km from our positions.
