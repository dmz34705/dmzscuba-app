import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { APP_SETTINGS_STORAGE_KEY, DEFAULT_APP_SETTINGS, sanitizeAppSettings } from '../../lib/appSettings';

export default function useAppSettings() {
  const [settings, setSettingsState] = useState(DEFAULT_APP_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(APP_SETTINGS_STORAGE_KEY)
      .then((stored) => {
        if (active && stored) setSettingsState(sanitizeAppSettings(JSON.parse(stored)));
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(settings)).catch(() => {});
  }, [loaded, settings]);

  const setSettings = (value) => {
    setSettingsState((current) => sanitizeAppSettings(typeof value === 'function' ? value(current) : value));
  };

  return {
    loaded,
    replaceSettings: (value) => setSettingsState(sanitizeAppSettings(value)),
    settings,
    setSettings,
  };
}
