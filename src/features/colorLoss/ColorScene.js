import { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { beamStrength, clamp, MAX_DEPTH, sceneColor } from './model';
import { DIVER_PATHS, DIVER_VB_H, DIVER_VB_W } from '../shared/diverArt';

export const SCENE_W = 360;
// Clears the floating tip pill overlaid at the top of the stage so the
// diver's highest fin extent never sits underneath it at depth 0.
export const SCENE_TOP = 104;
export const SCENE_BOTTOM_MARGIN = 60;
const W = SCENE_W;
const TOP = SCENE_TOP;
const BOTTOM_MARGIN = SCENE_BOTTOM_MARGIN;
// Fish depth fractions (0 = just under the surface band, 1 = seabed), tuned
// against the original TOP/TRAVEL=62/328 layout so they still read as the
// same "depths" once TRAVEL is stretched to fill a taller screen.
const FISH = [
  { fx: 50, frac: 0.085, color: '#FF8B36' },
  { fx: 270, frac: 0.268, color: '#EEDB37' },
  { fx: 68, frac: 0.530, color: '#E969A8' },
  { fx: 250, frac: 0.786, color: '#E74333' },
];

// Diver line art is shared with the Boyle's Law scene (see
// features/shared/diverArt.js). DIVER_W is the on-screen width we scale to.
const DIVER_W = 165;
const DIVER_SCALE = DIVER_W / DIVER_VB_W;
// Generous touch target around the diver's rendered bounds so only a drag
// that starts on him moves him (a small padding makes him easy to grab).
const DIVER_HALF_W = DIVER_W / 2 + 20;
const DIVER_HALF_H = (DIVER_VB_H * DIVER_SCALE) / 2 + 20;

function Diver({ x, y, gear, depth, clarity, beam }) {
  const paint = (color, dx, dy) => sceneColor(color, depth, clarity, beamStrength(x + dx, y + dy, beam));
  const ink = paint('#0B1420', 0, 0);
  const suit = paint(gear.wetsuit, -6, 3);
  const fins = paint(gear.fins, -60, -12);
  const finsLow = paint(gear.fins, -63, 24);
  const tank = paint(gear.tank, 27, -10);
  const mask = paint(gear.mask, 50, -7);
  const maskFront = paint(gear.mask, 54, -17);
  const tx = x - (DIVER_VB_W * DIVER_SCALE) / 2;
  const ty = y - (DIVER_VB_H * DIVER_SCALE) / 2;
  return (
    <G transform={`translate(${tx} ${ty}) scale(${DIVER_SCALE})`} fill="none" stroke={ink} strokeWidth="6" strokeLinejoin="round" strokeLinecap="round">
      <Path d={DIVER_PATHS.wetsuit} fill={suit} />
      <Path d={DIVER_PATHS.shadeA} />
      <Path d={DIVER_PATHS.finsTop} fill={fins} />
      <Path d={DIVER_PATHS.finsBottom} fill={finsLow} />
      <Path d={DIVER_PATHS.tank} fill={tank} />
      <Path d={DIVER_PATHS.mask} fill={mask} />
      <Path d={DIVER_PATHS.maskFront} fill={maskFront} />
      <Path d={DIVER_PATHS.shadeB} />
      <Path d={DIVER_PATHS.shadeC} />
      {DIVER_PATHS.bubbles.map((d, i) => <Path key={i} d={d} strokeWidth="4" opacity="0.85" />)}
    </G>
  );
}

function Fish({ x, y, color, clarity, beam, flip = false, top, travel }) {
  const depth = clamp((y - top) / travel) * MAX_DEPTH;
  const fill = (c) => sceneColor(c, depth, clarity, beamStrength(x, y, beam));
  return (
    <G transform={`translate(${x} ${y}) scale(${flip ? -1 : 1} 1)`} stroke={fill('#172B3D')} strokeWidth="1.5">
      <Path d="M-12 0L-26-12-23 12Z" fill={fill(color)} />
      <Path d="M-8-8L0-17 10-7 M-7 8L2 15 11 6" fill={fill(color)} />
      <Ellipse cx="3" cy="0" rx="20" ry="11" fill={fill(color)} />
      <Path d="M-3-9L-4 9 M5-10L4 10" stroke={fill('#F7E6BA')} strokeWidth="4" />
      <Circle cx="16" cy="-2" r="2" fill={fill('#112536')} />
    </G>
  );
}

export default function ColorScene({ width, height, depth, onDepth, gear, clarity, flashlight, tool, position, onPosition, beam, onBeam, unit, onInteracting, locked = false }) {
  const dragOrigin = useRef(null);
  const draggingDiver = useRef(false);
  const [time, setTime] = useState(0);
  useEffect(() => {
    // Small, slow reef motion; leave the JS thread free between frames.
    let active = AppState.currentState === 'active';
    const subscription = AppState.addEventListener('change', (state) => { active = state === 'active'; });
    const interval = setInterval(() => { if (active) setTime((t) => t + 0.12); }, 120);
    return () => { clearInterval(interval); subscription.remove(); };
  }, []);
  // Virtual viewBox height chosen so scaleY (height/H) always equals
  // scaleX (width/W): the scene fills its box edge-to-edge with no
  // letterboxing, on any device aspect ratio.
  const H = W * (height / width);
  const TRAVEL = H - TOP - BOTTOM_MARGIN;
  const SEABED = H - BOTTOM_MARGIN;
  const x = position * W;
  const y = TOP + depth / MAX_DEPTH * TRAVEL;
  const activeBeam = flashlight ? beam : null;
  const touch = (event, initial) => {
    const px = event.nativeEvent.locationX * W / width;
    const py = event.nativeEvent.locationY * W / width;
    if (tool === 'light' && flashlight) {
      onBeam({ x: clamp(px, 0, W), y: clamp(py, 30, H) });
      return;
    }
    if (initial) {
      // Only a drag that starts on the diver moves him; a touch elsewhere
      // in the water column does nothing.
      draggingDiver.current = Math.abs(px - x) <= DIVER_HALF_W && Math.abs(py - y) <= DIVER_HALF_H;
      if (draggingDiver.current) dragOrigin.current = { x: px - x, y: py - y };
      return;
    }
    if (!draggingDiver.current) return;
    onPosition(clamp((px - dragOrigin.current.x) / W, 0.23, 0.77));
    onDepth(clamp((py - dragOrigin.current.y - TOP) / TRAVEL) * MAX_DEPTH);
  };
  return (
    <View
      accessibilityLabel="Underwater scene. Use the depth slider or drag to move the diver."
      style={[styles.scene, { width, height }]}
      onStartShouldSetResponder={() => !locked}
      onResponderGrant={(e) => { onInteracting(true); touch(e, true); }}
      onResponderMove={(e) => touch(e, false)}
      onResponderRelease={() => onInteracting(false)}
      onResponderTerminate={() => onInteracting(false)}
      onResponderTerminationRequest={() => false}
    >
      <Svg pointerEvents="none" width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
        <Defs>
          <LinearGradient id="ocean" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#309DB1" /><Stop offset="0.25" stopColor="#105B7A" /><Stop offset="0.7" stopColor="#062C49" /><Stop offset="1" stopColor="#031425" />
          </LinearGradient>
          <RadialGradient id="beam"><Stop offset="0" stopColor="#FFF3C8" stopOpacity="0.18" /><Stop offset="1" stopColor="#FFF3C8" stopOpacity="0" /></RadialGradient>
        </Defs>
        <Rect width={W} height={H} fill="url(#ocean)" />
        <Path d="M90 0L10 315 155 0M155 0L200 300 200 0M235 0L350 350 265 0" fill="#B7FFFF" opacity="0.035" />
        <Path d="M0 30Q30 22 60 30T120 30T180 30T240 30T300 30T360 30" fill="none" stroke="#BDEBF2" opacity="0.6" />
        {[0, 10, 20, 30, 40].map((d) => (
          <G key={d} opacity="0.65">
            <Path d={`M${W - 35} ${TOP + d / MAX_DEPTH * TRAVEL}h23`} stroke="#88B6C8" strokeWidth="0.6" />
            <SvgText x={W - 13} y={TOP + d / MAX_DEPTH * TRAVEL - 5} textAnchor="end" fill="#CEE6EC" fontSize="9">{unit === 'ft' ? Math.round(d * 3.28084) : d}</SvgText>
          </G>
        ))}
        {FISH.map(({ fx, frac, color }, i) => <Fish key={i} x={fx + Math.sin(time * 0.5 + i) * 20} y={TOP + frac * TRAVEL + Math.sin(time + i) * 3} color={color} clarity={clarity} beam={activeBeam} flip={i % 2 === 0} top={TOP} travel={TRAVEL} />)}
        <Path d={`M0 ${SEABED - 15}Q65 ${SEABED - 41} 130 ${SEABED - 19}T270 ${SEABED - 22}T360 ${SEABED - 34}V${H}H0Z`} fill={sceneColor('#D1B888', 40, clarity, beamStrength(180, SEABED - 17, activeBeam))} />
        {[24, 65, 298, 328].map((cx, i) => (
          <G key={cx} stroke={sceneColor(i % 2 ? '#F57199' : '#F09042', 40, clarity, beamStrength(cx, SEABED - 34, activeBeam))} strokeWidth="5" strokeLinecap="round" fill="none">
            <Path d={`M${cx} ${SEABED - 13}v-35m0 20l-12-10v-10m12 11l11-9v-12m-11 26l-6-3`} />
          </G>
        ))}
        <Diver x={x} y={y} depth={depth} gear={gear} clarity={clarity} beam={activeBeam} />
        {activeBeam ? <G><Circle cx={beam.x} cy={beam.y} r="85" fill="url(#beam)" /><Circle cx={beam.x} cy={beam.y} r="85" fill="none" stroke="#FFE9A5" strokeWidth="1" strokeDasharray="4 6" opacity="0.4" /><Path d={`M${beam.x - 5} ${beam.y}h10m-5-5v10`} stroke="#FFE9A5" opacity="0.7" /></G> : null}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({ scene: { overflow: 'hidden', backgroundColor: '#062C49' } });
