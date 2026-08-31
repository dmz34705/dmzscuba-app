const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sourcePath = path.join(__dirname, '..', 'src', 'lib', 'accountProfile.js');
const source = fs.readFileSync(sourcePath, 'utf8')
  .replace(/export const (\w+) =/g, 'const $1 =')
  .replace(/export function (\w+)\(/g, 'function $1(')
  .concat('\nmodule.exports = { DEFAULT_PROFILE, validateCreateAccount, validateEmail, validateLogin, validateProfile };');

const sandbox = { module: { exports: {} }, exports: {} };
vm.runInNewContext(source, sandbox, { filename: sourcePath });
const account = sandbox.module.exports;

assert.equal(account.validateEmail('diver@example.com'), true);
assert.equal(account.validateEmail('not-an-email'), false);
assert.equal(account.validateLogin({ email: 'diver@example.com', password: 'password' }), '');
assert.match(account.validateLogin({ email: 'bad', password: 'password' }), /valid email/);
assert.equal(account.validateCreateAccount({ firstName: 'Sam', lastName: 'Diver', email: 'sam@example.com', password: 'dive-secure-12', confirmPassword: 'dive-secure-12' }), '');
assert.match(account.validateCreateAccount({ firstName: 'Sam', lastName: '', email: 'sam@example.com', password: 'dive-secure-12', confirmPassword: 'dive-secure-12' }), /first and last name/);
assert.match(account.validateCreateAccount({ firstName: 'Sam', lastName: 'Diver', email: 'sam@example.com', password: 'short', confirmPassword: 'short' }), /12 characters/);
assert.match(account.validateCreateAccount({ firstName: 'Sam', lastName: 'Diver', email: 'sam@example.com', password: 'dive-secure-12', confirmPassword: 'different-value' }), /do not match/);
assert.equal(account.validateProfile({ firstName: 'Sam', lastName: 'Diver', loggedDives: '42', defaultPpO2: '1.4', defaultRmv: '18' }), '');
assert.match(account.validateProfile({ firstName: 'Sam', lastName: 'Diver', loggedDives: '-1', defaultPpO2: '1.4', defaultRmv: '18' }), /Logged dives/);
assert.equal(account.DEFAULT_PROFILE.defaultPpO2, '1.4');
assert.equal(account.DEFAULT_PROFILE.defaultRmv, '18');

console.log('Account profile checks passed.');
