const MATCH_BUFFER_MS = 90 * 60 * 1000;

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
