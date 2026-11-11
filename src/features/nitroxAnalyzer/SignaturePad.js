// Finger signature captured as SVG path strings ({ width, height, paths }),
// small enough to store in the log and drop straight into the exported PDF.
import { useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { colors, radii } from '../../theme';
import { TextLink } from './parts';

const HEIGHT = 150;
const pt = (e) => `${e.nativeEvent.locationX.toFixed(1)} ${e.nativeEvent.locationY.toFixed(1)}`;

export default function SignaturePad({ value, onChange, onSigningChange }) {
  const [width, setWidth] = useState(0);
  const [live, setLive] = useState('');
  const stroke = useRef('');
  const latest = useRef({ width: 0, paths: value?.paths || [], onChange, onSigningChange });
  latest.current = { width, paths: value?.paths || [], onChange, onSigningChange };

  const finish = () => {
    const { paths, width: w, onChange: emit, onSigningChange: signing } = latest.current;
    if (stroke.current.includes('L')) emit({ width: Math.round(w), height: HEIGHT, paths: [...paths, stroke.current] });
    stroke.current = '';
    setLive('');
    signing?.(false);
  };

  const responder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => {
      latest.current.onSigningChange?.(true);
      stroke.current = `M${pt(e)}`;
      setLive(stroke.current);
    },
    onPanResponderMove: (e) => {
      stroke.current += ` L${pt(e)}`;
      setLive(stroke.current);
    },
    onPanResponderRelease: finish,
    onPanResponderTerminate: finish,
  })).current;

  const paths = value?.paths || [];
  return (
    <View>
      <View
        accessibilityLabel="Signature pad"
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={styles.pad}
        {...responder.panHandlers}
      >
        {width ? (
          <Svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`}>
            {[...paths, live].filter(Boolean).map((d, i) => (
              <Path key={i} d={d} fill="none" stroke={colors.text} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
            ))}
          </Svg>
        ) : null}
        {!paths.length && !live ? <Text pointerEvents="none" style={styles.hint}>Sign here</Text> : null}
        <View pointerEvents="none" style={styles.line} />
      </View>
      {paths.length ? <TextLink label="Clear signature" onPress={() => onChange(null)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pad: { backgroundColor: colors.surface, borderColor: colors.lineStrong, borderRadius: radii.sm, borderWidth: 1, height: HEIGHT, overflow: 'hidden' },
  hint: { color: colors.faint, fontSize: 14, left: 14, position: 'absolute', top: 12 },
  line: { backgroundColor: colors.line, bottom: 34, height: 1, left: 14, position: 'absolute', right: 14 },
});
