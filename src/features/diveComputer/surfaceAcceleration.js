import { DIVE_LIFECYCLES, setSimulationSpeed, setTargetDepth, stepSimulation } from '../../lib/diveSimulation';

const SURFACE_DELAY_SECONDS = 4;

function isRestingAtSurface(state) {
  return state.dive.completedDiveCount > 0
    && state.environment.depthMeters <= 0.01
    && state.controls.targetDepthMeters <= 0.01;
}

// Trainer-only timing, measured in running real seconds rather than dive time.
// Keeping this with the snapshot makes resets and lesson restores deterministic.
export function stepTrainerSimulation(state, realSeconds) {
  if (state.clock.status !== 'running' || realSeconds <= 0) return state;
  const resting = isRestingAtSurface(state);
  const previous = state.surfaceAcceleration || { seconds: 0, applied: false, automatic: false };
  let next = stepSimulation(state, realSeconds);
  if (!resting || !isRestingAtSurface(next)) {
    return { ...next, surfaceAcceleration: { seconds: 0, applied: false, automatic: false } };
  }
  const seconds = previous.seconds + realSeconds;
  const activate = !previous.applied && seconds >= SURFACE_DELAY_SECONDS;
  // The post-dive -> surface-menu transition is not a new underwater event.
  // Keep the automatic interval moving after that ten-minute transition.
  const surfaceMenuTransition = previous.automatic
    && state.dive.lifecycle === DIVE_LIFECYCLES.POST_DIVE && next.dive.lifecycle === DIVE_LIFECYCLES.SURFACE;
  if (activate || surfaceMenuTransition) next = setSimulationSpeed(next, 20);
  return {
    ...next,
    surfaceAcceleration: {
      seconds,
      applied: previous.applied || activate,
      automatic: previous.automatic || activate,
    },
  };
}

export function setTrainerSpeed(state, speed) {
  return {
    ...setSimulationSpeed(state, speed),
    surfaceAcceleration: {
      seconds: state.surfaceAcceleration?.seconds || 0,
      applied: isRestingAtSurface(state),
      automatic: false,
    },
  };
}

export function setTrainerTargetDepth(state, depthMeters, options) {
  const leaving = depthMeters > 0.01 && state.surfaceAcceleration?.automatic;
  const next = setTargetDepth(leaving ? setSimulationSpeed(state, 1) : state, depthMeters, options);
  return depthMeters > 0.01
    ? { ...next, surfaceAcceleration: { seconds: 0, applied: false, automatic: false } }
    : next;
}
