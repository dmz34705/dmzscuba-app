// Editorial coverage areas, not species distribution boundaries. Months are
// documented encounter windows, not probabilities or guaranteed sightings.
export const MARINE_REGIONS = [
  {
    id: 'florida-keys', name: 'Florida Keys', subtitle: 'Reefs, wrecks & gentle giants',
    latitude: 24.65, longitude: -81.15, bounds: [24.2, -82.2, 25.5, -80], zoom: 8,
    species: [
      { id: 'goliath-grouper', name: 'Goliath grouper', scientific: 'Epinephelus itajara', months: [7, 8, 9], season: 'Jul–Sep · spawning aggregations', note: 'Florida spawning gatherings occur around selected wrecks and reefs. Resident fish may be encountered outside this window.', source: 'Florida Fish and Wildlife', url: 'https://myfwc.com/fishing/saltwater/recreational/goliath/' },
      { id: 'nurse-shark', name: 'Nurse shark', scientific: 'Ginglymostoma cirratum', months: [], season: 'Regional presence · season not documented', note: 'A bottom-dwelling shark documented in the sanctuary. Give resting animals space.', source: 'NOAA Florida Keys', url: 'https://floridakeys.noaa.gov/education/creature-feature.html' },
      { id: 'green-turtle', name: 'Green sea turtle', scientific: 'Chelonia mydas', months: [], season: 'Regional presence · season not documented', note: 'Documented in sanctuary waters. Observe without touching or interrupting its route to the surface.', source: 'NOAA Florida Keys', url: 'https://floridakeys.noaa.gov/education/creature-feature.html' },
    ],
  },
  {
    id: 'hawaii', name: 'Hawaiian Islands', subtitle: 'The winter gathering',
    latitude: 20.8, longitude: -156.6, bounds: [18.5, -160.8, 22.6, -154.5], zoom: 6,
    species: [
      { id: 'humpback', name: 'Humpback whale', scientific: 'Megaptera novaeangliae', months: [11, 12, 1, 2, 3, 4], season: 'Nov–Apr · peak Jan–Mar', note: 'Winter breeding grounds. A whale-watching opportunity; keep the required distance and never pursue or approach whales in the water.', source: 'NOAA Hawaiian Islands Sanctuary', url: 'https://hawaiihumpbackwhale.noaa.gov/about/about.html' },
    ],
  },
  {
    id: 'darwin-wolf', name: 'Darwin & Wolf', subtitle: 'Galápagos · the big blue',
    latitude: 1.55, longitude: -91.95, bounds: [1.1, -92.5, 2.1, -91.4], zoom: 7,
    species: [
      { id: 'whale-shark', name: 'Whale shark', scientific: 'Rhincodon typus', months: [6, 7, 8, 9, 10, 11], season: 'Jun–Nov · typical sighting window', note: 'Seasonal visitors to the northern Galápagos, especially around Darwin and Wolf.', source: 'Galápagos Conservation Trust', url: 'https://galapagosconservation.org.uk/species/whale-shark/' },
      { id: 'hammerhead', name: 'Scalloped hammerhead', scientific: 'Sphyrna lewini', months: [], season: 'Regional presence · season not documented', note: 'Schooling hammerheads are documented around Darwin. This source does not establish a monthly encounter window.', source: 'Galápagos Conservation Trust', url: 'https://galapagosconservation.org.uk/about-galapagos/islands/darwin/' },
    ],
  },
  {
    id: 'baa', name: 'Baa Atoll', subtitle: 'Maldives · the manta gathering',
    latitude: 5.2, longitude: 73.1, bounds: [4.85, 72.7, 5.5, 73.4], zoom: 8,
    species: [
      { id: 'reef-manta', name: 'Reef manta ray', scientific: 'Mobula alfredi', months: [5, 6, 7, 8, 9, 10, 11], season: 'May–Nov · southwest monsoon', note: 'Feeding gatherings around Hanifaru Bay follow the monsoon. Hanifaru is a managed snorkelling area; check local access rules.', source: 'Manta Trust · Baa Atoll report', url: 'https://www.mantatrust.org/s/MT_MMRP_Annual-Report_Baa-Atoll_2018_FINAL-e77m.pdf' },
    ],
  },
  {
    id: 'south-ari', name: 'South Ari Atoll', subtitle: 'Maldives · whale shark country',
    latitude: 3.5, longitude: 72.85, bounds: [3.35, 72.65, 3.8, 73.05], zoom: 8,
    species: [
      { id: 'whale-shark', name: 'Whale shark', scientific: 'Rhincodon typus', months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], season: 'Year-round · documented presence', note: 'A resident aggregation of predominantly juvenile males. Encounters vary with currents, weather and local conditions.', source: 'Maldives Whale Shark Research Programme', url: 'https://maldiveswhalesharkresearch.org/wp-content/uploads/2017/04/MWRSP-Annual-Report-2016.pdf' },
    ],
  },
  {
    id: 'ningaloo', name: 'Ningaloo Coast', subtitle: 'Western Australia · life on the reef',
    latitude: -22.4, longitude: 113.7, bounds: [-23.7, 113.2, -21.6, 114.3], zoom: 7,
    species: [
      { id: 'whale-shark', name: 'Whale shark', scientific: 'Rhincodon typus', months: [3, 4, 5, 6, 7], season: 'Mar–Jul · seasonal aggregation', note: 'Whale sharks gather off Ningaloo during this window. Follow local operators’ wildlife interaction rules.', source: 'Western Australia DBCA', url: 'https://www.dbca.wa.gov.au/wildlife-and-ecosystems/marine/whale-shark-management-western-australia' },
      { id: 'humpback', name: 'Humpback whale', scientific: 'Megaptera novaeangliae', months: [7, 8, 9, 10], season: 'Jul–Oct · migration', note: 'Migrating whales pass the coast. Use licensed operators and follow local viewing rules.', source: 'Tourism Australia', url: 'https://www.australia.com/en-nz/places/perth-and-surrounds/guide-to-ningaloo-reef.html' },
    ],
  },
  {
    id: 'cozumel', name: 'Cozumel', subtitle: 'Winter eagle rays on the drift',
    latitude: 20.42, longitude: -86.95, bounds: [20.1, -87.1, 20.7, -86.7], zoom: 9,
    species: [
      { id: 'spotted-eagle-ray', name: 'Spotted eagle ray', scientific: 'Aetobatus narinari', months: [12, 1, 2, 3], season: 'Dec–Mar · eagle ray season', note: 'Adults gather around Cozumel in winter, with January and February often strongest; sightings can start earlier or run into April. Keep your distance and let them pass.', source: 'Cozumel Ocean Research · Spotted Eagle Ray Program', url: 'https://www.cozumeloceanresearch.org/eagle-ray-program' },
    ],
  },
  {
    id: 'jupiter', name: 'Jupiter, Florida', subtitle: 'Winter lemon sharks, late-summer goliaths',
    latitude: 26.93, longitude: -80.05, bounds: [26.6, -80.2, 27.25, -79.85], zoom: 9,
    species: [
      { id: 'lemon-shark', name: 'Lemon shark', scientific: 'Negaprion brevirostris', months: [11, 12, 1, 2, 3, 4, 5], season: 'Nov–May · winter aggregation', note: 'Adult lemon sharks aggregate off Jupiter through the cooler months, tracking water near 23–24 °C, then leave quickly.', source: 'Jupiter Lemon Shark Project · Shark Foundation', url: 'https://shark.swiss/projects/completed/lemon-sharks-jupiter' },
      { id: 'goliath-grouper', name: 'Goliath grouper', scientific: 'Epinephelus itajara', months: [8, 9, 10], season: 'Aug–Oct · spawning aggregation', note: 'Goliath grouper gather on wrecks and reefs off Jupiter to spawn, strongest in August and September around the new moon. Protected species — look, don’t touch.', source: 'Fishes (MDPI) · goliath grouper aggregation study', url: 'https://doi.org/10.3390/fishes8080394' },
    ],
  },
];
