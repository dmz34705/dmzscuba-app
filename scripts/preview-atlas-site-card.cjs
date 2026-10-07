// Screenshot site cards exactly as the app shows them: the native-mode map document, with the guide the app
// would send (siteGuide.js) answered over the same bridge. Playwright is not an app dependency:
//   PLAYWRIGHT_MODULE=/path/to/playwright-core [CHROME=/path/to/chrome] node scripts/preview-atlas-site-card.cjs "Prins Willem V" [out-dir]
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { loadSourceModule } = require('./lib/load-source-module.cjs');
const root = path.resolve(__dirname, '../src');
const { buildAtlasDocument, atlasBootstrapScripts } = loadSourceModule(path.join(root, 'features/oceanAtlas/document.js'), root);
const { buildSiteGuide } = loadSourceModule(path.join(root, 'features/oceanAtlas/siteGuide.js'), root);
const { unitSystem } = loadSourceModule(path.join(root, 'features/oceanAtlas/units.js'), root);

const names = (process.argv[2] || 'Prins Willem V').split('|');
const out = path.resolve(process.argv[3] || '/tmp/dmz-atlas-cards');
const settings = { temperatureUnit: 'F', depthUnit: 'ft' };
// A signed-in Advanced Open Water diver, so the fit verdict shows.
const diver = { signedIn: true, label: 'Advanced Open Water', limitMeters: 30, limitFeet: 100, wreck: false, cavern: false, cave: false };

setTimeout(() => { console.error('Timed out.'); process.exit(2); }, 240000).unref();
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}) });
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2 });
  await context.addInitScript(() => { window.sent = []; window.ReactNativeWebView = { postMessage: text => window.sent.push(JSON.parse(text)) }; });
  const page = await context.newPage();
  page.on('pageerror', error => console.error('page error:', error.message));
  await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#0d2a3a"/></svg>' }));
  const scripts = atlasBootstrapScripts(settings);
  // Play the app's side of the bridge: read what the map posts and answer it (the page's CSP forbids eval, so
  // answers arrive as script tags or evaluate calls, as the app's injectJavaScript would deliver them).
  let handled = 0;
  const pump = async () => {
    const messages = await page.evaluate(from => window.sent.slice(from), handled);
    handled += messages.length;
    for (const message of messages) {
      if (message.type === 'bootstrap' && scripts[message.index]) await page.addScriptTag({ content: scripts[message.index] });
      else if (message.type === 'siteGuide') {
        const answer = { type: 'siteGuide', ...buildSiteGuide(message, { units: unitSystem(settings), diver }) };
        await page.evaluate(m => window.atlasReceive(m), answer);
      }
    }
    return messages.length;
  };
  const settle = async (ms = 600) => { const end = Date.now() + ms; while (Date.now() < end) { if (!(await pump())) await page.waitForTimeout(50); } };
  await page.setContent(buildAtlasDocument({ ...settings, deferredData: true }));
  for (let i = 0; i < 2000 && !(await page.evaluate(() => window.sent.some(m => m.type === 'ready'))); i++) await settle(100);
  await settle(800);
  for (const name of names) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    await page.locator('#search-toggle').click();
    await page.locator('#search').fill(name);
    await page.locator('[data-result="0"]').click();
    await settle(900);
    await page.screenshot({ path: path.join(out, `${slug}-peek.png`) });
    await page.locator('#expand').click();
    await settle(500);
    await page.screenshot({ path: path.join(out, `${slug}-expanded.png`) });
    // The whole expanded guide, top to bottom, as one tall image.
    const height = await page.evaluate(() => { const b = document.getElementById('sheet'); return b.scrollHeight - b.clientHeight; });
    for (let y = 0, i = 1; y < height && i < 8; y += 700, i++) {
      await page.evaluate(top => { document.getElementById('sheet').scrollTop = top; }, y + 700);
      await page.waitForTimeout(150);
      await page.screenshot({ path: path.join(out, `${slug}-expanded-${i}.png`) });
    }
    for (const tab of await page.locator('[data-site-tab]').all()) {
      const key = await tab.getAttribute('data-site-tab');
      if (key === 'overview') continue;
      await tab.click(); await settle(300);
      await page.screenshot({ path: path.join(out, `${slug}-tab-${key}.png`) });
    }
    await page.locator('#close').click();
  }
  await browser.close();
  console.log(`Site card previews written to ${out}`);
})().catch(error => { console.error(error); process.exitCode = 1; });
