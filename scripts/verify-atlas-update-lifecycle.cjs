const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const babel = require('@babel/core');

const filename = path.join(__dirname, '../src/features/oceanAtlas/useAtlasUpdates.js');
const { code } = babel.transformSync(fs.readFileSync(filename, 'utf8'), {
  babelrc: false, configFile: false, filename,
  plugins: ['@babel/plugin-transform-modules-commonjs'],
});

async function mount({ linked = false, platform = 'ios' } = {}) {
  let checks = 0, loads = 0, network, foreground, retry, cleanup;
  let unsubscribed = false, appRemoved = false, timerRemoved = false;
  const exports = {};
  const sandbox = {
    exports,
    require(name) {
      if (name === 'react') return { useEffect: effect => { cleanup = effect(); } };
      if (name === 'react-native') return {
        NativeModules: linked ? { RNCNetInfo: {} } : {}, Platform: { OS: platform },
        AppState: { currentState: 'active', addEventListener: (_, listener) => {
          foreground = listener; return { remove: () => { appRemoved = true; } };
        } },
      };
      if (name === '@react-native-community/netinfo') {
        loads++;
        if (!linked && platform !== 'web') throw new Error('NativeModule.RNCNetInfo is null');
        return { __esModule: true, default: { addEventListener: listener => {
          network = listener; return () => { unsubscribed = true; };
        } } };
      }
      if (name === './datasets') return {};
      if (name === './updates') return {
        atlasUpdater: { initialize: async () => {}, checkForUpdates: () => { checks++; } },
        atlasUpdateStatus: () => ({ phase: 'unavailable' }),
      };
      throw new Error(`Unexpected import: ${name}`);
    },
    setInterval: (callback, delay) => { assert.equal(delay, 60000); retry = callback; return 1; },
    clearInterval: id => { assert.equal(id, 1); timerRemoved = true; },
  };
  vm.runInNewContext(code, sandbox, { filename });
  assert.equal(loads, 0, 'Importing the hook must not eagerly load NetInfo.');
  exports.default();
  await Promise.resolve();
  assert.equal(checks, 1, 'Launch checks work without connectivity information.');
  return {
    checks: () => checks, loads: () => loads,
    signal: state => network(state), foreground: state => foreground(state), retry: () => retry(),
    cleanup() {
      cleanup();
      assert.ok(appRemoved && timerRemoved);
      if (network) assert.ok(unsubscribed);
    },
  };
}

(async () => {
  const oldClient = await mount();
  assert.equal(oldClient.loads(), 0, 'Missing native module must never be required.');
  oldClient.retry(); assert.equal(oldClient.checks(), 2);
  oldClient.foreground('background'); oldClient.retry(); assert.equal(oldClient.checks(), 2);
  oldClient.foreground('active'); assert.equal(oldClient.checks(), 3);
  oldClient.cleanup(); oldClient.retry(); assert.equal(oldClient.checks(), 3);

  for (const options of [{ linked: true }, { platform: 'web' }]) {
    const client = await mount(options);
    assert.equal(client.loads(), 1);
    client.signal({ isConnected: false, isInternetReachable: false });
    client.retry(); assert.equal(client.checks(), 1, 'Known offline state suppresses retries.');
    client.signal({ isConnected: true, isInternetReachable: true });
    assert.equal(client.checks(), 2, 'Reconnection triggers an immediate check.');
    client.signal({ isConnected: true, isInternetReachable: true });
    assert.equal(client.checks(), 2, 'Repeated online signals do not trigger extra checks.');
    client.retry(); assert.equal(client.checks(), 3);
    client.signal({ isConnected: null, isInternetReachable: null });
    client.retry(); assert.equal(client.checks(), 4, 'Unknown connectivity allows a real request.');
    client.cleanup();
  }
  console.log('Atlas lifecycle checks passed: missing native module, launch, foreground, retries, reconnect, web and cleanup.');
})().catch(error => { console.error(error); process.exitCode = 1; });
