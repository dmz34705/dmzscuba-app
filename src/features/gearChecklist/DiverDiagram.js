import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { colors, radii } from '../../theme';
const diverImage = require('../../../assets/gear/diver-front-study.png');

// Anchor coordinates are normalized to the illustration, so connectors follow
// the equipment as the image scales without stretching its proportions.
const CALLOUTS = {
  vision: { side: 'left', y: 20, anchor: [0.47, 0.078] },
  breathing: { side: 'left', y: 112, anchor: [0.49, 0.13] },
  exposure: { side: 'left', y: 222, anchor: [0.39, 0.59] },
  extras: { side: 'left', y: 328, anchor: [0.35, 0.5] },
  instruments: { side: 'right', y: 188, anchor: [0.77, 0.392] },
  buoyancy: { side: 'right', y: 76, anchor: [0.61, 0.19] },
  propulsion: { side: 'right', y: 336, anchor: [0.65, 0.86] },
};

export default function DiverDiagram({ zones, selected, onSelect }) {
  const { fontScale } = useWindowDimensions();
  const [width, setWidth] = useState(360);
  const height = 460 * Math.max(1, fontScale);
  const imageHeight = Math.min(height, width * 1.5);
  const imageWidth = imageHeight / 1.5;
  return <View onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)} style={[styles.diagram, { height }]}>
    <Image source={diverImage} resizeMode="contain" style={StyleSheet.absoluteFill} accessible={false} />
    <Svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={StyleSheet.absoluteFill} aria-hidden>
      {zones.map((zone) => {
        const { side, y, anchor } = CALLOUTS[zone.key];
        const active = selected === zone.key;
        const edge = width * (side === 'left' ? 0.29 : 0.71);
        const elbow = width * (side === 'left' ? 0.33 : 0.67);
        const ax = (width - imageWidth) / 2 + anchor[0] * imageWidth;
        const ay = (height - imageHeight) / 2 + anchor[1] * imageHeight;
        return <G key={zone.key} stroke={active ? colors.cyan : colors.muted} strokeWidth={active ? 1.2 : 0.75} fill="none" opacity={active ? 1 : 0.6}>
          <Path d={`M${edge} ${(y + 32) / 460 * height} H${elbow} L${ax} ${ay}`} />
          <Circle cx={ax} cy={ay} r="2.5" fill={colors.background} />
        </G>;
      })}
    </Svg>
    {zones.map((zone) => {
      const position = CALLOUTS[zone.key];
      const active = selected === zone.key;
      return <Pressable key={zone.key} accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={`${zone.label}, ${zone.items.length} items. Inspect gear`} onPress={() => onSelect(zone.key)} style={({ pressed }) => [styles.callout, { top: `${position.y / 460 * 100}%`, [position.side]: 0 }, active && styles.selected, pressed && styles.pressed]}>
        <View style={styles.labelRow}><Text style={[styles.label, active && styles.activeLabel]}>{zone.key === 'extras' ? 'Safety & extras' : zone.label}</Text></View>
        <Text style={styles.gearName} numberOfLines={2}>{zone.items[0]?.name || 'Unassigned'}</Text>
        {zone.items.length > 1 ? <Text style={styles.more}>+{zone.items.length - 1} more</Text> : null}
      </Pressable>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  diagram: { width: '100%', maxWidth: 440, alignSelf: 'center', marginTop: 12 },
  callout: { position: 'absolute', width: '29%', minHeight: 64, backgroundColor: colors.backgroundRaised, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong, borderRadius: radii.sm, paddingHorizontal: 9, paddingVertical: 9 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 3, marginBottom: 5 },
  label: { color: colors.text, fontSize: 11, fontWeight: '800', flexShrink: 1 },
  gearName: { color: colors.muted, fontSize: 11, lineHeight: 15 },
  more: { color: colors.faint, fontSize: 10, marginTop: 3 },
  selected: { borderColor: colors.cyan, backgroundColor: colors.surface },
  activeLabel: { color: colors.cyan },
  pressed: { opacity: 0.7 },
});
