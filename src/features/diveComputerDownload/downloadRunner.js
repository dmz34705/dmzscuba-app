// Bridges a connected react-native-ble-plx device to the native libdivecomputer
// downloader: picks the BLE characteristics, pumps notifications into the native
// read buffer, and services the native "write these bytes" requests.

import {
  addDownloadListener,
  cancelDownload,
  provideBytes,
  provideWriteComplete,
  startDownload,
} from '../../../modules/dive-computer-bridge';

async function pickCharacteristics(device) {
  const services = await device.services();
  let writeChar = null;
  let notifyChar = null;
  for (const service of services) {
    const characteristics = await service.characteristics();
    for (const characteristic of characteristics) {
      if (!writeChar && (characteristic.isWritableWithoutResponse || characteristic.isWritableWithResponse)) {
        writeChar = characteristic;
      }
      if (!notifyChar && (characteristic.isNotifiable || characteristic.isIndicatable)) {
        notifyChar = characteristic;
      }
    }
    if (writeChar && notifyChar) break;
  }
  if (!writeChar || !notifyChar) {
    throw new Error('This device does not expose a readable/writable Bluetooth service.');
  }
  return { writeChar, notifyChar };
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
  const { writeChar, notifyChar } = await pickCharacteristics(device);

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

  const progressSub = addDownloadListener('onDownloadProgress', (body) => onProgress?.(body));
  const diveSub = addDownloadListener('onDownloadDive', (body) => onDive?.(body.dive));
  const logSub = addDownloadListener('onDownloadLog', (body) => onLog?.(body.message));

  try {
    return await startDownload({ name, vendor, product, fingerprintBase64: fingerprintBase64 || undefined });
  } finally {
    notifySub.remove();
    writeSub.remove();
    progressSub.remove();
    diveSub.remove();
    logSub.remove();
  }
}

export function abortDownload() {
  cancelDownload();
}
