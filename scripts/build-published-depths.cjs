#!/usr/bin/env node
/*
 * Published maximum depths for sites whose own record has none
 * → src/features/oceanAtlas/data/publishedDepths.json
 *
 * Sources, applied the same way to every site:
 *   - the Wikipedia article the site links to (supplementary sites), the article or Wikidata
 *     item tagged on OpenStreetMap sites, or — for the curated inland list — the English
 *     Wikipedia article whose title matches the site name;
 *   - the article's lead section: "lies in 90 feet (27 m) of water", "a maximum depth of 40 m",
 *     "140 feet (43 m) deep" … (the deepest figure in the first matching sentence);
 *   - otherwise Wikidata "vertical depth" (P4511);
 *   - operator/agency-posted depths recorded in scripts/data/us-inland-dive-sites.json
 *     (maxDepthFt + depthSource) win over both, applied to the map site of the same name
 *     within POSTED_MATCH_KM of the entry's Nominatim position, whichever catalog it came from.
 * Depths describing a whole lake (the article is about a lake / reservoir) are flagged `lake`:
 * the app shows them as the lake's deepest point and leaves them out of the experience rating.
 *
 *   node scripts/build-published-depths.cjs [osm-overpass.json]   (requests cached)
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { dataDir, similar } = require('./lib/dive-site-import.cjs');
const { loadSourceModule } = require('./lib/load-source-module.cjs');

const CACHE_DIR = process.env.DEPTHS_CACHE || path.join(os.tmpdir(), 'dmz-published-depths-cache');
const USER_AGENT = 'DMZScuba/1.0 (+https://www.dmzscuba.com) published depths build';
const WIKI = 'https://en.wikipedia.org/w/api.php', WIKIDATA = 'https://www.wikidata.org/w/api.php';
const FT = 0.3048;
const MAX_DIVE_DEPTH_M = 400; // deeper figures are ocean-floor wrecks (Titanic) or whole-lake depths
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

let last = 0;
async function api(base, params) {
  const url = `${base}?${new URLSearchParams({ format: 'json', ...params })}`;
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, crypto.createHash('sha1').update(url).digest('hex') + '.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  for (let attempt = 0; attempt < 5; attempt++) {
    const wait = last + 300 - Date.now(); if (wait > 0) await sleep(wait); last = Date.now();
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } }).catch(() => null);
    if (response?.ok) { const json = await response.json(); fs.writeFileSync(file, JSON.stringify(json)); return json; }
    await sleep(4000 * (attempt + 1));
  }
  throw new Error(`Failed: ${url.slice(0, 140)}`);
}
const chunks = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

// Depth statements in an article's lead, most specific first. Each captures number(s) and a unit.
const NUM = '(\\d[\\d,]*(?:\\.\\d+)?)', RANGE = `${NUM}(?:\\s*(?:–|-|to)\\s*${NUM})?`, UNIT = '(feet|foot|ft|fathoms?|metres|meters|metre|meter|m)\\b(?:\\s*\\([^)]*\\))?';
const FATHOM = 1.8288;
const PATTERNS = [
  new RegExp(`\\b(?:maximum|max\\.?|greatest) depth (?:of |is |reaches |about |approximately |around |roughly )*${RANGE}\\s*${UNIT}`, 'i'),
  new RegExp(`\\bin (?:about |approximately |roughly |some |around |over |nearly |just over |only )?${RANGE}[\\s-]*${UNIT}\\s+of (?:fresh |open )?water`, 'i'),
  new RegExp(`\\b(?:at|to) a depth of (?:about |approximately |roughly |around |up to |over |nearly )?${RANGE}\\s*${UNIT}`, 'i'),
  new RegExp(`\\b(?:depths? (?:of|reaching|up to) )(?:about |approximately |around )?${RANGE}\\s*${UNIT}`, 'i'),
  new RegExp(`\\b${RANGE}[\\s-]*${UNIT}\\s+(?:deep|below the surface)\\b`, 'i'),
  // "lying on the bottom at 73 m", "rests in 30 m", "sits at a depth of 40 ft", "sank in 200 feet"
  new RegExp(`\\b(?:lying|lies|lay|rests?|resting|sits?|sitting|sank|sunk|settled)\\s+(?:upright |upside down |on (?:her|its) (?:side|keel) )?(?:on the (?:sea ?floor|sea ?bed|bottom|ocean floor) )?(?:at|in) (?:a depth of )?(?:about |approximately |roughly |around |some |over |nearly )?${RANGE}\\s*${UNIT}`, 'i'),
];
const metresOf = (value, unit) => value * (/^fa/i.test(unit) ? FATHOM : /^f/i.test(unit) ? FT : 1);
function depthFromText(text) {
  for (const pattern of PATTERNS) {
    const m = String(text || '').match(pattern);
    if (!m) continue;
    const values = [m[1], m[2]].filter(Boolean).map(v => Number(v.replace(/,/g, '')));
    const metres = metresOf(Math.max(...values), m[3]);
    if (metres >= 1) return { metres: Math.round(metres), quote: m[0] };
  }
  return null;
}
// Beyond the lead: the article's sections about the wreck or the diving ("Wreck site", "Diving",
// "Sinking", "Discovery" …), never the collision or the ship's specifications, and never a sentence about
// the hull, draft or size ("penetrated the hull to a depth of nearly 40 feet"). Every depth statement in
// those sections counts and the deepest wins: the seabed, not the top of the wreck ("top … in 27 fathoms
// (49 m) … the bell lying on the bottom at 73 m" → 73 m).
const DEPTH_SECTION = /wreck|div(e|ing)|sinking|sank|scuttl|discover|remains|site|today|current|status|salvage|explor|fate|location|artificial reef|geography|description/i;
const NOT_THE_DIVE = /\b(hull|draft|draught|keel|beam|length|height|tall|long|wide|penetrat|gash|hole in|freeboard|displacement|tonnage|mast|funnel|anchor chain|cable)\b/i;
// The ship's design ("test depth of 300 feet"), and — for a reef or cave — the sections about ships
// that sank there, which give their depth, not the site's.
const DESIGN_SECTION = /design|specification|characteristic|armament|propulsion|construction|particulars/i;
const OTHER_SHIPS_SECTION = /wreck|sinking|sank|scuttl|salvage|fate/i;
// "Shipwrecks", "Notable wrecks": a list of ships lost there, each at its own depth — never the site's.
const WRECK_LIST_SECTION = /\b(ship)?wrecks\b|list of/i;
function depthFromArticle(text, isWreck) {
  const sections = String(text || '').split(/\n={2,}\s*([^=\n]+?)\s*={2,}\n/);
  const found = [];
  for (let i = 1; i < sections.length; i += 2) {
    if (!DEPTH_SECTION.test(sections[i]) || DESIGN_SECTION.test(sections[i]) || WRECK_LIST_SECTION.test(sections[i]) || (!isWreck && OTHER_SHIPS_SECTION.test(sections[i]))) continue;
    for (const sentence of sections[i + 1].split(/(?<=[.!?])\s+/)) {
      if (NOT_THE_DIVE.test(sentence)) continue;
      const hit = depthFromText(sentence);
      if (hit) found.push({ ...hit, quote: `${sections[i]}: ${hit.quote}` });
    }
  }
  return found.filter(hit => hit.metres <= MAX_DIVE_DEPTH_M).sort((a, b) => b.metres - a.metres)[0] || null;
}
function wikidataDepth(entity) {
  const value = entity?.claims?.P4511?.[0]?.mainsnak?.datavalue?.value;
  if (!value) return null;
  const amount = Math.abs(Number(value.amount));
  const unit = String(value.unit).split('/').pop();
  const metres = unit === 'Q3710' ? amount * FT : unit === 'Q11573' ? amount : unit === 'Q828224' ? amount * 1000 : null;
  return metres && metres >= 1 ? Math.round(metres) : null;
}
// What the article is about, from its first sentence: a lake (depth = its deepest point) or a wider
// area (island, bay, reef system …, whose depth says nothing about a dive) — "was a lake freighter" is neither.
const ABOUT = /\b(?:is|was|are)\s+(?:an?|the|one of the)\s+(?:[\w'’,.-]+\s+){0,6}?(lake|reservoir|loch|pond|lagoon|island|islands|bay|gulf|strait|sound|archipelago|atoll|reef system|national park|marine park|harbou?r|sea|river|fjord|region|county|city|town|village)\b(?!\s+(?:freighter|steamer|boat|ship|vessel|schooner|carrier|tug|barge|passenger|packet|propeller|steamship|freight|dive|diving))/i;
const aboutKind = (extract, site) => {
  if (site && (site.topologies.includes('wreck') || site.topologies.includes('cave'))) return 'site';
  const m = String(extract || '').split(/(?<=\.)\s/)[0].match(ABOUT);
  if (m) return /lake|reservoir|loch|pond|lagoon/i.test(m[1]) ? 'lake' : 'area';
  return /\b(lake|see|lac|lago|loch|reservoir)\b/i.test(site?.name || '') ? 'lake' : 'site';
};
// Point features whose Wikidata depth is the dive's depth.
const POINT_NAME = /\b(hole|cenote|springs?|quarr\w*|pool|cave|caverns?|sink\w*|mine|pit|wreck)\b/i;
const MATCH_KM = 60, POSTED_MATCH_KM = 3;
const km = (a, b) => { const rad = v => v * Math.PI / 180; const h = Math.sin(rad(b.lat - a.latitude) / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.longitude) / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };

(async () => {
  const src = path.join(__dirname, '../src');
  const { catalogSites } = loadSourceModule(path.join(src, 'features/oceanAtlas/catalog.js'), src);
  const sites = catalogSites();
  const byId = new Map(sites.map(site => [site.id, site]));
  // The catalog already carries the last run's published depths (with a depthSource); only a depth in the
  // site's own record means there's nothing to look up — otherwise each run would drop the last run's finds.
  const ownDepth = site => Boolean(site.maxDepthMeters && !site.depthSource);
  const extra = require(path.join(dataDir, 'extraSites.json'));
  const titles = new Map(), qids = new Map(); // title/qid → site ids
  const link = (map, key, id) => { if (!key) return; if (!map.has(key)) map.set(key, []); map.get(key).push(id); };

  for (const [id, , , , depth, , , , source, url] of extra.sites) {
    if (depth || !byId.has(`x-${id}`)) continue; // merged into another record: that one is looked up
    if (/en\.wikipedia\.org\/wiki\//.test(url)) link(titles, decodeURIComponent(url.split('/wiki/')[1]).replace(/_/g, ' '), `x-${id}`);
    else if (/wikidata\.org\/(wiki|entity)\/Q\d+/.test(url)) link(qids, url.match(/Q\d+/)[0], `x-${id}`);
    else if (source === 'curated') {
      // Curated names: the English Wikipedia article with the same name, when there is one.
      const site = byId.get(`x-${id}`);
      const name = site.name.split(' — ')[0];
      // Same name *and* within MATCH_KM (so Wisconsin's Geneva Lake never picks up Lake Geneva, Switzerland).
      for (const q of [`${name} ${site.region || ''}`.trim(), name]) {
        const r = await api(WIKI, { action: 'query', generator: 'search', gsrsearch: q, gsrlimit: '5', gsrnamespace: '0', prop: 'coordinates' });
        const hit = Object.values(r.query?.pages || {}).sort((a, b) => a.index - b.index)
          .find(page => similar(page.title.replace(/\s*\([^)]*\)$/, ''), name) && page.coordinates?.[0] && km(site, page.coordinates[0]) <= MATCH_KM);
        if (hit) { link(titles, hit.title, site.id); break; }
      }
    }
  }
  // Articles the site-facts build already matched to a site.
  const facts = fs.existsSync(path.join(dataDir, 'siteFacts.json')) ? require(path.join(dataDir, 'siteFacts.json')).facts : {};
  const linked = new Set([...titles.values(), ...qids.values()].flat());
  for (const [id, [, article]] of Object.entries(facts)) {
    if (!byId.has(id) || ownDepth(byId.get(id)) || linked.has(id) || !/en\.wikipedia\.org\/wiki\//.test(article || '')) continue;
    link(titles, decodeURIComponent(article.split('/wiki/')[1]).replace(/_/g, ' '), id);
    linked.add(id);
  }
  // Wrecks, caves and springs with no linked article: the English article of the same ship or place,
  // found by name — the core name must be identical (SS / MV / USS prefixes and "(Wreck)" aside), the
  // article must lie within SEARCH_KM and its first sentence must be about a vessel, wreck, cave or spring.
  const core = name => String(name).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\([^)]*\)|,.*$|\s[-–—]\s.*$/g, ' ').replace(/\b(wreck|shipwreck|wreck of|the|ss|mv|ms|uss|hms|hmas|hmcs|usat|usns|uscgc|sas|rms|sms|fv|tug|dive site)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ').trim();
  const VESSEL = /\b(ship|steamship|steamer|freighter|schooner|liner|tug(boat)?|barge|ferry|vessel|destroyer|cruiser|submarine|battleship|frigate|corvette|minesweeper|gunboat|tanker|trawler|yacht|sloop|brig|barque|bark|wreck|shipwreck|aircraft|cave|cavern|spring|sinkhole|cenote|quarry)\b/i;
  const SEARCH_KM = 25;
  const searchable = sites.filter(site => !ownDepth(site) && !linked.has(site.id) && core(site.name).length >= 3
    && (site.topologies.includes('wreck') || site.topologies.includes('cave') || POINT_NAME.test(site.name) || /^(ss|mv|ms|uss|hms|hmas|usat|sas|rms|sms)\s/i.test(site.name)));
  console.log(`searching Wikipedia for ${searchable.length} wrecks / caves / springs by name`);
  for (const site of searchable) {
    const r = await api(WIKI, { action: 'query', generator: 'search', gsrsearch: core(site.name), gsrlimit: '5', gsrnamespace: '0', prop: 'coordinates|extracts', exintro: '1', explaintext: '1', exsentences: '1', exlimit: '5' });
    const hit = Object.values(r.query?.pages || {}).sort((a, b) => a.index - b.index)
      .find(page => core(page.title) === core(site.name) && page.coordinates?.[0] && km(site, page.coordinates[0]) <= SEARCH_KM && VESSEL.test(page.extract || ''));
    if (hit) { link(titles, hit.title, site.id); linked.add(site.id); }
  }
  const osmFile = process.argv[2];
  if (osmFile && fs.existsSync(osmFile)) {
    for (const element of JSON.parse(fs.readFileSync(osmFile, 'utf8')).elements) {
      const id = `osm-${element.type[0]}${element.id}`, tags = element.tags || {};
      if (!byId.has(id) || ownDepth(byId.get(id))) continue;
      if (/^en:/.test(tags.wikipedia || '')) link(titles, tags.wikipedia.slice(3), id);
      else if (/^Q\d+$/.test(tags.wikidata || '')) link(qids, tags.wikidata, id);
    }
  }

  const found = new Map(); // site id → [metres, source, url, lake?]
  const needBody = new Map(); // site id → [article title, url]
  const pageQid = new Map();
  for (const batch of chunks([...titles.keys()], 20)) {
    const r = await api(WIKI, { action: 'query', redirects: '1', prop: 'extracts|pageprops|coordinates', exintro: '1', explaintext: '1', exlimit: '20', ppprop: 'wikibase_item', colimit: 'max', titles: batch.join('|') });
    const back = new Map([...(r.query?.normalized || []), ...(r.query?.redirects || [])].map(x => [x.to, x.from]));
    for (const page of Object.values(r.query?.pages || {})) {
      let title = page.title; while (back.has(title) && !titles.has(title)) title = back.get(title);
      const ids = titles.get(title) || titles.get(page.title) || [];
      const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`;
      const text = depthFromText(page.extract);
      const where = page.coordinates?.[0];
      for (const id of ids) {
        const site = byId.get(id);
        if (where && km(site, where) > MATCH_KM) continue; // the article is about somewhere else
        const kind = aboutKind(page.extract, site);
        if (kind === 'area') continue;
        if (text && text.metres <= MAX_DIVE_DEPTH_M) found.set(id, [text.metres, 'Wikipedia', url, kind === 'lake' ? 1 : 0, text.quote]);
        else {
          if (kind === 'site') needBody.set(id, [page.title, url]);
          if (page.pageprops?.wikibase_item) { pageQid.set(id, [page.pageprops.wikibase_item, url, kind]); link(qids, page.pageprops.wikibase_item, id); }
        }
      }
    }
  }
  // No depth in the lead: read the wreck / diving sections of the full article (one page per request).
  for (const [id, [title, url]] of needBody) {
    const r = await api(WIKI, { action: 'query', redirects: '1', prop: 'extracts', explaintext: '1', titles: title });
    const site = byId.get(id);
    const hit = depthFromArticle(Object.values(r.query?.pages || {})[0]?.extract, site.topologies.includes('wreck') || /\b(wreck|ss|mv|uss|hms|shipwreck)\b/i.test(site.name) || facts[id]?.[2]);
    if (hit) found.set(id, [hit.metres, 'Wikipedia', url, 0, hit.quote]);
  }
  for (const batch of chunks([...qids.keys()], 50)) {
    const r = await api(WIKIDATA, { action: 'wbgetentities', ids: batch.join('|'), props: 'claims' });
    for (const [qid, entity] of Object.entries(r.entities || {})) {
      const metres = wikidataDepth(entity);
      if (!metres || metres > MAX_DIVE_DEPTH_M) continue;
      // Q23397 lake, Q131681 reservoir, Q3253281 pond, Q188025 salt lake, Q1898470 crater lake …
      const lakeItem = (entity.claims?.P31 || []).some(c => ['Q23397', 'Q131681', 'Q3253281', 'Q188025', 'Q204324', 'Q1140845', 'Q211302'].includes(c.mainsnak?.datavalue?.value?.id));
      for (const id of qids.get(qid) || []) {
        const site = byId.get(id);
        const lake = lakeItem || pageQid.get(id)?.[2] === 'lake';
        const point = site.topologies.includes('wreck') || site.topologies.includes('cave') || POINT_NAME.test(site.name);
        // Wikidata depth of a bay, strait or island area says nothing about a dive: keep lakes and point features.
        if (!found.has(id) && (lake || point)) found.set(id, [metres, 'Wikidata', pageQid.get(id)?.[1] || `https://www.wikidata.org/wiki/${qid}`, lake && !point ? 1 : 0, 'vertical depth (P4511)']);
      }
    }
  }

  // Posted depths from the curated list.
  const curatedList = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/us-inland-dive-sites.json'), 'utf8')).sites.filter(entry => entry.maxDepthFt);
  let lastNominatim = 0;
  for (const entry of curatedList) {
    const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q: entry.query, format: 'jsonv2', limit: '1', countrycodes: 'us' })}`;
    const file = path.join(CACHE_DIR, crypto.createHash('sha1').update(url).digest('hex') + '.json');
    let hit = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
    if (!hit) {
      const wait = lastNominatim + 1100 - Date.now(); if (wait > 0) await sleep(wait); lastNominatim = Date.now();
      hit = await fetch(url, { headers: { 'User-Agent': USER_AGENT } }).then(res => res.json()).catch(() => null);
      if (hit) fs.writeFileSync(file, JSON.stringify(hit));
    }
    const at = hit?.[0] && { lat: Number(hit[0].lat), lon: Number(hit[0].lon) };
    const name = entry.name.split(' — ')[0];
    const matches = at ? sites.filter(site => km(site, at) <= POSTED_MATCH_KM && [name, ...(entry.mapNames || [])].some(n => similar(site.name.split(' — ')[0], n))) : [];
    if (!matches.length) console.log(`  posted depth not matched: ${entry.name}`);
    for (const site of matches) found.set(site.id, [Math.round(entry.maxDepthFt * FT * 10) / 10, 'Posted', entry.depthSource, entry.depthIsWholeLake ? 1 : 0, `${entry.maxDepthFt} ft posted`]);
  }

  const quotes = new Map([...found].map(([id, row]) => [id, row.pop()]));
  const depths = Object.fromEntries([...found].sort(([a], [b]) => a.localeCompare(b)));
  const stats = { posted: 0, wikipedia: 0, wikidata: 0, lake: 0 };
  for (const [, source, , lake] of Object.values(depths)) { stats[source.toLowerCase()]++; if (lake) stats.lake++; }
  fs.writeFileSync(path.join(dataDir, 'publishedDepths.json'), JSON.stringify({ source: 'Wikipedia article leads and Wikidata vertical depth (P4511)', retrievedAt: new Date().toISOString(),
    fields: ['maxDepthMeters', 'source', 'url', 'wholeLake'], stats, depths }));
  if (process.env.DEPTHS_REVIEW) for (const [id, [m, source]] of Object.entries(depths)) console.log(`  ${byId.get(id)?.name} · ${m} m · ${source}${depths[id][3] ? ' · lake' : ''} · “${quotes.get(id)}”`);
  console.log(`${Object.keys(depths).length} published depths (from ${titles.size} articles, ${qids.size} Wikidata items)`, stats);
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
