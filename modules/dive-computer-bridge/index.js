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
 * Subscribe to a download event. Returns a subscription with `.remove()`.
 * @param {'onDownloadWrite'|'onDownloadProgress'|'onDownloadDevinfo'|'onDownloadDive'|'onDownloadLog'} event
 */
export function addDownloadListener(event, handler) {
  return DiveComputerBridge.addListener(event, handler);
}

export default DiveComputerBridge;
