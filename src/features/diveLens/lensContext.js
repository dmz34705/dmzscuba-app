import { catalogSite } from '../oceanAtlas/catalog';
import { freshwaterLife, isInland } from '../oceanAtlas/inland';
import { seasonGuide } from '../oceanAtlas/seasons';

const MAX_NEARBY_SPECIES = 24;

function coordinates(site) {
  return Number.isFinite(site?.latitude) && Number.isFinite(site?.longitude)
    ? { latitude: site.latitude, longitude: site.longitude }
    : null;
}

// Dive computers record their salinity *setting*, which divers rarely change
// between lake and ocean dives, so an imported water type is not evidence
// unless the diver confirmed it in the log.
function trustedWaterType(dive) {
  const type = dive?.water?.type;
  if (!['fresh', 'salt'].includes(type)) return null;
  const imported = (dive.source && dive.source !== 'manual') || (Array.isArray(dive.logIds) && dive.logIds.length > 0);
  return !imported || dive.water.typeConfirmed === true ? type : null;
}

function inferredWaterType(dive, atlasSite) {
  // An inland Ocean Atlas site is authoritative, whatever the log says.
  if (atlasSite && isInland(atlasSite)) return 'fresh';
  const trusted = trustedWaterType(dive);
  if (trusted) return trusted;
  const name = [dive?.site?.name, dive?.site?.location].filter(Boolean).join(' ');
  return /\b(lake|quarry|freshwater|river|spring|mine)\b/i.test(name) ? 'fresh' : 'unknown';
}

function contextSpecies(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => typeof row?.scientific === 'string' && row.scientific.trim())
    .sort((a, b) => (b.group === 'Actinopterygii') - (a.group === 'Actinopterygii') || (b.records || 0) - (a.records || 0))
    .slice(0, MAX_NEARBY_SPECIES)
    .map((row) => ({
      commonName: String(row.common || '').trim().slice(0, 100),
      scientificName: row.scientific.trim().slice(0, 120),
      records: Number.isFinite(row.records) ? Math.max(0, Math.round(row.records)) : null,
    }));
}

// Produces coarse ecological context only. Exact coordinates stay on-device;
// the private inference host receives a site label, water type, month and the
// app's already-bundled nearby taxa.
export function buildLensContext(dive, capturedAt = null) {
  if (!dive || typeof dive !== 'object') return null;
  const storedSite = dive.site || {};
  const atlasSite = storedSite.siteId ? catalogSite(storedSite.siteId) : null;
  const point = coordinates(atlasSite) || coordinates(storedSite);
  const waterType = inferredWaterType(dive, atlasSite);
  let nearby = [];
  if (point) {
    nearby = waterType === 'fresh'
      ? freshwaterLife(point)
      : waterType === 'salt' ? seasonGuide(point).animals : [];
  }
  const time = new Date(capturedAt || dive.startTime || '');
  const month = Number.isNaN(time.getTime()) ? null : time.getMonth() + 1;
  return {
    waterType,
    siteName: String(storedSite.name || atlasSite?.name || '').trim().slice(0, 120),
    month,
    nearbySpecies: contextSpecies(nearby),
  };
}
