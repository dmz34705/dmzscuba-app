import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '../components/AppShell';
import GearScene from '../features/gearSetup/GearScene';
import { PARTS, RECAP, gateMet, identifyProgress, visibleSteps } from '../features/gearSetup/model';
import { colors } from '../theme';

const SECTION_NAMES = { 1: 'CYLINDER', 2: 'BCD', 3: 'MOUNT', 4: 'REGULATOR', 5: 'WEIGHTS', 6: 'RECAP' };
const EMPTY_ASM = { valveType: null, bcdOn: false, orientation: null, regOn: false, lpiOn: false, hosesRouted: false, weights: 0, tankOn: false };

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

export default function GearSetupScreen({ onBack }) {
  const insets = useSafeAreaInsets();
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const [consoleHeight, setConsoleHeight] = useState(180);
  const [stepIndex, setStepIndex] = useState(0);
  const [asm, setAsm] = useState(EMPTY_ASM);
  const [choices, setChoices] = useState({});
  const [identified, setIdentified] = useState(new Set());
  const [lastPart, setLastPart] = useState(null);

  const steps = useMemo(() => visibleSteps(choices), [choices]);
  const step = steps[Math.min(stepIndex, steps.length - 1)];
  const idx = Math.min(stepIndex, steps.length - 1);
  const sceneHeight = Math.max(320, stage.height - consoleHeight - insets.bottom - 18);

  const ctx = { asm, choices, identified };
  const done = gateMet(step, ctx);
  const canNext = done;
  const checklist = identifyProgress(step, identified);

  const resetStepState = () => { setIdentified(new Set()); setLastPart(null); };
  const goTo = (i) => {
    if (i < 0 || i >= steps.length) return;
    setStepIndex(i);
    resetStepState();
  };
  const next = () => { if (step.isLast) onBack(); else goTo(idx + 1); };
  const back = () => goTo(idx - 1);
  const restart = () => { setAsm(EMPTY_ASM); setChoices({}); setStepIndex(0); resetStepState(); };

  const onIdentify = (id) => { setIdentified((s) => new Set(s).add(id)); setLastPart(id); };
  const onAssemble = (milestone, value) => setAsm((a) => ({ ...a, [milestone]: value }));

  const pickChoice = (key, value) => {
    setChoices((c) => ({ ...c, [key]: value }));
    setLastPart(null);
  };

  // A right/wrong check step (orientation) advances on its own a beat after the
  // correct pick. Open-ended choices (valve type) wait for a manual Next so the
  // student can read the note.
  useEffect(() => {
    if (step?.kind !== 'choice' || !step.choice.correct) return undefined;
    if (choices[step.choice.key] !== step.choice.correct) return undefined;
    const timer = setTimeout(() => { if (step.isLast) onBack(); else setStepIndex((i) => Math.min(i + 1, steps.length - 1)); }, 2500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, choices[step?.choice?.key]]);

  const chosenValue = step?.kind === 'choice' ? choices[step.choice.key] : null;
  const chosenOption = step?.kind === 'choice' ? step.choice.options.find((o) => o.value === chosenValue) : null;
  const choiceWrong = step?.kind === 'choice' && step.choice.correct && chosenValue != null && chosenValue !== step.choice.correct;

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Build a Scuba Unit" onBack={onBack} action={<Pressable accessibilityRole="button" accessibilityLabel="Start over" onPress={restart} style={styles.headerAction}><Text style={styles.headerActionText}>RESTART</Text></Pressable>} />
      <View style={styles.stage} onLayout={(e) => setStage(e.nativeEvent.layout)}>
        {stage.width > 0 && step ? (
          <GearScene
            width={stage.width}
            height={sceneHeight}
            step={step}
            asm={asm}
            choices={choices}
            identified={identified}
            onIdentify={onIdentify}
            onAssemble={onAssemble}
          />
        ) : null}

        <View pointerEvents="box-none" style={[styles.bottomStack, { left: 12 + insets.left, right: 12 + insets.right, bottom: insets.bottom + 8 }]}>
          <View style={styles.console} onLayout={(e) => setConsoleHeight(e.nativeEvent.layout.height)}>
            <View style={styles.topRow}>
              <Text style={styles.section}>{SECTION_NAMES[step.section]}</Text>
              <View style={styles.dots}>{steps.map((s, i) => <View key={s.id} style={[styles.dot, i === idx && styles.dotOn, i < idx && styles.dotDone]} />)}</View>
              <Text style={styles.count}>{idx + 1}/{steps.length}</Text>
            </View>

            <View style={styles.titleRow}>
              <Pressable accessibilityRole="button" accessibilityLabel="Previous step" disabled={idx === 0} hitSlop={6} onPress={back} style={[styles.navBtn, idx === 0 && styles.navBtnHidden]}>
                <Text style={styles.navGlyph}>‹</Text>
              </Pressable>
              <Text style={styles.title} numberOfLines={1}>{step.title}</Text>
              <Pulse active={canNext} style={styles.navPulseWrap}>
                <Pressable accessibilityRole="button" accessibilityLabel={step.isLast ? 'Finish' : 'Next step'} disabled={!canNext} hitSlop={6} onPress={next} style={[styles.navBtn, !canNext && styles.navBtnDisabled]}>
                  <Text style={[styles.navGlyph, !canNext && styles.navGlyphOff]}>{step.isLast ? '✓' : '›'}</Text>
                </Pressable>
              </Pulse>
            </View>

            <Text style={styles.body} numberOfLines={3}>{step.body}</Text>

            <ScrollView style={styles.detailScroll} showsVerticalScrollIndicator={false}>
              {/* identify: checklist + tapped-part blurb */}
              {step.kind === 'identify' ? (
                <>
                  <View style={styles.checklist}>
                    {checklist.map((it) => (
                      <View key={it.id} style={styles.checkRow}>
                        <Text style={[styles.checkMark, it.done && styles.checkMarkDone]}>{it.done ? '✓' : '○'}</Text>
                        <Text style={[styles.checkText, it.done && styles.checkTextDone]}>{it.label}</Text>
                      </View>
                    ))}
                  </View>
                  {lastPart ? (
                    <Text style={styles.blurb}><Text style={styles.blurbName}>{PARTS[lastPart].name}. </Text>{PARTS[lastPart].blurb}</Text>
                  ) : (
                    <Text style={styles.hint}>Tap the glowing markers on the diagram.</Text>
                  )}
                </>
              ) : null}

              {/* choice */}
              {step.kind === 'choice' ? (
                <>
                  <Pulse active={chosenValue == null} style={styles.choicePulse}>
                    <View style={styles.choiceRow}>
                      {step.choice.options.map((o) => {
                        const picked = chosenValue === o.value;
                        const right = picked && (!step.choice.correct || o.value === step.choice.correct);
                        const wrong = picked && step.choice.correct && o.value !== step.choice.correct;
                        return (
                          <Pressable key={o.value} accessibilityRole="button" accessibilityState={{ selected: picked }} onPress={() => pickChoice(step.choice.key, o.value)} style={[styles.choiceChip, right && styles.choiceRight, wrong && styles.choiceWrong]}>
                            <Text style={[styles.choiceText, (right || wrong) && styles.choiceTextOn]}>{o.label}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </Pulse>
                  {choiceWrong ? (
                    <Text style={styles.feedbackBad}>{step.choice.feedbackWrong}</Text>
                  ) : chosenOption ? (
                    <Text style={styles.feedbackOk}>{step.choice.feedbackRight || chosenOption.note}</Text>
                  ) : null}
                </>
              ) : null}

              {/* assemble */}
              {step.kind === 'assemble' ? (
                <View style={styles.taskBox}>
                  {done
                    ? <Text style={styles.taskDoneHead}>✓ {step.done || 'Done — tap Next.'}</Text>
                    : <Text style={styles.taskHead}>▸ {step.task}{step.drag.need ? `  (${asm[step.drag.milestone] || 0}/${step.drag.need})` : ''}</Text>}
                </View>
              ) : null}

              {/* recap */}
              {step.kind === 'recap' ? (
                <View style={styles.recap}>
                  {RECAP.map((line, i) => (
                    <View key={line} style={styles.recapRow}>
                      <Text style={styles.recapNum}>{i + 1}</Text>
                      <Text style={styles.recapText}>{line}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  stage: { flex: 1, backgroundColor: '#04121C' },
  headerAction: { alignItems: 'center', justifyContent: 'center', height: 40, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.lineStrong },
  headerActionText: { color: colors.cyan, fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  bottomStack: { position: 'absolute', gap: 8 },
  console: { backgroundColor: colors.surfaceGlass, borderRadius: 18, borderWidth: 1, borderColor: colors.line, padding: 12, gap: 6 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  section: { color: colors.cyan, fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  dots: { flexDirection: 'row', gap: 3, flex: 1, justifyContent: 'center', flexWrap: 'wrap' },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.line },
  dotOn: { backgroundColor: colors.cyan },
  dotDone: { backgroundColor: colors.good },
  count: { color: colors.faint, fontSize: 10, fontWeight: '800' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  navBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSoft, borderWidth: 1, borderColor: colors.line },
  navBtnHidden: { opacity: 0 },
  navBtnDisabled: { opacity: 0.35 },
  navGlyph: { color: colors.cyan, fontSize: 16, fontWeight: '900', marginTop: -1 },
  navGlyphOff: { color: colors.muted },
  navPulseWrap: { borderRadius: 14 },
  title: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  body: { color: colors.muted, fontSize: 12, lineHeight: 16, textAlign: 'center' },
  detailScroll: { flexGrow: 0, maxHeight: 168 },
  checklist: { gap: 4, marginTop: 6, alignItems: 'center' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkMark: { color: colors.faint, fontSize: 12, fontWeight: '900', width: 12, textAlign: 'center' },
  checkMarkDone: { color: colors.good },
  checkText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  checkTextDone: { color: colors.muted },
  blurb: { color: colors.text, fontSize: 11.5, lineHeight: 16, textAlign: 'center', marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.line },
  blurbName: { color: colors.cyan, fontWeight: '800' },
  hint: { color: colors.faint, fontSize: 11, textAlign: 'center', marginTop: 8, fontStyle: 'italic' },
  choicePulse: { borderRadius: 12, marginTop: 8 },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, justifyContent: 'center' },
  choiceChip: { minHeight: 34, paddingHorizontal: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surfaceSoft },
  choiceRight: { borderColor: colors.good, backgroundColor: '#123B2C' },
  choiceWrong: { borderColor: colors.danger, backgroundColor: '#3B1A1A' },
  choiceText: { color: colors.muted, fontSize: 12, fontWeight: '800' },
  choiceTextOn: { color: colors.text },
  feedbackOk: { color: colors.cyan, fontSize: 11, lineHeight: 15, textAlign: 'center', marginTop: 8 },
  feedbackBad: { color: colors.danger, fontSize: 11, lineHeight: 15, textAlign: 'center', marginTop: 8 },
  taskBox: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.line },
  taskHead: { color: colors.gold, fontSize: 12, fontWeight: '800', textAlign: 'center' },
  taskDoneHead: { color: colors.good, fontSize: 11, lineHeight: 15, fontWeight: '700', textAlign: 'center' },
  recap: { gap: 7, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.line },
  recapRow: { flexDirection: 'row', gap: 9, alignItems: 'flex-start' },
  recapNum: { color: colors.cyan, fontSize: 11, fontWeight: '900', width: 14, textAlign: 'center', marginTop: 1 },
  recapText: { color: colors.text, fontSize: 12, lineHeight: 16, flex: 1 },
  hintGlow: { borderRadius: 16, borderWidth: 2, borderColor: colors.gold },
});
