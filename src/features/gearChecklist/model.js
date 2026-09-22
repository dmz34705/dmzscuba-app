export const GEAR_CATEGORIES = Object.freeze([
  'Exposure suit', 'BCD', 'Regulator', 'Cylinder / tank', 'Fins', 'Boots', 'Hood', 'Gloves', 'Weights', 'Mask', 'Snorkel',
  'Dive computer', 'Gauges / compass', 'Lights', 'Camera', 'Cutting / signaling', 'Surface safety', 'Rebreather', 'DPV / scooter',
  'Bags / storage', 'Spare parts', 'Accessories',
]);

// Grouped the same 22 GEAR_CATEGORIES for the "what are you adding?" picker so related gear sits together.
export const CATEGORY_GROUPS = Object.freeze([
  { label: 'Life support', categories: ['Regulator', 'BCD', 'Cylinder / tank', 'Rebreather'] },
  { label: 'Exposure protection', categories: ['Exposure suit', 'Hood', 'Gloves', 'Boots'] },
  { label: 'Core kit', categories: ['Mask', 'Fins', 'Snorkel', 'Weights'] },
  { label: 'Instruments', categories: ['Dive computer', 'Gauges / compass'] },
  { label: 'Extras', categories: ['Lights', 'Camera', 'Cutting / signaling', 'Surface safety', 'DPV / scooter', 'Bags / storage', 'Spare parts', 'Accessories'] },
]);

// Categories with a guided, step-by-step add flow. Everything else in CATEGORY_GROUPS still opens
// the full form, pre-set to the chosen category, until its own guided flow is built.
export const GUIDED_CATEGORIES = Object.freeze(['Regulator', 'BCD', 'Exposure suit']);

export const GEAR_CONDITIONS = Object.freeze(['Ready', 'Needs attention', 'Out of service', 'Retired']);
export const SERVICE_INTERVALS = Object.freeze(['', '6', '12', '18', '24', '36', '60']);
export const SETUP_TYPES = Object.freeze(['Single tank', 'Doubles', 'Sidemount', 'Pony / bailout', 'Stage / deco', 'Rebreather', 'Freedive', 'Travel', 'Custom']);
export const REGULATOR_CONFIGURATIONS = Object.freeze(['Single tank', 'Doubles', 'Sidemount', 'Pony / bailout', 'Stage / deco', 'Custom']);
export const TANK_CONFIGURATIONS = Object.freeze(['Single cylinder', 'Manifolded doubles', 'Independent doubles', 'Sidemount pair', 'Pony / bailout', 'Stage / deco', 'Custom']);
export const BCD_STYLES = Object.freeze(['Jacket', 'Back-inflate', 'Wing', 'Backplate & wing', 'Sidemount']);
export const EXPOSURE_SUIT_TYPES = Object.freeze(['Wetsuit', 'Drysuit']);
export const WETSUIT_CUTS = Object.freeze(['Shorty', 'Full']);
export const DRYSUIT_MATERIALS = Object.freeze(['Neoprene', 'Trilaminate', 'Membrane', 'Hybrid']);
export const SEAL_MATERIALS = Object.freeze(['Latex', 'Silicone', 'Neoprene']);
export const DRYSUIT_FEET_OPTIONS = Object.freeze(['Built-in boots', 'Socks']);
export const COMPONENT_TYPES = Object.freeze({
  Regulator: ['First stage', 'Primary second stage', 'Alternate second stage', 'Second stage', 'Breathing hose', 'Inflator hose', 'Drysuit hose', 'High-pressure hose', 'SPG / pressure gauge', 'Gauge console', 'Wireless transmitter', 'Other'],
  'Cylinder / tank': ['Cylinder', 'Valve', 'Manifold', 'Bands', 'Boot', 'Other'],
  BCD: ['Bladder', 'Inflator (LPI)', 'Integrated alternate (Air2/Airsource)', 'Weight pocket', 'Trim pocket', 'Corrugated hose', 'Dump valve', 'Cam / tank strap', 'D-ring', 'Other'],
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

export function emptyGearItem() {
  return {
    id: '', name: '', category: GEAR_CATEGORIES[0], condition: GEAR_CONDITIONS[0], manufacturer: '', model: '', serialNumber: '',
    quantity: '1', size: '', thickness: '', color: '', weight: '', capacity: '', workingPressure: '', configuration: '',
    isAssembly: false, components: [], lastServiceDate: '', nextServiceDate: '', serviceIntervalMonths: '', visualInspectionDue: '',
    hydrostaticTestDue: '', serviceNotes: '', purchaseDate: '', purchasePrice: '', retailer: '', warrantyUntil: '', notes: '',
    attachments: [], setupIds: [], accessoryItemIds: [],
  };
}

export function emptyGearSetup() {
  return { id: '', name: '', type: SETUP_TYPES[0], description: '', itemIds: [], checkedIds: [] };
}

export const emptyGearList = emptyGearSetup;

export function createInitialGearState(now = new Date()) {
  const stamp = now.toISOString();
  return {
    version: GEAR_STATE_VERSION,
    items: [],
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
  const configurationOptions = category === 'Regulator' ? REGULATOR_CONFIGURATIONS : category === 'Cylinder / tank' ? TANK_CONFIGURATIONS : category === 'BCD' ? BCD_STYLES : category === 'Exposure suit' ? EXPOSURE_SUIT_TYPES : [];
  const normalized = {
    ...fallback,
    ...Object.fromEntries(Object.keys(fallback).filter((key) => typeof fallback[key] === 'string').map((key) => [key, cleanText(value[key])])),
    id: cleanText(value.id) || createGearId(), category,
    condition: GEAR_CONDITIONS.includes(value.condition) ? value.condition : 'Ready', quantity: cleanText(value.quantity) || '1',
    configuration: configurationOptions.includes(value.configuration) ? value.configuration : '', isAssembly: Boolean(value.isAssembly || components.length),
    components, attachments: (Array.isArray(value.attachments) ? value.attachments : []).map(normalizeAttachment).filter(Boolean),
    accessoryItemIds: uniqueIds(value.accessoryItemIds),
    createdAt: cleanText(value.createdAt) || now.toISOString(), updatedAt: now.toISOString(),
  };
  delete normalized.listIds;
  delete normalized.setupIds;
  return normalized;
}

export function normalizeGearSetup(value = {}, now = new Date()) {
  const itemIds = uniqueIds(value.itemIds);
  return {
    id: cleanText(value.id) || createGearId('setup'), name: cleanText(value.name) || 'Untitled setup',
    type: SETUP_TYPES.includes(value.type) ? value.type : 'Custom', description: cleanText(value.description), itemIds,
    checkedIds: uniqueIds(value.checkedIds).filter((id) => itemIds.includes(id)), createdAt: cleanText(value.createdAt) || now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

export const normalizeGearList = normalizeGearSetup;

export function normalizeGearState(value) {
  if (!value || typeof value !== 'object') return createInitialGearState();
  const rawItems = (Array.isArray(value.items) ? value.items : []).map((item) => normalizeGearItem(item));
  const itemIds = new Set(rawItems.map((item) => item.id));
  const items = rawItems.map((item) => ({
    ...item, accessoryItemIds: item.accessoryItemIds.filter((id) => itemIds.has(id) && id !== item.id),
  }));
  const sourceSetups = Array.isArray(value.setups) ? value.setups : Array.isArray(value.lists) ? value.lists : [];
  const setups = sourceSetups.map((setup) => {
    const normalized = normalizeGearSetup(setup);
    normalized.itemIds = normalized.itemIds.filter((id) => itemIds.has(id));
    normalized.checkedIds = normalized.checkedIds.filter((id) => itemIds.has(id));
    return normalized;
  });
  return { version: GEAR_STATE_VERSION, items, setups };
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
  return {
    total: items.length, components: items.reduce((sum, item) => sum + (item.components?.length || 0), 0),
    ready: items.filter((item) => item.condition === 'Ready').length,
    alerts: statuses.filter((status) => ['blocked', 'attention', 'overdue', 'due-soon'].includes(status.key)).length,
    documents: items.reduce((sum, item) => sum + (Array.isArray(item.attachments) ? item.attachments.length : 0), 0),
  };
}

export function setupProgress(setup) {
  const total = Array.isArray(setup?.itemIds) ? setup.itemIds.length : 0;
  const checked = Array.isArray(setup?.checkedIds) ? setup.checkedIds.filter((id) => setup.itemIds.includes(id)).length : 0;
  return { total, checked, ratio: total ? checked / total : 0 };
}
export const checklistProgress = setupProgress;

export function sortGear(items) {
  return [...(Array.isArray(items) ? items : [])].sort((a, b) => {
    const category = GEAR_CATEGORIES.indexOf(a.category) - GEAR_CATEGORIES.indexOf(b.category);
    return category || a.name.localeCompare(b.name);
  });
}
