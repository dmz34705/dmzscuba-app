// Whole-logbook cross-computer reconciliation. Framework-independent and
// testable with any AsyncStorage-shaped backend.

import { deviceKeyOf } from './schema';
import { reconcileComputers, sameComputer } from './matchDives';
import {
  consolidateSameDeviceLogs,
  loadAll,
  loadLogsForDive,
  mergeDives,
  rebuildIndex,
} from './storage';

/**
 * Reconcile all single-computer dives in a logbook.
 *
 * Confident matches whose clocks agree are merged immediately. Clock conflicts
 * and low-confidence matches are returned as proposals for the caller to show.
 */
export async function reconcileLogbook(storage) {
  await rebuildIndex(storage).catch(() => {});
  let dives = (await loadAll(storage)).filter((dive) => !dive.deletedAt);

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

  for (let x = 0; x < clusters.length; x += 1) {
    for (let y = x + 1; y < clusters.length; y += 1) {
      const clusterA = clusters[x];
      const clusterB = clusters[y];
      const result = reconcileComputers(
        clusterA.entries.map(toReconcileEntry),
        clusterB.entries.map(toReconcileEntry),
      );
      if (!result || !result.groups.length) continue;

      const merges = [];
      for (const group of result.groups) {
        const ids = [...group.aIds, ...group.bIds]
          .filter((id) => !claimed.has(id) && entryById.has(id));
        if (ids.length < 2) continue;
        const members = ids.map((id) => entryById.get(id))
          .sort((a, b) => (b.log.durationSeconds || 0) - (a.log.durationSeconds || 0));
        merges.push({ keepId: members[0].diveId, absorbIds: members.slice(1).map((member) => member.diveId) });
        ids.forEach((id) => claimed.add(id));
      }
      if (!merges.length) continue;

      const dates = result.groups.flatMap((group) => [...group.aIds, ...group.bIds])
        .map((id) => entryById.get(id)?.dive.startTime).filter(Boolean).sort();
      const clocksAgree = Math.abs(result.offsetMinutes) < 1;

      if (result.confidence === 'high' && clocksAgree) {
        for (const merge of merges) {
          // eslint-disable-next-line no-await-in-loop
          await mergeDives(merge.keepId, merge.absorbIds, {}, storage);
        }
        autoMerged += merges.length;
        continue;
      }

      const nameOf = (device) => `${device.vendor} ${device.product}`.trim() || 'Dive computer';
      proposals.push({
        id: `reconcile:${deviceKeyOf(clusterA.device)}::${deviceKeyOf(clusterB.device)}`,
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
  }

  return { merged: autoMerged, fused, autoMerged, proposals };
}
