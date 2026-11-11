import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, PrimaryButton, ProgressBar, SecondaryButton } from '../../components/Ui';
import { colors, radii } from '../../theme';
import { looksLikeShearwater, looksLikeSuunto } from './diveComputerBle';
import DownloadConsole from './DownloadConsole';
import { describePredive, gasPercent, predivePlan } from './predive';
import useDiveComputerDownload from './useDiveComputerDownload';

// Read-only protocol tools (Suunto settings-file explorer, Shearwater settings
// scan) used to reverse engineer gas sending. Hidden from divers; flip to true
// to bring them back, e.g. when testing a new computer model.
const SHOW_PROTOCOL_TOOLS = false;

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


const TONE_COLOR = { good: colors.good, warning: colors.warning, danger: colors.danger, info: colors.cyan };

// "Send gas to computer" mode (opened from the nitrox log): instead of the
// download buttons, one action sends the analyzed gas (OSTC family) and sets
// the clock where supported. Computers that can't take a gas from an app get
// an explicit "I've set it by hand" confirmation instead — never a silent pass.
function GasSendActions({ gas, connectedDevice, gasSync, onSend, onDisconnect, onFinish }) {
  const pct = gasPercent(gas.o2);
  const plan = predivePlan(connectedDevice, gas.o2);
  const running = gasSync?.status === 'running';
  const ran = gasSync?.status === 'done' && gasSync.o2 === pct;
  const outcome = ran ? describePredive(gasSync.result, gas.o2) : null;
  const failed = gasSync?.status === 'error' && gasSync.o2 === pct;

  return (
    <>
      <View style={styles.gasBox}>
        <Text style={styles.gasLabel}>GAS TO SEND</Text>
        <Text style={styles.gasValue}>{gas.o2.toFixed(1)}% <Text style={styles.gasSub}>→ {pct}% on the computer</Text></Text>
        {gas.label ? <Text style={styles.deviceId}>{gas.label}</Text> : null}
      </View>
      {!ran ? <Text style={styles.body}>{plan.note}</Text> : null}

      {outcome ? outcome.lines.map((line, i) => (
        <Text key={i} style={[styles.outcome, { color: TONE_COLOR[line.tone] }]}>{line.text}</Text>
      )) : null}
      {failed ? <Text style={styles.error}>{gasSync.error}</Text> : null}

      {!ran && plan.canSend ? (
        <PrimaryButton
          label={running ? 'Talking to computer…' : plan.label}
          onPress={onSend}
          disabled={running}
          style={styles.scanButton}
        />
      ) : null}

      {outcome?.gasSet ? (
        <PrimaryButton label="Done" onPress={() => onFinish({ gasSet: true, clockSet: outcome.clockSet, computer: connectedDevice.name })} style={styles.scanButton} />
      ) : (ran || failed || !plan.canSend) ? (
        <PrimaryButton
          label={outcome?.gasPending ? `Computer shows ${pct}% — done` : `I've set ${pct}% on the computer`}
          onPress={() => onFinish({ gasSet: false, confirmedByHand: true, clockSet: Boolean(outcome?.clockSet), computer: connectedDevice.name })}
          style={styles.scanButton}
        />
      ) : null}
      {onDisconnect ? <SecondaryButton label="Disconnect" onPress={onDisconnect} style={styles.backButton} /> : null}
    </>
  );
}

// READ-ONLY Suunto EON Steel / EON Core / D5 file dump — the first step toward
// sending gases to Suunto computers: it shows where the Suunto app keeps dive
// modes. The JSON is shared out (e.g. AirDrop to the Mac) for decoding.
function SuuntoExplorer({ explore, onExplore }) {
  const running = explore?.status === 'running';
  const summary = explore?.status === 'done' ? explore.summary : null;
  const share = async () => {
    try {
      const Sharing = require('expo-sharing');
      await Sharing.shareAsync(summary.uri, { mimeType: 'application/json', dialogTitle: 'Share Suunto files' });
    } catch {
      // sharing sheet dismissed or unavailable — nothing to do
    }
  };
  return (
    <View style={styles.explorer}>
      <Text style={styles.gasLabel}>SUUNTO SETTINGS FILES (READ-ONLY)</Text>
      <Text style={styles.deviceId}>Reads the computer's non-dive files so we can find where dive modes and gases are stored. Nothing on the computer is changed.</Text>
      {summary ? (
        <>
          <Text style={[styles.outcome, { color: colors.good }]}>✓ {summary.entries} entries, {summary.files} files read{summary.truncated ? ' (stopped at the size limit)' : ''}.</Text>
          <SecondaryButton label="Share the file dump" onPress={share} style={styles.backButton} />
        </>
      ) : null}
      {explore?.status === 'error' ? <Text style={styles.error}>{explore.error}</Text> : null}
      <Pressable onPress={running ? undefined : onExplore} hitSlop={8} style={styles.linkRow}>
        <Text style={styles.linkText}>{running ? 'Reading files…' : summary ? 'Read again' : 'Explore settings files'}</Text>
      </Pressable>
    </View>
  );
}

// READ-ONLY Shearwater settings scan. Run it twice — before and after changing a
// gas on the computer itself — and share both files: the ID whose value changed
// is where the gas list lives.
function ShearwaterScanner({ scan, onScan }) {
  const [label, setLabel] = useState('before');
  const running = scan?.status === 'running';
  const summary = scan?.status === 'done' ? scan.summary : null;
  const pct = scan?.progress && scan.progress.maximum > 0 ? scan.progress.current / scan.progress.maximum : 0;
  const share = async () => {
    try {
      const Sharing = require('expo-sharing');
      await Sharing.shareAsync(summary.uri, { mimeType: 'application/json', dialogTitle: 'Share Shearwater scan' });
    } catch {
      // sharing sheet dismissed or unavailable
    }
  };
  return (
    <View style={styles.explorer}>
      <Text style={styles.gasLabel}>SHEARWATER SETTINGS SCAN (READ-ONLY)</Text>
      <Text style={styles.deviceId}>Reads every setting the computer reports (a few minutes). Scan once, change a gas on the computer, scan again, then share both files. Nothing on the computer is changed.</Text>
      <View style={styles.doneActions}>
        {['before', 'after'].map((l) => (
          <SecondaryButton key={l} label={l === 'before' ? 'Scan 1 · before' : 'Scan 2 · after'} selected={label === l} onPress={() => setLabel(l)} style={styles.flexButton} />
        ))}
      </View>
      {running ? (
        <>
          <ProgressBar value={pct} />
          <Text style={styles.progressText}>{scan.progress ? `${scan.progress.current} / ${scan.progress.maximum} settings read…` : 'Starting…'}</Text>
        </>
      ) : null}
      {summary ? (
        <>
          <Text style={[styles.outcome, { color: summary.complete ? colors.good : colors.warning }]}>
            {summary.complete ? '✓' : '!'} Scan "{summary.label}": {summary.answered} settings found in {summary.scanned} IDs ({summary.seconds}s){summary.complete ? '' : ' — stopped early'}.
          </Text>
          <SecondaryButton label={`Share scan "${summary.label}"`} onPress={share} style={styles.backButton} />
        </>
      ) : null}
      {scan?.status === 'error' ? <Text style={styles.error}>{scan.error}</Text> : null}
      <PrimaryButton label={running ? 'Scanning…' : `Run scan "${label}"`} onPress={() => onScan({ label })} disabled={running} style={styles.scanButton} />
    </View>
  );
}

/**
 * The download flow's UI. All transfer state lives in the module-level
 * `downloadService` (via `useDiveComputerDownload`), so leaving this screen does
 * NOT interrupt an in-progress download — the logbook screen picks the finished
 * dives up when it next renders.
 *
 * With `gas` ({ o2, label }) it becomes the "Send gas to computer" flow: same
 * scan / connect, then GasSendActions instead of the download buttons, and
 * `onGasDone(outcome)` once the gas is on the computer (sent or set by hand).
 *
 * @param {object} props
 * @param {() => void} props.onClose
 * @param {{ o2: number, label?: string }} [props.gas]
 * @param {(outcome: object) => void} [props.onGasDone]
 */
export default function DiveComputerDownloadPanel({ onClose, gas = null, onGasDone }) {
  const {
    supported, status, devices, connectedDevice, progress, summary, error, log, baselineKnown, timeSync, gasSync, suuntoExplore, shearwaterScan,
    scan, stopScan, connect, disconnect, download, cancel, clearLog, syncClock, sendGasToComputer, exploreSuuntoFiles, scanShearwaterSettings,
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
      <Text style={styles.title}>{gas ? 'Send gas to dive computer' : 'Download from dive computer'}</Text>
      <Text style={styles.body}>
        {gas
          ? 'Wake your dive computer and put it in Bluetooth mode, then scan and pick it.'
          : 'Wake your dive computer and put it in Bluetooth / upload mode, then scan. You can leave this screen while it downloads — the transfer keeps running.'}
      </Text>

      {status === 'error' && error ? <Text style={styles.error}>{error}</Text> : null}

      {showSuuntoHint ? <Text style={styles.suuntoHint}>{SUUNTO_PAIRING_HINT}</Text> : null}

      {gas && !connectedDevice && gasSync?.status === 'done' && gasSync.o2 === gasPercent(gas.o2) ? (
        <View style={styles.connectedBox}>
          <Text style={styles.connectedLabel}>DISCONNECTED</Text>
          <Text style={styles.connectedName}>{gasSync.computer || 'Dive computer'}</Text>
          <GasSendActions
            gas={gas}
            connectedDevice={{ name: gasSync.computer, gasSyncSupported: true, timeSyncSupported: true }}
            gasSync={gasSync}
            onSend={() => {}}
            onFinish={(outcome) => onGasDone?.(outcome)}
          />
        </View>
      ) : connectedDevice ? (
        <View style={styles.connectedBox}>
          <Text style={styles.connectedLabel}>{downloading ? 'DOWNLOADING' : status === 'done' ? 'DONE' : 'CONNECTED'}</Text>
          <Text style={styles.connectedName}>{connectedDevice.name}</Text>

          {gas && !downloading ? (
            <GasSendActions
              gas={gas}
              connectedDevice={connectedDevice}
              gasSync={gasSync}
              onSend={() => sendGasToComputer({ o2: gas.o2 })}
              onDisconnect={disconnect}
              onFinish={(outcome) => onGasDone?.(outcome)}
            />
          ) : downloading ? (
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
          {SHOW_PROTOCOL_TOOLS && looksLikeSuunto(connectedDevice.name) && !downloading ? (
            <SuuntoExplorer explore={suuntoExplore} onExplore={exploreSuuntoFiles} />
          ) : null}
          {SHOW_PROTOCOL_TOOLS && looksLikeShearwater(connectedDevice.name) && !downloading ? (
            <ShearwaterScanner scan={shearwaterScan} onScan={scanShearwaterSettings} />
          ) : null}
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
  explorer: { borderColor: colors.line, borderTopWidth: 1, marginTop: 16, paddingTop: 12 },
  gasBox: { backgroundColor: 'rgba(112,226,163,0.08)', borderColor: 'rgba(112,226,163,0.3)', borderRadius: radii.sm, borderWidth: 1, marginTop: 12, padding: 12 },
  gasLabel: { color: colors.good, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  gasValue: { color: colors.text, fontSize: 26, fontWeight: '900', marginTop: 2 },
  gasSub: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  outcome: { fontSize: 13, fontWeight: '700', lineHeight: 19, marginTop: 10 },
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
