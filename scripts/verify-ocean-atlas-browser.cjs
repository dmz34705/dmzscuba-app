// All provider tiles are mocked or blocked; no preview server is required.
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { loadSourceModule } = require('./lib/load-source-module.cjs');
const root = path.resolve(__dirname, '../src');
const { buildAtlasDocument } = loadSourceModule(path.join(root, 'features/oceanAtlas/document.js'), root);
const expectedSiteTotal = require('../src/features/oceanAtlas/data/globalSites.json').recordCount
  + require('../src/features/oceanAtlas/data/osmSites.json').sites.length
  + require('../src/features/oceanAtlas/data/extraSites.json').sites.length
  + require('../src/features/oceanAtlas/data/sites.json').length
  + require('../src/features/oceanAtlas/data/curatedSites.json').length
  + require('../src/lib/diveSites/data/offlineDiveSites.json').length;
const html = buildAtlasDocument({ temperatureUnit: 'F', depthUnit: 'ft' });

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.ATLAS_CHROME ? { executablePath: process.env.ATLAS_CHROME } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 393, height: 780 }, deviceScaleFactor: 2 });
    await context.addInitScript(() => {
      window.messages = [];
      window.addEventListener('atlas-message', e => window.messages.push(e.detail));
      let leaflet;
      Object.defineProperty(window, 'L', { configurable: true, get: () => leaflet, set: value => {
        leaflet = value;
        value.Map.addInitHook(function () { window.testMap = this; });
      } });
    });
    const page = await context.newPage();
    await page.route('https://tile.openstreetmap.org/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"></svg>' }));
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.setContent(html, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof window.atlasReceive === 'function');
    await page.evaluate(() => {
      window.addEventListener('atlas-message', e => window.messages.push(e.detail));
      window.atlasReceive({ type: 'preferences', value: { month: (new Date().getMonth() + 5) % 12 } });
      window.atlasReceive({ type: 'logs', status: 'ready', pins: [], missingCount: 2 });
    });
    assert.equal(await page.locator('#controls').isVisible(), false);
    assert.equal(await page.locator('#overview').isVisible(), false);
    assert.equal(await page.locator('#season-panel').isVisible(), false);
    assert.ok(await page.locator('.atlas-pin:not(.pin-out) .dive-region-pin').count() >= 10, 'Popular dive regions make the world map explorable.');
    assert.equal(await page.locator('.atlas-pin:not(.pin-out) .dive-region-pin i').first().innerText(), '✦', 'Region gateways do not display featured-area counts that can be mistaken for site totals.');
    assert.equal(await page.locator('#hint').getAttribute('data-site-total'), String(expectedSiteTotal));
    assert.ok((await page.locator('#hint').innerText()).includes(`${expectedSiteTotal.toLocaleString()} dive sites`));
    const groupedSiteTotal = await page.evaluate(() => [...document.querySelectorAll('.leaflet-sites-pane .atlas-pin:not(.pin-out) .cluster')].reduce((sum, pin) => sum + Number(pin.textContent), 0) + document.querySelectorAll('.leaflet-sites-pane .site-pin').length);
    assert.equal(groupedSiteTotal, expectedSiteTotal, 'World clusters and individual pins account for every bundled dive site.');
    assert.equal(await page.locator(`.month[data-month="${new Date().getMonth()}"]`).getAttribute('aria-pressed'), 'true', 'A stale saved month never overrides the current calendar month.');
    const mapSpace = await page.evaluate(() => document.querySelector('.dock').getBoundingClientRect().top - document.querySelector('.top').getBoundingClientRect().bottom);
    assert.ok(mapSpace / 780 > .8, 'The default phone layout leaves over 80% of its height between top and bottom controls.');
    await page.screenshot({ path: '/tmp/dmz-atlas-v2.png' });

    const beforeClusterZoom = await page.evaluate(() => testMap.getZoom());
    const openedClusterCount = await page.evaluate(() => {
      const cluster = [...document.querySelectorAll('.leaflet-sites-pane .atlas-pin:not(.pin-out) .cluster')].sort((a, b) => Number(b.textContent) - Number(a.textContent))[0];
      const count = Number(cluster?.textContent);
      cluster?.click();
      return count;
    });
    assert.ok(openedClusterCount > 30, 'The world view contains a substantial grouped cluster.');
    await page.waitForTimeout(650);
    assert.ok(await page.evaluate(zoom => testMap.getZoom() > zoom, beforeClusterZoom), 'Tapping a pin group zooms in to separate its sites.');
    assert.equal(await page.locator('#sheet').isVisible(), false, 'A pin group tap zooms without opening a card or empty-map tap.');
    // Regression: vector layers (location dot, place outlines) must never cover pin groups.
    await page.evaluate(() => { window.atlasReceive({ type: 'location', latitude: 24.6, longitude: -81.3 }); testMap.setView([20, -80], 4, { animate: false }); });
    await page.waitForTimeout(300);
    const group = await page.evaluate(() => { const c = [...document.querySelectorAll('.leaflet-sites-pane .atlas-pin:not(.pin-out) .cluster')].find(el => { const b = el.getBoundingClientRect(); return b.top > 150 && b.bottom < innerHeight - 200 && b.left > 20 && b.right < innerWidth - 90; }); const r = c.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, z: testMap.getZoom() }; });
    assert.ok(await page.evaluate(({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest('.leaflet-sites-pane')), group), 'Nothing is layered above a visible pin group.');
    await page.mouse.click(group.x, group.y);
    await page.waitForTimeout(650);
    assert.ok(await page.evaluate(zoom => testMap.getZoom() > zoom, group.z), 'A real tap on a pin group still zooms in after vector layers were drawn.');
    // At maximum zoom a group that cannot separate further lists its sites instead.
    await page.evaluate(() => testMap.setView([24.55, -81.8], 15, { animate: false }));
    const stacked = await page.evaluate(() => { const cluster = document.querySelector('.leaflet-sites-pane .atlas-pin:not(.pin-out) .cluster'); cluster?.click(); return Boolean(cluster); });
    if (stacked) assert.match(await page.locator('#detail-title').innerText(), /dive sites/);
    await page.locator('#world').click(); await page.waitForTimeout(1300); // world view flies in

    const pixels = await page.evaluate(() => {
      const read = (lat, lon) => {
        for (const canvas of document.querySelectorAll('.leaflet-temperature-pane canvas')) {
          const c = canvas.atlasCoords, p = testMap.project([lat, lon], c.z);
          const x = p.x - c.x * 256, y = p.y - c.y * 256;
          if (x >= 0 && x < 256 && y >= 0 && y < 256) {
            const scale = canvas.width / 256;
            return Array.from(canvas.getContext('2d').getImageData(Math.floor(x * scale), Math.floor(y * scale), 1, 1).data);
          }
        }
        return null;
      };
      return { paris: read(48.85, 2.35), ocean: read(30, -40), inland: read(40, -80), seamLeft: read(-5, -.001), seamRight: read(-5, .001) };
    });
    assert.equal(pixels.paris?.[3], 0, 'The temperature raster is transparent over land.');
    assert.equal(pixels.inland?.[3], 0, 'No inland temperature bleed.');
    assert.equal(pixels.ocean?.[3], 255, 'Open ocean is continuously covered.');
    assert.equal(pixels.seamLeft?.[3], 255);
    assert.equal(pixels.seamRight?.[3], 255);
    pixels.seamLeft.slice(0, 3).forEach((value, channel) => assert.ok(Math.abs(value - pixels.seamRight[channel]) <= 4, 'Adjacent ocean tiles share a continuous color field.'));

    await page.locator('.atlas-pin:not(.pin-out) .dive-region-pin').filter({ hasText: 'Caribbean' }).click();
    assert.equal(await page.locator('#detail-title').innerText(), 'Caribbean, Florida & Gulf');
    await page.locator('#expand').click();
    assert.match(await page.locator('#detail-body').innerText(), /featured dive areas/i);
    assert.match(await page.locator('#detail-body').innerText(), /Florida Keys/);
    await page.locator('#close').click();
    await page.locator('#search-toggle').click();
    await page.locator('#search').fill('Palancar Gardens');
    await page.locator('[data-result="0"]').click();
    assert.equal(await page.locator('#detail-title').innerText(), 'Palancar Gardens');
    await page.locator('#get-me-here').click();
    assert.ok(await page.evaluate(() => messages.some(m => m.type === 'journey' && m.destination.name === 'Palancar Gardens')), 'Site cards open the native journey planner with the selected destination.');
    await page.locator('#expand').click();
    assert.match(await page.locator('#detail-body').innerText(), /approximate/i);
    assert.match(await page.locator('#detail-body').innerText(), /CONANP/);
    assert.doesNotMatch(await page.locator('#detail-body').innerText(), /Regional lens/i, 'Site cards never borrow a far-away ocean region\'s habitats.');
    // A guide scrolled down, closed, then another site's guide opened starts at the top.
    await page.evaluate(() => { document.getElementById('detail-body').scrollTop = 400; });
    await page.locator('#close').click();
    await page.locator('#search-toggle').click();
    await page.locator('#search').fill('007 Sakatia');
    await page.locator('[data-result="0"]').click();
    await page.locator('#expand').click();
    await page.waitForTimeout(100);
    assert.equal(await page.evaluate(() => document.getElementById('detail-body').scrollTop), 0, 'A newly opened guide starts at the top.');
    await page.locator('#close').click();
    await page.locator('#search-toggle').click();
    await page.locator('#search').fill('007 Sakatia');
    await page.locator('[data-result="0"]').click();
    assert.equal(await page.locator('#detail-title').innerText(), '007 Sakatia');
    await page.locator('#expand').click();
    assert.match(await page.locator('#detail-body').innerText(), /max depth/i);
    assert.match(await page.locator('#detail-body').innerText(), /69 ft/i);
    assert.match(await page.locator('#detail-body').innerText(), /OpenDiveMap contributors · ODbL 1.0/);
    await page.locator('#close').click();
    await page.evaluate(() => { testMap.setView([-28, -20], 4, { animate: false }); testMap.fire('click', { latlng: L.latLng(-28, -20) }); });
    assert.equal(await page.locator('#detail-title').innerText(), 'South Atlantic');
    await page.locator('#expand').click();
    assert.equal(await page.locator('.climate-chart span').count(), 12);
    assert.match(await page.locator('#detail-body').innerText(), /Broad exploration context/);
    await page.locator('#close').click();

    await page.evaluate(() => { window.originalHeatCanvas = document.querySelector('.leaflet-temperature-pane canvas'); window.initialHeat = originalHeatCanvas.toDataURL(); window.originalBase = document.querySelector('.leaflet-tile-pane .leaflet-layer'); });
    await page.locator('#layers-toggle').click();
    await page.screenshot({ path: '/tmp/dmz-atlas-v2-layers.png' });
    await page.locator('#units').click();
    assert.ok(await page.evaluate(() => originalHeatCanvas.isConnected && originalHeatCanvas.toDataURL() === initialHeat), 'Unit changes must not rebuild heat tiles.');
    await page.locator('#species').selectOption('reef-manta');
    assert.ok(await page.evaluate(() => originalHeatCanvas.isConnected && originalHeatCanvas.toDataURL() === initialHeat), 'Species filtering must not redraw temperature.');
    assert.equal(await page.locator('.region-pin').count(), 0, 'Seasonal wildlife is shown in guides, not as separate map pins.');
    await page.locator('#season-toggle').click();
    assert.equal(await page.locator('#controls').isVisible(), false, 'Only one expanded panel is shown.');
    await page.locator('[data-month="0"]').click();
    assert.ok(await page.evaluate(() => originalHeatCanvas.isConnected && originalHeatCanvas.toDataURL() !== initialHeat), 'Month changes update the same tiles in place.');
    await page.locator('#current-month').click();
    assert.equal(await page.locator(`.month[data-month="${new Date().getMonth()}"]`).getAttribute('aria-pressed'), 'true');
    await page.locator('.month[data-month="0"]').click();
    await page.locator('#search-toggle').click();
    await page.locator('#search').fill('Baa');
    await page.locator('[data-result="0"]').click();
    assert.equal(await page.locator('#detail-title').innerText(), 'Baa Atoll');
    assert.equal(await page.locator('#detail-body').isVisible(), false, 'Selecting a location begins with a compact card.');
    await page.locator('#expand').click();
    assert.match(await page.locator('#detail-body').innerText(), /Outside typical season/);
    await page.locator('#season-toggle').click();
    await page.locator('[data-month="8"]').click();
    await page.getByRole('button', { name: 'Close month selector', exact: true }).click();
    await page.locator('#expand').click();
    assert.match(await page.locator('#detail-body').innerText(), /In season/);
    await page.screenshot({ path: '/tmp/dmz-atlas-v2-species.png' });
    await page.locator('#close').click();

    for (const zoom of [5.75, 6, 6.25, 7.5, 9, 10, 12, 2]) {
      await page.evaluate(z => testMap.setView([24.5, -81.2], z, { animate: false }), zoom);
      assert.ok(await page.evaluate(() => originalBase.isConnected), `Same basemap remains mounted at zoom ${zoom}.`);
      assert.equal(await page.locator('.leaflet-land-pane').evaluate(el => el.style.zIndex), '190');
      if (zoom >= 10) assert.equal(await page.locator('.leaflet-temperature-pane').evaluate(el => el.style.opacity), '0');
    }
    // Zoomed-in individual pins carry non-overlapping name labels; zoomed-out pins do not.
    await page.evaluate(() => testMap.setView([20.38, -86.98], 11, { animate: false }));
    await page.waitForTimeout(300);
    const labels = await page.evaluate(() => [...document.querySelectorAll('.atlas-pin:not(.pin-out) .site-label')].map(label => { const r = label.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; }));
    assert.ok(labels.length >= 5, 'Individual pins show site names when zoomed in.');
    assert.ok(labels.every((a, i) => labels.every((b, j) => i === j || a[2] <= b[0] || b[2] <= a[0] || a[3] <= b[1] || b[3] <= a[1])), 'Site labels never overlap.');
    await page.evaluate(() => testMap.setView([20.38, -86.98], 6, { animate: false }));
    await page.waitForTimeout(300);
    assert.equal(await page.locator('.atlas-pin:not(.pin-out) .site-label').count(), 0, 'Labels wait until the map is zoomed to coast level.');
    // Small groups (≤ 5) list their sites; tapping a listed name opens that site.
    await page.evaluate(() => testMap.setView([20.4, -86.95], 9, { animate: false }));
    await page.waitForTimeout(300);
    const listed = page.locator('.atlas-pin:not(.pin-out) .site-label.group b').first();
    assert.ok(await listed.count(), 'A small group lists its dive sites at coast zoom.');
    const listedName = await listed.innerText();
    await listed.click();
    await page.waitForTimeout(700); // let the fly-to animation settle
    const opened = await page.locator('#detail-title').innerText();
    assert.ok(listedName.endsWith('…') ? opened.startsWith(listedName.slice(0, -1)) : opened === listedName, 'Tapping a listed name opens that site.');
    assert.equal(await page.locator('#detail-eyebrow').innerText(), 'DIVE SITE');
    await page.locator('#close').click();
    await page.locator('#world').click(); await page.waitForTimeout(1300); // world view flies in
    assert.ok(await page.evaluate(() => testMap.getZoom() < 2), 'World fits to a phone viewport instead of keeping an arbitrary fixed zoom.');
    await page.screenshot({ path: '/tmp/dmz-atlas-v2-world.png' });
    await page.locator('#layers-toggle').click();
    await page.locator('[data-layer="temperature"]').click();
    assert.equal(await page.locator('.leaflet-temperature-pane canvas').count(), 0);
    await page.locator('[data-layer="temperature"]').click();
    await page.locator('[data-layer="wildlife"]').click();
    assert.equal(await page.locator('.region-pin').count(), 0);
    await page.locator('[data-layer="dives"]').click();
    await page.locator('#browse-toggle').click();
    assert.match(await page.locator('#overview').innerText(), /2 without coordinates/);
    await page.locator('#see-dives').click();
    const openedLogbook = await page.evaluate(() => messages.some(m => m.type === 'openLogbook'));
    assert.ok(openedLogbook, JSON.stringify(await page.evaluate(() => ({ messages, seeDives: document.querySelector('#see-dives')?.textContent, overview: document.querySelector('#overview')?.textContent }))));
    await page.evaluate(() => atlasReceive({ type: 'logs', status: 'ready', pins: [{ id: 'pin', name: '<img src=x onerror=alert(1)> My dive', latitude: 24.9, longitude: -80.4, dives: [{ id: 'real-dive-id', name: 'My dive', startTime: '2026-09-02T12:00:00Z', maxDepthMeters: 20, durationSeconds: 2700 }] }] }));
    await page.locator('#search-toggle').click();
    await page.locator('#search').fill('My dive');
    await page.locator('[data-result="0"]').click();
    assert.equal(await page.locator('#detail-title img').count(), 0);
    await page.locator('#expand').click();
    await page.locator('[data-dive]').click();
    assert.ok(await page.evaluate(() => messages.some(m => m.type === 'openDive' && m.id === 'real-dive-id')));
    await page.locator('#credits').click();
    assert.match(await page.locator('#detail-body').innerText(), /February 2014/);
    await page.locator('#detail-body a').first().click();
    assert.ok(await page.evaluate(() => messages.some(m => m.type === 'external')));
    await page.locator('#close').click();
    for (const size of [{ width: 320, height: 568 }, { width: 1024, height: 768 }]) {
      await page.setViewportSize(size);
      await page.locator('#world').click(); await page.waitForTimeout(1300); // world view flies in
      await page.screenshot({ path: `/tmp/dmz-atlas-v2-${size.width}.png` });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    }
    const offlinePage = await context.newPage();
    offlinePage.on('pageerror', e => errors.push(e.message));
    await offlinePage.route('https://tile.openstreetmap.org/**', route => route.abort());
    await offlinePage.setContent(html, { waitUntil: 'load' });
    await offlinePage.waitForFunction(() => typeof window.atlasReceive === 'function');
    await offlinePage.waitForFunction(() => document.querySelectorAll('.leaflet-temperature-pane canvas').length > 0);
    assert.ok(await offlinePage.locator('.leaflet-temperature-pane canvas').count() > 0);
    assert.ok(await offlinePage.locator('.leaflet-land-pane canvas').count() > 0);
    await offlinePage.close();
    assert.deepEqual(errors, []);
    console.log('Atlas browser checks passed: ocean regions, climate profiles, uncluttered layout, coastline alpha mask, stable tiles, zoom transitions, panels, seasonal guides, logbook bridge and offline launch.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
