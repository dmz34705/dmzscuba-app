# Ocean Atlas

Open from Home → Ocean Atlas or Tools → Ocean Atlas. Independent layers show
dive locations, monthly average sea-surface temperature, curated marine life,
and saved logbook coordinates. Search matches sites, regional guides, species,
and mapped dive names. The month selector affects temperature and species;
personal dives include all dates. Temperature defaults to the app's unit setting
and can be changed in the legend. Map preferences are saved locally.

The default view prioritizes the map. The layer button opens five toggles,
species filtering and the temperature legend. Discover and Season open separate
panels; only one panel is visible at a time. Tapping a location opens a compact
card, with an explicit expand/collapse control for its full guide.

## Data and coverage

- **Temperature:** NOAA ERSSTv5 monthly long-term means, **1991–2020**, at the
  original **2° resolution**. Data are encoded in tenths of °C; land/missing
  cells remain null. These are regional surface averages, not forecasts,
  measurements at dive depth, or precise coastal conditions. Display colors
  use bilinear interpolation, with limited infilling from original neighbors
  within two grid cells to remove coarse coastal staircases. This never changes
  the original data or numeric readouts. A detailed land mask clips the colors
  to the ocean and excludes inland lakes. Opacity fades continuously between
  zoom 7 and 10, keeping regional averages out of site-level views.
  Source: https://downloads.psl.noaa.gov/Datasets/noaa.ersst.v5/sst.mon.ltm.1991-2020.nc
  NOAA metadata permits unrestricted access/use. The generator validates
  `time.climo_period` (the file also contains a stale general climatology
  description referring to 1971–2000; that is not the averaging period).
- **Dive sites:** a map-only OpenDiveMap snapshot, the existing offline catalog,
  63 grouped NOAA Florida Keys mooring records, and a curated,
  government-referenced Cozumel reef-area set. Each NOAA group uses its first published mooring coordinate,
  not a calculated dive-entry location. The NOAA download is dated February
  2014, disclosed on every site card. No claim of current mooring availability.
  Source: https://floridakeys.noaa.gov/mbuoy/allmbuoys.html
  The OpenDiveMap snapshot uses its public GeoJSON API and remains under ODbL
  1.0 with record-level attribution. Its community locations can include depth,
  entry, environment and topology metadata. Community data must be confirmed
  locally and never alters automatic logbook location matching. Refresh it with
  `npm run sync:global-dive-sites`; the generated compact snapshot is committed
  so the required derived data remains available and devices never crawl sites.
  When build-network access is unavailable, download the API response and run
  `npm run sync:global-dive-sites -- /path/to/sites.geojson` instead.
  Cozumel names come from CONANP’s park references; those pins are explicitly
  approximate reef-area browsing anchors, never entry, mooring or navigation
  coordinates: https://www.gob.mx/conanp/es/articulos/estrategia-de-conservacion-para-arrecifes-saludables-de-cozumel?idiom=es
- **Ocean regions:** sixteen broad exploration lenses cover the whole ocean by
  selecting the nearest regional anchor. Cards summarize habitat, representative
  wildlife groups and sourced ecosystem context from NOAA, UNEP, the Great
  Barrier Reef Marine Park Authority, New Zealand DOC and the Australian
  Antarctic Program. These are editorial navigation aids, not ecological,
  jurisdictional or species-range boundaries. They never predict presence at a
  tapped coordinate. Region markers disappear beyond zoom 5.5 to keep local
  maps clear. Search and Discover both expose the regional content.
- **Conditions:** every ocean tap includes the selected month plus a 12-month
  surface-temperature profile, coolest and warmest climatological months, all
  from the original NOAA grid. It does not represent current weather, waves,
  visibility, current, sea ice or dive-depth temperature.
- **Seasonal marine life:** eight focused editorial coverage regions. Every species entry includes
  its research, government, conservation, or tourism source. Months denote
  documented encounter windows. Empty months mean seasonality not documented,
  never year-round presence or confirmed absence. Coverage bounds are browsing
  aids, not scientific species range polygons.
- **Basemap:** Natural Earth 1:10 million public-domain land is bundled,
  simplified at 0.01° (about 1.1 km at the equator) and tiled locally using
  geojson-vt. This is below a screen pixel at the regional scales where the
  temperature layer is visible and keeps the inline native WebView payload
  within a reliable mobile startup size. Rings use compact delta encoding and
  are decoded inside the WebView, avoiding a multi-megabyte native bridge
  transfer. The same geometry
  masks the temperature layer. Standard OpenStreetMap tiles stay mounted at
  every zoom, eliminating a previous abrupt zoom-6 renderer switch, with visible attribution,
  normal HTTP caching and an identifying native User-Agent. No tile prefetch,
  offline download or bulk collection. OSM is best-effort; production growth
  should use a contracted tile provider. Detailed tiles need internet; world
  geometry and all data overlays are bundled. Natural Earth is cartographic
  generalization, not survey-grade coastline data; tiny islands and intricate
  coasts can still differ from the online basemap. Neither is a navigation chart.
- **Logbook:** only saved, non-deleted dives with finite, in-range coordinates.
  Co-located dives are grouped and open the existing editable logbook detail
  screen. Edits/deletes refresh the pins when returning. Unconfirmed location
  suggestions and name-only locations are excluded. The WebView receives only
  pin/display fields and IDs; no photos, notes or complete log records. All
  JavaScript is bundled and CSP disallows outbound fetch/XHR. Basemap requests
  disclose the viewed map area to OSM; dive records are never uploaded.

## Maintain and verify

`npm run build:ocean-atlas` downloads source data and rebuilds the data bundle
and local Leaflet JS/CSS strings. Requires `curl`, `unzip`, and the installed
`netcdfjs` dev dependency. Generated files are committed so devices do not need
these tools. Leaflet BSD attribution is retained in `data/LEAFLET-LICENSE.txt`.
Geojson-vt ISC attribution is retained in `data/GEOJSON-VT-LICENSE.txt`.
`node scripts/build-ocean-coastline.mjs` rebuilds the coastline independently;
an optional argument supplies a previously downloaded Natural Earth GeoJSON.
After editing `atlasRuntime.js`, `rendering.js` or `model.js`, run
`npm run bundle:ocean-atlas`.
The runtime is bundled as a source string because Hermes does not preserve
JavaScript function source for `Function.prototype.toString()`.

`npm run test:ocean-atlas` verifies dataset shape, null handling, seasonal
windows, interpolation, dateline continuity, zoom opacity, pin grouping,
deleted/invalid records, and escaping.
`npm run preview:ocean-atlas` serves the exact map document at localhost:8099
for manual responsive/browser interaction checks. Native bridge actions (location,
logbook, sources, Back) run in the Expo app; the standalone preview emits
`atlas-message` events instead. No new native module or API key is required.
Pass an output path after `--` to write the same self-contained HTML instead of
starting a server, for example `npm run preview:ocean-atlas -- /tmp/atlas.html`.

`scripts/verify-ocean-atlas-browser.cjs` optionally runs directly from the built
document with Playwright installed outside the app; no preview server is needed.
Set `PLAYWRIGHT_MODULE` to its module path and `ATLAS_CHROME` to an installed
Chrome executable. It blocks online tiles during automation and
checks coastline masking, persistent tile identity, month updates in place,
fractional zoom transitions, collapsed/expanded panels, interactions, bridge
events, input escaping, phone/tablet layouts, and offline overlays without
collecting provider tiles. Browser checks do not replace a physical-device
pinch/scroll and memory test in the native WebView.

## Get me here (journey planner)

Every site and area card offers **Get me here**. The planner in
`journey.js` works for every location through the same layers, with no
per-destination code required:

1. **Origin** — typed city/airport/address or current location. Typed origins
   are geocoded on-device when allowed (Android needs location permission);
   the text alone still drives flight searches.
2. **Destination** — country (normalized from catalog names/codes; territories
   such as Puerto Rico resolve to the jurisdiction whose airports serve them),
   named dive area within 150 km, reverse-geocoded town, and the nearest
   airports with scheduled service.
3. **Arrival** — the closest airport when it has real connections, otherwise
   the country's best-connected airport first, plus a nearby regional hub when
   all local airports are regional. Origins within ~600 km get an overland
   option. Remote sites (no scheduled airport within 400 km) are flagged for
   liveaboard/charter access.
4. **Dive base** — dive-operator and stay-and-dive options, then final access.
5. **Before you go** — entry rules, flying after diving, cross-border and
   remote-access notes derived from the route.

`destinationProfiles.js` optionally enriches a destination (named routes such
as Cancún → ferry → Cozumel, sourced operators/stays, local considerations).
Operators are never claimed to serve a specific site.

Airports: OurAirports (public domain), large/medium airports with scheduled
service and an IATA code. Connectivity ranks gateways using OpenFlights routes
(ODbL 1.0, dated; never shown as schedules). Rebuild with
`npm run build:journey-airports` and verify with `npm run test:atlas-journey`,
which plans an arrival for every catalog site.

### Flights

"Explore flights" opens Google Flights with both fields filled: the typed or
geocoded starting place (so Google includes every airport around it), or the
home airport code when only coordinates are known (best-connected airport
within 250 km, same country). Dates are left to the traveller.

### When to go & marine life (`seasons.js`)

Shown on every **dive site and dive area card** (the "Get me here" sheet is
travel only). The WebView asks the native side (`siteGuide` bridge message);
the answer renders in the card:

- **Season highlights:** sourced editorial seasons from `regions.js` first
  (e.g. Cozumel eagle rays Dec–Mar; Jupiter lemon sharks Nov–May and goliath
  grouper Aug–Oct), then observation-derived peaks for charismatic groups.
  Distinct seasons stay separate; tapping one moves the month selector to it,
  which also updates the temperature chart.
- **Season bars** aligned with the months, and a "this month" summary.
- **Marine life seen here:** photo gallery of the most-recorded species nearby.

### Pins and labels

Tapping a pin group zooms to fit its sites (it lists them only when they cannot
separate further). From zoom 7 (coast level), individual site pins show their
name and groups of five or fewer list all their site names (tap a name to open
that site; tap the bubble to zoom). Labels sit right side first, then left, only where the label fits without covering
another label, pin, group bubble or map control, and never off-screen. Names
over 22 characters are shortened. A pin tap never also counts as an empty-map
tap (a touch echo at the same spot within 0.5 s is ignored).

### OpenStreetMap dive spots (`data/osmSites.json`)

`node scripts/import-osm-dive-sites.cjs [overpass.json]` adds named dive spots
from OpenStreetMap (© OpenStreetMap contributors, ODbL 1.0): features tagged
`scuba_diving:divespot=yes` or `sport=scuba_diving` on a physical feature.
Businesses and facilities (dive centres, shops, clubs, schools, pools, hotels,
"dive base" names) and unnamed features are dropped, and anything within 150 m
of an existing site (1.5 km with a similar name) is treated as a duplicate.
Depth, entry, site type and difficulty come from `scuba_diving:*` tags. A spot
more than 3 km inside a landmass is marked freshwater (no ocean temperature or
satellite clarity). Each site links to its OSM object. Sourcing ideas for
further imports are in `docs/DIVE_SITE_SOURCING.md`.

### Supplementary sites (`data/extraSites.json`)

`node scripts/import-extra-dive-sites.cjs` adds, de-duplicated against the
catalog and the OSM import:
- NOAA Thunder Bay National Marine Sanctuary moored shipwrecks (depth, position,
  sanctuary page; US public domain);
- Wikipedia facts (title, coordinates, link) from the "Underwater diving sites"
  category tree, National Register shipwrecks in lake states and the
  "Shipwrecks of Lake …" categories;
- Wikidata (CC0) shipwrecks in the Great Lakes;
- a curated list of well-known US inland sites (`scripts/data/us-inland-dive-sites.json`,
  names/state/kind only) positioned with OpenStreetMap Nominatim, state-checked;
  unresolved names are dropped. Its kinds also become `kindHints` (e.g. Mermet
  Springs is a quarry).
The Edmund Fitzgerald (legally closed to divers) is excluded. The Wisconsin
Historical Society's shipwreck layers are **not** imported: their licence
forbids redistribution without SHPO permission.

Wreck pages without a primary coordinate use their inline position (the Prins Willem V off Milwaukee);
positions only to the nearest 0.1° are dropped. Wikipedia's Great Lakes shipwreck lists (Lake Michigan,
Superior, Huron / Erie / Ontario, and the Wisconsin Shipwreck Coast and Thunder Bay sanctuaries) add
located wrecks with no article of their own (`wikilist`, linking the ship's article or the list row);
hulls sunk as breakwaters or docks are skipped. Notable wrecks worldwide (`notable`): Wikidata shipwrecks
with an English Wikipedia article whose position lies in 100 m of water or less, or on the shoreline (NOAA
DEM_all / ETOPO sample). Wrecks legally closed to divers (Edmund Fitzgerald, USS Arizona, USS Utah, HMS Royal
Oak, SS Richard Montgomery) are never listed — from any source: `catalog.js` `CLOSED_WRECKS` hides them in the
app and on the map (the Edmund Fitzgerald is also an OpenStreetMap record), and neither are ships no longer on the bottom: Wikidata
records a ship-breaking event (Costa Concordia) or a museum / preserved-vessel type (H. L. Hunley, Mary Rose,
SS Valley Camp) — unless the article says it was later sunk as an artificial reef (USCGC Tamaroa). Links are
compared as article titles, since Wikidata and Wikipedia percent-encode them differently. Every wreck whose article Wikidata gives a heritage designation — or whose name is a
naval one — gets a card note (column 11): "Protected wreck (UK Protection of Wrecks Act) — diving needs a
licence", "Protected military wreck … may be prohibited", "Naval wreck — it may be a war grave", or "Listed
historic wreck … look, but don't disturb"; a merged site keeps the protection note. Ids are stable between runs — a row keeps its id
(matched by source and link) and new rows get new ids — because merges, photos, facts and depths are
keyed by them.


### Dive operators & stay-and-dive (`data/diveOperators.json`)

`node scripts/build-dive-operators.cjs` collects named dive shops, dive centres,
dive clubs and lodging tagged for scuba diving from OpenStreetMap (© OpenStreetMap
contributors, ODbL). "Get me here" lists the ones within 30 km of the site
(else the three nearest within 80 km) **strictly by distance, closest first** —
never ranked or sponsored — with type, website (or the OSM listing) and phone
when mapped. Hand-sourced destination-profile entries (Cozumel, Florida Keys)
follow, de-duplicated by name. With nothing nearby, only the external search
links show. A named dive area now labels a site only within 40 km.

### Inland (freshwater) guides (`inland.js`)

Sites marked freshwater/quarry, or more than 3 km inside a landmass larger than
5,000 km², get a separate guide (pins deep inside small islands such as Aruba or
Cozumel are the island's centre standing in for ocean sites, not lakes): "Freshwater dive site", water type (quarry, lake, spring, flooded
mine, lake wreck, geothermal), altitude (above 1,000 ft / 305 m flagged as an altitude dive),
estimated water through the year (surface from local air temperature, damped in
hot climates, never below 4 °C, ice months flagged; springs and mines steady near
the mean annual air temperature; geothermal warm), a thermocline note with a
separate below-thermocline suit, seasonal visibility guidance and freshwater life
(fish, turtles, crayfish, mussels, freshwater jellyfish, sponges, mudpuppies).
Data: `node scripts/build-inland-conditions.cjs` (Open-Meteo elevation at each
site; NASA POWER air-temperature climatology per 0.1° cell) and
`node scripts/build-freshwater-life.cjs` (iNaturalist, openly licensed photos).
Species lists merge every sampled area that overlaps the site (fish first). Where
those are thin — offshore Great Lakes wrecks — the nearest well-sampled shore within
60 km is added, each species labelled with its distance; those don't count toward
the freshwater-life rating. Wikipedia places that aren't wrecks or inland water
(towns, parks, islands — pinned at their centre) count as inland only more than
15 km from the coast; `build-inland-conditions.cjs` uses the import's decision for
supplementary (`x-`) sites.
No ocean temperature, satellite clarity or ocean-region content is shown.

### Maximum depth (`data/publishedDepths.json`)

Each record's own depth (OpenDiveMap, OpenStreetMap `scuba_diving:maxdepth` / `maxdepth` /
`wreck:depth` / `depth` tags, NOAA moorings) is used first. `node scripts/build-published-depths.cjs
<osm-overpass.json>` (cached) fills gaps from the linked Wikipedia article's lead ("lies in 90 feet
(27 m) of water", "maximum depth of 40 m", fathoms included) — or, when the lead has none, the
article's wreck / diving / sinking / discovery sections, skipping design and specification sections,
lists of ships lost there, sentences about the hull, draft or size, and (for a reef or cave) the
sections about ships; the deepest statement wins, so the seabed beats the top of the wreck (the
Andrea Doria: "lying on the bottom at 73 m") — or Wikidata vertical depth (P4511). Articles come
from the site's own link, the site-facts match, or, for wrecks, caves and springs, a Wikipedia search
whose article has the identical core name, lies within 25 km and is about a vessel, wreck, cave or
spring. Only a depth in the site's own record skips the lookup, so re-running never drops the
previous run's finds. It also applies
operator/agency-posted depths recorded in `scripts/data/us-inland-dive-sites.json` (`maxDepthFt`
+ `depthSource`, matched to the map site by name within 3 km — these win over other figures).
Articles about areas (islands, bays, reef systems) are skipped; a lake's deepest point is
flagged and shown as "Lake's deepest point", never as the dive's depth, and is left out of the
experience rating and regional depth ranges. For quarries, lakes, springs and reefs the maximum
only raises the experience level so far (divers pick their depth); a wreck's depth counts in full.

### Units

The map follows the app's length setting (Settings → depth unit): feet shows ft, mi and sq mi;
metres shows m, km and km² (`units.js`, mirrored in `atlasRuntime.js`). Altitude diving applies
to sites **above 1,000 ft (305 m)**; at or below that the guide says it's a normal dive.

### Links

Links leave the app, so the atlas only follows a deliberate tap: not the end of a swipe or
scroll, and not a tap that stops a gliding scroll. Species cards carry a small "iNaturalist ↗"
link instead of being links themselves; a site photo links only from its credit line.

### Site photos (`data/siteImages.json`)

Every listed site (merged-away duplicates resolve to the site they became).
`node scripts/build-site-images.cjs <osm-overpass.json>` (cached; `SITE_IMAGES_CACHE=dir`)
takes, in order: the Wikipedia article's lead image, the Wikidata item's
image (P18), OpenStreetMap `image` / `wikimedia_commons` tags, then Commons photos
geotagged within 500 m. Every file must be public domain, CC0, CC BY or CC BY-SA
(checked through Commons `imageinfo`) and is shown with its author and licence,
linking to the Commons file page. Matching rules, applied the same way everywhere:
Wikipedia/Wikidata images must name the vessel or place (this drops sister-ship
stand-ins such as SS Mesaba on the Mohegan article); geotagged photos must contain
the whole site name, must say "cave", "wreck", "quarry", "spring" or "mine" when
the site's name does, must not be about something else (maps, signs, churches,
streets, plants, birds, food, hotels, homes …) unless that word is the site's own name
("Camp Cove", "Casa Cenote"), and the title closest to the plain site name wins. A kind in the
name — "Arashi (Wreck)", "Mornington Pier" — must show in the file name (a ship prefix such as
SS / MV / RMS counts for a wreck); a wreck or cave photo is refused for a site that is neither;
a one-word name that is only a town ("Aruba", "Ludwigshafen") needs a water word in the file
name or a file named exactly after it. Photos only: SVG / PDF files and maps, locators, street
and hotel scenes are refused from every source.
`SITE_IMAGES_REVIEW=out.tsv` writes every match for a manual look.

### Duplicate sites (`data/siteMerges.json`)

The same site listed by several sources (OpenDiveMap, OpenStreetMap, NOAA, Wikipedia /
Wikidata, curated lists) becomes one. `node scripts/build-site-merges.cjs [--review out.tsv]`
matches names after folding accents, case, generic words ("reef", "dive site", "punta") and a
trailing known place ("Great Blue Hole - Belize"); the core words must be equal, allowing a
one-letter slip in words of six letters or more. A wreck never merges with a reef of the same
name, and numbers must agree ("Wreck 1" ≠ "Wreck 2"). Records must lie within the distance
their sources can be trusted to (a NOAA mooring 0.5 km, OpenDiveMap 1.5 km, a Cozumel reef
area 4 km); distinctive names seen at most four times may be 6 km apart (10 km with an
article pin or reef area) — but only across different sources, since one source's two far-apart
"Barco Hundido" pins are two places. Each cluster keeps the most authoritative name, the most
precise position and the best-sourced depth; `catalogSites()` hides the rest and
`catalogSite(oldId)` still resolves them. Cards say "Confirmed by N independent sources · also
listed as …", or "One community source — confirm the exact spot locally".

Ship prefixes and wreck words don't count in a name ("SS Wexford" = "Wexford (Wreck)", "Ottawa (tug)" =
"Ottawa"), word order doesn't matter ("Wazee Lake" = "Lake Wazee"), and a bracketed year only separates two
dated ships ("New Orleans (1838)" ≠ "(1885)"). A name saying "wreck" never merges with one that doesn't unless
both are wrecks ("Moonhole" reef ≠ "Moonhole Wreck"). Records linking the same Wikipedia article are one site
up to 60 km apart (Wikipedia and Wikidata pin the Gallinipper 24 km apart).


### About this site (`data/siteFacts.json`)

`node scripts/build-site-facts.cjs` (cached) reads, for sites with a Wikipedia article or
Wikidata item, the article's lead cut to whole sentences (≤ 420 characters, abbreviation-safe;
town and district articles skipped) and, for vessels, Wikidata's ship facts: type, builder, flag,
length, beam, gross tonnage and launched / commissioned / sank / wrecked years. Summaries are
credited "From Wikipedia · CC BY-SA 4.0" and link to the article; ship facts (CC0) link to the
Wikidata item. Lengths follow the depth unit.

### Protected areas (`data/siteProtection.json`)

`node scripts/build-site-protection.cjs` (cached per batch; `SITE_PROTECTION_CACHE=dir`) asks
Overpass which OpenStreetMap protected areas contain each site (`is_in`, 100 sites per query):
`boundary=protected_area` / `national_park` / `marine_protected_area` and `leisure=nature_reserve`,
keeping IUCN classes 1–7 and international designations (97–99); fishing and zoning layers,
code-only or designation-only names ("Marine Protected Area") and zones outside a park (buffer,
"aire d'adhésion") are dropped. Up to three per site: marine areas first, then the most specific —
an area holding few sites before a whole-sea whale sanctuary. Designations are shown in plain
English ("Naturschutzgebiet" → "Nature reserve"). The card names the
area and its designation and links to its website or OSM page, with a reminder that parks often
have diver rules (fees or tags, mooring-only boats, no touching or collecting); it never states
the rules itself. WDPA / Protected Planet is not used: its licence forbids commercial use.

Protected areas, shore facilities and lake water areas are looked up through `scripts/lib/overpass-per-site.cjs`,
which caches Overpass answers per site: adding or merging sites costs a query for just those sites, not a re-run
of every batch after them.


### Estimated depth from the seafloor (`data/siteSeafloor.json`)

`node scripts/build-site-seafloor.cjs [--review out.tsv]` (cached; NOAA's DEM_all image service first, one
request per site, CoastWatch ERDDAP as the fallback; an unreachable site is skipped, not fatal) reads NOAA ETOPO 2022
(15″ global relief, public domain, CoastWatch ERDDAP `ETOPO_2022_v1_15s`) in a 5 × 5-cell window
(about ±900 m) around each ocean pin: depth at the pin and the shallowest and deepest water
nearby. Coastal cells blur reefs and walls (a Bali shore wreck reads 95 m), so the card shows it
only for sites with **no published depth**, only where water of 40 m or less lies nearby, and caps
the range at "40+ m" / "130+ ft". It fills the at-a-glance depth tile and the facts row as
"Depth · estimated", saying there is no published depth for the site and the figure comes from NOAA
seafloor data around it. It is not fed into the experience rating (a range around a pin is not the
dive's depth). `--review` lists published depths
far deeper than any seafloor nearby (a wrong pin or a wrong figure) for a manual look.

### Depth without a published figure (`data/siteBathymetry.json`, `data/siteLakeDepths.json`, `nearbyDepths.js`)

A published depth always wins. Otherwise the card's depth tile shows the most specific estimate,
named as such, with the next best as a second line (and both in the facts row):

1. **Lakes** — `node scripts/build-site-lake-depths.cjs <HydroLAKES_polys_v10.shp> <GLOBathy ALL_LAKES.csv>`
   (needs the `shapefile` package on `NODE_PATH`; HydroLAKES CC BY 4.0, GLOBathy CC0). A site lying in a
   HydroLAKES lake (≥ 10 ha), or an inland site within 300 m of its shore, gets that lake's deepest point:
   published first — the Wikidata vertical depth (P4511) of the OSM water area it lies in or beside —
   otherwise GLOBathy's modelled maximum, labelled estimated. GLOBathy is far off for some deep Alpine
   lakes (Starnberger See 32 m modelled vs 127 m measured), which is why Wikidata comes first; rows whose
   mean exceeds the maximum are dropped. Lakes over 1,000 km² (the Great Lakes, Champlain, Ladoga) are skipped:
   their deepest point says nothing about a dive, and nearby sites' depths say more. A lake matched only beside the pin is refused when its published
depth is over 8× the mean depth of the lake the pin lies in (a quarry pond beside a deep lake). Always
"Lake's deepest point", never the dive's depth.
2. **Fine seafloor** — `node scripts/build-site-bathymetry.cjs` samples NOAA NCEI coastal DEMs (US coasts,
   Hawaii, territories; only layers of 3″ or finer — the service otherwise falls back to ETOPO) in a 5 × 5
   grid, and EMODnet Bathymetry (European waters, ~115 m cells, each with its surveyed min / max) in a
   3 × 3 grid, about ±300 m around the pin. Same 40 m display rule as below.
3. **Nearby sites** — `nearbyDepths.js` (computed on the device): the depths published for sites of the
   same water (salt / fresh) within 25 km, at least three; the middle half of them when there are five or
   more, else their full range. Lakes' deepest points are never used.
4. **Coarse seafloor** — ETOPO 2022 (below), only when there's no fine seafloor.

None of these feed the experience rating.



Where iNaturalist has fewer than four animals near an ocean site,
`node scripts/build-marine-life-obis.cjs` (cached) groups those sites within 40 km and reads OBIS's
species checklist (IOC-UNESCO survey and specimen records) for the surrounding box: the most
recorded sharks & rays, turtles, marine mammals, cephalopods and nudibranchs, then fish. Names and
openly licensed photos come from iNaturalist taxon pages. Same shape as `marineLife.json`;
`seasons.js` adds the nearest survey place to a site's nearest sighting place, a species already
seen by divers keeps its sighting data, and survey records never claim a season ("Recorded in
surveys", "N survey records").

### At the shore (`data/siteShore.json`)

For every site not marked as a boat dive, `node scripts/build-site-shore.cjs` (cached) finds the
nearest mapped parking (public), toilets, showers, drinking water, slipway, pier / jetty and beach
within 250 m in OpenStreetMap. The card lists what's mapped with its distance; absent means not
mapped, not absent.

### Visibility estimate (`visibility.js`, `data/visibility.json`)

`node scripts/build-visibility.cjs` (cached, ~35 min) samples NOAA CoastWatch
VIIRS Kd490 (global 4 km monthly, ERDDAP `nesdisVHNSQkd490Monthly`) every 13
pixels for 2017–2024 and keeps the median per month-of-year, only for cells used
by a salt-water site. The app converts Kd490 → Kd(PAR) (Morel et al. 2007) →
Secchi depth ≈ 1.7 / Kd(PAR) and shows a ±25% range, labelled as an estimate for
offshore surface water. Freshwater sites show none. The temperature grid is now
stored packed (lossless, `model.packTemperatureMonth`) to keep the inline map
document small.

### Ratings (`ratings.js`)

Site and area cards show an **At a glance** block (and a one-line summary on the
compact card). All are estimates with their reasons shown:

- **Major marine life (1–5★, per month):** share of local iNaturalist sightings
  that are sharks/rays, sea turtles or marine mammals, weighted by each animal's
  monthly pattern; +1★ when a sourced seasonal highlight is on; capped at 3★ when
  there are fewer than 15 major records. Thresholds `STAR_SHARES` put 5★ at
  roughly the top tenth of sites.
- **Experience (Beginner → Technical):** published max depth, drift/current (site
  tags or a destination profile's `conditions`), wall, cavern/cave, cold water
  and remoteness. Marked *estimated* when no depth is published. Review sites
  (TripAdvisor, ScubaBoard) are not scraped; curated, cited notes can be added to
  destination profiles.
- **Travel:** from the journey planner — distance from the traveller plus steps
  (legs), ferries, cross-border connections, regional airports and remoteness.
  The start is the last "Get me here" starting point or the device's last known
  position (never prompts; stored on the device only). Without one it rates the
  site's own airport access.
- **Water · month:** the month's surface temperature (or an inland site's surface
  and deep water). What to wear comes from **Gear for this dive**, which matches the
  diver's own gear locker, not a generic exposure line.

The WebView runtime is minified at bundle time (`bundle:ocean-atlas`, terser) to
keep the inline document under the 2 MB WebView budget; the atlas test checks a
source hash instead of the raw text.

### Motion

Pins are diffed between redraws (keyed by the sites in each group): unchanged
markers stay in place, new ones fade/scale in and removed ones fade out, and
fading pins never take taps. Labels keep their previous side and priority, hide
during a zoom and fade back once it settles. Camera moves (open a site or place,
tap a group, Discover regions, world, my location) use fly/pan animations that
land the target centred above the card; region pins redraw only when crossing a
zoom band; basemap tiles fade in. `prefers-reduced-motion` turns animations off.

### Quick look (tap anywhere without a pin)

An empty-map tap opens the normal compact card **and** a popup at the tapped
point (`quickLook` bridge message): up to four photos of the most-seen marine
life (sourced seasons first; the nearest marine-life sample within ~400 km; in
open water, the surrounding ocean lens), this month's surface temperature, dive
sites within 50 km, what is in season this month, and a shortcut to the nearest
site. The separate seasonal-wildlife map pins were removed; their content lives
in the site, place and region guides.

### Destination guides (`places.js`)

Tapping land opens a guide for the most specific place: **island › US state ›
country**. Breadcrumbs widen the scope (Cozumel › Mexico); country guides list
their states/islands. Each guide shows mapped site count and typical depths,
"what the diving is like" (site features, shore vs boat entry), temperature,
the combined seasons and marine life of all its sites, featured dive areas,
every dive site (tap to open), and Get me here. Site cards show the same
breadcrumbs.

**Ocean lenses and dive regions** (Caribbean Sea, Tropical Eastern Pacific…,
and the Discover dive regions) get the same treatment via `regionGuide`: site
and country counts, what the diving is like, signature encounters (each labelled
with where it is best recorded), a 20-species gallery, featured dive areas and
top islands/countries. Lens membership is the nearest anchor within 3,000 km;
dive areas count too, so thinly catalogued regions (e.g. Japan) still have
wildlife. Catalog "marine" records with no ocean within a few hundred km are
treated as bad data and left out of place guides.

Outlines: `data/places.json` from `npm run build:atlas-places` — Natural Earth
1:50m countries and US states (public domain) and islands = bundled coastline
landmasses under 40,000 km² with dive sites around them, named from the
OpenStreetMap island containing them (© OpenStreetMap contributors, ODbL, via
Overpass). Site membership is computed on device: catalog country (unless the
site lies far from that country, i.e. a territory such as Puerto Rico), nearest
US state within 60 km, island within 15 km. Verify with
`npm run test:atlas-places`. Photos load from iNaturalist/Wikimedia hosts,
which the WebView CSP allows for images only.

`data/marineLife.json` comes from `npm run build:marine-life` (resumable, cached;
~1 request/second to iNaturalist, allow 1–3 hours). It covers every dive area
and every 40 km cluster of catalog sites. Monthly patterns are normalized by all
marine records in the same place and smoothed; a peak is claimed only for one
contiguous 2–6 month run with ≥ 40 records. Photos are CC0 / CC BY / CC BY-SA
only (iNaturalist, falling back to the Wikimedia Commons lead image), always
with attribution. Add a sourced season to `regions.js` to override the data.

## Gear for this dive

Site and featured-area cards show a **What to wear · month** card right after the
at-a-glance tiles: the exposure starting point for that month's water (e.g. "3–5 mm
wetsuit"), the water it is for, and one short reason — full-length coverage on wrecks,
cold below a lake's thermocline, or a deep site (published depth ≥ 30 m) whose bottom can
be far colder than the surface. Tapping it ("Match it to my Gear Locker →") opens the
native planning sheet; destination (place) cards show the same card without a starting
point. The siteGuide reply carries the twelve monthly starting points, already adjusted
natively for the diver's comfort preferences (drysuit threshold, running cold or warm) and
refreshed when the sheet closes. The map sends only location identity and the selected
month; native code resolves catalog facts. The Gear Locker inventory and the raw
preferences never enter the WebView — only the resulting starting point and whether it
was adjusted. Preferences live separately at `@dmz-scuba/gear-advice/v1` on this device
and can also be edited from the locker. Proposals never write gear state, move
floating gear, change accessory choices or mark a setup complete.

`exposure.js` separates thermal demand from full-length contact protection.
Generic bands are starting points, not suit ratings: below about 60°F favors a
drysuit with insulation; warm water allows lighter protection, while wreck/rock
overheads favor full coverage. Deep lake/quarry/wreck dives (18 m+) conservatively
favor dry insulation when bottom temperature is unknown, including when surface
water is warm. Whole-lake maximum depth is not treated as dive depth; springs and
geothermal water are not assigned the lake thermocline rule. An entered planned
depth or confirmed bottom temperature takes precedence. Broad locations remain
approximate; select a specific site before relying on its depth or terrain.

Divers can run cold, typical or warm: cold/warm shifts provisional thermal
guidance and the drysuit threshold by +2/−2°C respectively, never the measured
water temperature. This is an app preference, not a validated physiological
model. Saved comfort ranges and explicit combinations take priority (with a
warning if they differ from the drysuit starting point). The older `runsCold`
preference migrates to `thermalTendency: 'cold'`.

Divers can use simple suit comfort ranges or explicit temperature combinations
containing one suit, multiple undergarments, hoods and gloves. The very
cold-sensitive template is opt-in and starts with **no selected gear**; it is
never the default for other divers. Combination intervals include their lower
bound and exclude their upper bound. The first available matching combination
wins; otherwise matches are provisional and missing pieces are called out.
Unknown deep-water temperatures do not select a combination from warm surface
data. Gear with condition/overdue-service problems is excluded, not silently
treated as ready. Linked accessories stay included and overlapping alternatives
are flagged for review.

Rig matching begins with saved setups and the diver's declared uses. Technical
and overhead matches require explicit designation; neither depth, wreck topology
nor owning doubles establishes training or an appropriate gas plan. Suggestions
show exposure substitutions, packing gaps and floating-gear moves to review.
This is not decompression, gas, certification or equipment-compatibility planning.

Thermal rationale: [DAN: Avoid the Chill](https://dan.org/safety-prevention/diver-safety/divers-blog/avoid-the-chill/)
and [DAN: Get Wet, Dive Dry](https://dan.org/alert-diver/article/get-wet-dive-dry/).
Temperature bands and the opt-in comfort template are app planning preferences,
not thresholds endorsed by DAN. Tests: `scripts/verify-gear-advice.cjs` (included
in `test:gear-checklist`) plus the Atlas journey checks.
