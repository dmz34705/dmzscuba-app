// Golden-hour deck aesthetic: a warm coral-to-amber wash, a sun disc sitting
// on a horizon rule, and the profile mirrored underneath it like a reflection
// on the water. The warmest and softest of the set.

import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import ProfileCurve from './ProfileCurve';
import { CardBackground, DepthAxis, cardMetrics, depthAxisWidth } from './shared';

const ACCENT = '#FFB36A';
const EMBER = '#FF7E5F';
const SCRIM = ['rgba(26,10,4,0)', 'rgba(40,15,6,0.6)', 'rgba(20,8,3,0.95)'];

function Stat({ label, value, valueSize, labelSize }) {
  return (
    <View style={styles.stat}>
      <Text numberOfLines={1} style={[styles.statValue, { fontSize: valueSize }]}>{value}</Text>
      <Text numberOfLines={1} style={[styles.statLabel, { fontSize: labelSize, marginTop: labelSize * 0.3 }]}>{label}</Text>
    </View>
  );
}

const SunsetLayout = forwardRef(function SunsetLayout(
  { width, height, textScale, detail, stats, title, subtitle, samples, maxDepthMeters, depthTop, depthBottom, showDepthAxis, photoUri, gradient, profileVariant, watermark },
  ref,
) {
  const m = cardMetrics(width, height, textScale, 0.06);
  const brief = detail === 'brief';
  const axisWidth = depthAxisWidth(width, showDepthAxis && !brief);
  const chartWidth = m.contentWidth - (axisWidth ? axisWidth + m.pad * 0.3 : 0);
  const valueSize = m.type(brief ? 0.056 : 0.038, brief ? 21 : 15);
  const labelSize = m.type(0.0155, 9.5);
  const mark = (watermark || '').trim();
  const sun = Math.max(10, width * 0.055);

  return (
    <View ref={ref} collapsable={false} style={[styles.card, { width, height }]}>
      <CardBackground
        gradient={gradient}
        photoUri={photoUri}
        scrim={SCRIM}
        scrimHeight={height * (brief ? 0.5 : 0.6)}
        scrimStops={[0, 0.5, 1]}
        tint="rgba(92,38,10,0.2)"
      />
      <View style={[styles.content, { paddingBottom: m.pad, paddingHorizontal: m.pad }]}>
        {/* The horizon: a sun resting on a rule that runs the full width. */}
        <View style={[styles.horizon, { marginBottom: m.pad * 0.5 }]}>
          <View style={[styles.sun, { width: sun, height: sun, borderRadius: sun / 2 }]} />
          <View style={styles.horizonRule} />
        </View>
        {title ? (
          <Text numberOfLines={1} style={[styles.title, { fontSize: m.type(brief ? 0.048 : 0.038, 15) }]}>{title}</Text>
        ) : null}
        {subtitle ? (
          <Text numberOfLines={1} style={[styles.subtitle, { fontSize: m.type(0.025, 11), marginTop: m.pad * 0.12 }]}>
            {subtitle}
          </Text>
        ) : null}
        {brief ? null : (
          <View style={[styles.chartRow, { marginTop: m.pad * 0.4 }]}>
            <ProfileCurve
              color={ACCENT}
              fillOpacity={0.4}
              height={m.chartHeight}
              maxDepthMeters={maxDepthMeters}
              samples={samples}
              variant={profileVariant}
              width={chartWidth}
            />
            {axisWidth ? (
              <DepthAxis
                bottom={depthBottom}
                color="rgba(255,214,170,0.8)"
                fontSize={labelSize}
                height={m.chartHeight}
                top={depthTop}
                width={axisWidth}
              />
            ) : null}
          </View>
        )}
        <View style={[styles.statRow, { marginTop: m.pad * (brief ? 0.7 : 0.5), gap: m.pad * 0.25 }]}>
          {stats.map((stat) => (
            <Stat key={stat.key} label={stat.label} labelSize={labelSize} value={stat.value} valueSize={valueSize} />
          ))}
        </View>
        {mark ? (
          <Text numberOfLines={1} style={[styles.watermark, { fontSize: m.type(0.014, 9), marginTop: m.pad * 0.65 }]}>
            {mark}
          </Text>
        ) : null}
      </View>
    </View>
  );
});

export default SunsetLayout;

const styles = StyleSheet.create({
  // Generously rounded, like a warm print — softer than every other theme.
  card: { backgroundColor: '#1A0A04', borderRadius: 28, overflow: 'hidden' },
  content: { bottom: 0, left: 0, position: 'absolute', right: 0 },
  horizon: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  sun: { backgroundColor: ACCENT, opacity: 0.9 },
  horizonRule: { backgroundColor: EMBER, flex: 1, height: 1.5, opacity: 0.7 },
  title: { color: '#FFF3E6', fontWeight: '800', letterSpacing: 0.2 },
  subtitle: { color: 'rgba(255,224,198,0.75)', fontWeight: '600', letterSpacing: 0.4 },
  chartRow: { alignItems: 'center', flexDirection: 'row' },
  statRow: { flexDirection: 'row' },
  stat: { flex: 1 },
  statValue: { color: '#FFF3E6', fontWeight: '900', letterSpacing: -0.4 },
  statLabel: { color: ACCENT, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase' },
  watermark: {
    color: 'rgba(255,179,106,0.6)',
    fontWeight: '800',
    letterSpacing: 3,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
});
