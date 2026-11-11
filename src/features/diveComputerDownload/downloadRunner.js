// Bridges a connected react-native-ble-plx device to the native libdivecomputer
// downloader: picks the BLE characteristics, pumps notifications into the native
// read buffer, and services the native "write these bytes" requests.

import {
  addDownloadListener,
  cancelDownload,
  exploreSuunto,
  scanShearwater,
  provideBytes,
  isSetupDeviceAvailable,
  provideWriteComplete,
  setupDevice,
  startDownload,
  syncDeviceTime,
} from '../../../modules/dive-computer-bridge';
import { KNOWN_SERVICE_UUIDS } from './diveComputerBle';

// libdivecomputer's per-model driver runs its own framing (HDLC, credit flow
// control, …) on top of whichever GATT service we pick, so we only have to
// hand it the right characteristics.

const norm = (uuid) => String(uuid || '').toLowerCase();
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// react-native-ble-plx returns the monitor's cancellation handle immediately;
// it does not expose a promise that resolves when CoreBluetooth has finished
// enabling notifications. Shearwater answers the first command immediately,
// so starting libdivecomputer before `isNotifying` flips to true can lose that
// first reply and surface as DC_STATUS_TIMEOUT (-7).
async function waitForNotificationSubscription(device, notifyChar, onLog) {
  const deadline = Date.now() + 1500;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const characteristics = await device.characteristicsForService(notifyChar.serviceUUID);
      const current = characteristics.find((candidate) => norm(candidate.uuid) === norm(notifyChar.uuid));
      if (current?.isNotifying) {
        onLog?.('notifications ready');
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await delay(30);
  }

  const detail = lastError?.message ? `: ${lastError.message}` : '';
  throw new Error(`Could not enable Bluetooth notifications${detail}`);
}

function classifyCharacteristics(characteristics) {
  const writeChar = characteristics.find(
    (c) => c.isWritableWithoutResponse || c.isWritableWithResponse,
  );
  const notifyChar = characteristics.find((c) => c.isNotifiable || c.isIndicatable);
  return { writeChar, notifyChar };
}

export async function pickCharacteristics(device) {
  const services = await device.services();
  const byUuid = new Map(services.map((s) => [norm(s.uuid), s]));

  // 1. Prefer a known dive-computer serial service.
  for (const known of KNOWN_SERVICE_UUIDS) {
    const service = byUuid.get(known);
    if (!service) continue;
    const { writeChar, notifyChar } = classifyCharacteristics(await service.characteristics());
    if (writeChar && notifyChar) return { writeChar, notifyChar, serviceUuid: known };
  }

  // 2. Fall back to any service that has both a writable and a notifiable characteristic.
  for (const service of services) {
    const { writeChar, notifyChar } = classifyCharacteristics(await service.characteristics());
    if (writeChar && notifyChar) return { writeChar, notifyChar, serviceUuid: norm(service.uuid) };
  }

  throw new Error('This device does not expose a usable Bluetooth serial service.');
}

/**
 * Force the OS BLE pairing / bonding handshake before the native download runs.
 * Suunto EON Steel / Core / D5 require an encrypted (bonded) link: iOS only
 * starts pairing when something touches an encrypted characteristic, so we
 * briefly subscribe to the notify characteristic here. The peripheral commonly
 * drops the link right after bonding — the caller retries the connect.
 *
 * Best-effort: silently returns if no usable service is exposed yet. Throws only
 * when the subscription itself fails (encryption error → caller should retry).
 *
 * @param {import('react-native-ble-plx').Device} device  connected + discovered
 * @param {(m: string) => void} [onLog]
 */
export async function primePairing(device, onLog) {
  let picked = null;
  try {
    picked = await pickCharacteristics(device);
  } catch {
    onLog?.('pairing prime: no serial service yet, skipping');
    return;
  }
  let sub = null;
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 1200);
      sub = device.monitorCharacteristicForService(
        picked.notifyChar.serviceUUID,
        picked.notifyChar.uuid,
        (error) => {
          if (!error) return; // ignore any data that arrives during priming
          clearTimeout(timer);
          reject(error);
        },
      );
    });
    onLog?.('pairing prime ok');
  } finally {
    sub?.remove();
  }
}

// Every native libdivecomputer operation over our custom BLE iostream needs
// the same glue regardless of what it actually does: feed incoming
// notifications into the native read buffer, and write back whatever bytes it
// asks for. Shared by runDownload and runTimeSync so a time-sync (or any
// future write-only operation) doesn't have to re-derive this wiring.
async function withBlePump(device, onLog, perform) {
  const { writeChar, notifyChar, serviceUuid } = await pickCharacteristics(device);
  onLog?.(`service ${serviceUuid} · write ${writeChar.uuid} · notify ${notifyChar.uuid}`);

  const notifySub = device.monitorCharacteristicForService(
    notifyChar.serviceUUID,
    notifyChar.uuid,
    (error, characteristic) => {
      if (error) {
        onLog?.(`notification error: ${error.message}`);
        return;
      }
      if (characteristic?.value) provideBytes(characteristic.value);
    },
  );

  const writeSub = addDownloadListener('onDownloadWrite', async ({ data }) => {
    try {
      if (writeChar.isWritableWithoutResponse) {
        await device.writeCharacteristicWithoutResponseForService(writeChar.serviceUUID, writeChar.uuid, data);
      } else {
        await device.writeCharacteristicWithResponseForService(writeChar.serviceUUID, writeChar.uuid, data);
      }
    } catch (error) {
      onLog?.(`write failed: ${error.message}`);
    } finally {
      provideWriteComplete();
    }
  });

  const logSub = addDownloadListener('onDownloadLog', (body) => onLog?.(body.message));

  try {
    await waitForNotificationSubscription(device, notifyChar, onLog);
    return await perform();
  } finally {
    notifySub.remove();
    writeSub.remove();
    logSub.remove();
  }
}

/**
 * @param {object} params
 * @param {import('react-native-ble-plx').Device} params.device  connected + services discovered
 * @param {string} params.name          advertised BLE name (for descriptor matching)
 * @param {string} [params.vendor]
 * @param {string} [params.product]
 * @param {string|null} [params.fingerprintBase64]  last downloaded fingerprint, for incremental
 * @param {(p: {current:number, maximum:number}) => void} [params.onProgress]
 * @param {(rawDive: object) => void} [params.onDive]
 * @param {(message: string) => void} [params.onLog]
 * @returns {Promise<{ fingerprint: string | null, count: number }>}
 */
export async function runDownload({
  device,
  name,
  vendor,
  product,
  fingerprintBase64,
  onProgress,
  onDive,
  onLog,
}) {
  const progressSub = addDownloadListener('onDownloadProgress', (body) => onProgress?.(body));
  const diveSub = addDownloadListener('onDownloadDive', (body) => onDive?.(body.dive));
  try {
    return await withBlePump(device, onLog, () => (
      startDownload({ name, vendor, product, fingerprintBase64: fingerprintBase64 || undefined })
    ));
  } finally {
    progressSub.remove();
    diveSub.remove();
  }
}

/**
 * Sets the dive computer's clock. Shares the same BLE write/notify plumbing as
 * a download — this is just a much shorter exchange.
 * @param {object} params
 * @param {import('react-native-ble-plx').Device} params.device  connected + services discovered
 * @param {string} params.name
 * @param {string} [params.vendor]
 * @param {string} [params.product]
 * @param {number} params.year
 * @param {number} params.month  1-12
 * @param {number} params.day
 * @param {number} params.hour   0-23
 * @param {number} params.minute
 * @param {number} params.second
 * @param {(message: string) => void} [params.onLog]
 * @returns {Promise<{ vendor: string, product: string }>}
 */
export async function runTimeSync({
  device,
  name,
  vendor,
  product,
  year,
  month,
  day,
  hour,
  minute,
  second,
  onLog,
}) {
  return withBlePump(device, onLog, () => (
    syncDeviceTime({ name, vendor, product, year, month, day, hour, minute, second })
  ));
}

/**
 * Pre-dive setup over the connected device: gas (where supported) + clock.
 * Resolves with the native { vendor, product, gas, clock } result.
 */
export async function runDeviceSetup({ device, name, vendor, product, oxygen, setClock, gasSupported, date, onLog }) {
  const when = date || new Date();
  if (!isSetupDeviceAvailable()) {
    // Older installed native build: no gas write available, but the clock
    // still works through the existing time-sync call.
    onLog?.('native setupDevice missing (app build is older than this JS) — clock only');
    const gas = gasSupported
      ? { status: 'error', message: 'Sending gases needs the latest app build. Rebuild / reinstall the app, then try again.' }
      : { status: 'unsupported' };
    if (!setClock) return { gas, clock: { status: 'skipped' } };
    try {
      await runTimeSync({
        device, name, vendor, product, onLog,
        year: when.getFullYear(), month: when.getMonth() + 1, day: when.getDate(),
        hour: when.getHours(), minute: when.getMinutes(), second: when.getSeconds(),
      });
      return { gas, clock: { status: 'set' } };
    } catch (error) {
      const message = error?.message || 'Clock sync failed.';
      return { gas, clock: /does not support/i.test(message) ? { status: 'unsupported' } : { status: 'error', message } };
    }
  }
  return withBlePump(device, onLog, () => setupDevice({
    name, vendor, product, oxygen, setClock,
    year: when.getFullYear(), month: when.getMonth() + 1, day: when.getDate(),
    hour: when.getHours(), minute: when.getMinutes(), second: when.getSeconds(),
  }));
}

/** READ-ONLY Suunto EON filesystem dump over the connected device. */
export async function runSuuntoExplore({ device, name, vendor, product, onLog }) {
  return withBlePump(device, onLog, () => exploreSuunto({ name, vendor, product }));
}

/** READ-ONLY Shearwater settings scan (RDBI over ID ranges) over the connected device. */
export async function runShearwaterScan({ device, name, vendor, product, ranges, onLog, onProgress }) {
  const progressSub = addDownloadListener('onDownloadProgress', (body) => onProgress?.(body));
  try {
    return await withBlePump(device, onLog, () => scanShearwater({ name, vendor, product, ranges }));
  } finally {
    progressSub.remove();
  }
}

export function abortDownload() {
  cancelDownload();
}
