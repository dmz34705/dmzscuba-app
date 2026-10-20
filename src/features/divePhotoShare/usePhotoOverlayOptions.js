// Remembers how you like your photo overlays between photos: theme, chart
// style, which info rides along, and your signature (typed or drawn) — set
// once, reused on every photo after.
//
// The crop and the pin are deliberately NOT persisted: both belong to one
// photo. Same shape as diveShareCard/useShareCardOptions.js.

import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  DEFAULT_PHOTO_OVERLAY_OPTIONS,
  PHOTO_OVERLAY_STORAGE_KEY,
  sanitizePhotoOverlayOptions,
} from './photoOverlayOptions';

export default function usePhotoOverlayOptions() {
  const [options, setOptions] = useState(() => sanitizePhotoOverlayOptions(DEFAULT_PHOTO_OVERLAY_OPTIONS));
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(PHOTO_OVERLAY_STORAGE_KEY)
      .then((stored) => {
        if (active && stored) setOptions(sanitizePhotoOverlayOptions(JSON.parse(stored)));
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
    AsyncStorage.setItem(PHOTO_OVERLAY_STORAGE_KEY, JSON.stringify(options)).catch(() => {});
  }, [loaded, options]);

  const applyOptions = useCallback((patch) => {
    setOptions((current) => sanitizePhotoOverlayOptions({ ...current, ...patch }));
  }, []);

  return { applyOptions, loaded, options };
}
