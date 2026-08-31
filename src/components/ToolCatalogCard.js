import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';

import { colors, radii, shadow, spacing } from '../theme';

function ArrowIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M5 12h14M13 6l6 6-6 6" stroke={colors.text} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export default function ToolCatalogCard({ title, eyebrow, body, icon, onPress, accent, badge, action = 'Open' }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${title}`} onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <LinearGradient colors={['rgba(18, 49, 75, 0.98)', 'rgba(7, 24, 40, 0.98)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={[styles.accent, { backgroundColor: accent }]} />
      <View style={styles.topRow}>
        <View style={styles.icon}>{icon}</View>
        <View style={styles.badge}><View style={[styles.badgeDot, { backgroundColor: accent }]} /><Text style={styles.badgeText}>{badge}</Text></View>
      </View>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      <View style={styles.openRow}>
        <Text style={styles.openText}>{action}</Text>
        <ArrowIcon />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderColor: colors.lineStrong, borderRadius: radii.lg, borderWidth: 1, marginBottom: 13, minHeight: 218, overflow: 'hidden', padding: spacing.lg, ...shadow },
  accent: { height: 4, left: 0, position: 'absolute', right: 0, top: 0 },
  topRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  icon: { alignItems: 'center', backgroundColor: 'rgba(112,221,246,0.09)', borderColor: colors.line, borderRadius: 15, borderWidth: 1, height: 54, justifyContent: 'center', width: 54 },
  badge: { alignItems: 'center', backgroundColor: 'rgba(4,15,26,0.72)', borderColor: colors.line, borderRadius: radii.pill, borderWidth: 1, flexDirection: 'row', paddingHorizontal: 9, paddingVertical: 6 },
  badgeDot: { borderRadius: 4, height: 6, marginRight: 6, width: 6 },
  badgeText: { color: colors.muted, fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  eyebrow: { color: colors.cyan, fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginTop: 16 },
  title: { color: colors.text, fontSize: 22, fontWeight: '900', letterSpacing: -0.4, marginTop: 4 },
  body: { color: colors.muted, fontSize: 13, lineHeight: 20, marginTop: 7 },
  openRow: { alignItems: 'center', borderTopColor: colors.line, borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginTop: 15, paddingTop: 13 },
  openText: { color: colors.text, fontSize: 13, fontWeight: '800' },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
});
