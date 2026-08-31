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
});

export function buildLogProfileGeometry(samples, width, height, options = {}) {
  const safeWidth = Math.max(1, finiteNumber(width, 1));
  const safeHeight = Math.max(1, finiteNumber(height, 1));
  const clean = (Array.isArray(samples) ? samples : [])
    .map((sample) => ({ t: finiteNumber(sample?.t), depth: Math.max(0, finiteNumber(sample?.depth)) }))
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

  return {
    linePath,
    areaPath,
    depthTicks,
    timeTicks,
    durationSeconds,
    maxDepthMeters: deepestSample,
    points,
  };
}
