import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, PrimaryButton, SecondaryButton } from '../../components/Ui';
import { colors, radii, spacing } from '../../theme';
import useDiveComputerDownload from './useDiveComputerDownload';

function SignalDots({ rssi }) {
  if (rssi == null) return null;
  const bars = rssi > -60 ? 3 : rssi > -75 ? 2 : 1;
  return (
    <View style={styles.signal}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={[styles.signalDot, i < bars && styles.signalDotOn]} />
      ))}
    </View>
  );
}

function DeviceRow({ device, onConnect, disabled }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Connect to ${device.name}`}
      disabled={disabled}
      onPress={() => onConnect(device.id)}
      style={({ pressed }) => [styles.deviceRow, pressed && styles.pressed, disabled && styles.rowDisabled]}
    >
      <View style={styles.deviceInfo}>
        <Text style={styles.deviceName}>{device.name}</Text>
        <Text style={styles.deviceId}>{device.isLikely ? 'Dive computer' : device.id.slice(0, 17)}</Text>
      </View>
      <SignalDots rssi={device.rssi} />
    </Pressable>
  );
}

export default function DiveComputerDownloadPanel({ onClose }) {
  const { supported, status, devices, connectedDevice, error, scan, stopScan, connect, disconnect } =
    useDiveComputerDownload();

  if (!supported) {
    return (
      <Card style={styles.card}>
        <Text style={styles.title}>Bluetooth not available</Text>
        <Text style={styles.body}>
          Dive-computer download needs the full app build. Reopen DMZ Scuba from your home screen
          rather than Expo Go.
        </Text>
        <SecondaryButton label="Back" onPress={onClose} style={styles.backButton} />
      </Card>
    );
  }

  const scanning = status === 'scanning';
  const busy = status === 'connecting';

  return (
    <Card style={styles.card}>
      <Text style={styles.title}>Download from dive computer</Text>
      <Text style={styles.body}>
        Wake your dive computer and put it in Bluetooth / upload mode, then scan.
      </Text>

      {connectedDevice ? (
        <View style={styles.connectedBox}>
          <Text style={styles.connectedLabel}>CONNECTED</Text>
          <Text style={styles.connectedName}>{connectedDevice.name}</Text>
          <Text style={styles.body}>
            Reading dives from the computer arrives in the next update. The connection is ready.
          </Text>
          <SecondaryButton label="Disconnect" onPress={disconnect} style={styles.backButton} />
        </View>
      ) : (
        <>
          {status === 'error' && error ? <Text style={styles.error}>{error}</Text> : null}

          {scanning ? (
            <View style={styles.scanningRow}>
              <ActivityIndicator color={colors.cyan} />
              <Text style={styles.scanningText}>Scanning…</Text>
              <Pressable onPress={stopScan} hitSlop={8}><Text style={styles.stopText}>Stop</Text></Pressable>
            </View>
          ) : (
            <PrimaryButton
              label={busy ? 'Connecting…' : 'Scan for dive computers'}
              onPress={scan}
              disabled={busy}
              style={styles.scanButton}
            />
          )}

          {devices.length > 0 ? (
            <View style={styles.deviceList}>
              {devices.map((device) => (
                <DeviceRow key={device.id} device={device} onConnect={connect} disabled={busy} />
              ))}
            </View>
          ) : scanning ? null : (
            <Text style={styles.hint}>No devices yet. Make sure Bluetooth is on.</Text>
          )}

          <SecondaryButton label="Back" onPress={onClose} style={styles.backButton} />
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {},
  title: { color: colors.text, fontSize: 16, fontWeight: '900' },
  body: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 6 },
  scanButton: { marginTop: 14 },
  backButton: { marginTop: 12 },
  error: {
    backgroundColor: 'rgba(255,127,127,0.1)',
    borderColor: 'rgba(255,127,127,0.35)',
    borderRadius: radii.sm,
    borderWidth: 1,
    color: colors.danger,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 12,
    padding: 10,
  },
  scanningRow: { alignItems: 'center', flexDirection: 'row', gap: 10, marginTop: 16 },
  scanningText: { color: colors.text, flex: 1, fontSize: 13, fontWeight: '700' },
  stopText: { color: colors.cyan, fontSize: 13, fontWeight: '800' },
  hint: { color: colors.faint, fontSize: 11, marginTop: 12 },
  deviceList: { gap: 8, marginTop: 14 },
  deviceRow: {
    alignItems: 'center',
    backgroundColor: colors.backgroundRaised,
    borderColor: colors.lineStrong,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  rowDisabled: { opacity: 0.5 },
  pressed: { opacity: 0.75 },
  deviceInfo: { flex: 1 },
  deviceName: { color: colors.text, fontSize: 14, fontWeight: '800' },
  deviceId: { color: colors.faint, fontSize: 11, marginTop: 2 },
  signal: { flexDirection: 'row', gap: 3 },
  signalDot: { backgroundColor: colors.line, borderRadius: 2, height: 12, width: 4 },
  signalDotOn: { backgroundColor: colors.cyan },
  connectedBox: {
    backgroundColor: 'rgba(112,226,163,0.08)',
    borderColor: 'rgba(112,226,163,0.3)',
    borderRadius: radii.md,
    borderWidth: 1,
    marginTop: 14,
    padding: 13,
  },
  connectedLabel: { color: colors.good, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  connectedName: { color: colors.text, fontSize: 16, fontWeight: '900', marginTop: 4 },
});
