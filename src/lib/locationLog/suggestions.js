import { bestLocationForDive } from './correlate';
import { matchOfflineDiveSite } from '../diveSites/offlineCatalog';

/**
 * Build one location suggestion per eligible dive. This stays storage- and
 * UI-independent so the post-download flow can be tested without React Native.
 */
export function buildLocationSuggestions(points, dives, handledDiveIds = [], matchSite = null) {
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
      // The planner's dive day, the diver's pinned sites and the Ocean Atlas catalog (see siteDives/siteMatch).
      const match = matchSite ? matchSite({ latitude: point.lat, longitude: point.lon }, dive) : null;
      return {
        id: `${dive.id}:${point.t}`,
        type: 'location',
        match,
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
        logged: Array.isArray(dive.logIds) && dive.logIds.length > 0,
      };
    })
    .filter(Boolean)
    .sort((a, b) => String(a.diveStartTime).localeCompare(String(b.diveStartTime)));
}

/**
 * Dives that already have coordinates but aren't linked to a dive site: offer the site they sit at
 * when the match is confident (or it was the planned dive), so older dives count toward site totals.
 */
export function buildSiteLinkSuggestions(dives, handledDiveIds = [], matchSite = null) {
  if (!matchSite) return [];
  const handled = new Set(Array.isArray(handledDiveIds) ? handledDiveIds : []);
  return (Array.isArray(dives) ? dives : [])
    .filter((dive) => dive?.id && !dive.deletedAt && !handled.has(dive.id) && !dive.site?.siteId
      && Number.isFinite(dive.site?.latitude) && Number.isFinite(dive.site?.longitude))
    .map((dive) => {
      const match = matchSite({ latitude: dive.site.latitude, longitude: dive.site.longitude }, dive);
      if (!match || (match.confidence !== 'high' && match.reason !== 'planned')) return null;
      return { id: `${dive.id}:site:${match.site.id}`, type: 'site', diveId: dive.id, diveStartTime: dive.startTime, siteName: dive.site?.name || '',
        match, latitude: dive.site.latitude, longitude: dive.site.longitude, distanceMs: null, logged: Array.isArray(dive.logIds) && dive.logIds.length > 0 };
    })
    .filter(Boolean)
    .sort((a, b) => String(a.diveStartTime).localeCompare(String(b.diveStartTime)));
}
