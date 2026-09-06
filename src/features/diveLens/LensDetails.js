import { StyleSheet, Text, View } from 'react-native';
import { Card } from '../../components/Ui';
import { lensDetailSections } from '../../lib/lensResult';
import { colors } from '../../theme';

export default function LensDetails({ result }) {
  const sections = lensDetailSections(result);
  return <>
    {sections.map((section) => <Card key={section.title}>
      <Text accessibilityRole="header" style={styles.heading}>{section.title}</Text>
      {section.note ? <Text style={styles.note}>{section.note}</Text> : null}
      {section.rows.map((row, index) => <View key={row.label} style={[styles.row, index > 0 && styles.divider]}>
        <Text style={styles.label}>{row.label}</Text>
        <Text style={styles.value}>{row.value}</Text>
      </View>)}
    </Card>)}
    {result.evidence.length || result.uncertainty ? <Card>
      <Text accessibilityRole="header" style={styles.heading}>Why this identification?</Text>
      {result.evidence.map((item, index) => <Text key={index} style={styles.value}>• {item}</Text>)}
      {result.uncertainty ? <Text style={styles.note}>{result.uncertainty}</Text> : null}
    </Card> : null}
    {result.alternatives.length ? <Card>
      <Text accessibilityRole="header" style={styles.heading}>Possible look-alikes</Text>
      {result.alternatives.map((item, index) => <View key={index} style={styles.row}>
        <Text style={styles.label}>{item.name}</Text><Text style={styles.value}>{item.distinction}</Text>
      </View>)}
    </Card> : null}
    {result.nextPhoto ? <Card>
      <Text accessibilityRole="header" style={styles.heading}>For a stronger identification</Text>
      <Text style={styles.value}>{result.nextPhoto}</Text>
    </Card> : null}
    {!sections.length && result.category !== 'unclear' ? <Text style={styles.note}>Detailed profile information wasn’t returned for this scan.</Text> : null}
  </>;
}

const styles = StyleSheet.create({
  heading: { color: colors.cyan, fontSize: 15, fontWeight: '700', marginBottom: 8 },
  row: { paddingVertical: 10, gap: 4 },
  divider: { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth },
  label: { color: colors.muted, fontSize: 12, fontWeight: '600' },
  value: { color: colors.text, fontSize: 14, lineHeight: 21, marginBottom: 3 },
  note: { color: colors.muted, fontSize: 12, lineHeight: 19, marginVertical: 8 },
});
