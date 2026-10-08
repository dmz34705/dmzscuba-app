#!/usr/bin/env node
// Country-level work queue for the site research program. This is deliberately
// read-only: it shows where a source crawl or regional research batch will have
// the largest impact and which facts that batch should target.
const path = require('node:path');
const { loadSourceModule } = require('./lib/load-source-module.cjs');
const root = path.resolve(__dirname, '../src');
const { catalogSites } = loadSourceModule(path.join(root, 'features/oceanAtlas/catalog.js'), root);
const { placesForSite } = loadSourceModule(path.join(root, 'features/oceanAtlas/places.js'), root);
const data = path.join(root, 'features/oceanAtlas/data');
const profiles = require(path.join(data, 'siteProfiles.json')).sites;
const facts = require(path.join(data, 'siteFacts.json')).facts;
const images = require(path.join(data, 'siteImages.json')).images;

const groups = new Map();
for (const site of catalogSites()) {
  // Source-native country wins for the global catalog; the polygon resolver can
  // return a small Australian external territory before mainland Australia.
  const country = site.country || placesForSite(site.id).find(place => place.kind === 'country')?.name || 'Unplaced';
  if (!groups.has(country)) groups.set(country, { sites: 0, depth: 0, entry: 0, type: 0, visibility: 0, current: 0, access: 0, summary: 0, photo: 0, core: 0 });
  const row = groups.get(country), profile = profiles[site.id]; row.sites++;
  const depth = Number.isFinite(site.maxDepthMeters) && !site.depthIsWholeLake;
  const entry = Boolean(site.entry), type = site.topologies?.length > 0;
  if (!depth) row.depth++;
  if (!entry) row.entry++;
  if (!type) row.type++;
  if (!(profile?.vis || site.communityVisibilityMeters)) row.visibility++;
  if (!(profile?.current || site.structuredCurrent)) row.current++;
  if (!(profile?.access || site.structuredAccess || site.structuredFee)) row.access++;
  if (!(profile?.summary || facts[site.id]?.[0])) row.summary++;
  if (!images[site.id]) row.photo++;
  if (!(depth && entry && site.environment && type)) row.core++;
}

const limit = Math.max(1, Number(process.argv[2]) || 30);
console.log('Largest country research queues (missing counts)');
console.log('Country'.padEnd(24), ...['Sites', 'Core', 'Depth', 'Entry', 'Type', 'Vis', 'Current', 'Access', 'Summary', 'Photo'].map(value => value.padStart(8)));
for (const [country, row] of [...groups].sort((a, b) => b[1].core - a[1].core || b[1].sites - a[1].sites).slice(0, limit)) {
  console.log(country.slice(0, 23).padEnd(24), ...['sites', 'core', 'depth', 'entry', 'type', 'visibility', 'current', 'access', 'summary', 'photo'].map(key => String(row[key]).padStart(8)));
}
