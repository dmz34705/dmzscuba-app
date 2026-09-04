const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { loadSourceModule } = require('./lib/load-source-module.cjs');

const projectRoot = path.join(__dirname, '..');
const uiRoot = path.join(projectRoot, 'src', 'features', 'diveComputer', 'ui');
const geometry = loadSourceModule(path.join(uiRoot, 'geometry.js'), uiRoot);
const layouts = loadSourceModule(path.join(uiRoot, 'displayLayout.js'), uiRoot);

const {
  DISPLAY_ASPECT_RATIO,
  INSTRUMENT_ASPECT_RATIO,
  INSTRUMENT_BASE_WIDTH,
  INSTRUMENT_MAX_WIDTH,
  INSTRUMENT_MIN_WIDTH,
  resolveInstrumentGeometry,
} = geometry;
const { INSTRUMENT_DISPLAY_LAYOUTS, selectInstrumentDisplayLayout } = layouts;

function almostEqual(actual, expected, tolerance = 1e-10) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should equal ${expected} within ${tolerance}`);
}

// Fixed geometry across small phones, large phones, and tablets.
const small = resolveInstrumentGeometry(240);
const base = resolveInstrumentGeometry(INSTRUMENT_BASE_WIDTH);
const largePhone = resolveInstrumentGeometry(390);
const tablet = resolveInstrumentGeometry(800);
assert.equal(small.width, INSTRUMENT_MIN_WIDTH);
assert.equal(base.width, INSTRUMENT_BASE_WIDTH);
assert.equal(largePhone.width, 390);
assert.equal(tablet.width, INSTRUMENT_MAX_WIDTH);
for (const dimensions of [small, base, largePhone, tablet]) {
  almostEqual(dimensions.width / dimensions.height, INSTRUMENT_ASPECT_RATIO);
  almostEqual(dimensions.screen.width / dimensions.screen.height, DISPLAY_ASPECT_RATIO);
  almostEqual(dimensions.screen.width / 292, dimensions.scale);
  almostEqual(dimensions.screen.height / 202, dimensions.scale);
}

// Presentation selection is deterministic and never alters instrument geometry.
const displayFor = (screenId, extra = {}) => ({ deepStopPreview: null, fieldStepper: null, leadIn: null, screenId, stop: null, ...extra });
const layoutCases = [
  [displayFor('surface.home'), INSTRUMENT_DISPLAY_LAYOUTS.HOME],
  [displayFor('surface.alt1'), INSTRUMENT_DISPLAY_LAYOUTS.ALT],
  [displayFor('surface.alt2'), INSTRUMENT_DISPLAY_LAYOUTS.ALT],
  [displayFor('surface.alt3'), INSTRUMENT_DISPLAY_LAYOUTS.ALT],
  [displayFor('surface.flySat'), INSTRUMENT_DISPLAY_LAYOUTS.FLY_SAT],
  [displayFor('surface.sn'), INSTRUMENT_DISPLAY_LAYOUTS.SERIAL_NUMBER],
  [displayFor('plan.leadIn', { leadIn: { title: 'PLAN' } }), INSTRUMENT_DISPLAY_LAYOUTS.LEAD_IN],
  [displayFor('plan.active'), INSTRUMENT_DISPLAY_LAYOUTS.PLANNER],
  [displayFor('log.leadIn', { leadIn: { title: 'LOG' } }), INSTRUMENT_DISPLAY_LAYOUTS.LEAD_IN],
  [displayFor('log.preview'), INSTRUMENT_DISPLAY_LAYOUTS.LOG_PREVIEW],
  [displayFor('log.data1'), INSTRUMENT_DISPLAY_LAYOUTS.LOG_DATA],
  [displayFor('log.data4'), INSTRUMENT_DISPLAY_LAYOUTS.LOG_DATA],
  [displayFor('setAl.audible', { fieldStepper: { label: 'AUDIBLE ALARM' } }), INSTRUMENT_DISPLAY_LAYOUTS.FIELD_STEPPER],
  [displayFor('setUtil.h2oType', { fieldStepper: { label: 'WATER TYPE' } }), INSTRUMENT_DISPLAY_LAYOUTS.FIELD_STEPPER],
  [displayFor('setGas.gasFo2', { fieldStepper: { label: 'GAS FO2' } }), INSTRUMENT_DISPLAY_LAYOUTS.FIELD_STEPPER],
  [displayFor('history.leadIn', { leadIn: { title: 'TOT dIVES' } }), INSTRUMENT_DISPLAY_LAYOUTS.LEAD_IN],
  [displayFor('history.totalHours'), INSTRUMENT_DISPLAY_LAYOUTS.TOTAL_HOURS],
  [displayFor('history.extremes'), INSTRUMENT_DISPLAY_LAYOUTS.EXTREMES],
  [displayFor('dive.primary'), INSTRUMENT_DISPLAY_LAYOUTS.PRIMARY_DIVE],
  [displayFor('dive.alt2'), INSTRUMENT_DISPLAY_LAYOUTS.DIVE_ALT],
  [displayFor('dive.alt3'), INSTRUMENT_DISPLAY_LAYOUTS.DIVE_ALT],
  [displayFor('dive.warning'), INSTRUMENT_DISPLAY_LAYOUTS.WARNING],
  [displayFor('dive.safetyStop', { stop: { type: 'safetyStop' } }), INSTRUMENT_DISPLAY_LAYOUTS.STOP],
  [displayFor('dive.decompression', { stop: { type: 'decompression' } }), INSTRUMENT_DISPLAY_LAYOUTS.STOP],
  [displayFor('dive.deepStopMain', { stop: { type: 'deepStop' } }), INSTRUMENT_DISPLAY_LAYOUTS.STOP],
  [displayFor('dive.deepStopPreview', { deepStopPreview: { depth: {} } }), INSTRUMENT_DISPLAY_LAYOUTS.DEEP_STOP_PREVIEW],
];
for (const [display, expectedLayout] of layoutCases) {
  assert.equal(selectInstrumentDisplayLayout(display), expectedLayout);
  assert.deepEqual(resolveInstrumentGeometry(390), largePhone, 'Changing display screens must not change housing geometry.');
}

const source = (filename) => fs.readFileSync(path.join(uiRoot, filename), 'utf8');
const virtualSource = source('VirtualDiveComputer.js');
const housingSource = source('ComputerHousing.js');
const displaySource = source('InstrumentDisplay.js');
const buttonSource = source('PhysicalButton.js');
const geometrySource = source('geometry.js');
const screenSource = fs.readFileSync(path.join(projectRoot, 'src', 'screens', 'DiveComputerSimulatorScreen.js'), 'utf8');
const workspaceSource = source('SimulatorWorkspace.js');

// Component hierarchy and fixed responsive contract.
assert.match(virtualSource, /ComputerHousing/);
assert.match(virtualSource, /resolveInstrumentGeometry/);
assert.match(virtualSource, /horizontal/);
assert.match(housingSource, /InstrumentDisplay/);
assert.equal((housingSource.match(/<PhysicalButton/g) || []).length, 2);
assert.match(geometrySource, /INSTRUMENT_MIN_WIDTH = 286/);
assert.match(geometrySource, /INSTRUMENT_MAX_WIDTH = 420/);
assert.match(screenSource, /<SimulatorWorkspace/);
assert.match(workspaceSource, /<VirtualDiveComputer/);
assert.match(workspaceSource, /display=\{deviceDisplay\}/);
assert.match(workspaceSource, /onDeviceEvent=\{onDeviceEvent\}/);
assert.match(workspaceSource, /<ButtonLegend display=\{deviceDisplay\}/, 'The workspace shows a per-screen button legend in both modes.');
const legendSource = source('ButtonLegend.js');
assert.match(legendSource, /describeButtons/, 'The button legend is driven by the shared describeButtons helper, not its own copy of the rules.');

// Physical input mapping supports short and long presses without screen callbacks.
assert.match(buttonSource, /DEVICE_EVENTS\.LEFT_SHORT/);
assert.match(buttonSource, /DEVICE_EVENTS\.LEFT_LONG/);
assert.match(buttonSource, /DEVICE_EVENTS\.RIGHT_SHORT/);
assert.match(buttonSource, /DEVICE_EVENTS\.RIGHT_LONG/);
assert.match(buttonSource, /delayLongPress=\{650\}/);
assert.match(buttonSource, /onLongPress/);
assert.match(buttonSource, /onDeviceEvent\(events\.short\)/);
assert.match(buttonSource, /onDeviceEvent\(events\.long\)/);
assert.match(buttonSource, /onPressStateChange/);
assert.match(housingSource, /DEVICE_EVENTS\.BOTH_LONG/);
assert.match(housingSource, /BOTH_BUTTON_HOLD_MS = 1800/, 'The dual-button home shortcut should require an approximately two-second hold.');
assert.match(housingSource, /setHoldProgress/, 'The combined hold must drive an on-screen progress cue.');
assert.match(housingSource, /holdProgress=\{holdProgress\}/, 'The hold progress must be passed to the instrument display for the on-LCD cue.');
assert.match(housingSource, /bothCancelled/, 'Releasing either button early must cancel the combined hold.');
assert.match(housingSource, /clearTimeout\(state\.bothTimer\)/, 'The combined hold timer must be cleaned up on unmount.');
assert.match(housingSource, /clearInterval\(state\.bothProgressTimer\)/, 'The hold progress interval must be cleaned up on unmount.');
assert.match(housingSource, /if \(bothHeldLongEnough && !buttonState\.current\.bothSent && !buttonState\.current\.bothCancelled\)/, 'An early release must not later trigger the home shortcut.');
assert.match(housingSource, /buttonState\.current\.bothPressedAt = null;/, 'Either button lifting must end the combined-hold window immediately.');
assert.doesNotMatch(housingSource, /const bothLong = buttonState\.current\.leftLong && buttonState\.current\.rightLong/, 'Individual long-press callbacks must not trigger the dual-button shortcut early.');
assert.match(displaySource, /holdProgress > 0/, 'The instrument must render the return-home hold cue on the LCD.');
assert.match(screenSource, /highlightedControls/);
assert.match(screenSource, /speed-\$\{speed\}/);

// The instrument consumes only the semantic display and device-event boundary.
for (const filename of ['VirtualDiveComputer.js', 'ComputerHousing.js', 'InstrumentDisplay.js', 'PhysicalButton.js', 'displayLayout.js', 'geometry.js', 'SimulatorWorkspace.js', 'WaterColumnViewport.js', 'DiveProfileViewport.js']) {
  const fileSource = source(filename);
  for (const forbidden of [
    /__simulation/,
    /lesson/i,
    /training/i,
    /actualGas/,
    /tissues/,
    /calculateNdl/i,
    /screenIndex/,
    /setScreen/,
    /onNext/,
    /onReturnMain/,
    /diveComputer(?:\.js)?['"]/, // Transitional compatibility adapter.
  ]) {
    assert.doesNotMatch(fileSource, forbidden, `${filename} violates the Phase 3 instrument boundary.`);
  }
}
assert.doesNotMatch(housingSource, /display\.screenId/, 'Screen content must not change housing geometry.');
assert.match(displaySource, /display\.primary\.depth/);
assert.match(displaySource, /display\.primary\.ndl/);
assert.match(displaySource, /display\.primary\.diveTime/);
assert.match(displaySource, /display\.warning/);
assert.match(displaySource, /display\.stop/);
assert.match(displaySource, /allowFontScaling=\{false\}/);
assert.match(buttonSource, /allowFontScaling=\{false\}/);

console.log('Dive computer Phase 3 UI contract checks passed.');
