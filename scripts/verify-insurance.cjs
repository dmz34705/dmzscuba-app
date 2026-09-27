const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadSourceModule } = require('./lib/load-source-module.cjs');
const root = path.resolve(__dirname, '../src');
const I = loadSourceModule(path.join(root, 'features/insurance/model.js'), root);
const P = loadSourceModule(path.join(root, 'features/planner/model.js'), root);

const now = new Date(2026, 8, 27, 9);
const today = '2026-09-27';

// Records: typed-in fields only, tidied; documents need a file.
const policy = I.normalizePolicy({
  type: 'dive', provider: '  DAN  ', policyNumber: 'DAN-12345', memberNumber: '998877', startDate: '2026-01-01', endDate: '2026-12-31',
  emergencyPhone: '+1 919 684 9111', covered: 'Me', notes: 'Medical to $500k',
  documents: [{ name: 'Card.jpg', uri: 'file:///card.jpg', kind: 'photo', mimeType: 'image/jpeg' }, { name: 'No file' }],
}, now);
assert.equal(policy.provider, 'DAN');
assert.equal(policy.documents.length, 1, 'A document without a file is dropped.');
assert.equal(I.normalizePolicy({ type: 'boat' }).type, 'dive', 'Unknown types default to dive accident.');
assert.equal(I.normalizePolicy({ startDate: '2026-05-01', endDate: '2026-04-01' }).endDate, '', 'An end before the start is dropped.');
assert.equal(I.normalizeInsuranceState(null).policies.length, 0);
assert.equal(I.policyTitle(policy), 'DAN · Dive accident');

// Status.
assert.equal(I.policyStatus(policy, today).key, 'active');
assert.equal(I.policyStatus({ ...policy, endDate: '2026-10-10' }, today).label, 'Expires in 13 days');
assert.equal(I.policyStatus({ ...policy, endDate: '2026-09-27' }, today).label, 'Expires today');
assert.equal(I.policyStatus({ ...policy, endDate: '2026-09-01' }, today).key, 'expired');
assert.equal(I.policyStatus({ ...policy, endDate: '2026-09-01', autoRenews: true }, today).key, 'active', 'Auto-renewing cover never shows as expired.');
assert.equal(I.policyStatus({ ...policy, startDate: '2026-10-01' }, today).key, 'upcoming');

// Coverage of a plan's dates.
assert.ok(I.coversDates(policy, '2026-11-07', '2026-11-14'));
assert.ok(!I.coversDates({ ...policy, endDate: '2026-11-10' }, '2026-11-07', '2026-11-14'));
assert.ok(I.coversDates({ ...policy, endDate: '2026-11-10', autoRenews: true }, '2026-11-07', '2026-11-14'));

const trip = P.normalizePlan({ kind: 'trip', startDate: '2026-11-07', endDate: '2026-11-14', requirements: { insurance: true } }, now);
const travel = I.normalizePolicy({ id: 'travel', type: 'travel', provider: 'World Nomads', startDate: '2026-11-06', endDate: '2026-11-12' }, now);
const lapsing = I.normalizePolicy({ id: 'lapsing', type: 'dive', provider: 'DiveAssure', startDate: '2026-01-01', endDate: '2026-11-10' }, now);
const old = I.normalizePolicy({ id: 'old', type: 'dive', provider: 'Old DAN', endDate: '2025-12-31' }, now);

const found = I.policiesForPlan(trip, [policy, travel, old]);
assert.deepEqual(found.auto.map((entry) => entry.provider), ['DAN'], 'Dive cover in force is found automatically; expired cover is not.');
assert.equal(found.covering.provider, 'DAN');
assert.deepEqual(found.attached, [], 'Other policies only join a plan when attached.');
assert.deepEqual(I.policiesForPlan({ ...trip, insuranceIds: ['travel'] }, [policy, travel]).attached.map((entry) => entry.id), ['travel']);

// Planner: covered → requirement sorted; lapsing → flagged; attached travel ending early → flagged.
const alerts = (plan, policies) => P.planAlerts(plan, { insurance: policies, now }, now).map((alert) => alert.key);
assert.ok(alerts(trip, []).includes('paper-insurance'), 'No policy on file: the requirement is still open.');
assert.ok(!alerts(trip, [policy]).includes('paper-insurance'), 'An active dive policy covering the trip sorts the requirement.');
const lapse = alerts(trip, [lapsing]);
assert.ok(lapse.includes('ins-gap-lapsing') && lapse.includes('paper-insurance'), 'Cover that ends mid-trip is flagged and doesn’t count.');
assert.ok(alerts({ ...trip, insuranceIds: ['travel'] }, [policy, travel]).includes('ins-end-travel'), 'Attached travel cover ending before the trip is flagged.');
assert.ok(!alerts({ ...trip, insuranceIds: ['travel'] }, [policy, { ...travel, endDate: '2026-11-20' }]).includes('ins-end-travel'));
assert.deepEqual(P.normalizePlan({ insuranceIds: ['a', 'a', ''] }, now).insuranceIds, ['a']);

// Nothing here reaches a network or AI service.
const sources = ['model.js', 'storage.js', 'useInsurance.js', 'PolicyEditor.js', 'openDocument.js'].map((file) => fs.readFileSync(path.join(root, 'features/insurance', file), 'utf8')).join('\n')
  + fs.readFileSync(path.join(root, 'screens/InsuranceScreen.js'), 'utf8');
assert.ok(!/fetch\(|workers\.dev|gemini|smartImport|accountApi/i.test(sources), 'Insurance never calls a server or AI.');

console.log('Insurance checks passed: records, status, date coverage, automatic dive cover, attached policies, trip alerts, and no network or AI.');
