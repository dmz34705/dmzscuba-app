const assert = require('node:assert/strict');
const path = require('node:path');
const { loadSourceModule } = require('./lib/load-source-module.cjs');

const root = path.resolve(__dirname, '../src');
const I = loadSourceModule(path.join(root, 'features/diveIntelligence/model.js'), root);
const P = loadSourceModule(path.join(root, 'features/planner/model.js'), root);

const rows = [
  { id: 'a', startTime: '2026-04-01T10:00:00Z', siteId: 'gilboa', siteName: 'Gilboa Quarry', avgDepthMeters: 10, maxDepthMeters: 18, durationSeconds: 2400, tempMinC: 10, sacBarPerMin: 0.6, rmvLitersPerMin: 18, safetyScore: 94, hasTransmitterData: true },
  { id: 'b', startTime: '2026-05-01T10:00:00Z', siteId: 'gilboa', siteName: 'Gilboa Quarry', avgDepthMeters: 12, maxDepthMeters: 20, durationSeconds: 3000, tempMinC: 9, sacBarPerMin: 0.7, rmvLitersPerMin: 20, safetyScore: 90, hasTransmitterData: true },
  { id: 'c', startTime: '2026-06-01T10:00:00Z', siteId: 'other', siteName: 'Other Lake', avgDepthMeters: 6, durationSeconds: 1800, tempMinC: 20 },
];

const plan = P.normalizePlan({
  id: 'plan-gilboa', kind: 'day', startDate: '2026-10-10', destination: { siteId: 'gilboa', name: 'Gilboa Quarry' }, dives: 2, setupId: 'single',
  diveProfile: { targetDepthMeters: 20, bottomTimeMinutes: 40, startPressureBar: 220, reservePressureBar: 50 },
});
const gear = {
  setups: [{ id: 'single', name: 'Single tank', itemIds: ['tank'] }],
  items: [{ id: 'tank', name: 'AL80', category: 'Cylinder / tank', capacity: '11.1 L', workingPressure: '207 bar' }],
};

assert.equal(plan.diveProfile.targetDepthMeters, 20, 'Planning assumptions are normalized into the plan.');
assert.equal(I.diveBriefAssumptionCount(plan.diveProfile), 4, 'Brief completion counts the four required assumptions.');
const brief = I.buildDiveBrief(plan, rows, gear);
assert.equal(brief.baseline.scope, 'site');
assert.equal(brief.baseline.diveCount, 2);
assert.ok(Math.abs(brief.baseline.sac.mean - 0.65) < 0.0001);
assert.equal(brief.plannedDives, 2);
assert.ok(brief.gas, 'A complete profile and personal baseline produce a gas estimate.');
assert.equal(brief.gas.method, 'personal RMV + cylinder volume');
assert.ok(brief.gas.endBar < 220 && brief.gas.evidenceCount === 2);

const manualBrief = I.buildDiveBrief(plan, [], gear, {
  sacBarPerMin: 0.72, rmvLitersPerMin: 21, avgDepthMeters: 14, durationSeconds: 2700, tempMinC: 9,
});
assert.equal(manualBrief.baseline.scope, 'manual');
assert.equal(manualBrief.baseline.confidence.label, 'Starting values');
assert.equal(manualBrief.baseline.avgDepth.source, 'manual');
assert.equal(manualBrief.gas.evidenceLabel, 'starting value from personal setup');
assert.ok(manualBrief.gas, 'Setup values enable an early estimate before dives have been imported.');
assert.equal(brief.baseline.sac.source, 'recorded', 'Recorded evidence takes priority over setup values.');

const incomplete = I.buildDiveBrief({ ...plan, diveProfile: { targetDepthMeters: 20 } }, rows, gear);
assert.equal(incomplete.gas, null, 'Missing assumptions do not produce a plausible-looking estimate.');

const trip = { startTime: '2026-10-10T10:00:00Z', endTime: '2026-10-10T14:00:00Z', rows: [{ siteName: 'Gilboa Quarry' }] };
assert.equal(I.matchPlanToTrip(trip, [plan])?.id, plan.id, 'A plan is matched by overlapping dates and destination.');

const actualRows = [
  { id: 'new-1', startTime: '2026-10-10T10:00:00Z', siteId: 'gilboa', siteName: 'Gilboa Quarry', avgDepthMeters: 14, maxDepthMeters: 22, durationSeconds: 2700, tempMinC: 8, sacBarPerMin: 0.8, hasTransmitterData: true },
  { id: 'new-2', startTime: '2026-10-10T13:00:00Z', siteId: 'gilboa', siteName: 'Gilboa Quarry', avgDepthMeters: 12, maxDepthMeters: 19, durationSeconds: 2400, tempMinC: 9, sacBarPerMin: 0.7, hasTransmitterData: true },
];
const debrief = I.buildTripDebrief(actualRows, [...rows, ...actualRows], plan);
assert.equal(debrief.plan.dives, 2);
assert.equal(debrief.plan.targetDepthMeters, 20);
assert.equal(debrief.plan.bottomTimeMinutes, 40);
assert.equal(debrief.actual.dives, 2);
assert.equal(debrief.baseline.scope, 'site');
assert.ok(debrief.comparisons.sac.percent > 0, 'Debrief compares this trip with earlier personal data.');

console.log('Dive intelligence checks passed: evidence scope, confidence, gas gating, plan matching, personal baselines and trip comparisons.');
