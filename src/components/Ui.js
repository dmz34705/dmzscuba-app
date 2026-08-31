import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { colors, radii, shadow, spacing } from '../theme';

export function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
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

export function SecondaryButton({ label, onPress, selected = false, style }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => [styles.secondaryButton, selected && styles.secondarySelected, style, pressed && styles.pressed]}>
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
