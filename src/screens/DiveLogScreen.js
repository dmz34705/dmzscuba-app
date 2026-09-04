import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Line, Path, Text as SvgText } from 'react-native-svg';

import { ScreenHeader, SectionLabel } from '../components/AppShell';
import { FormError } from '../components/AccountForm';
import { Card, PrimaryButton, SecondaryButton, Stat } from '../components/Ui';
import useDiveLog, { ALL_DIVES_KEY } from '../features/diveLog/useDiveLog';
import { NUMBER_KEYBOARD_ACCESSORY_ID, usesNumberKeyboard } from '../lib/numberKeyboard';
import {
  DIVE_MODES,
  DIVE_TYPES,
  WATER_TYPES,
  createDive,
  defaultGasLabel,
  normalizeDive,
} from '../lib/diveLog/schema';
import { validateDiveRecord } from '../lib/diveLog/validation';
import {
  depthToInput,
  formatCoordinates,
  formatDate,
  formatDepth,
  formatDuration,
  formatGasLabel,
  formatPressure,
  formatTemperature,
  formatTime,
  formatVolume,
  formatWeight,
  minutesToInput,
  parseDepthInput,
  parseNumberInput,
  parsePressureInput,
  parseTemperatureInput,
  parseVolumeInput,
  parseWeightInput,
  pressureToInput,
  temperatureToInput,
  volumeToInput,
  weightToInput,
} from '../lib/diveLog/format';
import { buildLogProfileGeometry } from '../lib/diveLog/profileChart';
import { getLibdivecomputerVersion } from '../../modules/dive-computer-bridge';
import DiveComputerDownloadPanel from '../features/diveComputerDownload/DiveComputerDownloadPanel';
import useDiveComputerDownload from '../features/diveComputerDownload/useDiveComputerDownload';
import { clearPendingReview } from '../features/diveComputerDownload/downloadReviewFlag';
import { colors, radii, shadow, spacing } from '../theme';

const DIVE_MODE_LABELS = { oc: 'Open circuit', ccr: 'Closed circuit', scr: 'Semi-closed', gauge: 'Gauge', freedive: 'Freedive' };
const WATER_TYPE_LABELS = { salt: 'Salt', fresh: 'Fresh' };

// ---------------------------------------------------------------------------
// Form <-> record mapping
// ---------------------------------------------------------------------------

function pad2(value) {
  return String(value).padStart(2, '0');
}

function todayDateInput() {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

function isoToDateInput(iso) {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '';
  const date = new Date(time);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function combineDateTime(dateText, timeText) {
  const date = String(dateText || '').trim();
  const time = String(timeText || '').trim() || '00:00';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
  const parsed = new Date(`${date}T${/^\d{1,2}:\d{2}$/.test(time) ? time : '00:00'}`);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
}

function splitList(text) {
  return String(text || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function blankForm() {
  return {
    date: todayDateInput(),
    time: '',
    number: '',
    siteName: '',
    location: '',
    country: '',
    latitude: '',
    longitude: '',
    operator: '',
    buddies: '',
    durationMin: '',
    surfaceIntervalMin: '',
    maxDepth: '',
    avgDepth: '',
    waterType: '',
    tempSurface: '',
    tempMin: '',
    visibility: '',
    o2: '21',
    he: '0',
    tankVolume: '',
    tankWorkPressure: '',
    tankStart: '',
    tankEnd: '',
    weight: '',
    suit: '',
    diveMode: '',
    types: [],
    rating: 0,
    notes: '',
    tags: '',
  };
}

function recordToForm(record, units) {
  const mix = record.gas.mixes[0] || { o2: 0.21, he: 0 };
  const tank = record.gas.tanks[0] || {};
  return {
    date: isoToDateInput(record.startTime) || todayDateInput(),
    time: formatTime(record.startTime),
    number: record.number != null ? String(record.number) : '',
    siteName: record.site.name,
    location: record.site.location,
    country: record.site.country,
    latitude: record.site.latitude != null ? String(record.site.latitude) : '',
    longitude: record.site.longitude != null ? String(record.site.longitude) : '',
    operator: record.operator,
    buddies: record.buddies.join(', '),
    durationMin: minutesToInput(record.durationSeconds),
    surfaceIntervalMin: minutesToInput(record.surfaceIntervalSeconds),
    maxDepth: depthToInput(record.water.maxDepthMeters, units.depthUnit),
    avgDepth: depthToInput(record.water.avgDepthMeters, units.depthUnit),
    waterType: record.water.type || '',
    tempSurface: temperatureToInput(record.water.tempSurfaceC, units.temperatureUnit),
    tempMin: temperatureToInput(record.water.tempMinC, units.temperatureUnit),
    visibility: depthToInput(record.water.visibilityMeters, units.depthUnit),
    o2: String(Math.round(mix.o2 * 100)),
    he: String(Math.round(mix.he * 100)),
    tankVolume: volumeToInput(tank.volumeLiters, units.gasVolumeUnit, tank.workPressureBar),
    tankWorkPressure: pressureToInput(tank.workPressureBar, units.pressureUnit),
    tankStart: pressureToInput(tank.startBar, units.pressureUnit),
    tankEnd: pressureToInput(tank.endBar, units.pressureUnit),
    weight: weightToInput(record.gear.weightKg, 'kg'),
    suit: record.gear.exposureSuit,
    diveMode: record.diveMode || '',
    types: [...record.types],
    rating: record.rating || 0,
    notes: record.notes,
    tags: record.tags.join(', '),
  };
}

function formToRecordPartial(form, units) {
  const o2 = parseNumberInput(form.o2);
  const he = parseNumberInput(form.he);
  const mix = {
    o2: o2 == null ? 0.21 : o2 / 100,
    he: he == null ? 0 : he / 100,
  };
  mix.label = defaultGasLabel(mix.o2, mix.he);

  const tankStart = parsePressureInput(form.tankStart, units.pressureUnit);
  const tankEnd = parsePressureInput(form.tankEnd, units.pressureUnit);
  const tankWorkPressure = parsePressureInput(form.tankWorkPressure, units.pressureUnit);
  // In imperial units the cylinder "size" is a gas capacity that only converts to
  // a water volume once we know the working pressure, so parse that first.
  const tankVolume = parseVolumeInput(form.tankVolume, units.gasVolumeUnit, tankWorkPressure);
  const hasTank = tankStart != null || tankEnd != null || tankVolume != null || tankWorkPressure != null;

  const startTime = combineDateTime(form.date, form.time);
  const parsedStart = Date.parse(startTime);
  const durationMin = parseNumberInput(form.durationMin);
  const surfaceMin = parseNumberInput(form.surfaceIntervalMin);

  return {
    number: parseNumberInput(form.number),
    startTime,
    timezoneOffsetMinutes: Number.isNaN(parsedStart) ? null : -new Date(parsedStart).getTimezoneOffset(),
    durationSeconds: durationMin != null ? Math.round(durationMin * 60) : 0,
    surfaceIntervalSeconds: form.surfaceIntervalMin.trim() && surfaceMin != null ? Math.round(surfaceMin * 60) : null,
    site: {
      name: form.siteName.trim(),
      location: form.location.trim(),
      country: form.country.trim(),
      latitude: parseNumberInput(form.latitude),
      longitude: parseNumberInput(form.longitude),
    },
    operator: form.operator.trim(),
    buddies: splitList(form.buddies),
    water: {
      type: form.waterType || null,
      maxDepthMeters: parseDepthInput(form.maxDepth, units.depthUnit) || 0,
      avgDepthMeters: parseDepthInput(form.avgDepth, units.depthUnit),
      tempSurfaceC: parseTemperatureInput(form.tempSurface, units.temperatureUnit),
      tempMinC: parseTemperatureInput(form.tempMin, units.temperatureUnit),
      tempMaxC: null,
      visibilityMeters: parseDepthInput(form.visibility, units.depthUnit),
    },
    gas: { mixes: [mix], tanks: hasTank ? [{ volumeLiters: tankVolume, workPressureBar: tankWorkPressure, startBar: tankStart, endBar: tankEnd, mixIndex: 0 }] : [] },
    diveMode: form.diveMode || null,
    types: form.types,
    gear: { weightKg: parseWeightInput(form.weight, 'kg'), exposureSuit: form.suit.trim(), notes: '' },
    rating: form.rating || null,
    notes: form.notes.trim(),
    tags: splitList(form.tags),
  };
}

// ---------------------------------------------------------------------------
// Shared field components
// ---------------------------------------------------------------------------

function Field({ label, value, onChangeText, suffix, placeholder, helper, keyboardType = 'default', autoCapitalize = 'sentences' }) {
  const numberKeyboard = usesNumberKeyboard(keyboardType);
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputShell}>
        <TextInput
          accessibilityLabel={label}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          inputAccessoryViewID={numberKeyboard ? NUMBER_KEYBOARD_ACCESSORY_ID : undefined}
          keyboardType={keyboardType}
          onChangeText={onChangeText}
          onSubmitEditing={numberKeyboard ? Keyboard.dismiss : undefined}
          placeholder={placeholder}
          placeholderTextColor={colors.faint}
          returnKeyType={numberKeyboard ? 'done' : undefined}
          style={styles.input}
          value={value}
        />
        {suffix ? <Text style={styles.inputSuffix}>{suffix}</Text> : null}
      </View>
      {helper ? <Text style={styles.fieldHelper}>{helper}</Text> : null}
    </View>
  );
}

function ChoiceRow({ label, options, value, onChange, allowClear = true }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <ScrollView horizontal contentContainerStyle={styles.choiceRow} showsHorizontalScrollIndicator={false}>
        {options.map((option) => (
          <SecondaryButton
            key={option.key}
            label={option.label}
            onPress={() => onChange(allowClear && value === option.key ? '' : option.key)}
            selected={value === option.key}
            style={styles.choice}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function TagToggles({ label, options, selected, onToggle }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.tagWrap}>
        {options.map((option) => (
          <SecondaryButton
            key={option}
            label={option}
            onPress={() => onToggle(option)}
            selected={selected.includes(option)}
            style={styles.tag}
          />
        ))}
      </View>
    </View>
  );
}

function RatingRow({ value, onChange }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>Rating</Text>
      <View style={styles.ratingRow}>
        {[1, 2, 3, 4, 5].map((star) => (
          <SecondaryButton
            key={star}
            label={star <= value ? '★' : '☆'}
            onPress={() => onChange(value === star ? 0 : star)}
            selected={star <= value}
            style={styles.ratingStar}
          />
        ))}
      </View>
    </View>
  );
}

function FormSection({ title, children }) {
  return (
    <Card style={styles.formCard}>
      <Text style={styles.formCardTitle}>{title}</Text>
      {children}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Profile chart (only present for imported / downloaded dives)
// ---------------------------------------------------------------------------

function ProfileChart({ samples, maxDepthMeters, depthUnit, pressureUnit, pressureSeries = [] }) {
  const { width } = useWindowDimensions();
  const chartWidth = Math.max(200, width - spacing.md * 2 - 30 - 30);
  const chartHeight = 150;
  const geometry = useMemo(
    () => buildLogProfileGeometry(samples, chartWidth, chartHeight, { maxDepthMeters }),
    [chartWidth, samples, maxDepthMeters],
  );
  if (!geometry.linePath) return null;

  // Tank-pressure traces — one per computer that recorded air — on a shared 0..max scale.
  const withAir = pressureSeries.filter((s) => (s.samples || []).some((x) => x?.pressureBar > 0));
  const maxBar = Math.max(0, ...withAir.flatMap((s) => (s.samples || []).map((x) => x?.pressureBar || 0)));
  const airPaths = withAir.map((s) => ({ ...s, path: geometry.pressureOverlay(s.samples, maxBar) })).filter((s) => s.path);

  return (
    <Card style={styles.detailCard}>
      <Text style={styles.detailCardTitle}>Profile</Text>
      <View style={styles.chartRow}>
        <View style={styles.chartAxis}>
          {geometry.depthTicks.map((tick) => (
            <Text key={tick.meters} style={[styles.chartAxisText, { top: tick.y - 6 }]}>
              {formatDepth(tick.meters, depthUnit)}
            </Text>
          ))}
        </View>
        <Svg width={chartWidth} height={chartHeight + 16}>
          <Line x1="0" y1="0" x2={chartWidth} y2="0" stroke={colors.line} strokeWidth="1" />
          {geometry.depthTicks.map((tick) => (
            <Line key={`d-${tick.meters}`} x1="0" y1={tick.y} x2={chartWidth} y2={tick.y} stroke="rgba(167,196,216,.1)" strokeWidth="1" />
          ))}
          {geometry.timeTicks.map((tick) => (
            <Line key={`t-${tick.seconds}`} x1={tick.x} y1="0" x2={tick.x} y2={chartHeight} stroke="rgba(167,196,216,.1)" strokeWidth="1" />
          ))}
          <Path d={geometry.areaPath} fill="rgba(112,221,246,.12)" />
          <Path d={geometry.linePath} fill="none" stroke={colors.cyan} strokeWidth="2.5" strokeLinejoin="round" />
          {airPaths.map((s) => (
            <Path key={s.label} d={s.path} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" />
          ))}
          {geometry.timeTicks.map((tick) => (
            <SvgText key={`tl-${tick.seconds}`} x={tick.x} y={chartHeight + 12} fill={colors.faint} fontSize="8" fontWeight="700" textAnchor="middle">
              {`${Math.round(tick.seconds / 60)}m`}
            </SvgText>
          ))}
        </Svg>
        {airPaths.length ? (
          <View style={styles.chartPressureAxis}>
            <Text style={[styles.chartPressureText, { top: -4 }]}>{formatPressure(maxBar, pressureUnit)}</Text>
            <Text style={[styles.chartPressureText, { top: chartHeight - 8 }]}>0</Text>
          </View>
        ) : null}
      </View>
      {airPaths.length ? (
        <View style={styles.chartLegend}>
          <View style={styles.legendItem}><View style={[styles.legendSwatch, { backgroundColor: colors.cyan }]} /><Text style={styles.legendText}>Depth</Text></View>
          {airPaths.map((s) => (
            <View key={s.label} style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: s.color }]} />
              <Text style={styles.legendText}>{airPaths.length > 1 ? `${s.label} air` : 'Tank pressure'}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// List view
// ---------------------------------------------------------------------------

function StatSummaryCard({ stats, units, onPress }) {
  const body = (
    <Card style={styles.summaryCard}>
      <Text style={styles.detailCardTitle}>Your logbook</Text>
      <View style={styles.statGrid}>
        <Stat label="Dives" value={String(stats.totalDives)} style={styles.statCell} />
        <Stat label="Bottom time" value={formatDuration(stats.totalBottomTimeSeconds)} style={styles.statCell} />
        <Stat label="Deepest" value={stats.deepestMeters ? formatDepth(stats.deepestMeters, units.depthUnit) : '—'} style={styles.statCell} />
        <Stat label="Longest" value={stats.longestSeconds ? formatDuration(stats.longestSeconds) : '—'} style={styles.statCell} />
      </View>
      {stats.firstDiveDate ? (
        <Text style={styles.summaryFootnote}>
          {`${formatDate(stats.firstDiveDate)} – ${formatDate(stats.lastDiveDate)}`}
        </Text>
      ) : null}
      {onPress ? <Text style={styles.summaryLink}>See all stats →</Text> : null}
    </Card>
  );
  if (!onPress) return body;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="See all stats" onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      {body}
    </Pressable>
  );
}

function TrendArrow({ slope, goodDirection = 'down' }) {
  if (slope == null || Math.abs(slope) < 0.001) return <Text style={styles.trendFlat}>→ steady</Text>;
  const improving = goodDirection === 'down' ? slope < 0 : slope > 0;
  return (
    <Text style={improving ? styles.trendGood : styles.trendBad}>
      {slope < 0 ? '▼' : '▲'} {improving ? 'improving' : 'watch'}
    </Text>
  );
}

function StatsView({ trends, stats, units, onRecheck, rechecking, deletedCount, onPurge, onEraseAll, onDiagnostic, onHealthCheck }) {
  const sacUnit = units.pressureUnit;
  return (
    <>
      <SectionLabel>NERD STATS</SectionLabel>
      <Text style={styles.title}>Your diving, measured.</Text>

      <Card style={styles.summaryCard}>
        <Text style={styles.detailCardTitle}>Totals</Text>
        <View style={styles.statGrid}>
          <Stat label="Dives" value={String(trends.diveCount)} style={styles.statCell} />
          <Stat label="Bottom time" value={formatDuration(trends.totalBottomTimeSeconds)} style={styles.statCell} />
          <Stat label="Deepest" value={stats.deepestMeters ? formatDepth(stats.deepestMeters, units.depthUnit) : '—'} style={styles.statCell} />
          <Stat label="Fast-ascent dives" value={String(trends.fastAscentDives)} style={styles.statCell} />
        </View>
      </Card>

      <Card style={styles.detailCard}>
        <Text style={styles.detailCardTitle}>Gas consumption</Text>
        <DetailRow label="Average SAC" value={trends.sac.mean != null ? `${formatPressure(trends.sac.mean, sacUnit)}/min` : 'No transmitter data yet'} />
        <DetailRow label="Average RMV" value={trends.rmv.mean != null ? `${trends.rmv.mean.toFixed(1)} L/min` : ''} />
        {trends.sac.mean != null ? (
          <View style={styles.trendRow}><Text style={styles.trendLabel}>Over time</Text><TrendArrow slope={trends.sac.trendPerDive} goodDirection="down" /></View>
        ) : null}
      </Card>

      <Card style={styles.detailCard}>
        <Text style={styles.detailCardTitle}>Safety score</Text>
        <DetailRow label="All dives" value={trends.safety.mean != null ? `${Math.round(trends.safety.mean)} / 100` : 'No profile data yet'} />
        <DetailRow label="Last 10" value={trends.safety.recentMean != null ? `${trends.safety.recentMean} / 100` : ''} />
        {trends.safety.mean != null ? (
          <View style={styles.trendRow}><Text style={styles.trendLabel}>Trend</Text><TrendArrow slope={trends.safety.trendPerDive} goodDirection="up" /></View>
        ) : null}
      </Card>

      <Card style={styles.detailCard}>
        <Text style={styles.detailCardTitle}>Average depth</Text>
        <DetailRow label="Across all dives" value={trends.avgDepth.mean != null ? formatDepth(trends.avgDepth.mean, units.depthUnit) : ''} />
      </Card>

      {trends.gasMix.length ? (
        <Card style={styles.detailCard}>
          <Text style={styles.detailCardTitle}>Gas mixes</Text>
          {trends.gasMix.map((g) => (
            <DetailRow key={g.label} label={g.label} value={`${g.count} ${g.count === 1 ? 'dive' : 'dives'}`} />
          ))}
        </Card>
      ) : null}

      <Card style={styles.detailCard}>
        <Text style={styles.detailCardTitle}>Housekeeping</Text>
        <Text style={styles.reviewBody}>
          Re-check every dive for the same dive logged twice — e.g. one computer
          split a dive another saw as one.
        </Text>
        <SecondaryButton
          label={rechecking ? 'Checking…' : 'Check for duplicate dives'}
          onPress={onRecheck}
          disabled={rechecking}
          style={styles.primaryCta}
        />
        <SecondaryButton
          label={deletedCount ? `Purge ${deletedCount} deleted ${deletedCount === 1 ? 'dive' : 'dives'}` : 'Purge deleted dives'}
          onPress={onPurge}
          disabled={!deletedCount}
          style={styles.primaryCta}
        />
        <Text style={styles.engineNote}>
          Deleted dives stay hidden but on the device (so a delete is reversible and
          the matcher can re-import them). Purge removes them for good and clears the
          per-computer sync markers.
        </Text>
        <Pressable onPress={onDiagnostic} hitSlop={8} style={styles.reviewSkip}>
          <Text style={styles.reviewSkipText}>Share logbook diagnostic (dev)</Text>
        </Pressable>
        <Pressable onPress={onHealthCheck} hitSlop={8} style={styles.reviewSkip}>
          <Text style={styles.reviewSkipText}>Run health check</Text>
        </Pressable>
        <Pressable onPress={onEraseAll} hitSlop={8} style={styles.reviewSkip}>
          <Text style={[styles.reviewSkipText, { color: colors.danger }]}>Erase the entire logbook (dev)</Text>
        </Pressable>
      </Card>
    </>
  );
}

function DiveListCard({ row, units, onPress, onLongPress, selectable, selected }) {
  const parts = [formatDepth(row.maxDepthMeters, units.depthUnit), formatDuration(row.durationSeconds)];
  const title = `${formatDate(row.startTime) || 'Undated dive'} · ${row.siteName || 'Unnamed site'}`;
  return (
    <Card style={[styles.diveCard, selected && styles.diveCardSelected]}>
      {selectable ? (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: selected }}
          accessibilityLabel={title}
          onPress={onPress}
          onLongPress={onLongPress}
          style={({ pressed }) => [styles.selectRow, pressed && styles.pressed]}
        >
          <View style={[styles.checkCircle, selected && styles.checkCircleOn]}>
            {selected ? <Text style={styles.checkMark}>✓</Text> : null}
          </View>
          <Text style={styles.selectRowLabel} numberOfLines={1}>{title}</Text>
        </Pressable>
      ) : (
        <SecondaryButton label={title} onPress={onPress} onLongPress={onLongPress} style={styles.diveCardButton} />
      )}
      <View style={styles.diveCardMeta}>
        <Text style={styles.diveCardMetaText}>{parts.join('  ·  ')}</Text>
        {row.rating ? <Text style={styles.diveCardRating}>{'★'.repeat(row.rating)}</Text> : null}
      </View>
    </Card>
  );
}

const RANK_LABELS = { 1: 'Primary', 2: 'Secondary', 3: 'Tertiary' };

function FolderCard({ folder, onPress, onSetRank }) {
  const bits = [`${folder.count} ${folder.count === 1 ? 'dive' : 'dives'}`];
  if (folder.lastDiveDate) bits.push(`last ${formatDate(folder.lastDiveDate)}`);
  const showRank = folder.kind === 'computer' && onSetRank;
  const pickRank = () => {
    Alert.alert(folder.label, 'Priority for the data shown on dives recorded by more than one computer.', [
      { text: 'Primary', onPress: () => onSetRank(folder.key, 1) },
      { text: 'Secondary', onPress: () => onSetRank(folder.key, 2) },
      { text: 'Tertiary', onPress: () => onSetRank(folder.key, 3) },
      { text: 'Not ranked', onPress: () => onSetRank(folder.key, null) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };
  return (
    <Card style={[styles.diveCard, folder.kind === 'all' && styles.diveCardAll]}>
      <View style={styles.folderTopRow}>
        <SecondaryButton label={folder.label} onPress={onPress} style={[styles.diveCardButton, styles.folderNameButton]} />
        {showRank ? (
          <Pressable onPress={pickRank} hitSlop={8} style={({ pressed }) => [styles.rankChip, folder.rank && styles.rankChipOn, pressed && styles.pressed]}>
            <Text style={[styles.rankChipText, folder.rank && styles.rankChipTextOn]}>
              {folder.rank ? RANK_LABELS[folder.rank] : 'Set rank'}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {folder.sublabel ? <Text style={styles.folderSerial}>{folder.sublabel}</Text> : null}
      <View style={styles.diveCardMeta}>
        <Text style={styles.diveCardMetaText}>{bits.join('  ·  ')}</Text>
      </View>
    </Card>
  );
}

function SelectionBar({ count, total, allSelected, onToggleAll, onDelete, onMerge }) {
  return (
    <Card style={styles.selectionBar}>
      <Pressable onPress={onToggleAll} hitSlop={8} style={({ pressed }) => [styles.selectionToggle, pressed && styles.pressed]}>
        <Text style={styles.selectionToggleText}>{allSelected ? 'Deselect all' : `Select all (${total})`}</Text>
      </Pressable>
      <View style={styles.selectionRight}>
        {count >= 2 ? (
          <Pressable accessibilityRole="button" onPress={onMerge} hitSlop={8} style={({ pressed }) => [styles.selectionMerge, pressed && styles.pressed]}>
            <Text style={styles.selectionMergeText}>Merge {count}</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          disabled={count === 0}
          onPress={onDelete}
          hitSlop={8}
          style={({ pressed }) => [styles.selectionDelete, count === 0 && styles.selectionDeleteOff, pressed && styles.pressed]}
        >
          <Text style={[styles.selectionDeleteText, count === 0 && styles.selectionDeleteTextOff]}>
            {count ? `Delete ${count}` : 'Delete'}
          </Text>
        </Pressable>
      </View>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Cross-computer match review (post-download)
// ---------------------------------------------------------------------------

function offsetLabel(minutes) {
  const sign = minutes > 0 ? '+' : '−';
  const abs = Math.abs(minutes);
  if (abs >= 1440) {
    const d = Math.floor(abs / 1440);
    const h = Math.round((abs % 1440) / 60);
    return `${sign}${d}d ${h}h`;
  }
  return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`;
}

function ReconcileCard({ proposal, onResolve }) {
  const conflict = Math.abs(proposal.offsetMinutes) >= 1;
  const range = proposal.firstDate === proposal.lastDate
    ? formatDate(proposal.firstDate)
    : `${formatDate(proposal.firstDate)} – ${formatDate(proposal.lastDate)}`;
  return (
    <Card style={styles.reviewCard}>
      <Text style={styles.reviewTitle}>Two computers, one trip</Text>
      <Text style={styles.reviewBody}>
        <Text style={styles.reviewStrong}>{proposal.sharedDiveCount}</Text>
        {proposal.sharedDiveCount === 1 ? ' dive was ' : ' dives were '}
        recorded by both <Text style={styles.reviewStrong}>{proposal.deviceNameA}</Text> and{' '}
        <Text style={styles.reviewStrong}>{proposal.deviceNameB}</Text>
        {conflict
          ? <Text>, with clocks about {offsetLabel(proposal.offsetMinutes).replace(/^[+−]/, '')} apart.</Text>
          : <Text>. Their clocks agree.</Text>}
      </Text>
      <Text style={styles.reviewMeta}>
        {range || '—'}   ·   {proposal.confidence === 'high' ? `${proposal.anchors} matched dives` : 'low confidence — check carefully'}
      </Text>

      {conflict ? (
        <>
          <Text style={styles.reviewQuestion}>Which computer&apos;s clock is correct?</Text>
          <View style={styles.reviewActions}>
            <SecondaryButton label={proposal.deviceNameA} onPress={() => onResolve(proposal, 'merge', { correctDeviceKey: proposal.deviceKeyA })} style={styles.reviewButton} />
            <SecondaryButton label={proposal.deviceNameB} onPress={() => onResolve(proposal, 'merge', { correctDeviceKey: proposal.deviceKeyB })} style={styles.reviewButton} />
          </View>
        </>
      ) : (
        <View style={styles.reviewActions}>
          <PrimaryButton label={`Merge ${proposal.sharedDiveCount} ${proposal.sharedDiveCount === 1 ? 'dive' : 'dives'}`} onPress={() => onResolve(proposal, 'merge', {})} style={styles.reviewButton} />
        </View>
      )}
      <Pressable onPress={() => onResolve(proposal, 'separate')} hitSlop={8} style={styles.reviewSkip}>
        <Text style={styles.reviewSkipText}>These are different dives — leave them</Text>
      </Pressable>
    </Card>
  );
}

function MatchReviewCard({ proposal, onResolve }) {
  if (proposal.kind === 'reconcile') return <ReconcileCard proposal={proposal} onResolve={onResolve} />;
  const conflict = Math.abs(proposal.offsetMinutes) >= 1;
  const nAbsorb = (proposal.absorbDiveIds || []).length;
  const body = proposal.kind === 'spanning-merge'
    ? (
      <>
        <Text style={styles.reviewStrong}>{nAbsorb} dives</Text> from{' '}
        <Text style={styles.reviewStrong}>{proposal.matchDeviceName}</Text> together match one continuous dive from{' '}
        <Text style={styles.reviewStrong}>{proposal.newDeviceName}</Text>
      </>
    ) : proposal.kind === 'fragment'
      ? (
        <>
          A shorter dive from <Text style={styles.reviewStrong}>{proposal.newDeviceName}</Text> is part of a longer dive from{' '}
          <Text style={styles.reviewStrong}>{proposal.matchDeviceName}</Text>
        </>
      )
      : (
        <>
          A dive from <Text style={styles.reviewStrong}>{proposal.newDeviceName}</Text> lines up with one from{' '}
          <Text style={styles.reviewStrong}>{proposal.matchDeviceName}</Text>
        </>
      );
  const newDate = formatDate(proposal.newReportedStart);
  const matchDate = formatDate(proposal.matchStart);
  return (
    <Card style={styles.reviewCard}>
      <Text style={styles.reviewTitle}>
        {proposal.kind === 'spanning-merge' || proposal.kind === 'fragment' ? 'One dive, split in two?' : 'Same dive, two computers?'}
      </Text>
      <Text style={styles.reviewBody}>
        {body}
        {conflict ? <Text> — but their clocks differ by {offsetLabel(proposal.offsetMinutes)}.</Text> : <Text>.</Text>}
      </Text>
      <Text style={styles.reviewMeta}>
        {proposal.newDeviceName}: {newDate || '—'}   ·   {proposal.matchDeviceName}: {matchDate || '—'}
      </Text>
      <Text style={styles.reviewMeta}>{`match confidence ${Math.round(proposal.score * 100)}%`}</Text>
      {proposal.implausibleClock ? (
        <Text style={styles.reviewWarn}>
          ⚠ That is a very large clock difference. Check the dates and profiles really are the same dive before merging.
        </Text>
      ) : null}

      {conflict ? (
        <>
          <Text style={styles.reviewQuestion}>Which clock is correct?</Text>
          <View style={styles.reviewActions}>
            <SecondaryButton
              label={proposal.matchDeviceName}
              onPress={() => onResolve(proposal, 'merge', { correctDeviceKey: proposal.matchDeviceKey })}
              style={styles.reviewButton}
            />
            <SecondaryButton
              label={proposal.newDeviceName}
              onPress={() => onResolve(proposal, 'merge', { correctDeviceKey: proposal.newDeviceKey })}
              style={styles.reviewButton}
            />
          </View>
        </>
      ) : (
        <View style={styles.reviewActions}>
          <PrimaryButton label="Merge — same dive" onPress={() => onResolve(proposal, 'merge', {})} style={styles.reviewButton} />
        </View>
      )}
      <Pressable onPress={() => onResolve(proposal, 'separate')} hitSlop={8} style={styles.reviewSkip}>
        <Text style={styles.reviewSkipText}>Not the same dive — keep separate</Text>
      </Pressable>
    </Card>
  );
}

function MatchReview({ proposals, onResolve, onDone }) {
  return (
    <>
      <SectionLabel>REVIEW</SectionLabel>
      <Text style={styles.title}>Matching dives across computers</Text>
      <Text style={styles.subtitle}>
        {proposals.length} {proposals.length === 1 ? 'pair' : 'pairs'} to check. Merged dives count once.
      </Text>
      {proposals.map((p) => (
        <MatchReviewCard key={p.id} proposal={p} onResolve={onResolve} />
      ))}
      <SecondaryButton label="Done" onPress={onDone} style={styles.cancelButton} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Detail view
// ---------------------------------------------------------------------------

function DetailRow({ label, value }) {
  if (value == null || value === '' || value === '—') return null;
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailRowLabel}>{label}</Text>
      <Text style={styles.detailRowValue}>{value}</Text>
    </View>
  );
}

function DetailCard({ title, children }) {
  const hasContent = Array.isArray(children) ? children.some(Boolean) : Boolean(children);
  if (!hasContent) return null;
  return (
    <Card style={styles.detailCard}>
      <Text style={styles.detailCardTitle}>{title}</Text>
      {children}
    </Card>
  );
}

function LogsCard({ logs, primaryLog, units, onShowLog }) {
  if (!logs.length) return null;
  const multi = logs.length > 1;
  return (
    <Card style={styles.detailCard}>
      <Text style={styles.detailCardTitle}>
        {multi ? `Recorded by ${logs.length} computers` : 'Recorded by'}
      </Text>
      {logs.map((log) => {
        let name = `${log.device.vendor} ${log.device.product}`.trim() || 'Dive computer';
        if (log.fusedFrom > 1) name += ` (${log.fusedFrom} recordings joined)`;
        const bits = [formatDepth(log.water.maxDepthMeters, units.depthUnit), formatDuration(log.durationSeconds)];
        if (logHasAir(log)) bits.push('air');
        if (log.timeCorrectionMinutes) {
          const sign = log.timeCorrectionMinutes > 0 ? '+' : '−';
          const abs = Math.abs(log.timeCorrectionMinutes);
          bits.push(`clock ${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`);
        }
        const shown = log.id === primaryLog?.id;
        const tappable = multi && !!onShowLog;
        return (
          <Pressable
            key={log.id}
            disabled={!tappable}
            onPress={tappable ? () => onShowLog(log.id) : undefined}
            style={({ pressed }) => [styles.logRow, shown && styles.logRowShown, pressed && styles.pressed]}
          >
            <View style={styles.logRowMain}>
              <Text style={[styles.logRowName, shown && styles.logRowNameShown]}>
                {name}{shown ? '  ·  showing' : ''}
              </Text>
              {log.device.serial ? <Text style={styles.logRowSerial}>SN {log.device.serial}</Text> : null}
            </View>
            <Text style={styles.logRowMeta}>{bits.join('  ·  ')}</Text>
          </Pressable>
        );
      })}
    </Card>
  );
}

const PRESSURE_COLORS = ['#F0C84B', '#70E2A3', '#FF9F7F']; // per air-bearing computer

function logHasAir(log) {
  return (log?.gas?.tanks || []).some((t) => t?.startBar != null || t?.endBar != null)
    || (log?.profile?.samples || []).some((s) => s?.pressureBar != null);
}
function computerName(log) {
  return `${log?.device?.vendor || ''} ${log?.device?.product || ''}`.trim() || 'Dive computer';
}

function DiveDetail({ dive, logs = [], primaryLog, units, onShowLog }) {
  // Physical data comes from the shown computer's log; user's own fields from the Dive.
  const phys = primaryLog || dive;
  const water = phys.water || dive.water;
  const gas = phys.gas || dive.gas;
  const mix = gas.mixes?.[0];
  const tank = gas.tanks?.[0];
  const samples = primaryLog?.profile?.samples || [];
  const analytics = primaryLog?.analytics;
  const shownName = primaryLog ? computerName(primaryLog) : null;

  // Air pressure: which computer(s) recorded it.
  const airLogs = logs.filter(logHasAir);
  const airSeries = airLogs.map((log, i) => ({
    label: computerName(log),
    color: PRESSURE_COLORS[i % PRESSURE_COLORS.length],
    samples: log.profile?.samples || [],
    tank: log.gas?.tanks?.[0] || null,
    analytics: log.analytics,
  }));
  const tankForNumbers = airSeries[0]?.tank || tank;
  const gasUsedBar = tankForNumbers && tankForNumbers.startBar != null && tankForNumbers.endBar != null
    ? tankForNumbers.startBar - tankForNumbers.endBar : null;
  const gasUsedLiters = gasUsedBar != null && tankForNumbers.volumeLiters ? gasUsedBar * tankForNumbers.volumeLiters : null;

  return (
    <>
      {logs.length > 1 && shownName ? (
        <Text style={styles.detailShownFrom}>Showing {shownName}&apos;s data — tap a computer below to switch</Text>
      ) : null}

      <DetailCard title="When & where">
        <DetailRow label="Date" value={formatDate(dive.startTime)} />
        <DetailRow label="Time" value={formatTime(dive.startTime)} />
        <DetailRow label="Dive number" value={dive.number != null ? String(dive.number) : ''} />
        <DetailRow label="Site" value={dive.site.name} />
        <DetailRow label="Location" value={[dive.site.location, dive.site.country].filter(Boolean).join(', ')} />
        <DetailRow label="Coordinates" value={formatCoordinates(dive.site.latitude, dive.site.longitude)} />
        <DetailRow label="Operator" value={dive.operator} />
        <DetailRow label="Buddies" value={dive.buddies.join(', ')} />
      </DetailCard>

      <DetailCard title="Depths & time">
        <DetailRow label="Max depth" value={formatDepth(water.maxDepthMeters, units.depthUnit)} />
        <DetailRow label="Avg depth" value={water.avgDepthMeters != null ? formatDepth(water.avgDepthMeters, units.depthUnit) : ''} />
        <DetailRow label="Duration" value={formatDuration(phys.durationSeconds)} />
        <DetailRow label="Surface interval" value={dive.surfaceIntervalSeconds != null ? formatDuration(dive.surfaceIntervalSeconds) : ''} />
      </DetailCard>

      <DetailCard title="Conditions">
        <DetailRow label="Water" value={water.type ? WATER_TYPE_LABELS[water.type] : ''} />
        <DetailRow label="Surface temp" value={water.tempSurfaceC != null ? formatTemperature(water.tempSurfaceC, units.temperatureUnit) : ''} />
        <DetailRow label="Min temp" value={water.tempMinC != null ? formatTemperature(water.tempMinC, units.temperatureUnit) : ''} />
        <DetailRow label="Visibility" value={water.visibilityMeters != null ? formatDepth(water.visibilityMeters, units.depthUnit) : ''} />
      </DetailCard>

      <DetailCard title="Gas & equipment">
        <DetailRow label="Mix" value={mix ? formatGasLabel(mix) : ''} />
        <DetailRow label="Dive mode" value={phys.diveMode ? DIVE_MODE_LABELS[phys.diveMode] : ''} />
        <DetailRow label="Cylinder" value={tank?.volumeLiters != null ? formatVolume(tank.volumeLiters, units.gasVolumeUnit, tank.workPressureBar) : ''} />
        <DetailRow label="Working pressure" value={tank?.workPressureBar != null ? formatPressure(tank.workPressureBar, units.pressureUnit) : ''} />
        <DetailRow label="Weight" value={dive.gear.weightKg != null ? formatWeight(dive.gear.weightKg, 'kg') : ''} />
        <DetailRow label="Exposure suit" value={dive.gear.exposureSuit} />
      </DetailCard>

      {samples.length ? (
        <ProfileChart
          samples={samples}
          maxDepthMeters={water.maxDepthMeters}
          depthUnit={units.depthUnit}
          pressureUnit={units.pressureUnit}
          pressureSeries={airSeries}
        />
      ) : null}

      {airSeries.length ? (
        <DetailCard title="Air & consumption">
          {airSeries.map((s) => (
            <View key={s.label}>
              <Text style={[styles.airFrom, { color: s.color }]}>
                {airSeries.length > 1 ? `● ${s.label}` : `From ${s.label}`}
              </Text>
              <DetailRow
                label="Pressure"
                value={s.tank && (s.tank.startBar != null || s.tank.endBar != null)
                  ? `${s.tank.startBar != null ? formatPressure(s.tank.startBar, units.pressureUnit) : '—'} → ${s.tank.endBar != null ? formatPressure(s.tank.endBar, units.pressureUnit) : '—'}`
                  : ''}
              />
              <DetailRow label="SAC" value={s.analytics?.sacBarPerMin != null ? `${formatPressure(s.analytics.sacBarPerMin, units.pressureUnit)}/min` : ''} />
              <DetailRow label="RMV" value={s.analytics?.rmvLitersPerMin != null ? `${s.analytics.rmvLitersPerMin.toFixed(1)} L/min` : ''} />
            </View>
          ))}
          <DetailRow label="Gas used" value={gasUsedBar != null ? formatPressure(gasUsedBar, units.pressureUnit) : ''} />
          <DetailRow label="Free gas used" value={gasUsedLiters != null ? formatVolume(gasUsedLiters, units.gasVolumeUnit) : ''} />
        </DetailCard>
      ) : null}

      {analytics ? (
        <DetailCard title="Computer values">
          <DetailRow label="Max ascent rate" value={analytics.ascentRateMaxMPerMin != null ? `${analytics.ascentRateMaxMPerMin} m/min` : ''} />
          <DetailRow label="Sawtooth" value={analytics.sawtoothIndex ? `${analytics.sawtoothIndex} m extra descent` : ''} />
          <DetailRow label="Safety score" value={analytics.safetyScore != null ? `${analytics.safetyScore} / 100` : ''} />
          <DetailRow label="Deco model" value={analytics.decoModelType ? `${analytics.decoModelType.toUpperCase()}${analytics.gfLow != null ? ` ${analytics.gfLow}/${analytics.gfHigh}` : ''}` : ''} />
          <DetailRow label="Max ceiling" value={analytics.ceilingMaxMeters != null ? formatDepth(analytics.ceilingMaxMeters, units.depthUnit) : ''} />
          <DetailRow label="CNS" value={analytics.cnsEndPct != null ? `${Math.round(analytics.cnsEndPct)}%` : ''} />
        </DetailCard>
      ) : null}

      <LogsCard logs={logs} primaryLog={primaryLog} units={units} onShowLog={onShowLog} />

      <DetailCard title="Notes & tags">
        <DetailRow label="Rating" value={dive.rating ? '★'.repeat(dive.rating) : ''} />
        <DetailRow label="Types" value={dive.types.join(', ')} />
        <DetailRow label="Tags" value={dive.tags.join(', ')} />
        {dive.notes ? <Text style={styles.detailNotes}>{dive.notes}</Text> : null}
      </DetailCard>

      <Text style={styles.detailSource}>
        {logs.length
          ? `${logs.length} computer ${logs.length === 1 ? 'log' : 'logs'} attached`
          : dive.source === 'import' ? 'Imported from a file' : 'Logged manually'}
      </Text>
    </>
  );
}

// ---------------------------------------------------------------------------
// Edit view
// ---------------------------------------------------------------------------

function DiveEditForm({ form, units, onChange, error }) {
  const set = (key) => (value) => onChange({ ...form, [key]: value });
  const toggleType = (type) => onChange({
    ...form,
    types: form.types.includes(type) ? form.types.filter((item) => item !== type) : [...form.types, type],
  });
  const { depthUnit, pressureUnit, temperatureUnit, gasVolumeUnit } = units;

  return (
    <>
      <FormError message={error} />

      <FormSection title="When & where">
        <View style={styles.twoColumn}>
          <Field label="Date" value={form.date} onChangeText={set('date')} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" />
          <Field label="Time" value={form.time} onChangeText={set('time')} placeholder="HH:MM" keyboardType="numbers-and-punctuation" />
        </View>
        <View style={styles.twoColumn}>
          <Field label="Dive number" value={form.number} onChangeText={set('number')} keyboardType="number-pad" />
          <Field label="Operator / boat" value={form.operator} onChangeText={set('operator')} />
        </View>
        <Field label="Site name" value={form.siteName} onChangeText={set('siteName')} />
        <View style={styles.twoColumn}>
          <Field label="Location" value={form.location} onChangeText={set('location')} />
          <Field label="Country" value={form.country} onChangeText={set('country')} />
        </View>
        <View style={styles.twoColumn}>
          <Field label="Latitude" value={form.latitude} onChangeText={set('latitude')} keyboardType="numbers-and-punctuation" />
          <Field label="Longitude" value={form.longitude} onChangeText={set('longitude')} keyboardType="numbers-and-punctuation" />
        </View>
        <Field label="Buddies" value={form.buddies} onChangeText={set('buddies')} helper="Separate names with commas" />
      </FormSection>

      <FormSection title="Depths & time">
        <View style={styles.twoColumn}>
          <Field label="Max depth" value={form.maxDepth} onChangeText={set('maxDepth')} suffix={depthUnit} keyboardType="decimal-pad" />
          <Field label="Avg depth" value={form.avgDepth} onChangeText={set('avgDepth')} suffix={depthUnit} keyboardType="decimal-pad" />
        </View>
        <View style={styles.twoColumn}>
          <Field label="Duration" value={form.durationMin} onChangeText={set('durationMin')} suffix="min" keyboardType="decimal-pad" />
          <Field label="Surface interval" value={form.surfaceIntervalMin} onChangeText={set('surfaceIntervalMin')} suffix="min" keyboardType="decimal-pad" />
        </View>
      </FormSection>

      <FormSection title="Conditions">
        <ChoiceRow
          label="Water type"
          options={WATER_TYPES.map((type) => ({ key: type, label: WATER_TYPE_LABELS[type] }))}
          value={form.waterType}
          onChange={set('waterType')}
        />
        <View style={styles.twoColumn}>
          <Field label="Surface temp" value={form.tempSurface} onChangeText={set('tempSurface')} suffix={`°${temperatureUnit}`} keyboardType="numbers-and-punctuation" />
          <Field label="Min temp" value={form.tempMin} onChangeText={set('tempMin')} suffix={`°${temperatureUnit}`} keyboardType="numbers-and-punctuation" />
        </View>
        <Field label="Visibility" value={form.visibility} onChangeText={set('visibility')} suffix={depthUnit} keyboardType="decimal-pad" />
        <RatingRow value={form.rating} onChange={set('rating')} />
      </FormSection>

      <FormSection title="Gas & cylinder">
        <View style={styles.twoColumn}>
          <Field label="Oxygen" value={form.o2} onChangeText={set('o2')} suffix="%" keyboardType="decimal-pad" />
          <Field label="Helium" value={form.he} onChangeText={set('he')} suffix="%" keyboardType="decimal-pad" />
        </View>
        <View style={styles.twoColumn}>
          <Field label="Cylinder size" value={form.tankVolume} onChangeText={set('tankVolume')} suffix={gasVolumeUnit} keyboardType="decimal-pad" helper={gasVolumeUnit === 'ft³' ? 'Capacity at working pressure' : undefined} />
          <Field label="Working pressure" value={form.tankWorkPressure} onChangeText={set('tankWorkPressure')} suffix={pressureUnit} keyboardType="decimal-pad" />
        </View>
        <View style={styles.twoColumn}>
          <Field label="Start pressure" value={form.tankStart} onChangeText={set('tankStart')} suffix={pressureUnit} keyboardType="decimal-pad" />
          <Field label="End pressure" value={form.tankEnd} onChangeText={set('tankEnd')} suffix={pressureUnit} keyboardType="decimal-pad" />
        </View>
        <ChoiceRow
          label="Dive mode"
          options={DIVE_MODES.map((mode) => ({ key: mode, label: DIVE_MODE_LABELS[mode] }))}
          value={form.diveMode}
          onChange={set('diveMode')}
        />
      </FormSection>

      <FormSection title="Gear">
        <View style={styles.twoColumn}>
          <Field label="Weight" value={form.weight} onChangeText={set('weight')} suffix="kg" keyboardType="decimal-pad" />
          <Field label="Exposure suit" value={form.suit} onChangeText={set('suit')} />
        </View>
      </FormSection>

      <FormSection title="Notes & tags">
        <TagToggles label="Dive types" options={DIVE_TYPES} selected={form.types} onToggle={toggleType} />
        <Field label="Notes" value={form.notes} onChangeText={set('notes')} />
        <Field label="Tags" value={form.tags} onChangeText={set('tags')} helper="Separate tags with commas" />
      </FormSection>
    </>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function DiveLogScreen({ appSettings = {}, onBack }) {
  const insets = useSafeAreaInsets();
  const {
    loaded, rows, stats, trends, deletedCount, computerPriority, setComputerRank, folders, knownComputerKeys, pendingProposals,
    getDive, addDive, updateDive, deleteDive, deleteDives, importComputerLogs, finishImport, resolveProposal, clearProposals,
    recheckDuplicates, mergeDivesManual, splitDiveRecord, purgeDeletedDownloads, eraseAllDiveData, dumpDiagnostic,
    runHealthCheck, repairHealthProblems,
  } = useDiveLog();
  const [rechecking, setRechecking] = useState(false);

  // The dive-computer transfer runs in a module-level singleton, so it survives
  // leaving this screen. Each time a download settles (here, or in the
  // background) pull the new dives into the index and re-run cross-computer
  // reconciliation — split-dive detection, clock-offset merges, "Recorded by".
  // Edge-triggered: one run per settle, and again on remount if a background
  // download finished while this screen was gone.
  const download = useDiveComputerDownload();
  const handledDownloadRef = useRef(null);
  useEffect(() => {
    if (!loaded) return;
    const s = download.status;
    if (s !== 'done' && s !== 'error') { handledDownloadRef.current = null; return; }
    if (handledDownloadRef.current === s) return;
    handledDownloadRef.current = s;
    (async () => {
      try {
        await finishImport();
        await recheckDuplicates();
      } catch (e) {
        console.log('[dive-log] post-download reconcile failed:', e?.message);
      } finally {
        clearPendingReview();
      }
    })();
  }, [loaded, download.status, finishImport, recheckDuplicates]);

  const units = useMemo(() => ({
    depthUnit: appSettings.depthUnit === 'm' ? 'm' : 'ft',
    pressureUnit: appSettings.pressureUnit === 'bar' ? 'bar' : 'psi',
    temperatureUnit: appSettings.temperatureUnit === 'C' ? 'C' : 'F',
    gasVolumeUnit: appSettings.gasVolumeUnit === 'L' ? 'L' : 'ft³',
  }), [appSettings.depthUnit, appSettings.pressureUnit, appSettings.temperatureUnit, appSettings.gasVolumeUnit]);

  const libdcVersion = useMemo(() => getLibdivecomputerVersion(), []);

  const [view, setView] = useState('list');
  const [folderKey, setFolderKey] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  const foldersMode = useMemo(() => folders.some((f) => f.kind === 'computer'), [folders]);
  const activeFolder = useMemo(
    () => folders.find((f) => f.key === folderKey) || null,
    [folders, folderKey],
  );
  const listRows = activeFolder ? activeFolder.rows : rows;
  const showFolderGrid = foldersMode && !activeFolder;

  const exitSelect = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  // Leaving the list, or switching folders, drops any in-progress selection.
  useEffect(() => { exitSelect(); }, [view, folderKey, exitSelect]);

  // Surface the post-download match review once the panel closes; leave it when
  // every proposal has been resolved.
  useEffect(() => {
    if (view === 'list' && pendingProposals.length) setView('review');
    else if (view === 'review' && !pendingProposals.length) setView('list');
  }, [view, pendingProposals.length]);

  const toggleSelected = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const enterSelect = useCallback((id) => {
    setSelectMode(true);
    setSelectedIds(new Set(id ? [id] : []));
  }, []);

  const visibleIds = useMemo(() => listRows.map((r) => r.id), [listRows]);
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

  const toggleSelectAll = useCallback(() => {
    setSelectedIds(allSelected ? new Set() : new Set(visibleIds));
  }, [allSelected, visibleIds]);

  const handleDeleteSelected = useCallback(() => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    Alert.alert(
      `Delete ${ids.length} ${ids.length === 1 ? 'dive' : 'dives'}?`,
      'This removes them from your logbook on this device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => { await deleteDives(ids); exitSelect(); },
        },
      ],
    );
  }, [deleteDives, exitSelect, selectedIds]);

  const handleMergeSelected = useCallback(() => {
    const ids = [...selectedIds];
    if (ids.length < 2) return;
    Alert.alert(
      `Merge ${ids.length} dives into one?`,
      'Use this when these are really one dive recorded more than once. The computer logs stay; the dive counts once.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Merge', onPress: async () => { await mergeDivesManual(ids); exitSelect(); } },
      ],
    );
  }, [exitSelect, mergeDivesManual, selectedIds]);

  const [record, setRecord] = useState(null);   // the Dive
  const [logs, setLogs] = useState([]);          // its attached ComputerLogs
  const [shownLogId, setShownLogId] = useState(null); // user tapped a computer in "Recorded by"
  const [form, setForm] = useState(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // The log whose data the detail view shows: the user's pick, else the
  // highest-ranked computer, else the record's stored primary / longest.
  const primaryLog = useMemo(() => {
    if (shownLogId) {
      const picked = logs.find((l) => l.id === shownLogId);
      if (picked) return picked;
    }
    const rank = (dk) => {
      const i = computerPriority.indexOf(dk);
      return i === -1 ? 999 : i;
    };
    return [...logs].sort((a, b) => (
      rank(a.deviceKey) - rank(b.deviceKey) || (b.durationSeconds || 0) - (a.durationSeconds || 0)
    ))[0]
      || logs.find((l) => l.id === record?.primaryLogId)
      || null;
  }, [logs, record, shownLogId, computerPriority]);

  useEffect(() => {
    if (view !== 'detail' || !selectedId) return;
    let active = true;
    setRecord(null);
    setLogs([]);
    setShownLogId(null);
    getDive(selectedId).then((bundle) => {
      if (!active) return;
      setRecord(bundle?.dive || null);
      setLogs(bundle?.logs || []);
    });
    return () => { active = false; };
  }, [getDive, selectedId, view]);

  const openList = useCallback(() => {
    setView('list');
    setSelectedId(null);
    setRecord(null);
    setLogs([]);
    setForm(null);
    setFormError('');
  }, []);

  const openDetail = useCallback((id) => {
    setSelectedId(id);
    setView('detail');
  }, []);

  const openNew = useCallback(() => {
    setForm(blankForm());
    setRecord(null);
    setLogs([]);
    setSelectedId(null);
    setFormError('');
    setView('edit');
  }, []);

  const openEdit = useCallback(() => {
    if (!record) return;
    setForm(recordToForm(record, units));
    setFormError('');
    setView('edit');
  }, [record, units]);

  const handleBack = useCallback(() => {
    if (view === 'list' && selectMode) { exitSelect(); return; }
    if (view === 'edit') {
      if (selectedId) { setView('detail'); setForm(null); setFormError(''); }
      else openList();
      return;
    }
    if (view === 'detail' || view === 'download' || view === 'stats') { openList(); return; }
    if (view === 'review') { clearProposals(); openList(); return; }
    if (view === 'list' && activeFolder) { setFolderKey(null); return; }
    onBack?.();
  }, [activeFolder, clearProposals, exitSelect, onBack, openList, selectMode, selectedId, view]);

  const handleSave = useCallback(async () => {
    if (!form) return;
    const partial = formToRecordPartial(form, units);
    const candidate = selectedId && record
      ? normalizeDive({ ...record, ...partial, id: record.id, createdAt: record.createdAt })
      : createDive(partial);
    const error = validateDiveRecord(candidate);
    if (error) { setFormError(error); return; }

    setSaving(true);
    try {
      const saved = selectedId ? await updateDive(selectedId, partial) : await addDive(partial);
      const bundle = await getDive(saved.id);
      setRecord(bundle?.dive || saved);
      setLogs(bundle?.logs || []);
      setSelectedId(saved.id);
      setForm(null);
      setFormError('');
      setView('detail');
    } finally {
      setSaving(false);
    }
  }, [addDive, form, getDive, record, selectedId, units, updateDive]);

  const handleDelete = useCallback(() => {
    if (!selectedId) return;
    Alert.alert('Delete this dive?', 'This removes the dive from your logbook on this device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => { await deleteDive(selectedId); openList(); },
      },
    ]);
  }, [deleteDive, openList, selectedId]);

  const handleSplit = useCallback(() => {
    if (!selectedId || logs.length < 2) return;
    Alert.alert(
      'Split this dive by computer?',
      'Use this when the attached computer logs are not the same physical dive. They will stay separate during future duplicate checks.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Split — not the same dive', onPress: async () => { await splitDiveRecord(selectedId); openList(); } },
      ],
    );
  }, [logs.length, openList, selectedId, splitDiveRecord]);

  const headerTitle = view === 'edit'
    ? (selectedId ? 'Edit dive' : 'Log a dive')
    : view === 'detail'
      ? 'Dive details'
      : view === 'download'
        ? 'Dive computer'
        : view === 'review'
          ? 'Review matches'
          : view === 'stats'
            ? 'Stats'
            : (view === 'list' && activeFolder ? activeFolder.label : 'Dive Log');

  const canSelect = view === 'list' && loaded && !showFolderGrid && listRows.length > 0;
  const headerAction = selectMode
    ? <SecondaryButton label="Done" onPress={exitSelect} style={styles.headerButton} />
    : canSelect
      ? (
        <View style={styles.headerActions}>
          <SecondaryButton label="Select" onPress={() => enterSelect(null)} style={styles.headerButton} />
          <SecondaryButton label="Add" onPress={openNew} style={styles.headerButton} />
        </View>
      )
      : view === 'list' && loaded && rows.length
        ? <SecondaryButton label="Add" onPress={openNew} style={styles.headerButton} />
        : undefined;

  return (
    <View style={styles.screen}>
      <ScreenHeader eyebrow="DMZ SCUBA TOOLS" title={headerTitle} onBack={handleBack} action={headerAction} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {view !== 'download' && (download.status === 'downloading' || download.status === 'connecting') ? (
          <Pressable style={styles.dlBanner} onPress={() => setView('download')}>
            <View style={styles.dlBannerDot} />
            <Text style={styles.dlBannerText} numberOfLines={1}>
              {download.status === 'connecting'
                ? `Connecting to ${download.connectedDevice?.name || 'dive computer'}…`
                : `Downloading${download.connectedDevice ? ` from ${download.connectedDevice.name}` : ''}`
                  + (download.summary ? ` · ${download.summary.downloaded} read, ${download.summary.saved} new` : '…')}
            </Text>
            <Text style={styles.dlBannerCta}>View</Text>
          </Pressable>
        ) : null}

        {view === 'list' && (
          <>
            {!showFolderGrid ? (
              <SectionLabel>{activeFolder ? 'DIVES' : 'DIVE HISTORY'}</SectionLabel>
            ) : null}
            <Text style={styles.title}>
              {activeFolder
                ? (activeFolder.sublabel ? `${activeFolder.label} · ${activeFolder.sublabel}` : activeFolder.label)
                : showFolderGrid ? 'Your logbook.' : 'Every dive, on this device.'}
            </Text>
            {!activeFolder ? (
              <Text style={styles.subtitle}>
                {libdcVersion
                  ? 'Log dives by hand, or download them from a Bluetooth dive computer.'
                  : 'Log dives by hand now. Direct dive-computer download is coming next.'}
              </Text>
            ) : null}

            {!loaded ? (
              <Text style={styles.muted}>Loading your logbook…</Text>
            ) : showFolderGrid ? (
              <>
                <StatSummaryCard stats={stats} units={units} onPress={() => setView("stats")} />

                <View style={styles.gridSection}><SectionLabel>YOUR DIVES</SectionLabel></View>
                {folders.filter((f) => f.kind === 'all').map((folder) => (
                  <FolderCard key={folder.key} folder={folder} onPress={() => setFolderKey(folder.key)} />
                ))}

                <View style={styles.gridSection}><SectionLabel>BY COMPUTER</SectionLabel></View>
                {folders.filter((f) => f.kind !== 'all').map((folder) => (
                  <FolderCard
                    key={folder.key}
                    folder={folder}
                    onPress={() => setFolderKey(folder.key)}
                    onSetRank={setComputerRank}
                  />
                ))}
                <PrimaryButton label="Log a dive" onPress={openNew} style={styles.primaryCta} />
                {libdcVersion ? (
                  <>
                    <SecondaryButton
                      label="Download from dive computer"
                      onPress={() => setView('download')}
                      style={styles.downloadButton}
                    />
                    <Text style={styles.engineNote}>libdivecomputer {libdcVersion}</Text>
                  </>
                ) : null}
              </>
            ) : (
              <>
                {!activeFolder && !selectMode ? <StatSummaryCard stats={stats} units={units} onPress={() => setView("stats")} /> : null}
                {selectMode ? (
                  <SelectionBar
                    count={selectedIds.size}
                    total={listRows.length}
                    allSelected={allSelected}
                    onToggleAll={toggleSelectAll}
                    onDelete={handleDeleteSelected}
                    onMerge={handleMergeSelected}
                  />
                ) : null}
                {listRows.length === 0 ? (
                  <Card style={styles.emptyCard}>
                    <Text style={styles.emptyTitle}>No dives logged yet</Text>
                    <Text style={styles.emptyBody}>Add your first dive to start building your history and totals.</Text>
                  </Card>
                ) : (
                  listRows.map((row) => (
                    <DiveListCard
                      key={row.id}
                      row={row}
                      units={units}
                      selectable={selectMode}
                      selected={selectedIds.has(row.id)}
                      onPress={() => (selectMode ? toggleSelected(row.id) : openDetail(row.id))}
                      onLongPress={() => (selectMode ? toggleSelected(row.id) : enterSelect(row.id))}
                    />
                  ))
                )}
                {!selectMode ? <PrimaryButton label="Log a dive" onPress={openNew} style={styles.primaryCta} /> : null}
                {!selectMode && !activeFolder && libdcVersion ? (
                  <>
                    <SecondaryButton
                      label="Download from dive computer"
                      onPress={() => setView('download')}
                      style={styles.downloadButton}
                    />
                    <Text style={styles.engineNote}>libdivecomputer {libdcVersion}</Text>
                  </>
                ) : null}
              </>
            )}
          </>
        )}

        {view === 'download' && (
          <DiveComputerDownloadPanel onClose={() => setView('list')} />
        )}

        {view === 'review' && (
          <MatchReview
            proposals={pendingProposals}
            onResolve={resolveProposal}
            onDone={() => { clearProposals(); setView('list'); }}
          />
        )}

        {view === 'stats' && (
          <StatsView
            trends={trends}
            stats={stats}
            units={units}
            rechecking={rechecking}
            deletedCount={deletedCount}
            onPurge={() => {
              Alert.alert(
                `Purge ${deletedCount} deleted ${deletedCount === 1 ? 'dive' : 'dives'}?`,
                'Permanently removes soft-deleted dives and their computer logs, and clears the per-computer sync markers so they can be re-downloaded.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Purge', style: 'destructive', onPress: async () => { const n = await purgeDeletedDownloads(); Alert.alert('Purged', `Removed ${n} ${n === 1 ? 'dive' : 'dives'}.`); } },
                ],
              );
            }}
            onDiagnostic={async () => {
              try {
                const text = await dumpDiagnostic();
                await Share.share({ message: text });
              } catch (e) {
                Alert.alert('Diagnostic failed', e?.message || 'Could not build the report.');
              }
            }}
            onHealthCheck={async () => {
              try {
                const result = await runHealthCheck();
                const report = result.ok
                  ? 'Dive logbook health check: OK\nNo relationship or index problems found.'
                  : `Dive logbook health check: ${result.problems.length} problem(s)\n\n${result.problems.map((p) => `${p.code}${p.diveId ? ` dive=${p.diveId}` : ''}${p.logId ? ` log=${p.logId}` : ''}: ${p.detail}`).join('\n')}`;
                await Share.share({ message: report });
                if (!result.ok) {
                  Alert.alert('Logbook problems found', `${result.problems.length} problem(s) found. Repair the mechanically-fixable issues now?`, [
                    { text: 'Not now', style: 'cancel' },
                    { text: 'Repair', onPress: async () => {
                      const repaired = await repairHealthProblems();
                      Alert.alert(repaired.ok ? 'Repair complete' : 'Repair incomplete', repaired.ok
                        ? `Applied ${repaired.repaired} repair action(s).`
                        : `${repaired.problems.length} problem(s) still need attention.`);
                    } },
                  ]);
                }
              } catch (e) {
                Alert.alert('Health check failed', e?.message || 'Could not inspect the logbook.');
              }
            }}
            onEraseAll={() => {
              Alert.alert(
                'Erase the entire logbook?',
                'Deletes every dive, computer log, and sync marker on this device — including the v1 backup. Cannot be undone.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Erase everything', style: 'destructive', onPress: async () => { await eraseAllDiveData(); setView('list'); } },
                ],
              );
            }}
            onRecheck={async () => {
              setRechecking(true);
              try {
                const { proposals, fused, autoMerged } = await recheckDuplicates();
                if (proposals > 0) {
                  setView('review');
                } else {
                  const did = (fused || 0) + (autoMerged || 0);
                  Alert.alert(
                    did ? 'Merged' : 'No duplicates found',
                    did
                      ? `Combined ${did} ${did === 1 ? 'dive' : 'dives'} recorded by more than one computer. Nothing left to review.`
                      : 'Every dive looks unique.',
                  );
                }
              } finally {
                setRechecking(false);
              }
            }}
          />
        )}

        {view === 'detail' && (
          record ? (
            <>
              <DiveDetail dive={record} logs={logs} primaryLog={primaryLog} units={units} onShowLog={setShownLogId} />
              <View style={styles.detailActions}>
                <SecondaryButton label="Edit" onPress={openEdit} style={styles.detailActionButton} />
                {logs.length > 1 ? <SecondaryButton label="Split — not the same dive" onPress={handleSplit} style={styles.detailActionButton} /> : null}
                <SecondaryButton label="Delete" onPress={handleDelete} style={styles.detailActionButton} />
              </View>
            </>
          ) : (
            <Text style={styles.muted}>Loading dive…</Text>
          )
        )}

        {view === 'edit' && form && (
          <>
            <DiveEditForm form={form} units={units} onChange={setForm} error={formError} />
            <PrimaryButton label={saving ? 'Saving…' : 'Save dive'} onPress={handleSave} disabled={saving} style={styles.primaryCta} />
            <SecondaryButton label="Cancel" onPress={handleBack} style={styles.cancelButton} />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  content: { paddingHorizontal: spacing.md, paddingTop: spacing.lg },
  title: { color: colors.text, fontSize: 29, fontWeight: '900', letterSpacing: -0.7, lineHeight: 33 },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 21, marginBottom: spacing.lg, marginTop: 9 },
  muted: { color: colors.muted, fontSize: 13, marginTop: spacing.md },
  headerButton: { minHeight: 40, minWidth: 40, paddingHorizontal: 12, paddingVertical: 8 },

  summaryCard: { backgroundColor: '#0B2838', borderColor: 'rgba(112,221,246,.28)' },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  statCell: { flexBasis: '47%', flexGrow: 1 },
  summaryFootnote: { color: colors.faint, fontSize: 11, marginTop: 12 },
  summaryLink: { color: colors.cyan, fontSize: 12, fontWeight: '800', marginTop: 10 },
  trendRow: { alignItems: 'center', borderTopColor: colors.line, borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9 },
  trendLabel: { color: colors.muted, fontSize: 12 },
  trendGood: { color: colors.good, fontSize: 12, fontWeight: '800' },
  trendBad: { color: colors.warning, fontSize: 12, fontWeight: '800' },
  trendFlat: { color: colors.faint, fontSize: 12, fontWeight: '700' },

  diveCard: { padding: 12 },
  diveCardAll: { borderColor: colors.cyan, borderWidth: 1 },
  diveCardSelected: { borderColor: colors.cyan },
  gridSection: { marginTop: 6 },
  diveCardButton: { alignItems: 'flex-start', minHeight: 40, paddingVertical: 9 },
  diveCardMeta: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  diveCardMetaText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  diveCardRating: { color: colors.gold, fontSize: 12 },
  folderSerial: { color: colors.faint, fontSize: 11, fontWeight: '700', marginLeft: 2, marginTop: 3 },
  pressed: { opacity: 0.6 },

  headerActions: { flexDirection: 'row', gap: 8 },
  selectRow: { alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 40, paddingVertical: 9 },
  selectRowLabel: { color: colors.text, flex: 1, fontSize: 13, fontWeight: '700' },
  checkCircle: {
    alignItems: 'center', borderColor: colors.lineStrong, borderRadius: radii.pill, borderWidth: 2,
    height: 24, justifyContent: 'center', width: 24,
  },
  checkCircleOn: { backgroundColor: colors.cyan, borderColor: colors.cyan },
  checkMark: { color: colors.black, fontSize: 14, fontWeight: '900' },

  selectionBar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', padding: 12 },
  selectionToggle: { paddingVertical: 6 },
  selectionToggleText: { color: colors.cyan, fontSize: 13, fontWeight: '800' },
  selectionDelete: {
    backgroundColor: 'rgba(255,127,127,0.12)', borderColor: 'rgba(255,127,127,0.4)', borderRadius: radii.sm,
    borderWidth: 1, paddingHorizontal: 14, paddingVertical: 8,
  },
  selectionDeleteOff: { opacity: 0.4 },
  selectionDeleteText: { color: colors.danger, fontSize: 13, fontWeight: '800' },
  selectionDeleteTextOff: { color: colors.muted },
  selectionRight: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  selectionMerge: {
    backgroundColor: 'rgba(112,221,246,0.12)', borderColor: 'rgba(112,221,246,0.4)', borderRadius: radii.sm,
    borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8,
  },
  selectionMergeText: { color: colors.cyan, fontSize: 13, fontWeight: '800' },

  emptyCard: { alignItems: 'center', paddingVertical: 26 },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  emptyBody: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 6, textAlign: 'center' },

  primaryCta: { marginTop: 8 },
  downloadButton: { marginTop: 10 },
  dlBanner: {
    alignItems: 'center',
    backgroundColor: 'rgba(112,226,163,0.1)',
    borderColor: 'rgba(112,226,163,0.35)',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    marginBottom: 14,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  dlBannerDot: { backgroundColor: colors.good, borderRadius: 4, height: 8, width: 8 },
  dlBannerText: { color: colors.text, flex: 1, fontSize: 12, fontWeight: '700' },
  dlBannerCta: { color: colors.good, fontSize: 12, fontWeight: '900' },

  reviewCard: { borderColor: 'rgba(112,221,246,.28)', gap: 4, marginTop: 12 },
  reviewTitle: { color: colors.text, fontSize: 15, fontWeight: '900' },
  reviewBody: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  reviewStrong: { color: colors.text, fontWeight: '800' },
  reviewMeta: { color: colors.faint, fontSize: 11, marginTop: 4 },
  reviewWarn: { color: colors.warning, fontSize: 12, fontWeight: '700', lineHeight: 17, marginTop: 8 },
  reviewQuestion: { color: colors.text, fontSize: 12, fontWeight: '800', marginTop: 10 },
  reviewActions: { flexDirection: 'row', gap: 9, marginTop: 8 },
  reviewButton: { flex: 1 },
  reviewSkip: { alignItems: 'center', marginTop: 10 },
  reviewSkipText: { color: colors.cyan, fontSize: 12, fontWeight: '700' },
  engineNote: { color: colors.faint, fontSize: 11, marginTop: 12, textAlign: 'center' },
  cancelButton: { marginTop: 10 },

  detailCard: {},
  detailCardTitle: { color: colors.text, fontSize: 15, fontWeight: '900', marginBottom: 6 },
  detailRow: { borderTopColor: colors.line, borderTopWidth: 1, flexDirection: 'row', gap: 12, justifyContent: 'space-between', paddingVertical: 9 },
  detailRowLabel: { color: colors.muted, fontSize: 12, flexShrink: 0 },
  detailRowValue: { color: colors.text, flex: 1, fontSize: 13, fontWeight: '700', textAlign: 'right' },
  detailNotes: { borderTopColor: colors.line, borderTopWidth: 1, color: colors.text, fontSize: 13, lineHeight: 20, marginTop: 4, paddingTop: 9 },
  detailSource: { color: colors.faint, fontSize: 11, marginBottom: 8, marginTop: 4, textAlign: 'center' },
  detailActions: { flexDirection: 'row', gap: 10, marginTop: 6 },
  detailActionButton: { flex: 1 },
  detailShownFrom: { color: colors.cyan, fontSize: 11, fontWeight: '700', marginBottom: 8 },
  airFrom: { fontSize: 11, fontWeight: '800', marginTop: 8 },
  logRow: { borderTopColor: colors.line, borderRadius: 8, borderTopWidth: 1, paddingHorizontal: 6, paddingVertical: 9 },
  logRowShown: { backgroundColor: 'rgba(112,221,246,0.07)' },
  logRowMain: { alignItems: 'baseline', flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
  logRowName: { color: colors.text, fontSize: 13, fontWeight: '800' },
  logRowNameShown: { color: colors.cyan },
  logRowSerial: { color: colors.faint, fontSize: 10, fontWeight: '700' },
  logRowMeta: { color: colors.muted, fontSize: 11, marginTop: 3 },

  folderTopRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  folderNameButton: { flex: 1 },
  rankChip: { borderColor: colors.lineStrong, borderRadius: radii.pill, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
  rankChipOn: { backgroundColor: 'rgba(112,221,246,0.12)', borderColor: colors.cyan },
  rankChipText: { color: colors.faint, fontSize: 11, fontWeight: '800' },
  rankChipTextOn: { color: colors.cyan },

  chartRow: { flexDirection: 'row', marginTop: 6 },
  chartAxis: { width: 30 },
  chartAxisText: { color: colors.faint, fontSize: 8, fontWeight: '800', position: 'absolute', right: 4 },
  chartPressureAxis: { width: 30 },
  chartPressureText: { color: colors.gold, fontSize: 8, fontWeight: '800', left: 4, position: 'absolute' },
  chartLegend: { flexDirection: 'row', gap: 16, marginLeft: 30, marginTop: 8 },
  legendItem: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  legendSwatch: { borderRadius: 2, height: 3, width: 14 },
  legendText: { color: colors.muted, fontSize: 10, fontWeight: '700' },

  formCard: {},
  formCardTitle: { color: colors.cyan, fontSize: 11, fontWeight: '900', letterSpacing: 1.2, marginBottom: 12, textTransform: 'uppercase' },
  field: { flexGrow: 1, flexBasis: '46%', marginBottom: 12 },
  fieldLabel: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.4, marginBottom: 6, textTransform: 'uppercase' },
  inputShell: { alignItems: 'center', backgroundColor: colors.backgroundRaised, borderColor: colors.lineStrong, borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', minHeight: 47, paddingHorizontal: 11 },
  input: { color: colors.text, flex: 1, fontSize: 16, fontWeight: '700', paddingVertical: 10 },
  inputSuffix: { color: colors.cyan, fontSize: 11, fontWeight: '800', marginLeft: 7 },
  fieldHelper: { color: colors.faint, fontSize: 10, lineHeight: 14, marginTop: 4 },
  twoColumn: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  choiceRow: { gap: 7, paddingBottom: 2 },
  choice: { minHeight: 40, paddingHorizontal: 12, paddingVertical: 8 },
  tagWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  tag: { minHeight: 38, paddingHorizontal: 11, paddingVertical: 7 },
  ratingRow: { flexDirection: 'row', gap: 7 },
  ratingStar: { minHeight: 42, minWidth: 46, paddingHorizontal: 8, paddingVertical: 8 },
});
