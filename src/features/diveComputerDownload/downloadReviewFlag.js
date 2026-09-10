// Persistent review token: the background download service writes dives straight
// to storage, so when the logbook screen next mounts (or regains focus) it needs
// to know it should re-run index rebuild + cross-computer reconciliation.
//
// Stored separately from logbook snapshots so restoring a backup cannot consume
// an unfinished review. Storage injection keeps this testable without React.

import { resolveLogbookStorage } from '../../lib/diveLog/storage';

export const DOWNLOAD_REVIEW_KEY = '@dmz-scuba/download-review-v1';

export async function markPendingReview(count = 1, storage) {
  if (!(count > 0)) return;
  const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await resolveLogbookStorage(storage).setItem(DOWNLOAD_REVIEW_KEY, token);
  return token;
}

export async function hasPendingReview(storage) {
  return resolveLogbookStorage(storage).getItem(DOWNLOAD_REVIEW_KEY);
}

export async function clearPendingReview(token, storage) {
  const backend = resolveLogbookStorage(storage);
  if (token && await backend.getItem(DOWNLOAD_REVIEW_KEY) === token) {
    await backend.removeItem(DOWNLOAD_REVIEW_KEY);
  }
}
