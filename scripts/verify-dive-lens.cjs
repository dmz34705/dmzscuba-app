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

assert.ok(packageJson.dependencies['expo-image-picker']);
assert.match(catalogSource, /id: 'dive-lens'/);
assert.match(catalogSource, /routeType: 'lens'/);
assert.match(navigatorSource, /feature\?\.routeType === 'lens'/);
assert.match(navigatorSource, /<DiveLensScreen onBack=\{closeDetail\}/);
assert.match(screenSource, /requestCameraPermissionsAsync/);
assert.match(screenSource, /launchImageLibraryAsync/);
assert.match(screenSource, /identifyPhoto/);
assert.match(apiSource, /\/api\/vision\/identify/);
assert.match(apiSource, /AbortController/);

console.log('Dive Lens integration checks passed.');
