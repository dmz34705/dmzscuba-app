import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { createDiveRecord, normalizeDiveRecord, touchRecord } from '../../lib/diveLog/schema';
import { computeDiveLogStats } from '../../lib/diveLog/stats';
import { loadEntry, loadIndex, saveEntry, softDeleteEntry } from '../../lib/diveLog/storage';

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

  return { loaded, rows, stats, knownComputerKeys, getEntry, addDive, updateDive, deleteDive };
}
