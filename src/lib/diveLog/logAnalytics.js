// Per-log analytics derived from a ComputerLog's profile + field values.
// Pure, framework-independent, unit-tested. Feeds schema.normalizeAnalytics and
// the B8 metrics / safety-score layer.
//
// All inputs SI (metres, seconds, bar, litres); outputs SI or the noted unit.

const ATA_PER_METER = 1 / 10; // 10 m seawater ~= 1 ata

function finiteOr(value, fallback = null) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function sortedSamples(samples) {
  return (Array.isArray(samples) ? samples : [])
    .filter((s) => s && Number.isFinite(s.t) && Number.isFinite(s.depth))
    .slice()
    .sort((a, b) => a.t - b.t);
}

/**
 * Max ascent rate (m/min) over the profile, and the count of segments exceeding
 * `violationMPerMin` (default 10 m/min, the common recreational ceiling).
 */
export function ascentRateStats(samples, violationMPerMin = 10) {
  const rows = sortedSamples(samples);
  let maxRate = 0;
  let violations = 0;
  for (let i = 1; i < rows.length; i += 1) {
    const dt = rows[i].t - rows[i - 1].t;
    if (dt <= 0) continue;
    const rise = rows[i - 1].depth - rows[i].depth; // +ve = ascending
    if (rise <= 0) continue;
    const rate = (rise / dt) * 60;
    if (rate > maxRate) maxRate = rate;
    if (rate > violationMPerMin) violations += 1;
  }
  return { maxMPerMin: Math.round(maxRate * 10) / 10, violations };
}

/**
 * "Sawtooth" / yo-yo measure: total downward travel beyond the single descent
 * needed to reach max depth, in metres. 0 for a clean square profile; grows with
 * every re-descent. Small wobbles below `deadbandMeters` (default 1 m) ignored.
 */
export function sawtoothIndex(samples, deadbandMeters = 1) {
  const rows = sortedSamples(samples);
  if (rows.length < 2) return 0;
  let totalDescent = 0;
  let maxDepth = 0;
  let anchor = rows[0].depth;
  let dir = 0; // -1 rising, +1 descending
  for (let i = 1; i < rows.length; i += 1) {
    const d = rows[i].depth;
    if (d > maxDepth) maxDepth = d;
    if (dir >= 0 && d < anchor - deadbandMeters) { dir = -1; anchor = d; }
    else if (dir <= 0 && d > anchor + deadbandMeters) {
      if (dir < 0) totalDescent += d - anchor; // count only re-descents
      dir = 1;
      anchor = d;
    } else if (dir > 0 && d > anchor) {
      anchor = d;
    } else if (dir < 0 && d < anchor) {
      anchor = d;
    }
  }
  // The first descent to maxDepth is "free"; everything past that is sawtooth.
  return Math.max(0, Math.round((totalDescent) * 10) / 10);
}

/** Time-weighted average depth from the profile (m), or null if too few samples. */
export function averageDepth(samples) {
  const rows = sortedSamples(samples);
  if (rows.length < 2) return null;
  let area = 0;
  let span = 0;
  for (let i = 1; i < rows.length; i += 1) {
    const dt = rows[i].t - rows[i - 1].t;
    if (dt <= 0) continue;
    area += ((rows[i].depth + rows[i - 1].depth) / 2) * dt;
    span += dt;
  }
  return span > 0 ? Math.round((area / span) * 100) / 100 : null;
}

/**
 * Surface air consumption from tank start/end pressure.
 *   sacBarPerMin  - bar/min normalised to the surface (needs avg depth)
 *   rmvLitersPerMin - free litres/min at the surface (needs tank volume too)
 * Returns nulls when the inputs aren't real transmitter data.
 */
export function surfaceConsumption({ startBar, endBar, durationSeconds, avgDepthMeters, tankVolumeLiters }) {
  const start = finiteOr(startBar);
  const end = finiteOr(endBar);
  const dur = finiteOr(durationSeconds);
  const avg = finiteOr(avgDepthMeters);
  if (start == null || end == null || dur == null || dur <= 0 || start <= end) {
    return { sacBarPerMin: null, rmvLitersPerMin: null };
  }
  const minutes = dur / 60;
  const usedBarPerMin = (start - end) / minutes;
  if (avg == null || avg < 0) return { sacBarPerMin: null, rmvLitersPerMin: null };
  const avgAta = 1 + avg * ATA_PER_METER;
  const sacBarPerMin = usedBarPerMin / avgAta;
  const vol = finiteOr(tankVolumeLiters);
  const rmvLitersPerMin = vol && vol > 0 ? sacBarPerMin * vol : null;
  return {
    sacBarPerMin: Math.round(sacBarPerMin * 100) / 100,
    rmvLitersPerMin: rmvLitersPerMin == null ? null : Math.round(rmvLitersPerMin * 100) / 100,
  };
}

/** Deepest ceiling (m) implied by the deco samples, or null if never in deco. */
export function maxCeiling(samples) {
  const rows = sortedSamples(samples);
  let ceiling = null;
  for (const s of rows) {
    const d = s.deco;
    if (d && d.type && d.type !== 'ndl' && Number.isFinite(d.depth) && d.depth > 0) {
      ceiling = Math.max(ceiling ?? 0, d.depth);
    }
  }
  return ceiling;
}

/**
 * Everything schema.normalizeAnalytics can hold, computed from a raw dive dict
 * (native `onDownloadDive` shape) plus its normalized samples. Callers pass what
 * they have; missing inputs -> null fields.
 */
export function computeLogAnalytics({ samples, decoModel, durationSeconds, avgDepthMeters, tank } = {}) {
  const ascent = ascentRateStats(samples);
  const avg = finiteOr(avgDepthMeters) ?? averageDepth(samples);
  const cnsValues = sortedSamples(samples).map((s) => s.cns).filter((v) => Number.isFinite(v));
  const sac = surfaceConsumption({
    startBar: tank?.startBar,
    endBar: tank?.endBar,
    durationSeconds,
    avgDepthMeters: avg,
    tankVolumeLiters: tank?.volumeLiters,
  });
  return {
    gfLow: finiteOr(decoModel?.gfLow),
    gfHigh: finiteOr(decoModel?.gfHigh),
    decoModelType: decoModel?.type || null,
    conservatism: finiteOr(decoModel?.conservatism),
    ceilingMaxMeters: maxCeiling(samples),
    firstStopMeters: null,
    ndlMinAtStartSec: null,
    cnsStartPct: cnsValues.length ? cnsValues[0] : null,
    cnsEndPct: cnsValues.length ? cnsValues[cnsValues.length - 1] : null,
    otu: null,
    ascentRateMaxMPerMin: ascent.maxMPerMin || null,
    sawtoothIndex: sawtoothIndex(samples),
    sacBarPerMin: sac.sacBarPerMin,
    rmvLitersPerMin: sac.rmvLitersPerMin,
  };
}
