// At-a-glance ratings for a dive site. All are estimates, each with the reasons
// behind it, and none is presented as a guarantee:
//   - marine life: chance to see major marine life, per month
//   - experience:  beginner → technical, from depth, current and site features
//   - travel:      more steps and more distance from the traveller = harder
//   - exposure:    temperature, depth uncertainty and contact protection
import { planJourney, distanceKm, resolveDestination } from './journey';
import { visibilityAt } from './visibility';
import { approxDistance, depthText, elevationText } from './units';
import { exposureAdvice } from './exposure';
export { exposureFor } from './exposure';

// Sharks & rays (iNaturalist files them under Animalia), sea turtles and marine mammals.
const MAJOR_GROUPS = new Set(['Animalia', 'Reptilia', 'Mammalia']);
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

// Chance to see major marine life in a month: the share of local sightings that are major animals
// (weighted by each animal's monthly pattern), plus a star when a sourced seasonal highlight is on.
// Few major records cap the rating, so thin data never looks "excellent".
const monthWeight = (animal, month) => {
  const index = animal.index?.[month];
  return index == null ? 1 : 0.35 + 0.65 * (index / 9);
};
// Share of major-animal sightings needed for 2–5 stars (tuned so 5★ is roughly the top tenth of sites).
const STAR_SHARES = [0.15, 0.3, 0.45, 0.6];
export function marineLifeRating(guide) {
  const animals = guide?.animals || [];
  const observed = animals.filter(animal => !animal.sourced && animal.records);
  const sourced = animals.filter(animal => animal.sourced);
  const major = observed.filter(animal => MAJOR_GROUPS.has(animal.group));
  if (!observed.length && !sourced.length) return null;
  const majorRecords = major.reduce((sum, animal) => sum + animal.records, 0);
  return Array.from({ length: 12 }, (_, month) => {
    const weighted = observed.map(animal => ({ animal, value: animal.records * monthWeight(animal, month) }));
    const total = weighted.reduce((sum, entry) => sum + entry.value, 0) || 1;
    const share = weighted.filter(entry => MAJOR_GROUPS.has(entry.animal.group)).reduce((sum, entry) => sum + entry.value, 0) / total;
    let stars = 1 + STAR_SHARES.filter(threshold => share >= threshold).length;
    if (majorRecords < 15) stars = Math.min(stars, 3);
    const inSeason = sourced.filter(animal => animal.months.includes(month));
    if (inSeason.length) stars = Math.min(5, stars + 1);
    const drivers = [...inSeason.map(animal => animal.common),
      ...weighted.filter(entry => MAJOR_GROUPS.has(entry.animal.group)).sort((a, b) => b.value - a.value).map(entry => entry.animal.common)];
    return { stars, label: ['', 'Low', 'Fair', 'Good', 'High', 'Excellent'][stars], drivers: [...new Set(drivers)].slice(0, 3) };
  });
}

// Inland: how much freshwater life is on record nearby (species with a few sightings or more).
export function freshwaterLifeRating(life) {
  if (!life?.length) return null;
  // Species borrowed from a distant shore (animal.where) show in the gallery but don't earn fish.
  const species = life.filter(animal => animal.records >= 3 && animal.awayKm == null);
  const count = species.length;
  if (!count) return null; // only a sighting or two nearby: no basis for a rating
  const stars = count >= 11 ? 5 : count >= 8 ? 4 : count >= 5 ? 3 : count >= 2 ? 2 : 1;
  const drivers = species.slice(0, 3).map(a => a.common);
  const entry = { stars, label: `${count} species on record`, drivers, freshwater: true };
  return new Array(12).fill(entry);
}

const LEVELS = ['Beginner', 'Beginner', 'Intermediate', 'Advanced', 'Technical'];
export function experienceRating(site, temps, remote, conditions = {}, inland = null, units = 'imperial') {
  const reasons = [];
  // A lake's deepest point says nothing about how deep the dive goes.
  const depth = site?.depthIsWholeLake ? null : site?.maxDepthMeters;
  const topologies = site?.topologies || [];
  let score;
  if (depth) {
    score = depth <= 12 ? 0.5 : depth <= 18 ? 1 : depth <= 30 ? 2 : depth <= 40 ? 3 : 4;
    // A wreck or pinnacle's depth is where the dive is. Quarries, lakes, springs and reefs slope up from their
    // deepest point, so divers choose their depth: the maximum only raises the level so far.
    const fixed = topologies.includes('wreck') || topologies.includes('pinnacle');
    if (!fixed) score = Math.min(score, 1.5);
    reasons.push(fixed ? `${depthText(depth, units)} to the ${topologies.includes('wreck') ? 'wreck' : 'site'}` : `${depthText(depth, units)} max depth — pick your depth`);
  } else score = 1;
  if (topologies.includes('drift') || conditions.current === 'drift') { score += 1; reasons.push('drift / current'); }
  if (topologies.includes('wall')) { score += 0.5; reasons.push('wall — watch your depth'); }
  if (topologies.includes('wreck')) reasons.push('wreck — penetration needs training');
  if (topologies.includes('cavern')) { score = Math.max(score, 3); reasons.push('cavern — cavern training'); }
  if (topologies.includes('cave')) { score = Math.max(score, 4); reasons.push('cave — cave certification'); }
  const coldest = temps?.length === 12 ? Math.min(...temps) : null;
  if (inland) {
    // Inland divers pick the season; cold shows up as winter water or a summer thermocline — one factor.
    if (inland.stratifies || (coldest != null && coldest < 10)) { score += 0.5; reasons.push(inland.stratifies ? 'cold below the thermocline' : 'cold water'); }
  } else if (coldest != null && coldest < 10) { score += 1; reasons.push('cold water'); } else if (coldest != null && coldest < 16) { score += 0.5; reasons.push('cool water'); }
  if (remote) { score += 0.5; reasons.push('remote — limited support'); }
  if (inland?.altitude) {
    score += inland.elevation >= 1500 ? 1 : 0.5;
    reasons.push(`altitude dive (${elevationText(inland.elevation, units)}) — altitude tables`);
  }
  if (inland?.kind === 'mine') { score += 1; reasons.push('overhead mine — guided'); }
  if (site?.entry === 'shore') reasons.push('shore entry');
  const level = LEVELS[clamp(Math.round(score), 0, 4)];
  return { level, score: Math.round(score * 10) / 10, reasons, confidence: depth ? 'depth' : 'features' };
}

export function travelRating(site, originPoint, units = 'imperial') {
  if (!originPoint) {
    // Without a starting point, rate access from the site's own nearest airport only.
    const { destination } = planJourney(site);
    const closest = destination.closest;
    const points = destination.remote ? 3 : closest && closest.connections < 10 ? 1.5 : 0.5;
    return { level: points >= 3 ? 'Remote' : points >= 1.5 ? 'Regional' : 'Accessible', personal: false,
      detail: closest ? `${closest.code} ${approxDistance(closest.distanceKm, units)} away` : 'No nearby airport' };
  }
  const plan = planJourney(site, { originPoint, origin: '', units });
  const legs = plan.legs.filter(leg => leg.mode !== 'DIVE');
  const km = Math.round(distanceKm(originPoint, site));
  let points = km < 150 ? 0 : km < 800 ? 1 : km < 3000 ? 2 : km < 8000 ? 3 : 4;
  points += Math.max(0, legs.length - 2) * 0.75;
  if (legs.some(leg => leg.mode === 'FERRY')) points += 0.5;
  if (legs.some(leg => leg.mode === 'CONNECT')) points += 0.75;
  const airport = plan.option?.airport;
  if (airport && airport.connections < 10) points += 0.75;
  if (plan.destination.remote) points += 1.5;
  const level = points < 1.5 ? 'Easy' : points < 3 ? 'Moderate' : points < 4.5 ? 'Involved' : 'Expedition';
  return { level, personal: true, steps: legs.length, km, detail: `${legs.length} ${legs.length === 1 ? 'step' : 'steps'} · ${approxDistance(km, units)}${airport ? ` · via ${airport.code}` : ''}` };
}

export function siteRatings(site, guide, { originPoint = null, inland = null, life = null, units = 'imperial' } = {}) {
  const destination = resolveDestination(site);
  const remote = destination.remote, conditions = destination.profile?.conditions;
  if (inland) {
    const surface = inland.surface;
    return {
      marineLife: freshwaterLifeRating(life),
      experience: experienceRating(site, surface, remote, conditions, inland, units),
      travel: travelRating(site, originPoint, units),
      exposure: Array.from({ length: 12 }, (_, month) => exposureAdvice({ site, inland, temperatureC: surface?.[month] ?? null }).label),
      exposureDeep: inland.stratifies ? 'Drysuit + insulation' : null,
      visibility: null,
    };
  }
  return {
    marineLife: marineLifeRating(guide),
    experience: experienceRating(site, guide?.temps, remote, conditions, null, units),
    travel: travelRating(site, originPoint, units),
    exposure: guide?.temps?.length === 12 ? guide.temps.map(temperatureC => exposureAdvice({ site, temperatureC }).label) : null,
    // Satellite clarity is only meaningful for sea water.
    visibility: /fresh/i.test(site?.environment || '') || site?.topologies?.includes('quarry') ? null : visibilityAt(site),
  };
}
