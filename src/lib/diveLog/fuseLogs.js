// Fuse several ComputerLogs from the *same* physical computer that are really
// one dive (the computer's surface-interval threshold split it) into a single
// reconstructed log: one continuous profile with the surface gap(s) in place,
// combined field values, recomputed analytics.
//
// Pure. Used by storage.consolidateSameDeviceLogs after a merge/attach.

import { createComputerLog } from './schema';
import { computeLogAnalytics } from './logAnalytics';

function startMs(log) {
  return Date.parse(log.reportedStartTime || log.startTime);
}

function numOr(a, b) {
  return typeof a === 'number' && Number.isFinite(a) ? a : b;
}

function minDefined(values) {
  const nums = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  return nums.length ? Math.min(...nums) : null;
}
function maxDefined(values) {
  const nums = values.filter((v) => typeof v === 'number' && Number.isFinite(v));
  return nums.length ? Math.max(...nums) : null;
}

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/**
 * @param {object[]} logs  2+ normalized ComputerLogs, same deviceKey
 * @returns {object|null}   a ComputerLog (via createComputerLog), or null if <2
 */
export function fuseComputerLogs(logs) {
  const list = (Array.isArray(logs) ? logs : []).filter(Boolean);
  if (list.length < 2) return list[0] || null;

  const sorted = [...list].sort((a, b) => (startMs(a) || 0) - (startMs(b) || 0));
  const first = sorted[0];
  const firstStart = startMs(first);

  const samples = [];
  const events = [];
  let cursor = 0;
  let prevEndMs = null;
  const fingerprints = [];

  for (const log of sorted) {
    if (log.fingerprint) fingerprints.push(log.fingerprint);
    const s = startMs(log);
    let gap = 0;
    if (prevEndMs != null && Number.isFinite(s)) {
      gap = Math.max(0, (s - prevEndMs) / 1000);
      if (gap > 1) samples.push({ t: cursor + gap / 2, depth: 0.4 }); // surface point in the gap
    }
    cursor += gap;
    const base = cursor;
    for (const sample of log.profile?.samples || []) {
      samples.push({ ...sample, t: base + (sample.t || 0) });
    }
    for (const ev of log.profile?.events || []) {
      events.push({ ...ev, t: base + (ev.t || 0) });
    }
    cursor += log.durationSeconds || 0;
    prevEndMs = Number.isFinite(s) ? s + (log.durationSeconds || 0) * 1000 : null;
  }
  samples.sort((a, b) => a.t - b.t);
  events.sort((a, b) => a.t - b.t);

  const last = sorted[sorted.length - 1];
  const spanSec = Number.isFinite(startMs(last)) && Number.isFinite(firstStart)
    ? (startMs(last) - firstStart) / 1000 + (last.durationSeconds || 0)
    : sorted.reduce((sum, l) => sum + (l.durationSeconds || 0), 0);

  // Tanks: pressure runs continuously across the surface — first log's start,
  // last log's end. Volume / working pressure from whichever has them.
  const allTanks = sorted.flatMap((l) => l.gas?.tanks || []);
  const tanks = allTanks.length ? [{
    volumeLiters: numOr(sorted.find((l) => l.gas?.tanks?.[0]?.volumeLiters)?.gas.tanks[0].volumeLiters, null),
    workPressureBar: numOr(sorted.find((l) => l.gas?.tanks?.[0]?.workPressureBar)?.gas.tanks[0].workPressureBar, null),
    startBar: numOr(first.gas?.tanks?.[0]?.startBar, null),
    endBar: numOr(last.gas?.tanks?.[0]?.endBar, null),
    mixIndex: numOr(first.gas?.tanks?.[0]?.mixIndex, 0),
  }] : [];

  const mixes = [];
  const seen = new Set();
  for (const l of sorted) {
    for (const mix of l.gas?.mixes || []) {
      const k = `${mix.o2}|${mix.he}`;
      if (seen.has(k)) continue;
      seen.add(k);
      mixes.push(mix);
    }
  }

  const water = {
    type: first.water?.type ?? null,
    maxDepthMeters: maxDefined(sorted.map((l) => l.water?.maxDepthMeters)) ?? 0,
    avgDepthMeters: null, // recomputed by analytics; leave for the mapper edge
    tempSurfaceC: sorted.map((l) => l.water?.tempSurfaceC).find((v) => v != null) ?? null,
    tempMinC: minDefined(sorted.map((l) => l.water?.tempMinC)),
    tempMaxC: maxDefined(sorted.map((l) => l.water?.tempMaxC)),
    visibilityMeters: null,
  };

  const deltas = [];
  for (let i = 1; i < samples.length; i += 1) {
    const d = samples[i].t - samples[i - 1].t;
    if (d > 0) deltas.push(d);
  }

  const analytics = computeLogAnalytics({
    samples,
    events,
    decoModel: first.decoModel,
    durationSeconds: spanSec,
    maxDepthMeters: water.maxDepthMeters,
    tank: tanks[0] || null,
  });

  return createComputerLog({
    id: first.id, // keep the first fragment's id so references stay valid
    diveId: first.diveId,
    device: first.device,
    fingerprint: first.fingerprint,
    mergedFingerprints: [...new Set(fingerprints)],
    downloadedAt: first.downloadedAt,
    reportedStartTime: first.reportedStartTime || first.startTime,
    timeCorrectionMinutes: first.timeCorrectionMinutes || 0,
    timezoneOffsetMinutes: first.timezoneOffsetMinutes,
    durationSeconds: Math.round(spanSec),
    surfaceIntervalSeconds: first.surfaceIntervalSeconds,
    water,
    atmosphericBar: first.atmosphericBar,
    gas: { mixes: mixes.length ? mixes : first.gas?.mixes, tanks },
    diveMode: first.diveMode,
    decoModel: first.decoModel,
    profile: { sampleIntervalSeconds: median(deltas), samples, events },
    analytics,
    deviceMeta: first.deviceMeta,
    splitOf: null,
    fusedFrom: sorted.length,
  });
}
