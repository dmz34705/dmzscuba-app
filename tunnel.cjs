// Starts Metro behind your own ngrok account, replacing `expo start --tunnel`,
// which only uses Expo's shared ngrok account.
// Usage: npm run tunnel [-- <extra expo start args>]
// Set NGROK_URL (e.g. https://name.ngrok-free.app) to use a reserved static domain.
// Any Metro server already running for this project, and any ngrok tunnel to its
// port, is stopped first so every run starts fresh.
const { execFileSync, spawn } = require('node:child_process');
const readline = require('node:readline');

const projectRoot = __dirname;
const expoArgs = process.argv.slice(2).filter((arg) => arg !== '--tunnel');
const portFlag = expoArgs.indexOf('--port');
const port = portFlag >= 0 ? expoArgs[portFlag + 1] : process.env.RCT_METRO_PORT || '8081';

function run(command, args) {
  try {
    return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function stopProcesses(pids) {
  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {}
  }
  for (let waited = 0; waited < 5000 && pids.some(isAlive); waited += 200) sleep(200);
  for (const pid of pids.filter(isAlive)) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {}
  }
}

function stopExistingServers() {
  const listeners = run('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']).split('\n').filter(Boolean).map(Number);
  const metro = [];
  for (const pid of listeners) {
    const cwd = run('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn']).split('\n').find((line) => line.startsWith('n'));
    if (cwd && cwd.slice(1) === projectRoot) {
      metro.push(pid);
    } else {
      console.error(`Port ${port} is in use by another program (pid ${pid}, ${cwd ? cwd.slice(1) : 'unknown folder'}).`);
      console.error('Stop it, or pass a different port: npm run tunnel -- --port 8082');
      process.exit(1);
    }
  }

  const tunnels = run('pgrep', ['-f', `ngrok http ${port}( |$)`]).split('\n').filter(Boolean).map(Number);

  if (metro.length) console.log(`Stopping Metro already running for this project on port ${port}...`);
  if (tunnels.length) console.log(`Stopping existing ngrok tunnel to port ${port}...`);
  stopProcesses([...metro, ...tunnels]);
}

stopExistingServers();

const ngrokArgs = ['http', port, '--log', 'stdout', '--log-format', 'json'];
if (process.env.NGROK_URL) ngrokArgs.push('--url', process.env.NGROK_URL);

const ENDPOINT_BUSY_RETRIES = 10;
let ngrok = null;
let expo = null;
let tunnelUrl = null;

function shutdown(code) {
  if (ngrok && !ngrok.killed) ngrok.kill();
  if (expo && !expo.killed) expo.kill();
  process.exit(code);
}

const timeout = setTimeout(() => {
  console.error('Timed out waiting for ngrok to open a tunnel.');
  shutdown(1);
}, 45000);

function startExpo(url) {
  clearTimeout(timeout);
  console.log(`ngrok tunnel: ${url} -> localhost:${port}`);
  expo = spawn('npx', ['expo', 'start', ...expoArgs], {
    stdio: 'inherit',
    env: { ...process.env, EXPO_PACKAGER_PROXY_URL: url },
  });
  expo.on('exit', (code) => shutdown(code ?? 0));
}

// ngrok keeps a just-stopped tunnel's endpoint online for a few seconds, so a
// restart can briefly fail with ERR_NGROK_334; wait and retry when that happens.
function startNgrok(attempt) {
  let errors = '';
  ngrok = spawn('ngrok', ngrokArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

  ngrok.on('error', (error) => {
    console.error(error.code === 'ENOENT' ? 'ngrok is not installed or not on your PATH.' : error.message);
    shutdown(1);
  });

  ngrok.stderr.on('data', (chunk) => {
    errors += chunk;
  });

  ngrok.on('exit', (code) => {
    if (tunnelUrl) {
      console.error('ngrok stopped; the tunnel is down.');
      shutdown(code ?? 1);
    } else if (errors.includes('ERR_NGROK_334') && attempt < ENDPOINT_BUSY_RETRIES) {
      if (attempt === 0) console.log('Waiting for ngrok to release the previous tunnel...');
      setTimeout(() => startNgrok(attempt + 1), 2000);
    } else {
      process.stderr.write(errors);
      shutdown(code || 1);
    }
  });

  readline.createInterface({ input: ngrok.stdout }).on('line', (line) => {
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      return;
    }
    if (tunnelUrl || entry.msg !== 'started tunnel' || !entry.url) return;
    tunnelUrl = entry.url;
    startExpo(tunnelUrl);
  });
}

startNgrok(0);

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
