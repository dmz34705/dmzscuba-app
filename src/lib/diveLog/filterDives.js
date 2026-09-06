// Filtering and searching the logbook.
//
// Works on index rows (storage.indexRowFromDive), never on full Dive records —
// the list has to stay responsive across hundreds of dives, and loading every
// record to test a predicate would defeat the point of having an index. Any
// field this module reads therefore has to be present on the row; see
// indexRowFromDive, which carries a deliberately small filterable summary.
//
// Thresholds are in canonical SI (metres, seconds, °C, bar) like the rest of
// the domain, with two exceptions that are unit-system-independent and are
// stored the way divers actually say them: oxygen and helium as percentages,
// and rating as 1-5. Conversion for everything else happens at the
// presentation edge, same rule as format.js.

import { DIVE_MODES, DIVE_SOURCES, DIVE_TYPES, WATER_TYPES } from './schema';

export const GAS_KINDS = Object.freeze([
  { key: 'air', label: 'Air' },
  { key: 'nitrox', label: 'Nitrox' },
  { key: 'trimix', label: 'Trimix' },
]);

export const GAS_KIND_KEYS = Object.freeze(GAS_KINDS.map((kind) => kind.key));

/** An empty range. `null` on either end means "unbounded that way". */
const EMPTY_RANGE = Object.freeze({ min: null, max: null });

export const DEFAULT_DIVE_FILTER = Object.freeze({
  text: '',
  dateFrom: null,        // 'YYYY-MM-DD', inclusive
  dateTo: null,          // 'YYYY-MM-DD', inclusive (to the end of that day)
  depthMeters: EMPTY_RANGE,
  durationSeconds: EMPTY_RANGE,
  tempC: EMPTY_RANGE,
  sacBarPerMin: EMPTY_RANGE,
  o2Percent: EMPTY_RANGE,
  rating: EMPTY_RANGE,
  types: [],             // DIVE_TYPES — a dive matches if it has ANY selected type
  waterTypes: [],        // WATER_TYPES
  modes: [],             // DIVE_MODES
  gasKinds: [],          // GAS_KIND_KEYS
  sources: [],           // DIVE_SOURCES
  hasComputer: null,     // true | false | null (either)
});

function finite(value) {
  // Number(null) and Number('') are both 0, which would quietly turn "no
  // bound set" into "bounded at zero" — and a dive with no recorded SAC into
  // one with a SAC of 0. Reject the empties before coercing, the same way
  // schema.js's num() does.
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sanitizeRange(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  let min = finite(source.min);
  let max = finite(source.max);
  // A backwards range is far more likely a typo than an intent to match
  // nothing, so read it the way it was meant.
  if (min !== null && max !== null && min > max) [min, max] = [max, min];
  return { min, max };
}

function sanitizeList(raw, allowed) {
  if (!Array.isArray(raw)) return [];
  return allowed.filter((value) => raw.includes(value));
}

function isIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Coerce an arbitrary (restored, hand-edited) filter into one every consumer
 * can apply without checking anything.
 */
export function sanitizeDiveFilter(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  let dateFrom = isIsoDate(source.dateFrom) ? source.dateFrom : null;
  let dateTo = isIsoDate(source.dateTo) ? source.dateTo : null;
  if (dateFrom && dateTo && dateFrom > dateTo) [dateFrom, dateTo] = [dateTo, dateFrom];
  return {
    text: typeof source.text === 'string' ? source.text.trim() : '',
    dateFrom,
    dateTo,
    depthMeters: sanitizeRange(source.depthMeters),
    durationSeconds: sanitizeRange(source.durationSeconds),
    tempC: sanitizeRange(source.tempC),
    sacBarPerMin: sanitizeRange(source.sacBarPerMin),
    o2Percent: sanitizeRange(source.o2Percent),
    rating: sanitizeRange(source.rating),
    types: sanitizeList(source.types, DIVE_TYPES),
    waterTypes: sanitizeList(source.waterTypes, WATER_TYPES),
    modes: sanitizeList(source.modes, DIVE_MODES),
    gasKinds: sanitizeList(source.gasKinds, GAS_KIND_KEYS),
    sources: sanitizeList(source.sources, DIVE_SOURCES),
    hasComputer: source.hasComputer === true || source.hasComputer === false ? source.hasComputer : null,
  };
}

/**
 * Which breathing gas this dive was on, from the richest mix carried on the
 * row. Returns null when the row predates the filterable index fields.
 */
export function gasKindOf(row) {
  const he = finite(row?.gasMaxHe);
  if (he !== null && he > 0.005) return 'trimix';
  const o2 = finite(row?.gasMaxO2);
  if (o2 === null) return null;
  // Air is nominally 0.209; anything meaningfully richer is nitrox.
  return o2 > 0.225 ? 'nitrox' : 'air';
}

function inRange(value, range) {
  if (range.min === null && range.max === null) return true;
  // A dive that never recorded this number can't satisfy a bound on it. It is
  // excluded rather than passed through, so "SAC under 15" never answers with
  // dives whose SAC is unknown.
  const parsed = finite(value);
  if (parsed === null) return false;
  if (range.min !== null && parsed < range.min) return false;
  if (range.max !== null && parsed > range.max) return false;
  return true;
}

function matchesText(row, text) {
  if (!text) return true;
  const haystack = typeof row?.search === 'string' ? row.search : '';
  if (!haystack) return false;
  // Every whitespace-separated term must appear somewhere: typing more words
  // should narrow the results, not widen them.
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

function matchesAny(value, selected) {
  if (!selected.length) return true;
  return value != null && selected.includes(value);
}

function matchesAnyOf(values, selected) {
  if (!selected.length) return true;
  return Array.isArray(values) && values.some((value) => selected.includes(value));
}

/**
 * @param {object} row      an index row
 * @param {object} filter   already sanitized (see sanitizeDiveFilter)
 */
export function matchesDiveFilter(row, filter) {
  if (!row) return false;
  if (!matchesText(row, filter.text)) return false;

  if (filter.dateFrom || filter.dateTo) {
    const started = Date.parse(row.startTime);
    if (!Number.isFinite(started)) return false;
    if (filter.dateFrom && started < Date.parse(`${filter.dateFrom}T00:00:00`)) return false;
    // Inclusive of the whole end day, not midnight at the start of it.
    if (filter.dateTo && started > Date.parse(`${filter.dateTo}T23:59:59.999`)) return false;
  }

  if (!inRange(row.maxDepthMeters, filter.depthMeters)) return false;
  if (!inRange(row.durationSeconds, filter.durationSeconds)) return false;
  if (!inRange(row.tempMinC, filter.tempC)) return false;
  if (!inRange(row.sacBarPerMin, filter.sacBarPerMin)) return false;
  if (!inRange(row.rating, filter.rating)) return false;

  if (filter.o2Percent.min !== null || filter.o2Percent.max !== null) {
    const o2 = finite(row.gasMaxO2);
    if (o2 === null || !inRange(o2 * 100, filter.o2Percent)) return false;
  }

  if (!matchesAnyOf(row.types, filter.types)) return false;
  if (!matchesAny(row.waterType, filter.waterTypes)) return false;
  if (!matchesAny(row.diveMode, filter.modes)) return false;
  if (!matchesAny(gasKindOf(row), filter.gasKinds)) return false;
  if (!matchesAny(row.source, filter.sources)) return false;

  if (filter.hasComputer !== null) {
    const has = (row.logCount || 0) > 0;
    if (has !== filter.hasComputer) return false;
  }

  return true;
}

/** How many distinct criteria are set — drives the "N" badge on the button. */
export function countActiveFilters(filter) {
  let count = 0;
  if (filter.text) count += 1;
  if (filter.dateFrom || filter.dateTo) count += 1;
  for (const key of ['depthMeters', 'durationSeconds', 'tempC', 'sacBarPerMin', 'o2Percent', 'rating']) {
    if (filter[key].min !== null || filter[key].max !== null) count += 1;
  }
  for (const key of ['types', 'waterTypes', 'modes', 'gasKinds', 'sources']) {
    if (filter[key].length) count += 1;
  }
  if (filter.hasComputer !== null) count += 1;
  return count;
}

export function isDiveFilterActive(filter) {
  return countActiveFilters(filter) > 0;
}

export function filterDiveRows(rows, filter) {
  if (!Array.isArray(rows)) return [];
  if (!isDiveFilterActive(filter)) return rows;
  return rows.filter((row) => matchesDiveFilter(row, filter));
}
