import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import DateField from '../../components/DateField';
import { colors, radii } from '../../theme';
import { EditorSheet, Field, FormLabel, Half, TimeField, TwoUp } from './fields';
import {
  MIN_CONNECTION_MINUTES, airportKey, connectingFlight, createBookingId, formatDuration, layoverMinutes, normalizeSegment, returnFlight,
} from './model';

const AIRLINE_HINT = 'United, American, Delta…';

// One booking's flights — typically the connections out and the flights home, all on one
// confirmation. Airline and confirmation are shared; each flight has its own route and times.
// `source` marks flights read from an email so the diver knows to check them.
export default function FlightBookingEditor({ flights, plan, visible, source = '', issues = [], onCancel, onSave, onDelete }) {
  const [draft, setDraft] = useState(null);
  useEffect(() => {
    if (!visible || !flights?.length) return;
    const booking = flights.find((leg) => leg.booking)?.booking || createBookingId();
    setDraft({
      airline: flights.find((leg) => leg.provider)?.provider || '',
      reference: flights.find((leg) => leg.reference)?.reference || '',
      flights: flights.map((leg) => normalizeSegment({ ...leg, type: 'flight', booking })),
      booking,
    });
  }, [flights, visible]);
  if (!draft) return null;

  const set = (patch) => setDraft((current) => ({ ...current, ...patch }));
  const setFlight = (index, patch) => setDraft((current) => ({
    ...current,
    flights: current.flights.map((leg, i) => {
      if (i !== index) return leg;
      const next = { ...leg, ...patch };
      // Arrival can't fall before departure; most flights land the day they leave.
      if (patch.startDate && (!leg.endDate || leg.endDate < patch.startDate)) next.endDate = patch.startDate;
      return next;
    }),
  }));
  const stamp = (leg) => ({ ...leg, provider: draft.airline, reference: draft.reference, booking: draft.booking });
  const addConnection = () => set({ flights: [...draft.flights, connectingFlight(stamp(draft.flights.at(-1)))] });
  const addReturn = () => set({ flights: [...draft.flights, returnFlight(draft.flights.map(stamp), plan)] });
  const removeFlight = (index) => set({ flights: draft.flights.filter((_, i) => i !== index) });

  const save = () => {
    const missing = draft.flights.findIndex((leg) => !leg.startDate);
    if (missing >= 0) { Alert.alert('Add a date', `Flight ${missing + 1} needs a departure date so it lands on the right day of the trip.`); return; }
    onSave(draft.flights.map((leg) => normalizeSegment({ ...stamp(leg), title: leg.title.toUpperCase() })));
  };
  const count = draft.flights.length;

  return (
    <EditorSheet
      eyebrow={source ? 'IMPORTED FLIGHTS' : 'FLIGHTS'}
      footer={onDelete ? (
        <Pressable accessibilityRole="button" onPress={() => Alert.alert(count > 1 ? `Remove all ${count} flights?` : 'Remove this flight?', 'They’ll be taken off the itinerary.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: onDelete }])} style={({ pressed }) => [styles.delete, pressed && styles.pressed]}>
          <Text style={styles.deleteText}>{count > 1 ? 'Remove booking' : 'Remove flight'}</Text>
        </Pressable>
      ) : null}
      onCancel={onCancel}
      onSave={save}
      saveLabel={source ? 'Add to trip' : 'Save'}
      title={count > 1 ? `${count} flights` : 'Flight'}
      visible={visible}
    >
      {source ? (
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>{source === 'ai' ? 'Read with smart import' : 'Read from your email'}</Text>
          <Text style={styles.noticeBody}>Check each flight against the email before adding it. {issues.length ? issues.join(' ') : ''}</Text>
        </View>
      ) : null}
      <TwoUp>
        <Half><Field label="Airline" onChange={(airline) => set({ airline })} placeholder={AIRLINE_HINT} value={draft.airline} /></Half>
        <Half><Field autoCapitalize="characters" label="Confirmation" maxLength={80} onChange={(reference) => set({ reference })} placeholder="ABC123" value={draft.reference} /></Half>
      </TwoUp>

      {draft.flights.map((leg, index) => {
        const previous = draft.flights[index - 1];
        const layover = previous ? layoverMinutes(previous, leg) : null;
        const connects = previous && layover != null && layover <= 24 * 60 && (!previous.to || !leg.from || airportKey(previous.to) === airportKey(leg.from));
        return (
          <View key={leg.id}>
            {connects ? <Layover airport={leg.from || previous.to} minutes={layover} /> : previous ? <View style={styles.spacer} /> : null}
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <Text style={styles.cardTitle}>FLIGHT {index + 1}{leg.from || leg.to ? ` · ${[leg.from, leg.to].map((code) => airportKey(code) || '—').join(' → ')}` : ''}</Text>
                {count > 1 ? <Pressable accessibilityLabel={`Remove flight ${index + 1}`} accessibilityRole="button" hitSlop={10} onPress={() => removeFlight(index)}><Text style={styles.remove}>Remove</Text></Pressable> : null}
              </View>
              <Field autoCapitalize="characters" label="Flight number" maxLength={20} onChange={(title) => setFlight(index, { title })} placeholder="UA 1234" value={leg.title} />
              <TwoUp>
                <Half><Field autoCapitalize="characters" label="From" maxLength={40} onChange={(from) => setFlight(index, { from })} placeholder="ORD" value={leg.from} /></Half>
                <Half><Field autoCapitalize="characters" label="To" maxLength={40} onChange={(to) => setFlight(index, { to })} placeholder="CZM" value={leg.to} /></Half>
              </TwoUp>
              <TwoUp>
                <Half><DateField allowClear={false} label="Departs" onChange={(startDate) => setFlight(index, { startDate })} value={leg.startDate} /></Half>
                <Half><TimeField label="Time" onChange={(startTime) => setFlight(index, { startTime })} value={leg.startTime} /></Half>
              </TwoUp>
              <TwoUp>
                <Half><DateField label="Arrives" minimumDate={leg.startDate || undefined} onChange={(endDate) => setFlight(index, { endDate })} value={leg.endDate} /></Half>
                <Half><TimeField label="Time" onChange={(endTime) => setFlight(index, { endTime })} value={leg.endTime} /></Half>
              </TwoUp>
              <Field label="Notes" maxLength={500} onChange={(notes) => setFlight(index, { notes })} placeholder="Seat, terminal, bag allowance…" value={leg.notes} />
            </View>
          </View>
        );
      })}

      <FormLabel>Add to this booking</FormLabel>
      <View style={styles.addRow}>
        <Pressable accessibilityRole="button" onPress={addConnection} style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
          <Text style={styles.addTitle}>+ Connecting flight</Text>
          <Text style={styles.addBody}>{draft.flights.at(-1)?.to ? `Leaves ${airportKey(draft.flights.at(-1).to)}` : 'Next leg of the journey'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={addReturn} style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
          <Text style={styles.addTitle}>+ Return flight</Text>
          <Text style={styles.addBody}>{draft.flights[0]?.from ? `Back to ${airportKey(draft.flights[0].from)}` : 'The flight home'}</Text>
        </Pressable>
      </View>
      <Text style={styles.hint}>Times are local to each airport, as printed on your ticket. The planner checks each connection and the time between your last dive and your flight home.</Text>
    </EditorSheet>
  );
}

function Layover({ airport, minutes }) {
  const tight = minutes < MIN_CONNECTION_MINUTES;
  const tone = minutes < 0 ? colors.danger : tight ? colors.warning : colors.muted;
  return (
    <View style={styles.layover}>
      <View style={[styles.layoverLine, { backgroundColor: tone }]} />
      <Text style={[styles.layoverText, { color: tone }]}>
        {minutes < 0 ? 'Times overlap — check them' : `${formatDuration(minutes)} layover${airport ? ` in ${airportKey(airport)}` : ''}${tight ? ' · tight' : ''}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: { backgroundColor: 'rgba(112,221,246,0.1)', borderColor: 'rgba(112,221,246,0.4)', borderRadius: radii.md, borderWidth: 1, marginBottom: 14, padding: 12 },
  noticeTitle: { color: colors.cyan, fontSize: 14, fontWeight: '800' },
  noticeBody: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 3 },
  card: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: radii.md, borderWidth: 1, paddingBottom: 0, paddingHorizontal: 12, paddingTop: 12 },
  cardHead: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  cardTitle: { color: colors.cyan, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  remove: { color: colors.danger, fontSize: 13, fontWeight: '700' },
  spacer: { height: 14 },
  layover: { alignItems: 'center', flexDirection: 'row', gap: 10, paddingHorizontal: 18, paddingVertical: 8 },
  layoverLine: { borderRadius: 1, height: 26, width: 2 },
  layoverText: { fontSize: 13, fontWeight: '700' },
  addRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  addButton: { backgroundColor: colors.surface, borderColor: colors.lineStrong, borderRadius: radii.md, borderWidth: 1, flex: 1, minHeight: 64, padding: 12 },
  addTitle: { color: colors.cyan, fontSize: 14, fontWeight: '800' },
  addBody: { color: colors.faint, fontSize: 12, marginTop: 3 },
  hint: { color: colors.faint, fontSize: 11, lineHeight: 16, marginTop: 2 },
  delete: { alignItems: 'center', borderColor: 'rgba(255,127,127,0.4)', borderRadius: radii.md, borderWidth: 1, justifyContent: 'center', marginTop: 18, minHeight: 48 },
  deleteText: { color: colors.danger, fontSize: 14, fontWeight: '800' },
  pressed: { opacity: 0.74 },
});
