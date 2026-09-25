import { useEffect, useMemo, useState } from 'react';
import { Image, ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import FeatureIcon from '../features/catalog/FeatureIcon';
import { getFeature, getFeaturesByArea } from '../features/catalog/featureCatalog';
import { gearSummary, serviceEntriesForItem, serviceStatusForItem } from '../features/gearChecklist/model';
import { loadGearState } from '../features/gearChecklist/storage';
import { inSeasonNow } from '../features/oceanAtlas/seasons';
import { getLibdivecomputerVersion } from '../../modules/dive-computer-bridge';
import { loadIndex } from '../lib/diveLog/storage';
import { computeDiveLogStats } from '../lib/diveLog/stats';
import { colors, radii, spacing } from '../theme';

const logo = require('../../assets/brand/dmz-scuba-logo.webp');
const hero = require('../../assets/brand/education-hero.webp');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// --- small glyphs -----------------------------------------------------------
const Glyph = ({ d, color = colors.text, size = 18, width = 2 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"><Path d={d} stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" /></Svg>
);
const PLUS = 'M12 5v14M5 12h14';
const DOWNLOAD = 'M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 20h14';
const CHEVRON = 'M9 6l6 6-6 6';
const WRENCH = 'M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-2.5 2.5-2.5Z';

function Avatar({ initials, onPress }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Account and settings" hitSlop={8} onPress={onPress} style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}>
      {initials ? <Text style={styles.avatarText}>{initials}</Text> : (
        <Svg width={20} height={20} viewBox="0 0 24 24" fill="none"><Circle cx={12} cy={8.5} r={3.8} stroke={colors.text} strokeWidth={1.8} /><Path d="M4.8 20a7.2 7.2 0 0 1 14.4 0" stroke={colors.text} strokeWidth={1.8} strokeLinecap="round" /></Svg>
      )}
    </Pressable>
  );
}

function SectionHeader({ title, action, onAction }) {
  return (
    <View style={styles.sectionHeader}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text>
      {action ? (
        <Pressable accessibilityRole="button" accessibilityLabel={action} hitSlop={10} onPress={onAction} style={({ pressed }) => [styles.sectionAction, pressed && styles.pressed]}>
          <Text style={styles.sectionActionText}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// --- data -------------------------------------------------------------------
function greeting(date = new Date()) {
  const hour = date.getHours();
  return hour < 5 ? 'Good evening' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

function daysAgo(iso) {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '';
  const days = Math.floor((Date.now() - time) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  if (days < 730) return `${Math.round(days / 30)} months ago`;
  return `${Math.round(days / 365)} years ago`;
}

// Loaded every time Home is shown, so returning from the logbook or gear locker updates it.
function useHomeData() {
  const [data, setData] = useState({ loaded: false, stats: null, lastDive: null, gear: null });
  useEffect(() => {
    let alive = true;
    (async () => {
      const [rows, gearState] = await Promise.all([loadIndex().catch(() => []), loadGearState().catch(() => null)]);
      const live = (Array.isArray(rows) ? rows : []).filter((row) => row && !row.deletedAt);
      const lastDive = live.reduce((latest, row) => (!latest || Date.parse(row.startTime) > Date.parse(latest.startTime) ? row : latest), null);
      let gear = null;
      if (gearState?.items?.length) {
        const summary = gearSummary(gearState);
        const urgent = gearState.items.flatMap((item) => serviceEntriesForItem(item).map((entry) => ({ name: entry.name || item.name, status: serviceStatusForItem(entry.record) })))
          .filter(({ status }) => ['blocked', 'overdue', 'attention', 'due-soon'].includes(status.key))
          .sort((a, b) => ['blocked', 'overdue', 'attention', 'due-soon'].indexOf(a.status.key) - ['blocked', 'overdue', 'attention', 'due-soon'].indexOf(b.status.key));
        gear = { ...summary, first: urgent[0] || null };
      }
      if (alive) setData({ loaded: true, stats: computeDiveLogStats(live), lastDive, gear });
    })();
    return () => { alive = false; };
  }, []);
  return data;
}

// --- sections ---------------------------------------------------------------
function DiveSummary({ stats, lastDive, loaded, depthUnit, canDownload, onLog, onDownload, onOpenLogbook }) {
  const hasDives = stats?.totalDives > 0;
  const hours = hasDives ? stats.totalBottomTimeSeconds / 3600 : 0;
  const deepest = hasDives ? Math.round(depthUnit === 'm' ? stats.deepestMeters : stats.deepestMeters * 3.28084) : 0;
  return (
    <View style={styles.summary}>
      {hasDives ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Open logbook" onPress={onOpenLogbook} style={({ pressed }) => pressed && styles.pressed}>
          <View style={styles.statsRow}>
            <View style={styles.stat}><Text style={styles.statValue}>{stats.totalDives.toLocaleString()}</Text><Text style={styles.statLabel}>{stats.totalDives === 1 ? 'Dive' : 'Dives'}</Text></View>
            <View style={styles.statDivider} />
            <View style={styles.stat}><Text style={styles.statValue}>{hours < 10 ? hours.toFixed(1) : Math.round(hours).toLocaleString()}</Text><Text style={styles.statLabel}>Hours underwater</Text></View>
            <View style={styles.statDivider} />
            <View style={styles.stat}><Text style={styles.statValue}>{deepest.toLocaleString()}<Text style={styles.statUnit}> {depthUnit === 'm' ? 'm' : 'ft'}</Text></Text><Text style={styles.statLabel}>Deepest</Text></View>
          </View>
          {lastDive ? (
            <View style={styles.lastDive}>
              <View style={styles.lastDot} />
              <Text numberOfLines={1} style={styles.lastDiveText}>
                <Text style={styles.lastDiveLabel}>Last dive </Text>{lastDive.siteName || 'Unnamed site'} · {daysAgo(lastDive.startTime)}
              </Text>
              <Glyph d={CHEVRON} color={colors.faint} size={16} />
            </View>
          ) : null}
        </Pressable>
      ) : (
        <View style={styles.emptyLog}>
          <Text style={styles.emptyTitle}>{loaded ? 'Start your logbook' : ' '}</Text>
          <Text style={styles.emptyBody}>{loaded ? 'Pull dives straight off your dive computer, or log one by hand.' : ' '}</Text>
        </View>
      )}
      <View style={styles.summaryActions}>
        {/* Downloading from a dive computer is the main way dives arrive; manual entry is the fallback. */}
        {canDownload ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Download dives from a dive computer" onPress={onDownload} style={({ pressed }) => [styles.actionPrimaryWrap, pressed && styles.pressed]}>
            <LinearGradient colors={[colors.accent, colors.accentDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.actionPrimary}>
              <Glyph d={DOWNLOAD} color={colors.white} size={17} width={2.4} />
              <Text style={styles.actionPrimaryText}>Download dives</Text>
            </LinearGradient>
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Log a dive manually" onPress={onLog} style={({ pressed }) => [canDownload ? styles.actionSecondary : styles.actionPrimaryWrap, pressed && styles.pressed]}>
          {canDownload ? (
            <><Glyph d={PLUS} color={colors.cyan} size={17} /><Text style={styles.actionSecondaryText}>Log manually</Text></>
          ) : (
            <LinearGradient colors={[colors.accent, colors.accentDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.actionPrimary}>
              <Glyph d={PLUS} color={colors.white} size={17} width={2.4} />
              <Text style={styles.actionPrimaryText}>Log a dive</Text>
            </LinearGradient>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function QuickTile({ feature, detail, badge, onPress }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${feature.title}. ${detail}`} onPress={onPress} style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
      <View style={styles.tileTop}>
        <View style={styles.tileIcon}><FeatureIcon name={feature.icon} /></View>
        {badge ? <View style={styles.tileBadge}><Text style={styles.tileBadgeText}>{badge}</Text></View> : null}
      </View>
      <Text numberOfLines={1} style={styles.tileTitle}>{feature.title}</Text>
      <Text numberOfLines={2} style={styles.tileBody}>{detail}</Text>
    </Pressable>
  );
}

function GearNotice({ gear, onPress }) {
  if (!gear?.first) return null;
  const { name, status } = gear.first;
  const more = gear.alerts - 1;
  const tone = ['blocked', 'overdue'].includes(status.key) ? colors.danger : colors.warning;
  const what = status.key === 'blocked' ? 'Out of service' : status.key === 'attention' ? 'Needs attention'
    : status.key === 'overdue' ? `${status.due?.label || 'Service'} overdue` : `${status.due?.label || 'Service'} due in ${status.days} ${status.days === 1 ? 'day' : 'days'}`;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${name}: ${what}. Open gear locker`} onPress={onPress} style={({ pressed }) => [styles.notice, { borderColor: `${tone}55`, backgroundColor: `${tone}10` }, pressed && styles.pressed]}>
      <View style={[styles.noticeIcon, { backgroundColor: `${tone}1F` }]}><Glyph d={WRENCH} color={tone} size={18} /></View>
      <View style={styles.noticeCopy}>
        <Text numberOfLines={1} style={styles.noticeTitle}>{name}</Text>
        <Text numberOfLines={1} style={styles.noticeBody}><Text style={{ color: tone }}>{what}</Text>{more > 0 ? ` · +${more} more ${more === 1 ? 'item' : 'items'}` : ''}</Text>
      </View>
      <Glyph d={CHEVRON} color={colors.faint} size={16} />
    </Pressable>
  );
}

function SeasonCard({ pick, onPress }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${pick.name}, ${pick.places.join(' and ')}, ${pick.window}. Open Ocean Atlas`} onPress={onPress} style={({ pressed }) => [styles.seasonCard, pressed && styles.pressed]}>
      {pick.photo?.url ? <Image source={{ uri: pick.photo.url }} style={styles.seasonPhoto} resizeMode="cover" accessibilityIgnoresInvertColors />
        : <LinearGradient colors={['#123A55', '#0B1C2E']} style={styles.seasonPhoto} />}
      <LinearGradient colors={['rgba(5,11,20,0)', 'rgba(5,11,20,0.92)']} locations={[0.35, 1]} style={StyleSheet.absoluteFill} />
      <View style={styles.seasonWindow}><Text style={styles.seasonWindowText}>{pick.window}</Text></View>
      <View style={styles.seasonCopy}>
        <Text numberOfLines={1} style={styles.seasonName}>{pick.name}</Text>
        <Text numberOfLines={1} style={styles.seasonPlace}>{pick.places.join(' · ')}</Text>
        {pick.photo?.attribution ? <Text numberOfLines={1} style={styles.seasonCredit}>📷 {pick.photo.attribution}</Text> : null}
      </View>
    </Pressable>
  );
}

function LessonCard({ feature, onPress }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${feature.title}. ${feature.shortSummary}`} onPress={onPress} style={({ pressed }) => [styles.lesson, pressed && styles.pressed]}>
      <LinearGradient colors={['rgba(22,133,193,0.22)', 'rgba(11,28,46,0.2)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={styles.lessonIcon}><FeatureIcon name={feature.icon} /></View>
      <Text style={styles.lessonKind}>{feature.badge === 'NATIVE SIMULATOR' ? 'Simulator' : 'Interactive lab'}</Text>
      <Text numberOfLines={2} style={styles.lessonTitle}>{feature.title}</Text>
      <Text numberOfLines={2} style={styles.lessonBody}>{feature.shortSummary}</Text>
    </Pressable>
  );
}

// --- screen -----------------------------------------------------------------
export default function HomeScreen({ appSettings = {}, profile = {}, signedIn = false, onOpenTool, onSelectTab }) {
  const insets = useSafeAreaInsets();
  const { loaded, stats, lastDive, gear } = useHomeData();
  const month = new Date().getMonth();
  const inSeason = useMemo(() => { try { return inSeasonNow(month, 8); } catch { return []; } }, [month]);
  // Lessons that are actually open (the gear lab is waiting on artwork).
  const lessons = getFeaturesByArea('learn').filter((feature) => feature.id !== 'gear-setup');
  const name = (profile.preferredName || profile.firstName || '').trim();
  const initials = signedIn ? [profile.firstName, profile.lastName].map((part) => (part || '').trim()[0] || '').join('').toUpperCase() : '';
  const tile = (id) => getFeature(id);
  const canDownload = useMemo(() => { try { return Boolean(getLibdivecomputerVersion()); } catch { return false; } }, []);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ImageBackground source={hero} resizeMode="cover" style={[styles.hero, { paddingTop: insets.top + 6 }]} imageStyle={styles.heroImage}>
          <LinearGradient colors={['rgba(5,11,20,0.55)', 'rgba(5,11,20,0.15)', 'rgba(5,11,20,0.7)', colors.background]} locations={[0, 0.3, 0.72, 1]} style={StyleSheet.absoluteFill} />
          <View style={styles.topBar}>
            <View style={styles.brand}>
              <Image source={logo} style={styles.logo} resizeMode="contain" accessibilityLabel="DMZ Scuba logo" />
              <Text style={styles.brandName}>DMZ Scuba</Text>
            </View>
            <Avatar initials={initials} onPress={() => onSelectTab('more')} />
          </View>
          <View style={styles.greetingBlock}>
            <Text style={styles.greeting}>{greeting()}{name ? ',' : ''}</Text>
            <Text numberOfLines={1} style={styles.name}>{name || 'Ready to dive?'}</Text>
            <Text numberOfLines={1} style={styles.subline}>{stats?.totalDives ? 'Your dives, gear and ocean in one place.' : 'Learn, plan and log — all in one place.'}</Text>
          </View>
        </ImageBackground>

        <View style={styles.body}>
          <DiveSummary
            canDownload={canDownload}
            depthUnit={appSettings.depthUnit}
            lastDive={lastDive}
            loaded={loaded}
            onDownload={() => onOpenTool('dive-log:download')}
            onLog={() => onOpenTool('dive-log:new')}
            onOpenLogbook={() => onOpenTool('dive-log')}
            stats={stats}
          />

          <GearNotice gear={gear} onPress={() => onOpenTool('gear-checklist')} />

          <SectionHeader title="Quick access" />
          <View style={styles.grid}>
            <QuickTile feature={tile('ocean-atlas')} detail="Dive sites, seasons & your dives on a map" onPress={() => onOpenTool('ocean-atlas')} />
            <QuickTile feature={tile('dive-calculator')} detail="Gas, nitrox, blending & deco" onPress={() => onOpenTool('dive-calculator')} />
            <QuickTile
              badge={gear?.alerts ? `${gear.alerts} due` : null}
              detail={gear?.total ? `${gear.total} ${gear.total === 1 ? 'item' : 'items'} · service & packing lists` : 'Service reminders & packing lists'}
              feature={tile('gear-checklist')}
              onPress={() => onOpenTool('gear-checklist')}
            />
            <QuickTile feature={tile('dive-lens')} detail="Identify marine life or gear from a photo" onPress={() => onOpenTool('dive-lens')} />
          </View>

          {inSeason.length ? (
            <>
              <SectionHeader title={`In season · ${MONTHS[month]}`} action="Atlas" onAction={() => onOpenTool('ocean-atlas')} />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail} style={styles.railWrap} decelerationRate="fast" snapToInterval={SEASON_WIDTH + 12} snapToAlignment="start">
                {inSeason.map((pick) => <SeasonCard key={pick.id} pick={pick} onPress={() => onOpenTool('ocean-atlas')} />)}
              </ScrollView>
            </>
          ) : null}

          <SectionHeader title="Keep learning" action="See all" onAction={() => onSelectTab('learn')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail} style={styles.railWrap} decelerationRate="fast" snapToInterval={LESSON_WIDTH + 12} snapToAlignment="start">
            {lessons.map((feature) => <LessonCard key={feature.id} feature={feature} onPress={() => onOpenTool(feature.id)} />)}
          </ScrollView>
        </View>
      </ScrollView>
      {/* Keeps the clock and battery readable over content scrolling beneath them. */}
      <LinearGradient pointerEvents="none" colors={['rgba(5,11,20,0.96)', 'rgba(5,11,20,0.82)', 'rgba(5,11,20,0)']} locations={[0, 0.6, 1]} style={[styles.statusScrim, { height: insets.top + 22 }]} />
    </View>
  );
}

const SEASON_WIDTH = 168;
const LESSON_WIDTH = 216;

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  content: { paddingBottom: spacing.xl },
  pressed: { opacity: 0.8, transform: [{ scale: 0.985 }] },

  hero: { minHeight: 262, paddingBottom: 54, paddingHorizontal: spacing.lg, justifyContent: 'space-between' },
  heroImage: { opacity: 0.95 },
  topBar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 44 },
  brand: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  logo: { height: 34, width: 34 },
  brandName: { color: colors.text, fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },
  avatar: { alignItems: 'center', backgroundColor: 'rgba(7,23,39,0.7)', borderColor: colors.lineStrong, borderRadius: radii.pill, borderWidth: 1, height: 40, justifyContent: 'center', width: 40 },
  avatarText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  greetingBlock: { marginTop: spacing.xl },
  greeting: { color: '#C8DDEB', fontSize: 15, fontWeight: '500' },
  name: { color: colors.text, fontSize: 30, fontWeight: '800', letterSpacing: -0.6, marginTop: 2 },
  subline: { color: colors.muted, fontSize: 13, marginTop: 6 },

  body: { marginTop: -38, paddingHorizontal: spacing.lg },
  summary: { backgroundColor: 'rgba(11,28,46,0.94)', borderColor: colors.line, borderRadius: 22, borderWidth: 1, padding: spacing.md },
  statsRow: { alignItems: 'center', flexDirection: 'row', paddingTop: 2 },
  stat: { alignItems: 'center', flex: 1 },
  statValue: { color: colors.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  statUnit: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  statLabel: { color: colors.muted, fontSize: 11, marginTop: 3 },
  statDivider: { backgroundColor: colors.line, height: 32, width: StyleSheet.hairlineWidth },
  lastDive: { alignItems: 'center', borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 8, marginTop: 14, paddingTop: 12 },
  lastDot: { backgroundColor: colors.good, borderRadius: 4, height: 7, width: 7 },
  lastDiveText: { color: colors.text, flex: 1, fontSize: 13 },
  lastDiveLabel: { color: colors.muted },
  emptyLog: { paddingBottom: 2, paddingHorizontal: 2 },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '700' },
  emptyBody: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  summaryActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  actionPrimaryWrap: { flex: 1.3 },
  actionPrimary: { alignItems: 'center', borderRadius: 14, flexDirection: 'row', gap: 7, justifyContent: 'center', minHeight: 48 },
  actionPrimaryText: { color: colors.white, fontSize: 15, fontWeight: '700' },
  actionSecondary: { alignItems: 'center', backgroundColor: 'rgba(112,221,246,0.08)', borderColor: 'rgba(112,221,246,0.35)', borderRadius: 14, borderWidth: 1, flex: 1, flexDirection: 'row', gap: 7, justifyContent: 'center', minHeight: 48 },
  actionSecondaryText: { color: colors.cyan, fontSize: 15, fontWeight: '700' },

  notice: { alignItems: 'center', borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 12, marginTop: 12, padding: 12 },
  noticeIcon: { alignItems: 'center', borderRadius: 11, height: 38, justifyContent: 'center', width: 38 },
  noticeCopy: { flex: 1 },
  noticeTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  noticeBody: { color: colors.muted, fontSize: 12, marginTop: 2 },

  sectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, marginTop: 28 },
  sectionTitle: { color: colors.text, fontSize: 19, fontWeight: '700', letterSpacing: -0.3 },
  sectionAction: { minHeight: 32, justifyContent: 'center', paddingLeft: 12 },
  sectionActionText: { color: colors.cyan, fontSize: 14, fontWeight: '600' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 20, borderWidth: 1, flexBasis: '47%', flexGrow: 1, padding: 14 },
  tileTop: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  tileIcon: { alignItems: 'center', backgroundColor: 'rgba(112,221,246,0.07)', borderRadius: 13, height: 46, justifyContent: 'center', width: 46 },
  tileBadge: { backgroundColor: 'rgba(255,179,106,0.16)', borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 4 },
  tileBadgeText: { color: colors.warning, fontSize: 11, fontWeight: '700' },
  tileTitle: { color: colors.text, fontSize: 15, fontWeight: '700', marginTop: 12 },
  tileBody: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },

  railWrap: { marginHorizontal: -spacing.lg },
  rail: { gap: 12, paddingHorizontal: spacing.lg },
  seasonCard: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 20, borderWidth: 1, height: 208, overflow: 'hidden', width: SEASON_WIDTH },
  seasonPhoto: { height: 208, left: 0, position: 'absolute', top: 0, width: SEASON_WIDTH },
  seasonWindow: { alignSelf: 'flex-start', backgroundColor: 'rgba(5,11,20,0.72)', borderRadius: radii.pill, margin: 10, paddingHorizontal: 9, paddingVertical: 5 },
  seasonWindowText: { color: colors.good, fontSize: 11, fontWeight: '700' },
  seasonCopy: { bottom: 0, left: 0, padding: 12, position: 'absolute', right: 0 },
  seasonName: { color: colors.text, fontSize: 15, fontWeight: '700' },
  seasonPlace: { color: '#C8DDEB', fontSize: 12, marginTop: 2 },
  seasonCredit: { color: 'rgba(200,221,235,0.55)', fontSize: 8, marginTop: 5 },
  statusScrim: { left: 0, position: 'absolute', right: 0, top: 0 },

  lesson: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: 20, borderWidth: 1, minHeight: 176, overflow: 'hidden', padding: 14, width: LESSON_WIDTH },
  lessonIcon: { alignItems: 'center', backgroundColor: 'rgba(5,11,20,0.35)', borderRadius: 14, height: 50, justifyContent: 'center', width: 50 },
  lessonKind: { color: colors.cyan, fontSize: 11, fontWeight: '600', marginTop: 14 },
  lessonTitle: { color: colors.text, fontSize: 16, fontWeight: '700', marginTop: 3 },
  lessonBody: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 4 },
});
