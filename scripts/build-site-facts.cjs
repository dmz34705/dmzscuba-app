#!/usr/bin/env node
/*
 * Open facts for dive sites that have a Wikipedia article or Wikidata item →
 * src/features/oceanAtlas/data/siteFacts.json (sent to the site card by the app, not bundled into the map).
 *
 *   - a short summary: the first sentences of the English Wikipedia article's lead (CC BY-SA 4.0 —
 *     shown with credit and a link, and marked as an excerpt);
 *   - for ships and wrecks, their history from Wikidata (CC0): type, builder, flag, dimensions,
 *     tonnage and dated events (launched, commissioned, sunk …).
 *
 * Sites come from the supplementary Wikipedia / Wikidata imports and OpenStreetMap sites tagged
 * wikipedia= / wikidata=; merged duplicates resolve to the site they became.
 *
 *   node scripts/build-site-facts.cjs [osm-overpass.json]   (requests cached)
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { dataDir } = require('./lib/dive-site-import.cjs');
const { loadSourceModule } = require('./lib/load-source-module.cjs');

const CACHE_DIR = process.env.SITE_FACTS_CACHE || path.join(os.tmpdir(), 'dmz-site-facts-cache');
const USER_AGENT = 'DMZScuba/1.0 (+https://www.dmzscuba.com) site facts build';
const WIKI = 'https://en.wikipedia.org/w/api.php', WIKIDATA = 'https://www.wikidata.org/w/api.php';
const SUMMARY_MAX = 420;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let last = 0;
async function api(base, params) {
  const url = `${base}?${new URLSearchParams({ format: 'json', ...params })}`;
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const file = path.join(CACHE_DIR, crypto.createHash('sha1').update(url).digest('hex') + '.json');
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  for (let attempt = 0; attempt < 5; attempt++) {
    const wait = last + 300 - Date.now(); if (wait > 0) await sleep(wait); last = Date.now();
    const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } }).catch(() => null);
    if (response?.ok) { const json = await response.json(); fs.writeFileSync(file, JSON.stringify(json)); return json; }
    await sleep(4000 * (attempt + 1));
  }
  throw new Error(`Failed: ${url.slice(0, 140)}`);
}
const chunks = (list, size) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

// The lead's first sentences, cut at a sentence end — never mid-sentence.
function summaryOf(extract) {
  const text = String(extract || '').replace(/\s*\([^()]*\)/g, '').replace(/\s+/g, ' ').trim(); // drop pronunciations / conversions in brackets
  if (!text) return '';
  // Split at sentence ends, but not after abbreviations or initials ("U.S. state", "St. Lucia", "J. L. Thompson").
  const sentences = [];
  let start = 0;
  const re = /[.!?](\s+)(?=[A-Z"“(])/g;
  let m;
  while ((m = re.exec(text))) {
    const before = text.slice(start, m.index + 1);
    const lastWord = (before.match(/(\S+)$/) || [''])[0];
    if (/^(?:[A-Z]\.)+$|^(?:[A-Z][a-z]{0,2}\.)$|^(?:St|Mt|Dr|Mr|Mrs|No|Nos|Co|Inc|Ltd|vs|approx|ca|Capt|Lt|Gen|Adm)\.$/.test(lastWord)) continue;
    sentences.push(before + m[1]); start = m.index + 1 + m[1].length;
  }
  if (start < text.length) sentences.push(text.slice(start));
  let out = '';
  for (const sentence of sentences) {
    if ((out + sentence).length > SUMMARY_MAX) break;
    out += sentence;
    if (out.length > 160 && out.split(/[.!?]\s/).length >= 2) break;
  }
  const summary = (out || sentences[0].slice(0, SUMMARY_MAX)).trim();
  // An article about a town or district says nothing about the diving there — leave it out.
  return /\b(?:is|are) (?:an?|the|two|one of the) (?:[\w-]+ ){0,4}?(?:city|town|village|municipality|barangays?|governorate|district|province|county|parish|commune|settlement|capital|suburb|neighbourhood|neighborhood|census-designated place)\b/i.test(sentences[0] || '') ? '' : summary;
}

const quantity = (claims, property) => {
  const value = claims?.[property]?.[0]?.mainsnak?.datavalue?.value;
  if (!value?.amount) return null;
  const amount = Math.abs(Number(value.amount));
  const unit = String(value.unit).split('/').pop();
  return { amount, unit: { Q11573: 'm', Q3710: 'ft', Q128822: 'kn', Q11570: 'kg', Q191118: 't' }[unit] || '' };
};
const itemId = (claims, property) => claims?.[property]?.[0]?.mainsnak?.datavalue?.value?.id || null;
const year = (time) => (String(time || '').match(/^[+-](\d{1,4})-/) || [])[1] || null;

(async () => {
  const src = path.join(__dirname, '../src');
  const { catalogSite } = loadSourceModule(path.join(src, 'features/oceanAtlas/catalog.js'), src);
  const extra = require(path.join(dataDir, 'extraSites.json'));
  const titles = new Map(), qids = new Map();
  const link = (map, key, id) => { if (!key || !id) return; if (!map.has(key)) map.set(key, new Set()); map.get(key).add(id); };
  for (const [id, , , , , , , , , url] of extra.sites) {
    const siteId = catalogSite(`x-${id}`)?.id;
    if (/en\.wikipedia\.org\/wiki\//.test(url)) link(titles, decodeURIComponent(url.split('/wiki/')[1]).replace(/_/g, ' '), siteId);
    else if (/wikidata\.org\/(wiki|entity)\/Q\d+/.test(url)) link(qids, url.match(/Q\d+/)[0], siteId);
  }
  const osmFile = process.argv[2];
  if (osmFile && fs.existsSync(osmFile)) {
    for (const element of JSON.parse(fs.readFileSync(osmFile, 'utf8')).elements) {
      const siteId = catalogSite(`osm-${element.type[0]}${element.id}`)?.id, tags = element.tags || {};
      if (!siteId) continue;
      if (/^en:/.test(tags.wikipedia || '')) link(titles, tags.wikipedia.slice(3), siteId);
      else if (/^Q\d+$/.test(tags.wikidata || '')) link(qids, tags.wikidata, siteId);
    }
  }

  // 1 · Article leads (+ each article's Wikidata item).
  const facts = new Map(); // siteId → { summary, url, qid }
  for (const batch of chunks([...titles.keys()], 20)) {
    const r = await api(WIKI, { action: 'query', redirects: '1', prop: 'extracts|pageprops', exintro: '1', explaintext: '1', exlimit: '20', ppprop: 'wikibase_item|disambiguation', titles: batch.join('|') });
    const back = new Map([...(r.query?.normalized || []), ...(r.query?.redirects || [])].map((x) => [x.to, x.from]));
    for (const page of Object.values(r.query?.pages || {})) {
      if (page.missing !== undefined || page.pageprops?.disambiguation !== undefined) continue;
      let title = page.title; while (!titles.has(title) && back.has(title)) title = back.get(title);
      const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`;
      for (const siteId of titles.get(title) || []) {
        facts.set(siteId, { summary: summaryOf(page.extract), url, title: page.title, qid: page.pageprops?.wikibase_item || null });
        if (page.pageprops?.wikibase_item) link(qids, page.pageprops.wikibase_item, siteId);
      }
    }
  }

  // 2 · Ship / wreck history from Wikidata.
  const entities = new Map();
  for (const batch of chunks([...qids.keys()], 50)) {
    const r = await api(WIKIDATA, { action: 'wbgetentities', ids: batch.join('|'), props: 'claims|sitelinks', sitefilter: 'enwiki' });
    for (const [qid, entity] of Object.entries(r.entities || {})) entities.set(qid, entity);
  }
  const SHIP_PROPS = ['P176', 'P8047', 'P2043', 'P2261', 'P1093', 'P793'];
  const isShip = (claims) => SHIP_PROPS.filter((property) => claims?.[property]).length >= 2;
  // Sites known only by their Wikidata item still get a summary from its English article.
  const needSummary = [...qids.keys()].filter((qid) => entities.get(qid)?.sitelinks?.enwiki?.title && [...qids.get(qid)].some((siteId) => !facts.get(siteId)?.summary));
  for (const batch of chunks(needSummary, 20)) {
    const byTitle = new Map(batch.map((qid) => [entities.get(qid).sitelinks.enwiki.title, qid]));
    const r = await api(WIKI, { action: 'query', redirects: '1', prop: 'extracts', exintro: '1', explaintext: '1', exlimit: '20', titles: [...byTitle.keys()].join('|') });
    for (const page of Object.values(r.query?.pages || {})) {
      const qid = byTitle.get(page.title);
      if (!qid || !page.extract) continue;
      const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, '_'))}`;
      for (const siteId of qids.get(qid)) if (!facts.get(siteId)?.summary) facts.set(siteId, { summary: summaryOf(page.extract), url, title: page.title, qid });
    }
  }
  const labelIds = new Set();
  for (const entity of entities.values()) {
    if (!isShip(entity.claims)) continue;
    for (const property of ['P176', 'P8047']) { const id = itemId(entity.claims, property); if (id) labelIds.add(id); }
    for (const claim of entity.claims.P31 || []) if (claim.mainsnak?.datavalue?.value?.id) labelIds.add(claim.mainsnak.datavalue.value.id);
    for (const claim of entity.claims.P793 || []) if (claim.mainsnak?.datavalue?.value?.id) labelIds.add(claim.mainsnak.datavalue.value.id);
  }
  const labels = new Map();
  for (const batch of chunks([...labelIds], 50)) {
    const r = await api(WIKIDATA, { action: 'wbgetentities', ids: batch.join('|'), props: 'labels', languages: 'en' });
    for (const [qid, entity] of Object.entries(r.entities || {})) if (entity.labels?.en?.value) labels.set(qid, entity.labels.en.value);
  }
  const EVENT_WORD = { 'ship launching': 'Launched', 'ship commissioning': 'Commissioned', 'ship decommissioning': 'Decommissioned', shipwreck: 'Wrecked', shipwrecking: 'Wrecked', sinking: 'Sank', scuttling: 'Scuttled', 'maiden voyage': 'Maiden voyage' };
  const history = new Map();
  for (const [qid, entity] of entities) {
    const claims = entity.claims;
    if (!isShip(claims)) continue;
    const events = (claims.P793 || []).map((claim) => {
      const label = labels.get(claim.mainsnak?.datavalue?.value?.id) || '';
      const when = year(claim.qualifiers?.P585?.[0]?.datavalue?.value?.time);
      return label && when ? [EVENT_WORD[label.toLowerCase()] || label[0].toUpperCase() + label.slice(1), when] : null;
    }).filter(Boolean).sort((a, b) => Number(a[1]) - Number(b[1]));
    const tonnage = quantity(claims, 'P1093');
    history.set(qid, {
      // Its kind of ship, not "shipwreck" / "ship".
      type: (claims.P31 || []).map((claim) => labels.get(claim.mainsnak?.datavalue?.value?.id)).find((label) => label && !/^(shipwreck|ship|wreck|historic site|archaeological site)$/i.test(label)) || '', builder: labels.get(itemId(claims, 'P176')) || '', flag: labels.get(itemId(claims, 'P8047')) || '',
      length: quantity(claims, 'P2043'), beam: quantity(claims, 'P2261'), tonnage: tonnage ? { amount: tonnage.amount, unit: 'GT' } : null, events,
      wikidata: `https://www.wikidata.org/wiki/${qid}`,
    });
  }

  const out = {};
  for (const [qid, siteIds] of qids) {
    for (const siteId of siteIds) {
      const entry = facts.get(siteId) || {};
      const ship = history.get(entry.qid || qid) || history.get(qid);
      if (!entry.summary && !ship) continue;
      out[siteId] = [entry.summary || '', entry.url || '', ship ? [ship.type, ship.builder, ship.flag, ship.length, ship.beam, ship.tonnage, ship.events, ship.wikidata] : null];
    }
  }
  for (const [siteId, entry] of facts) if (!out[siteId] && entry.summary) out[siteId] = [entry.summary, entry.url, null];
  const stats = { sites: Object.keys(out).length, summaries: Object.values(out).filter((row) => row[0]).length, shipHistories: Object.values(out).filter((row) => row[2]).length };
  fs.writeFileSync(path.join(dataDir, 'siteFacts.json'), JSON.stringify({
    source: 'Wikipedia article leads (CC BY-SA 4.0, excerpted with credit) and Wikidata (CC0)', retrievedAt: new Date().toISOString(),
    fields: ['summary', 'articleUrl', 'ship: [type, builder, flag, length, beam, tonnage, events, wikidataUrl]'], stats, facts: out,
  }));
  console.log(stats, `→ ${(fs.statSync(path.join(dataDir, 'siteFacts.json')).size / 1024).toFixed(0)} KB`);
})().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
