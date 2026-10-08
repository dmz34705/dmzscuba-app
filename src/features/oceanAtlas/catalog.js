// Native-side view of the atlas site catalog. Decoding mirrors atlasRuntime.js
// so ids match the pins the WebView shows (e.g. `odm-<recordId>`).
import { onAtlasDataChange, globalSites as globalSource, sites, curatedSites, osmSites as osmSource, extraSites as extraSource, publishedDepths, siteMerges, siteProfiles } from './datasets';
import { applySiteCorrections, siteCorrections } from './siteProfiles';
import { OFFLINE_DIVE_SITES } from '../../lib/diveSites/offlineCatalog';

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

let rawCache = null;
// Every record from every source, before duplicates are merged (used by the merge build).
// Wrecks closed to divers by law, from any source: the Edmund Fitzgerald (Ontario Heritage Act), the Pearl
// Harbor memorials, HMS Royal Oak (war graves) and the explosive-laden SS Richard Montgomery.
export const CLOSED_WRECKS = /edmund fitzgerald|uss arizona|uss utah|hms royal oak|richard montgomery/i;

let closedCount = 0;
export const closedWreckCount = () => { rawCatalogSites(); return closedCount; };

export function rawCatalogSites() {
  if (rawCache) return rawCache;
  const g = globalSource;
  const ids = g.packedIds.match(/.{6}/g) || [];
  const coordinates = numbers(g.coordinatesBase64, 4, 'getInt32');
  const countries = numbers(g.countryIndexesBase64, 1, 'getUint8').map(value => value - 1);
  const depths = numbers(g.maxDepthsBase64, 2, 'getUint16');
  const column = entries => new Map(entries || []);
  const environments = column(g.environmentsByIndex), masks = column(g.topologyMasksByIndex), entries = column(g.entriesByIndex);
  const community = new Map((g.communityStatsByIndex || []).map(([index, ...values]) => [index, values]));
  const global = ids.map((recordId, index) => {
    const mask = masks.get(index) ?? g.defaults.topologyMask;
    const stats = community.get(index) || [];
    return { id: `odm-${recordId}`, name: g.names[index], latitude: coordinates[index * 2] / 1e5, longitude: coordinates[index * 2 + 1] / 1e5,
      country: g.countries[countries[index]] || '', environment: environments.get(index) ?? g.defaults.environment,
      topologies: g.topologyCodes.filter((_, code) => mask & (1 << code)), entry: entries.get(index) ?? g.defaults.entry, maxDepthMeters: depths[index] || null,
      communityVisibilityMeters: stats[0] || null, communityRating: stats[1] || null, communityDives: stats[2] || 0,
      communityDiveMinutes: stats[3] || null };
  });
  const listed = [...OFFLINE_DIVE_SITES, ...sites, ...curatedSites].map(site => ({ id: site.id, name: site.name, latitude: site.latitude, longitude: site.longitude,
    country: site.country || '', region: site.region || '', environment: site.environment || '', topologies: site.topologies || featuresOf(site.siteType),
    entry: site.entry || '', maxDepthMeters: site.maxDepthMeters || null }));
  const osm = osmSource.sites.map(([osmId, name, latitude, longitude, depth, entryCode, mask, fresh, difficulty, currentCode, accessCode, hazardMask, mooringCode, fee, accessEase, entryDetailMask]) => ({ id: `osm-${osmId}`, name, latitude, longitude,
    country: '', region: '', environment: fresh ? 'fresh' : 'ocean', topologies: osmSource.topologyCodes.filter((_, code) => mask & (1 << code)),
    entry: ['', 'boat', 'shore'][entryCode], maxDepthMeters: depth || null, difficulty: difficulty || '',
    structuredCurrent: ['', 'none', 'light', 'moderate', 'strong'][currentCode] || '',
    structuredAccess: ['', 'Permit required', 'Private access', 'Access for customers', 'Permissive access'][accessCode] || '',
    structuredHazards: ['Strong or changing current', 'Depth', 'Fishing nets', 'Underwater obstacles', 'Boat traffic', 'Potentially dangerous species', 'Explosive or hazardous material', 'Spearfishing activity', 'Rockfall', 'Surfers'].filter((_, code) => hazardMask & (1 << code)),
    structuredMooring: ['', 'Descent line mapped', 'Mooring buoy mapped', 'Descent line and mooring buoy mapped'][mooringCode] || '',
    structuredFee: Boolean(fee), structuredAccessEase: ['', 'Easy to locate', 'Moderately difficult to locate', 'Difficult to locate'][accessEase] || '',
    structuredEntryDetails: ['Steps entry', 'Ladder entry', 'Rocky entry', 'Steep entry'].filter((_, code) => entryDetailMask & (1 << code)) }));
  const extra = extraSource.sites.map(([id, name, latitude, longitude, depth, entryCode, mask, fresh, source, , own]) => {
    // A source-wide caveat (reef-program positions) follows the row's own note, as in atlasRuntime.js.
    const note = [own, extraSource.sources[source]?.note].filter(Boolean).join(' ');
    return { id: `x-${id}`, name, latitude, longitude,
      country: '', region: '', environment: fresh ? 'fresh' : 'ocean', topologies: extraSource.topologyCodes.filter((_, code) => mask & (1 << code)),
      entry: ['', 'boat', 'shore'][entryCode], maxDepthMeters: depth || null, ...(note ? { note } : {}) };
  });
  const everything = [...listed, ...global, ...osm, ...extra];
  closedCount = everything.filter(site => CLOSED_WRECKS.test(site.name)).length;
  rawCache = everything.filter(site => !CLOSED_WRECKS.test(site.name));
  applyPublishedDepths(rawCache, publishedDepths);
  return rawCache;
}

let cache = null;
export function catalogSites() {
  if (cache) return cache;
  // Researched corrections (positions, depths, gone or never-found wrecks) come last: they are the best-checked facts.
  cache = applySiteCorrections(applySiteMerges(rawCatalogSites().map((site) => ({ ...site })), siteMerges).sites, siteCorrections(siteProfiles));
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

// The same site listed by several sources is one site (scripts/build-site-merges.cjs): the kept
// record takes the most precise position and best-sourced depth, gains the others' names, features
// and source credits, and knows how many independent sources list it. Mirrored in atlasRuntime.js.
export function applySiteMerges(list, merges) {
  const byId = new Map(list.map(site => [site.id, site]));
  const mergedInto = new Map();
  for (const [keepId, mergedIds, latitude, longitude, aliases, depth, independentSources] of merges?.clusters || []) {
    const keep = byId.get(keepId);
    if (!keep) continue;
    const others = mergedIds.map(id => byId.get(id)).filter(Boolean);
    Object.assign(keep, {
      latitude, longitude, aliases: [...new Set([...(keep.aliases || []), ...aliases])], independentSources,
      topologies: [...new Set([keep, ...others].flatMap(site => site.topologies || []))],
      entry: keep.entry || others.find(site => site.entry)?.entry || '',
      environment: keep.environment || others.find(site => site.environment)?.environment || '',
      communityVisibilityMeters: keep.communityVisibilityMeters || others.find(site => site.communityVisibilityMeters)?.communityVisibilityMeters || null,
      communityRating: keep.communityRating || others.find(site => site.communityRating)?.communityRating || null,
      communityDives: keep.communityDives || others.find(site => site.communityDives)?.communityDives || 0,
      communityDiveMinutes: keep.communityDiveMinutes || others.find(site => site.communityDiveMinutes)?.communityDiveMinutes || null,
      structuredCurrent: keep.structuredCurrent || others.find(site => site.structuredCurrent)?.structuredCurrent || '',
      structuredAccess: keep.structuredAccess || others.find(site => site.structuredAccess)?.structuredAccess || '',
      structuredHazards: [...new Set([...(keep.structuredHazards || []), ...others.flatMap(site => site.structuredHazards || [])])],
      structuredMooring: keep.structuredMooring || others.find(site => site.structuredMooring)?.structuredMooring || '',
      structuredFee: Boolean(keep.structuredFee || others.some(site => site.structuredFee)),
      structuredAccessEase: keep.structuredAccessEase || others.find(site => site.structuredAccessEase)?.structuredAccessEase || '',
      structuredEntryDetails: [...new Set([...(keep.structuredEntryDetails || []), ...others.flatMap(site => site.structuredEntryDetails || [])])],
      ...(keep.note || others.some(site => site.note) ? { note: keep.note || others.find(site => site.note).note } : {}),
      sources: [...(keep.sources || []), ...others.flatMap(site => site.sources || [])],
    });
    if (depth && !keep.depthSource?.name?.startsWith('Posted')) keep.maxDepthMeters = depth;
    for (const id of mergedIds) mergedInto.set(id, keepId);
  }
  return { sites: list.filter(site => !mergedInto.has(site.id)), mergedInto };
}

let byId = null;
export function catalogSite(id) {
  if (!byId) {
    const all = catalogSites();
    byId = new Map(all.map(site => [site.id, site]));
    // A dive or link that points at a merged-away duplicate resolves to the site it became.
    for (const [keepId, mergedIds] of siteMerges.clusters || []) for (const mergedId of mergedIds) if (byId.has(keepId)) byId.set(mergedId, byId.get(keepId));
  }
  return byId.get(id) || null;
}

onAtlasDataChange(() => { rawCache = null; cache = null; byId = null; closedCount = 0; });
