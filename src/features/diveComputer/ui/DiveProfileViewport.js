import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { colors } from '../../../theme';
import { metersToDepthUnit, selectDepthRange } from './depthScale';
import { buildDiveProfileGeometry } from './profileGeometry';

const GRAPH_HEIGHT = 116;
const SVG_HEIGHT = 134;
const LABEL_GUTTER = 30;

function formatElapsed(seconds) {
  const totalMinutes = Math.floor((Number(seconds) || 0) / 60);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  return `${Math.floor(totalMinutes / 60)}:${String(totalMinutes % 60).padStart(2, '0')}`;
}

export default function DiveProfileViewport({ depthUnit = 'ft', focused = false, simulation }) {
  const scrollRef = useRef(null);
  const [availableWidth, setAvailableWidth] = useState(320);
  const [followLive, setFollowLive] = useState(true);
  const samples = simulation.profile.samples;
  const maximumDepthMeters = Math.max(simulation.dive.maximumDepthMeters, ...samples.map((sample) => sample.depthMeters));
  const depthRange = selectDepthRange(maximumDepthMeters, depthUnit);
  const graphWidth = Math.max(1, availableWidth - LABEL_GUTTER);
  const geometry = useMemo(
    () => buildDiveProfileGeometry(samples, graphWidth, GRAPH_HEIGHT, depthRange.maximumMeters),
    [depthRange.maximumMeters, graphWidth, samples],
  );
  const currentPoint = geometry.points[geometry.points.length - 1];

  const scrollToLive = () => {
    setFollowLive(true);
    scrollRef.current?.scrollToEnd({ animated: true });
  };

  return (
    <View
      accessibilityLabel="Canonical dive profile"
      onLayout={(event) => setAvailableWidth(event.nativeEvent.layout.width)}
      style={[styles.section, focused && styles.sectionFocused]}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>DIVE PROFILE</Text>
          <Text style={styles.caption}>Five-second history · drag to review</Text>
        </View>
        <View style={styles.headerStatus}>
          {geometry.scrolling ? (
            <Pressable
              accessibilityLabel="Follow live dive profile"
              accessibilityRole="button"
              onPress={scrollToLive}
              style={[styles.liveButton, followLive && styles.liveButtonActive]}
            >
              <Text style={[styles.liveText, followLive && styles.liveTextActive]}>LIVE</Text>
            </Pressable>
          ) : null}
          <Text style={styles.range}>{`0-${depthRange.maximum} ${depthRange.unit}`}</Text>
        </View>
      </View>
      <View style={styles.graphRow}>
        <View style={[styles.depthLabels, { height: GRAPH_HEIGHT }]}> 
          <Text style={styles.axisText}>0</Text>
          <Text style={styles.axisText}>{Math.round(depthRange.maximum / 2)}</Text>
          <Text style={styles.axisText}>{depthRange.maximum}</Text>
        </View>
        <ScrollView
          accessibilityLabel="Scrollable dive profile timeline"
          bounces={false}
          horizontal
          onContentSizeChange={() => {
            if (followLive) scrollRef.current?.scrollToEnd({ animated: false });
          }}
          onScrollBeginDrag={() => setFollowLive(false)}
          ref={scrollRef}
          showsHorizontalScrollIndicator={geometry.scrolling}
          style={{ width: graphWidth }}
        >
          <Svg accessibilityLabel="Dive depth over simulation time" height={SVG_HEIGHT} width={geometry.contentWidth}>
            {geometry.timeTicks.map((tick) => (
              <Line
                key={`time-line-${tick.simulationSeconds}`}
                stroke="rgba(167,196,216,.11)"
                strokeWidth="1"
                x1={tick.x}
                x2={tick.x}
                y1="0"
                y2={GRAPH_HEIGHT}
              />
            ))}
            {geometry.diveStarts.slice(1).map((start) => (
              <Line
                key={`dive-start-${start.diveSessionId}`}
                stroke="rgba(112,221,246,.38)"
                strokeDasharray="3 3"
                strokeWidth="1"
                x1={start.x}
                x2={start.x}
                y1="0"
                y2={GRAPH_HEIGHT}
              />
            ))}
            <Line stroke="rgba(167,196,216,.18)" strokeWidth="1" x1="0" x2={geometry.contentWidth} y1="0" y2="0" />
            <Line stroke="rgba(167,196,216,.12)" strokeWidth="1" x1="0" x2={geometry.contentWidth} y1={GRAPH_HEIGHT / 2} y2={GRAPH_HEIGHT / 2} />
            <Line stroke="rgba(167,196,216,.18)" strokeWidth="1" x1="0" x2={geometry.contentWidth} y1={GRAPH_HEIGHT} y2={GRAPH_HEIGHT} />
            {geometry.linePath ? <Path d={geometry.linePath} fill="none" stroke={colors.cyan} strokeLinejoin="round" strokeWidth="2.5" /> : null}
            {currentPoint ? <Circle cx={currentPoint.x} cy={currentPoint.y} fill={colors.white} r="3.5" stroke={colors.cyan} strokeWidth="2" /> : null}
            {geometry.timeTicks.map((tick) => (
              <SvgText
                fill={colors.faint}
                fontSize="8"
                fontWeight="700"
                key={`time-label-${tick.simulationSeconds}`}
                textAnchor={tick.x === 0 ? 'start' : 'middle'}
                x={tick.x}
                y={SVG_HEIGHT - 3}
              >
                {formatElapsed(tick.elapsedSeconds)}
              </SvgText>
            ))}
          </Svg>
        </ScrollView>
      </View>
      <Text style={styles.currentDepth}>{`Current ${metersToDepthUnit(simulation.environment.depthMeters, depthUnit).toFixed(0)} ${depthUnit}`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  axisText: { color: colors.faint, fontSize: 8, fontVariant: ['tabular-nums'], fontWeight: '800' },
  caption: { color: colors.muted, fontSize: 10, lineHeight: 14, marginTop: 2 },
  currentDepth: { color: colors.muted, fontSize: 9, fontVariant: ['tabular-nums'], fontWeight: '800', marginTop: 5, textAlign: 'right' },
  depthLabels: { justifyContent: 'space-between', paddingRight: 6, width: LABEL_GUTTER },
  eyebrow: { color: colors.text, fontSize: 11, fontWeight: '900', letterSpacing: 1.1 },
  graphRow: { flexDirection: 'row', marginTop: 12 },
  header: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between' },
  headerStatus: { alignItems: 'flex-end', gap: 5 },
  liveButton: { borderColor: colors.line, borderRadius: 3, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2 },
  liveButtonActive: { backgroundColor: 'rgba(112,221,246,.12)', borderColor: colors.cyan },
  liveText: { color: colors.muted, fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  liveTextActive: { color: colors.cyan },
  range: { color: colors.cyan, fontSize: 10, fontVariant: ['tabular-nums'], fontWeight: '900' },
  section: { borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 20, paddingVertical: 14 },
  sectionFocused: { backgroundColor: 'rgba(112,221,246,.06)', borderBottomColor: colors.cyan, borderTopColor: colors.cyan },
});
