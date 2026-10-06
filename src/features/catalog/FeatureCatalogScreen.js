import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import MenuPage from '../../components/MenuPage';
import { GroupedSection, NavigationRow } from '../../components/Ui';
import { colors } from '../../theme';
import FeatureIcon from './FeatureIcon';
import LayoutEditor from '../layout/LayoutEditor';
import { DEFAULT_LAYOUT, orderedFeatures, sanitizeLayout } from '../layout/layoutPreferences';

export default function FeatureCatalogScreen({ area, body, footer, onOpenFeature, children, appSettings = {}, onLayoutChange }) {
  const [editing, setEditing] = useState(false);
  const layout = sanitizeLayout(appSettings.layout);
  const features = orderedFeatures(area, layout);

  return (
    <MenuPage title={area === 'learn' ? 'Learn' : 'Tools'} subtitle={body}>
        <GroupedSection title={area === 'learn' ? 'Lessons' : 'Tools'} action={<Text accessibilityRole="button" onPress={() => setEditing(true)} style={styles.edit}>Edit order</Text>}>
          {features.map((feature, index) => (
            <NavigationRow
              accent={colors[feature.accent] || colors.cyan}
              body={feature.shortSummary || feature.summary}
              icon={<FeatureIcon name={feature.icon} />}
              key={feature.id}
              last={index === features.length - 1}
              onLongPress={() => setEditing(true)}
              onPress={() => onOpenFeature(feature.id)}
              title={feature.title}
            />
          ))}
        </GroupedSection>
        {editing ? <LayoutEditor title={`Arrange ${area === 'learn' ? 'Learn' : 'Tools'}`} ids={layout[area]} options={features} defaults={DEFAULT_LAYOUT[area]}
          onCancel={() => setEditing(false)} onSave={ids => { onLayoutChange?.(area, ids); setEditing(false); }} /> : null}
        {children}
        {footer ? <Text style={styles.footer}>{footer}</Text> : null}
    </MenuPage>
  );
}

const styles = StyleSheet.create({
  edit: { color: colors.cyan, fontSize: 13, padding: 8 },
  footer: { color: colors.faint, fontSize: 11, lineHeight: 17, marginHorizontal: 8, marginTop: 6, textAlign: 'center' },
});
