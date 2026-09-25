// Development backups of the app's data, kept on this Mac (not on the phone), so deleting and
// reinstalling the app during development never loses the logbook, gear locker, photos or settings.
//
// Mounted on the Metro dev server by metro.config.js at /__dmz-backup — the app already reaches that
// server (LAN or tunnel), so nothing else needs to run. Layout under DMZ_BACKUP_DIR (~/dmzscuba-backups):
//
//   store/<file key>              one copy of each app file (photos, attachments); a file is uploaded once
//   backups/<id>/manifest.json    app storage (key → value) + the list of files, by key
//
// Automatic backups beyond the newest KEEP_AUTOMATIC are pruned; manual and pre-restore backups are kept.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PREFIX = '/__dmz-backup';
const KEEP_AUTOMATIC = 30;
const ID = /^[0-9A-Za-z-]{6,80}$/;
const FILE_KEY = /^[0-9a-z-]{6,120}$/;

function backupRoot() {
  return process.env.DMZ_BACKUP_DIR || path.join(os.homedir(), 'dmzscuba-backups');
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function readBody(req, limitBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limitBytes) { reject(new Error('Too large')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function summaries(root) {
  const dir = path.join(root, 'backups');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((id) => ID.test(id)).map((id) => {
    try {
      const summary = JSON.parse(fs.readFileSync(path.join(dir, id, 'summary.json'), 'utf8'));
      return { id, ...summary };
    } catch { return null; }
  }).filter(Boolean).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

function prune(root) {
  const automatic = summaries(root).filter((backup) => backup.reason === 'automatic');
  for (const old of automatic.slice(KEEP_AUTOMATIC)) fs.rmSync(path.join(root, 'backups', old.id), { recursive: true, force: true });
  // Files no remaining backup refers to.
  const referenced = new Set();
  for (const backup of summaries(root)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(root, 'backups', backup.id, 'manifest.json'), 'utf8'));
      for (const file of manifest.files || []) referenced.add(file.key);
    } catch { /* unreadable manifest: keep its files */ return; }
  }
  const store = path.join(root, 'store');
  if (!fs.existsSync(store)) return;
  for (const key of fs.readdirSync(store)) if (!referenced.has(key)) fs.rmSync(path.join(store, key), { force: true });
}

async function handle(req, res) {
  const root = backupRoot();
  const url = new URL(req.url, 'http://localhost');
  const route = url.pathname.slice(PREFIX.length).split('/').filter(Boolean);
  fs.mkdirSync(path.join(root, 'store'), { recursive: true });
  fs.mkdirSync(path.join(root, 'backups'), { recursive: true });

  if (req.method === 'GET' && route[0] === 'ping') return sendJson(res, 200, { ok: true, dir: root, backups: summaries(root).length });
  if (req.method === 'GET' && route[0] === 'backups' && route.length === 1) return sendJson(res, 200, { backups: summaries(root) });

  // Which of these files does the Mac not have yet?
  if (req.method === 'POST' && route[0] === 'missing') {
    const { keys = [] } = JSON.parse((await readBody(req, 20 * 1024 * 1024)).toString('utf8') || '{}');
    const missing = keys.filter((key) => FILE_KEY.test(key) && !fs.existsSync(path.join(root, 'store', key)));
    return sendJson(res, 200, { missing });
  }

  if (route[0] === 'files' && FILE_KEY.test(route[1] || '')) {
    const file = path.join(root, 'store', route[1]);
    if (req.method === 'PUT') {
      // Stream to a temporary name first: a dropped upload never leaves a truncated photo behind.
      const temporary = `${file}.part-${process.pid}-${Date.now()}`;
      await new Promise((resolve, reject) => {
        const out = fs.createWriteStream(temporary);
        req.pipe(out);
        out.on('finish', resolve);
        out.on('error', reject);
        req.on('error', reject);
      });
      fs.renameSync(temporary, file);
      return sendJson(res, 200, { ok: true });
    }
    if (req.method === 'GET') {
      if (!fs.existsSync(file)) return sendJson(res, 404, { error: 'No such file' });
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Length', fs.statSync(file).size);
      return fs.createReadStream(file).pipe(res);
    }
  }

  if (route[0] === 'backups' && ID.test(route[1] || '')) {
    const dir = path.join(root, 'backups', route[1]);
    if (req.method === 'POST') {
      const manifest = JSON.parse((await readBody(req, 512 * 1024 * 1024)).toString('utf8'));
      const absent = (manifest.files || []).filter((entry) => !fs.existsSync(path.join(root, 'store', entry.key)));
      if (absent.length) return sendJson(res, 409, { error: `${absent.length} files were not uploaded`, missing: absent.map((entry) => entry.key) });
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest));
      const summary = { createdAt: manifest.createdAt, reason: manifest.reason, device: manifest.device || '', app: manifest.app || '',
        keys: Object.keys(manifest.storage || {}).length, files: (manifest.files || []).length,
        bytes: (manifest.files || []).reduce((sum, entry) => sum + (entry.size || 0), 0), counts: manifest.counts || {} };
      fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(summary, null, 1));
      prune(root);
      return sendJson(res, 200, { ok: true, id: route[1], ...summary });
    }
    if (req.method === 'GET') {
      const file = path.join(dir, 'manifest.json');
      if (!fs.existsSync(file)) return sendJson(res, 404, { error: 'No such backup' });
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      return fs.createReadStream(file).pipe(res);
    }
  }
  return sendJson(res, 404, { error: 'Unknown backup request' });
}

// Metro middleware wrapper: backup requests are answered here, everything else goes to Metro.
function withDevBackups(metroMiddleware) {
  return (req, res, next) => {
    if (!req.url || !req.url.startsWith(PREFIX)) return metroMiddleware(req, res, next);
    handle(req, res).catch((error) => {
      if (!res.headersSent) sendJson(res, 500, { error: error.message || 'Backup failed' });
    });
    return undefined;
  };
}

module.exports = { withDevBackups, handle, PREFIX, backupRoot };
