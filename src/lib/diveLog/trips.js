// Automatic, storage-free trip grouping for the logbook. Trips are projections
// of dive timestamps: changing the grouping rule never rewrites a dive.

export const DEFAULT_TRIP_GAP_MS = 72 * 60 * 60 * 1000;

function liveTimedRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row && !row.deletedAt && Number.isFinite(Date.parse(row.startTime)))
    .slice()
    .sort((a, b) => Date.parse(a.startTime) - Date.parse(b.startTime) || String(a.id).localeCompare(String(b.id)));
}

function localDayKey(iso) {
  const date = new Date(iso);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function tripPlace(rows) {
  const counts = new Map();
  for (const row of rows) {
    const name = String(row.siteName || '').trim();
    if (name) counts.set(name, (counts.get(name) || 0) + 1);
  }
  const sites = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  if (!sites.length) return { name: 'Dive trip', siteCount: 0 };
  return {
    name: sites.length === 1 ? sites[0][0] : `${sites[0][0]} + ${sites.length - 1} more`,
    siteCount: sites.length,
  };
}

function createTrip(rows) {
  const first = rows[0];
  const last = rows[rows.length - 1];
  const place = tripPlace(rows);
  return {
    id: `${first.id || first.startTime}--${last.id || last.startTime}`,
    startTime: first.startTime,
    endTime: last.startTime,
    diveDays: new Set(rows.map((row) => localDayKey(row.startTime))).size,
    siteCount: place.siteCount,
    name: place.name,
    // Detail lists read naturally newest-first, like the rest of the logbook.
    rows: [...rows].sort((a, b) => Date.parse(b.startTime) - Date.parse(a.startTime)),
  };
}

/**
 * Group dives into trips. An adjacent gap greater than 72 hours starts a new
 * trip; a rest day does not. Every dive belongs to exactly one derived trip.
 */
export function deriveDiveTrips(rows, gapMs = DEFAULT_TRIP_GAP_MS) {
  const timed = liveTimedRows(rows);
  if (!timed.length) return [];
  const trips = [];
  let current = [];
  let previousMs = null;
  for (const row of timed) {
    const time = Date.parse(row.startTime);
    if (current.length && time - previousMs > gapMs) {
      trips.push(createTrip(current));
      current = [];
    }
    current.push(row);
    previousMs = time;
  }
  if (current.length) trips.push(createTrip(current));
  return trips.sort((a, b) => Date.parse(b.endTime) - Date.parse(a.endTime));
}

export function formatTripDateRange(startTime, endTime, locale) {
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'Undated trip';
  const sameDay = localDayKey(startTime) === localDayKey(endTime);
  const sameYear = start.getFullYear() === end.getFullYear();
  const sameMonth = sameYear && start.getMonth() === end.getMonth();
  const monthDay = (date) => date.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  if (sameDay) return start.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
  if (sameMonth) {
    const month = start.toLocaleDateString(locale, { month: 'short' });
    return `${month} ${start.getDate()}–${end.getDate()}, ${end.getFullYear()}`;
  }
  if (sameYear) return `${monthDay(start)}–${monthDay(end)}, ${end.getFullYear()}`;
  return `${monthDay(start)}, ${start.getFullYear()}–${monthDay(end)}, ${end.getFullYear()}`;
}
