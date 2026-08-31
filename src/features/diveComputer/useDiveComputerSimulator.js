import { useEffect, useMemo, useState } from 'react';

import { adaptSimulationToDiveComputerState } from '../../lib/diveComputer';
import {
  pauseSimulation,
  resumeSimulation,
  setActualGas,
  setDeepStopEnabled,
  setGradientFactor,
  setPo2AlarmSetpoint,
  setSafetyStopDepthMeters,
  setSafetyStopSeconds,
  setSimulationSpeed as setDomainSimulationSpeed,
  setTargetDepth,
  setWaterType,
  stepSimulation,
} from '../../lib/diveSimulation';
import {
  DEVICE_EVENTS,
  buildVirtualDiveComputerDisplay,
  createVirtualDiveComputer,
  transitionVirtualDiveComputer,
} from '../../lib/virtualDiveComputer';
import { getDiveComputerScenario, scenarioGuidance } from './scenarios';
import { createSimulationForScenario } from './simulationProfiles';

const TICK_MILLISECONDS = 500;

// The manual documents Conservative Factor as a binary on/off toggle without
// publishing the internal M-value adjustment it makes. 0.8 is a commonly
// used "low" gradient factor in recreational computers; standard (off) is a
// plain 1.0 (no adjustment), which matches this simulator's prior hardcoded
// behavior exactly.
const CONSERVATISM_GRADIENT_FACTORS = Object.freeze({ conservative: 0.8, standard: 1 });

function preserveDeviceConfiguration(device) {
  return createVirtualDiveComputer({
    configuredGas: device.configuredGas,
    conservatism: device.settings.conservatism,
    logbookEntries: device.logbook.entries,
    safetyStopEnabled: device.settings.safetyStopEnabled,
    units: device.settings.units,
  });
}

export default function useDiveComputerSimulator({ initialDepthUnit = 'ft', initialFo2Percent = 21 } = {}) {
  const [scenarioId, setScenarioIdState] = useState('guided-dive');
  const [simulation, setSimulation] = useState(() => createSimulationForScenario(
    getDiveComputerScenario('guided-dive'),
    { actualFo2: initialFo2Percent / 100, simulationSpeed: 1 },
  ));
  const [device, setDevice] = useState(() => createVirtualDiveComputer({
    configuredGas: { fo2: 0.21 },
    units: { depth: initialDepthUnit === 'm' ? 'm' : 'ft' },
  }));
  const [stage, setStage] = useState(0);

  useEffect(() => {
    setDevice((current) => transitionVirtualDiveComputer(current, {
      simulation,
      type: DEVICE_EVENTS.SIMULATION_UPDATED,
    }));
  }, [simulation]);

  // Surface settings that are genuinely physics inputs get wired straight
  // into the simulation engine, so changing them on the device actually
  // changes the live dive rather than just being stored.
  useEffect(() => {
    const gradientFactor = CONSERVATISM_GRADIENT_FACTORS[device.settings.conservatism] ?? 1;
    setSimulation((current) => (current.gradientFactor === gradientFactor ? current : setGradientFactor(current, gradientFactor)));
  }, [device.settings.conservatism]);

  useEffect(() => {
    setSimulation((current) => (current.waterType === device.settings.h2oType ? current : setWaterType(current, device.settings.h2oType)));
  }, [device.settings.h2oType]);

  useEffect(() => {
    const po2AlarmSetpoint = device.configuredGas.po2Alarm;
    setSimulation((current) => (current.po2AlarmSetpoint === po2AlarmSetpoint ? current : setPo2AlarmSetpoint(current, po2AlarmSetpoint)));
  }, [device.configuredGas.po2Alarm]);

  useEffect(() => {
    setSimulation((current) => (current.deepStopEnabled === device.settings.deepStop ? current : setDeepStopEnabled(current, device.settings.deepStop)));
  }, [device.settings.deepStop]);

  useEffect(() => {
    const depthMeters = device.settings.safetyStopDepthMeters;
    setSimulation((current) => (current.safetyStopDepthMeters === depthMeters ? current : setSafetyStopDepthMeters(current, depthMeters)));
  }, [device.settings.safetyStopDepthMeters]);

  useEffect(() => {
    const seconds = device.settings.safetyStopMinutes * 60;
    setSimulation((current) => (current.safetyStopSeconds === seconds ? current : setSafetyStopSeconds(current, seconds)));
  }, [device.settings.safetyStopMinutes]);

  useEffect(() => {
    if (simulation.clock.status !== 'running') return undefined;
    const interval = setInterval(() => {
      setSimulation((current) => stepSimulation(current, TICK_MILLISECONDS / 1000));
      setDevice((current) => transitionVirtualDiveComputer(current, {
        elapsedSeconds: TICK_MILLISECONDS / 1000,
        type: DEVICE_EVENTS.TICK,
      }));
    }, TICK_MILLISECONDS);
    return () => clearInterval(interval);
  }, [simulation.clock.status]);

  const computer = useMemo(
    () => adaptSimulationToDiveComputerState(simulation),
    [simulation],
  );
  const deviceDisplay = useMemo(
    () => buildVirtualDiveComputerDisplay(device, simulation),
    [device, simulation],
  );

  useEffect(() => {
    const travelRateMpm = simulation.controls.ascentRateMpm;
    if (scenarioId === 'guided-dive') {
      if (stage === 0 && computer.isDive) setStage(1);
      else if (stage === 1 && computer.depthMeters >= 17) setStage(2);
      else if (stage === 2 && computer.diveSeconds >= 120) setStage(3);
      else if (stage === 3 && computer.mode === 'safety-stop') setStage(4);
      else if (stage === 4 && computer.safetyStopCompleted) setStage(5);
      else if (stage === 5 && computer.mode === 'post-dive') setStage(6);
    } else if (scenarioId === 'ascent-control') {
      if (stage === 0 && computer.activeAlarm?.code === 'rapid-ascent') setStage(1);
      else if (stage === 1 && travelRateMpm <= 9 && computer.activeAlarm?.code !== 'rapid-ascent') setStage(2);
      else if (stage === 2 && computer.mode === 'post-dive') setStage(3);
    }
  }, [computer, scenarioId, simulation.controls.ascentRateMpm, stage]);

  const scenario = useMemo(() => getDiveComputerScenario(scenarioId), [scenarioId]);
  const guidance = useMemo(
    () => scenarioGuidance({
      computer,
      scenarioId,
      stage,
      travelRateMpm: simulation.controls.ascentRateMpm,
    }),
    [computer, scenarioId, simulation.controls.ascentRateMpm, stage],
  );

  const reset = (nextScenarioId = scenarioId, nextFo2Percent = simulation.environment.actualGas.fo2 * 100) => {
    const nextScenario = getDiveComputerScenario(nextScenarioId);
    const nextSimulation = createSimulationForScenario(nextScenario, {
      actualFo2: nextFo2Percent / 100,
      simulationSpeed: simulation.clock.speed,
    });
    setSimulation(nextSimulation);
    setDevice((current) => preserveDeviceConfiguration(current));
    setStage(0);
  };

  const setScenarioId = (nextScenarioId) => {
    setScenarioIdState(nextScenarioId);
    reset(nextScenarioId, simulation.environment.actualGas.fo2 * 100);
  };

  const setFo2Percent = (nextFo2Percent) => {
    if (simulation.dive.lifecycle === 'diving') return;
    setSimulation((current) => setActualGas(current, { fo2: nextFo2Percent / 100 }));
  };

  const setIsRunning = (nextValue) => {
    setSimulation((current) => {
      const isRunning = current.clock.status === 'running';
      const shouldRun = typeof nextValue === 'function' ? nextValue(isRunning) : Boolean(nextValue);
      return shouldRun ? resumeSimulation(current) : pauseSimulation(current);
    });
  };

  const setTargetDepthMeters = (depthMeters) => {
    setSimulation((current) => setTargetDepth(current, depthMeters));
  };

  const setTravelRateMpm = (ascentRateMpm) => {
    setSimulation((current) => setTargetDepth(current, current.controls.targetDepthMeters, { ascentRateMpm }));
  };

  const setSimulationSpeed = (speed) => {
    setSimulation((current) => setDomainSimulationSpeed(current, speed));
  };

  const dispatchDeviceEvent = (type) => {
    setDevice((current) => transitionVirtualDiveComputer(current, { type }));
  };

  const getSnapshot = () => ({ device, scenarioId, simulation, stage });

  const restoreSnapshot = (snapshot) => {
    if (!snapshot) return;
    setDevice(snapshot.device);
    setScenarioIdState(snapshot.scenarioId);
    setSimulation(snapshot.simulation);
    setStage(snapshot.stage);
  };

  const prepareGuidedStep = (stepId) => {
    if (!String(stepId).startsWith('deep-stop-')) return;
    setDevice((current) => current.settings.deepStop
      ? current
      : { ...current, settings: { ...current.settings, deepStop: true } });
    setSimulation((current) => current.deepStopEnabled ? current : setDeepStopEnabled(current, true));
  };

  return {
    computer,
    configuredFo2Percent: device.configuredGas.fo2 * 100,
    device,
    deviceDisplay,
    dispatchDeviceEvent,
    fo2Percent: simulation.environment.actualGas.fo2 * 100,
    getSnapshot,
    guidance,
    isRunning: simulation.clock.status === 'running',
    reset,
    prepareGuidedStep,
    restoreSnapshot,
    scenario,
    scenarioId,
    setFo2Percent,
    setIsRunning,
    setScenarioId,
    setSimulationSpeed,
    setTargetDepthMeters,
    setTravelRateMpm,
    simulation,
    simulationSpeed: simulation.clock.speed,
    stage,
    targetDepthMeters: simulation.controls.targetDepthMeters,
    travelRateMpm: simulation.controls.ascentRateMpm,
  };
}
