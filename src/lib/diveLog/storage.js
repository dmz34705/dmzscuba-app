// AsyncStorage persistence for the dive logbook (schemaVersion 2).
//
// Layout:
//   @dmz-scuba/dive-log/index-v2            -> lightweight Dive rows (list + stats)
//   @dmz-scuba/dive-log/dive-v2/<id>        -> a Dive (canonical record)
//   @dmz-scuba/dive-log/log-v2/<logId>      -> a ComputerLog (profile lives here)
//   @dmz-scuba/dive-log/corrections-v1      -> remembered per-device clock decisions
//   @dmz-scuba/dive-log/fingerprint-v1/<n>  -> last downloaded fingerprint per BLE name
//
// The v1 keys (index-v1 / entry-v1) are read once by migrateToV2 and then left
// in place as a backup.
//
// Every function is a pure function of a storage backend (getItem / setItem /
// removeItem / getAllKeys [/ multiRemove]); tests pass an in-memory mock.

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  computerDiveKeyOf,
  createComputerLog,
  createDive,
  deviceKeyOf,
  normalizeComputerLog,
  normalizeDive,
  normalizeDiveRecord,
  surfaceLogOntoDive,
  touchRecord,
} from './schema';

export const DIVE_LOG_INDEX_KEY = '@dmz-scuba/dive-log/index-v2';
export const DIVE_LOG_DIVE_PREFIX = '@dmz-scuba/dive-log/dive-v2/';
export const DIVE_LOG_LOG_PREFIX = '@dmz-scuba/dive-log/log-v2/';
export const DIVE_LOG_CORRECTIONS_KEY = '@dmz-scuba/dive-log/corrections-v1';
export const DIVE_LOG_FINGERPRINT_PREFIX = '@dmz-scuba/dive-log/fingerprint-v1/';

// v1 (pre-migration) keys — read-only after migrateToV2.
const V1_INDEX_KEY = '@dmz-scuba/dive-log/index-v1';
const V1_ENTRY_PREFIX = '@dmz-scuba/dive-log/entry-v1/';

export function diveKey(id) {
  return `${DIVE_LOG_DIVE_PREFIX}${id}`;
}
export function logKey(id) {
  return `${DIVE_LOG_LOG_PREFIX}${id}`;
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

// ---------------------------------------------------------------------------
// index rows
// ---------------------------------------------------------------------------

/** Lightweight row for the list + stats, computed from a Dive and its logs. */
export function indexRowFromDive(dive, logs = []) {
  const attachedLogs = Array.isArray(logs) ? logs.filter(Boolean) : [];
  const primary = attachedLogs.find((l) => l.id === dive.primaryLogId) || attachedLogs[0] || null;
  return {
    id: dive.id,
    startTime: dive.startTime,
    updatedAt: dive.updatedAt,
    deletedAt: dive.deletedAt,
    siteName: dive.site?.name || '',
    maxDepthMeters: dive.water?.maxDepthMeters ?? 0,
    avgDepthMeters: dive.water?.avgDepthMeters ?? null,
    durationSeconds: dive.durationSeconds ?? 0,
    source: dive.source || 'manual',
    rating: dive.rating ?? null,
    number: dive.number ?? null,
    logCount: attachedLogs.length,
    deviceKeys: attachedLogs.map((l) => l.deviceKey).filter(Boolean),
    computerKeys: attachedLogs.map((l) => computerDiveKeyOf(l.device, l.fingerprint)).filter(Boolean),
    primaryDevice: primary ? { ...primary.device } : null,
  };
}

export async function loadIndex(storage = AsyncStorage) {
  const rows = parseJson(await storage.getItem(DIVE_LOG_INDEX_KEY), []);
  return Array.isArray(rows) ? rows.filter((row) => row && typeof row.id === 'string') : [];
}

async function writeIndex(rows, storage) {
  await storage.setItem(DIVE_LOG_INDEX_KEY, JSON.stringify(rows));
}

async function upsertIndexRow(row, storage) {
  const index = await loadIndex(storage);
  const next = index.filter((existing) => existing.id !== row.id);
  next.push(row);
  await writeIndex(next, storage);
}

// ---------------------------------------------------------------------------
// ComputerLog CRUD
// ---------------------------------------------------------------------------

export async function loadLog(id, storage = AsyncStorage) {
  if (!id) return null;
  const parsed = parseJson(await storage.getItem(logKey(id)), null);
  return parsed ? normalizeComputerLog(parsed) : null;
}

export async function loadLogsForDive(dive, storage = AsyncStorage) {
  const ids = Array.isArray(dive?.logIds) ? dive.logIds : [];
  const logs = await Promise.all(ids.map((id) => loadLog(id, storage)));
  return logs.filter(Boolean);
}

export async function saveLog(log, storage = AsyncStorage) {
  const normalized = normalizeComputerLog(log);
  await storage.setItem(logKey(normalized.id), JSON.stringify(normalized));
  return normalized;
}

// ---------------------------------------------------------------------------
// Dive CRUD
// ---------------------------------------------------------------------------

export async function loadDive(id, storage = AsyncStorage) {
  if (!id) return null;
  const parsed = parseJson(await storage.getItem(diveKey(id)), null);
  return parsed ? normalizeDive(parsed) : null;
}

/** Save a Dive and refresh its index row (loading its logs to compute the row). */
export async function saveDive(dive, storage = AsyncStorage) {
  const normalized = normalizeDive(dive);
  await storage.setItem(diveKey(normalized.id), JSON.stringify(normalized));
  const logs = await loadLogsForDive(normalized, storage);
  await upsertIndexRow(indexRowFromDive(normalized, logs), storage);
  return normalized;
}

export async function loadAll(storage = AsyncStorage) {
  const index = await loadIndex(storage);
  const dives = await Promise.all(index.map((row) => loadDive(row.id, storage)));
  return dives.filter(Boolean);
}

/**
 * Existing dives (+ their logs) that could be the same real dive as a log whose
 * reported start is `reportedStartTime`: within ±`windowHours` and not deleted.
 * The matcher does the expensive profile comparison on this shortlist.
 */
export async function loadMatchCandidates(reportedStartTime, { windowHours = 30 } = {}, storage = AsyncStorage) {
  const t = Date.parse(reportedStartTime);
  if (Number.isNaN(t)) return [];
  const windowMs = windowHours * 3600 * 1000;
  const index = await loadIndex(storage);
  const near = index.filter((row) => {
    if (row.deletedAt) return false;
    const rt = Date.parse(row.startTime);
    return !Number.isNaN(rt) && Math.abs(rt - t) <= windowMs;
  });
  const bundles = [];
  for (const row of near) {
    // eslint-disable-next-line no-await-in-loop
    const dive = await loadDive(row.id, storage);
    if (!dive) continue;
    // eslint-disable-next-line no-await-in-loop
    const logs = await loadLogsForDive(dive, storage);
    bundles.push({ dive, logs });
  }
  return bundles;
}

export async function softDeleteDive(id, storage = AsyncStorage) {
  const current = await loadDive(id, storage);
  if (!current) return null;
  return saveDive(touchRecord({ ...current, deletedAt: new Date().toISOString() }), storage);
}

/**
 * Create a Dive from a ComputerLog (no match found). Persists the log, then a
 * Dive with the log's field values surfaced onto it.
 */
export async function createDiveFromLog(logPartial, storage = AsyncStorage) {
  const log = createComputerLog(logPartial);
  const dive = surfaceLogOntoDive(
    createDive({ source: 'computer', logIds: [log.id], primaryLogId: log.id }),
    log,
  );
  const linkedLog = await saveLog({ ...log, diveId: dive.id }, storage);
  const savedDive = await saveDive({ ...dive, logIds: [linkedLog.id], primaryLogId: linkedLog.id }, storage);
  return { dive: savedDive, log: linkedLog };
}

/** Attach an already-created ComputerLog to an existing Dive. */
export async function attachLogToDive(diveId, logPartial, { makePrimary = false } = {}, storage = AsyncStorage) {
  const dive = await loadDive(diveId, storage);
  if (!dive) return null;
  const log = await saveLog({ ...createComputerLog(logPartial), diveId }, storage);
  const logIds = [...new Set([...dive.logIds, log.id])];
  const primaryLogId = makePrimary || !dive.primaryLogId ? log.id : dive.primaryLogId;
  let next = normalizeDive({ ...dive, logIds, primaryLogId, source: dive.source === 'manual' ? 'mixed' : dive.source });
  if (primaryLogId === log.id) next = surfaceLogOntoDive(next, log);
  const savedDive = await saveDive({ ...next, logIds, primaryLogId }, storage);
  return { dive: savedDive, log };
}

// ---------------------------------------------------------------------------
// per-device clock corrections
// ---------------------------------------------------------------------------

export async function loadDeviceTimeCorrections(storage = AsyncStorage) {
  const rows = parseJson(await storage.getItem(DIVE_LOG_CORRECTIONS_KEY), []);
  return Array.isArray(rows) ? rows : [];
}

export async function saveDeviceTimeCorrection(entry, storage = AsyncStorage) {
  const rows = await loadDeviceTimeCorrections(storage);
  rows.push({ ...entry, decidedAt: entry.decidedAt || new Date().toISOString() });
  await storage.setItem(DIVE_LOG_CORRECTIONS_KEY, JSON.stringify(rows));
  return rows;
}

// ---------------------------------------------------------------------------
// fingerprints (incremental re-download; keyed by advertised BLE name)
// ---------------------------------------------------------------------------

function fingerprintKey(deviceName) {
  return `${DIVE_LOG_FINGERPRINT_PREFIX}${deviceName || ''}`;
}

export async function loadFingerprint(deviceName, storage = AsyncStorage) {
  return (await storage.getItem(fingerprintKey(deviceName))) || null;
}
export async function saveFingerprint(deviceName, fingerprintBase64, storage = AsyncStorage) {
  if (!deviceName || !fingerprintBase64) return;
  await storage.setItem(fingerprintKey(deviceName), String(fingerprintBase64));
}
export async function clearFingerprint(deviceName, storage = AsyncStorage) {
  await storage.removeItem(fingerprintKey(deviceName));
}

// ---------------------------------------------------------------------------
// maintenance
// ---------------------------------------------------------------------------

/** Recompute every index row from its Dive + logs. */
export async function rebuildIndex(storage = AsyncStorage) {
  const dives = await loadAll(storage);
  const rows = [];
  for (const dive of dives) {
    // eslint-disable-next-line no-await-in-loop
    const logs = await loadLogsForDive(dive, storage);
    rows.push(indexRowFromDive(dive, logs));
  }
  await writeIndex(rows, storage);
  return rows;
}

export async function clearAll(storage = AsyncStorage) {
  const keys = (await storage.getAllKeys()) || [];
  const mine = keys.filter(
    (key) => key === DIVE_LOG_INDEX_KEY
      || key === DIVE_LOG_CORRECTIONS_KEY
      || key.startsWith(DIVE_LOG_DIVE_PREFIX)
      || key.startsWith(DIVE_LOG_LOG_PREFIX)
      || key.startsWith(DIVE_LOG_FINGERPRINT_PREFIX),
  );
  if (typeof storage.multiRemove === 'function') {
    await storage.multiRemove(mine);
    return;
  }
  await Promise.all(mine.map((key) => storage.removeItem(key)));
}

// ---------------------------------------------------------------------------
// v1 -> v2 migration (one-time; v1 keys left in place as a backup)
// ---------------------------------------------------------------------------

async function loadV1Entries(storage) {
  const rows = parseJson(await storage.getItem(V1_INDEX_KEY), []);
  const ids = Array.isArray(rows) ? rows.map((r) => r && r.id).filter(Boolean) : [];
  const raw = await Promise.all(ids.map((id) => storage.getItem(`${V1_ENTRY_PREFIX}${id}`)));
  return raw.map((r) => parseJson(r, null)).filter(Boolean).map(normalizeDiveRecord);
}

/** True once a v2 index exists (migration done or fresh install). */
export async function isMigratedToV2(storage = AsyncStorage) {
  return (await storage.getItem(DIVE_LOG_INDEX_KEY)) != null;
}

/**
 * Turn every v1 record into a Dive; `source:'computer'` records also spawn a
 * ComputerLog carrying the profile + device. Idempotent: does nothing once a v2
 * index exists.
 */
export async function migrateToV2(storage = AsyncStorage) {
  if (await isMigratedToV2(storage)) return { migrated: 0, alreadyDone: true };

  const entries = await loadV1Entries(storage);
  const indexRows = [];

  for (const entry of entries) {
    const isComputer = entry.source === 'computer' && entry.device;
    const diveBase = createDive({
      id: entry.id,
      createdAt: entry.createdAt,
      deletedAt: entry.deletedAt,
      sync: entry.sync,
      source: isComputer ? 'computer' : (entry.source === 'computer' ? 'manual' : entry.source),
      number: entry.number,
      startTime: entry.startTime,
      timezoneOffsetMinutes: entry.timezoneOffsetMinutes,
      durationSeconds: entry.durationSeconds,
      surfaceIntervalSeconds: entry.surfaceIntervalSeconds,
      site: entry.site,
      operator: entry.operator,
      buddies: entry.buddies,
      water: entry.water,
      atmosphericBar: entry.atmosphericBar,
      gas: entry.gas,
      diveMode: entry.diveMode,
      decoModel: entry.decoModel,
      gear: entry.gear,
      rating: entry.rating,
      notes: entry.notes,
      tags: entry.tags,
    });

    let logs = [];
    if (isComputer) {
      const log = await saveLog(createComputerLog({
        diveId: entry.id,
        device: {
          vendor: entry.device.vendor,
          product: entry.device.product,
          serial: entry.device.serial || '',
        },
        fingerprint: entry.device.fingerprint,
        downloadedAt: entry.createdAt,
        reportedStartTime: entry.startTime,
        timezoneOffsetMinutes: entry.timezoneOffsetMinutes,
        durationSeconds: entry.durationSeconds,
        surfaceIntervalSeconds: entry.surfaceIntervalSeconds,
        water: entry.water,
        atmosphericBar: entry.atmosphericBar,
        gas: entry.gas,
        diveMode: entry.diveMode,
        decoModel: entry.decoModel,
        profile: entry.profile,
      }), storage); // eslint-disable-line no-await-in-loop
      logs = [log];
      diveBase.logIds = [log.id];
      diveBase.primaryLogId = log.id;
    }

    const dive = normalizeDive(diveBase);
    await storage.setItem(diveKey(dive.id), JSON.stringify(dive)); // eslint-disable-line no-await-in-loop
    indexRows.push(indexRowFromDive(dive, logs));
  }

  await writeIndex(indexRows, storage);
  return { migrated: entries.length, alreadyDone: false };
}
