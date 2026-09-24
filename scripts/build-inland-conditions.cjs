#!/usr/bin/env node
/*
 * Conditions for inland (freshwater) dive sites → src/features/oceanAtlas/data/inlandConditions.json
 *
 * Inland = the catalog marks the site freshwater/quarry, or it lies > 3 km inside a
 * landmass of the bundled coastline (OpenDiveMap labels some quarries "ocean").
 * For each inland site (grouped to 0.1° cells):
 *   - elevation (m) — Open-Meteo Elevation API (Copernicus DEM 90 m)
 *   - monthly mean 2 m air temperature climatology — NASA POWER (MERRA-2), one point per cell
 * The app turns these into estimated surface-water temperatures, a thermocline note,
 * ice months, spring (groundwater) temperatures and altitude-diving guidance.
 *
 *   node scripts/build-inland-conditions.cjs   (requests cached)
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { landIndex, inland, dataDir } = require('./lib/dive-site-import.cjs');
const { loadSourceModule } = require('./lib/load-source-module.cjs');

const CACHE_DIR = process.env.INLAND_CACHE || path.join(os.tmpdir(), 'dmz-inland-cache');
const USER_AGENT = 'DMZScuba/1.0 (+https://www.dmzscuba.com) inland conditions build';
const CELL = 0.1, BATCH = 25;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function cachedJson(url) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, crypto.createHash('sha1').update(url).digest('hex') + '.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  for (let attempt = 0; attempt < 6; attempt++) {
    await sleep(url.includes('power.larc') ? 400 : 1200);
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } }).catch(() => null);
    if (response?.ok) { const json = await response.json(); fs.writeFileSync(file, JSON.stringify(json)); return json; }
    await sleep(15000 * (attempt + 1)); // Open-Meteo free tier: back off on 429
  }
  throw new Error(`Failed: ${url.slice(0, 120)}`);
}

(async () => {
  const src = path.join(__dirname, '../src');
  const { catalogSites } = loadSourceModule(path.join(src, 'features/oceanAtlas/catalog.js'), src);
  const rings = landIndex();
  // Supplementary (x-) sites were already classified by import-extra-dive-sites.cjs, with its stricter
  // rule for geocoded places; everything else falls back to the geometry test.
  const sites = catalogSites().filter(site => /fresh/i.test(site.environment || '') || site.topologies.includes('quarry') || (!site.id.startsWith('x-') && inland(site, rings)));
  const cells = new Map();
  for (const site of sites) {
    const key = `${Math.round(site.latitude / CELL)},${Math.round(site.longitude / CELL)}`;
    if (!cells.has(key)) cells.set(key, { latitude: Math.round(site.latitude / CELL) * CELL, longitude: Math.round(site.longitude / CELL) * CELL, ids: [] });
    cells.get(key).ids.push(site.id);
  }
  const list = [...cells.values()];
  console.log(`${sites.length} inland sites in ${list.length} cells`);
  for (let i = 0; i < list.length; i += BATCH) {
    const batch = list.slice(i, i + BATCH);
    const lat = batch.map(c => c.latitude.toFixed(2)).join(','), lon = batch.map(c => c.longitude.toFixed(2)).join(',');
    const elevation = await cachedJson(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`);
    for (const [k, cell] of batch.entries()) {
      cell.elevation = Math.round(elevation.elevation[k]);
      const power = await cachedJson(`https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=T2M&community=RE&longitude=${cell.longitude.toFixed(2)}&latitude=${cell.latitude.toFixed(2)}&format=JSON`);
      const t2m = power?.properties?.parameter?.T2M || {};
      cell.air = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'].map(m => Number.isFinite(t2m[m]) && t2m[m] > -900 ? t2m[m] : null);
    }
    console.log(`${Math.min(i + BATCH, list.length)}/${list.length} cells`);
  }
  // Elevation at each site's own position (a 0.1° cell centre can sit on a mountain above the lake).
  const siteElevation = new Map();
  for (let i = 0; i < sites.length; i += 100) {
    const batch = sites.slice(i, i + 100);
    const json = await cachedJson(`https://api.open-meteo.com/v1/elevation?latitude=${batch.map(s => s.latitude.toFixed(4)).join(',')}&longitude=${batch.map(s => s.longitude.toFixed(4)).join(',')}`);
    batch.forEach((site, k) => siteElevation.set(site.id, Math.round(json.elevation[k])));
  }
  const bySite = {};
  for (const cell of list) for (const id of cell.ids) bySite[id] = [siteElevation.get(id) ?? cell.elevation, cell.air.map(v => v == null ? null : Math.round(v * 10))];
  const output = { source: 'Elevation: Open-Meteo (Copernicus DEM, CC BY 4.0). Air temperature climatology: NASA POWER (MERRA-2).', sourceUrl: 'https://power.larc.nasa.gov/',
    license: 'Open-Meteo CC BY 4.0; NASA POWER open data', retrievedAt: new Date().toISOString(), fields: ['elevationM', 'monthlyAirTenthsC'], sites: bySite };
  fs.writeFileSync(path.join(dataDir, 'inlandConditions.json'), JSON.stringify(output));
  console.log(`${Object.keys(bySite).length} sites → ${(fs.statSync(path.join(dataDir, 'inlandConditions.json')).size / 1024).toFixed(0)} KB`);
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
