import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
} from 'react-native';

export function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReducedMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reducedMotion;
}

// Animate one live screen only. Rendering the outgoing and incoming app trees
// together duplicates tab bars and native-backed views, which can flash black
// or briefly fight over the same native resources.
export function PageTransition({ children, transitionKey, kind = 'forward' }) {
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(1)).current;
  const activeKey = useRef(transitionKey);
  const animation = useRef(null);
  const frame = useRef(null);

  useLayoutEffect(() => {
    if (activeKey.current === transitionKey) return undefined;
    activeKey.current = transitionKey;

    animation.current?.stop();
    if (frame.current != null) cancelAnimationFrame(frame.current);

    // Main-tab feedback lives in the persistent bottom bar. Moving the entire
    // shell would also move that bar, so tab changes intentionally stay still.
    if (reducedMotion || kind === 'none' || kind === 'tab') {
      progress.setValue(1);
      return undefined;
    }

    progress.setValue(0);
    frame.current = requestAnimationFrame(() => {
      animation.current = Animated.timing(progress, {
        duration: 240,
        easing: Easing.bezier(0.22, 0.78, 0.24, 1),
        toValue: 1,
        useNativeDriver: true,
      });
      animation.current.start();
    });

    return () => {
      if (frame.current != null) cancelAnimationFrame(frame.current);
      animation.current?.stop();
    };
  }, [kind, progress, reducedMotion, transitionKey]);

  const offset = kind === 'back' ? -14 : 22;

  return (
    <Animated.View style={[styles.container, {
      opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }),
      transform: [{ translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [offset, 0] }) }],
    }]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#050B14', flex: 1, overflow: 'hidden' },
});
