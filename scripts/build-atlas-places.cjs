#!/usr/bin/env node
/*
 * Build the tappable place outlines for Ocean Atlas destination guides:
 *   - countries: Natural Earth 1:50m admin-0 (public domain)
 *   - US states: Natural Earth 1:50m admin-1 (public domain)
 *   - islands:   landmasses from the bundled coastline (data/land.json) under
 *                ISLAND_MAX_KM2 that have catalog dive sites around them,
 *                named from the OpenStreetMap island (place=island|islet) that
 *                contains them, via Overpass (© OpenStreetMap contributors, ODbL).
 * Outlines are simplified for hit-testing and highlighting only.
 *
 *   node scripts/build-atlas-places.cjs [admin0.geojson] [admin1.geojson]
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson';
// Public Overpass instances; each naming worker prefers one and falls back to the others.
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const USER_AGENT = 'DMZScuba/1.0 (+https://www.dmzscuba.com) atlas places build';
const CACHE_DIR = process.env.ATLAS_PLACES_CACHE || path.join(os.tmpdir(), 'dmz-atlas-places-cache');
const dataDir = path.resolve(__dirname, '../src/features/oceanAtlas/data');
const outputPath = path.join(dataDir, 'places.json');
const ISLAND_MAX_KM2 = 40000;   // larger landmasses are browsed by country/state
const ISLAND_SITE_KM = 15;      // offshore sites belong to an island within this distance
const SIMPLIFY_DEG = 0.02;      // ~2 km; outlines are for tapping, not navigation
const SCALE = 1000;

// Polyline-style encoding shared with land.json (values are [lon, lat]).
function encodeNumber(value) {
  value = value < 0 ? ~(value << 1) : value << 1;
  let encoded = '';
  while (value >= 0x20) { encoded += String.fromCharCode((0x20 | (value & 0x1f)) + 63); value >>= 5; }
  return encoded + String.fromCharCode(value + 63);
}
function encodeRing(points) {
  let lastX = 0, lastY = 0, encoded = '';
  for (const [x0, y0] of points) {
    const x = Math.round(x0 * SCALE), y = Math.round(y0 * SCALE);
    encoded += encodeNumber(x - lastX) + encodeNumber(y - lastY); lastX = x; lastY = y;
  }
  return encoded;
}
function decodeRing(encoded, scale) {
  const points = []; let index = 0, x = 0, y = 0;
  const next = () => { let result = 0, shift = 0, byte; do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20); return result & 1 ? ~(result >> 1) : result >> 1; };
  while (index < encoded.length) { x += next(); y += next(); points.push([x / scale, y / scale]); }
  return points;
}
function simplify(points, tolerance = SIMPLIFY_DEG) {
  if (points.length < 5) return points;
  const keep = new Uint8Array(points.length); keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop(); const a = points[first], b = points[last];
    const dx = b[0] - a[0], dy = b[1] - a[1], length = dx * dx + dy * dy;
    let max = tolerance ** 2, index = -1;
    for (let i = first + 1; i < last; i++) {
      const p = points[i], t = length ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length)) : 0;
      const d = (p[0] - a[0] - t * dx) ** 2 + (p[1] - a[1] - t * dy) ** 2;
      if (d > max) { max = d; index = i; }
    }
    if (index !== -1) { keep[index] = 1; stack.push([first, index], [index, last]); }
  }
  const result = points.filter((_, i) => keep[i]);
  return result.length >= 4 ? result : points;
}
const polygonsOf = geometry => geometry.type === 'MultiPolygon' ? geometry.coordinates : [geometry.coordinates];
// Outer rings only: holes (lakes) never matter for tapping a destination.
const outlines = geometry => polygonsOf(geometry).map(polygon => simplify(polygon[0])).filter(ring => ring.length >= 4).map(encodeRing);

function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const KM_PER_DEG = 111.32;
function distanceToRingKm([x, y], ring) {
  const k = Math.cos(y * Math.PI / 180);
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const ax = (ring[j][0] - x) * k, ay = ring[j][1] - y, bx = (ring[i][0] - x) * k, by = ring[i][1] - y;
    const dx = bx - ax, dy = by - ay, length = dx * dx + dy * dy;
    const t = length ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best * KM_PER_DEG;
}
function areaKm2(ring) {
  const lat0 = ring.reduce((sum, p) => sum + p[1], 0) / ring.length, k = Math.cos(lat0 * Math.PI / 180);
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) area += (ring[j][0] * k) * ring[i][1] - (ring[i][0] * k) * ring[j][1];
  return Math.abs(area / 2) * KM_PER_DEG ** 2;
}
const bboxOf = ring => ring.reduce((b, [x, y]) => [Math.min(b[0], y), Math.min(b[1], x), Math.max(b[2], y), Math.max(b[3], x)], [90, 180, -90, -180]);

function catalogSites() {
  const g = require(path.join(dataDir, 'globalSites.json'));
  const buffer = Buffer.from(g.coordinatesBase64, 'base64');
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.length);
  const countries = Buffer.from(g.countryIndexesBase64, 'base64');
  const sites = [];
  for (let i = 0; i < buffer.length / 8; i++) sites.push({ point: [view.getInt32(i * 8 + 4, true) / 1e5, view.getInt32(i * 8, true) / 1e5], country: g.countries[countries[i] - 1] || '' });
  for (const site of [...require(path.join(dataDir, 'sites.json')), ...require(path.join(dataDir, 'curatedSites.json'))]) sites.push({ point: [site.longitude, site.latitude], country: site.country || '' });
  for (const [, , latitude, longitude] of require(path.join(dataDir, 'osmSites.json')).sites) sites.push({ point: [longitude, latitude], country: '' });
  return sites;
}

async function cached(key, load) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, crypto.createHash('sha1').update(key).digest('hex') + '.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  const value = await load(); fs.writeFileSync(file, JSON.stringify(value)); return value;
}
async function download(argument, url) {
  if (argument) return JSON.parse(fs.readFileSync(argument, 'utf8'));
  return cached(url, async () => { const r = await fetch(url); if (!r.ok) throw new Error(`${url} → ${r.status}`); return r.json(); });
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
// A point guaranteed inside the ring: midpoint of the widest span on the centre latitude.
function interiorPoint(ring, box) {
  const y = (box[0] + box[2]) / 2, xs = [];
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y)) xs.push((xj - xi) * (y - yi) / (yj - yi) + xi);
  }
  xs.sort((a, b) => a - b);
  let best = null;
  for (let k = 0; k + 1 < xs.length; k += 2) if (!best || xs[k + 1] - xs[k] > best[1] - best[0]) best = [xs[k], xs[k + 1]];
  return best ? [(best[0] + best[1]) / 2, y] : [(box[1] + box[3]) / 2, y];
}
// Named OpenStreetMap island (place=island|islet) containing the landmass's interior point.
async function islandName(ring, box, worker = 0) {
  const [x, y] = interiorPoint(ring, box);
  const query = `[out:json][timeout:60];is_in(${y.toFixed(4)},${x.toFixed(4)})->.a;area.a["place"~"^(island|islet)$"];out tags;`;
  const elements = await cached(query, async () => {
    for (let attempt = 0; attempt < 6; attempt++) {
      await sleep(2000);
      const response = await fetch(OVERPASS[(worker + attempt) % OVERPASS.length], { method: 'POST', headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/x-www-form-urlencoded' }, body: `data=${encodeURIComponent(query)}` }).catch(() => null);
      if (response?.ok) { const json = await response.json().catch(() => null); if (json) return json.elements; }
      await sleep(5000 * (attempt + 1)); // Overpass asks clients to back off on 429/504
    }
    return null;
  });
  const named = (elements || []).map(element => element.tags?.['name:en'] || element.tags?.name).filter(Boolean);
  return named[0] || '';
}

(async () => {
  const [admin0, admin1] = await Promise.all([download(process.argv[2], `${NE}/ne_50m_admin_0_countries.geojson`), download(process.argv[3], `${NE}/ne_50m_admin_1_states_provinces.geojson`)]);
  const countries = admin0.features.filter(f => /^[A-Z]{2}$/.test(f.properties.ISO_A2_EH))
    .map(f => [f.properties.ISO_A2_EH, f.properties.NAME_LONG || f.properties.NAME, outlines(f.geometry)]);
  const states = admin1.features.filter(f => f.properties.iso_a2 === 'US' && /^US-[A-Z]{2}$/.test(f.properties.iso_3166_2))
    .map(f => [f.properties.iso_3166_2, f.properties.name, outlines(f.geometry)]);
  const countryRings = countries.map(([code, , rings]) => ({ code, rings: rings.map(r => decodeRing(r, SCALE)) }));

  const land = require(path.join(dataDir, 'land.json'));
  const sites = catalogSites();
  const candidates = [];
  for (const ring of land.polygons.map(polygon => decodeRing(polygon[0], land.scale))) {
    const area = areaKm2(ring);
    if (area > ISLAND_MAX_KM2 || area < 0.5) continue;
    const box = bboxOf(ring), pad = ISLAND_SITE_KM / KM_PER_DEG * 1.5;
    const nearby = sites.filter(({ point: [x, y] }) => y >= box[0] - pad && y <= box[2] + pad && x >= box[1] - pad && x <= box[3] + pad
      && (inRing([x, y], ring) || distanceToRingKm([x, y], ring) <= ISLAND_SITE_KM));
    if (nearby.length) candidates.push({ ring, box, area, nearby });
  }
  console.log(`${candidates.length} islands with dive sites to name`);
  // One naming worker per Overpass instance.
  let next = 0, done = 0;
  await Promise.all([0, 1, 2].map(async worker => {
    while (next < candidates.length) {
      const candidate = candidates[next++];
      candidate.name = await islandName(candidate.ring, candidate.box, worker).catch(() => '');
      if (++done % 20 === 0) console.log(`${done}/${candidates.length} checked…`);
    }
  }));
  const islands = candidates.filter(candidate => candidate.name).map(({ ring, box, area, nearby, name }) => {
    const labels = nearby.map(site => site.country).filter(Boolean);
    const label = labels.sort((a, b) => labels.filter(v => v === b).length - labels.filter(v => v === a).length)[0] || '';
    const centre = [(box[1] + box[3]) / 2, (box[0] + box[2]) / 2];
    const country = countryRings.find(c => c.rings.some(r => inRing(centre, r)))?.code || '';
    return [name, label, country, Math.round(area), encodeRing(simplify(ring, 0.005))];
  });
  const checked = candidates.length;
  const output = { source: 'Natural Earth 1:50m admin-0/admin-1 (public domain); islands from Natural Earth 1:10m land named from OpenStreetMap (© OpenStreetMap contributors, ODbL)',
    scale: SCALE, fields: { country: ['iso2', 'name', 'rings'], state: ['iso3166_2', 'name', 'rings'], island: ['name', 'catalogCountry', 'iso2', 'areaKm2', 'ring'] },
    retrievedAt: new Date().toISOString(), countries, states, islands };
  fs.writeFileSync(outputPath, JSON.stringify(output));
  console.log(`Wrote ${countries.length} countries, ${states.length} states, ${islands.length}/${checked} named islands (${(fs.statSync(outputPath).size / 1024).toFixed(0)} KB)`);
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
