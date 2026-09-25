// Which dive site a dive happened at, and how sure we are. Evidence, strongest first:
//   plan     – a dive day planned for that date at a linked site (boat dives leave from a dock,
//              so the phone can be kilometres from the site and this still holds);
//   location – the phone's breadcrumb near a site the diver pinned, or an Ocean Atlas site;
//   computer – the dive was downloaded from a dive computer, so its time is real.
// A dive linked to a site with computer + location evidence is "verified". Pure and storage-free.

export const NEAR_MY_SITE_METERS = 500;
export const NEAR_ATLAS_SITE_METERS = 400;
export const PLAN_REACH_METERS = 25000;
export const PLAN_CLOSE_METERS = 2000;
// Another site this much further away still counts as a real alternative worth offering.
const ALTERNATIVE_MARGIN_METERS = 150;
export const BREADCRUMB_WINDOW_MS = 60 * 60 * 1000;

export function distanceMeters(a, b) {
  if (![a?.latitude, a?.longitude, b?.latitude, b?.longitude].every(Number.isFinite)) return null;
  const rad = (value) => value * Math.PI / 180;
  const h = Math.sin(rad(b.latitude - a.latitude) / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(rad(b.longitude - a.longitude) / 2) ** 2;
  return Math.round(12742000 * Math.asin(Math.sqrt(h)));
}

// The dive's calendar date as logged (computers record local wall-clock time).
export const diveDate = (startTime) => (/^\d{4}-\d{2}-\d{2}/.test(String(startTime || '')) ? String(startTime).slice(0, 10) : '');

const asCandidate = (site, source, distance, extra = {}) => ({
  site: { id: site.id, name: site.name, latitude: site.latitude, longitude: site.longitude, area: site.area || [site.region, site.country].filter(Boolean).join(', '), source },
  distanceMeters: distance, ...extra,
});

/**
 * @param point {latitude, longitude} where the phone was (or the dive's own coordinates)
 * @param dive  {startTime}
 * @param sources {plans, mySites, sites}
 * @returns {{ site, distanceMeters, reason: 'planned'|'nearby', confidence: 'high'|'medium', planId?, alternatives }} | null
 */
export function matchDiveSite(point, dive, { plans = [], mySites = [], sites = [] } = {}) {
  if (!Number.isFinite(point?.latitude) || !Number.isFinite(point?.longitude)) return null;
  const date = diveDate(dive?.startTime);

  // A dive day planned for this date at a linked site wins when the phone was within boat range.
  const planned = plans
    .filter((plan) => plan?.kind === 'day' && plan.status !== 'cancelled' && plan.startDate === date && plan.destination?.siteId && Number.isFinite(plan.destination.latitude))
    .map((plan) => ({ plan, distance: distanceMeters(point, plan.destination) }))
    .filter(({ distance }) => distance != null && distance <= PLAN_REACH_METERS)
    .sort((a, b) => a.distance - b.distance)[0];

  const nearby = [
    ...mySites.map((site) => ({ site, source: 'mine', radius: NEAR_MY_SITE_METERS })),
    ...sites.map((site) => ({ site, source: 'atlas', radius: NEAR_ATLAS_SITE_METERS })),
  ].map((entry) => ({ ...entry, distance: distanceMeters(point, entry.site) }))
    .filter(({ distance, radius }) => distance != null && distance <= radius)
    .sort((a, b) => a.distance - b.distance || (a.source === 'mine' ? -1 : 1));

  if (planned) {
    const { plan, distance } = planned;
    const site = { id: plan.destination.siteId, name: plan.destination.name, latitude: plan.destination.latitude, longitude: plan.destination.longitude, area: plan.destination.custom ? 'My site' : plan.destination.area };
    return { ...asCandidate(site, plan.destination.custom ? 'mine' : 'atlas', distance), reason: 'planned', planId: plan.id,
      confidence: distance <= PLAN_CLOSE_METERS ? 'high' : 'medium',
      alternatives: nearby.filter((entry) => entry.site.id !== site.id).slice(0, 2).map((entry) => asCandidate(entry.site, entry.source, entry.distance)) };
  }
  if (!nearby.length) return null;
  const [best, ...rest] = nearby;
  const close = rest.filter((entry) => entry.distance <= best.distance + ALTERNATIVE_MARGIN_METERS);
  return { ...asCandidate(best.site, best.source, best.distance), reason: 'nearby',
    // Several sites around the same spot (a reef line, a quarry's entries) are offered as choices.
    confidence: !close.length && best.distance <= best.radius / 2 ? 'high' : 'medium',
    alternatives: close.slice(0, 2).map((entry) => asCandidate(entry.site, entry.source, entry.distance)) };
}

// How a linked dive is backed up. `breadcrumb` is the phone point used (with its time gap), if any.
export function verificationFor(dive, match, breadcrumb, now = new Date()) {
  const methods = [];
  if (Array.isArray(dive?.logIds) && dive.logIds.length) methods.push('computer');
  const nearSite = match && match.distanceMeters != null && match.distanceMeters <= (match.reason === 'planned' ? PLAN_REACH_METERS : NEAR_MY_SITE_METERS);
  if (breadcrumb && Number.isFinite(breadcrumb.distanceMs) && breadcrumb.distanceMs <= BREADCRUMB_WINDOW_MS && nearSite) methods.push('location');
  if (match?.reason === 'planned') methods.push('plan');
  return {
    status: methods.includes('computer') && methods.includes('location') ? 'verified' : 'linked',
    methods, planId: match?.planId || '', distanceMeters: match?.distanceMeters ?? null, linkedAt: now.toISOString(),
  };
}

// Dives per site (by site id), for atlas pins and site pages.
export function siteDiveStats(dives) {
  const stats = new Map();
  for (const dive of Array.isArray(dives) ? dives : []) {
    const id = dive?.site?.siteId || dive?.siteId;
    if (!id || dive.deletedAt) continue;
    const entry = stats.get(id) || { count: 0, verified: 0, last: '' };
    entry.count += 1;
    if ((dive.site?.verification?.status || dive.siteVerification) === 'verified') entry.verified += 1;
    if (String(dive.startTime || '') > entry.last) entry.last = String(dive.startTime);
    stats.set(id, entry);
  }
  return stats;
}

// Atlas pin tiers: the more dives at a site, the bigger and warmer its pin.
export const DIVE_TIERS = Object.freeze([
  { min: 1, label: 'First visit' }, { min: 2, label: 'Returning' }, { min: 5, label: 'Regular' }, { min: 10, label: 'Home water' }, { min: 25, label: 'Local legend' },
]);
export const diveTier = (count) => DIVE_TIERS.reduce((tier, entry, index) => (count >= entry.min ? index + 1 : tier), 0);

// Dives logged on a dive day's date at its linked site.
export function planDives(plan, rows) {
  if (!plan?.destination?.siteId || !plan.startDate) return [];
  return (Array.isArray(rows) ? rows : []).filter((row) => row && !row.deletedAt && (row.siteId || row.site?.siteId) === plan.destination.siteId && diveDate(row.startTime) >= plan.startDate && diveDate(row.startTime) <= (plan.endDate || plan.startDate));
}
