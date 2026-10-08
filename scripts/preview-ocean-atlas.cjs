// Preview the exact bundled map document independently of native hardware.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { loadSourceModule } = require('./lib/load-source-module.cjs');
const root = path.resolve(__dirname, '../src');
const { buildAtlasDocument } = loadSourceModule(path.join(root, 'features/oceanAtlas/document.js'), root);
const { buildSiteGuide } = loadSourceModule(path.join(root, 'features/oceanAtlas/siteGuide.js'), root);
const { unitSystem } = loadSourceModule(path.join(root, 'features/oceanAtlas/units.js'), root);
const { fetchSiteWeather } = loadSourceModule(path.join(root, 'features/oceanAtlas/weather.js'), root);
const settings = { temperatureUnit: 'F', depthUnit: 'ft' };
// In the app the native layer answers siteGuide messages. Mirror that bridge in
// the browser preview so the complete card—not only its map-side fallback—can be reviewed.
const bridge = `<script>window.ReactNativeWebView={postMessage:function(text){try{var m=JSON.parse(text);if(m.type==='siteGuide'){fetch('/__site-guide?'+new URLSearchParams(m)).then(function(r){return r.json()}).then(function(g){window.atlasReceive(Object.assign({type:'siteGuide'},g))});window.atlasReceive({type:'siteWeather',key:m.key,status:'loading'});fetch('/__site-weather?'+new URLSearchParams(m)).then(function(r){return r.json()}).then(function(weather){window.atlasReceive({type:'siteWeather',key:m.key,status:'ready',weather:weather})}).catch(function(){window.atlasReceive({type:'siteWeather',key:m.key,status:'error'})})}}catch(e){console.error(e)}}}</script>`;
const html = buildAtlasDocument(settings)
  .replace("connect-src 'none'", "connect-src 'self'")
  .replace('<head>', `<head>${bridge}`);
if (process.argv[2]) {
  const output = path.resolve(process.argv[2]);
  fs.writeFileSync(output, html);
  console.log(`Ocean Atlas preview written: ${output}`);
  process.exit(0);
}
const port = Number(process.env.ATLAS_PREVIEW_PORT || 8099);
http.createServer((request, response) => {
  if (request.url.startsWith('/__site-guide?')) {
    const params = new URL(request.url, 'http://127.0.0.1').searchParams;
    const guide = buildSiteGuide(Object.fromEntries(params), { units: unitSystem(settings) });
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(guide));
    return;
  }
  if (request.url.startsWith('/__site-weather?')) {
    const params = new URL(request.url, 'http://127.0.0.1').searchParams;
    fetchSiteWeather(Number(params.get('latitude')), Number(params.get('longitude')))
      .then(weather => {
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        response.end(JSON.stringify(weather));
      })
      .catch(() => {
        response.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        response.end(JSON.stringify({ error: 'Weather unavailable' }));
      });
    return;
  }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(html);
}).listen(port, '127.0.0.1', () => console.log(`Ocean Atlas preview: http://127.0.0.1:${port}`));
