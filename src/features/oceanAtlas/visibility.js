// Estimated visibility from satellite water clarity (data/visibility.json, built by
// scripts/build-visibility.cjs from NOAA CoastWatch VIIRS Kd490). Kd490 → Kd(PAR)
// (Morel et al. 2007) → Secchi depth ≈ 1.7 / Kd(PAR) (Poole & Atkins), shown as a
// ±25% range. Surface water offshore of the site, not a dive-day forecast.
import VISIBILITY from './data/visibility.json';

const { grid, packing, cells } = VISIBILITY;
const LEVELS = packing.alphabet.length - 1;
const codeIndex = Object.fromEntries([...packing.alphabet].map((c, i) => [c, i]));
const SEARCH_CELLS = 2;

const unpackKd = c => c === '!' || codeIndex[c] == null ? null
  : packing.kdMin * Math.exp(codeIndex[c] / LEVELS * Math.log(packing.kdMax / packing.kdMin));

export function kdToVisibility(kd490) {
  const kdPar = Math.max(0.03, 0.0864 + 0.884 * kd490 - 0.00137 / kd490);
  const secchi = 1.7 / kdPar;
  return { low: Math.max(1, Math.round(secchi * 0.75)), high: Math.max(2, Math.round(secchi * 1.25)) };
}

// Twelve monthly ranges ({ low, high } in metres, or null) for the nearest cell with data.
export function visibilityAt(point) {
  if (!Number.isFinite(point?.latitude) || !Number.isFinite(point?.longitude)) return null;
  const i = Math.round((point.latitude - grid.lat0) / grid.dLat), j = Math.round((point.longitude - grid.lon0) / grid.dLon);
  let best = null;
  for (let di = -SEARCH_CELLS; di <= SEARCH_CELLS; di++) for (let dj = -SEARCH_CELLS; dj <= SEARCH_CELLS; dj++) {
    const index = (i + di) * grid.cols + ((j + dj) % grid.cols + grid.cols) % grid.cols;
    const packed = cells[index];
    if (packed && (!best || di * di + dj * dj < best.d)) best = { d: di * di + dj * dj, packed };
  }
  if (!best) return null;
  return [...best.packed].map(c => { const kd = unpackKd(c); return kd == null ? null : kdToVisibility(kd); });
}
