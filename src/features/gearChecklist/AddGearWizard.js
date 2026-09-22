import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { FormField, ChoiceGroup } from '../../components/AccountForm';
import { ScreenHeader } from '../../components/AppShell';
import DateField from '../../components/DateField';
import { PrimaryButton, SecondaryButton } from '../../components/Ui';
import { colors, radii, spacing } from '../../theme';
import {
  BCD_STYLES,
  CATEGORY_GROUPS,
  COMPONENT_TYPES,
  DRYSUIT_FEET_OPTIONS,
  DRYSUIT_MATERIALS,
  EXPOSURE_SUIT_TYPES,
  GEAR_CONDITIONS,
  SEAL_MATERIALS,
  SERVICE_INTERVALS,
  WETSUIT_CUTS,
  createGearId,
  emptyGearComponent,
  emptyGearItem,
} from './model';

// Ordered steps for the guided Regulator and BCD flows. "category" is handled by the picker screen above these lists.
// The Exposure suit flow branches on wetsuit vs. drysuit, so its steps are computed by exposureStepsFor() instead.
const REGULATOR_STEPS = ['basics', 'first-stage', 'second-stage', 'alternate', 'inflator', 'drysuit', 'spg', 'transmitter', 'extras', 'details'];
const BCD_STEPS = ['basics', 'style', 'weights', 'altair', 'extras', 'details'];

const REGULATOR_EXTRA_PART_TYPES = COMPONENT_TYPES.Regulator.filter((type) => !['First stage', 'Primary second stage'].includes(type));
const BCD_EXTRA_PART_TYPES = COMPONENT_TYPES.BCD.filter((type) => !['Bladder', 'Inflator (LPI)'].includes(type));
const EXPOSURE_EXTRA_PART_TYPES = COMPONENT_TYPES['Exposure suit'].filter((type) => !['Suit body', 'Hood', 'Gloves', 'Dry gloves', 'Boots', 'Seals'].includes(type));

const EXPOSURE_SUIT_TYPE_OPTIONS = EXPOSURE_SUIT_TYPES.map((value) => ({ value, label: value }));
const WETSUIT_CUT_OPTIONS = WETSUIT_CUTS.map((value) => ({ value, label: value }));
const DRYSUIT_FEET_OPTION_LIST = DRYSUIT_FEET_OPTIONS.map((value) => ({ value, label: value }));

// Wetsuit and drysuit ask different follow-up questions, and a couple of earlier answers (built-in
// hood, built-in boots, a dry-glove system) make a later yes/no step redundant — so the step list
// is computed from the draft instead of being a fixed array like REGULATOR_STEPS/BCD_STEPS.
function exposureStepsFor(exp) {
  if (exp.suitType === 'Drysuit') {
    const steps = ['basics', 'suit-type', 'drysuit-material', 'drysuit-seals', 'drysuit-feet', 'dry-gloves', 'hood'];
    if (!exp.drysuit.dryGloves.included) steps.push('gloves');
    if (exp.drysuit.feet.type !== 'Built-in boots') steps.push('boots');
    steps.push('layers', 'details');
    return steps;
  }
  if (exp.suitType === 'Wetsuit') {
    const steps = ['basics', 'suit-type', 'wetsuit-cut'];
    if (!exp.wetsuit.builtInHood) steps.push('hood');
    steps.push('gloves', 'boots', 'layers', 'details');
    return steps;
  }
  return ['basics', 'suit-type'];
}

function emptyRegulatorState(defaultSetupId) {
  return {
    name: '', manufacturer: '', model: '',
    firstStage: { manufacturer: '', model: '' },
    secondStage: { manufacturer: '', model: '' },
    alternate: { included: null, manufacturer: '', model: '' },
    inflator: { included: null },
    drysuit: { included: null },
    spg: { included: null, manufacturer: '', model: '' },
    transmitter: { included: null, manufacturer: '', model: '', mount: null },
    extras: [],
    manufacturerAuto: {},
    serialNumber: '', condition: GEAR_CONDITIONS[0],
    lastServiceDate: '', nextServiceDate: '', serviceIntervalMonths: '',
    purchaseDate: '', purchasePrice: '', retailer: '', warrantyUntil: '', notes: '',
    setupIds: defaultSetupId ? [defaultSetupId] : [],
  };
}

// Regulators are usually bought as a matched set — the first stage's brand carries forward
// into each part after it, but only ever into a field the diver hasn't already filled in
// themselves, and only as a starting point they can still overwrite (octo/SPG/transmitter
// brands do vary from the first stage often enough that this can't be a hard rule).
function latestManufacturer(reg) {
  const chain = [
    reg.manufacturer,
    reg.firstStage.manufacturer,
    reg.secondStage.manufacturer,
    reg.alternate.included ? reg.alternate.manufacturer : '',
    reg.spg.included ? reg.spg.manufacturer : '',
    reg.transmitter.included ? reg.transmitter.manufacturer : '',
  ];
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    if (chain[i] && chain[i].trim()) return chain[i].trim();
  }
  return '';
}

// Maps a wizard step to the reg state key holding that part's manufacturer field.
const MANUFACTURER_STEP_KEYS = {
  'first-stage': 'firstStage',
  'second-stage': 'secondStage',
  alternate: 'alternate',
  spg: 'spg',
  transmitter: 'transmitter',
};

function manufacturerForStep(reg, step) {
  const key = MANUFACTURER_STEP_KEYS[step];
  return key ? reg[key].manufacturer : null;
}

// Auto-filling sets manufacturerAuto[key] so the field can show a "carried over" caption;
// typing into the field directly (see setManufacturer below) clears that flag again.
function applyManufacturer(reg, step, brand) {
  const key = MANUFACTURER_STEP_KEYS[step];
  if (!key) return reg;
  return {
    ...reg,
    [key]: { ...reg[key], manufacturer: brand },
    manufacturerAuto: { ...reg.manufacturerAuto, [key]: true },
  };
}

function buildRegulatorDraft(reg) {
  const components = [
    { ...emptyGearComponent('Regulator', 'First stage'), id: createGearId('component'), name: 'First stage', manufacturer: reg.firstStage.manufacturer.trim(), model: reg.firstStage.model.trim() },
    { ...emptyGearComponent('Regulator', 'Primary second stage'), id: createGearId('component'), name: 'Primary second stage', manufacturer: reg.secondStage.manufacturer.trim(), model: reg.secondStage.model.trim() },
  ];
  if (reg.alternate.included) components.push({ ...emptyGearComponent('Regulator', 'Alternate second stage'), id: createGearId('component'), name: 'Alternate second stage', manufacturer: reg.alternate.manufacturer.trim(), model: reg.alternate.model.trim() });
  if (reg.inflator.included) components.push({ ...emptyGearComponent('Regulator', 'Inflator hose'), id: createGearId('component'), name: 'BCD inflator hose' });
  if (reg.drysuit.included) components.push({ ...emptyGearComponent('Regulator', 'Drysuit hose'), id: createGearId('component'), name: 'Drysuit inflator hose' });
  if (reg.spg.included) components.push({ ...emptyGearComponent('Regulator', 'SPG / pressure gauge'), id: createGearId('component'), name: 'SPG', manufacturer: reg.spg.manufacturer.trim(), model: reg.spg.model.trim() });
  if (reg.transmitter.included) {
    const transmitterNotes = [
      reg.transmitter.included === 'floating' ? 'Floating — moves between setups.' : '',
      reg.transmitter.mount === 'hose' ? 'Mounted on a short hose.' : reg.transmitter.mount === 'standalone' ? 'Standalone, screws directly into the first stage port.' : '',
    ].filter(Boolean).join(' ');
    components.push({ ...emptyGearComponent('Regulator', 'Wireless transmitter'), id: createGearId('component'), name: 'Wireless transmitter', manufacturer: reg.transmitter.manufacturer.trim(), model: reg.transmitter.model.trim(), notes: transmitterNotes });
  }
  reg.extras.forEach((extra) => {
    if (!extra.name.trim() && !extra.manufacturer.trim() && !extra.model.trim()) return;
    components.push({ ...emptyGearComponent('Regulator', extra.type), id: extra.id, name: extra.name.trim() || extra.type, manufacturer: extra.manufacturer.trim(), model: extra.model.trim() });
  });

  return {
    ...emptyGearItem(),
    name: reg.name.trim(),
    category: 'Regulator',
    manufacturer: reg.manufacturer.trim() || reg.firstStage.manufacturer.trim(),
    model: reg.model.trim() || reg.firstStage.model.trim(),
    serialNumber: reg.serialNumber.trim(),
    condition: reg.condition,
    configuration: 'Single tank',
    isAssembly: true,
    components,
    lastServiceDate: reg.lastServiceDate.trim(), nextServiceDate: reg.nextServiceDate.trim(), serviceIntervalMonths: reg.serviceIntervalMonths,
    purchaseDate: reg.purchaseDate.trim(), purchasePrice: reg.purchasePrice.trim(), retailer: reg.retailer.trim(), warrantyUntil: reg.warrantyUntil.trim(),
    notes: reg.notes.trim(),
    setupIds: reg.setupIds,
  };
}

function emptyBcdState(defaultSetupId) {
  return {
    name: '', manufacturer: '', model: '',
    style: null, size: '',
    weights: { included: null, pockets: '', trimPockets: null },
    altair: { included: null, manufacturer: '', model: '' },
    extras: [],
    serialNumber: '', condition: GEAR_CONDITIONS[0],
    lastServiceDate: '', nextServiceDate: '', serviceIntervalMonths: '',
    purchaseDate: '', purchasePrice: '', retailer: '', warrantyUntil: '', liftCapacity: '', notes: '',
    setupIds: defaultSetupId ? [defaultSetupId] : [],
  };
}

function buildBcdDraft(bcd) {
  const components = [
    { ...emptyGearComponent('BCD', 'Bladder'), id: createGearId('component'), name: 'Bladder' },
    { ...emptyGearComponent('BCD', 'Inflator (LPI)'), id: createGearId('component'), name: 'Inflator (LPI)' },
  ];
  if (bcd.weights.included) components.push({ ...emptyGearComponent('BCD', 'Weight pocket'), id: createGearId('component'), name: `Releasable weight pockets (${bcd.weights.pockets || '2'})` });
  if (bcd.weights.trimPockets) components.push({ ...emptyGearComponent('BCD', 'Trim pocket'), id: createGearId('component'), name: 'Fixed trim pockets' });
  if (bcd.altair.included) components.push({ ...emptyGearComponent('BCD', 'Integrated alternate (Air2/Airsource)'), id: createGearId('component'), name: 'Integrated alternate air source', manufacturer: bcd.altair.manufacturer.trim(), model: bcd.altair.model.trim() });
  bcd.extras.forEach((extra) => {
    if (!extra.name.trim() && !extra.manufacturer.trim() && !extra.model.trim()) return;
    components.push({ ...emptyGearComponent('BCD', extra.type), id: extra.id, name: extra.name.trim() || extra.type, manufacturer: extra.manufacturer.trim(), model: extra.model.trim() });
  });

  return {
    ...emptyGearItem(),
    name: bcd.name.trim(),
    category: 'BCD',
    manufacturer: bcd.manufacturer.trim(),
    model: bcd.model.trim(),
    serialNumber: bcd.serialNumber.trim(),
    condition: bcd.condition,
    configuration: bcd.style || '',
    size: bcd.size.trim(),
    capacity: bcd.liftCapacity.trim(),
    isAssembly: true,
    components,
    lastServiceDate: bcd.lastServiceDate.trim(), nextServiceDate: bcd.nextServiceDate.trim(), serviceIntervalMonths: bcd.serviceIntervalMonths,
    purchaseDate: bcd.purchaseDate.trim(), purchasePrice: bcd.purchasePrice.trim(), retailer: bcd.retailer.trim(), warrantyUntil: bcd.warrantyUntil.trim(),
    notes: bcd.notes.trim(),
    setupIds: bcd.setupIds,
  };
}

function emptyExposureState(defaultSetupId) {
  return {
    name: '', manufacturer: '', model: '', size: '',
    suitType: null,
    wetsuit: { cut: null, thickness: '', builtInHood: null },
    drysuit: {
      material: null,
      seals: { included: null, material: null },
      feet: { type: null, size: '' },
      dryGloves: { included: null, ringSystem: '', manufacturer: '', model: '' },
    },
    hood: { included: null, manufacturer: '', model: '', thickness: '' },
    gloves: { included: null, manufacturer: '', model: '', thickness: '' },
    boots: { included: null, manufacturer: '', model: '', size: '' },
    extras: [],
    serialNumber: '', condition: GEAR_CONDITIONS[0],
    lastServiceDate: '', nextServiceDate: '', serviceIntervalMonths: '',
    purchaseDate: '', purchasePrice: '', retailer: '', warrantyUntil: '', notes: '',
    setupIds: defaultSetupId ? [defaultSetupId] : [],
  };
}

function buildExposureDraft(exp) {
  const bodyNotes = exp.suitType === 'Drysuit'
    ? exp.drysuit.material || ''
    : [exp.wetsuit.cut, exp.wetsuit.thickness.trim() ? `${exp.wetsuit.thickness.trim()} thickness` : '', exp.wetsuit.builtInHood ? 'Built-in hood' : ''].filter(Boolean).join(' · ');
  const components = [
    { ...emptyGearComponent('Exposure suit', 'Suit body'), id: createGearId('component'), name: exp.suitType || 'Suit', notes: bodyNotes },
  ];
  if (exp.suitType === 'Drysuit') {
    if (exp.drysuit.seals.included) {
      components.push({ ...emptyGearComponent('Exposure suit', 'Seals'), id: createGearId('component'), name: 'Neck & wrist seals', notes: exp.drysuit.seals.material ? `${exp.drysuit.seals.material} seals` : 'Replaceable seals' });
    }
    if (exp.drysuit.feet.type === 'Built-in boots') {
      components.push({ ...emptyGearComponent('Exposure suit', 'Boots'), id: createGearId('component'), name: 'Built-in boots', notes: exp.drysuit.feet.size.trim() ? `Size ${exp.drysuit.feet.size.trim()}` : '' });
    }
    if (exp.drysuit.dryGloves.included) {
      components.push({
        ...emptyGearComponent('Exposure suit', 'Dry gloves'), id: createGearId('component'), name: 'Dry glove system',
        manufacturer: exp.drysuit.dryGloves.manufacturer.trim(), model: exp.drysuit.dryGloves.model.trim(),
        notes: exp.drysuit.dryGloves.ringSystem.trim() ? `${exp.drysuit.dryGloves.ringSystem.trim()} ring system` : '',
      });
    }
  }
  if (exp.hood.included) components.push({ ...emptyGearComponent('Exposure suit', 'Hood'), id: createGearId('component'), name: 'Hood', manufacturer: exp.hood.manufacturer.trim(), model: exp.hood.model.trim(), notes: exp.hood.thickness.trim() ? `${exp.hood.thickness.trim()} thickness` : '' });
  if (exp.gloves.included) components.push({ ...emptyGearComponent('Exposure suit', 'Gloves'), id: createGearId('component'), name: 'Gloves', manufacturer: exp.gloves.manufacturer.trim(), model: exp.gloves.model.trim(), notes: exp.gloves.thickness.trim() ? `${exp.gloves.thickness.trim()} thickness` : '' });
  if (exp.boots.included) components.push({ ...emptyGearComponent('Exposure suit', 'Boots'), id: createGearId('component'), name: 'Boots', manufacturer: exp.boots.manufacturer.trim(), model: exp.boots.model.trim(), notes: exp.boots.size.trim() ? `Size ${exp.boots.size.trim()}` : '' });
  exp.extras.forEach((extra) => {
    if (!extra.name.trim() && !extra.manufacturer.trim() && !extra.model.trim()) return;
    components.push({ ...emptyGearComponent('Exposure suit', extra.type), id: extra.id, name: extra.name.trim() || extra.type, manufacturer: extra.manufacturer.trim(), model: extra.model.trim() });
  });

  return {
    ...emptyGearItem(),
    name: exp.name.trim(),
    category: 'Exposure suit',
    manufacturer: exp.manufacturer.trim(),
    model: exp.model.trim(),
    serialNumber: exp.serialNumber.trim(),
    condition: exp.condition,
    configuration: exp.suitType || '',
    size: exp.size.trim(),
    thickness: exp.suitType === 'Wetsuit' ? exp.wetsuit.thickness.trim() : '',
    isAssembly: true,
    components,
    lastServiceDate: exp.lastServiceDate.trim(), nextServiceDate: exp.nextServiceDate.trim(), serviceIntervalMonths: exp.serviceIntervalMonths,
    purchaseDate: exp.purchaseDate.trim(), purchasePrice: exp.purchasePrice.trim(), retailer: exp.retailer.trim(), warrantyUntil: exp.warrantyUntil.trim(),
    notes: exp.notes.trim(),
    setupIds: exp.setupIds,
  };
}

function StepDots({ index, count }) {
  return (
    <View style={styles.dots}>
      {Array.from({ length: count }).map((_, i) => <View key={i} style={[styles.dot, i <= index && styles.dotActive]} />)}
    </View>
  );
}

function StepShell({ eyebrow = 'ADD GEAR', title, body, onBack, index, count, children, footer }) {
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
      <ScreenHeader eyebrow={eyebrow} title={title} onBack={onBack} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {count ? <StepDots index={index} count={count} /> : null}
        {body ? <Text style={styles.stepBody}>{body}</Text> : null}
        {children}
      </ScrollView>
      <View style={styles.footer}>{footer}</View>
    </KeyboardAvoidingView>
  );
}

function CategoryPicker({ onBack, onPick, onUseFullForm }) {
  return (
    <View style={styles.screen}>
      <ScreenHeader eyebrow="GEAR LOCKER" title="Add Gear" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.introTitle}>What are you adding?</Text>
        <Text style={styles.stepBody}>Pick a category. Regulators, BCDs, and exposure suits walk through part by part — everything else opens ready to fill in.</Text>
        {CATEGORY_GROUPS.map((group) => (
          <View key={group.label} style={styles.categoryGroup}>
            <Text style={styles.categoryGroupLabel}>{group.label}</Text>
            <View style={styles.categoryTiles}>
              {group.categories.map((category) => (
                <Pressable accessibilityRole="button" key={category} onPress={() => onPick(category)} style={({ pressed }) => [styles.categoryTile, pressed && styles.pressed]}>
                  <Text style={styles.categoryTileText}>{category}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ))}
        <SecondaryButton label="Skip the guided steps — use the full form" onPress={onUseFullForm} style={styles.fullFormLink} />
      </ScrollView>
    </View>
  );
}

// Generic row of equal-width pill buttons — YesNoRow below is the plain yes/no case;
// steps that need a third option (or an unrelated two-way toggle) pass their own options.
function PillOptionRow({ label, options, value, onChange }) {
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

const YES_NO_OPTIONS = [{ value: true, label: 'Yes' }, { value: false, label: 'No, skip it' }];

function YesNoRow({ value, onChange }) {
  return <PillOptionRow onChange={onChange} options={YES_NO_OPTIONS} value={value} />;
}

const TRANSMITTER_MODE_OPTIONS = [{ value: true, label: 'Yes' }, { value: false, label: 'No' }, { value: 'floating', label: 'Floating' }];
const TRANSMITTER_MOUNT_OPTIONS = [{ value: 'hose', label: 'Short hose' }, { value: 'standalone', label: 'Standalone' }];

function regulatorChips(reg) {
  return [
    `First stage${reg.firstStage.manufacturer || reg.firstStage.model ? ` · ${[reg.firstStage.manufacturer, reg.firstStage.model].filter(Boolean).join(' ')}` : ''}`,
    `2nd stage${reg.secondStage.manufacturer || reg.secondStage.model ? ` · ${[reg.secondStage.manufacturer, reg.secondStage.model].filter(Boolean).join(' ')}` : ''}`,
    `Alternate ${reg.alternate.included ? '✓' : '–'}`,
    `Inflator hose ${reg.inflator.included ? '✓' : '–'}`,
    `Drysuit hose ${reg.drysuit.included ? '✓' : '–'}`,
    `SPG ${reg.spg.included ? '✓' : '–'}`,
    `Transmitter ${reg.transmitter.included === 'floating' ? 'Floating' : reg.transmitter.included ? '✓' : '–'}`,
    ...(reg.extras.length ? [`${reg.extras.length} more part${reg.extras.length === 1 ? '' : 's'}`] : []),
  ];
}

function bcdChips(bcd) {
  return [
    bcd.style ? `Style · ${bcd.style}` : 'Style –',
    bcd.size.trim() ? `Size · ${bcd.size.trim()}` : 'Size –',
    `Integrated weights ${bcd.weights.included ? `✓ (${bcd.weights.pockets || '2'})` : '–'}`,
    `Trim pockets ${bcd.weights.trimPockets ? '✓' : '–'}`,
    `Alt air ${bcd.altair.included ? '✓' : '–'}`,
    ...(bcd.extras.length ? [`${bcd.extras.length} more part${bcd.extras.length === 1 ? '' : 's'}`] : []),
  ];
}

function exposureChips(exp) {
  const chips = [exp.suitType ? `Type · ${exp.suitType}` : 'Type –'];
  if (exp.suitType === 'Drysuit') {
    chips.push(
      exp.drysuit.material ? `Material · ${exp.drysuit.material}` : 'Material –',
      `Seals ${exp.drysuit.seals.included ? `✓ (${exp.drysuit.seals.material || 'replaceable'})` : '–'}`,
      exp.drysuit.feet.type ? `Feet · ${exp.drysuit.feet.type}` : 'Feet –',
      `Dry gloves ${exp.drysuit.dryGloves.included ? '✓' : '–'}`,
    );
  } else if (exp.suitType === 'Wetsuit') {
    chips.push(exp.wetsuit.cut ? `Cut · ${exp.wetsuit.cut}` : 'Cut –');
    if (exp.wetsuit.thickness.trim()) chips.push(`Thickness · ${exp.wetsuit.thickness.trim()}`);
    chips.push(`Built-in hood ${exp.wetsuit.builtInHood ? '✓' : '–'}`);
  }
  const hasGloves = exp.gloves.included || (exp.suitType === 'Drysuit' && exp.drysuit.dryGloves.included);
  const hasBoots = exp.boots.included || (exp.suitType === 'Drysuit' && exp.drysuit.feet.type === 'Built-in boots');
  chips.push(`Hood ${exp.hood.included ? '✓' : '–'}`, `Gloves ${hasGloves ? '✓' : '–'}`, `Boots ${hasBoots ? '✓' : '–'}`);
  if (exp.extras.length) chips.push(`${exp.extras.length} more part${exp.extras.length === 1 ? '' : 's'}`);
  return chips;
}

function SummaryStrip({ chips }) {
  return (
    <View style={styles.summaryStrip}>
      {chips.map((chip) => <View key={chip} style={styles.summaryChip}><Text style={styles.summaryChipText}>{chip}</Text></View>)}
    </View>
  );
}

function NotesField({ value, onChangeText }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>Notes</Text>
      <TextInput
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

function ExtraPartRow({ part, partTypes, onChange, onRemove }) {
  const update = (key, value) => onChange({ ...part, [key]: value });
  return (
    <View style={styles.extraPart}>
      <View style={styles.extraPartHeader}>
        <Text style={styles.extraPartTitle}>{part.name || part.type}</Text>
        <Pressable accessibilityRole="button" onPress={onRemove}><Text style={styles.removeExtra}>REMOVE</Text></Pressable>
      </View>
      <ChoiceGroup choices={partTypes} label="Part type" onChange={(value) => update('type', value)} value={part.type} />
      <FormField autoCapitalize="words" label="Name" maxLength={120} onChangeText={(value) => update('name', value)} placeholder={part.type} value={part.name} />
      <View style={styles.twoColumn}>
        <View style={styles.half}>
          <FormField
            helper={part.manufacturerAuto ? 'Carried over from an earlier part — tap to change' : undefined}
            label="Manufacturer"
            maxLength={100}
            onChangeText={(value) => onChange({ ...part, manufacturer: value, manufacturerAuto: false })}
            placeholder="Optional"
            value={part.manufacturer}
          />
        </View>
        <View style={styles.half}><FormField label="Model" maxLength={100} onChangeText={(value) => update('model', value)} placeholder="Optional" value={part.model} /></View>
      </View>
    </View>
  );
}

export default function AddGearWizard({ defaultSetupId, onCancel, onPickOtherCategory, onSave }) {
  const [category, setCategory] = useState('');
  const [step, setStep] = useState('basics');
  const [reg, setReg] = useState(() => emptyRegulatorState(defaultSetupId));
  const [bcd, setBcd] = useState(() => emptyBcdState(defaultSetupId));
  const [exp, setExp] = useState(() => emptyExposureState(defaultSetupId));
  const [busy, setBusy] = useState(false);
  // Stepping Back from the first step of a guided flow drops you at the category picker so you
  // can change your mind about the category — but re-tapping the same category there resumes
  // the same draft rather than wiping it, since that's not a fresh start, just a detour.
  const regulatorStarted = useRef(false);
  const bcdStarted = useRef(false);
  const exposureStarted = useRef(false);

  const pickCategory = (nextCategory) => {
    if (nextCategory === 'Regulator') {
      setCategory('Regulator');
      setStep('basics');
      if (!regulatorStarted.current) {
        setReg(emptyRegulatorState(defaultSetupId));
        regulatorStarted.current = true;
      }
      return;
    }
    if (nextCategory === 'BCD') {
      setCategory('BCD');
      setStep('basics');
      if (!bcdStarted.current) {
        setBcd(emptyBcdState(defaultSetupId));
        bcdStarted.current = true;
      }
      return;
    }
    if (nextCategory === 'Exposure suit') {
      setCategory('Exposure suit');
      setStep('basics');
      if (!exposureStarted.current) {
        setExp(emptyExposureState(defaultSetupId));
        exposureStarted.current = true;
      }
      return;
    }
    onPickOtherCategory(nextCategory);
  };

  if (category === '') {
    return <CategoryPicker onBack={onCancel} onPick={pickCategory} onUseFullForm={() => onPickOtherCategory('')} />;
  }

  if (category === 'BCD') {
    const index = BCD_STEPS.indexOf(step);
    const goBack = () => (index <= 0 ? setCategory('') : setStep(BCD_STEPS[index - 1]));
    const goNext = () => setStep(BCD_STEPS[index + 1]);
    const updateBcd = (patch) => setBcd((current) => ({ ...current, ...patch }));
    const chooseWeights = (included) => {
      updateBcd({ weights: { ...bcd.weights, included } });
      if (included === false) goNext();
    };
    const chooseAltair = (included) => {
      updateBcd({ altair: { ...bcd.altair, included } });
      if (included === false) goNext();
    };
    const save = async () => {
      setBusy(true);
      try {
        await onSave(buildBcdDraft(bcd));
      } catch {
        setBusy(false);
      }
    };

    if (step === 'basics') {
      const canContinue = Boolean(bcd.name.trim());
      return (
        <StepShell body="Give it a name you'll recognize in your locker. Brand and model are optional — you'll set the style and any add-ons next." count={BCD_STEPS.length} footer={<PrimaryButton disabled={!canContinue} label="Continue" onPress={goNext} />} index={index} onBack={goBack} title="Great, a BCD">
          <FormField autoCapitalize="words" label="Name" maxLength={120} onChangeText={(value) => updateBcd({ name: value })} placeholder="Primary BCD" value={bcd.name} />
          <View style={styles.twoColumn}>
            <View style={styles.half}><FormField label="Manufacturer" maxLength={100} onChangeText={(value) => updateBcd({ manufacturer: value })} placeholder="Optional" value={bcd.manufacturer} /></View>
            <View style={styles.half}><FormField label="Model" maxLength={100} onChangeText={(value) => updateBcd({ model: value })} placeholder="Optional" value={bcd.model} /></View>
          </View>
        </StepShell>
      );
    }

    if (step === 'style') {
      return (
        <StepShell body="How it's built, and what size." count={BCD_STEPS.length} footer={<PrimaryButton disabled={!bcd.style} label="Continue" onPress={goNext} />} index={index} onBack={goBack} title="Style & size">
          <ChoiceGroup choices={BCD_STYLES} label="Style" onChange={(value) => updateBcd({ style: value })} value={bcd.style} />
          <FormField label="Size" maxLength={40} onChangeText={(value) => updateBcd({ size: value })} placeholder="e.g. M, Steel L" value={bcd.size} />
        </StepShell>
      );
    }

    if (step === 'weights') {
      return (
        <StepShell body="Weight pockets built into the BCD itself, separate from any weight belt." count={BCD_STEPS.length} footer={<PrimaryButton disabled={bcd.weights.included === null} label="Continue" onPress={goNext} />} index={index} onBack={goBack} title="Integrated weights?">
          <YesNoRow onChange={chooseWeights} value={bcd.weights.included} />
          {bcd.weights.included ? (
            <>
              <PillOptionRow label="Releasable pockets" onChange={(pockets) => updateBcd({ weights: { ...bcd.weights, pockets } })} options={[{ value: '1', label: '1' }, { value: '2', label: '2' }]} value={bcd.weights.pockets} />
              <Text style={styles.pillLabel}>Fixed trim pockets?</Text>
              <YesNoRow onChange={(trimPockets) => updateBcd({ weights: { ...bcd.weights, trimPockets } })} value={bcd.weights.trimPockets} />
            </>
          ) : null}
        </StepShell>
      );
    }

    if (step === 'altair') {
      return (
        <StepShell body="A second stage built into the power inflator, so a buddy can breathe from it — Scubapro Air2, Apeks/Aqualung Airsource, and similar." count={BCD_STEPS.length} footer={<PrimaryButton disabled={bcd.altair.included === null} label="Continue" onPress={goNext} />} index={index} onBack={goBack} title="Integrated alternate air source?">
          <YesNoRow onChange={chooseAltair} value={bcd.altair.included} />
          {bcd.altair.included ? (
            <>
              <FormField label="Manufacturer" maxLength={100} onChangeText={(value) => updateBcd({ altair: { ...bcd.altair, manufacturer: value } })} placeholder="Optional" value={bcd.altair.manufacturer} />
              <FormField label="Model" maxLength={100} onChangeText={(value) => updateBcd({ altair: { ...bcd.altair, model: value } })} placeholder="Optional" value={bcd.altair.model} />
            </>
          ) : null}
        </StepShell>
      );
    }

    if (step === 'extras') {
      const addExtra = () => updateBcd({ extras: [...bcd.extras, { id: createGearId('component'), type: BCD_EXTRA_PART_TYPES[0], name: '', manufacturer: '', model: '' }] });
      const updateExtra = (partId, next) => updateBcd({ extras: bcd.extras.map((entry) => (entry.id === partId ? next : entry)) });
      const removeExtra = (partId) => updateBcd({ extras: bcd.extras.filter((entry) => entry.id !== partId) });
      return (
        <StepShell body="Dump valves, cam strap, D-rings, anything else worth tracking as its own part." count={BCD_STEPS.length} footer={<PrimaryButton label="Continue" onPress={goNext} />} index={index} onBack={goBack} title="Any other parts?">
          {bcd.extras.map((part) => <ExtraPartRow key={part.id} onChange={(next) => updateExtra(part.id, next)} onRemove={() => removeExtra(part.id)} part={part} partTypes={BCD_EXTRA_PART_TYPES} />)}
          <SecondaryButton label="Add another part" onPress={addExtra} />
        </StepShell>
      );
    }

    // step === 'details'
    return (
      <StepShell body="Optional — fill in now, or skip and add it later from the item's page." count={BCD_STEPS.length} footer={<PrimaryButton disabled={busy} label={busy ? 'Saving…' : 'Save gear item'} onPress={save} />} index={index} onBack={goBack} title="Serial & service">
        <SummaryStrip chips={bcdChips(bcd)} />
        <View style={styles.twoColumn}>
          <View style={styles.half}><FormField autoCapitalize="characters" label="Serial number" maxLength={120} onChangeText={(value) => updateBcd({ serialNumber: value })} placeholder="Optional" value={bcd.serialNumber} /></View>
          <View style={styles.half}><FormField label="Lift capacity" maxLength={40} onChangeText={(value) => updateBcd({ liftCapacity: value })} placeholder="e.g. 30 lb" value={bcd.liftCapacity} /></View>
        </View>
        <ChoiceGroup choices={GEAR_CONDITIONS} label="Current condition" onChange={(value) => updateBcd({ condition: value })} value={bcd.condition} />
        <View style={styles.twoColumn}>
          <View style={styles.half}><DateField label="Last service" onChange={(value) => updateBcd({ lastServiceDate: value })} value={bcd.lastServiceDate} /></View>
          <View style={styles.half}><DateField label="Next service" onChange={(value) => updateBcd({ nextServiceDate: value })} value={bcd.nextServiceDate} /></View>
        </View>
        <ChoiceGroup choices={SERVICE_INTERVALS.map((value) => value || 'None')} label="Repeat every (months)" onChange={(value) => updateBcd({ serviceIntervalMonths: value === 'None' ? '' : value })} value={bcd.serviceIntervalMonths || 'None'} />
        <View style={styles.twoColumn}>
          <View style={styles.half}><DateField label="Purchase date" onChange={(value) => updateBcd({ purchaseDate: value })} value={bcd.purchaseDate} /></View>
          <View style={styles.half}><DateField label="Warranty until" onChange={(value) => updateBcd({ warrantyUntil: value })} value={bcd.warrantyUntil} /></View>
        </View>
        <View style={styles.twoColumn}>
          <View style={styles.half}><FormField label="Purchase price" maxLength={40} onChangeText={(value) => updateBcd({ purchasePrice: value })} placeholder="$0.00" value={bcd.purchasePrice} /></View>
          <View style={styles.half}><FormField label="Retailer / shop" maxLength={100} onChangeText={(value) => updateBcd({ retailer: value })} placeholder="Optional" value={bcd.retailer} /></View>
        </View>
        <NotesField onChangeText={(value) => updateBcd({ notes: value })} value={bcd.notes} />
      </StepShell>
    );
  }

  if (category === 'Exposure suit') {
    const exposureSteps = exposureStepsFor(exp);
    const index = exposureSteps.indexOf(step);
    const goBack = () => (index <= 0 ? setCategory('') : setStep(exposureSteps[index - 1]));
    // Some answers (suit type, dry-glove system, built-in boots) change which later steps apply,
    // so goNext recomputes the step list from the freshest draft — nextExp when a caller just
    // changed something that affects branching, otherwise the current exp is already up to date.
    const goNext = (nextExp) => {
      const steps = exposureStepsFor(nextExp || exp);
      const i = steps.indexOf(step);
      setStep(steps[i + 1]);
    };
    const updateExp = (patch) => setExp((current) => ({ ...current, ...patch }));
    const chooseSuitType = (suitType) => {
      const nextExp = { ...exp, suitType };
      setExp(nextExp);
      goNext(nextExp);
    };
    const chooseHood = (included) => {
      updateExp({ hood: { ...exp.hood, included } });
      if (included === false) goNext();
    };
    const chooseGloves = (included) => {
      updateExp({ gloves: { ...exp.gloves, included } });
      if (included === false) goNext();
    };
    const chooseBoots = (included) => {
      updateExp({ boots: { ...exp.boots, included } });
      if (included === false) goNext();
    };
    const chooseSeals = (included) => {
      const nextExp = { ...exp, drysuit: { ...exp.drysuit, seals: { ...exp.drysuit.seals, included } } };
      setExp(nextExp);
      if (included === false) goNext(nextExp);
    };
    const chooseFeet = (type) => {
      const nextExp = { ...exp, drysuit: { ...exp.drysuit, feet: { ...exp.drysuit.feet, type } } };
      setExp(nextExp);
      if (type === 'Socks') goNext(nextExp);
    };
    const chooseDryGloves = (included) => {
      const nextExp = { ...exp, drysuit: { ...exp.drysuit, dryGloves: { ...exp.drysuit.dryGloves, included } } };
      setExp(nextExp);
      if (included === false) goNext(nextExp);
    };
    const save = async () => {
      setBusy(true);
      try {
        await onSave(buildExposureDraft(exp));
      } catch {
        setBusy(false);
      }
    };

    if (step === 'basics') {
      const canContinue = Boolean(exp.name.trim());
      return (
        <StepShell body="Give it a name you'll recognize in your locker. Brand and model are optional — you'll set the type and any add-ons next." count={exposureSteps.length} footer={<PrimaryButton disabled={!canContinue} label="Continue" onPress={() => goNext()} />} index={index} onBack={goBack} title="Great, exposure protection">
          <FormField autoCapitalize="words" label="Name" maxLength={120} onChangeText={(value) => updateExp({ name: value })} placeholder="Primary wetsuit" value={exp.name} />
          <View style={styles.twoColumn}>
            <View style={styles.half}><FormField label="Manufacturer" maxLength={100} onChangeText={(value) => updateExp({ manufacturer: value })} placeholder="Optional" value={exp.manufacturer} /></View>
            <View style={styles.half}><FormField label="Model" maxLength={100} onChangeText={(value) => updateExp({ model: value })} placeholder="Optional" value={exp.model} /></View>
          </View>
        </StepShell>
      );
    }

    if (step === 'suit-type') {
      return (
        <StepShell body="This decides what we ask about next." count={exposureSteps.length} footer={<PrimaryButton disabled={!exp.suitType} label="Continue" onPress={() => goNext()} />} index={index} onBack={goBack} title="Wetsuit or drysuit?">
          <PillOptionRow onChange={chooseSuitType} options={EXPOSURE_SUIT_TYPE_OPTIONS} value={exp.suitType} />
        </StepShell>
      );
    }

    if (step === 'wetsuit-cut') {
      return (
        <StepShell body="Shorty or full length, and how thick." count={exposureSteps.length} footer={<PrimaryButton disabled={!exp.wetsuit.cut} label="Continue" onPress={() => goNext()} />} index={index} onBack={goBack} title="Cut & thickness">
          <PillOptionRow label="Cut" onChange={(cut) => updateExp({ wetsuit: { ...exp.wetsuit, cut } })} options={WETSUIT_CUT_OPTIONS} value={exp.wetsuit.cut} />
          <View style={styles.twoColumn}>
            <View style={styles.half}><FormField label="Thickness" maxLength={40} onChangeText={(value) => updateExp({ wetsuit: { ...exp.wetsuit, thickness: value } })} placeholder="e.g. 3mm, 5/4mm" value={exp.wetsuit.thickness} /></View>
            <View style={styles.half}><FormField label="Size" maxLength={40} onChangeText={(value) => updateExp({ size: value })} placeholder="e.g. M, MT" value={exp.size} /></View>
          </View>
          <Text style={styles.pillLabel}>Built-in hood?</Text>
          <YesNoRow onChange={(builtInHood) => updateExp({ wetsuit: { ...exp.wetsuit, builtInHood } })} value={exp.wetsuit.builtInHood} />
        </StepShell>
      );
    }

    if (step === 'drysuit-material') {
      return (
        <StepShell body="What the suit itself is made of." count={exposureSteps.length} footer={<PrimaryButton disabled={!exp.drysuit.material} label="Continue" onPress={() => goNext()} />} index={index} onBack={goBack} title="Suit material">
          <ChoiceGroup choices={DRYSUIT_MATERIALS} label="Material" onChange={(material) => updateExp({ drysuit: { ...exp.drysuit, material } })} value={exp.drysuit.material} />
          <FormField label="Size" maxLength={40} onChangeText={(value) => updateExp({ size: value })} placeholder="e.g. M, L Tall" value={exp.size} />
        </StepShell>
      );
    }

    if (step === 'drysuit-seals') {
      return (
        <StepShell body="Neck and wrist seals you can replace yourself, versus a suit built with fixed seals." count={exposureSteps.length} footer={<PrimaryButton disabled={exp.drysuit.seals.included === null} label="Continue" onPress={() => goNext()} />} index={index} onBack={goBack} title="Replaceable seals?">
          <YesNoRow onChange={chooseSeals} value={exp.drysuit.seals.included} />
          {exp.drysuit.seals.included ? (
            <ChoiceGroup choices={SEAL_MATERIALS} label="Seal material" onChange={(material) => updateExp({ drysuit: { ...exp.drysuit, seals: { ...exp.drysuit.seals, material } } })} value={exp.drysuit.seals.material} />
          ) : null}
        </StepShell>
      );
    }

    if (step === 'drysuit-feet') {
      return (
        <StepShell body="How the suit seals around your feet." count={exposureSteps.length} footer={<PrimaryButton disabled={!exp.drysuit.feet.type} label="Continue" onPress={() => goNext()} />} index={index} onBack={goBack} title="Built-in boots or socks?">
          <PillOptionRow onChange={chooseFeet} options={DRYSUIT_FEET_OPTION_LIST} value={exp.drysuit.feet.type} />
          {exp.drysuit.feet.type === 'Built-in boots' ? (
            <FormField label="Boot size" maxLength={40} onChangeText={(value) => updateExp({ drysuit: { ...exp.drysuit, feet: { ...exp.drysuit.feet, size: value } } })} placeholder="Optional" value={exp.drysuit.feet.size} />
          ) : null}
        </StepShell>
      );
    }

    if (step === 'dry-gloves') {
      return (
        <StepShell body="A dry glove system, sealed at the wrist with a ring — Si-Tech, Kubi, and similar." count={exposureSteps.length} footer={<PrimaryButton disabled={exp.drysuit.dryGloves.included === null} label="Continue" onPress={() => goNext()} />} index={index} onBack={goBack} title="Dry glove system?">
          <YesNoRow onChange={chooseDryGloves} value={exp.drysuit.dryGloves.included} />
          {exp.drysuit.dryGloves.included ? (
            <>
              <FormField label="Ring system" maxLength={100} onChangeText={(value) => updateExp({ drysuit: { ...exp.drysuit, dryGloves: { ...exp.drysuit.dryGloves, ringSystem: value } } })} placeholder="e.g. Si-Tech, Kubi" value={exp.drysuit.dryGloves.ringSystem} />
              <View style={styles.twoColumn}>
                <View style={styles.half}><FormField label="Manufacturer" maxLength={100} onChangeText={(value) => updateExp({ drysuit: { ...exp.drysuit, dryGloves: { ...exp.drysuit.dryGloves, manufacturer: value } } })} placeholder="Optional" value={exp.drysuit.dryGloves.manufacturer} /></View>
                <View style={styles.half}><FormField label="Model" maxLength={100} onChangeText={(value) => updateExp({ drysuit: { ...exp.drysuit, dryGloves: { ...exp.drysuit.dryGloves, model: value } } })} placeholder="Optional" value={exp.drysuit.dryGloves.model} /></View>
              </View>
            </>
          ) : null}
        </StepShell>
      );
    }

    if (step === 'hood') {
      return (
        <StepShell body="Does this setup include a hood?" count={exposureSteps.length} footer={<PrimaryButton disabled={exp.hood.included === null} label="Continue" onPress={() => goNext()} />} index={index} onBack={goBack} title="Hood?">
          <YesNoRow onChange={chooseHood} value={exp.hood.included} />
          {exp.hood.included ? (
            <>
              <View style={styles.twoColumn}>
                <View style={styles.half}><FormField label="Manufacturer" maxLength={100} onChangeText={(value) => updateExp({ hood: { ...exp.hood, manufacturer: value } })} placeholder="Optional" value={exp.hood.manufacturer} /></View>
                <View style={styles.half}><FormField label="Model" maxLength={100} onChangeText={(value) => updateExp({ hood: { ...exp.hood, model: value } })} placeholder="Optional" value={exp.hood.model} /></View>
              </View>
              <FormField label="Thickness" maxLength={40} onChangeText={(value) => updateExp({ hood: { ...exp.hood, thickness: value } })} placeholder="e.g. 5mm" value={exp.hood.thickness} />
            </>
          ) : null}
        </StepShell>
      );
    }

    if (step === 'gloves') {
      return (
        <StepShell body="Does this setup include gloves?" count={exposureSteps.length} footer={<PrimaryButton disabled={exp.gloves.included === null} label="Continue" onPress={() => goNext()} />} index={index} onBack={goBack} title="Gloves?">
          <YesNoRow onChange={chooseGloves} value={exp.gloves.included} />
          {exp.gloves.included ? (
            <>
              <View style={styles.twoColumn}>
                <View style={styles.half}><FormField label="Manufacturer" maxLength={100} onChangeText={(value) => updateExp({ gloves: { ...exp.gloves, manufacturer: value } })} placeholder="Optional" value={exp.gloves.manufacturer} /></View>
                <View style={styles.half}><FormField label="Model" maxLength={100} onChangeText={(value) => updateExp({ gloves: { ...exp.gloves, model: value } })} placeholder="Optional" value={exp.gloves.model} /></View>
              </View>
              <FormField label="Thickness" maxLength={40} onChangeText={(value) => updateExp({ gloves: { ...exp.gloves, thickness: value } })} placeholder="e.g. 3mm" value={exp.gloves.thickness} />
            </>
          ) : null}
        </StepShell>
      );
    }

    if (step === 'boots') {
      return (
        <StepShell body="Does this setup include boots?" count={exposureSteps.length} footer={<PrimaryButton disabled={exp.boots.included === null} label="Continue" onPress={() => goNext()} />} index={index} onBack={goBack} title="Boots?">
          <YesNoRow onChange={chooseBoots} value={exp.boots.included} />
          {exp.boots.included ? (
            <>
              <View style={styles.twoColumn}>
                <View style={styles.half}><FormField label="Manufacturer" maxLength={100} onChangeText={(value) => updateExp({ boots: { ...exp.boots, manufacturer: value } })} placeholder="Optional" value={exp.boots.manufacturer} /></View>
                <View style={styles.half}><FormField label="Model" maxLength={100} onChangeText={(value) => updateExp({ boots: { ...exp.boots, model: value } })} placeholder="Optional" value={exp.boots.model} /></View>
              </View>
              <FormField label="Size" maxLength={40} onChangeText={(value) => updateExp({ boots: { ...exp.boots, size: value } })} placeholder="Optional" value={exp.boots.size} />
            </>
          ) : null}
        </StepShell>
      );
    }

    if (step === 'layers') {
      const addExtra = () => updateExp({ extras: [...exp.extras, { id: createGearId('component'), type: EXPOSURE_EXTRA_PART_TYPES[0], name: '', manufacturer: '', model: '' }] });
      const updateExtra = (partId, next) => updateExp({ extras: exp.extras.map((entry) => (entry.id === partId ? next : entry)) });
      const removeExtra = (partId) => updateExp({ extras: exp.extras.filter((entry) => entry.id !== partId) });
      const body = exp.suitType === 'Drysuit'
        ? 'Undergarments, base layers, anything else worth tracking as its own part.'
        : 'Rashguards, underlayers, socks — anything else worth tracking as its own part.';
      return (
        <StepShell body={body} count={exposureSteps.length} footer={<PrimaryButton label="Continue" onPress={() => goNext()} />} index={index} onBack={goBack} title="Anything else?">
          {exp.extras.map((part) => <ExtraPartRow key={part.id} onChange={(next) => updateExtra(part.id, next)} onRemove={() => removeExtra(part.id)} part={part} partTypes={EXPOSURE_EXTRA_PART_TYPES} />)}
          <SecondaryButton label="Add another part" onPress={addExtra} />
        </StepShell>
      );
    }

    // step === 'details'
    return (
      <StepShell body="Optional — fill in now, or skip and add it later from the item's page." count={exposureSteps.length} footer={<PrimaryButton disabled={busy} label={busy ? 'Saving…' : 'Save gear item'} onPress={save} />} index={index} onBack={goBack} title="Serial & service">
        <SummaryStrip chips={exposureChips(exp)} />
        <FormField autoCapitalize="characters" label="Serial number" maxLength={120} onChangeText={(value) => updateExp({ serialNumber: value })} placeholder="Optional" value={exp.serialNumber} />
        <ChoiceGroup choices={GEAR_CONDITIONS} label="Current condition" onChange={(value) => updateExp({ condition: value })} value={exp.condition} />
        <View style={styles.twoColumn}>
          <View style={styles.half}><DateField label="Last service" onChange={(value) => updateExp({ lastServiceDate: value })} value={exp.lastServiceDate} /></View>
          <View style={styles.half}><DateField label="Next service" onChange={(value) => updateExp({ nextServiceDate: value })} value={exp.nextServiceDate} /></View>
        </View>
        <ChoiceGroup choices={SERVICE_INTERVALS.map((value) => value || 'None')} label="Repeat every (months)" onChange={(value) => updateExp({ serviceIntervalMonths: value === 'None' ? '' : value })} value={exp.serviceIntervalMonths || 'None'} />
        <View style={styles.twoColumn}>
          <View style={styles.half}><DateField label="Purchase date" onChange={(value) => updateExp({ purchaseDate: value })} value={exp.purchaseDate} /></View>
          <View style={styles.half}><DateField label="Warranty until" onChange={(value) => updateExp({ warrantyUntil: value })} value={exp.warrantyUntil} /></View>
        </View>
        <View style={styles.twoColumn}>
          <View style={styles.half}><FormField label="Purchase price" maxLength={40} onChangeText={(value) => updateExp({ purchasePrice: value })} placeholder="$0.00" value={exp.purchasePrice} /></View>
          <View style={styles.half}><FormField label="Retailer / shop" maxLength={100} onChangeText={(value) => updateExp({ retailer: value })} placeholder="Optional" value={exp.retailer} /></View>
        </View>
        <NotesField onChangeText={(value) => updateExp({ notes: value })} value={exp.notes} />
      </StepShell>
    );
  }

  const index = REGULATOR_STEPS.indexOf(step);
  const goBack = () => (index <= 0 ? setCategory('') : setStep(REGULATOR_STEPS[index - 1]));
  const goNext = () => {
    const nextStep = REGULATOR_STEPS[index + 1];
    setReg((current) => {
      const existing = manufacturerForStep(current, nextStep);
      if (existing === null || existing.trim()) return current;
      const brand = latestManufacturer(current);
      return brand ? applyManufacturer(current, nextStep, brand) : current;
    });
    setStep(nextStep);
  };
  const updateReg = (patch) => setReg((current) => ({ ...current, ...patch }));
  // Typing directly into a carried-over field clears its "auto" flag — from then on it's
  // just the diver's own answer, not a suggestion.
  const setManufacturer = (key, value) => setReg((current) => ({
    ...current,
    [key]: { ...current[key], manufacturer: value },
    manufacturerAuto: { ...current.manufacturerAuto, [key]: false },
  }));
  const autoHelper = (key) => (reg.manufacturerAuto[key] ? 'Carried over from an earlier part — tap to change' : undefined);
  // Skipping a part has nothing left to fill in, so it moves straight on instead of making
  // you tap Continue separately. Answering "yes" only auto-advances when there's no follow-up
  // manufacturer/model to capture (inflator and drysuit hoses; alternate/SPG/transmitter still
  // need a Continue tap once their fields are filled in).
  const chooseYesNo = (key, included, autoAdvance) => {
    updateReg({ [key]: { ...reg[key], included } });
    if (autoAdvance) goNext();
  };

  const save = async () => {
    setBusy(true);
    try {
      await onSave(buildRegulatorDraft(reg));
    } catch {
      setBusy(false);
    }
  };

  if (step === 'basics') {
    const canContinue = Boolean(reg.name.trim());
    return (
      <StepShell body="Give it a name you'll recognize in your locker. Brand and model for the whole set are optional — you'll pick these per part next." count={REGULATOR_STEPS.length} footer={<PrimaryButton disabled={!canContinue} label="Continue" onPress={goNext} />} index={index} onBack={goBack} title="Great, a regulator">
        <FormField autoCapitalize="words" label="Name" maxLength={120} onChangeText={(value) => updateReg({ name: value })} placeholder="Primary regulator" value={reg.name} />
        <View style={styles.twoColumn}>
          <View style={styles.half}><FormField label="Manufacturer" maxLength={100} onChangeText={(value) => updateReg({ manufacturer: value })} placeholder="Optional" value={reg.manufacturer} /></View>
          <View style={styles.half}><FormField label="Model" maxLength={100} onChangeText={(value) => updateReg({ model: value })} placeholder="Optional" value={reg.model} /></View>
        </View>
      </StepShell>
    );
  }

  if (step === 'first-stage') {
    return (
      <StepShell body="The part that mounts on the tank valve and steps down tank pressure." count={REGULATOR_STEPS.length} footer={<PrimaryButton label="Continue" onPress={goNext} />} index={index} onBack={goBack} title="First stage">
        <FormField helper={autoHelper('firstStage')} label="Manufacturer" maxLength={100} onChangeText={(value) => setManufacturer('firstStage', value)} placeholder="e.g. Scubapro" value={reg.firstStage.manufacturer} />
        <FormField label="Model" maxLength={100} onChangeText={(value) => updateReg({ firstStage: { ...reg.firstStage, model: value } })} placeholder="e.g. MK25 EVO" value={reg.firstStage.model} />
      </StepShell>
    );
  }

  if (step === 'second-stage') {
    return (
      <StepShell body="Your primary second stage — the one you breathe from." count={REGULATOR_STEPS.length} footer={<PrimaryButton label="Continue" onPress={goNext} />} index={index} onBack={goBack} title="Second stage">
        <FormField helper={autoHelper('secondStage')} label="Manufacturer" maxLength={100} onChangeText={(value) => setManufacturer('secondStage', value)} placeholder="e.g. Scubapro" value={reg.secondStage.manufacturer} />
        <FormField label="Model" maxLength={100} onChangeText={(value) => updateReg({ secondStage: { ...reg.secondStage, model: value } })} placeholder="e.g. S620 Ti" value={reg.secondStage.model} />
      </StepShell>
    );
  }

  if (step === 'alternate') {
    return (
      <StepShell body="Your backup second stage — octopus, necklace, or a bungee'd spare." count={REGULATOR_STEPS.length} footer={<PrimaryButton disabled={reg.alternate.included === null} label="Continue" onPress={goNext} />} index={index} onBack={goBack} title="Alternate second stage?">
        <YesNoRow onChange={(included) => chooseYesNo('alternate', included, included === false)} value={reg.alternate.included} />
        {reg.alternate.included ? (
          <>
            <FormField helper={autoHelper('alternate')} label="Manufacturer" maxLength={100} onChangeText={(value) => setManufacturer('alternate', value)} placeholder="Optional" value={reg.alternate.manufacturer} />
            <FormField label="Model" maxLength={100} onChangeText={(value) => updateReg({ alternate: { ...reg.alternate, model: value } })} placeholder="Optional" value={reg.alternate.model} />
          </>
        ) : null}
      </StepShell>
    );
  }

  if (step === 'inflator') {
    return (
      <StepShell body="The hose that connects the first stage to your BCD's power inflator." count={REGULATOR_STEPS.length} footer={<PrimaryButton disabled={reg.inflator.included === null} label="Continue" onPress={goNext} />} index={index} onBack={goBack} title="BCD inflator hose?">
        <YesNoRow onChange={(included) => chooseYesNo('inflator', included, true)} value={reg.inflator.included} />
      </StepShell>
    );
  }

  if (step === 'drysuit') {
    return (
      <StepShell body="A separate low-pressure hose running from the first stage to a drysuit's inflator valve." count={REGULATOR_STEPS.length} footer={<PrimaryButton disabled={reg.drysuit.included === null} label="Continue" onPress={goNext} />} index={index} onBack={goBack} title="Drysuit inflator hose?">
        <YesNoRow onChange={(included) => chooseYesNo('drysuit', included, true)} value={reg.drysuit.included} />
      </StepShell>
    );
  }

  if (step === 'spg') {
    return (
      <StepShell body="Your submersible pressure gauge, whether standalone or on a console." count={REGULATOR_STEPS.length} footer={<PrimaryButton disabled={reg.spg.included === null} label="Continue" onPress={goNext} />} index={index} onBack={goBack} title="SPG?">
        <YesNoRow onChange={(included) => chooseYesNo('spg', included, included === false)} value={reg.spg.included} />
        {reg.spg.included ? (
          <>
            <FormField helper={autoHelper('spg')} label="Manufacturer" maxLength={100} onChangeText={(value) => setManufacturer('spg', value)} placeholder="Optional" value={reg.spg.manufacturer} />
            <FormField label="Model" maxLength={100} onChangeText={(value) => updateReg({ spg: { ...reg.spg, model: value } })} placeholder="Optional" value={reg.spg.model} />
          </>
        ) : null}
      </StepShell>
    );
  }

  if (step === 'transmitter') {
    return (
      <StepShell body="A wireless tank-pressure transmitter that pairs with a dive computer. Pick Floating if it's not dedicated to this regulator — it gets moved between setups." count={REGULATOR_STEPS.length} footer={<PrimaryButton disabled={reg.transmitter.included === null} label="Continue" onPress={goNext} />} index={index} onBack={goBack} title="Wireless transmitter?">
        <PillOptionRow onChange={(included) => chooseYesNo('transmitter', included, included === false)} options={TRANSMITTER_MODE_OPTIONS} value={reg.transmitter.included} />
        {reg.transmitter.included ? (
          <>
            <FormField helper={autoHelper('transmitter')} label="Manufacturer" maxLength={100} onChangeText={(value) => setManufacturer('transmitter', value)} placeholder="Optional" value={reg.transmitter.manufacturer} />
            <FormField label="Model" maxLength={100} onChangeText={(value) => updateReg({ transmitter: { ...reg.transmitter, model: value } })} placeholder="Optional" value={reg.transmitter.model} />
            <PillOptionRow label="How is it mounted?" onChange={(mount) => updateReg({ transmitter: { ...reg.transmitter, mount } })} options={TRANSMITTER_MOUNT_OPTIONS} value={reg.transmitter.mount} />
          </>
        ) : null}
      </StepShell>
    );
  }

  if (step === 'extras') {
    const addExtra = () => {
      const brand = latestManufacturer(reg);
      updateReg({ extras: [...reg.extras, { id: createGearId('component'), type: REGULATOR_EXTRA_PART_TYPES[0], name: '', manufacturer: brand, manufacturerAuto: Boolean(brand), model: '' }] });
    };
    const updateExtra = (partId, next) => updateReg({ extras: reg.extras.map((entry) => (entry.id === partId ? next : entry)) });
    const removeExtra = (partId) => updateReg({ extras: reg.extras.filter((entry) => entry.id !== partId) });
    return (
      <StepShell body="Gauge console, high-pressure hose, anything else worth tracking as its own part." count={REGULATOR_STEPS.length} footer={<PrimaryButton label="Continue" onPress={goNext} />} index={index} onBack={goBack} title="Any other parts?">
        {reg.extras.map((part) => <ExtraPartRow key={part.id} onChange={(next) => updateExtra(part.id, next)} onRemove={() => removeExtra(part.id)} part={part} partTypes={REGULATOR_EXTRA_PART_TYPES} />)}
        <SecondaryButton label="Add another part" onPress={addExtra} />
      </StepShell>
    );
  }

  // step === 'details'
  return (
    <StepShell body="Optional — fill in now, or skip and add it later from the item's page." count={REGULATOR_STEPS.length} footer={<PrimaryButton disabled={busy} label={busy ? 'Saving…' : 'Save gear item'} onPress={save} />} index={index} onBack={goBack} title="Serial & service">
      <SummaryStrip chips={regulatorChips(reg)} />
      <FormField autoCapitalize="characters" label="Serial number" maxLength={120} onChangeText={(value) => updateReg({ serialNumber: value })} placeholder="Optional" value={reg.serialNumber} />
      <ChoiceGroup choices={GEAR_CONDITIONS} label="Current condition" onChange={(value) => updateReg({ condition: value })} value={reg.condition} />
      <View style={styles.twoColumn}>
        <View style={styles.half}><DateField label="Last service" onChange={(value) => updateReg({ lastServiceDate: value })} value={reg.lastServiceDate} /></View>
        <View style={styles.half}><DateField label="Next service" onChange={(value) => updateReg({ nextServiceDate: value })} value={reg.nextServiceDate} /></View>
      </View>
      <ChoiceGroup choices={SERVICE_INTERVALS.map((value) => value || 'None')} label="Repeat every (months)" onChange={(value) => updateReg({ serviceIntervalMonths: value === 'None' ? '' : value })} value={reg.serviceIntervalMonths || 'None'} />
      <View style={styles.twoColumn}>
        <View style={styles.half}><DateField label="Purchase date" onChange={(value) => updateReg({ purchaseDate: value })} value={reg.purchaseDate} /></View>
        <View style={styles.half}><DateField label="Warranty until" onChange={(value) => updateReg({ warrantyUntil: value })} value={reg.warrantyUntil} /></View>
      </View>
      <View style={styles.twoColumn}>
        <View style={styles.half}><FormField label="Purchase price" maxLength={40} onChangeText={(value) => updateReg({ purchasePrice: value })} placeholder="$0.00" value={reg.purchasePrice} /></View>
        <View style={styles.half}><FormField label="Retailer / shop" maxLength={100} onChangeText={(value) => updateReg({ retailer: value })} placeholder="Optional" value={reg.retailer} /></View>
      </View>
      <NotesField onChangeText={(value) => updateReg({ notes: value })} value={reg.notes} />
    </StepShell>
  );
}

const styles = StyleSheet.create({
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
