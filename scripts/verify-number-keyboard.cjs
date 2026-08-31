const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const projectRoot = path.join(__dirname, '..');
const helperPath = path.join(projectRoot, 'src', 'lib', 'numberKeyboard.js');
const helperSource = fs.readFileSync(helperPath, 'utf8')
  .replace(/export const (\w+) =/g, 'const $1 =')
  .replace(/export function (\w+)\(/g, 'function $1(')
  .concat('\nmodule.exports = { NUMBER_KEYBOARD_ACCESSORY_ID, usesNumberKeyboard };');

const sandbox = { module: { exports: {} }, exports: {} };
vm.runInNewContext(helperSource, sandbox, { filename: helperPath });
const { NUMBER_KEYBOARD_ACCESSORY_ID, usesNumberKeyboard } = sandbox.module.exports;

assert.equal(NUMBER_KEYBOARD_ACCESSORY_ID, 'dmz-number-keyboard-accessory');
for (const keyboardType of ['decimal-pad', 'number-pad', 'numeric', 'phone-pad']) {
  assert.equal(usesNumberKeyboard(keyboardType), true, `${keyboardType} should use the Done accessory`);
}
for (const keyboardType of ['default', 'email-address', 'visible-password', undefined]) {
  assert.equal(usesNumberKeyboard(keyboardType), false, `${keyboardType} should keep its native keyboard controls`);
}

const appSource = fs.readFileSync(path.join(projectRoot, 'App.js'), 'utf8');
const accountFormSource = fs.readFileSync(path.join(projectRoot, 'src', 'components', 'AccountForm.js'), 'utf8');
const calculatorSource = fs.readFileSync(path.join(projectRoot, 'src', 'screens', 'DiveCalculatorScreen.js'), 'utf8');

assert.match(appSource, /<NumberKeyboardAccessory\s*\/>/);
assert.match(accountFormSource, /inputAccessoryViewID=/);
assert.match(calculatorSource, /inputAccessoryViewID=/);

console.log('Number keyboard Done accessory checks passed.');
