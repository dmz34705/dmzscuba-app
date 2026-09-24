// Shared helpers for dive-site importers: freshwater detection against the bundled
// coastline, the existing catalog (for de-duplication) and fuzzy name matching.
const path = require('node:path');
const dataDir = path.resolve(__dirname, '../../src/features/oceanAtlas/data');
const INLAND_KM = 3;
// Pins more than INLAND_KM inside a small island are almost always the island's centre
// standing in for its (ocean) dive sites, not a lake or quarry.
const SMALL_ISLAND_KM2 = 5000;
// --- geometry helpers ---------------------------------------------------------
const rad = value => value * Math.PI / 180;
function metres(a, b) {
  const h = Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(h));
}
function decodeRing(encoded, scale) {
  const points = []; let index = 0, x = 0, y = 0;
  const next = () => { let result = 0, shift = 0, byte; do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20); return result & 1 ? ~(result >> 1) : result >> 1; };
  while (index < encoded.length) { x += next(); y += next(); points.push([x / scale, y / scale]); }
  return points;
}
function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function coastKm(x, y, ring) {
  const k = Math.cos(rad(y));
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const ax = (ring[j][0] - x) * k, ay = ring[j][1] - y, bx = (ring[i][0] - x) * k, by = ring[i][1] - y;
    const dx = bx - ax, dy = by - ay, length = dx * dx + dy * dy;
    const t = length ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best * 111.32;
}
function landIndex() {
  const land = require(path.join(dataDir, 'land.json'));
  return land.polygons.map(polygon => {
    const ring = decodeRing(polygon[0], land.scale);
    const box = ring.reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [180, 90, -180, -90]);
    const areaKm2 = Math.abs(ring.reduce((sum, [x1, y1], i) => { const [x2, y2] = ring[(i + 1) % ring.length]; return sum + (x1 * y2 - x2 * y1) * Math.cos((y1 + y2) / 2 * Math.PI / 180); }, 0) / 2) * 111.32 ** 2;
    return { ring, box, areaKm2 };
  });
}
// Inland when inside a landmass and more than INLAND_KM from its coastline.
function inland(site, rings, minKm = INLAND_KM) {
  const { longitude: x, latitude: y } = site;
  const home = rings.find(({ box, ring }) => x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3] && inRing(x, y, ring));
  return Boolean(home) && home.areaKm2 > SMALL_ISLAND_KM2 && coastKm(x, y, home.ring) > minKm;
}

// --- existing catalog, for de-duplication -----------------------------------
function catalogPoints({ includeImports = [] } = {}) {
  const g = require(path.join(dataDir, 'globalSites.json'));
  const buffer = Buffer.from(g.coordinatesBase64, 'base64');
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.length);
  const points = g.names.map((name, i) => ({ name, latitude: view.getInt32(i * 8, true) / 1e5, longitude: view.getInt32(i * 8 + 4, true) / 1e5 }));
  for (const site of [...require(path.join(dataDir, 'sites.json')), ...require(path.join(dataDir, 'curatedSites.json')), ...require('../../src/lib/diveSites/data/offlineDiveSites.json')]) points.push({ name: site.name, latitude: site.latitude, longitude: site.longitude });
  // Other committed imports (compact rows: [id, name, latitude, longitude, …]).
  for (const file of includeImports) for (const [, name, latitude, longitude] of require(path.join(dataDir, file)).sites) points.push({ name, latitude, longitude });
  return points;
}
const normal = name => String(name).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\b(the|reef|wreck|dive|site|point|of|de|la|el)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
function similar(a, b) {
  const x = normal(a), y = normal(b);
  if (!x || !y) return false;
  if (x === y || x.includes(y) || y.includes(x)) return true;
  const tx = new Set(x.split(' ')), ty = new Set(y.split(' '));
  const shared = [...tx].filter(token => ty.has(token)).length;
  return shared / Math.min(tx.size, ty.size) >= 0.6;
}


// Spatial index over existing points for fast duplicate checks.
function duplicateIndex(points) {
  const grid = new Map();
  const cell = p => `${Math.floor(p.latitude * 20)},${Math.floor(p.longitude * 20)}`;
  const add = p => { const key = cell(p); if (!grid.has(key)) grid.set(key, []); grid.get(key).push(p); };
  points.forEach(add);
  const near = p => {
    const [a, b] = cell(p).split(',').map(Number), found = [];
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) found.push(...(grid.get(`${a + i},${b + j}`) || []));
    return found;
  };
  const isDuplicate = (site, closeM = 150, namedM = 1500) => near(site).some(other => { const d = metres(site, other); return d <= closeM || (d <= namedM && similar(site.name, other.name)); });
  return { add, isDuplicate };
}

module.exports = { metres, landIndex, inland, catalogPoints, similar, duplicateIndex, dataDir };
