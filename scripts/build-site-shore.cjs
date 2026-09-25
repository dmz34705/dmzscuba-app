#!/usr/bin/env node
/*
 * What's at the water's edge for shore dives: the nearest parking, toilets, showers, drinking water,
 * slipway, pier or jetty and beach within 250 m of the site, from OpenStreetMap (© OpenStreetMap
 * contributors, ODbL 1.0) → src/features/oceanAtlas/data/siteShore.json.
 *
 * Boat dives are skipped (the car park is at the marina, not the site). Only what's mapped is
 * reported: an absent toilet means none is mapped, not that none exists.
 *
 *   SITE_SHORE_CACHE=dir node scripts/build-site-shore.cjs
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { dataDir } = require('./lib/dive-site-import.cjs');
const { loadSourceModule } = require('./lib/load-source-module.cjs');
const { overpassPerSite } = require('./lib/overpass-per-site.cjs');

const MIRRORS = ['https://z.overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://lz4.overpass-api.de/api/interpreter']; // busy mirrors answer 504: keep retrying
const CACHE = process.env.SITE_SHORE_CACHE || path.join(os.tmpdir(), 'dmz-site-shore');
const BATCH = 100, REACH_M = 250;
// Output order; the app labels them.
const KINDS = ['parking', 'toilets', 'shower', 'water', 'slipway', 'pier', 'beach'];
const kindOf = (tags) => {
  if (tags.amenity === 'parking' && tags.access !== 'private' && tags.access !== 'no') return 'parking';
  if (tags.amenity === 'toilets' && tags.access !== 'private') return 'toilets';
  if (tags.amenity === 'shower') return 'shower';
  if (tags.amenity === 'drinking_water') return 'water';
  if (tags.leisure === 'slipway') return 'slipway';
  if (tags.man_made === 'pier' || tags.man_made === 'jetty') return 'pier';
  if (tags.natural === 'beach') return 'beach';
  return null;
};

async function overpass(query, key) {
  const file = path.join(CACHE, `${key}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  for (let attempt = 0; attempt < 30; attempt++) {
    for (const url of MIRRORS) {
      const response = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(120_000),
        headers: { 'User-Agent': 'DMZScuba/1.0 (+https://www.dmzscuba.com) shore-details lookup', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}` }).catch(() => null);
      if (!response?.ok) continue;
      const json = await response.json().catch(() => null);
      if (json?.elements && !json.remark?.includes('runtime error')) { fs.writeFileSync(file, JSON.stringify(json.elements)); return json.elements; }
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(60_000, 10_000 * (attempt + 1))));
  }
  throw new Error('All Overpass mirrors failed.');
}

function meters(a, b) {
  const rad = (v) => v * Math.PI / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(h));
}

async function main() {
  fs.mkdirSync(CACHE, { recursive: true });
  const src = path.join(__dirname, '../src');
  const { catalogSites } = loadSourceModule(path.join(src, 'features/oceanAtlas/catalog.js'), src);
  const sites = catalogSites().filter((site) => site.entry !== 'boat');
  const byId = new Map(sites.map((site) => [site.id, site]));
  const rows = {};
  {
    // Cached per site: a new or merged site costs one small query, not a re-run of every later batch.
    const elements = await overpassPerSite({ sites, cacheDir: CACHE, batch: BATCH,
      statement: (site) => {
        const at = `around:${REACH_M},${site.latitude.toFixed(5)},${site.longitude.toFixed(5)}`;
        return `make site ref="${site.id}";out;(nwr(${at})["amenity"~"^(parking|toilets|shower|drinking_water)$"];nwr(${at})["leisure"="slipway"];nwr(${at})["man_made"~"^(pier|jetty)$"];nwr(${at})["natural"="beach"];);out tags center;`;
      },
      overpass: (query) => overpass(query, crypto.createHash('sha1').update(query).digest('hex').slice(0, 16)),
      onProgress: (done, total) => process.stdout.write(`\r${done}/${total} new sites looked up`) });
    let site = null;
    for (const element of elements) {
      if (element.type === 'site') { site = byId.get(element.tags.ref); continue; }
      const kind = kindOf(element.tags || {});
      const point = element.center || element;
      if (!site || !kind || !Number.isFinite(point.lat)) continue;
      // A beach or car park found within reach can have its centre further off: it still reaches the site.
      const distance = Math.min(REACH_M, Math.round(meters({ lat: site.latitude, lon: site.longitude }, point) / 10) * 10);
      const row = (rows[site.id] ||= KINDS.map(() => null));
      const i = KINDS.indexOf(kind);
      if (row[i] == null || distance < row[i]) row[i] = distance;
    }
  }
  const out = {
    source: 'OpenStreetMap contributors (ODbL 1.0) via Overpass', sourceUrl: 'https://www.openstreetmap.org/copyright', retrievedAt: new Date().toISOString(),
    fields: KINDS, note: `Nearest mapped feature of each kind within ${REACH_M} m, in metres (rounded to 10); null = none mapped.`,
    stats: { checked: sites.length, sites: Object.keys(rows).length, ...Object.fromEntries(KINDS.map((kind, i) => [kind, Object.values(rows).filter((row) => row[i] != null).length])) },
    sites: rows,
  };
  fs.writeFileSync(path.join(dataDir, 'siteShore.json'), JSON.stringify(out));
  console.log(`\n${out.stats.sites} of ${sites.length} shore / inland sites with mapped facilities nearby → ${(fs.statSync(path.join(dataDir, 'siteShore.json')).size / 1024).toFixed(0)} KB`, out.stats);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
