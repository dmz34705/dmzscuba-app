import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme';

// Menu-only layout: tool headers and their measured workspaces stay separate.
export default function MenuPage({ title, subtitle, onBack, backLabel = 'Back', children, pageKey = title }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        {onBack ? (
          <Pressable accessibilityRole="button" accessibilityLabel={backLabel} onPress={onBack} style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
            <Text style={styles.backArrow}>‹</Text><Text style={styles.backLabel}>{backLabel}</Text>
          </Pressable>
        ) : <Text style={styles.brand}>DMZ SCUBA</Text>}
        <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      </View>
      <ScrollView key={pageKey} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  brand: { color: colors.faint, fontSize: 11, fontWeight: '700', letterSpacing: 1.5, marginBottom: 12, paddingTop: 8 },
  title: { color: colors.text, fontSize: 30, fontWeight: '800', letterSpacing: -0.6 },
  back: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 6, paddingRight: 14 },
  backArrow: { color: colors.cyan, fontSize: 30 },
  backLabel: { color: colors.cyan, fontSize: 14, fontWeight: '600' },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 21, marginBottom: spacing.lg },
  pressed: { opacity: 0.65 },
});
