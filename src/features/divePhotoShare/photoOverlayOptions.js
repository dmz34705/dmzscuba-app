// The photo overlay's option model and geometry: crop framing, where the photo
// pin sits on the profile, which info rides in the corner, and the signature.
//
// Pure data and pure functions — no React, no native modules — so the rules
// (crop coverage, pan clamping, pin placement, sanitising restored settings,
// signature path building) can be exercised directly by
// scripts/verify-dive-log.cjs rather than only through the UI.

// ---------------------------------------------------------------------------
// Crop

// ratio is height / width, like shareCardOptions.ASPECT_PRESETS. "original"
// and "free" carry no fixed ratio: original follows the photo (after any 90°
// turn), free follows the corner handle the user drags.
export const CROP_ASPECTS = Object.freeze([
  { key: 'original', label: 'Original', ratio: null },
  { key: 'post', label: '4:5', ratio: 5 / 4 },
  { key: 'square', label: '1:1', ratio: 1 },
  { key: 'story', label: '9:16', ratio: 16 / 9 },
  { key: 'wide', label: '16:9', ratio: 9 / 16 },
  { key: 'free', label: 'Free', ratio: null },
]);

// Past these a "free" crop stops being a photo and becomes a strip — and the
// overlay's three bottom elements stop fitting side by side.
export const MIN_FREE_RATIO = 0.4;
export const MAX_FREE_RATIO = 2.4;

export const MAX_ZOOM = 6;
export const MAX_STRAIGHTEN_DEGREES = 45;

export const DEFAULT_CROP = Object.freeze({
  aspectKey: 'original',
  freeRatio: 1,
  zoom: 1,
  // Offset of the photo's centre from the frame's centre, in fractions of the
  // frame's *width* (both axes) — so the same crop renders identically on the
  // small preview and the 1080px export copy.
  panX: 0,
  panY: 0,
  quarterTurns: 0,
  straighten: 0,
  flip: false,
});

function finite(value, fallback) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function getCropAspect(key) {
  return CROP_ASPECTS.find((aspect) => aspect.key === key) || CROP_ASPECTS[0];
}

/**
 * The photo's size once its 90° turns are applied: a portrait shot turned
 * once is laid out as a landscape one.
 */
export function turnedSize(photoSize, quarterTurns) {
  const width = Math.max(1, finite(photoSize?.width, 1));
  const height = Math.max(1, finite(photoSize?.height, 1));
  return quarterTurns % 2 ? { width: height, height: width } : { width, height };
}

/**
 * Height / width of the output frame for this crop.
 */
export function cropFrameRatio(crop, photoSize) {
  const aspect = getCropAspect(crop?.aspectKey);
  if (aspect.ratio) return aspect.ratio;
  if (aspect.key === 'free') return clamp(finite(crop?.freeRatio, 1), MIN_FREE_RATIO, MAX_FREE_RATIO);
  const turned = turnedSize(photoSize, crop?.quarterTurns || 0);
  return turned.height / turned.width;
}

// The frame, seen from inside the (straightened) photo, is a rotated rectangle.
// These are the half-extents of that rectangle along the photo's own axes —
// what the photo has to be at least as large as for no empty corner to show.
function frameHalfExtents(frameWidth, frameHeight, radians) {
  const c = Math.abs(Math.cos(radians));
  const s = Math.abs(Math.sin(radians));
  return { x: (frameWidth * c + frameHeight * s) / 2, y: (frameWidth * s + frameHeight * c) / 2 };
}

/**
 * Everything a renderer needs to draw the photo inside a frame of the given
 * point size: the photo's laid-out (unturned) size and the transform that
 * places it. Also the clamped pan, so the caller can store it back.
 *
 * The scale is the smallest that keeps the frame fully covered at the current
 * straighten angle, times the user's zoom — there is never a blank corner, at
 * any angle or pan.
 *
 * @param {object} crop
 * @param {{ width: number, height: number }} photoSize  natural pixel size
 * @param {number} frameWidth
 * @param {number} frameHeight
 */
export function cropLayout(crop, photoSize, frameWidth, frameHeight) {
  const quarterTurns = ((Math.round(finite(crop?.quarterTurns, 0)) % 4) + 4) % 4;
  const straighten = clamp(finite(crop?.straighten, 0), -MAX_STRAIGHTEN_DEGREES, MAX_STRAIGHTEN_DEGREES);
  const zoom = clamp(finite(crop?.zoom, 1), 1, MAX_ZOOM);
  const natural = turnedSize(photoSize, 0);
  const turned = turnedSize(photoSize, quarterTurns);
  const radians = (straighten * Math.PI) / 180;
  const half = frameHalfExtents(frameWidth, frameHeight, radians);
  const coverScale = Math.max((half.x * 2) / turned.width, (half.y * 2) / turned.height);
  const scale = coverScale * zoom;

  // Clamp the pan in the photo's own (straightened) axes, where the limit is a
  // plain box: the frame's half-extent must stay inside the photo's half-size.
  const dx = finite(crop?.panX, 0) * frameWidth;
  const dy = finite(crop?.panY, 0) * frameWidth;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const localX = dx * cos + dy * sin;
  const localY = -dx * sin + dy * cos;
  const limitX = Math.max(0, (turned.width * scale) / 2 - half.x);
  const limitY = Math.max(0, (turned.height * scale) / 2 - half.y);
  const clampedLocalX = clamp(localX, -limitX, limitX);
  const clampedLocalY = clamp(localY, -limitY, limitY);
  const offsetX = clampedLocalX * cos - clampedLocalY * sin;
  const offsetY = clampedLocalX * sin + clampedLocalY * cos;

  return {
    // The image element is laid out at its natural (unturned) proportions and
    // turned by the transform, so the turn never re-decodes the photo.
    imageWidth: natural.width * scale,
    imageHeight: natural.height * scale,
    left: frameWidth / 2 - (natural.width * scale) / 2,
    top: frameHeight / 2 - (natural.height * scale) / 2,
    offsetX,
    offsetY,
    rotateDegrees: quarterTurns * 90 + straighten,
    // A flip should mirror left-right on screen whatever the turn; after an odd
    // number of quarter turns the photo's own x axis runs vertically, so the
    // mirror goes on its y axis instead.
    flipX: crop?.flip && quarterTurns % 2 === 0 ? -1 : 1,
    flipY: crop?.flip && quarterTurns % 2 === 1 ? -1 : 1,
    panX: frameWidth > 0 ? offsetX / frameWidth : 0,
    panY: frameWidth > 0 ? offsetY / frameWidth : 0,
  };
}

/**
 * A crop with every field valid and its pan pulled back inside the photo.
 */
export function normalizeCrop(raw, photoSize, frameWidth = 1000) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const crop = {
    aspectKey: getCropAspect(source.aspectKey).key,
    freeRatio: clamp(finite(source.freeRatio, 1), MIN_FREE_RATIO, MAX_FREE_RATIO),
    zoom: clamp(finite(source.zoom, 1), 1, MAX_ZOOM),
    panX: finite(source.panX, 0),
    panY: finite(source.panY, 0),
    quarterTurns: ((Math.round(finite(source.quarterTurns, 0)) % 4) + 4) % 4,
    straighten: clamp(finite(source.straighten, 0), -MAX_STRAIGHTEN_DEGREES, MAX_STRAIGHTEN_DEGREES),
    flip: source.flip === true,
  };
  if (!photoSize) return crop;
  const frameHeight = frameWidth * cropFrameRatio(crop, photoSize);
  const layout = cropLayout(crop, photoSize, frameWidth, frameHeight);
  return { ...crop, panX: layout.panX, panY: layout.panY };
}

// ---------------------------------------------------------------------------
// Pin

/**
 * The profile's own time span, in its sample seconds — what the pin slider
 * runs across. null when there is no profile to put a pin on.
 */
export function profileSpan(samples) {
  const times = (Array.isArray(samples) ? samples : [])
    .filter((s) => s && Number.isFinite(s.t) && Number.isFinite(s.depth))
    .map((s) => s.t);
  if (times.length < 2) return null;
  const start = Math.min(...times);
  const end = Math.max(...times);
  return end > start ? { start, end } : null;
}

/**
 * Depth at a moment of the profile, linearly between the samples either side.
 */
export function depthAtProfileSeconds(samples, seconds) {
  const ordered = (Array.isArray(samples) ? samples : [])
    .filter((s) => s && Number.isFinite(s.t) && Number.isFinite(s.depth))
    .sort((a, b) => a.t - b.t);
  if (!ordered.length || !Number.isFinite(seconds)) return null;
  if (seconds <= ordered[0].t) return ordered[0].depth;
  for (let i = 1; i < ordered.length; i += 1) {
    const b = ordered[i];
    if (b.t >= seconds) {
      const a = ordered[i - 1];
      const span = b.t - a.t;
      return span > 0 ? a.depth + ((seconds - a.t) / span) * (b.depth - a.depth) : b.depth;
    }
  }
  return ordered[ordered.length - 1].depth;
}

/**
 * Where the pin is, if anywhere.
 *
 * `pinMode`:
 *   "auto"   — at the photo's capture time; no pin if that time is unknown or
 *              off the profile.
 *   "manual" — at `manualSeconds`, which the user dragged it to.
 *   "off"    — no pin.
 *
 * @param {object} args
 * @param {string} args.pinMode
 * @param {number|null} args.manualSeconds
 * @param {number|null} args.photoSeconds   capture time as an offset into the dive (depthAtPhotoTime's offsetSeconds)
 * @param {Array} args.samples
 * @returns {{ seconds: number, depthMeters: number, source: 'photo'|'manual' } | null}
 */
export function resolvePin({ pinMode, manualSeconds, photoSeconds, samples }) {
  if (pinMode === 'off') return null;
  const span = profileSpan(samples);
  if (!span) return null;
  let seconds = null;
  let source = 'photo';
  if (pinMode === 'manual' && Number.isFinite(manualSeconds)) {
    seconds = manualSeconds;
    source = 'manual';
  } else if (Number.isFinite(photoSeconds)) {
    seconds = photoSeconds;
  }
  if (seconds == null) return null;
  seconds = clamp(seconds, span.start, span.end);
  const depthMeters = depthAtProfileSeconds(samples, seconds);
  return depthMeters == null ? null : { seconds, depthMeters, source };
}

/**
 * The pin a photo starts with: at its capture time when it has one, otherwise
 * off until the user places it.
 */
export function initialPinMode(photoSeconds) {
  return Number.isFinite(photoSeconds) ? 'auto' : 'off';
}

// ---------------------------------------------------------------------------
// Overlay settings (remembered between photos)

export const PROFILE_SIZES = Object.freeze([
  { key: 'sm', label: 'S', fraction: 0.26 },
  { key: 'md', label: 'M', fraction: 0.32 },
  { key: 'lg', label: 'L', fraction: 0.4 },
]);

export const OVERLAY_TEXT_SIZES = Object.freeze([
  { key: 'sm', label: 'S', scale: 0.85 },
  { key: 'md', label: 'M', scale: 1 },
  { key: 'lg', label: 'L', scale: 1.18 },
]);

// What can ride in the info corner. `key` names the field in the `values` map
// the screen passes (see resolveInfoLines); the screen owns formatting and
// units, this module owns which appear and in what order.
export const INFO_FIELDS = Object.freeze([
  { key: 'site', label: 'Site name' },
  { key: 'location', label: 'Location' },
  { key: 'depth', label: 'Depth at photo' },
  { key: 'elapsed', label: 'Time into dive' },
  { key: 'date', label: 'Date' },
]);

export const DEFAULT_INFO_KEYS = Object.freeze(['site', 'depth']);

export const SIGNATURE_MODES = Object.freeze([
  { key: 'off', label: 'Off' },
  { key: 'typed', label: 'Typed' },
  { key: 'drawn', label: 'Drawn' },
]);

export const SIGNATURE_FONTS = Object.freeze([
  { key: 'theme', label: 'Theme' },
  { key: 'script', label: 'Script' },
]);

export const MAX_SIGNATURE_TEXT = 28;

// How big the signature is on the photo, as fractions of the photo's width:
// the most room its ink (or text) may take across and down. Photo signatures
// are small marks, so even L stays well short of the corner elements.
export const SIGNATURE_SIZES = Object.freeze([
  { key: 'sm', label: 'S', width: 0.14, height: 0.032, font: 0.8 },
  { key: 'md', label: 'M', width: 0.19, height: 0.045, font: 1 },
  { key: 'lg', label: 'L', width: 0.25, height: 0.06, font: 1.25 },
]);

export function getSignatureSize(key) {
  return SIGNATURE_SIZES.find((size) => size.key === key) || SIGNATURE_SIZES[0];
}

/**
 * Where the signature goes along the bottom edge, in points. Bottom middle
 * when the exact centre is clear of the two corner elements; otherwise centred
 * in the actual gap between them (the corners are rarely the same width);
 * only when even that gap is too thin does it lift above them.
 *
 * @param {object} args
 * @param {number} args.width          frame width
 * @param {number} args.pad            edge margin
 * @param {number} args.gap            space kept between elements
 * @param {number} args.leftWidth      width of the bottom-left element, 0 if none
 * @param {number} args.rightWidth     width of the bottom-right element, 0 if none
 * @param {number} args.maxWidth       the signature's own size limit
 * @returns {{ left: number, width: number, lifted: boolean }}
 */
export function signatureSlot({ width, pad, gap, leftWidth, rightWidth, maxWidth }) {
  const leftEdge = pad + (leftWidth > 0 ? leftWidth + gap : 0);
  const rightEdge = width - pad - (rightWidth > 0 ? rightWidth + gap : 0);
  const centred = { left: (width - maxWidth) / 2, width: maxWidth, lifted: false };
  if (centred.left >= leftEdge && centred.left + maxWidth <= rightEdge) return centred;
  const room = rightEdge - leftEdge;
  if (room >= maxWidth * 0.6) {
    const w = Math.min(maxWidth, room);
    return { left: leftEdge + (room - w) / 2, width: w, lifted: false };
  }
  return { ...centred, lifted: true };
}

// The drawing pad's shape (height / width). Strokes are stored in 0..1 of the
// pad's width on both axes, so y runs 0..SIGNATURE_PAD_RATIO.
export const SIGNATURE_PAD_RATIO = 0.36;
// A full signature is a few hundred points; the caps only stop a runaway
// scribble from bloating the saved settings.
export const MAX_SIGNATURE_STROKES = 40;
export const MAX_SIGNATURE_POINTS = 1600;

export const PHOTO_OVERLAY_STORAGE_KEY = '@dmz-scuba/photo-overlay-v1';

export const DEFAULT_PHOTO_OVERLAY_OPTIONS = Object.freeze({
  themeKey: 'classic',
  profileKey: 'auto',
  profileSizeKey: 'md',
  textKey: 'md',
  showProfile: true,
  profileOnRight: false,
  shadow: true,
  infoKeys: DEFAULT_INFO_KEYS,
  signatureMode: 'off',
  signatureText: '',
  signatureFont: 'script',
  signatureSizeKey: 'sm',
  signatureStrokes: [],
});

export function getProfileSize(key) {
  return PROFILE_SIZES.find((size) => size.key === key) || PROFILE_SIZES[1];
}

export function getOverlayTextScale(key) {
  return (OVERLAY_TEXT_SIZES.find((size) => size.key === key) || OVERLAY_TEXT_SIZES[1]).scale;
}

/**
 * Whether this photo actually has a value for an info field — the overlay
 * drops it and the controls grey it out, by the same rule.
 */
export function hasInfoValue(values, key) {
  const value = values?.[key];
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed !== '—';
}

/**
 * The selected info fields as render-ready rows, in INFO_FIELDS order, minus
 * any this photo doesn't have.
 */
export function resolveInfoLines(values, keys) {
  const wanted = Array.isArray(keys) ? keys : [];
  return INFO_FIELDS
    .filter((field) => wanted.includes(field.key) && hasInfoValue(values, field.key))
    .map((field) => ({ key: field.key, label: field.label, value: values[field.key].trim() }));
}

export function toggleInfoKey(keys, key) {
  const current = Array.isArray(keys) ? keys : [];
  if (!INFO_FIELDS.some((field) => field.key === key)) return current;
  const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
  return INFO_FIELDS.filter((field) => next.includes(field.key)).map((field) => field.key);
}

function sanitizeStrokes(raw) {
  if (!Array.isArray(raw)) return [];
  const strokes = [];
  let total = 0;
  for (const stroke of raw.slice(0, MAX_SIGNATURE_STROKES)) {
    if (!Array.isArray(stroke)) continue;
    const points = [];
    for (const point of stroke) {
      if (total >= MAX_SIGNATURE_POINTS) break;
      if (!Array.isArray(point) || point.length < 2) continue;
      const [x, y] = point;
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      points.push([clamp(x, 0, 1), clamp(y, 0, SIGNATURE_PAD_RATIO)]);
      total += 1;
    }
    if (points.length) strokes.push(points);
  }
  return strokes;
}

function pick(list, key, fallback) {
  return (list.find((entry) => entry.key === key) || list.find((entry) => entry.key === fallback)).key;
}

/**
 * Coerce a restored (or older, or hand-edited) settings object into one every
 * consumer can render without checking anything.
 */
export function sanitizePhotoOverlayOptions(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const d = DEFAULT_PHOTO_OVERLAY_OPTIONS;
  return {
    // Unknown theme keys are left to getShareCardTheme's fallback at render
    // time, the same as the share card does.
    themeKey: typeof source.themeKey === 'string' ? source.themeKey : d.themeKey,
    profileKey: typeof source.profileKey === 'string' ? source.profileKey : d.profileKey,
    profileSizeKey: pick(PROFILE_SIZES, source.profileSizeKey, d.profileSizeKey),
    textKey: pick(OVERLAY_TEXT_SIZES, source.textKey, d.textKey),
    showProfile: source.showProfile !== false,
    profileOnRight: source.profileOnRight === true,
    shadow: source.shadow !== false,
    infoKeys: Array.isArray(source.infoKeys)
      ? INFO_FIELDS.filter((field) => source.infoKeys.includes(field.key)).map((field) => field.key)
      : [...DEFAULT_INFO_KEYS],
    signatureMode: pick(SIGNATURE_MODES, source.signatureMode, d.signatureMode),
    signatureText: typeof source.signatureText === 'string'
      ? source.signatureText.slice(0, MAX_SIGNATURE_TEXT)
      : d.signatureText,
    signatureFont: pick(SIGNATURE_FONTS, source.signatureFont, d.signatureFont),
    signatureSizeKey: pick(SIGNATURE_SIZES, source.signatureSizeKey, d.signatureSizeKey),
    signatureStrokes: sanitizeStrokes(source.signatureStrokes),
  };
}

// ---------------------------------------------------------------------------
// Signature drawing

/**
 * Drop points closer than `minDistance` to the last kept one — a finger held
 * still otherwise piles up dozens of identical points.
 */
export function thinStroke(points, minDistance = 0.004) {
  const kept = [];
  for (const point of Array.isArray(points) ? points : []) {
    const last = kept[kept.length - 1];
    if (!last || Math.hypot(point[0] - last[0], point[1] - last[1]) >= minDistance) kept.push(point);
  }
  return kept;
}

/**
 * SVG path for the strokes, scaled to `width` (y uses the same scale). Each
 * stroke is drawn through the midpoints of its segments with the points as
 * quadratic controls, which reads as ink rather than a polyline. A single-point
 * stroke (a dot over an "i") becomes a zero-length segment that round caps
 * render as a dot.
 */
export function signaturePath(strokes, width) {
  const s = Math.max(0, finite(width, 0));
  const parts = [];
  for (const stroke of Array.isArray(strokes) ? strokes : []) {
    if (!Array.isArray(stroke) || !stroke.length) continue;
    const pts = stroke.map(([x, y]) => [x * s, y * s]);
    const f = (n) => n.toFixed(2);
    if (pts.length === 1) {
      parts.push(`M ${f(pts[0][0])} ${f(pts[0][1])} l 0.01 0`);
      continue;
    }
    let d = `M ${f(pts[0][0])} ${f(pts[0][1])}`;
    for (let i = 1; i < pts.length - 1; i += 1) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2;
      const my = (pts[i][1] + pts[i + 1][1]) / 2;
      d += ` Q ${f(pts[i][0])} ${f(pts[i][1])} ${f(mx)} ${f(my)}`;
    }
    const last = pts[pts.length - 1];
    d += ` L ${f(last[0])} ${f(last[1])}`;
    parts.push(d);
  }
  return parts.join(' ');
}

/**
 * The strokes' bounding box in pad units, or null when there is nothing
 * drawn. The overlay scales the ink to fit its slot by this box, not the whole
 * pad, so a small signature in one corner of the pad still comes out full
 * size.
 */
export function signatureBounds(strokes) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const stroke of Array.isArray(strokes) ? strokes : []) {
    for (const [x, y] of stroke) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (!Number.isFinite(minX)) return null;
  return { x: minX, y: minY, width: Math.max(0.01, maxX - minX), height: Math.max(0.01, maxY - minY) };
}

// ---------------------------------------------------------------------------
// Export

// Long side of the exported file. Portrait and square photos come out 1080
// wide (Instagram's portrait spec, like the share card); landscape ones keep
// the same detail by spending it on width instead.
export const EXPORT_LONG_SIDE = 1440;
export const EXPORT_PORTRAIT_WIDTH = 1080;

export function overlayExportPixelSize(ratio) {
  const r = Math.max(0.01, finite(ratio, 1));
  if (r >= 1) return { width: EXPORT_PORTRAIT_WIDTH, height: Math.round(EXPORT_PORTRAIT_WIDTH * r) };
  return { width: EXPORT_LONG_SIDE, height: Math.round(EXPORT_LONG_SIDE * r) };
}
