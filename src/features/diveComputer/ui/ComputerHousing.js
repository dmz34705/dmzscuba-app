import { useEffect, useRef, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import InstrumentDisplay from './InstrumentDisplay';
import PhysicalButton from './PhysicalButton';
import { DEVICE_EVENTS } from '../../../lib/virtualDiveComputer';

function Screw({ scale, style }) {
  return <View style={[styles.screw, { borderRadius: 4 * scale, height: 7 * scale, width: 7 * scale }, style]} />;
}

// A ~2 second combined hold returns to the home screen from any menu. Kept
// short enough to feel responsive and paired with an on-screen progress cue,
// because a silent multi-second hold is easy to abandon early.
const BOTH_BUTTON_HOLD_MS = 1800;
const BOTH_HOLD_PROGRESS_INTERVAL_MS = 60;

export default function ComputerHousing({ display, focusAreas = [], focusLevel = 'quiet', geometry, onDeviceEvent }) {
  const buttonState = useRef({ leftPressed: false, rightPressed: false, leftLong: false, rightLong: false, bothSent: false, bothCandidate: false, bothCancelled: false, bothPressedAt: null, bothTimer: null, bothProgressTimer: null, pendingLongEvents: {} });
  const [holdProgress, setHoldProgress] = useState(0);
  useEffect(() => () => {
    const state = buttonState.current;
    if (state.bothTimer) clearTimeout(state.bothTimer);
    if (state.bothProgressTimer) clearInterval(state.bothProgressTimer);
    state.bothTimer = null;
    state.bothProgressTimer = null;
    state.pendingLongEvents = {};
    state.leftPressed = false;
    state.rightPressed = false;
  }, []);
  const { height, scale, screen, width } = geometry;
  const focusHousing = focusAreas.includes('housing');
  const focusDisplay = focusAreas.includes('display');
  const focusButtons = focusAreas.includes('buttons');
  const stopHoldProgress = () => {
    if (buttonState.current.bothProgressTimer) {
      clearInterval(buttonState.current.bothProgressTimer);
      buttonState.current.bothProgressTimer = null;
    }
    setHoldProgress(0);
  };
  const handlePressState = (button, pressed) => {
    buttonState.current.pendingLongEvents = buttonState.current.pendingLongEvents || {};
    buttonState.current[`${button}Pressed`] = pressed;
    if (pressed && buttonState.current.leftPressed && buttonState.current.rightPressed && !buttonState.current.bothSent && !buttonState.current.bothTimer) {
      buttonState.current.bothCandidate = true;
      buttonState.current.bothCancelled = false;
      buttonState.current.bothPressedAt = Date.now();
      setHoldProgress(0.001);
      // Drive the on-screen progress cue while both buttons are held.
      buttonState.current.bothProgressTimer = setInterval(() => {
        const state = buttonState.current;
        if (state.bothPressedAt == null || state.bothSent) return;
        setHoldProgress(Math.min(1, (Date.now() - state.bothPressedAt) / BOTH_BUTTON_HOLD_MS));
      }, BOTH_HOLD_PROGRESS_INTERVAL_MS);
      // Start the combined-hold threshold from the moment the second button
      // goes down. This does not depend on either Pressable's onLongPress
      // callback winning the race against the other one.
      buttonState.current.bothTimer = setTimeout(() => {
        const state = buttonState.current;
        state.bothTimer = null;
        if (state.leftPressed && state.rightPressed && !state.bothSent) {
          state.bothSent = true;
          delete state.pendingLongEvents.left;
          delete state.pendingLongEvents.right;
          stopHoldProgress();
          onDeviceEvent(DEVICE_EVENTS.BOTH_LONG);
        }
      }, BOTH_BUTTON_HOLD_MS);
    }
    if (!pressed) {
      const wasLong = buttonState.current[`${button}Long`];
      const bothWasHeld = buttonState.current.bothPressedAt != null;
      const bothHeldLongEnough = bothWasHeld && Date.now() - buttonState.current.bothPressedAt >= BOTH_BUTTON_HOLD_MS;
      buttonState.current[`${button}Long`] = false;
      if (bothHeldLongEnough && !buttonState.current.bothSent && !buttonState.current.bothCancelled) {
        buttonState.current.bothSent = true;
        delete buttonState.current.pendingLongEvents.left;
        delete buttonState.current.pendingLongEvents.right;
        onDeviceEvent(DEVICE_EVENTS.BOTH_LONG);
      }
      if (bothWasHeld && !bothHeldLongEnough && !buttonState.current.bothSent) {
        buttonState.current.bothCandidate = true;
        buttonState.current.bothCancelled = true;
      }
      // Either button lifting ends the combined-hold window - a lingering
      // second button must not later complete the gesture on its own.
      buttonState.current.bothPressedAt = null;
      if (buttonState.current.bothTimer) {
        clearTimeout(buttonState.current.bothTimer);
        buttonState.current.bothTimer = null;
      }
      stopHoldProgress();
      const pendingEvent = buttonState.current.pendingLongEvents[button];
      delete buttonState.current.pendingLongEvents[button];
      if (wasLong && pendingEvent && !buttonState.current.bothSent && !buttonState.current.bothCandidate) onDeviceEvent(pendingEvent);
      if (!buttonState.current.leftPressed && !buttonState.current.rightPressed) {
        buttonState.current.bothSent = false;
        buttonState.current.bothCandidate = false;
        buttonState.current.bothCancelled = false;
      }
    }
  };
  const handleLongPress = (button, singleEvent) => {
    buttonState.current.pendingLongEvents = buttonState.current.pendingLongEvents || {};
    buttonState.current[`${button}Long`] = true;
    if (!buttonState.current.bothSent) {
      // Defer individual long presses until release. If the other button is
      // also held, its long-press callback can promote this gesture to the
      // global return-home shortcut before either individual action fires.
      buttonState.current.pendingLongEvents[button] = singleEvent;
    }
  };
  return (
    <View accessibilityLabel="DMZ BlueBound virtual dive computer" style={[styles.instrument, { height, width }]}>
      <View style={[styles.strapTop, { borderRadius: 13 * scale, height: 38 * scale, left: 116 * scale, top: 0, width: 128 * scale }]} />
      <View style={[styles.strapBottom, { borderRadius: 13 * scale, bottom: 0, height: 38 * scale, left: 116 * scale, width: 128 * scale }]} />

      <LinearGradient
        colors={['#36434A', '#171F24', '#080C0F']}
        end={{ x: 0.86, y: 1 }}
        start={{ x: 0.14, y: 0 }}
        style={[
          styles.body,
          {
            borderRadius: 22 * scale,
            borderWidth: (focusHousing ? 4 : 2.5) * scale,
            bottom: 15 * scale,
            left: 8 * scale,
            right: 8 * scale,
            top: 15 * scale,
          },
          focusHousing && styles.focusedHousing,
        ]}
      >
        <View style={[styles.sideRail, { height: 202 * scale, left: -7 * scale, top: 52 * scale, width: 18 * scale }]} />
        <View style={[styles.sideRail, { height: 202 * scale, right: -7 * scale, top: 52 * scale, width: 18 * scale }]} />
        {[60, 91, 122, 153, 184, 215].map((top) => <View key={`left-${top}`} style={[styles.railRidge, { height: 12 * scale, left: -3 * scale, top: top * scale, width: 12 * scale }]} />)}
        {[60, 91, 122, 153, 184, 215].map((top) => <View key={`right-${top}`} style={[styles.railRidge, { height: 12 * scale, right: -3 * scale, top: top * scale, width: 12 * scale }]} />)}

        <View style={[styles.topArmor, { height: 12 * scale, left: 30 * scale, right: 30 * scale, top: 0 }]} />
        <View style={[styles.bottomArmor, { bottom: 0, height: 12 * scale, left: 30 * scale, right: 30 * scale }]} />

        <Text allowFontScaling={false} style={[styles.brand, { fontSize: 9 * scale, left: 0, right: 0, top: 13 * scale }]}>BLUEBOUND</Text>
        <Text allowFontScaling={false} style={[styles.model, { fontSize: 5.5 * scale, left: 0, right: 0, top: 25 * scale }]}>DMZ DIVE INSTRUMENTS</Text>

        <View style={[styles.bezel, focusDisplay && styles.focusedBezel, { borderRadius: 10 * scale, borderWidth: 8 * scale, height: 216 * scale, left: 19 * scale, top: 36 * scale, width: 306 * scale }]}>
          <InstrumentDisplay display={display} focusAreas={focusAreas} height={screen.height} holdProgress={holdProgress} scale={scale} width={screen.width} />
        </View>

        <Screw scale={scale} style={{ left: 20 * scale, top: 27 * scale }} />
        <Screw scale={scale} style={{ right: 20 * scale, top: 27 * scale }} />
        <Screw scale={scale} style={{ bottom: 19 * scale, left: 20 * scale }} />
        <Screw scale={scale} style={{ bottom: 19 * scale, right: 20 * scale }} />

        <View style={[styles.buttonGuard, { bottom: 10 * scale, height: 55 * scale, left: 25 * scale, width: 90 * scale }]} />
        <View style={[styles.buttonGuard, { bottom: 10 * scale, height: 55 * scale, right: 25 * scale, width: 90 * scale }]} />
        <View style={[styles.buttonWell, { borderRadius: 7 * scale, bottom: 15 * scale, height: 44 * scale, left: 35 * scale, width: 70 * scale }]}>
          <PhysicalButton button="left" focusLevel={focusLevel} focused={focusButtons || focusAreas.includes('leftButton')} label="ADV" onDeviceEvent={onDeviceEvent} onLongPress={handleLongPress} onPressStateChange={handlePressState} scale={scale} />
        </View>
        <View style={[styles.buttonWell, { borderRadius: 7 * scale, bottom: 15 * scale, height: 44 * scale, right: 35 * scale, width: 70 * scale }]}>
          <PhysicalButton button="right" focusLevel={focusLevel} focused={focusButtons || focusAreas.includes('rightButton')} label="SEL" onDeviceEvent={onDeviceEvent} onLongPress={handleLongPress} onPressStateChange={handlePressState} scale={scale} />
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  bezel: { alignItems: 'center', backgroundColor: '#030607', borderColor: '#050708', justifyContent: 'center', position: 'absolute' },
  bottomArmor: { backgroundColor: '#080C0F', borderColor: '#48565E', borderTopLeftRadius: 5, borderTopRightRadius: 5, borderTopWidth: 1, position: 'absolute' },
  body: { borderColor: '#52616A', elevation: 14, overflow: 'visible', position: 'absolute', shadowColor: '#000000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.55, shadowRadius: 18 },
  focusedBezel: { borderColor: '#70DDF6', shadowColor: '#70DDF6', shadowOpacity: 0.62, shadowRadius: 10 },
  focusedHousing: { borderColor: '#70DDF6', shadowColor: '#70DDF6', shadowOpacity: 0.5, shadowRadius: 16 },
  brand: { color: '#E4EEF1', fontWeight: '900', letterSpacing: 2.1, position: 'absolute', textAlign: 'center' },
  buttonGuard: { backgroundColor: '#090D10', borderColor: '#46535A', borderRadius: 9, borderWidth: 1, position: 'absolute' },
  buttonWell: { alignItems: 'center', backgroundColor: '#050708', borderColor: '#3A464D', borderWidth: 1, justifyContent: 'center', position: 'absolute' },
  instrument: { position: 'relative' },
  model: { color: '#6F858E', fontWeight: '800', letterSpacing: 1.1, position: 'absolute', textAlign: 'center' },
  screw: { backgroundColor: '#66747A', borderColor: '#0A0D0E', borderWidth: 1, opacity: 0.65, position: 'absolute' },
  railRidge: { backgroundColor: '#303B40', borderColor: '#090D10', borderWidth: 1, position: 'absolute' },
  sideRail: { backgroundColor: '#0B1114', borderColor: '#536169', borderRadius: 5, borderWidth: 1, position: 'absolute' },
  strapBottom: { backgroundColor: '#10171B', borderColor: '#39464D', borderWidth: 1, position: 'absolute' },
  strapTop: { backgroundColor: '#10171B', borderColor: '#39464D', borderWidth: 1, position: 'absolute' },
  topArmor: { backgroundColor: '#303B41', borderBottomLeftRadius: 4, borderBottomRightRadius: 4, borderColor: '#536169', borderBottomWidth: 1, position: 'absolute' },
});
