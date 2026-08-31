import { useCallback, useEffect, useRef, useState } from 'react';

import {
  BLE_STATE,
  ensureBlePermissions,
  getBleManager,
  isBleSupported,
  looksLikeDiveComputer,
  waitForPoweredOn,
} from './diveComputerBle';

// Controller for the "download from dive computer" flow.
//
// Step 3 covers scan -> connect -> disconnect and surfaces connection state.
// The actual dive transfer (libdivecomputer over a BLE-backed custom iostream)
// is wired in the next step; `connectedDevice` is the handoff point.

const SCAN_DURATION_MS = 20000;

export default function useDiveComputerDownload() {
  const managerRef = useRef(null);
  const scanTimerRef = useRef(null);
  const seenRef = useRef(new Map());

  const [status, setStatus] = useState('idle'); // idle | scanning | connecting | connected | error
  const [devices, setDevices] = useState([]);
  const [connectedDevice, setConnectedDevice] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isBleSupported) return undefined;
    managerRef.current = getBleManager();
    return () => {
      clearTimeout(scanTimerRef.current);
      try {
        managerRef.current?.stopDeviceScan();
      } catch {
        // manager may already be torn down
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
    seenRef.current = new Map();
    setDevices([]);

    if (!manager) {
      setError('This build does not include Bluetooth support.');
      setStatus('error');
      return;
    }

    const granted = await ensureBlePermissions();
    if (!granted) {
      setError('Bluetooth permission is needed to find your dive computer.');
      setStatus('error');
      return;
    }

    const poweredOn = await waitForPoweredOn(manager);
    if (!poweredOn) {
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
      if (!device || !name) return; // skip unnamed background noise

      seenRef.current.set(device.id, {
        id: device.id,
        name,
        rssi: typeof device.rssi === 'number' ? device.rssi : null,
        isLikely: looksLikeDiveComputer(device),
      });
      const sorted = [...seenRef.current.values()].sort(
        (a, b) => Number(b.isLikely) - Number(a.isLikely) || (b.rssi ?? -999) - (a.rssi ?? -999),
      );
      setDevices(sorted);
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
    setConnectedDevice(null);
    setStatus('idle');
    if (manager && target) {
      try {
        await manager.cancelDeviceConnection(target.id);
      } catch {
        // already disconnected
      }
    }
  }, [connectedDevice]);

  const reset = useCallback(() => {
    stopScan();
    setError('');
    setStatus('idle');
  }, [stopScan]);

  return {
    supported: isBleSupported,
    status,
    devices,
    connectedDevice,
    error,
    scan,
    stopScan,
    connect,
    disconnect,
    reset,
  };
}
