import { useCallback, useEffect, useRef, useState } from 'react';

import { clearFingerprint, loadFingerprint, saveFingerprint } from '../../lib/diveLog/storage';
import {
  BLE_STATE,
  ensureBlePermissions,
  getBleManager,
  isBleSupported,
  looksLikeDiveComputer,
  looksLikeSuunto,
  waitForPoweredOn,
} from './diveComputerBle';
import { abortDownload, primePairing, runDownload } from './downloadRunner';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// iOS `didFailToConnect` — the peripheral refused the link outright. For Suunto
// this is almost always a stale or rival BLE bond, not something a fast retry fixes.
const CONNECTION_REFUSED = /connection failed|failed to connect/i;

// Re-advertise / re-discover the peripheral so iOS hands us a fresh handle before
// a retry — a peripheral that just failed to connect often needs re-scanning.
function refreshDevice(manager, deviceId, timeoutMs = 4000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { manager.stopDeviceScan(); } catch { /* no-op */ }
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);
    try {
      manager.startDeviceScan(null, { allowDuplicates: false }, (err, d) => {
        if (err || d?.id === deviceId) finish();
      });
    } catch {
      finish();
    }
  });
}

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

  const connect = useCallback(async (deviceId, meta = {}) => {
    const manager = managerRef.current;
    if (!manager) return;
    stopScan();
    setError('');
    setStatus('connecting');

    // Suunto EON Steel/Core/D5 need a bonded link; the first successful GATT
    // access triggers the iOS pairing prompt, and the device drops the link once
    // bonded — so a couple of extra attempts are expected. Other computers
    // connect on the first try.
    const suunto = looksLikeSuunto(meta.name || '');
    const maxAttempts = 3;
    let lastError = null;

    // iOS bonds are shared across apps — if the OS (or another app) already holds
    // a link to this peripheral, reuse it instead of a fresh connect that iOS may
    // refuse.
    const alreadyConnected = await manager.isDeviceConnected(deviceId).catch(() => false);
    console.log('[dc-download] already connected?', alreadyConnected);

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        console.log('[dc-download] connect attempt', attempt, { suunto });
        if (attempt > 1) await refreshDevice(manager, deviceId);
        const connection = (attempt === 1 && alreadyConnected)
          ? (await manager.devices([deviceId]))[0]
          : await manager.connectToDevice(deviceId, { timeout: 15000, autoConnect: false });
        if (!connection) throw new Error('connection failed');
        console.log('[dc-download] connectToDevice ok');
        const ready = await connection.discoverAllServicesAndCharacteristics();
        console.log('[dc-download] discover ok');

        try {
          const services = await ready.services();
          for (const s of services) {
            const chars = await s.characteristics();
            console.log('[dc-download] service', s.uuid, chars.map((c) => ({
              uuid: c.uuid,
              w: c.isWritableWithoutResponse || c.isWritableWithResponse,
              n: c.isNotifiable || c.isIndicatable,
            })));
          }
        } catch (e) {
          console.log('[dc-download] service dump failed', e?.message);
        }

        // Run the OS pairing/bonding handshake before handing off to the native
        // downloader (which cannot answer an iOS pairing prompt mid-transfer).
        await primePairing(ready, (m) => console.log('[dc-download] log:', m));
        console.log('[dc-download] primePairing done');

        // Suunto (and any newly-bonded device) often drops the link the instant
        // bonding lands — bounce back into the retry loop so the next attempt
        // connects over the now-established bond.
        const stillConnected = await ready.isConnected().catch(() => true);
        if (!stillConnected) throw new Error('link dropped after pairing');

        deviceRef.current = ready;
        setConnectedDevice({ id: ready.id, name: ready.name || ready.localName || meta.name || 'Dive computer' });
        setStatus('connected');
        return;
      } catch (connectError) {
        lastError = connectError;
        const msg = connectError?.message || '';
        console.log('[dc-download] connect attempt', attempt, 'failed:', msg);
        try { await manager.cancelDeviceConnection(deviceId); } catch { /* not connected */ }

        if (attempt >= maxAttempts) break;
        setStatus('connecting');
        // Back off longer each time; give iOS a beat to settle a failed link.
        await delay(2000 + attempt * 1500);
      }
    }

    const msg = lastError?.message || '';
    const refused = CONNECTION_REFUSED.test(msg);
    setError(
      suunto && refused
        ? 'The Suunto refused the connection. It bonds with only one device at a time. '
          + 'On the dive computer: open its Bluetooth/Connectivity menu and remove any paired device. '
          + 'On iPhone: Settings → Bluetooth, and if the EON / D5 is listed, tap it and "Forget This Device". '
          + 'Then put the computer back in pairing mode and scan again — iOS should show a pairing code.'
        : suunto
          ? 'Could not pair with the Suunto. Keep this screen open, put the computer in its pairing screen, '
            + 'and accept the iOS pairing request (enter the code shown on the dive computer).'
          : refused
            ? 'That dive computer refused the connection. Make sure it is in Bluetooth / upload mode and not '
              + 'already connected to another app or phone, then try again.'
            : msg || 'Could not connect to that dive computer.',
    );
    setStatus('error');
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

  const download = useCallback(async ({ full = false } = {}) => {
    const device = deviceRef.current;
    if (!device || !connectedDevice) return;

    setError('');
    setProgress(null);
    setSummary(null);
    setStatus('downloading');

    const name = connectedDevice.name;
    if (full) await clearFingerprint(name).catch(() => {});
    const fingerprintBase64 = full ? null : await loadFingerprint(name).catch(() => null);
    let downloaded = 0;
    let saved = 0;

    console.log('[dc-download] start', { name, hasFingerprint: !!fingerprintBase64 });

    try {
      const result = await runDownload({
        device,
        name,
        fingerprintBase64,
        onProgress: (p) => {
          console.log('[dc-download] progress', p);
          setProgress(p);
        },
        onLog: (m) => console.log('[dc-download] log:', m),
        onDive: async (rawDive) => {
          downloaded += 1;
          console.log('[dc-download] dive', downloaded, JSON.stringify(rawDive).slice(0, 900));
          console.log('[dc-download] dive', downloaded, 'tanks:', JSON.stringify(rawDive?.tanks), 'mixes:', JSON.stringify(rawDive?.gasmixes));
          const outcome = await diveHandlerRef.current?.(rawDive);
          console.log('[dc-download] dive', downloaded, 'outcome:', outcome);
          if (outcome === 'saved') saved += 1;
          setSummary({ downloaded, saved });
        },
      });
      console.log('[dc-download] finished', result);
      if (result?.fingerprint) {
        await saveFingerprint(name, result.fingerprint).catch(() => {});
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
