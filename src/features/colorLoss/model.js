// Clear-water teaching coefficients from the website lab, not calibrated
// spectral reflectance measurements. Camera and vector art share this matrix.
export const MAX_DEPTH = 40;
export const DEFAULT_GEAR = { mask: '#FF493F', wetsuit: '#466BC6', tank: '#E5E9EC', fins: '#F4DE26' };
export const SAFETY_GEAR = { mask: '#FF65B5', wetsuit: '#FF842B', tank: '#E5E9EC', fins: '#F4DE26' };
export const PALETTE = ['#FF493F', '#FF842B', '#F4DE26', '#FF65B5', '#54DB83', '#466BC6', '#9763C9', '#E5E9EC', '#252B31'];
export const GEAR_LABELS = { mask: 'Mask', wetsuit: 'Suit', tank: 'Tank', fins: 'Fins' };
export const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
export const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
export const hex = (channels) => '#' + channels.map((n) => Math.round(clamp(n) * 255).toString(16).padStart(2, '0')).join('');

export function spectrum(depth, clarity = 1) {
  return [0.11, 0.048, 0.02].map((k) => Math.exp(-k * clamp(depth, 0, MAX_DEPTH) * clamp(clarity, 0.6, 2.2)));
}

// Row-major 4x5 color matrix, with normalized (0..1) offsets.
export function colorMatrix(depth, clarity = 1) {
  const d = clamp(depth, 0, MAX_DEPTH);
  const transmission = spectrum(d, clarity);
  const haze = 0.12 * d / MAX_DEPTH;
  const luma = [0.2126, 0.7152, 0.0722];
  const veil = [0.035, 0.085, 0.13];
  return [0, 1, 2].flatMap((row) => [
    ...[0, 1, 2].map((col) => ((row === col ? 1 - haze : 0) + haze * luma[col]) * transmission[col]),
    0, veil[row] * d / MAX_DEPTH,
  ]).concat([0, 0, 0, 1, 0]);
}

export function transformColor(color, matrix) {
  const input = rgb(color);
  return hex([0, 1, 2].map((row) => input.reduce((sum, channel, col) => sum + channel * matrix[row * 5 + col], matrix[row * 5 + 4])));
}

export function beamStrength(x, y, beam, radius = 85) {
  if (!beam) return 0;
  const t = clamp((Math.hypot(x - beam.x, y - beam.y) - radius * 0.3) / (radius * 0.7));
  return 1 - t * t * (3 - 2 * t);
}

export function sceneColor(color, depth, clarity, light = 0) {
  const ambient = rgb(transformColor(color, colorMatrix(depth, clarity)));
  // A nearby lamp has a short light path through water, even at great depth.
  const illuminated = rgb(transformColor(color, colorMatrix(0.6, clarity)));
  return hex(ambient.map((channel, i) => channel * (1 - light) + illuminated[i] * light));
}
