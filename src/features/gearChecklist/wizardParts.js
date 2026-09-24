import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useState } from 'react';

import { ScreenHeader } from '../../components/AppShell';
import { NUMBER_KEYBOARD_ACCESSORY_ID } from '../../lib/numberKeyboard';
import { searchGear } from './model';
import { colors, radii, spacing } from '../../theme';

// Building blocks shared by the guided add-gear flows (AddGearWizard, CylinderWizard).
export const wizardStyles = StyleSheet.create({
  checkRow: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.lineStrong, borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: 10, marginBottom: 8, minHeight: 52, paddingHorizontal: 12, paddingVertical: 9 },
  checkRowOn: { backgroundColor: 'rgba(112,221,246,0.12)', borderColor: colors.cyan },
  checkBox: { alignItems: 'center', borderColor: colors.lineStrong, borderRadius: 6, borderWidth: 1.5, height: 22, justifyContent: 'center', width: 22 },
  checkBoxOn: { backgroundColor: colors.cyan, borderColor: colors.cyan },
  checkMark: { color: colors.background, fontSize: 13, fontWeight: '900' },
  checkCopy: { flex: 1 },
  checkTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  checkBody: { color: colors.faint, fontSize: 11, marginTop: 2 },
  searchInput: { backgroundColor: colors.backgroundRaised, borderColor: colors.lineStrong, borderRadius: radii.md, borderWidth: 1, color: colors.text, fontSize: 15, marginBottom: 10, minHeight: 44, paddingHorizontal: 12 },
  emptyLine: { color: colors.faint, fontSize: 12, marginBottom: 10 },
  screen: { backgroundColor: colors.background, flex: 1 },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  footer: { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, padding: spacing.md },
  introTitle: { color: colors.text, fontSize: 24, fontWeight: '900', letterSpacing: -0.4, marginBottom: 6 },
  stepBody: { color: colors.muted, fontSize: 13, lineHeight: 19, marginBottom: 16 },
  dots: { flexDirection: 'row', gap: 6, marginBottom: 14 },
  dot: { backgroundColor: colors.line, borderRadius: 3, height: 5, width: 18 },
  dotActive: { backgroundColor: colors.cyan },
  categoryGroup: { marginBottom: 18 },
  categoryGroupLabel: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.7, marginBottom: 8, textTransform: 'uppercase' },
  categoryTiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryTile: { backgroundColor: colors.surface, borderColor: colors.lineStrong, borderRadius: radii.md, borderWidth: 1, minWidth: '31%', paddingHorizontal: 12, paddingVertical: 14 },
  categoryTileText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  fullFormLink: { marginTop: 6 },
  yesNoRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  yesNoButton: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.lineStrong, borderRadius: radii.md, borderWidth: 1, flex: 1, minHeight: 54, justifyContent: 'center' },
  yesNoButtonActive: { backgroundColor: 'rgba(112,221,246,0.14)', borderColor: colors.cyan },
  yesNoText: { color: colors.text, fontSize: 14, fontWeight: '800' },
  yesNoTextActive: { color: colors.cyan },
  accessoryOption: { backgroundColor: colors.surface, borderColor: colors.lineStrong, borderRadius: radii.md, borderWidth: 1, marginBottom: 8, minHeight: 54, paddingHorizontal: 14, paddingVertical: 10 },
  accessoryOptionBody: { color: colors.faint, fontSize: 10, marginTop: 2 },
  summaryStrip: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 18 },
  summaryChip: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
  summaryChipText: { color: colors.muted, fontSize: 10, fontWeight: '700' },
  field: { marginBottom: 14 },
  fieldLabel: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.45, marginBottom: 7, textTransform: 'uppercase' },
  pillLabel: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.45, marginBottom: 7, marginTop: 4, textTransform: 'uppercase' },
  notesInput: { backgroundColor: colors.backgroundRaised, borderColor: colors.lineStrong, borderRadius: radii.md, borderWidth: 1, color: colors.text, fontSize: 15, fontWeight: '600', minHeight: 94, padding: 13 },
  extraPart: { backgroundColor: colors.backgroundRaised, borderColor: colors.lineStrong, borderRadius: radii.md, borderWidth: 1, marginBottom: 12, padding: 12 },
  extraPartHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  extraPartTitle: { color: colors.cyan, flex: 1, fontSize: 13, fontWeight: '900', marginRight: 8 },
  removeExtra: { color: colors.danger, fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  twoColumn: { flexDirection: 'row', gap: 9 },
  half: { flex: 1 },
  pressed: { opacity: 0.74, transform: [{ scale: 0.985 }] },
});
const styles = wizardStyles;

export function StepDots({ index, count }) {
  return (
    <View style={styles.dots}>
      {Array.from({ length: count }).map((_, i) => <View key={i} style={[styles.dot, i <= index && styles.dotActive]} />)}
    </View>
  );
}

export function StepShell({ eyebrow = 'ADD GEAR', title, body, onBack, index, count, children, footer }) {
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
      <ScreenHeader eyebrow={eyebrow} title={title} onBack={onBack} />
      <ScrollView contentContainerStyle={styles.content} keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {count ? <StepDots index={index} count={count} /> : null}
        {body ? <Text style={styles.stepBody}>{body}</Text> : null}
        {children}
      </ScrollView>
      <View style={styles.footer}>{footer}</View>
    </KeyboardAvoidingView>
  );
}

// Generic row of equal-width pill buttons — YesNoRow below is the plain yes/no case;
// steps that need a third option (or an unrelated two-way toggle) pass their own options.
export function PillOptionRow({ label, options, value, onChange }) {
  return (
    <>
      {label ? <Text style={styles.pillLabel}>{label}</Text> : null}
      <View style={styles.yesNoRow}>
        {options.map((option) => (
          <Pressable accessibilityRole="button" key={String(option.value)} onPress={() => onChange(option.value)} style={[styles.yesNoButton, value === option.value && styles.yesNoButtonActive]}>
            <Text style={[styles.yesNoText, value === option.value && styles.yesNoTextActive]}>{option.label}</Text>
          </Pressable>
        ))}
      </View>
    </>
  );
}

export const YES_NO_OPTIONS = [{ value: true, label: 'Yes' }, { value: false, label: 'No, skip it' }];

export function YesNoRow({ value, onChange }) {
  return <PillOptionRow onChange={onChange} options={YES_NO_OPTIONS} value={value} />;
}

// One row in the "which one?" list under a Hood/Gloves/Boots yes — either an existing locker
// item (tap to link it) or the trailing "Add a new …" row (tap to reveal quick-add fields below).
export function AccessoryOptionRow({ label, body, selected, onPress }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.accessoryOption, selected && styles.yesNoButtonActive]}>
      <Text style={[styles.yesNoText, selected && styles.yesNoTextActive]}>{label}</Text>
      {body ? <Text style={styles.accessoryOptionBody}>{body}</Text> : null}
    </Pressable>
  );
}

export function SummaryStrip({ chips }) {
  return (
    <View style={styles.summaryStrip}>
      {chips.map((chip) => <View key={chip} style={styles.summaryChip}><Text style={styles.summaryChipText}>{chip}</Text></View>)}
    </View>
  );
}

export function NotesField({ value, onChangeText }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>Notes</Text>
      <TextInput
        inputAccessoryViewID={NUMBER_KEYBOARD_ACCESSORY_ID}
        multiline
        onChangeText={onChangeText}
        placeholder="Optional notes…"
        placeholderTextColor={colors.faint}
        style={styles.notesInput}
        textAlignVertical="top"
        value={value}
      />
    </View>
  );
}

// A tappable row with a checkbox — used to pick setups and existing locker items.
export function CheckRow({ checked, label, body, onPress }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={onPress} style={[styles.checkRow, checked && styles.checkRowOn]}>
      <View style={[styles.checkBox, checked && styles.checkBoxOn]}>{checked ? <Text style={styles.checkMark}>✓</Text> : null}</View>
      <View style={styles.checkCopy}>
        <Text numberOfLines={1} style={styles.checkTitle}>{label}</Text>
        {body ? <Text numberOfLines={1} style={styles.checkBody}>{body}</Text> : null}
      </View>
    </Pressable>
  );
}

// Which dive setups a new item goes into.
export function SetupPicker({ setups, selectedIds, onChange }) {
  if (!setups?.length) return null;
  const toggle = (id) => onChange(selectedIds.includes(id) ? selectedIds.filter((entry) => entry !== id) : [...selectedIds, id]);
  return (
    <>
      <Text style={styles.pillLabel}>Add to setups</Text>
      {setups.map((setup) => <CheckRow checked={selectedIds.includes(setup.id)} key={setup.id} label={setup.name} body={setup.type} onPress={() => toggle(setup.id)} />)}
    </>
  );
}

// Link gear you already own (a hood, a transmitter, a light) instead of describing it again as a
// new part. The link is stored as accessoryItemIds, so the linked item keeps its own page and service.
export function LinkExistingItems({ candidates, selectedIds, onChange, label = 'Or link something already in your locker' }) {
  const [query, setQuery] = useState('');
  if (!candidates?.length) return null;
  const shown = searchGear(candidates, query);
  const toggle = (id) => onChange(selectedIds.includes(id) ? selectedIds.filter((entry) => entry !== id) : [...selectedIds, id]);
  return (
    <View style={{ marginTop: 18 }}>
      <Text style={styles.pillLabel}>{label}</Text>
      {candidates.length > 6 ? (
        <TextInput accessibilityLabel="Search your locker" autoCorrect={false} clearButtonMode="while-editing" inputAccessoryViewID={NUMBER_KEYBOARD_ACCESSORY_ID} onChangeText={setQuery} placeholder="Search your locker" placeholderTextColor={colors.faint} style={styles.searchInput} value={query} />
      ) : null}
      {shown.length ? shown.map((item) => (
        <CheckRow checked={selectedIds.includes(item.id)} key={item.id} label={item.name} body={[item.category, item.manufacturer, item.model].filter(Boolean).join(' · ')} onPress={() => toggle(item.id)} />
      )) : <Text style={styles.emptyLine}>Nothing in your locker matches “{query}”.</Text>}
    </View>
  );
}
