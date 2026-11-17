const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const { loadSourceModule } = require('./lib/load-source-module.cjs');

const phone = {
  cache: 'file:///cache/',
  documents: 'file:///documents-old/',
  files: new Map(),
  storage: new Map(),
  pickedUri: '',
  sharedUri: '',
};

const bytes = (value) => value instanceof Uint8Array ? value : new TextEncoder().encode(String(value));
const under = (uri) => [...phone.files.keys()].filter((key) => key.startsWith(uri));

class MemoryHandle {
  constructor(uri) { this.uri = uri; this.offset = 0; this.closed = false; }
  get size() { return this.closed ? null : (phone.files.get(this.uri)?.length || 0); }
  readBytes(length) {
    const value = phone.files.get(this.uri) || new Uint8Array();
    const result = value.slice(this.offset, this.offset + length);
    this.offset += result.length;
    return result;
  }
  writeBytes(value) {
    const current = phone.files.get(this.uri) || new Uint8Array();
    const required = Math.max(current.length, this.offset + value.length);
    const next = new Uint8Array(required);
    next.set(current);
    next.set(value, this.offset);
    phone.files.set(this.uri, next);
    this.offset += value.length;
  }
  close() { this.closed = true; }
}

class MemoryFile {
  constructor(...parts) {
    this.uri = parts.map((part) => typeof part === 'string' ? part : part.uri).join('');
  }
  get exists() { return phone.files.has(this.uri); }
  get size() { return phone.files.get(this.uri)?.length ?? null; }
  create({ overwrite = false } = {}) {
    if (this.exists && !overwrite) throw new Error('exists');
    phone.files.set(this.uri, new Uint8Array());
  }
  open(mode) {
    if (!this.exists) throw new Error(`missing ${this.uri}`);
    if (mode === 'wt') phone.files.set(this.uri, new Uint8Array());
    const handle = new MemoryHandle(this.uri);
    if (mode === 'wa') handle.offset = this.size;
    return handle;
  }
  delete() { phone.files.delete(this.uri); }
}

const storage = {
  getAllKeys: async () => [...phone.storage.keys()],
  multiGet: async (keys) => keys.map((key) => [key, phone.storage.get(key) ?? null]),
  multiSet: async (pairs) => {
    if (phone.failSetAfter != null && phone.failSetAfter-- <= 0) { phone.failSetAfter = null; throw new Error('killed during storage write'); }
    for (const [key, value] of pairs) phone.storage.set(key, value);
  },
  multiRemove: async (keys) => { for (const key of keys) phone.storage.delete(key); },
};

const legacy = {
  get cacheDirectory() { return phone.cache; },
  get documentDirectory() { return phone.documents; },
  readDirectoryAsync: async (dir) => [...new Set(under(dir).map((uri) => uri.slice(dir.length).split('/')[0]).filter(Boolean))],
  getInfoAsync: async (uri) => {
    if (phone.files.has(uri)) return { exists: true, isDirectory: false, size: phone.files.get(uri).length, modificationTime: 123 };
    return { exists: under(uri.endsWith('/') ? uri : `${uri}/`).length > 0, isDirectory: true };
  },
  makeDirectoryAsync: async () => {},
  writeAsStringAsync: async (uri, text) => { phone.files.set(uri, bytes(text)); },
  readAsStringAsync: async (uri) => { if (!phone.files.has(uri)) throw new Error(`missing ${uri}`); return new TextDecoder().decode(phone.files.get(uri)); },
  deleteAsync: async (uri) => {
    for (const key of [...phone.files.keys()]) if (key === uri || key.startsWith(uri.endsWith('/') ? uri : `${uri}/`)) phone.files.delete(key);
  },
  moveAsync: async ({ from, to }) => {
    if (phone.failMoveAfter != null && phone.failMoveAfter-- <= 0) { phone.failMoveAfter = null; throw new Error('killed during move'); }
    const exact = phone.files.get(from);
    if (exact) { phone.files.set(to, exact); phone.files.delete(from); return; }
    const prefix = from.endsWith('/') ? from : `${from}/`;
    for (const key of under(prefix)) {
      phone.files.set(`${to}/${key.slice(prefix.length)}`, phone.files.get(key));
      phone.files.delete(key);
    }
  },
};

const stubs = {
  '@react-native-async-storage/async-storage': { __esModule: true, default: storage },
  'expo-document-picker': { getDocumentAsync: async () => ({ canceled: false, assets: [{ uri: phone.pickedUri, name: 'handoff.dmzbackup' }] }) },
  'expo-file-system': { File: MemoryFile, FileMode: { ReadOnly: 'r', ReadWrite: 'rw', WriteOnly: 'w', Append: 'wa', Truncate: 'wt' }, Paths: { cache: { uri: phone.cache } } },
  'expo-file-system/legacy': legacy,
  'expo-sharing': { isAvailableAsync: async () => true, shareAsync: async (uri) => { phone.sharedUri = uri; } },
  'react-native': { Platform: { OS: 'ios', Version: '26.0' } },
};

const originalLoad = Module._load;
Module._load = function load(request, ...rest) {
  if (request === './accountDataSync') return { syncAccountData: async () => {} };
  return stubs[request] || originalLoad.call(this, request, ...rest);
};

(async () => {
  try {
    const root = path.resolve(__dirname, '../src');
    const backup = loadSourceModule(path.join(root, 'lib/portableBackup.js'), root);

    assert.equal(backup.validBackupPath('dive-photos/photo.jpg'), true);
    for (const invalid of ['', '/absolute', '../escape', 'a/../escape', 'folder/', 'a\\b']) {
      assert.equal(backup.validBackupPath(invalid), false, `reject ${invalid}`);
    }

    const oldPhoto = `${phone.documents}dive-photos/photo.jpg`;
    phone.files.set(oldPhoto, bytes('PHOTO-DATA'));
    phone.files.set(`${phone.documents}gear-attachments/g1/manual.pdf`, bytes('PDF-DATA'));
    phone.storage.set('@dmz-scuba/dive-log/index-v2', JSON.stringify([{ id: 'd1' }]));
    phone.storage.set('@dmz-scuba/dive-log/dive-v2/d1', JSON.stringify({ id: 'd1', photos: [{ uri: oldPhoto }] }));
    phone.storage.set('@dmz-scuba/gear-checklist/v1', JSON.stringify({ items: [{ id: 'g1' }], setups: [] }));
    phone.storage.set('@dmz-scuba/dev-backup/state-v1', 'not portable');
    // Phone-only records (never synced) travel in the backup too: insurance with its document,
    // location history, nitrox analyses and saved sites.
    const oldPolicy = `${phone.documents}insurance-documents/p1/card.pdf`;
    phone.files.set(oldPolicy, bytes('POLICY-PDF'));
    const phoneOnly = {
      '@dmz-scuba/insurance/v1': JSON.stringify({ policies: [{ id: 'p1', provider: 'DAN', documents: [{ uri: oldPolicy }] }] }),
      '@dmz-scuba/location-log-v1': JSON.stringify([{ at: '2026-10-01T10:00:00Z', latitude: 20.5, longitude: -86.9 }]),
      '@dmz-scuba/nitrox-log/v1': JSON.stringify([{ id: 'n1', o2: 32 }]),
      '@dmz-scuba/my-sites/v1': JSON.stringify([{ id: 'my-1', name: 'Home quarry' }]),
    };
    for (const [key, value] of Object.entries(phoneOnly)) phone.storage.set(key, value);

    const created = await backup.createPortableBackup();
    assert.equal(created.manifest.counts.dives, 1);
    assert.equal(created.manifest.counts.files, 3);
    assert.equal(created.manifest.storage['@dmz-scuba/dev-backup/state-v1'], undefined);
    assert.ok(phone.files.get(created.uri).length > 'PHOTO-DATA'.length + 'PDF-DATA'.length);

    const externalArchive = 'file:///picker/handoff.dmzbackup';
    phone.files.set(externalArchive, phone.files.get(created.uri));
    phone.pickedUri = externalArchive;
    const selected = await backup.choosePortableBackup();
    assert.equal(selected.manifest.format, backup.PORTABLE_BACKUP_FORMAT);

    // Simulate a replacement install with a new iOS container and unrelated current state.
    for (const key of [...phone.files.keys()]) if (key.startsWith(phone.documents)) phone.files.delete(key);
    phone.documents = 'file:///documents-new/';
    phone.files.set(`${phone.documents}unrelated.txt`, bytes('remove me'));
    phone.storage.clear();
    phone.storage.set('@dmz-scuba/unrelated', 'remove me');

    const restored = await backup.restorePortableBackup(selected.uri);
    assert.equal(restored.dives, 1);
    const newPhoto = `${phone.documents}dive-photos/photo.jpg`;
    assert.equal(new TextDecoder().decode(phone.files.get(newPhoto)), 'PHOTO-DATA');
    assert.equal(new TextDecoder().decode(phone.files.get(`${phone.documents}gear-attachments/g1/manual.pdf`)), 'PDF-DATA');
    assert.equal(phone.files.has(`${phone.documents}unrelated.txt`), false);
    assert.equal(phone.storage.has('@dmz-scuba/unrelated'), false);
    assert.equal(JSON.parse(phone.storage.get('@dmz-scuba/dive-log/dive-v2/d1')).photos[0].uri, newPhoto);
    const newPolicy = `${phone.documents}insurance-documents/p1/card.pdf`;
    assert.equal(new TextDecoder().decode(phone.files.get(newPolicy)), 'POLICY-PDF', 'the insurance document is restored');
    assert.equal(JSON.parse(phone.storage.get('@dmz-scuba/insurance/v1')).policies[0].documents[0].uri, newPolicy, 'the policy links to the restored document');
    for (const key of ['@dmz-scuba/location-log-v1', '@dmz-scuba/nitrox-log/v1', '@dmz-scuba/my-sites/v1']) {
      assert.equal(phone.storage.get(key), phoneOnly[key], `${key} is restored`);
    }

    assert.equal(under(`${phone.documents}.dmz-restore/`).length, 0, 'The restore work folder is removed after success.');
    assert.equal(await backup.recoverPortableRestore(), null, 'Nothing to recover after a clean restore.');

    // Interruptions: kill the install at each file move and storage batch, relaunch, recover.
    const expectRestored = (label) => {
      assert.equal(new TextDecoder().decode(phone.files.get(newPhoto)), 'PHOTO-DATA', `${label}: photo restored`);
      assert.equal(new TextDecoder().decode(phone.files.get(`${phone.documents}gear-attachments/g1/manual.pdf`)), 'PDF-DATA', `${label}: attachment restored`);
      assert.equal(phone.files.has(`${phone.documents}unrelated.txt`), false, `${label}: old files gone`);
      assert.equal(phone.storage.has('@dmz-scuba/unrelated'), false, `${label}: old records gone`);
      assert.equal(JSON.parse(phone.storage.get('@dmz-scuba/dive-log/dive-v2/d1')).photos[0].uri, newPhoto, `${label}: records point at restored files`);
      assert.equal(under(`${phone.documents}.dmz-restore/`).length, 0, `${label}: work folder cleaned up`);
    };
    const resetCurrent = () => {
      for (const key of [...phone.files.keys()]) if (key.startsWith(phone.documents)) phone.files.delete(key);
      phone.files.set(`${phone.documents}unrelated.txt`, bytes('remove me'));
      phone.storage.clear();
      phone.storage.set('@dmz-scuba/unrelated', 'remove me');
    };
    for (const [label, setup] of [
      ['first move', () => { phone.failMoveAfter = 0; }],
      ['second move', () => { phone.failMoveAfter = 1; }],
      ['storage write', () => { phone.failSetAfter = 0; }],
    ]) {
      resetCurrent(); setup();
      await assert.rejects(backup.restorePortableBackup(selected.uri), /killed/, `${label}: interruption happens`);
      const recovered = await backup.recoverPortableRestore();
      assert.equal(recovered?.dives, 1, `${label}: recovery reports the restored backup`);
      expectRestored(label);
    }

    // A failure while staging leaves the current data untouched and nothing to recover.
    resetCurrent();
    const truncated = 'file:///picker/truncated.dmzbackup';
    const full = phone.files.get(externalArchive);
    phone.files.set(truncated, full.slice(0, full.length - 4));
    await assert.rejects(backup.restorePortableBackup(truncated), /incomplete|ended while restoring/);
    assert.equal(new TextDecoder().decode(phone.files.get(`${phone.documents}unrelated.txt`)), 'remove me', 'Staging failure keeps current files.');
    assert.equal(phone.storage.get('@dmz-scuba/unrelated'), 'remove me', 'Staging failure keeps current records.');
    assert.equal(under(`${phone.documents}.dmz-restore/`).length, 0, 'Staging failure leaves no work folder.');
    assert.equal(await backup.recoverPortableRestore(), null);

    console.log('Portable backup checks passed: one streamed archive, validation, complete restore, iOS path rewrite, and recovery after interruption at each install step.');
  } finally {
    Module._load = originalLoad;
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });

