export const METERS_TO_FEET = 3.28084;
export const BAR_TO_PSI = 14.5037738;
export const WATER_VAPOR_BAR = 0.0627;

const SURFACE_PRESSURE_BAR = 1;
const AIR_O2 = 0.21;
const AIR_N2 = 0.79;

export function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

export function depthToMeters(depth, unit = 'm') {
  return unit === 'ft' ? Number(depth) / METERS_TO_FEET : Number(depth);
}

export function metersToDepth(meters, unit = 'm') {
  return unit === 'ft' ? Number(meters) * METERS_TO_FEET : Number(meters);
}

export function absolutePressure(depth, unit = 'm') {
  const value = Math.max(0, Number(depth) || 0);
  return unit === 'ft' ? value / 33 + 1 : value / 10 + 1;
}

export function depthFromAbsolutePressure(pressure, unit = 'm') {
  const meters = Math.max(0, ((Number(pressure) || 1) - 1) * 10);
  return metersToDepth(meters, unit);
}

export function partialPressure(fractionPercent, pressure) {
  return clampNumber(fractionPercent, 0, 100) / 100 * Math.max(0, Number(pressure) || 0);
}

export function maximumOperatingDepth(o2Percent, ppO2Limit = 1.4, unit = 'm') {
  const fraction = clampNumber(o2Percent, 1, 100) / 100;
  const meters = Math.max(0, ((Number(ppO2Limit) || 1.4) / fraction - 1) * 10);
  return metersToDepth(meters, unit);
}

export function bestMix(depth, ppO2Limit = 1.4, unit = 'm') {
  return clampNumber((Number(ppO2Limit) || 1.4) / absolutePressure(depth, unit) * 100, 0, 100);
}

export function equivalentAirDepth(depth, o2Percent, unit = 'm') {
  const depthMeters = depthToMeters(depth, unit);
  const pressure = depthMeters / 10 + 1;
  const nitrogenFraction = 1 - clampNumber(o2Percent, 0, 100) / 100;
  const eadMeters = Math.max(0, (nitrogenFraction / AIR_N2 * pressure - 1) * 10);
  return metersToDepth(eadMeters, unit);
}

export function equivalentNarcoticDepth(depth, heliumPercent, unit = 'm') {
  const depthMeters = depthToMeters(depth, unit);
  const heliumFraction = clampNumber(heliumPercent, 0, 100) / 100;
  const endMeters = Math.max(0, (depthMeters + 10) * (1 - heliumFraction) - 10);
  return metersToDepth(endMeters, unit);
}

function blendAtRetainedPressure({ retainedPressure, targetPressure, startO2, targetO2, startHe, targetHe }) {
  const startO2Fraction = startO2 / 100;
  const targetO2Fraction = targetO2 / 100;
  const startHeFraction = startHe / 100;
  const targetHeFraction = targetHe / 100;
  const heliumAdded = targetPressure * targetHeFraction - retainedPressure * startHeFraction;
  const oxygenAdded = (
    targetPressure * targetO2Fraction
    - retainedPressure * startO2Fraction
    - AIR_O2 * (targetPressure - retainedPressure - heliumAdded)
  ) / (1 - AIR_O2);
  const airAdded = targetPressure - retainedPressure - heliumAdded - oxygenAdded;

  return { airAdded, heliumAdded, oxygenAdded };
}

export function partialPressureBlend({ startPressure, targetPressure, startO2, targetO2, startHe = 0, targetHe = 0 }) {
  const start = Math.max(0, Number(startPressure) || 0);
  const target = Math.max(0, Number(targetPressure) || 0);
  const fractions = {
    startO2: clampNumber(startO2, 0, 100),
    targetO2: clampNumber(targetO2, 0, 100),
    startHe: clampNumber(startHe, 0, 100),
    targetHe: clampNumber(targetHe, 0, 100),
  };

  if (target <= 0 || start > target || fractions.targetO2 + fractions.targetHe > 100 || fractions.startO2 + fractions.startHe > 100) {
    return { feasible: false, reason: 'Check pressures and gas fractions.' };
  }

  const additions = blendAtRetainedPressure({ retainedPressure: start, targetPressure: target, ...fractions });
  const isFeasible = ({ oxygenAdded, heliumAdded, airAdded }) => oxygenAdded >= -1e-9 && heliumAdded >= -1e-9 && airAdded >= -1e-9;

  let retainedPressure = start;
  let bleedToPressure = null;
  let finalAdditions = additions;

  if (!isFeasible(additions)) {
    const emptyFill = blendAtRetainedPressure({ retainedPressure: 0, targetPressure: target, ...fractions });
    if (!isFeasible(emptyFill)) {
      return { feasible: false, reason: 'This target cannot be made from pure oxygen, pure helium, and air.' };
    }

    let low = 0;
    let high = start;
    for (let index = 0; index < 60; index += 1) {
      const middle = (low + high) / 2;
      const candidate = blendAtRetainedPressure({ retainedPressure: middle, targetPressure: target, ...fractions });
      if (isFeasible(candidate)) low = middle;
      else high = middle;
    }
    retainedPressure = low;
    bleedToPressure = low;
    finalAdditions = blendAtRetainedPressure({ retainedPressure, targetPressure: target, ...fractions });
  }

  const oxygenAdded = Math.max(0, finalAdditions.oxygenAdded);
  const heliumAdded = Math.max(0, finalAdditions.heliumAdded);
  const airAdded = Math.max(0, finalAdditions.airAdded);

  return {
    airAdded,
    bleedToPressure,
    feasible: true,
    heliumAdded,
    oxygenAdded,
    oxygenFillPressure: retainedPressure + oxygenAdded,
    retainedPressure,
    topoffStartPressure: retainedPressure + oxygenAdded + heliumAdded,
  };
}

export function requiredTopoffMix({ startPressure, targetPressure, startO2, targetO2, startHe = 0, targetHe = 0 }) {
  const start = Math.max(0, Number(startPressure) || 0);
  const target = Math.max(0, Number(targetPressure) || 0);
  const addedPressure = target - start;
  if (addedPressure <= 0) return { feasible: false, reason: 'Target pressure must exceed starting pressure.' };

  const o2 = (target * (targetO2 / 100) - start * (startO2 / 100)) / addedPressure * 100;
  const he = (target * (targetHe / 100) - start * (startHe / 100)) / addedPressure * 100;
  return {
    addedPressure,
    feasible: o2 >= 0 && he >= 0 && o2 + he <= 100,
    hePercent: he,
    o2Percent: o2,
  };
}

export function pressureToBar(pressure, unit = 'bar') {
  return unit === 'psi' ? (Number(pressure) || 0) / BAR_TO_PSI : Number(pressure) || 0;
}

export function bankedMixFill({
  receiverVolumeLiters,
  startPressure,
  targetPressure,
  startO2,
  targetO2,
  bankO2,
  startHe = 0,
  targetHe = 0,
  bankHe = 0,
  pressureUnit = 'bar',
}) {
  const receiverVolume = Math.max(0, Number(receiverVolumeLiters) || 0);
  const start = Math.max(0, Number(startPressure) || 0);
  const target = Math.max(0, Number(targetPressure) || 0);
  const fractions = {
    startO2: clampNumber(startO2, 0, 100) / 100,
    targetO2: clampNumber(targetO2, 0, 100) / 100,
    bankO2: clampNumber(bankO2, 0, 100) / 100,
    startHe: clampNumber(startHe, 0, 100) / 100,
    targetHe: clampNumber(targetHe, 0, 100) / 100,
    bankHe: clampNumber(bankHe, 0, 100) / 100,
  };
  if (receiverVolume <= 0 || target <= 0) return { feasible: false, reason: 'Check the cylinder size and target pressure.' };
  if (fractions.startO2 + fractions.startHe > 1 || fractions.targetO2 + fractions.targetHe > 1 || fractions.bankO2 + fractions.bankHe > 1) {
    return { feasible: false, reason: 'Oxygen and helium cannot total more than 100%.' };
  }

  // retained*A + bank-fill-to*B = target*C for oxygen and helium.
  const equations = [
    [fractions.startO2 - fractions.bankO2, fractions.bankO2 - AIR_O2, target * (fractions.targetO2 - AIR_O2)],
    [fractions.startHe - fractions.bankHe, fractions.bankHe, target * fractions.targetHe],
  ];
  const tolerance = Math.max(0.00001, target * 1e-7);
  const [o2Equation, heEquation] = equations;
  const determinant = o2Equation[0] * heEquation[1] - heEquation[0] * o2Equation[1];
  let retainedPressure;
  let bankFillPressure;

  if (Math.abs(determinant) > 1e-10) {
    retainedPressure = (o2Equation[2] * heEquation[1] - heEquation[2] * o2Equation[1]) / determinant;
    bankFillPressure = (o2Equation[0] * heEquation[2] - heEquation[0] * o2Equation[2]) / determinant;
  } else {
    const equation = equations.find(([a, b]) => Math.abs(a) > 1e-10 || Math.abs(b) > 1e-10);
    if (!equation) {
      if (equations.some(([, , c]) => Math.abs(c) > tolerance)) return { feasible: false, reason: 'This target mix cannot be made with the selected bank mix and air.' };
      retainedPressure = Math.min(start, target);
      bankFillPressure = retainedPressure;
    } else {
      const [a, b, c] = equation;
      const maxRetained = Math.min(start, target);
      const candidates = [0, maxRetained];
      if (Math.abs(a + b) > 1e-10) candidates.push(c / (a + b));
      if (Math.abs(a) > 1e-10) candidates.push((c - b * target) / a);
      const valid = candidates
        .map((candidate) => {
          const bankEnd = Math.abs(b) > 1e-10 ? (c - a * candidate) / b : candidate;
          return { retained: candidate, bankEnd };
        })
        .filter(({ retained, bankEnd }) => retained >= -tolerance && retained <= maxRetained + tolerance && bankEnd >= retained - tolerance && bankEnd <= target + tolerance)
        .filter(({ retained, bankEnd }) => equations.every(([ea, eb, ec]) => Math.abs(ea * retained + eb * bankEnd - ec) <= Math.max(0.0001, target * 1e-5)))
        .sort((left, right) => right.retained - left.retained);
      if (!valid.length) return { feasible: false, reason: 'This target mix cannot be made with the selected bank mix and air.' };
      retainedPressure = valid[0].retained;
      bankFillPressure = valid[0].bankEnd;
    }
  }

  const maxRetained = Math.min(start, target);
  if (retainedPressure < -tolerance || retainedPressure > maxRetained + tolerance || bankFillPressure < retainedPressure - tolerance || bankFillPressure > target + tolerance) {
    return { feasible: false, reason: 'This target mix is outside the range of the current gas, selected bank mix, and air.' };
  }
  retainedPressure = clampNumber(retainedPressure, 0, maxRetained);
  bankFillPressure = clampNumber(bankFillPressure, retainedPressure, target);
  const bankAddedPressure = bankFillPressure - retainedPressure;
  const airAddedPressure = target - bankFillPressure;
  const bleedAmount = Math.max(0, start - retainedPressure);
  const finalO2Percent = (retainedPressure * fractions.startO2 + bankAddedPressure * fractions.bankO2 + airAddedPressure * AIR_O2) / target * 100;
  const finalHePercent = (retainedPressure * fractions.startHe + bankAddedPressure * fractions.bankHe) / target * 100;

  return {
    airAddedPressure,
    airSurfaceLiters: pressureToBar(airAddedPressure, pressureUnit) * receiverVolume,
    bankAddedPressure,
    bankFillPressure,
    bankSurfaceLiters: pressureToBar(bankAddedPressure, pressureUnit) * receiverVolume,
    bleedAmount,
    bleedToPressure: retainedPressure,
    feasible: true,
    finalHePercent,
    finalO2Percent,
    finalSurfaceLiters: pressureToBar(target, pressureUnit) * receiverVolume,
    ventedSurfaceLiters: pressureToBar(bleedAmount, pressureUnit) * receiverVolume,
  };
}

export function bankedTopoff({
  receiverVolumeLiters,
  startPressure,
  targetPressure,
  startO2,
  startHe = 0,
  bankVolumeLiters,
  bankPressure,
  bankO2,
  bankHe = 0,
  pressureUnit = 'bar',
}) {
  const receiverVolume = Math.max(0, Number(receiverVolumeLiters) || 0);
  const bankVolume = Math.max(0, Number(bankVolumeLiters) || 0);
  const start = Math.max(0, Number(startPressure) || 0);
  const target = Math.max(0, Number(targetPressure) || 0);
  const bank = Math.max(0, Number(bankPressure) || 0);
  const startO2Fraction = clampNumber(startO2, 0, 100) / 100;
  const startHeFraction = clampNumber(startHe, 0, 100) / 100;
  const bankO2Fraction = clampNumber(bankO2, 0, 100) / 100;
  const bankHeFraction = clampNumber(bankHe, 0, 100) / 100;

  if (receiverVolume <= 0 || bankVolume <= 0 || target <= start || startO2Fraction + startHeFraction > 1 || bankO2Fraction + bankHeFraction > 1) {
    return { feasible: false, reason: 'Check cylinder sizes, pressures, and gas fractions.' };
  }

  const addedPressure = target - start;
  const bankEndingPressure = bank - addedPressure * receiverVolume / bankVolume;
  const equalizationPressure = (bank * bankVolume + start * receiverVolume) / (bankVolume + receiverVolume);
  const finalO2Percent = (start * startO2Fraction + addedPressure * bankO2Fraction) / target * 100;
  const finalHePercent = (start * startHeFraction + addedPressure * bankHeFraction) / target * 100;
  const transferredSurfaceLiters = pressureToBar(addedPressure, pressureUnit) * receiverVolume;
  const receiverSurfaceLitersAtTarget = pressureToBar(target, pressureUnit) * receiverVolume;
  const pressureFeasible = bank > target && bankEndingPressure >= target - 1e-8 && equalizationPressure >= target - 1e-8;

  return {
    addedPressure,
    bankEndingPressure,
    equalizationPressure,
    feasible: true,
    finalHePercent,
    finalO2Percent,
    pressureFeasible,
    receiverSurfaceLitersAtTarget,
    transferredSurfaceLiters,
  };
}

export function bankedBleedDown({
  receiverVolumeLiters,
  startPressure,
  targetPressure,
  startO2,
  targetO2,
  startHe = 0,
  targetHe = 0,
  bankVolumeLiters,
  bankPressure,
  bankO2,
  bankHe = 0,
  pressureUnit = 'bar',
}) {
  const start = Math.max(0, Number(startPressure) || 0);
  const target = Math.max(0, Number(targetPressure) || 0);
  const startO2Value = clampNumber(startO2, 0, 100);
  const targetO2Value = clampNumber(targetO2, 0, 100);
  const bankO2Value = clampNumber(bankO2, 0, 100);
  const startHeValue = clampNumber(startHe, 0, 100);
  const targetHeValue = clampNumber(targetHe, 0, 100);
  const bankHeValue = clampNumber(bankHe, 0, 100);
  if (target <= 0 || startO2Value + startHeValue > 100 || targetO2Value + targetHeValue > 100 || bankO2Value + bankHeValue > 100) {
    return { feasible: false, reason: 'Check pressures and gas fractions.' };
  }
  const components = [
    [startO2Value / 100, bankO2Value / 100, targetO2Value / 100],
    [startHeValue / 100, bankHeValue / 100, targetHeValue / 100],
  ];
  const candidates = [];

  for (const [startFraction, bankFraction, targetFraction] of components) {
    const difference = startFraction - bankFraction;
    if (Math.abs(difference) < 1e-10) {
      if (Math.abs(targetFraction - bankFraction) > 0.0005) {
        return { feasible: false, reason: 'The target mix is not reachable with this single bank mix.' };
      }
    } else {
      candidates.push(target * (targetFraction - bankFraction) / difference);
    }
  }

  const retainedPressure = candidates.length ? candidates[0] : Math.min(start, target);
  const candidateTolerance = Math.max(0.1, target * 0.001);
  if (candidates.some((candidate) => Math.abs(candidate - retainedPressure) > candidateTolerance)) {
    return { feasible: false, reason: 'Oxygen and helium require different bleed points; one bank mix cannot make this target.' };
  }
  if (retainedPressure < -candidateTolerance || retainedPressure > start + candidateTolerance || retainedPressure >= target - 1e-8) {
    return { feasible: false, reason: 'The target is outside the blend range of the starting gas and bank mix.' };
  }

  const fill = bankedTopoff({
    receiverVolumeLiters,
    startPressure: Math.max(0, retainedPressure),
    targetPressure: target,
    startO2,
    startHe,
    bankVolumeLiters,
    bankPressure,
    bankO2,
    bankHe,
    pressureUnit,
  });
  if (!fill.feasible) return fill;

  return {
    ...fill,
    bleedAmount: Math.max(0, start - retainedPressure),
    bleedToPressure: Math.max(0, retainedPressure),
    targetHePercent: targetHeValue,
    targetO2Percent: targetO2Value,
  };
}

export function observedRmvMetric({ tankWaterVolumeLiters, startBar, endBar, timeMinutes, averageDepth, depthUnit = 'm' }) {
  const usedBar = Math.max(0, (Number(startBar) || 0) - (Number(endBar) || 0));
  const surfaceLitersUsed = Math.max(0, Number(tankWaterVolumeLiters) || 0) * usedBar;
  const time = Math.max(0.01, Number(timeMinutes) || 0);
  return {
    rmvLitersPerMinute: surfaceLitersUsed / (time * absolutePressure(averageDepth, depthUnit)),
    surfaceLitersUsed,
    usedBar,
  };
}

export function requiredGas({ rmv, depth, timeMinutes, depthUnit = 'm', contingencyPercent = 0 }) {
  const baseGas = Math.max(0, Number(rmv) || 0) * absolutePressure(depth, depthUnit) * Math.max(0, Number(timeMinutes) || 0);
  return {
    baseGas,
    totalGas: baseGas * (1 + Math.max(0, Number(contingencyPercent) || 0) / 100),
  };
}

export function schreinerTissue({ initialInspiredPressure, initialTissuePressure, rate, halfTime, time }) {
  const k = Math.log(2) / halfTime;
  const exponential = Math.exp(-k * time);
  return initialInspiredPressure + rate * (time - 1 / k)
    - (initialInspiredPressure - initialTissuePressure - rate / k) * exponential;
}

const ZHL16C = [
  [4, 1.2599, 0.5050, 1.51, 1.7424, 0.4245],
  [8, 1.0000, 0.6514, 3.02, 1.3830, 0.5747],
  [12.5, 0.8618, 0.7222, 4.72, 1.1919, 0.6527],
  [18.5, 0.7562, 0.7825, 6.99, 1.0458, 0.7223],
  [27, 0.6200, 0.8126, 10.21, 0.9220, 0.7582],
  [38.3, 0.5043, 0.8434, 14.48, 0.8205, 0.7957],
  [54.3, 0.4410, 0.8693, 20.53, 0.7305, 0.8279],
  [77, 0.4000, 0.8910, 29.11, 0.6502, 0.8553],
  [109, 0.3750, 0.9092, 41.2, 0.5950, 0.8757],
  [146, 0.3500, 0.9222, 55.19, 0.5545, 0.8903],
  [187, 0.3295, 0.9319, 70.69, 0.5333, 0.8997],
  [239, 0.3065, 0.9403, 90.34, 0.5189, 0.9073],
  [305, 0.2835, 0.9477, 115.29, 0.5181, 0.9122],
  [390, 0.2610, 0.9544, 147.42, 0.5176, 0.9171],
  [498, 0.2480, 0.9602, 188.24, 0.5172, 0.9217],
  [635, 0.2327, 0.9653, 240.03, 0.5119, 0.9267],
];

export function zhl16cSnapshot({ depth, depthUnit = 'm', bottomTime, o2Percent = 21, heliumPercent = 0, gradientFactor = 85, descentRateMetersPerMinute = 18 }) {
  const depthMeters = Math.max(0, depthToMeters(depth, depthUnit));
  const timeAtDepth = Math.max(0, Number(bottomTime) || 0);
  const o2 = clampNumber(o2Percent, 0, 100) / 100;
  const helium = clampNumber(heliumPercent, 0, 100) / 100;
  const nitrogen = Math.max(0, 1 - o2 - helium);
  const gf = clampNumber(gradientFactor, 1, 100) / 100;
  const descentTime = depthMeters / Math.max(1, Number(descentRateMetersPerMinute) || 18);
  const bottomAmbient = SURFACE_PRESSURE_BAR + depthMeters / 10;
  const surfaceInspiredN2 = AIR_N2 * (SURFACE_PRESSURE_BAR - WATER_VAPOR_BAR);
  const compartments = ZHL16C.map(([n2Half, n2A, n2B, heHalf, heA, heB], index) => {
    const startInspiredN2 = nitrogen * (SURFACE_PRESSURE_BAR - WATER_VAPOR_BAR);
    const startInspiredHe = helium * (SURFACE_PRESSURE_BAR - WATER_VAPOR_BAR);
    const ambientRate = descentTime > 0 ? (bottomAmbient - SURFACE_PRESSURE_BAR) / descentTime : 0;
    const n2AfterDescent = descentTime > 0
      ? schreinerTissue({ initialInspiredPressure: startInspiredN2, initialTissuePressure: surfaceInspiredN2, rate: nitrogen * ambientRate, halfTime: n2Half, time: descentTime })
      : surfaceInspiredN2;
    const heAfterDescent = descentTime > 0
      ? schreinerTissue({ initialInspiredPressure: startInspiredHe, initialTissuePressure: 0, rate: helium * ambientRate, halfTime: heHalf, time: descentTime })
      : 0;
    const inspiredN2AtDepth = nitrogen * (bottomAmbient - WATER_VAPOR_BAR);
    const inspiredHeAtDepth = helium * (bottomAmbient - WATER_VAPOR_BAR);
    const tissueN2 = schreinerTissue({ initialInspiredPressure: inspiredN2AtDepth, initialTissuePressure: n2AfterDescent, rate: 0, halfTime: n2Half, time: timeAtDepth });
    const tissueHe = schreinerTissue({ initialInspiredPressure: inspiredHeAtDepth, initialTissuePressure: heAfterDescent, rate: 0, halfTime: heHalf, time: timeAtDepth });
    const inertPressure = tissueN2 + tissueHe;
    const a = inertPressure > 0 ? (n2A * tissueN2 + heA * tissueHe) / inertPressure : n2A;
    const b = inertPressure > 0 ? (n2B * tissueN2 + heB * tissueHe) / inertPressure : n2B;
    const toleratedAtSurface = SURFACE_PRESSURE_BAR / b + a;
    const requiredAmbient = (inertPressure - gf * a) / (1 + gf * (1 / b - 1));
    const ceilingMeters = Math.max(0, (requiredAmbient - SURFACE_PRESSURE_BAR) * 10);
    return {
      a,
      b,
      ceilingMeters,
      compartment: index + 1,
      inertPressure,
      loadingPercent: inertPressure / toleratedAtSurface * 100,
      tissueHe,
      tissueN2,
    };
  });
  const controlling = compartments.reduce((highest, item) => item.ceilingMeters > highest.ceilingMeters ? item : highest, compartments[0]);

  return {
    bottomAmbient,
    ceiling: metersToDepth(controlling.ceilingMeters, depthUnit),
    compartments,
    controlling,
    descentTime,
    ppO2: o2 * bottomAmbient,
  };
}
