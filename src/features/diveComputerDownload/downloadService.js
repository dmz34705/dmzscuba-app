// Background dive-computer download engine.
//
// This is a module-level singleton, NOT a React hook, so a transfer keeps
// running when the download screen unmounts — the user can browse the rest of
// the app (or other logbook views) while dives stream in, like a browser
// download. Components subscribe through `useDiveComputerDownload`.
//
// The engine owns the whole flow: scan -> connect/pair -> download -> write to
// storage. Downloaded dives are batched and written here (via
// `createDivesFromLogs`); it raises `markPendingReview` so the logbook re-runs
// index rebuild + cross-computer reconciliation the next time it renders.

import {
  clearFingerprint,
  createDivesFromLogs,
  loadFingerprint,
  loadIndex,
  saveFingerprint,
} from '../../lib/diveLog/storage';
import { computerDiveKey, computerLogFromDownload } from './computerLogFromDownload';
import { markPendingReview } from './downloadReviewFlag';
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

const CONNECTION_REFUSED = /connection failed|failed to connect/i;
const SCAN_DURATION_MS = 20000;
const LOG_LIMIT = 250; // console ring buffer

// ---------------------------------------------------------------------------
// store
// ---------------------------------------------------------------------------

const listeners = new Set();
let logSeq = 0;

let state = {
  supported: isBleSupported,
  status: 'idle', // idle | scanning | connecting | connected | downloading | done | error
  devices: [],
  connectedDevice: null,
  progress: null, // { current, maximum }
  summary: null, // { downloaded, saved, merged, duplicate, failed }
  error: '',
  log: [], // [{ id, t, level, text }]
  // true once we have a valid last-sync fingerprint for the connected computer
  // whose dive is still in the logbook — i.e. an incremental "sync new dives"
  // is safe and will be fast. false on a first-ever download (or after the
  // marker's dive was deleted), where only a full read makes sense.
  baselineKnown: false,
};

function emit() {
  for (const fn of listeners) fn(state);
}

function set(patch) {
  state = { ...state, ...patch };
  emit();
}

function log(text, level = 'info') {
  logSeq += 1;
  const line = { id: `${Date.now()}-${logSeq}`, t: Date.now(), level, text: String(text) };
  const next = state.log.length >= LOG_LIMIT
    ? [...state.log.slice(state.log.length - LOG_LIMIT + 1), line]
    : [...state.log, line];
  state = { ...state, log: next };
  emit();
  // keep the Metro console useful too
  // eslint-disable-next-line no-console
  console.log('[dc-download]', text);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getState() {
  return state;
}

export function clearLog() {
  set({ log: [] });
}

// ---------------------------------------------------------------------------
// BLE plumbing
// ---------------------------------------------------------------------------

let manager = null;
let scanTimer = null;
let seen = new Map();
let device = null; // the connected react-native-ble-plx Device
let downloadRunning = false;

function ensureManager() {
  if (!manager && isBleSupported) manager = getBleManager();
  return manager;
}

// Re-advertise / re-discover a peripheral so iOS hands us a fresh handle before a
// connect retry.
function refreshDevice(deviceId, timeoutMs = 4000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { manager?.stopDeviceScan(); } catch { /* no-op */ }
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

export function stopScan() {
  clearTimeout(scanTimer);
  try { manager?.stopDeviceScan(); } catch { /* no-op */ }
  if (state.status === 'scanning') set({ status: 'idle' });
}

export async function scan() {
  ensureManager();
  set({ error: '', summary: null, devices: [], baselineKnown: false });
  seen = new Map();

  if (!manager) {
    set({ error: 'This build does not include Bluetooth support.', status: 'error' });
    return;
  }
  if (!(await ensureBlePermissions())) {
    set({ error: 'Bluetooth permission is needed to find your dive computer.', status: 'error' });
    return;
  }
  if (!(await waitForPoweredOn(manager))) {
    const bleState = await manager.state().catch(() => BLE_STATE.Unknown);
    set({
      error: bleState === BLE_STATE.Unauthorized
        ? 'Allow Bluetooth for DMZ Scuba in Settings to scan.'
        : 'Turn on Bluetooth, then scan again.',
      status: 'error',
    });
    return;
  }

  set({ status: 'scanning' });
  log('scanning for dive computers…');
  manager.startDeviceScan(null, { allowDuplicates: false }, (scanError, found) => {
    if (scanError) {
      set({ error: scanError.message || 'Bluetooth scan failed.', status: 'error' });
      stopScan();
      return;
    }
    const name = found?.name || found?.localName;
    if (!found || !name) return;
    seen.set(found.id, {
      id: found.id,
      name,
      rssi: typeof found.rssi === 'number' ? found.rssi : null,
      isLikely: looksLikeDiveComputer(found),
    });
    set({
      devices: [...seen.values()].sort(
        (a, b) => Number(b.isLikely) - Number(a.isLikely) || (b.rssi ?? -999) - (a.rssi ?? -999),
      ),
    });
  });
  scanTimer = setTimeout(stopScan, SCAN_DURATION_MS);
}

export async function connect(deviceId, meta = {}) {
  ensureManager();
  if (!manager) return;
  stopScan();
  set({ error: '', status: 'connecting' });

  const suunto = looksLikeSuunto(meta.name || '');
  const maxAttempts = 3;
  let lastError = null;

  const alreadyConnected = await manager.isDeviceConnected(deviceId).catch(() => false);
  log(`connecting to ${meta.name || deviceId}${alreadyConnected ? ' (already linked)' : ''}`);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      if (attempt > 1) await refreshDevice(deviceId);
      const connection = (attempt === 1 && alreadyConnected)
        ? (await manager.devices([deviceId]))[0]
        : await manager.connectToDevice(deviceId, { timeout: 15000, autoConnect: false });
      if (!connection) throw new Error('connection failed');
      const ready = await connection.discoverAllServicesAndCharacteristics();
      log('discovered services');

      await primePairing(ready, (m) => log(`pairing: ${m}`));

      const stillConnected = await ready.isConnected().catch(() => true);
      if (!stillConnected) throw new Error('link dropped after pairing');

      device = ready;
      const resolvedName = ready.name || ready.localName || meta.name || 'Dive computer';
      set({ connectedDevice: { id: ready.id, name: resolvedName }, status: 'connected' });
      log('connected');
      refreshBaseline(resolvedName);
      return;
    } catch (connectError) {
      lastError = connectError;
      log(`connect attempt ${attempt} failed: ${connectError?.message || 'error'}`, 'warn');
      try { await manager.cancelDeviceConnection(deviceId); } catch { /* not connected */ }
      if (attempt >= maxAttempts) break;
      set({ status: 'connecting' });
      await delay(2000 + attempt * 1500);
    }
  }

  const msg = lastError?.message || '';
  const refused = CONNECTION_REFUSED.test(msg);
  set({
    status: 'error',
    error: suunto && refused
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
  });
}

export async function disconnect() {
  const target = state.connectedDevice;
  device = null;
  set({ connectedDevice: null, progress: null, status: 'idle', baselineKnown: false });
  if (manager && target) {
    try { await manager.cancelDeviceConnection(target.id); } catch { /* already gone */ }
  }
}

// ---------------------------------------------------------------------------
// download
// ---------------------------------------------------------------------------

async function loadKnownComputerKeys() {
  const set2 = new Set();
  try {
    const rows = await loadIndex();
    for (const row of rows) {
      if (row.deletedAt) continue;
      for (const key of row.computerKeys || []) set2.add(key);
    }
  } catch { /* first download — nothing known yet */ }
  return set2;
}

// Decide whether an incremental "sync new dives" is available for `name`: there
// must be a saved fingerprint AND its dive must still be in the logbook (a
// deleted marker dive can't be reached incrementally, so we'd have to full-read).
async function refreshBaseline(name) {
  try {
    const marker = await loadFingerprint(name).catch(() => null);
    if (!marker) { set({ baselineKnown: false }); return; }
    const known = await loadKnownComputerKeys();
    set({ baselineKnown: [...known].some((k) => k.endsWith(`|${marker}`)) });
  } catch {
    set({ baselineKnown: false });
  }
}

/**
 * @param {{ incremental?: boolean, force?: boolean }} [opts]
 *   `incremental` — pass the stored last-sync fingerprint so the computer only
 *   sends newer dives. `force` — re-import even dives already in the logbook.
 */
export async function download({ incremental = false, force = false } = {}) {
  if (downloadRunning) return;
  if (!device || !state.connectedDevice) return;
  downloadRunning = true;

  set({ error: '', progress: null, summary: null, status: 'downloading' });

  const name = state.connectedDevice.name;
  const allKnown = await loadKnownComputerKeys();
  const known = force ? new Set() : allKnown;
  const pendingLogs = [];
  const tally = { downloaded: 0, saved: 0, merged: 0, duplicate: 0, failed: 0 };

  // Always evaluate the saved marker: use it only for an incremental sync, but
  // drop it only when it's provably stale (its dive is no longer in the book).
  // A deliberate full read must NOT wipe a still-valid marker.
  const marker = await loadFingerprint(name).catch(() => null);
  const markerValid = !!marker && [...allKnown].some((k) => k.endsWith(`|${marker}`));
  const fingerprintBase64 = incremental && markerValid ? marker : null;
  if (marker && !markerValid) await clearFingerprint(name).catch(() => {});
  set({ baselineKnown: markerValid });

  const mode = fingerprintBase64 ? 'incremental' : incremental ? 'incremental → full (no baseline yet)' : 'full read';
  log(`download start · ${name} · ${mode}`);

  try {
    const result = await runDownload({
      device,
      name,
      fingerprintBase64,
      onProgress: (p) => set({ progress: p }),
      onLog: (m) => log(m),
      onDive: (rawDive) => {
        tally.downloaded += 1;
        try {
          const logPartial = computerLogFromDownload(rawDive);
          const key = computerDiveKey(
            logPartial.device.vendor, logPartial.device.product, logPartial.fingerprint,
          );
          if (!force && key && known.has(key)) {
            tally.duplicate += 1;
            log(`dive ${tally.downloaded}: already in logbook`, 'dim');
          } else {
            pendingLogs.push(logPartial);
            if (key) known.add(key);
            tally.saved += 1;
            log(`dive ${tally.downloaded}: ${logPartial.startTime || 'read'}`, 'dive');
          }
        } catch (e) {
          tally.failed += 1;
          log(`dive ${tally.downloaded}: parse failed — ${e?.message || 'error'}`, 'error');
        }
        set({ summary: { ...tally } });
      },
    });

    if (result?.fingerprint) await saveFingerprint(name, result.fingerprint).catch(() => {});

    if (pendingLogs.length) {
      const created = await createDivesFromLogs(pendingLogs).catch((e) => {
        log(`save failed: ${e?.message || 'error'}`, 'error');
        return [];
      });
      markPendingReview(created.length);
      log(`saved ${created.length} new ${created.length === 1 ? 'dive' : 'dives'} to the logbook`);
    }

    // A clean finish means the newest dive's fingerprint is saved and its dive
    // is in the book — future syncs can go incremental.
    set({ summary: { ...tally }, status: 'done', baselineKnown: !!result?.fingerprint || state.baselineKnown });
    log('download complete');
  } catch (downloadError) {
    // Still persist whatever arrived before the failure.
    if (pendingLogs.length) {
      const created = await createDivesFromLogs(pendingLogs).catch(() => []);
      markPendingReview(created.length);
      log(`saved ${created.length} dives from the partial transfer`, 'warn');
    }
    set({
      summary: { ...tally },
      error: downloadError?.message || 'The download did not finish.',
      status: 'error',
    });
    log(`download failed: ${downloadError?.message || 'error'}`, 'error');
  } finally {
    downloadRunning = false;
  }
}

export function cancel() {
  abortDownload();
  log('stop requested', 'warn');
}

export function reset() {
  stopScan();
  set({
    error: '',
    summary: null,
    progress: null,
    status: state.connectedDevice ? 'connected' : 'idle',
  });
}

export const isDownloadRunning = () => downloadRunning;
