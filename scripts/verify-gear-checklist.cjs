const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadSourceModule } = require('./lib/load-source-module.cjs');

const root = path.join(__dirname, '..');
const srcRoot = path.join(root, 'src');
const model = loadSourceModule(path.join(srcRoot, 'features/gearChecklist/model.js'), srcRoot);
const {
  COMPONENT_TYPES,
  EXPOSURE_SUIT_TYPES,
  GEAR_CATEGORIES,
  GEAR_STATE_VERSION,
  GUIDED_CATEGORIES,
  accessoryItemsForItem,
  assignItemToSetups,
  checklistEntriesForItem,
  checklistItemIdForKey,
  createInitialGearState,
  emptyGearComponent,
  emptyGearItem,
  exposureComponentTemplate,
  gearSummary,
  normalizeGearComponent,
  normalizeGearItem,
  normalizeGearState,
  parentItemsForAccessory,
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

for (const guided of ['Regulator', 'BCD', 'Exposure suit']) {
  assert.ok(GUIDED_CATEGORIES.includes(guided), `${guided} should have a guided add flow`);
}
assert.deepEqual(EXPOSURE_SUIT_TYPES, ['Wetsuit', 'Drysuit']);
assert.ok(COMPONENT_TYPES['Exposure suit'].includes('Dry gloves'));
const exposureItem = normalizeGearItem({
  ...emptyGearItem(), id: 'exp-1', name: 'Trilam drysuit', category: 'Exposure suit', configuration: 'Drysuit', isAssembly: true,
  components: exposureComponentTemplate(),
}, new Date('2026-01-01T12:00:00Z'));
assert.equal(exposureItem.configuration, 'Drysuit');
assert.equal(exposureItem.components.length, 4);
assert.ok(exposureItem.components.some((component) => component.type === 'Hood'));

const bootsItem = normalizeGearItem({ ...emptyGearItem(), id: 'boots-1', name: 'Whites boots', category: 'Boots' }, new Date('2026-01-01T12:00:00Z'));
const suitWithAccessory = normalizeGearItem({ ...emptyGearItem(), id: 'suit-1', name: 'Whites Fusion Bullet', category: 'Exposure suit', accessoryItemIds: ['boots-1', 'boots-1', 'missing-item'] }, new Date('2026-01-01T12:00:00Z'));
const linkedState = normalizeGearState({ items: [bootsItem, suitWithAccessory], setups: [] });
const linkedSuit = linkedState.items.find((entry) => entry.id === 'suit-1');
assert.deepEqual(linkedSuit.accessoryItemIds, ['boots-1'], 'accessoryItemIds dedupe and drop references to items that no longer exist');
assert.deepEqual(accessoryItemsForItem(linkedState.items, linkedSuit).map((entry) => entry.id), ['boots-1'], 'a linked accessory resolves to the real locker item, not a copy');
assert.deepEqual(parentItemsForAccessory(linkedState.items, 'boots-1').map((entry) => entry.id), ['suit-1'], 'the reverse lookup finds what an item is linked into');
assert.equal(linkedState.items.length, 2, 'linking an accessory must not create a second top-level item for it');

// A drysuit's dry-glove system (a component) and its linked hood/boots (accessories) must each be
// their own checkable checklist entry, so checking the drysuit itself off can't silently mark
// them packed too.
const bootsAccessory = normalizeGearItem({ ...emptyGearItem(), id: 'boots-2', name: 'Whites Boots', category: 'Boots' }, new Date('2026-01-01T12:00:00Z'));
const hoodAccessory = normalizeGearItem({ ...emptyGearItem(), id: 'hood-2', name: 'Whites Hood', category: 'Hood' }, new Date('2026-01-01T12:00:00Z'));
const drysuitItem = normalizeGearItem({
  ...emptyGearItem(), id: 'drysuit-1', name: 'Fusion Bullet', category: 'Exposure suit', isAssembly: true,
  components: [{ ...emptyGearComponent('Exposure suit', 'Dry gloves'), id: 'dg-1', type: 'Dry gloves', name: 'Dry glove system' }],
  accessoryItemIds: ['boots-2', 'hood-2'],
}, new Date('2026-01-01T12:00:00Z'));
const maskItem = normalizeGearItem({ ...emptyGearItem(), id: 'mask-1', name: 'Mask', category: 'Mask' }, new Date('2026-01-01T12:00:00Z'));
const checklistItems = [drysuitItem, bootsAccessory, hoodAccessory, maskItem];

const drysuitEntries = checklistEntriesForItem(drysuitItem, checklistItems);
assert.equal(drysuitEntries.parts.length, 3, 'the drysuit checklist must expand into its dry-glove component plus its linked hood and boots');
assert.deepEqual(drysuitEntries.parts.map((part) => part.label).sort(), ['Dry glove system', 'Whites Boots', 'Whites Hood']);
assert.equal(checklistItemIdForKey(drysuitEntries.parts[0].key), 'drysuit-1', 'a part key must resolve back to its parent item id');
assert.equal(checklistItemIdForKey('mask-1'), 'mask-1', 'a bare item id with no parts must resolve to itself');

const dryGlovesKey = drysuitEntries.parts.find((part) => part.label === 'Dry glove system').key;
const setup = { itemIds: ['drysuit-1', 'mask-1'], checkedIds: ['drysuit-1', dryGlovesKey, 'mask-1'] };
assert.deepEqual(setupProgress(setup, checklistItems), { total: 5, checked: 3, ratio: 3 / 5 }, 'checking the drysuit itself off must not silently count its unchecked hood and boots as packed');
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

// Tapping a gear item must land on a read-only detail view, not straight into the editor.
assert.match(screen, /function GearItemDetail/, 'a dedicated read-only gear detail view must exist');
assert.match(screen, /route\.name === 'gear-detail'/, 'the gear detail view must be a routed screen');
const detailOpenCount = (screen.match(/onOpen=\{\(item\) => setRoute\(\{ name: 'gear-detail', itemId: item\.id \}\)\}/g) || []).length;
assert.equal(detailOpenCount, 2, 'both the inventory row and the service entry must open the detail view, not the edit form');

// A setup's packing checklist must expand an assembly into its parts, not offer one checkbox
// that silently stands in for gear that was never actually verified as packed.
assert.match(screen, /function ChecklistItemRows/, 'the setup checklist must render each item\'s parts, not just the item');
assert.match(screen, /checklistEntriesForItem\(item, items\)/, 'the checklist must expand components and linked accessories per item');
assert.match(screen, /onSetChecked\(allKeys, !allChecked\)/, 'checking a parent row must set all of its part keys together, not just the item\'s own key');
assert.match(screen, /gear\.setCheckedKeys\(activeSetup\.id, keys, checked\)/, 'the batch checklist toggle must be wired to the atomic setCheckedKeys, not a loop of toggleChecked');
assert.match(screen, /setupProgress\(setup, items\)/, 'setup packing progress must count parts, matching the expanded checklist');
assert.match(screen, /ADD EXISTING GEAR/, 'adding gear already in the locker to a setup must be a clearly labeled, discoverable action');
assert.match(screen, /accessoryItemsForItem/, 'the detail view shows linked accessory items');
assert.match(screen, /parentItemsForAccessory/, 'the detail view shows what an item is linked into');
assert.match(screen, /onOpenAccessory/, 'a linked accessory opens its own detail view');

// The edit form is tabbed horizontally instead of one long vertical scroll through every section.
assert.match(screen, /const FORM_SECTIONS = \[/, 'the edit form must define its horizontal tab sections');
assert.match(screen, /<ScrollView horizontal contentContainerStyle=\{styles\.formTabs\}/, 'the edit form must have a horizontally-scrolling tab bar');
assert.match(screen, /activeSection === 'identity'/, 'the edit form must show one section at a time by activeSection');
assert.match(screen, /setActiveSection\('identity'\)/, 'a failed save must surface on the tab holding the invalid field');

const hook = fs.readFileSync(path.join(srcRoot, 'features/gearChecklist/useGearChecklist.js'), 'utf8');
assert.match(hook, /const saveItems = async \(drafts\) =>/, 'a batch save must exist so a wizard-built assembly and its accessories commit together atomically');
assert.match(hook, /^\s*saveItems,\s*$/m, 'saveItems must be exposed from the hook');

const wizard = fs.readFileSync(path.join(srcRoot, 'features/gearChecklist/AddGearWizard.js'), 'utf8');
for (const expected of ['What are you adding?', 'first stage', 'second stage', 'alternate second stage', 'BCD inflator hose', 'SPG', 'wireless transmitter', 'Save gear item']) {
  assert.match(wizard, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), `${expected} must appear in the guided regulator wizard`);
}
assert.match(wizard, /CATEGORY_GROUPS/, 'the wizard uses the shared category groups');
for (const expected of ['Wetsuit or drysuit', 'Cut & thickness', 'Suit material', 'Replaceable seals', 'Built-in boots or socks', 'Dry glove system', 'exposureStepsFor']) {
  assert.match(wizard, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), `${expected} must appear in the guided exposure suit wizard`);
}
// Hood/Gloves/Boots must offer linking an existing locker item, not just re-describing a new one.
assert.match(wizard, /Which one\?/, 'the wizard must offer picking an existing locker item for hood\\/gloves\\/boots');
assert.match(wizard, /candidatesFor\('Boots'\)/, 'the boots step must list existing standalone Boots items to link');
assert.match(wizard, /accessoryItemId/, 'a linked existing item must be referenced, not re-described as a component');
assert.match(wizard, /pendingAccessories/, 'a quick-added new accessory must be created as its own locker item, not a components[] entry');
assert.match(wizard, /const id = createGearId\(\);\s*\n\s*return \{\s*\n\s*accessoryItemId: id,/, 'a quick-added accessory must get its id up front, before the parent item is built, so the batch save needs no follow-up merge step');

// A save-in-a-loop (saveItem, saveItem, saveItem…) clobbers itself: each call closes over the
// state from render time, so a later call in the same batch can't see what an earlier call just
// wrote. The wizard route must save the assembly and its new accessories in one atomic batch.
assert.match(screen, /gear\.saveItems\(\[\.\.\.pendingAccessories, item\]\)/, 'the wizard route must save the assembly and its new accessories in a single atomic batch, not a loop of individual saves');
assert.doesNotMatch(screen, /for \(const accessory of pendingAccessories\)/, 'must not go back to a per-accessory save loop, which clobbers itself');

const catalog = fs.readFileSync(path.join(srcRoot, 'features/catalog/featureCatalog.js'), 'utf8');
const navigator = fs.readFileSync(path.join(srcRoot, 'application/AppNavigator.js'), 'utf8');
assert.match(catalog, /id: 'gear-checklist'/);
assert.match(navigator, /GearChecklistScreen/);

console.log('Gear checklist checks passed.');
