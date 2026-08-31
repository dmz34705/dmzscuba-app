import { Keyboard, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { SecondaryButton } from './Ui';
import { NUMBER_KEYBOARD_ACCESSORY_ID, usesNumberKeyboard } from '../lib/numberKeyboard';
import { colors, radii } from '../theme';

export function FormField({
  autoCapitalize = 'sentences',
  autoComplete,
  editable = true,
  helper,
  keyboardType = 'default',
  label,
  maxLength,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  textContentType,
  value,
}) {
  const hasNumberKeyboard = usesNumberKeyboard(keyboardType);

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete}
        autoCorrect={false}
        editable={editable}
        inputAccessoryViewID={hasNumberKeyboard ? NUMBER_KEYBOARD_ACCESSORY_ID : undefined}
        keyboardType={keyboardType}
        maxLength={maxLength}
        onChangeText={onChangeText}
        onSubmitEditing={hasNumberKeyboard ? Keyboard.dismiss : undefined}
        placeholder={placeholder}
        placeholderTextColor={colors.faint}
        returnKeyType={hasNumberKeyboard ? 'done' : undefined}
        secureTextEntry={secureTextEntry}
        style={[styles.input, !editable && styles.inputDisabled]}
        textContentType={textContentType}
        value={value}
      />
      {helper ? <Text style={styles.helper}>{helper}</Text> : null}
    </View>
  );
}

export function ChoiceGroup({ label, value, onChange, choices }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <ScrollView horizontal contentContainerStyle={styles.choices} showsHorizontalScrollIndicator={false}>
        {choices.map((choice) => <SecondaryButton key={choice} label={choice} onPress={() => onChange(choice)} selected={value === choice} style={styles.choice} />)}
      </ScrollView>
    </View>
  );
}

export function PreviewNotice({ children = 'Account preview only. No credentials or personal information leave this device.' }) {
  return (
    <View style={styles.notice}>
      <Text style={styles.noticeLabel}>ACCOUNT UI PREVIEW</Text>
      <Text style={styles.noticeText}>{children}</Text>
    </View>
  );
}

export function FormError({ message }) {
  return message ? <Text accessibilityRole="alert" style={styles.error}>{message}</Text> : null;
}

const styles = StyleSheet.create({
  field: { marginBottom: 14 },
  label: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.45, marginBottom: 7, textTransform: 'uppercase' },
  input: { backgroundColor: colors.backgroundRaised, borderColor: colors.lineStrong, borderRadius: radii.md, borderWidth: 1, color: colors.text, fontSize: 16, fontWeight: '700', minHeight: 50, paddingHorizontal: 13, paddingVertical: 11 },
  inputDisabled: { color: colors.muted, opacity: 0.72 },
  helper: { color: colors.faint, fontSize: 10, lineHeight: 15, marginTop: 5 },
  choices: { gap: 7, paddingBottom: 2 },
  choice: { minHeight: 40, paddingHorizontal: 12, paddingVertical: 8 },
  notice: { backgroundColor: 'rgba(112,221,246,0.08)', borderColor: 'rgba(112,221,246,0.3)', borderRadius: radii.md, borderWidth: 1, marginBottom: 16, padding: 12 },
  noticeLabel: { color: colors.cyan, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  noticeText: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 4 },
  error: { backgroundColor: 'rgba(255,127,127,0.1)', borderColor: 'rgba(255,127,127,0.35)', borderRadius: radii.sm, borderWidth: 1, color: colors.danger, fontSize: 12, lineHeight: 18, marginBottom: 13, padding: 10 },
});
