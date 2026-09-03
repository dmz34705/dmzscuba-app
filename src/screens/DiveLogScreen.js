import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Keyboard,
  Pressable,
  ScrollView,
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
import useDiveLog from '../features/diveLog/useDiveLog';
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

function ProfileChart({ samples, maxDepthMeters, depthUnit }) {
  const { width } = useWindowDimensions();
  const chartWidth = Math.max(200, width - spacing.md * 2 - 30 - 30);
  const chartHeight = 150;
  const geometry = useMemo(
    () => buildLogProfileGeometry(samples, chartWidth, chartHeight, { maxDepthMeters }),
    [chartWidth, samples, maxDepthMeters],
  );
  if (!geometry.linePath) return null;

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
          {geometry.timeTicks.map((tick) => (
            <SvgText key={`tl-${tick.seconds}`} x={tick.x} y={chartHeight + 12} fill={colors.faint} fontSize="8" fontWeight="700" textAnchor="middle">
              {`${Math.round(tick.seconds / 60)}m`}
            </SvgText>
          ))}
        </Svg>
      </View>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// List view
// ---------------------------------------------------------------------------

function StatSummaryCard({ stats, units }) {
  return (
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
    </Card>
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

function FolderCard({ folder, onPress }) {
  const bits = [`${folder.count} ${folder.count === 1 ? 'dive' : 'dives'}`];
  if (folder.lastDiveDate) bits.push(`last ${formatDate(folder.lastDiveDate)}`);
  return (
    <Card style={styles.diveCard}>
      <SecondaryButton label={folder.label} onPress={onPress} style={styles.diveCardButton} />
      {folder.sublabel ? <Text style={styles.folderSerial}>{folder.sublabel}</Text> : null}
      <View style={styles.diveCardMeta}>
        <Text style={styles.diveCardMetaText}>{bits.join('  ·  ')}</Text>
      </View>
    </Card>
  );
}

function SelectionBar({ count, total, allSelected, onToggleAll, onDelete }) {
  return (
    <Card style={styles.selectionBar}>
      <Pressable onPress={onToggleAll} hitSlop={8} style={({ pressed }) => [styles.selectionToggle, pressed && styles.pressed]}>
        <Text style={styles.selectionToggleText}>{allSelected ? 'Deselect all' : `Select all (${total})`}</Text>
      </Pressable>
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
    </Card>
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

function LogsCard({ logs, primaryLog, units }) {
  if (!logs.length) return null;
  return (
    <Card style={styles.detailCard}>
      <Text style={styles.detailCardTitle}>Recorded by</Text>
      {logs.map((log) => {
        const name = `${log.device.vendor} ${log.device.product}`.trim() || 'Dive computer';
        const bits = [formatDepth(log.water.maxDepthMeters, units.depthUnit), formatDuration(log.durationSeconds)];
        if (log.timeCorrectionMinutes) {
          const sign = log.timeCorrectionMinutes > 0 ? '+' : '−';
          const abs = Math.abs(log.timeCorrectionMinutes);
          bits.push(`clock ${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, '0')}`);
        }
        return (
          <View key={log.id} style={styles.logRow}>
            <View style={styles.logRowMain}>
              <Text style={styles.logRowName}>
                {name}{log.id === primaryLog?.id ? '  ·  primary' : ''}
              </Text>
              {log.device.serial ? <Text style={styles.logRowSerial}>SN {log.device.serial}</Text> : null}
            </View>
            <Text style={styles.logRowMeta}>{bits.join('  ·  ')}</Text>
          </View>
        );
      })}
    </Card>
  );
}

function DiveDetail({ dive, logs = [], primaryLog, units }) {
  const mix = dive.gas.mixes[0];
  const tank = dive.gas.tanks[0];
  const samples = primaryLog?.profile?.samples || [];
  const analytics = primaryLog?.analytics;
  return (
    <>
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
        <DetailRow label="Max depth" value={formatDepth(dive.water.maxDepthMeters, units.depthUnit)} />
        <DetailRow label="Avg depth" value={dive.water.avgDepthMeters != null ? formatDepth(dive.water.avgDepthMeters, units.depthUnit) : ''} />
        <DetailRow label="Duration" value={formatDuration(dive.durationSeconds)} />
        <DetailRow label="Surface interval" value={dive.surfaceIntervalSeconds != null ? formatDuration(dive.surfaceIntervalSeconds) : ''} />
      </DetailCard>

      <DetailCard title="Conditions">
        <DetailRow label="Water" value={dive.water.type ? WATER_TYPE_LABELS[dive.water.type] : ''} />
        <DetailRow label="Surface temp" value={dive.water.tempSurfaceC != null ? formatTemperature(dive.water.tempSurfaceC, units.temperatureUnit) : ''} />
        <DetailRow label="Min temp" value={dive.water.tempMinC != null ? formatTemperature(dive.water.tempMinC, units.temperatureUnit) : ''} />
        <DetailRow label="Visibility" value={dive.water.visibilityMeters != null ? formatDepth(dive.water.visibilityMeters, units.depthUnit) : ''} />
      </DetailCard>

      <DetailCard title="Gas & equipment">
        <DetailRow label="Mix" value={mix ? formatGasLabel(mix) : ''} />
        <DetailRow label="Dive mode" value={dive.diveMode ? DIVE_MODE_LABELS[dive.diveMode] : ''} />
        <DetailRow label="Cylinder" value={tank?.volumeLiters != null ? formatVolume(tank.volumeLiters, units.gasVolumeUnit, tank.workPressureBar) : ''} />
        <DetailRow label="Working pressure" value={tank?.workPressureBar != null ? formatPressure(tank.workPressureBar, units.pressureUnit) : ''} />
        <DetailRow
          label="Pressure"
          value={tank && (tank.startBar != null || tank.endBar != null)
            ? `${tank.startBar != null ? formatPressure(tank.startBar, units.pressureUnit) : '—'} → ${tank.endBar != null ? formatPressure(tank.endBar, units.pressureUnit) : '—'}`
            : ''}
        />
        <DetailRow label="Weight" value={dive.gear.weightKg != null ? formatWeight(dive.gear.weightKg, 'kg') : ''} />
        <DetailRow label="Exposure suit" value={dive.gear.exposureSuit} />
      </DetailCard>

      {samples.length ? <ProfileChart samples={samples} maxDepthMeters={dive.water.maxDepthMeters} depthUnit={units.depthUnit} /> : null}

      {analytics ? (
        <DetailCard title="Computer values">
          <DetailRow label="SAC" value={analytics.sacBarPerMin != null ? `${formatPressure(analytics.sacBarPerMin, units.pressureUnit)}/min` : ''} />
          <DetailRow label="RMV" value={analytics.rmvLitersPerMin != null ? formatVolume(analytics.rmvLitersPerMin, units.gasVolumeUnit, tank?.workPressureBar) + '/min' : ''} />
          <DetailRow label="Max ascent rate" value={analytics.ascentRateMaxMPerMin != null ? `${analytics.ascentRateMaxMPerMin} m/min` : ''} />
          <DetailRow label="Sawtooth" value={analytics.sawtoothIndex ? `${analytics.sawtoothIndex} m extra descent` : ''} />
          <DetailRow label="Deco model" value={analytics.decoModelType ? `${analytics.decoModelType.toUpperCase()}${analytics.gfLow != null ? ` ${analytics.gfLow}/${analytics.gfHigh}` : ''}` : ''} />
          <DetailRow label="Max ceiling" value={analytics.ceilingMaxMeters != null ? formatDepth(analytics.ceilingMaxMeters, units.depthUnit) : ''} />
          <DetailRow label="CNS" value={analytics.cnsEndPct != null ? `${Math.round(analytics.cnsEndPct)}%` : ''} />
        </DetailCard>
      ) : null}

      <LogsCard logs={logs} primaryLog={primaryLog} units={units} />

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
  const { loaded, rows, stats, folders, knownComputerKeys, getDive, addDive, updateDive, deleteDive, deleteDives, importComputerLog } = useDiveLog();

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
  const [record, setRecord] = useState(null);   // the Dive
  const [logs, setLogs] = useState([]);          // its attached ComputerLogs
  const [form, setForm] = useState(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const primaryLog = useMemo(
    () => logs.find((l) => l.id === record?.primaryLogId) || logs[0] || null,
    [logs, record],
  );

  useEffect(() => {
    if (view !== 'detail' || !selectedId) return;
    let active = true;
    setRecord(null);
    setLogs([]);
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
    if (view === 'detail' || view === 'download') { openList(); return; }
    if (view === 'list' && activeFolder) { setFolderKey(null); return; }
    onBack?.();
  }, [activeFolder, exitSelect, onBack, openList, selectMode, selectedId, view]);

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

  const headerTitle = view === 'edit'
    ? (selectedId ? 'Edit dive' : 'Log a dive')
    : view === 'detail'
      ? 'Dive details'
      : view === 'download'
        ? 'Dive computer'
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
        {view === 'list' && (
          <>
            <SectionLabel>{activeFolder ? 'DIVES' : 'DIVE HISTORY'}</SectionLabel>
            <Text style={styles.title}>
              {activeFolder
                ? (activeFolder.sublabel ? `${activeFolder.label} · ${activeFolder.sublabel}` : activeFolder.label)
                : showFolderGrid ? 'Your dive computers.' : 'Every dive, on this device.'}
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
                <StatSummaryCard stats={stats} units={units} />
                {folders.map((folder) => (
                  <FolderCard key={folder.key} folder={folder} onPress={() => setFolderKey(folder.key)} />
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
                {!activeFolder && !selectMode ? <StatSummaryCard stats={stats} units={units} /> : null}
                {selectMode ? (
                  <SelectionBar
                    count={selectedIds.size}
                    total={listRows.length}
                    allSelected={allSelected}
                    onToggleAll={toggleSelectAll}
                    onDelete={handleDeleteSelected}
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
          <DiveComputerDownloadPanel
            onClose={() => setView('list')}
            knownComputerKeys={knownComputerKeys}
            importComputerLog={importComputerLog}
          />
        )}

        {view === 'detail' && (
          record ? (
            <>
              <DiveDetail dive={record} logs={logs} primaryLog={primaryLog} units={units} />
              <View style={styles.detailActions}>
                <SecondaryButton label="Edit" onPress={openEdit} style={styles.detailActionButton} />
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

  diveCard: { padding: 12 },
  diveCardSelected: { borderColor: colors.cyan },
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

  emptyCard: { alignItems: 'center', paddingVertical: 26 },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  emptyBody: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 6, textAlign: 'center' },

  primaryCta: { marginTop: 8 },
  downloadButton: { marginTop: 10 },
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
  logRow: { borderTopColor: colors.line, borderTopWidth: 1, paddingVertical: 9 },
  logRowMain: { alignItems: 'baseline', flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
  logRowName: { color: colors.text, fontSize: 13, fontWeight: '800' },
  logRowSerial: { color: colors.faint, fontSize: 10, fontWeight: '700' },
  logRowMeta: { color: colors.muted, fontSize: 11, marginTop: 3 },

  chartRow: { flexDirection: 'row', marginTop: 6 },
  chartAxis: { width: 30 },
  chartAxisText: { color: colors.faint, fontSize: 8, fontWeight: '800', position: 'absolute', right: 4 },

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
