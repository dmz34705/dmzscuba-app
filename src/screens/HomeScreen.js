import { Image, ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { SectionHeading } from '../components/ScreenLayout';
import FeatureIcon from '../features/catalog/FeatureIcon';
import { getFeaturedFeature, getFeaturesByArea } from '../features/catalog/featureCatalog';
import { colors, radii, shadow, spacing } from '../theme';

const logo = require('../../assets/brand/dmz-scuba-logo.webp');
const hero = require('../../assets/brand/education-hero.webp');

function ArrowIcon({ color = colors.text }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="M5 12h14M13 6l6 6-6 6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function CategoryCard({ area, accent, onPress, title }) {
  const features = getFeaturesByArea(area);
  const label = features.length === 1 ? 'FEATURE' : 'FEATURES';
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${title}`} onPress={onPress} style={({ pressed }) => [styles.categoryCard, pressed && styles.pressed]}>
      <View style={styles.categoryTop}>
        <View style={[styles.categoryIcon, { borderColor: `${accent}55` }]}>
          <FeatureIcon name={features[0]?.icon} />
        </View>
        <ArrowIcon color={accent} />
      </View>
      <Text style={[styles.categoryCount, { color: accent }]}>{features.length} {label}</Text>
      <Text style={styles.categoryTitle}>{title}</Text>
      <Text numberOfLines={2} style={styles.categoryBody}>{area === 'learn' ? 'Interactive dive science' : 'Planning and field utilities'}</Text>
    </Pressable>
  );
}

function SpotlightCard({ feature, onPress }) {
  if (!feature) return null;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${feature.title}`} onPress={onPress} style={({ pressed }) => [styles.spotlight, pressed && styles.pressed]}>
      <LinearGradient colors={['rgba(16,55,81,0.98)', 'rgba(7,24,40,0.98)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={styles.spotlightIcon}><FeatureIcon name={feature.icon} /></View>
      <View style={styles.spotlightCopy}>
        <Text style={styles.spotlightEyebrow}>{feature.badge}</Text>
        <Text style={styles.spotlightTitle}>{feature.title}</Text>
        <Text numberOfLines={2} style={styles.spotlightBody}>{feature.shortSummary}</Text>
      </View>
      <ArrowIcon />
    </Pressable>
  );
}

export default function HomeScreen({ onOpenTool, onSelectTab }) {
  const insets = useSafeAreaInsets();
  const featured = getFeaturedFeature();

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ImageBackground source={hero} resizeMode="cover" style={[styles.hero, { paddingTop: insets.top + 8 }]} imageStyle={styles.heroImage}>
          <LinearGradient colors={['rgba(5,11,20,0.16)', 'rgba(5,11,20,0.56)', colors.background]} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
          <View style={styles.brandRow}>
            <Image source={logo} style={styles.logo} resizeMode="contain" accessibilityLabel="DMZ Scuba logo" />
            <View style={styles.brandCopy}>
              <Text style={styles.brandName}>DMZ SCUBA</Text>
              <Text style={styles.brandTag}>DIVE DEEPER. LEARN SMARTER.</Text>
            </View>
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroEyebrow}>YOUR DIVE COMPANION</Text>
            <Text style={styles.heroTitle}>Dive knowledge, ready when you are.</Text>
            <Text style={styles.heroBody}>Learn the science, plan with confidence, and keep your diving essentials together.</Text>
          </View>
        </ImageBackground>

        <View style={styles.main}>
          <SectionHeading title="Quick access" />
          <View style={styles.categoryRow}>
            <CategoryCard accent={colors.gold} area="learn" onPress={() => onSelectTab('learn')} title="Learn" />
            <CategoryCard accent={colors.good} area="tools" onPress={() => onSelectTab('tools')} title="Tools" />
          </View>

          <SectionHeading
            action={<Pressable accessibilityRole="button" hitSlop={8} onPress={() => onSelectTab('learn')}><Text style={styles.viewAll}>SEE ALL</Text></Pressable>}
            title="Featured lesson"
          />
          <SpotlightCard feature={featured} onPress={() => onOpenTool(featured?.id)} />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  content: { flexGrow: 1, paddingBottom: spacing.lg },
  hero: { height: 318, justifyContent: 'space-between', overflow: 'hidden', paddingBottom: 36, paddingHorizontal: spacing.lg },
  heroImage: { opacity: 0.9 },
  brandRow: { alignItems: 'center', flexDirection: 'row' },
  logo: { height: 54, width: 54 },
  brandCopy: { marginLeft: 9 },
  brandName: { color: colors.text, fontSize: 15, fontWeight: '900', letterSpacing: 2.3 },
  brandTag: { color: colors.cyan, fontSize: 8, fontWeight: '800', letterSpacing: 1.15, marginTop: 2 },
  heroCopy: { maxWidth: 390 },
  heroEyebrow: { color: colors.cyan, fontSize: 10, fontWeight: '900', letterSpacing: 1.8, marginBottom: 8 },
  heroTitle: { color: colors.text, fontSize: 31, fontWeight: '900', letterSpacing: -0.8, lineHeight: 35 },
  heroBody: { color: '#C8DDEB', fontSize: 13, lineHeight: 20, marginTop: 9, maxWidth: 350 },
  main: { marginTop: -10, paddingHorizontal: spacing.md },
  categoryRow: { flexDirection: 'row', gap: 10, marginBottom: spacing.lg },
  categoryCard: { backgroundColor: colors.surfaceGlass, borderColor: colors.lineStrong, borderRadius: radii.lg, borderWidth: 1, flex: 1, minHeight: 162, padding: 14, ...shadow },
  categoryTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  categoryIcon: { alignItems: 'center', backgroundColor: colors.backgroundRaised, borderRadius: 13, borderWidth: 1, height: 46, justifyContent: 'center', width: 46 },
  categoryCount: { fontSize: 9, fontWeight: '900', letterSpacing: 1, marginTop: 11 },
  categoryTitle: { color: colors.text, fontSize: 19, fontWeight: '900', marginTop: 2 },
  categoryBody: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  viewAll: { color: colors.cyan, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  spotlight: { alignItems: 'center', borderColor: colors.lineStrong, borderRadius: radii.lg, borderWidth: 1, flexDirection: 'row', minHeight: 108, overflow: 'hidden', padding: 14, ...shadow },
  spotlightIcon: { alignItems: 'center', backgroundColor: 'rgba(112,221,246,0.08)', borderColor: colors.line, borderRadius: 14, borderWidth: 1, height: 52, justifyContent: 'center', width: 52 },
  spotlightCopy: { flex: 1, paddingHorizontal: 12 },
  spotlightEyebrow: { color: colors.cyan, fontSize: 8, fontWeight: '900', letterSpacing: 1.1 },
  spotlightTitle: { color: colors.text, fontSize: 15, fontWeight: '900', marginTop: 3 },
  spotlightBody: { color: colors.muted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
});
