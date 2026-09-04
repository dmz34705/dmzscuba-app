import { SIMULATION_LIMITS, selectAscentRateMpm, waterTemperatureCelsius } from '../diveSimulation';
import {
  DEVICE_SCREENS,
  DISPLAY_ONLY_SCREENS,
  diveSequenceIds,
  FIELD_STEPPERS,
  LEAD_IN_TARGETS,
  surfaceSequenceIds,
} from './screenGraph';
import {
  DEVICE_EVENTS,
  DEVICE_LIFECYCLES,
  DISPLAY_MODES,
} from './types';
import { highestPriorityWarning, warningPresentationsForFacts } from './warnings';

const DEFAULT_LONG_PRESS_THRESHOLD_MS = 650;
const PLANNER_MIN_DEPTH = 6;
const PLANNER_MAX_DEPTH = 40;
const PLANNER_STEP = 3;

function clamp(value, minimum, maximum) {
  const numeric = Number(value);
  return Math.min(maximum, Math.max(minimum, Number.isFinite(numeric) ? numeric : minimum));
}

function unique(values) {
  return [...new Set(values)];
}

function minTemperature(current, candidate) {
  if (!Number.isFinite(candidate)) return current;
  return current == null ? candidate : Math.min(current, candidate);
}

function cycleScreen(currentScreen, screens) {
  const currentIndex = screens.indexOf(currentScreen);
  return screens[(currentIndex + 1 + screens.length) % screens.length];
}

function getPath(source, path) {
  return path.split('.').reduce((accumulator, key) => (accumulator == null ? accumulator : accumulator[key]), source);
}

function setPath(source, path, value) {
  const [head, ...rest] = path.split('.');
  if (rest.length === 0) return { ...source, [head]: value };
  return { ...source, [head]: setPath(source[head] ?? {}, rest.join('.'), value) };
}

// ---- Generic top-level sequence navigation (ADV walks the linear menu). ----

function enterScreen(state, screenId) {
  const stepper = FIELD_STEPPERS[screenId];
  const editing = stepper ? { draftValue: stepper.fromState ? stepper.fromState(getPath(state, stepper.valuePath)) : getPath(state, stepper.valuePath), fieldId: screenId } : null;
  return {
    ...state,
    currentScreen: screenId,
    displayMode: editing ? DISPLAY_MODES.EDIT : DISPLAY_MODES.SURFACE,
    editing,
  };
}

function enterGasScreen(state, screenId) {
  return { ...state, currentScreen: screenId, displayMode: DISPLAY_MODES.EDIT, editing: { draftValue: gasDraftValue(state, screenId), fieldId: screenId } };
}

function handleSequenceEvent(state, event) {
  const screenId = state.currentScreen;
  if (event.type === DEVICE_EVENTS.LEFT_SHORT) {
    const ids = surfaceSequenceIds(state);
    const currentIndex = ids.indexOf(screenId);
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % ids.length;
    return enterScreen(state, ids[nextIndex]);
  }
  if (event.type === DEVICE_EVENTS.LEFT_LONG) return enterScreen(state, DEVICE_SCREENS.SURFACE_HOME);
  if (event.type === DEVICE_EVENTS.RIGHT_SHORT) {
    if (DISPLAY_ONLY_SCREENS.includes(screenId) || screenId === DEVICE_SCREENS.SURFACE_HOME) return state;
    if (screenId === DEVICE_SCREENS.SN) return enterScreen(state, DEVICE_SCREENS.SURFACE_HOME);
    const target = LEAD_IN_TARGETS[screenId];
    if (!target) return state;
    if (target === DEVICE_SCREENS.SET_AIR_EAN) return enterGasScreen(state, DEVICE_SCREENS.SET_AIR_EAN);
    return enterScreen(state, target);
  }
  return state;
}

// ---- Generic field-stepper screens (ADV cycles a draft, SEL commits). ----

function cycleFieldValue(stepper, currentValue, direction) {
  if (stepper.kind === 'toggle') {
    const [first, second] = stepper.options;
    return currentValue === first ? second : first;
  }
  if (stepper.kind === 'enum') {
    const index = stepper.options.indexOf(currentValue);
    const nextIndex = (((index === -1 ? 0 : index) + direction) % stepper.options.length + stepper.options.length) % stepper.options.length;
    return stepper.options[nextIndex];
  }
  const isOff = currentValue == null;
  if (direction > 0) {
    if (isOff) return stepper.min;
    const next = currentValue + stepper.step;
    return next > stepper.max ? (stepper.offValue !== undefined ? stepper.offValue : stepper.min) : next;
  }
  if (isOff) return stepper.max;
  const previous = currentValue - stepper.step;
  return previous < stepper.min ? (stepper.offValue !== undefined ? stepper.offValue : stepper.max) : previous;
}

function handleFieldStepperEvent(state, event) {
  const screenId = state.currentScreen;
  const stepper = FIELD_STEPPERS[screenId];
  if (event.type === DEVICE_EVENTS.LEFT_SHORT || event.type === DEVICE_EVENTS.LEFT_LONG) {
    const direction = event.type === DEVICE_EVENTS.LEFT_LONG && stepper.kind === 'range' ? -1 : 1;
    return { ...state, editing: { ...state.editing, draftValue: cycleFieldValue(stepper, state.editing.draftValue, direction) } };
  }
  if (event.type === DEVICE_EVENTS.RIGHT_SHORT) {
    const stored = stepper.toState ? stepper.toState(state.editing.draftValue) : state.editing.draftValue;
    const committed = setPath(state, stepper.valuePath, stored);
    return enterScreen({ ...committed, editing: null }, stepper.next(state.editing.draftValue));
  }
  if (event.type === DEVICE_EVENTS.RIGHT_LONG) return enterScreen({ ...state, editing: null }, stepper.parent);
  return state;
}

// ---- SET GAS: single gas only. Air/EAN toggle, then (EAN only) FO2, then
// PO2 alarm, then back to lead-in. The manual's Gas Menu (for switching
// between Gas 2/3 in-dive) never appears - it's permanently bypassed when
// Gas 2 is off, and this simulator never has a Gas 2. ----

function gasDraftValue(state, screenId) {
  if (screenId === DEVICE_SCREENS.SET_AIR_EAN) return state.configuredGas.fo2 === 0.21 ? 'air' : 'ean';
  if (screenId === DEVICE_SCREENS.GAS_FO2) return Math.round(state.configuredGas.fo2 * 100);
  return state.configuredGas.po2Alarm;
}

function cycleGasFo2(current, direction) {
  if (direction > 0) return current >= 100 ? 21 : current + 1;
  return current <= 21 ? 100 : current - 1;
}

function returnToGasLeadIn(state, configuredGas) {
  return { ...state, configuredGas: configuredGas ?? state.configuredGas, currentScreen: DEVICE_SCREENS.SET_GAS_LEAD_IN, displayMode: DISPLAY_MODES.SURFACE, editing: null };
}

function handleGasEvent(state, event) {
  const screenId = state.currentScreen;

  if (event.type === DEVICE_EVENTS.RIGHT_LONG) return returnToGasLeadIn(state);

  if (screenId === DEVICE_SCREENS.SET_AIR_EAN) {
    if (event.type === DEVICE_EVENTS.LEFT_SHORT || event.type === DEVICE_EVENTS.LEFT_LONG) {
      return { ...state, editing: { ...state.editing, draftValue: state.editing.draftValue === 'air' ? 'ean' : 'air' } };
    }
    if (event.type === DEVICE_EVENTS.RIGHT_SHORT) {
      if (state.editing.draftValue === 'air') {
        return returnToGasLeadIn(state, { ...state.configuredGas, fo2: 0.21 });
      }
      return enterGasScreen(state, DEVICE_SCREENS.GAS_FO2);
    }
    return state;
  }

  if (screenId === DEVICE_SCREENS.GAS_FO2) {
    if (event.type === DEVICE_EVENTS.LEFT_SHORT || event.type === DEVICE_EVENTS.LEFT_LONG) {
      const direction = event.type === DEVICE_EVENTS.LEFT_SHORT ? 1 : -1;
      return { ...state, editing: { ...state.editing, draftValue: cycleGasFo2(state.editing.draftValue, direction) } };
    }
    if (event.type === DEVICE_EVENTS.RIGHT_SHORT) {
      const configuredGas = { ...state.configuredGas, fo2: state.editing.draftValue / 100 };
      return enterGasScreen({ ...state, configuredGas }, DEVICE_SCREENS.GAS_PO2);
    }
    return state;
  }

  // PO2 alarm screen.
  if (event.type === DEVICE_EVENTS.LEFT_SHORT || event.type === DEVICE_EVENTS.LEFT_LONG) {
    const direction = event.type === DEVICE_EVENTS.LEFT_SHORT ? 1 : -1;
    const next = Math.round(clamp(state.editing.draftValue + direction * 0.1, 1.0, 1.6) * 10) / 10;
    return { ...state, editing: { ...state.editing, draftValue: next } };
  }
  if (event.type === DEVICE_EVENTS.RIGHT_SHORT) {
    const configuredGas = { ...state.configuredGas, po2Alarm: state.editing.draftValue };
    return returnToGasLeadIn(state, configuredGas);
  }
  return state;
}

// ---- LOG: preview cycles recorded dives; inside a dive's data pages, ADV
// always backs out to preview and SEL advances deeper (the one place in this
// whole spec where ADV means "back," per the manual's own button diagram). ----

function handleLogEvent(state, event) {
  const screenId = state.currentScreen;
  const entries = state.logbook.entries;

  if (screenId === DEVICE_SCREENS.LOG_PREVIEW) {
    if (event.type === DEVICE_EVENTS.LEFT_SHORT && entries.length) {
      return { ...state, logbook: { ...state.logbook, selectedIndex: (state.logbook.selectedIndex + 1) % entries.length } };
    }
    if (event.type === DEVICE_EVENTS.LEFT_LONG) return { ...state, currentScreen: DEVICE_SCREENS.LOG_LEAD_IN, displayMode: DISPLAY_MODES.SURFACE };
    if (event.type === DEVICE_EVENTS.RIGHT_SHORT && entries.length) return { ...state, currentScreen: DEVICE_SCREENS.LOG_DATA_1, displayMode: DISPLAY_MODES.SURFACE };
    return state;
  }

  if (event.type === DEVICE_EVENTS.LEFT_SHORT || event.type === DEVICE_EVENTS.LEFT_LONG) {
    return { ...state, currentScreen: DEVICE_SCREENS.LOG_PREVIEW, displayMode: DISPLAY_MODES.SURFACE };
  }
  if (event.type === DEVICE_EVENTS.RIGHT_SHORT) {
    const entry = entries[state.logbook.selectedIndex];
    const isNitrox = Boolean(entry && entry.fo2 > 0.21);
    if (screenId === DEVICE_SCREENS.LOG_DATA_1) return { ...state, currentScreen: DEVICE_SCREENS.LOG_DATA_2, displayMode: DISPLAY_MODES.SURFACE };
    if (screenId === DEVICE_SCREENS.LOG_DATA_2) return { ...state, currentScreen: DEVICE_SCREENS.LOG_DATA_3, displayMode: DISPLAY_MODES.SURFACE };
    if (screenId === DEVICE_SCREENS.LOG_DATA_3) {
      return isNitrox
        ? { ...state, currentScreen: DEVICE_SCREENS.LOG_DATA_4, displayMode: DISPLAY_MODES.SURFACE }
        : { ...state, currentScreen: DEVICE_SCREENS.LOG_PREVIEW, displayMode: DISPLAY_MODES.SURFACE };
    }
    return { ...state, currentScreen: DEVICE_SCREENS.LOG_LEAD_IN, displayMode: DISPLAY_MODES.SURFACE };
  }
  return state;
}

// ---- PLAN: live depth stepper; the NDL/O2-MIN evaluation itself is computed
// in displayModel.js from this chosen depth against the live tissue state. ----

function handlePlanEvent(state, event) {
  if (event.type === DEVICE_EVENTS.LEFT_SHORT) {
    const depthMeters = state.planner.depthMeters + PLANNER_STEP > PLANNER_MAX_DEPTH ? PLANNER_MIN_DEPTH : state.planner.depthMeters + PLANNER_STEP;
    return { ...state, planner: { depthMeters } };
  }
  if (event.type === DEVICE_EVENTS.LEFT_LONG) {
    const depthMeters = state.planner.depthMeters - PLANNER_STEP < PLANNER_MIN_DEPTH ? PLANNER_MAX_DEPTH : state.planner.depthMeters - PLANNER_STEP;
    return { ...state, planner: { depthMeters } };
  }
  if (event.type === DEVICE_EVENTS.RIGHT_SHORT || event.type === DEVICE_EVENTS.RIGHT_LONG) {
    return { ...state, currentScreen: DEVICE_SCREENS.PLAN_LEAD_IN, displayMode: DISPLAY_MODES.SURFACE };
  }
  return state;
}

// ---- HISTORY: TOT dIVES (the lead-in itself) -> TOTAL HOURS -> EXTREMES. ----

function handleHistoryEvent(state, event) {
  const screenId = state.currentScreen;
  if (screenId === DEVICE_SCREENS.TOTAL_HOURS) {
    if (event.type === DEVICE_EVENTS.LEFT_SHORT || event.type === DEVICE_EVENTS.LEFT_LONG) {
      return { ...state, currentScreen: DEVICE_SCREENS.HISTORY_LEAD_IN, displayMode: DISPLAY_MODES.SURFACE };
    }
    if (event.type === DEVICE_EVENTS.RIGHT_SHORT) return { ...state, currentScreen: DEVICE_SCREENS.EXTREMES, displayMode: DISPLAY_MODES.SURFACE };
    return state;
  }
  if (event.type === DEVICE_EVENTS.LEFT_SHORT || event.type === DEVICE_EVENTS.LEFT_LONG) {
    return { ...state, currentScreen: DEVICE_SCREENS.TOTAL_HOURS, displayMode: DISPLAY_MODES.SURFACE };
  }
  if (event.type === DEVICE_EVENTS.RIGHT_SHORT || event.type === DEVICE_EVENTS.RIGHT_LONG) {
    return { ...state, currentScreen: DEVICE_SCREENS.HISTORY_LEAD_IN, displayMode: DISPLAY_MODES.SURFACE };
  }
  return state;
}

// ---- Underwater dive-mode screens (manual pages 31-43). ADV cycles through
// the automatic screen plus the ALT_2/ALT_3/deep-stop-preview sequence;
// holding ADV returns to the automatic screen, or (if already there) toggles
// the manual Timer. SEL acknowledges warnings, or starts/stops the Timer
// when it's visible. ----

function handleDiveEvent(state, event) {
  if (state.warning.active && !state.warning.active.acknowledged && (
    event.type === DEVICE_EVENTS.RIGHT_SHORT || event.type === DEVICE_EVENTS.RIGHT_LONG
  )) return acknowledgeWarning(state);
  if (event.type === DEVICE_EVENTS.LEFT_SHORT) {
    const screens = unique([state.automaticDiveScreen, ...diveSequenceIds(state)]);
    return { ...state, currentScreen: cycleScreen(state.currentScreen, screens) };
  }
  if (event.type === DEVICE_EVENTS.LEFT_LONG) {
    if (state.currentScreen !== state.automaticDiveScreen) return { ...state, currentScreen: state.automaticDiveScreen };
    return { ...state, timer: { ...state.timer, visible: !state.timer.visible } };
  }
  if (event.type === DEVICE_EVENTS.RIGHT_SHORT && state.timer.visible) {
    return { ...state, timer: { ...state.timer, running: !state.timer.running } };
  }
  return state;
}

function acknowledgeWarning(state) {
  if (!state.warning.active || state.warning.active.acknowledged) return state;
  const returnScreen = state.warning.returnScreen || DEVICE_SCREENS.DIVE_PRIMARY;
  return {
    ...state,
    currentScreen: returnScreen,
    displayMode: DISPLAY_MODES.DIVE,
    warning: {
      ...state.warning,
      acknowledgedCodes: unique([...state.warning.acknowledgedCodes, state.warning.active.code]),
      active: { ...state.warning.active, acknowledged: true },
      flashOn: false,
    },
  };
}

function diveConditionForSimulation(device, simulation) {
  if (simulation.physiology.decompression.required) return 'decompression';
  if (simulation.deepStop.status === 'active') return 'deepStop';
  if (device.settings.safetyStopEnabled && simulation.safetyStop.status === 'active') return 'safetyStop';
  return 'normal';
}

function screenForDiveCondition(condition) {
  if (condition === 'decompression') return DEVICE_SCREENS.DIVE_DECOMPRESSION;
  if (condition === 'deepStop') return DEVICE_SCREENS.DIVE_DEEP_STOP_MAIN;
  if (condition === 'safetyStop') return DEVICE_SCREENS.DIVE_SAFETY_STOP;
  return DEVICE_SCREENS.DIVE_PRIMARY;
}

// ---- Logbook + History bookkeeping, fed by the device's own running dive
// stats (tracked below in synchronizeWithSimulation) rather than by touching
// the Phase 1 physics engine. ----

function freshDiveStats() {
  return { ascentRateMax: 0, depthSamples: 0, depthSum: 0, ppO2Max: 0 };
}

function addLogbookEntry(state, simulation) {
  const stats = state.diveStats;
  const averageDepthMeters = stats.depthSamples > 0 ? stats.depthSum / stats.depthSamples : simulation.dive.maximumDepthMeters;
  const entry = {
    averageDepthMeters,
    configuredFo2: state.configuredGas.fo2,
    deepStopTriggered: state.observedDeepStopStatus === 'completed' || state.observedDeepStopStatus === 'active' || state.observedDeepStopStatus === 'disabled',
    diveNumber: simulation.dive.completedDiveCount,
    endOfDiveCnsPercent: simulation.physiology.oxygen.cnsPercent,
    fo2: simulation.environment.actualGas.fo2,
    highestPpO2: stats.ppO2Max,
    maxAscentRateMpm: stats.ascentRateMax,
    maxTissueLoadingPercent: simulation.physiology.tissueLoadingPercent,
    maximumDepthMeters: simulation.dive.maximumDepthMeters,
    preDiveSurfaceIntervalSeconds: state.lastSurfaceIntervalSeconds ?? 0,
    profileSampleCount: simulation.profile.samples.length,
    runtimeSeconds: simulation.dive.runtimeSeconds,
    surfacedAtSimulationSeconds: simulation.clock.elapsedSimulationSeconds,
  };
  const deepestDiveMeters = Math.max(state.history.deepestDiveMeters, entry.maximumDepthMeters);
  const longestDiveSeconds = Math.max(state.history.longestDiveSeconds, entry.runtimeSeconds);
  const existingIndex = state.logbook.entries.findIndex((candidate) => candidate.diveNumber === entry.diveNumber);
  if (simulation.dive.completedDiveCount <= state.logbook.lastRecordedDiveCount) {
    if (existingIndex < 0) return state;
    const previousEntry = state.logbook.entries[existingIndex];
    const entries = state.logbook.entries.slice();
    entries[existingIndex] = entry;
    return {
      ...state,
      history: {
        ...state.history,
        deepestDiveMeters,
        longestDiveSeconds,
        totalMinutes: state.history.totalMinutes
          + Math.round(entry.runtimeSeconds / 60)
          - Math.round(previousEntry.runtimeSeconds / 60),
      },
      logbook: { ...state.logbook, entries },
    };
  }
  return {
    ...state,
    history: {
      ...state.history,
      deepestDiveMeters,
      longestDiveSeconds,
      totalDives: state.history.totalDives + 1,
      totalMinutes: state.history.totalMinutes + Math.round(entry.runtimeSeconds / 60),
    },
    logbook: {
      ...state.logbook,
      entries: [entry, ...state.logbook.entries].slice(0, 24),
      lastRecordedDiveCount: simulation.dive.completedDiveCount,
      selectedIndex: 0,
    },
  };
}

function synchronizeWithSimulation(state, simulation) {
  if (!simulation || simulation.schemaVersion !== 1) {
    throw new TypeError('SIMULATION_UPDATED requires a public DiveSimulationState.');
  }

  const simulationLifecycle = simulation.dive.lifecycle;
  let next = { ...state, observedSimulationLifecycle: simulationLifecycle };

  if (simulationLifecycle === 'diving') {
    const enteringDive = state.observedSimulationLifecycle !== 'diving';
    const continuingLoggedDive = enteringDive && simulation.dive.isContinuation;
    const diveCondition = diveConditionForSimulation(state, simulation);
    const conditionChanged = state.observedDiveCondition !== diveCondition;
    const automaticDiveScreen = screenForDiveCondition(diveCondition);
    const ascentRateMpm = selectAscentRateMpm(simulation);
    next = {
      ...next,
      automaticDiveScreen,
      diveStats: enteringDive && !continuingLoggedDive
        ? { ascentRateMax: ascentRateMpm, depthSamples: 1, depthSum: simulation.environment.depthMeters, ppO2Max: simulation.physiology.oxygen.ppO2 }
        : {
          ascentRateMax: Math.max(state.diveStats.ascentRateMax, ascentRateMpm),
          depthSamples: state.diveStats.depthSamples + 1,
          depthSum: state.diveStats.depthSum + simulation.environment.depthMeters,
          ppO2Max: Math.max(state.diveStats.ppO2Max, simulation.physiology.oxygen.ppO2),
        },
      history: {
        ...next.history,
        lowestTemperature: minTemperature(
          next.history.lowestTemperature,
          waterTemperatureCelsius(simulation.environment.depthMeters),
        ),
      },
      lifecycle: DEVICE_LIFECYCLES.DIVE,
      observedDeepStopStatus: simulation.deepStop.status,
      observedDiveCondition: diveCondition,
      timer: enteringDive ? { running: false, seconds: 0, visible: false } : next.timer,
      warning: enteringDive
        ? { ...next.warning, acknowledgedCodes: [], active: null, activeFactCodes: [], latchedCodes: [], returnScreen: null }
        : next.warning,
    };

    const presentations = warningPresentationsForFacts(simulation.warnings);
    const highest = highestPriorityWarning(simulation.warnings);
    const sameWarning = highest && next.warning.active?.code === highest.code;
    const active = highest ? { ...highest, acknowledged: sameWarning ? next.warning.active.acknowledged : false } : null;
    const currentDiveScreen = [automaticDiveScreen, ...diveSequenceIds(next)].includes(next.currentScreen) ? next.currentScreen : automaticDiveScreen;
    const returnScreen = enteringDive || conditionChanged ? automaticDiveScreen : currentDiveScreen;
    return {
      ...next,
      currentScreen: active && !active.acknowledged ? DEVICE_SCREENS.DIVE_WARNING : returnScreen,
      displayMode: active && !active.acknowledged ? DISPLAY_MODES.WARNING : DISPLAY_MODES.DIVE,
      editing: null,
      warning: {
        ...next.warning,
        active,
        activeFactCodes: presentations.map((warning) => warning.code),
        flashOn: Boolean(active && !active.acknowledged) ? next.warning.flashOn : false,
        latchedCodes: unique([...next.warning.latchedCodes, ...presentations.map((warning) => warning.code)]),
        returnScreen,
      },
    };
  }

  if (simulationLifecycle === 'postDive') {
    next = addLogbookEntry(next, simulation);
    if (state.observedSimulationLifecycle === 'postDive') {
      // The engine only leaves 'postDive' once the surface interval clock runs
      // out the post-dive window. A paused simulation never gets there, so the
      // device would otherwise sit in POST_DIVE forever. Once the window has
      // elapsed - or the simulation is paused and can no longer advance it -
      // settle back to the ordinary surface lifecycle.
      const windowElapsed = simulation.dive.surfaceIntervalSeconds >= SIMULATION_LIMITS.surfaceModeDelaySeconds;
      const stalledPaused = simulation.clock.status !== 'running';
      if ((windowElapsed || stalledPaused) && next.lifecycle === DEVICE_LIFECYCLES.POST_DIVE) {
        return { ...next, lifecycle: DEVICE_LIFECYCLES.SURFACE };
      }
      return next;
    }
    return {
      ...next,
      currentScreen: DEVICE_SCREENS.SURFACE_HOME,
      displayMode: DISPLAY_MODES.SURFACE,
      editing: null,
      lifecycle: DEVICE_LIFECYCLES.POST_DIVE,
      timer: { running: false, seconds: 0, visible: false },
      warning: { ...next.warning, active: null, activeFactCodes: [], flashOn: false, returnScreen: null },
    };
  }

  // Surfaced (not diving, not in the post-dive window): keep tracking the
  // last known surface interval so the next dive's log entry can record
  // "surface interval before this dive," and drop back to the home screen
  // once the post-dive window itself has elapsed.
  next = { ...next, lastSurfaceIntervalSeconds: simulation.dive.surfaceIntervalSeconds };
  if (state.observedSimulationLifecycle === 'postDive') {
    return { ...next, currentScreen: DEVICE_SCREENS.SURFACE_HOME, displayMode: DISPLAY_MODES.SURFACE, lifecycle: DEVICE_LIFECYCLES.SURFACE };
  }
  return next;
}

// ---- Public API. ----

export function createVirtualDiveComputer(config = {}) {
  const configuredFo2 = clamp(config.configuredGas?.fo2 ?? 0.21, 0.21, 1);
  const depthUnit = config.units?.depth === 'm' ? 'm' : 'ft';
  const temperatureUnit = config.units?.temperature === 'C' ? 'C' : 'F';
  return {
    schemaVersion: 1,
    alarms: { audible: true, depth: null, dtr: null, edt: null, n2: null },
    automaticDiveScreen: DEVICE_SCREENS.DIVE_PRIMARY,
    clock: { elapsedSeconds: 0 },
    configuredGas: { fo2: configuredFo2, po2Alarm: config.configuredGas?.po2Alarm ?? 1.4 },
    currentScreen: DEVICE_SCREENS.SURFACE_HOME,
    dateTime: { day: 1, hour: 9, minute: 0, month: 1, year: 2026 },
    displayMode: DISPLAY_MODES.SURFACE,
    diveStats: freshDiveStats(),
    editing: null,
    history: { deepestDiveMeters: 0, highestElevationMeters: 0, longestDiveSeconds: 0, lowestTemperature: null, totalDives: 0, totalMinutes: 0 },
    input: { lastEvent: null, longPressThresholdMs: config.longPressThresholdMs ?? DEFAULT_LONG_PRESS_THRESHOLD_MS },
    lastSurfaceIntervalSeconds: 0,
    lifecycle: DEVICE_LIFECYCLES.SURFACE,
    logbook: {
      entries: Array.isArray(config.logbookEntries) ? config.logbookEntries.slice() : [],
      lastRecordedDiveCount: config.lastRecordedDiveCount ?? 0,
      selectedIndex: 0,
    },
    observedDeepStopStatus: 'notEligible',
    observedDiveCondition: 'normal',
    observedSimulationLifecycle: null,
    planner: { depthMeters: clamp(config.plannerDepthMeters ?? 18, PLANNER_MIN_DEPTH, PLANNER_MAX_DEPTH) },
    settings: {
      bluetooth: false,
      conservatism: config.conservatism === 'conservative' ? 'conservative' : 'standard',
      dateFormat: 'M-D',
      deepStop: false,
      h2oActivation: true,
      h2oType: 'salt',
      hourFormat: 12,
      lightDurationSeconds: 5,
      mode: 'dive',
      safetyStopDepthMeters: SIMULATION_LIMITS.defaultSafetyStopDepthMeters,
      safetyStopEnabled: config.safetyStopEnabled !== false,
      safetyStopMinutes: 3,
      sampleRateSeconds: 15,
      units: { depth: depthUnit, temperature: temperatureUnit },
    },
    timer: { running: false, seconds: 0, visible: false },
    warning: { acknowledgedCodes: [], active: null, activeFactCodes: [], flashOn: false, latchedCodes: [], returnScreen: null },
  };
}

const GAS_SCREENS = new Set([DEVICE_SCREENS.SET_AIR_EAN, DEVICE_SCREENS.GAS_FO2, DEVICE_SCREENS.GAS_PO2]);
const LOG_SCREENS = new Set([
  DEVICE_SCREENS.LOG_PREVIEW, DEVICE_SCREENS.LOG_DATA_1, DEVICE_SCREENS.LOG_DATA_2, DEVICE_SCREENS.LOG_DATA_3, DEVICE_SCREENS.LOG_DATA_4,
]);
const HISTORY_SCREENS = new Set([DEVICE_SCREENS.TOTAL_HOURS, DEVICE_SCREENS.EXTREMES]);

export function transitionVirtualDiveComputer(state, event) {
  if (!event || !Object.values(DEVICE_EVENTS).includes(event.type)) {
    throw new TypeError('Unknown virtual dive computer event.');
  }
  if (event.type === DEVICE_EVENTS.SIMULATION_UPDATED) return synchronizeWithSimulation(state, event.simulation);
  if (event.type === DEVICE_EVENTS.BOTH_LONG) {
    // Underwater the two-button hold has nothing to return to - the dive
    // screens are driven by the simulation - so it is a deliberate no-op.
    if (state.lifecycle === DEVICE_LIFECYCLES.DIVE) return state;
    return enterScreen(
      { ...state, editing: null, lifecycle: DEVICE_LIFECYCLES.SURFACE },
      DEVICE_SCREENS.SURFACE_HOME,
    );
  }
  if (event.type === DEVICE_EVENTS.TICK) {
    const elapsedSeconds = Math.max(0, Number(event.elapsedSeconds) || 0);
    const deviceSeconds = state.clock.elapsedSeconds + elapsedSeconds;
    const shouldFlash = Boolean(state.warning.active && !state.warning.active.acknowledged);
    return {
      ...state,
      clock: { elapsedSeconds: deviceSeconds },
      input: { ...state.input, lastEvent: event.type },
      timer: state.timer.running ? { ...state.timer, seconds: state.timer.seconds + elapsedSeconds } : state.timer,
      warning: { ...state.warning, flashOn: shouldFlash && Math.floor(deviceSeconds * 2) % 2 === 0 },
    };
  }

  const next = { ...state, input: { ...state.input, lastEvent: event.type } };
  if (next.lifecycle === DEVICE_LIFECYCLES.DIVE) return handleDiveEvent(next, event);
  if (GAS_SCREENS.has(next.currentScreen)) return handleGasEvent(next, event);
  if (LOG_SCREENS.has(next.currentScreen)) return handleLogEvent(next, event);
  if (next.currentScreen === DEVICE_SCREENS.PLAN_ACTIVE) return handlePlanEvent(next, event);
  if (HISTORY_SCREENS.has(next.currentScreen)) return handleHistoryEvent(next, event);
  if (FIELD_STEPPERS[next.currentScreen]) return handleFieldStepperEvent(next, event);
  return handleSequenceEvent(next, event);
}

export function interpretButtonPress(state, button, durationMs) {
  if (button !== 'left' && button !== 'right') throw new TypeError('Button must be left or right.');
  const duration = Math.max(0, Number(durationMs) || 0);
  const kind = duration >= state.input.longPressThresholdMs ? 'long' : 'short';
  return `${button.toUpperCase()}_${kind.toUpperCase()}`;
}
