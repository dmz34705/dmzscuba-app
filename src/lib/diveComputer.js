// TRANSITIONAL PHASE 1 COMPATIBILITY ADAPTER
//
// The UI still consumes the original flat, display-oriented state shape. The
// authoritative dive model now lives in ./diveSimulation. Remove this adapter
// after the virtual dive computer and lessons have migrated to that domain API.

import {
  SIMULATION_LIMITS,
  advanceSimulation,
  createSimulation,
  selectAscentRateMpm,
  selectDiveMode,
  selectDiveTimeRemainingMinutes,
  selectIsDive,
  setActualGas,
} from './diveSimulation';

export const DIVE_COMPUTER_LIMITS = Object.freeze({
  ascentMetersPerMinute: SIMULATION_LIMITS.ascentMetersPerMinute,
  diveStartDepthMeters: SIMULATION_LIMITS.diveStartDepthMeters,
  diveStartSeconds: SIMULATION_LIMITS.diveStartSeconds,
  safetyStopSeconds: SIMULATION_LIMITS.safetyStopSeconds,
  surfaceDepthMeters: SIMULATION_LIMITS.surfaceDepthMeters,
});

const EVENT_PRESENTATION = Object.freeze({
  decompressionRequired: { label: 'Entered decompression', tone: 'warning', type: 'decompression-entry' },
  diveEnded: { label: 'Returned to the surface', tone: 'success', type: 'surface' },
  diveStarted: { label: 'Dive mode activated', tone: 'success', type: 'dive-start' },
  safetyStopCompleted: { label: 'Safety stop complete', tone: 'success', type: 'safety-stop-complete' },
  safetyStopStarted: { label: 'Safety stop started', tone: 'info', type: 'safety-stop' },
});

function alarmPresentation(simulation) {
  if (!selectIsDive(simulation)) return null;
  if (simulation.warnings.ceilingViolation) return { code: 'missed-stop', label: 'DESCEND TO STOP', tone: 'danger' };
  if (simulation.physiology.oxygen.ppO2 >= 1.6) return { code: 'po2-danger', label: 'HIGH PO2', tone: 'danger' };
  if (simulation.warnings.rapidAscent) return { code: 'rapid-ascent', label: 'SLOW ASCENT', tone: 'danger' };
  if (simulation.warnings.decompressionRequired) return { code: 'decompression', label: 'DECOMPRESSION REQUIRED', tone: 'warning' };
  if (simulation.warnings.modExceeded) return { code: 'po2-warning', label: 'PO2 WARNING', tone: 'warning' };
  if (simulation.warnings.lowNdl) return { code: 'low-ndl', label: 'LOW NDL', tone: 'warning' };
  return null;
}

function presentEvents(simulation) {
  return simulation.events.items.slice(-80).map((event) => {
    const presentation = EVENT_PRESENTATION[event.type] || { label: event.type, tone: 'info', type: event.type };
    return {
      id: event.id,
      label: presentation.label,
      simulationSeconds: event.simulationSeconds,
      tone: presentation.tone,
      type: presentation.type,
    };
  });
}

function toLegacyState(simulation, previousLegacy = null) {
  const alarm = alarmPresentation(simulation);
  const acknowledged = Boolean(
    alarm
    && previousLegacy?.activeAlarm?.code === alarm.code
    && previousLegacy.activeAlarm.acknowledged,
  );
  const safetyStarted = simulation.safetyStop.status === 'active'
    || simulation.safetyStop.status === 'paused'
    || simulation.safetyStop.status === 'completed';

  return {
    __simulation: simulation,
    acknowledgedAlarmCode: acknowledged ? alarm.code : null,
    activationSeconds: simulation.dive.activationSeconds,
    activeAlarm: alarm ? { ...alarm, acknowledged } : null,
    ascentRateMpm: selectAscentRateMpm(simulation),
    ceilingMeters: simulation.physiology.decompression.ceilingMeters,
    cnsPercent: simulation.physiology.oxygen.cnsPercent,
    controllingCompartment: simulation.physiology.decompression.controllingCompartment,
    depthMeters: simulation.environment.depthMeters,
    diveSeconds: simulation.dive.runtimeSeconds,
    dtrMinutes: selectDiveTimeRemainingMinutes(simulation),
    events: presentEvents(simulation),
    fo2Percent: simulation.environment.actualGas.fo2 * 100,
    isDive: selectIsDive(simulation),
    lastDepthMeters: simulation.environment.previousDepthMeters,
    maxDepthMeters: simulation.dive.maximumDepthMeters,
    mode: selectDiveMode(simulation),
    ndlMinutes: simulation.physiology.ndlMinutes,
    nextEventId: simulation.events.nextId,
    o2MinutesRemaining: simulation.physiology.oxygen.minutesRemaining,
    ppO2: simulation.physiology.oxygen.ppO2,
    safetyStopCompleted: simulation.safetyStop.status === 'completed',
    safetyStopRemainingSeconds: simulation.safetyStop.remainingSeconds,
    safetyStopStarted: safetyStarted,
    simulationSeconds: simulation.clock.elapsedSimulationSeconds,
    stopDepthMeters: simulation.physiology.decompression.stopDepthMeters,
    stopMinutes: simulation.physiology.decompression.stopMinutes,
    surfaceSeconds: simulation.dive.surfaceIntervalSeconds,
    tissueLoadingPercent: simulation.physiology.tissueLoadingPercent,
    tissues: simulation.physiology.tissues,
  };
}

export function adaptSimulationToDiveComputerState(simulation, previousLegacy = null) {
  return toLegacyState(simulation, previousLegacy);
}

function applyLegacyOverrides(legacyState) {
  const simulation = legacyState.__simulation;
  if (!simulation) return createSimulation({ actualGas: { fo2: (legacyState.fo2Percent ?? 21) / 100 } });

  const safetyStatus = legacyState.safetyStopCompleted
    ? 'completed'
    : legacyState.safetyStopStarted
      ? simulation.safetyStop.status === 'active' ? 'active' : 'paused'
      : simulation.safetyStop.status !== 'notEligible'
        ? 'eligible'
        : 'notEligible';
  const lifecycle = legacyState.isDive
    ? 'diving'
    : legacyState.mode === 'post-dive'
      ? 'postDive'
      : 'surface';
  const decompressionRequired = legacyState.mode === 'decompression'
    ? true
    : legacyState.mode === 'no-decompression' || legacyState.mode === 'safety-stop'
      ? false
      : simulation.physiology.decompression.required;

  return {
    ...simulation,
    clock: { ...simulation.clock, elapsedSimulationSeconds: legacyState.simulationSeconds },
    dive: {
      ...simulation.dive,
      activationSeconds: legacyState.activationSeconds,
      lifecycle,
      maximumDepthMeters: legacyState.maxDepthMeters,
      runtimeSeconds: legacyState.diveSeconds,
      surfaceIntervalSeconds: legacyState.surfaceSeconds,
    },
    environment: {
      ...simulation.environment,
      actualGas: { fo2: legacyState.fo2Percent / 100 },
      depthMeters: legacyState.depthMeters,
      previousDepthMeters: legacyState.lastDepthMeters,
      verticalRateMpm: legacyState.ascentRateMpm,
    },
    physiology: {
      ...simulation.physiology,
      decompression: {
        ...simulation.physiology.decompression,
        ceilingMeters: legacyState.ceilingMeters,
        controllingCompartment: legacyState.controllingCompartment,
        required: decompressionRequired,
        stopDepthMeters: legacyState.stopDepthMeters,
        stopMinutes: legacyState.stopMinutes,
      },
      ndlMinutes: legacyState.ndlMinutes,
      oxygen: {
        cnsPercent: legacyState.cnsPercent,
        minutesRemaining: legacyState.o2MinutesRemaining,
        ppO2: legacyState.ppO2,
      },
      tissueLoadingPercent: legacyState.tissueLoadingPercent,
      tissues: legacyState.tissues,
    },
    safetyStop: {
      remainingSeconds: legacyState.safetyStopRemainingSeconds,
      status: safetyStatus,
    },
  };
}

export function createDiveComputerState({ fo2Percent = 21 } = {}) {
  return toLegacyState(createSimulation({ actualGas: { fo2: fo2Percent / 100 } }));
}

export function stepDiveComputer(previousState, { depthMeters, fo2Percent = previousState.fo2Percent }, seconds = 1) {
  let simulation = applyLegacyOverrides(previousState);
  if (Math.abs(simulation.environment.actualGas.fo2 - fo2Percent / 100) > 1e-10) {
    simulation = setActualGas(simulation, { fo2: fo2Percent / 100 });
  }
  simulation = advanceSimulation(simulation, { depthMeters, elapsedSimulationSeconds: seconds });
  return toLegacyState(simulation, previousState);
}

// Alarm acknowledgement intentionally remains outside the simulation domain.
export function acknowledgeDiveComputerAlarm(state) {
  if (!state.activeAlarm) return state;
  return {
    ...state,
    acknowledgedAlarmCode: state.activeAlarm.code,
    activeAlarm: { ...state.activeAlarm, acknowledged: true },
  };
}

// Scenario convenience remains temporarily for existing screens. The new
// simulation engine has no tutorial, lesson, or scenario knowledge.
export function seedDiveComputerState({ depthMeters = 20, minutesAtDepth = 10, fo2Percent = 21 } = {}) {
  let state = createDiveComputerState({ fo2Percent });
  state = stepDiveComputer(state, { depthMeters, fo2Percent }, SIMULATION_LIMITS.diveStartSeconds);
  state = stepDiveComputer(state, { depthMeters, fo2Percent }, Math.max(0, minutesAtDepth) * 60);
  return {
    ...state,
    activeAlarm: null,
    events: [{
      id: 1,
      label: 'Training scenario loaded',
      simulationSeconds: state.simulationSeconds,
      tone: 'info',
      type: 'scenario-loaded',
    }],
    nextEventId: 2,
  };
}

export function formatSimulationTime(totalSeconds) {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function metersToDisplayDepth(depthMeters, unit = 'ft') {
  return unit === 'm' ? depthMeters : depthMeters * 3.28084;
}

export function displayDepthToMeters(depth, unit = 'ft') {
  return unit === 'm' ? depth : depth / 3.28084;
}

export function formatComputerDepth(depthMeters, unit = 'ft', precision = 0) {
  const value = metersToDisplayDepth(depthMeters, unit);
  return `${value.toFixed(precision)} ${unit}`;
}
