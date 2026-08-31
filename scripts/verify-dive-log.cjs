const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { loadSourceModule } = require('./lib/load-source-module.cjs');

const projectRoot = path.join(__dirname, '..');
const srcRoot = path.join(projectRoot, 'src');
const read = (...parts) => fs.readFileSync(path.join(projectRoot, ...parts), 'utf8');

const diveLog = loadSourceModule(path.join(srcRoot, 'lib', 'diveLog', 'index.js'), srcRoot);
const {
  SCHEMA_VERSION,
  DIVE_TYPES,
  DIVE_MODES,
  WATER_TYPES,
  createDiveRecord,
  normalizeDiveRecord,
  touchRecord,
  defaultGasLabel,
  validateDiveRecord,
  computeDiveLogStats,
  formatDepth,
  formatDuration,
  formatTemperature,
  formatPressure,
  formatVolume,
  formatGasLabel,
  formatDate,
  parseDepthInput,
  parsePressureInput,
  parseTemperatureInput,
  parseVolumeInput,
  parseNumberInput,
  depthToInput,
  buildLogProfileGeometry,
  loadIndex,
  loadEntry,
  loadAll,
  saveEntry,
  softDeleteEntry,
  clearAll,
  DIVE_LOG_INDEX_KEY,
  DIVE_LOG_ENTRY_PREFIX,
} = diveLog;

const near = (actual, expected, tolerance = 0.01) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} not within ${tolerance} of ${expected}`);

// ---------------------------------------------------------------------------
// schema
// ---------------------------------------------------------------------------

assert.equal(SCHEMA_VERSION, 1);

const fresh = createDiveRecord({ startTime: '2026-05-01T09:00:00.000Z', durationSeconds: 2400 });
assert.equal(fresh.schemaVersion, 1);
assert.ok(fresh.id && typeof fresh.id === 'string');
assert.ok(!Number.isNaN(Date.parse(fresh.createdAt)));
assert.equal(fresh.deletedAt, null);
assert.equal(fresh.sync.status, 'local');
assert.equal(fresh.source, 'manual');
assert.deepEqual(fresh.gas.mixes, [{ o2: 0.21, he: 0, label: 'Air' }]);
assert.equal(fresh.water.maxDepthMeters, 0);
assert.deepEqual(fresh.types, []);

// normalize: clamps, defaults, drops unknown keys, sorts samples, keeps known types only
const normalized = normalizeDiveRecord({
  id: 'fixed-id',
  startTime: '2026-01-02T10:00:00.000Z',
  durationSeconds: 999999999,
  bogusKey: 'should be dropped',
  number: 12.7,
  rating: 9,
  site: { name: '  Blue Hole  ', latitude: 200, longitude: -30, junk: 1 },
  water: { maxDepthMeters: 900, avgDepthMeters: 18, type: 'brackish' },
  gas: { mixes: [{ o2: 5, he: -1 }], tanks: [{ startBar: 210, endBar: 50, mixIndex: 0 }] },
  types: ['wreck', 'unknown-type', 'night'],
  diveMode: 'oc',
  tags: ['x', 'x', ' y '],
  profile: { samples: [{ t: 30, depth: 12 }, { t: 5, depth: 3 }, { t: 12, depth: 8 }] },
});
assert.equal(normalized.id, 'fixed-id');
assert.ok(!('bogusKey' in normalized));
assert.ok(!('junk' in normalized.site));
assert.equal(normalized.number, 13);
assert.equal(normalized.rating, 5);
assert.equal(normalized.durationSeconds, 24 * 60 * 60);
assert.equal(normalized.site.name, 'Blue Hole');
assert.equal(normalized.site.latitude, 90);
assert.equal(normalized.site.longitude, -30);
assert.equal(normalized.water.maxDepthMeters, 350);
assert.equal(normalized.water.type, null);
assert.equal(normalized.gas.mixes[0].o2, 1);
assert.equal(normalized.gas.mixes[0].he, 0);
assert.deepEqual(normalized.types, ['night', 'wreck']); // canonical DIVE_TYPES order
assert.deepEqual(normalized.tags, ['x', 'y']);
assert.deepEqual(normalized.profile.samples.map((s) => s.t), [5, 12, 30]);

const bumped = touchRecord({ ...normalized, updatedAt: '2000-01-01T00:00:00.000Z' });
assert.ok(Date.parse(bumped.updatedAt) > Date.parse('2020-01-01T00:00:00.000Z'));

assert.equal(defaultGasLabel(0.21, 0), 'Air');
assert.equal(defaultGasLabel(0.32, 0), 'EAN32');
assert.equal(defaultGasLabel(0.18, 0.45), 'TX 18/45');
assert.ok(DIVE_TYPES.includes('wreck') && DIVE_MODES.includes('ccr') && WATER_TYPES.includes('salt'));

// ---------------------------------------------------------------------------
// validation
// ---------------------------------------------------------------------------

const okRecord = createDiveRecord({
  startTime: '2026-05-01T09:00:00.000Z',
  durationSeconds: 2400,
  water: { maxDepthMeters: 30, avgDepthMeters: 18 },
});
assert.equal(validateDiveRecord(okRecord), '');
assert.match(validateDiveRecord(createDiveRecord({ startTime: '', durationSeconds: 1200 })), /valid dive date/i);
assert.match(validateDiveRecord(createDiveRecord({ startTime: '2026-05-01T09:00:00Z', durationSeconds: 0 })), /duration/i);
assert.match(
  validateDiveRecord(normalizeDiveRecord({ startTime: '2026-05-01T09:00:00Z', durationSeconds: 1200, water: { maxDepthMeters: 20, avgDepthMeters: 25 } })),
  /average depth/i,
);
assert.match(
  validateDiveRecord(normalizeDiveRecord({ startTime: '2026-05-01T09:00:00Z', durationSeconds: 1200, gas: { mixes: [{ o2: 0.1, he: 0 }] } })),
  /oxygen/i,
);

// ---------------------------------------------------------------------------
// stats
// ---------------------------------------------------------------------------

const statRows = [
  { id: 'a', startTime: '2024-06-01T10:00:00Z', durationSeconds: 3000, maxDepthMeters: 28, siteName: 'Reef', deletedAt: null },
  { id: 'b', startTime: '2024-07-15T10:00:00Z', durationSeconds: 3600, maxDepthMeters: 40, siteName: 'Wall', deletedAt: null },
  { id: 'c', startTime: '2025-01-10T10:00:00Z', durationSeconds: 1800, maxDepthMeters: 18, siteName: 'Reef', deletedAt: null },
  { id: 'd', startTime: '2025-02-10T10:00:00Z', durationSeconds: 9000, maxDepthMeters: 55, siteName: 'Deep', deletedAt: '2025-03-01T00:00:00Z' },
];
const stats = computeDiveLogStats(statRows);
assert.equal(stats.totalDives, 3);
assert.equal(stats.totalBottomTimeSeconds, 8400);
assert.equal(stats.deepestMeters, 40);
assert.equal(stats.longestSeconds, 3600);
assert.equal(stats.firstDiveDate.slice(0, 4), '2024');
assert.equal(stats.lastDiveDate.slice(0, 7), '2025-01');
assert.deepEqual(stats.byYear.map((y) => [y.year, y.count]), [[2025, 1], [2024, 2]]);
assert.equal(stats.bySite[0].name, 'Reef');
assert.equal(stats.bySite[0].count, 2);
assert.deepEqual(computeDiveLogStats([]).byYear, []);
assert.equal(computeDiveLogStats([]).totalDives, 0);

// ---------------------------------------------------------------------------
// format
// ---------------------------------------------------------------------------

assert.equal(formatDepth(30, 'm'), '30 m');
assert.equal(formatDepth(30, 'ft'), '98 ft');
assert.equal(formatDepth(null, 'm'), '—');
assert.equal(formatDuration(2400), '40 min');
assert.equal(formatDuration(3720), '1h 02m');
assert.equal(formatTemperature(20, 'C'), '20°C');
assert.equal(formatTemperature(0, 'F'), '32°F');
assert.equal(formatPressure(200, 'bar'), '200 bar');
assert.equal(formatPressure(200, 'psi'), '2901 psi');
assert.equal(formatVolume(11.1, 'L'), '11.1 L');
assert.equal(formatVolume(11.1, 'ft³'), '0.4 ft³');
assert.equal(formatGasLabel({ o2: 0.32, he: 0 }), 'EAN32');
assert.equal(formatGasLabel({ o2: 0.32, he: 0, label: 'Bottom mix' }), 'Bottom mix');
assert.equal(formatDate('2026-05-01T09:00:00.000Z').includes('2026'), true);
assert.equal(formatDate('not-a-date'), '');

near(parseDepthInput('100', 'ft'), 30.48);
assert.equal(parseDepthInput('30', 'm'), 30);
assert.equal(parseDepthInput('', 'm'), null);
near(parsePressureInput('2901', 'psi'), 200, 0.05);
near(parseTemperatureInput('50', 'F'), 10);
near(parseVolumeInput('1', 'ft³'), 28.3168, 0.01);
assert.equal(parseNumberInput('12,5'), 12.5);
assert.equal(depthToInput(30.48, 'ft'), '100');

// round trip through the form edge
const depthMeters = parseDepthInput(depthToInput(42, 'ft'), 'ft');
near(depthMeters, 42, 0.5);

// ---------------------------------------------------------------------------
// profileChart
// ---------------------------------------------------------------------------

const emptyGeom = buildLogProfileGeometry([{ t: 0, depth: 0 }], 300, 150, {});
assert.equal(emptyGeom.linePath, '');
assert.deepEqual(emptyGeom.depthTicks, []);

const samples = [];
for (let t = 0; t <= 1800; t += 60) {
  const depth = t < 300 ? t / 10 : t > 1500 ? (1800 - t) / 10 : 30;
  samples.push({ t, depth });
}
const geom = buildLogProfileGeometry(samples, 300, 150, { maxDepthMeters: 30 });
assert.ok(geom.linePath.startsWith('M '));
assert.ok(geom.areaPath.endsWith('Z'));
assert.equal(geom.durationSeconds, 1800);
assert.equal(geom.maxDepthMeters, 30);
assert.ok(geom.depthTicks.length > 0 && geom.depthTicks.every((tick) => tick.y >= 0 && tick.y <= 150));
assert.ok(geom.timeTicks.length > 0 && geom.timeTicks.every((tick) => tick.x >= 0 && tick.x <= 300));
assert.ok(geom.points.every((point) => point.x >= 0 && point.x <= 300 && point.y >= 0 && point.y <= 150));

// ---------------------------------------------------------------------------
// storage (in-memory backend)
// ---------------------------------------------------------------------------

function memoryStorage() {
  const map = new Map();
  return {
    getItem: async (key) => (map.has(key) ? map.get(key) : null),
    setItem: async (key, value) => { map.set(key, String(value)); },
    removeItem: async (key) => { map.delete(key); },
    getAllKeys: async () => [...map.keys()],
    multiRemove: async (keys) => { keys.forEach((key) => map.delete(key)); },
    _map: map,
  };
}

(async () => {
  const store = memoryStorage();

  assert.deepEqual(await loadIndex(store), []);
  assert.equal(await loadEntry('missing', store), null);

  const saved = await saveEntry(createDiveRecord({
    startTime: '2026-05-01T09:00:00.000Z',
    durationSeconds: 2400,
    site: { name: 'Blue Hole' },
    water: { maxDepthMeters: 30 },
  }), store);

  assert.ok(store._map.has(`${DIVE_LOG_ENTRY_PREFIX}${saved.id}`));
  const index = await loadIndex(store);
  assert.equal(index.length, 1);
  assert.equal(index[0].siteName, 'Blue Hole');
  assert.equal(index[0].maxDepthMeters, 30);
  assert.equal(index[0].deletedAt, null);

  const loaded = await loadEntry(saved.id, store);
  assert.equal(loaded.site.name, 'Blue Hole');
  assert.equal(loaded.schemaVersion, 1);

  // update in place: still one index row
  await saveEntry({ ...loaded, notes: 'great viz' }, store);
  assert.equal((await loadIndex(store)).length, 1);
  assert.equal((await loadEntry(saved.id, store)).notes, 'great viz');

  const second = await saveEntry(createDiveRecord({ startTime: '2026-05-02T09:00:00.000Z', durationSeconds: 1800 }), store);
  assert.equal((await loadAll(store)).length, 2);

  const deleted = await softDeleteEntry(saved.id, store);
  assert.ok(deleted.deletedAt);
  const afterDelete = await loadIndex(store);
  assert.equal(afterDelete.find((row) => row.id === saved.id).deletedAt != null, true);
  assert.equal(computeDiveLogStats(afterDelete).totalDives, 1);

  await clearAll(store);
  assert.deepEqual(await loadIndex(store), []);
  assert.equal(store._map.has(DIVE_LOG_INDEX_KEY), false);
  assert.equal(store._map.has(`${DIVE_LOG_ENTRY_PREFIX}${second.id}`), false);

  // ---------------------------------------------------------------------------
  // wiring / source structure
  // ---------------------------------------------------------------------------

  const catalog = read('src', 'features', 'catalog', 'featureCatalog.js');
  assert.match(catalog, /id: 'dive-log'/);
  assert.match(catalog, /routeType: 'dive-log'/);
  assert.match(catalog, /area: 'tools'/);
  assert.match(catalog, /icon: 'logbook'/);

  const navigator = read('src', 'application', 'AppNavigator.js');
  assert.match(navigator, /routeType === 'dive-log'/);
  assert.match(navigator, /<DiveLogScreen appSettings=\{appSettings\.settings\} onBack=\{closeDetail\} \/>/);
  assert.match(navigator, /import DiveLogScreen from '\.\.\/screens\/DiveLogScreen'/);

  assert.match(read('src', 'features', 'catalog', 'FeatureIcon.js'), /logbook: LogbookIcon/);
  assert.match(read('src', 'components', 'DiveIllustrations.js'), /export function LogbookIcon/);

  const screen = read('src', 'screens', 'DiveLogScreen.js');
  assert.match(screen, /useDiveLog/);
  assert.match(screen, /validateDiveRecord/);
  assert.match(screen, /buildLogProfileGeometry/);

  const hook = read('src', 'features', 'diveLog', 'useDiveLog.js');
  assert.match(hook, /loadIndex/);
  assert.match(hook, /saveEntry/);
  assert.match(hook, /softDeleteEntry/);
  assert.doesNotMatch(hook, /AsyncStorage/);

  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['test:dive-log'], 'node scripts/verify-dive-log.cjs');

  console.log('Dive logbook checks passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
