// Manual site corrections share the same rules in single and bulk editors.
export function validDiveCoordinate(latitude, longitude) {
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

export function manualDiveSite(selection, now = new Date()) {
  if (!selection || !validDiveCoordinate(selection.latitude, selection.longitude)) return null;
  const siteId = typeof selection.id === 'string' ? selection.id : '';
  return {
    name: siteId ? String(selection.name || '') : '',
    location: siteId ? String(selection.region || selection.area || '') : '',
    country: siteId ? String(selection.country || '') : '',
    latitude: selection.latitude, longitude: selection.longitude,
    siteId, siteSource: siteId ? (selection.custom ? 'mine' : 'atlas') : '',
    verification: siteId ? { status: 'linked', methods: ['manual'], planId: '', distanceMeters: null, linkedAt: now.toISOString() } : null,
  };
}

// Retain a saved link only while its identifying fields still match the form.
export function editedDiveSite(site, linkedSite) {
  const unchanged = linkedSite && site.name === linkedSite.name
    && site.latitude === linkedSite.latitude && site.longitude === linkedSite.longitude;
  return { ...site, siteId: unchanged ? linkedSite.siteId || '' : '',
    siteSource: unchanged ? linkedSite.siteSource || '' : '',
    verification: unchanged ? linkedSite.verification || null : null };
}
