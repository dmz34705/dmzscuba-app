import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_land.geojson';
const source = process.argv[2] ? await fs.readFile(process.argv[2], 'utf8') : await fetch(url).then(r => { if (!r.ok) throw new Error(`Coastline download: ${r.status}`); return r.text(); });
const land = JSON.parse(source);
// Douglas–Peucker simplification at ~1.1km at the equator. This remains
// sub-pixel through the regional zooms where the climatology is strongest.
function simplify(points) {
  const keep = new Uint8Array(points.length); keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    const a = points[first], b = points[last];
    const dx = b[0] - a[0], dy = b[1] - a[1], length = dx * dx + dy * dy;
    let max = .01 ** 2, index = -1;
    for (let i = first + 1; i < last; i++) {
      const p = points[i], t = length ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length)) : 0;
      const distance = (p[0] - a[0] - t * dx) ** 2 + (p[1] - a[1] - t * dy) ** 2;
      if (distance > max) { max = distance; index = i; }
    }
    if (index !== -1) { keep[index] = 1; stack.push([first, index], [index, last]); }
  }
  let result = points.filter((_, i) => keep[i]);
  if (result.length < 4) result = points;
  return result.map(p => p.map(v => Number(v.toFixed(4))));
}
for (const feature of land.features) {
  feature.properties = {};
  delete feature.bbox;
  if (feature.geometry.type === 'MultiPolygon') feature.geometry.coordinates = feature.geometry.coordinates.map(polygon => polygon.map(simplify));
  else feature.geometry.coordinates = feature.geometry.coordinates.map(simplify);
}
const scale = 10000;
function encodeNumber(value) {
  value = value < 0 ? ~(value << 1) : value << 1;
  let encoded = '';
  while (value >= 0x20) { encoded += String.fromCharCode((0x20 | (value & 0x1f)) + 63); value >>= 5; }
  return encoded + String.fromCharCode(value + 63);
}
function encodeRing(points) {
  let lastX = 0, lastY = 0, encoded = '';
  for (const point of points) {
    const x = Math.round(point[0] * scale), y = Math.round(point[1] * scale);
    encoded += encodeNumber(x - lastX) + encodeNumber(y - lastY);
    lastX = x; lastY = y;
  }
  return encoded;
}
const polygons = land.features.flatMap(feature => {
  const coordinates = feature.geometry.coordinates;
  return (feature.geometry.type === 'MultiPolygon' ? coordinates : [coordinates]).map(polygon => polygon.map(encodeRing));
});
const output = JSON.stringify({ name: 'Natural Earth 1:10m land; mobile display simplification 0.01 degrees', scale, polygons });
await fs.writeFile(path.join(root, 'src/features/oceanAtlas/data/land.json'), output);
console.log(`Bundled detailed coastline: ${(output.length / 1024 / 1024).toFixed(2)} MB, public domain.`);
