const assert = require('node:assert/strict');
const path = require('node:path');
const { loadSourceModule } = require('./lib/load-source-module.cjs');
const root = path.resolve(__dirname, '../src');
const { speciesIndex, speciesGuide, discoverSpecies } = loadSourceModule(path.join(root, 'features/oceanAtlas/species.js'), root);

const index = speciesIndex();
assert.ok(index.length > 1000, 'Every species with sightings or survey records is searchable.');
assert.equal(new Set(index.map(row => row[0])).size, index.length, 'Species keys are unique.');
const whale = index.find(row => row[2] === 'Rhincodon typus');
assert.ok(whale && whale[4] >= 10, 'Whale sharks are indexed with the places they were recorded.');
assert.ok(JSON.stringify(index).length < 150000, 'The index stays small enough to send to the map.');

const guide = speciesGuide(whale[0]);
assert.match(guide.common, /^whale shark$/i);
assert.ok(guide.places.length >= 10 && guide.placeCount >= guide.places.length);
assert.ok(guide.places.every((p, i, all) => i === 0 || all[i - 1].survey < p.survey || (all[i - 1].survey === p.survey && all[i - 1].records >= p.records)), 'Places rank seasonal sightings first, then by records.');
assert.ok(guide.places.some(p => p.sites.length), 'Sighting areas list the dive sites inside them.');
for (const place of guide.places) for (const site of place.sites) assert.ok(site.distanceKm <= place.radiusKm + 10);
assert.ok(guide.months && guide.months.length === 12 && Math.max(...guide.months) === 1, 'A monthly sighting profile, normalised.');
assert.ok(guide.curated.some(c => c.months.length), 'Sourced regional seasons are included.');
assert.equal(speciesGuide('nope'), null);
assert.equal(speciesGuide('999999999'), null);

const curatedOnly = index.find(row => row[0].startsWith('sci:'));
if (curatedOnly) assert.ok(speciesGuide(curatedOnly[0]).curated.length, 'Regional-guide species without sightings still open a guide.');

for (let month = 0; month < 12; month++) {
  const discover = discoverSpecies(month);
  assert.ok(discover.iconic.length >= 5, 'Bucket-list encounters with evidence.');
  assert.ok(discover.inSeason.every(pick => index.some(row => row[0] === pick.key) && pick.regionId));
  assert.equal(new Set(discover.inSeason.map(p => p.name)).size, discover.inSeason.length, 'One card per species.');
}
console.log(`Species checks passed: ${index.length} searchable species, whale shark in ${guide.placeCount} places with ${guide.places.reduce((n, p) => n + p.siteCount, 0)} nearby site matches, discover picks for every month.`);
