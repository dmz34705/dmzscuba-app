const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { loadSourceModule } = require('./lib/load-source-module.cjs');

const projectRoot = path.join(__dirname, '..');
const domainRoot = path.join(projectRoot, 'src', 'lib', 'diveSimulation');
const simulation = loadSourceModule(path.join(domainRoot, 'index.js'), domainRoot);

const {
  SIMULATION_LIMITS,
  SIMULATION_SPEEDS,
  advanceSimulation,
  calculateNdlMinutes,
  createSimulation,
  pauseSimulation,
  resumeSimulation,
  selectAscentRateMpm,
  selectDescentRateMpm,
  selectSafetyStopEligible,
  setActualGas,
  setDeepStopEnabled,
  setDepth,
  setGradientFactor,
  setPo2AlarmSetpoint,
  setSafetyStopDepthMeters,
  setSafetyStopSeconds,
  setSimulationSpeed,
  setTargetDepth,
  setWaterType,
  stepSimulation,
  surfaceSimulation,
} = simulation;

function almostEqual(actual, expected, tolerance = 1e-8, message = '') {
  assert.ok(Math.abs(actual - expected) <= tolerance, message || `${actual} should be within ${tolerance} of ${expected}`);
}

function normalizeForSpeedComparison(state) {
  return { ...state, clock: { ...state.clock, speed: 1 } };
}

// 1. Simulation creation.
let state = createSimulation({ actualGas: { fo2: 0.32 } });
assert.equal(state.schemaVersion, 1);
assert.equal(state.clock.status, 'paused');
assert.equal(state.clock.speed, 1);
assert.equal(state.dive.lifecycle, 'surface');
assert.equal(state.environment.actualGas.fo2, 0.32);
assert.equal(state.profile.samples.length, 1);
assert.equal(state.profile.samples[0].simulationSeconds, 0);
assert.equal(SIMULATION_LIMITS.physicsStepSeconds, 1);
assert.equal(SIMULATION_LIMITS.profileSampleIntervalSeconds, 5);
assert.notEqual(SIMULATION_LIMITS.physicsStepSeconds, SIMULATION_LIMITS.profileSampleIntervalSeconds);

// 2. Dive-start lifecycle transition and 3. deterministic depth changes.
state = resumeSimulation(setTargetDepth(state, 2, { descentRateMpm: 18 }));
state = stepSimulation(state, 4);
assert.equal(state.dive.lifecycle, 'surface');
almostEqual(state.environment.depthMeters, 1.2);
state = stepSimulation(state, 1);
assert.equal(state.dive.lifecycle, 'diving');
almostEqual(state.environment.depthMeters, 1.5);
assert.equal(state.dive.runtimeSeconds, 0, 'Dive time begins when the computer activates at approximately 5 ft.');
state = stepSimulation(state, 4);
assert.equal(state.dive.lifecycle, 'diving');
almostEqual(state.environment.depthMeters, 2);
assert.equal(state.dive.runtimeSeconds, 4);

// 4. Maximum depth and 5. runtime progression.
state = setTargetDepth(state, 18, { descentRateMpm: 18 });
state = stepSimulation(state, 55);
almostEqual(state.environment.depthMeters, 18);
almostEqual(state.dive.maximumDepthMeters, 18);
const runtimeAtDepth = state.dive.runtimeSeconds;
state = stepSimulation(state, 60);
assert.equal(state.dive.runtimeSeconds, runtimeAtDepth + 60);

// 6. Surface transition and 7. surface interval progression.
state = surfaceSimulation(state, { ascentRateMpm: 6 });
state = stepSimulation(state, 180);
assert.equal(state.dive.lifecycle, 'postDive');
assert.equal(state.environment.depthMeters, 0);
const surfaceIntervalAtSurface = state.dive.surfaceIntervalSeconds;
state = stepSimulation(state, 60);
assert.equal(state.dive.surfaceIntervalSeconds, surfaceIntervalAtSurface + 60);

// 8. Ascent/descent-rate calculation and 9. rapid-ascent warning fact.
let rateState = createSimulation({ actualGas: { fo2: 0.32 } });
rateState = advanceSimulation(rateState, { depthMeters: 20, elapsedSimulationSeconds: 5 });
assert.ok(selectDescentRateMpm(rateState) > 0);
rateState = advanceSimulation(rateState, { depthMeters: 19.8, elapsedSimulationSeconds: 1 });
almostEqual(selectAscentRateMpm(rateState), 12, 1e-7);
assert.equal(rateState.warnings.rapidAscent, true);
assert.equal(Object.hasOwn(rateState.warnings, 'acknowledged'), false);

// 10. Actual breathing gas changes remain a simulation/environment command.
const tissuesBeforeGasChange = rateState.physiology.tissues;
rateState = setActualGas(rateState, { fo2: 0.36 });
assert.equal(rateState.environment.actualGas.fo2, 0.36);
assert.deepEqual(rateState.physiology.tissues, tissuesBeforeGasChange);
assert.equal(Object.hasOwn(rateState, 'configuredGas'), false);

// 11. NDL progression.
let ndlState = createSimulation();
ndlState = advanceSimulation(ndlState, { depthMeters: 20, elapsedSimulationSeconds: 5 });
const startingNdl = ndlState.physiology.ndlMinutes;
ndlState = advanceSimulation(ndlState, { depthMeters: 20, elapsedSimulationSeconds: 20 * 60 });
assert.ok(ndlState.physiology.ndlMinutes < startingNdl);

// 12. Decompression-state transition.
let decoState = createSimulation();
decoState = advanceSimulation(decoState, { depthMeters: 30, elapsedSimulationSeconds: 5 });
decoState = advanceSimulation(decoState, { depthMeters: 30, elapsedSimulationSeconds: 35 * 60 });
assert.equal(decoState.physiology.decompression.required, true);
assert.equal(decoState.warnings.decompressionRequired, true);
assert.ok(decoState.physiology.decompression.ceilingMeters > 0);

// 13. Safety-stop eligibility, activation, and completion. The simulator's
// default center is 15 ft with a 10-20 ft operating band and a 180s duration.
let stopState = createSimulation();
stopState = advanceSimulation(stopState, { depthMeters: 12, elapsedSimulationSeconds: 5 });
stopState = advanceSimulation(stopState, { depthMeters: 12, elapsedSimulationSeconds: 5 * 60 });
assert.equal(selectSafetyStopEligible(stopState), true);
stopState = advanceSimulation(stopState, { depthMeters: 5, elapsedSimulationSeconds: 70 });
assert.equal(stopState.safetyStop.status, 'active');
almostEqual(stopState.safetyStop.stopDepthMeters, SIMULATION_LIMITS.defaultSafetyStopDepthMeters);
assert.ok(stopState.safetyStop.remainingSeconds < stopState.safetyStopSeconds);
stopState = advanceSimulation(stopState, {
  depthMeters: 5,
  elapsedSimulationSeconds: stopState.safetyStop.remainingSeconds,
});
assert.equal(stopState.safetyStop.status, 'completed');
assert.equal(stopState.safetyStop.remainingSeconds, 0);

// 13a2. Completion stays visible (0:00) while the diver is still parked at
// the stop - it doesn't silently flip back to eligible on the very next
// tick regardless of position. This matters for real-time observers polling
// at a coarser interval than the physics step: without this, "completed"
// could be skipped over entirely inside a single multi-second advance.
stopState = advanceSimulation(stopState, { depthMeters: 5, elapsedSimulationSeconds: 5 });
assert.equal(stopState.safetyStop.status, 'completed', 'Staying at the stop depth after completing must keep showing completed.');
assert.equal(stopState.safetyStop.remainingSeconds, 0);

// 13b. Unlike Deep Stop, Safety Stop re-arms: leaving the zone after
// completing reverts to eligible, and re-ascending into it retriggers with
// a fresh countdown.
stopState = advanceSimulation(stopState, { depthMeters: 10, elapsedSimulationSeconds: 60 });
assert.equal(stopState.safetyStop.status, 'eligible', 'Leaving the zone after completing must revert to eligible so it can retrigger.');
stopState = advanceSimulation(stopState, { depthMeters: 5, elapsedSimulationSeconds: 6 });
assert.equal(stopState.safetyStop.status, 'active', 'Re-ascending into the zone must retrigger the safety stop.');
assert.ok(stopState.safetyStop.remainingSeconds > stopState.safetyStopSeconds - 5, 'A retrigger starts a fresh countdown.');

// 13c. The configured depth/duration settings actually move the zone and
// change the countdown length - not hardcoded constants.
let configuredStopState = setSafetyStopDepthMeters(createSimulation(), 3);
configuredStopState = setSafetyStopSeconds(configuredStopState, 300);
assert.equal(configuredStopState.safetyStopDepthMeters, 3);
assert.equal(configuredStopState.safetyStopSeconds, 300);
configuredStopState = advanceSimulation(configuredStopState, { depthMeters: 12, elapsedSimulationSeconds: 5 });
configuredStopState = advanceSimulation(configuredStopState, { depthMeters: 12, elapsedSimulationSeconds: 5 * 60 });
configuredStopState = advanceSimulation(configuredStopState, { depthMeters: 3, elapsedSimulationSeconds: 10 });
assert.equal(configuredStopState.safetyStop.status, 'active');
assert.equal(configuredStopState.safetyStop.stopDepthMeters, 3, 'The zone follows the configured depth setting, not a hardcoded 3-6.5m band.');
assert.ok(configuredStopState.safetyStop.remainingSeconds > 295, 'The countdown follows the configured duration setting (300s), not the hardcoded default (180s).');

// 13d. Cancelling requires a sustained 10s past the cancel tolerance
// (descending 3m+ deeper than the stop) - a brief excursion must not
// instantly cancel it, and cancelling reverts to eligible, not completed.
let cancelState = createSimulation();
cancelState = advanceSimulation(cancelState, { depthMeters: 12, elapsedSimulationSeconds: 5 });
cancelState = advanceSimulation(cancelState, { depthMeters: 12, elapsedSimulationSeconds: 5 * 60 });
cancelState = advanceSimulation(cancelState, { depthMeters: 5, elapsedSimulationSeconds: 70 });
assert.equal(cancelState.safetyStop.status, 'active');
cancelState = advanceSimulation(cancelState, { depthMeters: 9, elapsedSimulationSeconds: 5 });
assert.equal(cancelState.safetyStop.status, 'active', 'Briefly exceeding the cancel tolerance (stop + 3m) must not immediately cancel it.');
cancelState = advanceSimulation(cancelState, { depthMeters: 9, elapsedSimulationSeconds: 10 });
assert.equal(cancelState.safetyStop.status, 'eligible', 'Staying past the cancel tolerance for 10s+ cancels back to eligible.');
assert.equal(cancelState.safetyStop.remainingSeconds, cancelState.safetyStopSeconds, 'Cancelling resets the countdown for the next attempt.');

// 13e. The default 15 ft stop has a symmetric 10-20 ft activation band.
// Both boundaries must activate; a target shallower than 10 ft must not arm
// directly without first entering the valid band.
const feetToMeters = (feet) => feet * 0.3048;
for (const boundaryFeet of [10, 20]) {
  let boundaryState = createSimulation();
  boundaryState = advanceSimulation(boundaryState, { depthMeters: 12, elapsedSimulationSeconds: 5 });
  boundaryState = advanceSimulation(boundaryState, { depthMeters: 12, elapsedSimulationSeconds: 5 * 60 });
  boundaryState = advanceSimulation(boundaryState, {
    depthMeters: feetToMeters(boundaryFeet),
    elapsedSimulationSeconds: 90,
  });
  assert.equal(boundaryState.safetyStop.status, 'active', `${boundaryFeet} ft must be inside the 15 ft safety-stop band.`);
}
let shallowBoundaryState = createSimulation();
shallowBoundaryState = advanceSimulation(shallowBoundaryState, { depthMeters: 12, elapsedSimulationSeconds: 5 });
shallowBoundaryState = advanceSimulation(shallowBoundaryState, { depthMeters: 12, elapsedSimulationSeconds: 5 * 60 });
shallowBoundaryState = advanceSimulation(shallowBoundaryState, {
  depthMeters: feetToMeters(9),
  elapsedSimulationSeconds: 1,
});
assert.equal(shallowBoundaryState.safetyStop.status, 'eligible', 'A direct target shallower than 10 ft must not arm the stop.');

// 14. Pause behavior.
let pausedState = createSimulation({ running: true });
pausedState = setTargetDepth(pausedState, 10);
pausedState = pauseSimulation(pausedState);
const pausedSnapshot = JSON.stringify(pausedState);
pausedState = stepSimulation(pausedState, 30);
assert.equal(JSON.stringify(pausedState), pausedSnapshot);

// 15. The exact supported simulation speeds.
assert.deepEqual(SIMULATION_SPEEDS, [1, 5, 10, 20]);
for (const speed of SIMULATION_SPEEDS) {
  let speedState = createSimulation({ running: true, simulationSpeed: speed });
  speedState = stepSimulation(speedState, 2);
  almostEqual(speedState.clock.elapsedSimulationSeconds, speed * 2);
}
assert.throws(() => setSimulationSpeed(createSimulation(), 2), /1, 5, 10, 20/);

// 15b. New computer events and warning facts return acceleration to 1x
// within the same real-time step, preventing accelerated time from running
// through the condition before the student can react.
let activationResetState = createSimulation({ running: true, simulationSpeed: 20 });
activationResetState = setTargetDepth(activationResetState, 20, { descentRateMpm: 18 });
activationResetState = stepSimulation(activationResetState, 0.5);
assert.equal(activationResetState.dive.lifecycle, 'diving');
assert.equal(activationResetState.clock.speed, 1);
assert.ok(activationResetState.clock.elapsedSimulationSeconds < 6, 'The remainder of the real-time tick must continue at 1x after activation.');

let warningResetState = advanceSimulation(createSimulation(), { depthMeters: 20, elapsedSimulationSeconds: 5 });
warningResetState = resumeSimulation(setSimulationSpeed(warningResetState, 20));
warningResetState = setTargetDepth(warningResetState, 0, { ascentRateMpm: 12 });
warningResetState = stepSimulation(warningResetState, 0.5);
assert.equal(warningResetState.warnings.rapidAscent, true);
assert.equal(warningResetState.clock.speed, 1);

let stopResetState = advanceSimulation(createSimulation(), { depthMeters: 12, elapsedSimulationSeconds: 5 });
stopResetState = advanceSimulation(stopResetState, { depthMeters: 12, elapsedSimulationSeconds: 5 * 60 });
stopResetState = resumeSimulation(setSimulationSpeed(stopResetState, 20));
stopResetState = setTargetDepth(stopResetState, SIMULATION_LIMITS.defaultSafetyStopDepthMeters, { ascentRateMpm: 6 });
stopResetState = stepSimulation(stopResetState, 4);
assert.equal(stopResetState.safetyStop.status, 'active');
assert.equal(stopResetState.clock.speed, 1);
assert.ok(stopResetState.safetyStop.remainingSeconds > stopResetState.safetyStopSeconds - 3, 'The accelerated tick must not consume the safety stop after it activates.');

// 16. Time-speed equivalence.
const speedComparisonBase = advanceSimulation(
  createSimulation({ actualGas: { fo2: 0.32 } }),
  { depthMeters: 18, elapsedSimulationSeconds: 5 },
);
let oneSpeed = resumeSimulation(setSimulationSpeed(speedComparisonBase, 1));
oneSpeed = setTargetDepth(oneSpeed, 18, { descentRateMpm: 12 });
oneSpeed = stepSimulation(oneSpeed, 50);
for (const speed of [5, 10, 20]) {
  let accelerated = resumeSimulation(setSimulationSpeed(speedComparisonBase, speed));
  accelerated = setTargetDepth(accelerated, 18, { descentRateMpm: 12 });
  accelerated = stepSimulation(accelerated, 50 / speed);
  assert.deepEqual(normalizeForSpeedComparison(accelerated), normalizeForSpeedComparison(oneSpeed));
}

// 17. Deterministic replay of the same profile and canonical five-second samples.
function replayDive() {
  let replay = createSimulation({ actualGas: { fo2: 0.32 }, running: true });
  replay = setTargetDepth(replay, 18, { descentRateMpm: 18 });
  replay = stepSimulation(replay, 60);
  replay = stepSimulation(replay, 10 * 60);
  replay = setTargetDepth(replay, 5, { ascentRateMpm: 6 });
  replay = stepSimulation(replay, 130);
  replay = stepSimulation(replay, 180);
  replay = surfaceSimulation(replay, { ascentRateMpm: 6 });
  replay = stepSimulation(replay, 50);
  return replay;
}
const replayA = replayDive();
const replayB = replayDive();
assert.deepEqual(replayA, replayB);
for (const sample of replayA.profile.samples) {
  assert.equal(sample.simulationSeconds % SIMULATION_LIMITS.profileSampleIntervalSeconds, 0);
}
assert.ok(replayA.profile.samples.length > 10);

// 17b. Residual nitrogen persists across dives and clears progressively at
// the surface. PLAN uses this same public tissue state in the device layer.
let repetitiveState = createSimulation();
const freshPlanNdl = calculateNdlMinutes(
  repetitiveState.physiology.tissues,
  18,
  0.21,
  repetitiveState.waterType,
  repetitiveState.gradientFactor,
);
repetitiveState = setDepth(repetitiveState, 2);
repetitiveState = advanceSimulation(repetitiveState, { depthMeters: 2, elapsedSimulationSeconds: 5 });
repetitiveState = advanceSimulation(repetitiveState, { depthMeters: 18, elapsedSimulationSeconds: 120 });
repetitiveState = advanceSimulation(repetitiveState, { depthMeters: 18, elapsedSimulationSeconds: 20 * 60 });
repetitiveState = advanceSimulation(repetitiveState, { depthMeters: 0, elapsedSimulationSeconds: 180 });
const immediateRepetitiveNdl = calculateNdlMinutes(
  repetitiveState.physiology.tissues,
  18,
  0.21,
  repetitiveState.waterType,
  repetitiveState.gradientFactor,
);
repetitiveState = advanceSimulation(repetitiveState, { depthMeters: 0, elapsedSimulationSeconds: 30 * 60 });
const recoveredRepetitiveNdl = calculateNdlMinutes(
  repetitiveState.physiology.tissues,
  18,
  0.21,
  repetitiveState.waterType,
  repetitiveState.gradientFactor,
);
assert.ok(immediateRepetitiveNdl < freshPlanNdl, 'Residual nitrogen must reduce the next-dive NDL.');
assert.ok(recoveredRepetitiveNdl > immediateRepetitiveNdl, 'Surface off-gassing must increase the next-dive NDL over time.');
assert.ok(recoveredRepetitiveNdl <= freshPlanNdl, 'Surface recovery must not exceed a fresh-tissue NDL.');

// 17c. Less than 10 minutes at the surface continues the same dive; ten
// minutes creates a new canonical dive session and profile segment.
const firstSessionId = repetitiveState.dive.diveSessionId;
const firstDiveRuntime = repetitiveState.dive.runtimeSeconds;
const firstDiveMaximum = repetitiveState.dive.maximumDepthMeters;
repetitiveState = setDepth(repetitiveState, 2);
repetitiveState = advanceSimulation(repetitiveState, { depthMeters: 2, elapsedSimulationSeconds: 5 });
assert.equal(repetitiveState.dive.isContinuation, false, 'A 30-minute interval must start a distinct repetitive dive.');
assert.equal(repetitiveState.dive.diveSessionId, firstSessionId + 1);
repetitiveState = advanceSimulation(repetitiveState, { depthMeters: 12, elapsedSimulationSeconds: 60 });
repetitiveState = advanceSimulation(repetitiveState, { depthMeters: 0, elapsedSimulationSeconds: 120 });
assert.equal(repetitiveState.dive.completedDiveCount, 2);
const secondSessionId = repetitiveState.dive.diveSessionId;
repetitiveState = advanceSimulation(repetitiveState, { depthMeters: 0, elapsedSimulationSeconds: 5 * 60 });
repetitiveState = setDepth(repetitiveState, 2);
repetitiveState = advanceSimulation(repetitiveState, { depthMeters: 2, elapsedSimulationSeconds: 5 });
assert.equal(repetitiveState.dive.isContinuation, true, 'A re-entry before 10 minutes must continue the same dive.');
assert.equal(repetitiveState.dive.diveSessionId, secondSessionId);
const continuedRuntime = repetitiveState.dive.runtimeSeconds;
const continuedMaximum = repetitiveState.dive.maximumDepthMeters;
assert.ok(continuedRuntime > 0 && continuedRuntime < firstDiveRuntime);
assert.ok(continuedMaximum > 0 && continuedMaximum <= firstDiveMaximum);
repetitiveState = advanceSimulation(repetitiveState, { depthMeters: 8, elapsedSimulationSeconds: 60 });
repetitiveState = advanceSimulation(repetitiveState, { depthMeters: 0, elapsedSimulationSeconds: 90 });
assert.equal(repetitiveState.dive.completedDiveCount, 2, 'A continued segment must not create another dive count.');
assert.equal(repetitiveState.dive.diveSessionId, secondSessionId);
assert.ok(repetitiveState.dive.runtimeSeconds > continuedRuntime, 'Continued segments retain accumulated runtime.');
assert.ok(repetitiveState.profile.samples.some((sample) => sample.diveSessionId === firstSessionId));
assert.ok(repetitiveState.profile.samples.some((sample) => sample.diveSessionId === secondSessionId));

// setDepth is an explicit environment command and does not synthesize elapsed time.
const directlyPositioned = setDepth(createSimulation(), 8);
assert.equal(directlyPositioned.environment.depthMeters, 8);
assert.equal(directlyPositioned.clock.elapsedSimulationSeconds, 0);

// 20. Conservative Factor (gradient factor) actually shortens NDL - it must
// not be a dead setting. A lower gradient factor tightens the ceiling
// calculation, so the same tissue loading yields a shorter no-decompression
// time.
let standardNdlState = createSimulation({ gradientFactor: 1 });
standardNdlState = advanceSimulation(standardNdlState, { depthMeters: 25, elapsedSimulationSeconds: 15 * 60 });
let conservativeNdlState = createSimulation({ gradientFactor: 0.8 });
conservativeNdlState = advanceSimulation(conservativeNdlState, { depthMeters: 25, elapsedSimulationSeconds: 15 * 60 });
assert.ok(
  conservativeNdlState.physiology.ndlMinutes < standardNdlState.physiology.ndlMinutes,
  'A lower gradient factor must shorten NDL, not leave it unchanged.',
);
let gfState = setGradientFactor(createSimulation(), 0.8);
assert.equal(gfState.gradientFactor, 0.8);
gfState = advanceSimulation(gfState, { depthMeters: 25, elapsedSimulationSeconds: 15 * 60 });
almostEqual(gfState.physiology.ndlMinutes, conservativeNdlState.physiology.ndlMinutes, 1e-6, 'setGradientFactor must feed the same live physics as passing it at creation.');

// 21. Water type actually changes ambient pressure (and therefore PO2 and
// the depth/pressure relationship) - fresh water is less dense than salt.
let saltState = createSimulation({ waterType: 'salt' });
saltState = setDepth(saltState, 30);
let freshState = createSimulation({ waterType: 'fresh' });
freshState = setDepth(freshState, 30);
assert.ok(freshState.physiology.oxygen.ppO2 < saltState.physiology.oxygen.ppO2, 'The same depth in fresh water must read lower ambient pressure than salt water.');
let waterState = setWaterType(createSimulation({ actualGas: { fo2: 0.21 } }), 'fresh');
waterState = setDepth(waterState, 30);
almostEqual(waterState.physiology.oxygen.ppO2, freshState.physiology.oxygen.ppO2, 1e-9, 'setWaterType must feed the same live physics as passing it at creation.');

// 22. The PO2 alarm setpoint is a live physics input to warningFacts, except
// decompression forces the effective threshold to 1.60 regardless of setpoint.
let po2State = createSimulation({ actualGas: { fo2: 0.32 }, po2AlarmSetpoint: 1.2 });
po2State = advanceSimulation(po2State, { depthMeters: 30, elapsedSimulationSeconds: 5 });
assert.equal(po2State.po2AlarmSetpoint, 1.2);
almostEqual(po2State.physiology.oxygen.ppO2, 1.28, 1e-9);
assert.equal(po2State.warnings.modExceeded, true, 'FO2 0.32 at 30m (ppO2 1.28) must exceed a 1.2 setpoint.');
let higherSetpointState = setPo2AlarmSetpoint(createSimulation({ actualGas: { fo2: 0.32 } }), 1.6);
higherSetpointState = advanceSimulation(higherSetpointState, { depthMeters: 30, elapsedSimulationSeconds: 5 });
assert.equal(higherSetpointState.warnings.modExceeded, false, 'The same ppO2 (1.28) must not exceed a 1.6 setpoint.');
let decoPo2State = createSimulation({ actualGas: { fo2: 0.21 }, po2AlarmSetpoint: 1.6 });
decoPo2State = advanceSimulation(decoPo2State, { depthMeters: 30, elapsedSimulationSeconds: 5 });
decoPo2State = advanceSimulation(decoPo2State, { depthMeters: 30, elapsedSimulationSeconds: 35 * 60 });
assert.equal(decoPo2State.physiology.decompression.required, true);
assert.ok(decoPo2State.physiology.oxygen.ppO2 < 1.6, 'This scenario keeps ppO2 under the configured setpoint.');

// 23. Deep stop (manual Dive Features, page 13): off by default; eligible
// (preview) past the 24m trigger once enabled, while more than 3m deeper
// than the calculated stop (max depth / 2); activates only on ascending
// into the stop +3m band; a fixed 2:00 countdown; completes and then
// latches permanently - it never re-arms, unlike Safety Stop.
let offDeepState = createSimulation();
offDeepState = advanceSimulation(offDeepState, { depthMeters: 30, elapsedSimulationSeconds: 5 });
assert.equal(offDeepState.deepStopEnabled, false);
assert.equal(offDeepState.deepStop.status, 'notEligible', 'Deep stop must stay inert unless explicitly enabled.');

let deepState = setDeepStopEnabled(createSimulation(), true);
assert.equal(deepState.deepStopEnabled, true);
deepState = advanceSimulation(deepState, { depthMeters: 30, elapsedSimulationSeconds: 5 });
assert.equal(deepState.deepStop.status, 'eligible', 'Past 24m with deep stop on must become eligible.');
assert.equal(deepState.deepStop.stopDepthMeters, 15, 'Deep stop depth is max depth / 2.');
assert.equal(deepState.deepStop.remainingSeconds, SIMULATION_LIMITS.deepStopSeconds);
assert.equal(SIMULATION_LIMITS.deepStopSeconds, 120, 'Deep stop duration is fixed at 2:00, per the manual (Dive Features, page 13).');

deepState = advanceSimulation(deepState, { depthMeters: 19, elapsedSimulationSeconds: 60 });
assert.equal(deepState.deepStop.status, 'eligible', 'Still more than 3m deeper than the stop (15m) - preview only, not yet armed.');

deepState = advanceSimulation(deepState, { depthMeters: 15, elapsedSimulationSeconds: 60 });
assert.equal(deepState.deepStop.status, 'active', 'Ascending into the stop+3m band must arm the stop.');

deepState = advanceSimulation(deepState, { depthMeters: 15, elapsedSimulationSeconds: 130 });
assert.equal(deepState.deepStop.status, 'completed');
assert.equal(deepState.deepStop.remainingSeconds, 0);

deepState = advanceSimulation(deepState, { depthMeters: 20, elapsedSimulationSeconds: 30 });
deepState = advanceSimulation(deepState, { depthMeters: 15, elapsedSimulationSeconds: 30 });
assert.equal(deepState.deepStop.status, 'completed', 'Deep stop never retriggers, unlike safety stop.');

let shallowDeepState = setDeepStopEnabled(createSimulation(), true);
shallowDeepState = advanceSimulation(shallowDeepState, { depthMeters: 18, elapsedSimulationSeconds: 5 });
assert.equal(shallowDeepState.deepStop.status, 'notEligible', 'A dive shallower than the 24m trigger must never become eligible.');

// 23b. While active, the continuing tolerance is symmetric (+/-3m, unlike
// Safety Stop's descend-only cancel condition) and sustained excursion past
// it for 10s permanently disables the stop - it never resumes.
let disableState = setDeepStopEnabled(createSimulation(), true);
disableState = advanceSimulation(disableState, { depthMeters: 30, elapsedSimulationSeconds: 5 });
disableState = advanceSimulation(disableState, { depthMeters: 15, elapsedSimulationSeconds: 120 });
assert.equal(disableState.deepStop.status, 'active');
disableState = advanceSimulation(disableState, { depthMeters: 10, elapsedSimulationSeconds: 5 });
assert.equal(disableState.deepStop.status, 'active', 'A brief excursion outside +/-3m must not immediately disable it - there is a 10s grace.');
disableState = advanceSimulation(disableState, { depthMeters: 10, elapsedSimulationSeconds: 10 });
assert.equal(disableState.deepStop.status, 'disabled', 'Sustained excursion past the tolerance for 10s+ permanently disables it.');
disableState = advanceSimulation(disableState, { depthMeters: 15, elapsedSimulationSeconds: 30 });
assert.equal(disableState.deepStop.status, 'disabled', 'Deep stop never resumes once disabled, even back inside the zone.');

// 23c. Exceeding the maximum functional depth (57m) disables deep stop
// outright - the same disableConditionMet path also covers entering
// decompression, O2 SAT >=80%, and PO2 >= the alarm setpoint.
let depthDisableState = setDeepStopEnabled(createSimulation(), true);
depthDisableState = advanceSimulation(depthDisableState, { depthMeters: 60, elapsedSimulationSeconds: 5 });
assert.equal(depthDisableState.deepStop.status, 'disabled', 'Exceeding 57m disables deep stop even before it would otherwise activate.');

// 18/19. The engine executes in Node and has no UI, React, lesson, or future-device imports.
const forbiddenPatterns = [
  /from\s+['"]react['"]/i,
  /from\s+['"]react-native['"]/i,
  /require\(['"]react(?:-native)?['"]\)/i,
  /(?:^|[\\/])screens(?:[\\/]|$)/i,
  /(?:^|[\\/])components(?:[\\/]|$)/i,
  /lessonDefinitions/i,
  /(?:^|[\\/])training(?:[\\/]|$)/i,
  /virtualDiveComputer/i,
];
for (const filename of fs.readdirSync(domainRoot).filter((name) => name.endsWith('.js'))) {
  const source = fs.readFileSync(path.join(domainRoot, filename), 'utf8');
  for (const pattern of forbiddenPatterns) {
    assert.doesNotMatch(source, pattern, `${filename} violates the diveSimulation dependency boundary.`);
  }
}

console.log('Dive simulation Phase 1 behavioral checks passed.');
