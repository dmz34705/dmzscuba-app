const assert = require('node:assert/strict');
const path = require('node:path');
const { loadSourceModule } = require('./lib/load-source-module.cjs');
const root = path.resolve(__dirname, '../src');
const P = loadSourceModule(path.join(root, 'features/oceanAtlas/places.js'), root);
const { catalogSites } = loadSourceModule(path.join(root, 'features/oceanAtlas/catalog.js'), root);

const at = (latitude, longitude) => P.placeAt(latitude, longitude);

// Islands resolve before countries, with their own country (catalog label, or territory).
const cozumel = at(20.42, -86.92);
assert.equal(cozumel.kind, 'island');
assert.match(cozumel.name, /Cozumel/);
assert.equal(cozumel.country, 'MX');
const cozumelGuide = P.placeGuide(cozumel);
assert.ok(cozumelGuide.siteIds.includes('mx-cozumel-paraiso'), 'Curated Cozumel reefs belong to the island.');
assert.deepEqual(cozumelGuide.parents.map(p => p.id), ['MX']);
assert.ok(cozumelGuide.season.highlights.some(h => h.label === 'Dec–Mar'), 'Eagle ray season on the island guide.');
assert.ok(cozumelGuide.outline.length && cozumelGuide.journey);
assert.match(at(16.35, -86.5)?.name || '', /Roat/);
assert.equal(at(12.2, -68.26)?.country, 'BQ', 'Bonaire keeps its catalog country.');
assert.equal(at(15.42, -61.35)?.country, 'DM');
const puertoRico = at(18.2, -66.5);
assert.equal(puertoRico.country, 'PR', 'Puerto Rico is a territory, not a Florida island.');
assert.ok(!P.parentsOf(puertoRico).some(p => p.kind === 'state'));

// US mainland taps open states; the country guide lists them.
const florida = at(27.8, -81.6);
assert.equal(florida.kind, 'state');
assert.equal(florida.id, 'US-FL');
const floridaGuide = P.placeGuide(florida);
assert.ok(floridaGuide.siteIds.some(id => id.startsWith('noaa-fknms-')), 'Offshore Keys moorings belong to Florida.');
assert.deepEqual(floridaGuide.parents.map(p => p.id), ['US']);
assert.ok(floridaGuide.character.total > 50 && floridaGuide.character.summary);
assert.ok(P.placeGuide(P.placeById('country', 'US')).children.some(child => child.id === 'US-FL'));
assert.equal(at(0, -140), null, 'Open ocean is not a place.');

// Every catalog site has a country; site breadcrumbs name island › country.
const all = catalogSites();
const assigned = new Set(['country'].flatMap(kind => [...all].filter(site => P.placesForSite(site.id).some(p => p.kind === kind)).map(site => site.id)));
const misplaced = P.misplacedSites();
assert.ok(misplaced.length <= 5, `${misplaced.length} catalog records sit far inland from their listed country`);
assert.equal(assigned.size + misplaced.length, all.length, `${all.length - assigned.size - misplaced.length} sites without a country`);
assert.equal(P.sitesIn(P.placeById('country', 'TD')).length, 0, 'A mislocated marine record does not become a Chad dive site.');
assert.deepEqual(P.placesForSite('mx-cozumel-paraiso').map(p => p.kind), ['island', 'country']);

const { OCEAN_REGIONS } = loadSourceModule(path.join(root, 'features/oceanAtlas/oceanRegions.js'), root);
for (const region of OCEAN_REGIONS.filter(r => r.id !== 'arctic')) assert.ok(P.regionGuide('province', region.id).season.animals.length >= 5, `${region.name} guide has marine life`);
assert.deepEqual(P.regionGuide('province', 'caribbean').destinations.slice(0, 1).map(d => d.name), ['Bonaire']);
// Quick look: local life with photos, open-water fallback to the ocean lens, nearby diving.
const kona = P.quickLook(19.7, -156.1);
assert.ok(kona.local && kona.animals.length === 4 && kona.animals.every(animal => animal.photo?.url));
assert.ok(kona.nearby > 0 && kona.nearest?.km <= 50 && kona.temps.length === 12);
const openCaribbean = P.quickLook(15, -75);
assert.ok(openCaribbean.lens === 'Caribbean Sea' || openCaribbean.nearArea !== undefined, 'Open water shows nearby life or the ocean lens.');
assert.ok(openCaribbean.animals.length > 0 && openCaribbean.nearby === 0);
assert.equal(P.quickLook(20.42, -86.92).animals[0].common, 'Spotted eagle ray', 'Sourced local highlights lead the quick look.');
// Inland taps summarise the whole place instead of a misleading "0 sites within 50 km".
for (const [latitude, longitude, minimum] of [[23.6, -102.5, 100], [-10, -52, 100], [-25, 134, 200]]) {
  const look = P.quickLook(latitude, longitude);
  assert.equal(look.scope, 'place');
  assert.ok(look.placeSites >= minimum && look.animals.length && look.nearest, `${look.place?.name} quick look summarises its dive sites`);
}
assert.ok(P.placeGuide(P.placeById('country', 'AU')).season.temps, 'Continent-sized guides still get a coastal temperature profile.');
console.log(`Place checks passed: ${P.placeGuide(P.placeById('country', 'US')).children.length} US states/islands, islands before countries, territories, offshore membership, quick looks and all ${all.length} sites placed.`);
