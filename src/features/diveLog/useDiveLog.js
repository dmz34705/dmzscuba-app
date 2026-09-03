import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { createComputerLog, createDive, normalizeDive, touchRecord } from '../../lib/diveLog/schema';
import { computeDiveLogStats } from '../../lib/diveLog/stats';
import { computeDiveTrends } from '../../lib/diveLog/diveTrends';
import { findMatch } from '../../lib/diveLog/matchDives';
import {
  attachLogToDive,
  clearAll,
  consolidateSameDeviceLogs,
  createDiveFromLog,
  isMigratedToV2,
  loadAll,
  loadDive,
  loadIndex,
  loadLogsForDive,
  loadMatchCandidates,
  mergeDives,
  migrateToV2,
  purgeDeleted,
  rebuildIndex,
  saveDeviceTimeCorrection,
  saveDive,
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
  const trends = useMemo(() => computeDiveTrends(indexRows), [indexRows]);
  const deletedCount = useMemo(() => indexRows.filter((r) => r.deletedAt).length, [indexRows]);
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
    const { bestMatch: m } = findMatch(log, candidates);

    const describe = (diveId) => {
      const c = candidates.find((x) => x.dive.id === diveId);
      const p = c?.logs.find((l) => l.id === c.dive.primaryLogId) || c?.logs[0] || null;
      return {
        deviceName: p ? `${p.device.vendor} ${p.device.product}`.trim() : 'the other computer',
        deviceKey: p?.deviceKey || null,
        start: c?.dive.startTime || '',
      };
    };
    const newDeviceName = `${log.device.vendor} ${log.device.product}`.trim() || 'Dive computer';

    if (!m) {
      await createDiveFromLog(log);
      await refreshIndex();
      return 'saved';
    }

    const pushProposal = ({ newDiveId, primaryDiveId, absorbDiveIds, other }) => {
      setPendingProposals((prev) => [...prev, {
        id: `${newDiveId}:${absorbDiveIds.join('+')}`,
        kind: m.kind,
        newDiveId,
        primaryDiveId,
        absorbDiveIds,
        newDeviceName,
        newDeviceKey: log.deviceKey,
        matchDeviceName: other.deviceName,
        matchDeviceKey: other.deviceKey,
        offsetMinutes: m.offsetMinutes || 0,
        cleanOffset: !!m.cleanOffset,
        implausibleClock: !!m.implausibleClock,
        score: m.score,
        newReportedStart: log.reportedStartTime,
        matchStart: other.start,
      }]);
    };

    // The new log attaches to an existing dive (whole-dive or fragment match).
    if (m.kind === 'pair' || m.kind === 'fragment') {
      if (m.verdict === 'auto' && !m.clockConflict) {
        await attachLogToDive(m.diveId, m.kind === 'fragment' ? { ...log, splitOf: m.diveId } : log);
        diveCache.current.delete(m.diveId);
        await refreshIndex();
        return 'attached';
      }
      const { dive } = await createDiveFromLog(log);
      pushProposal({ newDiveId: dive.id, primaryDiveId: m.diveId, absorbDiveIds: [m.diveId], other: describe(m.diveId) });
      await refreshIndex();
      return 'saved';
    }

    // The new (long) log spans one or more separately-logged same-device dives.
    const targets = m.diveIds || [m.diveId];
    const { dive } = await createDiveFromLog(log);
    if (m.verdict === 'auto' && !m.clockConflict) {
      await mergeDives(dive.id, targets);
      [dive.id, ...targets].forEach((id) => diveCache.current.delete(id));
      await refreshIndex();
      return 'attached';
    }
    pushProposal({ newDiveId: dive.id, primaryDiveId: dive.id, absorbDiveIds: targets, other: describe(targets[0]) });
    await refreshIndex();
    return 'saved';
  }, [refreshIndex]);

  const clearProposals = useCallback(() => setPendingProposals([]), []);

  /** Re-run the matcher across the whole book (recovers dives split before the
   *  matcher improved). Populates pendingProposals; nothing is written yet. */
  const recheckDuplicates = useCallback(async () => {
    let dives = (await loadAll()).filter((d) => !d.deletedAt);
    // First: fuse any dive that already has several logs from one computer
    // (e.g. a split dive merged before fragment-fusing existed).
    let fused = 0;
    for (const d of dives) {
      const keys = new Set();
      let dup = false;
      // eslint-disable-next-line no-await-in-loop
      for (const l of await loadLogsForDive(d)) {
        if (l.deviceKey && keys.has(l.deviceKey)) dup = true;
        if (l.deviceKey) keys.add(l.deviceKey);
      }
      if (dup) {
        // eslint-disable-next-line no-await-in-loop
        await consolidateSameDeviceLogs(d.id);
        diveCache.current.delete(d.id);
        fused += 1;
      }
    }
    if (fused) dives = (await loadAll()).filter((d) => !d.deletedAt);

    const bundles = [];
    for (const d of dives) {
      // eslint-disable-next-line no-await-in-loop
      bundles.push({ dive: d, logs: await loadLogsForDive(d) });
    }
    const proposals = [];
    const proposedSources = new Set(); // dives already slated to be folded away
    const WINDOW_MS = 3 * 24 * 3600 * 1000; // two dives more than ~3 days apart aren't "the same dive"
    for (const b of bundles) {
      if (proposedSources.has(b.dive.id) || !b.logs.length) continue;
      const primary = b.logs.find((l) => l.id === b.dive.primaryLogId) || b.logs[0];
      const bT = Date.parse(b.dive.startTime);
      const others = bundles.filter((x) => {
        if (x.dive.id === b.dive.id || proposedSources.has(x.dive.id)) return false;
        const xt = Date.parse(x.dive.startTime);
        return Number.isNaN(bT) || Number.isNaN(xt) || Math.abs(xt - bT) <= WINDOW_MS;
      });
      const { bestMatch: m } = findMatch(primary, others);
      if (!m || m.verdict === 'none') continue;
      const targetIds = m.diveIds || [m.diveId];
      const isSpanning = m.kind === 'spanning-merge';
      const keepId = isSpanning ? b.dive.id : targetIds[0];
      const foldIds = isSpanning ? targetIds : [b.dive.id];
      const first = bundles.find((x) => x.dive.id === targetIds[0]);
      const fp = first?.logs.find((l) => l.id === first.dive.primaryLogId) || first?.logs[0] || null;
      proposals.push({
        id: `recheck:${keepId}:${foldIds.join('+')}`,
        kind: m.kind,
        newDiveId: b.dive.id,
        primaryDiveId: keepId,
        absorbDiveIds: foldIds,
        newDeviceName: `${primary.device.vendor} ${primary.device.product}`.trim() || 'Dive computer',
        newDeviceKey: primary.deviceKey,
        matchDeviceName: fp ? `${fp.device.vendor} ${fp.device.product}`.trim() : 'the other computer',
        matchDeviceKey: fp?.deviceKey || null,
        offsetMinutes: m.offsetMinutes || 0,
        cleanOffset: !!m.cleanOffset,
        implausibleClock: !!m.implausibleClock,
        score: m.score,
        newReportedStart: primary.reportedStartTime,
        matchStart: first?.dive.startTime || '',
      });
      foldIds.forEach((id) => proposedSources.add(id));
    }
    setPendingProposals(proposals);
    if (fused) await refreshIndex();
    return { proposals: proposals.length, fused };
  }, [refreshIndex]);

  /** Dev: hard-delete soft-deleted dives + their logs + fingerprint markers. */
  const purgeDeletedDownloads = useCallback(async () => {
    const n = await purgeDeleted();
    diveCache.current.clear();
    await refreshIndex();
    return n;
  }, [refreshIndex]);

  /** Dev: wipe the entire dive logbook (v1 backup included). */
  const eraseAllDiveData = useCallback(async () => {
    await clearAll();
    diveCache.current.clear();
    setPendingProposals([]);
    setIndexRows([]);
  }, []);

  /** Manual merge: user selected several dives that are really one. */
  const mergeDivesManual = useCallback(async (diveIds) => {
    if (!Array.isArray(diveIds) || diveIds.length < 2) return;
    const loaded = await Promise.all(diveIds.map((id) => getDive(id)));
    const withDur = loaded.filter(Boolean).map((b) => ({
      id: b.dive.id,
      dur: (b.logs.find((l) => l.id === b.dive.primaryLogId) || b.logs[0])?.durationSeconds || b.dive.durationSeconds || 0,
    }));
    withDur.sort((a, b) => b.dur - a.dur);
    const keepId = withDur[0].id;
    await mergeDives(keepId, diveIds.filter((id) => id !== keepId));
    diveIds.forEach((id) => diveCache.current.delete(id));
    await refreshIndex();
  }, [getDive, refreshIndex]);

  /**
   * Resolve one post-download / recheck match proposal.
   * @param {object} proposal   { primaryDiveId, absorbDiveIds[], newDiveId, ... }
   * @param {'merge'|'separate'} action
   * @param {{ correctDeviceKey?: string }} [choice]  which computer's clock is right
   */
  const resolveProposal = useCallback(async (proposal, action, choice = {}) => {
    if (action === 'merge') {
      const keepId = proposal.primaryDiveId;
      const foldIds = [...new Set(
        [...(proposal.absorbDiveIds || []), proposal.newDiveId].filter((id) => id && id !== keepId),
      )];

      // Which device (if any) needs its clock corrected?
      let correction = null;
      if (proposal.offsetMinutes && choice.correctDeviceKey) {
        if (choice.correctDeviceKey === proposal.newDeviceKey && proposal.matchDeviceKey) {
          correction = { deviceKey: proposal.matchDeviceKey, offsetMinutes: -proposal.offsetMinutes };
          await saveDeviceTimeCorrection({
            deviceKey: proposal.matchDeviceKey,
            offsetMinutes: -proposal.offsetMinutes,
            appliesFrom: proposal.matchStart,
            appliesTo: proposal.matchStart,
          });
        } else if (choice.correctDeviceKey !== proposal.newDeviceKey) {
          correction = { deviceKey: proposal.newDeviceKey, offsetMinutes: proposal.offsetMinutes };
          await saveDeviceTimeCorrection({
            deviceKey: proposal.newDeviceKey,
            offsetMinutes: proposal.offsetMinutes,
            appliesFrom: proposal.newReportedStart,
            appliesTo: proposal.newReportedStart,
          });
        }
      }

      await mergeDives(keepId, foldIds, { correction });
      [keepId, ...foldIds].forEach((id) => diveCache.current.delete(id));
    }
    setPendingProposals((prev) => prev.filter((p) => p.id !== proposal.id));
    await refreshIndex();
  }, [refreshIndex]);

  return {
    loaded,
    rows,
    stats,
    trends,
    deletedCount,
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
    recheckDuplicates,
    mergeDivesManual,
    purgeDeletedDownloads,
    eraseAllDiveData,
  };
}
