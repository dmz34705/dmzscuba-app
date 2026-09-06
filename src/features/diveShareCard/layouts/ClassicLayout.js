// The neutral default: a straight bottom-fade scrim, left-aligned stats in
// even columns, cyan accent. Closest to a standard iOS share card.

import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '../../../theme';
import ProfileCurve from './ProfileCurve';
import { CardBackground, DepthAxis, cardMetrics, depthAxisWidth } from './shared';

const SCRIM = ['rgba(3,10,18,0)', 'rgba(3,10,18,0.55)', 'rgba(3,10,18,0.94)'];

function Stat({ label, value, valueSize, labelSize }) {
  return (
    <View style={styles.stat}>
      <Text numberOfLines={1} style={[styles.statValue, { fontSize: valueSize }]}>{value}</Text>
      <Text numberOfLines={1} style={[styles.statLabel, { fontSize: labelSize, marginTop: labelSize * 0.25 }]}>
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

const ClassicLayout = forwardRef(function ClassicLayout(
  { width, height, textScale, detail, stats, title, subtitle, samples, maxDepthMeters, depthTop, depthBottom, showDepthAxis, photoUri, gradient, profileVariant, watermark },
  ref,
) {
  const m = cardMetrics(width, height, textScale);
  const brief = detail === 'brief';
  const axisWidth = depthAxisWidth(width, showDepthAxis && !brief);
  const chartWidth = m.contentWidth - (axisWidth ? axisWidth + m.pad * 0.35 : 0);
  const valueSize = m.type(brief ? 0.055 : 0.037, brief ? 20 : 15);
  const labelSize = m.type(0.0165, 9.5);
  const mark = (watermark || '').trim();

  return (
    <View ref={ref} collapsable={false} style={[styles.card, { width, height }]}>
      <CardBackground
        gradient={gradient}
        photoUri={photoUri}
        scrim={SCRIM}
        scrimHeight={height * (brief ? 0.45 : 0.55)}
        scrimStops={[0, 0.45, 1]}
      />
      <View style={[styles.content, { paddingBottom: m.pad, paddingHorizontal: m.pad }]}>
        {title ? (
          <Text numberOfLines={1} style={[styles.title, { fontSize: m.type(brief ? 0.045 : 0.036, 14) }]}>{title}</Text>
        ) : null}
        {subtitle ? (
          <Text numberOfLines={1} style={[styles.subtitle, { fontSize: m.type(0.026, 11), marginTop: m.pad * 0.12 }]}>
            {subtitle}
          </Text>
        ) : null}
        {brief ? null : (
          <View style={[styles.chartRow, { marginTop: m.pad * 0.45 }]}>
            <ProfileCurve
              color={colors.cyan}
              height={m.chartHeight}
              maxDepthMeters={maxDepthMeters}
              samples={samples}
              variant={profileVariant}
              width={chartWidth}
            />
            {axisWidth ? (
              <DepthAxis
                bottom={depthBottom}
                color="rgba(255,255,255,0.62)"
                fontSize={labelSize}
                height={m.chartHeight}
                top={depthTop}
                width={axisWidth}
              />
            ) : null}
          </View>
        )}
        <View style={[styles.statRow, { marginTop: m.pad * (brief ? 0.75 : 0.5), gap: m.pad * 0.25 }]}>
          {stats.map((stat) => (
            <Stat key={stat.key} label={stat.label} labelSize={labelSize} value={stat.value} valueSize={valueSize} />
          ))}
        </View>
        {mark ? (
          <Text numberOfLines={1} style={[styles.watermark, { fontSize: m.type(0.0145, 9), marginTop: m.pad * 0.7 }]}>
            {mark}
          </Text>
        ) : null}
      </View>
    </View>
  );
});

export default ClassicLayout;

const styles = StyleSheet.create({
  card: { backgroundColor: colors.background, overflow: 'hidden' },
  content: { bottom: 0, left: 0, position: 'absolute', right: 0 },
  title: { color: colors.white, fontWeight: '800', letterSpacing: 0.2 },
  subtitle: { color: 'rgba(255,255,255,0.72)', fontWeight: '600', letterSpacing: 0.3 },
  chartRow: { alignItems: 'center', flexDirection: 'row' },
  statRow: { flexDirection: 'row' },
  stat: { flex: 1 },
  statValue: { color: colors.white, fontWeight: '900', letterSpacing: -0.5 },
  statLabel: { color: 'rgba(255,255,255,0.6)', fontWeight: '800', letterSpacing: 1.4 },
  watermark: {
    color: 'rgba(255,255,255,0.35)',
    fontWeight: '900',
    letterSpacing: 3,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
});
