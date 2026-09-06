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
