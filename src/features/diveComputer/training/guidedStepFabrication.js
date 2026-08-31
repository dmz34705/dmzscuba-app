// DEV-ONLY. Fast-forwards the simulator + virtual device to the state the
// guided lesson should be in the moment a given step finishes, so the hidden
// "Next (DEV)" button can jump through the lesson while keeping the computer,
// the simulation, and a plausible logbook in sync. Nothing here runs in the
// shipped student flow - `advance({ force: true })` is the only caller and that
// path is gated behind `__DEV__` in the screen.
//
// Dives are run through the real physics + device state machine (not faked
// numbers), so tissue loading, NDLs, stop timers, and logbook entries are all
// internally consistent. Menu positions are reached by replaying real button
// presses. The result is a `{ device, scenarioId, simulation, stage }` snapshot
// compatible with `useDiveComputerSimulator().restoreSnapshot`.

import {
  advanceSimulation,
  createSimulation,
  pauseSimulation,
  resumeSimulation,
  setDeepStopEnabled,
} from '../../../lib/diveSimulation';
import {
  DEVICE_EVENTS,
  DEVICE_SCREENS,
  createVirtualDiveComputer,
  transitionVirtualDiveComputer,
} from '../../../lib/virtualDiveComputer';

const SCENARIO_ID = 'guided-dive';
const SURFACE_INTERVAL_SECONDS = 660; // > surfaceModeDelaySeconds, so the next dive is not a continuation

function snapshot(device, simulation) {
  return { device, scenarioId: SCENARIO_ID, simulation, stage: 0 };
}

function sync(device, simulation) {
  return transitionVirtualDiveComputer(device, { type: DEVICE_EVENTS.SIMULATION_UPDATED, simulation });
}

function pressUntil(device, type, predicate, limit = 130) {
  let next = device;
  for (let i = 0; i < limit && !predicate(next); i += 1) {
    next = transitionVirtualDiveComputer(next, { type });
  }
  return next;
}

function stepBoth(pair, depthMeters, elapsedSimulationSeconds) {
  const simulation = advanceSimulation(pair.simulation, { depthMeters, elapsedSimulationSeconds });
  return { device: sync(pair.device, simulation), simulation };
}

function freshPair(depthUnit) {
  const simulation = createSimulation({ actualGas: { fo2: 0.21 } });
  const device = sync(
    createVirtualDiveComputer({ configuredGas: { fo2: 0.21 }, units: { depth: depthUnit === 'm' ? 'm' : 'ft' } }),
    simulation,
  );
  return { device, simulation };
}

// ---- Clock / calendar walk (steps `surface-ready` .. `set-day`). ----

function commitField(device, targetDraftValue) {
  const stepped = pressUntil(device, DEVICE_EVENTS.LEFT_SHORT, (d) => d.editing && d.editing.draftValue === targetDraftValue);
  return transitionVirtualDiveComputer(stepped, { type: DEVICE_EVENTS.RIGHT_SHORT });
}

function buildClockSnapshot(depthUnit, actualTime, stopAt) {
  const base = freshPair(depthUnit);
  let device = pressUntil(base.device, DEVICE_EVENTS.LEFT_SHORT, (d) => d.currentScreen === DEVICE_SCREENS.SET_TIME_LEAD_IN);
  const done = () => snapshot(sync(device, base.simulation), base.simulation);
  if (stopAt === 'leadIn') return done();
  device = transitionVirtualDiveComputer(device, { type: DEVICE_EVENTS.RIGHT_SHORT }); // -> DATE_FORMAT
  if (stopAt === 'dateFormat') return done();
  device = transitionVirtualDiveComputer(device, { type: DEVICE_EVENTS.RIGHT_SHORT }); // -> HOUR_FORMAT
  if (stopAt === 'hourFormat') return done();
  device = transitionVirtualDiveComputer(device, { type: DEVICE_EVENTS.RIGHT_SHORT }); // -> SET_HOUR
  if (stopAt === 'hour') return done();
  device = commitField(device, actualTime.getHours()); // -> SET_MINUTE
  if (stopAt === 'minute') return done();
  device = commitField(device, actualTime.getMinutes()); // -> SET_YEAR
  if (stopAt === 'year') return done();
  device = commitField(device, actualTime.getFullYear()); // -> SET_MONTH
  if (stopAt === 'month') return done();
  device = commitField(device, actualTime.getMonth() + 1); // -> SET_DAY
  if (stopAt === 'day') return done();
  device = commitField(device, actualTime.getDate()); // -> SET_TIME_LEAD_IN
  return done();
}

// ---- Dives, run for real through the engine. ----

function diveOne(pair, phase) {
  let s = { ...pair, simulation: resumeSimulation(pair.simulation) };
  s = stepBoth(s, 6, 20); // drop past the activation depth
  if (phase === 'start') return s;
  s = stepBoth(s, 18, 130); // descend to the training depth
  s = stepBoth(s, 18, 90);
  if (phase === 'bottom') return s;
  s = stepBoth(s, 18, 600); // ten minutes at depth
  if (phase === 'tenMin') return s;
  s = stepBoth(s, 4.6, 150); // ascend into the safety-stop band
  if (phase === 'safetyActive') return s;
  s = stepBoth(s, 4.6, 210); // hold it to completion
  if (phase === 'safetyDone') return s;
  s = stepBoth(s, 0, 60); // surface
  s = stepBoth(s, 0, 2);
  s = stepBoth(s, 0, SURFACE_INTERVAL_SECONDS);
  return { device: s.device, simulation: pauseSimulation(s.simulation) };
}

function diveTwo(pair, phase) {
  let s = {
    device: { ...pair.device, settings: { ...pair.device.settings, deepStop: true } },
    simulation: setDeepStopEnabled(resumeSimulation(pair.simulation), true),
  };
  s = stepBoth(s, 6, 20);
  if (phase === 'start') return s;
  s = stepBoth(s, 30, 200); // descend to 30 m so a deep stop is required
  s = stepBoth(s, 30, 90);
  if (phase === 'bottom') return s;
  s = stepBoth(s, 30, 300); // bottom time
  s = stepBoth(s, 15, 120); // ascend to the deep-stop depth (maxDepth / 2)
  if (phase === 'deepActive') return s;
  s = stepBoth(s, 15, 150); // hold the deep stop to completion
  if (phase === 'deepDone') return s;
  s = stepBoth(s, 4.6, 110); // continue up into the safety-stop band
  if (phase === 'safetyActive') return s;
  s = stepBoth(s, 4.6, 210); // hold the safety stop to completion
  s = stepBoth(s, 0, 60);
  s = stepBoth(s, 0, 2);
  s = stepBoth(s, 0, SURFACE_INTERVAL_SECONDS);
  return { device: s.device, simulation: pauseSimulation(s.simulation) };
}

function diveThree(pair) {
  // A clean qualifying knowledge-check dive: over ten minutes, shallow enough
  // (< deepStopTriggerDepthMeters) that only a safety stop activates.
  let s = { device: pair.device, simulation: resumeSimulation(pair.simulation) };
  s = stepBoth(s, 12, 120);
  s = stepBoth(s, 12, 600);
  s = stepBoth(s, 4.6, 120);
  s = stepBoth(s, 4.6, 220);
  s = stepBoth(s, 0, 60);
  s = stepBoth(s, 0, 2);
  s = stepBoth(s, 0, SURFACE_INTERVAL_SECONDS);
  return { device: s.device, simulation: pauseSimulation(s.simulation) };
}

// Completed-dive states are deterministic and get reused by many steps, so the
// (relatively costly) physics run is memoized. Nothing downstream mutates these
// snapshots - navigation and `withXOn` helpers all return fresh objects.
const completedDiveCache = new Map();
function memoized(key, build) {
  if (!completedDiveCache.has(key)) completedDiveCache.set(key, build());
  return completedDiveCache.get(key);
}

const afterDiveOne = (depthUnit) => memoized(`dive1:${depthUnit}`, () => diveOne(freshPair(depthUnit), 'surface'));
const afterDiveTwo = (depthUnit) => memoized(`dive2:${depthUnit}`, () => diveTwo(afterDiveOne(depthUnit), 'surface'));
const afterQuizDive = (depthUnit) => memoized(`dive3:${depthUnit}`, () => diveThree(afterDiveTwo(depthUnit)));

// ---- Post-dive menu navigation. ----

function toLeadIn(screenId) {
  return (device) => pressUntil(device, DEVICE_EVENTS.LEFT_SHORT, (d) => d.currentScreen === screenId);
}

function toHome(device) {
  return transitionVirtualDiveComputer(device, { type: DEVICE_EVENTS.LEFT_LONG });
}

function toPlannerActive(device) {
  const leadIn = pressUntil(device, DEVICE_EVENTS.LEFT_SHORT, (d) => d.currentScreen === DEVICE_SCREENS.PLAN_LEAD_IN);
  return transitionVirtualDiveComputer(leadIn, { type: DEVICE_EVENTS.RIGHT_SHORT });
}

function toDeepStopSetting(device) {
  const leadIn = pressUntil(device, DEVICE_EVENTS.LEFT_SHORT, (d) => d.currentScreen === DEVICE_SCREENS.SET_UTIL_LEAD_IN);
  const entered = transitionVirtualDiveComputer(leadIn, { type: DEVICE_EVENTS.RIGHT_SHORT });
  return pressUntil(entered, DEVICE_EVENTS.RIGHT_SHORT, (d) => d.currentScreen === DEVICE_SCREENS.DEEP_STOP);
}

function toLogEntry(selectedIndex, screenId) {
  return (device) => {
    const leadIn = pressUntil(device, DEVICE_EVENTS.LEFT_SHORT, (d) => d.currentScreen === DEVICE_SCREENS.LOG_LEAD_IN);
    let d = transitionVirtualDiveComputer(leadIn, { type: DEVICE_EVENTS.RIGHT_SHORT }); // LOG_PREVIEW
    d = pressUntil(d, DEVICE_EVENTS.LEFT_SHORT, (x) => x.logbook.selectedIndex === selectedIndex, 8);
    if (screenId === DEVICE_SCREENS.LOG_PREVIEW) return d;
    d = transitionVirtualDiveComputer(d, { type: DEVICE_EVENTS.RIGHT_SHORT }); // LOG_DATA_1
    if (screenId === DEVICE_SCREENS.LOG_DATA_1) return d;
    d = transitionVirtualDiveComputer(d, { type: DEVICE_EVENTS.RIGHT_SHORT }); // LOG_DATA_2
    if (screenId === DEVICE_SCREENS.LOG_DATA_2) return d;
    return transitionVirtualDiveComputer(d, { type: DEVICE_EVENTS.RIGHT_SHORT }); // LOG_DATA_3
  };
}

function withDeepStopOn(pair) {
  return {
    device: { ...pair.device, settings: { ...pair.device.settings, deepStop: true } },
    simulation: setDeepStopEnabled(pair.simulation, true),
  };
}

function withBluetoothOn(pair) {
  return {
    device: { ...pair.device, settings: { ...pair.device.settings, bluetooth: true } },
    simulation: pair.simulation,
  };
}

function navigated(pair, navigate) {
  return snapshot(navigate(pair.device), pair.simulation);
}

const fromPair = (pair) => snapshot(pair.device, pair.simulation);
const diveOneAt = (depthUnit, phase) => fromPair(diveOne(freshPair(depthUnit), phase));
const diveTwoAt = (depthUnit, phase) => fromPair(diveTwo(afterDiveOne(depthUnit), phase));

/**
 * @param {string} stepId - the guided step the student is leaving
 * @returns {{device: object, scenarioId: string, simulation: object, stage: number}|null}
 *   a snapshot for `restoreSnapshot`, or null when there is nothing to fabricate
 *   (the final step, or an unknown id).
 */
export function buildGuidedStepCompletionSnapshot(stepId, { depthUnit = 'ft', actualTime = new Date() } = {}) {
  switch (stepId) {
    case 'introduction': {
      const p = freshPair(depthUnit);
      return snapshot(p.device, p.simulation);
    }

    case 'surface-ready': return buildClockSnapshot(depthUnit, actualTime, 'leadIn');
    case 'enter-set-time': return buildClockSnapshot(depthUnit, actualTime, 'dateFormat');
    case 'set-date-format': return buildClockSnapshot(depthUnit, actualTime, 'hourFormat');
    case 'set-hour-format': return buildClockSnapshot(depthUnit, actualTime, 'hour');
    case 'set-hour': return buildClockSnapshot(depthUnit, actualTime, 'minute');
    case 'set-minute': return buildClockSnapshot(depthUnit, actualTime, 'year');
    case 'set-year': return buildClockSnapshot(depthUnit, actualTime, 'month');
    case 'set-month': return buildClockSnapshot(depthUnit, actualTime, 'day');
    case 'set-day': return buildClockSnapshot(depthUnit, actualTime, 'done');

    case 'go-dive': return diveOneAt(depthUnit, 'start');
    case 'activate-dive': return diveOneAt(depthUnit, 'bottom');
    case 'accumulate-time': return diveOneAt(depthUnit, 'tenMin');
    case 'enter-safety-stop': return diveOneAt(depthUnit, 'safetyActive');
    case 'complete-safety-stop':
    case 'explain-safety-stop': return diveOneAt(depthUnit, 'safetyDone');
    case 'surface': return fromPair(afterDiveOne(depthUnit));

    case 'planner-nav': return navigated(afterDiveOne(depthUnit), toLeadIn(DEVICE_SCREENS.PLAN_LEAD_IN));
    case 'planner-open':
    case 'planner-read': return navigated(afterDiveOne(depthUnit), toPlannerActive);
    case 'planner-exit': return navigated(afterDiveOne(depthUnit), toLeadIn(DEVICE_SCREENS.SET_UTIL_LEAD_IN));
    case 'util-open': return navigated(afterDiveOne(depthUnit), toDeepStopSetting);
    case 'deep-stop-enable': return navigated(withDeepStopOn(afterDiveOne(depthUnit)), toHome);

    case 'deep-stop-start': return diveTwoAt(depthUnit, 'start');
    case 'deep-stop-descent': return diveTwoAt(depthUnit, 'bottom');
    case 'deep-stop-enter': return diveTwoAt(depthUnit, 'deepActive');
    case 'deep-stop-complete': return diveTwoAt(depthUnit, 'deepDone');
    case 'deep-stop-safety-stop': return diveTwoAt(depthUnit, 'safetyActive');
    case 'deep-stop-surface': return fromPair(afterDiveTwo(depthUnit));

    case 'log-nav': return navigated(afterDiveTwo(depthUnit), toLeadIn(DEVICE_SCREENS.LOG_LEAD_IN));
    case 'log-open': return navigated(afterDiveTwo(depthUnit), toLogEntry(0, DEVICE_SCREENS.LOG_PREVIEW));
    case 'log-latest-page-1': return navigated(afterDiveTwo(depthUnit), toLogEntry(0, DEVICE_SCREENS.LOG_DATA_1));
    case 'log-latest-page-2': return navigated(afterDiveTwo(depthUnit), toLogEntry(0, DEVICE_SCREENS.LOG_DATA_2));
    case 'log-latest-page-3': return navigated(afterDiveTwo(depthUnit), toLogEntry(0, DEVICE_SCREENS.LOG_DATA_3));
    case 'log-select-earlier':
    case 'log-earlier-page-1': return navigated(afterDiveTwo(depthUnit), toLogEntry(1, DEVICE_SCREENS.LOG_DATA_1));
    case 'log-earlier-page-2': return navigated(afterDiveTwo(depthUnit), toLogEntry(1, DEVICE_SCREENS.LOG_DATA_2));
    case 'log-earlier-page-3': return navigated(afterDiveTwo(depthUnit), toLogEntry(1, DEVICE_SCREENS.LOG_DATA_3));
    case 'log-exit': return navigated(afterDiveTwo(depthUnit), toLeadIn(DEVICE_SCREENS.LOG_LEAD_IN));

    case 'quiz-intro': return navigated(afterDiveTwo(depthUnit), toHome);
    case 'quiz-bluetooth': return navigated(withBluetoothOn(afterDiveTwo(depthUnit)), toHome);
    case 'quiz-log-po2': return navigated(withBluetoothOn(afterDiveTwo(depthUnit)), toLogEntry(0, DEVICE_SCREENS.LOG_DATA_3));
    case 'quiz-dive': return fromPair(withBluetoothOn(afterQuizDive(depthUnit)));

    case 'complete':
    default:
      return null;
  }
}
