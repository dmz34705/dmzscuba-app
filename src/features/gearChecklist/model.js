export const GEAR_CATEGORIES = Object.freeze([
  'Exposure suit',
  'BCD',
  'Regulator',
  'Cylinder / tank',
  'Fins',
  'Boots',
  'Hood',
  'Gloves',
  'Weights',
  'Mask',
  'Snorkel',
  'Dive computer',
  'Gauges / compass',
  'Lights',
  'Camera',
  'Cutting / signaling',
  'Surface safety',
  'Rebreather',
  'DPV / scooter',
  'Bags / storage',
  'Spare parts',
  'Accessories',
]);

export const GEAR_CONDITIONS = Object.freeze(['Ready', 'Needs attention', 'Out of service', 'Retired']);
export const SERVICE_INTERVALS = Object.freeze(['', '6', '12', '18', '24', '36', '60']);
export const GEAR_STATE_VERSION = 1;

export function createGearId(prefix = 'gear') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function emptyGearItem() {
  return {
    id: '',
    name: '',
    category: GEAR_CATEGORIES[0],
    condition: GEAR_CONDITIONS[0],
    manufacturer: '',
    model: '',
    serialNumber: '',
    quantity: '1',
    size: '',
    thickness: '',
    color: '',
    weight: '',
    capacity: '',
    workingPressure: '',
    lastServiceDate: '',
    nextServiceDate: '',
    serviceIntervalMonths: '',
    visualInspectionDue: '',
    hydrostaticTestDue: '',
    serviceNotes: '',
    purchaseDate: '',
    purchasePrice: '',
    retailer: '',
    warrantyUntil: '',
    notes: '',
    attachments: [],
    listIds: [],
  };
}

export function emptyGearList() {
  return { id: '', name: '', description: '', itemIds: [], checkedIds: [] };
}

export function createInitialGearState(now = new Date()) {
  const stamp = now.toISOString();
  return {
    version: GEAR_STATE_VERSION,
    items: [],
    lists: [
      { id: 'list-warm-water', name: 'Warm Water', description: 'Light exposure protection and tropical-water essentials.', itemIds: [], checkedIds: [], createdAt: stamp, updatedAt: stamp },
      { id: 'list-cold-water', name: 'Cold Water', description: 'Thermal protection, redundant equipment, and cold-water accessories.', itemIds: [], checkedIds: [], createdAt: stamp, updatedAt: stamp },
      { id: 'list-training', name: 'Pool & Training', description: 'Confined-water sessions, classes, and skills practice.', itemIds: [], checkedIds: [], createdAt: stamp, updatedAt: stamp },
    ],
  };
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function uniqueIds(value) {
  return [...new Set((Array.isArray(value) ? value : []).filter((id) => typeof id === 'string' && id))];
}

function normalizeAttachment(value) {
  if (!value || typeof value.uri !== 'string' || !value.uri) return null;
  return {
    id: cleanText(value.id) || createGearId('attachment'),
    kind: value.kind === 'photo' ? 'photo' : 'document',
    uri: value.uri,
    name: cleanText(value.name) || (value.kind === 'photo' ? 'Gear photo' : 'Document'),
    mimeType: cleanText(value.mimeType),
    size: Number.isFinite(value.size) ? value.size : null,
  };
}

export function normalizeGearItem(value = {}, now = new Date()) {
  const fallback = emptyGearItem();
  const createdAt = cleanText(value.createdAt) || now.toISOString();
  const normalized = {
    ...fallback,
    ...Object.fromEntries(Object.keys(fallback).filter((key) => typeof fallback[key] === 'string').map((key) => [key, cleanText(value[key])])),
    id: cleanText(value.id) || createGearId(),
    category: GEAR_CATEGORIES.includes(value.category) ? value.category : 'Accessories',
    condition: GEAR_CONDITIONS.includes(value.condition) ? value.condition : 'Ready',
    quantity: cleanText(value.quantity) || '1',
    attachments: (Array.isArray(value.attachments) ? value.attachments : []).map(normalizeAttachment).filter(Boolean),
    createdAt,
    updatedAt: now.toISOString(),
  };
  delete normalized.listIds;
  return normalized;
}

export function normalizeGearList(value = {}, now = new Date()) {
  const createdAt = cleanText(value.createdAt) || now.toISOString();
  const itemIds = uniqueIds(value.itemIds);
  return {
    id: cleanText(value.id) || createGearId('list'),
    name: cleanText(value.name) || 'Untitled checklist',
    description: cleanText(value.description),
    itemIds,
    checkedIds: uniqueIds(value.checkedIds).filter((id) => itemIds.includes(id)),
    createdAt,
    updatedAt: now.toISOString(),
  };
}

export function normalizeGearState(value) {
  if (!value || typeof value !== 'object') return createInitialGearState();
  const items = (Array.isArray(value.items) ? value.items : []).map((item) => normalizeGearItem(item));
  const itemIds = new Set(items.map((item) => item.id));
  const lists = (Array.isArray(value.lists) ? value.lists : []).map((list) => {
    const normalized = normalizeGearList(list);
    normalized.itemIds = normalized.itemIds.filter((id) => itemIds.has(id));
    normalized.checkedIds = normalized.checkedIds.filter((id) => itemIds.has(id));
    return normalized;
  });
  return { version: GEAR_STATE_VERSION, items, lists };
}

export function listIdsForItem(lists, itemId) {
  return (Array.isArray(lists) ? lists : []).filter((list) => list.itemIds.includes(itemId)).map((list) => list.id);
}

export function assignItemToLists(lists, itemId, selectedListIds, now = new Date()) {
  const selected = new Set(uniqueIds(selectedListIds));
  return lists.map((list) => {
    const alreadyIncluded = list.itemIds.includes(itemId);
    const shouldInclude = selected.has(list.id);
    if (alreadyIncluded === shouldInclude) return list;
    return {
      ...list,
      itemIds: shouldInclude ? [...list.itemIds, itemId] : list.itemIds.filter((id) => id !== itemId),
      checkedIds: shouldInclude ? list.checkedIds : list.checkedIds.filter((id) => id !== itemId),
      updatedAt: now.toISOString(),
    };
  });
}

function parseDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addMonths(date, months) {
  const result = new Date(date.getTime());
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

export function formatDateOnly(date) {
  return date ? date.toISOString().slice(0, 10) : '';
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

export function gearSummary(state, now = new Date()) {
  const items = Array.isArray(state?.items) ? state.items : [];
  const statuses = items.map((item) => serviceStatusForItem(item, now));
  return {
    total: items.length,
    ready: items.filter((item) => item.condition === 'Ready').length,
    alerts: statuses.filter((status) => ['blocked', 'attention', 'overdue', 'due-soon'].includes(status.key)).length,
    documents: items.reduce((sum, item) => sum + (Array.isArray(item.attachments) ? item.attachments.length : 0), 0),
  };
}

export function checklistProgress(list) {
  const total = Array.isArray(list?.itemIds) ? list.itemIds.length : 0;
  const checked = Array.isArray(list?.checkedIds) ? list.checkedIds.filter((id) => list.itemIds.includes(id)).length : 0;
  return { total, checked, ratio: total ? checked / total : 0 };
}

export function sortGear(items) {
  return [...(Array.isArray(items) ? items : [])].sort((a, b) => {
    const category = GEAR_CATEGORIES.indexOf(a.category) - GEAR_CATEGORIES.indexOf(b.category);
    return category || a.name.localeCompare(b.name);
  });
}
