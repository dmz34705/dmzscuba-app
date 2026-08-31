const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sourcePath = path.join(__dirname, '..', 'src', 'lib', 'appSettings.js');
const source = fs.readFileSync(sourcePath, 'utf8')
  .replace(/export const (\w+) =/g, 'const $1 =')
  .replace(/export function (\w+)\(/g, 'function $1(')
  .concat('\nmodule.exports = { APP_SETTINGS_STORAGE_KEY, DEFAULT_APP_SETTINGS, sanitizeAppSettings };');

const sandbox = { module: { exports: {} }, exports: {} };
vm.runInNewContext(source, sandbox, { filename: sourcePath });
const settings = sandbox.module.exports;

assert.deepEqual({ ...settings.DEFAULT_APP_SETTINGS }, { depthUnit: 'ft', gasVolumeUnit: 'ft³', pressureUnit: 'psi', temperatureUnit: 'F', trimixMode: false });
assert.deepEqual({ ...settings.sanitizeAppSettings({ depthUnit: 'm', gasVolumeUnit: 'L', pressureUnit: 'bar', temperatureUnit: 'C', trimixMode: true }) }, { depthUnit: 'm', gasVolumeUnit: 'L', pressureUnit: 'bar', temperatureUnit: 'C', trimixMode: true });
assert.equal(settings.sanitizeAppSettings({ trimixMode: 'yes' }).trimixMode, false);
assert.equal(settings.sanitizeAppSettings({ depthUnit: 'yards' }).depthUnit, 'ft');
assert.equal(settings.sanitizeAppSettings({ gasVolumeUnit: 'gallons' }).gasVolumeUnit, 'ft³');

console.log('App settings checks passed.');
