import AsyncStorage from '@react-native-async-storage/async-storage';

import { normalizeLogState } from './nitroxLog';

// Air calibrations live on the phone, keyed by analyzer serial number — nothing
// is ever written to the analyzer itself.
export const NITROX_ANALYZER_STORAGE_KEY = '@dmz-scuba/nitrox-analyzer/v1';

function normalize(raw) {
  const calibrations = raw && typeof raw.calibrations === 'object' && raw.calibrations ? raw.calibrations : {};
  return { calibrations };
}

export async function loadAnalyzerState(storage = AsyncStorage) {
  try {
    const raw = await storage.getItem(NITROX_ANALYZER_STORAGE_KEY);
    return normalize(raw ? JSON.parse(raw) : null);
  } catch {
    return normalize(null);
  }
}

export async function saveCalibration(serial, calibration, storage = AsyncStorage) {
  const state = await loadAnalyzerState(storage);
  const calibrations = { ...state.calibrations };
  if (calibration) calibrations[serial] = calibration;
  else delete calibrations[serial];
  await storage.setItem(NITROX_ANALYZER_STORAGE_KEY, JSON.stringify({ calibrations }));
  return calibration;
}

// ---- Nitrox log (personal + facility entries) ------------------------------
// Kept on this device only: facility entries hold other divers' names and
// certification numbers, so they are deliberately not part of account sync.
export const NITROX_LOG_STORAGE_KEY = '@dmz-scuba/nitrox-log/v1';

export async function loadNitroxLog(storage = AsyncStorage) {
  try {
    const raw = await storage.getItem(NITROX_LOG_STORAGE_KEY);
    return normalizeLogState(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeLogState(null);
  }
}

export async function saveNitroxLog(state, storage = AsyncStorage) {
  const normalized = normalizeLogState(state);
  await storage.setItem(NITROX_LOG_STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}
