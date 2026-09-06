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
const shareCardOptions = loadSourceModule(
  path.join(srcRoot, 'features', 'diveShareCard', 'shareCardOptions.js'),
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
  safetyScore,
  computeLogAnalytics,
  computeDiveTrends,
  // matcher
  resampleDepth,
  alignmentScore,
  bestOffset,
  cleanOffsetMinutes,
  classifyPair,
  classifySplit,
  classifyFragment,
  findSpanningMerge,
  findMatch,
  sameComputer,
  reconcileComputers,
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
  loadAll,
  createDiveFromLog,
  attachLogToDive,
  softDeleteDive,
  migrateToV2,
  isMigratedToV2,
  rebuildIndex,
  clearAll,
  checkLogbookIntegrity,
  repairLogbook,
  refreshIndexRows,
  restoreJsonBackup,
  loadLogbookBundleForIds,
  exportLogbookJson,
  exportLogbookCsv,
  exportLogbookUddf,
  DIVE_LOG_INDEX_KEY,
  DIVE_LOG_DIVE_PREFIX,
  DIVE_LOG_LOG_PREFIX,
  sectionsForMode,
  sectionIsVisible,
  hiddenDataSections,
  createJsonBackup,
  createJsonExport,
  stringifyJsonBackup,
  parseJsonBackup,
  exportDivesToCsv,
  exportDivesToUddf,
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

// Mode policy is pure data: CCR exposes its future technical sections, while
// freedive does not expose cylinder/gear controls. Existing data is surfaced
// in an explicit recovery section rather than disappearing after a mode edit.
assert.ok(sectionIsVisible('ccr', 'gasEquipment'));
assert.ok(!sectionIsVisible('freedive', 'gasEquipment'));
assert.ok(sectionsForMode('oc').includes('computerAnalytics'));
assert.deepEqual(hiddenDataSections('freedive', { gas: { tanks: [{ startBar: 200 }] } }), ['gasEquipment']);
assert.deepEqual(hiddenDataSections('freedive', { gas: { mixes: [{ o2: 0.32, label: 'EAN32' }] } }), ['gasEquipment']);

const exportDive = createDive({ id: 'export-dive', startTime: '2026-05-01T09:00:00.000Z', durationSeconds: 1200, site: { name: 'Blue, Hole' }, notes: 'great\ndive', gas: { mixes: [{ o2: 0.32, he: 0, label: 'EAN32' }], tanks: [{ volumeLiters: 11.1, startBar: 200, endBar: 60, mixIndex: 0 }] } });
const exportLog = createComputerLog({ id: 'export-log', diveId: 'export-dive', profile: { samples: [{ t: 0, depth: 0, tempC: 20 }, { t: 600, depth: 30, ppo2: 1.28 }] } });
const backupText = stringifyJsonBackup({ dives: [exportDive], logs: [exportLog] });
const backup = parseJsonBackup(backupText);
assert.equal(backup.dives[0].id, 'export-dive');
assert.equal(backup.computerLogs[0].profile.samples[1].ppo2, 1.28);
const csv = exportDivesToCsv([{ dive: exportDive, logs: [exportLog] }]);
assert.match(csv, /Blue, Hole/);
assert.match(csv, /"great\ndive"/);
const uddf = exportDivesToUddf([{ dive: exportDive, logs: [exportLog] }]);
assert.match(uddf, /<uddf version="3\.2\.3">/);
assert.match(uddf, /<samples>/);
assert.match(uddf, /<ppo2>1\.28<\/ppo2>/);
const summaryExport = createJsonExport({ dives: [exportDive], logs: [exportLog], detail: 'summary' });
assert.deepEqual(summaryExport.computerLogs[0].profile.samples, []);
assert.match(exportDivesToCsv([{ dive: exportDive, logs: [exportLog] }], { detail: 'full' }), /sample_t_seconds/);
assert.match(exportDivesToCsv([{ dive: exportDive, logs: [exportLog] }], { detail: 'full' }), /600,30/);

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
assert.equal(geom.hasPressure, false);
assert.equal(buildLogProfileGeometry([{ t: 0, depth: 0 }], 300, 150, {}).linePath, '');

// tank-pressure overlay: a declining pressure series produces its own path + axis
const withPressure = chartSamples.map((s, i) => ({ ...s, pressureBar: 230 - i * 4, tempC: 20 - i * 0.2 }));
const pg = buildLogProfileGeometry(withPressure, 300, 150, { maxDepthMeters: 30 });
assert.equal(pg.hasPressure, true);
assert.ok(pg.pressurePath.startsWith('M '));
assert.ok(pg.pressureRange.max > pg.pressureRange.min);
assert.equal(pg.pressureRange.min, 0); // pressure axis starts at empty
assert.equal(pg.hasTemp, true);

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
  events: [{ t: 1000, type: 'safetystop' }],
  decoModel: { type: 'buhlmann', gfLow: 40, gfHigh: 85 },
  durationSeconds: 1200,
  avgDepthMeters: 25,
  maxDepthMeters: 30,
  tank: { startBar: 220, endBar: 100, volumeLiters: 12 },
});
assert.equal(analytics.gfLow, 40);
assert.equal(analytics.sawtoothIndex, 0);
assert.ok(analytics.sacBarPerMin > 0);
assert.ok(analytics.ascentRateMaxMPerMin > 0);
assert.ok(typeof analytics.safetyScore === 'number');

// safety score: a clean dive with a stop scores high; a yo-yo with no stop drops
const gentle = [];
for (let t = 0; t <= 1800; t += 10) {
  // descend 30 m in 3 min, bottom, ascend 30 m in 5 min (~6 m/min)
  const depth = t < 180 ? (t / 180) * 30 : t > 1500 ? Math.max(0, 30 - ((t - 1500) / 300) * 30) : 30;
  gentle.push({ t, depth });
}
const cleanScore = safetyScore({ samples: gentle, events: [{ t: 1600, type: 'safetystop' }], maxDepthMeters: 30, hadDeco: false });
assert.ok(cleanScore.score >= 90, `clean ${cleanScore.score}`);
const messyScore = safetyScore({ samples: yo, events: [], maxDepthMeters: 30, hadDeco: false });
assert.ok(messyScore.score < cleanScore.score, `messy ${messyScore.score} < clean ${cleanScore.score}`);
assert.ok(messyScore.flags.length > 0);

// computeDiveTrends off index rows
const trendRows = [
  { id: 't1', startTime: '2025-01-01T10:00:00Z', durationSeconds: 2400, deletedAt: null, safetyScore: 70, sacBarPerMin: 1.6, avgDepthMeters: 18, gasLabel: 'Air', ascentRateMaxMPerMin: 12 },
  { id: 't2', startTime: '2025-02-01T10:00:00Z', durationSeconds: 2400, deletedAt: null, safetyScore: 80, sacBarPerMin: 1.4, avgDepthMeters: 16, gasLabel: 'Air', ascentRateMaxMPerMin: 8 },
  { id: 't3', startTime: '2025-03-01T10:00:00Z', durationSeconds: 2400, deletedAt: null, safetyScore: 92, sacBarPerMin: 1.1, avgDepthMeters: 15, gasLabel: 'EAN32', ascentRateMaxMPerMin: 7 },
  { id: 't4', startTime: '2025-03-05T10:00:00Z', durationSeconds: 1000, deletedAt: '2025-03-06Z', safetyScore: 10 },
];
const trends = computeDiveTrends(trendRows);
assert.equal(trends.diveCount, 3);
assert.ok(trends.sac.mean > 1.2 && trends.sac.mean < 1.5);
assert.ok(trends.sac.trendPerDive < 0);       // SAC dropping over time = improving
assert.ok(trends.safety.trendPerDive > 0);    // safety rising = improving
assert.equal(trends.fastAscentDives, 1);
assert.deepEqual(trends.gasMix.map((g) => g.label).sort(), ['Air', 'EAN32']);

// ---------------------------------------------------------------------------
// matchDives (cross-computer same-dive detection)
// ---------------------------------------------------------------------------

// A trapezoid profile: 3 min descent, ~34 min bottom at 30 m, 3 min ascent.
function trapezoid(bottomDepth = 30, bottomSec = 2040) {
  const s = [];
  for (let t = 0; t <= 180; t += 10) s.push({ t, depth: (t / 180) * bottomDepth });
  for (let t = 190; t <= 180 + bottomSec; t += 10) s.push({ t, depth: bottomDepth });
  const base = 180 + bottomSec;
  for (let t = base + 10; t <= base + 180; t += 10) s.push({ t, depth: bottomDepth * (1 - (t - base) / 180) });
  return s;
}

assert.equal(resampleDepth([{ t: 0, depth: 0 }, { t: 20, depth: 10 }], 10).length, 3);
assert.equal(resampleDepth([{ t: 0, depth: 0 }], 10).length, 0);
assert.equal(cleanOffsetMinutes(-7 * 3600 + 30), -420); // snaps to a whole hour
assert.equal(cleanOffsetMinutes(1234), null);          // not clock-shaped
assert.equal(cleanOffsetMinutes(40 * 3600), null);     // 40 h is not a plausible clock error
assert.equal(cleanOffsetMinutes(3 * 3600), 180);       // 3 h is fine

const baseProfile = trapezoid();
const clone = () => baseProfile.map((x) => ({ ...x }));

// identical profiles, clocks agree
const a1 = { reportedStartTime: '2025-03-10T14:00:00.000Z', durationSeconds: 2400, water: { maxDepthMeters: 30 }, profile: { samples: clone() } };
const b1 = { startTime: '2025-03-10T14:00:00.000Z', durationSeconds: 2400, water: { maxDepthMeters: 30 }, profile: { samples: clone() } };
const agree = classifyPair(a1, b1);
assert.equal(agree.verdict, 'auto');
assert.equal(agree.clockConflict, false);

// same dive, second computer's clock 7 h ahead
const b2 = { startTime: '2025-03-10T21:00:00.000Z', durationSeconds: 2400, water: { maxDepthMeters: 30 }, profile: { samples: clone() } };
const conflict = classifyPair(a1, b2);
assert.ok(conflict.verdict === 'auto' || conflict.verdict === 'confirm');
assert.equal(conflict.clockConflict, true);
assert.equal(conflict.offsetMinutes, 420); // add +7 h to a1's clock to meet b2 (21:00)
assert.equal(conflict.cleanOffset, true);

// a genuinely different dive (shallower, shorter) -> no match
const other = { startTime: '2025-03-10T14:00:00.000Z', durationSeconds: 1200, water: { maxDepthMeters: 12 }, profile: { samples: trapezoid(12, 900) } };
assert.equal(classifyPair(a1, other).verdict, 'none');

// same profile but the other clock is 30 h off -> matched, but NOT auto, and flagged
const bWayOff = { startTime: '2025-03-11T20:00:00.000Z', durationSeconds: 2400, water: { maxDepthMeters: 30 }, profile: { samples: clone() } };
const wild = classifyPair(a1, bWayOff);
assert.ok(wild.verdict === 'confirm', `verdict ${wild.verdict}`);
assert.equal(wild.implausibleClock, true);
assert.equal(wild.cleanOffset, false);

// split: b saw one dive; a's device logged it as two fragments over a 5-min surface.
// wide's profile is exactly the two fragments stitched over a 300 s gap.
const fragASamples = trapezoid(30, 840);   // 1200 s
const fragBSamples = trapezoid(28, 540);   // 900 s
const fragA = { id: 'fa', deviceKey: 'Suunto|EON Core|1', startTime: '2025-03-10T14:00:00.000Z', durationSeconds: 1200, water: { maxDepthMeters: 30 }, profile: { samples: fragASamples } };
const fragB = { id: 'fb', deviceKey: 'Suunto|EON Core|1', startTime: '2025-03-10T14:25:00.000Z', durationSeconds: 900, water: { maxDepthMeters: 28 }, profile: { samples: fragBSamples } };
const stitchedSamples = [
  ...fragASamples.map((s) => ({ ...s })),
  { t: 1350, depth: 1 },
  ...fragBSamples.map((s) => ({ t: 1500 + s.t, depth: s.depth })),
];
const wide = { reportedStartTime: '2025-03-10T14:00:00.000Z', durationSeconds: 2400, water: { maxDepthMeters: 30 }, profile: { samples: stitchedSamples } };
const split = classifySplit(wide, fragA, fragB);
assert.ok(split.verdict !== 'none', `split verdict ${split.verdict}`);
assert.deepEqual(split.fragmentIds, ['fa', 'fb']);

// --- split-dive: one long dive vs two fragments from another computer ---
// A 60-min dive with a brief mid-dive ascent to ~3 m (which trips a Suunto into
// ending one dive and starting another; a Shearwater logs it as continuous).
function longDiveProfile() {
  const s = [];
  for (let t = 0; t <= 3600; t += 10) {
    let depth;
    if (t < 180) depth = (t / 180) * 30;
    else if (t >= 1680 && t < 1860) {
      const p = (t - 1680) / 180;
      depth = p < 0.5 ? 30 - (p / 0.5) * 28 : 2 + ((p - 0.5) / 0.5) * 28;
    } else if (t > 3420) depth = Math.max(0, 30 * (1 - (t - 3420) / 180));
    else depth = 30;
    s.push({ t, depth });
  }
  return s;
}
const longProfile = longDiveProfile();
const shearLong = {
  deviceKey: 'Shearwater|Perdix|1', reportedStartTime: '2026-08-27T13:00:00.000Z',
  durationSeconds: 3600, water: { maxDepthMeters: 30 }, profile: { samples: longProfile.map((x) => ({ ...x })) },
};
// Suunto fragment 1: the dive up to the surface excursion
const suFrag1Samples = longProfile.filter((x) => x.t <= 1770).map((x) => ({ ...x }));
const suFrag1 = {
  id: 'su1', deviceKey: 'Suunto|EON Core|9', startTime: '2026-08-27T13:00:00.000Z', reportedStartTime: '2026-08-27T13:00:00.000Z',
  durationSeconds: 1770, water: { maxDepthMeters: 30 }, profile: { samples: suFrag1Samples },
};
// Suunto fragment 2: the redescent onward, re-based to t=0
const suFrag2Samples = [{ t: 0, depth: 1 }];
longProfile.filter((x) => x.t >= 1800).forEach((x) => suFrag2Samples.push({ t: x.t - 1800 + 30, depth: x.depth }));
const suFrag2 = {
  id: 'su2', deviceKey: 'Suunto|EON Core|9', startTime: '2026-08-27T13:30:30.000Z', reportedStartTime: '2026-08-27T13:30:30.000Z',
  durationSeconds: 1830, water: { maxDepthMeters: 30 }, profile: { samples: suFrag2Samples },
};

// classifyFragment: each Suunto fragment is part of the longer Shearwater dive
const frag2Match = classifyFragment(suFrag2, shearLong);
assert.ok(frag2Match.verdict !== 'none', `frag2 verdict ${frag2Match.verdict} score ${frag2Match.score}`);
assert.ok(frag2Match.windowStartSec > 1200, `frag2 window ${frag2Match.windowStartSec}`);
// frag2 genuinely starts ~30 min into the dive and the clocks agree -> ~0 offset
// (regression: wallStart is ms; the offset must not be 1000x too big)
assert.ok(Math.abs(frag2Match.offsetMinutes) <= 2, `frag2 offset ${frag2Match.offsetMinutes} min`);
// same fragment, but its clock is a real +3 h out
const frag2Shifted = { ...suFrag2, reportedStartTime: '2026-08-27T10:30:30.000Z', startTime: '2026-08-27T10:30:30.000Z' };
const shiftedMatch = classifyFragment(frag2Shifted, shearLong);
assert.equal(shiftedMatch.offsetMinutes, 180, `expected +180, got ${shiftedMatch.offsetMinutes}`);
// a whole separate dive is NOT a fragment
assert.equal(classifyFragment(other, shearLong).verdict, 'none');

// findSpanningMerge: the long Shearwater dive spans the two separate Suunto dives
const spanning = findSpanningMerge(shearLong, [
  { dive: { id: 'dvA', primaryLogId: 'su1' }, logs: [suFrag1] },
  { dive: { id: 'dvB', primaryLogId: 'su2' }, logs: [suFrag2] },
]);
assert.ok(spanning, 'expected a spanning merge');
assert.equal(spanning.kind, 'spanning-merge');
assert.deepEqual(spanning.diveIds.sort(), ['dvA', 'dvB']);

// findMatch: importing the Suunto fragment finds it belongs to the existing long dive
const fmFrag = findMatch(suFrag2, [
  { dive: { id: 'dvLong', primaryLogId: 'sl' }, logs: [{ ...shearLong, id: 'sl' }] },
]);
assert.ok(fmFrag.bestMatch && fmFrag.bestMatch.diveId === 'dvLong', 'fragment should match the long dive');
assert.equal(fmFrag.bestMatch.kind, 'fragment');

// findMatch NEVER cross-matches two dives from the SAME computer (same deviceKey).
// suFrag1 and suFrag2 are both Suunto|EON Core|9 — even though frag2's profile is
// a sub-window of frag1's shape, they must not be proposed as a match.
const fmSameSn = findMatch(
  { ...suFrag2, deviceKey: 'Suunto|EON Core|9', fingerprint: 'x2' },
  [{ dive: { id: 'dvSu1', primaryLogId: 'g1' }, logs: [{ ...suFrag1, id: 'g1', fingerprint: 'x1' }] }],
);
assert.equal(fmSameSn.bestMatch, null, 'same-computer dives must never be cross-matched');

// sameComputer is serial-tolerant: a missing serial on one side still = one unit
assert.equal(sameComputer({ vendor: 'Suunto', product: 'EON Core', serial: '123' }, { vendor: 'Suunto', product: 'EON Core', serial: '' }), true);
assert.equal(sameComputer({ vendor: 'Suunto', product: 'EON Core', serial: '123' }, { vendor: 'Suunto', product: 'EON Core', serial: '999' }), false);
assert.equal(sameComputer({ vendor: 'Suunto', product: 'EON Core' }, { vendor: 'Shearwater', product: 'Perdix' }), false);

// A Suunto dive with a battery-pull clock (years off) must NOT match another
// Suunto dive of the same model just because the profiles look alike.
const su2024 = { deviceKey: 'Suunto|EON Core|', device: { vendor: 'Suunto', product: 'EON Core', serial: '' }, reportedStartTime: '2024-01-05T09:00:00.000Z', startTime: '2024-01-05T09:00:00.000Z', durationSeconds: 2400, water: { maxDepthMeters: 30 }, profile: { samples: clone() } };
const su2026 = { id: 'g', deviceKey: 'Suunto|EON Core|778', device: { vendor: 'Suunto', product: 'EON Core', serial: '778' }, primaryLogId: 'g', reportedStartTime: '2026-08-27T13:00:00.000Z', startTime: '2026-08-27T13:00:00.000Z', durationSeconds: 2400, water: { maxDepthMeters: 30 }, profile: { samples: clone() } };
assert.equal(findMatch(su2024, [{ dive: { id: 'dv2026', primaryLogId: 'g' }, logs: [su2026] }]).bestMatch, null);
// but once a different computer's dive is present, the fragment attaches to IT
const fmMixed = findMatch(
  { ...suFrag2, deviceKey: 'Suunto|EON Core|9', fingerprint: 'x2' },
  [{ dive: { id: 'dvMix', primaryLogId: 'sh' }, logs: [{ ...shearLong, id: 'sh' }, { ...suFrag1, id: 'g1', fingerprint: 'x1' }] }],
);
assert.ok(fmMixed.bestMatch && fmMixed.bestMatch.diveId === 'dvMix');

// --- reconcileComputers: whole-trip alignment across 3 dives, one split ---
const H = 3600 * 1000;
const MIN = 60 * 1000;
const prof = (n) => { const s = []; for (let t = 0; t <= n; t += 20) s.push({ t, depth: t < 120 ? t / 4 : t > n - 120 ? (n - t) / 4 : 30 }); return s; };
// Computer A (Shearwater) — clock correct
const AT = Date.parse('2026-08-27T13:00:00.000Z');
const A = [
  { id: 'a1', startMs: AT, durationSeconds: 3600, maxDepthMeters: 30, samples: prof(3600) },
  { id: 'a2', startMs: AT + 3 * H, durationSeconds: 2700, maxDepthMeters: 28, samples: prof(2700) },
  { id: 'a3', startMs: AT + 6 * H, durationSeconds: 1800, maxDepthMeters: 20, samples: prof(1800) },
];
// Computer B (Suunto) — clock 3 h BEHIND, and it split dive 2 into two
const BT = AT - 3 * H;
const B = [
  { id: 'b1', startMs: BT, durationSeconds: 3600, maxDepthMeters: 30, samples: prof(3600) },
  { id: 'b2a', startMs: BT + 3 * H, durationSeconds: 1200, maxDepthMeters: 28, samples: prof(1200) },
  { id: 'b2b', startMs: BT + 3 * H + 25 * MIN, durationSeconds: 1200, maxDepthMeters: 24, samples: prof(1200) },
  { id: 'b3', startMs: BT + 6 * H, durationSeconds: 1800, maxDepthMeters: 20, samples: prof(1800) },
];
const rec = reconcileComputers(A, B);
assert.ok(rec, 'expected a reconciliation');
assert.equal(rec.offsetMinutes, 180, `offset ${rec.offsetMinutes} (add 3 h to B)`);
assert.equal(rec.confidence, 'high');
// the split dive: A's a2 == B's b2a + b2b
const splitGroup = rec.groups.find((g) => g.aIds.includes('a2'));
assert.ok(splitGroup, 'a2 should be grouped');
assert.deepEqual(splitGroup.bIds.sort(), ['b2a', 'b2b']);
// the clean 1:1 dives are grouped too
assert.ok(rec.groups.some((g) => g.aIds.includes('a1') && g.bIds.includes('b1')));
assert.ok(rec.groups.some((g) => g.aIds.includes('a3') && g.bIds.includes('b3')));

// two computers that share nothing -> null
assert.equal(reconcileComputers(A, [{ id: 'z', startMs: AT + 90 * 24 * H, durationSeconds: 1200, maxDepthMeters: 8, samples: prof(1200) }]), null);

// ONE shared dive, clocks agree, Suunto split it in two (the diver briefly
// surfaced, which the Shearwater also recorded). Single anchor but the profiles
// line up -> high confidence, auto-mergeable.
// The diver surfaced from ~1200s to ~1500s — that's why the Suunto ended the
// dive there; the Shearwater kept one continuous log through it.
const contProfile = [];
for (let t = 0; t <= 3600; t += 20) {
  let d;
  if (t < 120) d = t / 4;
  else if (t <= 1200) d = 30;
  else if (t < 1500) d = 1;             // at the surface between fragments
  else if (t < 1620) d = (t - 1500) / 4;
  else if (t < 3480) d = 28;
  else d = (3600 - t) / 4;
  contProfile.push({ t, depth: d });
}
const oneA = [{ id: 'A1', startMs: AT, durationSeconds: 3600, maxDepthMeters: 30, samples: contProfile }];
const oneB = [
  { id: 'B1a', startMs: AT, durationSeconds: 1200, maxDepthMeters: 30, samples: prof(1200) },
  { id: 'B1b', startMs: AT + 1500 * 1000, durationSeconds: 2100, maxDepthMeters: 28, samples: prof(2100) },
];
const recOne = reconcileComputers(oneA, oneB);
assert.ok(recOne, 'one-shared-dive reconciliation');
assert.equal(recOne.confidence, 'high', `confidence ${recOne.confidence} score ${recOne.profileScore}`);
assert.equal(Math.abs(recOne.offsetMinutes) < 1, true);
assert.deepEqual(recOne.groups[0].bIds.sort(), ['B1a', 'B1b']);

// findMatch wires it together; ignores same-device candidates
const fmNew = { deviceKey: 'Shearwater|Perdix|9', reportedStartTime: '2025-03-10T21:00:00.000Z', durationSeconds: 2400, water: { maxDepthMeters: 30 }, profile: { samples: clone() } };
const fm = findMatch(fmNew, [
  { dive: { id: 'dv1', primaryLogId: 'lg1' }, logs: [{ id: 'lg1', deviceKey: 'Suunto|EON Core|1', startTime: '2025-03-10T14:00:00.000Z', durationSeconds: 2400, water: { maxDepthMeters: 30 }, profile: { samples: clone() } }] },
]);
assert.ok(fm.bestMatch && fm.bestMatch.diveId === 'dv1');
assert.equal(fm.bestMatch.offsetMinutes, -420);
// same-device candidate is skipped
assert.equal(
  findMatch(fmNew, [{ dive: { id: 'dvx', primaryLogId: 'l' }, logs: [{ id: 'l', deviceKey: 'Shearwater|Perdix|9', startTime: '2025-03-10T21:00:00.000Z', durationSeconds: 2400, water: { maxDepthMeters: 30 }, profile: { samples: clone() } }] }]).bestMatch,
  null,
);

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
assert.equal(cl.water.tempSurfaceC, 24);
assert.equal(cl.water.tempMinC, 18);
assert.equal(cl.gas.mixes[0].label, 'EAN32');
assert.equal(cl.gas.tanks.length, 1);
assert.equal(cl.gas.tanks[0].startBar, 210);
assert.deepEqual(cl.decoModel, { type: 'buhlmann', gfLow: 40, gfHigh: 85, conservatism: 0 });
assert.equal(cl.profile.samples.length, 4);
assert.equal(cl.profile.sampleIntervalSeconds, 20);
assert.deepEqual(cl.profile.events.map((e) => e.type), ['gaschange', 'safetystop']);
assert.equal(cl.profile.events[0].note, 'EAN50');
assert.ok(cl.analytics && typeof cl.analytics.sawtoothIndex === 'number');

// Summary temperatures are derived from the sampled profile when a computer
// supplies sample temperatures but no DC_FIELD_TEMPERATURE_* summary fields.
const derivedTemperature = computerLogFromDownload({
  ...rawComputerDive,
  tempSurfaceC: null,
  tempMinC: null,
  tempMaxC: null,
  samples: [
    { t: 0, depth: 0.5, tempC: 25 },
    { t: 20, depth: 12, tempC: 21 },
    { t: 40, depth: 20, tempC: 19 },
  ],
});
assert.equal(derivedTemperature.water.tempSurfaceC, 25);
assert.equal(derivedTemperature.water.tempMinC, 19);
assert.equal(derivedTemperature.water.tempMaxC, 25);

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
  const assertIntegrity = async (target, label) => {
    const result = await checkLogbookIntegrity(target);
    assert.equal(result.ok, true, `${label}: ${JSON.stringify(result.problems)}`);
  };
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
  await assertIntegrity(store, 'manual save');
  assert.equal((await loadLogbookBundleForIds([d1.id], store)).length, 1);
  assert.equal((await exportLogbookJson(store, [d1.id])).dives.length, 1);
  assert.match(await exportLogbookCsv(store, [d1.id]), /Blue Hole/);
  assert.match(await exportLogbookUddf(store, [d1.id]), /export-dive|Blue Hole|<uddf/);

  // JSON restore is normalized, additive, and collision-safe. The existing
  // dive stays untouched while its imported copy and log receive new ids.
  const restoreStore = memoryStorage({ [DIVE_LOG_INDEX_KEY]: '[]' });
  await saveDive(d1, restoreStore);
  const restoreLog = createComputerLog({ id: 'restore-log', diveId: d1.id, durationSeconds: 900 });
  const restoreResult = await restoreJsonBackup(stringifyJsonBackup({ dives: [{ ...d1, logIds: [restoreLog.id], primaryLogId: restoreLog.id }], logs: [restoreLog] }), restoreStore);
  assert.equal(restoreResult.importedDives.length, 1);
  assert.equal(restoreResult.remappedDives, 1);
  assert.equal(restoreResult.remappedLogs, 0);
  assert.equal((await loadIndex(restoreStore)).length, 2);
  const importedCopy = (await loadIndex(restoreStore)).find((row) => row.id !== d1.id);
  assert.ok(importedCopy);
  const restoredBundle = await loadDive(importedCopy.id, restoreStore);
  assert.equal(restoredBundle.logIds.length, 1);
  assert.equal(restoredBundle.logIds[0], restoreLog.id);
  await assertIntegrity(restoreStore, 'additive JSON restore');

  // batch import: N dives written with ONE index write (no lost rows)
  const batchStore = memoryStorage({ [DIVE_LOG_INDEX_KEY]: '[]' });
  const batch = await diveLog.createDivesFromLogs(
    [1, 2, 3, 4, 5].map((n) => computerLogFromDownload({
      ...rawComputerDive,
      fingerprint: `B-${n}`,
      datetime: { year: 2026, month: 6, day: n, hour: 9, minute: 0, second: 0, timezone: 0 },
    })),
    batchStore,
  );
  assert.equal(batch.length, 5);
  assert.equal((await loadIndex(batchStore)).length, 5, 'all 5 batch dives must be indexed');
  assert.equal(new Set((await loadIndex(batchStore)).map((r) => r.id)).size, 5);
  await assertIntegrity(batchStore, 'batch import');

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
  const staleRows = await loadIndex(store);
  const staleAt = staleRows.findIndex((row) => row.id === cDive.id);
  staleRows[staleAt] = { ...staleRows[staleAt], logCount: 88, deviceKeys: ['stale'], computerKeys: ['stale'] };
  await store.setItem(DIVE_LOG_INDEX_KEY, JSON.stringify(staleRows));
  await refreshIndexRows([cDive.id], store);
  const refreshedRow = (await loadIndex(store)).find((row) => row.id === cDive.id);
  assert.equal(refreshedRow.logCount, 1);
  assert.deepEqual(refreshedRow.deviceKeys, ['Shearwater|Peregrine TX|12345']);
  assert.deepEqual(refreshedRow.computerKeys, ['Shearwater|Peregrine TX|FP-A']);
  await assertIntegrity(store, 'computer import');

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
  await assertIntegrity(store, 'attach second computer');

  // still 2 dives total (manual + the one computer dive with two logs)
  assert.equal((await loadIndex(store)).filter((r) => !r.deletedAt).length, 2);

  // soft delete
  const del = await softDeleteDive(d1.id, store);
  assert.ok(del.deletedAt);
  assert.equal(computeDiveLogStats(await loadIndex(store)).totalDives, 1);
  await assertIntegrity(store, 'soft delete');

  // rebuildIndex recomputes rows from Dives + logs
  const rebuilt = await rebuildIndex(store);
  assert.equal(rebuilt.find((r) => r.id === cDive.id).logCount, 2);

  // rebuildIndex scans storage — recovers a dive whose index row is missing
  const orphan = createDive({ id: 'orphan-1', source: 'computer', startTime: '2026-06-09T09:00:00.000Z', durationSeconds: 1500 });
  await store.setItem(`${DIVE_LOG_DIVE_PREFIX}${orphan.id}`, JSON.stringify(orphan));
  assert.equal((await loadIndex(store)).some((r) => r.id === 'orphan-1'), false);
  assert.equal(await diveLog.countStoredDives(store) > (await loadIndex(store)).length, true);
  const recovered = await rebuildIndex(store);
  assert.equal(recovered.some((r) => r.id === 'orphan-1'), true);
  await assertIntegrity(store, 'index rebuild');

  // loadMatchCandidates: only non-deleted dives within the time window
  const cands = await diveLog.loadMatchCandidates('2026-05-01T16:40:00.000Z', {}, store);
  assert.equal(cands.some((c) => c.dive.id === cDive.id), true);
  assert.equal(cands.some((c) => c.dive.id === d1.id), false); // soft-deleted earlier
  const farCands = await diveLog.loadMatchCandidates('2020-01-01T00:00:00.000Z', {}, store);
  assert.equal(farCands.length, 0);

  // device time corrections store
  await diveLog.saveDeviceTimeCorrection({ deviceKey: 'Suunto|EON Core|777', offsetMinutes: -420, appliesFrom: '2026-05-01', appliesTo: '2026-05-01' }, store);
  const corr = await diveLog.loadDeviceTimeCorrections(store);
  assert.equal(corr[0].offsetMinutes, -420);
  assert.ok(corr[0].decidedAt);

  // mergeDives folds one dive's logs into another and soft-deletes the emptied one
  const mA = await createDiveFromLog(computerLogFromDownload({ ...rawComputerDive, fingerprint: 'MG-A', vendor: 'Shearwater', product: 'Perdix', serial: '1' }), store);
  const mB = await createDiveFromLog(computerLogFromDownload({ ...rawComputerDive, fingerprint: 'MG-B', vendor: 'Suunto', product: 'EON Core', serial: '2' }), store);
  const kept = await diveLog.mergeDives(mA.dive.id, [mB.dive.id], {}, store);
  assert.equal(kept.logIds.length, 2);
  assert.equal((await loadDive(mB.dive.id, store)).deletedAt != null, true);
  const keptRow = (await loadIndex(store)).find((r) => r.id === mA.dive.id);
  assert.equal(keptRow.logCount, 2);
  assert.equal(keptRow.deviceKeys.length, 2);
  await assertIntegrity(store, 'merge dives');

  // Split a multi-computer dive back into one Dive per computer and remember
  // the negative match so the reconciler does not immediately join it again.
  const splitStore = memoryStorage({ [DIVE_LOG_INDEX_KEY]: '[]' });
  const splitA = await createDiveFromLog({
    device: { vendor: 'Shearwater', product: 'Perdix', serial: 'split-a' }, fingerprint: 'SPLIT-A',
    reportedStartTime: '2026-06-15T12:00:00.000Z', durationSeconds: 2400,
    water: { maxDepthMeters: 31 }, profile: { samples: trapezoid(31, 2040) },
  }, splitStore);
  const splitB = await createDiveFromLog({
    device: { vendor: 'Suunto', product: 'EON Core', serial: 'split-b' }, fingerprint: 'SPLIT-B',
    reportedStartTime: '2026-06-15T12:00:00.000Z', durationSeconds: 2400,
    water: { maxDepthMeters: 30 }, profile: { samples: trapezoid(30, 2040) },
  }, splitStore);
  await diveLog.mergeDives(splitA.dive.id, [splitB.dive.id], {}, splitStore);
  assert.equal((await loadIndex(splitStore)).filter((row) => !row.deletedAt).length, 1);
  const splitResult = await diveLog.splitDive(splitA.dive.id, {}, splitStore);
  assert.equal(splitResult.length, 2);
  const splitRows = (await loadIndex(splitStore)).filter((row) => !row.deletedAt);
  assert.equal(splitRows.length, 2);
  assert.ok(splitRows.every((row) => row.logCount === 1 && row.deviceKeys.length === 1));
  const splitDepths = splitResult.map((item) => item.water.maxDepthMeters).sort((a, b) => a - b);
  assert.deepEqual(splitDepths, [30, 31]);
  assert.ok((await diveLog.loadNegativeMatches(splitStore)).size > 0);
  const splitRecheck = await diveLog.reconcileLogbook(splitStore);
  assert.equal(splitRecheck.autoMerged, 0);
  assert.equal(splitRecheck.proposals.length, 0);
  assert.equal((await loadIndex(splitStore)).filter((row) => !row.deletedAt).length, 2);
  await assertIntegrity(splitStore, 'split with negative match');

  // --- end to end: Aug 27 split-dive recovery ---
  const rstore = memoryStorage({ [DIVE_LOG_INDEX_KEY]: '[]' });
  // Shearwater: one 60-min dive
  const shDive = await createDiveFromLog({
    device: { vendor: 'Shearwater', product: 'Perdix', serial: 'S1' }, fingerprint: 'SH27',
    reportedStartTime: '2026-08-27T13:00:00.000Z', durationSeconds: 3600,
    water: { maxDepthMeters: 30 }, profile: { samples: longDiveProfile().map((x) => ({ ...x })) },
  }, rstore);
  // Suunto: same dive logged as two fragments
  await createDiveFromLog({
    device: { vendor: 'Suunto', product: 'EON Core', serial: 'S2' }, fingerprint: 'SU27a',
    reportedStartTime: '2026-08-27T13:00:00.000Z', durationSeconds: 1770,
    water: { maxDepthMeters: 30 }, profile: { samples: suFrag1Samples.map((x) => ({ ...x })) },
  }, rstore);
  await createDiveFromLog({
    device: { vendor: 'Suunto', product: 'EON Core', serial: 'S2' }, fingerprint: 'SU27b',
    reportedStartTime: '2026-08-27T13:30:30.000Z', durationSeconds: 1830,
    water: { maxDepthMeters: 30 }, profile: { samples: suFrag2Samples.map((x) => ({ ...x })) },
  }, rstore);
  assert.equal((await loadIndex(rstore)).filter((r) => !r.deletedAt).length, 3); // inflated

  // Run the same pure reconciliation pass used by the React hook.
  const reconcileResult = await diveLog.reconcileLogbook(rstore);
  assert.equal(reconcileResult.autoMerged, 1);
  const finalRows = (await loadIndex(rstore)).filter((r) => !r.deletedAt);
  assert.equal(finalRows.length, 1, `expected 1 dive after recovery, got ${finalRows.length}`);
  assert.equal(finalRows[0].id, shDive.dive.id); // the long Shearwater dive is canonical
  // the two Suunto fragments are fused into ONE continuous log (not stacked)
  assert.equal(finalRows[0].logCount, 2);
  await assertIntegrity(rstore, 'reconcile split dive');

  // computer priority: ranked list + pickPrimaryLog + resurface
  const prStore = memoryStorage({ [DIVE_LOG_INDEX_KEY]: '[]' });
  const prShear = await createDiveFromLog(computerLogFromDownload({ ...rawComputerDive, fingerprint: 'PR-sh', vendor: 'Shearwater', product: 'Perdix', serial: 'X', divetimeSeconds: 3600 }), prStore);
  await diveLog.attachLogToDive(prShear.dive.id, computerLogFromDownload({ ...rawComputerDive, fingerprint: 'PR-su', vendor: 'Suunto', product: 'EON Core', serial: 'Y', divetimeSeconds: 3300 }), {}, prStore);
  let prDive = await loadDive(prShear.dive.id, prStore);
  let prLogs = await loadLogsForDive(prDive, prStore);
  // no priority yet -> longest wins
  assert.equal(diveLog.pickPrimaryLog(prLogs, []).device.vendor, 'Shearwater');
  // rank Suunto primary -> it wins even though it's shorter
  await diveLog.saveComputerPriority(['Suunto|EON Core|Y', 'Shearwater|Perdix|X'], prStore);
  assert.equal(diveLog.pickPrimaryLog(prLogs, await diveLog.loadComputerPriority(prStore)).device.vendor, 'Suunto');
  await diveLog.resurfaceForPriority(prStore);
  prDive = await loadDive(prShear.dive.id, prStore);
  assert.equal((await loadLog(prDive.primaryLogId, prStore)).device.vendor, 'Suunto');
  assert.equal(diveLog.priorityIndex(['a', 'b'], 'b'), 1);
  assert.equal(diveLog.priorityIndex(['a'], 'z'), 999);
  await assertIntegrity(prStore, 'priority resurface');

  // consolidateSameDeviceLogs fuses even when the fragments' serials disagree
  const csStore = memoryStorage({ [DIVE_LOG_INDEX_KEY]: '[]' });
  const csDive = await createDiveFromLog({
    device: { vendor: 'Shearwater', product: 'Perdix', serial: 'A' }, fingerprint: 'CS-sh',
    reportedStartTime: '2026-09-01T13:00:00.000Z', durationSeconds: 3600,
    water: { maxDepthMeters: 30 }, profile: { samples: longDiveProfile().map((x) => ({ ...x })) },
  }, csStore);
  const csF1 = await createDiveFromLog({
    device: { vendor: 'Suunto', product: 'EON Core', serial: '778' }, fingerprint: 'CS-a',
    reportedStartTime: '2026-09-01T13:00:00.000Z', durationSeconds: 1770,
    water: { maxDepthMeters: 30 }, profile: { samples: suFrag1Samples.map((x) => ({ ...x })) },
  }, csStore);
  const csF2 = await createDiveFromLog({
    device: { vendor: 'Suunto', product: 'EON Core', serial: '' }, fingerprint: 'CS-b', // serial dropped
    reportedStartTime: '2026-09-01T13:30:30.000Z', durationSeconds: 1830,
    water: { maxDepthMeters: 30 }, profile: { samples: suFrag2Samples.map((x) => ({ ...x })) },
  }, csStore);
  await diveLog.mergeDives(csDive.dive.id, [csF1.dive.id, csF2.dive.id], {}, csStore);
  const csLogs = await loadLogsForDive(await loadDive(csDive.dive.id, csStore), csStore);
  assert.equal(csLogs.length, 2, `expected shearwater + 1 fused suunto, got ${csLogs.length}`);
  assert.equal(csLogs.find((l) => l.device.vendor === 'Suunto').fusedFrom, 2);
  await assertIntegrity(csStore, 'same-device consolidation');
  const finalDive = await loadDive(shDive.dive.id, rstore);
  const finalLogs = await loadLogsForDive(finalDive, rstore);
  const fusedSu = finalLogs.find((l) => l.device.vendor === 'Suunto');
  assert.equal(fusedSu.fusedFrom, 2);
  assert.deepEqual(fusedSu.mergedFingerprints.sort(), ['SU27a', 'SU27b']);
  // fused Suunto profile spans the whole dive, not just one fragment
  assert.ok(fusedSu.durationSeconds > 3000, `fused duration ${fusedSu.durationSeconds}`);
  // re-downloading either fragment is now recognised as already imported
  assert.equal(finalRows[0].computerKeys.includes('Suunto|EON Core|SU27a'), true);
  assert.equal(finalRows[0].computerKeys.includes('Suunto|EON Core|SU27b'), true);

  // End-to-end two-computer trip: six real dives over three days, computer B
  // one hour fast, with one B dive split into two surface-separated fragments.
  const runTripReconcile = async (importBFirst) => {
    const tripStore = memoryStorage({ [DIVE_LOG_INDEX_KEY]: '[]' });
    const deviceA = { vendor: 'Shearwater', product: 'Perdix 2', serial: 101 };
    const deviceB = { vendor: 'Suunto', product: 'EON Core', serial: 202 };
    const deviceAKey = 'Shearwater|Perdix 2|101';
    const deviceBKey = 'Suunto|EON Core|202';
    const starts = [
      '2026-07-10T10:00:00.000Z', '2026-07-10T14:00:00.000Z',
      '2026-07-11T10:00:00.000Z', '2026-07-11T14:00:00.000Z',
      '2026-07-12T10:00:00.000Z', '2026-07-12T14:00:00.000Z',
    ];
    const durations = [2400, 3000, 3600, 2700, 2100, 3300];
    const depths = [18, 24, 30, 22, 16, 28];
    const raw = (device, iso, duration, depth, fingerprint, samples = prof(duration)) => {
      const date = new Date(iso);
      return computerLogFromDownload({
        ...device,
        fingerprint,
        datetime: {
          year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(),
          hour: date.getUTCHours(), minute: date.getUTCMinutes(), second: date.getUTCSeconds(), timezone: 0,
        },
        divetimeSeconds: duration,
        maxDepthMeters: depth,
        gasmixes: [{ oxygen: 0.21, helium: 0 }],
        samples,
      });
    };
    const logsA = starts.map((start, i) => raw(deviceA, start, durations[i], depths[i], `E2E-A-${i}`));
    const logsB = [];
    starts.forEach((start, i) => {
      const fastStart = new Date(Date.parse(start) + H).toISOString();
      if (i === 2) {
        logsB.push(raw(deviceB, fastStart, 1500, depths[i], 'E2E-B-2a', prof(1500)));
        logsB.push(raw(deviceB, new Date(Date.parse(fastStart) + 1800 * 1000).toISOString(), 1800, depths[i] - 1, 'E2E-B-2b', prof(1800)));
      } else {
        logsB.push(raw(deviceB, fastStart, durations[i], depths[i], `E2E-B-${i}`));
      }
    });

    const batches = importBFirst ? [logsB, logsA] : [logsA, logsB];
    await diveLog.createDivesFromLogs(batches[0], tripStore);
    await diveLog.createDivesFromLogs(batches[1], tripStore);
    assert.equal((await loadIndex(tripStore)).filter((row) => !row.deletedAt).length, 13);

    const pass = await diveLog.reconcileLogbook(tripStore);
    assert.equal(pass.proposals.length, 1, `expected one clock proposal, got ${pass.proposals.length}`);
    const proposal = pass.proposals[0];
    assert.equal(proposal.sharedDiveCount, 6);
    assert.equal(Math.abs(proposal.offsetMinutes), 60);
    const aIsProposalA = proposal.deviceKeyA === deviceAKey;
    const correction = aIsProposalA
      ? { deviceKey: deviceBKey, offsetMinutes: proposal.offsetMinutes }
      : { deviceKey: deviceBKey, offsetMinutes: -proposal.offsetMinutes };
    assert.equal(correction.offsetMinutes, -60);
    await diveLog.saveDeviceTimeCorrection({
      ...correction, appliesFrom: proposal.firstDate, appliesTo: proposal.lastDate,
    }, tripStore);
    for (const merge of proposal.merges) {
      // eslint-disable-next-line no-await-in-loop
      await diveLog.mergeDives(merge.keepId, merge.absorbIds, { correction }, tripStore);
    }

    const liveRows = (await loadIndex(tripStore)).filter((row) => !row.deletedAt);
    assert.equal(liveRows.length, 6);
    assert.ok(liveRows.every((row) => row.deviceKeys.length === 2));
    const liveDives = (await loadAll(tripStore)).filter((dive) => !dive.deletedAt);
    const allLogs = [];
    for (const dive of liveDives) {
      // eslint-disable-next-line no-await-in-loop
      allLogs.push(...await loadLogsForDive(dive, tripStore));
    }
    const bLogs = allLogs.filter((item) => item.deviceKey === deviceBKey);
    assert.equal(bLogs.length, 6);
    assert.ok(bLogs.every((item) => item.timeCorrectionMinutes === -60));
    assert.equal(bLogs.filter((item) => item.fusedFrom === 2).length, 1);
    assert.equal(new Set(allLogs.map((item) => item.id)).size, allLogs.length);
    await assertIntegrity(tripStore, `e2e trip (${importBFirst ? 'B first' : 'A first'})`);

    const secondPass = await diveLog.reconcileLogbook(tripStore);
    assert.equal(secondPass.autoMerged, 0);
    assert.equal(secondPass.proposals.length, 0);
    const afterRerun = [];
    for (const dive of (await loadAll(tripStore)).filter((item) => !item.deletedAt)) {
      // eslint-disable-next-line no-await-in-loop
      afterRerun.push(...await loadLogsForDive(dive, tripStore));
    }
    assert.ok(afterRerun.filter((item) => item.deviceKey === deviceBKey)
      .every((item) => item.timeCorrectionMinutes === -60));
    await assertIntegrity(tripStore, `e2e trip rerun (${importBFirst ? 'B first' : 'A first'})`);
  };
  await runTripReconcile(false);
  await runTripReconcile(true);

  // fingerprint round-trip (unchanged from v1)
  await diveLog.saveFingerprint('EON Core', 'FP-B', store);
  assert.equal(await diveLog.loadFingerprint('EON Core', store), 'FP-B');

  // --- purgeDeleted: hard-remove soft-deleted dives + their logs + fp markers ---
  const pstore = memoryStorage({ [DIVE_LOG_INDEX_KEY]: '[]' });
  const keepDive = await createDiveFromLog(computerLogFromDownload({ ...rawComputerDive, fingerprint: 'PK-1' }), pstore);
  const dropDive = await createDiveFromLog(computerLogFromDownload({ ...rawComputerDive, fingerprint: 'PK-2', vendor: 'Suunto', product: 'D5', serial: 'x' }), pstore);
  await diveLog.saveFingerprint('D5', 'PK-2', pstore);
  await softDeleteDive(dropDive.dive.id, pstore);
  assert.equal((await loadIndex(pstore)).length, 2);
  const purged = await diveLog.purgeDeleted(pstore);
  assert.equal(purged, 1);
  assert.equal((await loadIndex(pstore)).length, 1);
  assert.equal((await loadIndex(pstore))[0].id, keepDive.dive.id);
  assert.equal(pstore._map.has(`${DIVE_LOG_DIVE_PREFIX}${dropDive.dive.id}`), false);
  assert.equal(pstore._map.has(`${DIVE_LOG_LOG_PREFIX}${dropDive.log.id}`), false);
  assert.equal(await diveLog.loadFingerprint('D5', pstore), null); // markers cleared
  assert.equal(await loadLog(keepDive.log.id, pstore) != null, true); // live data untouched
  const purgeSnapshots = await diveLog.listSnapshots(pstore);
  assert.equal(purgeSnapshots.length, 1, 'purge creates a backup first');
  await assertIntegrity(pstore, 'purge deleted');

  // Restore the pre-purge raw records, then verify rolling retention keeps the
  // newest three snapshots only.
  await diveLog.restoreSnapshot(purgeSnapshots[0].id, pstore);
  assert.equal((await loadIndex(pstore)).length, 2);
  await assertIntegrity(pstore, 'snapshot restore');
  await diveLog.snapshotLogbook(pstore);
  await diveLog.snapshotLogbook(pstore);
  await diveLog.snapshotLogbook(pstore);
  assert.equal((await diveLog.listSnapshots(pstore)).length, 3);

  // A merge involving more than two Dives also snapshots before changing data.
  const snapMergeStore = memoryStorage({ [DIVE_LOG_INDEX_KEY]: '[]' });
  const snapMergeDives = [];
  for (const [i, vendor] of ['Shearwater', 'Suunto', 'Garmin'].entries()) {
    // eslint-disable-next-line no-await-in-loop
    snapMergeDives.push(await createDiveFromLog({
      device: { vendor, product: `Model ${i}`, serial: String(i) }, fingerprint: `SNAP-${i}`,
      reportedStartTime: '2026-08-01T12:00:00.000Z', durationSeconds: 2400,
      water: { maxDepthMeters: 25 }, profile: { samples: trapezoid(25, 2040) },
    }, snapMergeStore));
  }
  await diveLog.mergeDives(snapMergeDives[0].dive.id, snapMergeDives.slice(1).map((item) => item.dive.id), {}, snapMergeStore);
  assert.equal((await diveLog.listSnapshots(snapMergeStore)).length, 1);
  assert.equal((await loadIndex(snapMergeStore)).filter((row) => !row.deletedAt).length, 1);
  await assertIntegrity(snapMergeStore, 'three-dive merge snapshot');

  // REGRESSION: purgeDeleted must NOT hard-remove a log that a merge moved onto a
  // live dive. (Symptom: a "Recorded by 2 computers" dive lost one computer's
  // log after the user purged deleted dives.)
  const mpStore = memoryStorage({ [DIVE_LOG_INDEX_KEY]: '[]' });
  const mpShear = await createDiveFromLog(computerLogFromDownload({ ...rawComputerDive, fingerprint: 'MP-sh', vendor: 'Shearwater', product: 'Peregrine', serial: 'A', divetimeSeconds: 3600 }), mpStore);
  const mpSuunto = await createDiveFromLog(computerLogFromDownload({ ...rawComputerDive, fingerprint: 'MP-su', vendor: 'Suunto', product: 'EON Core', serial: 'B', divetimeSeconds: 3300 }), mpStore);
  await diveLog.mergeDives(mpShear.dive.id, [mpSuunto.dive.id], {}, mpStore);
  await diveLog.purgeDeleted(mpStore);
  const mpLogs = await loadLogsForDive(await loadDive(mpShear.dive.id, mpStore), mpStore);
  assert.equal(mpLogs.length, 2, `merged dive should keep both logs after purge, got ${mpLogs.length}`);
  assert.deepEqual(mpLogs.map((l) => l.device.vendor).sort(), ['Shearwater', 'Suunto']);
  assert.equal((await loadIndex(mpStore)).filter((r) => !r.deletedAt).length, 1);
  await assertIntegrity(mpStore, 'merge then purge');

  // Integrity checker reports drift; repair fixes mechanical relationship and
  // projection problems without touching healthy live logs.
  const badStore = memoryStorage({ [DIVE_LOG_INDEX_KEY]: '[]' });
  const badLive = await createDiveFromLog(computerLogFromDownload({ ...rawComputerDive, fingerprint: 'BAD-live' }), badStore);
  const badDead = await createDiveFromLog(computerLogFromDownload({ ...rawComputerDive, fingerprint: 'BAD-dead', vendor: 'Suunto', product: 'D5', serial: 'dead' }), badStore);
  const badLiveRaw = JSON.parse(await badStore.getItem(`${DIVE_LOG_DIVE_PREFIX}${badLive.dive.id}`));
  badLiveRaw.logIds.push('missing-log');
  await badStore.setItem(`${DIVE_LOG_DIVE_PREFIX}${badLive.dive.id}`, JSON.stringify(badLiveRaw));
  const badDeadRaw = JSON.parse(await badStore.getItem(`${DIVE_LOG_DIVE_PREFIX}${badDead.dive.id}`));
  badDeadRaw.deletedAt = '2026-09-03T00:00:00.000Z';
  await badStore.setItem(`${DIVE_LOG_DIVE_PREFIX}${badDead.dive.id}`, JSON.stringify(badDeadRaw));
  const badIndex = await loadIndex(badStore);
  badIndex[0] = { ...badIndex[0], logCount: 99, deviceKeys: ['ghost'], computerKeys: ['ghost'] };
  badIndex.push({ id: 'missing-dive', logCount: 0, deviceKeys: [], computerKeys: [] });
  await badStore.setItem(DIVE_LOG_INDEX_KEY, JSON.stringify(badIndex));
  const unhealthy = await checkLogbookIntegrity(badStore);
  assert.equal(unhealthy.ok, false);
  assert.ok(unhealthy.problems.some((p) => p.code === 'DANGLING_DIVE_LOG'));
  assert.ok(unhealthy.problems.some((p) => p.code === 'DELETED_DIVE_HAS_LOGS'));
  assert.ok(unhealthy.problems.some((p) => p.code === 'INDEX_WITHOUT_DIVE'));
  const repaired = await repairLogbook(badStore);
  assert.equal(repaired.ok, true, JSON.stringify(repaired.problems));
  assert.ok(repaired.actions.some((a) => a.code === 'REBUILT_INDEX'));
  await assertIntegrity(badStore, 'integrity repair');

  await clearAll(store);
  // clearAll leaves an empty v2 index marker so migrateToV2 won't rebuild from v1
  assert.deepEqual(await loadIndex(store), []);
  assert.equal(await isMigratedToV2(store), true);
  assert.equal(store._map.has('@dmz-scuba/dive-log/index-v1'), false);
  await assertIntegrity(store, 'clear all');

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
  await assertIntegrity(mstore, 'v1 migration');

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
  assert.match(screen, /Maximum temperature/);
  assert.match(screen, /Touch and drag across the chart/);
  assert.match(screen, /onResponderMove=\{handleScrub\}/);
  assert.match(screen, /strokeDasharray="4 3"/);
  assert.match(screen, /FullscreenProfile/);
  assert.match(screen, /OrientationLock\.LANDSCAPE/);
  assert.match(screen, /Expand dive profile/);
  assert.match(screen, /temperatureUnit=\{units\.temperatureUnit\}/);
  assert.match(screen, /\bPressable\b/);
  assert.match(screen, /selectMode/);
  assert.match(screen, /deleteDives/);
  assert.match(screen, /importComputerLog/);
  assert.match(screen, /primaryLog/);
  // post-download cross-computer match review
  assert.match(screen, /MatchReview/);
  assert.match(screen, /pendingProposals/);
  assert.match(screen, /resolveProposal/);
  assert.match(screen, /view === 'review'/);
  assert.match(screen, /implausibleClock/); // large clock-offset warning
  assert.match(screen, /newReportedStart/);  // review card shows the dates
  assert.match(screen, /StatsView/);
  assert.match(screen, /view === 'stats'/);

  const hook = read('src', 'features', 'diveLog', 'useDiveLog.js');
  assert.match(hook, /migrateToV2/);
  // batched, deferred import path (no per-dive matching or index race)
  assert.match(hook, /createDivesFromLogs/);
  assert.match(hook, /const importComputerLogs = useCallback/);
  assert.match(hook, /const finishImport = useCallback/);
  assert.match(hook, /countStoredDives/);
  assert.match(hook, /resolveProposal/);
  assert.match(hook, /recheckDuplicates/);
  assert.match(hook, /reconcileLogbook/);
  assert.match(hook, /mergeDives/);
  assert.match(hook, /purgeDeleted/);
  assert.match(hook, /eraseAllDiveData/);
  assert.match(hook, /const dumpDiagnostic = useCallback/);
  assert.match(hook, /checkLogbookIntegrity/);
  assert.match(hook, /repairLogbook/);
  assert.match(hook, /splitDiveRecord/);
  assert.match(hook, /recordNegativeMatchesForDives/);
  assert.match(hook, /listSnapshots/);
  assert.match(hook, /restoreSnapshot/);
  assert.match(screen, /Share\.share/);
  assert.match(screen, /Run health check/);
  assert.match(screen, /Split — not the same dive/);
  assert.match(screen, /Restore a backup/);

  // "All dives" — a unified list of the reconciled dives, alongside the
  // per-computer folders.
  assert.match(hook, /export const ALL_DIVES_KEY/);
  assert.match(hook, /kind: 'all'/);
  assert.match(screen, /ALL_DIVES_KEY/);
  assert.match(screen, /YOUR DIVES/);
  assert.match(screen, /BY COMPUTER/);
  assert.match(screen, /f\.kind === 'all'/);
  assert.match(screen, /ReconcileCard/);
  assert.match(screen, /kind === 'reconcile'/);
  assert.match(hook, /const deleteDives = useCallback/);
  assert.doesNotMatch(hook, /AsyncStorage/);

  // --- camera-roll photo import: batch match, manual assign, unlink ---
  const photoMatching = loadSourceModule(
    path.join(srcRoot, 'lib', 'diveLog', 'photoMatching.js'), srcRoot,
  );

  // buildPhotoImportPlan groups reviewed picker items into per-dive batches and
  // drops anything without a match.
  const planItems = [
    { asset: { uri: 'ph://a', assetId: 'a' }, capturedAt: '2026-09-05T15:20:00.000Z', match: { dive: { id: 'dive-1' }, confidence: 'high' } },
    { asset: { uri: 'ph://b', assetId: 'b' }, capturedAt: '2026-09-05T15:40:00.000Z', match: { dive: { id: 'dive-1' }, confidence: 'medium' } },
    { asset: { uri: 'ph://c', assetId: 'c' }, capturedAt: null, match: { dive: { id: 'dive-2' }, confidence: 'manual' } },
    { asset: { uri: 'ph://d', assetId: 'd' }, capturedAt: null, match: null },
  ];
  const plan = photoMatching.buildPhotoImportPlan(planItems, '2026-09-06T00:00:00.000Z');
  assert.deepEqual(plan.map((g) => g.diveId), ['dive-1', 'dive-2']);
  assert.equal(plan[0].photos.length, 2);
  assert.equal(plan[0].photos[0].id, 'a');
  assert.equal(plan[0].photos[0].linkedAt, '2026-09-06T00:00:00.000Z');
  assert.equal(plan[0].photos[0].source, 'logbook-photo-import');
  assert.equal(plan[1].photos[0].source, 'logbook-photo-import-manual');
  assert.deepEqual(photoMatching.buildPhotoImportPlan(null), []);
  assert.deepEqual(photoMatching.buildPhotoImportPlan([{ asset: null, match: { dive: { id: 'x' } } }]), []);

  // manualDivePhotoMatch wraps a hand-picked dive as a match the plan accepts.
  const manual = photoMatching.manualDivePhotoMatch({ id: 'dive-9', siteName: 'Blue Hole' }, '2026-09-05T15:00:00.000Z');
  assert.equal(manual.confidence, 'manual');
  assert.equal(manual.dive.id, 'dive-9');
  assert.equal(photoMatching.manualDivePhotoMatch(null), null);

  assert.match(screen, /Auto-sort dive photos/);
  assert.match(screen, /Choose and match photos/);
  assert.match(screen, /BatchPhotoReviewModal/);
  assert.match(screen, /PhotoViewerModal/);
  assert.match(screen, /allowsMultipleSelection: true/);
  assert.match(screen, /exif: true/);
  assert.match(screen, /buildPhotoImportPlan/);
  assert.match(screen, /reassignPhotoMatch/);
  assert.match(screen, /handleRemovePhoto/);
  assert.match(screen, /No photos were uploaded/);
  assert.match(hook, /const attachPhotosToDive = useCallback/);
  assert.match(hook, /const removePhotoFromDive = useCallback/);

  // The gap between the picker and the review sheet shows a spinner too.
  assert.match(screen, /photoScanning/);
  assert.match(screen, /Reading photos…/);
  // Linking shows a blocking progress state (not a silent pause then a dialog).
  assert.match(screen, /photoLinkProgress/);
  assert.match(screen, /setPhotoLinkProgress\(\{ total, done \}\)/);
  assert.match(screen, /ActivityIndicator/);
  assert.match(screen, /Keep DMZ Scuba open until this finishes/);
  // Full-screen viewer is a swipeable pager over all the dive's photos, always
  // has a Close button, and shows the same depth/site footer as the gallery.
  assert.match(screen, /pagingEnabled/);
  assert.match(screen, /<PhotoViewerModal\s+photos=\{dive\.photos\}/);
  assert.match(screen, /label="Close" onPress=\{onClose\}/);
  assert.match(screen, /function PhotoMetaBody/);
  assert.match(screen, /renderMeta=\{\(photo\) => \(\s*<PhotoMetaBody/);

  // Share card can use a photo already linked to the dive as its background.
  const shareScreenSrc = read('src', 'features', 'diveShareCard', 'DiveShareCardScreen.js');
  const shareControlsSrc = read('src', 'features', 'diveShareCard', 'ShareCardControls.js');
  assert.match(shareScreenSrc, /linkedPhotos/);
  assert.match(shareScreenSrc, /const pickLinkedPhoto/);
  assert.match(shareControlsSrc, /onPickLinkedPhoto/);
  assert.match(shareControlsSrc, /FROM THIS DIVE/);

  // All-photos gallery: a grid of every linked photo, filtered by the same dive
  // filter, with depth-at-photo-time in the viewer.
  // Batch edit: trip-level fields only, applied to the current selection.
  assert.match(screen, /function BulkEditSheet/);
  assert.match(screen, /const handleBulkEdit = useCallback/);
  assert.match(screen, /patch\.startTime = shiftIso\(dive\.startTime, minutes\)/);
  assert.match(screen, /onEdit=\{\(\) => setBulkEditOpen\(true\)\}/);
  assert.doesNotMatch(screen, /BulkEditRow label="Max depth"/);
  assert.match(hook, /const bulkEditDives = useCallback/);
  // Every useDiveLog value the screen calls must actually be destructured from
  // the hook (a missing name only blows up at runtime, not at bundle time).
  {
    const destructure = (screen.match(/=\s*useDiveLog\(\);/) ? screen.slice(0, screen.indexOf('= useDiveLog();')) : '');
    const block = destructure.slice(destructure.lastIndexOf('{'));
    for (const name of ['bulkEditDives', 'loadGalleryPhotos', 'removePhotoFromDive', 'attachPhotosToDive']) {
      assert.ok(new RegExp(`\\b${name}\\b`).test(block), `DiveLogScreen must destructure ${name} from useDiveLog`);
    }
  }

  assert.match(screen, /view === 'gallery'/);
  assert.match(screen, /function PhotoGalleryView/);
  assert.match(screen, /filterDiveRows\(rows, filter\)/);
  assert.match(screen, /label="Gallery" onPress=\{\(\) => setView\('gallery'\)\}/);
  assert.match(screen, /depthAtPhotoTime/);
  assert.match(screen, /sortGalleryPhotos\(kept, diveById, sortKey\)/);
  assert.match(hook, /const loadGalleryPhotos = useCallback/);

  // The gallery filter genuinely narrows the photo set (matched by diveId).
  const gallerySort = loadSourceModule(path.join(srcRoot, 'lib', 'diveLog', 'galleryPhotos.js'), srcRoot);
  const galRows = [
    { id: 'd1', startTime: '2026-06-01T10:00:00.000Z', maxDepthMeters: 30, waterType: 'salt', types: [], search: 'blue hole' },
    { id: 'd2', startTime: '2026-01-15T10:00:00.000Z', maxDepthMeters: 8, waterType: 'fresh', types: [], search: 'quarry' },
  ];
  const galPhotos = [
    { id: 'p1', diveId: 'd1', capturedAt: '2026-06-01T10:20:00.000Z' },
    { id: 'p2', diveId: 'd1', capturedAt: '2026-06-01T10:40:00.000Z' },
    { id: 'p3', diveId: 'd2', capturedAt: '2026-01-15T10:10:00.000Z' },
  ];
  const galById = new Map(galRows.map((r) => [r.id, r]));
  const deepFilter = diveLog.sanitizeDiveFilter({ depthMeters: { min: 20, max: null } });
  const keptIds = new Set(diveLog.filterDiveRows(galRows, deepFilter).map((r) => r.id));
  const keptPhotos = galPhotos.filter((p) => keptIds.has(p.diveId));
  assert.deepEqual(keptPhotos.map((p) => p.id), ['p1', 'p2'], 'A depth filter drops the shallow dive’s photos.');

  // sortGalleryPhotos orders by capture time and by dive depth.
  assert.deepEqual(gallerySort.sortGalleryPhotos(galPhotos, galById, 'newest').map((p) => p.id), ['p2', 'p1', 'p3']);
  assert.deepEqual(gallerySort.sortGalleryPhotos(galPhotos, galById, 'oldest').map((p) => p.id), ['p3', 'p1', 'p2']);
  assert.equal(gallerySort.sortGalleryPhotos(galPhotos, galById, 'shallowest')[0].id, 'p3');
  assert.equal(gallerySort.sortGalleryPhotos(galPhotos, galById, 'deepest')[0].diveId, 'd1');
  assert.equal(gallerySort.GALLERY_SORTS.length, 4);

  // The selection bar wraps its actions instead of running off the edge, and
  // floats in its own dock above the scroll area.
  assert.match(screen, /selectionActions:.*flexWrap: 'wrap'/);
  assert.match(screen, /styles\.selectionDock/);
  assert.doesNotMatch(screen, /selectMode \? \(\s*<SelectionBar/); // no longer rendered inside the ScrollView

  // depthAtPhotoTime interpolates the profile at the photo's capture offset.
  const dStart = '2026-09-05T15:00:00.000Z';
  const dSamples = [{ t: 0, depth: 0 }, { t: 600, depth: 20 }, { t: 1200, depth: 10 }];
  const at5 = photoMatching.depthAtPhotoTime('2026-09-05T15:05:00.000Z', dStart, dSamples);
  assert.equal(Math.round(at5.depthMeters), 10); // halfway to 20 m at t=300
  assert.equal(at5.offsetSeconds, 300);
  const at15 = photoMatching.depthAtPhotoTime('2026-09-05T15:15:00.000Z', dStart, dSamples);
  assert.equal(Math.round(at15.depthMeters), 15); // t=900, between 20 and 10
  assert.equal(photoMatching.depthAtPhotoTime('2026-09-05T18:00:00.000Z', dStart, dSamples), null); // way past the dive
  assert.equal(photoMatching.depthAtPhotoTime(null, dStart, dSamples), null);
  assert.equal(photoMatching.depthAtPhotoTime('2026-09-05T15:05:00.000Z', dStart, [{ t: 0, depth: 0 }]), null);
  assert.match(screen, /photos: Array\.isArray\(dive\.photos\)/);

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
  // The transfer engine is a module-level singleton so a download survives the
  // download screen (or the whole logbook) unmounting.
  const dlService = read('src', 'features', 'diveComputerDownload', 'downloadService.js');
  assert.match(dlService, /connectToDevice/);
  assert.match(dlService, /primePairing/);
  assert.match(dlService, /export function subscribe/);
  assert.match(dlService, /createDivesFromLogs/);       // engine writes dives itself
  assert.match(dlService, /markPendingReview/);         // flags the logbook to reconcile
  assert.match(dlService, /LOG_LIMIT/);                 // bounded console ring buffer
  assert.match(dlService, /if \(downloadRunning\) return/); // no re-entrant download
  assert.match(dlService, /baselineKnown/);             // incremental-safe only with a live marker
  assert.match(dlService, /function refreshBaseline/);

  const dlPanel = read('src', 'features', 'diveComputerDownload', 'DiveComputerDownloadPanel.js');
  assert.match(dlPanel, /Sync new dives/);              // incremental sync is always an offered button
  assert.match(dlPanel, /Full re-download/);            // full read is always an offered button
  assert.match(dlPanel, /incremental: true/);

  const dlHook = read('src', 'features', 'diveComputerDownload', 'useDiveComputerDownload.js');
  assert.match(dlHook, /downloadService\.subscribe/);   // hook is a thin subscription now
  assert.doesNotMatch(dlHook, /useRef\(new Map/);       // BLE state no longer lives in the hook

  const dlFlag = read('src', 'features', 'diveComputerDownload', 'downloadReviewFlag.js');
  assert.match(dlFlag, /export function hasPendingReview/);
  assert.doesNotMatch(dlFlag, /^import /m);             // must stay dependency-free

  const dlConsole = read('src', 'features', 'diveComputerDownload', 'DownloadConsole.js');
  assert.match(dlConsole, /scrollToEnd/);               // console sticks to the latest line

  // Every download settle (live or background) re-runs reconciliation, edge-triggered.
  assert.match(screen, /handledDownloadRef/);
  assert.match(screen, /await recheckDuplicates\(\)/);
  assert.match(screen, /dlBanner/);                     // "downloading in background" affordance

  const runner = read('src', 'features', 'diveComputerDownload', 'downloadRunner.js');
  assert.match(runner, /monitorCharacteristicForService/);
  assert.match(runner, /export async function primePairing/);

  const native = read('modules', 'dive-computer-bridge', 'ios', 'DiveComputerDownloader.m');
  assert.match(native, /resolve_model/);
  assert.match(native, /@"type": @\(t\.type\)/);
  assert.match(native, /pressuresByTank/); // capture every tank's pressure, not just tank 0

  assert.match(screen, /pressureSeries/);           // per-computer air traces
  assert.match(screen, /Tank pressure/);
  assert.match(screen, /RANK_LABELS/);              // computer priority chip
  assert.match(screen, /onSetRank/);
  assert.match(screen, /onShowLog/);                // tap a computer to switch the shown data
  assert.match(hook, /setComputerRank/);
  assert.match(hook, /loadComputerPriority/);

  // ---------------------------------------------------------------------------
  // Share card: option model
  // ---------------------------------------------------------------------------
  {
    const {
      ASPECT_PRESETS,
      DEFAULT_STAT_KEYS,
      MAX_CARD_STATS,
      MIN_CARD_STATS,
      STAT_FIELDS,
      DEFAULT_WATERMARK,
      MAX_WATERMARK_LENGTH,
      PROFILE_STYLES,
      exportPixelSize,
      getAspectPreset,
      hasStatValue,
      resolveProfileVariant,
      resolveStats,
      sanitizeShareCardOptions,
      toggleStat,
    } = shareCardOptions;

    const aspectKeys = ASPECT_PRESETS.map((preset) => preset.key);
    assert.equal(new Set(aspectKeys).size, aspectKeys.length, 'Aspect preset keys must be unique.');
    for (const preset of ASPECT_PRESETS) {
      assert.ok(preset.ratio > 0, `${preset.key} needs a positive height/width ratio.`);
    }
    assert.equal(getAspectPreset('nope').key, ASPECT_PRESETS[0].key, 'Unknown aspect falls back to the first.');
    assert.deepEqual(exportPixelSize('square'), { width: 1080, height: 1080 });
    assert.equal(exportPixelSize('story').height, 1920, 'A 9:16 story card exports 1080x1920.');

    // Stats render in STAT_FIELDS order, not the order they were selected in,
    // and a stat this dive has no value for is dropped rather than blanked.
    const values = { time: '1h 00m', depth: '36.9 ft', temp: '70°F', gas: null };
    const rows = resolveStats(values, ['temp', 'time', 'gas']);
    assert.deepEqual(rows.map((row) => row.key), ['time', 'temp'], 'Stats keep canonical order and drop empties.');
    assert.equal(rows[0].label, 'Dive time');
    assert.equal(resolveStats(values, ['time', '  ']).length, 1);
    assert.equal(resolveStats({ time: '   ' }, ['time']).length, 0, 'Whitespace is not a value.');

    // format.js hands back an em dash, not null, for a value it doesn't have —
    // that must not reach the card as a stat reading "—".
    assert.equal(resolveStats({ temp: '\u2014' }, ['temp']).length, 0, 'The placeholder dash is not a value.');
    assert.equal(hasStatValue({ temp: '\u2014' }, 'temp'), false);
    assert.equal(hasStatValue({ temp: '70°F' }, 'temp'), true);
    assert.equal(hasStatValue({}, 'temp'), false);
    assert.equal(hasStatValue(null, 'temp'), false, 'A dive with no values at all is handled.');

    // The row has hard limits in both directions, and a rejected toggle must
    // be a no-op the caller can detect by reference.
    const atMax = STAT_FIELDS.slice(0, MAX_CARD_STATS).map((field) => field.key);
    const extra = STAT_FIELDS[MAX_CARD_STATS].key;
    assert.equal(toggleStat(atMax, extra), atMax, 'Adding past the cap returns the same array.');
    const one = [STAT_FIELDS[0].key];
    assert.equal(toggleStat(one, STAT_FIELDS[0].key), one, 'Removing the last stat returns the same array.');
    assert.ok(toggleStat(one, extra).length === MIN_CARD_STATS + 1);
    assert.deepEqual(toggleStat(['temp'], 'time'), ['time', 'temp'], 'Toggling on restores canonical order.');
    assert.deepEqual(toggleStat(['time'], 'not-a-stat'), ['time'], 'An unknown stat key changes nothing.');

    // Anything restored or hand-edited has to come back renderable.
    const clean = sanitizeShareCardOptions({ aspectKey: 'bogus', detailKey: 7, textKey: null, statKeys: [] });
    assert.equal(clean.aspectKey, 'post');
    assert.equal(clean.detailKey, 'summary');
    assert.equal(clean.textKey, 'md');
    assert.deepEqual(clean.statKeys, [...DEFAULT_STAT_KEYS], 'An empty selection falls back to the defaults.');
    assert.equal(clean.showDepthAxis, true, 'The depth axis is on unless explicitly turned off.');
    assert.equal(sanitizeShareCardOptions({ showDepthAxis: false }).showDepthAxis, false);
    assert.equal(sanitizeShareCardOptions().aspectKey, 'post', 'No input at all still sanitizes.');

    // Chart styles: "auto" defers to whatever the theme draws, so switching
    // theme still changes the card's character until the user overrides it.
    const profileKeys = PROFILE_STYLES.map((style) => style.key);
    assert.equal(new Set(profileKeys).size, profileKeys.length, 'Profile style keys must be unique.');
    assert.ok(profileKeys.includes('auto'), 'There must be an auto option.');
    assert.equal(resolveProfileVariant('auto', 'glow'), 'glow', 'Auto uses the theme signature.');
    assert.equal(resolveProfileVariant('bars', 'glow'), 'bars', 'An explicit pick overrides the theme.');
    assert.equal(resolveProfileVariant('nonsense', 'wave'), 'wave', 'An unknown style falls back to auto.');
    assert.equal(sanitizeShareCardOptions({ profileKey: 'steps' }).profileKey, 'steps');
    assert.equal(sanitizeShareCardOptions({ profileKey: 'nope' }).profileKey, 'auto');

    // The signature line is editable, and blank is a deliberate choice that has
    // to survive sanitising rather than snapping back to the default.
    assert.equal(sanitizeShareCardOptions({}).watermark, DEFAULT_WATERMARK);
    assert.equal(sanitizeShareCardOptions({ watermark: '' }).watermark, '', 'Blank means no watermark.');
    assert.equal(sanitizeShareCardOptions({ watermark: 'Reef Rats' }).watermark, 'Reef Rats');
    assert.equal(sanitizeShareCardOptions({ watermark: 42 }).watermark, DEFAULT_WATERMARK, 'A non-string falls back.');
    assert.equal(
      sanitizeShareCardOptions({ watermark: 'x'.repeat(MAX_WATERMARK_LENGTH + 20) }).watermark.length,
      MAX_WATERMARK_LENGTH,
      'An over-long signature is truncated, not rejected.',
    );
    assert.ok(
      sanitizeShareCardOptions({ statKeys: STAT_FIELDS.map((f) => f.key) }).statKeys.length <= MAX_CARD_STATS,
      'Sanitizing clamps an over-full selection.',
    );
  }

  // ---------------------------------------------------------------------------
  // Share card: preview layout regressions
  // ---------------------------------------------------------------------------
  {
    const controls = read('src', 'features', 'diveShareCard', 'ShareCardControls.js');
    const shareScreen = read('src', 'features', 'diveShareCard', 'DiveShareCardScreen.js');
    const profileKeys = shareCardOptions.PROFILE_STYLES.map((style) => style.key);
    const curveSource = read('src', 'features', 'diveShareCard', 'layouts', 'ProfileCurve.js');

    // RN bakes flexGrow: 1 into every ScrollView, so a scroll row sitting above
    // the preview silently eats the card's height. That shipped twice; the
    // stats list is the only ScrollView left on this screen and it must stay
    // pinned. See ShareCardControls styles.statsWrap.
    assert.match(controls, /statsWrap: \{ flexGrow: 0 \}/, 'The stats ScrollView must not grow into the preview.');
    assert.doesNotMatch(shareScreen, /<ScrollView/, 'The share screen itself must not reintroduce a scrolling preview.');

    // The preview card is fitted to the measured box on BOTH axes — width
    // alone let it overflow behind the action bar.
    assert.match(shareScreen, /previewBox\.width, previewBox\.height \/ aspect\.ratio/);
    assert.match(shareScreen, /onLayout=\{onPreviewLayout\}/);
    // onLayout reports the border box, so the preview box uses margin, not
    // padding — padding would be counted as space the card could fill.
    assert.match(shareScreen, /previewWrap: \{[^}]*marginVertical/);
    assert.doesNotMatch(shareScreen, /previewWrap: \{[^}]*padding/);

    // Card preferences survive between dives; the photo deliberately does not.
    const prefsHook = read('src', 'features', 'diveShareCard', 'useShareCardOptions.js');
    assert.match(shareCardOptions.SHARE_CARD_STORAGE_KEY, /^@dmz-scuba\/share-card-v\d+$/, 'The storage key is versioned.');
    assert.match(prefsHook, /SHARE_CARD_STORAGE_KEY/);
    assert.match(prefsHook, /sanitizeShareCardOptions\(parsed\?\.options\)/, 'Restored options are sanitized.');
    assert.doesNotMatch(prefsHook, /photoUri/, 'A picked photo must not be persisted across launches.');
    // Writing before the read completes would overwrite saved settings with
    // the defaults on every launch.
    assert.match(prefsHook, /if \(!loaded\) return;/);
    assert.match(shareScreen, /useShareCardOptions/);
    assert.match(shareScreen, /previewBox && loaded/, 'The card waits for saved settings before first paint.');

    // The signature field sits at the bottom of the sheet, so the keyboard
    // would cover the very text you're typing. The sheet lifts by the overlap
    // instead, and the preview (which fits itself to its box) shrinks to suit.
    const keyboardHook = read('src', 'components', 'useKeyboardOverlap.js');
    assert.match(keyboardHook, /keyboardWillChangeFrame/, 'The sheet tracks the keyboard as it animates.');
    assert.match(keyboardHook, /keyboardWillHide/);
    assert.match(keyboardHook, /windowHeight - endY/, 'Overlap is measured against the window, not the keyboard height.');
    assert.match(keyboardHook, /shown\.remove\(\)/, 'Keyboard listeners are removed on unmount.');
    assert.match(shareScreen, /paddingBottom: keyboardOverlap/);
    // Adding the home-indicator inset on top of the keyboard would leave a gap.
    assert.match(shareScreen, /keyboardOverlap > 0 \? 0 : insets\.bottom/);
    // Without this the first tap on a chip is swallowed dismissing the keyboard.
    assert.equal(
      (controls.match(/keyboardShouldPersistTaps="handled"/g) || []).length,
      2,
      'Both option scroll views keep taps working while the keyboard is up.',
    );

    // Geometry is the expensive part of a render and depends only on the dive
    // and the chart size — it must not be rebuilt on every keystroke.
    assert.match(curveSource, /useMemo\(\s*\(\) => buildLogProfileGeometry/, 'ProfileCurve memoizes its geometry.');
    assert.match(curveSource, /\[samples, width, height, maxDepthMeters\]/);

    // The export is captured from its own fixed-size copy, so the saved file's
    // resolution never depends on what the preview fits on screen.
    assert.match(shareScreen, /exportPixelSize/);
    assert.match(shareScreen, /offscreenExport/);
    assert.match(shareScreen, /ref=\{exportRef\}/);

    // Derived from themes.js, not a hardcoded list, so a theme added later is
    // held to the same contract instead of quietly skipping these checks.
    const themeFile = read('src', 'features', 'diveShareCard', 'themes.js');
    const layoutNames = [...themeFile.matchAll(/Layout: (\w+),/g)].map((match) => match[1]);
    const themeKeys = [...themeFile.matchAll(/\n    key: '([^']+)'/g)].map((match) => match[1]);
    assert.equal(new Set(themeKeys).size, themeKeys.length, 'Theme keys must be unique.');
    assert.equal(layoutNames.length, themeKeys.length, 'Every theme needs its own layout.');
    assert.ok(themeKeys.length >= 8, 'The style picker should offer at least eight looks.');

    for (const layout of layoutNames) {
      const source = read('src', 'features', 'diveShareCard', 'layouts', `${layout}.js`);
      assert.match(source, /stats\.map/, `${layout} renders the configurable stat row.`);
      assert.match(source, /CardBackground/, `${layout} uses the shared photo/gradient background.`);
      assert.match(source, /detail === 'brief'/, `${layout} honours the Summary/Brief setting.`);
      assert.match(source, /DepthAxis/, `${layout} can draw the depth axis.`);
      // No layout may pin its own curve or signature text any more — both are
      // user-settable and arrive as props.
      assert.match(source, /variant=\{profileVariant\}/, `${layout} draws the selected chart style.`);
      assert.doesNotMatch(source, /variant="/, `${layout} must not hardcode a curve variant.`);
      assert.match(source, /\{mark \?/, `${layout} hides the signature when it's blank.`);
      assert.doesNotMatch(source, />DMZ|>dmz|D M Z/, `${layout} must not hardcode the signature text.`);
    }

    // Every theme's signature curve has to be a real variant, and never "auto"
    // (which would resolve to itself forever).
    const variants = [...themeFile.matchAll(/profileVariant: '([^']+)'/g)].map((match) => match[1]);
    assert.equal(variants.length, themeKeys.length, 'Every theme declares a signature curve.');
    for (const variant of variants) {
      assert.ok(profileKeys.includes(variant), `${variant} is a real profile style.`);
      assert.notEqual(variant, 'auto', 'A theme signature cannot itself be "auto".');
    }

    for (const variant of profileKeys.filter((key) => key !== 'auto')) {
      assert.ok(curveSource.includes(`'${variant}'`), `ProfileCurve draws the ${variant} style.`);
    }
  }

  // ---------------------------------------------------------------------------
  // Logbook filtering
  // ---------------------------------------------------------------------------
  {
    const {
      DEFAULT_DIVE_FILTER,
      countActiveFilters,
      filterDiveRows,
      gasKindOf,
      isDiveFilterActive,
      matchesDiveFilter,
      sanitizeDiveFilter,
    } = diveLog;

    const row = (over = {}) => ({
      id: 'd1',
      startTime: '2026-08-27T11:22:00.000Z',
      maxDepthMeters: 30,
      durationSeconds: 3300,
      tempMinC: 21,
      sacBarPerMin: 12,
      rating: 4,
      gasMaxO2: 0.32,
      gasMaxHe: 0,
      types: ['fun', 'wreck'],
      waterType: 'salt',
      diveMode: 'oc',
      source: 'computer',
      logCount: 1,
      search: 'blue corner palau jane wreck turtles',
      ...over,
    });
    const base = sanitizeDiveFilter(DEFAULT_DIVE_FILTER);
    const withFilter = (patch) => sanitizeDiveFilter({ ...base, ...patch });

    assert.equal(isDiveFilterActive(base), false, 'The default filter is inactive.');
    assert.equal(matchesDiveFilter(row(), base), true, 'An inactive filter matches everything.');
    assert.equal(filterDiveRows([row(), row({ id: 'd2' })], base).length, 2);

    // Text: every term must hit, so typing more words narrows.
    assert.equal(matchesDiveFilter(row(), withFilter({ text: 'palau' })), true);
    assert.equal(matchesDiveFilter(row(), withFilter({ text: 'PALAU TURTLES' })), true, 'Search is case-insensitive.');
    assert.equal(matchesDiveFilter(row(), withFilter({ text: 'palau shark' })), false, 'All terms must match.');
    assert.equal(matchesDiveFilter(row({ search: '' }), withFilter({ text: 'palau' })), false);

    // Ranges are inclusive at both ends.
    assert.equal(matchesDiveFilter(row(), withFilter({ depthMeters: { min: 30, max: 30 } })), true);
    assert.equal(matchesDiveFilter(row(), withFilter({ depthMeters: { min: 31, max: null } })), false);
    assert.equal(matchesDiveFilter(row(), withFilter({ depthMeters: { min: null, max: 29 } })), false);
    assert.equal(matchesDiveFilter(row(), withFilter({ tempC: { min: 20, max: 22 } })), true);
    assert.equal(matchesDiveFilter(row(), withFilter({ sacBarPerMin: { min: null, max: 15 } })), true);

    // A dive that never recorded the number can't satisfy a bound on it —
    // "SAC under 15" must not answer with dives whose SAC is unknown.
    assert.equal(matchesDiveFilter(row({ sacBarPerMin: null }), withFilter({ sacBarPerMin: { min: null, max: 15 } })), false);
    assert.equal(matchesDiveFilter(row({ tempMinC: null }), withFilter({ tempC: { min: 0, max: 40 } })), false);
    // ...but it still shows up when that criterion isn't set.
    assert.equal(matchesDiveFilter(row({ sacBarPerMin: null }), base), true);

    // A backwards range is a typo, not a request to match nothing.
    assert.deepEqual(sanitizeDiveFilter({ depthMeters: { min: 40, max: 10 } }).depthMeters, { min: 10, max: 40 });
    assert.deepEqual(
      [sanitizeDiveFilter({ dateFrom: '2026-09-01', dateTo: '2026-01-01' }).dateFrom,
        sanitizeDiveFilter({ dateFrom: '2026-09-01', dateTo: '2026-01-01' }).dateTo],
      ['2026-01-01', '2026-09-01'],
    );

    // Dates are inclusive of the whole end day, not midnight at the start.
    assert.equal(matchesDiveFilter(row(), withFilter({ dateTo: '2026-08-27' })), true, 'The end day is included.');
    assert.equal(matchesDiveFilter(row(), withFilter({ dateFrom: '2026-08-27' })), true);
    assert.equal(matchesDiveFilter(row(), withFilter({ dateFrom: '2026-08-28' })), false);
    assert.equal(matchesDiveFilter(row({ startTime: 'not-a-date' }), withFilter({ dateFrom: '2020-01-01' })), false);

    // Oxygen is stored as a percentage but the row carries a fraction.
    assert.equal(matchesDiveFilter(row(), withFilter({ o2Percent: { min: 30, max: 36 } })), true);
    assert.equal(matchesDiveFilter(row(), withFilter({ o2Percent: { min: 36, max: null } })), false);
    assert.equal(matchesDiveFilter(row({ gasMaxO2: null }), withFilter({ o2Percent: { min: 21, max: 100 } })), false);

    // Gas classification, including the air/nitrox boundary.
    assert.equal(gasKindOf({ gasMaxO2: 0.21, gasMaxHe: 0 }), 'air');
    assert.equal(gasKindOf({ gasMaxO2: 0.209, gasMaxHe: 0 }), 'air', 'Nominal air is not nitrox.');
    assert.equal(gasKindOf({ gasMaxO2: 0.32, gasMaxHe: 0 }), 'nitrox');
    assert.equal(gasKindOf({ gasMaxO2: 0.18, gasMaxHe: 0.45 }), 'trimix', 'Helium wins over a low O2 fraction.');
    assert.equal(gasKindOf({}), null, 'A row with no gas fields is unclassified.');
    assert.equal(matchesDiveFilter(row(), withFilter({ gasKinds: ['nitrox'] })), true);
    assert.equal(matchesDiveFilter(row(), withFilter({ gasKinds: ['air', 'trimix'] })), false);
    assert.equal(matchesDiveFilter(row({ gasMaxO2: null, gasMaxHe: null }), withFilter({ gasKinds: ['air'] })), false);

    // Multi-select lists are OR within a category, AND across categories.
    assert.equal(matchesDiveFilter(row(), withFilter({ types: ['wreck'] })), true);
    assert.equal(matchesDiveFilter(row(), withFilter({ types: ['cave'] })), false);
    assert.equal(matchesDiveFilter(row(), withFilter({ types: ['cave', 'fun'] })), true, 'Any selected type matches.');
    assert.equal(matchesDiveFilter(row(), withFilter({ types: ['wreck'], waterTypes: ['fresh'] })), false);
    assert.equal(matchesDiveFilter(row(), withFilter({ modes: ['oc'] })), true);
    assert.equal(matchesDiveFilter(row(), withFilter({ sources: ['manual'] })), false);
    assert.equal(matchesDiveFilter(row({ types: [] }), withFilter({ types: ['fun'] })), false);

    assert.equal(matchesDiveFilter(row(), withFilter({ hasComputer: true })), true);
    assert.equal(matchesDiveFilter(row(), withFilter({ hasComputer: false })), false);
    assert.equal(matchesDiveFilter(row({ logCount: 0 }), withFilter({ hasComputer: false })), true);

    // Garbage in still yields something every consumer can apply.
    const dirty = sanitizeDiveFilter({ text: 7, types: ['fun', 'not-a-type'], modes: 'oc', hasComputer: 'yes' });
    assert.equal(dirty.text, '');
    assert.deepEqual(dirty.types, ['fun'], 'Unknown enum values are dropped.');
    assert.deepEqual(dirty.modes, []);
    assert.equal(dirty.hasComputer, null, 'Only a real boolean counts.');
    assert.equal(sanitizeDiveFilter().text, '', 'No input at all still sanitizes.');
    assert.equal(sanitizeDiveFilter({ dateFrom: '27/08/2026' }).dateFrom, null, 'A non-ISO date is rejected.');

    // The badge counts criteria, not values.
    assert.equal(countActiveFilters(base), 0);
    assert.equal(countActiveFilters(withFilter({ text: 'palau' })), 1);
    assert.equal(countActiveFilters(withFilter({ depthMeters: { min: 10, max: 40 } })), 1, 'A range is one criterion.');
    assert.equal(countActiveFilters(withFilter({ dateFrom: '2026-01-01', dateTo: '2026-02-01' })), 1);
    assert.equal(countActiveFilters(withFilter({ types: ['fun', 'wreck'] })), 1, 'A multi-select is one criterion.');
    assert.equal(countActiveFilters(withFilter({ text: 'x', modes: ['oc'], hasComputer: true })), 3);
  }

  // ---------------------------------------------------------------------------
  // Logbook filtering: the index has to carry what the filters read
  // ---------------------------------------------------------------------------
  {
    const dive = createDive({
      startTime: '2026-08-27T11:22:00.000Z',
      site: { name: 'Blue Corner', location: 'Palau' },
      buddies: ['Jane'],
      tags: ['turtles'],
      notes: 'Strong current on the wall.',
      water: { maxDepthMeters: 30, tempMinC: 21, type: 'salt' },
      gas: { mixes: [{ o2: 0.21, he: 0 }, { o2: 0.36, he: 0 }] },
      diveMode: 'oc',
      types: ['fun', 'wreck'],
    });
    const indexed = diveLog.indexRowFromDive(dive, []);
    for (const field of ['tempMinC', 'waterType', 'diveMode', 'types', 'gasMaxO2', 'gasMaxHe', 'search']) {
      assert.ok(field in indexed, `The index row must carry ${field} for filtering.`);
    }
    assert.equal(indexed.tempMinC, 21);
    assert.equal(indexed.waterType, 'salt');
    assert.equal(indexed.gasMaxO2, 0.36, 'The richest mix classifies the dive, not the first.');
    assert.deepEqual(indexed.types, ['fun', 'wreck']);
    // The haystack is lowercased once at write time so matching stays cheap.
    assert.equal(indexed.search, indexed.search.toLowerCase());
    for (const term of ['blue corner', 'palau', 'jane', 'turtles', 'current']) {
      assert.ok(indexed.search.includes(term), `Search text should cover "${term}".`);
    }
    assert.ok(indexed.search.length <= 400, 'Search text is capped so the index stays small.');
    assert.equal(diveLog.matchesDiveFilter(indexed, diveLog.sanitizeDiveFilter({ text: 'jane turtles' })), true);

    // Rows written before the current shape have to trigger a rebuild, or a
    // filter quietly matches nothing against stale rows.
    assert.equal(indexed.v, diveLog.INDEX_ROW_VERSION, 'Every row is stamped with the shape it was written at.');
    const logHook = read('src', 'features', 'diveLog', 'useDiveLog.js');
    assert.match(logHook, /r\.v !== INDEX_ROW_VERSION/, 'A stale-shaped index row must trigger a rebuild.');

    // Without a transmitter there is no log analytics, but hand-entered
    // pressures still yield a SAC — and the index must agree with what the
    // detail screen shows, or "SAC under 15" misses dives displaying SAC 12.
    const handLogged = createDive({
      startTime: '2026-08-27T11:22:00.000Z',
      durationSeconds: 3600,
      water: { maxDepthMeters: 20, avgDepthMeters: 12 },
      gas: { tanks: [{ volumeLiters: 11, startBar: 200, endBar: 60 }] },
    });
    const handRow = diveLog.indexRowFromDive(handLogged, []);
    assert.ok(handRow.sacBarPerMin > 0, 'A hand-logged dive still gets a SAC on its index row.');
    assert.ok(handRow.rmvLitersPerMin > 0, 'and an RMV when the cylinder size is known.');
    const expected = diveLog.surfaceConsumption({
      startBar: 200, endBar: 60, durationSeconds: 3600, avgDepthMeters: 12, tankVolumeLiters: 11,
    });
    assert.equal(handRow.sacBarPerMin, expected.sacBarPerMin, 'Derived the same way the detail screen derives it.');
    // SAC needs an average depth; without one it stays null rather than wrong.
    const noAvg = createDive({
      durationSeconds: 3600,
      gas: { tanks: [{ volumeLiters: 11, startBar: 200, endBar: 60 }] },
    });
    assert.equal(diveLog.indexRowFromDive(noAvg, []).sacBarPerMin, null, 'No average depth means no invented SAC.');
  }

  // ---------------------------------------------------------------------------
  // Every named import from the domain layer must actually be exported
  //
  // Bundling does not catch this: a missing named export is `undefined` at
  // runtime, so the failure surfaces as "undefined is not a function" the
  // first time the screen renders. That shipped once — a filter helper added
  // to the wrong import block, next to the formatters it sits beside in the
  // source but does not live with on disk.
  // ---------------------------------------------------------------------------
  {
    const libDir = path.join(srcRoot, 'lib', 'diveLog');
    const exportsByModule = new Map();
    for (const file of fs.readdirSync(libDir).filter((name) => name.endsWith('.js'))) {
      const source = fs.readFileSync(path.join(libDir, file), 'utf8');
      const names = new Set();
      for (const match of source.matchAll(/export\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)/g)) {
        names.add(match[1]);
      }
      for (const match of source.matchAll(/export\s*\{([^}]+)\}/g)) {
        for (const part of match[1].split(',')) {
          const name = part.trim().split(/\s+as\s+/).pop().trim();
          if (name) names.add(name);
        }
      }
      exportsByModule.set(file.replace(/\.js$/, ''), names);
    }
    // index.js is a barrel of `export * from`, so it offers everything the
    // modules it re-exports do.
    const barrel = new Set();
    const indexSource = fs.readFileSync(path.join(libDir, 'index.js'), 'utf8');
    for (const match of indexSource.matchAll(/export \* from '\.\/(\w+)'/g)) {
      for (const name of exportsByModule.get(match[1]) || []) barrel.add(name);
    }
    exportsByModule.set('index', barrel);
    assert.ok(barrel.size > 40, 'The barrel should re-export the domain surface.');

    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return entry.isFile() && entry.name.endsWith('.js') ? [full] : [];
    });

    let checked = 0;
    for (const file of walk(srcRoot)) {
      if (file.startsWith(`${libDir}${path.sep}`)) continue;
      const source = fs.readFileSync(file, 'utf8');
      for (const match of source.matchAll(/import\s*\{([^}]+)\}\s*from\s*'([^']+)'/g)) {
        const target = path.resolve(path.dirname(file), match[2]);
        const relative = path.relative(libDir, target);
        if (relative.startsWith('..') || path.isAbsolute(relative)) continue;
        const moduleName = relative === '' ? 'index' : relative;
        const available = exportsByModule.get(moduleName);
        if (!available) continue;
        for (const part of match[1].split(',')) {
          const name = part.trim().split(/\s+as\s+/)[0].trim();
          if (!name) continue;
          checked += 1;
          assert.ok(
            available.has(name),
            `${path.relative(projectRoot, file)} imports { ${name} } from '${match[2]}', which does not export it.`,
          );
        }
      }
    }
    assert.ok(checked > 30, `Expected to check a real number of domain imports, checked ${checked}.`);
  }

  // ---------------------------------------------------------------------------
  // Logbook sorting
  // ---------------------------------------------------------------------------
  {
    const {
      DEFAULT_DIVE_SORT,
      DIVE_SORT_FIELDS,
      describeDiveSort,
      getDiveSortField,
      sanitizeDiveSort,
      sortDiveRows,
    } = diveLog;

    const keys = DIVE_SORT_FIELDS.map((field) => field.key);
    assert.equal(new Set(keys).size, keys.length, 'Sort field keys must be unique.');
    for (const field of DIVE_SORT_FIELDS) {
      assert.ok(['asc', 'desc'].includes(field.defaultDirection), `${field.key} needs a real default direction.`);
      assert.ok(field.ascLabel && field.descLabel, `${field.key} needs both direction labels.`);
    }

    assert.deepEqual(sanitizeDiveSort(DEFAULT_DIVE_SORT), { key: 'date', direction: 'desc' });
    // Picking a field without saying which way means that field's natural end.
    assert.equal(sanitizeDiveSort({ key: 'sac' }).direction, 'asc', 'Best SAC first is what "SAC rate" means.');
    assert.equal(sanitizeDiveSort({ key: 'depth' }).direction, 'desc');
    assert.equal(sanitizeDiveSort({ key: 'nope' }).key, 'date', 'An unknown field falls back.');
    assert.equal(sanitizeDiveSort({ key: 'depth', direction: 'sideways' }).direction, 'desc');
    assert.equal(sanitizeDiveSort().key, 'date', 'No input at all still sanitizes.');
    assert.equal(getDiveSortField('site').key, 'site');
    assert.match(describeDiveSort({ key: 'sac', direction: 'asc' }), /SAC rate/);

    const row = (id, over = {}) => ({
      id,
      startTime: `2026-08-${String(over.day || 1).padStart(2, '0')}T10:00:00.000Z`,
      maxDepthMeters: 20,
      durationSeconds: 3000,
      tempMinC: 20,
      sacBarPerMin: 14,
      rating: 3,
      siteName: 'Site',
      number: 1,
      ...over,
    });
    const ids = (rows) => rows.map((entry) => entry.id);

    const byDepth = [row('a', { maxDepthMeters: 12 }), row('b', { maxDepthMeters: 41 }), row('c', { maxDepthMeters: 28 })];
    assert.deepEqual(ids(sortDiveRows(byDepth, { key: 'depth', direction: 'desc' })), ['b', 'c', 'a']);
    assert.deepEqual(ids(sortDiveRows(byDepth, { key: 'depth', direction: 'asc' })), ['a', 'c', 'b']);
    // The input array must not be reordered in place — it is React state.
    assert.deepEqual(ids(byDepth), ['a', 'b', 'c'], 'Sorting returns a new array.');

    // A dive that never recorded the value sinks in BOTH directions. Treating
    // a missing SAC as 0 would park every hand-logged dive at the top of
    // "best SAC first", which is worse than not offering the sort.
    const withGaps = [row('a', { sacBarPerMin: 18 }), row('b', { sacBarPerMin: null }), row('c', { sacBarPerMin: 11 })];
    assert.deepEqual(ids(sortDiveRows(withGaps, { key: 'sac', direction: 'asc' })), ['c', 'a', 'b']);
    assert.deepEqual(ids(sortDiveRows(withGaps, { key: 'sac', direction: 'desc' })), ['a', 'c', 'b']);
    const noTemp = [row('a', { tempMinC: null }), row('b', { tempMinC: 8 })];
    assert.deepEqual(ids(sortDiveRows(noTemp, { key: 'temp', direction: 'asc' })), ['b', 'a']);

    // Text sorts case-insensitively.
    const bySite = [row('a', { siteName: 'zebra reef' }), row('b', { siteName: 'Anemone City' })];
    assert.deepEqual(ids(sortDiveRows(bySite, { key: 'site', direction: 'asc' })), ['b', 'a']);
    const blankSite = [row('a', { siteName: '' }), row('b', { siteName: 'Wall' })];
    assert.deepEqual(ids(sortDiveRows(blankSite, { key: 'site', direction: 'asc' })), ['b', 'a'], 'Unnamed sites sink.');

    // Ties resolve to a fixed order, so equal rows never shuffle between
    // renders. Same depth, different days: newest first, then id.
    const ties = [row('a', { day: 3 }), row('b', { day: 9 }), row('c', { day: 3 })];
    assert.deepEqual(ids(sortDiveRows(ties, { key: 'depth', direction: 'desc' })), ['b', 'a', 'c']);
    assert.deepEqual(
      ids(sortDiveRows(ties, { key: 'depth', direction: 'desc' })),
      ids(sortDiveRows([...ties].reverse(), { key: 'depth', direction: 'desc' })),
      'The order does not depend on the input order.',
    );

    assert.deepEqual(sortDiveRows(null, DEFAULT_DIVE_SORT), []);
    assert.deepEqual(ids(sortDiveRows([row('a')], { key: 'bogus' })), ['a'], 'A bad sort still returns the rows.');

    // Sort is a durable preference; filters are transient.
    const sortHook = read('src', 'features', 'diveLog', 'useDiveListSort.js');
    assert.match(sortHook, /DIVE_SORT_STORAGE_KEY/);
    assert.match(sortHook, /if \(!loaded\) return;/, 'Never write the default over a saved preference.');
    assert.match(sortHook, /sanitizeDiveSort\(JSON\.parse\(stored\)\)/);
  }

  // ---------------------------------------------------------------------------
  // Consumption across multiple cylinders
  // ---------------------------------------------------------------------------
  {
    const { combinedConsumption } = diveLog;
    const context = { durationSeconds: 3600, avgDepthMeters: 12 };

    assert.deepEqual(combinedConsumption([], context).perTank, [], 'No cylinders, nothing to report.');
    assert.equal(combinedConsumption(null, context).rmvLitersPerMin, null);
    assert.equal(
      combinedConsumption([{ volumeLiters: 12 }], context).usedBar,
      null,
      'A cylinder with no pressures contributes nothing.',
    );

    // Matched twinset: bar/min is comparable, so a combined SAC is real.
    const twins = combinedConsumption(
      [{ volumeLiters: 12, startBar: 200, endBar: 80 }, { volumeLiters: 12, startBar: 200, endBar: 90 }],
      context,
    );
    assert.equal(twins.usedBar, 230, 'Used bar sums across matching cylinders.');
    assert.equal(twins.usedLiters, 2760);
    assert.ok(twins.sacBarPerMin > 0, 'Matching sizes give a combined SAC.');
    assert.ok(twins.rmvLitersPerMin > 0);
    assert.equal(twins.perTank.length, 2);

    // Mixed sizes: RMV still adds up (it is litres of gas), SAC does not —
    // 10 bar/min from a 7 L pony is not 10 bar/min from a 15 L twin.
    const mixed = combinedConsumption(
      [{ volumeLiters: 12, startBar: 200, endBar: 80 }, { volumeLiters: 7, startBar: 200, endBar: 150 }],
      context,
    );
    assert.equal(mixed.sacBarPerMin, null, 'A summed SAC across different cylinder sizes would be a lie.');
    assert.ok(mixed.rmvLitersPerMin > 0, 'RMV is the number that survives mixed sizes.');
    assert.equal(mixed.usedLiters, 12 * 120 + 7 * 50);

    // An unsized cylinder would silently undercount the totals.
    const partial = combinedConsumption(
      [{ volumeLiters: 12, startBar: 200, endBar: 80 }, { startBar: 200, endBar: 150 }],
      context,
    );
    assert.equal(partial.usedLiters, null, 'Totals are withheld rather than undercounted.');
    assert.equal(partial.rmvLitersPerMin, null);
    assert.equal(partial.usedBar, 170, 'Bar still sums — it needs no volume.');

    // SAC needs an average depth; without one nothing is invented.
    const noDepth = combinedConsumption([{ volumeLiters: 12, startBar: 200, endBar: 80 }], { durationSeconds: 3600 });
    assert.equal(noDepth.sacBarPerMin, null);
    assert.equal(noDepth.usedBar, 120, 'Gas used needs no depth.');

    // A refilled/miskeyed cylinder (end above start) is not negative gas.
    assert.equal(combinedConsumption([{ volumeLiters: 12, startBar: 80, endBar: 200 }], context).usedBar, null);

    // The index derives from every cylinder, not just the first.
    const sidemount = createDive({
      durationSeconds: 3600,
      water: { maxDepthMeters: 30, avgDepthMeters: 12 },
      gas: {
        mixes: [{ o2: 0.32, he: 0 }, { o2: 0.5, he: 0 }],
        tanks: [
          { volumeLiters: 12, startBar: 200, endBar: 80, mixIndex: 0 },
          { volumeLiters: 12, startBar: 200, endBar: 90, mixIndex: 1 },
        ],
      },
    });
    const row = diveLog.indexRowFromDive(sidemount, []);
    assert.equal(row.sacBarPerMin, twins.sacBarPerMin, 'The index agrees with the detail screen.');
    assert.equal(row.gasMaxO2, 0.5, 'The richest mix still classifies the dive.');
    assert.ok(row.rmvLitersPerMin > 0);
  }

  // ---------------------------------------------------------------------------
  // A computer log must not hide hand-entered cylinder pressures
  // ---------------------------------------------------------------------------
  {
    const { mergeGas } = diveLog;

    // A computer without a transmitter reports a mix but no pressures. Taking
    // its gas wholesale threw away everything the diver typed in, so nothing
    // showed on the detail screen for any downloaded dive.
    const logGas = { mixes: [{ o2: 0.32, he: 0 }], tanks: [{ volumeLiters: null, startBar: null, endBar: null, mixIndex: 0 }] };
    const diveGas = { mixes: [{ o2: 0.32, he: 0 }], tanks: [{ volumeLiters: 12, startBar: 200, endBar: 70, mixIndex: 0 }] };
    const merged = mergeGas(logGas, diveGas);
    assert.equal(merged.tanks[0].startBar, 200, 'A log null must not erase a hand-entered start pressure.');
    assert.equal(merged.tanks[0].endBar, 70);
    assert.equal(merged.tanks[0].volumeLiters, 12);

    // Where the log did record something, the log wins — it measured it.
    const withTransmitter = mergeGas(
      { tanks: [{ startBar: 210, endBar: 65, volumeLiters: 12 }] },
      { tanks: [{ startBar: 200, endBar: 70, volumeLiters: 15 }] },
    );
    assert.equal(withTransmitter.tanks[0].startBar, 210, 'A recorded pressure beats a typed one.');
    assert.equal(withTransmitter.tanks[0].volumeLiters, 12);

    // Either side may carry more cylinders than the other.
    assert.equal(mergeGas({ tanks: [] }, diveGas).tanks.length, 1);
    assert.equal(mergeGas(logGas, { tanks: [{}, { startBar: 190, endBar: 60 }] }).tanks.length, 2);
    assert.equal(mergeGas(null, null).tanks.length, 0, 'Nothing at all is handled.');
    assert.deepEqual(mergeGas(undefined, diveGas).tanks[0].startBar, 200);
    assert.deepEqual(mergeGas({ mixes: [] }, diveGas).mixes, diveGas.mixes, 'An empty mix list falls back.');

    // End to end: the download plus the typed cylinder must produce a SAC on
    // the index row, or the dive is invisible to the SAC filter and sort even
    // though the number is on screen.
    const log = createComputerLog({
      durationSeconds: 3600,
      water: { maxDepthMeters: 30, avgDepthMeters: 12 },
      gas: logGas,
    });
    const dive = createDive({
      startTime: '2026-08-27T11:22:00.000Z',
      durationSeconds: 3600,
      water: { maxDepthMeters: 30, avgDepthMeters: 12 },
      gas: diveGas,
      logIds: [log.id],
      primaryLogId: log.id,
    });
    const row = diveLog.indexRowFromDive(dive, [log]);
    assert.ok(row.sacBarPerMin > 0, 'A downloaded dive with typed pressures still gets a SAC.');
    assert.ok(row.rmvLitersPerMin > 0);
    assert.equal(row.gasMaxO2, 0.32, 'The mix comes through the merge.');
    // A log existing is not the same as a log having a transmitter: derivation
    // must key off whether it produced a SAC, not off whether it exists.
    assert.match(
      read('src', 'lib', 'diveLog', 'storage.js'),
      /a\?\.sacBarPerMin != null \? null :/,
      'Derive whenever the log did not produce a SAC.',
    );
  }

  // ---------------------------------------------------------------------------
  // Transmitter pressures recovered from the profile curve
  // ---------------------------------------------------------------------------
  {
    const { tankPressuresFromSamples } = diveLog;

    // The shape that broke it: a real transmitter curve, but the computer sent
    // begin/end pressure as 0, which mapTanks turns into null. Every gas row
    // then rendered empty on a dive that plainly had pressure data.
    const curve = [{ t: 0, pressureBar: 210 }, { t: 600, pressureBar: 150 }, { t: 1750, pressureBar: 70 }];
    assert.deepEqual(tankPressuresFromSamples(curve), { startBar: 210, endBar: 70 });
    // Samples are not guaranteed sorted.
    assert.deepEqual(
      tankPressuresFromSamples([{ t: 1750, pressureBar: 70 }, { t: 0, pressureBar: 210 }]),
      { startBar: 210, endBar: 70 },
    );
    // Zero and missing readings are not pressures.
    assert.deepEqual(tankPressuresFromSamples([{ t: 0 }, { t: 5 }]), { startBar: null, endBar: null });
    assert.deepEqual(
      tankPressuresFromSamples([{ t: 0, pressureBar: 0 }, { t: 5, pressureBar: 0 }]),
      { startBar: null, endBar: null },
    );
    assert.deepEqual(tankPressuresFromSamples(null), { startBar: null, endBar: null });
    // One reading is not a range — reporting start == end would claim zero gas used.
    assert.deepEqual(tankPressuresFromSamples([{ t: 0, pressureBar: 200 }]), { startBar: null, endBar: null });

    // Multi-transmitter profiles address cylinders by index.
    const byTank = [
      { t: 0, pressuresByTank: { 0: 200, 1: 190 } },
      { t: 900, pressuresByTank: { 0: 90, 1: 120 } },
    ];
    assert.deepEqual(tankPressuresFromSamples(byTank, 0), { startBar: 200, endBar: 90 });
    assert.deepEqual(tankPressuresFromSamples(byTank, 1), { startBar: 190, endBar: 120 });
    // The flat pressureBar field only describes the first cylinder.
    assert.deepEqual(tankPressuresFromSamples(curve, 1), { startBar: null, endBar: null });

    // End to end on the real shape: volume known, begin/end null, curve present.
    const log = createComputerLog({
      durationSeconds: 1750,
      water: { maxDepthMeters: 30, avgDepthMeters: 22 },
      gas: { mixes: [{ o2: 0.21, he: 0 }], tanks: [{ volumeLiters: 11.8, startBar: null, endBar: null, mixIndex: 0 }] },
      profile: { samples: curve },
    });
    const dive = createDive({
      startTime: '2026-09-05T10:00:00.000Z',
      durationSeconds: 1750,
      water: { maxDepthMeters: 30, avgDepthMeters: 22 },
      logIds: [log.id],
      primaryLogId: log.id,
    });
    const row = diveLog.indexRowFromDive(dive, [log]);
    assert.ok(row.sacBarPerMin > 0, 'A transmitter dive gets a SAC even with null begin/end pressure.');
    assert.ok(row.rmvLitersPerMin > 0);
  }

  console.log('Dive logbook checks passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
