export const APP_SETTINGS_STORAGE_KEY = '@dmz-scuba/app-settings-v1';

export const DEFAULT_APP_SETTINGS = {
  depthUnit: 'ft',
  gasVolumeUnit: 'ft³',
  pressureUnit: 'psi',
  temperatureUnit: 'F',
  trimixMode: false,
};

export function sanitizeAppSettings(value) {
  const settings = value && typeof value === 'object' ? value : {};
  return {
    depthUnit: settings.depthUnit === 'm' ? 'm' : 'ft',
    gasVolumeUnit: settings.gasVolumeUnit === 'L' ? 'L' : 'ft³',
    pressureUnit: settings.pressureUnit === 'bar' ? 'bar' : 'psi',
    temperatureUnit: settings.temperatureUnit === 'C' ? 'C' : 'F',
    trimixMode: settings.trimixMode === true,
  };
}
