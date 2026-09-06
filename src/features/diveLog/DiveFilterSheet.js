// The detailed dive filter, as a sheet over the logbook list.
//
// Every threshold is held in canonical SI by lib/diveLog/filterDives.js; this
// file is the presentation edge that converts to and from the user's chosen
// units, exactly like the dive form does. Filtering applies live rather than
// behind an Apply button, so the "Show N dives" count in the footer tells you
// what a criterion did before you commit to it.

import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PrimaryButton } from '../../components/Ui';
import useKeyboardOverlap from '../../components/useKeyboardOverlap';
import { colors, radii, spacing } from '../../theme';
import {
  DIVE_MODES,
  DIVE_SORT_FIELDS,
  DIVE_SOURCES,
  DIVE_TYPES,
  GAS_KINDS,
  WATER_TYPES,
  countActiveFilters,
  getDiveSortField,
  depthToInput,
  minutesToInput,
  parseDepthInput,
  parseMinutesInput,
  parsePressureInput,
  parseTemperatureInput,
  pressureToInput,
  temperatureToInput,
} from '../../lib/diveLog';

const MODE_LABELS = { oc: 'Open circuit', ccr: 'CCR', scr: 'SCR', gauge: 'Gauge', freedive: 'Freedive' };
const SOURCE_LABELS = { manual: 'Manual', import: 'Imported', computer: 'Computer', mixed: 'Mixed' };
const WATER_LABELS = { salt: 'Salt', fresh: 'Fresh' };

function titleCase(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

/**
 * A min/max pair. `toInput`/`fromInput` move between the stored canonical
 * value and what the field shows, so the caller never converts by hand.
 */
function RangeRow({ label, range, onChange, unit, toInput, fromInput, keyboardType = 'decimal-pad' }) {
  const show = (value) => (value === null ? '' : String(toInput ? toInput(value) : value));
  const parse = (text) => {
    if (!text.trim()) return null;
    const parsed = fromInput ? fromInput(text) : Number(text);
    return Number.isFinite(parsed) ? parsed : null;
  };
  return (
    <View style={styles.rangeRow}>
      <Text style={styles.rangeLabel}>{label}</Text>
      <View style={styles.rangeInputs}>
        <TextInput
          accessibilityLabel={`Minimum ${label}`}
          keyboardType={keyboardType}
          onChangeText={(text) => onChange({ ...range, min: parse(text) })}
          placeholder="Min"
          placeholderTextColor={colors.faint}
          style={styles.rangeInput}
          value={show(range.min)}
        />
        <Text style={styles.rangeDash}>–</Text>
        <TextInput
          accessibilityLabel={`Maximum ${label}`}
          keyboardType={keyboardType}
          onChangeText={(text) => onChange({ ...range, max: parse(text) })}
          placeholder="Max"
          placeholderTextColor={colors.faint}
          style={styles.rangeInput}
          value={show(range.max)}
        />
        {unit ? <Text style={styles.rangeUnit}>{unit}</Text> : null}
      </View>
    </View>
  );
}

function ChipGroup({ options, selected, onToggle }) {
  return (
    <View style={styles.chipRow}>
      {options.map((option) => {
        const isOn = selected.includes(option.key);
        return (
          <Pressable
            accessibilityLabel={option.label}
            accessibilityRole="button"
            accessibilityState={{ selected: isOn }}
            key={option.key}
            onPress={() => onToggle(option.key)}
            style={[styles.chip, isOn && styles.chipOn]}
          >
            <Text numberOfLines={1} style={[styles.chipLabel, isOn && styles.chipLabelOn]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * @param {object} props
 * @param {object} props.filter        the sanitized filter
 * @param {(patch: object) => void} props.onChange
 * @param {() => void} props.onClear
 * @param {() => void} props.onClose
 * @param {number} props.matchCount    how many dives currently pass
 * @param {object} props.sort          the sanitized sort
 * @param {(sort: object) => void} props.onSortChange
 * @param {object} props.units         the user's unit preferences
 */
export default function DiveFilterSheet({ filter, onChange, onClear, onClose, matchCount, sort, onSortChange, units }) {
  const insets = useSafeAreaInsets();
  const keyboardOverlap = useKeyboardOverlap();
  const activeCount = useMemo(() => countActiveFilters(filter), [filter]);

  const toggleIn = (key, value) => {
    const current = filter[key];
    onChange({ [key]: current.includes(value) ? current.filter((item) => item !== value) : [...current, value] });
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible>
      <View style={[styles.screen, { paddingBottom: keyboardOverlap }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Filter &amp; sort</Text>
          <Pressable accessibilityLabel="Done" accessibilityRole="button" hitSlop={8} onPress={onClose}>
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={styles.scroll}
        >
          <Section title="Sort by">
            <ChipGroup
              onToggle={(key) => onSortChange({ key, direction: getDiveSortField(key).defaultDirection })}
              options={DIVE_SORT_FIELDS.map((field) => ({ key: field.key, label: field.label }))}
              selected={[sort.key]}
            />
            {/* The direction labels come from the field, because "ascending"
                is not what a diver means: on SAC rate the useful end is the
                low one, on date it's the recent one. */}
            <View style={styles.segmented}>
              {['asc', 'desc'].map((direction) => {
                const field = getDiveSortField(sort.key);
                const isOn = sort.direction === direction;
                return (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: isOn }}
                    key={direction}
                    onPress={() => onSortChange({ ...sort, direction })}
                    style={[styles.segment, isOn && styles.segmentOn]}
                  >
                    <Text numberOfLines={1} style={[styles.segmentLabel, isOn && styles.segmentLabelOn]}>
                      {direction === 'asc' ? field.ascLabel : field.descLabel}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Section>

          <Section title="Date">
            <View style={styles.rangeInputs}>
              <TextInput
                accessibilityLabel="From date"
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={(text) => onChange({ dateFrom: text.trim() || null })}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.faint}
                style={styles.rangeInput}
                value={filter.dateFrom || ''}
              />
              <Text style={styles.rangeDash}>–</Text>
              <TextInput
                accessibilityLabel="To date"
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={(text) => onChange({ dateTo: text.trim() || null })}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={colors.faint}
                style={styles.rangeInput}
                value={filter.dateTo || ''}
              />
            </View>
          </Section>

          <Section title="The numbers">
            <RangeRow
              fromInput={(text) => parseDepthInput(text, units.depthUnit)}
              label="Max depth"
              onChange={(range) => onChange({ depthMeters: range })}
              range={filter.depthMeters}
              toInput={(meters) => depthToInput(meters, units.depthUnit)}
              unit={units.depthUnit}
            />
            <RangeRow
              fromInput={parseMinutesInput}
              label="Duration"
              onChange={(range) => onChange({ durationSeconds: range })}
              range={filter.durationSeconds}
              toInput={minutesToInput}
              unit="min"
            />
            <RangeRow
              fromInput={(text) => parseTemperatureInput(text, units.temperatureUnit)}
              label="Temperature"
              onChange={(range) => onChange({ tempC: range })}
              range={filter.tempC}
              toInput={(celsius) => temperatureToInput(celsius, units.temperatureUnit)}
              unit={`°${units.temperatureUnit}`}
            />
            <RangeRow
              label="Rating"
              onChange={(range) => onChange({ rating: range })}
              range={filter.rating}
              unit="★"
              keyboardType="number-pad"
            />
          </Section>

          <Section title="Gas & consumption">
            <ChipGroup onToggle={(key) => toggleIn('gasKinds', key)} options={GAS_KINDS} selected={filter.gasKinds} />
            <RangeRow
              fromInput={(text) => parsePressureInput(text, units.pressureUnit)}
              label="SAC rate"
              onChange={(range) => onChange({ sacBarPerMin: range })}
              range={filter.sacBarPerMin}
              toInput={(bar) => pressureToInput(bar, units.pressureUnit)}
              unit={`${units.pressureUnit}/min`}
            />
            <RangeRow
              label="Oxygen"
              onChange={(range) => onChange({ o2Percent: range })}
              range={filter.o2Percent}
              unit="%"
              keyboardType="number-pad"
            />
          </Section>

          <Section title="Dive type">
            <ChipGroup
              onToggle={(key) => toggleIn('types', key)}
              options={DIVE_TYPES.map((type) => ({ key: type, label: titleCase(type) }))}
              selected={filter.types}
            />
          </Section>

          <Section title="Water">
            <ChipGroup
              onToggle={(key) => toggleIn('waterTypes', key)}
              options={WATER_TYPES.map((type) => ({ key: type, label: WATER_LABELS[type] || titleCase(type) }))}
              selected={filter.waterTypes}
            />
          </Section>

          <Section title="Mode">
            <ChipGroup
              onToggle={(key) => toggleIn('modes', key)}
              options={DIVE_MODES.map((mode) => ({ key: mode, label: MODE_LABELS[mode] || mode.toUpperCase() }))}
              selected={filter.modes}
            />
          </Section>

          <Section title="Where it came from">
            <ChipGroup
              onToggle={(key) => toggleIn('sources', key)}
              options={DIVE_SOURCES.map((source) => ({ key: source, label: SOURCE_LABELS[source] || titleCase(source) }))}
              selected={filter.sources}
            />
            <View style={styles.chipRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: filter.hasComputer === true }}
                onPress={() => onChange({ hasComputer: filter.hasComputer === true ? null : true })}
                style={[styles.chip, filter.hasComputer === true && styles.chipOn]}
              >
                <Text style={[styles.chipLabel, filter.hasComputer === true && styles.chipLabelOn]}>
                  Has computer data
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: filter.hasComputer === false }}
                onPress={() => onChange({ hasComputer: filter.hasComputer === false ? null : false })}
                style={[styles.chip, filter.hasComputer === false && styles.chipOn]}
              >
                <Text style={[styles.chipLabel, filter.hasComputer === false && styles.chipLabelOn]}>
                  Hand-logged only
                </Text>
              </Pressable>
            </View>
          </Section>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: spacing.lg + (keyboardOverlap > 0 ? 0 : insets.bottom) }]}>
          <Pressable
            accessibilityLabel="Clear all filters"
            accessibilityRole="button"
            disabled={!activeCount}
            onPress={onClear}
            style={styles.clearButton}
          >
            <Text style={[styles.clearText, !activeCount && styles.clearTextDisabled]}>
              {activeCount ? `Clear ${activeCount}` : 'Nothing set'}
            </Text>
          </Pressable>
          <PrimaryButton
            label={matchCount === 1 ? 'Show 1 dive' : `Show ${matchCount} dives`}
            onPress={onClose}
            style={styles.showButton}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  title: { color: colors.text, fontSize: 18, fontWeight: '900' },
  doneText: { color: colors.cyan, fontSize: 15, fontWeight: '800' },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: spacing.lg, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  section: { gap: spacing.sm, marginBottom: spacing.lg },
  sectionTitle: { color: colors.faint, fontSize: 11, fontWeight: '900', letterSpacing: 1.4, textTransform: 'uppercase' },
  rangeRow: { gap: 6 },
  rangeLabel: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  rangeInputs: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  rangeInput: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.sm,
    borderWidth: 1,
    color: colors.text,
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  rangeDash: { color: colors.faint, fontSize: 14, fontWeight: '800' },
  rangeUnit: { color: colors.muted, fontSize: 12, fontWeight: '800', minWidth: 46 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  segmented: { backgroundColor: colors.surface, borderRadius: radii.md, flexDirection: 'row', gap: 3, padding: 3 },
  segment: { alignItems: 'center', borderRadius: radii.sm, flex: 1, paddingVertical: 8 },
  segmentOn: { backgroundColor: colors.cyan },
  segmentLabel: { color: colors.muted, fontSize: 13, fontWeight: '800' },
  segmentLabelOn: { color: colors.black },
  chip: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipOn: { backgroundColor: colors.cyan, borderColor: colors.cyan },
  chipLabel: { color: colors.muted, fontSize: 12.5, fontWeight: '800' },
  chipLabelOn: { color: colors.black },
  footer: {
    alignItems: 'center',
    borderTopColor: colors.line,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  clearButton: { paddingVertical: 10 },
  clearText: { color: colors.danger, fontSize: 14, fontWeight: '800' },
  clearTextDisabled: { color: colors.faint },
  showButton: { flex: 1 },
});
