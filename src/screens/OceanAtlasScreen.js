import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { atlasBootstrapScripts, buildAtlasDocument } from '../features/oceanAtlas/document';
import { useAtlasSnapshot, useAtlasStatus } from '../features/oceanAtlas/useAtlasUpdates';
import { atlasStatusLabel } from '../features/oceanAtlas/updates';
import { groupDivePins, safeJson, validCoordinate } from '../features/oceanAtlas/model';
import { loadAll } from '../lib/diveLog/storage';
import { loadMySites, removeMySite } from '../features/mySites/storage';
import DiveLogScreen from './DiveLogScreen';
import JourneySheet from '../features/oceanAtlas/JourneySheet';
import GearAdviceSheet, { ADVICE_PREFERENCES_KEY } from '../features/gearChecklist/GearAdviceSheet';
import { normalizeAdvicePreferences } from '../features/gearChecklist/diveAdvice';
import { GEAR_STORAGE_KEY } from '../features/gearChecklist/storage';
import { normalizeGearState } from '../features/gearChecklist/model';
import { ATLAS_DIVE_MODE_KEY, atlasDiveUse, buildAtlasGearSuggestion, normalizeAtlasDiveMode } from '../features/oceanAtlas/atlasGear';
import { placeAt, placeById, placeGuide, quickLook, regionGuide } from '../features/oceanAtlas/places';
import { seasonGuide } from '../features/oceanAtlas/seasons';
import { discoverSpecies, speciesGuide, speciesIndex } from '../features/oceanAtlas/species';
import { catalogSite } from '../features/oceanAtlas/catalog';
import { inlandProfile, isInland } from '../features/oceanAtlas/inland';
import { unitSystem } from '../features/oceanAtlas/units';
import { onAtlasDataChange } from '../features/oceanAtlas/datasets';
import { buildSiteGuide } from '../features/oceanAtlas/siteGuide';
import { diverProfile } from '../features/oceanAtlas/diverProfile';
import { fetchSiteWeather } from '../features/oceanAtlas/weather';
import { colors } from '../theme';

const PREFERENCES_KEY = '@dmz-scuba/ocean-atlas/preferences-v1';
// Last known starting point for personal travel ratings; kept on this device only.
const ORIGIN_KEY = '@dmz-scuba/ocean-atlas/origin-v1';

export default function OceanAtlasScreen({ appSettings = {}, account = null, signedIn = false, focus = null, onBack, onOpenSettings }) {
  const insets = useSafeAreaInsets();
  const web = useRef(null);
  const mounted = useRef(true);
  const ready = useRef(false);
  const locating = useRef(false);
  const logRequest = useRef(0);
  const weatherByKey = useRef(new Map());
  const allowedDiveIds = useRef(new Set());
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const generation = useAtlasSnapshot();
  const dataStatus = useAtlasStatus();
  const bootstrap = useRef(null);
  const [logbook, setLogbook] = useState(null);
  const [journey, setJourney] = useState(null);
  const [gearAdvice, setGearAdvice] = useState(null);
  // Opened from a Home in-season card: fly to that region with its animal first.
  const focusRef = useRef(focus);
  // Personal preferences and the selected dive mode shape the inline packing match. The map receives
  // only the recommended setup result, never the full Gear Locker inventory.
  const advicePrefs = useRef(normalizeAdvicePreferences({}));
  const gearState = useRef(normalizeGearState(null));
  const gearMode = useRef('recreational');
  const loadGearPlanner = useCallback(() => Promise.all([
    AsyncStorage.getItem(ADVICE_PREFERENCES_KEY), AsyncStorage.getItem(GEAR_STORAGE_KEY), AsyncStorage.getItem(ATLAS_DIVE_MODE_KEY),
  ]).then(([saved, gear, mode]) => {
    advicePrefs.current = normalizeAdvicePreferences(saved ? JSON.parse(saved) : {});
    gearState.current = normalizeGearState(gear ? JSON.parse(gear) : null);
    gearMode.current = normalizeAtlasDiveMode(mode);
  })
    .catch(() => {}), []);
  useEffect(() => { loadGearPlanner(); }, [loadGearPlanner]);
  const origin = useRef(null);
  // Distances, depths and elevations follow the app's length setting (ft → imperial).
  const units = unitSystem(appSettings);
  const unitsRef = useRef(units);
  unitsRef.current = units;
  // The diver's trained depth and overhead training (from their certification cards) let a site card say
  // whether the dive fits them. Signed out, the card says how to get that.
  const diver = useRef(diverProfile(null));
  diver.current = useMemo(() => diverProfile(signedIn && Array.isArray(account?.certifications) ? account.certifications : null), [signedIn, account?.certifications]);
  const html = useMemo(() => buildAtlasDocument({ ...appSettings, deferredData: true }), [appSettings.temperatureUnit, appSettings.depthUnit]);
  const source = useMemo(() => ({ html, baseUrl: 'https://www.dmzscuba.com/' }), [html]);
  const send = useCallback(message => {
    if (mounted.current && ready.current) web.current?.injectJavaScript(`window.atlasReceive && window.atlasReceive(${safeJson(message)}); true;`);
  }, []);
  useEffect(() => onAtlasDataChange(() => {
    ready.current = false; bootstrap.current = null; setLoading(true); setError(false);
  }), []);
  useEffect(() => { send({ type: 'dataStatus', text: atlasStatusLabel(dataStatus) }); }, [dataStatus, send]);
  // Preferences may have changed in the sheet: reload them and let open cards ask again.
  const closeGearAdvice = useCallback(() => {
    setGearAdvice(null);
    loadGearPlanner().then(() => send({ type: 'adviceChanged' }));
  }, [loadGearPlanner, send]);

  // Sites the diver pinned (from the planner): shown on the atlas's My sites layer.
  const refreshMySites = useCallback(async () => {
    const sites = await loadMySites().catch(() => []);
    if (mounted.current) send({ type: 'mySites', sites });
  }, [send]);

  const refreshDives = useCallback(async () => {
    const request = ++logRequest.current;
    try {
      const dives = (await loadAll()).filter(d => !d.deletedAt);
      if (!mounted.current || request !== logRequest.current) return;
      const pins = groupDivePins(dives);
      allowedDiveIds.current = new Set(pins.flatMap(pin => pin.dives.map(d => d.id)));
      send({ type: 'logs', status: 'ready', pins,
        missingCount: dives.filter(d => !validCoordinate(d.site?.latitude, d.site?.longitude)).length });
    } catch {
      if (request === logRequest.current) send({ type: 'logs', status: 'error', pins: [] });
    }
  }, [send]);

  useEffect(() => {
    mounted.current = true;
    const listener = AppState.addEventListener('change', state => {
      if (state === 'active' && ready.current) {
        refreshDives(); refreshMySites();
        loadGearPlanner().then(() => { send({ type: 'gearMode', value: gearMode.current }); send({ type: 'adviceChanged' }); });
      }
    });
    return () => { mounted.current = false; listener.remove(); };
  }, [loadGearPlanner, refreshDives, refreshMySites, send]);

  useEffect(() => {
    if (!loading) return undefined;
    const timer = setTimeout(() => {
      if (!ready.current) { setLoading(false); setError(true); }
    }, 30000);
    return () => clearTimeout(timer);
  }, [loading, reload, generation]);

  // Travel ratings need a starting point: the traveller's location or the last "Get me here" start.
  const rememberOrigin = useCallback(point => {
    if (!point || !validCoordinate(point.latitude, point.longitude)) return;
    const moved = !origin.current || Math.abs(origin.current.latitude - point.latitude) + Math.abs(origin.current.longitude - point.longitude) > 0.2;
    origin.current = { latitude: point.latitude, longitude: point.longitude };
    AsyncStorage.setItem(ORIGIN_KEY, JSON.stringify(origin.current)).catch(() => {});
    if (moved) send({ type: 'originChanged' });
  }, [send]);

  const locate = useCallback(async () => {
    if (locating.current) return;
    locating.current = true;
    send({ type: 'notice', text: 'Finding your location…' });
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        send({ type: 'notice', text: 'Location access is off. You can still search and explore the entire map.' });
        return;
      }
      let timeout;
      const position = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('timeout')), 15000); }),
      ]).finally(() => clearTimeout(timeout));
      if (validCoordinate(position.coords.latitude, position.coords.longitude)) rememberOrigin({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      if (validCoordinate(position.coords.latitude, position.coords.longitude)) send({ type: 'location', latitude: position.coords.latitude, longitude: position.coords.longitude });
    } catch {
      send({ type: 'notice', text: 'Your location is unavailable right now. Try again, or use search to explore.' });
    } finally { locating.current = false; }
  }, [send]);

  const gearSuggestionFor = useCallback((request, guidePayload, mode = gearMode.current) => {
    const month = Number.isInteger(request.month) && request.month >= 0 && request.month < 12 ? request.month : new Date().getMonth();
    const site = typeof request.id === 'string' ? catalogSite(request.id.slice(0, 80)) : null;
    const point = site || { latitude: request.latitude, longitude: request.longitude, topologies: [] };
    return buildAtlasGearSuggestion(gearState.current, advicePrefs.current, {
      mode, site: point, inland: guidePayload?.guide?.inland || null, temperatureC: guidePayload?.wear?.[month]?.temperatureC ?? null,
    });
  }, []);

  const onMessage = useCallback(async event => {
    let message;
    try { message = JSON.parse(event.nativeEvent.data); } catch { return; }
    if (!message || typeof message !== 'object') return;
    if (message.type === 'bootstrap' && Number.isInteger(message.index) && message.index >= 0) {
      if (message.index === 0) bootstrap.current = atlasBootstrapScripts(appSettings);
      const script = bootstrap.current?.[message.index];
      if (script) web.current?.injectJavaScript(script);
    } else if (message.type === 'bootstrapError') {
      ready.current = false; setLoading(false); setError(true);
    } else if (message.type === 'ready') {
      bootstrap.current = null;
      ready.current = true; setLoading(false); setError(false);
      await loadGearPlanner();
      send({ type: 'gearMode', value: gearMode.current });
      send({ type: 'dataStatus', text: atlasStatusLabel(dataStatus) });
      const value = await AsyncStorage.getItem(PREFERENCES_KEY).then(raw => raw ? JSON.parse(raw) : null).catch(() => null);
      send({ type: 'preferences', value }); refreshDives();
      await refreshMySites();
      // Opened on a region (Home's in-season cards) or a site (a plan's "Open in Ocean Atlas").
      if (focusRef.current) send({ type: 'focus', ...focusRef.current });
      // Starting point for travel ratings: saved one, else a recent position if location is already allowed (never prompts).
      AsyncStorage.getItem(ORIGIN_KEY).then(raw => raw ? JSON.parse(raw) : null).catch(() => null).then(async saved => {
        if (saved) { rememberOrigin(saved); return; }
        const permission = await Location.getForegroundPermissionsAsync().catch(() => null);
        if (permission?.granted) {
          const last = await Location.getLastKnownPositionAsync({ maxAge: 7 * 24 * 3600 * 1000 }).catch(() => null);
          if (last) rememberOrigin(last.coords);
        }
      });
      // Warm the place index (site membership) so the first land tap answers instantly.
      setTimeout(() => { try { placeGuide(placeById('country', 'US')); } catch { /* optional warm-up */ } }, 1200);
    } else if (message.type === 'back') onBack();
    else if (message.type === 'openDive' && allowedDiveIds.current.has(message.id)) setLogbook({ id: message.id });
    else if (message.type === 'openLogbook') setLogbook({ id: null });
    else if (message.type === 'retryLogs') refreshDives();
    else if (message.type === 'locate') locate();
    else if (message.type === 'journey' && typeof message.destination?.name === 'string'
      && validCoordinate(message.destination.latitude, message.destination.longitude)) {
      const d = message.destination;
      setJourney({ latitude: d.latitude, longitude: d.longitude, ...Object.fromEntries(['id', 'name', 'region', 'country', 'entry'].map(key => [key, typeof d[key] === 'string' ? d[key].slice(0, 200) : ''])) });
    }
    // Destination guides: what was tapped (island › US state › country), or a place opened by id.
    else if (message.type === 'gearMode' && validCoordinate(message.latitude, message.longitude)) {
      const mode = normalizeAtlasDiveMode(message.value);
      gearMode.current = mode;
      AsyncStorage.setItem(ATLAS_DIVE_MODE_KEY, mode).catch(() => {});
      const key = String(message.key || '').slice(0, 120);
      try {
        const guidePayload = buildSiteGuide(message, { origin: origin.current, units: unitsRef.current, advicePrefs: advicePrefs.current, diver: diver.current });
        send({ type: 'siteGear', key, gear: gearSuggestionFor(message, guidePayload, mode) });
      } catch { send({ type: 'siteGear', key, gear: { mode, setup: null } }); }
    }
    else if (message.type === 'gearAdvice' && validCoordinate(message.latitude, message.longitude)) {
      const month = Number.isInteger(message.month) && message.month >= 0 && message.month < 12 ? message.month : new Date().getMonth();
      const site = typeof message.id === 'string' ? catalogSite(message.id.slice(0, 80)) : null;
      const point = site || { latitude: message.latitude, longitude: message.longitude, topologies: [] };
      const inland = isInland(point) ? inlandProfile(point) : null;
      const temperatureC = inland ? inland.surface?.[month] ?? null : seasonGuide(point).temps?.[month] ?? null;
      const weather = weatherByKey.current.get(String(message.key || '').slice(0, 120)) || null;
      const mode = normalizeAtlasDiveMode(message.mode || gearMode.current);
      setGearAdvice({ site: point, inland, temperatureC, month, broad: !site, name: site?.name || String(message.name || 'This location').slice(0, 200), weather, marine: !inland && site?.environment !== 'fresh', use: atlasDiveUse(mode) });
    }
    else if (message.type === 'placeAt' && validCoordinate(message.latitude, message.longitude)) {
      let place = null;
      try { const hit = placeAt(message.latitude, message.longitude); place = hit ? placeGuide(hit, unitsRef.current) : null; } catch { place = null; }
      send({ type: 'place', requestId: message.requestId, place });
    } else if (message.type === 'openPlace' && ['island', 'state', 'country'].includes(message.kind) && typeof message.id === 'string') {
      try { const hit = placeById(message.kind, message.id.slice(0, 40)); if (hit) send({ type: 'place', requestId: null, place: placeGuide(hit, unitsRef.current), fly: true }); } catch { /* guide unavailable */ }
    } else if (message.type === 'quickLook' && validCoordinate(message.latitude, message.longitude)) {
      let look = null;
      try { look = quickLook(message.latitude, message.longitude); } catch { look = null; }
      send({ type: 'quickLook', requestId: message.requestId, look });
    } else if (message.type === 'speciesIndex') {
      // Species search: the whole index once, then guides on demand (the sightings stay native).
      let species = [];
      try { species = speciesIndex(); } catch (error) { console.warn('[Ocean Atlas] Species index failed:', error?.message); }
      send({ type: 'speciesIndex', species });
    } else if (message.type === 'speciesGuide' && typeof message.key === 'string') {
      const key = message.key.slice(0, 120);
      let guide = null;
      try { guide = speciesGuide(key); } catch (error) { console.warn('[Ocean Atlas] Species guide failed:', error?.message); }
      send({ type: 'speciesGuide', key, guide });
    } else if (message.type === 'discover' && Number.isInteger(message.month) && message.month >= 0 && message.month < 12) {
      let discover = null;
      try { discover = discoverSpecies(message.month); } catch (error) { console.warn('[Ocean Atlas] Discover picks failed:', error?.message); }
      send({ type: 'discover', month: message.month, discover });
    } else if (message.type === 'regionGuide' && ['province', 'diveRegion'].includes(message.kind) && typeof message.id === 'string') {
      let guide = null;
      try { guide = regionGuide(message.kind, message.id.slice(0, 60)); } catch { guide = null; }
      send({ type: 'regionGuide', key: `${message.kind}:${message.id.slice(0, 60)}`, guide });
    } else if (message.type === 'siteGuide' && validCoordinate(message.latitude, message.longitude)) {
      const key = String(message.key || '').slice(0, 120);
      let guidePayload = null;
      try {
        guidePayload = buildSiteGuide(message, { origin: origin.current, units: unitsRef.current, advicePrefs: advicePrefs.current, diver: diver.current });
        send({ type: 'siteGuide', ...guidePayload, gear: gearSuggestionFor(message, guidePayload) });
      } catch { send({ type: 'siteGuide', key, guide: null, places: [] }); }
      send({ type: 'siteWeather', key, status: 'loading' });
      const marine = !guidePayload?.guide?.inland && guidePayload?.profile?.water !== 'fresh';
      fetchSiteWeather(message.latitude, message.longitude, { marine })
        .then(weather => { weatherByKey.current.set(key, weather); send({ type: 'siteWeather', key, status: 'ready', weather }); })
        .catch(() => send({ type: 'siteWeather', key, status: 'error' }));
    }
    else if (message.type === 'deleteMySite' && typeof message.id === 'string') {
      const id = message.id.slice(0, 90);
      Alert.alert('Remove from My sites?', String(message.name || 'This pin').slice(0, 120), [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => removeMySite(id).then(refreshMySites).catch(() => send({ type: 'notice', text: 'The site could not be removed.' })) },
      ]);
    }
    else if (message.type === 'preferences' && message.value && typeof message.value === 'object') {
      AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify(message.value)).catch(() => {});
    } else if (message.type === 'external' && typeof message.url === 'string' && /^https:\/\//i.test(message.url)) {
      Linking.openURL(message.url).catch(() => send({ type: 'notice', text: 'This source could not be opened.' }));
    }
  }, [gearSuggestionFor, loadGearPlanner, locate, onBack, refreshDives, refreshMySites, send, appSettings, dataStatus]);

  const dismissLogbook = () => { setLogbook(null); refreshDives(); };
  const retry = () => { ready.current = false; bootstrap.current = null; setLoading(true); setError(false); setReload(n => n + 1); };

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <WebView
        key={`${reload}:${generation}:${appSettings.temperatureUnit}:${appSettings.depthUnit}`}
        ref={web}
        source={source}
        style={styles.web}
        originWhitelist={['*']}
        applicationNameForUserAgent="DMZScuba/1.0 (+https://www.dmzscuba.com)"
        javaScriptEnabled
        domStorageEnabled={false}
        allowFileAccess={false}
        mixedContentMode="never"
        setSupportMultipleWindows={false}
        scrollEnabled={false}
        bounces={false}
        onMessage={onMessage}
        onShouldStartLoadWithRequest={request => request.url === 'about:blank' || request.url === 'https://www.dmzscuba.com/'}
        onError={() => { ready.current = false; setLoading(false); setError(true); }}
        onContentProcessDidTerminate={retry}
      />
      {loading || error ? (
        <View style={styles.loading}>
          {error ? <><Text style={styles.title}>The atlas couldn’t open.</Text><Pressable accessibilityRole="button" onPress={retry} style={styles.button}><Text style={styles.buttonText}>Try again</Text></Pressable></> : <><ActivityIndicator color={colors.cyan} /><Text style={styles.title}>Opening the ocean…</Text></>}
          <Pressable accessibilityRole="button" onPress={onBack} style={styles.button}><Text style={styles.buttonText}>Back</Text></Pressable>
        </View>
      ) : null}
      <Modal visible={Boolean(logbook)} animationType="slide" onRequestClose={dismissLogbook}>
        {logbook ? <DiveLogScreen key={logbook.id || 'list'} initialDiveId={logbook.id} appSettings={appSettings} onBack={dismissLogbook} onOpenSettings={() => { setLogbook(null); onOpenSettings?.(); }} /> : null}
      </Modal>
      <Modal visible={Boolean(journey)} animationType="slide" onRequestClose={() => setJourney(null)}>
        {journey ? <JourneySheet site={journey} units={units} onOrigin={rememberOrigin} onClose={() => setJourney(null)} /> : null}
      </Modal>
      <Modal visible={Boolean(gearAdvice)} animationType="slide" onRequestClose={closeGearAdvice}>
        {gearAdvice ? <GearAdviceSheet context={gearAdvice} appSettings={appSettings} onClose={closeGearAdvice} /> : null}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#07151f' },
  web: { flex: 1, backgroundColor: '#07151f' },
  loading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: '#07151f', gap: 18 },
  title: { color: colors.text, fontSize: 17, fontWeight: '600' },
  button: { minHeight: 44, paddingHorizontal: 24, justifyContent: 'center' },
  buttonText: { color: colors.cyan, fontSize: 15 },
});
