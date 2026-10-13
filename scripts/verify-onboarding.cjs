const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const navigator = fs.readFileSync(path.join(root, 'src/application/AppNavigator.js'), 'utf8');
const setup = fs.readFileSync(path.join(root, 'src/features/onboarding/FirstTimeSetup.js'), 'utf8');
const settings = fs.readFileSync(path.join(root, 'src/screens/SettingsScreen.js'), 'utf8');
const settingsHook = fs.readFileSync(path.join(root, 'src/features/settings/useAppSettings.js'), 'utf8');

assert.match(navigator, /firstTimeSetup\?\.status === 'pending'/, 'Automatic setup is gated only by the local pending state.');
assert.doesNotMatch(navigator, /firstTimeSetup\?\.version[^\n]*CURRENT_SETUP_VERSION/, 'An app version change cannot reopen setup.');
assert.match(navigator, /onSignIn=\{accountSession\.signIn\}/, 'Setup uses the normal account sign-in and preference-loading path.');
assert.match(setup, /Already use DMZ Scuba\?/);
assert.match(setup, /Continue without an account/);
assert.match(setup, /Skip personal setup\?/);
assert.match(setup, /personalized gas estimates, exposure guidance, site suggestions/);
assert.match(setup, /Set temperature preferences now/);
assert.match(setup, /Do this later/);
assert.match(setup, /Choose gear and temperature ranges/);
assert.match(settings, /Run personal setup/);
assert.match(settings, /Temperature & gear preferences/);
assert.match(settingsHook, /hydrateAppSettings\(JSON\.parse\(stored\)\)/, 'Stored legacy settings are distinguished from empty fresh-install storage.');

console.log('Onboarding checks passed: one-time install gate, sign-in, explicit skip, and manual rerun.');
