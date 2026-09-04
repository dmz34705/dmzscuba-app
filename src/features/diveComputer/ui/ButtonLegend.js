import { StyleSheet, Text, View } from 'react-native';

import { describeButtons } from '../../../lib/virtualDiveComputer';
import { colors, radii } from '../../../theme';

function ButtonColumn({ actions, hint, name }) {
  return (
    <View style={styles.column}>
      <Text allowFontScaling={false} style={styles.buttonName}>{name}</Text>
      <Text allowFontScaling={false} style={styles.buttonHint}>{hint}</Text>
      <View style={styles.actionRow}>
        <Text allowFontScaling={false} style={styles.actionKey}>TAP</Text>
        <Text allowFontScaling={false} style={[styles.actionValue, !actions.tap && styles.actionValueMuted]}>{actions.tap || 'nothing here'}</Text>
      </View>
      <View style={styles.actionRow}>
        <Text allowFontScaling={false} style={styles.actionKey}>HOLD</Text>
        <Text allowFontScaling={false} style={[styles.actionValue, !actions.hold && styles.actionValueMuted]}>{actions.hold || 'nothing here'}</Text>
      </View>
    </View>
  );
}

export default function ButtonLegend({ display }) {
  const legend = describeButtons(display);
  const advReversed = legend.adv.tap === 'Back to dive list';
  return (
    <View accessibilityLabel="What the ADV and SEL buttons do on this screen" style={styles.card}>
      <View style={styles.columns}>
        <ButtonColumn actions={legend.adv} hint={advReversed ? 'here: back' : 'scroll'} name="ADV" />
        <View style={styles.divider} />
        <ButtonColumn actions={legend.sel} hint="select" name="SEL" />
      </View>
      {legend.both ? <Text allowFontScaling={false} style={styles.bothLine}>{legend.both}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceGlass,
    borderColor: colors.lineStrong,
    borderRadius: radii.md,
    borderWidth: 1,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    width: '100%',
  },
  columns: { flexDirection: 'row' },
  column: { flex: 1 },
  divider: { backgroundColor: colors.line, marginHorizontal: 12, width: StyleSheet.hairlineWidth },
  buttonName: { color: colors.cyan, fontSize: 12, fontWeight: '900', letterSpacing: 1.5 },
  buttonHint: { color: colors.faint, fontSize: 8, fontWeight: '800', letterSpacing: 0.6, marginBottom: 6, textTransform: 'uppercase' },
  actionRow: { alignItems: 'baseline', flexDirection: 'row', marginTop: 3 },
  actionKey: { color: colors.faint, fontSize: 8, fontWeight: '900', letterSpacing: 0.8, width: 30 },
  actionValue: { color: colors.text, flex: 1, fontSize: 11, fontWeight: '700', lineHeight: 15 },
  actionValueMuted: { color: colors.faint, fontStyle: 'italic', fontWeight: '600' },
  bothLine: { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth, color: colors.muted, fontSize: 10, fontWeight: '700', marginTop: 8, paddingTop: 7 },
});
