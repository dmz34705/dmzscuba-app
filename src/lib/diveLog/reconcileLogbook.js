// Whole-logbook cross-computer reconciliation. Framework-independent and
// testable with any AsyncStorage-shaped backend.

import { deviceKeyOf } from './schema';
import { reconcileComputers, sameComputer } from './matchDives';
import {
  consolidateSameDeviceLogs,
  loadAll,
  loadLogsForDive,
  loadNegativeMatches,
  logsHaveNegativeMatch,
  mergeDives,
  rebuildIndex,
} from './storage';

// A computer's clock setting is stable during a dive trip, not necessarily for
// its whole lifetime. Keep nearby diving days together so multi-day trips still
// provide several anchors, but start a new clock epoch after a long dry spell.
const RECONCILE_SESSION_GAP_MS = 72 * 60 * 60 * 1000;

/**
 * Partition two computers' observed timelines into local trip sessions.
 *
 * The union is used because either clock may be wrong by many hours. A 72-hour
 * adjacent gap is still comfortably wider than the matcher's maximum plausible
 * clock error, while preventing dives months apart from voting on one offset or
 * appearing in one proposal.
 */
export function partitionReconcileSessions(entriesA, entriesB, gapMs = RECONCILE_SESSION_GAP_MS) {
  const rows = [
    ...(Array.isArray(entriesA) ? entriesA : []).map((entry) => ({ side: 'a', entry })),
    ...(Array.isArray(entriesB) ? entriesB : []).map((entry) => ({ side: 'b', entry })),
  ]
    .filter((row) => row.entry && Number.isFinite(row.entry.startMs))
    .sort((x, y) => x.entry.startMs - y.entry.startMs);
  if (!rows.length) return [];

  const sessions = [];
  let current = [];
  let previousStart = null;
  for (const row of rows) {
    if (current.length && row.entry.startMs - previousStart > gapMs) {
      sessions.push(current);
      current = [];
    }
    current.push(row);
    previousStart = row.entry.startMs;
  }
  if (current.length) sessions.push(current);

  return sessions.map((session) => ({
    a: session.filter((row) => row.side === 'a').map((row) => row.entry),
    b: session.filter((row) => row.side === 'b').map((row) => row.entry),
    firstStartMs: session[0].entry.startMs,
    lastStartMs: session[session.length - 1].entry.startMs,
  })).filter((session) => session.a.length && session.b.length);
}

function comparePlans(a, b) {
  const confidence = (plan) => (plan.result.confidence === 'high' ? 1 : 0);
  return confidence(b) - confidence(a)
    || (b.result.profileScore || 0) - (a.result.profileScore || 0)
    || (b.result.anchors || 0) - (a.result.anchors || 0)
    || b.result.groups.length - a.result.groups.length
    || b.lastStartMs - a.lastStartMs;
}

/**
 * Reconcile all single-computer dives in a logbook.
 *
 * Confident matches whose clocks agree are merged immediately. Clock conflicts
 * and low-confidence matches are returned as proposals for the caller to show.
 */
export async function reconcileLogbook(storage, { reconsiderNegativeMatches = false, reviewAll = false } = {}) {
  await rebuildIndex(storage).catch(() => {});
  let dives = (await loadAll(storage)).filter((dive) => !dive.deletedAt);
  const negativeMatches = await loadNegativeMatches(storage);

  let fused = 0;
  for (const dive of dives) {
    const keys = new Set();
    let duplicateDevice = false;
    // eslint-disable-next-line no-await-in-loop
    for (const log of await loadLogsForDive(dive, storage)) {
      if (log.deviceKey && keys.has(log.deviceKey)) duplicateDevice = true;
      if (log.deviceKey) keys.add(log.deviceKey);
    }
    if (duplicateDevice) {
      // eslint-disable-next-line no-await-in-loop
      await consolidateSameDeviceLogs(dive.id, storage);
      fused += 1;
    }
  }
  if (fused) dives = (await loadAll(storage)).filter((dive) => !dive.deletedAt);

  const bundles = [];
  for (const dive of dives) {
    // eslint-disable-next-line no-await-in-loop
    bundles.push({ dive, logs: await loadLogsForDive(dive, storage) });
  }

  const clusters = [];
  for (const bundle of bundles) {
    if (!bundle.logs.length) continue;
    const keys = new Set(bundle.logs.map((log) => log.deviceKey).filter(Boolean));
    if (keys.size !== 1) continue;
    const log = bundle.logs.find((item) => item.id === bundle.dive.primaryLogId) || bundle.logs[0];
    let cluster = clusters.find((item) => sameComputer(item.device, log.device));
    if (!cluster) {
      cluster = { device: log.device, entries: [] };
      clusters.push(cluster);
    }
    cluster.entries.push({ diveId: bundle.dive.id, dive: bundle.dive, log });
  }

  const proposals = [];
  let autoMerged = 0;
  const claimed = new Set();
  const entryById = new Map();
  for (const cluster of clusters) {
    for (const entry of cluster.entries) entryById.set(entry.diveId, entry);
  }
  const toReconcileEntry = (entry) => ({
    id: entry.diveId,
    startMs: Date.parse(entry.log.startTime || entry.log.reportedStartTime),
    durationSeconds: entry.log.durationSeconds,
    maxDepthMeters: entry.log.water?.maxDepthMeters || 0,
    samples: entry.log.profile?.samples || [],
  });

  // First evaluate every local trip. Only then reserve dives, strongest plan
  // first. This prevents a weak candidate from a third computer from claiming a
  // dive before a better profile-backed match merely because it was loaded first.
  const plans = [];
  for (let x = 0; x < clusters.length; x += 1) {
    for (let y = x + 1; y < clusters.length; y += 1) {
      const clusterA = clusters[x];
      const clusterB = clusters[y];
      const entriesA = clusterA.entries.map(toReconcileEntry);
      const entriesB = clusterB.entries.map(toReconcileEntry);
      for (const session of partitionReconcileSessions(entriesA, entriesB)) {
        const result = reconcileComputers(session.a, session.b);
        if (!result || !result.groups.length) continue;
        plans.push({
          clusterA,
          clusterB,
          result,
          firstStartMs: session.firstStartMs,
          lastStartMs: session.lastStartMs,
        });
      }
    }
  }

  plans.sort(comparePlans);
  for (const plan of plans) {
    const { clusterA, clusterB, result } = plan;
    const merges = [];
    const acceptedIds = [];
    for (const group of result.groups) {
      const aIds = group.aIds.filter((id) => entryById.has(id));
      const bIds = group.bIds.filter((id) => entryById.has(id));
      const ids = [...aIds, ...bIds];
      // Never accept a partial group after a competing plan has claimed one of
      // its members; doing so could combine fragments from only one computer.
      if (!aIds.length || !bIds.length || ids.some((id) => claimed.has(id))) continue;
      const members = ids.map((id) => entryById.get(id))
        .sort((a, b) => (b.log.durationSeconds || 0) - (a.log.durationSeconds || 0));
      const forbidden = members.some((member, i) => members.slice(i + 1)
        .some((other) => logsHaveNegativeMatch([member.log], [other.log], negativeMatches)));
      if (forbidden && !reconsiderNegativeMatches) continue;
      merges.push({
        keepId: members[0].diveId,
        absorbIds: members.slice(1).map((member) => member.diveId),
        previouslySeparated: forbidden,
      });
      acceptedIds.push(...ids);
      ids.forEach((id) => claimed.add(id));
    }
    if (!merges.length) continue;

    const dates = acceptedIds
      .map((id) => entryById.get(id)?.dive.startTime).filter(Boolean).sort();
    const clocksAgree = Math.abs(result.offsetMinutes) < 1;

    const requiresReview = merges.some((merge) => merge.previouslySeparated);
    if (!reviewAll && result.confidence === 'high' && clocksAgree && !requiresReview) {
      for (const merge of merges) {
        // eslint-disable-next-line no-await-in-loop
        await mergeDives(merge.keepId, merge.absorbIds, {}, storage);
      }
      autoMerged += merges.length;
      continue;
    }

    const nameOf = (device) => `${device.vendor} ${device.product}`.trim() || 'Dive computer';
    const sessionId = acceptedIds.slice().sort()[0] || String(plan.firstStartMs);
    proposals.push({
      id: `reconcile:${deviceKeyOf(clusterA.device)}::${deviceKeyOf(clusterB.device)}::${sessionId}`,
      kind: 'reconcile',
      deviceNameA: nameOf(clusterA.device),
      deviceKeyA: deviceKeyOf(clusterA.device),
      deviceNameB: nameOf(clusterB.device),
      deviceKeyB: deviceKeyOf(clusterB.device),
      offsetMinutes: result.offsetMinutes,
      cleanOffset: result.cleanOffset,
      confidence: result.confidence,
      anchors: result.anchors,
      sharedDiveCount: merges.length,
      firstDate: dates[0] || '',
      lastDate: dates[dates.length - 1] || '',
      merges,
    });
  }

  proposals.sort((a, b) => Date.parse(b.lastDate) - Date.parse(a.lastDate));

  return { merged: autoMerged, fused, autoMerged, proposals };
}
