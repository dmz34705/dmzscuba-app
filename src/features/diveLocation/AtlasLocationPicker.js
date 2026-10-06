import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryButton, SecondaryButton } from '../../components/Ui';
import { colors, spacing } from '../../theme';
import { buildAtlasDocument } from '../oceanAtlas/document';
import { safeJson } from '../oceanAtlas/model';
import { manualDiveSite, validDiveCoordinate } from './manualLocation';

export default function AtlasLocationPicker({ initialSite, onCancel, onSelect }) {
  const insets = useSafeAreaInsets();
  const web = useRef(null);
  const ready = useRef(false);
  const [mode, setMode] = useState('site');
  const [selection, setSelection] = useState(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const source = useMemo(() => ({ html: buildAtlasDocument({ locationPicker: true }), baseUrl: 'https://www.dmzscuba.com/' }), []);
  const send = message => web.current?.injectJavaScript(`window.atlasReceive && window.atlasReceive(${safeJson(message)}); true;`);
  const changeMode = next => {
    setMode(next); setSelection(null);
    if (ready.current) send({ type: 'pickerMode', mode: next });
  };
  const onMessage = event => {
    let message;
    try { message = JSON.parse(event.nativeEvent.data); } catch { return; }
    if (message.type === 'ready') {
      ready.current = true; setLoading(false); setError(false);
      send({ type: 'pickerMode', mode });
      if (validDiveCoordinate(initialSite?.latitude, initialSite?.longitude)) {
        send({ type: 'pickerFocus', latitude: initialSite.latitude, longitude: initialSite.longitude });
      }
    } else if (message.type === 'locationPicked') {
      const site = manualDiveSite(message.selection);
      if (site) setSelection(site);
    } else if (message.type === 'back') onCancel();
  };
  const retry = () => { ready.current = false; setError(false); setLoading(true); setReload(n => n + 1); };
  return (
    <Modal animationType="slide" visible onRequestClose={onCancel}>
      <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.controls}>
          <Text accessibilityRole="header" style={styles.title}>Choose dive location</Text>
          <View style={styles.row}>
            <SecondaryButton label="Atlas site" selected={mode === 'site'} onPress={() => changeMode('site')} />
            <SecondaryButton label="Drop pin" selected={mode === 'pin'} onPress={() => changeMode('pin')} />
          </View>
          <Text style={styles.caption}>{mode === 'site' ? 'Search the atlas or tap a named dive site.' : 'Tap the map to place a pin. Tap again to move it.'}</Text>
        </View>
        <View style={styles.map}>
          <WebView key={reload} ref={web} source={source} style={styles.map} originWhitelist={['*']}
            javaScriptEnabled domStorageEnabled={false} allowFileAccess={false} mixedContentMode="never"
            setSupportMultipleWindows={false} scrollEnabled={false} bounces={false} onMessage={onMessage}
            onShouldStartLoadWithRequest={request => request.url === 'about:blank' || request.url === 'https://www.dmzscuba.com/'}
            onError={() => { ready.current = false; setLoading(false); setError(true); }} onContentProcessDidTerminate={retry} />
          {loading || error ? <View style={styles.overlay}>{error
            ? <SecondaryButton label="Retry map" onPress={retry} />
            : <><ActivityIndicator color={colors.cyan} /><Text style={styles.caption}>Opening atlas…</Text></>}</View> : null}
        </View>
        <View style={styles.controls}>
          <Text style={styles.title}>{selection?.name || (selection ? 'Dropped pin' : 'Choose a location')}</Text>
          {selection ? <Text style={styles.caption}>{selection.latitude.toFixed(5)}, {selection.longitude.toFixed(5)}</Text> : null}
          <PrimaryButton label="Use this location" disabled={!selection || loading || error} onPress={() => onSelect(selection)} />
          <SecondaryButton label="Cancel" onPress={onCancel} />
        </View>
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, map: { flex: 1, backgroundColor: colors.background },
  controls: { padding: spacing.md, gap: 8 }, row: { flexDirection: 'row', gap: 8 },
  title: { color: colors.text, fontSize: 17, fontWeight: '700' }, caption: { color: colors.muted, fontSize: 13 },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, gap: 12 },
});
