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

// Known BLE "serial" services for dive computers, in priority order. Ported from
// Subsurface's core/qt-ble.cpp serial_service_uuids table. Shared by downloadRunner
// (to pick GATT characteristics on a connected device), downloadService (to spot a
// dive computer the OS still considers "connected" from a previous session before
// scanning), and looksLikeDiveComputer/labelForKnownService below — some computers
// (Pelagic-family Aqualung/Apeks models in particular) advertise their raw serial
// number as the BLE name with no vendor/model text in it at all, so the name-hint
// list above can't identify them; the GATT service they advertise can, and a scan
// result exposes the advertised service UUIDs without needing to connect first.
// `timeSync` reflects whether that device's libdivecomputer backend implements
// dc_device_timesync at all — checked against the vendored source per family,
// not a guess. Oceanic/Pelagic (ATOM2 and I330R), Mares, and Scubapro/Uwatec
// have no time-sync support in the library for any model, at any BLE service;
// setting the clock on those always fails, so the UI hides the option rather
// than offering a button that can only ever error.
const KNOWN_SERVICES = [
  { uuid: '0000fefb-0000-1000-8000-00805f9b34fb', label: 'Heinrichs-Weikamp (Telit/Stollmann) — OSTC', timeSync: true },
  { uuid: '2456e1b9-26e2-8f83-e744-f34f01e9d701', label: 'Heinrichs-Weikamp (U-Blox)', timeSync: true },
  { uuid: '544e326b-5b72-c6b0-1c46-41c1bc448118', label: 'Mares BlueLink Pro', timeSync: false },
  { uuid: '98ae7120-e62e-11e3-badd-0002a5d5c51b', label: 'Suunto EON Steel / EON Core / D5', timeSync: true },
  { uuid: 'cb3c4555-d670-4670-bc20-b61dbc851e9a', label: 'Aqualung / Apeks / Oceanic (Pelagic — i770R, i200C, i300C, Pro Plus X, Geo 4.0)', timeSync: false },
  { uuid: 'ca7b0001-f785-4c38-b599-c7c5fbadb034', label: 'Aqualung / Apeks (Pelagic — i330R, DSX)', timeSync: false },
  { uuid: 'fdcdeaaa-295d-470e-bf15-04217b7aa0a0', label: 'Scubapro G2 / G3', timeSync: false },
  { uuid: 'fe25c237-0ece-443c-b0aa-e02033e7029d', label: 'Shearwater Perdix / Teric / Peregrine / Tern', timeSync: true },
  { uuid: '1aa44039-1667-4b29-87cc-dfecaaf31d97', label: 'Shearwater Perdix 3', timeSync: true },
  { uuid: '0000fcef-0000-1000-8000-00805f9b34fb', label: 'Divesoft', timeSync: false },
  { uuid: '6e400001-b5a3-f393-e0a9-e50e24dc10b8', label: 'Cressi', timeSync: true },
  { uuid: '6e400001-b5a3-f393-e0a9-e50e24dcca9e', label: 'Nordic UART (generic dive computer)', timeSync: false },
  { uuid: '00000001-8c3b-4f2c-a59e-8c08224f3253', label: 'Halcyon Symbios', timeSync: true },
  { uuid: '84968ffe-d26d-478a-b953-5010bcf58bca', label: 'Seac', timeSync: false },
];

export const KNOWN_SERVICE_UUIDS = KNOWN_SERVICES.map((s) => s.uuid);

const SERVICE_BY_UUID = new Map(KNOWN_SERVICES.map((s) => [s.uuid, s]));

/** A friendly vendor label for a scanned device's advertised service UUIDs, or
 * null if none match a known dive computer service. Works without connecting. */
export function labelForKnownService(nameOrDevice) {
  const uuids = typeof nameOrDevice === 'string' ? null : nameOrDevice?.serviceUUIDs;
  if (!Array.isArray(uuids)) return null;
  for (const uuid of uuids) {
    const known = SERVICE_BY_UUID.get(String(uuid).toLowerCase());
    if (known) return known.label;
  }
  return null;
}

/** Looks up which known dive-computer service a *connected* device (with
 * discovered services) exposes, for capability checks like time-sync support.
 * Returns null for an unrecognized device — never assume support by default. */
export async function detectKnownService(device) {
  try {
    const services = await device.services();
    const byUuid = new Set(services.map((s) => String(s.uuid).toLowerCase()));
    for (const known of KNOWN_SERVICES) {
      if (byUuid.has(known.uuid)) return known;
    }
  } catch {
    // fall through to null — best-effort capability detection
  }
  return null;
}

export function looksLikeDiveComputer(nameOrDevice) {
  const raw = typeof nameOrDevice === 'string'
    ? nameOrDevice
    : (nameOrDevice?.name || nameOrDevice?.localName || '');
  const name = raw.toLowerCase().trim();
  if (name && DIVE_COMPUTER_NAME_HINTS.some((hint) => name.includes(hint))) return true;
  // A name with no vendor hint can still be identified by its advertised
  // GATT service — the Pelagic family in particular advertises its serial
  // number as the BLE name, with no model text in it at all.
  return labelForKnownService(nameOrDevice) != null;
}

// Suunto EON Steel / Core / D5 (the suunto_eonsteel BLE backend) require a bonded
// (encrypted) BLE link — iOS shows a pairing-code prompt on first connect and the
// device often drops the link once bonding completes. Callers use this to warn
// the user and to retry the connect after the pairing hiccup.
const SUUNTO_NAME_HINTS = ['suunto', 'eon steel', 'eon core', 'eon ', 'd5'];

export function looksLikeSuunto(nameOrDevice) {
  const raw = typeof nameOrDevice === 'string'
    ? nameOrDevice
    : (nameOrDevice?.name || nameOrDevice?.localName || '');
  const name = raw.toLowerCase().trim();
  if (!name) return false;
  return SUUNTO_NAME_HINTS.some((hint) => name.includes(hint));
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
