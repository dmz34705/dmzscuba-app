import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader, SectionLabel } from '../components/AppShell';
import { BalloonGraphic, BubbleField, DiverGraphic, WaveLine } from '../components/DiveIllustrations';
import { Card, PrimaryButton, ProgressBar, SecondaryButton, Stat } from '../components/Ui';
import { boylesState, clamp, depthLabel } from '../lib/divePhysics';
import { colors, radii, shadow, spacing } from '../theme';

const MAX_DEPTH = 30;
const DIVER_GEAR = { mask: '#00D68F', wetsuit: '#E24A36', tank: '#8F7BFF', fins: '#F4EA24' };

function ModeButton({ title, body, selected, onPress }) {
  return (
    <Pressable accessibilityRole="tab" accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => [styles.modeButton, selected && styles.modeButtonActive, pressed && styles.pressed]}>
      <Text style={[styles.modeTitle, selected && styles.modeTitleActive]}>{title}</Text>
      <Text style={styles.modeBody}>{body}</Text>
    </Pressable>
  );
}

export default function BoylesLawScreen({ onBack }) {
  const insets = useSafeAreaInsets();
  const [depth, setDepth] = useState(0);
  const [unit, setUnit] = useState('m');
  const [mode, setMode] = useState('compression');
  const [gasSurfaceEquivalent, setGasSurfaceEquivalent] = useState(1);
  const [tankPercent, setTankPercent] = useState(100);

  const state = useMemo(() => boylesState(depth, gasSurfaceEquivalent), [depth, gasSurfaceEquivalent]);
  const isOverexpanded = mode === 'compression' && state.overExpansion > 0.001;
  const sceneObjectTop = 46 + (depth / MAX_DEPTH) * 160;
  const balloonSize = clamp(104 * Math.sqrt(state.currentVolume), 48, 174);

  const setModeAndReset = (nextMode) => {
    setMode(nextMode);
    setGasSurfaceEquivalent(1);
    setTankPercent(100);
  };

  const reset = () => {
    setDepth(0);
    setGasSurfaceEquivalent(1);
    setTankPercent(100);
  };

  const inflateHere = () => setGasSurfaceEquivalent(state.pressure);
  const takeBreath = () => setTankPercent((value) => clamp(value - 2.5 * state.pressure, 0, 100));

  const coachText = mode === 'breathing'
    ? `At ${state.pressure.toFixed(1)} ATA, the same breathing pattern uses about ${state.pressure.toFixed(1)}× the surface gas rate. Check your pressure often and adjust the plan early.`
    : isOverexpanded
      ? `The trapped gas is now ${(state.currentVolume).toFixed(2)}× its normal surface size. Never hold your breath during ascent; keep breathing and ascend slowly.`
      : gasSurfaceEquivalent > 1
        ? `The balloon was filled at depth. Ascend to watch the trapped gas expand as ambient pressure decreases.`
        : depth < 5
          ? 'The largest relative pressure change happens near the surface. Even a short ascent can produce meaningful gas expansion.'
          : `At ${depthLabel(depth, unit)}, pressure is ${state.pressure.toFixed(1)} ATA and a flexible gas space is about ${state.normalVolume.toFixed(2)}× its surface volume.`;

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Boyle’s Law Lab" onBack={onBack} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.intro}>
          <SectionLabel>DMZ SCUBA TRAINING</SectionLabel>
          <Text style={styles.title}>Pressure changes everything.</Text>
          <Text style={styles.subtitle}>Descend to compress a flexible gas space, inflate it at depth, or switch modes to compare breathing-gas use.</Text>
        </View>

        <View accessibilityRole="tablist" style={styles.modeRow}>
          <ModeButton body="See gas shrink and expand" onPress={() => setModeAndReset('compression')} selected={mode === 'compression'} title="Compression" />
          <ModeButton body="Compare tank use by depth" onPress={() => setModeAndReset('breathing')} selected={mode === 'breathing'} title="Breathing" />
        </View>

        <View style={styles.statsRow}>
          <Stat accent={colors.cyan} label="Pressure" value={`${state.pressure.toFixed(1)} ATA`} style={styles.stat} />
          <Stat label={mode === 'compression' ? 'Gas size now' : 'Gas-use rate'} value={`${(mode === 'compression' ? state.currentVolume : state.pressure).toFixed(2)}×`} style={styles.stat} />
        </View>

        <View style={[styles.sceneShell, isOverexpanded && styles.sceneShellDanger]}>
          <LinearGradient colors={['#8BC9E7', '#126E9E', '#062A49']} locations={[0, 0.42, 1]} style={styles.scene}>
            <BubbleField />
            <View style={styles.surfaceLine}><WaveLine /></View>
            <View style={styles.sceneHud}>
              <Text style={styles.sceneHudDepth}>{depthLabel(depth, unit)}</Text>
              <Text style={[styles.sceneHudMode, isOverexpanded && { color: colors.danger }]}>{isOverexpanded ? 'OVEREXPANSION' : mode === 'compression' ? 'COMPRESSION MODE' : 'BREATHING MODE'}</Text>
            </View>
            {mode === 'compression' ? (
              <View style={[styles.balloonWrap, { top: sceneObjectTop, height: balloonSize * 1.42, width: balloonSize, marginLeft: -balloonSize / 2 }]}>
                <BalloonGraphic color="#2F8BFF" overexpanded={isOverexpanded} size={balloonSize} />
              </View>
            ) : (
              <View style={[styles.diverWrap, { top: sceneObjectTop + 15 }]}>
                <DiverGraphic colors={DIVER_GEAR} width={185} />
                <View style={styles.tankBadge}>
                  <Text style={styles.tankBadgeLabel}>TANK</Text>
                  <Text style={[styles.tankBadgeValue, tankPercent <= 20 && { color: colors.danger }]}>{Math.round(tankPercent)}%</Text>
                </View>
              </View>
            )}
            <View style={styles.depthRuler}>
              {[0, 10, 20, 30].map((mark) => (
                <View key={mark} style={[styles.rulerMark, { top: 21 + (mark / MAX_DEPTH) * 256 }]}>
                  <View style={styles.rulerLine} />
                  <Text style={styles.rulerText}>{unit === 'ft' ? Math.round(mark * 3.28084) : mark}</Text>
                </View>
              ))}
            </View>
            {mode === 'breathing' && (
              <View style={styles.tankBarWrap}>
                <ProgressBar color={tankPercent <= 20 ? colors.danger : colors.good} value={tankPercent / 100} />
              </View>
            )}
          </LinearGradient>
        </View>

        <Card style={styles.controlsCard}>
          <View style={styles.controlHead}>
            <View>
              <Text style={styles.cardTitle}>Depth control</Text>
              <Text style={styles.depthValue}>{depthLabel(depth, unit)}</Text>
            </View>
            <View style={styles.unitRow}>
              <SecondaryButton label="m" onPress={() => setUnit('m')} selected={unit === 'm'} style={styles.unitButton} />
              <SecondaryButton label="ft" onPress={() => setUnit('ft')} selected={unit === 'ft'} style={styles.unitButton} />
            </View>
          </View>
          <Slider accessibilityLabel="Depth" maximumTrackTintColor="rgba(255,255,255,0.16)" maximumValue={MAX_DEPTH} minimumTrackTintColor={colors.cyan} minimumValue={0} onValueChange={setDepth} step={1} thumbTintColor={colors.white} value={depth} />
          <View style={styles.presetRow}>
            {[0, 10, 20, 30].map((value) => <SecondaryButton key={value} label={unit === 'ft' ? `${Math.round(value * 3.28084)} ft` : `${value} m`} onPress={() => setDepth(value)} selected={depth === value} style={styles.presetButton} />)}
          </View>
        </Card>

        {mode === 'compression' ? (
          <Card style={styles.actionCard}>
            <Text style={styles.cardTitle}>Balloon setup</Text>
            <Text style={styles.cardHelper}>“Fully inflate” adds enough gas at the current depth to make the balloon full-sized there. Then ascend without releasing that gas.</Text>
            <PrimaryButton label="Fully inflate here" onPress={inflateHere} style={styles.primaryAction} />
            <SecondaryButton label="Reset dive cycle" onPress={reset} />
          </Card>
        ) : (
          <Card style={styles.actionCard}>
            <View style={styles.controlHead}>
              <View>
                <Text style={styles.cardTitle}>Breathing-gas simulator</Text>
                <Text style={styles.cardHelper}>Each tap represents the same breathing pattern.</Text>
              </View>
              <Text style={[styles.tankReadout, tankPercent <= 20 && { color: colors.danger }]}>{Math.round(tankPercent)}%</Text>
            </View>
            <PrimaryButton disabled={tankPercent <= 0} label={tankPercent <= 0 ? 'Tank empty' : 'Take a breath'} onPress={takeBreath} style={styles.primaryAction} />
            <SecondaryButton label="Reset tank" onPress={() => setTankPercent(100)} />
          </Card>
        )}

        <Card style={[styles.coachCard, isOverexpanded && styles.coachCardDanger]}>
          <Text style={[styles.coachLabel, isOverexpanded && { color: colors.danger }]}>COACH CALLOUT</Text>
          <Text style={styles.coachText}>{coachText}</Text>
        </Card>

        <Card style={styles.lawCard}>
          <Text style={styles.cardTitle}>Quick law check</Text>
          <View style={styles.formulaBox}><Text style={styles.formula}>P₁ × V₁ = P₂ × V₂</Text></View>
          <View style={styles.lawRow}><Text style={styles.lawLabel}>Given</Text><Text style={styles.lawValue}>V₁ = 1.00 L at the surface</Text></View>
          <View style={styles.lawRow}><Text style={styles.lawLabel}>At depth</Text><Text style={styles.lawValue}>P₂ = {state.pressure.toFixed(1)} ATA at {depthLabel(depth, unit)}</Text></View>
          <View style={[styles.lawRow, styles.lawResultRow]}><Text style={styles.lawLabel}>Result</Text><Text style={styles.lawResult}>V₂ = {state.normalVolume.toFixed(2)} L</Text></View>
        </Card>

        <Card>
          <Text style={styles.cardTitle}>{mode === 'compression' ? 'What the model shows' : 'Gas-use comparison'}</Text>
          {mode === 'compression' ? (
            <>
              <View style={styles.readoutRow}><Text style={styles.readoutLabel}>Normal volume at this depth</Text><Text style={styles.readoutValue}>{state.normalVolume.toFixed(2)}×</Text></View>
              <View style={styles.readoutRow}><Text style={styles.readoutLabel}>Current balloon volume</Text><Text style={styles.readoutValue}>{state.currentVolume.toFixed(2)}×</Text></View>
              <View style={styles.readoutRow}><Text style={styles.readoutLabel}>Ascent expansion</Text><Text style={[styles.readoutValue, isOverexpanded && { color: colors.danger }]}>{isOverexpanded ? `${Math.round(state.overExpansion * 100)}% above surface size` : 'No overexpansion'}</Text></View>
            </>
          ) : (
            <>
              <Text style={styles.proportionCopy}>With the same breathing pattern, gas use rises roughly with ambient pressure.</Text>
              {[1, 2, 3, 4].map((ata) => (
                <View key={ata} style={styles.ataRow}><Text style={styles.ataLabel}>{ata} ATA</Text><ProgressBar color={ata === Math.round(state.pressure) ? colors.gold : colors.cyan} value={ata / 4} /><Text style={styles.ataValue}>{ata}×</Text></View>
              ))}
            </>
          )}
        </Card>

        <Text style={styles.disclaimer}>Training visualization only. Use formal dive training, your dive computer, and an appropriate gas plan for real dives.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  content: { paddingHorizontal: spacing.md, paddingTop: spacing.lg },
  intro: { marginBottom: spacing.lg },
  title: { color: colors.text, fontSize: 29, fontWeight: '900', letterSpacing: -0.7, lineHeight: 33 },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 10 },
  modeRow: { flexDirection: 'row', gap: 9, marginBottom: 12 },
  modeButton: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: radii.md, borderWidth: 1, flex: 1, minHeight: 80, padding: 12 },
  modeButtonActive: { backgroundColor: 'rgba(112,221,246,.12)', borderColor: colors.cyan },
  modeTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  modeTitleActive: { color: colors.cyan },
  modeBody: { color: colors.muted, fontSize: 10, lineHeight: 14, marginTop: 4 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  stat: { flex: 1 },
  sceneShell: { borderColor: colors.lineStrong, borderRadius: radii.lg, borderWidth: 1, marginBottom: 12, overflow: 'hidden', ...shadow },
  sceneShellDanger: { borderColor: colors.danger, shadowColor: colors.danger },
  scene: { height: 340, overflow: 'hidden' },
  surfaceLine: { left: 0, position: 'absolute', right: 0, top: 18 },
  sceneHud: { backgroundColor: 'rgba(2,10,18,0.64)', borderColor: 'rgba(255,255,255,0.19)', borderRadius: radii.pill, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', left: 12, paddingHorizontal: 12, paddingVertical: 8, position: 'absolute', right: 12, top: 12 },
  sceneHudDepth: { color: colors.text, fontSize: 12, fontWeight: '900' },
  sceneHudMode: { color: colors.cyan, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  balloonWrap: { left: '50%', position: 'absolute' },
  diverWrap: { alignItems: 'center', left: '17%', position: 'absolute' },
  tankBadge: { alignItems: 'center', backgroundColor: 'rgba(2,10,18,.74)', borderColor: colors.lineStrong, borderRadius: radii.sm, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, position: 'absolute', right: -8, top: 4 },
  tankBadgeLabel: { color: colors.muted, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  tankBadgeValue: { color: colors.good, fontSize: 16, fontWeight: '900' },
  tankBarWrap: { bottom: 14, left: 18, position: 'absolute', right: 55 },
  depthRuler: { bottom: 13, position: 'absolute', right: 12, top: 20, width: 31 },
  rulerMark: { alignItems: 'center', flexDirection: 'row', position: 'absolute', right: 0 },
  rulerLine: { backgroundColor: 'rgba(255,255,255,.52)', height: 1, marginRight: 4, width: 8 },
  rulerText: { color: 'rgba(255,255,255,.75)', fontSize: 8, fontWeight: '700', width: 19 },
  controlsCard: { marginBottom: 12 },
  controlHead: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  cardHelper: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 4 },
  depthValue: { color: colors.cyan, fontSize: 24, fontWeight: '900', marginTop: 2 },
  unitRow: { flexDirection: 'row', gap: 6 },
  unitButton: { minHeight: 36, minWidth: 48, paddingHorizontal: 11, paddingVertical: 7 },
  presetRow: { flexDirection: 'row', gap: 6 },
  presetButton: { flex: 1, minHeight: 38, paddingHorizontal: 3, paddingVertical: 7 },
  actionCard: { marginBottom: 12 },
  primaryAction: { marginBottom: 8, marginTop: 15 },
  tankReadout: { color: colors.good, fontSize: 24, fontWeight: '900' },
  coachCard: { backgroundColor: '#0B2838', borderColor: 'rgba(112,221,246,.34)', marginBottom: 12 },
  coachCardDanger: { backgroundColor: 'rgba(85,24,31,.92)', borderColor: 'rgba(255,127,127,.7)' },
  coachLabel: { color: colors.cyan, fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  coachText: { color: colors.text, fontSize: 15, fontWeight: '700', lineHeight: 22, marginTop: 8 },
  lawCard: { marginBottom: 12 },
  formulaBox: { alignItems: 'center', backgroundColor: colors.backgroundRaised, borderColor: colors.line, borderRadius: radii.md, borderWidth: 1, marginVertical: 14, padding: 13 },
  formula: { color: colors.cyan, fontSize: 22, fontWeight: '900', letterSpacing: 1 },
  lawRow: { borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, gap: 5, paddingVertical: 10 },
  lawResultRow: { borderBottomWidth: 0 },
  lawLabel: { color: colors.faint, fontSize: 10, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  lawValue: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  lawResult: { color: colors.text, fontSize: 18, fontWeight: '900' },
  readoutRow: { alignItems: 'center', borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', minHeight: 49 },
  readoutLabel: { color: colors.muted, flex: 1, fontSize: 12, paddingRight: 12 },
  readoutValue: { color: colors.text, fontSize: 13, fontWeight: '800', maxWidth: '48%', textAlign: 'right' },
  proportionCopy: { color: colors.muted, fontSize: 12, lineHeight: 18, marginBottom: 13, marginTop: 6 },
  ataRow: { alignItems: 'center', flexDirection: 'row', gap: 9, marginBottom: 12 },
  ataLabel: { color: colors.muted, fontSize: 11, fontWeight: '700', width: 39 },
  ataValue: { color: colors.text, fontSize: 11, fontWeight: '800', textAlign: 'right', width: 22 },
  disclaimer: { color: colors.faint, fontSize: 11, lineHeight: 17, marginHorizontal: 8, marginTop: 16, textAlign: 'center' },
  pressed: { opacity: 0.75 },
});
