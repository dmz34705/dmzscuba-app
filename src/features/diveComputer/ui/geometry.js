export const INSTRUMENT_BASE_WIDTH = 360;
export const INSTRUMENT_BASE_HEIGHT = 344;
export const INSTRUMENT_ASPECT_RATIO = INSTRUMENT_BASE_WIDTH / INSTRUMENT_BASE_HEIGHT;
export const INSTRUMENT_MIN_WIDTH = 286;
export const INSTRUMENT_MAX_WIDTH = 420;

export const DISPLAY_BASE_WIDTH = 292;
export const DISPLAY_BASE_HEIGHT = 202;
export const DISPLAY_ASPECT_RATIO = DISPLAY_BASE_WIDTH / DISPLAY_BASE_HEIGHT;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function resolveInstrumentGeometry(availableWidth) {
  const safeAvailableWidth = Number.isFinite(Number(availableWidth))
    ? Math.max(0, Number(availableWidth))
    : INSTRUMENT_BASE_WIDTH;
  const width = clamp(safeAvailableWidth, INSTRUMENT_MIN_WIDTH, INSTRUMENT_MAX_WIDTH);
  const scale = width / INSTRUMENT_BASE_WIDTH;
  return {
    aspectRatio: INSTRUMENT_ASPECT_RATIO,
    height: width / INSTRUMENT_ASPECT_RATIO,
    scale,
    screen: {
      aspectRatio: DISPLAY_ASPECT_RATIO,
      height: DISPLAY_BASE_HEIGHT * scale,
      width: DISPLAY_BASE_WIDTH * scale,
    },
    width,
  };
}
