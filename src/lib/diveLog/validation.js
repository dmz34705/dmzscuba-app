// Dive record validation. Returns a human-readable error string, or '' when the
// record is acceptable to save. Runs against a normalized record.

const MAX_DEPTH_METERS = 350;
const MAX_DURATION_SECONDS = 24 * 60 * 60;

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export function validateDiveRecord(record) {
  if (!record || typeof record !== 'object') return 'This dive could not be read.';

  if (!record.startTime || Number.isNaN(Date.parse(record.startTime))) {
    return 'Enter a valid dive date and time.';
  }

  const duration = record.durationSeconds;
  if (!isFiniteNumber(duration) || duration <= 0 || duration > MAX_DURATION_SECONDS) {
    return 'Dive duration must be greater than 0 and no more than 24 hours.';
  }

  const maxDepth = record.water?.maxDepthMeters;
  if (!isFiniteNumber(maxDepth) || maxDepth < 0 || maxDepth > MAX_DEPTH_METERS) {
    return 'Maximum depth must be between 0 and 350 m.';
  }

  const avgDepth = record.water?.avgDepthMeters;
  if (avgDepth != null) {
    if (!isFiniteNumber(avgDepth) || avgDepth < 0) return 'Average depth must be 0 or more.';
    if (avgDepth > maxDepth) return 'Average depth cannot exceed maximum depth.';
  }

  const mixes = record.gas?.mixes || [];
  for (const mix of mixes) {
    if (!isFiniteNumber(mix.o2) || mix.o2 < 0.18 || mix.o2 > 1) {
      return 'Each gas mix needs between 18% and 100% oxygen.';
    }
    if (!isFiniteNumber(mix.he) || mix.he < 0) {
      return 'Gas helium fraction cannot be negative.';
    }
    if (mix.o2 + mix.he > 1.0001) {
      return 'Gas oxygen and helium together cannot exceed 100%.';
    }
  }

  if (record.rating != null) {
    if (!Number.isInteger(record.rating) || record.rating < 1 || record.rating > 5) {
      return 'Rating must be between 1 and 5.';
    }
  }

  const { latitude, longitude } = record.site || {};
  if (latitude != null && (!isFiniteNumber(latitude) || latitude < -90 || latitude > 90)) {
    return 'Site latitude must be between -90 and 90.';
  }
  if (longitude != null && (!isFiniteNumber(longitude) || longitude < -180 || longitude > 180)) {
    return 'Site longitude must be between -180 and 180.';
  }

  return '';
}
