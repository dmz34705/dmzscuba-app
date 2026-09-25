const assert = require('node:assert/strict');
const path = require('node:path');
const { loadSourceModule } = require('./lib/load-source-module.cjs');
const root = path.resolve(__dirname, '../src');
const M = loadSourceModule(path.join(root, 'features/siteDives/siteMatch.js'), root);
const { normalizeDive } = loadSourceModule(path.join(root, 'lib/diveLog/schema.js'), root);
const { buildLocationSuggestions, buildSiteLinkSuggestions } = loadSourceModule(path.join(root, 'lib/locationLog/suggestions.js'), root);
const { groupDivePins } = loadSourceModule(path.join(root, 'features/oceanAtlas/model.js'), root);

// Offsets in metres, roughly, at the latitude used below.
const at = (lat, lon, north = 0, east = 0) => ({ latitude: lat + north / 111320, longitude: lon + east / (111320 * Math.cos(lat * Math.PI / 180)) });
const reef = { id: 'atlas-reef', name: 'Palancar Gardens', region: 'Cozumel', country: 'Mexico', ...at(20.3, -87.03) };
const horseshoe = { id: 'atlas-horseshoe', name: 'Palancar Horseshoe', region: 'Cozumel', country: 'Mexico', ...at(20.3, -87.03, 0, 250) };
const quarry = { id: 'my-quarry1', name: 'Backyard Quarry', ...at(41.2, -88.3) };
const dive = { startTime: '2026-10-03T09:10:00', logIds: ['log-1'] };

assert.ok(Math.abs(M.distanceMeters(at(0, 0), at(0, 0, 1000)) - 1000) <= 5, 'Haversine distance.');
assert.equal(M.diveDate('2026-10-03T09:10:00Z'), '2026-10-03');

// Nearby: the nearest site; a close second is offered as an alternative.
// Between two reefs (110 m from one, 140 m from the other): the nearer is suggested, the other offered.
const near = M.matchDiveSite(at(20.3, -87.03, 0, 110), dive, { sites: [reef, horseshoe] });
assert.equal(near.site.id, 'atlas-reef');
assert.equal(near.reason, 'nearby');
assert.equal(near.site.area, 'Cozumel, Mexico');
assert.equal(near.alternatives[0].site.id, 'atlas-horseshoe', 'A site only slightly further away is offered too.');
assert.equal(near.confidence, 'medium');
assert.deepEqual(M.matchDiveSite(at(20.3, -87.03, 40), dive, { sites: [reef, horseshoe] }).alternatives, [], 'At 40 m the reef is clearly the site.');
const clear = M.matchDiveSite(at(20.3, -87.03, 30), dive, { sites: [reef] });
assert.equal(clear.confidence, 'high');
assert.equal(M.matchDiveSite(at(20.3, -87.03, 900), dive, { sites: [reef] }), null, 'Too far from any site.');
assert.equal(M.matchDiveSite({ latitude: NaN, longitude: 1 }, dive, { sites: [reef] }), null);

// My sites win ties and have a slightly wider radius.
const mine = M.matchDiveSite(at(41.2, -88.3, 450), dive, { mySites: [quarry], sites: [] });
assert.equal(mine.site.source, 'mine');

// A dive day planned at a linked site wins, even from a dock kilometres away.
const plan = { id: 'plan-1', kind: 'day', status: 'booked', startDate: '2026-10-03', destination: { siteId: 'atlas-reef', name: 'Palancar Gardens', area: 'Cozumel, Mexico', ...at(20.3, -87.03) } };
const planned = M.matchDiveSite(at(20.3, -87.03, 9000), dive, { plans: [plan], sites: [reef, horseshoe] });
assert.equal(planned.reason, 'planned');
assert.equal(planned.planId, 'plan-1');
assert.equal(planned.confidence, 'medium', '9 km from the site: the plan, not the breadcrumb, carries it.');
assert.equal(M.matchDiveSite(at(20.3, -87.03, 9000), { ...dive, startTime: '2026-10-04T09:00:00' }, { plans: [plan], sites: [reef] }), null, 'Plans only count on their date.');
assert.equal(M.matchDiveSite(at(20.3, -87.03, 40000), dive, { plans: [plan], sites: [] }), null, 'Beyond boat range.');
assert.equal(M.matchDiveSite(at(20.3, -87.03, 100), dive, { plans: [{ ...plan, status: 'cancelled' }], sites: [reef] }).reason, 'nearby');

// Verification needs the computer and the phone near the site within the hour.
assert.equal(M.verificationFor(dive, clear, { distanceMs: 20 * 60000 }).status, 'verified');
assert.deepEqual(M.verificationFor(dive, planned, { distanceMs: 0 }).methods, ['computer', 'location', 'plan']);
assert.equal(M.verificationFor({ logIds: [] }, clear, { distanceMs: 0 }).status, 'linked', 'A hand-logged dive is linked, not verified.');
assert.equal(M.verificationFor(dive, clear, null).status, 'linked', 'Without a breadcrumb it is linked, not verified.');
assert.equal(M.verificationFor(dive, clear, { distanceMs: 3 * 3600000 }).status, 'linked', 'A breadcrumb hours away proves nothing.');

// Tiers and counts.
assert.deepEqual([1, 2, 4, 5, 9, 10, 24, 25, 300].map(M.diveTier), [1, 2, 2, 3, 3, 4, 4, 5, 5]);
const stats = M.siteDiveStats([{ site: { siteId: 'a', verification: { status: 'verified' } }, startTime: '2026-01-01' }, { siteId: 'a', startTime: '2026-02-01' }, { siteId: 'b', deletedAt: 'x' }]);
assert.deepEqual(stats.get('a'), { count: 2, verified: 1, last: '2026-02-01' });
assert.equal(stats.has('b'), false);
assert.equal(M.planDives(plan, [{ siteId: 'atlas-reef', startTime: '2026-10-03T09:00:00' }, { siteId: 'atlas-reef', startTime: '2026-10-05T09:00:00' }, { siteId: 'x', startTime: '2026-10-03T10:00:00' }]).length, 1);

// The dive record keeps the link and its evidence; an unlinked site carries none.
const saved = normalizeDive({ site: { name: 'Palancar Gardens', latitude: 20.3, longitude: -87.03, siteId: 'atlas-reef', siteSource: 'atlas', verification: { status: 'verified', methods: ['computer', 'location', 'bogus'], distanceMeters: 40 } } });
assert.equal(saved.site.siteId, 'atlas-reef');
assert.equal(saved.site.siteSource, 'atlas');
assert.deepEqual(saved.site.verification.methods, ['computer', 'location']);
assert.equal(saved.site.verification.status, 'verified');
assert.equal(normalizeDive({ site: { name: 'x', verification: { status: 'verified' } } }).site.verification, null);

// Suggestions: a downloaded dive's breadcrumb carries its site match; older located dives are offered their site.
const matchSite = (point, d) => M.matchDiveSite(point, d, { plans: [plan], sites: [reef, horseshoe] });
const downloaded = { id: 'd1', startTime: '2026-10-03T09:10:00Z', durationSeconds: 3000, logIds: ['log-1'], site: { name: '' } };
const points = [{ t: Date.parse('2026-10-03T08:55:00Z'), lat: reef.latitude, lon: reef.longitude }];
const [suggestion] = buildLocationSuggestions(points, [downloaded], [], matchSite);
assert.equal(suggestion.type, 'location');
assert.equal(suggestion.match.site.id, 'atlas-reef');
assert.equal(suggestion.logged, true);
const located = [
  { id: 'd2', startTime: '2025-05-01T10:00:00', site: { name: 'Reef', latitude: reef.latitude + 0.0001, longitude: reef.longitude } },
  { id: 'd3', startTime: '2025-05-01T10:00:00', site: { name: 'Nowhere', latitude: 0, longitude: 0 } },
  { id: 'd4', startTime: '2025-05-01T10:00:00', site: { name: 'Linked', latitude: reef.latitude, longitude: reef.longitude, siteId: 'atlas-reef' } },
  { id: 'd5', startTime: '2025-05-01T10:00:00', site: { name: 'Between', latitude: reef.latitude, longitude: reef.longitude + 0.0012 } },
];
const links = buildSiteLinkSuggestions(located, [], (point, d) => M.matchDiveSite(point, d, { sites: [reef, horseshoe] }));
assert.deepEqual(links.map((s) => s.diveId), ['d2'], 'Only confident matches for unlinked, located dives (d5 sits between two sites).');
assert.equal(links[0].type, 'site');
assert.deepEqual(buildSiteLinkSuggestions(located, ['d2'], matchSite), [], 'Answered offers are not repeated.');
assert.deepEqual(buildSiteLinkSuggestions(located, [], null), []);

// Atlas pins stack repeat visits to a linked site into one pin, with the verified count.
const pins = groupDivePins([
  { id: 'a', startTime: '2026-10-03T09:00:00', site: { name: 'Palancar Gardens', latitude: 20.3, longitude: -87.03, siteId: 'atlas-reef', verification: { status: 'verified' } } },
  { id: 'b', startTime: '2026-10-04T09:00:00', site: { name: 'Palancar Gardens', latitude: 20.30004, longitude: -87.03002, siteId: 'atlas-reef', verification: { status: 'linked' } } },
  { id: 'c', startTime: '2026-10-05T09:00:00', site: { name: 'Somewhere', latitude: 21, longitude: -87 } },
]);
const reefPin = pins.find((pin) => pin.siteId === 'atlas-reef');
assert.equal(reefPin.dives.length, 2, 'Different coordinates, one site, one pin.');
assert.equal(reefPin.verified, 1);
assert.equal(reefPin.dives[0].id, 'b', 'Newest first.');
assert.equal(pins.length, 2);

console.log('Site dive checks passed: plan, pinned and atlas matching with alternatives and ranges, verification evidence, tiers, counts, plan dives, dive record fields, location and site-link suggestions, and site-grouped atlas pins.');
