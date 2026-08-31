const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sourcePath = path.join(__dirname, '..', 'src', 'lib', 'demoIntegration.js');
const source = fs.readFileSync(sourcePath, 'utf8')
  .replace(/export const (\w+) =/g, 'const $1 =')
  .concat('\nmodule.exports = { COLOR_LOSS_INTEGRATION_SCRIPT, BOYLES_INTEGRATION_SCRIPT };');

const sandbox = { module: { exports: {} }, exports: {} };
vm.runInNewContext(source, sandbox, { filename: sourcePath });

const { COLOR_LOSS_INTEGRATION_SCRIPT, BOYLES_INTEGRATION_SCRIPT } = sandbox.module.exports;

assert.doesNotThrow(() => new Function(COLOR_LOSS_INTEGRATION_SCRIPT));
assert.doesNotThrow(() => new Function(BOYLES_INTEGRATION_SCRIPT));
assert.match(COLOR_LOSS_INTEGRATION_SCRIPT, /height: 100dvh/);
assert.match(BOYLES_INTEGRATION_SCRIPT, /Step 2 of 2: tap the glowing INFLATE button/);
assert.match(BOYLES_INTEGRATION_SCRIPT, /dmz-app-target-inflate/);

console.log('Demo integration checks passed.');