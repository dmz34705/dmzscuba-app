import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '../components/AppShell';
import CompassRose from '../features/compassNav/CompassRose';
import useCompassHeading from '../features/compassNav/useCompassHeading';
import {
  HOLD_ON_COURSE_DEG, RECAP, SECTION_NAMES, angularDiff, bezelAim, bezelCourse,
  buildLessonSteps, gateMet, generatePracticeHeadings, holdBearing, legBearing,
  paceAllowed, stepHeading, turnTo, visibleSteps,
} from '../features/compassNav/model';
import { colors } from '../theme';

const OBSERVE_DEG = 25; // how far you must turn / spin the dial to "get it"

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

export default function CompassNavScreen({ onBack }) {
  const insets = useSafeAreaInsets();
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const [consoleHeight, setConsoleHeight] = useState(200);
  const [manual, setManual] = useState(false);
  const compass = useCompassHeading({ manual });

  const [lessonMode, setLessonMode] = useState('guided');
  const [practiceHeadings, setPracticeHeadings] = useState(() => generatePracticeHeadings());
  const [stepIndex, setStepIndex] = useState(0);
  const [bezel, setBezel] = useState(0);
  const [headings, setHeadings] = useState({});
  const [observed, setObserved] = useState({});
  const [paces, setPaces] = useState({});

  const steps = useMemo(
    () => visibleSteps({ steps: buildLessonSteps(practiceHeadings) }),
    [practiceHeadings],
  );
  const idx = Math.min(stepIndex, steps.length - 1);
  const step = steps[idx];

  // A phone with no magnetometer (or the iOS Simulator) — offer manual mode.
  const noCompass = !manual && !compass.available.heading;

  const ctx = { heading: compass.heading, bezel, tilt: compass.tilt, paces, headings, observed };
  const targetHeading = stepHeading(step, ctx);
  const activeBearing = legBearing(step, ctx) ?? targetHeading;
  const done = gateMet(step, ctx);

  // learn steps: mark observed once the diver has turned / spun the dial enough
  const stepStart = useRef({ id: null, heading: 0, bezel: 0 });
  useEffect(() => {
    stepStart.current = { id: step.id, heading: compass.heading, bezel };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id]);
  useEffect(() => {
    if (lessonMode !== 'guided' || step.kind !== 'learn' || observed[step.id]) return;
    const s = stepStart.current;
    if (s.id !== step.id) return;
    const moved = step.observe === 'bezel'
      ? angularDiff(bezel, s.bezel) > OBSERVE_DEG
      : angularDiff(compass.heading, s.heading) > OBSERVE_DEG;
    if (moved) setObserved((o) => ({ ...o, [step.id]: true }));
  }, [compass.heading, bezel, lessonMode, step, observed]);

  // Alignment tasks auto-advance a beat after the physical relationship is right.
  useEffect(() => {
    const autoKinds = ['bezel', 'align', 'reciprocalBezel'];
    if (lessonMode === 'guided' && autoKinds.includes(step.kind) && done && !step.isLast) {
      const t = setTimeout(() => setStepIndex((i) => Math.min(i + 1, steps.length - 1)), 1400);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [lessonMode, step, done, steps.length]);

  const goTo = (i) => { if (i >= 0 && i < steps.length) setStepIndex(i); };
  const next = () => { if (step.isLast) onBack(); else goTo(idx + 1); };
  const back = () => goTo(idx - 1);
  const restart = () => {
    setPracticeHeadings(generatePracticeHeadings());
    setStepIndex(0); setBezel(0); setHeadings({}); setObserved({}); setPaces({});
    if (manual) { compass.setManualHeading(0); compass.setManualTilt(0); }
  };

  const lockHeading = () => {
    if (!step.courseKey) return;
    setHeadings((current) => ({ ...current, [step.courseKey]: compass.heading }));
  };

  // during a hold step, how far off the heading the diver is drifting
  const holdWant = holdBearing(step, ctx);
  let course = null;
  if (holdWant != null) {
    const t = turnTo(compass.heading, holdWant); // + = turn right to get back on
    course = { deg: Math.abs(Math.round(t)), dir: t >= 0 ? 'right' : 'left', on: Math.abs(t) <= HOLD_ON_COURSE_DEG };
  }
  const addPace = () => {
    if (!paceAllowed(step, ctx)) return; // off course — count doesn't move
    setPaces((p) => ({ ...p, [step.id]: (p[step.id] || 0) + 1 }));
  };

  const roseWrapH = stage.height - 8 - (consoleHeight + insets.bottom + (noCompass ? 56 : 20));
  const roseSize = Math.max(200, Math.min(stage.width - 44, roseWrapH - 52 - (manual ? 42 : 0) - 28));

  // live guidance for the aiming steps
  let guide = null;
  if (step.kind === 'bezel' && targetHeading != null) {
    const want = bezelAim(step, ctx); // where the card's red N shows on screen
    const t = turnTo(want, bezel); // + = bezel is clockwise of the mark -> turn it left (ccw)
    const facing = angularDiff(compass.heading, targetHeading) <= step.tol;
    if (step.requireFacing && !facing) {
      guide = 'Keep the lubber line pointed at your sighted object while setting the bezel.';
    } else {
      guide = Math.abs(t) <= step.tol ? 'Bezel north is on card north.' : `Turn the bezel ${Math.abs(Math.round(t))}° ${t > 0 ? 'left' : 'right'}.`;
    }
  } else if (step.kind === 'align' && activeBearing != null) {
    const t = turnTo(compass.heading, activeBearing);
    const label = String(Math.round(activeBearing)).padStart(3, '0');
    guide = Math.abs(t) <= step.tol
      ? `Card north is inside bezel north — facing ${label}°.`
      : `Turn your body ${Math.abs(Math.round(t))}° ${t > 0 ? 'right' : 'left'} until north meets north.`;
  } else if (step.kind === 'reciprocalBezel' && targetHeading != null) {
    const outboundError = turnTo(compass.heading, targetHeading);
    if (Math.abs(outboundError) > step.tol) {
      guide = `Keep your body on the outbound heading first — turn ${Math.abs(Math.round(outboundError))}° ${outboundError > 0 ? 'right' : 'left'}.`;
    } else {
      const wanted = bezelAim(step, ctx);
      const t = turnTo(wanted, bezel);
      guide = Math.abs(t) <= step.tol
        ? 'Bezel north is on card south. The reciprocal is set—now turn your body.'
        : `Turn only the bezel ${Math.abs(Math.round(t))}° ${t > 0 ? 'left' : 'right'} until bezel N reaches card S.`;
    }
  }

  const canNext = done || step.kind === 'info';

  return (
    <View style={styles.screen}>
      <ScreenHeader
        eyebrow="INTERACTIVE LAB"
        title="Compass Navigation"
        onBack={onBack}
        action={(
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={lessonMode === 'guided' ? 'Explore compass without a lesson' : 'Return to guided lesson'}
            onPress={() => setLessonMode((current) => (current === 'guided' ? 'explore' : 'guided'))}
            style={styles.headerAction}
          >
            <Text style={styles.headerActionText}>{lessonMode === 'guided' ? 'EXPLORE' : 'LESSON'}</Text>
          </Pressable>
        )}
      />
      <View style={styles.stage} onLayout={(e) => setStage(e.nativeEvent.layout)}>
        <View style={[styles.roseWrap, { bottom: consoleHeight + insets.bottom + (noCompass ? 56 : 20) }]} pointerEvents="box-none">
          {stage.width > 0 ? (
            <CompassRose
              size={roseSize}
              heading={compass.heading}
              bezel={bezel}
              targetHeading={lessonMode === 'guided' ? activeBearing : null}
              tilt={compass.tilt}
              tiltVec={compass.tiltVec}
              locked={compass.locked}
              mode={manual ? 'manual' : 'sensor'}
              highlight={lessonMode === 'guided' ? step.highlight || null : null}
              course={lessonMode === 'guided' ? course : null}
              onBezelChange={setBezel}
              onHeadingChange={compass.setManualHeading}
            />
          ) : null}
          <View style={styles.readout}>
            <Text style={styles.readHeading}>{String(Math.round(compass.heading)).padStart(3, '0')}°</Text>
            <Text style={styles.readSub}>
              {lessonMode === 'guided' && activeBearing != null ? `COURSE ${String(Math.round(activeBearing)).padStart(3, '0')}°  ·  ` : ''}
              BEZEL COURSE {String(Math.round(bezelCourse(bezel))).padStart(3, '0')}°
            </Text>
            {lessonMode === 'guided' && course ? (
              <Text style={[styles.courseChip, course.on ? styles.courseOn : styles.courseOff]}>
                {course.on ? '● ON COURSE' : `▲ OFF ${course.deg}°  ·  TURN ${course.dir.toUpperCase()}`}
              </Text>
            ) : null}
          </View>
          {manual ? (
            <View style={styles.tiltRow}>
              <Text style={styles.tiltLabel}>TILT</Text>
              <Slider
                style={styles.tiltSlider}
                minimumValue={0}
                maximumValue={40}
                value={compass.tilt}
                onValueChange={compass.setManualTilt}
                minimumTrackTintColor={compass.locked ? colors.warning : colors.cyan}
                maximumTrackTintColor={colors.line}
                thumbTintColor={compass.locked ? colors.warning : colors.cyan}
              />
              <Text style={[styles.tiltLabel, compass.locked && { color: colors.warning }]}>{Math.round(compass.tilt)}°</Text>
            </View>
          ) : null}
        </View>

        <View pointerEvents="box-none" style={[styles.bottomStack, { left: 12 + insets.left, right: 12 + insets.right, bottom: insets.bottom + 8 }]}>
          {noCompass ? (
            <Pressable accessibilityRole="button" onPress={() => setManual(true)} style={styles.manualBanner}>
              <Text style={styles.manualBannerText}>No compass detected — tap to practice manually</Text>
            </Pressable>
          ) : null}

          <View style={styles.console} onLayout={(e) => setConsoleHeight(e.nativeEvent.layout.height)}>
            {lessonMode === 'explore' ? (
              <>
                <View style={styles.topRow}>
                  <Text style={styles.section}>FREE PRACTICE</Text>
                  <Text style={styles.count}>UNGUIDED</Text>
                </View>
                <Text style={styles.freeTitle}>Explore the compass</Text>
                <Text style={styles.body}>
                  Turn your body—or drag the card in manual mode—and rotate the bezel freely. Watch how the lubber line follows you while the card stays on magnetic north.
                </Text>
                <View style={styles.freeActions}>
                  <Pressable accessibilityRole="button" onPress={() => setBezel(0)} style={styles.freeBtn}>
                    <Text style={styles.freeBtnText}>RESET BEZEL</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" onPress={() => setLessonMode('guided')} style={styles.freeBtn}>
                    <Text style={styles.freeBtnText}>GUIDED LESSON</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <View style={styles.topRow}>
                  <Text style={styles.section}>{SECTION_NAMES[step.section]}</Text>
                  <View style={styles.dots}>{steps.map((s, i) => <View key={s.id} style={[styles.dot, i === idx && styles.dotOn, i < idx && styles.dotDone]} />)}</View>
                  <Pressable accessibilityRole="button" accessibilityLabel="Start lesson over" onPress={restart} hitSlop={6}>
                    <Text style={styles.count}>↻ {idx + 1}/{steps.length}</Text>
                  </Pressable>
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

                <Text style={styles.body}>{step.body}</Text>

                <ScrollView style={styles.detailScroll} showsVerticalScrollIndicator={false}>
                  {step.kind === 'learn' ? (
                    <Text style={[styles.hint, observed[step.id] && styles.hintDone]}>
                      {observed[step.id] ? '✓ Got it — tap Next.' : step.observe === 'bezel' ? 'Drag the bezel around to see it move.' : manual ? 'Drag the compass face to turn.' : 'Turn your body and watch the heading.'}
                    </Text>
                  ) : null}

                  {step.kind === 'capture' ? (
                    <View style={styles.taskBox}>
                      {targetHeading != null ? (
                        <Text style={styles.taskDone}>✓ {step.done} ({String(Math.round(targetHeading)).padStart(3, '0')}°)</Text>
                      ) : (
                        <Pressable accessibilityRole="button" onPress={lockHeading} style={styles.bigBtn}>
                          <Text style={styles.bigBtnText}>LOCK HEADING  {String(Math.round(compass.heading)).padStart(3, '0')}°</Text>
                        </Pressable>
                      )}
                    </View>
                  ) : null}

                  {['bezel', 'align', 'reciprocalBezel'].includes(step.kind) ? (
                    <View style={styles.taskBox}>
                      <Text style={[styles.guide, done && styles.guideDone]}>{guide || 'Take a heading first.'}</Text>
                    </View>
                  ) : null}

                  {step.kind === 'hold' ? (
                    <View style={styles.taskBox}>
                      {course && !course.on && !done ? (
                        <Text style={styles.courseBad}>▲ Off heading — turn {course.dir} {course.deg}° to put card N back inside bezel N</Text>
                      ) : null}
                      <Pressable
                        accessibilityRole="button"
                        onPress={addPace}
                        disabled={Boolean(course && !course.on) || done}
                        style={[styles.bigBtn, done && styles.bigBtnDone, course && !course.on && !done && styles.bigBtnOff]}
                      >
                        <Text style={styles.bigBtnText}>
                          {done ? `✓ ${step.done}` : course && !course.on ? 'BACK ON HEADING TO COUNT' : `+ STEP   ${paces[step.id] || 0} / ${step.paces}`}
                        </Text>
                      </Pressable>
                      {compass.locked ? <Text style={styles.lockNote}>Card is bound — level it out to keep the heading.</Text> : null}
                    </View>
                  ) : null}

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
              </>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  stage: { flex: 1, backgroundColor: '#04121C' },
  roseWrap: { position: 'absolute', top: 8, left: 0, right: 0, alignItems: 'center', justifyContent: 'center', gap: 12 },
  readout: { alignItems: 'center' },
  readHeading: { color: colors.text, fontSize: 30, fontWeight: '900', letterSpacing: 1 },
  readSub: { color: colors.faint, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  courseChip: { marginTop: 5, fontSize: 11, fontWeight: '900', letterSpacing: 1, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  courseOn: { color: colors.good, backgroundColor: 'rgba(112,226,163,0.12)' },
  courseOff: { color: colors.warning, backgroundColor: 'rgba(255,179,106,0.14)' },
  tiltRow: { flexDirection: 'row', alignItems: 'center', gap: 8, width: '80%' },
  tiltLabel: { color: colors.faint, fontSize: 10, fontWeight: '900', letterSpacing: 1, minWidth: 30, textAlign: 'center' },
  tiltSlider: { flex: 1, height: 30 },
  headerAction: { alignItems: 'center', justifyContent: 'center', height: 40, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.lineStrong },
  headerActionText: { color: colors.cyan, fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  bottomStack: { position: 'absolute', gap: 8 },
  manualBanner: { alignSelf: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.surfaceGlass },
  manualBannerText: { color: colors.cyan, fontSize: 11, fontWeight: '800' },
  console: { backgroundColor: colors.surfaceGlass, borderRadius: 18, borderWidth: 1, borderColor: colors.line, padding: 12, gap: 6 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  section: { color: colors.cyan, fontSize: 9, fontWeight: '900', letterSpacing: 1.4 },
  dots: { flexDirection: 'row', gap: 3, flex: 1, justifyContent: 'center', flexWrap: 'wrap' },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.line },
  dotOn: { backgroundColor: colors.cyan },
  dotDone: { backgroundColor: colors.good },
  count: { color: colors.faint, fontSize: 10, fontWeight: '800' },
  freeTitle: { color: colors.text, fontSize: 18, fontWeight: '900', textAlign: 'center', marginTop: 2 },
  freeActions: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 6 },
  freeBtn: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.surfaceSoft },
  freeBtnText: { color: colors.cyan, fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  navBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSoft, borderWidth: 1, borderColor: colors.line },
  navBtnHidden: { opacity: 0 },
  navBtnDisabled: { opacity: 0.35 },
  navGlyph: { color: colors.cyan, fontSize: 16, fontWeight: '900', marginTop: -1 },
  navGlyphOff: { color: colors.muted },
  navPulseWrap: { borderRadius: 14 },
  title: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  body: { color: colors.muted, fontSize: 12, lineHeight: 16, textAlign: 'center' },
  detailScroll: { flexGrow: 0, maxHeight: 150 },
  hint: { color: colors.faint, fontSize: 11.5, textAlign: 'center', marginTop: 8, fontStyle: 'italic' },
  hintDone: { color: colors.good, fontStyle: 'normal', fontWeight: '700' },
  taskBox: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.line, alignItems: 'center', gap: 6 },
  taskDone: { color: colors.good, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  bigBtn: { minWidth: 220, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.cyan, backgroundColor: colors.surfaceSoft },
  bigBtnDone: { borderColor: colors.good, backgroundColor: '#123B2C' },
  bigBtnOff: { borderColor: colors.warning, backgroundColor: '#3A2114', opacity: 0.85 },
  bigBtnText: { color: colors.text, fontSize: 13, fontWeight: '900', letterSpacing: 0.5 },
  courseBad: { color: colors.warning, fontSize: 11.5, fontWeight: '700', lineHeight: 15, textAlign: 'center' },
  guide: { color: colors.gold, fontSize: 12, fontWeight: '800', textAlign: 'center' },
  guideDone: { color: colors.good },
  lockNote: { color: colors.warning, fontSize: 11, textAlign: 'center' },
  recap: { gap: 7, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.line },
  recapRow: { flexDirection: 'row', gap: 9, alignItems: 'flex-start' },
  recapNum: { color: colors.cyan, fontSize: 11, fontWeight: '900', width: 14, textAlign: 'center', marginTop: 1 },
  recapText: { color: colors.text, fontSize: 12, lineHeight: 16, flex: 1 },
  hintGlow: { borderRadius: 16, borderWidth: 2, borderColor: colors.gold },
});
