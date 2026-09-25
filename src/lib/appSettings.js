export const APP_SETTINGS_STORAGE_KEY = '@dmz-scuba/app-settings-v1';

export const DEFAULT_PROFILE_COLORS = Object.freeze({
  depth: '#70DDF6',
  temperature: '#FFB36A',
  pressure: '#F0C84B',
  oxygen: '#70E2A3',
  setpoint: '#70E2A3',
  grid: '#6F8DA2',
});

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

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
};

export function sanitizeAppSettings(value) {
  const settings = value && typeof value === 'object' ? value : {};
  return {
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
  };
}

// Settings the account stores and syncs between devices. Everything else is this phone's own:
// location logging depends on this phone's permission, and graph styling is a display preference.
export const ACCOUNT_SYNCED_SETTINGS = Object.freeze(['depthUnit', 'gasVolumeUnit', 'pressureUnit', 'temperatureUnit', 'trimixMode']);

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
