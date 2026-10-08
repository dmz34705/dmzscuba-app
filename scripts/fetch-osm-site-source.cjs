#!/usr/bin/env node
/*
 * Fetch the current source objects for the exact OpenStreetMap IDs already in
 * osmSites.json. This is intentionally not a global Overpass crawl: it cannot
 * add, remove, or fuzzy-match sites. The resulting standard OSM JSON can be
 * passed to build-site-facts.cjs, build-site-images.cjs, and
 * build-published-depths.cjs.
 *
 *   node scripts/fetch-osm-site-source.cjs /tmp/osm-site-source.json
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const output = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'dmz-osm-site-source.json'));
const input = require('../src/features/oceanAtlas/data/osmSites.json');
const ids = { node: [], way: [], relation: [] };
for (const [id] of input.sites) ids[{ n: 'node', w: 'way', r: 'relation' }[id[0]]].push(id.slice(1));
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function fetchBatch(type, batch) {
  const plural = `${type}s`;
  const url = `https://api.openstreetmap.org/api/0.6/${plural}.json?${plural}=${batch.join(',')}`;
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000),
      headers: { 'User-Agent': 'DMZScuba/1.0 (+https://www.dmzscuba.com) exact site enrichment' } }).catch(() => null);
    if (response?.ok) return response.json();
    await sleep(1000 * (attempt + 1));
  }
  throw new Error(`OpenStreetMap ${type} batch failed`);
}

(async () => {
  const elements = [];
  for (const [type, values] of Object.entries(ids)) {
    for (let start = 0; start < values.length; start += 150) {
      const batch = values.slice(start, start + 150), wanted = new Set(batch.map(String));
      const response = await fetchBatch(type, batch);
      elements.push(...(response.elements || []).filter(element => element.type === type && wanted.has(String(element.id))));
      process.stdout.write(`\r${elements.length}/${input.sites.length} exact OSM source records`);
    }
  }
  if (elements.length !== input.sites.length) throw new Error(`Expected ${input.sites.length} records, received ${elements.length}`);
  fs.writeFileSync(output, JSON.stringify({ version: '0.6', generator: 'DMZ Scuba exact-ID fetch',
    copyright: 'OpenStreetMap and contributors', attribution: 'https://www.openstreetmap.org/copyright',
    license: 'https://opendatacommons.org/licenses/odbl/1-0/', elements }));
  console.log(`\n${output}`);
})().catch(error => { console.error(`\n${error.stack || error.message}`); process.exit(1); });
