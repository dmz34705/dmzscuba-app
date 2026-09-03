// Tiny cross-module flag: the background download service writes dives straight
// to storage, so when the logbook screen next mounts (or regains focus) it needs
// to know it should re-run index rebuild + cross-computer reconciliation.
//
// Deliberately dependency-free (no react-native, no BLE) so both the download
// service and the logbook hook can import it without dragging native modules
// into places that only want the flag.

let pendingDives = 0;

export function markPendingReview(count = 1) {
  if (Number.isFinite(count) && count > 0) pendingDives += count;
}

export function hasPendingReview() {
  return pendingDives > 0;
}

export function clearPendingReview() {
  pendingDives = 0;
}
