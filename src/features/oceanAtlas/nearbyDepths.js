// "Sites nearby: typically 18–30 m" — for a site with no published depth, the depths published for
// other sites of the same water (salt or fresh) within NEARBY_KM. The middle half of their range when
// there are enough to trim the extremes, otherwise all of it. A lake's deepest point is never used:
// it isn't a dive depth.
import { catalogSites } from './catalog';
import { isInland } from './inland';

export const NEARBY_KM = 25;
const MIN_SITES = 3;
const CELL_DEG = 0.25;

let index = null;
function buildIndex() {
  index = new Map();
  for (const site of catalogSites()) {
    if (!site.maxDepthMeters || site.depthIsWholeLake) continue;
    const key = `${Math.floor(site.latitude / CELL_DEG)}|${Math.floor(site.longitude / CELL_DEG)}`;
    (index.get(key) || index.set(key, []).get(key)).push({ site, inland: isInland(site) });
  }
}

function km(a, b) {
  const rad = (value) => value * Math.PI / 180;
  const h = Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

export function nearbyDepths(site) {
  if (!site || !Number.isFinite(site.latitude) || !Number.isFinite(site.longitude)) return null;
  if (!index) buildIndex();
  const inland = isInland(site);
  const cy = Math.floor(site.latitude / CELL_DEG), cx = Math.floor(site.longitude / CELL_DEG);
  const reach = Math.ceil(NEARBY_KM / 111 / CELL_DEG) + 1;
  const depths = [];
  for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
    for (const entry of index.get(`${cy + dy}|${cx + dx}`) || []) {
      if (entry.site.id === site.id || entry.inland !== inland || km(site, entry.site) > NEARBY_KM) continue;
      depths.push(entry.site.maxDepthMeters);
    }
  }
  if (depths.length < MIN_SITES) return null;
  depths.sort((a, b) => a - b);
  const at = (q) => depths[Math.min(depths.length - 1, Math.max(0, Math.round(q * (depths.length - 1))))];
  const [low, high] = depths.length >= 5 ? [at(0.25), at(0.75)] : [depths[0], depths[depths.length - 1]];
  return { low: Math.round(low), high: Math.round(high), count: depths.length, radiusKm: NEARBY_KM };
}
