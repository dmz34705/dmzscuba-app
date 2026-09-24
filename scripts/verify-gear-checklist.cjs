const assert = require('node:assert/strict');
require('./verify-gear-advice.cjs');
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
  normalizeGearSetup,
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
assert.equal(model.componentCanHaveSerial('Primary second stage'), true);
assert.equal(model.componentCanHaveSerial('Wireless transmitter'), true);
assert.equal(model.componentCanHaveSerial('High-pressure hose'), false, 'hoses do not offer serial-number tracking');

const assigned = assignItemToSetups(initial.setups, item.id, ['setup-single-tank', 'setup-doubles'], new Date('2026-01-02T12:00:00Z'));
assert.deepEqual(setupIdsForItem(assigned, item.id), ['setup-single-tank', 'setup-doubles']);
const removed = assignItemToSetups(assigned, item.id, ['setup-doubles'], new Date('2026-01-03T12:00:00Z'));
assert.deepEqual(setupIdsForItem(removed, item.id), ['setup-doubles']);

const migrated = normalizeGearState({ version: 1, items: [item], lists: [{ id: 'old-list', name: 'Warm Water', itemIds: [item.id], checkedIds: [item.id] }] });
assert.equal(migrated.version, 2);
assert.equal(migrated.setups[0].name, 'Warm Water');
assert.equal(migrated.setups[0].type, 'Custom');
assert.deepEqual(migrated.setups[0].checkedIds, [item.id]);

const oldPonyLink = normalizeGearState({
  items: [
    { id: 'pony-reg', name: 'Pony regulator', category: 'Regulator', configuration: 'Pony / bailout', accessoryItemIds: ['pony-tank'] },
    { id: 'pony-tank', name: 'AL40 bailout', category: 'Cylinder / tank', configuration: 'Pony / bailout' },
  ],
  setups: [{ id: 'pony', name: 'Pony', type: 'Pony / bailout', itemIds: ['pony-reg'], checkedIds: ['pony-reg::accessory::pony-tank'] }],
});
assert.deepEqual(oldPonyLink.items.find((entry) => entry.id === 'pony-reg').accessoryItemIds, [], 'a regulator never buries its bailout cylinder as an accessory');
assert.deepEqual(oldPonyLink.setups[0].itemIds, ['pony-reg', 'pony-tank'], 'an old linked bailout pair becomes two peer setup items');
assert.deepEqual(oldPonyLink.setups[0].checkedIds, ['pony-tank'], 'a packed linked cylinder stays packed after promotion');

const intervalItem = { condition: 'Ready', lastServiceDate: '2025-03-15', nextServiceDate: '', serviceIntervalMonths: '12' };
assert.equal(model.updateServiceSchedule({ lastServiceDate: '2025-03-15', nextServiceDate: '', serviceIntervalMonths: '' }, { serviceIntervalMonths: '12' }).nextServiceDate, '2026-03-15', 'selecting an interval fills the next service date');
assert.equal(model.updateServiceSchedule({ lastServiceDate: '', nextServiceDate: '', serviceIntervalMonths: '6' }, { lastServiceDate: '2025-10-24' }).nextServiceDate, '2026-04-24', 'entering the last service date also fills the next date when an interval is already selected');
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
assert.match(screen, /<SetupDetail[\s\S]{0,800}onAddGear=\{\(\) => setRoute\(\{ name: 'add-gear-wizard', setupId: activeSetup\.id \}\)\}/, 'setup Add gear opens the guided add-gear wizard');
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
assert.match(screen, /checklistEntriesForItem\(item, items(, setup)?\)/, 'the checklist must expand components and linked accessories per item');
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
const cylinderWizard = fs.readFileSync(path.join(srcRoot, 'features/gearChecklist/CylinderWizard.js'), 'utf8');
for (const expected of ['What are you adding?', 'first stage', 'second stage', 'alternate second stage', 'BCD inflator hose', 'SPG', 'wireless transmitter', 'Save gear item']) {
  assert.match(wizard, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), `${expected} must appear in the guided regulator wizard`);
}
assert.match(wizard, /CATEGORY_GROUPS/, 'the wizard uses the shared category groups');
assert.match(wizard, /inputAccessoryViewID=\{NUMBER_KEYBOARD_ACCESSORY_ID\}/, 'guided gear fields get the keyboard Done toolbar');
assert.match(cylinderWizard, /inputAccessoryViewID=\{NUMBER_KEYBOARD_ACCESSORY_ID\}/, 'guided cylinder fields get the same keyboard Done toolbar');
for (const serialPart of ['firstStage.serialNumber', 'secondStage.serialNumber', 'alternate.serialNumber', 'spg.serialNumber', 'transmitter.serialNumber', 'ffm.comms.serialNumber']) {
  assert.match(wizard, new RegExp(serialPart.replace('.', '\\.')), `${serialPart} must be captured by the regulator wizard`);
}
assert.match(screen, /componentCanHaveSerial\(component\.type\)/, 'tracked parts can edit and display their own serial numbers while hoses do not');
assert.match(wizard, /updateServiceSchedule/, 'guided gear flows calculate the next service date');
assert.match(screen, /updateServiceSchedule/, 'full gear and component forms calculate the next service date');
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


// --- Cylinders: each cylinder is its own item; a doubles / sidemount set links its two cylinders ---
const C = loadSourceModule(path.join(srcRoot, 'features/gearChecklist/cylinders.js'), srcRoot);
assert.ok(GUIDED_CATEGORIES.includes('Cylinder / tank'), 'cylinders have a guided flow');
const single = C.buildCylinderDrafts({ ...C.emptyState(''), setup: 'Single tank', material: 'Aluminum', preset: 'AL80', capacity: '77.4 cu ft · 11.1 L', pressure: '3000 psi · 207 bar',
  valve: { type: 'DIN', manufacturer: 'Thermo', model: '' }, color: 'Yellow', boot: true, bootColor: 'Black',
  cylinders: [{ serialNumber: 'AB123', lastHydro: '2024-03-10', hydroDue: '2029-03-10', lastVisual: '2025-06-01', visualDue: '2026-06-01' }, C.emptyCylinder()] });
assert.equal(single.pendingAccessories.length, 0);
assert.equal(single.item.name, 'AL80'); assert.equal(single.item.configuration, 'Single cylinder'); assert.equal(single.item.valveType, 'DIN');
assert.deepEqual(single.item.components.map((c) => c.type), ['Valve', 'Boot']);
assert.equal(single.item.hydrostaticTestDue, '2029-03-10'); assert.equal(single.item.lastVisualInspection, '2025-06-01');
assert.equal(model.addMonthsToDateOnly('2024-03-10', model.HYDRO_INTERVAL_MONTHS), '2029-03-10', 'hydro due defaults to 5 years');

const doubles = C.buildCylinderDrafts({ ...C.emptyState('setup-doubles'), setup: 'Doubles', manifold: 'manifold', material: 'Steel', preset: 'HP100', capacity: '100 cu ft', pressure: '3442 psi',
  valve: { type: 'DIN', manufacturer: '', model: '' }, boot: false, sameDates: true,
  cylinders: [{ serialNumber: 'L1', lastHydro: '2023-01-01', hydroDue: '2028-01-01', lastVisual: '', visualDue: '2026-01-01' }, { ...C.emptyCylinder(), serialNumber: 'R1' }] });
const [left, right] = doubles.pendingAccessories;
assert.equal(doubles.item.name, 'Double HP100s'); assert.equal(doubles.item.configuration, 'Manifolded doubles');
assert.deepEqual(doubles.item.accessoryItemIds, [left.id, right.id], 'the set links both cylinders');
assert.deepEqual(doubles.item.components.map((c) => c.type), ['Manifold', 'Bands']);
assert.equal(right.serialNumber, 'R1'); assert.equal(right.hydrostaticTestDue, '2028-01-01', 'same dates copy to the second cylinder');
assert.deepEqual(doubles.item.setupIds, ['setup-doubles']); assert.deepEqual(left.setupIds, [], 'the set, not each cylinder, goes in the setup');
const bailout = C.buildCylinderDrafts({ ...C.emptyState('pony'), setup: 'Pony / bailout', material: 'Aluminum', preset: 'AL40', cylinders: [{ ...C.emptyCylinder(), serialNumber: 'PONY1' }, C.emptyCylinder()] });
assert.equal(bailout.item.configuration, 'Pony / bailout'); assert.match(bailout.item.name, /bailout$/); assert.deepEqual(bailout.item.setupIds, ['pony']);
const lockerItems = [...doubles.pendingAccessories, doubles.item].map((entry) => normalizeGearItem(entry));
assert.ok(model.isCylinderSet(lockerItems[2]));
assert.equal(model.unpairedCylinders(lockerItems).length, 0, 'cylinders already in a set are not offered for another set');
assert.equal(parentItemsForAccessory(lockerItems, left.id)[0].name, 'Double HP100s');
const set = lockerItems[2];
const overdueCylinder = { ...lockerItems[0], hydrostaticTestDue: '2020-01-01' };
assert.match(model.serviceStatusForSet(set, [overdueCylinder, lockerItems[1], set], new Date('2026-01-15T12:00:00Z')).label, /HYDRO.*OVERDUE/, 'a set shows its cylinders’ inspections');
const sidemount = C.buildCylinderDrafts({ ...C.emptyState(''), setup: 'Sidemount pair', source: 'existing', linkedIds: ['a', 'b'] }, [
  normalizeGearItem({ id: 'a', name: 'AL80 #1', category: 'Cylinder / tank', model: 'AL80', capacity: '77.4 cu ft' }), normalizeGearItem({ id: 'b', name: 'AL80 #2', category: 'Cylinder / tank', model: 'AL80' })]);
assert.equal(sidemount.pendingAccessories.length, 0, 'linking existing cylinders adds no new ones');
assert.deepEqual(sidemount.item.accessoryItemIds, ['a', 'b']); assert.equal(sidemount.item.name, 'AL80 sidemount pair'); assert.equal(sidemount.item.capacity, '2 × 77.4 cu ft');

// --- Floating gear: one physical item, on at most one setup; packing it somewhere moves it there ---
const floatState = normalizeGearState({
  items: [{ id: 'tx', name: 'Perdix transmitter', category: 'Transmitter', floating: true, currentSetupId: 'setup-doubles' }, { id: 'mask', name: 'Mask', category: 'Mask' }],
  setups: [{ id: 'setup-doubles', name: 'Doubles', itemIds: ['tx'], checkedIds: ['tx'] }, { id: 'setup-sidemount', name: 'Sidemount', itemIds: ['tx', 'mask'], checkedIds: [] }],
});
assert.equal(model.floatingLocation(floatState.items[0], floatState.setups).name, 'Doubles');
const packed = model.applyChecks(floatState, 'setup-sidemount', ['tx'], true);
assert.equal(packed.items[0].currentSetupId, 'setup-sidemount', 'checking a floating item off moves it');
assert.deepEqual(packed.setups[0].checkedIds, [], 'and it is no longer packed on the other setup');
assert.deepEqual(packed.setups[1].checkedIds, ['tx']);
assert.equal(model.applyChecks(floatState, 'setup-sidemount', ['mask'], true).items[0].currentSetupId, 'setup-doubles', 'ordinary items never move floating gear');
const offAll = model.moveFloatingItem(floatState, 'tx', '');
assert.equal(offAll.items[0].currentSetupId, ''); assert.deepEqual(offAll.setups[0].checkedIds, []);
assert.equal(normalizeGearState({ ...floatState, setups: floatState.setups.slice(1) }).items[0].currentSetupId, '', 'a deleted setup clears the location');
assert.equal(normalizeGearItem({ name: 'x', currentSetupId: 'setup-doubles' }).currentSetupId, '', 'only floating items have a location');

// --- Search ---
const searchable = [normalizeGearItem({ name: 'Primary reg', category: 'Regulator', manufacturer: 'Apeks', components: [{ type: 'First stage', name: 'First stage', serialNumber: 'XT-99' }] }), normalizeGearItem({ name: 'Yellow AL80', category: 'Cylinder / tank', color: 'Yellow' })];
assert.equal(model.searchGear(searchable, 'apeks').length, 1);
assert.equal(model.searchGear(searchable, 'xt-99')[0].name, 'Primary reg', 'part serials are searchable');
assert.equal(model.searchGear(searchable, 'yellow cylinder').length, 1, 'every word must match');
assert.equal(model.searchGear(searchable, '').length, 2);

// --- Inventory sorting and filters compose with search/category rather than replacing them ---
const filterable = normalizeGearState({
  items: [
    { id: 'ready-reg', name: 'Primary reg', category: 'Regulator', manufacturer: 'Zeagle', condition: 'Ready', nextServiceDate: '2027-01-01', createdAt: '2025-01-01T00:00:00Z' },
    { id: 'late-bcd', name: 'Travel BCD', category: 'BCD', manufacturer: 'Aqualung', condition: 'Needs attention', nextServiceDate: '2025-01-01', createdAt: '2026-01-01T00:00:00Z' },
    { id: 'float-mask', name: 'Backup mask', category: 'Mask', floating: true, condition: 'Ready', createdAt: '2025-06-01T00:00:00Z' },
  ],
  setups: [{ id: 'travel', name: 'Travel', type: 'Travel', itemIds: ['ready-reg'], checkedIds: [] }],
});
const filterNow = new Date('2026-06-01T12:00:00Z');
assert.deepEqual(model.filterGear(filterable.items, { condition: 'Needs attention' }, filterable.setups, filterNow).map((item) => item.id), ['late-bcd']);
assert.deepEqual(model.filterGear(filterable.items, { service: 'Needs action' }, filterable.setups, filterNow).map((item) => item.id), ['late-bcd']);
assert.deepEqual(model.filterGear(filterable.items, { location: 'In a setup' }, filterable.setups, filterNow).map((item) => item.id), ['ready-reg']);
assert.deepEqual(model.filterGear(filterable.items, { location: 'Floating' }, filterable.setups, filterNow).map((item) => item.id), ['float-mask']);
assert.deepEqual(model.sortGearBy(filterable.items, 'Manufacturer').map((item) => item.id), ['float-mask', 'late-bcd', 'ready-reg']);
assert.deepEqual(model.sortGearBy(filterable.items, 'Recently added').map((item) => item.id), ['late-bcd', 'float-mask', 'ready-reg']);

// --- Dive computers from the logbook appear in the locker, once ---
const rows = [{ id: 'd1', startTime: '2025-05-01T10:00:00Z', maxDepthMeters: 30, deviceKeys: ['Shearwater|Perdix 2|1234ABCD'] }, { id: 'd2', startTime: '2025-06-01T10:00:00Z', maxDepthMeters: 18, deviceKeys: ['Shearwater|Perdix 2|1234ABCD'] }];
const synced = model.syncDiveComputers(normalizeGearState(null), rows);
const computer = synced.items.find((entry) => entry.deviceKey);
assert.equal(computer.category, 'Dive computer'); assert.equal(computer.name, 'Shearwater Perdix 2'); assert.equal(computer.serialNumber, '1234ABCD');
assert.equal(model.syncDiveComputers(synced, rows), synced, 'a computer is only added once');
assert.ok(model.isLockedLogbookComputer(computer, rows), 'a computer with dives in the logbook cannot be deleted');
assert.ok(!model.isLockedLogbookComputer(computer, []), 'once no dives from it remain, it can be deleted');
assert.ok(!model.isLockedLogbookComputer(normalizeGearItem({ name: 'Old computer', category: 'Dive computer' }), rows), 'computers added by hand stay deletable');
assert.match(hook, /isLockedLogbookComputer\(item, diveRows\)\) throw/, 'deleting a logbook computer is refused, not just hidden');
assert.match(screen, /isEditing && !fromLogbook \? <SecondaryButton label="Delete gear item"/, 'the delete button is hidden for logbook computers');
const claimed = model.syncDiveComputers(normalizeGearState({ items: [{ id: 'mine', name: 'My Perdix', category: 'Dive computer', manufacturer: 'Shearwater', model: 'Perdix 2' }], setups: [] }), rows);
assert.equal(claimed.items.length, 1, 'a computer the diver already added is claimed, not duplicated'); assert.equal(claimed.items[0].deviceKey, 'Shearwater|Perdix 2|1234ABCD');
const stats = model.diveComputerLogStats(rows, 'Shearwater|Perdix 2|1234ABCD');
assert.equal(stats.count, 2); assert.equal(stats.first, '2025-05-01'); assert.equal(stats.last, '2025-06-01');

// --- Regulators without their own first stage (full-face masks, spare second stages) ---
assert.ok(model.REGULATOR_CONFIGURATIONS.includes('Full face mask') && model.REGULATOR_CONFIGURATIONS.includes('Second stage only'));
for (const type of ['Full face mask', 'Quick disconnect', 'Communications unit']) assert.ok(COMPONENT_TYPES.Regulator.includes(type), `${type} is a regulator part`);
assert.match(wizard, /FFM_STEPS = \['basics', 'ffm-regulator', 'ffm-connection', 'ffm-comms', 'extras', 'details'\]/, 'a full-face mask skips the first-stage and hose steps');
assert.match(wizard, /SECOND_ONLY_STEPS = \['basics', 'second-stage', 'extras', 'details'\]/, 'a lone second stage skips the first stage');
assert.match(wizard, /floating: kind\.value !== 'set'/, 'regulators without a first stage start out floating');
const ffmItem = normalizeGearItem({ name: 'Guardian', category: 'Regulator', configuration: 'Full face mask', floating: true, currentSetupId: 'x', components: [{ type: 'Full face mask', name: 'Mask' }, { type: 'Communications unit', name: 'Comms unit' }] });
assert.equal(ffmItem.configuration, 'Full face mask'); assert.equal(ffmItem.components[1].type, 'Communications unit'); assert.equal(ffmItem.floating, true);

// --- Drysuit undergarments ---
assert.ok(GEAR_CATEGORIES.includes('Undergarment') && GUIDED_CATEGORIES.includes('Undergarment'));
assert.ok(model.CATEGORY_GROUPS.find((group) => group.label === 'Exposure protection').categories.includes('Undergarment'));
assert.deepEqual(model.undergarmentComponentTemplate('Two-piece').map((c) => c.type), ['Top', 'Bottom']);
assert.deepEqual(model.undergarmentComponentTemplate('Layer system').map((c) => c.type), ['Base layer', 'Mid layer']);
assert.deepEqual(model.undergarmentComponentTemplate('One-piece').map((c) => c.type), ['One-piece suit']);
const undersuit = normalizeGearItem({ name: 'Arctic', category: 'Undergarment', configuration: 'Two-piece', components: [{ type: 'Top', name: 'Top' }, { type: 'Heating system', name: 'Heating system' }] });
assert.equal(undersuit.configuration, 'Two-piece'); assert.equal(undersuit.components[1].type, 'Heating system');
assert.match(wizard, /buildUndergarmentDraft\(under\)/, 'the undergarment flow saves through its own builder');
assert.ok(!/title="Which drysuit\?"/.test(wizard) && !/drysuitIds/.test(wizard), 'undergarments are not linked to a drysuit in the wizard — setups pick them');
assert.match(wizard, /partTypes=\{UNDERGARMENT_PART_TYPES\} showSize \/>/, 'undergarment pieces reuse the extra-part rows, with a size');

// --- Undergarments are picked per setup for each drysuit (never linked to the suit) ---
const altItems = normalizeGearState({
  items: [
    { id: 'dry', name: 'Drysuit', category: 'Exposure suit', configuration: 'Drysuit', accessoryItemIds: ['ug-warm', 'boots'] },
    { id: 'ug-warm', name: 'Arctic 400', category: 'Undergarment', accessoryItemIds: ['dry'] }, { id: 'ug-light', name: 'Halo 3D', category: 'Undergarment' }, { id: 'boots', name: 'Rock boots', category: 'Boots' },
  ],
  setups: [{ id: 'cold', name: 'Cold lake', itemIds: ['dry'], checkedIds: ['dry::accessory::boots'] }],
});
const dry = altItems.items[0];
assert.deepEqual(dry.accessoryItemIds, ['boots'], 'an old drysuit → undergarment link is dropped');
assert.deepEqual(altItems.items[1].accessoryItemIds, [], 'and so is an undergarment → drysuit link');
const cold = altItems.setups[0];
assert.equal(model.unresolvedChoices(cold, altItems.items)[0].options.length, 2, 'a setup with a drysuit asks, offering every undergarment in the locker — no linking needed');
assert.deepEqual(checklistEntriesForItem(dry, altItems.items, cold).parts.map((p) => p.linkedItemId), ['boots'], 'until answered, no undergarment is packed');
const picked = model.setAccessoryChoice(cold, 'dry', ['ug-warm'], altItems.items);
assert.deepEqual(checklistEntriesForItem(dry, altItems.items, picked).parts.map((p) => p.linkedItemId).sort(), ['boots', 'ug-warm']);
assert.equal(model.unresolvedChoices(picked, altItems.items).length, 0);
assert.equal(setupProgress(picked, altItems.items).total, 3);
const none = model.setAccessoryChoice(cold, 'dry', [], altItems.items);
assert.equal(model.unresolvedChoices(none, altItems.items).length, 0, '"No undergarment" is an answer');
const switched = model.setAccessoryChoice({ ...picked, checkedIds: [...picked.checkedIds, 'dry::accessory::ug-warm'] }, 'dry', ['ug-light'], altItems.items);
assert.ok(!switched.checkedIds.includes('dry::accessory::ug-warm') && switched.checkedIds.includes('dry::accessory::boots'), 'switching un-checks only the old undergarment');
assert.equal(model.unresolvedChoices({ itemIds: ['dry'], accessoryChoices: {} }, [dry, altItems.items[3]]).length, 0, 'no undergarments in the locker → nothing to ask');
assert.equal(model.unresolvedChoices({ itemIds: ['wet'], accessoryChoices: {} }, [normalizeGearItem({ id: 'wet', name: 'Wetsuit', category: 'Exposure suit', configuration: 'Wetsuit' }), altItems.items[1]]).length, 0, 'wetsuits never ask');
assert.equal(normalizeGearState({ ...altItems, items: altItems.items.filter((item) => item.id !== 'ug-warm'), setups: [picked] }).setups[0].accessoryChoices.dry, undefined, 'if the chosen undergarment is deleted, the setup asks again');
assert.deepEqual(normalizeGearState({ ...altItems, setups: [none] }).setups[0].accessoryChoices.dry, [], 'an explicit "none" is kept');

// A chosen multi-piece undergarment lists its pieces; switching away un-checks those too.
const pieced = normalizeGearState({ ...altItems, items: altItems.items.map((item) => (item.id === 'ug-warm' ? { ...item, components: [{ id: 'top', type: 'Top', name: 'Top' }, { id: 'bottom', type: 'Bottom', name: 'Bottom' }] } : item)) });
const withPieces = model.setAccessoryChoice(pieced.setups[0], 'dry', ['ug-warm'], pieced.items);
const pieceKeys = checklistEntriesForItem(pieced.items[0], pieced.items, withPieces).parts.filter((part) => part.piece).map((part) => part.key);
assert.deepEqual(pieceKeys, ['dry::accessory::ug-warm::component::top', 'dry::accessory::ug-warm::component::bottom']);
const afterSwitch = model.setAccessoryChoice({ ...withPieces, checkedIds: [...withPieces.checkedIds, ...pieceKeys] }, 'dry', ['ug-light'], pieced.items);
assert.ok(!afterSwitch.checkedIds.some((key) => key.includes('ug-warm')), 'switching undergarments un-checks the old one’s pieces');

// Cylinder sets are never a choice: a doubles set packs both cylinders.
const setSetup = { id: 'doubles', name: 'Doubles', itemIds: [set.id], checkedIds: [], accessoryChoices: {} };
assert.deepEqual(model.accessoryAlternatives(set, lockerItems), [], 'a doubles set’s cylinders are not alternatives');
assert.equal(model.unresolvedChoices(setSetup, lockerItems).length, 0, 'packing doubles never asks which cylinder');
assert.equal(checklistEntriesForItem(set, lockerItems, setSetup).parts.length, 0, 'a doubles set packs as one item — no separate cylinder, valve, manifold or band checkboxes');
assert.equal(setupProgress(setSetup, lockerItems).total, 1);
// Cylinders live inside their set until unlinked, but stay tracked.
assert.deepEqual(model.topLevelGear(lockerItems).map((item) => item.id), [set.id], 'the inventory lists the set, not its cylinders');
assert.deepEqual(model.topLevelGear(lockerItems, model.searchGear(lockerItems, 'R1')).map((item) => item.id), [set.id], 'searching a cylinder serial finds its set');
assert.equal(gearSummary({ items: lockerItems }).total, 1, 'set cylinders count as parts, not gear');
assert.equal(model.cylinderSetFor(lockerItems, right.id).id, set.id);
const unlinked = model.unlinkFromSet({ items: lockerItems, setups: [] }, right.id);
assert.deepEqual(unlinked.items.find((item) => item.id === set.id).accessoryItemIds, [left.id], 'unlinking removes it from the set');
assert.equal(unlinked.items.find((item) => item.id === right.id).configuration, 'Single cylinder');
assert.deepEqual(model.topLevelGear(unlinked.items).map((item) => item.id).sort(), [right.id, set.id].sort(), 'an unlinked cylinder is tracked on its own');
assert.match(screen, /const pickable = searchGear\(selectedOnly/, 'the setup gear picker is searchable, with a selected-only view');
assert.match(screen, /styles\.setupPickerFooter/, 'the add-existing-gear picker pins its save action outside the scrolling list');
assert.match(screen, /paddingBottom: Math\.max\(insets\.bottom, spacing\.sm\)/, 'the pinned setup save action clears the bottom safe area');
assert.match(screen, /const FormField = \(props\) => <AccountFormField \{\.\.\.props\} inputAccessoryViewID=\{NUMBER_KEYBOARD_ACCESSORY_ID\}/, 'every Gear Locker form field gets the keyboard Done toolbar');
assert.match(screen, /keyboardDismissMode="interactive"/, 'Gear Locker forms also dismiss the keyboard by dragging down');
assert.match(screen, /GEAR_SORT_OPTIONS/, 'inventory exposes its scuba-relevant sort choices');
assert.match(screen, /GEAR_SERVICE_FILTERS/, 'inventory can filter by service status');
assert.match(screen, /GEAR_LOCATION_FILTERS/, 'inventory can filter by setup assignment and floating status');
assert.match(screen, /Clear all filters/, 'inventory filters have an obvious reset');

// Selecting an item brings its linked gear along, and never adds it twice.
const linkedGear = normalizeGearState({ items: [
  { id: 'fusion', name: 'Whites Fusion Bullet', category: 'Exposure suit', configuration: 'Drysuit', accessoryItemIds: ['hood', 'boots'] },
  { id: 'hood', name: 'Hood', category: 'Hood' }, { id: 'boots', name: 'Boots', category: 'Boots' },
  { id: 'u1', name: 'Arctic', category: 'Undergarment' }, { id: 'u2', name: 'Halo', category: 'Undergarment' },
], setups: [] }).items;
assert.deepEqual([...model.includedWithSelection(['fusion'], linkedGear, {}).keys()].sort(), ['boots', 'hood'], 'the hood and boots come with the drysuit');
assert.deepEqual([...model.includedWithSelection(['fusion'], linkedGear, { fusion: ['u2'] }).keys()].sort(), ['boots', 'hood', 'u2'], 'and the undergarment chosen for it');
assert.deepEqual(model.withoutIncluded(['hood', 'fusion'], linkedGear, {}), ['fusion'], 'a hood added on its own merges into the drysuit');
assert.equal(model.alternativesOfSelection(['fusion'], linkedGear).get('u1').item.id, 'fusion', 'tapping an undergarment picks it for the selected drysuit');
assert.equal(setupProgress({ itemIds: ['fusion', 'hood'], checkedIds: [], accessoryChoices: {} }, linkedGear).total, 3, 'a duplicate hood is not counted twice');
assert.match(screen, /withoutIncluded\(itemIds, items, choices\)/, 'the setup picker never adds linked gear twice');
assert.match(wizard, /Pony \/ bailout regulator/, 'the guided regulator flow can designate a pony or bailout regulator');
assert.match(wizard, /INDEPENDENT_GAS_STEPS = \['basics', 'first-stage', 'second-stage', 'spg', 'transmitter', 'extras', 'details'\]/, 'bailout and stage regulators skip primary-set octo and inflator questions');
assert.match(cylinderWizard, /value: 'Pony \/ bailout'/, 'the guided cylinder flow can designate a pony or bailout cylinder');
assert.match(wizard, /!\['Regulator', 'Cylinder \/ tank'\]\.includes\(entry\.category\)/, 'the regulator wizard keeps cylinders as peer locker items');

// --- Setup completeness: what each setup type needs, asked once ---
const kit = normalizeGearState({ items: [
  { id: 'reg1', name: 'Apeks XTX50', category: 'Regulator' },
  { id: 'regD', name: 'Doubles reg set', category: 'Regulator', configuration: 'Doubles', components: [{ type: 'First stage', name: 'Left post' }, { type: 'First stage', name: 'Right post' }] },
  { id: 'ffm', name: 'Guardian', category: 'Regulator', configuration: 'Full face mask' },
  { id: 'dbl', name: 'Double 85s', category: 'Cylinder / tank', configuration: 'Manifolded doubles', accessoryItemIds: ['cl', 'cr'] },
  { id: 'cl', name: 'Double 85s · Left', category: 'Cylinder / tank' }, { id: 'cr', name: 'Double 85s · Right', category: 'Cylinder / tank' },
  { id: 'al80', name: 'AL80', category: 'Cylinder / tank', configuration: 'Single cylinder' },
  { id: 'fins', name: 'Jets', category: 'Fins' }, { id: 'comp', name: 'Perdix', category: 'Dive computer' }, { id: 'timer', name: 'Bottom timer', category: 'Gauges / compass' },
  { id: 'suit', name: 'Fusion', category: 'Exposure suit', configuration: 'Drysuit' },
  { id: 'wing', name: 'Wing', category: 'BCD', configuration: 'Backplate & wing' }, { id: 'sm', name: 'Stealth', category: 'BCD', configuration: 'Sidemount' },
], setups: [] }).items;
const reqs = (setup) => Object.fromEntries(model.setupRequirements(normalizeGearState({ items: kit, setups: [setup] }).setups[0], kit).map((req) => [req.key, req]));
let q = reqs({ id: 's', name: 'D', type: 'Doubles', itemIds: ['reg1', 'dbl'] });
assert.equal(q.regulator.have, 1); assert.ok(!q.regulator.met, 'doubles with a single first stage is flagged');
assert.equal(q.cylinder.have, 2); assert.ok(q.cylinder.met, 'a doubles set counts as two cylinders');
assert.ok(reqs({ id: 's', name: 'D', type: 'Doubles', itemIds: ['regD', 'dbl'] }).regulator.met, 'a doubles regulator set with two first stages counts as two');
q = reqs({ id: 's', name: 'S', type: 'Single tank', itemIds: ['ffm', 'al80'] });
assert.ok(q.mask.met, 'a full-face mask counts as the mask'); assert.ok(!q.regulator.met, 'but it is not a first stage');
q = reqs({ id: 's', name: 'S', type: 'Doubles', itemIds: ['comp', 'timer'] });
assert.ok(q['backup-computer'].met, 'a bottom timer counts as the backup computer');
q = reqs({ id: 's', name: 'S', type: 'Sidemount', itemIds: ['wing'] });
assert.ok(!q['sidemount-harness'].met); assert.deepEqual(q['sidemount-harness'].candidates.map((item) => item.id), ['sm'], 'sidemount offers the sidemount harness');
q = reqs({ id: 's', name: 'S', type: 'Single tank', itemIds: ['suit', 'reg1'] });
assert.ok(!q['drysuit-hose'].met, 'a drysuit with no drysuit hose on any regulator is flagged');
assert.equal(model.setupRequirements({ type: 'Travel', itemIds: [], completeness: {} }, kit).length, 0, 'travel setups are not checked');
assert.deepEqual(Object.keys(reqs({ id: 'f', name: 'F', type: 'Freedive', itemIds: [] })), ['exposure', 'mask', 'fins', 'weights', 'computer']);
assert.ok(!reqs({ id: 's', name: 'S', type: 'Single tank', itemIds: ['al80'] }).cylinder.candidates.some((item) => ['cl', 'cr'].includes(item.id)), 'cylinders inside a set are never offered alone');
// Empty setups stay quiet. After the first item is added, questions appear one at a time; answering
// removes each one, and once all are answered the review is done for good.
let review = normalizeGearState({ items: kit, setups: [{ id: 'r', name: 'R', type: 'Pony / bailout', itemIds: [] }] }).setups[0];
assert.deepEqual(model.setupQuestions(review, kit), [], 'a new empty setup does not immediately ask about every missing item');
review = { ...review, itemIds: ['reg1'] };
assert.deepEqual(model.setupQuestions(review, kit).map((question) => question.key), ['cylinder'], 'adding the regulator answers that question');
review = model.skipRequirement(review, 'cylinder', kit);
assert.equal(review.completeness.done, true); assert.equal(model.setupQuestions(review, kit).length, 0);
assert.equal(model.setupQuestions({ ...review, itemIds: [] }, kit).length, 0, 'a finished review never asks again, even if gear is removed later');
assert.equal(model.setupRequirements({ ...review, itemIds: [] }, kit).find((req) => req.key === 'regulator').met, false, '(the summary still shows it)');
assert.equal(model.setupQuestions(model.resetSetupReview(review), kit).length, 1, 'review again asks again');
assert.equal(normalizeGearSetup({ ...review, type: 'Doubles' }).completeness.done, false, 'changing the setup type starts a fresh review');
assert.match(screen, /if \(!setup\.itemIds\.length\) return null;/, 'an empty setup hides the setup-check UI until gear is added');
console.log('Gear checklist checks passed.');
