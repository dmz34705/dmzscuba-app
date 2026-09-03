// Across-dives analytics for the "nerd out on your stats" view (B8). Pure.
// Works off the lightweight index rows so it never has to load every profile.

function live(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((r) => r && !r.deletedAt && r.startTime)
    .slice()
    .sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)));
}

function series(rows, field) {
  return rows
    .filter((r) => typeof r[field] === 'number' && Number.isFinite(r[field]))
    .map((r) => ({ date: r.startTime.slice(0, 10), value: r[field] }));
}

function mean(values) {
  if (!values.length) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function linTrend(points) {
  // slope of value vs index; +ve = improving/rising over time
  const n = points.length;
  if (n < 3) return null;
  const xs = points.map((_, i) => i);
  const ys = points.map((p) => p.value);
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  return den === 0 ? 0 : Math.round((num / den) * 1000) / 1000;
}

/**
 * @param {Array} indexRows  dive index rows (as loadIndex returns)
 * @returns aggregate trends + a recent snapshot
 */
export function computeDiveTrends(indexRows) {
  const rows = live(indexRows);
  const withScore = rows.filter((r) => typeof r.safetyScore === 'number');
  const sac = series(rows, 'sacBarPerMin');
  const rmv = series(rows, 'rmvLitersPerMin');
  const avgDepth = series(rows, 'avgDepthMeters');
  const safety = series(rows, 'safetyScore');

  const gasCounts = new Map();
  for (const r of rows) {
    const label = r.gasLabel || 'Unknown';
    gasCounts.set(label, (gasCounts.get(label) || 0) + 1);
  }

  const last10 = withScore.slice(-10);

  return {
    diveCount: rows.length,
    totalBottomTimeSeconds: rows.reduce((s, r) => s + (r.durationSeconds || 0), 0),
    sac: { points: sac, mean: mean(sac.map((p) => p.value)), trendPerDive: linTrend(sac) },
    rmv: { points: rmv, mean: mean(rmv.map((p) => p.value)) },
    avgDepth: { points: avgDepth, mean: mean(avgDepth.map((p) => p.value)) },
    safety: {
      points: safety,
      mean: mean(safety.map((p) => p.value)),
      recentMean: last10.length ? Math.round(mean(last10.map((r) => r.safetyScore))) : null,
      trendPerDive: linTrend(safety),
    },
    gasMix: [...gasCounts.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
    fastAscentDives: rows.filter((r) => (r.ascentRateMaxMPerMin || 0) > 10).length,
  };
}
