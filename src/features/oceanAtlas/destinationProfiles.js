// Optional, sourced enrichment for destinations we know in detail. The journey
// planner works for every site without these (see journey.js); a profile only
// adds named arrival routes, sourced operators/stays and local considerations.
// Operators are never claimed to serve a particular site.

const BLUE_STAR = { name: 'NOAA Blue Star operators', url: 'https://sanctuaries.noaa.gov/bluestar/operators.html' };

function keysBase(longitude) {
  if (longitude < -81.6) return 'Key West';
  if (longitude < -81.2) return 'Lower Keys';
  if (longitude < -80.8) return 'Marathon';
  if (longitude < -80.55) return 'Islamorada';
  return 'Key Largo';
}
const KEYS_TOWNS = { 'Key West': 'Key West, Florida', 'Lower Keys': 'Big Pine Key, Florida', Marathon: 'Marathon, Florida', Islamorada: 'Islamorada, Florida', 'Key Largo': 'Key Largo, Florida' };

export const DESTINATION_PROFILES = [
  {
    id: 'cozumel', name: 'Cozumel', country: 'Mexico', kind: 'island',
    conditions: { current: 'drift' }, // most Cozumel diving is a drift
    matches: site => site.latitude >= 20.1 && site.latitude <= 20.7 && site.longitude >= -87.1 && site.longitude <= -86.7,
    town: () => 'San Miguel de Cozumel, Mexico',
    arrivals: [{ code: 'CZM', name: 'Cozumel airport', label: 'Arrive on the island', summary: 'Flight · local transfer · dive boat' },
      { code: 'CUN', name: 'Cancún airport', label: 'Via Cancún & ferry', summary: 'Flight · mainland transfer · ferry · dive boat',
        via: [{ mode: 'LAND', title: 'Transfer to Playa del Carmen', detail: 'Travel from Cancún airport to the Playa del Carmen passenger ferry terminal by ground transfer or bus.', from: 'Cancún International Airport', to: 'Playa del Carmen passenger ferry terminal' },
          { mode: 'FERRY', title: 'Cross to Cozumel', detail: 'Take the passenger ferry from Playa del Carmen to Cozumel. Check current departures with the operator.', url: 'https://www.ultramarferry.com/en/fares', action: 'View ferry information', arriveAt: 'Cozumel passenger ferry terminal' }] }],
    operators: [
      { name: 'Aldora Divers', town: 'San Miguel', url: 'https://www.aldora.com/', detail: 'Full-service boat diving; boats collect divers from waterfront hotels.' },
      { name: 'Blue Note Scuba', town: 'San Miguel', url: 'https://www.bluenotescuba.com/', detail: 'PADI dive center with courses and boat diving.' },
      { name: 'Blue XT-Sea Diving', town: 'San Miguel', url: 'https://www.bluextseadiving.com', detail: 'Boat diving and training.' },
      { name: 'ScubaTony', town: 'San Miguel', url: 'https://www.scubatony.com/', detail: 'Small-group boat diving; helps arrange private condo stays.' },
    ],
    stays: [
      { name: 'Scuba Club Cozumel', town: 'Waterfront, ~1 mile south of the ferry dock', url: 'https://www.scubaclubcozumel.com/', detail: 'Dedicated dive resort with diving on site.' },
      { name: 'Villa Aldora', town: 'North coast', url: 'https://www.aldoravilla.com/', detail: 'Boutique dive hotel; Aldora boats pick up from its dock.' },
      { name: 'Blue Note Scuba · stay & dive', town: 'Partner hotels', url: 'https://www.bluenotescuba.com/stay-and-dive', detail: 'Packages combining partner hotels with diving.' },
    ],
    considerations: [
      { title: 'Marine park fee and reef rest', detail: 'Cozumel reefs sit in a national park. Operators collect the park fee, and some reefs close on a rotating schedule, so confirm your site is open.' },
      { title: 'Drift diving', detail: 'Most Cozumel diving is a drift with current. Tell your operator your experience so they can match the site.' },
      { title: 'Passenger ferry only', detail: 'The Playa del Carmen ferry carries foot passengers. Vehicles cross on a separate car ferry from Calica.' },
    ],
    sources: [{ name: 'ASUR · airports', url: 'https://www.asur.com.mx/nuestros-aeropuertos-0' }, { name: 'Ultramar · ferry', url: 'https://www.ultramarferry.com/en/fares' }],
  },
  {
    id: 'florida-keys', name: 'Florida Keys', country: 'United States', kind: 'island chain', road: true,
    matches: site => site.id?.startsWith('noaa-fknms-') || site.id === 'florida-keys'
      || (site.latitude >= 24.3 && site.latitude <= 25.35 && site.longitude >= -82.2 && site.longitude <= -80.1),
    town: site => KEYS_TOWNS[keysBase(site.longitude)],
    arrivals: [{ code: 'MIA', name: 'Miami International Airport', label: 'Via Miami', summary: 'Flight · Overseas Highway · dive boat' },
      { code: 'EYW', name: 'Key West International Airport', label: 'Via Key West', summary: 'Flight · island transfer · dive boat' }],
    operators: [
      ['Rainbow Reef', 'Key Largo', 'https://rainbowreef.us'], ['Horizon Divers', 'Key Largo', 'https://horizondivers.com'], ['Sea Dwellers Dive Center', 'Key Largo', 'https://seadwellers.com'],
      ['Islamorada Dive Center', 'Islamorada', 'https://islamoradadivecenter.com'], ['Key Dives', 'Islamorada', 'https://keydives.com'],
      ["Captain Hook's Marina and Dive Center", 'Marathon', 'https://captainhooks.com'], ["Tilden's Scuba Center", 'Marathon', 'https://tildensscubacenter.com'], ['Dive Isla Bella', 'Marathon', 'https://diveislabella.com'],
      ["Captain Hook's Looe Key Reef Adventures", 'Lower Keys', 'https://captainhooks.com'], ['Looe Key Reef Resort and Dive Center', 'Lower Keys', 'https://diveflakeys.com'],
      ["Captain's Corner Dive Center", 'Key West', 'https://captainscorner.com'], ['Southpoint Divers', 'Key West', 'https://southpointdivers.com'], ['Lost Reef Adventures', 'Key West', 'https://lostreefadventures.com'],
    ].map(([name, town, url]) => ({ name, town, url, detail: 'NOAA Blue Star recognized operator.', source: BLUE_STAR })),
    stays: [
      { name: 'Amoray Dive Resort', town: 'Key Largo', url: 'https://www.amoray.com/', detail: 'Bayside resort with its own Blue Star dive center.' },
      { name: 'Looe Key Reef Resort and Dive Center', town: 'Lower Keys', url: 'https://diveflakeys.com', detail: 'Motel and dive shop together, closest base to Looe Key.' },
    ],
    base: site => keysBase(site.longitude),
    considerations: [
      { title: 'Drive time down the Keys', detail: 'The Overseas Highway is the only road. Allow roughly 1 hour from Miami to Key Largo and 3½–4 hours to Key West.' },
      { title: 'Sanctuary rules', detail: 'The Keys reefs are a National Marine Sanctuary. Use mooring buoys, never anchor on coral, and fly a dive flag.' },
    ],
    sources: [{ name: 'Florida Keys · getting here', url: 'https://fla-keys.com/how-to-get-here/index.html' }, BLUE_STAR],
  },
];

export function destinationProfile(site) {
  return DESTINATION_PROFILES.find(profile => profile.matches(site)) || null;
}
