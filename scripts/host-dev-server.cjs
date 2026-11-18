// Keep the trip host running after a tunnel/Metro failure. No Git updates are
// performed here: a host stays on the exact prerelease installed and tested.
const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const root = path.join(__dirname, '..');
const envFile = path.join(root, '.env.host.local');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
if (!process.env.NGROK_URL) {
  console.error('Set NGROK_URL to your reserved HTTPS domain in .env.host.local before starting the trip host.');
  process.exit(1);
}
let child;
let retry;
let stopping = false;
function start() {
  console.log(`[${new Date().toISOString()}] Starting DMZ Scuba trip host.`);
  child = spawn(process.execPath, [path.join(root, 'tunnel.cjs'), '--dev-client', '--localhost'], {
    cwd: root, stdio: 'inherit', env: { ...process.env, CI: '1' },
  });
  child.on('error', error => console.error(error.message));
  child.on('exit', code => {
    if (stopping) return;
    console.error(`[${new Date().toISOString()}] Host exited (${code}); retrying in 15 seconds.`);
    retry = setTimeout(start, 15000);
  });
}
function stop() {
  if (stopping) return;
  stopping = true;
  clearTimeout(retry);
  if (child && child.exitCode === null) {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGTERM');
  }
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
start();
