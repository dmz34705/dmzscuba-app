import { StyleSheet, Text } from 'react-native';

import MenuPage from '../../components/MenuPage';
import { GroupedSection, NavigationRow } from '../../components/Ui';
import { colors } from '../../theme';
import FeatureIcon from './FeatureIcon';
import { getFeaturesByArea } from './featureCatalog';

export default function FeatureCatalogScreen({ area, body, footer, onOpenFeature, children }) {
  const features = getFeaturesByArea(area);

  return (
    <MenuPage title={area === 'learn' ? 'Learn' : 'Tools'} subtitle={body}>
        <GroupedSection title={area === 'learn' ? 'Lessons' : 'Tools'}>
          {features.map((feature, index) => (
            <NavigationRow
              accent={colors[feature.accent] || colors.cyan}
              body={feature.shortSummary || feature.summary}
              icon={<FeatureIcon name={feature.icon} />}
              key={feature.id}
              last={index === features.length - 1}
              onPress={() => onOpenFeature(feature.id)}
              title={feature.title}
            />
          ))}
        </GroupedSection>
        {children}
        {footer ? <Text style={styles.footer}>{footer}</Text> : null}
    </MenuPage>
  );
}

const styles = StyleSheet.create({
  footer: { color: colors.faint, fontSize: 11, lineHeight: 17, marginHorizontal: 8, marginTop: 6, textAlign: 'center' },
});
