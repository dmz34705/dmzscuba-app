#!/usr/bin/env node
/*
 * Plans the long-running site research: scripts/data/site-research/queue.json, an ordered list of batches of ~25
 * sites (same country), each with what the catalog already knows so research only fills gaps.
 * A batch is done when scripts/data/site-research/<batch>.json exists. Re-running keeps finished batches.
 *
 *   node scripts/plan-site-research.cjs        then: node scripts/plan-site-research.cjs --next  (prints the next batch)
 */
const fs = require('node:fs');
const path = require('node:path');
const { loadSourceModule } = require('./lib/load-source-module.cjs');

const root = path.resolve(__dirname, '../src');
const dir = path.join(__dirname, 'data/site-research');
const queueFile = path.join(dir, 'queue.json');
// A batch is done when its file exists and accounts for most of its sites (researched, or listed under `skipped`
// with a reason). Older files without a `skipped` list count as done.
const done = name => {
  const file = path.join(dir, `${name}.json`);
  if (!fs.existsSync(file)) return false;
  const evidence = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(evidence.skipped)) return true;
  const queued = JSON.parse(fs.readFileSync(queueFile, 'utf8')).batches.find(b => b.name === name);
  const covered = new Set([...(evidence.sites || []), ...evidence.skipped].map(s => s.id));
  return !queued || covered.size >= 0.8 * queued.sites.length;
};
if (process.argv.includes('--next')) {
  const queue = JSON.parse(fs.readFileSync(queueFile, 'utf8'));
  const next = queue.batches.find(b => !done(b.name));
  console.log(next ? `${next.name} (${next.sites.length} sites) · ${queue.batches.filter(b => done(b.name)).length}/${queue.batches.length} batches done` : 'All batches done.');
  process.exit(0);
}

const C = loadSourceModule(path.join(root, 'features/oceanAtlas/catalog.js'), root);
const P = loadSourceModule(path.join(root, 'features/oceanAtlas/places.js'), root);
const D = name => require(path.join(root, `features/oceanAtlas/data/${name}.json`));
const profiles = D('siteProfiles').sites, facts = D('siteFacts').facts, images = D('siteImages').images;
const fine = D('siteBathymetry').sites, coarse = D('siteSeafloor').sites;

const country = site => { try { return (P.placesForSite(site.id).find(p => p.kind === 'country') || {}).name || 'Unplaced'; } catch { return 'Unplaced'; } };
const place = site => { try { return P.placesForSite(site.id).map(p => p.name).join(', '); } catch { return ''; } };
// Region order agreed with the user; everything else follows, largest first.
const ORDER = [['United States'], ['Egypt', 'Sudan', 'Saudi Arabia', 'Jordan', 'Israel', 'Eritrea', 'Djibouti'],
  ['Indonesia', 'Timor-Leste'], ['Philippines', 'Malaysia', 'Brunei'], ['Maldives', 'Thailand', 'Sri Lanka', 'Myanmar'],
  ['United Kingdom', 'Ireland', 'Isle of Man', 'Guernsey', 'Jersey'], ['Mexico', 'Belize', 'Honduras', 'Bahamas', 'Cayman Islands', 'Bonaire', 'Curaçao', 'Aruba'],
  ['Australia', 'New Zealand', 'Fiji', 'Papua New Guinea', 'Palau', 'Micronesia', 'Solomon Islands', 'Vanuatu', 'French Polynesia']];
const rank = c => { const i = ORDER.findIndex(g => g.includes(c)); return i < 0 ? ORDER.length : i; };

// Sites already covered by any evidence file (agent batches, auto-generated passes) are not planned again.
const researched = new Set(fs.readdirSync(dir).filter(f => f.endsWith('.json') && !['queue.json', 'verified.json'].includes(f))
  .flatMap(f => (JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).sites || []).map(s => s.id)));
// Generic or business names cannot be pinned to one published site (BRIEF rule 9): never queued.
const GENERIC = /^(house ?reef|reef|wreck|dive ?site|site|unnamed|spot)\b|^\W*\d+\W*$|\b(dive (?:centre|center|shop|resort)|diving cent(?:er|re)|resort house ?reef)\b/i;
const sites = C.catalogSites().filter(s => !(profiles[s.id] && profiles[s.id].basis !== 'depth' && !profiles[s.id].researchBatch) && !GENERIC.test(s.name));
const known = s => {
  const p = profiles[s.id], f = fine[s.id] || coarse[s.id];
  return { id: s.id, name: s.name, lat: +s.latitude.toFixed(5), lon: +s.longitude.toFixed(5), place: place(s),
    known: { depthM: p?.depth || (s.maxDepthMeters && !s.depthIsWholeLake ? [null, s.maxDepthMeters] : null), depthSource: p ? 'verified research' : s.depthSource?.name || (s.maxDepthMeters ? 'community map record' : null),
      entry: s.entry || null, types: s.topologies || [], water: s.environment || null, wikipedia: facts[s.id]?.[1] || null },
    seafloorNearPinM: f ? { atPin: f[0], shallowest: f[1], deepest: f[2] } : null,
    mapSource: (s.sources || [])[0]?.sourceUrl || null };
};
// Research pays off where something has been written: verified depths, then sites with an article or photos, then
// by how many dives the community has logged. Pins nobody has logged a dive at are left out (counted, not queued) —
// there is almost never a publisher to cite for them.
const dives = s => s.communityDives || 0;
const tier = s => (profiles[s.id]?.basis === 'depth' ? 0 : facts[s.id] || images[s.id] ? 1 : dives(s) >= 100 ? 2 : dives(s) > 0 ? 3 : 4);
let unlogged = 0;
const finished0 = fs.existsSync(queueFile) ? JSON.parse(fs.readFileSync(queueFile, 'utf8')).batches.filter(b => done(b.name)) : [];
const taken0 = new Set([...finished0.flatMap(b => b.sites.map(s => s.id))].filter(id => id));
for (const id of researched) taken0.add(id);
const groups = new Map();
for (const s of sites) {
  if (taken0.has(s.id)) continue;
  if (tier(s) === 4) { unlogged++; continue; }
  const c = country(s), key = `${tier(s)}|${rank(c)}|${c}`;
  (groups.get(key) || groups.set(key, []).get(key)).push(s);
}
const previous = fs.existsSync(queueFile) ? JSON.parse(fs.readFileSync(queueFile, 'utf8')).batches : [];
const finished = previous.filter(b => done(b.name));
const taken = new Set(finished.flatMap(b => b.sites.map(s => s.id)));
const batches = [...finished];
const slug = t => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const keys = [...groups.keys()].sort((a, b) => { const [ta, ra, ca] = a.split('|'), [tb, rb, cb] = b.split('|'); return ta - tb || ra - rb || groups.get(b).length - groups.get(a).length || ca.localeCompare(cb); });
const TIERS = ['verified-depth', 'notable', 'popular', 'logged'];
for (const key of keys) {
  const [t, , c] = key.split('|');
  // Popular and logged sites: grouped by area (~50 km cells, busiest areas first) so one operator's area guide
  // covers most of a batch — far fewer searches and fetches per site than scattered pins.
  const cell = s => `${Math.round(s.latitude * 2)}|${Math.round(s.longitude * 2)}`;
  const pool = groups.get(key).filter(s => !taken.has(s.id));
  const cellDives = new Map(); for (const s of pool) cellDives.set(cell(s), (cellDives.get(cell(s)) || 0) + dives(s));
  const list = pool.sort(t >= 2 ? (a, b) => cellDives.get(cell(b)) - cellDives.get(cell(a)) || cell(a).localeCompare(cell(b)) || dives(b) - dives(a)
    : (a, b) => a.latitude - b.latitude || a.longitude - b.longitude);
  for (let i = 0; i < list.length; i += 25) {
    let name = `${TIERS[t]}-${slug(c)}-${Math.floor(i / 25) + 1}`;
    while (batches.some(b => b.name === name)) name += 'x';
    batches.push({ name, tier: TIERS[t], country: c, sites: list.slice(i, i + 25).map(known) });
  }
}
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(queueFile, JSON.stringify({ createdAt: new Date().toISOString().slice(0, 10), batches }, null, 0) + '\n');
const count = t => batches.filter(b => b.tier === t).length;
console.log(`${unlogged} pins with no logged dives, article or photos left out.`);
console.log(`${batches.length} batches (${batches.reduce((n, b) => n + b.sites.length, 0)} sites): ${TIERS.map(t => `${t} ${count(t)}`).join(', ')}; ${finished.length} already done.`);
