#!/usr/bin/env node
/*
 * Dive operators and stay-and-dive places from OpenStreetMap (© OpenStreetMap
 * contributors, ODbL 1.0) → src/features/oceanAtlas/data/diveOperators.json.
 *
 * Operators: shop=scuba_diving, amenity=dive_centre, club=scuba_diving.
 * Stays: lodging (hotel, guest house, resort, …) tagged sport=scuba_diving, and
 * operators mapped on a lodging feature. Unnamed features are skipped.
 * The app lists them purely by distance from the dive site — no ranking or promotion.
 *
 *   node scripts/build-dive-operators.cjs [overpass.json …]   (defaults to live Overpass)
 */
const fs = require('node:fs');
const path = require('node:path');
const { dataDir } = require('./lib/dive-site-import.cjs');

const MIRRORS = ['https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass-api.de/api/interpreter'];
const QUERIES = ['nwr["shop"="scuba_diving"];', 'nwr["amenity"="dive_centre"];', 'nwr["club"="scuba_diving"];', 'nwr["tourism"]["sport"="scuba_diving"];']
  .map(part => `[out:json][timeout:240];${part}out center tags;`);
const LODGING = /^(hotel|guest_house|hostel|motel|apartment|resort|chalet|camp_site)$/;
const KINDS = ['Dive shop', 'Dive centre', 'Dive club', 'Dive resort', 'Stay with diving'];

async function overpass(query) {
  for (const url of MIRRORS) {
    const response = await fetch(url, { method: 'POST', headers: { 'User-Agent': 'DMZScuba/1.0 (+https://www.dmzscuba.com) operator import', 'Content-Type': 'application/x-www-form-urlencoded' }, body: `data=${encodeURIComponent(query)}` }).catch(() => null);
    if (response?.ok) { const json = await response.json().catch(() => null); if (json?.elements) return json.elements; }
  }
  throw new Error('All Overpass mirrors failed; pass saved responses instead.');
}

const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
function website(tags) {
  const raw = clean(tags.website || tags['contact:website'] || tags.url || '');
  if (!raw) return '';
  const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try { return new URL(url).protocol.startsWith('http') ? url.slice(0, 160) : ''; } catch { return ''; }
}

(async () => {
  const files = process.argv.slice(2);
  const elements = files.length ? files.flatMap(file => JSON.parse(fs.readFileSync(file, 'utf8')).elements) : (await Promise.all(QUERIES.map(overpass))).flat();
  const seen = new Set(), rows = [];
  let unnamed = 0;
  for (const element of elements) {
    const id = `${element.type[0]}${element.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const tags = element.tags || {};
    const name = clean(tags['name:en'] || tags.name);
    if (!name) { unnamed++; continue; }
    const latitude = element.lat ?? element.center?.lat, longitude = element.lon ?? element.center?.lon;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    const lodging = LODGING.test(tags.tourism || '') || tags.leisure === 'resort';
    const kind = lodging ? (tags.shop === 'scuba_diving' || tags.amenity === 'dive_centre' || /dive|diving|scuba/i.test(name) ? 3 : 4)
      : tags.club === 'scuba_diving' ? 2 : tags.amenity === 'dive_centre' ? 1 : 0;
    rows.push([id, name.slice(0, 80), Math.round(latitude * 1e5) / 1e5, Math.round(longitude * 1e5) / 1e5, kind, website(tags), clean(tags.phone || tags['contact:phone']).slice(0, 40)]);
  }
  rows.sort((a, b) => a[0].localeCompare(b[0]));
  const output = { source: 'OpenStreetMap contributors', license: 'ODbL 1.0', licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/', retrievedAt: new Date().toISOString(),
    kinds: KINDS, fields: ['osmId', 'name', 'latitude', 'longitude', 'kind', 'website', 'phone'], stats: { fetched: elements.length, unnamed, kept: rows.length }, places: rows };
  fs.writeFileSync(path.join(dataDir, 'diveOperators.json'), JSON.stringify(output));
  const counts = KINDS.map((k, i) => `${k}: ${rows.filter(r => r[4] === i).length}`).join(', ');
  console.log(`${rows.length} places (${counts}); ${unnamed} unnamed skipped → ${(fs.statSync(path.join(dataDir, 'diveOperators.json')).size / 1024).toFixed(0)} KB`);
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
