import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { DEEP_STOP_STATUS, SAFETY_STOP_STATUS, SIMULATION_LIMITS } from '../../../lib/diveSimulation';
import { colors } from '../../../theme';
import {
  depthToViewportFraction,
  depthUnitToMeters,
  metersToDepthUnit,
  selectDepthRange,
  selectDiverOrientation,
} from './depthScale';

const SURFACE_HEIGHT = 24;
const MARKER_HEIGHT = 30;

function DiverMarker({ orientation }) {
  const direction = orientation === 'ascending' ? 'ASC' : orientation === 'descending' ? 'DESC' : 'LEVEL';
  return (
    <View accessibilityLabel={`Diver ${orientation}`} style={styles.markerShell}>
      <View style={styles.diverIcon}>
        <View style={styles.tank} />
        <View style={styles.head} />
        <View style={styles.body} />
        <View style={styles.finTop} />
        <View style={styles.finBottom} />
      </View>
      <Text allowFontScaling={false} style={styles.direction}>{direction}</Text>
    </View>
  );
}

export default function WaterColumnViewport({ depthUnit = 'ft', focused = false, height, simulation, width }) {
  const depthMeters = simulation.environment.depthMeters;
  const verticalRateMpm = simulation.environment.verticalRateMpm;
  const depthRange = selectDepthRange(depthMeters, depthUnit);
  const trackHeight = Math.max(1, height - SURFACE_HEIGHT);
  const markerTravel = Math.max(1, trackHeight - MARKER_HEIGHT);
  const markerTop = SURFACE_HEIGHT + depthToViewportFraction(depthMeters, depthRange.maximumMeters) * markerTravel;
  const orientation = selectDiverOrientation(verticalRateMpm);
  const safetyStatus = simulation.safetyStop.status;
  const stopTop = SURFACE_HEIGHT + depthToViewportFraction(
    Math.max(0, simulation.safetyStop.stopDepthMeters - SIMULATION_LIMITS.safetyStopArmToleranceMeters),
    depthRange.maximumMeters,
  ) * trackHeight;
  const stopBottom = SURFACE_HEIGHT + depthToViewportFraction(simulation.safetyStop.stopDepthMeters + SIMULATION_LIMITS.safetyStopArmToleranceMeters, depthRange.maximumMeters) * trackHeight;
  const deepStatus = simulation.deepStop.status;
  const deepStopVisible = deepStatus === DEEP_STOP_STATUS.ELIGIBLE || deepStatus === DEEP_STOP_STATUS.ACTIVE;
  const deepStopTop = SURFACE_HEIGHT + depthToViewportFraction(simulation.deepStop.stopDepthMeters - SIMULATION_LIMITS.deepStopToleranceMeters, depthRange.maximumMeters) * trackHeight;
  const deepStopBottom = SURFACE_HEIGHT + depthToViewportFraction(simulation.deepStop.stopDepthMeters + SIMULATION_LIMITS.deepStopToleranceMeters, depthRange.maximumMeters) * trackHeight;
  const ceilingMeters = simulation.physiology.decompression.ceilingMeters;
  const ceilingVisible = simulation.physiology.decompression.required && ceilingMeters > 0;
  const ceilingTop = SURFACE_HEIGHT + depthToViewportFraction(ceilingMeters, depthRange.maximumMeters) * trackHeight;

  return (
    <View accessibilityLabel="Vertical simulated depth" style={[styles.viewport, focused && styles.viewportFocused, { height, width }]}>
      <View style={styles.surface}>
        <Text allowFontScaling={false} style={styles.surfaceText}>SURFACE</Text>
      </View>
      <LinearGradient colors={['#0C6685', '#06405E', '#031D35', '#020C18']} style={[styles.water, { top: SURFACE_HEIGHT }]}>
        {depthRange.ticks.map((tick) => {
          const tickMeters = depthUnitToMeters(tick, depthRange.unit);
          const top = depthToViewportFraction(tickMeters, depthRange.maximumMeters) * trackHeight;
          return (
            <View key={tick} style={[styles.tick, { top }]}>
              <Text allowFontScaling={false} style={styles.tickLabel}>{tick}</Text>
              <View style={styles.tickLine} />
            </View>
          );
        })}
      </LinearGradient>

      <View
        accessibilityLabel={`Safety stop ${safetyStatus}`}
        pointerEvents="none"
        style={[
          styles.stopZone,
          safetyStatus !== SAFETY_STOP_STATUS.NOT_ELIGIBLE && styles.stopZoneApplicable,
          safetyStatus === SAFETY_STOP_STATUS.ACTIVE && styles.stopZoneActive,
          { height: Math.max(3, stopBottom - stopTop), top: stopTop },
        ]}
      >
        <Text allowFontScaling={false} numberOfLines={1} style={styles.stopZoneText}>STOP</Text>
      </View>

      {deepStopVisible ? (
        <View
          accessibilityLabel={`Deep stop ${deepStatus}`}
          pointerEvents="none"
          style={[
            styles.deepStopZone,
            deepStatus === DEEP_STOP_STATUS.ACTIVE && styles.deepStopZoneActive,
            { height: Math.max(3, deepStopBottom - deepStopTop), top: deepStopTop },
          ]}
        >
          <Text allowFontScaling={false} numberOfLines={1} style={styles.deepStopZoneText}>DEEP STOP</Text>
        </View>
      ) : null}

      {ceilingVisible ? (
        <View accessibilityLabel={`Decompression ceiling ${metersToDepthUnit(ceilingMeters, depthUnit).toFixed(0)} ${depthUnit}`} pointerEvents="none" style={[styles.ceiling, { top: ceilingTop }]}>
          <Text allowFontScaling={false} numberOfLines={1} style={styles.ceilingText}>CEILING</Text>
        </View>
      ) : null}

      <View pointerEvents="none" style={[styles.marker, { top: markerTop }]}>
        <DiverMarker orientation={orientation} />
      </View>
      <Text allowFontScaling={false} style={styles.unit}>{depthRange.unit.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { backgroundColor: '#86EAF4', height: 5, left: 12, position: 'absolute', top: 10, width: 15 },
  ceiling: { alignItems: 'center', borderTopColor: colors.danger, borderTopWidth: 2, left: 0, position: 'absolute', right: 0 },
  ceilingText: { backgroundColor: '#471B24', color: '#FFD0D0', fontSize: 6, fontWeight: '900', letterSpacing: 0.5, marginTop: 2, paddingHorizontal: 2 },
  deepStopZone: { backgroundColor: 'rgba(112,221,246,.14)', borderBottomColor: 'rgba(112,221,246,.55)', borderBottomWidth: 1, borderTopColor: 'rgba(112,221,246,.55)', borderTopWidth: 1, left: 0, position: 'absolute', right: 0 },
  deepStopZoneActive: { backgroundColor: 'rgba(112,226,163,.24)', borderBottomColor: colors.good, borderTopColor: colors.good },
  deepStopZoneText: { color: 'rgba(180,238,255,.92)', fontSize: 5.5, fontWeight: '900', letterSpacing: 0.5, marginLeft: 3, marginTop: 2 },
  direction: { color: '#DFF9FF', fontSize: 5.5, fontWeight: '900', letterSpacing: 0.35, marginTop: 2 },
  diverIcon: { height: 20, position: 'relative', width: 42 },
  finBottom: { backgroundColor: '#9CF4FF', height: 3, left: 27, position: 'absolute', top: 14, transform: [{ rotate: '15deg' }], width: 13 },
  finTop: { backgroundColor: '#9CF4FF', height: 3, left: 27, position: 'absolute', top: 8, transform: [{ rotate: '-15deg' }], width: 13 },
  head: { backgroundColor: '#B8FBFF', borderRadius: 4, height: 8, left: 4, position: 'absolute', top: 8, width: 8 },
  marker: { alignItems: 'center', height: MARKER_HEIGHT, left: 0, position: 'absolute', right: 0, zIndex: 8 },
  markerShell: { alignItems: 'center' },
  stopZone: { backgroundColor: 'rgba(240,200,75,.12)', borderBottomColor: 'rgba(240,200,75,.5)', borderBottomWidth: 1, borderTopColor: 'rgba(240,200,75,.5)', borderTopWidth: 1, left: 0, position: 'absolute', right: 0 },
  stopZoneActive: { backgroundColor: 'rgba(112,226,163,.24)', borderBottomColor: colors.good, borderTopColor: colors.good },
  stopZoneApplicable: { backgroundColor: 'rgba(240,200,75,.22)' },
  stopZoneText: { color: 'rgba(255,232,154,.88)', fontSize: 5.5, fontWeight: '900', letterSpacing: 0.5, marginLeft: 3, marginTop: 2 },
  surface: { alignItems: 'center', backgroundColor: '#14303E', borderBottomColor: '#B4F5FF', borderBottomWidth: 2, height: SURFACE_HEIGHT, justifyContent: 'center' },
  surfaceText: { color: '#BDEEF6', fontSize: 6.5, fontWeight: '900', letterSpacing: 0.8 },
  tank: { backgroundColor: '#E5B948', borderColor: '#44370E', borderRadius: 3, borderWidth: 1, height: 16, left: 11, position: 'absolute', top: 3, width: 7 },
  tick: { alignItems: 'center', flexDirection: 'row', left: 2, position: 'absolute', right: 3 },
  tickLabel: { color: '#C8EAF2', fontSize: 7, fontVariant: ['tabular-nums'], fontWeight: '900', width: 22 },
  tickLine: { backgroundColor: 'rgba(212,246,255,.35)', flex: 1, height: StyleSheet.hairlineWidth },
  unit: { bottom: 4, color: 'rgba(216,246,255,.72)', fontSize: 6, fontWeight: '900', letterSpacing: 0.8, position: 'absolute', right: 4 },
  viewport: { backgroundColor: '#031528', borderColor: 'rgba(156,226,241,.38)', borderWidth: 1, overflow: 'hidden', position: 'relative' },
  viewportFocused: { borderColor: colors.cyan, borderWidth: 2, elevation: 8, shadowColor: colors.cyan, shadowOpacity: 0.5, shadowRadius: 9 },
  water: { bottom: 0, left: 0, overflow: 'hidden', position: 'absolute', right: 0 },
});
