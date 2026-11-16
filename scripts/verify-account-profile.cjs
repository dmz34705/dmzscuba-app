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
assert.equal(account.validateProfile({ firstName: 'Sam', lastName: 'Diver' }), '');
assert.equal(account.DEFAULT_PROFILE.loggedDives, undefined);
assert.equal(account.DEFAULT_PROFILE.defaultPpO2, undefined);
assert.equal(account.DEFAULT_PROFILE.defaultRmv, undefined);
const profileScreen = fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', 'ProfileScreen.js'), 'utf8');
assert.doesNotMatch(profileScreen, /label="Logged dives"|label="Working ppO₂"|label="Planning RMV"/);
assert.match(profileScreen, /label="Certifications"/);


console.log('Account profile checks passed.');

// Account deletion (App Store requirement): synced records are deleted before the login.
{
  const fs = require('node:fs');
  const api = fs.readFileSync(require('node:path').join(__dirname, '../src/lib/accountApi.js'), 'utf8');
  const body = api.slice(api.indexOf('export async function deleteOwnAccount'));
  assert.ok(body.indexOf("syncAccountRequest('', { method: 'DELETE' }") < body.indexOf("accountRequest('/api/account', { method: 'DELETE'"), 'sync records are deleted first');
  const screen = fs.readFileSync(require('node:path').join(__dirname, '../src/screens/AccountScreen.js'), 'utf8');
  assert.match(screen, /title=\{deleting \? 'Deleting account…' : 'Delete account'\}/);
  assert.match(screen, /can’t be undone/);
  console.log('Account deletion checks passed.');
}

