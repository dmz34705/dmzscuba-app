import {
  advanceSimulation,
  createSimulation,
  pauseSimulation,
  setDepth,
} from '../../lib/diveSimulation';

export function createSimulationForScenario(scenario, { actualFo2 = 0.21, simulationSpeed = 1 } = {}) {
  let simulation = createSimulation({
    actualGas: { fo2: actualFo2 },
    simulationSpeed,
  });
  if (!scenario?.seed) return simulation;

  simulation = setDepth(simulation, scenario.seed.depthMeters);
  simulation = advanceSimulation(simulation, {
    depthMeters: scenario.seed.depthMeters,
    elapsedSimulationSeconds: 5,
  });
  simulation = advanceSimulation(simulation, {
    depthMeters: scenario.seed.depthMeters,
    elapsedSimulationSeconds: Math.max(0, scenario.seed.minutesAtDepth) * 60,
  });
  return pauseSimulation(simulation);
}
