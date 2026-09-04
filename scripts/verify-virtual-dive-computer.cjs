const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { loadSourceModule } = require('./lib/load-source-module.cjs');

const projectRoot = path.join(__dirname, '..');
const libRoot = path.join(projectRoot, 'src', 'lib');
const deviceRoot = path.join(libRoot, 'virtualDiveComputer');
const simulation = loadSourceModule(path.join(libRoot, 'diveSimulation', 'index.js'), libRoot);
const deviceApi = loadSourceModule(path.join(deviceRoot, 'index.js'), libRoot);

const {
  advanceSimulation,
  calculateNdlMinutes,
  createSimulation,
  setActualGas,
  setDeepStopEnabled,
  setDepth,
} = simulation;
const {
  BUTTONS,
  DEVICE_EVENTS,
  DEVICE_SCREENS,
  FIELD_STEPPERS,
  buildVirtualDiveComputerDisplay,
  createVirtualDiveComputer,
  describeButtons,
  diveSequenceIds,
  interpretButtonPress,
  surfaceSequenceIds,
  transitionVirtualDiveComputer,
} = deviceApi;

const press = (device, type) => transitionVirtualDiveComputer(device, { type });
const sync = (device, diveState) => transitionVirtualDiveComputer(device, {
  simulation: diveState,
  type: DEVICE_EVENTS.SIMULATION_UPDATED,
});

// 1. Device creation. Single gas only - no gas 2/3 slots.
let computer = createVirtualDiveComputer();
assert.equal(computer.schemaVersion, 1);
assert.equal(computer.lifecycle, 'surface');
assert.equal(computer.currentScreen, DEVICE_SCREENS.SURFACE_HOME);
assert.equal(computer.configuredGas.fo2, 0.21);
assert.ok(Math.abs(computer.settings.safetyStopDepthMeters / 0.3048 - 15) < 1e-8);
assert.equal(computer.configuredGas[2], undefined, 'This simulator has no Gas 2/3 slots.');
assert.equal(computer.warning.active, null);

// 2. The top-level sequence is exactly what the manual documents, in order,
// with ALT_3 skipped before any nitrox dive has happened.
assert.deepEqual(surfaceSequenceIds(computer), [
  DEVICE_SCREENS.SURFACE_HOME, DEVICE_SCREENS.ALT_1, DEVICE_SCREENS.ALT_2,
  DEVICE_SCREENS.FLY_SAT, DEVICE_SCREENS.PLAN_LEAD_IN, DEVICE_SCREENS.LOG_LEAD_IN,
  DEVICE_SCREENS.SET_GAS_LEAD_IN, DEVICE_SCREENS.SET_AL_LEAD_IN, DEVICE_SCREENS.SET_UTIL_LEAD_IN,
  DEVICE_SCREENS.SET_TIME_LEAD_IN, DEVICE_SCREENS.SET_MODE_LEAD_IN, DEVICE_SCREENS.HISTORY_LEAD_IN, DEVICE_SCREENS.SN,
]);

// 3. ADV (left) is the only button that advances the top-level screen; SELECT
// (right) has nothing to act on at these read-only surface pages, so a short
// press must be a no-op. Holding ADV also just advances (no fast-scroll
// timing is modeled). ADV wraps from the last item (SN) back to home.
computer = press(computer, DEVICE_EVENTS.LEFT_SHORT);
assert.equal(computer.currentScreen, DEVICE_SCREENS.ALT_1);
computer = press(computer, DEVICE_EVENTS.RIGHT_SHORT);
assert.equal(computer.currentScreen, DEVICE_SCREENS.ALT_1, 'SELECT must not advance a display-only screen.');
computer = { ...computer, currentScreen: DEVICE_SCREENS.SN };
computer = press(computer, DEVICE_EVENTS.LEFT_SHORT);
assert.equal(computer.currentScreen, DEVICE_SCREENS.SURFACE_HOME, 'ADV must wrap from the last item back to home.');
computer = press(computer, DEVICE_EVENTS.LEFT_LONG);
assert.equal(computer.currentScreen, DEVICE_SCREENS.SURFACE_HOME);

// A simultaneous long press on both physical buttons is the device's
// deterministic "return home" shortcut, regardless of the current menu.
computer = { ...computer, currentScreen: DEVICE_SCREENS.PLAN_ACTIVE };
computer = press(computer, DEVICE_EVENTS.BOTH_LONG);
assert.equal(computer.currentScreen, DEVICE_SCREENS.SURFACE_HOME);
computer = { ...computer, currentScreen: DEVICE_SCREENS.DEEP_STOP };
computer = press(computer, DEVICE_EVENTS.BOTH_LONG);
assert.equal(computer.currentScreen, DEVICE_SCREENS.SURFACE_HOME, 'The two-button home shortcut must work from a nested settings screen.');

// 4. Long-press interpretation.
assert.equal(interpretButtonPress(computer, BUTTONS.LEFT, 649), DEVICE_EVENTS.LEFT_SHORT);
assert.equal(interpretButtonPress(computer, BUTTONS.LEFT, 650), DEVICE_EVENTS.LEFT_LONG);
assert.equal(interpretButtonPress(computer, BUTTONS.RIGHT, 1200), DEVICE_EVENTS.RIGHT_LONG);

// 5/6. SET GAS (single gas only): Air/EAN toggle -> FO2 -> PO2 alarm -> back
// to lead-in. Gas editing changes only configured gas, never actual
// breathing gas. No Gas 2/3 screens exist to step through.
let actualDive = setActualGas(createSimulation(), { fo2: 0.32 });
const actualDiveBeforeEditing = JSON.stringify(actualDive);
computer = { ...computer, currentScreen: DEVICE_SCREENS.SET_GAS_LEAD_IN };
computer = press(computer, DEVICE_EVENTS.RIGHT_SHORT);
assert.equal(computer.currentScreen, DEVICE_SCREENS.SET_AIR_EAN);
assert.equal(computer.editing.draftValue, 'air');
computer = press(computer, DEVICE_EVENTS.LEFT_SHORT);
assert.equal(computer.editing.draftValue, 'ean');
computer = press(computer, DEVICE_EVENTS.RIGHT_SHORT);
assert.equal(computer.currentScreen, DEVICE_SCREENS.GAS_FO2);
assert.equal(computer.editing.draftValue, 21);
for (let increment = 0; increment < 11; increment += 1) computer = press(computer, DEVICE_EVENTS.LEFT_SHORT);
assert.equal(computer.editing.draftValue, 32);
computer = press(computer, DEVICE_EVENTS.RIGHT_SHORT);
assert.equal(computer.currentScreen, DEVICE_SCREENS.GAS_PO2);
assert.equal(computer.configuredGas.fo2, 0.32);
assert.equal(JSON.stringify(actualDive), actualDiveBeforeEditing, 'Editing configured gas must not touch the live simulation.');
assert.equal(actualDive.environment.actualGas.fo2, 0.32);
computer = press(computer, DEVICE_EVENTS.RIGHT_SHORT);
assert.equal(computer.currentScreen, DEVICE_SCREENS.SET_GAS_LEAD_IN, 'Committing the PO2 alarm returns straight to the lead-in - no Gas 2/3.');
assert.equal(computer.configuredGas.po2Alarm, 1.4);

// 7. Right-long cancels an in-progress edit and returns to the SET GAS lead-in.
computer = press(computer, DEVICE_EVENTS.RIGHT_SHORT);
assert.equal(computer.editing.draftValue, 'ean', 'Gas is no longer Air after being set to 32%.');
computer = press(computer, DEVICE_EVENTS.RIGHT_SHORT);
computer = press(computer, DEVICE_EVENTS.LEFT_LONG);
assert.equal(computer.editing.draftValue, 31, 'Long-press decrements a range field.');
computer = press(computer, DEVICE_EVENTS.RIGHT_LONG);
assert.equal(computer.currentScreen, DEVICE_SCREENS.SET_GAS_LEAD_IN);
assert.equal(computer.configuredGas.fo2, 0.32, 'Right-long should cancel a gas edit.');

// 7b. Programming a nitrox gas unlocks the surface oxygen-status screen (ALT 3)
// and its planner MOD, even before any nitrox dive has been logged.
assert.ok(surfaceSequenceIds(computer).includes(DEVICE_SCREENS.ALT_3), 'ALT 3 appears when a nitrox gas is configured.');
assert.ok(!surfaceSequenceIds(createVirtualDiveComputer()).includes(DEVICE_SCREENS.ALT_3), 'ALT 3 stays hidden on air with no dives.');
const nitroxAlt3 = buildVirtualDiveComputerDisplay({ ...computer, currentScreen: DEVICE_SCREENS.ALT_3 }, createSimulation());
assert.equal(nitroxAlt3.alt3.fo2Label, 'EAN32');
assert.ok(nitroxAlt3.alt3.mod && nitroxAlt3.alt3.mod.value > 0, 'ALT 3 shows the MOD for the configured nitrox gas.');

// 8. Automatic dive entry uses the public simulation lifecycle.
actualDive = setDepth(actualDive, 20);
actualDive = advanceSimulation(actualDive, { depthMeters: 20, elapsedSimulationSeconds: 5 });
computer = sync(computer, actualDive);
assert.equal(computer.lifecycle, 'dive');
assert.equal(computer.currentScreen, DEVICE_SCREENS.DIVE_PRIMARY);

// 9. Dive display consumes simulation values but is generated by the device.
let display = buildVirtualDiveComputerDisplay(computer, actualDive);
assert.equal(display.screenId, DEVICE_SCREENS.DIVE_PRIMARY);
assert.equal(display.primary.depth.id, 'display.primary.depth');
assert.equal(display.primary.ndl.value, actualDive.physiology.ndlMinutes);
assert.equal(display.primary.diveTime.value, actualDive.dive.runtimeSeconds);
assert.equal(display.configuredGas.fo2, 0.32);
assert.equal(actualDive.environment.actualGas.fo2, 0.32);
assert.deepEqual(
  diveSequenceIds(computer),
  [DEVICE_SCREENS.DIVE_ALT_2, DEVICE_SCREENS.DIVE_ALT_3],
  'ALT_3 appears once the configured gas is nitrox (set to EAN32 above); deep-stop preview is skipped when not eligible.',
);
computer = press(computer, DEVICE_EVENTS.LEFT_SHORT);
assert.equal(computer.currentScreen, DEVICE_SCREENS.DIVE_ALT_2);
computer = press(computer, DEVICE_EVENTS.LEFT_SHORT);
assert.equal(computer.currentScreen, DEVICE_SCREENS.DIVE_ALT_3);
computer = press(computer, DEVICE_EVENTS.LEFT_SHORT);
assert.equal(computer.currentScreen, DEVICE_SCREENS.DIVE_PRIMARY, 'ADV wraps back to the automatic screen.');

// 9b. Holding ADV from a non-automatic screen returns to the automatic
// screen first; holding ADV again while already there toggles the Timer.
// SEL starts/stops the Timer once visible.
computer = press(computer, DEVICE_EVENTS.LEFT_SHORT);
assert.equal(computer.currentScreen, DEVICE_SCREENS.DIVE_ALT_2);
computer = press(computer, DEVICE_EVENTS.LEFT_LONG);
assert.equal(computer.currentScreen, DEVICE_SCREENS.DIVE_PRIMARY);
assert.equal(computer.timer.visible, false);
computer = press(computer, DEVICE_EVENTS.LEFT_LONG);
assert.equal(computer.timer.visible, true, 'Holding ADV again on the automatic screen shows the Timer.');
assert.equal(computer.timer.running, false);
computer = press(computer, DEVICE_EVENTS.RIGHT_SHORT);
assert.equal(computer.timer.running, true, 'SEL starts the Timer once visible.');
computer = transitionVirtualDiveComputer(computer, { elapsedSeconds: 3, type: DEVICE_EVENTS.TICK });
assert.equal(computer.timer.seconds, 3);
computer = press(computer, DEVICE_EVENTS.RIGHT_SHORT);
assert.equal(computer.timer.running, false, 'SEL stops a running Timer.');
computer = press(computer, DEVICE_EVENTS.LEFT_LONG);
assert.equal(computer.timer.visible, false, 'Holding ADV again hides the Timer.');

// 10. Safety-stop display behavior (unchanged, underwater-only).
let safetyDive = createSimulation();
safetyDive = setDepth(safetyDive, 12);
safetyDive = advanceSimulation(safetyDive, { depthMeters: 12, elapsedSimulationSeconds: 5 });
safetyDive = advanceSimulation(safetyDive, { depthMeters: 12, elapsedSimulationSeconds: 5 * 60 });
safetyDive = advanceSimulation(safetyDive, { depthMeters: 5, elapsedSimulationSeconds: 70 });
let safetyComputer = sync(createVirtualDiveComputer(), safetyDive);
assert.equal(safetyComputer.currentScreen, DEVICE_SCREENS.DIVE_SAFETY_STOP);
display = buildVirtualDiveComputerDisplay(safetyComputer, safetyDive);
assert.equal(display.stop.type, 'safetyStop');
assert.equal(display.stop.remaining.value, safetyDive.safetyStop.remainingSeconds);
safetyComputer = press(safetyComputer, DEVICE_EVENTS.LEFT_SHORT);
assert.equal(safetyComputer.currentScreen, DEVICE_SCREENS.DIVE_ALT_2, 'ADV steps to the ALT sequence, not a bare primary screen, while a stop is active.');
safetyComputer = sync(safetyComputer, safetyDive);
assert.equal(safetyComputer.currentScreen, DEVICE_SCREENS.DIVE_ALT_2, 'Repeated updates must preserve the user-selected dive page.');

// 11. Decompression display behavior (unchanged, underwater-only).
let decoDive = createSimulation();
decoDive = setDepth(decoDive, 30);
decoDive = advanceSimulation(decoDive, { depthMeters: 30, elapsedSimulationSeconds: 5 });
decoDive = advanceSimulation(decoDive, { depthMeters: 30, elapsedSimulationSeconds: 35 * 60 });
let decoComputer = sync(createVirtualDiveComputer(), decoDive);
assert.equal(decoComputer.currentScreen, DEVICE_SCREENS.DIVE_WARNING);
decoComputer = press(decoComputer, DEVICE_EVENTS.RIGHT_SHORT);
assert.equal(decoComputer.currentScreen, DEVICE_SCREENS.DIVE_DECOMPRESSION);
display = buildVirtualDiveComputerDisplay(decoComputer, decoDive);
assert.equal(display.stop.type, 'decompression');
assert.equal(display.stop.ceiling.value, decoDive.physiology.decompression.ceilingMeters * 3.28084);

// 11b. Deep stop: only takes effect once `settings.deepStop` actually wires
// `deepStopEnabled` into the simulation (mirrors what the useEffect in
// useDiveComputerSimulator.js does). Eligible past 24m, a preview screen
// appears with the calculated depth (max depth / 2) and the 2:00 pending
// duration, then the automatic screen becomes DIVE_DEEP_STOP_MAIN once
// ascending into the stop+3m band, running the fixed 2:00 countdown.
let deepStopComputer = createVirtualDiveComputer({ units: { depth: 'm' } });
deepStopComputer = { ...deepStopComputer, settings: { ...deepStopComputer.settings, deepStop: true } };
let deepStopDive = setDeepStopEnabled(createSimulation(), true);
deepStopDive = setDepth(deepStopDive, 30);
deepStopDive = advanceSimulation(deepStopDive, { depthMeters: 30, elapsedSimulationSeconds: 5 });
deepStopComputer = sync(deepStopComputer, deepStopDive);
assert.equal(deepStopComputer.observedDeepStopStatus, 'eligible');
assert.deepEqual(diveSequenceIds(deepStopComputer), [DEVICE_SCREENS.DIVE_ALT_2, DEVICE_SCREENS.DIVE_DEEP_STOP_PREVIEW]);
let deepStopDisplay = buildVirtualDiveComputerDisplay(deepStopComputer, deepStopDive);
assert.equal(deepStopDisplay.deepStopPreview.pending.formatted, '2:00');
assert.equal(deepStopDisplay.deepStopPreview.depth.value, 15, 'Deep stop depth is max depth / 2.');

// Ascend slowly (7.5 m/min, under the 9 m/min rapid-ascent threshold) so no
// warning screen preempts the deep-stop screen.
deepStopDive = advanceSimulation(deepStopDive, { depthMeters: 15, elapsedSimulationSeconds: 120 });
deepStopComputer = sync(deepStopComputer, deepStopDive);
assert.equal(deepStopComputer.observedDeepStopStatus, 'active');
assert.equal(deepStopComputer.automaticDiveScreen, DEVICE_SCREENS.DIVE_DEEP_STOP_MAIN);
assert.equal(deepStopComputer.currentScreen, DEVICE_SCREENS.DIVE_DEEP_STOP_MAIN);
let deepStopMainDisplay = buildVirtualDiveComputerDisplay(deepStopComputer, deepStopDive);
assert.equal(deepStopMainDisplay.stop.type, 'deepStop');
assert.equal(deepStopMainDisplay.stop.remaining.value, deepStopDive.deepStop.remainingSeconds);

deepStopDive = advanceSimulation(deepStopDive, { depthMeters: 15, elapsedSimulationSeconds: 130 });
assert.equal(deepStopDive.deepStop.status, 'completed');
deepStopComputer = sync(deepStopComputer, deepStopDive);
assert.equal(deepStopComputer.observedDeepStopStatus, 'completed');

// 11c. A completed deep stop must never mask the later safety stop. The
// device changes to the safety-stop page and its semantic stop model must
// contain the safety timer/depth, even though deep-stop completion remains
// latched for the logbook.
deepStopDive = advanceSimulation(deepStopDive, {
  depthMeters: deepStopComputer.settings.safetyStopDepthMeters,
  elapsedSimulationSeconds: 105,
});
assert.equal(deepStopDive.deepStop.status, 'completed');
assert.equal(deepStopDive.safetyStop.status, 'active');
deepStopComputer = sync(deepStopComputer, deepStopDive);
assert.equal(deepStopComputer.automaticDiveScreen, DEVICE_SCREENS.DIVE_SAFETY_STOP);
assert.equal(deepStopComputer.currentScreen, DEVICE_SCREENS.DIVE_SAFETY_STOP);
const safetyAfterDeepDisplay = buildVirtualDiveComputerDisplay(deepStopComputer, deepStopDive);
assert.equal(safetyAfterDeepDisplay.stop.type, 'safetyStop');
assert.equal(safetyAfterDeepDisplay.stop.remaining.value, deepStopDive.safetyStop.remainingSeconds);
assert.equal(safetyAfterDeepDisplay.stop.depth.value, deepStopComputer.settings.safetyStopDepthMeters);

let disabledDeepDive = createSimulation();
disabledDeepDive = setDepth(disabledDeepDive, 30);
disabledDeepDive = advanceSimulation(disabledDeepDive, { depthMeters: 30, elapsedSimulationSeconds: 5 });
assert.equal(disabledDeepDive.deepStop.status, 'notEligible', 'Deep stop physics stay off unless deepStopEnabled is set.');

// 12/13. Warning presentation and acknowledgement do not clear physical facts.
let warningDive = createSimulation();
warningDive = setDepth(warningDive, 20);
warningDive = advanceSimulation(warningDive, { depthMeters: 20, elapsedSimulationSeconds: 5 });
warningDive = advanceSimulation(warningDive, { depthMeters: 19.8, elapsedSimulationSeconds: 1 });
assert.equal(warningDive.warnings.rapidAscent, true);
let warningComputer = sync(createVirtualDiveComputer(), warningDive);
assert.equal(warningComputer.currentScreen, DEVICE_SCREENS.DIVE_WARNING);
assert.equal(warningComputer.warning.active.code, 'rapid-ascent');
warningComputer = transitionVirtualDiveComputer(warningComputer, { elapsedSeconds: 1, type: DEVICE_EVENTS.TICK });
assert.equal(warningComputer.warning.flashOn, true);
const warningDiveBeforeAck = JSON.stringify(warningDive);
warningComputer = press(warningComputer, DEVICE_EVENTS.RIGHT_SHORT);
assert.equal(warningComputer.warning.active.acknowledged, true);
assert.equal(warningComputer.currentScreen, DEVICE_SCREENS.DIVE_PRIMARY);
assert.equal(JSON.stringify(warningDive), warningDiveBeforeAck);
warningComputer = sync(warningComputer, warningDive);
assert.equal(warningComputer.currentScreen, DEVICE_SCREENS.DIVE_PRIMARY);
assert.equal(warningComputer.warning.active.acknowledged, true);
display = buildVirtualDiveComputerDisplay(warningComputer, warningDive);
assert.equal(display.warningIndicator.latched, true);
assert.equal(display.warningIndicator.active, false);

// 14. Post-dive transition unifies into the same surface screen graph -
// there is no separate post-dive screen tree - and creates a log entry.
let surfacedDive = advanceSimulation(warningDive, { depthMeters: 0, elapsedSimulationSeconds: 200 });
assert.equal(surfacedDive.dive.lifecycle, 'postDive');
warningComputer = sync(warningComputer, surfacedDive);
assert.equal(warningComputer.lifecycle, 'postDive');
assert.equal(warningComputer.currentScreen, DEVICE_SCREENS.SURFACE_HOME);
assert.equal(warningComputer.logbook.entries.length, 1);
assert.ok(warningComputer.logbook.entries[0].maxAscentRateMpm >= 0, 'Log entries must carry real running stats, not placeholders.');

// 14b. The device combines a sub-10-minute re-entry with the existing log
// and opens a distinct entry only after the engine starts a new session.
let sessionComputer = createVirtualDiveComputer();
let sessionDive = setDepth(createSimulation(), 2);
sessionDive = advanceSimulation(sessionDive, { depthMeters: 2, elapsedSimulationSeconds: 5 });
sessionComputer = sync(sessionComputer, sessionDive);
sessionDive = advanceSimulation(sessionDive, { depthMeters: 15, elapsedSimulationSeconds: 90 });
sessionComputer = sync(sessionComputer, sessionDive);
sessionDive = advanceSimulation(sessionDive, { depthMeters: 0, elapsedSimulationSeconds: 150 });
sessionComputer = sync(sessionComputer, sessionDive);
assert.equal(sessionComputer.logbook.entries.length, 1);
const initialLoggedRuntime = sessionComputer.logbook.entries[0].runtimeSeconds;
sessionDive = advanceSimulation(sessionDive, { depthMeters: 0, elapsedSimulationSeconds: 5 * 60 });
sessionComputer = sync(sessionComputer, sessionDive);
sessionDive = setDepth(sessionDive, 2);
sessionDive = advanceSimulation(sessionDive, { depthMeters: 2, elapsedSimulationSeconds: 5 });
assert.equal(sessionDive.dive.isContinuation, true);
sessionComputer = sync(sessionComputer, sessionDive);
sessionDive = advanceSimulation(sessionDive, { depthMeters: 10, elapsedSimulationSeconds: 60 });
sessionComputer = sync(sessionComputer, sessionDive);
sessionDive = advanceSimulation(sessionDive, { depthMeters: 0, elapsedSimulationSeconds: 120 });
sessionComputer = sync(sessionComputer, sessionDive);
assert.equal(sessionComputer.logbook.entries.length, 1, 'A short surface interruption must update the existing log entry.');
assert.ok(sessionComputer.logbook.entries[0].runtimeSeconds > initialLoggedRuntime);
sessionDive = advanceSimulation(sessionDive, { depthMeters: 0, elapsedSimulationSeconds: 10 * 60 });
sessionComputer = sync(sessionComputer, sessionDive);
sessionDive = setDepth(sessionDive, 2);
sessionDive = advanceSimulation(sessionDive, { depthMeters: 2, elapsedSimulationSeconds: 5 });
assert.equal(sessionDive.dive.isContinuation, false);
sessionComputer = sync(sessionComputer, sessionDive);
sessionDive = advanceSimulation(sessionDive, { depthMeters: 8, elapsedSimulationSeconds: 60 });
sessionComputer = sync(sessionComputer, sessionDive);
sessionDive = advanceSimulation(sessionDive, { depthMeters: 0, elapsedSimulationSeconds: 90 });
sessionComputer = sync(sessionComputer, sessionDive);
assert.equal(sessionComputer.logbook.entries.length, 2, 'A 10-minute interval must create a separate logbook dive.');
assert.equal(sessionComputer.history.totalDives, 2);

// 14c. After a dive the surface menu labels must stay screen-specific - an
// earlier bug stamped every post-dive surface screen "DIVE COMPLETE".
let postDiveComputer = createVirtualDiveComputer();
let postDiveSim = advanceSimulation(setDepth(createSimulation(), 3), { depthMeters: 3, elapsedSimulationSeconds: 5 });
postDiveComputer = sync(postDiveComputer, postDiveSim);
postDiveSim = advanceSimulation(postDiveSim, { depthMeters: 14, elapsedSimulationSeconds: 6 * 60 });
postDiveComputer = sync(postDiveComputer, postDiveSim);
assert.equal(postDiveComputer.lifecycle, 'dive');
postDiveSim = advanceSimulation(postDiveSim, { depthMeters: 0, elapsedSimulationSeconds: 200 });
postDiveComputer = sync(postDiveComputer, postDiveSim);
assert.equal(postDiveComputer.lifecycle, 'postDive');
for (const [screenId, expectedLabel] of [
  [DEVICE_SCREENS.SET_TIME_LEAD_IN, 'SET TIME'],
  [DEVICE_SCREENS.PLAN_LEAD_IN, 'PLAN'],
  [DEVICE_SCREENS.DEEP_STOP, 'DEEP STOP'],
]) {
  const labelled = buildVirtualDiveComputerDisplay({ ...postDiveComputer, currentScreen: screenId }, postDiveSim);
  assert.equal(labelled.labels.status.toUpperCase(), expectedLabel, `Post-dive ${screenId} must keep its own header.`);
}

// 14d. A paused post-dive simulation must not strand the device in POST_DIVE.
const pausedPostDive = { ...postDiveSim, clock: { ...postDiveSim.clock, status: 'paused' } };
const settledComputer = sync(sync(createVirtualDiveComputer(), postDiveSim), pausedPostDive);
assert.equal(settledComputer.lifecycle, 'surface', 'A paused post-dive sim must settle the device back to the surface lifecycle.');

// 14e. The two-button home shortcut normalizes the lifecycle and is a
// deliberate no-op underwater.
let midDiveComputer = sync(createVirtualDiveComputer(), advanceSimulation(setDepth(createSimulation(), 18), { depthMeters: 18, elapsedSimulationSeconds: 30 }));
assert.equal(midDiveComputer.lifecycle, 'dive');
const midDiveScreen = midDiveComputer.currentScreen;
midDiveComputer = press(midDiveComputer, DEVICE_EVENTS.BOTH_LONG);
assert.equal(midDiveComputer.currentScreen, midDiveScreen, 'BOTH_LONG must not leave the dive screen underwater.');
const homedFromPostDive = press(postDiveComputer, DEVICE_EVENTS.BOTH_LONG);
assert.equal(homedFromPostDive.currentScreen, DEVICE_SCREENS.SURFACE_HOME);
assert.equal(homedFromPostDive.lifecycle, 'surface', 'BOTH_LONG on the surface must normalize the lifecycle.');

// 14f. The home screen is one stable "ready to dive" layout, pre- and
// post-dive, and it carries water temperature and configured gas.
const freshHome = buildVirtualDiveComputerDisplay(createVirtualDiveComputer(), createSimulation());
assert.equal(freshHome.home.hasEverDived, false);
assert.equal(freshHome.home.temperature.unit, 'F');
assert.ok(freshHome.home.temperature.value > 60 && freshHome.home.temperature.value < 100);
assert.equal(freshHome.home.fo2Label, 'Air');
const divedHome = buildVirtualDiveComputerDisplay(postDiveComputer, postDiveSim);
assert.equal(divedHome.home.hasEverDived, true);
assert.ok(typeof divedHome.home.surfaceInterval === 'string' && divedHome.home.timeToFly);

// 14g. Lowest water temperature is tracked into history across a dive.
assert.ok(postDiveComputer.history.lowestTemperature != null && postDiveComputer.history.lowestTemperature < 27);

// 15. LOG: preview cycles recorded dives; ADV always backs out of a data
// page to preview and SEL goes deeper - the one screen in this spec where
// ADV means "back," per the manual's own button diagram.
warningComputer = { ...warningComputer, currentScreen: DEVICE_SCREENS.LOG_LEAD_IN };
warningComputer = press(warningComputer, DEVICE_EVENTS.RIGHT_SHORT);
assert.equal(warningComputer.currentScreen, DEVICE_SCREENS.LOG_PREVIEW);
warningComputer = sync(warningComputer, surfacedDive);
assert.equal(warningComputer.currentScreen, DEVICE_SCREENS.LOG_PREVIEW, 'Repeated post-dive updates must not exit log navigation.');
warningComputer = press(warningComputer, DEVICE_EVENTS.RIGHT_SHORT);
assert.equal(warningComputer.currentScreen, DEVICE_SCREENS.LOG_DATA_1);
warningComputer = press(warningComputer, DEVICE_EVENTS.LEFT_SHORT);
assert.equal(warningComputer.currentScreen, DEVICE_SCREENS.LOG_PREVIEW, 'ADV backs out of a log data page, it does not advance.');
warningComputer = press(warningComputer, DEVICE_EVENTS.LEFT_LONG);
assert.equal(warningComputer.currentScreen, DEVICE_SCREENS.LOG_LEAD_IN);

// 16. PLAN: a single live planner screen (not a lead-in + detail pair);
// ADV adjusts the planned depth, SEL exits back to the PLAN lead-in.
let plannerComputer = { ...createVirtualDiveComputer(), currentScreen: DEVICE_SCREENS.PLAN_LEAD_IN };
plannerComputer = press(plannerComputer, DEVICE_EVENTS.RIGHT_SHORT);
assert.equal(plannerComputer.currentScreen, DEVICE_SCREENS.PLAN_ACTIVE);
const initialPlanDepth = plannerComputer.planner.depthMeters;
plannerComputer = press(plannerComputer, DEVICE_EVENTS.LEFT_SHORT);
assert.equal(plannerComputer.planner.depthMeters, initialPlanDepth + 3);
plannerComputer = press(plannerComputer, DEVICE_EVENTS.RIGHT_SHORT);
assert.equal(plannerComputer.currentScreen, DEVICE_SCREENS.PLAN_LEAD_IN);

// 16b. PLAN projects from the engine's live tissue loading. Its NDL is
// shortest immediately after a dive and recovers as surface time passes.
// The projection uses the computer-programmed gas, not the actual cylinder.
const freshPlannerSimulation = createSimulation({ actualGas: { fo2: 0.36 } });
const airPlanner = {
  ...createVirtualDiveComputer({ configuredGas: { fo2: 0.21, po2Alarm: 1.4 }, plannerDepthMeters: 18 }),
  currentScreen: DEVICE_SCREENS.PLAN_ACTIVE,
};
const freshPlannerDisplay = buildVirtualDiveComputerDisplay(airPlanner, freshPlannerSimulation);
assert.equal(
  freshPlannerDisplay.plan.ndlMinutes,
  calculateNdlMinutes(
    freshPlannerSimulation.physiology.tissues,
    18,
    0.21,
    freshPlannerSimulation.waterType,
    freshPlannerSimulation.gradientFactor,
  ),
);
let loadedPlannerSimulation = setDepth(freshPlannerSimulation, 2);
loadedPlannerSimulation = advanceSimulation(loadedPlannerSimulation, { depthMeters: 2, elapsedSimulationSeconds: 5 });
loadedPlannerSimulation = advanceSimulation(loadedPlannerSimulation, { depthMeters: 18, elapsedSimulationSeconds: 120 });
loadedPlannerSimulation = advanceSimulation(loadedPlannerSimulation, { depthMeters: 18, elapsedSimulationSeconds: 20 * 60 });
loadedPlannerSimulation = advanceSimulation(loadedPlannerSimulation, { depthMeters: 0, elapsedSimulationSeconds: 180 });
const loadedPlannerDisplay = buildVirtualDiveComputerDisplay(airPlanner, loadedPlannerSimulation);
assert.ok(loadedPlannerDisplay.plan.ndlMinutes < freshPlannerDisplay.plan.ndlMinutes);
loadedPlannerSimulation = advanceSimulation(loadedPlannerSimulation, { depthMeters: 0, elapsedSimulationSeconds: 30 * 60 });
const recoveredPlannerDisplay = buildVirtualDiveComputerDisplay(airPlanner, loadedPlannerSimulation);
assert.ok(recoveredPlannerDisplay.plan.ndlMinutes > loadedPlannerDisplay.plan.ndlMinutes);
assert.equal(loadedPlannerSimulation.environment.actualGas.fo2, 0.36);
assert.equal(airPlanner.configuredGas.fo2, 0.21);
assert.equal(
  recoveredPlannerDisplay.plan.ndlMinutes,
  calculateNdlMinutes(
    loadedPlannerSimulation.physiology.tissues,
    18,
    0.21,
    loadedPlannerSimulation.waterType,
    loadedPlannerSimulation.gradientFactor,
  ),
  'PLAN must project from configured Air even when the diver actually breathed EAN36.',
);
const nitroxPlanner = {
  ...airPlanner,
  configuredGas: { fo2: 0.36, po2Alarm: 1.2 },
  planner: { depthMeters: 40 },
};
const nitroxPlanDisplay = buildVirtualDiveComputerDisplay(nitroxPlanner, loadedPlannerSimulation);
assert.equal(nitroxPlanDisplay.plan.available, false);
assert.equal(nitroxPlanDisplay.plan.limitLabel, 'ABOVE MOD');
assert.equal(nitroxPlanDisplay.plan.minutes, '--');

// 16c. Hour formatting: the device only ever stores a 24h hour (0-23)
// internally, but every display of it must respect settings.hourFormat -
// 12h shows a true 1-12 hour with an AM/PM period, 24h shows a plain
// zero-padded 0-23 with no period at all.
const referenceSimulation = createSimulation();
const hourCases = [
  { expectedPeriod: 'AM', expected12: '12:05 AM', expected24: '00:05', hour: 0 },
  { expectedPeriod: 'AM', expected12: '9:05 AM', expected24: '09:05', hour: 9 },
  { expectedPeriod: 'PM', expected12: '12:05 PM', expected24: '12:05', hour: 12 },
  { expectedPeriod: 'PM', expected12: '11:05 PM', expected24: '23:05', hour: 23 },
];
for (const { expectedPeriod, expected12, expected24, hour } of hourCases) {
  const twelveHourComputer = { ...createVirtualDiveComputer(), dateTime: { ...createVirtualDiveComputer().dateTime, hour, minute: 5 } };
  const twelveHourDisplay = buildVirtualDiveComputerDisplay(twelveHourComputer, referenceSimulation);
  assert.equal(twelveHourDisplay.alt2.time.formatted, expected12, `Hour ${hour} in 12h format must read "${expected12}".`);
  assert.equal(twelveHourDisplay.alt2.time.period, expectedPeriod);
  assert.equal(twelveHourDisplay.diveAlt2.time.formatted, expected12, 'Dive ALT 2 must format the same way as surface ALT 2.');

  const twentyFourHourComputer = {
    ...twelveHourComputer,
    settings: { ...twelveHourComputer.settings, hourFormat: 24 },
  };
  const twentyFourHourDisplay = buildVirtualDiveComputerDisplay(twentyFourHourComputer, referenceSimulation);
  assert.equal(twentyFourHourDisplay.alt2.time.formatted, expected24, `Hour ${hour} in 24h format must read "${expected24}", with no AM/PM.`);
  assert.equal(twentyFourHourDisplay.alt2.time.period, null, '24h format must not carry an AM/PM period at all.');
}

// 16d. The SET_HOUR field-stepper screen itself must also honor
// hourFormat - editing hour 14 in 12h mode must read "2 PM", not "14".
let hourEditComputer = createVirtualDiveComputer();
hourEditComputer = { ...hourEditComputer, currentScreen: DEVICE_SCREENS.SET_TIME_LEAD_IN };
hourEditComputer = press(hourEditComputer, DEVICE_EVENTS.RIGHT_SHORT);
hourEditComputer = press(hourEditComputer, DEVICE_EVENTS.RIGHT_SHORT);
hourEditComputer = press(hourEditComputer, DEVICE_EVENTS.RIGHT_SHORT);
assert.equal(hourEditComputer.currentScreen, DEVICE_SCREENS.SET_HOUR);
hourEditComputer = { ...hourEditComputer, editing: { ...hourEditComputer.editing, draftValue: 14 } };
let hourEditDisplay = buildVirtualDiveComputerDisplay(hourEditComputer, referenceSimulation);
assert.equal(hourEditDisplay.fieldStepper.value, '2 PM', 'Editing the hour in 12h mode must show a true 1-12 value with AM/PM, not raw 24h.');

// 16e. SET TIME progresses one editable field at a time: ADV changes the
// active value without leaving the field, while SEL accepts it and advances.
let setTimeFlow = { ...createVirtualDiveComputer(), currentScreen: DEVICE_SCREENS.SET_TIME_LEAD_IN };
const setTimeScreens = [
  DEVICE_SCREENS.DATE_FORMAT,
  DEVICE_SCREENS.HOUR_FORMAT,
  DEVICE_SCREENS.SET_HOUR,
  DEVICE_SCREENS.SET_MINUTE,
  DEVICE_SCREENS.SET_YEAR,
  DEVICE_SCREENS.SET_MONTH,
  DEVICE_SCREENS.SET_DAY,
  DEVICE_SCREENS.SET_TIME_LEAD_IN,
];
setTimeFlow = press(setTimeFlow, DEVICE_EVENTS.RIGHT_SHORT);
const firstDateFormat = setTimeFlow.editing.draftValue;
setTimeFlow = press(setTimeFlow, DEVICE_EVENTS.LEFT_SHORT);
assert.equal(setTimeFlow.currentScreen, setTimeScreens[0], 'ADV must change the active setting without progressing.');
assert.notEqual(setTimeFlow.editing.draftValue, firstDateFormat, 'ADV must change the value currently being edited.');
for (let index = 1; index < setTimeScreens.length; index += 1) {
  setTimeFlow = press(setTimeFlow, DEVICE_EVENTS.RIGHT_SHORT);
  assert.equal(setTimeFlow.currentScreen, setTimeScreens[index], `SEL must progress from SET TIME field ${index}.`);
}
hourEditComputer = { ...hourEditComputer, settings: { ...hourEditComputer.settings, hourFormat: 24 } };
hourEditDisplay = buildVirtualDiveComputerDisplay(hourEditComputer, referenceSimulation);
assert.equal(hourEditDisplay.fieldStepper.value, '14', 'Editing the hour in 24h mode must show the raw zero-padded value with no AM/PM.');

// 17. Every field-stepper screen (the 5 alarms + 9 utilities + date/hour
// format + set mode - 16 in total) declares a parent to cancel back to and a
// next() to advance to.
for (const [screenId, stepper] of Object.entries(FIELD_STEPPERS)) {
  assert.ok(stepper.parent, `${screenId} field stepper is missing a parent to cancel back to.`);
  assert.equal(typeof stepper.next, 'function', `${screenId} field stepper is missing next().`);
}

// 17b. describeButtons mirrors the state machine for the on-screen button
// legend: one screen from every family, plus the logbook ADV="back" reversal.
const legendFor = (device, simulation = createSimulation()) => describeButtons(buildVirtualDiveComputerDisplay(device, simulation));

const homeLegend = legendFor(createVirtualDiveComputer());
assert.equal(homeLegend.adv.tap, 'Next screen');
assert.equal(homeLegend.adv.hold, 'Home screen');
assert.equal(homeLegend.sel.tap, null, 'SEL does nothing on the home screen.');
assert.ok(homeLegend.both, 'The surface legend advertises the two-button home hold.');

const leadInLegend = legendFor({ ...createVirtualDiveComputer(), currentScreen: DEVICE_SCREENS.SET_UTIL_LEAD_IN });
assert.equal(leadInLegend.sel.tap, 'Open menu');

let stepperDevice = { ...createVirtualDiveComputer(), currentScreen: DEVICE_SCREENS.SET_TIME_LEAD_IN };
stepperDevice = press(stepperDevice, DEVICE_EVENTS.RIGHT_SHORT); // -> DATE_FORMAT (toggle)
const toggleLegend = legendFor(stepperDevice);
assert.equal(toggleLegend.adv.tap, 'Switch value');
assert.equal(toggleLegend.sel.tap, 'Save and continue');
assert.equal(toggleLegend.sel.hold, 'Cancel, no change');
stepperDevice = press(press(stepperDevice, DEVICE_EVENTS.RIGHT_SHORT), DEVICE_EVENTS.RIGHT_SHORT); // DATE_FORMAT -> HOUR_FORMAT -> SET_HOUR (range)
assert.equal(stepperDevice.currentScreen, DEVICE_SCREENS.SET_HOUR);
const rangeLegend = legendFor(stepperDevice);
assert.equal(rangeLegend.adv.hold, 'Change value down', 'A range field advertises the reverse-step hold.');

let logDevice = { ...createVirtualDiveComputer(), currentScreen: DEVICE_SCREENS.LOG_PREVIEW, logbook: { entries: [{ diveNumber: 1, fo2: 0.21, runtimeSeconds: 600, maximumDepthMeters: 12, averageDepthMeters: 8, configuredFo2: 0.21, deepStopTriggered: false, endOfDiveCnsPercent: 1, highestPpO2: 0.6, maxAscentRateMpm: 3, maxTissueLoadingPercent: 20, preDiveSurfaceIntervalSeconds: 0, profileSampleCount: 1, runtimeSeconds: 600, surfacedAtSimulationSeconds: 700 }], lastRecordedDiveCount: 1, selectedIndex: 0 } };
assert.equal(legendFor(logDevice).sel.tap, 'Open this dive');
logDevice = press(logDevice, DEVICE_EVENTS.RIGHT_SHORT);
assert.equal(logDevice.currentScreen, DEVICE_SCREENS.LOG_DATA_1);
assert.equal(legendFor(logDevice).adv.tap, 'Back to dive list', 'In the logbook data pages, ADV means back.');
assert.equal(legendFor(logDevice).sel.tap, 'Next data page');

let diveLegendDevice = sync(createVirtualDiveComputer(), advanceSimulation(setDepth(createSimulation(), 18), { depthMeters: 18, elapsedSimulationSeconds: 20 }));
const diveLegend = describeButtons(buildVirtualDiveComputerDisplay(diveLegendDevice, advanceSimulation(setDepth(createSimulation(), 18), { depthMeters: 18, elapsedSimulationSeconds: 20 })));
assert.equal(diveLegend.adv.tap, 'Next data page');
assert.equal(diveLegend.both, null, 'The two-button hold is not offered underwater.');

// 18. Replayable deterministic button and simulation event sequences.
const sequence = [
  { type: DEVICE_EVENTS.LEFT_SHORT },
  { type: DEVICE_EVENTS.RIGHT_SHORT },
  { type: DEVICE_EVENTS.LEFT_SHORT },
  { type: DEVICE_EVENTS.RIGHT_SHORT },
  { type: DEVICE_EVENTS.RIGHT_SHORT },
  { type: DEVICE_EVENTS.LEFT_SHORT },
  { type: DEVICE_EVENTS.RIGHT_SHORT },
  { simulation: actualDive, type: DEVICE_EVENTS.SIMULATION_UPDATED },
  { elapsedSeconds: 0.5, type: DEVICE_EVENTS.TICK },
];
function replayDevice() {
  return sequence.reduce((state, event) => transitionVirtualDiveComputer(state, event), createVirtualDiveComputer());
}
assert.deepEqual(replayDevice(), replayDevice());

// 19/20/21. Pure Node execution, no React/training imports, no compatibility-field access.
const forbiddenPatterns = [
  /from\s+['"]react['"]/i,
  /from\s+['"]react-native['"]/i,
  /require\(['"]react(?:-native)?['"]\)/i,
  /(?:^|[\\/])screens(?:[\\/]|$)/i,
  /(?:^|[\\/])components(?:[\\/]|$)/i,
  /lessonDefinitions/i,
  /(?:^|[\\/])training(?:[\\/]|$)/i,
  /__simulation/,
  /diveComputer(?:\.js)?['"]/,
];
for (const filename of fs.readdirSync(deviceRoot).filter((name) => name.endsWith('.js'))) {
  const source = fs.readFileSync(path.join(deviceRoot, filename), 'utf8');
  for (const pattern of forbiddenPatterns) {
    assert.doesNotMatch(source, pattern, `${filename} violates the virtualDiveComputer dependency boundary.`);
  }
}
for (const integrationFile of [
  path.join(projectRoot, 'src', 'features', 'diveComputer', 'useDiveComputerSimulator.js'),
  path.join(projectRoot, 'src', 'features', 'diveComputer', 'training', 'useGuidedDiveLesson.js'),
  path.join(projectRoot, 'src', 'screens', 'DiveComputerSimulatorScreen.js'),
]) {
  assert.doesNotMatch(
    fs.readFileSync(integrationFile, 'utf8'),
    /__simulation/,
    `${path.basename(integrationFile)} must not access the private compatibility snapshot.`,
  );
}
assert.throws(
  () => sync(createVirtualDiveComputer(), { __simulation: actualDive }),
  /public DiveSimulationState/,
  'The device must reject the private compatibility representation.',
);

console.log('Virtual dive computer Phase 2 behavioral checks passed.');
