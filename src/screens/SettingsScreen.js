import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { ScreenHeader } from '../components/AppShell';
import { ScreenIntro, SectionHeading, StatusBanner } from '../components/ScreenLayout';
import { Card, SecondaryButton } from '../components/Ui';
import { colors, spacing } from '../theme';

function SettingChoices({ label, body, value, onChange, choices, last = false }) {
  return (
    <View style={[styles.settingRow, last && styles.settingRowLast]}>
      <View style={styles.settingCopy}>
        <Text style={styles.settingTitle}>{label}</Text>
        <Text style={styles.settingBody}>{body}</Text>
      </View>
      <View style={styles.choices}>
        {choices.map(({ key, label: choiceLabel }) => (
          <SecondaryButton key={key} label={choiceLabel} onPress={() => onChange(key)} selected={value === key} style={styles.choice} />
        ))}
      </View>
    </View>
  );
}

export default function SettingsScreen({ accountEmail = '', authStatus = 'signedOut', settings, onChange, syncStatus = 'local' }) {
  const update = (key, value) => onChange({ ...settings, [key]: value });
  const signedIn = authStatus === 'signedIn';
  const syncCopy = syncStatus === 'saving'
    ? 'Saving changes to your DMZ Scuba account…'
    : syncStatus === 'error'
      ? 'Saved on this device. Account sync will retry after the next change.'
      : signedIn
        ? `Synced with ${accountEmail || 'your DMZ Scuba account'}.`
        : 'Saved on this device. Sign in from Account to carry these settings to another device.';
  return (
    <View style={styles.screen}>
      <ScreenHeader eyebrow="DMZ SCUBA" title="Settings" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenIntro
          body="Choose the defaults the app should use when you open a calculator or planning tool."
          eyebrow="APP PREFERENCES"
          title="Set up the app for your diving."
        />
        <StatusBanner
          body={syncCopy}
          label={signedIn ? 'ACCOUNT SYNC' : 'LOCAL SETTINGS'}
          style={styles.syncStatus}
          tone={syncStatus === 'error' ? 'warning' : signedIn ? 'success' : 'info'}
        />

        <SectionHeading title="Calculator mode" />
        <Card style={styles.card}>
          <View style={styles.switchRow}>
            <View style={styles.settingCopy}>
              <Text style={styles.settingTitle}>Trimix mode</Text>
              <Text style={styles.settingBody}>Show helium fields, trimix blending steps, END, and helium tissue calculations.</Text>
            </View>
            <Switch
              accessibilityLabel="Trimix mode"
              onValueChange={(value) => update('trimixMode', value)}
              thumbColor={settings.trimixMode ? colors.cyan : colors.faint}
              trackColor={{ false: colors.surfaceSoft, true: 'rgba(112,221,246,0.38)' }}
              value={settings.trimixMode}
            />
          </View>
          <View style={styles.modeStatus}>
            <Text style={styles.modeStatusLabel}>{settings.trimixMode ? 'TRIMIX ENABLED' : 'RECREATIONAL NITROX'}</Text>
            <Text style={styles.modeStatusText}>{settings.trimixMode ? 'Helium controls are visible in supported calculator tools.' : 'Helium controls stay hidden to keep the core tools clear for newer divers.'}</Text>
          </View>
        </Card>

        <SectionHeading title="Default units" />
        <Card style={styles.card}>
          <SettingChoices label="Depth" body="Dive depth, MOD, EAD, END, and ceilings." value={settings.depthUnit} onChange={(value) => update('depthUnit', value)} choices={[{ key: 'ft', label: 'Feet' }, { key: 'm', label: 'Meters' }]} />
          <SettingChoices label="Pressure" body="Cylinder pressure and gas-blending instructions." value={settings.pressureUnit} onChange={(value) => update('pressureUnit', value)} choices={[{ key: 'psi', label: 'PSI' }, { key: 'bar', label: 'Bar' }]} />
          <SettingChoices label="Gas volume" body="RMV, gas-used, and required-gas results." value={settings.gasVolumeUnit} onChange={(value) => update('gasVolumeUnit', value)} choices={[{ key: 'ft³', label: 'ft³' }, { key: 'L', label: 'Liters' }]} />
          <SettingChoices last label="Temperature" body="Water, weather, and future exposure tools." value={settings.temperatureUnit} onChange={(value) => update('temperatureUnit', value)} choices={[{ key: 'F', label: '°F' }, { key: 'C', label: '°C' }]} />
        </Card>

        <Text style={styles.footer}>Changing a default affects newly opened calculators. Values already entered on an open screen are not overwritten.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  content: { paddingBottom: spacing.lg, paddingHorizontal: spacing.md, paddingTop: spacing.lg },
  syncStatus: { marginBottom: spacing.lg },
  card: { padding: spacing.md },
  switchRow: { alignItems: 'center', flexDirection: 'row', gap: 14 },
  settingRow: { borderBottomColor: colors.line, borderBottomWidth: 1, paddingBottom: 16, paddingTop: 2 },
  settingRowLast: { borderBottomWidth: 0, paddingBottom: 2 },
  settingCopy: { flex: 1 },
  settingTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  settingBody: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 4 },
  choices: { flexDirection: 'row', gap: 7, marginTop: 11 },
  choice: { flex: 1, minHeight: 40, paddingVertical: 8 },
  modeStatus: { backgroundColor: colors.backgroundRaised, borderColor: colors.line, borderRadius: 12, borderWidth: 1, marginTop: 15, padding: 11 },
  modeStatusLabel: { color: colors.cyan, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  modeStatusText: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 4 },
  footer: { color: colors.faint, fontSize: 10, lineHeight: 16, marginHorizontal: 9, textAlign: 'center' },
});
