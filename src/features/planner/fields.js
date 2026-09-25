// Form pieces for the planner's editors, styled to match DateField (gear locker, profile).
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radii, spacing } from '../../theme';
import { formatTime } from './model';

export function Field({ label, value, onChange, placeholder, multiline = false, keyboardType, helper, autoCapitalize = 'sentences', maxLength = 200 }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        maxLength={maxLength}
        multiline={multiline}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.faint}
        style={[styles.input, multiline && styles.multiline]}
        value={value}
      />
      {helper ? <Text style={styles.helper}>{helper}</Text> : null}
    </View>
  );
}

const timeDate = (value) => {
  const date = new Date();
  const match = /^(\d{2}):(\d{2})$/.exec(value || '');
  date.setHours(match ? Number(match[1]) : 8, match ? Number(match[2]) : 0, 0, 0);
  return date;
};
const timeString = (date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

export function TimeField({ label, value, onChange, placeholder = 'Add time' }) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const openPicker = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({ value: timeDate(value), mode: 'time', onChange: (event, next) => { if (event.type === 'set' && next) onChange(timeString(next)); } });
      return;
    }
    setOpen(true);
  };
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={openPicker} style={({ pressed }) => [styles.input, styles.flex, pressed && styles.pressed]}>
          <Text style={value ? styles.value : styles.placeholder}>{value ? formatTime(value) : placeholder}</Text>
        </Pressable>
        {value ? <Pressable accessibilityRole="button" accessibilityLabel={`Clear ${label}`} hitSlop={8} onPress={() => onChange('')} style={styles.clear}><Text style={styles.clearText}>✕</Text></Pressable> : null}
      </View>
      {Platform.OS === 'ios' && open ? (
        <Modal animationType="fade" onRequestClose={() => setOpen(false)} transparent visible>
          <Pressable accessibilityLabel="Dismiss time picker" onPress={() => setOpen(false)} style={styles.backdrop}>
            <Pressable onPress={(event) => event.stopPropagation()} style={[styles.pickerSheet, { paddingBottom: insets.bottom + 4 }]}>
              <DateTimePicker display="spinner" minuteInterval={5} mode="time" onChange={(event, next) => { if (next) onChange(timeString(next)); }} style={styles.spinner} value={timeDate(value)} />
              <Pressable accessibilityRole="button" onPress={() => { if (!value) onChange(timeString(timeDate(value))); setOpen(false); }} style={styles.done}><Text style={styles.doneText}>Done</Text></Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </View>
  );
}

export function Chips({ label, options, value, onChange, multiple = false, helper }) {
  const selected = multiple ? new Set(value) : new Set([value]);
  const toggle = (key) => {
    if (!multiple) { onChange(key); return; }
    const next = new Set(value);
    if (next.has(key)) next.delete(key); else next.add(key);
    onChange([...next]);
  };
  return (
    <View style={styles.field}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.chips}>
        {options.map(({ key, label: text }) => {
          const on = selected.has(key);
          return (
            <Pressable key={key} accessibilityRole={multiple ? 'checkbox' : 'radio'} accessibilityState={{ checked: on }} onPress={() => toggle(key)} style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && styles.pressed]}>
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{multiple && on ? '✓ ' : ''}{text}</Text>
            </Pressable>
          );
        })}
      </View>
      {helper ? <Text style={styles.helper}>{helper}</Text> : null}
    </View>
  );
}

export function ToggleRow({ label, body, value, onChange, last = false }) {
  return (
    <View style={[styles.toggleRow, !last && styles.toggleBorder]}>
      <View style={styles.flex}>
        <Text style={styles.toggleTitle}>{label}</Text>
        {body ? <Text style={styles.toggleBody}>{body}</Text> : null}
      </View>
      <Switch accessibilityLabel={label} onValueChange={onChange} thumbColor={colors.white} trackColor={{ false: colors.surfaceSoft, true: colors.cyan }} value={value} />
    </View>
  );
}

export function TwoUp({ children }) {
  return <View style={styles.twoUp}>{children}</View>;
}
export function Half({ children }) {
  return <View style={styles.flex}>{children}</View>;
}

export function FormLabel({ children }) {
  return <Text style={styles.formLabel}>{children}</Text>;
}

// A full-height editor with Cancel / title / Save, keyboard-aware.
export function EditorSheet({ visible, title, eyebrow, onCancel, onSave, saveLabel = 'Save', saveDisabled = false, children, footer }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal animationType="slide" onRequestClose={onCancel} presentationStyle="pageSheet" visible={visible}>
      <View style={[styles.sheet, { paddingTop: Platform.OS === 'android' ? insets.top : 0 }]}>
        <View style={styles.sheetHeader}>
          <Pressable accessibilityRole="button" hitSlop={10} onPress={onCancel}><Text style={styles.cancel}>Cancel</Text></Pressable>
          <View style={styles.sheetTitleWrap}>
            {eyebrow ? <Text style={styles.sheetEyebrow}>{eyebrow}</Text> : null}
            <Text numberOfLines={1} style={styles.sheetTitle}>{title}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: saveDisabled }} disabled={saveDisabled} hitSlop={10} onPress={onSave}><Text style={[styles.save, saveDisabled && styles.disabled]}>{saveLabel}</Text></Pressable>
        </View>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <ScrollView contentContainerStyle={[styles.sheetContent, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled">
            {children}
            {footer}
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  field: { marginBottom: 14 },
  label: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.45, marginBottom: 7, textTransform: 'uppercase' },
  input: { backgroundColor: colors.backgroundRaised, borderColor: colors.lineStrong, borderRadius: radii.md, borderWidth: 1, color: colors.text, fontSize: 16, fontWeight: '600', justifyContent: 'center', minHeight: 50, paddingHorizontal: 13, paddingVertical: 11 },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  helper: { color: colors.faint, fontSize: 11, lineHeight: 16, marginTop: 5 },
  row: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  value: { color: colors.text, fontSize: 16, fontWeight: '700' },
  placeholder: { color: colors.faint, fontSize: 16, fontWeight: '600' },
  pressed: { opacity: 0.74 },
  clear: { alignItems: 'center', backgroundColor: colors.backgroundRaised, borderColor: colors.lineStrong, borderRadius: radii.pill, borderWidth: 1, height: 34, justifyContent: 'center', width: 34 },
  clearText: { color: colors.faint, fontSize: 13, fontWeight: '900' },
  backdrop: { backgroundColor: 'rgba(2, 8, 16, 0.6)', flex: 1, justifyContent: 'flex-end' },
  pickerSheet: { backgroundColor: colors.backgroundRaised, borderColor: colors.lineStrong, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, borderWidth: 1, overflow: 'hidden', width: '100%' },
  spinner: { alignSelf: 'stretch' },
  done: { alignItems: 'center', borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 11 },
  doneText: { color: colors.cyan, fontSize: 13, fontWeight: '900' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: colors.backgroundRaised, borderColor: colors.lineStrong, borderRadius: radii.pill, borderWidth: 1, minHeight: 38, justifyContent: 'center', paddingHorizontal: 13, paddingVertical: 8 },
  chipOn: { backgroundColor: 'rgba(112, 221, 246, 0.14)', borderColor: colors.cyan },
  chipText: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  chipTextOn: { color: colors.cyan },
  toggleRow: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 60, paddingHorizontal: 13, paddingVertical: 10 },
  toggleBorder: { borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth },
  toggleTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
  toggleBody: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  twoUp: { flexDirection: 'row', gap: 10 },
  formLabel: { color: colors.cyan, fontSize: 11, fontWeight: '800', letterSpacing: 1.6, marginBottom: 12, marginTop: 10, textTransform: 'uppercase' },
  sheet: { backgroundColor: colors.background, flex: 1 },
  sheetHeader: { alignItems: 'center', borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', minHeight: 58, paddingHorizontal: spacing.md },
  sheetTitleWrap: { alignItems: 'center', flex: 1, paddingHorizontal: 8 },
  sheetEyebrow: { color: colors.cyan, fontSize: 9, fontWeight: '800', letterSpacing: 1.8 },
  sheetTitle: { color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 2 },
  cancel: { color: colors.muted, fontSize: 15, fontWeight: '600', minWidth: 56 },
  save: { color: colors.cyan, fontSize: 15, fontWeight: '800', minWidth: 56, textAlign: 'right' },
  disabled: { opacity: 0.4 },
  sheetContent: { padding: spacing.md },
});
