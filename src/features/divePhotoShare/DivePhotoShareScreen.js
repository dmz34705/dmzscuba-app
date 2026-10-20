// Shares one dive photo with the dive laid over it: a small profile with a pin
// where the photo was taken, the info the user picked, and their signature.
// Opened from a photo in the dive's photo viewer (DiveLogScreen.js).
//
// Laid out like a photo editor: a slim top bar, the photo filling everything
// between it and a compact tool strip at the bottom. Its own full-screen Modal,
// presented over the viewer's — drawn as a plain view inside the viewer it
// only covered part of the window.
//
// Capture follows diveShareCard/DiveShareCardScreen.js: an off-screen copy at a
// fixed pixel size is what actually gets saved, and the same native-module
// guard applies (view-shot, media library, and sharing only exist in a full
// build).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, PixelRatio, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import useKeyboardOverlap from '../../components/useKeyboardOverlap';
import { colors, radii, spacing } from '../../theme';
import CropSurface, { FreeRatioHandle } from './CropSurface';
import PhotoOverlayCard from './PhotoOverlayCard';
import PhotoOverlayControls from './PhotoOverlayControls';
import SignaturePad from './SignaturePad';
import {
  canRedo,
  canUndo,
  createHistory,
  currentSnapshot,
  recordHistory,
  redoHistory,
  sameSnapshot,
  undoHistory,
} from './editHistory';
import {
  DEFAULT_CROP,
  cropFrameRatio,
  initialPinMode,
  normalizeCrop,
  overlayExportPixelSize,
  profileSpan,
  resolveInfoLines,
  resolvePin,
} from './photoOverlayOptions';
import usePhotoOverlayOptions from './usePhotoOverlayOptions';

const CANVAS_MARGIN = 12;
// How long the editor waits after the last change before recording it, so a
// drag, pinch, slider sweep, or typed word is one undo step.
const HISTORY_SETTLE_MS = 350;

// A curved arrow; mirrored for redo.
function HistoryIcon({ redo, color }) {
  return (
    <Svg height={22} style={redo ? styles.mirrored : null} viewBox="0 0 24 24" width={22}>
      <Path d="M9 5 L4 10 L9 15" fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
      <Path d="M4 10 H14 C18 10 20 12.5 20 15.5 C20 18.5 18 20 15 20 H11" fill="none" stroke={color} strokeLinecap="round" strokeWidth={2} />
    </Svg>
  );
}

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
 * @param {{ uri: string }} props.photo
 * @param {object} props.dive
 * @param {Array}  props.dive.samples
 * @param {number} [props.dive.maxDepthMeters]
 * @param {number|null} props.dive.photoSeconds   capture time as seconds into the dive, or null
 * @param {string} [props.dive.siteName]
 * @param {string} [props.dive.location]
 * @param {string} [props.dive.dateLabel]
 * @param {(meters: number) => string} props.dive.formatDepth
 * @param {(seconds: number) => string} props.dive.formatElapsed
 * @param {() => void} props.onClose
 */
export default function DivePhotoShareScreen({ photo, dive, onClose }) {
  const insets = useSafeAreaInsets();
  const keyboardOverlap = useKeyboardOverlap();
  const { applyOptions, loaded, options } = usePhotoOverlayOptions();
  const [tool, setTool] = useState('crop');
  const [photoSize, setPhotoSize] = useState(null);
  const [crop, setCrop] = useState(DEFAULT_CROP);
  const [pinMode, setPinMode] = useState(() => initialPinMode(dive.photoSeconds));
  const [manualSeconds, setManualSeconds] = useState(null);
  const [signing, setSigning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState(false);
  const exportRef = useRef(null);

  const available = MediaLibrary != null && Sharing != null && captureRef != null;

  useEffect(() => {
    let active = true;
    Image.getSize(
      photo.uri,
      (width, height) => { if (active) setPhotoSize({ width, height }); },
      () => { if (active) setLoadError(true); },
    );
    return () => { active = false; };
  }, [photo.uri]);

  const [previewBox, setPreviewBox] = useState(null);
  const onPreviewLayout = useCallback((e) => {
    const { width, height } = e.nativeEvent.layout;
    setPreviewBox((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
  }, []);

  const ratio = photoSize ? cropFrameRatio(crop, photoSize) : 1;
  const ready = !!(previewBox && photoSize && loaded);
  // A small margin keeps the crop edge (and the Free handle) clear of the
  // screen edge, where iOS would read a drag as a system gesture.
  const frameWidth = ready
    ? Math.max(0, Math.floor(Math.min(previewBox.width - CANVAS_MARGIN * 2, (previewBox.height - CANVAS_MARGIN * 2) / ratio)))
    : 0;
  const frameHeight = Math.round(frameWidth * ratio);

  const exportPixels = overlayExportPixelSize(ratio);
  const exportWidth = exportPixels.width / PixelRatio.get();
  const exportHeight = exportPixels.height / PixelRatio.get();

  const span = useMemo(() => profileSpan(dive.samples), [dive.samples]);
  const hasProfile = !!span;
  // Where the photo was taken, whether or not the pin is drawn — the depth and
  // time in the info corner come from here, so hiding the pin doesn't also
  // blank them.
  const moment = useMemo(() => resolvePin({
    pinMode: pinMode === 'off' ? (manualSeconds != null ? 'manual' : 'auto') : pinMode,
    manualSeconds,
    photoSeconds: dive.photoSeconds,
    samples: dive.samples,
  }), [pinMode, manualSeconds, dive.photoSeconds, dive.samples]);
  const pin = pinMode === 'off' ? null : moment;

  const infoValues = useMemo(() => ({
    site: dive.siteName || null,
    location: dive.location || null,
    depth: moment ? dive.formatDepth(moment.depthMeters) : null,
    elapsed: moment ? `${dive.formatElapsed(Math.max(0, moment.seconds))} in` : null,
    date: dive.dateLabel || null,
  }), [dive, moment]);
  const infoLines = useMemo(() => resolveInfoLines(infoValues, options.infoKeys), [infoValues, options.infoKeys]);

  const changeCrop = useCallback((patch) => {
    setCrop((current) => normalizeCrop({ ...current, ...patch }, photoSize));
  }, [photoSize]);
  const replaceCrop = useCallback((next) => setCrop(next), []);
  const resetCrop = useCallback(() => setCrop(DEFAULT_CROP), []);

  const movePin = useCallback((seconds) => {
    setManualSeconds(seconds);
    setPinMode('manual');
  }, []);
  const changePinMode = useCallback((mode) => {
    if (mode === 'manual' && manualSeconds == null && span) {
      // Turned on with nowhere to go (no capture time): start mid-dive, where
      // there is curve on both sides to drag it along.
      setManualSeconds((span.start + span.end) / 2);
    }
    if (mode === 'auto') setManualSeconds(null);
    setPinMode(mode);
  }, [manualSeconds, span]);

  // Undo/redo. Everything the user can change goes in one snapshot; a change
  // is recorded once things have been still for HISTORY_SETTLE_MS.
  const snapshot = useMemo(
    () => ({ crop, pinMode, manualSeconds, options }),
    [crop, pinMode, manualSeconds, options],
  );
  const [history, setHistory] = useState(null);
  useEffect(() => {
    // Start only once the saved settings have loaded, or the first undo would
    // jump back to the defaults.
    if (!loaded) return undefined;
    if (!history) {
      setHistory(createHistory(snapshot));
      return undefined;
    }
    const timer = setTimeout(() => setHistory((h) => recordHistory(h, snapshot)), HISTORY_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [loaded, history, snapshot]);
  // A change still inside its settle window counts as undoable already.
  const unsettled = !!history && !sameSnapshot(currentSnapshot(history), snapshot);
  const undoable = !!history && (unsettled || canUndo(history));
  const redoable = !!history && !unsettled && canRedo(history);

  const restore = useCallback((next) => {
    const target = currentSnapshot(next);
    setHistory(next);
    setCrop(target.crop);
    setPinMode(target.pinMode);
    setManualSeconds(target.manualSeconds);
    applyOptions(target.options);
  }, [applyOptions]);
  const undo = () => {
    if (!undoable) return;
    // Settle the in-flight change first, so undo steps back to before it.
    restore(undoHistory(recordHistory(history, snapshot)));
  };
  const redo = () => {
    if (redoable) restore(redoHistory(history));
  };

  const cardProps = {
    photoUri: photo.uri,
    photoSize,
    crop,
    options,
    samples: dive.samples,
    maxDepthMeters: dive.maxDepthMeters,
    pin,
    infoLines,
  };

  const saveAndShare = async () => {
    if (!exportRef.current || busy) return;
    setBusy(true);
    setError('');
    try {
      const uri = await captureRef(exportRef, { format: 'jpg', quality: 0.95 });
      // Write-only: this only ever adds the image it just made.
      const permission = await MediaLibrary.requestPermissionsAsync(true);
      if (permission.granted) {
        await MediaLibrary.Asset.create(uri);
      }
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/jpeg', dialogTitle: 'Share photo' });
      }
    } catch (e) {
      setError(e?.message || 'Could not create the photo.');
    } finally {
      setBusy(false);
    }
  };

  const cropping = tool === 'crop';

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen" statusBarTranslucent visible>
      <View style={[styles.screen, { paddingBottom: keyboardOverlap }]}>
        <View style={[styles.topBar, { paddingTop: insets.top + 6 }]}>
          <Pressable accessibilityLabel="Close" accessibilityRole="button" hitSlop={10} onPress={onClose}>
            <Text style={styles.close}>Close</Text>
          </Pressable>
          <View style={styles.historyButtons}>
            <Pressable
              accessibilityLabel="Undo"
              accessibilityRole="button"
              accessibilityState={{ disabled: !undoable }}
              disabled={!undoable}
              hitSlop={8}
              onPress={undo}
              style={styles.historyButton}
            >
              <HistoryIcon color={undoable ? colors.text : colors.faint} />
            </Pressable>
            <Pressable
              accessibilityLabel="Redo"
              accessibilityRole="button"
              accessibilityState={{ disabled: !redoable }}
              disabled={!redoable}
              hitSlop={8}
              onPress={redo}
              style={styles.historyButton}
            >
              <HistoryIcon color={redoable ? colors.text : colors.faint} redo />
            </Pressable>
          </View>
          <Pressable
            accessibilityLabel="Save and share"
            accessibilityRole="button"
            disabled={busy || !ready || !available}
            hitSlop={10}
            onPress={saveAndShare}
            style={[styles.shareButton, (busy || !ready || !available) && styles.shareButtonDisabled]}
          >
            {busy ? <ActivityIndicator color={colors.black} size="small" /> : <Text style={styles.shareLabel}>Share</Text>}
          </Pressable>
        </View>

        {/* Everything between the bars; the photo is fitted inside it. */}
        <View onLayout={onPreviewLayout} style={styles.canvas}>
          {!available ? (
            <Text style={styles.body}>Photo sharing needs the full app build (not Expo Go).</Text>
          ) : loadError ? (
            <Text style={styles.body}>Couldn’t open this photo. It may have been removed from the phone.</Text>
          ) : frameWidth > 0 ? (
            <View style={{ height: frameHeight, width: frameWidth }}>
              <CropSurface
                crop={crop}
                enabled={cropping}
                frameHeight={frameHeight}
                frameWidth={frameWidth}
                onCropChange={replaceCrop}
                photoSize={photoSize}
              >
                <PhotoOverlayCard {...cardProps} height={frameHeight} showGuides={cropping} width={frameWidth} />
              </CropSurface>
              {cropping && crop.aspectKey === 'free' ? (
                <FreeRatioHandle
                  frameHeight={frameHeight}
                  frameWidth={frameWidth}
                  onRatioChange={(next) => changeCrop({ freeRatio: next })}
                  ratio={ratio}
                />
              ) : null}
            </View>
          ) : (
            <ActivityIndicator color={colors.cyan} />
          )}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        {/* Off-screen (not 0-opacity, which snapshots blank) at a fixed pixel
            size whatever the screen; this is what saveAndShare captures. Kept
            mounted so its photo is already decoded at capture time. */}
        {ready && available ? (
          <View pointerEvents="none" style={styles.offscreenExport}>
            <PhotoOverlayCard {...cardProps} height={exportHeight} ref={exportRef} width={exportWidth} />
          </View>
        ) : null}

        <PhotoOverlayControls
          bottomInset={keyboardOverlap > 0 ? 0 : insets.bottom}
          crop={crop}
          hasPhotoTime={Number.isFinite(dive.photoSeconds)}
          hasProfile={hasProfile}
          infoValues={infoValues}
          onCropChange={changeCrop}
          onCropReset={resetCrop}
          onDrawSignature={() => setSigning(true)}
          onOptionsChange={applyOptions}
          onPinModeChange={changePinMode}
          onPinMove={movePin}
          onToolChange={setTool}
          options={options}
          pinMode={pinMode}
          pinSeconds={moment ? moment.seconds : null}
          span={span}
          tool={tool}
        />

        {signing ? (
          <SignaturePad
            initialStrokes={options.signatureStrokes}
            onCancel={() => {
              setSigning(false);
              if (!options.signatureStrokes.length && options.signatureMode === 'drawn') applyOptions({ signatureMode: 'off' });
            }}
            onSave={(strokes) => {
              applyOptions({ signatureMode: 'drawn', signatureStrokes: strokes });
              setSigning(false);
            }}
            width={(previewBox?.width || 320) - spacing.lg * 2}
          />
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#000', flex: 1 },
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 8,
    paddingHorizontal: spacing.md,
  },
  close: { color: colors.text, fontSize: 16, fontWeight: '700' },
  historyButtons: { flexDirection: 'row', gap: spacing.md },
  historyButton: { alignItems: 'center', height: 36, justifyContent: 'center', width: 40 },
  mirrored: { transform: [{ scaleX: -1 }] },
  shareButton: {
    alignItems: 'center',
    backgroundColor: colors.cyan,
    borderRadius: radii.pill,
    justifyContent: 'center',
    minWidth: 76,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  shareButtonDisabled: { opacity: 0.45 },
  shareLabel: { color: colors.black, fontSize: 15, fontWeight: '900' },
  // No padding: onLayout reports the border box, and the photo is fitted to
  // exactly what it reports.
  canvas: { alignItems: 'center', flex: 1, justifyContent: 'center', overflow: 'hidden' },
  body: { color: colors.muted, fontSize: 13, lineHeight: 19, paddingHorizontal: spacing.xl, textAlign: 'center' },
  offscreenExport: { left: -9999, position: 'absolute', top: 0 },
  error: {
    backgroundColor: 'rgba(40,8,8,0.9)',
    borderRadius: radii.sm,
    bottom: spacing.sm,
    color: colors.danger,
    fontSize: 12,
    left: spacing.md,
    lineHeight: 18,
    padding: 10,
    position: 'absolute',
    right: spacing.md,
  },
});
