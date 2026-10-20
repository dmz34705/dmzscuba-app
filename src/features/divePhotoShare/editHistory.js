// Undo/redo for the photo editor, as pure functions over an immutable
// { entries, index } record — so the rules can be checked by
// scripts/verify-dive-log.cjs without React.
//
// Each entry is a whole editor snapshot (crop, pin, overlay settings). The
// screen decides *when* to record — after a pause, so one drag or one slider
// sweep is one step rather than hundreds.

export const MAX_HISTORY = 60;

export function createHistory(snapshot) {
  return { entries: [snapshot], index: 0 };
}

export function sameSnapshot(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Record a new state. A no-op when it matches the current entry (which is also
 * what keeps an undo/redo from recording itself). Anything ahead of the
 * current entry — the redo branch — is dropped, as in every editor.
 */
export function recordHistory(history, snapshot) {
  if (sameSnapshot(history.entries[history.index], snapshot)) return history;
  const kept = history.entries.slice(0, history.index + 1);
  kept.push(snapshot);
  const entries = kept.length > MAX_HISTORY ? kept.slice(kept.length - MAX_HISTORY) : kept;
  return { entries, index: entries.length - 1 };
}

export function canUndo(history) {
  return history.index > 0;
}

export function canRedo(history) {
  return history.index < history.entries.length - 1;
}

export function undoHistory(history) {
  return canUndo(history) ? { ...history, index: history.index - 1 } : history;
}

export function redoHistory(history) {
  return canRedo(history) ? { ...history, index: history.index + 1 } : history;
}

export function currentSnapshot(history) {
  return history.entries[history.index];
}
