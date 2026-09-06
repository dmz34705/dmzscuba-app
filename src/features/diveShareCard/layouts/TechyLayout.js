// Dive-computer HUD aesthetic: corner brackets like a viewfinder reticle, a
// glowing readout-style profile line, hairline dividers between stats like an
// instrument panel, tabular numerals, bracketed labels.

import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import ProfileCurve from './ProfileCurve';
import { CardBackground, DepthAxis, cardMetrics, depthAxisWidth } from './shared';

const ACCENT = '#39FFE0';
const INK = '#020A0F';
const RULE = 'rgba(57,255,224,0.28)';
const SCRIM = ['rgba(2,10,15,0)', 'rgba(2,15,20,0.55)', 'rgba(2,10,15,0.6)', 'rgba(1,6,9,0.97)'];

function CornerBracket({ size, thickness, style }) {
  return (
    <View style={[{ width: size, height: size }, style]}>
      <View style={[styles.bracketH, { width: size, height: thickness, backgroundColor: ACCENT }]} />
      <View style={[styles.bracketV, { height: size, width: thickness, backgroundColor: ACCENT }]} />
    </View>
  );
}

function Stat({ label, value, valueSize, labelSize, divider, isLast }) {
  return (
    <View style={[styles.stat, !isLast && { borderRightWidth: divider, borderRightColor: RULE }]}>
      <Text numberOfLines={1} style={[styles.statValue, { fontSize: valueSize }]}>{value}</Text>
      <Text numberOfLines={1} style={[styles.statLabel, { fontSize: labelSize, marginTop: labelSize * 0.28 }]}>
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

const TechyLayout = forwardRef(function TechyLayout(
  { width, height, textScale, detail, stats, title, subtitle, samples, maxDepthMeters, depthTop, depthBottom, showDepthAxis, photoUri, gradient, profileVariant, watermark },
  ref,
) {
  const m = cardMetrics(width, height, textScale);
  const brief = detail === 'brief';
  const axisWidth = depthAxisWidth(width, showDepthAxis && !brief);
  const chartWidth = m.contentWidth - (axisWidth ? axisWidth + m.pad * 0.35 : 0);
  const valueSize = m.type(brief ? 0.05 : 0.034, brief ? 19 : 14);
  const labelSize = m.type(0.014, 9.5);
  const divider = Math.max(1, width * 0.0022);
  const bracketSize = width * 0.11;
  const bracketThickness = Math.max(1.5, width * 0.003);
  const mark = (watermark || '').trim();

  return (
    <View ref={ref} collapsable={false} style={[styles.card, { width, height }]}>
      <CardBackground
        gradient={gradient}
        photoUri={photoUri}
        scrim={SCRIM}
        scrimHeight={height * (brief ? 0.5 : 0.62)}
        scrimStops={[0, 0.35, 0.6, 1]}
        // A cool, low-light instrument cast over the *whole* photo — not just
        // the bottom fade — so this theme reads as distinct from the others
        // before the eye reaches the bottom-third content.
        tint="rgba(6,22,26,0.24)"
      />
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <CornerBracket size={bracketSize} style={[styles.corner, { top: m.pad * 0.6, left: m.pad * 0.6 }]} thickness={bracketThickness} />
        <CornerBracket
          size={bracketSize}
          style={[styles.corner, { top: m.pad * 0.6, right: m.pad * 0.6, transform: [{ scaleX: -1 }] }]}
          thickness={bracketThickness}
        />
        <CornerBracket
          size={bracketSize}
          style={[styles.corner, { bottom: m.pad * 0.6, left: m.pad * 0.6, transform: [{ scaleY: -1 }] }]}
          thickness={bracketThickness}
        />
        <CornerBracket
          size={bracketSize}
          style={[styles.corner, { bottom: m.pad * 0.6, right: m.pad * 0.6, transform: [{ scaleX: -1 }, { scaleY: -1 }] }]}
          thickness={bracketThickness}
        />
      </View>

      <View style={[styles.content, { paddingBottom: m.pad, paddingHorizontal: m.pad }]}>
        {title ? (
          <Text numberOfLines={1} style={[styles.title, { fontSize: m.type(brief ? 0.04 : 0.03, 12.5) }]}>
            {'// '}{title.toUpperCase()}
          </Text>
        ) : null}
        {subtitle ? (
          <Text numberOfLines={1} style={[styles.subtitle, { fontSize: m.type(0.023, 10.5), marginTop: m.pad * 0.14 }]}>
            {subtitle.toUpperCase()}
          </Text>
        ) : null}
        {brief ? null : (
          <View style={[styles.chartRow, { marginTop: m.pad * 0.45, height: m.chartHeight }]}>
            <View style={[styles.chartFrame, { height: m.chartHeight, width: chartWidth }]}>
              <View style={[styles.gridLine, { top: m.chartHeight * 0.5 }]} />
              <View style={[styles.gridLine, { top: m.chartHeight * 0.92 }]} />
              <ProfileCurve
                color={ACCENT}
                height={m.chartHeight}
                maxDepthMeters={maxDepthMeters}
                samples={samples}
                strokeWidth={Math.max(2, width * 0.005)}
                variant={profileVariant}
                width={chartWidth}
              />
            </View>
            {axisWidth ? (
              <DepthAxis
                bottom={depthBottom}
                color="rgba(57,255,224,0.75)"
                fontSize={labelSize}
                height={m.chartHeight}
                top={depthTop}
                width={axisWidth}
              />
            ) : null}
          </View>
        )}
        <View
          style={[
            styles.statRow,
            { marginTop: m.pad * (brief ? 0.8 : 0.55), borderTopWidth: divider, borderTopColor: RULE, paddingTop: m.pad * 0.4 },
          ]}
        >
          {stats.map((stat, index) => (
            <Stat
              key={stat.key}
              divider={divider}
              isLast={index === stats.length - 1}
              label={stat.label}
              labelSize={labelSize}
              value={stat.value}
              valueSize={valueSize}
            />
          ))}
        </View>
        {mark ? (
          <Text numberOfLines={1} style={[styles.watermark, { fontSize: m.type(0.013, 9), marginTop: m.pad * 0.55 }]}>
            {'// '}{mark}
          </Text>
        ) : null}
      </View>
    </View>
  );
});

export default TechyLayout;

const styles = StyleSheet.create({
  // Sharp corners and a thin edge-to-edge bezel — a viewfinder/instrument
  // frame, in contrast to Classic's plain edge, Elegant's matted frame, and
  // Natural's rounded organic shape.
  card: { backgroundColor: INK, borderColor: 'rgba(57,255,224,0.4)', borderWidth: 1.5, overflow: 'hidden' },
  corner: { position: 'absolute' },
  bracketH: { position: 'absolute', top: 0, left: 0 },
  bracketV: { position: 'absolute', top: 0, left: 0 },
  content: { bottom: 0, left: 0, position: 'absolute', right: 0 },
  title: { color: ACCENT, fontWeight: '700', letterSpacing: 1.5 },
  subtitle: { color: 'rgba(234,255,251,0.6)', fontVariant: ['tabular-nums'], fontWeight: '700', letterSpacing: 1.2 },
  chartRow: { alignItems: 'center', flexDirection: 'row' },
  chartFrame: { justifyContent: 'flex-end' },
  gridLine: { backgroundColor: 'rgba(57,255,224,0.14)', height: 1, left: 0, position: 'absolute', right: 0 },
  statRow: { flexDirection: 'row' },
  stat: { alignItems: 'center', flex: 1 },
  statValue: { color: '#EAFFFB', fontVariant: ['tabular-nums'], fontWeight: '800', letterSpacing: 0.5 },
  statLabel: { color: 'rgba(57,255,224,0.75)', fontWeight: '800', letterSpacing: 1.6 },
  watermark: {
    color: 'rgba(57,255,224,0.5)',
    fontWeight: '800',
    letterSpacing: 4,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
});
