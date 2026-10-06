// Pure matching logic: given the background location breadcrumb log and a
// dive's time window, find the point most likely to represent where the dive
// happened. No React, no storage access — takes plain data in, easy to test.
//
// GPS doesn't work underwater, so a background-sampled point can never land
// *during* a dive in practice — the useful signal is whatever was recorded
// just before descending (at the site, on the boat/shore) or just after
// surfacing. This picks whichever point is closest in time to the dive's
// [start, end] span, rejecting imprecise fixes and using accuracy to break temporal ties.

// Coarse cell/network fixes can be kilometers from an offshore wreck.
// Keep them in the raw log, but never use them to suggest a dive location.
const MAX_ACCURACY_METERS = 250;

const DEFAULT_WINDOW_MS = 60 * 60 * 1000; // an hour on either side of the dive

/**
 * @param {Array<{t:number, lat:number, lon:number, accuracyMeters?:number}>} points
 * @param {{ startTime: string|number|Date, durationSeconds?: number, windowMs?: number }} dive
 * @returns {{ t:number, lat:number, lon:number, accuracyMeters?:number, distanceMs:number } | null}
 */
export function bestLocationForDive(points, { startTime, durationSeconds = 0, windowMs = DEFAULT_WINDOW_MS }) {
  const startMs = new Date(startTime).getTime();
  if (!Number.isFinite(startMs) || !Array.isArray(points)) return null;
  const endMs = startMs + Math.max(0, durationSeconds) * 1000;

  let best = null;
  let bestDistanceMs = Infinity;
  let bestAccuracy = Infinity;
  for (const point of points) {
    if (!point || !Number.isFinite(point.t) || !Number.isFinite(point.lat) || !Number.isFinite(point.lon)) continue;
    const accuracy = Number.isFinite(point.accuracyMeters) ? point.accuracyMeters : Infinity;
    if (accuracy !== Infinity && (accuracy < 0 || accuracy > MAX_ACCURACY_METERS)) continue;
    const distanceMs = point.t < startMs ? startMs - point.t : point.t > endMs ? point.t - endMs : 0;
    if (distanceMs > windowMs) continue;
    // Prefer a measured, usable fix over legacy points with unknown accuracy.
    const knownAccuracy = accuracy !== Infinity;
    const bestKnownAccuracy = bestAccuracy !== Infinity;
    if (!best || (knownAccuracy && !bestKnownAccuracy)
      || (knownAccuracy === bestKnownAccuracy && (distanceMs < bestDistanceMs
        || (distanceMs === bestDistanceMs && accuracy < bestAccuracy)))) {
      bestDistanceMs = distanceMs;
      bestAccuracy = accuracy;
      best = point;
    }
  }
  return best ? { ...best, distanceMs: bestDistanceMs } : null;
}
