import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii } from '../../../theme';
import FlightBookingEditor from '../FlightBookingEditor';
import Glyph from '../Glyph';
import SegmentEditor from '../SegmentEditor';
import { EditorSheet, ToggleRow } from '../fields';
import { SEGMENT_TYPES, airportKey, daysBetween, formatDay, formatRange, formatTime } from '../model';

const KIND_LABELS = { stay: 'Hotel', car: 'Rental car', liveaboard: 'Liveaboard', diving: 'Dive booking', activity: 'Activity', transfer: 'Transfer', ferry: 'Ferry', other: 'Booking' };
const when = (date, time) => [formatDay(date, { weekday: true }), formatTime(time)].filter(Boolean).join(' ');

// One line of what an imported booking is and when.
export function describeRow(row) {
  const leg = row.legs[0];
  if (row.kind === 'flights') {
    const route = row.legs.map((flight) => airportKey(flight.from)).concat(airportKey(row.legs.at(-1).to)).filter(Boolean);
    const days = [...new Set(row.legs.map((flight) => formatDay(flight.startDate)).filter(Boolean))];
    return {
      type: 'flight', title: `${row.legs.length} ${row.legs.length === 1 ? 'flight' : 'flights'}${route.length ? ` · ${route.filter((code, i) => code !== route[i - 1]).join(' → ')}` : ''}`,
      meta: [days.join(' & '), leg.provider, leg.reference ? `Conf. ${leg.reference}` : ''].filter(Boolean).join(' · '),
    };
  }
  const name = leg.title || leg.provider || KIND_LABELS[leg.type] || SEGMENT_TYPES[leg.type].label;
  const nights = leg.endDate && leg.startDate ? daysBetween(leg.startDate, leg.endDate) : 0;
  const meta = {
    stay: [formatRange(leg.startDate, leg.endDate), nights ? `${nights} ${nights === 1 ? 'night' : 'nights'}` : ''],
    car: [`Pick up ${when(leg.startDate, leg.startTime)}`, leg.endDate ? `return ${when(leg.endDate, leg.endTime)}` : '', leg.from],
    liveaboard: [formatRange(leg.startDate, leg.endDate), leg.dives ? `${leg.dives} dives` : '', leg.from],
  }[leg.type] || [when(leg.startDate, leg.startTime), leg.dives ? `${leg.dives} dives` : '', leg.from];
  return { type: leg.type, title: `${KIND_LABELS[leg.type] || SEGMENT_TYPES[leg.type].label} · ${name}`, meta: [...meta, leg.reference ? `Conf. ${leg.reference}` : ''].filter(Boolean).join(' · ') };
}

// Everything read from a confirmation, before it goes on the trip: untick what you don't want,
// tap anything to adjust it, and let the trip stretch to cover bookings outside its dates.
export default function ImportReviewSheet({ plan, review, source = '', issues = [], visible, onCancel, onSave }) {
  const [rows, setRows] = useState([]);
  const [skipped, setSkipped] = useState(new Set());
  const [extendOn, setExtendOn] = useState(true);
  const [editing, setEditing] = useState(null); // row key
  useEffect(() => {
    if (!visible || !review) return;
    setRows(review.rows); setSkipped(new Set()); setExtendOn(true); setEditing(null);
  }, [review, visible]);

  const chosen = rows.filter((row) => !skipped.has(row.key));
  const count = chosen.reduce((sum, row) => sum + row.legs.length, 0);
  const extend = review?.extend && chosen.length ? review.extend : null;
  const editRow = rows.find((row) => row.key === editing) || null;
  const toggle = (key) => setSkipped((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const updateRow = (key, legs) => { setRows((current) => current.map((row) => (row.key === key ? { ...row, legs } : row))); setEditing(null); };
  const outside = (leg) => (plan.startDate && leg.startDate && leg.startDate < plan.startDate) || (plan.endDate && (leg.endDate || leg.startDate) > plan.endDate);

  return (
    <EditorSheet eyebrow="IMPORT" onCancel={onCancel} onSave={() => onSave(chosen, extend && extendOn ? extend : null)} saveDisabled={!count} saveLabel={count ? `Add ${count}` : 'Add'} title="Review import" visible={visible}>
      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>{source === 'ai' ? 'Read with smart import' : 'Read on this phone'}</Text>
        <Text style={styles.noticeBody}>Check each booking against the email. Tap one to change it; untick anything you don’t want added.</Text>
        {issues.map((issue) => <Text key={issue} style={styles.issue}>• {issue}</Text>)}
      </View>

      {rows.map((row) => {
        const on = !skipped.has(row.key);
        const { type, title, meta } = describeRow(row);
        const badges = [row.replaces.length ? 'Updates what’s on the trip' : '', row.legs.some(outside) ? 'Outside the trip dates' : ''].filter(Boolean);
        return (
          <View key={row.key} style={[styles.row, !on && styles.rowOff]}>
            <Pressable accessibilityLabel={`Include ${title}`} accessibilityRole="checkbox" accessibilityState={{ checked: on }} hitSlop={8} onPress={() => toggle(row.key)} style={[styles.box, on && styles.boxOn]}>
              {on ? <Glyph color={colors.background} name="check" size={14} /> : null}
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityHint="Edit before adding" disabled={!on} onPress={() => setEditing(row.key)} style={({ pressed }) => [styles.rowBody, pressed && styles.pressed]}>
              <View style={styles.icon}><Glyph name={type} size={17} /></View>
              <View style={styles.flex}>
                <Text numberOfLines={2} style={styles.title}>{title}</Text>
                {meta ? <Text numberOfLines={3} style={styles.meta}>{meta}</Text> : null}
                {badges.map((badge) => <Text key={badge} style={styles.badge}>{badge}</Text>)}
              </View>
              <Text style={styles.edit}>Edit</Text>
            </Pressable>
          </View>
        );
      })}

      {extend ? (
        <View style={styles.group}>
          <ToggleRow body={`Now ${formatRange(plan.startDate, plan.endDate)}. Stretch it so every booking falls inside the trip.`} label={`Change trip dates to ${formatRange(extend.startDate, extend.endDate)}`} last onChange={setExtendOn} value={extendOn} />
        </View>
      ) : null}

      {editRow?.kind === 'leg' ? (
        <SegmentEditor onCancel={() => setEditing(null)} onSave={(leg) => updateRow(editRow.key, [leg])} segment={editRow.legs[0]} visible />
      ) : null}
      {editRow?.kind === 'flights' ? (
        <FlightBookingEditor flights={editRow.legs} onCancel={() => setEditing(null)} onSave={(flights) => updateRow(editRow.key, flights)} plan={plan} visible />
      ) : null}
    </EditorSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  notice: { backgroundColor: 'rgba(112,221,246,0.1)', borderColor: 'rgba(112,221,246,0.4)', borderRadius: radii.md, borderWidth: 1, marginBottom: 14, padding: 12 },
  noticeTitle: { color: colors.cyan, fontSize: 14, fontWeight: '800' },
  noticeBody: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 3 },
  issue: { color: colors.warning, fontSize: 12, lineHeight: 18, marginTop: 4 },
  row: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.line, borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: 10, marginBottom: 10, paddingLeft: 12 },
  rowOff: { opacity: 0.5 },
  box: { alignItems: 'center', borderColor: colors.lineStrong, borderRadius: 7, borderWidth: 1.5, height: 24, justifyContent: 'center', width: 24 },
  boxOn: { backgroundColor: colors.good, borderColor: colors.good },
  rowBody: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 10, paddingRight: 12, paddingVertical: 12 },
  icon: { alignItems: 'center', backgroundColor: 'rgba(112,221,246,0.1)', borderRadius: 10, height: 34, justifyContent: 'center', width: 34 },
  title: { color: colors.text, fontSize: 15, fontWeight: '700', lineHeight: 20 },
  meta: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  badge: { color: colors.gold, fontSize: 11, fontWeight: '800', marginTop: 4 },
  edit: { color: colors.cyan, fontSize: 13, fontWeight: '800' },
  group: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: radii.md, borderWidth: 1, marginTop: 4, overflow: 'hidden' },
  pressed: { opacity: 0.74 },
});
