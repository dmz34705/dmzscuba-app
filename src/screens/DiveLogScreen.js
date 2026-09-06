import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Keyboard,
  Modal,
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
import * as ImagePicker from 'expo-image-picker';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { ScreenHeader, SectionLabel } from '../components/AppShell';
import { FormError } from '../components/AccountForm';
import { Card, PrimaryButton, SecondaryButton, Stat } from '../components/Ui';
import useDiveLog, { ALL_DIVES_KEY } from '../features/diveLog/useDiveLog';
import useDiveListSort from '../features/diveLog/useDiveListSort';
import { NUMBER_KEYBOARD_ACCESSORY_ID, usesNumberKeyboard } from '../lib/numberKeyboard';
import { screenOrientation as ScreenOrientation } from '../lib/screenOrientation';
import {
  DIVE_MODES,
  DIVE_TYPES,
  WATER_TYPES,
  createDive,
  defaultGasLabel,
  mergeGas,
  normalizeDive,
} from '../lib/diveLog/schema';
import {
  DEFAULT_DIVE_FILTER,
  countActiveFilters,
  filterDiveRows,
  sanitizeDiveFilter,
} from '../lib/diveLog/filterDives';
import { describeDiveSort, sortDiveRows } from '../lib/diveLog/sortDives';
import {
  averageDepth,
  combinedConsumption,
  surfaceConsumption,
  tankPressuresFromSamples,
} from '../lib/diveLog/logAnalytics';
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
  formatTimeOfDay,
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
import { findDivePhotoMatches, photoCapturedAt } from '../lib/diveLog/photoMatching';
import { hiddenDataSections, sectionIsVisible } from '../lib/diveLog/diveModeFields';
import { getLibdivecomputerVersion } from '../../modules/dive-computer-bridge';
import { DEFAULT_PROFILE_COLORS } from '../lib/appSettings';
import DiveComputerDownloadPanel from '../features/diveComputerDownload/DiveComputerDownloadPanel';
import useDiveComputerDownload from '../features/diveComputerDownload/useDiveComputerDownload';
import DiveShareCardScreen from '../features/diveShareCard/DiveShareCardScreen';
import DiveFilterSheet from '../features/diveLog/DiveFilterSheet';
import { clearPendingReview } from '../features/diveComputerDownload/downloadReviewFlag';
import { colors, radii, shadow, spacing } from '../theme';
import { shareLogbookExport } from '../features/diveLog/shareLogbookExport';

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
    tempMax: '',
    visibility: '',
    // Always at least one cylinder: its mix doubles as the dive's gas even
    // when no pressures were recorded, so there is always something to label
    // the dive with.
    cylinders: [blankCylinder()],
    weight: '',
    suit: '',
    diveMode: '',
    types: [],
    rating: 0,
    notes: '',
    tags: '',
  };
}

export function blankCylinder() {
  return { o2: '21', he: '0', volume: '', workPressure: '', start: '', end: '' };
}

function recordToForm(record, units) {
  const mixes = record.gas.mixes.length ? record.gas.mixes : [{ o2: 0.21, he: 0 }];
  // One editable cylinder per stored tank, each carrying the mix it points at.
  // A dive with a mix but no cylinder still gets a row, so its gas is editable.
  const cylinders = (record.gas.tanks.length ? record.gas.tanks : [null]).map((tank, index) => {
    const mix = mixes[tank?.mixIndex ?? index] || mixes[0];
    return {
      o2: String(Math.round(mix.o2 * 100)),
      he: String(Math.round(mix.he * 100)),
      volume: volumeToInput(tank?.volumeLiters, units.gasVolumeUnit, tank?.workPressureBar),
      workPressure: pressureToInput(tank?.workPressureBar, units.pressureUnit),
      start: pressureToInput(tank?.startBar, units.pressureUnit),
      end: pressureToInput(tank?.endBar, units.pressureUnit),
    };
  });
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
    tempMax: temperatureToInput(record.water.tempMaxC, units.temperatureUnit),
    visibility: depthToInput(record.water.visibilityMeters, units.depthUnit),
    cylinders: cylinders.length ? cylinders : [blankCylinder()],
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
  // Each cylinder carries its own mix, but two cylinders of the same gas are
  // one mix on the record — otherwise a twinset would report "Air" twice and
  // double-count in the gas-mix trends.
  const mixes = [];
  const mixIndexOf = (o2Fraction, heFraction) => {
    const found = mixes.findIndex((entry) => entry.o2 === o2Fraction && entry.he === heFraction);
    if (found !== -1) return found;
    mixes.push({ o2: o2Fraction, he: heFraction, label: defaultGasLabel(o2Fraction, heFraction) });
    return mixes.length - 1;
  };

  const cylinders = Array.isArray(form.cylinders) && form.cylinders.length ? form.cylinders : [blankCylinder()];
  const tanks = [];
  for (const cylinder of cylinders) {
    const o2 = parseNumberInput(cylinder.o2);
    const he = parseNumberInput(cylinder.he);
    const mixIndex = mixIndexOf(o2 == null ? 0.21 : o2 / 100, he == null ? 0 : he / 100);

    const startBar = parsePressureInput(cylinder.start, units.pressureUnit);
    const endBar = parsePressureInput(cylinder.end, units.pressureUnit);
    const workPressureBar = parsePressureInput(cylinder.workPressure, units.pressureUnit);
    // In imperial units the cylinder "size" is a gas capacity that only
    // converts to a water volume once we know the working pressure, so parse
    // that first.
    const volumeLiters = parseVolumeInput(cylinder.volume, units.gasVolumeUnit, workPressureBar);
    if (startBar == null && endBar == null && volumeLiters == null && workPressureBar == null) continue;
    tanks.push({ volumeLiters, workPressureBar, startBar, endBar, mixIndex });
  }

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
      tempMaxC: parseTemperatureInput(form.tempMax, units.temperatureUnit),
      visibilityMeters: parseDepthInput(form.visibility, units.depthUnit),
    },
    gas: { mixes, tanks },
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

function ProfileMetric({ label, value, accent = colors.text, style }) {
  if (!value) return null;
  return (
    <View style={[styles.profileMetric, style]}>
      <Text style={styles.profileMetricLabel}>{label}</Text>
      <Text style={[styles.profileMetricValue, { color: accent }]}>{value}</Text>
    </View>
  );
}

function nearestSampleAt(samples, seconds) {
  if (!samples?.length) return null;
  let low = 0;
  let high = samples.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (samples[mid].t < seconds) low = mid + 1;
    else high = mid;
  }
  const after = samples[low];
  const before = samples[Math.max(0, low - 1)];
  return Math.abs((before?.t ?? Infinity) - seconds) <= Math.abs((after?.t ?? Infinity) - seconds)
    ? before
    : after;
}

function profilePointAtX(points, x) {
  if (!points?.length) return null;
  let low = 0;
  let high = points.length - 1;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (points[mid].x < x) low = mid + 1;
    else high = mid;
  }
  const after = points[low];
  const before = points[Math.max(0, low - 1)];
  if (!before || before === after || after.x === before.x) return { ...after, x };
  const ratio = Math.max(0, Math.min(1, (x - before.x) / (after.x - before.x)));
  return {
    x,
    t: before.t + (after.t - before.t) * ratio,
    depth: before.depth + (after.depth - before.depth) * ratio,
    y: before.y + (after.y - before.y) * ratio,
  };
}

function formatProfileTime(seconds) {
  const total = Math.max(0, Math.round(seconds || 0));
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, '0')}`;
}

function ScrubValue({ label, value, color = colors.text, compact = false }) {
  return (
    <View style={[styles.scrubValue, compact && styles.scrubValueCompact]}>
      <Text style={styles.scrubValueLabel}>{label}</Text>
      <Text numberOfLines={1} style={[styles.scrubValueText, { color }]}>{value}</Text>
    </View>
  );
}

function ProfileChart({ samples, maxDepthMeters, depthUnit, pressureUnit, temperatureUnit, pressureSeries = [], availableWidth = null, fullscreen = false, onExpand, onClose, showTemperature = true, showPressure = true, showOxygen = true, onOverlayChange, headerDetails = null, chartColors = DEFAULT_PROFILE_COLORS, lineWidth = 2.75 }) {
  const { width, height } = useWindowDimensions();
  const contentWidth = Math.max(240, availableWidth != null ? availableWidth - spacing.md * 2 : width - spacing.md * 4);
  const chartWidth = contentWidth;
  // Landscape phones have much less usable vertical space than their pixel
  // dimensions suggest. Keep the plot inside the modal instead of letting the
  // card clip its bottom edge below the safe area.
  const chartHeight = fullscreen ? Math.max(150, Math.min(260, height - 230)) : 204;
  const geometry = useMemo(
    () => buildLogProfileGeometry(samples, chartWidth, chartHeight, { maxDepthMeters }),
    [chartWidth, samples, maxDepthMeters],
  );
  const { maxBar, airPaths } = useMemo(() => {
    const withAir = pressureSeries.filter((series) => (series.samples || []).some((sample) => sample?.pressureBar > 0));
    const maxPressure = Math.max(0, ...withAir.flatMap((series) => (series.samples || []).map((sample) => sample?.pressureBar || 0)));
    return {
      maxBar: maxPressure,
      airPaths: withAir.map((series) => ({
        ...series,
        pressureSamples: (series.samples || []).filter((sample) => Number.isFinite(sample?.t) && Number.isFinite(sample?.pressureBar)),
        path: geometry.pressureOverlay?.(series.samples, maxPressure) || '',
      })).filter((series) => series.path),
    };
  }, [geometry, pressureSeries]);
  const temperatureSamples = useMemo(
    () => (samples || []).filter((sample) => Number.isFinite(sample?.t) && Number.isFinite(sample?.tempC)),
    [samples],
  );
  const [scrubX, setScrubX] = useState(null);
  const touchOriginRef = useRef(null);

  const handleScrub = useCallback((event) => {
    const x = Math.max(0, Math.min(chartWidth, event.nativeEvent.locationX));
    setScrubX(x);
  }, [chartWidth]);

  const shouldStartHorizontalScrub = useCallback((event) => {
    const origin = touchOriginRef.current;
    if (!origin) return false;
    const dx = Math.abs(event.nativeEvent.pageX - origin.x);
    const dy = Math.abs(event.nativeEvent.pageY - origin.y);
    return dx > 4 && dx > dy;
  }, []);

  if (!geometry.linePath) return null;

  const scrubPoint = scrubX == null ? null : profilePointAtX(geometry.points, scrubX);
  const profileOrigin = geometry.points[0]?.t || 0;
  const selectedSeconds = scrubPoint?.t ?? null;
  const selectedTemperature = selectedSeconds == null
    ? null
    : nearestSampleAt(temperatureSamples, selectedSeconds)?.tempC;
  // Nearest recorded ppO2 to the scrub position, same as temperature. Reads
  // from the geometry's own points so it stays on the scale the trace is drawn
  // against.
  const selectedPpo2 = selectedSeconds == null
    ? null
    : nearestSampleAt(geometry.ppo2Points.map((p) => ({ t: p.t, ppo2: p.v })), selectedSeconds)?.ppo2 ?? null;
  const selectedPressures = selectedSeconds == null ? [] : airPaths.map((series) => ({
    ...series,
    pressureBar: nearestSampleAt(series.pressureSamples, selectedSeconds)?.pressureBar,
  })).filter((series) => Number.isFinite(series.pressureBar));

  return (
    <Card style={[styles.profileCard, fullscreen && styles.profileCardFullscreen]}>
      <View style={[styles.profileHeader, fullscreen && styles.profileHeaderFullscreen]}>
        <View>
          <Text style={styles.profileEyebrow}>DIVE PROFILE</Text>
          <Text style={styles.profileTitle}>Depth over time</Text>
        </View>
        {headerDetails ? <View style={styles.profileHeaderDetails}>{headerDetails}</View> : null}
        <View style={styles.profileHeaderActions}>
          {!fullscreen ? <Text style={styles.profileDuration}>{formatDuration(geometry.durationSeconds)}</Text> : null}
          {onExpand ? (
            <Pressable accessibilityLabel="Expand dive profile" accessibilityRole="button" hitSlop={8} onPress={onExpand} style={({ pressed }) => [styles.expandButton, pressed && styles.pressed]}>
              <Text style={styles.expandIcon}>⛶</Text>
            </Pressable>
          ) : null}
          {onClose ? (
            <Pressable accessibilityLabel="Close full-screen profile" accessibilityRole="button" hitSlop={8} onPress={onClose} style={({ pressed }) => [styles.fullscreenClose, pressed && styles.pressed]}>
              <Text style={styles.fullscreenCloseText}>✕</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
      {onOverlayChange ? (
        <View style={styles.overlayControls}>
          <Text style={styles.overlayControlsLabel}>OVERLAYS</Text>
          <Pressable accessibilityRole="button" onPress={() => onOverlayChange('temperature')} style={[styles.overlayToggle, showTemperature && styles.overlayToggleActive]}>
          <View style={[styles.overlayDot, { backgroundColor: chartColors.temperature }]} />
            <Text style={[styles.overlayToggleText, showTemperature && styles.overlayToggleTextActive]}>Temp</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => onOverlayChange('pressure')} style={[styles.overlayToggle, showPressure && styles.overlayToggleActive]}>
            <View style={[styles.overlayDot, { backgroundColor: chartColors.pressure }]} />
            <Text style={[styles.overlayToggleText, showPressure && styles.overlayToggleTextActive]}>Tank pressure</Text>
          </Pressable>
          {geometry.hasOxygen ? (
          <Pressable accessibilityRole="button" onPress={() => onOverlayChange('oxygen')} style={[styles.overlayToggle, showOxygen && styles.overlayToggleActive]}>
            <View style={[styles.overlayDot, { backgroundColor: chartColors.oxygen }]} />
            <Text style={[styles.overlayToggleText, showOxygen && styles.overlayToggleTextActive]}>ppO₂</Text>
          </Pressable>
          ) : null}
        </View>
      ) : null}
      <View style={[styles.scrubBar, fullscreen && styles.scrubBarFullscreen]}>
        <ScrubValue compact={fullscreen} label="Time" value={scrubPoint ? formatProfileTime(scrubPoint.t - profileOrigin) : '—:—'} />
        <ScrubValue compact={fullscreen} label="Depth" value={scrubPoint ? formatDepth(scrubPoint.depth, depthUnit) : '—'} color={chartColors.depth} />
        {showTemperature ? <ScrubValue compact={fullscreen} label="Temperature" value={scrubPoint && selectedTemperature != null ? formatTemperature(selectedTemperature, temperatureUnit) : '—'} color={chartColors.temperature} /> : null}
        {geometry.hasOxygen && showOxygen ? (
          <ScrubValue
            color={chartColors.oxygen}
            compact={fullscreen}
            label="ppO₂"
            value={selectedPpo2 != null ? `${selectedPpo2.toFixed(2)} bar` : '—'}
          />
        ) : null}
        {fullscreen && showPressure ? airPaths.map((series) => {
          const pressure = selectedPressures.find((selected) => selected.label === series.label)?.pressureBar;
          return <ScrubValue compact label={airPaths.length > 1 ? series.label : 'Tank pressure'} key={`scrub-${series.label}`} value={pressure != null ? formatPressure(pressure, pressureUnit) : '—'} color={series.color} />;
        }) : null}
      </View>
      <Text style={styles.scrubHint}>{scrubPoint ? 'Showing the nearest recorded sample' : 'Touch and drag across the chart to inspect the dive'}</Text>
      <View
        accessibilityLabel="Interactive dive profile. Touch and drag to inspect readings."
        accessibilityRole="adjustable"
        onMoveShouldSetResponder={(event) => fullscreen || shouldStartHorizontalScrub(event)}
        onMoveShouldSetResponderCapture={() => fullscreen}
        onResponderGrant={handleScrub}
        onResponderMove={handleScrub}
        onResponderRelease={() => { touchOriginRef.current = null; }}
        onResponderTerminationRequest={() => false}
        onStartShouldSetResponder={() => fullscreen}
        onStartShouldSetResponderCapture={() => fullscreen}
        onTouchStart={(event) => {
          touchOriginRef.current = { x: event.nativeEvent.pageX, y: event.nativeEvent.pageY };
          if (fullscreen) handleScrub(event);
        }}
        style={[styles.chartPlot, fullscreen && styles.chartPlotFullscreen]}
      >
        <Svg pointerEvents="none" width={chartWidth} height={chartHeight + 18}>
          <Line x1="0" y1="0" x2={chartWidth} y2="0" stroke={chartColors.grid} strokeWidth="1" />
          {geometry.depthTicks.map((tick) => (
            <Fragment key={`depth-${tick.meters}`}>
              <Line x1="0" y1={tick.y} x2={chartWidth} y2={tick.y} stroke={chartColors.grid} opacity="0.28" strokeWidth="1" />
              <SvgText x="5" y={Math.max(10, tick.y - 5)} fill={chartColors.grid} fontSize="8" fontWeight="800">
                {formatDepth(tick.meters, depthUnit)}
              </SvgText>
            </Fragment>
          ))}
          {geometry.timeTicks.map((tick) => (
            <Line key={`t-${tick.seconds}`} x1={tick.x} y1="0" x2={tick.x} y2={chartHeight} stroke={chartColors.grid} opacity="0.2" strokeWidth="1" />
          ))}
          <Path d={geometry.areaPath} fill={chartColors.depth} opacity="0.12" />
          <Path d={geometry.linePath} fill="none" stroke={chartColors.depth} strokeWidth={lineWidth} strokeLinejoin="round" />
          {geometry.hasTemp && showTemperature ? <Path d={geometry.tempPath} fill="none" opacity="0.9" stroke={chartColors.temperature} strokeWidth={lineWidth} strokeLinejoin="round" /> : null}
          {geometry.hasOxygen && showOxygen && geometry.setpointPath ? (
            <Path d={geometry.setpointPath} fill="none" opacity="0.75" stroke={chartColors.setpoint} strokeDasharray="5,4" strokeWidth={Math.max(1, lineWidth - 1)} />
          ) : null}
          {geometry.hasOxygen && showOxygen && geometry.ppo2Path ? (
            <Path d={geometry.ppo2Path} fill="none" opacity="0.95" stroke={chartColors.oxygen} strokeLinejoin="round" strokeWidth={lineWidth} />
          ) : null}
          {showPressure && airPaths.map((series) => (
            <Path key={series.label} d={series.path} fill="none" opacity="0.9" stroke={series.color} strokeWidth={lineWidth} strokeLinejoin="round" />
          ))}
          {showPressure && airPaths.length ? (
            <>
              <SvgText x={chartWidth - 5} y="11" fill={chartColors.pressure} fontSize="8" fontWeight="800" textAnchor="end">{formatPressure(maxBar, pressureUnit)}</SvgText>
              <SvgText x={chartWidth - 5} y={chartHeight - 5} fill={chartColors.pressure} fontSize="8" fontWeight="800" textAnchor="end">0</SvgText>
            </>
          ) : null}
          {scrubPoint ? (
            <>
              <Line x1={scrubPoint.x} y1="0" x2={scrubPoint.x} y2={chartHeight} stroke={colors.white} strokeWidth="1" strokeDasharray="4 3" />
              <Line x1="0" y1={scrubPoint.y} x2={chartWidth} y2={scrubPoint.y} stroke={colors.white} strokeWidth="1" strokeDasharray="4 3" />
              <Circle cx={scrubPoint.x} cy={scrubPoint.y} r="4" fill={colors.background} stroke={colors.white} strokeWidth="2" />
            </>
          ) : null}
          {geometry.timeTicks.map((tick) => (
            <SvgText key={`tl-${tick.seconds}`} x={tick.x} y={chartHeight + 13} fill={colors.faint} fontSize="8" fontWeight="700" textAnchor="middle">
              {`${Math.round(tick.seconds / 60)}m`}
            </SvgText>
          ))}
        </Svg>
      </View>
      {!fullscreen && scrubPoint && selectedPressures.length ? (
        <View style={styles.pressureReadouts}>
          {selectedPressures.map((series) => (
            <View key={series.label} style={styles.pressureReadout}>
              <View style={[styles.pressureDot, { backgroundColor: series.color }]} />
              <Text numberOfLines={1} style={styles.pressureName}>{series.label}</Text>
              <Text style={[styles.pressureValue, { color: series.color }]}>{formatPressure(series.pressureBar, pressureUnit)}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <View style={styles.chartLegend}>
        <View style={styles.legendItem}><View style={[styles.legendSwatch, { backgroundColor: chartColors.depth }]} /><Text style={styles.legendText}>Depth</Text></View>
        {geometry.hasTemp && showTemperature ? <View style={styles.legendItem}><View style={[styles.legendSwatch, { backgroundColor: chartColors.temperature }]} /><Text style={styles.legendText}>Temperature</Text></View> : null}
        {geometry.hasOxygen && showOxygen ? <View style={styles.legendItem}><View style={[styles.legendSwatch, { backgroundColor: chartColors.oxygen }]} /><Text style={styles.legendText}>ppO₂ (dashed: setpoint)</Text></View> : null}
        {showPressure && airPaths.map((series) => (
          <View key={series.label} style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: series.color }]} />
            <Text numberOfLines={1} style={styles.legendText}>{airPaths.length > 1 ? series.label : 'Tank pressure'}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

function FullscreenProfile({ dive, samples, maxDepthMeters, durationSeconds, temperatures, mixLabel, computerLabel, units, pressureSeries, onClose, chartColors, lineWidth }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [overlays, setOverlays] = useState({ temperature: true, pressure: true, oxygen: true });
  const previousLockRef = useRef(ScreenOrientation?.OrientationLock.PORTRAIT_UP);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const previous = await ScreenOrientation.getOrientationLockAsync();
        if (!active) return;
        previousLockRef.current = previous;
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      } catch (error) {
        console.log('[dive-log] landscape profile unavailable:', error?.message);
      }
    })();
    return () => {
      active = false;
      const previous = previousLockRef.current;
      const restorable = previous !== ScreenOrientation.OrientationLock.UNKNOWN
        && previous !== ScreenOrientation.OrientationLock.OTHER;
      ScreenOrientation.lockAsync(restorable ? previous : ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, []);

  // During an orientation transition the safe-area provider can briefly
  // report zero for the Dynamic Island edge. Reserve a 56pt landscape gutter
  // on both sides so controls and chart labels never sit beneath the cutout.
  const leftPadding = Math.max(insets.left, spacing.sm, 56);
  const rightPadding = Math.max(insets.right, spacing.sm, 56);
  const modalWidth = Math.max(280, width - leftPadding - rightPadding - spacing.lg * 2);
  const toggleOverlay = (key) => setOverlays((current) => ({ ...current, [key]: !current[key] }));
  const location = [dive?.site?.name, dive?.site?.location, dive?.site?.country].filter(Boolean).join(' · ');
  const siteDisplay = dive?.number != null ? `#${dive.number} · ${location || 'Unnamed dive'}` : (location || 'Unnamed dive');
  const headerDetails = (
    <View style={styles.fullscreenMeta}>
      <View style={styles.fullscreenMetaRow}>
        <View style={[styles.fullscreenMetaItem, styles.fullscreenMetaCol1]}>
          <Text style={styles.fullscreenMetaLabel}>DATE</Text>
          <Text numberOfLines={1} style={styles.fullscreenMetaValue}>{formatDate(dive?.startTime) || '—'}</Text>
        </View>
        <View style={[styles.fullscreenMetaItem, styles.fullscreenMetaCol2]}>
          <Text style={styles.fullscreenMetaLabel}>START</Text>
          <Text numberOfLines={1} style={styles.fullscreenMetaValue}>{formatTimeOfDay(dive?.startTime) || '—'}</Text>
        </View>
        <View style={[styles.fullscreenMetaItem, styles.fullscreenMetaCol3]}>
          <Text style={styles.fullscreenMetaLabel}>SITE</Text>
          <Text numberOfLines={1} style={styles.fullscreenMetaValue}>{siteDisplay}</Text>
        </View>
        <View style={[styles.fullscreenMetaItem, styles.fullscreenMetaCol4]}>
          <Text style={styles.fullscreenMetaLabel}>DURATION</Text>
          <Text numberOfLines={1} style={styles.fullscreenMetaValue}>{formatDuration(durationSeconds)}</Text>
        </View>
      </View>
      <View style={styles.fullscreenMetaRow}>
        <View style={[styles.fullscreenMetaItem, styles.fullscreenMetaCol1]}>
          <Text style={styles.fullscreenMetaLabel}>MAX DEPTH</Text>
          <Text numberOfLines={1} style={styles.fullscreenMetaValue}>{formatDepth(maxDepthMeters, units.depthUnit)}</Text>
        </View>
        <View style={[styles.fullscreenMetaItem, styles.fullscreenMetaCol2]}>
          <Text style={styles.fullscreenMetaLabel}>WATER TEMP</Text>
          <Text numberOfLines={1} style={styles.fullscreenMetaValue}>{temperatures?.min != null && temperatures?.max != null ? `${formatTemperature(temperatures.min, units.temperatureUnit)}–${formatTemperature(temperatures.max, units.temperatureUnit)}` : '—'}</Text>
        </View>
        <View style={[styles.fullscreenMetaItem, styles.fullscreenMetaCol3]}>
          <Text style={styles.fullscreenMetaLabel}>GAS</Text>
          <Text numberOfLines={1} style={styles.fullscreenMetaValue}>{mixLabel || 'Air'}</Text>
        </View>
        <View style={[styles.fullscreenMetaItem, styles.fullscreenMetaCol4]}>
          <Text style={styles.fullscreenMetaLabel}>COMPUTER</Text>
          <Text numberOfLines={1} style={styles.fullscreenMetaValue}>{computerLabel || 'Manual log'}</Text>
        </View>
      </View>
    </View>
  );
  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
      statusBarTranslucent
      supportedOrientations={['landscape-left', 'landscape-right']}
      visible
    >
      <View style={[styles.fullscreenProfile, {
        paddingBottom: Math.max(insets.bottom, spacing.xs),
        paddingLeft: leftPadding,
        paddingRight: rightPadding,
        // In landscape, iOS reports the notch/status inset on the top edge
        // even though it is already accounted for by the horizontal inset.
        // Using it here creates the large unused band above the profile.
        paddingTop: spacing.xs,
      }]}
      >
        <ProfileChart
          availableWidth={modalWidth}
          depthUnit={units.depthUnit}
          fullscreen
          maxDepthMeters={maxDepthMeters}
          onClose={onClose}
          onOverlayChange={toggleOverlay}
          headerDetails={headerDetails}
          pressureSeries={pressureSeries}
          pressureUnit={units.pressureUnit}
          samples={samples}
          showOxygen={overlays.oxygen}
          showPressure={overlays.pressure}
          showTemperature={overlays.temperature}
          temperatureUnit={units.temperatureUnit}
          chartColors={chartColors}
          lineWidth={lineWidth}
        />
      </View>
    </Modal>
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

function StatsView({ trends, stats, units, onRecheck, rechecking, deletedCount, onPurge, onEraseAll, onDiagnostic, onHealthCheck, onRestoreBackup }) {
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
          Deleted dive records stay hidden until purge. Their exclusively owned
          computer logs are removed so a fresh download can import them again. Purge
          removes the remaining records and clears per-computer sync markers.
        </Text>
        <Pressable onPress={onDiagnostic} hitSlop={8} style={styles.reviewSkip}>
          <Text style={styles.reviewSkipText}>Share logbook diagnostic (dev)</Text>
        </Pressable>
        <Pressable onPress={onHealthCheck} hitSlop={8} style={styles.reviewSkip}>
          <Text style={styles.reviewSkipText}>Run health check</Text>
        </Pressable>
        <Pressable onPress={onRestoreBackup} hitSlop={8} style={styles.reviewSkip}>
          <Text style={styles.reviewSkipText}>Restore a backup</Text>
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
  const dateLabel = formatDate(row.startTime) || 'Undated dive';
  // Without a site name, pair the date with the start time instead of a
  // placeholder — a screen full of "Unnamed site" reads as one long
  // duplicate; the time still tells dives on the same day apart.
  const title = row.siteName ? `${dateLabel} · ${row.siteName}` : `${dateLabel} · ${formatTimeOfDay(row.startTime) || 'Unnamed dive'}`;
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

function SelectionBar({ count, total, allSelected, onToggleAll, onDelete, onMerge, onExport }) {
  return (
    <Card style={styles.selectionBar}>
      <Pressable onPress={onToggleAll} hitSlop={8} style={({ pressed }) => [styles.selectionToggle, pressed && styles.pressed]}>
        <Text style={styles.selectionToggleText}>{allSelected ? 'Deselect all' : `Select all (${total})`}</Text>
      </Pressable>
      <View style={styles.selectionRight}>
        {count ? (
          <Pressable accessibilityRole="button" onPress={onExport} hitSlop={8} style={({ pressed }) => [styles.selectionExport, pressed && styles.pressed]}>
            <Text style={styles.selectionExportText}>Export {count}</Text>
          </Pressable>
        ) : null}
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

// A tappable, collapsible card: closed by default so the detail screen reads
// as one page of at-a-glance stats instead of a long stack of fully-open
// sections. `defaultExpanded` lets a caller open a section up front when it
// carries something actionable (e.g. multiple computers to switch between).
function DetailCard({ title, defaultExpanded = false, children }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const hasContent = Array.isArray(children) ? children.some(Boolean) : Boolean(children);
  if (!hasContent) return null;
  return (
    <Card style={styles.detailCard}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        hitSlop={4}
        onPress={() => setExpanded((current) => !current)}
        style={({ pressed }) => [styles.detailCardHeader, pressed && styles.pressed]}
      >
        <Text style={styles.detailCardTitle}>{title}</Text>
        <Text style={styles.detailCardChevron}>{expanded ? '▾' : '▸'}</Text>
      </Pressable>
      {expanded ? children : null}
    </Card>
  );
}

// Renders just the per-computer rows (no Card/title of its own) so it can sit
// inside the shared "Computer analytics" section alongside the analytics rows.
function LogRows({ logs, primaryLog, units, onShowLog }) {
  if (!logs.length) return null;
  const multi = logs.length > 1;
  return (
    <>
      <Text style={styles.detailSubhead}>
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
    </>
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

function temperatureSummary(water, samples) {
  const sampled = (samples || []).map((sample) => sample?.tempC).filter(Number.isFinite);
  return {
    surface: water?.tempSurfaceC ?? null,
    min: water?.tempMinC ?? (sampled.length ? Math.min(...sampled) : null),
    max: water?.tempMaxC ?? (sampled.length ? Math.max(...sampled) : null),
  };
}

function DiveHero({ dive }) {
  const location = [dive.site.location, dive.site.country].filter(Boolean).join(', ');
  const dateTime = [formatDate(dive.startTime), formatTimeOfDay(dive.startTime)].filter(Boolean).join('  ·  ');
  // Without a site name, the date and time become the title itself instead
  // of a placeholder — so the meta line below only needs to add location,
  // rather than repeating the date/time it would otherwise duplicate.
  const title = dive.site.name || dateTime || 'Unnamed dive';
  const meta = dive.site.name ? [dateTime, location].filter(Boolean).join('  ·  ') : location;
  return (
    <Card style={styles.diveHero}>
      <Text style={styles.diveHeroEyebrow}>
        {dive.number != null ? `DIVE ${dive.number}` : 'DIVE LOG'}
      </Text>
      <Text style={styles.diveHeroTitle}>{title}</Text>
      {meta ? <Text style={styles.diveHeroMeta}>{meta}</Text> : null}
    </Card>
  );
}

// The handful of numbers a diver checks first, at a glance, right under the
// profile chart. Everything else lives one tap away in the sections below.
function KeyStats({ water, phys, temperatures, mix, pressure, sac, units }) {
  const waterTemp = temperatures.min != null && temperatures.max != null
    ? `${formatTemperature(temperatures.min, units.temperatureUnit)}–${formatTemperature(temperatures.max, units.temperatureUnit)}`
    : (temperatures.surface != null ? formatTemperature(temperatures.surface, units.temperatureUnit) : null);
  const hasAny = water.maxDepthMeters != null || phys.durationSeconds != null || waterTemp != null
    || mix || pressure != null || sac != null;
  if (!hasAny) return null;
  return (
    <View style={styles.keyStats}>
      <ProfileMetric style={styles.keyStat} label="Max depth" value={formatDepth(water.maxDepthMeters, units.depthUnit)} accent={colors.cyan} />
      <ProfileMetric style={styles.keyStat} label="Duration" value={formatDuration(phys.durationSeconds)} />
      <ProfileMetric style={styles.keyStat} label="Water temp" value={waterTemp} accent={colors.warning} />
      <ProfileMetric style={styles.keyStat} label="Gas" value={mix ? formatGasLabel(mix) : null} accent={colors.good} />
      <ProfileMetric style={styles.keyStat} label="Pressure" value={pressure != null ? formatPressure(pressure, units.pressureUnit) : null} />
      <ProfileMetric style={styles.keyStat} label="SAC" value={sac != null ? `${formatPressure(sac, units.pressureUnit)}/min` : null} />
    </View>
  );
}

function DiveDetail({ dive, logs = [], primaryLog, units, onShowLog, chartColors, lineWidth }) {
  const [profileFullscreen, setProfileFullscreen] = useState(false);
  // Physical data comes from the shown computer's log; user's own fields from the Dive.
  const phys = primaryLog || dive;
  // A computer log may legitimately omit individual condition fields. Keep the
  // editable Dive value as a per-field fallback so a diver can complete an old
  // or sparse download without the log's nulls hiding their entry.
  const recordedWater = primaryLog?.water || {};
  const water = primaryLog
    ? Object.fromEntries(Object.entries({ ...dive.water, ...recordedWater }).map(([key, value]) => [
      key,
      value ?? dive.water?.[key] ?? null,
    ]))
    : dive.water;
  // Per field, not wholesale: a computer without a transmitter reports no
  // cylinder pressures, and taking its gas whole would hide the start/end
  // pressures entered by hand — the same trap the water merge above avoids.
  const gas = mergeGas(primaryLog?.gas, dive.gas);
  const mix = gas.mixes?.[0];
  const tanks = gas.tanks || [];
  const tank = tanks[0];
  const samples = primaryLog?.profile?.samples || [];
  const temperatures = temperatureSummary(water, samples);
  const analytics = primaryLog?.analytics;
  const shownName = primaryLog ? computerName(primaryLog) : null;
  const diveMode = phys.diveMode || dive.diveMode || 'oc';
  const hiddenSections = hiddenDataSections(diveMode, { ...dive, gas: gas });

  // Air pressure: which computer(s) recorded it.
  const airLogs = logs.filter(logHasAir);
  const airSeries = airLogs.map((log, i) => {
    const logSamples = log.profile?.samples || [];
    const logTank = log.gas?.tanks?.[0] || null;
    // Some computers send a full pressure curve but leave the tank's begin/end
    // fields at zero. Recover them from the curve, or the entire gas section
    // stays blank on a dive that obviously has transmitter data.
    const fromCurve = tankPressuresFromSamples(logSamples);
    const effectiveTank = {
      ...(logTank || {}),
      startBar: logTank?.startBar ?? fromCurve.startBar,
      endBar: logTank?.endBar ?? fromCurve.endBar,
    };
    return {
      label: computerName(log),
      color: i === 0 ? chartColors.pressure : PRESSURE_COLORS[i % PRESSURE_COLORS.length],
      samples: logSamples,
      tank: effectiveTank,
      analytics: log.analytics,
      // The computer's own SAC when it produced one, otherwise derived from
      // the pressures we just recovered.
      consumption: surfaceConsumption({
        startBar: effectiveTank.startBar,
        endBar: effectiveTank.endBar,
        durationSeconds: log.durationSeconds ?? dive.durationSeconds,
        avgDepthMeters: log.water?.avgDepthMeters ?? dive.water?.avgDepthMeters ?? averageDepth(logSamples),
        tankVolumeLiters: effectiveTank.volumeLiters,
      }),
    };
  });
  const tankForNumbers = airSeries[0]?.tank || tank;
  const gasUsedBar = tankForNumbers && tankForNumbers.startBar != null && tankForNumbers.endBar != null
    ? tankForNumbers.startBar - tankForNumbers.endBar : null;
  const gasUsedLiters = gasUsedBar != null && tankForNumbers.volumeLiters ? gasUsedBar * tankForNumbers.volumeLiters : null;

  // Without a transmitter there is no airSeries, but the dive form still takes
  // a start and end pressure by hand — and that is enough to derive SAC and
  // RMV, provided we know how deep the dive averaged. Fall back to the profile
  // when the average depth wasn't typed in, so a computer without a
  // transmitter still gets real consumption numbers.
  const avgDepthForGas = water.avgDepthMeters ?? (samples.length ? averageDepth(samples) : null);
  const manualConsumption = useMemo(
    () => combinedConsumption(tanks, { durationSeconds: phys.durationSeconds, avgDepthMeters: avgDepthForGas }),
    [tanks, phys.durationSeconds, avgDepthForGas],
  );
  const handEnteredTanks = manualConsumption.perTank.filter(
    (entry) => tanks[entry.index]?.startBar != null || tanks[entry.index]?.endBar != null,
  );

  const shownSeries = airSeries.find((s) => s.label === shownName) || airSeries[0] || null;
  const primarySac = shownSeries?.analytics?.sacBarPerMin
    ?? shownSeries?.consumption?.sacBarPerMin
    ?? manualConsumption.sacBarPerMin
    ?? null;
  const pressureForTile = tankForNumbers?.endBar ?? tankForNumbers?.startBar ?? null;

  const [shareOpen, setShareOpen] = useState(false);
  // Everything the share card can draw, already formatted in the user's units
  // — the card owns layout and which of these appear, never unit choice. Keys
  // in `values` match shareCardOptions.STAT_FIELDS; a null means this dive
  // simply doesn't have that number, and the card drops it.
  const shareCardData = {
    samples,
    maxDepthMeters: water.maxDepthMeters,
    title: dive.site.name || 'Scuba dive',
    subtitle: [formatDate(dive.startTime), formatTimeOfDay(dive.startTime)].filter(Boolean).join(' · '),
    depthTop: formatDepth(0, units.depthUnit),
    depthBottom: water.maxDepthMeters != null ? formatDepth(water.maxDepthMeters, units.depthUnit) : '',
    values: {
      time: phys.durationSeconds != null ? formatDuration(phys.durationSeconds) : null,
      depth: water.maxDepthMeters != null ? formatDepth(water.maxDepthMeters, units.depthUnit) : null,
      temp: temperatures.min != null ? formatTemperature(temperatures.min, units.temperatureUnit) : null,
      gas: mix ? formatGasLabel(mix) : null,
      pressure: tankForNumbers?.startBar != null && tankForNumbers?.endBar != null
        ? `${formatPressure(tankForNumbers.startBar, units.pressureUnit)} → ${formatPressure(tankForNumbers.endBar, units.pressureUnit)}`
        : null,
      sac: primarySac != null ? `${formatPressure(primarySac, units.pressureUnit)}/min` : null,
    },
  };

  return (
    <>
      <DiveHero dive={dive} />

      {shareOpen ? <DiveShareCardScreen dive={shareCardData} onClose={() => setShareOpen(false)} /> : null}

      {samples.length ? (
        <>
          <SecondaryButton label="Share dive" onPress={() => setShareOpen(true)} style={styles.shareButton} />
          <ProfileChart
            samples={samples}
            maxDepthMeters={water.maxDepthMeters}
            depthUnit={units.depthUnit}
            pressureUnit={units.pressureUnit}
            temperatureUnit={units.temperatureUnit}
            pressureSeries={airSeries}
            onExpand={ScreenOrientation ? () => setProfileFullscreen(true) : undefined}
            chartColors={chartColors}
            lineWidth={lineWidth}
          />
        </>
      ) : null}

      {profileFullscreen ? (
        <FullscreenProfile
          computerLabel={shownName}
          dive={dive}
          durationSeconds={phys.durationSeconds}
          maxDepthMeters={water.maxDepthMeters}
          mixLabel={mix ? formatGasLabel(mix) : null}
          onClose={() => setProfileFullscreen(false)}
          pressureSeries={airSeries}
          samples={samples}
          temperatures={temperatures}
          units={units}
          chartColors={chartColors}
          lineWidth={lineWidth}
        />
      ) : null}

      <KeyStats water={water} phys={phys} temperatures={temperatures} mix={mix} pressure={pressureForTile} sac={primarySac} units={units} />

      {logs.length > 1 && shownName ? (
        <Text style={styles.detailShownFrom}>Showing {shownName}&apos;s data — tap a computer in Computer analytics below to switch</Text>
      ) : null}

      <DetailCard title="Site & conditions">
        <DetailRow label="Date" value={formatDate(dive.startTime)} />
        <DetailRow label="Time" value={formatTimeOfDay(dive.startTime)} />
        <DetailRow label="Dive number" value={dive.number != null ? String(dive.number) : ''} />
        <DetailRow label="Site" value={dive.site.name} />
        <DetailRow label="Location" value={[dive.site.location, dive.site.country].filter(Boolean).join(', ')} />
        <DetailRow label="Coordinates" value={formatCoordinates(dive.site.latitude, dive.site.longitude)} />
        <DetailRow label="Operator" value={dive.operator} />
        <DetailRow label="Buddies" value={dive.buddies.join(', ')} />
        <DetailRow label="Avg depth" value={water.avgDepthMeters != null ? formatDepth(water.avgDepthMeters, units.depthUnit) : ''} />
        <DetailRow label="Surface interval" value={dive.surfaceIntervalSeconds != null ? formatDuration(dive.surfaceIntervalSeconds) : ''} />
        <DetailRow label="Water" value={water.type ? WATER_TYPE_LABELS[water.type] : ''} />
        <DetailRow label="Surface temperature" value={temperatures.surface != null ? formatTemperature(temperatures.surface, units.temperatureUnit) : ''} />
        <DetailRow label="Minimum temperature" value={temperatures.min != null ? formatTemperature(temperatures.min, units.temperatureUnit) : ''} />
        <DetailRow label="Maximum temperature" value={temperatures.max != null ? formatTemperature(temperatures.max, units.temperatureUnit) : ''} />
        <DetailRow label="Visibility" value={water.visibilityMeters != null ? formatDepth(water.visibilityMeters, units.depthUnit) : ''} />
      </DetailCard>

      {dive.photos?.length ? (
        <DetailCard title={'Dive photos (' + dive.photos.length + ')'} defaultExpanded>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoStrip}>
            {dive.photos.map((photo) => (
              <Image key={photo.id} source={{ uri: photo.uri }} style={styles.divePhoto} accessibilityLabel="Linked dive photo" />
            ))}
          </ScrollView>
        </DetailCard>
      ) : null}

      {/* Always open. Gating this on "has gas data" was worse than useless:
          with no pressures recorded the card collapsed and hid the empty-state
          hint that explains why it is empty, so the screen looked identical
          whether the feature worked or not. */}
      {sectionIsVisible(diveMode, 'gasEquipment') ? <DetailCard defaultExpanded title="Gas & equipment">
        <DetailRow label="Mix" value={mix ? formatGasLabel(mix) : ''} />
        <DetailRow label="Dive mode" value={phys.diveMode ? DIVE_MODE_LABELS[phys.diveMode] : ''} />
        <DetailRow label="Cylinder" value={tank?.volumeLiters != null ? formatVolume(tank.volumeLiters, units.gasVolumeUnit, tank.workPressureBar) : ''} />
        <DetailRow label="Working pressure" value={tank?.workPressureBar != null ? formatPressure(tank.workPressureBar, units.pressureUnit) : ''} />
        <DetailRow label="Weight" value={dive.gear.weightKg != null ? formatWeight(dive.gear.weightKg, 'kg') : ''} />
        <DetailRow label="Exposure suit" value={dive.gear.exposureSuit} />
        {/* Nothing recorded either way. Every pressure row hides itself when
            empty, so without this the card just ends — which reads as the app
            losing the numbers rather than never having had them. */}
        {!airSeries.length && !handEnteredTanks.length ? (
          <Text style={styles.detailHint}>
            No cylinder pressures recorded for this dive. Add a start and end pressure in Edit to get
            gas used, SAC and RMV.
          </Text>
        ) : null}
        {/* No transmitter: show what was entered by hand, per cylinder, and
            what can be derived from it — rather than dropping it silently. */}
        {!airSeries.length && handEnteredTanks.length ? (
          <>
            {handEnteredTanks.map((entry) => {
              const source = tanks[entry.index];
              const entryMix = gas.mixes?.[source.mixIndex ?? 0];
              return (
                <View key={entry.index}>
                  {handEnteredTanks.length > 1 ? (
                    <Text style={styles.airFrom}>
                      {`Cylinder ${entry.index + 1}${entryMix ? ` · ${formatGasLabel(entryMix)}` : ''}`}
                      {source.volumeLiters ? ` · ${formatVolume(source.volumeLiters, units.gasVolumeUnit, source.workPressureBar)}` : ''}
                    </Text>
                  ) : null}
                  <DetailRow
                    label="Pressure"
                    value={`${source.startBar != null ? formatPressure(source.startBar, units.pressureUnit) : '—'} → ${source.endBar != null ? formatPressure(source.endBar, units.pressureUnit) : '—'}`}
                  />
                  <DetailRow
                    label="Gas used"
                    value={entry.usedBar != null ? formatPressure(entry.usedBar, units.pressureUnit) : ''}
                  />
                  <DetailRow
                    label="SAC"
                    value={entry.sacBarPerMin != null ? `${formatPressure(entry.sacBarPerMin, units.pressureUnit)}/min` : ''}
                  />
                  <DetailRow
                    label="RMV"
                    value={entry.rmvLitersPerMin != null ? `${entry.rmvLitersPerMin.toFixed(1)} L/min` : ''}
                  />
                </View>
              );
            })}
            {handEnteredTanks.length > 1 ? (
              <>
                <Text style={styles.airFrom}>All cylinders</Text>
                <DetailRow
                  label="Free gas used"
                  value={manualConsumption.usedLiters != null ? formatVolume(manualConsumption.usedLiters, units.gasVolumeUnit) : ''}
                />
                <DetailRow
                  label="Total RMV"
                  value={manualConsumption.rmvLitersPerMin != null ? `${manualConsumption.rmvLitersPerMin.toFixed(1)} L/min` : ''}
                />
                {/* Only shown when every cylinder is the same size: bar/min
                    out of a 7 L pony and a 15 L twin are different amounts of
                    gas, so a summed SAC across mixed sizes would be a lie. */}
                {manualConsumption.sacBarPerMin != null ? (
                  <DetailRow
                    label="Total SAC"
                    value={`${formatPressure(manualConsumption.sacBarPerMin, units.pressureUnit)}/min`}
                  />
                ) : (
                  <Text style={styles.detailHint}>
                    Cylinders are different sizes, so RMV is the comparable number — SAC in
                    {` ${units.pressureUnit}`}/min only adds up across matching cylinders.
                  </Text>
                )}
              </>
            ) : null}
            {avgDepthForGas == null ? (
              <Text style={styles.detailHint}>Add an average depth to get SAC and RMV from these pressures.</Text>
            ) : null}
          </>
        ) : null}
        {airSeries.length ? airSeries.map((s) => (
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
            <DetailRow
              label="Gas used"
              value={s.tank?.startBar != null && s.tank?.endBar != null && s.tank.startBar > s.tank.endBar
                ? formatPressure(s.tank.startBar - s.tank.endBar, units.pressureUnit)
                : ''}
            />
            <DetailRow
              label="SAC"
              value={(s.analytics?.sacBarPerMin ?? s.consumption.sacBarPerMin) != null
                ? `${formatPressure(s.analytics?.sacBarPerMin ?? s.consumption.sacBarPerMin, units.pressureUnit)}/min`
                : ''}
            />
            <DetailRow
              label="RMV"
              value={(s.analytics?.rmvLitersPerMin ?? s.consumption.rmvLitersPerMin) != null
                ? `${(s.analytics?.rmvLitersPerMin ?? s.consumption.rmvLitersPerMin).toFixed(1)} L/min`
                : ''}
            />
          </View>
        )) : null}
        {airSeries.length ? (
          <>
            <DetailRow label="Gas used" value={gasUsedBar != null ? formatPressure(gasUsedBar, units.pressureUnit) : ''} />
            <DetailRow label="Free gas used" value={gasUsedLiters != null ? formatVolume(gasUsedLiters, units.gasVolumeUnit) : ''} />
          </>
        ) : null}
      </DetailCard> : null}

      {sectionIsVisible(diveMode, 'computerAnalytics') ? <DetailCard title="Computer analytics" defaultExpanded={logs.length > 1}>
        {analytics ? (
          <>
            <DetailRow label="Max ascent rate" value={analytics.ascentRateMaxMPerMin != null ? `${analytics.ascentRateMaxMPerMin} m/min` : ''} />
            <DetailRow label="Sawtooth" value={analytics.sawtoothIndex ? `${analytics.sawtoothIndex} m extra descent` : ''} />
            <DetailRow label="Safety score" value={analytics.safetyScore != null ? `${analytics.safetyScore} / 100` : ''} />
            <DetailRow label="Deco model" value={analytics.decoModelType ? `${analytics.decoModelType.toUpperCase()}${analytics.gfLow != null ? ` ${analytics.gfLow}/${analytics.gfHigh}` : ''}` : ''} />
            <DetailRow label="Max ceiling" value={analytics.ceilingMaxMeters != null ? formatDepth(analytics.ceilingMaxMeters, units.depthUnit) : ''} />
            <DetailRow label="CNS" value={analytics.cnsEndPct != null ? `${Math.round(analytics.cnsEndPct)}%` : ''} />
          </>
        ) : null}
        {logs.length ? <LogRows logs={logs} primaryLog={primaryLog} units={units} onShowLog={onShowLog} /> : null}
      </DetailCard> : null}

      {hiddenSections.length ? (
        <DetailCard title="Additional recorded data" defaultExpanded>
          <Text style={styles.detailHint}>
            This dive is marked {DIVE_MODE_LABELS[diveMode] || 'open circuit'}, so some sections are not part of the normal view. Existing recorded values remain available here and are never deleted.
          </Text>
          <DetailRow label="Hidden sections" value={hiddenSections.join(', ')} />
          {hiddenSections.includes('gasEquipment') ? (
            <>
              <DetailRow label="Recorded mix" value={mix ? formatGasLabel(mix) : ''} />
              <DetailRow label="Recorded cylinders" value={tanks.length ? String(tanks.length) : ''} />
            </>
          ) : null}
          {hiddenSections.includes('gear') ? (
            <>
              <DetailRow label="Weight" value={dive.gear.weightKg != null ? formatWeight(dive.gear.weightKg, 'kg') : ''} />
              <DetailRow label="Exposure suit" value={dive.gear.exposureSuit} />
            </>
          ) : null}
        </DetailCard>
      ) : null}

      <DetailCard title="Notes & tags" defaultExpanded={Boolean(dive.notes)}>
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
  const setCylinders = (cylinders) => onChange({ ...form, cylinders });
  const setCylinder = (index, key) => (value) => setCylinders(
    form.cylinders.map((cylinder, i) => (i === index ? { ...cylinder, [key]: value } : cylinder)),
  );
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

      <FormSection title="Dive profile">
        <ChoiceRow
          label="Dive mode"
          options={DIVE_MODES.map((mode) => ({ key: mode, label: DIVE_MODE_LABELS[mode] }))}
          value={form.diveMode}
          onChange={set('diveMode')}
        />
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
        <Field label="Surface temperature" value={form.tempSurface} onChangeText={set('tempSurface')} suffix={`°${temperatureUnit}`} keyboardType="numbers-and-punctuation" />
        <View style={styles.twoColumn}>
          <Field label="Minimum temperature" value={form.tempMin} onChangeText={set('tempMin')} suffix={`°${temperatureUnit}`} keyboardType="numbers-and-punctuation" />
          <Field label="Maximum temperature" value={form.tempMax} onChangeText={set('tempMax')} suffix={`°${temperatureUnit}`} keyboardType="numbers-and-punctuation" />
        </View>
        <Field label="Visibility" value={form.visibility} onChangeText={set('visibility')} suffix={depthUnit} keyboardType="decimal-pad" />
        <RatingRow value={form.rating} onChange={set('rating')} />
      </FormSection>

      {sectionIsVisible(form.diveMode || 'oc', 'gasEquipment') ? <FormSection title="Gas & cylinders">
        {form.cylinders.map((cylinder, index) => (
          <View key={index} style={index > 0 ? styles.cylinderBlock : null}>
            {form.cylinders.length > 1 ? (
              <View style={styles.cylinderHeader}>
                <Text style={styles.cylinderTitle}>{`Cylinder ${index + 1}`}</Text>
                <Pressable
                  accessibilityLabel={`Remove cylinder ${index + 1}`}
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => setCylinders(form.cylinders.filter((_, i) => i !== index))}
                >
                  <Text style={styles.cylinderRemove}>Remove</Text>
                </Pressable>
              </View>
            ) : null}
            <View style={styles.twoColumn}>
              <Field label="Oxygen" value={cylinder.o2} onChangeText={setCylinder(index, 'o2')} suffix="%" keyboardType="decimal-pad" />
              <Field label="Helium" value={cylinder.he} onChangeText={setCylinder(index, 'he')} suffix="%" keyboardType="decimal-pad" />
            </View>
            <View style={styles.twoColumn}>
              <Field label="Cylinder size" value={cylinder.volume} onChangeText={setCylinder(index, 'volume')} suffix={gasVolumeUnit} keyboardType="decimal-pad" helper={gasVolumeUnit === 'ft³' ? 'Capacity at working pressure' : undefined} />
              <Field label="Working pressure" value={cylinder.workPressure} onChangeText={setCylinder(index, 'workPressure')} suffix={pressureUnit} keyboardType="decimal-pad" />
            </View>
            <View style={styles.twoColumn}>
              <Field label="Start pressure" value={cylinder.start} onChangeText={setCylinder(index, 'start')} suffix={pressureUnit} keyboardType="decimal-pad" />
              <Field label="End pressure" value={cylinder.end} onChangeText={setCylinder(index, 'end')} suffix={pressureUnit} keyboardType="decimal-pad" />
            </View>
          </View>
        ))}
        <SecondaryButton
          label="Add a cylinder"
          onPress={() => setCylinders([...form.cylinders, blankCylinder()])}
          style={styles.addCylinder}
        />
      </FormSection> : null}

      {sectionIsVisible(form.diveMode || 'oc', 'gear') ? <FormSection title="Gear">
        <View style={styles.twoColumn}>
          <Field label="Weight" value={form.weight} onChangeText={set('weight')} suffix="kg" keyboardType="decimal-pad" />
          <Field label="Exposure suit" value={form.suit} onChangeText={set('suit')} />
        </View>
      </FormSection> : null}

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

function BatchPhotoReviewModal({ review, saving, onCancel, onConfirm }) {
  const matched = review.items.filter((item) => item.match);
  const unmatched = review.items.length - matched.length;
  return (
    <Modal animationType="slide" transparent visible onRequestClose={onCancel}>
      <View style={styles.photoReviewBackdrop}>
        <View style={styles.photoReviewSheet}>
          <Text accessibilityRole="header" style={styles.photoReviewTitle}>Review photo matches</Text>
          <Text style={styles.photoReviewSummary}>{matched.length} matched · {unmatched} need review</Text>
          <Text style={styles.photoReviewPrivacy}>Matching used photo timestamps on this device. No photos were uploaded.</Text>
          <ScrollView style={styles.photoReviewList} contentContainerStyle={styles.photoReviewListContent}>
            {review.items.map((item, index) => (
              <View key={item.id} style={[styles.photoReviewRow, index > 0 && styles.photoReviewDivider]}>
                <Image source={{ uri: item.asset.uri }} style={styles.photoReviewThumb} />
                <View style={styles.photoReviewCopy}>
                  <Text numberOfLines={1} style={styles.photoReviewName}>
                    {item.match ? (item.match.dive.siteName || 'Logged dive') : 'No dive match'}
                  </Text>
                  <Text style={styles.photoReviewMeta}>
                    {item.capturedAt ? new Date(item.capturedAt).toLocaleString() : 'No capture timestamp'}
                  </Text>
                  <Text style={item.match ? styles.photoReviewMatched : styles.photoReviewUnmatched}>
                    {item.match
                      ? (item.match.confidence === 'high' ? 'During this dive' : 'Near this dive')
                      : 'This photo will not be linked'}
                  </Text>
                </View>
              </View>
            ))}
          </ScrollView>
          {matched.length ? (
            <PrimaryButton
              label={saving ? 'Linking photos…' : 'Link ' + matched.length + (matched.length === 1 ? ' photo' : ' photos')}
              onPress={onConfirm}
              disabled={saving}
              style={styles.photoReviewAction}
            />
          ) : null}
          <SecondaryButton label={matched.length ? 'Cancel' : 'Done'} onPress={onCancel} disabled={saving} style={styles.photoReviewAction} />
        </View>
      </View>
    </Modal>
  );
}

export default function DiveLogScreen({ appSettings = {}, onBack, onOpenSettings = () => {} }) {
  const insets = useSafeAreaInsets();
  const {
    loaded, rows, stats, trends, deletedCount, computerPriority, setComputerRank, folders, knownComputerKeys, pendingProposals,
    getDive, addDive, updateDive, attachPhotosToDive, deleteDive, deleteDives, importComputerLogs, finishImport, resolveProposal, clearProposals,
    recheckDuplicates, mergeDivesManual, splitDiveRecord, purgeDeletedDownloads, eraseAllDiveData, dumpDiagnostic,
    runHealthCheck, repairHealthProblems,
    getSnapshots, restoreBackup,
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
  const chartColors = appSettings.profileColors || DEFAULT_PROFILE_COLORS;
  const lineWidth = appSettings.profileLineWidth || 2.75;

  const libdcVersion = useMemo(() => getLibdivecomputerVersion(), []);

  const [view, setView] = useState('list');
  const [folderKey, setFolderKey] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [photoImportReview, setPhotoImportReview] = useState(null);
  const [photoImportSaving, setPhotoImportSaving] = useState(false);

  const foldersMode = useMemo(() => folders.some((f) => f.kind === 'computer'), [folders]);
  const activeFolder = useMemo(
    () => folders.find((f) => f.key === folderKey) || null,
    [folders, folderKey],
  );
  const [filter, setFilter] = useState(DEFAULT_DIVE_FILTER);
  const [filterOpen, setFilterOpen] = useState(false);
  const applyFilter = useCallback((patch) => {
    setFilter((current) => sanitizeDiveFilter({ ...current, ...patch }));
  }, []);
  const clearFilter = useCallback(() => setFilter(DEFAULT_DIVE_FILTER), []);

  const { setSort, sort } = useDiveListSort();

  const folderRows = activeFolder ? activeFolder.rows : rows;
  const listRows = useMemo(
    () => sortDiveRows(filterDiveRows(folderRows, filter), sort),
    [folderRows, filter, sort],
  );
  const activeFilterCount = useMemo(() => countActiveFilters(filter), [filter]);
  // The folder grid is a browsing view; a search in progress means the user is
  // looking for one dive, so drop straight to the matching list.
  const showFolderGrid = foldersMode && !activeFolder && !activeFilterCount;

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

  const beginPhotoImport = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo access needed', 'Enable photo library access for DMZ Scuba in device settings to match photos with dives.');
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      orderedSelection: true,
      selectionLimit: 0,
      exif: true,
      quality: 1,
    });
    if (picked.canceled || !picked.assets?.length) return;
    const items = picked.assets.map((asset, index) => {
      const capturedAt = photoCapturedAt(asset);
      const match = capturedAt ? findDivePhotoMatches(asset, rows, capturedAt)[0] || null : null;
      return {
        id: asset.assetId || asset.uri || 'selected-photo-' + index,
        asset,
        capturedAt,
        match,
      };
    });
    setPhotoImportReview({ items });
  }, [rows]);

  const confirmPhotoImport = useCallback(async () => {
    if (!photoImportReview || photoImportSaving) return;
    setPhotoImportSaving(true);
    try {
      const grouped = new Map();
      for (const item of photoImportReview.items) {
        if (!item.match) continue;
        const diveId = item.match.dive.id;
        if (!grouped.has(diveId)) grouped.set(diveId, []);
        grouped.get(diveId).push({
          id: item.asset.assetId || item.asset.uri,
          uri: item.asset.uri,
          assetId: item.asset.assetId || null,
          capturedAt: item.capturedAt,
          linkedAt: new Date().toISOString(),
          source: 'logbook-photo-import',
        });
      }
      for (const [diveId, photos] of grouped) {
        await attachPhotosToDive(diveId, photos);
      }
      const linkedCount = [...grouped.values()].reduce((sum, photos) => sum + photos.length, 0);
      setPhotoImportReview(null);
      Alert.alert('Photos linked', linkedCount + (linkedCount === 1 ? ' photo was added to its dive.' : ' photos were added to their dives.'));
    } catch (error) {
      Alert.alert('Could not link photos', error?.message || 'The selected photos could not be added to the logbook.');
    } finally {
      setPhotoImportSaving(false);
    }
  }, [attachPhotosToDive, photoImportReview, photoImportSaving]);

  const chooseExportFormat = useCallback((ids = null) => {
    const count = ids?.length || rows.length;
    const title = `Export ${count === rows.length && !ids ? 'all dives' : `${count} ${count === 1 ? 'dive' : 'dives'}`}`;
    const openFormatMenu = (detail) => Alert.alert(title, detail === 'full'
      ? 'Full detail includes every computer log and profile sample. Full CSV uses one row per sample.'
      : 'Summary includes dive-level fields and keeps the file small.', [
      { text: 'Cancel', style: 'cancel' },
      ...['json', 'csv', 'uddf'].map((kind) => ({
        text: kind === 'json' ? 'JSON backup' : kind.toUpperCase(),
        onPress: async () => {
          try { await shareLogbookExport(kind, ids, detail); }
          catch (error) { Alert.alert('Export failed', error?.message || 'The export could not be shared.'); }
        },
      })),
    ]);
    Alert.alert(title, 'Choose how much data to include.', [
      { text: 'Summary', onPress: () => openFormatMenu('summary') },
      { text: 'Full detail', onPress: () => openFormatMenu('full') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [rows.length]);

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

        {view === 'list' && appSettings.locationLoggingEnabled ? (
          <Pressable style={styles.locationBanner} onPress={onOpenSettings}>
            <View style={styles.locationBannerDot} />
            <Text style={styles.locationBannerText} numberOfLines={1}>
              Logging location in the background to suggest dive site matches
            </Text>
            <Text style={styles.locationBannerCta}>Settings</Text>
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

            {loaded && rows.length && !selectMode ? (
              <SecondaryButton
                label="Match camera roll photos"
                onPress={beginPhotoImport}
                style={styles.photoImportButton}
              />
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
                {!selectMode ? (
                  <View style={styles.searchRow}>
                    <TextInput
                      accessibilityLabel="Search dives"
                      autoCapitalize="none"
                      autoCorrect={false}
                      clearButtonMode="while-editing"
                      onChangeText={(text) => applyFilter({ text })}
                      placeholder="Search site, buddy, tag, notes"
                      placeholderTextColor={colors.faint}
                      returnKeyType="search"
                      style={styles.searchInput}
                      value={filter.text}
                    />
                    <Pressable
                      accessibilityLabel="Filter dives"
                      accessibilityRole="button"
                      onPress={() => setFilterOpen(true)}
                      style={[styles.filterButton, activeFilterCount > 0 && styles.filterButtonOn]}
                    >
                      <Text style={[styles.filterButtonText, activeFilterCount > 0 && styles.filterButtonTextOn]}>
                        {activeFilterCount > 0 ? `Filters · ${activeFilterCount}` : 'Filters'}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
                {!selectMode ? (
                  <Pressable
                    accessibilityLabel={`Sorted by ${describeDiveSort(sort)}. Change sorting.`}
                    accessibilityRole="button"
                    onPress={() => setFilterOpen(true)}
                    style={styles.sortRow}
                  >
                    <Text numberOfLines={1} style={styles.sortText}>{describeDiveSort(sort)}</Text>
                    <Text style={styles.sortChange}>Change</Text>
                  </Pressable>
                ) : null}
                {!activeFolder && !selectMode && !activeFilterCount ? <StatSummaryCard stats={stats} units={units} onPress={() => setView("stats")} /> : null}
                {selectMode ? (
                  <SelectionBar
                    count={selectedIds.size}
                    total={listRows.length}
                    allSelected={allSelected}
                    onToggleAll={toggleSelectAll}
                    onDelete={handleDeleteSelected}
                    onMerge={handleMergeSelected}
                    onExport={() => chooseExportFormat([...selectedIds])}
                  />
                ) : null}
                {!selectMode && rows.length ? (
                  <SecondaryButton label="Export all dives" onPress={() => chooseExportFormat()} style={styles.exportAllButton} />
                ) : null}
                {listRows.length === 0 ? (
                  <Card style={styles.emptyCard}>
                    <Text style={styles.emptyTitle}>
                      {activeFilterCount ? 'No dives match' : 'No dives logged yet'}
                    </Text>
                    <Text style={styles.emptyBody}>
                      {activeFilterCount
                        ? `${folderRows.length} ${folderRows.length === 1 ? 'dive is' : 'dives are'} hidden by the filters you've set.`
                        : 'Add your first dive to start building your history and totals.'}
                    </Text>
                    {activeFilterCount ? (
                      <SecondaryButton label="Clear filters" onPress={clearFilter} style={styles.clearFiltersButton} />
                    ) : null}
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

        {photoImportReview ? (
          <BatchPhotoReviewModal
            review={photoImportReview}
            saving={photoImportSaving}
            onCancel={() => setPhotoImportReview(null)}
            onConfirm={confirmPhotoImport}
          />
        ) : null}

        {filterOpen ? (
          <DiveFilterSheet
            filter={filter}
            matchCount={listRows.length}
            onChange={applyFilter}
            onClear={clearFilter}
            onClose={() => setFilterOpen(false)}
            onSortChange={setSort}
            sort={sort}
            units={units}
          />
        ) : null}

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
                'Permanently removes soft-deleted dive records and clears the per-computer sync markers so they can be re-downloaded.',
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
            onRestoreBackup={async () => {
              try {
                const snapshots = await getSnapshots();
                if (!snapshots.length) {
                  Alert.alert('No backups yet', 'Backups are created automatically before purging or combining more than two dives.');
                  return;
                }
                Alert.alert('Restore a logbook backup', 'Choose a backup. Your current logbook records will be replaced.', [
                  ...snapshots.map((snapshot) => ({
                    text: `${new Date(snapshot.createdAt).toLocaleString()} · ${snapshot.keyCount} keys`,
                    onPress: () => Alert.alert('Restore this backup?', 'This replaces the current dives, logs, index, and sync metadata.', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Restore', style: 'destructive', onPress: async () => {
                        await restoreBackup(snapshot.id);
                        Alert.alert('Backup restored', 'The logbook was restored successfully.');
                      } },
                    ]),
                  })),
                  { text: 'Cancel', style: 'cancel' },
                ]);
              } catch (e) {
                Alert.alert('Restore failed', e?.message || 'Could not restore the backup.');
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
              <DiveDetail dive={record} logs={logs} primaryLog={primaryLog} units={units} onShowLog={setShownLogId} chartColors={chartColors} lineWidth={lineWidth} />
              <View style={styles.detailActions}>
                <SecondaryButton label="Edit" onPress={openEdit} style={styles.detailActionButton} />
                <SecondaryButton label="Export" onPress={() => chooseExportFormat([record.id])} style={styles.detailActionButton} />
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
  photoImportButton: { marginBottom: 14 },
  photoReviewBackdrop: { backgroundColor: 'rgba(0,0,0,0.7)', flex: 1, justifyContent: 'flex-end' },
  photoReviewSheet: { backgroundColor: colors.background, borderColor: colors.lineStrong, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderWidth: 1, maxHeight: '85%', padding: spacing.lg },
  photoReviewTitle: { color: colors.text, fontSize: 22, fontWeight: '900' },
  photoReviewSummary: { color: colors.cyan, fontSize: 14, fontWeight: '800', marginTop: 6 },
  photoReviewPrivacy: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 8 },
  photoReviewList: { marginVertical: 14 },
  photoReviewListContent: { paddingBottom: 4 },
  photoReviewRow: { alignItems: 'center', flexDirection: 'row', gap: 12, paddingVertical: 10 },
  photoReviewDivider: { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth },
  photoReviewThumb: { backgroundColor: colors.surface, borderRadius: 10, height: 62, width: 62 },
  photoReviewCopy: { flex: 1 },
  photoReviewName: { color: colors.text, fontSize: 14, fontWeight: '800' },
  photoReviewMeta: { color: colors.muted, fontSize: 11, marginTop: 3 },
  photoReviewMatched: { color: colors.cyan, fontSize: 11, fontWeight: '700', marginTop: 4 },
  photoReviewUnmatched: { color: colors.faint, fontSize: 11, marginTop: 4 },
  photoReviewAction: { marginTop: 8 },
  photoStrip: { gap: 10, paddingVertical: 4 },
  divePhoto: { borderRadius: 12, height: 140, width: 140 },
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
  selectionExport: {
    backgroundColor: 'rgba(112,221,246,0.12)', borderColor: 'rgba(112,221,246,0.4)', borderRadius: radii.sm,
    borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8,
  },
  selectionExportText: { color: colors.cyan, fontSize: 13, fontWeight: '800' },
  selectionMerge: {
    backgroundColor: 'rgba(112,221,246,0.12)', borderColor: 'rgba(112,221,246,0.4)', borderRadius: radii.sm,
    borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8,
  },
  selectionMergeText: { color: colors.cyan, fontSize: 13, fontWeight: '800' },
  exportAllButton: { marginBottom: spacing.md },

  searchRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  searchInput: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.sm,
    borderWidth: 1,
    color: colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  filterButton: {
    backgroundColor: colors.surface,
    borderColor: colors.lineStrong,
    borderRadius: radii.sm,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  filterButtonOn: { backgroundColor: colors.cyan, borderColor: colors.cyan },
  filterButtonText: { color: colors.muted, fontSize: 13, fontWeight: '800' },
  filterButtonTextOn: { color: colors.black },
  clearFiltersButton: { marginTop: spacing.md },
  detailHint: { color: colors.faint, fontSize: 11, lineHeight: 16, marginTop: 4 },
  cylinderBlock: { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, marginTop: spacing.md, paddingTop: spacing.md },
  cylinderHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs },
  cylinderTitle: { color: colors.muted, fontSize: 12, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  cylinderRemove: { color: colors.danger, fontSize: 12, fontWeight: '800' },
  addCylinder: { marginTop: spacing.md },
  sortRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    marginTop: -spacing.xs,
  },
  sortText: { color: colors.muted, flex: 1, fontSize: 12, fontWeight: '700' },
  sortChange: { color: colors.cyan, fontSize: 12, fontWeight: '800' },
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
  locationBanner: {
    alignItems: 'center',
    backgroundColor: 'rgba(112,221,246,0.08)',
    borderColor: 'rgba(112,221,246,0.3)',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    marginBottom: 14,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  locationBannerDot: { backgroundColor: colors.cyan, borderRadius: 4, height: 8, width: 8 },
  locationBannerText: { color: colors.muted, flex: 1, fontSize: 12, fontWeight: '700' },
  locationBannerCta: { color: colors.cyan, fontSize: 12, fontWeight: '900' },

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

  detailCard: { paddingTop: 14 },
  detailCardHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  detailCardTitle: { color: colors.text, fontSize: 15, fontWeight: '900' },
  detailCardChevron: { color: colors.faint, fontSize: 13, fontWeight: '900' },
  detailSubhead: { color: colors.faint, fontSize: 10, fontWeight: '900', letterSpacing: 0.7, marginTop: 12, textTransform: 'uppercase' },
  detailRow: { borderTopColor: colors.line, borderTopWidth: 1, flexDirection: 'row', gap: 12, justifyContent: 'space-between', paddingVertical: 9 },
  detailRowLabel: { color: colors.muted, fontSize: 12, flexShrink: 0 },
  detailRowValue: { color: colors.text, flex: 1, fontSize: 13, fontWeight: '700', textAlign: 'right' },
  detailNotes: { borderTopColor: colors.line, borderTopWidth: 1, color: colors.text, fontSize: 13, lineHeight: 20, marginTop: 4, paddingTop: 9 },
  detailSource: { color: colors.faint, fontSize: 11, marginBottom: 8, marginTop: 4, textAlign: 'center' },
  detailActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 },
  detailActionButton: { flexGrow: 1, minWidth: 100 },
  detailShownFrom: { color: colors.cyan, fontSize: 11, fontWeight: '700', marginBottom: 8 },
  shareButton: { marginBottom: 12 },
  diveHero: { backgroundColor: '#0A2638', borderColor: 'rgba(112,221,246,.3)', padding: 18 },
  diveHeroEyebrow: { color: colors.cyan, fontSize: 10, fontWeight: '900', letterSpacing: 1.5, marginBottom: 6 },
  diveHeroTitle: { color: colors.text, fontSize: 25, fontWeight: '900', letterSpacing: -0.5, lineHeight: 29 },
  diveHeroMeta: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 6 },
  profileMetric: { backgroundColor: 'rgba(2,10,18,.52)', borderColor: colors.line, borderRadius: radii.md, borderWidth: 1, flexBasis: '46%', flexGrow: 1, minHeight: 66, paddingHorizontal: 11, paddingVertical: 10 },
  profileMetricLabel: { color: colors.faint, fontSize: 9, fontWeight: '800', letterSpacing: 0.7, textTransform: 'uppercase' },
  profileMetricValue: { fontSize: 16, fontWeight: '900', marginTop: 4 },
  // At-a-glance row under the profile chart: 3 tiles per line on typical
  // phone widths, reflowing to 2 on narrower ones via flexGrow.
  keyStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  keyStat: { flexBasis: '30%', minHeight: 60 },
  // The per-computer rows override this colour to match their trace; the
  // hand-entered cylinder headings rely on the default.
  airFrom: { color: colors.muted, fontSize: 11, fontWeight: '800', marginTop: 8 },
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

  profileCard: { overflow: 'hidden', paddingTop: 15 },
  profileCardFullscreen: { borderRadius: radii.lg, flex: 1, marginBottom: 0, paddingBottom: 8, paddingHorizontal: 12, paddingTop: 10 },
  profileHeader: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  profileHeaderFullscreen: { alignItems: 'center', marginBottom: 6 },
  profileHeaderDetails: { flex: 1, marginHorizontal: 18, minWidth: 0 },
  profileHeaderActions: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  profileEyebrow: { color: colors.cyan, fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },
  profileTitle: { color: colors.text, fontSize: 17, fontWeight: '900', marginTop: 3 },
  profileDuration: { color: colors.muted, fontSize: 11, fontWeight: '800', marginTop: 3 },
  expandButton: { alignItems: 'center', backgroundColor: 'rgba(112,221,246,.1)', borderColor: colors.lineStrong, borderRadius: radii.sm, borderWidth: 1, height: 34, justifyContent: 'center', width: 38 },
  expandIcon: { color: colors.cyan, fontSize: 21, fontWeight: '800', lineHeight: 23 },
  scrubBar: { backgroundColor: 'rgba(2,10,18,.52)', borderColor: colors.line, borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', marginTop: 2, overflow: 'hidden' },
  scrubBarFullscreen: { marginTop: 0 },
  overlayControls: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 7 },
  overlayControlsLabel: { color: colors.faint, fontSize: 8, fontWeight: '900', letterSpacing: 0.8, marginRight: 2 },
  overlayToggle: { alignItems: 'center', backgroundColor: 'rgba(2,10,18,.4)', borderColor: colors.line, borderRadius: radii.pill, borderWidth: 1, flexDirection: 'row', gap: 5, paddingHorizontal: 9, paddingVertical: 5 },
  overlayToggleActive: { backgroundColor: 'rgba(112,221,246,.1)', borderColor: colors.lineStrong },
  overlayDot: { borderRadius: 3, height: 6, width: 6 },
  overlayToggleText: { color: colors.faint, fontSize: 9, fontWeight: '800' },
  overlayToggleTextActive: { color: colors.text },
  scrubValue: { flex: 1, minWidth: 0, paddingHorizontal: 9, paddingVertical: 9 },
  scrubValueCompact: { paddingHorizontal: 7, paddingVertical: 6 },
  scrubValueLabel: { color: colors.faint, fontSize: 8, fontWeight: '900', letterSpacing: 0.7, textTransform: 'uppercase' },
  scrubValueText: { fontSize: 15, fontWeight: '900', marginTop: 3 },
  scrubHint: { color: colors.faint, fontSize: 9, marginBottom: 2, marginTop: 6, textAlign: 'center' },
  chartPlot: { marginTop: 4 },
  chartPlotFullscreen: { alignSelf: 'center' },
  pressureReadouts: { borderTopColor: colors.line, borderTopWidth: 1, gap: 5, marginTop: 5, paddingTop: 8 },
  pressureReadout: { alignItems: 'center', flexDirection: 'row', gap: 6, minHeight: 20 },
  pressureDot: { borderRadius: 3, height: 6, width: 6 },
  pressureName: { color: colors.muted, flex: 1, fontSize: 10, fontWeight: '700' },
  pressureValue: { fontSize: 11, fontWeight: '900' },
  chartLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 7 },
  legendItem: { alignItems: 'center', flexDirection: 'row', flexShrink: 1, gap: 5 },
  legendSwatch: { borderRadius: 2, height: 3, width: 14 },
  legendText: { color: colors.muted, flexShrink: 1, fontSize: 10, fontWeight: '700' },
  fullscreenProfile: { backgroundColor: colors.background, flex: 1 },
  // No flex here: this is the sole child of a column-direction parent
  // (profileHeaderDetails) with no fixed height. `flex: 1` implies
  // flexBasis: 0%, which made Yoga size this box as if it had no content —
  // its two rows still painted, but overflowed past the (near-zero) box
  // instead of pushing the header taller, landing on top of the overlay
  // toggles rendered right after it. Sizing to content keeps the header
  // (and the space reserved after it) tall enough for both rows.
  fullscreenMeta: { gap: 5, marginVertical: 1, minWidth: 0 },
  fullscreenMetaRow: { alignItems: 'center', flexDirection: 'row', gap: 14, minWidth: 0 },
  fullscreenMetaItem: { minWidth: 0 },
  // Both metadata rows share these column weights so the block reads as a
  // 2x4 table: max depth under date, water temp under start, and so on. The
  // trailing columns carry more weight because site names, gas mixes and
  // computer models are the longest values in the block.
  fullscreenMetaCol1: { flex: 1 },
  fullscreenMetaCol2: { flex: 1 },
  fullscreenMetaCol3: { flex: 1.35 },
  fullscreenMetaCol4: { flex: 1.5 },
  fullscreenMetaLabel: { color: colors.faint, fontSize: 7, fontWeight: '900', letterSpacing: 0.8, marginBottom: 2 },
  fullscreenMetaValue: { color: colors.muted, fontSize: 10, fontWeight: '800' },
  fullscreenClose: { alignItems: 'center', backgroundColor: colors.surfaceSoft, borderColor: colors.lineStrong, borderRadius: radii.pill, borderWidth: 1, height: 36, justifyContent: 'center', width: 36 },
  fullscreenCloseText: { color: colors.text, fontSize: 17, fontWeight: '800' },

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
