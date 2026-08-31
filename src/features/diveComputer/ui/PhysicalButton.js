import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text } from 'react-native';

import { DEVICE_EVENTS } from '../../../lib/virtualDiveComputer';

const BUTTON_EVENTS = Object.freeze({
  left: { long: DEVICE_EVENTS.LEFT_LONG, short: DEVICE_EVENTS.LEFT_SHORT },
  right: { long: DEVICE_EVENTS.RIGHT_LONG, short: DEVICE_EVENTS.RIGHT_SHORT },
});

export default function PhysicalButton({ button, focusLevel = 'quiet', focused = false, label, onDeviceEvent, onLongPress, onPressStateChange, scale = 1 }) {
  const handledLongPress = useRef(false);
  const pulse = useMemo(() => new Animated.Value(0), []);
  const events = BUTTON_EVENTS[button];
  useEffect(() => {
    pulse.stopAnimation();
    pulse.setValue(0);
    if (!focused || focusLevel === 'quiet') return undefined;
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { duration: focusLevel === 'urgent' ? 420 : 750, easing: Easing.inOut(Easing.ease), toValue: 1, useNativeDriver: true }),
      Animated.timing(pulse, { duration: focusLevel === 'urgent' ? 420 : 750, easing: Easing.inOut(Easing.ease), toValue: 0, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [focusLevel, focused, pulse]);
  const focusPulseStyle = {
    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.2, focusLevel === 'urgent' ? 0.95 : 0.68] }),
    transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, focusLevel === 'urgent' ? 1.1 : 1.05] }) }],
  };

  return (
    <Pressable
      accessibilityHint="Tap for a short press or hold for a long press."
      accessibilityLabel={`${button} dive computer button, ${label}`}
      accessibilityRole="button"
      delayLongPress={650}
      hitSlop={Math.max(8, 12 * scale)}
      onLongPress={() => {
        handledLongPress.current = true;
        if (onLongPress) onLongPress(button, events.long);
        else onDeviceEvent(events.long);
      }}
      onPressIn={() => onPressStateChange?.(button, true)}
      onPress={() => {
        if (!handledLongPress.current) onDeviceEvent(events.short);
        handledLongPress.current = false;
      }}
      onPressOut={() => {
        onPressStateChange?.(button, false);
        handledLongPress.current = false;
      }}
      style={({ pressed }) => [
        styles.button,
        {
          borderRadius: 4 * scale,
          borderWidth: Math.max(1, 1.5 * scale),
          height: 34 * scale,
          shadowOffset: { width: 0, height: 3 * scale },
          shadowRadius: 3 * scale,
          width: 58 * scale,
        },
        focused && styles.focused,
        pressed && styles.pressed,
      ]}
    >
      {focused && focusLevel !== 'quiet' ? <Animated.View pointerEvents="none" style={[styles.focusPulse, focusPulseStyle]} /> : null}
      <Text
        adjustsFontSizeToFit
        allowFontScaling={false}
        minimumFontScale={0.72}
        numberOfLines={2}
        style={[styles.label, { fontSize: 7.5 * scale, lineHeight: 9 * scale }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export { BUTTON_EVENTS };

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: '#151C22',
    borderColor: '#53616A',
    elevation: 4,
    justifyContent: 'center',
    paddingHorizontal: 4,
    shadowColor: '#000000',
    shadowOpacity: 0.65,
  },
  label: {
    color: '#C7D4D9',
    fontWeight: '900',
    letterSpacing: 0.35,
    textAlign: 'center',
  },
  focused: { borderColor: '#70DDF6', elevation: 8, shadowColor: '#70DDF6', shadowOpacity: 0.65, shadowRadius: 7 },
  focusPulse: { borderColor: '#B8F3FF', borderRadius: 8, borderWidth: 2, bottom: -5, left: -5, position: 'absolute', right: -5, top: -5 },
  pressed: {
    backgroundColor: '#090D10',
    borderColor: '#70DDF6',
    opacity: 0.88,
    shadowOpacity: 0.2,
    transform: [{ scale: 0.94 }, { translateY: 1 }],
  },
});
