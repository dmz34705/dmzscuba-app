const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadSourceModule } = require('./lib/load-source-module.cjs');

const root = path.join(__dirname, '..');
const srcRoot = path.join(root, 'src');
const model = loadSourceModule(path.join(srcRoot, 'features/gearChecklist/model.js'), srcRoot);
const {
  GEAR_CATEGORIES,
  GEAR_STATE_VERSION,
  assignItemToSetups,
  createInitialGearState,
  emptyGearComponent,
  emptyGearItem,
  gearSummary,
  normalizeGearComponent,
  normalizeGearItem,
  normalizeGearState,
  regulatorComponentTemplate,
  serviceDueForItem,
  serviceEntriesForItem,
  serviceStatusForAssembly,
  serviceStatusForItem,
  setupIdsForItem,
  setupProgress,
} = model;

for (const required of ['Exposure suit', 'BCD', 'Regulator', 'Cylinder / tank', 'Fins', 'Boots', 'Hood', 'Gloves', 'Weights', 'Mask', 'Dive computer', 'Accessories']) {
  assert.ok(GEAR_CATEGORIES.includes(required), `${required} category is required`);
}

const initial = createInitialGearState(new Date('2026-01-01T12:00:00Z'));
assert.equal(initial.version, GEAR_STATE_VERSION);
assert.deepEqual(initial.setups.map((setup) => setup.name), ['Single Tank', 'Doubles', 'Sidemount']);
assert.equal(initial.items.length, 0);
assert.equal(normalizeGearState(null).setups.length, 3);
assert.equal(normalizeGearState({ items: [], setups: [] }).setups.length, 0, 'deleting every setup must not recreate defaults');

const item = normalizeGearItem({
  ...emptyGearItem(), id: 'reg-1', name: 'Primary regulator', category: 'Regulator', manufacturer: 'Example',
  configuration: 'Single tank', isAssembly: true,
  components: [{ ...emptyGearComponent('Regulator'), id: 'first-stage-1', type: 'First stage', name: 'DST first stage', nextServiceDate: '2026-02-01' }],
  attachments: [{ uri: 'file:///manual.pdf', name: 'Manual', kind: 'document' }],
}, new Date('2026-01-01T12:00:00Z'));
assert.equal(item.name, 'Primary regulator');
assert.equal(item.attachments.length, 1);
assert.equal(item.configuration, 'Single tank');
assert.equal(item.components.length, 1);
assert.equal(item.setupIds, undefined, 'setup memberships live canonically on setups');
assert.equal(normalizeGearComponent({ type: 'First stage', name: '' }, 'Regulator').name, 'First stage');
assert.equal(regulatorComponentTemplate('Doubles').filter((part) => part.type === 'First stage').length, 2);
assert.equal(regulatorComponentTemplate('Sidemount').filter((part) => part.type === 'SPG / pressure gauge').length, 2);
assert.ok(regulatorComponentTemplate('Single tank').some((part) => part.type === 'Alternate second stage'));

const assigned = assignItemToSetups(initial.setups, item.id, ['setup-single-tank', 'setup-doubles'], new Date('2026-01-02T12:00:00Z'));
assert.deepEqual(setupIdsForItem(assigned, item.id), ['setup-single-tank', 'setup-doubles']);
const removed = assignItemToSetups(assigned, item.id, ['setup-doubles'], new Date('2026-01-03T12:00:00Z'));
assert.deepEqual(setupIdsForItem(removed, item.id), ['setup-doubles']);

const migrated = normalizeGearState({ version: 1, items: [item], lists: [{ id: 'old-list', name: 'Warm Water', itemIds: [item.id], checkedIds: [item.id] }] });
assert.equal(migrated.version, 2);
assert.equal(migrated.setups[0].name, 'Warm Water');
assert.equal(migrated.setups[0].type, 'Custom');
assert.deepEqual(migrated.setups[0].checkedIds, [item.id]);

const intervalItem = { condition: 'Ready', lastServiceDate: '2025-03-15', nextServiceDate: '', serviceIntervalMonths: '12' };
assert.equal(serviceDueForItem(intervalItem).date.toISOString().slice(0, 10), '2026-03-15');
assert.equal(serviceStatusForItem(intervalItem, new Date('2026-03-01T12:00:00Z')).key, 'due-soon');
assert.equal(serviceStatusForItem(intervalItem, new Date('2026-03-16T12:00:00Z')).key, 'overdue');
assert.equal(serviceStatusForItem({ ...intervalItem, nextServiceDate: '2026-05-01' }, new Date('2026-03-01T12:00:00Z')).due.date.toISOString().slice(0, 10), '2026-05-01', 'explicit service date wins');

const cylinder = { condition: 'Ready', nextServiceDate: '2027-01-01', visualInspectionDue: '2026-04-01', hydrostaticTestDue: '2030-01-01' };
assert.equal(serviceDueForItem(cylinder).label, 'Visual inspection');
assert.equal(serviceStatusForItem({ condition: 'Out of service' }).key, 'blocked');

const setup = { itemIds: ['a', 'b', 'c'], checkedIds: ['a', 'c', 'missing'] };
assert.deepEqual(setupProgress(setup), { total: 3, checked: 2, ratio: 2 / 3 });
assert.equal(serviceEntriesForItem(item).length, 2, 'assembly and component both appear in service tracking');
assert.equal(serviceStatusForAssembly(item, new Date('2026-01-15T12:00:00Z')).label, 'PART: SERVICE DUE SOON');
assert.deepEqual(gearSummary({ items: [item, { id: 'simple', name: 'Mask', category: 'Mask', condition: 'Ready', attachments: [{}, {}], components: [] }] }, new Date('2026-01-15T12:00:00Z')), { total: 2, components: 1, ready: 2, alerts: 1, documents: 3 });

const screen = fs.readFileSync(path.join(srcRoot, 'screens/GearChecklistScreen.js'), 'utf8');
for (const expected of ['Inventory', 'Setups', 'Service', 'Assembly & parts', 'regulator parts', 'Manufacturer', 'Serial number', 'Photos & documents', 'Visual due', 'Hydro due', 'Add photos', 'Add document']) {
  assert.match(screen, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${expected} must appear in the gear UI`);
}
assert.match(screen, /setupIdsForItem/);
assert.match(screen, /toggleChecked/);
assert.match(screen, /defaultSetupId \? \[defaultSetupId\] : \[\]/, 'new gear can be preassigned to the active setup');
assert.match(screen, /<SetupDetail[\s\S]{0,300}onAddGear=\{\(\) => setRoute\(\{ name: 'add-gear-wizard', setupId: activeSetup\.id \}\)\}/, 'setup Add gear opens the guided add-gear wizard');
assert.match(screen, /AddGearWizard/, 'the guided add-gear wizard is wired into the gear screen');
assert.match(screen, /onAdd=\{\(\) => setRoute\(\{ name: 'add-gear-wizard' \}\)\}/, 'inventory Add a gear item opens the guided add-gear wizard');

const wizard = fs.readFileSync(path.join(srcRoot, 'features/gearChecklist/AddGearWizard.js'), 'utf8');
for (const expected of ['What are you adding?', 'first stage', 'second stage', 'alternate second stage', 'BCD inflator hose', 'SPG', 'wireless transmitter', 'Save gear item']) {
  assert.match(wizard, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), `${expected} must appear in the guided regulator wizard`);
}
assert.match(wizard, /CATEGORY_GROUPS/, 'the wizard uses the shared category groups');

const catalog = fs.readFileSync(path.join(srcRoot, 'features/catalog/featureCatalog.js'), 'utf8');
const navigator = fs.readFileSync(path.join(srcRoot, 'application/AppNavigator.js'), 'utf8');
assert.match(catalog, /id: 'gear-checklist'/);
assert.match(navigator, /GearChecklistScreen/);

console.log('Gear checklist checks passed.');
