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

// Known BLE "serial" services for dive computers, in priority order. Ported from
// Subsurface's core/qt-ble.cpp serial_service_uuids table. libdivecomputer's
// per-model driver runs its own framing (HDLC, credit flow control, …) on top of
// whichever service we pick, so we only have to hand it the right characteristics.
const KNOWN_SERVICE_UUIDS = [
  '0000fefb-0000-1000-8000-00805f9b34fb', // Heinrichs-Weikamp (Telit/Stollmann) — OSTC
  '2456e1b9-26e2-8f83-e744-f34f01e9d701', // Heinrichs-Weikamp (U-Blox)
  '544e326b-5b72-c6b0-1c46-41c1bc448118', // Mares BlueLink Pro
  '98ae7120-e62e-11e3-badd-0002a5d5c51b', // Suunto EON Steel / EON Core / D5
  'cb3c4555-d670-4670-bc20-b61dbc851e9a', // Pelagic (i770R, i200C, Pro Plus X, Geo 4.0)
  'ca7b0001-f785-4c38-b599-c7c5fbadb034', // Pelagic (i330R, DSX)
  'fdcdeaaa-295d-470e-bf15-04217b7aa0a0', // Scubapro G2 / G3
  'fe25c237-0ece-443c-b0aa-e02033e7029d', // Shearwater Perdix / Teric / Peregrine / Tern
  '1aa44039-1667-4b29-87cc-dfecaaf31d97', // Shearwater Perdix 3
  '0000fcef-0000-1000-8000-00805f9b34fb', // Divesoft
  '6e400001-b5a3-f393-e0a9-e50e24dc10b8', // Cressi
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART (generic fallback)
  '00000001-8c3b-4f2c-a59e-8c08224f3253', // Halcyon Symbios
  '84968ffe-d26d-478a-b953-5010bcf58bca', // Seac
];

const norm = (uuid) => String(uuid || '').toLowerCase();

function classifyCharacteristics(characteristics) {
  const writeChar = characteristics.find(
    (c) => c.isWritableWithoutResponse || c.isWritableWithResponse,
  );
  const notifyChar = characteristics.find((c) => c.isNotifiable || c.isIndicatable);
  return { writeChar, notifyChar };
}

async function pickCharacteristics(device) {
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
