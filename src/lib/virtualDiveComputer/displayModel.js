import {
  calculateNdlMinutes,
  calculateOxygenMinutesRemaining,
  celsiusToFahrenheit,
  maximumOperatingDepthMeters,
  selectAscentRateMpm,
  selectDiveTimeRemainingMinutes,
  waterTemperatureCelsius,
} from '../diveSimulation';
import { DEVICE_SCREENS, FIELD_STEPPERS } from './screenGraph';

function formatTime(totalSeconds) {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  return `${minutes}:${String(safeSeconds % 60).padStart(2, '0')}`;
}

function formatHours(totalSeconds) {
  const totalMinutes = Math.max(0, Math.round(totalSeconds / 60));
  return `${Math.floor(totalMinutes / 60)}:${String(totalMinutes % 60).padStart(2, '0')}`;
}

// The device only ever stores a 24h hour (0-23) internally; 12h vs 24h is
// purely a display concern, applied here at the one place formatting happens.
function splitHour12(hour24) {
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const period = hour24 < 12 ? 'AM' : 'PM';
  return { hour12, period };
}

function formatClockTime(hour24, minute, hourFormat) {
  const paddedMinute = String(minute).padStart(2, '0');
  if (hourFormat === 12) {
    const { hour12, period } = splitHour12(hour24);
    return { formatted: `${hour12}:${paddedMinute} ${period}`, hour: hour12, minute, period };
  }
  return { formatted: `${String(hour24).padStart(2, '0')}:${paddedMinute}`, hour: hour24, minute, period: null };
}

function depthValue(depthMeters, unit) {
  return unit === 'm' ? depthMeters : depthMeters * 3.28084;
}

function temperatureField(id, celsius, unit) {
  if (celsius == null) return { id, unit, value: null };
  return { id, unit, value: unit === 'C' ? celsius : celsiusToFahrenheit(celsius) };
}

function depthField(id, depthMeters, unit, precision = unit === 'm' ? 1 : 0) {
  return { id, precision, unit, value: depthValue(depthMeters, unit) };
}

// Labels/formatting for every generic "lead-in" screen (top-level menu items
// that are pure display or open a bespoke flow) and every generic
// "field-stepper" screen (the ~29 toggle/enum/range settings + gas fields).
// This is what keeps ~40 screens out of bespoke per-screen UI code.
const LEAD_IN_LABELS = Object.freeze({
  [DEVICE_SCREENS.PLAN_LEAD_IN]: 'PLAN',
  [DEVICE_SCREENS.LOG_LEAD_IN]: 'LOG',
  [DEVICE_SCREENS.SET_GAS_LEAD_IN]: 'SET GAS',
  [DEVICE_SCREENS.SET_AL_LEAD_IN]: 'SET AL',
  [DEVICE_SCREENS.SET_UTIL_LEAD_IN]: 'SET UTIL',
  [DEVICE_SCREENS.SET_TIME_LEAD_IN]: 'SET TIME',
  [DEVICE_SCREENS.SET_MODE_LEAD_IN]: 'SET MODE',
  [DEVICE_SCREENS.HISTORY_LEAD_IN]: 'TOT dIVES',
});

const FIELD_LABELS = Object.freeze({
  [DEVICE_SCREENS.AUD_AL]: 'AUDIBLE ALARM',
  [DEVICE_SCREENS.DEPTH_AL]: 'DEPTH ALARM',
  [DEVICE_SCREENS.EDT_AL]: 'ELAPSED DIVE TIME ALARM',
  [DEVICE_SCREENS.N2_AL]: 'NITROGEN ALARM',
  [DEVICE_SCREENS.DTR_AL]: 'DIVE TIME REMAINING ALARM',
  [DEVICE_SCREENS.H2O_TYPE]: 'WATER TYPE',
  [DEVICE_SCREENS.H2O_ACT]: 'WATER ACTIVATION',
  [DEVICE_SCREENS.UNITS]: 'UNITS',
  [DEVICE_SCREENS.DEEP_STOP]: 'DEEP STOP',
  [DEVICE_SCREENS.SAFETY_STOP]: 'SAFETY STOP',
  [DEVICE_SCREENS.SAFETY_STOP_TIME]: 'STOP TIME',
  [DEVICE_SCREENS.SAFETY_STOP_DEPTH]: 'STOP DEPTH',
  [DEVICE_SCREENS.CF]: 'CONSERVATIVE FACTOR',
  [DEVICE_SCREENS.BLUETOOTH]: 'BLUETOOTH',
  [DEVICE_SCREENS.LIGHT]: 'BACKLIGHT DURATION',
  [DEVICE_SCREENS.SAMPLE_RATE]: 'SAMPLE RATE',
  [DEVICE_SCREENS.DATE_FORMAT]: 'DATE FORMAT',
  [DEVICE_SCREENS.HOUR_FORMAT]: 'HOUR FORMAT',
  [DEVICE_SCREENS.SET_HOUR]: 'HOUR',
  [DEVICE_SCREENS.SET_MINUTE]: 'MINUTE',
  [DEVICE_SCREENS.SET_YEAR]: 'YEAR',
  [DEVICE_SCREENS.SET_MONTH]: 'MONTH',
  [DEVICE_SCREENS.SET_DAY]: 'DAY',
  [DEVICE_SCREENS.SET_MODE]: 'MODE',
});

function formatFieldValue(screenId, value, depthUnit, hourFormat) {
  if (value == null) return 'OFF';
  if (screenId === DEVICE_SCREENS.H2O_TYPE) return String(value).toUpperCase();
  if (screenId === DEVICE_SCREENS.UNITS) return value === 'm' ? 'MET' : 'IMP';
  if (screenId === DEVICE_SCREENS.CF) return value ? 'ON' : 'OFF';
  if ([DEVICE_SCREENS.AUD_AL, DEVICE_SCREENS.H2O_ACT, DEVICE_SCREENS.DEEP_STOP, DEVICE_SCREENS.SAFETY_STOP, DEVICE_SCREENS.BLUETOOTH].includes(screenId)) {
    return value ? 'ON' : 'OFF';
  }
  if (screenId === DEVICE_SCREENS.DEPTH_AL) return `${Math.round(depthValue(value, depthUnit))} ${depthUnit}`;
  if ([DEVICE_SCREENS.EDT_AL, DEVICE_SCREENS.N2_AL, DEVICE_SCREENS.DTR_AL, DEVICE_SCREENS.LIGHT, DEVICE_SCREENS.SAMPLE_RATE].includes(screenId)) return `${value}`;
  if (screenId === DEVICE_SCREENS.SAFETY_STOP_TIME) return `${value} MIN`;
  if (screenId === DEVICE_SCREENS.SAFETY_STOP_DEPTH) return `${Math.round(depthValue(value, depthUnit))} ${depthUnit}`;
  if (screenId === DEVICE_SCREENS.HOUR_FORMAT) return `${value} HR`;
  if (screenId === DEVICE_SCREENS.SET_HOUR) {
    if (hourFormat === 12) {
      const { hour12, period } = splitHour12(value);
      return `${hour12} ${period}`;
    }
    return String(value).padStart(2, '0');
  }
  if (screenId === DEVICE_SCREENS.SET_MODE) return String(value).toUpperCase();
  return String(value);
}

function fieldStepperDisplay(device, screenId, depthUnit) {
  const stepper = FIELD_STEPPERS[screenId];
  if (!stepper) return null;
  const isEditing = Boolean(device.editing && device.editing.fieldId === screenId);
  const value = isEditing ? device.editing.draftValue : undefined;
  return {
    id: 'display.fieldStepper',
    isEditing,
    kind: stepper.kind,
    label: FIELD_LABELS[screenId] || screenId,
    value: formatFieldValue(screenId, value, depthUnit, device.settings.hourFormat),
  };
}

function gasFieldDisplay(device, screenId) {
  const isEditing = Boolean(device.editing && device.editing.fieldId === screenId);
  const draft = isEditing ? device.editing.draftValue : null;
  if (screenId === DEVICE_SCREENS.SET_AIR_EAN) {
    return { id: 'display.fieldStepper', isEditing, kind: 'toggle', label: 'AIR OR EAN', value: String(draft).toUpperCase() };
  }
  if (screenId === DEVICE_SCREENS.GAS_FO2) {
    return { id: 'display.fieldStepper', isEditing, kind: 'range', label: 'GAS FO2', value: `${draft}% O2` };
  }
  return { id: 'display.fieldStepper', isEditing, kind: 'range', label: 'GAS PO2 ALARM', value: draft == null ? '--' : draft.toFixed(1) };
}

function planDisplay(device, simulation, depthUnit) {
  const depthMeters = device.planner.depthMeters;
  const configuredFo2 = device.configuredGas.fo2;
  const po2Alarm = device.configuredGas.po2Alarm;
  const ndlMinutes = calculateNdlMinutes(
    simulation.physiology.tissues,
    depthMeters,
    configuredFo2,
    simulation.waterType,
    simulation.gradientFactor,
  );
  const oxygenMinutes = calculateOxygenMinutesRemaining(
    simulation.physiology.oxygen.cnsPercent,
    depthMeters,
    configuredFo2,
    simulation.waterType,
  );
  const modMeters = maximumOperatingDepthMeters(configuredFo2, po2Alarm, simulation.waterType);
  const isNitrox = configuredFo2 > 0.21;
  const exceedsMod = isNitrox && depthMeters > modMeters + 0.05;
  const oxygenLimited = isNitrox && oxygenMinutes < ndlMinutes;
  const limitingMinutes = Math.min(ndlMinutes, oxygenMinutes);
  return {
    available: !exceedsMod && limitingMinutes >= 1,
    depth: depthField('display.plan.depth', depthMeters, depthUnit),
    fo2Percent: Math.round(configuredFo2 * 100),
    id: 'display.plan',
    limitLabel: exceedsMod ? 'ABOVE MOD' : oxygenLimited ? 'O2 MIN' : 'NO DECO',
    minutes: exceedsMod || limitingMinutes < 1 ? '--' : limitingMinutes >= 99 ? '99+' : `${Math.floor(limitingMinutes)}`,
    mod: depthField('display.plan.mod', modMeters, depthUnit),
    ndlMinutes,
    oxygenMinutes,
    po2Alarm,
  };
}

function logbookEntryDisplay(entry, depthUnit) {
  if (!entry) return null;
  return {
    averageDepth: depthField('display.log.avgDepth', entry.averageDepthMeters, depthUnit),
    configuredGasLabel: entry.configuredFo2 === 0.21 ? 'Air' : `EAN${Math.round(entry.configuredFo2 * 100)}`,
    deepStopTriggered: entry.deepStopTriggered,
    diveTime: formatTime(entry.runtimeSeconds),
    endOfDiveCnsPercent: entry.endOfDiveCnsPercent,
    fo2Label: entry.fo2 === 0.21 ? 'Air' : `EAN${Math.round(entry.fo2 * 100)}`,
    highestPpO2: entry.highestPpO2,
    id: 'display.log.entry',
    isNitrox: entry.fo2 > 0.21,
    maxAscentRateMpm: entry.maxAscentRateMpm,
    maximumDepth: depthField('display.log.maxDepth', entry.maximumDepthMeters, depthUnit),
    preDiveSurfaceInterval: formatTime(entry.preDiveSurfaceIntervalSeconds),
    tissueLoadingPercent: entry.maxTissueLoadingPercent,
  };
}

// The header label is resolved from the *screen*, not the lifecycle. An earlier
// version short-circuited on `lifecycle === 'postDive'` and stamped every
// surface menu "DIVE COMPLETE" for the whole post-dive window; the lifecycle is
// now only a last-resort fallback for the bare home screen.
function statusLabel(device) {
  const screenId = device.currentScreen;
  // Underwater / dive-mode screens.
  if (screenId === DEVICE_SCREENS.DIVE_WARNING) return 'Warning';
  if (screenId === DEVICE_SCREENS.DIVE_DECOMPRESSION) return 'Decompression';
  if (screenId === DEVICE_SCREENS.DIVE_DEEP_STOP_MAIN) return 'Deep stop';
  if (screenId === DEVICE_SCREENS.DIVE_SAFETY_STOP) return 'Safety stop';
  if (screenId === DEVICE_SCREENS.DIVE_DEEP_STOP_PREVIEW) return 'Deep stop pending';
  if (screenId === DEVICE_SCREENS.DIVE_ALT_2) return 'Time / temperature';
  if (screenId === DEVICE_SCREENS.DIVE_ALT_3) return 'Oxygen status';
  if (screenId === DEVICE_SCREENS.DIVE_PRIMARY) return 'No decompression';
  // Surface screens.
  if (screenId === DEVICE_SCREENS.ALT_1) return 'Last dive';
  if (screenId === DEVICE_SCREENS.ALT_2) return 'Elevation / time / temp';
  if (screenId === DEVICE_SCREENS.ALT_3) return 'Oxygen status';
  if (screenId === DEVICE_SCREENS.FLY_SAT) return 'Fly / desaturation';
  if (LEAD_IN_LABELS[screenId]) return LEAD_IN_LABELS[screenId];
  if (FIELD_LABELS[screenId]) return FIELD_LABELS[screenId];
  if (screenId === DEVICE_SCREENS.SN) return 'Serial number';
  if (screenId === DEVICE_SCREENS.PLAN_ACTIVE) return 'Dive planner';
  if (screenId.startsWith('log.')) return 'Log';
  if (screenId === DEVICE_SCREENS.TOTAL_HOURS || screenId === DEVICE_SCREENS.EXTREMES) return 'History';
  if (screenId.startsWith('setGas.')) return 'Gas settings';
  // Home screen only.
  if (device.lifecycle === 'dive') return 'No decompression';
  if (device.lifecycle === 'postDive') return 'Surface';
  return 'Surface ready';
}

export function buildVirtualDiveComputerDisplay(device, simulation) {
  if (!simulation || simulation.schemaVersion !== 1) {
    throw new TypeError('A public DiveSimulationState is required to build the display.');
  }
  const depthUnit = device.settings.units.depth;
  const screenId = device.currentScreen;
  const selectedLog = device.logbook.entries[device.logbook.selectedIndex] || null;
  const hasPreviousDive = device.logbook.entries.length > 0;
  const decompression = simulation.physiology.decompression;
  const safetyStop = simulation.safetyStop;
  const deepStop = simulation.deepStop;
  const hasEverDived = simulation.dive.completedDiveCount > 0;
  const plan = screenId === DEVICE_SCREENS.PLAN_ACTIVE
    ? planDisplay(device, simulation, depthUnit)
    : null;

  const stop = decompression.required
    ? {
      ceiling: depthField('display.stop.ceiling', decompression.ceilingMeters, depthUnit),
      depth: depthField('display.stop.depth', decompression.stopDepthMeters, depthUnit),
      id: 'display.stop',
      remaining: { id: 'display.stop.time', unit: 'min', value: decompression.stopMinutes },
      status: 'required',
      type: 'decompression',
    }
    : deepStop.status === 'active'
      ? {
        depth: depthField('display.stop.depth', deepStop.stopDepthMeters, depthUnit),
        id: 'display.stop',
        remaining: { formatted: formatTime(deepStop.remainingSeconds), id: 'display.stop.time', unit: 'seconds', value: deepStop.remainingSeconds },
        status: deepStop.status,
        type: 'deepStop',
      }
      : device.settings.safetyStopEnabled && (safetyStop.status === 'active' || safetyStop.status === 'completed')
        ? {
          depth: depthField('display.stop.depth', device.settings.safetyStopDepthMeters, depthUnit),
          id: 'display.stop',
          remaining: { formatted: formatTime(safetyStop.remainingSeconds), id: 'display.stop.time', unit: 'seconds', value: safetyStop.remainingSeconds },
          status: safetyStop.status,
          type: 'safetyStop',
        }
        : null;

  const deepStopPreview = deepStop.status === 'eligible'
    ? {
      depth: depthField('display.deepStopPreview.depth', deepStop.stopDepthMeters, depthUnit),
      id: 'display.deepStopPreview',
      pending: { formatted: formatTime(deepStop.remainingSeconds), id: 'display.deepStopPreview.time' },
    }
    : null;

  return {
    alt1: logbookEntryDisplay(device.logbook.entries[0], depthUnit),
    alt2: {
      elevationMeters: device.history.highestElevationMeters,
      id: 'display.alt2',
      temperature: temperatureField('display.alt2.temp', waterTemperatureCelsius(0), device.settings.units.temperature),
      time: formatClockTime(device.dateTime.hour, device.dateTime.minute, device.settings.hourFormat),
    },
    alt3: (device.configuredGas.fo2 > 0.21 || hasPreviousDive) ? {
      cnsPercent: hasPreviousDive
        ? device.logbook.entries[0].endOfDiveCnsPercent
        : simulation.physiology.oxygen.cnsPercent,
      fo2Label: device.configuredGas.fo2 === 0.21 ? 'Air' : `EAN${Math.round(device.configuredGas.fo2 * 100)}`,
      id: 'display.alt3',
      mod: device.configuredGas.fo2 > 0.21
        ? depthField('display.alt3.mod', maximumOperatingDepthMeters(device.configuredGas.fo2, device.configuredGas.po2Alarm, simulation.waterType), depthUnit)
        : null,
      po2Alarm: device.configuredGas.po2Alarm,
    } : null,
    ascentRate: {
      fraction: Math.min(1, selectAscentRateMpm(simulation) / 12),
      id: 'display.ascentRate',
      metersPerMinute: selectAscentRateMpm(simulation),
      warning: simulation.warnings.rapidAscent,
    },
    configuredGas: {
      editing: Boolean(device.editing),
      fo2: device.configuredGas.fo2,
      id: 'display.configuredGas',
      label: device.configuredGas.fo2 === 0.21 ? 'Air' : `EAN${Math.round(device.configuredGas.fo2 * 100)}`,
    },
    displayMode: device.displayMode,
    fieldStepper: FIELD_STEPPERS[screenId] ? fieldStepperDisplay(device, screenId, depthUnit) : screenId.startsWith('setGas.') && screenId !== DEVICE_SCREENS.SET_GAS_LEAD_IN ? gasFieldDisplay(device, screenId) : null,
    flySat: {
      fly: hasEverDived ? formatTime(Math.max(0, 85800 - simulation.dive.surfaceIntervalSeconds)) : null,
      id: 'display.flySat',
      sat: hasEverDived ? formatTime(Math.max(0, 82800 - simulation.dive.surfaceIntervalSeconds)) : null,
    },
    history: {
      extremes: {
        deepestDive: depthField('display.history.deepest', device.history.deepestDiveMeters, depthUnit),
        highestElevation: { id: 'display.history.elevation', unit: depthUnit, value: depthValue(device.history.highestElevationMeters, depthUnit) },
        longestDive: formatTime(device.history.longestDiveSeconds),
        lowestTemperature: temperatureField('display.history.temp', device.history.lowestTemperature, device.settings.units.temperature),
      },
      id: 'display.history',
      totalDives: device.history.totalDives,
      totalHours: formatHours(device.history.totalMinutes * 60),
    },
    // One stable "ready to dive" surface screen. It always shows time, water
    // temperature and the configured gas; once a dive has been logged it adds
    // the surface interval, residual nitrogen and time-to-fly. The post-dive
    // summary is not duplicated here - it lives on ALT 1 ("LAST DIVE").
    home: {
      id: 'display.home',
      fo2Label: device.configuredGas.fo2 === 0.21 ? 'Air' : `EAN${Math.round(device.configuredGas.fo2 * 100)}`,
      time: formatClockTime(device.dateTime.hour, device.dateTime.minute, device.settings.hourFormat),
      temperature: temperatureField('display.home.temp', waterTemperatureCelsius(0), device.settings.units.temperature),
      hasEverDived,
      tissueLoadingPercent: simulation.physiology.tissueLoadingPercent,
      surfaceInterval: hasEverDived ? formatTime(simulation.dive.surfaceIntervalSeconds) : null,
      timeToFly: hasEverDived ? formatHours(Math.max(0, 85800 - simulation.dive.surfaceIntervalSeconds)) : null,
      desaturated: !hasEverDived || simulation.dive.surfaceIntervalSeconds >= 82800,
    },
    labels: { status: statusLabel(device), title: screenId },
    leadIn: LEAD_IN_LABELS[screenId] ? { id: 'display.leadIn', title: LEAD_IN_LABELS[screenId], totalDives: screenId === DEVICE_SCREENS.HISTORY_LEAD_IN ? device.history.totalDives : null } : null,
    logbook: {
      count: device.logbook.entries.length,
      current: selectedLog,
      currentDisplay: logbookEntryDisplay(selectedLog, depthUnit),
      selectedIndex: device.logbook.selectedIndex,
    },
    deepStopPreview,
    diveAlt2: {
      id: 'display.diveAlt2',
      temperature: temperatureField('display.diveAlt2.temp', waterTemperatureCelsius(simulation.environment.depthMeters), device.settings.units.temperature),
      time: formatClockTime(device.dateTime.hour, device.dateTime.minute, device.settings.hourFormat),
    },
    diveAlt3: {
      cnsPercent: { id: 'display.diveAlt3.cns', unit: '%', value: simulation.physiology.oxygen.cnsPercent },
      fo2Label: device.configuredGas.fo2 === 0.21 ? 'Air' : `EAN${Math.round(device.configuredGas.fo2 * 100)}`,
      id: 'display.diveAlt3',
      ppO2: { id: 'display.diveAlt3.ppO2', unit: 'bar', value: simulation.physiology.oxygen.ppO2 },
    },
    plan,
    planner: {
      depth: depthField('display.planner.depth', device.planner.depthMeters, depthUnit),
      ndlMinutes: plan?.ndlMinutes ?? null,
    },
    primary: {
      depth: depthField('display.primary.depth', simulation.environment.depthMeters, depthUnit),
      diveTime: { formatted: formatTime(simulation.dive.runtimeSeconds), id: 'display.primary.diveTime', unit: 'seconds', value: simulation.dive.runtimeSeconds },
      maxDepth: depthField('display.primary.maxDepth', simulation.dive.maximumDepthMeters, depthUnit),
      ndl: { id: 'display.primary.ndl', unit: 'min', value: simulation.physiology.ndlMinutes },
      timeRemaining: { id: 'display.primary.timeRemaining', unit: 'min', value: selectDiveTimeRemainingMinutes(simulation) },
    },
    screenId,
    serialNumber: { id: 'display.serialNumber', revision: '1.0', serial: 'DMZ-TRAINER-000001' },
    stop,
    timer: {
      formatted: formatTime(device.timer.seconds),
      id: 'display.timer',
      running: device.timer.running,
      visible: device.timer.visible,
    },
    warning: device.warning.active
      ? { ...device.warning.active, flashing: device.warning.flashOn, id: 'display.warning', latched: device.warning.latchedCodes.includes(device.warning.active.code) }
      : null,
    warningIndicator: {
      active: Boolean(device.warning.active && !device.warning.active.acknowledged),
      id: 'display.warningIndicator',
      latched: device.warning.latchedCodes.length > 0,
      latchedCodes: device.warning.latchedCodes.slice(),
    },
  };
}
