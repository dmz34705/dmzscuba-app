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

// A sensor that only reports whole-degree readings doesn't actually jump
// instantly between them — the water temperature drifts continuously, and
// the coarse resolution just makes it look staircased once plotted. This
// softens each value toward a time-weighted average of its neighbors (a
// Gaussian moving average), turning the flat-plateau-then-vertical-jump shape
// back into the gradual ramp it almost certainly represents. Genuinely flat
// stretches (steady water temp) stay flat, since the average of a run of
// equal values is that value.
function smoothValues(pts, windowSeconds) {
  if (pts.length < 3 || windowSeconds <= 0) return pts;
  const sigma = windowSeconds / 2;
  const twoSigmaSq = 2 * sigma * sigma;
  const cutoff = windowSeconds * 2;
  return pts.map((point, i) => {
    let sum = 0;
    let weight = 0;
    for (let j = i; j >= 0; j -= 1) {
      const dt = point.t - pts[j].t;
      if (dt > cutoff) break;
      const w = Math.exp(-(dt * dt) / twoSigmaSq);
      sum += pts[j].v * w;
      weight += w;
    }
    for (let j = i + 1; j < pts.length; j += 1) {
      const dt = pts[j].t - point.t;
      if (dt > cutoff) break;
      const w = Math.exp(-(dt * dt) / twoSigmaSq);
      sum += pts[j].v * w;
      weight += w;
    }
    return { t: point.t, v: weight > 0 ? sum / weight : point.v };
  });
}

// Catmull-Rom-to-Bezier curve through a set of (already-smoothed) points, so
// the drawn line reads as continuous rather than a sequence of short
// straight segments between closely-spaced samples.
function smoothPath(points) {
  if (points.length < 2) return '';
  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  if (points.length === 2) {
    return `${d} L ${points[1].x.toFixed(2)} ${points[1].y.toFixed(2)}`;
  }
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

// A monotonic-ish series scaled onto its own right-hand axis. Used for tank
// pressure and temperature overlays: same x (time) as the depth trace, but the
// y range is the series' own [0 or min .. max], drawn top-down like depth.
function overlaySeries(rows, accessor, xFn, safeHeight, { fromZero = false, smooth = false, smoothWindowSeconds = 90 } = {}) {
  const pts = rows
    .map((r) => ({ t: r.t, v: accessor(r) }))
    .filter((p) => Number.isFinite(p.v));
  if (pts.length < 2) return { path: '', ticks: [], range: null, has: false, points: [] };
  const values = smooth ? smoothValues(pts, smoothWindowSeconds) : pts;
  let min = Infinity;
  let max = -Infinity;
  for (const p of values) { if (p.v < min) min = p.v; if (p.v > max) max = p.v; }
  if (fromZero) min = 0;
  const span = Math.max(1e-6, max - min);
  // High value near the top of the chart (a full tank / warm water reads "up").
  const y = (v) => safeHeight - ((v - min) / span) * safeHeight;
  const points = values.map((p) => ({ t: p.t, v: p.v, x: xFn(p.t), y: y(p.v) }));
  const path = smooth
    ? smoothPath(points)
    : points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
  const step = chooseStep(PRESSURE_TICK_STEPS_BAR, span / 3);
  const ticks = [];
  for (let v = Math.ceil(min / step) * step; v < max; v += step) ticks.push({ value: v, y: y(v) });
  return { path, ticks, range: { min, max }, has: true, points };
}

// Oxygen traces. ppO2 and the setpoint are the same quantity, and on a
// rebreather the useful reading is how far the loop drifted from the setpoint —
// so they are scaled together, on a fixed floor of 0 and a ceiling of at least
// 1.6 bar. Given their own auto-ranges they would each fill the chart height
// and the gap between them would be pure noise.
const OXYGEN_CEILING_BAR = 1.6;

function oxygenSeries(rows, xFn, safeHeight) {
  const read = (key) => rows
    .map((r) => ({ t: r.t, v: r[key] }))
    .filter((p) => Number.isFinite(p.v) && p.v > 0);
  const ppo2 = read('ppo2');
  const setpoint = read('setpoint');
  if (!ppo2.length && !setpoint.length) {
    return { ppo2Path: '', setpointPath: '', ppo2Points: [], range: null, has: false };
  }
  const observed = [...ppo2, ...setpoint].reduce((max, p) => Math.max(max, p.v), 0);
  const top = Math.max(OXYGEN_CEILING_BAR, Math.ceil(observed * 10) / 10);
  const y = (v) => safeHeight - Math.min(1, v / top) * safeHeight;
  const toPath = (pts) => (pts.length < 2
    ? ''
    : pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFn(p.t).toFixed(2)} ${y(p.v).toFixed(2)}`).join(' '));
  return {
    ppo2Path: toPath(ppo2),
    // Setpoint is a stepped control value, not a measurement — no smoothing.
    setpointPath: toPath(setpoint),
    ppo2Points: ppo2.map((p) => ({ t: p.t, v: p.v, x: xFn(p.t), y: y(p.v) })),
    range: { min: 0, max: top },
    has: ppo2.length > 1 || setpoint.length > 1,
  };
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
      ppo2: typeof sample?.ppo2 === 'number' && sample.ppo2 > 0 ? sample.ppo2 : null,
      setpoint: typeof sample?.setpoint === 'number' && sample.setpoint > 0 ? sample.setpoint : null,
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
  const temp = overlaySeries(clean, (r) => r.tempC, x, safeHeight, { smooth: true });
  const oxygen = oxygenSeries(clean, x, safeHeight);

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
    ppo2Path: oxygen.ppo2Path,
    setpointPath: oxygen.setpointPath,
    ppo2Points: oxygen.ppo2Points,
    oxygenRange: oxygen.range,
    hasOxygen: oxygen.has,
    // caller builds per-computer pressure traces on a shared scale
    pressureOverlay: buildPressureOverlay,
  };
}
