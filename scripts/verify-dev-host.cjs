const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const source = fs.readFileSync(path.join(__dirname, '..', 'tunnel.cjs'), 'utf8');
function launch({ platform = 'win32', args = [], env = {}, occupied = false } = {}) {
  const children = [], commands = [], timers = [], output = [];
  const fakeProcess = new EventEmitter();
  Object.assign(fakeProcess, { platform, argv: ['node', 'tunnel.cjs', ...args], env, execPath: 'node.exe',
    exit(code) { const error = new Error('exit'); error.code = code; throw error; },
    stderr: { write(s) { output.push(s); } }, kill() {} });
  const modules = {
    'node:child_process': {
      execFileSync(command, args) { commands.push([command, args]); return ''; },
      spawn(command, args, options) {
        const child = new EventEmitter();
        Object.assign(child, { command, args, options, pid: children.length + 100, exitCode: null,
          stdout: new EventEmitter(), stderr: new EventEmitter(), kill() { child.killed = true; } });
        children.push(child); return child;
      },
    },
    'node:readline': { createInterface({ input }) { return input; } },
    'node:path': path,
    'node:fs': { existsSync() { return false; } },
    'node:net': { createServer() {
      const probe = new EventEmitter();
      // listen's event is synchronous in this harness.
      probe.listen = (_port, callback) => occupied ? probe.emit('error', new Error('occupied')) : callback();
      probe.close = callback => callback();
      return probe;
    } },
  };
  const fakeRequire = id => { assert.ok(modules[id], id); return modules[id]; };
  fakeRequire.resolve = id => { assert.equal(id, 'expo/package.json'); return '/repo/node_modules/expo/package.json'; };
  const context = { require: fakeRequire, __dirname: '/repo', process: fakeProcess,
    console: { log: s => output.push(s), error: s => output.push(s) },
    setTimeout: callback => { timers.push(callback); return timers.length; }, clearTimeout() {},
    SharedArrayBuffer, Int32Array, Atomics };
  vm.runInNewContext(source, context);
  return { children, commands, timers, output, process: fakeProcess };
}
const host = launch({ args: ['--dev-client', '--localhost'], env: { NGROK_URL: 'https://scuba.example', RCT_METRO_PORT: '8082' } });
assert.equal(host.children[0].command, 'ngrok');
assert.ok(host.children[0].args.includes('8082'));
assert.ok(host.children[0].args.includes('https://scuba.example'));
host.children[0].stdout.emit('line', JSON.stringify({ msg: 'started tunnel', url: 'https://scuba.example' }));
const metro = host.children[1];
assert.equal(metro.command, 'node.exe');
assert.ok(metro.args[0].endsWith('/expo/bin/cli'));
assert.ok(metro.args.includes('--dev-client'));
assert.ok(metro.args.includes('--localhost'));
assert.equal(metro.args[metro.args.indexOf('--port') + 1], '8082');
assert.equal(metro.options.env.EXPO_PACKAGER_PROXY_URL, 'https://scuba.example');
assert.throws(() => host.process.emit('SIGINT'), error => error.code === 0);
assert.equal(host.commands.filter(([cmd]) => cmd === 'taskkill').length, 2);
assert.equal(host.commands.filter(([cmd]) => ['lsof', 'pgrep', 'npx'].includes(cmd)).length, 0);
assert.throws(() => launch({ occupied: true }), error => error.code === 1);
assert.throws(() => launch({ args: ['--port', 'garbage'] }), error => error.code === 1);
const explicit = launch({ args: ['--port', '8090'], env: { RCT_METRO_PORT: '8082' } });
assert.ok(explicit.children[0].args.includes('8090'));
const busy = launch();
busy.children[0].stdout.emit('line', JSON.stringify({ lvl: 'eror', msg: 'ERR_NGROK_334' }));
busy.children[0].emit('exit', 1);
assert.equal(busy.timers.length, 2);
busy.timers[1]();
assert.equal(busy.children.length, 2, 'Retry a domain that is still being released.');
const mac = launch({ platform: 'darwin' });
assert.ok(mac.commands.some(([cmd]) => cmd === 'lsof'));
console.log('Development host checks passed (Windows launch, port collision, retry, shutdown, Mac startup).');
