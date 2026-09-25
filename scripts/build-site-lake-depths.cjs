#!/usr/bin/env node
/*
 * A lake's deepest point for freshwater dive sites that have no published depth
 * → src/features/oceanAtlas/data/siteLakeDepths.json.
 *
 *   - Which lake: HydroLAKES v1.0 polygons (lakes ≥ 10 ha; Messager et al. 2016, CC BY 4.0). A site
 *     counts when it lies in the lake, or — for a site already known to be inland — within
 *     SHORE_M of its shore (pins often sit on the entry beach).
 *   - How deep, published first: the lake's Wikidata "vertical depth" (P4511, CC0), found through the
 *     OpenStreetMap water area the site lies in or beside (its `wikidata` tag; Overpass, cached per batch).
 *   - Otherwise GLOBathy's suggested maximum depth (Dmax_use_m; Khazaei et al. 2022, CC0), a model from
 *     the lake's shape, area, volume and setting — shown as an estimate. It can be far off for deep,
 *     steep-sided lakes (Starnberger See: 32 m modelled, 127 m measured), so a row whose mean depth
 *     exceeds its maximum is dropped as inconsistent.
 *
 * The app shows it as the lake's deepest point, estimated — never as the dive's depth.
 *
 *   node scripts/build-site-lake-depths.cjs <HydroLAKES_polys_v10.shp> <GLOBathy_basic_parameters(ALL_LAKES).csv>
 *   (needs the `shapefile` package: NODE_PATH=<dir>/node_modules)
 */
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');
const path = require('node:path');
const readline = require('node:readline');
const shapefile = require('shapefile');
const { dataDir } = require('./lib/dive-site-import.cjs');
const { loadSourceModule } = require('./lib/load-source-module.cjs');
const { overpassPerSite } = require('./lib/overpass-per-site.cjs');

const SHORE_M = 300;
// A sea-sized lake's deepest point says nothing about a dive ("Lake Michigan: 281 m" on a 20 m wreck):
// above this area the card uses sites nearby instead.
const MAX_LAKE_KM2 = 1000;
const CACHE = process.env.SITE_LAKES_CACHE || path.join(os.tmpdir(), 'dmz-site-lakes');
const MIRRORS = ['https://z.overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://lz4.overpass-api.de/api/interpreter']; // busy mirrors answer 504: keep retrying
const USER_AGENT = 'DMZScuba/1.0 (+https://www.dmzscuba.com) lake depth lookup';
async function cached(key, fetcher) {
  const file = path.join(CACHE, crypto.createHash('sha1').update(key).digest('hex').slice(0, 16) + '.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const value = await fetcher();
  fs.writeFileSync(file, JSON.stringify(value));
  return value;
}
async function overpass(query) {
  return cached(query, async () => {
    for (let attempt = 0; attempt < 30; attempt++) {
      for (const url of MIRRORS) {
        const response = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(120_000), headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' }, body: `data=${encodeURIComponent(query)}` }).catch(() => null);
        if (!response?.ok) continue;
        const json = await response.json().catch(() => null);
        if (json?.elements && !json.remark?.includes('runtime error')) return json.elements;
      }
      await new Promise(resolve => setTimeout(resolve, Math.min(60_000, 10_000 * (attempt + 1))));
    }
    throw new Error('All Overpass mirrors failed.');
  });
}
const FT = 0.3048;
// A lake's deepest point is rarely more than ~6× its mean depth. A lake found only *beside* the pin whose
// published depth is far beyond that for the lake the pin actually lies in is a different lake (a quarry
// pond next to Lake Constance is not Lake Constance). Names can't decide it: "Luzern" is "Lake Lucerne".
const MAX_TO_MEAN = 8;
function verticalDepth(entity) {
  const values = (entity?.claims?.P4511 || []).map(claim => claim.mainsnak?.datavalue?.value).filter(Boolean).map(value => {
    const unit = String(value.unit).split('/').pop(), amount = Math.abs(Number(value.amount));
    return unit === 'Q11573' ? amount : unit === 'Q3710' ? amount * FT : null;
  }).filter(v => v && v > 0);
  return values.length ? Math.max(...values) : null;
}
const [shpPath, csvPath] = process.argv.slice(2);
if (!shpPath || !csvPath) { console.error('usage: build-site-lake-depths.cjs <HydroLAKES .shp> <GLOBathy ALL_LAKES .csv>'); process.exit(1); }

function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// Metres from a point to a ring's edges (equirectangular — fine at a few hundred metres).
function ringDistance(lon, lat, ring) {
  const kx = 111_320 * Math.cos(lat * Math.PI / 180), ky = 110_540;
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const ax = (ring[j][0] - lon) * kx, ay = (ring[j][1] - lat) * ky, bx = (ring[i][0] - lon) * kx, by = (ring[i][1] - lat) * ky;
    const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}
const polygonsOf = geometry => geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];

async function main() {
  const src = path.join(__dirname, '../src');
  const { catalogSites } = loadSourceModule(path.join(src, 'features/oceanAtlas/catalog.js'), src);
  const { isInland } = loadSourceModule(path.join(src, 'features/oceanAtlas/inland.js'), src);
  const sites = catalogSites().filter(site => !site.maxDepthMeters).map(site => ({ site, inland: isInland(site) }));
  const cells = new Map();
  for (const entry of sites) {
    const key = `${Math.floor(entry.site.latitude)}|${Math.floor(entry.site.longitude)}`;
    (cells.get(key) || cells.set(key, []).get(key)).push(entry);
  }
  const hits = new Map(); // site id → { lake, distance }
  const source = await shapefile.open(shpPath, shpPath.replace(/\.shp$/i, '.dbf'));
  let count = 0;
  for (let result = await source.read(); !result.done; result = await source.read()) {
    const { geometry, properties } = result.value;
    if (++count % 200000 === 0) process.stdout.write(`\r${count} lakes read`);
    if (!geometry) continue;
    const polygons = polygonsOf(geometry);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const polygon of polygons) for (const [x, y] of polygon[0]) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    const pad = 0.005; // ~500 m
    const candidates = [];
    for (let cy = Math.floor(minY - pad); cy <= Math.floor(maxY + pad); cy++) for (let cx = Math.floor(minX - pad); cx <= Math.floor(maxX + pad); cx++) {
      for (const entry of cells.get(`${cy}|${cx}`) || []) {
        const { latitude: y, longitude: x } = entry.site;
        if (x >= minX - pad && x <= maxX + pad && y >= minY - pad && y <= maxY + pad) candidates.push(entry);
      }
    }
    for (const { site, inland } of candidates) {
      const { latitude: y, longitude: x } = site;
      // Inside the outer ring and not on an island (a hole).
      const inside = polygons.some(polygon => inRing(x, y, polygon[0]) && !polygon.slice(1).some(hole => inRing(x, y, hole)));
      const distance = inside ? 0 : inland ? Math.min(...polygons.map(polygon => ringDistance(x, y, polygon[0]))) : Infinity;
      if (distance > SHORE_M) continue;
      const previous = hits.get(site.id);
      if (!previous || distance < previous.distance) hits.set(site.id, { id: properties.Hylak_id, name: properties.Lake_name || '', mean: properties.Depth_avg, area: properties.Lake_area, distance });
    }
  }
  const wanted = new Set([...hits.values()].map(hit => String(hit.id)));
  const dmax = new Map();
  const lines = readline.createInterface({ input: fs.createReadStream(csvPath) });
  let header = null;
  for await (const line of lines) {
    const cols = line.split(',');
    if (!header) { header = cols; continue; }
    if (!wanted.has(cols[0])) continue;
    const value = Number(cols[header.indexOf('Dmax_use_m')]);
    if (Number.isFinite(value) && value > 0) dmax.set(cols[0], value);
  }
  // Published depths: the OSM water area each lake site lies in (or within SHORE_M of), its Wikidata item,
  // and that item's vertical depth.
  fs.mkdirSync(CACHE, { recursive: true });
  // Sites in a sea-sized lake get no lake depth at all.
  for (const [siteId, hit] of hits) if (hit.area > MAX_LAKE_KM2) hits.set(siteId, { ...hit, huge: true });
  const lakeSites = sites.filter(({ site, inland }) => (hits.has(site.id) || inland) && !hits.get(site.id)?.huge).map(({ site }) => site);
  const waterOf = new Map(); // site id → { qid, name }
  {
    // Cached per site: a new or merged site costs one small query, not a re-run of every later batch.
    const elements = await overpassPerSite({ sites: lakeSites, cacheDir: CACHE,
      statement: site => { const at = `${site.latitude.toFixed(5)},${site.longitude.toFixed(5)}`; return `make site ref="${site.id}";out;is_in(${at})->.a;area.a["natural"="water"]["wikidata"];out tags;make beside;out;nwr(around:${SHORE_M},${at})["natural"="water"]["wikidata"];out tags;`; },
      overpass, onProgress: (done, total) => process.stdout.write(`\r${done}/${total} new lake sites looked up`) });
    let current = null, beside = false;
    for (const element of elements) {
      if (element.type === 'site') { current = element.tags.ref; beside = false; continue; }
      if (element.type === 'beside') { beside = true; continue; }
      const tags = element.tags || {};
      if (!current || !/^Q\d+$/.test(tags.wikidata || '') || waterOf.has(current)) continue; // the containing area comes first
      const name = tags['name:en'] || tags.name || null;
      waterOf.set(current, { qid: tags.wikidata, name, beside });
    }
  }
  const qids = [...new Set([...waterOf.values()].map(water => water.qid))];
  const published = new Map();
  for (let i = 0; i < qids.length; i += 50) {
    const ids = qids.slice(i, i + 50).join('|');
    const json = await cached(`wikidata:${ids}`, async () => (await fetch(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids}&props=claims&format=json`, { headers: { 'User-Agent': USER_AGENT } })).json());
    for (const [qid, entity] of Object.entries(json.entities || {})) { const depth = verticalDepth(entity); if (depth) published.set(qid, depth); }
  }
  const out = {};
  const counts = { wikidata: 0, globathy: 0, inconsistent: 0 };
  for (const site of lakeSites) {
    const water = waterOf.get(site.id), hit = hits.get(site.id);
    const mean = hit && Number.isFinite(hit.mean) && hit.mean > 0 ? Math.round(hit.mean * 10) / 10 : null;
    const otherLake = water?.beside && hit?.distance === 0 && mean && published.get(water.qid) > mean * MAX_TO_MEAN;
    if (water && published.has(water.qid) && !otherLake) {
      out[site.id] = [Math.round(published.get(water.qid) * 10) / 10, mean, water.name || hit?.name || null, 'wikidata', `https://www.wikidata.org/wiki/${water.qid}`];
      counts.wikidata++;
      continue;
    }
    const max = hit && dmax.get(String(hit.id));
    if (!max) continue;
    if (mean && mean >= max) { counts.inconsistent++; continue; }
    out[site.id] = [Math.round(max * 10) / 10, mean, hit.name || water?.name || null, 'globathy', null];
    counts.globathy++;
  }
  const result = {
    source: { name: 'GLOBathy (lake depth model) · HydroLAKES (lake outlines)', url: 'https://doi.org/10.6084/m9.figshare.c.5243309', license: 'GLOBathy CC0 · HydroLAKES CC BY 4.0' },
    retrievedAt: new Date().toISOString(), fields: ['maxDepthMeters', 'meanDepthMeters', 'lakeName', 'source (wikidata = published | globathy = modelled)', 'url'],
    note: `Lakes ≥ 10 ha. A site counts inside the lake or, if inland, within ${SHORE_M} m of its shore.`,
    stats: { checked: sites.length, lakes: wanted.size, sites: Object.keys(out).length, ...counts }, sites: out,
  };
  fs.writeFileSync(path.join(dataDir, 'siteLakeDepths.json'), JSON.stringify(result));
  console.log(`\n${result.stats.sites} sites (${counts.wikidata} published, ${counts.globathy} modelled, ${counts.inconsistent} dropped) in lakes → ${(fs.statSync(path.join(dataDir, 'siteLakeDepths.json')).size / 1024).toFixed(0)} KB`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
