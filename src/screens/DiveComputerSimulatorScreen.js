import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader, SectionLabel } from '../components/AppShell';
import { PrimaryButton, ProgressBar, SecondaryButton } from '../components/Ui';
import { NUMBER_KEYBOARD_ACCESSORY_ID, usesNumberKeyboard } from '../lib/numberKeyboard';
import useGuidedDiveLesson from '../features/diveComputer/training/useGuidedDiveLesson';
import useDiveComputerSimulator from '../features/diveComputer/useDiveComputerSimulator';
import { DIVE_COMPUTER_SCENARIOS } from '../features/diveComputer/scenarios';
import DiveProfileViewport from '../features/diveComputer/ui/DiveProfileViewport';
import SimulatorWorkspace from '../features/diveComputer/ui/SimulatorWorkspace';
import { displayDepthToMeters, formatComputerDepth, formatSimulationTime, metersToDisplayDepth } from '../lib/diveComputer';
import { SIMULATION_LIMITS, SIMULATION_SPEEDS } from '../lib/diveSimulation';
import { colors, radii, shadow, spacing } from '../theme';

const PRACTICE_DEPTHS = [0, SIMULATION_LIMITS.defaultSafetyStopDepthMeters, 15, 18, 30];
const PRACTICE_RATES = [6, 9, 12];

function GuidedLesson({ depthUnit, onOpenPractice, visible = true }) {
  const insets = useSafeAreaInsets();
  const [actualTime, setActualTime] = useState(() => new Date());
  const [scrollOffset, setScrollOffset] = useState(0);
  const [attentionElapsed, setAttentionElapsed] = useState(0);
  const [orientationVisible, setOrientationVisible] = useState(true);
  const [scrollViewportHeight, setScrollViewportHeight] = useState(0);
  const [practicePanelLayout, setPracticePanelLayout] = useState(null);
  const [highlightedRegion, setHighlightedRegion] = useState(null);
  const [controlledRateAcknowledged, setControlledRateAcknowledged] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const lessonScrollRef = useRef(null);
  const wasSimulationRunning = useRef(false);
  useEffect(() => {
    const interval = setInterval(() => setActualTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      subscription?.remove?.();
    };
  }, []);
  const lesson = useGuidedDiveLesson({ currentTime: actualTime, depthUnit });
  const {
    actionStarted,
    advance,
    beginStepAction,
    canGoBack,
    completionVisible,
    goBack,
    isLastStep,
    objectiveComplete,
    quizAnswerIncorrect,
    quizAnswerInput,
    quizDiveObservation,
    restart,
    setQuizAnswer,
    simulator,
    step,
    stepCount,
    stepIndex,
    submitQuizAnswer,
  } = lesson;
  useEffect(() => {
    if (!visible && simulator.isRunning) simulator.setIsRunning(false);
  }, [simulator.isRunning, visible]);
  const needsSimulationAction = !['continue', 'openPractice'].includes(step.action);
  const isLessonStart = stepIndex === 0;
  const objectiveFinished = objectiveComplete && !isLessonStart;
  const waitingForDevice = !objectiveComplete && !needsSimulationAction;
  const showSimulationControls = stepIndex >= 5;
  const highlightedControls = useMemo(() => {
    if (objectiveComplete) return [];
    const targetIs18m = Math.abs(simulator.targetDepthMeters - 18) < 0.2;
    const targetIs30m = Math.abs(simulator.targetDepthMeters - 30) < 0.2;
    const targetIsStopDepth = Math.abs(simulator.targetDepthMeters - SIMULATION_LIMITS.defaultSafetyStopDepthMeters) < 0.2;
    const targetIsDeepStopDepth = Math.abs(simulator.targetDepthMeters - 15) < 0.2;
    const targetIsSurface = simulator.targetDepthMeters < 0.2;
    if (step.id === 'go-dive') return [targetIs18m ? 'simulation-toggle' : 'depth-18'];
    if (step.id === 'activate-dive') return [];
    if (step.id === 'deep-stop-start') return [targetIs30m ? 'simulation-toggle' : 'depth-30'];
    if (step.id === 'deep-stop-descent') return [];
    if (step.id === 'deep-stop-enter') {
      if (!targetIsDeepStopDepth) return ['depth-deep'];
      return controlledRateAcknowledged ? [] : ['rate-6'];
    }
    if (step.id === 'deep-stop-complete') return simulator.simulationSpeed === 10 ? [] : ['speed-10'];
    if (step.id === 'deep-stop-safety-stop') {
      if (!targetIsStopDepth) return ['depth-stop'];
      return controlledRateAcknowledged ? [] : ['rate-6'];
    }
    if (step.id === 'deep-stop-surface') {
      if (simulator.simulationSpeed !== 10) return ['speed-10'];
      if (!targetIsSurface) return ['depth-0'];
      return controlledRateAcknowledged ? [] : ['rate-6'];
    }
    if (step.id === 'reach-training-depth') return [targetIs18m ? 'simulation-toggle' : 'depth-18'];
    if (step.id === 'accumulate-time') {
      if (simulator.simulationSpeed === 1) return ['speed-10'];
      if (simulator.simulationSpeed === 10) return ['speed-20'];
      return [];
    }
    if (step.id === 'enter-safety-stop') {
      if (!targetIsStopDepth) return ['depth-stop'];
      if (!controlledRateAcknowledged) return ['rate-6'];
      return [];
    }
    if (step.id === 'explain-safety-stop') return [];
    if (step.id === 'complete-safety-stop') return simulator.simulationSpeed === 10 ? [] : ['speed-10'];
    if (step.id === 'surface') {
      if (!targetIsSurface) return ['depth-0'];
      if (!controlledRateAcknowledged) return ['rate-6'];
      return [];
    }
    if (step.id === 'warning-dive') return [targetIs18m ? 'simulation-toggle' : 'depth-18'];
    if (step.id === 'warning-slow-ascent') {
      if (simulator.travelRateMpm !== 12) return ['rate-12'];
      if (!targetIsStopDepth) return ['depth-stop'];
      return [];
    }
    if (step.id === 'warning-correct') {
      if (simulator.travelRateMpm !== 6) return ['rate-6'];
      if (!targetIsSurface) return ['depth-0'];
      return [];
    }
    return [];
  }, [controlledRateAcknowledged, objectiveComplete, simulator.simulationSpeed, simulator.targetDepthMeters, simulator.travelRateMpm, step.id]);
  useEffect(() => {
    setAttentionElapsed(0);
    setHighlightedRegion(null);
    if (!visible || objectiveComplete || isLessonStart) return undefined;
    const interval = setInterval(() => setAttentionElapsed((elapsed) => elapsed + 1), 1000);
    return () => clearInterval(interval);
  }, [highlightedControls, isLessonStart, objectiveComplete, step.id, visible]);
  useEffect(() => {
    setControlledRateAcknowledged(false);
  }, [step.id]);
  useEffect(() => {
    const simulationStarted = !wasSimulationRunning.current && simulator.isRunning;
    wasSimulationRunning.current = simulator.isRunning;
    if (!visible || !simulationStarted) return undefined;
    const frame = requestAnimationFrame(() => {
      lessonScrollRef.current?.scrollTo({ y: 72, animated: !reduceMotion });
    });
    return () => cancelAnimationFrame(frame);
  }, [reduceMotion, simulator.isRunning, visible]);
  const focusLevel = isLessonStart || objectiveComplete
    ? 'quiet'
    : attentionElapsed >= 8
      ? 'urgent'
      : attentionElapsed >= 4
        ? 'attention'
        : 'quiet';
  const recordInteraction = (control) => {
    if (control === 'rate-6') setControlledRateAcknowledged(true);
    setAttentionElapsed(0);
  };
  const highlightedControlVisible = practicePanelLayout && highlightedRegion && scrollViewportHeight > 0
    ? practicePanelLayout.y + highlightedRegion.y + highlightedRegion.height <= scrollOffset + scrollViewportHeight
      && practicePanelLayout.y + highlightedRegion.y >= scrollOffset
    : scrollOffset > 110;
  const targetMayBeBelowViewport = showSimulationControls && highlightedControls.length > 0 && !highlightedControlVisible && !objectiveComplete;
  const showScrollCue = targetMayBeBelowViewport && attentionElapsed >= 4;
  const handleLessonScroll = (event) => {
    const nextOffset = event.nativeEvent.contentOffset.y;
    setScrollOffset(nextOffset);
    if (nextOffset > 110) setAttentionElapsed(0);
  };
  if (orientationVisible) {
    return (
      <View accessibilityElementsHidden={!visible} importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'} style={[styles.experience, !visible && styles.hiddenExperience]}>
        <ScrollView contentContainerStyle={[styles.orientationContent, { paddingBottom: insets.bottom + 28 }]} showsVerticalScrollIndicator={false}>
          <View style={styles.orientationCard}>
            <SectionLabel>WELCOME</SectionLabel>
            <Text style={styles.orientationTitle}>Welcome to the Dive Computer Trainer.</Text>
            <Text style={styles.orientationText}>This guided lesson builds familiarity with the information you rely on underwater: depth, elapsed dive time, and no-decompression limit (NDL).</Text>
            <Text style={styles.orientationText}>Learning these fields here helps you recognize them more confidently during underwater instruction and on rental computers, which can be less intuitive to operate and read.</Text>
            <View style={styles.orientationDivider} />
            <Text style={styles.orientationSection}>HOW THIS WORKS</Text>
            <Text style={styles.orientationText}>We will walk through the computer’s menus, settings, dive display, stops, and planner in a deliberate sequence.</Text>
            <Text style={styles.orientationText}>Free Practice is separate: it is the unrestricted simulator for open-ended exploration and more advanced settings after the guided lesson.</Text>
            <PrimaryButton accessibilityLabel="Begin guided lesson" label="Begin guided lesson" onPress={() => setOrientationVisible(false)} style={styles.orientationButton} />
          </View>
        </ScrollView>
      </View>
    );
  }
  const primaryLabel = simulator.isRunning
    ? 'STOP SIMULATION'
    : isLastStep
    ? step.actionLabel
    : stepIndex === 0
      ? step.actionLabel
      : actionStarted && simulator.isRunning
        ? step.runningLabel || 'Simulation running…'
        : needsSimulationAction
          ? step.actionLabel
          : 'Complete the instruction on the computer';

  const primaryAction = () => {
    if (simulator.isRunning) {
      simulator.setIsRunning(false);
      return;
    }
    if (isLastStep) {
      onOpenPractice();
      return;
    }
    if (stepIndex === 0 && objectiveComplete) {
      advance();
      return;
    }
    if (needsSimulationAction && !actionStarted) beginStepAction();
  };

  return (
    <View accessibilityElementsHidden={!visible} importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'} style={[styles.experience, !visible && styles.hiddenExperience]}>
    <ScrollView ref={lessonScrollRef} contentContainerStyle={[styles.guidedContent, { paddingBottom: insets.bottom + 28 }]} onLayout={(event) => setScrollViewportHeight(event.nativeEvent.layout.height)} onScroll={handleLessonScroll} scrollEventThrottle={16} showsVerticalScrollIndicator={false}>
      <View style={styles.guidedHeader}>
        <View style={styles.stageProgress}>
          <Text style={styles.progressLabel}>STEP {stepIndex + 1} OF {stepCount}</Text>
          <ProgressBar color={colors.cyan} value={(stepIndex + 1) / stepCount} />
        </View>
        <View style={styles.guidedTitleRow}>
          <Pressable accessibilityLabel="Back to previous lesson step" accessibilityRole="button" disabled={!canGoBack} onPress={goBack} style={({ pressed }) => [styles.guidedBackButton, !canGoBack && styles.guidedBackButtonDisabled, pressed && styles.pressed]}>
            <Text style={styles.guidedBackButtonText}>‹</Text>
          </Pressable>
          <View style={styles.flexOne}>
            <SectionLabel>{step.eyebrow}</SectionLabel>
            <Text style={styles.stageTitle}>{step.title}</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={restart} style={styles.restartButton}>
            <Text style={styles.restartButtonText}>RESTART</Text>
          </Pressable>
        </View>
      </View>

      <View style={[styles.instructionPanel, objectiveFinished && styles.instructionComplete]}>
        <View style={styles.instructionHeading}>
          <Text style={styles.instructionLabel}>{objectiveFinished ? 'OBJECTIVE COMPLETE' : isLessonStart ? 'START HERE' : waitingForDevice ? 'USE THE PHYSICAL BUTTONS' : 'YOUR NEXT ACTION'}</Text>
          <Text style={[styles.objectiveStatus, objectiveFinished && styles.objectiveStatusComplete]}>{objectiveFinished ? 'READY' : isLessonStart ? 'NOT STARTED' : 'IN PROGRESS'}</Text>
        </View>
        <Text style={styles.explanationText}>{step.body}</Text>
        <Text style={styles.instructionText}>{step.instruction}</Text>
      </View>

      {step.id === 'quiz-dive' ? <QuizDiveChecklist observation={quizDiveObservation} /> : null}

      {['set-hour', 'set-minute', 'set-year', 'set-month', 'set-day'].includes(step.id) ? <View style={styles.referenceClock}>
        <Text style={styles.referenceClockLabel}>REFERENCE DATE &amp; TIME</Text>
        <Text style={styles.referenceClockValue}>{actualTime.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</Text>
        <Text style={styles.referenceClockTime}>{actualTime.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</Text>
        <Text style={styles.referenceClockHint}>Set the computer within five minutes of this clock.</Text>
      </View> : null}

      <SimulatorWorkspace
        depthUnit={depthUnit}
        deviceDisplay={simulator.deviceDisplay}
        focusLevel={focusLevel}
        focusAreas={step.focus}
        onDeviceEvent={(event) => {
          recordInteraction();
          simulator.dispatchDeviceEvent(event);
        }}
        simulation={simulator.simulation}
      />

      {step.answerPrompt ? (
        <QuizAnswerPanel
          feedback={objectiveComplete ? 'correct' : quizAnswerIncorrect ? 'incorrect' : 'idle'}
          onChangeText={setQuizAnswer}
          onSubmit={() => { Keyboard.dismiss(); submitQuizAnswer(); }}
          prompt={step.answerPrompt}
          value={quizAnswerInput}
        />
      ) : null}

      {showSimulationControls ? <PracticeDivePanel depthUnit={depthUnit} focusLevel={focusLevel} highlightControls={highlightedControls} onControlRegionLayout={setHighlightedRegion} onInteraction={recordInteraction} onPanelLayout={(event) => setPracticePanelLayout(event.nativeEvent.layout)} simulator={simulator} /> : null}

      {step.focus.includes('profile') || isLastStep ? <DiveProfileViewport depthUnit={depthUnit} focused={step.focus.includes('profile')} simulation={simulator.simulation} /> : null}

      <View style={styles.lessonActions}>
        {stepIndex > 0 ? <SecondaryButton disabled={simulator.isRunning} label="Previous" onPress={goBack} style={styles.previousButton} /> : null}
        {simulator.isRunning || stepIndex === 0 || isLastStep ? <PrimaryButton disabled={!simulator.isRunning && stepIndex !== 0 && !isLastStep} label={primaryLabel} onPress={primaryAction} style={styles.lessonPrimary} /> : null}
        {typeof __DEV__ !== 'undefined' && __DEV__ && !isLastStep ? <SecondaryButton label="Next (DEV)" onPress={() => advance({ force: true })} style={styles.devNextButton} /> : null}
      </View>

      <Text style={styles.disclaimer}>Educational simulator only. Do not use these values to plan, conduct, or modify an actual dive.</Text>
    </ScrollView>
    {showSimulationControls && scrollOffset > 110 ? (
      <View pointerEvents="box-none" style={styles.floatingObjectiveWrap}>
        <View style={styles.floatingObjective}>
          <Text style={styles.floatingObjectiveLabel}>NEXT ACTION</Text>
          <Text style={styles.floatingObjectiveText}>{step.instruction}</Text>
        </View>
      </View>
    ) : null}
    {showScrollCue ? (
      <View pointerEvents="none" style={styles.scrollCueWrap}>
        <View accessible accessibilityLabel="Scroll down to reach the highlighted simulator control" accessibilityLiveRegion="polite" style={styles.scrollCue}>
          <Text style={styles.scrollCueArrow}>↓</Text>
          <View style={styles.flexOne}>
            <Text style={styles.scrollCueLabel}>SCROLL TO CONTROLS</Text>
            <Text style={styles.scrollCueText}>Scroll down to reach the highlighted simulator control.</Text>
          </View>
        </View>
      </View>
    ) : null}
    <Modal animationType="fade" transparent visible={visible && completionVisible} onRequestClose={() => {}}>
      <View style={styles.completionBackdrop}>
        <View style={styles.completionModal}>
          <SectionLabel>{step.reviewLabel || 'WHAT YOU JUST LEARNED'}</SectionLabel>
          <Text style={styles.completionTitle}>{step.title}</Text>
          <Text style={styles.completionHeading}>{step.reviewHeading || 'What you learned'}</Text>
          <Text style={styles.completionText}>{step.completionBody || step.body}</Text>
          <PrimaryButton label={step.reviewButtonLabel || (step.id === 'explain-safety-stop' ? 'Continue to surfacing' : 'Continue to the next step')} onPress={advance} style={styles.completionButton} />
        </View>
      </View>
    </Modal>
    </View>
  );
}

function SimulatorControlButton({ focused = false, focusLevel = 'quiet', label, onPress, selected, style }) {
  const pulse = useMemo(() => new Animated.Value(0), []);
  useEffect(() => {
    pulse.stopAnimation();
    pulse.setValue(0);
    if (!focused || focusLevel === 'quiet') return undefined;
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { duration: focusLevel === 'urgent' ? 420 : 750, easing: Easing.inOut(Easing.ease), toValue: 1, useNativeDriver: true }),
      Animated.timing(pulse, { duration: focusLevel === 'urgent' ? 420 : 750, easing: Easing.inOut(Easing.ease), toValue: 0, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [focusLevel, focused, pulse]);
  const focusPulseStyle = {
    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.2, focusLevel === 'urgent' ? 0.95 : 0.68] }),
    transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, focusLevel === 'urgent' ? 1.1 : 1.05] }) }],
  };
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => [styles.simulatorControl, style, selected && styles.simulatorControlSelected, focused && styles.guidedControlFocus, pressed && styles.pressed]}>
      {focused && focusLevel !== 'quiet' ? <Animated.View pointerEvents="none" style={[styles.focusPulse, focusPulseStyle]} /> : null}
      <Text style={[styles.simulatorControlText, selected && styles.selectedText]}>{label}</Text>
    </Pressable>
  );
}

function PracticeDivePanel({ depthUnit, focusLevel = 'quiet', highlightControls = [], onControlRegionLayout, onInteraction, onPanelLayout, simulator }) {
  const maximumDepth = depthUnit === 'm' ? 40 : 130;
  const displayTarget = metersToDisplayDepth(simulator.targetDepthMeters, depthUnit);
  const isHighlighted = (control) => highlightControls.includes(control);
  const reportRegion = (controls, event) => {
    if (controls.some((control) => highlightControls.includes(control))) onControlRegionLayout?.(event.nativeEvent.layout);
  };
  return (
    <View onLayout={onPanelLayout} style={styles.practiceSection}>
      <Text style={styles.sectionEyebrow}>SIMULATION CONTROLS</Text>
      <Text style={styles.helper}>These controls move the simulated diver; the two instrument buttons operate the computer.</Text>
      <View key={`run-${highlightControls.includes('simulation-toggle')}`} onLayout={(event) => reportRegion(['simulation-toggle'], event)} style={styles.runRow}>
        <SimulatorControlButton focusLevel={focusLevel} focused={isHighlighted('simulation-toggle')} label={simulator.isRunning ? 'STOP SIMULATION' : 'START SIMULATION'} onPress={() => { onInteraction?.('simulation-toggle'); simulator.setIsRunning((value) => !value); }} selected={simulator.isRunning} style={styles.runButton} />
        <SimulatorControlButton label="RESET" onPress={() => { onInteraction?.('reset'); simulator.reset(); }} style={styles.resetButton} />
      </View>
      <Text style={styles.subsectionLabel}>TIME ACCELERATION</Text>
      <View key={`speed-${highlightControls.join(',')}`} onLayout={(event) => reportRegion(SIMULATION_SPEEDS.map((speed) => `speed-${speed}`), event)} style={styles.optionRow}>
        {SIMULATION_SPEEDS.map((speed) => <SimulatorControlButton key={speed} focusLevel={focusLevel} focused={isHighlighted(`speed-${speed}`)} label={`${speed}×`} onPress={() => { onInteraction?.(`speed-${speed}`); simulator.setSimulationSpeed(speed); }} selected={simulator.simulationSpeed === speed} style={styles.optionButton} />)}
      </View>
      <View style={[styles.panelHeader, styles.depthHeader]}>
        <View style={styles.flexOne}>
          <Text style={styles.sectionEyebrow}>TARGET DEPTH</Text>
          <Text style={styles.helper}>Choose a depth and the engine travels there at the selected rate.</Text>
        </View>
        <Text style={styles.targetValue}>{formatComputerDepth(simulator.targetDepthMeters, depthUnit)}</Text>
      </View>
      <Slider accessibilityLabel="Target diver depth" maximumTrackTintColor="rgba(255,255,255,.16)" maximumValue={maximumDepth} minimumTrackTintColor={colors.cyan} minimumValue={0} onValueChange={(value) => { onInteraction?.(); simulator.setTargetDepthMeters(displayDepthToMeters(value, depthUnit)); }} step={1} thumbTintColor={colors.white} value={displayTarget} />
      <View key={`depth-${highlightControls.join(',')}`} onLayout={(event) => reportRegion(PRACTICE_DEPTHS.map((depth) => depth === 0 ? 'depth-0' : Math.abs(depth - SIMULATION_LIMITS.defaultSafetyStopDepthMeters) < 0.001 ? 'depth-stop' : Math.abs(depth - 15) < 0.001 ? 'depth-deep' : `depth-${depth}`), event)} style={styles.optionRow}>
        {PRACTICE_DEPTHS.map((depth) => <SimulatorControlButton key={depth} focusLevel={focusLevel} focused={isHighlighted(depth === 0 ? 'depth-0' : Math.abs(depth - SIMULATION_LIMITS.defaultSafetyStopDepthMeters) < 0.001 ? 'depth-stop' : Math.abs(depth - 15) < 0.001 ? 'depth-deep' : `depth-${depth}`)} label={formatComputerDepth(depth, depthUnit)} onPress={() => { onInteraction?.(depth === 0 ? 'depth-0' : Math.abs(depth - SIMULATION_LIMITS.defaultSafetyStopDepthMeters) < 0.001 ? 'depth-stop' : Math.abs(depth - 15) < 0.001 ? 'depth-deep' : `depth-${depth}`); simulator.setTargetDepthMeters(depth); }} selected={Math.abs(simulator.targetDepthMeters - depth) < 0.2} style={styles.optionButton} />)}
      </View>
      <Text style={styles.subsectionLabel}>ASCENT RATE</Text>
      <View key={`rate-${highlightControls.join(',')}`} onLayout={(event) => reportRegion(PRACTICE_RATES.map((rate) => `rate-${rate}`), event)} style={styles.optionRow}>
        {PRACTICE_RATES.map((rate) => <SimulatorControlButton key={rate} focusLevel={focusLevel} focused={isHighlighted(`rate-${rate}`)} label={rate === 6 ? 'CONTROLLED' : rate === 9 ? 'LIMIT' : 'FAST'} onPress={() => { onInteraction?.(`rate-${rate}`); simulator.setTravelRateMpm(rate); }} selected={simulator.travelRateMpm === rate} style={styles.optionButton} />)}
      </View>
    </View>
  );
}

function QuizAnswerPanel({ feedback, onChangeText, onSubmit, prompt, value }) {
  const hasNumberKeyboard = usesNumberKeyboard('decimal-pad');
  const locked = feedback === 'correct';
  return (
    <View style={styles.quizPanel}>
      <Text style={styles.quizPanelLabel}>YOUR ANSWER</Text>
      <Text style={styles.quizPrompt}>{prompt}</Text>
      <View style={styles.quizInputRow}>
        <TextInput
          accessibilityLabel={prompt}
          editable={!locked}
          inputAccessoryViewID={hasNumberKeyboard ? NUMBER_KEYBOARD_ACCESSORY_ID : undefined}
          keyboardType="decimal-pad"
          onChangeText={onChangeText}
          onSubmitEditing={onSubmit}
          placeholder="0.00"
          placeholderTextColor={colors.faint}
          returnKeyType="done"
          selectTextOnFocus
          style={styles.quizInput}
          value={value}
        />
        <PrimaryButton disabled={locked || !value.trim()} label="Submit" onPress={onSubmit} style={styles.quizSubmit} />
      </View>
      {feedback === 'incorrect' ? (
        <Text style={[styles.quizFeedback, styles.quizFeedbackBad]}>That does not match the saved dive. Make sure you opened the entry with DEEP STOP: YES, re-read HIGHEST PO2 on LOG DATA 3, and enter it exactly as shown.</Text>
      ) : null}
      {locked ? (
        <Text style={[styles.quizFeedback, styles.quizFeedbackGood]}>Correct — that matches the saved dive entry.</Text>
      ) : null}
    </View>
  );
}

function QuizDiveChecklist({ observation }) {
  const diving = observation.lifecycle === 'diving';
  const surfaced = observation.lifecycle === 'postDive';
  const wholeSeconds = Math.floor(observation.maxRuntimeSeconds);
  const minutes = Math.floor(wholeSeconds / 60);
  const seconds = wholeSeconds % 60;
  const timeMet = observation.maxRuntimeSeconds >= 600;
  const rows = [
    { done: timeMet, label: `Dive time reaches 10:00 — now ${minutes}:${String(seconds).padStart(2, '0')}` },
    {
      done: !observation.deepStopActivated || observation.deepStopCompleted,
      label: observation.deepStopActivated
        ? (observation.deepStopCompleted ? 'Deep stop completed' : 'Deep stop activated — hold it to 0:00')
        : 'Deep stop — required only if the computer activates one',
    },
    {
      done: !observation.safetyStopActivated || observation.safetyStopCompleted,
      label: observation.safetyStopActivated
        ? (observation.safetyStopCompleted ? 'Safety stop completed' : 'Safety stop activated — hold it to 0:00')
        : 'Safety stop — required only if the computer activates one',
    },
  ];
  const failedAfterSurface = surfaced && rows.some((row) => !row.done);
  return (
    <View style={styles.quizPanel}>
      <Text style={styles.quizPanelLabel}>LIVE DIVE CHECK</Text>
      <Text style={styles.quizPrompt}>
        {surfaced ? 'Dive recorded — the checklist below reflects that dive.' : diving ? 'Tracking your dive as it runs…' : 'Start a dive with the simulation controls below.'}
      </Text>
      {rows.map((row) => (
        <View key={row.label} style={styles.quizCheckRow}>
          <Text style={[styles.quizCheckMark, row.done && styles.quizCheckMarkDone]}>{row.done ? '✓' : '○'}</Text>
          <Text style={styles.quizCheckLabel}>{row.label}</Text>
        </View>
      ))}
      {failedAfterSurface ? (
        <Text style={[styles.quizFeedback, styles.quizFeedbackBad]}>This dive does not qualify yet. Start another dive — the checklist resets when a new dive begins.</Text>
      ) : null}
    </View>
  );
}

function PracticeLogPanel({ computer, depthUnit }) {
  const events = computer.events.slice().reverse();
  return (
    <View style={styles.practiceSection}>
      <Text style={styles.sectionEyebrow}>SIMULATION EVENTS</Text>
      <View style={styles.summaryRow}>
        <View style={styles.summaryStat}><Text style={styles.summaryLabel}>MAXIMUM DEPTH</Text><Text style={styles.summaryValue}>{formatComputerDepth(computer.maxDepthMeters, depthUnit)}</Text></View>
        <View style={styles.summaryStat}><Text style={styles.summaryLabel}>DIVE TIME</Text><Text style={styles.summaryValue}>{formatSimulationTime(computer.diveSeconds)}</Text></View>
      </View>
      {events.length ? events.map((event) => (
        <View key={event.id} style={styles.eventRow}>
          <Text style={styles.eventTime}>{formatSimulationTime(event.simulationSeconds)}</Text>
          <Text style={styles.eventLabel}>{event.label}</Text>
        </View>
      )) : <Text style={styles.emptyText}>Events appear here as the simulated dive changes modes, starts a stop, or triggers an alarm.</Text>}
    </View>
  );
}

function ScenarioSelector({ activeId, disabled, onSelect }) {
  return (
    <View style={styles.scenarioRow}>
      {DIVE_COMPUTER_SCENARIOS.map((scenario) => {
        const selected = scenario.id === activeId;
        return (
          <Pressable
            key={scenario.id}
            accessibilityRole="button"
            accessibilityState={{ disabled, selected }}
            disabled={disabled}
            onPress={() => onSelect(scenario.id)}
            style={({ pressed }) => [styles.scenarioPill, selected && styles.scenarioPillActive, disabled && styles.scenarioPillDisabled, pressed && styles.pressed]}
          >
            <Text style={[styles.scenarioPillText, selected && styles.scenarioPillTextActive]}>{scenario.shortLabel}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function PracticeMode({ depthUnit, onReturnToLesson, visible = true }) {
  const insets = useSafeAreaInsets();
  const simulator = useDiveComputerSimulator({ initialDepthUnit: depthUnit });
  const scenarioActive = simulator.scenarioId !== 'guided-dive';

  return (
    <ScrollView accessibilityElementsHidden={!visible} contentContainerStyle={[styles.practiceContent, { paddingBottom: insets.bottom + 32 }]} importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'} showsVerticalScrollIndicator={false} style={[styles.experience, !visible && styles.hiddenExperience]}>
      <View style={styles.practiceIntro}>
        <View style={styles.flexOne}>
          <SectionLabel>FREE PRACTICE</SectionLabel>
          <Text style={styles.title}>One dive. Three synchronized views.</Text>
          <Text style={styles.subtitle}>Move through the vertical gauge, operate the instrument, and watch the same dive build below.</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={onReturnToLesson} style={styles.tourButton}><Text style={styles.tourButtonText}>GUIDED TOUR</Text></Pressable>
      </View>

      <View style={styles.scenarioSection}>
        <SectionLabel>TRAINING SCENARIO</SectionLabel>
        <Text style={styles.helper}>{simulator.scenario.summary}</Text>
        <ScenarioSelector activeId={simulator.scenarioId} disabled={simulator.isRunning} onSelect={simulator.setScenarioId} />
        {simulator.isRunning ? <Text style={styles.scenarioLockNote}>Stop the simulation to switch scenarios.</Text> : null}
      </View>

      {scenarioActive ? (
        <View style={styles.coachPanel}>
          <Text style={styles.coachLabel}>COACH</Text>
          <Text style={styles.coachTitle}>{simulator.guidance.title}</Text>
          <Text style={styles.coachBody}>{simulator.guidance.body}</Text>
          <Text style={styles.coachAction}>{simulator.guidance.action}</Text>
        </View>
      ) : null}

      <SimulatorWorkspace depthUnit={depthUnit} deviceDisplay={simulator.deviceDisplay} onDeviceEvent={simulator.dispatchDeviceEvent} simulation={simulator.simulation} />
      <PracticeDivePanel depthUnit={depthUnit} simulator={simulator} />
      <DiveProfileViewport depthUnit={depthUnit} simulation={simulator.simulation} />
      <PracticeLogPanel computer={simulator.computer} depthUnit={depthUnit} />

      <Text style={styles.disclaimer}>Educational simulator only. Do not use these values to plan, conduct, or modify an actual dive.</Text>
    </ScrollView>
  );
}

export default function DiveComputerSimulatorScreen({ appSettings, onBack }) {
  const [experience, setExperience] = useState('lesson');
  const depthUnit = appSettings?.depthUnit === 'm' ? 'm' : 'ft';
  const headerAction = experience === 'lesson' ? <Pressable accessibilityRole="button" onPress={() => setExperience('practice')} style={styles.headerAction}><Text style={styles.headerActionText}>PRACTICE</Text></Pressable> : null;

  return (
    <View style={styles.screen}>
      <ScreenHeader action={headerAction} title="Dive Computer Trainer" onBack={onBack} />
      <GuidedLesson depthUnit={depthUnit} onOpenPractice={() => setExperience('practice')} visible={experience === 'lesson'} />
      <PracticeMode depthUnit={depthUnit} onReturnToLesson={() => setExperience('lesson')} visible={experience === 'practice'} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  experience: { flex: 1 },
  hiddenExperience: { display: 'none' },
  headerAction: { alignItems: 'center', borderColor: colors.lineStrong, borderRadius: radii.pill, borderWidth: 1, height: 40, justifyContent: 'center', paddingHorizontal: 10 },
  headerActionText: { color: colors.cyan, fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },

  practiceContent: { paddingHorizontal: 9, paddingTop: 14 },
  title: { color: colors.text, fontSize: 29, fontWeight: '900', letterSpacing: -0.7, lineHeight: 33 },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 10 },

  guidedContent: { paddingHorizontal: spacing.md, paddingTop: spacing.lg },
  orientationContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.md, paddingTop: spacing.lg },
  orientationCard: { backgroundColor: '#0B2838', borderColor: 'rgba(112,221,246,.34)', borderRadius: radii.lg, borderWidth: 1, padding: spacing.lg, ...shadow },
  orientationTitle: { color: colors.text, fontSize: 26, fontWeight: '900', letterSpacing: -0.7, lineHeight: 31, marginTop: 4 },
  orientationText: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 14 },
  orientationDivider: { backgroundColor: colors.lineStrong, height: StyleSheet.hairlineWidth, marginTop: 22 },
  orientationSection: { color: colors.cyan, fontSize: 10, fontWeight: '900', letterSpacing: 1.2, marginTop: 20 },
  orientationButton: { marginTop: 24 },
  guidedHeader: { marginBottom: spacing.md },
  stageProgress: { marginBottom: 10 },
  progressLabel: { color: colors.faint, fontSize: 10, fontWeight: '900', letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' },
  guidedTitleRow: { alignItems: 'flex-start', flexDirection: 'row', marginTop: 8 },
  guidedBackButton: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.lineStrong, borderRadius: radii.pill, borderWidth: 1, height: 38, justifyContent: 'center', marginRight: 9, width: 38 },
  guidedBackButtonDisabled: { opacity: 0.35 },
  guidedBackButtonText: { color: colors.text, fontSize: 28, lineHeight: 30, marginTop: -3 },
  stageTitle: { color: colors.text, fontSize: 21, fontWeight: '900', letterSpacing: -0.4, lineHeight: 24, marginTop: 2 },
  restartButton: { alignItems: 'center', borderColor: colors.lineStrong, borderRadius: radii.pill, borderWidth: 1, justifyContent: 'center', marginLeft: 12, marginTop: 2, minHeight: 38, paddingHorizontal: 11 },
  restartButtonText: { color: colors.cyan, fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },

  instructionPanel: { backgroundColor: '#0B2838', borderColor: 'rgba(112,221,246,.34)', borderRadius: radii.lg, borderWidth: 1, marginTop: 14, padding: spacing.md, ...shadow },
  instructionComplete: { backgroundColor: 'rgba(20,64,44,.55)', borderColor: 'rgba(112,226,163,.5)' },
  instructionHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  instructionLabel: { color: colors.cyan, fontSize: 10, fontWeight: '900', letterSpacing: 1.3 },
  objectiveStatus: { color: colors.warning, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  objectiveStatusComplete: { color: colors.good },
  instructionText: { color: colors.text, fontSize: 15, fontWeight: '800', lineHeight: 21, marginTop: 8 },
  explanationText: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 6 },
  floatingObjectiveWrap: { left: 0, paddingHorizontal: spacing.md, position: 'absolute', right: 0, top: 0, zIndex: 20 },
  floatingObjective: { backgroundColor: '#0B2838', borderColor: colors.cyan, borderRadius: radii.md, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, ...shadow },
  floatingObjectiveLabel: { color: colors.cyan, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  floatingObjectiveText: { color: colors.text, fontSize: 12, fontWeight: '800', lineHeight: 17, marginTop: 4 },
  scrollCueWrap: { left: 0, paddingHorizontal: spacing.md, position: 'absolute', right: 0, top: 8, zIndex: 21 },
  scrollCue: { alignItems: 'center', backgroundColor: 'rgba(11,40,56,.96)', borderColor: 'rgba(112,221,246,.5)', borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 9, ...shadow },
  scrollCueArrow: { color: colors.cyan, fontSize: 23, fontWeight: '900', lineHeight: 25, marginRight: 10 },
  scrollCueLabel: { color: colors.cyan, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  scrollCueText: { color: colors.text, fontSize: 11, lineHeight: 16, marginTop: 2 },
  referenceClock: { backgroundColor: 'rgba(7,23,39,.9)', borderColor: colors.lineStrong, borderRadius: radii.md, borderWidth: 1, marginBottom: 14, padding: 12 },
  referenceClockLabel: { color: colors.cyan, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  referenceClockValue: { color: colors.text, fontSize: 14, fontWeight: '800', marginTop: 5 },
  referenceClockTime: { color: colors.white, fontSize: 24, fontVariant: ['tabular-nums'], fontWeight: '900', marginTop: 2 },
  referenceClockHint: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 4 },

  lessonActions: { flexDirection: 'row', gap: 8, marginTop: 20 },
  previousButton: { minWidth: 100 },
  lessonPrimary: { flex: 1 },
  devNextButton: { marginTop: 8 },
  completionBackdrop: { alignItems: 'center', backgroundColor: 'rgba(2,10,18,.78)', flex: 1, justifyContent: 'center', padding: spacing.lg },
  completionModal: { backgroundColor: colors.panel, borderColor: colors.cyan, borderRadius: radii.lg, borderWidth: 1, maxWidth: 430, padding: spacing.lg, width: '100%', ...shadow },
  completionTitle: { color: colors.text, fontSize: 21, fontWeight: '900', marginTop: 5 },
  completionHeading: { color: colors.cyan, fontSize: 10, fontWeight: '900', letterSpacing: 1, marginTop: 16, textTransform: 'uppercase' },
  completionText: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 5 },
  completionButton: { marginTop: 20 },

  practiceIntro: { alignItems: 'flex-start', flexDirection: 'row', marginBottom: spacing.lg },
  tourButton: { alignItems: 'center', borderColor: colors.lineStrong, borderRadius: 5, borderWidth: 1, justifyContent: 'center', marginLeft: 8, marginTop: 2, minHeight: 38, paddingHorizontal: 9 },
  tourButtonText: { color: colors.cyan, fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },

  scenarioSection: { marginBottom: spacing.md },
  scenarioRow: { flexDirection: 'row', gap: 6, marginTop: 10 },
  scenarioPill: { alignItems: 'center', backgroundColor: '#07111D', borderColor: colors.lineStrong, borderRadius: 5, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 40, paddingHorizontal: 8 },
  scenarioPillActive: { backgroundColor: 'rgba(112,221,246,.12)', borderColor: colors.cyan },
  scenarioPillDisabled: { opacity: 0.4 },
  scenarioPillText: { color: colors.muted, fontSize: 10, fontWeight: '900', letterSpacing: 0.7 },
  scenarioPillTextActive: { color: colors.cyan },
  scenarioLockNote: { color: colors.faint, fontSize: 10, fontStyle: 'italic', marginTop: 6 },
  coachPanel: { backgroundColor: '#0B2838', borderColor: 'rgba(112,221,246,.34)', borderRadius: radii.md, borderWidth: 1, marginBottom: spacing.md, padding: spacing.md },
  coachLabel: { color: colors.cyan, fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },
  coachTitle: { color: colors.text, fontSize: 15, fontWeight: '900', marginTop: 5 },
  coachBody: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 5 },
  coachAction: { color: colors.text, fontSize: 12, fontWeight: '800', lineHeight: 17, marginTop: 8 },

  practiceSection: { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 20, paddingTop: 14 },
  sectionEyebrow: { color: colors.text, fontSize: 11, fontWeight: '900', letterSpacing: 1.1 },
  panelHeader: { alignItems: 'center', flexDirection: 'row' },
  depthHeader: { marginTop: 20 },
  flexOne: { flex: 1 },
  helper: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 3 },
  targetValue: { color: colors.cyan, fontSize: 19, fontWeight: '900', marginLeft: 10 },
  optionRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  optionButton: { flex: 1 },
  simulatorControl: { alignItems: 'center', backgroundColor: '#07111D', borderColor: colors.lineStrong, borderRadius: 5, borderWidth: 1, justifyContent: 'center', minHeight: 40, paddingHorizontal: 8 },
  simulatorControlSelected: { backgroundColor: 'rgba(112,221,246,.12)', borderColor: colors.cyan },
  guidedControlFocus: { borderColor: colors.accent, borderWidth: 2, shadowColor: colors.accent, shadowOpacity: 0.75, shadowRadius: 7 },
  simulatorControlText: { color: colors.muted, fontSize: 9, fontWeight: '900', letterSpacing: 0.7 },
  subsectionLabel: { color: colors.faint, fontSize: 9, fontWeight: '900', letterSpacing: 1, marginTop: 16 },
  runRow: { flexDirection: 'row', gap: 8, marginTop: 15 },
  runButton: { flex: 1 },
  resetButton: { width: 86 },
  selectedText: { color: colors.cyan },
  summaryRow: { flexDirection: 'row', gap: 8, marginVertical: 12 },
  summaryStat: { flex: 1 },
  summaryLabel: { color: colors.faint, fontSize: 8, fontWeight: '900', letterSpacing: 0.8 },
  summaryValue: { color: colors.text, fontSize: 18, fontVariant: ['tabular-nums'], fontWeight: '900', marginTop: 3 },
  eventRow: { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', minHeight: 42, paddingVertical: 11 },
  eventTime: { color: colors.faint, fontSize: 10, fontVariant: ['tabular-nums'], fontWeight: '800', width: 46 },
  eventLabel: { color: colors.muted, flex: 1, fontSize: 11, fontWeight: '700' },
  emptyText: { color: colors.faint, fontSize: 11, lineHeight: 17, marginTop: 10 },
  disclaimer: { color: colors.faint, fontSize: 11, lineHeight: 17, marginHorizontal: 8, marginTop: 16, textAlign: 'center' },

  quizPanel: { backgroundColor: 'rgba(7,23,39,.9)', borderColor: colors.lineStrong, borderRadius: radii.md, borderWidth: 1, marginTop: 14, padding: spacing.md },
  quizPanelLabel: { color: colors.cyan, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  quizPrompt: { color: colors.text, fontSize: 13, fontWeight: '700', lineHeight: 19, marginTop: 6 },
  quizInputRow: { alignItems: 'stretch', flexDirection: 'row', gap: 8, marginTop: 12 },
  quizInput: { backgroundColor: '#07111D', borderColor: colors.lineStrong, borderRadius: radii.md, borderWidth: 1, color: colors.text, flex: 1, fontSize: 18, fontVariant: ['tabular-nums'], fontWeight: '800', paddingHorizontal: 12, paddingVertical: 10 },
  quizSubmit: { justifyContent: 'center', minWidth: 96 },
  quizFeedback: { fontSize: 12, fontWeight: '700', lineHeight: 17, marginTop: 10 },
  quizFeedbackBad: { color: colors.warning },
  quizFeedbackGood: { color: colors.good },
  quizCheckRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 8, marginTop: 8 },
  quizCheckMark: { color: colors.faint, fontSize: 13, fontWeight: '900', width: 14 },
  quizCheckMarkDone: { color: colors.good },
  quizCheckLabel: { color: colors.muted, flex: 1, fontSize: 12, lineHeight: 17 },

  pressed: { opacity: 0.72 },
});
