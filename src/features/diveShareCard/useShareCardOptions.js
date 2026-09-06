// Remembers how you like your share cards between dives.
//
// A feature-local persisted setting, the same shape as
// features/calculator/useTankProfileSettings.js — it isn't an app-wide
// preference, and threading it down through DiveLogScreen → DiveDetail →
// the share modal just to reach one screen would be worse than owning it here.
//
// The photo is deliberately NOT persisted: it belongs to one dive, and a
// picked asset URI isn't guaranteed to still resolve on a later launch.

import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  DEFAULT_SHARE_CARD_OPTIONS,
  SHARE_CARD_STORAGE_KEY,
  sanitizeShareCardOptions,
} from './shareCardOptions';
import { DEFAULT_SHARE_CARD_THEME } from './themes';

function initialState() {
  return { options: sanitizeShareCardOptions(DEFAULT_SHARE_CARD_OPTIONS), themeKey: DEFAULT_SHARE_CARD_THEME };
}

export default function useShareCardOptions() {
  const [state, setState] = useState(initialState);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(SHARE_CARD_STORAGE_KEY)
      .then((stored) => {
        if (!active || !stored) return;
        const parsed = JSON.parse(stored);
        setState({
          options: sanitizeShareCardOptions(parsed?.options),
          // An unknown key (a theme removed in a later version) is safe:
          // getShareCardTheme falls back to the first theme at render time.
          themeKey: typeof parsed?.themeKey === 'string' ? parsed.themeKey : DEFAULT_SHARE_CARD_THEME,
        });
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    // Never write before the read has finished, or the defaults would
    // overwrite what was saved.
    if (!loaded) return;
    AsyncStorage.setItem(SHARE_CARD_STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  }, [loaded, state]);

  const applyOptions = useCallback((patch) => {
    setState((current) => ({ ...current, options: sanitizeShareCardOptions({ ...current.options, ...patch }) }));
  }, []);

  const setThemeKey = useCallback((themeKey) => {
    setState((current) => ({ ...current, themeKey }));
  }, []);

  return { applyOptions, loaded, options: state.options, setThemeKey, themeKey: state.themeKey };
}
