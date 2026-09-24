import catalog from './data/offlineDiveSites.json';

export const OFFLINE_DIVE_SITES = Object.freeze(catalog.map((site) => Object.freeze({
  ...site,
  aliases: Object.freeze(site.aliases || []),
  sources: Object.freeze(site.sources || []),
})));

const EARTH_RADIUS_METERS = 6_371_000;
const BROAD_SITE_FALLBACK_RADIUS_METERS = 650;
const DEFAULT_COMPACT_RADIUS_METERS = 150;
const CLEAR_NEAREST_MARGIN_METERS = 50;
const CLEAR_NEAREST_RATIO = 0.75;
const toRadians = (degrees) => (degrees * Math.PI) / 180;

/** Great-circle distance for two WGS84 latitude/longitude points. */
export function distanceBetweenMeters(latitudeA, longitudeA, latitudeB, longitudeB) {
  if (![latitudeA, longitudeA, latitudeB, longitudeB].every(Number.isFinite)) return null;
  const latitudeDelta = toRadians(latitudeB - latitudeA);
  const longitudeDelta = toRadians(longitudeB - longitudeA);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(toRadians(latitudeA)) * Math.cos(toRadians(latitudeB))
    * Math.sin(longitudeDelta / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function matchRadiusForSite(site) {
  if (Number.isFinite(site?.matchRadiusMeters) && site.matchRadiusMeters > 0) return site.matchRadiusMeters;
  return ['broad', 'low', 'approximate'].includes(site?.coordinateQuality)
    ? BROAD_SITE_FALLBACK_RADIUS_METERS
    : DEFAULT_COMPACT_RADIUS_METERS;
}

function confidenceFor(site, distanceMeters, radiusMeters) {
  if (site.coordinateQuality === 'surveyed' && distanceMeters <= radiusMeters * 0.5) return 'high';
  if (['surveyed', 'authoritative'].includes(site.coordinateQuality)) return 'medium';
  return 'low';
}

/**
 * Match a coordinate to the bundled catalog without network access.
 * A match is withheld where overlapping sites are not decisively separated.
 */
export function matchOfflineDiveSite(latitude, longitude, sites = OFFLINE_DIVE_SITES) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
      || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return { status: 'invalid-coordinate', site: null, distanceMeters: null, confidence: 'none', reason: 'Invalid WGS84 coordinate.' };
  }
  if (!Array.isArray(sites)) return { status: 'no-match', site: null, distanceMeters: null, confidence: 'none', reason: 'No offline catalog is available.' };

  const candidates = sites.map((site) => {
    const distanceMeters = distanceBetweenMeters(latitude, longitude, site?.latitude, site?.longitude);
    const radiusMeters = matchRadiusForSite(site);
    return distanceMeters !== null && distanceMeters <= radiusMeters
      ? { site, distanceMeters: Math.round(distanceMeters), radiusMeters } : null;
  }).filter(Boolean).sort((a, b) => a.distanceMeters - b.distanceMeters);

  if (!candidates.length) return { status: 'no-match', site: null, distanceMeters: null, confidence: 'none', reason: 'No known site is within its match radius.', candidates: [] };
  const [nearest, second] = candidates;
  if (second) {
    const clearlyNearer = nearest.distanceMeters + CLEAR_NEAREST_MARGIN_METERS <= second.distanceMeters
      || nearest.distanceMeters <= second.distanceMeters * CLEAR_NEAREST_RATIO;
    if (!clearlyNearer) {
      return { status: 'ambiguous', site: null, distanceMeters: null, confidence: 'none', reason: 'More than one known site overlaps this coordinate without a clear nearest match.', candidates: candidates.slice(0, 2) };
    }
  }
  return { status: 'matched', site: nearest.site, distanceMeters: nearest.distanceMeters,
    confidence: confidenceFor(nearest.site, nearest.distanceMeters, nearest.radiusMeters),
    reason: second ? 'Nearest site is clearly closer than the other matching site.' : 'Within this site’s match radius.', candidates: candidates.slice(0, 2) };
}

/** Backward-compatible convenience wrapper for callers needing only the site. */
export function findNearbyOfflineDiveSite(latitude, longitude, sites = OFFLINE_DIVE_SITES) {
  const result = matchOfflineDiveSite(latitude, longitude, sites);
  return result.status === 'matched' ? { ...result.site, distanceMeters: result.distanceMeters } : null;
}
