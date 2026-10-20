// Touch handling for framing the photo in the preview: one finger drags the
// photo, two fingers pinch to zoom around the point between them. Built on
// PanResponder rather than a gesture library so it needs no new native module.
//
// The crop itself lives in the parent; this only turns touches into the next
// crop and hands it up, already clamped (normalizeCrop) so the photo can never
// be dragged off the frame.

import { useMemo, useRef } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';

import { MAX_FREE_RATIO, MAX_ZOOM, MIN_FREE_RATIO, normalizeCrop } from './photoOverlayOptions';

function touchPoints(evt) {
  const touches = evt.nativeEvent.touches || [];
  return touches.map((t) => ({ x: t.pageX, y: t.pageY }));
}

/**
 * @param {object} props
 * @param {boolean} props.enabled
 * @param {object} props.crop
 * @param {(crop: object) => void} props.onCropChange
 * @param {{ width: number, height: number }} props.photoSize
 * @param {number} props.frameWidth
 * @param {number} props.frameHeight
 */
export default function CropSurface({ enabled, crop, onCropChange, photoSize, frameWidth, frameHeight, children }) {
  const viewRef = useRef(null);
  const latest = useRef({});
  latest.current = { crop, onCropChange, photoSize, frameWidth, frameHeight, enabled };
  // Page position of the frame, for pinching around the fingers' midpoint.
  const origin = useRef(null);
  const gesture = useRef(null);

  const responder = useMemo(() => {
    const baseline = (points) => {
      const { crop: c } = latest.current;
      if (points.length >= 2) {
        const [a, b] = points;
        gesture.current = {
          kind: 'pinch',
          zoom: c.zoom,
          panX: c.panX,
          panY: c.panY,
          distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
          mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        };
      } else if (points.length === 1) {
        gesture.current = { kind: 'pan', panX: c.panX, panY: c.panY, start: points[0] };
      } else {
        gesture.current = null;
      }
    };

    const move = (evt) => {
      const points = touchPoints(evt);
      const g = gesture.current;
      const wantKind = points.length >= 2 ? 'pinch' : 'pan';
      // A finger landing or lifting mid-gesture restarts from where the photo
      // is now, so it never jumps.
      if (!g || g.kind !== wantKind) {
        baseline(points);
        return;
      }
      const { crop: c, onCropChange: emit, photoSize: size, frameWidth: w, frameHeight: h } = latest.current;
      if (!w || !size) return;
      if (g.kind === 'pan') {
        const p = points[0];
        emit(normalizeCrop({
          ...c,
          panX: g.panX + (p.x - g.start.x) / w,
          panY: g.panY + (p.y - g.start.y) / w,
        }, size, w));
        return;
      }
      const [a, b] = points;
      const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const zoom = Math.min(MAX_ZOOM, Math.max(1, g.zoom * (distance / g.distance)));
      const ratio = zoom / g.zoom;
      // Keep the photo point under the fingers' starting midpoint under them:
      // offset' = ratio * offset + (1 - ratio) * pivot, then follow the
      // midpoint as it moves. All in frame-width units.
      const pivot = origin.current
        ? { x: (g.mid.x - origin.current.x - w / 2) / w, y: (g.mid.y - origin.current.y - h / 2) / w }
        : { x: 0, y: 0 };
      emit(normalizeCrop({
        ...c,
        zoom,
        panX: ratio * g.panX + (1 - ratio) * pivot.x + (mid.x - g.mid.x) / w,
        panY: ratio * g.panY + (1 - ratio) * pivot.y + (mid.y - g.mid.y) / w,
      }, size, w));
    };

    return PanResponder.create({
      onStartShouldSetPanResponder: () => latest.current.enabled,
      onMoveShouldSetPanResponder: () => latest.current.enabled,
      // Holding on to the gesture keeps the page sheet from reading a
      // downward drag of the photo as "dismiss".
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (evt) => {
        viewRef.current?.measure?.((x, y, w, h, pageX, pageY) => {
          if (Number.isFinite(pageX) && Number.isFinite(pageY)) origin.current = { x: pageX, y: pageY };
        });
        baseline(touchPoints(evt));
      },
      onPanResponderMove: move,
      onPanResponderRelease: () => { gesture.current = null; },
      onPanResponderTerminate: () => { gesture.current = null; },
    });
  }, []);

  return (
    <View collapsable={false} ref={viewRef} {...responder.panHandlers}>
      {children}
    </View>
  );
}

/**
 * The corner handle that reshapes a "Free" crop: drag it out or in and the
 * frame's proportions follow the finger.
 */
export function FreeRatioHandle({ ratio, frameWidth, frameHeight, onRatioChange }) {
  const latest = useRef({});
  latest.current = { ratio, frameWidth, frameHeight, onRatioChange };
  const start = useRef(null);

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
    onPanResponderGrant: () => {
      const { frameWidth: w, frameHeight: h } = latest.current;
      start.current = { w, h };
    },
    onPanResponderMove: (evt, gs) => {
      if (!start.current) return;
      const w = Math.max(20, start.current.w + gs.dx);
      const h = Math.max(20, start.current.h + gs.dy);
      const next = Math.min(MAX_FREE_RATIO, Math.max(MIN_FREE_RATIO, h / w));
      latest.current.onRatioChange(next);
    },
    onPanResponderRelease: () => { start.current = null; },
    onPanResponderTerminate: () => { start.current = null; },
  }), []);

  return (
    <View
      accessibilityLabel="Drag to reshape the crop"
      hitSlop={14}
      style={styles.handle}
      {...responder.panHandlers}
    >
      <View style={styles.handleArmH} />
      <View style={styles.handleArmV} />
    </View>
  );
}

const ARM = 22;
const THICK = 4;
const styles = StyleSheet.create({
  handle: { bottom: -THICK / 2, height: ARM + 10, position: 'absolute', right: -THICK / 2, width: ARM + 10 },
  handleArmH: { backgroundColor: '#FFFFFF', borderRadius: 2, bottom: 0, height: THICK, position: 'absolute', right: 0, width: ARM },
  handleArmV: { backgroundColor: '#FFFFFF', borderRadius: 2, bottom: 0, height: ARM, position: 'absolute', right: 0, width: THICK },
});
