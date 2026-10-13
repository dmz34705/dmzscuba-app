import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { colors } from '../../theme';
import {
  depthToInput,
  parseDepthInput,
  parsePressureInput,
  parseVolumeInput,
  pressureToInput,
  volumeToInput,
} from '../../lib/diveLog/format';
import { EditorSheet, Field, Half, TwoUp } from '../planner/fields';

const emptyDraft = () => ({ depth: '', time: '', start: '', reserve: '', volume: '' });

export default function DiveBriefEditor({ plan, units = {}, visible, onCancel, onSave }) {
  const depthUnit = units.depthUnit === 'm' ? 'm' : 'ft';
  const pressureUnit = units.pressureUnit === 'bar' ? 'bar' : 'psi';
  const volumeUnit = units.gasVolumeUnit === 'L' ? 'L' : 'ft³';
  const [draft, setDraft] = useState(emptyDraft);

  useEffect(() => {
    if (!visible) return;
    const profile = plan?.diveProfile || {};
    setDraft({
      depth: depthToInput(profile.targetDepthMeters, depthUnit),
      time: profile.bottomTimeMinutes ? String(profile.bottomTimeMinutes) : '',
      start: pressureToInput(profile.startPressureBar, pressureUnit),
      reserve: pressureToInput(profile.reservePressureBar, pressureUnit),
      volume: volumeToInput(profile.cylinderVolumeLiters, volumeUnit, profile.startPressureBar),
    });
  }, [depthUnit, plan, pressureUnit, visible, volumeUnit]);

  const set = (key) => (value) => setDraft((current) => ({ ...current, [key]: value }));
  const save = () => {
    const startPressureBar = parsePressureInput(draft.start, pressureUnit);
    onSave({
      targetDepthMeters: parseDepthInput(draft.depth, depthUnit),
      bottomTimeMinutes: Number(draft.time) || null,
      startPressureBar,
      reservePressureBar: parsePressureInput(draft.reserve, pressureUnit),
      cylinderVolumeLiters: parseVolumeInput(draft.volume, volumeUnit, startPressureBar),
    });
  };

  return (
    <EditorSheet eyebrow="PERSONAL DIVE BRIEF" onCancel={onCancel} onSave={save} title="Set planning assumptions" visible={visible}>
      <Text style={styles.lead}>Your baseline is automatic—it comes from earlier dives. Add what you are planning here so DMZ can compare the plan with your history and, when possible, estimate gas.</Text>
      <Text style={styles.section}>THE DIVE</Text>
      <TwoUp>
        <Half><Field keyboardType="decimal-pad" label={`Target depth (${depthUnit})`} onChange={set('depth')} placeholder={depthUnit === 'ft' ? '60' : '18'} value={draft.depth} /></Half>
        <Half><Field keyboardType="decimal-pad" label="Bottom time (min)" onChange={set('time')} placeholder="40" value={draft.time} /></Half>
      </TwoUp>
      <Text style={styles.section}>YOUR GAS LIMITS</Text>
      <TwoUp>
        <Half><Field keyboardType="decimal-pad" label={`Starting pressure (${pressureUnit})`} onChange={set('start')} placeholder={pressureUnit === 'psi' ? '3000' : '207'} value={draft.start} /></Half>
        <Half><Field keyboardType="decimal-pad" label={`Reserve pressure (${pressureUnit})`} onChange={set('reserve')} placeholder={pressureUnit === 'psi' ? '700' : '50'} value={draft.reserve} /></Half>
      </TwoUp>
      <Field helper="Optional. DMZ can often read this from the one cylinder in your selected setup. Enter it when the setup has none or more than one." keyboardType="decimal-pad" label={`Cylinder volume (${volumeUnit})`} onChange={set('volume')} placeholder={volumeUnit === 'ft³' ? '80' : '11.1'} value={draft.volume} />
      <Text style={styles.note}>This creates a personal planning reference, not a decompression plan or reserve rule. Confirm the complete dive with your training and dive computer.</Text>
    </EditorSheet>
  );
}

const styles = StyleSheet.create({
  lead: { color: colors.text, fontSize: 15, lineHeight: 22, marginBottom: 20 },
  section: { color: colors.cyan, fontSize: 10, fontWeight: '900', letterSpacing: 1.5, marginBottom: 12, marginTop: 4 },
  note: { color: colors.faint, fontSize: 11, lineHeight: 17, marginTop: 4 },
});
