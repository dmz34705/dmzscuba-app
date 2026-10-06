import { ATLAS_BASE_PATH, ATLAS_DATASET_KEYS, MAX_MANIFEST_BYTES, utf8Bytes, validateAtlasDatasets, validateAtlasManifest } from './updateContract';

// Platform-independent transaction engine. Files are immutable; the small state pointer
// changes only once all required files have been downloaded, hashed and parsed.
export function createAtlasUpdater({ storage, fetchText, digest, activate, baseUrl, onStatus = () => {} }) {
  let state = { active: null, previous: null }, initialized = null, running = null;
  let status = { source: 'bundled', phase: 'idle', version: null, publishedAt: null, checkedAt: null };
  const report = patch => { status = { ...status, ...patch }; onStatus(status); return status; };
  const fileName = (key, file) => `${key}-${file.sha256}.json`;
  async function checkText(key, file, text) {
    if (typeof text !== 'string' || utf8Bytes(text) !== file.bytes || await digest(text) !== file.sha256) throw new Error(`Atlas file failed verification: ${key}.`);
    return JSON.parse(text);
  }
  async function readSnapshot(manifest) {
    validateAtlasManifest(manifest);
    await verifyVersion(manifest);
    const data = {};
    for (const key of ATLAS_DATASET_KEYS) data[key] = await checkText(key, manifest.files[key], await storage.readFile(fileName(key, manifest.files[key])));
    return validateAtlasDatasets(data);
  }
  async function verifyVersion(manifest) {
    const identity = ATLAS_DATASET_KEYS.map(key => `${key}:${manifest.files[key].sha256}`).join('\n');
    if (await digest(identity) !== manifest.version) throw new Error('Atlas release identity failed verification.');
  }
  async function clean() {
    const keep = new Set([state.active, state.previous].filter(Boolean).flatMap(m => ATLAS_DATASET_KEYS.map(key => fileName(key, m.files[key]))));
    await storage.prune(keep).catch(() => {});
  }
  function initialize() {
    if (initialized) return initialized;
    initialized = (async () => {
      const saved = await storage.readState().catch(() => null);
      for (const manifest of [saved?.active, saved?.previous]) {
        if (!manifest) continue;
        try {
          const data = await readSnapshot(manifest);
          state = { active: manifest, previous: manifest === saved.active ? saved.previous : null };
          // Validate the retained rollback manifest before trusting its paths during pruning.
          try { if (state.previous) validateAtlasManifest(state.previous); } catch { state.previous = null; }
          activate(data);
          report({ source: 'saved', version: manifest.version, publishedAt: manifest.publishedAt });
          return status;
        } catch { /* An unreadable active release falls back to the previous one, then bundled data. */ }
      }
      return status;
    })();
    return initialized;
  }
  function checkForUpdates() {
    if (running) return running;
    running = (async () => {
      await initialize();
      report({ phase: 'checking', error: null });
      try {
        const raw = await fetchText(`${baseUrl}${ATLAS_BASE_PATH}/manifest.json`, MAX_MANIFEST_BYTES);
        if (utf8Bytes(raw) > MAX_MANIFEST_BYTES) throw new Error('Atlas update index is too large.');
        const manifest = validateAtlasManifest(JSON.parse(raw));
        await verifyVersion(manifest);
        if (state.active?.version === manifest.version) {
          // Version identifiers cannot be reused for different contents.
          if (ATLAS_DATASET_KEYS.some(key => state.active.files[key].sha256 !== manifest.files[key].sha256 || state.active.files[key].bytes !== manifest.files[key].bytes)) throw new Error('Atlas version has changed contents.');
          return report({ phase: 'current', checkedAt: new Date().toISOString() });
        }
        report({ phase: 'downloading' });
        const data = {};
        for (const key of ATLAS_DATASET_KEYS) {
          const file = manifest.files[key], name = fileName(key, file);
          let text = await storage.readFile(name).catch(() => null);
          try { data[key] = await checkText(key, file, text); }
          catch {
            text = await fetchText(`${baseUrl}${file.path}`, file.bytes);
            data[key] = await checkText(key, file, text);
            await storage.writeFile(name, text);
          }
        }
        validateAtlasDatasets(data);
        const next = { active: manifest, previous: state.active };
        await storage.writeState(next);
        state = next;
        activate(data);
        report({ source: 'saved', phase: 'current', version: manifest.version, publishedAt: manifest.publishedAt, checkedAt: new Date().toISOString() });
        await clean();
        return status;
      } catch (error) {
        await clean();
        return report({ phase: 'unavailable', error: error.message });
      }
    })().finally(() => { running = null; });
    return running;
  }
  return { initialize, checkForUpdates, getStatus: () => status };
}
