// Connects to a Divesoft DNA analyzer over BLE and streams O2 readings.
// The analyzer only reports raw sensor signal + pressure; calibration and the
// O2 % math happen here in the app (see model.js).

import { useCallback, useEffect, useRef, useState } from 'react';

import { ensureBlePermissions, getBleManager, isBleSupported, waitForPoweredOn } from '../diveComputerDownload/diveComputerBle';
import {
  AIR_O2_PERCENT, BATTERY_LEVEL_CHAR, BATTERY_SERVICE, DEVICE_INFO_SERVICE, DNA_ADVERTISED_SERVICE,
  DNA_MEASUREMENT_CHAR, DNA_MEASUREMENT_SERVICE, SERIAL_NUMBER_CHAR,
  SMOOTHING_WINDOW_MS, averageMeasurement, base64ToBytes, isStable, makeCalibration, oxygenPercent,
  parseMeasurementBase64, trimSamples,
} from './model';
import { loadAnalyzerState, saveCalibration } from './storage';

const SCAN_TIMEOUT_MS = 12000;
const PACKET_LOG_LIMIT = 12;
const TICK_MS = 250;

const looksLikeDna = (device) => /^dna\b/i.test(String(device?.name || device?.localName || '').trim());

function decodeAscii(base64) {
  return String.fromCharCode(...base64ToBytes(base64)).replace(/\0/g, '').trim();
}

export default function useNitroxAnalyzer() {
  const [status, setStatus] = useState('idle'); // idle | scanning | connecting | connected | error
  const [error, setError] = useState(null);
  const [device, setDevice] = useState(null); // { id, name, serial }
  const [battery, setBattery] = useState(null);
  const [measurement, setMeasurement] = useState(null); // smoothed
  const [lastPacket, setLastPacket] = useState(null); // raw, for the inspector
  const [calibration, setCalibration] = useState(null);
  const [stable, setStable] = useState(false);
  const [packetLog, setPacketLog] = useState([]);

  const subs = useRef([]);
  const rawSamples = useRef([]); // [{ t, m }] parsed packets
  const history = useRef([]); // [{ t, signal, pressureMbar }] smoothed, one per tick
  const calibrationRef = useRef(null);
  const deviceIdRef = useRef(null);
  const scanTimer = useRef(null);
  const intentionalDisconnect = useRef(false);

  calibrationRef.current = calibration;

  const clearSubs = () => {
    subs.current.forEach((s) => { try { s?.remove(); } catch { /* already gone */ } });
    subs.current = [];
  };

  // Packets only go into the raw buffer; the tick below turns them into the
  // smoothed reading, so display and stability don't depend on packet rate.
  const handlePacket = useCallback((value) => {
    const parsed = parseMeasurementBase64(value);
    const now = Date.now();
    setPacketLog((log) => [{ t: now, hex: parsed?.hex || `unparsed (${base64ToBytes(value).length} bytes)` }, ...log].slice(0, PACKET_LOG_LIMIT));
    if (!parsed) return;
    setLastPacket(parsed);
    const kept = rawSamples.current.filter((s) => now - s.t <= SMOOTHING_WINDOW_MS * 2);
    rawSamples.current = [...kept, { t: now, m: parsed }];
  }, []);

  useEffect(() => {
    if (status !== 'connected') return undefined;
    const timer = setInterval(() => {
      const now = Date.now();
      const smoothed = averageMeasurement(rawSamples.current, now);
      if (!smoothed) return;
      history.current = trimSamples([...history.current, { t: now, signal: smoothed.signal, pressureMbar: smoothed.pressureMbar }], now);
      // Judge stability as O2 %. Before calibration there is no scale yet, so
      // treat "calibrate right now" as the scale — i.e. relative signal drift.
      const cal = calibrationRef.current;
      const values = history.current.map((h) => ({
        t: h.t,
        value: cal ? oxygenPercent(h, cal) : AIR_O2_PERCENT * (h.signal / smoothed.signal),
      }));
      setMeasurement(smoothed);
      setStable(isStable(values, now));
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [status]);

  const teardown = useCallback(async () => {
    clearTimeout(scanTimer.current);
    clearSubs();
    const manager = getBleManager();
    if (!manager) return;
    try { manager.stopDeviceScan(); } catch { /* not scanning */ }
    if (deviceIdRef.current) {
      intentionalDisconnect.current = true;
      try { await manager.cancelDeviceConnection(deviceIdRef.current); } catch { /* not connected */ }
    }
    deviceIdRef.current = null;
  }, []);

  useEffect(() => () => { teardown(); }, [teardown]);

  const fail = useCallback((message) => {
    setError(message);
    setStatus('error');
  }, []);

  const attach = useCallback(async (manager, scanned) => {
    setStatus('connecting');
    const connected = await manager.connectToDevice(scanned.id, { timeout: 15000, autoConnect: false });
    const ready = await connected.discoverAllServicesAndCharacteristics();
    deviceIdRef.current = ready.id;

    const services = await ready.services();
    if (!services.some((s) => String(s.uuid).toLowerCase() === DNA_MEASUREMENT_SERVICE)) {
      throw new Error(`${scanned.name || 'This device'} does not expose the DNA measurement service.`);
    }

    let serial = null;
    try {
      const c = await ready.readCharacteristicForService(DEVICE_INFO_SERVICE, SERIAL_NUMBER_CHAR);
      serial = decodeAscii(c?.value) || null;
    } catch { /* optional */ }
    const name = ready.name || scanned.name || 'DNA';
    // Fall back to the advertised name ("DNA 004017") when no serial characteristic is readable.
    const key = serial || name;
    setDevice({ id: ready.id, name, serial: key });

    const stored = await loadAnalyzerState();
    setCalibration(stored.calibrations[key] || null);

    try {
      const b = await ready.readCharacteristicForService(BATTERY_SERVICE, BATTERY_LEVEL_CHAR);
      setBattery(base64ToBytes(b?.value)[0] ?? null);
    } catch { /* optional */ }
    subs.current.push(ready.monitorCharacteristicForService(BATTERY_SERVICE, BATTERY_LEVEL_CHAR, (err, c) => {
      if (!err && c?.value) setBattery(base64ToBytes(c.value)[0] ?? null);
    }));

    subs.current.push(ready.monitorCharacteristicForService(DNA_MEASUREMENT_SERVICE, DNA_MEASUREMENT_CHAR, (err, c) => {
      if (err) return;
      if (c?.value) handlePacket(c.value);
    }));
    try {
      const first = await ready.readCharacteristicForService(DNA_MEASUREMENT_SERVICE, DNA_MEASUREMENT_CHAR);
      if (first?.value) handlePacket(first.value);
    } catch { /* notifications will follow */ }

    subs.current.push(manager.onDeviceDisconnected(ready.id, () => {
      clearSubs();
      deviceIdRef.current = null;
      setStable(false);
      if (intentionalDisconnect.current) {
        intentionalDisconnect.current = false;
        setStatus('idle');
      } else {
        fail('The analyzer disconnected. Check it is switched on and in range, then reconnect.');
      }
    }));

    intentionalDisconnect.current = false;
    setStatus('connected');
  }, [fail, handlePacket]);

  const connect = useCallback(async () => {
    setError(null);
    if (!isBleSupported) {
      fail('Bluetooth needs a development or App Store build — it is not available in Expo Go or on web.');
      return;
    }
    const manager = getBleManager();
    if (!manager) { fail('Bluetooth could not be started on this device.'); return; }
    if (!(await ensureBlePermissions())) { fail('Bluetooth permission was not granted.'); return; }
    if (!(await waitForPoweredOn(manager))) { fail('Turn Bluetooth on, then try again.'); return; }

    await teardown();
    rawSamples.current = [];
    history.current = [];
    setMeasurement(null);
    setLastPacket(null);
    setPacketLog([]);
    setStatus('scanning');

    let settled = false;
    scanTimer.current = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { manager.stopDeviceScan(); } catch { /* ignore */ }
      fail('No DNA analyzer found. Switch it on, keep it close to the phone, and try again.');
    }, SCAN_TIMEOUT_MS);

    manager.startDeviceScan([DNA_ADVERTISED_SERVICE], null, (scanError, scanned) => {
      if (settled) return;
      if (scanError) {
        settled = true;
        clearTimeout(scanTimer.current);
        fail(scanError.message || 'Bluetooth scan failed.');
        return;
      }
      // 0xFCEF is shared with Divesoft dive computers — only take a DNA analyzer.
      if (!looksLikeDna(scanned)) return;
      settled = true;
      clearTimeout(scanTimer.current);
      try { manager.stopDeviceScan(); } catch { /* ignore */ }
      attach(manager, scanned).catch(async (e) => {
        await teardown();
        fail(e?.message || 'Could not connect to the analyzer.');
      });
    });
  }, [attach, fail, teardown]);

  const disconnect = useCallback(async () => {
    await teardown();
    setStatus('idle');
    setStable(false);
  }, [teardown]);

  const calibrate = useCallback(async () => {
    if (!measurement || !device) return null;
    const next = makeCalibration(measurement);
    if (!next) return null;
    await saveCalibration(device.serial, next);
    setCalibration(next);
    return next;
  }, [device, measurement]);

  const clearCalibration = useCallback(async () => {
    if (!device) return;
    await saveCalibration(device.serial, null);
    setCalibration(null);
  }, [device]);

  const o2 = measurement && calibration ? oxygenPercent(measurement, calibration) : null;

  return {
    status, error, device, battery, measurement, lastPacket, calibration, o2, stable, packetLog,
    connect, disconnect, calibrate, clearCalibration,
  };
}
