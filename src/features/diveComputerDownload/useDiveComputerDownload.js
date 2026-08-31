import { useCallback, useEffect, useRef, useState } from 'react';

import { loadFingerprint, saveFingerprint } from '../../lib/diveLog/storage';
import {
  BLE_STATE,
  ensureBlePermissions,
  getBleManager,
  isBleSupported,
  looksLikeDiveComputer,
  waitForPoweredOn,
} from './diveComputerBle';
import { abortDownload, runDownload } from './downloadRunner';

// Controller for the "download from dive computer" flow: scan -> connect ->
// download. The dive transfer runs libdivecomputer natively over a BLE transport
// serviced here; each parsed dive is handed back through `onDiveDownloaded`.

const SCAN_DURATION_MS = 20000;

export default function useDiveComputerDownload({ onDiveDownloaded } = {}) {
  const managerRef = useRef(null);
  const scanTimerRef = useRef(null);
  const seenRef = useRef(new Map());
  const deviceRef = useRef(null); // the connected react-native-ble-plx Device
  const diveHandlerRef = useRef(onDiveDownloaded);
  diveHandlerRef.current = onDiveDownloaded;

  const [status, setStatus] = useState('idle'); // idle | scanning | connecting | connected | downloading | done | error
  const [devices, setDevices] = useState([]);
  const [connectedDevice, setConnectedDevice] = useState(null);
  const [progress, setProgress] = useState(null); // { current, maximum }
  const [summary, setSummary] = useState(null); // { downloaded, saved }
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isBleSupported) return undefined;
    managerRef.current = getBleManager();
    return () => {
      clearTimeout(scanTimerRef.current);
      try {
        managerRef.current?.stopDeviceScan();
      } catch {
        // manager already torn down
      }
    };
  }, []);

  const stopScan = useCallback(() => {
    clearTimeout(scanTimerRef.current);
    try {
      managerRef.current?.stopDeviceScan();
    } catch {
      // no-op
    }
    setStatus((current) => (current === 'scanning' ? 'idle' : current));
  }, []);

  const scan = useCallback(async () => {
    const manager = managerRef.current;
    setError('');
    setSummary(null);
    seenRef.current = new Map();
    setDevices([]);

    if (!manager) {
      setError('This build does not include Bluetooth support.');
      setStatus('error');
      return;
    }
    if (!(await ensureBlePermissions())) {
      setError('Bluetooth permission is needed to find your dive computer.');
      setStatus('error');
      return;
    }
    if (!(await waitForPoweredOn(manager))) {
      const state = await manager.state().catch(() => BLE_STATE.Unknown);
      setError(
        state === BLE_STATE.Unauthorized
          ? 'Allow Bluetooth for DMZ Scuba in Settings to scan.'
          : 'Turn on Bluetooth, then scan again.',
      );
      setStatus('error');
      return;
    }

    setStatus('scanning');
    manager.startDeviceScan(null, { allowDuplicates: false }, (scanError, device) => {
      if (scanError) {
        setError(scanError.message || 'Bluetooth scan failed.');
        setStatus('error');
        stopScan();
        return;
      }
      const name = device?.name || device?.localName;
      if (!device || !name) return;
      seenRef.current.set(device.id, {
        id: device.id,
        name,
        rssi: typeof device.rssi === 'number' ? device.rssi : null,
        isLikely: looksLikeDiveComputer(device),
      });
      setDevices(
        [...seenRef.current.values()].sort(
          (a, b) => Number(b.isLikely) - Number(a.isLikely) || (b.rssi ?? -999) - (a.rssi ?? -999),
        ),
      );
    });
    scanTimerRef.current = setTimeout(stopScan, SCAN_DURATION_MS);
  }, [stopScan]);

  const connect = useCallback(async (deviceId) => {
    const manager = managerRef.current;
    if (!manager) return;
    stopScan();
    setError('');
    setStatus('connecting');
    try {
      const connection = await manager.connectToDevice(deviceId, { timeout: 15000 });
      const ready = await connection.discoverAllServicesAndCharacteristics();
      deviceRef.current = ready;
      setConnectedDevice({ id: ready.id, name: ready.name || ready.localName || 'Dive computer' });
      setStatus('connected');
    } catch (connectError) {
      setError(connectError?.message || 'Could not connect to that dive computer.');
      setStatus('error');
    }
  }, [stopScan]);

  const disconnect = useCallback(async () => {
    const manager = managerRef.current;
    const target = connectedDevice;
    deviceRef.current = null;
    setConnectedDevice(null);
    setProgress(null);
    setStatus('idle');
    if (manager && target) {
      try {
        await manager.cancelDeviceConnection(target.id);
      } catch {
        // already disconnected
      }
    }
  }, [connectedDevice]);

  const download = useCallback(async ({ vendor, product } = {}) => {
    const device = deviceRef.current;
    if (!device || !connectedDevice) return;

    setError('');
    setProgress(null);
    setSummary(null);
    setStatus('downloading');

    const name = connectedDevice.name;
    const fingerprintBase64 = await loadFingerprint(vendor, product).catch(() => null);
    let downloaded = 0;
    let saved = 0;

    try {
      const result = await runDownload({
        device,
        name,
        vendor,
        product,
        fingerprintBase64,
        onProgress: setProgress,
        onDive: async (rawDive) => {
          downloaded += 1;
          const outcome = await diveHandlerRef.current?.(rawDive, { vendor, product });
          if (outcome === 'saved') saved += 1;
          setSummary({ downloaded, saved });
        },
      });
      if (result?.fingerprint) {
        await saveFingerprint(vendor, product, result.fingerprint).catch(() => {});
      }
      setSummary({ downloaded, saved });
      setStatus('done');
    } catch (downloadError) {
      setError(downloadError?.message || 'The download did not finish.');
      setStatus('error');
    }
  }, [connectedDevice]);

  const cancel = useCallback(() => {
    abortDownload();
  }, []);

  const reset = useCallback(() => {
    stopScan();
    setError('');
    setSummary(null);
    setProgress(null);
    setStatus(connectedDevice ? 'connected' : 'idle');
  }, [connectedDevice, stopScan]);

  return {
    supported: isBleSupported,
    status,
    devices,
    connectedDevice,
    progress,
    summary,
    error,
    scan,
    stopScan,
    connect,
    disconnect,
    download,
    cancel,
    reset,
  };
}
