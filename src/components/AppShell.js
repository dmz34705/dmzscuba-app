import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { colors, radii, spacing } from '../theme';

function BackIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="M15 18l-6-6 6-6" stroke={colors.text} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function TabIcon({ name, color }) {
  const path = name === 'home'
    ? 'M3.5 11.2 12 4l8.5 7.2V20a1 1 0 0 1-1 1H15v-6H9v6H4.5a1 1 0 0 1-1-1v-8.8Z'
    : name === 'learn'
      ? 'M4 5.5A2.5 2.5 0 0 1 6.5 3H11a3 3 0 0 1 3 3v15a3 3 0 0 0-3-3H6.5A2.5 2.5 0 0 0 4 20.5v-15Zm16 0A2.5 2.5 0 0 0 17.5 3H14v18a3 3 0 0 1 3-3h.5a2.5 2.5 0 0 1 2.5 2.5v-15Z'
      : name === 'tools'
        ? 'M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm1 3v4h8V6H8Zm0 8h2v2H8v-2Zm3 0h2v2h-2v-2Zm3 0h2v2h-2v-2Zm-6 3h2v2H8v-2Zm3 0h2v2h-2v-2Zm3 0h2v2h-2v-2Z'
        : name === 'account'
          ? 'M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm-8 9a8 8 0 0 1 16 0H4Z'
          : 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm9 3.5-2.1-1.2.1-2.4-2.1-2.1-2.4.1L13.3 3h-2.6L9.5 6.4l-2.4-.1L5 8.4l.1 2.4L3 12l2.1 1.2L5 15.6l2.1 2.1 2.4-.1 1.2 3.4h2.6l1.2-3.4 2.4.1 2.1-2.1-.1-2.4L21 12Z';
  return <Path d={path} fill={color} />;
}

export function BottomTabBar({ activeTab, items, onSelect }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {items.map(({ icon, key, label }) => {
        const selected = activeTab === key;
        const color = selected ? colors.cyan : colors.faint;
        return (
          <Pressable
            key={key}
            accessibilityLabel={`${label} tab`}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            hitSlop={4}
            onPress={() => onSelect(key)}
            style={({ pressed }) => [styles.tabItem, pressed && styles.pressed]}
          >
            <Svg width={22} height={22} viewBox="0 0 24 24"><TabIcon name={icon} color={color} /></Svg>
            <Text style={[styles.tabLabel, selected && styles.tabLabelSelected]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ScreenHeader({ eyebrow = 'DMZ SCUBA', title, onBack, action }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <View style={styles.headerRow}>
        {onBack ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} onPress={onBack} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
            <BackIcon />
          </Pressable>
        ) : <View style={styles.backSpacer} />}
        <View style={styles.titleWrap}>
          <Text style={styles.eyebrow}>{eyebrow}</Text>
          <Text numberOfLines={1} style={styles.title}>{title}</Text>
        </View>
        {action || <View style={styles.backSpacer} />}
      </View>
    </View>
  );
}

export function SectionLabel({ children }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.background,
    borderBottomColor: colors.line,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 12,
    paddingHorizontal: spacing.md,
  },
  headerRow: { alignItems: 'center', flexDirection: 'row', minHeight: 48 },
  titleWrap: { alignItems: 'center', flex: 1, paddingHorizontal: 8 },
  eyebrow: { color: colors.cyan, fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  title: { color: colors.text, fontSize: 17, fontWeight: '800', marginTop: 2 },
  backButton: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.lineStrong,
    borderRadius: radii.pill,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  backSpacer: { height: 40, width: 40 },
  pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
  sectionLabel: { color: colors.cyan, fontSize: 11, fontWeight: '800', letterSpacing: 1.7, marginBottom: spacing.sm },
  tabBar: { backgroundColor: 'rgba(5, 11, 20, 0.98)', borderTopColor: colors.lineStrong, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', paddingHorizontal: 7, paddingTop: 7 },
  tabItem: { alignItems: 'center', flex: 1, gap: 3, justifyContent: 'center', minHeight: 50, paddingHorizontal: 3, paddingVertical: 4 },
  tabLabel: { color: colors.faint, fontSize: 9, fontWeight: '700', letterSpacing: 0.1 },
  tabLabelSelected: { color: colors.cyan },
});
