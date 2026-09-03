import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { createDiveRecord, normalizeDiveRecord, touchRecord } from '../../lib/diveLog/schema';
import { computeDiveLogStats } from '../../lib/diveLog/stats';
import { loadEntry, loadIndex, rebuildIndex, saveEntry, softDeleteEntry } from '../../lib/diveLog/storage';

export const MANUAL_FOLDER_KEY = '__manual__';

// Groups index rows into one folder per physical dive computer (model + serial),
// plus a single folder for hand-entered / imported dives. Folders with computer
// dives sort newest-first; the manual folder always sorts last.
function buildFolders(rows) {
  const groups = new Map();
  for (const row of rows) {
    const isComputer = row.source === 'computer';
    const key = isComputer ? (row.deviceKey || `${row.deviceVendor}|${row.deviceProduct}|`) : MANUAL_FOLDER_KEY;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        kind: isComputer ? 'computer' : 'manual',
        vendor: row.deviceVendor || '',
        product: row.deviceProduct || '',
        serial: row.deviceSerial || '',
        rows: [],
      });
    }
    groups.get(key).rows.push(row);
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

// Stateful controller for the logbook. Loads the lightweight index on mount and
// lazily loads full dive records (with their profiles) only when a dive is
// opened. Mirrors the load/save-effect style of features/settings/useAppSettings.

function sortRows(rows) {
  return [...rows].sort((a, b) => String(b.startTime || '').localeCompare(String(a.startTime || '')));
}

export default function useDiveLog() {
  const [loaded, setLoaded] = useState(false);
  const [indexRows, setIndexRows] = useState([]);
  const entryCache = useRef(new Map());

  useEffect(() => {
    let active = true;
    loadIndex()
      .then(async (rows) => {
        // Backfill device-grouping fields onto index rows written before folders existed.
        const stale = rows.some((r) => r.source === 'computer' && r.deviceKey === undefined);
        return stale ? rebuildIndex().catch(() => rows) : rows;
      })
      .then((rows) => { if (active) setIndexRows(rows); })
      .catch(() => {})
      .finally(() => { if (active) setLoaded(true); });
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

  // De-dup keys for dives already downloaded from a computer (ignores soft-deleted
  // rows, so a deleted download can be re-imported).
  const knownComputerKeys = useMemo(
    () => new Set(indexRows.filter((row) => !row.deletedAt && row.computerKey).map((row) => row.computerKey)),
    [indexRows],
  );

  const getEntry = useCallback(async (id) => {
    if (!id) return null;
    if (entryCache.current.has(id)) return entryCache.current.get(id);
    const entry = await loadEntry(id);
    if (entry) entryCache.current.set(id, entry);
    return entry;
  }, []);

  const addDive = useCallback(async (partial) => {
    const saved = await saveEntry(createDiveRecord(partial));
    entryCache.current.set(saved.id, saved);
    await refreshIndex();
    return saved;
  }, [refreshIndex]);

  const updateDive = useCallback(async (id, patch) => {
    const current = await loadEntry(id);
    if (!current) return null;
    const merged = normalizeDiveRecord({
      ...current,
      ...patch,
      id,
      createdAt: current.createdAt,
    });
    const saved = await saveEntry(touchRecord(merged));
    entryCache.current.set(saved.id, saved);
    await refreshIndex();
    return saved;
  }, [refreshIndex]);

  const deleteDive = useCallback(async (id) => {
    await softDeleteEntry(id);
    entryCache.current.delete(id);
    await refreshIndex();
  }, [refreshIndex]);

  const deleteDives = useCallback(async (ids) => {
    for (const id of ids) {
      // eslint-disable-next-line no-await-in-loop
      await softDeleteEntry(id);
      entryCache.current.delete(id);
    }
    await refreshIndex();
  }, [refreshIndex]);

  return { loaded, rows, stats, folders, knownComputerKeys, getEntry, addDive, updateDive, deleteDive, deleteDives };
}
