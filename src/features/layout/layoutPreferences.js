import { FEATURE_CATALOG, getFeaturesByArea } from '../catalog/featureCatalog';

export const HOME_SECTIONS = Object.freeze([
  { id: 'summary', title: 'Dive summary' }, { id: 'gear', title: 'Gear reminders' },
  { id: 'upNext', title: 'Up next' }, { id: 'quickAccess', title: 'Quick access' },
  { id: 'season', title: 'In season' }, { id: 'learning', title: 'Keep learning' },
]);
export const DEFAULT_LAYOUT = Object.freeze({
  home: Object.freeze(HOME_SECTIONS.map(item => item.id)),
  tools: Object.freeze(getFeaturesByArea('tools').map(item => item.id)),
  learn: Object.freeze(getFeaturesByArea('learn').map(item => item.id)),
  quickAccess: Object.freeze(['ocean-atlas', 'dive-calculator', 'gear-checklist', 'dive-lens']),
});
export function orderedIds(value, allowed, appendMissing = true) {
  const known = new Set(allowed);
  const selected = Array.isArray(value) ? [...new Set(value.filter(id => known.has(id)))] : [...allowed];
  return appendMissing ? [...selected, ...allowed.filter(id => !selected.includes(id))] : selected;
}
export function sanitizeLayout(value) {
  const layout = value && typeof value === 'object' ? value : {};
  const quickIds = FEATURE_CATALOG.filter(item => item.id !== 'gear-setup').map(item => item.id);
  return {
    home: orderedIds(layout.home, DEFAULT_LAYOUT.home),
    tools: orderedIds(layout.tools, DEFAULT_LAYOUT.tools),
    learn: orderedIds(layout.learn, DEFAULT_LAYOUT.learn),
    quickAccess: Array.isArray(layout.quickAccess) ? orderedIds(layout.quickAccess, quickIds, false) : [...DEFAULT_LAYOUT.quickAccess],
  };
}
export function moveLayoutItem(ids, from, to) {
  if (from < 0 || from >= ids.length) return ids;
  const result = [...ids];
  const [item] = result.splice(from, 1);
  result.splice(Math.max(0, Math.min(ids.length - 1, to)), 0, item);
  return result;
}
export function orderedFeatures(area, layout) {
  const features = getFeaturesByArea(area);
  const ids = sanitizeLayout(layout)[area];
  return ids.map(id => features.find(item => item.id === id)).filter(Boolean);
}
