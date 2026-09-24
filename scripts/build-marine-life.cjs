#!/usr/bin/env node
/*
 * Build the "When to go / marine life" snapshot used by the journey planner.
 * For every dive area and every cluster of catalog sites, iNaturalist
 * research-grade, wild observations give:
 *   - the marine animals most often recorded nearby (sharks & rays, turtles,
 *     cetaceans, sirenians, cephalopods, nudibranchs, then ray-finned fish);
 *   - a month-of-year pattern for each, normalized by all marine observations
 *     in the same place so busy tourist months do not look like "seasons".
 * Photos are kept only when openly licensed for reuse (CC0, CC BY, CC BY-SA),
 * with attribution; Wikimedia Commons lead images are the fallback under the
 * same rule. The phone never queries iNaturalist; this snapshot is committed.
 *
 *   node scripts/build-marine-life.cjs            (resumable; responses cached)
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { loadSourceModule } = require('./lib/load-source-module.cjs');

const API = 'https://api.inaturalist.org/v1';
const USER_AGENT = 'DMZScuba/1.0 (+https://www.dmzscuba.com) marine-life snapshot';
const REQUEST_GAP_MS = 1100; // iNaturalist asks for roughly one request per second
const CACHE_DIR = process.env.MARINE_LIFE_CACHE || path.join(os.tmpdir(), 'dmz-marine-life-cache');
const outputPath = path.resolve(__dirname, '../src/features/oceanAtlas/data/marineLife.json');
const src = path.resolve(__dirname, '../src');

const HIGHLIGHT_TAXA = [47273, 39657, 152871, 46306, 47459, 47113]; // Elasmobranchii, Cheloniidae, Cetacea, Sirenia, Cephalopoda, Nudibranchia
const FISH = 47178; // Actinopterygii
const HIGHLIGHT_COUNT = 6, FISH_COUNT = 4;
const AREA_RADIUS_KM = 60, CLUSTER_RADIUS_KM = 40;
const MIN_SEASON_RECORDS = 40; // below this a monthly pattern is not claimed
const OPEN_LICENSES = new Set(['cc0', 'cc-by', 'cc-by-sa']);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let lastRequest = 0;
async function get(url) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, crypto.createHash('sha1').update(url).digest('hex') + '.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  for (let attempt = 0; attempt < 8; attempt++) {
    const wait = lastRequest + REQUEST_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequest = Date.now();
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } }).catch(() => null);
    if (response?.ok) { const json = await response.json(); fs.writeFileSync(file, JSON.stringify(json)); return json; }
    // Back off on 429/5xx/network errors, honouring Retry-After when given.
    const retryAfter = Number(response?.headers.get('retry-after'));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 10000 * (attempt + 1));
  }
  throw new Error(`Failed after retries: ${url}`);
}

function distanceKm(a, b) {
  const rad = value => value * Math.PI / 180;
  const h = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

function catalogPoints() {
  const g = require('../src/features/oceanAtlas/data/globalSites.json');
  const buffer = Buffer.from(g.coordinatesBase64, 'base64');
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.length);
  const points = [];
  for (let i = 0; i < buffer.length / 8; i++) points.push([view.getInt32(i * 8, true) / 1e5, view.getInt32(i * 8 + 4, true) / 1e5]);
  for (const site of [...require('../src/features/oceanAtlas/data/sites.json'), ...require('../src/features/oceanAtlas/data/curatedSites.json')]) points.push([site.latitude, site.longitude]);
  // OpenStreetMap salt-water spots (freshwater lakes/quarries have no marine life to sample).
  for (const [, , latitude, longitude, , , , fresh] of require('../src/features/oceanAtlas/data/osmSites.json').sites) if (!fresh) points.push([latitude, longitude]);
  return points;
}

function places() {
  const { DIVE_REGIONS, REMOTE_DIVE_AREAS } = loadSourceModule(path.join(src, 'features/oceanAtlas/diveRegions.js'), src);
  const list = [...DIVE_REGIONS.flatMap(region => region.areas), ...REMOTE_DIVE_AREAS]
    .map(area => ({ name: area.name, center: [area.latitude, area.longitude], radius: AREA_RADIUS_KM }));
  for (const point of catalogPoints()) {
    if (list.some(place => distanceKm(point, place.center) < place.radius)) continue;
    list.push({ name: '', center: [Math.round(point[0] * 100) / 100, Math.round(point[1] * 100) / 100], radius: CLUSTER_RADIUS_KM });
  }
  return list;
}

const query = (place, extra) => `lat=${place.center[0]}&lng=${place.center[1]}&radius=${place.radius}&quality_grade=research&captive=false&${extra}`;
const monthly = json => Array.from({ length: 12 }, (_, i) => json.results.month_of_year[String(i + 1)] || 0);

// Relative monthly index (0–9) and peak season, normalized by overall recording
// effort and smoothed across neighbouring months. A peak is claimed only for a
// single contiguous run of 2–6 months that clearly stands out from the rest.
function season(counts, baseline) {
  const total = counts.reduce((a, b) => a + b, 0);
  const rel = counts.map((count, i) => baseline[i] > 0 ? count / baseline[i] : 0);
  const smooth = rel.map((value, i) => (rel[(i + 11) % 12] + 2 * value + rel[(i + 1) % 12]) / 4);
  const max = Math.max(...smooth);
  const index = smooth.map(value => max > 0 ? Math.round(value / max * 9) : 0).join('');
  if (total < MIN_SEASON_RECORDS) return { total, index, peak: 0 };
  const mean = smooth.reduce((a, b) => a + b, 0) / 12;
  const high = smooth.map(value => value >= 1.25 * mean);
  if (high.every(Boolean) || !high.some(Boolean)) return { total, index, peak: 0 };
  const start = high.findIndex((value, i) => value && !high[(i + 11) % 12]);
  const runs = [];
  for (let k = 0, i = start; k < 12; k++, i = (i + 1) % 12) {
    if (high[i] && !high[(i + 11) % 12]) runs.push([]);
    if (high[i]) runs[runs.length - 1].push(i);
  }
  const run = runs.sort((a, b) => b.length - a.length)[0];
  const inside = run.reduce((sum, i) => sum + smooth[i], 0) / run.length;
  const outside = smooth.filter((_, i) => !run.includes(i));
  const rest = outside.reduce((a, b) => a + b, 0) / outside.length;
  const peak = run.length >= 2 && run.length <= 6 && inside >= 1.6 * rest ? run.reduce((mask, i) => mask | (1 << i), 0) : 0;
  return { total, index, peak };
}

async function describe(place) {
  const top = async (taxa, count) => (await get(`${API}/observations/species_counts?${query(place, `taxon_id=${taxa}&per_page=${count}`)}`)).results;
  const species = [...await top(HIGHLIGHT_TAXA.join(','), HIGHLIGHT_COUNT), ...await top(FISH, FISH_COUNT)].filter(r => r.taxon?.rank === 'species');
  if (!species.length) return null;
  const baseline = monthly(await get(`${API}/observations/histogram?${query(place, `taxon_id=${[...HIGHLIGHT_TAXA, FISH].join(',')}&interval=month_of_year`)}`));
  const rows = [];
  for (const record of species) {
    // A species whose histogram keeps failing is skipped (not cached), so a rerun fills it in.
    const histogram = await get(`${API}/observations/histogram?${query(place, `taxon_id=${record.taxon.id}&interval=month_of_year`)}`).catch(() => null);
    if (!histogram) { console.warn(`skipped ${record.taxon.name} near ${place.center}`); continue; }
    const counts = monthly(histogram);
    const { total, index, peak } = season(counts, baseline);
    rows.push([record.taxon.id, total, peak, index]);
  }
  return rows;
}

// Wikimedia Commons fallback: the taxon's Wikipedia lead image, kept only when openly licensed.
const COMMONS_OPEN = /^(cc0|public domain|pd\b|cc by(-sa)?( \d(\.\d)?)?$)/i;
async function commonsPhoto(wikipediaUrl) {
  const title = decodeURIComponent(String(wikipediaUrl || '').split('/wiki/')[1] || '');
  if (!title) return null;
  const page = await get(`https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=pageimages&piprop=name&titles=${encodeURIComponent(title)}`);
  const file = Object.values(page.query?.pages || {})[0]?.pageimage;
  if (!file) return null;
  const info = await get(`https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=500&titles=${encodeURIComponent(`File:${file}`)}`);
  const image = Object.values(info.query?.pages || {})[0]?.imageinfo?.[0];
  const license = image?.extmetadata?.LicenseShortName?.value || '';
  if (!image?.thumburl || !COMMONS_OPEN.test(license.trim())) return null;
  const artist = String(image.extmetadata?.Artist?.value || 'Unknown').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
  return { url: image.thumburl, attribution: `${artist} · Wikimedia Commons (${license})`, license: license.toLowerCase().replace(/\s+/g, '-') };
}

async function photos(ids) {
  const taxa = {};
  for (let i = 0; i < ids.length; i += 30) {
    const batch = ids.slice(i, i + 30);
    const { results } = await get(`${API}/taxa/${batch.join(',')}`);
    for (const taxon of results) {
      const open = (taxon.taxon_photos || []).map(entry => entry.photo).find(p => OPEN_LICENSES.has(p?.license_code));
      const photo = open ? { url: open.medium_url || open.url, attribution: open.attribution, license: open.license_code }
        : await commonsPhoto(taxon.wikipedia_url).catch(() => null);
      taxa[taxon.id] = [taxon.preferred_common_name || taxon.name, taxon.name, taxon.iconic_taxon_name || '',
        photo?.url || '', photo?.attribution || '', photo?.license || ''];
    }
  }
  return taxa;
}

(async () => {
  const list = places().slice(0, Number(process.env.MARINE_LIFE_LIMIT) || undefined); // limit only for smoke tests
  console.log(`${list.length} places (${list.filter(p => p.name).length} named areas)`);
  // Optional start offset lets parallel workers share the cache from different points; output order is unchanged.
  const offset = Number(process.env.MARINE_LIFE_OFFSET) || 0;
  for (let k = 0; k < list.length; k++) await describe(list[(k + offset) % list.length]).catch(error => console.warn(error.message));
  const output = [];
  for (const [i, place] of list.entries()) {
    const rows = await describe(place).catch(error => { console.warn(error.message); return null; });
    if (rows) output.push([place.center[0], place.center[1], place.radius, place.name, rows]);
    if (i % 10 === 0) console.log(`${i + 1}/${list.length} ${place.name || place.center.join(',')}: ${rows ? rows.length : 0} species`);
  }
  // Editorial (sourced) species also need a photo even when not among the most recorded.
  const { MARINE_REGIONS } = loadSourceModule(path.join(src, 'features/oceanAtlas/regions.js'), src);
  const editorial = [];
  for (const scientific of new Set(MARINE_REGIONS.flatMap(region => region.species.map(entry => entry.scientific)))) {
    const match = (await get(`${API}/taxa?q=${encodeURIComponent(scientific)}&rank=species&is_active=true`)).results.find(t => t.name === scientific);
    if (match) editorial.push(match.id);
  }
  const ids = [...new Set([...output.flatMap(place => place[4].map(row => row[0])), ...editorial])].sort((a, b) => a - b);
  const taxa = await photos(ids);
  const result = {
    source: 'iNaturalist research-grade observations', sourceUrl: 'https://www.inaturalist.org/', retrievedAt: new Date().toISOString(),
    method: 'Most-recorded marine species within each radius. index: 12 digits (Jan–Dec), relative monthly frequency normalized by all marine records nearby. peak: month bitmask for one clear contiguous season, only when ≥ 40 records.',
    placeFields: ['latitude', 'longitude', 'radiusKm', 'name', 'species'], speciesFields: ['taxonId', 'records', 'peakMask', 'index'],
    taxonFields: ['common', 'scientific', 'group', 'photoUrl', 'attribution', 'license'], taxa, places: output,
  };
  fs.writeFileSync(outputPath, JSON.stringify(result));
  console.log(`Wrote ${output.length} places, ${ids.length} taxa (${(fs.statSync(outputPath).size / 1024).toFixed(0)} KB)`);
})().catch(error => { console.error(error.message); process.exit(1); });
