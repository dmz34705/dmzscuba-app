import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { createComputerLog, createDive, normalizeDive, surfaceLogOntoDive, touchRecord, withTimeCorrection } from '../../lib/diveLog/schema';
import { computeDiveLogStats } from '../../lib/diveLog/stats';
import { findMatch } from '../../lib/diveLog/matchDives';
import {
  attachLogToDive,
  createDiveFromLog,
  isMigratedToV2,
  loadDive,
  loadIndex,
  loadLog,
  loadLogsForDive,
  loadMatchCandidates,
  migrateToV2,
  rebuildIndex,
  saveDeviceTimeCorrection,
  saveDive,
  saveLog,
  softDeleteDive,
} from '../../lib/diveLog/storage';

export const MANUAL_FOLDER_KEY = '__manual__';

// Groups index rows into one folder per physical dive computer (model + serial),
// plus one folder for hand-entered dives. A dive with logs from two computers
// shows in both computers' folders. Computer folders sort newest-first; Manual
// always sorts last.
function buildFolders(rows) {
  const groups = new Map();
  const ensure = (key, seed) => {
    if (!groups.has(key)) groups.set(key, { key, rows: [], ...seed });
    return groups.get(key);
  };

  for (const row of rows) {
    const devices = Array.isArray(row.deviceKeys) ? row.deviceKeys : [];
    if (!devices.length) {
      ensure(MANUAL_FOLDER_KEY, { kind: 'manual', vendor: '', product: '', serial: '' }).rows.push(row);
      continue;
    }
    for (const dk of devices) {
      const [vendor = '', product = '', serial = ''] = String(dk).split('|');
      ensure(dk, { kind: 'computer', vendor, product, serial }).rows.push(row);
    }
  }

  const folders = [...groups.values()].map((g) => {
    const dates = g.rows.map((r) => r.startTime).filter(Boolean).sort();
    const modelName = `${g.vendor} ${g.product}`.trim() || 'Dive computer';
    return {
      ...g,
      label: g.kind === 'manual' ? 'Manual entries' : modelName,
      sublabel: g.kind === 'computer' && g.serial ? `Serial ${g.serial}` : '',
      count: g.rows.length,
      lastDiveDate: dates[dates.length - 1] || '',
      deepestMeters: g.rows.reduce((max, r) => Math.max(max, r.maxDepthMeters || 0), 0),
    };
  });

  folders.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'manual' ? 1 : -1;
    return String(b.lastDiveDate).localeCompare(String(a.lastDiveDate));
  });
  return folders;
}

function sortRows(rows) {
  return [...rows].sort((a, b) => String(b.startTime || '').localeCompare(String(a.startTime || '')));
}

/**
 * Stateful controller for the v2 logbook: a Dive is the counted unit, with one
 * or more ComputerLogs attached. Loads the lightweight index on mount (migrating
 * from v1 first) and lazily loads full Dives + logs on demand.
 */
export default function useDiveLog() {
  const [loaded, setLoaded] = useState(false);
  const [indexRows, setIndexRows] = useState([]);
  const [pendingProposals, setPendingProposals] = useState([]); // cross-computer matches to review
  const diveCache = useRef(new Map()); // id -> { dive, logs }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (!(await isMigratedToV2())) await migrateToV2();
        let rows = await loadIndex();
        if (rows.some((r) => r.computerKeys === undefined)) {
          rows = await rebuildIndex().catch(() => rows);
        }
        if (active) setIndexRows(rows);
      } catch {
        // leave the logbook empty rather than crash the screen
      } finally {
        if (active) setLoaded(true);
      }
    })();
    return () => { active = false; };
  }, []);

  const refreshIndex = useCallback(async () => {
    const rows = await loadIndex();
    setIndexRows(rows);
    return rows;
  }, []);

  const rows = useMemo(
    () => sortRows(indexRows.filter((row) => !row.deletedAt)),
    [indexRows],
  );

  const stats = useMemo(() => computeDiveLogStats(indexRows), [indexRows]);
  const folders = useMemo(() => buildFolders(rows), [rows]);

  // Same-computer de-dup keys (vendor|product|fingerprint) for dives already
  // imported. Ignores soft-deleted rows so a deleted download can be re-imported.
  const knownComputerKeys = useMemo(() => {
    const set = new Set();
    for (const row of indexRows) {
      if (row.deletedAt) continue;
      for (const key of row.computerKeys || []) set.add(key);
    }
    return set;
  }, [indexRows]);

  const getDive = useCallback(async (id) => {
    if (!id) return null;
    if (diveCache.current.has(id)) return diveCache.current.get(id);
    const dive = await loadDive(id);
    if (!dive) return null;
    const logs = await loadLogsForDive(dive);
    const bundle = { dive, logs };
    diveCache.current.set(id, bundle);
    return bundle;
  }, []);

  const addDive = useCallback(async (partial) => {
    const saved = await saveDive(createDive({ ...partial, source: 'manual' }));
    diveCache.current.set(saved.id, { dive: saved, logs: [] });
    await refreshIndex();
    return saved;
  }, [refreshIndex]);

  const updateDive = useCallback(async (id, patch) => {
    const current = await loadDive(id);
    if (!current) return null;
    // Only user-owned fields are patched here; log-surfaced summary fields stay.
    const merged = normalizeDive({ ...current, ...patch, id, createdAt: current.createdAt });
    const saved = await saveDive(touchRecord(merged));
    const logs = await loadLogsForDive(saved);
    diveCache.current.set(saved.id, { dive: saved, logs });
    await refreshIndex();
    return saved;
  }, [refreshIndex]);

  const deleteDive = useCallback(async (id) => {
    await softDeleteDive(id);
    diveCache.current.delete(id);
    await refreshIndex();
  }, [refreshIndex]);

  const deleteDives = useCallback(async (ids) => {
    for (const id of ids) {
      // eslint-disable-next-line no-await-in-loop
      await softDeleteDive(id);
      diveCache.current.delete(id);
    }
    await refreshIndex();
  }, [refreshIndex]);

  /**
   * Import one downloaded ComputerLog. Runs the cross-computer matcher against
   * nearby dives:
   *  - no match            -> new Dive
   *  - confident, clocks agree -> attach to the matched Dive silently
   *  - clock conflict / low confidence -> new Dive for now + a pending proposal
   *    for the post-download review sheet (B7)
   * Returns 'saved' | 'attached'.
   * @param {object} logPartial  from computerLogFromDownload()
   */
  const importComputerLog = useCallback(async (logPartial) => {
    const log = createComputerLog(logPartial);
    const candidates = await loadMatchCandidates(log.reportedStartTime).catch(() => []);
    const { bestMatch } = findMatch(log, candidates);

    if (bestMatch && bestMatch.verdict === 'auto' && !bestMatch.clockConflict) {
      await attachLogToDive(bestMatch.diveId, log);
      diveCache.current.delete(bestMatch.diveId);
      await refreshIndex();
      return 'attached';
    }

    const { dive } = await createDiveFromLog(log);

    if (bestMatch && (bestMatch.clockConflict || bestMatch.verdict === 'confirm')) {
      const matched = candidates.find((c) => c.dive.id === bestMatch.diveId);
      const matchedPrimary = matched?.logs.find((l) => l.id === matched.dive.primaryLogId) || matched?.logs[0] || null;
      setPendingProposals((prev) => [...prev, {
        id: `${dive.id}:${bestMatch.diveId}`,
        newDiveId: dive.id,
        matchDiveId: bestMatch.diveId,
        newDeviceName: `${log.device.vendor} ${log.device.product}`.trim() || 'Dive computer',
        newDeviceKey: log.deviceKey,
        matchDeviceName: matchedPrimary ? `${matchedPrimary.device.vendor} ${matchedPrimary.device.product}`.trim() : 'the other computer',
        matchDeviceKey: matchedPrimary?.deviceKey || null,
        offsetMinutes: bestMatch.offsetMinutes,
        cleanOffset: !!bestMatch.cleanOffset,
        score: bestMatch.score,
        newReportedStart: log.reportedStartTime,
        matchStart: matched?.dive.startTime || '',
        kind: bestMatch.kind || 'pair',
      }]);
    }

    await refreshIndex();
    return 'saved';
  }, [refreshIndex]);

  const clearProposals = useCallback(() => setPendingProposals([]), []);

  /**
   * Resolve one post-download match proposal.
   * @param {object} proposal
   * @param {'merge'|'separate'} action
   * @param {{ correctDeviceKey?: string, offsetMinutes?: number }} [choice]
   *   For 'merge': which computer's clock is right (the OTHER one gets corrected).
   */
  const resolveProposal = useCallback(async (proposal, action, choice = {}) => {
    if (action === 'merge') {
      const newDive = await loadDive(proposal.newDiveId);
      const newLog = newDive?.logIds?.[0] ? await loadLog(newDive.logIds[0]) : null;
      if (newLog) {
        // `correctDeviceKey` is the computer whose clock the user says is right;
        // the other one gets shifted by the detected offset.
        const newIsWrong = choice.correctDeviceKey && choice.correctDeviceKey !== proposal.newDeviceKey;
        const existingIsWrong = choice.correctDeviceKey === proposal.newDeviceKey && proposal.matchDeviceKey;

        const movedLog = newIsWrong ? withTimeCorrection(newLog, proposal.offsetMinutes) : newLog;
        await attachLogToDive(proposal.matchDiveId, { ...movedLog, diveId: proposal.matchDiveId });

        if (existingIsWrong) {
          const matchDive = await loadDive(proposal.matchDiveId);
          const matchLogs = await loadLogsForDive(matchDive);
          for (const l of matchLogs) {
            if (l.deviceKey !== proposal.matchDeviceKey) continue;
            // eslint-disable-next-line no-await-in-loop
            await saveLog(withTimeCorrection(l, -proposal.offsetMinutes));
          }
          await saveDeviceTimeCorrection({
            deviceKey: proposal.matchDeviceKey,
            offsetMinutes: -proposal.offsetMinutes,
            appliesFrom: proposal.matchStart,
            appliesTo: proposal.matchStart,
          });
          // recompute the matched dive's summary from its (now corrected) primary log
          const fresh = await loadDive(proposal.matchDiveId);
          const freshLogs = await loadLogsForDive(fresh);
          const primary = freshLogs.find((l) => l.id === fresh.primaryLogId) || freshLogs[0];
          if (primary) await saveDive(surfaceLogOntoDive(fresh, primary));
        } else if (newIsWrong) {
          await saveDeviceTimeCorrection({
            deviceKey: proposal.newDeviceKey,
            offsetMinutes: proposal.offsetMinutes,
            appliesFrom: proposal.newReportedStart,
            appliesTo: proposal.newReportedStart,
          });
        }
      }
      await softDeleteDive(proposal.newDiveId);
      diveCache.current.delete(proposal.newDiveId);
      diveCache.current.delete(proposal.matchDiveId);
    }
    setPendingProposals((prev) => prev.filter((p) => p.id !== proposal.id));
    await refreshIndex();
  }, [refreshIndex]);

  return {
    loaded,
    rows,
    stats,
    folders,
    knownComputerKeys,
    pendingProposals,
    getDive,
    addDive,
    updateDive,
    deleteDive,
    deleteDives,
    importComputerLog,
    resolveProposal,
    clearProposals,
  };
}
