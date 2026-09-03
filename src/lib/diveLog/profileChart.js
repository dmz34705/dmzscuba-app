// Chart geometry for a stored dive profile. Deliberately simpler than
// features/diveComputer/ui/profileGeometry.js (which is bound to the live
// simulator sample shape). Takes plain [{ t, depth }] samples in SI units and
// returns SVG path strings plus axis ticks. No React, no rendering.

const TIME_TICK_INTERVALS_SECONDS = [60, 120, 300, 600, 900, 1800, 3600, 7200];
const DEPTH_TICK_STEPS_METERS = [2, 5, 10, 15, 20, 30, 50, 75, 100];

function finiteNumber(value, fallback = 0) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function chooseStep(candidates, target) {
  return candidates.find((step) => step >= target) ?? candidates[candidates.length - 1];
}

const EMPTY = Object.freeze({
  linePath: '',
  areaPath: '',
  depthTicks: [],
  timeTicks: [],
  durationSeconds: 0,
  maxDepthMeters: 0,
  points: [],
  pressurePath: '',
  pressureTicks: [],
  pressureRange: null,
  hasPressure: false,
  tempPath: '',
  tempRange: null,
  hasTemp: false,
});

const PRESSURE_TICK_STEPS_BAR = [20, 50, 100, 150, 200];

// A monotonic-ish series scaled onto its own right-hand axis. Used for tank
// pressure and temperature overlays: same x (time) as the depth trace, but the
// y range is the series' own [0 or min .. max], drawn top-down like depth.
function overlaySeries(rows, accessor, xFn, safeHeight, { fromZero = false } = {}) {
  const pts = rows
    .map((r) => ({ t: r.t, v: accessor(r) }))
    .filter((p) => Number.isFinite(p.v));
  if (pts.length < 2) return { path: '', ticks: [], range: null, has: false, points: [] };
  let min = Infinity;
  let max = -Infinity;
  for (const p of pts) { if (p.v < min) min = p.v; if (p.v > max) max = p.v; }
  if (fromZero) min = 0;
  const span = Math.max(1e-6, max - min);
  // High value near the top of the chart (a full tank / warm water reads "up").
  const y = (v) => safeHeight - ((v - min) / span) * safeHeight;
  const points = pts.map((p) => ({ t: p.t, v: p.v, x: xFn(p.t), y: y(p.v) }));
  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(' ');
  const step = chooseStep(PRESSURE_TICK_STEPS_BAR, span / 3);
  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v < max; v += step) ticks.push({ value: v, y: y(v) });
  return { path, ticks, range: { min, max }, has: true, points };
}

export function buildLogProfileGeometry(samples, width, height, options = {}) {
  const safeWidth = Math.max(1, finiteNumber(width, 1));
  const safeHeight = Math.max(1, finiteNumber(height, 1));
  const clean = (Array.isArray(samples) ? samples : [])
    .map((sample) => ({
      t: finiteNumber(sample?.t),
      depth: Math.max(0, finiteNumber(sample?.depth)),
      pressureBar: typeof sample?.pressureBar === 'number' && sample.pressureBar > 0 ? sample.pressureBar : null,
      tempC: typeof sample?.tempC === 'number' ? sample.tempC : null,
    }))
    .filter((sample) => Number.isFinite(sample.t))
    .sort((a, b) => a.t - b.t);

  if (clean.length < 2) {
    return { ...EMPTY, maxDepthMeters: finiteNumber(options.maxDepthMeters, 0) };
  }

  const originSeconds = clean[0].t;
  const endSeconds = clean[clean.length - 1].t;
  const durationSeconds = Math.max(1, endSeconds - originSeconds);

  const deepestSample = clean.reduce((max, sample) => Math.max(max, sample.depth), 0);
  const depthRange = Math.max(1, finiteNumber(options.maxDepthMeters, 0), deepestSample) * 1.08;

  const x = (t) => ((t - originSeconds) / durationSeconds) * safeWidth;
  const y = (depth) => Math.min(1, depth / depthRange) * safeHeight;

  const points = clean.map((sample) => ({
    t: sample.t,
    depth: sample.depth,
    x: x(sample.t),
    y: y(sample.depth),
  }));

  const linePath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');
  // Shade the water column above the diver: curve down to the surface line.
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(2)} 0 L ${points[0].x.toFixed(2)} 0 Z`;

  const depthStep = chooseStep(DEPTH_TICK_STEPS_METERS, depthRange / 4);
  const depthTicks = [];
  for (let meters = depthStep; meters < depthRange; meters += depthStep) {
    depthTicks.push({ meters, y: y(meters) });
  }

  const timeStep = chooseStep(TIME_TICK_INTERVALS_SECONDS, durationSeconds / 5);
  const timeTicks = [];
  for (let seconds = timeStep; seconds < durationSeconds; seconds += timeStep) {
    timeTicks.push({ seconds, x: (seconds / durationSeconds) * safeWidth });
  }

  const pressure = overlaySeries(clean, (r) => r.pressureBar, x, safeHeight, { fromZero: true });
  const temp = overlaySeries(clean, (r) => r.tempC, x, safeHeight);

  // Independent pressure traces (one per computer) sharing a 0..max scale.
  const buildPressureOverlay = (otherSamples, maxBar) => {
    const rows = (Array.isArray(otherSamples) ? otherSamples : [])
      .map((s) => ({ t: finiteNumber(s?.t), v: typeof s?.pressureBar === 'number' && s.pressureBar > 0 ? s.pressureBar : null }))
      .filter((r) => Number.isFinite(r.t) && r.v != null)
      .sort((a, b) => a.t - b.t);
    if (rows.length < 2) return '';
    const top = Math.max(1, finiteNumber(maxBar, 0) || rows.reduce((m, r) => Math.max(m, r.v), 0));
    const py = (v) => safeHeight - (Math.min(1, v / top)) * safeHeight;
    return rows
      .map((r, i) => `${i === 0 ? 'M' : 'L'} ${x(r.t).toFixed(2)} ${py(r.v).toFixed(2)}`)
      .join(' ');
  };

  return {
    linePath,
    areaPath,
    depthTicks,
    timeTicks,
    durationSeconds,
    maxDepthMeters: deepestSample,
    points,
    pressurePath: pressure.path,
    pressureTicks: pressure.ticks,
    pressureRange: pressure.range,
    pressurePoints: pressure.points,
    hasPressure: pressure.has,
    tempPath: temp.path,
    tempRange: temp.range,
    hasTemp: temp.has,
    // caller builds per-computer pressure traces on a shared scale
    pressureOverlay: buildPressureOverlay,
  };
}
