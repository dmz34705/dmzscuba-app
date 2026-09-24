// "Get me here" research engine. Every site resolves through the same layers:
//   1. Origin      – typed place or current location (optional coordinates).
//   2. Destination – country › dive area › closest airports with scheduled service.
//   3. Arrival     – flight / road / ferry legs from the origin to the area.
//   4. Dive base   – operators and stay-and-dive options, then final access.
//   5. Before you go – considerations derived from the route itself.
// Curated profiles (destinationProfiles.js) only enrich these layers; no site
// depends on one. Destination access never routes to the approximate site pin.
import AIRPORT_DATA from './data/airports.json';
import { DIVE_REGIONS, REMOTE_DIVE_AREAS } from './diveRegions';
import { destinationProfile } from './destinationProfiles';
import OPERATORS from './data/diveOperators.json';
import { approxDistance } from './units';

const AREAS = [...DIVE_REGIONS.flatMap(region => region.areas), ...REMOTE_DIVE_AREAS];
const AIRPORTS = AIRPORT_DATA.airports.map(([code, name, city, country, latitude, longitude, large, connections]) => ({ code, name, city, country, latitude, longitude, large: large === 1,
  // Route data is dated; an airport OurAirports lists as large is never treated as merely regional.
  connections: large === 1 ? Math.max(connections, 10) : connections }));
const COUNTRY_NAMES = AIRPORT_DATA.countries;
const normalizeName = value => String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/\bst\.?\s/g, 'saint ').replace(/&/g, ' and ').replace(/\bthe\b/g, ' ').replace(/[^a-z]+/g, ' ').trim();
const COUNTRY_CODES = new Map(Object.entries(COUNTRY_NAMES).map(([code, name]) => [normalizeName(name), code]));
const SEA_NAME = /\b(sea|ocean|gulf|bay|strait|channel)\b/i;

const AREA_RADIUS_KM = 40;       // a dive area names a site only when it is genuinely local (Tulum is not Cozumel)
const CLOSE_AIRPORT_KM = 400;    // beyond this the closest airport is "remote access"
const HUB_RADIUS_KM = 900;       // gateways and hubs worth offering as alternatives
const REGIONAL_CONNECTIONS = 10; // fewer connected airports ⇒ usually reached via a hub
const ROAD_TRIP_KM = 600;        // origins this close are offered a ground route first

export function distanceKm(a, b) {
  const rad = value => value * Math.PI / 180;
  const dLat = rad(b.latitude - a.latitude), dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function countryCode(value) {
  if (!value) return null;
  if (/^[A-Z]{2}$/.test(value) && COUNTRY_NAMES[value]) return value;
  return COUNTRY_CODES.get(normalizeName(value)) || null;
}

export function nearestAirports(point, limit = 12) {
  if (!Number.isFinite(point?.latitude) || !Number.isFinite(point?.longitude)) return [];
  return AIRPORTS.map(airport => ({ ...airport, distanceKm: Math.round(distanceKm(point, airport)) }))
    .sort((a, b) => a.distanceKm - b.distanceKm).slice(0, limit);
}

const km = (value, units) => approxDistance(value, units);
// Prefer well-connected airports, discounted by distance from the site. Hubs
// abroad are discounted harder: a connection is only useful when it is close.
const gatewayScore = airport => airport.connections / (1 + airport.distanceKm / 300);
const hubScore = airport => airport.connections / (1 + (airport.distanceKm / 200) ** 2);
const best = (list, score = gatewayScore) => list.reduce((top, airport) => !top || score(airport) > score(top) ? airport : top, null);
const countryName = code => COUNTRY_NAMES[code] || code;
export const journeySearch = query => `https://www.google.com/search?q=${encodeURIComponent(query)}`;
export const mapsSearch = query => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
// Google Flights reads "Flights to X from Y" into its destination and origin fields.
export const flightSearch = (from, to) => `https://www.google.com/travel/flights?q=${encodeURIComponent(from ? `Flights to ${to} from ${from}` : `Flights to ${to}`)}`;
const ORIGIN_AIRPORT_KM = 250;

// Layer 1 → 3: the traveller's home airport — well connected, close, and in
// the same country as the start (never a cross-border hub).
const originScore = airport => airport.connections / (1 + (airport.distanceKm / 80) ** 2);
export function originAirport(point) {
  const nearby = nearestAirports(point, 40).filter(airport => airport.distanceKm <= ORIGIN_AIRPORT_KM);
  return best(nearby.filter(airport => airport.country === nearby[0]?.country), originScore);
}
const COORDINATES = /^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/;
export function journeyDirections(origin, destination) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}${origin ? `&origin=${encodeURIComponent(origin)}` : ''}`;
}

// Layer 2: where is this site, and which airports actually serve it?
// `locality` is an optional reverse-geocoded "town, region" for the site.
export function resolveDestination(site, locality = '') {
  const profile = destinationProfile(site);
  const airports = nearestAirports(site, 60);
  const closest = airports[0] || null;
  const reachable = airports.filter(airport => airport.distanceKm <= HUB_RADIUS_KM);
  const listed = countryCode(profile?.country) || countryCode(site.country);
  // Territories (e.g. Puerto Rico listed as "United States") resolve to the
  // jurisdiction whose airports actually serve the site.
  const code = (listed && reachable.some(airport => airport.country === listed) ? listed : closest?.country) || listed || null;
  const country = COUNTRY_NAMES[code] || site.country || '';
  const area = AREAS.map(candidate => ({ candidate, distance: distanceKm(site, candidate) }))
    .filter(entry => entry.distance <= AREA_RADIUS_KM).sort((a, b) => a.distance - b.distance)[0]?.candidate;
  const region = site.region && !SEA_NAME.test(site.region) && site.region !== country ? site.region : '';
  const town0 = String(locality || '').split(',')[0].trim();
  const areaName = profile?.name || area?.name || region || (site.kind === 'area' ? site.name : '') || town0 || country || 'this dive area';
  const place = [areaName, country].filter((part, index, all) => part && all.indexOf(part) === index).join(', ');
  const town = profile?.town?.(site) || (town0 ? [town0, country].filter(Boolean).join(', ') : place);
  const gateway = best(reachable.filter(airport => airport.country === code)) || airports.find(airport => airport.country === code) || null;
  const hub = best(reachable, hubScore);
  return { site, profile, country, countryCode: code, areaName, place, town, closest, gateway, hub,
    remote: !closest || closest.distanceKm > CLOSE_AIRPORT_KM, base: profile?.base?.(site) || null };
}

// Layer 3 options: curated routes when known, otherwise derived from real airports.
export function arrivalOptions(destination, originPoint, units = 'imperial') {
  const { profile, closest, gateway, hub, countryCode: code } = destination;
  const options = [];
  const tripKm = originPoint ? distanceKm(originPoint, destination.site) : null;
  const byRoad = tripKm != null && tripKm <= ROAD_TRIP_KM;
  if (profile) {
    for (const arrival of profile.arrivals) {
      const airport = AIRPORTS.find(entry => entry.code === arrival.code);
      options.push({ ...arrival, airport: airport ? { ...airport, distanceKm: Math.round(distanceKm(destination.site, airport)) } : null, curated: true });
    }
  } else {
    const picks = [];
    const add = (airport, label, note) => {
      if (!airport || picks.some(pick => pick.code === airport.code)) return;
      const abroad = airport.country !== code ? ` · in ${countryName(airport.country)}` : '';
      picks.push({ ...airport, label, summary: `${km(airport.distanceKm, units)} from the site${abroad}${note ? ` · ${note}` : ''}` });
    };
    const closestLabel = destination.remote ? 'Closest airport (remote)' : 'Closest airport';
    const regional = airport => airport.connections < REGIONAL_CONNECTIONS ? 'regional flights' : '';
    const addGateway = () => gateway && gateway.distanceKm <= HUB_RADIUS_KM
      && add(gateway, `Main airport for ${destination.country}`, gateway.connections >= 2 * (closest?.connections || 0) ? 'most flight choices' : regional(gateway));
    // Lead with the closest airport when it has real connections, otherwise with the country's main airport.
    if (closest && !regional(closest)) { add(closest, closestLabel, 'international flights'); addGateway(); }
    else { addGateway(); if (closest) add(closest, closestLabel, regional(closest)); }
    // A nearby hub helps when every local airport is regional.
    if (hub && picks.every(pick => pick.connections < REGIONAL_CONNECTIONS) && hub.connections >= 2 * REGIONAL_CONNECTIONS) add(hub, 'Connect via a regional hub', 'onward by flight or ferry');
    for (const airport of picks.slice(0, 3)) {
      options.push({ code: airport.code, name: airport.name, label: airport.label, summary: airport.summary, airport });
    }
  }
  const road = { code: 'ROAD', label: 'Travel overland', summary: tripKm != null ? `${km(tripKm, units)} from your start · drive, bus or ferry` : 'If you are within driving distance', road: true };
  if (byRoad) options.unshift({ ...road, label: 'Go overland', recommended: true });
  else if (profile?.road) options.push(road);
  return options;
}

function transferLeg(destination, airport, from, units) {
  const { site, town, place, countryCode: code } = destination;
  const gap = airport ? Math.round(distanceKm(site, airport)) : null;
  const foreign = airport && airport.country !== code;
  const detail = !airport ? `Travel from ${from} to ${place}. The directions link shows road and ferry options.`
    : gap < 15 ? `The dive area is close to ${airport.name}; a short taxi or pre-arranged pickup is typical.`
    : `${km(gap, units)} separate ${airport.name} from the dive area. ${foreign ? `The airport is in ${countryName(airport.country)}, so expect a ferry, connecting flight or border crossing — carry documents for both countries. ` : ''}It may be a road transfer, ferry or short connecting flight; the directions link shows which.`;
  return { mode: foreign ? 'CONNECT' : 'LAND', title: `Reach your base in ${destination.base || destination.areaName}`, detail, action: 'Directions to the base area', url: journeyDirections(from, town) };
}

function diveLeg(destination, units) {
  const { site, place, remote, closest } = destination;
  const shore = site.entry === 'shore';
  const detail = shore ? 'Listed as a shore dive. Confirm the public entrance, parking, conditions and any permits locally before going in.'
    : remote ? `This site is ${km(closest?.distanceKm ?? 0, units)} from the nearest scheduled airport. It is usually reached by liveaboard, charter or expedition; confirm with an operator before booking flights.`
    : 'Arrange the dive with a local operator. They confirm the departure dock or entry, boat trip and whether the site is diving. The map pin may be approximate.';
  return { mode: 'DIVE', title: site.name, detail, action: remote ? 'Find liveaboards and charters' : 'Find dive operators',
    url: remote ? journeySearch(`${site.name} ${place} liveaboard charter`) : mapsSearch(`dive center near ${place}`) };
}

// Layer 3 legs for the chosen option.
export function journeyLegs(destination, option, { origin = '', originPoint = null, local = false, units = 'imperial' } = {}) {
  const from = origin.trim() || 'your departure city';
  const legs = [];
  let transferFrom = origin.trim();
  let airport = null;
  if (!local && option && !option.road) {
    airport = option.airport;
    const code = option.code || airport?.code;
    const name = airport?.name || option.name;
    const home = originPoint ? originAirport(originPoint) : null;
    // A typed or geocoded place lets Google Flights include every airport around it; raw coordinates need the code.
    const departFrom = origin.trim() && !COORDINATES.test(origin.trim()) ? origin.trim() : home && home.code !== code ? home.code : '';
    const route = home && home.code !== code ? `${home.code} → ${code}` : code;
    legs.push({ mode: 'AIR', title: `Fly ${route} · ${name}`, detail: `${home ? `Nearest major airport to your start: ${home.name} (${home.code}), ${approxDistance(home.distanceKm, units)} away. ` : origin.trim() ? `From ${from}. ` : 'Add a starting point to fill in your departure airport. '}${airport && airport.connections < REGIONAL_CONNECTIONS ? 'This is a regional airport, usually reached with a connection through a larger hub. Small aircraft can have strict baggage limits — check before packing dive gear.' : 'Direct flights and connections depend on your departure airport.'}`,
      action: 'Explore flights', url: flightSearch(departFrom, code), departure: home });
    transferFrom = name;
    for (const step of option.via || []) {
      legs.push({ mode: step.mode, title: step.title, detail: step.detail, action: step.action || 'View route', url: step.url || journeyDirections(step.from, step.to) });
      transferFrom = step.arriveAt || step.to;
    }
  }
  const transfer = transferLeg(destination, option?.via ? null : airport, transferFrom, units);
  legs.push(option?.via || option?.curated ? { ...transfer, mode: 'LAND', detail: `Use ${destination.town} as your starting area. Confirm your operator’s meeting point before arranging the final transfer.` } : transfer);
  legs.push(diveLeg(destination, units));
  return legs;
}

// Layer 4: who can take you diving, and where to stay. OpenStreetMap operators are listed purely by
// distance from the site (no ranking or promotion); hand-sourced profile entries follow, de-duplicated.
const OPERATOR_KM = 30, OPERATOR_WIDE_KM = 80, OPERATOR_LIMIT = 8;
const sameName = (a, b) => { const n = s => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); const x = n(a), y = n(b); return x === y || x.includes(y) || y.includes(x); };
export function nearbyOperators(site, stays = false) {
  if (!Number.isFinite(site?.latitude)) return [];
  const rows = OPERATORS.places.filter(row => (row[4] >= 3) === stays);
  const withDistance = rows.map(([id, name, latitude, longitude, kind, website, phone]) => ({ id, name, latitude, longitude, kind: OPERATORS.kinds[kind], website, phone,
    distanceKm: distanceKm(site, { latitude, longitude }) })).filter(entry => entry.distanceKm <= OPERATOR_WIDE_KM).sort((a, b) => a.distanceKm - b.distanceKm);
  const close = withDistance.filter(entry => entry.distanceKm <= OPERATOR_KM);
  return (close.length ? close : withDistance.slice(0, 3)).slice(0, OPERATOR_LIMIT).map(entry => {
    const type = { n: 'node', w: 'way', r: 'relation' }[entry.id[0]];
    return { name: entry.name, distanceKm: Math.round(entry.distanceKm * 10) / 10, kind: entry.kind, phone: entry.phone,
      url: entry.website || `https://www.openstreetmap.org/${type}/${entry.id.slice(1)}`, detail: entry.website ? new URL(entry.website).hostname.replace(/^www\./, '') : 'OpenStreetMap listing', source: 'osm' };
  });
}
export function diveBase(destination) {
  const { profile, place, site } = destination;
  const merge = (osm, curated) => [...osm, ...curated.filter(item => !osm.some(entry => sameName(entry.name, item.name))).map(item => ({ ...item, source: 'curated' }))];
  return {
    operators: merge(nearbyOperators(site, false), profile?.operators || []), stays: merge(nearbyOperators(site, true), profile?.stays || []),
    searches: [
      { kind: 'operators', title: 'Dive operators on the map', detail: `Dive centers around ${place}, with reviews and locations.`, url: mapsSearch(`dive center near ${place}`) },
      { kind: 'stays', title: 'Stay & dive packages', detail: `Dive resorts and hotels that bundle diving in ${place}.`, url: journeySearch(`dive resort stay and dive package ${place}`) },
      { kind: 'stays', title: 'Hotels near the dive area', detail: 'Pick a base close to your operator’s dock or shop to cut daily transfers.', url: mapsSearch(`hotels near ${destination.town}`) },
    ],
  };
}

// Layer 5: things divers tend to miss, derived from the route.
export function considerations(destination, option, units = 'imperial') {
  const { profile, remote, country, closest } = destination;
  const items = [...(profile?.considerations || [])];
  if (remote) items.push({ title: 'Remote destination', detail: `The nearest scheduled airport is ${km(closest?.distanceKm ?? 0, units)} away. Book the boat or liveaboard first, then flights that match its departure schedule. Evacuation cover matters here.` });
  if (option?.airport && option.airport.country !== destination.countryCode) items.push({ title: 'Two countries on one trip', detail: `Your arrival airport and the dive site are in different countries. Check entry rules for each and any ferry or connecting-flight schedule between them.` });
  items.push(
    { title: `Entry requirements for ${country || 'your destination'}`, detail: 'Check passport validity, visa or travel-authorization rules and any departure tax before booking.', url: journeySearch(`${country} entry requirements for travelers`) },
    { title: 'No flying right after diving', detail: 'Leave a surface interval before your flight home — DAN suggests at least 18 hours after multiple dives or multiple days of diving. Plan your last dive day accordingly.', url: journeySearch('DAN flying after diving guidelines') },
    { title: 'Cards, insurance and fees', detail: 'Bring your certification card (and nitrox card if needed), confirm dive insurance, and ask operators about marine-park or reserve fees.' },
  );
  return items;
}

export function planJourney(site, { origin = '', originPoint = null, locality = '', arrivalIndex = 0, local = false, units = 'imperial' } = {}) {
  const destination = resolveDestination(site, locality);
  const arrivals = arrivalOptions(destination, originPoint, units);
  const option = arrivals[arrivalIndex] || arrivals[0] || null;
  return { destination, arrivals, option, legs: journeyLegs(destination, option, { origin, originPoint, local, units }), base: diveBase(destination), considerations: considerations(destination, option, units) };
}
