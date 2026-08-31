import { useEffect, useMemo, useRef, useState } from 'react';

import useDiveComputerSimulator from '../useDiveComputerSimulator';
import { DEVICE_SCREENS } from '../../../lib/virtualDiveComputer';
import {
  GUIDED_DIVE_ACTIONS,
  GUIDED_DIVE_STEPS,
  evaluateGuidedDiveObjective,
  guidedDiveStepAt,
  loggedDiveTwoPo2Answer,
  shouldShowGuidedCompletionReview,
} from './guidedDiveLesson';
import { buildGuidedStepCompletionSnapshot } from './guidedStepFabrication';

const AUTO_ADVANCE_DELAY_MS = 1250;

// Scenario 3 grades the dive the student runs independently: the lesson hook
// accumulates this as the live simulation ticks, then evaluateGuidedDiveObjective
// decides whether the finished dive qualifies.
const EMPTY_QUIZ_DIVE_OBSERVATION = Object.freeze({
  deepStopActivated: false,
  deepStopCompleted: false,
  lifecycle: 'surface',
  maxRuntimeSeconds: 0,
  safetyStopActivated: false,
  safetyStopCompleted: false,
  sessionId: null,
});

export default function useGuidedDiveLesson({ depthUnit = 'ft', currentTime = new Date() } = {}) {
  const simulator = useDiveComputerSimulator({ initialDepthUnit: depthUnit });
  const [stepIndex, setStepIndex] = useState(0);
  const [actionStarted, setActionStarted] = useState(false);
  const [completionVisible, setCompletionVisible] = useState(false);
  const resetAtTenMinutes = useRef(false);
  const observedCompletion = useRef(false);
  const advanceLock = useRef(null);
  const stepSnapshots = useRef([]);
  const plannerStartingDepth = useRef(null);
  const [plannerDepthsSeen, setPlannerDepthsSeen] = useState([]);
  const [plannerCycleComplete, setPlannerCycleComplete] = useState(false);
  const [quizAnswerInput, setQuizAnswerInput] = useState('');
  const [quizAnswerSubmitted, setQuizAnswerSubmitted] = useState(null);
  const quizDiveObservationRef = useRef(EMPTY_QUIZ_DIVE_OBSERVATION);
  const [quizDiveObservation, setQuizDiveObservation] = useState(EMPTY_QUIZ_DIVE_OBSERVATION);
  const step = guidedDiveStepAt(stepIndex, depthUnit);
  if (!stepSnapshots.current[stepIndex]) stepSnapshots.current[stepIndex] = simulator.getSnapshot();
  const objectiveComplete = useMemo(
    () => evaluateGuidedDiveObjective(step.id, {
      device: simulator.device,
      simulation: simulator.simulation,
      actualTime: currentTime,
      plannerCycleComplete,
      quizAnswer: quizAnswerSubmitted,
      quizDiveObservation,
    }),
    [currentTime, plannerCycleComplete, quizAnswerSubmitted, quizDiveObservation, simulator.device, simulator.simulation, step.id],
  );
  const quizAnswerIncorrect = step.id === 'quiz-log-po2' && quizAnswerSubmitted != null && !objectiveComplete;

  useEffect(() => {
    if (step.id !== 'planner-read') {
      plannerStartingDepth.current = null;
      if (plannerDepthsSeen.length) setPlannerDepthsSeen([]);
      if (plannerCycleComplete) setPlannerCycleComplete(false);
      return;
    }
    if (simulator.device.currentScreen !== DEVICE_SCREENS.PLAN_ACTIVE) return;
    const currentDepth = simulator.device.planner.depthMeters;
    if (plannerStartingDepth.current == null) plannerStartingDepth.current = currentDepth;
    setPlannerDepthsSeen((seen) => seen.includes(currentDepth) ? seen : [...seen, currentDepth]);
    if (currentDepth === plannerStartingDepth.current && plannerDepthsSeen.length > 1) setPlannerCycleComplete(true);
  }, [plannerCycleComplete, plannerDepthsSeen.length, simulator.device.currentScreen, simulator.device.planner.depthMeters, step.id]);

  // Each knowledge-check scenario starts from a clean slate: clear any entered
  // answer, and (unless we are on the graded dive) discard the dive observation.
  useEffect(() => {
    setQuizAnswerInput('');
    setQuizAnswerSubmitted(null);
    if (step.id !== 'quiz-dive') {
      quizDiveObservationRef.current = EMPTY_QUIZ_DIVE_OBSERVATION;
      setQuizDiveObservation(EMPTY_QUIZ_DIVE_OBSERVATION);
    }
  }, [step.id]);

  // While the student runs scenario 3, accumulate what the dive actually did.
  // Only observations from a dive we watched start count: a stop is "required"
  // only once the computer activates it, and the safety stop only while it is
  // enabled on the device. Stale state from the earlier guided dives is ignored.
  useEffect(() => {
    if (step.id !== 'quiz-dive') return;
    const sim = simulator.simulation;
    const previous = quizDiveObservationRef.current;
    const startingNewDive = sim.dive.lifecycle === 'diving' && sim.dive.diveSessionId !== previous.sessionId;
    const base = startingNewDive
      ? { ...EMPTY_QUIZ_DIVE_OBSERVATION, sessionId: sim.dive.diveSessionId }
      : previous;
    const watchingThisDive = base.sessionId != null && sim.dive.diveSessionId === base.sessionId;
    const safetyStopTracked = watchingThisDive && simulator.device.settings.safetyStopEnabled;
    const next = {
      deepStopActivated: base.deepStopActivated || (watchingThisDive && sim.deepStop.status === 'active'),
      deepStopCompleted: base.deepStopCompleted || (watchingThisDive && sim.deepStop.status === 'completed'),
      lifecycle: watchingThisDive ? sim.dive.lifecycle : 'surface',
      maxRuntimeSeconds: watchingThisDive && (sim.dive.lifecycle === 'diving' || sim.dive.lifecycle === 'postDive')
        ? Math.max(base.maxRuntimeSeconds, sim.dive.runtimeSeconds)
        : base.maxRuntimeSeconds,
      safetyStopActivated: base.safetyStopActivated || (safetyStopTracked && sim.safetyStop.status === 'active'),
      safetyStopCompleted: base.safetyStopCompleted || (safetyStopTracked && sim.safetyStop.status === 'completed'),
      sessionId: base.sessionId,
    };
    quizDiveObservationRef.current = next;
    setQuizDiveObservation((current) => (
      current.deepStopActivated === next.deepStopActivated
        && current.deepStopCompleted === next.deepStopCompleted
        && current.lifecycle === next.lifecycle
        && current.maxRuntimeSeconds === next.maxRuntimeSeconds
        && current.safetyStopActivated === next.safetyStopActivated
        && current.safetyStopCompleted === next.safetyStopCompleted
        && current.sessionId === next.sessionId
        ? current
        : next
    ));
  }, [simulator.device.settings.safetyStopEnabled, simulator.simulation, step.id]);

  useEffect(() => {
    if (simulator.simulation.dive.lifecycle !== 'diving') {
      resetAtTenMinutes.current = false;
      return;
    }
    if (simulator.simulation.dive.runtimeSeconds >= 600 && !resetAtTenMinutes.current) {
      resetAtTenMinutes.current = true;
      if (simulator.simulationSpeed !== 1) simulator.setSimulationSpeed(1);
    }
  }, [simulator.simulation, simulator.simulationSpeed]);

  // Completion is acknowledged explicitly so the student can pause and
  // review what they just did before moving on.
  useEffect(() => {
    if (!objectiveComplete) {
      if (completionVisible && observedCompletion.current && shouldShowGuidedCompletionReview(step.id)) return undefined;
      observedCompletion.current = false;
      setCompletionVisible(false);
      return undefined;
    }
    if (stepIndex === 0 || stepIndex >= GUIDED_DIVE_STEPS.length - 1 || !shouldShowGuidedCompletionReview(step.id) || observedCompletion.current) return undefined;
    observedCompletion.current = true;
    setCompletionVisible(true);
    return undefined;
  }, [objectiveComplete, stepIndex]);

  // A green confirmation should briefly acknowledge routine progress, then
  // reveal the next control instruction without making the student hunt for
  // another Continue button. Foundational concepts still pause for reflection.
  useEffect(() => {
    if (!objectiveComplete || stepIndex === 0 || stepIndex >= GUIDED_DIVE_STEPS.length - 1 || shouldShowGuidedCompletionReview(step.id)) return undefined;
    const timeout = setTimeout(() => {
      advance();
    }, AUTO_ADVANCE_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [objectiveComplete, step.id, stepIndex]);

  const beginStepAction = () => {
    setActionStarted(true);
  };

  const advance = ({ force = false } = {}) => {
    if ((!objectiveComplete && !completionVisible && !force) || stepIndex >= GUIDED_DIVE_STEPS.length - 1) return;
    if (advanceLock.current === stepIndex) return;
    advanceLock.current = stepIndex;
    // The hidden DEV skip also fast-forwards the computer + simulation + logbook
    // to the state this step should leave behind, so later steps are testable
    // without playing through everything. `restoreSnapshot` snapshots it, so
    // Previous still steps the device back correctly.
    if (force) {
      let fabricated = null;
      try {
        fabricated = buildGuidedStepCompletionSnapshot(step.id, { actualTime: currentTime, depthUnit });
      } catch (error) {
        if (typeof console !== 'undefined') console.warn('Guided DEV skip could not fabricate state', error);
      }
      if (fabricated) simulator.restoreSnapshot(fabricated);
      else simulator.prepareGuidedStep(guidedDiveStepAt(stepIndex + 1, depthUnit).id);
    }
    setStepIndex((current) => current + 1);
    setActionStarted(false);
    observedCompletion.current = false;
    setCompletionVisible(false);
  };

  const goBack = () => {
    if (stepIndex <= 0) return;
    simulator.restoreSnapshot(stepSnapshots.current[stepIndex - 1]);
    setStepIndex((current) => Math.max(0, current - 1));
    setActionStarted(false);
    observedCompletion.current = false;
    advanceLock.current = null;
  };

  const restart = () => {
    simulator.reset('guided-dive', 21);
    stepSnapshots.current = [];
    setStepIndex(0);
    setActionStarted(false);
    observedCompletion.current = false;
    advanceLock.current = null;
  };

  return {
    actionStarted,
    advance,
    beginStepAction,
    completionVisible,
    canGoBack: stepIndex > 0,
    goBack,
    isLastStep: stepIndex === GUIDED_DIVE_STEPS.length - 1,
    objectiveComplete,
    quizAnswerIncorrect,
    quizAnswerInput,
    quizAnswerSubmitted,
    quizDiveObservation,
    quizExpectedPo2: loggedDiveTwoPo2Answer(simulator.device),
    restart,
    setQuizAnswer: (text) => {
      setQuizAnswerInput(text);
      setQuizAnswerSubmitted(null);
    },
    simulator,
    step,
    stepCount: GUIDED_DIVE_STEPS.length,
    stepIndex,
    submitQuizAnswer: () => setQuizAnswerSubmitted(quizAnswerInput.trim()),
  };
}
