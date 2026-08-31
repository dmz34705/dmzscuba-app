export const METERS_TO_FEET = 3.28084;

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function pressureAtDepth(depthMeters) {
  return 1 + depthMeters / 10;
}

export function depthLabel(depthMeters, unit = 'm') {
  if (unit === 'ft') return `${Math.round(depthMeters * METERS_TO_FEET)} ft`;
  return `${Math.round(depthMeters)} m`;
}

export function depthZone(depthMeters) {
  if (depthMeters < 6) return 'Sunlit zone';
  if (depthMeters < 18) return 'Warm colors fading';
  if (depthMeters < 30) return 'Blue-green zone';
  return 'Deep-water zone';
}

export function ambientLight(depthMeters, clarity = 1) {
  return clamp(Math.exp(-0.05 * clarity * depthMeters), 0, 1);
}

export function spectrumAtDepth(depthMeters, clarity = 1) {
  return {
    red: clamp(Math.exp(-0.11 * clarity * depthMeters), 0, 1),
    green: clamp(Math.exp(-0.048 * clarity * depthMeters), 0, 1),
    blue: clamp(Math.exp(-0.02 * clarity * depthMeters), 0, 1),
    white: ambientLight(depthMeters, clarity),
  };
}

function parseHex(hex) {
  const value = parseInt(hex.replace('#', ''), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function channelToHex(channel) {
  return Math.round(clamp(channel, 0, 255)).toString(16).padStart(2, '0');
}

export function attenuateColor(hex, depthMeters, flashlight = false, clarity = 1) {
  if (flashlight) return hex;
  const [red, green, blue] = parseHex(hex);
  const light = spectrumAtDepth(depthMeters, clarity);
  const haze = clamp(depthMeters / 40, 0, 1);
  const lift = 10 * haze;
  const r = red * light.red + lift * 0.25;
  const g = green * light.green + lift * 0.65;
  const b = blue * light.blue + lift;
  return `#${channelToHex(r)}${channelToHex(g)}${channelToHex(b)}`;
}

export function colorVisibility(hex, depthMeters, flashlight = false, clarity = 1) {
  if (flashlight) return 1;
  const [red, green, blue] = parseHex(hex);
  const light = spectrumAtDepth(depthMeters, clarity);
  const original = Math.max(1, red + green + blue);
  return clamp((red * light.red + green * light.green + blue * light.blue) / original, 0, 1);
}

export function colorLesson(depthMeters, flashlight) {
  if (flashlight) return 'A dive light restores much of an object’s true color at close range.';
  if (depthMeters < 5) return 'Near the surface, sunlight still carries most of the visible spectrum.';
  if (depthMeters < 15) return 'Reds and oranges are fading first. Bright gear can already look muted.';
  if (depthMeters < 28) return 'Warm tones are heavily reduced while blue and green remain more visible.';
  return 'At depth, ambient light is dim and blue-heavy. A light helps reveal true colors.';
}

export function boylesState(depthMeters, gasSurfaceEquivalent = 1) {
  const pressure = pressureAtDepth(depthMeters);
  const normalVolume = 1 / pressure;
  const currentVolume = gasSurfaceEquivalent / pressure;
  return {
    pressure,
    normalVolume,
    currentVolume,
    overExpansion: Math.max(0, currentVolume - 1),
  };
}
