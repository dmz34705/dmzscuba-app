// Logbook relationship/index integrity checks and mechanical repair.
// Framework-independent; accepts any AsyncStorage-shaped backend.

import {
  normalizeComputerLog,
  normalizeDive,
} from './schema';
import {
  DIVE_LOG_DIVE_PREFIX,
  DIVE_LOG_INDEX_KEY,
  DIVE_LOG_LOG_PREFIX,
  diveKey,
  indexRowFromDive,
  logKey,
  rebuildIndex,
} from './storage';

function parseJson(raw, fallback = null) {
  if (!raw) return fallback;
  try {
    const value = JSON.parse(raw);
    return value == null ? fallback : value;
  } catch {
    return fallback;
  }
}

function sameValues(a, b) {
  const left = [...new Set(Array.isArray(a) ? a : [])].sort();
  const right = [...new Set(Array.isArray(b) ? b : [])].sort();
  return left.length === right.length && left.every((value, i) => value === right[i]);
}

async function readRecords(storage) {
  const keys = (await storage.getAllKeys()) || [];
  const dives = new Map();
  const rawDives = new Map();
  const logs = new Map();

  for (const key of keys) {
    if (key.startsWith(DIVE_LOG_DIVE_PREFIX)) {
      // eslint-disable-next-line no-await-in-loop
      const raw = parseJson(await storage.getItem(key));
      if (!raw) continue;
      const dive = normalizeDive(raw);
      dives.set(dive.id, dive);
      rawDives.set(dive.id, raw);
    } else if (key.startsWith(DIVE_LOG_LOG_PREFIX)) {
      // eslint-disable-next-line no-await-in-loop
      const raw = parseJson(await storage.getItem(key));
      if (!raw) continue;
      const log = normalizeComputerLog(raw);
      logs.set(log.id, log);
    }
  }
  const rawIndex = parseJson(await storage.getItem(DIVE_LOG_INDEX_KEY), []);
  const index = Array.isArray(rawIndex) ? rawIndex.filter((row) => row && typeof row.id === 'string') : [];
  return { dives, rawDives, logs, index };
}

function problem(code, ids, detail) {
  return { code, ...ids, detail };
}

export async function checkLogbookIntegrity(storage) {
  const { dives, rawDives, logs, index } = await readRecords(storage);
  const problems = [];
  const liveReferences = new Map();

  for (const [diveId, dive] of dives) {
    const raw = rawDives.get(diveId) || dive;
    const rawLogIds = Array.isArray(raw.logIds) ? raw.logIds.filter((id) => typeof id === 'string' && id) : [];
    if (dive.deletedAt && rawLogIds.length) {
      problems.push(problem('DELETED_DIVE_HAS_LOGS', { diveId }, `${rawLogIds.length} log reference(s) remain`));
    }
    for (const logId of rawLogIds) {
      if (!logs.has(logId)) {
        problems.push(problem('DANGLING_DIVE_LOG', { diveId, logId }, 'Dive references a missing ComputerLog'));
      }
      if (!dive.deletedAt) {
        if (!liveReferences.has(logId)) liveReferences.set(logId, []);
        liveReferences.get(logId).push(diveId);
      }
    }

    const primaryLogId = typeof raw.primaryLogId === 'string' && raw.primaryLogId ? raw.primaryLogId : null;
    if (primaryLogId && !rawLogIds.includes(primaryLogId)) {
      problems.push(problem('PRIMARY_NOT_LISTED', { diveId, logId: primaryLogId }, 'primaryLogId is not in logIds'));
    }
    if (primaryLogId && !logs.has(primaryLogId)) {
      problems.push(problem('PRIMARY_LOG_MISSING', { diveId, logId: primaryLogId }, 'primaryLogId does not resolve'));
    }
  }

  for (const [logId, log] of logs) {
    const owner = log.diveId ? dives.get(log.diveId) : null;
    if (!owner) {
      problems.push(problem('LOG_DIVE_MISSING', { logId, diveId: log.diveId || undefined }, 'ComputerLog has no existing Dive owner'));
    } else if (!owner.logIds.includes(logId)) {
      problems.push(problem('LOG_NOT_LISTED', { logId, diveId: log.diveId }, 'Owning Dive does not list the ComputerLog'));
    }
    const refs = liveReferences.get(logId) || [];
    if (refs.length > 1) {
      problems.push(problem('LOG_MULTI_REFERENCED', { logId }, `Referenced by live dives: ${refs.join(', ')}`));
    }
  }

  const indexById = new Map();
  for (const row of index) {
    if (indexById.has(row.id)) {
      problems.push(problem('DUPLICATE_INDEX_ROW', { diveId: row.id }, 'Dive appears more than once in the index'));
    }
    indexById.set(row.id, row);
    const dive = dives.get(row.id);
    if (!dive) {
      problems.push(problem('INDEX_WITHOUT_DIVE', { diveId: row.id }, 'Index row has no backing Dive record'));
      continue;
    }
    const attached = dive.logIds.map((id) => logs.get(id)).filter(Boolean);
    const expected = indexRowFromDive(dive, attached);
    if (row.logCount !== expected.logCount) {
      problems.push(problem('INDEX_LOG_COUNT', { diveId: row.id }, `Expected ${expected.logCount}, found ${row.logCount}`));
    }
    if (!sameValues(row.deviceKeys, expected.deviceKeys)) {
      problems.push(problem('INDEX_DEVICE_KEYS', { diveId: row.id }, 'deviceKeys do not match attached logs'));
    }
    if (!sameValues(row.computerKeys, expected.computerKeys)) {
      problems.push(problem('INDEX_COMPUTER_KEYS', { diveId: row.id }, 'computerKeys do not match attached logs'));
    }
  }
  for (const diveId of dives.keys()) {
    if (!indexById.has(diveId)) {
      problems.push(problem('DIVE_MISSING_INDEX', { diveId }, 'Dive record is missing from the index'));
    }
  }

  return { ok: problems.length === 0, problems };
}

export async function repairLogbook(storage) {
  const { dives, logs } = await readRecords(storage);
  const actions = [];
  const liveReferences = new Map();
  for (const dive of dives.values()) {
    if (dive.deletedAt) continue;
    for (const logId of dive.logIds) {
      if (!liveReferences.has(logId)) liveReferences.set(logId, []);
      liveReferences.get(logId).push(dive.id);
    }
  }

  for (const dive of dives.values()) {
    let logIds = dive.logIds.filter((logId) => logs.has(logId));
    if (logIds.length !== dive.logIds.length) {
      actions.push({ code: 'DROPPED_DANGLING_LOG_IDS', diveId: dive.id, detail: `${dive.logIds.length - logIds.length} removed` });
    }
    if (dive.deletedAt && logIds.length) {
      for (const logId of logIds) {
        const log = logs.get(logId);
        const otherLiveOwners = (liveReferences.get(logId) || []).filter((id) => id !== dive.id);
        if (log?.diveId === dive.id && !otherLiveOwners.length) {
          // eslint-disable-next-line no-await-in-loop
          await storage.removeItem(logKey(logId));
          logs.delete(logId);
          actions.push({ code: 'REMOVED_DELETED_DIVE_LOG', diveId: dive.id, logId, detail: 'Removed log owned only by a deleted Dive' });
        }
      }
      logIds = [];
      actions.push({ code: 'CLEARED_DELETED_DIVE_LOGS', diveId: dive.id, detail: 'Cleared logIds on soft-deleted Dive' });
    }
    const primaryLogId = logIds.includes(dive.primaryLogId) ? dive.primaryLogId : (logIds[0] || null);
    const next = normalizeDive({ ...dive, logIds, primaryLogId });
    // eslint-disable-next-line no-await-in-loop
    await storage.setItem(diveKey(next.id), JSON.stringify(next));
  }

  // Restore unambiguous bidirectional links, preferring the log's declared live
  // owner and otherwise its sole live Dive reference.
  for (const log of logs.values()) {
    const declared = log.diveId ? dives.get(log.diveId) : null;
    const refs = (liveReferences.get(log.id) || []).filter((id) => dives.has(id));
    let ownerId = declared && !declared.deletedAt ? declared.id : null;
    if (!ownerId && refs.length === 1) ownerId = refs[0];
    if (!ownerId) continue;

    for (const refId of refs) {
      if (refId === ownerId) continue;
      const dive = dives.get(refId);
      const next = normalizeDive({ ...dive, logIds: dive.logIds.filter((id) => id !== log.id) });
      // eslint-disable-next-line no-await-in-loop
      await storage.setItem(diveKey(next.id), JSON.stringify(next));
      dives.set(next.id, next);
      actions.push({ code: 'REMOVED_DUPLICATE_LOG_REFERENCE', diveId: refId, logId: log.id, detail: `Kept owner ${ownerId}` });
    }
    let owner = dives.get(ownerId);
    if (!owner.logIds.includes(log.id)) {
      owner = normalizeDive({ ...owner, logIds: [...owner.logIds, log.id] });
      // eslint-disable-next-line no-await-in-loop
      await storage.setItem(diveKey(owner.id), JSON.stringify(owner));
      dives.set(owner.id, owner);
      actions.push({ code: 'RESTORED_DIVE_LOG_REFERENCE', diveId: ownerId, logId: log.id, detail: 'Added missing logIds backlink' });
    }
    if (log.diveId !== ownerId) {
      const nextLog = normalizeComputerLog({ ...log, diveId: ownerId });
      // eslint-disable-next-line no-await-in-loop
      await storage.setItem(logKey(nextLog.id), JSON.stringify(nextLog));
      actions.push({ code: 'RESTORED_LOG_DIVE_REFERENCE', diveId: ownerId, logId: log.id, detail: 'Updated ComputerLog owner' });
    }
  }

  await rebuildIndex(storage);
  actions.push({ code: 'REBUILT_INDEX', detail: 'Recomputed all index rows from Dive and ComputerLog records' });
  const integrity = await checkLogbookIntegrity(storage);
  return { repaired: actions.length, actions, ...integrity };
}
