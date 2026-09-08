const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadSourceModule } = require('./lib/load-source-module.cjs');

const root = path.join(__dirname, '..');
const srcRoot = path.join(root, 'src');
const model = loadSourceModule(path.join(srcRoot, 'features/gearChecklist/model.js'), srcRoot);
const {
  GEAR_CATEGORIES,
  assignItemToLists,
  checklistProgress,
  createInitialGearState,
  emptyGearItem,
  gearSummary,
  listIdsForItem,
  normalizeGearItem,
  normalizeGearState,
  serviceDueForItem,
  serviceStatusForItem,
} = model;

for (const required of ['Exposure suit', 'BCD', 'Regulator', 'Cylinder / tank', 'Fins', 'Boots', 'Hood', 'Gloves', 'Weights', 'Mask', 'Dive computer', 'Accessories']) {
  assert.ok(GEAR_CATEGORIES.includes(required), `${required} category is required`);
}

const initial = createInitialGearState(new Date('2026-01-01T12:00:00Z'));
assert.deepEqual(initial.lists.map((list) => list.name), ['Warm Water', 'Cold Water', 'Pool & Training']);
assert.equal(initial.items.length, 0);
assert.equal(normalizeGearState(null).lists.length, 3);
assert.equal(normalizeGearState({ items: [], lists: [] }).lists.length, 0, 'deleting every list must not recreate defaults');

const item = normalizeGearItem({ ...emptyGearItem(), id: 'reg-1', name: 'Primary regulator', category: 'Regulator', manufacturer: 'Example', attachments: [{ uri: 'file:///manual.pdf', name: 'Manual', kind: 'document' }] }, new Date('2026-01-01T12:00:00Z'));
assert.equal(item.name, 'Primary regulator');
assert.equal(item.attachments.length, 1);
assert.equal(item.listIds, undefined, 'list memberships live canonically on lists');

const assigned = assignItemToLists(initial.lists, item.id, ['list-warm-water', 'list-cold-water'], new Date('2026-01-02T12:00:00Z'));
assert.deepEqual(listIdsForItem(assigned, item.id), ['list-warm-water', 'list-cold-water']);
const removed = assignItemToLists(assigned, item.id, ['list-cold-water'], new Date('2026-01-03T12:00:00Z'));
assert.deepEqual(listIdsForItem(removed, item.id), ['list-cold-water']);

const intervalItem = { condition: 'Ready', lastServiceDate: '2025-03-15', nextServiceDate: '', serviceIntervalMonths: '12' };
assert.equal(serviceDueForItem(intervalItem).date.toISOString().slice(0, 10), '2026-03-15');
assert.equal(serviceStatusForItem(intervalItem, new Date('2026-03-01T12:00:00Z')).key, 'due-soon');
assert.equal(serviceStatusForItem(intervalItem, new Date('2026-03-16T12:00:00Z')).key, 'overdue');
assert.equal(serviceStatusForItem({ ...intervalItem, nextServiceDate: '2026-05-01' }, new Date('2026-03-01T12:00:00Z')).due.date.toISOString().slice(0, 10), '2026-05-01', 'explicit service date wins');

const cylinder = { condition: 'Ready', nextServiceDate: '2027-01-01', visualInspectionDue: '2026-04-01', hydrostaticTestDue: '2030-01-01' };
assert.equal(serviceDueForItem(cylinder).label, 'Visual inspection');
assert.equal(serviceStatusForItem({ condition: 'Out of service' }).key, 'blocked');

const list = { itemIds: ['a', 'b', 'c'], checkedIds: ['a', 'c', 'missing'] };
assert.deepEqual(checklistProgress(list), { total: 3, checked: 2, ratio: 2 / 3 });
assert.deepEqual(gearSummary({ items: [intervalItem, { condition: 'Ready', attachments: [{}, {}] }] }, new Date('2026-03-01T12:00:00Z')), { total: 2, ready: 2, alerts: 1, documents: 2 });

const screen = fs.readFileSync(path.join(srcRoot, 'screens/GearChecklistScreen.js'), 'utf8');
for (const expected of ['Inventory', 'Checklists', 'Service', 'Manufacturer', 'Serial number', 'Photos & documents', 'Visual due', 'Hydro due', 'Add photos', 'Add document']) {
  assert.match(screen, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${expected} must appear in the gear UI`);
}
assert.match(screen, /listIdsForItem/);
assert.match(screen, /toggleChecked/);

const catalog = fs.readFileSync(path.join(srcRoot, 'features/catalog/featureCatalog.js'), 'utf8');
const navigator = fs.readFileSync(path.join(srcRoot, 'application/AppNavigator.js'), 'utf8');
assert.match(catalog, /id: 'gear-checklist'/);
assert.match(navigator, /GearChecklistScreen/);

console.log('Gear checklist checks passed.');
