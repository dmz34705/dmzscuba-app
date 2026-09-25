// Type-ahead for a plan's dive site: the diver's own pinned sites and every Ocean Atlas site,
// best matches first, each with the broader area it's in ("Palancar Gardens · Cozumel, Mexico").
import { catalogSites } from '../oceanAtlas/catalog';
import { placesForSite } from '../oceanAtlas/places';

const fold = (text) => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’'`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

let index = null;
function catalogIndex() {
  if (!index) index = catalogSites().map((site) => ({ site, names: [site.name, ...(site.aliases || [])].map(fold) }));
  return index;
}

function score(names, query, words) {
  let best = 0;
  for (const name of names) {
    if (name === query) return 5;
    if (name.startsWith(query)) best = Math.max(best, 4);
    else if (words.every((word) => name.split(' ').some((part) => part.startsWith(word)))) best = Math.max(best, 3);
    else if (name.includes(query)) best = Math.max(best, 2);
  }
  return best;
}

// Region and country when the catalog has them; otherwise the island, US state or country the site lies in.
export function siteArea(site) {
  const listed = [site.region, site.country].map((part) => String(part || '').trim()).filter(Boolean);
  if (listed.length) return [...new Set(listed)].join(', ');
  try {
    const places = placesForSite(site.id);
    const island = places.find((p) => p.kind === 'island'), state = places.find((p) => p.kind === 'state'), country = places.find((p) => p.kind === 'country');
    return [...new Set([island?.name, state?.name, country?.name].filter(Boolean))].slice(0, 2).join(', ');
  } catch {
    return '';
  }
}

export function searchDiveSites(text, mySites = [], limit = 7) {
  const query = fold(text);
  if (query.length < 2) return [];
  const words = query.split(' ');
  const mine = mySites.map((site) => ({ site, value: score([fold(site.name)], query, words) })).filter((hit) => hit.value)
    .map(({ site, value }) => ({ value: value + 0.5, result: { id: site.id, name: site.name, area: 'My site', latitude: site.latitude, longitude: site.longitude, custom: true } }));
  const listed = [];
  for (const entry of catalogIndex()) {
    const value = score(entry.names, query, words);
    if (value) listed.push({ value, entry });
  }
  // Better matches first; among equals, sites several sources agree on, then shorter names.
  listed.sort((a, b) => b.value - a.value || (b.entry.site.independentSources || 1) - (a.entry.site.independentSources || 1) || a.entry.site.name.length - b.entry.site.name.length);
  const catalog = listed.slice(0, limit).map(({ value, entry: { site } }) => ({ value, result: { id: site.id, name: site.name, area: siteArea(site), latitude: site.latitude, longitude: site.longitude, custom: false } }));
  return [...mine, ...catalog].sort((a, b) => b.value - a.value).slice(0, limit).map((hit) => hit.result);
}
