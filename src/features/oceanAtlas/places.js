// Destination guides for islands, US states and countries. Outlines come from
// data/places.json (Natural Earth + OpenStreetMap island names); membership of the
// offshore catalog sites is resolved here so any catalog refresh just works.
import PLACES from './data/places.json';
import AIRPORT_DATA from './data/airports.json';
import { catalogSites } from './catalog';
import { DIVE_REGIONS, REMOTE_DIVE_AREAS } from './diveRegions';
import { countryCode } from './journey';
import { inBounds, oceanRegionAt } from './model';
import { OCEAN_REGIONS } from './oceanRegions';
import { placeSeasonGuide, quickLook as seasonQuickLook, temperatureProfile } from './seasons';
import { areaText } from './units';

const ISLAND_SITE_KM = 15;     // offshore sites belong to an island within this distance
const STATE_SITE_KM = 60;      // offshore US sites belong to the nearest state within this distance
const TERRITORY_KM = 300;      // a site this far from its listed country's outline belongs to where it is
const KM_PER_DEG = 111.32;
const MAX_OUTLINE_POINTS = 1500;
const LENS_REACH_KM = 3000;    // an ocean lens covers points up to this far from its anchor
function distanceKm(a, b) {
  const rad = value => value * Math.PI / 180;
  const h = Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

function decodeRing(encoded, scale) {
  const points = []; let index = 0, x = 0, y = 0;
  const next = () => { let result = 0, shift = 0, byte; do { byte = encoded.charCodeAt(index++) - 63; result |= (byte & 0x1f) << shift; shift += 5; } while (byte >= 0x20); return result & 1 ? ~(result >> 1) : result >> 1; };
  while (index < encoded.length) { x += next(); y += next(); points.push([x / scale, y / scale]); }
  return points;
}
const bboxOf = rings => rings.flat().reduce((b, [x, y]) => [Math.min(b[0], y), Math.min(b[1], x), Math.max(b[2], y), Math.max(b[3], x)], [90, 180, -90, -180]);
const inBox = (box, latitude, longitude, pad = 0) => latitude >= box[0] - pad && latitude <= box[2] + pad && longitude >= box[1] - pad && longitude <= box[3] + pad;
function inRing(longitude, latitude, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > latitude) !== (yj > latitude) && longitude < (xj - xi) * (latitude - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function distanceToRingKm(longitude, latitude, ring) {
  const k = Math.cos(latitude * Math.PI / 180);
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const ax = (ring[j][0] - longitude) * k, ay = ring[j][1] - latitude, bx = (ring[i][0] - longitude) * k, by = ring[i][1] - latitude;
    const dx = bx - ax, dy = by - ay, length = dx * dx + dy * dy;
    const t = length ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / length)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best * KM_PER_DEG;
}
const contains = (place, latitude, longitude) => inBox(place.bbox, latitude, longitude) && place.rings.some(ring => inRing(longitude, latitude, ring));
// Per-ring boxes: a country's overall box can span the globe (e.g. the US across the dateline).
const near = (place, latitude, longitude, km) => place.ringBoxes.some(box => inBox(box, latitude, longitude, km / KM_PER_DEG));
const distanceTo = (place, latitude, longitude) => Math.min(...place.rings.map(ring => distanceToRingKm(longitude, latitude, ring)));

let index = null;
function places() {
  if (index) return index;
  const make = (kind, id, name, rings, extra = {}) => ({ kind, id, name, rings, bbox: bboxOf(rings), ringBoxes: rings.map(ring => bboxOf([ring])), ...extra });
  const countries = PLACES.countries.map(([code, name, rings]) => make('country', code, name, rings.map(r => decodeRing(r, PLACES.scale))));
  const states = PLACES.states.map(([code, name, rings]) => make('state', code, name, rings.map(r => decodeRing(r, PLACES.scale))));
  const islands = PLACES.islands.map(([name, catalogCountry, code, areaKm2, ring], i) => {
    const island = make('island', `island-${i}`, name, [decodeRing(ring, PLACES.scale)], { areaKm2 });
    // The catalog label wins (e.g. Bonaire → Caribbean Netherlands) unless the island lies far from that
    // country's outline, i.e. a territory such as Puerto Rico listed as "United States".
    const listed = countryCode(catalogCountry);
    const listedPlace = listed && countries.find(country => country.id === listed);
    const far = listedPlace && !near(listedPlace, (island.bbox[0] + island.bbox[2]) / 2, (island.bbox[1] + island.bbox[3]) / 2, TERRITORY_KM);
    island.country = (far ? code : listed) || code || '';
    return island;
  });
  index = { countries, states, islands, byId: new Map([...countries, ...states, ...islands].map(place => [`${place.kind}:${place.id}`, place])) };
  return index;
}
const countryName = code => places().byId.get(`country:${code}`)?.name || AIRPORT_DATA.countries[code] || code;

// Where each catalog site belongs: country (listed, unless it clearly sits in a
// territory elsewhere), US state and island.
let membership = null;
function sitesByPlace() {
  if (membership) return membership;
  const { countries, states, islands } = places();
  const add = (map, key, site) => { if (!map.has(key)) map.set(key, []); map.get(key).push(site); };
  const byCountry = new Map(), byState = new Map(), byIsland = new Map(), misplaced = [];
  for (const site of catalogSites()) {
    const { latitude, longitude } = site;
    let code = countryCode(site.country);
    const listed = code && countries.find(country => country.id === code);
    if (!code || (listed && !near(listed, latitude, longitude, TERRITORY_KM))) {
      const around = countries.filter(country => inBox(country.bbox, latitude, longitude, 1));
      const inside = around.find(country => contains(country, latitude, longitude));
      // A "marine" record with no ocean within a few hundred km is bad data and stays unplaced.
      if (inside && !/fresh/i.test(site.environment) && !temperatureProfile(site)) { misplaced.push(site); continue; }
      // Unlabelled offshore spots (e.g. OpenStreetMap reefs) look further out for the nearest country.
      const candidates = inside ? [] : around.length ? around : countries.filter(country => inBox(country.bbox, latitude, longitude, 8));
      code = (inside || candidates.map(country => ({ country, d: distanceTo(country, latitude, longitude) })).sort((a, b) => a.d - b.d)[0]?.country)?.id || code;
    }
    if (code) add(byCountry, code, site);
    if (code === 'US') {
      const around = states.filter(state => inBox(state.bbox, latitude, longitude, STATE_SITE_KM / KM_PER_DEG));
      const state = around.find(candidate => contains(candidate, latitude, longitude))
        || around.map(candidate => ({ candidate, d: distanceTo(candidate, latitude, longitude) })).filter(e => e.d <= STATE_SITE_KM).sort((a, b) => a.d - b.d)[0]?.candidate;
      if (state) add(byState, state.id, site);
    }
    const island = islands.filter(candidate => inBox(candidate.bbox, latitude, longitude, ISLAND_SITE_KM / KM_PER_DEG))
      .map(candidate => ({ candidate, d: contains(candidate, latitude, longitude) ? 0 : distanceTo(candidate, latitude, longitude) }))
      .filter(e => e.d <= ISLAND_SITE_KM).sort((a, b) => a.d - b.d)[0]?.candidate;
    if (island) add(byIsland, island.id, site);
  }
  membership = { country: byCountry, state: byState, island: byIsland, misplaced };
  return membership;
}
export const sitesIn = place => sitesByPlace()[place.kind].get(place.id) || [];
export const misplacedSites = () => sitesByPlace().misplaced;

export function placeById(kind, id) {
  if (kind === 'country' && !places().byId.has(`country:${id}`) && sitesByPlace().country.has(id)) return { kind, id, name: countryName(id), rings: [], bbox: null };
  return places().byId.get(`${kind}:${id}`) || null;
}

// Most specific place under a tap: island › US state › country.
export function placeAt(latitude, longitude) {
  const { countries, states, islands } = places();
  const island = islands.find(place => contains(place, latitude, longitude) && sitesIn(place).length);
  const country = countries.find(place => contains(place, latitude, longitude));
  const state = country?.id === 'US' ? states.find(place => contains(place, latitude, longitude)) : null;
  return island || state || country || null;
}

export function parentsOf(place) {
  const { states } = places();
  const parents = [];
  if (place.kind === 'island') {
    const [south, west, north, east] = place.bbox;
    const centre = [(south + north) / 2, (west + east) / 2];
    const state = place.country === 'US' ? states.find(candidate => contains(candidate, ...centre))
      || states.map(candidate => ({ candidate, d: distanceTo(candidate, ...centre) })).sort((a, b) => a.d - b.d)[0]?.candidate : null;
    if (state) parents.push({ kind: 'state', id: state.id, name: state.name });
    if (place.country) parents.push({ kind: 'country', id: place.country, name: countryName(place.country) });
  } else if (place.kind === 'state') parents.push({ kind: 'country', id: 'US', name: countryName('US') });
  return parents;
}

// The place(s) a single site belongs to, for the breadcrumb on its card.
export function placesForSite(siteId) {
  const found = [];
  for (const kind of ['island', 'state', 'country']) {
    for (const [id, list] of sitesByPlace()[kind]) if (list.some(site => site.id === siteId)) { const place = placeById(kind, id); if (place) found.push({ kind, id, name: place.name }); break; }
  }
  return found;
}

const TOPOLOGY_WORDS = { reef: 'reefs', wall: 'walls', wreck: 'wrecks', pinnacle: 'pinnacles', cave: 'caves', cavern: 'caverns', muck: 'muck diving', drift: 'drifts', shore: 'shore dives' };
function character(sites) {
  const count = (values) => values.reduce((map, value) => map.set(value, (map.get(value) || 0) + 1), new Map());
  const topologies = [...count(sites.flatMap(site => site.topologies.filter(t => t !== 'other')))].sort((a, b) => b[1] - a[1]);
  const shore = sites.filter(site => site.entry === 'shore').length, boat = sites.filter(site => site.entry === 'boat').length;
  const depths = sites.filter(site => !site.depthIsWholeLake).map(site => site.maxDepthMeters).filter(Boolean).sort((a, b) => a - b);
  const quantile = q => depths[Math.min(depths.length - 1, Math.floor(q * depths.length))];
  const fresh = sites.filter(site => /fresh/i.test(site.environment)).length;
  return { total: sites.length, topologies: topologies.slice(0, 6), shore, boat, fresh,
    depth: depths.length >= 3 ? { low: quantile(0.25), high: quantile(0.75), max: depths[depths.length - 1], count: depths.length } : null,
    summary: [
      topologies.length ? `Mostly ${topologies.slice(0, 3).map(([t]) => TOPOLOGY_WORDS[t] || t).join(', ').replace(/, ([^,]*)$/, ' and $1')}.` : '',
      shore + boat ? (shore > boat ? `Shore diving is common (${shore} of ${shore + boat} sites with a listed entry).` : `Mainly boat diving (${boat} of ${shore + boat} sites with a listed entry).`) : '',
      fresh ? `${fresh} freshwater ${fresh === 1 ? 'site' : 'sites'}.` : '',
    ].filter(Boolean).join(' ') };
}

function outline(place) {
  const rings = place.rings.filter(ring => ring.length >= 4);
  const total = rings.reduce((sum, ring) => sum + ring.length, 0);
  const step = Math.max(1, Math.ceil(total / MAX_OUTLINE_POINTS));
  return rings.map(ring => ring.filter((_, i) => i % step === 0).map(([x, y]) => [Math.round(y * 1000) / 1000, Math.round(x * 1000) / 1000])).filter(ring => ring.length >= 3);
}

const AREAS = [...DIVE_REGIONS.flatMap(region => region.areas), ...REMOTE_DIVE_AREAS];
export function placeGuide(place, units = 'imperial') {
  const sites = sitesIn(place);
  const { states, islands } = places();
  const membership = sitesByPlace();
  const children = place.kind === 'country' ? [
    ...(place.id === 'US' ? states.map(state => ({ kind: 'state', id: state.id, name: state.name, count: membership.state.get(state.id)?.length || 0 })) : []),
    ...islands.filter(island => island.country === place.id).map(island => ({ kind: 'island', id: island.id, name: island.name, count: membership.island.get(island.id)?.length || 0 })),
  ] : place.kind === 'state' ? islands.filter(island => island.country === 'US' && parentsOf(island).some(parent => parent.id === place.id))
    .map(island => ({ kind: 'island', id: island.id, name: island.name, count: membership.island.get(island.id)?.length || 0 })) : [];
  const areas = AREAS.filter(area => place.rings.length ? contains(place, area.latitude, area.longitude) || (place.kind === 'island' && distanceTo(place, area.latitude, area.longitude) < 30) : false);
  const season = placeSeasonGuide(sites);
  const centre = sites.length ? { latitude: sites.reduce((s, x) => s + x.latitude, 0) / sites.length, longitude: sites.reduce((s, x) => s + x.longitude, 0) / sites.length }
    : place.bbox ? { latitude: (place.bbox[0] + place.bbox[2]) / 2, longitude: (place.bbox[1] + place.bbox[3]) / 2 } : null;
  const country = place.kind === 'country' ? place.id : place.kind === 'state' ? 'US' : place.country;
  return {
    kind: place.kind, id: place.id, name: place.name,
    label: { island: 'ISLAND GUIDE', state: 'STATE GUIDE', country: 'COUNTRY GUIDE' }[place.kind],
    subtitle: [place.kind === 'island' ? 'Island' : place.kind === 'state' ? 'US state' : 'Country', place.kind !== 'country' && countryName(country) !== place.name && countryName(country), place.areaKm2 ? areaText(place.areaKm2, units) : ''].filter(Boolean).join(' · '),
    parents: parentsOf(place), children: children.filter(child => child.count).sort((a, b) => b.count - a.count).slice(0, 16),
    character: character(sites), siteIds: [...sites].sort((a, b) => a.name.localeCompare(b.name)).map(site => site.id),
    areas: areas.map(area => ({ id: area.id, name: area.name, subtitle: area.subtitle, latitude: area.latitude, longitude: area.longitude })),
    season: { temps: season.temps, highlights: season.highlights, animals: season.animals, hasObservations: season.hasObservations },
    outline: outline(place), bbox: place.bbox,
    journey: centre ? { name: place.name, latitude: centre.latitude, longitude: centre.longitude, country: countryName(country), region: place.kind === 'country' ? '' : place.name } : null,
  };
}

// Broad regions: an ocean lens (nearest-anchor "province") or a dive region (bounds).
// Species, seasons and destinations come from every catalog site inside it.
export function regionGuide(kind, id) {
  const region = kind === 'province' ? OCEAN_REGIONS.find(r => r.id === id) : DIVE_REGIONS.find(r => r.id === id);
  if (!region) return null;
  // Ocean lenses pick the nearest anchor; cap the reach so far-off or inland points don't join a lens.
  const belongs = point => kind === 'province'
    ? oceanRegionAt(OCEAN_REGIONS, point.latitude, point.longitude)?.id === id && distanceKm(point, region) <= LENS_REACH_KM
    : inBounds(region.bounds, point.latitude, point.longitude);
  const sites = catalogSites().filter(site => !/fresh/i.test(site.environment) && belongs(site));
  const areas = AREAS.filter(belongs);
  const membership = sitesByPlace();
  const ids = new Set(sites.map(site => site.id));
  const inRegion = (kind2, list) => [...list].map(([placeId, members]) => ({ kind: kind2, id: placeId, count: members.filter(site => ids.has(site.id)).length })).filter(entry => entry.count);
  // Islands first (the unit divers plan around), then countries, ranked by mapped sites.
  const islands = inRegion('island', membership.island).sort((a, b) => b.count - a.count).slice(0, 8);
  const countries = inRegion('country', membership.country).sort((a, b) => b.count - a.count);
  const destinations = [...islands, ...countries.slice(0, 8)].map(entry => ({ ...entry, name: placeById(entry.kind, entry.id)?.name || entry.id }));
  // Dive areas carry marine-life coverage even where the site catalog is thin.
  const season = placeSeasonGuide([...sites, ...areas], 20);
  return { kind, id, name: region.name, countries: countries.length, character: character(sites), destinations,
    areas: kind === 'province' ? areas.map(area => ({ id: area.id, name: area.name, subtitle: area.subtitle, latitude: area.latitude, longitude: area.longitude })) : [],
    season: { highlights: season.highlights, animals: season.animals, hasObservations: season.hasObservations } };
}

// Quick-look popup for an empty-map tap: a glance at life, water and nearby diving.
const QUICK_SITE_KM = 50;
const lensCache = new Map(), placeLookCache = new Map();
export function quickLook(latitude, longitude) {
  const point = { latitude, longitude };
  const look = seasonQuickLook(point);
  let nearest = null, nearby = 0;
  for (const site of catalogSites()) {
    if (Math.abs(site.latitude - latitude) > 5 || Math.abs(site.longitude - longitude) > 5) continue;
    const d = distanceKm(point, site);
    if (d <= QUICK_SITE_KM) nearby++;
    if (!nearest || d < nearest.km) nearest = { id: site.id, name: site.name, km: d };
  }
  const place = placeAt(latitude, longitude);
  // A tap inside an island, state or country summarises that whole place: an inland tap is far from every
  // dive site, so a 50 km count would wrongly read "0".
  if (place) {
    const key = `${place.kind}:${place.id}`;
    const sites = sitesIn(place);
    if (!placeLookCache.has(key)) {
      const season = placeSeasonGuide(sites);
      placeLookCache.set(key, { temps: season.temps, animals: season.animals.filter(animal => animal.photo).slice(0, 4)
        .map(({ common, months, sourced, photo, taxonId }) => ({ common, months, sourced, photo, taxonId })) });
    }
    const summary = placeLookCache.get(key);
    let closest = null;
    for (const site of sites) { const d = distanceKm(point, site); if (!closest || d < closest.km) closest = { id: site.id, name: site.name, km: d }; }
    return { ...look, temps: summary.temps || look.temps, animals: summary.animals.length ? summary.animals : look.animals, local: true, nearArea: '', lens: '',
      scope: 'place', placeSites: sites.length, nearby, nearest: closest ? { ...closest, km: Math.round(closest.km) } : null, place: { kind: place.kind, name: place.name } };
  }
  // Open water far from any dive area: show what the surrounding ocean lens is known for.
  if (!look.animals.length) {
    const lens = oceanRegionAt(OCEAN_REGIONS, latitude, longitude);
    if (lens && distanceKm(point, lens) <= LENS_REACH_KM) {
      if (!lensCache.has(lens.id)) lensCache.set(lens.id, regionGuide('province', lens.id));
      const animals = (lensCache.get(lens.id)?.season.animals || []).filter(animal => animal.photo).slice(0, 4)
        .map(({ common, months, sourced, photo, taxonId }) => ({ common, months, sourced, photo, taxonId }));
      if (animals.length) Object.assign(look, { animals, lens: lens.name });
    }
  }
  return { ...look, nearby, nearest: nearest && nearest.km <= 300 ? { ...nearest, km: Math.round(nearest.km) } : null, place: place ? { kind: place.kind, name: place.name } : null };
}

// Compact season guide for a single site card.
export function siteSeason(guide) {
  return { temps: guide.temps, highlights: guide.highlights, animals: guide.animals, hasObservations: guide.hasObservations };
}
