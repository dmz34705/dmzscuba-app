import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import MenuPage from '../components/MenuPage';
import { SETTINGS_SECTIONS } from '../application/navigation';
import { StatusBanner } from '../components/ScreenLayout';
import { GroupedSection, NavigationRow, SecondaryButton } from '../components/Ui';
import {
  isLocationTrackingAvailable,
  startLocationTracking,
  stopLocationTracking,
} from '../lib/locationLog/locationTrackingService';
import { colors, spacing } from '../theme';
import { DEFAULT_PROFILE_COLORS } from '../lib/appSettings';
import { restoreJsonBackup } from '../lib/diveLog/storage';
import { shareLogbookExport } from '../features/diveLog/shareLogbookExport';

async function restoreLogbookFile() {
  let DocumentPicker;
  let FileSystem;
  try {
    DocumentPicker = require('expo-document-picker');
    FileSystem = require('expo-file-system');
  } catch {
    throw new Error('File restore is available in a full app build, not Expo Go.');
  }
  const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
  if (result.canceled) return null;
  const file = new FileSystem.File(result.assets[0].uri);
  const summary = await restoreJsonBackup(await file.text());
  return summary;
}

function LogbookExportCard() {
  const [busy, setBusy] = useState(false);
  const run = async (action) => {
    setBusy(true);
    try { await action(); }
    catch (error) { Alert.alert('Logbook backup', error?.message || 'The operation could not be completed.'); }
    finally { setBusy(false); }
  };
  return (
    <View>
      <Text style={[styles.settingBody, styles.sectionContent]}>JSON backup includes all computer profiles. Restore adds dives while keeping the current logbook.</Text>
      <NavigationRow disabled={busy} title="Save JSON backup" body="All dive records and samples" onPress={() => run(() => shareLogbookExport('json', null, 'full', true))} />
      <NavigationRow disabled={busy} title="Export CSV" body="Dive summaries for spreadsheets" onPress={() => run(() => shareLogbookExport('csv'))} />
      <NavigationRow disabled={busy} title="Export UDDF" body="Dive interchange file" onPress={() => run(() => shareLogbookExport('uddf'))} />
      <NavigationRow disabled={busy} title="Restore JSON backup" body="Add dives from a saved file" onPress={() => run(async () => {
        const result = await restoreLogbookFile();
        if (result) Alert.alert('Restore complete', `${result.importedDives.length} dives added. Existing dives were kept.`);
      })} last />
      {busy ? <Text accessibilityLiveRegion="polite" style={[styles.settingBody, styles.sectionContent]}>Working…</Text> : null}
    </View>
  );
}

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

function ColorChoices({ label, value, onChange, choices }) {
  return (
    <View style={styles.colorChoiceRow}>
      <Text style={styles.settingTitle}>{label}</Text>
      <View style={styles.colorChoices}>
        {choices.map((color) => (
          <Pressable
            accessibilityLabel={`${label} ${color}`}
            accessibilityRole="button"
            accessibilityState={{ selected: value === color }}
            key={color}
            onPress={() => onChange(color)}
            style={[styles.colorSwatch, { backgroundColor: color }, value === color && styles.colorSwatchSelected]}
          />
        ))}
      </View>
    </View>
  );
}

// Self-contained: the async permission dance and its transient feedback
// ("requesting…", "denied — here's why") are UI-only state that doesn't
// belong in the persisted settings blob, which only records the user's
// on/off intent.
function LocationLoggingCard({ enabled, onChange }) {
  const [available, setAvailable] = useState(true); // assume yes until checked, to avoid a flash of "unavailable"
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    isLocationTrackingAvailable().then((value) => {
      if (active) setAvailable(value);
    });
    return () => { active = false; };
  }, []);

  const handleToggle = async (value) => {
    setNotice('');
    if (!value) {
      setPending(true);
      await stopLocationTracking();
      setPending(false);
      onChange(false);
      return;
    }
    setPending(true);
    const { started, permission } = await startLocationTracking();
    setPending(false);
    if (started) {
      onChange(true);
      return;
    }
    onChange(false);
    setNotice(
      permission === 'foreground-only'
        ? 'Location was allowed only "While Using the App." This feature needs "Always" — enable it for DMZ Scuba in iPhone Settings → Privacy & Security → Location Services.'
        : 'Location access was not granted, so this couldn’t turn on. You can allow it later in iPhone Settings → Privacy & Security → Location Services.',
    );
  };

  if (!available) {
    return (
      <View style={styles.sectionContent}>
        <Text style={styles.settingBody}>
          Dive site suggestions need the full app build (not Expo Go) to log location in the background.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.sectionContent}>
      <View style={styles.switchRow}>
        <View style={styles.settingCopy}>
          <Text style={styles.settingTitle}>Suggest dive sites from location</Text>
          <Text style={styles.settingBody}>
            Logs a coarse location breadcrumb in the background — just enough to tell which dive site or
            marina you were near. When you sync a dive computer, matching entries will offer to link that
            location to the dive. Off by default; nothing is logged unless this is on.
          </Text>
        </View>
        <Switch
          accessibilityLabel="Suggest dive sites from location"
          disabled={pending}
          onValueChange={handleToggle}
          thumbColor={enabled ? colors.cyan : colors.faint}
          trackColor={{ false: colors.surfaceSoft, true: 'rgba(112,221,246,0.38)' }}
          value={enabled}
        />
      </View>
      {notice ? <Text style={styles.locationNotice}>{notice}</Text> : null}
    </View>
  );
}

export default function SettingsScreen({ accountEmail = '', authStatus = 'signedOut', settings, onChange, syncStatus = 'local', onBack, section = null, onOpenSection }) {
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
    <MenuPage title={SETTINGS_SECTIONS[section] || 'Settings'} onBack={onBack} backLabel={section ? 'Settings' : 'More'}>
      {!section ? <>
        <GroupedSection title="Preferences">
          <NavigationRow title="Units" body={`Depth: ${settings.depthUnit} · Pressure: ${settings.pressureUnit} · Volume: ${settings.gasVolumeUnit} · Temperature: °${settings.temperatureUnit}`} onPress={() => onOpenSection('units')} />
          <NavigationRow title="Calculator preferences" body={settings.trimixMode ? 'Trimix enabled' : 'Recreational nitrox'} onPress={() => onOpenSection('calculator')} />
          <NavigationRow title="Dive profile graph" body="Line colors and weight" onPress={() => onOpenSection('graph')} last />
        </GroupedSection>
        <GroupedSection title="Logbook & privacy">
          <NavigationRow title="Export & backup" body="Save your logbook or restore a JSON backup" onPress={() => onOpenSection('backup')} />
          <NavigationRow title="Location" body={settings.locationLoggingEnabled ? 'Dive site suggestions enabled' : 'Dive site suggestions off'} onPress={() => onOpenSection('location')} last />
        </GroupedSection>
        <StatusBanner
          body={syncCopy}
          label={signedIn ? 'ACCOUNT SYNC' : 'LOCAL SETTINGS'}
          style={styles.syncStatus}
          tone={syncStatus === 'error' ? 'warning' : signedIn ? 'success' : 'info'}
        />

      </> : null}
        {section === 'calculator' ? <GroupedSection title="Calculator mode">
          <View style={styles.sectionContent}>
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
        </View>
        </GroupedSection> : null}

        {section === 'units' ? <GroupedSection title="Default units">
          <View style={styles.sectionContent}>
          <SettingChoices label="Depth" body="Dive depth, MOD, EAD, END, and ceilings." value={settings.depthUnit} onChange={(value) => update('depthUnit', value)} choices={[{ key: 'ft', label: 'Feet' }, { key: 'm', label: 'Meters' }]} />
          <SettingChoices label="Pressure" body="Cylinder pressure and gas-blending instructions." value={settings.pressureUnit} onChange={(value) => update('pressureUnit', value)} choices={[{ key: 'psi', label: 'PSI' }, { key: 'bar', label: 'Bar' }]} />
          <SettingChoices label="Gas volume" body="RMV, gas-used, and required-gas results." value={settings.gasVolumeUnit} onChange={(value) => update('gasVolumeUnit', value)} choices={[{ key: 'ft³', label: 'ft³' }, { key: 'L', label: 'Liters' }]} />
          <SettingChoices last label="Temperature" body="Water, weather, and future exposure tools." value={settings.temperatureUnit} onChange={(value) => update('temperatureUnit', value)} choices={[{ key: 'F', label: '°F' }, { key: 'C', label: '°C' }]} />
        </View>
        </GroupedSection> : null}

        {section === 'location' ? <GroupedSection title="Dive site suggestions">
          <LocationLoggingCard enabled={settings.locationLoggingEnabled} onChange={(value) => update('locationLoggingEnabled', value)} />
        </GroupedSection> : null}

        {section === 'graph' ? <GroupedSection title="Dive profile graph">
          <View style={styles.sectionContent}>
          <Text style={styles.settingBody}>Choose the trace colors and line weight used by the interactive dive profile. These settings do not change stored dive data.</Text>
          <ColorChoices label="Depth" value={settings.profileColors?.depth || DEFAULT_PROFILE_COLORS.depth} onChange={(value) => update('profileColors', { ...settings.profileColors, depth: value })} choices={['#70DDF6', '#5DA9E9', '#FFFFFF', '#D98CFF']} />
          <ColorChoices label="Temperature" value={settings.profileColors?.temperature || DEFAULT_PROFILE_COLORS.temperature} onChange={(value) => update('profileColors', { ...settings.profileColors, temperature: value })} choices={['#FFB36A', '#FF7F7F', '#FFE27A', '#FFFFFF']} />
          <ColorChoices label="Tank pressure" value={settings.profileColors?.pressure || DEFAULT_PROFILE_COLORS.pressure} onChange={(value) => update('profileColors', { ...settings.profileColors, pressure: value })} choices={['#F0C84B', '#70E2A3', '#70DDF6', '#FFFFFF']} />
          <ColorChoices label="ppO₂" value={settings.profileColors?.oxygen || DEFAULT_PROFILE_COLORS.oxygen} onChange={(value) => update('profileColors', { ...settings.profileColors, oxygen: value })} choices={['#70E2A3', '#70DDF6', '#FFB36A', '#FFFFFF']} />
          <ColorChoices label="Setpoint" value={settings.profileColors?.setpoint || DEFAULT_PROFILE_COLORS.setpoint} onChange={(value) => update('profileColors', { ...settings.profileColors, setpoint: value })} choices={['#70E2A3', '#D98CFF', '#70DDF6', '#FFFFFF']} />
          <ColorChoices label="Grid" value={settings.profileColors?.grid || DEFAULT_PROFILE_COLORS.grid} onChange={(value) => update('profileColors', { ...settings.profileColors, grid: value })} choices={['#6F8DA2', '#A7C4D8', '#3C6A85', '#FFFFFF']} />
          <SettingChoices label="Line weight" body="Applies to depth, temperature, pressure, and oxygen traces." value={settings.profileLineWidth || 2.75} onChange={(value) => update('profileLineWidth', value)} choices={[{ key: 1.5, label: 'Thin' }, { key: 2.75, label: 'Standard' }, { key: 4, label: 'Bold' }]} last />
        </View>
        </GroupedSection> : null}

        {section === 'backup' ? <GroupedSection title="Logbook backup">
          <LogbookExportCard />
        </GroupedSection> : null}

        {section === 'units' || section === 'calculator' ? <Text style={styles.footer}>Changing a default affects newly opened calculators. Values already entered on an open screen are not overwritten.</Text> : null}
    </MenuPage>
  );
}

const styles = StyleSheet.create({
  syncStatus: { marginBottom: spacing.lg },
  sectionContent: { padding: spacing.md },
  switchRow: { alignItems: 'center', flexDirection: 'row', gap: 14 },
  settingRow: { borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 16, paddingTop: 16 },
  settingRowLast: { borderBottomWidth: 0, paddingBottom: 2 },
  settingCopy: { flex: 1 },
  settingTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  settingBody: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 11 },
  colorChoiceRow: { borderBottomColor: colors.line, borderBottomWidth: 1, paddingBottom: 12, paddingTop: 12 },
  colorChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 },
  colorSwatch: { borderColor: colors.lineStrong, borderRadius: 14, borderWidth: 2, height: 44, width: 44 },
  colorSwatchSelected: { borderColor: colors.text, borderWidth: 3, transform: [{ scale: 1.12 }] },
  choice: { flex: 1, minHeight: 44, minWidth: 70, paddingVertical: 8 },
  modeStatus: { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, marginTop: 15, paddingTop: 12 },
  modeStatusLabel: { color: colors.cyan, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  modeStatusText: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 4 },
  locationNotice: {
    backgroundColor: 'rgba(255,127,127,0.1)',
    borderColor: 'rgba(255,127,127,0.35)',
    borderRadius: 10,
    borderWidth: 1,
    color: colors.danger,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 12,
    padding: 10,
  },
  footer: { color: colors.faint, fontSize: 12, lineHeight: 18, marginHorizontal: 2, textAlign: 'center' },
});
