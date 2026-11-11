// Connection + calibration card for the Divesoft DNA. Collapses to one line once
// the analyzer is connected and calibrated, so the log stays front and centre.
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { StatusBanner } from '../../components/ScreenLayout';
import { Card, PrimaryButton, SecondaryButton, Stat } from '../../components/Ui';
import { colors, radii, spacing } from '../../theme';
import { AIR_O2_PERCENT, cellHealth } from './model';
import { ageLabel } from './nitroxLog';

const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });
const TONES = { good: colors.good, warning: colors.warning, danger: colors.danger, info: colors.cyan };
export const CALIBRATION_STALE_MS = 6 * 60 * 60 * 1000;

const STATUS_LABEL = {
  idle: 'Not connected',
  scanning: 'Searching for analyzer…',
  connecting: 'Connecting…',
  connected: 'Connected',
  error: 'Not connected',
};

export default function AnalyzerPanel({ analyzer }) {
  const { status, error, device, battery, measurement, lastPacket, calibration, o2, stable, packetLog } = analyzer;
  const [expanded, setExpanded] = useState(true);
  const [showInspector, setShowInspector] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const connected = status === 'connected';
  const busy = status === 'scanning' || status === 'connecting';
  const health = cellHealth(calibration);
  const stale = calibration && now - new Date(calibration.at).getTime() > CALIBRATION_STALE_MS;
  const ready = connected && calibration && !stale;

  // Fold away once ready; open again if anything needs attention.
  useEffect(() => { setExpanded(!ready); }, [ready]);

  const statusColor = connected ? (ready ? colors.good : colors.warning) : busy ? colors.cyan : colors.faint;
  const summary = !connected ? STATUS_LABEL[status]
    : !calibration ? 'Connected · needs calibration'
      : stale ? 'Connected · calibration is over 6 h old'
        : `Calibrated ${ageLabel(calibration.at, now)}${battery != null ? ` · Battery ${battery}%` : ''}`;

  return (
    <Card>
      <Pressable accessibilityRole="button" accessibilityLabel={`Analyzer, ${summary}`} disabled={!connected} onPress={() => setExpanded((v) => !v)} style={styles.row}>
        <View style={[styles.dot, { backgroundColor: statusColor }]} />
        <View style={styles.flex}>
          <Text style={styles.deviceName}>{device?.name || 'Divesoft DNA'}</Text>
          <Text style={styles.muted}>{summary}</Text>
        </View>
        {connected && o2 != null ? <Text style={styles.live}>{o2.toFixed(1)}%</Text> : null}
        {connected ? <Text style={styles.chevron}>{expanded ? '⌃' : '⌄'}</Text> : null}
      </Pressable>

      {error ? <StatusBanner tone="warning" label="CONNECTION" body={error} style={styles.gapTop} /> : null}
      {!connected ? (
        <View style={styles.gapTop}>
          <PrimaryButton label={busy ? STATUS_LABEL[status] : 'Connect analyzer'} disabled={busy} onPress={analyzer.connect} />
        </View>
      ) : null}

      {connected && expanded ? (
        <View style={styles.gapTop}>
          <Text style={styles.label}>CALIBRATION</Text>
          {calibration ? (
            <>
              <Text style={styles.body}>
                Air ({calibration.referencePercent}%) at {calibration.millivolts.toFixed(2)} mV
                {calibration.pressureMbar ? ` · ${calibration.pressureMbar.toFixed(0)} mbar` : ''} · {ageLabel(calibration.at, now)}
              </Text>
              <Text style={[styles.health, { color: TONES[health.tone] }]}>{health.label}</Text>
            </>
          ) : (
            <Text style={styles.body}>Expose the sensor to fresh air and wait for the reading to settle, then calibrate.</Text>
          )}
          <View style={[styles.row, styles.gapTop]}>
            <PrimaryButton
              style={styles.flex}
              label={stable ? `Calibrate to ${AIR_O2_PERCENT}% air` : 'Waiting for stable reading…'}
              disabled={!stable || !measurement}
              onPress={analyzer.calibrate}
            />
            {calibration ? <SecondaryButton label="Clear" onPress={analyzer.clearCalibration} /> : null}
          </View>

          <View style={[styles.statRow, styles.gapTop]}>
            <Stat style={styles.flex} label="Cell" value={measurement ? `${measurement.millivolts.toFixed(2)} mV` : '—'} />
            <Stat style={styles.flex} label="Pressure" value={measurement ? `${measurement.pressureMbar.toFixed(1)} mbar` : '—'} />
          </View>
          <View style={[styles.row, styles.gapTop]}>
            <Pressable accessibilityRole="button" onPress={() => setShowInspector((v) => !v)} style={styles.flex}>
              <Text style={styles.link}>{showInspector ? 'Hide' : 'Show'} protocol inspector</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={analyzer.disconnect}>
              <Text style={styles.link}>Disconnect</Text>
            </Pressable>
          </View>
          {showInspector ? (
            <View style={styles.inspector}>
              {lastPacket ? (
                <Text style={styles.mono}>
                  header {lastPacket.header.map((b) => b.toString(16).padStart(2, '0')).join(' ')}{'\n'}
                  signal A {lastPacket.signalA} · B {lastPacket.signalB}{'\n'}
                  smoothed {measurement ? `${measurement.millivolts.toFixed(3)} mV over ${measurement.sampleCount} packets` : '—'}{'\n'}
                  serial key {device?.serial}
                </Text>
              ) : null}
              {packetLog.map((p) => (
                <Text key={`${p.t}-${p.hex}`} style={styles.monoFaint}>{new Date(p.t).toLocaleTimeString()}  {p.hex}</Text>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  gapTop: { marginTop: spacing.md },
  dot: { borderRadius: 6, height: 12, width: 12 },
  deviceName: { color: colors.text, fontSize: 17, fontWeight: '800' },
  muted: { color: colors.muted, fontSize: 13, marginTop: 2 },
  live: { color: colors.text, fontSize: 18, fontVariant: ['tabular-nums'], fontWeight: '800' },
  chevron: { color: colors.cyan, fontSize: 18, fontWeight: '700', width: 18, textAlign: 'center' },
  label: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 8 },
  body: { color: colors.text, fontSize: 14, lineHeight: 21 },
  health: { fontSize: 13, fontWeight: '800', marginTop: 6 },
  statRow: { flexDirection: 'row', gap: 10 },
  link: { color: colors.cyan, fontSize: 13, fontWeight: '700' },
  inspector: { backgroundColor: colors.black, borderRadius: radii.sm, gap: 3, marginTop: 6, padding: 10 },
  mono: { color: colors.text, fontFamily: MONO, fontSize: 11, lineHeight: 16, marginBottom: 6 },
  monoFaint: { color: colors.muted, fontFamily: MONO, fontSize: 11 },
});
