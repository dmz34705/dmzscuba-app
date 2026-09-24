#!/usr/bin/env node
/*
 * Estimated visibility for every salt-water catalog site, per month, from satellite
 * water clarity. Source: NOAA CoastWatch VIIRS Kd490 (diffuse attenuation at 490 nm),
 * Science Quality, global 4 km monthly (ERDDAP dataset nesdisVHNSQkd490Monthly).
 *
 * Method: sample the global grid every 13 pixels (~0.49°) for each month of
 * YEARS; per cell and month-of-year take the median Kd490 across years; each site
 * uses the nearest cell with data within ~1° (coastal pixels are often masked).
 * The app converts Kd490 → Kd(PAR) (Morel et al. 2007) → Secchi depth ≈ 1.7/Kd(PAR)
 * (Poole & Atkins) and shows a ±25% range: an estimate for surface water offshore,
 * not a dive-day forecast. Freshwater sites are skipped (not valid for lakes).
 *
 *   node scripts/build-visibility.cjs      (downloads cached; resumable)
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { NetCDFReader } = require('netcdfjs');

const ERDDAP = 'https://coastwatch.pfeg.noaa.gov/erddap/griddap/nesdisVHNSQkd490Monthly.nc';
const YEARS = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024];
const STRIDE = 13, SEARCH_CELLS = 2, MIN_YEARS = 3;
const CACHE_DIR = process.env.VISIBILITY_CACHE || path.join(os.tmpdir(), 'dmz-visibility-cache');
const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'src/features/oceanAtlas/data');
const outputPath = path.join(dataDir, 'visibility.json');
// Kd490 packed on a log scale into one character each; '!' = no data.
const ALPHABET = Array.from({ length: 91 }, (_, i) => String.fromCharCode(35 + i)).filter(c => c !== '\\' && c !== '<').join('');
const KD_MIN = 0.02, KD_MAX = 5;
const packKd = kd => kd == null ? '!' : ALPHABET[Math.round(Math.log(Math.min(KD_MAX, Math.max(KD_MIN, kd)) / KD_MIN) / Math.log(KD_MAX / KD_MIN) * (ALPHABET.length - 1))];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function slice(year, month) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, `kd490-${year}-${String(month).padStart(2, '0')}-s${STRIDE}.nc`);
  if (!fs.existsSync(file)) {
    const time = `${year}-${String(month).padStart(2, '0')}-01T12:00:00Z`;
    const url = `${ERDDAP}?kd_490%5B(${time})%5D%5B(0.0)%5D%5B(89.75625):${STRIDE}:(-89.75625)%5D%5B(-179.98125):${STRIDE}:(179.98125)%5D`;
    for (let attempt = 0; ; attempt++) {
      const response = await fetch(url, { headers: { 'User-Agent': 'DMZScuba/1.0 (+https://www.dmzscuba.com) visibility build' }, redirect: 'follow' }).catch(() => null);
      if (response?.ok) { fs.writeFileSync(file, Buffer.from(await response.arrayBuffer())); break; }
      if (attempt >= 4) { console.warn(`skipping ${time} (ERDDAP unavailable)`); return null; }
      await sleep(10000 * (attempt + 1));
    }
    await sleep(1500);
  }
  const nc = new NetCDFReader(fs.readFileSync(file));
  return { latitudes: nc.getDataVariable('latitude'), longitudes: nc.getDataVariable('longitude'), values: nc.getDataVariable('kd_490') };
}

function saltPoints() {
  const { loadSourceModule } = require('./lib/load-source-module.cjs');
  const src = path.join(root, 'src');
  const { catalogSites } = loadSourceModule(path.join(src, 'features/oceanAtlas/catalog.js'), src);
  const { DIVE_REGIONS, REMOTE_DIVE_AREAS } = loadSourceModule(path.join(src, 'features/oceanAtlas/diveRegions.js'), src);
  const sites = catalogSites().filter(site => !/fresh/i.test(site.environment || '') && !site.topologies.includes('quarry'));
  return [...sites, ...DIVE_REGIONS.flatMap(region => region.areas), ...REMOTE_DIVE_AREAS];
}

// Download every slice first, a few at a time (ERDDAP takes ~1 min per global slice).
async function prefetch(concurrency = 2) {
  const jobs = YEARS.flatMap(year => Array.from({ length: 12 }, (_, m) => [year, m + 1]));
  let next = 0, done = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next < jobs.length) { const [year, month] = jobs[next++]; await slice(year, month); if (++done % 12 === 0) console.log(`${done}/${jobs.length} slices`); }
  }));
}

(async () => {
  await prefetch();
  const points = saltPoints();
  let first = null;
  for (const year of YEARS) { first = await slice(year, 1); if (first) break; }
  if (!first) throw new Error('No January slice available from ERDDAP.');
  const { latitudes, longitudes } = first;
  const lat0 = latitudes[0], dLat = latitudes[1] - latitudes[0], lon0 = longitudes[0], dLon = longitudes[1] - longitudes[0];
  const rows = latitudes.length, cols = longitudes.length;
  const cellOf = p => [Math.round((p.latitude - lat0) / dLat), Math.round((p.longitude - lon0) / dLon)];
  // Candidate cells: everything within SEARCH_CELLS of any point.
  const candidates = new Set();
  for (const point of points) {
    const [i, j] = cellOf(point);
    for (let di = -SEARCH_CELLS; di <= SEARCH_CELLS; di++) for (let dj = -SEARCH_CELLS; dj <= SEARCH_CELLS; dj++) {
      const r = i + di, c = ((j + dj) % cols + cols) % cols;
      if (r >= 0 && r < rows) candidates.add(r * cols + c);
    }
  }
  console.log(`${points.length} salt-water points → ${candidates.size} candidate cells`);
  // Per candidate cell and month-of-year: median Kd490 across YEARS.
  const medians = new Map([...candidates].map(index => [index, new Array(12).fill(null)]));
  for (let month = 1; month <= 12; month++) {
    const samples = new Map([...candidates].map(index => [index, []]));
    for (const year of YEARS) {
      const data = await slice(year, month);
      if (!data) continue; // a missing month-year just lowers that median's sample count
      const { values } = data;
      for (const index of candidates) { const v = values[index]; if (Number.isFinite(v) && v > 0) samples.get(index).push(v); }
    }
    for (const [index, list] of samples) if (list.length >= MIN_YEARS) { list.sort((a, b) => a - b); medians.get(index)[month - 1] = list[Math.floor(list.length / 2)]; }
    console.log(`month ${month} done`);
  }
  // Each point keeps its nearest cell with a full-enough year of data; only used cells are stored.
  const used = new Map();
  let covered = 0;
  for (const point of points) {
    const [i, j] = cellOf(point);
    let best = null;
    for (let di = -SEARCH_CELLS; di <= SEARCH_CELLS; di++) for (let dj = -SEARCH_CELLS; dj <= SEARCH_CELLS; dj++) {
      const r = i + di, c = ((j + dj) % cols + cols) % cols;
      const months = medians.get(r * cols + c);
      if (!months || months.filter(v => v != null).length < 8) continue;
      const d = di * di + dj * dj;
      if (!best || d < best.d) best = { d, index: r * cols + c, months };
    }
    if (best) { used.set(best.index, best.months); covered++; }
  }
  const cells = Object.fromEntries([...used].sort((a, b) => a[0] - b[0]).map(([index, months]) => [index, months.map(packKd).join('')]));
  const output = { source: 'NOAA CoastWatch VIIRS Kd490, Science Quality, global 4 km monthly (nesdisVHNSQkd490Monthly)', sourceUrl: 'https://coastwatch.pfeg.noaa.gov/erddap/griddap/nesdisVHNSQkd490Monthly.html',
    method: `Median Kd490 per month-of-year over ${YEARS[0]}–${YEARS[YEARS.length - 1]}, sampled every ${STRIDE} pixels; nearest cell with data within ${SEARCH_CELLS} cells.`,
    retrievedAt: new Date().toISOString(), grid: { lat0, dLat, lon0, dLon, rows, cols }, packing: { alphabet: ALPHABET, kdMin: KD_MIN, kdMax: KD_MAX }, cells };
  fs.writeFileSync(outputPath, JSON.stringify(output));
  console.log(`${covered}/${points.length} points covered by ${used.size} cells → ${(fs.statSync(outputPath).size / 1024).toFixed(0)} KB`);
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
