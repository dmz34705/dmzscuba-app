// Export the app's self-contained Ocean Atlas document for the DMZ website adapter.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildSync } = require('esbuild');
const root = path.resolve(__dirname, '..');
const output = path.resolve(process.argv[2] || path.join(root, 'ocean-atlas.html'));
const bundle = path.join(os.tmpdir(), `dmz-atlas-export-${process.pid}.cjs`);
buildSync({ stdin:{ contents:`import fs from 'node:fs'; import { buildAtlasDocument } from './src/features/oceanAtlas/document.js'; fs.writeFileSync(${JSON.stringify(output)}, buildAtlasDocument());`, resolveDir:root }, bundle:true, platform:'node', format:'cjs', outfile:bundle, external:['node:fs'] });
try { require(bundle); } finally { fs.unlinkSync(bundle); }
console.log(`Exported ${output} (${fs.statSync(output).size.toLocaleString()} bytes).`);
