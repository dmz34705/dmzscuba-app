// Bluetooth LE helpers for talking to dive computers, built on react-native-ble-plx.
//
// This layer is deliberately platform-independent: the same scan/connect code
// runs on iOS and Android. The bytes it reads/writes are handed to the native
// libdivecomputer bridge (a dc_custom_cbs_t iostream) for the actual dive
// download — that lands in the next step.

import { PermissionsAndroid, Platform } from 'react-native';

// react-native-ble-plx is a native module: only require it where it exists
// (a dev/production build, not Expo Go or web). Callers gate on `isBleSupported`.
let BleModule = null;
try {
  // eslint-disable-next-line global-require
  BleModule = require('react-native-ble-plx');
} catch {
  BleModule = null;
}

export const isBleSupported = BleModule != null && typeof BleModule.BleManager === 'function';

export const BLE_STATE = {
  PoweredOn: 'PoweredOn',
  PoweredOff: 'PoweredOff',
  Unauthorized: 'Unauthorized',
  Unsupported: 'Unsupported',
  Resetting: 'Resetting',
  Unknown: 'Unknown',
};

let manager = null;
let managerFailed = false;

export function getBleManager() {
  if (!isBleSupported || managerFailed) return null;
  if (!manager) {
    try {
      manager = new BleModule.BleManager();
    } catch {
      managerFailed = true;
      return null;
    }
  }
  return manager;
}

// Advertised-name fragments for common recreational and technical dive computers.
// Used only to sort likely devices to the top of the scan list — the user still
// picks. Exact model matching (dc_descriptor_filter) happens natively at download.
const DIVE_COMPUTER_NAME_HINTS = [
  'perdix', 'petrel', 'teric', 'peregrine', 'nerd', 'shearwater', // Shearwater
  'eon', 'suunto', 'd5', 'ocean', // Suunto (EON Steel/Core, D5, Ocean)
  'ostc', 'frog', 'hw ', // Heinrichs Weikamp
  'aqualung', 'i100', 'i200', 'i300', 'i330', 'i450', 'i470', 'i550', 'i770', // Aqualung / Oceanic / Apeks
  'oceanic', 'geo', 'proplus', 'pro plus',
  'mares', 'genius', 'quad', 'puck', 'smart', // Mares
  'cosmiq', 'deepblu', // Deepblu
  'scubapro', 'aladin', 'g2', 'g3', 'luna', // Scubapro / Uwatec
  'cressi', 'goa', 'leonardo', 'donatello', 'michelangelo', // Cressi
  'garmin', 'descent', // Garmin
  'ratio', 'divesoft', 'freedom', 'liberty', // Ratio / Divesoft
  'seac', 'sporasub', 'divesystem', 'idive', 'ix3m', // DiveSystem
];

export function looksLikeDiveComputer(nameOrDevice) {
  const raw = typeof nameOrDevice === 'string'
    ? nameOrDevice
    : (nameOrDevice?.name || nameOrDevice?.localName || '');
  const name = raw.toLowerCase().trim();
  if (!name) return false;
  return DIVE_COMPUTER_NAME_HINTS.some((hint) => name.includes(hint));
}

export async function ensureBlePermissions() {
  if (Platform.OS !== 'android') return true;
  const api = typeof Platform.Version === 'number' ? Platform.Version : parseInt(Platform.Version, 10);
  const permissions = api >= 31
    ? [
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ]
    : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
  try {
    const result = await PermissionsAndroid.requestMultiple(permissions);
    return permissions.every((p) => result[p] === PermissionsAndroid.RESULTS.GRANTED);
  } catch {
    return false;
  }
}

/** Resolves true once the adapter is powered on, or false after `timeoutMs`. */
export function waitForPoweredOn(bleManager, timeoutMs = 8000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      subscription?.remove();
      resolve(value);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    const subscription = bleManager.onStateChange((state) => {
      if (state === BLE_STATE.PoweredOn) finish(true);
    }, true);
  });
}
