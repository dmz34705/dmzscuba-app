import { DEFAULT_LAYOUT, sanitizeLayout } from '../features/layout/layoutPreferences';

export const APP_SETTINGS_STORAGE_KEY = '@dmz-scuba/app-settings-v1';
export const CURRENT_SETUP_VERSION = 1;

export const DEFAULT_PROFILE_COLORS = Object.freeze({
  depth: '#70DDF6',
  temperature: '#FFB36A',
  pressure: '#F0C84B',
  oxygen: '#70E2A3',
  setpoint: '#70E2A3',
  grid: '#6F8DA2',
});

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export const PROFILE_PHOTO_MODES = Object.freeze(['off', 'pins', 'previews']);

export const DEFAULT_PROFILE_DISPLAY = Object.freeze({
  temperature: true,
  pressure: true,
  oxygen: true,
  depthFill: true,
  grid: true,
  curve: 'sharp',
});

function sanitizeProfileDisplay(value) {
  const display = value && typeof value === 'object' ? value : {};
  return {
    temperature: display.temperature !== false,
    pressure: display.pressure !== false,
    oxygen: display.oxygen !== false,
    depthFill: display.depthFill !== false,
    grid: display.grid !== false,
    curve: display.curve === 'smooth' ? 'smooth' : 'sharp',
  };
}

export const DEFAULT_APP_SETTINGS = {
  depthUnit: 'ft',
  gasVolumeUnit: 'ft³',
  pressureUnit: 'psi',
  temperatureUnit: 'F',
  trimixMode: false,
  // Off by default — background location is opt-in only, turned on from
  // Settings. This flag records the user's *intent*; the actual OS-level
  // task can be independently stopped by the user revoking permission in
  // iOS Settings, so treat this as "should be running", not "is running".
  locationLoggingEnabled: false,
  profileColors: DEFAULT_PROFILE_COLORS,
  profileLineWidth: 2.75,
  // Photos on the dive profile: 'off' (no pins), 'pins', or 'previews' (pins
  // that pop up a thumbnail as the finger passes them).
  profilePhotoMode: 'previews',
  // What the interactive dive profile draws. Depth itself is always drawn.
  profileDisplay: DEFAULT_PROFILE_DISPLAY,
  layout: DEFAULT_LAYOUT,
  firstTimeSetup: { version: 0, status: 'pending', completedAt: '' },
  // Optional starting values for Dive Intelligence. Recorded logbook evidence
  // replaces each value independently as soon as it exists.
  diveBaseline: {
    sacBarPerMin: null,
    rmvLitersPerMin: null,
    avgDepthMeters: null,
    durationSeconds: null,
    tempMinC: null,
  },
};

function optionalNumber(value, min, max) {
  const parsed = Number(value);
  return value !== '' && value != null && Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

export function sanitizeAppSettings(value) {
  const settings = value && typeof value === 'object' ? value : {};
  const setup = settings.firstTimeSetup && typeof settings.firstTimeSetup === 'object' ? settings.firstTimeSetup : {};
  const baseline = settings.diveBaseline && typeof settings.diveBaseline === 'object' ? settings.diveBaseline : {};
  return {
    layout: sanitizeLayout(settings.layout),
    depthUnit: settings.depthUnit === 'm' ? 'm' : 'ft',
    gasVolumeUnit: settings.gasVolumeUnit === 'L' ? 'L' : 'ft³',
    pressureUnit: settings.pressureUnit === 'bar' ? 'bar' : 'psi',
    temperatureUnit: settings.temperatureUnit === 'C' ? 'C' : 'F',
    trimixMode: settings.trimixMode === true,
    locationLoggingEnabled: settings.locationLoggingEnabled === true,
    profileColors: Object.fromEntries(Object.entries(DEFAULT_PROFILE_COLORS).map(([key, fallback]) => [
      key,
      HEX_COLOR.test(settings.profileColors?.[key]) ? settings.profileColors[key].toUpperCase() : fallback,
    ])),
    profileLineWidth: [1.5, 2.75, 4].includes(settings.profileLineWidth) ? settings.profileLineWidth : 2.75,
    profileDisplay: sanitizeProfileDisplay(settings.profileDisplay),
    profilePhotoMode: PROFILE_PHOTO_MODES.includes(settings.profilePhotoMode) ? settings.profilePhotoMode : 'previews',
    firstTimeSetup: {
      version: Math.max(0, Number.parseInt(setup.version, 10) || 0),
      status: ['complete', 'skipped'].includes(setup.status) ? setup.status : 'pending',
      completedAt: typeof setup.completedAt === 'string' ? setup.completedAt.slice(0, 40) : '',
    },
    diveBaseline: {
      sacBarPerMin: optionalNumber(baseline.sacBarPerMin, 0.01, 20),
      rmvLitersPerMin: optionalNumber(baseline.rmvLitersPerMin, 0.1, 200),
      avgDepthMeters: optionalNumber(baseline.avgDepthMeters, 0.1, 300),
      durationSeconds: optionalNumber(baseline.durationSeconds, 60, 86400),
      tempMinC: optionalNumber(baseline.tempMinC, -2, 50),
    },
  };
}

// A stored settings object without firstTimeSetup belongs to an installation
// that predates onboarding. Do not surprise that diver with a first-run screen
// after an app update; the setup remains available manually in Settings.
export function hydrateAppSettings(storedValue) {
  if (!storedValue || typeof storedValue !== 'object') return sanitizeAppSettings(DEFAULT_APP_SETTINGS);
  if (!Object.prototype.hasOwnProperty.call(storedValue, 'firstTimeSetup')) {
    return sanitizeAppSettings({
      ...storedValue,
      firstTimeSetup: { version: CURRENT_SETUP_VERSION, status: 'skipped', completedAt: '' },
    });
  }
  return sanitizeAppSettings(storedValue);
}

// Units, calculator preferences and layouts sync between devices. Everything else is this phone's own:
// location logging depends on this phone's permission, and graph styling is a display preference.
export const ACCOUNT_SYNCED_SETTINGS = Object.freeze(['depthUnit', 'gasVolumeUnit', 'pressureUnit', 'temperatureUnit', 'trimixMode', 'layout']);

/**
 * Apply settings downloaded from the account without resetting this phone's own settings.
 * Replacing wholesale turned background location logging off (the account has no such field)
 * on every sign-in and app reload.
 */
export function mergeAccountSettings(current, remote) {
  const local = sanitizeAppSettings(current);
  const incoming = remote && typeof remote === 'object' ? remote : {};
  const synced = Object.fromEntries(ACCOUNT_SYNCED_SETTINGS.filter((key) => key in incoming).map((key) => [key, incoming[key]]));
  return sanitizeAppSettings({ ...local, ...synced });
}
