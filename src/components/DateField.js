// A real, native date picker for the app's 'YYYY-MM-DD' date-only fields — replaces free-text
// "type the date" inputs. iOS opens a spinner in a bottom sheet; Android opens the system
// dialog. `useDatePicker` + `InlineIosPicker` let a screen with its own field styling (DiveLogScreen,
// DiveFilterSheet) build a matching trigger; `DateField` is the ready-to-use labeled version used
// everywhere else (gear locker, profile).
import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radii } from '../theme';

function pad2(value) {
  return String(value).padStart(2, '0');
}

// Parsed and formatted with local Date getters/setters throughout (never UTC or ISO conversion),
// so the string a user taps is always the string that comes back — no timezone-driven day shift.
export function parseDateOnly(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateOnly(date) {
  return date ? `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}` : '';
}

export function formatDateDisplay(value) {
  const date = parseDateOnly(value);
  return date ? date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';
}

// minimumDate/maximumDate accept either a 'YYYY-MM-DD' string or a Date.
function asDateBound(bound) {
  if (!bound) return undefined;
  return parseDateOnly(bound) || (bound instanceof Date ? bound : undefined);
}

export function useDatePicker({ value, onChange, minimumDate, maximumDate }) {
  const [open, setOpen] = useState(false);
  const selected = parseDateOnly(value) || new Date();
  const min = asDateBound(minimumDate);
  const max = asDateBound(maximumDate);

  const openPicker = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: selected,
        mode: 'date',
        minimumDate: min,
        maximumDate: max,
        onChange: (event, nextDate) => { if (event.type === 'set' && nextDate) onChange(formatDateOnly(nextDate)); },
      });
      return;
    }
    setOpen((current) => !current);
  };

  return { open, openPicker, closePicker: () => setOpen(false), selected, min, max };
}

// Rendered in a Modal (rather than inline in the caller's own layout) so the spinner always
// gets the full screen width to lay out its month/day/year wheels — callers that place a
// DateField in a half-width column (gear locker's two-up rows) would otherwise squeeze the
// picker into that column and clip the day/year wheels off-screen.
export function InlineIosPicker({ picker, onChange }) {
  const insets = useSafeAreaInsets();
  if (Platform.OS !== 'ios' || !picker.open) return null;
  return (
    <Modal animationType="fade" onRequestClose={picker.closePicker} transparent visible>
      <Pressable accessibilityLabel="Dismiss date picker" accessibilityRole="button" onPress={picker.closePicker} style={styles.backdrop}>
        <Pressable onPress={(event) => event.stopPropagation()} style={[styles.sheet, { paddingBottom: insets.bottom + 4 }]}>
          <DateTimePicker
            display="spinner"
            maximumDate={picker.max}
            minimumDate={picker.min}
            mode="date"
            onChange={(event, nextDate) => { if (nextDate) onChange(formatDateOnly(nextDate)); }}
            style={styles.spinner}
            value={picker.selected}
          />
          <Pressable accessibilityRole="button" onPress={picker.closePicker} style={styles.done}>
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function DateField({ label, value, onChange, placeholder = 'Select date', minimumDate, maximumDate, helper, allowClear = true }) {
  const picker = useDatePicker({ value, onChange, minimumDate, maximumDate });
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={picker.openPicker} style={({ pressed }) => [styles.input, pressed && styles.pressed]}>
          <Text numberOfLines={1} style={value ? styles.value : styles.placeholder}>{value ? formatDateDisplay(value) : placeholder}</Text>
        </Pressable>
        {allowClear && value ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Clear ${label}`} hitSlop={8} onPress={() => onChange('')} style={styles.clear}>
            <Text style={styles.clearText}>✕</Text>
          </Pressable>
        ) : null}
      </View>
      <InlineIosPicker onChange={onChange} picker={picker} />
      {helper ? <Text style={styles.helper}>{helper}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 14 },
  label: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.45, marginBottom: 7, textTransform: 'uppercase' },
  row: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  input: { backgroundColor: colors.backgroundRaised, borderColor: colors.lineStrong, borderRadius: radii.md, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 50, paddingHorizontal: 13, paddingVertical: 11 },
  pressed: { opacity: 0.74 },
  value: { color: colors.text, fontSize: 16, fontWeight: '700' },
  placeholder: { color: colors.faint, fontSize: 16, fontWeight: '600' },
  clear: { alignItems: 'center', backgroundColor: colors.backgroundRaised, borderColor: colors.lineStrong, borderRadius: radii.pill, borderWidth: 1, height: 34, justifyContent: 'center', width: 34 },
  clearText: { color: colors.faint, fontSize: 13, fontWeight: '900' },
  helper: { color: colors.faint, fontSize: 10, lineHeight: 15, marginTop: 5 },
  backdrop: { backgroundColor: 'rgba(2, 8, 16, 0.6)', flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.backgroundRaised, borderColor: colors.lineStrong, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, borderWidth: 1, overflow: 'hidden', width: '100%' },
  spinner: { alignSelf: 'stretch' },
  done: { alignItems: 'center', borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 11 },
  doneText: { color: colors.cyan, fontSize: 13, fontWeight: '900' },
});
