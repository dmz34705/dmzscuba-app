// Pure cylinder-wizard logic (no React Native), so it can be tested directly.
import {
  GEAR_CONDITIONS,
  createGearId,
  emptyGearComponent,
  emptyGearItem,
} from './model';

export const emptyCylinder = () => ({ serialNumber: '', lastHydro: '', hydroDue: '', lastVisual: '', visualDue: '' });

export function emptyState(defaultSetupId) {
  return {
    setup: null, manifold: 'manifold', source: 'new', linkedIds: [],
    material: null, preset: '', capacity: '', pressure: '', manufacturer: '', model: '',
    valve: { type: null, manufacturer: '', model: '' }, manifoldBrand: { manufacturer: '', model: '' },
    color: null, colorOther: '', boot: null, bootColor: '',
    name: '', nameEdited: false, cylinders: [emptyCylinder(), emptyCylinder()], sameDates: true,
    condition: GEAR_CONDITIONS[0], purchaseDate: '', purchasePrice: '', retailer: '', notes: '',
    setupIds: defaultSetupId ? [defaultSetupId] : [], setupIdsTouched: Boolean(defaultSetupId),
  };
}

export const isPair = (cyl) => cyl.setup === 'Doubles' || cyl.setup === 'Sidemount pair';
export const sideLabels = (cyl) => (isPair(cyl) ? ['Left cylinder', 'Right cylinder'] : ['Cylinder']);
export const colorOf = (cyl) => (cyl.color === 'Other' ? cyl.colorOther.trim() : cyl.color || '');
export const setConfiguration = (cyl) => (cyl.setup === 'Sidemount pair' ? 'Sidemount pair' : cyl.manifold === 'manifold' ? 'Manifolded doubles' : 'Independent doubles');
export const cylinderConfiguration = (cyl) => (['Pony / bailout', 'Stage / deco'].includes(cyl.setup) ? cyl.setup : 'Single cylinder');

export function suggestedName(cyl, items) {
  if (cyl.source === 'existing' && isPair(cyl)) {
    const linked = cyl.linkedIds.map((id) => items.find((item) => item.id === id)).filter(Boolean);
    const base = linked[0]?.model || linked[0]?.name || 'Cylinder';
    return cyl.setup === 'Doubles' ? `Double ${base}s` : `${base} sidemount pair`;
  }
  const base = cyl.preset || [cyl.capacity.split('·')[0].trim(), cyl.material].filter(Boolean).join(' ') || 'Cylinder';
  return cyl.setup === 'Doubles' ? `Double ${base}s` : cyl.setup === 'Sidemount pair' ? `${base} sidemount pair`
    : cyl.setup === 'Pony / bailout' ? `${base} bailout` : cyl.setup === 'Stage / deco' ? `${base} stage` : base;
}

export function cylinderChips(cyl) {
  return [
    cyl.setup ? cyl.setup === 'Doubles' ? `Doubles · ${cyl.manifold === 'manifold' ? 'manifolded' : 'independent'}` : cyl.setup : 'Setup –',
    cyl.preset || cyl.capacity || 'Size –',
    cyl.material || 'Material –',
    cyl.valve.type ? `${cyl.valve.type} valve` : 'Valve –',
    colorOf(cyl) || 'Color –',
    `Boot ${cyl.boot ? '✓' : '–'}`,
  ];
}

// The locker items this flow saves: { item, pendingAccessories } like the other guided flows.
export function buildCylinderDrafts(cyl, items = []) {
  const name = cyl.name.trim() || suggestedName(cyl, items);
  const shared = {
    category: 'Cylinder / tank', manufacturer: cyl.manufacturer.trim(), model: cyl.model.trim() || cyl.preset, material: cyl.material || '',
    capacity: cyl.capacity.trim(), workingPressure: cyl.pressure.trim(), color: colorOf(cyl), valveType: cyl.valve.type || '', condition: cyl.condition,
  };
  const makeCylinder = (details, label) => {
    const components = [{ ...emptyGearComponent('Cylinder / tank', 'Valve'), id: createGearId('component'), name: 'Valve', manufacturer: cyl.valve.manufacturer.trim(), model: cyl.valve.model.trim(), notes: cyl.valve.type ? `${cyl.valve.type} valve` : '' }];
    if (cyl.boot) components.push({ ...emptyGearComponent('Cylinder / tank', 'Boot'), id: createGearId('component'), name: 'Tank boot', notes: cyl.bootColor.trim() ? `${cyl.bootColor.trim()} boot` : '' });
    return {
      ...emptyGearItem(), ...shared, id: createGearId(), name: label ? `${name} · ${label}` : name, isAssembly: true, components,
      configuration: label ? '' : cylinderConfiguration(cyl), serialNumber: details.serialNumber.trim(),
      lastHydrostaticTest: details.lastHydro, hydrostaticTestDue: details.hydroDue, lastVisualInspection: details.lastVisual, visualInspectionDue: details.visualDue,
    };
  };
  const ownership = { purchaseDate: cyl.purchaseDate.trim(), purchasePrice: cyl.purchasePrice.trim(), retailer: cyl.retailer.trim(), notes: cyl.notes.trim() };

  if (!isPair(cyl)) return { item: { ...makeCylinder(cyl.cylinders[0], ''), ...ownership, setupIds: cyl.setupIds }, pendingAccessories: [] };

  const setParts = [];
  if (cyl.setup === 'Doubles' && cyl.manifold === 'manifold') setParts.push({ ...emptyGearComponent('Cylinder / tank', 'Manifold'), id: createGearId('component'), name: 'Isolation manifold', manufacturer: cyl.manifoldBrand.manufacturer.trim(), model: cyl.manifoldBrand.model.trim() });
  if (cyl.setup === 'Doubles') setParts.push({ ...emptyGearComponent('Cylinder / tank', 'Bands'), id: createGearId('component'), name: 'Tank bands' });

  let cylinders = [];
  let linkedIds = cyl.linkedIds;
  if (cyl.source !== 'existing') {
    const [left, right] = cyl.cylinders;
    const second = cyl.sameDates ? { ...right, lastHydro: left.lastHydro, hydroDue: left.hydroDue, lastVisual: left.lastVisual, visualDue: left.visualDue } : right;
    cylinders = [makeCylinder(left, 'Left'), makeCylinder(second, 'Right')];
    linkedIds = cylinders.map((entry) => entry.id);
  }
  const linked = cyl.source === 'existing' ? linkedIds.map((id) => items.find((item) => item.id === id)).filter(Boolean) : cylinders;
  const first = linked[0] || {};
  const set = {
    ...emptyGearItem(), ...shared, ...ownership, id: createGearId(), name, configuration: setConfiguration(cyl),
    manufacturer: shared.manufacturer || first.manufacturer || '', model: shared.model || first.model || '', material: shared.material || first.material || '',
    capacity: (shared.capacity || first.capacity) ? `2 × ${shared.capacity || first.capacity}` : '', workingPressure: shared.workingPressure || first.workingPressure || '',
    color: shared.color || first.color || '', valveType: shared.valveType || first.valveType || '',
    isAssembly: setParts.length > 0, components: setParts, accessoryItemIds: linkedIds, setupIds: cyl.setupIds,
  };
  return { item: set, pendingAccessories: cylinders };
}
