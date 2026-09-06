import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, PrimaryButton, ProgressBar, SecondaryButton } from '../../components/Ui';
import { colors, radii } from '../../theme';
import { looksLikeSuunto } from './diveComputerBle';
import DownloadConsole from './DownloadConsole';
import useDiveComputerDownload from './useDiveComputerDownload';

const SUUNTO_PAIRING_HINT =
  'Suunto EON / D5 bonds with one device at a time. If you have the Suunto app installed, '
  + 'force-quit it first — it syncs in the background and can be the one holding that single '
  + 'connection slot, which also keeps the computer from showing up here even with a fresh scan. '
  + 'Then keep this screen open and put the computer in its pairing screen. iOS asks to pair — '
  + 'enter the code shown on the computer; the first attempt often drops, then reconnects. If it '
  + 'still says "connection refused", remove the existing pairing on the computer and in iPhone '
  + 'Settings → Bluetooth.';

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
        <Text style={styles.deviceId}>
          {device.remembered
            ? 'Used before — not seen in this scan, tap to reconnect'
            : device.serviceHint || (device.isLikely ? 'Likely dive computer' : device.id.slice(0, 17))}
        </Text>
      </View>
      <SignalDots rssi={device.rssi} />
    </Pressable>
  );
}

// Both download modes are always offered as buttons. "Sync new dives" only
// pulls dives that aren't already saved (fast); "Full re-download" reads the
// whole computer — needed the first time and to recover a dive deleted in the
// app. A force re-import sits below as an escape hatch.
//
// The clock-sync action only appears when `connectedDevice.timeSyncSupported`
// is true — set at connect time from the device's actual protocol family, not
// guessed — so it's never offered on a computer that can only ever reject it
// (the whole Aqualung/Oceanic/Sherwood family among others). Rendering here
// (rather than a separate prompt) means it's available both as a standing
// manual action and right after a download finishes, since this component
// renders in both places already.
function DownloadActions({ onDisconnect, download, connectedDevice, timeSync, onSyncClock }) {
  const syncingClock = timeSync?.status === 'running';
  return (
    <>
      <View style={styles.doneActions}>
        <PrimaryButton
          label="Sync new dives"
          onPress={() => download({ incremental: true })}
          style={styles.flexButton}
        />
        <SecondaryButton
          label="Full re-download"
          onPress={() => download()}
          style={styles.flexButton}
        />
      </View>
      {connectedDevice?.timeSyncSupported ? (
        <>
          <SecondaryButton
            label={syncingClock ? 'Syncing clock…' : 'Sync computer clock to phone'}
            onPress={onSyncClock}
            disabled={syncingClock}
            style={styles.backButton}
          />
          {timeSync?.status === 'done' ? (
            <Text style={styles.timeSyncOk}>✓ Clock set to this phone's current time.</Text>
          ) : timeSync?.status === 'error' && timeSync.error ? (
            <Text style={styles.timeSyncErrorText}>{timeSync.error}</Text>
          ) : null}
        </>
      ) : null}
      <SecondaryButton label="Disconnect" onPress={onDisconnect} style={styles.backButton} />
      <Pressable onPress={() => download({ force: true })} hitSlop={8} style={styles.linkRow}>
        <Text style={styles.linkText}>Re-import every dive (ignore what's already saved)</Text>
      </Pressable>
    </>
  );
}

/**
 * The download flow's UI. All transfer state lives in the module-level
 * `downloadService` (via `useDiveComputerDownload`), so leaving this screen does
 * NOT interrupt an in-progress download — the logbook screen picks the finished
 * dives up when it next renders.
 *
 * @param {object} props
 * @param {() => void} props.onClose
 */
export default function DiveComputerDownloadPanel({ onClose }) {
  const {
    supported, status, devices, connectedDevice, progress, summary, error, log, baselineKnown, timeSync,
    scan, stopScan, connect, disconnect, download, cancel, clearLog, syncClock,
  } = useDiveComputerDownload();

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
        Wake your dive computer and put it in Bluetooth / upload mode, then scan. You can leave
        this screen while it downloads — the transfer keeps running.
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
                {summary ? `${summary.downloaded} read · ${summary.saved} new` : 'Reading dives…'}
              </Text>
              <SecondaryButton label="Stop" onPress={cancel} style={styles.backButton} />
            </>
          ) : status === 'done' ? (
            <>
              <Text style={styles.body}>
                {summary
                  ? `Read ${summary.downloaded} ${summary.downloaded === 1 ? 'dive' : 'dives'} — `
                    + `${summary.saved} added`
                    + (summary.duplicate ? `, ${summary.duplicate} already in your log` : '')
                    + '. Any matches with another computer are on the next screen.'
                  : 'No dives read.'}
              </Text>
              <DownloadActions onDisconnect={disconnect} download={download} connectedDevice={connectedDevice} timeSync={timeSync} onSyncClock={syncClock} />
            </>
          ) : (
            <>
              <Text style={styles.body}>
                {baselineKnown
                  ? '“Sync new dives” pulls only dives that aren’t already in your logbook. '
                    + '“Full re-download” reads everything (use it to get back a dive you deleted here).'
                  : 'First time: “Full re-download” reads every dive on the computer — with a large log '
                    + 'this can take a while. After that, “Sync new dives” is quick.'}
              </Text>
              <DownloadActions onDisconnect={disconnect} download={download} connectedDevice={connectedDevice} timeSync={timeSync} onSyncClock={syncClock} />
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

      <DownloadConsole log={log} onClear={clearLog} />
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
  timeSyncOk: { color: colors.good, fontSize: 12, fontWeight: '700', marginTop: 8, textAlign: 'center' },
  timeSyncErrorText: { color: colors.danger, fontSize: 12, fontWeight: '700', marginTop: 8, textAlign: 'center' },
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
