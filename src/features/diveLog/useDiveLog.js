import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { createDive, normalizeDive, touchRecord } from '../../lib/diveLog/schema';
import { computeDiveLogStats } from '../../lib/diveLog/stats';
import {
  attachLogToDive,
  createDiveFromLog,
  isMigratedToV2,
  loadDive,
  loadIndex,
  loadLogsForDive,
  migrateToV2,
  rebuildIndex,
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
   * Import one downloaded ComputerLog. B5: always creates a new Dive. B6 will
   * consult the cross-computer matcher first and attach to an existing Dive when
   * one matches. Returns 'saved' | 'duplicate'.
   * @param {object} logPartial  from computerLogFromDownload()
   * @param {{ matchDiveId?: string, makePrimary?: boolean }} [opts]
   */
  const importComputerLog = useCallback(async (logPartial, opts = {}) => {
    if (opts.matchDiveId) {
      await attachLogToDive(opts.matchDiveId, logPartial, { makePrimary: opts.makePrimary });
      diveCache.current.delete(opts.matchDiveId);
    } else {
      await createDiveFromLog(logPartial);
    }
    await refreshIndex();
    return 'saved';
  }, [refreshIndex]);

  return {
    loaded,
    rows,
    stats,
    folders,
    knownComputerKeys,
    getDive,
    addDive,
    updateDive,
    deleteDive,
    deleteDives,
    importComputerLog,
  };
}
