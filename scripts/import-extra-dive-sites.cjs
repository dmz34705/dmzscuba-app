#!/usr/bin/env node
/*
 * Supplementary dive sites → src/features/oceanAtlas/data/extraSites.json.
 *
 *   1. NOAA Thunder Bay National Marine Sanctuary moored shipwrecks (US public domain):
 *      position, depth and the sanctuary page for each wreck with a dive mooring.
 *   2. Wikipedia (facts only: title, coordinates, link): the "Underwater diving sites"
 *      category tree worldwide, plus US National Register shipwrecks in Great Lakes /
 *      lake states. A wreck page without a primary coordinate uses its inline one (the
 *      Prins Willem V off Milwaukee is only positioned in its text); others are skipped.
 *   2c. Wikipedia's Great Lakes shipwreck lists (ship name, position, link): wrecks with no
 *      article of their own. A row linking to an article already imported is skipped.
 *   2d. Notable wrecks worldwide: Wikidata shipwrecks with an English Wikipedia article whose
 *      position lies in 100 m of water or less (or on the shoreline). Their heritage designations
 *      (protected wreck, military remains, historic listing) or a naval name give every wreck with
 *      that article a note: licence needed, may be a war grave, look but don't disturb.
 *
 * Ids are stable across runs: a row keeps the id it had (matched by source and link), and
 * new rows get new ids — merges, photos, facts and depths are keyed by these ids.
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
// (and the Pearl Harbor memorials, HMS Royal Oak — war graves closed to divers).
// The SS Richard Montgomery still holds its explosives, inside an exclusion zone.
const CLOSED_WRECKS = /edmund fitzgerald|uss arizona|uss utah|hms royal oak|richard montgomery/i;
const WIKIDATA = 'https://query.wikidata.org/sparql';
const GREAT_LAKES_BOX = [-92.5, 41.3, -75.9, 49.1];
const SOURCES = {
  tbnms: { name: 'NOAA Thunder Bay National Marine Sanctuary', license: 'US public domain' },
  wikipedia: { name: 'Wikipedia', license: 'Facts from Wikipedia (CC BY-SA text not copied)' },
  wikidata: { name: 'Wikidata', license: 'CC0' },
  curated: { name: 'DMZ Scuba curated list · position © OpenStreetMap contributors', license: 'ODbL 1.0' },
  wikilist: { name: 'Wikipedia shipwreck lists', license: 'Facts from Wikipedia (CC BY-SA text not copied)' },
  notable: { name: 'Wikidata shipwrecks with a Wikipedia article', license: 'CC0' },
};
const NOTABLE_MAX_DEPTH_M = 100; // technical-diving range; deeper wrecks are for ROVs, not divers
const NOAA_SAMPLES = 'https://gis.ngdc.noaa.gov/arcgis/rest/services/DEM_mosaics/DEM_all/ImageServer/getSamples';
// What a wreck's protection means for a diver — from Wikidata heritage designations (P1435), or a naval name.
const NAVAL = /^(HMS|HMAS|HMCS|HMNZS|HMSAS|USS|USCGC|SMS|SM|KMS|IJN|ORP|HNLMS|HDMS|HNoMS|HSwMS|INS|RFS|HS|ARA|BAP|French|German|Japanese|Italian|Soviet|Russian|Austro-Hungarian|Ottoman|Royal)\b|^U-\d|\bsubmarine\b/;
function wreckNote(name, heritage) {
  if (heritage.some(h => /Military Remains/i.test(h))) return 'Protected military wreck (Protection of Military Remains Act) — diving may be prohibited. Check before you dive and never disturb it.';
  if (heritage.some(h => /protected shipwreck/i.test(h))) return 'Protected wreck (UK Protection of Wrecks Act) — diving needs a licence. Check before you dive.';
  if (NAVAL.test(name)) return 'Naval wreck — it may be a war grave. Diving rules vary by country: check before you dive and never disturb it.';
  if (heritage.length) return `Listed historic wreck (${heritage[0]}) — look, but don't disturb or remove anything. Check local rules before you dive.`;
  return '';
}
const WIKI_LISTS = ['List of shipwrecks in Lake Michigan', 'List of shipwrecks in Lake Superior', 'List of shipwrecks in Lake Huron', 'List of shipwrecks in Lake Erie',
  'List of shipwrecks in Lake Ontario', 'List of shipwrecks in the Wisconsin Shipwreck Coast National Marine Sanctuary', 'List of shipwrecks in the Thunder Bay National Marine Sanctuary'];

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
    const r = await wiki({ action: 'query', pageids: ids.slice(i, i + 50).join('|'), prop: 'coordinates|description|categories', colimit: 'max', cllimit: 'max', coprimary: 'all' });
    for (const page of Object.values(r.query.pages || {})) {
      // The primary coordinate; for a wreck without one, the first inline position in its text.
      const coordinate = page.coordinates?.find(c => c.primary !== undefined) || (pages.get(page.pageid)?.wreck ? page.coordinates?.[0] : null);
      if (!coordinate || CLOSED_WRECKS.test(page.title) || /^List of /i.test(page.title) || (pages.get(page.pageid)?.wreck && vague(coordinate))) continue;
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

// 2c · Wikipedia shipwreck lists: one table row per ship, with a {{coord}} when the wreck has been located.
// "46°N 85°W": a position to the nearest tenth of a degree or coarser is somewhere in the lake, not a wreck site.
const vague = ({ lat, lon }) => [lat, lon].every(value => Math.abs(value * 10 - Math.round(value * 10)) < 1e-9);
function parseCoord(inner) {
  const parts = inner.split('|').map(part => part.trim()).filter(part => part && !part.includes('='));
  const hemi = parts.findIndex(part => /^[NS]$/i.test(part));
  if (hemi === -1) { const [lat, lon] = parts.map(Number); return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null; }
  const dms = values => values.reduce((sum, value, i) => sum + Number(value) / 60 ** i, 0);
  const lonHemi = parts.findIndex((part, i) => i > hemi && /^[EW]$/i.test(part));
  if (lonHemi === -1) return null;
  const lat = dms(parts.slice(0, hemi)) * (/^S$/i.test(parts[hemi]) ? -1 : 1), lon = dms(parts.slice(hemi + 1, lonHemi)) * (/^W$/i.test(parts[lonHemi]) ? -1 : 1);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}
const plainName = cell => String(cell || '')
  .replace(/\{\{(?:SS|ship|SSu|USS|HMS|HMCS|USCGC|MV|sclass)[^|}]*\|([^|}]+)(?:\|[^}]*)?\}\}/gi, '$1')
  .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, '$2').replace(/\[\[([^\]]+)\]\]/g, '$1')
  .replace(/<ref[^>]*\/>|<ref[^>]*>.*?<\/ref>|<[^>]+>|\{\{[^}]*\}\}|''+/g, '').replace(/\s+/g, ' ').trim();
async function wikipediaLists() {
  const sites = [];
  for (const title of WIKI_LISTS) {
    const r = await wiki({ action: 'parse', page: title, prop: 'wikitext', redirects: '1' }).catch(() => null);
    const text = r?.parse?.wikitext?.['*'];
    if (!text) continue;
    const page = r.parse.title;
    for (const row of text.split(/\n\|-/).slice(1)) {
      const coord = row.match(/\{\{coord\s*\|([^}]*)\}\}/i);
      const at = coord && parseCoord(coord[1]);
      // Hulls sunk as a breakwater or dock are harbour structures, not dive sites.
      if (!at || vague(at) || /sunk as (a |an )?(breakwater|dock|pier|crib|wharf)/i.test(row)) continue;
      const anchor = (row.match(/^[^\n]*\bid\s*=\s*"?([^"\n|]+)/) || [])[1]?.trim();
      const cells = row.split(/\n\s*[|!]/).slice(1);
      const first = cells[0] || '';
      const name = plainName(first).replace(/\s*\((shipwreck|ship|\d{4})\)$/i, '');
      if (!name || name.length > 80 || CLOSED_WRECKS.test(name)) continue;
      // Link to the ship's own article when the row has one, else to the row in the list.
      const link = (first.match(/\[\[([^|\]#]+)/) || [])[1];
      const url = link ? `https://en.wikipedia.org/wiki/${encodeURIComponent(link.trim().replace(/ /g, '_'))}`
        : `https://en.wikipedia.org/wiki/${encodeURIComponent(page.replace(/ /g, '_'))}${anchor ? `#${encodeURIComponent(anchor.replace(/ /g, '_'))}` : ''}`;
      sites.push({ name, latitude: at.lat, longitude: at.lon, depth: 0, topologies: ['wreck'], fresh: true, entry: 'boat', source: 'wikilist', url });
    }
  }
  // The same row can appear in two lists (a lake and a sanctuary).
  const seen = new Set();
  return sites.filter(site => { const key = `${site.url}|${site.latitude.toFixed(3)}|${site.longitude.toFixed(3)}`; if (seen.has(key)) return false; seen.add(key); return true; });
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

// 2d · Notable wrecks worldwide: Wikidata shipwrecks (CC0) with coordinates and an English Wikipedia article,
// kept where the seafloor there is NOTABLE_MAX_DEPTH_M or shallower (ETOPO / NOAA coastal DEMs) — or the pin sits
// on the shoreline (a beached or harbour wreck). Their heritage designations become the card's note.
async function notableWrecks() {
  const query = 'SELECT ?item ?label ?coord ?article (GROUP_CONCAT(DISTINCT ?hLabel; separator="|") AS ?heritage) WHERE { ?item wdt:P31/wdt:P279* wd:Q852190 ; wdt:P625 ?coord . '
    + '?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> . OPTIONAL { ?item rdfs:label ?label FILTER(LANG(?label)="en") } '
    + 'OPTIONAL { ?item wdt:P1435 ?h . ?h rdfs:label ?hLabel FILTER(LANG(?hLabel)="en") } } GROUP BY ?item ?label ?coord ?article';
  const json = await cachedJson(`${WIKIDATA}?${new URLSearchParams({ format: 'json', query })}`);
  const wrecks = json.results.bindings.map(row => {
    const [lon, lat] = row.coord.value.replace(/^Point\(|\)$/g, '').split(' ').map(Number);
    return { name: (row.label?.value || decodeURIComponent(row.article.value.split('/wiki/')[1]).replace(/_/g, ' ')).replace(/ \((shipwreck|ship)[^)]*\)$/i, ''),
      latitude: lat, longitude: lon, url: row.article.value, heritage: (row.heritage?.value || '').split('|').filter(Boolean) };
  }).filter(w => Number.isFinite(w.latitude) && Number.isFinite(w.longitude) && !CLOSED_WRECKS.test(w.name) && !vague({ lat: w.latitude, lon: w.longitude }));
  for (let i = 0; i < wrecks.length; i += 100) {
    const batch = wrecks.slice(i, i + 100);
    const geometry = JSON.stringify({ points: batch.map(w => [Number(w.longitude.toFixed(5)), Number(w.latitude.toFixed(5))]), spatialReference: { wkid: 4326 } });
    const r = await cachedJson(`${NOAA_SAMPLES}?${new URLSearchParams({ geometry, geometryType: 'esriGeometryMultipoint', returnFirstValueOnly: 'true', f: 'json' })}`);
    for (const sample of r.samples || []) batch[sample.locationId].elevation = Number(sample.value);
  }
  const [west, south, east, north] = GREAT_LAKES_BOX;
  const sites = wrecks.filter(w => Number.isFinite(w.elevation) && w.elevation >= -NOTABLE_MAX_DEPTH_M && w.elevation <= 5).map(w => ({
    name: w.name, latitude: w.latitude, longitude: w.longitude, depth: 0, topologies: ['wreck'], entry: w.elevation > -2 ? 'shore' : 'boat',
    fresh: w.longitude >= west && w.longitude <= east && w.latitude >= south && w.latitude <= north, source: 'notable', url: w.url }));
  // Protection notes for every wreck with an article, including ones already imported from elsewhere.
  const notes = new Map(wrecks.map(w => [articleTitle(w.url), wreckNote(w.name, w.heritage)]).filter(([, note]) => note));
  return { sites, notes };
}

// Ships that are no longer on the bottom: raised into a museum (H. L. Hunley, Mary Rose), afloat as a museum
// (SS Valley Camp) or broken up (Costa Concordia). Wikidata says so through the article's item: a museum /
// preserved-vessel type (P31) or a ship-breaking event (P793). "Salvage" alone isn't enough (HMS A1 still lies there).
// The article a link points at, however it was percent-encoded (Wikidata writes %27 where others write ').
// A list row keeps its #anchor: each row is its own wreck.
const articleTitle = url => /wikipedia\.org\/wiki\//.test(url || '') ? decodeURIComponent(url.split('/wiki/')[1]).replace(/_/g, ' ') : url;
async function retiredArticles(urls) {
  const titles = [...new Set(urls.filter(url => /en\.wikipedia\.org\/wiki\/[^#]+$/.test(url)).map(url => decodeURIComponent(url.split('/wiki/')[1]).replace(/_/g, ' ')))];
  const qidOf = new Map();
  for (let i = 0; i < titles.length; i += 50) {
    const r = await wiki({ action: 'query', titles: titles.slice(i, i + 50).join('|'), prop: 'pageprops', ppprop: 'wikibase_item', redirects: '1' });
    const back = new Map([...(r.query?.normalized || []), ...(r.query?.redirects || [])].map(x => [x.to, x.from]));
    for (const page of Object.values(r.query?.pages || {})) {
      let title = page.title; while (back.has(title)) title = back.get(title);
      if (page.pageprops?.wikibase_item) qidOf.set(title, page.pageprops.wikibase_item);
    }
  }
  const claims = new Map();
  const qids = [...new Set(qidOf.values())];
  for (let i = 0; i < qids.length; i += 50) {
    const r = await cachedJson(`https://www.wikidata.org/w/api.php?${new URLSearchParams({ action: 'wbgetentities', props: 'claims', format: 'json', ids: qids.slice(i, i + 50).join('|') })}`);
    for (const [qid, entity] of Object.entries(r.entities || {})) {
      const ids = property => (entity.claims?.[property] || []).map(c => c.mainsnak?.datavalue?.value?.id).filter(Boolean);
      claims.set(qid, { types: ids('P31'), events: ids('P793') });
    }
  }
  const valueIds = [...new Set([...claims.values()].flatMap(c => [...c.types, ...c.events]))];
  const label = new Map();
  for (let i = 0; i < valueIds.length; i += 50) {
    const r = await cachedJson(`https://www.wikidata.org/w/api.php?${new URLSearchParams({ action: 'wbgetentities', props: 'labels', languages: 'en', format: 'json', ids: valueIds.slice(i, i + 50).join('|') })}`);
    for (const [qid, entity] of Object.entries(r.entities || {})) label.set(qid, entity.labels?.en?.value || '');
  }
  const retired = new Set();
  for (const title of titles) {
    const c = claims.get(qidOf.get(title));
    if (!c) continue;
    const broken = c.events.some(id => /ship breaking|scrapping|refloating/i.test(label.get(id) || ''));
    const museum = c.types.some(id => /museum|preserved/i.test(label.get(id) || ''));
    if (broken) retired.add(title);
    // Wikidata can lag: a former museum ship later sunk as an artificial reef (USCGC Tamaroa) is diveable again.
    else if (museum) {
      const r = await wiki({ action: 'query', titles: title, prop: 'extracts', explaintext: '1', redirects: '1' });
      if (!/artificial reef|sunk as (an? )?(reef|dive site)|reefed/i.test(Object.values(r.query?.pages || {})[0]?.extract || '')) retired.add(title);
    }
  }
  return retired;
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
  const wl = await wikipediaLists();
  const notable = await notableWrecks();
  const retired = await retiredArticles([...wp, ...wd, ...wl, ...notable.sites].filter(site => site.topologies.includes('wreck')).map(site => site.url));
  stats.retiredWrecks = retired.size;
  const urls = new Set();
  for (const [key, list] of [['tbnms', tb], ['wikipedia', wp], ['wikidata', wd], ['curated', cu.resolved], ['wikilist', wl], ['notable', notable.sites]]) {
    stats[key] = { found: list.length, duplicates: 0, kept: 0 };
    for (const site of list) {
      if (site.topologies.includes('wreck') && !/#/.test(site.url) && retired.has(articleTitle(site.url))) { stats[key].retired = (stats[key].retired || 0) + 1; continue; } // raised, a museum, or scrapped
      // A list row is a duplicate when its article is already in, or a wreck of a similar name is within 1.5 km —
      // not merely because something else sits within 150 m (wrecks lie close together off harbours).
      if (['wikilist', 'notable'].includes(key) ? urls.has(articleTitle(site.url)) || dupes.isDuplicate(site, 30) : dupes.isDuplicate(site)) { stats[key].duplicates++; continue; }
      urls.add(articleTitle(site.url));
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
  // Stable ids: the id a row had last time (same source and link, or same source and name), else a new one.
  const previous = fs.existsSync(outputPath) ? JSON.parse(fs.readFileSync(outputPath, 'utf8')).sites : [];
  const oldId = new Map(), taken = new Set();
  for (const row of previous) { oldId.set(`${row[8]}|${row[9]}|${row[1]}`, row[0]); oldId.set(`${row[8]}|${row[9]}`, oldId.get(`${row[8]}|${row[9]}`) || row[0]); }
  let nextIndex = Math.max(-1, ...previous.map(row => Number(String(row[0]).split('-').pop())).filter(Number.isFinite)) + 1;
  const idFor = site => {
    const id = [`${site.source}|${site.url}|${site.name.slice(0, 80)}`, `${site.source}|${site.url}`].map(key => oldId.get(key)).find(id => id && !taken.has(id));
    const chosen = id || `${site.source}-${nextIndex++}`;
    taken.add(chosen);
    return chosen;
  };
  const rows = out.map(site => [idFor(site), site.name.slice(0, 80), Math.round(site.latitude * 1e5) / 1e5, Math.round(site.longitude * 1e5) / 1e5, site.depth || 0,
    site.entry === 'boat' ? 1 : site.entry === 'shore' ? 2 : 0, site.topologies.reduce((mask, code) => mask | (1 << TOPOLOGY_CODES.indexOf(code)), 0), site.fresh ? 1 : 0, site.source, site.url, (!/#/.test(site.url) && notable.notes.get(articleTitle(site.url))) || '']);
  fs.writeFileSync(outputPath, JSON.stringify({ retrievedAt: new Date().toISOString(), topologyCodes: TOPOLOGY_CODES, sources: SOURCES, kindHints,
    fields: ['id', 'name', 'latitude', 'longitude', 'maxDepthMeters', 'entry', 'topologyMask', 'fresh', 'source', 'url', 'note (protection, from Wikidata heritage designations)'], stats, sites: rows }));
  console.log(JSON.stringify(stats, null, 1), `→ ${(fs.statSync(outputPath).size / 1024).toFixed(0)} KB`);
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
