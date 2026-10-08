import { recommendDiveGear } from '../gearChecklist/diveAdvice';

export const ATLAS_DIVE_MODES = [
  { id: 'recreational', label: 'Recreational', use: 'Open water' },
  { id: 'technical', label: 'Technical', use: 'Technical' },
  { id: 'freedive', label: 'Freedive', use: 'Freedive' },
];

export const ATLAS_DIVE_MODE_KEY = '@dmz-scuba/ocean-atlas/dive-mode-v1';

export function normalizeAtlasDiveMode(value) {
  return ATLAS_DIVE_MODES.some(mode => mode.id === value) ? value : 'recreational';
}

export function atlasDiveUse(value) {
  return ATLAS_DIVE_MODES.find(mode => mode.id === normalizeAtlasDiveMode(value)).use;
}

// The WebView receives only the recommended packing result, never the full Gear Locker inventory.
export function buildAtlasGearSuggestion(state, preferences, { mode, site, inland = null, temperatureC = null } = {}) {
  const normalizedMode = normalizeAtlasDiveMode(mode);
  const result = recommendDiveGear(state, preferences, { use: atlasDiveUse(normalizedMode), site, inland, temperatureC });
  const entry = result.ranked[0];
  return {
    mode: normalizedMode,
    exposureLabel: result.advice.label,
    setup: entry ? {
      id: entry.setup.id,
      name: entry.setup.name,
      type: entry.setup.type,
      items: entry.items.map(item => ({ id: item.id, name: item.name, category: item.category })),
      changes: entry.changes.map(item => item.name),
      removed: entry.removed.map(item => item.name),
      warnings: entry.warnings,
    } : null,
    alternatives: Math.max(0, result.ranked.length - 1),
    excludedCount: result.exclusions.length,
  };
}
