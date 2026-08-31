export const DEVICE_SCREENS = Object.freeze({
  // Home + top-level lead-ins, in the exact order the manual lists them.
  // ADV walks this sequence linearly; reaching the end wraps to SURFACE_HOME.
  SURFACE_HOME: 'surface.home',
  ALT_1: 'surface.alt1',
  ALT_2: 'surface.alt2',
  ALT_3: 'surface.alt3',
  FLY_SAT: 'surface.flySat',
  PLAN_LEAD_IN: 'plan.leadIn',
  LOG_LEAD_IN: 'log.leadIn',
  SET_GAS_LEAD_IN: 'setGas.leadIn',
  SET_AL_LEAD_IN: 'setAl.leadIn',
  SET_UTIL_LEAD_IN: 'setUtil.leadIn',
  SET_TIME_LEAD_IN: 'setTime.leadIn',
  SET_MODE_LEAD_IN: 'setMode.leadIn',
  HISTORY_LEAD_IN: 'history.leadIn',
  SN: 'surface.sn',

  // PLAN
  PLAN_ACTIVE: 'plan.active',

  // LOG
  LOG_PREVIEW: 'log.preview',
  LOG_DATA_1: 'log.data1',
  LOG_DATA_2: 'log.data2',
  LOG_DATA_3: 'log.data3',
  LOG_DATA_4: 'log.data4',

  // SET GAS - single gas only, no Gas 2/3.
  SET_AIR_EAN: 'setGas.airEan',
  GAS_FO2: 'setGas.gasFo2',
  GAS_PO2: 'setGas.gasPo2',

  // SET AL (alarms) - each is its own field-stepper screen.
  AUD_AL: 'setAl.audible',
  DEPTH_AL: 'setAl.depth',
  EDT_AL: 'setAl.edt',
  N2_AL: 'setAl.n2',
  DTR_AL: 'setAl.dtr',

  // SET UTIL - each is its own field-stepper screen.
  H2O_TYPE: 'setUtil.h2oType',
  H2O_ACT: 'setUtil.h2oAct',
  UNITS: 'setUtil.units',
  DEEP_STOP: 'setUtil.deepStop',
  SAFETY_STOP: 'setUtil.safetyStop',
  SAFETY_STOP_TIME: 'setUtil.safetyStopTime',
  SAFETY_STOP_DEPTH: 'setUtil.safetyStopDepth',
  CF: 'setUtil.cf',
  BLUETOOTH: 'setUtil.bluetooth',
  LIGHT: 'setUtil.light',
  SAMPLE_RATE: 'setUtil.sampleRate',

  // SET TIME
  DATE_FORMAT: 'setTime.dateFormat',
  HOUR_FORMAT: 'setTime.hourFormat',
  SET_HOUR: 'setTime.hour',
  SET_MINUTE: 'setTime.minute',
  SET_YEAR: 'setTime.year',
  SET_MONTH: 'setTime.month',
  SET_DAY: 'setTime.day',

  // SET MODE
  SET_MODE: 'setMode.select',

  // HISTORY
  TOTAL_HOURS: 'history.totalHours',
  EXTREMES: 'history.extremes',

  // Underwater/dive-mode screens (manual pages 31-43).
  DIVE_ALT_2: 'dive.alt2',
  DIVE_ALT_3: 'dive.alt3',
  DIVE_DECOMPRESSION: 'dive.decompression',
  DIVE_DEEP_STOP_MAIN: 'dive.deepStopMain',
  DIVE_DEEP_STOP_PREVIEW: 'dive.deepStopPreview',
  DIVE_PRIMARY: 'dive.primary',
  DIVE_SAFETY_STOP: 'dive.safetyStop',
  DIVE_WARNING: 'dive.warning',
});

// The linear top-level sequence ADV walks from the home screen. `skip`
// screens are still valid screen ids (their submenus work if jumped to
// directly) but ADV steps over them while the predicate is true - this is
// only used for ALT_3, which the manual says appears only after a nitrox dive.
export const SURFACE_SEQUENCE = Object.freeze([
  { id: DEVICE_SCREENS.SURFACE_HOME },
  { id: DEVICE_SCREENS.ALT_1 },
  { id: DEVICE_SCREENS.ALT_2 },
  { id: DEVICE_SCREENS.ALT_3, skip: (device) => !device.logbook.entries.some((entry) => entry.fo2 > 0.21) },
  { id: DEVICE_SCREENS.FLY_SAT },
  { id: DEVICE_SCREENS.PLAN_LEAD_IN },
  { id: DEVICE_SCREENS.LOG_LEAD_IN },
  { id: DEVICE_SCREENS.SET_GAS_LEAD_IN },
  { id: DEVICE_SCREENS.SET_AL_LEAD_IN },
  { id: DEVICE_SCREENS.SET_UTIL_LEAD_IN },
  { id: DEVICE_SCREENS.SET_TIME_LEAD_IN },
  { id: DEVICE_SCREENS.SET_MODE_LEAD_IN },
  { id: DEVICE_SCREENS.HISTORY_LEAD_IN },
  { id: DEVICE_SCREENS.SN },
]);

export function surfaceSequenceIds(device) {
  return SURFACE_SEQUENCE.filter((entry) => !entry.skip || !entry.skip(device)).map((entry) => entry.id);
}

// Underwater ADV cycle - the automatic screen (primary/safety-stop/deep-stop/
// decompression, tracked on the device as `automaticDiveScreen`) is always
// first; these are the alternate screens ADV can additionally step through.
// `skip` predicates read fields synchronizeWithSimulation keeps in sync on
// the device each tick (`configuredGas`, `observedDeepStopStatus`).
export const DIVE_SEQUENCE = Object.freeze([
  { id: DEVICE_SCREENS.DIVE_ALT_2 },
  { id: DEVICE_SCREENS.DIVE_ALT_3, skip: (device) => device.configuredGas.fo2 <= 0.21 },
  { id: DEVICE_SCREENS.DIVE_DEEP_STOP_PREVIEW, skip: (device) => device.observedDeepStopStatus !== 'eligible' },
]);

export function diveSequenceIds(device) {
  return DIVE_SEQUENCE.filter((entry) => !entry.skip || !entry.skip(device)).map((entry) => entry.id);
}

// Lead-in screens that are pure data display - SEL does nothing on them.
export const DISPLAY_ONLY_SCREENS = Object.freeze([
  DEVICE_SCREENS.ALT_1,
  DEVICE_SCREENS.ALT_2,
  DEVICE_SCREENS.ALT_3,
  DEVICE_SCREENS.FLY_SAT,
]);

// Lead-in screens that open a bespoke flow (not a generic field stepper) when SEL is pressed.
export const LEAD_IN_TARGETS = Object.freeze({
  [DEVICE_SCREENS.HISTORY_LEAD_IN]: DEVICE_SCREENS.TOTAL_HOURS,
  [DEVICE_SCREENS.LOG_LEAD_IN]: DEVICE_SCREENS.LOG_PREVIEW,
  [DEVICE_SCREENS.PLAN_LEAD_IN]: DEVICE_SCREENS.PLAN_ACTIVE,
  [DEVICE_SCREENS.SET_AL_LEAD_IN]: DEVICE_SCREENS.AUD_AL,
  [DEVICE_SCREENS.SET_GAS_LEAD_IN]: DEVICE_SCREENS.SET_AIR_EAN,
  [DEVICE_SCREENS.SET_MODE_LEAD_IN]: DEVICE_SCREENS.SET_MODE,
  [DEVICE_SCREENS.SET_TIME_LEAD_IN]: DEVICE_SCREENS.DATE_FORMAT,
  [DEVICE_SCREENS.SET_UTIL_LEAD_IN]: DEVICE_SCREENS.H2O_TYPE,
});

// One entry per generic field-stepper screen: ADV cycles `editing.draftValue`,
// SEL commits it to `valuePath` (a dot path off the device) and advances to
// `next(device)`. `parent` is where a cancel (RIGHT_LONG) returns to.
export const FIELD_STEPPERS = Object.freeze({
  [DEVICE_SCREENS.AUD_AL]: {
    kind: 'toggle', options: [false, true], valuePath: 'alarms.audible',
    parent: DEVICE_SCREENS.SET_AL_LEAD_IN, next: () => DEVICE_SCREENS.DEPTH_AL,
  },
  [DEVICE_SCREENS.DEPTH_AL]: {
    kind: 'range', min: 10, max: 100, step: 10, offValue: null, valuePath: 'alarms.depth',
    parent: DEVICE_SCREENS.SET_AL_LEAD_IN, next: () => DEVICE_SCREENS.EDT_AL,
  },
  [DEVICE_SCREENS.EDT_AL]: {
    kind: 'range', min: 10, max: 180, step: 10, offValue: null, valuePath: 'alarms.edt',
    parent: DEVICE_SCREENS.SET_AL_LEAD_IN, next: () => DEVICE_SCREENS.N2_AL,
  },
  [DEVICE_SCREENS.N2_AL]: {
    kind: 'range', min: 1, max: 5, step: 1, offValue: null, valuePath: 'alarms.n2',
    parent: DEVICE_SCREENS.SET_AL_LEAD_IN, next: () => DEVICE_SCREENS.DTR_AL,
  },
  [DEVICE_SCREENS.DTR_AL]: {
    kind: 'range', min: 5, max: 20, step: 5, offValue: null, valuePath: 'alarms.dtr',
    parent: DEVICE_SCREENS.SET_AL_LEAD_IN, next: () => DEVICE_SCREENS.SET_AL_LEAD_IN,
  },

  [DEVICE_SCREENS.H2O_TYPE]: {
    kind: 'toggle', options: ['salt', 'fresh'], valuePath: 'settings.h2oType',
    parent: DEVICE_SCREENS.SET_UTIL_LEAD_IN, next: () => DEVICE_SCREENS.H2O_ACT,
  },
  [DEVICE_SCREENS.H2O_ACT]: {
    kind: 'toggle', options: [true, false], valuePath: 'settings.h2oActivation',
    parent: DEVICE_SCREENS.SET_UTIL_LEAD_IN, next: () => DEVICE_SCREENS.UNITS,
  },
  [DEVICE_SCREENS.UNITS]: {
    kind: 'toggle', options: ['ft', 'm'], valuePath: 'settings.units.depth',
    parent: DEVICE_SCREENS.SET_UTIL_LEAD_IN, next: () => DEVICE_SCREENS.DEEP_STOP,
  },
  [DEVICE_SCREENS.DEEP_STOP]: {
    kind: 'toggle', options: [false, true], valuePath: 'settings.deepStop',
    parent: DEVICE_SCREENS.SET_UTIL_LEAD_IN, next: () => DEVICE_SCREENS.SAFETY_STOP,
  },
  [DEVICE_SCREENS.SAFETY_STOP]: {
    kind: 'toggle', options: [true, false], valuePath: 'settings.safetyStopEnabled',
    parent: DEVICE_SCREENS.SET_UTIL_LEAD_IN,
    next: (draftValue) => (draftValue ? DEVICE_SCREENS.SAFETY_STOP_TIME : DEVICE_SCREENS.CF),
  },
  [DEVICE_SCREENS.SAFETY_STOP_TIME]: {
    kind: 'enum', options: [3, 5], valuePath: 'settings.safetyStopMinutes',
    parent: DEVICE_SCREENS.SET_UTIL_LEAD_IN, next: () => DEVICE_SCREENS.SAFETY_STOP_DEPTH,
  },
  [DEVICE_SCREENS.SAFETY_STOP_DEPTH]: {
    kind: 'enum', options: [3, 4, 5, 6], valuePath: 'settings.safetyStopDepthMeters',
    parent: DEVICE_SCREENS.SET_UTIL_LEAD_IN, next: () => DEVICE_SCREENS.CF,
  },
  [DEVICE_SCREENS.CF]: {
    kind: 'toggle', options: [false, true], valuePath: 'settings.conservatism',
    toState: (value) => (value ? 'conservative' : 'standard'),
    fromState: (value) => value === 'conservative',
    parent: DEVICE_SCREENS.SET_UTIL_LEAD_IN, next: () => DEVICE_SCREENS.BLUETOOTH,
  },
  [DEVICE_SCREENS.BLUETOOTH]: {
    kind: 'toggle', options: [false, true], valuePath: 'settings.bluetooth',
    parent: DEVICE_SCREENS.SET_UTIL_LEAD_IN, next: () => DEVICE_SCREENS.LIGHT,
  },
  [DEVICE_SCREENS.LIGHT]: {
    kind: 'enum', options: [0, 5, 10], valuePath: 'settings.lightDurationSeconds',
    parent: DEVICE_SCREENS.SET_UTIL_LEAD_IN, next: () => DEVICE_SCREENS.SAMPLE_RATE,
  },
  [DEVICE_SCREENS.SAMPLE_RATE]: {
    kind: 'enum', options: [2, 15, 30, 60], valuePath: 'settings.sampleRateSeconds',
    parent: DEVICE_SCREENS.SET_UTIL_LEAD_IN, next: () => DEVICE_SCREENS.SET_UTIL_LEAD_IN,
  },

  [DEVICE_SCREENS.DATE_FORMAT]: {
    kind: 'toggle', options: ['M-D', 'D-M'], valuePath: 'settings.dateFormat',
    parent: DEVICE_SCREENS.SET_TIME_LEAD_IN, next: () => DEVICE_SCREENS.HOUR_FORMAT,
  },
  [DEVICE_SCREENS.HOUR_FORMAT]: {
    kind: 'toggle', options: [12, 24], valuePath: 'settings.hourFormat',
    parent: DEVICE_SCREENS.SET_TIME_LEAD_IN, next: () => DEVICE_SCREENS.SET_HOUR,
  },
  [DEVICE_SCREENS.SET_HOUR]: {
    kind: 'range', min: 0, max: 23, step: 1, valuePath: 'dateTime.hour',
    parent: DEVICE_SCREENS.SET_TIME_LEAD_IN, next: () => DEVICE_SCREENS.SET_MINUTE,
  },
  [DEVICE_SCREENS.SET_MINUTE]: {
    kind: 'range', min: 0, max: 59, step: 1, valuePath: 'dateTime.minute',
    parent: DEVICE_SCREENS.SET_TIME_LEAD_IN, next: () => DEVICE_SCREENS.SET_YEAR,
  },
  [DEVICE_SCREENS.SET_YEAR]: {
    kind: 'range', min: 2020, max: 2099, step: 1, valuePath: 'dateTime.year',
    parent: DEVICE_SCREENS.SET_TIME_LEAD_IN, next: () => DEVICE_SCREENS.SET_MONTH,
  },
  [DEVICE_SCREENS.SET_MONTH]: {
    kind: 'range', min: 1, max: 12, step: 1, valuePath: 'dateTime.month',
    parent: DEVICE_SCREENS.SET_TIME_LEAD_IN, next: () => DEVICE_SCREENS.SET_DAY,
  },
  [DEVICE_SCREENS.SET_DAY]: {
    kind: 'range', min: 1, max: 31, step: 1, valuePath: 'dateTime.day',
    parent: DEVICE_SCREENS.SET_TIME_LEAD_IN, next: () => DEVICE_SCREENS.SET_TIME_LEAD_IN,
  },

  [DEVICE_SCREENS.SET_MODE]: {
    kind: 'enum', options: ['dive', 'gauge', 'free'], valuePath: 'settings.mode',
    parent: DEVICE_SCREENS.SET_MODE_LEAD_IN, next: () => DEVICE_SCREENS.SET_MODE_LEAD_IN,
  },
});
