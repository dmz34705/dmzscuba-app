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
// Site photos: any listed site, only openly licensed Commons files, always credited.
const PHOTOS = require(path.join(root, 'features/oceanAtlas/data/siteImages.json')).images;
const listedIds = new Set(C.catalogSites().map((site) => site.id));
for (const [id, [url, attribution, license, page]] of Object.entries(PHOTOS)) {
  assert.ok(listedIds.has(id), `${id} photo belongs to a listed (not merged-away) site`);
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
// Depths from an article's wreck / diving sections (fathoms included), never the ship's design or other ships.
assert.equal(named('SS Andrea Doria').maxDepthMeters, 73, 'The Andrea Doria lies on the bottom at 73 m (its "Wreck site" section).');
const DEPTHS = require(path.join(root, 'features/oceanAtlas/data/publishedDepths.json')).depths;
const depthOf = (name) => DEPTHS[C.catalogSites().find((site) => site.name === name)?.id];
assert.ok(!depthOf('HMS Safari') && !depthOf('Seven Stones Reef'), 'A submarine’s design depth and ships lost on a reef are not the dive’s depth.');
// Duplicate sites: one site per place, and old links to a merged-away record still resolve.
const MERGES = require(path.join(root, 'features/oceanAtlas/data/siteMerges.json'));
const everySite = C.catalogSites();
const mergedAway = new Set(MERGES.clusters.flatMap((cluster) => cluster[1]));
assert.ok(MERGES.clusters.length > 20 && !everySite.some((site) => mergedAway.has(site.id)), 'merged duplicates are not listed');
const [keepId, [dupId]] = MERGES.clusters[0];
assert.equal(C.catalogSite(dupId).id, keepId, 'a merged-away id resolves to the site it became');
const cozumelNames = everySite.filter((site) => /^(tormentos|paraiso|paraíso)( reef)?$/i.test(site.name) && site.latitude > 20 && site.latitude < 21);
assert.equal(cozumelNames.length, 2, 'Cozumel’s Tormentos and Paraíso each appear once');
assert.ok(cozumelNames.every((site) => site.independentSources >= 2), 'and are marked as confirmed by several sources');
assert.ok(everySite.some((site) => site.name === 'Alligator Reef') && everySite.some((site) => site.name === 'Alligator Wreck'), 'a reef and a wreck with the same name stay separate');
assert.ok(!everySite.some((site) => /&#0*39;|&amp;/.test(site.name)), 'site names have no HTML codes');
// Great Lakes wrecks: positioned only in their article's text or listed only in Wikipedia's lake lists, and
// the same wreck from Wikipedia and Wikidata (same article) or under "SS X" / "X (Wreck)" shown once.
const prins = everySite.find((site) => site.name === 'MV Prins Willem V');
assert.ok(prins && Math.abs(prins.latitude - 43.026) < 0.01 && prins.maxDepthMeters === 24, 'the Prins Willem V is off Milwaukee, in 24 m');
for (const name of [/^Gallinipper$/, /^SS Senator$/, /^SS Harriet B\.$/, /Wexford/, /^Ottawa/, /Wazee/]) {
  assert.equal(everySite.filter((site) => name.test(site.name) && site.latitude > 41 && site.latitude < 49.5 && site.longitude > -93 && site.longitude < -75).length, 1, `${name} appears once`);
}
assert.equal(everySite.filter((site) => /^Moonhole( Wreck)?$/.test(site.name)).length, 2, 'a reef and the wreck beside it stay two sites');
// Notable wrecks worldwide (Wikipedia article, ≤ 100 m of water), with what their protection means for a diver;
// war graves closed to divers are not listed.
const swash = everySite.find((site) => /Swash Channel/i.test(site.name));
assert.ok(swash && /licence/i.test(swash.note || ''), 'the Swash Channel Wreck is listed, with its UK protected-wreck licence note');
assert.ok(!everySite.some((site) => /USS Arizona|USS Utah|Royal Oak|Edmund Fitzgerald|Richard Montgomery/i.test(site.name)), 'wrecks closed to divers are not listed');
assert.ok(!everySite.some((site) => /^(H\. L\. Hunley|Mary Rose|Costa Concordia|SS Valley Camp)$/.test(site.name)), 'ships raised into museums, afloat as museums or scrapped are not dive sites');
assert.ok(everySite.some((site) => /Tamaroa/.test(site.name)), 'a former museum ship sunk as an artificial reef is');
assert.ok(everySite.some((site) => /^(HMS|USS|SMS) /.test(site.name) && /war grave/.test(site.note || '')), 'naval wrecks say they may be war graves');
assert.equal(everySite.filter((site) => /^New Orleans \(18(38|85)\)$/.test(site.name)).length, 2, 'two ships of one name stay two wrecks');
// Encyclopedia facts: keyed to listed sites, short credited summaries, ship histories only with real facts.
const FACTS = require(path.join(root, 'features/oceanAtlas/data/siteFacts.json')).facts;
for (const [id, [summary, article, ship]] of Object.entries(FACTS)) {
  assert.ok(listedIds.has(id), `${id} facts belong to a listed site`);
  if (summary) assert.ok(summary.length <= 420 && /^https:\/\/[a-z]+\.wikipedia\.org\/wiki\//.test(article), `${id} summary is short and linked to its article`);
  if (ship) assert.ok(/^https:\/\/www\.wikidata\.org\/wiki\/Q\d+$/.test(ship[7]) && ship.slice(0, 7).some((value) => value && (!Array.isArray(value) || value.length)), `${id} ship history cites Wikidata and says something`);
}
// OBIS survey records fill places iNaturalist barely covers: never a season, never over a sighting.
const oceanSites = everySite.filter((site) => !IN.isInland(site));
const surveyGuides = oceanSites.map((site) => S.seasonGuide(site)).filter((guide) => guide.animals.some((animal) => animal.survey));
assert.ok(surveyGuides.length > 50, 'OBIS adds marine life to sites with few sightings');
for (const guide of surveyGuides) for (const animal of guide.animals.filter((a) => a.survey)) assert.ok(!animal.months.length && animal.season === 'Recorded in surveys', `${animal.common}: survey records claim no season`);
assert.ok(oceanSites.filter((site) => !S.seasonGuide(site).animals.length).length < 10, 'almost every ocean site has some marine life');
// Protected areas, seafloor and shore details: keyed to listed sites, sane values.
const PROTECTION = require(path.join(root, 'features/oceanAtlas/data/siteProtection.json'));
for (const [id, indexes] of Object.entries(PROTECTION.sites)) {
  assert.ok(listedIds.has(id) && indexes.length >= 1 && indexes.length <= 3 && indexes.every((i) => PROTECTION.areas[i]), `${id} protected areas`);
}
assert.ok(PROTECTION.areas.every(([name, kind, url]) => name && kind && /^https?:\/\//.test(url) && !/linefish|fishery|fishing/i.test(name)), 'protected areas are named, linked and not fishing zones');
const keysSite = everySite.find((site) => site.name === 'Molasses Reef');
assert.ok((PROTECTION.sites[keysSite.id] || []).some((i) => /Florida Keys National Marine Sanctuary/.test(PROTECTION.areas[i][0])), 'Molasses Reef lies in the Florida Keys sanctuary');
const SEAFLOOR = require(path.join(root, 'features/oceanAtlas/data/siteSeafloor.json')).sites;
for (const [id, [atPin, shallowest, deepest]] of Object.entries(SEAFLOOR)) {
  assert.ok(listedIds.has(id) && !IN.isInland(C.catalogSite(id)) && shallowest >= 0 && deepest >= shallowest && (atPin == null || (atPin >= shallowest && atPin <= deepest)), `${id} seafloor window is consistent`);
}
const SHORE = require(path.join(root, 'features/oceanAtlas/data/siteShore.json'));
for (const [id, row] of Object.entries(SHORE.sites)) {
  assert.ok(listedIds.has(id) && C.catalogSite(id).entry !== 'boat' && row.length === SHORE.fields.length && row.some((m) => m != null) && row.every((m) => m == null || (m >= 0 && m <= 250)), `${id} shore facilities within reach`);
}
// Depth without a published figure: fine seafloor, lake depths (published before modelled) and nearby sites.
const BATHY = require(path.join(root, 'features/oceanAtlas/data/siteBathymetry.json'));
for (const [id, [atPin, shallowest, deepest, source]] of Object.entries(BATHY.sites)) {
  assert.ok(listedIds.has(id) && !C.catalogSite(id).maxDepthMeters && BATHY.sources[source] && shallowest >= 0 && deepest >= shallowest && (atPin == null || (atPin >= shallowest && atPin <= deepest)), `${id} fine seafloor is consistent`);
}
const LAKES = require(path.join(root, 'features/oceanAtlas/data/siteLakeDepths.json'));
for (const [id, [max, mean, , source, url]] of Object.entries(LAKES.sites)) {
  assert.ok(listedIds.has(id) && !C.catalogSite(id).maxDepthMeters && max > 0 && ['wikidata', 'globathy'].includes(source), `${id} lake depth`);
  if (source === 'wikidata') assert.match(url, /^https:\/\/www\.wikidata\.org\/wiki\/Q\d+$/);
  else assert.ok(!mean || mean < max, `${id}: a modelled lake depth is self-consistent`);
}
const starnberg = Object.entries(LAKES.sites).filter(([, row]) => /Starnberg/i.test(row[2] || ''));
assert.ok(starnberg.length && starnberg.every(([, row]) => row[3] === 'wikidata' && Math.round(row[0]) === 127), 'Starnberger See uses its published 127 m, not the 32 m model');
const ND = loadSourceModule(path.join(root, 'features/oceanAtlas/nearbyDepths.js'), root);
const withNearby = everySite.filter((site) => !site.maxDepthMeters).map((site) => ND.nearbyDepths(site)).filter(Boolean);
assert.ok(withNearby.length > 300 && withNearby.every((n) => n.count >= 3 && n.low <= n.high && n.low > 0), 'nearby published depths give a typical range');
const thistlegorm = everySite.find((site) => /thistlegorm/i.test(site.name) && FACTS[site.id]?.[2]);
assert.ok(thistlegorm && FACTS[thistlegorm.id][2][6].some(([label, year]) => label === 'Sank' && year === '1941'), 'the Thistlegorm’s history says it sank in 1941');
console.log(`Journey checks passed: curated enrichment, generic destination resolution, territories, overland, remote access, flight prefill, seasons, ratings, inland guides, site photos, encyclopedia facts, survey marine life, protected areas, seafloor, lake and nearby depths, shore facilities, altitude rule, units, published depths, duplicate merging and all ${g.names.length} catalog sites.`);
