import { hasTemperatureGearPreferences, normalizeAdvicePreferences, recommendDiveGear } from '../gearChecklist/diveAdvice';

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

const EXPOSURE_CATEGORIES = new Set(['Exposure suit', 'Undergarment', 'Hood', 'Gloves', 'Boots']);
const SITE_CATEGORIES = new Set(['Lights', 'Cutting / signaling', 'Surface safety']);
const SITE_ITEM_NAME = /\b(dsmb|smb|surface marker|spool|reel|torch|light|strobe|whistle|signal mirror|knife|shears|line cutter)\b/i;
const CORE_ORDER = ['Rebreather', 'Regulator', 'Cylinder / tank', 'BCD', 'Dive computer', 'Transmitter', 'Gauges / compass', 'Mask', 'Fins', 'Weights', 'Snorkel', 'DPV / scooter'];
const EXPOSURE_ORDER = ['Exposure suit', 'Undergarment', 'Hood', 'Gloves', 'Boots'];
const orderBy = order => (a, b) => (order.indexOf(a.category) < 0 ? 99 : order.indexOf(a.category)) - (order.indexOf(b.category) < 0 ? 99 : order.indexOf(b.category)) || a.name.localeCompare(b.name);

export function organizeAtlasGear(items, { site = {}, profile = null } = {}) {
  const types = [...(site.topologies || []), ...(profile?.types || [])].map(value => String(value).toLowerCase());
  const entry = profile?.entry || site.entry || '';
  const current = profile?.current || profile?.region?.current || '';
  const boatOrDrift = /boat/.test(entry) || types.some(value => /drift/.test(value)) || ['moderate', 'strong'].includes(current);
  const overhead = types.some(value => /cave|cavern|overhead/.test(value));
  const wreck = types.some(value => /wreck/.test(value));
  const exposureItems = items.filter(item => EXPOSURE_CATEGORIES.has(item.category)).sort(orderBy(EXPOSURE_ORDER));
  const siteItems = items.filter(item => SITE_CATEGORIES.has(item.category) || SITE_ITEM_NAME.test(item.name)).map(item => {
    const light = item.category === 'Lights' || /\b(torch|light|strobe)\b/i.test(item.name);
    const surface = item.category === 'Surface safety' || /\b(dsmb|smb|surface marker|whistle|signal mirror)\b/i.test(item.name);
    const cutting = item.category === 'Cutting / signaling' || /\b(knife|shears|line cutter)\b/i.test(item.name);
    const reason = light && overhead ? 'Overhead environment: configure primary and backup lights only for the dive you are trained and equipped to make.'
      : light && wreck ? 'Useful for inspecting the wreck exterior and low-light details; penetration requires a separate overhead plan.'
        : surface && boatOrDrift ? 'Boat, drift or current context: confirm the operator’s surface-marker procedure.'
          : cutting && wreck ? 'Wreck context: a cutting tool can address line or net entanglement.'
            : 'Site or task-specific item from this saved setup.';
    return { ...item, reason };
  });
  const assigned = new Set([...exposureItems, ...siteItems].map(item => item.id));
  const coreItems = items.filter(item => !assigned.has(item.id)).sort(orderBy(CORE_ORDER));
  const hasDsmb = items.some(item => /\b(dsmb|smb|surface marker)\b/i.test(item.name));
  const hasLight = items.some(item => item.category === 'Lights' || /\b(torch|light)\b/i.test(item.name));
  const siteNeeds = [];
  if (boatOrDrift && !hasDsmb) siteNeeds.push({ name: 'DSMB / surface marker not found', reason: 'Confirm whether the operator requires one and add your actual marker and spool to this setup if appropriate.' });
  if (overhead && !hasLight) siteNeeds.push({ name: 'Overhead light plan not configured', reason: 'If this is an overhead dive, use the detailed planner and only select a primary/backup light configuration within your training.' });
  return { exposureItems, coreItems, siteItems, siteNeeds };
}

// The WebView receives only the recommended packing result, never the full Gear Locker inventory.
export function buildAtlasGearSuggestion(state, preferences, { mode, site, profile = null, inland = null, temperatureC = null } = {}) {
  const normalizedMode = normalizeAtlasDiveMode(mode);
  const normalizedPreferences = normalizeAdvicePreferences(preferences);
  const result = recommendDiveGear(state, normalizedPreferences, { use: atlasDiveUse(normalizedMode), site, inland, temperatureC });
  const entry = result.ranked[0];
  const groups = entry ? organizeAtlasGear(entry.items.map(item => ({ id: item.id, name: item.name, category: item.category })), { site, profile }) : null;
  const rangeMatches = item => {
    const range = normalizedPreferences.suits[item?.id];
    return item && result.advice.temperatureC != null && range?.minC != null && range?.maxC != null
      && result.advice.temperatureC >= range.minC && result.advice.temperatureC <= range.maxC;
  };
  const personalSuit = rangeMatches(entry?.suit) ? entry.suit : result.suits.find(rangeMatches);
  const matchedCombination = entry?.combination || result.combination;
  const personalItems = matchedCombination
    ? matchedCombination.itemIds.map(id => state.items.find(item => item.id === id)).filter(Boolean)
    : personalSuit ? [personalSuit] : [];
  const personalizedExposure = Boolean(matchedCombination || personalItems.length);
  const personalLabel = matchedCombination?.name || personalItems.map(item => item.name).join(' + ');
  return {
    mode: normalizedMode,
    exposureLabel: personalizedExposure ? personalLabel : result.advice.label,
    defaultExposureLabel: result.advice.label,
    personalizedExposure,
    hasTemperaturePreferences: hasTemperatureGearPreferences(normalizedPreferences),
    exposureItems: personalItems.map(item => ({ id: item.id, name: item.name, category: item.category })),
    setup: entry ? {
      id: entry.setup.id,
      name: entry.setup.name,
      type: entry.setup.type,
      items: entry.items.map(item => ({ id: item.id, name: item.name, category: item.category })),
      ...groups,
      changes: entry.changes.map(item => item.name),
      removed: entry.removed.map(item => item.name),
      warnings: entry.warnings,
    } : null,
    alternatives: Math.max(0, result.ranked.length - 1),
    excludedCount: result.exclusions.length,
  };
}
