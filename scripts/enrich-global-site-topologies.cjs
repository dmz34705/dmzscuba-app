#!/usr/bin/env node
/*
 * Fill missing OpenDiveMap site types from nearby physical OpenStreetMap
 * features. Exact spatial joins only: a mapped reef within 250 m, or a wreck /
 * cave entrance within 150 m. Results are ODbL facts and are cached per site.
 *
 *   node scripts/enrich-global-site-topologies.cjs
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { overpassPerSite } = require('./lib/overpass-per-site.cjs');

const file = path.resolve(__dirname, '../src/features/oceanAtlas/data/globalSites.json');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const cacheDir = process.env.GLOBAL_TOPOLOGY_CACHE || path.join(os.tmpdir(), 'dmz-global-site-topologies');
const mirrors = ['https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass-api.de/api/interpreter'];
const ids = data.packedIds.match(/.{6}/g) || [];
const coordinates = Buffer.from(data.coordinatesBase64, 'base64');
const masks = new Map(data.topologyMasksByIndex || []);
const sites = ids.map((id, index) => ({ id, index, latitude: coordinates.readInt32LE(index * 8) / 1e5,
  longitude: coordinates.readInt32LE(index * 8 + 4) / 1e5, mask: masks.get(index) ?? data.defaults.topologyMask }))
  .filter(site => !site.mask);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function overpass(query) {
  for (let attempt = 0; attempt < 12; attempt++) {
    for (const url of mirrors) {
      const response = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(120_000),
        headers: { 'User-Agent': 'DMZScuba/1.0 (+https://www.dmzscuba.com) physical dive-site feature lookup', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}` }).catch(() => null);
      if (!response?.ok) continue;
      const json = await response.json().catch(() => null);
      if (json?.elements && !json.remark?.includes('runtime error')) return json.elements;
    }
    await sleep(Math.min(60_000, 5000 * (attempt + 1)));
  }
  throw new Error('All Overpass mirrors failed.');
}

const statement = site => `make site ref="${site.id}";out;(nwr(around:250,${site.latitude.toFixed(5)},${site.longitude.toFixed(5)})["natural"="reef"];nwr(around:150,${site.latitude.toFixed(5)},${site.longitude.toFixed(5)})["historic"="wreck"];nwr(around:150,${site.latitude.toFixed(5)},${site.longitude.toFixed(5)})["seamark:type"="wreck"];nwr(around:150,${site.latitude.toFixed(5)},${site.longitude.toFixed(5)})["natural"="cave_entrance"];);out tags center;`;

(async () => {
  const elements = await overpassPerSite({ sites, statement, overpass, cacheDir, batch: 100,
    onProgress: (done, total) => process.stdout.write(`\r${done}/${total} untyped global sites checked`) });
  const found = new Map(); let current = null;
  for (const element of elements) {
    if (element.type === 'site') { current = element.tags?.ref; continue; }
    if (!current) continue;
    const tags = element.tags || {}, types = found.get(current) || new Set();
    if (tags.natural === 'reef') types.add('reef');
    if (tags.historic === 'wreck' || tags['seamark:type'] === 'wreck') types.add('wreck');
    if (tags.natural === 'cave_entrance') types.add('cave');
    found.set(current, types);
  }
  let enriched = 0;
  for (const site of sites) {
    const types = found.get(site.id);
    if (!types?.size) continue;
    const mask = [...types].reduce((value, type) => value | (1 << data.topologyCodes.indexOf(type)), 0);
    if (mask) { masks.set(site.index, mask); enriched++; }
  }
  data.topologyMasksByIndex = [...masks].filter(([, mask]) => mask !== data.defaults.topologyMask).sort((a, b) => a[0] - b[0]);
  data.nearbyOsmTopologies = { source: 'OpenStreetMap physical features within 150–250 m (ODbL 1.0)', checked: sites.length, enriched,
    retrievedAt: new Date().toISOString() };
  fs.writeFileSync(file, JSON.stringify(data) + '\n');
  console.log(`\n${enriched} additional global sites typed from nearby mapped physical features.`);
})().catch(error => { console.error(`\n${error.stack || error.message}`); process.exit(1); });
