// Composes a dive into a shareable card: pick a background photo (or use the
// selected style's own gradient), tune the card, then save it to Photos and
// open the native share sheet. A Modal launched from the dive detail screen
// (DiveLogScreen.js), same pattern as its FullscreenProfile.
//
// react-native-view-shot, expo-media-library, and expo-sharing are native
// modules: only require them where they exist (a dev/production build, not
// Expo Go), matching the require()-in-try/catch pattern already used elsewhere
// in this app (diveComputerBle.js, locationLog/) — importing them statically
// would crash the whole screen on a build that predates this feature.

import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, PixelRatio, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';

import { PrimaryButton } from '../../components/Ui';
import useKeyboardOverlap from '../../components/useKeyboardOverlap';
import { colors, radii, spacing } from '../../theme';
import ShareCardControls from './ShareCardControls';
import ShareCardView from './ShareCardView';
import { exportPixelSize, getAspectPreset, getTextScale, resolveStats } from './shareCardOptions';
import useShareCardOptions from './useShareCardOptions';

let MediaLibrary = null;
let Sharing = null;
let captureRef = null;
try {
  // eslint-disable-next-line global-require
  MediaLibrary = require('expo-media-library');
  // eslint-disable-next-line global-require
  Sharing = require('expo-sharing');
  // eslint-disable-next-line global-require
  captureRef = require('react-native-view-shot').captureRef;
} catch {
  MediaLibrary = null;
  Sharing = null;
  captureRef = null;
}

/**
 * @param {object} props
 * @param {object} props.dive  { samples, maxDepthMeters, title, subtitle, depthTop, depthBottom, values, photos }
 * @param {() => void} props.onClose
 */
export default function DiveShareCardScreen({ dive, onClose }) {
  const insets = useSafeAreaInsets();
  // The signature field sits low in the sheet, so the keyboard would cover the
  // very text being typed. Lifting by the overlap shrinks the preview (which
  // fits itself to its box) rather than clipping the card.
  const keyboardOverlap = useKeyboardOverlap();
  const [photoUri, setPhotoUri] = useState(null);
  // Everything except the photo is remembered between dives, so a signature or
  // a favourite style is set once rather than on every share.
  const { applyOptions, loaded, options, setThemeKey, themeKey } = useShareCardOptions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const exportRef = useRef(null);

  // Fit the preview card to the box that's actually left over between the
  // header and the controls, measured at runtime — the card is whichever is
  // smaller, as wide as the box or as tall as it. Nothing is clipped and
  // nothing scrolls, so the whole card is always on screen whatever shape the
  // user picks.
  //
  // Measuring is only trustworthy because nothing above this box is a bare
  // ScrollView: RN bakes flexGrow/flexShrink: 1 into every ScrollView
  // (ScrollView.js baseHorizontal/baseVertical), so a sibling scroll row will
  // silently swallow this column's free height unless it pins flexGrow: 0.
  const [previewBox, setPreviewBox] = useState(null);
  const onPreviewLayout = useCallback((e) => {
    const { width, height } = e.nativeEvent.layout;
    setPreviewBox((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
  }, []);

  const available = MediaLibrary != null && Sharing != null && captureRef != null;

  const aspect = getAspectPreset(options.aspectKey);
  const textScale = getTextScale(options.textKey);
  const stats = useMemo(() => resolveStats(dive.values, options.statKeys), [dive.values, options.statKeys]);

  // 0 until both the box has been measured and the saved settings have
  // arrived — rendering before either would show a card at the wrong size or
  // in the wrong style for a frame, then visibly snap.
  const cardWidth = previewBox && loaded
    ? Math.floor(Math.min(440, previewBox.width, previewBox.height / aspect.ratio))
    : 0;

  // The exported file is captured from a separate, hidden copy of the card at
  // a fixed pixel size, not from the on-screen preview — otherwise the saved
  // image's resolution would be capped by whatever the preview happens to fit
  // on this particular screen.
  const exportPixels = exportPixelSize(options.aspectKey);
  const exportWidth = exportPixels.width / PixelRatio.get();

  const cardProps = {
    themeKey,
    textScale,
    detail: options.detailKey,
    stats,
    title: dive.title,
    subtitle: dive.subtitle,
    samples: dive.samples,
    maxDepthMeters: dive.maxDepthMeters,
    depthTop: dive.depthTop,
    depthBottom: dive.depthBottom,
    showDepthAxis: options.showDepthAxis,
    profileKey: options.profileKey,
    watermark: options.watermark,
    photoUri,
  };

  const pickPhoto = async () => {
    setError('');
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Photo access is needed to choose a background photo.');
      return;
    }
    // No allowsEditing/aspect: on iOS the built-in crop tool is always a
    // square regardless of the requested aspect, which would fight the card's
    // shape — resizeMode="cover" inside the layout frames the full, uncropped
    // photo into whichever shape is selected instead.
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
    if (picked.canceled || !picked.assets?.[0]) return;
    setPhotoUri(picked.assets[0].uri);
  };

  const linkedPhotos = Array.isArray(dive.photos) ? dive.photos : [];
  const pickLinkedPhoto = (uri) => {
    setError('');
    setPhotoUri(uri);
  };

  const saveAndShare = async () => {
    if (!exportRef.current || busy) return;
    setBusy(true);
    setError('');
    try {
      const uri = await captureRef(exportRef, { format: 'jpg', quality: 0.92 });
      // Write-only: this only ever adds the card it just made, never reads the
      // rest of the user's library.
      const permission = await MediaLibrary.requestPermissionsAsync(true);
      if (permission.granted) {
        await MediaLibrary.Asset.create(uri);
      }
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/jpeg', dialogTitle: 'Share dive' });
      }
    } catch (e) {
      setError(e?.message || 'Could not create the share card.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible>
      <View style={[styles.screen, { paddingBottom: keyboardOverlap }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Share this dive</Text>
          <Pressable accessibilityLabel="Done" accessibilityRole="button" hitSlop={8} onPress={onClose}>
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>

        {!available ? (
          <View style={styles.centered}>
            <Text style={styles.body}>Share cards need the full app build (not Expo Go).</Text>
          </View>
        ) : (
          <>
            {/* Takes all the height left over, and the card is sized to fit
                inside it — so there's no scrolling, no clipping, and no dead
                space at any card shape. cardWidth is 0 for the first frame,
                before onLayout has reported this box's size. */}
            <View onLayout={onPreviewLayout} style={styles.previewWrap}>
              {cardWidth > 0 ? (
                <ShareCardView {...cardProps} height={Math.round(cardWidth * aspect.ratio)} width={cardWidth} />
              ) : null}
            </View>

            {/* Off-screen (not hidden via opacity — a 0-opacity view snapshots
                as blank, since the capture reads the actual rendered layer),
                at a fixed pixel size regardless of screen. This is what
                saveAndShare captures; the card above is preview-only.

                It stays mounted rather than being created just for the
                capture: keeping it alive keeps its copy of the photo decoded,
                so captureRef can't race an Image that hasn't painted yet and
                save a card with a blank background. The cost of the second
                copy is small now that ProfileCurve memoizes its geometry. */}
            {loaded ? (
              <View pointerEvents="none" style={styles.offscreenExport}>
                <ShareCardView
                  {...cardProps}
                  height={Math.round(exportWidth * aspect.ratio)}
                  ref={exportRef}
                  width={exportWidth}
                />
              </View>
            ) : null}

            <ShareCardControls
              linkedPhotos={linkedPhotos}
              onClearPhoto={() => setPhotoUri(null)}
              onOptionsChange={applyOptions}
              onPickLinkedPhoto={pickLinkedPhoto}
              onPickPhoto={pickPhoto}
              onThemeChange={setThemeKey}
              options={options}
              photoUri={photoUri}
              statValues={dive.values}
              themeKey={themeKey}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <View style={[styles.actions, { paddingBottom: spacing.lg + (keyboardOverlap > 0 ? 0 : insets.bottom) }]}>
              <PrimaryButton
                disabled={busy}
                label={busy ? 'Working…' : 'Save & Share'}
                onPress={saveAndShare}
                style={styles.actionButton}
              />
              {busy ? <ActivityIndicator color={colors.cyan} style={styles.spinner} /> : null}
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  title: { color: colors.text, fontSize: 18, fontWeight: '900' },
  doneText: { color: colors.cyan, fontSize: 15, fontWeight: '800' },
  centered: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  body: { color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  // marginVertical, not padding: onLayout reports the border box, so padding
  // here would be counted as space the card could use and then clip it.
  previewWrap: { alignItems: 'center', flex: 1, justifyContent: 'center', marginVertical: spacing.sm },
  offscreenExport: { left: -9999, position: 'absolute', top: 0 },
  error: {
    backgroundColor: 'rgba(255,127,127,0.1)',
    borderColor: 'rgba(255,127,127,0.35)',
    borderRadius: radii.sm,
    borderWidth: 1,
    color: colors.danger,
    fontSize: 12,
    lineHeight: 18,
    marginTop: spacing.sm,
    padding: 10,
  },
  actions: {
    backgroundColor: colors.background,
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10,
    marginTop: spacing.sm,
    paddingTop: spacing.md,
  },
  actionButton: { width: '100%' },
  spinner: { marginTop: 4 },
});
