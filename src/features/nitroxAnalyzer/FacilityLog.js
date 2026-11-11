// Facility (fill station / shop / boat) nitrox log: every fill analyzed and
// signed off by the diver, exportable as a printable PDF or CSV.
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { StatusBanner } from '../../components/ScreenLayout';
import { Card, PrimaryButton, SecondaryButton } from '../../components/Ui';
import { colors, spacing } from '../../theme';
import AnalysisCard from './AnalysisCard';
import { formatDepth } from './model';
import { buildFacilityEntry, facilityCsv, facilityHtml, mixDiscrepancy, validateFacilityDraft } from './nitroxLog';
import { Field, Segmented, Tag, TextLink, partStyles as p } from './parts';
import SignaturePad from './SignaturePad';
import useAnalysisCapture from './useAnalysisCapture';

const EMPTY_DRAFT = { serial: '', size: '', pressure: '', requestedO2: '', diverName: '', agency: '', certNumber: '', initials: '' };
const isToday = (iso) => new Date(iso).toDateString() === new Date().toDateString();

async function shareExport(kind, entries, options) {
  let Sharing;
  let FileSystem;
  try {
    Sharing = require('expo-sharing');
    FileSystem = require('expo-file-system');
  } catch {
    throw new Error('File sharing is available in a full app build, not Expo Go.');
  }
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  const stamp = new Date().toISOString().slice(0, 10);
  if (kind === 'pdf') {
    const Print = require('expo-print');
    const file = await Print.printToFileAsync({ html: facilityHtml(entries, options) });
    await Sharing.shareAsync(file.uri, { UTI: 'com.adobe.pdf', mimeType: 'application/pdf', dialogTitle: 'Share nitrox fill log' });
    return;
  }
  const file = new FileSystem.File(FileSystem.Paths.cache, `nitrox-fill-log-${stamp}-${Date.now()}.csv`);
  file.write(facilityCsv(entries));
  await Sharing.shareAsync(file.uri, { mimeType: 'text/csv', dialogTitle: 'Share nitrox fill log' });
}

function FacilityAnalysis({ analyzer, log, appSettings, onDone, onCancel, onSigningChange }) {
  const capture = useAnalysisCapture(analyzer);
  const depthUnit = appSettings.depthUnit === 'm' ? 'm' : 'ft';
  const pressureUnit = appSettings.pressureUnit === 'bar' ? 'bar' : 'psi';
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [signature, setSignature] = useState(null);
  const [showErrors, setShowErrors] = useState(false);
  const set = (k) => (v) => setDraft((d) => ({ ...d, [k]: v }));
  const errors = validateFacilityDraft(draft);
  const err = (k) => (showErrors ? errors[k] : undefined);

  const preview = capture.result ? buildFacilityEntry({ result: capture.result, draft, pressureUnit }) : null;
  const off = preview ? mixDiscrepancy(preview) : null;

  const save = async () => {
    if (Object.keys(errors).length) { setShowErrors(true); return; }
    await log.addEntry(buildFacilityEntry({
      result: capture.result, draft, pressureUnit, signature,
      analyzer: capture.result.method === 'manual' ? null : {
        serial: analyzer.device?.serial, calibrationMv: analyzer.calibration?.millivolts, calibratedAt: analyzer.calibration?.at,
      },
    }));
    onDone();
  };

  return (
    <View>
      <AnalysisCard analyzer={analyzer} capture={capture} depthUnit={depthUnit} />
      <Card>
        <Text style={p.sectionLabel}>CYLINDER</Text>
        <Field label="Tank serial number *" value={draft.serial} onChangeText={set('serial')} autoCapitalize="characters" error={err('serial')} />
        <View style={p.row}>
          <Field style={{ flex: 1 }} label="Size" value={draft.size} onChangeText={set('size')} placeholder="AL80" />
          <Field style={{ flex: 1 }} label={`Pressure (${pressureUnit}) *`} keyboardType="number-pad" value={draft.pressure} onChangeText={set('pressure')} error={err('pressure')} />
        </View>
        <Field label="Requested mix % (optional)" keyboardType="decimal-pad" value={draft.requestedO2} onChangeText={set('requestedO2')} placeholder="32" />
        {off ? <StatusBanner tone="warning" label="OUTSIDE ±1%" body={`Analyzed ${preview.o2.toFixed(1)}% vs ${off.expected}% requested. Top off / re-blend before release.`} style={{ marginBottom: 12 }} /> : null}

        <Text style={p.sectionLabel}>DIVER</Text>
        <Field label="Diver name *" value={draft.diverName} onChangeText={set('diverName')} autoCapitalize="words" error={err('diverName')} />
        <View style={p.row}>
          <Field style={{ flex: 1 }} label="Agency" value={draft.agency} onChangeText={set('agency')} placeholder="PADI, SSI…" autoCapitalize="characters" />
          <Field style={{ flex: 1.4 }} label="Nitrox cert # *" value={draft.certNumber} onChangeText={set('certNumber')} autoCapitalize="characters" error={err('certNumber')} />
        </View>

        <Text style={p.sectionLabel}>SIGN-OFF</Text>
        <Text style={[p.muted, { marginBottom: 10 }]}>
          {capture.result
            ? `I personally analyzed this cylinder at ${capture.result.o2.toFixed(1)}% O₂ (MOD ${formatDepth(preview.mod14, depthUnit)} at 1.4) and accept responsibility for its use.`
            : 'The diver confirms the analysis here once the result is locked.'}
        </Text>
        <Field label="Initials *" value={draft.initials} onChangeText={set('initials')} autoCapitalize="characters" maxLength={4} style={{ maxWidth: 140 }} error={err('initials')} />
        <SignaturePad value={signature} onChange={setSignature} onSigningChange={onSigningChange} />
        <PrimaryButton style={{ marginTop: spacing.md }} label={capture.result ? 'Save fill record' : 'Analyze the tank first'} disabled={!capture.result} onPress={save} />
      </Card>
      <SecondaryButton label="Cancel" onPress={onCancel} />
    </View>
  );
}

function FacilityRow({ entry, depthUnit, onDelete }) {
  const [open, setOpen] = useState(false);
  const off = mixDiscrepancy(entry);
  return (
    <Pressable accessibilityRole="button" onPress={() => setOpen((v) => !v)} style={p.listCard}>
      <View style={p.row}>
        <Text style={p.o2}>{entry.o2.toFixed(1)}%</Text>
        <View style={{ flex: 1 }}>
          <Text style={p.title} numberOfLines={1}>SN {entry.tank.serial}{entry.tank.size ? ` · ${entry.tank.size}` : ''}</Text>
          <Text style={p.faint} numberOfLines={1}>{entry.diver.name} · {new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
        </View>
        <Text style={styles.initials}>{entry.initials}</Text>
      </View>
      {off ? <View style={{ marginTop: 6 }}><Tag tone="warning" label={`REQUESTED ${off.expected}%`} /></View> : null}
      {open ? (
        <View style={{ marginTop: 10 }}>
          <Text style={p.muted}>{new Date(entry.at).toLocaleString()}</Text>
          {entry.pressure ? <Text style={p.muted}>Pressure {entry.pressure.value} {entry.pressure.unit}</Text> : null}
          <Text style={p.muted}>MOD {formatDepth(entry.mod14, depthUnit)} @ 1.4 · {formatDepth(entry.mod16, depthUnit)} @ 1.6</Text>
          <Text style={p.muted}>{[entry.diver.agency, entry.diver.certNumber && `#${entry.diver.certNumber}`].filter(Boolean).join(' ')}</Text>
          <Text style={p.faint}>{entry.signature ? 'Signed' : 'Initials only'}{entry.analyzer?.serial ? ` · Analyzer ${entry.analyzer.serial}` : ''}</Text>
          <View style={{ marginTop: 8 }}><TextLink label="Delete" tone="danger" onPress={onDelete} /></View>
        </View>
      ) : null}
    </Pressable>
  );
}

export default function FacilityLog({ analyzer, log, appSettings, onSigningChange }) {
  const [adding, setAdding] = useState(false);
  const [range, setRange] = useState('today');
  const [exporting, setExporting] = useState(false);
  const [nameDraft, setNameDraft] = useState(null);
  const depthUnit = appSettings.depthUnit === 'm' ? 'm' : 'ft';
  const shown = useMemo(() => (range === 'today' ? log.facility.filter((e) => isToday(e.at)) : log.facility), [log.facility, range]);

  if (adding) {
    return <FacilityAnalysis analyzer={analyzer} log={log} appSettings={appSettings} onSigningChange={onSigningChange} onDone={() => setAdding(false)} onCancel={() => setAdding(false)} />;
  }

  const runExport = async (kind) => {
    setExporting(true);
    try {
      await shareExport(kind, shown, { facilityName: log.facilityName, depthUnit, title: range === 'today' ? `Nitrox Fill Log — ${new Date().toLocaleDateString()}` : 'Nitrox Fill Log' });
    } catch (e) {
      Alert.alert('Export failed', e?.message || 'The log could not be exported.');
    } finally {
      setExporting(false);
    }
  };

  const confirmDelete = (entry) => Alert.alert('Delete fill record?', `SN ${entry.tank.serial} — ${entry.diver.name}`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => log.removeEntry(entry.id) },
  ]);

  return (
    <View>
      <Field
        label="Facility / boat name"
        value={nameDraft ?? log.facilityName}
        onChangeText={setNameDraft}
        onEndEditing={() => { if (nameDraft != null) { log.setFacilityName(nameDraft.trim()); setNameDraft(null); } }}
        placeholder="Shown at the top of exported logs"
      />
      <PrimaryButton label="Log a fill analysis" onPress={() => setAdding(true)} />

      <View style={{ marginTop: spacing.lg }}>
        <Segmented options={[{ value: 'today', label: `Today (${log.facility.filter((e) => isToday(e.at)).length})` }, { value: 'all', label: `All (${log.facility.length})` }]} value={range} onChange={setRange} />
      </View>
      {shown.length ? (
        <View style={[p.row, { marginBottom: 10 }]}>
          <SecondaryButton style={{ flex: 1 }} label={exporting ? 'Exporting…' : 'Export PDF'} onPress={() => !exporting && runExport('pdf')} />
          <SecondaryButton style={{ flex: 1 }} label="Export CSV" onPress={() => !exporting && runExport('csv')} />
        </View>
      ) : (
        <Text style={p.muted}>{range === 'today' ? 'No fills logged today.' : 'No fills logged yet.'}</Text>
      )}
      {shown.map((e) => <FacilityRow key={e.id} entry={e} depthUnit={depthUnit} onDelete={() => confirmDelete(e)} />)}
      <Text style={[p.faint, { marginTop: spacing.md }]}>Fill records — including divers' names and cert numbers — are stored only on this device.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  initials: { color: colors.cyan, fontSize: 15, fontWeight: '900', letterSpacing: 1 },
});
