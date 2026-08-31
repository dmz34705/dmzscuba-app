export function selectAscentRateMpm(state) {
  return Math.max(0, state.environment.verticalRateMpm);
}

export function selectDescentRateMpm(state) {
  return Math.max(0, -state.environment.verticalRateMpm);
}

export function selectIsDive(state) {
  return state.dive.lifecycle === 'diving';
}

export function selectSafetyStopEligible(state) {
  return state.safetyStop.status !== 'notEligible';
}

export function selectDiveMode(state) {
  if (state.dive.lifecycle === 'postDive') return 'post-dive';
  if (state.dive.lifecycle !== 'diving') return 'surface';
  if (state.physiology.decompression.required) return 'decompression';
  if (state.safetyStop.status === 'active' || state.safetyStop.status === 'paused') return 'safety-stop';
  return 'no-decompression';
}

export function selectDiveTimeRemainingMinutes(state) {
  return Math.min(state.physiology.ndlMinutes, state.physiology.oxygen.minutesRemaining);
}
