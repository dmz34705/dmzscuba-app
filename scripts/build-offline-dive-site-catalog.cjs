#!/usr/bin/env node
/* Build the shipped offline catalog from approved, local source files only. */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const manifestPath = path.join(root, 'data/dive-sites/source-manifest.json');
const outputPath = path.join(root, 'src/lib/diveSites/data/offlineDiveSites.json');
const reportPath = path.join(root, 'data/dive-sites/build-report.json');
const compactRadius = (quality) => ['broad', 'low', 'approximate'].includes(quality) ? 650 : 150;
const normalizeName = (value) => String(value || '').trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const radians = (degrees) => degrees * Math.PI / 180;
const distanceMeters = (a, b) => {
  const dLat = radians(b.latitude - a.latitude); const dLon = radians(b.longitude - a.longitude);
  const q = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q));
};
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

function parseCsv(text) {
  const rows = []; let row = []; let value = ''; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]; const next = text[i + 1];
    if (char === '"' && quoted && next === '"') { value += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { row.push(value); value = ''; }
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(value); if (row.some((cell) => cell.trim())) rows.push(row); row = []; value = '';
    } else value += char;
  }
  if (value || row.length) { row.push(value); rows.push(row); }
  const [headers = [], ...data] = rows;
  return data.map((cells) => Object.fromEntries(headers.map((header, i) => [header.trim(), (cells[i] || '').trim()])));
}

function geoJsonRecords(parsed) {
  if (parsed?.type !== 'FeatureCollection') throw new Error('Expected a GeoJSON FeatureCollection.');
  return parsed.features.map((feature) => ({ ...feature.properties, sourceRecordId: feature.properties?.sourceRecordId || feature.id, longitude: feature.geometry?.coordinates?.[0], latitude: feature.geometry?.coordinates?.[1] }));
}

function parseKml(text) {
  return [...text.matchAll(/<Placemark\b[^>]*>([\s\S]*?)<\/Placemark>/gi)].map((match) => {
    const body = match[1];
    const name = (body.match(/<name[^>]*>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/name>/i) || [])[1]?.trim();
    const coordinates = (body.match(/<coordinates[^>]*>\s*([^<\s]+)[\s\S]*?<\/coordinates>/i) || [])[1]?.split(',') || [];
    const fields = Object.fromEntries([...body.matchAll(/<Data\s+name=["']([^"']+)["'][^>]*>\s*<value>([\s\S]*?)<\/value>/gi)].map((field) => [field[1], field[2].trim()]));
    return { ...fields, name: fields.name || name, longitude: fields.longitude || coordinates[0], latitude: fields.latitude || coordinates[1] };
  });
}

function recordsFor(source) {
  const input = path.resolve(path.dirname(manifestPath), source.input);
  if (source.format === 'normalized-json') return readJson(input);
  if (source.format === 'geojson') return geoJsonRecords(readJson(input));
  if (source.format === 'csv') return parseCsv(fs.readFileSync(input, 'utf8'));
  if (source.format === 'kml') return parseKml(fs.readFileSync(input, 'utf8'));
  if (source.format === 'shapefile') {
    const temporary = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dmz-dive-sites-')), 'source.geojson');
    try {
      execFileSync('ogr2ogr', ['-f', 'GeoJSON', temporary, input], { stdio: 'pipe' });
      return geoJsonRecords(readJson(temporary));
    } catch (error) {
      throw new Error(`${source.id}: Shapefile import requires GDAL ogr2ogr. ${error.message}`);
    } finally { fs.rmSync(path.dirname(temporary), { recursive: true, force: true }); }
  }
  throw new Error(`${source.id}: unsupported format ${source.format}.`);
}

function normalize(record, source) {
  const latitude = Number(record.latitude); const longitude = Number(record.longitude);
  const name = String(record.name || '').trim();
  if (!name || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  const coordinateQuality = record.coordinateQuality || 'approximate';
  const recordId = String(record.sourceRecordId || '').trim();
  if (!recordId) return null;
  return {
    id: `${source.id}-${recordId}`.replace(/[^a-z0-9-]+/gi, '-').toLowerCase(), name,
    aliases: [...new Set((Array.isArray(record.aliases) ? record.aliases : []).map((alias) => String(alias).trim()).filter(Boolean))],
    latitude, longitude, siteType: record.siteType || 'training site',
    matchRadiusMeters: Number.isFinite(Number(record.matchRadiusMeters)) && Number(record.matchRadiusMeters) > 0 ? Number(record.matchRadiusMeters) : compactRadius(coordinateQuality),
    coordinateQuality, region: record.region || undefined, country: record.country || undefined,
    sources: [{ sourceName: source.name, sourceUrl: source.sourceUrl, sourceRecordId: recordId, dataLicense: source.license, coordinateQuality }],
  };
}

function duplicateOf(record, catalog) {
  const names = new Set([normalizeName(record.name), ...record.aliases.map(normalizeName)]);
  return catalog.find((existing) => {
    const existingNames = [existing.name, ...existing.aliases].map(normalizeName);
    const sameName = existingNames.some((name) => names.has(name));
    return sameName && distanceMeters(record, existing) <= Math.min(record.matchRadiusMeters, existing.matchRadiusMeters, 150);
  });
}

const manifest = readJson(manifestPath);
const catalog = []; const report = { added: [], duplicates: [], rejected: [] };
for (const source of manifest.sources || []) {
  for (const raw of recordsFor(source)) {
    const record = normalize(raw, source);
    if (!record) { report.rejected.push({ source: source.id, reason: 'Missing name, sourceRecordId, or valid WGS84 coordinate.' }); continue; }
    const duplicate = duplicateOf(record, catalog);
    if (duplicate) {
      duplicate.sources.push(...record.sources);
      duplicate.aliases = [...new Set([...duplicate.aliases, ...record.aliases])];
      report.duplicates.push({ kept: duplicate.id, mergedSource: record.sources[0] });
    } else { catalog.push(record); report.added.push(record.id); }
  }
}
catalog.sort((a, b) => a.id.localeCompare(b.id));
fs.writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`);
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Built ${catalog.length} offline dive-site record(s); ${report.duplicates.length} duplicate(s), ${report.rejected.length} rejected.`);
