import { useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  DEFAULT_TANK_SETTINGS,
  TANK_STORAGE_KEY,
  resolveTankProfile,
  sanitizeTankSettings,
} from '../../lib/tankProfiles';

export default function useTankProfileSettings() {
  const [settings, setSettings] = useState(DEFAULT_TANK_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const profile = useMemo(() => resolveTankProfile(settings), [settings]);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(TANK_STORAGE_KEY)
      .then((stored) => {
        if (active && stored) setSettings(sanitizeTankSettings(JSON.parse(stored)));
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(TANK_STORAGE_KEY, JSON.stringify(settings)).catch(() => {});
  }, [loaded, settings]);

  return { profile, settings, setSettings };
}
