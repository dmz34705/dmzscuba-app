const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const packageJson = JSON.parse(read('package.json'));
const navigatorSource = read('src', 'application', 'AppNavigator.js');
const catalogSource = read('src', 'features', 'catalog', 'featureCatalog.js');
const screenSource = read('src', 'screens', 'DiveLensScreen.js');
const apiSource = read('src', 'lib', 'lensApi.js');
const { loadSourceModule } = require('./lib/load-source-module.cjs');
const { normalizeLensResult, lensDetailSections } = loadSourceModule(path.join(root, 'src/lib/lensResult.js'), path.join(root, 'src'));
const { photoCapturedAt, findDivePhotoMatches } = loadSourceModule(
  path.join(root, 'src/lib/diveLog/photoMatching.js'), path.join(root, 'src'),
);
const { buildLensContext } = loadSourceModule(
  path.join(root, 'src/features/diveLens/lensContext.js'), path.join(root, 'src'),
);
const { createDive } = loadSourceModule(
  path.join(root, 'src/lib/diveLog/schema.js'), path.join(root, 'src'),
);

assert.ok(packageJson.dependencies['expo-image-picker']);
assert.match(catalogSource, /id: 'dive-lens'/);
assert.match(catalogSource, /routeType: 'lens'/);
assert.match(navigatorSource, /feature\?\.routeType === 'lens'/);
assert.match(navigatorSource, /<DiveLensScreen onBack=\{closeDetail\}/);
assert.match(navigatorSource, /signedIn=\{accountSession\.authStatus === 'signedIn'\}/);
assert.match(screenSource, /requestCameraPermissionsAsync/);
assert.match(screenSource, /launchImageLibraryAsync/);
assert.match(screenSource, /identifyPhoto/);
assert.match(apiSource, /\/api\/vision\/identify/);
assert.match(apiSource, /AbortController/);
assert.match(apiSource, /normalizeLensResult/);
assert.match(apiSource, /getAccessToken/);
assert.match(apiSource, /Authorization: `Bearer \$\{token\}`/);
assert.match(apiSource, /X-DMZ-Request-ID/);
assert.match(apiSource, /context/);
assert.match(apiSource, /createAiRequestId/);
assert.match(screenSource, /Sign in to use Dive Lens/);
assert.match(screenSource, /<LensDetails result=\{result\}/);

for (const invalid of [null, [], 'fish', {}, { category: 'gear', commonName: {} }]) assert.equal(normalizeLensResult(invalid), null);
const legacy = normalizeLensResult({ category: 'marine_life', commonName: 'Reef fish', description: 'Original server response' });
assert.equal(legacy.confidence, 'low');
assert.deepEqual(lensDetailSections(legacy), []);
assert.deepEqual(legacy.evidence, []);
const gear = normalizeLensResult({ category: 'gear', commonName: 'Back-inflate BCD', confidence: 'high', identificationLevel: 'subtype',
  scientificName: 'Wrong category', marineLife: { diet: 'discard' }, gear: {
    component: 'BCD', subtype: 'Back-inflate', manufacturer: 'Possible brand', manufacturerConfidence: 'low',
    model: 'Unsupported model', modelConfidence: 'low', markings: ['ABC', {}, null], visibleFeatures: ['Rear bladder'],
  }, evidence: ['Rear bladder', 1, null], alternatives: [{ name: 'Jacket BCD', distinction: 'Check the bladder around the waist' }, {}, null] });
assert.equal(gear.gear.model, null);
assert.equal(gear.gear.manufacturer, null);
assert.equal(gear.scientificName, null);
assert.equal(gear.marineLife, null);
assert.deepEqual(gear.gear.markings, ['ABC']);
assert.equal(gear.alternatives.length, 1);
assert.equal(lensDetailSections(gear)[0].rows[3].value, 'Not identified from this photo');
const labeled = normalizeLensResult({ category: 'gear', commonName: 'BCD', gear: { model: 'Readable model', modelConfidence: 'high' } });
assert.equal(labeled.gear.model, 'Readable model');
const marine = normalizeLensResult({ category: 'marine_life', commonName: 'Fish', identificationLevel: 'group', gear: { component: 'wrong' },
  marineLife: { typicalSize: null, depthRange: '5–30 m', habitat: { bad: true }, diet: 'Small invertebrates' } });
assert.equal(marine.gear, null);
assert.equal(lensDetailSections(marine)[0].rows[2].value, 'Not established');
assert.equal(lensDetailSections(marine)[0].rows[3].value, '5–30 m');
assert.equal(marine.marineLife.habitat, null);
const unclear = normalizeLensResult({ category: 'unclear', commonName: 'Unidentified', gear: { model: 'wrong' }, marineLife: { diet: 'wrong' }, evidence: Array(20).fill('x'.repeat(900)) });
assert.equal(unclear.gear, null);
assert.equal(unclear.marineLife, null);
assert.equal(unclear.evidence.length, 5);
assert.equal(unclear.evidence[0].length, 600);

const normalizedPhotoDive = createDive({
  photos: [{
    id: 'asset-1',
    uri: 'ph://asset-1',
    assetId: 'asset-1',
    capturedAt: '2026-09-05T15:30:00.000Z',
    linkedAt: '2026-09-05T17:00:00.000Z',
    source: 'dive-lens',
  }],
});
assert.equal(normalizedPhotoDive.photos.length, 1);
assert.equal(normalizedPhotoDive.photos[0].assetId, 'asset-1');

const dive = {
  id: 'dive-1',
  startTime: '2026-09-05T15:00:00.000Z',
  durationSeconds: 3600,
  site: { name: 'Test Quarry' },
};
assert.equal(photoCapturedAt({ creationTime: 1757084400000 }), '2025-09-05T15:00:00.000Z');
const inside = findDivePhotoMatches({ creationTime: Date.parse(dive.startTime) + 1800000 }, [dive]);
assert.equal(inside[0].confidence, 'high');
const buffered = findDivePhotoMatches({ creationTime: Date.parse(dive.startTime) - 30 * 60000 }, [dive]);
assert.equal(buffered[0].confidence, 'medium');
const outside = findDivePhotoMatches({ creationTime: Date.parse(dive.startTime) - 91 * 60000 }, [dive]);
assert.equal(outside.length, 0);

const lakeSuperior = buildLensContext({
  startTime: '2026-10-15T12:00:00.000Z',
  site: { name: 'Lake Superior', latitude: 46.46, longitude: -86.6 },
  water: { type: 'fresh' },
});
assert.equal(lakeSuperior.waterType, 'fresh');
assert.equal(lakeSuperior.month, 10);
assert.ok(lakeSuperior.nearbySpecies.some((item) => item.scientificName === 'Lota lota' && item.commonName === 'Burbot'));
assert.equal('latitude' in lakeSuperior, false, 'Exact coordinates are not sent as Lens context.');

// Dive computer salinity is a device setting, not evidence about the water.
const importedSalt = { startTime: '2026-07-29T23:00:00.000Z', source: 'computer', logIds: ['log-1'], primaryLogId: 'log-1' };
assert.equal(buildLensContext({ ...importedSalt, water: { type: 'salt' } }).waterType, 'unknown');
assert.equal(buildLensContext({ ...importedSalt, water: { type: 'salt' }, site: { name: 'Gilboa Quarry' } }).waterType, 'fresh');
assert.equal(buildLensContext({ ...importedSalt, source: 'manual', water: { type: 'salt' } }).waterType, 'unknown', 'An attached log makes the type device-derived.');
// Once the diver confirms the water type in the log, Dive Lens trusts it.
assert.equal(buildLensContext({ ...importedSalt, water: { type: 'fresh', typeConfirmed: true } }).waterType, 'fresh');
assert.equal(buildLensContext({ ...importedSalt, water: { type: 'salt', typeConfirmed: true } }).waterType, 'salt');
// A water type the diver logged by hand is still trusted, even with a lake-like name.
assert.equal(buildLensContext({ startTime: '2026-07-29T23:00:00.000Z', site: { name: 'Blue Heron Bridge, Lake Worth' }, water: { type: 'salt' } }).waterType, 'salt');

console.log('Dive Lens integration checks passed.');
