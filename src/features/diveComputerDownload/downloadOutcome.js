// Decides what a finished download means for the next sync. Pure, so it can be
// tested without Bluetooth.
//
// Dive computers send dives newest-first, and an incremental sync stops at the
// saved fingerprint. After an interrupted transfer the native bridge still
// returns the newest dive's fingerprint, but older dives were never read. Saving
// that as the baseline would make every later "Sync new dives" stop before them,
// so the unread history would silently never arrive.
//
// So the baseline only advances after a complete transfer. After an
// interruption the previous baseline (if any) stays in place: the next sync
// re-reads from the newest dive back to the last complete sync, and dives
// already in the logbook are skipped as duplicates.
export function downloadOutcome({ result, hadBaseline = false, tally = {} }) {
  const downloaded = Number(tally.downloaded) || 0;
  const saved = Number(tally.saved) || 0;
  if (result?.partial) {
    const read = `Stopped after ${downloaded} ${downloaded === 1 ? 'dive' : 'dives'} (${saved} new). Those are saved.`;
    const next = hadBaseline
      ? ' Tap “Sync new dives” to finish: it reads back to your last complete sync and skips dives you already have.'
      : ' Tap “Full re-download” to finish reading the history: dives you already have are skipped.';
    return {
      saveFingerprint: false,
      status: 'error',
      error: read + next,
      baselineKnown: hadBaseline,
      logLine: `download ${result.cancelled ? 'cancelled' : 'interrupted'} · baseline ${hadBaseline ? 'kept at last complete sync' : 'not set'}`,
    };
  }
  return {
    saveFingerprint: !!result?.fingerprint,
    status: 'done',
    error: '',
    baselineKnown: !!result?.fingerprint || hadBaseline,
    logLine: 'download complete',
  };
}
