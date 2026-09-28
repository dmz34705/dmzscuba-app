import { bestLocationForDive } from './correlate';
import { matchOfflineDiveSite } from '../diveSites/offlineCatalog';

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
      const siteMatch = matchOfflineDiveSite(point.lat, point.lon);
      return {
        id: `${dive.id}:${point.t}`,
        diveId: dive.id,
        diveStartTime: dive.startTime,
        siteName: dive.site?.name || '',
        // A known nearby site is a suggestion only. The user still confirms
        // the location link, and an existing dive name is never replaced.
        nearbySiteName: siteMatch.site?.name || '',
        nearbySiteDistanceMeters: siteMatch.distanceMeters,
        nearbySiteMatchConfidence: siteMatch.confidence,
        nearbySiteMatchReason: siteMatch.reason,
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
