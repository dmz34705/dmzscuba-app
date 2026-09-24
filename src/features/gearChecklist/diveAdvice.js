import { packedItems, serviceStatusForAssembly, serviceStatusForSet, isCylinderSet, setupRequirements, withoutIncluded, topLevelGear } from './model';
import { DEFAULT_DRYSUIT_BELOW_C, exposureAdvice } from '../oceanAtlas/exposure';

export const DIVE_USES = ['Open water', 'Technical', 'Overhead', 'Freedive'];
export const ADVICE_DEFAULTS = { drysuitBelowC: DEFAULT_DRYSUIT_BELOW_C, thermalTendency: 'typical', suits: {}, setups: {}, combinations: [] };
// An opt-in comfort template, not general exposure guidance. Item selection remains the diver's.
export const coldDiverTemplate = () => ({ ...ADVICE_DEFAULTS, drysuitBelowC: (78 - 32) * 5 / 9, combinations: [
  ['Pool · shorty', 89, 104], ['Tropical · 7 mm', 85, 89], ['Tropical · 7 mm + warm hood', 78, 85],
  ['Drysuit · primary layers', 60, 78], ['Drysuit · heavy insulation + dry glove liners', 41, 60],
  ['Ice · combined layers + oversized gloves / thick liners', 28.4, 41],
].map(([name, min, max], index) => ({ id: `cold-${index}`, name, minC: Math.max(-2, (min - 32) * 5 / 9), maxC: (max - 32) * 5 / 9, itemIds: [] })) });
const number = value => value !== '' && value != null && Number.isFinite(Number(value)) ? Number(value) : null;
export function orderedTemperatureRange(coldest, warmest) {
  const low = number(coldest), high = number(warmest);
  return low != null && high != null && low > high ? { coldest: warmest, warmest: coldest, reversed: true } : { coldest, warmest, reversed: false };
}
export function normalizeAdvicePreferences(value = {}) {
  value = value && typeof value === 'object' ? value : {};
  const range = Object.fromEntries(Object.entries(value.suits || {}).map(([id, entry]) => [id, {
    minC: number(entry?.minC), maxC: number(entry?.maxC), coverage: ['Full', 'Shorty'].includes(entry?.coverage) ? entry.coverage : '',
  }]));
  return { drysuitBelowC: number(value.drysuitBelowC) ?? DEFAULT_DRYSUIT_BELOW_C, thermalTendency: ['cold', 'typical', 'warm'].includes(value.thermalTendency) ? value.thermalTendency : value.runsCold === true ? 'cold' : 'typical', suits: range,
    combinations: (Array.isArray(value.combinations) ? value.combinations : []).filter(entry => entry && typeof entry.id === 'string').map(entry => ({ id: entry.id, name: String(entry.name || 'Exposure combination'), minC: number(entry.minC), maxC: number(entry.maxC), itemIds: Array.isArray(entry.itemIds) ? [...new Set(entry.itemIds.filter(id => typeof id === 'string'))] : [] })),
    setups: Object.fromEntries(Object.entries(value.setups || {}).map(([id, uses]) => [id, Array.isArray(uses) ? uses.filter(use => DIVE_USES.includes(use)) : []])) };
}
export function advicePreferenceError(preferences) {
  if (preferences.drysuitBelowC < 0 || preferences.drysuitBelowC > 30) return 'Choose a drysuit threshold between 32°F / 0°C and 86°F / 30°C.';
  for (const entry of [...Object.values(preferences.suits), ...preferences.combinations]) {
    if ([entry.minC, entry.maxC].some(value => value != null && (value < -2 || value > 40))) return 'Comfort temperatures must be between 28°F / −2°C and 104°F / 40°C.';
    if (entry.minC != null && entry.maxC != null && entry.minC > entry.maxC) return 'The coldest-water temperature must be lower than the warmest-water temperature. Use Swap values beside that range.';
  }
  for (const entry of preferences.combinations) {
    if ((entry.minC == null) !== (entry.maxC == null)) return 'Enter both ends of a combination’s temperature range.';
    if (entry.minC != null && entry.minC === entry.maxC) return 'A combination needs a temperature range wider than zero.';
  }
  return '';
}

const exposureItem = item => ['Exposure suit', 'Undergarment'].includes(item.category);
const statusFor = (item, items, now) => isCylinderSet(item) ? serviceStatusForSet(item, items, now) : serviceStatusForAssembly(item, now);
const usable = (item, items, now) => !['blocked', 'overdue', 'attention', 'retired'].includes(statusFor(item, items, now).key);
function comfortScore(item, preferences, advice) {
  const range = preferences.suits[item.id] || {};
  const knownRange = range.minC != null && range.maxC != null;
  if (knownRange && advice.temperatureC != null && (advice.temperatureC < range.minC || advice.temperatureC > range.maxC)) return null;
  const dry = item.configuration === 'Drysuit';
  if (item.category === 'Exposure suit' && advice.dry && !dry && (!knownRange || advice.temperatureC == null)) return null;
  if (advice.fullCoverage && !dry && range.coverage === 'Shorty') return null;
  const thickness = Number.parseFloat(item.thickness);
  const temp = advice.planningTemperatureC;
  const target = temp == null ? null : temp >= 28 ? 1 : temp >= 25 ? 3 : temp >= 22 ? 5 : 7;
  return (knownRange ? 30 : 0) + (advice.fullCoverage && (dry || range.coverage === 'Full') ? 10 : 0)
    + (advice.dry && dry ? 20 : !advice.dry && dry ? -15 : 0)
    - (target != null && Number.isFinite(thickness) ? Math.abs(thickness - target) * 4 : 0);
}

// Recommendations are a read-only packing proposal. Never move floating gear, check items off,
// or change a saved setup just because an Atlas card was opened.
export function recommendDiveGear(state, preferences, context, now = new Date()) {
  const prefs = normalizeAdvicePreferences(preferences);
  const items = state.items || [];
  const use = DIVE_USES.includes(context.use) ? context.use : 'Open water';
  const demanding = ['Technical', 'Overhead'].includes(use) || context.longDive === true;
  const comfortOffsetC = { cold: 2, typical: 0, warm: -2 }[prefs.thermalTendency];
  const advice = exposureAdvice({ ...context, demanding, comfortOffsetC, drysuitBelowC: prefs.drysuitBelowC + comfortOffsetC });
  const exclusions = topLevelGear(items).filter(item => !usable(item, items, now));
  const choose = category => items.filter(item => item.category === category && usable(item, items, now))
    .map(item => ({ item, score: comfortScore(item, prefs, advice) })).filter(entry => entry.score != null)
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name));
  const suits = choose('Exposure suit');
  const undergarments = choose('Undergarment');
  const matchingCombinations = prefs.combinations.filter(entry => advice.temperatureC != null && entry.minC != null && entry.maxC != null && advice.temperatureC >= entry.minC && advice.temperatureC < entry.maxC);
  const combination = matchingCombinations.find(entry => entry.itemIds.length && entry.itemIds.every(id => items.some(item => item.id === id && usable(item, items, now))) && entry.itemIds.some(id => items.some(item => item.id === id && item.category === 'Exposure suit' && (!advice.fullCoverage || item.configuration === 'Drysuit' || prefs.suits[id]?.coverage !== 'Shorty'))));
  const outfit = combination ? combination.itemIds.map(id => items.find(item => item.id === id)) : [];
  const ranked = (state.setups || []).filter(setup => setup.itemIds.length && !['Pony / bailout', 'Stage / deco'].includes(setup.type)).map(setup => {
    const uses = prefs.setups[setup.id] || [];
    const explicit = uses.includes(use);
    // Technical/overhead eligibility is explicitly supplied by the diver, never inferred from doubles.
    if (uses.length && !explicit) return null;
    if (['Technical', 'Overhead'].includes(use) && !explicit) return null;
    if ((use === 'Freedive') !== (setup.type === 'Freedive')) return null;
    const original = packedItems(setup, items);
    const existingSuit = suits.find(entry => original.some(item => item.id === entry.item.id));
    const suit = outfit.find(item => item.category === 'Exposure suit') || (existingSuit && existingSuit.score >= (suits[0]?.score ?? 0) ? existingSuit.item : suits[0]?.item);
    const existingUnder = undergarments.find(entry => original.some(item => item.id === entry.item.id));
    const layers = suit?.configuration === 'Drysuit' ? (combination ? outfit.filter(item => item.category === 'Undergarment') : existingUnder ? undergarments.filter(entry => original.some(item => item.id === entry.item.id)).map(entry => entry.item) : undergarments.slice(0, 1).map(entry => entry.item)) : [];
    const under = layers[0];
    // Rebuild from the saved top-level items so accessories belonging only to a removed suit do not linger.
    const roots = setup.itemIds.filter(id => !exposureItem(items.find(item => item.id === id) || {}));
    if (suit) roots.push(suit.id);
    // A selected combination can replace standalone hoods/gloves without disturbing the rig.
    const replaceCategories = new Set(outfit.filter(item => !exposureItem(item)).map(item => item.category));
    const outfitRoots = roots.filter(id => !replaceCategories.has(items.find(item => item.id === id)?.category));
    outfitRoots.push(...outfit.filter(item => item.category !== 'Undergarment').map(item => item.id));
    const choices = { ...(setup.accessoryChoices || {}), ...(suit?.configuration === 'Drysuit' ? { [suit.id]: layers.map(item => item.id) } : {}) };
    const proposal = { ...setup, itemIds: withoutIncluded([...new Set(outfitRoots)], items, choices), accessoryChoices: choices, checkedIds: [] };
    const proposed = packedItems(proposal, items);
    if (proposed.some(item => !usable(item, items, now))) return null;
    const warnings = [];
    if (suit && advice.dry && suit.configuration !== 'Drysuit') warnings.push('Your saved comfort preference differs from the drysuit starting point. Confirm warmth for the actual depth and duration.');
    if (matchingCombinations.length && !combination) warnings.push('Your temperature combination is incomplete, unavailable or conflicts with required coverage; review its items before packing.');
    if (combination && suit?.accessoryItemIds?.some(id => { const linked = items.find(item => item.id === id); return linked && replaceCategories.has(linked.category) && !combination.itemIds.includes(id); })) warnings.push('This suit also includes linked accessories. Review overlapping hoods or gloves in the proposed list.');
    if (advice.temperatureC == null) warnings.push('Confirm bottom temperature before choosing your insulation; no temperature-specific comfort match is available.');
    if (!explicit) warnings.push('Confirm which kinds of dive you use this setup for in Your dive preferences.');
    if (!suit) warnings.push('No available exposure suit matches these conditions.');
    if (suit && !combination && !(prefs.suits[suit.id]?.minC != null && prefs.suits[suit.id]?.maxC != null)) warnings.push(`Set your comfortable water range for ${suit.name}; this is a provisional match.`);
    if (suit && advice.fullCoverage && suit.configuration !== 'Drysuit' && prefs.suits[suit.id]?.coverage !== 'Full') warnings.push(`Confirm ${suit.name} has full arms and legs for contact protection.`);
    if (suit?.configuration === 'Drysuit' && !under) warnings.push('Choose suitable drysuit undergarments; the shell alone does not establish warmth.');
    if (under && !combination && !(prefs.suits[under.id]?.minC != null && prefs.suits[under.id]?.maxC != null)) warnings.push(`Confirm the insulation of ${under.name} for this water temperature.`);
    const gaps = setupRequirements(proposal, items).filter(req => !req.met).map(req => req.label);
    if (gaps.length) warnings.push(`Check packing gaps: ${gaps.join(', ')}.`);
    proposed.filter(item => statusFor(item, items, now).key === 'due-soon').forEach(item => warnings.push(`${item.name}: service due soon; check your dive date.`));
    proposed.filter(item => item.floating && item.currentSetupId !== setup.id).forEach(item => warnings.push(`Move ${item.name} to this setup before packing.`));
    return { setup, suit, under, layers, combination, items: topLevelGear(items, proposed), warnings, changes: topLevelGear(items, proposed).filter(item => !original.some(old => old.id === item.id)),
      removed: topLevelGear(items, original).filter(item => !proposed.some(next => next.id === item.id)), score: (explicit ? 100 : 0) + (suit ? 20 : 0) - gaps.length * 2 - warnings.length };
  }).filter(Boolean).sort((a, b) => b.score - a.score || a.setup.name.localeCompare(b.setup.name));
  return { advice, combination, ranked: ranked.slice(0, 3), suits: suits.slice(0, 3).map(entry => entry.item), exclusions,
    needsIntent: !context.use, demanding, use };
}
