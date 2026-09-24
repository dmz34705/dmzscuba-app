// Curated navigation gateways, not scientific or political boundaries. Their
// purpose is to crop the atlas into the parts of the world divers browse as a
// trip-planning unit while leaving remote destinations discoverable on their own.
export const DIVE_REGIONS = [
  { id: 'caribbean-gulf', name: 'Caribbean, Florida & Gulf', shortName: 'Caribbean + Gulf', subtitle: 'Reefs, walls, wrecks and warm-water islands', bounds: [8, -100, 33, -59], latitude: 21, longitude: -79, areas: [
    ['florida-keys', 'Florida Keys', 24.65, -81.15, 'Reefs, wrecks and NOAA mooring sites'], ['bahamas', 'The Bahamas', 24.2, -76.2, 'Walls, blue holes and island reefs'], ['cozumel', 'Cozumel', 20.43, -86.92, 'Caribbean drift diving'], ['belize', 'Belize Barrier Reef', 17.3, -87.8, 'Atolls and barrier-reef diving'], ['cayman', 'Cayman Islands', 19.32, -81.25, 'Walls and clear-water reefs'], ['bonaire', 'Bonaire', 12.16, -68.28, 'Shore diving and fringing reef'], ['bay-islands', 'Bay Islands', 16.33, -86.45, 'Honduran reef systems'],
  ] },
  { id: 'pacific-north-america', name: 'Pacific Coast of North America', shortName: 'Pacific Coast', subtitle: 'Kelp forests, pinnacles and temperate wildlife', bounds: [20, -140, 52, -105], latitude: 36, longitude: -126, areas: [
    ['vancouver-island', 'Vancouver Island', 49.55, -126.0, 'Cold-water walls and giant Pacific life'], ['monterey', 'Monterey Bay', 36.62, -121.9, 'Kelp forests and shore entries'], ['channel-islands', 'Channel Islands', 34.0, -119.7, 'Kelp, sea lions and island reefs'], ['catalina', 'Catalina Island', 33.39, -118.42, 'Kelp forests and accessible island diving'], ['la-paz', 'La Paz', 24.2, -110.3, 'Sea of Cortez reefs and sea lions'], ['cabo-pulmo', 'Cabo Pulmo', 23.44, -109.43, 'Rocky reef and schooling fish'],
  ] },
  { id: 'southeast-asia', name: 'Southeast Asia & Philippines', shortName: 'SE Asia', subtitle: 'Coral Triangle biodiversity and island passages', bounds: [-12, 94, 22, 142], latitude: 8, longitude: 116, areas: [
    ['tubbataha', 'Tubbataha Reefs', 8.85, 119.9, 'Remote Philippine atolls'], ['anilao', 'Anilao', 13.76, 120.93, 'Macro life and volcanic reefs'], ['visayas', 'Central Visayas', 9.7, 123.4, 'Reefs, walls and varied marine life'], ['apo-reef', 'Apo Reef', 12.68, 120.42, 'Offshore reef system'], ['raja-ampat', 'Raja Ampat', -0.55, 130.65, 'Exceptionally diverse coral reefs'], ['komodo', 'Komodo', -8.55, 119.55, 'Current-swept reefs and mantas'], ['sipadan', 'Sipadan', 4.11, 118.63, 'Oceanic island walls'],
  ] },
  { id: 'europe-mediterranean', name: 'Europe & Mediterranean', shortName: 'Europe + Med', subtitle: 'Rocky coasts, wrecks, caves and Atlantic islands', bounds: [27, -32, 47, 38], latitude: 38, longitude: 10, areas: [
    ['malta-gozo', 'Malta & Gozo', 36.0, 14.35, 'Caves, arches and wrecks'], ['dalmatia', 'Croatian Adriatic', 43.0, 16.3, 'Walls, islands and wrecks'], ['cyclades', 'Greek Aegean', 37.2, 25.2, 'Rocky reefs and island diving'], ['costa-brava', 'Costa Brava', 42.1, 3.2, 'Mediterranean coves and reefs'], ['azores', 'Azores', 38.5, -28.2, 'Atlantic seamounts and pelagic life'], ['madeira', 'Madeira', 32.75, -16.98, 'Volcanic Atlantic reefs'], ['canaries', 'Canary Islands', 28.3, -16.3, 'Volcanic terrain and Atlantic wildlife'],
  ] },
  { id: 'red-sea', name: 'Red Sea & Arabia', shortName: 'Red Sea', subtitle: 'Coral walls, offshore reefs and celebrated wrecks', bounds: [10, 31, 31, 58], latitude: 21, longitude: 40, areas: [
    ['sinai', 'Sinai Peninsula', 28.0, 34.4, 'Walls, reefs and straits'], ['hurghada', 'Hurghada', 27.25, 33.85, 'Reefs and wreck access'], ['marsa-alam', 'Marsa Alam', 25.05, 34.9, 'Southern Red Sea reefs'], ['brothers-daedalus', 'Brothers & Daedalus', 24.7, 35.1, 'Remote offshore reefs'], ['aqaba', 'Gulf of Aqaba', 29.3, 34.95, 'Northern Red Sea coral reefs'], ['socotra', 'Socotra', 12.5, 54.0, 'Remote Arabian Sea island diving'],
  ] },
  { id: 'indian-ocean', name: 'Indian Ocean Islands', shortName: 'Indian Ocean', subtitle: 'Atolls, channels and tropical island reefs', bounds: [-27, 34, 12, 82], latitude: -8, longitude: 65, areas: [
    ['maldives', 'Maldives', 3.2, 73.2, 'Atolls, channels and pelagic life'], ['seychelles', 'Seychelles', -4.62, 55.45, 'Granite islands and coral reefs'], ['mauritius', 'Mauritius', -20.25, 57.5, 'Lagoons, walls and passes'], ['zanzibar', 'Zanzibar & Pemba', -5.3, 39.7, 'East African island reefs'], ['tofo', 'Tofo & Inhambane', -23.85, 35.55, 'Megafauna and Mozambique reefs'], ['reunion', 'Réunion', -21.15, 55.5, 'Volcanic slopes and fringing reef'],
  ] },
  { id: 'australia', name: 'Australia', shortName: 'Australia', subtitle: 'Barrier reefs, temperate coasts and western coral systems', bounds: [-45, 108, -8, 157], latitude: -27, longitude: 135, areas: [
    ['great-barrier-reef', 'Great Barrier Reef', -18.3, 147.2, 'Coral Sea reefs and ribbon reefs'], ['ningaloo', 'Ningaloo Coast', -22.7, 113.75, 'Fringing reef and seasonal megafauna'], ['coral-sea', 'Coral Sea', -18.0, 152.0, 'Remote oceanic reefs'], ['sydney', 'Sydney Coast', -33.9, 151.3, 'Temperate rocky reefs'], ['south-australia', 'South Australia', -34.8, 137.5, 'Temperate reefs and distinctive wildlife'], ['tasmania', 'Tasmania', -42.0, 147.0, 'Cool-water reefs and kelp'],
  ] },
  { id: 'western-pacific', name: 'Western Pacific Islands', shortName: 'W Pacific', subtitle: 'Oceanic islands, passages and coral-rich archipelagos', bounds: [-28, 130, 22, 180], latitude: -10, longitude: 165, areas: [
    ['palau', 'Palau', 7.5, 134.5, 'Channels, walls and reef passages'], ['papua-new-guinea', 'Papua New Guinea', -5.5, 150.0, 'Coral reefs and volcanic seascapes'], ['fiji', 'Fiji', -17.8, 178.1, 'Soft corals and current-fed reefs'], ['vanuatu', 'Vanuatu', -16.2, 167.5, 'Wrecks and volcanic islands'], ['solomons', 'Solomon Islands', -9.0, 159.0, 'Reefs, wrecks and passages'], ['new-caledonia', 'New Caledonia', -21.5, 165.5, 'Large lagoon and barrier reef'],
  ] },
  { id: 'japan-northwest-pacific', name: 'Japan & Northwest Pacific', shortName: 'Japan', subtitle: 'Subtropical islands and temperate volcanic coasts', bounds: [22, 123, 46, 148], latitude: 35, longitude: 140, areas: [
    ['okinawa', 'Okinawa', 26.4, 127.8, 'Subtropical coral reefs'], ['izu', 'Izu Peninsula & Islands', 34.5, 139.0, 'Volcanic reefs and seasonal currents'], ['ogasawara', 'Ogasawara Islands', 27.1, 142.2, 'Remote oceanic islands'], ['ishigaki', 'Ishigaki & Yaeyama', 24.4, 124.1, 'Coral reefs and manta habitat'], ['hokkaido', 'Hokkaido', 43.2, 144.0, 'Cold-water diving'],
  ] },
  { id: 'southern-africa', name: 'Southern Africa', shortName: 'Southern Africa', subtitle: 'Two-ocean coasts, reefs, kelp and megafauna', bounds: [-38, 10, -10, 45], latitude: -29, longitude: 28, areas: [
    ['cape-town', 'Cape Town', -34.0, 18.5, 'Kelp forests and rocky reefs'], ['aliwal-shoal', 'Aliwal Shoal', -30.27, 30.82, 'Offshore reef and shark encounters'], ['sodwana', 'Sodwana Bay', -27.55, 32.68, 'Subtropical reef systems'], ['proteabanks', 'Protea Banks', -30.8, 30.45, 'Offshore reef diving'], ['mozambique-channel', 'Mozambique Channel', -20.0, 38.0, 'Tropical reefs and pelagic corridors'],
  ] },
].map(region => ({ ...region, areas: region.areas.map(([id, name, latitude, longitude, subtitle]) => ({ id, name, latitude, longitude, subtitle, region: region.name, zoom: 7 })) }));

export const REMOTE_DIVE_AREAS = [
  ['hawaii', 'Hawaiian Islands', 20.8, -156.6, 'Remote Pacific archipelago'],
  ['galapagos', 'Galápagos Islands', -0.55, -90.55, 'Remote eastern Pacific archipelago'],
  ['cocos', 'Cocos Island', 5.52, -87.05, 'Standalone eastern Pacific destination'],
  ['socorro', 'Revillagigedo Islands', 18.78, -110.95, 'Remote eastern Pacific islands'],
  ['rapa-nui', 'Rapa Nui', -27.12, -109.35, 'Remote southeastern Pacific island'],
  ['st-helena', 'Saint Helena', -15.96, -5.72, 'Remote South Atlantic island'],
].map(([id, name, latitude, longitude, subtitle]) => ({ id, name, latitude, longitude, subtitle, region: 'Standalone destination', zoom: 7 }));
