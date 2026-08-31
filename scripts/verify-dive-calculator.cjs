const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sourcePath = path.join(__dirname, '..', 'src', 'lib', 'diveCalculator.js');
const source = fs.readFileSync(sourcePath, 'utf8')
  .replace(/export const (\w+) =/g, 'const $1 =')
  .replace(/export function (\w+)\(/g, 'function $1(')
  .concat(`
    module.exports = {
      WATER_VAPOR_BAR, absolutePressure, bankedBleedDown, bankedMixFill, bankedTopoff, bestMix, depthFromAbsolutePressure,
      equivalentAirDepth, equivalentNarcoticDepth, maximumOperatingDepth,
      observedRmvMetric, partialPressure, partialPressureBlend, requiredGas,
      requiredTopoffMix, schreinerTissue, zhl16cSnapshot
    };
  `);

const sandbox = { module: { exports: {} }, exports: {}, console };
vm.runInNewContext(source, sandbox, { filename: sourcePath });
const calc = sandbox.module.exports;
const near = (actual, expected, tolerance = 0.01) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} not within ${tolerance} of ${expected}`);

near(calc.absolutePressure(30, 'm'), 4);
near(calc.absolutePressure(99, 'ft'), 4);
near(calc.depthFromAbsolutePressure(4, 'm'), 30);
near(calc.partialPressure(32, 4), 1.28);
near(calc.maximumOperatingDepth(32, 1.4, 'm'), 33.75);
near(calc.bestMix(30, 1.4, 'm'), 35);
near(calc.equivalentAirDepth(30, 32, 'm'), 24.43);
near(calc.equivalentNarcoticDepth(45, 30, 'm'), 28.5);
near(calc.WATER_VAPOR_BAR, 0.0627, 0.00001);

const blend = calc.partialPressureBlend({ startPressure: 50, targetPressure: 232, startO2: 21, targetO2: 32 });
assert.equal(blend.feasible, true);
near(blend.oxygenAdded, 32.3, 0.02);
near(blend.airAdded, 149.7, 0.02);

const bleed = calc.partialPressureBlend({ startPressure: 150, targetPressure: 200, startO2: 36, targetO2: 32 });
assert.equal(bleed.feasible, true);
near(bleed.bleedToPressure, 146.67, 0.02);

const topoff = calc.requiredTopoffMix({ startPressure: 100, targetPressure: 200, startO2: 21, targetO2: 32 });
near(topoff.o2Percent, 43);

const bankTopoff = calc.bankedTopoff({
  receiverVolumeLiters: 11.1, startPressure: 100, targetPressure: 200, startO2: 32,
  bankVolumeLiters: 50, bankPressure: 300, bankO2: 36,
});
assert.equal(bankTopoff.feasible, true);
assert.equal(bankTopoff.pressureFeasible, true);
near(bankTopoff.finalO2Percent, 34);
near(bankTopoff.transferredSurfaceLiters, 1110);
near(bankTopoff.bankEndingPressure, 277.8);

const bankBleed = calc.bankedBleedDown({
  receiverVolumeLiters: 11.1, startPressure: 150, targetPressure: 200, startO2: 36, targetO2: 32,
  bankVolumeLiters: 50, bankPressure: 300, bankO2: 21,
});
assert.equal(bankBleed.feasible, true);
near(bankBleed.bleedToPressure, 146.67, 0.02);
near(bankBleed.finalO2Percent, 32, 0.01);
near(bankBleed.transferredSurfaceLiters, 592, 1);

const practicalBankFill = calc.bankedMixFill({
  receiverVolumeLiters: 13, pressureUnit: 'psi', startPressure: 725, targetPressure: 3000,
  startO2: 32, targetO2: 32, bankO2: 36,
});
assert.equal(practicalBankFill.feasible, true);
near(practicalBankFill.bleedToPressure, 725, 0.02);
near(practicalBankFill.bankFillPressure, 2393.33, 0.02);
near(practicalBankFill.airAddedPressure, 606.67, 0.02);
near(practicalBankFill.finalO2Percent, 32, 0.001);
near(practicalBankFill.bankSurfaceLiters, 1495.4, 0.2);

const preciseBankFill = calc.bankedMixFill({
  receiverVolumeLiters: 13, pressureUnit: 'psi', startPressure: 725, targetPressure: 3000,
  startO2: 32, targetO2: 32, bankO2: 36.4,
});
assert.equal(preciseBankFill.feasible, true);
near(preciseBankFill.bankFillPressure, 2350, 0.03);
assert.ok(Math.abs(preciseBankFill.bankFillPressure - practicalBankFill.bankFillPressure) > 40);

const practicalBleedFill = calc.bankedMixFill({
  receiverVolumeLiters: 11.1, pressureUnit: 'psi', startPressure: 1000, targetPressure: 3000,
  startO2: 21, targetO2: 32, bankO2: 36,
});
assert.equal(practicalBleedFill.feasible, true);
near(practicalBleedFill.bleedToPressure, 800, 0.02);
near(practicalBleedFill.bankFillPressure, 3000, 0.02);
near(practicalBleedFill.airAddedPressure, 0, 0.02);

const practicalTrimixFill = calc.bankedMixFill({
  receiverVolumeLiters: 11.1, pressureUnit: 'psi', startPressure: 1000, targetPressure: 3000,
  startO2: 32, startHe: 10, targetO2: 30.333333, targetHe: 11.666667, bankO2: 36, bankHe: 20,
});
assert.equal(practicalTrimixFill.feasible, true);
near(practicalTrimixFill.bleedToPressure, 500, 0.03);
near(practicalTrimixFill.bankFillPressure, 2000, 0.03);
near(practicalTrimixFill.finalHePercent, 11.666667, 0.001);

const rmv = calc.observedRmvMetric({ tankWaterVolumeLiters: 11.1, startBar: 200, endBar: 120, timeMinutes: 20, averageDepth: 18 });
near(rmv.rmvLitersPerMinute, 15.86, 0.02);
near(calc.requiredGas({ rmv: 18, depth: 30, timeMinutes: 20, contingencyPercent: 50 }).totalGas, 2160);

const snapshot = calc.zhl16cSnapshot({ depth: 30, bottomTime: 20, o2Percent: 32, gradientFactor: 85 });
near(snapshot.ppO2, 1.28);
assert.equal(snapshot.compartments.length, 16);
assert.ok(Number.isFinite(snapshot.ceiling));
assert.ok(snapshot.controlling.compartment >= 1 && snapshot.controlling.compartment <= 16);

console.log('Dive calculator checks passed.');
