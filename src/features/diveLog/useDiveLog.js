import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { createDive, deviceKeyOf, normalizeDive, touchRecord } from '../../lib/diveLog/schema';
import { computeDiveLogStats } from '../../lib/diveLog/stats';
import { computeDiveTrends } from '../../lib/diveLog/diveTrends';
import { reconcileComputers, sameComputer } from '../../lib/diveLog/matchDives';
import {
  clearAll,
  consolidateSameDeviceLogs,
  countStoredDives,
  createDivesFromLogs,
  isMigratedToV2,
  loadAll,
  loadComputerPriority,
  loadDive,
  loadIndex,
  loadLogsForDive,
  mergeDives,
  migrateToV2,
  purgeDeleted,
  rebuildIndex,
  resurfaceForPriority,
  saveComputerPriority,
  saveDeviceTimeCorrection,
  saveDive,
  softDeleteDive,
} from '../../lib/diveLog/storage';

export const MANUAL_FOLDER_KEY = '__manual__';

// Groups index rows into one folder per physical dive computer (model + serial),
// plus one folder for hand-entered dives. A dive with logs from two computers
// shows in both computers' folders. Computer folders sort newest-first; Manual
// always sorts last.
function buildFolders(rows, priority = []) {
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
    const rankIdx = g.kind === 'computer' ? priority.indexOf(g.key) : -1;
    return {
      ...g,
      label: g.kind === 'manual' ? 'Manual entries' : modelName,
      sublabel: g.kind === 'computer' && g.serial ? `Serial ${g.serial}` : '',
      count: g.rows.length,
      lastDiveDate: dates[dates.length - 1] || '',
      deepestMeters: g.rows.reduce((max, r) => Math.max(max, r.maxDepthMeters || 0), 0),
      rank: rankIdx === -1 ? null : rankIdx + 1, // 1 = primary
    };
  });

  folders.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'manual' ? 1 : -1;
    // ranked computers first, in rank order; then by most recent dive
    const ra = a.rank ?? 99;
    const rb = b.rank ?? 99;
    if (ra !== rb) return ra - rb;
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
  const [computerPriority, setComputerPriority] = useState([]); // ordered deviceKeys, [0] = primary
  const diveCache = useRef(new Map()); // id -> { dive, logs }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (!(await isMigratedToV2())) await migrateToV2();
        let rows = await loadIndex();
        // Rebuild if the index is stale-shaped or missing dives that exist in
        // storage (e.g. left orphaned by an interrupted import).
        if (rows.some((r) => r.computerKeys === undefined)
            || (await countStoredDives()) > rows.length) {
          rows = await rebuildIndex().catch(() => rows);
        }
        if (active) setIndexRows(rows);
        const priority = await loadComputerPriority();
        if (active) setComputerPriority(priority);
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
  const folders = useMemo(() => buildFolders(rows, computerPriority), [rows, computerPriority]);

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
   * Import a batch of downloaded ComputerLogs — one Dive each, ONE index write.
   * No per-dive matching or state refresh (both would stall the BLE transfer and
   * the index write races if done per dive). `finishImport()` + reconciliation
   * run once the transfer is done.
   * @param {object[]} logPartials  from computerLogFromDownload()
   * @returns {number} how many were written
   */
  const importComputerLogs = useCallback(async (logPartials) => {
    const created = await createDivesFromLogs(logPartials);
    for (const { dive } of created) diveCache.current.delete(dive.id);
    return created.length;
  }, []);

  /** After a download: reconcile the new dives, then refresh into state. */
  const finishImport = useCallback(async () => {
    const rows = await loadIndex();
    if (await countStoredDives() > rows.length) await rebuildIndex().catch(() => {});
    await refreshIndex();
  }, [refreshIndex]);

  const clearProposals = useCallback(() => setPendingProposals([]), []);

  /** Re-run the matcher across the whole book (recovers dives split before the
   *  matcher improved). Populates pendingProposals; nothing is written yet. */
  const recheckDuplicates = useCallback(async () => {
    // Refresh the index from the actual dive/log records first: a stale row
    // (e.g. computerKeys naming a log that no longer exists) would otherwise
    // mislead both this pass and the download de-dup.
    await rebuildIndex().catch(() => {});
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

    // Only dives that still carry logs from exactly one computer can be
    // reconciled — already-merged dives are done.
    const clusters = []; // { device, entries: [{ diveId, dive, log }] }
    for (const b of bundles) {
      if (!b.logs.length) continue;
      const keys = new Set(b.logs.map((l) => l.deviceKey).filter(Boolean));
      if (keys.size !== 1) continue;
      const log = b.logs.find((l) => l.id === b.dive.primaryLogId) || b.logs[0];
      let cluster = clusters.find((c) => sameComputer(c.device, log.device));
      if (!cluster) { cluster = { device: log.device, entries: [] }; clusters.push(cluster); }
      cluster.entries.push({ diveId: b.dive.id, dive: b.dive, log });
    }

    const proposals = [];
    let autoMerged = 0;
    const claimed = new Set(); // dive ids already covered by a proposal or an auto-merge
    const entryById = new Map();
    for (const c of clusters) for (const e of c.entries) entryById.set(e.diveId, e);
    // Use the EFFECTIVE start (reported clock + any correction already applied),
    // so re-running the matcher over dives that were merged and corrected once
    // sees them aligned (~0 offset -> auto-merge, no second correction) instead
    // of re-detecting the original clock error and stacking another shift.
    const toReconcileEntry = (e) => ({
      id: e.diveId,
      startMs: Date.parse(e.log.startTime || e.log.reportedStartTime),
      durationSeconds: e.log.durationSeconds,
      maxDepthMeters: e.log.water?.maxDepthMeters || 0,
      samples: e.log.profile?.samples || [],
    });

    for (let x = 0; x < clusters.length; x += 1) {
      for (let y = x + 1; y < clusters.length; y += 1) {
        const cA = clusters[x];
        const cB = clusters[y];
        const rec = reconcileComputers(cA.entries.map(toReconcileEntry), cB.entries.map(toReconcileEntry));
        if (!rec || !rec.groups.length) continue;

        const merges = [];
        for (const g of rec.groups) {
          const ids = [...g.aIds, ...g.bIds].filter((id) => !claimed.has(id) && entryById.has(id));
          if (ids.length < 2) continue;
          const members = ids.map((id) => entryById.get(id))
            .sort((p, q) => (q.log.durationSeconds || 0) - (p.log.durationSeconds || 0));
          merges.push({ keepId: members[0].diveId, absorbIds: members.slice(1).map((m) => m.diveId) });
          ids.forEach((id) => claimed.add(id));
        }
        if (!merges.length) continue;

        const nameOf = (dev) => `${dev.vendor} ${dev.product}`.trim() || 'Dive computer';
        const dates = rec.groups.flatMap((g) => [...g.aIds, ...g.bIds])
          .map((id) => entryById.get(id)?.dive.startTime).filter(Boolean).sort();
        const clocksAgree = Math.abs(rec.offsetMinutes) < 1;

        // Confident + clocks agree -> just merge, no decision to make.
        if (rec.confidence === 'high' && clocksAgree) {
          for (const mg of merges) {
            // eslint-disable-next-line no-await-in-loop
            await mergeDives(mg.keepId, mg.absorbIds, {});
            [mg.keepId, ...mg.absorbIds].forEach((id) => diveCache.current.delete(id));
          }
          autoMerged += merges.length;
          continue;
        }

        // Clocks disagree, or low confidence -> ask.
        proposals.push({
          id: `reconcile:${deviceKeyOf(cA.device)}::${deviceKeyOf(cB.device)}`,
          kind: 'reconcile',
          deviceNameA: nameOf(cA.device),
          deviceKeyA: deviceKeyOf(cA.device),
          deviceNameB: nameOf(cB.device),
          deviceKeyB: deviceKeyOf(cB.device),
          offsetMinutes: rec.offsetMinutes, // add to B's clock to match A
          cleanOffset: rec.cleanOffset,
          confidence: rec.confidence,
          anchors: rec.anchors,
          sharedDiveCount: merges.length,
          firstDate: dates[0] || '',
          lastDate: dates[dates.length - 1] || '',
          merges,
        });
      }
    }
    setPendingProposals(proposals);
    if (fused || autoMerged) await refreshIndex();
    return { proposals: proposals.length, fused, autoMerged };
  }, [refreshIndex]);

  /** Dev: hard-delete soft-deleted dives + their logs + fingerprint markers. */
  const purgeDeletedDownloads = useCallback(async () => {
    const n = await purgeDeleted();
    diveCache.current.clear();
    await refreshIndex();
    return n;
  }, [refreshIndex]);

  /**
   * Dev: a plain-text dump of every dive + its attached logs, so a broken
   * "Recorded by" / split-merge state can be inspected off-device. Recent and
   * multi-log and deleted dives only — keeps it short for a big logbook.
   */
  const dumpDiagnostic = useCallback(async () => {
    const all = await loadAll();
    const cutoff = Date.now() - 28 * 24 * 3600 * 1000;
    const recent = (iso) => { const t = Date.parse(iso || ''); return Number.isFinite(t) && t >= cutoff; };
    const rows = [];
    const sorted = [...all].sort((a, b) => String(a.startTime || a.createdAt).localeCompare(String(b.startTime || b.createdAt)));
    for (const d of sorted) {
      const logs = await loadLogsForDive(d); // eslint-disable-line no-await-in-loop
      const keep = d.deletedAt || logs.length > 1 || recent(d.startTime)
        || logs.some((l) => recent(l.reportedStartTime));
      if (!keep) continue;
      rows.push(
        `DIVE ${(d.startTime || '?').slice(0, 16)}  src=${d.source}`
        + `${d.deletedAt ? '  [DELETED]' : ''}  logs=${d.logIds.length}`,
      );
      for (const l of logs) {
        const dev = `${l.device?.vendor || '∅'}/${l.device?.product || '∅'}/${l.device?.serial || '–'}`;
        rows.push(
          `   · ${dev}  dur=${Math.round((l.durationSeconds || 0) / 60)}m`
          + `  samp=${l.profile?.samples?.length || 0}  fused=${l.fusedFrom || 1}`
          + `  corr=${l.timeCorrectionMinutes || 0}m`
          + `  reported=${(l.reportedStartTime || '?').slice(0, 16)}`
          + `  fp=${String(l.fingerprint || '').slice(0, 6)}`
          + `${l.id === d.primaryLogId ? '  ←primary' : ''}`,
        );
      }
    }
    rows.push(`— ${sorted.length} dives total, ${deletedCount} deleted, priority=[${computerPriority.join(', ') || 'none'}]`);
    return rows.join('\n');
  }, [deletedCount, computerPriority]);

  /** Dev: wipe the entire dive logbook (v1 backup included). */
  const eraseAllDiveData = useCallback(async () => {
    await clearAll();
    diveCache.current.clear();
    setPendingProposals([]);
    setIndexRows([]);
  }, []);

  /**
   * Set a computer's priority rank. `rank` is 1-based (1 = primary); null unranks
   * it. Re-picks the displayed log for every multi-computer dive.
   */
  const setComputerRank = useCallback(async (deviceKey, rank) => {
    if (!deviceKey) return;
    const current = (await loadComputerPriority()).filter((k) => k !== deviceKey);
    if (rank != null) {
      const at = Math.max(0, Math.min(current.length, rank - 1));
      current.splice(at, 0, deviceKey);
    }
    const saved = await saveComputerPriority(current);
    await resurfaceForPriority();
    diveCache.current.clear();
    setComputerPriority(saved);
    await refreshIndex();
  }, [refreshIndex]);

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
   * Resolve one "Two computers, one trip" proposal.
   * @param {object} proposal   from recheckDuplicates ({ kind:'reconcile', merges, ... })
   * @param {'merge'|'separate'} action
   * @param {{ correctDeviceKey?: string }} [choice]  which computer's clock is right
   */
  const resolveProposal = useCallback(async (proposal, action, choice = {}) => {
    if (action === 'merge') {
      let correction = null;
      if (proposal.offsetMinutes && choice.correctDeviceKey) {
        // offsetMinutes = minutes to add to B's clock to match A; correct the other one.
        const bIsWrong = choice.correctDeviceKey === proposal.deviceKeyA;
        correction = bIsWrong
          ? { deviceKey: proposal.deviceKeyB, offsetMinutes: proposal.offsetMinutes }
          : { deviceKey: proposal.deviceKeyA, offsetMinutes: -proposal.offsetMinutes };
        await saveDeviceTimeCorrection({
          ...correction, appliesFrom: proposal.firstDate, appliesTo: proposal.lastDate,
        });
      }
      for (const mg of proposal.merges) {
        // eslint-disable-next-line no-await-in-loop
        await mergeDives(mg.keepId, mg.absorbIds, { correction });
        [mg.keepId, ...mg.absorbIds].forEach((id) => diveCache.current.delete(id));
      }
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
    computerPriority,
    setComputerRank,
    folders,
    knownComputerKeys,
    pendingProposals,
    getDive,
    addDive,
    updateDive,
    deleteDive,
    deleteDives,
    importComputerLogs,
    finishImport,
    resolveProposal,
    clearProposals,
    recheckDuplicates,
    mergeDivesManual,
    purgeDeletedDownloads,
    eraseAllDiveData,
    dumpDiagnostic,
  };
}
