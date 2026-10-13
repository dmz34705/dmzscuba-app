// Explicit DMZ Scuba editorial recommendations. These are intentionally kept
// separate from OpenStreetMap proximity results and destination-profile lists:
// matching one of these geofences promotes the operator with a distinct card.
const inBounds = (site, { south, north, west, east }) => Number.isFinite(site?.latitude)
  && Number.isFinite(site?.longitude)
  && site.latitude >= south && site.latitude <= north
  && site.longitude >= west && site.longitude <= east;

const text = site => [site?.name, site?.region, site?.country].filter(Boolean).join(' ').toLowerCase();
const hasTopology = (site, topology) => (site?.topologies || []).some(value => String(value).toLowerCase() === topology);

export const DMZ_OPERATOR_RECOMMENDATIONS = [
  {
    id: 'shipwreck-explorers',
    name: 'Shipwreck Explorers',
    town: 'Milwaukee, Wisconsin',
    kind: 'Lake Michigan wreck charter',
    url: 'https://www.shipwreckexplorers.com/lake-michigan-scuba-diving-charters/',
    detail: 'Wreck-diving charters from Wisconsin ports along the Lake Michigan coast.',
    // Kenosha through Two Rivers, restricted to wrecks and the Wisconsin side
    // of Lake Michigan so Michigan-shore sites are not swept into the match.
    matches: site => hasTopology(site, 'wreck') && inBounds(site, { south: 42.40, north: 44.30, west: -88.15, east: -87.20 }),
  },
  {
    id: 'jupiter-dive-center',
    name: 'Jupiter Dive Center',
    town: 'Jupiter, Florida',
    kind: 'Dive center & charter',
    url: 'https://jupiterdivecenter.com/',
    detail: 'Daily dive charters serving the Jupiter and Palm Beach County area.',
    matches: site => inBounds(site, { south: 26.52, north: 27.18, west: -80.35, east: -79.70 }),
  },
  {
    id: 'letts-dive',
    name: 'Letts Dive',
    town: 'St. Petersburg, Florida',
    kind: 'Dive center & charter',
    url: 'https://lettsdive.com/',
    detail: 'St. Petersburg dive center serving Tampa Bay and nearby Gulf diving.',
    matches: site => inBounds(site, { south: 27.30, north: 28.35, west: -83.45, east: -82.15 }),
  },
  {
    id: 'dressel-divers-cozumel',
    name: 'Dressel Divers',
    town: 'Cozumel, Mexico',
    kind: 'Dive center & resort operator',
    url: 'https://www.dresseldivers.com/dive/mexico/cozumel-scuba-diving/',
    detail: 'Cozumel dive operation offering reef diving, courses and equipment services.',
    // The island and its reefs only; the narrow western edge deliberately
    // excludes nearby Playa del Carmen on the mainland.
    matches: site => /\bcozumel\b/.test(text(site)) || inBounds(site, { south: 20.15, north: 20.70, west: -87.06, east: -86.65 }),
  },
  {
    id: 'khao-lak-scuba-adventures',
    name: 'Khao Lak Scuba Adventures',
    town: 'Khao Lak, Thailand',
    kind: 'Similan liveaboard operator',
    url: 'https://khaolakscubaadventures.com/',
    detail: 'Khao Lak operator specializing in Similan Islands liveaboards and dive trips.',
    // Similan chain through Koh Bon, Koh Tachai and nearby Richelieu Rock;
    // the east edge stops offshore of the Khao Lak mainland.
    matches: site => /\b(similan|koh bon|ko bon|koh tachai|ko tachai|richelieu)\b/.test(text(site))
      || inBounds(site, { south: 7.30, north: 9.55, west: 97.30, east: 98.15 }),
  },
];

export function recommendedOperators(site) {
  return DMZ_OPERATOR_RECOMMENDATIONS.filter(item => item.matches(site)).map(({ matches, ...item }) => ({
    ...item,
    recommended: true,
    recommendationLabel: 'DMZ Scuba recommended operator',
    source: 'dmz',
  }));
}
