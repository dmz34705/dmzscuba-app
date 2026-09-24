// Runs entirely inside the bundled WebView document. Keep dependencies explicit
// through DATA and MODEL; no remote scripts can access the personal dive layer.
export function atlasRuntime(DATA, MODEL) {
  const L = window.L;
  const $ = id => document.getElementById(id);
  const months = DATA.months;
  DATA.temperature = MODEL.expandTemperature(DATA.temperature);
  const globalSource = DATA.globalSites;
  const decodeBase64Numbers = (value, bytes, reader) => {
    const binary = atob(value); const buffer = new ArrayBuffer(binary.length); const array = new Uint8Array(buffer);
    for (let index = 0; index < binary.length; index += 1) array[index] = binary.charCodeAt(index);
    const view = new DataView(buffer); return Array.from({ length: binary.length / bytes }, (_, index) => view[reader](index * bytes, true));
  };
  globalSource.ids = globalSource.packedIds.match(/.{6}/g) || [];
  globalSource.coordinates = decodeBase64Numbers(globalSource.coordinatesBase64, 4, 'getInt32');
  globalSource.countryIndexes = decodeBase64Numbers(globalSource.countryIndexesBase64, 1, 'getUint8').map(value => value - 1);
  globalSource.maxDepths = decodeBase64Numbers(globalSource.maxDepthsBase64, 2, 'getUint16');
  const sparseMap = entries => new Map(entries || []);
  const globalColumns = { seas: sparseMap(globalSource.seasByIndex), environments: sparseMap(globalSource.environmentsByIndex),
    topologyMasks: sparseMap(globalSource.topologyMasksByIndex), entries: sparseMap(globalSource.entriesByIndex),
    aliases: sparseMap(globalSource.aliasesByIndex), unknownTopologies: sparseMap(globalSource.unknownTopologiesByIndex) };
  const decodeGlobalSite = index => {
    const topologyMask = globalColumns.topologyMasks.get(index) ?? globalSource.defaults.topologyMask;
    const topologies = globalSource.topologyCodes.filter((value, code) => topologyMask & (1 << code)).concat(globalColumns.unknownTopologies.get(index) ?? globalSource.defaults.unknownTopologies);
    const sourceRecordId = globalSource.ids[index]; const environment = globalColumns.environments.get(index) ?? globalSource.defaults.environment;
    const recordUrl = `${globalSource.apiUrl}/${encodeURIComponent(sourceRecordId)}`;
    const seaIndex = globalColumns.seas.get(index) ?? globalSource.defaults.sea;
    return { id: `odm-${sourceRecordId}`, sourceRecordId, name: globalSource.names[index], latitude: globalSource.coordinates[index * 2] / 1e5, longitude: globalSource.coordinates[index * 2 + 1] / 1e5,
      country: globalSource.countries[globalSource.countryIndexes[index]] || '', region: globalSource.seas[seaIndex] || '', environment,
      topologies, entry: globalColumns.entries.get(index) ?? globalSource.defaults.entry, maxDepthMeters: globalSource.maxDepths[index] || null, aliases: globalColumns.aliases.get(index) ?? globalSource.defaults.aliases,
      siteType: topologies[0] ? `${topologies[0][0].toUpperCase()}${topologies[0].slice(1)} dive` : environment ? `${environment} dive site` : 'Dive site',
      coordinateQuality: 'community', catalog: 'global',
      sources: [{ sourceName: globalSource.source, sourceUrl: recordUrl, sourceRecordId, dataLicense: globalSource.license, coordinateQuality: 'community' }] };
  };
  DATA.sites.push(...globalSource.ids.map((_, index) => decodeGlobalSite(index)));
  // OpenStreetMap dive spots (compact rows; see scripts/import-osm-dive-sites.cjs).
  const osm = DATA.osmSites;
  if (osm?.sites) DATA.sites.push(...osm.sites.map(([osmId, name, latitude, longitude, depth, entryCode, mask, fresh]) => {
    const topologies = osm.topologyCodes.filter((_, code) => mask & (1 << code));
    const type = { n: 'node', w: 'way', r: 'relation' }[osmId[0]];
    return { id: `osm-${osmId}`, name, latitude, longitude, country: '', region: '', environment: fresh ? 'fresh' : '', topologies, entry: ['', 'boat', 'shore'][entryCode],
      maxDepthMeters: depth || null, aliases: [], coordinateQuality: 'community', catalog: 'osm',
      siteType: topologies[0] ? `${topologies[0][0].toUpperCase()}${topologies[0].slice(1)} dive` : fresh ? 'Freshwater dive site' : 'Dive site',
      sources: [{ sourceName: osm.source, sourceUrl: `https://www.openstreetmap.org/${type}/${osmId.slice(1)}`, dataLicense: osm.license, coordinateQuality: 'community' }] };
  }));
  // Supplementary sites: NOAA Thunder Bay moorings, Wikipedia, curated US inland (scripts/import-extra-dive-sites.cjs).
  const extra = DATA.extraSites;
  if (extra?.sites) DATA.sites.push(...extra.sites.map(([id, name, latitude, longitude, depth, entryCode, mask, fresh, source, url]) => {
    const topologies = extra.topologyCodes.filter((_, code) => mask & (1 << code));
    const origin = extra.sources[source] || { name: source, license: '' };
    return { id: `x-${id}`, name, latitude, longitude, country: '', region: '', environment: fresh ? 'fresh' : '', topologies, entry: ['', 'boat', 'shore'][entryCode],
      maxDepthMeters: depth || null, aliases: [], coordinateQuality: source === 'tbnms' ? 'published mooring' : 'community', catalog: 'osm',
      siteType: topologies[0] ? `${topologies[0][0].toUpperCase()}${topologies[0].slice(1)} dive` : fresh ? 'Freshwater dive site' : 'Dive site',
      note: source === 'curated' ? 'Well-known inland dive site. Access, fees and rules change — confirm with the site or park before visiting.' : source === 'tbnms' ? 'NOAA sanctuary shipwreck with a seasonal dive mooring. Protected: look, don\'t take.' : undefined,
      sources: [{ sourceName: origin.name, sourceUrl: url, dataLicense: origin.license, coordinateQuality: 'community' }] };
  }));
  // Published depths (scripts/build-published-depths.cjs; same rule as catalog.js).
  for (const site of DATA.sites) {
    const row = DATA.publishedDepths?.depths?.[site.id];
    if (!row || (site.maxDepthMeters && row[1] !== 'Posted')) continue;
    site.maxDepthMeters = row[0]; site.depthSource = { name: row[1] === 'Posted' ? 'Posted by the site' : row[1], url: row[2] }; site.depthIsWholeLake = Boolean(row[3]);
  }
  const paths = {
    back: 'M15 5l-7 7 7 7', search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
    site: 'M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
    temperature: 'M10 14V5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0ZM12 9v8M17 5h3M17 9h2',
    wildlife: 'M3 12c4-7 11-7 16 0-5 7-12 7-16 0ZM19 12l4-4v8l-4-4M8 10h.01M12 6l2-3 2 4',
    dives: 'M5 3h14v18H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM5 17h14M8 7h7M8 11h5',
    globe: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18',
    locate: 'M12 2v4M12 18v4M2 12h4M18 12h4M18 12a6 6 0 1 1-12 0 6 6 0 0 1 12 0',
    info: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 11v6M12 7h.01',
    arrow: 'M5 12h14M13 6l6 6-6 6',
    layers: 'M12 3 2 8l10 5 10-5-10-5ZM2 12l10 5 10-5M2 16l10 5 10-5',
  };
  const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name] || paths.site}"/></svg>`;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const post = (type, payload = {}) => {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ type, ...payload }));
    else window.dispatchEvent(new CustomEvent('atlas-message', { detail: { type, ...payload } }));
  };
  let state = { month: new Date().getMonth(), species: 'all', unit: DATA.unit,
    layers: { regions: true, sites: true, temperature: true, wildlife: true, dives: false } };
  let logPins = [], logStatus = 'loading', missingCount = 0, selected = null, toastTimer;
  let readyForPersistence = false;
  let panel = null;
  const temp = value => value == null ? '—' : `${Math.round(state.unit === 'F' ? value * 9 / 5 + 32 : value)}°${state.unit}`;
  // The month is contextual, not a preference: every launch starts in the
  // device's current month. Older saved month values are intentionally ignored.
  const persist = () => {
    if (!readyForPersistence) return;
    const { month, ...value } = state;
    post('preferences', { value });
  };
  const toast = message => {
    $('toast').textContent = message; $('toast').hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 6500);
  };

  $('app').innerHTML = `
    <div id="map" aria-label="Interactive dive map"></div>
    <div class="top">
      <div class="brand"><button id="back" class="round glass" aria-label="Back">${icon('back')}</button><div class="brand-copy"><div class="eyebrow">DMZ SCUBA</div><h1>Ocean Atlas<span style="color:var(--mint)">.</span></h1></div><button id="search-toggle" class="round glass" aria-label="Search the atlas" aria-expanded="false">${icon('search')}</button></div>
      <div id="search-panel" hidden><div class="search glass">${icon('search')}<input id="search" aria-label="Search dive sites, regions or species" placeholder="Find a site, region or species" autocomplete="off"/><button id="clear-search" class="search-clear" aria-label="Clear search" hidden>×</button></div>
      <div id="results" class="results glass" aria-label="Search results" hidden></div>
      </div>
    </div>
    <div class="map-tools"><button id="layers-toggle" class="round glass" aria-label="Map layers" aria-expanded="false">${icon('layers')}<span id="layer-count" class="count"></span></button><button id="locate" class="round glass" aria-label="Find my location">${icon('locate')}</button><button id="world" class="round glass" aria-label="Show world map">${icon('globe')}</button><div class="zoom glass"><button id="zoom-in" aria-label="Zoom in">+</button><button id="zoom-out" aria-label="Zoom out">−</button></div></div>
    <div class="bottom">
      <section id="controls" class="floating-panel glass" aria-label="Layer options" hidden><div class="panel-heading"><div><div class="eyebrow">MAKE IT YOUR MAP</div><h2>Map layers</h2></div><button class="panel-close" data-dismiss aria-label="Close layers">×</button></div>
      <div class="layers" aria-label="Map layers">${[['regions', 'Dive regions', 'globe', 'Popular gateways, habitats & conditions'], ['sites', 'Dive sites', 'site', `${DATA.sites.length.toLocaleString()} mapped reefs, wrecks & entries`], ['temperature', 'Water temperature', 'temperature', 'Smoothed monthly surface averages'], ['wildlife', 'Seasonal wildlife', 'wildlife', 'Evidence-backed encounter windows'], ['dives', 'My dives', 'dives', 'Your saved locations · all dates']].map(([key, label, image, detail]) => `<button class="layer" data-layer="${key}" aria-pressed="false">${icon(image)}<span><strong>${label}</strong><small>${detail}</small></span><i class="switch" aria-hidden="true"></i></button>`).join('')}</div>
      <div id="species-bar" class="species-filter glass"><label for="species">LOOK FOR</label><select id="species" aria-label="Filter by marine species"><option value="all">All marine life</option>${[...new Map(DATA.regions.flatMap(r => r.species).map(s => [s.id, s.name]))].sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => `<option value="${id}">${esc(name)}</option>`).join('')}</select></div>
      <div id="legend" class="legend"><div class="legend-top"><span>AVERAGE SEA SURFACE</span><button id="units" aria-label="Change temperature unit"></button></div><div class="gradient"></div><div id="legend-values" class="legend-values"></div></div><button id="info" class="source">Sources & coverage ↗</button></section>
      <section id="overview" class="overview floating-panel glass" hidden></section>
      <section id="sheet" class="sheet glass" aria-label="Map details" hidden><div class="sheet-head"><div id="detail-eyebrow" class="eyebrow"></div><h2 id="detail-title"></h2><p id="detail-subtitle" class="subtitle"></p><div id="glance" class="glance" hidden></div><div class="sheet-actions"><button id="expand" class="action-guide" aria-label="Expand details" aria-expanded="false">View guide ↑</button><button id="get-me-here" class="action-trip" hidden>Get me here ↗</button></div><button id="close" class="close" aria-label="Close map details">×</button></div><div id="detail-body" class="sheet-body"></div></section>
      <section id="season-panel" class="season floating-panel glass" aria-label="Season controls" hidden><div class="panel-heading"><div><div class="eyebrow">FOLLOW THE SEASONS</div><h2>Explore by month</h2></div><button class="panel-close" data-dismiss aria-label="Close month selector">×</button></div><button id="current-month" class="current-month"></button><div class="months" role="group" aria-label="Month">${months.map((m, i) => `<button class="month" data-month="${i}" aria-pressed="false">${m}</button>`).join('')}</div><p class="note">Starts with the current month. Change it to preview ocean averages and marine-life seasons; logged dives stay visible across all dates.</p></section>
    </div>
    <div id="hint" class="hint">Tap the ocean to explore</div>
    <nav class="dock glass" aria-label="Atlas controls"><button id="browse-toggle" aria-expanded="false">${icon('globe')}<span>Discover</span></button><span class="dock-divider"></span><button id="season-toggle" aria-expanded="false" aria-label="Choose month"><span class="dot"></span><span id="month-label"></span><span class="chevron">⌃</span></button></nav>
    <div class="attribution"><a href="https://www.naturalearthdata.com/about/terms-of-use/">Natural Earth</a> · <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a>${globalSource.recordCount ? ` · <a href="${esc(globalSource.sourceUrl)}">© OpenDiveMap contributors</a>` : ''} · <button id="credits">Data & coverage</button></div>
    <div id="toast" class="toast" role="status" hidden></div>`;

  const map = L.map('map', { zoomControl: false, attributionControl: false, minZoom: .5, maxZoom: 17,
    zoomSnap: .25, zoomDelta: .5, wheelPxPerZoomLevel: 100, bounceAtZoomLimits: false,
    worldCopyJump: true, fadeAnimation: true,
    maxBounds: [[-85, -540], [85, 540]], maxBoundsViscosity: .8, preferCanvas: true }).setView([18, -40], 2);
  map.createPane('land').style.zIndex = 190;
  map.createPane('temperature').style.zIndex = 220;
  // Outlines and the location dot draw below the pins and never take taps: Leaflet's default overlay
  // pane (z 400) puts a viewport-sized SVG above the site pins that swallowed pin-group taps.
  const vectorPane = map.createPane('vectors');
  vectorPane.style.zIndex = 320; vectorPane.style.pointerEvents = 'none';
  map.createPane('sites').style.zIndex = 330;
  // Camera moves glide (fly/pan animations) unless the viewer prefers reduced motion.
  const reduceMotion = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const fitTo = (bounds, options, duration = .8) => reduceMotion ? map.fitBounds(bounds, { ...options, animate: false }) : map.flyToBounds(bounds, { ...options, duration, easeLinearity: .25 });
  const flyTo = (center, zoom, duration = .8) => reduceMotion ? map.setView(center, zoom, { animate: false }) : map.flyTo(center, zoom, { duration, easeLinearity: .25 });
  map.on('zoomstart', () => document.body.classList.add('map-zooming'));
  map.createPane('regions').style.zIndex = 360;
  map.createPane('wildlife').style.zIndex = 420;
  const { land, heat } = createAtlasLayers(L, map, DATA, state.month);
  land.addTo(map);
  // A single basemap stays mounted at every scale. Bundled land remains behind
  // it for offline use; no zoom-threshold swap or pane-order changes.
  const base = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, keepBuffer: 1, updateWhenZooming: false }).addTo(map);
  let tileErrors = 0;
  base.on('tileerror', () => { if (++tileErrors === 3) toast('Detailed map unavailable. The offline atlas and saved pins are still available.'); });
  base.on('tileload', () => { tileErrors = 0; });

  const regionLayer = L.layerGroup().addTo(map), siteLayer = L.layerGroup().addTo(map), wildlifeLayer = L.layerGroup().addTo(map), diveLayer = L.layerGroup().addTo(map);
  // Native guides: season/marine-life for a site and destination guides for islands, US states and countries.
  const native = Boolean(window.ReactNativeWebView);
  const siteGuides = new Map(), regionGuides = new Map();
  const regionKey = item => `${item.kind}:${item.id}`;
  let guideRequest = 0, pendingTap = null, placeOutline = null, showAllSites = false, quickTap = null;
  let scrollOwner = null, expandedOwner = null;
  // A pin tap must never also count as an empty-map tap (touch can re-fire the same tap on the redrawn
  // map). Only a map tap at the same spot within half a second is treated as that echo.
  let pinTapAt = null;
  const pinTap = event => {
    const e = event?.originalEvent;
    pinTapAt = { time: Date.now(), x: e?.clientX, y: e?.clientY };
    if (e) L.DomEvent.stopPropagation(e);
  };
  const echoOfPinTap = event => {
    if (!pinTapAt || Date.now() - pinTapAt.time > 500) return false;
    const e = event.originalEvent;
    return Boolean(e) && (!Number.isFinite(pinTapAt.x) || Math.hypot(e.clientX - pinTapAt.x, e.clientY - pinTapAt.y) < 40);
  };
  let selectionMarker, siteStats = { total: DATA.sites.length, visible: DATA.sites.length, markers: 0 };
  function eligibleRegions() { return DATA.regions.filter(r => state.species === 'all' || r.species.some(s => s.id === state.species)); }
  // Once zoomed to coast level, single pins show their name and small groups (≤ GROUP_LIST sites) list
  // theirs, wherever the label fits without overlapping another label, pin or control.
  const LABEL_ZOOM = 7, LABEL_MAX = 22, GROUP_LIST = 5;
  const labelText = name => name.length > LABEL_MAX ? `${name.slice(0, LABEL_MAX - 1).trim()}…` : name;
  // Pins are diffed, not rebuilt: a marker whose group is unchanged is kept in place, new ones fade in and
  // removed ones fade out, so panning and zooming never flash the whole layer.
  const markerCache = { sites: new Map(), dives: new Map() };
  const labelSides = new Map(); // remembered label side per marker, so names don't hop around
  const PIN_FADE_MS = 220;
  const groupKey = (kind, items) => {
    let hash = 0;
    for (const item of items) {
      const id = item.dives ? `${item.id}#${item.dives.map(dive => dive.id).join(',')}` : item.id; // logbook pins change with their dives
      for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
    }
    return `${kind}:${items.length}:${hash}`;
  };
  function retire(marker, target) {
    const element = marker.getElement();
    if (!element) { target.removeLayer(marker); return; }
    element.classList.add('pin-out');
    setTimeout(() => target.removeLayer(marker), PIN_FADE_MS);
  }
  function markersFor(pins, target, kind) {
    const cache = markerCache[kind];
    const bins = new Map();
    const placedLabels = [];
    // Floating controls are obstacles too (converted from screen to layer coordinates).
    const mapBox = map.getContainer().getBoundingClientRect();
    document.querySelectorAll('.map-tools, .top').forEach(element => {
      const r = element.getBoundingClientRect();
      if (!r.width) return;
      const a = map.containerPointToLayerPoint([r.left - mapBox.left, r.top - mapBox.top]), b = map.containerPointToLayerPoint([r.right - mapBox.left, r.bottom - mapBox.top]);
      placedLabels.push({ left: a.x, top: a.y, right: b.x, bottom: b.y });
    });
    // The remembered side first, then right, then left; null when no side is free. On-screen labels stay on screen.
    const view = { min: map.containerPointToLayerPoint([4, 0]).x, max: map.containerPointToLayerPoint([map.getSize().x - 4, 0]).x };
    const labelFits = (point, texts, offset, preferred) => {
      const width = 14 + Math.max(...texts.map(text => text.length)) * 6.4, half = texts.length * 7.5 + 3;
      const onScreen = point.x >= view.min && point.x <= view.max;
      const sides = preferred === 'left' ? ['left', 'right'] : ['right', 'left'];
      for (const side of sides) {
        const left = side === 'right' ? point.x + offset : point.x - offset - width;
        const box = { left, right: left + width, top: point.y - half, bottom: point.y + half };
        if (onScreen && (box.left < view.min || box.right > view.max)) continue;
        if (placedLabels.some(b => box.left < b.right && box.right > b.left && box.top < b.bottom && box.bottom > b.top)) continue;
        placedLabels.push(box); return side;
      }
      return null;
    };
    const mapBounds = map.getBounds();
    const renderBounds = map.getZoom() > 4 ? mapBounds.pad(.45) : null;
    pins.filter(pin => !renderBounds || renderBounds.contains([pin.latitude, pin.longitude])).forEach(pin => {
      const point = map.project([pin.latitude, pin.longitude], map.getZoom());
      const key = `${Math.floor(point.x / 42)},${Math.floor(point.y / 42)}`;
      const items = bins.get(key) || []; items.push(pin); bins.set(key, items);
    });
    // Every pin and group bubble is an obstacle, so labels never cover them.
    const entries = [...bins.values()].map(items => {
      const lat = items.reduce((sum, p) => sum + p.latitude, 0) / items.length;
      const lon = items.reduce((sum, p) => sum + p.longitude, 0) / items.length;
      const point = map.latLngToLayerPoint([lat, lon]), r = items.length > 1 ? 18 : 9;
      placedLabels.push({ left: point.x - r, right: point.x + r, top: point.y - r, bottom: point.y + r });
      return { items, lat, lon, point, key: groupKey(kind, items) };
    });
    // Names already on screen keep priority, so an existing label is never displaced by a newcomer.
    entries.sort((a, b) => (labelSides.has(b.key) - labelSides.has(a.key)) || a.point.y - b.point.y);
    const seen = new Set();
    entries.forEach(({ items, lat, lon, point, key }) => {
      seen.add(key);
      const clustered = items.length > 1;
      const count = kind === 'dives' ? items.reduce((sum, p) => sum + p.dives.length, 0) : items.length;
      const className = kind === 'dives' ? 'dive-pin' : clustered ? 'cluster' : 'site-pin';
      const names = items.map(item => labelText(item.name));
      const listable = kind === 'sites' && map.getZoom() >= LABEL_ZOOM && items.length <= (clustered ? GROUP_LIST : 1);
      const showLabel = listable && labelFits(point, names, clustered ? 19 : 10, labelSides.get(key));
      if (showLabel) labelSides.set(key, showLabel); else labelSides.delete(key);
      const nameTag = !showLabel ? '' : clustered
        ? `<span class="site-label group${showLabel === 'left' ? ' left' : ''}">${items.map((item, i) => `<b data-site-id="${esc(item.id)}">${esc(names[i])}</b>`).join('')}</span>`
        : `<span class="site-label${showLabel === 'left' ? ' left' : ''}">${esc(names[0])}</span>`;
      const html = `<div class="${className}">${kind === 'dives' || clustered ? count : ''}</div>${nameTag}`;
      const cached = cache.get(key);
      if (cached) {
        // Same group as before: keep the marker; only swap its label if that changed.
        if (cached.html !== html) { const element = cached.marker.getElement(); if (element) element.innerHTML = html; cached.html = html; }
        return;
      }
      const size = kind === 'dives' ? 30 : clustered ? 34 : 15;
      const label = clustered ? `${count} ${kind === 'dives' ? 'logged dives' : 'dive sites'}` : items[0].name;
      const marker = L.marker([lat, lon], { pane: kind === 'dives' ? 'markerPane' : 'sites', title: label, alt: label, icon: L.divIcon({ className: 'atlas-pin', html, iconSize: [size, size], iconAnchor: [size / 2, size / 2] }), zIndexOffset: kind === 'dives' ? 200 : 0 }).addTo(target);
      marker.on('click', event => {
        pinTap(event);
        // A name in a small group's list opens that site; the bubble itself zooms in.
        const named = event.originalEvent?.target?.closest?.('[data-site-id]');
        const site = named && items.find(item => item.id === named.dataset.siteId);
        if (site) choose({ ...site, kind: 'site' }, true);
        else if (clustered) zoomToGroup(items, count, kind, lat, lon);
        else choose({ ...items[0], kind: kind === 'dives' ? 'dive' : 'site' });
      });
      cache.set(key, { marker, html });
    });
    for (const [key, cached] of cache) if (!seen.has(key)) { retire(cached.marker, target); cache.delete(key); labelSides.delete(key); }
    return { total: pins.length, visible: pins.filter(pin => mapBounds.contains([pin.latitude, pin.longitude])).length, markers: bins.size };
  }
  function clearMarkers(kind, target) {
    for (const cached of markerCache[kind].values()) retire(cached.marker, target);
    markerCache[kind].clear();
  }
  function updateHint() {
    if (state.layers.sites) {
      const markers = siteStats.markers === 1 ? 'marker' : 'markers';
      $('hint').textContent = map.getZoom() <= 4
        ? `${siteStats.total.toLocaleString()} dive sites · grouped into ${siteStats.markers.toLocaleString()} map ${markers} at this zoom`
        : `${siteStats.visible.toLocaleString()} of ${siteStats.total.toLocaleString()} dive sites in this map area`;
      $('hint').dataset.siteTotal = String(siteStats.total);
    } else {
      $('hint').textContent = state.layers.temperature && map.getZoom() >= 10 ? 'Zoom out for the regional temperature overlay' : state.layers.regions ? 'Tap any ocean area to explore its regional story' : 'Tap the ocean to explore';
      delete $('hint').dataset.siteTotal;
    }
  }
  // A pin group zooms in to separate its sites; only when it can't (same spot, or max zoom) does it list them.
  function zoomToGroup(items, count, kind, lat, lon) {
    const bounds = L.latLngBounds(items.map(item => [item.latitude, item.longitude]));
    const target = Math.min(map.getBoundsZoom(bounds.pad(.2)), 15);
    if (target > map.getZoom() + .25) {
      closeDetails();
      fitTo(bounds.pad(.2), { paddingTopLeft: [24, 110], paddingBottomRight: [84, 140], maxZoom: 15 }, .7);
    } else choose({ kind: 'cluster', name: `${count.toLocaleString()} ${kind === 'dives' ? 'logged dives' : 'dive sites'}`, subtitle: 'Grouped at this zoom', items, pinKind: kind, latitude: lat, longitude: lon });
  }
  // Region pins only change when the zoom crosses a band (or the layer toggles), not on every move.
  let regionBand = null;
  function drawRegionPins() {
    const zoom = map.getZoom();
    const band = !state.layers.regions ? 'off' : zoom <= 2.5 ? 'dive' : zoom <= 5.5 ? 'ocean' : 'none';
    if (band === regionBand) return;
    regionBand = band;
    regionLayer.eachLayer(marker => retire(marker, regionLayer));
    if (band === 'dive') DATA.diveRegions.forEach(region => {
      const html = `<div class="dive-region-pin"><i>✦</i><span>${esc(region.shortName)}</span></div>`;
      L.marker([region.latitude, region.longitude], { pane: 'regions', title: region.name, alt: `Explore ${region.name}`,
        icon: L.divIcon({ className: 'atlas-pin', html, iconSize: [128, 34], iconAnchor: [64, 17] }) })
        .on('click', event => { pinTap(event); openDiveRegion(region); }).addTo(regionLayer);
    });
    if (band === 'ocean') DATA.oceanRegions.forEach(region => {
      const html = `<div class="province-pin labelled"><i></i><span>${esc(region.shortName)}</span></div>`;
      L.marker([region.latitude, region.longitude], { pane: 'regions', title: region.name, alt: `Explore ${region.name}`,
        icon: L.divIcon({ className: 'atlas-pin', html, iconSize: [130, 30], iconAnchor: [9, 15] }) })
        .on('click', event => { pinTap(event); choose({ ...region, kind: 'province', zoom: Math.min(6, Math.max(map.getZoom() + 1.5, region.zoom || 4)) }, true); }).addTo(regionLayer);
    });
  }
  function drawPins() {
    wildlifeLayer.clearLayers();
    drawRegionPins();
    if (state.layers.sites) siteStats = markersFor(DATA.sites, siteLayer, 'sites');
    else { clearMarkers('sites', siteLayer); siteStats = { total: DATA.sites.length, visible: 0, markers: 0 }; }
    if (state.layers.dives) markersFor(logPins, diveLayer, 'dives'); else clearMarkers('dives', diveLayer);
    // Seasonal wildlife no longer has its own map pins: its seasons live in site, place and region guides,
    // and any empty-map tap opens a quick look with local marine life.
    document.body.classList.remove('map-zooming');
    updateHint();
  }
  function updateBase() {
    map.getPane('temperature').style.opacity = String(temperatureOpacity(map.getZoom()));
    updateHint();
    $('zoom-in').disabled = map.getZoom() >= map.getMaxZoom();
    $('zoom-out').disabled = map.getZoom() <= map.getMinZoom();
  }
  map.on('zoom', updateBase);
  map.on('zoomend', updateBase);
  map.on('moveend', drawPins);
  function updatePanels() {
    $('controls').hidden = panel !== 'layers';
    $('season-panel').hidden = panel !== 'season';
    $('overview').hidden = panel !== 'browse';
    $('search-panel').hidden = panel !== 'search';
    $('sheet').hidden = !selected || panel !== null;
    document.body.classList.toggle('panel-open', panel !== null);
    document.body.classList.toggle('has-selection', Boolean(selected));
    [['layers-toggle', 'layers'], ['season-toggle', 'season'], ['browse-toggle', 'browse'], ['search-toggle', 'search']].forEach(([id, name]) => $(id).setAttribute('aria-expanded', String(panel === name)));
  }
  function openPanel(name) {
    panel = panel === name ? null : name;
    document.body.classList.remove('detail-expanded');
    $('expand').setAttribute('aria-expanded', 'false');
    $('expand').setAttribute('aria-label', 'Expand details');
    $('expand').textContent = 'View guide ↑';
    renderOverview(); updatePanels();
    if (panel === 'search') $('search').focus(); else $('search').blur();
  }
  map.on('click', event => {
    if (echoOfPinTap(event)) return;
    $('results').hidden = true; $('search').blur();
    if (panel) { panel = null; updatePanels(); return; }
    const latitude = event.latlng.lat, longitude = event.latlng.wrap().lng;
    const region = state.layers.wildlife ? MODEL.regionAt(DATA.regions, latitude, longitude) : null;
    const province = state.layers.regions ? MODEL.oceanRegionAt(DATA.oceanRegions, latitude, longitude) : null;
    const fallback = region ? { ...region, kind: 'region', latitude, longitude }
      : province ? { ...province, kind: 'province', latitude, longitude }
        : { kind: 'ocean', latitude, longitude, name: 'Explore this area' };
    if (!native) { choose(fallback); return; }
    // Land taps open an island / state / country guide; the native side answers almost instantly.
    // Every empty-map tap also gets a quick-look popup at the tapped point.
    const requestId = ++guideRequest;
    fallback.fromTap = true;
    pendingTap = { requestId, fallback };
    quickTap = { requestId, latlng: [latitude, longitude] };
    post('placeAt', { requestId, latitude, longitude });
    post('quickLook', { requestId, latitude, longitude });
    setTimeout(() => { if (pendingTap?.requestId === requestId) choose(pendingTap.fallback); }, 2000);
  });
  function choose(item, fly = false) {
    selected = item;
    panel = null;
    pendingTap = null; showAllSites = false;
    if (!item.fromTap) { quickTap = null; map.closePopup(); }
    if (placeOutline) { map.removeLayer(placeOutline); placeOutline = null; }
    if (item.kind === 'place' && item.outline?.length) placeOutline = L.polygon(item.outline, { pane: 'vectors', interactive: false, color: '#97e8cc', weight: 1.5, dashArray: '4 4', fillColor: '#97e8cc', fillOpacity: 0.06 }).addTo(map);
    if (native && ['province', 'diveRegion'].includes(item.kind) && item.id && !regionGuides.has(regionKey(item))) post('regionGuide', { kind: item.kind, id: item.id });
    if (native && ['site', 'area'].includes(item.kind) && !siteGuides.has(guideKey(item))) post('siteGuide', { requestId: ++guideRequest, key: guideKey(item), latitude: item.latitude, longitude: item.longitude, id: item.kind === 'site' ? item.id : undefined });
    document.body.classList.remove('detail-expanded');
    $('expand').setAttribute('aria-expanded', 'false');
    $('expand').setAttribute('aria-label', 'Expand details');
    $('expand').textContent = 'View guide ↑';
    if (selectionMarker) map.removeLayer(selectionMarker);
    if (Number.isFinite(item.latitude) && item.kind !== 'place') selectionMarker = L.marker([item.latitude, item.longitude], { interactive: false, icon: L.divIcon({ className: '', html: '<div class="selected-dot"></div>', iconSize: [20, 20], iconAnchor: [10, 10] }) }).addTo(map);
    renderDetails();
    if (item.kind === 'sources') expandDetails(true);
    $('detail-body').scrollTop = 0;
    // One smooth camera move after the card is laid out, so the target lands centred above it.
    if (item.noFocus) return;
    if (fly && item.kind === 'place' && item.bbox) {
      const sheetHeight = $('sheet').hidden ? 0 : $('sheet').getBoundingClientRect().height;
      fitTo([[item.bbox[0], item.bbox[1]], [item.bbox[2], item.bbox[3]]], { paddingTopLeft: [28, 110], paddingBottomRight: [28, Math.max(160, sheetHeight + 110)], maxZoom: 10 }, .9);
    } else if (Number.isFinite(item.latitude)) {
      focusOn(L.latLng(item.latitude, item.longitude), fly ? item.zoom || (item.kind === 'site' || item.kind === 'dive' ? 11 : 6) : map.getZoom());
    }
  }
  // Centre a point in the visible map area (between the top bar and the card) at the given zoom.
  function focusOn(latlng, zoom) {
    const size = map.getSize(), mapTop = map.getContainer().getBoundingClientRect().top;
    const sheetTop = $('sheet').hidden ? size.y : $('sheet').getBoundingClientRect().top - mapTop;
    const targetX = size.x >= 700 ? (size.x + 360) / 2 : size.x / 2;
    const targetY = size.x >= 700 ? size.y / 2 : (document.querySelector('.top').getBoundingClientRect().bottom - mapTop + sheetTop) / 2;
    const center = map.unproject(map.project(latlng, zoom).subtract([targetX - size.x / 2, targetY - size.y / 2]), zoom);
    if (Math.abs(zoom - map.getZoom()) < .01) {
      if (map.latLngToContainerPoint(latlng).distanceTo([targetX, targetY]) < 4) return;
      map.panTo(center, reduceMotion ? { animate: false } : { animate: true, duration: .45, easeLinearity: .3 });
    } else flyTo(center, zoom);
  }
  function openDiveRegion(region) {
    choose({ ...region, kind: 'diveRegion', noFocus: true });
    const [south, west, north, east] = region.bounds;
    fitTo([[south, west], [north, east]], { paddingTopLeft: [28, 90], paddingBottomRight: [28, 150], maxZoom: 5.25 }, .9);
  }
  function closeDetails() { quickTap = null; map.closePopup(); selected = null; document.body.classList.remove('detail-expanded'); if (selectionMarker) map.removeLayer(selectionMarker); if (placeOutline) { map.removeLayer(placeOutline); placeOutline = null; } renderDetails(); }
  const guideKey = item => item.kind === 'site' ? `site:${item.id}` : `at:${item.latitude.toFixed(3)},${item.longitude.toFixed(3)}`;
  const depthText = meters => `${Math.round(DATA.depthUnit === 'ft' ? meters * 3.28084 : meters).toLocaleString()} ${DATA.depthUnit}`;
  // One length setting drives the map (mirrors units.js): feet → ft / mi, metres → m / km.
  const imperial = DATA.depthUnit === 'ft';
  const distText = km => { const v = imperial ? km / 1.609344 : km, u = imperial ? 'mi' : 'km'; return v < 1 ? `<1 ${u}` : `${v < 10 ? Math.round(v * 10) / 10 : Math.round(v).toLocaleString()} ${u}`; };
  const roundDistText = km => { const v = imperial ? km / 1.609344 : km; return `${Math.max(5, Math.round(v / 5) * 5)} ${imperial ? 'mi' : 'km'}`; };
  const elevText = m => imperial ? `${Math.round(m * 3.28084).toLocaleString()} ft` : `${Math.round(m).toLocaleString()} m`;
  const visText = v => { const f = x => imperial ? Math.max(5, Math.round(x * 3.28084 / 5) * 5) : x; return `${f(v.low)}–${v.high >= 40 ? `${f(40)}+` : f(v.high)} ${imperial ? 'ft' : 'm'}`; };
  // When to go + marine life, shared by site cards and destination guides.
  function guideSection(guide, seasonsTitle = 'When to go') {
    const fresh = Boolean(guide?.inland);
    if (!guide) return native ? '<p class="note">Loading seasons and marine life…</p>' : '';
    let html = '';
    if (guide.highlights.length) {
      html += `<div class="section-label">${seasonsTitle}</div><div class="season-chips">${guide.highlights.map(h => `<button class="season-chip${h.sourced ? ' sourced' : ''}" data-season-month="${h.months[0]}"><strong>${esc(h.label)}</strong><span>${h.animals.map(a => esc(a.common) + (a.where ? ` <small>· ${esc(a.where)}</small>` : '')).join(', ')}</span></button>`).join('')}</div>`;
      const rows = guide.highlights.flatMap(h => h.animals).slice(0, 5);
      html += rows.map(a => `<div class="season-row"><div class="season-row-head">${a.photo ? `<img src="${esc(a.photo.url)}" alt="" loading="lazy">` : '<i></i>'}<strong>${esc(a.common)}</strong><small>${esc(a.sourced ? a.season.split(' · ')[0] : a.season.replace('Most sightings ', ''))}${a.sourced ? '' : ' · sightings'}</small></div><div class="calendar">${months.map((m, i) => `<span class="${a.months.includes(i) ? (a.sourced ? 'active ' : 'soft ') : ''}${state.month === i ? 'current' : ''}">${m[0]}</span>`).join('')}</div></div>`).join('');
      const now = guide.animals.filter(a => a.months.includes(state.month));
      html += `<div class="month-now"><strong>${months[state.month]}</strong> ${now.length ? now.map(a => `<p>● ${esc(a.common)} — ${esc(a.sourced ? a.note || a.season : a.season.replace('Most sightings', 'most sightings') + ' in local sighting records')}${a.source ? ` <a class="source" href="${esc(a.source.url)}">${esc(a.source.name)} ↗</a>` : ''}</p>`).join('') : '<p>No documented seasonal highlight this month; the resident life below is seen year-round.</p>'}</div>`;
    }
    if (guide.animals.length) {
      html += `<div class="section-label">${fresh ? 'Freshwater life recorded nearby' : 'Marine life seen here'} · ${guide.animals.length}</div><div class="gallery">${guide.animals.map(a => `<div class="gcard">${a.photo ? `<img src="${esc(a.photo.url)}" alt="${esc(a.common)}" loading="lazy">` : '<div class="gphoto"></div>'}<strong>${esc(a.common)}</strong><em>${esc(a.scientific)}</em><span class="${a.months.length ? 'on' : ''}">${esc(a.sourced ? a.season.split(' · ')[0] : a.season)}</span>${a.records ? `<small>${a.records.toLocaleString()} local sightings${a.where ? ` · ${esc(a.where)}` : ''}${a.awayKm != null ? ` · ${distText(a.awayKm)} away` : ''}</small>` : ''}${a.photo ? `<small class="credit">📷 ${esc(a.photo.attribution)}</small>` : ''}<a class="gsource" href="${esc(a.taxonId ? `https://www.inaturalist.org/taxa/${a.taxonId}` : a.source?.url || 'https://www.inaturalist.org/')}">${a.taxonId ? 'iNaturalist' : 'Source'} ↗</a></div>`).join('')}</div>`;
      const borrowed = fresh && guide.animals.find(a => a.awayKm != null);
      html += fresh ? `<p class="note">Fish, turtles, crayfish, mussels and other aquatic animals from iNaturalist research-grade sightings ${borrowed ? `— few are recorded out here, so this adds the nearest well-recorded shore (${distText(borrowed.awayKm)} away); species there may not reach the site` : `within about ${roundDistText(15)} — nearby lakes and rivers included, so not every species lives at this exact site`}. Photos are openly licensed and credited.</p>`
        : `<p class="note">${guide.hasObservations ? 'Marine life from iNaturalist research-grade sightings nearby, adjusted for how many people log each month. “Most sightings” is a pattern, not a guarantee.' : ''} Solid seasons come from the linked research or government sources. Photos are openly licensed and credited.</p>`;
    } else if (!guide.highlights.length) html += `<p class="note">${fresh ? 'No freshwater-life records close by yet.' : 'No marine-life records near this spot yet.'}</p>`;
    return html;
  }
  // Ocean lenses and dive regions: counts, character, signature encounters, marine life, top destinations.
  function regionExtras(s) {
    if (!native) return '';
    const g = regionGuides.get(regionKey(s));
    if (!g) return '<p class="note">Loading species, seasons and destinations…</p>';
    const c = g.character;
    let html = `<div class="region-summary"><strong>${c.total.toLocaleString()}</strong><span>mapped dive sites</span><strong>${g.countries}</strong><span>${g.countries === 1 ? 'country' : 'countries'} & territories</span></div>`;
    if (c.summary) html += `<p class="region-story">${esc(c.summary)}</p>`;
    if (c.topologies.length) html += `<div class="chip-label">What the diving is like</div><div class="chips">${c.topologies.map(([t, n]) => `<span>${esc(t)} · ${n}</span>`).join('')}${c.depth ? `<span>typical max ${depthText(c.depth.low).split(' ')[0]}–${depthText(c.depth.high)}</span>` : ''}</div>`;
    html += guideSection(g.season, 'Signature encounters');
    if (g.areas?.length) html += `<div class="section-label">Featured dive areas</div><div class="area-list">${g.areas.map((area, index) => `<button class="area-row" data-region-area="${index}"><span><strong>${esc(area.name)}</strong><small>${esc(area.subtitle)}</small></span>${icon('arrow')}</button>`).join('')}</div>`;
    if (g.destinations.length) html += `<div class="section-label">Top destinations</div><div class="area-list">${g.destinations.map(d => `<button class="area-row" data-place-kind="${esc(d.kind)}" data-place-id="${esc(d.id)}"><span><strong>${esc(d.name)}</strong><small>${d.kind === 'island' ? 'Island' : 'Country'} · ${d.count} mapped ${d.count === 1 ? 'site' : 'sites'}</small></span>${icon('arrow')}</button>`).join('')}</div>`;
    return html;
  }
  // Inland sites: estimated water through the year, thermocline, ice, groundwater and altitude.
  function inlandConditions(p) {
    if (!p) return '';
    let html = `<div class="section-label">Water through the year · estimated</div>`;
    if (p.surface) {
      const max = Math.max(...p.surface);
      html += `<div class="climate-chart inland" aria-label="Estimated surface water temperature by month">${months.map((m, i) => `<span class="${i === state.month ? 'current' : ''}${p.ice.includes(i) ? ' ice' : ''}" title="${m}: ${p.ice.includes(i) ? 'usually ice-covered' : temp(p.surface[i])}"><i style="height:${Math.max(8, Math.min(100, (p.surface[i] + 2) / (Math.max(max, 20) + 2) * 100))}%"></i><b>${p.ice.includes(i) ? '❄' : m[0]}</b></span>`).join('')}</div>`;
      html += `<div class="temp-stat"><span>${months[state.month]} · estimated ${p.constant != null ? 'water' : 'surface water'}<br>${p.constant != null ? 'groundwater-fed, steady all year' : p.ice.includes(state.month) ? 'usually ice-covered' : 'from local air temperature'}</span><strong>${p.ice.includes(state.month) ? '❄' : temp(p.surface[state.month])}</strong></div>`;
    }
    const notes = [];
    if (p.geothermal) notes.push('Geothermally heated — warm all year. Ask the site for the current water temperature.');
    else if (p.constant != null) notes.push(`${p.kindLabel === 'Flooded mine' ? 'Flooded mines' : 'Springs'} are fed by groundwater, which stays near the local average air temperature: about ${temp(p.constant)} all year.`);
    if (p.stratifies) notes.push(`From early summer a thermocline forms, often ${imperial ? '20–40 ft' : '6–12 m'} down. Above it the water can feel like the chart; below it expect about ${temp(p.deep.low)}–${temp(p.deep.high)}.`);
    if (p.ice.length) notes.push(`Usually ice-covered around ${p.ice.map(i => months[i]).join(', ')} — ice diving only, with specialty training.`);
    if (p.altitude) notes.push(`Altitude dive: the surface is at ${elevText(p.elevation)}, above the 1,000 ft (305 m) threshold. Plan with altitude-adjusted tables or your computer's altitude mode (many switch automatically), and give your body a few hours to acclimatise before the first dive. After diving, driving over higher mountain passes counts like flying — allow a longer surface interval.`);
    else if (p.elevation != null) notes.push(`Surface elevation ${elevText(p.elevation)} — at or below 1,000 ft (305 m), so this is a normal dive: no altitude adjustment needed.`);
    notes.push('Visibility in lakes and quarries changes with the season: usually clearest in cool months and lower during summer algae growth or after heavy rain.');
    html += notes.map(note => `<p class="note">${esc(note)}</p>`).join('');
    html += '<p class="note">Estimates from NASA POWER air-temperature climatology and Open-Meteo elevation — not measured water temperatures. Confirm current conditions with the site.</p>';
    return html;
  }
  // At-a-glance ratings (estimates with their reasons) for the selected month.
  // Marine-life rating as little fish: n filled, the rest faded.
  const FISH = '<svg viewBox="0 0 24 16" aria-hidden="true"><path d="M1 8c3-4.5 7-6 11-6 3.2 0 5.6 1.3 7.4 3.2L23 2v12l-3.6-3.2C17.6 12.7 15.2 14 12 14 8 14 4 12.5 1 8Z"/><circle cx="8" cy="7" r="1.2"/></svg>';
  const stars = n => `<span class="fishes" role="img" aria-label="${n} of 5">${Array.from({ length: 5 }, (_, i) => `<b class="${i < n ? 'on' : ''}">${FISH}</b>`).join('')}</span>`;
  function glanceParts(r) {
    if (!r) return null;
    const life = r.marineLife?.[state.month], exposure = r.inland ? null : r.exposure?.[state.month];
    const vis = r.inland ? null : r.visibility?.[state.month];
    const inlandExposure = r.inland ? r.exposure?.[state.month] || null : null;
    return { life, exposure: r.inland ? inlandExposure : exposure, experience: r.experience, travel: r.travel, vis, deep: r.exposureDeep || null };
  }
  // Published maximum depth: what it measures and where it comes from.
  function depthTile(site) {
    if (!site?.maxDepthMeters) return `<div class="gtile"><small>Max depth</small><strong>—</strong><span>No published depth yet — ask the operator or site</span></div>`;
    const label = site.depthIsWholeLake ? 'Lake’s deepest point' : site.topologies?.includes('wreck') ? 'Wreck lies in' : 'Max depth';
    const from = site.depthSource ? site.depthSource.name : site.catalog === 'global' ? 'OpenDiveMap record' : site.catalog === 'osm' ? 'Community map record' : 'Catalog record';
    return `<div class="gtile"><small>${label}</small><strong>${depthText(site.maxDepthMeters)}</strong><span>${site.depthIsWholeLake ? 'Not the dive’s depth — ask where divers go · ' : ''}${esc(from)}</span></div>`;
  }
  function glanceTiles(r, temps, inland, site) {
    const g = glanceParts(r);
    if (!g) return '';
    if (r.inland) return `<div class="section-label">At a glance · ${months[state.month]} · freshwater</div><div class="glance-grid">
      <div class="gtile"><small>Freshwater life</small>${g.life ? `<strong class="stars">${stars(g.life.stars)}</strong><span>${esc(g.life.label)}${g.life.drivers.length ? ` · ${esc(g.life.drivers.join(', '))}` : ''}</span>` : '<strong>—</strong><span>No freshwater-life records nearby yet</span>'}</div>
      <div class="gtile"><small>Experience</small><strong>${esc(g.experience.level)}</strong><span>${esc(g.experience.reasons.slice(0, 2).join(' · ') || 'No depth data')}${g.experience.confidence === 'features' ? ' · estimated' : ''}</span></div>
      <div class="gtile"><small>Travel</small><strong>${esc(g.travel.level)}</strong><span>${esc(g.travel.detail)}${g.travel.personal ? ' from your start' : ' · set a start in Get me here for a personal rating'}</span></div>
      <div class="gtile"><small>Exposure</small><strong>${esc(g.exposure || 'Check locally')}</strong><span>${g.deep ? `At depth: ${esc(g.deep)} · confirm bottom conditions` : inland?.constant != null ? 'Steady groundwater temperature' : 'Planning guide · confirm bottom temperature'}</span></div>
      ${depthTile(site)}
      <div class="gtile"><small>Water · elevation</small><strong>${esc(inland?.kindLabel || 'Freshwater')}${inland?.elevation != null ? ` · ${elevText(inland.elevation)}` : ''}</strong><span>${inland?.altitude ? 'Altitude dive (above 1,000 ft) — altitude tables. ' : inland?.elevation != null ? 'Normal dive (under 1,000 ft). ' : ''}Freshwater: less buoyancy — you may need a little less weight.</span></div>
    </div><p class="note">Estimates from freshwater sightings, site features, local climate, elevation and your route. Confirm conditions and requirements with the site.</p>`;
    const temperature = !r.inland && temps?.length === 12 ? ` · ${temp(temps[state.month])} surface` : '';
    return `<div class="section-label">At a glance · ${months[state.month]}</div><div class="glance-grid">
      <div class="gtile"><small>Major marine life</small>${g.life ? `<strong class="stars">${stars(g.life.stars)}</strong><span>${esc(g.life.label)}${g.life.drivers.length ? ` · ${esc(g.life.drivers.join(', '))}` : ''}</span>` : '<strong>—</strong><span>No sighting records nearby</span>'}</div>
      <div class="gtile"><small>Experience</small><strong>${esc(g.experience.level)}</strong><span>${esc(g.experience.reasons.slice(0, 2).join(' · ') || 'No depth or current data')}${g.experience.confidence === 'features' ? ' · estimated' : ''}</span></div>
      <div class="gtile"><small>Travel</small><strong>${esc(g.travel.level)}</strong><span>${esc(g.travel.detail)}${g.travel.personal ? ' from your start' : ' · set a start in Get me here for a personal rating'}</span></div>
      ${depthTile(site)}
      <div class="gtile"><small>Visibility · estimated</small>${g.vis ? `<strong>${visText(g.vis)}</strong><span>From satellite water clarity offshore (NOAA VIIRS, ${months[state.month]} average). Local visibility varies with weather, tides and runoff.</span>` : `<strong>—</strong><span>${r.inland ? 'Freshwater — satellite clarity does not apply; ask locally' : 'No satellite clarity data near this site'}</span>`}</div>
      <div class="gtile"><small>Exposure</small><strong>${esc(g.exposure || 'Check locally')}</strong><span>${r.inland ? 'Freshwater — ask about temperature at depth' : `${months[state.month]}${temperature} · colder at depth`}</span></div>
    </div><p class="note">Estimates from recorded sightings, published depth and site features, water temperature, satellite water clarity and your route. Confirm conditions and requirements with a local operator.</p>`;
  }
  function glanceLine(r, site) {
    const g = glanceParts(r);
    if (!g) return '';
    return [r.inland ? '<span>Freshwater</span>' : '', g.life ? `<span class="stars">${stars(g.life.stars)}</span>` : '', `<span>${esc(g.experience.level)}</span>`, `<span>${esc(g.travel.level)} ${g.travel.personal ? 'trip' : 'access'}</span>`, site?.maxDepthMeters && !site.depthIsWholeLake ? `<span>${depthText(site.maxDepthMeters)} max</span>` : '', g.vis ? `<span>${visText(g.vis)} vis</span>` : '', g.exposure ? `<span>${esc(g.exposure)}</span>` : ''].filter(Boolean).join('');
  }
  // Same-named levels (Hawaii island › Hawaii state) are told apart by kind.
  // A glance at the tapped spot: photos of common life, water this month, nearby diving and what's in season.
  function showQuickLook(latlng, look) {
    const place = look.place ? look.place.name : selected?.kind === 'province' || selected?.kind === 'region' ? selected.name : 'Open water';
    const now = look.animals.filter(a => a.months.includes(state.month));
    const photos = look.animals.map(a => `<figure title="${esc(a.common)} · ${esc(a.photo.attribution)}"><img src="${esc(a.photo.url)}" alt="${esc(a.common)}" loading="lazy"><figcaption>${esc(a.common)}</figcaption></figure>`).join('');
    const stats = [look.temps?.length === 12 ? `<span><b>${temp(look.temps[state.month])}</b>${months[state.month]} surface</span>` : '',
      look.scope === 'place' ? `<span><b>${look.placeSites.toLocaleString()}</b>${look.placeSites === 1 ? 'dive site' : 'dive sites'} in ${esc(place)}</span>`
        : `<span><b>${look.nearby}</b>${look.nearby === 1 ? 'site' : 'sites'} within ${imperial ? '30 mi' : '50 km'}</span>`].filter(Boolean).join('');
    const html = `<div class="quick"><div class="quick-head"><div class="quick-title">${esc(place)}</div><button class="quick-close" aria-label="Close quick look">×</button></div>
      <div class="quick-sub">${look.scope === 'place' && look.animals.length ? `Most-seen marine life in ${esc(place)}` : look.lens ? `Seen across the ${esc(look.lens)}` : look.animals.length ? (look.local ? 'Most-seen marine life here' : `Marine life seen near ${esc(look.nearArea || 'here')}`) : 'No marine-life records close by'}</div>
      ${photos ? `<div class="quick-photos">${photos}</div>` : ''}
      <div class="quick-stats">${stats}</div>
      ${now.length ? `<div class="quick-season">● In season in ${months[state.month]}: ${now.map(a => esc(a.common)).join(', ')}</div>` : ''}
      ${look.nearest ? `<button class="quick-link" data-quick-site="${esc(look.nearest.id)}">Nearest site · ${esc(look.nearest.name)} · ${distText(look.nearest.km)} ${icon('arrow')}</button>` : ''}
      ${photos ? `<small class="quick-credit">Photos: ${look.animals.map(a => esc(a.photo.attribution.replace(/^\(c\)\s*/i, '').split(',')[0])).join(' · ')}</small>` : ''}</div>`;
    const sheetTop = $('sheet').hidden ? window.innerHeight : $('sheet').getBoundingClientRect().top;
    L.popup({ className: 'quick-popup', closeButton: false, maxWidth: 260, minWidth: 236, autoPanPaddingTopLeft: [16, 110], autoPanPaddingBottomRight: [84, Math.max(40, window.innerHeight - sheetTop + 16)] })
      .setLatLng(latlng).setContent(html).openOn(map);
    document.querySelector('.quick .quick-close').onclick = event => { event.stopPropagation(); quickTap = null; map.closePopup(); };
    const link = document.querySelector('.quick [data-quick-site]');
    if (link) link.onclick = () => { const site = DATA.sites.find(item => item.id === link.dataset.quickSite); if (site) choose({ ...site, kind: 'site' }, true); };
  }
  const crumbName = (p, places) => places.filter(other => other.name === p.name).length > 1 ? `${p.name} ${p.kind === 'island' ? 'island' : p.kind === 'state' ? 'state' : ''}`.trim() : p.name;
  const crumbs = places => places.length ? `<div class="crumbs">${places.map(p => `<button data-place-kind="${esc(p.kind)}" data-place-id="${esc(p.id)}">${esc(crumbName(p, places))} ${icon('arrow')}</button>`).join('')}</div>` : '';
  function placeDetails(p) {
    const c = p.character;
    const listed = p.siteIds.map(id => DATA.sites.find(site => site.id === id)).filter(Boolean);
    const shown = showAllSites ? listed : listed.slice(0, 40);
    let html = crumbs(p.parents);
    html += `<div class="region-summary"><strong>${c.total.toLocaleString()}</strong><span>mapped dive sites</span><strong>${c.depth ? `${depthText(c.depth.low).split(' ')[0]}–${depthText(c.depth.high)}` : '—'}</strong><span>typical published max depth</span></div>`;
    if (c.summary) html += `<p class="region-story">${esc(c.summary)}</p>`;
    if (c.topologies.length) html += `<div class="chip-label">What the diving is like</div><div class="chips">${c.topologies.map(([t, n]) => `<span>${esc(t)} · ${n}</span>`).join('')}${c.shore ? `<span>shore entry · ${c.shore}</span>` : ''}${c.boat ? `<span>boat · ${c.boat}</span>` : ''}</div>`;
    html += temperatureCard(p, p.season.temps);
    html += guideSection(p.season);
    if (p.children.length) html += `<div class="section-label">${p.id === 'US' ? 'States & islands' : 'Islands'}</div><div class="area-list">${p.children.map(ch => `<button class="area-row" data-place-kind="${esc(ch.kind)}" data-place-id="${esc(ch.id)}"><span><strong>${esc(ch.name)}</strong><small>${ch.count} mapped ${ch.count === 1 ? 'site' : 'sites'}</small></span>${icon('arrow')}</button>`).join('')}</div>`;
    if (p.areas.length) html += `<div class="section-label">Featured dive areas</div><div class="area-list">${p.areas.map((area, index) => `<button class="area-row" data-area="${index}"><span><strong>${esc(area.name)}</strong><small>${esc(area.subtitle)}</small></span>${icon('arrow')}</button>`).join('')}</div>`;
    if (listed.length) html += `<div class="section-label">Dive sites · ${listed.length}</div>${shown.map(site => `<button class="result" data-site-id="${esc(site.id)}">${icon('site')}<span><strong>${esc(site.name)}</strong><small>${esc([site.siteType, site.maxDepthMeters && !site.depthIsWholeLake ? depthText(site.maxDepthMeters) : '', site.entry].filter(Boolean).join(' · '))}</small></span></button>`).join('')}${listed.length > shown.length ? `<button class="cluster-zoom" id="all-sites">Show all ${listed.length} sites ${icon('arrow')}</button>` : ''}`;
    else html += '<p class="note">No dive sites are mapped here yet. Explore the coast or nearby islands.</p>';
    return html;
  }
  // `known` (12 monthly °C from the native guide) uses the nearest valid offshore cell for coastal points.
  function temperatureCard(item, known) {
    if (!state.layers.temperature || item.siteType === 'quarry') return '';
    const at = index => known?.length === 12 ? known[index] : MODEL.temperatureAt(DATA.temperature, item.latitude, item.longitude, index);
    const value = at(state.month);
    const profile = months.map((month, index) => ({ month, value: at(index) }));
    const valid = profile.filter(point => point.value != null);
    const coolest = valid.length ? valid.reduce((a, b) => a.value < b.value ? a : b) : null;
    const warmest = valid.length ? valid.reduce((a, b) => a.value > b.value ? a : b) : null;
    const bars = valid.length ? `<div class="climate-chart" aria-label="Monthly average sea-surface temperature profile">${profile.map((point, index) => `<span class="${index === state.month ? 'current' : ''}" title="${point.month}: ${temp(point.value)}"><i style="height:${point.value == null ? 3 : Math.max(7, Math.min(100, (point.value + 2) / 34 * 100))}%"></i><b>${point.month[0]}</b></span>`).join('')}</div><div class="climate-range"><span>Coolest<br><strong>${coolest.month} · ${temp(coolest.value)}</strong></span><span>Warmest<br><strong>${warmest.month} · ${temp(warmest.value)}</strong></span></div>` : '';
    return `<div class="temp-stat"><span>${months[state.month]} · average sea surface<br>1991–2020 · regional 2° grid</span><strong>${temp(value)}</strong></div>${bars}${value == null ? '<p class="note">No ocean temperature in this grid cell. Coastal, inland and missing cells can have no value.</p>' : '<p class="note">A broad surface climatology, not today’s conditions, visibility, current, waves or temperature at dive depth.</p>'}`;
  }
  function animalCard(species) {
    const status = MODEL.seasonStatus(species, state.month);
    return `<article class="animal"><div class="animal-top"><div><h3>${esc(species.name)}</h3><p class="scientific">${esc(species.scientific)}</p></div><span class="status ${species.months.includes(state.month + 1) ? 'active' : ''}">${status}</span></div><div class="calendar" aria-label="${esc(species.season)}">${months.map((m, i) => `<span class="${species.months.includes(i + 1) ? 'active ' : ''}${state.month === i ? 'current' : ''}">${m[0]}</span>`).join('')}</div><p class="season-text">${esc(species.season)}</p><p class="note">${esc(species.note)}</p><a class="source" href="${esc(species.url)}">${esc(species.source)} ↗</a></article>`;
  }
  function wildlifeDetails(region) {
    if (!state.layers.wildlife) return '';
    if (!region) return '<div class="section-label">Marine life</div><p class="note">We haven’t added a species guide for this area yet. Explore a marked region to see documented marine life and seasonal windows.</p>';
    const species = region.species.filter(s => state.species === 'all' || state.species === s.id);
    return `<div class="section-label">${esc(region.name)} · marine life</div>${species.length ? [...species].sort((a, b) => Number(b.months.includes(state.month + 1)) - Number(a.months.includes(state.month + 1))).map(animalCard).join('') : '<p class="note">The selected species is not documented in this regional guide. Choose “All marine life” to explore the available species.</p>'}<p class="note">Regional guidance, not a complete species inventory. Encounters vary; seasonal windows do not guarantee sightings.</p>`;
  }
  function provinceDetails(region) {
    if (!state.layers.regions || !region) return '';
    return `<div class="section-label">Regional lens · habitats & life</div><p class="region-story">${esc(region.story)}</p><div class="region-fact">${esc(region.fact)}</div><div class="chip-label">Habitats</div><div class="chips">${region.habitats.map(value => `<span>${esc(value)}</span>`).join('')}</div><div class="chip-label">Representative wildlife groups</div><div class="chips wildlife-chips">${region.wildlife.map(value => `<span>${esc(value)}</span>`).join('')}</div><a class="source" href="${esc(region.url)}">${esc(region.source)} ↗</a><p class="note">Broad exploration context, not a biological range or a prediction for this exact point. Presence, abundance and safe diving conditions vary locally and seasonally.</p>`;
  }
  function diveRegionDetails(region) {
    const mapped = DATA.sites.filter(site => MODEL.inBounds(region.bounds, site.latitude, site.longitude));
    return `<div class="region-summary"><strong>${region.areas.length}</strong><span>featured dive areas</span><strong>${mapped.length}</strong><span>mapped sites</span></div><p class="note">Choose an area to center the map and reveal its monthly conditions, marine-life guides and broader ocean context.</p><div class="section-label">Featured dive areas</div><div class="area-list">${region.areas.map((area, index) => `<button class="area-row" data-area="${index}"><span><strong>${esc(area.name)}</strong><small>${esc(area.subtitle)}</small></span>${icon('arrow')}</button>`).join('')}</div>${mapped.length ? `<div class="section-label">Mapped dive sites</div><div class="area-list">${mapped.slice(0, 14).map(site => `<button class="area-row" data-site-id="${esc(site.id)}"><span><strong>${esc(site.name)}</strong><small>${esc(site.siteType || site.region || 'Dive site')}</small></span>${icon('arrow')}</button>`).join('')}</div>${mapped.length > 14 ? `<p class="note">Showing 14 of ${mapped.length} mapped sites. Zoom into the region to explore the rest.</p>` : ''}` : '<div class="section-label">Mapped dive sites</div><p class="note">Precise site coverage is still growing here. The featured areas are regional starting points, not exact entries or moorings.</p>'}`;
  }
  function siteFacts(site) {
    const facts = [];
    if (site.maxDepthMeters) {
      // A lake's deepest point is not the dive's depth; a wreck's figure is the water it lies in.
      const label = site.depthIsWholeLake ? 'Lake’s deepest point' : site.topologies?.includes('wreck') ? 'Wreck lies in' : 'Max depth';
      const source = site.depthSource ? `<a class="fact-source" href="${esc(site.depthSource.url)}">${esc(site.depthSource.name)} ↗</a>` : '<em class="fact-source">published</em>';
      facts.push(`<span><small>${label}</small><strong>${depthText(site.maxDepthMeters)}</strong>${source}</span>`);
    }
    if (site.entry) facts.push(`<span><small>Entry</small><strong>${esc(site.entry)}</strong></span>`);
    if (site.environment) facts.push(`<span><small>Environment</small><strong>${esc(site.environment)}</strong></span>`);
    return `${facts.length ? `<div class="site-facts">${facts.join('')}</div>` : ''}${site.topologies?.length ? `<div class="chip-label">Site features</div><div class="chips">${site.topologies.map(value => `<span>${esc(value)}</span>`).join('')}</div>` : ''}`;
  }
  function diveRows(dives) {
    return dives.map(dive => {
      const date = dive.startTime ? new Date(dive.startTime) : null;
      const when = date && Number.isFinite(date.getTime()) ? date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Date not recorded';
      const depth = dive.maxDepthMeters == null ? 'Depth —' : `${Math.round(DATA.depthUnit === 'ft' ? dive.maxDepthMeters * 3.28084 : dive.maxDepthMeters)} ${DATA.depthUnit}`;
      return `<button class="dive-row" data-dive="${esc(dive.id)}"><span class="number">${dive.number ? '#' + esc(dive.number) : icon('dives')}</span><span class="copy"><strong>${esc(dive.name)}</strong><small>${when} · ${depth}${dive.durationSeconds == null ? '' : ' · ' + Math.round(dive.durationSeconds / 60) + ' min'}</small></span>${icon('arrow')}</button>`;
    }).join('');
  }
  function renderDetails() {
    updatePanels();
    if (!selected) { renderOverview(); return; }
    const s = selected;
    const journeyButton = $('get-me-here');
    journeyButton.hidden = !['site', 'area', 'place'].includes(s.kind) || (s.kind === 'place' && !s.journey);
    journeyButton.onclick = () => post('journey', { destination: s.kind === 'place' ? s.journey : { id: s.id, name: s.name, latitude: s.latitude, longitude: s.longitude, region: s.region, country: s.country, entry: s.entry } });
    $('detail-title').textContent = s.name || (s.kind === 'sources' ? 'Behind the atlas' : 'Locations here');
    $('detail-eyebrow').textContent = ({ diveRegion: 'DIVE REGION / QUICK EXPLORE', area: 'FEATURED DIVE AREA', region: 'MARINE LIFE / SEASON GUIDE', province: 'OCEAN REGION / EXPLORATION LENS', site: 'DIVE SITE', dive: 'YOUR LOGBOOK', ocean: 'OCEAN EXPLORER', sources: 'SOURCES & COVERAGE', cluster: 'EXPLORE LOCATIONS', place: s.label })[s.kind];
    if (s.kind === 'site' && native && siteGuides.get(guideKey(s))?.guide?.inland) $('detail-eyebrow').textContent = 'FRESHWATER DIVE SITE';
    $('detail-subtitle').textContent = s.subtitle || (Number.isFinite(s.latitude) ? `${Math.abs(s.latitude).toFixed(3)}°${s.latitude < 0 ? 'S' : 'N'} · ${Math.abs(s.longitude).toFixed(3)}°${s.longitude < 0 ? 'W' : 'E'}` : 'An atlas for discovery. Always confirm local conditions.');
    const glance = native && ['site', 'area'].includes(s.kind) ? glanceLine(siteGuides.get(guideKey(s))?.ratings, s) : '';
    $('glance').innerHTML = glance; $('glance').hidden = !glance;
    let body = '', clusterPreview = [];
    if (s.kind === 'sources') {
      body = `<div class="sources"><h3>Water temperature</h3><p>NOAA ERSSTv5 monthly sea-surface climatology, 1991–2020. The original 2° grid preserves missing cells. Display colors are smoothly interpolated, with limited coastal infilling and a detailed land mask; numeric readouts and monthly profiles use the original grid. Colors fade out at close zoom. These are regional averages, not live readings or dive-depth measurements; coastal values remain approximate.</p><a class="source" href="${esc(DATA.temperature.sourceUrl)}">NOAA PSL · source dataset ↗</a><h3>Ocean regions</h3><p>${DATA.oceanRegions.length} broad exploration lenses make every ocean tap useful. They summarize habitats and representative wildlife from NOAA, UNEP and national science agencies. The closest lens is selected geographically; it is not a legal, ecological or species-range boundary and never predicts an encounter at the tapped coordinate.</p><a class="source" href="https://portal.obis.org/data/access/">IOC-UNESCO OBIS · future biodiversity expansion ↗</a><h3>Dive locations</h3><p>${DATA.sites.length} bundled locations include ${globalSource.recordCount} community-maintained OpenDiveMap records, NOAA Florida Keys mooring locations, ${DATA.curatedSiteCount} government-referenced Cozumel reef areas, and the existing offline catalog. OpenDiveMap records are map-browsing data only and never automatically name a logged dive. Community coordinates and metadata can change; always confirm access, entry, depth and restrictions with a local operator. Cozumel reef-area pins are approximate browsing references, not navigation coordinates. The NOAA mooring download is dated February 2014 and does not establish current buoy availability.</p><a class="source" href="${esc(globalSource.sourceUrl)}">OpenDiveMap contributors · ${esc(globalSource.license)} ↗</a><br><a class="source" href="https://floridakeys.noaa.gov/mbuoy/allmbuoys.html">NOAA Florida Keys · published locations ↗</a><br><a class="source" href="https://www.gob.mx/conanp/es/articulos/estrategia-de-conservacion-para-arrecifes-saludables-de-cozumel?idiom=es">CONANP · Cozumel reef references ↗</a><p>Contains GeoNames data, CC BY 4.0. Pin details retain their original attribution.</p><h3>Seasonal marine life</h3><p>${DATA.regions.length} focused guides include sourced species and encounter windows. Empty months mean seasonality is not documented. Guide areas are browsing aids, not scientific range polygons.</p><h3>Your dives</h3><p>Only saved dives with valid coordinates appear. Deleted dives and unconfirmed location suggestions are excluded. The month selector changes ocean conditions and wildlife guidance; your dive history stays visible across all dates. Dive records stay on this device; no logbook data is uploaded by the atlas. Online basemap requests reveal the area being viewed to the tile provider.</p><h3>Maps & offline use</h3><p>Natural Earth 1:10 million public-domain coastlines, Leaflet (BSD-2-Clause) and geojson-vt (ISC) are bundled. OpenStreetMap tiles need a connection and stay on the same map layer at every zoom. Coastlines are generalized, not navigation charts. Ocean averages, regional lenses, species guides and saved pins remain available offline.</p><a class="source" href="https://www.openstreetmap.org/copyright">OpenStreetMap attribution & licence ↗</a></div>`;
    } else if (s.kind === 'place') {
      body = placeDetails(s);
    } else if (s.kind === 'diveRegion') {
      body = diveRegionDetails(s) + regionExtras(s);
    } else if (s.kind === 'cluster') {
      clusterPreview = [...s.items].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 30);
      body = `<button class="cluster-zoom" id="cluster-zoom">Zoom into all ${s.items.length.toLocaleString()} locations ${icon('arrow')}</button><div class="section-label">Sites in this group</div>${clusterPreview.map((item, i) => `<button class="result" data-cluster="${i}">${icon(s.pinKind === 'dives' ? 'dives' : 'site')}<span><strong>${esc(item.name)}</strong><small>${s.pinKind === 'dives' ? item.dives.length + ' logged dives' : esc(item.siteType)}</small></span></button>`).join('')}${s.items.length > clusterPreview.length ? `<p class="note">Showing 30 of ${s.items.length.toLocaleString()} locations. Zoom into the group to reveal smaller clusters and individual pins.</p>` : ''}`;
    } else if (s.kind === 'dive') {
      body = `<div class="section-label">${s.dives.length} ${s.dives.length === 1 ? 'dive' : 'dives'} at this location</div>${diveRows(s.dives)}`;
    } else {
      const inlandGuide = native && ['site', 'area'].includes(s.kind) ? siteGuides.get(guideKey(s))?.guide?.inland : null;
      body = inlandGuide ? inlandConditions(inlandGuide) : temperatureCard(s, native && ['site', 'area'].includes(s.kind) ? siteGuides.get(guideKey(s))?.guide?.temps : null);
      if (s.kind === 'site') body += `<div class="section-label">${[s.siteType || 'Dive location', s.region || s.country].filter(Boolean).map(esc).join(' · ')}</div>${siteFacts(s)}<p class="note">${esc(s.note || (['global', 'osm'].includes(s.catalog) ? 'Community-maintained map record. Confirm the exact entry, access, depth, hazards and current conditions with a local operator.' : 'Catalog location. Confirm entry, access and current conditions with a local operator.'))}</p>${(s.sources || []).map(source => `<a class="source" href="${esc(source.sourceUrl)}">${esc(source.sourceName)} · ${esc(source.dataLicense || '')} ↗</a>`).join('<br>')}`;
      if (s.kind === 'area') body += `<div class="section-label">Regional starting point · ${esc(s.region)}</div><p class="note">${esc(s.subtitle)}. This pin centers a broad dive area, not a precise entry, mooring or operator location.</p>`;
      const nativeGuide = native && ['site', 'area'].includes(s.kind) ? siteGuides.get(guideKey(s)) : undefined;
      // Photo of the wreck or inland site itself (openly licensed), when one exists.
      const photo = nativeGuide?.photo;
      const hero = photo ? `<figure class="site-photo"><img src="${esc(photo.url)}" alt="${esc(s.name)}" loading="lazy"><a href="${esc(photo.page)}">📷 ${esc(photo.attribution)} ↗</a></figure>` : '';
      if (native && ['site', 'area'].includes(s.kind)) body = hero + crumbs(nativeGuide?.places || []) + glanceTiles(nativeGuide?.ratings, nativeGuide?.guide?.temps, nativeGuide?.guide?.inland, s) + body + guideSection(nativeGuide?.guide);
      const focusedRegion = state.layers.wildlife && !(native && ['site', 'area'].includes(s.kind)) ? (s.kind === 'region' ? s : MODEL.regionAt(DATA.regions, s.latitude, s.longitude)) : null;
      if (focusedRegion) body += wildlifeDetails(focusedRegion);
      else if (state.layers.wildlife && !state.layers.regions) body += wildlifeDetails(null);
      // The broad ocean lens is for ocean taps and region cards only: on a site it can name a far-away
      // region (an Ohio quarry is "nearest" the Caribbean anchor) with habitats that don't apply.
      if (!focusedRegion && !['site', 'area'].includes(s.kind)) body += provinceDetails(s.kind === 'province' ? s : MODEL.oceanRegionAt(DATA.oceanRegions, s.latitude, s.longitude));
      if (s.kind === 'province') body += regionExtras(s);
      if (!state.layers.regions && !state.layers.wildlife && !state.layers.temperature && s.kind === 'ocean') body = '<p class="note">Switch on Ocean regions, Water temperature or Seasonal wildlife to explore this location.</p>';
    }
    // Keep the scroll position only while re-rendering the same item (e.g. when its guide data arrives);
    // a different site or guide always starts at the top.
    const scroll = scrollOwner === selected ? $('detail-body').scrollTop : 0;
    scrollOwner = selected;
    if (native && ['site', 'area', 'place'].includes(s.kind) && Number.isFinite(s.latitude) && Number.isFinite(s.longitude)) body = `<button id="gear-for-dive" class="destination">Gear for this dive →</button><p class="note">Your setups and exposure combinations · selected month</p>` + body;
    $('detail-body').innerHTML = body;
    if ($('gear-for-dive')) $('gear-for-dive').onclick = () => post('gearAdvice', { id: s.kind === 'site' ? s.id : null, name: s.name, latitude: s.latitude, longitude: s.longitude, month: state.month });
    $('detail-body').scrollTop = scroll;
    $('detail-body').querySelectorAll('[data-dive]').forEach(button => button.onclick = () => post('openDive', { id: button.dataset.dive }));
    $('detail-body').querySelectorAll('[data-place-kind]').forEach(button => button.onclick = () => post('openPlace', { kind: button.dataset.placeKind, id: button.dataset.placeId }));
    $('detail-body').querySelectorAll('[data-region-area]').forEach(button => button.onclick = () => choose({ ...regionGuides.get(regionKey(s)).areas[Number(button.dataset.regionArea)], kind: 'area' }, true));
    $('detail-body').querySelectorAll('[data-season-month]').forEach(button => button.onclick = () => { state.month = Number(button.dataset.seasonMonth); render(); });
    if ($('all-sites')) $('all-sites').onclick = () => { showAllSites = true; renderDetails(); };
    $('detail-body').querySelectorAll('[data-cluster]').forEach(button => button.onclick = () => choose({ ...clusterPreview[Number(button.dataset.cluster)], kind: s.pinKind === 'dives' ? 'dive' : 'site' }));
    if ($('cluster-zoom')) $('cluster-zoom').onclick = () => { closeDetails(); fitTo(s.items.map(item => [item.latitude, item.longitude]), { padding: [60, 100], maxZoom: Math.min(map.getZoom() + 3, 15) }, .7); };
    $('detail-body').querySelectorAll('[data-area]').forEach(button => button.onclick = () => choose({ ...s.areas[Number(button.dataset.area)], kind: 'area' }, true));
    $('detail-body').querySelectorAll('[data-site-id]').forEach(button => button.onclick = () => {
      const site = DATA.sites.find(item => item.id === button.dataset.siteId);
      if (site) choose({ ...site, kind: 'site' }, true);
    });
  }
  function renderOverview() {
    let headline = 'A whole ocean to explore.', copy = 'Find your next dive, follow the seasons, and revisit the places you’ve been.';
    let status = `${DATA.diveRegions.length} dive regions · ${DATA.oceanRegions.length} ocean lenses · ${DATA.sites.length} mapped sites`;
    if (state.layers.dives) {
      const count = logPins.reduce((sum, pin) => sum + pin.dives.length, 0);
      headline = logStatus === 'error' ? 'Your logbook couldn’t load.' : logStatus === 'loading' ? 'Finding your dives…' : count ? `${count} dives. Your ocean story.` : 'Your story starts with a pin.';
      copy = logStatus === 'error' ? 'Tap Retry to load your saved dives.' : count ? 'Gold pins open the dives you logged at each location.' : 'Add coordinates to a dive in your logbook and it will appear here.';
      status = logStatus === 'ready' ? `${count} mapped dives · ${missingCount} without coordinates · all dates` : 'Your saved dive locations';
    }
    const candidates = eligibleRegions();
    const remoteStart = state.month % DATA.remoteAreas.length;
    const remote = Array.from({ length: 4 }, (_, index) => DATA.remoteAreas[(remoteStart + index) % DATA.remoteAreas.length]);
    $('overview').innerHTML = `<div class="panel-heading"><div class="eyebrow">${state.layers.dives ? 'YOUR DIVES, ON THE MAP' : 'THE WORLD BELOW THE SURFACE'}</div><button id="close-browse" class="panel-close" aria-label="Close discover">×</button></div><h2>${headline}</h2><p>${copy}</p>${state.layers.dives ? `<div class="destinations"><button class="destination" id="see-dives">${logStatus === 'error' ? 'Retry' : logPins.length ? 'Show my dives' : 'Open logbook'}</button></div>` : `<div class="section-label">Popular dive regions</div><div class="destinations">${DATA.diveRegions.map(r => `<button class="destination" data-dive-region="${r.id}">${esc(r.name)}</button>`).join('')}</div><div class="section-label">Seasonal wildlife spotlights</div><div class="destinations compact">${candidates.slice(0, 4).map(r => `<button class="destination" data-region="${r.id}">${esc(r.name)}</button>`).join('')}</div><div class="section-label">Remote & standalone</div><div class="destinations compact">${remote.map(area => `<button class="destination" data-remote="${area.id}">${esc(area.name)}</button>`).join('')}</div>`}<div class="summary-line"><span class="dot"></span>${status}</div>`;
    $('close-browse').onclick = () => openPanel('browse');
    $('overview').querySelectorAll('[data-region]').forEach(button => button.onclick = () => {
      state.layers.wildlife = true; render();
      choose({ ...DATA.regions.find(r => r.id === button.dataset.region), kind: 'region' }, true);
    });
    $('overview').querySelectorAll('[data-dive-region]').forEach(button => button.onclick = () => {
      state.layers.regions = true; render();
      openDiveRegion(DATA.diveRegions.find(r => r.id === button.dataset.diveRegion));
    });
    $('overview').querySelectorAll('[data-remote]').forEach(button => button.onclick = () => {
      state.layers.regions = true; render();
      choose({ ...DATA.remoteAreas.find(area => area.id === button.dataset.remote), kind: 'area' }, true);
    });
    if ($('see-dives')) $('see-dives').onclick = () => {
      if (logStatus === 'error') post('retryLogs');
      else if (logPins.length) { panel = null; updatePanels(); fitTo(logPins.map(p => [p.latitude, p.longitude]), { padding: [50, 100], maxZoom: 11 }, .9); }
      else post('openLogbook');
    };
  }
  function render() {
    document.querySelectorAll('[data-layer]').forEach(b => b.setAttribute('aria-pressed', String(state.layers[b.dataset.layer])));
    document.querySelectorAll('[data-month]').forEach(b => b.setAttribute('aria-pressed', String(Number(b.dataset.month) === state.month)));
    $('species-bar').hidden = !state.layers.wildlife; $('species').value = state.species;
    $('legend').hidden = !state.layers.temperature;
    $('units').textContent = `°${state.unit} ⇄`;
    $('legend-values').innerHTML = [0, 8, 16, 24, 32].map(v => `<span>${temp(v)}</span>`).join('');
    $('month-label').textContent = `${months[state.month]} · Season`;
    const current = new Date().getMonth();
    $('current-month').textContent = state.month === current ? `Current month · ${months[current]}` : `Return to current month · ${months[current]}`;
    $('current-month').classList.toggle('active', state.month === current);
    $('layer-count').textContent = Object.values(state.layers).filter(Boolean).length;
    heat.setMonth(state.month);
    if (state.layers.temperature) { if (!map.hasLayer(heat)) heat.addTo(map); } else map.removeLayer(heat);
    updateBase(); drawPins(); renderDetails(); persist();
  }
  function search() {
    const query = $('search').value.trim().toLowerCase();
    $('clear-search').hidden = !query;
    if (!query) { $('results').hidden = true; return; }
    const matches = [
      ...DATA.diveRegions.map(r => ({ ...r, kind: 'diveRegion', searchText: [r.name, r.subtitle, ...r.areas.flatMap(area => [area.name, area.subtitle])].join(' ') })),
      ...DATA.diveRegions.flatMap(r => r.areas.map(area => ({ ...area, kind: 'area', searchText: `${area.name} ${area.subtitle} ${r.name}` }))),
      ...DATA.remoteAreas.map(area => ({ ...area, kind: 'area', searchText: `${area.name} ${area.subtitle} remote standalone` })),
      ...DATA.regions.map(r => ({ ...r, kind: 'region', searchText: [r.name, r.subtitle, ...r.species.map(s => `${s.name} ${s.scientific}`)].join(' ') })),
      ...DATA.oceanRegions.map(r => ({ ...r, kind: 'province', searchText: [r.name, r.subtitle, r.story, ...r.habitats, ...r.wildlife].join(' ') })),
      ...DATA.sites.map(s => ({ ...s, kind: 'site', searchText: `${s.name} ${(s.aliases || []).join(' ')} ${s.region || ''} ${s.country || ''} ${(s.topologies || []).join(' ')} ${s.entry || ''}` })),
      ...logPins.map(p => ({ ...p, kind: 'dive', searchText: p.name })),
    ].filter(item => item.searchText.toLowerCase().includes(query)).slice(0, 18);
    $('results').innerHTML = matches.length ? matches.map((item, i) => `<button class="result" data-result="${i}">${icon(item.kind === 'region' ? 'wildlife' : item.kind === 'province' || item.kind === 'diveRegion' || item.kind === 'area' ? 'globe' : item.kind === 'dive' ? 'dives' : 'site')}<span><strong>${esc(item.name)}</strong><small>${esc(item.kind === 'diveRegion' ? item.subtitle : item.kind === 'area' ? `${item.region} · ${item.subtitle}` : item.kind === 'region' || item.kind === 'province' ? item.subtitle : item.kind === 'dive' ? 'Your logbook' : item.region || 'Dive site')}</small></span></button>`).join('') : '<div class="empty">No matches in the current atlas. Try Caribbean, Philippines, kelp, manta, Hawaiʻi, or a saved dive site.</div>';
    $('results').hidden = false;
    $('results').querySelectorAll('[data-result]').forEach(button => button.onclick = () => {
      const item = matches[Number(button.dataset.result)];
      state.layers[item.kind === 'region' ? 'wildlife' : item.kind === 'province' || item.kind === 'diveRegion' || item.kind === 'area' ? 'regions' : item.kind === 'dive' ? 'dives' : 'sites'] = true;
      if (item.kind === 'region') state.species = 'all';
      $('search').value = ''; $('search').blur(); search(); render();
      if (item.kind === 'diveRegion') openDiveRegion(item); else choose(item, true);
    });
  }
  $('search').oninput = search;
  $('clear-search').onclick = () => { $('search').value = ''; search(); };
  $('back').onclick = () => post('back');
  $('close').onclick = closeDetails;
  function expandDetails(expanded) {
    document.body.classList.toggle('detail-expanded', expanded);
    // A collapsed (hidden) body ignores scrollTop, so reset once it is visible again for a new item.
    if (expanded && expandedOwner !== selected) { $('detail-body').scrollTop = 0; requestAnimationFrame(() => { $('detail-body').scrollTop = 0; }); }
    if (expanded) expandedOwner = selected;
    $('expand').setAttribute('aria-expanded', String(expanded));
    $('expand').setAttribute('aria-label', expanded ? 'Collapse details' : 'Expand details');
    $('expand').textContent = expanded ? 'Collapse ↓' : 'View guide ↑';
  }
  $('expand').onclick = () => expandDetails(!document.body.classList.contains('detail-expanded'));
  $('layers-toggle').onclick = () => openPanel('layers');
  $('season-toggle').onclick = () => openPanel('season');
  $('browse-toggle').onclick = () => openPanel('browse');
  $('search-toggle').onclick = () => openPanel('search');
  document.querySelectorAll('[data-dismiss]').forEach(button => button.onclick = () => { panel = null; updatePanels(); });
  $('info').onclick = $('credits').onclick = () => choose({ kind: 'sources' });
  $('world').onclick = () => { panel = null; closeDetails(); fitTo([[-55, -170], [75, 170]], { paddingTopLeft: [18, 85], paddingBottomRight: [18, 95] }, 1); };
  $('locate').onclick = () => post('locate');
  $('zoom-in').onclick = () => map.zoomIn(); $('zoom-out').onclick = () => map.zoomOut();
  $('units').onclick = () => { state.unit = state.unit === 'C' ? 'F' : 'C'; render(); };
  $('species').onchange = () => { state.species = $('species').value; render(); };
  document.querySelectorAll('[data-layer]').forEach(button => button.onclick = () => {
    const layer = button.dataset.layer; state.layers[layer] = !state.layers[layer];
    if ((layer === 'regions' && ['province', 'diveRegion', 'area'].includes(selected?.kind)) || (layer === 'wildlife' && selected?.kind === 'region') || (layer === 'sites' && selected?.kind === 'site') || (layer === 'dives' && selected?.kind === 'dive')) closeDetails();
    render();
  });
  document.querySelectorAll('[data-month]').forEach(button => button.onclick = () => { state.month = Number(button.dataset.month); render(); });
  $('current-month').onclick = () => { state.month = new Date().getMonth(); render(); };
  // Links leave the app, so only a deliberate tap opens one: not the end of a scroll or swipe
  // (finger moved), and not a tap that stops a scroll still gliding (momentum).
  let press = null, lastScroll = 0;
  document.addEventListener('touchstart', event => { const t = event.touches[0]; press = { x: t.clientX, y: t.clientY, at: Date.now(), moved: false }; }, { passive: true, capture: true });
  document.addEventListener('touchmove', event => { const t = event.touches[0]; if (press && Math.hypot(t.clientX - press.x, t.clientY - press.y) > 8) press.moved = true; }, { passive: true, capture: true });
  document.addEventListener('scroll', () => { lastScroll = Date.now(); }, { passive: true, capture: true });
  document.addEventListener('click', event => {
    const anchor = event.target.closest('a');
    if (!anchor) return;
    event.preventDefault();
    const deliberate = !press || (!press.moved && lastScroll < press.at - 250 && Date.now() - press.at < 700);
    if (deliberate) post('external', { url: anchor.href });
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { panel = null; closeDetails(); $('results').hidden = true; } });
  window.atlasReceive = message => {
    if (message.type === 'logs') {
      logPins = message.pins; logStatus = message.status; missingCount = message.missingCount || 0;
      if (selected?.kind === 'dive') {
        const updated = logPins.find(pin => pin.id === selected.id);
        if (updated) selected = { ...updated, kind: 'dive' }; else closeDetails();
      }
      render();
    } else if (message.type === 'preferences') {
      const saved = message.value;
      if (saved && typeof saved === 'object') {
        if (['C', 'F'].includes(saved.unit)) state.unit = saved.unit;
        if (saved.species === 'all' || DATA.regions.some(r => r.species.some(s => s.id === saved.species))) state.species = saved.species;
        Object.keys(state.layers).forEach(key => { if (typeof saved.layers?.[key] === 'boolean') state.layers[key] = saved.layers[key]; });
      }
      readyForPersistence = true; render();
    } else if (message.type === 'location') {
      flyTo([message.latitude, message.longitude], 9, 1);
      if (window.atlasLocationMarker) map.removeLayer(window.atlasLocationMarker);
      window.atlasLocationMarker = L.circleMarker([message.latitude, message.longitude], { pane: 'vectors', interactive: false, radius: 7, color: '#fff', weight: 2, fillColor: '#5797ff', fillOpacity: 1 }).addTo(map);
    } else if (message.type === 'siteGuide') {
      if (message.key) siteGuides.set(message.key, { guide: message.guide, places: message.places || [], ratings: message.ratings || null, photo: message.photo || null });
      if (selected && ['site', 'area'].includes(selected.kind) && guideKey(selected) === message.key) renderDetails();
    } else if (message.type === 'quickLook') {
      if (quickTap?.requestId === message.requestId && message.look) showQuickLook(quickTap.latlng, message.look);
    } else if (message.type === 'originChanged') {
      // Travel ratings are personal: refresh them for the new starting point.
      siteGuides.clear();
      if (selected && ['site', 'area'].includes(selected.kind)) post('siteGuide', { requestId: ++guideRequest, key: guideKey(selected), latitude: selected.latitude, longitude: selected.longitude, id: selected.kind === 'site' ? selected.id : undefined });
    } else if (message.type === 'regionGuide') {
      if (message.key && message.guide) regionGuides.set(message.key, message.guide);
      if (selected && ['province', 'diveRegion'].includes(selected.kind) && regionKey(selected) === message.key) renderDetails();
    } else if (message.type === 'place') {
      const tap = pendingTap;
      if (message.requestId != null && tap?.requestId !== message.requestId) return;
      if (message.place) choose({ ...message.place, kind: 'place', latitude: message.place.journey?.latitude, longitude: message.place.journey?.longitude, fromTap: Boolean(tap) }, message.fly || !tap);
      else if (tap) choose(tap.fallback);
    } else if (message.type === 'notice') toast(message.text);
  };
  render();
  post('ready');
}
