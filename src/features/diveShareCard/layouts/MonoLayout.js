// Pure monochrome, editorial: no accent colour anywhere, a hairline frame
// inset from the edge, an oversized title, and stats divided by thin white
// rules. The only theme with zero chroma, which is what makes it read as
// different at a glance.

import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import ProfileCurve from './ProfileCurve';
import { CardBackground, DepthAxis, cardMetrics, depthAxisWidth } from './shared';

const INK = '#FFFFFF';
const SCRIM = ['rgba(0,0,0,0)', 'rgba(0,0,0,0.5)', 'rgba(0,0,0,0.93)'];

function Stat({ label, value, valueSize, labelSize, isLast }) {
  return (
    <View style={[styles.stat, !isLast && styles.statDivided]}>
      <Text numberOfLines={1} style={[styles.statValue, { fontSize: valueSize }]}>{value}</Text>
      <Text numberOfLines={1} style={[styles.statLabel, { fontSize: labelSize, marginTop: labelSize * 0.35 }]}>{label}</Text>
    </View>
  );
}

const MonoLayout = forwardRef(function MonoLayout(
  { width, height, textScale, detail, stats, title, subtitle, samples, maxDepthMeters, depthTop, depthBottom, showDepthAxis, photoUri, gradient, profileVariant, watermark },
  ref,
) {
  const m = cardMetrics(width, height, textScale, 0.075);
  const brief = detail === 'brief';
  const axisWidth = depthAxisWidth(width, showDepthAxis && !brief);
  const chartWidth = m.contentWidth - (axisWidth ? axisWidth + m.pad * 0.3 : 0);
  const valueSize = m.type(brief ? 0.058 : 0.036, brief ? 22 : 15);
  const labelSize = m.type(0.0145, 9);
  const mark = (watermark || '').trim();

  return (
    <View ref={ref} collapsable={false} style={[styles.card, { width, height }]}>
      <CardBackground
        gradient={gradient}
        photoUri={photoUri}
        scrim={SCRIM}
        scrimHeight={height * (brief ? 0.5 : 0.62)}
        scrimStops={[0, 0.5, 1]}
        // Desaturating a colour photo isn't possible without a filter, so the
        // cast is a plain neutral darkener — the monochrome reads from the
        // type and rules instead.
        tint="rgba(0,0,0,0.22)"
      />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.frame]} />
      <View style={[styles.content, { paddingBottom: m.pad, paddingHorizontal: m.pad }]}>
        {title ? (
          <Text numberOfLines={1} style={[styles.title, { fontSize: m.type(brief ? 0.055 : 0.044, 17) }]}>{title}</Text>
        ) : null}
        {subtitle ? (
          <Text numberOfLines={1} style={[styles.subtitle, { fontSize: m.type(0.022, 10), marginTop: m.pad * 0.15 }]}>
            {subtitle}
          </Text>
        ) : null}
        {brief ? null : (
          <View style={[styles.chartRow, { marginTop: m.pad * 0.45 }]}>
            <ProfileCurve
              color={INK}
              fillOpacity={0.18}
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
                color="rgba(255,255,255,0.7)"
                fontSize={labelSize}
                height={m.chartHeight}
                top={depthTop}
                width={axisWidth}
              />
            ) : null}
          </View>
        )}
        <View style={[styles.statRow, { marginTop: m.pad * (brief ? 0.8 : 0.55), paddingTop: m.pad * 0.45 }]}>
          {stats.map((stat, index) => (
            <Stat
              isLast={index === stats.length - 1}
              key={stat.key}
              label={stat.label}
              labelSize={labelSize}
              value={stat.value}
              valueSize={valueSize}
            />
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

export default MonoLayout;

const styles = StyleSheet.create({
  // Square corners and a hairline inset frame — a printed plate.
  card: { backgroundColor: '#050505', overflow: 'hidden' },
  frame: { borderColor: 'rgba(255,255,255,0.45)', borderWidth: StyleSheet.hairlineWidth, margin: 10 },
  content: { bottom: 0, left: 0, position: 'absolute', right: 0 },
  title: { color: INK, fontWeight: '300', letterSpacing: -0.4 },
  subtitle: { color: 'rgba(255,255,255,0.6)', fontWeight: '600', letterSpacing: 2, textTransform: 'uppercase' },
  chartRow: { alignItems: 'center', flexDirection: 'row' },
  statRow: { borderTopColor: 'rgba(255,255,255,0.35)', borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row' },
  stat: { flex: 1, paddingHorizontal: 4 },
  statDivided: { borderRightColor: 'rgba(255,255,255,0.22)', borderRightWidth: StyleSheet.hairlineWidth },
  statValue: { color: INK, fontWeight: '700', letterSpacing: -0.3 },
  statLabel: { color: 'rgba(255,255,255,0.55)', fontWeight: '600', letterSpacing: 1.3, textTransform: 'uppercase' },
  watermark: {
    color: 'rgba(255,255,255,0.4)',
    fontWeight: '700',
    letterSpacing: 4,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
});
