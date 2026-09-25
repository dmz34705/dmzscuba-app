import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import DateField from '../../components/DateField';
import PinDropSheet from '../mySites/PinDropSheet';
import { addMySite, loadMySites } from '../mySites/storage';
import { colors, radii } from '../../theme';
import { Chips, EditorSheet, Field, FormLabel, Half, TimeField, ToggleRow, TwoUp } from './fields';
import { CERT_REQUIREMENTS, PLAN_STATUSES, STATUS_LABELS, normalizePlan } from './model';
import SiteField from './SiteField';

const CERT_OPTIONS = CERT_REQUIREMENTS.map(({ key, label }) => ({ key, label }));
const STATUS_OPTIONS = PLAN_STATUSES.map((key) => ({ key, label: STATUS_LABELS[key] }));

// Creates or edits a plan's basics. The itinerary, packing and to-dos are edited on the plan itself.
export default function PlanEditor({ plan, visible, onCancel, onSave, isNew = false }) {
  const [draft, setDraft] = useState(plan);
  const [mySites, setMySites] = useState([]);
  const [pin, setPin] = useState(null);
  useEffect(() => { if (visible) { setDraft(plan); loadMySites().then(setMySites).catch(() => {}); } }, [plan, visible]);
  if (!draft) return null;
  const trip = draft.kind === 'trip';
  const set = (patch) => setDraft((current) => ({ ...current, ...patch }));
  const setIn = (key, patch) => setDraft((current) => ({ ...current, [key]: { ...current[key], ...patch } }));
  const save = () => {
    if (!draft.startDate) { Alert.alert(trip ? 'Add the trip dates' : 'Add the date', trip ? 'Choose when the trip starts so the planner can check your gear and paperwork against it.' : 'Choose the day of the dive.'); return; }
    onSave(normalizePlan(draft));
  };
  return (
    <EditorSheet
      eyebrow={trip ? 'DIVE TRIP' : 'DIVE DAY'}
      onCancel={onCancel}
      onSave={save}
      saveLabel={isNew ? 'Create' : 'Save'}
      title={isNew ? (trip ? 'New trip' : 'New dive day') : 'Edit details'}
      visible={visible}
    >
      <Field label={trip ? 'Trip name' : 'Name'} onChange={(title) => set({ title })} placeholder={trip ? 'Cozumel, spring break' : 'Morning boat dive'} value={draft.title} />
      {trip ? <Field label="Destination" onChange={(name) => setIn('destination', { name })} placeholder="Cozumel, Mexico" value={draft.destination.name} />
        : <SiteField mySites={mySites} onChange={(destination) => set({ destination })} onDropPin={(name) => setPin({ name, point: Number.isFinite(draft.destination.latitude) ? { latitude: draft.destination.latitude, longitude: draft.destination.longitude } : null })} value={draft.destination} />}
      {trip ? (
        <TwoUp>
          <Half><DateField label="Leave" onChange={(startDate) => set({ startDate, endDate: draft.endDate && draft.endDate < startDate ? startDate : draft.endDate })} value={draft.startDate} /></Half>
          <Half><DateField label="Return" minimumDate={draft.startDate || undefined} onChange={(endDate) => set({ endDate })} value={draft.endDate} /></Half>
        </TwoUp>
      ) : (
        <TwoUp>
          <Half><DateField allowClear={false} label="Date" onChange={(startDate) => set({ startDate })} value={draft.startDate} /></Half>
          <Half><TimeField label="Meet at" onChange={(startTime) => set({ startTime })} value={draft.startTime} /></Half>
        </TwoUp>
      )}
      <Chips label="Status" onChange={(status) => set({ status })} options={STATUS_OPTIONS} value={draft.status} />

      <FormLabel>{trip ? 'Dive operator' : 'Operator or charter'}</FormLabel>
      <Field label="Name" onChange={(name) => setIn('operator', { name })} placeholder={trip ? 'Resort dive shop' : 'Charter boat or dive shop'} value={draft.operator.name} />
      {!trip ? <Field label="Meeting point" onChange={(meetingPoint) => setIn('operator', { meetingPoint })} placeholder="Dock, slip or shop address" value={draft.operator.meetingPoint} /> : null}
      <TwoUp>
        <Half><Field autoCapitalize="none" keyboardType="phone-pad" label="Phone" onChange={(phone) => setIn('operator', { phone })} value={draft.operator.phone} /></Half>
        <Half><Field autoCapitalize="characters" label="Confirmation" onChange={(confirmation) => setIn('operator', { confirmation })} value={draft.operator.confirmation} /></Half>
      </TwoUp>
      <Field autoCapitalize="none" keyboardType="email-address" label="Email" onChange={(email) => setIn('operator', { email })} value={draft.operator.email} />
      {!trip ? <Field keyboardType="number-pad" label="Planned dives" maxLength={2} onChange={(dives) => set({ dives })} placeholder="2" value={draft.dives ? String(draft.dives) : ''} /> : null}

      <FormLabel>What the operator requires</FormLabel>
      <Chips helper="Matched against the certification cards on your profile." multiple onChange={(certs) => setIn('requirements', { certs })} options={CERT_OPTIONS} value={draft.requirements.certs} />
      <TwoUp>
        <Half><Field keyboardType="number-pad" label="Minimum logged dives" maxLength={4} onChange={(minDives) => setIn('requirements', { minDives })} value={draft.requirements.minDives ? String(draft.requirements.minDives) : ''} /></Half>
        <Half><Field helper="Months since your last dive" keyboardType="number-pad" label="Dived within" maxLength={3} onChange={(recentMonths) => setIn('requirements', { recentMonths })} value={draft.requirements.recentMonths ? String(draft.requirements.recentMonths) : ''} /></Half>
      </TwoUp>
      <View style={styles.group}>
        <ToggleRow body="Proof of dive accident cover (DAN or similar)" label="Dive insurance" onChange={(insurance) => setIn('requirements', { insurance })} value={draft.requirements.insurance} />
        <ToggleRow body="A medical questionnaire, or a physician’s sign-off" label="Medical statement" onChange={(medical) => setIn('requirements', { medical })} value={draft.requirements.medical} />
        <ToggleRow body="Registration, liability release or online check-in" label="Forms & waiver" last onChange={(waiver) => setIn('requirements', { waiver })} value={draft.requirements.waiver} />
      </View>

      <FormLabel>Notes</FormLabel>
      <Field label="Notes" multiline maxLength={4000} onChange={(notes) => set({ notes })} placeholder={trip ? 'Room preferences, baggage allowance, who’s coming…' : 'Parking, tide times, who’s buddying…'} value={draft.notes} />
      <Text style={styles.footnote}>Plans are stored on this device and included in your development backups.</Text>
      <PinDropSheet
        initialName={pin?.name || ''}
        initialPoint={pin?.point || null}
        onCancel={() => setPin(null)}
        onSave={async (value) => {
          const site = await addMySite(value);
          setMySites((current) => [...current.filter((entry) => entry.id !== site.id), site]);
          set({ destination: { name: site.name, siteId: site.id, latitude: site.latitude, longitude: site.longitude, area: 'My site', custom: true } });
          setPin(null);
        }}
        visible={Boolean(pin)}
      />
    </EditorSheet>
  );
}

const styles = StyleSheet.create({
  group: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: radii.md, borderWidth: 1, marginBottom: 14, overflow: 'hidden' },
  footnote: { color: colors.faint, fontSize: 11, lineHeight: 16, marginTop: 4 },
});
