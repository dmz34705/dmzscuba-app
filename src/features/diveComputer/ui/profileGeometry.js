const MAXIMUM_FIT_SECONDS = 60 * 60;
const TIME_TICK_INTERVALS_SECONDS = [60, 120, 300, 600, 900, 1800, 3600];

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function finiteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function firstSecondDiveStart(samples) {
  let firstSessionId = null;

  for (const sample of samples) {
    const sessionId = finiteNumber(sample.diveSessionId, 0);
    if (sessionId <= 0) continue;
    if (firstSessionId == null) firstSessionId = sessionId;
    if (sessionId !== firstSessionId) return finiteNumber(sample.simulationSeconds);
  }

  return null;
}

function chooseTimeTickInterval(secondsPerViewport) {
  const targetInterval = Math.max(1, secondsPerViewport / 5);
  return TIME_TICK_INTERVALS_SECONDS.find((interval) => interval >= targetInterval)
    ?? TIME_TICK_INTERVALS_SECONDS[TIME_TICK_INTERVALS_SECONDS.length - 1];
}

function buildTimeTicks(originSeconds, endSeconds, secondsPerViewport, viewportWidth) {
  const intervalSeconds = chooseTimeTickInterval(secondsPerViewport);
  const firstTick = Math.ceil(originSeconds / intervalSeconds) * intervalSeconds;
  const ticks = [];

  for (let seconds = firstTick; seconds <= endSeconds; seconds += intervalSeconds) {
    ticks.push({
      simulationSeconds: seconds,
      elapsedSeconds: seconds - originSeconds,
      x: ((seconds - originSeconds) / secondsPerViewport) * viewportWidth,
    });
  }

  return { intervalSeconds, ticks };
}

/**
 * Produces presentation-only geometry from the engine's canonical profile samples.
 * The first dive expands to fill the viewport until either a second dive begins or
 * sixty minutes are visible. After that point the plot grows horizontally instead
 * of further compressing its history.
 */
export function buildDiveProfileGeometry(samples, width, height, maximumDepthMeters) {
  const safeSamples = Array.isArray(samples) ? samples : [];
  const safeWidth = Math.max(1, finiteNumber(width, 1));
  const safeHeight = Math.max(1, finiteNumber(height, 1));
  const range = Math.max(0.1, finiteNumber(maximumDepthMeters, 0.1));
  const originSeconds = safeSamples.length > 0 ? finiteNumber(safeSamples[0].simulationSeconds) : 0;
  const endSeconds = safeSamples.reduce(
    (maximum, sample) => Math.max(maximum, finiteNumber(sample.simulationSeconds)),
    originSeconds,
  );
  const durationSeconds = Math.max(0, endSeconds - originSeconds);
  const secondDiveStartSeconds = firstSecondDiveStart(safeSamples);
  const secondDiveOffset = secondDiveStartSeconds == null
    ? null
    : Math.max(1, secondDiveStartSeconds - originSeconds);
  const secondsPerViewport = Math.max(
    1,
    Math.min(MAXIMUM_FIT_SECONDS, secondDiveOffset ?? Math.max(1, durationSeconds)),
  );
  const contentWidth = Math.max(safeWidth, (durationSeconds / secondsPerViewport) * safeWidth);
  const points = safeSamples.map((sample) => {
    const simulationSeconds = finiteNumber(sample.simulationSeconds);
    return {
      depthMeters: finiteNumber(sample.depthMeters),
      diveSessionId: finiteNumber(sample.diveSessionId, 0),
      simulationSeconds,
      x: clamp(((simulationSeconds - originSeconds) / secondsPerViewport) * safeWidth, 0, contentWidth),
      y: clamp(finiteNumber(sample.depthMeters) / range, 0, 1) * safeHeight,
    };
  });
  const { intervalSeconds, ticks: timeTicks } = buildTimeTicks(
    originSeconds,
    endSeconds,
    secondsPerViewport,
    safeWidth,
  );
  const diveStarts = [];
  let previousSessionId = 0;

  points.forEach((point) => {
    if (point.diveSessionId > 0 && point.diveSessionId !== previousSessionId) {
      diveStarts.push({
        diveSessionId: point.diveSessionId,
        simulationSeconds: point.simulationSeconds,
        x: point.x,
      });
      previousSessionId = point.diveSessionId;
    }
  });

  return {
    contentWidth,
    diveStarts,
    durationSeconds,
    linePath: points
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
      .join(' '),
    maximumTime: endSeconds,
    originSeconds,
    points,
    scrolling: contentWidth > safeWidth + 0.5,
    secondsPerViewport,
    timeTickIntervalSeconds: intervalSeconds,
    timeTicks,
    viewportWidth: safeWidth,
  };
}

export { MAXIMUM_FIT_SECONDS };
