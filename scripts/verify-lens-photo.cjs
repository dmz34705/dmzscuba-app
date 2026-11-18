const assert = require('node:assert/strict');
const { loadSourceModule } = require('./lib/load-source-module.cjs');
const { prepareLensPhoto, MAX_LENS_IMAGE_CHARS } = loadSourceModule('./src/features/diveLens/preparePhoto.js', './src');

function engine(width, height, sizes = [100], fail = false) {
  const resize = [], released = [];
  let saves = 0;
  const context = {
    reset() {}, resize(value) { resize.push(value); }, release() { released.push('context'); },
    async renderAsync() {
      return { width, height, release() { released.push('image'); }, async saveAsync(options) {
        assert.equal(options.format, 'jpeg');
        if (fail) throw new Error('Decode failure');
        return { base64: 'a'.repeat(sizes[Math.min(saves++, sizes.length - 1)]) };
      } };
    },
  };
  return { resize, released, ImageManipulator: { manipulate: () => context }, SaveFormat: { JPEG: 'jpeg' } };
}
(async () => {
  for (const [w, h, expected] of [[6000, 4000, { width: 1280 }], [4000, 6000, { height: 1280 }]]) {
    const native = engine(w, h);
    const result = await prepareLensPhoto({ uri: 'file://original', capturedAt: 'saved-time' }, native);
    assert.deepEqual(native.resize, [expected]);
    assert.equal(result.uri, 'file://original');
    assert.equal(result.capturedAt, 'saved-time');
    assert.equal(result.mimeType, 'image/jpeg');
    assert.equal(native.released.length, 3);
  }
  const small = engine(640, 480);
  await prepareLensPhoto({ uri: 'file://small', width: 9000 }, small);
  assert.deepEqual(small.resize, [], 'Use decoded dimensions; do not upscale small images.');
  const retry = engine(6000, 4000, [MAX_LENS_IMAGE_CHARS + 1, 100]);
  await prepareLensPhoto({ uri: 'file://large' }, retry);
  assert.deepEqual(retry.resize, [{ width: 1280 }, { width: 960 }]);
  const oversized = engine(6000, 4000, [MAX_LENS_IMAGE_CHARS + 1]);
  await assert.rejects(prepareLensPhoto({ uri: 'file://large' }, oversized), /could not be reduced/);
  assert.equal(oversized.released.length, 4);
  const failed = engine(1000, 1000, [100], true);
  await assert.rejects(prepareLensPhoto({ uri: 'file://broken' }, failed), /Decode failure/);
  assert.equal(failed.released.length, 3);
  console.log('Lens photo preparation checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
