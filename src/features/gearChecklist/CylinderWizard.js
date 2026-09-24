import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChoiceGroup, FormField as AccountFormField } from '../../components/AccountForm';
import DateField from '../../components/DateField';
import { PrimaryButton, SecondaryButton } from '../../components/Ui';
import { NUMBER_KEYBOARD_ACCESSORY_ID } from '../../lib/numberKeyboard';
import {
  CYLINDER_COLORS,
  CYLINDER_MATERIALS,
  CYLINDER_PRESETS,
  GEAR_CONDITIONS,
  HYDRO_INTERVAL_MONTHS,
  VALVE_TYPES,
  VISUAL_INTERVAL_MONTHS,
  addMonthsToDateOnly,
  presetCapacity,
  presetPressure,
  unpairedCylinders,
} from './model';
import { buildCylinderDrafts, cylinderChips, emptyState, isPair, sideLabels, suggestedName } from './cylinders';
import { AccessoryOptionRow, CheckRow, NotesField, PillOptionRow, SetupPicker, StepShell, SummaryStrip, YesNoRow, wizardStyles as styles } from './wizardParts';

const FormField = (props) => <AccountFormField {...props} inputAccessoryViewID={NUMBER_KEYBOARD_ACCESSORY_ID} />;

// Guided cylinder flow: single tank, doubles or sidemount pair → material & size → valve → color &
// boot → each cylinder's serial and inspection dates → details. Every cylinder is saved as its own
// locker item (own serial, hydro and visual dates); a doubles set or sidemount pair is a set item
// that links its two cylinders (accessoryItemIds) and holds the set's own parts (manifold, bands).
// A set can also link two cylinders already in the locker instead of adding new ones.
const SETUP_OPTIONS = [
  { value: 'Single tank', label: 'Single tank', body: 'One cylinder with its own valve.' },
  { value: 'Doubles', label: 'Doubles', body: 'Two backmounted cylinders held by bands, usually joined by an isolation manifold.' },
  { value: 'Sidemount pair', label: 'Sidemount pair', body: 'Two independent cylinders you carry at your sides.' },
  { value: 'Pony / bailout', label: 'Pony / bailout', body: 'An independent emergency-gas cylinder with its own regulator.' },
  { value: 'Stage / deco', label: 'Stage / deco', body: 'A stage or decompression cylinder carried separately from back gas.' },
];
const MANIFOLD_OPTIONS = [{ value: 'manifold', label: 'Isolation manifold' }, { value: 'independent', label: 'Independent' }];
const SOURCE_OPTIONS = [{ value: 'new', label: 'Add them now' }, { value: 'existing', label: 'Already in my locker' }];
const SETUP_TYPE_FOR = { 'Single tank': 'Single tank', Doubles: 'Doubles', 'Sidemount pair': 'Sidemount', 'Pony / bailout': 'Pony / bailout', 'Stage / deco': 'Stage / deco' };
const NEW_STEPS = ['setup', 'cylinder', 'valve', 'look', 'identify', 'details'];
const LINK_STEPS = ['setup', 'link', 'details'];

function InspectionFields({ value, onChange, showDates }) {
  const update = (patch) => onChange({ ...value, ...patch });
  return (
    <>
      <FormField autoCapitalize="characters" label="Serial number" maxLength={120} onChangeText={(serialNumber) => update({ serialNumber })} placeholder="Stamped on the shoulder" value={value.serialNumber} />
      {showDates ? (
        <>
          <View style={styles.twoColumn}>
            <View style={styles.half}><DateField label="Last hydro test" onChange={(lastHydro) => update({ lastHydro, hydroDue: addMonthsToDateOnly(lastHydro, HYDRO_INTERVAL_MONTHS) || value.hydroDue })} value={value.lastHydro} /></View>
            <View style={styles.half}><DateField label="Hydro due" onChange={(hydroDue) => update({ hydroDue })} value={value.hydroDue} /></View>
          </View>
          <View style={styles.twoColumn}>
            <View style={styles.half}><DateField label="Last visual (VIP)" onChange={(lastVisual) => update({ lastVisual, visualDue: addMonthsToDateOnly(lastVisual, VISUAL_INTERVAL_MONTHS) || value.visualDue })} value={value.lastVisual} /></View>
            <View style={styles.half}><DateField label="Visual due" onChange={(visualDue) => update({ visualDue })} value={value.visualDue} /></View>
          </View>
        </>
      ) : null}
    </>
  );
}

export default function CylinderWizard({ defaultSetupId, items = [], setups = [], onBack, onSave }) {
  const [cyl, setCyl] = useState(() => emptyState(defaultSetupId));
  const [step, setStep] = useState('setup');
  const [busy, setBusy] = useState(false);
  const update = (patch) => setCyl((current) => ({ ...current, ...patch }));
  const steps = isPair(cyl) && cyl.source === 'existing' ? LINK_STEPS : NEW_STEPS;
  const index = steps.indexOf(step);
  const goBack = () => (index <= 0 ? onBack() : setStep(steps[index - 1]));
  const goNext = () => {
    // Name suggestion follows the answers until the diver types their own.
    if (!cyl.nameEdited) update({ name: suggestedName(cyl, items) });
    setStep(steps[index + 1]);
  };
  const pairable = unpairedCylinders(items);
  const save = async () => {
    setBusy(true);
    try {
      await onSave(buildCylinderDrafts(cyl, items));
    } catch {
      setBusy(false);
    }
  };

  if (step === 'setup') {
    const chooseSetup = (setup) => {
      // Pre-select the matching dive setup (Single Tank / Doubles / Sidemount) unless the diver started from one.
      const match = setups.find((entry) => entry.type === SETUP_TYPE_FOR[setup]);
      update({ setup, ...(cyl.setupIdsTouched ? {} : { setupIds: match ? [match.id] : [] }), source: ['Doubles', 'Sidemount pair'].includes(setup) ? cyl.source : 'new' });
    };
    return (
      <StepShell body="How is this cylinder used? Each one keeps its own serial number and inspection dates; doubles and sidemount pairs stay linked as sets." count={steps.length} footer={<PrimaryButton disabled={!cyl.setup} label="Continue" onPress={goNext} />} index={index} onBack={goBack} title="Great, a cylinder">
        {SETUP_OPTIONS.map((option) => <AccessoryOptionRow body={option.body} key={option.value} label={option.label} onPress={() => chooseSetup(option.value)} selected={cyl.setup === option.value} />)}
        {cyl.setup === 'Doubles' ? <PillOptionRow label="How are they joined?" onChange={(manifold) => update({ manifold })} options={MANIFOLD_OPTIONS} value={cyl.manifold} /> : null}
        {isPair(cyl) && pairable.length >= 2 ? <PillOptionRow label="The two cylinders" onChange={(source) => update({ source, linkedIds: [] })} options={SOURCE_OPTIONS} value={cyl.source} /> : null}
      </StepShell>
    );
  }

  if (step === 'link') {
    const toggle = (id) => update({ linkedIds: cyl.linkedIds.includes(id) ? cyl.linkedIds.filter((entry) => entry !== id) : [...cyl.linkedIds, id].slice(-2) });
    return (
      <StepShell body="Pick the two cylinders that make up this set — the first you pick is the left one. They keep their own serials and inspection dates." count={steps.length} footer={<PrimaryButton disabled={cyl.linkedIds.length !== 2} label="Continue" onPress={goNext} />} index={index} onBack={goBack} title="Which cylinders?">
        {pairable.map((item) => {
          const position = cyl.linkedIds.indexOf(item.id);
          return <CheckRow checked={position !== -1} key={item.id} label={`${item.name}${position === 0 ? ' · left' : position === 1 ? ' · right' : ''}`} body={[item.capacity, item.material, item.serialNumber && `S/N ${item.serialNumber}`].filter(Boolean).join(' · ')} onPress={() => toggle(item.id)} />;
        })}
      </StepShell>
    );
  }

  if (step === 'cylinder') {
    const presets = CYLINDER_PRESETS.filter((preset) => !cyl.material || preset.material === cyl.material);
    const pickPreset = (preset) => update({ preset: preset.label, material: preset.material, capacity: presetCapacity(preset), pressure: presetPressure(preset) });
    return (
      <StepShell body={isPair(cyl) ? 'Describe one cylinder — sets are almost always a matched pair. Serial numbers come later.' : 'What it’s made of, how big it is, and its rated working pressure.'} count={steps.length} footer={<PrimaryButton disabled={!cyl.material} label="Continue" onPress={goNext} />} index={index} onBack={goBack} title="Material & size">
        <ChoiceGroup choices={CYLINDER_MATERIALS} label="Material" onChange={(material) => update({ material, preset: CYLINDER_PRESETS.find((p) => p.label === cyl.preset)?.material === material ? cyl.preset : '' })} value={cyl.material} />
        <Text style={styles.pillLabel}>Common sizes</Text>
        <View style={styles.summaryStrip}>
          {presets.map((preset) => (
            <Pressable accessibilityRole="button" accessibilityState={{ selected: cyl.preset === preset.label }} key={preset.label} onPress={() => pickPreset(preset)} style={[styles.summaryChip, cyl.preset === preset.label && styles.yesNoButtonActive]}>
              <Text style={[styles.summaryChipText, cyl.preset === preset.label && styles.yesNoTextActive]}>{preset.label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.twoColumn}>
          <View style={styles.half}><FormField label="Size / capacity" maxLength={50} onChangeText={(capacity) => update({ capacity, preset: '' })} placeholder="80 cu ft / 11 L" value={cyl.capacity} /></View>
          <View style={styles.half}><FormField label="Working pressure" maxLength={50} onChangeText={(pressure) => update({ pressure, preset: '' })} placeholder="3000 psi / 207 bar" value={cyl.pressure} /></View>
        </View>
        <View style={styles.twoColumn}>
          <View style={styles.half}><FormField label="Cylinder maker" maxLength={100} onChangeText={(manufacturer) => update({ manufacturer })} placeholder="Luxfer, Faber…" value={cyl.manufacturer} /></View>
          <View style={styles.half}><FormField label="Model" maxLength={100} onChangeText={(model) => update({ model })} placeholder={cyl.preset || 'Optional'} value={cyl.model} /></View>
        </View>
      </StepShell>
    );
  }

  if (step === 'valve') {
    return (
      <StepShell body={cyl.setup === 'Doubles' ? 'The posts on both cylinders, and the manifold that joins them.' : cyl.setup === 'Sidemount pair' ? 'Both cylinders’ valves — sidemount sets usually use a matched left- and right-hand pair.' : 'How your regulator connects.'} count={steps.length} footer={<PrimaryButton disabled={!cyl.valve.type} label="Continue" onPress={goNext} />} index={index} onBack={goBack} title={isPair(cyl) ? 'Valves' : 'Valve'}>
        <ChoiceGroup choices={VALVE_TYPES} label="Valve type" onChange={(type) => update({ valve: { ...cyl.valve, type } })} value={cyl.valve.type} />
        <Text style={styles.stepBody}>DIN screws the regulator in; yoke clamps over the valve. A convertible (“pro”) valve is DIN with a removable insert, so it takes either.</Text>
        <View style={styles.twoColumn}>
          <View style={styles.half}><FormField label="Valve brand" maxLength={100} onChangeText={(manufacturer) => update({ valve: { ...cyl.valve, manufacturer } })} placeholder="Thermo, XS Scuba…" value={cyl.valve.manufacturer} /></View>
          <View style={styles.half}><FormField label="Valve model" maxLength={100} onChangeText={(model) => update({ valve: { ...cyl.valve, model } })} placeholder="Optional" value={cyl.valve.model} /></View>
        </View>
        {cyl.setup === 'Doubles' && cyl.manifold === 'manifold' ? (
          <View style={styles.twoColumn}>
            <View style={styles.half}><FormField label="Manifold brand" maxLength={100} onChangeText={(manufacturer) => update({ manifoldBrand: { ...cyl.manifoldBrand, manufacturer } })} placeholder="Optional" value={cyl.manifoldBrand.manufacturer} /></View>
            <View style={styles.half}><FormField label="Manifold model" maxLength={100} onChangeText={(model) => update({ manifoldBrand: { ...cyl.manifoldBrand, model } })} placeholder="Optional" value={cyl.manifoldBrand.model} /></View>
          </View>
        ) : null}
      </StepShell>
    );
  }

  if (step === 'look') {
    return (
      <StepShell body="Handy for spotting yours on a crowded boat or fill station." count={steps.length} footer={<PrimaryButton disabled={cyl.boot === null} label="Continue" onPress={goNext} />} index={index} onBack={goBack} title="Color & boot">
        <ChoiceGroup choices={[...CYLINDER_COLORS, 'Other']} label="Color" onChange={(color) => update({ color })} value={cyl.color} />
        {cyl.color === 'Other' ? <FormField label="Color" maxLength={40} onChangeText={(colorOther) => update({ colorOther })} placeholder="Describe it" value={cyl.colorOther} /> : null}
        <Text style={styles.pillLabel}>{isPair(cyl) ? 'Tank boots?' : 'Tank boot?'}</Text>
        <YesNoRow onChange={(boot) => update({ boot })} value={cyl.boot} />
        {cyl.boot ? <FormField label="Boot color" maxLength={40} onChangeText={(bootColor) => update({ bootColor })} placeholder="Optional" value={cyl.bootColor} /> : null}
      </StepShell>
    );
  }

  if (step === 'identify') {
    const labels = sideLabels(cyl);
    const setCylinder = (i, value) => update({ cylinders: cyl.cylinders.map((entry, j) => (j === i ? value : entry)) });
    return (
      <StepShell body="Each cylinder is tracked on its own. Enter the last hydro and visual dates from the stamp and sticker — due dates fill in (hydro every 5 years, visual yearly, as in the US). Change them if your local rules differ." count={steps.length} footer={<PrimaryButton label="Continue" onPress={goNext} />} index={index} onBack={goBack} title={isPair(cyl) ? 'Serials & inspections' : 'Serial & inspections'}>
        <FormField autoCapitalize="words" label={isPair(cyl) ? 'Set name' : 'Name'} maxLength={120} onChangeText={(name) => update({ name, nameEdited: true })} placeholder={suggestedName(cyl, items)} value={cyl.name} />
        {isPair(cyl) ? (
          <>
            <Text style={styles.pillLabel}>Inspection dates</Text>
            <PillOptionRow onChange={(sameDates) => update({ sameDates })} options={[{ value: true, label: 'Same for both' }, { value: false, label: 'Different' }]} value={cyl.sameDates} />
          </>
        ) : null}
        {labels.map((label, i) => (
          <View key={label} style={styles.extraPart}>
            <Text style={[styles.extraPartTitle, { marginBottom: 12 }]}>{label}</Text>
            <InspectionFields onChange={(value) => setCylinder(i, value)} showDates={i === 0 || !cyl.sameDates} value={cyl.cylinders[i]} />
          </View>
        ))}
      </StepShell>
    );
  }

  // step === 'details'
  const linking = isPair(cyl) && cyl.source === 'existing';
  return (
    <StepShell body="Optional — fill in now, or later from the item’s page." count={steps.length} footer={<PrimaryButton disabled={busy} label={busy ? 'Saving…' : isPair(cyl) ? 'Save cylinder set' : 'Save cylinder'} onPress={save} />} index={index} onBack={goBack} title="Almost done">
      {linking ? (
        <>
          <FormField autoCapitalize="words" label="Set name" maxLength={120} onChangeText={(name) => update({ name, nameEdited: true })} placeholder={suggestedName(cyl, items)} value={cyl.name} />
          {cyl.setup === 'Doubles' && cyl.manifold === 'manifold' ? (
            <View style={styles.twoColumn}>
              <View style={styles.half}><FormField label="Manifold brand" maxLength={100} onChangeText={(manufacturer) => update({ manifoldBrand: { ...cyl.manifoldBrand, manufacturer } })} placeholder="Optional" value={cyl.manifoldBrand.manufacturer} /></View>
              <View style={styles.half}><FormField label="Manifold model" maxLength={100} onChangeText={(model) => update({ manifoldBrand: { ...cyl.manifoldBrand, model } })} placeholder="Optional" value={cyl.manifoldBrand.model} /></View>
            </View>
          ) : null}
        </>
      ) : <SummaryStrip chips={cylinderChips(cyl)} />}
      <SetupPicker onChange={(setupIds) => update({ setupIds, setupIdsTouched: true })} selectedIds={cyl.setupIds} setups={setups} />
      {!linking ? (
        <>
          <ChoiceGroup choices={GEAR_CONDITIONS} label="Current condition" onChange={(condition) => update({ condition })} value={cyl.condition} />
          <View style={styles.twoColumn}>
            <View style={styles.half}><DateField label="Purchase date" onChange={(purchaseDate) => update({ purchaseDate })} value={cyl.purchaseDate} /></View>
            <View style={styles.half}><FormField label="Purchase price" maxLength={40} onChangeText={(purchasePrice) => update({ purchasePrice })} placeholder="$0.00" value={cyl.purchasePrice} /></View>
          </View>
          <FormField label="Retailer / shop" maxLength={100} onChangeText={(retailer) => update({ retailer })} placeholder="Optional" value={cyl.retailer} />
        </>
      ) : null}
      <NotesField onChangeText={(notes) => update({ notes })} value={cyl.notes} />
      {!linking && isPair(cyl) ? <SecondaryButton label="Change the cylinder details" onPress={() => setStep('cylinder')} /> : null}
    </StepShell>
  );
}
