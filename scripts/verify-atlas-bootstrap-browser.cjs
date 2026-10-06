// Optional headless browser integration check. Supply PLAYWRIGHT_MODULE if it is
// installed outside this checkout; Playwright is not a runtime app dependency.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { loadSourceModule } = require('./lib/load-source-module.cjs');
const root = path.resolve(__dirname, '../src');
const { buildAtlasDocument, atlasBootstrapScripts } = loadSourceModule(path.join(root, 'features/oceanAtlas/document.js'), root);
const { catalogSites } = loadSourceModule(path.join(root, 'features/oceanAtlas/catalog.js'), root);
const { activateAtlasDatasets, BUNDLED_ATLAS_DATA } = require(path.join(root, 'features/oceanAtlas/datasets.js'));

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const { locationPicker, enlarged = false } of [{ locationPicker: false }, { locationPicker: true }, { locationPicker: false, enlarged: true }]) {
      if (enlarged) {
        activateAtlasDatasets({ ...BUNDLED_ATLAS_DATA, curatedSites: [...BUNDLED_ATLAS_DATA.curatedSites,
          ...Array.from({ length: 3000 }, (_, i) => ({ id: `bootstrap-scale-${i}`, name: `Bootstrap Test Reef ${i}`, latitude: -15, longitude: 145, maxDepthMeters: 18,
            note: 'Additional attributed site details used to verify startup with a larger Atlas dataset. '.repeat(3) }))] });
      }
      const context = await browser.newContext({ viewport: { width: 393, height: 780 } });
      await context.addInitScript(() => { window.sent = []; window.ReactNativeWebView = { postMessage: text => window.sent.push(JSON.parse(text)) }; });
      await context.addInitScript(() => {
        let leaflet;
        Object.defineProperty(window, 'L', { configurable: true, get: () => leaflet, set: value => { leaflet = value; value.Map.addInitHook(function () { window.testMap = this; }); } });
      });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('https://**/*', route => route.abort());
      const options = { locationPicker, temperatureUnit: 'C', depthUnit: 'm' };
      await page.setContent(buildAtlasDocument({ ...options, deferredData: true }));
      assert.equal(await page.evaluate(() => sent.at(-1).index), 0);
      assert.equal(await page.locator('#map').count(), 0, 'The shell waits for data before rendering the map.');
      const scripts = atlasBootstrapScripts(options);
      if (enlarged) assert.ok(scripts.reduce((bytes, script) => bytes + Buffer.byteLength(script), 0) > 2 * 1024 * 1024, 'The real browser boots a data payload above the former inline budget.');
      for (let i = 0; i < scripts.length; i++) {
        assert.equal(await page.evaluate(() => sent.at(-1).index), i, 'Each chunk is acknowledged before the next is sent.');
        await page.addScriptTag({ content: scripts[i] });
      }
      await page.waitForFunction(() => sent.some(m => m.type === 'ready'));
      assert.equal(await page.evaluate(() => sent.some(m => m.type === 'bootstrapError')), false);
      assert.ok(await page.locator('.leaflet-land-pane canvas').count() > 0, 'Bundled coastlines render with all network requests blocked.');
      if (!locationPicker) {
        assert.equal(await page.locator('#hint').getAttribute('data-site-total'), String(catalogSites().length));
        await page.evaluate(() => window.atlasReceive({ type: 'dataStatus', text: 'Using saved Atlas · 10/6/2026' }));
        assert.equal(await page.locator('#data-status').innerText(), 'Using saved Atlas · 10/6/2026');
        await page.evaluate(() => window.atlasReceive({ type: 'preferences', value: { view: { latitude: 20, longitude: -80, zoom: 7 } } }));
        assert.equal(await page.evaluate(() => testMap.getZoom()), 7, 'The saved view is restored when a new dataset restarts the map.');
        await page.evaluate(() => testMap.setView([21, -81], 8, { animate: false }));
        assert.equal(await page.evaluate(() => sent.filter(m => m.type === 'preferences').at(-1).value.view.zoom), 8);
      }
      await page.locator('#search-toggle').click();
      await page.locator('#search').fill('Thistlegorm');
      await page.locator('[data-result="0"]').click();
      if (locationPicker) {
        assert.match(await page.evaluate(() => sent.find(m => m.type === 'locationPicked')?.selection.name), /Thistlegorm/);
      } else {
        assert.match(await page.locator('#detail-title').innerText(), /Thistlegorm/);
        assert.ok(await page.evaluate(() => sent.some(m => m.type === 'siteGuide')), 'Guide details are requested through the native bridge.');
      }
      assert.deepEqual(errors, []);
      await page.screenshot({ path: `/tmp/dmz-atlas-${locationPicker ? 'picker' : enlarged ? 'large-map' : 'map'}-bootstrap.png` });
      await context.close();
    }
    console.log('Browser startup checks passed: acknowledged data transfer, offline map rendering, full site count, search, guide bridge, Atlas location picker and a real >2 MiB map payload.');
  } finally { activateAtlasDatasets(BUNDLED_ATLAS_DATA); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
