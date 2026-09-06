// AsyncStorage persistence for the background location breadcrumb log.
//
// Deliberately tiny and separate from src/lib/diveLog/storage.js: this data
// has nothing to do with a dive record until someone chooses to link one, and
// keeping it isolated means a full logbook wipe (clearAll in diveLog/storage)
// doesn't have to know this exists, and vice versa.
//
// Every function is a pure function of a storage backend (getItem/setItem/
// removeItem), like diveLog/storage.js, so tests can pass an in-memory mock.

import AsyncStorage from '@react-native-async-storage/async-storage';

export const LOCATION_LOG_KEY = '@dmz-scuba/location-log-v1';

// A point is { t: <ms epoch>, lat, lon, accuracyMeters }. Kept as one JSON
// blob (not one AsyncStorage key per point) — coarse background sampling
// (a point every several hundred meters or tens of minutes) means even
// 90 days of history is a few thousand small objects at most, well within a
// single value's comfortable size, and it makes prune-by-age a single
// read-filter-write instead of enumerating many keys.

export async function loadLocationPoints(storage = AsyncStorage) {
  try {
    const raw = await storage.getItem(LOCATION_LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveLocationPoints(points, storage = AsyncStorage) {
  await storage.setItem(LOCATION_LOG_KEY, JSON.stringify(points));
}

/** Appends one sampled point and prunes anything older than `maxAgeMs`. */
export async function appendLocationPoint(point, maxAgeMs, storage = AsyncStorage) {
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lon) || !Number.isFinite(point.t)) return;
  const existing = await loadLocationPoints(storage);
  const cutoff = Date.now() - Math.max(0, maxAgeMs || 0);
  const kept = maxAgeMs > 0 ? existing.filter((p) => p.t >= cutoff) : existing;
  kept.push(point);
  kept.sort((a, b) => a.t - b.t);
  await saveLocationPoints(kept, storage);
}

/** Drops every point older than `maxAgeMs`. Safe to call opportunistically
 * (e.g. on app start) — a no-op if nothing has aged out. */
export async function pruneLocationPoints(maxAgeMs, storage = AsyncStorage) {
  if (!(maxAgeMs > 0)) return;
  const existing = await loadLocationPoints(storage);
  const cutoff = Date.now() - maxAgeMs;
  const kept = existing.filter((p) => p.t >= cutoff);
  if (kept.length !== existing.length) await saveLocationPoints(kept, storage);
}

export async function clearLocationPoints(storage = AsyncStorage) {
  await storage.removeItem(LOCATION_LOG_KEY);
}
