import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Slider from '@react-native-community/slider';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader, SectionLabel } from '../components/AppShell';
import { BubbleField, DiverGraphic, WaveLine } from '../components/DiveIllustrations';
import { Card, ProgressBar, SecondaryButton, Stat } from '../components/Ui';
import { ambientLight, attenuateColor, colorLesson, colorVisibility, depthLabel, depthZone, spectrumAtDepth } from '../lib/divePhysics';
import { colors, radii, shadow, spacing } from '../theme';

const MAX_DEPTH = 40;
const DEFAULT_GEAR = { mask: '#FF3B30', wetsuit: '#6A625D', tank: '#F2F3F4', fins: '#F4EA24' };
const SAFETY_GEAR = { mask: '#00FF88', wetsuit: '#FF5A36', tank: '#F2F3F4', fins: '#F4EA24' };
const PALETTE = ['#FF3B30', '#FF8A34', '#F4EA24', '#00D68F', '#2F8BFF', '#8F7BFF', '#F2F3F4', '#252B31'];
const GEAR_LABELS = { mask: 'Mask', wetsuit: 'Wetsuit', tank: 'Tank', fins: 'Fins' };

function SpectrumRow({ label, value, color }) {
  return (
    <View style={styles.spectrumRow}>
      <Text style={[styles.spectrumKey, { color }]}>{label}</Text>
      <View style={styles.spectrumTrack}><View style={[styles.spectrumFill, { backgroundColor: color, width: `${Math.round(value * 100)}%` }]} /></View>
      <Text style={styles.spectrumValue}>{Math.round(value * 100)}%</Text>
    </View>
  );
}

function GearSelector({ activeGear, gear, onSelectGear, onSetColor }) {
  return (
    <Card>
      <Text style={styles.cardTitle}>Gear color</Text>
      <Text style={styles.cardHelper}>Choose a gear item, then test a color.</Text>
      <View style={styles.gearTabs}>
        {Object.keys(GEAR_LABELS).map((key) => (
          <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: activeGear === key }} onPress={() => onSelectGear(key)} style={[styles.gearTab, activeGear === key && styles.gearTabActive]}>
            <View style={[styles.gearDot, { backgroundColor: gear[key] }]} />
            <Text style={[styles.gearTabText, activeGear === key && styles.gearTabTextActive]}>{GEAR_LABELS[key]}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.palette}>
        {PALETTE.map((color) => (
          <Pressable key={color} accessibilityRole="button" accessibilityLabel={`Set ${GEAR_LABELS[activeGear]} color to ${color}`} accessibilityState={{ selected: gear[activeGear] === color }} onPress={() => onSetColor(color)} style={[styles.swatchWrap, gear[activeGear] === color && styles.swatchSelected]}>
            <View style={[styles.swatch, { backgroundColor: color }]} />
          </Pressable>
        ))}
      </View>
    </Card>
  );
}

export default function ColorLossScreen({ onBack }) {
  const insets = useSafeAreaInsets();
  const [depth, setDepth] = useState(10);
  const [unit, setUnit] = useState('m');
  const [flashlight, setFlashlight] = useState(false);
  const [clarity, setClarity] = useState(1);
  const [activeGear, setActiveGear] = useState('mask');
  const [gear, setGear] = useState(DEFAULT_GEAR);

  const spectrum = useMemo(() => spectrumAtDepth(depth, clarity), [depth, clarity]);
  const displayedGear = useMemo(() => Object.fromEntries(Object.entries(gear).map(([key, value]) => [key, attenuateColor(value, depth, flashlight, clarity)])), [gear, depth, flashlight, clarity]);
  const sceneMid = depth < 14 ? '#1883B8' : depth < 28 ? '#0C5B87' : '#073C62';
  const diverTop = 39 + (depth / MAX_DEPTH) * 198;
  const lightPercent = ambientLight(depth, clarity);

  const reset = () => {
    setDepth(10);
    setUnit('m');
    setFlashlight(false);
    setClarity(1);
    setActiveGear('mask');
    setGear(DEFAULT_GEAR);
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Underwater Color Loss" onBack={onBack} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.intro}>
          <SectionLabel>INTERACTIVE TRAINING MODULE</SectionLabel>
          <Text style={styles.title}>Watch color disappear with depth.</Text>
          <Text style={styles.subtitle}>Warm colors are absorbed first, while cooler tones stay visible longer. Change depth and use the dive light to compare.</Text>
        </View>

        <View style={styles.statsRow}>
          <Stat label="Depth zone" value={depthZone(depth)} style={styles.statWide} />
          <Stat accent={colors.cyan} label="Ambient light" value={`${Math.round(lightPercent * 100)}%`} style={styles.statNarrow} />
        </View>

        <View style={styles.sceneShell}>
          <LinearGradient colors={['#8DCBE9', sceneMid, '#062A49']} locations={[0, 0.42, 1]} style={styles.scene}>
            <BubbleField />
            <View style={styles.surfaceLine}><WaveLine /></View>
            <View style={styles.sunGlow} />
            {flashlight && <View style={[styles.lightBeam, { top: diverTop + 33 }]} />}
            <View style={[styles.diver, { top: diverTop }]}>
              <DiverGraphic colors={displayedGear} flashlight={flashlight} width={170} />
            </View>
            <View style={styles.sceneHud}>
              <Text style={styles.sceneHudDepth}>{depthLabel(depth, unit)}</Text>
              <Text style={styles.sceneHudMode}>{flashlight ? 'DIVE LIGHT ON' : 'NATURAL LIGHT'}</Text>
            </View>
            <View style={styles.depthRuler}>
              {[0, 10, 20, 30, 40].map((mark) => (
                <View key={mark} style={[styles.rulerMark, { top: 21 + (mark / MAX_DEPTH) * 272 }]}>
                  <View style={styles.rulerLine} />
                  <Text style={styles.rulerText}>{unit === 'ft' ? Math.round(mark * 3.28084) : mark}</Text>
                </View>
              ))}
            </View>
          </LinearGradient>
        </View>

        <Card style={styles.controlsCard}>
          <View style={styles.controlHead}>
            <View>
              <Text style={styles.cardTitle}>Depth</Text>
              <Text style={styles.depthValue}>{depthLabel(depth, unit)}</Text>
            </View>
            <View style={styles.unitRow}>
              <SecondaryButton label="m" selected={unit === 'm'} onPress={() => setUnit('m')} style={styles.unitButton} />
              <SecondaryButton label="ft" selected={unit === 'ft'} onPress={() => setUnit('ft')} style={styles.unitButton} />
            </View>
          </View>
          <Slider
            accessibilityLabel="Diver depth"
            maximumTrackTintColor="rgba(255,255,255,0.16)"
            maximumValue={MAX_DEPTH}
            minimumTrackTintColor={colors.cyan}
            minimumValue={0}
            onValueChange={setDepth}
            step={1}
            thumbTintColor={colors.white}
            value={depth}
          />
          <View style={styles.presetRow}>
            {[0, 10, 20, 30, 40].map((value) => <SecondaryButton key={value} label={unit === 'ft' ? `${Math.round(value * 3.28084)} ft` : `${value} m`} selected={depth === value} onPress={() => setDepth(value)} style={styles.presetButton} />)}
          </View>
        </Card>

        <View style={styles.actionRow}>
          <Pressable accessibilityRole="switch" accessibilityState={{ checked: flashlight }} onPress={() => setFlashlight((value) => !value)} style={({ pressed }) => [styles.lightButton, flashlight && styles.lightButtonOn, pressed && styles.pressed]}>
            <Text style={styles.lightIcon}>{flashlight ? '✦' : '◇'}</Text>
            <View style={styles.lightCopy}>
              <Text style={styles.lightTitle}>Dive light</Text>
              <Text style={styles.lightState}>{flashlight ? 'True color revealed' : 'Natural light only'}</Text>
            </View>
            <View style={[styles.switchTrack, flashlight && styles.switchTrackOn]}><View style={[styles.switchThumb, flashlight && styles.switchThumbOn]} /></View>
          </Pressable>
        </View>

        <GearSelector activeGear={activeGear} gear={gear} onSelectGear={setActiveGear} onSetColor={(value) => setGear((current) => ({ ...current, [activeGear]: value }))} />

        <Card>
          <View style={styles.controlHead}>
            <View style={styles.flexOne}>
              <Text style={styles.cardTitle}>Water clarity</Text>
              <Text style={styles.cardHelper}>{clarity < 0.9 ? 'Very clear water' : clarity < 1.45 ? 'Clear training water' : 'Lower visibility'}</Text>
            </View>
            <Text style={styles.clarityValue}>{clarity.toFixed(2)}×</Text>
          </View>
          <Slider maximumTrackTintColor="rgba(255,255,255,0.16)" maximumValue={2.2} minimumTrackTintColor={colors.cyan} minimumValue={0.6} onValueChange={setClarity} step={0.05} thumbTintColor={colors.white} value={clarity} />
        </Card>

        <Card style={styles.lessonCard}>
          <Text style={styles.coachLabel}>COACH CALLOUT</Text>
          <Text style={styles.lessonText}>{colorLesson(depth, flashlight)}</Text>
        </Card>

        <Card>
          <Text style={styles.cardTitle}>Estimated gear visibility</Text>
          {Object.entries(gear).map(([key, color]) => {
            const value = colorVisibility(color, depth, flashlight, clarity);
            return (
              <View key={key} style={styles.visibilityRow}>
                <View style={styles.visibilityLabelRow}><View style={[styles.miniDot, { backgroundColor: displayedGear[key] }]} /><Text style={styles.visibilityLabel}>{GEAR_LABELS[key]}</Text><Text style={styles.visibilityPercent}>{Math.round(value * 100)}%</Text></View>
                <ProgressBar value={value} color={displayedGear[key]} />
              </View>
            );
          })}
        </Card>

        <Card>
          <Text style={styles.cardTitle}>Depth light spectrum</Text>
          <Text style={styles.cardHelper}>Approximate relative light remaining at the diver’s depth.</Text>
          <View style={styles.spectrumList}>
            <SpectrumRow label="R" value={spectrum.red} color="#FF635F" />
            <SpectrumRow label="G" value={spectrum.green} color="#62E59C" />
            <SpectrumRow label="B" value={spectrum.blue} color="#68AFFF" />
            <SpectrumRow label="W" value={spectrum.white} color="#F2F7FF" />
          </View>
        </Card>

        <View style={styles.bottomActions}>
          <SecondaryButton label="Apply safety colors" onPress={() => setGear(SAFETY_GEAR)} style={styles.bottomButton} />
          <SecondaryButton label="Reset demo" onPress={reset} style={styles.bottomButton} />
        </View>
        <Text style={styles.disclaimer}>Training visualization only. Actual color and visibility vary with water conditions, distance, and lighting.</Text>
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
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  statWide: { flex: 1.35 },
  statNarrow: { flex: 1 },
  sceneShell: { borderColor: colors.lineStrong, borderRadius: radii.lg, borderWidth: 1, marginBottom: 12, overflow: 'hidden', ...shadow },
  scene: { height: 350, overflow: 'hidden' },
  surfaceLine: { left: 0, position: 'absolute', right: 0, top: 18 },
  sunGlow: { backgroundColor: 'rgba(255,248,190,0.34)', borderRadius: 60, height: 86, left: '21%', position: 'absolute', top: -49, width: 86 },
  diver: { left: '17%', position: 'absolute' },
  lightBeam: { backgroundColor: 'rgba(255,244,183,0.13)', borderBottomRightRadius: 44, borderTopRightRadius: 44, height: 60, left: '54%', position: 'absolute', width: '40%' },
  sceneHud: { backgroundColor: 'rgba(2,10,18,0.64)', borderColor: 'rgba(255,255,255,0.19)', borderRadius: radii.pill, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', left: 12, paddingHorizontal: 12, paddingVertical: 8, position: 'absolute', right: 12, top: 12 },
  sceneHudDepth: { color: colors.text, fontSize: 12, fontWeight: '900' },
  sceneHudMode: { color: colors.cyan, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  depthRuler: { bottom: 13, position: 'absolute', right: 12, top: 20, width: 31 },
  rulerMark: { alignItems: 'center', flexDirection: 'row', position: 'absolute', right: 0 },
  rulerLine: { backgroundColor: 'rgba(255,255,255,.52)', height: 1, marginRight: 4, width: 8 },
  rulerText: { color: 'rgba(255,255,255,.75)', fontSize: 8, fontWeight: '700', width: 19 },
  controlsCard: { marginBottom: 12 },
  controlHead: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  cardHelper: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  depthValue: { color: colors.cyan, fontSize: 24, fontWeight: '900', marginTop: 2 },
  unitRow: { flexDirection: 'row', gap: 6 },
  unitButton: { minHeight: 36, minWidth: 48, paddingHorizontal: 11, paddingVertical: 7 },
  presetRow: { flexDirection: 'row', gap: 5, justifyContent: 'space-between' },
  presetButton: { flex: 1, minHeight: 37, paddingHorizontal: 3, paddingVertical: 7 },
  actionRow: { marginBottom: 12 },
  lightButton: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.line, borderRadius: radii.lg, borderWidth: 1, flexDirection: 'row', minHeight: 74, padding: 14 },
  lightButtonOn: { backgroundColor: 'rgba(77,117,125,0.44)', borderColor: 'rgba(255,232,133,0.6)' },
  lightIcon: { color: colors.gold, fontSize: 27, marginRight: 12, textAlign: 'center', width: 32 },
  lightCopy: { flex: 1 },
  lightTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  lightState: { color: colors.muted, fontSize: 11, marginTop: 2 },
  switchTrack: { backgroundColor: '#294054', borderRadius: 14, height: 27, padding: 3, width: 48 },
  switchTrackOn: { backgroundColor: colors.gold },
  switchThumb: { backgroundColor: colors.white, borderRadius: 11, height: 21, width: 21 },
  switchThumbOn: { transform: [{ translateX: 21 }] },
  gearTabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 13 },
  gearTab: { alignItems: 'center', backgroundColor: colors.backgroundRaised, borderColor: colors.line, borderRadius: radii.pill, borderWidth: 1, flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 8 },
  gearTabActive: { borderColor: colors.cyan },
  gearDot: { borderColor: 'rgba(255,255,255,.6)', borderRadius: 5, borderWidth: 1, height: 10, marginRight: 6, width: 10 },
  gearTabText: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  gearTabTextActive: { color: colors.cyan },
  palette: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 15 },
  swatchWrap: { alignItems: 'center', borderColor: 'transparent', borderRadius: 16, borderWidth: 2, height: 38, justifyContent: 'center', width: 38 },
  swatchSelected: { borderColor: colors.white },
  swatch: { borderColor: 'rgba(255,255,255,.28)', borderRadius: 12, borderWidth: 1, height: 28, width: 28 },
  flexOne: { flex: 1 },
  clarityValue: { color: colors.cyan, fontSize: 18, fontWeight: '900' },
  lessonCard: { backgroundColor: '#0B2838', borderColor: 'rgba(112,221,246,.34)' },
  coachLabel: { color: colors.cyan, fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  lessonText: { color: colors.text, fontSize: 15, fontWeight: '700', lineHeight: 22, marginTop: 8 },
  visibilityRow: { marginTop: 14 },
  visibilityLabelRow: { alignItems: 'center', flexDirection: 'row', marginBottom: 7 },
  miniDot: { borderRadius: 5, height: 10, marginRight: 7, width: 10 },
  visibilityLabel: { color: colors.muted, flex: 1, fontSize: 12, fontWeight: '700' },
  visibilityPercent: { color: colors.text, fontSize: 12, fontWeight: '800' },
  spectrumList: { gap: 10, marginTop: 15 },
  spectrumRow: { alignItems: 'center', flexDirection: 'row' },
  spectrumKey: { fontSize: 12, fontWeight: '900', width: 23 },
  spectrumTrack: { backgroundColor: 'rgba(255,255,255,.09)', borderRadius: radii.pill, flex: 1, height: 8, overflow: 'hidden' },
  spectrumFill: { borderRadius: radii.pill, height: '100%' },
  spectrumValue: { color: colors.muted, fontSize: 11, fontWeight: '700', marginLeft: 9, textAlign: 'right', width: 36 },
  bottomActions: { flexDirection: 'row', gap: 9, marginTop: 12 },
  bottomButton: { flex: 1 },
  disclaimer: { color: colors.faint, fontSize: 11, lineHeight: 17, marginHorizontal: 8, marginTop: 16, textAlign: 'center' },
  pressed: { opacity: 0.75 },
});
