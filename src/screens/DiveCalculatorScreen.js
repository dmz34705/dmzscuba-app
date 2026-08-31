import { useMemo, useState } from 'react';
import { Keyboard, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader, SectionLabel } from '../components/AppShell';
import { Card, SecondaryButton } from '../components/Ui';
import { CALCULATOR_TABS } from '../features/calculator/calculatorTabs';
import useTankProfileSettings from '../features/calculator/useTankProfileSettings';
import { NUMBER_KEYBOARD_ACCESSORY_ID, usesNumberKeyboard } from '../lib/numberKeyboard';
import {
  METERS_TO_FEET,
  absolutePressure,
  bankedMixFill,
  bestMix,
  depthFromAbsolutePressure,
  equivalentAirDepth,
  equivalentNarcoticDepth,
  maximumOperatingDepth,
  observedRmvMetric,
  partialPressure,
  partialPressureBlend,
  pressureToBar,
  requiredGas,
  zhl16cSnapshot,
} from '../lib/diveCalculator';
import {
  CUBIC_FOOT_LITERS,
  PSI_PER_BAR,
  TANK_PRESETS,
  ratedCapacityFromWaterVolume,
  servicePressurePsiFromSettings,
  tankBasisText,
  tankCapacityLiters,
  waterVolumeFromRatedCapacity,
} from '../lib/tankProfiles';
import { colors, radii, spacing } from '../theme';

const valueOf = (value, fallback = 0) => {
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
};
const fixed = (value, places = 1) => Number.isFinite(value) ? value.toFixed(places) : '—';
const convertedDepth = (value, currentUnit, nextUnit) => {
  if (currentUnit === nextUnit) return value;
  const converted = nextUnit === 'ft' ? valueOf(value) * METERS_TO_FEET : valueOf(value) / METERS_TO_FEET;
  return fixed(converted, nextUnit === 'ft' ? 0 : 1);
};

function UnitToggle({ unit, onChange, left = 'm', right = 'ft' }) {
  return (
    <View style={styles.unitRow}>
      <SecondaryButton label={left} onPress={() => onChange(left)} selected={unit === left} style={styles.unitButton} />
      <SecondaryButton label={right} onPress={() => onChange(right)} selected={unit === right} style={styles.unitButton} />
    </View>
  );
}

function Field({ label, value, onChangeText, suffix, helper, keyboardType = 'decimal-pad' }) {
  const hasNumberKeyboard = usesNumberKeyboard(keyboardType);

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputShell}>
        <TextInput
          accessibilityLabel={label}
          inputAccessoryViewID={hasNumberKeyboard ? NUMBER_KEYBOARD_ACCESSORY_ID : undefined}
          keyboardType={keyboardType}
          onChangeText={onChangeText}
          onSubmitEditing={hasNumberKeyboard ? Keyboard.dismiss : undefined}
          returnKeyType={hasNumberKeyboard ? 'done' : undefined}
          selectTextOnFocus
          style={styles.input}
          value={value}
        />
        {suffix ? <Text style={styles.inputSuffix}>{suffix}</Text> : null}
      </View>
      {helper ? <Text style={styles.fieldHelper}>{helper}</Text> : null}
    </View>
  );
}

function Result({ label, value, tone = 'normal' }) {
  return (
    <View style={styles.resultRow}>
      <Text style={styles.resultLabel}>{label}</Text>
      <Text style={[styles.resultValue, tone === 'warning' && styles.warningText, tone === 'good' && styles.goodText]}>{value}</Text>
    </View>
  );
}

function InstructionStep({ number, title, body, active = true }) {
  return (
    <View style={[styles.instructionStep, !active && styles.instructionStepMuted]}>
      <View style={[styles.stepNumber, !active && styles.stepNumberMuted]}><Text style={styles.stepNumberText}>{number}</Text></View>
      <View style={styles.stepCopy}>
        <Text style={styles.stepTitle}>{title}</Text>
        <Text style={styles.stepBody}>{body}</Text>
      </View>
    </View>
  );
}

function Formula({ children }) {
  return <Text style={styles.formula}>{children}</Text>;
}

function SectionCard({ title, subtitle, children }) {
  return (
    <Card style={styles.sectionCard}>
      <Text style={styles.cardTitle}>{title}</Text>
      {subtitle ? <Text style={styles.cardSubtitle}>{subtitle}</Text> : null}
      {children}
    </Card>
  );
}

function TankBasis({ profile }) {
  return (
    <View style={styles.tankBasis}>
      <Text style={styles.tankBasisLabel}>CALCULATION BASIS</Text>
      <Text style={styles.tankBasisText}>Based on {tankBasisText(profile)}.</Text>
    </View>
  );
}

function TankProfileCard({ settings, onChange, profile }) {
  const update = (key, value) => onChange({ ...settings, [key]: value });
  const servicePressurePsi = servicePressurePsiFromSettings(settings);
  const changeCustomSizeUnit = (nextUnit) => {
    if (nextUnit === settings.customSizeUnit) return;
    if (nextUnit === 'ft³') {
      const converted = ratedCapacityFromWaterVolume(settings.customWaterVolumeLiters, servicePressurePsi);
      onChange({ ...settings, customRatedCapacityCuFt: fixed(converted, 1), customSizeUnit: nextUnit });
      return;
    }
    const converted = waterVolumeFromRatedCapacity(settings.customRatedCapacityCuFt, servicePressurePsi);
    onChange({ ...settings, customSizeUnit: nextUnit, customWaterVolumeLiters: fixed(converted, 1) });
  };
  const changeServicePressureUnit = (nextUnit) => {
    if (nextUnit === settings.customServicePressureUnit) return;
    if (nextUnit === 'bar') {
      onChange({
        ...settings,
        customServicePressureBar: fixed(valueOf(settings.customServicePressurePsi) / PSI_PER_BAR, 1),
        customServicePressureUnit: nextUnit,
      });
      return;
    }
    onChange({
      ...settings,
      customServicePressurePsi: fixed(valueOf(settings.customServicePressureBar) * PSI_PER_BAR, 0),
      customServicePressureUnit: nextUnit,
    });
  };
  return (
    <SectionCard title="Saved cylinder" subtitle="Choose once and the calculator reuses this receiver tank in Blending and Gas Use.">
      <ScrollView horizontal contentContainerStyle={styles.tankChoices} showsHorizontalScrollIndicator={false}>
        {TANK_PRESETS.map((tank) => (
          <SecondaryButton
            key={tank.id}
            label={tank.name}
            onPress={() => update('selectedId', tank.id)}
            selected={settings.selectedId === tank.id}
            style={styles.tankChoice}
          />
        ))}
        <SecondaryButton label="Custom" onPress={() => update('selectedId', 'custom')} selected={settings.selectedId === 'custom'} style={styles.tankChoice} />
      </ScrollView>

      {settings.selectedId === 'custom' ? (
        <>
          <Field label="Tank name" value={settings.customName} onChangeText={(value) => update('customName', value)} keyboardType="default" />
          <View style={styles.cardHeadRow}>
            <Text style={styles.miniHeading}>Enter cylinder size as</Text>
            <UnitToggle unit={settings.customSizeUnit} onChange={changeCustomSizeUnit} left="L" right="ft³" />
          </View>
          {settings.customSizeUnit === 'L' ? (
            <Field label="Water volume" value={settings.customWaterVolumeLiters} onChangeText={(value) => update('customWaterVolumeLiters', value)} suffix="L" />
          ) : (
            <Field label="Rated capacity" value={settings.customRatedCapacityCuFt} onChangeText={(value) => update('customRatedCapacityCuFt', value)} suffix="ft³" />
          )}
          <View style={styles.cardHeadRow}>
            <Text style={styles.miniHeading}>Service pressure unit</Text>
            <UnitToggle unit={settings.customServicePressureUnit} onChange={changeServicePressureUnit} left="psi" right="bar" />
          </View>
          {settings.customServicePressureUnit === 'bar' ? (
            <Field label="Service pressure" value={settings.customServicePressureBar} onChangeText={(value) => update('customServicePressureBar', value)} suffix="bar" />
          ) : (
            <Field label="Service pressure" value={settings.customServicePressurePsi} onChangeText={(value) => update('customServicePressurePsi', value)} suffix="psi" />
          )}
          <Text style={styles.fieldHelper}>For a custom ft³ rating, water volume is estimated with the ideal pressure-volume relationship. Confirm the cylinder stamping or manufacturer specification before operational use.</Text>
        </>
      ) : null}

      <TankBasis profile={profile} />
      <Text style={styles.savedNote}>Saved on this device for the next calculation and app session.</Text>
    </SectionCard>
  );
}

function PressureCalculator({ defaultDepthUnit }) {
  const [unit, setUnit] = useState(defaultDepthUnit);
  const [depth, setDepth] = useState(defaultDepthUnit === 'ft' ? '100' : '30');
  const [pressure, setPressure] = useState('4');
  const pressureResult = absolutePressure(valueOf(depth), unit);
  const depthResult = depthFromAbsolutePressure(valueOf(pressure, 1), unit);
  const changeUnit = (nextUnit) => {
    setDepth(convertedDepth(depth, unit, nextUnit));
    setUnit(nextUnit);
  };

  return (
    <>
      <SectionCard title="Depth → absolute pressure" subtitle="Includes the 1 ATA of pressure already present at the surface.">
        <View style={styles.cardHeadRow}><View style={styles.flexOne}><Field label="Depth" value={depth} onChangeText={setDepth} suffix={unit} /></View><UnitToggle unit={unit} onChange={changeUnit} /></View>
        <Result label="Absolute pressure" value={`${fixed(pressureResult, 2)} ATA`} />
        <Formula>Pabs = depth ÷ {unit === 'm' ? '10' : '33'} + 1</Formula>
      </SectionCard>
      <SectionCard title="Absolute pressure → depth">
        <Field label="Absolute pressure" value={pressure} onChangeText={setPressure} suffix="ATA" />
        <Result label="Equivalent depth" value={`${fixed(depthResult, 1)} ${unit}`} />
      </SectionCard>
    </>
  );
}

function NitroxCalculator({ defaultDepthUnit, defaultPpO2, trimixMode }) {
  const [unit, setUnit] = useState(defaultDepthUnit);
  const [depth, setDepth] = useState(defaultDepthUnit === 'ft' ? '100' : '30');
  const [o2, setO2] = useState('32');
  const [helium, setHelium] = useState('0');
  const [limit, setLimit] = useState(defaultPpO2);
  const values = useMemo(() => {
    const depthValue = valueOf(depth);
    const o2Value = valueOf(o2);
    const pressure = absolutePressure(depthValue, unit);
    return {
      best: bestMix(depthValue, valueOf(limit, 1.4), unit),
      ead: equivalentAirDepth(depthValue, o2Value, unit),
      end: trimixMode ? equivalentNarcoticDepth(depthValue, valueOf(helium), unit) : null,
      mod: maximumOperatingDepth(o2Value, valueOf(limit, 1.4), unit),
      ppO2: partialPressure(o2Value, pressure),
      pressure,
    };
  }, [depth, helium, limit, o2, trimixMode, unit]);
  const overLimit = values.ppO2 > valueOf(limit, 1.4);
  const invalidMix = trimixMode && valueOf(o2) + valueOf(helium) > 100;
  const changeUnit = (nextUnit) => {
    setDepth(convertedDepth(depth, unit, nextUnit));
    setUnit(nextUnit);
  };

  return (
    <>
      <SectionCard title="Nitrox depth tools" subtitle="MOD defaults to the commonly used 1.4 ATA working limit.">
        <View style={styles.cardHeadRow}><View style={styles.flexOne}><Field label="Planned depth" value={depth} onChangeText={setDepth} suffix={unit} /></View><UnitToggle unit={unit} onChange={changeUnit} /></View>
        <View style={styles.twoColumn}>
          <Field label="Oxygen" value={o2} onChangeText={setO2} suffix="%" />
          <Field label="ppO₂ limit" value={limit} onChangeText={setLimit} suffix="ATA" />
          {trimixMode ? <Field label="Helium" value={helium} onChangeText={setHelium} suffix="%" /> : null}
        </View>
        <Result label="Pressure at depth" value={`${fixed(values.pressure, 2)} ATA`} />
        <Result label="ppO₂ at depth" value={`${fixed(values.ppO2, 2)} ATA`} tone={overLimit ? 'warning' : 'good'} />
        <Result label="Maximum operating depth" value={`${fixed(values.mod, 1)} ${unit}`} />
        <Result label="Best mix at selected limit" value={`${fixed(values.best, 1)}% O₂`} />
        {invalidMix ? <Text style={styles.inlineWarning}>Oxygen and helium cannot total more than 100%.</Text> : null}
        {overLimit ? <Text style={styles.inlineWarning}>Selected depth exceeds the chosen oxygen partial-pressure limit.</Text> : null}
      </SectionCard>
      <SectionCard title={trimixMode ? 'Equivalent depths' : 'Equivalent air depth'} subtitle={trimixMode ? 'END uses the common assumption that oxygen and nitrogen are narcotic while helium is not.' : 'EAD compares the nitrogen exposure of the selected nitrox mix with air.'}>
        <Result label="Equivalent air depth" value={`${fixed(values.ead, 1)} ${unit}`} />
        {trimixMode ? <Result label="Equivalent narcotic depth" value={`${fixed(values.end, 1)} ${unit}`} /> : null}
      </SectionCard>
    </>
  );
}

function BlendToolMenu({ onOpen }) {
  return (
    <>
      <SectionCard title="Partial-pressure blending" subtitle="Build nitrox with pure oxygen and an air top-off. Trimix steps appear only when Trimix mode is enabled.">
        <SecondaryButton label="Open partial-pressure calculator" onPress={() => onOpen('partial')} />
      </SectionCard>
      <SectionCard title="Banked-mix top-up" subtitle="Blend from a known premix bank, the analyzed gas already in the cylinder, and an air top-off.">
        <SecondaryButton label="Open banked top-up calculator" onPress={() => onOpen('banked')} />
      </SectionCard>
    </>
  );
}

function PartialPressureBlendCalculator({ tankSettings, onTankSettingsChange, tankProfile, defaultPressureUnit, trimixMode }) {
  const [pressureUnit, setPressureUnit] = useState(defaultPressureUnit);
  const servicePressure = defaultPressureUnit === 'psi' ? tankProfile.servicePressurePsi : tankProfile.servicePressurePsi / PSI_PER_BAR;
  const [startPressure, setStartPressure] = useState(defaultPressureUnit === 'psi' ? '725' : '50');
  const [targetPressure, setTargetPressure] = useState(fixed(servicePressure, defaultPressureUnit === 'psi' ? 0 : 1));
  const [startO2, setStartO2] = useState('21.0');
  const [targetO2, setTargetO2] = useState('32.0');
  const [startHe, setStartHe] = useState('0.0');
  const [targetHe, setTargetHe] = useState('0.0');
  const changePressureUnit = (nextUnit) => {
    if (nextUnit === pressureUnit) return;
    const factor = nextUnit === 'psi' ? PSI_PER_BAR : 1 / PSI_PER_BAR;
    const places = nextUnit === 'psi' ? 0 : 1;
    setStartPressure(fixed(valueOf(startPressure) * factor, places));
    setTargetPressure(fixed(valueOf(targetPressure) * factor, places));
    setPressureUnit(nextUnit);
  };
  const input = useMemo(() => ({
    startPressure: valueOf(startPressure), targetPressure: valueOf(targetPressure),
    startO2: valueOf(startO2), targetO2: valueOf(targetO2),
    startHe: trimixMode ? valueOf(startHe) : 0,
    targetHe: trimixMode ? valueOf(targetHe) : 0,
  }), [startHe, startO2, startPressure, targetHe, targetO2, targetPressure, trimixMode]);
  const blend = useMemo(() => partialPressureBlend(input), [input]);
  const places = pressureUnit === 'psi' ? 0 : 1;
  const formatPressure = (value) => `${fixed(value, places)} ${pressureUnit}`;
  const formatGas = (liters) => pressureUnit === 'psi' ? `${fixed(liters / CUBIC_FOOT_LITERS, 1)} ft³` : `${fixed(liters, 0)} L`;
  const gasAt = (pressureDelta) => pressureToBar(pressureDelta, pressureUnit) * tankProfile.waterVolumeLiters;

  const needsBleed = blend.feasible && blend.bleedToPressure !== null;
  const usesOxygen = blend.feasible && blend.oxygenAdded > 0.05;
  const usesHelium = blend.feasible && trimixMode && blend.heliumAdded > 0.05;
  const usesAir = blend.feasible && blend.airAdded > 0.05;

  const steps = blend.feasible ? [
    {
      title: needsBleed ? 'Drain the cylinder' : 'Keep the current gas',
      body: needsBleed
        ? `Drain from ${formatPressure(valueOf(startPressure))} down to ${formatPressure(blend.retainedPressure)}.`
        : `No bleed is required. Begin at ${formatPressure(blend.retainedPressure)}.`,
      active: needsBleed,
    },
    {
      title: usesOxygen ? 'Add pure oxygen' : 'No pure oxygen needed',
      body: usesOxygen
        ? `Add pure O₂ from ${formatPressure(blend.retainedPressure)} up to ${formatPressure(blend.oxygenFillPressure)}.`
        : 'The selected target does not require added oxygen.',
      active: usesOxygen,
    },
    ...(trimixMode ? [{
      title: usesHelium ? 'Add pure helium' : 'No helium needed',
      body: usesHelium
        ? `Add pure He from ${formatPressure(blend.oxygenFillPressure)} up to ${formatPressure(blend.topoffStartPressure)}.`
        : 'The selected target does not require added helium.',
      active: usesHelium,
    }] : []),
    {
      title: usesAir ? 'Top off with air' : 'Finish without an air top-off',
      body: usesAir
        ? `Add air from ${formatPressure(blend.topoffStartPressure)} to ${formatPressure(valueOf(targetPressure))}.`
        : `No air top-off is required; stop at ${formatPressure(valueOf(targetPressure))}.`,
      active: usesAir,
    },
  ] : [];

  return (
    <>
      <TankProfileCard settings={tankSettings} onChange={onTankSettingsChange} profile={tankProfile} />
      <SectionCard title={trimixMode ? 'Partial-pressure trimix blend' : 'Partial-pressure nitrox blend'} subtitle="Enter what's in the cylinder now and what you want after the fill.">
        <TankBasis profile={tankProfile} />
        <View style={styles.cardHeadRow}><Text style={styles.miniHeading}>Cylinder pressures</Text><UnitToggle unit={pressureUnit} onChange={changePressureUnit} left="bar" right="psi" /></View>

        <Text style={styles.resultGroupTitle}>WHAT IS IN THE CYLINDER NOW</Text>
        <View style={styles.twoColumn}>
          <Field label="Current pressure" value={startPressure} onChangeText={setStartPressure} suffix={pressureUnit} />
          <Field label="Current oxygen" value={startO2} onChangeText={setStartO2} suffix="%" />
          {trimixMode ? <Field label="Current helium" value={startHe} onChangeText={setStartHe} suffix="%" /> : null}
        </View>

        <Text style={styles.resultGroupTitle}>WHAT YOU WANT AFTER THE FILL</Text>
        <View style={styles.twoColumn}>
          <Field label="Final pressure" value={targetPressure} onChangeText={setTargetPressure} suffix={pressureUnit} />
          <Field label="Final oxygen" value={targetO2} onChangeText={setTargetO2} suffix="%" />
          {trimixMode ? <Field label="Final helium" value={targetHe} onChangeText={setTargetHe} suffix="%" /> : null}
        </View>

        {blend.feasible ? (
          <>
            <Text style={styles.resultGroupTitle}>FILL INSTRUCTIONS</Text>
            {steps.map((step, index) => (
              <InstructionStep key={`step-${index}`} number={String(index + 1)} title={step.title} body={step.body} active={step.active} />
            ))}

            <Text style={styles.resultGroupTitle}>CHECK THE RESULT</Text>
            <Result label="Final calculated mix" value={trimixMode ? `${fixed(valueOf(targetO2), 1)}% O₂ / ${fixed(valueOf(targetHe), 1)}% He` : `EAN${fixed(valueOf(targetO2), 1)}`} tone="good" />
            <Result label="Oxygen added" value={`${formatPressure(blend.oxygenAdded)} · ${formatGas(gasAt(blend.oxygenAdded))}`} />
            {trimixMode ? <Result label="Helium added" value={`${formatPressure(blend.heliumAdded)} · ${formatGas(gasAt(blend.heliumAdded))}`} /> : null}
            <Result label="Air added" value={`${formatPressure(blend.airAdded)} · ${formatGas(gasAt(blend.airAdded))}`} />
            {needsBleed ? <Result label="Gas vented" value={`${formatPressure(valueOf(startPressure) - blend.retainedPressure)} · ${formatGas(gasAt(valueOf(startPressure) - blend.retainedPressure))}`} tone="warning" /> : null}
            <Result label="Gas in cylinder at target" value={formatGas(gasAt(valueOf(targetPressure)))} />
          </>
        ) : <Text style={styles.inlineWarning}>{blend.reason}</Text>}
        <Text style={styles.independentNote}>Fill-sequence pressures are independent of cylinder size. The gas quantities above use the selected cylinder.</Text>
      </SectionCard>
      <Text style={styles.technicalNote}>Ideal, isothermal estimate only. Analyze the final cylinder after it cools. Actual blending requires appropriate training, oxygen-clean equipment where required, compatible hardware, and calibrated gas analysis.</Text>
    </>
  );
}

function BankedMixCalculator({ tankSettings, onTankSettingsChange, tankProfile, defaultPressureUnit, trimixMode }) {
  const [pressureUnit, setPressureUnit] = useState(defaultPressureUnit);
  const servicePressure = defaultPressureUnit === 'psi' ? tankProfile.servicePressurePsi : tankProfile.servicePressurePsi / PSI_PER_BAR;
  const [startPressure, setStartPressure] = useState(defaultPressureUnit === 'psi' ? '725' : '50');
  const [targetPressure, setTargetPressure] = useState(fixed(servicePressure, defaultPressureUnit === 'psi' ? 0 : 1));
  const [startO2, setStartO2] = useState('32.0');
  const [targetO2, setTargetO2] = useState('32.0');
  const [bankO2, setBankO2] = useState('36.0');
  const [startHe, setStartHe] = useState('0.0');
  const [targetHe, setTargetHe] = useState('0.0');
  const [bankHe, setBankHe] = useState('0.0');
  const changePressureUnit = (nextUnit) => {
    if (nextUnit === pressureUnit) return;
    const factor = nextUnit === 'psi' ? PSI_PER_BAR : 1 / PSI_PER_BAR;
    const places = nextUnit === 'psi' ? 0 : 1;
    setStartPressure(fixed(valueOf(startPressure) * factor, places));
    setTargetPressure(fixed(valueOf(targetPressure) * factor, places));
    setPressureUnit(nextUnit);
  };
  const result = useMemo(() => bankedMixFill({
    bankHe: trimixMode ? valueOf(bankHe) : 0,
    bankO2: valueOf(bankO2),
    pressureUnit,
    receiverVolumeLiters: tankProfile.waterVolumeLiters,
    startHe: trimixMode ? valueOf(startHe) : 0,
    startO2: valueOf(startO2),
    startPressure: valueOf(startPressure),
    targetHe: trimixMode ? valueOf(targetHe) : 0,
    targetO2: valueOf(targetO2),
    targetPressure: valueOf(targetPressure),
  }), [bankHe, bankO2, pressureUnit, startHe, startO2, startPressure, tankProfile.waterVolumeLiters, targetHe, targetO2, targetPressure, trimixMode]);
  const places = pressureUnit === 'psi' ? 0 : 1;
  const formatPressure = (value) => `${fixed(value, places)} ${pressureUnit}`;
  const formatGas = (liters) => pressureUnit === 'psi' ? `${fixed(liters / CUBIC_FOOT_LITERS, 1)} ft³` : `${fixed(liters, 0)} L`;
  const bankLabel = trimixMode ? `${fixed(valueOf(bankO2), 1)}% O₂ / ${fixed(valueOf(bankHe), 1)}% He` : `EAN${fixed(valueOf(bankO2), 1)}`;
  const needsBleed = result.feasible && result.bleedAmount > 0.05;
  const usesBank = result.feasible && result.bankAddedPressure > 0.05;
  const usesAir = result.feasible && result.airAddedPressure > 0.05;

  return (
    <>
      <TankProfileCard settings={tankSettings} onChange={onTankSettingsChange} profile={tankProfile} />
      <SectionCard title="Banked-mix top-up" subtitle="Enter the analyzed current gas, the desired final gas, and the analyzed bank mix.">
        <TankBasis profile={tankProfile} />
        <View style={styles.cardHeadRow}><Text style={styles.miniHeading}>Cylinder pressures</Text><UnitToggle unit={pressureUnit} onChange={changePressureUnit} left="bar" right="psi" /></View>

        <Text style={styles.resultGroupTitle}>WHAT IS IN THE CYLINDER NOW</Text>
        <View style={styles.twoColumn}>
          <Field label="Current pressure" value={startPressure} onChangeText={setStartPressure} suffix={pressureUnit} />
          <Field label="Current oxygen" value={startO2} onChangeText={setStartO2} suffix="%" />
          {trimixMode ? <Field label="Current helium" value={startHe} onChangeText={setStartHe} suffix="%" /> : null}
        </View>

        <Text style={styles.resultGroupTitle}>WHAT YOU WANT AFTER THE FILL</Text>
        <View style={styles.twoColumn}>
          <Field label="Final pressure" value={targetPressure} onChangeText={setTargetPressure} suffix={pressureUnit} />
          <Field label="Final oxygen" value={targetO2} onChangeText={setTargetO2} suffix="%" />
          {trimixMode ? <Field label="Final helium" value={targetHe} onChangeText={setTargetHe} suffix="%" /> : null}
        </View>

        <Text style={styles.resultGroupTitle}>ANALYZED BANK MIX</Text>
        <View style={styles.twoColumn}>
          <Field label="Bank oxygen" value={bankO2} onChangeText={setBankO2} suffix="%" helper="Enter tenths, such as 36.4" />
          {trimixMode ? <Field label="Bank helium" value={bankHe} onChangeText={setBankHe} suffix="%" helper="Enter the analyzed value" /> : null}
        </View>

        {result.feasible ? (
          <>
            <Text style={styles.resultGroupTitle}>FILL INSTRUCTIONS</Text>
            <InstructionStep number="1" title={needsBleed ? 'Drain the cylinder' : 'Keep the current gas'} body={needsBleed ? `Drain from ${formatPressure(valueOf(startPressure))} to ${formatPressure(result.bleedToPressure)}.` : `No bleed is required. Begin at ${formatPressure(result.bleedToPressure)}.`} active={needsBleed} />
            <InstructionStep number="2" title={usesBank ? `Add ${bankLabel} from the bank` : 'No banked mix required'} body={usesBank ? `Fill with the banked mix until the cylinder gauge reaches ${formatPressure(result.bankFillPressure)}.` : `The selected target does not require any ${bankLabel}.`} active={usesBank} />
            <InstructionStep number="3" title={usesAir ? 'Top off with air' : 'Finish at the bank fill pressure'} body={usesAir ? `Add air from ${formatPressure(result.bankFillPressure)} to ${formatPressure(valueOf(targetPressure))}.` : `No air top-off is required; stop at ${formatPressure(valueOf(targetPressure))}.`} active={usesAir} />

            <Text style={styles.resultGroupTitle}>CHECK THE RESULT</Text>
            <Result label="Final calculated mix" value={trimixMode ? `${fixed(result.finalO2Percent, 1)}% O₂ / ${fixed(result.finalHePercent, 1)}% He` : `EAN${fixed(result.finalO2Percent, 1)}`} tone="good" />
            <Result label="Bank mix added" value={`${formatPressure(result.bankAddedPressure)} · ${formatGas(result.bankSurfaceLiters)}`} />
            <Result label="Air added" value={`${formatPressure(result.airAddedPressure)} · ${formatGas(result.airSurfaceLiters)}`} />
            {needsBleed ? <Result label="Gas vented" value={`${formatPressure(result.bleedAmount)} · ${formatGas(result.ventedSurfaceLiters)}`} tone="warning" /> : null}
            <Result label="Gas in cylinder at target" value={formatGas(result.finalSurfaceLiters)} />
          </>
        ) : <Text style={styles.inlineWarning}>{result.reason}</Text>}
        <Text style={styles.independentNote}>Cylinder size determines the gas quantities shown above. Bank size is not needed for the blend steps; the bank supply must still have enough pressure to reach the indicated fill-to pressure.</Text>
      </SectionCard>
      <Text style={styles.technicalNote}>Ideal, isothermal estimate only. Analyze the final cylinder after it cools. Actual blending requires appropriate training, oxygen-clean equipment where required, compatible hardware, and calibrated gas analysis.</Text>
    </>
  );
}

function BlendCalculator({ tankSettings, onTankSettingsChange, tankProfile, defaultPressureUnit, trimixMode }) {
  const [tool, setTool] = useState(null);
  if (!tool) return <BlendToolMenu onOpen={setTool} />;
  return (
    <>
      <SecondaryButton label="← All blending calculators" onPress={() => setTool(null)} style={styles.blendBackButton} />
      {tool === 'partial' ? (
        <PartialPressureBlendCalculator tankSettings={tankSettings} onTankSettingsChange={onTankSettingsChange} tankProfile={tankProfile} defaultPressureUnit={defaultPressureUnit} trimixMode={trimixMode} />
      ) : (
        <BankedMixCalculator tankSettings={tankSettings} onTankSettingsChange={onTankSettingsChange} tankProfile={tankProfile} defaultPressureUnit={defaultPressureUnit} trimixMode={trimixMode} />
      )}
    </>
  );
}

function GasCalculator({ tankSettings, onTankSettingsChange, tankProfile, defaultDepthUnit, defaultPressureUnit, defaultGasVolumeUnit, defaultRmv }) {
  const [unit, setUnit] = useState(defaultDepthUnit);
  const [pressureUnit, setPressureUnit] = useState(defaultPressureUnit);
  const [gasVolumeUnit, setGasVolumeUnit] = useState(defaultGasVolumeUnit);
  const [startPressure, setStartPressure] = useState(defaultPressureUnit === 'psi' ? '2901' : '200');
  const [endPressure, setEndPressure] = useState(defaultPressureUnit === 'psi' ? '1740' : '120');
  const [time, setTime] = useState('20');
  const [averageDepth, setAverageDepth] = useState(defaultDepthUnit === 'ft' ? '60' : '18');
  const [plannedRmv, setPlannedRmv] = useState(defaultGasVolumeUnit === 'ft³' ? fixed(valueOf(defaultRmv, 18) / CUBIC_FOOT_LITERS, 2) : defaultRmv);
  const [plannedDepth, setPlannedDepth] = useState(defaultDepthUnit === 'ft' ? '100' : '30');
  const [plannedTime, setPlannedTime] = useState('20');
  const [contingency, setContingency] = useState('50');
  const changePressureUnit = (nextUnit) => {
    if (nextUnit === pressureUnit) return;
    const factor = nextUnit === 'psi' ? PSI_PER_BAR : 1 / PSI_PER_BAR;
    const places = nextUnit === 'psi' ? 0 : 1;
    setStartPressure(fixed(valueOf(startPressure) * factor, places));
    setEndPressure(fixed(valueOf(endPressure) * factor, places));
    setPressureUnit(nextUnit);
  };
  const changeDepthUnit = (nextUnit) => {
    setAverageDepth(convertedDepth(averageDepth, unit, nextUnit));
    setPlannedDepth(convertedDepth(plannedDepth, unit, nextUnit));
    setUnit(nextUnit);
  };
  const changeGasVolumeUnit = (nextUnit) => {
    if (nextUnit === gasVolumeUnit) return;
    const converted = nextUnit === 'ft³' ? valueOf(plannedRmv) / CUBIC_FOOT_LITERS : valueOf(plannedRmv) * CUBIC_FOOT_LITERS;
    setPlannedRmv(fixed(converted, nextUnit === 'ft³' ? 2 : 1));
    setGasVolumeUnit(nextUnit);
  };
  const observed = observedRmvMetric({
    tankWaterVolumeLiters: tankProfile.waterVolumeLiters,
    startBar: pressureToBar(valueOf(startPressure), pressureUnit),
    endBar: pressureToBar(valueOf(endPressure), pressureUnit),
    timeMinutes: valueOf(time),
    averageDepth: valueOf(averageDepth),
    depthUnit: unit,
  });
  const plannedRmvLiters = gasVolumeUnit === 'ft³' ? valueOf(plannedRmv) * CUBIC_FOOT_LITERS : valueOf(plannedRmv);
  const planned = requiredGas({ rmv: plannedRmvLiters, depth: valueOf(plannedDepth), timeMinutes: valueOf(plannedTime), depthUnit: unit, contingencyPercent: valueOf(contingency) });
  const selectedCapacityLiters = tankCapacityLiters(tankProfile);
  const plannedPressureBar = planned.totalGas / tankProfile.waterVolumeLiters;
  const plannedPressurePsi = plannedPressureBar * PSI_PER_BAR;
  const cylinderEquivalents = selectedCapacityLiters > 0 ? planned.totalGas / selectedCapacityLiters : 0;
  const volumeSuffix = gasVolumeUnit === 'ft³' ? 'ft³' : 'L';
  const rateSuffix = `${volumeSuffix}/min`;
  const formatVolume = (liters) => gasVolumeUnit === 'ft³' ? fixed(liters / CUBIC_FOOT_LITERS, 1) : fixed(liters, 0);
  const formatRate = (litersPerMinute) => gasVolumeUnit === 'ft³' ? fixed(litersPerMinute / CUBIC_FOOT_LITERS, 2) : fixed(litersPerMinute, 1);

  return (
    <>
      <TankProfileCard settings={tankSettings} onChange={onTankSettingsChange} profile={tankProfile} />
      <SectionCard title="Observed RMV" subtitle="Uses the selected cylinder water volume, pressure drop, average depth, and elapsed time.">
        <TankBasis profile={tankProfile} />
        <View style={styles.cardHeadRow}><Text style={styles.miniHeading}>Dive details</Text><UnitToggle unit={unit} onChange={changeDepthUnit} /></View>
        <View style={styles.cardHeadRow}><Text style={styles.miniHeading}>Cylinder pressures</Text><UnitToggle unit={pressureUnit} onChange={changePressureUnit} left="bar" right="psi" /></View>
        <View style={styles.cardHeadRow}><Text style={styles.miniHeading}>Gas volume and RMV</Text><UnitToggle unit={gasVolumeUnit} onChange={changeGasVolumeUnit} left="L" right="ft³" /></View>
        <View style={styles.twoColumn}>
          <Field label="Average depth" value={averageDepth} onChangeText={setAverageDepth} suffix={unit} />
          <Field label="Starting pressure" value={startPressure} onChangeText={setStartPressure} suffix={pressureUnit} />
          <Field label="Ending pressure" value={endPressure} onChangeText={setEndPressure} suffix={pressureUnit} />
          <Field label="Time" value={time} onChangeText={setTime} suffix="min" />
        </View>
        <Result label="Surface gas used" value={`${formatVolume(observed.surfaceLitersUsed)} ${volumeSuffix}`} />
        <Result label="Observed RMV" value={`${formatRate(observed.rmvLitersPerMinute)} ${rateSuffix}`} />
      </SectionCard>
      <SectionCard title="Required gas at depth" subtitle="Calculates respiratory gas demand, then adds the selected contingency.">
        <TankBasis profile={tankProfile} />
        <View style={styles.twoColumn}>
          <Field label="Planning RMV" value={plannedRmv} onChangeText={setPlannedRmv} suffix={rateSuffix} />
          <Field label="Average depth" value={plannedDepth} onChangeText={setPlannedDepth} suffix={unit} />
          <Field label="Time" value={plannedTime} onChangeText={setPlannedTime} suffix="min" />
          <Field label="Contingency" value={contingency} onChangeText={setContingency} suffix="%" />
        </View>
        <Result label="Base respiratory gas" value={`${formatVolume(planned.baseGas)} ${volumeSuffix}`} />
        <Result label="Gas with contingency" value={`${formatVolume(planned.totalGas)} ${volumeSuffix}`} tone="good" />
        <Result label="Selected-cylinder equivalents" value={`${fixed(cylinderEquivalents, 2)} tanks`} />
        <Result label="Ideal pressure equivalent" value={`${fixed(plannedPressureBar, 0)} bar / ${fixed(plannedPressurePsi, 0)} psi`} />
      </SectionCard>
    </>
  );
}

function DecoCalculator({ defaultDepthUnit, trimixMode }) {
  const [unit, setUnit] = useState(defaultDepthUnit);
  const [depth, setDepth] = useState(defaultDepthUnit === 'ft' ? '100' : '30');
  const [time, setTime] = useState('20');
  const [o2, setO2] = useState('32');
  const [helium, setHelium] = useState('0');
  const [gf, setGf] = useState('85');
  const heliumValue = trimixMode ? valueOf(helium) : 0;
  const invalidMix = valueOf(o2) + heliumValue > 100;
  const snapshot = useMemo(() => invalidMix ? null : zhl16cSnapshot({ depth: valueOf(depth), depthUnit: unit, bottomTime: valueOf(time), o2Percent: valueOf(o2), heliumPercent: heliumValue, gradientFactor: valueOf(gf, 85) }), [depth, gf, heliumValue, invalidMix, o2, time, unit]);
  const changeUnit = (nextUnit) => {
    setDepth(convertedDepth(depth, unit, nextUnit));
    setUnit(nextUnit);
  };

  return (
    <>
      <View style={styles.decoWarning}>
        <Text style={styles.decoWarningTitle}>EDUCATIONAL MODEL — NOT A DIVE PLAN</Text>
        <Text style={styles.decoWarningBody}>This is a single-segment ZH-L16C tissue snapshot. It does not generate stops or account for gas switches, repetitive dives, altitude, workload, individual physiology, or equipment failure.</Text>
      </View>
      <SectionCard title="ZH-L16C tissue snapshot" subtitle="Models descent at 18 m/min followed by the selected constant-depth segment. Water-vapor pressure is 0.0627 bar.">
        <View style={styles.cardHeadRow}><View style={styles.flexOne}><Field label="Depth" value={depth} onChangeText={setDepth} suffix={unit} /></View><UnitToggle unit={unit} onChange={changeUnit} /></View>
        <View style={styles.twoColumn}>
          <Field label="Time at depth" value={time} onChangeText={setTime} suffix="min" />
          <Field label="Gradient factor" value={gf} onChangeText={setGf} suffix="%" />
          <Field label="Oxygen" value={o2} onChangeText={setO2} suffix="%" />
          {trimixMode ? <Field label="Helium" value={helium} onChangeText={setHelium} suffix="%" /> : null}
        </View>
        {invalidMix || !snapshot ? <Text style={styles.inlineWarning}>Oxygen and helium cannot total more than 100%.</Text> : (
          <>
            <Result label="Ambient pressure" value={`${fixed(snapshot.bottomAmbient, 2)} bar`} />
            <Result label="ppO₂" value={`${fixed(snapshot.ppO2, 2)} bar`} tone={snapshot.ppO2 > 1.4 ? 'warning' : 'good'} />
            <Result label="Controlling compartment" value={`#${snapshot.controlling.compartment}`} />
            <Result label={`Raw ceiling at GF ${fixed(valueOf(gf), 0)}`} value={`${fixed(snapshot.ceiling, 1)} ${unit}`} tone={snapshot.ceiling > 0 ? 'warning' : 'normal'} />
            <Result label="Controlling inert tension" value={`${fixed(snapshot.controlling.inertPressure, 3)} bar`} />
            <Result label="M-value loading" value={`${fixed(snapshot.controlling.loadingPercent, 0)}%`} />
            {snapshot.ceiling > 0 ? <Text style={styles.inlineWarning}>A ceiling is indicated. This calculator intentionally does not provide a decompression schedule.</Text> : null}
          </>
        )}
      </SectionCard>
      <Text style={styles.technicalNote}>Never use this screen as the sole basis for a dive. Use appropriate training, a validated planner, a properly configured dive computer, analyzed gas, and conservative contingency planning.</Text>
    </>
  );
}

export default function DiveCalculatorScreen({ onBack, profileDefaults = {}, appSettings = {} }) {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState('pressure');
  const { profile: tankProfile, settings: tankSettings, setSettings: setTankSettings } = useTankProfileSettings();
  const defaultDepthUnit = appSettings.depthUnit === 'm' ? 'm' : 'ft';
  const defaultPressureUnit = appSettings.pressureUnit === 'bar' ? 'bar' : 'psi';
  const defaultGasVolumeUnit = appSettings.gasVolumeUnit === 'L' ? 'L' : 'ft³';
  const trimixMode = appSettings.trimixMode === true;
  const defaultPpO2 = String(profileDefaults.defaultPpO2 || '1.4');
  const defaultRmv = String(profileDefaults.defaultRmv || '18');

  return (
    <View style={styles.screen}>
      <ScreenHeader eyebrow="DMZ SCUBA TOOLS" title="Dive Calculator" onBack={onBack} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) + 28 }]} showsVerticalScrollIndicator={false}>
        <SectionLabel>CALCULATION WORKBENCH</SectionLabel>
        <Text style={styles.title}>Plan the numbers. Verify the dive.</Text>
        <Text style={styles.subtitle}>Pressure, nitrox, blending, gas-use, and Bühlmann foundation tools in one place.</Text>
        <View style={styles.calculatorMode}>
          <Text style={styles.calculatorModeLabel}>{trimixMode ? 'TRIMIX MODE' : 'RECREATIONAL NITROX MODE'}</Text>
          <Text style={styles.calculatorModeText}>{trimixMode ? 'Helium inputs are enabled.' : 'Helium inputs are hidden. Enable Trimix mode in App Settings when needed.'}</Text>
        </View>

        <ScrollView horizontal contentContainerStyle={styles.tabs} showsHorizontalScrollIndicator={false}>
          {CALCULATOR_TABS.map(({ key, label }) => <SecondaryButton key={key} label={label} onPress={() => setTab(key)} selected={tab === key} style={styles.tabButton} />)}
        </ScrollView>

        {tab === 'pressure' && <PressureCalculator defaultDepthUnit={defaultDepthUnit} />}
        {tab === 'nitrox' && <NitroxCalculator defaultDepthUnit={defaultDepthUnit} defaultPpO2={defaultPpO2} trimixMode={trimixMode} />}
        {tab === 'blend' && <BlendCalculator tankSettings={tankSettings} onTankSettingsChange={setTankSettings} tankProfile={tankProfile} defaultPressureUnit={defaultPressureUnit} trimixMode={trimixMode} />}
        {tab === 'gas' && <GasCalculator tankSettings={tankSettings} onTankSettingsChange={setTankSettings} tankProfile={tankProfile} defaultDepthUnit={defaultDepthUnit} defaultPressureUnit={defaultPressureUnit} defaultGasVolumeUnit={defaultGasVolumeUnit} defaultRmv={defaultRmv} />}
        {tab === 'deco' && <DecoCalculator defaultDepthUnit={defaultDepthUnit} trimixMode={trimixMode} />}

        <Text style={styles.footer}>All outputs are estimates. Analyze every cylinder and follow your training, agency standards, and dive computer.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  content: { paddingHorizontal: spacing.md, paddingTop: spacing.lg },
  title: { color: colors.text, fontSize: 29, fontWeight: '900', letterSpacing: -0.7, lineHeight: 33 },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 9 },
  calculatorMode: { backgroundColor: 'rgba(112,221,246,0.07)', borderColor: colors.line, borderRadius: radii.sm, borderWidth: 1, marginTop: 13, padding: 10 },
  calculatorModeLabel: { color: colors.cyan, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  calculatorModeText: { color: colors.muted, fontSize: 10, lineHeight: 15, marginTop: 3 },
  tabs: { gap: 7, paddingBottom: 18, paddingTop: 18 },
  tabButton: { minHeight: 39, paddingHorizontal: 13, paddingVertical: 8 },
  sectionCard: { padding: 15 },
  cardTitle: { color: colors.text, fontSize: 18, fontWeight: '900' },
  cardSubtitle: { color: colors.muted, fontSize: 12, lineHeight: 18, marginBottom: 14, marginTop: 5 },
  cardHeadRow: { alignItems: 'flex-end', flexDirection: 'row', gap: 10 },
  flexOne: { flex: 1 },
  unitRow: { flexDirection: 'row', gap: 5, marginBottom: 12 },
  unitButton: { minHeight: 39, minWidth: 48, paddingHorizontal: 10, paddingVertical: 7 },
  twoColumn: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  field: { flexGrow: 1, flexBasis: '46%', marginBottom: 12 },
  fieldLabel: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.4, marginBottom: 6, textTransform: 'uppercase' },
  inputShell: { alignItems: 'center', backgroundColor: colors.backgroundRaised, borderColor: colors.lineStrong, borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', minHeight: 47, paddingHorizontal: 11 },
  input: { color: colors.text, flex: 1, fontSize: 17, fontWeight: '800', paddingVertical: 10 },
  inputSuffix: { color: colors.cyan, fontSize: 11, fontWeight: '800', marginLeft: 7 },
  fieldHelper: { color: colors.faint, fontSize: 10, lineHeight: 14, marginTop: 4 },
  resultRow: { alignItems: 'center', borderTopColor: colors.line, borderTopWidth: 1, flexDirection: 'row', gap: 12, justifyContent: 'space-between', minHeight: 43, paddingVertical: 9 },
  resultLabel: { color: colors.muted, flex: 1, fontSize: 12, lineHeight: 17 },
  resultValue: { color: colors.text, fontSize: 15, fontWeight: '900', textAlign: 'right' },
  resultGroupTitle: { color: colors.cyan, fontSize: 10, fontWeight: '900', letterSpacing: 1.2, marginBottom: 4, marginTop: 12 },
  instructionStep: { alignItems: 'flex-start', backgroundColor: colors.backgroundRaised, borderColor: colors.lineStrong, borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: 11, marginBottom: 8, padding: 11 },
  instructionStepMuted: { opacity: 0.58 },
  stepNumber: { alignItems: 'center', backgroundColor: colors.cyan, borderRadius: 14, height: 28, justifyContent: 'center', width: 28 },
  stepNumberMuted: { backgroundColor: colors.faint },
  stepNumberText: { color: colors.background, fontSize: 12, fontWeight: '900' },
  stepCopy: { flex: 1 },
  stepTitle: { color: colors.text, fontSize: 13, fontWeight: '900' },
  stepBody: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 3 },
  warningText: { color: colors.warning },
  goodText: { color: colors.good },
  formula: { color: colors.faint, fontSize: 11, lineHeight: 16, marginTop: 10 },
  inlineWarning: { backgroundColor: 'rgba(255,179,106,0.1)', borderColor: 'rgba(255,179,106,0.38)', borderRadius: radii.sm, borderWidth: 1, color: colors.warning, fontSize: 12, lineHeight: 18, marginTop: 10, padding: 10 },
  miniHeading: { color: colors.text, flex: 1, fontSize: 13, fontWeight: '800', marginBottom: 18 },
  tankChoices: { gap: 7, paddingBottom: 13 },
  tankChoice: { minHeight: 39, minWidth: 65, paddingHorizontal: 12, paddingVertical: 8 },
  tankBasis: { backgroundColor: 'rgba(112,221,246,0.08)', borderColor: 'rgba(112,221,246,0.3)', borderRadius: radii.sm, borderWidth: 1, marginBottom: 12, padding: 11 },
  tankBasisLabel: { color: colors.cyan, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  tankBasisText: { color: colors.text, fontSize: 12, fontWeight: '700', lineHeight: 18, marginTop: 4 },
  savedNote: { color: colors.good, fontSize: 10, fontWeight: '700', lineHeight: 15, marginTop: 2 },
  independentNote: { color: colors.faint, fontSize: 10, lineHeight: 15, marginTop: 9 },
  blendBackButton: { marginBottom: 12 },
  technicalNote: { color: colors.faint, fontSize: 11, lineHeight: 17, marginBottom: 16, marginHorizontal: 7, textAlign: 'center' },
  decoWarning: { backgroundColor: 'rgba(226,27,35,0.12)', borderColor: 'rgba(255,100,105,0.48)', borderRadius: radii.md, borderWidth: 1, marginBottom: 12, padding: 13 },
  decoWarningTitle: { color: '#FF969A', fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  decoWarningBody: { color: '#E7C7CB', fontSize: 12, lineHeight: 18, marginTop: 6 },
  footer: { color: colors.faint, fontSize: 10, lineHeight: 16, marginHorizontal: 9, marginTop: 10, textAlign: 'center' },
});
