import { useEffect, useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChoiceGroup, FormField as AccountFormField } from '../../components/AccountForm';
import { NUMBER_KEYBOARD_ACCESSORY_ID } from '../../lib/numberKeyboard';
import NumberKeyboardAccessory from '../../components/NumberKeyboardAccessory';
import { colors, spacing, radii } from '../../theme';
import { GEAR_STORAGE_KEY } from './storage';
import { normalizeGearState } from './model';
import { ADVICE_DEFAULTS, DIVE_USES, advicePreferenceError, coldDiverTemplate, normalizeAdvicePreferences, orderedTemperatureRange, recommendDiveGear } from './diveAdvice';

export const ADVICE_PREFERENCES_KEY = '@dmz-scuba/gear-advice/v1';
const KEY = ADVICE_PREFERENCES_KEY;
const FormField = props => <AccountFormField {...props} inputAccessoryViewID={NUMBER_KEYBOARD_ACCESSORY_ID} />;
const numeric = text => text.trim() !== '' && Number.isFinite(Number(text)) ? Number(text) : null;
const Button = ({ label, onPress, selected = false }) => <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[styles.button, selected && styles.selected]}><Text style={styles.buttonText}>{label}</Text></Pressable>;
const Copy = ({ children, warning }) => <Text style={[styles.copy, warning && styles.warning]}>{children}</Text>;
const TemperatureRangeFields = ({ coldest, warmest, onChange, tempUnit, upperExclusive = false }) => {
  const order = orderedTemperatureRange(coldest, warmest);
  const complete = numeric(String(coldest ?? '')) != null && numeric(String(warmest ?? '')) != null;
  return <>
    <FormField label={`Coldest water · lower number (${tempUnit})`} helper="Put the smaller temperature here." keyboardType="numbers-and-punctuation" value={coldest ?? ''} onChangeText={value => onChange(value, warmest)} />
    <FormField label={`${upperExclusive ? 'Warm boundary · combination stops here' : 'Warmest water · higher number'} (${tempUnit})`} helper={upperExclusive ? 'At this temperature, the next warmer combination begins.' : 'Put the larger temperature here.'} keyboardType="numbers-and-punctuation" value={warmest ?? ''} onChangeText={value => onChange(coldest, value)} />
    {complete && order.reversed ? <><Copy warning>The values look reversed: the coldest-water field needs the lower number.</Copy><Button label={`Swap values · ${warmest}${tempUnit} to ${coldest}${tempUnit}`} onPress={() => onChange(order.coldest, order.warmest)} /></> : complete ? <Copy>Range: {coldest}{tempUnit} → {warmest}{tempUnit}, cold to warm.</Copy> : null}
  </>;
};

// Personal ranges stay native and on-device; no inventory is sent into the map WebView.
export default function GearAdviceSheet({ context = {}, preferencesOnly = false, appSettings = {}, onClose }) {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState(null), [prefs, setPrefs] = useState(ADVICE_DEFAULTS);
  const [editing, setEditing] = useState(preferencesOnly), [draft, setDraft] = useState(null);
  const [error, setError] = useState(''), [retry, setRetry] = useState(0), [saving, setSaving] = useState(false);
  const [use, setUse] = useState(''), [depth, setDepth] = useState(''), [bottom, setBottom] = useState('');
  const [longDive, setLongDive] = useState(false), [expanded, setExpanded] = useState(null);
  const [outfitOpen, setOutfitOpen] = useState(null);
  const [conditionsOpen, setConditionsOpen] = useState(false);
  const [combinationsOpen, setCombinationsOpen] = useState(false);
  const fahrenheit = appSettings.temperatureUnit !== 'C', feet = appSettings.depthUnit !== 'm';
  const tempUnit = fahrenheit ? '°F' : '°C';
  const displayTemp = c => c == null ? '' : String(Math.round((fahrenheit ? c * 9 / 5 + 32 : c) * 10) / 10);
  const fromTemp = text => numeric(text) == null ? null : Math.round((fahrenheit ? (numeric(text) - 32) * 5 / 9 : numeric(text)) * 1e6) / 1e6;
  const makeDraft = value => ({ ...value, threshold: displayTemp(value.drysuitBelowC), combinations: (value.combinations || []).map(entry => ({ ...entry, min: displayTemp(entry.minC), max: displayTemp(entry.maxC) })), suits: Object.fromEntries(Object.entries(value.suits).map(([id, range]) => [id, { ...range, min: displayTemp(range.minC), max: displayTemp(range.maxC) }])) });
  useEffect(() => {
    let active = true;
    setError('');
    Promise.all([AsyncStorage.getItem(GEAR_STORAGE_KEY), AsyncStorage.getItem(KEY)]).then(([gear, saved]) => {
      if (!active) return;
      const loaded = normalizeAdvicePreferences(saved ? JSON.parse(saved) : {});
      setState(normalizeGearState(gear ? JSON.parse(gear) : null)); setPrefs(loaded); setDraft(makeDraft(loaded));
    }).catch(() => { if (active) setError('Your gear preferences couldn’t load. Please try again.'); });
    return () => { active = false; };
  }, [retry]);
  const edit = () => { setDraft(makeDraft(prefs)); setError(''); setEditing(true); };
  const save = async () => {
    const ranges = [...Object.values(draft.suits), ...draft.combinations];
    if (numeric(draft.threshold) == null || ranges.some(range => [range.min, range.max].some(value => value && numeric(value) == null))) { setError('Enter valid temperatures, or leave a comfort range blank.'); return; }
    const next = normalizeAdvicePreferences({ ...draft, drysuitBelowC: fromTemp(draft.threshold), combinations: draft.combinations.map(entry => ({ ...entry, minC: fromTemp(entry.min || ''), maxC: fromTemp(entry.max || '') })), suits: Object.fromEntries(Object.entries(draft.suits).map(([id, range]) => [id, { ...range, minC: fromTemp(range.min || ''), maxC: fromTemp(range.max || '') }])) });
    const issue = advicePreferenceError(next);
    if (issue) { setError(issue); return; }
    setSaving(true);
    try { await AsyncStorage.setItem(KEY, JSON.stringify(next)); setPrefs(next); setEditing(false); setError(''); Keyboard.dismiss(); if (preferencesOnly) onClose(); }
    catch { setError('Couldn’t save. Your previous preferences are unchanged; please retry.'); }
    finally { setSaving(false); }
  };
  const bottomC = fromTemp(bottom), depthM = numeric(depth) == null ? null : numeric(depth) / (feet ? 3.28084 : 1);
  const invalidPlan = (bottom !== '' && (bottomC == null || bottomC < -2 || bottomC > 40)) || (depth !== '' && (depthM == null || depthM < 0 || depthM > 300));
  const result = state ? recommendDiveGear(state, prefs, { ...context, use, bottomTemperatureC: bottomC, depthMeters: depthM, longDive }) : null;
  const updateSuitRange = (id, min, max) => setDraft(old => ({ ...old, suits: { ...old.suits, [id]: { ...old.suits[id], min, max } } }));
  const updateCombination = (id, patch) => setDraft(old => ({ ...old, combinations: old.combinations.map(entry => entry.id === id ? { ...entry, ...patch } : entry) }));
  return <KeyboardAvoidingView style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={styles.header}><Text style={styles.title}>{editing ? 'Your dive preferences' : 'Gear for this dive'}</Text><Button label="Close" onPress={onClose} /></View>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      {error ? <Copy warning>{error}</Copy> : null}
      {!state ? error ? <Button label="Try again" onPress={() => setRetry(value => value + 1)} /> : <ActivityIndicator color={colors.cyan} /> : editing ? <>
        <Copy>Teach the Atlas how you actually dive. Ranges describe your personal comfort, not a manufacturer’s rating or proof of training. Saved setups are never changed.</Copy>
        <FormField label={`Prefer a drysuit below (${tempUnit})`} value={draft.threshold} keyboardType="numbers-and-punctuation" onChangeText={threshold => setDraft(old => ({ ...old, threshold }))} />
        <ChoiceGroup label="How do you tend to feel in the water?" choices={['I run cold', 'Typical', 'I run warm']} value={{ cold: 'I run cold', typical: 'Typical', warm: 'I run warm' }[draft.thermalTendency]} onChange={value => setDraft(old => ({ ...old, thermalTendency: { 'I run cold': 'cold', Typical: 'typical', 'I run warm': 'warm' }[value] }))} />
        <Copy>Cold or warm shifts provisional exposure guidance and your drysuit threshold by about 4°F / 2°C toward more or less insulation. This is an editable planning preference, not a physiological rating. Your saved combinations use actual water temperature. Deep inland dives remain conservative until bottom conditions are confirmed.</Copy>
        <Button label={combinationsOpen ? 'Hide temperature combinations' : `Temperature combinations · optional${draft.combinations.length ? ` (${draft.combinations.length})` : ''}`} onPress={() => setCombinationsOpen(value => !value)} />
        {combinationsOpen ? <>
        <Copy>Choose an actual suit plus its layers, hood and gloves for each water range. These combinations take priority over individual suit estimates. The upper limit belongs to the next warmer band; overlapping bands use the first complete match.</Copy>
        {!draft.combinations.length ? <Button label="Start with very cold-sensitive ranges" onPress={() => { const template = coldDiverTemplate(); setDraft(old => ({ ...old, threshold: displayTemp(template.drysuitBelowC), thermalTendency: 'typical', combinations: makeDraft(template).combinations })); }} /> : null}
        {!draft.combinations.length ? <Copy>Optional template: shorty at 89°F+, 7 mm at 78–89°F with a hood below 85°F, drysuit below 78°F, heavier layers below 60°F and combined layers below 41°F. Select your own pieces; no brand is assumed.</Copy> : null}
        {draft.combinations.map(entry => <View key={entry.id} style={styles.card}><Button label={`${entry.name} · ${entry.itemIds.length} pieces`} onPress={() => setOutfitOpen(outfitOpen === entry.id ? null : entry.id)} />{outfitOpen === entry.id ? <>
          <FormField label="Combination name" value={entry.name} onChangeText={name => updateCombination(entry.id, { name })} />
          <TemperatureRangeFields coldest={entry.min} warmest={entry.max} tempUnit={tempUnit} upperExclusive onChange={(min, max) => updateCombination(entry.id, { min, max })} />
          <Copy>Select one suit and every layer or accessory worn together. Track alternate liners as separate locker items or named layer systems. A drysuit combination needs undergarments.</Copy>
          {state.items.filter(item => ['Exposure suit', 'Undergarment', 'Hood', 'Gloves', 'Boots', 'Accessories'].includes(item.category)).map(item => <Button key={item.id} label={`${entry.itemIds.includes(item.id) ? '✓ ' : ''}${item.name}`} selected={entry.itemIds.includes(item.id)} onPress={() => updateCombination(entry.id, { itemIds: entry.itemIds.includes(item.id) ? entry.itemIds.filter(id => id !== item.id) : [...entry.itemIds.filter(id => item.category !== 'Exposure suit' || !state.items.some(other => other.id === id && other.category === 'Exposure suit')), item.id] })} />)}
          <Button label="Remove combination" onPress={() => setDraft(old => ({ ...old, combinations: old.combinations.filter(value => value.id !== entry.id) }))} />
        </> : null}</View>)}
        <Button label="Add exposure combination" onPress={() => { const id = `outfit-${Date.now()}`; setDraft(old => ({ ...old, combinations: [...old.combinations, { id, name: 'My exposure combination', min: '', max: '', itemIds: [] }] })); setOutfitOpen(id); }} />
        </> : null}
        <Text style={styles.heading}>What you use each setup for</Text>
        {state.setups.filter(setup => !['Pony / bailout', 'Stage / deco'].includes(setup.type)).map(setup => <View key={setup.id} style={styles.card}><Text style={styles.heading}>{setup.name}</Text><Copy>{setup.type} · choose all that apply</Copy><View style={styles.wrap}>{DIVE_USES.map(kind => <Button key={kind} label={kind} selected={draft.setups[setup.id]?.includes(kind)} onPress={() => setDraft(old => { const uses = old.setups[setup.id] || []; return { ...old, setups: { ...old.setups, [setup.id]: uses.includes(kind) ? uses.filter(value => value !== kind) : [...uses, kind] } }; })} />)}</View></View>)}
        <Text style={styles.heading}>Your exposure protection</Text><Copy>For a drysuit, record the range with its usual insulation. For undergarments, record the water range in which you use them under your drysuit. Leave unfamiliar ranges blank.</Copy>
        {!state.items.some(item => ['Exposure suit', 'Undergarment'].includes(item.category)) ? <Copy>Add suits and undergarments to your Gear Locker to personalize these suggestions.</Copy> : null}
        {state.items.filter(item => ['Exposure suit', 'Undergarment'].includes(item.category)).map(item => <View style={styles.card} key={item.id}><Text style={styles.heading}>{item.name}</Text><Copy>{[item.configuration, item.thickness, item.category].filter(Boolean).join(' · ')}</Copy><TemperatureRangeFields coldest={draft.suits[item.id]?.min} warmest={draft.suits[item.id]?.max} tempUnit={tempUnit} onChange={(min, max) => updateSuitRange(item.id, min, max)} />{item.category === 'Exposure suit' && item.configuration !== 'Drysuit' ? <ChoiceGroup label="Coverage" choices={['Unknown', 'Full', 'Shorty']} value={draft.suits[item.id]?.coverage || 'Unknown'} onChange={coverage => setDraft(old => ({ ...old, suits: { ...old.suits, [item.id]: { ...old.suits[item.id], coverage: coverage === 'Unknown' ? '' : coverage } } }))} /> : null}</View>)}
      </> : <>
        <Text style={styles.heading}>{context.name || 'Your next dive'}</Text>
        <Copy>{context.month == null ? '' : `${new Date(2026, context.month, 1).toLocaleString('en', { month: 'long' })} · `}{context.temperatureC == null ? 'Water temperature unavailable' : `${displayTemp(context.temperatureC)}${tempUnit} monthly surface estimate`}{context.broad ? ' · Broad location: choose a specific site for depth and terrain guidance.' : ''}</Copy>
        <ChoiceGroup label="What dive are you planning?" choices={DIVE_USES} value={use} onChange={setUse} />
        <Copy>A deep site or wreck is not automatically a technical or penetration dive. Choose your actual plan.</Copy>
        <Button label={conditionsOpen ? 'Hide dive conditions' : 'Refine depth, bottom temperature or duration'} onPress={() => setConditionsOpen(value => !value)} />
        {conditionsOpen ? <>
        <FormField label={`Planned depth (${feet ? 'ft' : 'm'}, optional)`} value={depth} keyboardType="numbers-and-punctuation" onChangeText={setDepth} helper={context.site?.maxDepthMeters && !context.site.depthIsWholeLake ? `Published maximum: ${Math.round(context.site.maxDepthMeters * (feet ? 3.28084 : 1))} ${feet ? 'ft' : 'm'}; not your planned depth.` : 'Confirm depth and conditions with the local operator.'} />
        <FormField label={`Expected bottom temperature (${tempUnit}, optional)`} value={bottom} keyboardType="numbers-and-punctuation" onChangeText={setBottom} />
        <ChoiceGroup label="Exposure time" choices={['Typical', 'Long / repetitive']} value={longDive ? 'Long / repetitive' : 'Typical'} onChange={value => setLongDive(value !== 'Typical')} />
        </> : bottom || depth || longDive ? <Copy>{[depth && `${depth} ${feet ? 'ft' : 'm'} planned`, bottom && `${bottom}${tempUnit} at depth`, longDive && 'Long / repetitive'].filter(Boolean).join(' · ')}</Copy> : null}
        <View style={styles.card}><Text style={styles.eyebrow}>EXPOSURE STARTING POINT</Text><Text style={styles.heading}>{result.advice.label}</Text><Copy>{result.advice.temperatureBasis}</Copy>{result.advice.reasons.map(reason => <Copy key={reason}>{reason}</Copy>)}</View>
        <Button label="Personalize my gear matches" onPress={edit} />
        {invalidPlan ? <Copy warning>Check your planned depth and bottom temperature before viewing gear matches.</Copy> : !use ? <Copy>Choose your planned dive type above to see setup suggestions.</Copy> : <>
          <Text style={styles.heading}>From your Gear Locker</Text>
          {!result.ranked.length ? <Copy>No matching saved setup yet. Add gear to a setup and tell us its dive uses in Your dive preferences. Technical and overhead matches require your explicit designation.</Copy> : null}
          {result.ranked.map((entry, index) => <View key={entry.setup.id} style={styles.card}><Text style={styles.eyebrow}>{index === 0 ? 'CLOSEST STARTING POINT' : 'ALTERNATIVE'} · {entry.setup.type.toUpperCase()}</Text><Text style={styles.heading}>{entry.setup.name}</Text>{entry.combination ? <Copy>{entry.combination.name} · your temperature combination</Copy> : null}<Copy>{entry.suit ? `Exposure: ${[entry.suit, ...entry.layers].map(item => item.name).join(' + ')}` : 'Exposure protection still needed'}</Copy>{entry.changes.length ? <Copy>Bring instead / add: {entry.changes.map(item => item.name).join(', ')}</Copy> : <Copy>Keep the saved gear combination.</Copy>}{entry.removed.length ? <Copy>Leave from this proposal: {entry.removed.map(item => item.name).join(', ')}</Copy> : null}{entry.warnings.map(warning => <Copy warning key={warning}>{warning}</Copy>)}<Button label={expanded === entry.setup.id ? 'Hide proposed gear' : `View ${entry.items.length} proposed items`} onPress={() => setExpanded(expanded === entry.setup.id ? null : entry.setup.id)} />{expanded === entry.setup.id ? entry.items.map(item => <Copy key={item.id}>{item.name} · {item.category}</Copy>) : null}</View>)}
          {!result.ranked.length && result.suits.length ? <View style={styles.card}><Text style={styles.heading}>Exposure candidates to review</Text>{result.suits.map(item => <Copy key={item.id}>{item.name}</Copy>)}<Copy warning>Confirm personal comfort ranges, full-length coverage where needed, and drysuit insulation before packing.</Copy></View> : null}
          {result.exclusions.length ? <Copy warning>{result.exclusions.length} item(s) excluded due to condition or overdue service. Check the Gear Locker before packing.</Copy> : null}
        </>}
        <Copy>Planning aid only. Check local bottom conditions, training, gas planning, redundancy and equipment compatibility. A saved setup or comfort range cannot establish that a dive is suitable. Nothing is moved, checked off or saved into your setups here.</Copy>
      </>}
    </ScrollView>
    {state && editing ? <View style={styles.footer}><Button label={saving ? 'Saving…' : 'Save preferences'} onPress={saving ? undefined : save} />{!preferencesOnly ? <Button label="Cancel edits" onPress={() => { setEditing(false); setError(''); }} /> : null}</View> : null}
    <NumberKeyboardAccessory />
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderBottomWidth: 1, borderColor: colors.line },
  title: { flex: 1, fontSize: 22, fontWeight: '800', color: colors.text },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xl },
  heading: { color: colors.text, fontSize: 18, fontWeight: '800' },
  eyebrow: { color: colors.cyan, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  copy: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  warning: { color: colors.warning },
  card: { backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.md, gap: spacing.sm, borderWidth: 1, borderColor: colors.line },
  button: { backgroundColor: colors.surfaceSoft, padding: spacing.sm, minHeight: 44, justifyContent: 'center', borderRadius: radii.sm, borderWidth: 1, borderColor: colors.line },
  selected: { borderColor: colors.cyan },
  buttonText: { color: colors.cyan, fontWeight: '700', textAlign: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  footer: { padding: spacing.md, gap: spacing.xs, borderTopWidth: 1, borderColor: colors.line },
});
