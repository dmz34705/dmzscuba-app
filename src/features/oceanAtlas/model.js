export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function validCoordinate(latitude, longitude) {
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
}

// Only saved, confirmed dive coordinates belong on the personal layer.
// In particular, a site name alone must never silently geocode a dive.
// One map pin per dive site the diver linked (so repeat visits stack into one growing pin), else per spot.
export function groupDivePins(dives) {
  const groups = new Map();
  for (const dive of dives) {
    if (dive.deletedAt || !validCoordinate(dive.site?.latitude, dive.site?.longitude)) continue;
    const { latitude, longitude } = dive.site;
    const siteId = dive.site.siteId || '';
    const key = siteId ? `site:${siteId}` : `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
    const group = groups.get(key) || { id: siteId ? `log-site-${siteId}` : `log-${key}`, siteId, latitude, longitude, name: dive.site.name || 'Logged dive location', dives: [], verified: 0 };
    const verified = dive.site.verification?.status === 'verified';
    group.dives.push({ id: dive.id, name: dive.site.name || 'Untitled dive', startTime: dive.startTime, verified,
      number: dive.number, maxDepthMeters: dive.water?.maxDepthMeters ?? null, durationSeconds: dive.durationSeconds ?? null });
    if (verified) group.verified += 1;
    groups.set(key, group);
  }
  return [...groups.values()].map(group => ({ ...group, dives: group.dives.sort((a, b) => String(b.startTime || '').localeCompare(String(a.startTime || ''))) }));
}

// NOAA has latitude centers 88..-88, longitude centers 0..358.
// Compact, lossless temperature packing (keeps the inline WebView document small).
// Each month is one string: '!' = missing/land, otherwise two characters from an
// 89-symbol JSON/HTML-safe alphabet encoding (tenths °C + 20).
const TEMPERATURE_ALPHABET = Array.from({ length: 91 }, (_, i) => String.fromCharCode(35 + i)).filter(c => c !== '\\' && c !== '<').join('');
export function packTemperatureMonth(values) {
  const base = TEMPERATURE_ALPHABET.length;
  return values.map(v => v == null ? '!' : TEMPERATURE_ALPHABET[Math.floor((v + 20) / base)] + TEMPERATURE_ALPHABET[(v + 20) % base]).join('');
}
export function expandTemperature(grid) {
  if (!grid || grid.months) return grid;
  const base = TEMPERATURE_ALPHABET.length, lookup = {};
  for (let i = 0; i < base; i++) lookup[TEMPERATURE_ALPHABET[i]] = i;
  const months = grid.packedMonths.map(text => {
    const values = [];
    for (let i = 0; i < text.length;) {
      if (text[i] === '!') { values.push(null); i += 1; } else { values.push(lookup[text[i]] * base + lookup[text[i + 1]] - 20); i += 2; }
    }
    return values;
  });
  return { ...grid, months };
}

// Use the nearest native 2° cell, preserving the missing-data mask.
export function temperatureAt(grid, latitude, longitude, month) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 89
    || !Number.isInteger(month) || month < 0 || month > 11) return null;
  const row = Math.round((88 - latitude) / 2);
  const col = Math.round(((longitude % 360 + 360) % 360) / 2) % 180;
  if (row < 0 || row >= 89) return null;
  const value = grid.months[month]?.[row * 180 + col];
  return typeof value === 'number' && Number.isFinite(value) ? value / 10 : null;
}

export function inBounds(bounds, latitude, longitude) {
  if (!Array.isArray(bounds) || bounds.length !== 4 || !validCoordinate(latitude, longitude)) return false;
  const lon = ((longitude + 180) % 360 + 360) % 360 - 180;
  const [south, west, north, east] = bounds;
  return latitude >= south && latitude <= north && (west <= east ? lon >= west && lon <= east : lon >= west || lon <= east);
}

export function regionAt(regions, latitude, longitude) {
  return regions.find(region => inBounds(region.bounds, latitude, longitude)) || null;
}

export function oceanRegionAt(regions, latitude, longitude) {
  if (!validCoordinate(latitude, longitude) || !regions?.length) return null;
  if (latitude >= 66) return regions.find(region => region.id === 'arctic') || null;
  if (latitude <= -50) return regions.find(region => region.id === 'southern-ocean') || null;
  const radians = value => value * Math.PI / 180;
  return regions.reduce((nearest, region) => {
    const dLat = radians(region.latitude - latitude);
    const dLon = radians((((region.longitude - longitude) + 540) % 360) - 180);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(radians(latitude)) * Math.cos(radians(region.latitude)) * Math.sin(dLon / 2) ** 2;
    const safe = Math.max(0, Math.min(1, a));
    const distance = 2 * Math.atan2(Math.sqrt(safe), Math.sqrt(1 - safe));
    return !nearest || distance < nearest.distance ? { region, distance } : nearest;
  }, null)?.region || null;
}

export function seasonStatus(species, month) {
  if (!species.months.length) return 'Season not documented';
  if (species.months.length === 12) return 'Year-round';
  return species.months.includes(month + 1) ? 'In season' : 'Outside typical season';
}

export function safeJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
