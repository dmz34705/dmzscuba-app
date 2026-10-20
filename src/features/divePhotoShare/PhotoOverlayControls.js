// The editor's bottom toolbar: a strip of controls for the active tool (at
// most two short rows) above the tool tabs, laid out like a photo editor so
// the photo keeps most of the screen. Chips, swatches, and segmented controls
// are the dive share card's own (ShareCardControls.js).
//
// Presentation only: renders the overlay settings, the per-photo crop, and the
// pin, and reports changes up. DivePhotoShareScreen owns all of the state.

import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Slider from '@react-native-community/slider';
import Svg, { Circle, Path } from 'react-native-svg';

import { colors, radii, spacing } from '../../theme';
import { Chip, Segmented, ThemeSwatch } from '../diveShareCard/ShareCardControls';
import { PROFILE_STYLES } from '../diveShareCard/shareCardOptions';
import { SHARE_CARD_THEMES } from '../diveShareCard/themes';
import {
  CROP_ASPECTS,
  INFO_FIELDS,
  MAX_SIGNATURE_TEXT,
  MAX_STRAIGHTEN_DEGREES,
  OVERLAY_TEXT_SIZES,
  PROFILE_SIZES,
  SIGNATURE_FONTS,
  SIGNATURE_MODES,
  SIGNATURE_SIZES,
  hasInfoValue,
  toggleInfoKey,
} from './photoOverlayOptions';

// Framing first: people crop before anything else, and the photo's drag and
// pinch are only live while this tool is open.
export const EDITOR_TOOLS = [
  { key: 'crop', label: 'Crop' },
  { key: 'style', label: 'Style' },
  { key: 'chart', label: 'Chart' },
  { key: 'info', label: 'Info' },
  { key: 'sign', label: 'Sign' },
];

// Line icons for the tool bar, drawn rather than taken from a font so they
// look the same on every device.
function ToolIcon({ tool, color }) {
  const stroke = { fill: 'none', stroke: color, strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: 1.8 };
  return (
    <Svg height={22} viewBox="0 0 24 24" width={22}>
      {tool === 'crop' ? (
        <>
          <Path d="M6 2 V18 H22" {...stroke} />
          <Path d="M2 6 H18 V22" {...stroke} />
        </>
      ) : null}
      {tool === 'style' ? (
        <>
          <Circle cx={12} cy={12} r={9} {...stroke} />
          <Path d="M12 3 A9 9 0 0 1 12 21 Z" fill={color} />
        </>
      ) : null}
      {tool === 'chart' ? (
        <>
          <Path d="M2 5 C5 5 5 15 9 15 S13 12 15 13 S19 18 22 5" {...stroke} />
          <Circle cx={15} cy={9} fill={color} r={2.4} />
        </>
      ) : null}
      {tool === 'info' ? (
        <>
          <Path d="M3 6 H21" {...stroke} />
          <Path d="M3 12 H16" {...stroke} />
          <Path d="M3 18 H12" {...stroke} />
        </>
      ) : null}
      {tool === 'sign' ? (
        <Path d="M2 17 C5 9 8 7 8 11 C8 15 6 19 9 17 C12 15 13 10 15 12 C17 14 18 17 22 15" {...stroke} />
      ) : null}
    </Svg>
  );
}

function formatClock(seconds) {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

// One horizontally scrolling row of chips. flexGrow: 0 is load-bearing — RN
// bakes flexGrow: 1 into every ScrollView, and a growing row would eat the
// photo's height.
function ChipStrip({ children }) {
  return (
    <ScrollView
      contentContainerStyle={styles.strip}
      horizontal
      keyboardShouldPersistTaps="handled"
      showsHorizontalScrollIndicator={false}
      style={styles.stripScroll}
    >
      {children}
    </ScrollView>
  );
}

function SliderRow({ label, value, display, min, max, step, onChange, onStart, onEnd, disabled, accessibilityLabel }) {
  return (
    <View style={styles.sliderRow}>
      <Text style={styles.sliderLabel}>{label}</Text>
      <Slider
        accessibilityLabel={accessibilityLabel || label}
        disabled={disabled}
        maximumTrackTintColor={colors.line}
        maximumValue={max}
        minimumTrackTintColor={colors.cyan}
        minimumValue={min}
        onSlidingComplete={onEnd}
        onSlidingStart={onStart}
        onValueChange={onChange}
        step={step}
        style={styles.slider}
        thumbTintColor={disabled ? colors.faint : colors.cyan}
        {...(value === undefined ? {} : { value })}
      />
      <Text style={styles.sliderValue}>{display}</Text>
    </View>
  );
}

const CHART_SECTIONS = [
  { key: 'pin', label: 'Pin' },
  { key: 'curve', label: 'Curve' },
  { key: 'layout', label: 'Layout' },
];

const PROFILE_SIDES = [
  { key: 'left', label: 'Left' },
  { key: 'right', label: 'Right' },
];

// The small section picker inside a tool, like the Photos editor's
// "Adjust · Filters · Crop" row.
function SubTabs({ options, value, onChange }) {
  return (
    <View accessibilityRole="tablist" style={styles.subTabs}>
      {options.map((option) => {
        const selected = option.key === value;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            hitSlop={6}
            key={option.key}
            onPress={() => onChange(option.key)}
            style={[styles.subTab, selected && styles.subTabSelected]}
          >
            <Text style={[styles.subTabLabel, selected && styles.subTabLabelSelected]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// An on/off pill: a dot that fills when on.
function Toggle({ label, value, onPress }) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      hitSlop={6}
      onPress={onPress}
      style={[styles.toggle, value && styles.toggleOn]}
    >
      <View style={[styles.toggleDot, value && styles.toggleDotOn]} />
      <Text style={[styles.toggleLabel, value && styles.toggleLabelOn]}>{label}</Text>
    </Pressable>
  );
}

// A tight grid cell, so all eight curve styles fit in two rows.
function CompactOption({ label, selected, onPress }) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.cell, selected && styles.cellSelected]}
    >
      <Text numberOfLines={1} style={[styles.cellLabel, selected && styles.cellLabelSelected]}>{label}</Text>
    </Pressable>
  );
}

function Note({ children }) {
  return <Text numberOfLines={2} style={styles.note}>{children}</Text>;
}

/**
 * @param {object} props
 * @param {string} props.tool
 * @param {(tool: string) => void} props.onToolChange
 * @param {object} props.options                  sanitized overlay settings
 * @param {(patch: object) => void} props.onOptionsChange
 * @param {object} props.crop
 * @param {(patch: object) => void} props.onCropChange
 * @param {() => void} props.onCropReset
 * @param {boolean} props.hasProfile              the dive has samples to draw
 * @param {{ start: number, end: number }|null} props.span
 * @param {string} props.pinMode                  'auto' | 'manual' | 'off'
 * @param {number|null} props.pinSeconds          where the pin currently is
 * @param {boolean} props.hasPhotoTime
 * @param {(seconds: number) => void} props.onPinMove
 * @param {(mode: string) => void} props.onPinModeChange
 * @param {Record<string, string|null>} props.infoValues
 * @param {() => void} props.onDrawSignature
 * @param {number} props.bottomInset
 */
export default function PhotoOverlayControls({
  tool,
  onToolChange,
  options,
  onOptionsChange,
  crop,
  onCropChange,
  onCropReset,
  hasProfile,
  span,
  pinMode,
  pinSeconds,
  hasPhotoTime,
  onPinMove,
  onPinModeChange,
  infoValues,
  onDrawSignature,
  bottomInset = 0,
}) {
  // A slider driven by its own position while the finger is down; feeding the
  // resolved value back every frame makes the thumb stutter.
  const [sliding, setSliding] = useState(false);
  // Chart has more settings than one strip holds, so it splits into three
  // small sections, each fitting on screen without scrolling.
  const [chartSection, setChartSection] = useState('pin');

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(bottomInset, spacing.sm) }]}>
      <View style={styles.toolArea}>
        {tool === 'crop' ? (
          <>
            <ChipStrip>
              {CROP_ASPECTS.map((aspect) => (
                <Chip
                  key={aspect.key}
                  label={aspect.label}
                  onPress={() => onCropChange({ aspectKey: aspect.key })}
                  selected={crop.aspectKey === aspect.key}
                />
              ))}
              <View style={styles.divider} />
              <Chip label="⟲ Rotate" onPress={() => onCropChange({ quarterTurns: (crop.quarterTurns + 3) % 4 })} selected={false} />
              <Chip label="⇋ Flip" onPress={() => onCropChange({ flip: !crop.flip })} selected={crop.flip} />
              <Chip label="Reset" onPress={onCropReset} selected={false} />
            </ChipStrip>
            <SliderRow
              display={`${crop.straighten > 0 ? '+' : ''}${crop.straighten.toFixed(1)}°`}
              label="Straighten"
              max={MAX_STRAIGHTEN_DEGREES}
              min={-MAX_STRAIGHTEN_DEGREES}
              onChange={(value) => onCropChange({ straighten: Math.round(value * 2) / 2 })}
              step={0.5}
              value={crop.straighten}
            />
          </>
        ) : null}

        {tool === 'style' ? (
          <>
            <ChipStrip>
              {SHARE_CARD_THEMES.map((theme) => (
                <ThemeSwatch
                  key={theme.key}
                  onPress={() => onOptionsChange({ themeKey: theme.key })}
                  selected={theme.key === options.themeKey}
                  theme={theme}
                />
              ))}
            </ChipStrip>
            <View style={styles.inline}>
              <View style={styles.flex}>
                <Segmented
                  accessibilityLabel="Text size"
                  onChange={(key) => onOptionsChange({ textKey: key })}
                  options={OVERLAY_TEXT_SIZES}
                  value={options.textKey}
                />
              </View>
              <Chip label="Shadow" onPress={() => onOptionsChange({ shadow: !options.shadow })} selected={options.shadow} />
            </View>
          </>
        ) : null}

        {tool === 'chart' ? (
          hasProfile ? (
            <>
              <SubTabs onChange={setChartSection} options={CHART_SECTIONS} value={chartSection} />

              {chartSection === 'pin' ? (
                <View style={styles.inline}>
                  <Toggle
                    label={pinMode === 'off' ? 'Off' : 'On'}
                    onPress={() => onPinModeChange(pinMode === 'off' ? (hasPhotoTime ? 'auto' : 'manual') : 'off')}
                    value={pinMode !== 'off'}
                  />
                  <Slider
                    accessibilityLabel="Move the photo pin along the dive"
                    maximumTrackTintColor={colors.line}
                    maximumValue={span.end}
                    minimumTrackTintColor={pinMode === 'off' ? colors.line : colors.cyan}
                    minimumValue={span.start}
                    onSlidingComplete={() => setSliding(false)}
                    onSlidingStart={() => setSliding(true)}
                    onValueChange={onPinMove}
                    style={styles.slider}
                    thumbTintColor={pinMode === 'off' ? colors.faint : colors.cyan}
                    {...(sliding ? {} : { value: pinSeconds ?? (span.start + span.end) / 2 })}
                  />
                  <Text style={styles.sliderValue}>{pinMode === 'off' || pinSeconds == null ? '—' : formatClock(pinSeconds)}</Text>
                  {hasPhotoTime && pinMode === 'manual' ? (
                    <Pressable
                      accessibilityLabel="Back to the photo’s capture time"
                      accessibilityRole="button"
                      hitSlop={8}
                      onPress={() => onPinModeChange('auto')}
                      style={styles.resetButton}
                    >
                      <Text style={styles.resetLabel}>↺</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}

              {chartSection === 'curve' ? (
                <View style={styles.grid}>
                  {PROFILE_STYLES.map((style) => (
                    <CompactOption
                      key={style.key}
                      label={style.label}
                      onPress={() => onOptionsChange({ profileKey: style.key })}
                      selected={style.key === options.profileKey}
                    />
                  ))}
                </View>
              ) : null}

              {chartSection === 'layout' ? (
                <View style={styles.inline}>
                  <Toggle
                    label="Show"
                    onPress={() => onOptionsChange({ showProfile: !options.showProfile })}
                    value={options.showProfile}
                  />
                  <View style={styles.flex}>
                    <Segmented
                      accessibilityLabel="Profile size"
                      onChange={(key) => onOptionsChange({ profileSizeKey: key })}
                      options={PROFILE_SIZES}
                      value={options.profileSizeKey}
                    />
                  </View>
                  <View style={styles.flex}>
                    <Segmented
                      accessibilityLabel="Profile corner"
                      onChange={(key) => onOptionsChange({ profileOnRight: key === 'right' })}
                      options={PROFILE_SIDES}
                      value={options.profileOnRight ? 'right' : 'left'}
                    />
                  </View>
                </View>
              ) : null}
            </>
          ) : (
            <Note>This dive has no depth profile, so there’s no chart to add. Info and signature still work.</Note>
          )
        ) : null}

        {tool === 'info' ? (
          <>
            <ChipStrip>
              {INFO_FIELDS.map((field) => {
                const missing = !hasInfoValue(infoValues, field.key);
                return (
                  <Chip
                    disabled={missing}
                    key={field.key}
                    label={field.label}
                    onPress={() => onOptionsChange({ infoKeys: toggleInfoKey(options.infoKeys, field.key) })}
                    selected={!missing && options.infoKeys.includes(field.key)}
                  />
                );
              })}
            </ChipStrip>
            <Note>Pick what goes in the corner. Greyed-out items aren’t recorded for this photo.</Note>
          </>
        ) : null}

        {tool === 'sign' ? (
          <>
            <View style={styles.inline}>
              <View style={styles.flex}>
                <Segmented
                  accessibilityLabel="Signature"
                  onChange={(key) => {
                    onOptionsChange({ signatureMode: key });
                    if (key === 'drawn' && !options.signatureStrokes.length) onDrawSignature();
                  }}
                  options={SIGNATURE_MODES}
                  value={options.signatureMode}
                />
              </View>
              {options.signatureMode !== 'off' ? (
                <View style={styles.sizePicker}>
                  <Segmented
                    accessibilityLabel="Signature size"
                    onChange={(key) => onOptionsChange({ signatureSizeKey: key })}
                    options={SIGNATURE_SIZES}
                    value={options.signatureSizeKey}
                  />
                </View>
              ) : null}
            </View>
            {options.signatureMode === 'typed' ? (
              <View style={styles.inline}>
                <TextInput
                  accessibilityLabel="Signature text"
                  autoCapitalize="words"
                  autoCorrect={false}
                  maxLength={MAX_SIGNATURE_TEXT}
                  onChangeText={(text) => onOptionsChange({ signatureText: text })}
                  placeholder="Your name"
                  placeholderTextColor={colors.faint}
                  returnKeyType="done"
                  style={styles.input}
                  value={options.signatureText}
                />
                <View style={styles.fontPicker}>
                  <Segmented
                    accessibilityLabel="Signature font"
                    onChange={(key) => onOptionsChange({ signatureFont: key })}
                    options={SIGNATURE_FONTS}
                    value={options.signatureFont}
                  />
                </View>
              </View>
            ) : null}
            {options.signatureMode === 'drawn' ? (
              <View style={styles.inline}>
                <Chip label={options.signatureStrokes.length ? 'Redraw' : 'Draw'} onPress={onDrawSignature} selected={false} />
                <View style={styles.flex}>
                  <Note>Saved on this phone for every photo, in the style’s colour.</Note>
                </View>
              </View>
            ) : null}
            {options.signatureMode === 'off' ? (
              <Note>Sign your photos at the bottom middle, typed or hand-drawn.</Note>
            ) : null}
          </>
        ) : null}
      </View>

      <View style={styles.toolBar}>
        {EDITOR_TOOLS.map((entry) => {
          const selected = entry.key === tool;
          return (
            <Pressable
              accessibilityLabel={entry.label}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              hitSlop={6}
              key={entry.key}
              onPress={() => onToolChange(entry.key)}
              style={styles.tool}
            >
              <ToolIcon color={selected ? colors.cyan : colors.faint} tool={entry.key} />
              <Text style={[styles.toolLabel, selected && styles.toolSelected]}>{entry.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// Fixed height for the tool strip, so switching tools never resizes the photo
// above it.
const TOOL_AREA_HEIGHT = 96;

const styles = StyleSheet.create({
  wrap: { backgroundColor: '#000', paddingHorizontal: spacing.md },
  toolArea: { gap: 8, height: TOOL_AREA_HEIGHT, justifyContent: 'center' },
  stripScroll: { flexGrow: 0 },
  strip: { alignItems: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 2 },
  divider: { backgroundColor: colors.line, height: 22, marginHorizontal: 2, width: StyleSheet.hairlineWidth },
  inline: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
  fontPicker: { width: 150 },
  sizePicker: { width: 120 },
  sliderRow: { alignItems: 'center', flexDirection: 'row', gap: 8, height: 34 },
  sliderLabel: { color: colors.faint, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', width: 82 },
  slider: { flex: 1, height: 34 },
  sliderValue: { color: colors.text, fontSize: 12, fontVariant: ['tabular-nums'], fontWeight: '800', textAlign: 'right', width: 48 },
  note: { color: colors.faint, fontSize: 11, lineHeight: 15 },
  subTabs: { alignSelf: 'center', flexDirection: 'row', gap: 4 },
  subTab: { borderRadius: radii.pill, paddingHorizontal: 12, paddingVertical: 4 },
  subTabSelected: { backgroundColor: 'rgba(112,221,246,0.16)' },
  subTabLabel: { color: colors.faint, fontSize: 12, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
  subTabLabelSelected: { color: colors.cyan },
  toggle: {
    alignItems: 'center',
    borderColor: colors.line,
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  toggleOn: { borderColor: colors.cyan },
  toggleDot: { borderColor: colors.faint, borderRadius: 5, borderWidth: 1.5, height: 10, width: 10 },
  toggleDotOn: { backgroundColor: colors.cyan, borderColor: colors.cyan },
  toggleLabel: { color: colors.muted, fontSize: 12, fontWeight: '800' },
  toggleLabelOn: { color: colors.text },
  resetButton: { alignItems: 'center', height: 30, justifyContent: 'center', width: 28 },
  resetLabel: { color: colors.cyan, fontSize: 20, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  cell: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    flexBasis: '22%',
    flexGrow: 1,
    paddingVertical: 6,
  },
  cellSelected: { backgroundColor: colors.cyan },
  cellLabel: { color: colors.muted, fontSize: 12, fontWeight: '800' },
  cellLabelSelected: { color: colors.black },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderRadius: radii.sm,
    borderWidth: 1,
    color: colors.text,
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  toolBar: {
    borderTopColor: 'rgba(255,255,255,0.08)',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    paddingTop: 8,
  },
  tool: { alignItems: 'center', flex: 1, gap: 2 },
  toolLabel: { color: colors.faint, fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  toolSelected: { color: colors.cyan },
});
