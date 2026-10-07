// Researched site profiles (siteProfiles.json): well-formed, sourced, keyed to real sites, and applied the same
// way by the native catalog and the map.
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadSourceModule } = require('./lib/load-source-module.cjs');
const root = path.resolve(__dirname, '../src');
const C = loadSourceModule(path.join(root, 'features/oceanAtlas/catalog.js'), root);
const P = loadSourceModule(path.join(root, 'features/oceanAtlas/siteProfiles.js'), root);
const { buildSiteGuide } = loadSourceModule(path.join(root, 'features/oceanAtlas/siteGuide.js'), root);
const { buildAtlasData } = loadSourceModule(path.join(root, 'features/oceanAtlas/document.js'), root);
const data = require(path.join(root, 'features/oceanAtlas/data/siteProfiles.json'));

assert.ok(P.validateSiteProfiles(data), 'siteProfiles.json passes the update contract');
const raw = new Map(C.rawCatalogSites().map(site => [site.id, site]));
const listed = new Map(C.catalogSites().map(site => [site.id, site]));
const LEVELS = ['beginner', 'intermediate', 'advanced', 'technical'];
for (const [id, row] of Object.entries(data.sites)) {
  assert.ok(raw.has(id), `${id} is a catalog site`);
  assert.equal(raw.get(id).name, row.name, `${id} is still named ${row.name}`);
  assert.ok(row.sources?.length && row.sources.every(([key]) => data.sources[key]), `${row.name}: every fact has a named source`);
  if (row.basis === 'depth') {
    // Depth-only entries (scripts/build-depth-research.cjs): a sourced bottom depth, each source a named web page.
    assert.ok(row.depth?.[1] > 0 && row.sources.every(([key, url, publisher]) => key === 'web' && /^https:\/\//.test(url) && publisher), `${row.name}: sourced depth`);
    continue;
  }
  assert.ok(row.summary.length >= 30 && row.summary.length <= 400, `${row.name}: a one- or two-sentence summary`);
  assert.ok(LEVELS.includes(row.level), `${row.name}: level`);
  assert.ok(['boat', 'shore', 'boat-shore'].includes(row.entry), `${row.name}: entry`);
  if (row.depth) {
    const [top, bottom] = row.depth;
    assert.ok(bottom == null || (bottom > 0 && bottom < 200), `${row.name}: bottom depth`);
    assert.ok(top == null || bottom == null || (top >= 0 && top <= bottom), `${row.name}: top of the site is above the bottom`);
  }
  if (row.position?.at) {
    const [lat, lon] = row.position.at;
    assert.ok(P.profileRegion(data, lat, lon), `${row.name}: corrected position stays in its region`);
    assert.ok(row.position.movedKm > 0.15 && row.position.movedKm < 50, `${row.name}: corrections are real but bounded`);
  }
  const hidden = P.HIDDEN_STATUSES.includes(row.status);
  assert.equal(listed.has(id), !hidden, `${row.name}: ${hidden ? 'gone or never found — no pin' : 'still on the map'}`);
  if (!hidden) {
    const site = listed.get(id);
    if (row.position?.at) assert.deepEqual([site.latitude, site.longitude], row.position.at, `${row.name}: pin moved to the confirmed position`);
    if (row.depth?.[1]) assert.equal(site.maxDepthMeters, row.depth[1], `${row.name}: researched depth is the site's depth`);
    const guide = buildSiteGuide({ id, latitude: site.latitude, longitude: site.longitude, key: id }, {});
    assert.equal(guide.profile?.summary, row.summary, `${row.name}: the card receives the profile`);
    if (row.basis !== 'depth') assert.ok(guide.profile.region?.name === 'Lake Michigan' && guide.profile.region.tempDeepC, `${row.name}: regional conditions attached`);
    assert.ok(guide.profile.sources.every(source => source.name && (source.url === null || /^https:\/\//.test(source.url))), `${row.name}: source links`);
  }
}
// The map applies the same corrections (atlasRuntime.js mirrors applySiteCorrections).
const corrections = buildAtlasData().siteCorrections;
assert.deepEqual(corrections, P.siteCorrections(data), 'The map receives the corrections');
const niagara = listed.get('x-wikipedia-78');
assert.ok(Math.abs(niagara.latitude - 43.4885) < 0.001, 'The Niagara pin sits at the archaeological position off Harrington Beach, not 28 km south');
assert.ok(!listed.has('x-wikipedia-512') && !listed.has('x-wikidata-579'), 'The Alvin Clark (destroyed) and Lottie Cooper (ashore) are not offered as dives');
console.log(`Site profile checks passed: ${Object.values(data.sites).filter(r => r.basis !== 'depth').length} researched sites, ${Object.values(data.sites).filter(r => r.basis === 'depth').length} sourced depths, ${Object.values(data.sites).filter(r => r.position?.at).length} corrected pins, ${Object.values(data.sites).filter(r => P.HIDDEN_STATUSES.includes(r.status)).length} removed, sources and regional conditions.`);
