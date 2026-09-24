// Preview the exact bundled map document independently of native hardware.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { loadSourceModule } = require('./lib/load-source-module.cjs');
const root = path.resolve(__dirname, '../src');
const { buildAtlasDocument } = loadSourceModule(path.join(root, 'features/oceanAtlas/document.js'), root);
const html = buildAtlasDocument({ temperatureUnit: 'F', depthUnit: 'ft' });
if (process.argv[2]) {
  const output = path.resolve(process.argv[2]);
  fs.writeFileSync(output, html);
  console.log(`Ocean Atlas preview written: ${output}`);
  process.exit(0);
}
const port = Number(process.env.ATLAS_PREVIEW_PORT || 8099);
http.createServer((request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(html);
}).listen(port, '127.0.0.1', () => console.log(`Ocean Atlas preview: http://127.0.0.1:${port}`));
