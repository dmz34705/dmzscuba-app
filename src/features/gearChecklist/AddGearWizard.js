import { useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { FormField as AccountFormField, ChoiceGroup } from '../../components/AccountForm';
import { ScreenHeader } from '../../components/AppShell';
import DateField from '../../components/DateField';
import { PrimaryButton, SecondaryButton } from '../../components/Ui';
import { colors, radii, spacing } from '../../theme';
import { NUMBER_KEYBOARD_ACCESSORY_ID } from '../../lib/numberKeyboard';
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
  UNDERGARMENT_INSULATION,
  UNDERGARMENT_STYLES,
  WETSUIT_CUTS,
  componentCanHaveSerial,
  createGearId,
  emptyGearComponent,
  emptyGearItem,
  updateServiceSchedule,
  undergarmentComponentTemplate,
} from './model';
import CylinderWizard from './CylinderWizard';
import { AccessoryOptionRow, CheckRow, LinkExistingItems, NotesField, PillOptionRow, SetupPicker, StepShell, SummaryStrip, YesNoRow, wizardStyles } from './wizardParts';

const styles = wizardStyles;
const FormField = (props) => <AccountFormField {...props} inputAccessoryViewID={NUMBER_KEYBOARD_ACCESSORY_ID} />;

// Ordered steps for the guided Regulator and BCD flows. "category" is handled by the picker screen above these lists.
// The Exposure suit flow branches on wetsuit vs. drysuit, so its steps are computed by exposureStepsFor() instead.
const REGULATOR_STEPS = ['basics', 'first-stage', 'second-stage', 'alternate', 'inflator', 'drysuit', 'spg', 'transmitter', 'extras', 'details'];
// Not every regulator lives on its own first stage: a full-face mask (OTS Guardian, Ocean Reef
// Neptune) has a built-in second stage and plugs into whichever first stage you're diving, and a
// spare second stage is stored on its own. They skip the first-stage and hose questions.
const REGULATOR_KINDS = [
  { value: 'set', label: 'Primary regulator set', body: 'A first stage with its second stages, hoses and gauges.' },
  { value: 'bailout', label: 'Pony / bailout regulator', body: 'A dedicated first and second stage for an independent emergency-gas cylinder.' },
  { value: 'stage', label: 'Stage / deco regulator', body: 'A dedicated regulator carried on a stage or decompression cylinder.' },
  { value: 'ffm', label: 'Full face mask', body: 'Built-in second stage that plugs into another regulator’s first stage — OTS Guardian, Ocean Reef, Kirby Morgan.' },
  { value: 'second', label: 'Second stage only', body: 'A spare or octo kept on its own, without a first stage.' },
];
const FFM_STEPS = ['basics', 'ffm-regulator', 'ffm-connection', 'ffm-comms', 'extras', 'details'];
const SECOND_ONLY_STEPS = ['basics', 'second-stage', 'extras', 'details'];
// A pony/bailout or stage regulator is a dedicated first stage, one second stage and pressure
// monitoring — not a primary set with an octo and buoyancy-inflation hoses.
const INDEPENDENT_GAS_STEPS = ['basics', 'first-stage', 'second-stage', 'spg', 'transmitter', 'extras', 'details'];
const regulatorStepsFor = (reg) => (reg.kind === 'ffm' ? FFM_STEPS : reg.kind === 'second' ? SECOND_ONLY_STEPS
  : ['bailout', 'stage'].includes(reg.kind) ? INDEPENDENT_GAS_STEPS : REGULATOR_STEPS);
const FFM_CONNECTIONS = ['Quick disconnect', 'LP hose to a first stage', 'Switch block / surface supply'];
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
    kind: 'set', floating: false,
    ffm: { connection: null, hoseLength: '', comms: { included: null, manufacturer: '', model: '', serialNumber: '' } },
    name: '', manufacturer: '', model: '',
    firstStage: { manufacturer: '', model: '', serialNumber: '' },
    secondStage: { manufacturer: '', model: '', serialNumber: '' },
    alternate: { included: null, manufacturer: '', model: '', serialNumber: '' },
    inflator: { included: null },
    drysuit: { included: null },
    spg: { included: null, manufacturer: '', model: '', serialNumber: '' },
    transmitter: { included: null, manufacturer: '', model: '', serialNumber: '', mount: null },
    extras: [],
    linkedIds: [],
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
  'ffm-regulator': 'secondStage',
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
  if (reg.kind === 'ffm' || reg.kind === 'second') return buildStandaloneRegulatorDraft(reg);
  const components = [
    { ...emptyGearComponent('Regulator', 'First stage'), id: createGearId('component'), name: 'First stage', manufacturer: reg.firstStage.manufacturer.trim(), model: reg.firstStage.model.trim(), serialNumber: reg.firstStage.serialNumber.trim() },
    { ...emptyGearComponent('Regulator', 'Primary second stage'), id: createGearId('component'), name: 'Primary second stage', manufacturer: reg.secondStage.manufacturer.trim(), model: reg.secondStage.model.trim(), serialNumber: reg.secondStage.serialNumber.trim() },
  ];
  if (reg.alternate.included) components.push({ ...emptyGearComponent('Regulator', 'Alternate second stage'), id: createGearId('component'), name: 'Alternate second stage', manufacturer: reg.alternate.manufacturer.trim(), model: reg.alternate.model.trim(), serialNumber: reg.alternate.serialNumber.trim() });
  if (reg.inflator.included) components.push({ ...emptyGearComponent('Regulator', 'Inflator hose'), id: createGearId('component'), name: 'BCD inflator hose' });
  if (reg.drysuit.included) components.push({ ...emptyGearComponent('Regulator', 'Drysuit hose'), id: createGearId('component'), name: 'Drysuit inflator hose' });
  if (reg.spg.included) components.push({ ...emptyGearComponent('Regulator', 'SPG / pressure gauge'), id: createGearId('component'), name: 'SPG', manufacturer: reg.spg.manufacturer.trim(), model: reg.spg.model.trim(), serialNumber: reg.spg.serialNumber.trim() });
  // A floating transmitter moves between regulators, so it's its own floating locker item rather
  // than a part of this one; a dedicated one stays a tracked part.
  let floatingTransmitter = null;
  if (reg.transmitter.included === 'floating') {
    const brandModel = [reg.transmitter.manufacturer.trim(), reg.transmitter.model.trim()].filter(Boolean).join(' ');
    floatingTransmitter = {
      ...emptyGearItem(), id: createGearId(), category: 'Transmitter', name: brandModel ? `${brandModel} transmitter` : 'Transmitter',
      manufacturer: reg.transmitter.manufacturer.trim(), model: reg.transmitter.model.trim(), serialNumber: reg.transmitter.serialNumber.trim(), floating: true,
      notes: reg.transmitter.mount === 'hose' ? 'Mounted on a short hose.' : reg.transmitter.mount === 'standalone' ? 'Standalone, screws directly into a first stage port.' : '',
      setupIds: reg.setupIds, currentSetupId: reg.setupIds[0] || '',
    };
  } else if (reg.transmitter.included) {
    const transmitterNotes = [
      reg.transmitter.mount === 'hose' ? 'Mounted on a short hose.' : reg.transmitter.mount === 'standalone' ? 'Standalone, screws directly into the first stage port.' : '',
    ].filter(Boolean).join(' ');
    components.push({ ...emptyGearComponent('Regulator', 'Wireless transmitter'), id: createGearId('component'), name: 'Wireless transmitter', manufacturer: reg.transmitter.manufacturer.trim(), model: reg.transmitter.model.trim(), serialNumber: reg.transmitter.serialNumber.trim(), notes: transmitterNotes });
  }
  reg.extras.forEach((extra) => {
    if (!extra.name.trim() && !extra.manufacturer.trim() && !extra.model.trim() && !(extra.serialNumber || '').trim()) return;
    components.push({ ...emptyGearComponent('Regulator', extra.type), id: extra.id, name: extra.name.trim() || extra.type, manufacturer: extra.manufacturer.trim(), model: extra.model.trim(), serialNumber: (extra.serialNumber || '').trim() });
  });

  const item = {
    ...emptyGearItem(),
    name: reg.name.trim(),
    category: 'Regulator',
    manufacturer: reg.manufacturer.trim() || reg.firstStage.manufacturer.trim(),
    model: reg.model.trim() || reg.firstStage.model.trim(),
    serialNumber: reg.serialNumber.trim(),
    condition: reg.condition,
    configuration: reg.kind === 'bailout' ? 'Pony / bailout' : reg.kind === 'stage' ? 'Stage / deco' : 'Single tank',
    isAssembly: true,
    components,
    floating: reg.floating, currentSetupId: reg.floating ? reg.setupIds[0] || '' : '',
    lastServiceDate: reg.lastServiceDate.trim(), nextServiceDate: reg.nextServiceDate.trim(), serviceIntervalMonths: reg.serviceIntervalMonths,
    purchaseDate: reg.purchaseDate.trim(), purchasePrice: reg.purchasePrice.trim(), retailer: reg.retailer.trim(), warrantyUntil: reg.warrantyUntil.trim(),
    notes: reg.notes.trim(),
    accessoryItemIds: reg.linkedIds,
    setupIds: reg.setupIds,
  };
  return { item, pendingAccessories: floatingTransmitter ? [floatingTransmitter] : [] };
}

// Full-face mask / second stage only: no first stage, hoses or SPG of its own.
function buildStandaloneRegulatorDraft(reg) {
  const ffm = reg.kind === 'ffm';
  const part = (type, name, fields = {}) => ({ ...emptyGearComponent('Regulator', type), id: createGearId('component'), name, ...fields });
  const components = ffm
    ? [
      part('Full face mask', 'Mask', { manufacturer: reg.manufacturer.trim(), model: reg.model.trim() }),
      part('Second stage', 'Built-in second stage', { manufacturer: reg.secondStage.manufacturer.trim(), model: reg.secondStage.model.trim(), serialNumber: reg.secondStage.serialNumber.trim() }),
      ...(reg.ffm.connection ? [part(reg.ffm.connection === 'Quick disconnect' ? 'Quick disconnect' : 'Breathing hose', reg.ffm.connection, { notes: reg.ffm.hoseLength.trim() ? `${reg.ffm.hoseLength.trim()} hose` : '' })] : []),
      ...(reg.ffm.comms.included ? [part('Communications unit', 'Comms unit', { manufacturer: reg.ffm.comms.manufacturer.trim(), model: reg.ffm.comms.model.trim(), serialNumber: reg.ffm.comms.serialNumber.trim() })] : []),
    ]
    : [part('Second stage', 'Second stage', { manufacturer: reg.secondStage.manufacturer.trim(), model: reg.secondStage.model.trim(), serialNumber: reg.secondStage.serialNumber.trim() })];
  reg.extras.forEach((extra) => {
    if (!extra.name.trim() && !extra.manufacturer.trim() && !extra.model.trim() && !(extra.serialNumber || '').trim()) return;
    components.push({ ...emptyGearComponent('Regulator', extra.type), id: extra.id, name: extra.name.trim() || extra.type, manufacturer: extra.manufacturer.trim(), model: extra.model.trim(), serialNumber: (extra.serialNumber || '').trim() });
  });
  const item = {
    ...emptyGearItem(),
    name: reg.name.trim(),
    category: 'Regulator',
    manufacturer: reg.manufacturer.trim() || reg.secondStage.manufacturer.trim(),
    model: reg.model.trim() || reg.secondStage.model.trim(),
    serialNumber: reg.serialNumber.trim(),
    condition: reg.condition,
    configuration: ffm ? 'Full face mask' : 'Second stage only',
    isAssembly: true,
    components,
    floating: reg.floating, currentSetupId: reg.floating ? reg.setupIds[0] || '' : '',
    lastServiceDate: reg.lastServiceDate.trim(), nextServiceDate: reg.nextServiceDate.trim(), serviceIntervalMonths: reg.serviceIntervalMonths,
    purchaseDate: reg.purchaseDate.trim(), purchasePrice: reg.purchasePrice.trim(), retailer: reg.retailer.trim(), warrantyUntil: reg.warrantyUntil.trim(),
    notes: reg.notes.trim(),
    accessoryItemIds: reg.linkedIds,
    setupIds: reg.setupIds,
  };
  return { item, pendingAccessories: [] };
}

// --- Drysuit undergarments ---------------------------------------------------------------------
// One-piece, two-piece or a layer system: each piece is a tracked part (the same "other parts"
// rows as the other flows, with a size), and pieces you already own can be linked instead.
const UNDERGARMENT_STYLE_OPTIONS = [
  { value: 'One-piece', label: 'One-piece', body: 'A single jumpsuit-style undersuit.' },
  { value: 'Two-piece', label: 'Two-piece', body: 'A separate top and bottom.' },
  { value: 'Layer system', label: 'Layer system', body: 'Base, mid and outer layers you combine for the water temperature.' },
];
const UNDERGARMENT_PART_TYPES = COMPONENT_TYPES.Undergarment.filter((type) => !['Heating system', 'Battery'].includes(type));
// Which drysuit it's worn with is picked per setup, so there's no drysuit step.
const UNDERGARMENT_STEPS = ['basics', 'style', 'insulation', 'pieces', 'heating', 'details'];

function emptyUndergarmentState(defaultSetupId) {
  return {
    name: '', manufacturer: '', model: '', size: '',
    style: null, insulation: null, insulationOther: '', weight: '',
    pieces: [], piecesTouched: false,
    heated: { included: null, manufacturer: '', model: '', battery: '' },
    linkedIds: [], floating: false,
    condition: GEAR_CONDITIONS[0], purchaseDate: '', purchasePrice: '', retailer: '', warrantyUntil: '', notes: '',
    setupIds: defaultSetupId ? [defaultSetupId] : [],
  };
}

// Pieces usually come from the same maker as the undersuit, so its brand carries over (still editable).
const piecesForStyle = (style, brand = '') => undergarmentComponentTemplate(style).map((piece) => ({ id: createGearId('component'), type: piece.type, name: piece.name, manufacturer: brand, manufacturerAuto: Boolean(brand), model: '', size: '' }));

function buildUndergarmentDraft(under) {
  const id = createGearId();
  const components = under.pieces
    .filter((piece) => piece.name.trim() || piece.manufacturer.trim() || piece.model.trim() || piece.size.trim() || (piece.serialNumber || '').trim())
    .map((piece) => ({ ...emptyGearComponent('Undergarment', piece.type), id: piece.id, name: piece.name.trim() || piece.type, manufacturer: piece.manufacturer.trim(), model: piece.model.trim(), serialNumber: (piece.serialNumber || '').trim(), notes: piece.size.trim() ? `Size ${piece.size.trim()}` : '' }));
  if (under.heated.included) {
    components.push({ ...emptyGearComponent('Undergarment', 'Heating system'), id: createGearId('component'), name: 'Heating system', manufacturer: under.heated.manufacturer.trim(), model: under.heated.model.trim() });
    if (under.heated.battery.trim()) components.push({ ...emptyGearComponent('Undergarment', 'Battery'), id: createGearId('component'), name: 'Battery', notes: under.heated.battery.trim() });
  }
  const item = {
    ...emptyGearItem(), id, name: under.name.trim(), category: 'Undergarment', manufacturer: under.manufacturer.trim(), model: under.model.trim(),
    configuration: under.style || '', size: under.size.trim(), material: under.insulation === 'Other' ? under.insulationOther.trim() : under.insulation || '',
    thickness: under.weight.trim(), isAssembly: components.length > 0, components, accessoryItemIds: under.linkedIds,
    floating: under.floating, currentSetupId: under.floating ? under.setupIds[0] || '' : '', condition: under.condition,
    purchaseDate: under.purchaseDate.trim(), purchasePrice: under.purchasePrice.trim(), retailer: under.retailer.trim(), warrantyUntil: under.warrantyUntil.trim(),
    notes: under.notes.trim(), setupIds: under.setupIds,
  };
  return { item, pendingAccessories: [] };
}

function undergarmentChips(under) {
  return [
    under.style || 'Style –',
    under.insulation ? `${under.insulation === 'Other' ? under.insulationOther || 'Other' : under.insulation}${under.weight.trim() ? ` · ${under.weight.trim()}` : ''}` : 'Insulation –',
    `${under.pieces.length} piece${under.pieces.length === 1 ? '' : 's'}${under.linkedIds.length ? ` + ${under.linkedIds.length} linked` : ''}`,
    `Heated ${under.heated.included ? '✓' : '–'}`,
  ];
}

function emptyBcdState(defaultSetupId) {
  return {
    name: '', manufacturer: '', model: '',
    style: null, size: '',
    weights: { included: null, pockets: '', trimPockets: null },
    altair: { included: null, manufacturer: '', model: '' },
    extras: [],
    linkedIds: [],
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
    if (!extra.name.trim() && !extra.manufacturer.trim() && !extra.model.trim() && !(extra.serialNumber || '').trim()) return;
    components.push({ ...emptyGearComponent('BCD', extra.type), id: extra.id, name: extra.name.trim() || extra.type, manufacturer: extra.manufacturer.trim(), model: extra.model.trim(), serialNumber: (extra.serialNumber || '').trim() });
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
    accessoryItemIds: bcd.linkedIds,
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
    hood: { included: null, mode: null, itemId: '', manufacturer: '', model: '', thickness: '' },
    gloves: { included: null, mode: null, itemId: '', manufacturer: '', model: '', thickness: '' },
    boots: { included: null, mode: null, itemId: '', manufacturer: '', model: '', size: '' },
    extras: [],
    linkedIds: [],
    serialNumber: '', condition: GEAR_CONDITIONS[0],
    lastServiceDate: '', nextServiceDate: '', serviceIntervalMonths: '',
    purchaseDate: '', purchasePrice: '', retailer: '', warrantyUntil: '', notes: '',
    setupIds: defaultSetupId ? [defaultSetupId] : [],
  };
}

// Hood/Gloves/Boots are real, independently-ownable gear categories — unlike a first stage or a
// suit's bladder, they shouldn't be re-described as a buried, un-browsable component every time
// they show up in a wizard. "existing" links the item you already own by id; "new" quick-creates
// a real standalone locker item (returned via pendingAccessories) and links that instead. Either
// way the link lives in accessoryItemIds, never as a components[] entry.
function accessoryLink(selection, category, extraFields) {
  if (!selection.included) return { accessoryItemId: null, pendingAccessory: null };
  if (selection.mode === 'existing' && selection.itemId) return { accessoryItemId: selection.itemId, pendingAccessory: null };
  const manufacturer = selection.manufacturer.trim();
  const model = selection.model.trim();
  // Assigned up front so the parent's accessoryItemIds is complete before saving — the parent and
  // every quick-added accessory then save together in one batch, with nothing to reconcile after.
  const id = createGearId();
  return {
    accessoryItemId: id,
    pendingAccessory: {
      ...emptyGearItem(), id, name: [manufacturer, model].filter(Boolean).join(' ') || category, category, manufacturer, model, ...extraFields,
    },
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
  exp.extras.forEach((extra) => {
    if (!extra.name.trim() && !extra.manufacturer.trim() && !extra.model.trim() && !(extra.serialNumber || '').trim()) return;
    components.push({ ...emptyGearComponent('Exposure suit', extra.type), id: extra.id, name: extra.name.trim() || extra.type, manufacturer: extra.manufacturer.trim(), model: extra.model.trim(), serialNumber: (extra.serialNumber || '').trim() });
  });

  const hoodLink = accessoryLink(exp.hood, 'Hood', { thickness: exp.hood.thickness.trim() });
  const glovesLink = accessoryLink(exp.gloves, 'Gloves', { thickness: exp.gloves.thickness.trim() });
  const bootsLink = accessoryLink(exp.boots, 'Boots', { size: exp.boots.size.trim() });
  const accessoryItemIds = [...new Set([hoodLink.accessoryItemId, glovesLink.accessoryItemId, bootsLink.accessoryItemId, ...exp.linkedIds].filter(Boolean))];
  const pendingAccessories = [hoodLink.pendingAccessory, glovesLink.pendingAccessory, bootsLink.pendingAccessory].filter(Boolean);

  const item = {
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
    accessoryItemIds,
    lastServiceDate: exp.lastServiceDate.trim(), nextServiceDate: exp.nextServiceDate.trim(), serviceIntervalMonths: exp.serviceIntervalMonths,
    purchaseDate: exp.purchaseDate.trim(), purchasePrice: exp.purchasePrice.trim(), retailer: exp.retailer.trim(), warrantyUntil: exp.warrantyUntil.trim(),
    notes: exp.notes.trim(),
    setupIds: exp.setupIds,
  };
  return { item, pendingAccessories };
}

function CategoryPicker({ onBack, onPick, onUseFullForm }) {
  return (
    <View style={styles.screen}>
      <ScreenHeader eyebrow="GEAR LOCKER" title="Add Gear" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.introTitle}>What are you adding?</Text>
        <Text style={styles.stepBody}>Pick a category. Regulators, BCDs, cylinders, exposure suits and undergarments walk through part by part — everything else opens ready to fill in.</Text>
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

const TRANSMITTER_MODE_OPTIONS = [{ value: true, label: 'Yes' }, { value: false, label: 'No' }, { value: 'floating', label: 'Floating' }];
const TRANSMITTER_MOUNT_OPTIONS = [{ value: 'hose', label: 'Short hose' }, { value: 'standalone', label: 'Standalone' }];

function regulatorChips(reg) {
  if (reg.kind === 'ffm') {
    return [
      'Full face mask',
      `Regulator${reg.secondStage.manufacturer || reg.secondStage.model ? ` · ${[reg.secondStage.manufacturer, reg.secondStage.model].filter(Boolean).join(' ')}` : ''}`,
      reg.ffm.connection ? `Connects · ${reg.ffm.connection}` : 'Connection –',
      `Comms ${reg.ffm.comms.included ? '✓' : '–'}`,
      ...(reg.extras.length ? [`${reg.extras.length} more part${reg.extras.length === 1 ? '' : 's'}`] : []),
    ];
  }
  if (reg.kind === 'second') return ['Second stage only', ...(reg.extras.length ? [`${reg.extras.length} more part${reg.extras.length === 1 ? '' : 's'}`] : [])];
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

function ExtraPartRow({ part, partTypes, onChange, onRemove, showSize = false }) {
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
      {showSize ? <FormField label="Size" maxLength={40} onChangeText={(value) => update('size', value)} placeholder="Optional" value={part.size || ''} /> : null}
      {componentCanHaveSerial(part.type) ? <FormField autoCapitalize="characters" label="Serial number" maxLength={120} onChangeText={(value) => update('serialNumber', value)} placeholder="Optional" value={part.serialNumber || ''} /> : null}
    </View>
  );
}

export default function AddGearWizard({ defaultSetupId, items, setups = [], onCancel, onPickOtherCategory, onSave }) {
  const [category, setCategory] = useState('');
  const [step, setStep] = useState('basics');
  const [reg, setReg] = useState(() => emptyRegulatorState(defaultSetupId));
  const [bcd, setBcd] = useState(() => emptyBcdState(defaultSetupId));
  const [exp, setExp] = useState(() => emptyExposureState(defaultSetupId));
  const [under, setUnder] = useState(() => emptyUndergarmentState(defaultSetupId));
  const [busy, setBusy] = useState(false);
  // Stepping Back from the first step of a guided flow drops you at the category picker so you
  // can change your mind about the category — but re-tapping the same category there resumes
  // the same draft rather than wiping it, since that's not a fresh start, just a detour.
  const regulatorStarted = useRef(false);
  const bcdStarted = useRef(false);
  const exposureStarted = useRef(false);
  const undergarmentStarted = useRef(false);

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
    if (nextCategory === 'Undergarment') {
      setCategory('Undergarment');
      setStep('basics');
      if (!undergarmentStarted.current) {
        setUnder(emptyUndergarmentState(defaultSetupId));
        undergarmentStarted.current = true;
      }
      return;
    }
    if (nextCategory === 'Cylinder / tank') {
      setCategory('Cylinder / tank');
      return;
    }
    onPickOtherCategory(nextCategory);
  };

  if (category === '') {
    return <CategoryPicker onBack={onCancel} onPick={pickCategory} onUseFullForm={() => onPickOtherCategory('')} />;
  }

  if (category === 'Undergarment') {
    // Any exposure suit that isn't a wetsuit — a drysuit added through the full form may not say "Drysuit".
    const steps = UNDERGARMENT_STEPS;
    const index = steps.indexOf(step);
    const goBack = () => (index <= 0 ? setCategory('') : setStep(steps[index - 1]));
    const goNext = () => setStep(steps[index + 1]);
    const updateUnder = (patch) => setUnder((current) => ({ ...current, ...patch }));
    // Picking a style fills in the pieces it usually comes in, until the diver edits them.
    const chooseStyle = (style) => updateUnder({ style, ...(under.piecesTouched ? {} : { pieces: piecesForStyle(style, under.manufacturer.trim()) }) });
    const save = async () => {
      setBusy(true);
      try {
        await onSave(buildUndergarmentDraft(under));
      } catch {
        setBusy(false);
      }
    };

    if (step === 'basics') {
      return (
        <StepShell body="The warm layers you wear under a drysuit. Give it a name you'll recognize — brand and model are optional." count={steps.length} footer={<PrimaryButton disabled={!under.name.trim()} label="Continue" onPress={goNext} />} index={index} onBack={goBack} title="Great, an undergarment">
          <FormField autoCapitalize="words" label="Name" maxLength={120} onChangeText={(name) => updateUnder({ name })} placeholder="Winter undersuit" value={under.name} />
          <View style={styles.twoColumn}>
            <View style={styles.half}><FormField label="Manufacturer" maxLength={100} onChangeText={(manufacturer) => updateUnder({ manufacturer })} placeholder="Fourth Element, Santi…" value={under.manufacturer} /></View>
            <View style={styles.half}><FormField label="Model" maxLength={100} onChangeText={(model) => updateUnder({ model })} placeholder="Optional" value={under.model} /></View>
          </View>
        </StepShell>
      );
    }

    if (step === 'style') {
      return (
        <StepShell body="How it's built — this sets up the pieces you'll track next." count={steps.length} footer={<PrimaryButton disabled={!under.style} label="Continue" onPress={goNext} />} index={index} onBack={goBack} title="One piece or several?">
          {UNDERGARMENT_STYLE_OPTIONS.map((option) => <AccessoryOptionRow body={option.body} key={option.value} label={option.label} onPress={() => chooseStyle(option.value)} selected={under.style === option.value} />)}
        </StepShell>
      );
    }

    if (step === 'insulation') {
      return (
        <StepShell body="What keeps you warm, and how heavy it is." count={steps.length} footer={<PrimaryButton label="Continue" onPress={goNext} />} index={index} onBack={goBack} title="Insulation">
          <ChoiceGroup choices={UNDERGARMENT_INSULATION} label="Insulation" onChange={(insulation) => updateUnder({ insulation })} value={under.insulation} />
          {under.insulation === 'Other' ? <FormField label="Insulation" maxLength={60} onChangeText={(insulationOther) => updateUnder({ insulationOther })} placeholder="Describe it" value={under.insulationOther} /> : null}
          <View style={styles.twoColumn}>
            <View style={styles.half}><FormField label="Weight / loft" maxLength={40} onChangeText={(weight) => updateUnder({ weight })} placeholder="e.g. 400 g" value={under.weight} /></View>
            <View style={styles.half}><FormField label="Size" maxLength={40} onChangeText={(size) => updateUnder({ size })} placeholder="e.g. M, L" value={under.size} /></View>
          </View>
        </StepShell>
      );
    }

    if (step === 'pieces') {
      const touch = (pieces) => updateUnder({ pieces, piecesTouched: true });
      const addPiece = () => touch([...under.pieces, { id: createGearId('component'), type: UNDERGARMENT_PART_TYPES[0], name: '', manufacturer: under.manufacturer.trim(), manufacturerAuto: Boolean(under.manufacturer.trim()), model: '', size: '' }]);
      return (
        <StepShell body={under.style === 'One-piece' ? 'Add anything worn with it — a vest, socks — or link pieces you already own.' : 'Each piece is tracked on its own. Rename them, add a size, add more (a vest, socks), or link pieces you already own.'} count={steps.length} footer={<PrimaryButton label="Continue" onPress={goNext} />} index={index} onBack={goBack} title="The pieces">
          {under.pieces.map((piece) => (
            <ExtraPartRow key={piece.id} onChange={(next) => touch(under.pieces.map((entry) => (entry.id === piece.id ? next : entry)))} onRemove={() => touch(under.pieces.filter((entry) => entry.id !== piece.id))} part={piece} partTypes={UNDERGARMENT_PART_TYPES} showSize />
          ))}
          <SecondaryButton label="Add another piece" onPress={addPiece} />
          <LinkExistingItems candidates={(items || []).filter((entry) => ['Undergarment', 'Accessories', 'Boots', 'Gloves', 'Hood'].includes(entry.category))} label="Or link pieces already in your locker" onChange={(linkedIds) => updateUnder({ linkedIds })} selectedIds={under.linkedIds} />
        </StepShell>
      );
    }

    if (step === 'heating') {
      const chooseHeated = (included) => {
        updateUnder({ heated: { ...under.heated, included } });
        if (included === false) goNext();
      };
      return (
        <StepShell body="A battery-heated vest or heating elements built into the undersuit — Santi, Thermalution, Venture Heat." count={steps.length} footer={<PrimaryButton disabled={under.heated.included === null} label="Continue" onPress={goNext} />} index={index} onBack={goBack} title="Heated?">
          <YesNoRow onChange={chooseHeated} value={under.heated.included} />
          {under.heated.included ? (
            <>
              <View style={styles.twoColumn}>
                <View style={styles.half}><FormField label="Heating brand" maxLength={100} onChangeText={(manufacturer) => updateUnder({ heated: { ...under.heated, manufacturer } })} placeholder="Optional" value={under.heated.manufacturer} /></View>
                <View style={styles.half}><FormField label="Model" maxLength={100} onChangeText={(model) => updateUnder({ heated: { ...under.heated, model } })} placeholder="Optional" value={under.heated.model} /></View>
              </View>
              <FormField label="Battery" maxLength={80} onChangeText={(battery) => updateUnder({ heated: { ...under.heated, battery } })} placeholder="e.g. 12 V 10 Ah canister" value={under.heated.battery} />
            </>
          ) : null}
        </StepShell>
      );
    }

    // step === 'details'
    return (
      <StepShell body="Optional — fill in now, or later from the item's page." count={steps.length} footer={<PrimaryButton disabled={busy} label={busy ? 'Saving…' : 'Save gear item'} onPress={save} />} index={index} onBack={goBack} title="Almost done">
        <SummaryStrip chips={undergarmentChips(under)} />
        <Text style={styles.stepBody}>You don't link it to a drysuit: any setup with a drysuit asks which undergarment to pack.</Text>
        <SetupPicker onChange={(setupIds) => updateUnder({ setupIds })} selectedIds={under.setupIds} setups={setups} />
        <CheckRow checked={under.floating} label="Floating item" body="Moves between setups; the locker tracks where it is." onPress={() => updateUnder({ floating: !under.floating })} />
        <ChoiceGroup choices={GEAR_CONDITIONS} label="Current condition" onChange={(condition) => updateUnder({ condition })} value={under.condition} />
        <View style={styles.twoColumn}>
          <View style={styles.half}><DateField label="Purchase date" onChange={(purchaseDate) => updateUnder({ purchaseDate })} value={under.purchaseDate} /></View>
          <View style={styles.half}><FormField label="Purchase price" maxLength={40} onChangeText={(purchasePrice) => updateUnder({ purchasePrice })} placeholder="$0.00" value={under.purchasePrice} /></View>
        </View>
        <FormField label="Retailer / shop" maxLength={100} onChangeText={(retailer) => updateUnder({ retailer })} placeholder="Optional" value={under.retailer} />
        <NotesField onChangeText={(notes) => updateUnder({ notes })} value={under.notes} />
      </StepShell>
    );
  }

  if (category === 'Cylinder / tank') {
    return <CylinderWizard defaultSetupId={defaultSetupId} items={items} onBack={() => setCategory('')} onSave={onSave} setups={setups} />;
  }

  if (category === 'BCD') {
    const index = BCD_STEPS.indexOf(step);
    const goBack = () => (index <= 0 ? setCategory('') : setStep(BCD_STEPS[index - 1]));
    const goNext = () => setStep(BCD_STEPS[index + 1]);
    const updateBcd = (patch) => setBcd((current) => ({ ...current, ...patch }));
    const updateBcdService = (patch) => setBcd((current) => updateServiceSchedule(current, patch));
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
        await onSave({ item: buildBcdDraft(bcd), pendingAccessories: [] });
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
          <LinkExistingItems candidates={(items || []).filter((entry) => entry.category !== 'BCD')} onChange={(linkedIds) => updateBcd({ linkedIds })} selectedIds={bcd.linkedIds} />
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
          <View style={styles.half}><DateField label="Last service" onChange={(value) => updateBcdService({ lastServiceDate: value })} value={bcd.lastServiceDate} /></View>
          <View style={styles.half}><DateField label="Next service" onChange={(value) => updateBcd({ nextServiceDate: value })} value={bcd.nextServiceDate} /></View>
        </View>
        <ChoiceGroup choices={SERVICE_INTERVALS.map((value) => value || 'None')} label="Repeat every (months)" onChange={(value) => updateBcdService({ serviceIntervalMonths: value === 'None' ? '' : value })} value={bcd.serviceIntervalMonths || 'None'} />
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
    const updateExpService = (patch) => setExp((current) => updateServiceSchedule(current, patch));
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
    const candidatesFor = (category) => (items || []).filter((candidate) => candidate.category === category);

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
      const candidates = candidatesFor('Hood');
      return (
        <StepShell body="Does this setup include a hood?" count={exposureSteps.length} footer={<PrimaryButton disabled={exp.hood.included === null || (exp.hood.included && !exp.hood.mode)} label="Continue" onPress={() => goNext()} />} index={index} onBack={goBack} title="Hood?">
          <YesNoRow onChange={chooseHood} value={exp.hood.included} />
          {exp.hood.included ? (
            <>
              <Text style={styles.pillLabel}>Which one?</Text>
              {candidates.map((candidate) => (
                <AccessoryOptionRow body={[candidate.manufacturer, candidate.model].filter(Boolean).join(' · ')} key={candidate.id} label={candidate.name} onPress={() => updateExp({ hood: { ...exp.hood, mode: 'existing', itemId: candidate.id } })} selected={exp.hood.mode === 'existing' && exp.hood.itemId === candidate.id} />
              ))}
              <AccessoryOptionRow label="Add a new hood" onPress={() => updateExp({ hood: { ...exp.hood, mode: 'new', itemId: '' } })} selected={exp.hood.mode === 'new'} />
              {exp.hood.mode === 'new' ? (
                <>
                  <View style={styles.twoColumn}>
                    <View style={styles.half}><FormField label="Manufacturer" maxLength={100} onChangeText={(value) => updateExp({ hood: { ...exp.hood, manufacturer: value } })} placeholder="Optional" value={exp.hood.manufacturer} /></View>
                    <View style={styles.half}><FormField label="Model" maxLength={100} onChangeText={(value) => updateExp({ hood: { ...exp.hood, model: value } })} placeholder="Optional" value={exp.hood.model} /></View>
                  </View>
                  <FormField label="Thickness" maxLength={40} onChangeText={(value) => updateExp({ hood: { ...exp.hood, thickness: value } })} placeholder="e.g. 5mm" value={exp.hood.thickness} />
                </>
              ) : null}
            </>
          ) : null}
        </StepShell>
      );
    }

    if (step === 'gloves') {
      const candidates = candidatesFor('Gloves');
      return (
        <StepShell body="Does this setup include gloves?" count={exposureSteps.length} footer={<PrimaryButton disabled={exp.gloves.included === null || (exp.gloves.included && !exp.gloves.mode)} label="Continue" onPress={() => goNext()} />} index={index} onBack={goBack} title="Gloves?">
          <YesNoRow onChange={chooseGloves} value={exp.gloves.included} />
          {exp.gloves.included ? (
            <>
              <Text style={styles.pillLabel}>Which one?</Text>
              {candidates.map((candidate) => (
                <AccessoryOptionRow body={[candidate.manufacturer, candidate.model].filter(Boolean).join(' · ')} key={candidate.id} label={candidate.name} onPress={() => updateExp({ gloves: { ...exp.gloves, mode: 'existing', itemId: candidate.id } })} selected={exp.gloves.mode === 'existing' && exp.gloves.itemId === candidate.id} />
              ))}
              <AccessoryOptionRow label="Add new gloves" onPress={() => updateExp({ gloves: { ...exp.gloves, mode: 'new', itemId: '' } })} selected={exp.gloves.mode === 'new'} />
              {exp.gloves.mode === 'new' ? (
                <>
                  <View style={styles.twoColumn}>
                    <View style={styles.half}><FormField label="Manufacturer" maxLength={100} onChangeText={(value) => updateExp({ gloves: { ...exp.gloves, manufacturer: value } })} placeholder="Optional" value={exp.gloves.manufacturer} /></View>
                    <View style={styles.half}><FormField label="Model" maxLength={100} onChangeText={(value) => updateExp({ gloves: { ...exp.gloves, model: value } })} placeholder="Optional" value={exp.gloves.model} /></View>
                  </View>
                  <FormField label="Thickness" maxLength={40} onChangeText={(value) => updateExp({ gloves: { ...exp.gloves, thickness: value } })} placeholder="e.g. 3mm" value={exp.gloves.thickness} />
                </>
              ) : null}
            </>
          ) : null}
        </StepShell>
      );
    }

    if (step === 'boots') {
      const candidates = candidatesFor('Boots');
      return (
        <StepShell body="Does this setup include boots?" count={exposureSteps.length} footer={<PrimaryButton disabled={exp.boots.included === null || (exp.boots.included && !exp.boots.mode)} label="Continue" onPress={() => goNext()} />} index={index} onBack={goBack} title="Boots?">
          <YesNoRow onChange={chooseBoots} value={exp.boots.included} />
          {exp.boots.included ? (
            <>
              <Text style={styles.pillLabel}>Which one?</Text>
              {candidates.map((candidate) => (
                <AccessoryOptionRow body={[candidate.manufacturer, candidate.model].filter(Boolean).join(' · ')} key={candidate.id} label={candidate.name} onPress={() => updateExp({ boots: { ...exp.boots, mode: 'existing', itemId: candidate.id } })} selected={exp.boots.mode === 'existing' && exp.boots.itemId === candidate.id} />
              ))}
              <AccessoryOptionRow label="Add new boots" onPress={() => updateExp({ boots: { ...exp.boots, mode: 'new', itemId: '' } })} selected={exp.boots.mode === 'new'} />
              {exp.boots.mode === 'new' ? (
                <>
                  <View style={styles.twoColumn}>
                    <View style={styles.half}><FormField label="Manufacturer" maxLength={100} onChangeText={(value) => updateExp({ boots: { ...exp.boots, manufacturer: value } })} placeholder="Optional" value={exp.boots.manufacturer} /></View>
                    <View style={styles.half}><FormField label="Model" maxLength={100} onChangeText={(value) => updateExp({ boots: { ...exp.boots, model: value } })} placeholder="Optional" value={exp.boots.model} /></View>
                  </View>
                  <FormField label="Size" maxLength={40} onChangeText={(value) => updateExp({ boots: { ...exp.boots, size: value } })} placeholder="Optional" value={exp.boots.size} />
                </>
              ) : null}
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
        ? 'Undergarments are picked per setup when you pack this drysuit (add them with the Undergarment wizard). Track any other layers here.'
        : 'Rashguards, underlayers, socks — anything else worth tracking as its own part.';
      return (
        <StepShell body={body} count={exposureSteps.length} footer={<PrimaryButton label="Continue" onPress={() => goNext()} />} index={index} onBack={goBack} title="Anything else?">
          {exp.extras.map((part) => <ExtraPartRow key={part.id} onChange={(next) => updateExtra(part.id, next)} onRemove={() => removeExtra(part.id)} part={part} partTypes={EXPOSURE_EXTRA_PART_TYPES} />)}
          <SecondaryButton label="Add another part" onPress={addExtra} />
          <LinkExistingItems candidates={(items || []).filter((entry) => !['Exposure suit', 'Undergarment'].includes(entry.category) && ![exp.hood.itemId, exp.gloves.itemId, exp.boots.itemId].includes(entry.id))} onChange={(linkedIds) => updateExp({ linkedIds })} selectedIds={exp.linkedIds} />
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
          <View style={styles.half}><DateField label="Last service" onChange={(value) => updateExpService({ lastServiceDate: value })} value={exp.lastServiceDate} /></View>
          <View style={styles.half}><DateField label="Next service" onChange={(value) => updateExp({ nextServiceDate: value })} value={exp.nextServiceDate} /></View>
        </View>
        <ChoiceGroup choices={SERVICE_INTERVALS.map((value) => value || 'None')} label="Repeat every (months)" onChange={(value) => updateExpService({ serviceIntervalMonths: value === 'None' ? '' : value })} value={exp.serviceIntervalMonths || 'None'} />
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

  const regSteps = regulatorStepsFor(reg);
  const index = regSteps.indexOf(step);
  const goBack = () => (index <= 0 ? setCategory('') : setStep(regSteps[index - 1]));
  const goNext = () => {
    const nextStep = regSteps[index + 1];
    setReg((current) => {
      const existing = manufacturerForStep(current, nextStep);
      if (existing === null || existing.trim()) return current;
      const brand = latestManufacturer(current);
      return brand ? applyManufacturer(current, nextStep, brand) : current;
    });
    setStep(nextStep);
  };
  const updateReg = (patch) => setReg((current) => ({ ...current, ...patch }));
  const updateRegService = (patch) => setReg((current) => updateServiceSchedule(current, patch));
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
      <StepShell body="What kind is it? Then give it a name you'll recognize in your locker." count={regSteps.length} footer={<PrimaryButton disabled={!canContinue} label="Continue" onPress={goNext} />} index={index} onBack={goBack} title="Great, a regulator">
        {REGULATOR_KINDS.map((kind) => (
          // Anything without its own first stage (a full-face mask, a spare second stage) usually moves
          // between rigs, so it starts out floating — changeable on the last step.
          <AccessoryOptionRow body={kind.body} key={kind.value} label={kind.label} onPress={() => updateReg({ kind: kind.value, floating: kind.value !== 'set' })} selected={reg.kind === kind.value} />
        ))}
        <FormField autoCapitalize="words" label="Name" maxLength={120} onChangeText={(value) => updateReg({ name: value })} placeholder={reg.kind === 'ffm' ? 'Guardian full face mask' : reg.kind === 'second' ? 'Spare second stage' : 'Primary regulator'} value={reg.name} />
        <View style={styles.twoColumn}>
          <View style={styles.half}><FormField label="Manufacturer" maxLength={100} onChangeText={(value) => updateReg({ manufacturer: value })} placeholder="Optional" value={reg.manufacturer} /></View>
          <View style={styles.half}><FormField label="Model" maxLength={100} onChangeText={(value) => updateReg({ model: value })} placeholder="Optional" value={reg.model} /></View>
        </View>
      </StepShell>
    );
  }

  if (step === 'ffm-regulator') {
    return (
      <StepShell body="The demand regulator built into the mask — the part you breathe from. It has no first stage of its own." count={regSteps.length} footer={<PrimaryButton label="Continue" onPress={goNext} />} index={index} onBack={goBack} title="Built-in second stage">
        <FormField helper={autoHelper('secondStage')} label="Manufacturer" maxLength={100} onChangeText={(value) => setManufacturer('secondStage', value)} placeholder="e.g. OTS" value={reg.secondStage.manufacturer} />
        <FormField label="Model" maxLength={100} onChangeText={(value) => updateReg({ secondStage: { ...reg.secondStage, model: value } })} placeholder="e.g. Spectrum" value={reg.secondStage.model} />
        <FormField autoCapitalize="characters" label="Serial number" maxLength={120} onChangeText={(value) => updateReg({ secondStage: { ...reg.secondStage, serialNumber: value } })} placeholder="Optional" value={reg.secondStage.serialNumber} />
      </StepShell>
    );
  }

  if (step === 'ffm-connection') {
    return (
      <StepShell body="How it hooks up to the first stage of the regulator you're diving." count={regSteps.length} footer={<PrimaryButton disabled={!reg.ffm.connection} label="Continue" onPress={goNext} />} index={index} onBack={goBack} title="How does it connect?">
        <ChoiceGroup choices={FFM_CONNECTIONS} label="Connection" onChange={(connection) => updateReg({ ffm: { ...reg.ffm, connection } })} value={reg.ffm.connection} />
        <FormField label="Hose length" maxLength={40} onChangeText={(hoseLength) => updateReg({ ffm: { ...reg.ffm, hoseLength } })} placeholder="Optional, e.g. 32 in" value={reg.ffm.hoseLength} />
      </StepShell>
    );
  }

  if (step === 'ffm-comms') {
    const chooseComms = (included) => {
      updateReg({ ffm: { ...reg.ffm, comms: { ...reg.ffm.comms, included } } });
      if (included === false) goNext();
    };
    return (
      <StepShell body="An underwater communications unit mounted on the mask — OTS Buddy Phone, Ocean Reef GSM and similar." count={regSteps.length} footer={<PrimaryButton disabled={reg.ffm.comms.included === null} label="Continue" onPress={goNext} />} index={index} onBack={goBack} title="Comms unit?">
        <YesNoRow onChange={chooseComms} value={reg.ffm.comms.included} />
        {reg.ffm.comms.included ? (
          <>
            <FormField label="Manufacturer" maxLength={100} onChangeText={(manufacturer) => updateReg({ ffm: { ...reg.ffm, comms: { ...reg.ffm.comms, manufacturer } } })} placeholder="Optional" value={reg.ffm.comms.manufacturer} />
            <FormField label="Model" maxLength={100} onChangeText={(model) => updateReg({ ffm: { ...reg.ffm, comms: { ...reg.ffm.comms, model } } })} placeholder="Optional" value={reg.ffm.comms.model} />
            <FormField autoCapitalize="characters" label="Serial number" maxLength={120} onChangeText={(serialNumber) => updateReg({ ffm: { ...reg.ffm, comms: { ...reg.ffm.comms, serialNumber } } })} placeholder="Optional" value={reg.ffm.comms.serialNumber} />
          </>
        ) : null}
      </StepShell>
    );
  }

  if (step === 'first-stage') {
    return (
      <StepShell body="The part that mounts on the tank valve and steps down tank pressure." count={regSteps.length} footer={<PrimaryButton label="Continue" onPress={goNext} />} index={index} onBack={goBack} title="First stage">
        <FormField helper={autoHelper('firstStage')} label="Manufacturer" maxLength={100} onChangeText={(value) => setManufacturer('firstStage', value)} placeholder="e.g. Scubapro" value={reg.firstStage.manufacturer} />
        <FormField label="Model" maxLength={100} onChangeText={(value) => updateReg({ firstStage: { ...reg.firstStage, model: value } })} placeholder="e.g. MK25 EVO" value={reg.firstStage.model} />
        <FormField autoCapitalize="characters" label="Serial number" maxLength={120} onChangeText={(value) => updateReg({ firstStage: { ...reg.firstStage, serialNumber: value } })} placeholder="Optional" value={reg.firstStage.serialNumber} />
      </StepShell>
    );
  }

  if (step === 'second-stage') {
    return (
      <StepShell body="Your primary second stage — the one you breathe from." count={regSteps.length} footer={<PrimaryButton label="Continue" onPress={goNext} />} index={index} onBack={goBack} title="Second stage">
        <FormField helper={autoHelper('secondStage')} label="Manufacturer" maxLength={100} onChangeText={(value) => setManufacturer('secondStage', value)} placeholder="e.g. Scubapro" value={reg.secondStage.manufacturer} />
        <FormField label="Model" maxLength={100} onChangeText={(value) => updateReg({ secondStage: { ...reg.secondStage, model: value } })} placeholder="e.g. S620 Ti" value={reg.secondStage.model} />
        <FormField autoCapitalize="characters" label="Serial number" maxLength={120} onChangeText={(value) => updateReg({ secondStage: { ...reg.secondStage, serialNumber: value } })} placeholder="Optional" value={reg.secondStage.serialNumber} />
      </StepShell>
    );
  }

  if (step === 'alternate') {
    return (
      <StepShell body="Your backup second stage — octopus, necklace, or a bungee'd spare." count={regSteps.length} footer={<PrimaryButton disabled={reg.alternate.included === null} label="Continue" onPress={goNext} />} index={index} onBack={goBack} title="Alternate second stage?">
        <YesNoRow onChange={(included) => chooseYesNo('alternate', included, included === false)} value={reg.alternate.included} />
        {reg.alternate.included ? (
          <>
            <FormField helper={autoHelper('alternate')} label="Manufacturer" maxLength={100} onChangeText={(value) => setManufacturer('alternate', value)} placeholder="Optional" value={reg.alternate.manufacturer} />
            <FormField label="Model" maxLength={100} onChangeText={(value) => updateReg({ alternate: { ...reg.alternate, model: value } })} placeholder="Optional" value={reg.alternate.model} />
            <FormField autoCapitalize="characters" label="Serial number" maxLength={120} onChangeText={(value) => updateReg({ alternate: { ...reg.alternate, serialNumber: value } })} placeholder="Optional" value={reg.alternate.serialNumber} />
          </>
        ) : null}
      </StepShell>
    );
  }

  if (step === 'inflator') {
    return (
      <StepShell body="The hose that connects the first stage to your BCD's power inflator." count={regSteps.length} footer={<PrimaryButton disabled={reg.inflator.included === null} label="Continue" onPress={goNext} />} index={index} onBack={goBack} title="BCD inflator hose?">
        <YesNoRow onChange={(included) => chooseYesNo('inflator', included, true)} value={reg.inflator.included} />
      </StepShell>
    );
  }

  if (step === 'drysuit') {
    return (
      <StepShell body="A separate low-pressure hose running from the first stage to a drysuit's inflator valve." count={regSteps.length} footer={<PrimaryButton disabled={reg.drysuit.included === null} label="Continue" onPress={goNext} />} index={index} onBack={goBack} title="Drysuit inflator hose?">
        <YesNoRow onChange={(included) => chooseYesNo('drysuit', included, true)} value={reg.drysuit.included} />
      </StepShell>
    );
  }

  if (step === 'spg') {
    return (
      <StepShell body="Your submersible pressure gauge, whether standalone or on a console." count={regSteps.length} footer={<PrimaryButton disabled={reg.spg.included === null} label="Continue" onPress={goNext} />} index={index} onBack={goBack} title="SPG?">
        <YesNoRow onChange={(included) => chooseYesNo('spg', included, included === false)} value={reg.spg.included} />
        {reg.spg.included ? (
          <>
            <FormField helper={autoHelper('spg')} label="Manufacturer" maxLength={100} onChangeText={(value) => setManufacturer('spg', value)} placeholder="Optional" value={reg.spg.manufacturer} />
            <FormField label="Model" maxLength={100} onChangeText={(value) => updateReg({ spg: { ...reg.spg, model: value } })} placeholder="Optional" value={reg.spg.model} />
            <FormField autoCapitalize="characters" label="Serial number" maxLength={120} onChangeText={(value) => updateReg({ spg: { ...reg.spg, serialNumber: value } })} placeholder="Optional" value={reg.spg.serialNumber} />
          </>
        ) : null}
      </StepShell>
    );
  }

  if (step === 'transmitter') {
    return (
      <StepShell body="A wireless tank-pressure transmitter that pairs with a dive computer. Pick Floating if it moves between regulators — it's saved as its own floating item, so you can always see which rig it's on." count={regSteps.length} footer={<PrimaryButton disabled={reg.transmitter.included === null} label="Continue" onPress={goNext} />} index={index} onBack={goBack} title="Wireless transmitter?">
        <PillOptionRow onChange={(included) => chooseYesNo('transmitter', included, included === false)} options={TRANSMITTER_MODE_OPTIONS} value={reg.transmitter.included} />
        {reg.transmitter.included ? (
          <>
            <FormField helper={autoHelper('transmitter')} label="Manufacturer" maxLength={100} onChangeText={(value) => setManufacturer('transmitter', value)} placeholder="Optional" value={reg.transmitter.manufacturer} />
            <FormField label="Model" maxLength={100} onChangeText={(value) => updateReg({ transmitter: { ...reg.transmitter, model: value } })} placeholder="Optional" value={reg.transmitter.model} />
            <FormField autoCapitalize="characters" label="Serial number" maxLength={120} onChangeText={(value) => updateReg({ transmitter: { ...reg.transmitter, serialNumber: value } })} placeholder="Optional" value={reg.transmitter.serialNumber} />
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
      <StepShell body="Gauge console, high-pressure hose, anything else worth tracking as its own part." count={regSteps.length} footer={<PrimaryButton label="Continue" onPress={goNext} />} index={index} onBack={goBack} title="Any other parts?">
        {reg.extras.map((part) => <ExtraPartRow key={part.id} onChange={(next) => updateExtra(part.id, next)} onRemove={() => removeExtra(part.id)} part={part} partTypes={REGULATOR_EXTRA_PART_TYPES} />)}
        <SecondaryButton label="Add another part" onPress={addExtra} />
        <LinkExistingItems candidates={(items || []).filter((entry) => !['Regulator', 'Cylinder / tank'].includes(entry.category))} onChange={(linkedIds) => updateReg({ linkedIds })} selectedIds={reg.linkedIds} />
      </StepShell>
    );
  }

  // step === 'details'
  return (
    <StepShell body="Optional — fill in now, or skip and add it later from the item's page." count={regSteps.length} footer={<PrimaryButton disabled={busy} label={busy ? 'Saving…' : 'Save gear item'} onPress={save} />} index={index} onBack={goBack} title="Serial & service">
      <SummaryStrip chips={regulatorChips(reg)} />
      <SetupPicker onChange={(setupIds) => updateReg({ setupIds })} selectedIds={reg.setupIds} setups={setups} />
      <CheckRow checked={reg.floating} label="Floating item" body="Moves between setups; the locker tracks where it is." onPress={() => updateReg({ floating: !reg.floating })} />
      <FormField autoCapitalize="characters" label="Serial number" maxLength={120} onChangeText={(value) => updateReg({ serialNumber: value })} placeholder="Optional" value={reg.serialNumber} />
      <ChoiceGroup choices={GEAR_CONDITIONS} label="Current condition" onChange={(value) => updateReg({ condition: value })} value={reg.condition} />
      <View style={styles.twoColumn}>
        <View style={styles.half}><DateField label="Last service" onChange={(value) => updateRegService({ lastServiceDate: value })} value={reg.lastServiceDate} /></View>
        <View style={styles.half}><DateField label="Next service" onChange={(value) => updateReg({ nextServiceDate: value })} value={reg.nextServiceDate} /></View>
      </View>
      <ChoiceGroup choices={SERVICE_INTERVALS.map((value) => value || 'None')} label="Repeat every (months)" onChange={(value) => updateRegService({ serviceIntervalMonths: value === 'None' ? '' : value })} value={reg.serviceIntervalMonths || 'None'} />
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
