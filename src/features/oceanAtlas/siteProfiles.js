// Researched site profiles (data/siteProfiles.json): per-site facts cross-checked against agency and
// archaeological records, with original summaries and their sources. Regions supply the conditions a
// whole body of water shares (fresh water, the summer thermocline), marked as regional, never site-specific.

const LEVELS = ['beginner', 'intermediate', 'advanced', 'technical'];
const ENTRIES = ['boat', 'shore', 'boat-shore'];
const CURRENTS = ['none', 'light', 'moderate', 'strong', 'variable'];
// Pins whose site is gone (raised, on display ashore) or was never found: not shown as dives.
export const HIDDEN_STATUSES = ['ashore', 'unlocated'];

const num = v => (Number.isFinite(v) ? v : null);
const range = v => (Array.isArray(v) && v.length === 2 && v.some(Number.isFinite) ? [num(v[0]), num(v[1])] : null);
const strings = v => (Array.isArray(v) ? v.filter(s => typeof s === 'string' && s.trim()).map(s => s.slice(0, 160)) : []);
const text = (v, max = 400) => (typeof v === 'string' && v.trim() ? v.slice(0, max) : null);
const pick = (v, allowed) => (allowed.includes(v) ? v : null);

const inBounds = ([south, west, north, east], lat, lon) => lat >= south && lat <= north && lon >= west && lon <= east;
export function profileRegion(data, latitude, longitude) {
  for (const [id, region] of Object.entries(data?.regions || {})) {
    if (Array.isArray(region.bounds) && inBounds(region.bounds, latitude, longitude)) return { id, ...region };
  }
  return null;
}

// Refs are [sourceKey, id?, publisher?]. A '{url}' source (one web page) carries its full https URL as the id.
function sourceLinks(data, refs) {
  return (Array.isArray(refs) ? refs : []).map(([key, id, publisher]) => {
    const source = data?.sources?.[key];
    if (!source) return null;
    const url = source.url === '{url}' ? (/^https:\/\//.test(id || '') ? id : null)
      : source.url ? (source.url.includes('{id}') ? (id ? source.url.replace('{id}', encodeURIComponent(id).replace(/%2C/g, ',')) : null) : source.url) : null;
    return { key, name: typeof publisher === 'string' && publisher ? publisher.slice(0, 80) : source.name, url };
  }).filter(Boolean);
}

// A clean, bounded copy of one site's profile for the card, with the shared conditions of the region its
// (corrected) pin lies in.
export function siteProfile(data, id, latitude, longitude) {
  const row = data?.sites?.[id];
  if (!row || typeof row !== 'object') return null;
  const region = Number.isFinite(latitude) && Number.isFinite(longitude) ? profileRegion(data, latitude, longitude) : null;
  return {
    status: text(row.status, 20) || 'dive',
    depth: range(row.depth),
    depthNote: text(row.depthNote, 200),
    water: pick(row.water, ['fresh', 'salt']),
    entry: pick(row.entry, ENTRIES),
    level: pick(row.level, LEVELS),
    current: pick(row.current, CURRENTS),
    vis: range(row.vis),
    mooring: text(row.mooring, 120),
    penetration: text(row.penetration, 120),
    access: text(row.access, 200),
    highlights: strings(row.highlights).slice(0, 6),
    hazards: strings(row.hazards).slice(0, 6),
    summary: text(row.summary, 400),
    // 'research': a full hand-checked profile; 'depth': a depth confirmed from published sources, nothing more.
    basis: row.basis === 'depth' ? 'depth' : 'research',
    position: row.position && typeof row.position === 'object' ? { quality: text(row.position.quality, 20), movedKm: num(row.position.movedKm) } : null,
    confidence: row.confidence === 'needs-local' ? 'needs-local' : 'sourced',
    sources: sourceLinks(data, row.sources),
    region: region ? regionalConditions(data, region) : null,
  };
}

function regionalConditions(data, region) {
  return {
    name: text(region.name, 60), water: pick(region.water, ['fresh', 'salt']), current: pick(region.current, CURRENTS),
    tempDeepC: range(region.tempDeepC), tempShallowC: range(region.tempShallowC), season: range(region.season),
    notes: strings(region.notes).slice(0, 4), sources: sourceLinks(data, region.sources),
  };
}

// What the map itself needs: corrected pins, depth, entry and water, and which pins to hide.
// [latitude|null, longitude|null, maxDepthMeters|null, entry, fresh(0/1), hidden(0/1)] keyed by site id.
export function siteCorrections(data) {
  const out = {};
  for (const [id, row] of Object.entries(data?.sites || {})) {
    const at = Array.isArray(row.position?.at) && row.position.at.every(Number.isFinite) ? row.position.at : [null, null];
    const max = Array.isArray(row.depth) && Number.isFinite(row.depth[1]) ? row.depth[1] : null;
    out[id] = [at[0], at[1], max, ENTRIES.includes(row.entry) ? row.entry : '', row.water === 'fresh' ? 1 : 0, HIDDEN_STATUSES.includes(row.status) ? 1 : 0];
  }
  return out;
}

// Applied after duplicate merging, in catalog.js and (mirrored) atlasRuntime.js.
export function applySiteCorrections(list, corrections) {
  const hidden = new Set();
  for (const site of list) {
    const row = corrections?.[site.id];
    if (!row) continue;
    const [latitude, longitude, max, entry, fresh, hide] = row;
    if (hide) { hidden.add(site.id); continue; }
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) Object.assign(site, { latitude, longitude });
    if (Number.isFinite(max)) Object.assign(site, { maxDepthMeters: max, depthSource: { name: 'DMZ Scuba research', url: null }, depthIsWholeLake: false });
    if (entry) site.entry = entry;
    if (fresh) site.environment = 'fresh';
    site.researched = true;
  }
  return hidden.size ? list.filter(site => !hidden.has(site.id)) : list;
}

export function validateSiteProfiles(data) {
  if (!data || typeof data !== 'object' || data.schemaVersion !== 1 || !data.sites || typeof data.sites !== 'object' || !data.sources || typeof data.sources !== 'object') return false;
  return Object.values(data.sites).every(row => row && typeof row === 'object' && typeof row.name === 'string' && (typeof row.summary === 'string' || row.basis === 'depth')
    && (row.depth == null || (Array.isArray(row.depth) && row.depth.length === 2))
    && (row.position == null || (typeof row.position === 'object' && (row.position.at == null || (Array.isArray(row.position.at) && row.position.at.length === 2 && Math.abs(row.position.at[0]) <= 90 && Math.abs(row.position.at[1]) <= 180))))
    && (row.sources == null || Array.isArray(row.sources)));
}
