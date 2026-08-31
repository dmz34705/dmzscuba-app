export const INSTRUMENT_DISPLAY_LAYOUTS = Object.freeze({
  ALT: 'alt',
  DIVE_ALT: 'diveAlt',
  DEEP_STOP_PREVIEW: 'deepStopPreview',
  EXTREMES: 'extremes',
  FIELD_STEPPER: 'fieldStepper',
  FLY_SAT: 'flySat',
  HOME: 'home',
  LEAD_IN: 'leadIn',
  LOG_DATA: 'logData',
  LOG_PREVIEW: 'logPreview',
  PLANNER: 'planner',
  PRIMARY_DIVE: 'primaryDive',
  SERIAL_NUMBER: 'serialNumber',
  STOP: 'stop',
  TOTAL_HOURS: 'totalHours',
  WARNING: 'warning',
});

export function selectInstrumentDisplayLayout(display) {
  const id = display.screenId;
  if (id === 'dive.warning') return INSTRUMENT_DISPLAY_LAYOUTS.WARNING;
  if ((id === 'dive.safetyStop' || id === 'dive.decompression' || id === 'dive.deepStopMain') && display.stop) return INSTRUMENT_DISPLAY_LAYOUTS.STOP;
  if (id === 'dive.deepStopPreview' && display.deepStopPreview) return INSTRUMENT_DISPLAY_LAYOUTS.DEEP_STOP_PREVIEW;
  if (id === 'dive.alt2' || id === 'dive.alt3') return INSTRUMENT_DISPLAY_LAYOUTS.DIVE_ALT;
  if (id === 'dive.primary') return INSTRUMENT_DISPLAY_LAYOUTS.PRIMARY_DIVE;
  if (id === 'surface.alt1' || id === 'surface.alt2' || id === 'surface.alt3') return INSTRUMENT_DISPLAY_LAYOUTS.ALT;
  if (id === 'surface.flySat') return INSTRUMENT_DISPLAY_LAYOUTS.FLY_SAT;
  if (id === 'surface.sn') return INSTRUMENT_DISPLAY_LAYOUTS.SERIAL_NUMBER;
  if (id === 'plan.active') return INSTRUMENT_DISPLAY_LAYOUTS.PLANNER;
  if (id === 'log.preview') return INSTRUMENT_DISPLAY_LAYOUTS.LOG_PREVIEW;
  if (id.startsWith('log.data')) return INSTRUMENT_DISPLAY_LAYOUTS.LOG_DATA;
  if (id === 'history.totalHours') return INSTRUMENT_DISPLAY_LAYOUTS.TOTAL_HOURS;
  if (id === 'history.extremes') return INSTRUMENT_DISPLAY_LAYOUTS.EXTREMES;
  if (display.fieldStepper) return INSTRUMENT_DISPLAY_LAYOUTS.FIELD_STEPPER;
  if (display.leadIn) return INSTRUMENT_DISPLAY_LAYOUTS.LEAD_IN;
  return INSTRUMENT_DISPLAY_LAYOUTS.HOME;
}
