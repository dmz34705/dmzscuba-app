#!/usr/bin/env node
/*
 * High-resolution seafloor depth around ocean dive sites that have no published depth
 * → src/features/oceanAtlas/data/siteBathymetry.json. Finer than the global ETOPO grid
 * (siteSeafloor.json, ~460 m cells), so the app prefers it where it exists:
 *
 *   - NOAA NCEI coastal DEMs (CUDEM and other NCEI digital elevation models; public domain) through
 *     the DEM_all image service — US coasts, Hawaii and US territories, cells of 1/9″–3″ (3–90 m).
 *     Samples from coarser layers (the service falls back to ETOPO) are ignored.
 *   - EMODnet Bathymetry (European waters, ~115 m cells; CC BY 4.0) via its REST depth_sample service,
 *     which reports the shallowest and deepest survey value in each cell.
 *
 * The window is about ±300 m around the pin (community pins are rarely closer than that). Recorded:
 * depth at the pin, shallowest and deepest water in the window, and the source.
 *
 *   SITE_BATHYMETRY_CACHE=dir node scripts/build-site-bathymetry.cjs
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { dataDir } = require('./lib/dive-site-import.cjs');
const { loadSourceModule } = require('./lib/load-source-module.cjs');

const CACHE = process.env.SITE_BATHYMETRY_CACHE || path.join(os.tmpdir(), 'dmz-site-bathymetry');
const USER_AGENT = 'DMZScuba/1.0 (+https://www.dmzscuba.com) seafloor lookup';
const NOAA = 'https://gis.ngdc.noaa.gov/arcgis/rest/services/DEM_mosaics/DEM_all/ImageServer/getSamples';
const EMODNET = 'https://rest.emodnet-bathymetry.eu/depth_sample';
const MAX_CELL_ARCSEC = 3; // finer than ~90 m, or it's the global fallback
const STEP_M = 150; // grid spacing; 5 × 5 NOAA samples, 3 × 3 EMODnet cells (each ~115 m) ≈ ±300 m
const EUROPE = site => site.latitude > 27 && site.latitude < 72 && site.longitude > -32 && site.longitude < 45;

async function getJson(url) {
  const file = path.join(CACHE, crypto.createHash('sha1').update(url).digest('hex') + '.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(60_000) }).catch(() => null);
    if (response && (response.ok || response.status === 400 || response.status === 404)) {
      const json = await response.json().catch(() => ({}));
      fs.writeFileSync(file, JSON.stringify(json));
      return json;
    }
    await new Promise(resolve => setTimeout(resolve, 3000 * (attempt + 1)));
  }
  return null;
}

const grid = (site, half, stepM) => {
  const dLat = stepM / 111_320, dLon = stepM / (111_320 * Math.max(0.2, Math.cos(site.latitude * Math.PI / 180)));
  const points = [];
  for (let i = -half; i <= half; i++) for (let j = -half; j <= half; j++) points.push([site.longitude + j * dLon, site.latitude + i * dLat, i === 0 && j === 0]);
  return points;
};

async function fromNoaa(site) {
  const points = grid(site, 2, STEP_M);
  const geometry = encodeURIComponent(JSON.stringify({ points: points.map(([x, y]) => [Number(x.toFixed(6)), Number(y.toFixed(6))]), spatialReference: { wkid: 4326 } }));
  const json = await getJson(`${NOAA}?geometry=${geometry}&geometryType=esriGeometryMultipoint&returnFirstValueOnly=true&outFields=CellsizeArcseconds&f=json`);
  const samples = (json?.samples || []).filter(s => Number(s.attributes?.CellsizeArcseconds) <= MAX_CELL_ARCSEC && Number.isFinite(Number(s.value)));
  if (samples.length < points.length / 2) return null;
  const water = samples.map(s => -Number(s.value)).filter(depth => depth > 0.5);
  const centre = samples.find(s => s.locationId === points.findIndex(p => p[2]));
  return water.length >= 3 ? { atPin: centre && -Number(centre.value) > 0.5 ? -Number(centre.value) : null, water, source: 'noaa' } : null;
}

async function fromEmodnet(site) {
  const cells = [];
  let atPin = null;
  for (const [x, y, centre] of grid(site, 1, STEP_M * 2)) {
    const json = await getJson(`${EMODNET}?geom=POINT(${x.toFixed(5)}%20${y.toFixed(5)})`);
    if (!json || !Number.isFinite(json.min) || !Number.isFinite(json.max)) continue;
    cells.push(json);
    if (centre && json.avg < 0) atPin = -json.avg;
  }
  const water = cells.flatMap(cell => [-cell.max, -cell.min]).filter(depth => depth > 0.5);
  return water.length >= 3 ? { atPin, water, source: 'emodnet' } : null;
}

async function main() {
  fs.mkdirSync(CACHE, { recursive: true });
  const src = path.join(__dirname, '../src');
  const { catalogSites } = loadSourceModule(path.join(src, 'features/oceanAtlas/catalog.js'), src);
  const { isInland } = loadSourceModule(path.join(src, 'features/oceanAtlas/inland.js'), src);
  const sites = catalogSites().filter(site => !site.maxDepthMeters && !isInland(site));
  const out = {}, counts = { noaa: 0, emodnet: 0 };
  let next = 0, done = 0;
  const worker = async () => {
    while (next < sites.length) {
      const site = sites[next++];
      const hit = (await fromNoaa(site)) || (EUROPE(site) ? await fromEmodnet(site) : null);
      if (hit) {
        // The pin's own depth (a cell average) belongs in the range too.
        const water = hit.atPin == null ? hit.water : [...hit.water, hit.atPin];
        out[site.id] = [hit.atPin == null ? null : Math.round(hit.atPin), Math.round(Math.min(...water)), Math.round(Math.max(...water)), hit.source];
        counts[hit.source]++;
      }
      if (++done % 100 === 0) process.stdout.write(`\r${done}/${sites.length}`);
    }
  };
  await Promise.all(Array.from({ length: 3 }, worker));
  const result = {
    sources: { noaa: { name: 'NOAA NCEI coastal DEMs', url: 'https://www.ncei.noaa.gov/products/coastal-elevation-models', license: 'Public domain' },
      emodnet: { name: 'EMODnet Bathymetry', url: 'https://emodnet.ec.europa.eu/en/bathymetry', license: 'CC BY 4.0' } },
    retrievedAt: new Date().toISOString(), fields: ['depthAtPinMeters', 'shallowestNearbyMeters', 'deepestNearbyMeters', 'source'], window: 'about ±300 m',
    stats: { checked: sites.length, ...counts }, sites: out,
  };
  fs.writeFileSync(path.join(dataDir, 'siteBathymetry.json'), JSON.stringify(result));
  console.log(`\n${Object.keys(out).length} of ${sites.length} ocean sites with high-resolution seafloor`, counts, `→ ${(fs.statSync(path.join(dataDir, 'siteBathymetry.json')).size / 1024).toFixed(0)} KB`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
