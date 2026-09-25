import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text } from 'react-native';

import DateField from '../../components/DateField';
import { colors, radii } from '../../theme';
import { Chips, EditorSheet, Field, FormLabel, Half, TimeField, TwoUp } from './fields';
import { SEGMENT_TYPES, normalizeSegment } from './model';

const TYPE_OPTIONS = Object.entries(SEGMENT_TYPES).map(([key, { label }]) => ({ key, label }));
const PLACEHOLDERS = {
  flight: { title: 'UA 1234', from: 'ORD', to: 'CZM', provider: 'United' },
  transfer: { title: 'Airport shuttle', from: 'CZM arrivals', to: 'Hotel lobby', provider: 'Shuttle company' },
  ferry: { title: 'Playa del Carmen ferry', from: 'Playa del Carmen', to: 'Cozumel', provider: 'Ultramar' },
  stay: { title: 'Hotel name', from: 'Address', provider: 'Booking site or hotel' },
  liveaboard: { title: 'Vessel name', from: 'Port', to: 'Port', provider: 'Operator' },
  diving: { title: 'Palancar & Columbia', from: 'Hotel dock, 8:00', to: 'Reef names', provider: 'Dive shop' },
  other: { title: 'Rental car, tour, dinner…', from: 'Where', provider: 'Company' },
};

// One leg of a trip: a flight, a transfer, a night's stay, a day of diving…
export default function SegmentEditor({ segment, visible, onCancel, onSave, onDelete }) {
  const [draft, setDraft] = useState(segment);
  useEffect(() => { if (visible) setDraft(segment); }, [segment, visible]);
  if (!draft) return null;
  const type = SEGMENT_TYPES[draft.type];
  const hint = PLACEHOLDERS[draft.type];
  const set = (patch) => setDraft((current) => ({ ...current, ...patch }));
  const save = () => {
    if (!draft.startDate) { Alert.alert('Add a date', 'Choose when this happens so it lands on the right day of the trip.'); return; }
    onSave(normalizeSegment(draft));
  };
  const startLabel = { flight: 'Departs', stay: 'Check in', liveaboard: 'Embark', transfer: 'Pick-up', ferry: 'Departs' }[draft.type] || 'Date';
  const endLabel = { flight: 'Arrives', stay: 'Check out', liveaboard: 'Disembark', transfer: 'Arrives', ferry: 'Arrives' }[draft.type] || 'Ends';
  return (
    <EditorSheet eyebrow="ITINERARY" onCancel={onCancel} onSave={save} title={segment?.title ? 'Edit' : `Add ${type.label.toLowerCase()}`} visible={visible}
      footer={onDelete ? (
        <Pressable accessibilityRole="button" onPress={() => Alert.alert('Remove from itinerary?', draft.title || type.label, [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: onDelete }])} style={({ pressed }) => [styles.delete, pressed && styles.pressed]}>
          <Text style={styles.deleteText}>Remove from itinerary</Text>
        </Pressable>
      ) : null}>
      <Chips onChange={(next) => set({ type: next })} options={TYPE_OPTIONS} value={draft.type} />
      <Field label={draft.type === 'flight' ? 'Flight' : draft.type === 'diving' ? 'Dives or sites' : 'Name'} onChange={(title) => set({ title })} placeholder={hint.title} value={draft.title} />
      <TwoUp>
        <Half><DateField allowClear={false} label={startLabel} onChange={(startDate) => set({ startDate, endDate: draft.endDate && draft.endDate < startDate ? startDate : draft.endDate })} value={draft.startDate} /></Half>
        <Half><TimeField label="Time" onChange={(startTime) => set({ startTime })} value={draft.startTime} /></Half>
      </TwoUp>
      {type.ends ? (
        <TwoUp>
          <Half><DateField label={endLabel} minimumDate={draft.startDate || undefined} onChange={(endDate) => set({ endDate })} value={draft.endDate} /></Half>
          <Half><TimeField label="Time" onChange={(endTime) => set({ endTime })} value={draft.endTime} /></Half>
        </TwoUp>
      ) : <TimeField label="Back on shore by" onChange={(endTime) => set({ endTime })} value={draft.endTime} />}
      <FormLabel>Details</FormLabel>
      {type.from ? <Field autoCapitalize={draft.type === 'flight' ? 'characters' : 'sentences'} label={type.from} onChange={(from) => set({ from })} placeholder={hint.from} value={draft.from} /> : null}
      {type.to ? <Field autoCapitalize={draft.type === 'flight' ? 'characters' : 'sentences'} label={type.to} onChange={(to) => set({ to })} placeholder={hint.to} value={draft.to} /> : null}
      <Field label={type.provider} onChange={(provider) => set({ provider })} placeholder={hint.provider} value={draft.provider} />
      <TwoUp>
        <Half><Field autoCapitalize="characters" label="Confirmation" maxLength={80} onChange={(reference) => set({ reference })} value={draft.reference} /></Half>
        {type.diving ? <Half><Field keyboardType="number-pad" label="Dives" maxLength={2} onChange={(dives) => set({ dives })} placeholder="2" value={draft.dives ? String(draft.dives) : ''} /></Half> : <Half />}
      </TwoUp>
      <Field label="Notes" multiline maxLength={2000} onChange={(notes) => set({ notes })} placeholder={draft.type === 'flight' ? 'Seats, bag allowance, terminal…' : 'Anything worth remembering'} value={draft.notes} />
      {type.diving ? <Text style={styles.hint}>Add the time you’re back on shore on the last dive day — the planner uses it to check the surface interval before your flight home.</Text> : null}
    </EditorSheet>
  );
}

const styles = StyleSheet.create({
  delete: { alignItems: 'center', borderColor: 'rgba(255,127,127,0.4)', borderRadius: radii.md, borderWidth: 1, marginTop: 18, minHeight: 48, justifyContent: 'center' },
  deleteText: { color: colors.danger, fontSize: 14, fontWeight: '800' },
  pressed: { opacity: 0.74 },
  hint: { color: colors.faint, fontSize: 11, lineHeight: 16, marginTop: 4 },
});
