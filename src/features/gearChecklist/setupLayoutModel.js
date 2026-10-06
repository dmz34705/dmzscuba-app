import { includedWithSelection, sortGear } from './model';

export const SETUP_ZONES = [
  { key: 'vision', label: 'Vision', categories: ['Mask', 'Snorkel'] },
  { key: 'instruments', label: 'Instruments', categories: ['Dive computer', 'Transmitter', 'Gauges / compass'] },
  { key: 'breathing', label: 'Breathing', categories: ['Regulator', 'Cylinder / tank', 'Rebreather'] },
  { key: 'buoyancy', label: 'Buoyancy', categories: ['BCD', 'Weights'] },
  { key: 'exposure', label: 'Exposure', categories: ['Exposure suit', 'Undergarment', 'Hood', 'Gloves', 'Boots'] },
  { key: 'propulsion', label: 'Propulsion', categories: ['Fins', 'DPV / scooter'] },
  { key: 'extras', label: 'Accessories & safety', categories: ['Lights', 'Camera', 'Cutting / signaling', 'Surface safety', 'Bags / storage', 'Spare parts', 'Accessories'] },
];

// The schematic groups equipment by purpose, without implying hose routing or physical mounting.
export function setupLayoutItems(setup, items) {
  const linked = includedWithSelection(setup.itemIds, items, setup.accessoryChoices);
  return sortGear(items.filter((item) => setup.itemIds.includes(item.id) || linked.has(item.id)));
}

