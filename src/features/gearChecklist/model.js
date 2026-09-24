export const GEAR_CATEGORIES = Object.freeze([
  'Exposure suit', 'Undergarment', 'BCD', 'Regulator', 'Cylinder / tank', 'Fins', 'Boots', 'Hood', 'Gloves', 'Weights', 'Mask', 'Snorkel',
  'Dive computer', 'Transmitter', 'Gauges / compass', 'Lights', 'Camera', 'Cutting / signaling', 'Surface safety', 'Rebreather', 'DPV / scooter',
  'Bags / storage', 'Spare parts', 'Accessories',
]);

// Grouped the same GEAR_CATEGORIES for the "what are you adding?" picker so related gear sits together.
export const CATEGORY_GROUPS = Object.freeze([
  { label: 'Life support', categories: ['Regulator', 'BCD', 'Cylinder / tank', 'Rebreather'] },
  { label: 'Exposure protection', categories: ['Exposure suit', 'Undergarment', 'Hood', 'Gloves', 'Boots'] },
  { label: 'Core kit', categories: ['Mask', 'Fins', 'Snorkel', 'Weights'] },
  { label: 'Instruments', categories: ['Dive computer', 'Transmitter', 'Gauges / compass'] },
  { label: 'Extras', categories: ['Lights', 'Camera', 'Cutting / signaling', 'Surface safety', 'DPV / scooter', 'Bags / storage', 'Spare parts', 'Accessories'] },
]);

// Categories with a guided, step-by-step add flow. Everything else in CATEGORY_GROUPS still opens
// the full form, pre-set to the chosen category, until its own guided flow is built.
export const GUIDED_CATEGORIES = Object.freeze(['Regulator', 'BCD', 'Exposure suit', 'Undergarment', 'Cylinder / tank']);

export const GEAR_CONDITIONS = Object.freeze(['Ready', 'Needs attention', 'Out of service', 'Retired']);
export const SERVICE_INTERVALS = Object.freeze(['', '6', '12', '18', '24', '36', '60']);
export const SETUP_TYPES = Object.freeze(['Single tank', 'Doubles', 'Sidemount', 'Pony / bailout', 'Stage / deco', 'Rebreather', 'Freedive', 'Travel', 'Custom']);
export const REGULATOR_CONFIGURATIONS = Object.freeze(['Single tank', 'Doubles', 'Sidemount', 'Pony / bailout', 'Stage / deco', 'Full face mask', 'Second stage only', 'Custom']);
export const TANK_CONFIGURATIONS = Object.freeze(['Single cylinder', 'Manifolded doubles', 'Independent doubles', 'Sidemount pair', 'Pony / bailout', 'Stage / deco', 'Custom']);
export const BCD_STYLES = Object.freeze(['Jacket', 'Back-inflate', 'Wing', 'Backplate & wing', 'Sidemount']);
export const EXPOSURE_SUIT_TYPES = Object.freeze(['Wetsuit', 'Drysuit']);
export const WETSUIT_CUTS = Object.freeze(['Shorty', 'Full']);
export const DRYSUIT_MATERIALS = Object.freeze(['Neoprene', 'Trilaminate', 'Membrane', 'Hybrid']);
export const SEAL_MATERIALS = Object.freeze(['Latex', 'Silicone', 'Neoprene']);
export const DRYSUIT_FEET_OPTIONS = Object.freeze(['Built-in boots', 'Socks']);
// Drysuit undergarments: one piece, a top and bottom, or a layer system — each piece is a tracked part.
export const UNDERGARMENT_STYLES = Object.freeze(['One-piece', 'Two-piece', 'Layer system']);
export const UNDERGARMENT_INSULATION = Object.freeze(['Thinsulate', 'Fleece', 'Primaloft', 'Octaloft', 'Merino wool', 'Synthetic pile', 'Other']);
// --- Cylinders -----------------------------------------------------------------------------------
// Each cylinder is its own locker item (own serial, hydro and visual dates). Doubles and sidemount
// pairs are a set item that links its two cylinders through accessoryItemIds, plus the parts that
// belong to the set itself (manifold, bands).
export const CYLINDER_SETUPS = Object.freeze(['Single tank', 'Doubles', 'Sidemount pair', 'Pony / bailout', 'Stage / deco']);
export const CYLINDER_MATERIALS = Object.freeze(['Aluminum', 'Steel', 'Composite']);
export const VALVE_TYPES = Object.freeze(['DIN', 'Yoke', 'Convertible (pro valve)']);
export const CYLINDER_COLORS = Object.freeze(['Yellow', 'Silver / bare', 'Grey', 'Black', 'White', 'Blue', 'Red', 'Green', 'Orange']);
// Common cylinders: rated gas capacity (cu ft), water volume (L) and working pressure.
export const CYLINDER_PRESETS = Object.freeze([
  { label: 'AL80', material: 'Aluminum', cuft: 77.4, liters: 11.1, psi: 3000, bar: 207 },
  { label: 'AL63', material: 'Aluminum', cuft: 63, liters: 9, psi: 3000, bar: 207 },
  { label: 'AL40', material: 'Aluminum', cuft: 40, liters: 5.7, psi: 3000, bar: 207 },
  { label: 'AL30', material: 'Aluminum', cuft: 30, liters: 4.3, psi: 3000, bar: 207 },
  { label: 'AL100', material: 'Aluminum', cuft: 100, liters: 13.2, psi: 3300, bar: 228 },
  { label: 'HP100', material: 'Steel', cuft: 100, liters: 12.9, psi: 3442, bar: 237 },
  { label: 'HP120', material: 'Steel', cuft: 120, liters: 15.3, psi: 3442, bar: 237 },
  { label: 'LP85', material: 'Steel', cuft: 85, liters: 13.1, psi: 2640, bar: 182 },
  { label: '12 L · 232 bar', material: 'Steel', cuft: null, liters: 12, psi: 3365, bar: 232 },
  { label: '15 L · 232 bar', material: 'Steel', cuft: null, liters: 15, psi: 3365, bar: 232 },
  { label: '7 L · 232 bar', material: 'Steel', cuft: null, liters: 7, psi: 3365, bar: 232 },
]);
// US DOT: hydrostatic test every 5 years; industry practice: visual inspection (VIP) every year.
// Local rules differ, so these only pre-fill due dates the diver can change.
export const HYDRO_INTERVAL_MONTHS = 60;
export const VISUAL_INTERVAL_MONTHS = 12;

export const COMPONENT_TYPES = Object.freeze({
  Regulator: ['First stage', 'Primary second stage', 'Alternate second stage', 'Second stage', 'Breathing hose', 'Inflator hose', 'Drysuit hose', 'High-pressure hose', 'SPG / pressure gauge', 'Gauge console', 'Wireless transmitter', 'Full face mask', 'Quick disconnect', 'Communications unit', 'Other'],
  'Cylinder / tank': ['Cylinder', 'Valve', 'Manifold', 'Bands', 'Boot', 'Other'],
  BCD: ['Bladder', 'Inflator (LPI)', 'Integrated alternate (Air2/Airsource)', 'Weight pocket', 'Trim pocket', 'Corrugated hose', 'Dump valve', 'Cam / tank strap', 'D-ring', 'Other'],
  Undergarment: ['One-piece suit', 'Top', 'Bottom', 'Base layer', 'Mid layer', 'Vest', 'Socks', 'Heating system', 'Battery', 'Other'],
  'Exposure suit': ['Suit body', 'Hood', 'Gloves', 'Dry gloves', 'Boots', 'Seals', 'Undergarment', 'Base layer', 'Mid layer', 'Rashguard', 'Socks', 'Other'],
  default: ['Primary component', 'Accessory', 'Hardware', 'Other'],
});
export const GEAR_STATE_VERSION = 2;

export function createGearId(prefix = 'gear') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function emptyGearComponent(category = 'Regulator', type) {
  const componentTypes = COMPONENT_TYPES[category] || COMPONENT_TYPES.default;
  return {
    id: '', type: type || componentTypes[0], name: '', manufacturer: '', model: '', serialNumber: '', condition: GEAR_CONDITIONS[0],
    lastServiceDate: '', nextServiceDate: '', serviceIntervalMonths: '', notes: '',
  };
}

// Hoses are replaceable consumables identified by type/length, not serial number. Other tracked
// hardware may have one, so its editor keeps an optional field without trying to guess by brand.
export function componentCanHaveSerial(type) {
  return !String(type || '').toLowerCase().includes('hose');
}

export function regulatorComponentTemplate(configuration = 'Single tank') {
  const templates = {
    Doubles: [
      ['First stage', 'Left post first stage'], ['First stage', 'Right post first stage'], ['Primary second stage', 'Primary second stage'],
      ['Alternate second stage', 'Backup necklace second stage'], ['Breathing hose', 'Primary long hose'], ['Breathing hose', 'Backup necklace hose'],
      ['Inflator hose', 'BCD inflator hose'], ['High-pressure hose', 'SPG hose'], ['SPG / pressure gauge', 'SPG'],
    ],
    Sidemount: [
      ['First stage', 'Left cylinder first stage'], ['First stage', 'Right cylinder first stage'], ['Second stage', 'Left second stage'],
      ['Second stage', 'Right second stage'], ['Breathing hose', 'Left breathing hose'], ['Breathing hose', 'Right breathing hose'],
      ['Inflator hose', 'BCD inflator hose'], ['High-pressure hose', 'Left SPG hose'], ['High-pressure hose', 'Right SPG hose'],
      ['SPG / pressure gauge', 'Left SPG'], ['SPG / pressure gauge', 'Right SPG'],
    ],
    'Pony / bailout': [['First stage', 'First stage'], ['Second stage', 'Second stage'], ['Breathing hose', 'Breathing hose'], ['High-pressure hose', 'SPG hose'], ['SPG / pressure gauge', 'SPG']],
    'Stage / deco': [['First stage', 'First stage'], ['Second stage', 'Second stage'], ['Breathing hose', 'Breathing hose'], ['High-pressure hose', 'SPG hose'], ['SPG / pressure gauge', 'SPG']],
    Custom: [],
    'Single tank': [
      ['First stage', 'First stage'], ['Primary second stage', 'Primary second stage'], ['Alternate second stage', 'Alternate second stage'],
      ['Breathing hose', 'Primary breathing hose'], ['Breathing hose', 'Alternate breathing hose'], ['Inflator hose', 'BCD inflator hose'],
      ['High-pressure hose', 'SPG hose'], ['SPG / pressure gauge', 'SPG'],
    ],
  };
  return (templates[configuration] || templates['Single tank']).map(([type, name]) => ({ ...emptyGearComponent('Regulator', type), type, name }));
}

export function tankComponentTemplate(configuration = 'Single cylinder') {
  if (configuration === 'Manifolded doubles') return [
    ['Cylinder', 'Left cylinder'], ['Cylinder', 'Right cylinder'], ['Valve', 'Left valve'], ['Valve', 'Right valve'],
    ['Manifold', 'Isolation manifold'], ['Bands', 'Tank bands'],
  ].map(([type, name]) => ({ ...emptyGearComponent('Cylinder / tank', type), type, name }));
  if (['Independent doubles', 'Sidemount pair'].includes(configuration)) return [
    ['Cylinder', 'Left cylinder'], ['Cylinder', 'Right cylinder'], ['Valve', 'Left valve'], ['Valve', 'Right valve'],
  ].map(([type, name]) => ({ ...emptyGearComponent('Cylinder / tank', type), type, name }));
  return [['Cylinder', 'Cylinder'], ['Valve', 'Valve']].map(([type, name]) => ({ ...emptyGearComponent('Cylinder / tank', type), type, name }));
}

export function bcdComponentTemplate() {
  return [['Bladder', 'Bladder'], ['Inflator (LPI)', 'Inflator (LPI)'], ['Weight pocket', 'Releasable weight pockets'], ['Trim pocket', 'Fixed trim pockets']]
    .map(([type, name]) => ({ ...emptyGearComponent('BCD', type), type, name }));
}

export function exposureComponentTemplate() {
  return [['Suit body', 'Suit'], ['Hood', 'Hood'], ['Gloves', 'Gloves'], ['Boots', 'Boots']]
    .map(([type, name]) => ({ ...emptyGearComponent('Exposure suit', type), type, name }));
}

// Pieces an undergarment of this style usually comes in.
export function undergarmentComponentTemplate(style = 'Two-piece') {
  const pieces = style === 'One-piece' ? [['One-piece suit', 'Undersuit']] : style === 'Layer system' ? [['Base layer', 'Base layer'], ['Mid layer', 'Mid layer']] : [['Top', 'Top'], ['Bottom', 'Bottom']];
  return pieces.map(([type, name]) => ({ ...emptyGearComponent('Undergarment', type), type, name }));
}

export function emptyGearItem() {
  return {
    id: '', name: '', category: GEAR_CATEGORIES[0], condition: GEAR_CONDITIONS[0], manufacturer: '', model: '', serialNumber: '',
    quantity: '1', size: '', thickness: '', color: '', weight: '', capacity: '', workingPressure: '', configuration: '',
    isAssembly: false, components: [], lastServiceDate: '', nextServiceDate: '', serviceIntervalMonths: '', visualInspectionDue: '',
    hydrostaticTestDue: '', lastHydrostaticTest: '', lastVisualInspection: '', material: '', valveType: '', serviceNotes: '', purchaseDate: '', purchasePrice: '', retailer: '', warrantyUntil: '', notes: '',
    attachments: [], setupIds: [], accessoryItemIds: [],
    // Floating gear (a transmitter, a full-face mask) moves between setups; currentSetupId is
    // where it physically is right now ('' = not on any setup).
    floating: false, currentSetupId: '',
    // Set on dive computers the logbook has downloaded from (vendor|product|serial).
    deviceKey: '',
  };
}

export function emptyGearSetup() {
  return { id: '', name: '', type: SETUP_TYPES[0], description: '', itemIds: [], checkedIds: [], accessoryChoices: {}, completeness: { skipped: [], done: false, type: SETUP_TYPES[0] } };
}

export const emptyGearList = emptyGearSetup;

export function createInitialGearState(now = new Date()) {
  const stamp = now.toISOString();
  return {
    version: GEAR_STATE_VERSION,
    items: [],
    dismissedDeviceKeys: [],
    setups: [
      { id: 'setup-single-tank', name: 'Single Tank', type: 'Single tank', description: 'Primary recreational backmount configuration.', itemIds: [], checkedIds: [], createdAt: stamp, updatedAt: stamp },
      { id: 'setup-doubles', name: 'Doubles', type: 'Doubles', description: 'Backmount doubles configuration.', itemIds: [], checkedIds: [], createdAt: stamp, updatedAt: stamp },
      { id: 'setup-sidemount', name: 'Sidemount', type: 'Sidemount', description: 'Independent sidemount configuration.', itemIds: [], checkedIds: [], createdAt: stamp, updatedAt: stamp },
    ],
  };
}

function cleanText(value) { return typeof value === 'string' ? value.trim() : ''; }
function uniqueIds(value) { return [...new Set((Array.isArray(value) ? value : []).filter((id) => typeof id === 'string' && id))]; }

function normalizeAttachment(value) {
  if (!value || typeof value.uri !== 'string' || !value.uri) return null;
  return {
    id: cleanText(value.id) || createGearId('attachment'), kind: value.kind === 'photo' ? 'photo' : 'document', uri: value.uri,
    name: cleanText(value.name) || (value.kind === 'photo' ? 'Gear photo' : 'Document'), mimeType: cleanText(value.mimeType),
    size: Number.isFinite(value.size) ? value.size : null,
  };
}

export function normalizeGearComponent(value = {}, category = 'Regulator') {
  const fallback = emptyGearComponent(category);
  const allowedTypes = COMPONENT_TYPES[category] || COMPONENT_TYPES.default;
  return {
    ...fallback,
    ...Object.fromEntries(Object.keys(fallback).filter((key) => typeof fallback[key] === 'string').map((key) => [key, cleanText(value[key])])),
    id: cleanText(value.id) || createGearId('component'),
    type: allowedTypes.includes(value.type) ? value.type : 'Other',
    name: cleanText(value.name) || cleanText(value.type) || 'Unnamed component',
    condition: GEAR_CONDITIONS.includes(value.condition) ? value.condition : 'Ready',
  };
}

export function normalizeGearItem(value = {}, now = new Date()) {
  const fallback = emptyGearItem();
  const category = GEAR_CATEGORIES.includes(value.category) ? value.category : 'Accessories';
  const components = (Array.isArray(value.components) ? value.components : []).map((component) => normalizeGearComponent(component, category));
  const configurationOptions = category === 'Regulator' ? REGULATOR_CONFIGURATIONS : category === 'Cylinder / tank' ? TANK_CONFIGURATIONS : category === 'BCD' ? BCD_STYLES : category === 'Exposure suit' ? EXPOSURE_SUIT_TYPES : category === 'Undergarment' ? UNDERGARMENT_STYLES : [];
  const normalized = {
    ...fallback,
    ...Object.fromEntries(Object.keys(fallback).filter((key) => typeof fallback[key] === 'string').map((key) => [key, cleanText(value[key])])),
    id: cleanText(value.id) || createGearId(), category,
    condition: GEAR_CONDITIONS.includes(value.condition) ? value.condition : 'Ready', quantity: cleanText(value.quantity) || '1',
    configuration: configurationOptions.includes(value.configuration) ? value.configuration : '', isAssembly: Boolean(value.isAssembly || components.length),
    components, attachments: (Array.isArray(value.attachments) ? value.attachments : []).map(normalizeAttachment).filter(Boolean),
    accessoryItemIds: uniqueIds(value.accessoryItemIds),
    floating: value.floating === true, currentSetupId: value.floating === true ? cleanText(value.currentSetupId) : '',
    createdAt: cleanText(value.createdAt) || now.toISOString(), updatedAt: now.toISOString(),
  };
  delete normalized.listIds;
  delete normalized.setupIds;
  return normalized;
}

export function normalizeGearSetup(value = {}, now = new Date()) {
  const itemIds = uniqueIds(value.itemIds);
  const type = SETUP_TYPES.includes(value.type) ? value.type : 'Custom';
  // A different setup type needs different gear, so its completeness review starts over.
  const reviewedType = SETUP_TYPES.includes(value.completeness?.type) ? value.completeness.type : type;
  const review = reviewedType === type ? value.completeness : null;
  return {
    id: cleanText(value.id) || createGearId('setup'), name: cleanText(value.name) || 'Untitled setup',
    type: SETUP_TYPES.includes(value.type) ? value.type : 'Custom', description: cleanText(value.description), itemIds,
    checkedIds: uniqueIds(value.checkedIds).filter((id) => itemIds.includes(checklistItemIdForKey(id))), createdAt: cleanText(value.createdAt) || now.toISOString(),
    // The one-time "is this setup complete?" review: requirement keys the diver chose to leave out,
    // and whether the review has been finished (after which it only shows as a summary).
    completeness: { skipped: uniqueIds(review?.skipped), done: review?.done === true, type },
    // Per item in this setup: which of its alternative accessories to pack (itemId → accessory ids).
    accessoryChoices: Object.fromEntries(Object.entries(value.accessoryChoices && typeof value.accessoryChoices === 'object' ? value.accessoryChoices : {})
      .filter(([itemId]) => itemIds.includes(itemId)).map(([itemId, ids]) => [itemId, uniqueIds(ids)])),
    updatedAt: now.toISOString(),
  };
}

export const normalizeGearList = normalizeGearSetup;

export function normalizeGearState(value) {
  if (!value || typeof value !== 'object') return createInitialGearState();
  const rawItems = (Array.isArray(value.items) ? value.items : []).map((item) => normalizeGearItem(item));
  const itemIds = new Set(rawItems.map((item) => item.id));
  const sourceSetups = Array.isArray(value.setups) ? value.setups : Array.isArray(value.lists) ? value.lists : [];
  const sourceSetupIds = new Set(sourceSetups.map((setup) => setup?.id).filter(Boolean));
  // Undergarments are picked per setup, so they're never linked to a drysuit (either direction).
  const categoryOf = new Map(rawItems.map((item) => [item.id, item.category]));
  const suitUnderLink = (item, id) => (item.category === 'Exposure suit' && categoryOf.get(id) === 'Undergarment') || (item.category === 'Undergarment' && categoryOf.get(id) === 'Exposure suit');
  // A regulator and its pony / bailout cylinder are peers: each has its own service and inspection
  // life, and each belongs under its own setup heading. Old links are promoted into setup membership.
  const lifeSupportLink = (item, id) => new Set([item.category, categoryOf.get(id)]).size === 2
    && [item.category, categoryOf.get(id)].every((category) => ['Regulator', 'Cylinder / tank'].includes(category));
  const lifeSupportPeers = new Map(rawItems.map((item) => [item.id, item.accessoryItemIds.filter((id) => itemIds.has(id) && lifeSupportLink(item, id))]));
  const items = rawItems.map((item) => ({
    ...item, accessoryItemIds: item.accessoryItemIds.filter((id) => itemIds.has(id) && id !== item.id && !suitUnderLink(item, id) && !lifeSupportLink(item, id)),
    currentSetupId: item.currentSetupId && sourceSetupIds.has(item.currentSetupId) ? item.currentSetupId : '',
  }));
  const setups = sourceSetups.map((setup) => {
    const normalized = normalizeGearSetup(setup);
    const selected = new Set(normalized.itemIds.filter((id) => itemIds.has(id)));
    for (const id of [...selected]) for (const peerId of lifeSupportPeers.get(id) || []) selected.add(peerId);
    normalized.itemIds = [...selected];
    // Preserve a packed old-style linked cylinder/regulator as its new top-level checkbox.
    normalized.checkedIds = [...new Set(normalized.checkedIds.map((id) => {
      const [parentId, kind, linkedId] = id.split(CHECKLIST_KEY_SEPARATOR);
      return kind === 'accessory' && (lifeSupportPeers.get(parentId) || []).includes(linkedId) ? linkedId : id;
    }))].filter((id) => itemIds.has(checklistItemIdForKey(id)));
    // A choice whose undergarments were all deleted is asked again (an explicit "none" stays none).
    normalized.accessoryChoices = Object.fromEntries(Object.entries(normalized.accessoryChoices)
      .map(([itemId, ids]) => [itemId, ids, ids.filter((id) => itemIds.has(id))])
      .filter(([, ids, kept]) => !ids.length || kept.length).map(([itemId, , kept]) => [itemId, kept]));
    return normalized;
  });
  const dismissedDeviceKeys = [...new Set((Array.isArray(value.dismissedDeviceKeys) ? value.dismissedDeviceKeys : []).filter((key) => typeof key === 'string' && key))];
  return { version: GEAR_STATE_VERSION, items, setups, dismissedDeviceKeys };
}

export function setupIdsForItem(setups, itemId) {
  return (Array.isArray(setups) ? setups : []).filter((setup) => setup.itemIds.includes(itemId)).map((setup) => setup.id);
}
export const listIdsForItem = setupIdsForItem;

// Assemblies (a drysuit, a BCD) can link out to real standalone locker items — a hood or a pair
// of boots you already own or quick-add through the guided wizard — instead of describing them a
// second time as a buried component. The link lives as accessoryItemIds on the parent; these two
// helpers walk it in each direction for the detail view.
export function accessoryItemsForItem(items, item) {
  const byId = new Map((Array.isArray(items) ? items : []).map((entry) => [entry.id, entry]));
  return (item?.accessoryItemIds || []).map((id) => byId.get(id)).filter(Boolean);
}

export function parentItemsForAccessory(items, itemId) {
  return (Array.isArray(items) ? items : []).filter((entry) => (entry.accessoryItemIds || []).includes(itemId));
}

const CHECKLIST_KEY_SEPARATOR = '::';

// A setup's packing checklist checks off whole items by id — fine for a mask or a single fin, but
// a drysuit with a hood, dry gloves, and boots is one item hiding several forgettable pieces.
// checklistEntriesForItem expands an item into every checkable piece: the item itself, each
// tracked component, and each linked accessory — so checking "the drysuit" off doesn't silently
// mark the hood and boots as packed too. Keys are itemId::component::id / itemId::accessory::id;
// a plain item with no parts keeps its bare id as its only (and whole) entry.
//
// When a setup is given, linked accessories that are alternatives (see accessoryAlternatives) are
// narrowed to the ones that setup packs; `unresolved` lists the choices the setup hasn't made yet.
export function checklistEntriesForItem(item, items, setup = null) {
  // A cylinder — or a doubles set / sidemount pair with its valves, manifold and bands — is one
  // physical thing on the dock: one checkbox, however many parts it tracks.
  if (item?.category === 'Cylinder / tank') return { itemKey: item.id, parts: [], unresolved: [] };
  const { packed, unresolved } = packedAccessories(item, items, setup);
  const parts = [
    ...(item?.components || []).map((component) => ({ key: `${item.id}${CHECKLIST_KEY_SEPARATOR}component${CHECKLIST_KEY_SEPARATOR}${component.id}`, label: component.name, meta: component.type })),
    // A linked item that comes in pieces (a two-piece undersuit) lists each piece to check off too.
    ...packed.flatMap((accessory) => {
      const key = `${item.id}${CHECKLIST_KEY_SEPARATOR}accessory${CHECKLIST_KEY_SEPARATOR}${accessory.id}`;
      return [
        { key, label: accessory.name, meta: accessory.category, linkedItemId: accessory.id },
        ...(accessory.components || []).map((component) => ({ key: `${key}${CHECKLIST_KEY_SEPARATOR}component${CHECKLIST_KEY_SEPARATOR}${component.id}`, label: `${accessory.name} · ${component.name}`, meta: component.type, linkedItemId: accessory.id, piece: true })),
      ];
    }),
  ];
  return { itemKey: item.id, parts, unresolved };
}

// Drysuit undergarments are chosen per setup, not linked to the suit: any setup with a drysuit asks
// which undergarment(s) it packs, from every undergarment in the locker (or none). The answer lives in
// setup.accessoryChoices[drysuitId] — no key yet means the setup hasn't been asked.
export const isDrysuit = (item) => item?.category === 'Exposure suit' && item.configuration !== 'Wetsuit';
const undergarmentsIn = (items) => (Array.isArray(items) ? items : []).filter((entry) => entry.category === 'Undergarment');

// The choice an item offers a setup: a drysuit → the locker's undergarments. Nothing else asks.
export function accessoryAlternatives(item, items) {
  if (!isDrysuit(item)) return [];
  const options = undergarmentsIn(items);
  return options.length ? [{ category: 'Undergarment', options }] : [];
}

// Linked gear always packs with its item (the drysuit's hood and boots); in a setup, a drysuit also
// packs the undergarment(s) chosen for it, or asks (`unresolved`) if the setup hasn't said yet.
export function packedAccessories(item, items, setup = null) {
  const linked = accessoryItemsForItem(items, item);
  if (!setup || !isDrysuit(item)) return { packed: linked, unresolved: [] };
  const alternatives = accessoryAlternatives(item, items);
  const answered = Object.prototype.hasOwnProperty.call(setup.accessoryChoices || {}, item.id);
  const chosen = new Set(setup.accessoryChoices?.[item.id] || []);
  const undergarments = undergarmentsIn(items).filter((entry) => chosen.has(entry.id) && !linked.some((link) => link.id === entry.id));
  return { packed: [...linked, ...undergarments], unresolved: answered ? [] : alternatives };
}

// Sets which of an item's alternative accessories a setup packs, and un-checks any it no longer packs.
export function setAccessoryChoice(setup, itemId, accessoryIds, items, now = new Date()) {
  const chosen = uniqueIds(accessoryIds);
  const accessoryChoices = { ...(setup.accessoryChoices || {}), [itemId]: chosen };
  // Only alternatives that stop being packed are un-checked — the drysuit's boots stay checked.
  const item = (Array.isArray(items) ? items : []).find((entry) => entry.id === itemId);
  const optionIds = new Set(item ? accessoryAlternatives(item, items).flatMap((group) => group.options.map((option) => option.id)) : []);
  const prefix = `${itemId}${CHECKLIST_KEY_SEPARATOR}accessory${CHECKLIST_KEY_SEPARATOR}`;
  const checkedIds = setup.checkedIds.filter((key) => {
    if (!key.startsWith(prefix)) return true;
    const accessoryId = key.slice(prefix.length).split(CHECKLIST_KEY_SEPARATOR)[0];
    return !optionIds.has(accessoryId) || chosen.includes(accessoryId);
  });
  return { ...setup, accessoryChoices, checkedIds, updatedAt: now.toISOString() };
}

export function checklistItemIdForKey(key) {
  const separatorIndex = typeof key === 'string' ? key.indexOf(CHECKLIST_KEY_SEPARATOR) : -1;
  return separatorIndex === -1 ? key : key.slice(0, separatorIndex);
}

export function assignItemToSetups(setups, itemId, selectedSetupIds, now = new Date()) {
  const selected = new Set(uniqueIds(selectedSetupIds));
  return setups.map((setup) => {
    const alreadyIncluded = setup.itemIds.includes(itemId);
    const shouldInclude = selected.has(setup.id);
    if (alreadyIncluded === shouldInclude) return setup;
    return {
      ...setup, itemIds: shouldInclude ? [...setup.itemIds, itemId] : setup.itemIds.filter((id) => id !== itemId),
      checkedIds: shouldInclude ? setup.checkedIds : setup.checkedIds.filter((id) => id !== itemId), updatedAt: now.toISOString(),
    };
  });
}
export const assignItemToLists = assignItemToSetups;

function parseDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}
function addMonths(date, months) { const result = new Date(date.getTime()); result.setUTCMonth(result.getUTCMonth() + months); return result; }
export function formatDateOnly(date) { return date ? date.toISOString().slice(0, 10) : ''; }

// Keep the visible next-service field in sync as the diver supplies either half of a recurring
// schedule. An explicitly typed next date remains editable and is only replaced when the last
// service date or interval changes again with enough information to calculate a new one.
export function updateServiceSchedule(record, patch) {
  const next = { ...record, ...patch };
  const interval = Number(next.serviceIntervalMonths);
  const calculated = Number.isFinite(interval) && interval > 0 ? addMonthsToDateOnly(next.lastServiceDate, interval) : '';
  return calculated ? { ...next, nextServiceDate: calculated } : next;
}

export function serviceDueForItem(item) {
  const candidates = [];
  const explicit = parseDateOnly(item?.nextServiceDate);
  if (explicit) candidates.push({ date: explicit, label: 'Service' });
  if (!explicit) {
    const last = parseDateOnly(item?.lastServiceDate);
    const interval = Number(item?.serviceIntervalMonths);
    if (last && Number.isFinite(interval) && interval > 0) candidates.push({ date: addMonths(last, interval), label: 'Service' });
  }
  const visual = parseDateOnly(item?.visualInspectionDue);
  if (visual) candidates.push({ date: visual, label: 'Visual inspection' });
  const hydro = parseDateOnly(item?.hydrostaticTestDue);
  if (hydro) candidates.push({ date: hydro, label: 'Hydrostatic test' });
  return candidates.sort((a, b) => a.date - b.date)[0] || null;
}

export function serviceStatusForItem(item, now = new Date()) {
  if (item?.condition === 'Out of service') return { key: 'blocked', label: 'OUT OF SERVICE', tone: 'danger', due: null, days: null };
  if (item?.condition === 'Needs attention') return { key: 'attention', label: 'NEEDS ATTENTION', tone: 'warning', due: serviceDueForItem(item), days: null };
  if (item?.condition === 'Retired') return { key: 'retired', label: 'RETIRED', tone: 'muted', due: null, days: null };
  const due = serviceDueForItem(item);
  if (!due) return { key: 'none', label: 'NO SERVICE DATE', tone: 'muted', due: null, days: null };
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12));
  const days = Math.ceil((due.date - today) / 86400000);
  if (days < 0) return { key: 'overdue', label: `${due.label.toUpperCase()} OVERDUE`, tone: 'danger', due, days };
  if (days <= 30) return { key: 'due-soon', label: `${due.label.toUpperCase()} DUE SOON`, tone: 'warning', due, days };
  return { key: 'current', label: `${due.label.toUpperCase()} CURRENT`, tone: 'good', due, days };
}

export function serviceStatusForAssembly(item, now = new Date()) {
  const priority = { blocked: 6, attention: 5, overdue: 4, 'due-soon': 3, current: 2, none: 1, retired: 0 };
  const entries = serviceEntriesForItem(item).map((entry) => ({ entry, status: serviceStatusForItem(entry.record, now) }));
  const worst = entries.sort((a, b) => (priority[b.status.key] || 0) - (priority[a.status.key] || 0))[0];
  if (!worst) return serviceStatusForItem(item, now);
  if (worst.entry.parentId && priority[worst.status.key] >= priority['due-soon']) {
    return { ...worst.status, label: `PART: ${worst.status.label}` };
  }
  return worst.status;
}

export function serviceEntriesForItem(item) {
  return [
    { id: item.id, parentId: null, name: item.name, category: item.category, record: item },
    ...(item.components || []).map((component) => ({ id: component.id, parentId: item.id, name: component.name, category: component.type, record: component })),
  ];
}

export function gearSummary(state, now = new Date()) {
  const items = Array.isArray(state?.items) ? state.items : [];
  const statuses = items.flatMap(serviceEntriesForItem).map((entry) => serviceStatusForItem(entry.record, now));
  // Cylinders inside a doubles set / sidemount pair count as parts of that set, not as gear.
  const members = cylinderSetMemberIds(items);
  return {
    total: items.length - members.size, components: items.reduce((sum, item) => sum + (item.components?.length || 0), 0) + members.size,
    ready: items.filter((item) => item.condition === 'Ready').length,
    alerts: statuses.filter((status) => ['blocked', 'attention', 'overdue', 'due-soon'].includes(status.key)).length,
    documents: items.reduce((sum, item) => sum + (Array.isArray(item.attachments) ? item.attachments.length : 0), 0),
  };
}

// Counts every checkable piece (each item, plus each of its tracked parts and linked
// accessories) rather than just top-level items, so "packed" reflects the hood and boots too,
// not just whether the drysuit itself got checked.
export function setupProgress(setup, items) {
  const byId = new Map((Array.isArray(items) ? items : []).map((entry) => [entry.id, entry]));
  const checkedSet = new Set(Array.isArray(setup?.checkedIds) ? setup.checkedIds : []);
  let total = 0;
  let checked = 0;
  const packedWith = includedWithSelection(setup?.itemIds, items, setup?.accessoryChoices);
  (Array.isArray(setup?.itemIds) ? setup.itemIds : []).forEach((itemId) => {
    const item = byId.get(itemId);
    if (!item || packedWith.has(itemId)) return; // already counted as part of its parent
    const { itemKey, parts } = checklistEntriesForItem(item, items, setup);
    total += 1 + parts.length;
    if (checkedSet.has(itemKey)) checked += 1;
    parts.forEach((part) => { if (checkedSet.has(part.key)) checked += 1; });
  });
  return { total, checked, ratio: total ? checked / total : 0 };
}
export const checklistProgress = setupProgress;

export function sortGear(items) {
  return [...(Array.isArray(items) ? items : [])].sort((a, b) => {
    const category = GEAR_CATEGORIES.indexOf(a.category) - GEAR_CATEGORIES.indexOf(b.category);
    return category || a.name.localeCompare(b.name);
  });
}

export const GEAR_SORT_OPTIONS = Object.freeze(['Category', 'Name', 'Manufacturer', 'Service urgency', 'Recently added']);
export const GEAR_SERVICE_FILTERS = Object.freeze(['Any service status', 'Needs action', 'Overdue / blocked', 'Current', 'Not tracked']);
export const GEAR_LOCATION_FILTERS = Object.freeze(['Any setup status', 'In a setup', 'Unassigned', 'Floating']);

export function filterGear(items, filters = {}, setups = [], now = new Date()) {
  const list = Array.isArray(items) ? items : [];
  const packedIds = new Set((Array.isArray(setups) ? setups : []).flatMap((setup) => packedItems(setup, list).map((item) => item.id)));
  return list.filter((item) => {
    if (filters.category && filters.category !== 'All' && filters.category !== item.category && !(filters.category === 'Floating' && item.floating)) return false;
    if (filters.condition && filters.condition !== 'Any condition' && item.condition !== filters.condition) return false;
    const status = serviceStatusForAssembly(item, now).key;
    if (filters.service === 'Needs action' && !['blocked', 'attention', 'overdue', 'due-soon'].includes(status)) return false;
    if (filters.service === 'Overdue / blocked' && !['blocked', 'overdue'].includes(status)) return false;
    if (filters.service === 'Current' && status !== 'current') return false;
    if (filters.service === 'Not tracked' && status !== 'none') return false;
    if (filters.location === 'In a setup' && !packedIds.has(item.id)) return false;
    if (filters.location === 'Unassigned' && packedIds.has(item.id)) return false;
    if (filters.location === 'Floating' && !item.floating) return false;
    return true;
  });
}

export function sortGearBy(items, sort = 'Category', now = new Date()) {
  const list = [...(Array.isArray(items) ? items : [])];
  const text = (value) => String(value || '').toLocaleLowerCase();
  const byName = (a, b) => text(a.name).localeCompare(text(b.name));
  if (sort === 'Name') return list.sort(byName);
  if (sort === 'Manufacturer') return list.sort((a, b) => text(a.manufacturer).localeCompare(text(b.manufacturer)) || byName(a, b));
  if (sort === 'Recently added') return list.sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0) || byName(a, b));
  if (sort === 'Service urgency') {
    const priority = { blocked: 0, overdue: 1, attention: 2, 'due-soon': 3, current: 4, none: 5, retired: 6 };
    return list.sort((a, b) => (priority[serviceStatusForAssembly(a, now).key] ?? 9) - (priority[serviceStatusForAssembly(b, now).key] ?? 9) || byName(a, b));
  }
  return sortGear(list);
}

// --- Cylinder helpers ------------------------------------------------------------------------------
export function addMonthsToDateOnly(value, months) {
  const date = parseDateOnly(value);
  return date ? formatDateOnly(addMonths(date, months)) : '';
}

// "77.4 cu ft · 11.1 L" / "3000 psi · 207 bar" — both units, so either reads naturally.
export function presetCapacity(preset) {
  return [preset.cuft ? `${preset.cuft} cu ft` : '', preset.liters ? `${preset.liters} L` : ''].filter(Boolean).join(' · ');
}
export function presetPressure(preset) {
  return `${preset.psi} psi · ${preset.bar} bar`;
}

// A cylinder set (doubles / sidemount pair) is the set item plus the cylinders it links.
export const isCylinderSet = (item) => item?.category === 'Cylinder / tank' && ['Manifolded doubles', 'Independent doubles', 'Sidemount pair'].includes(item.configuration);

// Cylinders not already in a set — the ones a new doubles / sidemount set can link.
export function unpairedCylinders(items) {
  const list = Array.isArray(items) ? items : [];
  const inSets = new Set(list.filter(isCylinderSet).flatMap((set) => set.accessoryItemIds || []));
  return list.filter((item) => item.category === 'Cylinder / tank' && !isCylinderSet(item) && !inSets.has(item.id));
}

// Worst service state across an assembly's own parts and the items it links (a set's cylinders,
// a drysuit's boots), so a doubles set shows "HYDRO OVERDUE" when one of its cylinders is.
export function serviceStatusForSet(item, items, now = new Date()) {
  const priority = { blocked: 6, attention: 5, overdue: 4, 'due-soon': 3, current: 2, none: 1, retired: 0 };
  const own = serviceStatusForAssembly(item, now);
  const linked = accessoryItemsForItem(items, item).map((entry) => ({ entry, status: serviceStatusForAssembly(entry, now) }))
    .sort((a, b) => (priority[b.status.key] || 0) - (priority[a.status.key] || 0))[0];
  if (!linked || (priority[linked.status.key] || 0) <= (priority[own.key] || 0) || (priority[linked.status.key] || 0) < priority['due-soon']) return own;
  // "Double HP100s · Right" inside "Double HP100s" reads as just "RIGHT".
  const short = linked.entry.name.startsWith(`${item.name} · `) ? linked.entry.name.slice(item.name.length + 3) : linked.entry.name;
  return { ...linked.status, label: `${short.toUpperCase()}: ${linked.status.label}` };
}

// --- Floating gear -------------------------------------------------------------------------------
export function floatingLocation(item, setups) {
  if (!item?.floating || !item.currentSetupId) return null;
  return (Array.isArray(setups) ? setups : []).find((setup) => setup.id === item.currentSetupId) || null;
}

// Moves a floating item onto a setup (or off every setup with ''). It's one physical thing, so it
// is un-checked everywhere else it was packed.
export function moveFloatingItem(state, itemId, setupId, now = new Date()) {
  const items = state.items.map((item) => (item.id === itemId ? { ...item, currentSetupId: setupId || '', updatedAt: now.toISOString() } : item));
  const setups = state.setups.map((setup) => {
    if (setup.id === setupId) return setup.itemIds.includes(itemId) ? setup : { ...setup, itemIds: [...setup.itemIds, itemId], updatedAt: now.toISOString() };
    const checkedIds = setup.checkedIds.filter((key) => checklistItemIdForKey(key) !== itemId);
    return checkedIds.length === setup.checkedIds.length ? setup : { ...setup, checkedIds, updatedAt: now.toISOString() };
  });
  return { ...state, items, setups };
}

// Checking a floating item off in a setup means it's packed there — so it moves there.
export function applyChecks(state, setupId, keys, checked, now = new Date()) {
  const keySet = new Set(keys);
  let next = {
    ...state,
    setups: state.setups.map((setup) => {
      if (setup.id !== setupId) return setup;
      const without = setup.checkedIds.filter((id) => !keySet.has(id));
      return { ...setup, checkedIds: checked ? [...without, ...keys] : without };
    }),
  };
  if (checked) {
    const floatingIds = [...new Set(keys.map(checklistItemIdForKey))].filter((id) => state.items.find((item) => item.id === id)?.floating);
    for (const id of floatingIds) {
      if (state.items.find((item) => item.id === id).currentSetupId === setupId) continue;
      const kept = next.setups.find((setup) => setup.id === setupId).checkedIds;
      next = moveFloatingItem(next, id, setupId, now);
      next.setups = next.setups.map((setup) => (setup.id === setupId ? { ...setup, checkedIds: kept } : setup));
    }
  }
  return next;
}

// --- Search --------------------------------------------------------------------------------------
// Every word must appear somewhere in the item: name, brand, model, serial, category, set-up, color,
// size, material, valve, notes, retailer, or any tracked part's name / brand / model / serial.
export function gearSearchText(item) {
  return [
    item.name, item.manufacturer, item.model, item.serialNumber, item.category, item.configuration, item.color, item.size,
    item.thickness, item.capacity, item.workingPressure, item.material, item.valveType, item.notes, item.serviceNotes, item.retailer,
    item.floating ? 'floating' : '',
    ...(item.components || []).flatMap((component) => [component.name, component.type, component.manufacturer, component.model, component.serialNumber, component.notes]),
  ].filter(Boolean).join(' ').toLowerCase();
}
export function searchGear(items, query) {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  const list = Array.isArray(items) ? items : [];
  if (!words.length) return list;
  return list.filter((item) => { const text = gearSearchText(item); return words.every((word) => text.includes(word)); });
}

// --- Dive computers from the logbook -------------------------------------------------------------
// Every computer the logbook has downloaded from (its deviceKey is vendor|product|serial) shows up
// in the locker as a Dive computer item, once. Deleting that item dismisses it for good.
export function syncDiveComputers(state, indexRows, now = new Date()) {
  const known = new Set([...state.items.map((item) => item.deviceKey).filter(Boolean), ...(state.dismissedDeviceKeys || [])]);
  const keys = [...new Set((Array.isArray(indexRows) ? indexRows : []).filter((row) => row && !row.deletedAt).flatMap((row) => row.deviceKeys || []))].filter((key) => key && !known.has(key));
  if (!keys.length) return state;
  // A computer the diver already added by hand (same serial, or same brand + model with no serial
  // recorded) is claimed instead of duplicated.
  const lower = (value) => String(value || '').trim().toLowerCase();
  let items = state.items;
  const unclaimed = keys.filter((deviceKey) => {
    const [vendor = '', product = '', serial = ''] = String(deviceKey).split('|');
    const match = items.find((item) => item.category === 'Dive computer' && !item.deviceKey && (
      (serial && lower(item.serialNumber) === lower(serial))
      || (!item.serialNumber && product && lower(item.model) === lower(product) && (!item.manufacturer || lower(item.manufacturer) === lower(vendor)))));
    if (!match) return true;
    items = items.map((item) => (item.id === match.id ? { ...item, deviceKey, serialNumber: item.serialNumber || serial } : item));
    return false;
  });
  const added = unclaimed.map((deviceKey) => {
    const [vendor = '', product = '', serial = ''] = String(deviceKey).split('|');
    const model = `${vendor} ${product}`.trim() || 'Dive computer';
    const twins = unclaimed.filter((key) => key.split('|').slice(0, 2).join('|') === `${vendor}|${product}`).length
      + state.items.filter((item) => item.category === 'Dive computer' && item.manufacturer === vendor && item.model === product).length;
    return normalizeGearItem({
      ...emptyGearItem(), name: twins > 1 && serial ? `${model} (${serial.slice(-4)})` : model, category: 'Dive computer',
      manufacturer: vendor, model: product, serialNumber: serial, deviceKey,
      notes: 'Added automatically when you downloaded dives from it.',
    }, now);
  });
  return { ...state, items: [...items, ...added] };
}

export function diveComputerLogStats(indexRows, deviceKey) {
  const rows = (Array.isArray(indexRows) ? indexRows : []).filter((row) => row && !row.deletedAt && (row.deviceKeys || []).includes(deviceKey));
  if (!rows.length) return null;
  const dates = rows.map((row) => row.startTime).filter(Boolean).sort();
  const deepest = rows.reduce((max, row) => Math.max(max, Number(row.maxDepthMeters) || 0), 0);
  return {
    count: rows.length, first: (dates[0] || '').slice(0, 10), last: (dates[dates.length - 1] || '').slice(0, 10),
    deepest: deepest ? `${Math.round(deepest * 3.28084)} ft · ${Math.round(deepest)} m` : '',
  };
}

// Every choice a setup still has to make, e.g. which undergarment goes with its drysuit.
export function unresolvedChoices(setup, items) {
  const byId = new Map((Array.isArray(items) ? items : []).map((entry) => [entry.id, entry]));
  return (setup?.itemIds || []).map((id) => byId.get(id)).filter(Boolean)
    .flatMap((item) => packedAccessories(item, items, setup).unresolved.map((group) => ({ item, ...group })));
}

// A dive computer the logbook downloads from stays in the locker while the logbook has dives from
// it: it can be edited or marked Retired, but not deleted (or re-categorized). Once every dive from
// it is gone, it can be deleted — and it comes back if you download from it again.
export function isLockedLogbookComputer(item, indexRows) {
  return Boolean(item?.deviceKey) && Boolean(diveComputerLogStats(indexRows, item.deviceKey));
}

// --- Cylinder sets act as one item ---------------------------------------------------------------
// A doubles set or sidemount pair is one item in the inventory, setup picker and checklist; its
// cylinders are still tracked (serial, hydro, visual) but live inside the set until unlinked.
export function cylinderSetMemberIds(items) {
  return new Set((Array.isArray(items) ? items : []).filter(isCylinderSet).flatMap((set) => set.accessoryItemIds || []));
}
export function cylinderSetFor(items, itemId) {
  return (Array.isArray(items) ? items : []).find((entry) => isCylinderSet(entry) && (entry.accessoryItemIds || []).includes(itemId)) || null;
}
// What the inventory lists: set members are folded into their set (a search that matches a
// cylinder's serial shows the set it's in).
export function topLevelGear(items, matches = items) {
  const list = Array.isArray(items) ? items : [];
  const members = cylinderSetMemberIds(list);
  const shown = new Map();
  for (const item of matches) {
    const target = members.has(item.id) ? cylinderSetFor(list, item.id) : item;
    if (target) shown.set(target.id, target);
  }
  return [...shown.values()];
}
// Unlink a cylinder so it's tracked (and packed) on its own.
export function unlinkFromSet(state, itemId, now = new Date()) {
  const stamp = now.toISOString();
  return {
    ...state,
    items: state.items.map((item) => {
      if (isCylinderSet(item) && (item.accessoryItemIds || []).includes(itemId)) return { ...item, accessoryItemIds: item.accessoryItemIds.filter((id) => id !== itemId), updatedAt: stamp };
      if (item.id === itemId) return { ...item, configuration: item.configuration || 'Single cylinder', updatedAt: stamp };
      return item;
    }),
  };
}

// --- Items packed as part of another item in a setup ---------------------------------------------
// Selecting a drysuit brings its linked hood and boots (and the undergarment chosen for this setup);
// selecting a doubles set brings its cylinders. Returns accessoryId → the selected item it packs with,
// so the setup picker shows them as already included and never adds them a second time.
export function includedWithSelection(itemIds, items, accessoryChoices = {}) {
  const list = Array.isArray(items) ? items : [];
  const byId = new Map(list.map((entry) => [entry.id, entry]));
  const selected = new Set(itemIds || []);
  const included = new Map();
  // Follow links more than one level deep (a set → its cylinders, an undersuit → its linked socks).
  const queue = [...selected].map((id) => byId.get(id)).filter(Boolean);
  const visited = new Set(queue.map((item) => item.id));
  while (queue.length) {
    const item = queue.shift();
    const packed = isCylinderSet(item) ? accessoryItemsForItem(list, item) : packedAccessories(item, list, { accessoryChoices }).packed;
    for (const accessory of packed) {
      if (accessory.id === item.id || included.has(accessory.id)) continue;
      // Two items linked to each other (a drysuit ↔ its undergarment) never swallow one another:
      // the one the diver selected stays selectable, with its own questions.
      if ((accessory.accessoryItemIds || []).includes(item.id) && selected.has(accessory.id)) continue;
      included.set(accessory.id, item);
      if (!visited.has(accessory.id)) { visited.add(accessory.id); queue.push(accessory); }
    }
  }
  // A selected item is never hidden inside something it links to itself.
  for (const id of [...included.keys()]) {
    const parent = included.get(id);
    if (selected.has(id) && (byId.get(id)?.accessoryItemIds || []).includes(parent.id)) included.delete(id);
  }
  return included;
}

// For each selected item, the alternatives it offers (e.g. undergarments): optionId → { item, category }.
export function alternativesOfSelection(itemIds, items) {
  const list = Array.isArray(items) ? items : [];
  const byId = new Map(list.map((entry) => [entry.id, entry]));
  const map = new Map();
  for (const id of itemIds || []) {
    const item = byId.get(id);
    if (!item) continue;
    for (const group of accessoryAlternatives(item, list)) for (const option of group.options) if (!map.has(option.id)) map.set(option.id, { item, category: group.category });
  }
  return map;
}

// Drops ids that are already packed as part of another selected item.
export function withoutIncluded(itemIds, items, accessoryChoices = {}) {
  const included = includedWithSelection(itemIds, items, accessoryChoices);
  return (itemIds || []).filter((id) => !included.has(id));
}

// --- Is this setup complete? ---------------------------------------------------------------------
// What a setup of each type needs, checked against everything it packs (its items, their linked gear
// and chosen undergarments). The diver answers each gap once — add something, or leave it out — and
// the review then collapses to a summary. Changing the setup's type starts a fresh review.
// Asked in this order: life support first, then comfort and safety.
const SCUBA_BASICS = ['regulator', 'cylinder', 'bcd', 'exposure', 'mask', 'fins', 'computer', 'weights', 'signal'];
const SETUP_NEEDS = {
  'Single tank': { list: SCUBA_BASICS, regulators: 1, cylinders: 1 },
  Doubles: { list: [...SCUBA_BASICS, 'backup-computer'], regulators: 2, cylinders: 2 },
  Sidemount: { list: [...SCUBA_BASICS, 'sidemount-harness', 'backup-computer'], regulators: 2, cylinders: 2 },
  Rebreather: { list: ['rebreather', 'exposure', 'regulator', 'cylinder', 'mask', 'fins', 'computer', 'backup-computer', 'signal'], regulators: 1, cylinders: 1, bailout: true },
  'Pony / bailout': { list: ['regulator', 'cylinder'], regulators: 1, cylinders: 1 },
  'Stage / deco': { list: ['regulator', 'cylinder'], regulators: 1, cylinders: 1 },
  Freedive: { list: ['exposure', 'mask', 'fins', 'weights', 'computer'] },
};

// Everything a setup actually packs: its items plus linked gear (hood, boots, set cylinders) and chosen undergarments.
export function packedItems(setup, items) {
  const list = Array.isArray(items) ? items : [];
  const byId = new Map(list.map((entry) => [entry.id, entry]));
  const ids = new Set(setup?.itemIds || []);
  for (const id of includedWithSelection(setup?.itemIds, list, setup?.accessoryChoices || {}).keys()) ids.add(id);
  return [...ids].map((id) => byId.get(id)).filter(Boolean);
}

const firstStagesOf = (regulator) => {
  if (['Full face mask', 'Second stage only'].includes(regulator.configuration)) return 0;
  const count = (regulator.components || []).filter((component) => component.type === 'First stage').length;
  return count || 1;
};

export function setupRequirements(setup, items) {
  const needs = SETUP_NEEDS[setup?.type];
  if (!needs) return [];
  const list = Array.isArray(items) ? items : [];
  const packed = packedItems(setup, list);
  const packedIds = new Set(packed.map((item) => item.id));
  const members = cylinderSetMemberIds(list);
  const of = (category) => packed.filter((item) => item.category === category);
  const skipped = new Set(setup.completeness?.skipped || []);
  const offer = (test) => list.filter((item) => !packedIds.has(item.id) && !members.has(item.id) && test(item));
  const regulators = of('Regulator');
  const firstStages = regulators.reduce((sum, item) => sum + firstStagesOf(item), 0);
  const cylinders = of('Cylinder / tank').filter((item) => !members.has(item.id) || !packed.some((set) => isCylinderSet(set) && (set.accessoryItemIds || []).includes(item.id)))
    .reduce((sum, item) => sum + (isCylinderSet(item) ? Math.max(2, (item.accessoryItemIds || []).length) : 1), 0);
  const computers = of('Dive computer').length;
  const drysuit = packed.find(isDrysuit);
  const bcds = of('BCD');
  const bail = needs.bailout ? 'bailout ' : '';
  const defs = {
    exposure: { label: 'Exposure protection', have: of('Exposure suit').length, need: 1, category: 'Exposure suit', title: 'No exposure protection', body: 'A wetsuit or drysuit keeps you warm and protected. Add one, or leave it out for warm water in a rash guard.' },
    bcd: { label: 'BCD', have: bcds.length, need: 1, category: 'BCD', title: 'No BCD', body: 'Your buoyancy control device — jacket, wing or backplate & wing.' },
    regulator: {
      label: needs.regulators > 1 ? 'Regulators' : `${bail ? 'Bailout r' : 'R'}egulator`, have: firstStages, need: needs.regulators || 1, category: 'Regulator',
      title: firstStages ? `Only ${firstStages} of ${needs.regulators} first stages` : `No ${bail}regulator`,
      body: needs.regulators > 1 ? `${setup.type} need${setup.type.endsWith('s') ? '' : 's'} one first stage per cylinder or post, so you have a fully redundant gas supply. A doubles or sidemount regulator set that lists two first stages counts as both.` : needs.bailout ? 'Open-circuit bailout: a regulator on a bailout cylinder, in case the loop fails.' : 'The regulator you breathe from. A full-face mask or a lone second stage needs a first stage to plug into.',
    },
    cylinder: {
      label: needs.cylinders > 1 ? 'Cylinders' : `${bail ? 'Bailout c' : 'C'}ylinder`, have: cylinders, need: needs.cylinders || 1, category: 'Cylinder / tank',
      title: cylinders ? `Only ${cylinders} of ${needs.cylinders} cylinders` : `No ${bail}cylinder`,
      body: needs.cylinders > 1 ? `${setup.type} need${setup.type.endsWith('s') ? '' : 's'} two cylinders — a doubles set or sidemount pair counts as both. If you rent cylinders at the site, leave this out.` : 'Leave it out if you rent or fill tanks at the site.',
    },
    mask: { label: 'Mask', have: of('Mask').length + regulators.filter((item) => item.configuration === 'Full face mask').length, need: 1, category: 'Mask', title: 'No mask', body: 'A full-face mask in this setup counts too.', also: (item) => item.category === 'Regulator' && item.configuration === 'Full face mask' },
    fins: { label: 'Fins', have: of('Fins').length, need: 1, category: 'Fins', title: 'No fins', body: 'Easy to leave on the dock. Add the pair you dive with this setup.' },
    computer: { label: 'Dive computer', have: computers, need: 1, category: 'Dive computer', title: 'No dive computer', body: 'Tracks depth, time and your no-decompression limit — or your dive plan.' },
    'backup-computer': { label: 'Backup computer', have: computers + of('Gauges / compass').length >= 2 ? 1 : 0, need: 1, category: 'Dive computer', title: 'No backup computer or bottom timer', body: 'Technical setups carry a second computer or a bottom timer and depth gauge, so one failure doesn’t end the plan.', also: (item) => item.category === 'Gauges / compass' },
    weights: { label: 'Weights', have: of('Weights').length, need: 1, category: 'Weights', title: 'No weights', body: 'Leave it out if this setup is heavy enough without them (steel doubles often are) or you use the dive shop’s.' },
    signal: { label: 'SMB & cutting tool', have: of('Surface safety').length + of('Cutting / signaling').length, need: 1, category: 'Surface safety', title: 'No SMB or cutting tool', body: 'A surface marker buoy and a line cutter or knife — many boats require an SMB.', also: (item) => item.category === 'Cutting / signaling' },
    'sidemount-harness': { label: 'Sidemount harness', have: bcds.filter((item) => item.configuration === 'Sidemount').length, need: 1, category: 'BCD', title: bcds.length ? `This setup's BCD isn't a sidemount harness` : 'No sidemount harness', body: 'Sidemount cylinders clip to a sidemount harness. Pick yours, or leave it if your BCD converts.', filter: (item) => item.configuration === 'Sidemount' },
    rebreather: { label: 'Rebreather', have: of('Rebreather').length, need: 1, category: 'Rebreather', title: 'No rebreather', body: 'The unit itself — its diluent and oxygen cylinders usually travel with it.' },
  };
  const requirements = needs.list.map((key) => ({ key, ...defs[key] }));
  // A drysuit needs a low-pressure inflator hose from one of the regulators — easy to forget.
  if (drysuit && regulators.length) requirements.push({
    key: 'drysuit-hose', label: 'Drysuit inflator hose', have: regulators.some((item) => (item.components || []).some((component) => component.type === 'Drysuit hose')) ? 1 : 0, need: 1,
    title: 'No drysuit inflator hose', body: `None of this setup's regulators lists a drysuit inflator hose for your ${drysuit.name}. Add the hose to a regulator (Edit → Parts), or leave this if it's covered.`, category: null,
  });
  return requirements.map((req) => ({
    ...req, met: req.have >= req.need, skipped: skipped.has(req.key),
    candidates: req.category ? offer((item) => (item.category === req.category && (!req.filter || req.filter(item))) || (req.also ? req.also(item) : false)) : [],
  }));
}

// The review's questions, in order — the undergarment choice for each drysuit, then each gap.
export function setupQuestions(setup, items) {
  // An empty setup is still being assembled, so gaps are noise. Start the one-time review only
  // after the diver adds the first item; its completion state remains untouched until then.
  if (!setup?.itemIds?.length) return [];
  const questions = unresolvedChoices(setup, items).map((choice) => ({ kind: 'choice', key: `choice:${choice.item.id}`, ...choice }));
  if (!setup?.completeness?.done) questions.push(...setupRequirements(setup, items).filter((req) => !req.met && !req.skipped).map((req) => ({ kind: 'requirement', ...req })));
  return questions;
}

// Once no questions are left, the review is done for good (until the type changes or it's reset).
function settleReview(setup, items) {
  const open = setupRequirements(setup, items).filter((req) => !req.met && !req.skipped).length;
  return open ? setup : { ...setup, completeness: { ...setup.completeness, done: true } };
}
export function skipRequirement(setup, key, items, now = new Date()) {
  const next = { ...setup, completeness: { ...(setup.completeness || {}), skipped: [...new Set([...(setup.completeness?.skipped || []), key])] }, updatedAt: now.toISOString() };
  return settleReview(next, items);
}
export function addToSetupForRequirement(setup, itemId, items, now = new Date()) {
  const next = { ...setup, itemIds: setup.itemIds.includes(itemId) ? setup.itemIds : [...setup.itemIds, itemId], updatedAt: now.toISOString() };
  return settleReview(next, items);
}
export function resetSetupReview(setup, now = new Date()) {
  return { ...setup, completeness: { skipped: [], done: false, type: setup.type }, updatedAt: now.toISOString() };
}
