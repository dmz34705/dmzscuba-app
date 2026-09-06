// Ordering for the all-photos gallery. Filtering is done with the shared
// filterDives helpers (matched by diveId); this module only owns the sort, so
// it can be unit-tested without a component.

export const GALLERY_SORTS = Object.freeze([
  { key: 'newest', label: 'Newest' },
  { key: 'oldest', label: 'Oldest' },
  { key: 'deepest', label: 'Deepest' },
  { key: 'shallowest', label: 'Shallowest' },
]);

export const GALLERY_SORT_KEYS = Object.freeze(GALLERY_SORTS.map((s) => s.key));
export const DEFAULT_GALLERY_SORT = 'newest';

function photoTime(photo) {
  const t = Date.parse(photo?.capturedAt || photo?.linkedAt || photo?.diveStartTime || '');
  return Number.isFinite(t) ? t : 0;
}

function diveDepth(photo, rowById) {
  const row = rowById && (rowById.get ? rowById.get(photo.diveId) : rowById[photo.diveId]);
  return row && row.maxDepthMeters != null ? row.maxDepthMeters : -1;
}

/**
 * @param {Array} photos     gallery photo rows ({ diveId, capturedAt, ... })
 * @param {Map|Object} rowById  index rows keyed by dive id (for the depth sorts)
 * @param {string} sortKey    one of GALLERY_SORT_KEYS
 * @returns {Array} a new, sorted array
 */
export function sortGalleryPhotos(photos, rowById, sortKey) {
  const list = Array.isArray(photos) ? [...photos] : [];
  switch (sortKey) {
    case 'oldest':
      return list.sort((a, b) => photoTime(a) - photoTime(b));
    case 'deepest':
      return list.sort((a, b) => diveDepth(b, rowById) - diveDepth(a, rowById) || photoTime(b) - photoTime(a));
    case 'shallowest':
      return list.sort((a, b) => diveDepth(a, rowById) - diveDepth(b, rowById) || photoTime(b) - photoTime(a));
    case 'newest':
    default:
      return list.sort((a, b) => photoTime(b) - photoTime(a));
  }
}
