import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraPreview, requestCameraPermission } from '../../../modules/color-loss-camera';
import { colorMatrix } from './model';
import { colors } from '../../theme';

export default function CameraLab({ depth, clarity, width, height }) {
  const [permission, setPermission] = useState(false);
  const [error, setError] = useState('');
  const [asking, setAsking] = useState(false);
  const [ready, setReady] = useState(false);
  const [compare, setCompare] = useState(false);
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setActive(state === 'active'); setReady(false); setCompare(false);
    });
    return () => subscription.remove();
  }, []);
  const matrix = useMemo(() => colorMatrix(compare ? 0 : depth, clarity), [compare, depth, clarity]);
  const attemptingLive = Boolean(CameraPreview && permission && active && !error);
  useEffect(() => {
    // Belt-and-suspenders: if the native side ever stalls without firing
    // onCameraReady or onCameraError (a silent session failure), don't
    // leave the screen looking blank forever — surface something actionable.
    if (!attemptingLive || ready) return undefined;
    const timeout = setTimeout(() => setError('The camera is taking too long to start. Try again, or check that no other app is using it.'), 6000);
    return () => clearTimeout(timeout);
  }, [attemptingLive, ready]);
  const enable = async () => {
    setAsking(true); setError(''); setReady(false);
    try {
      const granted = await requestCameraPermission();
      setPermission(granted);
      if (!granted) setError('Camera access is disabled. Allow access in Settings, then try again.');
    } catch (e) { setError(e.message || 'The camera could not start.'); }
    finally { setAsking(false); }
  };
  return (
    <View style={[styles.frame, { width, height }]}>
      {attemptingLive ? (
        <>
          <CameraPreview matrix={matrix} style={{ position: 'absolute', top: 0, left: 0, width, height }} onCameraReady={() => { console.log('[ColorLossCamera] onCameraReady (JS)'); setReady(true); }} onCameraError={(e) => { console.log('[ColorLossCamera] onCameraError (JS)', e.nativeEvent); setError(e.nativeEvent.message); }} />
          {!ready ? <View pointerEvents="none" style={styles.message}><ActivityIndicator color={colors.cyan} /><Text style={styles.body}>Starting camera…</Text></View> : null}
          <View pointerEvents="box-none" style={styles.controls}>
            <View pointerEvents="none" style={styles.badge}><Text style={styles.badgeText}>{compare ? 'SURFACE REFERENCE' : 'SIMULATED UNDERWATER COLOR'}</Text></View>
            <Pressable accessibilityRole="button" accessibilityLabel="Hold to compare with unfiltered camera" onPressIn={() => setCompare(true)} onPressOut={() => setCompare(false)} style={styles.compare}><Text style={styles.buttonText}>Hold to see original</Text></Pressable>
          </View>
        </>
      ) : (
        <View style={styles.message}>
          <Text style={styles.title}>Try it on real objects</Text>
          <Text style={styles.body}>{!CameraPreview ? 'The camera lab needs the updated native DMZ Scuba build.' : error || 'Point your camera at something colorful, then change depth. The preview stays on your phone; nothing is recorded or uploaded.'}</Text>
          {CameraPreview && active ? <Pressable disabled={asking} accessibilityRole="button" onPress={enable} style={styles.button}><Text style={styles.buttonText}>{asking ? 'Requesting access…' : error ? 'Try camera again' : 'Enable camera'}</Text></Pressable> : null}
          {error ? <Pressable accessibilityRole="button" onPress={() => Linking.openSettings()} style={styles.button}><Text style={styles.buttonText}>Open Settings</Text></Pressable> : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { backgroundColor: '#071C2B', overflow: 'hidden' },
  message: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30, gap: 15 },
  title: { color: colors.text, fontSize: 23, fontWeight: '800', textAlign: 'center' },
  body: { color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  button: { paddingHorizontal: 20, paddingVertical: 14, borderRadius: 12, backgroundColor: '#16435B' },
  buttonText: { color: colors.text, fontSize: 14, fontWeight: '800' },
  // Grouped at the bottom so the state label sits with the control it
  // describes and nothing collides with the guidance pill at the top of the
  // stage (rendered by ColorLossScreen).
  controls: { position: 'absolute', left: 0, right: 0, bottom: 18, alignItems: 'center', gap: 8 },
  badge: { backgroundColor: '#061728CC', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  badgeText: { color: colors.cyan, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  compare: { alignSelf: 'center', backgroundColor: '#061728DD', borderRadius: 14, paddingHorizontal: 22, paddingVertical: 14 },
});
