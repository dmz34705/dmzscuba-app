import {
  AIR_NITROGEN_FRACTION,
  CNS_LIMITS,
  SIMULATION_LIMITS,
  SURFACE_PRESSURE_BAR,
  WATER_VAPOR_BAR,
  ZHL16C_N2,
} from './constants';

const METERS_PER_ATMOSPHERE = Object.freeze({ fresh: 10.25, salt: 10 });

export function clamp(value, minimum, maximum) {
  const numeric = Number(value);
  return Math.min(maximum, Math.max(minimum, Number.isFinite(numeric) ? numeric : 0));
}

export function normalizeFo2(fo2) {
  return clamp(fo2, SIMULATION_LIMITS.minimumFo2, SIMULATION_LIMITS.maximumFo2);
}

export function ambientPressureBar(depthMeters, waterType = 'salt') {
  const metersPerAtmosphere = METERS_PER_ATMOSPHERE[waterType] ?? METERS_PER_ATMOSPHERE.salt;
  return SURFACE_PRESSURE_BAR + Math.max(0, depthMeters) / metersPerAtmosphere;
}

function inspiredNitrogen(depthMeters, fo2, waterType) {
  return (1 - normalizeFo2(fo2)) * Math.max(0, ambientPressureBar(depthMeters, waterType) - WATER_VAPOR_BAR);
}

function schreiner({ inspiredStart, tissueStart, rate, halfTime, minutes }) {
  if (minutes <= 0) return tissueStart;
  const k = Math.log(2) / halfTime;
  const exponential = Math.exp(-k * minutes);
  return inspiredStart + rate * (minutes - 1 / k)
    - (inspiredStart - tissueStart - rate / k) * exponential;
}

export function createSurfaceTissues() {
  const surfaceInspiredNitrogen = AIR_NITROGEN_FRACTION * (SURFACE_PRESSURE_BAR - WATER_VAPOR_BAR);
  return ZHL16C_N2.map(() => surfaceInspiredNitrogen);
}

export function updateTissues(tissues, startDepth, endDepth, fo2, elapsedSeconds, waterType = 'salt') {
  const minutes = Math.max(0, elapsedSeconds) / 60;
  if (minutes <= 0) return tissues.slice();
  const inspiredStart = inspiredNitrogen(startDepth, fo2, waterType);
  const inspiredEnd = inspiredNitrogen(endDepth, fo2, waterType);
  const rate = (inspiredEnd - inspiredStart) / minutes;
  return tissues.map((pressure, index) => schreiner({
    halfTime: ZHL16C_N2[index][0],
    inspiredStart,
    minutes,
    rate,
    tissueStart: pressure,
  }));
}

export function ceilingForTissues(tissues, gradientFactor = 1) {
  return tissues.reduce((result, tissuePressure, index) => {
    const [, a, b] = ZHL16C_N2[index];
    const gf = clamp(gradientFactor, 0.01, 1);
    const requiredAmbient = (tissuePressure - gf * a) / (1 + gf * (1 / b - 1));
    const ceilingMeters = Math.max(0, (requiredAmbient - SURFACE_PRESSURE_BAR) * 10);
    return ceilingMeters > result.ceilingMeters
      ? { ceilingMeters, controllingCompartment: index + 1 }
      : result;
  }, { ceilingMeters: 0, controllingCompartment: 1 });
}

function tissueLoading(tissues) {
  return tissues.reduce((highest, tissuePressure, index) => {
    const [, a, b] = ZHL16C_N2[index];
    const baseline = AIR_NITROGEN_FRACTION * (SURFACE_PRESSURE_BAR - WATER_VAPOR_BAR);
    const surfaceLimit = SURFACE_PRESSURE_BAR / b + a;
    const loading = (tissuePressure - baseline) / Math.max(0.01, surfaceLimit - baseline);
    return Math.max(highest, loading);
  }, 0);
}

export function calculateNdlMinutes(tissues, depthMeters, fo2, waterType = 'salt', gradientFactor = 1) {
  if (depthMeters < SIMULATION_LIMITS.diveStartDepthMeters) return 599;
  let projected = tissues.slice();
  for (let minute = 0; minute <= 599; minute += 1) {
    if (ceilingForTissues(projected, gradientFactor).ceilingMeters > 0.1) return minute;
    projected = updateTissues(projected, depthMeters, depthMeters, fo2, 60, waterType);
  }
  return 599;
}

function cnsExposureLimitMinutes(ppO2) {
  if (ppO2 < CNS_LIMITS[0][0]) return Infinity;
  if (ppO2 >= CNS_LIMITS[CNS_LIMITS.length - 1][0]) return CNS_LIMITS[CNS_LIMITS.length - 1][1];
  for (let index = 1; index < CNS_LIMITS.length; index += 1) {
    const [upperPressure, upperMinutes] = CNS_LIMITS[index];
    const [lowerPressure, lowerMinutes] = CNS_LIMITS[index - 1];
    if (ppO2 <= upperPressure) {
      const ratio = (ppO2 - lowerPressure) / (upperPressure - lowerPressure);
      return lowerMinutes + ratio * (upperMinutes - lowerMinutes);
    }
  }
  return Infinity;
}

function oxygenMinutesRemaining(cnsPercent, ppO2) {
  const limit = cnsExposureLimitMinutes(ppO2);
  if (!Number.isFinite(limit)) return 599;
  return Math.max(0, Math.min(599, limit * (1 - clamp(cnsPercent, 0, 100) / 100)));
}

export function calculateOxygenMinutesRemaining(cnsPercent, depthMeters, fo2, waterType = 'salt') {
  const ppO2 = normalizeFo2(fo2) * ambientPressureBar(depthMeters, waterType);
  return oxygenMinutesRemaining(cnsPercent, ppO2);
}

// A plain training thermocline: a warm mixed layer near the surface, a linear
// drop through the thermocline, then a near-constant deep temperature. It is a
// pure function of the current depth (no path/history dependence) so it stays
// deterministic and replay-safe and never needs to live in simulation state.
export const WATER_TEMPERATURE_PROFILE = Object.freeze({
  surfaceCelsius: 27,
  deepCelsius: 15,
  thermoclineTopMeters: 9,
  thermoclineBottomMeters: 20,
});

export function waterTemperatureCelsius(depthMeters, profile = WATER_TEMPERATURE_PROFILE) {
  const { surfaceCelsius, deepCelsius, thermoclineTopMeters, thermoclineBottomMeters } = profile;
  const depth = Math.max(0, Number.isFinite(Number(depthMeters)) ? Number(depthMeters) : 0);
  if (depth <= thermoclineTopMeters) return surfaceCelsius;
  if (depth >= thermoclineBottomMeters) return deepCelsius;
  const ratio = (depth - thermoclineTopMeters) / (thermoclineBottomMeters - thermoclineTopMeters);
  return surfaceCelsius + ratio * (deepCelsius - surfaceCelsius);
}

export function celsiusToFahrenheit(celsius) {
  return celsius * 9 / 5 + 32;
}

export function maximumOperatingDepthMeters(fo2, po2Limit, waterType = 'salt') {
  const metersPerAtmosphere = METERS_PER_ATMOSPHERE[waterType] ?? METERS_PER_ATMOSPHERE.salt;
  const oxygenFraction = normalizeFo2(fo2);
  const limit = clamp(po2Limit, 1, 1.6);
  return Math.max(0, (limit / oxygenFraction - SURFACE_PRESSURE_BAR) * metersPerAtmosphere);
}

function stopEstimateMinutes(tissues, fo2, stopDepthMeters, waterType, gradientFactor) {
  if (stopDepthMeters <= 0) return 0;
  let projected = tissues.slice();
  const nextStop = Math.max(0, stopDepthMeters - 3);
  for (let minute = 1; minute <= 99; minute += 1) {
    projected = updateTissues(projected, stopDepthMeters, stopDepthMeters, fo2, 60, waterType);
    if (ceilingForTissues(projected, gradientFactor).ceilingMeters <= nextStop + 0.1) return minute;
  }
  return 99;
}

export function derivePhysiology({ cnsPercent, depthMeters, fo2, gradientFactor = 1, tissues, waterType = 'salt' }) {
  const ceiling = ceilingForTissues(tissues, gradientFactor);
  const ppO2 = normalizeFo2(fo2) * ambientPressureBar(depthMeters, waterType);
  const ndlMinutes = calculateNdlMinutes(tissues, depthMeters, fo2, waterType, gradientFactor);
  const stopDepthMeters = ceiling.ceilingMeters > 0.1
    ? Math.max(3, Math.ceil(ceiling.ceilingMeters / 3) * 3)
    : 0;
  return {
    decompression: {
      ceilingMeters: ceiling.ceilingMeters,
      controllingCompartment: ceiling.controllingCompartment,
      required: ceiling.ceilingMeters > 0.1,
      stopDepthMeters,
      stopMinutes: stopEstimateMinutes(tissues, fo2, stopDepthMeters, waterType, gradientFactor),
    },
    ndlMinutes,
    oxygen: {
      cnsPercent,
      minutesRemaining: oxygenMinutesRemaining(cnsPercent, ppO2),
      ppO2,
    },
    tissueLoadingPercent: clamp(tissueLoading(tissues) * 100, 0, 140),
    tissues,
  };
}

export function advancePhysiology(previous, startDepth, endDepth, fo2, elapsedSeconds, waterType = 'salt', gradientFactor = 1) {
  const tissues = updateTissues(previous.tissues, startDepth, endDepth, fo2, elapsedSeconds, waterType);
  const minutes = elapsedSeconds / 60;
  const ppO2 = normalizeFo2(fo2) * ambientPressureBar(endDepth, waterType);
  const cnsLimit = cnsExposureLimitMinutes(ppO2);
  const cnsAdded = Number.isFinite(cnsLimit) ? minutes / cnsLimit * 100 : 0;
  const cnsPercent = endDepth <= SIMULATION_LIMITS.surfaceDepthMeters
    ? previous.oxygen.cnsPercent * Math.pow(0.5, minutes / 90)
    : previous.oxygen.cnsPercent + cnsAdded;
  return derivePhysiology({ cnsPercent, depthMeters: endDepth, fo2, gradientFactor, tissues, waterType });
}
