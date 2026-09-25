#!/usr/bin/env node
/*
 * Photos of dive sites themselves → src/features/oceanAtlas/data/siteImages.json.
 * Only openly licensed Wikimedia Commons files (public domain, CC0, CC BY, CC BY-SA), with
 * attribution. Sources, in order of trust:
 *   1. Wikipedia sites: the article's lead image;
 *   2. Wikidata sites and OpenStreetMap sites tagged wikidata=*: the item's image (P18);
 *   3. OpenStreetMap sites tagged image=* / wikimedia_commons=File:*;
 *   4. inland sites and wrecks: Commons photos geotagged within 500 m whose file name shares
 *      a distinctive word with the site name (so a generic lake photo never gets attached).
 *
 *   node scripts/build-site-images.cjs [osm-overpass.json]   (requests cached)
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { dataDir } = require('./lib/dive-site-import.cjs');
const { loadSourceModule } = require('./lib/load-source-module.cjs');

const CACHE_DIR = process.env.SITE_IMAGES_CACHE || path.join(os.tmpdir(), 'dmz-site-images-cache');
const USER_AGENT = 'DMZScuba/1.0 (+https://www.dmzscuba.com) site photos build';
const OPEN = /^(cc0|public domain|pd\b|pdm|cc by(-sa)?( \d(\.\d)?)?$)/i;
const GENERIC = new Set(['lake', 'quarry', 'wreck', 'river', 'park', 'state', 'spring', 'springs', 'beach', 'point', 'reef', 'bay', 'island', 'dive', 'site', 'the', 'and', 'north', 'south', 'east', 'west', 'county', 'harbor', 'harbour', 'national', 'lighthouse', 'pier', 'blue', 'hole', 'cave', 'underwater', 'ship', 'boat', 'steamer', 'schooner', 'tunnel', 'berg', 'strandbad', 'grotte', 'grotta', 'cenote', 'see', 'lac', 'lago', 'wrak', 'wrack', 'entry', 'shore', 'dock', 'marina', 'beach', 'plage', 'playa', 'mine', 'main', 'little', 'great', 'upper', 'lower', 'old', 'new', 'german', 'japanese', 'british', 'french', 'italian', 'destroyer', 'submarine', 'cruiser', 'battleship', 'ferry', 'tanker', 'cargo', 'vessel', 'barge']);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

let last = 0;
async function api(base, params) {
  const url = `${base}?${new URLSearchParams({ format: 'json', ...params })}`;
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, crypto.createHash('sha1').update(url).digest('hex') + '.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  for (let attempt = 0; attempt < 5; attempt++) {
    const wait = last + 350 - Date.now(); if (wait > 0) await sleep(wait); last = Date.now();
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } }).catch(() => null);
    if (response?.ok) { const json = await response.json(); fs.writeFileSync(file, JSON.stringify(json)); return json; }
    await sleep(5000 * (attempt + 1));
  }
  throw new Error(`Failed: ${url.slice(0, 140)}`);
}
const WIKI = 'https://en.wikipedia.org/w/api.php', COMMONS = 'https://commons.wikimedia.org/w/api.php', WIKIDATA = 'https://www.wikidata.org/w/api.php';
const chunks = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));
const fileName = value => { const m = String(value || '').match(/(?:File:|\/wiki\/File:|upload\.wikimedia\.org\/.+\/)([^/?#]+\.(?:jpe?g|png|webp|tiff?))/i); return m ? decodeURIComponent(m[1]).replace(/_/g, ' ') : null; };
const tokens = name => String(name).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/)
  .filter(t => (t.length >= 4 || (/\d/.test(t) && t.length >= 2)) && !GENERIC.has(t));
// The site's own name, without the entry point / area after a comma or dash ("Echtzer See, Tauchereinstieg …").
const squash = text => String(text).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
const headTokens = name => tokens(String(name).split(/\s[-–—]\s|,|\(/)[0]);
// Files whose names say they show something other than the place itself.
const OFF_SUBJECT = /\b(map|karte|plan|logo|coat of arms|wappen|flag|sign|schild|diagram|chart|plaque|stamp|signature|portrait|flower|salbei|orchid|insect|beetle|butterfly|bird|kirche|church|house|haus|station|bahnhof|street|strasse|straße|road|bridge|brücke|steg|tunnel|icicle|eiszapfen|garden|tennis|kraftwerk|kw|panoramio|weg|path|trail|\w*kirche|algae|algen|blaualgen|clouds|sonnenuntergang|sunset|viaducs?|conduite|usine|cluse|hotel|lodge|casa|homes?|camp|banner|fruit|stand|market|shop|store|ekalesia|chapel|temple|mosque|schloss|castle|dam|swan|gull|pelican|dog|squadron)\b/i;
// Same idea for compound words (German especially): church, sage, museum, signpost, street, geese, fish-for-the-pan …
const OFF_SUBJECT_PART = /(kirche|salbei|museum|wegweiser|strasse|straße|gänse|ganse|küchenfertig|kuchenfertig|nachtigall|witch|halloween|lunch|dorfstrasse|ortsmuseum|wanderweg|meise|recycling|container|carrefour|parking|parkplatz|openstreetmap|mapillary|altstadt|imbiss|restaurant|camping|bruecke|bahn|hotel|schloss|kapelle|svan|zollhaus|hund|schrank|wohnhaus|bauernhaus|lakehouse)/i;
// Words that say nothing about what a photo shows (camera/site boilerplate).
const BOILERPLATE = new Set(['geograph', 'panoramio', 'img', 'dsc', 'jpeg', 'cropped', 'photo', 'view', 'from', 'with', 'near', 'jpg', 'png']);
const extraWords = (file, site) => { const own = new Set(tokens(site.name)); return tokens(file.replace(/\.[a-z]+$/i, '')).filter(t => !/\d/.test(t) && !own.has(t) && !BOILERPLATE.has(t)).length; };
// When the site's own name says what it is, the photo's file name must say so too.
const CAVE = /\b(cave|cavern|grotte|grotta|cueva|h[oö]hle|gouffre|cenote)\b/i, WRECK = /\b(wreck|shipwreck|wrak|wrack|[ée]pave|relitto|pecio)\b/i;
const KIND_WORDS = [CAVE, WRECK, /\b(quarry|chwarel|steinbruch|carri[eè]re|cantera)\b/i, /\b(springs?|source|quelle|resurgence|exsurgence)\b/i, /\b(mine|mina|bergwerk)\b/i, /\b(pier|jetty|wharf|steiger|muelle|ponton|dock)\b/i];
// A ship's prefix names the wreck as surely as the word "wreck" ("MV Salem Express 2", "Coral growth on RMS Rhone").
const SHIP = /\b(ss|mv|ms|hms|hmas|hmcs|hmnzs|uss|usat|sas|rms|ship|schiff)\b/i;
const WATER = /(beach|bay|baai|cove|reef|riff|sea\b|see\b|lake|lac\b|lago|harbou?r|pier|jetty|dive|diving|plong|tauch|underwater|coral|island|isla\b|ilha|pulau|strand|playa|praia|plage|point|punta|pointe|rock|cenote|spring|quarry|wreck|cave|lagoon|laguna|shore|coast|marine|ocean|bommie|bucht|baie|\bkey\b|\bcay\b|caye|\bras\b|\bcap\b|cabo|\bkap\b)/i;
const VESSEL_NAME = /\b(tug|tugboat|boat|ship|barge|ferry|yacht|schooner|steamer|freighter|maru)\b/i;

(async () => {
  const src = path.join(__dirname, '../src');
  const { catalogSites, catalogSite } = loadSourceModule(path.join(src, 'features/oceanAtlas/catalog.js'), src);
  const extra = require(path.join(dataDir, 'extraSites.json'));
  const sites = catalogSites();
  const byId = new Map(sites.map(site => [site.id, site]));
  // Every site can have a photo — the same name-match and licence rules apply to reefs as to wrecks.
  const eligible = id => byId.has(id);
  const chosen = new Map(); // siteId → { file, via }
  const namesSite = (id, file, strict) => {
    const site = byId.get(id), have = new Set(tokens(file.replace(/\.[a-z]+$/i, '')));
    const words = strict ? headTokens(site.name) : tokens(site.name);
    if (!words.length) return !strict;
    const head = String(site.name).split(/\s[-–—]\s|,|\(/)[0];
    const text = file.replace(/_/g, ' '), extra = extraWords(file, site);
    // The name says what it is — "Arashi (Wreck)", "Mornington Pier" — so the photo must too: by the word, a
    // ship's prefix for a wreck, or (for a kind named only after the comma / bracket) a file that is just the name.
    const kindsAgree = KIND_WORDS.every(kind => !kind.test(site.name) || kind.test(text) || (kind === WRECK && SHIP.test(text)) || (!kind.test(head) && extra === 0));
    // A wreck or cave photo at a site that is neither shows something else ("Wreck at Heron Island" for a reef).
    const noOtherKind = (!WRECK.test(text) || WRECK.test(site.name) || VESSEL_NAME.test(site.name) || SHIP.test(site.name) || site.topologies?.includes('wreck'))
      && (!CAVE.test(text) || CAVE.test(site.name) || site.topologies?.some(t => /cave|cavern/.test(t)));
    // Off-subject words count only when they aren't the site's own name ("Camp Cove", "Casa Cenote", "Catfish Hotel Sink").
    const offSubject = re => (text.match(new RegExp(re.source, 'gi')) || []).some(w => !site.name.toLowerCase().includes(w.toLowerCase()));
    // A one-word name is often just the town ("Ludwigshafen", "Aruba"): the photo must show the water.
    const townOnly = words.length === 1 && !site.topologies?.includes('wreck') && !WRECK.test(site.name) && !SHIP.test(site.name) && !VESSEL_NAME.test(site.name) && !WATER.test(head);
    return strict ? words.every(w => have.has(w)) && !offSubject(OFF_SUBJECT) && !offSubject(OFF_SUBJECT_PART) && extra <= 5 && kindsAgree && noOtherKind && (!townOnly || WATER.test(text) || extra === 0)
      // File names often run words together ("CarlDBradley_ship", "U1105 1949"): name words may sit inside
      // them, numbers must stand alone (so U-40 never matches a photo of U-37 from 1940).
      : words.some(w => /\d/.test(w) ? new RegExp(`(^|\\D)${w.replace(/\D/g, '')}(\\D|$)`).test(file) : squash(file).includes(w));
  };
  const want = (id, file, via) => {
    if (!file || !eligible(id) || chosen.has(id)) return;
    // Photos only: SVGs are maps and diagrams ("Red Sea topographic map"), PDFs are documents.
    if (!/\.(jpe?g|png|webp|tiff?)$/i.test(file)) { rejected[via] = (rejected[via] || 0) + 1; return; }
    // Articles often lead with a map, a locator, a street scene — or, for a ship, its memorial or plans.
    if (/\b(map|maps|karte|location|locator|diagram|chart|flag|coat of arms|logo|hotels?|street|memorial|monument|plaque|sail plan|lines plan|plant)\b|street|map\d*\b|karte\b/i.test(file.replace(/[_.]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2'))) { rejected[via] = (rejected[via] || 0) + 1; return; }
    if (via !== 'osm' && !namesSite(id, file, via === 'commons-geotag')) { rejected[via] = (rejected[via] || 0) + 1; if (process.env.SITE_IMAGES_REVIEW) console.log(`  skip ${via}: ${byId.get(id).name} ⇐ ${file}`); return; }
    chosen.set(id, { file, via });
  };
  const rejected = {};

  // 1–2 · Wikipedia / Wikidata supplementary sites.
  const wikiTitles = new Map(), qids = new Map();
  for (const [id, , , , , , , , source, url] of extra.sites) {
    const siteId = catalogSite(`x-${id}`)?.id || `x-${id}`; // merged duplicates → the site they became
    if (/en\.wikipedia\.org\/wiki\//.test(url)) wikiTitles.set(decodeURIComponent(url.split('/wiki/')[1]).replace(/_/g, ' '), siteId);
    else if (/wikidata\.org\/(wiki|entity)\/(Q\d+)/.test(url)) qids.set(url.match(/(Q\d+)/)[1], siteId);
  }
  // 3 · OpenStreetMap tags (image, wikimedia_commons, wikidata) from the raw Overpass export.
  const osmFile = process.argv[2];
  if (osmFile && fs.existsSync(osmFile)) {
    for (const element of JSON.parse(fs.readFileSync(osmFile, 'utf8')).elements) {
      const id = catalogSite(`osm-${element.type[0]}${element.id}`)?.id, tags = element.tags || {};
      if (!id || !byId.has(id)) continue;
      want(id, fileName(tags.wikimedia_commons) || fileName(tags.image), 'osm');
      if (/^Q\d+$/.test(tags.wikidata || '') && !chosen.has(id)) qids.set(tags.wikidata, id);
    }
  }
  for (const batch of chunks([...wikiTitles.keys()], 50)) {
    const r = await api(WIKI, { action: 'query', redirects: '1', prop: 'pageimages', piprop: 'name', titles: batch.join('|') });
    const redirect = new Map((r.query?.redirects || []).map(x => [x.to, x.from]));
    for (const page of Object.values(r.query?.pages || {})) if (page.pageimage) want(wikiTitles.get(page.title) || wikiTitles.get(redirect.get(page.title)), page.pageimage, 'wikipedia');
  }
  for (const batch of chunks([...qids.keys()], 50)) {
    const r = await api(WIKIDATA, { action: 'wbgetentities', ids: batch.join('|'), props: 'claims' });
    for (const [qid, entity] of Object.entries(r.entities || {})) {
      const image = entity.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
      if (image) want(qids.get(qid), image, 'wikidata');
    }
  }
  console.log(`${chosen.size} images from Wikipedia / Wikidata / OSM tags`);

  // 4 · Geotagged Commons photos near inland sites and wrecks, only with a distinctive name match.
  const nearby = sites.filter(site => !chosen.has(site.id) && eligible(site.id) && headTokens(site.name).length);
  // Four requests in flight (Commons answers slowly; the shared limiter still spaces request starts).
  let next = 0;
  const worker = async () => { while (next < nearby.length) { const i = next++; await geosearch(nearby[i], i); } };
  const geosearch = async (site, i) => {
    const r = await api(COMMONS, { action: 'query', list: 'geosearch', gscoord: `${site.latitude}|${site.longitude}`, gsradius: '500', gsnamespace: '6', gslimit: '30' });
    // Of the qualifying photos, the one whose title is most nearly just the site's name.
    const match = (r.query?.geosearch || []).filter(hit => namesSite(site.id, hit.title.replace(/^File:/, ''), true))
      .sort((a, b) => extraWords(a.title, site) - extraWords(b.title, site) || a.dist - b.dist)[0];
    if (match) want(site.id, match.title.replace(/^File:/, ''), 'commons-geotag');
    if (i % 200 === 0) console.log(`geosearch ${i}/${nearby.length}`);
  };
  await Promise.all(Array.from({ length: 4 }, worker));

  // Licence and attribution check for every chosen file.
  const files = [...new Set([...chosen.values()].map(c => c.file))];
  const info = new Map();
  for (const batch of chunks(files, 50)) {
    const r = await api(COMMONS, { action: 'query', prop: 'imageinfo', iiprop: 'url|extmetadata', iiurlwidth: '640', titles: batch.map(f => `File:${f}`).join('|') });
    const normal = new Map((r.query?.normalized || []).map(x => [x.to, x.from]));
    for (const page of Object.values(r.query?.pages || {})) {
      const image = page.imageinfo?.[0];
      const license = image?.extmetadata?.LicenseShortName?.value || '';
      if (!image?.thumburl || !OPEN.test(license.trim())) continue;
      // Commons often repeats the name in hidden markup ("Unknown authorUnknown author").
      const artist = String(image.extmetadata?.Artist?.value || 'Unknown').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().replace(/^(.{4,}?)\s*\1/, '$1 ').replace(/\[\d+\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
      const key = (normal.get(page.title) || page.title).replace(/^File:/, '');
      info.set(key, [image.thumburl.split('?')[0], `${artist} · Wikimedia Commons (${license})`, license, image.descriptionurl]);
    }
  }
  console.log('rejected (image does not name the site):', rejected);
  const images = {}, via = {};
  const review = [];
  for (const [id, { file, via: how }] of chosen) {
    const found = info.get(file) || info.get(file.replace(/_/g, ' '));
    if (found) { images[id] = found; via[how] = (via[how] || 0) + 1; review.push(`${how}\t${byId.get(id).name}\t${file}`); }
  }
  fs.writeFileSync(path.join(dataDir, 'siteImages.json'), JSON.stringify({ source: 'Wikimedia Commons (openly licensed files only)', retrievedAt: new Date().toISOString(),
    fields: ['thumbUrl', 'attribution', 'license', 'filePage'], stats: via, images }));
  if (process.env.SITE_IMAGES_REVIEW) fs.writeFileSync(process.env.SITE_IMAGES_REVIEW, review.join('\n'));
  console.log(`${Object.keys(images).length} site photos`, via, `→ ${(fs.statSync(path.join(dataDir, 'siteImages.json')).size / 1024).toFixed(0)} KB`);
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
