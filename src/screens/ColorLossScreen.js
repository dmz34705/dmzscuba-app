import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Slider from '@react-native-community/slider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '../components/AppShell';
import CameraLab from '../features/colorLoss/CameraLab';
import ColorScene, { SCENE_BOTTOM_MARGIN, SCENE_TOP, SCENE_W } from '../features/colorLoss/ColorScene';
import { DEFAULT_GEAR, GEAR_LABELS, MAX_DEPTH, PALETTE, SAFETY_GEAR, colorMatrix, spectrum, transformColor } from '../features/colorLoss/model';
import { depthLabel } from '../lib/divePhysics';
import { colors } from '../theme';

const TOUR_SEEN_KEY = 'colorLossTourSeen';

// A short guided walkthrough: "info" steps drive the real controls so
// newcomers see the concept happen instead of reading about it; "question"
// steps pause the flow (Next stays locked) until an answer is picked, so a
// prediction and a couple of checks actually land instead of scrolling past.
// depth is in meters. hintTarget names the control to nudge if idle too long.
const TOUR_STEPS = [
  {
    kind: 'info',
    title: 'Why colors fade underwater',
    body: "The deeper you go, the less a diver's gear looks like it does on land. Let's see why, and what to do about it.",
    depth: 0, clarity: 1, gear: DEFAULT_GEAR, activeGear: 'mask', flashlight: false, panel: null,
    hintTarget: 'next',
  },
  {
    kind: 'question',
    tag: 'Quick guess',
    title: 'Before we dive in',
    body: 'Which color do you think disappears FIRST as a diver swims deeper?',
    choices: ['Red', 'Blue'], correctIndex: 0,
    feedbackRight: 'Good call — red goes first.',
    feedbackWrong: "Actually red goes first — here's why.",
    depth: 0, clarity: 1, flashlight: false, panel: null,
    hintTarget: 'answers',
  },
  {
    kind: 'info',
    title: 'Right at the surface, it’s all real',
    body: 'Near the top, sunlight still has every color in it, so his red mask and yellow fins look completely normal.',
    depth: 0, clarity: 1, flashlight: false, panel: null,
    hintTarget: 'next',
  },
  {
    kind: 'info',
    title: 'This panel changes his gear',
    body: 'Tap Mask, Suit, Tank, or Fins below to pick a part, then tap a color swatch to paint it. We’ll use it to test colors at depth.',
    depth: 0, clarity: 1, activeGear: 'mask', flashlight: false, panel: 'colors',
    hintTarget: 'next',
  },
  {
    kind: 'info',
    title: 'Now watch the red mask',
    body: 'We just sent him down to 82 ft (25 m). Look at the "At depth" swatch below — that bright red has turned almost black.',
    depth: 25, clarity: 1, activeGear: 'mask', flashlight: false, panel: 'colors',
    hintTarget: 'next',
  },
  {
    kind: 'question',
    tag: 'Check yourself',
    title: 'What held up best?',
    body: 'At that same depth, which color do you think is still easiest to see?',
    choices: ['Blue', 'Orange'], correctIndex: 0,
    feedbackRight: 'Exactly — blue (and green) travel the farthest through water.',
    feedbackWrong: 'It’s blue — blue and green travel the farthest through water.',
    depth: 25, clarity: 1, flashlight: false, panel: null,
    hintTarget: 'answers',
  },
  {
    kind: 'info',
    title: 'A dive light undoes it',
    body: 'Flip on a light near him and his true colors come right back. Move the light away and they fade again — its reach is short.',
    depth: 25, clarity: 1, flashlight: true, panel: null,
    hintTarget: 'next',
  },
  {
    kind: 'info',
    title: 'Murky water makes it worse',
    body: 'Sand and tiny particles floating in the water scatter light before it can travel far. Compare Clear against Murky below.',
    depth: 25, clarity: 2.2, flashlight: false, panel: 'water',
    hintTarget: 'next',
  },
  {
    kind: 'question',
    tag: 'Review',
    title: 'Putting it together',
    body: 'You want to see a red object’s true color at 25 m (82 ft). What should you bring?',
    choices: ['A dive light', 'Sunglasses'], correctIndex: 0,
    feedbackRight: 'Right — a light restores the colors depth took away.',
    feedbackWrong: 'A dive light is the answer — it restores the colors depth took away.',
    depth: 25, clarity: 1, flashlight: false, panel: null,
    hintTarget: 'answers',
  },
  {
    kind: 'question',
    tag: 'Review',
    title: 'One more',
    body: 'True or false: murky water makes colors fade FASTER than clear water.',
    choices: ['True', 'False'], correctIndex: 0,
    feedbackRight: 'True! Cloudy water scatters light and speeds up the fade.',
    feedbackWrong: 'Actually true — cloudy water scatters light and speeds up the fade.',
    depth: 25, clarity: 1, flashlight: false, panel: null,
    hintTarget: 'answers',
  },
  {
    kind: 'info',
    title: 'Now it’s your turn',
    body: 'Drag him deeper, pick your own gear colors, flip on the light, or try the live camera below.',
    depth: 10, clarity: 1, flashlight: false, panel: null, isLast: true,
    hintTarget: 'dock',
  },
];

function Chip({ label, selected, onPress }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: Boolean(selected) }} onPress={onPress} style={[styles.chip, selected && styles.chipOn]}><Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text></Pressable>;
}

function Dock({ symbol, label, active, onPress }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: Boolean(active) }} onPress={onPress} style={[styles.dockBtn, active && styles.dockBtnOn]}>
      <Text style={styles.dockSymbol}>{symbol}</Text>
      <Text style={[styles.dockLabel, active && styles.dockLabelOn]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

// A soft pulsing ring around whatever's inside — nudges a student toward the
// next action if they've stalled on a tour step for a few seconds.
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

export default function ColorLossScreen({ onBack, appSettings = {} }) {
  const insets = useSafeAreaInsets();
  const [stage, setStage] = useState({ width: 0, height: 0 });
  // Reserve room for the floating console so the scene's depth range never
  // runs the diver underneath it; measured live so it tracks the console's
  // real height (it grows when the flashlight tool row appears).
  const [consoleHeight, setConsoleHeight] = useState(150);
  const [mode, setMode] = useState('scene');
  const [panel, setPanel] = useState(null);
  const [depth, setDepth] = useState(0);
  const [unit, setUnit] = useState(appSettings.depthUnit === 'm' ? 'm' : 'ft');
  const [clarity, setClarity] = useState(1);
  const [gear, setGear] = useState(DEFAULT_GEAR);
  const [activeGear, setActiveGear] = useState('wetsuit');
  const [flashlight, setFlashlight] = useState(false);
  const [tool, setTool] = useState('diver');
  const [position, setPosition] = useState(0.5);
  const [beam, setBeam] = useState({ x: 180, y: 220 });
  const [tourStep, setTourStep] = useState(null);
  const [tourAnswer, setTourAnswer] = useState(null);
  const [tourIdle, setTourIdle] = useState(false);
  const lastTourActivity = useRef(Date.now());
  const matrix = useMemo(() => colorMatrix(depth, clarity), [depth, clarity]);
  const transmission = spectrum(depth, clarity);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(TOUR_SEEN_KEY).then((seen) => { if (active && !seen) goToTourStep(0); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Nudges (a soft glow on the expected control) kick in after a few quiet
  // seconds on a tour step, so a stuck student has somewhere obvious to look.
  useEffect(() => {
    lastTourActivity.current = Date.now();
    setTourIdle(false);
    if (tourStep === null) return undefined;
    const interval = setInterval(() => {
      if (Date.now() - lastTourActivity.current > 7000) setTourIdle(true);
    }, 1000);
    return () => clearInterval(interval);
  }, [tourStep]);
  const bumpTourActivity = () => { lastTourActivity.current = Date.now(); setTourIdle(false); };

  const reset = () => {
    setDepth(0); setClarity(1); setGear(DEFAULT_GEAR); setPosition(0.5);
    setFlashlight(false); setTool('diver'); setBeam({ x: 180, y: 220 }); setPanel(null);
  };
  const sceneHeight = Math.max(280, stage.height - consoleHeight - insets.bottom - 18);
  const beamNearDiver = (atDepth) => {
    if (!stage.width) return { x: position * SCENE_W, y: SCENE_TOP };
    const sceneH = SCENE_W * (sceneHeight / stage.width);
    const travel = sceneH - SCENE_TOP - SCENE_BOTTOM_MARGIN;
    return { x: position * SCENE_W, y: SCENE_TOP + atDepth / MAX_DEPTH * travel };
  };
  const toggleLight = () => {
    const next = !flashlight;
    setFlashlight(next); setTool(next ? 'light' : 'diver');
    if (next) setBeam(beamNearDiver(depth));
  };
  const switchMode = () => {
    setMode((m) => (m === 'scene' ? 'camera' : 'scene'));
    setPanel(null);
  };
  const togglePanel = (name) => setPanel((current) => (current === name ? null : name));

  const goToTourStep = (index) => {
    const step = TOUR_STEPS[index];
    if (!step) return;
    setTourStep(index);
    setMode('scene');
    setDepth(step.depth);
    setClarity(step.clarity);
    if (step.gear) setGear(step.gear);
    if (step.activeGear) setActiveGear(step.activeGear);
    setPanel(step.panel);
    setFlashlight(step.flashlight);
    setTool(step.flashlight ? 'light' : 'diver');
    if (step.flashlight) setBeam(beamNearDiver(step.depth));
    setTourAnswer(null);
  };
  const startTour = () => goToTourStep(0);
  const endTour = () => { setTourStep(null); AsyncStorage.setItem(TOUR_SEEN_KEY, '1'); };
  const tourStepData = tourStep === null ? null : TOUR_STEPS[tourStep];
  const tourCanAdvance = !tourStepData || tourStepData.kind !== 'question' || tourAnswer !== null;
  const selectTourAnswer = (index) => { setTourAnswer(index); bumpTourActivity(); };
  const tourNext = () => { bumpTourActivity(); if (tourStepData?.isLast) endTour(); else goToTourStep(tourStep + 1); };
  const tourBack = () => { bumpTourActivity(); goToTourStep(tourStep - 1); };

  const tip = mode === 'camera'
    ? 'Move the depth slider to preview color loss on real objects.'
    : tool === 'light' && flashlight
    ? 'Drag anywhere to aim the light at the diver, fish, or coral.'
    : 'Drag the diver to move sideways and deeper.';
  const scienceLine = mode === 'scene' && flashlight
    ? 'A nearby light supplies wavelengths sunlight already lost on the way down. Its reach is limited.'
    : depth < 5
    ? 'Near the surface, most colors are still present.'
    : depth < 20
    ? 'Red fades fastest; orange and pink shift too, even in clear water.'
    : 'The remaining daylight here is mostly blue-green.';

  const headerAction = (
    <Pressable accessibilityRole="button" accessibilityLabel="Take the guided tour" onPress={startTour} style={styles.headerAction}>
      <Text style={styles.headerActionText}>TOUR</Text>
    </Pressable>
  );

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Color Loss Lab" onBack={onBack} action={headerAction} />
      <View style={styles.stage} onLayout={(e) => setStage(e.nativeEvent.layout)}>
        {stage.width > 0 ? (
          mode === 'scene' ? (
            <ColorScene width={stage.width} height={sceneHeight} depth={depth} onDepth={setDepth} gear={gear} clarity={clarity} flashlight={flashlight} tool={tool} position={position} onPosition={setPosition} beam={beam} onBeam={setBeam} unit={unit} onInteracting={() => {}} locked={tourStepData?.kind === 'question'} />
          ) : <CameraLab width={stage.width} height={sceneHeight} depth={depth} clarity={clarity} />
        ) : null}

        <View pointerEvents="none" style={styles.tipWrap}>
          <View style={styles.tipBar}><Text style={styles.tipText} numberOfLines={2}>{tip}</Text></View>
        </View>

        <View pointerEvents="box-none" style={[styles.bottomStack, { left: 12 + insets.left, right: 12 + insets.right, bottom: insets.bottom + 8 }]}>
          {panel ? (
            <View style={styles.floatPanel}>
              <View style={styles.panelHead}>
                <Text style={styles.panelTitle}>{panel === 'colors' ? 'Gear colors' : 'Water & light'}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Close panel" onPress={() => setPanel(null)} style={styles.closeBtn}><Text style={styles.closeTxt}>×</Text></Pressable>
              </View>
              <ScrollView style={styles.panelScroll} showsVerticalScrollIndicator={false}>
                {panel === 'colors' ? (
                  <>
                    <View style={styles.row}>{Object.entries(GEAR_LABELS).map(([key, label]) => <Chip key={key} label={label} selected={key === activeGear} onPress={() => setActiveGear(key)} />)}</View>
                    <View style={styles.palette}>{PALETTE.map((color) => <Pressable key={color} accessibilityRole="button" accessibilityLabel={`Set ${GEAR_LABELS[activeGear]} to ${color}`} accessibilityState={{ selected: gear[activeGear] === color }} onPress={() => setGear((current) => ({ ...current, [activeGear]: color }))} style={[styles.swatch, { backgroundColor: color }, gear[activeGear] === color && styles.swatchOn]} />)}</View>
                    <View style={styles.comparison}>
                      <View style={[styles.colorSample, { backgroundColor: gear[activeGear] }]} /><Text style={styles.body}>Surface</Text><Text style={styles.body}>→</Text>
                      <View style={[styles.colorSample, { backgroundColor: transformColor(gear[activeGear], matrix) }]} /><Text style={styles.body}>At depth</Text>
                    </View>
                    <Chip label="Apply safety colors" onPress={() => setGear(SAFETY_GEAR)} />
                  </>
                ) : (
                  <>
                    <Text style={styles.body}>{scienceLine}</Text>
                    <View style={styles.row}>{[[0.6, 'Very clear'], [1, 'Clear'], [2.2, 'Murky']].map(([value, label]) => <Chip key={value} label={label} selected={clarity === value} onPress={() => setClarity(value)} />)}</View>
                    <Text style={styles.label}>RELATIVE LIGHT REMAINING</Text>
                    {['Red', 'Green', 'Blue'].map((name, i) => <View key={name} style={styles.spectrumRow}><Text style={styles.spectrumName}>{name}</Text><View style={styles.track}><View style={{ width: `${transmission[i] * 100}%`, height: 6, backgroundColor: ['#FF7768', '#76D99F', '#74AEFF'][i] }} /></View><Text style={styles.body}>{Math.round(transmission[i] * 100)}%</Text></View>)}
                    <Text style={styles.small}>A teaching model, not a prediction: these clear-water RGB curves illustrate selective absorption and haze. Real appearance also depends on light spectrum, material, distance, and a camera's exposure and white balance.</Text>
                  </>
                )}
              </ScrollView>
            </View>
          ) : null}

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
                  <Pulse active={tourIdle && tourStepData.hintTarget === 'next' && tourCanAdvance} style={styles.tourNavPulseWrap}>
                    <Pressable accessibilityRole="button" accessibilityLabel={tourStepData.isLast ? 'Finish tour' : 'Next step'} disabled={!tourCanAdvance} hitSlop={6} onPress={tourNext} style={[styles.tourNavBtn, !tourCanAdvance && styles.tourNavBtnDisabled]}>
                      <Text style={[styles.tourNavGlyph, !tourCanAdvance && styles.tourNavGlyphDisabled]}>{tourStepData.isLast ? '✓' : '›'}</Text>
                    </Pressable>
                  </Pulse>
                </View>
                {tourStepData.kind === 'question' ? <Text style={styles.tourQuestionTitle} numberOfLines={1}>{tourStepData.title}</Text> : null}
                <Text style={styles.tourBody} numberOfLines={2}>{tourStepData.body}</Text>
                {tourStepData.kind === 'question' ? (
                  <>
                    <Pulse active={tourIdle && tourAnswer === null} style={styles.tourPulseWrap}>
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
            <View style={styles.depthRow}>
              <Pressable accessibilityRole="button" accessibilityLabel="Decrease depth" disabled={tourStepData?.kind === 'question'} onPress={() => setDepth((d) => Math.max(0, d - 1))} style={[styles.stepBtn, tourStepData?.kind === 'question' && styles.stepBtnDisabled]}><Text style={styles.stepTxt}>−</Text></Pressable>
              <View style={styles.depthCore}>
                <View style={styles.depthHeadRow}>
                  <Text style={styles.depthText}>{depthLabel(depth, unit)}</Text>
                  <Pressable accessibilityRole="button" accessibilityLabel="Toggle depth units" onPress={() => setUnit((u) => (u === 'ft' ? 'm' : 'ft'))} style={styles.unitChip}><Text style={styles.unitChipText}>{unit}</Text></Pressable>
                </View>
                <Slider accessibilityLabel="Simulated depth" disabled={tourStepData?.kind === 'question'} minimumValue={0} maximumValue={MAX_DEPTH} step={0.1} value={depth} onValueChange={setDepth} minimumTrackTintColor={colors.cyan} maximumTrackTintColor="#26465D" thumbTintColor={colors.white} />
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Increase depth" disabled={tourStepData?.kind === 'question'} onPress={() => setDepth((d) => Math.min(MAX_DEPTH, d + 1))} style={[styles.stepBtn, tourStepData?.kind === 'question' && styles.stepBtnDisabled]}><Text style={styles.stepTxt}>+</Text></Pressable>
            </View>
            {(!tourStepData || tourStepData.isLast) && mode === 'scene' && flashlight ? (
              <View style={styles.toolRow}>
                <Chip label="Move diver" selected={tool === 'diver'} onPress={() => setTool('diver')} />
                <Chip label="Aim light" selected={tool === 'light'} onPress={() => setTool('light')} />
              </View>
            ) : null}
            {!tourStepData || tourStepData.isLast ? (
              <Pulse active={tourIdle && tourStepData?.hintTarget === 'dock'} style={styles.tourPulseWrap}>
                <View style={styles.dockRow}>
                  <Dock symbol={mode === 'scene' ? '📷' : '🐠'} label={mode === 'scene' ? 'Camera' : 'Reef'} onPress={switchMode} />
                  {mode === 'scene' ? <Dock symbol="🔦" label={flashlight ? 'Light on' : 'Light off'} active={flashlight} onPress={toggleLight} /> : null}
                  {mode === 'scene' ? <Dock symbol="🎨" label="Colors" active={panel === 'colors'} onPress={() => togglePanel('colors')} /> : null}
                  <Dock symbol="💧" label="Water" active={panel === 'water'} onPress={() => togglePanel('water')} />
                  <Dock symbol="↺" label="Reset" onPress={reset} />
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
  tipWrap: { position: 'absolute', top: 10, left: 12, right: 12, alignItems: 'center' },
  tipBar: { backgroundColor: colors.surfaceGlass, borderRadius: 12, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12, paddingVertical: 8, maxWidth: 420 },
  tipText: { color: colors.text, fontSize: 12, lineHeight: 17, textAlign: 'center' },
  headerAction: { alignItems: 'center', justifyContent: 'center', height: 40, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.lineStrong },
  headerActionText: { color: colors.cyan, fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  // Compact guided-tour strip, folded into the top of the console instead of
  // a separate floating card — no extra chrome beyond what's already there.
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
  bottomStack: { position: 'absolute', gap: 8 },
  console: { backgroundColor: colors.surfaceGlass, borderRadius: 18, borderWidth: 1, borderColor: colors.line, padding: 10, gap: 8 },
  depthRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBtn: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSoft, borderWidth: 1, borderColor: colors.line },
  stepBtnDisabled: { opacity: 0.35 },
  stepTxt: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: -2 },
  depthCore: { flex: 1, gap: 2 },
  depthHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  depthText: { color: colors.text, fontSize: 17, fontWeight: '800' },
  unitChip: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.surfaceSoft, borderWidth: 1, borderColor: colors.line },
  unitChipText: { color: colors.cyan, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  toolRow: { flexDirection: 'row', gap: 7 },
  dockRow: { flexDirection: 'row', gap: 7 },
  dockBtn: { flex: 1, minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 13, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surfaceSoft, paddingVertical: 6, gap: 2 },
  dockBtnOn: { borderColor: colors.cyan, backgroundColor: '#15374A' },
  dockSymbol: { fontSize: 16 },
  dockLabel: { color: colors.muted, fontSize: 10, fontWeight: '700' },
  dockLabelOn: { color: colors.cyan },
  hintGlow: { borderRadius: 14, borderWidth: 2, borderColor: colors.gold },
  floatPanel: { backgroundColor: colors.surfaceGlass, borderRadius: 18, borderWidth: 1, borderColor: colors.line, padding: 12, maxHeight: 300 },
  panelScroll: { flexGrow: 0 },
  panelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  panelTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  closeBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSoft },
  closeTxt: { color: colors.muted, fontSize: 18, lineHeight: 18, marginTop: -2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 10 },
  chip: { minHeight: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 11, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: 10, paddingVertical: 8 },
  chipOn: { borderColor: colors.cyan, backgroundColor: '#15374A' },
  chipText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  chipTextOn: { color: colors.cyan },
  label: { color: colors.cyan, fontSize: 10, letterSpacing: 1.3, fontWeight: '800', marginBottom: 8 },
  body: { color: colors.muted, fontSize: 12, lineHeight: 18, marginBottom: 10 },
  small: { color: colors.faint, fontSize: 10.5, lineHeight: 15, marginTop: 4 },
  palette: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  swatch: { width: 38, height: 38, borderRadius: 12, borderWidth: 2, borderColor: '#FFFFFF20' },
  swatchOn: { borderColor: colors.white, borderWidth: 3 },
  comparison: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7, marginBottom: 12 },
  colorSample: { width: 22, height: 22, borderRadius: 7, borderColor: '#FFFFFF30', borderWidth: 1 },
  spectrumRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  spectrumName: { color: colors.muted, fontSize: 12, width: 40 },
  track: { flex: 1, height: 6, backgroundColor: '#284155', borderRadius: 3, overflow: 'hidden' },
});
