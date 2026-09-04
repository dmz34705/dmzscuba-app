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
import { fuseComputerLogs } from './fuseLogs';
import { sameComputer } from './matchDives';

export const DIVE_LOG_INDEX_KEY = '@dmz-scuba/dive-log/index-v2';
export const DIVE_LOG_DIVE_PREFIX = '@dmz-scuba/dive-log/dive-v2/';
export const DIVE_LOG_LOG_PREFIX = '@dmz-scuba/dive-log/log-v2/';
export const DIVE_LOG_CORRECTIONS_KEY = '@dmz-scuba/dive-log/corrections-v1';
export const DIVE_LOG_FINGERPRINT_PREFIX = '@dmz-scuba/dive-log/fingerprint-v1/';
export const DIVE_LOG_PRIORITY_KEY = '@dmz-scuba/dive-log/computer-priority-v1';

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
  const a = primary?.analytics || null;
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
    gasLabel: dive.gas?.mixes?.[0]?.label || '',
    logCount: attachedLogs.length,
    deviceKeys: [...new Set(attachedLogs.map((l) => l.deviceKey).filter(Boolean))],
    computerKeys: attachedLogs.flatMap((l) => {
      const fps = [l.fingerprint, ...(l.mergedFingerprints || [])].filter(Boolean);
      return fps.map((fp) => computerDiveKeyOf(l.device, fp)).filter(Boolean);
    }),
    primaryDevice: primary ? { ...primary.device } : null,
    // primary-log analytics summary for the trends view (avoids loading every log)
    safetyScore: a && a.safetyScore != null ? a.safetyScore : null,
    sacBarPerMin: a ? a.sacBarPerMin : null,
    rmvLitersPerMin: a ? a.rmvLitersPerMin : null,
    ascentRateMaxMPerMin: a ? a.ascentRateMaxMPerMin : null,
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
export async function loadMatchCandidates(reportedStartTime, { windowHours = 72 } = {}, storage = AsyncStorage) {
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
  const [created] = await createDivesFromLogs([logPartial], storage);
  return created;
}

/**
 * Create a Dive + ComputerLog for each partial and write the index ONCE at the
 * end. A bulk download fires these back-to-back; per-call index read-modify-write
 * races and loses rows, so callers must batch.
 * @returns [{ dive, log }]
 */
export async function createDivesFromLogs(logPartials, storage = AsyncStorage) {
  const list = Array.isArray(logPartials) ? logPartials : [];
  if (!list.length) return [];
  const index = await loadIndex(storage);
  const created = [];
  for (const partial of list) {
    const log = createComputerLog(partial);
    const dive = surfaceLogOntoDive(
      createDive({ source: 'computer', logIds: [log.id], primaryLogId: log.id }),
      log,
    );
    const linkedLog = normalizeComputerLog({ ...log, diveId: dive.id });
    const normDive = normalizeDive({ ...dive, logIds: [linkedLog.id], primaryLogId: linkedLog.id });
    // eslint-disable-next-line no-await-in-loop
    await storage.setItem(logKey(linkedLog.id), JSON.stringify(linkedLog));
    // eslint-disable-next-line no-await-in-loop
    await storage.setItem(diveKey(normDive.id), JSON.stringify(normDive));
    index.push(indexRowFromDive(normDive, [linkedLog]));
    created.push({ dive: normDive, log: linkedLog });
  }
  await writeIndex(index, storage);
  return created;
}

/**
 * Fold `fromDiveIds` into `keepDiveId`: move their logs across, re-surface the
 * primary, soft-delete the emptied dives. Used by the matcher (spanning merge)
 * and the manual "merge dives" action. Optionally shift a device's logs by
 * `correction` = { deviceKey, offsetMinutes }.
 */
export async function mergeDives(keepDiveId, fromDiveIds, { correction = null } = {}, storage = AsyncStorage) {
  const keep = await loadDive(keepDiveId, storage);
  if (!keep) return null;
  const logIds = new Set(keep.logIds);
  for (const fromId of fromDiveIds) {
    if (fromId === keepDiveId) continue;
    // eslint-disable-next-line no-await-in-loop
    const from = await loadDive(fromId, storage);
    if (!from) continue;
    for (const lid of from.logIds) {
      // eslint-disable-next-line no-await-in-loop
      const log = await loadLog(lid, storage);
      if (!log) continue;
      // eslint-disable-next-line no-await-in-loop
      await saveLog({ ...log, diveId: keepDiveId }, storage);
      logIds.add(lid);
    }
    // Drop the moved logs from the absorbed dive BEFORE soft-deleting it, so a
    // later purgeDeleted doesn't hard-remove logs that now live on `keep`.
    // eslint-disable-next-line no-await-in-loop
    await saveDive(touchRecord({
      ...from, logIds: [], primaryLogId: null, deletedAt: new Date().toISOString(),
    }), storage);
  }

  // Apply the clock correction to every log on the merged dive from the wrong
  // computer (serial-tolerant), keep's own logs included.
  if (correction && correction.offsetMinutes) {
    const wrongDevice = { vendor: '', product: '', serial: '', ...(correction.device || {}) };
    const parts = String(correction.deviceKey || '').split('|');
    if (!correction.device) { wrongDevice.vendor = parts[0] || ''; wrongDevice.product = parts[1] || ''; wrongDevice.serial = parts[2] || ''; }
    for (const lid of logIds) {
      // eslint-disable-next-line no-await-in-loop
      const log = await loadLog(lid, storage);
      if (!log || !sameComputer(log.device, wrongDevice)) continue;
      // eslint-disable-next-line no-await-in-loop
      await saveLog({ ...log, timeCorrectionMinutes: (log.timeCorrectionMinutes || 0) + correction.offsetMinutes }, storage);
    }
  }

  let next = normalizeDive({
    ...keep,
    logIds: [...logIds],
    source: keep.source === 'manual' ? 'mixed' : keep.source,
  });
  const logs = await loadLogsForDive(next, storage);
  const primary = logs.find((l) => l.id === next.primaryLogId)
    || logs.slice().sort((a, b) => (b.durationSeconds || 0) - (a.durationSeconds || 0))[0]
    || null;
  if (primary) next = surfaceLogOntoDive({ ...next, primaryLogId: primary.id }, primary);
  await saveDive(next, storage);
  return consolidateSameDeviceLogs(keepDiveId, storage);
}

/**
 * When one physical computer contributed several logs to a dive (it split the
 * dive at the surface), fuse them into one continuous reconstructed log. Runs
 * after every merge/attach. No-op when each device has at most one log.
 */
export async function consolidateSameDeviceLogs(diveId, storage = AsyncStorage) {
  const dive = await loadDive(diveId, storage);
  if (!dive) return null;
  const logs = await loadLogsForDive(dive, storage);
  // Group by physical computer, serial-tolerant — a dropped serial must not stop
  // two fragments from the same unit fusing.
  const groups = [];
  for (const l of logs) {
    const g = groups.find((grp) => sameComputer(grp[0].device, l.device));
    if (g) g.push(l); else groups.push([l]);
  }
  let changed = false;
  let keptIds = [...dive.logIds];
  for (const group of groups) {
    if (group.length < 2) continue;
    const fused = await saveLog({ ...fuseComputerLogs(group), diveId }, storage); // eslint-disable-line no-await-in-loop
    const drop = new Set(group.map((l) => l.id).filter((id) => id !== fused.id));
    for (const id of drop) {
      // eslint-disable-next-line no-await-in-loop
      await storage.removeItem(logKey(id));
    }
    keptIds = keptIds.filter((id) => !drop.has(id));
    if (!keptIds.includes(fused.id)) keptIds.push(fused.id); // fuse may have minted a new id
    changed = true;
  }
  if (!changed) return dive;
  let next = normalizeDive({ ...dive, logIds: keptIds });
  const freshLogs = await loadLogsForDive(next, storage);
  const primary = freshLogs.find((l) => l.id === next.primaryLogId)
    || freshLogs.slice().sort((a, b) => (b.durationSeconds || 0) - (a.durationSeconds || 0))[0]
    || null;
  if (primary) next = surfaceLogOntoDive({ ...next, primaryLogId: primary.id }, primary);
  return saveDive(next, storage);
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
  await saveDive({ ...next, logIds, primaryLogId }, storage);
  const consolidated = await consolidateSameDeviceLogs(diveId, storage);
  return { dive: consolidated, log };
}

// ---------------------------------------------------------------------------
// computer priority (primary / secondary / tertiary) — an ordered deviceKey list
// ---------------------------------------------------------------------------

export async function loadComputerPriority(storage = AsyncStorage) {
  const raw = parseJson(await storage.getItem(DIVE_LOG_PRIORITY_KEY), []);
  return Array.isArray(raw) ? raw.filter((k) => typeof k === 'string' && k) : [];
}

export async function saveComputerPriority(order, storage = AsyncStorage) {
  const clean = [...new Set((Array.isArray(order) ? order : []).filter(Boolean))];
  await storage.setItem(DIVE_LOG_PRIORITY_KEY, JSON.stringify(clean));
  return clean;
}

/** 0-based rank of a deviceKey; unranked computers sort after ranked ones. */
export function priorityIndex(order, deviceKey) {
  const i = (order || []).indexOf(deviceKey);
  return i === -1 ? 999 : i;
}

/** Pick the log to show for a dive: best-ranked computer, then longest. */
export function pickPrimaryLog(logs, order) {
  const live = (Array.isArray(logs) ? logs : []).filter(Boolean);
  if (!live.length) return null;
  return live.slice().sort((a, b) => (
    priorityIndex(order, a.deviceKey) - priorityIndex(order, b.deviceKey)
    || (b.durationSeconds || 0) - (a.durationSeconds || 0)
  ))[0];
}

/**
 * Recompute primaryLogId + re-surface the summary for every multi-log dive from
 * the current priority order. Called after the order changes.
 */
export async function resurfaceForPriority(storage = AsyncStorage) {
  const order = await loadComputerPriority(storage);
  const index = await loadIndex(storage);
  for (const row of index) {
    if (!(row.logCount > 1)) continue;
    // eslint-disable-next-line no-await-in-loop
    const dive = await loadDive(row.id, storage);
    if (!dive) continue;
    // eslint-disable-next-line no-await-in-loop
    const logs = await loadLogsForDive(dive, storage);
    const primary = pickPrimaryLog(logs, order);
    if (!primary || primary.id === dive.primaryLogId) continue;
    // eslint-disable-next-line no-await-in-loop
    await saveDive(surfaceLogOntoDive({ ...dive, primaryLogId: primary.id }, primary), storage);
  }
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

/**
 * Rebuild the index by scanning storage for every dive-v2 key — NOT from the
 * current index — so it also recovers dives that were written without an index
 * row. Used on mount when an orphan is detected and after a bulk import.
 */
export async function rebuildIndex(storage = AsyncStorage) {
  const keys = (await storage.getAllKeys()) || [];
  const ids = keys
    .filter((k) => k.startsWith(DIVE_LOG_DIVE_PREFIX))
    .map((k) => k.slice(DIVE_LOG_DIVE_PREFIX.length));
  const rows = [];
  for (const id of ids) {
    // eslint-disable-next-line no-await-in-loop
    const dive = await loadDive(id, storage);
    if (!dive) continue;
    // eslint-disable-next-line no-await-in-loop
    const logs = await loadLogsForDive(dive, storage);
    rows.push(indexRowFromDive(dive, logs));
  }
  await writeIndex(rows, storage);
  return rows;
}

/** Count of dive-v2 records in storage (to detect index orphans). */
export async function countStoredDives(storage = AsyncStorage) {
  const keys = (await storage.getAllKeys()) || [];
  return keys.filter((k) => k.startsWith(DIVE_LOG_DIVE_PREFIX)).length;
}

async function removeKeys(keys, storage) {
  if (!keys.length) return;
  if (typeof storage.multiRemove === 'function') {
    await storage.multiRemove(keys);
    return;
  }
  await Promise.all(keys.map((key) => storage.removeItem(key)));
}

/** Wipe every dive-log key, v1 backup included. Dev reset — irreversible. */
export async function clearAll(storage = AsyncStorage) {
  const keys = (await storage.getAllKeys()) || [];
  const mine = keys.filter(
    (key) => key === DIVE_LOG_INDEX_KEY
      || key === DIVE_LOG_CORRECTIONS_KEY
      || key === V1_INDEX_KEY
      || key.startsWith(DIVE_LOG_DIVE_PREFIX)
      || key.startsWith(DIVE_LOG_LOG_PREFIX)
      || key.startsWith(DIVE_LOG_FINGERPRINT_PREFIX)
      || key.startsWith(V1_ENTRY_PREFIX),
  );
  await removeKeys(mine, storage);
  // Leave a v2 marker so migrateToV2 doesn't rebuild from a stale v1 backup.
  await storage.setItem(DIVE_LOG_INDEX_KEY, '[]');
}

/**
 * Hard-delete soft-deleted dives (and their logs, index rows) plus every
 * per-computer fingerprint marker. Keeps live dives. Returns how many dives went.
 */
export async function purgeDeleted(storage = AsyncStorage) {
  const index = await loadIndex(storage);
  const dead = index.filter((row) => row.deletedAt);
  const deadIds = new Set(dead.map((row) => row.id));
  const logKeysToDrop = [];
  for (const row of dead) {
    // eslint-disable-next-line no-await-in-loop
    const dive = await loadDive(row.id, storage);
    for (const lid of dive?.logIds || []) {
      // eslint-disable-next-line no-await-in-loop
      const log = await loadLog(lid, storage);
      // Only drop a log if it still belongs to a dead dive — a merge may have
      // reassigned it to a live dive without clearing this stale logIds entry.
      if (!log || deadIds.has(log.diveId) || !log.diveId) logKeysToDrop.push(logKey(lid));
    }
  }
  await removeKeys([
    ...dead.map((row) => diveKey(row.id)),
    ...logKeysToDrop,
  ], storage);
  await writeIndex(index.filter((row) => !row.deletedAt), storage);

  // fingerprint markers are keyed by BLE name, not dive — clear them all so a
  // re-download of a purged dive isn't skipped.
  const allKeys = (await storage.getAllKeys()) || [];
  await removeKeys(allKeys.filter((k) => k.startsWith(DIVE_LOG_FINGERPRINT_PREFIX)), storage);

  return dead.length;
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
