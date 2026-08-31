// JS surface for the native libdivecomputer bridge.
//
// Part B step 2 only exposes the library version, to prove the native pipeline
// (vendored C -> ObjC shim -> Swift module -> JS). BLE scan/connect and dive
// download land in later steps on top of this same module.

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

export default DiveComputerBridge;
