// A single-file, portable backup of every AsyncStorage value and every file in Documents.
// The archive is intentionally unencrypted: it is a developer handoff format, saved wherever the
// user chooses in Files. Authentication tokens remain in SecureStore and are never included.
//
// Layout (all integer fields are unsigned, big-endian):
//   "DMZSCUBA-BACKUP\n" | manifest byte length (4 bytes) | UTF-8 manifest | raw files in manifest order
//
// File payloads are copied in chunks through Expo FileSystem handles so photos and PDFs are never
// converted to base64 or assembled into one enormous JavaScript string.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as DocumentPicker from 'expo-document-picker';
import { File, FileMode, Paths } from 'expo-file-system';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { syncAccountData } from './accountDataSync';

export const PORTABLE_BACKUP_FORMAT = 'dmz-scuba-portable-backup';
export const PORTABLE_BACKUP_VERSION = 1;

const MAGIC = new TextEncoder().encode('DMZSCUBA-BACKUP\n');
const LENGTH_BYTES = 4;
const CHUNK_BYTES = 512 * 1024;
const MAX_MANIFEST_BYTES = 512 * 1024 * 1024;
const DEV_BACKUP_STATE_KEY = '@dmz-scuba/dev-backup/state-v1';

const pauseForUi = () => new Promise((resolve) => setTimeout(resolve, 0));

function uint32Bytes(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) throw new Error('The backup index is too large.');
  return Uint8Array.of((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
}

function readUint32(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length !== LENGTH_BYTES) throw new Error('The backup header is incomplete.');
  return ((bytes[0] * 0x1000000) + (bytes[1] << 16) + (bytes[2] << 8) + bytes[3]) >>> 0;
}

function bytesEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function validBackupPath(value) {
  if (typeof value !== 'string' || !value || value.length > 1024 || value.includes('\\') || value.includes('\0')) return false;
  if (value.startsWith('/') || value.endsWith('/')) return false;
  const parts = value.split('/');
  return parts.every((part) => part && part !== '.' && part !== '..');
}

export function rewritePortableDocumentPaths(value, fromDirectory, toDirectory) {
  if (typeof value !== 'string' || !fromDirectory || !toDirectory || fromDirectory === toDirectory) return value;
  const bare = (uri) => uri.replace(/^file:\/\//, '');
  return value.split(fromDirectory).join(toDirectory).split(bare(fromDirectory)).join(bare(toDirectory));
}

function parse(storage, key) {
  try { return JSON.parse(storage[key] || 'null'); } catch { return null; }
}

export function summarizePortableBackup(storage, files) {
  const index = parse(storage, '@dmz-scuba/dive-log/index-v2');
  const gear = parse(storage, '@dmz-scuba/gear-checklist/v1');
  return {
    dives: Array.isArray(index) ? index.filter((row) => !row?.deletedAt).length : 0,
    gear: Array.isArray(gear?.items) ? gear.items.length : 0,
    setups: Array.isArray(gear?.setups) ? gear.setups.length : 0,
    photos: files.filter((file) => file.path.startsWith('dive-photos/')).length,
    files: files.length,
    bytes: files.reduce((sum, file) => sum + file.size, 0),
    storageKeys: Object.keys(storage).length,
  };
}

async function walk(directory, relative = '') {
  const files = [];
  let names = [];
  try { names = await LegacyFileSystem.readDirectoryAsync(`${directory}${relative}`); } catch { return files; }
  for (const name of names) {
    if (name.startsWith('.')) continue;
    const path = `${relative}${name}`;
    // eslint-disable-next-line no-await-in-loop
    const info = await LegacyFileSystem.getInfoAsync(`${directory}${path}`);
    if (!info.exists) continue;
    // eslint-disable-next-line no-await-in-loop
    if (info.isDirectory) files.push(...await walk(directory, `${path}/`));
    else files.push({ path, size: Math.max(0, Math.round(info.size || 0)), modified: info.modificationTime || 0 });
  }
  return files;
}

async function collect() {
  // Pull down any pending account records before freezing the local state. This is a no-op while
  // signed out; cloud-only profile data remains on the account and returns after sign-in.
  await syncAccountData().catch(() => {});
  const keys = ((await AsyncStorage.getAllKeys()) || []).filter((key) => key !== DEV_BACKUP_STATE_KEY);
  const storage = {};
  for (let index = 0; index < keys.length; index += 50) {
    // eslint-disable-next-line no-await-in-loop
    for (const [key, value] of await AsyncStorage.multiGet(keys.slice(index, index + 50))) {
      if (value != null) storage[key] = value;
    }
  }
  const directory = LegacyFileSystem.documentDirectory;
  const files = directory ? await walk(directory) : [];
  return { storage, files, directory };
}

function validateManifest(manifest) {
  if (!manifest || manifest.format !== PORTABLE_BACKUP_FORMAT || manifest.version !== PORTABLE_BACKUP_VERSION) {
    throw new Error('This is not a supported DMZ Scuba complete backup.');
  }
  if (!manifest.storage || Array.isArray(manifest.storage) || typeof manifest.storage !== 'object') {
    throw new Error('The backup storage index is invalid.');
  }
  for (const [key, value] of Object.entries(manifest.storage)) {
    if (typeof key !== 'string' || typeof value !== 'string') throw new Error('The backup contains an invalid app record.');
  }
  if (!Array.isArray(manifest.files)) throw new Error('The backup file index is missing.');
  const paths = new Set();
  for (const entry of manifest.files) {
    if (!validBackupPath(entry?.path) || entry.path.startsWith('.') || paths.has(entry.path)) throw new Error('The backup contains an unsafe or duplicate file path.');
    if (!Number.isSafeInteger(entry.size) || entry.size < 0) throw new Error(`The backup contains an invalid file size for ${entry.path}.`);
    paths.add(entry.path);
  }
  return manifest;
}

function backupFilename(createdAt) {
  const stamp = createdAt.replace(/[:.]/g, '-');
  return `DMZ-Scuba-${stamp}.dmzbackup`;
}

function openArchive(uri) {
  const archive = new File(uri);
  if (!archive.exists || !Number.isFinite(archive.size)) throw new Error('The selected backup file cannot be read.');
  const handle = archive.open(FileMode.ReadOnly);
  try {
    if (!bytesEqual(handle.readBytes(MAGIC.length), MAGIC)) throw new Error('This is not a DMZ Scuba complete backup.');
    const manifestLength = readUint32(handle.readBytes(LENGTH_BYTES));
    if (!manifestLength || manifestLength > MAX_MANIFEST_BYTES) throw new Error('The backup index is missing or too large.');
    const manifestBytes = handle.readBytes(manifestLength);
    if (manifestBytes.length !== manifestLength) throw new Error('The backup index is incomplete.');
    let manifest;
    try { manifest = JSON.parse(new TextDecoder().decode(manifestBytes)); }
    catch { throw new Error('The backup index is damaged.'); }
    validateManifest(manifest);
    const payloadOffset = MAGIC.length + LENGTH_BYTES + manifestLength;
    const payloadBytes = manifest.files.reduce((sum, entry) => sum + entry.size, 0);
    if (!Number.isSafeInteger(payloadBytes) || payloadOffset + payloadBytes !== archive.size) {
      throw new Error('The backup is incomplete or has unexpected data at the end.');
    }
    return { archive, handle, manifest, payloadOffset };
  } catch (error) {
    handle.close();
    throw error;
  }
}

export async function createPortableBackup({ onProgress } = {}) {
  const { storage, files, directory } = await collect();
  const createdAt = new Date().toISOString();
  const counts = summarizePortableBackup(storage, files);
  const manifest = {
    format: PORTABLE_BACKUP_FORMAT,
    version: PORTABLE_BACKUP_VERSION,
    createdAt,
    source: `${Platform.OS} ${Platform.Version}`,
    documentDirectory: directory,
    counts,
    storage,
    files,
  };
  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest));
  if (manifestBytes.length > MAX_MANIFEST_BYTES) throw new Error('The app records are too large for one backup index.');

  const archive = new File(Paths.cache, backupFilename(createdAt));
  archive.create({ overwrite: true, intermediates: true });
  const output = archive.open(FileMode.Truncate);
  try {
    output.writeBytes(MAGIC);
    output.writeBytes(uint32Bytes(manifestBytes.length));
    output.writeBytes(manifestBytes);
    let copied = 0;
    for (const entry of files) {
      const input = new File(`${directory}${entry.path}`).open(FileMode.ReadOnly);
      try {
        let remaining = entry.size;
        while (remaining > 0) {
          const bytes = input.readBytes(Math.min(CHUNK_BYTES, remaining));
          if (!bytes.length) throw new Error(`Could not finish reading ${entry.path}.`);
          output.writeBytes(bytes);
          remaining -= bytes.length;
        }
      } finally { input.close(); }
      copied += 1;
      onProgress?.({ done: copied, total: files.length, path: entry.path });
      // Let progress text paint between large files.
      // eslint-disable-next-line no-await-in-loop
      await pauseForUi();
    }
  } catch (error) {
    output.close();
    archive.delete();
    throw error;
  }
  output.close();
  return { uri: archive.uri, manifest };
}

export async function sharePortableBackup(options = {}) {
  if (!(await Sharing.isAvailableAsync())) throw new Error('The iOS share sheet is unavailable on this device.');
  const result = await createPortableBackup(options);
  await Sharing.shareAsync(result.uri, { UTI: 'public.data', mimeType: 'application/octet-stream', dialogTitle: 'Save complete DMZ Scuba backup' });
  return result.manifest;
}

export async function choosePortableBackup() {
  const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
  if (result.canceled) return null;
  const { handle, manifest } = openArchive(result.assets[0].uri);
  handle.close();
  return { uri: result.assets[0].uri, name: result.assets[0].name, manifest };
}

// Installation is journaled so an interruption (app killed, phone restarted)
// can never leave a mix of old and restored data. The payload is staged and
// validated inside Documents first (iOS may purge the cache directory), then a
// journal file records each phase. Once the swap begins the restore always
// rolls forward: recoverPortableRestore() finishes it on the next launch,
// before any screen or account sync reads app data. Before the swap begins,
// recovery simply discards the staging folder and the current data is untouched.
const RESTORE_WORK = '.dmz-restore/';
const workDirectory = (directory) => `${directory}${RESTORE_WORK}`;

async function readJournal(work) {
  const raw = await LegacyFileSystem.readAsStringAsync(`${work}journal.json`).catch(() => null);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
const writeJournal = (work, journal) => LegacyFileSystem.writeAsStringAsync(`${work}journal.json`, JSON.stringify(journal));

async function finishInstall(directory, journal) {
  const work = workDirectory(directory);
  const incoming = `${work}incoming/`;
  let current = journal;
  if (current.phase === 'files-out') {
    // Remove the current Documents content (everything but the work folder).
    const names = await LegacyFileSystem.readDirectoryAsync(directory).catch(() => []);
    for (const name of names) {
      if (name.startsWith('.')) continue;
      // eslint-disable-next-line no-await-in-loop
      await LegacyFileSystem.deleteAsync(`${directory}${name}`, { idempotent: true });
    }
    current = { ...current, phase: 'files-in' };
    await writeJournal(work, current);
  }
  if (current.phase === 'files-in') {
    // Roots already moved are gone from incoming, so this resumes cleanly.
    const roots = await LegacyFileSystem.readDirectoryAsync(incoming).catch(() => []);
    for (const root of roots) {
      // eslint-disable-next-line no-await-in-loop
      await LegacyFileSystem.deleteAsync(`${directory}${root}`, { idempotent: true });
      // eslint-disable-next-line no-await-in-loop
      await LegacyFileSystem.moveAsync({ from: `${incoming}${root}`, to: `${directory}${root}` });
    }
    current = { ...current, phase: 'storage' };
    await writeJournal(work, current);
  }
  if (current.phase === 'storage') {
    // Clearing and rewriting every record is idempotent, so a repeat is safe.
    const pairs = JSON.parse(await LegacyFileSystem.readAsStringAsync(`${work}storage.json`));
    const oldKeys = await AsyncStorage.getAllKeys();
    if (oldKeys.length) await AsyncStorage.multiRemove(oldKeys);
    for (let index = 0; index < pairs.length; index += 50) {
      // eslint-disable-next-line no-await-in-loop
      await AsyncStorage.multiSet(pairs.slice(index, index + 50));
    }
  }
  await LegacyFileSystem.deleteAsync(work, { idempotent: true }).catch(() => {});
  return current.result || null;
}

// Call once at launch, before anything reads app data. Returns the restore's
// counts when an interrupted restore was completed, otherwise null.
export async function recoverPortableRestore() {
  const directory = LegacyFileSystem.documentDirectory;
  if (!directory) return null;
  const work = workDirectory(directory);
  const journal = await readJournal(work);
  if (!journal || !['files-out', 'files-in', 'storage'].includes(journal.phase)) {
    await LegacyFileSystem.deleteAsync(work, { idempotent: true }).catch(() => {});
    return null;
  }
  return finishInstall(directory, journal);
}

export async function restorePortableBackup(uri, { onProgress } = {}) {
  const { handle, manifest, payloadOffset } = openArchive(uri);
  const directory = LegacyFileSystem.documentDirectory;
  if (!directory) { handle.close(); throw new Error('The app Documents directory is unavailable.'); }
  const work = workDirectory(directory);
  const incoming = `${work}incoming/`;
  await LegacyFileSystem.deleteAsync(work, { idempotent: true }).catch(() => {});
  handle.offset = payloadOffset;
  let restored = 0;
  try {
    // Fully materialize and validate the payload before touching current app data.
    for (const entry of manifest.files) {
      const targetUri = `${incoming}${entry.path}`;
      // eslint-disable-next-line no-await-in-loop
      await LegacyFileSystem.makeDirectoryAsync(targetUri.slice(0, targetUri.lastIndexOf('/') + 1), { intermediates: true });
      const targetFile = new File(targetUri);
      targetFile.create({ overwrite: true, intermediates: true });
      const output = targetFile.open(FileMode.Truncate);
      try {
        let remaining = entry.size;
        while (remaining > 0) {
          const bytes = handle.readBytes(Math.min(CHUNK_BYTES, remaining));
          if (!bytes.length) throw new Error(`The backup ended while restoring ${entry.path}.`);
          output.writeBytes(bytes);
          remaining -= bytes.length;
        }
      } finally { output.close(); }
      restored += 1;
      onProgress?.({ done: restored, total: manifest.files.length, path: entry.path, phase: 'staging' });
      // eslint-disable-next-line no-await-in-loop
      await pauseForUi();
    }
    const pairs = Object.entries(manifest.storage).map(([key, value]) => [
      key,
      rewritePortableDocumentPaths(value, manifest.documentDirectory, directory),
    ]);
    await LegacyFileSystem.writeAsStringAsync(`${work}storage.json`, JSON.stringify(pairs));
  } catch (error) {
    handle.close();
    await LegacyFileSystem.deleteAsync(work, { idempotent: true }).catch(() => {});
    throw error;
  }
  handle.close();

  // From here the restore is committed and will complete even if interrupted.
  const result = { ...manifest.counts, createdAt: manifest.createdAt };
  const journal = { phase: 'files-out', result };
  await writeJournal(work, journal);
  return finishInstall(directory, journal);
}

export const portableBackupDescription = (counts = {}) => [
  `${counts.dives || 0} dives`,
  `${counts.gear || 0} gear items`,
  `${counts.photos || 0} photos`,
  `${counts.files || 0} files`,
].join(' · ');

