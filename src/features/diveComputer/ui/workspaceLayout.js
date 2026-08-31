import { INSTRUMENT_MAX_WIDTH, INSTRUMENT_MIN_WIDTH, resolveInstrumentGeometry } from './geometry';

const WORKSPACE_GAP = 8;
const MIN_GAUGE_WIDTH = 64;
const MAX_GAUGE_WIDTH = 92;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function resolveSimulatorWorkspaceLayout(availableWidth) {
  const width = Number.isFinite(Number(availableWidth)) ? Math.max(0, Number(availableWidth)) : 360;
  const gaugeWidth = clamp(width * 0.18, MIN_GAUGE_WIDTH, MAX_GAUGE_WIDTH);
  const availableInstrumentWidth = width - gaugeWidth - WORKSPACE_GAP;
  const instrumentWidth = clamp(availableInstrumentWidth, INSTRUMENT_MIN_WIDTH, INSTRUMENT_MAX_WIDTH);
  const instrument = resolveInstrumentGeometry(instrumentWidth);
  return {
    contentWidth: gaugeWidth + WORKSPACE_GAP + instrument.width,
    gap: WORKSPACE_GAP,
    gaugeWidth,
    instrument,
    requiresHorizontalScroll: width < gaugeWidth + WORKSPACE_GAP + INSTRUMENT_MIN_WIDTH,
  };
}
