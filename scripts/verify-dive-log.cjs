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

  // rebuildIndex scans storage — recovers a dive whose index row is missing
  const orphan = createDive({ id: 'orphan-1', source: 'computer', startTime: '2026-06-09T09:00:00.000Z', durationSeconds: 1500 });
  await store.setItem(`${DIVE_LOG_DIVE_PREFIX}${orphan.id}`, JSON.stringify(orphan));
  assert.equal((await loadIndex(store)).some((r) => r.id === 'orphan-1'), false);
  assert.equal(await diveLog.countStoredDives(store) > (await loadIndex(store)).length, true);
  const recovered = await rebuildIndex(store);
  assert.equal(recovered.some((r) => r.id === 'orphan-1'), true);

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

  // recheck logic (mirrors useDiveLog.recheckDuplicates)
  const rdives = await loadAll(rstore);
  const rbundles = [];
  for (const d of rdives) rbundles.push({ dive: d, logs: await loadLogsForDive(d, rstore) });
  const folded = new Set();
  for (const b of rbundles) {
    if (folded.has(b.dive.id)) continue;
    const primary = b.logs[0];
    const others = rbundles.filter((x) => x.dive.id !== b.dive.id && !folded.has(x.dive.id));
    const { bestMatch: mm } = findMatch(primary, others);
    if (!mm || mm.verdict === 'none') continue;
    const isSpanning = mm.kind === 'spanning-merge';
    const keepId = isSpanning ? b.dive.id : (mm.diveIds || [mm.diveId])[0];
    const foldIds = isSpanning ? mm.diveIds : [b.dive.id];
    // eslint-disable-next-line no-await-in-loop
    await diveLog.mergeDives(keepId, foldIds, {}, rstore);
    foldIds.forEach((id) => folded.add(id));
  }
  const finalRows = (await loadIndex(rstore)).filter((r) => !r.deletedAt);
  assert.equal(finalRows.length, 1, `expected 1 dive after recovery, got ${finalRows.length}`);
  assert.equal(finalRows[0].id, shDive.dive.id); // the long Shearwater dive is canonical
  // the two Suunto fragments are fused into ONE continuous log (not stacked)
  assert.equal(finalRows[0].logCount, 2);
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

  await clearAll(store);
  // clearAll leaves an empty v2 index marker so migrateToV2 won't rebuild from v1
  assert.deepEqual(await loadIndex(store), []);
  assert.equal(await isMigratedToV2(store), true);
  assert.equal(store._map.has('@dmz-scuba/dive-log/index-v1'), false);

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
  assert.match(hook, /reconcileComputers/);
  assert.match(hook, /mergeDives/);
  assert.match(hook, /purgeDeleted/);
  assert.match(hook, /eraseAllDiveData/);
  assert.match(screen, /ReconcileCard/);
  assert.match(screen, /kind === 'reconcile'/);
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
  assert.match(native, /pressuresByTank/); // capture every tank's pressure, not just tank 0

  assert.match(screen, /hasPressure/);
  assert.match(screen, /Tank pressure/);

  console.log('Dive logbook checks passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
