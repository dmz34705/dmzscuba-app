// Overpass lookups for many dive sites, cached per site rather than per batch: adding or merging a
// site then costs one small query instead of re-querying every batch after it (Overpass mirrors are
// slow and often busy). Returns the same flat element stream a batched query would — a
// `{ type: 'site', tags: { ref } }` marker followed by that site's elements — so callers parse it as before.
const fs = require('node:fs');
const path = require('node:path');

async function overpassPerSite({ sites, statement, overpass, cacheDir, batch = 100, header = '[out:json][timeout:180];', onProgress }) {
  fs.mkdirSync(cacheDir, { recursive: true });
  const file = path.join(cacheDir, 'per-site.json');
  const cache = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  // The statement is part of the key, so changing what is asked re-asks it.
  const keyOf = site => `${statement(site)}`;
  const missing = sites.filter(site => !cache[keyOf(site)]);
  for (let start = 0; start < missing.length; start += batch) {
    const chunk = missing.slice(start, start + batch);
    const elements = await overpass(`${header}\n${chunk.map(statement).join('\n')}`);
    const byRef = new Map(chunk.map(site => [site.id, []]));
    let current = null;
    for (const element of elements) {
      if (element.type === 'site') { current = byRef.has(element.tags?.ref) ? element.tags.ref : null; continue; }
      if (current) byRef.get(current).push(element);
    }
    for (const site of chunk) cache[keyOf(site)] = byRef.get(site.id);
    fs.writeFileSync(file, JSON.stringify(cache));
    onProgress?.(Math.min(start + batch, missing.length), missing.length);
  }
  return sites.flatMap(site => [{ type: 'site', tags: { ref: site.id } }, ...cache[keyOf(site)]]);
}

module.exports = { overpassPerSite };
