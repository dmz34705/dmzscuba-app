// Inland (freshwater) dive-site conditions. Built from data/inlandConditions.json
// (elevation + monthly air-temperature climatology) and data/freshwaterLife.json
// (iNaturalist fish and other aquatic animals). All water temperatures are
// estimates from widely used freshwater rules of thumb, and say so in the UI:
//   - lakes, quarries, lake wrecks: the surface follows recent air temperature,
//     never below 4 °C (ice months flagged); below the summer thermocline deep
//     water stays roughly 4–10 °C;
//   - springs and flooded mines: groundwater, near the local mean annual air
//     temperature year-round; geothermal sites are warm year-round.
import CONDITIONS from './data/inlandConditions.json';
import FRESHWATER from './data/freshwaterLife.json';
import EXTRA from './data/extraSites.json';

// Altitude diving: any site ABOVE 1,000 ft (≈305 m) uses altitude procedures; at or below it's a normal dive.
const ALTITUDE_FT = 1000, FT_PER_M = 3.28084;
const GEOTHERMAL = /\b(crater|caldera|seabase|hot springs?)\b/i;
const KIND_HINTS = EXTRA.kindHints || {};
const MATCH_SLACK_KM = 10;
const NEAREST_SHORE_KM = 60; // offshore lake wrecks: fall back to the nearest sampled shore

function distanceKm(a, b) {
  const rad = v => v * Math.PI / 180;
  const h = Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

export const isInland = site => Boolean(site && (CONDITIONS.sites[site.id] || /fresh/i.test(site.environment || '') || site.topologies?.includes('quarry')));

function waterKind(site) {
  const t = site.topologies || [], name = site.name || '';
  const hint = KIND_HINTS[name.split(' — ')[0].toLowerCase()];
  if (GEOTHERMAL.test(name) && hint !== 'quarry') return 'geothermal';
  if (hint && hint !== 'lake') return hint;
  if (t.includes('spring') || /\bsprings?\b|blue hole/i.test(name)) return 'spring';
  if (t.includes('mine') || /\bmine\b/i.test(name)) return 'mine';
  if (t.includes('quarry') || /quarr/i.test(name)) return 'quarry';
  if (t.includes('wreck')) return 'wreck';
  if (t.includes('cave') || t.includes('cavern')) return 'cave';
  return 'lake';
}
const KIND_LABEL = { geothermal: 'Geothermal spring', spring: 'Spring', mine: 'Flooded mine', quarry: 'Quarry', wreck: 'Lake wreck', cave: 'Freshwater cave', lake: 'Lake' };

export function inlandProfile(site) {
  const row = CONDITIONS.sites[site.id];
  const elevation = row ? row[0] : null;
  const air = row ? row[1].map(v => v == null ? null : v / 10) : null;
  const kind = waterKind(site);
  const valid = air?.every(v => v != null);
  const annual = valid ? air.reduce((a, b) => a + b, 0) / 12 : null;
  let surface = null, constant = null;
  const ice = [];
  if (valid && ['spring', 'mine', 'cave'].includes(kind)) {
    constant = Math.max(4, Math.round((annual + 1) * 10) / 10);
    surface = new Array(12).fill(constant);
  } else if (valid && kind !== 'geothermal') {
    surface = air.map((value, m) => {
      const recent = 0.6 * value + 0.4 * air[(m + 11) % 12];
      if (value < -2 && air[(m + 11) % 12] < 0) ice.push(m);
      // Water trails hot air: above ~24 °C air, surface water warms far more slowly.
      const water = recent <= 24 ? recent + 1.5 : 25.5 + 0.35 * (recent - 24);
      return Math.round(Math.max(4, water) * 10) / 10;
    });
  }
  const stratifies = surface && ['lake', 'quarry', 'wreck'].includes(kind) && Math.max(...surface) >= 16;
  return {
    kind, kindLabel: KIND_LABEL[kind], elevation, altitude: elevation != null && elevation * FT_PER_M > ALTITUDE_FT,
    air, surface, constant, geothermal: kind === 'geothermal', ice, stratifies,
    // Water below a summer thermocline in stratified lakes and quarries.
    deep: stratifies ? { low: 4, high: 10 } : null,
  };
}

// Most-recorded freshwater species near the site: every sampled area that overlaps it
// (highest count per species). When those are thin (offshore Great Lakes wrecks sit
// beyond most shore records), the nearest well-sampled area within NEAREST_SHORE_KM
// is added, its species labelled with the distance.
const WELL_RECORDED = 3;
const rich = species => species.filter(([, records]) => records >= WELL_RECORDED).length >= WELL_RECORDED;
export function freshwaterLife(site) {
  const counts = new Map(), where = new Map();
  let nearest = null;
  for (const [latitude, longitude, radius, species] of FRESHWATER.places || []) {
    const d = distanceKm(site, { latitude, longitude });
    if (d <= radius + MATCH_SLACK_KM) for (const [id, records] of species) counts.set(id, Math.max(records, counts.get(id) || 0));
    else if (d <= NEAREST_SHORE_KM && rich(species) && (!nearest || d < nearest.d)) nearest = { d, species };
  }
  if (!rich([...counts]) && nearest) {
    for (const [id, records] of nearest.species) if (!counts.has(id)) { counts.set(id, records); where.set(id, Math.round(nearest.d)); }
  }
  return [...counts].map(([id, records]) => {
    const [common, scientific, group, photoUrl, attribution, license] = FRESHWATER.taxa[id] || [];
    return common ? { key: `fw-${id}`, taxonId: id, common: common[0].toUpperCase() + common.slice(1), scientific, group, records, awayKm: where.get(id) ?? null,
      photo: photoUrl ? { url: photoUrl, attribution, license } : null, months: [], season: group === 'Actinopterygii' ? 'Fish' : 'Aquatic life', sourced: false } : null;
  }).filter(Boolean)
    // Fish first (what divers mostly meet), then turtles, crayfish, mussels …; most-sighted first within each.
    .sort((a, b) => (b.group === 'Actinopterygii') - (a.group === 'Actinopterygii') || b.records - a.records);
}
