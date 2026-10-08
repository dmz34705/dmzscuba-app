// Shared by the release builder and the device updater. Only versioned JSON is downloaded.
import { expandTemperature } from './model';
import { validateSiteProfiles } from './siteProfiles';
export const ATLAS_SCHEMA = 1;
export const ATLAS_BASE_PATH = '/assets/atlas/v1';
export const ATLAS_DATASET_KEYS = ['airports', 'curatedSites', 'diveOperators', 'extraSites', 'freshwaterLife', 'globalSites', 'inlandConditions', 'land', 'marineLife', 'marineLifeObis', 'osmSites', 'places', 'publishedDepths', 'siteBathymetry', 'siteFacts', 'siteImages', 'siteLakeDepths', 'siteMerges', 'siteProfiles', 'siteProtection', 'siteSeafloor', 'siteShore', 'sites', 'temperature', 'visibility'];
export const MAX_ATLAS_FILE_BYTES = 32 * 1024 * 1024;
export const MAX_ATLAS_BYTES = 128 * 1024 * 1024;
export const MAX_MANIFEST_BYTES = 64 * 1024;

export function utf8Bytes(text) {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 128) bytes++;
    else if (code < 2048) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length && text.charCodeAt(i + 1) >= 0xdc00 && text.charCodeAt(i + 1) <= 0xdfff) { bytes += 4; i++; }
    else bytes += 3;
  }
  return bytes;
}

export function validateAtlasManifest(value) {
  if (value?.schemaVersion !== ATLAS_SCHEMA || !/^[a-f0-9]{64}$/.test(value.version || '') || !Number.isFinite(Date.parse(value.publishedAt))) throw new Error('Unsupported Atlas release.');
  const files = value.files;
  if (!files || Object.keys(files).length !== ATLAS_DATASET_KEYS.length) throw new Error('Incomplete Atlas release.');
  let total = 0;
  for (const key of ATLAS_DATASET_KEYS) {
    const file = files[key];
    if (!file || !/^[a-f0-9]{64}$/.test(file.sha256 || '') || !Number.isSafeInteger(file.bytes) || file.bytes < 1 || file.bytes > MAX_ATLAS_FILE_BYTES
      || file.path !== `${ATLAS_BASE_PATH}/files/${key}-${file.sha256}.json`) throw new Error(`Invalid Atlas file: ${key}.`);
    total += file.bytes;
  }
  if (total > MAX_ATLAS_BYTES) throw new Error('Atlas release is too large.');
  return value;
}

const object = value => value != null && typeof value === 'object' && !Array.isArray(value);
const coordinate = (lat, lon) => Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lon) && Math.abs(lon) <= 180;
const rows = (value, min, check = () => true) => Array.isArray(value) && value.every(row => Array.isArray(row) && row.length >= min && check(row));
const fail = key => { throw new Error(`Invalid Atlas data: ${key}.`); };
const observation = row => Number.isFinite(row[0]) && Number.isFinite(row[1]) && Number.isInteger(row[2]) && typeof row[3] === 'string' && /^[0-9]{12}$/.test(row[3]);

// Reject structural errors before exposing a new snapshot to any native or map consumer.
export function validateAtlasDatasets(data) {
  for (const key of ATLAS_DATASET_KEYS) if (data[key] == null) fail(key);
  for (const key of ['sites', 'curatedSites']) if (!Array.isArray(data[key]) || !data[key].every(s => typeof s.id === 'string' && typeof s.name === 'string' && coordinate(s.latitude, s.longitude))) fail(key);
  for (const key of ['osmSites', 'extraSites']) {
    const source = data[key];
    if (!Array.isArray(source.topologyCodes) || !rows(source.sites, 9, row => typeof row[0] === 'string' && typeof row[1] === 'string' && coordinate(row[2], row[3]))) fail(key);
  }
  if (!object(data.extraSites.sources)) fail('extraSites');
  const g = data.globalSites;
  if (!Number.isSafeInteger(g.recordCount) || g.recordCount < 1 || !Array.isArray(g.names) || g.names.length !== g.recordCount || typeof g.packedIds !== 'string' || g.packedIds.length !== g.recordCount * 6
    || !Array.isArray(g.countries) || !Array.isArray(g.topologyCodes) || !object(g.defaults)) fail('globalSites');
  for (const [field, bytes] of [['coordinatesBase64', 8], ['countryIndexesBase64', 1], ['maxDepthsBase64', 2]]) {
    const str = g[field];
    if (typeof str !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(str) || Math.floor(str.replace(/=+$/, '').length * 3 / 4) !== g.recordCount * bytes) fail('globalSites');
  }
  if (!Array.isArray(g.communityStatsByIndex) || !g.communityStatsByIndex.every(r => Array.isArray(r) && (r.length === 4 || r.length === 5)
    && Number.isInteger(r[0]) && r[0] >= 0 && r[0] < g.recordCount
    && Number.isFinite(r[1]) && r[1] >= 0 && r[1] <= 100 && Number.isFinite(r[2]) && r[2] >= 0 && r[2] <= 5
    && Number.isSafeInteger(r[3]) && r[3] >= 0 && (r.length === 4 || Number.isInteger(r[4]) && r[4] >= 0 && r[4] <= 300))) fail('globalSites');
  const t = data.temperature;
  if (!Array.isArray(t.latitudes) || !Array.isArray(t.longitudes) || t.latitudes.length !== 89 || t.longitudes.length !== 180 || !Array.isArray(t.packedMonths) || t.packedMonths.length !== 12
    || !t.packedMonths.every(m => typeof m === 'string' && m.length >= 89 * 180 && m.length <= 89 * 180 * 2)) fail('temperature');
  if (!expandTemperature(t).months.every(m => m.length === 89 * 180 && m.every(v => v === null || Number.isInteger(v) && v >= -20 && v <= 450))) fail('temperature');
  if (!(data.land.scale > 0) || !rows(data.land.polygons, 1, p => p.every(r => typeof r === 'string'))) fail('land');
  for (const key of ['marineLife', 'marineLifeObis']) {
    if (!object(data[key].taxa) || !rows(data[key].places, 5, r => coordinate(r[0], r[1]) && Number.isFinite(r[2]) && typeof r[3] === 'string' && rows(r[4], 4, observation))
      || !Object.values(data[key].taxa).every(r => Array.isArray(r) && r.length >= 3 && typeof r[0] === 'string')) fail(key);
  }
  if (!object(data.freshwaterLife.taxa) || !rows(data.freshwaterLife.places, 4, r => coordinate(r[0], r[1]) && Number.isFinite(r[2]) && rows(r[3], 2))) fail('freshwaterLife');
  if (!object(data.airports.countries) || !rows(data.airports.airports, 8, r => coordinate(r[4], r[5]))) fail('airports');
  if (!Array.isArray(data.diveOperators.kinds) || !rows(data.diveOperators.places, 7, r => coordinate(r[2], r[3]))) fail('diveOperators');
  if (!(data.places.scale > 0) || !rows(data.places.countries, 3) || !rows(data.places.states, 3) || !rows(data.places.islands, 5)) fail('places');
  for (const [key, field, min] of [['publishedDepths', 'depths', 3], ['siteFacts', 'facts', 2], ['siteImages', 'images', 4], ['siteBathymetry', 'sites', 4], ['siteLakeDepths', 'sites', 4], ['siteSeafloor', 'sites', 3], ['siteShore', 'sites', 7], ['inlandConditions', 'sites', 2]]) {
    if (!object(data[key][field]) || !Object.values(data[key][field]).every(r => Array.isArray(r) && r.length >= min)) fail(key);
  }
  if (!object(data.siteBathymetry.sources) || !Array.isArray(data.siteShore.fields)) fail('siteBathymetry/siteShore');
  if (!Object.values(data.inlandConditions.sites).every(row => Array.isArray(row[1]) && row[1].length === 12 && row[1].every(n => n === null || Number.isFinite(n)))) fail('inlandConditions');
  if (!Object.values(data.siteBathymetry.sites).every(row => data.siteBathymetry.sources[row[3]])) fail('siteBathymetry');
  if (!data.places.countries.every(row => Array.isArray(row[2]) && row[2].every(r => typeof r === 'string'))
    || !data.places.states.every(row => Array.isArray(row[2]) && row[2].every(r => typeof r === 'string'))
    || !data.places.islands.every(row => typeof row[4] === 'string')) fail('places');
  if (!rows(data.siteMerges.clusters, 7, r => typeof r[0] === 'string' && Array.isArray(r[1]) && coordinate(r[2], r[3]) && Array.isArray(r[4]))) fail('siteMerges');
  if (!rows(data.siteProtection.areas, 3) || !object(data.siteProtection.sites)
    || !Object.values(data.siteProtection.sites).every(r => Array.isArray(r) && r.every(i => Number.isInteger(i) && data.siteProtection.areas[i]))) fail('siteProtection');
  if (!validateSiteProfiles(data.siteProfiles)) fail('siteProfiles');
  const v = data.visibility;
  if (!object(v.grid) || !Number.isSafeInteger(v.grid.rows) || !Number.isSafeInteger(v.grid.cols) || !Number.isFinite(v.grid.dLat) || !v.grid.dLat || !Number.isFinite(v.grid.dLon) || !v.grid.dLon
    || typeof v.packing?.alphabet !== 'string' || v.packing.alphabet.length < 2 || !object(v.cells) || !Object.values(v.cells).every(c => typeof c === 'string' && c.length === 12)) fail('visibility');
  return data;
}
