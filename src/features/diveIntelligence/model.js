// Personal dive intelligence shared by Planner briefs and Logbook trip debriefs.
// Everything is a pure projection of saved plans and lightweight logbook rows:
// no advice is persisted, and every result carries its evidence/count so the UI
// can explain where it came from.

const finite = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const live = (rows) => (Array.isArray(rows) ? rows : []).filter((row) => row && !row.deletedAt && row.startTime);
const day = (value) => String(value || '').slice(0, 10);
const mean = (values) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);
const normalizeName = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function metric(rows, field) {
  const values = rows.map((row) => finite(row[field])).filter((value) => value != null);
  return {
    count: values.length,
    mean: mean(values),
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
  };
}

function metricWithManual(rows, field, manualValue) {
  const recorded = metric(rows, field);
  if (recorded.count) return { ...recorded, source: 'recorded' };
  const manual = finite(manualValue);
  return manual == null
    ? { ...recorded, source: 'none' }
    : { count: 0, mean: manual, min: manual, max: manual, source: 'manual' };
}

function samePlace(row, { siteId, siteName } = {}) {
  if (siteId && row.siteId) return row.siteId === siteId;
  const wanted = normalizeName(siteName);
  const actual = normalizeName(row.siteName);
  if (!wanted || !actual) return false;
  return wanted === actual || wanted.includes(actual) || actual.includes(wanted);
}

export function confidenceForCount(count) {
  if (count >= 8) return { key: 'high', label: 'High confidence' };
  if (count >= 3) return { key: 'medium', label: 'Building confidence' };
  return { key: 'low', label: 'Early estimate' };
}

export function diveBriefAssumptionCount(profile = {}) {
  return ['targetDepthMeters', 'bottomTimeMinutes', 'startPressureBar', 'reservePressureBar']
    .filter((key) => typeof profile[key] === 'number' && Number.isFinite(profile[key]) && profile[key] > 0).length;
}

export function buildPersonalBaseline(rows, options = {}) {
  const before = options.beforeDate || '';
  const history = live(rows)
    .filter((row) => !before || day(row.startTime) < before)
    .sort((a, b) => String(b.startTime).localeCompare(String(a.startTime)));
  const atSite = history.filter((row) => samePlace(row, options));
  // Recent data better reflects the diver's present breathing and habits. Site
  // history stays preferred, but neither baseline grows without bound.
  const selected = (atSite.length ? atSite : history).slice(0, 20);
  const scope = atSite.length ? 'site' : 'all';
  const manual = options.manualBaseline || {};
  const manualFields = [
    ['sac', manual.sacBarPerMin], ['rmv', manual.rmvLitersPerMin], ['depth', manual.avgDepthMeters],
    ['duration', manual.durationSeconds], ['temperature', manual.tempMinC],
  ].filter(([, value]) => finite(value) != null).map(([key]) => key);
  return {
    scope: selected.length ? scope : manualFields.length ? 'manual' : scope,
    scopeLabel: selected.length ? (scope === 'site' ? (options.siteName || atSite[0]?.siteName || 'this site') : 'recent logged dives') : manualFields.length ? 'personal setup answers' : 'recent logged dives',
    diveCount: selected.length,
    confidence: selected.length ? confidenceForCount(selected.length) : manualFields.length ? { key: 'manual', label: 'Starting values' } : confidenceForCount(0),
    manualFields,
    avgDepth: metricWithManual(selected, 'avgDepthMeters', manual.avgDepthMeters),
    maxDepth: metric(selected, 'maxDepthMeters'),
    duration: metricWithManual(selected, 'durationSeconds', manual.durationSeconds),
    temperature: metricWithManual(selected, 'tempMinC', manual.tempMinC),
    sac: metricWithManual(selected, 'sacBarPerMin', manual.sacBarPerMin),
    rmv: metricWithManual(selected, 'rmvLitersPerMin', manual.rmvLitersPerMin),
    safety: metric(selected, 'safetyScore'),
    fastAscentDives: selected.filter((row) => (finite(row.ascentRateMaxMPerMin) || 0) > 10).length,
    transmitterDives: selected.filter((row) => row.hasTransmitterData).length,
  };
}

export function plannedDiveCount(plan) {
  if (!plan) return 0;
  if (plan.kind === 'day') return Math.max(0, Number(plan.dives) || 0);
  return (plan.segments || [])
    .filter((segment) => segment.type === 'diving' || segment.type === 'liveaboard')
    .reduce((sum, segment) => sum + (Math.max(0, Number(segment.dives) || 0)), 0);
}

function setupCylinder(plan, gear) {
  const setup = (gear?.setups || []).find((entry) => entry.id === plan?.setupId);
  if (!setup) return null;
  const items = (gear?.items || []).filter((item) => setup.itemIds?.includes(item.id) && item.category === 'Cylinder / tank');
  if (items.length !== 1) return null;
  const item = items[0];
  const liters = /([\d.]+)\s*l\b/i.exec(item.capacity || '')?.[1];
  const bar = /([\d.]+)\s*bar\b/i.exec(item.workingPressure || '')?.[1];
  return {
    id: item.id,
    name: item.name,
    volumeLiters: liters ? Number(liters) : null,
    workPressureBar: bar ? Number(bar) : null,
  };
}

export function estimatePlannedGas(plan, baseline, gear) {
  const profile = plan?.diveProfile || {};
  const depth = finite(profile.targetDepthMeters);
  const minutes = finite(profile.bottomTimeMinutes);
  const startBar = finite(profile.startPressureBar);
  const reserveBar = finite(profile.reservePressureBar);
  if (depth == null || minutes == null || startBar == null || reserveBar == null) return null;
  const cylinder = setupCylinder(plan, gear);
  const volumeLiters = finite(profile.cylinderVolumeLiters) ?? finite(cylinder?.volumeLiters);
  const rmv = finite(baseline?.rmv?.mean);
  const sac = finite(baseline?.sac?.mean);
  const ata = 1 + Math.max(0, depth) / 10;
  let usedBar = null;
  let method = '';
  if (rmv != null && volumeLiters != null && volumeLiters > 0) {
    usedBar = (rmv * ata * minutes) / volumeLiters;
    method = 'personal RMV + cylinder volume';
  } else if (sac != null) {
    usedBar = sac * ata * minutes;
    method = 'personal SAC; assumes a comparable cylinder';
  }
  if (usedBar == null) return null;
  const endBar = startBar - usedBar;
  return {
    usedBar,
    endBar,
    reserveBar,
    marginBar: endBar - reserveBar,
    method,
    cylinderName: cylinder?.name || '',
    evidenceCount: rmv != null ? baseline.rmv.count : baseline.sac.count,
    evidenceLabel: (rmv != null ? baseline.rmv.source : baseline.sac.source) === 'manual'
      ? 'starting value from personal setup'
      : `${rmv != null ? baseline.rmv.count : baseline.sac.count} logged ${(rmv != null ? baseline.rmv.count : baseline.sac.count) === 1 ? 'dive' : 'dives'}`,
  };
}

export function buildDiveBrief(plan, rows, gear, manualBaseline = null) {
  const destination = plan?.destination || {};
  const baseline = buildPersonalBaseline(rows, {
    beforeDate: plan?.startDate,
    siteId: destination.siteId,
    siteName: destination.name,
    manualBaseline,
  });
  const gas = estimatePlannedGas(plan, baseline, gear);
  const setup = (gear?.setups || []).find((entry) => entry.id === plan?.setupId) || null;
  return {
    baseline,
    gas,
    plannedDives: plannedDiveCount(plan),
    setup: setup ? { id: setup.id, name: setup.name } : null,
    evidence: baseline.diveCount
      ? `${baseline.diveCount} earlier ${baseline.scope === 'site' ? 'site' : 'personal'} ${baseline.diveCount === 1 ? 'dive' : 'dives'}`
      : baseline.manualFields.length ? `Starting values from personal setup · ${baseline.manualFields.length} supplied` : 'No earlier dives or starting values available',
  };
}

export function matchPlanToTrip(trip, plans) {
  if (!trip) return null;
  const start = day(trip.startTime);
  const end = day(trip.endTime);
  const tripSites = new Set((trip.rows || []).map((row) => normalizeName(row.siteName)).filter(Boolean));
  return (Array.isArray(plans) ? plans : [])
    .filter((plan) => plan && plan.status !== 'cancelled' && plan.startDate && (plan.endDate || plan.startDate) >= start && plan.startDate <= end)
    .map((plan) => {
      const destination = normalizeName(plan.destination?.name);
      const siteMatch = Boolean(destination && [...tripSites].some((site) => destination.includes(site) || site.includes(destination)));
      const exactDates = plan.startDate === start && (plan.endDate || plan.startDate) === end;
      return { plan, score: (siteMatch ? 4 : 0) + (exactDates ? 2 : 0) + (plan.kind === 'trip' ? 1 : 0) };
    })
    .sort((a, b) => b.score - a.score)[0]?.plan || null;
}

function comparison(actual, prior) {
  if (actual == null || prior == null || prior === 0) return null;
  return { actual, prior, percent: ((actual - prior) / prior) * 100 };
}

export function buildTripDebrief(tripRows, allRows, plan = null, manualBaseline = null) {
  const rows = live(tripRows);
  const ids = new Set(rows.map((row) => row.id));
  const before = rows.map((row) => day(row.startTime)).sort()[0] || '';
  const primarySite = rows.find((row) => row.siteName)?.siteName || '';
  const siteId = rows.find((row) => row.siteId)?.siteId || '';
  const baseline = buildPersonalBaseline(live(allRows).filter((row) => !ids.has(row.id)), { beforeDate: before, siteId, siteName: primarySite, manualBaseline });
  const actual = {
    dives: rows.length,
    avgDepth: metric(rows, 'avgDepthMeters').mean,
    maxDepth: metric(rows, 'maxDepthMeters').max,
    durationSeconds: rows.reduce((sum, row) => sum + (finite(row.durationSeconds) || 0), 0),
    temperature: metric(rows, 'tempMinC').mean,
    sac: metric(rows, 'sacBarPerMin').mean,
    safety: metric(rows, 'safetyScore').mean,
    fastAscentDives: rows.filter((row) => (finite(row.ascentRateMaxMPerMin) || 0) > 10).length,
    transmitterDives: rows.filter((row) => row.hasTransmitterData).length,
  };
  const planned = plannedDiveCount(plan);
  return {
    actual,
    baseline,
    plan: plan ? {
      id: plan.id,
      title: plan.title || plan.destination?.name || 'Planned trip',
      dives: planned,
      targetDepthMeters: finite(plan.diveProfile?.targetDepthMeters),
      bottomTimeMinutes: finite(plan.diveProfile?.bottomTimeMinutes),
    } : null,
    comparisons: {
      sac: comparison(actual.sac, baseline.sac.mean),
      depth: comparison(actual.avgDepth, baseline.avgDepth.mean),
      temperature: comparison(actual.temperature, baseline.temperature.mean),
    },
    evidence: `${rows.length} trip ${rows.length === 1 ? 'dive' : 'dives'}${baseline.diveCount ? ` compared with ${baseline.diveCount} earlier ${baseline.scope === 'site' ? 'site' : 'personal'} ${baseline.diveCount === 1 ? 'dive' : 'dives'}` : baseline.manualFields.length ? ' compared with personal setup starting values' : '; no earlier baseline yet'}`,
  };
}
