export const FEATURE_CATALOG = Object.freeze([
  {
    id: 'color-loss',
    area: 'learn',
    routeType: 'web-demo',
    icon: 'color-loss',
    accent: 'cyan',
    eyebrow: 'LIGHT + DEPTH',
    badge: 'INTERACTIVE LAB',
    title: 'Underwater Color Loss',
    summary: 'See which colors fade first as sunlight travels through water, then bring them back with a dive light.',
    shortSummary: 'See how depth changes the colors you see.',
    action: 'Start color-loss lab',
    featured: true,
  },
  {
    id: 'boyles-law',
    area: 'learn',
    routeType: 'web-demo',
    icon: 'boyle',
    accent: 'gold',
    eyebrow: 'PRESSURE + VOLUME',
    badge: 'INTERACTIVE LAB',
    title: 'Boyle’s Law Lab',
    summary: 'Explore how pressure changes gas volume and why breathing gas is used faster as you descend.',
    shortSummary: 'Build intuition for pressure, volume, and gas use.',
    action: 'Start Boyle’s Law lab',
  },
  {
    id: 'dive-computer-simulator',
    area: 'learn',
    routeType: 'dive-computer-simulator',
    icon: 'dive-computer',
    accent: 'cyan',
    eyebrow: 'DEPTH + TIME + DECOMPRESSION',
    badge: 'NATIVE SIMULATOR',
    title: 'Dive Computer Trainer',
    summary: 'Practice a recreational computer display, controlled ascents, safety stops, alarms, and decompression responses in guided scenarios.',
    shortSummary: 'Practice reading and responding to a rental-style dive computer.',
    action: 'Open computer trainer',
  },
  {
    id: 'dive-calculator',
    area: 'tools',
    routeType: 'calculator',
    icon: 'calculator',
    accent: 'good',
    eyebrow: 'PLANNING + GAS',
    badge: 'NATIVE TOOL',
    title: 'Dive Calculator',
    summary: 'Calculate pressure, Nitrox limits, tank blending, gas requirements, cylinder profiles, and Bühlmann tissue snapshots.',
    shortSummary: 'Planning, gas, blending, and decompression tools.',
    action: 'Open calculator',
  },
  {
    id: 'dive-lens',
    area: 'tools',
    routeType: 'lens',
    icon: 'lens',
    accent: 'cyan',
    eyebrow: 'PHOTO IDENTIFICATION',
    badge: 'AI TOOL',
    title: 'Dive Lens',
    summary: 'Photograph or upload marine life or dive gear for an AI-assisted identification.',
    shortSummary: 'Identify marine life and dive gear from a photo.',
    action: 'Open Dive Lens',
  },
]);

export function getFeature(featureId) {
  return FEATURE_CATALOG.find((feature) => feature.id === featureId) || null;
}

export function getFeaturesByArea(area) {
  return FEATURE_CATALOG.filter((feature) => feature.area === area);
}

export function getFeaturedFeature() {
  return FEATURE_CATALOG.find((feature) => feature.featured) || FEATURE_CATALOG[0] || null;
}
