import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { G, Line, Rect, Text as SvgText } from 'react-native-svg';

import { CameraPreview, requestCameraPermission } from '../../../modules/color-loss-camera';
import { sideWindowLevel, sideWindowTicks } from './model';
import { colors } from '../../theme';

const IDENTITY_COLOR_MATRIX = [
  1, 0, 0, 0, 0,
  0, 1, 0, 0, 0,
  0, 0, 1, 0, 0,
  0, 0, 0, 1, 0,
];
const VIEWBOX_WIDTH = 1000;
const VIEWBOX_HEIGHT = 250;
const CENTER = VIEWBOX_WIDTH / 2;
const PX_PER_DEGREE = 11;

function HeadingCard({ heading }) {
  const ticks = useMemo(() => sideWindowTicks(heading), [heading]);
  return (
    <Svg width="100%" height="100%" viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}>
      <G>
        <Rect x={-120} y={76} width={VIEWBOX_WIDTH + 240} height={132} rx={12} fill="#E9E2C8" stroke="#B7AC8C" strokeWidth={6} />
        <Line x1={-120} y1={142} x2={VIEWBOX_WIDTH + 120} y2={142} stroke="#756E5B" strokeWidth={2} />
        {ticks.map(({ value, delta }) => {
          const x = CENTER + delta * PX_PER_DEGREE;
          const cardinal = value % 90 === 0;
          const major = value % 10 === 0;
          const label = value === 0 ? 'N' : value === 90 ? 'E' : value === 180 ? 'S' : value === 270 ? 'W' : String(value).padStart(3, '0');
          return (
            <G key={`${value}-${delta}`}>
              <Line x1={x} y1={78} x2={x} y2={major ? 119 : 101} stroke={value === 0 ? '#C72832' : '#17232B'} strokeWidth={major ? 5 : 3} />
              {major ? (
                <SvgText x={x} y={174} fill={value === 0 ? '#C72832' : '#17232B'} fontSize={cardinal ? 34 : 24} fontWeight="900" textAnchor="middle">
                  {label}
                </SvgText>
              ) : null}
            </G>
          );
        })}
      </G>
    </Svg>
  );
}

export default function SideWindowCamera({ heading, tiltVec, sensorAvailable, onClose }) {
  const [permission, setPermission] = useState(false);
  const [asking, setAsking] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [active, setActive] = useState(AppState.currentState === 'active');
  const level = sideWindowLevel(tiltVec);
  const sensorsReady = Boolean(sensorAvailable?.heading && sensorAvailable?.tilt);
  const headingLabel = sensorsReady ? String(Math.round(heading)).padStart(3, '0') : '---';

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setActive(state === 'active');
      setReady(false);
    });
    return () => subscription.remove();
  }, []);

  const attemptingLive = Boolean(CameraPreview && permission && active && !error);
  useEffect(() => {
    if (!attemptingLive || ready) return undefined;
    const timeout = setTimeout(() => setError('The camera is taking too long to start. Try again, or check that no other app is using it.'), 6000);
    return () => clearTimeout(timeout);
  }, [attemptingLive, ready]);

  const enable = async () => {
    setAsking(true);
    setError('');
    setReady(false);
    try {
      const granted = await requestCameraPermission();
      setPermission(granted);
      if (!granted) setError('Camera access is disabled. Allow access in Settings, then try again.');
    } catch (cameraError) {
      setError(cameraError.message || 'The camera could not start.');
    } finally {
      setAsking(false);
    }
  };

  if (!attemptingLive) {
    return (
      <View style={styles.permissionScreen}>
        <View style={styles.permissionCard}>
          <Text style={styles.eyebrow}>SIDE-WINDOW MODE</Text>
          <Text style={styles.permissionTitle}>Sight a heading through the camera</Text>
          <Text style={styles.permissionBody}>
            Hold the phone upright and level, then aim the center line at a distant object. The live card shows the heading that would appear through a compass side window.
          </Text>
          <Text style={styles.privacy}>The preview stays on your phone. Nothing is recorded or uploaded.</Text>
          {!CameraPreview ? <Text style={styles.error}>This mode needs the current native DMZ Scuba build.</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {CameraPreview && active ? (
            <Pressable accessibilityRole="button" disabled={asking} onPress={enable} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>{asking ? 'REQUESTING ACCESS…' : error ? 'TRY CAMERA AGAIN' : 'ENABLE CAMERA'}</Text>
            </Pressable>
          ) : null}
          {error ? (
            <Pressable accessibilityRole="button" onPress={() => Linking.openSettings()} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>OPEN SETTINGS</Text>
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>BACK TO COMPASS</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.cameraStage}>
      <CameraPreview
        matrix={IDENTITY_COLOR_MATRIX}
        style={StyleSheet.absoluteFill}
        onCameraReady={() => setReady(true)}
        onCameraError={(event) => setError(event.nativeEvent?.message || 'The camera could not start.')}
      />
      {!ready ? (
        <View pointerEvents="none" style={styles.loading}>
          <ActivityIndicator color={colors.cyan} />
          <Text style={styles.loadingText}>Starting camera…</Text>
        </View>
      ) : null}

      <View pointerEvents="none" style={styles.sight}>
        <View style={styles.sightLine} />
        <View style={styles.sightNotch} />
      </View>

      <View pointerEvents="none" style={[styles.levelPill, level.level ? styles.levelPillGood : styles.levelPillBad]}>
        <Text style={[styles.levelText, level.level ? styles.levelTextGood : styles.levelTextBad]}>
          {!sensorsReady
            ? 'STARTING COMPASS SENSORS…'
            : level.level
              ? `● LEVEL  ·  READ ${headingLabel}°`
              : `HOLD LEVEL  ·  ${Math.round(Math.abs(level.roll))}° ${level.roll > 0 ? 'RIGHT' : 'LEFT'}`}
        </Text>
      </View>

      <View pointerEvents="none" style={styles.windowHousing}>
        <View style={[styles.cardWrap, { transform: [{ rotate: `${-level.roll}deg` }] }]}>
          <HeadingCard heading={heading} />
        </View>
        <View style={styles.lubber} />
        <View style={styles.readout}>
          <Text style={styles.readoutLabel}>LUBBER LINE</Text>
          <Text style={styles.readoutHeading}>{headingLabel}°</Text>
        </View>
      </View>

      <View style={styles.cameraControls}>
        <Text style={styles.cameraHint}>Aim the center line at your target. Keep the card level before reading.</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close side-window camera" onPress={onClose} style={styles.closeButton}>
          <Text style={styles.closeButtonText}>CLOSE CAMERA</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cameraStage: { flex: 1, backgroundColor: '#02080D', overflow: 'hidden' },
  permissionScreen: { flex: 1, backgroundColor: '#04121C', alignItems: 'center', justifyContent: 'center', padding: 24 },
  permissionCard: { width: '100%', maxWidth: 440, alignItems: 'center', gap: 14, padding: 24, borderRadius: 20, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.surfaceGlass },
  eyebrow: { color: colors.cyan, fontSize: 10, fontWeight: '900', letterSpacing: 1.6 },
  permissionTitle: { color: colors.text, fontSize: 22, lineHeight: 27, fontWeight: '900', textAlign: 'center' },
  permissionBody: { color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  privacy: { color: colors.faint, fontSize: 11, lineHeight: 16, textAlign: 'center' },
  error: { color: colors.warning, fontSize: 12, lineHeight: 17, fontWeight: '700', textAlign: 'center' },
  primaryButton: { minWidth: 220, alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.cyan, backgroundColor: '#16435B' },
  primaryButtonText: { color: colors.text, fontSize: 12, fontWeight: '900', letterSpacing: 0.7 },
  secondaryButton: { paddingHorizontal: 18, paddingVertical: 10 },
  secondaryButtonText: { color: colors.cyan, fontSize: 11, fontWeight: '900', letterSpacing: 0.7 },
  loading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#04121C' },
  loadingText: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  sight: { position: 'absolute', top: 42, left: '50%', bottom: '45%', width: 34, marginLeft: -17, alignItems: 'center' },
  sightLine: { width: 2, flex: 1, backgroundColor: 'rgba(125,224,245,0.75)' },
  sightNotch: { width: 30, height: 18, borderLeftWidth: 2, borderRightWidth: 2, borderTopWidth: 2, borderColor: colors.cyan },
  levelPill: { position: 'absolute', top: 14, alignSelf: 'center', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  levelPillGood: { backgroundColor: 'rgba(8,44,40,0.88)', borderColor: colors.good },
  levelPillBad: { backgroundColor: 'rgba(58,33,20,0.9)', borderColor: colors.warning },
  levelText: { fontSize: 11, fontWeight: '900', letterSpacing: 0.9 },
  levelTextGood: { color: colors.good },
  levelTextBad: { color: colors.warning },
  windowHousing: { position: 'absolute', left: 14, right: 14, bottom: 118, height: 188, overflow: 'hidden', borderRadius: 22, borderWidth: 5, borderColor: '#203846', backgroundColor: 'rgba(4,18,28,0.72)' },
  cardWrap: { position: 'absolute', left: -80, right: -80, top: -28, height: 180 },
  lubber: { position: 'absolute', top: 0, bottom: 0, left: '50%', width: 3, marginLeft: -1.5, backgroundColor: colors.cyan, shadowColor: colors.cyan, shadowOpacity: 0.9, shadowRadius: 6 },
  readout: { position: 'absolute', left: 12, right: 12, bottom: 8, height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, borderRadius: 10, backgroundColor: 'rgba(2,10,16,0.9)' },
  readoutLabel: { color: colors.faint, fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },
  readoutHeading: { color: colors.text, fontSize: 24, fontWeight: '900', letterSpacing: 1 },
  cameraControls: { position: 'absolute', left: 18, right: 18, bottom: 20, alignItems: 'center', gap: 12 },
  cameraHint: { color: colors.text, fontSize: 12, lineHeight: 17, fontWeight: '700', textAlign: 'center', textShadowColor: '#000', textShadowRadius: 4 },
  closeButton: { paddingHorizontal: 22, paddingVertical: 13, borderRadius: 999, borderWidth: 1, borderColor: colors.cyan, backgroundColor: 'rgba(4,18,28,0.9)' },
  closeButtonText: { color: colors.cyan, fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
});
