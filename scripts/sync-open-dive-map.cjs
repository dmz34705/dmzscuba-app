#!/usr/bin/env node
/*
 * Build a compact, committed map-only snapshot from OpenDiveMap's public
 * GeoJSON API. This catalog is deliberately separate from the offline logbook
 * matcher: community records can be explored without silently naming a dive.
 */
const fs = require('node:fs');
const path = require('node:path');

const API_URL = 'https://api.opendivemap.com/v1/sites';
const SOURCE_URL = 'https://opendivemap.com/';
const LICENSE_URL = 'https://opendatacommons.org/licenses/odbl/1-0/';
const outputPath = path.resolve(__dirname, '../src/features/oceanAtlas/data/globalSites.json');
const MINIMUM_EXPECTED_SITES = 100;
const MAXIMUM_SNAPSHOT_BYTES = 700 * 1024;
const MAXIMUM_PAGES = 100;
const topologyCodes = ['reef', 'wall', 'wreck', 'pinnacle', 'cave', 'cavern', 'muck', 'drift', 'shore', 'other'];

function validCoordinate(latitude, longitude) {
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

function text(value, maximum = 120) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, maximum) : '';
}

function aliasesFrom(tags, name) {
  const aliases = Object.entries(tags || {})
    .filter(([key]) => /^names?(?:_|$)/i.test(key))
    .flatMap(([, value]) => Array.isArray(value) ? value : [value])
    .map((value) => text(value, 100)).filter((value) => value && value !== name);
  return [...new Set(aliases)].slice(0, 6);
}

function dictionaryIndex(dictionary, value) {
  const normalized = text(value, 100);
  if (!normalized) return -1;
  let index = dictionary.indexOf(normalized);
  if (index < 0) { dictionary.push(normalized); index = dictionary.length - 1; }
  return index;
}

function commonValue(values) {
  const counts = new Map();
  for (const value of values) counts.set(JSON.stringify(value), (counts.get(JSON.stringify(value)) || 0) + 1);
  const key = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return key === undefined ? null : JSON.parse(key);
}

function sparseColumn(rows, column, fallback) {
  return rows.flatMap((row, index) => JSON.stringify(row[column]) === JSON.stringify(fallback) ? [] : [[index, row[column]]]);
}

function int32Base64(values) {
  const buffer = Buffer.allocUnsafe(values.length * 4);
  values.forEach((value, index) => buffer.writeInt32LE(value, index * 4));
  return buffer.toString('base64');
}

function uint16Base64(values) {
  const buffer = Buffer.allocUnsafe(values.length * 2);
  values.forEach((value, index) => buffer.writeUInt16LE(value, index * 2));
  return buffer.toString('base64');
}

async function fetchCatalog() {
  const allowed = new URL(API_URL);
  const visited = new Set(); const features = [];
  let nextUrl = API_URL; let expectedCount = null;
  for (let page = 0; nextUrl && page < MAXIMUM_PAGES; page += 1) {
    const target = new URL(nextUrl);
    if (target.origin !== allowed.origin || target.pathname !== allowed.pathname) throw new Error(`Refusing an unexpected pagination URL: ${target.href}`);
    if (visited.has(target.href)) throw new Error(`Pagination loop detected at ${target.href}.`);
    visited.add(target.href);
    let response;
    try {
      response = await fetch(target, { headers: { Accept: 'application/geo+json, application/json', 'User-Agent': 'DMZ-Scuba-Atlas-Catalog-Builder/1.0' } });
    } catch (error) {
      throw new Error(`Could not reach ${target.href}: ${error.cause?.message || error.message}. Existing snapshot was not changed. You may also pass a downloaded GeoJSON file: npm run sync:global-dive-sites -- /path/to/sites.geojson`);
    }
    if (!response.ok) throw new Error(`OpenDiveMap returned HTTP ${response.status} for ${target.href}. Existing snapshot was not changed.`);
    const pageData = await response.json();
    if (pageData?.type !== 'FeatureCollection' || !Array.isArray(pageData.features)) throw new Error(`Page ${page + 1} is not a GeoJSON FeatureCollection.`);
    if (Number.isInteger(pageData.numberMatched)) {
      if (expectedCount !== null && expectedCount !== pageData.numberMatched) throw new Error('OpenDiveMap numberMatched changed during pagination; retry the snapshot.');
      expectedCount = pageData.numberMatched;
    }
    features.push(...pageData.features);
    nextUrl = pageData.links?.find((link) => link?.rel === 'next')?.href || null;
  }
  if (nextUrl) throw new Error(`OpenDiveMap pagination exceeded ${MAXIMUM_PAGES} pages.`);
  if (expectedCount !== null && features.length !== expectedCount) throw new Error(`OpenDiveMap advertised ${expectedCount} records but pagination returned ${features.length}. Existing snapshot was not changed.`);
  return { type: 'FeatureCollection', features };
}

async function main() {
  const localInput = process.argv[2] ? path.resolve(process.argv[2]) : null;
  let geojson;
  if (localInput) {
    if (!fs.existsSync(localInput)) throw new Error(`Local GeoJSON file does not exist: ${localInput}`);
    geojson = JSON.parse(fs.readFileSync(localInput, 'utf8'));
  } else {
    geojson = await fetchCatalog();
  }
  if (geojson?.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) throw new Error('OpenDiveMap response is not a GeoJSON FeatureCollection.');
  if (geojson.features.length < MINIMUM_EXPECTED_SITES) throw new Error(`Only ${geojson.features.length} sites were returned; refusing to replace the snapshot.`);

  const countries = []; const seas = []; const rejected = []; const ids = new Set();
  const rows = geojson.features.map((feature, index) => {
    const properties = feature?.properties || {};
    const [longitude, latitude] = feature?.geometry?.type === 'Point' ? feature.geometry.coordinates || [] : [];
    const id = text(properties.id || feature.id, 80); const name = text(properties.name, 120);
    if (!id || !name || !validCoordinate(latitude, longitude) || ids.has(id)) {
      rejected.push({ index, id: id || null, reason: ids.has(id) ? 'duplicate id' : 'missing id, name, or valid point coordinate' });
      return null;
    }
    ids.add(id);
    const topologies = (Array.isArray(properties.topologies) ? properties.topologies : []).map((value) => text(value, 40).toLowerCase()).filter(Boolean);
    const topologyMask = topologies.reduce((mask, value) => {
      const code = topologyCodes.indexOf(value);
      return code < 0 ? mask : mask | (1 << code);
    }, 0);
    const unknownTopologies = topologies.filter((value) => !topologyCodes.includes(value)).slice(0, 3);
    const maxDepth = Number(properties.max_depth);
    return [id, name, Math.round(latitude * 1e5), Math.round(longitude * 1e5),
      dictionaryIndex(countries, properties.country_name || properties.country_code),
      dictionaryIndex(seas, properties.sea_name), text(properties.environment, 24), topologyMask,
      text(properties.entry, 24), Number.isFinite(maxDepth) && maxDepth > 0 && maxDepth < 1000 ? maxDepth : 0,
      aliasesFrom(properties.tags, name), unknownTopologies];
  }).filter(Boolean).sort((a, b) => a[1].localeCompare(b[1]));

  const defaults = { sea: commonValue(rows.map((row) => row[5])), environment: commonValue(rows.map((row) => row[6])),
    topologyMask: commonValue(rows.map((row) => row[7])), entry: commonValue(rows.map((row) => row[8])),
    aliases: commonValue(rows.map((row) => row[10])), unknownTopologies: commonValue(rows.map((row) => row[11])) };
  if (!rows.every((row) => /^[a-z0-9]{6}$/.test(row[0]))) throw new Error('OpenDiveMap returned an ID outside the compact six-character format; review the schema before updating the snapshot.');
  const snapshot = { schemaVersion: 3, source: 'OpenDiveMap contributors', sourceUrl: SOURCE_URL,
    apiUrl: API_URL, license: 'ODbL 1.0', licenseUrl: LICENSE_URL, retrievedAt: new Date().toISOString(),
    recordCount: rows.length, countries, seas, topologyCodes, defaults,
    packedIds: rows.map((row) => row[0]).join(''), names: rows.map((row) => row[1]),
    coordinatesBase64: int32Base64(rows.flatMap((row) => [row[2], row[3]])),
    countryIndexesBase64: Buffer.from(rows.map((row) => row[4] + 1)).toString('base64'),
    seasByIndex: sparseColumn(rows, 5, defaults.sea), environmentsByIndex: sparseColumn(rows, 6, defaults.environment),
    topologyMasksByIndex: sparseColumn(rows, 7, defaults.topologyMask), entriesByIndex: sparseColumn(rows, 8, defaults.entry),
    maxDepthsBase64: uint16Base64(rows.map((row) => row[9])), aliasesByIndex: sparseColumn(rows, 10, defaults.aliases),
    unknownTopologiesByIndex: sparseColumn(rows, 11, defaults.unknownTopologies) };
  const serialized = `${JSON.stringify(snapshot)}\n`;
  if (Buffer.byteLength(serialized) > MAXIMUM_SNAPSHOT_BYTES) throw new Error(`Compact snapshot is ${Buffer.byteLength(serialized)} bytes; review the payload before raising the 700 KB safety limit.`);
  fs.writeFileSync(outputPath, serialized);
  const reportPath = path.resolve(__dirname, '../data/dive-sites/opendivemap-build-report.json');
  fs.writeFileSync(reportPath, `${JSON.stringify({ retrievedAt: snapshot.retrievedAt, received: geojson.features.length, accepted: rows.length, rejected }, null, 2)}\n`);
  console.log(`Wrote ${rows.length} OpenDiveMap sites from ${localInput || API_URL} (${countries.length} countries, ${seas.length} seas); rejected ${rejected.length}.`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
