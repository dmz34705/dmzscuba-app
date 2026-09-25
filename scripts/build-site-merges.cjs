#!/usr/bin/env node
/*
 * The same dive site listed by several sources (OpenDiveMap, OpenStreetMap, NOAA, Wikipedia /
 * Wikidata, the curated lists) → one site. Writes src/features/oceanAtlas/data/siteMerges.json.
 *
 * Two records are the same site when their names agree after folding accents, case and generic
 * words ("Tormentos" = "Tormentos Reef", "Paraíso" = "Paraiso") — never when one is a wreck and the
 * other a reef ("Alligator Reef" ≠ "Alligator Wreck") or their numbers differ ("Wreck 1" ≠ "Wreck 2") —
 * and they lie within the distance their sources' positions can be trusted to (Cozumel's government
 * reef areas are broad; a NOAA mooring is exact).
 *
 * Each cluster keeps one record (the most authoritative name), takes the most precise position and
 * the best-sourced depth, and remembers every other name and source. The app hides the rest.
 *
 *   node scripts/build-site-merges.cjs [--review out.tsv]
 */
const fs = require('node:fs');
const path = require('node:path');
const { loadSourceModule } = require('./lib/load-source-module.cjs');
const { dataDir } = require('./lib/dive-site-import.cjs');

const src = path.join(__dirname, '../src');
const { rawCatalogSites } = loadSourceModule(path.join(src, 'features/oceanAtlas/catalog.js'), src);

const sourceOf = (id) => (id.startsWith('x-') ? id.split('-').slice(0, 2).join('-') : id.split('-')[0]);
// How far apart two records of the same site can be, by how their positions were made.
const RADIUS_KM = { mx: 4, 'x-wikipedia': 2.5, 'x-wikidata': 2, odm: 1.5, geonames: 3, noaa: 0.5, 'x-tbnms': 0.5, osm: 0.8, 'x-curated': 1.5 };
// Whose position to keep: exact moorings and mapped points over broad areas and article pins.
const POSITION_TRUST = { noaa: 7, 'x-tbnms': 7, osm: 5, odm: 4, 'x-curated': 4, 'x-wikidata': 3, 'x-wikipedia': 3, geonames: 2, mx: 1 };
// Whose name and identity to keep: government / curated / encyclopedic over community pins.
const NAME_TRUST = { mx: 7, noaa: 6, 'x-tbnms': 6, 'x-curated': 6, 'x-wikipedia': 5, 'x-wikidata': 5, odm: 3, osm: 3, geonames: 2 };

const GENERIC = new Set(['the', 'a', 'la', 'el', 'le', 'les', 'los', 'las', 'de', 'del', 'des', 'du', 'der', 'die', 'das', 'di', 'da', 'do', 'and', 'y', 'et',
  'reef', 'reefs', 'arrecife', 'recif', 'recife', 'riff', 'site', 'dive', 'diving', 'spot', 'point', 'punta', 'pointe', 'area', 'zone', 'tauchplatz', 'plongee',
  // A wreck's name is the ship's: "SS Wexford" = "Wexford (Wreck)" = "Ottawa (tug)" / "Ottawa".
  'wreck', 'shipwreck', 'wrack', 'wrak', 'epave', 'pecio', 'relitto', 'ss', 'mv', 'ms', 'sv', 'uss', 'hms', 'hmas', 'hmcs', 'usat', 'rms', 'sms', 'tug', 'tugboat', 'schooner', 'barge', 'steamer', 'steamship', 'freighter']);
const WRECK = /\b(wreck|wrack|wrak|shipwreck|pecio|epave|relitto|ss|mv|uss|hms)\b/;
const REEF = /\b(reef|arrecife|recif|recife|riff|wall|pinnacle|cave|cavern|garden|gardens)\b/;
const fold = (name) => String(name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const core = (name) => fold(name).split(' ').filter((token) => token && !GENERIC.has(token));
const numbersIn = (name) => (fold(name).match(/\d+/g) || []).join(',');
// "SS Milwaukee (1902)": a bracketed year only tells ships of one name apart. Two different years are two
// ships ("New Orleans (1838)" ≠ "(1885)"); a year on one side only still matches the plain name.
const yearOnly = (name) => /^\s*[^()]*\((1[5-9]|20)\d{2}\)\s*$/.test(String(name)) && numbersIn(String(name).replace(/\(\d{4}\)/, '')) === '';

// "Great Blue Hole - Belize", "L' Aquarium, Tahiti": a trailing country / state / island name is where
// the site is, not part of its name. Only known place names are dropped ("Shag Rock - Horseshoe" keeps
// its "Horseshoe").
const PLACES = require(path.join(dataDir, 'places.json'));
const PLACE_NAMES = new Set([...PLACES.countries.map((row) => row[1]), ...PLACES.states.map((row) => row[1]), ...PLACES.islands.map((row) => row[0])]
  .map(fold).filter(Boolean).flatMap((name) => [name, name.replace(/ islands?$/, '')]));
function withoutPlace(name) {
  const parts = String(name || '').split(/\s+[-–—]\s+|,\s*/);
  if (parts.length < 2) return name;
  const last = fold(parts[parts.length - 1]).replace(/ islands?$/, '');
  return PLACE_NAMES.has(last) || PLACE_NAMES.has(fold(parts[parts.length - 1])) ? parts.slice(0, -1).join(' - ') : name;
}

function editDistance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = temp;
    }
  }
  return row[b.length];
}

function sameName(rawA, rawB) {
  const a = withoutPlace(rawA), b = withoutPlace(rawB);
  const fa = fold(a), fb = fold(b);
  if (!fa || !fb) return false;
  if (numbersIn(a) !== numbersIn(b) && !((yearOnly(a) && !numbersIn(b)) || (yearOnly(b) && !numbersIn(a)))) return false;
  if ((WRECK.test(fa) && REEF.test(fb) && !WRECK.test(fb)) || (WRECK.test(fb) && REEF.test(fa) && !WRECK.test(fa))) return false;
  const ca = core(a.replace(/\(\d{4}\)/, '')).sort(), cb = core(b.replace(/\(\d{4}\)/, '')).sort(); // word order doesn't matter: "Wazee Lake" = "Lake Wazee"
  if (!ca.length || !cb.length) return false; // "Reef", "Dive site" say nothing
  if (ca.join(' ') === cb.join(' ')) return true;
  // The same words with at most a one-letter slip in a long word ("Colombia" / "Columbia") — but a
  // different word ("Santa Rosa Wall" / "Santa Rosa Shallows", "Tapu" / "Tapu Canyon") is a different site.
  if (ca.length !== cb.length) return false;
  return ca.every((token, i) => token === cb[i] || (token.length >= 6 && cb[i].length >= 6 && editDistance(token, cb[i]) <= 1));
}

function km(a, b) {
  const rad = (v) => v * Math.PI / 180;
  const h = Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

const sites = rawCatalogSites();
// How distinctive a name is: "Manta Point" and "Coral Garden" exist all over the world, so two of
// them 4 km apart are probably different sites; "USAT Liberty" or "Friwen Garden" is one place, and
// community pins for it can be several kilometres off.
const coreKey = (name) => core(withoutPlace(name).replace(/\(\d{4}\)/, '')).sort().join(' ');
const nameCount = new Map();
for (const site of sites) nameCount.set(coreKey(site.name), (nameCount.get(coreKey(site.name)) || 0) + 1);
const RARE_NAME = 4, RARE_RADIUS_KM = 6, RARE_BROAD_RADIUS_KM = 10; // broad = a reef area or an article pin
const BROAD = new Set(['mx', 'x-wikipedia', 'x-wikidata', 'geonames']);
function radiusFor(a, b) {
  const base = Math.max(RADIUS_KM[sourceOf(a.id)] ?? 1, RADIUS_KM[sourceOf(b.id)] ?? 1);
  const key = coreKey(a.name);
  // Only across sources: two pins from the same source, far apart under one name, are usually two
  // real places ("Barco Hundido" — "sunken boat" — or "Terumbu Karang" — "coral reef").
  if (key !== coreKey(b.name) || (nameCount.get(key) || 0) > RARE_NAME || sourceOf(a.id) === sourceOf(b.id)) return base;
  return Math.max(base, BROAD.has(sourceOf(a.id)) || BROAD.has(sourceOf(b.id)) ? RARE_BROAD_RADIUS_KM : RARE_RADIUS_KM);
}
const cells = new Map();
const cellOf = (site) => `${Math.floor(site.latitude * 10)}|${Math.floor(site.longitude * 10)}`;
for (const site of sites) (cells.get(cellOf(site)) || cells.set(cellOf(site), []).get(cellOf(site))).push(site);

// Union-find over matching pairs.
const parent = new Map(sites.map((site) => [site.id, site.id]));
const find = (id) => { while (parent.get(id) !== id) { parent.set(id, parent.get(parent.get(id))); id = parent.get(id); } return id; };
const pairs = [];
for (const site of sites) {
  const [cy, cx] = cellOf(site).split('|').map(Number);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    for (const other of cells.get(`${cy + dy}|${cx + dx}`) || []) {
      if (other.id <= site.id) continue;
      const distance = km(site, other);
      if (distance > radiusFor(site, other) || !sameName(site.name, other.name)) continue;
      // With "wreck" out of the name, "Moonhole" (a reef) and "Moonhole Wreck" must still stay two sites.
      const saysWreck = (x) => WRECK.test(fold(x.name)), isWreck = (x) => saysWreck(x) || x.topologies?.includes('wreck') || /^(ss|mv|ms|sv|hms|hmas|hmcs|uss|usat|sas|rms|sms)\s/i.test(x.name);
      if (saysWreck(site) !== saysWreck(other) && !(isWreck(site) && isWreck(other))) continue;
      pairs.push([site, other, distance]);
      parent.set(find(site.id), find(other.id));
    }
  }
}

// The same encyclopedia article is the same site, however far apart the two sources pin it (Wikipedia and
// Wikidata put the Gallinipper 24 km apart).
const extraRows = require(path.join(dataDir, 'extraSites.json')).sites;
// Compared as titles: Wikidata and Wikipedia percent-encode the same link differently (%27 vs ').
const articleOf = new Map(extraRows.filter((row) => /wikipedia\.org\/wiki\/[^#]+$/.test(row[9] || ''))
  .map((row) => [`x-${row[0]}`, decodeURIComponent(row[9].split('/wiki/')[1]).replace(/_/g, ' ')]));
const byArticle = new Map();
for (const site of sites) {
  const article = articleOf.get(site.id);
  if (!article) continue;
  const first = byArticle.get(article);
  if (!first) { byArticle.set(article, site); continue; }
  const distance = km(first, site);
  if (distance > 60) continue;
  pairs.push([first, site, distance]);
  parent.set(find(first.id), find(site.id));
}
const groups = new Map();
for (const site of sites) { const root = find(site.id); (groups.get(root) || groups.set(root, []).get(root)).push(site); }
const byTrust = (table) => (a, b) => (table[sourceOf(b.id)] ?? 0) - (table[sourceOf(a.id)] ?? 0);
const clusters = [...groups.values()].filter((group) => group.length > 1).map((group) => {
  const keep = [...group].sort(byTrust(NAME_TRUST))[0];
  const position = [...group].sort(byTrust(POSITION_TRUST))[0];
  const depthFrom = [...group].filter((site) => site.maxDepthMeters).sort(byTrust(NAME_TRUST))[0];
  const aliases = [...new Set(group.map((site) => site.name).filter((name) => fold(name) !== fold(keep.name)))];
  return {
    keep, position, group,
    row: [keep.id, group.filter((site) => site.id !== keep.id).map((site) => site.id), Math.round(position.latitude * 1e5) / 1e5, Math.round(position.longitude * 1e5) / 1e5,
      aliases, depthFrom ? depthFrom.maxDepthMeters : null, new Set(group.map((site) => sourceOf(site.id))).size],
  };
});

const out = {
  source: 'scripts/build-site-merges.cjs', generatedAt: new Date().toISOString(),
  fields: ['keepId', 'mergedIds', 'latitude', 'longitude', 'aliases', 'maxDepthMeters', 'independentSources'],
  stats: { sites: sites.length, clusters: clusters.length, hidden: clusters.reduce((sum, c) => sum + c.group.length - 1, 0), multiSource: clusters.filter((c) => c.row[6] > 1).length },
  clusters: clusters.map((c) => c.row).sort((a, b) => a[0].localeCompare(b[0])),
};
fs.writeFileSync(path.join(dataDir, 'siteMerges.json'), JSON.stringify(out));
const reviewAt = process.argv.indexOf('--review');
if (reviewAt !== -1) {
  fs.writeFileSync(process.argv[reviewAt + 1], clusters.map((c) => [c.keep.name, `${c.group.length} records`, c.group.map((site) => `${site.name} [${sourceOf(site.id)}]`).join(' | '),
    `max ${Math.max(...c.group.flatMap((a) => c.group.map((b) => km(a, b)))).toFixed(2)} km`].join('\t')).join('\n'));
}
console.log(`${out.stats.clusters} clusters · ${out.stats.hidden} duplicate records hidden · ${out.stats.multiSource} confirmed by 2+ sources → ${(fs.statSync(path.join(dataDir, 'siteMerges.json')).size / 1024).toFixed(0)} KB`);
