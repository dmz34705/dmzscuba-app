import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import FeatureIcon from '../features/catalog/FeatureIcon';
import { colors, radii, shadow, spacing } from '../theme';
import { SectionLabel } from './AppShell';
import { PrimaryButton, SecondaryButton } from './Ui';

// Landing page shown when an educational lab opens: what it is, what you'll learn,
// how it works, and one clear way to start (plus an optional "explore on my own").
// Every lab uses it so they all open the same way.
export default function LabLanding({
  icon, eyebrow = 'WELCOME', title, intro = [], learn = [], steps = [], howText = [], note, meta,
  primaryLabel, onPrimary, secondaryLabel, onSecondary,
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <View style={styles.headRow}>
            {icon ? <View style={styles.icon}><FeatureIcon name={icon} /></View> : null}
            <View style={styles.headCopy}>
              <SectionLabel>{eyebrow}</SectionLabel>
              {meta ? <Text style={styles.meta}>{meta}</Text> : null}
            </View>
          </View>
          <Text accessibilityRole="header" style={styles.title}>{title}</Text>
          {intro.map((paragraph) => <Text key={paragraph} style={styles.text}>{paragraph}</Text>)}

          {learn.length ? (
            <>
              <View style={styles.divider} />
              <Text style={styles.section}>WHAT YOU’LL LEARN</Text>
              {learn.map((item) => (
                <View key={item} style={styles.learnRow}>
                  <Text style={styles.check}>✓</Text>
                  <Text style={styles.learnText}>{item}</Text>
                </View>
              ))}
            </>
          ) : null}

          {steps.length || howText.length ? (
            <>
              <View style={styles.divider} />
              <Text style={styles.section}>HOW THIS WORKS</Text>
              {howText.map((paragraph) => <Text key={paragraph} style={styles.text}>{paragraph}</Text>)}
              {steps.map((step, index) => (
                <View key={step} style={styles.stepRow}>
                  <View style={styles.stepNumber}><Text style={styles.stepNumberText}>{index + 1}</Text></View>
                  <Text style={styles.stepText}>{step}</Text>
                </View>
              ))}
            </>
          ) : null}

          {note ? <Text style={styles.note}>{note}</Text> : null}
        </View>
      </ScrollView>
      {/* The way in stays on screen however long the description is. */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <LinearGradient pointerEvents="none" colors={['rgba(5,11,20,0)', colors.background]} style={styles.footerFade} />
        <PrimaryButton accessibilityLabel={primaryLabel} label={primaryLabel} onPress={onPrimary} />
        {secondaryLabel ? <SecondaryButton label={secondaryLabel} onPress={onSecondary} style={styles.secondary} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', paddingBottom: spacing.lg, paddingHorizontal: spacing.md, paddingTop: spacing.lg },
  footer: { backgroundColor: colors.background, paddingHorizontal: spacing.md, paddingTop: 10 },
  footerFade: { height: 24, left: 0, position: 'absolute', right: 0, top: -24 },
  card: { backgroundColor: '#0B2838', borderColor: 'rgba(112,221,246,.34)', borderRadius: radii.lg, borderWidth: 1, padding: spacing.lg, ...shadow },
  headRow: { alignItems: 'center', flexDirection: 'row', gap: 12, marginBottom: 10 },
  icon: { alignItems: 'center', backgroundColor: 'rgba(5,11,20,0.4)', borderColor: colors.line, borderRadius: 15, borderWidth: 1, height: 54, justifyContent: 'center', width: 54 },
  headCopy: { flex: 1 },
  meta: { color: colors.muted, fontSize: 12, marginTop: -4 },
  title: { color: colors.text, fontSize: 26, fontWeight: '900', letterSpacing: -0.7, lineHeight: 31, marginTop: 4 },
  text: { color: colors.muted, fontSize: 14, lineHeight: 21, marginTop: 14 },
  divider: { backgroundColor: colors.lineStrong, height: StyleSheet.hairlineWidth, marginTop: 22 },
  section: { color: colors.cyan, fontSize: 10, fontWeight: '900', letterSpacing: 1.2, marginBottom: 4, marginTop: 20 },
  learnRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 10, marginTop: 10 },
  check: { color: colors.good, fontSize: 14, fontWeight: '900', lineHeight: 21, width: 14 },
  learnText: { color: colors.text, flex: 1, fontSize: 14, lineHeight: 21 },
  stepRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, marginTop: 12 },
  stepNumber: { alignItems: 'center', backgroundColor: 'rgba(112,221,246,0.12)', borderColor: 'rgba(112,221,246,0.4)', borderRadius: 12, borderWidth: 1, height: 24, justifyContent: 'center', marginTop: -1, width: 24 },
  stepNumberText: { color: colors.cyan, fontSize: 12, fontWeight: '800' },
  stepText: { color: colors.muted, flex: 1, fontSize: 14, lineHeight: 21 },
  note: { backgroundColor: 'rgba(240,200,75,0.08)', borderColor: 'rgba(240,200,75,0.3)', borderRadius: radii.sm, borderWidth: 1, color: '#E9D9A6', fontSize: 12, lineHeight: 18, marginTop: 20, padding: 10 },
  secondary: { marginTop: 10 },
});
