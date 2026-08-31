const METERS_TO_FEET = 3.280839895;

export const DEPTH_RANGES = Object.freeze({
  ft: Object.freeze([60, 100, 130, 200, 300]),
  m: Object.freeze([20, 30, 40, 60, 90]),
});

const DEPTH_TICKS = Object.freeze({
  ft: Object.freeze({
    60: [0, 15, 30, 45, 60],
    100: [0, 25, 50, 75, 100],
    130: [0, 30, 60, 100, 130],
    200: [0, 50, 100, 150, 200],
    300: [0, 75, 150, 225, 300],
  }),
  m: Object.freeze({
    20: [0, 5, 10, 15, 20],
    30: [0, 8, 15, 23, 30],
    40: [0, 10, 20, 30, 40],
    60: [0, 15, 30, 45, 60],
    90: [0, 20, 45, 70, 90],
  }),
});

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function metersToDepthUnit(depthMeters, depthUnit) {
  return depthUnit === 'm' ? depthMeters : depthMeters * METERS_TO_FEET;
}

export function depthUnitToMeters(depth, depthUnit) {
  return depthUnit === 'm' ? depth : depth / METERS_TO_FEET;
}

export function selectDepthRange(depthMeters, depthUnit = 'ft') {
  const unit = depthUnit === 'm' ? 'm' : 'ft';
  const displayDepth = Math.max(0, metersToDepthUnit(Number(depthMeters) || 0, unit));
  const ranges = DEPTH_RANGES[unit];
  const maximum = ranges.find((range) => displayDepth <= range) || ranges[ranges.length - 1];
  return {
    maximum,
    maximumMeters: depthUnitToMeters(maximum, unit),
    ticks: DEPTH_TICKS[unit][maximum],
    unit,
  };
}

export function depthToViewportFraction(depthMeters, maximumMeters) {
  if (!(maximumMeters > 0)) return 0;
  return clamp((Number(depthMeters) || 0) / maximumMeters, 0, 1);
}

export function selectDiverOrientation(verticalRateMpm) {
  if (verticalRateMpm > 0) return 'ascending';
  if (verticalRateMpm < 0) return 'descending';
  return 'level';
}

