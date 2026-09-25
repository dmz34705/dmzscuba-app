const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sourcePath = path.join(__dirname, '..', 'src', 'lib', 'appSettings.js');
const source = fs.readFileSync(sourcePath, 'utf8')
  .replace(/export const (\w+) =/g, 'const $1 =')
  .replace(/export function (\w+)\(/g, 'function $1(')
  .concat('\nmodule.exports = { ACCOUNT_SYNCED_SETTINGS, APP_SETTINGS_STORAGE_KEY, DEFAULT_APP_SETTINGS, DEFAULT_PROFILE_COLORS, mergeAccountSettings, sanitizeAppSettings };');

const sandbox = { module: { exports: {} }, exports: {} };
vm.runInNewContext(source, sandbox, { filename: sourcePath });
const settings = sandbox.module.exports;

assert.deepEqual({ ...settings.DEFAULT_APP_SETTINGS }, { depthUnit: 'ft', gasVolumeUnit: 'ft³', pressureUnit: 'psi', temperatureUnit: 'F', trimixMode: false, locationLoggingEnabled: false, profileColors: settings.DEFAULT_PROFILE_COLORS, profileLineWidth: 2.75 });
assert.deepEqual({ ...settings.sanitizeAppSettings({ depthUnit: 'm', gasVolumeUnit: 'L', pressureUnit: 'bar', temperatureUnit: 'C', trimixMode: true }) }, { depthUnit: 'm', gasVolumeUnit: 'L', pressureUnit: 'bar', temperatureUnit: 'C', trimixMode: true, locationLoggingEnabled: false, profileColors: settings.DEFAULT_PROFILE_COLORS, profileLineWidth: 2.75 });
assert.equal(settings.sanitizeAppSettings({ trimixMode: 'yes' }).trimixMode, false);
assert.equal(settings.sanitizeAppSettings({ depthUnit: 'yards' }).depthUnit, 'ft');
assert.equal(settings.sanitizeAppSettings({ gasVolumeUnit: 'gallons' }).gasVolumeUnit, 'ft³');
assert.equal(settings.sanitizeAppSettings({ profileColors: { depth: '#123456' } }).profileColors.depth, '#123456');
assert.equal(settings.sanitizeAppSettings({ profileColors: { depth: 'red' } }).profileColors.depth, settings.DEFAULT_PROFILE_COLORS.depth);
assert.equal(settings.sanitizeAppSettings({ profileLineWidth: 9 }).profileLineWidth, 2.75);

// Account sync updates units and trimix only; this phone's location logging and graph styling survive
// (they used to reset on every sign-in and app reload because the account has no such fields).
const phone = settings.sanitizeAppSettings({ depthUnit: 'ft', locationLoggingEnabled: true, profileColors: { depth: '#123456' }, profileLineWidth: 4 });
const account = settings.sanitizeAppSettings({ depthUnit: 'm', temperatureUnit: 'C', trimixMode: true });
const merged = settings.mergeAccountSettings(phone, account);
assert.equal(merged.locationLoggingEnabled, true, 'Background location stays on after account sync.');
assert.equal(merged.profileColors.depth, '#123456');
assert.equal(merged.profileLineWidth, 4);
assert.equal(merged.depthUnit, 'm', 'Account units still apply.');
assert.equal(merged.temperatureUnit, 'C');
assert.equal(merged.trimixMode, true);
assert.equal(settings.mergeAccountSettings(phone, { depthUnit: 'm' }).pressureUnit, 'psi', 'Missing account fields leave the phone value alone.');
assert.equal(settings.mergeAccountSettings(phone, null).locationLoggingEnabled, true);
assert.equal(settings.mergeAccountSettings({ locationLoggingEnabled: false }, { locationLoggingEnabled: true }).locationLoggingEnabled, false, 'The account can never switch location logging on either.');
assert.deepEqual([...settings.ACCOUNT_SYNCED_SETTINGS], ['depthUnit', 'gasVolumeUnit', 'pressureUnit', 'temperatureUnit', 'trimixMode']);

console.log('App settings checks passed.');
