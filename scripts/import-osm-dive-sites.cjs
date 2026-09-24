#!/usr/bin/env node
/*
 * Import named dive spots from OpenStreetMap (© OpenStreetMap contributors, ODbL 1.0)
 * into a compact, committed snapshot: src/features/oceanAtlas/data/osmSites.json.
 *
 * Kept: features tagged scuba_diving:divespot=yes or sport=scuba_diving on a
 * physical feature (reef, wreck, cave, spring, water, pier, attraction…).
 * Dropped: businesses and facilities (dive centres, shops, clubs, schools, pools,
 * hotels, "dive base" names), unnamed features, and duplicates of sites already
 * in the catalog (≤ 150 m, or ≤ 1.5 km with a similar name).
 * Freshwater: a spot more than 3 km inside a landmass (bundled coastline) is an
 * inland lake/quarry/spring, so it never gets ocean temperatures.
 *
 *   node scripts/import-osm-dive-sites.cjs [overpass.json]
 */
const fs = require('node:fs');
const path = require('node:path');

const MIRRORS = ['https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass-api.de/api/interpreter'];
const QUERY = '[out:json][timeout:180];(nwr["sport"="scuba_diving"];nwr["scuba_diving:divespot"="yes"];nwr["sport"="diving"]["natural"];);out center tags;';
const USER_AGENT = 'DMZScuba/1.0 (+https://www.dmzscuba.com) dive-site import';
const { landIndex, inland, catalogPoints, duplicateIndex, dataDir } = require('./lib/dive-site-import.cjs');
const outputPath = path.join(dataDir, 'osmSites.json');

const TOPOLOGY_CODES = ['reef', 'wall', 'wreck', 'pinnacle', 'cave', 'cavern', 'muck', 'drift', 'shore', 'other'];

const BUSINESS_KEYS = ['shop', 'amenity', 'office', 'club', 'craft', 'healthcare'];
const FACILITY_LEISURE = new Set(['sports_centre', 'fitness_centre', 'swimming_pool', 'water_park', 'sports_hall', 'pitch', 'marina']);
const LODGING = new Set(['hotel', 'guest_house', 'hostel', 'motel', 'apartment', 'camp_site', 'chalet', 'information', 'travel_agency']);
const BUSINESS_NAME = /\b(dive|diving|scuba)\s*(cent(er|re)|shop|school|resort|club|base|academy|store|hotel|lodge|instruction|training|lessons|charters?|tours?|services|adventures|company|supply|supplies|world|team)\b|tauch(basis|schule|cent(er|re)|club|shop|sport)|centro (de )?buceo|escuela de buceo|club de (plong|buceo)|(école|base|centre) de plong|diving (company|agency)/i;

async function overpass() {
  if (process.argv[2]) return JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  for (const url of MIRRORS) {
    const response = await fetch(url, { method: 'POST', headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' }, body: `data=${encodeURIComponent(QUERY)}` }).catch(() => null);
    if (response?.ok) { const json = await response.json().catch(() => null); if (json?.elements) return json; }
  }
  throw new Error('All Overpass mirrors failed; pass a saved response file instead.');
}

// Dive parks are often mapped as the business that runs them ("Haigh Quarry", shop=scuba_diving).
const VENUE_NAME = /\b(quarry|quarries|springs?|lake|pond|mine|sinkhole|cenote|blue hole|crater|(dive|scuba) park)\b/i;
function isDiveSpot(tags) {
  if (!tags.name && !tags['name:en']) return false;
  const label = tags['name:en'] || tags.name;
  const venue = VENUE_NAME.test(label) && !/\b(divers?|supply|supplies|school|cent(er|re)|watersports?|store|shop)\b/i.test(label)
    && (tags.shop === 'scuba_diving' || tags.amenity === 'dive_centre' || tags.leisure === 'sports_centre');
  if (venue) return true;
  if (BUSINESS_KEYS.some(key => key in tags)) return false;
  if (FACILITY_LEISURE.has(tags.leisure) || LODGING.has(tags.tourism)) return false;
  if (tags.building && !tags.natural && !tags.historic && !tags.water) return false;
  if (BUSINESS_NAME.test(tags['name:en'] || tags.name)) return false;
  // "Dive Otago", "Scuba Lanka", "… Diving" with a website: a business, not a place.
  if ((tags.website || tags['contact:website']) && /^(go )?(dive|scuba)\b|\b(diving|scuba)$/i.test((tags['name:en'] || tags.name).trim())) return false;
  return tags['scuba_diving:divespot'] === 'yes' || tags.sport === 'scuba_diving' || tags.sport === 'diving';
}

// "Wreck" in other languages (German Wrack, Polish/Dutch wrak, French épave, Italian relitto,
// Spanish pecio/naufragio, Scandinavian vrak, Finnish hylky) → English, so names read consistently.
const FOREIGN_WRECK = /\b(wrack|wrak|épave|epave|relitto|pecio|naufragio|vrak|hylky)\b/i;
function englishWreckName(name) {
  if (!FOREIGN_WRECK.test(name)) return name;
  let out = name.replace(new RegExp(`\\s*\\((${FOREIGN_WRECK.source.slice(3, -3)})\\)`, 'ig'), /\bwreck\b/i.test(name) ? '' : ' (Wreck)');
  // Keep the surrounding style: "fighter plane wreck", but "El Hawi Star Wreck".
  out = out.replace(new RegExp(FOREIGN_WRECK.source, 'ig'), (word, _w, offset, text) => /\b[a-z][a-z]*\s+$/.test(text.slice(0, offset)) ? 'wreck' : 'Wreck');
  return out.replace(/\s+/g, ' ').trim();
}

// "30", "30 m", "5-30", "100 ft" → metres (the deepest number given).
function depthMetres(tags) {
  const raw = tags['scuba_diving:maxdepth'] || tags['scuba_diving:depth'] || tags.maxdepth || tags['wreck:max_depth'] || tags['wreck:depth'] || tags.depth || tags['water:depth'] || '';
  const numbers = String(raw).replace(',', '.').match(/\d+(\.\d+)?/g);
  if (!numbers) return 0;
  const value = Math.max(...numbers.map(Number)) * (/ft|feet|'/i.test(raw) ? 0.3048 : 1);
  return value > 0 && value < 200 ? Math.round(value) : 0;
}

function features(tags) {
  const found = new Set();
  const typeText = [tags['scuba_diving:type'], ...Object.keys(tags).filter(key => key.startsWith('scuba_diving:type:') && tags[key] !== 'no').map(key => key.slice(18))].join(';').toLowerCase();
  for (const code of TOPOLOGY_CODES) if (new RegExp(`\\b${code}\\b`).test(typeText)) found.add(code);
  if (tags.historic === 'wreck' || tags['seamark:type'] === 'wreck') found.add('wreck');
  if (tags.natural === 'reef') found.add('reef');
  if (tags.natural === 'cave_entrance') found.add('cave');
  return [...found];
}

function entry(tags) {
  const text = `${tags['scuba_diving:entry'] || ''};${tags['scuba_diving:entry:boat'] === 'yes' ? 'boat' : ''};${tags['scuba_diving:entry:shore'] === 'yes' ? 'shore' : ''}`;
  return /boat/.test(text) && !/shore/.test(text) ? 'boat' : /shore|beach|land/.test(text) && !/boat/.test(text) ? 'shore' : '';
}

(async () => {
  const raw = await overpass();
  const rings = landIndex();
  const existing = catalogPoints();
  const dupes = duplicateIndex(existing);
  const stats = { fetched: raw.elements.length, businesses: 0, unnamed: 0, duplicates: 0, kept: 0, inland: 0, withDepth: 0 };
  const sites = [];
  for (const element of raw.elements) {
    const tags = element.tags || {};
    if (!tags.name && !tags['name:en']) { stats.unnamed++; continue; }
    if (!isDiveSpot(tags)) { stats.businesses++; continue; }
    const latitude = element.lat ?? element.center?.lat, longitude = element.lon ?? element.center?.lon;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    const site = { id: `${element.type[0]}${element.id}`, name: englishWreckName((tags['name:en'] || tags.name).replace(/\s+/g, ' ').replace(/\s+(office|check[- ]in|\(scuba diving\))$/i, '').trim()).slice(0, 80), latitude: Math.round(latitude * 1e5) / 1e5, longitude: Math.round(longitude * 1e5) / 1e5 };
    if (dupes.isDuplicate(site)) { stats.duplicates++; continue; }
    site.depth = depthMetres(tags);
    site.entry = entry(tags);
    site.topologies = features(tags);
    if (/\bwreck\b/i.test(site.name) && !site.topologies.includes('wreck')) site.topologies.push('wreck');
    const freshTagged = ['water', 'spring'].includes(tags.natural) || /lake|pond|quarry|reservoir|river/.test(tags.water || '') || tags.landuse === 'quarry';
    site.fresh = freshTagged || inland(site, rings);
    site.difficulty = String(tags['scuba_diving:difficulty'] || '').slice(0, 20);
    sites.push(site); dupes.add(site);
    stats.kept++; if (site.fresh) stats.inland++; if (site.depth) stats.withDepth++;
  }
  sites.sort((a, b) => a.id.localeCompare(b.id));
  // Compact rows: [id, name, lat, lon, depthM, entry(0 none/1 boat/2 shore), topologyMask, fresh(0/1), difficulty]
  const rows = sites.map(site => [site.id, site.name, site.latitude, site.longitude, site.depth, site.entry === 'boat' ? 1 : site.entry === 'shore' ? 2 : 0,
    site.topologies.reduce((mask, code) => mask | (1 << TOPOLOGY_CODES.indexOf(code)), 0), site.fresh ? 1 : 0, site.difficulty]);
  const output = { source: 'OpenStreetMap contributors', sourceUrl: 'https://www.openstreetmap.org/', license: 'ODbL 1.0', licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
    retrievedAt: new Date().toISOString(), topologyCodes: TOPOLOGY_CODES, fields: ['osmId', 'name', 'latitude', 'longitude', 'maxDepthMeters', 'entry', 'topologyMask', 'fresh', 'difficulty'], stats, sites: rows };
  fs.writeFileSync(outputPath, JSON.stringify(output));
  console.log(JSON.stringify(stats), `→ ${(fs.statSync(outputPath).size / 1024).toFixed(0)} KB`);
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
