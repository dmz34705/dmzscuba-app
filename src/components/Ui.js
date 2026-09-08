import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { colors, radii, shadow, spacing } from '../theme';

export function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function GroupedSection({ action, children, title }) {
  return (
    <View style={styles.groupSection}>
      <View style={styles.groupHeader}>
        <Text style={styles.groupTitle}>{title}</Text>
        {action || null}
      </View>
      <View style={styles.groupBody}>{children}</View>
    </View>
  );
}

export function NavigationRow({ accent = colors.cyan, body, icon, onPress, onLongPress, title, last = false, badge, disabled = false, accessibilityLabel, right }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel || title} accessibilityHint={body} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} onLongPress={onLongPress} style={({ pressed }) => [styles.navigationRow, !last && styles.navigationRowBorder, disabled && styles.disabled, pressed && styles.navigationPressed]}>
      {icon ? <View style={[styles.navigationIcon, { borderColor: `${accent}55`, backgroundColor: `${accent}12` }]}>{icon}</View> : null}
      <View style={styles.navigationCopy}>
        <Text style={styles.navigationTitle} numberOfLines={1}>{title}</Text>
        {body ? <Text style={styles.navigationBody} numberOfLines={2}>{body}</Text> : null}
        {badge ? <Text style={[styles.navigationBadge, { color: accent }]}>{badge}</Text> : null}
      </View>
      {right != null ? <View style={styles.navigationRight}>{right}</View> : null}
      <Text style={[styles.navigationChevron, { color: accent }]}>›</Text>
    </Pressable>
  );
}

export function PrimaryButton({ label, onPress, accessibilityLabel, style, disabled = false }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel || label} disabled={disabled} onPress={onPress} style={({ pressed }) => [style, pressed && !disabled && styles.pressed, disabled && styles.disabled]}>
      <LinearGradient colors={[colors.accent, colors.accentDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primaryButton}>
        <Text style={styles.primaryButtonText}>{label}</Text>
      </LinearGradient>
    </Pressable>
  );
}

export function SecondaryButton({ label, onPress, onLongPress, selected = false, style }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} onLongPress={onLongPress} style={({ pressed }) => [styles.secondaryButton, selected && styles.secondarySelected, style, pressed && styles.pressed]}>
      <Text style={[styles.secondaryButtonText, selected && styles.secondarySelectedText]}>{label}</Text>
    </Pressable>
  );
}

export function Stat({ label, value, accent, style }) {
  return (
    <View style={[styles.stat, style]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, accent && { color: accent }]}>{value}</Text>
    </View>
  );
}

export function ProgressBar({ value, color = colors.cyan, trackColor = 'rgba(255,255,255,0.09)' }) {
  const safeValue = Math.max(0, Math.min(1, value));
  return (
    <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(safeValue * 100) }} style={[styles.progressTrack, { backgroundColor: trackColor }]}>
      <View style={[styles.progressFill, { backgroundColor: color, width: `${safeValue * 100}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceGlass,
    borderColor: colors.line,
    borderRadius: radii.lg,
    borderWidth: 1,
    marginBottom: 12,
    padding: spacing.md,
    ...shadow,
  },
  groupSection: { marginBottom: spacing.lg },
  groupHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 2 },
  groupTitle: { color: colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  groupBody: { backgroundColor: colors.surface, borderColor: colors.line, borderRadius: radii.md, borderWidth: 1, overflow: 'hidden' },
  navigationRow: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 68, paddingHorizontal: 13, paddingVertical: 11 },
  navigationRowBorder: { borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth },
  navigationIcon: { alignItems: 'center', borderRadius: 11, height: 44, justifyContent: 'center', width: 44 },
  navigationCopy: { flex: 1, minWidth: 0 },
  navigationRight: { marginLeft: 6 },
  navigationTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
  navigationBody: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  navigationBadge: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 5 },
  navigationPressed: { backgroundColor: colors.surfaceSoft },
  navigationChevron: { fontSize: 25, fontWeight: '300', lineHeight: 26, marginLeft: 2 },
  primaryButton: { alignItems: 'center', borderRadius: radii.md, minHeight: 50, justifyContent: 'center', paddingHorizontal: 18, paddingVertical: 13 },
  primaryButtonText: { color: colors.white, fontSize: 15, fontWeight: '800', letterSpacing: 0.2 },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: colors.surfaceSoft,
    borderColor: colors.lineStrong,
    borderRadius: radii.md,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  secondarySelected: { backgroundColor: 'rgba(112, 221, 246, 0.14)', borderColor: colors.cyan },
  secondaryButtonText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  secondarySelectedText: { color: colors.cyan },
  pressed: { opacity: 0.74, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.45 },
  stat: { backgroundColor: 'rgba(3, 13, 23, 0.62)', borderColor: colors.line, borderRadius: radii.md, borderWidth: 1, minHeight: 74, padding: 12 },
  statLabel: { color: colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.4, marginBottom: 5, textTransform: 'uppercase' },
  statValue: { color: colors.text, fontSize: 17, fontWeight: '800', lineHeight: 21 },
  progressTrack: { borderRadius: radii.pill, height: 7, overflow: 'hidden' },
  progressFill: { borderRadius: radii.pill, height: '100%' },
});
