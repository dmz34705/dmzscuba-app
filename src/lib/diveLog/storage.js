// AsyncStorage persistence for the dive logbook.
//
// Layout (per-record, so account sync and large profiles stay cheap):
//   @dmz-scuba/dive-log/index-v1        -> lightweight index rows (powers list + stats)
//   @dmz-scuba/dive-log/entry-v1/<id>   -> the full dive record
//
// Every function is a pure function of a storage backend. It defaults to
// AsyncStorage; tests pass an in-memory mock with the same method surface
// (getItem / setItem / removeItem / getAllKeys).

import AsyncStorage from '@react-native-async-storage/async-storage';

import { normalizeDiveRecord, touchRecord } from './schema';

export const DIVE_LOG_INDEX_KEY = '@dmz-scuba/dive-log/index-v1';
export const DIVE_LOG_ENTRY_PREFIX = '@dmz-scuba/dive-log/entry-v1/';
export const DIVE_LOG_FINGERPRINT_PREFIX = '@dmz-scuba/dive-log/fingerprint-v1/';

export function entryKey(id) {
  return `${DIVE_LOG_ENTRY_PREFIX}${id}`;
}

/** Stable de-dup key for a downloaded dive (source==='computer'). */
export function computerKeyFromRecord(record) {
  const fp = record.device?.fingerprint;
  if (record.source !== 'computer' || !fp) return null;
  return `${record.device.vendor || ''}|${record.device.product || ''}|${fp}`;
}

export function indexRowFromRecord(record) {
  return {
    id: record.id,
    startTime: record.startTime,
    updatedAt: record.updatedAt,
    deletedAt: record.deletedAt,
    siteName: record.site?.name || '',
    maxDepthMeters: record.water?.maxDepthMeters ?? 0,
    durationSeconds: record.durationSeconds ?? 0,
    source: record.source || 'manual',
    rating: record.rating ?? null,
    computerKey: computerKeyFromRecord(record),
  };
}

function fingerprintKey(vendor, product) {
  return `${DIVE_LOG_FINGERPRINT_PREFIX}${vendor || ''}|${product || ''}`;
}

/** Last downloaded fingerprint (base64) for a given computer, for incremental sync. */
export async function loadFingerprint(vendor, product, storage = AsyncStorage) {
  return (await storage.getItem(fingerprintKey(vendor, product))) || null;
}

export async function saveFingerprint(vendor, product, fingerprintBase64, storage = AsyncStorage) {
  if (!fingerprintBase64) return;
  await storage.setItem(fingerprintKey(vendor, product), String(fingerprintBase64));
}

function parseJson(raw, fallback) {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

export async function loadIndex(storage = AsyncStorage) {
  const raw = await storage.getItem(DIVE_LOG_INDEX_KEY);
  const rows = parseJson(raw, []);
  return Array.isArray(rows) ? rows.filter((row) => row && typeof row.id === 'string') : [];
}

async function writeIndex(rows, storage) {
  await storage.setItem(DIVE_LOG_INDEX_KEY, JSON.stringify(rows));
}

export async function loadEntry(id, storage = AsyncStorage) {
  if (!id) return null;
  const raw = await storage.getItem(entryKey(id));
  const parsed = parseJson(raw, null);
  return parsed ? normalizeDiveRecord(parsed) : null;
}

export async function loadAll(storage = AsyncStorage) {
  const index = await loadIndex(storage);
  const entries = await Promise.all(index.map((row) => loadEntry(row.id, storage)));
  return entries.filter(Boolean);
}

export async function saveEntry(record, storage = AsyncStorage) {
  const normalized = normalizeDiveRecord(record);
  await storage.setItem(entryKey(normalized.id), JSON.stringify(normalized));
  const index = await loadIndex(storage);
  const row = indexRowFromRecord(normalized);
  const next = index.filter((existing) => existing.id !== normalized.id);
  next.push(row);
  await writeIndex(next, storage);
  return normalized;
}

export async function softDeleteEntry(id, storage = AsyncStorage) {
  const current = await loadEntry(id, storage);
  if (!current) return null;
  const deleted = touchRecord({ ...current, deletedAt: new Date().toISOString() });
  return saveEntry(deleted, storage);
}

export async function clearAll(storage = AsyncStorage) {
  const keys = await storage.getAllKeys();
  const mine = (keys || []).filter(
    (key) => key === DIVE_LOG_INDEX_KEY
      || key.startsWith(DIVE_LOG_ENTRY_PREFIX)
      || key.startsWith(DIVE_LOG_FINGERPRINT_PREFIX),
  );
  if (typeof storage.multiRemove === 'function') {
    await storage.multiRemove(mine);
    return;
  }
  await Promise.all(mine.map((key) => storage.removeItem(key)));
}
