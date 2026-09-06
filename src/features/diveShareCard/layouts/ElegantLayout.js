// Editorial, boutique-travel aesthetic: a softer warm-charcoal fade (more of
// the photo left visible), centred composition, a thin brass rule standing in
// for hard dividers, cream text instead of pure white, a thin single-weight
// chart line with almost no fill. Quieter than the other themes on purpose.

import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import ProfileCurve from './ProfileCurve';
import { CardBackground, DepthAxis, cardMetrics, depthAxisWidth } from './shared';

const ACCENT = '#D9B86A'; // brass/gold
const CREAM = '#F4ECDD';
const SCRIM = ['rgba(20,15,10,0)', 'rgba(24,18,12,0.62)', 'rgba(20,15,10,0.9)'];

function Stat({ label, value, valueSize, labelSize }) {
  return (
    <View style={styles.stat}>
      <Text numberOfLines={1} style={[styles.statValue, { fontSize: valueSize }]}>{value}</Text>
      <Text numberOfLines={1} style={[styles.statLabel, { fontSize: labelSize, marginTop: labelSize * 0.4 }]}>{label}</Text>
    </View>
  );
}

const ElegantLayout = forwardRef(function ElegantLayout(
  { width, height, textScale, detail, stats, title, subtitle, samples, maxDepthMeters, depthTop, depthBottom, showDepthAxis, photoUri, gradient, profileVariant, watermark },
  ref,
) {
  const m = cardMetrics(width, height, textScale, 0.07);
  const brief = detail === 'brief';
  const axisWidth = depthAxisWidth(width, showDepthAxis && !brief);
  const chartWidth = m.contentWidth - (axisWidth ? axisWidth + m.pad * 0.3 : 0);
  const valueSize = m.type(brief ? 0.048 : 0.032, brief ? 18 : 13.5);
  const labelSize = m.type(0.0135, 9.5);
  const mark = (watermark || '').trim();

  return (
    <View ref={ref} collapsable={false} style={[styles.card, { width, height }]}>
      <CardBackground
        gradient={gradient}
        photoUri={photoUri}
        scrim={SCRIM}
        scrimHeight={height * (brief ? 0.42 : 0.5)}
        scrimStops={[0, 0.55, 1]}
        // A warm sepia wash across the whole frame, like a printed film stock,
        // so this theme reads warm at a glance rather than only at the bottom.
        tint="rgba(58,36,14,0.16)"
      />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.frame]} />
      <View style={[styles.content, { paddingBottom: m.pad * 0.9, paddingHorizontal: m.pad }]}>
        {title ? (
          <Text numberOfLines={1} style={[styles.title, { fontSize: m.type(brief ? 0.042 : 0.034, 13.5) }]}>{title}</Text>
        ) : null}
        {subtitle ? (
          <Text numberOfLines={1} style={[styles.subtitle, { fontSize: m.type(0.023, 10.5), marginTop: m.pad * 0.14 }]}>
            {subtitle}
          </Text>
        ) : null}
        {brief ? null : (
          <View style={[styles.chartRow, { marginTop: m.pad * 0.4 }]}>
            <ProfileCurve
              color={ACCENT}
              fillOpacity={0.16}
              height={m.chartHeight}
              maxDepthMeters={maxDepthMeters}
              samples={samples}
              strokeWidth={Math.max(1.5, width * 0.0035)}
              variant={profileVariant}
              width={chartWidth}
            />
            {axisWidth ? (
              <DepthAxis
                bottom={depthBottom}
                color="rgba(217,184,106,0.8)"
                fontSize={labelSize}
                height={m.chartHeight}
                top={depthTop}
                width={axisWidth}
              />
            ) : null}
          </View>
        )}
        <View style={[styles.rule, { marginTop: m.pad * 0.45, marginBottom: m.pad * 0.45 }]} />
        <View style={styles.statRow}>
          {stats.map((stat) => (
            <Stat key={stat.key} label={stat.label} labelSize={labelSize} value={stat.value} valueSize={valueSize} />
          ))}
        </View>
        {mark ? (
          <Text numberOfLines={1} style={[styles.watermark, { fontSize: m.type(0.0135, 9), marginTop: m.pad * 0.6 }]}>
            {mark}
          </Text>
        ) : null}
      </View>
    </View>
  );
});

export default ElegantLayout;

const styles = StyleSheet.create({
  // A softly rounded, matted-print shape with a thin brass inset border — in
  // contrast to Techy's sharp bezel and Natural's fuller organic curve.
  card: { backgroundColor: '#140F0A', borderRadius: 20, overflow: 'hidden' },
  frame: { borderColor: 'rgba(217,184,106,0.55)', borderRadius: 20, borderWidth: 1, margin: 8 },
  content: { alignItems: 'center', bottom: 0, left: 0, position: 'absolute', right: 0 },
  title: { color: CREAM, fontWeight: '500', letterSpacing: 1.2, textAlign: 'center' },
  subtitle: { color: 'rgba(244,236,221,0.6)', fontWeight: '500', letterSpacing: 1, textAlign: 'center' },
  chartRow: { alignItems: 'center', alignSelf: 'stretch', flexDirection: 'row' },
  rule: { backgroundColor: ACCENT, height: 1, opacity: 0.55, width: '32%' },
  statRow: { flexDirection: 'row', width: '100%' },
  stat: { alignItems: 'center', flex: 1 },
  statValue: { color: CREAM, fontWeight: '600', letterSpacing: 0.2 },
  statLabel: { color: 'rgba(244,236,221,0.55)', fontWeight: '600', letterSpacing: 1.4, textTransform: 'uppercase' },
  watermark: {
    color: ACCENT,
    fontWeight: '600',
    letterSpacing: 5,
    opacity: 0.75,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
});
