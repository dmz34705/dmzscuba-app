import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { buildAtlasDocument } from '../features/oceanAtlas/document';
import { groupDivePins, safeJson, validCoordinate } from '../features/oceanAtlas/model';
import { loadAll } from '../lib/diveLog/storage';
import DiveLogScreen from './DiveLogScreen';
import JourneySheet from '../features/oceanAtlas/JourneySheet';
import GearAdviceSheet from '../features/gearChecklist/GearAdviceSheet';
import { placeAt, placeById, placeGuide, placesForSite, quickLook, regionGuide } from '../features/oceanAtlas/places';
import { seasonGuide } from '../features/oceanAtlas/seasons';
import { siteRatings } from '../features/oceanAtlas/ratings';
import { catalogSite } from '../features/oceanAtlas/catalog';
import { freshwaterLife, inlandProfile, isInland } from '../features/oceanAtlas/inland';
import { unitSystem } from '../features/oceanAtlas/units';
import SITE_IMAGES from '../features/oceanAtlas/data/siteImages.json';
import { colors } from '../theme';

const PREFERENCES_KEY = '@dmz-scuba/ocean-atlas/preferences-v1';
// Last known starting point for personal travel ratings; kept on this device only.
const ORIGIN_KEY = '@dmz-scuba/ocean-atlas/origin-v1';

export default function OceanAtlasScreen({ appSettings = {}, onBack, onOpenSettings }) {
  const insets = useSafeAreaInsets();
  const web = useRef(null);
  const mounted = useRef(true);
  const ready = useRef(false);
  const locating = useRef(false);
  const logRequest = useRef(0);
  const allowedDiveIds = useRef(new Set());
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [logbook, setLogbook] = useState(null);
  const [journey, setJourney] = useState(null);
  const [gearAdvice, setGearAdvice] = useState(null);
  const origin = useRef(null);
  // Distances, depths and elevations follow the app's length setting (ft → imperial).
  const units = unitSystem(appSettings);
  const unitsRef = useRef(units);
  unitsRef.current = units;
  const html = useMemo(() => buildAtlasDocument(appSettings), [appSettings.temperatureUnit, appSettings.depthUnit]);
  const source = useMemo(() => ({ html, baseUrl: 'https://www.dmzscuba.com/' }), [html]);
  const send = useCallback(message => {
    if (mounted.current && ready.current) web.current?.injectJavaScript(`window.atlasReceive && window.atlasReceive(${safeJson(message)}); true;`);
  }, []);

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
    const listener = AppState.addEventListener('change', state => { if (state === 'active' && ready.current) refreshDives(); });
    return () => { mounted.current = false; listener.remove(); };
  }, [refreshDives]);

  useEffect(() => {
    if (!loading) return undefined;
    const timer = setTimeout(() => {
      if (!ready.current) { setLoading(false); setError(true); }
    }, 15000);
    return () => clearTimeout(timer);
  }, [loading, reload]);

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

  const onMessage = useCallback(async event => {
    let message;
    try { message = JSON.parse(event.nativeEvent.data); } catch { return; }
    if (!message || typeof message !== 'object') return;
    if (message.type === 'ready') {
      ready.current = true; setLoading(false); setError(false);
      const value = await AsyncStorage.getItem(PREFERENCES_KEY).then(raw => raw ? JSON.parse(raw) : null).catch(() => null);
      send({ type: 'preferences', value }); refreshDives();
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
    else if (message.type === 'gearAdvice' && validCoordinate(message.latitude, message.longitude)) {
      const month = Number.isInteger(message.month) && message.month >= 0 && message.month < 12 ? message.month : new Date().getMonth();
      const site = typeof message.id === 'string' ? catalogSite(message.id.slice(0, 80)) : null;
      const point = site || { latitude: message.latitude, longitude: message.longitude, topologies: [] };
      const inland = isInland(point) ? inlandProfile(point) : null;
      const temperatureC = inland ? inland.surface?.[month] ?? null : seasonGuide(point).temps?.[month] ?? null;
      setGearAdvice({ site: point, inland, temperatureC, month, broad: !site, name: site?.name || String(message.name || 'This location').slice(0, 200) });
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
    } else if (message.type === 'regionGuide' && ['province', 'diveRegion'].includes(message.kind) && typeof message.id === 'string') {
      let guide = null;
      try { guide = regionGuide(message.kind, message.id.slice(0, 60)); } catch { guide = null; }
      send({ type: 'regionGuide', key: `${message.kind}:${message.id.slice(0, 60)}`, guide });
    } else if (message.type === 'siteGuide' && validCoordinate(message.latitude, message.longitude)) {
      try {
        const record = typeof message.id === 'string' ? catalogSite(message.id.slice(0, 80)) : null;
        const site = record || { latitude: message.latitude, longitude: message.longitude, topologies: [] };
        const guide = seasonGuide(site);
        // Inland sites get their own guide: freshwater conditions and life instead of ocean data.
        const inland = isInland(site);
        const profile = inland ? inlandProfile(site) : null;
        const life = inland ? freshwaterLife(site) : null;
        if (inland) Object.assign(guide, { temps: null, highlights: [], animals: life, hasObservations: life.length > 0 });
        send({ type: 'siteGuide', key: String(message.key || '').slice(0, 120), guide: { temps: guide.temps, highlights: guide.highlights, animals: guide.animals, hasObservations: guide.hasObservations, inland: profile },
          ratings: { ...siteRatings(site, guide, { originPoint: origin.current, inland: profile, life, units: unitsRef.current }), inland },
          // Openly licensed photo of the wreck or inland site itself, when one exists.
          photo: record && SITE_IMAGES.images[record.id] ? (([url, attribution, license, page]) => ({ url, attribution, license, page }))(SITE_IMAGES.images[record.id]) : null,
          places: typeof message.id === 'string' ? placesForSite(message.id.slice(0, 80)) : [] });
      } catch { send({ type: 'siteGuide', key: String(message.key || '').slice(0, 120), guide: null, places: [] }); }
    }
    else if (message.type === 'preferences' && message.value && typeof message.value === 'object') {
      AsyncStorage.setItem(PREFERENCES_KEY, JSON.stringify(message.value)).catch(() => {});
    } else if (message.type === 'external' && typeof message.url === 'string' && /^https:\/\//i.test(message.url)) {
      Linking.openURL(message.url).catch(() => send({ type: 'notice', text: 'This source could not be opened.' }));
    }
  }, [locate, onBack, refreshDives, send]);

  const dismissLogbook = () => { setLogbook(null); refreshDives(); };
  const retry = () => { ready.current = false; setLoading(true); setError(false); setReload(n => n + 1); };

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <WebView
        key={reload}
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
      <Modal visible={Boolean(gearAdvice)} animationType="slide" onRequestClose={() => setGearAdvice(null)}>
        {gearAdvice ? <GearAdviceSheet context={gearAdvice} appSettings={appSettings} onClose={() => setGearAdvice(null)} /> : null}
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
