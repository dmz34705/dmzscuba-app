const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const appSource = read('App.js');
const navigatorSource = read('src', 'application', 'AppNavigator.js');
const navigationSource = read('src', 'application', 'navigation.js');
const catalogSource = read('src', 'features', 'catalog', 'featureCatalog.js');
const accountControllerSource = read('src', 'features', 'account', 'useAccountSession.js');
const settingsControllerSource = read('src', 'features', 'settings', 'useAppSettings.js');
const tankSettingsSource = read('src', 'features', 'calculator', 'useTankProfileSettings.js');
const calculatorScreenSource = read('src', 'screens', 'DiveCalculatorScreen.js');
const homeSource = read('src', 'screens', 'HomeScreen.js');
const learnSource = read('src', 'screens', 'LearnScreen.js');
const toolsSource = read('src', 'screens', 'ToolsScreen.js');
const architectureSource = read('docs', 'ARCHITECTURE.md');

assert.ok(appSource.split(/\r?\n/).length <= 25, 'App.js should remain a small native entry point.');
assert.match(appSource, /AppNavigator/);
assert.doesNotMatch(appSource, /AsyncStorage|restoreSession|detailRoute|account-login|dive-calculator/);

assert.match(navigatorSource, /useAccountSession/);
assert.match(navigatorSource, /useAppSettings/);
assert.match(navigatorSource, /getFeature\(detailRoute\)/);
assert.match(navigatorSource, /APP_TABS/);
assert.doesNotMatch(navigatorSource, /AsyncStorage|SecureStore/);

assert.match(accountControllerSource, /restoreSession/);
assert.match(accountControllerSource, /profileFromAccount/);
assert.match(settingsControllerSource, /APP_SETTINGS_STORAGE_KEY/);
assert.match(settingsControllerSource, /sanitizeAppSettings/);
assert.match(tankSettingsSource, /TANK_STORAGE_KEY/);
assert.match(tankSettingsSource, /resolveTankProfile/);
assert.doesNotMatch(calculatorScreenSource, /AsyncStorage|TANK_STORAGE_KEY|DEFAULT_TANK_SETTINGS/);

const featureIds = [...catalogSource.matchAll(/\n\s+id: '([^']+)'/g)].map((match) => match[1]);
for (const requiredFeature of ['color-loss', 'boyles-law', 'dive-computer-simulator', 'dive-calculator', 'dive-lens', 'dive-log']) {
  assert.ok(featureIds.includes(requiredFeature), `The existing ${requiredFeature} feature must remain registered.`);
}
assert.equal(new Set(featureIds).size, featureIds.length, 'Feature catalog IDs must be unique.');
assert.match(navigatorSource, /DiveComputerSimulatorScreen/);
for (const field of ['area', 'routeType', 'title', 'summary', 'action']) {
  assert.equal((catalogSource.match(new RegExp(`\\b${field}:`, 'g')) || []).length, featureIds.length, `Every feature needs ${field}.`);
}

const tabSection = navigationSource.slice(navigationSource.indexOf('APP_TABS'), navigationSource.indexOf('ACCOUNT_ROUTES'));
const tabKeys = [...tabSection.matchAll(/key: '([^']+)'/g)].map((match) => match[1]);
assert.deepEqual(tabKeys, ['home', 'learn', 'tools', 'account', 'settings']);
assert.equal(new Set(tabKeys).size, tabKeys.length, 'Tab keys must be unique.');

assert.match(homeSource, /getFeaturedFeature/);
assert.match(homeSource, /getFeaturesByArea/);
assert.match(learnSource, /FeatureCatalogScreen/);
assert.match(toolsSource, /FeatureCatalogScreen/);
assert.doesNotMatch(learnSource, /color-loss|boyles-law/);
assert.doesNotMatch(toolsSource, /dive-calculator|dive-lens/);

assert.match(architectureSource, /Adding a lesson or tool/);
assert.match(architectureSource, /Regression expectations/);

console.log('App architecture checks passed.');
