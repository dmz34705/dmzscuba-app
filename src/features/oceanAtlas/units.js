// Distance, depth, elevation and area text for the atlas in the diver's chosen units.
// The app has one unit switch for length (Settings → depth unit): feet → imperial
// (ft, mi, sq mi), metres → metric (m, km, km²). atlasRuntime.js mirrors these for the map.
export const FT_PER_M = 3.28084;
export const KM_PER_MI = 1.609344;

export const unitSystem = settings => settings?.depthUnit === 'm' ? 'metric' : 'imperial';
const imperial = units => units !== 'metric';
const whole = value => Math.round(value).toLocaleString();

export const depthText = (metres, units) => imperial(units) ? `${whole(metres * FT_PER_M)} ft` : `${whole(metres)} m`;
export const elevationText = (metres, units) => imperial(units) ? `${whole(metres * FT_PER_M)} ft` : `${whole(metres)} m`;

// Exact-ish distance: "<1 mi", "0.4 km" stays whole units except under 10.
export function distanceText(km, units) {
  const value = imperial(units) ? km / KM_PER_MI : km;
  const unit = imperial(units) ? 'mi' : 'km';
  if (value < 1) return `under 1 ${unit}`;
  return `${value < 10 ? Math.round(value * 10) / 10 : whole(value)} ${unit}`;
}

// Rounded travel distance for sentences: "under 10 km", "about 45 mi".
export function approxDistance(km, units) {
  const value = imperial(units) ? km / KM_PER_MI : km;
  const unit = imperial(units) ? 'mi' : 'km';
  return value < 10 ? `under 10 ${unit}` : `about ${(Math.round(value / 5) * 5).toLocaleString()} ${unit}`;
}

export const areaText = (km2, units) => imperial(units) ? `${whole(km2 / KM_PER_MI ** 2)} sq mi` : `${whole(km2)} km²`;
