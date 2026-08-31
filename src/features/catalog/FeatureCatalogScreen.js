import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '../../components/AppShell';
import { ScreenIntro } from '../../components/ScreenLayout';
import ToolCatalogCard from '../../components/ToolCatalogCard';
import { colors, spacing } from '../../theme';
import FeatureIcon from './FeatureIcon';
import { getFeaturesByArea } from './featureCatalog';

export default function FeatureCatalogScreen({ area, body, eyebrow, footer, headerEyebrow, title, onOpenFeature, children }) {
  const features = getFeaturesByArea(area);

  return (
    <View style={styles.screen}>
      <ScreenHeader eyebrow={headerEyebrow} title={area === 'learn' ? 'Learn' : 'Tools'} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ScreenIntro body={body} eyebrow={eyebrow} title={title} />
        {features.map((feature) => (
          <ToolCatalogCard
            accent={colors[feature.accent] || colors.cyan}
            action={feature.action}
            badge={feature.badge}
            body={feature.summary}
            eyebrow={feature.eyebrow}
            icon={<FeatureIcon name={feature.icon} />}
            key={feature.id}
            onPress={() => onOpenFeature(feature.id)}
            title={feature.title}
          />
        ))}
        {children}
        {footer ? <Text style={styles.footer}>{footer}</Text> : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background, flex: 1 },
  content: { paddingBottom: spacing.lg, paddingHorizontal: spacing.md, paddingTop: spacing.lg },
  footer: { color: colors.faint, fontSize: 11, lineHeight: 17, marginHorizontal: 8, marginTop: 6, textAlign: 'center' },
});
