#!/usr/bin/env node
/*
 * Site research → automated entries in src/features/oceanAtlas/data/siteProfiles.json (regenerated in full each run).
 *
 * Reads two kinds of reviewable evidence (never shipped):
 *   scripts/data/depth-research/<batch>.json  — depth-only claims (format in build-depth-research.cjs history / SITE_RESEARCH.md)
 *   scripts/data/site-research/<batch>.json   — full site research:
 *     { "batch": "…", "researchedAt": "YYYY-MM-DD", "sites": [ {
 *         "id": "<catalog id>", "name": "<catalog name>",
 *         "sources": { "s1": { "url": "https://…", "publisher": "…", "kind": "agency|park|encyclopedia|operator|press",
 *                              "quote": "verbatim evidence from the page, ≤ 40 words (may hold several snippets joined by ' … ')" } },
 *         "depth": [ { "ref": "s1", "unit": "ft|m", "top": 15, "bottom": 60 } ],        // same agreement rules as depths
 *         "entry":   { "value": "boat|shore|boat-shore", "refs": ["s1"] },
 *         "types":   { "value": ["reef", "wall"], "refs": ["s1"] },                       // reef wall wreck pinnacle cave cavern muck drift
 *         "level":   { "value": "beginner|intermediate|advanced|technical", "refs": ["s1"] },
 *         "current": { "value": "none|light|moderate|strong|variable", "refs": ["s1"] },
 *         "vis":     { "low": 10, "high": 30, "unit": "m|ft", "refs": ["s2"] },
 *         "waterTemp": { "low": 24, "high": 29, "unit": "C|F", "note": "e.g. spring-fed, constant", "refs": ["s1"] },
 *         "season":  { "from": 3, "to": 10, "refs": ["s1"] },                             // months 0–11, site-specific best season
 *         "mooring": { "value": "short text", "refs": [] }, "access": { "value": "permits, fees, park rules", "refs": [] },
 *         "penetration": { "value": "short text", "refs": [] },
 *         "highlights": [ { "text": "≤ 60 chars", "refs": ["s1"] } ], "hazards": [ { "text": "≤ 60 chars", "refs": ["s2"] } ],
 *         "summary": { "text": "1–2 sentences in our own words, ≤ 300 chars", "refs": ["s1", "s2"] },
 *         "position": [lat, lon],     // optional, only from an agency/park source
 *         "notDiveSite": { "kind": "gone|unlocated|restricted|area|too-deep", "reason": "…", "refs": ["s1"] } // hides the pin
 *       } ] }
 *
 * Acceptance (docs/SITE_RESEARCH.md):
 *   - every fact cites ≥ 1 allowed source that carries a quote; directory databases never count;
 *   - depth: one agency/park claim, or two independent publishers agreeing within max(3 m, 20 %), deeper figure kept,
 *     and not far deeper than the modelled seafloor at the pin;
 *   - summary: ≥ 2 independent publishers or 1 official source, and it must be our own words — no run of 8+ words
 *     shared with any stored quote;
 *   - a site gets a full profile (basis "research") when its summary is accepted, otherwise a depth-only entry.
 * Hand-researched profiles (basis "research" without "researchBatch") are never touched.
 *
 *   node scripts/build-site-research.cjs [--check] [--verbose]
 */
const fs = require('node:fs');
const path = require('node:path');
const { loadSourceModule } = require('./lib/load-source-module.cjs');

const root = path.resolve(__dirname, '../src');
const dataFile = path.join(root, 'features/oceanAtlas/data/siteProfiles.json');
const depthDir = path.join(__dirname, 'data/depth-research');
const siteDir = path.join(__dirname, 'data/site-research');
const FT = 0.3048;
const OFFICIAL = new Set(['agency', 'park']);
const KINDS = new Set(['agency', 'park', 'encyclopedia', 'operator', 'press']);
const EXCLUDED_HOST = /(^|\.)(padi\.com|wannadive\.net|divesitedirectory\.com|divebuddy\.com|divessi\.com|scubaboard\.com|tripadvisor\.[a-z.]+|zentacle\.com|deepblu\.com|diveadvisor\.com|dive\.site|diveplannerpro\.com|sea-seek\.com|duikersgids\.nl|airguide\.info|shorediving\.com)$/i;
const EXCLUDED_URL = /^https:\/\/(?:www\.)?scubadiving\.com\/dive-sites(?:\/|$)/i;
const LEVELS = ['beginner', 'intermediate', 'advanced', 'technical'];
const ENTRIES = ['boat', 'shore', 'boat-shore'];
const CURRENTS = ['none', 'light', 'moderate', 'strong', 'variable'];
const TYPES = ['reef', 'wall', 'wreck', 'pinnacle', 'cave', 'cavern', 'muck', 'drift'];
const check = process.argv.includes('--check');
const verbose = process.argv.includes('--verbose');

// Match evidence against the catalog BEFORE research corrections: a pin this build hid last time (or moved) must
// still be found, or its entry would be dropped and the pin would flip back on the next run.
const { rawCatalogSites, applySiteMerges } = loadSourceModule(path.join(root, 'features/oceanAtlas/catalog.js'), root);
const siteMerges = require(path.join(root, 'features/oceanAtlas/data/siteMerges.json'));
const sites = new Map(applySiteMerges(rawCatalogSites().map(site => ({ ...site })), siteMerges).sites.map(site => [site.id, site]));
const bathymetry = require(path.join(root, 'features/oceanAtlas/data/siteBathymetry.json')).sites;
const seafloor = require(path.join(root, 'features/oceanAtlas/data/siteSeafloor.json')).sites;
const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
data.sources.web = data.sources.web || { name: 'Published source', url: '{url}' };

const metres = (value, unit) => (Number.isFinite(value) ? Math.round((unit === 'm' ? value : value * FT) * 10) / 10 : null);
const celsius = (value, unit) => (Number.isFinite(value) ? Math.round((unit === 'F' ? (value - 32) * 5 / 9 : value) * 10) / 10 : null);
const host = url => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };
// Pages that loaded but did not contain their quote (scripts/verify-research-quotes.cjs) never count.
const verifiedFile = path.join(siteDir, 'verified.json');
const verified = fs.existsSync(verifiedFile) ? JSON.parse(fs.readFileSync(verifiedFile, 'utf8')) : {};
const usable = s => s && !(verified[s.url]?.missing || []).includes(s.quote) && /^https:\/\//.test(s.url || '') && host(s.url) && !EXCLUDED_HOST.test(host(s.url)) && !EXCLUDED_URL.test(s.url)
  && typeof s.publisher === 'string' && s.publisher.trim() && KINDS.has(s.kind) && typeof s.quote === 'string' && s.quote.trim().length >= 3;
const agree = (a, b) => Math.abs(a - b) <= Math.max(3, 0.2 * Math.max(a, b));
const distanceKm = (a, b, c, d) => {
  const rad = n => n * Math.PI / 180, x = rad(c - a), y = rad(d - b);
  const h = Math.sin(x / 2) ** 2 + Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(y / 2) ** 2;
  return Math.round(6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)) * 10) / 10;
};
const words = t => String(t).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
// Our own words: no run of 8 words shared with any quoted source text.
function copiedRun(summary, quotes) {
  const s = words(summary);
  const grams = new Set(); for (const q of quotes) { const w = words(q); for (let i = 0; i + 8 <= w.length; i++) grams.add(w.slice(i, i + 8).join(' ')); }
  for (let i = 0; i + 8 <= s.length; i++) if (grams.has(s.slice(i, i + 8).join(' '))) return s.slice(i, i + 8).join(' ');
  return null;
}

// Depth from claims [{ url, publisher, kind, unit, top, bottom, quote }] — shared by both evidence formats.
function acceptDepth(id, claims) {
  const list = claims.map(c => ({ ...c, host: host(c.url), top: metres(c.top, c.unit), bottom: metres(c.bottom, c.unit) }))
    .filter(c => usable(c) && Number.isFinite(c.bottom) && c.bottom > 0 && c.bottom < 200);
  if (!list.length) return { reason: 'no usable depth claims' };
  const official = list.filter(c => OFFICIAL.has(c.kind));
  let chosen;
  if (official.length) chosen = official;
  else {
    const groups = list.map(c => list.filter(o => o.bottom >= c.bottom && agree(o.bottom, c.bottom)));
    const best = groups.map(g => [...new Map(g.map(c => [c.host, c])).values()]).sort((a, b) => b.length - a.length)[0];
    if (best.length < 2) return { reason: `depth needs a second independent source (have: ${list.map(c => `${c.host} ${c.bottom} m`).join(', ')})` };
    chosen = best;
  }
  const bottom = Math.max(...chosen.map(c => c.bottom));
  const tops = chosen.map(c => c.top).filter(Number.isFinite);
  const top = tops.length ? Math.min(...tops) : null;
  if (top != null && top > bottom) return { reason: `top ${top} m is below bottom ${bottom} m` };
  const floor = bathymetry[id];
  if (floor && Number.isFinite(floor[2]) && bottom > floor[2] + Math.max(10, 0.5 * floor[2])) return { reason: `${bottom} m is far deeper than the seafloor around the pin (≤ ${floor[2]} m) — check the pin` };
  return { depth: [top, bottom], sources: chosen };
}

const out = {}, held = [];
const positionFrom = (site, at) => (Array.isArray(at) && at.length === 2 && Math.abs(at[0]) <= 90 && Math.abs(at[1]) <= 180
  ? { position: { at, quality: 'agency', movedKm: distanceKm(site.latitude, site.longitude, at[0], at[1]) } } : {});
const sourceRefs = list => [...new Map(list.map(s => [s.url, ['web', s.url, s.publisher]])).values()];
const owned = row => row.basis === 'depth' || Boolean(row.researchBatch);
const handProfile = id => data.sites[id] && !owned(data.sites[id]);
const files = dir => (fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.json') && !['verified.json', 'queue.json'].includes(f)).sort() : []);
const known = (file, entry, reject) => {
  const site = sites.get(entry.id);
  if (!site) { reject('not a catalog site (merged or removed?)'); return null; }
  if (entry.name && entry.name !== site.name) { reject(`name mismatch (catalog: ${site.name})`); return null; }
  return handProfile(entry.id) ? null : site;
};

// 1. Depth-only evidence.
for (const file of files(depthDir)) {
  const batch = JSON.parse(fs.readFileSync(path.join(depthDir, file), 'utf8'));
  for (const entry of batch.sites || []) {
    const reject = reason => held.push(`depth-research/${file} · ${entry.name || entry.id}: ${reason}`);
    const site = known(file, entry, reject); if (!site) continue;
    const result = acceptDepth(entry.id, entry.claims || []);
    if (!result.depth) { reject(result.reason); continue; }
    out[entry.id] = { name: site.name, status: 'dive', basis: 'depth', depth: result.depth,
      ...(entry.note ? { depthNote: String(entry.note).slice(0, 200) } : {}), ...positionFrom(site, entry.position),
      sources: sourceRefs(result.sources).slice(0, 3), confidence: 'sourced', checked: batch.researchedAt || null };
  }
}

// 2. Full site research (overrides depth-only results for the same site).
const stats = { sites: 0, full: 0, depth: 0, vis: 0, current: 0, entry: 0, level: 0, temp: 0, highlights: 0, hazards: 0 };
for (const file of files(siteDir)) {
  const batch = JSON.parse(fs.readFileSync(path.join(siteDir, file), 'utf8'));
  for (const entry of batch.sites || []) {
    const notes = [];
    const reject = reason => held.push(`site-research/${file} · ${entry.name || entry.id}: ${reason}`);
    const site = known(file, entry, reject); if (!site) continue;
    stats.sites++;
    const sources = Object.fromEntries(Object.entries(entry.sources || {}).filter(([, s]) => usable(s)));
    const cited = refs => (Array.isArray(refs) ? refs.filter(r => sources[r]).map(r => sources[r]) : []);
    const field = (f, ok) => { if (!f) return null; const c = cited(f.refs); if (!c.length) { notes.push(`${ok}: no allowed source`); return null; } return c; };
    const row = { name: site.name, status: 'dive', basis: 'depth', researchBatch: file.replace(/\.json$/, ''), checked: batch.researchedAt || null };
    // Not a dive site (raised or buried, never found, closed/restricted, a whole lake or park, ROV-only depth):
    // with a cited source and a reason, the pin is hidden from the map.
    if (entry.notDiveSite) {
      const c = cited(entry.notDiveSite.refs), status = { gone: 'ashore', unlocated: 'unlocated', restricted: 'restricted', area: 'area', 'too-deep': 'too-deep' }[entry.notDiveSite.kind];
      if (c.length && status && typeof entry.notDiveSite.reason === 'string' && entry.notDiveSite.reason.trim()) {
        out[entry.id] = { name: site.name, status, basis: 'depth', researchBatch: row.researchBatch, checked: row.checked,
          reason: entry.notDiveSite.reason.trim().slice(0, 160), sources: sourceRefs(c).slice(0, 3), confidence: 'sourced' };
        stats.hidden = (stats.hidden || 0) + 1;
      } else reject('notDiveSite needs a kind (gone|unlocated|restricted|area|too-deep), a reason and a cited source');
      continue;
    }
    const used = new Map();
    const use = list => list.forEach(s => used.set(s.url, s));
    // Depth.
    const depthClaims = (entry.depth || []).map(d => ({ ...sources[d.ref], unit: d.unit, top: d.top, bottom: d.bottom })).filter(c => c.url);
    const result = depthClaims.length ? acceptDepth(entry.id, depthClaims) : null;
    if (result?.depth) { row.depth = result.depth; use(result.sources); stats.depth++; }
    else if (result) notes.push(result.reason);
    // A depth already verified from depth-only evidence stays when this batch adds none (or only unconfirmed ones).
    if (!row.depth && out[entry.id]?.depth) { row.depth = out[entry.id].depth; if (out[entry.id].depthNote) row.depthNote = out[entry.id].depthNote; (out[entry.id].sources || []).forEach(([, url, publisher]) => used.set(url, { url, publisher })); }
    if (entry.depthNote) row.depthNote = String(entry.depthNote).slice(0, 200);
    // Simple facts: one allowed source each.
    const pickFact = (key, allowed, target = key) => { const f = entry[key]; const c = field(f, key); if (c && allowed.includes(f.value)) { row[target] = f.value; use(c); stats[key] = (stats[key] || 0) + 1; } };
    pickFact('entry', ENTRIES); pickFact('level', LEVELS); pickFact('current', CURRENTS);
    if (entry.types) { const c = field(entry.types, 'types'); const v = (entry.types.value || []).filter(t => TYPES.includes(t)); if (c && v.length) { row.types = v; use(c); } }
    if (entry.vis) { const c = field(entry.vis, 'vis'); const lo = metres(entry.vis.low, entry.vis.unit || 'm'), hi = metres(entry.vis.high, entry.vis.unit || 'm');
      if (c && Number.isFinite(hi) && hi > 0 && hi <= 80 && (lo == null || lo <= hi)) { row.vis = [lo, hi]; use(c); stats.vis++; } }
    if (entry.waterTemp) { const c = field(entry.waterTemp, 'waterTemp'); const u = entry.waterTemp.unit === 'F' ? 'F' : 'C'; const lo = celsius(entry.waterTemp.low, u), hi = celsius(entry.waterTemp.high, u);
      if (c && Number.isFinite(hi) && hi > -3 && hi < 40 && (lo == null || lo <= hi)) { row.waterTempC = [lo, hi]; if (entry.waterTemp.note) row.tempNote = String(entry.waterTemp.note).slice(0, 120); use(c); stats.temp++; } }
    if (entry.season) { const c = field(entry.season, 'season'); const { from, to } = entry.season; if (c && [from, to].every(m => Number.isInteger(m) && m >= 0 && m <= 11)) { row.season = [from, to]; use(c); } }
    for (const key of ['mooring', 'access', 'penetration']) { const c = field(entry[key], key); if (c && typeof entry[key].value === 'string') { row[key] = entry[key].value.slice(0, key === 'access' ? 200 : 120); use(c); } }
    for (const key of ['highlights', 'hazards']) {
      const items = (entry[key] || []).filter(i => typeof i?.text === 'string' && i.text.trim() && cited(i.refs).length).slice(0, 6);
      if (items.length) { row[key] = items.map(i => i.text.trim().slice(0, 80)); items.forEach(i => use(cited(i.refs))); stats[key]++; }
    }
    // Summary: our own words, from at least two independent publishers or one official source.
    if (entry.summary?.text) {
      const c = cited(entry.summary.refs), hosts = new Set(c.map(s => host(s.url)));
      const copied = copiedRun(entry.summary.text, Object.values(sources).map(s => s.quote));
      if (copied) notes.push(`summary copies source wording ("${copied}")`);
      else if (!(hosts.size >= 2 || c.some(s => OFFICIAL.has(s.kind)))) notes.push('summary needs two independent publishers or one official source');
      else if (entry.summary.text.length > 320) notes.push('summary too long');
      else { row.summary = entry.summary.text.trim(); row.basis = 'research'; row.water = row.water || (site.environment === 'fresh' ? 'fresh' : undefined); use(c); stats.full++; }
    }
    Object.assign(row, positionFrom(site, entry.position));
    if (!row.summary && !row.depth) { reject(`nothing accepted${notes.length ? ` (${notes.join('; ')})` : ''}`); continue; }
    if (notes.length && verbose) held.push(`site-research/${file} · ${entry.name}: partial — ${notes.join('; ')}`);
    if (!row.water) delete row.water;
    row.sources = sourceRefs([...used.values()]).slice(0, 5);
    row.confidence = 'sourced';
    out[entry.id] = row;
  }
}

// A coastal town, island or park pin (diveable water within reach) stays on the map when it is the only marker
// within 20 km: hiding it would leave a known dive destination with no pin at all. Whole seas and inland towns go.
const hiddenNow = id => ['ashore', 'unlocated', 'restricted', 'area', 'too-deep'].includes((out[id] || data.sites[id])?.status);
for (const [id, row] of Object.entries(out)) {
  if (row.status !== 'area') continue;
  const at = sites.get(id);
  const floor = bathymetry[id] || seafloor[id];
  if (!(floor && Number.isFinite(floor[1]) && floor[1] <= 40)) continue;
  const neighbour = [...sites.values()].some(s => s.id !== id && !hiddenNow(s.id) && distanceKm(at.latitude, at.longitude, s.latitude, s.longitude) < 20);
  if (!neighbour) { delete out[id]; stats.hidden--; held.push(`site-research/${row.researchBatch}.json · ${row.name}: area pin kept — no other site within 20 km`); }
}

const before = Object.values(data.sites).filter(owned).length;
for (const [id, row] of Object.entries(data.sites)) if (owned(row)) delete data.sites[id];
Object.assign(data.sites, out);
data.sites = Object.fromEntries(Object.entries(data.sites).sort(([a], [b]) => a.localeCompare(b)));
data.updatedAt = new Date().toISOString().slice(0, 10);
for (const line of held) console.log(`  held: ${line}`);
const full = Object.values(out).filter(r => r.basis === 'research').length;
console.log(`${Object.keys(out).length} automated entries (${full} full profiles, ${Object.keys(out).length - full} depth-only; ${before} before), ${held.length} held, from ${files(depthDir).length} depth + ${files(siteDir).length} site evidence files.`);
console.log(`site research: ${JSON.stringify(stats)}`);
if (!check) fs.writeFileSync(dataFile, JSON.stringify(data, null, 1) + '\n');
