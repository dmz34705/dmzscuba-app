// Untrusted AI/network data becomes a bounded, render-safe view model here.
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const text = (value) => typeof value === 'string' ? value.trim().slice(0, 600) || null : null;
const list = (value) => Array.isArray(value) ? value.map(text).filter(Boolean).slice(0, 5) : [];
const confidence = (value) => ['high', 'medium', 'low'].includes(value) ? value : 'low';
const fields = (value, keys) => Object.fromEntries(keys.map((key) => [key, text(value[key])]));

export function normalizeLensResult(input) {
  const raw = object(input);
  if (!text(raw.commonName) || !['gear', 'marine_life', 'unclear'].includes(raw.category)) return null;
  const gear = object(raw.gear);
  const marine = object(raw.marineLife);
  const levels = raw.category === 'gear' ? ['component', 'subtype', 'model']
    : raw.category === 'marine_life' ? ['group', 'family', 'genus', 'species'] : ['unidentified'];
  const level = levels.includes(raw.identificationLevel) ? raw.identificationLevel : null;
  return {
    ...fields(raw, ['commonName', 'description', 'safetyNote', 'funFact', 'uncertainty', 'nextPhoto']),
    category: raw.category,
    confidence: confidence(raw.confidence),
    identificationLevel: level,
    scientificName: raw.category === 'marine_life' && (!level || level === 'species') ? text(raw.scientificName) : null,
    evidence: list(raw.evidence),
    alternatives: Array.isArray(raw.alternatives) ? raw.alternatives.map(object)
      .map((item) => fields(item, ['name', 'distinction'])).filter((item) => item.name && item.distinction).slice(0, 3) : [],
    gear: raw.category === 'gear' && Object.keys(gear).length ? {
      ...fields(gear, ['component', 'subtype', 'configuration', 'intendedUse']),
      manufacturer: confidence(gear.manufacturerConfidence) !== 'low' ? text(gear.manufacturer) : null,
      model: confidence(gear.modelConfidence) !== 'low' ? text(gear.model) : null,
      manufacturerConfidence: confidence(gear.manufacturerConfidence),
      modelConfidence: confidence(gear.modelConfidence),
      markings: list(gear.markings), visibleFeatures: list(gear.visibleFeatures),
    } : null,
    marineLife: raw.category === 'marine_life' && Object.keys(marine).length ? fields(marine, [
      'group', 'family', 'typicalSize', 'depthRange', 'habitat', 'distribution', 'diet', 'behavior',
    ]) : null,
  };
}

export function lensDetailSections(result) {
  const row = (label, value) => ({ label, value: value || 'Not established' });
  if (result.gear) {
    const gear = result.gear;
    const identity = (value, certainty) => value ? `${value} · ${certainty} confidence` : 'Not identified from this photo';
    return [
      { title: 'Equipment identity', rows: [row('Component', gear.component), row('Type / design', gear.subtype),
        row('Manufacturer', identity(gear.manufacturer, gear.manufacturerConfidence)), row('Model', identity(gear.model, gear.modelConfidence))] },
      { title: 'Configuration & purpose', rows: [row('Configuration', gear.configuration), row('Typical use', gear.intendedUse),
        row('Visible features', gear.visibleFeatures.join('\n')), row('Readable markings', gear.markings.join('\n'))] },
    ];
  }
  if (result.marineLife) {
    const marine = result.marineLife;
    return [
      { title: 'Classification & size', note: 'Approximate reference information for the suggested identity—not measurements of this animal or this dive.',
        rows: [row('Group', marine.group), row('Family', marine.family), row('Typical size', marine.typicalSize), row('Depth range', marine.depthRange)] },
      { title: 'Habitat & ecology', rows: [row('Habitat', marine.habitat), row('Geographic range', marine.distribution), row('Diet', marine.diet), row('Behavior', marine.behavior)] },
    ];
  }
  return [];
}
