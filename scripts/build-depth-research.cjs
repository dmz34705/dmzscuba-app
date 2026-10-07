#!/usr/bin/env node
/*
 * Published depths from per-site research → depth-only entries in src/features/oceanAtlas/data/siteProfiles.json
 *
 * Evidence lives in scripts/data/depth-research/<region>.json (reviewable, not shipped):
 *   { "region": "…", "researchedAt": "YYYY-MM-DD", "sites": [ { "id": "<catalog id>", "name": "<catalog name>",
 *       "claims": [ { "url": "https://…", "publisher": "NOAA Florida Keys NMS", "kind": "agency|park|encyclopedia|operator|press",
 *                     "unit": "ft|m", "top": 60, "bottom": 120, "quote": "lies upright … in 120 feet of water" } ],
 *       "note": "optional depth note shown on the card",
 *       "position": [24.99, -80.38] } ] } // optional agency-confirmed pin correction
 *
 * Rules (docs/SITE_RESEARCH.md):
 *   - facts only: a depth and where it was published; quotes stay here as evidence, never in the app;
 *   - directory databases (PADI Travel, Wannadive, Divebuddy, SSI MyDiveGuide, ScubaBoard, TripAdvisor …) never count;
 *   - one agency / park / sanctuary source is enough; otherwise two independent publishers must agree on the
 *     bottom within max(3 m, 20 %) — the deeper agreeing figure is kept (safer for planning);
 *   - a bottom far deeper than the modelled seafloor around the pin is held back for review (wrong pin or wrong site);
 *   - hand-researched profiles (basis "research") are never overwritten.
 *
 *   node scripts/build-depth-research.cjs [--check]
 */
const fs = require('node:fs');
const path = require('node:path');
const { loadSourceModule } = require('./lib/load-source-module.cjs');

const root = path.resolve(__dirname, '../src');
const dataFile = path.join(root, 'features/oceanAtlas/data/siteProfiles.json');
const evidenceDir = path.join(__dirname, 'data/depth-research');
const FT = 0.3048;
const OFFICIAL = new Set(['agency', 'park']);
const EXCLUDED_HOST = /(^|\.)(padi\.com|wannadive\.net|divesitedirectory\.com|divebuddy\.com|divessi\.com|scubaboard\.com|tripadvisor\.[a-z.]+|zentacle\.com|deepblu\.com|diveadvisor\.com|dive\.site|diveplannerpro\.com|sea-seek\.com|duikersgids\.nl)$/i;
const EXCLUDED_URL = /^https:\/\/(?:www\.)?scubadiving\.com\/dive-sites(?:\/|$)/i;
const check = process.argv.includes('--check');

const { catalogSites } = loadSourceModule(path.join(root, 'features/oceanAtlas/catalog.js'), root);
const sites = new Map(catalogSites().map(site => [site.id, site]));
const bathymetry = require(path.join(root, 'features/oceanAtlas/data/siteBathymetry.json')).sites;
const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
data.sources.web = data.sources.web || { name: 'Published source', url: '{url}' };

const metres = (value, unit) => (Number.isFinite(value) ? Math.round((unit === 'm' ? value : value * FT) * 10) / 10 : null);
const host = url => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };
const agree = (a, b) => Math.abs(a - b) <= Math.max(3, 0.2 * Math.max(a, b));
const distanceKm = (a, b, c, d) => {
  const rad = n => n * Math.PI / 180;
  const x = rad(c - a), y = rad(d - b);
  const h = Math.sin(x / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(y / 2) ** 2;
  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)) * 10) / 10;
};

const accepted = {}, held = [];
const files = fs.existsSync(evidenceDir) ? fs.readdirSync(evidenceDir).filter(f => f.endsWith('.json')).sort() : [];
for (const file of files) {
  const batch = JSON.parse(fs.readFileSync(path.join(evidenceDir, file), 'utf8'));
  for (const entry of batch.sites || []) {
    const site = sites.get(entry.id);
    const reject = reason => held.push(`${file} · ${entry.name || entry.id}: ${reason}`);
    if (!site) { reject('not a catalog site (merged or removed?)'); continue; }
    if (entry.name && entry.name !== site.name) { reject(`name mismatch (catalog: ${site.name})`); continue; }
    if (data.sites[entry.id] && data.sites[entry.id].basis !== 'depth') continue; // hand-researched profile wins
    const claims = (entry.claims || []).map(c => ({ ...c, host: host(c.url), top: metres(c.top, c.unit), bottom: metres(c.bottom, c.unit) }))
      .filter(c => /^https:\/\//.test(c.url) && c.host && !EXCLUDED_HOST.test(c.host) && !EXCLUDED_URL.test(c.url) && Number.isFinite(c.bottom) && c.bottom > 0 && c.bottom < 200 && c.publisher && c.quote);
    if (!claims.length) { reject('no usable claims'); continue; }
    const official = claims.filter(c => OFFICIAL.has(c.kind));
    let chosen;
    if (official.length) chosen = official;
    else {
      // The largest group of independent publishers whose bottoms agree with each other.
      // Anchor at the shallowest claim in a candidate group. This guarantees the
      // deepest and shallowest values agree, so every pair in the group agrees.
      const groups = claims.map(c => claims.filter(o => o.bottom >= c.bottom && agree(o.bottom, c.bottom)));
      const best = groups.map(g => [...new Map(g.map(c => [c.host, c])).values()]).sort((a, b) => b.length - a.length)[0];
      if (best.length < 2) { reject(`needs a second independent source (have: ${claims.map(c => `${c.host} ${c.bottom} m`).join(', ')})`); continue; }
      chosen = best;
    }
    const bottom = Math.max(...chosen.map(c => c.bottom));
    const tops = chosen.map(c => c.top).filter(Number.isFinite);
    const top = tops.length ? Math.min(...tops) : null;
    if (top != null && top > bottom) { reject(`top ${top} m is below bottom ${bottom} m`); continue; }
    const floor = bathymetry[entry.id];
    if (floor && Number.isFinite(floor[2]) && bottom > floor[2] + Math.max(10, 0.5 * floor[2])) { reject(`${bottom} m is far deeper than the seafloor around the pin (≤ ${floor[2]} m) — check the pin`); continue; }
    accepted[entry.id] = {
      name: site.name, status: 'dive', basis: 'depth', depth: [top, bottom],
      ...(entry.note ? { depthNote: String(entry.note).slice(0, 200) } : {}),
      ...(Array.isArray(entry.position) && entry.position.length === 2 && Math.abs(entry.position[0]) <= 90 && Math.abs(entry.position[1]) <= 180
        ? { position: { at: entry.position, quality: 'agency', movedKm: distanceKm(site.latitude, site.longitude, entry.position[0], entry.position[1]) } }
        : {}),
      sources: [...new Map(chosen.map(c => [c.url, ['web', c.url, c.publisher]])).values()].slice(0, 3),
      confidence: 'sourced', checked: batch.researchedAt || null,
    };
  }
}

const before = Object.values(data.sites).filter(row => row.basis === 'depth').length;
for (const [id, row] of Object.entries(data.sites)) if (row.basis === 'depth' && !accepted[id]) delete data.sites[id];
Object.assign(data.sites, accepted);
data.sites = Object.fromEntries(Object.entries(data.sites).sort(([a], [b]) => a.localeCompare(b)));
data.updatedAt = new Date().toISOString().slice(0, 10);
for (const line of held) console.log(`  held: ${line}`);
console.log(`${Object.keys(accepted).length} researched depths accepted (${before} before), ${held.length} held for review, from ${files.length} evidence files.`);
if (!check) fs.writeFileSync(dataFile, JSON.stringify(data, null, 1) + '\n');
