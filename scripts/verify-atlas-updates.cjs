const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { loadSourceModule } = require('./lib/load-source-module.cjs');
const root = path.resolve(__dirname, '../src');
const load = name => loadSourceModule(path.join(root, 'features/oceanAtlas', name), root);
const datasets = load('datasets.js');
const contract = load('updateContract.js');
const { createAtlasUpdater } = load('updateEngine.js');
const document = load('document.js');
const catalog = load('catalog.js');
const species = load('species.js');
const seasons = load('seasons.js');
const journey = load('journey.js');
const { searchDiveSites } = loadSourceModule(path.join(root, 'features/planner/siteSearch.js'), root);
const { buildAtlasRelease } = require('./build-atlas-release.cjs');
const sha = text => crypto.createHash('sha256').update(text).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));

function release(data, date = '2026-10-06T20:00:00Z') {
  const files = {}, bodies = new Map();
  for (const key of contract.ATLAS_DATASET_KEYS) {
    const text = `${JSON.stringify(data[key])}\n`, sha256 = sha(text);
    const file = { path: `${contract.ATLAS_BASE_PATH}/files/${key}-${sha256}.json`, sha256, bytes: Buffer.byteLength(text) };
    files[key] = file; bodies.set(file.path, text);
  }
  const manifest = { schemaVersion: 1, version: sha(contract.ATLAS_DATASET_KEYS.map(key => `${key}:${files[key].sha256}`).join('\n')), publishedAt: date, files };
  return { manifest, bodies };
}

function harness() {
  const files = new Map(), requests = [], activations = [];
  let state = null, server = release(datasets.BUNDLED_ATLAS_DATA), fail = null, pointerFailure = false;
  const storage = {
    readState: async () => clone(state),
    writeState: async value => { if (pointerFailure) throw new Error('Storage full'); state = clone(value); },
    readFile: async name => files.get(name) ?? null,
    writeFile: async (name, text) => files.set(name, text),
    prune: async keep => { for (const name of files.keys()) if (!keep.has(name)) files.delete(name); },
  };
  const fetchText = async url => {
    const route = new URL(url).pathname; requests.push(route);
    if (fail?.(route)) throw new Error('Website unreachable');
    return route.endsWith('/manifest.json') ? JSON.stringify(server.manifest) : server.bodies.get(route);
  };
  const make = () => createAtlasUpdater({ storage, fetchText, digest: async text => sha(text), baseUrl: 'https://atlas.example', activate: data => activations.push(data) });
  return { files, requests, activations, make, state: () => clone(state), server: value => { server = value; }, fail: value => { fail = value; }, pointerFailure: value => { pointerFailure = value; } };
}

(async () => {
  contract.validateAtlasDatasets(datasets.BUNDLED_ATLAS_DATA);
  assert.equal(contract.utf8Bytes('reef 🐠 café \ud800'), Buffer.byteLength('reef 🐠 café \ud800'));
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dmz-atlas-release-test-'));
  try {
    const first = buildAtlasRelease(temp);
    assert.equal(buildAtlasRelease(temp).publishedAt, first.publishedAt, 'Identical release builds retain their publication date.');
    for (const file of Object.values(first.files)) {
      const content = fs.readFileSync(path.join(temp, file.path), 'utf8');
      assert.equal(Buffer.byteLength(content), file.bytes); assert.equal(sha(content), file.sha256);
    }
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }

  const h = harness(), updater = h.make();
  h.fail(() => true);
  assert.equal((await updater.checkForUpdates()).source, 'bundled', 'First offline launch retains bundled data.');
  assert.equal(h.state(), null); assert.equal(h.activations.length, 0);
  h.fail(null); h.requests.length = 0;
  const one = updater.checkForUpdates(), two = updater.checkForUpdates();
  assert.equal(one, two, 'Concurrent reconnect/open checks share one transaction.');
  assert.equal((await one).phase, 'current');
  assert.equal(h.requests.length, 25); assert.equal(h.activations.length, 1);
  const firstState = h.state();
  h.requests.length = 0;
  await updater.checkForUpdates();
  assert.equal(h.requests.length, 1, 'An unchanged release downloads only the small manifest.');
  assert.equal(h.activations.length, 1, 'Unchanged data does not reset the map.');
  h.fail(() => true);
  const offline = h.make();
  assert.equal((await offline.initialize()).version, firstState.active.version, 'A restarted app restores its saved release with no network.');
  assert.equal((await offline.checkForUpdates()).source, 'saved');

  const changed = clone(datasets.BUNDLED_ATLAS_DATA);
  const factId = Object.keys(changed.siteFacts.facts)[0];
  changed.siteFacts.facts[factId][0] = 'Updated site description';
  const next = release(changed, '2026-10-07T20:00:00Z');
  h.server(next); h.fail(route => !route.endsWith('manifest.json'));
  await updater.checkForUpdates();
  assert.deepEqual(h.state(), firstState, 'Interrupted downloads cannot replace the active pointer.');
  h.fail(null);
  const factPath = next.manifest.files.siteFacts.path;
  next.bodies.set(factPath, 'corrupt');
  await updater.checkForUpdates();
  assert.deepEqual(h.state(), firstState, 'Corrupt downloads leave the working snapshot intact.');
  next.bodies.set(factPath, `${JSON.stringify(changed.siteFacts)}\n`);
  h.pointerFailure(true);
  await updater.checkForUpdates();
  assert.deepEqual(h.state(), firstState, 'Storage failure cannot activate uncommitted data.');
  h.pointerFailure(false); h.requests.length = 0;
  await updater.checkForUpdates();
  assert.equal(h.requests.length, 2, 'Only the changed dataset is downloaded.');
  assert.equal(h.state().previous.version, firstState.active.version, 'A verified previous release is retained for rollback.');
  assert.equal(h.activations.at(-1).siteFacts.facts[factId][0], 'Updated site description');

  // On-disk corruption after a successful update falls back to the previous release.
  h.files.set(`siteFacts-${next.manifest.files.siteFacts.sha256}.json`, 'broken on disk');
  assert.equal((await h.make().initialize()).version, firstState.active.version);
  const beforeBad = h.state();
  for (const mutate of [
    m => { delete m.files.sites; },
    m => { m.schemaVersion = 2; },
    m => { m.files.sites.path = '/api/account'; },
    m => { m.files.sites.bytes = contract.MAX_ATLAS_FILE_BYTES + 1; },
    m => { m.version = '0'.repeat(64); },
  ]) {
    const invalid = release(changed); mutate(invalid.manifest); h.server(invalid);
    assert.equal((await updater.checkForUpdates()).phase, 'unavailable');
    assert.deepEqual(h.state(), beforeBad);
  }
  const malformed = clone(changed); malformed.temperature.packedMonths = ['x'];
  h.server(release(malformed));
  assert.equal((await updater.checkForUpdates()).phase, 'unavailable');
  assert.deepEqual(h.state(), beforeBad, 'Valid file checksums do not bypass dataset validation.');

  // Warm native caches, then replace the snapshot. Pins and every guide must use new data.
  catalog.catalogSites(); species.speciesIndex(); seasons.temperatureProfile({ latitude: 20, longitude: -80 });
  journey.nearestAirports({ latitude: 0, longitude: 0 }); searchDiveSites('Palancar');
  const added = { id: 'update-test-reef', name: 'Update Test Reef', latitude: 20, longitude: -80, maxDepthMeters: 18, country: 'Mexico' };
  changed.curatedSites.push(added);
  const taxonId = Object.keys(changed.marineLife.taxa)[0];
  changed.marineLife.taxa[taxonId][0] = 'Updated animal name';
  changed.airports.airports.push(['ZZZ', 'Update Test Airport', 'Test town', 'MX', 20, -80, 1, 15]);
  datasets.activateAtlasDatasets(changed);
  assert.equal(catalog.catalogSite(added.id).name, added.name);
  assert.ok(document.buildAtlasData().sites.some(site => site.id === added.id));
  assert.ok(searchDiveSites('Update Test Reef').some(site => site.id === added.id));
  assert.equal(species.speciesIndex().find(row => row[0] === taxonId)?.[1], 'Updated animal name');
  assert.equal(journey.nearestAirports(added, 1)[0].code, 'ZZZ');

  // Native startup works with payloads larger than the old 2 MiB inline budget.
  changed.curatedSites.push({ ...added, id: 'large-test', name: '</script>🐠'.repeat(100000) });
  datasets.activateAtlasDatasets(changed);
  const shell = document.buildAtlasDocument({ deferredData: true });
  assert.ok(Buffer.byteLength(shell) < 512 * 1024, 'Native shell stays small regardless of data size.');
  const scripts = document.atlasBootstrapScripts();
  assert.ok(Buffer.byteLength(JSON.stringify(document.buildAtlasData())) > 2 * 1024 * 1024);
  assert.ok(scripts.every(script => Buffer.byteLength(script) < 64 * 1024), 'Every actual bridge script is bounded, including Unicode and escaping.');
  const messages = [], started = [];
  const sandbox = vm.createContext({ window: { ReactNativeWebView: { postMessage: text => messages.push(JSON.parse(text)) } }, atlasRuntime: data => started.push(data), temperatureAt() {}, regionAt() {}, inBounds() {}, oceanRegionAt() {}, seasonStatus() {}, expandTemperature() {} });
  vm.runInContext(document.atlasBootstrapSource, sandbox);
  assert.equal(messages.at(-1).index, 0);
  vm.runInContext(scripts[1], sandbox);
  assert.equal(messages.length, 1, 'Out-of-order chunks are ignored.');
  for (let i = 0; i < scripts.length; i++) {
    assert.equal(messages.at(-1).index, i);
    vm.runInContext(scripts[i], sandbox);
  }
  assert.equal(started.length, 1); assert.equal(started[0].sites.at(-1).name, changed.curatedSites.at(-1).name);
  vm.runInContext(scripts.at(-1), sandbox); assert.equal(started.length, 1, 'Duplicate chunks never boot a second map.');
  datasets.activateAtlasDatasets(datasets.BUNDLED_ATLAS_DATA);
  console.log(`Atlas update checks passed: offline startup, reconnect, unchanged/changed downloads, corruption, interruption, storage failure, rollback, schema compatibility, native/search cache refresh and ${scripts.length} bounded startup chunks for a >2 MiB payload.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
