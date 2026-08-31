const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sourcePath = path.join(__dirname, '..', 'src', 'lib', 'tankProfiles.js');
const source = fs.readFileSync(sourcePath, 'utf8')
  .replace(/export const (\w+) =/g, 'const $1 =')
  .replace(/export function (\w+)\(/g, 'function $1(')
  .concat(`
    module.exports = {
      CUBIC_FOOT_LITERS, DEFAULT_TANK_SETTINGS, PSI_PER_BAR, TANK_PRESETS,
      ratedCapacityFromWaterVolume, resolveTankProfile, sanitizeTankSettings,
      servicePressurePsiFromSettings, tankBasisText, tankCapacityLiters,
      waterVolumeFromRatedCapacity
    };
  `);

const sandbox = { module: { exports: {} }, exports: {}, console };
vm.runInNewContext(source, sandbox, { filename: sourcePath });
const tanks = sandbox.module.exports;
const near = (actual, expected, tolerance = 0.01) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} not within ${tolerance} of ${expected}`);

assert.equal(tanks.TANK_PRESETS.length, 5);
const lp85 = tanks.resolveTankProfile({ ...tanks.DEFAULT_TANK_SETTINGS, selectedId: 'lp85' });
assert.equal(lp85.name, 'LP85');
near(lp85.ratedCapacityCuFt, 85);
near(lp85.servicePressurePsi, 2640);
near(lp85.waterVolumeLiters, 13);
const al80 = tanks.resolveTankProfile({ ...tanks.DEFAULT_TANK_SETTINGS, selectedId: 'al80' });
assert.equal(al80.name, 'AL80');
near(al80.ratedCapacityCuFt, 77.4);
near(al80.servicePressurePsi, 3000);
near(al80.waterVolumeLiters, 11.1);

const customCubicFeet = tanks.resolveTankProfile({
  ...tanks.DEFAULT_TANK_SETTINGS,
  customName: 'Stage 80',
  customRatedCapacityCuFt: '80',
  customServicePressurePsi: '3000',
  customSizeUnit: 'ft³',
  selectedId: 'custom',
});
near(customCubicFeet.waterVolumeLiters, 10.95, 0.01);
near(tanks.tankCapacityLiters(customCubicFeet), 2265.35, 0.02);
assert.match(tanks.tankBasisText(customCubicFeet), /Stage 80 .*approx\. 80\.0 ft³ @ 3,000 psi.*11\.0 L water volume/);

const customLiters = tanks.resolveTankProfile({
  ...tanks.DEFAULT_TANK_SETTINGS,
  customServicePressurePsi: '3442',
  customSizeUnit: 'L',
  customWaterVolumeLiters: '12.9',
  selectedId: 'custom',
});
near(customLiters.waterVolumeLiters, 12.9);
near(customLiters.ratedCapacityCuFt, tanks.ratedCapacityFromWaterVolume(12.9, 3442));

const customBar = tanks.resolveTankProfile({
  ...tanks.DEFAULT_TANK_SETTINGS,
  customRatedCapacityCuFt: '80',
  customServicePressureBar: '207',
  customServicePressureUnit: 'bar',
  customSizeUnit: 'ft³',
  selectedId: 'custom',
});
near(customBar.servicePressurePsi, 3002.28, 0.02);
near(customBar.waterVolumeLiters, 10.94, 0.01);
near(tanks.servicePressurePsiFromSettings({ ...tanks.DEFAULT_TANK_SETTINGS, customServicePressureBar: '232', customServicePressureUnit: 'bar' }), 3364.88, 0.02);

assert.equal(tanks.sanitizeTankSettings({ selectedId: 'not-a-real-tank' }).selectedId, 'al80');

console.log('Tank profile checks passed.');
