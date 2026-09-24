import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { planJourney } from './journey';
import { approxDistance, distanceText } from './units';

// Android requires location permission for the platform geocoder; iOS does not.
async function canGeocode() {
  if (Platform.OS === 'ios') return true;
  return (await Location.getForegroundPermissionsAsync().catch(() => null))?.granted === true;
}
const withTimeout = (promise, ms, fallback) => { let timer; return Promise.race([promise.finally(() => clearTimeout(timer)), new Promise(resolve => { timer = setTimeout(() => resolve(fallback), ms); })]); };
const placeLine = place => place && [place.city || place.subregion || place.district, place.region, place.country].filter(Boolean).join(', ');

export default function JourneySheet({ site, units = 'imperial', onOrigin, onClose }) {
  const insets = useSafeAreaInsets();
  const [origin, setOrigin] = useState('');
  const [originPoint, setOriginPoint] = useState(null);
  const [locality, setLocality] = useState('');
  const [arrival, setArrival] = useState(0);
  const [local, setLocal] = useState(false);
  const [expanded, setExpanded] = useState(0);
  const [baseTab, setBaseTab] = useState('operators');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const active = useRef(true);
  const request = useRef(0);
  useEffect(() => () => { active.current = false; request.current++; }, []);

  // Layer 2 refinement: name the town/island nearest the site when the platform geocoder can.
  useEffect(() => {
    let live = true;
    (async () => {
      if (!(await canGeocode())) return;
      const places = await withTimeout(Location.reverseGeocodeAsync({ latitude: site.latitude, longitude: site.longitude }).catch(() => []), 4000, []);
      if (live && active.current) setLocality(placeLine(places[0]) || '');
    })();
    return () => { live = false; };
  }, [site.latitude, site.longitude]);

  useEffect(() => { if (originPoint) onOrigin?.(originPoint); }, [originPoint]);
  const plan = useMemo(() => planJourney(site, { origin, originPoint, locality, arrivalIndex: arrival, local, units }), [site, origin, originPoint, locality, arrival, local, units]);
  const { destination, arrivals, legs, base, considerations } = plan;
  const open = url => Linking.openURL(url).catch(() => setNotice('Couldn’t open this link. Please try again.'));
  const resetRoute = () => { setArrival(0); setExpanded(0); };

  async function locate() {
    const id = ++request.current;
    setBusy(true); setNotice('');
    let timer;
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') throw new Error('permission');
      const position = await Promise.race([Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 15000); })]);
      if (!active.current || request.current !== id) return;
      const places = await withTimeout(Location.reverseGeocodeAsync(position.coords).catch(() => []), 4000, []);
      if (!active.current || request.current !== id) return;
      const city = placeLine(places[0]);
      setOrigin(city || `${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`);
      setOriginPoint({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      resetRoute();
      setNotice(city ? 'Starting near your current location. Refine the address if needed.' : 'Current coordinates selected. Enter a city or airport for a broader flight search.');
    } catch {
      if (active.current && request.current === id) setNotice('Location unavailable. Enter a city, airport or address below.');
    } finally { clearTimeout(timer); if (active.current && request.current === id) setBusy(false); }
  }

  // Place a typed origin so nearby trips can be offered overland. Optional: flight searches work from the text alone.
  async function placeOrigin() {
    const text = origin.trim();
    if (!text || originPoint) return;
    const id = ++request.current;
    if (!(await canGeocode())) return;
    const results = await withTimeout(Location.geocodeAsync(text).catch(() => []), 4000, []);
    if (active.current && request.current === id && results[0]) { setOriginPoint({ latitude: results[0].latitude, longitude: results[0].longitude }); resetRoute(); }
  }

  // Country › area › town, without repeats (small island nations often geocode to their own name).
  const crumbs = [...new Set([destination.country, destination.areaName, locality.split(',')[0].trim()].filter(Boolean))];
  const closest = destination.closest;
  const baseItems = baseTab === 'operators' ? base.operators : base.stays;
  const baseSearches = base.searches.filter(search => search.kind === baseTab);
  const sources = [...(destination.profile?.sources || []), { name: 'Airports · OurAirports (public domain)', url: 'https://ourairports.com/data/' }, { name: 'Airport connectivity · OpenFlights (ODbL)', url: 'https://openflights.org/data.php' }];

  return <KeyboardAvoidingView style={[s.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <View style={s.header}><View><Text style={s.eyebrow}>OCEAN ATLAS / JOURNEY</Text><Text style={s.heading}>Get me here.</Text></View><Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close journey planner" style={s.close}><Text style={s.closeText}>×</Text></Pressable></View>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Text style={s.destination}>{site.name}</Text>
      <View style={s.crumbs}>{crumbs.map((crumb, index) => <Text key={crumb} style={s.crumb}>{index ? '›  ' : ''}{crumb}</Text>)}</View>
      {!!closest && <Text style={s.note}>Nearest scheduled airport: {closest.name} · {closest.code}, {approxDistance(closest.distanceKm, units)}</Text>}

      <View style={s.originBox}><Text style={s.eyebrow}>STARTING FROM</Text><TextInput value={origin} onChangeText={text => { request.current++; setBusy(false); setOrigin(text); if (originPoint) { setOriginPoint(null); resetRoute(); } setNotice(''); }} onEndEditing={placeOrigin} placeholder="City, airport or address" placeholderTextColor="#819da9" style={s.input} accessibilityLabel="Journey starting point" maxLength={200} returnKeyType="done" />
        <Pressable onPress={locate} disabled={busy} accessibilityRole="button" style={s.location}>{busy ? <ActivityIndicator color="#9be6ca" /> : <Text style={s.link}>◎  Use my current location</Text>}</Pressable>
        {!!notice && <Text accessibilityLiveRegion="polite" style={s.note}>{notice}</Text>}
      </View>

      <View style={s.tabs}>{[['Plan arrival', false], ['Already nearby', true]].map(([label, value]) => <Pressable key={label} onPress={() => { setLocal(value); setExpanded(0); }} accessibilityRole="button" accessibilityState={{ selected: local === value }} style={[s.tab, local === value && s.activeTab]}><Text style={[s.tabText, local === value && s.activeText]}>{label}</Text></Pressable>)}</View>
      {!local && arrivals.map((option, index) => <Pressable key={option.code} onPress={() => { setArrival(index); setExpanded(0); }} accessibilityRole="button" accessibilityState={{ selected: arrival === index }} style={[s.option, arrival === index && s.selectedOption]}><View style={s.optionCopy}><Text style={s.optionTitle}>{option.label}{option.recommended ? '  ·  suggested' : ''}</Text><Text style={s.note}>{option.name ? `${option.name} · ` : ''}{option.summary}</Text></View><Text style={s.code}>{option.road ? '⟶' : option.code}</Text></Pressable>)}

      <View style={s.sectionHeading}><Text style={s.eyebrow}>YOUR WAY TO THE WATER</Text><Text style={s.note}>{legs.length} steps</Text></View>
      {legs.map((leg, index) => <View key={`${local}-${arrival}-${index}`} style={s.leg}><View style={s.rail}><View style={s.number}><Text style={s.numberText}>{index + 1}</Text></View>{index < legs.length - 1 && <View style={s.line} />}</View><View style={s.legContent}><Pressable onPress={() => setExpanded(expanded === index ? -1 : index)} accessibilityRole="button" accessibilityState={{ expanded: expanded === index }} style={s.legButton}><View style={s.optionCopy}><Text style={s.mode}>{leg.mode}</Text><Text style={s.legTitle}>{leg.title}</Text></View><Text style={s.chevron}>{expanded === index ? '−' : '+'}</Text></Pressable>{expanded === index && <View><Text style={s.detail}>{leg.detail}</Text><Pressable accessibilityRole="link" onPress={() => open(leg.url)} style={s.action}><Text style={s.link}>{leg.action} ↗</Text></Pressable></View>}</View></View>)}

      <View style={s.sectionHeading}><Text style={s.eyebrow}>YOUR DIVE BASE</Text><Text style={s.note}>{destination.base || destination.areaName}</Text></View>
      <View style={s.tabs}>{[['Dive operators', 'operators'], ['Stay & dive', 'stays']].map(([label, value]) => <Pressable key={value} onPress={() => setBaseTab(value)} accessibilityRole="button" accessibilityState={{ selected: baseTab === value }} style={[s.tab, baseTab === value && s.activeTab]}><Text style={[s.tabText, baseTab === value && s.activeText]}>{label}</Text></Pressable>)}</View>
      {baseItems.map(item => <Pressable key={`${item.name}-${item.distanceKm ?? item.town}`} onPress={() => open(item.url)} accessibilityRole="link" style={s.card}><View style={s.optionCopy}><Text style={s.optionTitle}>{item.name}</Text>
        <Text style={s.cardTown}>{item.distanceKm != null ? `${distanceText(item.distanceKm, units).replace(/^under/, 'Under')} from the site · ${item.kind}` : `${item.town} · local list`}</Text>
        <Text style={s.note}>{item.detail}{item.phone ? `  ·  ${item.phone}` : ''}</Text></View><Text style={s.link}>↗</Text></Pressable>)}
      {baseSearches.map(search => <Pressable key={search.title} onPress={() => open(search.url)} accessibilityRole="link" style={[s.card, s.searchCard]}><View style={s.optionCopy}><Text style={s.optionTitle}>{search.title}</Text><Text style={s.note}>{search.detail}</Text></View><Text style={s.link}>↗</Text></Pressable>)}
      <Text style={s.caveat}>{baseItems.length ? 'Listed by distance from the dive site — closest first, never ranked or sponsored. From OpenStreetMap (© OpenStreetMap contributors) plus any sourced local list. None is confirmed for this exact site — ask before booking.' : 'No operators are mapped near this site yet. Searches open with this dive area filled in — confirm the operator runs trips to this site before booking.'}</Text>

      <View style={s.sectionHeading}><Text style={s.eyebrow}>BEFORE YOU GO</Text></View>
      {considerations.map(item => <View key={item.title} style={s.consider}><Text style={s.considerTitle}>{item.title}</Text><Text style={s.detailTight}>{item.detail}</Text>{!!item.url && <Pressable accessibilityRole="link" onPress={() => open(item.url)} style={s.action}><Text style={s.link}>Look it up ↗</Text></Pressable>}</View>)}

      <Text style={s.footer}>A trip outline, not a booking. Flight searches and directions open externally with your starting point. Schedules, connections and dive access are confirmed there and locally.</Text>
      {sources.map(source => <Pressable key={source.url} onPress={() => open(source.url)} accessibilityRole="link" style={s.source}><Text style={s.sourceText}>{source.name} ↗</Text></Pressable>)}
    </ScrollView>
  </KeyboardAvoidingView>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#091d28' }, header: { padding: 22, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#25404b' }, eyebrow: { color: '#9be6ca', fontSize: 10, fontWeight: '700', letterSpacing: 1.8 }, heading: { color: '#edf7f5', fontSize: 30, fontWeight: '700', marginTop: 8 }, close: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#183440', alignItems: 'center', justifyContent: 'center' }, closeText: { color: '#d9e9eb', fontSize: 28 }, content: { padding: 22, paddingBottom: 40 }, destination: { color: '#edf7f5', fontSize: 24, fontWeight: '600' },
  crumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8, marginBottom: 6 }, crumb: { color: '#a8bfc8', fontSize: 14 },
  originBox: { backgroundColor: '#102b37', borderWidth: 1, borderColor: '#294754', borderRadius: 18, padding: 16, marginTop: 18, marginBottom: 22 }, input: { color: '#edf7f5', fontSize: 17, minHeight: 48, paddingVertical: 12 }, location: { minHeight: 44, justifyContent: 'center', alignItems: 'flex-start' }, link: { color: '#9be6ca', fontSize: 14, fontWeight: '600' }, note: { color: '#a8bfc8', fontSize: 12, lineHeight: 19 }, tabs: { flexDirection: 'row', backgroundColor: '#061722', borderRadius: 12, padding: 4, marginBottom: 16 }, tab: { flex: 1, padding: 12, borderRadius: 9, alignItems: 'center' }, activeTab: { backgroundColor: '#284650' }, tabText: { color: '#91acb8', fontSize: 13, fontWeight: '600' }, activeText: { color: '#eef9f5' }, option: { flexDirection: 'row', alignItems: 'center', padding: 16, borderWidth: 1, borderColor: '#28404c', borderRadius: 15, marginBottom: 10 }, selectedOption: { borderColor: '#9be6ca', backgroundColor: '#153b40' }, optionCopy: { flex: 1 }, optionTitle: { color: '#edf7f5', fontSize: 15, fontWeight: '600', marginBottom: 4 }, code: { color: '#9be6ca', fontSize: 13, fontWeight: '700', marginLeft: 12 },
  sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 22, marginBottom: 18 }, leg: { flexDirection: 'row' }, rail: { width: 36, alignItems: 'center', marginRight: 12 }, number: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#9be6ca', alignItems: 'center', justifyContent: 'center' }, numberText: { color: '#153534', fontWeight: '700', fontSize: 12 }, line: { width: 1, flex: 1, backgroundColor: '#36535a', marginVertical: 7, minHeight: 25 }, legContent: { flex: 1, paddingBottom: 26 }, legButton: { flexDirection: 'row', alignItems: 'center', minHeight: 44 }, mode: { color: '#8eaebc', fontSize: 9, fontWeight: '700', letterSpacing: 1.7, marginBottom: 5 }, legTitle: { color: '#edf7f5', fontSize: 16, lineHeight: 22, fontWeight: '600' }, chevron: { color: '#9be6ca', marginLeft: 12, fontSize: 23 }, detail: { color: '#b4c9d2', fontSize: 14, lineHeight: 22, marginTop: 12 }, action: { minHeight: 44, justifyContent: 'center', marginTop: 6 },
  card: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#102b37', borderWidth: 1, borderColor: '#294754', borderRadius: 15, marginBottom: 10 }, searchCard: { backgroundColor: 'transparent', borderStyle: 'dashed' }, cardTown: { color: '#9be6ca', fontSize: 12, marginBottom: 4 }, caveat: { color: '#8ca8b6', fontSize: 12, lineHeight: 18, marginTop: 4 },
  consider: { paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#1f3843' }, considerTitle: { color: '#edf7f5', fontSize: 15, fontWeight: '600' }, detailTight: { color: '#b4c9d2', fontSize: 14, lineHeight: 21, marginTop: 6 },
  footer: { color: '#8ca8b6', fontSize: 12, lineHeight: 19, paddingTop: 12, marginTop: 18, borderTopWidth: 1, borderTopColor: '#29414b' }, source: { minHeight: 44, justifyContent: 'center' }, sourceText: { color: '#9ebcc8', fontSize: 12 },
});
