#!/usr/bin/env node
/*
 * Which protected areas each dive site lies in — marine parks, sanctuaries, reserves, national parks —
 * from OpenStreetMap (© OpenStreetMap contributors, ODbL 1.0) → src/features/oceanAtlas/data/siteProtection.json.
 *
 * A protected area usually means rules: a park fee or dive tag, no gloves or touching, no spearfishing,
 * moorings only, sometimes a permit. The app names the area and links to it; it never states the rules.
 * (WDPA / Protected Planet is not used: its licence forbids commercial use.)
 *
 * Each site is looked up with Overpass `is_in` in batches of 100; answers are cached per batch.
 *
 *   SITE_PROTECTION_CACHE=dir node scripts/build-site-protection.cjs
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { dataDir } = require('./lib/dive-site-import.cjs');
const { loadSourceModule } = require('./lib/load-source-module.cjs');
const { overpassPerSite } = require('./lib/overpass-per-site.cjs');

const MIRRORS = ['https://z.overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter', 'https://lz4.overpass-api.de/api/interpreter']; // busy mirrors answer 504: keep retrying
const CACHE = process.env.SITE_PROTECTION_CACHE || path.join(os.tmpdir(), 'dmz-site-protection');
const BATCH = 100;
const AREA_FILTER = '(area.a["boundary"~"^(protected_area|national_park|marine_protected_area)$"];area.a["leisure"="nature_reserve"];)';

// IUCN categories 1–6, other nature protection (7) and international designations (97–99: World
// Heritage, Ramsar, biosphere). Water-supply, soil, heritage, military and hunting classes say nothing
// to a diver.
const NATURE_CLASS = /^(1a|1b|[1-7]|97|98|99)$/;
// Fishing and zoning layers inside a park: true, but noise on a dive card.
const NOISE = /\b(linefish|fishery|fisheries|fishing|pelagic|trawl|anchorage|shipping|dredg|seafloor protection)\b/i;
const CODE = /^[A-Z]{2,}[\s-]?\d+$/; // "CPZ07"
// A designation with no name ("Marine Protected Area"), and zones that lie outside the park itself.
const GENERIC_NAME = /^(marine )?(protected area|nature reserve|reserve|park|marine park|sanctuary)$/i;
const OUTSIDE = /^aire (d['’]adh[ée]sion|de coop[ée]ration)|\b(buffer zone|zone tampon)\b/i;
const MARINE = /\b(marine|sea|reef|coral|ocean|sanctuary|underwater|diving|bay|lagoon|mar[ií]n[oa]|marin|arrecifes?|perairan|laut)\b/i;

async function overpass(query, key) {
  const file = path.join(CACHE, `${key}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  for (let attempt = 0; attempt < 30; attempt++) {
    for (const url of MIRRORS) {
      const response = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(120_000),
        headers: { 'User-Agent': 'DMZScuba/1.0 (+https://www.dmzscuba.com) protected-area lookup', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}` }).catch(() => null);
      if (!response?.ok) continue;
      const json = await response.json().catch(() => null);
      if (json?.elements && !json.remark?.includes('runtime error')) { fs.writeFileSync(file, JSON.stringify(json.elements)); return json.elements; }
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(60_000, 10_000 * (attempt + 1))));
  }
  throw new Error('All Overpass mirrors failed.');
}

// Designations in plain English; anything else keeps its own wording, tidied.
const DESIGNATIONS = [
  [/^naturschutzgebiet$/i, 'Nature reserve'], [/^landschaftsschutzgebiet$/i, 'Landscape protection area'], [/^(regionaler )?naturpark$/i, 'Nature park'],
  [/^parc naturel marin$/i, 'Marine nature park'], [/^parc naturel r[ée]gional$/i, 'Regional nature park'], [/^r[ée]serve naturelle( nationale| r[ée]gionale)?$/i, 'Nature reserve'],
  [/^(parque|parco|parc) nazionale?$|^parque nacional$|^parc national$|^национальный парк$|^national[ _]park$/i, 'National park'],
  [/^[áa]rea de prote[çc][ãa]o ambiental$/i, 'Environmental protection area'], [/biosph|biósfera|biosfera/i, 'Biosphere reserve'],
  [/^santuario de fauna y flora$/i, 'Wildlife sanctuary'], [/^world[ _]heritage/i, 'World Heritage Site'], [/^spec(ial)?ly protected areas? and wildlife$/i, 'Specially protected area (SPAW)'],
  [/^c(œ|oe)ur$/i, 'National park (core)'],
];
function describe(tags) {
  if (tags.protection_title) {
    const title = tags.protection_title.replace(/_/g, ' ').trim();
    const match = DESIGNATIONS.find(([pattern]) => pattern.test(title));
    return match ? match[1] : title.toLowerCase().replace(/^./, (c) => c.toUpperCase());
  }
  if (tags.boundary === 'national_park') return 'National park';
  if (tags.boundary === 'marine_protected_area') return 'Marine protected area';
  if (tags.leisure === 'nature_reserve') return 'Nature reserve';
  return 'Protected area';
}

async function main() {
  fs.mkdirSync(CACHE, { recursive: true });
  const src = path.join(__dirname, '../src');
  const { catalogSites } = loadSourceModule(path.join(src, 'features/oceanAtlas/catalog.js'), src);
  const sites = catalogSites();
  const areas = new Map(); // area id → row
  const bySite = {};
  {
    // Cached per site: a new or merged site costs one small query, not a re-run of every later batch.
    const elements = await overpassPerSite({ sites, cacheDir: CACHE, batch: BATCH,
      statement: (site) => `make site ref="${site.id}";out;is_in(${site.latitude.toFixed(5)},${site.longitude.toFixed(5)})->.a;${AREA_FILTER};out tags;`,
      overpass: (query) => overpass(query, crypto.createHash('sha1').update(query).digest('hex').slice(0, 16)),
      onProgress: (done, total) => process.stdout.write(`\r${done}/${total} new sites looked up`) });
    let current = null;
    for (const element of elements) {
      if (element.type === 'site') { current = element.tags.ref; continue; }
      const tags = element.tags || {};
      const name = (tags['name:en'] || tags.name || '').trim();
      if (!current || !name || CODE.test(name) || NOISE.test(name) || GENERIC_NAME.test(name) || OUTSIDE.test(name)) continue;
      if (tags.protect_class && !NATURE_CLASS.test(tags.protect_class) && tags.boundary !== 'national_park') continue;
      // Overpass area ids: relation + 3.6e9, way + 2.4e9. Anything else can't be turned back into an element.
      const osmUrl = element.id >= 3600000000 ? `https://www.openstreetmap.org/relation/${element.id - 3600000000}`
        : element.id >= 2400000000 ? `https://www.openstreetmap.org/way/${element.id - 2400000000}`
          : `https://www.openstreetmap.org/search?query=${encodeURIComponent(name)}`;
      if (!areas.has(element.id)) {
        areas.set(element.id, { name, kind: describe(tags), url: /^https?:\/\//.test(tags.website || '') ? tags.website : osmUrl, marine: MARINE.test(`${name} ${tags.protection_title || ''}`) || /marine/.test(tags.protected_area || '') });
      }
      (bySite[current] ||= []).push(element.id);
    }
  }
  // Up to three per site: marine areas first, and drop "Moreton Bay Marine Park (IUCN Cat II Parts)" when
  // "Moreton Bay Marine Park" is already there.
  const spread = new Map();
  for (const ids of Object.values(bySite)) for (const id of new Set(ids)) spread.set(id, (spread.get(id) || 0) + 1);
  const used = new Map();
  const rows = {};
  for (const [siteId, ids] of Object.entries(bySite)) {
    // Marine first, then the most specific: an area holding few sites (a marine reserve) before one holding
    // hundreds (a whole-sea whale sanctuary or World Heritage area).
    const list = [...new Set(ids)].map((id) => [id, areas.get(id)]).sort((a, b) => Number(b[1].marine) - Number(a[1].marine) || spread.get(a[0]) - spread.get(b[0]));
    const kept = [];
    for (const [id, area] of list) {
      if (kept.some(([, other]) => area.name.startsWith(other.name) || other.name.startsWith(area.name))) continue;
      kept.push([id, area]);
      if (kept.length === 3) break;
    }
    rows[siteId] = kept.map(([id]) => { if (!used.has(id)) used.set(id, used.size); return used.get(id); });
  }
  const table = [...used.keys()].map((id) => { const area = areas.get(id); return [area.name, area.kind, area.url]; });
  const out = {
    source: 'OpenStreetMap contributors (ODbL 1.0) via Overpass is_in', sourceUrl: 'https://www.openstreetmap.org/copyright',
    retrievedAt: new Date().toISOString(), fields: { areas: ['name', 'kind', 'url'], sites: 'siteId → area indexes' },
    stats: { sites: Object.keys(rows).length, areas: table.length },
    areas: table, sites: rows,
  };
  fs.writeFileSync(path.join(dataDir, 'siteProtection.json'), JSON.stringify(out));
  console.log(`\n${out.stats.sites} sites inside ${out.stats.areas} protected areas → ${(fs.statSync(path.join(dataDir, 'siteProtection.json')).size / 1024).toFixed(0)} KB`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
