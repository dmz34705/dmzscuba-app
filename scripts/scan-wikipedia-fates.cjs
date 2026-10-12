#!/usr/bin/env node
/*
 * Zero-AI research pass: reads the "Ship fate" line of every linked Wikipedia ship article and writes sourced
 * `notDiveSite` evidence for ships that were scrapped, broken up or preserved ashore without ever becoming a wreck
 * (or that were raised and then scrapped). Output: scripts/data/site-research/auto-wikipedia-fate.json, which
 * build-site-research.cjs reads like any agent batch (later agent batches for the same site override it).
 * The quote is the fate line itself; verify it with `node scripts/verify-research-quotes.cjs auto-wikipedia-fate`.
 *
 *   node scripts/scan-wikipedia-fates.cjs [--dry]
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../src');
const out = path.join(__dirname, 'data/site-research/auto-wikipedia-fate.json');
const dry = process.argv.includes('--dry');
const facts = require(path.join(root, 'features/oceanAtlas/data/siteFacts.json')).facts;
const profiles = require(path.join(root, 'features/oceanAtlas/data/siteProfiles.json')).sites;
const { loadSourceModule } = require('./lib/load-source-module.cjs');
const { rawCatalogSites } = loadSourceModule(path.join(root, 'features/oceanAtlas/catalog.js'), root);
const names = new Map(rawCatalogSites().map(site => [site.id, site.name]));
const UA = 'DMZScubaAtlasResearch/1.0 (https://dmzscuba.com; dive-site fact check)';

// Hand-researched profiles are never touched; agent research of the same site overrides this file in the build.
const targets = Object.entries(facts)
  .filter(([id, row]) => /^https:\/\/en\.wikipedia\.org\/wiki\//.test(row[1] || '') && names.has(id) && !(profiles[id] && !profiles[id].researchBatch && profiles[id].basis !== 'depth'))
  .map(([id, row]) => ({ id, url: row[1], title: decodeURIComponent(row[1].split('/wiki/')[1]).replace(/_/g, ' ') }));

const clean = text => text
  .replace(/<ref[^>]*\/>|<ref[^>]*>[\s\S]*?<\/ref>/g, '')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\{\{(?:convert|cvt)\|([\d.,]+)\|([a-z]+)[^}]*\}\}/gi, '$1 $2')
  .replace(/\{\{(?:start date|end date|date|dts)\|([^}]*)\}\}/gi, (_, a) => a.split('|').filter(p => /^\d+$/.test(p)).join(' '))
  .replace(/\{\{[^{}]*\}\}/g, '')
  .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1')
  .replace(/<br\s*\/?>/gi, '; ').replace(/<[^>]+>/g, '').replace(/'''?/g, '')
  .replace(/\s+/g, ' ').replace(/^[\s;,*]+|[\s;,*]+$/g, '');

const SCRAP = /\b(scrapped|broken up|sold for (?:scrap|breaking)|scrapping|demolished)\b/i;
const MUSEUM = /\b(museum ship|preserved as|preserved at|on display)\b/i;
const SINK = /\b(sunk|sank|scuttled|torpedoed|wrecked|foundered|capsized|ran aground|grounded|lost|mined|bombed|exploded|broke)\b/i;
// Ships that sank on the way to the breakers, or left a section behind, are still dived: any article that talks about
// a wreck or divers is left to research.
const DIVED = /\b(divers?|diving|dive site|wreck (?:lies|of|is|was found|site)|wreckage|sank (?:under|while|in)|foundered|midsection|stern section|bow section)\b/i;
const RAISED = /\b(raised|refloated|salvaged)\b/i;
const REEF = /\b(artificial reef|reefed|sunk as (?:a |an )?(?:target|reef)|wreck (?:lies|remains|is))\b/i;
function classify(fate) {
  if (REEF.test(fate)) return null;
  if (SCRAP.test(fate) && (!SINK.test(fate) || RAISED.test(fate))) return 'scrapped';
  if (MUSEUM.test(fate) && !SINK.test(fate)) return 'museum';
  return null;
}

async function fates(titles) {
  const url = `https://en.wikipedia.org/w/api.php?action=query&prop=revisions&rvprop=content&rvslots=main&format=json&formatversion=2&redirects=1&titles=${encodeURIComponent(titles.join('|'))}`;
  let res;
  for (let attempt = 0; attempt < 6; attempt++) {
    res = await fetch(url, { headers: { 'User-Agent': UA, 'Api-User-Agent': UA } });
    if (res.status !== 429 && res.status < 500) break;
    await new Promise(r => setTimeout(r, (Number(res.headers.get('retry-after')) || 5 * 2 ** attempt) * 1000));
  }
  if (!res.ok) throw new Error(`Wikipedia API ${res.status}`);
  const body = await res.json();
  const alias = new Map();
  for (const n of body.query.normalized || []) alias.set(n.from, n.to);
  for (const r of body.query.redirects || []) alias.set(r.from, r.to);
  const text = new Map((body.query.pages || []).map(p => [p.title, p.revisions?.[0]?.slots?.main?.content || '']));
  return title => { let t = title; for (let i = 0; i < 3 && alias.has(t); i++) t = alias.get(t); return text.get(t) || ''; };
}

(async () => {
  const sites = [], counts = { scanned: 0, withFate: 0, scrapped: 0, museum: 0, multipleShips: 0 };
  for (let i = 0; i < targets.length; i += 20) {
    const chunk = targets.slice(i, i + 20);
    const lookup = await fates([...new Set(chunk.map(t => t.title))]);
    for (const t of chunk) {
      counts.scanned++;
      const wikitext = lookup(t.title);
      const lines = [...wikitext.matchAll(/^\s*\|\s*(?:Ship )?fate\s*=\s*(.+)$/gim)].map(m => clean(m[1])).filter(Boolean);
      if (!lines.length) continue;
      counts.withFate++;
      // Articles about several ships (a class, a name shared by many) are ambiguous: leave them to research.
      if (lines.length > 1 || /\{\{\s*Infobox ship class/i.test(wikitext)) { counts.multipleShips++; continue; }
      const fate = lines[0];
      const kind = DIVED.test(wikitext) ? null : classify(fate);
      if (!kind) continue;
      counts[kind]++;
      // The article title and the infobox fate line both appear on the page: together they tie the fate to this ship.
      const quote = `${t.title} … Fate: ${fate.split(/\s+/).slice(0, 36).join(' ')}`;
      sites.push({ id: t.id, name: names.get(t.id),
        sources: { s1: { url: t.url, publisher: 'Wikipedia', kind: 'encyclopedia', quote } },
        notDiveSite: { kind: 'gone', reason: (kind === 'museum' ? 'Preserved, not a wreck: ' : 'Not a wreck: ') + fate.slice(0, 120), refs: ['s1'] } });
    }
    await new Promise(r => setTimeout(r, 1500));
  }
  console.log(`Wikipedia fates: ${JSON.stringify(counts)}`);
  for (const s of sites) console.log(`  ${s.name}: ${s.sources.s1.quote}`);
  if (!dry) fs.writeFileSync(out, JSON.stringify({ batch: 'auto-wikipedia-fate', researchedAt: new Date().toISOString().slice(0, 10), generatedBy: 'scripts/scan-wikipedia-fates.cjs', sites }, null, 1) + '\n');
})().catch(error => { console.error(error); process.exit(1); });
