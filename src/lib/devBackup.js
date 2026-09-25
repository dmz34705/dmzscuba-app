// Development backups: a copy of everything the app stores — logbook, gear locker, settings,
// preferences (app storage) and every file under Documents (dive photos, gear attachments) — kept on
// the developer's Mac through the Metro dev server (scripts/dev-backup/server.cjs), so deleting and
// reinstalling the app never loses it. Development builds only: release builds have no dev server.
//
// A backup uploads only the files the Mac doesn't have yet, then its manifest (storage + file list);
// a manifest is saved only once all its files are there, so an interrupted backup is never a broken one.
// Restoring takes a safety backup of the current state first, replaces storage and managed files, and
// rewrites photo links for the reinstalled app's new Documents folder.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { AppState, DevSettings, Platform } from 'react-native';

const PREFIX = '/__dmz-backup';
const STATE_KEY = '@dmz-scuba/dev-backup/state-v1'; // bookkeeping only; never backed up or restored
const SNAPSHOT_PREFIX = '@dmz-scuba/dive-log/snapshot-v1/'; // in-app logbook snapshots: redundant here
const AUTO_EVERY_MS = 15 * 60 * 1000;
const UPLOADS_AT_ONCE = 3;

export const devBackupsAvailable = () => typeof __DEV__ !== 'undefined' && __DEV__ && Platform.OS !== 'web';

// The dev server this build loaded its JavaScript from (LAN address or tunnel), with no trailing slash.
export function devServerOrigin() {
  if (!devBackupsAvailable()) return null;
  try {
    // eslint-disable-next-line global-require
    const getDevServer = require('react-native/Libraries/Core/Devtools/getDevServer').default;
    const { url, bundleLoadedFromServer } = getDevServer();
    if (bundleLoadedFromServer && /^https?:\/\//.test(url)) return url.replace(/\/+$/, '');
  } catch { /* fall through */ }
  return null;
}

// FNV-1a, 32-bit, twice with different seeds: a short, stable, filename-safe fingerprint.
export function fingerprint(text) {
  const run = (seed) => {
    let hash = seed >>> 0;
    for (let i = 0; i < text.length; i += 1) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619) >>> 0; }
    return hash.toString(36);
  };
  return `${run(2166136261)}${run(3735928559)}`;
}

// A file's identity on the Mac: the same path, size and modification time is the same file.
export const fileKey = ({ path, size, modified }) => `${Math.round(size || 0)}-${Math.round((modified || 0) * 1000)}-${fingerprint(path)}`.toLowerCase();

// A reinstalled app gets a new Documents folder (iOS changes the container id): point saved links at it.
export function rewriteDocumentPaths(value, fromDirectory, toDirectory) {
  if (typeof value !== 'string' || !fromDirectory || !toDirectory || fromDirectory === toDirectory) return value;
  const bare = (uri) => uri.replace(/^file:\/\//, '');
  return value.split(fromDirectory).join(toDirectory).split(bare(fromDirectory)).join(bare(toDirectory));
}

export function summarize(storage, files) {
  const parse = (key) => { try { return JSON.parse(storage[key] || 'null'); } catch { return null; } };
  const index = parse('@dmz-scuba/dive-log/index-v2');
  const gear = parse('@dmz-scuba/gear-checklist/v1');
  return {
    dives: Array.isArray(index) ? index.filter((row) => !row?.deletedAt).length : 0,
    gear: Array.isArray(gear?.items) ? gear.items.length : 0,
    setups: Array.isArray(gear?.setups) ? gear.setups.length : 0,
    photos: files.filter((file) => file.path.startsWith('dive-photos/')).length,
    files: files.length,
  };
}

// A dev server started before backups existed answers every unknown address with the app manifest
// (200 OK) — so every reply is checked for what the backup server really sends.
const RESTART = 'The development server running now was started before backups were added. Restart it (Ctrl+C, then start it again) and reopen the app.';
async function request(path, options = {}, expect = () => true) {
  const origin = devServerOrigin();
  if (!origin) throw new Error('Backups need the development server (Metro) — start it and open the app from it.');
  const response = await fetch(`${origin}${PREFIX}${path}`, options);
  const text = await response.text();
  let body = null;
  try { body = JSON.parse(text); } catch { /* not the backup server */ }
  if (!body || typeof body !== 'object' || body.manifestVersion != null || body.runtimeVersion != null || body.launchAsset) throw new Error(RESTART);
  if (!response.ok) throw new Error(body.error || `Backup server error ${response.status}`);
  if (!expect(body)) throw new Error(RESTART);
  return body;
}

export async function devBackupStatus() {
  try { return { reachable: true, ...(await request('/ping', {}, (body) => body.ok === true && typeof body.dir === 'string')) }; }
  catch (error) { return { reachable: false, error: error.message }; }
}

export const listDevBackups = async () => (await request('/backups', {}, (body) => Array.isArray(body.backups))).backups;

async function walk(directory, relative = '') {
  const out = [];
  let names = [];
  try { names = await FileSystem.readDirectoryAsync(`${directory}${relative}`); } catch { return out; }
  for (const name of names) {
    if (name.startsWith('.')) continue;
    const path = `${relative}${name}`;
    // eslint-disable-next-line no-await-in-loop
    const info = await FileSystem.getInfoAsync(`${directory}${path}`);
    if (!info.exists) continue;
    // eslint-disable-next-line no-await-in-loop
    if (info.isDirectory) out.push(...await walk(directory, `${path}/`));
    else out.push({ path, size: info.size || 0, modified: info.modificationTime || 0 });
  }
  return out;
}

async function collect() {
  const keys = ((await AsyncStorage.getAllKeys()) || []).filter((key) => key !== STATE_KEY && !key.startsWith(SNAPSHOT_PREFIX));
  const storage = {};
  for (let i = 0; i < keys.length; i += 50) {
    // eslint-disable-next-line no-await-in-loop
    for (const [key, value] of await AsyncStorage.multiGet(keys.slice(i, i + 50))) if (value != null) storage[key] = value;
  }
  const directory = FileSystem.documentDirectory;
  const files = directory ? (await walk(directory)).map((file) => ({ ...file, key: fileKey(file) })) : [];
  return { storage, files, directory };
}

async function readState() {
  try { return JSON.parse((await AsyncStorage.getItem(STATE_KEY)) || '{}'); } catch { return {}; }
}

let running = null;
/** Back everything up to the Mac. `reason`: 'manual' | 'automatic' | 'before-restore'. */
export function backupNow(reason = 'manual', { onProgress } = {}) {
  if (running) return running;
  running = (async () => {
    const origin = devServerOrigin();
    if (!origin) throw new Error('Backups need the development server (Metro) — start it and open the app from it.');
    const { storage, files, directory } = await collect();
    const counts = summarize(storage, files);
    const state = await readState();
    const print = fingerprint(JSON.stringify([Object.keys(storage).sort().map((key) => [key, storage[key].length, fingerprint(storage[key])]), files.map((file) => file.key).sort()]));
    if (reason === 'automatic') {
      // Nothing to keep yet (a fresh install), or nothing changed since the last backup.
      if (!counts.dives && !counts.gear && !counts.files && Object.keys(storage).length < 3) return { skipped: 'empty' };
      if (state.fingerprint === print) return { skipped: 'unchanged' };
    }
    const { missing } = await request('/missing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keys: files.map((file) => file.key) }) },
      (body) => Array.isArray(body.missing));
    const queue = files.filter((file) => missing.includes(file.key));
    let sent = 0;
    const worker = async () => {
      while (queue.length) {
        const file = queue.shift();
        // eslint-disable-next-line no-await-in-loop
        const result = await FileSystem.uploadAsync(`${origin}${PREFIX}/files/${file.key}`, `${directory}${file.path}`, {
          httpMethod: 'PUT', uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT, headers: { 'Content-Type': 'application/octet-stream' },
        });
        if (result.status !== 200) throw new Error(`Couldn't upload ${file.path} (${result.status}).`);
        sent += 1;
        onProgress?.({ sent, total: missing.length });
      }
    };
    await Promise.all(Array.from({ length: UPLOADS_AT_ONCE }, worker));
    const createdAt = new Date().toISOString();
    const id = `${createdAt.replace(/[:.]/g, '-').replace(/Z$/, '')}-${reason}-${Math.random().toString(36).slice(2, 6)}`.replace(/[^0-9A-Za-z-]/g, '-');
    const manifest = { version: 1, id, createdAt, reason, device: `${Platform.OS} ${Platform.Version}`, documentDirectory: directory, counts,
      storage, files: files.map(({ path, size, modified, key }) => ({ path, size, modified, key })) };
    const saved = await request(`/backups/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(manifest) }, (body) => body.ok === true);
    await AsyncStorage.setItem(STATE_KEY, JSON.stringify({ lastBackupAt: createdAt, fingerprint: print }));
    return { ...saved, uploaded: sent };
  })().finally(() => { running = null; });
  return running;
}

/** Replace the app's data with a backup from the Mac, after backing up what's here now. */
export async function restoreDevBackup(id, { onProgress } = {}) {
  const origin = devServerOrigin();
  if (!origin) throw new Error('Restoring needs the development server (Metro).');
  const manifest = await request(`/backups/${encodeURIComponent(id)}`, {}, (body) => body.version === 1 && body.storage && Array.isArray(body.files));
  // Keep what's on the phone now, unless there is nothing (a fresh install).
  const current = await collect();
  const counts = summarize(current.storage, current.files);
  if (counts.dives || counts.gear || counts.files || Object.keys(current.storage).length > 3) await backupNow('before-restore');

  const directory = FileSystem.documentDirectory;
  // Files first, so a failure leaves the current data in place.
  const managedRoots = [...new Set([...manifest.files, ...current.files].map((file) => file.path.split('/')[0]))];
  const staging = `${FileSystem.cacheDirectory}dev-restore-${Date.now()}/`;
  let done = 0;
  for (const file of manifest.files) {
    const target = `${staging}${file.path}`;
    // eslint-disable-next-line no-await-in-loop
    await FileSystem.makeDirectoryAsync(target.slice(0, target.lastIndexOf('/') + 1), { intermediates: true });
    // eslint-disable-next-line no-await-in-loop
    const result = await FileSystem.downloadAsync(`${origin}${PREFIX}/files/${file.key}`, target);
    if (result.status !== 200) throw new Error(`Couldn't download ${file.path} (${result.status}).`);
    done += 1;
    onProgress?.({ done, total: manifest.files.length });
  }
  for (const root of managedRoots) {
    // eslint-disable-next-line no-await-in-loop
    await FileSystem.deleteAsync(`${directory}${root}`, { idempotent: true });
  }
  for (const root of [...new Set(manifest.files.map((file) => file.path.split('/')[0]))]) {
    // eslint-disable-next-line no-await-in-loop
    await FileSystem.moveAsync({ from: `${staging}${root}`, to: `${directory}${root}` });
  }
  await FileSystem.deleteAsync(staging, { idempotent: true });

  const keep = await AsyncStorage.getItem(STATE_KEY);
  const oldKeys = ((await AsyncStorage.getAllKeys()) || []).filter((key) => key !== STATE_KEY);
  await AsyncStorage.multiRemove(oldKeys);
  const pairs = Object.entries(manifest.storage).map(([key, value]) => [key, rewriteDocumentPaths(value, manifest.documentDirectory, directory)]);
  for (let i = 0; i < pairs.length; i += 50) {
    // eslint-disable-next-line no-await-in-loop
    await AsyncStorage.multiSet(pairs.slice(i, i + 50));
  }
  if (keep) await AsyncStorage.setItem(STATE_KEY, keep);
  return { restored: manifest.counts || {}, createdAt: manifest.createdAt };
}

// Reload so every screen reads the restored data.
export const reloadApp = () => DevSettings.reload();

let started = false;
/** Back up automatically: shortly after launch and when the app goes to the background (at most every 15 min). */
export function startDevAutoBackup() {
  if (started || !devBackupsAvailable()) return () => {};
  started = true;
  const maybeBackup = async () => {
    if (!devServerOrigin()) return;
    const { lastBackupAt } = await readState();
    if (lastBackupAt && Date.now() - Date.parse(lastBackupAt) < AUTO_EVERY_MS) return;
    await backupNow('automatic').catch(() => {}); // the dev server may be stopped: try again next time
  };
  const timer = setTimeout(maybeBackup, 20000);
  const subscription = AppState.addEventListener('change', (next) => { if (next === 'background') maybeBackup(); });
  return () => { clearTimeout(timer); subscription.remove(); started = false; };
}
