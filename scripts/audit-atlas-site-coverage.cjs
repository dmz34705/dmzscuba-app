#!/usr/bin/env node
// Read-only completeness report for the merged Ocean Atlas catalog and its
// per-site enrichment datasets. Run after every research batch so progress is
// measured across whole profiles, not only published depths.
const path = require('node:path');
const { loadSourceModule } = require('./lib/load-source-module.cjs');

const src = path.resolve(__dirname, '../src');
const dataDir = path.join(src, 'features/oceanAtlas/data');
const { catalogSites } = loadSourceModule(path.join(src, 'features/oceanAtlas/catalog.js'), src);
const sites = catalogSites();
const profiles = require(path.join(dataDir, 'siteProfiles.json')).sites;
const datasets = {
  encyclopedia: require(path.join(dataDir, 'siteFacts.json')).facts,
  photo: require(path.join(dataDir, 'siteImages.json')).images,
  protection: require(path.join(dataDir, 'siteProtection.json')).sites,
  shore: require(path.join(dataDir, 'siteShore.json')).sites,
  seafloor: require(path.join(dataDir, 'siteSeafloor.json')).sites,
  bathymetry: require(path.join(dataDir, 'siteBathymetry.json')).sites,
  lakeDepth: require(path.join(dataDir, 'siteLakeDepths.json')).sites,
};

const total = sites.length;
const count = predicate => sites.filter(predicate).length;
const pct = value => `${(value / total * 100).toFixed(1)}%`;
const row = (label, value) => console.log(`${label.padEnd(31)} ${String(value).padStart(5)}  ${pct(value).padStart(6)}`);
const hasDepth = site => Number.isFinite(site.maxDepthMeters) && !site.depthIsWholeLake;
const hasEstimatedDepth = site => hasDepth(site)
  || Number.isFinite(datasets.bathymetry[site.id]?.[0])
  || Number.isFinite(datasets.seafloor[site.id]?.[0]);
const hasEstimatedEntry = site => Boolean(site.entry || datasets.shore[site.id]);
const hasCoreShape = site => Boolean(site.environment && site.topologies?.length);
const hasProfileField = field => count(site => {
  const value = profiles[site.id]?.[field];
  return Array.isArray(value) ? value.length > 0 : Boolean(value);
});

console.log('Ocean Atlas site completeness');
row('Catalog sites', total);
console.log('\nCore dive facts');
row('Published site depth', count(hasDepth));
row('Entry method', count(site => Boolean(site.entry)));
row('Water environment', count(site => Boolean(site.environment)));
row('Site type / topology', count(site => site.topologies?.length > 0));
row('Difficulty tag', count(site => Boolean(site.difficulty)));
row('Community visibility', count(site => Number.isFinite(site.communityVisibilityMeters)));
row('Community dive duration', count(site => Number.isFinite(site.communityDiveMinutes)));
row('Structured current', count(site => Boolean(site.structuredCurrent)));
row('Structured access / fee', count(site => Boolean(site.structuredAccess || site.structuredFee || site.structuredAccessEase)));
row('Structured entry details', count(site => site.structuredEntryDetails?.length > 0));
row('Structured hazards', count(site => site.structuredHazards?.length > 0));
row('Mooring / descent line', count(site => Boolean(site.structuredMooring)));
row('All four core facts', count(site => hasDepth(site) && site.entry && site.environment && site.topologies?.length));
row('Planning-ready incl. estimates', count(site => hasEstimatedDepth(site) && hasEstimatedEntry(site) && hasCoreShape(site)));

console.log('\nResearch profiles');
row('Any researched profile', count(site => Boolean(profiles[site.id])));
row('Full researched profile', count(site => profiles[site.id] && profiles[site.id].basis !== 'depth'));
row('Depth-only research', count(site => profiles[site.id]?.basis === 'depth'));
for (const [label, field] of [['Summary', 'summary'], ['Visibility', 'vis'], ['Current', 'current'], ['Access', 'access'],
  ['Highlights', 'highlights'], ['Hazards', 'hazards'], ['Mooring', 'mooring'], ['Penetration', 'penetration']]) row(label, hasProfileField(field));

console.log('\nOther per-site enrichment');
for (const [label, records] of Object.entries(datasets)) row(label, count(site => Boolean(records[site.id])));
