// Technical drafting: a drawn grid over deep blue, dimension ticks in the
// corners, wide-tracked labels, and the profile stepped like a plotted table
// of samples rather than a smooth curve.

import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import ProfileCurve from './ProfileCurve';
import { CardBackground, DepthAxis, cardMetrics, depthAxisWidth } from './shared';

const ACCENT = '#9FD8FF';
const SCRIM = ['rgba(2,16,31,0)', 'rgba(4,28,52,0.62)', 'rgba(2,14,27,0.96)'];
const GRID = 'rgba(159,216,255,0.13)';

function Grid({ rows, columns }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: rows }, (_, index) => (
        <View key={`r${index}`} style={[styles.gridRow, { top: `${((index + 1) / (rows + 1)) * 100}%` }]} />
      ))}
      {Array.from({ length: columns }, (_, index) => (
        <View key={`c${index}`} style={[styles.gridColumn, { left: `${((index + 1) / (columns + 1)) * 100}%` }]} />
      ))}
    </View>
  );
}

function Stat({ label, value, valueSize, labelSize }) {
  return (
    <View style={styles.stat}>
      <Text numberOfLines={1} style={[styles.statLabel, { fontSize: labelSize }]}>{label}</Text>
      <Text numberOfLines={1} style={[styles.statValue, { fontSize: valueSize, marginTop: labelSize * 0.3 }]}>{value}</Text>
    </View>
  );
}

const BlueprintLayout = forwardRef(function BlueprintLayout(
  { width, height, textScale, detail, stats, title, subtitle, samples, maxDepthMeters, depthTop, depthBottom, showDepthAxis, photoUri, gradient, profileVariant, watermark },
  ref,
) {
  const m = cardMetrics(width, height, textScale, 0.06);
  const brief = detail === 'brief';
  const axisWidth = depthAxisWidth(width, showDepthAxis && !brief);
  const chartWidth = m.contentWidth - (axisWidth ? axisWidth + m.pad * 0.3 : 0);
  const valueSize = m.type(brief ? 0.05 : 0.034, brief ? 19 : 14);
  const labelSize = m.type(0.013, 9);
  const mark = (watermark || '').trim();

  return (
    <View ref={ref} collapsable={false} style={[styles.card, { width, height }]}>
      <CardBackground
        gradient={gradient}
        photoUri={photoUri}
        scrim={SCRIM}
        scrimHeight={height * (brief ? 0.5 : 0.6)}
        scrimStops={[0, 0.5, 1]}
        tint="rgba(6,40,74,0.3)"
      />
      <Grid columns={5} rows={7} />
      {/* Dimension ticks: short rules stepping in from each corner. */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { padding: m.pad * 0.5 }]}>
        <View style={[styles.tickRow, styles.tickTop]}>
          <View style={styles.tickH} />
          <View style={styles.tickH} />
        </View>
        <View style={[styles.tickRow, styles.tickBottom]}>
          <View style={styles.tickH} />
          <View style={styles.tickH} />
        </View>
      </View>
      <View style={[styles.content, { paddingBottom: m.pad, paddingHorizontal: m.pad }]}>
        {title ? (
          <Text numberOfLines={1} style={[styles.title, { fontSize: m.type(brief ? 0.042 : 0.032, 13) }]}>
            {title.toUpperCase()}
          </Text>
        ) : null}
        {subtitle ? (
          <Text numberOfLines={1} style={[styles.subtitle, { fontSize: m.type(0.022, 10), marginTop: m.pad * 0.15 }]}>
            {subtitle.toUpperCase()}
          </Text>
        ) : null}
        {brief ? null : (
          <View style={[styles.chartRow, { marginTop: m.pad * 0.5 }]}>
            <ProfileCurve
              color={ACCENT}
              fillOpacity={0.22}
              height={m.chartHeight}
              maxDepthMeters={maxDepthMeters}
              samples={samples}
              strokeWidth={Math.max(1.5, width * 0.004)}
              variant={profileVariant}
              width={chartWidth}
            />
            {axisWidth ? (
              <DepthAxis
                bottom={depthBottom}
                color="rgba(159,216,255,0.85)"
                fontSize={labelSize}
                height={m.chartHeight}
                top={depthTop}
                width={axisWidth}
              />
            ) : null}
          </View>
        )}
        <View style={[styles.statRow, { marginTop: m.pad * (brief ? 0.8 : 0.55), paddingTop: m.pad * 0.4 }]}>
          {stats.map((stat) => (
            <Stat key={stat.key} label={stat.label} labelSize={labelSize} value={stat.value} valueSize={valueSize} />
          ))}
        </View>
        {mark ? (
          <Text numberOfLines={1} style={[styles.watermark, { fontSize: m.type(0.0125, 8.5), marginTop: m.pad * 0.6 }]}>
            {mark}
          </Text>
        ) : null}
      </View>
    </View>
  );
});

export default BlueprintLayout;

const styles = StyleSheet.create({
  card: { backgroundColor: '#02101F', borderColor: 'rgba(159,216,255,0.35)', borderWidth: 1, overflow: 'hidden' },
  gridRow: { backgroundColor: GRID, height: StyleSheet.hairlineWidth, left: 0, position: 'absolute', right: 0 },
  gridColumn: { backgroundColor: GRID, bottom: 0, position: 'absolute', top: 0, width: StyleSheet.hairlineWidth },
  tickRow: { flexDirection: 'row', justifyContent: 'space-between', left: 0, position: 'absolute', right: 0 },
  tickTop: { top: 0 },
  tickBottom: { bottom: 0 },
  tickH: { backgroundColor: ACCENT, height: 1.5, opacity: 0.7, width: '9%' },
  content: { bottom: 0, left: 0, position: 'absolute', right: 0 },
  title: { color: '#E4F4FF', fontWeight: '800', letterSpacing: 2.4 },
  subtitle: { color: 'rgba(159,216,255,0.7)', fontVariant: ['tabular-nums'], fontWeight: '700', letterSpacing: 1.6 },
  chartRow: { alignItems: 'center', flexDirection: 'row' },
  statRow: { borderTopColor: 'rgba(159,216,255,0.35)', borderTopWidth: 1, flexDirection: 'row' },
  stat: { flex: 1, paddingHorizontal: 3 },
  statLabel: { color: 'rgba(159,216,255,0.75)', fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase' },
  statValue: { color: '#E4F4FF', fontVariant: ['tabular-nums'], fontWeight: '800', letterSpacing: 0.2 },
  watermark: {
    color: 'rgba(159,216,255,0.6)',
    fontWeight: '700',
    letterSpacing: 3.5,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
});
