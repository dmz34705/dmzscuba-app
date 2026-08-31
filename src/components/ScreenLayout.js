import { StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '../theme';

export function ScreenIntro({ eyebrow, title, body, compact = false }) {
  return (
    <View style={[styles.intro, compact && styles.introCompact]}>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
    </View>
  );
}

export function StatusBanner({ label, body, tone = 'info', style }) {
  return (
    <View style={[styles.banner, tone === 'success' && styles.bannerSuccess, tone === 'warning' && styles.bannerWarning, style]}>
      <Text style={[styles.bannerLabel, tone === 'success' && styles.successText, tone === 'warning' && styles.warningText]}>{label}</Text>
      <Text style={styles.bannerBody}>{body}</Text>
    </View>
  );
}

export function SectionHeading({ title, action }) {
  return (
    <View style={styles.sectionHeading}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action || null}
    </View>
  );
}

const styles = StyleSheet.create({
  intro: { marginBottom: spacing.lg },
  introCompact: { marginBottom: spacing.md },
  eyebrow: { color: colors.cyan, fontSize: 10, fontWeight: '900', letterSpacing: 1.5, marginBottom: 7 },
  title: { color: colors.text, fontSize: 29, fontWeight: '900', letterSpacing: -0.7, lineHeight: 34 },
  body: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 8 },
  banner: { backgroundColor: 'rgba(112,221,246,0.08)', borderColor: 'rgba(112,221,246,0.3)', borderRadius: radii.md, borderWidth: 1, padding: 12 },
  bannerSuccess: { backgroundColor: 'rgba(112,226,163,0.08)', borderColor: 'rgba(112,226,163,0.28)' },
  bannerWarning: { backgroundColor: 'rgba(255,179,106,0.08)', borderColor: 'rgba(255,179,106,0.35)' },
  bannerLabel: { color: colors.cyan, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  successText: { color: colors.good },
  warningText: { color: colors.warning },
  bannerBody: { color: colors.muted, fontSize: 11, lineHeight: 17, marginTop: 4 },
  sectionHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
});
