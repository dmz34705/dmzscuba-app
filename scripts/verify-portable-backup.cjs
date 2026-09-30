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
  multiSet: async (pairs) => { for (const [key, value] of pairs) phone.storage.set(key, value); },
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
  deleteAsync: async (uri) => {
    for (const key of [...phone.files.keys()]) if (key === uri || key.startsWith(uri.endsWith('/') ? uri : `${uri}/`)) phone.files.delete(key);
  },
  moveAsync: async ({ from, to }) => {
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

    const created = await backup.createPortableBackup();
    assert.equal(created.manifest.counts.dives, 1);
    assert.equal(created.manifest.counts.files, 2);
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

    console.log('Portable backup checks passed: one streamed archive, validation, complete restore, and iOS path rewrite.');
  } finally {
    Module._load = originalLoad;
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });

