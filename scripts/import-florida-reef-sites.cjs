#!/usr/bin/env node
/*
 * Government reef-program sites for the Jupiter, Florida coverage area → rows in
 * src/features/oceanAtlas/data/extraSites.json (source keys `pbc` and `fwc`).
 *
 *   1. Palm Beach County ERM "Natural and Artificial Reef Sites" (county open data, public record,
 *      provided "as is"): named natural reefs, wrecks and artificial reefs with active/inactive status
 *      and the material deployed. Inactive reefs (buried or removed) are skipped.
 *   2. FWC Artificial Reef Locations in Florida (FWC-FWRI open data; attribution requested): every
 *      deployment with its depth. Used for depths of the county's reefs and, outside Palm Beach County
 *      (Martin County: Jupiter Island to Stuart), as sites of their own.
 *
 * Neither source is a mooring or navigation position; every row says so in its note.
 * Co-located deployments (a pile of culverts on a rock pile) become one site, except that two wrecks
 * are never folded together. Reefs deeper than 100 m (deep reef darts) are left out.
 * Records of a site another source already lists (the Amaryllis on Wikipedia, Phil Foster on
 * OpenStreetMap) are kept: scripts/build-site-merges.cjs joins them with both sources.
 *
 * Other importers' rows in extraSites.json are left untouched; rerunning replaces only `pbc`/`fwc` rows.
 *
 *   node scripts/import-florida-reef-sites.cjs && node scripts/build-site-merges.cjs
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { metres, similar, dataDir } = require('./lib/dive-site-import.cjs');

const USER_AGENT = 'DMZScuba/1.0 (+https://www.dmzscuba.com) dive-site import';
const CACHE_DIR = process.env.EXTRA_SITES_CACHE || path.join(os.tmpdir(), 'dmz-extra-sites-cache');
const outputPath = path.join(dataDir, 'extraSites.json');
// The Jupiter, Florida region in regions.js: [south, west, north, east].
const [SOUTH, WEST, NORTH, EAST] = [26.6, -80.2, 27.25, -79.85];
const MAX_DEPTH_M = 100;
const PBC = 'https://maps.co.palm-beach.fl.us/arcgis/rest/services/OpenData/Environment_Open_Data/MapServer/0/query';
const PBC_PAGE = 'https://opendata2-pbcgov.opendata.arcgis.com/datasets/PBCGOV::natural-and-artificial-reef-sites/about';
const FWC = 'https://gis.myfwc.com/mapping/rest/services/Open_Data/Artificial_Reef_Locations_in_Florida/MapServer/12/query';
const FWC_PAGE = 'https://geodata.myfwc.com/datasets/artificial-reefs-in-florida/about';
// The source link and the not-a-fix caveat are the same for every row: they live on the source (the app
// falls back to them), which keeps 200+ rows inside the atlas page's 2 MB budget.
const NOT_A_FIX = 'not a mooring or navigation fix — dive it with a local operator.';
const SOURCES = {
  pbc: { name: 'Palm Beach County Environmental Resources Management · Natural and Artificial Reef Sites', license: 'Public record (Palm Beach County open data)',
    url: PBC_PAGE, note: `Palm Beach County reef-program position, ${NOT_A_FIX}` },
  fwc: { name: 'Florida Fish and Wildlife Conservation Commission (FWC-FWRI) · Artificial Reef Locations', license: 'Public record (FWC open data; attribution to FWC-FWRI)',
    url: FWC_PAGE, note: `FWC artificial-reef deployment position, ${NOT_A_FIX}` },
};

async function cachedJson(url) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, crypto.createHash('sha1').update(url).digest('hex') + '.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } }).catch(() => null);
    if (response?.ok) {
      const json = await response.json();
      if (!json.error) { fs.writeFileSync(file, JSON.stringify(json)); return json; }
    }
    await new Promise(resolve => setTimeout(resolve, 4000 * (attempt + 1)));
  }
  throw new Error(`Failed: ${url}`);
}
const query = (base, params) => cachedJson(`${base}?${new URLSearchParams({ outFields: '*', outSR: '4326', f: 'json', resultRecordCount: '2000', ...params })}`);

// "ANDREW 'RED' HARRIS JUNO ROCK" → "Andrew 'Red' Harris Juno Rock"; agency abbreviations stay upper case,
// county shorthand is spelled out ("PB North NS Reef" → "Palm Beach North Nearshore Reef").
const UPPER = /^(ARHF|DHR|FDOT|JSS|PBCFF|PBFF|PBC\d*|FWC|PEP|RBM|BJM\d*|KD|LC\d*|FP&L|II|III|IV)$/;
const WORDS = { NS: 'Nearshore', 'MIT.': 'Mitigation', MIT: 'Mitigation', RCK: 'Rock', PL: 'Pile', NA: '', PB: 'Palm Beach', TOPB: 'Town of Palm Beach',
  WPB: 'West Palm Beach', N: 'North', S: 'South', E: 'East', W: 'West', NE: 'Northeast', NW: 'Northwest', SE: 'Southeast', SW: 'Southwest' };
const cleanName = raw => String(raw).replace(/_/g, ' · ').replace(/\s*-Fla\. Special-\s*/gi, ' ').replace(/Tetrehedron/gi, 'Tetrahedron')
  .replace(/(\S)\(/g, '$1 (').replace(/,(?=\S)/g, ', ').replace(/(\D)#/g, '$1 #').replace(/\bMG ?111\b/i, 'MG-111').replace(/\bPC ?1174\b/i, 'PC-1174')
  .replace(/^PI /i, 'Peanut Island ').replace(/^PHIL FOSTER SNORKEL/i, 'Phil Foster Park Snorkel').replace(/\s+/g, ' ').trim();
function displayName(raw) {
  const name = cleanName(raw);
  return name.split(' ').map((word, i, all) => {
    const upper = word.toUpperCase();
    if (upper in WORDS && (upper.length > 1 || i > 0 || all.length > 1)) return WORDS[upper];
    if (UPPER.test(upper) || /^(MG|PC)-\d+$/.test(upper)) return upper;
    if (/^\d+(ST|ND|RD|TH)$/.test(upper)) return upper.toLowerCase();
    if (/^[A-Z]\d|^\d/.test(upper)) return upper;
    return word.toLowerCase().replace(/(^|[\s(/"'-])([a-z])/g, (m, a, b) => a + b.toUpperCase()).replace(/'S\b/g, "'s")
      .replace(/^Mc([a-z])/, (m, c) => `Mc${c.toUpperCase()}`).replace(/^Macpark$/, 'MacArthur Park');
  }).filter(Boolean).join(' ');
}
// A vessel is a ship sunk as a reef ("1 SHIP (64' TUG)", "ONE 65' BARGE") — not "one 500T barge load" of rock.
const isVessel = text => /\b\d+ SHIPS?\b|\d+(\.\d+)?'\s*(\w+\s){0,2}(ship|barge|tug|tugboat|freighter|tanker|yacht|ferry|sailboat|vessel|patrol craft)\b/i.test(text);
// The county's notes are upper case; these are the names in them.
const PROPER = ['Celtic Crusader', 'Pocahontas', 'USS Fredonia', 'Jenny G', 'Conrad', 'King Neptune', 'Palm Beach County Diving Association', 'Skip and Cathy Commagere',
  'Derek Beckel', 'Virgil Price III', 'Flagler', 'Jed Carrier', 'Aquagenex', "Murphy's", 'Reef Institute', 'Reefmaker', 'Florida', 'LCM'];
const prose = text => PROPER.reduce((out, name) => out.replace(new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), name), String(text).toLowerCase()
  .replace(/\s*-?\s*ignore material quantity/, '').replace(/\btonss\b/g, 'tons').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').replace(/\s+,/g, ',').replace(/\s+/g, ' ').trim()
  .replace(/\.+$/, ''));

(async () => {
  const box = `${WEST},${SOUTH},${EAST},${NORTH}`;
  const pbcJson = await query(PBC, { where: '1=1', geometry: box, geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects' });
  const fwcJson = await query(FWC, { where: `Lat_DD>${SOUTH} AND Lat_DD<${NORTH} AND Long_DD>${WEST} AND Long_DD<${EAST}` });
  const fwc = fwcJson.features.map(({ attributes: a }) => ({ id: a.DeployID, name: String(a.Name || '').trim(), latitude: a.Lat_DD, longitude: a.Long_DD,
    depthFt: Number(a.Depth) || 0, county: a.County, material: String(a.MatDescrip || a.MatCat || '').trim(), vessel: a.MatCat === 'Vessel' }))
    .filter(r => r.name && Number.isFinite(r.latitude) && Number.isFinite(r.longitude));
  const stats = { pbcFetched: pbcJson.features.length, pbcInactive: 0, fwcFetched: fwc.length, tooDeep: 0, folded: 0 };

  const sites = [];
  // 1 · Palm Beach County reefs, depth from the FWC deployment at the same place (same name preferred).
  for (const { attributes: a, geometry: g } of pbcJson.features) {
    if (/INACTIVE/i.test(a.REEF_STATUS || '')) { stats.pbcInactive++; continue; }
    const site = { name: displayName(a.FNAME), latitude: Number(g.y.toFixed(5)), longitude: Number(g.x.toFixed(5)), source: 'pbc', notes: String(a.NOTES || '').replace(/\s+/g, ' ').trim(), tons: Number((String(a.NOTES || '').replace(/,/g, '').match(/(\d+)\s*T(ONS?)?\b/i) || [])[1]) || 0,
      natural: /natural/i.test(a.REEF_TYPE || ''), mitigation: /mitigation/i.test(a.REEF_TYPE || '') };
    site.vessel = !site.natural && isVessel(site.notes);
    const near = fwc.map(r => ({ r, d: metres(site, r) })).filter(({ r, d }) => r.county === 'Palm Beach' && (d <= 80 || (d <= 300 && similar(r.name, site.name))));
    const match = near.find(({ r }) => similar(r.name, site.name)) || near.sort((x, y) => x.d - y.d)[0];
    site.depthM = match ? Math.round(match.r.depthFt * 0.3048) : 0;
    sites.push(site);
  }
  // 2 · FWC deployments outside Palm Beach County (the county's own list is the fuller one there).
  for (const r of fwc.filter(r => r.county !== 'Palm Beach')) {
    const name = /^(\d+) South County$/i.test(r.name) ? `South County Reef Site ${r.name.match(/\d+/)[0]}`
      : /^South County Site (\d+)$/i.test(r.name) ? `South County Reef Site ${r.name.match(/\d+/)[0]}`
      : /^Site \d+$/i.test(r.name) ? `${r.county} County Reef ${r.name}` : cleanName(r.name);
    sites.push({ name, latitude: Number(r.latitude.toFixed(5)), longitude: Number(r.longitude.toFixed(5)), source: 'fwc', notes: r.material,
      natural: false, vessel: r.vessel, depthM: Math.round(r.depthFt * 0.3048), county: r.county, fwcId: r.id });
  }

  // One site per place: co-located deployments (within 40 m) fold into the most substantial one — never two
  // wrecks — and so does the same reef deployed on several days or patches (FWC lists each) within 3 km.
  const kept = [];
  const rank = site => [Number(site.vessel), Number(site.natural), site.tons || 0, Number(Boolean(site.depthM))];
  const before = (a, b) => { const x = rank(a), y = rank(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return y[i] - x[i]; return 0; };
  const base = name => name.toLowerCase().replace(/\b(reef|site|patch|#?\d+|north|south|east|west|center|centre|[a-c])\b|["()#]/g, ' ').replace(/\s+/g, ' ').trim();
  for (const site of sites.sort(before)) {
    if (site.depthM > MAX_DEPTH_M) { stats.tooDeep++; continue; }
    const host = kept.find(k => k.source === site.source && ((metres(k, site) <= 40 && !(k.vessel && site.vessel))
      || (metres(k, site) <= 3000 && site.source === 'fwc' && k.vessel === site.vessel && base(k.name) === base(site.name))));
    if (host) { if (base(host.name) !== base(site.name)) host.also.push(site.name); host.depthM = host.depthM || site.depthM; stats.folded++; continue; }
    kept.push({ ...site, also: [] });
  }
  // The row's own note: what is there. The source adds where the position comes from.
  const describe = site => {
    const kind = site.natural ? 'Natural reef' : site.mitigation ? 'Mitigation reef' : site.vessel ? 'Wreck' : 'Artificial reef';
    const material = site.natural ? '' : prose(site.source === 'fwc' ? site.notes.replace(/\s*\(\d+\+?\)\s*$/, '') : site.notes.replace(/\b1 SHIP \(([^)]*)\)/i, '$1'));
    const also = site.also.length ? ` Also here: ${[...new Set(site.also)].join(', ')}.` : '';
    return `${kind}${material ? `: ${material}` : ''}.${also}`;
  };
  const slug = name => name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’"]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const TOPOLOGY = JSON.parse(fs.readFileSync(outputPath, 'utf8')).topologyCodes;
  const mask = codes => codes.reduce((m, code) => m | (1 << TOPOLOGY.indexOf(code)), 0);
  // Shore dives: the county's snorkel trails, pier and park reefs, and its nearshore (beach) reefs.
  const shore = site => /snorkel|pier|phil foster|blue heron|peanut island|coral cove|kelsey|kreusler|nearshore/i.test(site.name) && site.depthM <= 10;
  const ids = new Set();
  const rows = kept.sort((a, b) => b.latitude - a.latitude).map(site => {
    let id = `${site.source}-${slug(site.name)}`;
    for (let n = 2; ids.has(id); n++) id = `${site.source}-${slug(site.name)}-${n}`;
    ids.add(id);
    return [id, site.name.slice(0, 80), site.latitude, site.longitude, site.depthM || 0, shore(site) ? 2 : site.depthM >= 12 || site.vessel ? 1 : 0,
      mask(site.vessel ? ['wreck'] : ['reef']), 0, site.source, '', describe(site)];
  });

  const extra = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
  const others = extra.sites.filter(row => !(row[8] in SOURCES));
  extra.sites = [...others, ...rows];
  extra.sources = { ...extra.sources, ...SOURCES };
  extra.stats = { ...extra.stats, floridaReefs: { ...stats, pbc: rows.filter(r => r[8] === 'pbc').length, fwc: rows.filter(r => r[8] === 'fwc').length, retrievedAt: new Date().toISOString() } };
  fs.writeFileSync(outputPath, JSON.stringify(extra));
  console.log(JSON.stringify(extra.stats.floridaReefs, null, 1), `→ ${rows.length} Jupiter-region reef sites, ${(fs.statSync(outputPath).size / 1024).toFixed(0)} KB`);
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
