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
export const DEFAULT_GALLERY_COLUMNS = 4;
export const MIN_GALLERY_COLUMNS = 2;
export const MAX_GALLERY_COLUMNS = 6;
export const GALLERY_GRID_GAP = 6;

const clampColumns = (value) => Math.max(
  MIN_GALLERY_COLUMNS,
  Math.min(MAX_GALLERY_COLUMNS, Math.round(value)),
);

/** Exact square size that fits `columns` tiles inside the measured grid width. */
export function galleryTileSize(containerWidth, columns, gap = GALLERY_GRID_GAP) {
  const width = Number.isFinite(containerWidth) ? Math.max(0, containerWidth) : 0;
  const count = clampColumns(columns);
  return Math.max(1, Math.floor((width - gap * (count - 1)) / count));
}

/** Convert a two-finger pinch scale into a stable, discrete grid density. */
export function galleryColumnsForPinch(startColumns, scale) {
  const start = clampColumns(startColumns);
  if (!Number.isFinite(scale) || scale <= 0) return start;
  const steps = Math.round(Math.log(scale) / Math.log(1.22));
  return clampColumns(start - steps);
}

// The most gallery thumbnails mounted at once. Each is a decoded photo, and
// mounting the whole library is what used to crash the gallery; the window
// below keeps the count bounded however long the library or the scroll.
export const MAX_MOUNTED_GALLERY_TILES = 72;

/**
 * Which rows of the gallery grid should have their photos loaded, given where
 * the grid sits in the scroll and how far down the user is. Rows outside the
 * window are laid out as empty placeholders of the same size, so the scroll
 * height never changes as photos load and unload.
 *
 * The window is the rows on screen plus a margin above and below (so photos
 * are ready before they scroll in), with the margin shrunk at dense column
 * counts to stay near MAX_MOUNTED_GALLERY_TILES (the snap can add up to
 * `chunk` rows at each end). Its edges snap outward to `chunk` rows so ordinary
 * scrolling only re-renders the grid every few rows.
 *
 * @returns {{ startRow: number, endRow: number }}  endRow is exclusive
 */
export function galleryVisibleRows({
  count, columns, rowHeight, gridTop, scrollY, viewportHeight,
  maxMounted = MAX_MOUNTED_GALLERY_TILES, chunk = 2,
}) {
  const cols = clampColumns(columns);
  const totalRows = Math.ceil(Math.max(0, count) / cols);
  if (!totalRows || !(rowHeight > 0)) return { startRow: 0, endRow: 0 };
  const viewport = Math.max(rowHeight, Number.isFinite(viewportHeight) ? viewportHeight : 0);
  const rowsOnScreen = Math.ceil(viewport / rowHeight) + 1;
  const budgetRows = Math.max(rowsOnScreen, Math.floor(maxMounted / cols));
  const margin = Math.max(0, Math.floor((budgetRows - rowsOnScreen) / 2));
  const top = (Number.isFinite(scrollY) ? scrollY : 0) - (Number.isFinite(gridTop) ? gridTop : 0);
  const firstOnScreen = Math.floor(top / rowHeight);
  // Edges snap outward, so the rows actually on screen are always inside.
  const startRow = Math.max(0, Math.min(totalRows - 1, Math.floor((firstOnScreen - margin) / chunk) * chunk));
  const endRow = Math.max(
    startRow + 1,
    Math.min(totalRows, Math.ceil((firstOnScreen + rowsOnScreen + margin) / chunk) * chunk),
  );
  return { startRow, endRow };
}

function photoTime(photo) {
  const t = Date.parse(photo?.capturedAt || photo?.linkedAt || photo?.diveStartTime || '');
  return Number.isFinite(t) ? t : 0;
}

// Depth a photo is ranked by in the depth sorts: the interpolated depth at the
// moment it was taken (computed once at load time, in useDiveLog), falling back
// to the parent dive's max depth only when the photo has no usable capture time
// or the dive has no depth profile.
function photoDepth(photo, rowById) {
  if (photo && Number.isFinite(photo.photoDepthMeters)) return photo.photoDepthMeters;
  const row = rowById && (rowById.get ? rowById.get(photo?.diveId) : rowById[photo?.diveId]);
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
      return list.sort((a, b) => photoDepth(b, rowById) - photoDepth(a, rowById) || photoTime(b) - photoTime(a));
    case 'shallowest':
      return list.sort((a, b) => photoDepth(a, rowById) - photoDepth(b, rowById) || photoTime(b) - photoTime(a));
    case 'newest':
    default:
      return list.sort((a, b) => photoTime(b) - photoTime(a));
  }
}
