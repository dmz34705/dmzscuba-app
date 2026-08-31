export const CUBIC_FOOT_LITERS = 28.3168466;
export const PSI_PER_BAR = 14.5037738;

export const TANK_STORAGE_KEY = '@dmz-scuba/tank-profile-v1';

export const TANK_PRESETS = [
  { id: 'al80', name: 'AL80', ratedCapacityCuFt: 77.4, servicePressurePsi: 3000, waterVolumeLiters: 11.1 },
  { id: 'lp85', name: 'LP85', ratedCapacityCuFt: 85, servicePressurePsi: 2640, waterVolumeLiters: 13.0 },
  { id: 'al40', name: 'AL40', ratedCapacityCuFt: 40, servicePressurePsi: 3000, waterVolumeLiters: 5.8 },
  { id: 'al30', name: 'AL30', ratedCapacityCuFt: 30, servicePressurePsi: 3000, waterVolumeLiters: 4.3 },
  { id: 'hp100', name: 'HP100', ratedCapacityCuFt: 100, servicePressurePsi: 3442, waterVolumeLiters: 12.9 },
];

export const DEFAULT_TANK_SETTINGS = {
  customName: 'Custom tank',
  customRatedCapacityCuFt: '80',
  customServicePressureBar: '207',
  customServicePressurePsi: '3000',
  customServicePressureUnit: 'psi',
  customSizeUnit: 'L',
  customWaterVolumeLiters: '11.1',
  selectedId: 'al80',
};

function positiveNumber(value, fallback) {
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function waterVolumeFromRatedCapacity(ratedCapacityCuFt, servicePressurePsi) {
  const capacityLiters = positiveNumber(ratedCapacityCuFt, 0) * CUBIC_FOOT_LITERS;
  const servicePressureBar = positiveNumber(servicePressurePsi, 0) / PSI_PER_BAR;
  return servicePressureBar > 0 ? capacityLiters / servicePressureBar : 0;
}

export function ratedCapacityFromWaterVolume(waterVolumeLiters, servicePressurePsi) {
  const servicePressureBar = positiveNumber(servicePressurePsi, 0) / PSI_PER_BAR;
  return positiveNumber(waterVolumeLiters, 0) * servicePressureBar / CUBIC_FOOT_LITERS;
}

export function sanitizeTankSettings(value) {
  const settings = value && typeof value === 'object' ? value : {};
  const selectedExists = settings.selectedId === 'custom' || TANK_PRESETS.some(({ id }) => id === settings.selectedId);
  return {
    ...DEFAULT_TANK_SETTINGS,
    ...settings,
    customName: typeof settings.customName === 'string' ? settings.customName : DEFAULT_TANK_SETTINGS.customName,
    customRatedCapacityCuFt: typeof settings.customRatedCapacityCuFt === 'string' ? settings.customRatedCapacityCuFt : DEFAULT_TANK_SETTINGS.customRatedCapacityCuFt,
    customServicePressureBar: typeof settings.customServicePressureBar === 'string' ? settings.customServicePressureBar : DEFAULT_TANK_SETTINGS.customServicePressureBar,
    customServicePressurePsi: typeof settings.customServicePressurePsi === 'string' ? settings.customServicePressurePsi : DEFAULT_TANK_SETTINGS.customServicePressurePsi,
    customServicePressureUnit: settings.customServicePressureUnit === 'bar' ? 'bar' : 'psi',
    customSizeUnit: settings.customSizeUnit === 'ft³' ? 'ft³' : 'L',
    customWaterVolumeLiters: typeof settings.customWaterVolumeLiters === 'string' ? settings.customWaterVolumeLiters : DEFAULT_TANK_SETTINGS.customWaterVolumeLiters,
    selectedId: selectedExists ? settings.selectedId : DEFAULT_TANK_SETTINGS.selectedId,
  };
}

export function servicePressurePsiFromSettings(settingsValue) {
  const settings = sanitizeTankSettings(settingsValue);
  return settings.customServicePressureUnit === 'bar'
    ? positiveNumber(settings.customServicePressureBar, 207) * PSI_PER_BAR
    : positiveNumber(settings.customServicePressurePsi, 3000);
}

export function resolveTankProfile(settingsValue) {
  const settings = sanitizeTankSettings(settingsValue);
  const preset = TANK_PRESETS.find(({ id }) => id === settings.selectedId);
  if (preset) return { ...preset, custom: false, estimated: false };

  const servicePressurePsi = servicePressurePsiFromSettings(settings);
  const enteredAsCubicFeet = settings.customSizeUnit === 'ft³';
  const ratedCapacityCuFt = enteredAsCubicFeet
    ? positiveNumber(settings.customRatedCapacityCuFt, 80)
    : ratedCapacityFromWaterVolume(positiveNumber(settings.customWaterVolumeLiters, 11.1), servicePressurePsi);
  const waterVolumeLiters = enteredAsCubicFeet
    ? waterVolumeFromRatedCapacity(ratedCapacityCuFt, servicePressurePsi)
    : positiveNumber(settings.customWaterVolumeLiters, 11.1);

  return {
    custom: true,
    estimated: true,
    id: 'custom',
    name: String(settings.customName || '').trim() || 'Custom tank',
    ratedCapacityCuFt,
    servicePressurePsi,
    waterVolumeLiters,
  };
}

export function tankCapacityLiters(profile) {
  return Math.max(0, Number(profile?.ratedCapacityCuFt) || 0) * CUBIC_FOOT_LITERS;
}

export function tankBasisText(profile) {
  const capacity = Number(profile?.ratedCapacityCuFt) || 0;
  const pressurePsi = Number(profile?.servicePressurePsi) || 0;
  const pressureBar = pressurePsi / PSI_PER_BAR;
  const waterVolume = Number(profile?.waterVolumeLiters) || 0;
  const approximation = profile?.estimated ? 'approx. ' : '';
  return `${profile?.name || 'Tank'} · ${approximation}${capacity.toFixed(1)} ft³ @ ${Math.round(pressurePsi).toLocaleString('en-US')} psi (${Math.round(pressureBar)} bar) · ${waterVolume.toFixed(1)} L water volume`;
}
