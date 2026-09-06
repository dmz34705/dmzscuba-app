// The editing controls under the card preview: four small tabs, each holding
// one short row of choices, so the preview keeps most of the screen.
//
// This file is presentation only — it renders the option model from
// shareCardOptions.js and reports changes back up. It holds no state of its
// own beyond which tab is open, and knows nothing about photos, capture, or
// sharing (DiveShareCardScreen owns all of that).

import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { colors, radii, spacing } from '../../theme';
import {
  ASPECT_PRESETS,
  DETAIL_LEVELS,
  MAX_CARD_STATS,
  MAX_WATERMARK_LENGTH,
  MIN_CARD_STATS,
  PROFILE_STYLES,
  STAT_FIELDS,
  TEXT_SIZES,
  hasStatValue,
  toggleStat,
} from './shareCardOptions';
import { SHARE_CARD_THEMES } from './themes';

// Workflow order: pick the picture, choose the output shape, style it, then
// decide what data rides along. The first tab is open by default for that
// reason — a card with no photo yet is the common starting point.
const TABS = [
  { key: 'photo', label: 'Photo' },
  { key: 'shape', label: 'Shape' },
  { key: 'style', label: 'Style' },
  { key: 'chart', label: 'Chart' },
  { key: 'stats', label: 'Stats' },
];

function Segmented({ accessibilityLabel, options, value, onChange }) {
  return (
    <View accessibilityLabel={accessibilityLabel} accessibilityRole="tablist" style={styles.segmented}>
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <Pressable
            accessibilityLabel={option.label}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            key={option.key}
            onPress={() => onChange(option.key)}
            style={[styles.segment, selected && styles.segmentSelected]}
          >
            <Text numberOfLines={1} style={[styles.segmentLabel, selected && styles.segmentLabelSelected]}>
              {option.label}
            </Text>
            {option.hint ? (
              <Text numberOfLines={1} style={[styles.segmentHint, selected && styles.segmentHintSelected]}>
                {option.hint}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function Chip({ label, selected, disabled, onPress }) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected, disabled && styles.chipDisabled]}
    >
      <Text numberOfLines={1} style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{label}</Text>
    </Pressable>
  );
}

function ThemeSwatch({ theme, selected, onPress }) {
  return (
    <Pressable
      accessibilityLabel={`${theme.label} style`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={styles.swatchWrap}
    >
      <LinearGradient
        colors={theme.swatch}
        end={{ x: 1, y: 1 }}
        start={{ x: 0, y: 0 }}
        style={[styles.swatch, selected && styles.swatchSelected]}
      />
      <Text numberOfLines={1} style={[styles.swatchLabel, selected && styles.swatchLabelSelected]}>{theme.label}</Text>
    </Pressable>
  );
}

/**
 * @param {object} props
 * @param {object} props.options          the sanitized share-card option set
 * @param {(patch: object) => void} props.onOptionsChange
 * @param {string} props.themeKey
 * @param {(key: string) => void} props.onThemeChange
 * @param {string} [props.photoUri]
 * @param {() => void} props.onPickPhoto
 * @param {() => void} props.onClearPhoto
 * @param {Record<string, string|null>} props.statValues  which stats this dive actually has
 */
export default function ShareCardControls({
  options,
  onOptionsChange,
  themeKey,
  onThemeChange,
  photoUri,
  onPickPhoto,
  onClearPhoto,
  statValues,
}) {
  const [tab, setTab] = useState('photo');
  const atStatLimit = options.statKeys.length >= MAX_CARD_STATS;

  return (
    <View style={styles.wrap}>
      <View style={styles.tabBar}>
        {TABS.map((entry) => {
          const selected = entry.key === tab;
          return (
            <Pressable
              accessibilityLabel={entry.label}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              key={entry.key}
              onPress={() => setTab(entry.key)}
              style={styles.tab}
            >
              <Text style={[styles.tabLabel, selected && styles.tabLabelSelected]}>{entry.label}</Text>
              <View style={[styles.tabRule, selected && styles.tabRuleSelected]} />
            </Pressable>
          );
        })}
      </View>

      <View style={styles.panel}>
        {tab === 'shape' ? (
          <View style={styles.rows}>
            <Segmented
              accessibilityLabel="Card shape"
              onChange={(key) => onOptionsChange({ aspectKey: key })}
              options={ASPECT_PRESETS}
              value={options.aspectKey}
            />
            <Segmented
              accessibilityLabel="How much detail"
              onChange={(key) => onOptionsChange({ detailKey: key })}
              options={DETAIL_LEVELS}
              value={options.detailKey}
            />
          </View>
        ) : null}

        {tab === 'style' ? (
          <View style={styles.rows}>
            <ScrollView
              contentContainerStyle={styles.swatchRow}
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.swatchScroll}
            >
              {SHARE_CARD_THEMES.map((theme) => (
                <ThemeSwatch
                  key={theme.key}
                  onPress={() => onThemeChange(theme.key)}
                  selected={theme.key === themeKey}
                  theme={theme}
                />
              ))}
            </ScrollView>
            <Segmented
              accessibilityLabel="Text size"
              onChange={(key) => onOptionsChange({ textKey: key })}
              options={TEXT_SIZES}
              value={options.textKey}
            />
          </View>
        ) : null}

        {tab === 'photo' ? (
          <View style={styles.rows}>
            <View style={styles.chipRow}>
              <Chip label={photoUri ? 'Change photo' : 'Choose a photo'} onPress={onPickPhoto} selected={!!photoUri} />
              <Chip
                disabled={!photoUri}
                label="Plain background"
                onPress={onClearPhoto}
                selected={!photoUri}
              />
            </View>
            <Text style={styles.hint}>
              {photoUri
                ? 'The card frames the whole photo — no cropping needed.'
                : 'No photo: the card uses the selected style’s own gradient.'}
            </Text>
          </View>
        ) : null}

        {tab === 'chart' ? (
          <ScrollView
            contentContainerStyle={styles.statsScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.statsWrap}
          >
            <View style={styles.chipRow}>
              {PROFILE_STYLES.map((style) => (
                <Chip
                  key={style.key}
                  label={style.label}
                  onPress={() => onOptionsChange({ profileKey: style.key })}
                  selected={style.key === options.profileKey}
                />
              ))}
            </View>
            <Text style={styles.hint}>
              Auto uses each style’s own signature curve — pick another to lock it across all four.
            </Text>
          </ScrollView>
        ) : null}

        {tab === 'stats' ? (
          <ScrollView
            contentContainerStyle={styles.statsScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.statsWrap}
          >
            <View style={styles.chipRow}>
              {STAT_FIELDS.map((field) => {
                const selected = options.statKeys.includes(field.key);
                const missing = !hasStatValue(statValues, field.key);
                return (
                  <Chip
                    disabled={missing || (!selected && atStatLimit)}
                    key={field.key}
                    label={field.label}
                    onPress={() => onOptionsChange({ statKeys: toggleStat(options.statKeys, field.key) })}
                    selected={selected}
                  />
                );
              })}
            </View>
            <View style={styles.chipRow}>
              <Chip
                label="Depth scale"
                onPress={() => onOptionsChange({ showDepthAxis: !options.showDepthAxis })}
                selected={options.showDepthAxis}
              />
              <Text style={styles.hint}>
                {`Pick up to ${MAX_CARD_STATS} (at least ${MIN_CARD_STATS}). Greyed-out stats aren’t recorded for this dive.`}
              </Text>
            </View>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Signature</Text>
              <TextInput
                accessibilityLabel="Card signature text"
                autoCapitalize="words"
                autoCorrect={false}
                maxLength={MAX_WATERMARK_LENGTH}
                onChangeText={(text) => onOptionsChange({ watermark: text })}
                placeholder="Leave blank for none"
                placeholderTextColor={colors.faint}
                returnKeyType="done"
                style={styles.input}
                value={options.watermark}
              />
            </View>
          </ScrollView>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  tabBar: { flexDirection: 'row', justifyContent: 'space-between' },
  tab: { alignItems: 'center', flex: 1, gap: 6 },
  tabLabel: { color: colors.faint, fontSize: 13, fontWeight: '800', letterSpacing: 0.2 },
  tabLabelSelected: { color: colors.text },
  tabRule: { backgroundColor: 'transparent', borderRadius: 2, height: 2, width: '100%' },
  tabRuleSelected: { backgroundColor: colors.cyan },
  // A fixed height, so switching tabs never resizes the preview above it —
  // the card would otherwise re-fit and visibly jump on every tab tap.
  panel: { height: 96, justifyContent: 'center' },
  rows: { gap: spacing.sm },
  segmented: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    flexDirection: 'row',
    gap: 3,
    padding: 3,
  },
  segment: { alignItems: 'center', borderRadius: radii.sm, flex: 1, paddingVertical: 7 },
  segmentSelected: { backgroundColor: colors.cyan },
  segmentLabel: { color: colors.muted, fontSize: 13, fontWeight: '800' },
  segmentLabelSelected: { color: colors.black },
  segmentHint: { color: colors.faint, fontSize: 10, fontWeight: '700', marginTop: 1 },
  segmentHintSelected: { color: 'rgba(2,6,11,0.65)' },
  // flexGrow: 0 is load-bearing — RN bakes flexGrow: 1 into every ScrollView,
  // and a growing row here steals the preview's height (see the same fix on
  // statsWrap).
  swatchScroll: { flexGrow: 0 },
  swatchRow: { flexDirection: 'row', gap: spacing.md, paddingHorizontal: 2 },
  swatchWrap: { alignItems: 'center', width: 58 },
  swatch: { borderColor: 'transparent', borderRadius: radii.md, borderWidth: 2, height: 34, width: 34 },
  swatchSelected: { borderColor: colors.cyan },
  swatchLabel: { color: colors.faint, fontSize: 10, fontWeight: '700', marginTop: 4 },
  swatchLabelSelected: { color: colors.text },
  chipRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  chipSelected: { backgroundColor: colors.cyan, borderColor: colors.cyan },
  chipDisabled: { opacity: 0.35 },
  chipLabel: { color: colors.muted, fontSize: 12.5, fontWeight: '800' },
  chipLabelSelected: { color: colors.black },
  statsWrap: { flexGrow: 0 },
  statsScroll: { gap: 8, paddingVertical: 2 },
  hint: { color: colors.faint, flex: 1, fontSize: 11, lineHeight: 15 },
  field: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  fieldLabel: { color: colors.faint, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.sm,
    borderWidth: 1,
    color: colors.text,
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
});
