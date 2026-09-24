const assert = require('node:assert/strict');
const path = require('node:path');
const { loadSourceModule } = require('./lib/load-source-module.cjs');
const root = path.resolve(__dirname, '../src');
const J = loadSourceModule(path.join(root, 'features/oceanAtlas/journey.js'), root);
const { planJourney, resolveDestination, countryCode, journeyDirections } = J;
const modes = plan => plan.legs.map(leg => leg.mode);

// Curated enrichment: Cozumel keeps both named routes and gains operators/stays.
const cozumel = { id: 'cozumel', name: 'Palancar Gardens', latitude: 20.307, longitude: -87.035, region: 'Cozumel' };
assert.equal(resolveDestination(cozumel).profile.id, 'cozumel');
const island = planJourney(cozumel, { origin: 'Chicago' });
assert.deepEqual(modes(island), ['AIR', 'LAND', 'DIVE']);
assert.equal(new URL(island.legs[0].url).searchParams.get('q'), 'Flights to CZM from Chicago', 'Google Flights gets both fields.');
const located = planJourney(cozumel, { origin: '41.8800, -87.6300', originPoint: { latitude: 41.88, longitude: -87.63 } });
assert.equal(new URL(located.legs[0].url).searchParams.get('q'), 'Flights to CZM from ORD', 'Coordinates resolve to the home airport code.');
assert.equal(J.originAirport({ latitude: 44.48, longitude: -73.21 }).code, 'BTV', 'Home airport stays in the traveller’s country.');
assert.equal(new URL(planJourney(cozumel).legs[0].url).searchParams.get('q'), 'Flights to CZM');
const mainland = planJourney(cozumel, { origin: 'Chicago', arrivalIndex: 1 });
assert.deepEqual(modes(mainland), ['AIR', 'LAND', 'FERRY', 'LAND', 'DIVE']);
assert.match(decodeURIComponent(mainland.legs[1].url), /origin=Cancún International Airport/);
assert.deepEqual(modes(planJourney(cozumel, { origin: 'My hotel', arrivalIndex: 1, local: true })), ['LAND', 'DIVE']);
assert.ok(!mainland.legs.some(leg => leg.url.includes('20.307')), 'Never direct ground navigation to an approximate offshore site.');
assert.ok(island.base.operators.length >= 3 && island.base.stays.length >= 2 && island.base.operators.some(op => op.source === 'curated'));
assert.equal(resolveDestination({ name: 'Mainland', latitude: 20.5, longitude: -87.3, country: 'Mexico' }).profile, null, 'Mainland sites must not inherit island access.');
assert.equal(resolveDestination({ id: 'noaa-fknms-test', latitude: 24.5, longitude: -81.8 }).town, 'Key West, Florida');
const keys = planJourney({ id: 'noaa-fknms-x', name: 'Sombrero Reef', latitude: 24.63, longitude: -81.11, country: 'US' });
const mapped = keys.base.operators.filter(op => op.distanceKm != null);
assert.ok(mapped.length > 0 && mapped.every((op, i) => i === 0 || mapped[i - 1].distanceKm <= op.distanceKm), 'OpenStreetMap operators are listed strictly by distance, closest first.');
assert.ok(keys.base.operators.findIndex(op => op.distanceKm == null) === -1 || keys.base.operators.findIndex(op => op.distanceKm == null) >= mapped.length, 'Sourced local lists follow the distance-ordered operators.');
const tulum = planJourney({ name: 'Cenote test', latitude: 20.2, longitude: -87.46 });
assert.notEqual(tulum.destination.areaName, 'Cozumel', 'A mainland cenote is not given an island base 60 km away.');
assert.ok(tulum.base.operators[0].distanceKm < 5, 'Every site gets its nearest mapped operators, not just curated destinations.');

// General engine: no site depends on a profile.
const dominica = planJourney({ name: 'Champagne', latitude: 15.25, longitude: -61.37, country: 'Dominica', region: 'Caribbean Sea' }, { origin: 'Chicago' });
assert.equal(dominica.destination.country, 'Dominica');
assert.equal(dominica.arrivals[0].code, 'DOM', 'Best-connected in-country airport first.');
assert.ok(!dominica.destination.place.includes('Caribbean Sea'), 'Sea names are not places.');
assert.deepEqual(modes(dominica), ['AIR', 'LAND', 'DIVE']);
assert.ok(dominica.base.searches.some(search => search.kind === 'operators') && dominica.base.searches.some(search => search.kind === 'stays'));
assert.ok(dominica.considerations.some(item => /flying/i.test(item.title)));
assert.equal(countryCode('St. Vincent & Grenadines'), 'VC');
assert.equal(countryCode('US'), 'US');
assert.equal(resolveDestination({ name: 'Aguadilla', latitude: 18.5, longitude: -67.16, country: 'United States' }).country, 'Puerto Rico', 'Territories resolve to the serving jurisdiction.');
const remote = planJourney({ name: 'Remote Reef', latitude: -10, longitude: 170 });
assert.ok(remote.destination.remote && /liveaboard/i.test(remote.legs.at(-1).detail));
const nearby = planJourney(cozumel, { originPoint: { latitude: 20.63, longitude: -87.07 } });
assert.equal(nearby.arrivals[0].road, true, 'Close origins get an overland route first.');
assert.deepEqual(modes(planJourney(cozumel, { originPoint: { latitude: 20.63, longitude: -87.07 }, origin: 'Playa del Carmen' })), ['LAND', 'DIVE']);
assert.equal(new URL(journeyDirections('A&B #1', 'Key West')).searchParams.get('origin'), 'A&B #1');

// Every catalog site resolves to a country and a real arrival option.
const g = require('../src/features/oceanAtlas/data/globalSites.json');
const decode = (value, bytes, reader) => { const buffer = Buffer.from(value, 'base64'); const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.length); return Array.from({ length: buffer.length / bytes }, (_, i) => view[reader](i * bytes, true)); };
const coordinates = decode(g.coordinatesBase64, 4, 'getInt32'), countries = decode(g.countryIndexesBase64, 1, 'getUint8');
let failures = 0;
g.names.forEach((name, i) => {
  const plan = planJourney({ name, latitude: coordinates[i * 2] / 1e5, longitude: coordinates[i * 2 + 1] / 1e5, country: g.countries[countries[i] - 1] });
  if (!plan.destination.country || !plan.arrivals.length || plan.legs[0].mode !== 'AIR') failures++;
});
assert.equal(failures, 0, `${failures} catalog sites without a planned arrival`);
// When to go: temperatures everywhere, sourced seasons first, separate seasons stay separate.
const S = loadSourceModule(path.join(root, 'features/oceanAtlas/seasons.js'), root);
assert.equal(S.monthRange([11, 0, 1, 2]), 'Dec–Mar');
assert.equal(S.monthRange([0, 1, 5, 6]), 'Jan–Feb, Jun–Jul');
const cozumelGuide = S.seasonGuide(cozumel);
assert.equal(cozumelGuide.temps.length, 12);
assert.equal(cozumelGuide.highlights[0].label, 'Dec–Mar');
assert.equal(cozumelGuide.highlights[0].animals[0].common, 'Spotted eagle ray');
assert.ok(cozumelGuide.highlights[0].sourced);
const jupiter = S.seasonGuide({ latitude: 26.95, longitude: -80.05 });
assert.deepEqual(jupiter.highlights.filter(h => h.sourced).map(h => h.label), ['Nov–May', 'Aug–Oct'], 'Two distinct Jupiter seasons, never merged.');
assert.ok(S.seasonGuide({ latitude: 15.25, longitude: -61.37 }).temps, 'Coastal sites still get a temperature profile.');
const life = require('../src/features/oceanAtlas/data/marineLife.json');
for (const [, , , license] of Object.values(life.taxa).map(t => [t[0], t[1], t[2], t[5]])) assert.ok(!license || !/nc|nd/i.test(license), `Non-reusable photo license: ${license}`);
// Ratings: estimates with reasons.
const R = loadSourceModule(path.join(root, 'features/oceanAtlas/ratings.js'), root);
const C = loadSourceModule(path.join(root, 'features/oceanAtlas/catalog.js'), root);
assert.deepEqual([30, 27, 24, 21, 18, 14, 8].map(R.exposureFor), ['Rash guard / thin suit', '1–3 mm', '3–5 mm', '5–7 mm', '7 mm or drysuit', 'Drysuit + insulation', 'Drysuit + insulation']);
assert.equal(R.experienceRating({ maxDepthMeters: 10, topologies: [] }, null, false).level, 'Beginner');
assert.equal(R.experienceRating({ maxDepthMeters: 25, topologies: ['drift'] }, null, false).level, 'Advanced');
assert.equal(R.experienceRating({ topologies: ['cave'] }, null, false).level, 'Technical');
assert.equal(R.experienceRating({ maxDepthMeters: 12, topologies: [] }, null, false).confidence, 'depth');
const palancar = C.catalogSites().find(site => site.name === 'Palancar Gardens');
assert.ok(R.siteRatings(palancar, S.seasonGuide(palancar)).experience.reasons.includes('drift / current'), 'Cozumel profile marks drift diving.');
const near = R.travelRating(cozumel, { latitude: 21.16, longitude: -86.85 }), far = R.travelRating(cozumel, { latitude: 51.5, longitude: -0.12 });
assert.ok(['Easy', 'Moderate'].includes(near.level) && ['Involved', 'Expedition'].includes(far.level), 'Further and more steps is harder.');
assert.equal(R.travelRating(cozumel).personal, false, 'Without a start, travel rates site access only.');
const busch = C.catalogSites().find(site => site.name === 'Adolphus Busch Wreck');
const buschLife = R.marineLifeRating(S.seasonGuide(busch));
assert.ok(buschLife[8].stars > buschLife[0].stars, 'Sourced goliath season lifts the September marine-life rating.');
// Inland guides: water type, altitude, groundwater and a damped hot-climate surface.
const IN = loadSourceModule(path.join(root, 'features/oceanAtlas/inland.js'), root);
const named = name => C.catalogSites().find(site => site.name === name);
assert.equal(IN.inlandProfile(named('Mermet Springs')).kind, 'quarry', 'Curated kind hints beat the name ("Springs" quarry).');
const blueHole = IN.inlandProfile(named('Blue Hole (New Mexico)'));
assert.ok(blueHole.altitude && blueHole.elevation > 1300 && blueHole.constant != null, 'Blue Hole is a groundwater spring at altitude.');
const mine = IN.inlandProfile(named('Bonne Terre Mine'));
assert.ok(mine.kind === 'mine' && mine.constant > 10 && mine.constant < 18, 'Flooded mines hold near the mean annual air temperature.');
const mead = IN.inlandProfile(named('Lake Mead — Boulder Beach'));
assert.ok(Math.max(...mead.surface) <= 30 && mead.stratifies, 'Hot-climate lakes do not overheat and stratify in summer.');
assert.ok(IN.inlandProfile(named('Haigh Quarry')).ice.length > 0, 'Northern quarries flag ice months.');
assert.equal(IN.isInland(named('Palancar Gardens')), false);
const haighRatings = R.siteRatings(named('Haigh Quarry'), { animals: [] }, { inland: IN.inlandProfile(named('Haigh Quarry')), life: [] });
assert.ok(haighRatings.visibility === null && haighRatings.exposureDeep, 'Inland ratings drop satellite visibility and add a below-thermocline suit.');
// Site photos: only wrecks and inland sites, only openly licensed Commons files, always credited.
const PHOTOS = require(path.join(root, 'features/oceanAtlas/data/siteImages.json')).images;
const WRECK_NAME = /\b(wreck|shipwreck|SS|MV|USS|HMS|HMAS|SV|PS|barge|schooner|steamer|freighter|tug|lightship)\b/i;
for (const [id, [url, attribution, license, page]] of Object.entries(PHOTOS)) {
  const site = C.catalogSite(id);
  assert.ok(site && (IN.isInland(site) || site.topologies.includes('wreck') || WRECK_NAME.test(site.name)), `${id} is a wreck or inland site`);
  assert.ok(/^https:\/\/(upload|thumb)\.wikimedia\.org\/[^?]+$/.test(url) && /^https:\/\/commons\.wikimedia\.org\//.test(page) && attribution, `${id} photo is a credited Commons file`);
  assert.match(license, /^(cc0|public domain|pd\b|pdm|cc by(-sa)?( \d(\.\d)?)?$)/i, `${id} photo is openly licensed`);
}
// Altitude: only ABOVE 1,000 ft is an altitude dive.
const CONDITIONS = require(path.join(root, 'features/oceanAtlas/data/inlandConditions.json')).sites;
for (const id of Object.keys(CONDITIONS)) {
  const site = C.catalogSite(id); if (!site) continue;
  const p = IN.inlandProfile(site);
  if (p.elevation != null) assert.equal(p.altitude, p.elevation * 3.28084 > 1000, `${site.name}: altitude flag follows the 1,000 ft rule`);
}
assert.ok(IN.inlandProfile(named('Blue Hole (New Mexico)')).altitude, 'Blue Hole (NM) is an altitude dive.');
assert.ok(!IN.inlandProfile(named('Haigh Quarry')).altitude, 'Haigh Quarry is a normal dive.');
// Units: imperial text says ft / mi and never km; metric says m / km.
const U = loadSourceModule(path.join(root, 'features/oceanAtlas/units.js'), root);
assert.equal(U.unitSystem({ depthUnit: 'ft' }), 'imperial'); assert.equal(U.unitSystem({ depthUnit: 'm' }), 'metric');
assert.equal(U.approxDistance(160.9344, 'imperial'), 'about 100 mi'); assert.equal(U.depthText(30.48, 'imperial'), '100 ft'); assert.equal(U.areaText(2.589988, 'imperial'), '1 sq mi');
const chicago = { latitude: 41.88, longitude: -87.63 };
for (const name of ['Palancar Gardens', 'Blue Hole (New Mexico)', 'Haigh Quarry']) {
  const site = named(name), inland = IN.isInland(site) ? IN.inlandProfile(site) : null;
  const imperialText = JSON.stringify([R.siteRatings(site, S.seasonGuide(site), { originPoint: chicago, inland, life: [], units: 'imperial' }), J.planJourney(site, { originPoint: chicago, origin: 'Chicago', units: 'imperial' })]);
  assert.ok(!/\d ?km\b|\d m\b/.test(imperialText) && /\bmi\b/.test(imperialText), `${name}: imperial text uses mi/ft only`);
  const metricText = JSON.stringify([R.siteRatings(site, S.seasonGuide(site), { originPoint: chicago, inland, life: [], units: 'metric' }), J.planJourney(site, { originPoint: chicago, origin: 'Chicago', units: 'metric' })]);
  assert.ok(/\bkm\b/.test(metricText) && !/\d mi\b/.test(metricText), `${name}: metric text uses km/m`);
}
// Published depths: posted figures, lakes flagged and kept out of the experience rating.
assert.equal(Math.round(named('Haigh Quarry').maxDepthMeters * 3.28084), 85); assert.equal(named('Haigh Quarry').depthSource.name, 'Posted by the site');
assert.ok(named('Geneva Lake').depthIsWholeLake && R.experienceRating(named('Geneva Lake'), null, false).confidence === 'features', 'A lake’s deepest point is not a dive depth.');
assert.ok(named('SS Milwaukee (1868)').maxDepthMeters > 100, 'Wikipedia wreck depths fill gaps.');
console.log(`Journey checks passed: curated enrichment, generic destination resolution, territories, overland, remote access, flight prefill, seasons, ratings, inland guides, site photos, altitude rule, units, published depths and all ${g.names.length} catalog sites.`);
