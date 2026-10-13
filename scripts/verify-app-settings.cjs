const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const sourcePath = path.join(__dirname, '..', 'src', 'lib', 'appSettings.js');
const { loadSourceModule } = require('./lib/load-source-module.cjs');
const settings = loadSourceModule(sourcePath, path.join(__dirname, '..', 'src'));

assert.equal(settings.DEFAULT_APP_SETTINGS.depthUnit, 'ft');
assert.equal(settings.DEFAULT_APP_SETTINGS.firstTimeSetup.status, 'pending');
assert.equal(settings.DEFAULT_APP_SETTINGS.firstTimeSetup.version, 0);
assert.equal(settings.DEFAULT_APP_SETTINGS.diveBaseline.sacBarPerMin, null);
const metric = settings.sanitizeAppSettings({ depthUnit: 'm', gasVolumeUnit: 'L', pressureUnit: 'bar', temperatureUnit: 'C', trimixMode: true });
assert.equal(metric.depthUnit, 'm');
assert.equal(metric.gasVolumeUnit, 'L');
assert.equal(metric.pressureUnit, 'bar');
assert.equal(metric.temperatureUnit, 'C');
assert.equal(metric.trimixMode, true);
assert.equal(metric.firstTimeSetup.status, 'pending');
assert.equal(settings.sanitizeAppSettings({ trimixMode: 'yes' }).trimixMode, false);
assert.equal(settings.sanitizeAppSettings({ depthUnit: 'yards' }).depthUnit, 'ft');
assert.equal(settings.sanitizeAppSettings({ gasVolumeUnit: 'gallons' }).gasVolumeUnit, 'ft³');
assert.equal(settings.sanitizeAppSettings({ profileColors: { depth: '#123456' } }).profileColors.depth, '#123456');
assert.equal(settings.sanitizeAppSettings({ profileColors: { depth: 'red' } }).profileColors.depth, settings.DEFAULT_PROFILE_COLORS.depth);
assert.equal(settings.sanitizeAppSettings({ profileLineWidth: 9 }).profileLineWidth, 2.75);
assert.equal(settings.sanitizeAppSettings({}).profilePhotoMode, 'previews', 'Photo pins and previews on the profile start on.');
assert.equal(settings.sanitizeAppSettings({ profilePhotoMode: 'off' }).profilePhotoMode, 'off');
assert.equal(settings.sanitizeAppSettings({ profilePhotoMode: 'pins' }).profilePhotoMode, 'pins');
assert.equal(settings.sanitizeAppSettings({ profilePhotoMode: 'sometimes' }).profilePhotoMode, 'previews');
assert.deepEqual(settings.sanitizeAppSettings({}).profileDisplay, { temperature: true, pressure: true, oxygen: true, depthFill: true, grid: true, curve: 'sharp' });
assert.deepEqual(
  settings.sanitizeAppSettings({ profileDisplay: { temperature: false, curve: 'smooth', grid: 'nope' } }).profileDisplay,
  { temperature: false, pressure: true, oxygen: true, depthFill: true, grid: true, curve: 'smooth' },
  'Each profile display choice is kept independently; junk falls back to the default.',
);
assert.deepEqual(settings.sanitizeAppSettings({
  firstTimeSetup: { version: 1, status: 'skipped', completedAt: '2026-10-12T12:00:00.000Z' },
  diveBaseline: { sacBarPerMin: 0.7, rmvLitersPerMin: 20, avgDepthMeters: 15, durationSeconds: 2700, tempMinC: 8 },
}).diveBaseline, { sacBarPerMin: 0.7, rmvLitersPerMin: 20, avgDepthMeters: 15, durationSeconds: 2700, tempMinC: 8 });
assert.equal(settings.sanitizeAppSettings({ firstTimeSetup: { version: 1, status: 'skipped' } }).firstTimeSetup.status, 'skipped');
assert.equal(settings.sanitizeAppSettings({ diveBaseline: { sacBarPerMin: -1 } }).diveBaseline.sacBarPerMin, null);
assert.equal(settings.hydrateAppSettings(null).firstTimeSetup.status, 'pending', 'Empty storage represents a fresh install.');
assert.equal(settings.hydrateAppSettings({ depthUnit: 'm' }).firstTimeSetup.status, 'skipped', 'A legacy settings record represents an existing installation.');
assert.equal(settings.hydrateAppSettings({ firstTimeSetup: { version: 1, status: 'complete' } }).firstTimeSetup.status, 'complete');

// Account sync updates units and trimix only; this phone's location logging and graph styling survive
// (they used to reset on every sign-in and app reload because the account has no such fields).
const phone = settings.sanitizeAppSettings({ depthUnit: 'ft', locationLoggingEnabled: true, profileColors: { depth: '#123456' }, profileLineWidth: 4 });
const account = settings.sanitizeAppSettings({ depthUnit: 'm', temperatureUnit: 'C', trimixMode: true });
const merged = settings.mergeAccountSettings(phone, account);
assert.equal(merged.locationLoggingEnabled, true, 'Background location stays on after account sync.');
assert.equal(merged.profileColors.depth, '#123456');
assert.equal(merged.profileLineWidth, 4);
assert.equal(merged.depthUnit, 'm', 'Account units still apply.');
assert.equal(merged.temperatureUnit, 'C');
assert.equal(merged.trimixMode, true);
assert.equal(settings.mergeAccountSettings(phone, { depthUnit: 'm' }).pressureUnit, 'psi', 'Missing account fields leave the phone value alone.');
assert.equal(settings.mergeAccountSettings(phone, null).locationLoggingEnabled, true);
assert.equal(settings.mergeAccountSettings({ locationLoggingEnabled: false }, { locationLoggingEnabled: true }).locationLoggingEnabled, false, 'The account can never switch location logging on either.');
const setupPhone = settings.sanitizeAppSettings({ firstTimeSetup: { version: 1, status: 'complete', completedAt: '2026-10-12' }, diveBaseline: { sacBarPerMin: 0.72 } });
const setupMerged = settings.mergeAccountSettings(setupPhone, { depthUnit: 'm', firstTimeSetup: { status: 'pending' }, diveBaseline: { sacBarPerMin: 1.5 } });
assert.equal(setupMerged.firstTimeSetup.status, 'complete', 'Account settings cannot reopen install-time setup.');
assert.equal(setupMerged.diveBaseline.sacBarPerMin, 0.72, 'This phone keeps its optional starting baseline.');
assert.deepEqual([...settings.ACCOUNT_SYNCED_SETTINGS], ['depthUnit', 'gasVolumeUnit', 'pressureUnit', 'temperatureUnit', 'trimixMode', 'layout']);

const custom = settings.sanitizeAppSettings({ layout: { tools: ['dive-lens', 'dive-lens', 'unknown'], quickAccess: ['dive-log'], home: ['learning'] } });
assert.equal(custom.layout.tools[0], 'dive-lens');
assert.equal(new Set(custom.layout.tools).size, custom.layout.tools.length);
assert.equal(custom.layout.tools.includes('unknown'), false);
assert.deepEqual(custom.layout.quickAccess, ['dive-log']);
assert.equal(custom.layout.home[0], 'learning');
assert.deepEqual(settings.mergeAccountSettings(custom, { depthUnit: 'm' }).layout, custom.layout, 'Legacy server settings cannot erase a local layout.');
assert.deepEqual(settings.mergeAccountSettings(phone, { layout: custom.layout }).layout, custom.layout);
assert.deepEqual(settings.sanitizeAppSettings({ layout: { quickAccess: [] } }).layout.quickAccess, []);
console.log('App settings checks passed.');
