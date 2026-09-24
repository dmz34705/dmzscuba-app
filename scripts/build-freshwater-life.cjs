#!/usr/bin/env node
/*
 * Freshwater life for inland dive sites → src/features/oceanAtlas/data/freshwaterLife.json
 *
 * Inland sites (see build-inland-conditions.cjs) are grouped within CLUSTER_KM; for
 * each group iNaturalist research-grade, wild observations within RADIUS_KM give the
 * most-recorded fish plus other aquatic animals divers meet in lakes, quarries and
 * springs: crayfish, freshwater turtles, mussels, freshwater jellyfish, sponges and
 * mudpuppies. Photos are kept only when openly licensed (CC0 / CC BY / CC BY-SA),
 * with Wikimedia Commons lead images as the fallback under the same rule.
 *
 *   node scripts/build-freshwater-life.cjs     (resumable; responses cached)
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { dataDir } = require('./lib/dive-site-import.cjs');

const API = 'https://api.inaturalist.org/v1';
const USER_AGENT = 'DMZScuba/1.0 (+https://www.dmzscuba.com) freshwater-life snapshot';
const CACHE_DIR = process.env.FRESHWATER_CACHE || path.join(os.tmpdir(), 'dmz-freshwater-cache');
const GAP_MS = 2000; // shares iNaturalist's ~60/min budget with other builds
const RADIUS_KM = 15, CLUSTER_KM = 12;
const FISH = 47178; // Actinopterygii
// Crayfish (Cambaridae, Astacidae, Parastacidae), freshwater turtles (Emydidae, Chelydridae,
// Kinosternidae, Trionychidae), mussels (Unionidae), Craspedacusta sowerbii, Spongillidae, Necturus.
const OTHER_AQUATIC = [47782, 53709, 85966, 39760, 39680, 39699, 39539, 51903, 208528, 171254, 27679];
const OPEN_LICENSES = new Set(['cc0', 'cc-by', 'cc-by-sa']);
const COMMONS_OPEN = /^(cc0|public domain|pd\b|cc by(-sa)?( \d(\.\d)?)?$)/i;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let last = 0;
async function get(url) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, crypto.createHash('sha1').update(url).digest('hex') + '.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  for (let attempt = 0; attempt < 8; attempt++) {
    const wait = last + GAP_MS - Date.now(); if (wait > 0) await sleep(wait); last = Date.now();
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } }).catch(() => null);
    if (response?.ok) { const json = await response.json(); fs.writeFileSync(file, JSON.stringify(json)); return json; }
    const retryAfter = Number(response?.headers.get('retry-after'));
    await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 10000 * (attempt + 1));
  }
  throw new Error(`Failed: ${url}`);
}

function km(a, b) {
  const rad = v => v * Math.PI / 180;
  const h = Math.sin(rad(b[0] - a[0]) / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

async function commonsPhoto(wikipediaUrl) {
  const title = decodeURIComponent(String(wikipediaUrl || '').split('/wiki/')[1] || '');
  if (!title) return null;
  const page = await get(`https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=pageimages&piprop=name&titles=${encodeURIComponent(title)}`);
  const name = Object.values(page.query?.pages || {})[0]?.pageimage;
  if (!name) return null;
  const info = await get(`https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=500&titles=${encodeURIComponent(`File:${name}`)}`);
  const image = Object.values(info.query?.pages || {})[0]?.imageinfo?.[0];
  const license = image?.extmetadata?.LicenseShortName?.value || '';
  if (!image?.thumburl || !COMMONS_OPEN.test(license.trim())) return null;
  const artist = String(image.extmetadata?.Artist?.value || 'Unknown').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().replace(/^(.{4,}?)\s*\1/, '$1 ').trim().slice(0, 80);
  return { url: image.thumburl, attribution: `${artist} · Wikimedia Commons (${license})`, license: license.toLowerCase().replace(/\s+/g, '-') };
}

(async () => {
  const inland = require(path.join(dataDir, 'inlandConditions.json'));
  const { loadSourceModule } = require('./lib/load-source-module.cjs');
  const src = path.join(__dirname, '../src');
  const { catalogSite } = loadSourceModule(path.join(src, 'features/oceanAtlas/catalog.js'), src);
  const points = Object.keys(inland.sites).map(id => catalogSite(id)).filter(Boolean).map(site => [site.latitude, site.longitude]);
  const clusters = [];
  for (const point of points) if (!clusters.some(c => km(point, c) < CLUSTER_KM)) clusters.push([Math.round(point[0] * 100) / 100, Math.round(point[1] * 100) / 100]);
  console.log(`${points.length} inland sites → ${clusters.length} areas`);
  const places = [];
  for (const [i, [lat, lon]] of clusters.entries()) {
    const q = `lat=${lat}&lng=${lon}&radius=${RADIUS_KM}&quality_grade=research&captive=false`;
    const fish = (await get(`${API}/observations/species_counts?${q}&taxon_id=${FISH}&per_page=8`)).results;
    const other = (await get(`${API}/observations/species_counts?${q}&taxon_id=${OTHER_AQUATIC.join(',')}&per_page=5`)).results;
    const rows = [...other, ...fish].filter(r => r.taxon?.rank === 'species').map(r => [r.taxon.id, r.count]);
    if (rows.length) places.push([lat, lon, RADIUS_KM, rows]);
    if (i % 25 === 0) console.log(`${i + 1}/${clusters.length} areas`);
  }
  const ids = [...new Set(places.flatMap(place => place[3].map(row => row[0])))].sort((a, b) => a - b);
  const taxa = {};
  for (let i = 0; i < ids.length; i += 30) {
    const { results } = await get(`${API}/taxa/${ids.slice(i, i + 30).join(',')}`);
    for (const taxon of results) {
      const open = (taxon.taxon_photos || []).map(entry => entry.photo).find(p => OPEN_LICENSES.has(p?.license_code));
      const photo = open ? { url: open.medium_url || open.url, attribution: open.attribution, license: open.license_code } : await commonsPhoto(taxon.wikipedia_url).catch(() => null);
      taxa[taxon.id] = [taxon.preferred_common_name || taxon.name, taxon.name, taxon.iconic_taxon_name || '', photo?.url || '', photo?.attribution || '', photo?.license || ''];
    }
  }
  const output = { source: 'iNaturalist research-grade observations', sourceUrl: 'https://www.inaturalist.org/', retrievedAt: new Date().toISOString(),
    method: `Most-recorded fish and other aquatic animals within ${RADIUS_KM} km of inland dive sites.`,
    placeFields: ['latitude', 'longitude', 'radiusKm', 'species'], speciesFields: ['taxonId', 'records'],
    taxonFields: ['common', 'scientific', 'group', 'photoUrl', 'attribution', 'license'], taxa, places };
  fs.writeFileSync(path.join(dataDir, 'freshwaterLife.json'), JSON.stringify(output));
  console.log(`Wrote ${places.length} areas, ${ids.length} taxa (${(fs.statSync(path.join(dataDir, 'freshwaterLife.json')).size / 1024).toFixed(0)} KB)`);
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
