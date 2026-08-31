/**
 * @typedef {'surface'|'diving'|'postDive'} DiveLifecycle
 * @typedef {'paused'|'running'} SimulationClockStatus
 * @typedef {'notEligible'|'eligible'|'active'|'paused'|'completed'} SafetyStopStatus
 * @typedef {'notEligible'|'eligible'|'active'|'completed'|'disabled'} DeepStopStatus
 * @typedef {'fresh'|'salt'} WaterType
 *
 * @typedef {Object} DiveSimulationState
 * @property {1} schemaVersion
 * @property {{status: SimulationClockStatus, speed: 1|5|10|20, elapsedSimulationSeconds: number}} clock
 * @property {{depthMeters: number, previousDepthMeters: number, verticalRateMpm: number, actualGas: {fo2: number}}} environment
 * @property {{targetDepthMeters: number, descentRateMpm: number, ascentRateMpm: number}} controls
 * @property {{lifecycle: DiveLifecycle, activationSeconds: number, runtimeSeconds: number, surfaceIntervalSeconds: number, maximumDepthMeters: number, completedDiveCount: number, diveSessionId: number, isContinuation: boolean}} dive
 * @property {{tissues: number[], ndlMinutes: number, tissueLoadingPercent: number, oxygen: {ppO2: number, cnsPercent: number, minutesRemaining: number}, decompression: {required: boolean, ceilingMeters: number, stopDepthMeters: number, stopMinutes: number, controllingCompartment: number}}} physiology
 * @property {{status: SafetyStopStatus, remainingSeconds: number, stopDepthMeters: number, outOfToleranceSeconds: number}} safetyStop
 * @property {{status: DeepStopStatus, remainingSeconds: number, stopDepthMeters: number, outOfToleranceSeconds: number}} deepStop
 * @property {boolean} deepStopEnabled
 * @property {number} gradientFactor
 * @property {WaterType} waterType
 * @property {number} po2AlarmSetpoint
 * @property {number} safetyStopDepthMeters
 * @property {number} safetyStopSeconds
 * @property {{rapidAscent: boolean, modExceeded: boolean, decompressionRequired: boolean, ceilingViolation: boolean, lowNdl: boolean, o2SatWarning: boolean, o2SatAlarm: boolean}} warnings
 * @property {{samples: Object[], sampleIntervalSeconds: number, nextSampleAtSeconds: number}} profile
 * @property {{nextId: number, items: Object[]}} events
 */

export const DIVE_LIFECYCLES = Object.freeze({
  DIVING: 'diving',
  POST_DIVE: 'postDive',
  SURFACE: 'surface',
});

export const SIMULATION_CLOCK_STATUS = Object.freeze({
  PAUSED: 'paused',
  RUNNING: 'running',
});

export const SAFETY_STOP_STATUS = Object.freeze({
  ACTIVE: 'active',
  COMPLETED: 'completed',
  ELIGIBLE: 'eligible',
  NOT_ELIGIBLE: 'notEligible',
  PAUSED: 'paused',
});

// Deep Stop never re-arms once resolved (unlike Safety Stop, which can
// retrigger), so it gets its own terminal states rather than reusing
// SAFETY_STOP_STATUS's PAUSED/COMPLETED semantics.
export const DEEP_STOP_STATUS = Object.freeze({
  ACTIVE: 'active',
  COMPLETED: 'completed',
  DISABLED: 'disabled',
  ELIGIBLE: 'eligible',
  NOT_ELIGIBLE: 'notEligible',
});
