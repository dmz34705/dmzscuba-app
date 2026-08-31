const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs
  .readFileSync(path.join(__dirname, '..', 'src', 'lib', 'divePhysics.js'), 'utf8')
  .replaceAll('export ', '');

const loadPhysics = new Function(`${source}\nreturn { pressureAtDepth, spectrumAtDepth, attenuateColor, boylesState };`);
const { pressureAtDepth, spectrumAtDepth, attenuateColor, boylesState } = loadPhysics();

assert.equal(pressureAtDepth(0), 1);
assert.equal(pressureAtDepth(10), 2);
assert.equal(pressureAtDepth(30), 4);

const compressed = boylesState(10, 1);
assert.equal(compressed.normalVolume, 0.5);
assert.equal(compressed.currentVolume, 0.5);

const inflatedAtDepthThenAscended = boylesState(0, pressureAtDepth(20));
assert.equal(inflatedAtDepthThenAscended.currentVolume, 3);
assert.equal(inflatedAtDepthThenAscended.overExpansion, 2);

const spectrum = spectrumAtDepth(20);
assert.ok(spectrum.red < spectrum.green);
assert.ok(spectrum.green < spectrum.blue);
assert.equal(attenuateColor('#FF3B30', 20, true), '#FF3B30');

console.log('Dive physics checks passed.');
