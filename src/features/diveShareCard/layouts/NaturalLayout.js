// Ocean/organic aesthetic: a deep teal fade instead of blue-black, the profile
// rendered as a soft swell (fill-forward, stroke understated), rounded "pill"
// chips instead of bare text for the stats, sentence-case labels, and a small
// decorative wave divider instead of a hard rule.

import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import ProfileCurve from './ProfileCurve';
import { CardBackground, DepthAxis, cardMetrics, depthAxisWidth } from './shared';

const ACCENT = '#5CE0C6';
const FOAM = '#EAFFFA';
const SCRIM = ['rgba(4,20,18,0)', 'rgba(5,26,23,0.58)', 'rgba(4,20,18,0.94)'];

function WaveDivider({ width }) {
  const h = Math.max(12, width * 0.026);
  const w = width * 0.34;
  // One gentle up-down swell, drawn once and centred — a soft stand-in for a
  // straight rule, echoing the chart's own curve.
  const d = `M0 ${h / 2} Q ${w * 0.25} 0 ${w * 0.5} ${h / 2} T ${w} ${h / 2}`;
  return (
    <Svg height={h} width={w}>
      <Path d={d} fill="none" opacity={0.85} stroke={ACCENT} strokeLinecap="round" strokeWidth={Math.max(2, h * 0.22)} />
    </Svg>
  );
}

function Stat({ label, value, valueSize, labelSize, chip }) {
  return (
    <View style={[styles.stat, { borderRadius: chip.radius, paddingVertical: chip.padV, paddingHorizontal: chip.padH }]}>
      <Text numberOfLines={1} style={[styles.statValue, { fontSize: valueSize }]}>{value}</Text>
      <Text numberOfLines={1} style={[styles.statLabel, { fontSize: labelSize, marginTop: labelSize * 0.25 }]}>{label}</Text>
    </View>
  );
}

const NaturalLayout = forwardRef(function NaturalLayout(
  { width, height, textScale, detail, stats, title, subtitle, samples, maxDepthMeters, depthTop, depthBottom, showDepthAxis, photoUri, gradient, profileVariant, watermark },
  ref,
) {
  const m = cardMetrics(width, height, textScale);
  const brief = detail === 'brief';
  const axisWidth = depthAxisWidth(width, showDepthAxis && !brief);
  const chartWidth = m.contentWidth - (axisWidth ? axisWidth + m.pad * 0.3 : 0);
  const valueSize = m.type(brief ? 0.048 : 0.032, brief ? 18 : 13.5);
  const labelSize = m.type(0.0135, 9.5);
  const chip = { radius: width * 0.03, padV: width * 0.018, padH: width * 0.02 };
  const mark = (watermark || '').trim();

  return (
    <View ref={ref} collapsable={false} style={[styles.card, { width, height }]}>
      <CardBackground
        gradient={gradient}
        photoUri={photoUri}
        scrim={SCRIM}
        scrimHeight={height * (brief ? 0.46 : 0.56)}
        scrimStops={[0, 0.45, 1]}
        // A teal water-wash over the whole photo, not just the bottom fade —
        // this theme should read as underwater/organic at a glance.
        tint="rgba(8,44,38,0.2)"
      />
      <View style={[styles.content, { paddingBottom: m.pad, paddingHorizontal: m.pad }]}>
        {title ? (
          <Text numberOfLines={1} style={[styles.title, { fontSize: m.type(brief ? 0.044 : 0.034, 13.5) }]}>{title}</Text>
        ) : null}
        {subtitle ? (
          <Text numberOfLines={1} style={[styles.subtitle, { fontSize: m.type(0.024, 10.5), marginTop: m.pad * 0.12 }]}>
            {subtitle}
          </Text>
        ) : null}
        <View style={{ alignItems: 'center', marginTop: m.pad * 0.28, marginBottom: m.pad * 0.28 }}>
          <WaveDivider width={width} />
        </View>
        {brief ? null : (
          <View style={styles.chartRow}>
            <ProfileCurve
              color={ACCENT}
              fillOpacity={0.5}
              height={m.chartHeight}
              maxDepthMeters={maxDepthMeters}
              samples={samples}
              variant={profileVariant}
              width={chartWidth}
            />
            {axisWidth ? (
              <DepthAxis
                bottom={depthBottom}
                color="rgba(234,255,250,0.72)"
                fontSize={labelSize}
                height={m.chartHeight}
                top={depthTop}
                width={axisWidth}
              />
            ) : null}
          </View>
        )}
        <View style={[styles.statRow, { marginTop: m.pad * (brief ? 0.5 : 0.55), gap: m.pad * 0.22 }]}>
          {stats.map((stat) => (
            <Stat key={stat.key} chip={chip} label={stat.label} labelSize={labelSize} value={stat.value} valueSize={valueSize} />
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

export default NaturalLayout;

const styles = StyleSheet.create({
  // Big, soft rounded corners — an organic, worn-sea-glass shape distinct from
  // Techy's sharp bezel and Elegant's thin-matted rectangle.
  card: { backgroundColor: '#04120F', borderRadius: 34, overflow: 'hidden' },
  content: { bottom: 0, left: 0, position: 'absolute', right: 0 },
  title: { color: FOAM, fontWeight: '700', letterSpacing: 0.2, textAlign: 'center' },
  subtitle: { color: 'rgba(234,255,250,0.65)', fontWeight: '600', letterSpacing: 0.3, textAlign: 'center' },
  chartRow: { alignItems: 'center', flexDirection: 'row' },
  statRow: { flexDirection: 'row' },
  stat: { alignItems: 'center', backgroundColor: 'rgba(92,224,198,0.14)', flex: 1 },
  statValue: { color: FOAM, fontWeight: '800' },
  statLabel: { color: 'rgba(234,255,250,0.7)', fontWeight: '600', letterSpacing: 0.4 },
  watermark: {
    color: 'rgba(234,255,250,0.5)',
    fontWeight: '700',
    letterSpacing: 2.5,
    textAlign: 'center',
    textTransform: 'lowercase',
  },
});
