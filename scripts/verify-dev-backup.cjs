// Development backups end to end: a real backup server (as Metro mounts it) and the app module with an
// in-memory phone — storage, Documents folder and the dev-server address stubbed. Backs up, "deletes and
// reinstalls" the app (new Documents path, empty storage), restores, and checks every record and photo.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const Module = require('node:module');
const { loadSourceModule } = require('./lib/load-source-module.cjs');

const backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dmz-dev-backup-test-'));
process.env.DMZ_BACKUP_DIR = backupDir;
const { withDevBackups } = require('./dev-backup/server.cjs');

(async () => {
  const server = http.createServer(withDevBackups((req, res) => { res.statusCode = 200; res.end('metro'); }));
  await new Promise((resolve) => server.listen(0, resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;

  // In-memory phone.
  const phone = { storage: new Map(), files: new Map(), documents: 'file:///var/mobile/Containers/Data/Application/AAAA/Documents/', cache: 'file:///tmp/cache/' };
  const storage = {
    getAllKeys: async () => [...phone.storage.keys()],
    multiGet: async (keys) => keys.map((key) => [key, phone.storage.has(key) ? phone.storage.get(key) : null]),
    getItem: async (key) => (phone.storage.has(key) ? phone.storage.get(key) : null),
    setItem: async (key, value) => { phone.storage.set(key, value); },
    multiSet: async (pairs) => { for (const [key, value] of pairs) phone.storage.set(key, value); },
    multiRemove: async (keys) => { for (const key of keys) phone.storage.delete(key); },
  };
  const under = (dir) => [...phone.files.keys()].filter((uri) => uri.startsWith(dir));
  const fileSystem = {
    get documentDirectory() { return phone.documents; },
    get cacheDirectory() { return phone.cache; },
    FileSystemUploadType: { BINARY_CONTENT: 0 },
    readDirectoryAsync: async (dir) => [...new Set(under(dir).map((uri) => uri.slice(dir.length).split('/')[0]))],
    getInfoAsync: async (uri) => {
      if (phone.files.has(uri)) return { exists: true, isDirectory: false, size: phone.files.get(uri).length, modificationTime: 1700000000 + phone.files.get(uri).length };
      return under(uri.endsWith('/') ? uri : `${uri}/`).length ? { exists: true, isDirectory: true } : { exists: false };
    },
    makeDirectoryAsync: async () => {},
    deleteAsync: async (uri) => { for (const key of [...phone.files.keys()]) if (key === uri || key.startsWith(uri.endsWith('/') ? uri : `${uri}/`)) phone.files.delete(key); },
    moveAsync: async ({ from, to }) => { for (const key of under(`${from}/`)) { phone.files.set(`${to}/${key.slice(from.length + 1)}`, phone.files.get(key)); phone.files.delete(key); } },
    uploadAsync: async (url, uri, options) => {
      const response = await fetch(url, { method: options.httpMethod, body: phone.files.get(uri), headers: options.headers });
      return { status: response.status };
    },
    downloadAsync: async (url, uri) => {
      const response = await fetch(url);
      phone.files.set(uri, Buffer.from(await response.arrayBuffer()));
      return { status: response.status };
    },
  };
  const stubs = {
    '@react-native-async-storage/async-storage': { __esModule: true, default: storage },
    'expo-file-system/legacy': fileSystem,
    'react-native': { AppState: { addEventListener: () => ({ remove() {} }) }, DevSettings: { reload() {} }, Platform: { OS: 'ios', Version: '26.0' } },
    'react-native/Libraries/Core/Devtools/getDevServer': { __esModule: true, default: () => ({ url: `${origin}/`, bundleLoadedFromServer: true }) },
  };
  const originalLoad = Module._load;
  Module._load = function load(request, ...rest) { return stubs[request] || originalLoad.call(this, request, ...rest); };
  global.__DEV__ = true;
  const root = path.resolve(__dirname, '../src');
  const B = loadSourceModule(path.join(root, 'lib/devBackup.js'), root);

  // Pure helpers.
  assert.equal(B.rewriteDocumentPaths('{"uri":"file:///old/Documents/dive-photos/a.jpg","p":"/old/Documents/x"}', 'file:///old/Documents/', 'file:///new/Documents/'),
    '{"uri":"file:///new/Documents/dive-photos/a.jpg","p":"/new/Documents/x"}', 'photo links follow the new Documents folder');
  assert.match(B.fileKey({ path: 'dive-photos/a.jpg', size: 10, modified: 1.5 }), /^10-1500-[0-9a-z]+$/);
  assert.notEqual(B.fileKey({ path: 'a', size: 1, modified: 1 }), B.fileKey({ path: 'b', size: 1, modified: 1 }));

  // A phone with data.
  const photo = `${phone.documents}dive-photos/dive-photo-1.jpg`;
  phone.files.set(photo, Buffer.from('JPEG-BYTES-1'));
  phone.files.set(`${phone.documents}gear-attachments/item-1/manual.pdf`, Buffer.from('PDF'));
  phone.storage.set('@dmz-scuba/dive-log/index-v2', JSON.stringify([{ id: 'd1' }, { id: 'd2' }, { id: 'd3', deletedAt: 'x' }]));
  phone.storage.set('@dmz-scuba/dive-log/dive-v2/d1', JSON.stringify({ id: 'd1', photos: [{ uri: photo }] }));
  phone.storage.set('@dmz-scuba/gear-checklist/v1', JSON.stringify({ items: [{ id: 'g1' }, { id: 'g2' }], setups: [{ id: 's1' }] }));
  phone.storage.set('@dmz-scuba/app-settings-v1', JSON.stringify({ depthUnit: 'ft' }));
  phone.storage.set('@dmz-scuba/dive-log/snapshot-v1/old', 'big redundant snapshot');

  const first = await B.backupNow('manual');
  assert.equal(first.uploaded, 2, 'both files uploaded');
  assert.deepEqual({ dives: first.counts.dives, gear: first.counts.gear, photos: first.counts.photos }, { dives: 2, gear: 2, photos: 1 });
  const again = await B.backupNow('manual');
  assert.equal(again.uploaded, 0, 'unchanged files are not uploaded twice');
  assert.equal((await B.backupNow('automatic')).skipped, 'unchanged', 'an automatic backup of unchanged data is skipped');
  const [latest] = await B.listDevBackups();
  assert.ok(latest && latest.files === 2 && latest.keys === 4, 'the backup lists its records (without in-app snapshots) and files');

  // Delete and reinstall: empty storage, no files, a new Documents path.
  phone.storage.clear(); phone.files.clear();
  phone.documents = 'file:///var/mobile/Containers/Data/Application/BBBB/Documents/';
  assert.equal((await B.backupNow('automatic')).skipped, 'empty', 'a fresh install does not back up nothing');
  const restored = await B.restoreDevBackup(latest.id);
  assert.equal(restored.restored.dives, 2);
  const newPhoto = `${phone.documents}dive-photos/dive-photo-1.jpg`;
  assert.equal(phone.files.get(newPhoto)?.toString(), 'JPEG-BYTES-1', 'the photo is back, in the new Documents folder');
  assert.equal(phone.files.get(`${phone.documents}gear-attachments/item-1/manual.pdf`)?.toString(), 'PDF');
  assert.equal(JSON.parse(phone.storage.get('@dmz-scuba/dive-log/dive-v2/d1')).photos[0].uri, newPhoto, 'the dive links to the restored photo');
  assert.equal(JSON.parse(phone.storage.get('@dmz-scuba/gear-checklist/v1')).items.length, 2, 'the gear locker is back');
  assert.ok(!phone.storage.has('@dmz-scuba/dive-log/snapshot-v1/old'));

  // Restoring over existing data keeps a copy of it first.
  phone.storage.set('@dmz-scuba/app-settings-v1', JSON.stringify({ depthUnit: 'm' }));
  await B.restoreDevBackup(latest.id);
  const reasons = (await B.listDevBackups()).map((backup) => backup.reason);
  assert.ok(reasons.includes('before-restore'), 'the replaced data was backed up first');
  assert.equal(JSON.parse(phone.storage.get('@dmz-scuba/app-settings-v1')).depthUnit, 'ft');

  // The server refuses a manifest whose files never arrived, and passes other requests to Metro.
  const refused = await fetch(`${origin}/__dmz-backup/backups/2026-01-01-test`, { method: 'POST', body: JSON.stringify({ files: [{ key: 'missing-file-key' }], storage: {} }) });
  assert.equal(refused.status, 409);
  assert.equal(await (await fetch(`${origin}/index.bundle`)).text(), 'metro');

  // Pruning: automatic backups beyond 30 go, with the files only they used; others stay.
  for (let i = 0; i < 32; i += 1) {
    phone.storage.set('@dmz-scuba/app-settings-v1', JSON.stringify({ n: i }));
    // eslint-disable-next-line no-await-in-loop
    await B.backupNow('manual').then(() => {});
  }
  const automaticIds = [];
  for (let i = 0; i < 32; i += 1) {
    const id = `2026-01-01T00-00-${String(i).padStart(2, '0')}-000-automatic`;
    automaticIds.push(id);
    // eslint-disable-next-line no-await-in-loop
    await fetch(`${origin}/__dmz-backup/backups/${id}`, { method: 'POST', body: JSON.stringify({ createdAt: `2026-01-01T00:00:${String(i).padStart(2, '0')}Z`, reason: 'automatic', storage: {}, files: [] }) });
  }
  const all = await B.listDevBackups();
  assert.equal(all.filter((backup) => backup.reason === 'automatic').length, 30, 'only the newest 30 automatic backups are kept');
  assert.ok(all.filter((backup) => backup.reason === 'manual').length >= 30, 'manual backups are never pruned');
  assert.ok(fs.existsSync(path.join(backupDir, 'store')) && fs.readdirSync(path.join(backupDir, 'store')).length === 2, 'each file is stored once');

  // A dev server started before backups existed answers unknown addresses with the app manifest (200 OK):
  // the app must say so, not fail on the reply.
  const oldServer = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/plain'); res.end(JSON.stringify({ id: 'x', runtimeVersion: '1', launchAsset: {} })); });
  await new Promise((resolve) => oldServer.listen(0, resolve));
  stubs['react-native/Libraries/Core/Devtools/getDevServer'].default = () => ({ url: `http://127.0.0.1:${oldServer.address().port}/`, bundleLoadedFromServer: true });
  const status = await B.devBackupStatus();
  assert.ok(!status.reachable && /Restart it/.test(status.error), 'an old dev server is reported as needing a restart');
  await assert.rejects(B.backupNow('manual'), /Restart it/, 'a backup against an old dev server explains what to do');
  oldServer.close();

  server.close();
  Module._load = originalLoad;
  fs.rmSync(backupDir, { recursive: true, force: true });
  console.log('Dev backup checks passed: full backup to the Mac, files uploaded once, unchanged/empty automatic backups skipped, restore after reinstall with new photo paths, safety backup before restore, refused incomplete backups, pruning.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
