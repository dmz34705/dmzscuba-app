import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton, SecondaryButton } from '../../components/Ui';
import LoginScreen from '../../screens/LoginScreen';
import { Field, Half, TwoUp } from '../planner/fields';
import GearAdviceSheet from '../gearChecklist/GearAdviceSheet';
import { ADVICE_DEFAULTS, ADVICE_PREFERENCES_KEY, hasTemperatureGearPreferences, normalizeAdvicePreferences } from '../gearChecklist/diveAdvice';
import { startLocationTracking } from '../../lib/locationLog/locationTrackingService';
import {
  depthToInput,
  parseDepthInput,
  parsePressureInput,
  parseTemperatureInput,
  parseVolumeInput,
  pressureToInput,
  temperatureToInput,
  volumeToInput,
} from '../../lib/diveLog/format';
import { colors, radii, spacing } from '../../theme';

const STEPS = ['Welcome', 'Account', 'Units', 'Dive preferences', 'Temperature preferences', 'Starting baseline', 'Finish'];

const unitsForSystem = (system) => (system === 'metric'
  ? { depthUnit: 'm', pressureUnit: 'bar', gasVolumeUnit: 'L', temperatureUnit: 'C' }
  : { depthUnit: 'ft', pressureUnit: 'psi', gasVolumeUnit: 'ft³', temperatureUnit: 'F' });

function Option({ title, body, selected, onPress }) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={onPress} style={({ pressed }) => [styles.option, selected && styles.optionOn, pressed && styles.pressed]}>
      <View style={[styles.radio, selected && styles.radioOn]}>{selected ? <View style={styles.radioDot} /> : null}</View>
      <View style={styles.flex}><Text style={styles.optionTitle}>{title}</Text><Text style={styles.optionBody}>{body}</Text></View>
    </Pressable>
  );
}

function Progress({ step }) {
  return <View style={styles.progress}>{STEPS.map((label, index) => <View key={label} style={[styles.progressBar, index <= step && styles.progressBarOn]} />)}</View>;
}

function baselineDraft(settings, units) {
  const baseline = settings.diveBaseline || {};
  return {
    sac: pressureToInput(baseline.sacBarPerMin, units.pressureUnit),
    rmv: volumeToInput(baseline.rmvLitersPerMin, units.gasVolumeUnit),
    depth: depthToInput(baseline.avgDepthMeters, units.depthUnit),
    duration: baseline.durationSeconds ? String(Math.round(baseline.durationSeconds / 60)) : '',
    temperature: temperatureToInput(baseline.tempMinC, units.temperatureUnit),
  };
}

export default function FirstTimeSetup({ settings, authStatus, accountEmail, onComplete, onSignIn, onSkip }) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [system, setSystem] = useState(settings.depthUnit === 'm' ? 'metric' : 'imperial');
  const [trimixMode, setTrimixMode] = useState(settings.trimixMode === true);
  const [thermalTendency, setThermalTendency] = useState('typical');
  const [motionSensitive, setMotionSensitive] = useState(false);
  const [drysuitThreshold, setDrysuitThreshold] = useState('');
  const [temperaturePreferenceTiming, setTemperaturePreferenceTiming] = useState('');
  const [temperaturePreferencesOpen, setTemperaturePreferencesOpen] = useState(false);
  const [openingTemperaturePreferences, setOpeningTemperaturePreferences] = useState(false);
  const [baseline, setBaseline] = useState({ sac: '', rmv: '', depth: '', duration: '', temperature: '' });
  const [locationEnabled, setLocationEnabled] = useState(settings.locationLoggingEnabled === true);
  const [showSignIn, setShowSignIn] = useState(false);

  const units = useMemo(() => unitsForSystem(system), [system]);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(ADVICE_PREFERENCES_KEY).then((raw) => {
      if (!active) return;
      const advice = normalizeAdvicePreferences(raw ? JSON.parse(raw) : ADVICE_DEFAULTS);
      setThermalTendency(advice.thermalTendency);
      setMotionSensitive(advice.motionSensitive);
      setDrysuitThreshold(temperatureToInput(advice.drysuitBelowC, units.temperatureUnit));
      setTemperaturePreferenceTiming(hasTemperatureGearPreferences(advice) ? 'now' : '');
      setBaseline(baselineDraft(settings, units));
    }).catch(() => {
      if (active) {
        setDrysuitThreshold(temperatureToInput(ADVICE_DEFAULTS.drysuitBelowC, units.temperatureUnit));
        setBaseline(baselineDraft(settings, units));
      }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // Initial hydration only. Unit changes are converted explicitly below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (authStatus !== 'signedIn') return;
    const nextSystem = settings.depthUnit === 'm' ? 'metric' : 'imperial';
    const nextUnits = unitsForSystem(nextSystem);
    setSystem(nextSystem);
    setTrimixMode(settings.trimixMode === true);
    setLocationEnabled(settings.locationLoggingEnabled === true);
    setBaseline(baselineDraft(settings, nextUnits));
  }, [authStatus, settings]);

  const chooseSystem = (next) => {
    if (next === system) return;
    const previous = units;
    const future = unitsForSystem(next);
    setBaseline((current) => ({
      ...current,
      sac: pressureToInput(parsePressureInput(current.sac, previous.pressureUnit), future.pressureUnit),
      rmv: volumeToInput(parseVolumeInput(current.rmv, previous.gasVolumeUnit), future.gasVolumeUnit),
      depth: depthToInput(parseDepthInput(current.depth, previous.depthUnit), future.depthUnit),
      temperature: temperatureToInput(parseTemperatureInput(current.temperature, previous.temperatureUnit), future.temperatureUnit),
    }));
    setDrysuitThreshold((current) => temperatureToInput(parseTemperatureInput(current, previous.temperatureUnit), future.temperatureUnit));
    setSystem(next);
  };

  const skip = () => Alert.alert(
    'Skip personal setup?',
    'DMZ Scuba will still work, but personalized gas estimates, exposure guidance, site suggestions, and consistent unit defaults may be incomplete. You can run this setup later from Settings.',
    [{ text: 'Keep setting up', style: 'cancel' }, { text: 'Skip for now', onPress: onSkip }],
  );

  const openTemperaturePreferences = async () => {
    setOpeningTemperaturePreferences(true);
    try {
      const existingRaw = await AsyncStorage.getItem(ADVICE_PREFERENCES_KEY);
      const existing = normalizeAdvicePreferences(existingRaw ? JSON.parse(existingRaw) : ADVICE_DEFAULTS);
      await AsyncStorage.setItem(ADVICE_PREFERENCES_KEY, JSON.stringify(normalizeAdvicePreferences({
        ...existing,
        thermalTendency,
        motionSensitive,
        drysuitBelowC: parseTemperatureInput(drysuitThreshold, units.temperatureUnit) ?? existing.drysuitBelowC,
      })));
      setTemperaturePreferencesOpen(true);
    } catch (error) {
      setTemperaturePreferenceTiming('');
      Alert.alert('Preferences unavailable', error?.message || 'Please try again, or choose to set them later in Settings.');
    } finally { setOpeningTemperaturePreferences(false); }
  };

  const finish = async () => {
    setSaving(true);
    try {
      const existingRaw = await AsyncStorage.getItem(ADVICE_PREFERENCES_KEY);
      const existing = normalizeAdvicePreferences(existingRaw ? JSON.parse(existingRaw) : ADVICE_DEFAULTS);
      const advice = normalizeAdvicePreferences({
        ...existing,
        thermalTendency,
        motionSensitive,
        drysuitBelowC: parseTemperatureInput(drysuitThreshold, units.temperatureUnit) ?? existing.drysuitBelowC,
      });
      await AsyncStorage.setItem(ADVICE_PREFERENCES_KEY, JSON.stringify(advice));

      let actualLocation = false;
      if (locationEnabled) {
        const result = await startLocationTracking();
        actualLocation = result.started;
        if (!result.started) Alert.alert('Location not enabled', 'Your other setup choices were saved. Location-assisted site suggestions remain off; you can enable them later in Settings → Location.');
      }
      onComplete({
        ...units,
        trimixMode,
        locationLoggingEnabled: actualLocation,
        diveBaseline: {
          sacBarPerMin: parsePressureInput(baseline.sac, units.pressureUnit),
          rmvLitersPerMin: parseVolumeInput(baseline.rmv, units.gasVolumeUnit),
          avgDepthMeters: parseDepthInput(baseline.depth, units.depthUnit),
          durationSeconds: baseline.duration ? Number(baseline.duration) * 60 : null,
          tempMinC: parseTemperatureInput(baseline.temperature, units.temperatureUnit),
        },
      });
    } catch (error) {
      Alert.alert('Setup not saved', error?.message || 'Please try again.');
    } finally { setSaving(false); }
  };

  const changeBaseline = (key) => (value) => setBaseline((current) => ({ ...current, [key]: value }));
  if (loading) return <View style={styles.loading}><ActivityIndicator color={colors.cyan} /><Text style={styles.loadingText}>Preparing your setup…</Text></View>;
  if (showSignIn) return (
    <LoginScreen
      initialEmail={accountEmail}
      onBack={() => setShowSignIn(false)}
      onSignIn={async (credentials) => {
        await onSignIn(credentials);
        setShowSignIn(false);
      }}
    />
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <View><Text style={styles.eyebrow}>DMZ SCUBA SETUP</Text><Text style={styles.stepLabel}>{STEPS[step]} · {step + 1} of {STEPS.length}</Text></View>
        <Pressable accessibilityRole="button" hitSlop={10} onPress={skip}><Text style={styles.skip}>Skip</Text></Pressable>
      </View>
      <Progress step={step} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {step === 0 ? <>
          <Text style={styles.title}>Make DMZ work like your dive app.</Text>
          <Text style={styles.lead}>A few choices unlock consistent units, personal Dive Intelligence, exposure suggestions, and smarter site matching. Nothing here establishes training or decides whether a dive is safe.</Text>
          <View style={styles.featureCard}>
            {['Units throughout the app', 'Temperature and exposure preferences', 'Optional starting SAC/RMV baseline', 'Recreational or technical tool defaults', 'Optional location-assisted dive sites'].map((item) => <View key={item} style={styles.featureRow}><Text style={styles.check}>✓</Text><Text style={styles.featureText}>{item}</Text></View>)}
          </View>
          <Text style={styles.quiet}>About three minutes. Every answer can be changed later.</Text>
        </> : null}

        {step === 1 ? <>
          <Text style={styles.title}>{authStatus === 'signedIn' ? 'Your account is connected.' : 'Already use DMZ Scuba?'}</Text>
          {authStatus === 'restoring' ? (
            <View style={styles.accountCard}><ActivityIndicator color={colors.cyan} /><View style={styles.flex}><Text style={styles.optionTitle}>Checking for your account…</Text><Text style={styles.optionBody}>Saved account preferences will load before setup continues.</Text></View></View>
          ) : authStatus === 'signedIn' ? (
            <View style={styles.accountCard}><Text style={styles.accountMark}>✓</Text><View style={styles.flex}><Text style={styles.optionTitle}>Signed in</Text><Text style={styles.optionBody}>{accountEmail || 'Your DMZ Scuba preferences have loaded.'}</Text></View></View>
          ) : (
            <>
              <Text style={styles.lead}>Sign in now to load your saved units, tool preferences, profile, certifications, logbook, and gear. You can also continue using this phone without an account.</Text>
              <PrimaryButton label="Sign in to my account" onPress={() => setShowSignIn(true)} />
              <Text style={styles.quiet}>New to DMZ Scuba? Continue setup now. You can create and connect an account later from Account.</Text>
            </>
          )}
        </> : null}

        {step === 2 ? <>
          <Text style={styles.title}>Which units feel natural?</Text>
          <Text style={styles.lead}>This sets the defaults across the logbook, planner, Atlas, calculators, and Dive Intelligence.</Text>
          <Option title="Imperial" body="Feet · PSI · cubic feet · °F" selected={system === 'imperial'} onPress={() => chooseSystem('imperial')} />
          <Option title="Metric" body="Metres · bar · litres · °C" selected={system === 'metric'} onPress={() => chooseSystem('metric')} />
          <Text style={styles.quiet}>Mixed units remain available later under Settings → Units.</Text>
        </> : null}

        {step === 3 ? <>
          <Text style={styles.title}>How do you tend to dive?</Text>
          <Text style={styles.lead}>These choices tune tool visibility and provisional exposure suggestions. They are preferences—not certifications.</Text>
          <Text style={styles.groupLabel}>IN THE WATER I USUALLY FEEL</Text>
          <Option title="Cold" body="Suggest more insulation sooner" selected={thermalTendency === 'cold'} onPress={() => setThermalTendency('cold')} />
          <Option title="Typical" body="Use the standard exposure starting point" selected={thermalTendency === 'typical'} onPress={() => setThermalTendency('typical')} />
          <Option title="Warm" body="Suggest less insulation before moving warmer" selected={thermalTendency === 'warm'} onPress={() => setThermalTendency('warm')} />
          <Field keyboardType="numbers-and-punctuation" label={`I prefer a drysuit below (°${units.temperatureUnit})`} onChange={setDrysuitThreshold} value={drysuitThreshold} />
          <View style={styles.toggleRow}><View style={styles.flex}><Text style={styles.toggleTitle}>Motion-sensitive on boats</Text><Text style={styles.toggleBody}>Adds preparation reminders to relevant dive-day guidance.</Text></View><Switch onValueChange={setMotionSensitive} value={motionSensitive} /></View>
          <View style={styles.toggleRow}><View style={styles.flex}><Text style={styles.toggleTitle}>Technical / trimix tools</Text><Text style={styles.toggleBody}>Shows helium fields and technical calculator controls where supported.</Text></View><Switch onValueChange={setTrimixMode} value={trimixMode} /></View>
        </> : null}

        {step === 4 ? <>
          <Text style={styles.title}>Match Atlas to what you actually wear.</Text>
          <Text style={styles.lead}>Optional detailed ranges replace Atlas’s generic exposure starting point when the water temperature matches. You’ll choose real suits, layers, hoods, and gloves already in your Gear Locker; Atlas never changes a saved setup or packs gear automatically.</Text>
          <Option title="Set temperature preferences now" body="Choose your actual gear for each comfortable water-temperature range." selected={temperaturePreferenceTiming === 'now'} onPress={() => { setTemperaturePreferenceTiming('now'); openTemperaturePreferences(); }} />
          <Option title="Do this later" body="Atlas uses generic starting points until you add ranges in Settings or Gear Locker." selected={temperaturePreferenceTiming === 'later'} onPress={() => setTemperaturePreferenceTiming('later')} />
          {temperaturePreferenceTiming === 'now' ? <>
            <PrimaryButton disabled={openingTemperaturePreferences} label={openingTemperaturePreferences ? 'Opening…' : 'Choose gear and temperature ranges'} onPress={openTemperaturePreferences} />
            <Text style={styles.quiet}>If your Gear Locker is empty, add your actual exposure gear there first, then return from Settings → Temperature & gear preferences. This avoids creating duplicate placeholder gear.</Text>
          </> : null}
        </> : null}

        {step === 5 ? <>
          <Text style={styles.title}>Give Dive Intelligence a starting point.</Text>
          <Text style={styles.lead}>Optional. If your logbook already contains these measurements, DMZ uses the recorded values instead. Otherwise these answers enable early estimates until enough dives are logged.</Text>
          <TwoUp>
            <Half><Field keyboardType="numbers-and-punctuation" label={`Typical SAC (${units.pressureUnit}/min)`} onChange={changeBaseline('sac')} placeholder={units.pressureUnit === 'psi' ? '10' : '0.7'} value={baseline.sac} /></Half>
            <Half><Field keyboardType="numbers-and-punctuation" label={`Typical RMV (${units.gasVolumeUnit}/min)`} onChange={changeBaseline('rmv')} placeholder={units.gasVolumeUnit === 'L' ? '20' : '0.7'} value={baseline.rmv} /></Half>
          </TwoUp>
          <TwoUp>
            <Half><Field keyboardType="numbers-and-punctuation" label={`Typical depth (${units.depthUnit})`} onChange={changeBaseline('depth')} placeholder={units.depthUnit === 'ft' ? '45' : '14'} value={baseline.depth} /></Half>
            <Half><Field keyboardType="numbers-and-punctuation" label="Typical dive time (min)" onChange={changeBaseline('duration')} placeholder="45" value={baseline.duration} /></Half>
          </TwoUp>
          <Field keyboardType="numbers-and-punctuation" label={`Typical minimum water temperature (°${units.temperatureUnit})`} onChange={changeBaseline('temperature')} value={baseline.temperature} />
          <Text style={styles.quiet}>Leave anything blank if you do not know it. DMZ will not invent a value.</Text>
        </> : null}

        {step === 6 ? <>
          <Text style={styles.title}>One optional phone feature.</Text>
          <Text style={styles.lead}>Location-assisted site matching records coarse breadcrumbs so a downloaded computer dive can suggest the site or marina you were near.</Text>
          <View style={styles.permissionCard}>
            <View style={styles.flex}><Text style={styles.toggleTitle}>Suggest dive sites from location</Text><Text style={styles.toggleBody}>Off unless you choose it. Enabling it requests foreground and background location permission when you finish.</Text></View>
            <Switch onValueChange={setLocationEnabled} value={locationEnabled} />
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Ready to save</Text>
            <Text style={styles.summaryLine}>{system === 'metric' ? 'Metric' : 'Imperial'} defaults</Text>
            <Text style={styles.summaryLine}>{thermalTendency === 'cold' ? 'Runs cold' : thermalTendency === 'warm' ? 'Runs warm' : 'Typical temperature preference'}</Text>
            <Text style={styles.summaryLine}>{temperaturePreferenceTiming === 'now' ? 'Detailed temperature and gear preferences reviewed' : 'Detailed temperature ranges can be added later'}</Text>
            <Text style={styles.summaryLine}>{trimixMode ? 'Technical / trimix tools visible' : 'Recreational nitrox tools'}</Text>
            <Text style={styles.summaryLine}>{Object.values(baseline).filter(Boolean).length ? 'Starting baseline supplied' : 'Baseline will build from the logbook'}</Text>
          </View>
          <Text style={styles.quiet}>Certification cards, actual equipment, and reusable gear setups are added through Account and Gear Locker because those records need their own details.</Text>
        </> : null}
      </ScrollView>
      <View style={styles.footer}>
        {step > 0 ? <SecondaryButton label="Back" onPress={() => setStep((value) => value - 1)} style={styles.footerButton} /> : null}
        <PrimaryButton
          disabled={saving || (step === 1 && authStatus === 'restoring') || (step === 4 && !temperaturePreferenceTiming)}
          label={step === STEPS.length - 1 ? (saving ? 'Saving…' : 'Save my setup') : step === 1 && authStatus === 'signedOut' ? 'Continue without an account' : 'Continue'}
          onPress={step === STEPS.length - 1 ? finish : () => setStep((value) => value + 1)}
          style={styles.footerButton}
        />
      </View>
      <Modal visible={temperaturePreferencesOpen} animationType="slide" onRequestClose={() => setTemperaturePreferencesOpen(false)}>
        {temperaturePreferencesOpen ? <GearAdviceSheet preferencesOnly appSettings={units} onClose={() => setTemperaturePreferencesOpen(false)} /> : null}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  loading: { alignItems: 'center', backgroundColor: colors.background, flex: 1, gap: 12, justifyContent: 'center' },
  loadingText: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  header: { alignItems: 'center', borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', minHeight: 62, paddingHorizontal: spacing.md },
  eyebrow: { color: colors.cyan, fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  stepLabel: { color: colors.muted, fontSize: 12, fontWeight: '700', marginTop: 3 },
  skip: { color: colors.warning, fontSize: 14, fontWeight: '800' },
  progress: { flexDirection: 'row', gap: 5, paddingHorizontal: spacing.md, paddingTop: 10 },
  progressBar: { backgroundColor: colors.line, borderRadius: 2, flex: 1, height: 3 },
  progressBarOn: { backgroundColor: colors.cyan },
  content: { padding: spacing.lg, paddingBottom: 40 },
  title: { color: colors.text, fontSize: 28, fontWeight: '900', letterSpacing: -0.6, lineHeight: 34 },
  lead: { color: colors.muted, fontSize: 15, lineHeight: 23, marginBottom: spacing.lg, marginTop: 10 },
  featureCard: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: radii.md, borderWidth: 1, padding: 14 },
  featureRow: { alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 38 },
  check: { color: colors.good, fontSize: 15, fontWeight: '900' },
  featureText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  quiet: { color: colors.faint, fontSize: 12, lineHeight: 18, marginTop: 14 },
  accountCard: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.line, borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: 12, padding: 14 },
  accountMark: { color: colors.good, fontSize: 22, fontWeight: '900' },
  option: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.line, borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: 12, marginBottom: 10, minHeight: 68, padding: 13 },
  optionOn: { backgroundColor: 'rgba(112,221,246,0.08)', borderColor: colors.cyan },
  radio: { alignItems: 'center', borderColor: colors.lineStrong, borderRadius: 11, borderWidth: 2, height: 22, justifyContent: 'center', width: 22 },
  radioOn: { borderColor: colors.cyan },
  radioDot: { backgroundColor: colors.cyan, borderRadius: 5, height: 10, width: 10 },
  optionTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  optionBody: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  flex: { flex: 1, minWidth: 0 },
  pressed: { opacity: 0.76 },
  groupLabel: { color: colors.cyan, fontSize: 10, fontWeight: '900', letterSpacing: 1.3, marginBottom: 10 },
  toggleRow: { alignItems: 'center', borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 12, minHeight: 70, paddingVertical: 12 },
  toggleTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  toggleBody: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  permissionCard: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.line, borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: 12, padding: 14 },
  summaryCard: { backgroundColor: colors.surface, borderColor: `${colors.cyan}55`, borderRadius: radii.md, borderWidth: 1, marginTop: spacing.lg, padding: 14 },
  summaryTitle: { color: colors.cyan, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  summaryLine: { color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 9 },
  footer: { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 10, padding: spacing.md },
  footerButton: { flex: 1, marginTop: 0 },
});
