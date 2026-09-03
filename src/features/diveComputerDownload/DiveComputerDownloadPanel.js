import { useCallback } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, PrimaryButton, ProgressBar, SecondaryButton } from '../../components/Ui';
import { colors, radii, spacing } from '../../theme';
import { looksLikeSuunto } from './diveComputerBle';
import { computerDiveKey, computerLogFromDownload } from './computerLogFromDownload';
import useDiveComputerDownload from './useDiveComputerDownload';

const SUUNTO_PAIRING_HINT =
  'Suunto EON / D5 bonds with one device at a time. Keep this screen open and put the '
  + 'computer in its pairing screen. iOS asks to pair — enter the code shown on the computer; '
  + 'the first attempt often drops, then reconnects. If it says "connection refused", first '
  + 'remove the existing pairing on the computer and in iPhone Settings → Bluetooth.';

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
      onPress={() => onConnect(device.id, { name: device.name })}
      style={({ pressed }) => [styles.deviceRow, pressed && styles.pressed, disabled && styles.rowDisabled]}
    >
      <View style={styles.deviceInfo}>
        <Text style={styles.deviceName}>{device.name}</Text>
        <Text style={styles.deviceId}>{device.isLikely ? 'Likely dive computer' : device.id.slice(0, 17)}</Text>
      </View>
      <SignalDots rssi={device.rssi} />
    </Pressable>
  );
}

/**
 * @param {object} props
 * @param {() => void} props.onClose
 * @param {Set<string>} props.knownComputerKeys
 * @param {(logPartial: object) => Promise<'saved'|'duplicate'>} props.importComputerLog
 */
export default function DiveComputerDownloadPanel({ onClose, knownComputerKeys, importComputerLog }) {
  const saveDive = useCallback(async (rawDive) => {
    // vendor/product/serial come resolved from the native libdivecomputer descriptor.
    const log = computerLogFromDownload(rawDive);
    const key = computerDiveKey(log.device.vendor, log.device.product, log.fingerprint);
    if (key && knownComputerKeys?.has(key)) return 'duplicate';
    await importComputerLog(log);
    return 'saved';
  }, [importComputerLog, knownComputerKeys]);

  const {
    supported, status, devices, connectedDevice, progress, summary, error,
    scan, stopScan, connect, disconnect, download, cancel,
  } = useDiveComputerDownload({ onDiveDownloaded: saveDive });

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
  const connecting = status === 'connecting';
  const downloading = status === 'downloading';
  const pct = progress && progress.maximum > 0 ? progress.current / progress.maximum : 0;
  const showSuuntoHint = !downloading && status !== 'done'
    && (devices.some((d) => looksLikeSuunto(d.name)) || looksLikeSuunto(connectedDevice?.name));

  return (
    <Card style={styles.card}>
      <Text style={styles.title}>Download from dive computer</Text>
      <Text style={styles.body}>
        Wake your dive computer and put it in Bluetooth / upload mode, then scan.
      </Text>

      {status === 'error' && error ? <Text style={styles.error}>{error}</Text> : null}

      {showSuuntoHint ? <Text style={styles.suuntoHint}>{SUUNTO_PAIRING_HINT}</Text> : null}

      {connectedDevice ? (
        <View style={styles.connectedBox}>
          <Text style={styles.connectedLabel}>{downloading ? 'DOWNLOADING' : status === 'done' ? 'DONE' : 'CONNECTED'}</Text>
          <Text style={styles.connectedName}>{connectedDevice.name}</Text>

          {downloading ? (
            <>
              <ProgressBar value={pct} />
              <Text style={styles.progressText}>
                {summary ? `${summary.saved} new · ${summary.downloaded} read` : 'Reading dives…'}
              </Text>
              <SecondaryButton label="Stop" onPress={cancel} style={styles.backButton} />
            </>
          ) : status === 'done' ? (
            <>
              <Text style={styles.body}>
                {summary
                  ? `Added ${summary.saved} new ${summary.saved === 1 ? 'dive' : 'dives'} (${summary.downloaded} on the computer).`
                  : 'No new dives to add.'}
              </Text>
              <View style={styles.doneActions}>
                <PrimaryButton label="Download again" onPress={() => download()} style={styles.flexButton} />
                <SecondaryButton label="Disconnect" onPress={disconnect} style={styles.flexButton} />
              </View>
              <Pressable onPress={() => download({ full: true })} hitSlop={8} style={styles.linkRow}>
                <Text style={styles.linkText}>Re-download every dive (ignore last sync)</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={styles.body}>Connection ready.</Text>
              <View style={styles.doneActions}>
                <PrimaryButton label="Download dives" onPress={() => download()} style={styles.flexButton} />
                <SecondaryButton label="Disconnect" onPress={disconnect} style={styles.flexButton} />
              </View>
              <Pressable onPress={() => download({ full: true })} hitSlop={8} style={styles.linkRow}>
                <Text style={styles.linkText}>Re-download every dive (ignore last sync)</Text>
              </Pressable>
            </>
          )}
        </View>
      ) : (
        <>
          {scanning ? (
            <View style={styles.scanningRow}>
              <ActivityIndicator color={colors.cyan} />
              <Text style={styles.scanningText}>Scanning…</Text>
              <Pressable onPress={stopScan} hitSlop={8}><Text style={styles.stopText}>Stop</Text></Pressable>
            </View>
          ) : (
            <PrimaryButton
              label={connecting ? 'Connecting…' : 'Scan for dive computers'}
              onPress={scan}
              disabled={connecting}
              style={styles.scanButton}
            />
          )}

          {devices.length > 0 ? (
            <View style={styles.deviceList}>
              {devices.map((device) => (
                <DeviceRow key={device.id} device={device} onConnect={connect} disabled={connecting} />
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
  flexButton: { flex: 1 },
  doneActions: { flexDirection: 'row', gap: 9, marginTop: 12 },
  linkRow: { marginTop: 10, alignItems: 'center' },
  linkText: { color: colors.cyan, fontSize: 12, fontWeight: '700' },
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
  suuntoHint: {
    backgroundColor: 'rgba(112,221,246,0.08)',
    borderColor: 'rgba(112,221,246,0.3)',
    borderRadius: radii.sm,
    borderWidth: 1,
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 12,
    padding: 10,
  },
  progressText: { color: colors.muted, fontSize: 12, marginTop: 8 },
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
  connectedName: { color: colors.text, fontSize: 16, fontWeight: '900', marginBottom: 8, marginTop: 4 },
});
