export const DEVICE_EVENTS = Object.freeze({
  BOTH_LONG: 'BOTH_LONG',
  LEFT_LONG: 'LEFT_LONG',
  LEFT_SHORT: 'LEFT_SHORT',
  RIGHT_LONG: 'RIGHT_LONG',
  RIGHT_SHORT: 'RIGHT_SHORT',
  SIMULATION_UPDATED: 'SIMULATION_UPDATED',
  TICK: 'TICK',
});

export const DEVICE_LIFECYCLES = Object.freeze({
  DIVE: 'dive',
  POST_DIVE: 'postDive',
  SURFACE: 'surface',
});

export const DISPLAY_MODES = Object.freeze({
  DECOMPRESSION: 'decompression',
  DIVE: 'dive',
  EDIT: 'edit',
  POST_DIVE: 'postDive',
  SAFETY_STOP: 'safetyStop',
  SURFACE: 'surface',
  WARNING: 'warning',
});

export const BUTTONS = Object.freeze({
  LEFT: 'left',
  RIGHT: 'right',
});

export const PRESS_KINDS = Object.freeze({
  LONG: 'long',
  SHORT: 'short',
});

/**
 * @typedef {Object} GasConfig
 * @property {number} fo2 - 0.21-1.0. Air is 0.21; anything higher is enriched air (EAN).
 * @property {number} po2Alarm - PO2 alarm setpoint in bar, e.g. 1.4.
 */

/**
 * @typedef {Object} VirtualDiveComputerState
 * @property {1} schemaVersion
 * @property {'surface'|'dive'|'postDive'} lifecycle
 * @property {string} currentScreen - a DEVICE_SCREENS id.
 * @property {'surface'|'dive'|'postDive'|'edit'|'warning'|'safetyStop'|'decompression'} displayMode
 * @property {{fieldId: string, draftValue: *}|null} editing - active field-stepper draft, if any.
 * @property {GasConfig} configuredGas - single-gas only; this simulator does not model Gas 2/3.
 * @property {{depthMeters: number}} planner
 * @property {{
 *   audible: {enabled: boolean},
 *   depth: {enabled: boolean, value: number},
 *   edt: {enabled: boolean, value: number},
 *   n2: {enabled: boolean, value: number},
 *   dtr: {enabled: boolean, value: number},
 * }} alarms
 * @property {{
 *   units: {depth: 'ft'|'m', temperature: 'F'|'C'},
 *   h2oType: 'salt'|'fresh',
 *   h2oActivation: boolean,
 *   deepStop: boolean,
 *   safetyStopEnabled: boolean,
 *   safetyStopMinutes: 3|5,
 *   safetyStopDepthMeters: number,
 *   conservatism: 'standard'|'conservative',
 *   bluetooth: boolean,
 *   lightDurationSeconds: 0|5|10,
 *   sampleRateSeconds: 2|15|30|60,
 *   dateFormat: 'M-D'|'D-M',
 *   hourFormat: 12|24,
 *   mode: 'dive'|'gauge'|'free',
 * }} settings
 * @property {{hour: number, minute: number, year: number, month: number, day: number}} dateTime
 * @property {{
 *   entries: Object[],
 *   selectedIndex: number,
 *   lastRecordedDiveCount: number,
 * }} logbook
 * @property {{
 *   totalDives: number,
 *   totalMinutes: number,
 *   deepestDiveMeters: number,
 *   longestDiveSeconds: number,
 *   highestElevationMeters: number,
 *   lowestTemperature: number|null,
 * }} history
 * @property {{active: Object|null, activeFactCodes: string[], acknowledgedCodes: string[], latchedCodes: string[], flashOn: boolean, returnScreen: string|null}} warning
 * @property {{elapsedSeconds: number}} clock
 * @property {{visible: boolean, running: boolean, seconds: number}} timer - manual dive stopwatch, hold-ADV to show/hide.
 * @property {{lastEvent: string|null, longPressThresholdMs: number}} input
 * @property {string|null} observedSimulationLifecycle
 * @property {'normal'|'safetyStop'|'deepStop'|'decompression'} observedDiveCondition
 * @property {'notEligible'|'eligible'|'active'|'completed'|'disabled'} observedDeepStopStatus
 * @property {string} automaticDiveScreen
 */
