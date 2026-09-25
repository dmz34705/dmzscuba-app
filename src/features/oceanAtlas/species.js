// Species search and "where divers see it" guides for the atlas, from the same evidence as
// seasons.js: iNaturalist research-grade sightings (data/marineLife.json, with seasons),
// OBIS survey records (data/marineLifeObis.json, place only) and the sourced regional
// seasons in regions.js. Dive sites are the catalog sites inside each sighting area.
import MARINE_LIFE from './data/marineLife.json';
import MARINE_LIFE_OBIS from './data/marineLifeObis.json';
import { MARINE_REGIONS } from './regions';
import { catalogSites } from './catalog';
import { DIVE_REGIONS, REMOTE_DIVE_AREAS } from './diveRegions';
import { placeAt } from './places';
import { nearestAirports } from './journey';
import AIRPORT_DATA from './data/airports.json';

const TAXA = { ...MARINE_LIFE_OBIS.taxa, ...MARINE_LIFE.taxa };
const PLACES = [...MARINE_LIFE.places.map(place => [...place, false]), ...MARINE_LIFE_OBIS.places.map(place => [...place, true])];
const SITE_SLACK_KM = 10;     // a site just outside a sighting radius still counts
const PLACE_LIMIT = 30;       // places listed in one guide
const SITES_PER_PLACE = 4;
const AREA_NAME_KM = 80;      // a featured dive area this close names an unnamed sighting area
const TOWN_NAME_KM = 250;     // otherwise the nearest airport town ("Near Phuket, Thailand")
// Encounters divers travel for, in the order Discover shows them (only those with evidence appear).
const ICONIC = ['Rhincodon typus', 'Mobula birostris', 'Mobula alfredi', 'Sphyrna lewini', 'Megaptera novaeangliae', 'Galeocerdo cuvier',
  'Chelonia mydas', 'Eretmochelys imbricata', 'Mola mola', 'Dugong dugon', 'Zalophus wollebaeki', 'Tursiops truncatus'];

function distanceKm(a, b) {
  const rad = value => value * Math.PI / 180;
  const h = Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
const monthsFromMask = mask => Array.from({ length: 12 }, (_, i) => i).filter(i => mask & (1 << i));
const capitalize = text => text ? text[0].toUpperCase() + text.slice(1) : text;
const normalize = text => String(text || '').toLowerCase();
const taxonInfo = id => {
  const [common, scientific, group, url, attribution, license] = TAXA[id] || [];
  return common ? { key: String(id), common: capitalize(common), scientific, group, photo: url ? { url, attribution, license } : null } : null;
};
const curatedFor = scientific => MARINE_REGIONS.flatMap(region => region.species
  .filter(entry => normalize(entry.scientific) === normalize(scientific))
  .map(entry => ({ regionId: region.id, speciesId: entry.id, region: region.name, name: entry.name, season: entry.season,
    months: entry.months.map(m => m - 1), source: entry.source, url: entry.url })));

// Some sighting areas are unnamed in the source: use the nearest featured dive area, a sourced
// wildlife region it lies in, then the country; never leave a blank heading.
const AREAS = [...DIVE_REGIONS.flatMap(region => region.areas), ...REMOTE_DIVE_AREAS];
const placeNameAt = point => { try { return placeAt(point.latitude, point.longitude)?.name || ''; } catch { return ''; } };
function placeName(place, nearestSite) {
  if (place.name) return place.name;
  const areas = AREAS.map(candidate => [distanceKm(place, candidate), candidate]).sort((a, b) => a[0] - b[0]);
  if (areas[0]?.[0] <= AREA_NAME_KM) return areas[0][1].name;
  const region = MARINE_REGIONS.find(r => r.bounds && place.latitude >= r.bounds[0] && place.latitude <= r.bounds[2] && place.longitude >= r.bounds[1] && place.longitude <= r.bounds[3]);
  if (region) return region.name;
  // Sighting centres often sit offshore; the nearest dive site's island, state or country is on land.
  const named = (nearestSite && placeNameAt(nearestSite)) || placeNameAt(place);
  if (named) return named;
  const town = nearestAirports(place, 1)[0];
  if (town && town.distanceKm <= TOWN_NAME_KM) return `Near ${[town.city || town.name, AIRPORT_DATA.countries[town.country]].filter(Boolean).join(', ')}`;
  if (areas[0]?.[0] <= AREA_NAME_KM * 4) return `Near ${areas[0][1].name}`;
  return `Sighting area ${Math.abs(place.latitude).toFixed(1)}°${place.latitude < 0 ? 'S' : 'N'}, ${Math.abs(place.longitude).toFixed(1)}°${place.longitude < 0 ? 'W' : 'E'}`;
}

let index = null;
// Every species with evidence: [key, common name, scientific name, group, places, sightings].
// Regional-guide species without a sightings taxon are keyed by their scientific name.
export function speciesIndex() {
  if (index) return index;
  const stats = new Map();
  for (const [, , , , species] of PLACES) {
    for (const [id, records] of species) {
      const entry = stats.get(String(id)) || { places: 0, records: 0 };
      entry.places++; entry.records += records; stats.set(String(id), entry);
    }
  }
  const rows = [...stats].map(([id, { places, records }]) => {
    const info = taxonInfo(id);
    return info && [info.key, info.common, info.scientific, info.group || '', places, records];
  }).filter(Boolean);
  const known = new Set(rows.map(row => normalize(row[2])));
  for (const region of MARINE_REGIONS) for (const entry of region.species) {
    if (known.has(normalize(entry.scientific))) continue;
    known.add(normalize(entry.scientific));
    rows.push([`sci:${entry.scientific}`, entry.name, entry.scientific, '', 0, 0]);
  }
  index = rows.sort((a, b) => b[5] - a[5] || a[1].localeCompare(b[1]));
  return index;
}

function resolve(key) {
  const text = String(key || '');
  if (text.startsWith('sci:')) {
    const scientific = text.slice(4);
    const id = Object.keys(TAXA).find(k => normalize(TAXA[k][1]) === normalize(scientific));
    if (id) return taxonInfo(id);
    const curated = MARINE_REGIONS.flatMap(r => r.species).find(entry => normalize(entry.scientific) === normalize(scientific));
    return curated ? { key: text, common: curated.name, scientific: curated.scientific, group: '', photo: null } : null;
  }
  return taxonInfo(text);
}

// Where divers see one species: sighting areas ranked by records (seasonal first, then survey-only),
// each with the nearest catalog dive sites, the sourced regional seasons and a monthly profile.
export function speciesGuide(key) {
  const info = resolve(key);
  if (!info) return null;
  const id = Number(info.key);
  const places = [];
  const activity = Array(12).fill(0);
  if (Number.isFinite(id)) {
    for (const [latitude, longitude, radiusKm, name, species, survey] of PLACES) {
      const hit = species.find(([taxonId]) => taxonId === id);
      if (!hit) continue;
      const [, records, peakMask, digits] = hit;
      if (!survey && digits) digits.split('').forEach((d, m) => { activity[m] += Number(d) * records; });
      places.push({ name, latitude, longitude, radiusKm, records, survey, peakMonths: survey ? [] : monthsFromMask(peakMask) });
    }
  }
  places.sort((a, b) => a.survey - b.survey || b.records - a.records);
  const shown = places.slice(0, PLACE_LIMIT);
  const sites = catalogSites();
  for (const place of shown) {
    const near = [];
    for (const site of sites) {
      const km = distanceKm(place, site);
      if (km <= place.radiusKm + SITE_SLACK_KM) near.push([km, site]);
    }
    near.sort((a, b) => a[0] - b[0]);
    place.name = placeName(place, near[0]?.[1] || sites.reduce((best, site) => {
      const km = distanceKm(place, site);
      return km <= place.radiusKm + 100 && (!best || km < best.km) ? { km, latitude: site.latitude, longitude: site.longitude } : best;
    }, null));
    place.siteCount = near.length;
    place.sites = near.slice(0, SITES_PER_PLACE).map(([km, site]) => ({ id: site.id, name: site.name, distanceKm: Math.round(km * 10) / 10 }));
  }
  // Two areas under one name (Kona and Maui are both "Hawaiian Islands") are told apart by their nearest site.
  const names = new Map();
  for (const place of shown) names.set(place.name, (names.get(place.name) || 0) + 1);
  for (const place of shown) if (names.get(place.name) > 1 && place.sites[0]) place.name = `${place.name} · ${place.sites[0].name}`;
  const top = Math.max(...activity);
  return {
    ...info,
    months: top > 0 ? activity.map(value => Math.round(value / top * 100) / 100) : null,
    curated: curatedFor(info.scientific),
    places: shown, placeCount: places.length,
    sightings: places.filter(p => !p.survey).reduce((sum, p) => sum + p.records, 0),
    sources: [{ name: MARINE_LIFE.source, url: MARINE_LIFE.sourceUrl }, { name: MARINE_LIFE_OBIS.source, url: MARINE_LIFE_OBIS.sourceUrl }],
  };
}

// Discover: what is in season this month (sourced regional windows) and the encounters divers travel for.
export function discoverSpecies(month) {
  const rows = speciesIndex();
  const bySci = new Map(rows.map(row => [normalize(row[2]), row]));
  const keyOf = scientific => bySci.get(normalize(scientific))?.[0] || `sci:${scientific}`;
  const seen = new Set();
  const inSeason = [];
  for (const region of MARINE_REGIONS) for (const entry of region.species) {
    if (!entry.months.includes(month + 1) || entry.months.length >= 12) continue;
    // Sightings names where the species has them, so the same animal reads the same everywhere.
    inSeason.push({ key: keyOf(entry.scientific), name: bySci.get(normalize(entry.scientific))?.[1] || entry.name, place: region.name, regionId: region.id, span: entry.months.length });
  }
  const seasonal = inSeason.sort((a, b) => a.span - b.span || a.name.localeCompare(b.name))
    .filter(pick => !seen.has(pick.name) && seen.add(pick.name)).slice(0, 8);
  const iconic = ICONIC.map(scientific => bySci.get(normalize(scientific))).filter(row => row && row[4] > 0)
    .map(([key, name, , , places]) => ({ key, name, places }));
  return { month, inSeason: seasonal, iconic };
}
