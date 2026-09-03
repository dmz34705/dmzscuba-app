const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { loadSourceModule } = require('./lib/load-source-module.cjs');

const projectRoot = path.join(__dirname, '..');
const srcRoot = path.join(projectRoot, 'src');
const read = (...parts) => fs.readFileSync(path.join(projectRoot, ...parts), 'utf8');

const diveLog = loadSourceModule(path.join(srcRoot, 'lib', 'diveLog', 'index.js'), srcRoot);
const { computerLogFromDownload, computerDiveKey } = loadSourceModule(
  path.join(srcRoot, 'features', 'diveComputerDownload', 'computerLogFromDownload.js'),
  srcRoot,
);
const {
  SCHEMA_VERSION,
  LEGACY_SCHEMA_VERSION,
  DIVE_TYPES,
  DIVE_MODES,
  WATER_TYPES,
  createDive,
  normalizeDive,
  createComputerLog,
  normalizeComputerLog,
  surfaceLogOntoDive,
  withTimeCorrection,
  shiftIso,
  deviceKeyOf,
  computerDiveKeyOf,
  touchRecord,
  defaultGasLabel,
  validateDiveRecord,
  computeDiveLogStats,
  // analytics
  ascentRateStats,
  sawtoothIndex,
  averageDepth,
  surfaceConsumption,
  computeLogAnalytics,
  // format
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
  volumeToInput,
  buildLogProfileGeometry,
  // storage v2
  loadIndex,
  loadDive,
  loadLog,
  loadLogsForDive,
  saveDive,
  createDiveFromLog,
  attachLogToDive,
  softDeleteDive,
  migrateToV2,
  isMigratedToV2,
  rebuildIndex,
  clearAll,
  DIVE_LOG_INDEX_KEY,
  DIVE_LOG_DIVE_PREFIX,
  DIVE_LOG_LOG_PREFIX,
} = diveLog;

const near = (actual, expected, tolerance = 0.01) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} not within ${tolerance} of ${expected}`);

// ---------------------------------------------------------------------------
// schema v2: Dive + ComputerLog
// ---------------------------------------------------------------------------

assert.equal(SCHEMA_VERSION, 2);
assert.equal(LEGACY_SCHEMA_VERSION, 1);

const fresh = createDive({ startTime: '2026-05-01T09:00:00.000Z', durationSeconds: 2400 });
assert.equal(fresh.schemaVersion, 2);
assert.ok(fresh.id && typeof fresh.id === 'string');
assert.equal(fresh.deletedAt, null);
assert.equal(fresh.source, 'manual');
assert.deepEqual(fresh.logIds, []);
assert.equal(fresh.primaryLogId, null);
assert.deepEqual(fresh.gas.mixes, [{ o2: 0.21, he: 0, label: 'Air' }]);
assert.ok(!('profile' in fresh) && !('device' in fresh)); // moved to the log

// Dive normalize: clamps, drops unknown keys, keeps known types only
const nd = normalizeDive({
  id: 'd1',
  startTime: '2026-01-02T10:00:00.000Z',
  durationSeconds: 999999999,
  bogusKey: 'dropped',
  rating: 9,
  site: { name: '  Blue Hole  ', latitude: 200 },
  water: { maxDepthMeters: 900, type: 'brackish' },
  types: ['wreck', 'nope', 'night'],
  logIds: ['a', 'a', 'b'],
  primaryLogId: 'b',
});
assert.equal(nd.id, 'd1');
assert.ok(!('bogusKey' in nd));
assert.equal(nd.rating, 5);
assert.equal(nd.durationSeconds, 24 * 60 * 60);
assert.equal(nd.site.name, 'Blue Hole');
assert.equal(nd.site.latitude, 90);
assert.equal(nd.water.maxDepthMeters, 350);
assert.equal(nd.water.type, null);
assert.deepEqual(nd.types, ['night', 'wreck']);
assert.deepEqual(nd.logIds, ['a', 'b']);
assert.equal(nd.primaryLogId, 'b');

// primaryLogId must be one of logIds, else falls back to the first
assert.equal(normalizeDive({ logIds: ['x', 'y'], primaryLogId: 'z' }).primaryLogId, 'x');

// ComputerLog: reportedStartTime never mutated; startTime = reported + correction
const log = createComputerLog({
  device: { vendor: 'Shearwater', product: 'Petrel 2', serial: 'SN9' },
  fingerprint: 'ZmY=',
  reportedStartTime: '2026-05-01T09:00:00.000Z',
  durationSeconds: 3000,
  water: { maxDepthMeters: 32 },
});
assert.equal(log.schemaVersion, 2);
assert.equal(log.deviceKey, 'Shearwater|Petrel 2|SN9');
assert.equal(log.timeCorrectionMinutes, 0);
assert.equal(log.startTime, '2026-05-01T09:00:00.000Z');

const corrected = withTimeCorrection(log, -420);
assert.equal(corrected.reportedStartTime, '2026-05-01T09:00:00.000Z'); // untouched
assert.equal(corrected.timeCorrectionMinutes, -420);
assert.equal(corrected.startTime, '2026-05-01T02:00:00.000Z');

assert.equal(shiftIso('2026-05-01T09:00:00.000Z', 90), '2026-05-01T10:30:00.000Z');
assert.equal(shiftIso('', 90), '');
assert.equal(deviceKeyOf({ vendor: 'Suunto', product: 'EON Core', serial: '' }), 'Suunto|EON Core|');
assert.equal(deviceKeyOf({ vendor: '', product: '' }), null);
assert.equal(computerDiveKeyOf({ vendor: 'A', product: 'B' }, 'fp'), 'A|B|fp');
assert.equal(computerDiveKeyOf({ vendor: 'A', product: 'B' }, ''), null);

// surfaceLogOntoDive folds the log's summary but never the user's fields
const userDive = createDive({ site: { name: 'My site' }, notes: 'nice', rating: 4, buddies: ['Sam'] });
const merged = surfaceLogOntoDive(userDive, corrected);
assert.equal(merged.site.name, 'My site');
assert.equal(merged.notes, 'nice');
assert.equal(merged.rating, 4);
assert.deepEqual(merged.buddies, ['Sam']);
assert.equal(merged.startTime, corrected.startTime);
assert.equal(merged.durationSeconds, 3000);
assert.equal(merged.water.maxDepthMeters, 32);

assert.equal(defaultGasLabel(0.21, 0), 'Air');
assert.equal(defaultGasLabel(0.18, 0.45), 'TX 18/45');
assert.ok(DIVE_TYPES.includes('wreck') && DIVE_MODES.includes('ccr') && WATER_TYPES.includes('salt'));

// ---------------------------------------------------------------------------
// validation (runs against a normalized Dive)
// ---------------------------------------------------------------------------

const okDive = createDive({
  startTime: '2026-05-01T09:00:00.000Z',
  durationSeconds: 2400,
  water: { maxDepthMeters: 30, avgDepthMeters: 18 },
});
assert.equal(validateDiveRecord(okDive), '');
assert.match(validateDiveRecord(createDive({ startTime: '', durationSeconds: 1200 })), /valid dive date/i);
assert.match(validateDiveRecord(createDive({ startTime: '2026-05-01T09:00:00Z', durationSeconds: 0 })), /duration/i);
assert.match(
  validateDiveRecord(normalizeDive({ startTime: '2026-05-01T09:00:00Z', durationSeconds: 1200, water: { maxDepthMeters: 20, avgDepthMeters: 25 } })),
  /average depth/i,
);

// ---------------------------------------------------------------------------
// stats (index rows)
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
assert.equal(computeDiveLogStats([]).totalDives, 0);

// ---------------------------------------------------------------------------
// format
// ---------------------------------------------------------------------------

assert.equal(formatDepth(30, 'm'), '30 m');
assert.equal(formatDepth(30, 'ft'), '98 ft');
assert.equal(formatDuration(2400), '40 min');
assert.equal(formatDuration(3720), '1h 02m');
assert.equal(formatTemperature(0, 'F'), '32°F');
assert.equal(formatPressure(200, 'psi'), '2901 psi');
assert.equal(formatVolume(11.1, 'L'), '11.1 L');
assert.equal(formatVolume(11.1, 'ft³'), '0.4 ft³'); // no working pressure -> geometric volume
assert.equal(formatVolume(11.1, 'ft³', 207), '80 ft³'); // with working pressure -> gas capacity
near(parseVolumeInput('80', 'ft³', 207), 11.1, 0.2);
assert.equal(volumeToInput(11.1, 'ft³', 207), '80');
assert.equal(formatGasLabel({ o2: 0.32, he: 0 }), 'EAN32');
assert.equal(formatDate('not-a-date'), '');
near(parseDepthInput('100', 'ft'), 30.48);
near(parsePressureInput('2901', 'psi'), 200, 0.05);
near(parseTemperatureInput('50', 'F'), 10);
assert.equal(parseNumberInput('12,5'), 12.5);
assert.equal(depthToInput(30.48, 'ft'), '100');

// ---------------------------------------------------------------------------
// profileChart
// ---------------------------------------------------------------------------

const chartSamples = [];
for (let t = 0; t <= 1800; t += 60) {
  const depth = t < 300 ? t / 10 : t > 1500 ? (1800 - t) / 10 : 30;
  chartSamples.push({ t, depth });
}
const geom = buildLogProfileGeometry(chartSamples, 300, 150, { maxDepthMeters: 30 });
assert.ok(geom.linePath.startsWith('M '));
assert.equal(geom.durationSeconds, 1800);
assert.equal(buildLogProfileGeometry([{ t: 0, depth: 0 }], 300, 150, {}).linePath, '');

// ---------------------------------------------------------------------------
// logAnalytics
// ---------------------------------------------------------------------------

// Square-ish profile: descent, bottom, one clean ascent -> low sawtooth, bounded ascent rate.
const clean = [];
for (let t = 0; t <= 1200; t += 10) {
  const depth = t < 120 ? t / 4 : t > 1080 ? (1200 - t) / 4 : 30;
  clean.push({ t, depth });
}
assert.equal(sawtoothIndex(clean), 0);
near(averageDepth(clean), 27.75, 1.5);
const cleanAscent = ascentRateStats(clean);
near(cleanAscent.maxMPerMin, 15, 0.5); // 2.5 m per 10 s = 15 m/min
assert.equal(cleanAscent.violations > 0, true);

// Sawtooth profile: repeated 30<->10 m bounces add "extra descent".
const yo = [{ t: 0, depth: 0 }];
let d = 0;
for (let i = 0; i < 6; i += 1) {
  d = 30; yo.push({ t: yo[yo.length - 1].t + 120, depth: 30 });
  d = 10; yo.push({ t: yo[yo.length - 1].t + 120, depth: 10 });
}
assert.ok(sawtoothIndex(yo) >= 60, `sawtooth ${sawtoothIndex(yo)} should be large`);

// SAC / RMV from tank pressure
const sac = surfaceConsumption({ startBar: 230, endBar: 90, durationSeconds: 2400, avgDepthMeters: 15, tankVolumeLiters: 11.1 });
near(sac.sacBarPerMin, 1.4, 0.2);
near(sac.rmvLitersPerMin, 15.5, 2.5);
assert.deepEqual(
  surfaceConsumption({ startBar: null, endBar: null, durationSeconds: 2400, avgDepthMeters: 15 }),
  { sacBarPerMin: null, rmvLitersPerMin: null },
);

const analytics = computeLogAnalytics({
  samples: clean,
  decoModel: { type: 'buhlmann', gfLow: 40, gfHigh: 85 },
  durationSeconds: 1200,
  avgDepthMeters: 25,
  tank: { startBar: 220, endBar: 100, volumeLiters: 12 },
});
assert.equal(analytics.gfLow, 40);
assert.equal(analytics.sawtoothIndex, 0);
assert.ok(analytics.sacBarPerMin > 0);
assert.ok(analytics.ascentRateMaxMPerMin > 0);

// ---------------------------------------------------------------------------
// computerLogFromDownload (libdivecomputer parsed dive -> ComputerLog partial)
// ---------------------------------------------------------------------------

const rawComputerDive = {
  fingerprint: 'Zm9vYmFy',
  vendor: 'Shearwater',
  product: 'Peregrine TX',
  serial: 12345,
  datetime: { year: 2026, month: 5, day: 1, hour: 9, minute: 30, second: 0, timezone: -7 * 3600 },
  divetimeSeconds: 2760,
  maxDepthMeters: 30.4,
  avgDepthMeters: 17.2,
  tempSurfaceC: 24,
  tempMinC: 18,
  salinity: 'salt',
  atmosphericBar: 1.01,
  gasmixes: [{ oxygen: 0.32, helium: 0 }, { oxygen: 0.5, helium: 0 }],
  tanks: [{ gasmix: 0, type: 1, volumeLiters: 11.1, workPressureBar: 232, beginPressureBar: 210, endPressureBar: 70 }],
  diveMode: 'oc',
  decoModel: { type: 'buhlmann', gfLow: 40, gfHigh: 85, conservatism: 0 },
  location: { latitude: 32.1, longitude: -80.2 },
  samples: [
    { t: 0, depth: 0 },
    { t: 20, depth: 10, tempC: 22 },
    { t: 40, depth: 30, pressureBar: 180, ndl: 900 },
    { t: 60, depth: 5, deco: { type: 'safetystop', depth: 5, seconds: 180 } },
  ],
  events: [
    { t: 40, type: 'gaschange', gasmix: 1 },
    { t: 55, eventType: 10 },
    { t: 58, eventType: 2 },
  ],
};

const cl = computerLogFromDownload(rawComputerDive);
assert.equal(cl.device.vendor, 'Shearwater');
assert.equal(cl.device.product, 'Peregrine TX');
assert.equal(cl.device.serial, '12345');
assert.equal(cl.fingerprint, 'Zm9vYmFy');
assert.equal(cl.reportedStartTime, '2026-05-01T16:30:00.000Z'); // 09:30 at -07:00
assert.equal(cl.timezoneOffsetMinutes, -420);
assert.equal(cl.durationSeconds, 2760);
assert.equal(cl.water.type, 'salt');
assert.equal(cl.gas.mixes[0].label, 'EAN32');
assert.equal(cl.gas.tanks.length, 1);
assert.equal(cl.gas.tanks[0].startBar, 210);
assert.deepEqual(cl.decoModel, { type: 'buhlmann', gfLow: 40, gfHigh: 85, conservatism: 0 });
assert.equal(cl.profile.samples.length, 4);
assert.equal(cl.profile.sampleIntervalSeconds, 20);
assert.deepEqual(cl.profile.events.map((e) => e.type), ['gaschange', 'safetystop']);
assert.equal(cl.profile.events[0].note, 'EAN50');
assert.ok(cl.analytics && typeof cl.analytics.sawtoothIndex === 'number');

// survives normalization + a Dive built from it validates
const clNorm = normalizeComputerLog(cl);
assert.equal(clNorm.deviceKey, 'Shearwater|Peregrine TX|12345');
const diveFromLog = surfaceLogOntoDive(createDive({ source: 'computer' }), clNorm);
assert.equal(validateDiveRecord(diveFromLog), '');

// tank data with no transmitter (begin/end 0) is dropped
const noTx = computerLogFromDownload({
  ...rawComputerDive,
  tanks: [{ gasmix: 0, volumeLiters: 0, workPressureBar: 0, beginPressureBar: 0, endPressureBar: 0 }],
});
assert.deepEqual(noTx.gas.tanks, []);

// no-timezone datetime -> naive local, no throw; default mix
const noTz = computerLogFromDownload({
  datetime: { year: 2026, month: 1, day: 2, hour: 8, minute: 0, second: 0, timezone: null },
  divetimeSeconds: 1200, maxDepthMeters: 12, gasmixes: [], samples: [],
});
assert.ok(!Number.isNaN(Date.parse(noTz.reportedStartTime)));
assert.deepEqual(noTz.gas.mixes, [{ o2: 0.21, he: 0, label: 'Air' }]);

assert.equal(computerDiveKey('Shearwater', 'Perdix', 'abc'), 'Shearwater|Perdix|abc');
assert.equal(computerDiveKey('Shearwater', 'Perdix', null), null);

// ---------------------------------------------------------------------------
// storage v2 (in-memory backend)
// ---------------------------------------------------------------------------

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
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
  await store.setItem(DIVE_LOG_INDEX_KEY, '[]'); // mark migrated (fresh install)

  assert.deepEqual(await loadIndex(store), []);

  // manual dive
  const d1 = await saveDive(createDive({
    startTime: '2026-05-01T09:00:00.000Z',
    durationSeconds: 2400,
    site: { name: 'Blue Hole' },
    water: { maxDepthMeters: 30 },
  }), store);
  let index = await loadIndex(store);
  assert.equal(index.length, 1);
  assert.equal(index[0].siteName, 'Blue Hole');
  assert.equal(index[0].logCount, 0);
  assert.deepEqual(index[0].deviceKeys, []);

  // download -> new Dive + attached ComputerLog
  const { dive: cDive, log: cLog } = await createDiveFromLog(computerLogFromDownload({
    ...rawComputerDive,
    fingerprint: 'FP-A',
  }), store);
  assert.equal(cDive.source, 'computer');
  assert.deepEqual(cDive.logIds, [cLog.id]);
  assert.equal(cDive.primaryLogId, cLog.id);
  assert.equal(cDive.startTime, cLog.startTime);
  assert.equal(cLog.diveId, cDive.id);
  assert.ok(store._map.has(`${DIVE_LOG_LOG_PREFIX}${cLog.id}`));
  assert.ok(store._map.has(`${DIVE_LOG_DIVE_PREFIX}${cDive.id}`));

  index = await loadIndex(store);
  const cRow = index.find((r) => r.id === cDive.id);
  assert.equal(cRow.logCount, 1);
  assert.deepEqual(cRow.deviceKeys, ['Shearwater|Peregrine TX|12345']);
  assert.deepEqual(cRow.computerKeys, ['Shearwater|Peregrine TX|FP-A']);

  // attach a SECOND computer's log to the same dive (what B6/B7 will do)
  const { dive: dive2, log: log2 } = await attachLogToDive(cDive.id, computerLogFromDownload({
    ...rawComputerDive,
    vendor: 'Suunto',
    product: 'EON Core',
    serial: 777,
    fingerprint: 'FP-B',
  }), {}, store);
  assert.equal(dive2.logIds.length, 2);
  assert.equal(dive2.primaryLogId, cLog.id); // unchanged
  const bundle = { dive: dive2, logs: await loadLogsForDive(dive2, store) };
  assert.equal(bundle.logs.length, 2);
  const row2 = (await loadIndex(store)).find((r) => r.id === cDive.id);
  assert.equal(row2.logCount, 2);
  assert.equal(row2.deviceKeys.length, 2);
  assert.equal(row2.computerKeys.includes('Suunto|EON Core|FP-B'), true);
  assert.equal(log2.id !== cLog.id, true);

  // still 2 dives total (manual + the one computer dive with two logs)
  assert.equal((await loadIndex(store)).filter((r) => !r.deletedAt).length, 2);

  // soft delete
  const del = await softDeleteDive(d1.id, store);
  assert.ok(del.deletedAt);
  assert.equal(computeDiveLogStats(await loadIndex(store)).totalDives, 1);

  // rebuildIndex recomputes rows from Dives + logs
  const rebuilt = await rebuildIndex(store);
  assert.equal(rebuilt.find((r) => r.id === cDive.id).logCount, 2);

  // fingerprint round-trip (unchanged from v1)
  await diveLog.saveFingerprint('EON Core', 'FP-B', store);
  assert.equal(await diveLog.loadFingerprint('EON Core', store), 'FP-B');

  await clearAll(store);
  assert.equal(store._map.has(DIVE_LOG_INDEX_KEY), false);

  // ---- migration v1 -> v2 ----
  const v1Manual = { schemaVersion: 1, id: 'm1', createdAt: '2026-01-01T00:00:00Z', deletedAt: null, source: 'manual', startTime: '2026-01-01T10:00:00Z', durationSeconds: 1800, site: { name: 'Quarry' }, water: { maxDepthMeters: 12 }, gas: { mixes: [{ o2: 0.21, he: 0, label: 'Air' }], tanks: [] }, profile: { samples: [], events: [] } };
  const v1Computer = { schemaVersion: 1, id: 'c1', createdAt: '2026-02-01T00:00:00Z', deletedAt: null, source: 'computer', device: { vendor: 'Shearwater', product: 'Petrel 2', serial: 'SN1', fingerprint: 'oldfp' }, startTime: '2026-02-01T14:00:00Z', durationSeconds: 3000, water: { maxDepthMeters: 33 }, gas: { mixes: [{ o2: 0.32, he: 0, label: 'EAN32' }], tanks: [] }, profile: { samples: [{ t: 0, depth: 0 }, { t: 60, depth: 20 }], events: [] } };
  const mstore = memoryStorage({
    '@dmz-scuba/dive-log/index-v1': JSON.stringify([{ id: 'm1' }, { id: 'c1' }]),
    '@dmz-scuba/dive-log/entry-v1/m1': JSON.stringify(v1Manual),
    '@dmz-scuba/dive-log/entry-v1/c1': JSON.stringify(v1Computer),
  });
  assert.equal(await isMigratedToV2(mstore), false);
  const result = await migrateToV2(mstore);
  assert.equal(result.migrated, 2);
  assert.equal(await isMigratedToV2(mstore), true);
  // idempotent
  assert.equal((await migrateToV2(mstore)).alreadyDone, true);

  const mIndex = await loadIndex(mstore);
  assert.equal(mIndex.length, 2);
  const migManual = await loadDive('m1', mstore);
  assert.equal(migManual.source, 'manual');
  assert.deepEqual(migManual.logIds, []);
  assert.equal(migManual.site.name, 'Quarry');
  const migComputer = await loadDive('c1', mstore);
  assert.equal(migComputer.source, 'computer');
  assert.equal(migComputer.logIds.length, 1);
  const migLog = await loadLog(migComputer.primaryLogId, mstore);
  assert.equal(migLog.device.serial, 'SN1');
  assert.equal(migLog.fingerprint, 'oldfp');
  assert.equal(migLog.profile.samples.length, 2);
  // v1 keys left in place as a backup
  assert.equal(mstore._map.has('@dmz-scuba/dive-log/entry-v1/c1'), true);

  // ---------------------------------------------------------------------------
  // wiring / source structure
  // ---------------------------------------------------------------------------

  const catalog = read('src', 'features', 'catalog', 'featureCatalog.js');
  assert.match(catalog, /id: 'dive-log'/);
  assert.match(catalog, /routeType: 'dive-log'/);

  const navigator = read('src', 'application', 'AppNavigator.js');
  assert.match(navigator, /routeType === 'dive-log'/);
  assert.match(navigator, /import DiveLogScreen from '\.\.\/screens\/DiveLogScreen'/);

  const screen = read('src', 'screens', 'DiveLogScreen.js');
  assert.match(screen, /useDiveLog/);
  assert.match(screen, /validateDiveRecord/);
  assert.match(screen, /buildLogProfileGeometry/);
  assert.match(screen, /\bPressable\b/);
  assert.match(screen, /selectMode/);
  assert.match(screen, /deleteDives/);
  assert.match(screen, /importComputerLog/);
  assert.match(screen, /primaryLog/);

  const hook = read('src', 'features', 'diveLog', 'useDiveLog.js');
  assert.match(hook, /migrateToV2/);
  assert.match(hook, /createDiveFromLog/);
  assert.match(hook, /const deleteDives = useCallback/);
  assert.doesNotMatch(hook, /AsyncStorage/);

  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['test:dive-log'], 'node scripts/verify-dive-log.cjs');

  // --- Part B: native libdivecomputer bridge wiring ---
  assert.match(read('.gitmodules'), /path = vendor\/libdivecomputer/);
  const moduleConfig = JSON.parse(read('modules', 'dive-computer-bridge', 'expo-module.config.json'));
  assert.deepEqual(moduleConfig.apple.modules, ['DiveComputerBridgeModule']);
  const podspec = read('modules', 'dive-computer-bridge', 'ios', 'DiveComputerBridge.podspec');
  assert.match(podspec, /HAVE_CONFIG_H=1/);
  const generatedVersion = read('modules', 'dive-computer-bridge', 'ios', 'generated', 'libdivecomputer', 'version.h');
  assert.match(generatedVersion, /#define DC_VERSION "0\.9\.0"/);

  const appJson = JSON.parse(read('app.json'));
  assert.ok(appJson.expo.plugins.includes('./plugins/withLibDiveComputer'));
  assert.equal(appJson.expo.ios.bundleIdentifier, 'com.dmzscuba.app');
  const blePlugin = appJson.expo.plugins.find((p) => Array.isArray(p) && p[0] === 'react-native-ble-plx');
  assert.ok(blePlugin, 'react-native-ble-plx config plugin must be registered');

  const ble = read('src', 'features', 'diveComputerDownload', 'diveComputerBle.js');
  assert.match(ble, /export function looksLikeDiveComputer/);
  assert.match(ble, /export function looksLikeSuunto/);
  const dlHook = read('src', 'features', 'diveComputerDownload', 'useDiveComputerDownload.js');
  assert.match(dlHook, /connectToDevice/);
  assert.match(dlHook, /primePairing/);

  const runner = read('src', 'features', 'diveComputerDownload', 'downloadRunner.js');
  assert.match(runner, /monitorCharacteristicForService/);
  assert.match(runner, /export async function primePairing/);

  const native = read('modules', 'dive-computer-bridge', 'ios', 'DiveComputerDownloader.m');
  assert.match(native, /resolve_model/);
  assert.match(native, /@"type": @\(t\.type\)/);

  console.log('Dive logbook checks passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
