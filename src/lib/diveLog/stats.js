// Aggregate statistics for the logbook, computed from the lightweight index rows
// so the list screen never has to load every dive profile. Soft-deleted rows
// (deletedAt set) are ignored.

function isLiveRow(row) {
  return row && typeof row === 'object' && !row.deletedAt;
}

function yearOf(startTime) {
  const time = Date.parse(startTime);
  if (Number.isNaN(time)) return null;
  return new Date(time).getUTCFullYear();
}

export function computeDiveLogStats(indexRows) {
  const rows = Array.isArray(indexRows) ? indexRows.filter(isLiveRow) : [];

  const empty = {
    totalDives: 0,
    totalBottomTimeSeconds: 0,
    deepestMeters: 0,
    longestSeconds: 0,
    firstDiveDate: null,
    lastDiveDate: null,
    byYear: [],
    bySite: [],
  };
  if (!rows.length) return empty;

  let totalBottomTimeSeconds = 0;
  let deepestMeters = 0;
  let longestSeconds = 0;
  let firstTime = Infinity;
  let lastTime = -Infinity;
  const yearMap = new Map();
  const siteMap = new Map();

  for (const row of rows) {
    const duration = Number(row.durationSeconds) || 0;
    const depth = Number(row.maxDepthMeters) || 0;
    totalBottomTimeSeconds += duration;
    deepestMeters = Math.max(deepestMeters, depth);
    longestSeconds = Math.max(longestSeconds, duration);

    const time = Date.parse(row.startTime);
    if (!Number.isNaN(time)) {
      firstTime = Math.min(firstTime, time);
      lastTime = Math.max(lastTime, time);
    }

    const year = yearOf(row.startTime);
    if (year != null) {
      const bucket = yearMap.get(year) || { year, count: 0, bottomTimeSeconds: 0 };
      bucket.count += 1;
      bucket.bottomTimeSeconds += duration;
      yearMap.set(year, bucket);
    }

    const siteName = (row.siteName || '').trim();
    if (siteName) {
      const bucket = siteMap.get(siteName) || { name: siteName, count: 0 };
      bucket.count += 1;
      siteMap.set(siteName, bucket);
    }
  }

  const byYear = [...yearMap.values()].sort((a, b) => b.year - a.year);
  const bySite = [...siteMap.values()].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name),
  );

  return {
    totalDives: rows.length,
    totalBottomTimeSeconds,
    deepestMeters,
    longestSeconds,
    firstDiveDate: Number.isFinite(firstTime) ? new Date(firstTime).toISOString() : null,
    lastDiveDate: Number.isFinite(lastTime) ? new Date(lastTime).toISOString() : null,
    byYear,
    bySite,
  };
}
