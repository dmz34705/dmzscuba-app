export const SIMULATION_SPEEDS = Object.freeze([1, 5, 10, 20]);

const METERS_PER_FOOT = 0.3048;

export const SIMULATION_LIMITS = Object.freeze({
  ascentMetersPerMinute: 9,
  deepStopMaximumDepthMeters: 57,
  deepStopO2SatDisablePercent: 80,
  deepStopSeconds: 120,
  deepStopToleranceMeters: 3,
  deepStopTriggerDepthMeters: 24,
  diveStartDepthMeters: 1.5,
  diveStartSeconds: 1,
  maximumDepthMeters: 100,
  maximumFo2: 1,
  minimumFo2: 0.16,
  physicsStepSeconds: 1,
  profileSampleIntervalSeconds: 5,
  defaultSafetyStopDepthMeters: 15 * METERS_PER_FOOT,
  safetyStopArmToleranceMeters: 5 * METERS_PER_FOOT,
  safetyStopCancelToleranceMeters: 3,
  safetyStopSeconds: 180,
  safetyStopTriggerDepthMeters: 9,
  stopGraceSeconds: 10,
  surfaceDepthMeters: 0.9,
  surfaceModeDelaySeconds: 600,
});

export const SURFACE_PRESSURE_BAR = 1;
export const WATER_VAPOR_BAR = 0.0627;
export const AIR_NITROGEN_FRACTION = 0.79;

// ZH-L16C nitrogen half-times and a/b coefficients. This is a transparent
// training model; it does not reproduce any manufacturer's firmware.
export const ZHL16C_N2 = Object.freeze([
  [4, 1.2599, 0.5050],
  [8, 1.0000, 0.6514],
  [12.5, 0.8618, 0.7222],
  [18.5, 0.7562, 0.7825],
  [27, 0.6200, 0.8126],
  [38.3, 0.5043, 0.8434],
  [54.3, 0.4410, 0.8693],
  [77, 0.4000, 0.8910],
  [109, 0.3750, 0.9092],
  [146, 0.3500, 0.9222],
  [187, 0.3295, 0.9319],
  [239, 0.3065, 0.9403],
  [305, 0.2835, 0.9477],
  [390, 0.2610, 0.9544],
  [498, 0.2480, 0.9602],
  [635, 0.2327, 0.9653],
]);

export const CNS_LIMITS = Object.freeze([
  [0.5, 720], [0.6, 720], [0.7, 570], [0.8, 450], [0.9, 360], [1.0, 300],
  [1.1, 240], [1.2, 210], [1.3, 180], [1.4, 150], [1.5, 120], [1.6, 45],
]);
