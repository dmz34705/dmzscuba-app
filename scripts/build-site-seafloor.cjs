#!/usr/bin/env node
/*
 * Seafloor depth around each ocean dive site, from NOAA ETOPO 2022 (15 arc-second global relief,
 * public domain) via CoastWatch ERDDAP → src/features/oceanAtlas/data/siteSeafloor.json.
 *
 * A 15″ cell is about 460 m across and coastal cells blend reef, sand and drop-off, so this is a
 * regional estimate, not a sounding: the app shows the range of water depths within about a kilometre
 * of the pin, labelled as an estimate, and only where no published depth exists. It also flags
 * published depths that are far deeper than any seafloor nearby (a wrong pin or a wrong number) for review.
 *
 * Inland sites are skipped: ETOPO gives a lake's surface elevation, not its bottom.
 *
 *   SITE_SEAFLOOR_CACHE=dir node scripts/build-site-seafloor.cjs [--review out.tsv]
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { dataDir } = require('./lib/dive-site-import.cjs');
const { loadSourceModule } = require('./lib/load-source-module.cjs');

const ERDDAP = 'https://coastwatch.pfeg.noaa.gov/erddap/griddap/ETOPO_2022_v1_15s.json';
const NOAA = 'https://gis.ngdc.noaa.gov/arcgis/rest/services/DEM_mosaics/DEM_all/ImageServer/getSamples';
const CACHE = process.env.SITE_SEAFLOOR_CACHE || path.join(os.tmpdir(), 'dmz-site-seafloor');
const CELL = 1 / 240; // 15 arc-seconds
const REACH = 2; // cells each side of the pin: a 5 × 5 window, about ±900 m

const unreachable = [];
async function window(site) {
  const lat = Math.round(site.latitude * 1e4) / 1e4, lon = Math.round(site.longitude * 1e4) / 1e4;
  const file = path.join(CACHE, `${lat}_${lon}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  // The same 5 × 5 grid from NOAA's DEM image service (ETOPO 2022 underneath, finer coastal models where
  // they exist): one fast request, where ERDDAP is often slow or busy. ERDDAP is the fallback.
  const points = [];
  for (let i = -REACH; i <= REACH; i++) for (let j = -REACH; j <= REACH; j++) points.push([Number((lon + j * CELL).toFixed(5)), Number((lat + i * CELL).toFixed(5))]);
  const noaa = await fetch(`${NOAA}?${new URLSearchParams({ geometry: JSON.stringify({ points, spatialReference: { wkid: 4326 } }), geometryType: 'esriGeometryMultipoint', returnFirstValueOnly: 'true', f: 'json' })}`,
    { headers: { 'User-Agent': 'DMZScuba/1.0 (+https://www.dmzscuba.com) seafloor lookup' }, signal: AbortSignal.timeout(60_000) }).then(r => r.json()).catch(() => null);
  if (noaa?.samples?.length === points.length) {
    const rows = noaa.samples.map(sample => [points[sample.locationId][1], points[sample.locationId][0], Number(sample.value)]).filter(row => Number.isFinite(row[2]));
    fs.writeFileSync(file, JSON.stringify(rows));
    return rows;
  }
  const range = (v) => `[(${(v - REACH * CELL).toFixed(5)}):1:(${(v + REACH * CELL).toFixed(5)})]`;
  const url = `${ERDDAP}?z${range(lat)}${range(lon)}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(url, { headers: { 'User-Agent': 'DMZScuba/1.0 (+https://www.dmzscuba.com) seafloor lookup' }, signal: AbortSignal.timeout(60_000) }).catch(() => null);
    if (response?.ok) {
      const json = await response.json().catch(() => null);
      if (json?.table?.rows) { fs.writeFileSync(file, JSON.stringify(json.table.rows)); return json.table.rows; }
    }
    if (response?.status === 404) return []; // outside the grid
    await new Promise((resolve) => setTimeout(resolve, 3000 * (attempt + 1)));
  }
  unreachable.push(site.id); // ERDDAP busy: skip this site rather than lose the whole build (it's retried next run)
  return [];
}

async function main() {
  fs.mkdirSync(CACHE, { recursive: true });
  const src = path.join(__dirname, '../src');
  const { catalogSites } = loadSourceModule(path.join(src, 'features/oceanAtlas/catalog.js'), src);
  const { isInland } = loadSourceModule(path.join(src, 'features/oceanAtlas/inland.js'), src);
  const sites = catalogSites().filter((site) => !isInland(site));
  const out = {}, review = [];
  let next = 0, done = 0;
  const worker = async () => {
    while (next < sites.length) {
      const site = sites[next++];
      const rows = await window(site);
      done++;
      if (done % 250 === 0) process.stdout.write(`\r${done}/${sites.length}`);
      if (!rows.length) continue;
      const nearest = rows.reduce((a, b) => (Math.hypot(a[0] - site.latitude, a[1] - site.longitude) <= Math.hypot(b[0] - site.latitude, b[1] - site.longitude) ? a : b));
      const water = rows.map((row) => -row[2]).filter((depth) => depth > 0);
      // Mostly land, or all below sea level but far inland (a depression, not the sea): nothing to say.
      if (water.length < 3) continue;
      const atPin = nearest[2] < 0 ? Math.round(-nearest[2]) : null;
      const shallowest = Math.round(Math.min(...water)), deepest = Math.round(Math.max(...water));
      out[site.id] = [atPin, shallowest, deepest];
      if (site.maxDepthMeters && site.maxDepthMeters > deepest * 2 + 20) review.push([site.name, site.id, `published ${site.maxDepthMeters} m`, `seafloor nearby ${shallowest}–${deepest} m`].join('\t'));
    }
  };
  await Promise.all(Array.from({ length: 3 }, worker));
  const result = {
    source: 'NOAA NCEI ETOPO 2022 15 arc-second global relief model (public domain) via CoastWatch ERDDAP',
    sourceUrl: 'https://www.ncei.noaa.gov/products/etopo-global-relief-model', retrievedAt: new Date().toISOString(),
    fields: ['depthAtPinMeters', 'shallowestNearbyMeters', 'deepestNearbyMeters'], window: '5 × 5 cells of 15″ (about ±900 m)',
    stats: { sites: Object.keys(out).length, flaggedDepths: review.length }, sites: out,
  };
  fs.writeFileSync(path.join(dataDir, 'siteSeafloor.json'), JSON.stringify(result));
  const reviewAt = process.argv.indexOf('--review');
  if (reviewAt !== -1) fs.writeFileSync(process.argv[reviewAt + 1], review.join('\n'));
  if (unreachable.length) console.log(`\n${unreachable.length} sites skipped (ERDDAP unreachable): ${unreachable.slice(0, 10).join(', ')}`);
  console.log(`\n${result.stats.sites} ocean sites with nearby seafloor depth · ${review.length} published depths far deeper than the seafloor → ${(fs.statSync(path.join(dataDir, 'siteSeafloor.json')).size / 1024).toFixed(0)} KB`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
