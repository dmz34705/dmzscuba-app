// Everything a site card shows beyond the pin itself, assembled natively and sent to the map on request.
// Kept free of React so previews and checks build exactly what the app sends.
import { exposureAdvice } from './exposure';
import { placesForSite } from './places';
import { seasonGuide } from './seasons';
import { siteRatings } from './ratings';
import { catalogSite } from './catalog';
import { freshwaterLife, inlandProfile, isInland } from './inland';
import { siteImages as SITE_IMAGES, siteFacts as SITE_FACTS, siteProtection as SITE_PROTECTION,
  siteSeafloor as SITE_SEAFLOOR, siteShore as SITE_SHORE, siteBathymetry as SITE_BATHYMETRY,
  siteLakeDepths as SITE_LAKE_DEPTHS, siteProfiles as SITE_PROFILES } from './datasets';
import { nearbyDepths } from './nearbyDepths';
import { siteProfile } from './siteProfiles';

// request: { id, latitude, longitude, key } from the map. context: { origin, units, advicePrefs, diver }.
export function buildSiteGuide(request, { origin = null, units, advicePrefs, diver = null } = {}) {
  const record = typeof request.id === 'string' ? catalogSite(request.id.slice(0, 80)) : null;
  const site = record || { latitude: request.latitude, longitude: request.longitude, topologies: [] };
  const guide = seasonGuide(site);
  // Inland sites get their own guide: freshwater conditions and life instead of ocean data.
  const inland = isInland(site);
  const profile = inland ? inlandProfile(site) : null;
  const life = inland ? freshwaterLife(site) : null;
  if (inland) Object.assign(guide, { temps: null, highlights: [], animals: life, hasObservations: life.length > 0 });
  // Researched facts for this site (depth range, current, access, hazards…), each with its sources.
  const researched = record ? siteProfile(SITE_PROFILES, record.id, record.latitude, record.longitude) : null;
  const prefs = advicePrefs || { thermalTendency: 'typical', drysuitBelowC: 10 };
  const offset = { cold: 2, typical: 0, warm: -2 }[prefs.thermalTendency] || 0;
  const wear = Array.from({ length: 12 }, (_, month) => {
    const temperatureC = profile ? profile.surface?.[month] ?? null : guide.temps?.[month] ?? null;
    const advice = exposureAdvice({ site, inland: profile, temperatureC, comfortOffsetC: offset, drysuitBelowC: prefs.drysuitBelowC + offset });
    // The card gives the short version; Gear for this dive keeps the full reasoning.
    // A deep site's bottom can be far colder than the surface this is based on (the Andrea Doria at 73 m).
    const deepSite = !profile && !advice.dry && site.maxDepthMeters >= 30 && !site.depthIsWholeLake;
    const reason = advice.deepInland ? 'Cold below the thermocline — plan a drysuit until the bottom temperature is confirmed.'
      : deepSite ? 'Deep site — the bottom can be much colder than the surface. Confirm it before you choose.'
      : advice.dry ? 'Cold water — a drysuit with suitable insulation.'
        : advice.fullCoverage ? 'Full-length suit — protection from wreckage and rock.' : null;
    return { label: advice.label, temperatureC, reason, personal: Boolean(offset) };
  });
  return {
    key: String(request.key || '').slice(0, 120),
    guide: { temps: guide.temps, highlights: guide.highlights, animals: guide.animals, hasObservations: guide.hasObservations, inland: profile },
    wear,
    comfort: { motionSensitive: prefs.motionSensitive === true },
    // No published depth: the modelled seafloor at the pin (finer NOAA / EMODnet first) sets the experience level.
    ratings: { ...siteRatings(site, guide, { originPoint: origin, inland: profile, life, units,
      estimatedDepthMeters: record ? SITE_BATHYMETRY.sites[record.id]?.[0] ?? SITE_SEAFLOOR.sites[record.id]?.[0] ?? null : null }), inland: profile },
    profile: researched,
    // Numeric OpenDiveMap aggregates are community context, never promoted to
    // researched facts. Descriptions and thumbnails from directory sources are not imported.
    community: record?.communityVisibilityMeters ? { visibilityMeters: record.communityVisibilityMeters,
      rating: record.communityRating || null, loggedDives: record.communityDives || 0,
      averageDiveMinutes: record.communityDiveMinutes || null,
      source: 'OpenDiveMap community aggregate' } : null,
    structured: record && (record.structuredCurrent || record.structuredAccess || record.structuredHazards?.length || record.structuredMooring || record.structuredFee || record.structuredAccessEase || record.structuredEntryDetails?.length)
      ? { current: record.structuredCurrent || null,
        access: [record.structuredAccess, record.structuredFee ? 'Entry fee mapped' : ''].filter(Boolean).join(' · ') || null,
        hazards: record.structuredHazards || [], mooring: record.structuredMooring || null,
        accessEase: record.structuredAccessEase || null, entryDetails: record.structuredEntryDetails || [],
        source: 'OpenStreetMap structured tags' } : null,
    // Openly licensed photo of the site itself, when one exists.
    photo: record && SITE_IMAGES.images[record.id] ? (([url, attribution, license, page]) => ({ url, attribution, license, page }))(SITE_IMAGES.images[record.id]) : null,
    // Encyclopedia summary (Wikipedia, CC BY-SA) and, for wrecks, the ship's history (Wikidata, CC0).
    facts: record && SITE_FACTS.facts[record.id] ? (([summary, article, ship]) => ({ summary, article, ship: ship && { type: ship[0], builder: ship[1], flag: ship[2], length: ship[3], beam: ship[4], tonnage: ship[5], events: ship[6] || [], wikidata: ship[7] } }))(SITE_FACTS.facts[record.id]) : null,
    // Protected areas the site lies in, seafloor depth around the pin and shore facilities (OSM / NOAA ETOPO).
    protection: record ? (SITE_PROTECTION.sites[record.id] || []).map((i) => (([name, kind, url]) => ({ name, kind, url }))(SITE_PROTECTION.areas[i])) : [],
    seafloor: record && SITE_SEAFLOOR.sites[record.id] ? (([atPin, shallowest, deepest]) => ({ atPin, shallowest, deepest }))(SITE_SEAFLOOR.sites[record.id]) : null,
    // No published depth: finer seafloor (NOAA coastal DEMs / EMODnet), a lake's modelled deepest point
    // (GLOBathy) and the depths published for sites nearby.
    bathymetry: record && SITE_BATHYMETRY.sites[record.id] ? (([atPin, shallowest, deepest, source]) => ({ atPin, shallowest, deepest, source: SITE_BATHYMETRY.sources[source] }))(SITE_BATHYMETRY.sites[record.id]) : null,
    lakeDepth: record && SITE_LAKE_DEPTHS.sites[record.id] ? (([maxMeters, meanMeters, lakeName, source, url]) => ({ maxMeters, meanMeters, lakeName, published: source === 'wikidata', url: url || SITE_LAKE_DEPTHS.source.url }))(SITE_LAKE_DEPTHS.sites[record.id]) : null,
    nearbyDepths: record && !record.maxDepthMeters && !researched?.depth ? nearbyDepths(record) : null,
    shore: record && SITE_SHORE.sites[record.id] ? Object.fromEntries(SITE_SHORE.fields.map((kind, i) => [kind, SITE_SHORE.sites[record.id][i]]).filter(([, meters]) => meters != null)) : null,
    places: typeof request.id === 'string' ? placesForSite(request.id.slice(0, 80)) : [],
    diver,
  };
}
