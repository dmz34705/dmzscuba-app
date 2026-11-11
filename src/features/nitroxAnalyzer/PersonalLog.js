// Personal nitrox log: pick a tank (gear locker or rental), analyze, save.
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { StatusBanner } from '../../components/ScreenLayout';
import DiveComputerDownloadPanel from '../diveComputerDownload/DiveComputerDownloadPanel';
import { Card, PrimaryButton, SecondaryButton } from '../../components/Ui';
import { colors, spacing } from '../../theme';
import AnalysisCard from './AnalysisCard';
import { formatDepth } from './model';
import { ageLabel, buildPersonalEntry, computerSetupRecord, mixDiscrepancy, mixName, tankKey } from './nitroxLog';
import { Field, Tag, TextLink, ToggleRow, partStyles as p } from './parts';
import useAnalysisCapture from './useAnalysisCapture';

function LastAnalysis({ entry, now }) {
  if (!entry) return <Text style={p.faint}>Not analyzed yet</Text>;
  return (
    <Text style={p.muted}>
      Last {entry.o2.toFixed(1)}% {mixName(entry.o2)} · {ageLabel(entry.at, now)}
      {entry.usedAt ? ' · since used' : ''}
    </Text>
  );
}

function ComputerSetupNote({ record }) {
  if (!record) return null;
  return (
    <Text style={[p.muted, { marginBottom: 10, color: colors.good }]}>
      {record.method === 'sent' ? '✓ Sent to' : '✓ Set by hand on'} {record.computer || 'dive computer'}
      {record.clockSet ? ' · clock set' : ''}
    </Text>
  );
}

function TankRow({ tank, latest, now, onPress }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [p.listCard, pressed && { opacity: 0.75 }]}>
      <View style={p.row}>
        <View style={{ flex: 1 }}>
          <Text style={p.title}>{tank.label}</Text>
          <Text style={p.faint}>{[tank.size, tank.serial && `SN ${tank.serial}`].filter(Boolean).join(' · ') || 'No serial on file'}</Text>
          <View style={{ marginTop: 4 }}><LastAnalysis entry={latest} now={now} /></View>
        </View>
        {latest && !latest.usedAt ? <Text style={styles.bigO2}>{latest.o2.toFixed(1)}%</Text> : null}
      </View>
      {tank.service ? <View style={{ marginTop: 8 }}><Tag tone={tank.service.tone === 'danger' ? 'danger' : 'warning'} label={tank.service.label} /></View> : null}
    </Pressable>
  );
}

function TankPicker({ log, now, onPick, onCancel }) {
  const [rental, setRental] = useState({ label: '', serial: '', size: '' });
  const [rentalOpen, setRentalOpen] = useState(log.tanks.length === 0);
  return (
    <View>
      <Text style={p.sectionLabel}>WHICH TANK?</Text>
      {log.tanks.map((t) => <TankRow key={t.key} tank={t} latest={log.latest.get(t.key)} now={now} onPress={() => onPick(t)} />)}
      {log.tanks.length === 0 ? <Text style={[p.muted, { marginBottom: 10 }]}>No cylinders in your Gear Locker yet — add yours there, or log a rental below.</Text> : null}

      {log.rentals.length ? <Text style={p.sectionLabel}>RECENT RENTALS</Text> : null}
      {log.rentals.map((t) => <TankRow key={t.key} tank={t} latest={log.latest.get(t.key)} now={now} onPress={() => onPick(t)} />)}

      <Card>
        {rentalOpen ? (
          <>
            <Text style={p.title}>Rental / other tank</Text>
            <Field label="Tank serial number" value={rental.serial} onChangeText={(serial) => setRental((r) => ({ ...r, serial }))} autoCapitalize="characters" placeholder="e.g. 1234567" style={{ marginTop: 10 }} />
            <Field label="Size" value={rental.size} onChangeText={(size) => setRental((r) => ({ ...r, size }))} placeholder="e.g. AL80" />
            <Field label="Name (optional)" value={rental.label} onChangeText={(label) => setRental((r) => ({ ...r, label }))} placeholder="e.g. Boat tank #12" />
            <PrimaryButton label="Analyze this tank" onPress={() => onPick({ ...rental, gearItemId: null })} />
          </>
        ) : (
          <TextLink label="+ Rental or other tank" onPress={() => setRentalOpen(true)} />
        )}
      </Card>
      <SecondaryButton label="Cancel" onPress={onCancel} />
    </View>
  );
}

function AnalyzeTank({ tank, analyzer, log, appSettings, onDone, onCancel }) {
  const capture = useAnalysisCapture(analyzer);
  const depthUnit = appSettings.depthUnit === 'm' ? 'm' : 'ft';
  const pressureUnit = appSettings.pressureUnit === 'bar' ? 'bar' : 'psi';
  const key = tank.key || tankKey(tank);
  const previous = key ? log.latest.get(key) : null;
  const [form, setForm] = useState({ labeledO2: '', pressure: '', fillStation: previous?.fillStation || '', notes: '', setOnComputer: false });
  const [computerSetup, setComputerSetup] = useState(null);
  const [sending, setSending] = useState(false);
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const preview = capture.result ? buildPersonalEntry({ result: capture.result, tank, ...form, pressureUnit }) : null;
  const off = preview ? mixDiscrepancy(preview) : null;

  const save = async () => {
    const entry = buildPersonalEntry({
      result: capture.result, tank, ...form, pressureUnit, computerSetup,
      analyzer: capture.result.method === 'manual' ? null : {
        serial: analyzer.device?.serial, calibrationMv: analyzer.calibration?.millivolts, calibratedAt: analyzer.calibration?.at,
      },
    });
    await log.addEntry(entry);
    onDone();
  };

  return (
    <View>
      <Card>
        <Text style={p.faint}>ANALYZING</Text>
        <Text style={[p.title, { fontSize: 18, marginTop: 2 }]}>{tank.label || tank.serial || 'Tank'}</Text>
        <Text style={p.faint}>{[tank.size, tank.serial && `SN ${tank.serial}`].filter(Boolean).join(' · ')}</Text>
        {previous ? <View style={{ marginTop: 6 }}><LastAnalysis entry={previous} now={Date.now()} /></View> : null}
        {tank.service ? <View style={{ marginTop: 8 }}><Tag tone="warning" label={tank.service.label} /></View> : null}
      </Card>

      <AnalysisCard analyzer={analyzer} capture={capture} depthUnit={depthUnit} />

      {capture.result ? (
        <Card>
          <Text style={p.sectionLabel}>LOG IT</Text>
          <View style={p.row}>
            <Field style={{ flex: 1 }} label="Mix on tank label %" keyboardType="decimal-pad" value={form.labeledO2} onChangeText={set('labeledO2')} placeholder="32" />
            <Field style={{ flex: 1 }} label={`Pressure (${pressureUnit})`} keyboardType="number-pad" value={form.pressure} onChangeText={set('pressure')} placeholder={pressureUnit === 'bar' ? '200' : '3000'} />
          </View>
          {off ? (
            <StatusBanner tone="warning" label="DOESN'T MATCH THE LABEL" body={`Analyzed ${preview.o2.toFixed(1)}% vs ${off.expected}% on the label (${off.diff > 0 ? '+' : ''}${off.diff}). Re-analyze, and talk to the fill station before diving it.`} style={{ marginBottom: 12 }} />
          ) : null}
          <Field label="Fill station / shop" value={form.fillStation} onChangeText={set('fillStation')} placeholder="Where it was filled" />
          <Field label="Notes" value={form.notes} onChangeText={set('notes')} multiline placeholder="Dive plan, buddy, boat…" />
          {sending ? (
            <DiveComputerDownloadPanel
              gas={{ o2: capture.result.o2, label: tank.label || tank.serial }}
              onClose={() => setSending(false)}
              onGasDone={(outcome) => {
                setComputerSetup(outcome);
                setForm((f) => ({ ...f, setOnComputer: true }));
                setSending(false);
              }}
            />
          ) : (
            <SecondaryButton
              style={{ marginBottom: 12 }}
              label={computerSetup ? 'Send to dive computer again' : 'Send gas to dive computer'}
              onPress={() => setSending(true)}
            />
          )}
          {computerSetup ? <ComputerSetupNote record={computerSetupRecord(computerSetup)} /> : null}
          <ToggleRow
            label="Set on my dive computer"
            body={`Confirm your computer's gas is ${Math.round(capture.result.o2)}% before you dive.`}
            value={form.setOnComputer}
            onValueChange={set('setOnComputer')}
          />
          <PrimaryButton label="Save to my nitrox log" onPress={save} />
        </Card>
      ) : null}
      <SecondaryButton label="Cancel" onPress={onCancel} />
    </View>
  );
}

function HistoryItem({ entry, now, depthUnit, onToggleUsed, onDelete, onSendToComputer }) {
  const [open, setOpen] = useState(false);
  const off = mixDiscrepancy(entry);
  return (
    <Pressable accessibilityRole="button" onPress={() => setOpen((v) => !v)} style={p.listCard}>
      <View style={p.row}>
        <Text style={p.o2}>{entry.o2.toFixed(1)}%</Text>
        <View style={{ flex: 1 }}>
          <Text style={p.title} numberOfLines={1}>{entry.tank.label}</Text>
          <Text style={p.faint}>{new Date(entry.at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} · MOD {formatDepth(entry.mod14, depthUnit)}</Text>
        </View>
      </View>
      <View style={[p.row, { flexWrap: 'wrap', marginTop: 6 }]}>
        {entry.setOnComputer ? <Tag tone="good" label="SET ON COMPUTER" /> : null}
        {off ? <Tag tone="warning" label={`LABEL ${off.expected}%`} /> : null}
        {entry.usedAt ? <Tag tone="muted" label="USED" /> : null}
        {entry.method === 'manual' ? <Tag tone="muted" label="MANUAL" /> : null}
      </View>
      {open ? (
        <View style={{ marginTop: 10 }}>
          {entry.tank.serial ? <Text style={p.muted}>SN {entry.tank.serial}{entry.tank.size ? ` · ${entry.tank.size}` : ''}</Text> : null}
          {entry.pressure ? <Text style={p.muted}>Pressure {entry.pressure.value} {entry.pressure.unit}</Text> : null}
          {entry.fillStation ? <Text style={p.muted}>Filled at {entry.fillStation}</Text> : null}
          {entry.notes ? <Text style={p.muted}>{entry.notes}</Text> : null}
          {entry.analyzer?.serial ? <Text style={p.faint}>Analyzer {entry.analyzer.serial} · {ageLabel(entry.at, now)}</Text> : null}
          <ComputerSetupNote record={entry.computerSetup} />
          <View style={[p.row, { marginTop: 8, gap: 18, flexWrap: 'wrap' }]}>
            <TextLink label="Send gas to computer" onPress={onSendToComputer} />
            <TextLink label={entry.usedAt ? 'Mark as full' : 'Mark as used'} onPress={onToggleUsed} />
            <TextLink label="Delete" tone="danger" onPress={onDelete} />
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}

export default function PersonalLog({ analyzer, log, appSettings }) {
  const [step, setStep] = useState(null); // null | { kind: 'pick' } | { kind: 'analyze', tank } | { kind: 'send', entry }
  const now = Date.now();
  const depthUnit = appSettings.depthUnit === 'm' ? 'm' : 'ft';
  const history = useMemo(() => log.personal.slice(0, 50), [log.personal]);

  if (step?.kind === 'pick') {
    return <TankPicker log={log} now={now} onCancel={() => setStep(null)} onPick={(tank) => setStep({ kind: 'analyze', tank })} />;
  }
  if (step?.kind === 'analyze') {
    return <AnalyzeTank tank={step.tank} analyzer={analyzer} log={log} appSettings={appSettings} onDone={() => setStep(null)} onCancel={() => setStep(null)} />;
  }

  if (step?.kind === 'send') {
    const { entry } = step;
    return (
      <DiveComputerDownloadPanel
        gas={{ o2: entry.o2, label: entry.tank.label }}
        onClose={() => setStep(null)}
        onGasDone={(outcome) => {
          log.updateEntry(entry.id, { setOnComputer: true, computerSetup: computerSetupRecord(outcome) });
          setStep(null);
        }}
      />
    );
  }

  const confirmDelete = (entry) => Alert.alert('Delete analysis?', `${entry.o2.toFixed(1)}% — ${entry.tank.label}`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => log.removeEntry(entry.id) },
  ]);

  return (
    <View>
      <PrimaryButton label="Analyze a tank" onPress={() => setStep({ kind: 'pick' })} />

      {log.tanks.length ? <Text style={[p.sectionLabel, { marginTop: spacing.lg }]}>MY TANKS</Text> : null}
      {log.tanks.map((t) => (
        <TankRow key={t.key} tank={t} latest={log.latest.get(t.key)} now={now} onPress={() => setStep({ kind: 'analyze', tank: t })} />
      ))}

      <Text style={[p.sectionLabel, { marginTop: spacing.lg }]}>HISTORY</Text>
      {history.length === 0 ? <Text style={p.muted}>Analyses you save show up here, newest first.</Text> : null}
      {history.map((e) => (
        <HistoryItem
          key={e.id}
          entry={e}
          now={now}
          depthUnit={depthUnit}
          onToggleUsed={() => log.updateEntry(e.id, { usedAt: e.usedAt ? null : new Date().toISOString() })}
          onDelete={() => confirmDelete(e)}
          onSendToComputer={() => setStep({ kind: 'send', entry: e })}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bigO2: { color: colors.good, fontSize: 22, fontVariant: ['tabular-nums'], fontWeight: '900' },
});
