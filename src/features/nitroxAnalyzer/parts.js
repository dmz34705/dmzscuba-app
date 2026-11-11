// Small shared UI pieces for the nitrox screens.
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { colors, radii, spacing } from '../../theme';

export function Field({ label, error, style, multiline, ...input }) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.faint}
        style={[styles.input, multiline && styles.inputMultiline, error && styles.inputError]}
        multiline={multiline}
        {...input}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

export function ToggleRow({ label, body, value, onValueChange }) {
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {body ? <Text style={styles.toggleBody}>{body}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ true: colors.good }} />
    </View>
  );
}

export function Segmented({ options, value, onChange }) {
  return (
    <View style={styles.segmented} accessibilityRole="tablist">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => onChange(o.value)} style={[styles.segment, selected && styles.segmentOn]}>
            <Text style={[styles.segmentText, selected && styles.segmentTextOn]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Tag({ label, tone = 'info' }) {
  const color = { good: colors.good, warning: colors.warning, danger: colors.danger, info: colors.cyan, muted: colors.faint }[tone] || colors.cyan;
  return <Text style={[styles.tag, { color, borderColor: `${color}66`, backgroundColor: `${color}14` }]}>{label}</Text>;
}

export function TextLink({ label, onPress, tone }) {
  return (
    <Pressable accessibilityRole="button" hitSlop={8} onPress={onPress} style={({ pressed }) => [styles.linkWrap, pressed && { opacity: 0.6 }]}>
      <Text style={[styles.link, tone === 'danger' && { color: colors.danger }]}>{label}</Text>
    </Pressable>
  );
}

export const partStyles = StyleSheet.create({
  sectionLabel: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 8, marginTop: spacing.sm },
  row: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  muted: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  faint: { color: colors.faint, fontSize: 12 },
  title: { color: colors.text, fontSize: 16, fontWeight: '800' },
  o2: { color: colors.text, fontSize: 26, fontVariant: ['tabular-nums'], fontWeight: '900', minWidth: 76 },
  listCard: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: radii.md, borderWidth: 1, marginBottom: 8, padding: 12 },
});

const styles = StyleSheet.create({
  field: { marginBottom: 12 },
  fieldLabel: { color: colors.muted, fontSize: 12, fontWeight: '700', marginBottom: 6 },
  input: { backgroundColor: colors.surface, borderColor: colors.lineStrong, borderRadius: radii.sm, borderWidth: 1, color: colors.text, fontSize: 16, minHeight: 46, paddingHorizontal: 12, paddingVertical: 10 },
  inputMultiline: { minHeight: 80, textAlignVertical: 'top' },
  inputError: { borderColor: colors.danger },
  error: { color: colors.danger, fontSize: 12, marginTop: 4 },
  toggleRow: { alignItems: 'center', flexDirection: 'row', gap: 12, marginBottom: 12, minHeight: 48 },
  toggleLabel: { color: colors.text, fontSize: 15, fontWeight: '700' },
  toggleBody: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  segmented: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', marginBottom: spacing.md, padding: 3 },
  segment: { alignItems: 'center', borderRadius: radii.sm, flex: 1, minHeight: 40, justifyContent: 'center' },
  segmentOn: { backgroundColor: 'rgba(112, 221, 246, 0.16)' },
  segmentText: { color: colors.muted, fontSize: 14, fontWeight: '700' },
  segmentTextOn: { color: colors.cyan },
  tag: { alignSelf: 'flex-start', borderRadius: radii.pill, borderWidth: 1, fontSize: 10, fontWeight: '800', letterSpacing: 0.4, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 3 },
  linkWrap: { minHeight: 32, justifyContent: 'center' },
  link: { color: colors.cyan, fontSize: 14, fontWeight: '700' },
});
