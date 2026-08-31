import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { BOYLES_INTEGRATION_SCRIPT, COLOR_LOSS_INTEGRATION_SCRIPT } from '../lib/demoIntegration';
import { colors, radii, spacing } from '../theme';

const SITE_ORIGIN = 'https://www.dmzscuba.com';

export const DEMOS = {
  'color-loss': {
    integrationScript: COLOR_LOSS_INTEGRATION_SCRIPT,
    title: 'Underwater Color Loss',
    url: `${SITE_ORIGIN}/pages/training/interactive-tools/color-loss-demo`,
  },
  'boyles-law': {
    integrationScript: BOYLES_INTEGRATION_SCRIPT,
    title: "Boyle's Law Balloon Demo",
    url: `${SITE_ORIGIN}/pages/training/interactive-tools/boyles-law-demo?embed=1`,
  },
};

function BackArrow() {
  return <Text style={styles.backArrow}>‹</Text>;
}

export default function WebDemoScreen({ demo, onBack }) {
  const insets = useSafeAreaInsets();
  const webViewRef = useRef(null);
  const [loadError, setLoadError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const retry = useCallback(() => {
    setLoadError(null);
    setReloadKey((value) => value + 1);
  }, []);

  const allowNavigation = useCallback((request) => {
    const { url } = request;

    if (url.startsWith('about:blank') || url.startsWith('blob:')) {
      return true;
    }

    try {
      const destination = new URL(url);
      if (destination.protocol === 'https:' && destination.hostname === 'www.dmzscuba.com') {
        return true;
      }
    } catch {
      return false;
    }

    if (/^(https?:|mailto:|tel:)/i.test(url)) {
      Linking.openURL(url).catch(() => {});
    }

    return false;
  }, []);

  return (
    <View style={styles.screen}>
      <View style={[styles.toolbar, { paddingTop: insets.top + 4 }]}>
        <Pressable
          accessibilityLabel="Back to educational aids"
          accessibilityRole="button"
          hitSlop={10}
          onPress={onBack}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <BackArrow />
        </Pressable>
        <View style={styles.titleWrap}>
          <Text style={styles.eyebrow}>DMZ SCUBA INTERACTIVE</Text>
          <Text numberOfLines={1} style={styles.title}>{demo.title}</Text>
        </View>
        <View style={styles.livePill}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
      </View>

      <View style={[styles.demoArea, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <WebView
          key={`${demo.url}-${reloadKey}`}
          ref={webViewRef}
          allowsBackForwardNavigationGestures
          allowsInlineMediaPlayback
          applicationNameForUserAgent="DMZScubaApp/1.0"
          cacheEnabled
          contentInsetAdjustmentBehavior="never"
          decelerationRate="normal"
          domStorageEnabled
          injectedJavaScriptBeforeContentLoaded={demo.integrationScript}
          javaScriptCanOpenWindowsAutomatically={false}
          javaScriptEnabled
          mediaCapturePermissionGrantType="grantIfSameHostElsePrompt"
          mediaPlaybackRequiresUserAction={false}
          mixedContentMode="never"
          onContentProcessDidTerminate={() => webViewRef.current?.reload()}
          onError={({ nativeEvent }) => setLoadError(nativeEvent.description || 'The demo could not be loaded.')}
          onHttpError={({ nativeEvent }) => {
            if (nativeEvent.statusCode >= 400 && nativeEvent.url.startsWith(demo.url.split('?')[0])) {
              setLoadError(`The demo server returned ${nativeEvent.statusCode}.`);
            }
          }}
          onLoadStart={() => setLoadError(null)}
          onShouldStartLoadWithRequest={allowNavigation}
          pullToRefreshEnabled
          renderLoading={() => (
            <View style={styles.loading}>
              <ActivityIndicator color={colors.cyan} size="large" />
              <Text style={styles.loadingTitle}>Loading the full interactive demo</Text>
              <Text style={styles.loadingBody}>Connecting to DMZScuba.com…</Text>
            </View>
          )}
          setSupportMultipleWindows={false}
          source={{ uri: demo.url }}
          startInLoadingState
          style={styles.webView}
        />

        {loadError && (
          <View style={[styles.error, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
            <Text style={styles.errorKicker}>CONNECTION NEEDED</Text>
            <Text style={styles.errorTitle}>We couldn’t load this demo.</Text>
            <Text style={styles.errorBody}>{loadError} Check your connection and try again.</Text>
            <Pressable accessibilityRole="button" onPress={retry} style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#00141F', flex: 1 },
  demoArea: { flex: 1 },
  toolbar: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 52,
    paddingBottom: 5,
    paddingHorizontal: 10,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.lineStrong,
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  backArrow: { color: colors.text, fontSize: 30, fontWeight: '300', lineHeight: 32, marginLeft: -1, marginTop: -3 },
  titleWrap: { flex: 1, paddingHorizontal: 9 },
  eyebrow: { color: colors.cyan, fontSize: 8, fontWeight: '900', letterSpacing: 1.5 },
  title: { color: colors.text, fontSize: 14, fontWeight: '800', marginTop: 1 },
  livePill: {
    alignItems: 'center',
    backgroundColor: 'rgba(112, 226, 163, 0.08)',
    borderColor: 'rgba(112, 226, 163, 0.35)',
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
  liveDot: { backgroundColor: colors.good, borderRadius: 4, height: 6, marginRight: 5, width: 6 },
  liveText: { color: colors.good, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  webView: { backgroundColor: '#00141F', flex: 1 },
  loading: {
    alignItems: 'center',
    backgroundColor: '#00141F',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    padding: spacing.xl,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  loadingTitle: { color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 16 },
  loadingBody: { color: colors.muted, fontSize: 12, marginTop: 5 },
  error: {
    alignItems: 'center',
    backgroundColor: colors.background,
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    padding: spacing.xl,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  errorKicker: { color: colors.danger, fontSize: 10, fontWeight: '900', letterSpacing: 1.8 },
  errorTitle: { color: colors.text, fontSize: 24, fontWeight: '900', marginTop: 9, textAlign: 'center' },
  errorBody: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 9, maxWidth: 340, textAlign: 'center' },
  retryButton: { backgroundColor: colors.accent, borderRadius: radii.md, marginTop: 20, paddingHorizontal: 26, paddingVertical: 13 },
  retryText: { color: colors.white, fontSize: 14, fontWeight: '800' },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
});
