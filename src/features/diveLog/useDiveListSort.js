// Remembers how the logbook is ordered.
//
// Sort is a durable preference — "I always want oldest first" is a statement
// about the person, not about this visit — so unlike the filters, which are
// transient and reset when you leave, it survives a relaunch. Same shape as
// features/diveShareCard/useShareCardOptions.js.

import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEFAULT_DIVE_SORT, sanitizeDiveSort } from '../../lib/diveLog/sortDives';

export const DIVE_SORT_STORAGE_KEY = '@dmz-scuba/dive-sort-v1';

export default function useDiveListSort() {
  const [sort, setSortState] = useState(DEFAULT_DIVE_SORT);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(DIVE_SORT_STORAGE_KEY)
      .then((stored) => {
        if (active && stored) setSortState(sanitizeDiveSort(JSON.parse(stored)));
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    // Never write before the read lands, or the default overwrites the saved
    // preference on every launch.
    if (!loaded) return;
    AsyncStorage.setItem(DIVE_SORT_STORAGE_KEY, JSON.stringify(sort)).catch(() => {});
  }, [loaded, sort]);

  const setSort = useCallback((value) => {
    setSortState((current) => sanitizeDiveSort(typeof value === 'function' ? value(current) : value));
  }, []);

  return { setSort, sort };
}
