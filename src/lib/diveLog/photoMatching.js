const MATCH_BUFFER_MS = 90 * 60 * 1000;

export { dedupePhotoAssets } from './photoIdentity';

function numberTimestamp(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return value < 100000000000 ? value * 1000 : value;
}

function exifTimestamp(value) {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{4})[:\-](\d{2})[:\-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

export function photoCapturedAt(asset, capturedAtOverride = null) {
  const override = Date.parse(String(capturedAtOverride || ''));
  if (!Number.isNaN(override)) return new Date(override).toISOString();
  const source = asset && typeof asset === 'object' ? asset : {};
  const timestamp = numberTimestamp(source.creationTime)
    ?? numberTimestamp(source.modificationTime)
    ?? exifTimestamp(source.exif?.DateTimeOriginal)
    ?? exifTimestamp(source.exif?.DateTime);
  return timestamp == null ? null : new Date(timestamp).toISOString();
}

export function findDivePhotoMatches(asset, dives, capturedAtOverride = null) {
  const capturedMs = Date.parse(photoCapturedAt(asset, capturedAtOverride) || '');
  if (Number.isNaN(capturedMs) || !Array.isArray(dives)) return [];
  return dives.map((dive) => {
    const startMs = Date.parse(String(dive?.startTime || ''));
    if (Number.isNaN(startMs)) return null;
    const durationMs = Math.max(0, Number(dive.durationSeconds) || 0) * 1000;
    const endMs = startMs + durationMs;
    const windowStart = startMs - MATCH_BUFFER_MS;
    const windowEnd = endMs + MATCH_BUFFER_MS;
    if (capturedMs < windowStart || capturedMs > windowEnd) return null;
    const distanceMs = capturedMs < startMs ? startMs - capturedMs : capturedMs > endMs ? capturedMs - endMs : 0;
    return {
      dive,
      capturedAt: new Date(capturedMs).toISOString(),
      distanceMs,
      confidence: capturedMs >= startMs && capturedMs <= endMs ? 'high' : 'medium',
    };
  }).filter(Boolean).sort((a, b) => a.distanceMs - b.distanceMs || String(b.dive.startTime).localeCompare(String(a.dive.startTime)));
}

// A match the diver picked by hand in the review sheet, for a photo the
// timestamp window could not place (no EXIF, or shot well outside the dive).
export function manualDivePhotoMatch(dive, capturedAt = null) {
  if (!dive || !dive.id) return null;
  return { dive, capturedAt: capturedAt || null, distanceMs: 0, confidence: 'manual' };
}

// Where in the dive a photo was taken: interpolate the depth profile at the
// photo's capture time. Returns { offsetSeconds, depthMeters } or null when the
// photo has no timestamp, the dive has no usable profile, or the photo falls
// outside the dive (+/- a small grace at the ends).
export function depthAtPhotoTime(capturedAt, diveStartTime, samples) {
  const capMs = Date.parse(capturedAt || '');
  const startMs = Date.parse(diveStartTime || '');
  if (Number.isNaN(capMs) || Number.isNaN(startMs)) return null;
  if (!Array.isArray(samples) || samples.length < 2) return null;
  const ordered = [...samples].filter((s) => s && Number.isFinite(s.t) && Number.isFinite(s.depth)).sort((a, b) => a.t - b.t);
  if (ordered.length < 2) return null;
  const offsetSeconds = (capMs - startMs) / 1000;
  const last = ordered[ordered.length - 1];
  if (offsetSeconds < ordered[0].t - 300 || offsetSeconds > last.t + 300) return null;
  if (offsetSeconds <= ordered[0].t) return { offsetSeconds, depthMeters: ordered[0].depth };
  if (offsetSeconds >= last.t) return { offsetSeconds, depthMeters: last.depth };
  for (let i = 1; i < ordered.length; i += 1) {
    const b = ordered[i];
    if (b.t >= offsetSeconds) {
      const a = ordered[i - 1];
      const span = b.t - a.t;
      const f = span > 0 ? (offsetSeconds - a.t) / span : 0;
      return { offsetSeconds, depthMeters: a.depth + f * (b.depth - a.depth) };
    }
  }
  return { offsetSeconds, depthMeters: last.depth };
}

// Turn reviewed picker items ({ asset, capturedAt, match }) into the per-dive
// photo batches `attachPhotosToDive` expects. Items with no match are dropped.
export function buildPhotoImportPlan(items, linkedAtIso = null) {
  if (!Array.isArray(items)) return [];
  const linkedAt = linkedAtIso || new Date().toISOString();
  const groups = new Map();
  for (const item of items) {
    const dive = item && item.match ? item.match.dive : null;
    const asset = item ? item.asset : null;
    if (!dive || !dive.id || !asset || !asset.uri) continue;
    if (!groups.has(dive.id)) groups.set(dive.id, []);
    groups.get(dive.id).push({
      id: asset.assetId || asset.uri,
      uri: asset.uri,
      assetId: asset.assetId || null,
      capturedAt: item.capturedAt || null,
      linkedAt,
      source: item.match.confidence === 'manual' ? 'logbook-photo-import-manual' : 'logbook-photo-import',
    });
  }
  return [...groups.entries()].map(([diveId, photos]) => ({ diveId, photos }));
}
