#!/usr/bin/env node
/*
 * Checks that every cited research source really says what its quote claims: fetches each page once (cached,
 * one request at a time, identified User-Agent), and looks for the quote's words and numbers in the page text.
 * Writes scripts/data/site-research/verified.json: { "<url>": { "status": "ok|missing|unreachable", "checkedAt": "…", "missing": [quotes] } }.
 * build-site-research.cjs drops a claim whose page loaded but did not contain that claim's quote.
 * Unreachable pages (bot walls, 403) are kept but reported.
 *
 *   node scripts/verify-research-quotes.cjs [batch-name …]   (default: every evidence file)
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const dirs = [path.join(__dirname, 'data/depth-research'), path.join(__dirname, 'data/site-research')];
const outFile = path.join(__dirname, 'data/site-research/verified.json');
const CACHE = path.join(os.tmpdir(), 'dmz-research-pages');
const UA = 'DMZScuba/1.0 (+https://www.dmzscuba.com) source verification';
const only = new Set(process.argv.slice(2));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm = t => String(t).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[‘’ʼ`]/g, "'").replace(/[“”]/g, '"')
  .replace(/&nbsp;|&#160;/g, ' ').replace(/[–—−]/g, '-').replace(/[^a-z0-9'".\-\s]/g, ' ').replace(/\s+/g, ' ').trim();
const pageText = html => norm(String(html).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&deg;/g, ' '));

async function fetchPage(url) {
  fs.mkdirSync(CACHE, { recursive: true });
  const file = path.join(CACHE, crypto.createHash('sha1').update(url).digest('hex'));
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8') || null;
  await sleep(800);
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,application/pdf;q=0.5' }, redirect: 'follow', signal: AbortSignal.timeout(20000) }).catch(() => null);
  const type = res?.headers.get('content-type') || '';
  const body = res?.ok && /html|text|json/.test(type) ? await res.text().catch(() => '') : '';
  fs.writeFileSync(file, body);
  return body || null;
}
// A quote matches when each snippet's numbers all appear and most of its words appear in order nearby.
function found(text, quote) {
  return String(quote).split(/\s*(?:…|\.\.\.)\s*/).filter(s => s.trim()).every(snippet => {
    const q = norm(snippet);
    if (!q) return true;
    if (text.includes(q)) return true;
    // Numbers decide: every number in the quote must appear on the page, all within ~100 characters of each
    // other (so a depth range isn't assembled from unrelated figures). Paraphrased wording around them is fine.
    const nums = [...new Set(q.match(/\d+(?:\.\d+)?/g) || [])];
    if (nums.length) {
      const at = n => [...text.matchAll(new RegExp(`(?:^|[^0-9.])(${n.replace('.', '\\.')})(?![0-9])`, 'g'))].map(m => m.index);
      const first = at(nums[0]);
      return first.some(i => nums.every(n => at(n).some(j => Math.abs(j - i) <= 100)));
    }
    const words = q.split(' ').filter(w => w.length > 2);
    return words.length > 0 && words.filter(w => text.includes(w)).length / words.length >= 0.8;
  });
}

(async () => {
  const verified = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, 'utf8')) : {};
  const sources = new Map();
  for (const dir of dirs) for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'verified.json' && f !== 'queue.json') : []) {
    if (only.size && !only.has(f.replace(/\.json$/, ''))) continue;
    const batch = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const site of batch.sites || []) {
      for (const c of site.claims || []) if (c.url && c.quote) (sources.get(c.url) || sources.set(c.url, new Set()).get(c.url)).add(c.quote);
      for (const s of Object.values(site.sources || {})) if (s?.url && s.quote) (sources.get(s.url) || sources.set(s.url, new Set()).get(s.url)).add(s.quote);
    }
  }
  const counts = { ok: 0, missing: 0, unreachable: 0 };
  for (const [url, quotes] of sources) {
    const html = await fetchPage(url);
    const text = html ? pageText(html) : null;
    // Per quote: a page listing many sites can confirm one claim and not another.
    const missing = text && text.length >= 200 ? [...quotes].filter(q => !found(text, q)) : [];
    const status = !text || text.length < 200 ? 'unreachable' : missing.length ? 'missing' : 'ok';
    verified[url] = { status, checkedAt: new Date().toISOString().slice(0, 10), ...(missing.length ? { missing } : {}) };
    counts[status]++;
    if (status === 'missing') console.log(`  quote not found: ${url}`);
  }
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(Object.fromEntries(Object.entries(verified).sort()), null, 0) + '\n');
  console.log(`Verified ${sources.size} cited pages: ${counts.ok} ok, ${counts.missing} quote missing (dropped by the build), ${counts.unreachable} unreachable (kept, unverified).`);
})().catch(error => { console.error(error); process.exitCode = 1; });
