import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// How the Gear Locker inventory is shown — grouped by family (the default) or as one long list —
// and which families are open. Remembered on this device; a failed read just uses the defaults.
const LOCKER_VIEW_KEY = '@dmz-scuba/gear-locker/view/v1';

export default function useLockerView() {
  const [view, setView] = useState({ mode: 'grouped', open: [] });
  const loaded = useRef(false);
  useEffect(() => {
    AsyncStorage.getItem(LOCKER_VIEW_KEY).then((raw) => {
      const saved = raw ? JSON.parse(raw) : null;
      setView((current) => ({
        mode: saved?.mode === 'list' ? 'list' : current.mode,
        open: Array.isArray(saved?.open) ? saved.open.filter((label) => typeof label === 'string') : current.open,
      }));
    }).catch(() => {}).finally(() => { loaded.current = true; });
  }, []);
  // Save after the first read, so the defaults never overwrite what was remembered.
  useEffect(() => { if (loaded.current) AsyncStorage.setItem(LOCKER_VIEW_KEY, JSON.stringify(view)).catch(() => {}); }, [view]);

  const setMode = useCallback((mode) => setView((current) => ({ ...current, mode })), []);
  const setOpen = useCallback((open) => setView((current) => ({ ...current, open })), []);
  const toggle = useCallback((label) => setView((current) => ({
    ...current, open: current.open.includes(label) ? current.open.filter((entry) => entry !== label) : [...current.open, label],
  })), []);

  return { mode: view.mode, open: view.open, setMode, setOpen, toggle };
}
