#!/usr/bin/env node
/*
 * Marine life where iNaturalist has little or nothing: species recorded by scientific surveys in
 * OBIS, the Ocean Biodiversity Information System (IOC-UNESCO) → src/features/oceanAtlas/data/marineLifeObis.json.
 *
 * Remote reefs, offshore wrecks and little-visited coasts often have no iNaturalist photos but do
 * have reef-fish transects, museum records and fisheries surveys. For every ocean site whose guide
 * shows fewer than four animals, the sites are grouped within 40 km and OBIS's species checklist for
 * the surrounding box is read: the most-recorded sharks & rays, turtles, marine mammals, cephalopods
 * and nudibranchs, then fish — the same groups and counts as the iNaturalist snapshot. Survey records
 * say nothing about season, so no months are claimed. Common names and openly licensed photos come
 * from iNaturalist's taxon pages (CC0 / CC BY / CC BY-SA only).
 *
 * Same shape as marineLife.json, so the app treats both alike.
 *
 *   OBIS_CACHE=dir node scripts/build-marine-life-obis.cjs
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { loadSourceModule } = require('./lib/load-source-module.cjs');

const OBIS = 'https://api.obis.org/v3';
const INAT = 'https://api.inaturalist.org/v1';
const USER_AGENT = 'DMZScuba/1.0 (+https://www.dmzscuba.com) marine-life snapshot (OBIS gaps)';
const CACHE_DIR = process.env.OBIS_CACHE || path.join(os.tmpdir(), 'dmz-obis-cache');
const src = path.resolve(__dirname, '../src');
const outputPath = path.join(src, 'features/oceanAtlas/data/marineLifeObis.json');
const RADIUS_KM = 40, HIGHLIGHT_COUNT = 6, FISH_COUNT = 4, FEW = 4;
const OPEN_LICENSES = new Set(['cc0', 'cc-by', 'cc-by-sa']);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const gaps = { [OBIS]: 300, [INAT]: 1100 };
const last = {};
async function get(url) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, crypto.createHash('sha1').update(url).digest('hex') + '.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const host = url.startsWith(OBIS) ? OBIS : INAT;
  for (let attempt = 0; attempt < 6; attempt++) {
    const wait = (last[host] || 0) + gaps[host] - Date.now();
    if (wait > 0) await sleep(wait);
    last[host] = Date.now();
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(120_000) }).catch(() => null);
    if (response?.ok) { const json = await response.json(); fs.writeFileSync(file, JSON.stringify(json)); return json; }
    await sleep(8000 * (attempt + 1));
  }
  throw new Error(`Failed after retries: ${url}`);
}

function distanceKm(a, b) {
  const rad = (value) => value * Math.PI / 180;
  const h = Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

// The groups divers look for, in OBIS (WoRMS) terms.
function group(row) {
  if (row.class === 'Elasmobranchii') return 'sharks';
  if (row.order === 'Testudines') return 'turtles';
  if (row.class === 'Mammalia' && (row.infraorder === 'Cetacea' || row.order === 'Sirenia' || row.family === 'Otariidae' || row.family === 'Phocidae')) return 'mammals';
  if (row.class === 'Cephalopoda') return 'cephalopods';
  if (row.order === 'Nudibranchia') return 'nudibranchs';
  if (row.class === 'Teleostei' || row.class === 'Actinopteri') return 'fish';
  return null;
}

async function checklist(centre) {
  const dLat = RADIUS_KM / 111, dLon = RADIUS_KM / (111 * Math.max(0.2, Math.cos(centre.latitude * Math.PI / 180)));
  const [s, n, w, e] = [centre.latitude - dLat, centre.latitude + dLat, centre.longitude - dLon, centre.longitude + dLon].map((v) => v.toFixed(3));
  const polygon = `POLYGON((${w} ${s},${e} ${s},${e} ${n},${w} ${n},${w} ${s}))`;
  const { results = [] } = await get(`${OBIS}/checklist?geometry=${encodeURIComponent(polygon)}&size=2000`);
  const rows = results.filter((row) => row.taxonRank === 'Species' && row.is_marine !== false && row.records > 0 && group(row));
  const top = (predicate, count) => rows.filter(predicate).sort((a, b) => b.records - a.records).slice(0, count);
  return [...top((row) => group(row) !== 'fish', HIGHLIGHT_COUNT), ...top((row) => group(row) === 'fish', FISH_COUNT)];
}

(async () => {
  const { catalogSites } = loadSourceModule(path.join(src, 'features/oceanAtlas/catalog.js'), src);
  const { isInland } = loadSourceModule(path.join(src, 'features/oceanAtlas/inland.js'), src);
  const { seasonGuide } = loadSourceModule(path.join(src, 'features/oceanAtlas/seasons.js'), src);
  const MARINE_LIFE = require(path.join(src, 'features/oceanAtlas/data/marineLife.json'));
  // Thin by diver sightings alone: the guide already includes the last run's survey records.
  const thin = catalogSites().filter((site) => !isInland(site) && seasonGuide(site).animals.filter((animal) => !animal.survey).length < FEW);
  // Group within 40 km so neighbouring sites share one survey box.
  const places = [];
  for (const site of thin) {
    if (places.some((place) => distanceKm(place, site) < RADIUS_KM)) continue;
    places.push({ latitude: Math.round(site.latitude * 100) / 100, longitude: Math.round(site.longitude * 100) / 100, name: site.region || site.country || '' });
  }
  console.log(`${thin.length} ocean sites with fewer than ${FEW} animals → ${places.length} survey boxes`);
  const scientificToId = new Map(Object.entries(MARINE_LIFE.taxa).map(([id, row]) => [row[1], Number(id)]));
  const taxa = {}, output = [];
  for (const [i, place] of places.entries()) {
    const rows = await checklist(place).catch((error) => { console.warn(error.message); return []; });
    const species = [];
    for (const row of rows) {
      let id = scientificToId.get(row.scientificName);
      if (!id) {
        const match = (await get(`${INAT}/taxa?q=${encodeURIComponent(row.scientificName)}&rank=species&is_active=true`)).results?.find((t) => t.name === row.scientificName);
        if (!match) continue;
        id = match.id;
        scientificToId.set(row.scientificName, id);
      }
      species.push([id, row.records, 0, '000000000000']);
    }
    if (species.length) output.push([place.latitude, place.longitude, RADIUS_KM, place.name, species]);
    if (i % 10 === 0) console.log(`${i + 1}/${places.length} ${place.name}: ${species.length} species`);
  }
  // Names and photos for taxa the iNaturalist snapshot doesn't already carry.
  const needed = [...new Set(output.flatMap((place) => place[4].map((row) => row[0])))].filter((id) => !MARINE_LIFE.taxa[id]);
  for (let i = 0; i < needed.length; i += 30) {
    const { results } = await get(`${INAT}/taxa/${needed.slice(i, i + 30).join(',')}`);
    for (const taxon of results) {
      const open = (taxon.taxon_photos || []).map((entry) => entry.photo).find((p) => OPEN_LICENSES.has(p?.license_code));
      taxa[taxon.id] = [taxon.preferred_common_name || taxon.name, taxon.name, taxon.iconic_taxon_name || '', open ? open.medium_url || open.url : '', open?.attribution || '', open?.license_code || ''];
    }
  }
  const result = {
    source: 'OBIS — Ocean Biodiversity Information System (IOC-UNESCO)', sourceUrl: 'https://obis.org/', retrievedAt: new Date().toISOString(),
    method: `Most-recorded species within ${RADIUS_KM} km in OBIS survey and specimen records, for ocean sites where iNaturalist has fewer than ${FEW} animals. Records carry no season: index and peak are empty.`,
    placeFields: ['latitude', 'longitude', 'radiusKm', 'name', 'species'], speciesFields: ['taxonId', 'records', 'peakMask', 'index'],
    taxonFields: ['common', 'scientific', 'group', 'photoUrl', 'attribution', 'license'], taxa, places: output,
  };
  fs.writeFileSync(outputPath, JSON.stringify(result));
  console.log(`Wrote ${output.length} places, ${Object.keys(taxa).length} new taxa (${(fs.statSync(outputPath).size / 1024).toFixed(0)} KB)`);
})().catch((error) => { console.error(error.message); process.exit(1); });
