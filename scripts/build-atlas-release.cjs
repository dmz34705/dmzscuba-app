// Publish prepared data snapshots; never download executable app code.
// Usage: node scripts/build-atlas-release.cjs --output-dir /path/to/website
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { loadSourceModule } = require('./lib/load-source-module.cjs');
const root = path.resolve(__dirname, '../src');
const { ATLAS_SCHEMA, ATLAS_BASE_PATH, ATLAS_DATASET_KEYS, validateAtlasDatasets, validateAtlasManifest } = loadSourceModule(path.join(root, 'features/oceanAtlas/updateContract.js'), root);
const sha = value => crypto.createHash('sha256').update(value).digest('hex');

function buildAtlasRelease(outputRoot, { dataRoot = path.join(root, 'features/oceanAtlas/data'), publishedAt = new Date().toISOString() } = {}) {
  const data = {}, text = {}, files = {};
  for (const key of ATLAS_DATASET_KEYS) {
    data[key] = JSON.parse(fs.readFileSync(path.join(dataRoot, `${key}.json`), 'utf8'));
    text[key] = `${JSON.stringify(data[key])}\n`;
    const sha256 = sha(text[key]);
    files[key] = { path: `${ATLAS_BASE_PATH}/files/${key}-${sha256}.json`, bytes: Buffer.byteLength(text[key]), sha256 };
  }
  validateAtlasDatasets(data);
  const version = sha(ATLAS_DATASET_KEYS.map(key => `${key}:${files[key].sha256}`).join('\n'));
  const manifest = validateAtlasManifest({ schemaVersion: ATLAS_SCHEMA, version, publishedAt, files });
  const directory = path.join(outputRoot, ATLAS_BASE_PATH);
  fs.mkdirSync(path.join(directory, 'files'), { recursive: true });
  for (const key of ATLAS_DATASET_KEYS) fs.writeFileSync(path.join(outputRoot, files[key].path), text[key]);
  // Rebuilding identical content keeps its original publication date. Retain old files
  // so clients reading a previous manifest can complete in-flight downloads.
  const indexPath = path.join(directory, 'manifest.json');
  if (fs.existsSync(indexPath)) {
    try { const previous = JSON.parse(fs.readFileSync(indexPath)); if (previous.version === version) manifest.publishedAt = previous.publishedAt; } catch { /* replace invalid index */ }
  }
  fs.writeFileSync(`${indexPath}.tmp`, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.renameSync(`${indexPath}.tmp`, indexPath);
  return manifest;
}

if (require.main === module) {
  const index = process.argv.indexOf('--output-dir');
  if (index < 0 || !process.argv[index + 1]) throw new Error('Usage: node scripts/build-atlas-release.cjs --output-dir <website-root>');
  const manifest = buildAtlasRelease(path.resolve(process.argv[index + 1]));
  console.log(`Atlas release ${manifest.version.slice(0, 12)}: ${Object.keys(manifest.files).length} files, ${Object.values(manifest.files).reduce((n, f) => n + f.bytes, 0).toLocaleString()} bytes.`);
}
module.exports = { buildAtlasRelease };
