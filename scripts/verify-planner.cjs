const assert = require('node:assert/strict');
const path = require('node:path');
const { loadSourceModule } = require('./lib/load-source-module.cjs');
const root = path.resolve(__dirname, '../src');
const P = loadSourceModule(path.join(root, 'features/planner/model.js'), root);

const now = new Date(2026, 8, 25, 9, 0); // Sep 25, 2026, 9am local
const keys = (alerts) => alerts.map((a) => a.key);
const find = (alerts, prefix) => alerts.find((a) => a.key.startsWith(prefix));

// Records normalise safely.
const empty = P.emptyPlan('day', now);
assert.equal(empty.kind, 'day');
assert.equal(empty.startDate, '2026-09-26', 'A new dive day defaults to tomorrow.');
assert.equal(P.normalizePlan({ kind: 'trip', startDate: '2026-10-10', endDate: '2026-10-01' }, now).endDate, '2026-10-10', 'A trip cannot end before it starts.');
assert.equal(P.normalizePlan({ kind: 'day', startDate: '2026-10-10', endDate: '2026-10-12' }, now).endDate, '2026-10-10', 'A dive day is one day.');
assert.equal(P.normalizePlan({ startTime: '25:00' }, now).startTime, '');
assert.deepEqual(P.normalizePlan({ requirements: { certs: ['nitrox', 'bogus', 'nitrox'] } }, now).requirements.certs, ['nitrox']);
assert.equal(P.normalizeSegment({ type: 'rocket' }).type, 'other');
assert.equal(P.normalizeSegment({ type: 'diving', endDate: '2026-10-11' }).endDate, '', 'A dive day leg has no end date.');
assert.equal(P.normalizePlannerState(null).plans.length, 0);

// Dates and phases.
assert.equal(P.formatRange('2026-10-10', '2026-10-17'), 'Oct 10–17, 2026');
assert.equal(P.formatRange('2026-12-28', '2027-01-04'), 'Dec 28, 2026 – Jan 4, 2027');
assert.equal(P.formatTime('07:30'), '7:30 AM');
assert.equal(P.formatTime('13:05'), '1:05 PM');
assert.equal(P.planPhase(P.normalizePlan({ startDate: '2026-09-26' }, now), now).label, 'Tomorrow');
assert.equal(P.planPhase(P.normalizePlan({ kind: 'trip', startDate: '2026-09-24', endDate: '2026-09-28' }, now), now).label, 'Day 2 of 5');
assert.equal(P.planPhase(P.normalizePlan({ startDate: '2026-09-01' }, now), now).key, 'past');
const sorted = P.sortPlans([
  P.normalizePlan({ id: 'b', startDate: '2026-11-01' }, now), P.normalizePlan({ id: 'a', startDate: '2026-10-01' }, now),
  P.normalizePlan({ id: 'old', startDate: '2026-08-01' }, now), P.normalizePlan({ id: 'x', startDate: '2026-10-05', status: 'cancelled' }, now),
], now);
assert.deepEqual(sorted.upcoming.map((p) => p.id), ['a', 'b']);
assert.deepEqual(sorted.past.map((p) => p.id), ['x', 'old']);

// Gear: a regulator due before the trip, an overdue BCD, and a computer due just after.
const gear = {
  items: [
    { id: 'reg', name: 'Apeks XTX50', category: 'Regulator', condition: 'Ready', nextServiceDate: '2026-10-20', components: [] },
    { id: 'bcd', name: 'Zeagle Ranger', category: 'BCD', condition: 'Ready', nextServiceDate: '2026-09-01', components: [] },
    { id: 'comp', name: 'Shearwater Peregrine', category: 'Dive computer', condition: 'Ready', nextServiceDate: '2026-11-25', components: [] },
    { id: 'fins', name: 'Fins', category: 'Fins', condition: 'Out of service', components: [] },
  ],
  setups: [{ id: 'travel', name: 'Travel kit', itemIds: ['reg', 'bcd', 'comp', 'fins'], checkedIds: ['reg'], accessoryChoices: {} }],
};
const trip = P.normalizePlan({
  kind: 'trip', title: 'Cozumel', startDate: '2026-11-07', endDate: '2026-11-14', setupId: 'travel', status: 'booked',
  requirements: { certs: ['advanced', 'nitrox'], minDives: 50, insurance: true },
  travel: { passportExpiry: '2027-03-01' },
  segments: [
    { type: 'flight', title: 'ORD → MIA', startDate: '2026-11-07', startTime: '06:00', endDate: '2026-11-07', endTime: '10:10', from: 'ORD', to: 'MIA' },
    { type: 'flight', title: 'MIA → CZM', startDate: '2026-11-07', startTime: '10:50', endDate: '2026-11-07', endTime: '12:00', from: 'MIA', to: 'CZM' },
    { type: 'stay', title: 'Casa del Mar', startDate: '2026-11-07', endDate: '2026-11-12' },
    { type: 'diving', title: 'Palancar', startDate: '2026-11-08', dives: 2 },
    { type: 'diving', title: 'Santa Rosa', startDate: '2026-11-13', endTime: '15:00', dives: 2 },
    { type: 'flight', title: 'CZM → ORD', startDate: '2026-11-14', startTime: '07:00', from: 'CZM', to: 'ORD' },
  ],
}, now);
const certs = [{ id: 'c1', agency: 'PADI', certificationName: 'Rescue Diver' }];
const dives = Array.from({ length: 30 }, (_, i) => ({ id: `d${i}`, startTime: '2026-06-01T10:00:00Z' }));
const alerts = P.planAlerts(trip, { gear, certifications: certs, dives, now });

assert.equal(find(alerts, 'svc-bcd').tone, 'danger', 'Overdue service is a problem to fix.');
assert.equal(find(alerts, 'svc-reg').tone, 'warning', 'Service due before the trip is flagged.');
assert.match(find(alerts, 'svc-reg').detail, /Book it by Oct 17/, 'With a three-week lead time.');
assert.equal(find(alerts, 'svc-comp').tone, 'info', 'Due soon after the trip is a heads-up.');
assert.ok(keys(alerts).includes('gear-out-fins'), 'Out-of-service gear in the setup is flagged.');
assert.ok(!find(alerts, 'svc-fins'), 'No service nag for gear that is already out of service.');
assert.ok(!find(alerts, 'cert-advanced'), 'A Rescue card satisfies an Advanced requirement.');
assert.equal(find(alerts, 'cert-nitrox').tone, 'warning', 'A missing Nitrox card is flagged.');
assert.ok(find(alerts, 'min-dives'), '30 logged dives is short of 50.');
assert.equal(find(alerts, 'nofly-').tone, 'warning', '16 hours from 3pm to 7am is under 18.');
assert.match(find(alerts, 'nofly-').title, /~16 hours/);
assert.equal(find(alerts, 'connect-').tone, 'warning', 'A 40-minute connection is tight.');
assert.match(find(alerts, 'connect-').title, /40-minute connection in MIA/);
assert.ok(find(alerts, 'nights-2026-11-12'), 'The last two nights have no stay.');
assert.match(find(alerts, 'nights-2026-11-12').title, /Nov 12–14/);
assert.equal(find(alerts, 'passport-validity').tone, 'warning', 'Passport valid under six months after return.');
assert.ok(find(alerts, 'paper-insurance'), 'Insurance asked for and not confirmed.');
assert.ok(!find(alerts, 'refresher'), 'A dive in June is recent enough.');
assert.ok(alerts.every((a, i) => i === 0 || ({ danger: 3, warning: 2, info: 1, good: 0 })[alerts[i - 1].tone] >= ({ danger: 3, warning: 2, info: 1, good: 0 })[a.tone]), 'Most serious first.');
assert.equal(P.readinessSummary(alerts).tone, 'danger');

// Fixing things clears them.
const fixed = P.normalizePlan({ ...trip, confirmed: { insurance: true }, travel: { passportExpiry: '2030-01-01' },
  segments: [...trip.segments.filter((leg) => leg.title !== 'CZM → ORD' && leg.title !== 'Casa del Mar'),
    { type: 'stay', title: 'Casa del Mar', startDate: '2026-11-07', endDate: '2026-11-14' },
    { type: 'flight', title: 'CZM → ORD', startDate: '2026-11-14', startTime: '13:00', from: 'CZM', to: 'ORD' }] }, now);
const after = P.planAlerts(fixed, { gear, certifications: certs, dives, now });
for (const gone of ['nofly-', 'nights-', 'passport-', 'paper-insurance']) assert.ok(!find(after, gone), `${gone} resolved`);

// Signed out, no setup, long break, operator recency rule.
const day = P.normalizePlan({ kind: 'day', startDate: '2026-10-03', startTime: '07:30', requirements: { certs: ['open-water'], recentMonths: 6 } }, now);
const dayAlerts = P.planAlerts(day, { gear, certifications: null, dives: [{ startTime: '2025-01-10T10:00:00Z' }], now });
assert.ok(find(dayAlerts, 'setup'), 'Prompt to choose a setup when the locker has gear.');
assert.ok(find(dayAlerts, 'certs-signin'), 'Prompt to sign in to check cards.');
assert.ok(find(dayAlerts, 'recent'), 'Operator recency rule flagged.');
assert.ok(!find(dayAlerts, 'nofly-') && !find(dayAlerts, 'nights-'), 'Travel checks only apply to trips.');
assert.deepEqual(P.planAlerts({ ...day, status: 'cancelled' }, { gear, now }), []);
assert.deepEqual(P.planAlerts(P.normalizePlan({ startDate: '2026-09-01' }, now), { gear, now }), [], 'Past plans have no alerts.');

// Packing reminder the week of the trip.
const soon = P.normalizePlan({ ...fixed, startDate: '2026-09-29', endDate: '2026-10-03', segments: [] }, now);
assert.ok(find(P.planAlerts(soon, { gear, certifications: certs, dives, now }), 'packing'), 'Unpacked items flagged in the final week.');

// Cards: expiring required cards and higher levels.
assert.equal(P.cardsFor([{ certificationName: 'Master Scuba Diver Trainer / Instructor' }], 'open-water').length, 1);
const expiring = P.planAlerts(P.normalizePlan({ ...day, requirements: { certs: ['nitrox'] } }, now), { gear: { items: [], setups: [] }, certifications: [{ certificationName: 'Enriched Air Nitrox', expiresOn: '2026-10-01' }], dives: [], now });
assert.ok(find(expiring, 'cert-exp-nitrox'), 'A required card that expires before the dive is flagged.');

// Timeline groups legs by day, carrying overnight stays.
const timeline = P.planTimeline(trip);
assert.equal(timeline.days.length, 8);
assert.equal(timeline.days[0].starts.length, 3);
assert.ok(timeline.days[2].continuing.some((leg) => leg.type === 'stay'), 'A multi-night stay continues through the days.');
assert.ok(timeline.days[5].ends.some((leg) => leg.type === 'stay'), 'And shows checkout on its last day.');

// Linked sites keep their atlas id, position and area.
const linked = P.normalizePlan({ destination: { name: 'Palancar Gardens', siteId: 'x', latitude: 20.3, longitude: -87.03, area: 'Cozumel, Mexico', custom: false } }, now);
assert.equal(linked.destination.area, 'Cozumel, Mexico');
assert.equal(P.normalizePlan({ destination: { name: 'Quarry', latitude: 200, longitude: 0 } }, now).destination.latitude, undefined, 'Invalid coordinates are dropped.');

// Site type-ahead: atlas sites with their area, the diver's own pins first.
const S = loadSourceModule(path.join(root, 'features/planner/siteSearch.js'), root);
const pal = S.searchDiveSites('palancar h');
assert.equal(pal[0].name, 'Palancar Horseshoe');
assert.match(pal[0].area, /Cozumel/);
assert.ok(Number.isFinite(pal[0].latitude) && !pal[0].custom);
assert.deepEqual(S.searchDiveSites('p'), [], 'One letter is too short to search.');
const mine = S.searchDiveSites('backyard', [{ id: 'my-abc12', name: 'Backyard Quarry', latitude: 41, longitude: -88 }]);
assert.equal(mine[0].custom, true);
assert.equal(mine[0].area, 'My site');
assert.ok(S.searchDiveSites('spiegel grove').some((site) => /Spiegel Grove/.test(site.name)), 'Multi-word names match.');
assert.ok(S.searchDiveSites('devils den').some((site) => /Devil.s Den/.test(site.name)), 'Apostrophes are ignored.');

(async () => {
  // My sites storage: validated, de-duplicated by id, removable.
  const M = loadSourceModule(path.join(root, 'features/mySites/storage.js'), root);
  const memory = new Map();
  const store = { getItem: async (k) => memory.get(k) ?? null, setItem: async (k, v) => { memory.set(k, v); } };
  const added = await M.addMySite({ name: ' Haigh Quarry ', latitude: 41.2, longitude: -88.3 }, store);
  assert.equal(added.name, 'Haigh Quarry');
  assert.match(added.id, /^my-/);
  await assert.rejects(M.addMySite({ name: '', latitude: 1, longitude: 1 }, store));
  await assert.rejects(M.addMySite({ name: 'Nowhere', latitude: 91, longitude: 0 }, store));
  await M.addMySite({ ...added, name: 'Haigh Quarry (south)' }, store);
  assert.deepEqual((await M.loadMySites(store)).map((site) => site.name), ['Haigh Quarry (south)'], 'Saving the same id replaces it.');
  await M.removeMySite(added.id, store);
  assert.equal((await M.loadMySites(store)).length, 0);
  memory.set(M.MY_SITES_STORAGE_KEY, '{broken');
  assert.deepEqual(await M.loadMySites(store), [], 'Corrupt storage reads as empty.');
  console.log('Site search and My sites checks passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });

console.log(`Planner checks passed: records, dates, phases, sorting, timeline, gear service lead times, out-of-service gear, packing, certification levels and expiry, experience and recency, paperwork, no-fly intervals, connections, uncovered nights and passport validity (${alerts.length} alerts on the sample trip).`);
