# Dive Site Sourcing Blueprint — inland US & Great Lakes

How and where to find inland US dive sites (spring-fed quarries, flooded mines,
dive parks) and Great Lakes shipwrecks for the Ocean Atlas catalog. Every source
below was checked to exist (September 2026). URLs change; re-verify before an
import.

## Ground rules for anything we import

| Tier | What | Examples | How we use it |
|---|---|---|---|
| **A · Open data** | Public domain / open licence, machine-readable | NOAA, USGS, NPS (unrestricted), OpenStreetMap (ODbL), Wikidata (CC0) | Import directly with attribution. State-government data is **not** automatically public domain — check each portal's terms. |
| **B · Published for divers** | Agency or society pages that publish positions *for recreational diving* (preserves, sanctuaries, mooring buoys, water trails) | Wisconsin shipwreck site, NYSDEC preserves, Thunder Bay buoys | Copy only facts (name, position, depth, access), cite the page, prefer asking permission for bulk use. |
| **C · Leads only** | Forums, club pages, charters, commercial directories, reviews | ScubaBoard, TripAdvisor, dive-club rosters | Use to discover *names*; confirm each site via Tier A/B before it enters the catalog. Never bulk-copy text or reviews. |

- **Protected archaeology:** the National Register deliberately withholds restricted
  archaeological locations, and many states protect wreck positions. Only publish
  wrecks an agency already publishes for divers; tag them `protected` (look, don't take).
- **Access:** many quarries are private. Only list sites with public or commercial
  dive access, and record it (`access: public | fee | club | permit | closed`).
- **Personal data:** dive-club rosters and member spreadsheets are off-limits even
  if a search finds them — take site names only, never people.
- **De-duplication:** match against the catalog by ≤ 150 m and name similarity;
  keep the best-sourced coordinate and merge depth/entry fields.

---

## A. Wrecks — Great Lakes & inland waters

### 1. Agencies and registries

| Scope | Source | What it has |
|---|---|---|
| US-wide | [NOAA Office of Coast Survey — Wrecks and Obstructions](https://nauticalcharts.noaa.gov/updates/access-to-wrecks-and-obstructions/) | ~13,000 wrecks + 6,000 obstructions from ENC and AWOIS; ArcGIS REST, WMS, KML, Excel. Includes Great Lakes. Charting data — confirm a wreck is a recreational dive. |
| US-wide | [NPS National Register — spatial data](https://www.nps.gov/subjects/nationalregister/data-downloads.htm) | ~100k listed properties including shipwrecks; public layers contain **unrestricted** records only. |
| Michigan | [EGLE Michigan Underwater Preserves](https://www.michigan.gov/egle/about/organization/water-resources/submerged-lands/shipwrecks/michigan-underwater-preserves-sites) · [Michigan Underwater Preserves council](https://www.michiganpreserves.org/thunder-bay-underwater-preserve/) | 13 preserves, ~7,200 sq mi of bottomland; per-preserve site lists. |
| Michigan (federal) | [Thunder Bay National Marine Sanctuary](https://thunderbay.noaa.gov/shipwrecks/) · [buoy locations dataset](https://noaa.hub.arcgis.com/datasets/noaa::buoy-locations-and-status-for-thunder-bay-national-marine-sanctuary/explore?showTable=true) | 50+ moored wrecks; buoy positions as CSV/GeoJSON/API (seasonal, ~May 15–Oct 1). |
| Wisconsin | [Wisconsin Historical Society — maritime preservation](https://wisconsinhistory.org/preserve/state-historic-preservation-office/state-archaeologist/maritime-preservation/) · [WisconsinShipwrecks.org](https://www.wisconsinshipwrecks.org/Files/Wisconsins%20Historic%20Shipwrecks.pdf) | 651 historic losses; shallow-water wreck positions published on the Lake Michigan State Water Trail / State Lands Access Map. Also Wisconsin Shipwreck Coast NMS. |
| Ohio | [Ohio Shipwreck Inventory (SHPO)](https://www.ohiohistory.org/preserving-ohio/survey-inventory/ohio-shipwreck-inventory/) · [Ohio Coastal Atlas](http://coastal.ohiodnr.gov/atlas) · [Ohio Sea Grant shipwreck trail](http://www.ohioshipwrecks.org/ShipwreckMap.php) | ~100 inventoried wrecks; atlas shipwreck layer; 33 interpreted Lake Erie wrecks. |
| New York | [NYSDEC Submerged Heritage Preserves](https://dec.ny.gov/places-to-go/submerged-heritage-preserves-program) · [diving guidelines](https://dec.ny.gov/things-to-do/boating/shipwreck-preserves-diving-guidelines) | Lake George: Sunken Fleet of 1758, Forward, Land Tortoise (registration required). |
| NY / VT | [Lake Champlain Underwater Historic Preserves](https://historicsites.vermont.gov/underwater-preserves) | 9 designated wreck sites (1 NY, 8 VT). |
| Minnesota | [MNHS — Minnesota's historic shipwrecks](http://www.mnhs.org/places/nationalregister/shipwrecks/) · [Lake Superior shipwrecks MPDF](https://mn.gov/admin/assets/Minnesota's%20Lake%20Superior%20Shipwrecks%20MPDF_tcm36-445054.pdf) | National Register-listed Lake Superior wrecks (e.g. Thomas Wilson, Madeira). |

### 2. Advanced search (copy-paste)

```
site:.gov "underwater preserve" filetype:pdf (latitude OR "GPS" OR "N 4")
site:.gov "shipwreck" "mooring buoy" (GPS OR latitude) -site:wikipedia.org
"shipwreck" "dive" ("N 4" OR "N4") ("W 8" OR "W8") filetype:pdf
site:noaa.gov "shipwreck" ("depth" "feet") filetype:pdf
"water trail" shipwreck (GPS OR coordinates) site:.gov
(site:arcgis.com OR site:hub.arcgis.com) shipwreck
inurl:"/rest/services" (shipwreck OR wreck) (FeatureServer OR MapServer)
"Multiple Property Documentation" shipwrecks filetype:pdf
```

### 3. Services and geoportals

- **NOAA wrecks (ArcGIS REST):** `https://wrecks.nauticalcharts.noaa.gov/arcgis/rest/services/public_wrecks/Wrecks_And_Obstructions/MapServer` — query a layer with `/query?where=1=1&geometry=<Great Lakes bbox>&geometryType=esriGeometryEnvelope&outFields=*&f=geojson`.
- **Marine Cadastre:** [hub dataset](https://hub.marinecadastre.gov/datasets/wrecks-and-obstructions) and REST folder `https://maps2.coast.noaa.gov/arcgis/rest/services/MarineCadastre/`.
- **NOAA Hub:** `https://noaa.hub.arcgis.com/` (sanctuary buoy/shipwreck layers, GeoJSON/WFS).
- **NPS open data:** [NRHP Locations](https://public-nps.opendata.arcgis.com/maps/18fe4b262473496a8ca7871a67d844ee) — filter to shipwreck resource types.
- **State hubs:** [Michigan EGLE Maps & Data](https://gis-egle.hub.arcgis.com/), Ohio Coastal Atlas, Wisconsin DNR open data.
- **Discovery across all ArcGIS Online orgs:** `https://www.arcgis.com/sharing/rest/search?q=shipwreck%20type:%22Feature%20Service%22&num=100&f=json` — then inspect each hit's licence.
- **OpenStreetMap (Overpass):** `historic=wreck`, `seamark:type=wreck`, and `sport=scuba_diving` + `scuba_diving:divespot=yes` within the Great Lakes bbox.

### 4. Communities (Tier C leads)

- [Michigan Shipwreck Research Association](https://www.michiganshipwrecks.org/shipwrecks-2) — finds and documents Lake Michigan wrecks.
- [Wisconsin Underwater Archeology Association](https://www.wpr.org/culture/wisconsin-citizen-scientists-searching-shipwrecks-plymouth) — citizen-science wreck searches.
- Great Lakes Shipwreck Preservation Society (Minnesota / Lake Superior).
- [National Museum of the Great Lakes — research](https://nmgl.org/research/) and [Brendon Baillod's Great Lakes Shipwreck Research](http://www.baillod.com/shipwreck/about.html).
- [Wisconsin Maritime Museum online resources](https://www.wisconsinmaritime.org/collections/online-resources/).
- [ScubaBoard regional forums](https://scubaboard.com/community/forums/central-united-states.590/) and local charter trip reports — names and conditions only, confirm positions elsewhere.

---

## B. Quarries, flooded mines, springs & dive parks

### 1. Agencies and registries

| Source | Use |
|---|---|
| [USGS MRDS](https://mrdata.usgs.gov/mrds/) and [USMIN](https://www.usgs.gov/centers/gggsc/science/usmin-mineral-deposit-database) | Public-domain quarry/mine points and topo-map mine features (quarries, open pits, shafts, gravel pits). **Candidate generator only** — a quarry point is not a dive site. |
| USGS The National Map — GNIS names and NHD waterbodies | Intersect MRDS/USMIN quarry points with NHD waterbodies to flag *flooded* quarries as candidates. |
| State DNR park and lake listings (e.g. [Indiana DNR locations](https://www.in.gov/dnr/places-to-go/indiana-dnr-locations/), [Indiana lakes listing](https://www.in.gov/dnr/fishwild/files/Indiana_Lakes_Listing_By_County_March_2007.pdf)) | Public parks and lakes that allow or permit scuba (e.g. France Park, IN; Chillicothe gravel pits, IL). |
| NPS / state historic registers | Flooded historic mines listed as sites (check restrictions). |

Known Midwest dive venues to seed confirmation (per [Scuba Diving](https://www.scubadiving.com/great-quarry-diving-in-midwest), [Midwest Diving](https://www.midwest-diving.com/scuba-training-sites), [MWUE](https://www.mwue.org/useful-info)): Mermet Springs and Haigh Quarry (IL), Philips Quarry and France Park (IN), Roubidoux Spring (MO, cave-certified only). Confirm each venue is still operating before listing it.

### 2. Advanced search (copy-paste)

```
"quarry" (scuba OR "dive park") ("rules" OR "waiver" OR "site map") filetype:pdf
site:.gov (scuba OR "scuba diving") (quarry OR "gravel pit" OR lake) (permit OR allowed) park
site:.gov "scuba" "entry" (quarry OR lake) "site plan" filetype:pdf
("dive site" OR "dive sites") (filetype:kml OR filetype:kmz)
"underwater" ("training platform" OR "sunken bus" OR "sunken boat") quarry (IL OR IN OR KY OR MO OR OH)
"flooded mine" (scuba OR "dive") (tour OR certification) -site:pinterest.com
intitle:"dive sites" (quarry OR springs) (Illinois OR Indiana OR Kentucky OR Missouri OR Ohio)
```

Club spreadsheets (`filetype:xls OR filetype:xlsx "dive sites"`) can surface local names — extract **site names only**, never member data.

### 3. Services and geoportals

- **USGS MRDS / USMIN** downloads (CSV, shapefile, WFS) from [mrdata.usgs.gov](https://mrdata.usgs.gov/).
- **NHD / GNIS** via The National Map downloads (public domain).
- **State park ArcGIS hubs** — search `site:hub.arcgis.com (DNR OR "state parks") (scuba OR diving)` and the ArcGIS Online search endpoint above with `q=scuba`.
- **OpenStreetMap (Overpass):** `sport=scuba_diving`, `scuba_diving:divespot=yes`, `landuse=quarry` intersecting `natural=water`; read `scuba_diving:depth` and `scuba_diving:difficulty` when present ([tag docs](https://wiki.openstreetmap.org/wiki/Tag:sport=scuba_diving)).

### 4. Communities (Tier C leads)

- [ScubaBoard — Central United States](https://scubaboard.com/community/forums/central-united-states.590/) and neighbouring regional forums.
- [Midwest Underwater Explorers](https://www.mwue.org/useful-info) and local dive-shop "training sites" pages.
- State/regional dive councils and cave-diving organisations for springs (cave-certified sites must be flagged as such).

---

## Candidate → catalog workflow

1. **Collect** Tier A layers and Tier B pages into a staging table with `source`, `licence`, `url`.
2. **Generate** quarry candidates (MRDS/USMIN ∩ NHD) — staged as *candidates*, never shown as dive sites.
3. **Confirm** each candidate/lead against a Tier A/B page that shows diving is allowed; record `access`.
4. **De-duplicate** against the catalog (≤ 150 m + name similarity) and merge fields.
5. **Publish** with attribution; protected wrecks carry `protected` and the managing agency's rules link.
