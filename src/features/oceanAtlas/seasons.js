// "When to go" for any site: monthly surface temperature (NOAA climatology),
// sourced editorial seasons (regions.js) and iNaturalist-derived marine life
// (data/marineLife.json), with OBIS survey records where iNaturalist has little
// (data/marineLifeObis.json). Editorial seasons always win over observation data.
import MARINE_LIFE from './data/marineLife.json';
import MARINE_LIFE_OBIS from './data/marineLifeObis.json';
import packedTemperature from './data/temperature.json';
import { MONTHS, expandTemperature, inBounds, temperatureAt } from './model';

const temperature = expandTemperature(packedTemperature);
import { MARINE_REGIONS } from './regions';

// Survey places (OBIS) are flagged: their records say where, never when.
const PLACES = [...MARINE_LIFE.places.map(place => [...place, false]), ...MARINE_LIFE_OBIS.places.map(place => [...place, true])];
const TAXA = { ...MARINE_LIFE_OBIS.taxa, ...MARINE_LIFE.taxa };
const SURVEY_SOURCE = { name: 'OBIS survey records', url: MARINE_LIFE_OBIS.sourceUrl };

const MATCH_SLACK_KM = 40; // a site may sit just outside a snapshot radius

function distanceKm(a, b) {
  const rad = value => value * Math.PI / 180;
  const h = Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

const monthsFromMask = mask => MONTHS.map((_, i) => i).filter(i => mask & (1 << i));

// Circular month ranges: [11, 0, 1, 2] → "Dec–Mar".
export function monthRange(months) {
  if (!months.length) return '';
  if (months.length === 12) return 'Year-round';
  const set = new Set(months);
  const start = months.find(m => !set.has((m + 11) % 12));
  if (start === undefined) return 'Year-round';
  const runs = [];
  for (let k = 0, m = start; k < 12; k++, m = (m + 1) % 12) {
    if (set.has(m) && !set.has((m + 11) % 12)) runs.push([m, m]);
    else if (set.has(m)) runs[runs.length - 1][1] = m;
  }
  return runs.map(([a, b]) => a === b ? MONTHS[a] : `${MONTHS[a]}–${MONTHS[b]}`).join(', ');
}

// NOAA's 2° grid masks coastal cells; look a cell or two offshore when needed.
export function temperatureProfile(site) {
  const offsets = [[0, 0], [0, 2], [0, -2], [2, 0], [-2, 0], [2, 2], [2, -2], [-2, 2], [-2, -2], [0, 4], [0, -4], [4, 0], [-4, 0]];
  for (const [dLat, dLon] of offsets) {
    const values = MONTHS.map((_, month) => temperatureAt(temperature, site.latitude + dLat, site.longitude + dLon, month));
    if (values.every(value => value != null)) return values;
  }
  return null;
}

// Snapshot places covering any of the given points (nearest only for a single site).
function snapshotsNear(points, nearestOnly) {
  const hits = [];
  for (const [latitude, longitude, radius, name, species, survey] of PLACES) {
    const centre = { latitude, longitude };
    const distance = Math.min(...points.map(point => distanceKm(point, centre)));
    if (distance <= radius + MATCH_SLACK_KM) hits.push({ name, species, distance, survey });
  }
  hits.sort((a, b) => a.distance - b.distance);
  // One site: the nearest sighting place, plus the nearest survey place that fills its gaps.
  return nearestOnly ? [hits.find(hit => !hit.survey), hits.find(hit => hit.survey)].filter(Boolean) : hits;
}

function taxon(id) {
  const [common, scientific, group, photoUrl, attribution, license] = TAXA[id] || [];
  return common ? { taxonId: Number(id), common, scientific, group, photo: photoUrl ? { url: photoUrl, attribution, license } : null } : null;
}
const taxonByScientific = scientific => {
  const id = Object.keys(TAXA).find(key => TAXA[key][1] === scientific);
  return id ? taxon(id) : null;
};
const capitalize = text => text ? text[0].toUpperCase() + text.slice(1) : text;
const MAX_ANIMALS = 14;

function buildGuide(points, temps, nearestOnly, maxAnimals = MAX_ANIMALS) {
  const editorial = MARINE_REGIONS.filter(region => points.some(point => inBounds(region.bounds, point.latitude, point.longitude)));
  const snapshots = snapshotsNear(points, nearestOnly);
  const animals = [];
  for (const region of editorial) {
    for (const entry of region.species) {
      const months = entry.months.map(m => m - 1);
      const match = taxonByScientific(entry.scientific);
      animals.push({ key: `${region.id}-${entry.id}`, common: entry.name, scientific: entry.scientific, months, season: entry.season, note: entry.note,
        where: editorial.length > 1 ? region.name : '', sourced: true, source: { name: entry.source, url: entry.url }, photo: match?.photo || null, taxonId: match?.taxonId || null });
    }
  }
  // Merge observation data across snapshot places; each species keeps the pattern from where it is best recorded.
  const merged = new Map();
  for (const snapshot of snapshots) {
    for (const [id, records, peakMask, index] of snapshot.species) {
      const entry = merged.get(id);
      if (!entry) merged.set(id, { id, records, peakMask, index, best: records, where: snapshot.name, survey: snapshot.survey });
      else if (snapshot.survey && !entry.survey) continue; // sightings already cover it, with seasons
      else if (!snapshot.survey && entry.survey) merged.set(id, { id, records, peakMask, index, best: records, where: snapshot.name, survey: false });
      else { entry.records += records; if (records > entry.best) Object.assign(entry, { peakMask, index, best: records, where: snapshot.name }); }
    }
  }
  const observed = [...merged.values()].map(entry => ({ entry, info: taxon(entry.id) })).filter(({ info }) => info)
    .sort((a, b) => (a.info.group === 'Actinopterygii') - (b.info.group === 'Actinopterygii') || b.entry.records - a.entry.records);
  for (const { entry, info } of observed) {
    if (animals.length >= maxAnimals) break;
    if (animals.some(animal => animal.scientific === info.scientific)) continue;
    const months = monthsFromMask(entry.peakMask);
    animals.push({ key: `inat-${entry.id}`, common: capitalize(info.common), scientific: info.scientific, group: info.group, months, records: entry.records,
      index: entry.index.split('').map(Number), season: entry.survey ? 'Recorded in surveys' : months.length ? `Most sightings ${monthRange(months)}` : 'Seen year-round',
      where: snapshots.length > 1 && !nearestOnly ? entry.where : '', sourced: false, survey: entry.survey, source: entry.survey ? SURVEY_SOURCE : undefined, photo: info.photo, taxonId: info.taxonId });
  }
  const seasonal = animals.filter(animal => animal.months.length);
  // Each distinct season is its own highlight (sourced first) rather than one merged "best" span.
  // Observation-derived seasons headline only for charismatic groups, not reef fish.
  const highlights = [];
  for (const animal of seasonal.filter(animal => animal.sourced || animal.group !== 'Actinopterygii')) {
    const label = monthRange(animal.months);
    const existing = highlights.find(highlight => highlight.label === label);
    if (existing) existing.animals.push(animal); else highlights.push({ label, months: animal.months, sourced: animal.sourced, animals: [animal] });
  }
  return { temps, animals, seasonal, highlights: highlights.slice(0, maxAnimals > MAX_ANIMALS ? 6 : 4), area: snapshots[0]?.name || editorial[0]?.name || '',
    hasObservations: snapshots.some(snapshot => !snapshot.survey), hasSurveys: animals.some(animal => animal.survey), source: { name: MARINE_LIFE.source, url: MARINE_LIFE.sourceUrl } };
}

export function seasonGuide(site) {
  return buildGuide([site], temperatureProfile(site), true);
}

// A whole island, state or country: every site contributes; temperature is taken
// where the sites are (their median), since a country's centre may be inland.
export function placeSeasonGuide(sites, maxAnimals) {
  if (!sites.length) return buildGuide([], null, false, maxAnimals);
  const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const centre = { latitude: median(sites.map(site => site.latitude)), longitude: median(sites.map(site => site.longitude)) };
  // For a continent the median point can be far inland; use the real sites nearest it until one has ocean data.
  const byCentre = [...sites].sort((a, b) => distanceKm(a, centre) - distanceKm(b, centre));
  let temps = temperatureProfile(centre);
  for (const site of byCentre.slice(0, 25)) { if (temps) break; temps = temperatureProfile(site); }
  return buildGuide(sites, temps, false, maxAnimals);
}

// Quick look for any map tap: the nearest marine-life sample (local, or "near X"
// within QUICK_REACH_KM), sourced seasons at the point and its temperatures.
const QUICK_REACH_KM = 400;
const QUICK_ANIMALS = 4;
export function quickLook(point) {
  let best = null;
  for (const [latitude, longitude, radius, name, species] of MARINE_LIFE.places) {
    const gap = distanceKm(point, { latitude, longitude }) - radius;
    if (!best || gap < best.gap) best = { name, species, gap };
  }
  const local = best && best.gap <= MATCH_SLACK_KM;
  const reach = best && best.gap <= QUICK_REACH_KM ? best : null;
  const animals = [];
  for (const region of MARINE_REGIONS.filter(r => inBounds(r.bounds, point.latitude, point.longitude))) {
    for (const entry of region.species) {
      const match = taxonByScientific(entry.scientific);
      if (match?.photo) animals.push({ common: entry.name, months: entry.months.map(m => m - 1), sourced: true, photo: match.photo, taxonId: match.taxonId });
    }
  }
  const observed = (reach?.species || []).map(([id, records, peakMask]) => ({ info: taxon(id), records, peakMask })).filter(({ info }) => info?.photo)
    .sort((a, b) => (a.info.group === 'Actinopterygii') - (b.info.group === 'Actinopterygii') || b.records - a.records);
  for (const { info, peakMask } of observed) {
    if (animals.length >= QUICK_ANIMALS) break;
    if (animals.some(animal => animal.common.toLowerCase() === info.common.toLowerCase())) continue;
    animals.push({ common: capitalize(info.common), months: monthsFromMask(peakMask), sourced: false, photo: info.photo, taxonId: info.taxonId });
  }
  return { temps: temperatureProfile(point), animals: animals.slice(0, QUICK_ANIMALS), nearArea: reach && !local ? reach.name || '' : '', local: Boolean(local), hasLife: Boolean(reach) || animals.length > 0 };
}

export function monthSummary(guide, month) {
  return { temperature: guide.temps?.[month] ?? null, inSeason: guide.seasonal.filter(animal => animal.months.includes(month)) };
}

// What's in season this month anywhere in the sourced guides (regions.js), for Home.
// `month` is 0-based; guide months are 1-based. Year-round and undocumented species are
// left out, and the shortest (most seasonal) windows come first.
export function inSeasonNow(month, limit = 8) {
  const picks = [];
  for (const region of MARINE_REGIONS) {
    for (const entry of region.species) {
      if (!entry.months.includes(month + 1) || entry.months.length >= 12) continue;
      const match = taxonByScientific(entry.scientific);
      picks.push({ id: `${region.id}:${entry.id}`, regionId: region.id, speciesId: entry.id, name: entry.name, place: region.name, window: entry.season.split(' · ')[0],
        span: entry.months.length, photo: match?.photo || null, latitude: region.latitude, longitude: region.longitude });
    }
  }
  // One card per species; a second place joins the first ("Florida Keys · Jupiter, Florida").
  const bySpecies = new Map();
  for (const pick of picks.sort((a, b) => a.span - b.span || a.name.localeCompare(b.name))) {
    const seen = bySpecies.get(pick.name);
    if (seen) seen.places.push(pick.place); else bySpecies.set(pick.name, { ...pick, places: [pick.place] });
  }
  return [...bySpecies.values()].slice(0, limit);
}
