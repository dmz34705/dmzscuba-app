import { OFFLINE_DIVE_SITES } from '../../lib/diveSites/offlineCatalog';
import { temperature, land, sites, curatedSites, globalSites, osmSites, extraSites, publishedDepths, siteMerges, siteProfiles } from './datasets';
import { siteCorrections } from './siteProfiles';
import { CLOSED_WRECKS } from './catalog';
import { leafletCss, leafletJs } from './data/leaflet';
import { atlasStyles } from './atlasStyles';
import { runtimeSource } from './data/runtimeSource';
import { vectorTilerJs } from './data/vectorTiler';
import { MONTHS, safeJson } from './model';
import { MARINE_REGIONS } from './regions';
import { OCEAN_REGIONS } from './oceanRegions';
import { DIVE_REGIONS, REMOTE_DIVE_AREAS } from './diveRegions';
import { utf8Bytes } from './updateContract';

// The page's copy of the supplementary sites: only what atlasRuntime reads (no build stats or kind hints), with
// the shared Wikipedia link prefix shortened to "~" (atlasRuntime expands it).
const WIKIPEDIA = 'https://en.wikipedia.org/wiki/';
export function buildAtlasData({ temperatureUnit = 'F', depthUnit = 'ft', locationPicker = false } = {}) {
  const embeddedExtraSites = { topologyCodes: extraSites.topologyCodes, sources: extraSites.sources,
    sites: extraSites.sites.map(row => (typeof row[9] === 'string' && row[9].startsWith(WIKIPEDIA) ? [...row.slice(0, 9), `~${row[9].slice(WIKIPEDIA.length)}`, ...row.slice(10)] : row)) };
  return { locationPicker, months: MONTHS, regions: MARINE_REGIONS, oceanRegions: OCEAN_REGIONS, diveRegions: DIVE_REGIONS, remoteAreas: REMOTE_DIVE_AREAS, temperature, land,
    sites: [...OFFLINE_DIVE_SITES, ...sites, ...curatedSites], globalSites, osmSites, extraSites: embeddedExtraSites, publishedDepths, siteMerges, siteCorrections: siteCorrections(siteProfiles), closedWrecks: CLOSED_WRECKS.source, curatedSiteCount: curatedSites.length,
    unit: temperatureUnit === 'C' ? 'C' : 'F', depthUnit: depthUnit === 'm' ? 'm' : 'ft' };
}

const startAtlas = 'atlasRuntime(data, {temperatureAt,regionAt,inBounds,oceanRegionAt,seasonStatus,expandTemperature});';
// Native maps start with a small executable shell. They request one data chunk at
// a time, acknowledging it before the native side injects the next. Preview HTML
// remains self-contained and uses the same data builder and browser runtime.
export const atlasBootstrapSource = `(() => {
  let chunks = [], expected = 0, started = false;
  const post = message => window.ReactNativeWebView.postMessage(JSON.stringify(message));
  window.atlasBootstrapChunk = (index, chunk, last) => {
    if (started || index !== expected || typeof chunk !== 'string') return;
    chunks.push(chunk); expected++;
    if (!last) { post({ type: 'bootstrap', index: expected }); return; }
    started = true;
    try { const data = JSON.parse(chunks.join('')); chunks = []; ${startAtlas} }
    catch (error) { chunks = []; post({ type: 'bootstrapError' }); }
  };
  post({ type: 'bootstrap', index: 0 });
})();`;

export function atlasBootstrapScripts(options = {}) {
  const text = JSON.stringify(buildAtlasData(options)), chunks = [];
  for (let offset = 0; offset < text.length;) {
    let length = Math.min(24000, text.length - offset);
    // Escaping and UTF-8 may grow a chunk. Bound the actual bridge script bytes.
    while (utf8Bytes(safeJson(text.slice(offset, offset + length))) > 60 * 1024) length = Math.floor(length / 2);
    chunks.push(text.slice(offset, offset + length)); offset += length;
  }
  return chunks.map((chunk, i) => `window.atlasBootstrapChunk && window.atlasBootstrapChunk(${i},${safeJson(chunk)},${i === chunks.length - 1}); true;`);
}

export function buildAtlasDocument({ deferredData = false, ...options } = {}) {
  const launch = deferredData ? atlasBootstrapSource : `const data = ${safeJson(buildAtlasData(options))}; ${startAtlas}`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=3"><meta name="color-scheme" content="dark"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: https://tile.openstreetmap.org https://inaturalist-open-data.s3.amazonaws.com https://static.inaturalist.org https://upload.wikimedia.org https://thumb.wikimedia.org; connect-src 'none'; font-src 'none'; base-uri 'none'; form-action 'none'"><style>${leafletCss}\n${atlasStyles}</style></head><body><main id="app"></main><script>${(leafletJs + '\n' + vectorTilerJs).replace(/<\/script/gi, '<\\/script')}</script><script>${runtimeSource.replace(/<\/script/gi, '<\\/script')}\n${launch}</script></body></html>`;
}
