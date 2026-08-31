import { SIMULATION_LIMITS, SIMULATION_SPEEDS } from './constants';
import {
  advancePhysiology,
  clamp,
  createSurfaceTissues,
  derivePhysiology,
  normalizeFo2,
} from './calculations';
import { createProfileSample, recordProfileSample } from './profile';
import { DEEP_STOP_STATUS, DIVE_LIFECYCLES, SAFETY_STOP_STATUS, SIMULATION_CLOCK_STATUS } from './types';
import { selectAscentRateMpm } from './selectors';

const EPSILON = 1e-8;

function assertNonNegativeSeconds(seconds, label) {
  const numeric = Number(seconds);
  if (!Number.isFinite(numeric) || numeric < 0) throw new RangeError(`${label} must be a finite non-negative number.`);
  return numeric;
}

function appendEvent(state, type) {
  const item = {
    depthMeters: state.environment.depthMeters,
    diveRuntimeSeconds: state.dive.runtimeSeconds,
    id: state.events.nextId,
    simulationSeconds: state.clock.elapsedSimulationSeconds,
    type,
  };
  return {
    ...state,
    events: {
      items: [...state.events.items, item],
      nextId: state.events.nextId + 1,
    },
  };
}

function warningFacts(state) {
  const isDive = state.dive.lifecycle === DIVE_LIFECYCLES.DIVING;
  const ceilingMeters = state.physiology.decompression.ceilingMeters;
  const cnsPercent = state.physiology.oxygen.cnsPercent;
  // "Alarm >> at Set Point value, except in Deco then at 1.60 only."
  const po2Threshold = state.physiology.decompression.required ? 1.6 : state.po2AlarmSetpoint;
  return {
    ceilingViolation: isDive && ceilingMeters > 0.3 && state.environment.depthMeters + 0.3 < ceilingMeters,
    decompressionRequired: isDive && state.physiology.decompression.required,
    lowNdl: isDive && state.physiology.ndlMinutes <= 5,
    modExceeded: isDive && state.physiology.oxygen.ppO2 >= po2Threshold,
    o2SatAlarm: isDive && cnsPercent >= 100,
    o2SatWarning: isDive && cnsPercent >= 80 && cnsPercent < 100,
    rapidAscent: isDive && selectAscentRateMpm(state) > SIMULATION_LIMITS.ascentMetersPerMinute,
  };
}

// Safety Stop activates on ascent into the configured stop depth +/- the
// arm tolerance (the default 15 ft stop therefore works from 10-20 ft),
// and only cancels by descending more than
// cancelTolerance below the stop for a sustained graceSeconds - not by
// merely drifting shallow, which the manual doesn't treat as a cancel
// condition. Unlike Deep Stop, it re-arms: completing or cancelling drops
// back to ELIGIBLE so it can retrigger on a later ascent into the zone.
function updateSafetyStop(state, previousState, elapsedSeconds) {
  const isDive = state.dive.lifecycle === DIVE_LIFECYCLES.DIVING;
  const stopDepthMeters = state.safetyStopDepthMeters;
  const eligible = previousState.safetyStop.status !== SAFETY_STOP_STATUS.NOT_ELIGIBLE
    || (isDive && state.dive.maximumDepthMeters >= SIMULATION_LIMITS.safetyStopTriggerDepthMeters);
  if (!eligible) {
    return { ...state, safetyStop: { outOfToleranceSeconds: 0, remainingSeconds: state.safetyStopSeconds, status: SAFETY_STOP_STATUS.NOT_ELIGIBLE, stopDepthMeters } };
  }

  const armZone = Math.abs(state.environment.depthMeters - stopDepthMeters)
    <= SIMULATION_LIMITS.safetyStopArmToleranceMeters + EPSILON;
  const tooDeep = state.environment.depthMeters > stopDepthMeters + SIMULATION_LIMITS.safetyStopCancelToleranceMeters;
  const wasActive = previousState.safetyStop.status === SAFETY_STOP_STATUS.ACTIVE;
  const wasCompleted = previousState.safetyStop.status === SAFETY_STOP_STATUS.COMPLETED;
  const mayStart = isDive && !state.physiology.decompression.required && armZone && selectAscentRateMpm(state) > 0;

  let status = SAFETY_STOP_STATUS.ELIGIBLE;
  let remainingSeconds = state.safetyStopSeconds;
  let outOfToleranceSeconds = 0;
  let next = state;

  if (wasCompleted && armZone) {
    // Stay COMPLETED (0:00) while the diver is still parked at the stop -
    // only leaving the zone re-arms it for a later retrigger.
    status = SAFETY_STOP_STATUS.COMPLETED;
    remainingSeconds = 0;
  } else if (wasActive && !state.physiology.decompression.required) {
    status = SAFETY_STOP_STATUS.ACTIVE;
    remainingSeconds = previousState.safetyStop.remainingSeconds;
    outOfToleranceSeconds = tooDeep ? previousState.safetyStop.outOfToleranceSeconds + elapsedSeconds : 0;
    if (outOfToleranceSeconds >= SIMULATION_LIMITS.stopGraceSeconds) {
      status = SAFETY_STOP_STATUS.ELIGIBLE;
      remainingSeconds = state.safetyStopSeconds;
      outOfToleranceSeconds = 0;
      next = appendEvent(next, 'safetyStopCancelled');
    } else {
      remainingSeconds = Math.max(0, remainingSeconds - elapsedSeconds);
      if (remainingSeconds <= EPSILON) {
        remainingSeconds = 0;
        status = SAFETY_STOP_STATUS.COMPLETED;
        next = appendEvent(next, 'safetyStopCompleted');
      }
    }
  } else if (!wasActive && mayStart) {
    status = SAFETY_STOP_STATUS.ACTIVE;
    next = appendEvent(next, 'safetyStopStarted');
  }

  return { ...next, safetyStop: { outOfToleranceSeconds, remainingSeconds, status, stopDepthMeters } };
}

// Deep Stop activates only on ascent into [stopDepth, stopDepth + tolerance]
// (approaching from below), but once active its continuing tolerance is
// symmetric (+/- tolerance). Unlike Safety Stop, leaving that tolerance for
// graceSeconds - or entering decompression, exceeding the maximum depth, or
// reaching the O2 SAT/PO2 thresholds - permanently DISABLES it for the rest
// of the dive; it never re-arms.
function updateDeepStop(state, previousState, elapsedSeconds) {
  const previousStatus = previousState.deepStop.status;
  if (previousStatus === DEEP_STOP_STATUS.COMPLETED || previousStatus === DEEP_STOP_STATUS.DISABLED) return state;

  const isDive = state.dive.lifecycle === DIVE_LIFECYCLES.DIVING;
  const eligible = state.deepStopEnabled
    && (previousStatus !== DEEP_STOP_STATUS.NOT_ELIGIBLE
      || (isDive && state.dive.maximumDepthMeters >= SIMULATION_LIMITS.deepStopTriggerDepthMeters));
  if (!eligible) {
    return { ...state, deepStop: { outOfToleranceSeconds: 0, remainingSeconds: SIMULATION_LIMITS.deepStopSeconds, status: DEEP_STOP_STATUS.NOT_ELIGIBLE, stopDepthMeters: 0 } };
  }

  const stopDepthMeters = Math.max(0, state.dive.maximumDepthMeters / 2);
  const armZone = state.environment.depthMeters >= stopDepthMeters
    && state.environment.depthMeters <= stopDepthMeters + SIMULATION_LIMITS.deepStopToleranceMeters;
  const inTolerance = Math.abs(state.environment.depthMeters - stopDepthMeters) <= SIMULATION_LIMITS.deepStopToleranceMeters;
  const wasActive = previousStatus === DEEP_STOP_STATUS.ACTIVE;
  const mayStart = isDive && armZone && selectAscentRateMpm(state) > 0;
  const disableConditionMet = state.physiology.decompression.required
    || state.environment.depthMeters > SIMULATION_LIMITS.deepStopMaximumDepthMeters
    || state.physiology.oxygen.cnsPercent >= SIMULATION_LIMITS.deepStopO2SatDisablePercent
    || state.physiology.oxygen.ppO2 >= state.po2AlarmSetpoint;

  let status = DEEP_STOP_STATUS.ELIGIBLE;
  let remainingSeconds = SIMULATION_LIMITS.deepStopSeconds;
  let outOfToleranceSeconds = 0;
  let next = state;

  if (wasActive) {
    remainingSeconds = previousState.deepStop.remainingSeconds;
    if (disableConditionMet) {
      status = DEEP_STOP_STATUS.DISABLED;
      next = appendEvent(next, 'deepStopDisabled');
    } else {
      status = DEEP_STOP_STATUS.ACTIVE;
      outOfToleranceSeconds = inTolerance ? 0 : previousState.deepStop.outOfToleranceSeconds + elapsedSeconds;
      if (outOfToleranceSeconds >= SIMULATION_LIMITS.stopGraceSeconds) {
        status = DEEP_STOP_STATUS.DISABLED;
        next = appendEvent(next, 'deepStopDisabled');
      } else {
        remainingSeconds = Math.max(0, remainingSeconds - elapsedSeconds);
        if (remainingSeconds <= EPSILON) {
          remainingSeconds = 0;
          status = DEEP_STOP_STATUS.COMPLETED;
          next = appendEvent(next, 'deepStopCompleted');
        }
      }
    }
  } else if (disableConditionMet) {
    status = DEEP_STOP_STATUS.DISABLED;
  } else if (mayStart) {
    status = DEEP_STOP_STATUS.ACTIVE;
    next = appendEvent(next, 'deepStopStarted');
  }

  return { ...next, deepStop: { outOfToleranceSeconds, remainingSeconds, status, stopDepthMeters } };
}

function resetDiveAggregates(state) {
  return {
    ...state,
    deepStop: {
      outOfToleranceSeconds: 0,
      remainingSeconds: SIMULATION_LIMITS.deepStopSeconds,
      status: DEEP_STOP_STATUS.NOT_ELIGIBLE,
      stopDepthMeters: 0,
    },
    dive: {
      ...state.dive,
      maximumDepthMeters: state.environment.depthMeters,
      runtimeSeconds: 0,
      surfaceIntervalSeconds: 0,
    },
    safetyStop: {
      outOfToleranceSeconds: 0,
      remainingSeconds: state.safetyStopSeconds,
      status: SAFETY_STOP_STATUS.NOT_ELIGIBLE,
      stopDepthMeters: state.safetyStopDepthMeters,
    },
  };
}

function advanceInterval(previousState, endDepthMeters, elapsedSeconds) {
  const startDepth = previousState.environment.depthMeters;
  const endDepth = clamp(endDepthMeters, 0, SIMULATION_LIMITS.maximumDepthMeters);
  const minutes = elapsedSeconds / 60;
  const verticalRateMpm = minutes > 0 ? (startDepth - endDepth) / minutes : 0;
  const physiology = advancePhysiology(
    previousState.physiology,
    startDepth,
    endDepth,
    previousState.environment.actualGas.fo2,
    elapsedSeconds,
    previousState.waterType,
    previousState.gradientFactor,
  );

  let state = {
    ...previousState,
    clock: {
      ...previousState.clock,
      elapsedSimulationSeconds: previousState.clock.elapsedSimulationSeconds + elapsedSeconds,
    },
    environment: {
      ...previousState.environment,
      depthMeters: endDepth,
      previousDepthMeters: startDepth,
      verticalRateMpm,
    },
    physiology,
  };

  if (previousState.dive.lifecycle !== DIVE_LIFECYCLES.DIVING) {
    const activationSeconds = endDepth >= SIMULATION_LIMITS.diveStartDepthMeters
      ? previousState.dive.activationSeconds + elapsedSeconds
      : 0;
    const surfaceIntervalSeconds = previousState.dive.completedDiveCount > 0
      ? previousState.dive.surfaceIntervalSeconds + elapsedSeconds
      : 0;
    state = {
      ...state,
      dive: { ...state.dive, activationSeconds, surfaceIntervalSeconds },
    };

    if (activationSeconds >= SIMULATION_LIMITS.diveStartSeconds) {
      const isContinuation = previousState.dive.lifecycle === DIVE_LIFECYCLES.POST_DIVE
        && previousState.dive.surfaceIntervalSeconds < SIMULATION_LIMITS.surfaceModeDelaySeconds
        && previousState.dive.diveSessionId > 0;
      const activatedState = {
        ...state,
        dive: {
          ...state.dive,
          activationSeconds: 0,
          diveSessionId: isContinuation ? state.dive.diveSessionId : state.dive.diveSessionId + 1,
          isContinuation,
          lifecycle: DIVE_LIFECYCLES.DIVING,
          surfaceIntervalSeconds: 0,
        },
      };
      state = isContinuation ? activatedState : resetDiveAggregates(activatedState);
      state = appendEvent(state, isContinuation ? 'diveResumed' : 'diveStarted');
    } else if (
      previousState.dive.lifecycle === DIVE_LIFECYCLES.POST_DIVE
      && surfaceIntervalSeconds >= SIMULATION_LIMITS.surfaceModeDelaySeconds
    ) {
      state = { ...state, dive: { ...state.dive, lifecycle: DIVE_LIFECYCLES.SURFACE } };
    }
  } else if (endDepth <= SIMULATION_LIMITS.surfaceDepthMeters) {
    state = {
      ...state,
      dive: {
        ...state.dive,
        completedDiveCount: previousState.dive.completedDiveCount + (previousState.dive.isContinuation ? 0 : 1),
        isContinuation: false,
        lifecycle: DIVE_LIFECYCLES.POST_DIVE,
        runtimeSeconds: previousState.dive.runtimeSeconds + elapsedSeconds,
        surfaceIntervalSeconds: 0,
      },
    };
    state = appendEvent(state, 'diveEnded');
  } else {
    state = {
      ...state,
      dive: {
        ...state.dive,
        maximumDepthMeters: Math.max(previousState.dive.maximumDepthMeters, endDepth),
        runtimeSeconds: previousState.dive.runtimeSeconds + elapsedSeconds,
        surfaceIntervalSeconds: 0,
      },
    };
  }

  const wasDeco = previousState.physiology.decompression.required;
  state = updateSafetyStop(state, previousState, elapsedSeconds);
  state = updateDeepStop(state, previousState, elapsedSeconds);
  if (!wasDeco && state.physiology.decompression.required && state.dive.lifecycle === DIVE_LIFECYCLES.DIVING) {
    state = appendEvent(state, 'decompressionRequired');
  }
  return { ...state, warnings: warningFacts(state) };
}

function moveToward(current, target, maximumDelta) {
  if (Math.abs(target - current) <= maximumDelta + EPSILON) return target;
  return current + Math.sign(target - current) * maximumDelta;
}

/** @returns {import('./types').DiveSimulationState} */
export function createSimulation(config = {}) {
  const speed = config.simulationSpeed ?? 1;
  if (!SIMULATION_SPEEDS.includes(speed)) throw new RangeError('Simulation speed must be one of: 1, 5, 10, 20.');
  const fo2 = normalizeFo2(config.actualGas?.fo2 ?? 0.21);
  const depthMeters = clamp(config.depthMeters ?? 0, 0, SIMULATION_LIMITS.maximumDepthMeters);
  const tissues = createSurfaceTissues();
  const gradientFactor = clamp(config.gradientFactor ?? 1, 0.01, 1);
  const waterType = config.waterType === 'fresh' ? 'fresh' : 'salt';
  const po2AlarmSetpoint = clamp(config.po2AlarmSetpoint ?? 1.4, 1.0, 1.6);
  const deepStopEnabled = Boolean(config.deepStopEnabled);
  const safetyStopDepthMeters = clamp(
    config.safetyStopDepthMeters ?? SIMULATION_LIMITS.defaultSafetyStopDepthMeters,
    3,
    6,
  );
  const safetyStopSeconds = clamp(config.safetyStopSeconds ?? SIMULATION_LIMITS.safetyStopSeconds, 1, 3600);
  const physiology = derivePhysiology({ cnsPercent: 0, depthMeters, fo2, gradientFactor, tissues, waterType });
  let state = {
    schemaVersion: 1,
    clock: {
      elapsedSimulationSeconds: 0,
      speed,
      status: config.running ? SIMULATION_CLOCK_STATUS.RUNNING : SIMULATION_CLOCK_STATUS.PAUSED,
    },
    controls: {
      ascentRateMpm: clamp(config.ascentRateMpm ?? 6, 0.1, 60),
      descentRateMpm: clamp(config.descentRateMpm ?? 18, 0.1, 60),
      targetDepthMeters: depthMeters,
    },
    deepStop: {
      outOfToleranceSeconds: 0,
      remainingSeconds: SIMULATION_LIMITS.deepStopSeconds,
      status: DEEP_STOP_STATUS.NOT_ELIGIBLE,
      stopDepthMeters: 0,
    },
    deepStopEnabled,
    dive: {
      activationSeconds: 0,
      completedDiveCount: 0,
      diveSessionId: 0,
      isContinuation: false,
      lifecycle: DIVE_LIFECYCLES.SURFACE,
      maximumDepthMeters: 0,
      runtimeSeconds: 0,
      surfaceIntervalSeconds: 0,
    },
    environment: {
      actualGas: { fo2 },
      depthMeters,
      previousDepthMeters: depthMeters,
      verticalRateMpm: 0,
    },
    events: { items: [], nextId: 1 },
    gradientFactor,
    physiology,
    po2AlarmSetpoint,
    profile: {
      nextSampleAtSeconds: SIMULATION_LIMITS.profileSampleIntervalSeconds,
      sampleIntervalSeconds: SIMULATION_LIMITS.profileSampleIntervalSeconds,
      samples: [],
    },
    safetyStop: {
      outOfToleranceSeconds: 0,
      remainingSeconds: safetyStopSeconds,
      status: SAFETY_STOP_STATUS.NOT_ELIGIBLE,
      stopDepthMeters: safetyStopDepthMeters,
    },
    safetyStopDepthMeters,
    safetyStopSeconds,
    warnings: {
      ceilingViolation: false,
      decompressionRequired: false,
      lowNdl: false,
      modExceeded: false,
      o2SatAlarm: false,
      o2SatWarning: false,
      rapidAscent: false,
    },
    waterType,
  };
  state = { ...state, profile: { ...state.profile, samples: [createProfileSample(state)] } };
  return state;
}

export function advanceSimulation(state, { depthMeters, elapsedSimulationSeconds }) {
  const totalSeconds = assertNonNegativeSeconds(elapsedSimulationSeconds, 'elapsedSimulationSeconds');
  if (totalSeconds <= EPSILON) return state;
  const startDepth = state.environment.depthMeters;
  const explicitDepth = depthMeters == null ? null : clamp(depthMeters, 0, SIMULATION_LIMITS.maximumDepthMeters);
  let elapsed = 0;
  let next = state;

  while (elapsed < totalSeconds - EPSILON) {
    const timeWithinPhysicsStep = next.clock.elapsedSimulationSeconds % SIMULATION_LIMITS.physicsStepSeconds;
    const untilPhysicsBoundary = timeWithinPhysicsStep <= EPSILON
      ? SIMULATION_LIMITS.physicsStepSeconds
      : SIMULATION_LIMITS.physicsStepSeconds - timeWithinPhysicsStep;
    const interval = Math.min(totalSeconds - elapsed, untilPhysicsBoundary);
    let intervalDepth;
    if (explicitDepth != null) {
      intervalDepth = startDepth + (explicitDepth - startDepth) * ((elapsed + interval) / totalSeconds);
    } else {
      const target = next.controls.targetDepthMeters;
      const rate = target > next.environment.depthMeters
        ? next.controls.descentRateMpm
        : next.controls.ascentRateMpm;
      intervalDepth = moveToward(next.environment.depthMeters, target, rate / 60 * interval);
    }
    next = advanceInterval(next, intervalDepth, interval);
    elapsed += interval;
    if (next.clock.elapsedSimulationSeconds + EPSILON >= next.profile.nextSampleAtSeconds) {
      next = recordProfileSample(next);
    }
  }
  return next;
}

export function stepSimulation(state, elapsedRealSeconds) {
  const realSeconds = assertNonNegativeSeconds(elapsedRealSeconds, 'elapsedRealSeconds');
  if (state.clock.status !== SIMULATION_CLOCK_STATUS.RUNNING || realSeconds <= EPSILON) return state;
  let remainingRealSeconds = realSeconds;
  let next = state;

  while (remainingRealSeconds > EPSILON) {
    const intervalSpeed = next.clock.speed;
    const intervalSimulationSeconds = Math.min(
      SIMULATION_LIMITS.physicsStepSeconds,
      remainingRealSeconds * intervalSpeed,
    );
    const advanced = advanceSimulation(next, { elapsedSimulationSeconds: intervalSimulationSeconds });
    const newEngineEvent = advanced.events.items.length > next.events.items.length;
    const lifecycleChanged = advanced.dive.lifecycle !== next.dive.lifecycle;
    const newWarningFact = Object.keys(advanced.warnings).some(
      (warning) => advanced.warnings[warning] && !next.warnings[warning],
    );
    next = intervalSpeed !== 1 && (newEngineEvent || lifecycleChanged || newWarningFact)
      ? { ...advanced, clock: { ...advanced.clock, speed: 1 } }
      : advanced;
    remainingRealSeconds -= intervalSimulationSeconds / intervalSpeed;
  }

  return next;
}

export function setTargetDepth(state, depthMeters, options = {}) {
  return {
    ...state,
    controls: {
      ascentRateMpm: options.ascentRateMpm == null
        ? state.controls.ascentRateMpm
        : clamp(options.ascentRateMpm, 0.1, 60),
      descentRateMpm: options.descentRateMpm == null
        ? state.controls.descentRateMpm
        : clamp(options.descentRateMpm, 0.1, 60),
      targetDepthMeters: clamp(depthMeters, 0, SIMULATION_LIMITS.maximumDepthMeters),
    },
  };
}

export function setDepth(state, depthMeters) {
  const depth = clamp(depthMeters, 0, SIMULATION_LIMITS.maximumDepthMeters);
  const physiology = derivePhysiology({
    cnsPercent: state.physiology.oxygen.cnsPercent,
    depthMeters: depth,
    fo2: state.environment.actualGas.fo2,
    gradientFactor: state.gradientFactor,
    tissues: state.physiology.tissues,
    waterType: state.waterType,
  });
  const next = {
    ...state,
    controls: { ...state.controls, targetDepthMeters: depth },
    environment: {
      ...state.environment,
      depthMeters: depth,
      previousDepthMeters: depth,
      verticalRateMpm: 0,
    },
    physiology,
  };
  return { ...next, warnings: warningFacts(next) };
}

export function setActualGas(state, actualGas) {
  const fo2 = normalizeFo2(actualGas?.fo2);
  const physiology = derivePhysiology({
    cnsPercent: state.physiology.oxygen.cnsPercent,
    depthMeters: state.environment.depthMeters,
    fo2,
    gradientFactor: state.gradientFactor,
    tissues: state.physiology.tissues,
    waterType: state.waterType,
  });
  const next = {
    ...state,
    environment: { ...state.environment, actualGas: { fo2 } },
    physiology,
  };
  return { ...next, warnings: warningFacts(next) };
}

function recomputePhysiologyOnly(state) {
  const physiology = derivePhysiology({
    cnsPercent: state.physiology.oxygen.cnsPercent,
    depthMeters: state.environment.depthMeters,
    fo2: state.environment.actualGas.fo2,
    gradientFactor: state.gradientFactor,
    tissues: state.physiology.tissues,
    waterType: state.waterType,
  });
  const next = { ...state, physiology };
  return { ...next, warnings: warningFacts(next) };
}

export function setGradientFactor(state, gradientFactor) {
  return recomputePhysiologyOnly({ ...state, gradientFactor: clamp(gradientFactor, 0.01, 1) });
}

export function setWaterType(state, waterType) {
  return recomputePhysiologyOnly({ ...state, waterType: waterType === 'fresh' ? 'fresh' : 'salt' });
}

export function setPo2AlarmSetpoint(state, po2AlarmSetpoint) {
  const next = { ...state, po2AlarmSetpoint: clamp(po2AlarmSetpoint, 1.0, 1.6) };
  return { ...next, warnings: warningFacts(next) };
}

export function setDeepStopEnabled(state, enabled) {
  return { ...state, deepStopEnabled: Boolean(enabled) };
}

export function setSafetyStopDepthMeters(state, safetyStopDepthMeters) {
  return { ...state, safetyStopDepthMeters: clamp(safetyStopDepthMeters, 3, 6) };
}

export function setSafetyStopSeconds(state, safetyStopSeconds) {
  return { ...state, safetyStopSeconds: clamp(safetyStopSeconds, 1, 3600) };
}

export function setSimulationSpeed(state, speed) {
  if (!SIMULATION_SPEEDS.includes(speed)) throw new RangeError('Simulation speed must be one of: 1, 5, 10, 20.');
  return { ...state, clock: { ...state.clock, speed } };
}

export function pauseSimulation(state) {
  if (state.clock.status === SIMULATION_CLOCK_STATUS.PAUSED) return state;
  return { ...state, clock: { ...state.clock, status: SIMULATION_CLOCK_STATUS.PAUSED } };
}

export function resumeSimulation(state) {
  if (state.clock.status === SIMULATION_CLOCK_STATUS.RUNNING) return state;
  return { ...state, clock: { ...state.clock, status: SIMULATION_CLOCK_STATUS.RUNNING } };
}

export function surfaceSimulation(state, options = {}) {
  return setTargetDepth(state, 0, options);
}
