// Pure progressive-disclosure policy for the logbook.
//
// The policy is deliberately data, rather than UI conditionals. When the
// technical/CCR fields arrive, add their field keys to the relevant section;
// screens can then render the same policy without learning dive-mode rules.

import { DIVE_MODES } from './schema';

export const DIVE_LOG_SECTIONS = Object.freeze([
  'siteConditions',
  'gasEquipment',
  'computerAnalytics',
  'gear',
  'notesTags',
]);

const COMMON = Object.freeze(['siteConditions', 'notesTags']);
const GAS = Object.freeze(['gasEquipment', 'gear']);

const MODE_SECTIONS = Object.freeze({
  oc: Object.freeze([...COMMON, ...GAS, 'computerAnalytics']),
  ccr: Object.freeze([...COMMON, 'gasEquipment', 'gear', 'computerAnalytics']),
  scr: Object.freeze([...COMMON, 'gasEquipment', 'gear', 'computerAnalytics']),
  gauge: Object.freeze([...COMMON, 'gasEquipment', 'gear', 'computerAnalytics']),
  freedive: Object.freeze(['siteConditions', 'computerAnalytics', 'notesTags']),
});

// Future fields are named here now so their visibility policy is established
// before their form controls exist. Data already present is never discarded or
// hidden: callers should use hiddenDataSections() to add an explicit recovery
// card when a mode change makes a section non-applicable.
export const SECTION_FIELDS = Object.freeze({
  siteConditions: Object.freeze(['site', 'water', 'weather']),
  gasEquipment: Object.freeze(['gas', 'setpoint', 'diluent', 'bailout']),
  computerAnalytics: Object.freeze(['decoModel', 'runtime', 'cellVoltages', 'scrubberTime']),
  gear: Object.freeze(['gear']),
  notesTags: Object.freeze(['notes', 'tags']),
});

export function sectionsForMode(diveMode) {
  return [...(MODE_SECTIONS[diveMode] || MODE_SECTIONS.oc)];
}

export function sectionIsVisible(diveMode, section) {
  return sectionsForMode(diveMode).includes(section);
}

export function hiddenDataSections(diveMode, record = {}) {
  const visible = new Set(sectionsForMode(diveMode));
  return Object.entries(SECTION_FIELDS)
    .filter(([section, fields]) => !visible.has(section) && fields.some((field) => field === 'gas' ? hasMeaningfulGas(record[field]) : hasMeaningfulValue(record[field])))
    .map(([section]) => section);
}

export function modeLabel(diveMode) {
  return DIVE_MODES.includes(diveMode) ? diveMode : 'oc';
}

function hasMeaningfulValue(value) {
  if (value == null || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.values(value).some(hasMeaningfulValue);
  return true;
}

function hasMeaningfulGas(gas) {
  if (!gas || typeof gas !== 'object') return false;
  if (Array.isArray(gas.tanks) && gas.tanks.length) return true;
  return Array.isArray(gas.mixes) && gas.mixes.some((mix) => mix && (mix.o2 !== 0.21 || mix.he !== 0 || (mix.label && mix.label !== 'Air')));
}
