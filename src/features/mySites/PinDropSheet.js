// Drop a pin for a dive site the Ocean Atlas doesn't list: move the map under a fixed centre pin,
// name it, save. The site joins "My sites" (atlas layer, atlas search, planner suggestions).
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { leafletCss, leafletJs } from '../oceanAtlas/data/leaflet';
import { colors, radii, spacing } from '../../theme';

const safe = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

function pinDocument(center, zoom) {
  const script = `
var map = L.map('map', { zoomControl: false, attributionControl: false, worldCopyJump: true }).setView(${safe(center)}, ${zoom});
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
function report() { var c = map.getCenter().wrap(); window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'center', latitude: c.lat, longitude: c.lng, zoom: map.getZoom() })); }
map.on('moveend', report); report();
window.pinReceive = function (m) { if (m.type === 'goTo') map.setView([m.latitude, m.longitude], m.zoom || Math.max(map.getZoom(), 15)); };`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: https://tile.openstreetmap.org; connect-src 'none'"><style>${leafletCss}
html,body,#map{margin:0;height:100%;background:#0b1c2e}</style></head><body><div id="map"></div><script>${leafletJs.replace(/<\/script/gi, '<\\/script')}</script><script>${script}</script></body></html>`;
}

export default function PinDropSheet({ visible, initialName = '', initialPoint = null, onCancel, onSave }) {
  const insets = useSafeAreaInsets();
  const web = useRef(null);
  const [name, setName] = useState(initialName);
  const [center, setCenter] = useState(null);
  const [start, setStart] = useState(null);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  // Start where the site probably is: its known point, else a recent position (never prompts), else the Atlantic.
  useEffect(() => {
    if (!visible) return undefined;
    let alive = true;
    setName(initialName); setNotice(''); setCenter(null); setSaving(false);
    (async () => {
      if (initialPoint) { if (alive) setStart({ center: [initialPoint.latitude, initialPoint.longitude], zoom: 15 }); return; }
      const permission = await Location.getForegroundPermissionsAsync().catch(() => null);
      const last = permission?.granted ? await Location.getLastKnownPositionAsync({ maxAge: 7 * 24 * 3600 * 1000 }).catch(() => null) : null;
      if (alive) setStart(last ? { center: [last.coords.latitude, last.coords.longitude], zoom: 12 } : { center: [25, -60], zoom: 3 });
    })();
    return () => { alive = false; };
  }, [visible, initialName, initialPoint]);

  const source = useMemo(() => (start ? { html: pinDocument(start.center, start.zoom), baseUrl: 'https://www.dmzscuba.com/' } : null), [start]);

  const locate = async () => {
    setLocating(true); setNotice('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') { setNotice('Location is off. Move the map to the site instead.'); return; }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      web.current?.injectJavaScript(`window.pinReceive && window.pinReceive(${safe({ type: 'goTo', latitude: position.coords.latitude, longitude: position.coords.longitude, zoom: 16 })}); true;`);
    } catch {
      setNotice('Your location is unavailable right now. Move the map to the site instead.');
    } finally { setLocating(false); }
  };

  const zoomedIn = center && center.zoom >= 13;
  const save = async () => {
    if (!name.trim() || !center || saving) return;
    setSaving(true);
    try { await onSave({ name: name.trim(), latitude: center.latitude, longitude: center.longitude }); }
    catch (error) { setNotice(error?.message || 'The site could not be saved.'); setSaving(false); }
  };

  return (
    <Modal animationType="slide" onRequestClose={onCancel} presentationStyle="fullScreen" visible={visible}>
      <View style={styles.screen}>
        {source ? (
          <WebView
            javaScriptEnabled
            onMessage={(event) => { try { const message = JSON.parse(event.nativeEvent.data); if (message.type === 'center') setCenter(message); } catch { /* ignore */ } }}
            onShouldStartLoadWithRequest={(request) => request.url === 'about:blank' || request.url === 'https://www.dmzscuba.com/'}
            originWhitelist={['*']}
            ref={web}
            source={source}
            style={styles.map}
          />
        ) : <View style={[styles.map, styles.loading]}><ActivityIndicator color={colors.cyan} /></View>}
        {/* The pin stays centred; the map moves beneath it. */}
        <View pointerEvents="none" style={styles.pinWrap}>
          <View style={styles.pin}><View style={styles.pinDot} /></View>
          <View style={styles.pinStem} />
        </View>

        <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
          <Pressable accessibilityRole="button" hitSlop={10} onPress={onCancel} style={styles.topButton}><Text style={styles.topButtonText}>Cancel</Text></Pressable>
          <View style={styles.topTitle}><Text style={styles.eyebrow}>MY SITES</Text><Text style={styles.title}>Drop a pin</Text></View>
          <Pressable accessibilityLabel="Use my current location" accessibilityRole="button" disabled={locating} hitSlop={10} onPress={locate} style={styles.topButton}>
            {locating ? <ActivityIndicator color={colors.cyan} /> : <Text style={[styles.topButtonText, styles.locate]}>◎ Me</Text>}
          </Pressable>
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.bottomWrap}>
          <View style={[styles.bottom, { paddingBottom: insets.bottom + spacing.md }]}>
            <Text style={styles.help}>{zoomedIn ? 'Move the map so the pin sits on the entry or mooring.' : 'Zoom in and move the map so the pin sits on the site.'}</Text>
            <TextInput accessibilityLabel="Site name" maxLength={120} onChangeText={setName} placeholder="Site name" placeholderTextColor={colors.faint} returnKeyType="done" style={styles.input} value={name} />
            {center ? <Text style={styles.coords}>{Math.abs(center.latitude).toFixed(5)}°{center.latitude < 0 ? 'S' : 'N'}, {Math.abs(center.longitude).toFixed(5)}°{center.longitude < 0 ? 'W' : 'E'}</Text> : null}
            {notice ? <Text style={styles.notice}>{notice}</Text> : null}
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: !name.trim() || !center || saving }} disabled={!name.trim() || !center || saving} onPress={save} style={({ pressed }) => [styles.save, (!name.trim() || !center || saving) && styles.disabled, pressed && styles.pressed]}>
              <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save to My sites'}</Text>
            </Pressable>
            <Text style={styles.footnote}>Saved on this device. Map © OpenStreetMap contributors.</Text>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  map: { ...StyleSheet.absoluteFillObject },
  loading: { alignItems: 'center', justifyContent: 'center' },
  pinWrap: { alignItems: 'center', left: '50%', marginLeft: -16, position: 'absolute', top: '50%', marginTop: -44, width: 32 },
  pin: { alignItems: 'center', backgroundColor: colors.gold, borderColor: colors.white, borderRadius: 16, borderWidth: 3, height: 32, justifyContent: 'center', width: 32, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 6, shadowOffset: { width: 0, height: 3 } },
  pinDot: { backgroundColor: colors.background, borderRadius: 4, height: 8, width: 8 },
  pinStem: { backgroundColor: colors.white, borderRadius: 1, height: 12, width: 3 },
  top: { alignItems: 'center', backgroundColor: 'rgba(5,11,20,0.92)', flexDirection: 'row', left: 0, paddingBottom: 10, paddingHorizontal: spacing.md, position: 'absolute', right: 0, top: 0 },
  topButton: { justifyContent: 'center', minHeight: 40, minWidth: 64 },
  topButtonText: { color: colors.muted, fontSize: 15, fontWeight: '600' },
  locate: { color: colors.cyan, fontWeight: '800', textAlign: 'right' },
  topTitle: { alignItems: 'center', flex: 1 },
  eyebrow: { color: colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1.8 },
  title: { color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 2 },
  bottomWrap: { bottom: 0, left: 0, position: 'absolute', right: 0 },
  bottom: { backgroundColor: 'rgba(5,11,20,0.96)', borderColor: colors.lineStrong, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, borderTopWidth: 1, gap: 10, padding: spacing.md },
  help: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  input: { backgroundColor: colors.backgroundRaised, borderColor: colors.lineStrong, borderRadius: radii.md, borderWidth: 1, color: colors.text, fontSize: 16, fontWeight: '600', minHeight: 50, paddingHorizontal: 13 },
  coords: { color: colors.faint, fontSize: 12, fontVariant: ['tabular-nums'] },
  notice: { color: colors.warning, fontSize: 12, lineHeight: 17 },
  save: { alignItems: 'center', backgroundColor: colors.gold, borderRadius: radii.md, justifyContent: 'center', minHeight: 50 },
  saveText: { color: colors.background, fontSize: 15, fontWeight: '900' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.8 },
  footnote: { color: colors.faint, fontSize: 10, textAlign: 'center' },
});
