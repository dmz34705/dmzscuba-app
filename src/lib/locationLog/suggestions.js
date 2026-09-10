import { bestLocationForDive } from './correlate';

/**
 * Build one location suggestion per eligible dive. This stays storage- and
 * UI-independent so the post-download flow can be tested without React Native.
 */
export function buildLocationSuggestions(points, dives, handledDiveIds = []) {
  const handled = new Set(Array.isArray(handledDiveIds) ? handledDiveIds : []);
  return (Array.isArray(dives) ? dives : [])
    .filter((dive) => {
      if (!dive?.id || dive.deletedAt || handled.has(dive.id)) return false;
      if (!Array.isArray(dive.logIds) || !dive.logIds.length) return false;
      return !(Number.isFinite(dive.site?.latitude) && Number.isFinite(dive.site?.longitude));
    })
    .map((dive) => {
      const point = bestLocationForDive(points, {
        startTime: dive.startTime,
        durationSeconds: dive.durationSeconds,
      });
      if (!point) return null;
      return {
        id: `${dive.id}:${point.t}`,
        diveId: dive.id,
        diveStartTime: dive.startTime,
        siteName: dive.site?.name || '',
        latitude: point.lat,
        longitude: point.lon,
        accuracyMeters: point.accuracyMeters ?? null,
        recordedAt: point.t,
        distanceMs: point.distanceMs,
      };
    })
    .filter(Boolean)
    .sort((a, b) => String(a.diveStartTime).localeCompare(String(b.diveStartTime)));
}
