// One tank analysis, as a small state machine fed with the smoothed O2 reading.
// Pure JS so it can be verified in Node (scripts/verify-nitrox-analyzer.cjs).
//
//   waiting  → sensor still on ambient air; diver opens the valve / flow restrictor
//   settling → reading has left ambient and is climbing / settling on the tank gas
//   done     → reading held stable on the tank gas; the result is LOCKED
//
// The lock is the point: once the tank is closed the cell drifts straight back
// to ambient (20.9 %), and many analyzers lose the number. Here the result stays
// put until the diver saves it or starts over.

export const PHASE = Object.freeze({ waiting: 'waiting', settling: 'settling', done: 'done' });

// How far from the ambient baseline (in % O2) the reading has to move before we
// believe tank gas is on the sensor.
export const DEPART_THRESHOLD = 0.5;

export const roundO2 = (value) => Math.round(value * 10) / 10;

export function startAnalysis(baselineO2 = 20.9, now = Date.now()) {
  return {
    phase: PHASE.waiting,
    baseline: Number.isFinite(baselineO2) ? baselineO2 : 20.9,
    startedAt: now,
    departedAt: null,
    result: null, // { o2, at, method: 'auto' | 'held' | 'manual' }
    backOnAmbient: false,
  };
}

const awayFrom = (o2, baseline) => Math.abs(o2 - baseline) >= DEPART_THRESHOLD;

/** Advance with the latest smoothed O2 % and stability flag. */
export function stepAnalysis(state, { o2, stable, now = Date.now() }) {
  if (!state || !Number.isFinite(o2)) return state;
  switch (state.phase) {
    case PHASE.waiting:
      return awayFrom(o2, state.baseline) ? { ...state, phase: PHASE.settling, departedAt: now } : state;
    case PHASE.settling:
      // Flow stopped before it settled — go back to waiting rather than lock a half-reading.
      if (!awayFrom(o2, state.baseline)) return { ...state, phase: PHASE.waiting, departedAt: null };
      if (stable) return { ...state, phase: PHASE.done, result: { o2: roundO2(o2), at: now, method: 'auto' } };
      return state;
    case PHASE.done: {
      // Note when the sensor has gone back to ambient so the UI can say the value is being held.
      const back = !awayFrom(o2, state.baseline);
      return back === state.backOnAmbient ? state : { ...state, backOnAmbient: back };
    }
    default:
      return state;
  }
}

/**
 * Lock the current (stable) reading by hand — for a tank of air, or a mix too
 * close to air to trip the auto-detect (e.g. 21–22 %).
 */
export function holdReading(state, o2, now = Date.now()) {
  if (!state || !Number.isFinite(o2)) return state;
  return { ...state, phase: PHASE.done, result: { o2: roundO2(o2), at: now, method: 'held' } };
}

/** Enter a result from another analyzer. */
export function manualResult(o2, now = Date.now()) {
  const value = Number(o2);
  if (!Number.isFinite(value) || value < 5 || value > 100) return null;
  return { ...startAnalysis(20.9, now), phase: PHASE.done, result: { o2: roundO2(value), at: now, method: 'manual' } };
}

export function phaseMessage(state) {
  if (!state) return '';
  switch (state.phase) {
    case PHASE.waiting: return 'Fit the analyzer to the tank and crack the valve for a gentle flow.';
    case PHASE.settling: return 'Tank gas detected — keep the flow steady while the reading settles…';
    case PHASE.done: return state.backOnAmbient
      ? 'Result held. The sensor is reading room air again — that is expected.'
      : 'Result locked. You can close the valve.';
    default: return '';
  }
}
