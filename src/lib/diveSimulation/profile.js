export function createProfileSample(state) {
  return {
    actualGas: { fo2: state.environment.actualGas.fo2 },
    ceilingMeters: state.physiology.decompression.ceilingMeters,
    cnsPercent: state.physiology.oxygen.cnsPercent,
    depthMeters: state.environment.depthMeters,
    diveRuntimeSeconds: state.dive.runtimeSeconds,
    diveSessionId: state.dive.diveSessionId,
    lifecycle: state.dive.lifecycle,
    maximumDepthMeters: state.dive.maximumDepthMeters,
    ndlMinutes: state.physiology.ndlMinutes,
    safetyStopStatus: state.safetyStop.status,
    simulationSeconds: state.clock.elapsedSimulationSeconds,
    surfaceIntervalSeconds: state.dive.surfaceIntervalSeconds,
  };
}

export function recordProfileSample(state) {
  return {
    ...state,
    profile: {
      ...state.profile,
      nextSampleAtSeconds: state.profile.nextSampleAtSeconds + state.profile.sampleIntervalSeconds,
      samples: [...state.profile.samples, createProfileSample(state)],
    },
  };
}
