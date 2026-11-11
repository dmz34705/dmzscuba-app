// JS surface for the native libdivecomputer bridge.
//
// - getLibdivecomputerVersion(): proves the native path (vendored C -> Swift -> JS).
// - startDownload()/provideBytes()/provideWriteComplete()/cancelDownload() + the
//   onDownload* events: run a libdivecomputer download over a BLE transport that
//   lives in JS (react-native-ble-plx). See src/features/diveComputerDownload/.

import DiveComputerBridge from './src/DiveComputerBridgeModule';

/** True when the native bridge is linked (a dev/prod build, not Expo Go/web). */
export const isDiveComputerBridgeAvailable = DiveComputerBridge != null;

/**
 * True when the installed native build has `setupDevice` (gas + clock). JS
 * reloads from Metro without a native rebuild, so an older installed build can
 * run newer JS — callers fall back to `syncDeviceTime` when this is false.
 */
export function isSetupDeviceAvailable() {
  return typeof DiveComputerBridge?.setupDevice === 'function';
}

/**
 * Returns the linked libdivecomputer version string (e.g. "0.9.0"), or null when
 * the native bridge is unavailable.
 */
export function getLibdivecomputerVersion() {
  if (!DiveComputerBridge) return null;
  try {
    return DiveComputerBridge.getVersion();
  } catch {
    return null;
  }
}

/**
 * Runs a dive download.
 * @param {{ name: string, vendor?: string, product?: string, fingerprintBase64?: string }} options
 * @returns {Promise<{ fingerprint: string | null, count: number }>}
 */
export function startDownload(options) {
  return DiveComputerBridge.startDownload(options);
}

/** Hands bytes from a BLE notification to the running download. */
export function provideBytes(base64) {
  DiveComputerBridge.provideBytes(base64);
}

/** Call after the JS layer has written the bytes from an `onDownloadWrite` event. */
export function provideWriteComplete() {
  DiveComputerBridge.provideWriteComplete();
}

/** Requests cancellation of the running download. */
export function cancelDownload() {
  DiveComputerBridge.cancelDownload();
}

/**
 * Sets the dive computer's clock. Values are plain wall-clock numbers (no
 * timezone conversion happens natively) — pass whatever local time the
 * computer should show.
 * @param {{ name: string, vendor?: string, product?: string, year: number, month: number, day: number, hour: number, minute: number, second: number }} options
 * @returns {Promise<{ vendor: string, product: string }>} rejects with a
 *   readable message, including "This dive computer does not support setting
 *   its clock from an app." when the backend has no time-sync support.
 */
export function syncDeviceTime(options) {
  return DiveComputerBridge.syncDeviceTime(options);
}

/**
 * Pre-dive setup in one session with the computer: sets the "first" gas to
 * `oxygen` % where supported (Heinrichs-Weikamp OSTC family; verified by
 * read-back natively) and, when `setClock` is true, the clock (local wall time).
 * @param {{ name: string, vendor?: string, product?: string, oxygen: number, setClock: boolean,
 *   year?: number, month?: number, day?: number, hour?: number, minute?: number, second?: number }} options
 * @returns {Promise<{ vendor: string, product: string,
 *   gas: { status: 'set'|'unsupported'|'skipped'|'error', message?: string, slot?: number, previous?: { o2: number, he: number } },
 *   clock: { status: 'set'|'unsupported'|'skipped'|'error', message?: string } }>}
 */
export function setupDevice(options) {
  if (!isSetupDeviceAvailable()) throw new Error('This app build predates pre-dive setup — rebuild the app.');
  return DiveComputerBridge.setupDevice(options);
}

/** True when the installed native build has the Suunto file explorer. */
export function isSuuntoExploreAvailable() {
  return typeof DiveComputerBridge?.exploreSuunto === 'function';
}

/**
 * READ-ONLY: lists and reads the non-dive files on a Suunto EON Steel / EON
 * Core / D5, to find where dive modes and gases are stored.
 * @returns {Promise<{ vendor, product, root, entries: {path, dir}[], files: ({path, size, base64}|{path, error})[], problems: string[], truncated: boolean }>}
 */
export function exploreSuunto(options) {
  if (!isSuuntoExploreAvailable()) throw new Error('This app build predates the Suunto explorer — rebuild the app.');
  return DiveComputerBridge.exploreSuunto(options);
}

/** True when the installed native build has the Shearwater settings scan. */
export function isShearwaterScanAvailable() {
  return typeof DiveComputerBridge?.scanShearwater === 'function';
}

/**
 * READ-ONLY: reads every data identifier in `ranges` ([[start, end], …]) from a
 * Shearwater Petrel-family computer.
 * @returns {Promise<{ vendor, product, values: Record<string, string>, scanned, total, refused, failures, complete, seconds }>}
 */
export function scanShearwater(options) {
  if (!isShearwaterScanAvailable()) throw new Error('This app build predates the Shearwater scanner — rebuild the app.');
  return DiveComputerBridge.scanShearwater(options);
}

/**
 * Subscribe to a download event. Returns a subscription with `.remove()`.
 * @param {'onDownloadWrite'|'onDownloadProgress'|'onDownloadDevinfo'|'onDownloadDive'|'onDownloadLog'} event
 */
export function addDownloadListener(event, handler) {
  return DiveComputerBridge.addListener(event, handler);
}

export default DiveComputerBridge;
