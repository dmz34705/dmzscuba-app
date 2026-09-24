// Native-side view of the atlas site catalog. Decoding mirrors atlasRuntime.js
// so ids match the pins the WebView shows (e.g. `odm-<recordId>`).
import { OFFLINE_DIVE_SITES } from '../../lib/diveSites/offlineCatalog';
import globalSource from './data/globalSites.json';
import sites from './data/sites.json';
import curatedSites from './data/curatedSites.json';
import osmSource from './data/osmSites.json';
import extraSource from './data/extraSites.json';
import publishedDepths from './data/publishedDepths.json';

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function bytesOf(value) {
  const clean = value.replace(/=+$/, '');
  const bytes = new Uint8Array(Math.floor(clean.length * 3 / 4));
  let buffer = 0, bits = 0, index = 0;
  for (const char of clean) {
    buffer = (buffer << 6) | BASE64.indexOf(char); bits += 6;
    if (bits >= 8) { bits -= 8; bytes[index++] = (buffer >> bits) & 0xff; }
  }
  return bytes;
}
function numbers(value, size, reader) {
  const bytes = bytesOf(value);
  const view = new DataView(bytes.buffer);
  return Array.from({ length: bytes.length / size }, (_, index) => view[reader](index * size, true));
}

// Curated labels such as "reef and wall area" → ['reef', 'wall'], matching the global catalog's topology codes.
const FEATURES = ['reef', 'wall', 'wreck', 'pinnacle', 'cave', 'cavern', 'muck', 'drift', 'quarry'];
const featuresOf = label => FEATURES.filter(feature => new RegExp(`\\b${feature}\\b`, 'i').test(label || ''));

let cache = null;
export function catalogSites() {
  if (cache) return cache;
  const g = globalSource;
  const ids = g.packedIds.match(/.{6}/g) || [];
  const coordinates = numbers(g.coordinatesBase64, 4, 'getInt32');
  const countries = numbers(g.countryIndexesBase64, 1, 'getUint8').map(value => value - 1);
  const depths = numbers(g.maxDepthsBase64, 2, 'getUint16');
  const column = entries => new Map(entries || []);
  const environments = column(g.environmentsByIndex), masks = column(g.topologyMasksByIndex), entries = column(g.entriesByIndex);
  const global = ids.map((recordId, index) => {
    const mask = masks.get(index) ?? g.defaults.topologyMask;
    return { id: `odm-${recordId}`, name: g.names[index], latitude: coordinates[index * 2] / 1e5, longitude: coordinates[index * 2 + 1] / 1e5,
      country: g.countries[countries[index]] || '', environment: environments.get(index) ?? g.defaults.environment,
      topologies: g.topologyCodes.filter((_, code) => mask & (1 << code)), entry: entries.get(index) ?? g.defaults.entry, maxDepthMeters: depths[index] || null };
  });
  const listed = [...OFFLINE_DIVE_SITES, ...sites, ...curatedSites].map(site => ({ id: site.id, name: site.name, latitude: site.latitude, longitude: site.longitude,
    country: site.country || '', region: site.region || '', environment: site.environment || '', topologies: site.topologies || featuresOf(site.siteType),
    entry: site.entry || '', maxDepthMeters: site.maxDepthMeters || null }));
  const osm = osmSource.sites.map(([osmId, name, latitude, longitude, depth, entryCode, mask, fresh, difficulty]) => ({ id: `osm-${osmId}`, name, latitude, longitude,
    country: '', region: '', environment: fresh ? 'fresh' : '', topologies: osmSource.topologyCodes.filter((_, code) => mask & (1 << code)),
    entry: ['', 'boat', 'shore'][entryCode], maxDepthMeters: depth || null, difficulty: difficulty || '' }));
  const extra = extraSource.sites.map(([id, name, latitude, longitude, depth, entryCode, mask, fresh]) => ({ id: `x-${id}`, name, latitude, longitude,
    country: '', region: '', environment: fresh ? 'fresh' : '', topologies: extraSource.topologyCodes.filter((_, code) => mask & (1 << code)),
    entry: ['', 'boat', 'shore'][entryCode], maxDepthMeters: depth || null }));
  cache = [...listed, ...global, ...osm, ...extra];
  applyPublishedDepths(cache, publishedDepths);
  return cache;
}

// Depths from scripts/build-published-depths.cjs: operator/agency-posted depths replace a record's
// own figure; Wikipedia/Wikidata depths only fill gaps. Mirrored in atlasRuntime.js.
export function applyPublishedDepths(list, published) {
  const depths = published?.depths || {};
  for (const site of list) {
    const row = depths[site.id];
    if (!row || (site.maxDepthMeters && row[1] !== 'Posted')) continue;
    const [metres, source, url, wholeLake] = row;
    Object.assign(site, { maxDepthMeters: metres, depthSource: { name: source === 'Posted' ? 'Posted by the site' : source, url }, depthIsWholeLake: Boolean(wholeLake) });
  }
}

let byId = null;
export function catalogSite(id) {
  if (!byId) byId = new Map(catalogSites().map(site => [site.id, site]));
  return byId.get(id) || null;
}
