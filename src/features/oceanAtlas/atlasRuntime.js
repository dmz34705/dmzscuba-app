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
    return { id: `osm-${osmId}`, name, latitude, longitude, country: '', region: '', environment: fresh ? 'fresh' : 'ocean', topologies, entry: ['', 'boat', 'shore'][entryCode],
      maxDepthMeters: depth || null, aliases: [], coordinateQuality: 'community', catalog: 'osm',
      siteType: topologies[0] ? `${topologies[0][0].toUpperCase()}${topologies[0].slice(1)} dive` : fresh ? 'Freshwater dive site' : 'Dive site',
      sources: [{ sourceName: osm.source, sourceUrl: `https://www.openstreetmap.org/${type}/${osmId.slice(1)}`, dataLicense: osm.license, coordinateQuality: 'community' }] };
  }));
  // Supplementary sites: NOAA Thunder Bay moorings, Wikipedia, curated US inland (scripts/import-extra-dive-sites.cjs).
  const extra = DATA.extraSites;
  if (extra?.sites) DATA.sites.push(...extra.sites.map(([id, name, latitude, longitude, depth, entryCode, mask, fresh, source, url, protection]) => {
    const topologies = extra.topologyCodes.filter((_, code) => mask & (1 << code));
    const origin = extra.sources[source] || { name: source, license: '' };
    return { id: `x-${id}`, name, latitude, longitude, country: '', region: '', environment: fresh ? 'fresh' : 'ocean', topologies, entry: ['', 'boat', 'shore'][entryCode],
      maxDepthMeters: depth || null, aliases: [], coordinateQuality: source === 'tbnms' ? 'published mooring' : 'community', catalog: 'osm',
      siteType: topologies[0] ? `${topologies[0][0].toUpperCase()}${topologies[0].slice(1)} dive` : fresh ? 'Freshwater dive site' : 'Dive site',
      // A protection note (licence needed, may be a war grave, listed wreck) comes first.
      // A source-wide caveat (reef-program positions) follows the row's own note.
      note: protection ? [protection, origin.note].filter(Boolean).join(' ') : source === 'curated' ? 'Well-known inland dive site. Access, fees and rules change — confirm with the site or park before visiting.' : source === 'tbnms' ? 'NOAA sanctuary shipwreck with a seasonal dive mooring. Protected: look, don\'t take.' : origin.note,
      sources: [{ sourceName: origin.name, sourceUrl: url ? (url[0] === '~' ? `https://en.wikipedia.org/wiki/${url.slice(1)}` : url) : origin.url, dataLicense: origin.license, coordinateQuality: 'community' }] };
  }));
  // Published depths (scripts/build-published-depths.cjs; same rule as catalog.js).
  for (const site of DATA.sites) {
    const row = DATA.publishedDepths?.depths?.[site.id];
    if (!row || (site.maxDepthMeters && row[1] !== 'Posted')) continue;
    site.maxDepthMeters = row[0]; site.depthSource = { name: row[1] === 'Posted' ? 'Posted by the site' : row[1], url: row[2] }; site.depthIsWholeLake = Boolean(row[3]);
  }
  // One site per place: records of the same site from several sources are merged (scripts/build-site-merges.cjs;
  // same rule as catalog.js applySiteMerges).
  {
    const byId = new Map(DATA.sites.map(site => [site.id, site]));
    const hidden = new Set();
    for (const [keepId, mergedIds, latitude, longitude, aliases, depth, independentSources] of DATA.siteMerges?.clusters || []) {
      const keep = byId.get(keepId);
      if (!keep) continue;
      const others = mergedIds.map(id => byId.get(id)).filter(Boolean);
      Object.assign(keep, {
        latitude, longitude, aliases: [...new Set([...(keep.aliases || []), ...aliases])], independentSources,
        topologies: [...new Set([keep, ...others].flatMap(site => site.topologies || []))],
        entry: keep.entry || others.find(site => site.entry)?.entry || '',
        environment: keep.environment || others.find(site => site.environment)?.environment || '',
        sources: [...(keep.sources || []), ...others.flatMap(site => site.sources || [])],
        // A protection note from any of the merged records wins over a generic one.
        note: [keep, ...others].map(site => site.note).find(note => /war grave|licence|protected|listed historic/i.test(note || '')) || keep.note,
      });
      if (depth && !keep.depthSource?.name?.startsWith('Posted')) keep.maxDepthMeters = depth;
      mergedIds.forEach(id => hidden.add(id));
    }
    // Wrecks closed to divers by law are never shown, whichever source listed them (catalog.js CLOSED_WRECKS).
    const closed = DATA.closedWrecks ? new RegExp(DATA.closedWrecks, 'i') : null;
    if (hidden.size || closed) DATA.sites = DATA.sites.filter(site => !hidden.has(site.id) && !(closed && closed.test(site.name)));
  }
  // Researched corrections: confirmed positions, depths and entry, and wrecks that are gone or were never found
  // (siteProfiles.js applySiteCorrections; same rule as catalog.js).
  {
    const gone = new Set();
    for (const site of DATA.sites) {
      const row = DATA.siteCorrections?.[site.id];
      if (!row) continue;
      const [latitude, longitude, max, entry, fresh, hide] = row;
      if (hide) { gone.add(site.id); continue; }
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) Object.assign(site, { latitude, longitude });
      if (Number.isFinite(max)) Object.assign(site, { maxDepthMeters: max, depthSource: { name: 'DMZ Scuba research', url: null }, depthIsWholeLake: false });
      if (entry) site.entry = entry;
      if (fresh) site.environment = 'fresh';
      site.researched = true;
    }
    if (gone.size) DATA.sites = DATA.sites.filter(site => !gone.has(site.id));
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
    layers: { regions: true, sites: true, mysites: true, temperature: true, wildlife: true, dives: false } };
  let gearMode = 'recreational';
  let logPins = [], logStatus = 'loading', missingCount = 0, selected = null, toastTimer;
  let readyForPersistence = false;
  // The animal a Home in-season card was opened for: listed first in its region's guide (not a saved filter).
  let spotlight = null;
  // Sites the diver pinned themselves (from the app): a small layer of their own, never clustered.
  let mySites = [];
  // The more dives at a site, the bigger and warmer its pin: 1, 2–4, 5–9, 10–24, 25+.
  const TIER_LABELS = ['First visit', 'Returning', 'Regular', 'Home water', 'Local legend'];
  const diveTier = count => (count >= 25 ? 5 : count >= 10 ? 4 : count >= 5 ? 3 : count >= 2 ? 2 : 1);
  const tierSize = tier => [26, 30, 34, 39, 45][tier - 1];
  // Species search and guides: the index arrives once from the app; guides and Discover picks on demand.
  // `following` is the animal whose sighting areas stay outlined until the diver clears it.
  let speciesList = null, speciesListRequested = false, following = null, speciesLayer = null, speciesFit = null;
  const speciesGuides = new Map(), discoverPicks = new Map();
  let panel = null;
  const temp = value => value == null ? '—' : `${Math.round(state.unit === 'F' ? value * 9 / 5 + 32 : value)}°${state.unit}`;
  // The month is contextual, not a preference: every launch starts in the
  // device's current month. Older saved month values are intentionally ignored.
  const persist = () => {
    if (!readyForPersistence) return;
    const { month, ...value } = state;
    const center = map.getCenter();
    post('preferences', { value: { ...value, view: { latitude: center.lat, longitude: center.wrap().lng, zoom: map.getZoom() } } });
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
      <div class="layers" aria-label="Map layers">${[['regions', 'Dive regions', 'globe', 'Popular gateways, habitats & conditions'], ['sites', 'Dive sites', 'site', `${DATA.sites.length.toLocaleString()} mapped reefs, wrecks & entries`], ['mysites', 'My sites', 'site', 'Sites you pinned in the planner'], ['temperature', 'Water temperature', 'temperature', 'Smoothed monthly surface averages'], ['wildlife', 'Seasonal wildlife', 'wildlife', 'Evidence-backed encounter windows'], ['dives', 'My dives', 'dives', 'Your saved locations · all dates']].map(([key, label, image, detail]) => `<button class="layer" data-layer="${key}" aria-pressed="false">${icon(image)}<span><strong>${label}</strong><small>${detail}</small></span><i class="switch" aria-hidden="true"></i></button>`).join('')}</div>
      <div id="species-bar" class="species-filter glass"><span class="species-label">LOOK FOR</span><button id="species-follow" class="species-follow"></button><button id="species-clear" class="species-clear" aria-label="Stop following this animal" hidden>×</button></div>
      <div id="legend" class="legend"><div class="legend-top"><span>AVERAGE SEA SURFACE</span><button id="units" aria-label="Change temperature unit"></button></div><div class="gradient"></div><div id="legend-values" class="legend-values"></div></div><p id="data-status" class="note" role="status">Included Atlas data</p><button id="info" class="source">Sources & coverage ↗</button></section>
      <section id="overview" class="overview floating-panel glass" hidden></section>
      <section id="sheet" class="sheet glass" aria-label="Map details" hidden><div class="sheet-head"><div id="detail-eyebrow" class="eyebrow"></div><h2 id="detail-title"></h2><p id="detail-subtitle" class="subtitle"></p><div id="glance" class="glance" hidden></div><div class="sheet-actions"><button id="expand" class="action-guide" aria-label="Expand details" aria-expanded="false">View guide ↑</button><button id="get-me-here" class="action-trip" hidden>Get me here ↗</button></div><div id="site-tabs" class="site-tabs" role="tablist" aria-label="Site guide sections" hidden></div><button id="close" class="close" aria-label="Close map details">×</button></div><div id="detail-body" class="sheet-body"></div></section>
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

  const regionLayer = L.layerGroup().addTo(map), siteLayer = L.layerGroup().addTo(map), wildlifeLayer = L.layerGroup().addTo(map), diveLayer = L.layerGroup().addTo(map), mySiteLayer = L.layerGroup().addTo(map);
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
      const tier = kind === 'dives' ? diveTier(count) : 0;
      const className = kind === 'dives' ? `dive-pin t${tier}${items.every(item => item.dives.every(dive => dive.verified)) ? ' verified' : ''}` : clustered ? 'cluster' : 'site-pin';
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
      const size = kind === 'dives' ? tierSize(tier) : clustered ? 34 : 15;
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
  const asMySite = site => ({ ...site, kind: 'site', custom: true, siteType: 'My site', catalog: 'mine', topologies: [], note: 'Pinned by you in the Dive Planner.' });
  // Redrawn only when the sites, the layer switch or the label threshold change — not on every pan.
  let mySitesDrawn = '';
  function drawMySites() {
    const labelled = map.getZoom() >= 6;
    const signature = state.layers.mysites ? `${labelled}|${mySites.map(site => `${site.id}:${site.name}:${site.latitude},${site.longitude}`).join(';')}` : 'off';
    if (signature === mySitesDrawn) return;
    mySitesDrawn = signature;
    mySiteLayer.clearLayers();
    if (!state.layers.mysites) return;
    for (const site of mySites) {
      const html = `<div class="my-pin"><i></i></div>${labelled ? `<span class="site-label mine">${esc(labelText(site.name))}</span>` : ''}`;
      L.marker([site.latitude, site.longitude], { pane: 'markerPane', title: site.name, alt: site.name, zIndexOffset: 300,
        icon: L.divIcon({ className: 'atlas-pin', html, iconSize: [20, 20], iconAnchor: [10, 10] }) })
        .on('click', event => { pinTap(event); choose(asMySite(site)); }).addTo(mySiteLayer);
    }
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
    drawMySites();
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
  map.on('moveend', persist);
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
    if (panel === 'search') { $('search').focus(); requestSpeciesList(); } else $('search').blur();
  }
  let pickerMode = 'site';
  let pickerMarker = null;
  function pickLocation(item) {
    panel = null; updatePanels(); closeDetails();
    if (pickerMarker) map.removeLayer(pickerMarker);
    pickerMarker = L.marker([item.latitude, item.longitude], { interactive: false, icon: L.divIcon({ className: '', html: '<div class="selected-dot"></div>', iconSize: [20, 20], iconAnchor: [10, 10] }) }).addTo(map);
    post('locationPicked', { selection: { id: item.id || '', name: item.name || '',
      latitude: item.latitude, longitude: item.longitude, region: item.region || item.area || '',
      country: item.country || '', custom: Boolean(item.custom) } });
  }
  map.on('click', event => {
    if (DATA.locationPicker) {
      if (echoOfPinTap(event)) return;
      if (pickerMode === 'pin') pickLocation({ latitude: event.latlng.lat, longitude: event.latlng.wrap().lng });
      return;
    }
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
    if (DATA.locationPicker && item.kind === 'site') {
      pickLocation(pickerMode === 'pin' ? { latitude: item.latitude, longitude: item.longitude } : item);
      if (fly) flyTo([item.latitude, item.longitude], Math.max(map.getZoom(), 12));
      return;
    }
    if (selected !== item) siteTab = 'overview';
    selected = item;
    panel = null;
    pendingTap = null; showAllSites = false;
    if (!item.fromTap) { quickTap = null; map.closePopup(); }
    if (placeOutline) { map.removeLayer(placeOutline); placeOutline = null; }
    if (item.kind === 'place' && item.outline?.length) placeOutline = L.polygon(item.outline, { pane: 'vectors', interactive: false, color: '#97e8cc', weight: 1.5, dashArray: '4 4', fillColor: '#97e8cc', fillOpacity: 0.06 }).addTo(map);
    if (native && ['province', 'diveRegion'].includes(item.kind) && item.id && !regionGuides.has(regionKey(item))) post('regionGuide', { kind: item.kind, id: item.id });
    if (native && ['site', 'area'].includes(item.kind) && (!siteGuides.has(guideKey(item)) || siteGuides.get(guideKey(item))?.weather?.status === 'error')) post('siteGuide', { requestId: ++guideRequest, key: guideKey(item), latitude: item.latitude, longitude: item.longitude, id: item.kind === 'site' ? item.id : undefined, month: state.month });
    document.body.classList.remove('detail-expanded');
    $('expand').setAttribute('aria-expanded', 'false');
    $('expand').setAttribute('aria-label', 'Expand details');
    $('expand').textContent = 'View guide ↑';
    if (selectionMarker) map.removeLayer(selectionMarker);
    if (Number.isFinite(item.latitude) && item.kind !== 'place') selectionMarker = L.marker([item.latitude, item.longitude], { interactive: false, icon: L.divIcon({ className: '', html: '<div class="selected-dot"></div>', iconSize: [20, 20], iconAnchor: [10, 10] }) }).addTo(map);
    renderDetails();
    if (item.kind === 'sources') expandDetails(true);
    $('sheet').scrollTop = 0;
    // One smooth camera move after the card is laid out, so the target lands centred above it.
    if (item.noFocus) return;
    if (fly && item.kind === 'place' && item.bbox) {
      const sheetHeight = $('sheet').hidden ? 0 : $('sheet').getBoundingClientRect().height;
      fitTo([[item.bbox[0], item.bbox[1]], [item.bbox[2], item.bbox[3]]], { paddingTopLeft: [28, 110], paddingBottomRight: [28, Math.max(160, sheetHeight + 110)], maxZoom: 10 }, .9);
    } else if (Number.isFinite(item.latitude)) {
      focusOn(L.latLng(item.latitude, item.longitude), fly ? item.zoom || (item.kind === 'site' || item.kind === 'dive' ? 11 : 6) : map.getZoom());
    }
  }
  function requestSelectedGear() {
    const s = selected;
    if (!native || !s || !['site', 'area'].includes(s.kind) || !Number.isFinite(s.latitude) || !Number.isFinite(s.longitude)) return;
    const key = guideKey(s), previous = siteGuides.get(key) || {};
    siteGuides.set(key, { ...previous, gear: { mode: gearMode, status: 'loading' } });
    post('gearMode', { value: gearMode, key, id: s.kind === 'site' ? s.id : null, name: s.name, latitude: s.latitude, longitude: s.longitude, month: state.month });
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
  function guideSection(guide, seasonsTitle = 'When to go', { chips = true } = {}) {
    const fresh = Boolean(guide?.inland);
    if (!guide) return native ? '<p class="note">Loading seasons and marine life…</p>' : '';
    let html = '';
    if (guide.highlights.length) {
      html += `<div class="section-label">${seasonsTitle}</div>${chips ? `<div class="season-chips">${guide.highlights.map(h => `<button class="season-chip${h.sourced ? ' sourced' : ''}" data-season-month="${h.months[0]}"><strong>${esc(h.label)}</strong><span>${h.animals.map(a => esc(a.common) + (a.where ? ` <small>· ${esc(a.where)}</small>` : '')).join(', ')}</span></button>`).join('')}</div>` : ''}`;
      const rows = guide.highlights.flatMap(h => h.animals).slice(0, 5);
      html += rows.map(a => `<div class="season-row"><div class="season-row-head">${a.photo ? `<img src="${esc(a.photo.url)}" alt="" loading="lazy">` : '<i></i>'}<strong>${esc(a.common)}</strong><small>${esc(a.sourced ? a.season.split(' · ')[0] : a.season.replace('Most sightings ', ''))}${a.sourced ? '' : ' · sightings'}</small></div><div class="calendar">${months.map((m, i) => `<span class="${a.months.includes(i) ? (a.sourced ? 'active ' : 'soft ') : ''}${state.month === i ? 'current' : ''}">${m[0]}</span>`).join('')}</div></div>`).join('');
      const now = guide.animals.filter(a => a.months.includes(state.month));
      html += `<div class="month-now"><strong>${months[state.month]}</strong> ${now.length ? now.map(a => `<p>● ${esc(a.common)} — ${esc(a.sourced ? a.note || a.season : a.season.replace('Most sightings', 'most sightings') + ' in local sighting records')}${a.source ? ` <a class="source" href="${esc(a.source.url)}">${esc(a.source.name)} ↗</a>` : ''}</p>`).join('') : '<p>No documented seasonal highlight this month; the resident life below is seen year-round.</p>'}</div>`;
    }
    if (guide.animals.length) {
      html += `<div class="section-label">${fresh ? 'Freshwater life recorded nearby' : 'Marine life seen here'} · ${guide.animals.length}</div><div class="gallery">${guide.animals.map(a => `<div class="gcard">${a.photo ? `<img src="${esc(a.photo.url)}" alt="${esc(a.common)}" loading="lazy">` : '<div class="gphoto"></div>'}<strong>${esc(a.common)}</strong><em>${esc(a.scientific)}</em><span class="${a.months.length ? 'on' : ''}">${esc(a.sourced ? a.season.split(' · ')[0] : a.season)}</span>${a.records ? `<small>${a.records.toLocaleString()} ${a.survey ? 'survey records' : 'local sightings'}${a.where ? ` · ${esc(a.where)}` : ''}${a.awayKm != null ? ` · ${distText(a.awayKm)} away` : ''}</small>` : ''}${a.photo ? `<small class="credit">📷 ${esc(a.photo.attribution)}</small>` : ''}<a class="gsource" href="${esc(a.taxonId ? `https://www.inaturalist.org/taxa/${a.taxonId}` : a.source?.url || 'https://www.inaturalist.org/')}">${a.taxonId ? 'iNaturalist' : 'Source'} ↗</a></div>`).join('')}</div>`;
      const borrowed = fresh && guide.animals.find(a => a.awayKm != null);
      html += fresh ? `<p class="note">Fish, turtles, crayfish, mussels and other aquatic animals from iNaturalist research-grade sightings ${borrowed ? `— few are recorded out here, so this adds the nearest well-recorded shore (${distText(borrowed.awayKm)} away); species there may not reach the site` : `within about ${roundDistText(15)} — nearby lakes and rivers included, so not every species lives at this exact site`}. Photos are openly licensed and credited.</p>`
        : `<p class="note">${guide.hasObservations ? 'Marine life from iNaturalist research-grade sightings nearby, adjusted for how many people log each month. “Most sightings” is a pattern, not a guarantee.' : ''}${guide.animals.some(a => a.survey) ? ' Few divers post sightings here, so this adds species from scientific surveys within about ' + roundDistText(40) + ' (<a class="source" href="https://obis.org/">OBIS, IOC-UNESCO ↗</a>): they show what lives in the area, not when, and not every one reaches this site.' : ''} Solid seasons come from the linked research or government sources. Photos are openly licensed and credited.</p>`;
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
    const life = r.marineLife?.[state.month];
    const vis = r.inland ? null : r.visibility?.[state.month];
    return { life, experience: r.experience, travel: r.travel, vis };
  }
  // What to wear this month, from the water temperature (and your comfort preferences, set in the app).
  // The card opens Gear for this dive, which matches it to your own Gear Locker on the device.
  function wearCard(wear) {
    const w = wear?.[state.month];
    const label = w?.label && w.label !== 'Confirm water temperature' ? (/mm$/.test(w.label) ? `${w.label} wetsuit` : w.label) : null;
    const water = w?.temperatureC != null ? `For ${temp(w.temperatureC)} surface water · colder at depth${w.personal ? ' · adjusted for how you feel the cold' : ''}` : 'No water temperature here — confirm it locally';
    return `<div class="section-label">What to wear · ${months[state.month]}</div><button id="gear-for-dive" class="wear-card">${label
      ? `<strong>${esc(label)}</strong><span>${esc(water)}</span>${w.reason ? `<span class="wear-why">${esc(w.reason)}</span>` : ''}`
      : `<strong>Plan your exposure protection</strong><span>${wear ? esc(water) : 'Pick a site for its water temperature, or plan from your Gear Locker'}</span>`}<b>Match it to my Gear Locker →</b></button>`;
  }
  // No published depth: the best estimate we have, most specific first, always named as an estimate.
  //   lake    — the lake's modelled deepest point (GLOBathy), never the dive's depth
  //   seafloor — water depth within ~300 m of the pin from fine NOAA / EMODnet models, else within ~900 m
  //              from the global ETOPO grid (coarse on steep coasts); given only where bottom of 40 m or
  //              less is near, anything deeper reads "40+ m": beyond recreational limits, not a figure
  //   nearby  — the depths published for sites within 25 km
  const DEPTH_LIMIT = 40;
  const depthNumber = m => imperial ? Math.round(m * 3.28084 / 5) * 5 || Math.round(m * 3.28084) : Math.round(m);
  function seafloorRange(floor) {
    if (!floor || floor.shallowest > DEPTH_LIMIT || floor.deepest < 3) return null;
    const top = floor.deepest > DEPTH_LIMIT ? `${imperial ? 130 : DEPTH_LIMIT}+` : depthNumber(floor.deepest);
    return `${depthNumber(floor.shallowest) === depthNumber(floor.deepest) ? '' : depthNumber(floor.shallowest) + '–'}${top} ${DATA.depthUnit}`;
  }
  function depthEstimates(site, g) {
    if (!site || site.maxDepthMeters || !g) return [];
    const list = [];
    const lake = g.lakeDepth, lakeName = lake?.lakeName ? esc(lake.lakeName) : 'this lake';
    if (lake) list.push(lake.published
      ? { label: 'Lake’s deepest point', value: depthText(lake.maxMeters), detail: `No depth published for this site — ${lakeName}’s deepest point (Wikidata). Not the dive’s depth: most dives stay shallower.`, short: 'Wikidata', url: lake.url }
      : { label: 'Lake’s deepest point · estimated', value: depthText(lake.maxMeters), detail: `No published depth — modelled for ${lakeName} (GLOBathy). Not the dive’s depth: most dives stay shallower.`, short: 'GLOBathy', url: lake.url });
    const fine = seafloorRange(g.bathymetry);
    if (fine) list.push({ label: 'Depth · estimated', value: fine, detail: `No published depth — seafloor within about ${imperial ? '1,000 ft' : '300 m'} of this pin (${esc(g.bathymetry.source?.name || 'survey data')}).`, short: g.bathymetry.source?.name, url: g.bathymetry.source?.url });
    const near = g.nearbyDepths;
    if (near) list.push({ label: 'Depth · nearby sites', value: `${near.low === near.high ? '' : depthNumber(near.low) + '–'}${depthNumber(near.high)} ${DATA.depthUnit}`, detail: `No published depth — typical of ${near.count} sites within ${roundDistText(near.radiusKm)} that publish one.`, short: `${near.count} sites nearby`, url: null });
    const coarse = !fine && seafloorRange(g.seafloor);
    if (coarse) list.push({ label: 'Depth · estimated', value: coarse, detail: 'No published depth — estimated from NOAA seafloor data around it.', short: 'NOAA seafloor', url: 'https://www.ncei.noaa.gov/products/etopo-global-relief-model' });
    return list;
  }
  // Published maximum depth: what it measures and where it comes from — or, without one, the best estimate
  // (with the next best as a second line).
  function depthTile(site, g) {
    const [best, next] = depthEstimates(site, g);
    if (best) return `<div class="gtile"><small>${best.label}</small><strong>${best.value}</strong><span>${best.detail}${next ? ` Also: ${next.value} (${esc(next.short || next.label)}).` : ''} Confirm with the operator.</span></div>`;
    if (!site?.maxDepthMeters) return `<div class="gtile"><small>Max depth</small><strong>—</strong><span>No published depth yet — ask the operator or site</span></div>`;
    const label = site.depthIsWholeLake ? 'Lake’s deepest point' : site.topologies?.includes('wreck') ? 'Wreck lies in' : 'Max depth';
    const from = site.depthSource ? site.depthSource.name : site.catalog === 'global' ? 'OpenDiveMap record' : site.catalog === 'osm' ? 'Community map record' : 'Catalog record';
    return `<div class="gtile"><small>${label}</small><strong>${depthText(site.maxDepthMeters)}</strong><span>${site.depthIsWholeLake ? 'Not the dive’s depth — ask where divers go · ' : ''}${esc(from)}</span></div>`;
  }
  function glanceTiles(r, temps, inland, site, guide) {
    const g = glanceParts(r);
    if (!g) return '';
    if (r.inland) return `<div class="section-label">At a glance · ${months[state.month]} · freshwater</div><div class="glance-grid">
      <div class="gtile"><small>Freshwater life</small>${g.life ? `<strong class="stars">${stars(g.life.stars)}</strong><span>${esc(g.life.label)}${g.life.drivers.length ? ` · ${esc(g.life.drivers.join(', '))}` : ''}</span>` : '<strong>—</strong><span>No freshwater-life records nearby yet</span>'}</div>
      <div class="gtile"><small>Experience</small><strong>${esc(g.experience.level)}</strong><span>${esc(g.experience.reasons.slice(0, 2).join(' · ') || 'No depth data')}${g.experience.confidence === 'features' ? ' · estimated' : ''}</span></div>
      <div class="gtile"><small>Travel</small><strong>${esc(g.travel.level)}</strong><span>${esc(g.travel.detail)}${g.travel.personal ? ' from your start' : ' · set a start in Get me here for a personal rating'}</span></div>
      <div class="gtile"><small>Water · ${months[state.month]}</small>${inland?.surface ? `<strong>${inland.ice.includes(state.month) ? 'Ice-covered' : temp(inland.surface[state.month])}</strong><span>${inland.constant != null ? 'Groundwater — steady all year' : 'Estimated surface'}${inland.deep ? ` · ${temp(inland.deep.low)}–${temp(inland.deep.high)} below the thermocline` : ''} · what to wear below</span>` : '<strong>—</strong><span>No temperature estimate · ask the site</span>'}</div>
      ${depthTile(site, guide)}
      <div class="gtile"><small>Water · elevation</small><strong>${esc(inland?.kindLabel || 'Freshwater')}${inland?.elevation != null ? ` · ${elevText(inland.elevation)}` : ''}</strong><span>${inland?.altitude ? 'Altitude dive (above 1,000 ft) — altitude tables. ' : inland?.elevation != null ? 'Normal dive (under 1,000 ft). ' : ''}Freshwater: less buoyancy — you may need a little less weight.</span></div>
    </div><p class="note">Estimates from freshwater sightings, site features, local climate, elevation and your route. Confirm conditions and requirements with the site.</p>`;
    return `<div class="section-label">At a glance · ${months[state.month]}</div><div class="glance-grid">
      <div class="gtile"><small>Major marine life</small>${g.life ? `<strong class="stars">${stars(g.life.stars)}</strong><span>${esc(g.life.label)}${g.life.drivers.length ? ` · ${esc(g.life.drivers.join(', '))}` : ''}</span>` : '<strong>—</strong><span>No sighting records nearby</span>'}</div>
      <div class="gtile"><small>Experience</small><strong>${esc(g.experience.level)}</strong><span>${esc(g.experience.reasons.slice(0, 2).join(' · ') || 'No depth or current data')}${g.experience.confidence === 'features' ? ' · estimated' : ''}</span></div>
      <div class="gtile"><small>Travel</small><strong>${esc(g.travel.level)}</strong><span>${esc(g.travel.detail)}${g.travel.personal ? ' from your start' : ' · set a start in Get me here for a personal rating'}</span></div>
      ${depthTile(site, guide)}
      <div class="gtile"><small>Visibility · estimated</small>${g.vis ? `<strong>${visText(g.vis)}</strong><span>From satellite water clarity offshore (NOAA VIIRS, ${months[state.month]} average). Local visibility varies with weather, tides and runoff.</span>` : `<strong>—</strong><span>${r.inland ? 'Freshwater — satellite clarity does not apply; ask locally' : 'No satellite clarity data near this site'}</span>`}</div>
      <div class="gtile"><small>Water · ${months[state.month]}</small>${temps?.length === 12 && temps[state.month] != null ? `<strong>${temp(temps[state.month])}</strong><span>Average surface temperature · colder at depth · what to wear below</span>` : '<strong>—</strong><span>No sea temperature for this spot</span>'}</div>
    </div><p class="note">Estimates from recorded sightings, published depth and site features, water temperature, satellite water clarity and your route. Confirm conditions and requirements with a local operator.</p>`;
  }
  function glanceLine(r, site) {
    const g = glanceParts(r);
    if (!g) return '';
    return [r.inland ? '<span>Freshwater</span>' : '', g.life ? `<span class="stars">${stars(g.life.stars)}</span>` : '', `<span>${esc(g.experience.level)}</span>`, `<span>${esc(g.travel.level)} ${g.travel.personal ? 'trip' : 'access'}</span>`, site?.maxDepthMeters && !site.depthIsWholeLake ? `<span>${depthText(site.maxDepthMeters)} max</span>` : '', g.vis ? `<span>${visText(g.vis)} vis</span>` : ''].filter(Boolean).join('');
  }
  // ── Site card ─────────────────────────────────────────────────────────────────────────────────────
  // Peek: what kind of dive, where, how hard, and the three numbers divers check first. Expanded: the dive,
  // this month, when to go, the site's story, water through the year — then location and sources, folded.
  const SITE_KINDS = { wreck: 'Wreck', reef: 'Reef', wall: 'Wall', pinnacle: 'Pinnacle', cave: 'Cave', cavern: 'Cavern', muck: 'Muck dive', drift: 'Drift', shore: 'Shore dive', quarry: 'Quarry', spring: 'Spring', lake: 'Lake', mine: 'Mine' };
  function siteEyebrow(site, ng) {
    // Some catalogs say what the site is only in its type ("Wreck", "reef area"), not its feature tags.
    const typed = Object.keys(SITE_KINDS).find(t => new RegExp(`\\b${t}`, 'i').test(site.siteType || ''));
    const kind = site.custom ? 'My site' : SITE_KINDS[site.topologies?.find(t => SITE_KINDS[t]) || typed] || (ng?.guide?.inland || site.environment === 'fresh' ? 'Freshwater site' : 'Dive site');
    const places = (ng?.places || []).filter(p => p.kind !== 'country' || (ng.places.length === 1));
    const where = places.length ? places.slice(0, 2).map(p => p.name).join(', ') : [site.region, site.country].filter(Boolean)[0] || '';
    return [kind, where].filter(Boolean).join(' · ');
  }
  const levelClass = level => `lvl lvl-${String(level).toLowerCase().replace(/[^a-z]+/g, '-')}`;
  // A manatee seen from the beach is not what you'll meet on a 100 ft wreck: shore-only animals drop out
  // of a deeper site's headline (they stay in the full list below).
  const SHORE_ONLY = /manatee|dugong/i;
  // Depth for the card: researched range (top of the site → bottom) first, then a published maximum, then the
  // best estimate. `meters` is the deepest point, which the level and fit are judged on.
  function siteDepth(site, ng) {
    const researched = ng?.profile?.depth;
    if (researched && Number.isFinite(researched[1])) return { meters: researched[1], top: researched[0], value: depthRange(researched[0], researched[1]), estimated: false, researched: true };
    if (site.maxDepthMeters && !site.depthIsWholeLake) return { meters: site.maxDepthMeters, top: null, value: depthText(site.maxDepthMeters), estimated: false };
    const best = depthEstimates(site, ng)[0];
    const atPin = ng?.bathymetry?.atPin ?? ng?.seafloor?.atPin;
    // The peek shows the modelled depth at the pin (what the level is judged on); the guide shows the range around it.
    return best ? { meters: atPin ?? null, top: null, value: best.value, peek: atPin > 0 && atPin <= DEPTH_LIMIT ? `~${depthNumber(atPin)} ${DATA.depthUnit}` : best.value, estimated: true, best } : null;
  }
  // "62–87 ft", or just "87 ft" when only the bottom is known.
  function depthRange(top, bottom) {
    // Researched depths are surveyed figures: shown to the foot or metre, not rounded to the nearest 5 ft.
    const exact = m => Math.round(imperial ? m * 3.28084 : m);
    const b = exact(bottom), t = Number.isFinite(top) ? exact(top) : null;
    return `${t != null && t < b ? `${t}–` : ''}${b.toLocaleString()} ${DATA.depthUnit}`;
  }
  const splitUnit = text => { const m = String(text).match(/^(.*?)\s*(ft|m)$/); return m ? [m[1], m[2]] : [String(text), '']; };
  function monthWater(site, ng) {
    const inland = ng?.guide?.inland;
    if (inland?.surface) return inland.ice.includes(state.month) ? null : inland.surface[state.month];
    const known = ng?.guide?.temps;
    return known?.length === 12 ? known[state.month] : MODEL.temperatureAt(DATA.temperature, site.latitude, site.longitude, state.month);
  }
  // One line on why to go now (or when): a sourced season first, then sighting patterns, then the next season.
  function seasonLine(guide, deep) {
    const animals = (guide?.animals || []).filter(a => !(deep && SHORE_ONLY.test(a.common)));
    const span = a => esc((a.season || '').split(' · ')[0].replace(/^Most sightings /, ''));
    const now = animals.filter(a => a.sourced && a.months.includes(state.month));
    if (now.length) return `<b>In season</b> ${now.slice(0, 2).map(a => `${esc(a.common)} · ${span(a)}`).join(', ')}`;
    const seen = animals.filter(a => !a.sourced && a.months.length && a.months.includes(state.month));
    if (seen.length) return `<b>Often seen now</b> ${seen.slice(0, 2).map(a => esc(a.common)).join(', ')}`;
    const next = animals.filter(a => a.sourced && a.months.length).map(a => ({ a, wait: Math.min(...a.months.map(m => (m - state.month + 12) % 12)) })).sort((x, y) => x.wait - y.wait)[0];
    return next ? `<b>Next season</b> ${esc(next.a.common)} · ${span(next.a)}` : '';
  }
  // Peek: level and fit, how you get in, then the four numbers divers check first — depth, water, visibility, current.
  const ENTRY_NAMES = { boat: 'Boat dive', shore: 'Shore dive', 'boat-shore': 'Boat or shore' };
  const CURRENT_NAMES = { none: 'None', light: 'Light', moderate: 'Moderate', strong: 'Strong', variable: 'Variable' };
  // Water at the depth you'll dive: below a summer thermocline (deeper than ~18 m in a stratifying lake) the
  // bottom temperature matters more than the surface average.
  function diveWater(site, ng) {
    const depth = siteDepth(site, ng), deep = ng?.profile?.region?.tempDeepC, surface = monthWater(site, ng);
    const summer = state.month >= 5 && state.month <= 9;
    if (deep && depth?.meters >= 18 && summer) return { value: Math.round((deep[0] + deep[1]) / 2), label: 'at depth', estimated: true };
    return surface == null ? null : { value: surface, label: 'surface', estimated: !ng?.guide?.temps };
  }
  function siteVis(ng) {
    const v = ng?.profile?.vis;
    if (v && Number.isFinite(v[1])) return { value: Number.isFinite(v[0]) ? visText({ low: v[0], high: v[1] }) : `<${visText({ low: v[1], high: v[1] }).split('–')[1]}`, estimated: false };
    const community = ng?.community;
    if (Number.isFinite(community?.visibilityMeters)) {
      const value = imperial ? Math.max(5, Math.round(community.visibilityMeters * 3.28084 / 5) * 5) : Math.round(community.visibilityMeters);
      return { value: `~${value} ${imperial ? 'ft' : 'm'}`, estimated: true, community: true, loggedDives: community.loggedDives || 0 };
    }
    const g = glanceParts(ng?.ratings);
    return g?.vis ? { value: visText(g.vis), estimated: true } : null;
  }
  function siteCurrent(ng) {
    const own = ng?.profile?.current, structured = ng?.structured?.current, regional = ng?.profile?.region?.current;
    return own ? { value: CURRENT_NAMES[own], estimated: false } : structured ? { value: CURRENT_NAMES[structured], estimated: true, community: true }
      : regional ? { value: CURRENT_NAMES[regional], estimated: true } : null;
  }
  function sitePeek(site, ng) {
    const r = ng?.ratings, g = glanceParts(r), depth = siteDepth(site, ng), profile = ng?.profile;
    const level = profile?.level ? { level: profile.level[0].toUpperCase() + profile.level.slice(1), reasons: [] } : g?.experience;
    const fit = fitVerdict(site, ng);
    const why = level?.reasons?.[0] ? esc(level.reasons[0].replace(/ — .*$/, '')) : '';
    const aside = fit && fit.tone !== 'info' ? `<span class="fit-chip fit-${fit.tone}"><b>${FIT_MARK[fit.tone]}</b>${esc(fit.short)}</span>` : why ? `<small>${why}${level.confidence === 'estimate' ? ' · estimated' : ''}</small>` : '';
    const entry = profile?.entry || site.entry;
    const fresh = profile?.water === 'fresh' || ng?.guide?.inland || site.environment === 'fresh';
    const tags = [entry ? ENTRY_NAMES[entry] || `${entry[0].toUpperCase()}${entry.slice(1)} dive` : '', ...(ng?.structured?.entryDetails || []), fresh ? 'Fresh water' : '', profile?.mooring || ng?.structured?.mooring ? 'Mooring / descent line' : ''].filter(Boolean);
    const water = diveWater(site, ng), vis = siteVis(ng), current = siteCurrent(ng);
    const [depthValue, depthUnit] = depth ? splitUnit(depth.peek || depth.value) : ['—', ''];
    const [visValue, visUnit] = vis ? splitUnit(vis.value) : ['—', ''];
    const stat = (value, label, est) => `<div${value === '—' ? ' class="none"' : ''}><strong>${value}</strong><small>${label}${est ? ' <i>est.</i>' : ''}</small></div>`;
    return `${level || tags.length ? `<div class="peek-level">${level ? `<span class="${levelClass(level.level)}">${esc(level.level)}</span>` : ''}${aside}</div>` : ''}
      ${tags.length ? `<p class="peek-tags">${tags.map(t => `<span>${esc(t)}</span>`).join('')}</p>` : ''}
      <div class="peek-stats four">${stat(depthValue, `${depthUnit ? depthUnit + ' ' : ''}depth`, depth?.estimated)}${stat(water ? temp(water.value) : '—', water ? water.label : 'water', water?.estimated)}${stat(visValue, `${visUnit ? visUnit + ' ' : ''}vis`, vis?.estimated)}${stat(current ? esc(current.value) : '—', 'current', current?.estimated)}</div>`;
  }
  const spec = (label, value, detail = '') => `<div class="spec"><span class="spec-k">${label}</span><div class="spec-v"><strong>${value}</strong>${detail ? `<span>${detail}</span>` : ''}</div></div>`;
  const EST = '<em class="est">est.</em>';
  // This month in one card: water temperature and the exposure starting point.
  function thisMonth(site, ng) {
    const w = ng.wear?.[state.month], water = monthWater(site, ng), inland = ng.guide?.inland;
    const label = w?.label && w.label !== 'Confirm water temperature' ? (/mm$/.test(w.label) ? `${w.label} wetsuit` : w.label) : 'Plan your exposure protection';
    const why = w?.reason || (water != null ? `${inland ? 'Estimated surface water' : 'Average surface water'} · colder at depth${w?.personal ? ' · adjusted for how you feel the cold' : ''}` : 'No water temperature here — confirm it locally');
    return `<div class="section-label">Water this month · ${months[state.month]}</div><div class="month-card"><span class="mc-top"><span class="mc-temp">${inland?.ice.includes(state.month) ? '❄' : temp(water)}<small>${inland ? 'water · est.' : 'surface'}</small></span><span class="mc-wear"><small>Exposure starting point</small><strong>${esc(label)}</strong></span></span><span class="mc-why">${esc(why)}</span></div>`;
  }
  function waterYear(site, ng) {
    const inland = ng.guide?.inland;
    if (inland) return inlandConditions(inland);
    const chart = temperatureCard(site, ng.guide?.temps, { chartOnly: true });
    return chart ? `<div class="section-label">Water through the year</div>${chart}` : '';
  }
  // Where the pin comes from, how sure we are, and every source — folded away, never lost.
  function aboutPin(site, ng) {
    const profile = ng?.profile;
    const moved = profile?.position?.movedKm ? `<p class="confidence good">✓ Pin moved ${distText(profile.position.movedKm)} to the position confirmed by archaeologists</p>` : '';
    const unpublished = profile?.position?.quality === 'unpublished' ? '<p class="confidence">The exact position isn’t published — this pin is approximate.</p>' : '';
    const confidence = site.independentSources > 1
      ? `<p class="confidence good">✓ Confirmed by ${site.independentSources} independent sources${site.aliases?.length ? ` · also listed as ${site.aliases.slice(0, 3).map(esc).join(', ')}` : ''}</p>`
      : !profile && ['global', 'osm'].includes(site.catalog) ? '<p class="confidence">One community source — confirm the exact spot locally</p>' : '';
    const note = esc(site.note || (['global', 'osm'].includes(site.catalog) ? 'Community-maintained map record. Confirm the exact entry, access, depth, hazards and current conditions with a local operator.' : 'Catalog location. Confirm entry, access and current conditions with a local operator.'));
    const coords = `${Math.abs(site.latitude).toFixed(4)}°${site.latitude < 0 ? 'S' : 'N'} · ${Math.abs(site.longitude).toFixed(4)}°${site.longitude < 0 ? 'W' : 'E'}`;
    const research = profile?.sources?.length ? `<div class="chip-label">Researched from</div>${profile.sources.map(source => source.url ? `<a class="source" href="${esc(source.url)}">${esc(source.name)} ↗</a>` : `<span class="source">${esc(source.name)}</span>`).join('<br>')}` : '';
    return `<details class="fold"><summary>Location & sources</summary>${crumbs(ng?.places || [])}<p class="coords">${coords}</p>${moved}${unpublished}${confidence}<p class="note">${note}</p>${research}${research ? '<div class="chip-label">Map records</div>' : ''}${(site.sources || []).map(source => `<a class="source" href="${esc(source.sourceUrl)}">${esc(source.sourceName)}${source.dataLicense ? ` · ${esc(source.dataLicense)}` : ''} ↗</a>`).join('<br>')}</details>`;
  }
  // Is this dive within the diver's training? From the depth (published, else modelled at the pin), the
  // site's kind and the diver's cards (summarised by the app: trained depth, wreck / cavern / cave).
  const isFixedDepth = site => ['wreck', 'pinnacle'].some(t => site.topologies?.includes(t) || new RegExp(`\\b${t}`, 'i').test(site.siteType || ''));
  const isWreck = site => site.topologies?.includes('wreck') || /\bwreck/i.test(site.siteType || '');
  function fitVerdict(site, ng) {
    const d = ng?.diver;
    if (!d) return null;
    if (!d.signedIn) return { tone: 'info', short: 'Sign in to check your fit', text: 'Sign in and add your certification cards to see whether this dive fits your training.' };
    const overhead = site.topologies?.includes('cave') ? (d.cave ? null : 'Full cave certification needed') : site.topologies?.includes('cavern') ? (d.cavern || d.cave ? null : 'Cavern training needed') : null;
    if (overhead) return { tone: 'warn', short: overhead, text: `${overhead} — overhead environments are outside open-water training.` };
    if (!d.limitMeters) return { tone: 'info', short: 'Add your cert card', text: 'Add your certification cards in Profile to check this dive against your training.' };
    const limit = imperial ? `${d.limitFeet} ft` : `${d.limitMeters} m`;
    const depth = siteDepth(site, ng), meters = depth?.meters ?? (site.depthIsWholeLake ? null : site.maxDepthMeters);
    const est = depth?.estimated ? ' The depth is estimated — confirm it with the operator.' : '';
    if (!meters) return { tone: 'info', short: `Your limit: ${limit}`, text: `Depth not confirmed — check it stays within your ${d.label} limit of ${limit}.` };
    if (meters > d.limitMeters + 0.5) return isFixedDepth(site)
      ? { tone: 'warn', short: `Deeper than your ${limit} limit`, text: `The ${isWreck(site) ? 'wreck' : 'site'} lies deeper than your ${d.label} training (${limit}). Get Deep Diver training before you dive it.${est}` }
      : { tone: 'caution', short: `Goes past your ${limit} limit`, text: `Parts of this site go deeper than your ${d.label} limit (${limit}). Plan your dive to stay shallower.${est}` };
    // A researched wreck says whether there's an inside at all (a scattered hull has none).
    const penetration = isWreck(site) && !d.wreck && (!ng?.profile || ng.profile.penetration) ? ' Stay outside the wreck — going inside needs Wreck Diver training.' : '';
    return { tone: 'good', short: `Within your ${limit} limit`, text: `Within your ${d.label} training (${limit}).${penetration}${est}` };
  }
  const FIT_MARK = { good: '✓', caution: '!', warn: '!', info: 'i' };
  // Diagram selection deliberately considers all feature and water signals. A spring can also be a cave;
  // that overhead fact must win, while an otherwise-untyped freshwater site must never fall through to reef.
  function siteKind(site, ng) {
    return diagramProfileKind(site, ng?.profile, Boolean(ng?.guide?.inland));
  }
  // ── Cross-section hero ─────────────────────────────────────────────────────────────────────────────
  // The dive drawn to scale from real numbers only: the water column from the surface to the site's bottom, the
  // site's outline rising to its known top, surface and at-depth temperatures with the summer thermocline between
  // them (stratifying lakes), and the diver's trained depth. Shapes are generic per kind (a hull, a reef, a wall),
  // never a picture of this particular site. Estimated depths draw dashed and say so.
  function crossSection(site, ng) {
    const depth = siteDepth(site, ng), bottom = depth?.meters, region = ng?.profile?.region;
    const W = 960, H = 560, surface = 38, floorRoom = 480;
    const limit = ng?.diver?.limitMeters || null;
    const showLimit = limit && bottom && limit <= bottom * 1.6;
    const max = bottom ? Math.max(bottom * 1.08, showLimit ? limit * 1.04 : 0, 8) : 30;
    const y = d => surface + (floorRoom - surface) * Math.min(d, max) / max;
    const label = d => depth?.researched ? depthRange(null, d) : depth?.estimated && d === bottom && depth.peek ? depth.peek : `${depth?.estimated ? '~' : ''}${depthText(d)}`;
    const summer = state.month >= 5 && state.month <= 9;
    const deepTemp = region?.tempDeepC && summer && bottom > 12 ? Math.round((region.tempDeepC[0] + region.tempDeepC[1]) / 2) : null;
    const surfaceTemp = monthWater(site, ng);
    const parts = [];
    const rawKind = siteKind(site, ng);
    const sceneKind = rawKind;
    const sceneName = { wreck: 'Wreck', reef: 'Coral reef', cave: 'Overhead', lake: 'Inland lake', wall: 'Wall', pinnacle: 'Pinnacle' }[sceneKind] || 'Dive site';
    const profileKey = sceneKind === 'wreck' ? 'wreck' : sceneKind === 'cave' ? 'cenote'
      : sceneKind === 'lake' ? 'inland' : 'reef';
    const assetBody = DIAGRAM_PROFILES[profileKey]
      .replace(/^<svg[^>]*>/, '')
      .replace(/<\/svg>\s*$/, '')
      .replace(/<title>[\s\S]*?<\/title>/, '')
      .replace(/<desc>[\s\S]*?<\/desc>/, '');
    const overlay = [];
    if (surfaceTemp != null) overlay.push(`<g class="profile-temp"><rect x="28" y="57" width="176" height="48" rx="24"/><text x="50" y="89">${temp(surfaceTemp)}<tspan dx="10">SURFACE</tspan></text></g>`);
    if (deepTemp != null) overlay.push(`<g class="profile-deep-temp"><rect x="28" y="113" width="196" height="37" rx="18.5"/><text x="48" y="138">${temp(deepTemp)} AT DEPTH · EST.</text></g>`);
    if (!bottom) {
      overlay.push('<g class="profile-unknown"><rect x="310" y="228" width="340" height="68" rx="34"/><text x="480" y="270" text-anchor="middle">DEPTH NOT PUBLISHED</text></g>');
    } else {
      const displayMax = max * (imperial ? 3.28084 : 1);
      const step = imperial ? (displayMax <= 80 ? 20 : displayMax <= 180 ? 40 : 50) : (displayMax <= 25 ? 5 : displayMax <= 55 ? 10 : 20);
      overlay.push(`<g class="profile-ruler"><line x1="918" x2="918" y1="${surface + 18}" y2="${floorRoom}"/><text x="918" y="${surface + 8}" text-anchor="middle">${imperial ? 'FT' : 'M'}</text>`);
      for (let value = step; value < displayMax - step * .2; value += step) {
        const yy = y(value * (imperial ? .3048 : 1));
        overlay.push(`<line x1="908" x2="928" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}"/><text x="897" y="${(yy + 5).toFixed(1)}" text-anchor="end">${value}</text>`);
      }
      overlay.push('</g>');
      const marker = (d, key, value) => {
        const yy = Math.max(surface + 26, Math.min(floorRoom - 3, y(d)));
        return `<g class="profile-depth"><line x1="760" x2="930" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}"/><rect x="748" y="${(yy - 37).toFixed(1)}" width="182" height="32" rx="16"/><text class="key" x="766" y="${(yy - 16).toFixed(1)}">${key}</text><text class="value" x="912" y="${(yy - 16).toFixed(1)}" text-anchor="end">${value}</text></g>`;
      };
      if (Number.isFinite(depth.top) && depth.top < bottom - 1) overlay.push(marker(depth.top, 'TOP', label(depth.top)));
      overlay.push(marker(bottom, rawKind === 'wreck' ? 'BOTTOM' : 'MAX', label(bottom)));
      const limitLine = (meters, text, tone) => {
        const yy = y(meters);
        return `<g class="profile-limit ${tone}"><line x1="0" x2="960" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}"/><rect x="28" y="${(yy - 35).toFixed(1)}" width="${Math.max(218, text.length * 13)}" height="29" rx="14.5"/><text x="44" y="${(yy - 15).toFixed(1)}">${text}</text></g>`;
      };
      if (showLimit) overlay.push(limitLine(limit, `YOUR LIMIT · ${imperial ? ng.diver.limitFeet + ' FT' : limit + ' M'}`, bottom > limit + .5 ? 'over' : 'good'));
      else if (!limit && max > 40) overlay.push(limitLine(40, `RECREATIONAL · ${imperial ? '130 FT' : '40 M'}`, 'rec'));
    }
    overlay.push(`<g class="profile-caption"><rect x="28" y="512" width="346" height="26" rx="13"/><text x="45" y="530">${sceneName.toUpperCase()} · ILLUSTRATIVE PROFILE</text></g>`);
    return `<svg class="xsection profile-art" viewBox="0 0 ${W} ${H}" role="img" aria-label="Depth profile: ${esc(site.name)}${depth ? `, ${esc(depth.value)}` : ', depth not published'}. The artwork is illustrative; the ruler and markers show site data."><title>${esc(site.name)} depth profile</title><desc>${esc(sceneName)} illustration with live Atlas depth and temperature annotations. The illustration is not a surveyed site plan.</desc>${assetBody}${overlay.join('')}</svg>`;
    // The measured water column remains to scale. The feature is intentionally illustrative: most
    // sources publish a depth, not a surveyed silhouette or reef relief.
    const band = deepTemp != null ? [Math.min(6, bottom * 0.3), Math.min(15, bottom * 0.6)] : null;
    parts.push(`<defs>
      <linearGradient id="xs-water" x1="0" y1="0" x2="0" y2="1">${band
        ? `<stop offset="0" stop-color="#2c9bb3"/><stop offset="${((y(band[0]) - surface) / (H - surface)).toFixed(3)}" stop-color="#19758f"/><stop offset="${((y(band[1]) - surface) / (H - surface)).toFixed(3)}" stop-color="#0c4057"/><stop offset="1" stop-color="#041a28"/>`
        : '<stop offset="0" stop-color="#2797b0"/><stop offset=".42" stop-color="#145b75"/><stop offset=".78" stop-color="#0a354a"/><stop offset="1" stop-color="#041a28"/>'}</linearGradient>
      <linearGradient id="xs-bed-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#46504b"/><stop offset=".5" stop-color="#242f2f"/><stop offset="1" stop-color="#101d22"/></linearGradient>
      <linearGradient id="xs-wreck-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#789095"/><stop offset=".48" stop-color="#3f5b62"/><stop offset="1" stop-color="#1f3942"/></linearGradient>
      <linearGradient id="xs-wreck-side" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#577179"/><stop offset="1" stop-color="#203a43"/></linearGradient>
      <linearGradient id="xs-reef-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#d99779"/><stop offset=".55" stop-color="#a85f64"/><stop offset="1" stop-color="#593e4b"/></linearGradient>
      <linearGradient id="xs-cave-fill" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#718077"/><stop offset=".5" stop-color="#394b48"/><stop offset="1" stop-color="#172a2d"/></linearGradient>
      <linearGradient id="xs-lake-bed" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#526558"/><stop offset=".55" stop-color="#2f423d"/><stop offset="1" stop-color="#14272a"/></linearGradient>
      <radialGradient id="xs-vignette" cx="50%" cy="38%" r="72%"><stop offset=".48" stop-color="#00141d" stop-opacity="0"/><stop offset="1" stop-color="#001018" stop-opacity=".58"/></radialGradient>
      <filter id="xs-shadow" x="-30%" y="-40%" width="160%" height="190%"><feGaussianBlur stdDeviation="3"/></filter>
    </defs>`);
    parts.push(`<rect class="xs-sky" width="${W}" height="${surface}"/>`, `<rect y="${surface}" width="${W}" height="${H - surface}" fill="url(#xs-water)"/>`);
    parts.push(`<path class="xs-light" d="M22 ${surface} L86 ${H} L160 ${H} L77 ${surface}Z M188 ${surface} L229 ${H} L298 ${H} L245 ${surface}Z"/>`);
    parts.push(`<g class="xs-caustics"><path d="M15 38q28 9 58 0t57 0t58 0t57 0t58 0t57 0"/><path d="M28 47q24 7 49 0t49 0t49 0t49 0t49 0t49 0"/></g>`);
    parts.push(`<g class="xs-particles"><circle cx="47" cy="78" r=".8"/><circle cx="91" cy="118" r=".55"/><circle cx="151" cy="70" r=".65"/><circle cx="221" cy="106" r=".75"/><circle cx="305" cy="84" r=".6"/><circle cx="74" cy="169" r=".5"/><circle cx="255" cy="178" r=".55"/><circle cx="327" cy="153" r=".45"/></g>`);
    parts.push(`<path class="xs-surface" d="M0 ${surface} C18 ${surface - 3} 32 ${surface + 3} 50 ${surface} S82 ${surface - 3} 100 ${surface} S132 ${surface + 3} 150 ${surface} S182 ${surface - 3} 200 ${surface} S232 ${surface + 3} 250 ${surface} S282 ${surface - 3} 300 ${surface} S332 ${surface + 3} 360 ${surface}"/>`);
    if (band) parts.push(`<rect class="xs-thermo" x="0" y="${y(band[0]).toFixed(1)}" width="${W}" height="${Math.max(4, y(band[1]) - y(band[0])).toFixed(1)}"/><text class="xs-note" x="${W - 12}" y="${(y((band[0] + band[1]) / 2) + 3).toFixed(1)}" text-anchor="end">THERMOCLINE · VARIES</text>`);
    if (surfaceTemp != null) parts.push(`<g class="xs-temp-badge"><rect x="12" y="${surface + 11}" width="76" height="28" rx="14"/><text class="xs-temp" x="23" y="${surface + 30}">${temp(surfaceTemp)}<tspan class="xs-note" dx="5">SURFACE</tspan></text></g>`);
    if (deepTemp != null) parts.push(`<text class="xs-temp cold" x="12" y="${(y(band[1]) + 20).toFixed(1)}">${temp(deepTemp)}<tspan class="xs-note" dx="5">below · est.</tspan></text>`);
    if (!bottom) {
      parts.push(`<g class="xs-unknown"><circle cx="${W / 2}" cy="${H / 2}" r="35"/><circle cx="${W / 2}" cy="${H / 2}" r="22"/><path d="M${W / 2 - 46} ${H / 2}h92M${W / 2} ${H / 2 - 46}v92"/><text class="xs-big" x="${W / 2}" y="${H / 2 + 65}" text-anchor="middle">DEPTH NOT PUBLISHED</text></g>`);
      return `<svg class="xsection" viewBox="0 0 ${W} ${H}" role="img" aria-label="Depth not published">${parts.join('')}</svg>`;
    }
    const fy = y(bottom), featureH = Math.max(48, Math.min(68, (fy - surface) * .34));
    // A quiet numeric ruler makes the scale readable without turning the scene into graph paper.
    const displayMax = max * (imperial ? 3.28084 : 1);
    const step = imperial ? (displayMax <= 80 ? 20 : displayMax <= 180 ? 40 : 50) : (displayMax <= 25 ? 5 : displayMax <= 55 ? 10 : 20);
    for (let value = step; value < displayMax - step * .2; value += step) {
      const yy = y(value * (imperial ? .3048 : 1));
      parts.push(`<line class="xs-grid" x1="0" x2="${W}" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}"/><text class="xs-grid-t" x="${W - 11}" y="${(yy - 4).toFixed(1)}" text-anchor="end">${value}</text>`);
    }
    parts.push(`<text class="xs-grid-unit" x="${W - 11}" y="${surface + 15}" text-anchor="end">${imperial ? 'FT' : 'M'}</text>`);
    const bed = `<path class="xs-bed${depth.estimated ? ' est' : ''}" d="M0 ${fy.toFixed(1)} C55 ${fy - 5} 93 ${fy + 5} 142 ${fy} S244 ${fy - 5} 360 ${fy + 1} L360 ${H} L0 ${H}Z"/>`;
    const shadow = `<ellipse class="xs-scene-shadow" cx="190" cy="${fy + 3}" rx="124" ry="8"/>`;
    const wreck = `<g class="xs-wreck">${shadow}<path class="xs-wreck-side" d="M58 ${fy - 36}L294 ${fy - 36}Q309 ${fy - 34} 323 ${fy - 22}L302 ${fy - 4}Q229 ${fy + 4} 93 ${fy - 1}Q72 ${fy - 9} 58 ${fy - 36}Z"/><path class="xs-wreck-top" d="M58 ${fy - 36}L294 ${fy - 36}Q306 ${fy - 34} 317 ${fy - 27}L83 ${fy - 27}Z"/><path class="xs-rust" d="M87 ${fy - 24}q34 8 67 2m60 5q38 7 75 -3M106 ${fy - 2}q77 8 159 1"/><g class="xs-wreck-detail"><path d="M116 ${fy - 37}v-17h53v17m-45 -17v-8h29v8M222 ${fy - 37}v-20h41v20m-33 -20v-8h24v8M245 ${fy - 65}v-22m0 5l26 15m-26 -11l-25 14"/><path d="M77 ${fy - 38}h220M96 ${fy - 42}v5m16 -5v5m71 -5v5m15 -5v5m76 -5v5"/><circle cx="110" cy="${fy - 17}" r="3.2"/><circle cx="128" cy="${fy - 16}" r="3.2"/><circle cx="146" cy="${fy - 15}" r="3.2"/><circle cx="269" cy="${fy - 16}" r="3.2"/></g><path class="xs-rubble" d="M43 ${fy}l10 -8 10 8m-1 0 14 -5 8 5m229 0 8 -6 9 6"/></g>`;
    const reef = `<g class="xs-reef">${shadow}<path class="xs-reef-back" d="M45 ${fy}q20 -34 46 -28q15 -35 48 -18q25 -48 61 -12q24 -29 49 -6q28 -17 48 13q31 -2 47 31Z"/><path class="xs-site reef" d="M52 ${fy}q17 -27 39 -22q15 -27 42 -13q24 -37 54 -10q24 -24 45 -4q24 -14 42 11q27 -1 43 18Z"/><g class="xs-coral"><path d="M91 ${fy - 21}v-27m0 12l-12 -12m12 4 14 -15m-14 26-15 -6"/><path d="M244 ${fy - 29}v-32m0 13l-13 -13m13 4 16 -16m-16 27 15 -8"/><path d="M178 ${fy - 52}q-15 -17 -28 -2q14 3 28 2q16 -18 31 -1q-17 4 -31 1"/><path d="M293 ${fy - 14}q-13 -30 3 -40q10 21 -3 40m0 -18q17 -19 27 -8q-10 13 -27 17"/></g><g class="xs-brain-coral"><path d="M117 ${fy - 11}q0 -19 19 -19t20 19"/><path d="M124 ${fy - 13}q4 -10 11 0t12 0"/></g><g class="xs-fish"><path d="M278 ${fy - 73}q9 -6 18 0q-9 6 -18 0l-7 -6v12z"/><path d="M62 ${fy - 69}q7 -5 15 0q-8 5 -15 0l-6 -5v10z"/><path d="M311 ${fy - 89}q5 -3 11 0q-6 4 -11 0l-4 -3v6z"/></g></g>`;
    const cave = `<g class="xs-cave">${shadow}<path class="xs-cave-light" d="M143 ${surface - 2}L187 ${fy - 22}H239L219 ${surface - 2}Z"/><path class="xs-cave-rock" d="M0 ${surface - 3}H139L133 ${surface + 19}L120 ${surface + 28}L127 ${surface + 47}L112 ${surface + 61}L130 ${surface + 87}L115 ${surface + 105}L92 ${surface + 96}L73 ${surface + 130}L58 ${fy}H0Z"/><path class="xs-cave-rock right" d="M360 ${surface - 3}H225L229 ${surface + 16}L243 ${surface + 29}L238 ${surface + 47}L257 ${surface + 63}L249 ${surface + 83}L268 ${surface + 99}L294 ${surface + 125}L308 ${fy}H360Z"/><path class="xs-cave-rim" d="M0 ${surface - 2}H139L132 ${surface + 20}L119 ${surface + 29}M360 ${surface - 2}H225L230 ${surface + 17}L244 ${surface + 30}"/><path class="xs-cave-strata" d="M5 ${surface + 17}H116M7 ${surface + 37}H94M354 ${surface + 17}H247M353 ${surface + 38}H267M18 ${surface + 76}L91 ${surface + 89}M342 ${surface + 77}L281 ${surface + 91}"/><g class="xs-stalactites"><path d="M112 ${surface - 1}l7 33 8 -22 7 45 9 -28 8 36m74 -64 8 31 8 -20 7 42 10 -27 7 35"/><path d="M78 ${fy}l8 -24 8 24 10 -35 10 35m176 0 9 -30 10 30"/></g><path class="xs-guideline" d="M52 ${fy - 19}Q143 ${fy - 42} 258 ${fy - 25}L314 ${fy - 13}"/><circle class="xs-line-anchor" cx="52" cy="${fy - 19}" r="3"/><circle class="xs-line-anchor" cx="314" cy="${fy - 13}" r="3"/></g>`;
    const lake = `<g class="xs-lake"><path class="xs-lake-bed${depth.estimated ? ' est' : ''}" d="M0 ${surface + 22}C42 ${surface + 34} 74 ${fy - 52} 128 ${fy - 18}C176 ${fy + 5} 225 ${fy + 4} 360 ${surface + 28}L360 ${H}L0 ${H}Z"/><path class="xs-lake-contour" d="M59 ${surface + 62}q49 85 111 112m-93 -80q51 69 110 84m112 -110q-33 64 -80 108m101 -73q-31 48 -68 69"/><path class="xs-lake-log" d="M177 ${fy - 7}q34 -25 76 -13m-43 3 8 -14m-1 12 18 6"/><g class="xs-lake-life"><path d="M25 ${surface + 27}q-5 -20 2 -34m5 37q8 -20 3 -35m292 39q-5 -22 2 -37m5 40q8 -18 4 -33"/><ellipse cx="158" cy="${fy - 4}" rx="13" ry="6"/><ellipse cx="279" cy="${fy - 3}" rx="8" ry="4"/></g></g>`;
    const wall = `<g class="xs-wall">${bed}<path class="xs-site rock" d="M0 ${surface + 17}H75L91 ${surface + 55}L80 ${surface + 91}L98 ${surface + 120}L88 ${fy}H0Z"/><path class="xs-wall-edge" d="M75 ${surface + 17}L91 ${surface + 55}L80 ${surface + 91}L98 ${surface + 120}L88 ${fy}"/></g>`;
    const pinnacle = `<g class="xs-pinnacle">${bed}${shadow}<path class="xs-site rock" d="M91 ${fy}L133 ${fy - 28}L158 ${fy - featureH + 10}L181 ${fy - featureH}L204 ${fy - featureH + 14}L229 ${fy - 30}L278 ${fy}Z"/><path class="xs-wall-edge" d="M111 ${fy - 9}L181 ${fy - featureH}L251 ${fy - 10}"/></g>`;
    if (!['lake', 'wall', 'pinnacle'].includes(sceneKind)) parts.push(bed);
    parts.push({ wreck, reef, cave, lake, wall, pinnacle }[sceneKind] || reef);
    // The diver is intentionally secondary; its lamp connects the human scale to the feature.
    const diverX = sceneKind === 'cave' ? 176 : 92, diverY = sceneKind === 'cave' ? fy - 45 : Math.max(surface + 72, fy - 87);
    const beamTargetX = sceneKind === 'wreck' ? 150 : sceneKind === 'reef' ? 142 : sceneKind === 'cave' ? 235 : 175;
    const beamTargetY = sceneKind === 'cave' ? fy - 32 : fy - 29;
    parts.push(`<path class="xs-diver-beam" d="M${diverX + 17} ${diverY + 4}L${beamTargetX} ${beamTargetY - 8}L${beamTargetX} ${beamTargetY + 8}Z"/><g class="xs-diver" transform="translate(${diverX} ${diverY}) scale(.72)"><circle cx="0" cy="0" r="2.6"/><path d="M3 1l12 3 8 -2m-8 2 7 7m-9 -7-5 8m-5 -9-7 -3m26 11 8 3m-8 -3 6 7"/><path class="xs-tank" d="M3 -1h5v9H3z"/><circle class="xs-bubble" cx="-5" cy="-8" r="1.3"/><circle class="xs-bubble" cx="-8" cy="-14" r=".8"/></g>`);
    parts.push(`<rect y="${surface}" width="${W}" height="${H - surface}" fill="url(#xs-vignette)" pointer-events="none"/>`);
    // Premium, compact depth callouts replace the old long label bars.
    const mark = (d, key, text) => { const yy = y(d); return `<g class="xs-depth-mark"><line x1="264" x2="348" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}"/><rect x="274" y="${(yy - 20).toFixed(1)}" width="74" height="19" rx="9.5"/><text class="xs-depth-k" x="282" y="${(yy - 7).toFixed(1)}">${key}</text><text class="xs-depth-v" x="341" y="${(yy - 7).toFixed(1)}" text-anchor="end">${text}</text></g>`; };
    if (Number.isFinite(depth.top) && depth.top < bottom - 1) parts.push(mark(depth.top, 'TOP', label(depth.top)));
    parts.push(mark(bottom, rawKind === 'wreck' ? 'BOTTOM' : 'MAX', label(bottom)));
    // Your training limit, or the recreational limit when we don't know it.
    const limitLine = (meters, text, classes) => { const yy = y(meters); return `<g class="xs-limit-g ${classes}"><line x1="0" x2="${W}" y1="${yy.toFixed(1)}" y2="${yy.toFixed(1)}"/><rect x="12" y="${(yy - 18).toFixed(1)}" width="${Math.max(91, text.length * 5.3)}" height="17" rx="8.5"/><text x="20" y="${(yy - 6).toFixed(1)}">${text}</text></g>`; };
    if (showLimit) parts.push(limitLine(limit, `YOUR LIMIT · ${imperial ? ng.diver.limitFeet + ' FT' : limit + ' M'}`, bottom > limit + .5 ? 'over' : 'good'));
    else if (!limit && max > 40) parts.push(limitLine(40, `RECREATIONAL · ${imperial ? '130 FT' : '40 M'}`, 'rec'));
    parts.push(`<g class="xs-caption"><rect x="12" y="${H - 22}" width="196" height="15" rx="7.5"/><text x="20" y="${H - 11}">${sceneName.toUpperCase()} · ILLUSTRATIVE PROFILE</text></g>`);
    return `<svg class="xsection" viewBox="0 0 ${W} ${H}" role="img" aria-label="Cross-section: ${esc(site.name)}, ${esc(depth.value)}. The ${esc(sceneName.toLowerCase())} artwork is illustrative; depth markers are to scale.${limit ? ` Your limit ${imperial ? ng.diver.limitFeet + ' feet' : limit + ' metres'}.` : ''}">${parts.join('')}</svg>`;
  }
  // ── Dive slate: the numbers as tiles ───────────────────────────────────────────────────────────────
  function slate(site, ng) {
    const depth = siteDepth(site, ng), profile = ng.profile, fit = fitVerdict(site, ng);
    const water = diveWater(site, ng), vis = siteVis(ng), current = siteCurrent(ng), wear = ng.wear?.[state.month];
    const tiles = [];
    if (depth) {
      const [value, unit] = splitUnit(depth.researched ? depth.value : depth.peek || depth.value);
      const limit = ng.diver?.limitMeters;
      const margin = limit && depth.meters ? (imperial ? ng.diver.limitFeet - Math.round(depth.meters * 3.28084) : Math.round(limit - depth.meters)) : null;
      const fitLine = fit && fit.tone !== 'info' ? `<em class="slate-fit fit-${fit.tone}">${margin != null && margin > 0 ? `✓ ${margin} ${DATA.depthUnit} above your limit` : esc(fit.short)}</em>` : '';
      const source = depth.researched ? esc((ng.profile.sources?.[0]?.name || 'researched').split(' — ')[0]) : depth.estimated ? 'estimated' : 'published';
      tiles.push(`<div class="tile tall"><small>Depth</small><strong class="num">${esc(value)}</strong><span>${unit === 'ft' ? 'feet' : 'metres'} · ${source}</span>${fitLine}</div>`);
    } else tiles.push('<div class="tile tall"><small>Depth</small><strong class="num">—</strong><span>Not published — ask the operator</span></div>');
    tiles.push(`<div class="tile"><small>${water?.label === 'at depth' ? 'At depth' : 'Water'}</small><strong class="num cold">${water ? temp(water.value) : '—'}</strong><span>${wear?.label && wear.label !== 'Confirm water temperature' ? esc(/mm$/.test(wear.label) ? `${wear.label} wetsuit` : wear.label) : water?.estimated ? 'estimated' : months[state.month]}</span></div>`);
    tiles.push(`<div class="tile"><small>Current</small><strong>${current ? esc(current.value) : '—'}</strong><span>${vis ? `vis ${vis.value}${vis.estimated ? ' · est.' : ''}` : 'vis not reported'}</span></div>`);
    const entry = profile?.entry || site.entry, region = profile?.region;
    const strip = [entry ? ENTRY_NAMES[entry] || entry : '', profile?.mooring ? 'Mooring buoy' : '', profile?.water === 'fresh' || ng.guide?.inland ? 'Fresh water' : '', region?.season ? `${months[region.season[0]]}–${months[region.season[1]]}` : ''].filter(Boolean);
    if (strip.length) tiles.push(`<div class="tile wide">${strip.map(t => `<span>${esc(t)}</span>`).join('')}</div>`);
    return `<div class="slate">${tiles.join('')}</div>`;
  }
  // When to go, month by month: the usual dive season, with the months something is in season marked.
  function seasonStrip(ng) {
    const season = ng.profile?.season || ng.profile?.region?.season, animals = (ng.guide?.animals || []).filter(a => a.sourced);
    if (!season && !animals.length) return '';
    const inSeason = i => season ? (season[0] <= season[1] ? i >= season[0] && i <= season[1] : i >= season[0] || i <= season[1]) : true;
    const life = i => animals.some(a => a.months.includes(i));
    return `<div class="section-label">When to go</div><div class="season-strip">${months.map((m, i) => `<span class="${inSeason(i) ? 'on' : ''}${life(i) ? ' life' : ''}${i === state.month ? ' now' : ''}" title="${m}"><i></i><b>${m[0]}</b></span>`).join('')}</div><p class="note">${season ? `Best season ${months[season[0]]}–${months[season[1]]}${ng.profile?.season ? '' : ng.profile?.region?.name ? ` in ${esc(ng.profile.region.name)}` : ''}.` : ''}${animals.length ? ' Dots mark documented marine-life seasons.' : ''}</p>`;
  }
  // The guide in four tabs, so nothing repeats and nothing is a long scroll away.
  const SITE_TABS = [['overview', 'Overview'], ['conditions', 'Conditions'], ['life', 'Marine life'], ['about', 'About']];
  let siteTab = 'overview', keepHeader = false;
  function overviewTab(site, ng) {
    const g = glanceParts(ng.ratings), inland = ng.guide?.inland, profile = ng.profile;
    const warning = /war grave|licen[cs]e|prohibited|protected (military )?wreck|listed historic/i.test(site.note || '') ? `<p class="callout">${esc(site.note)}</p>` : '';
    const photo = ng.photo ? `<figure class="site-photo"><img src="${esc(ng.photo.url)}" alt="${esc(site.name)}" loading="lazy"><a href="${esc(ng.photo.page)}">📷 ${esc(ng.photo.attribution)} ↗</a></figure>` : '';
    const summary = profile?.summary ? `<p class="site-summary">${esc(profile.summary)}</p>${profile.confidence === 'needs-local' ? '<p class="confidence">From diver reports — not yet confirmed against an official record.</p>' : ''}` : '';
    const chips = profile?.highlights?.length ? `<div class="see-chips">${profile.highlights.map(h => `<span>${esc(h)}</span>`).join('')}</div>` : site.topologies?.length ? `<div class="see-chips">${site.topologies.map(v => `<span>${esc(v)}</span>`).join('')}</div>` : '';
    // Everything else that matters, as small tiles: only what's known.
    const facts = [];
    const fact = (label, value, detail = '') => facts.push(`<div class="fact"><small>${label}</small><strong>${value}</strong>${detail ? `<span>${detail}</span>` : ''}</div>`);
    const entry = profile?.entry || site.entry;
    const SHORE = { parking: 'Parking', toilets: 'Toilets', shower: 'Showers', water: 'Drinking water', slipway: 'Slipway', pier: 'Pier', beach: 'Beach' };
    const shoreAccess = ng.shore && (entry === 'shore' || ['parking', 'pier', 'slipway', 'toilets', 'shower', 'water'].some(kind => kind in ng.shore));
    const facilities = shoreAccess ? Object.entries(ng.shore).filter(([, m]) => m <= 300).map(([kind]) => SHORE[kind] || esc(kind)) : [];
    if (facilities.length) fact('At the shore', esc(facilities.slice(0, 3).join(', ')), 'Mapped on OpenStreetMap');
    if (profile?.penetration) fact('Inside', 'Possible', esc(profile.penetration));
    if (g?.travel) fact('Getting there', esc(g.travel.level), `${esc(g.travel.detail)}${g.travel.personal ? ' from your start' : ''}`);
    if (inland?.altitude) fact('Altitude', elevText(inland.elevation), 'Altitude dive — adjust your tables');
    if (ng.protection?.length) fact('Protected', ng.protection.map(area => `<a href="${esc(area.url)}">${esc(area.name)} ↗</a>`).join('<br>'), 'Look, don’t take — park rules apply');
    else if (!warning && profile?.sources?.some(s => s.key === 'whs')) fact('Protected', 'State law', 'Historic wreck — look, don’t take');
    if (ng.community?.rating) fact('Community rating', `${Number(ng.community.rating).toFixed(1)} / 5`, ng.community.loggedDives ? `${ng.community.loggedDives.toLocaleString()} logged dives · OpenDiveMap aggregate` : 'OpenDiveMap aggregate');
    if (!profile?.level && g?.experience) fact('Level', `<span class="${levelClass(g.experience.level)}">${esc(g.experience.level)}</span>`, esc(g.experience.reasons.slice(0, 2).join(' · ')));
    const accessText = profile?.access || [ng?.structured?.access, ng?.structured?.accessEase].filter(Boolean).join(' · ');
    const access = accessText ? `<p class="callout soft">${esc(accessText)}${!profile?.access ? ' · mapped on OpenStreetMap; confirm locally' : ''}</p>` : '';
    const fit = fitVerdict(site, ng);
    const fitNote = fit && fit.tone !== 'good' && fit.tone !== 'info' ? `<p class="fit fit-${fit.tone} slate-note"><b>${FIT_MARK[fit.tone]}</b><span>${esc(fit.text)}</span></p>` : '';
    const hazardList = [...new Set([...(profile?.hazards || []), ...(ng?.structured?.hazards || [])])];
    const hazards = hazardList.length ? `<div class="section-label">Watch for</div><div class="watch-chips">${hazardList.map(h => `<span>${esc(h)}</span>`).join('')}</div>` : '';
    const mine = divesAtSite(site);
    const mineHtml = mine ? `<div class="section-label">Your dives here</div>${siteTally(mine.dives.length, mine.verified || 0)}${diveRows(mine.dives.slice(0, 3))}${mine.dives.length > 3 ? `<p class="note">And ${mine.dives.length - 3} more in your logbook.</p>` : ''}` : '';
    const depth = siteDepth(site, ng);
    const sourceLine = depth?.researched && profile.sources?.[0] ? `Depth and facts: ${profile.sources[0].url ? `<a class="source" href="${esc(profile.sources[0].url)}">${esc(profile.sources[0].name.split(' — ')[0])} ↗</a>` : esc(profile.sources[0].name)}. ` : depth?.estimated ? 'Depth estimated from seafloor data. ' : '';
    return `<div class="hero">${crossSection(site, ng)}</div>${summary}${chips}${slate(site, ng)}${warning}${fitNote}${access}${facts.length ? `<div class="facts">${facts.join('')}</div>` : ''}${hazards}${photo}${mineHtml}<p class="note">${sourceLine}Confirm conditions and requirements with a local operator.</p>`;
  }
  function weatherCard(weather) {
    if (!weather || weather.status === 'loading') return `<section class="forecast loading" aria-live="polite"><div class="forecast-loading"><i></i><span><strong>Surface forecast</strong><small>Loading conditions at this site…</small></span></div></section>`;
    if (weather.status !== 'ready' || !weather.data?.hours?.length) return `<section class="forecast unavailable"><span class="forecast-mark">↻</span><span><strong>Surface forecast unavailable</strong><small>The rest of the site guide is still available. Try again when you have a connection.</small></span></section>`;
    const data = weather.data, hours = data.hours, now = hours[0], marine = data.marine?.hours?.[0];
    const symbol = code => /thunder/.test(code) ? ['ϟ', 'Thunderstorms'] : /snow|sleet/.test(code) ? ['✣', 'Snow or sleet'] : /rain|shower/.test(code) ? ['╱', 'Rain showers'] : /fog/.test(code) ? ['≋', 'Fog'] : /partlycloud/.test(code) ? ['◒', 'Partly cloudy'] : /cloudy/.test(code) ? ['●', 'Cloudy'] : /fair/.test(code) ? ['◐', 'Fair'] : ['○', 'Clear'];
    const [mark, condition] = symbol(now.symbolCode || '');
    const compass = degrees => Number.isFinite(degrees) ? ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(((degrees % 360) + 360) % 360 / 45) % 8] : '—';
    const wind = Number.isFinite(now.windSpeedMps) ? `${Math.round(now.windSpeedMps * (imperial ? 2.23694 : 3.6))} ${imperial ? 'mph' : 'km/h'}` : '—';
    const rain = hours.slice(0, 6).reduce((sum, hour) => sum + (Number.isFinite(hour.precipitationMm) ? hour.precipitationMm : 0), 0);
    const rainText = rain > 0 && rain < .1 ? '&lt;0.1 mm' : `${rain.toFixed(rain >= 10 ? 0 : 1)} mm`;
    const uv = Math.max(...hours.slice(0, 12).map(hour => Number.isFinite(hour.uvIndexClearSky) ? hour.uvIndexClearSky : 0));
    const points = [0, 3, 6, 9].map((offset, index) => hours[Math.min(offset, hours.length - 1)] ? { ...hours[Math.min(offset, hours.length - 1)], offset: index ? `+${offset}h` : 'Now' } : null).filter(Boolean);
    const timeline = points.map(point => { const [glyph, label] = symbol(point.symbolCode || ''); return `<span title="${esc(label)}"><small>${point.offset}</small><b>${glyph}</b><strong>${temp(point.airTemperatureC)}</strong></span>`; }).join('');
    const source = data.source || { name: 'MET Norway', url: 'https://api.met.no/', license: 'CC BY 4.0' };
    return `<section class="forecast">
      <div class="forecast-head"><span class="forecast-mark">${mark}</span><div><small>Surface forecast · now</small><strong>${esc(condition)}${Number.isFinite(now.apparentTemperatureC) ? ` · feels ${temp(now.apparentTemperatureC)}` : ''}</strong></div><em>${temp(now.airTemperatureC)}</em></div>
      <div class="forecast-stats"><span><small>Wind</small><strong>${esc(wind)}</strong><b>${compass(now.windDirectionDeg)}</b></span><span><small>Next 6h rain</small><strong>${rainText}</strong><b>${Number.isFinite(now.humidityPercent) ? `${Math.round(now.humidityPercent)}% humidity` : ''}</b></span><span><small>Clear-sky UV</small><strong>${uv ? uv.toFixed(1) : '—'}</strong><b>${uv >= 8 ? 'very high' : uv >= 6 ? 'high' : uv >= 3 ? 'moderate' : uv ? 'low' : ''}</b></span><span><small>Open-ocean waves</small><strong>${marine ? `${marine.waveHeightM.toFixed(1)} m` : '—'}</strong><b>${marine?.wavePeriodS ? `${marine.wavePeriodS.toFixed(0)} s period` : 'model unavailable'}</b></span></div>
      <div class="forecast-line">${timeline}</div>
      <div class="forecast-foot"><span>Forecast guidance, not dive clearance. Offshore waves can differ at the entry, reef, harbor or lee shore; confirm locally.</span><a href="${esc(source.url)}">${esc(source.name)} · ${esc(source.license)} ↗</a>${data.marine?.source ? `<a href="${esc(data.marine.source.url)}">${esc(data.marine.source.name)} · ${esc(data.marine.source.license)} ↗</a>` : ''}</div>
    </section>`;
  }
  function diveDayGearCard(site, ng) {
    const water = monthWater(site, ng), wear = ng.wear?.[state.month];
    const suggestedExposure = ng.gear?.exposureLabel || wear?.label;
    const label = suggestedExposure && suggestedExposure !== 'Confirm water temperature' ? (/mm$/.test(suggestedExposure) ? `${suggestedExposure} wetsuit` : suggestedExposure) : 'Confirm exposure protection';
    const marine = !ng.guide?.inland && ng.profile?.water !== 'fresh';
    const loading = !ng.weather || ng.weather.status === 'loading';
    const plan = buildDiveDayAdvice({ weather: ng.weather?.data, waterTemperatureC: water, exposureLabel: label, motionSensitive: ng.comfort?.motionSensitive === true, marine: marine && !loading });
    if (loading) plan.items.splice(1, 0, { kind: 'weather', tone: 'neutral', title: 'Surface recommendations loading…', detail: 'Wind, temperature, UV, rain and sea-state guidance will appear here when the site forecast arrives.' });
    const marks = { water: '≈', warmth: '▰', recovery: '◇', rain: '╱', sun: '☼', heat: '☼', boat: '≋', motion: '↝' };
    const selectedMode = ng.gear?.mode || gearMode;
    const modes = [['recreational', 'Recreational'], ['technical', 'Technical'], ['freedive', 'Freedive']]
      .map(([value, title]) => `<button role="tab" data-gear-mode="${value}" aria-controls="locker-plan" aria-selected="${selectedMode === value}">${title}</button>`).join('');
    const gear = ng.gear;
    const locker = gear?.status === 'loading' || !gear ? '<div class="locker-empty"><strong>Matching your Gear Locker…</strong><small>Your saved setup and actual packing list will appear here.</small></div>'
      : gear.setup ? `<div class="locker-match"><div class="locker-title"><span><small>Closest saved setup</small><strong>${esc(gear.setup.name)}</strong></span><b>${gear.setup.items.length} items</b></div><ul class="locker-items">${gear.setup.items.map(item => `<li><strong>${esc(item.name)}</strong><small>${esc(item.category)}</small></li>`).join('')}</ul>${gear.setup.changes?.length ? `<p class="locker-note add"><b>Add or swap</b>${esc(gear.setup.changes.join(' · '))}</p>` : ''}${gear.setup.removed?.length ? `<p class="locker-note"><b>Leave out</b>${esc(gear.setup.removed.join(' · '))}</p>` : ''}${gear.setup.warnings?.length ? `<details class="locker-checks"><summary>${gear.setup.warnings.length} ${gear.setup.warnings.length === 1 ? 'check' : 'checks'} before packing</summary>${gear.setup.warnings.map(warning => `<p>${esc(warning)}</p>`).join('')}</details>` : ''}</div>`
        : `<div class="locker-empty"><strong>No matching saved ${selectedMode === 'freedive' ? 'freedive' : selectedMode} setup yet</strong><small>Add gear to a setup and mark what you use it for in Gear Locker preferences.</small></div>`;
    return `<section class="day-plan"><div class="day-plan-head"><span><small>Dive-day gear plan</small><strong>${esc(plan.headline)}</strong></span><b>Conditions → what to pack</b></div><div class="gear-mode" role="tablist" aria-label="Planned dive type">${modes}</div><div class="day-plan-list">${plan.items.map(item => `<div class="day-item tone-${item.tone}"><i>${marks[item.kind] || '•'}</i><span><strong>${esc(item.title)}</strong><small>${esc(item.detail)}</small></span></div>`).join('')}</div><div class="locker-plan" id="locker-plan" role="tabpanel" aria-live="polite"><div class="locker-kicker">From your Gear Locker · ${esc(months[state.month])}</div>${locker}</div><button id="gear-for-dive">Fine-tune depth, temperature or overhead plan →</button></section>`;
  }
  function conditionsTab(site, ng) {
    const region = ng.profile?.region, vis = siteVis(ng), current = siteCurrent(ng), depth = siteDepth(site, ng);
    const rows = [];
    if (region?.tempDeepC && (depth?.meters ?? 0) >= 12) rows.push(spec('At depth', `${temp(region.tempDeepC[0]).replace(/°.*/, '')}–${temp(region.tempDeepC[1])} ${EST}`, `Below the summer thermocline in ${esc(region.name)} — much colder than the surface`));
    const t = ng.profile?.waterTempC;
    if (t && Number.isFinite(t[1])) rows.push(spec('Water temp', `${Number.isFinite(t[0]) && t[0] !== t[1] ? `${temp(t[0]).replace(/°.*/, '')}–` : ''}${temp(t[1])}`, esc(ng.profile.tempNote || 'Reported for this site — varies with season and depth')));
    if (vis) rows.push(spec('Visibility', `${vis.value}${vis.estimated ? ` ${EST}` : ''}`, vis.community
      ? `Community-reported average${vis.loggedDives ? ` across ${vis.loggedDives.toLocaleString()} logged dives` : ''} — conditions still vary with weather, tides and runoff`
      : vis.estimated ? `Satellite water clarity offshore, ${months[state.month]} average — local visibility changes with weather and runoff` : 'Typical range reported for this site'));
    if (ng.community?.averageDiveMinutes) rows.push(spec('Logged dive time', `~${Math.round(ng.community.averageDiveMinutes)} min ${EST}`,
      `Community average${ng.community.loggedDives ? ` across ${ng.community.loggedDives.toLocaleString()} logged dives` : ''} — not a recommended limit`));
    if (current) rows.push(spec('Current', `${esc(current.value)}${current.estimated ? ` ${EST}` : ''}`, current.estimated ? `Typical for ${esc(region?.name || 'the area')} — wind and waves can change it` : ''));
    const notes = region?.notes?.length ? `<div class="section-label">Good to know</div><ul class="see-list">${region.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : '';
    return weatherCard(ng.weather) + diveDayGearCard(site, ng) + thisMonth(site, ng) + seasonStrip(ng) + (rows.length ? `<div class="section-label">In the water</div><div class="specs">${rows.join('')}</div>` : '') + waterYear(site, ng) + notes;
  }
  function lifeTab(site, ng) {
    const g = glanceParts(ng.ratings), deep = (siteDepth(site, ng)?.meters || 0) > 12;
    const drivers = g?.life ? g.life.drivers.filter(name => !(deep && SHORE_ONLY.test(name))) : [];
    const summary = g?.life ? `<div class="life-summary">${stars(g.life.stars)}<span><strong>${esc(g.life.label)}</strong>${drivers.length ? `<small>${esc(drivers.join(' · '))}</small>` : ''}</span></div>` : '';
    return summary + guideSection(ng.guide, 'When to go', { chips: false });
  }
  function aboutTab(site, ng) {
    return encyclopedia(ng.facts) + aboutPin(site, ng).replace('<details class="fold">', '<details class="fold" open>');
  }
  function sitePage(site, ng) {
    if (!ng) return `<p class="note">Loading the site guide…</p>${aboutPin(site, null)}`;
    const tab = { overview: overviewTab, conditions: conditionsTab, life: lifeTab, about: aboutTab }[siteTab] || overviewTab;
    return tab(site, ng);
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
  function temperatureCard(item, known, { chartOnly = false } = {}) {
    if (!state.layers.temperature || item.siteType === 'quarry') return '';
    const at = index => known?.length === 12 ? known[index] : MODEL.temperatureAt(DATA.temperature, item.latitude, item.longitude, index);
    const value = at(state.month);
    const profile = months.map((month, index) => ({ month, value: at(index) }));
    const valid = profile.filter(point => point.value != null);
    const coolest = valid.length ? valid.reduce((a, b) => a.value < b.value ? a : b) : null;
    const warmest = valid.length ? valid.reduce((a, b) => a.value > b.value ? a : b) : null;
    const bars = valid.length ? `<div class="climate-chart" aria-label="Monthly average sea-surface temperature profile">${profile.map((point, index) => `<span class="${index === state.month ? 'current' : ''}" title="${point.month}: ${temp(point.value)}"><i style="height:${point.value == null ? 3 : Math.max(7, Math.min(100, (point.value + 2) / 34 * 100))}%"></i><b>${point.month[0]}</b></span>`).join('')}</div><div class="climate-range"><span>Coolest<br><strong>${coolest.month} · ${temp(coolest.value)}</strong></span><span>Warmest<br><strong>${warmest.month} · ${temp(warmest.value)}</strong></span></div>` : '';
    if (chartOnly) return valid.length ? `${bars}<p class="note">Average sea surface 1991–2020 (NOAA, regional 2° grid) — not today’s conditions or the temperature at depth.</p>` : '';
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
    const rank = s => (s.id === spotlight ? 2 : 0) + Number(s.months.includes(state.month + 1));
    return `<div class="section-label">${esc(region.name)} · marine life</div>${species.length ? [...species].sort((a, b) => rank(b) - rank(a)).map(animalCard).join('') : '<p class="note">The selected species is not documented in this regional guide. Choose “All marine life” to explore the available species.</p>'}<p class="note">Regional guidance, not a complete species inventory. Encounters vary; seasonal windows do not guarantee sightings.</p>`;
  }
  // Where to dive inside a wildlife region: its featured dive areas, then mapped sites nearest its centre.
  let regionPlaces = { areas: [], sites: [] };
  function regionDiving(region) {
    if (!region.bounds) return '';
    const inside = item => MODEL.inBounds(region.bounds, item.latitude, item.longitude);
    const near = (a, b) => ((a.latitude - region.latitude) ** 2 + (a.longitude - region.longitude) ** 2) - ((b.latitude - region.latitude) ** 2 + (b.longitude - region.longitude) ** 2);
    const areas = [...DATA.diveRegions.flatMap(r => r.areas), ...DATA.remoteAreas].filter(inside);
    const sites = DATA.sites.filter(inside).sort(near);
    regionPlaces = { areas, sites };
    const row = (attr, index, name, detail) => `<button class="area-row" ${attr}="${index}"><span><strong>${esc(name)}</strong><small>${esc(detail)}</small></span>${icon('arrow')}</button>`;
    return `<div class="section-label">Dive here</div>${areas.length ? `<div class="area-list">${areas.map((area, i) => row('data-region-dive-area', i, area.name, area.subtitle)).join('')}</div>` : ''}${sites.length ? `<div class="area-list">${sites.slice(0, 12).map((site, i) => row('data-region-dive-site', i, site.name, site.siteType || site.region || 'Dive site')).join('')}</div>${sites.length > 12 ? `<p class="note">The ${sites.length} mapped sites here are on the map — zoom in to explore the rest.</p>` : ''}` : areas.length ? '' : '<p class="note">No dive sites are mapped in this area yet. Zoom in or search to explore nearby.</p>'}`;
  }
  function provinceDetails(region) {
    if (!state.layers.regions || !region) return '';
    return `<div class="section-label">Regional lens · habitats & life</div><p class="region-story">${esc(region.story)}</p><div class="region-fact">${esc(region.fact)}</div><div class="chip-label">Habitats</div><div class="chips">${region.habitats.map(value => `<span>${esc(value)}</span>`).join('')}</div><div class="chip-label">Representative wildlife groups</div><div class="chips wildlife-chips">${region.wildlife.map(value => `<span>${esc(value)}</span>`).join('')}</div><a class="source" href="${esc(region.url)}">${esc(region.source)} ↗</a><p class="note">Broad exploration context, not a biological range or a prediction for this exact point. Presence, abundance and safe diving conditions vary locally and seasonally.</p>`;
  }
  function diveRegionDetails(region) {
    const mapped = DATA.sites.filter(site => MODEL.inBounds(region.bounds, site.latitude, site.longitude));
    return `<div class="region-summary"><strong>${region.areas.length}</strong><span>featured dive areas</span><strong>${mapped.length}</strong><span>mapped sites</span></div><p class="note">Choose an area to center the map and reveal its monthly conditions, marine-life guides and broader ocean context.</p><div class="section-label">Featured dive areas</div><div class="area-list">${region.areas.map((area, index) => `<button class="area-row" data-area="${index}"><span><strong>${esc(area.name)}</strong><small>${esc(area.subtitle)}</small></span>${icon('arrow')}</button>`).join('')}</div>${mapped.length ? `<div class="section-label">Mapped dive sites</div><div class="area-list">${mapped.slice(0, 14).map(site => `<button class="area-row" data-site-id="${esc(site.id)}"><span><strong>${esc(site.name)}</strong><small>${esc(site.siteType || site.region || 'Dive site')}</small></span>${icon('arrow')}</button>`).join('')}</div>${mapped.length > 14 ? `<p class="note">Showing 14 of ${mapped.length} mapped sites. Zoom into the region to explore the rest.</p>` : ''}` : '<div class="section-label">Mapped dive sites</div><p class="note">Precise site coverage is still growing here. The featured areas are regional starting points, not exact entries or moorings.</p>'}`;
  }
  function siteFacts(site, extra) {
    const facts = [];
    if (site.maxDepthMeters) {
      // A lake's deepest point is not the dive's depth; a wreck's figure is the water it lies in.
      const label = site.depthIsWholeLake ? 'Lake’s deepest point' : site.topologies?.includes('wreck') ? 'Wreck lies in' : 'Max depth';
      const source = site.depthSource ? `<a class="fact-source" href="${esc(site.depthSource.url)}">${esc(site.depthSource.name)} ↗</a>` : '<em class="fact-source">published</em>';
      facts.push(`<span><small>${label}</small><strong>${depthText(site.maxDepthMeters)}</strong>${source}</span>`);
    }
    for (const estimate of depthEstimates(site, extra).slice(0, 2)) facts.push(`<span><small>${estimate.label}</small><strong>${estimate.value}</strong>${estimate.url ? `<a class="fact-source" href="${esc(estimate.url)}">${esc(estimate.short)} ↗</a>` : `<em class="fact-source">${esc(estimate.short)}</em>`}</span>`);
    if (site.entry) facts.push(`<span><small>Entry</small><strong>${esc(site.entry)}</strong></span>`);
    if (site.environment) facts.push(`<span><small>Environment</small><strong>${esc(site.environment)}</strong></span>`);
    // How sure we are it's real and where it is: several independent sources beat one community pin.
    const confidence = site.independentSources > 1
      ? `<p class="confidence good">✓ Confirmed by ${site.independentSources} independent sources${site.aliases?.length ? ` · also listed as ${site.aliases.slice(0, 3).map(esc).join(', ')}` : ''}</p>`
      : ['global', 'osm'].includes(site.catalog) ? '<p class="confidence">One community source — confirm the exact spot locally</p>' : '';
    // Inside a marine park or reserve: name it and link it; the rules are the park's to state.
    const protectedAreas = extra?.protection?.length ? `<div class="protected">${extra.protection.map(area => `<a href="${esc(area.url)}"><small>${esc(area.kind)}</small><strong>${esc(area.name)}</strong></a>`).join('')}<p>Protected areas often have rules for divers — a park fee or dive tag, mooring-only boats, no gloves, touching or collecting. Check before you go.</p></div>` : '';
    // Shore dives: what's mapped at the water's edge.
    const SHORE = { parking: 'Parking', toilets: 'Toilets', shower: 'Showers', water: 'Drinking water', slipway: 'Slipway', pier: 'Pier / jetty', beach: 'Beach' };
    const shoreText = m => m < 20 ? 'at the site' : imperial ? `${Math.max(10, Math.round(m * 3.28084 / 10) * 10)} ft` : `${m} m`;
    // A beach alone near a reef pin says little (Cozumel's reefs are boat dives); access facilities or a shore entry do.
    const shoreAccess = extra?.shore && (site.entry === 'shore' || ['parking', 'pier', 'slipway', 'toilets', 'shower', 'water'].some(kind => kind in extra.shore));
    const shore = shoreAccess ? `<div class="chip-label">At the shore · mapped on OpenStreetMap</div><div class="chips shore-chips">${Object.entries(extra.shore).map(([kind, m]) => `<span>${SHORE[kind] || esc(kind)} · ${shoreText(m)}</span>`).join('')}</div>` : '';
    return `${confidence}${protectedAreas}${facts.length ? `<div class="site-facts">${facts.join('')}</div>` : ''}${shore}${site.topologies?.length ? `<div class="chip-label">Site features</div><div class="chips">${site.topologies.map(value => `<span>${esc(value)}</span>`).join('')}</div>` : ''}`;
  }
  // What the encyclopedias say: a short Wikipedia summary (credited and linked, CC BY-SA) and, for a
  // wreck, the ship itself from Wikidata (CC0): what it was, who built it, its size and its story.
  function encyclopedia(facts) {
    if (!facts) return '';
    const size = q => {
      if (!q || !Number.isFinite(q.amount) || !['m', 'ft'].includes(q.unit)) return null;
      const meters = q.unit === 'ft' ? q.amount / 3.28084 : q.amount;
      return imperial ? `${Math.round(meters * 3.28084).toLocaleString()} ft` : `${Math.round(meters).toLocaleString()} m`;
    };
    const ship = facts.ship;
    const rows = ship ? [
      ['Vessel', ship.type], ['Built by', ship.builder], ['Flag', ship.flag], ['Length', size(ship.length)], ['Beam', size(ship.beam)],
      ['Tonnage', ship.tonnage && Number.isFinite(ship.tonnage.amount) ? `${Math.round(ship.tonnage.amount).toLocaleString()} GT` : null],
    ].filter(([, value]) => value) : [];
    const events = ship?.events?.length ? `<p class="ship-events">${ship.events.map(([label, year]) => `<span><small>${esc(label)}</small><strong>${esc(year)}</strong></span>`).join('')}</p>` : '';
    const summary = facts.summary ? `<p class="encyclopedia">${esc(facts.summary)}</p><a class="source" href="${esc(facts.article)}">From Wikipedia · CC BY-SA 4.0 ↗</a>` : '';
    const history = rows.length || events ? `<div class="section-label">Ship history</div>${events}${rows.length ? `<div class="site-facts ship">${rows.map(([label, value]) => `<span><small>${label}</small><strong>${esc(value)}</strong></span>`).join('')}</div>` : ''}${ship.wikidata ? `<a class="source" href="${esc(ship.wikidata)}">Wikidata · CC0 ↗</a>` : ''}` : '';
    return summary || history ? `<div class="section-label">About this site</div>${summary}${history}` : '';
  }
  function siteTally(count, verified) {
    const tier = diveTier(count);
    return `<div class="site-tally t${tier}"><strong>${count}</strong><span>${count === 1 ? 'dive' : 'dives'}${verified ? ` · ${verified} verified` : ''}</span><em>${TIER_LABELS[tier - 1]}</em></div>`;
  }
  // The diver's own dives at a site (linked from the logbook), for its site page.
  const divesAtSite = site => logPins.find(pin => pin.siteId && pin.siteId === site.id) || null;
  function diveRows(dives) {
    return dives.map(dive => {
      const date = dive.startTime ? new Date(dive.startTime) : null;
      const when = date && Number.isFinite(date.getTime()) ? date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Date not recorded';
      const depth = dive.maxDepthMeters == null ? 'Depth —' : `${Math.round(DATA.depthUnit === 'ft' ? dive.maxDepthMeters * 3.28084 : dive.maxDepthMeters)} ${DATA.depthUnit}`;
      return `<button class="dive-row" data-dive="${esc(dive.id)}"><span class="number">${dive.number ? '#' + esc(dive.number) : icon('dives')}</span><span class="copy"><strong>${esc(dive.name)}${dive.verified ? ' <em class="verified-tick" title="Verified by dive computer and location">✓ Verified</em>' : ''}</strong><small>${when} · ${depth}${dive.durationSeconds == null ? '' : ' · ' + Math.round(dive.durationSeconds / 60) + ' min'}</small></span>${icon('arrow')}</button>`;
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
    $('detail-eyebrow').textContent = ({ diveRegion: 'DIVE REGION / QUICK EXPLORE', area: 'FEATURED DIVE AREA', region: 'MARINE LIFE / SEASON GUIDE', species: 'MARINE LIFE / WHERE TO SEE IT', province: 'OCEAN REGION / EXPLORATION LENS', site: 'DIVE SITE', dive: 'YOUR LOGBOOK', ocean: 'OCEAN EXPLORER', sources: 'SOURCES & COVERAGE', cluster: 'EXPLORE LOCATIONS', place: s.label })[s.kind];
    if (s.kind === 'site') $('detail-eyebrow').textContent = siteEyebrow(s, native ? siteGuides.get(guideKey(s)) : null);
    $('detail-subtitle').textContent = s.subtitle || (Number.isFinite(s.latitude) ? `${Math.abs(s.latitude).toFixed(3)}°${s.latitude < 0 ? 'S' : 'N'} · ${Math.abs(s.longitude).toFixed(3)}°${s.longitude < 0 ? 'W' : 'E'}` : 'An atlas for discovery. Always confirm local conditions.');
    // A site's place is in its eyebrow; its coordinates live under Location & sources.
    if (s.kind === 'site') $('detail-subtitle').textContent = '';
    const glance = s.kind === 'site' ? sitePeek(s, native ? siteGuides.get(guideKey(s)) : null) : native && s.kind === 'area' ? glanceLine(siteGuides.get(guideKey(s))?.ratings, s) : '';
    $('glance').innerHTML = glance; $('glance').hidden = !glance;
    $('glance').classList.toggle('peek', s.kind === 'site');
    const tabs = native && s.kind === 'site' && siteGuides.get(guideKey(s));
    $('site-tabs').hidden = !tabs;
    $('site-tabs').innerHTML = tabs ? SITE_TABS.map(([key, label]) => `<button role="tab" data-site-tab="${key}" aria-selected="${siteTab === key}">${label}</button>`).join('') : '';
    $('site-tabs').querySelectorAll('[data-site-tab]').forEach(button => button.onclick = () => {
      // A new tab starts at its top. If the tab bar is pinned it stays pinned, so the tabs don't jump under the finger.
      const pinned = Math.min($('sheet').scrollTop, headerStick());
      siteTab = button.dataset.siteTab; keepHeader = true; scrollOwner = null; renderDetails(); keepHeader = false;
      $('sheet').scrollTop = pinned;
    });
    let body = '', clusterPreview = [];
    if (s.kind === 'species') {
      const guide = speciesGuides.get(s.key);
      $('detail-subtitle').textContent = guide ? [guide.scientific, guide.placeCount ? `${guide.placeCount} areas with records` : ''].filter(Boolean).join(' · ') : 'Marine life';
      body = speciesDetails(speciesGuides.has(s.key) ? guide : undefined);
    } else if (s.kind === 'sources') {
      body = `<div class="sources"><h3>Water temperature</h3><p>NOAA ERSSTv5 monthly sea-surface climatology, 1991–2020. The original 2° grid preserves missing cells. Display colors are smoothly interpolated, with limited coastal infilling and a detailed land mask; numeric readouts and monthly profiles use the original grid. Colors fade out at close zoom. These are regional averages, not live readings or dive-depth measurements; coastal values remain approximate.</p><a class="source" href="${esc(DATA.temperature.sourceUrl)}">NOAA PSL · source dataset ↗</a><h3>Ocean regions</h3><p>${DATA.oceanRegions.length} broad exploration lenses make every ocean tap useful. They summarize habitats and representative wildlife from NOAA, UNEP and national science agencies. The closest lens is selected geographically; it is not a legal, ecological or species-range boundary and never predicts an encounter at the tapped coordinate.</p><a class="source" href="https://portal.obis.org/data/access/">IOC-UNESCO OBIS · future biodiversity expansion ↗</a><h3>Dive locations</h3><p>${DATA.sites.length} bundled locations include ${globalSource.recordCount} community-maintained OpenDiveMap records, NOAA Florida Keys mooring locations, ${DATA.curatedSiteCount} government-referenced Cozumel reef areas, Florida reef-program sites around Jupiter and Palm Beach (Palm Beach County ERM, FWC-FWRI), and the existing offline catalog. OpenDiveMap records are map-browsing data only and never automatically name a logged dive. Community coordinates and metadata can change; always confirm access, entry, depth and restrictions with a local operator. Cozumel reef-area pins and Florida reef-program positions are browsing references, not navigation coordinates. The NOAA mooring download is dated February 2014 and does not establish current buoy availability.</p><a class="source" href="${esc(globalSource.sourceUrl)}">OpenDiveMap contributors · ${esc(globalSource.license)} ↗</a><br><a class="source" href="https://floridakeys.noaa.gov/mbuoy/allmbuoys.html">NOAA Florida Keys · published locations ↗</a><br><a class="source" href="https://www.gob.mx/conanp/es/articulos/estrategia-de-conservacion-para-arrecifes-saludables-de-cozumel?idiom=es">CONANP · Cozumel reef references ↗</a>${Object.values(DATA.extraSites?.sources || {}).filter(source => source.url).map(source => `<br><a class="source" href="${esc(source.url)}">${esc(source.name)} ↗</a>`).join('')}<p>Contains GeoNames data, CC BY 4.0. Pin details retain their original attribution.</p><h3>Seasonal marine life</h3><p>${DATA.regions.length} focused guides include sourced species and encounter windows. Empty months mean seasonality is not documented. Guide areas are browsing aids, not scientific range polygons.</p><h3>Your dives</h3><p>Only saved dives with valid coordinates appear. Deleted dives and unconfirmed location suggestions are excluded. The month selector changes ocean conditions and wildlife guidance; your dive history stays visible across all dates. Dive records stay on this device; no logbook data is uploaded by the atlas. Online basemap requests reveal the area being viewed to the tile provider.</p><h3>Maps & offline use</h3><p>Natural Earth 1:10 million public-domain coastlines, Leaflet (BSD-2-Clause) and geojson-vt (ISC) are bundled. OpenStreetMap tiles need a connection and stay on the same map layer at every zoom. Coastlines are generalized, not navigation charts. Ocean averages, regional lenses, species guides and saved pins remain available offline.</p><a class="source" href="https://www.openstreetmap.org/copyright">OpenStreetMap attribution & licence ↗</a></div>`;
    } else if (s.kind === 'place') {
      body = placeDetails(s);
    } else if (s.kind === 'diveRegion') {
      body = diveRegionDetails(s) + regionExtras(s);
    } else if (s.kind === 'cluster') {
      clusterPreview = [...s.items].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 30);
      body = `<button class="cluster-zoom" id="cluster-zoom">Zoom into all ${s.items.length.toLocaleString()} locations ${icon('arrow')}</button><div class="section-label">Sites in this group</div>${clusterPreview.map((item, i) => `<button class="result" data-cluster="${i}">${icon(s.pinKind === 'dives' ? 'dives' : 'site')}<span><strong>${esc(item.name)}</strong><small>${s.pinKind === 'dives' ? item.dives.length + ' logged dives' : esc(item.siteType)}</small></span></button>`).join('')}${s.items.length > clusterPreview.length ? `<p class="note">Showing 30 of ${s.items.length.toLocaleString()} locations. Zoom into the group to reveal smaller clusters and individual pins.</p>` : ''}`;
    } else if (s.kind === 'dive') {
      const verifiedCount = s.dives.filter(dive => dive.verified).length;
      body = `${siteTally(s.dives.length, verifiedCount)}<div class="section-label">${s.dives.length} ${s.dives.length === 1 ? 'dive' : 'dives'} ${s.siteId ? 'at this site' : 'at this location'}</div>${diveRows(s.dives)}`;
    } else if (native && s.kind === 'site') {
      body = sitePage(s, siteGuides.get(guideKey(s)));
    } else {
      const inlandGuide = native && ['site', 'area'].includes(s.kind) ? siteGuides.get(guideKey(s))?.guide?.inland : null;
      body = inlandGuide ? inlandConditions(inlandGuide) : temperatureCard(s, native && ['site', 'area'].includes(s.kind) ? siteGuides.get(guideKey(s))?.guide?.temps : null);
      if (s.kind === 'site') body += `<div class="section-label">${[s.siteType || 'Dive location', s.region || s.country].filter(Boolean).map(esc).join(' · ')}</div>${siteFacts(s, native ? siteGuides.get(guideKey(s)) : null)}${native ? encyclopedia(siteGuides.get(guideKey(s))?.facts) : ''}<p class="note">${esc(s.note || (['global', 'osm'].includes(s.catalog) ? 'Community-maintained map record. Confirm the exact entry, access, depth, hazards and current conditions with a local operator.' : 'Catalog location. Confirm entry, access and current conditions with a local operator.'))}</p>${(s.sources || []).map(source => `<a class="source" href="${esc(source.sourceUrl)}">${esc(source.sourceName)} · ${esc(source.dataLicense || '')} ↗</a>`).join('<br>')}`;
      if (s.kind === 'area') body += `<div class="section-label">Regional starting point · ${esc(s.region)}</div><p class="note">${esc(s.subtitle)}. This pin centers a broad dive area, not a precise entry, mooring or operator location.</p>`;
      const nativeGuide = native && ['site', 'area'].includes(s.kind) ? siteGuides.get(guideKey(s)) : undefined;
      // Photo of the site itself (openly licensed), when one exists.
      const photo = nativeGuide?.photo;
      const hero = photo ? `<figure class="site-photo"><img src="${esc(photo.url)}" alt="${esc(s.name)}" loading="lazy"><a href="${esc(photo.page)}">📷 ${esc(photo.attribution)} ↗</a></figure>` : '';
      if (native && ['site', 'area'].includes(s.kind)) body = hero + crumbs(nativeGuide?.places || []) + glanceTiles(nativeGuide?.ratings, nativeGuide?.guide?.temps, nativeGuide?.guide?.inland, s, nativeGuide) + (nativeGuide ? wearCard(nativeGuide.wear) : '') + body + guideSection(nativeGuide?.guide);
      const mine = s.kind === 'site' ? divesAtSite(s) : null;
      if (mine) body = `<div class="section-label">Your dives here</div>${siteTally(mine.dives.length, mine.verified || 0)}${diveRows(mine.dives.slice(0, 5))}${mine.dives.length > 5 ? `<p class="note">And ${mine.dives.length - 5} more in your logbook.</p>` : ''}` + body;
      const focusedRegion = state.layers.wildlife && !(native && ['site', 'area'].includes(s.kind)) ? (s.kind === 'region' ? s : MODEL.regionAt(DATA.regions, s.latitude, s.longitude)) : null;
      if (focusedRegion) body += wildlifeDetails(focusedRegion);
      if (s.kind === 'region') body += regionDiving(s);
      else if (state.layers.wildlife && !state.layers.regions) body += wildlifeDetails(null);
      // The broad ocean lens is for ocean taps and region cards only: on a site it can name a far-away
      // region (an Ohio quarry is "nearest" the Caribbean anchor) with habitats that don't apply.
      if (!focusedRegion && !['site', 'area'].includes(s.kind)) body += provinceDetails(s.kind === 'province' ? s : MODEL.oceanRegionAt(DATA.oceanRegions, s.latitude, s.longitude));
      if (s.kind === 'province') body += regionExtras(s);
      if (!state.layers.regions && !state.layers.wildlife && !state.layers.temperature && s.kind === 'ocean') body = '<p class="note">Switch on Ocean regions, Water temperature or Seasonal wildlife to explore this location.</p>';
    }
    // Keep the scroll position only while re-rendering the same item (e.g. when its guide data arrives);
    // a different site or guide always starts at the top.
    const scroll = scrollOwner === selected ? $('sheet').scrollTop : 0;
    scrollOwner = selected;
    // Destination guides have no single site's water: the same card, without a starting point.
    if (native && s.kind === 'place' && Number.isFinite(s.latitude) && Number.isFinite(s.longitude)) body = wearCard(null) + body;
    if (s.kind === 'site' && s.custom) body += `<p class="note">Conditions and marine life here come from the waters around this pin. Confirm access, entry and hazards locally.</p><button class="cluster-zoom" id="remove-my-site">Remove from My sites</button>`;
    $('detail-body').innerHTML = body;
    if ($('remove-my-site')) $('remove-my-site').onclick = () => post('deleteMySite', { id: s.id, name: s.name });
    if ($('gear-for-dive')) $('gear-for-dive').onclick = () => post('gearAdvice', { key: guideKey(s), id: s.kind === 'site' ? s.id : null, name: s.name, latitude: s.latitude, longitude: s.longitude, month: state.month, mode: gearMode });
    $('detail-body').querySelectorAll('[data-gear-mode]').forEach(button => button.onclick = () => {
      const value = button.dataset.gearMode;
      if (!['recreational', 'technical', 'freedive'].includes(value) || value === gearMode) return;
      gearMode = value; requestSelectedGear(); renderDetails();
    });
    pinHeader();
    $('sheet').scrollTop = scroll;
    $('detail-body').querySelectorAll('[data-dive]').forEach(button => button.onclick = () => post('openDive', { id: button.dataset.dive }));
    $('detail-body').querySelectorAll('[data-place-kind]').forEach(button => button.onclick = () => post('openPlace', { kind: button.dataset.placeKind, id: button.dataset.placeId }));
    $('detail-body').querySelectorAll('[data-region-area]').forEach(button => button.onclick = () => choose({ ...regionGuides.get(regionKey(s)).areas[Number(button.dataset.regionArea)], kind: 'area' }, true));
    $('detail-body').querySelectorAll('[data-season-month]').forEach(button => button.onclick = () => { state.month = Number(button.dataset.seasonMonth); requestSelectedGear(); render(); });
    if ($('all-sites')) $('all-sites').onclick = () => { showAllSites = true; renderDetails(); };
    $('detail-body').querySelectorAll('[data-cluster]').forEach(button => button.onclick = () => choose({ ...clusterPreview[Number(button.dataset.cluster)], kind: s.pinKind === 'dives' ? 'dive' : 'site' }));
    if ($('cluster-zoom')) $('cluster-zoom').onclick = () => { closeDetails(); fitTo(s.items.map(item => [item.latitude, item.longitude]), { padding: [60, 100], maxZoom: Math.min(map.getZoom() + 3, 15) }, .7); };
    $('detail-body').querySelectorAll('[data-region-dive-area]').forEach(button => button.onclick = () => choose({ ...regionPlaces.areas[Number(button.dataset.regionDiveArea)], kind: 'area' }, true));
    $('detail-body').querySelectorAll('[data-region-dive-site]').forEach(button => button.onclick = () => choose({ ...regionPlaces.sites[Number(button.dataset.regionDiveSite)], kind: 'site' }, true));
    $('detail-body').querySelectorAll('[data-area]').forEach(button => button.onclick = () => choose({ ...s.areas[Number(button.dataset.area)], kind: 'area' }, true));
    if (s.kind === 'species' && speciesGuides.get(s.key)) {
      const guide = speciesGuides.get(s.key);
      $('detail-body').querySelectorAll('[data-species-place]').forEach(button => button.onclick = () => {
        const place = guide.places[Number(button.dataset.speciesPlace)];
        state.layers.sites = true; render();
        expandDetails(false);
        const sheetHeight = $('sheet').hidden ? 0 : $('sheet').getBoundingClientRect().height;
        fitTo(L.latLng(place.latitude, place.longitude).toBounds(place.radiusKm * 2000), { paddingTopLeft: [30, 110], paddingBottomRight: [30, Math.max(150, sheetHeight + 40)], maxZoom: 11 }, .9);
      });
      $('detail-body').querySelectorAll('[data-species-region]').forEach(button => button.onclick = () => {
        const entry = guide.curated[Number(button.dataset.speciesRegion)], region = DATA.regions.find(r => r.id === entry.regionId);
        if (!region) return;
        spotlight = entry.speciesId; render();
        choose({ ...region, kind: 'region' }, true);
      });
    }
    $('detail-body').querySelectorAll('[data-site-id]').forEach(button => button.onclick = () => {
      const site = DATA.sites.find(item => item.id === button.dataset.siteId);
      if (site) choose({ ...site, kind: 'site' }, true);
    });
  }
  const monthSpan = list => {
    if (!list?.length) return '';
    if (list.length === 12) return 'year-round';
    const set = new Set(list), start = list.find(m => !set.has((m + 11) % 12)) ?? list[0];
    const runs = [];
    for (let k = 0, m = start; k < 12; k++, m = (m + 1) % 12) {
      if (set.has(m) && !set.has((m + 11) % 12)) runs.push([m, m]); else if (set.has(m)) runs[runs.length - 1][1] = m;
    }
    return runs.map(([a, b]) => a === b ? months[a] : `${months[a]}–${months[b]}`).join(', ');
  };
  function requestSpeciesList() {
    if (!native || speciesList || speciesListRequested) return;
    speciesListRequested = true; post('speciesIndex');
  }
  function speciesMatches(query) {
    if (!speciesList) return [];
    const forms = [...new Set([query, query.replace(/e?s$/, '')])].filter(Boolean);
    const score = row => {
      const common = row[1].toLowerCase(), scientific = row[2].toLowerCase(), words = common.split(/[\s-]+/);
      return Math.max(...forms.map(q => common === q || scientific === q ? 4 : common.startsWith(q) || words.some(w => w.startsWith(q)) ? 3 : scientific.startsWith(q) ? 2 : common.includes(q) || scientific.includes(q) ? 1 : 0));
    };
    return speciesList.map(row => [score(row), row]).filter(([value]) => value).sort((a, b) => b[0] - a[0] || b[1][5] - a[1][5]).slice(0, 6).map(([, row]) => row);
  }
  // Follow an animal: its guide opens and its sighting areas stay outlined on the map until cleared.
  function openSpecies(key, name) {
    if (!native || !key) return;
    const changed = following?.key !== key;
    following = { key, name: name || following?.name || 'Marine life' };
    if (changed) { speciesFit = key; if (speciesLayer) { map.removeLayer(speciesLayer); speciesLayer = null; } }
    panel = null; state.layers.wildlife = true;
    render();
    choose({ kind: 'species', key, name: following.name, noFocus: true });
    if (speciesGuides.has(key)) drawSpecies(speciesGuides.get(key)); else post('speciesGuide', { key });
  }
  function drawSpecies(guide) {
    if (!guide || guide.key !== following?.key) return;
    if (!speciesLayer) {
      speciesLayer = L.layerGroup(guide.places.map(place => L.circle([place.latitude, place.longitude], { pane: 'vectors', interactive: false,
        radius: place.radiusKm * 1000, color: '#97e8cc', weight: 1.2, opacity: .8, fillColor: '#97e8cc', fillOpacity: place.survey ? .05 : .14, dashArray: place.survey ? '3 5' : null }))).addTo(map);
    }
    if (speciesFit !== guide.key) return;
    speciesFit = null;
    const top = guide.places.slice(0, 8);
    if (!top.length) return;
    const sheetHeight = $('sheet').hidden ? 0 : Math.min($('sheet').getBoundingClientRect().height, map.getSize().y * .45);
    fitTo(top.map(place => [place.latitude, place.longitude]), { paddingTopLeft: [40, 110], paddingBottomRight: [40, Math.max(150, sheetHeight + 60)], maxZoom: 7 }, .9);
  }
  function speciesDetails(guide) {
    if (guide === undefined) return '<p class="note">Finding where divers see it…</p>';
    if (!guide) return '<p class="note">This guide isn’t available right now. Try again in a moment.</p>';
    const numeric = /^\d+$/.test(guide.key);
    const photo = guide.photo ? `<figure class="site-photo"><img src="${esc(guide.photo.url)}" alt="${esc(guide.common)}" loading="lazy">${numeric ? `<a href="https://www.inaturalist.org/taxa/${esc(guide.key)}">📷 ${esc(guide.photo.attribution || 'iNaturalist')} ↗</a>` : ''}</figure>` : '';
    const calendar = guide.months ? `<div class="section-label">When divers see it · by month</div><div class="calendar" aria-label="Sightings by month">${months.map((m, i) => `<span class="${guide.months[i] >= .66 ? 'active ' : guide.months[i] >= .33 ? 'soft ' : ''}${state.month === i ? 'current' : ''}">${m[0]}</span>`).join('')}</div><p class="note">Relative share of ${guide.sightings.toLocaleString()} iNaturalist sightings by month, across the areas below.</p>` : '';
    const curated = guide.curated.length ? `<div class="section-label">Documented seasons</div><div class="area-list">${guide.curated.map((c, i) => `<button class="area-row" data-species-region="${i}"><span><strong>${esc(c.region)}</strong><small>${esc(c.season)}</small></span>${icon('arrow')}</button>`).join('')}</div>` : '';
    const places = guide.places.length ? `<div class="section-label">Where divers see it · ${guide.placeCount} ${guide.placeCount === 1 ? 'area' : 'areas'}</div>${guide.places.map((place, i) => `<div class="species-place"><button class="area-row" data-species-place="${i}"><span><strong>${esc(place.name)}</strong><small>${place.survey ? 'Recorded in scientific surveys · no season data' : `${place.records.toLocaleString()} sightings${place.peakMonths.length ? ` · peak ${monthSpan(place.peakMonths)}` : ''}`}</small></span>${icon('arrow')}</button>${place.sites.length ? `<div class="species-sites">${place.sites.map(site => `<button data-site-id="${esc(site.id)}">${esc(site.name)}</button>`).join('')}${place.siteCount > place.sites.length ? `<button data-species-place="${i}">+${place.siteCount - place.sites.length} more</button>` : ''}</div>` : '<p class="note species-none">No dive sites mapped in this area yet.</p>'}</div>`).join('')}${guide.placeCount > guide.places.length ? `<p class="note">Showing the ${guide.places.length} areas with the most records.</p>` : ''}` : '';
    const empty = !places && !curated ? '<p class="note">No sightings near dive sites are recorded for this animal yet.</p>' : '';
    return `${photo}${calendar}${curated}${places}${empty}<p class="note">Sightings are citizen-science and survey records within each outlined area — a guide to where divers look, not a promise of an encounter. Confirm with a local operator.</p>${guide.sources.map(source => `<a class="source" href="${esc(source.url)}">${esc(source.name)} ↗</a>`).join('<br>')}`;
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
    const picks = native ? discoverPicks.get(state.month) : null;
    if (native && !discoverPicks.has(state.month) && panel === 'browse') { discoverPicks.set(state.month, undefined); post('discover', { month: state.month }); }
    const chip = pick => `<button class="destination species-chip" data-discover-species="${esc(pick.key)}" data-name="${esc(pick.name)}">${esc(pick.name)}<small>${esc(pick.place || `${pick.places} areas`)}</small></button>`;
    const wildlife = picks && (picks.inSeason.length || picks.iconic.length) ? `${picks.inSeason.length ? `<div class="section-label">In season · ${months[state.month]}</div><div class="destinations">${picks.inSeason.map(chip).join('')}</div>` : ''}${picks.iconic.length ? `<div class="section-label">Bucket-list encounters</div><div class="destinations">${picks.iconic.slice(0, 6).map(chip).join('')}</div>` : ''}`
      : `<div class="section-label">Seasonal wildlife spotlights</div><div class="destinations compact">${candidates.slice(0, 4).map(r => `<button class="destination" data-region="${r.id}">${esc(r.name)}</button>`).join('')}</div>`;
    const remoteStart = state.month % DATA.remoteAreas.length;
    const remote = Array.from({ length: 4 }, (_, index) => DATA.remoteAreas[(remoteStart + index) % DATA.remoteAreas.length]);
    $('overview').innerHTML = `<div class="panel-heading"><div class="eyebrow">${state.layers.dives ? 'YOUR DIVES, ON THE MAP' : 'THE WORLD BELOW THE SURFACE'}</div><button id="close-browse" class="panel-close" aria-label="Close discover">×</button></div><h2>${headline}</h2><p>${copy}</p>${state.layers.dives ? `<div class="destinations"><button class="destination" id="see-dives">${logStatus === 'error' ? 'Retry' : logPins.length ? 'Show my dives' : 'Open logbook'}</button></div>${wildlife}` : `${wildlife}<div class="section-label">Popular dive regions</div><div class="destinations">${DATA.diveRegions.map(r => `<button class="destination" data-dive-region="${r.id}">${esc(r.name)}</button>`).join('')}</div><div class="section-label">Remote & standalone</div><div class="destinations compact">${remote.map(area => `<button class="destination" data-remote="${area.id}">${esc(area.name)}</button>`).join('')}</div>`}<div class="summary-line"><span class="dot"></span>${status}</div>`;
    $('close-browse').onclick = () => openPanel('browse');
    $('overview').querySelectorAll('[data-discover-species]').forEach(button => button.onclick = () => openSpecies(button.dataset.discoverSpecies, button.dataset.name));
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
    $('species-bar').hidden = !native || !state.layers.wildlife;
    $('species-follow').textContent = following ? following.name : 'Any animal · search whale shark, manta…';
    $('species-follow').classList.toggle('active', Boolean(following));
    $('species-clear').hidden = !following;
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
      ...mySites.map(site => ({ ...asMySite(site), region: 'My site', searchText: `${site.name} my site` })),
    ].filter(item => (!DATA.locationPicker || item.kind === 'site') && (item.searchText.toLowerCase().includes(query) || (DATA.locationPicker && item.searchText.toLowerCase().replace(/[^a-z0-9]/g, '').includes(query.replace(/[^a-z0-9]/g, '') || query)))).slice(0, 18);
    const species = DATA.locationPicker ? [] : speciesMatches(query);
    if (native && !speciesList) requestSpeciesList();
    $('results').innerHTML = (species.length ? `<div class="results-label">Marine life</div>${species.map((row, i) => `<button class="result" data-species-result="${i}">${icon('wildlife')}<span><strong>${esc(row[1])}</strong><small>${esc(row[2])}${row[4] ? ` · seen in ${row[4]} ${row[4] === 1 ? 'area' : 'areas'}` : ' · regional season guide'}</small></span></button>`).join('')}${matches.length ? '<div class="results-label">Places & sites</div>' : ''}` : '') + (matches.length ? matches.map((item, i) => `<button class="result" data-result="${i}">${icon(item.kind === 'region' ? 'wildlife' : item.kind === 'province' || item.kind === 'diveRegion' || item.kind === 'area' ? 'globe' : item.kind === 'dive' ? 'dives' : 'site')}<span><strong>${esc(item.name)}</strong><small>${esc(item.kind === 'diveRegion' ? item.subtitle : item.kind === 'area' ? `${item.region} · ${item.subtitle}` : item.kind === 'region' || item.kind === 'province' ? item.subtitle : item.kind === 'dive' ? 'Your logbook' : item.region || 'Dive site')}</small></span></button>`).join('') : species.length ? '' : '<div class="empty">No matches in the current atlas. Try Caribbean, Philippines, kelp, manta, Hawaiʻi, or a saved dive site.</div>');
    $('results').hidden = false;
    $('results').querySelectorAll('[data-species-result]').forEach(button => button.onclick = () => {
      const row = species[Number(button.dataset.speciesResult)];
      $('search').value = ''; $('search').blur(); search();
      openSpecies(row[0], row[1]);
    });
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
  if (DATA.locationPicker) {
    ['season-toggle', 'browse-toggle', 'species-bar', 'info', 'credits'].forEach(id => { if ($(id)) $(id).style.display = 'none'; });
    state.layers.temperature = false; state.layers.wildlife = false; state.layers.regions = false;
  }
  $('close').onclick = closeDetails;
  function expandDetails(expanded) {
    document.body.classList.toggle('detail-expanded', expanded);
    // The collapsed card doesn't scroll: start at the top, and again for a new item once expanded.
    if (!expanded || expandedOwner !== selected) { $('sheet').scrollTop = 0; requestAnimationFrame(() => { $('sheet').scrollTop = 0; }); }
    pinHeader();
    if (expanded) expandedOwner = selected;
    $('expand').setAttribute('aria-expanded', String(expanded));
    $('expand').setAttribute('aria-label', expanded ? 'Collapse details' : 'Expand details');
    $('expand').textContent = expanded ? 'Collapse ↓' : 'View guide ↑';
  }
  $('expand').onclick = () => expandDetails(!document.body.classList.contains('detail-expanded'));
  // Reading the guide: the whole card scrolls as one page and the header scrolls away under the finger, until
  // only the site tabs remain, pinned to the top (CSS position: sticky with a negative top). Nothing changes size
  // while scrolling, so there is nothing to jump. The pin offset is measured whenever the card is drawn.
  function headerStick() {
    const head = document.querySelector('.sheet-head'), tabs = $('site-tabs');
    return Math.max(0, tabs.hidden ? head.offsetHeight : tabs.offsetTop - 8);
  }
  function pinHeader() {
    document.querySelector('.sheet-head').style.top = document.body.classList.contains('detail-expanded') ? `-${headerStick()}px` : '';
  }
  window.addEventListener('resize', pinHeader);
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
  $('species-follow').onclick = () => { if (following) openSpecies(following.key, following.name); else { openPanel('search'); requestSpeciesList(); } };
  $('species-clear').onclick = () => {
    following = null; speciesFit = null;
    if (speciesLayer) { map.removeLayer(speciesLayer); speciesLayer = null; }
    if (selected?.kind === 'species') closeDetails();
    render();
  };
  document.querySelectorAll('[data-layer]').forEach(button => button.onclick = () => {
    const layer = button.dataset.layer; state.layers[layer] = !state.layers[layer];
    if ((layer === 'regions' && ['province', 'diveRegion', 'area'].includes(selected?.kind)) || (layer === 'wildlife' && selected?.kind === 'region') || (layer === 'sites' && selected?.kind === 'site') || (layer === 'dives' && selected?.kind === 'dive')) closeDetails();
    render();
  });
  document.querySelectorAll('[data-month]').forEach(button => button.onclick = () => { state.month = Number(button.dataset.month); requestSelectedGear(); render(); });
  $('current-month').onclick = () => { state.month = new Date().getMonth(); requestSelectedGear(); render(); };
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
    if (message.type === 'dataStatus') {
      $('data-status').textContent = String(message.text || '').slice(0, 100);
    } else if (DATA.locationPicker && message.type === 'pickerMode') {
      pickerMode = message.mode === 'pin' ? 'pin' : 'site';
      if (pickerMarker) { map.removeLayer(pickerMarker); pickerMarker = null; }
      closeDetails();
    } else if (DATA.locationPicker && message.type === 'pickerFocus') {
      if (Number.isFinite(message.latitude) && Number.isFinite(message.longitude)) flyTo([message.latitude, message.longitude], 12);
    } else if (message.type === 'logs') {
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
        state.species = 'all';
        Object.keys(state.layers).forEach(key => { if (typeof saved.layers?.[key] === 'boolean') state.layers[key] = saved.layers[key]; });
        const view = saved.view;
        if (Number.isFinite(view?.latitude) && Math.abs(view.latitude) <= 90 && Number.isFinite(view.longitude) && Math.abs(view.longitude) <= 180 && Number.isFinite(view.zoom)) {
          map.setView([view.latitude, view.longitude], Math.max(2, Math.min(19, view.zoom)), { animate: false });
        }
      }
      readyForPersistence = true; render();
    } else if (message.type === 'location') {
      flyTo([message.latitude, message.longitude], 9, 1);
      if (window.atlasLocationMarker) map.removeLayer(window.atlasLocationMarker);
      window.atlasLocationMarker = L.circleMarker([message.latitude, message.longitude], { pane: 'vectors', interactive: false, radius: 7, color: '#fff', weight: 2, fillColor: '#5797ff', fillOpacity: 1 }).addTo(map);
    } else if (message.type === 'gearMode') {
      gearMode = ['recreational', 'technical', 'freedive'].includes(message.value) ? message.value : 'recreational';
      if (selected && ['site', 'area'].includes(selected.kind)) renderDetails();
    } else if (message.type === 'siteGuide') {
      if (message.key) {
        const previous = siteGuides.get(message.key);
        siteGuides.set(message.key, { guide: message.guide, places: message.places || [], ratings: message.ratings || null, photo: message.photo || null, facts: message.facts || null, protection: message.protection || [], seafloor: message.seafloor || null, shore: message.shore || null, bathymetry: message.bathymetry || null, lakeDepth: message.lakeDepth || null, nearbyDepths: message.nearbyDepths || null, wear: message.wear || null, comfort: message.comfort || null, diver: message.diver || null, profile: message.profile || null, community: message.community || null, structured: message.structured || null, gear: message.gear || previous?.gear || { mode: gearMode, status: 'loading' }, weather: previous?.weather || { status: 'loading' } });
      }
      if (selected && ['site', 'area'].includes(selected.kind) && guideKey(selected) === message.key) renderDetails();
    } else if (message.type === 'siteGear') {
      if (message.key) {
        const previous = siteGuides.get(message.key) || {};
        siteGuides.set(message.key, { ...previous, gear: message.gear || { mode: gearMode, setup: null } });
      }
      if (selected && ['site', 'area'].includes(selected.kind) && guideKey(selected) === message.key) renderDetails();
    } else if (message.type === 'siteWeather') {
      if (message.key) {
        const previous = siteGuides.get(message.key) || {};
        siteGuides.set(message.key, { ...previous, weather: message.status === 'ready' && message.weather ? { status: 'ready', data: message.weather } : { status: message.status === 'error' ? 'error' : 'loading' } });
      }
      if (selected && ['site', 'area'].includes(selected.kind) && guideKey(selected) === message.key) renderDetails();
    } else if (message.type === 'quickLook') {
      if (quickTap?.requestId === message.requestId && message.look) showQuickLook(quickTap.latlng, message.look);
    } else if (message.type === 'originChanged' || message.type === 'adviceChanged') {
      // Travel ratings are personal: refresh them for the new starting point.
      siteGuides.clear();
      if (selected && ['site', 'area'].includes(selected.kind)) post('siteGuide', { requestId: ++guideRequest, key: guideKey(selected), latitude: selected.latitude, longitude: selected.longitude, id: selected.kind === 'site' ? selected.id : undefined, month: state.month });
    } else if (message.type === 'regionGuide') {
      if (message.key && message.guide) regionGuides.set(message.key, message.guide);
      if (selected && ['province', 'diveRegion'].includes(selected.kind) && regionKey(selected) === message.key) renderDetails();
    } else if (message.type === 'place') {
      const tap = pendingTap;
      if (message.requestId != null && tap?.requestId !== message.requestId) return;
      if (message.place) choose({ ...message.place, kind: 'place', latitude: message.place.journey?.latitude, longitude: message.place.journey?.longitude, fromTap: Boolean(tap) }, message.fly || !tap);
      else if (tap) choose(tap.fallback);
    } else if (message.type === 'mySites') {
      mySites = (Array.isArray(message.sites) ? message.sites : []).filter(site => Number.isFinite(site.latitude) && Number.isFinite(site.longitude));
      if (selected?.custom && !mySites.some(site => site.id === selected.id)) closeDetails();
      drawMySites();
    } else if (message.type === 'speciesIndex') {
      speciesList = Array.isArray(message.species) ? message.species : [];
      if ($('search').value.trim()) search();
    } else if (message.type === 'speciesGuide') {
      speciesGuides.set(message.key, message.guide || null);
      if (message.guide) drawSpecies(message.guide);
      if (selected?.kind === 'species' && selected.key === message.key) renderDetails();
    } else if (message.type === 'discover') {
      discoverPicks.set(message.month, message.discover || { inSeason: [], iconic: [] });
      if (panel === 'browse' && message.month === state.month) renderOverview();
    } else if (message.type === 'focus' && !message.regionId && Number.isFinite(message.latitude) && Number.isFinite(message.longitude)) {
      // Opened from a plan: its linked atlas site or pinned site, else the point it names.
      const mine = mySites.find(site => site.id === message.siteId);
      const listed = !mine && message.siteId ? DATA.sites.find(site => site.id === message.siteId) : null;
      const site = mine ? asMySite(mine) : listed ? { ...listed, kind: 'site' } : { kind: 'site', id: `plan-${message.latitude.toFixed(4)},${message.longitude.toFixed(4)}`, name: String(message.name || 'Planned dive').slice(0, 120), latitude: message.latitude, longitude: message.longitude, topologies: [] };
      state.layers[mine ? 'mysites' : 'sites'] = true; panel = null;
      render();
      choose(site, true);
    } else if (message.type === 'focus') {
      // Opened from a Home in-season card: fly to the region with its guide open and that animal first.
      const region = DATA.regions.find(r => r.id === message.regionId);
      if (!region) return;
      spotlight = region.species.some(s => s.id === message.speciesId) ? message.speciesId : null;
      if (state.species !== 'all' && !region.species.some(s => s.id === state.species)) state.species = 'all';
      state.layers.wildlife = true; state.layers.sites = true; panel = null;
      render();
      choose({ ...region, kind: 'region' }, true);
    } else if (message.type === 'notice') toast(message.text);
  };
  render();
  post('ready');
}
