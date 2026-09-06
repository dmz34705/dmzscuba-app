// Ordering the logbook.
//
// Like filterDives.js, this works on index rows and holds values in canonical
// SI — nothing here needs to know the user's units, because comparing numbers
// gives the same order whichever unit they're displayed in.
//
// Two rules the whole file is built around:
//   - A dive that never recorded the value being sorted on sorts last, in
//     both directions. Treating a missing SAC as 0 would park every
//     hand-logged dive at the top of "best SAC", which is worse than useless.
//   - Ties break on start time, then id, so the order is total and stable.
//     Without that, two dives of the same depth can swap places between
//     renders and the list visibly shuffles.

/**
 * `defaultDirection` is what a diver means when they pick the field: "SAC
 * rate" means the good ones first, "Date" means the recent ones first.
 */
export const DIVE_SORT_FIELDS = Object.freeze([
  { key: 'date', label: 'Date', ascLabel: 'Oldest first', descLabel: 'Newest first', defaultDirection: 'desc' },
  { key: 'depth', label: 'Max depth', ascLabel: 'Shallowest', descLabel: 'Deepest', defaultDirection: 'desc' },
  { key: 'duration', label: 'Duration', ascLabel: 'Shortest', descLabel: 'Longest', defaultDirection: 'desc' },
  { key: 'temp', label: 'Temperature', ascLabel: 'Coldest', descLabel: 'Warmest', defaultDirection: 'asc' },
  { key: 'sac', label: 'SAC rate', ascLabel: 'Best first', descLabel: 'Worst first', defaultDirection: 'asc' },
  { key: 'rating', label: 'Rating', ascLabel: 'Lowest', descLabel: 'Highest', defaultDirection: 'desc' },
  { key: 'site', label: 'Site name', ascLabel: 'A–Z', descLabel: 'Z–A', defaultDirection: 'asc' },
  { key: 'number', label: 'Dive number', ascLabel: 'First logged', descLabel: 'Last logged', defaultDirection: 'desc' },
]);

export const DIVE_SORT_KEYS = Object.freeze(DIVE_SORT_FIELDS.map((field) => field.key));

export const DEFAULT_DIVE_SORT = Object.freeze({ key: 'date', direction: 'desc' });

export function getDiveSortField(key) {
  return DIVE_SORT_FIELDS.find((field) => field.key === key) || DIVE_SORT_FIELDS[0];
}

export function sanitizeDiveSort(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const field = getDiveSortField(source.key);
  return {
    key: field.key,
    direction: source.direction === 'asc' || source.direction === 'desc' ? source.direction : field.defaultDirection,
  };
}

/** A one-line description of the current order, for the sort button. */
export function describeDiveSort(sort) {
  const field = getDiveSortField(sort.key);
  return `${field.label} · ${sort.direction === 'asc' ? field.ascLabel : field.descLabel}`;
}

function numeric(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : null;
}

function valueFor(row, key) {
  switch (key) {
    case 'date': return text(row.startTime);
    case 'depth': return numeric(row.maxDepthMeters);
    case 'duration': return numeric(row.durationSeconds);
    case 'temp': return numeric(row.tempMinC);
    case 'sac': return numeric(row.sacBarPerMin);
    case 'rating': return numeric(row.rating);
    case 'site': return text(row.siteName);
    case 'number': return numeric(row.number);
    default: return null;
  }
}

function compareValues(a, b) {
  if (typeof a === 'string' || typeof b === 'string') {
    return String(a).localeCompare(String(b));
  }
  return a - b;
}

/**
 * @param {Array} rows   index rows
 * @param {object} sort  already sanitized (see sanitizeDiveSort)
 */
export function sortDiveRows(rows, sort) {
  if (!Array.isArray(rows)) return [];
  const { key, direction } = sanitizeDiveSort(sort);
  const sign = direction === 'asc' ? 1 : -1;

  return [...rows].sort((rowA, rowB) => {
    const a = valueFor(rowA, key);
    const b = valueFor(rowB, key);

    // Missing values sink, whichever way the sort is pointing.
    if (a === null && b === null) return tieBreak(rowA, rowB);
    if (a === null) return 1;
    if (b === null) return -1;

    const compared = compareValues(a, b);
    if (compared !== 0) return compared * sign;
    return tieBreak(rowA, rowB);
  });
}

// Newest first, then id — an arbitrary but *fixed* order, so equal rows never
// swap between renders.
function tieBreak(rowA, rowB) {
  const byTime = String(rowB.startTime || '').localeCompare(String(rowA.startTime || ''));
  if (byTime !== 0) return byTime;
  return String(rowA.id || '').localeCompare(String(rowB.id || ''));
}
