const assert = require('node:assert/strict');
const path = require('node:path');
const { loadSourceModule } = require('./lib/load-source-module.cjs');
const root = path.join(__dirname, '..');
const model = loadSourceModule(path.join(root, 'src/features/colorLoss/model.js'), path.join(root, 'src'));
const { colorMatrix, transformColor, spectrum, sceneColor, beamStrength, PALETTE } = model;
for (const color of PALETTE) {
  assert.equal(transformColor(color, colorMatrix(0)), color.toLowerCase(), 'At zero depth the camera/scene transform must be identity.');
}
for (const depth of [5, 10, 20, 40]) {
  const [r, g, b] = spectrum(depth);
  assert.ok(r < g && g < b, 'Red must attenuate faster than green and blue.');
  assert.ok(spectrum(depth, 2.2).every((value, i) => value < spectrum(depth, 1)[i]), 'Murky water must attenuate more.');
  assert.ok(colorMatrix(depth).every(Number.isFinite));
}
assert.deepEqual(colorMatrix(-10), colorMatrix(0));
assert.deepEqual(colorMatrix(100), colorMatrix(40));
assert.equal(beamStrength(20, 20, null), 0);
assert.equal(beamStrength(20, 20, { x: 20, y: 20 }), 1);
assert.equal(beamStrength(150, 20, { x: 20, y: 20 }), 0);
assert.ok(beamStrength(70, 20, { x: 20, y: 20 }) > 0);
assert.equal(sceneColor('#FF0000', 30, 1, 0), transformColor('#FF0000', colorMatrix(30)));
assert.ok(model.rgb(sceneColor('#FF0000', 30, 1, 1))[0] > model.rgb(sceneColor('#FF0000', 30, 1, 0))[0] * 5, 'Nearby light restores red instead of merely adding a white overlay.');
assert.equal(sceneColor('#FF0000', 10, 1, 1), sceneColor('#FF0000', 40, 1, 1), 'A nearby lamp light path does not grow with surface depth.');
console.log('Native color-loss model checks passed.');
