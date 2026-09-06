// Synthwave: hot magenta on deep violet, a scanline grid behind the readout,
// stats in outlined capsules, and type with a soft coloured halo. Loud where
// Techy is clinical — same "screen" idea, opposite temperament.

import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import ProfileCurve from './ProfileCurve';
import { CardBackground, DepthAxis, cardMetrics, depthAxisWidth } from './shared';

const ACCENT = '#FF4FD8';
const GLOW = '#8A5CFF';
const SCRIM = ['rgba(8,2,15,0)', 'rgba(20,6,38,0.6)', 'rgba(8,2,15,0.96)'];

function Stat({ label, value, valueSize, labelSize, radius }) {
  return (
    <View style={[styles.stat, { borderRadius: radius }]}>
      <Text numberOfLines={1} style={[styles.statValue, { fontSize: valueSize }]}>{value}</Text>
      <Text numberOfLines={1} style={[styles.statLabel, { fontSize: labelSize, marginTop: labelSize * 0.25 }]}>{label}</Text>
    </View>
  );
}

const NeonLayout = forwardRef(function NeonLayout(
  { width, height, textScale, detail, stats, title, subtitle, samples, maxDepthMeters, depthTop, depthBottom, showDepthAxis, photoUri, gradient, profileVariant, watermark },
  ref,
) {
  const m = cardMetrics(width, height, textScale);
  const brief = detail === 'brief';
  const axisWidth = depthAxisWidth(width, showDepthAxis && !brief);
  const chartWidth = m.contentWidth - (axisWidth ? axisWidth + m.pad * 0.3 : 0);
  const valueSize = m.type(brief ? 0.052 : 0.035, brief ? 20 : 14);
  const labelSize = m.type(0.014, 9.5);
  const mark = (watermark || '').trim();
  const scanlines = 5;

  return (
    <View ref={ref} collapsable={false} style={[styles.card, { width, height }]}>
      <CardBackground
        gradient={gradient}
        photoUri={photoUri}
        scrim={SCRIM}
        scrimHeight={height * (brief ? 0.52 : 0.64)}
        scrimStops={[0, 0.45, 1]}
        tint="rgba(52,8,74,0.28)"
      />
      {/* Evenly spaced scanlines across the whole frame, the CRT tell. */}
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {Array.from({ length: scanlines }, (_, index) => (
          <View key={index} style={[styles.scanline, { top: `${((index + 1) / (scanlines + 1)) * 100}%` }]} />
        ))}
      </View>
      <View style={[styles.content, { paddingBottom: m.pad, paddingHorizontal: m.pad }]}>
        {title ? (
          <Text numberOfLines={1} style={[styles.title, { fontSize: m.type(brief ? 0.046 : 0.036, 14) }]}>
            {title.toUpperCase()}
          </Text>
        ) : null}
        {subtitle ? (
          <Text numberOfLines={1} style={[styles.subtitle, { fontSize: m.type(0.023, 10.5), marginTop: m.pad * 0.12 }]}>
            {subtitle}
          </Text>
        ) : null}
        {brief ? null : (
          <View style={[styles.chartRow, { marginTop: m.pad * 0.45 }]}>
            <ProfileCurve
              color={ACCENT}
              fillOpacity={0.42}
              height={m.chartHeight}
              maxDepthMeters={maxDepthMeters}
              samples={samples}
              strokeWidth={Math.max(2, width * 0.005)}
              variant={profileVariant}
              width={chartWidth}
            />
            {axisWidth ? (
              <DepthAxis
                bottom={depthBottom}
                color="rgba(255,79,216,0.85)"
                fontSize={labelSize}
                height={m.chartHeight}
                top={depthTop}
                width={axisWidth}
              />
            ) : null}
          </View>
        )}
        <View style={[styles.statRow, { marginTop: m.pad * (brief ? 0.75 : 0.55), gap: m.pad * 0.22 }]}>
          {stats.map((stat) => (
            <Stat
              key={stat.key}
              label={stat.label}
              labelSize={labelSize}
              radius={width * 0.022}
              value={stat.value}
              valueSize={valueSize}
            />
          ))}
        </View>
        {mark ? (
          <Text numberOfLines={1} style={[styles.watermark, { fontSize: m.type(0.013, 9), marginTop: m.pad * 0.6 }]}>
            {mark}
          </Text>
        ) : null}
      </View>
    </View>
  );
});

export default NeonLayout;

const styles = StyleSheet.create({
  card: { backgroundColor: '#08020F', borderColor: 'rgba(255,79,216,0.5)', borderRadius: 18, borderWidth: 1.5, overflow: 'hidden' },
  scanline: { backgroundColor: 'rgba(255,255,255,0.05)', height: 1, left: 0, position: 'absolute', right: 0 },
  content: { bottom: 0, left: 0, position: 'absolute', right: 0 },
  title: {
    color: '#FFE9FA',
    fontWeight: '900',
    letterSpacing: 1.6,
    textShadowColor: GLOW,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  subtitle: { color: 'rgba(255,233,250,0.65)', fontWeight: '700', letterSpacing: 1 },
  chartRow: { alignItems: 'center', flexDirection: 'row' },
  statRow: { flexDirection: 'row' },
  stat: {
    alignItems: 'center',
    borderColor: 'rgba(255,79,216,0.55)',
    borderWidth: 1,
    flex: 1,
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  statValue: { color: '#FFE9FA', fontWeight: '900', letterSpacing: 0.2 },
  statLabel: { color: ACCENT, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
  watermark: {
    color: 'rgba(255,79,216,0.65)',
    fontWeight: '900',
    letterSpacing: 4,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
});
