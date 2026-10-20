// A full-width pad for signing with a finger. Strokes are recorded in pad
// units (0..1 of the pad's width on both axes) so the signature is
// resolution-free: the overlay redraws it at whatever size its slot allows.
//
// Rendered as an overlay inside the share screen's own Modal rather than as a
// second Modal, so there is no nested presentation to go wrong.

import { useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { PrimaryButton, SecondaryButton } from '../../components/Ui';
import { colors, radii, spacing } from '../../theme';
import { MAX_SIGNATURE_POINTS, MAX_SIGNATURE_STROKES, SIGNATURE_PAD_RATIO, signaturePath, thinStroke } from './photoOverlayOptions';

/**
 * @param {object} props
 * @param {number} props.width             available width for the pad
 * @param {Array}  props.initialStrokes
 * @param {(strokes: Array) => void} props.onSave
 * @param {() => void} props.onCancel
 */
export default function SignaturePad({ width, initialStrokes = [], onSave, onCancel }) {
  const padWidth = Math.max(200, width);
  const padHeight = Math.round(padWidth * SIGNATURE_PAD_RATIO);
  const [strokes, setStrokes] = useState(() => initialStrokes.map((stroke) => stroke.slice()));
  const live = useRef(null);
  const sizeRef = useRef(padWidth);
  sizeRef.current = padWidth;

  const pointCount = strokes.reduce((sum, stroke) => sum + stroke.length, 0);
  const full = strokes.length >= MAX_SIGNATURE_STROKES || pointCount >= MAX_SIGNATURE_POINTS;
  const fullRef = useRef(full);
  fullRef.current = full;

  const responder = useMemo(() => {
    const at = (evt) => {
      const w = sizeRef.current;
      const { locationX, locationY } = evt.nativeEvent;
      return [
        Math.min(1, Math.max(0, locationX / w)),
        Math.min(SIGNATURE_PAD_RATIO, Math.max(0, locationY / w)),
      ];
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => !fullRef.current,
      onMoveShouldSetPanResponder: () => !fullRef.current,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (evt) => {
        live.current = [at(evt)];
        setStrokes((current) => [...current, live.current.slice()]);
      },
      onPanResponderMove: (evt) => {
        if (!live.current) return;
        live.current.push(at(evt));
        const stroke = live.current.slice();
        setStrokes((current) => [...current.slice(0, -1), stroke]);
      },
      onPanResponderRelease: () => {
        if (!live.current) return;
        const stroke = thinStroke(live.current);
        live.current = null;
        setStrokes((current) => [...current.slice(0, -1), stroke]);
      },
      onPanResponderTerminate: () => { live.current = null; },
    });
  }, []);

  const d = signaturePath(strokes, padWidth);

  return (
    <View style={styles.backdrop}>
      <View style={styles.sheet}>
        <Text style={styles.title}>Sign with your finger</Text>
        <Text style={styles.body}>Saved on this phone and reused on every photo. It takes the style’s colour on the photo.</Text>
        <View style={[styles.pad, { height: padHeight, width: padWidth }]} {...responder.panHandlers}>
          <View pointerEvents="none" style={[styles.baseline, { top: padHeight * 0.72 }]} />
          <Svg height={padHeight} pointerEvents="none" style={StyleSheet.absoluteFill} width={padWidth}>
            <Path d={d} fill="none" stroke={colors.white} strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} />
          </Svg>
          {!strokes.length ? (
            <Text pointerEvents="none" style={[styles.placeholder, { top: padHeight * 0.72 - 26 }]}>Sign here</Text>
          ) : null}
        </View>
        <View style={styles.row}>
          <Pressable
            accessibilityRole="button"
            disabled={!strokes.length}
            onPress={() => setStrokes((current) => current.slice(0, -1))}
            style={[styles.textButton, !strokes.length && styles.disabled]}
          >
            <Text style={styles.textButtonLabel}>Undo</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={!strokes.length}
            onPress={() => setStrokes([])}
            style={[styles.textButton, !strokes.length && styles.disabled]}
          >
            <Text style={styles.textButtonLabel}>Clear</Text>
          </Pressable>
        </View>
        <View style={styles.actions}>
          <SecondaryButton label="Cancel" onPress={onCancel} style={styles.action} />
          <PrimaryButton disabled={!strokes.length} label="Use signature" onPress={() => onSave(strokes)} style={styles.action} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(2,6,11,0.92)',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  sheet: { gap: spacing.sm },
  title: { color: colors.text, fontSize: 18, fontWeight: '900' },
  body: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  pad: {
    backgroundColor: colors.surface,
    borderColor: colors.lineStrong,
    borderRadius: radii.md,
    borderWidth: 1,
    marginTop: spacing.sm,
    overflow: 'hidden',
  },
  baseline: { backgroundColor: colors.line, height: 1, left: spacing.lg, position: 'absolute', right: spacing.lg },
  placeholder: { color: colors.faint, fontSize: 13, fontWeight: '700', left: spacing.lg, position: 'absolute' },
  row: { flexDirection: 'row', gap: spacing.lg, justifyContent: 'flex-end' },
  textButton: { paddingVertical: 6 },
  textButtonLabel: { color: colors.cyan, fontSize: 14, fontWeight: '800' },
  disabled: { opacity: 0.35 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  action: { flex: 1 },
});
