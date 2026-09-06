// The share card's option model: output shape, how much detail the card
// carries, text size, and which stats appear on it.
//
// Pure data and pure functions — no React, no native modules — so the rules
// (stat limits, sanitising a restored option set, resolving stat values into
// render-ready rows) can be exercised directly by scripts/verify-dive-log.cjs
// rather than only through the UI.

// ratio is height / width, so a card is `width * ratio` tall. "Post" is the
// original 4:5 card; the other two exist because a 4:5 image posted to a story
// or a square grid gets cropped by the host, usually straight through the
// stats.
export const ASPECT_PRESETS = Object.freeze([
  { key: 'post', label: 'Post', hint: '4:5', ratio: 5 / 4 },
  { key: 'square', label: 'Square', hint: '1:1', ratio: 1 },
  { key: 'story', label: 'Story', hint: '9:16', ratio: 16 / 9 },
]);

// "summary" is the full card: title, profile curve, stat row, watermark.
// "brief" drops the curve and lets the stats run large — the version that
// still reads at thumbnail size in a feed.
export const DETAIL_LEVELS = Object.freeze([
  { key: 'summary', label: 'Summary' },
  { key: 'brief', label: 'Brief' },
]);

export const TEXT_SIZES = Object.freeze([
  { key: 'sm', label: 'S', scale: 0.85 },
  { key: 'md', label: 'M', scale: 1 },
  { key: 'lg', label: 'L', scale: 1.18 },
]);

// Every stat the card can show. `key` also names the field the caller passes
// in its `values` map (see resolveStats) — DiveLogScreen owns the formatting
// and unit choice, this module only owns which of them are on the card.
export const STAT_FIELDS = Object.freeze([
  { key: 'time', label: 'Dive time' },
  { key: 'depth', label: 'Max depth' },
  { key: 'temp', label: 'Temp' },
  { key: 'gas', label: 'Gas' },
  { key: 'pressure', label: 'Pressure' },
  { key: 'sac', label: 'SAC' },
]);

// How the depth profile itself is drawn. "auto" keeps each theme's signature
// look (Techy glows, Natural swells), so switching theme still changes the
// card's character; picking anything else overrides that everywhere.
// See layouts/ProfileCurve.js for what each one draws.
export const PROFILE_STYLES = Object.freeze([
  { key: 'auto', label: 'Auto' },
  { key: 'line', label: 'Clean' },
  { key: 'glow', label: 'Glow' },
  { key: 'wave', label: 'Swell' },
  { key: 'bars', label: 'Bars' },
  { key: 'steps', label: 'Steps' },
  { key: 'mirror', label: 'Mirror' },
  { key: 'dots', label: 'Dots' },
]);

// The signature line at the foot of the card. Editable, and blank is a valid
// choice — some people don't want a watermark at all.
export const DEFAULT_WATERMARK = 'DMZ SCUBA';
export const MAX_WATERMARK_LENGTH = 28;

// Four is the most a single stat row fits before the values start truncating
// at the smallest card size; one keeps the row from vanishing entirely.
export const MIN_CARD_STATS = 1;
export const MAX_CARD_STATS = 4;

// What src/lib/diveLog/format.js renders for a value it doesn't have.
const EMPTY_VALUE = '\u2014';

export const DEFAULT_STAT_KEYS = Object.freeze(['time', 'depth', 'temp']);

// Where the card preferences are kept between launches (see
// useShareCardOptions.js). Versioned so a future shape change can start clean
// rather than trying to migrate.
export const SHARE_CARD_STORAGE_KEY = '@dmz-scuba/share-card-v1';

// Instagram's own portrait spec. The export is rendered off-screen at this
// pixel width whatever the preview happens to fit on the device, so the saved
// file is the same resolution on every phone.
export const EXPORT_PIXEL_WIDTH = 1080;

export const DEFAULT_SHARE_CARD_OPTIONS = Object.freeze({
  aspectKey: 'post',
  detailKey: 'summary',
  textKey: 'md',
  profileKey: 'auto',
  statKeys: DEFAULT_STAT_KEYS,
  showDepthAxis: true,
  watermark: DEFAULT_WATERMARK,
});

export function getAspectPreset(key) {
  return ASPECT_PRESETS.find((preset) => preset.key === key) || ASPECT_PRESETS[0];
}

export function getDetailLevel(key) {
  return DETAIL_LEVELS.find((level) => level.key === key) || DETAIL_LEVELS[0];
}

export function getTextScale(key) {
  return (TEXT_SIZES.find((size) => size.key === key) || TEXT_SIZES[1]).scale;
}

export function getProfileStyle(key) {
  return PROFILE_STYLES.find((style) => style.key === key) || PROFILE_STYLES[0];
}

/**
 * The ProfileCurve variant to actually draw: the theme's own when the user has
 * left this on "auto", otherwise their explicit pick.
 *
 * @param {string} profileKey        from the options
 * @param {string} themeVariant      the theme's signature variant
 */
export function resolveProfileVariant(profileKey, themeVariant) {
  const style = getProfileStyle(profileKey);
  return style.key === 'auto' ? themeVariant : style.key;
}

export function getStatField(key) {
  return STAT_FIELDS.find((field) => field.key === key) || null;
}

/**
 * The pixel size the export copy is captured at, for a given output shape.
 * @param {string} aspectKey
 * @returns {{ width: number, height: number }}
 */
export function exportPixelSize(aspectKey) {
  const { ratio } = getAspectPreset(aspectKey);
  return { width: EXPORT_PIXEL_WIDTH, height: Math.round(EXPORT_PIXEL_WIDTH * ratio) };
}

/**
 * Turn the selected stat keys into render-ready rows, dropping any whose value
 * this particular dive doesn't have (no tank fitted, no temperature recorded).
 * A layout can then render `stats` without knowing what a dive is.
 *
 * @param {Record<string, string|null|undefined>} values  formatted strings, keyed by STAT_FIELDS key
 * @param {string[]} keys
 * @returns {Array<{ key: string, label: string, value: string }>}
 */
export function resolveStats(values, keys) {
  const wanted = Array.isArray(keys) ? keys : [];
  const rows = [];
  for (const field of STAT_FIELDS) {
    if (!wanted.includes(field.key) || !hasStatValue(values, field.key)) continue;
    rows.push({ key: field.key, label: field.label, value: values[field.key].trim() });
  }
  return rows.slice(0, MAX_CARD_STATS);
}

/**
 * Whether this dive actually recorded a given stat. The card uses it to drop
 * the stat; the controls use it to grey out the chip — one rule, so the two
 * can't disagree about what "missing" means.
 *
 * @param {Record<string, string|null|undefined>} values
 * @param {string} key
 */
export function hasStatValue(values, key) {
  const value = values?.[key];
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  // The dive-log formatters return an em dash rather than null for a value they
  // don't have. On a card that reads as a stat whose number went missing, so
  // treat it as absent.
  return trimmed.length > 0 && trimmed !== EMPTY_VALUE;
}

/**
 * Add or remove a stat, holding the selection between MIN_CARD_STATS and
 * MAX_CARD_STATS. Returns the same array reference when the change would break
 * a limit, so callers can treat "nothing happened" as a no-op re-render.
 *
 * The result is always in STAT_FIELDS order: the card's stat row should read
 * the same way regardless of the order the user happened to tap them in.
 *
 * @param {string[]} keys
 * @param {string} key
 * @returns {string[]}
 */
export function toggleStat(keys, key) {
  const current = Array.isArray(keys) ? keys : [];
  if (!getStatField(key)) return current;
  const has = current.includes(key);
  if (has && current.length <= MIN_CARD_STATS) return current;
  if (!has && current.length >= MAX_CARD_STATS) return current;
  const next = has ? current.filter((k) => k !== key) : [...current, key];
  return STAT_FIELDS.filter((field) => next.includes(field.key)).map((field) => field.key);
}

/**
 * Coerce an arbitrary (restored, hand-edited, older-version) option object into
 * one every consumer can render without checking anything.
 * @param {object} [raw]
 */
export function sanitizeShareCardOptions(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const statKeys = STAT_FIELDS
    .filter((field) => Array.isArray(source.statKeys) && source.statKeys.includes(field.key))
    .map((field) => field.key)
    .slice(0, MAX_CARD_STATS);
  return {
    aspectKey: getAspectPreset(source.aspectKey).key,
    detailKey: getDetailLevel(source.detailKey).key,
    textKey: (TEXT_SIZES.find((size) => size.key === source.textKey) || TEXT_SIZES[1]).key,
    profileKey: getProfileStyle(source.profileKey).key,
    statKeys: statKeys.length >= MIN_CARD_STATS ? statKeys : [...DEFAULT_STAT_KEYS],
    showDepthAxis: source.showDepthAxis !== false,
    // An empty string is a deliberate "no watermark", so it has to survive
    // sanitising — only a non-string falls back to the default.
    watermark: typeof source.watermark === 'string'
      ? source.watermark.slice(0, MAX_WATERMARK_LENGTH)
      : DEFAULT_WATERMARK,
  };
}
