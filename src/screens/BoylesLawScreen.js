import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Slider from '@react-native-community/slider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '../components/AppShell';
import BoyleScene from '../features/boylesLaw/BoyleScene';
import {
  BURST_AT,
  MAX_DEPTH,
  TOUR_STEPS,
  boyle,
  breathCost,
  clamp,
  depthLabel,
  gasMinutesRemaining,
  gasUseRate,
  gateMet,
  gateProgress,
  localizeStep,
} from '../features/boylesLaw/model';
import { colors } from '../theme';

const TOUR_SEEN_KEY = 'boylesLawTourSeen';

function Dock({ symbol, label, active, onPress }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: Boolean(active) }} onPress={onPress} style={[styles.dockBtn, active && styles.dockBtnOn]}>
      <Text style={styles.dockSymbol}>{symbol}</Text>
      <Text style={[styles.dockLabel, active && styles.dockLabelOn]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

// A soft pulsing ring that nudges a stalled student toward the next action.
function Pulse({ active, style, children }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) { anim.setValue(0); return undefined; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(anim, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 0, duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [active]);
  return (
    <View style={style}>
      {children}
      {active ? <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.hintGlow, { opacity: anim.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.95] }) }]} /> : null}
    </View>
  );
}

export default function BoylesLawScreen({ onBack, appSettings = {} }) {
  const insets = useSafeAreaInsets();
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const [consoleHeight, setConsoleHeight] = useState(150);
  const [mode, setMode] = useState('compression');
  const [depth, setDepth] = useState(0);
  const [unit, setUnit] = useState(appSettings.depthUnit === 'ft' ? 'ft' : 'm');
  const [gasAtm, setGasAtm] = useState(1);
  const [burst, setBurst] = useState(false);
  const [tankPercent, setTankPercent] = useState(100);
  const [breathId, setBreathId] = useState(0);
  const [tourStep, setTourStep] = useState(null);
  const [tourAnswer, setTourAnswer] = useState(null);
  // Per-step progress the guided flow gates on (reset on every step change).
  const [stepProgress, setStepProgress] = useState({ breaths: 0, breathsShallow: 0, breathsDeep: 0, burstSeen: false });

  const state = useMemo(() => boyle(depth, gasAtm), [depth, gasAtm]);
  const over = mode === 'compression' && !burst && state.overExpansion > 0.02;
  const rate = gasUseRate(depth);
  const sealed = gasAtm > 1.02;

  // Once a sealed gas space swells past the burst threshold it ruptures, and
  // stays ruptured until the student ties on a new balloon or resets.
  useEffect(() => {
    if (mode === 'compression' && !burst && state.volume >= BURST_AT) {
      setBurst(true);
      setStepProgress((p) => (p.burstSeen ? p : { ...p, burstSeen: true }));
    }
  }, [mode, burst, state.volume]);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(TOUR_SEEN_KEY).then((seen) => { if (active && !seen) goToTourStep(0); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hook point for re-engagement nudges; the guided flow now gates on explicit
  // task completion instead of an idle timer, so this is currently a no-op.
  const bumpTourActivity = () => {};

  const sceneHeight = Math.max(300, stage.height - consoleHeight - insets.bottom - 18);

  const reset = () => {
    setDepth(0); setGasAtm(1); setBurst(false); setTankPercent(100);
  };
  const switchMode = () => {
    setMode((m) => (m === 'compression' ? 'breathing' : 'compression'));
    setGasAtm(1); setBurst(false); setTankPercent(100);
  };

  const contextAction = () => {
    bumpTourActivity();
    if (burst) { setBurst(false); setGasAtm(1); return; }
    if (mode === 'breathing') {
      setTankPercent((value) => clamp(value - breathCost(depth), 0, 100));
      setBreathId((n) => n + 1);
      setStepProgress((p) => ({
        ...p,
        breaths: p.breaths + 1,
        breathsShallow: depth <= 5 ? p.breathsShallow + 1 : p.breathsShallow,
        breathsDeep: depth >= 18 ? p.breathsDeep + 1 : p.breathsDeep,
      }));
      return;
    }
    setGasAtm((current) => (current > 1.02 ? 1 : state.pressure));
  };
  const contextLabel = burst
    ? 'Tie on a new balloon'
    : mode === 'breathing'
      ? (tankPercent <= 0 ? 'Tank empty' : `Take a breath  −${Math.round(breathCost(depth))}%`)
      : (sealed ? 'Release sealed gas' : 'Fully inflate here');

  const goToTourStep = (index) => {
    const step = TOUR_STEPS[index];
    if (!step) return;
    setTourStep(index);
    setTourAnswer(null);
    setStepProgress({ breaths: 0, breathsShallow: 0, breathsDeep: 0, burstSeen: false });
    // The closing step is just a hand-off to free play — leave the sim exactly
    // where the student left it instead of snapping it to a new mode/depth.
    if (step.isLast) return;
    setMode(step.mode);
    setDepth(step.depth);
    setGasAtm(typeof step.gasAtm === 'number' ? step.gasAtm : 1);
    setBurst(false);
    setTankPercent(100);
  };
  const startTour = () => goToTourStep(0);
  const endTour = () => { setTourStep(null); AsyncStorage.setItem(TOUR_SEEN_KEY, '1'); };
  // Guided-flow copy with `{18m}` depth tokens expanded to the diver's unit.
  const tourStepData = tourStep === null ? null : localizeStep(TOUR_STEPS[tourStep], unit);
  const questionLocked = tourStepData?.kind === 'question';

  // Student-flow lock-down: each step exposes only the control it needs.
  const focus = tourStepData ? (tourStepData.focus || 'none') : 'all';
  const allow = (control) => focus === 'all' || focus.split('+').includes(control);
  const depthEnabled = !questionLocked && allow('depth');
  const sceneLocked = Boolean(tourStepData) && !allow('depth');

  // Action steps gate Next on completing a task on the real controls.
  const gateCtx = { depth, mode, gasAtm, volume: state.volume, burst, burstSeen: stepProgress.burstSeen, tankPercent, breaths: stepProgress.breaths, breathsShallow: stepProgress.breathsShallow, breathsDeep: stepProgress.breathsDeep };
  const checklist = tourStepData?.kind === 'action' ? gateProgress(tourStepData, gateCtx) : [];
  const taskDone = tourStepData?.kind !== 'action' || gateMet(tourStepData, gateCtx);
  const tourCanAdvance = !tourStepData
    || (tourStepData.kind === 'question' ? tourAnswer !== null : taskDone);
  const highlight = new Set(tourStepData && !taskDone ? (tourStepData.highlight || []) : []);

  const selectTourAnswer = (index) => { setTourAnswer(index); bumpTourActivity(); };
  const tourNext = () => { bumpTourActivity(); if (tourStepData?.isLast) endTour(); else goToTourStep(tourStep + 1); };
  const tourBack = () => { bumpTourActivity(); goToTourStep(tourStep - 1); };

  // Prediction questions move on by themselves ~2.5s after the student answers,
  // so a correct/incorrect check doesn't stall waiting for a manual Next tap.
  useEffect(() => {
    if (tourStepData?.kind !== 'question' || tourAnswer === null) return undefined;
    const timer = setTimeout(() => {
      if (tourStepData.isLast) endTour();
      else goToTourStep(tourStep + 1);
    }, 2500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourStep, tourAnswer]);

  const showContext = allow('context') || burst;
  const showDock = focus === 'all' || focus === 'mode';

  const gasMinutes = gasMinutesRemaining(depth, tankPercent);

  // Always-on readout drawn onto the scene (replaces the card that used to
  // cover the demo). Left corner for the balloon, right corner for the diver.
  const hudLines = mode === 'compression'
    ? (burst
        ? [
            { t: 'BOYLE’S LAW', k: 'title' },
            { t: 'RUPTURED', k: 'value', danger: true },
            { t: `sealed gas hit ${BURST_AT.toFixed(1)}×`, k: 'sub' },
          ]
        : sealed
          ? [
              { t: 'BOYLE’S LAW', k: 'title' },
              { t: `sealed: ${gasAtm.toFixed(1)} L`, k: 'value' },
              { t: `now ${state.volume.toFixed(2)} L`, k: 'value', danger: over },
              { t: `${state.pressure.toFixed(1)} ATA · ${depthLabel(depth, unit)}`, k: 'sub' },
            ]
          : [
              { t: 'BOYLE’S LAW', k: 'title' },
              { t: 'P₁V₁ = P₂V₂', k: 'value' },
              { t: `1.00 L → ${state.neutralVolume.toFixed(2)} L`, k: 'value' },
              { t: `${state.pressure.toFixed(1)} ATA · ${depthLabel(depth, unit)}`, k: 'sub' },
            ])
    : [
        { t: 'GAS USE', k: 'title' },
        { t: `${rate.toFixed(1)}× surface rate`, k: 'value' },
        { t: '1·2·3·4× at 1–4 ATA', k: 'sub' },
        { t: `~${Math.round(gasMinutes)}m left (${Math.round(gasMinutes * rate)}m at top)`, k: 'sub' },
      ];
  const hudHighlight = highlight.has('law') || highlight.has('gas');

  const headerAction = (
    <Pressable accessibilityRole="button" accessibilityLabel="Take the guided tour" onPress={startTour} style={styles.headerAction}>
      <Text style={styles.headerActionText}>TOUR</Text>
    </Pressable>
  );

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Boyle’s Law Lab" onBack={onBack} action={headerAction} />
      <View style={styles.stage} onLayout={(e) => setStage(e.nativeEvent.layout)}>
        {stage.width > 0 ? (
          <BoyleScene
            width={stage.width}
            height={sceneHeight}
            depth={depth}
            onDepth={(d) => { setDepth(d); bumpTourActivity(); }}
            mode={mode}
            volume={state.volume}
            over={over}
            burst={burst}
            tankPercent={tankPercent}
            breathId={breathId}
            unit={unit}
            hudLines={hudLines}
            hudHighlight={hudHighlight}
            locked={sceneLocked}
          />
        ) : null}

        <View pointerEvents="box-none" style={[styles.bottomStack, { left: 12 + insets.left, right: 12 + insets.right, bottom: insets.bottom + 8 }]}>

          <View style={styles.console} onLayout={(e) => setConsoleHeight(e.nativeEvent.layout.height)}>
            {tourStepData ? (
              <View style={styles.tourRibbon}>
                <View style={styles.tourTopRow}>
                  <View style={styles.tourDots}>{TOUR_STEPS.map((_, i) => <View key={i} style={[styles.tourDot, i === tourStep && styles.tourDotOn]} />)}</View>
                  <Pressable accessibilityRole="button" accessibilityLabel="Skip tour" hitSlop={8} onPress={endTour}><Text style={styles.tourSkip}>✕</Text></Pressable>
                </View>
                <View style={styles.tourTitleRow}>
                  <Pressable accessibilityRole="button" accessibilityLabel="Previous step" disabled={tourStep === 0} hitSlop={6} onPress={tourBack} style={[styles.tourNavBtn, tourStep === 0 && styles.tourNavBtnHidden]}>
                    <Text style={styles.tourNavGlyph}>‹</Text>
                  </Pressable>
                  {tourStepData.kind === 'question' ? <Text style={styles.tourTag} numberOfLines={1}>{tourStepData.tag}</Text> : <Text style={styles.tourTitle} numberOfLines={1}>{tourStepData.title}</Text>}
                  <Pulse active={tourCanAdvance} style={styles.tourNavPulseWrap}>
                    <Pressable accessibilityRole="button" accessibilityLabel={tourStepData.isLast ? 'Finish tour' : 'Next step'} disabled={!tourCanAdvance} hitSlop={6} onPress={tourNext} style={[styles.tourNavBtn, !tourCanAdvance && styles.tourNavBtnDisabled]}>
                      <Text style={[styles.tourNavGlyph, !tourCanAdvance && styles.tourNavGlyphDisabled]}>{tourStepData.isLast ? '✓' : '›'}</Text>
                    </Pressable>
                  </Pulse>
                </View>
                {tourStepData.kind === 'question' ? <Text style={styles.tourQuestionTitle} numberOfLines={1}>{tourStepData.title}</Text> : null}
                <Text style={styles.tourBody} numberOfLines={3}>{tourStepData.body}</Text>
                {tourStepData.kind === 'action' ? (
                  <View style={styles.taskBox}>
                    {taskDone ? (
                      <Text style={styles.taskDoneHead}>✓ {tourStepData.done || 'Done — tap Next.'}</Text>
                    ) : (
                      <>
                        <Text style={styles.taskHead}>▸ {tourStepData.task}</Text>
                        {checklist.length > 1 ? checklist.map((item) => (
                          <View key={item.label} style={styles.taskRow}>
                            <Text style={[styles.taskCheck, item.done && styles.taskCheckDone]}>{item.done ? '✓' : '○'}</Text>
                            <Text style={[styles.taskText, item.done && styles.taskTextDone]}>{item.label}</Text>
                          </View>
                        )) : null}
                      </>
                    )}
                  </View>
                ) : null}
                {tourStepData.kind === 'question' ? (
                  <>
                    <Pulse active={tourAnswer === null} style={styles.tourPulseWrap}>
                      <View style={styles.tourAnswerRow}>
                        {tourStepData.choices.map((choice, i) => {
                          const picked = tourAnswer === i;
                          const showRight = tourAnswer !== null && i === tourStepData.correctIndex;
                          const showWrong = picked && i !== tourStepData.correctIndex;
                          return (
                            <Pressable key={choice} accessibilityRole="button" accessibilityState={{ selected: picked }} disabled={tourAnswer !== null} onPress={() => selectTourAnswer(i)} style={[styles.tourAnswerChip, showRight && styles.tourAnswerRight, showWrong && styles.tourAnswerWrong]}>
                              <Text style={[styles.tourAnswerText, (showRight || showWrong) && styles.tourAnswerTextOn]}>{choice}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </Pulse>
                    {tourAnswer !== null ? (
                      <Text style={styles.tourFeedback}>{tourAnswer === tourStepData.correctIndex ? tourStepData.feedbackRight : tourStepData.feedbackWrong}</Text>
                    ) : null}
                  </>
                ) : null}
              </View>
            ) : null}

            <View style={[styles.readoutRow, (over || burst) && styles.readoutRowDanger]}>
              <View style={styles.readoutCell}><Text style={styles.readoutLabel}>PRESSURE</Text><Text style={styles.readoutValue}>{state.pressure.toFixed(1)} ATA</Text></View>
              <View style={styles.readoutDivider} />
              {mode === 'compression' ? (
                <View style={styles.readoutCell}><Text style={styles.readoutLabel}>GAS SIZE</Text><Text style={[styles.readoutValue, (over || burst) && styles.readoutValueDanger]}>{burst ? 'BURST' : `${state.volume.toFixed(2)}×${over ? '  ⚠' : ''}`}</Text></View>
              ) : (
                <View style={styles.readoutCell}><Text style={styles.readoutLabel}>GAS USE</Text><Text style={styles.readoutValue}>{rate.toFixed(1)}× rate</Text></View>
              )}
              <View style={styles.readoutDivider} />
              {mode === 'compression' ? (
                <View style={styles.readoutCell}><Text style={styles.readoutLabel}>SEALED FILL</Text><Text style={styles.readoutValue}>{burst ? '—' : `${gasAtm.toFixed(2)}×`}</Text></View>
              ) : (
                <View style={styles.readoutCell}><Text style={styles.readoutLabel}>TANK</Text><Text style={[styles.readoutValue, tankPercent <= 20 && styles.readoutValueDanger]}>{Math.round(tankPercent)}%</Text></View>
              )}
            </View>

            <Pulse active={highlight.has('depth')} style={styles.tourPulseWrap}>
              <View style={styles.depthRow}>
                <Pressable accessibilityRole="button" accessibilityLabel="Decrease depth" disabled={!depthEnabled} onPress={() => { setDepth((d) => Math.max(0, d - 1)); bumpTourActivity(); }} style={[styles.stepBtn, !depthEnabled && styles.stepBtnDisabled]}><Text style={styles.stepTxt}>−</Text></Pressable>
                <View style={styles.depthCore}>
                  <View style={styles.depthHeadRow}>
                    <Text style={styles.depthText}>{depthLabel(depth, unit)}</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel="Toggle depth units" onPress={() => setUnit((u) => (u === 'ft' ? 'm' : 'ft'))} style={styles.unitChip}><Text style={styles.unitChipText}>{unit}</Text></Pressable>
                  </View>
                  <Slider accessibilityLabel="Depth" disabled={!depthEnabled} minimumValue={0} maximumValue={MAX_DEPTH} step={0.1} value={depth} onValueChange={(d) => { setDepth(d); bumpTourActivity(); }} minimumTrackTintColor={colors.cyan} maximumTrackTintColor="#26465D" thumbTintColor={colors.white} />
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Increase depth" disabled={!depthEnabled} onPress={() => { setDepth((d) => Math.min(MAX_DEPTH, d + 1)); bumpTourActivity(); }} style={[styles.stepBtn, !depthEnabled && styles.stepBtnDisabled]}><Text style={styles.stepTxt}>+</Text></Pressable>
              </View>
            </Pulse>

            {showContext ? (
              <Pulse active={highlight.has('context')} style={styles.tourPulseWrap}>
                <Pressable
                  accessibilityRole="button"
                  disabled={mode === 'breathing' && !burst && tankPercent <= 0}
                  onPress={contextAction}
                  style={[styles.contextBtn, ((sealed && mode === 'compression') || burst) && styles.contextBtnAlt, mode === 'breathing' && !burst && tankPercent <= 0 && styles.contextBtnDisabled]}
                >
                  <Text style={styles.contextText}>{contextLabel}</Text>
                </Pressable>
              </Pulse>
            ) : null}

            {showDock ? (
              <Pulse active={highlight.has('mode')} style={styles.tourPulseWrap}>
                <View style={styles.dockRow}>
                  <Dock symbol={mode === 'compression' ? '🫁' : '🎈'} label={mode === 'compression' ? 'Breathing mode' : 'Balloon mode'} onPress={switchMode} />
                  {focus === 'all' ? <Dock symbol="↺" label="Reset" onPress={reset} /> : null}
                </View>
              </Pulse>
            ) : null}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  stage: { flex: 1, backgroundColor: '#031425' },
  headerAction: { alignItems: 'center', justifyContent: 'center', height: 40, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.lineStrong },
  headerActionText: { color: colors.cyan, fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  bottomStack: { position: 'absolute', gap: 8 },
  readoutRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceSoft, borderRadius: 12, borderWidth: 1, borderColor: colors.line, paddingVertical: 7 },
  readoutRowDanger: { borderColor: colors.danger },
  readoutCell: { flex: 1, alignItems: 'center', gap: 2 },
  readoutDivider: { width: 1, height: 22, backgroundColor: colors.line },
  readoutLabel: { color: colors.faint, fontSize: 8.5, fontWeight: '900', letterSpacing: 1 },
  readoutValue: { color: colors.text, fontSize: 13, fontWeight: '800' },
  readoutValueDanger: { color: colors.danger },
  console: { backgroundColor: colors.surfaceGlass, borderRadius: 18, borderWidth: 1, borderColor: colors.line, padding: 10, gap: 8 },
  tourRibbon: { gap: 3, marginBottom: 2, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.line },
  tourTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tourDots: { flexDirection: 'row', gap: 4 },
  tourDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.line },
  tourDotOn: { backgroundColor: colors.cyan },
  tourSkip: { color: colors.faint, fontSize: 13, fontWeight: '700' },
  tourTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tourNavBtn: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSoft, borderWidth: 1, borderColor: colors.line },
  tourNavBtnHidden: { opacity: 0 },
  tourNavBtnDisabled: { opacity: 0.35 },
  tourNavGlyph: { color: colors.cyan, fontSize: 14, fontWeight: '900', marginTop: -1 },
  tourNavGlyphDisabled: { color: colors.muted },
  tourNavPulseWrap: { borderRadius: 13 },
  tourPulseWrap: { borderRadius: 13 },
  tourTitle: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '800', textAlign: 'center' },
  tourTag: { flex: 1, color: colors.cyan, fontSize: 10, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase', textAlign: 'center' },
  tourQuestionTitle: { color: colors.text, fontSize: 13, fontWeight: '800', textAlign: 'center', marginTop: 1 },
  tourBody: { color: colors.muted, fontSize: 11, lineHeight: 15, textAlign: 'center' },
  tourAnswerRow: { flexDirection: 'row', gap: 7, marginTop: 6, justifyContent: 'center' },
  tourAnswerChip: { minHeight: 32, paddingHorizontal: 16, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surfaceSoft },
  tourAnswerRight: { borderColor: colors.good, backgroundColor: '#123B2C' },
  tourAnswerWrong: { borderColor: colors.warning, backgroundColor: '#3B2A12' },
  tourAnswerText: { color: colors.muted, fontSize: 12, fontWeight: '800' },
  tourAnswerTextOn: { color: colors.text },
  tourFeedback: { color: colors.cyan, fontSize: 11, lineHeight: 15, textAlign: 'center', marginTop: 6 },
  taskBox: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.line, gap: 5 },
  taskHead: { color: colors.gold, fontSize: 12, fontWeight: '800', textAlign: 'center' },
  taskRow: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center' },
  taskCheck: { color: colors.faint, fontSize: 13, fontWeight: '900', width: 14, textAlign: 'center' },
  taskCheckDone: { color: colors.good },
  taskText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  taskTextDone: { color: colors.muted, textDecorationLine: 'line-through' },
  taskDoneHead: { color: colors.good, fontSize: 11, lineHeight: 15, fontWeight: '700', textAlign: 'center' },
  depthRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSoft, borderWidth: 1, borderColor: colors.line },
  stepBtnDisabled: { opacity: 0.35 },
  stepTxt: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: -2 },
  depthCore: { flex: 1, gap: 2 },
  depthHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  depthText: { color: colors.text, fontSize: 17, fontWeight: '800' },
  unitChip: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.surfaceSoft, borderWidth: 1, borderColor: colors.line },
  unitChipText: { color: colors.cyan, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  contextBtn: { minHeight: 46, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#16435B', borderWidth: 1, borderColor: colors.cyan },
  contextBtnAlt: { backgroundColor: colors.surfaceSoft, borderColor: colors.line },
  contextBtnDisabled: { opacity: 0.4, borderColor: colors.line },
  contextText: { color: colors.text, fontSize: 14, fontWeight: '800' },
  dockRow: { flexDirection: 'row', gap: 7 },
  dockBtn: { flex: 1, minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 13, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surfaceSoft, paddingVertical: 6, gap: 2 },
  dockBtnOn: { borderColor: colors.cyan, backgroundColor: '#15374A' },
  dockSymbol: { fontSize: 16 },
  dockLabel: { color: colors.muted, fontSize: 10, fontWeight: '700' },
  dockLabelOn: { color: colors.cyan },
  hintGlow: { borderRadius: 14, borderWidth: 2, borderColor: colors.gold },
});
