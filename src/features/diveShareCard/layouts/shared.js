// The parts every theme layout needs but shouldn't each reinvent: a metrics
// helper that keeps type legible at any output size, the background stack
// (photo or gradient, tint, scrim), and the depth axis.
//
// What a theme still owns for itself is everything visual — palette, card
// shape, which ProfileCurve variant it draws, how it arranges its stats.

import { Image, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * Sizes derived from the card's own dimensions, so a layout never hardcodes a
 * point size. Type keys off `width` (a story card is taller, not wordier, so
 * scaling text off height would make it enormous) while the chart keys off
 * both — a 9:16 card has height to spare, a 1:1 card doesn't.
 *
 * @param {number} width
 * @param {number} height
 * @param {number} [textScale]   from shareCardOptions.getTextScale
 * @param {number} [padFraction] a theme with roomier margins overrides this
 */
export function cardMetrics(width, height, textScale = 1, padFraction = 0.055) {
  const pad = Math.round(width * padFraction);
  return {
    pad,
    contentWidth: width - pad * 2,
    // Floors, not just fractions: below ~9pt the labels stopped being
    // readable on a real phone even though the ratio "looked right" in the
    // numbers. The floor wins on small cards, the fraction on large ones.
    type: (fraction, floor) => Math.max(floor, width * fraction) * textScale,
    chartHeight: Math.round(Math.min(height * 0.2, width * 0.3)),
  };
}

/**
 * Photo or gradient, plus the theme's colour cast and its bottom scrim, as one
 * absolutely-positioned stack behind the card content.
 *
 * @param {object} props
 * @param {string} [props.photoUri]     when absent, `gradient` is the background
 * @param {string[]} props.gradient     theme gradient stops
 * @param {string} [props.tint]         colour cast over the whole frame
 * @param {string[]} props.scrim        bottom fade stops, transparent → opaque
 * @param {number[]} [props.scrimStops]
 * @param {number} props.scrimHeight
 */
export function CardBackground({ photoUri, gradient, tint, scrim, scrimStops, scrimHeight }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {photoUri ? (
        <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <LinearGradient colors={gradient} end={{ x: 1, y: 1 }} start={{ x: 0, y: 0 }} style={StyleSheet.absoluteFill} />
      )}
      {/* The cast only earns its keep over a photo — over the theme's own
          gradient it would just mud the colour it is meant to signal. */}
      {tint && photoUri ? <View style={[StyleSheet.absoluteFill, { backgroundColor: tint }]} /> : null}
      <LinearGradient colors={scrim} locations={scrimStops} style={[styles.scrim, { height: scrimHeight }]} />
    </View>
  );
}

/**
 * The vertical depth scale that runs alongside the profile curve: surface at
 * the top, max depth at the bottom, bracketed like a measuring rule. Sits in
 * its own column so the curve's own width shrinks to make room rather than
 * the labels overlapping the trace.
 *
 * @param {object} props
 * @param {number} props.width
 * @param {number} props.height
 * @param {string} props.color
 * @param {number} props.fontSize
 * @param {string} props.top      e.g. "0 ft"
 * @param {string} props.bottom   e.g. "36.9 ft"
 */
export function DepthAxis({ width, height, color, fontSize, top, bottom }) {
  const rule = Math.max(1, width * 0.02);
  return (
    <View style={[styles.axis, { width, height }]}>
      <View style={[styles.axisRule, { backgroundColor: color, width: rule, opacity: 0.5 }]} />
      <View style={[styles.axisTick, { backgroundColor: color, height: rule, top: 0 }]} />
      <View style={[styles.axisTick, { backgroundColor: color, height: rule, bottom: 0 }]} />
      <Text numberOfLines={1} style={[styles.axisLabel, { color, fontSize, top: -fontSize * 0.15 }]}>{top}</Text>
      <Text numberOfLines={1} style={[styles.axisLabel, { color, fontSize, bottom: -fontSize * 0.15 }]}>{bottom}</Text>
    </View>
  );
}

/**
 * How wide the depth axis column needs to be for its labels, or 0 when the
 * axis is off — layouts subtract this from the curve's width.
 */
export function depthAxisWidth(cardWidth, enabled) {
  return enabled ? Math.max(42, Math.round(cardWidth * 0.15)) : 0;
}

const styles = StyleSheet.create({
  scrim: { bottom: 0, left: 0, position: 'absolute', right: 0 },
  axis: { justifyContent: 'space-between' },
  axisRule: { bottom: 0, left: 0, position: 'absolute', top: 0 },
  axisTick: { left: 0, position: 'absolute', width: '38%' },
  axisLabel: { fontVariant: ['tabular-nums'], fontWeight: '700', left: '42%', letterSpacing: 0.2, position: 'absolute' },
});
