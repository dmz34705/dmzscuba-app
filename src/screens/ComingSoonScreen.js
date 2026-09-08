import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenHeader } from '../components/AppShell';
import { GearIcon } from '../components/DiveIllustrations';
import { colors, spacing } from '../theme';

// Placeholder shown in place of a feature that is built but not yet released.
// The real screen is still in the codebase — see AppNavigator's route gate.
export default function ComingSoonScreen({
  title = 'Coming soon',
  eyebrow = 'DMZ SCUBA ACADEMY',
  icon = <GearIcon size={64} />,
  note = 'This lesson is being polished and will unlock in an upcoming update.',
  onBack,
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      <ScreenHeader eyebrow={eyebrow} title={title} onBack={onBack} />
      <View style={[styles.body, { paddingBottom: insets.bottom + spacing.xl }]}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>COMING SOON</Text>
        </View>
        <View style={styles.icon}>{icon}</View>
        <Text style={styles.heading}>{title}</Text>
        <Text style={styles.note}>{note}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xl, gap: spacing.md },
  badge: {
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: spacing.sm,
  },
  badgeText: { color: colors.cyan, fontSize: 10, fontWeight: '900', letterSpacing: 1.6 },
  icon: { opacity: 0.9 },
  heading: { color: colors.text, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  note: { color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: 'center', maxWidth: 320 },
});
