const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { loadSourceModule } = require('./lib/load-source-module.cjs');
const root = path.resolve(__dirname, '../src');
const model = loadSourceModule(path.join(root, 'features/oceanAtlas/model.js'), root);
const rendering = loadSourceModule(path.join(root, 'features/oceanAtlas/rendering.js'), root);
const { MARINE_REGIONS } = loadSourceModule(path.join(root, 'features/oceanAtlas/regions.js'), root);
const { OCEAN_REGIONS } = loadSourceModule(path.join(root, 'features/oceanAtlas/oceanRegions.js'), root);
const { DIVE_REGIONS, REMOTE_DIVE_AREAS } = loadSourceModule(path.join(root, 'features/oceanAtlas/diveRegions.js'), root);
const packedGrid = require('../src/features/oceanAtlas/data/temperature.json');
assert.equal(packedGrid.months, undefined, 'Temperature is stored packed (see model.packTemperatureMonth).');
const grid = model.expandTemperature(packedGrid);
const sites = require('../src/features/oceanAtlas/data/sites.json');
const curatedSites = require('../src/features/oceanAtlas/data/curatedSites.json');
const land = require('../src/features/oceanAtlas/data/land.json');
const globalSites = require('../src/features/oceanAtlas/data/globalSites.json');
const { buildAtlasDocument } = loadSourceModule(path.join(root, 'features/oceanAtlas/document.js'), root);

assert.equal(model.validCoordinate(0, 0), true);
for (const pair of [[null, null], ['', ''], [NaN, 0], [91, 0], [0, 181], ['20', 20]]) assert.equal(model.validCoordinate(...pair), false);
const dives = [
  { id: 'zero', site: { latitude: 0, longitude: 0 }, startTime: '2026-01-01' },
  { id: 'new', site: { latitude: 0, longitude: 0 }, startTime: '2026-02-01' },
  { id: 'deleted', site: { latitude: 0, longitude: 0 }, deletedAt: '2026-01-01' },
  { id: 'missing', site: { name: 'Ningaloo', latitude: null, longitude: null } },
  { id: 'invalid', site: { latitude: 100, longitude: 0 } },
];
const pins = model.groupDivePins(dives);
assert.equal(pins.length, 1);
assert.deepEqual(pins[0].dives.map(d => d.id), ['new', 'zero']);
assert.equal(pins[0].dives[0].maxDepthMeters, null, 'Unknown depth is not a zero-depth dive.');
assert.equal(dives.length, 5, 'Building pins does not mutate the logbook.');
assert.equal(grid.months.length, 12);
grid.months.forEach(m => { assert.equal(m.length, 89 * 180); assert.ok(m.every(v => v === null || Number.isInteger(v) && v >= -20 && v <= 450)); });
assert.equal(model.temperatureAt(grid, 0, 180, 0), model.temperatureAt(grid, 0, -180, 0));
assert.equal(model.temperatureAt(grid, 0, -2, 0), model.temperatureAt(grid, 0, 358, 0));
assert.equal(model.temperatureAt(grid, 0, 0, -1), null);
assert.equal(model.temperatureAt(grid, 91, 0, 0), null);
assert.equal(model.temperatureAt(grid, 40, 100, 0), null, 'Continental land remains missing, never an invented SST.');
assert.ok(model.temperatureAt(grid, 0, -150, 0) > 20);
assert.notEqual(model.temperatureAt(grid, 30, -60, 0), model.temperatureAt(grid, 30, -60, 7), 'Month changes real SST values.');
const field = rendering.prepareTemperatureField(grid.months[0]);
assert.equal(rendering.smoothTemperatureAt(field, 0, 180), rendering.smoothTemperatureAt(field, 0, -180));
assert.ok(Math.abs(rendering.smoothTemperatureAt(field, 30, -60.001) - rendering.smoothTemperatureAt(field, 30, -59.999)) < .01, 'Interpolation is continuous across grid centers.');
assert.equal(rendering.smoothTemperatureAt(field, 40, 100), null, 'Remote missing areas stay missing.');
assert.equal(model.temperatureAt(grid, 40, 100, 0), null, 'Visual interpolation never changes readout data.');
assert.equal(rendering.temperatureOpacity(2), .62);
assert.ok(rendering.temperatureOpacity(8) > rendering.temperatureOpacity(9));
assert.equal(rendering.temperatureOpacity(10), 0);
const decodedLand = rendering.decodeLand(land);
assert.equal(decodedLand.type, 'FeatureCollection');
assert.ok(decodedLand.features[0].geometry.coordinates.length > 1000);
assert.deepEqual(rendering.decodeLand(decodedLand), decodedLand, 'Legacy GeoJSON remains accepted.');
const emptyField = rendering.prepareTemperatureField(Array(89 * 180).fill(null));
assert.equal(rendering.smoothTemperatureAt(emptyField, 0, 0), null);
const uniform = rendering.prepareTemperatureField(Array(89 * 180).fill(240));
assert.ok(Math.abs(rendering.smoothTemperatureAt(uniform, 27.123, -179.999) - 24) < 1e-10);
const winter = { months: [11, 12, 1, 2, 3, 4] };
assert.equal(model.seasonStatus(winter, 0), 'In season');
assert.equal(model.seasonStatus(winter, 6), 'Outside typical season');
assert.equal(model.seasonStatus({ months: [] }, 0), 'Season not documented');
assert.equal(model.regionAt(MARINE_REGIONS, 5.2, 73.1).id, 'baa');
assert.equal(model.regionAt(MARINE_REGIONS, 0, -145), null);
assert.equal(model.regionAt([{ bounds: [-10, 170, 10, -170] }], 0, -179).bounds[1], 170);
assert.equal(model.inBounds([8, -100, 33, -59], 24.65, -81.15), true);
assert.equal(model.inBounds([-10, 170, 10, -170], 0, 179), true);
assert.equal(model.inBounds([8, -100, 33, -59], 20.8, -156.6), false, 'Hawaiʻi remains a standalone destination.');
assert.equal(model.oceanRegionAt(OCEAN_REGIONS, 78, 120).id, 'arctic');
assert.equal(model.oceanRegionAt(OCEAN_REGIONS, -62, -100).id, 'southern-ocean');
assert.equal(model.oceanRegionAt(OCEAN_REGIONS, 17, -74).id, 'caribbean');
assert.equal(model.oceanRegionAt(OCEAN_REGIONS, 2, 126).id, 'coral-triangle');
assert.equal(model.oceanRegionAt(OCEAN_REGIONS, NaN, 0), null);
assert.ok(OCEAN_REGIONS.length >= 16);
assert.equal(globalSites.schemaVersion, 3);
const globalIds = globalSites.packedIds.match(/.{6}/g) || [];
const coordinateBuffer = Buffer.from(globalSites.coordinatesBase64, 'base64');
const globalCoordinates = Array.from({ length: coordinateBuffer.length / 4 }, (_, index) => coordinateBuffer.readInt32LE(index * 4));
const globalCountryIndexes = [...Buffer.from(globalSites.countryIndexesBase64, 'base64')].map(value => value - 1);
const depthBuffer = Buffer.from(globalSites.maxDepthsBase64, 'base64');
const globalDepths = Array.from({ length: depthBuffer.length / 2 }, (_, index) => depthBuffer.readUInt16LE(index * 2));
assert.equal(globalSites.recordCount, globalIds.length);
assert.ok(globalSites.recordCount >= 1000, 'The committed global snapshot must not silently fall back to an empty or single-page catalog.');
assert.equal(globalSites.recordCount, globalSites.names.length);
assert.equal(globalCoordinates.length, globalSites.recordCount * 2);
assert.equal(globalCountryIndexes.length, globalSites.recordCount);
assert.equal(globalDepths.length, globalSites.recordCount);
assert.equal(globalSites.license, 'ODbL 1.0');
assert.ok(globalSites.sourceUrl.startsWith('https://'));
for (let index = 0; index < globalSites.recordCount; index += 1) {
  assert.ok(typeof globalIds[index] === 'string' && globalIds[index] && typeof globalSites.names[index] === 'string' && globalSites.names[index]);
  assert.ok(model.validCoordinate(globalCoordinates[index * 2] / 1e5, globalCoordinates[index * 2 + 1] / 1e5));
  assert.ok(Number.isInteger(globalCountryIndexes[index]) && globalCountryIndexes[index] >= -1 && globalCountryIndexes[index] < globalSites.countries.length);
}
for (const region of OCEAN_REGIONS) {
  assert.ok(model.validCoordinate(region.latitude, region.longitude));
  assert.ok(region.url.startsWith('https://'));
  assert.ok(region.habitats.length >= 3 && region.wildlife.length >= 4);
}
assert.ok(DIVE_REGIONS.length >= 10);
assert.equal(new Set(DIVE_REGIONS.map(region => region.id)).size, DIVE_REGIONS.length);
for (const region of DIVE_REGIONS) {
  assert.ok(model.validCoordinate(region.latitude, region.longitude));
  assert.ok(region.areas.length >= 5);
  assert.ok(region.areas.every(area => model.validCoordinate(area.latitude, area.longitude) && model.inBounds(region.bounds, area.latitude, area.longitude)));
}
assert.ok(REMOTE_DIVE_AREAS.every(area => model.validCoordinate(area.latitude, area.longitude)));
assert.ok(DIVE_REGIONS.some(region => region.id === 'caribbean-gulf' && sites.some(site => model.inBounds(region.bounds, site.latitude, site.longitude))));
const allIds = new Set();
for (const site of [...sites, ...curatedSites]) { assert.ok(model.validCoordinate(site.latitude, site.longitude)); assert.ok(site.sources[0].sourceUrl.startsWith('https://')); assert.ok(!allIds.has(site.id)); allIds.add(site.id); }
const cozumelSites = curatedSites.filter(site => site.region === 'Cozumel');
assert.ok(cozumelSites.length >= 15, 'A flagship destination cannot be represented by a single regional gateway.');
for (const name of ['Paraíso Reef', 'Santa Rosa Reef', 'Paso del Cedral', 'Palancar Gardens', 'Palancar Caves', 'Colombia Reef']) {
  assert.ok(cozumelSites.some(site => site.name === name), `Missing recognized Cozumel site: ${name}`);
}
assert.ok(cozumelSites.every(site => /approximate/i.test(site.coordinateQuality) && /not an entry|not a navigation/i.test(site.note)), 'Approximate reef-area pins must not imply navigation precision.');
for (const region of MARINE_REGIONS) for (const s of region.species) { assert.ok(s.url.startsWith('https://')); assert.ok(s.months.every(m => m >= 1 && m <= 12)); assert.equal(new Set(s.months).size, s.months.length); }
const hostile = '</script><script>alert(1)</script>\u2028';
assert.ok(!model.safeJson({ name: hostile }).includes('<'));
assert.deepEqual(JSON.parse(model.safeJson({ name: hostile })), { name: hostile });
const html = buildAtlasDocument();
assert.ok(Buffer.byteLength(html) < 2 * 1024 * 1024, 'Keep inline atlas HTML below 2 MB for reliable native WebView startup.');
assert.ok(Buffer.byteLength(JSON.stringify(land)) < 1024 * 1024, 'Keep the compact coastline below 1 MB.');
const { runtimeSourceHash } = loadSourceModule(path.join(root, 'features/oceanAtlas/data/runtimeSource.js'), root);
const runtimeRaw = ['model.js', 'rendering.js', 'atlasRuntime.js'].map(name => fs.readFileSync(path.join(root, 'features/oceanAtlas', name), 'utf8').replace(/^export /gm, '')).join('\n');
assert.equal(runtimeSourceHash, require('node:crypto').createHash('sha1').update(runtimeRaw).digest('hex'), 'Regenerate the browser runtime after changes (npm run bundle:ocean-atlas).');
assert.equal((html.match(/<script>/g) || []).length, 2);
assert.ok(!html.includes('<script src='), 'No third-party JavaScript can read personal pins.');
assert.ok(html.includes("connect-src 'none'"));
assert.ok(html.includes('1991–2020'));
// OpenStreetMap import: named, located, unique, businesses excluded.
const osm = require('../src/features/oceanAtlas/data/osmSites.json');
assert.ok(osm.sites.length >= 1000 && osm.license === 'ODbL 1.0');
assert.equal(new Set(osm.sites.map(row => row[0])).size, osm.sites.length, 'OSM ids are unique.');
assert.ok(osm.sites.every(([, name, lat, lon]) => name && model.validCoordinate(lat, lon)));
assert.ok(!osm.sites.some(([, name]) => /\b(dive|scuba)\s*(cent(er|re)|shop|school)\b|tauchbasis/i.test(name)), 'Dive businesses are not imported as sites.');
assert.ok(!osm.sites.some(([, name]) => /\b(wrack|wrak|épave|relitto|pecio)\b/i.test(name)), 'Foreign words for wreck are translated to English.');
// Supplementary imports: NOAA moorings, Wikipedia, curated US inland — each with a source link.
const extra = require('../src/features/oceanAtlas/data/extraSites.json');
assert.ok(extra.sites.every(([, name, lat, lon, , , , , source, url]) => name && model.validCoordinate(lat, lon) && extra.sources[source] && /^https:\/\//.test(url)));
for (const wanted of ['Haigh Quarry', 'Blue Hole', 'Bonne Terre Mine', 'Devil\'s Lake']) assert.ok([...osm.sites, ...extra.sites].some(row => row[1].startsWith(wanted)), `${wanted} is in the catalog`);
console.log(`Ocean Atlas checks passed: coordinates, log privacy, seasons, dateline, NOAA grid, ${globalSites.recordCount} global + ${osm.sites.length} OpenStreetMap + ${extra.sites.length} NOAA/Wikipedia/curated + ${sites.length} NOAA + ${curatedSites.length} curated sites, document security.`);
