#!/usr/bin/env node
/*
 * Supplementary dive sites → src/features/oceanAtlas/data/extraSites.json.
 *
 *   1. NOAA Thunder Bay National Marine Sanctuary moored shipwrecks (US public domain):
 *      position, depth and the sanctuary page for each wreck with a dive mooring.
 *   2. Wikipedia (facts only: title, coordinates, link): the "Underwater diving sites"
 *      category tree worldwide, plus US National Register shipwrecks in Great Lakes /
 *      lake states. Pages without coordinates are skipped.
 *   3. Curated US inland names (scripts/data/us-inland-dive-sites.json) placed with
 *      OpenStreetMap Nominatim (ODbL); unresolved names are dropped, never guessed.
 *
 * Everything is de-duplicated against the catalog and the OpenStreetMap import.
 * Requests are cached; Nominatim is called at most once per second.
 *
 *   node scripts/import-extra-dive-sites.cjs
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { landIndex, inland, catalogPoints, duplicateIndex, similar, dataDir } = require('./lib/dive-site-import.cjs');

const USER_AGENT = 'DMZScuba/1.0 (+https://www.dmzscuba.com) dive-site import';
const GEOCODED_PLACE_INLAND_KM = 15;
const CACHE_DIR = process.env.EXTRA_SITES_CACHE || path.join(os.tmpdir(), 'dmz-extra-sites-cache');
const outputPath = path.join(dataDir, 'extraSites.json');
const TOPOLOGY_CODES = ['reef', 'wall', 'wreck', 'pinnacle', 'cave', 'cavern', 'muck', 'drift', 'shore', 'other', 'quarry', 'spring', 'lake', 'mine'];
const TBNMS = 'https://services2.arcgis.com/C8EMgrsFcRFL6LrL/arcgis/rest/services/arcgisOnline_BuoysOnly_Update20230703/FeatureServer/0/query?where=1%3D1&outFields=*&outSR=4326&f=json';
const WIKI = 'https://en.wikipedia.org/w/api.php';
const WIKI_ROOTS = ['Category:Underwater diving sites'];
const WIKI_WRECKS = [...['Wisconsin', 'Michigan', 'Minnesota', 'New York (state)', 'Ohio', 'Illinois', 'Indiana', 'Pennsylvania', 'Vermont']
  .map(state => `Category:Shipwrecks on the National Register of Historic Places in ${state}`),
  ...['Lake Michigan', 'Lake Superior', 'Lake Huron', 'Lake Erie', 'Lake Ontario', 'Lake Champlain'].map(lake => `Category:Shipwrecks of ${lake}`)];
// Wrecks that are legally closed to recreational diving (e.g. the Edmund Fitzgerald, protected by the Ontario Heritage Act).
const CLOSED_WRECKS = /edmund fitzgerald/i;
const WIKIDATA = 'https://query.wikidata.org/sparql';
const GREAT_LAKES_BOX = [-92.5, 41.3, -75.9, 49.1];
const SOURCES = {
  tbnms: { name: 'NOAA Thunder Bay National Marine Sanctuary', license: 'US public domain' },
  wikipedia: { name: 'Wikipedia', license: 'Facts from Wikipedia (CC BY-SA text not copied)' },
  wikidata: { name: 'Wikidata', license: 'CC0' },
  curated: { name: 'DMZ Scuba curated list · position © OpenStreetMap contributors', license: 'ODbL 1.0' },
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let lastNominatim = 0;
async function cachedJson(url, { nominatim = false } = {}) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, crypto.createHash('sha1').update(url).digest('hex') + '.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  for (let attempt = 0; attempt < 5; attempt++) {
    if (nominatim) { const wait = lastNominatim + 1100 - Date.now(); if (wait > 0) await sleep(wait); lastNominatim = Date.now(); }
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } }).catch(() => null);
    if (response?.ok) { const json = await response.json(); fs.writeFileSync(file, JSON.stringify(json)); return json; }
    await sleep(5000 * (attempt + 1));
  }
  throw new Error(`Failed: ${url}`);
}
const wiki = params => cachedJson(`${WIKI}?${new URLSearchParams({ format: 'json', ...params })}`);

// 1 · NOAA Thunder Bay moorings: the description carries the wreck position and depth.
async function thunderBay() {
  const json = await cachedJson(TBNMS);
  return json.features.map(feature => {
    const a = feature.attributes, text = String(a.Description || '');
    const lat = Number((text.match(/Latitude:<\/b>\s*([\d.-]+)/) || [])[1]) || a.Latitude;
    const lon = Number((text.match(/Longitude:<\/b>\s*([\d.-]+)/) || [])[1]) || a.Longitude;
    const feet = Number((text.match(/Depth:<\/b>\s*([\d.]+)\s*Feet/i) || [])[1]);
    const url = (text.match(/href="([^"]+)"/) || [])[1] || 'https://thunderbay.noaa.gov/shipwrecks/';
    return { name: String(a.Icon_Title || '').trim(), latitude: lat, longitude: lon, depth: feet ? Math.round(feet * 0.3048) : 0,
      topologies: ['wreck'], fresh: true, entry: 'boat', source: 'tbnms', url: url.replace(/^http:/, 'https:') };
  }).filter(site => site.name && Number.isFinite(site.latitude) && Number.isFinite(site.longitude));
}

// 2 · Wikipedia category trees → pages with coordinates.
async function categoryPages(root, maxDepth) {
  const seen = new Set(), pages = new Map(), queue = [[root, 0]];
  while (queue.length) {
    const [category, depth] = queue.pop();
    if (seen.has(category) || depth > maxDepth) continue;
    seen.add(category);
    for (const type of ['page', 'subcat']) {
      let cont = {};
      do {
        const r = await wiki({ action: 'query', list: 'categorymembers', cmtitle: category, cmtype: type, cmlimit: '500', ...cont });
        for (const member of r.query.categorymembers) {
          if (type === 'page') pages.set(member.pageid, { title: member.title, category });
          else queue.push([member.title, depth + 1]);
        }
        cont = r.continue ? { cmcontinue: r.continue.cmcontinue } : null;
      } while (cont);
    }
  }
  return pages;
}
async function wikipedia() {
  const pages = new Map();
  for (const root of WIKI_ROOTS) for (const [id, page] of await categoryPages(root, 4)) pages.set(id, page);
  for (const root of WIKI_WRECKS) for (const [id, page] of await categoryPages(root, 1)) pages.set(id, { ...page, wreck: true });
  const ids = [...pages.keys()];
  const sites = [];
  for (let i = 0; i < ids.length; i += 50) {
    const r = await wiki({ action: 'query', pageids: ids.slice(i, i + 50).join('|'), prop: 'coordinates|description|categories', colimit: '50', cllimit: 'max', coprimary: 'primary' });
    for (const page of Object.values(r.query.pages || {})) {
      const coordinate = page.coordinates?.[0];
      if (!coordinate || CLOSED_WRECKS.test(page.title)) continue;
      const info = pages.get(page.pageid);
      const text = `${page.title} ${page.description || ''} ${(page.categories || []).map(c => c.title).join(' ')} ${info.category}`.toLowerCase();
      if (/\b(people|person|company|organisation|organization|disaster|sinking of|battle of)\b/.test(`${page.title} ${page.description || ''}`.toLowerCase()) && !/wreck|reef|dive/.test((page.description || '').toLowerCase())) continue;
      const topologies = [/wreck|shipwreck|ship|steamer|schooner|barge|artificial reef/.test(text) || info.wreck ? 'wreck' : '', /\breef\b/.test(text) ? 'reef' : '',
        /\bcave|cenote|sistema\b/.test(text) ? 'cave' : '', /quarr/.test(text) ? 'quarry' : '', /\bspring/.test(text) ? 'spring' : ''].filter(Boolean);
      sites.push({ name: page.title.replace(/ \((shipwreck|ship|dive site|reef)[^)]*\)$/i, ''), latitude: coordinate.lat, longitude: coordinate.lon, depth: 0, topologies,
        fresh: /great lakes|lake (michigan|superior|huron|erie|ontario|champlain|george)|quarr|freshwater/.test(text), entry: '', source: 'wikipedia',
        inlandWater: /\b(lakes?|ponds?|cenotes?|sinkholes?|caves?|springs?|pools?|lochs?|reservoirs?|dams?)\b/.test(text),
        url: `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}` });
    }
  }
  return sites;
}

// 2b · Wikidata shipwrecks (CC0) in the Great Lakes box.
async function wikidataWrecks() {
  const [west, south, east, north] = GREAT_LAKES_BOX;
  const query = `SELECT ?item ?label ?coord ?article WHERE { SERVICE wikibase:box { ?item wdt:P625 ?coord . bd:serviceParam wikibase:cornerSouthWest "Point(${west} ${south})"^^geo:wktLiteral . bd:serviceParam wikibase:cornerNorthEast "Point(${east} ${north})"^^geo:wktLiteral . } ?item wdt:P31 wd:Q852190 . ?item rdfs:label ?label FILTER(LANG(?label) = "en") OPTIONAL { ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> } } LIMIT 3000`;
  const json = await cachedJson(`${WIKIDATA}?${new URLSearchParams({ format: 'json', query })}`);
  return json.results.bindings.map(row => {
    const [lon, lat] = row.coord.value.replace(/^Point\(|\)$/g, '').split(' ').map(Number);
    return { name: row.label.value.replace(/^(SS|MV|SV|PS) /, match => match), latitude: lat, longitude: lon, depth: 0, topologies: ['wreck'], fresh: true, entry: 'boat',
      source: 'wikidata', url: row.article?.value || row.item.value.replace('http://', 'https://') };
  }).filter(site => Number.isFinite(site.latitude) && !CLOSED_WRECKS.test(site.name));
}

// 3 · Curated US inland names → Nominatim positions.
const ACCEPTED = new Set(['natural', 'water', 'waterway', 'leisure', 'landuse', 'tourism', 'place', 'boundary', 'amenity', 'historic', 'man_made']);
async function curated() {
  const { sites } = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/us-inland-dive-sites.json'), 'utf8'));
  const resolved = [], missing = [];
  for (const entry of sites) {
    // The result must be in the named state; a dive business is accepted when it *is* the venue (same name).
    let hit = null;
    for (const q of [entry.query, `${entry.name.split(' — ')[0]}, ${entry.state}`]) {
      const results = await cachedJson(`https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q, format: 'jsonv2', limit: '5', countrycodes: 'us' })}`, { nominatim: true });
      hit = results.find(result => (!entry.state || result.display_name.includes(entry.state))
        && (ACCEPTED.has(result.category || result.class) || ((result.category || result.class) === 'shop' && similar(result.name || '', entry.name))));
      if (hit) break;
    }
    if (!hit) { missing.push(entry.name); continue; }
    const kind = entry.kind;
    resolved.push({ name: entry.name, latitude: Number(hit.lat), longitude: Number(hit.lon), depth: 0,
      topologies: [kind === 'spring-cave' ? 'cave' : '', kind === 'spring-cave' ? 'spring' : kind].filter(Boolean), fresh: true, entry: 'shore', source: 'curated',
      url: `https://www.openstreetmap.org/${hit.osm_type}/${hit.osm_id}` });
  }
  return { resolved, missing };
}

(async () => {
  const rings = landIndex();
  const existing = catalogPoints({ includeImports: ['osmSites.json'] });
  const dupes = duplicateIndex(existing);
  const stats = {};
  const out = [];
  const tb = await thunderBay();
  const wp = await wikipedia();
  const wd = await wikidataWrecks();
  const cu = await curated();
  for (const [key, list] of [['tbnms', tb], ['wikipedia', wp], ['wikidata', wd], ['curated', cu.resolved]]) {
    stats[key] = { found: list.length, duplicates: 0, kept: 0 };
    for (const site of list) {
      if (dupes.isDuplicate(site)) { stats[key].duplicates++; continue; }
      // Wikipedia places that aren't wrecks or inland water (towns, parks, islands) are pinned at
      // their centre, often a few km from the shore they dive from: only call those inland when
      // well away from any coast.
      const place = key === 'wikipedia' && !site.inlandWater && !site.topologies.includes('wreck');
      if (!site.fresh && inland(site, rings, place ? GEOCODED_PLACE_INLAND_KM : undefined)) site.fresh = true;
      delete site.inlandWater;
      dupes.add(site); out.push(site); stats[key].kept++;
    }
  }
  stats.curatedUnresolved = cu.missing;
  // Water-type hints by name from the curated list (kept even when the site itself came from another source),
  // e.g. "Mermet Springs" is a quarry, not a spring.
  const kindHints = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(__dirname, 'data/us-inland-dive-sites.json'), 'utf8')).sites
    .map(entry => [entry.name.split(' — ')[0].toLowerCase(), entry.kind.replace('spring-cave', 'spring')]));
  // Compact rows: [id, name, lat, lon, depthM, entry(0/1 boat/2 shore), topologyMask, fresh, sourceKey, url]
  const rows = out.map((site, i) => [`${site.source}-${i}`, site.name.slice(0, 80), Math.round(site.latitude * 1e5) / 1e5, Math.round(site.longitude * 1e5) / 1e5, site.depth || 0,
    site.entry === 'boat' ? 1 : site.entry === 'shore' ? 2 : 0, site.topologies.reduce((mask, code) => mask | (1 << TOPOLOGY_CODES.indexOf(code)), 0), site.fresh ? 1 : 0, site.source, site.url]);
  fs.writeFileSync(outputPath, JSON.stringify({ retrievedAt: new Date().toISOString(), topologyCodes: TOPOLOGY_CODES, sources: SOURCES, kindHints,
    fields: ['id', 'name', 'latitude', 'longitude', 'maxDepthMeters', 'entry', 'topologyMask', 'fresh', 'source', 'url'], stats, sites: rows }));
  console.log(JSON.stringify(stats, null, 1), `→ ${(fs.statSync(outputPath).size / 1024).toFixed(0)} KB`);
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
