import { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { BURST_AT, clamp, MAX_DEPTH } from './model';
import { DiverArt } from '../shared/diverArt';

export const SCENE_W = 360;
// Clears the floating tip pill overlaid at the top of the stage.
export const SCENE_TOP = 100;
export const SCENE_BOTTOM_MARGIN = 54;
const W = SCENE_W;
const TOP = SCENE_TOP;
const BOTTOM_MARGIN = SCENE_BOTTOM_MARGIN;
const BASE_R = 33; // balloon radius at exactly one surface fill

function Balloon({ x, y, scale, over, burst, burstAge }) {
  const r = BASE_R * clamp(Math.sqrt(scale), 0.34, Math.sqrt(BURST_AT) + 0.05);

  if (burst) {
    // shards fly outward and fade over ~1s of wall time
    const t = clamp(burstAge / 1);
    const spread = 18 + t * 90;
    const opacity = clamp(1 - t) * 0.9;
    if (opacity <= 0.02) return null;
    return (
      <G opacity={opacity}>
        <Circle cx={x} cy={y} r={BASE_R * 0.5 + t * 70} fill="none" stroke="#CBEAFF" strokeWidth={3 * (1 - t)} />
        {Array.from({ length: 9 }).map((_, i) => {
          const a = (i / 9) * Math.PI * 2;
          const sx = x + Math.cos(a) * spread;
          const sy = y + Math.sin(a) * spread + t * 40;
          return <Path key={i} d={`M${sx} ${sy} l6 3 -2 7 -6 -3 z`} fill="#2F8BFF" stroke="#CBEAFF" strokeWidth="1.5" />;
        })}
      </G>
    );
  }

  const stroke = over ? '#FF7F7F' : '#CBEAFF';
  return (
    <G>
      {over ? <Circle cx={x} cy={y} r={r + 16} fill="url(#danger)" /> : null}
      {/* dashed reference: the balloon's size at the surface (1x) */}
      <Ellipse cx={x} cy={y} rx={BASE_R} ry={BASE_R * 1.12} fill="none" stroke="#DCEEF7" strokeWidth="1.4" strokeDasharray="4 5" opacity="0.55" />
      <SvgText x={x} y={y - BASE_R * 1.12 - 6} textAnchor="middle" fill="#DCEEF7" fontSize="8" opacity="0.6">surface size</SvgText>
      {/* knot + string */}
      <Path d={`M${x} ${y + r * 1.05} L${x - r * 0.16} ${y + r * 1.3} L${x + r * 0.16} ${y + r * 1.3} Z`} fill="#2F8BFF" stroke={stroke} strokeWidth="2" />
      <Path d={`M${x} ${y + r * 1.3} q ${r * 0.4} ${r * 0.34} 0 ${r * 0.68} q ${-r * 0.4} ${r * 0.34} 0 ${r * 0.68}`} fill="none" stroke="#CBEAFF" strokeWidth="2" opacity="0.7" />
      {/* the balloon */}
      <Ellipse cx={x} cy={y} rx={r} ry={r * 1.12} fill="#2F8BFF" stroke={stroke} strokeWidth={over ? 4 : 2.5} />
      <Path d={`M${x - r * 0.55} ${y - r * 0.62} q ${r * 0.3} ${-r * 0.4} ${r * 0.72} ${-r * 0.42}`} fill="none" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" opacity="0.4" />
    </G>
  );
}

function Diver({ x, y, breathAge }) {
  const puff = breathAge != null && breathAge < 1;
  return (
    <G transform={`translate(${x} ${y})`}>
      <G transform="rotate(-6)">
        <DiverArt width={132} ink="#0A1826" />
      </G>
      {/* regulator exhaust — a hard burst right after a breath, a trickle otherwise */}
      {(puff ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2]).map((i) => {
        const age = puff ? breathAge : 0.4;
        const rise = 8 + i * 9 + age * 46;
        return (
          <Circle
            key={i}
            cx={40 + Math.sin(i * 1.7 + rise * 0.1) * (puff ? 12 : 5)}
            cy={-30 - rise}
            r={puff ? 5 - i * 0.4 : 2.4 - i * 0.5}
            fill="#CFEEFF"
            opacity={clamp((puff ? 0.85 : 0.5) - rise / 150)}
          />
        );
      })}
    </G>
  );
}

// A translucent readout laid straight onto the scene, pinned to whichever top
// corner the demo object never occupies (left for the balloon, right for the
// diver+tank). Lines: { t: text, k: 'title' | 'value' | 'sub' }.
function Hud({ side, lines, highlight }) {
  const w = 150;
  const x = side === 'right' ? W - w - 6 : 6;
  const pad = 9;
  const lh = (k) => (k === 'title' ? 15 : k === 'sub' ? 13 : 17);
  let cursor = pad;
  const placed = lines.map((ln) => { cursor += lh(ln.k); return { ...ln, y: cursor - 4 }; });
  const h = cursor + pad - 4;
  return (
    <G>
      <Rect x={x} y={10} width={w} height={h} rx={10} fill="#04121EE8" stroke={highlight ? '#F0C84B' : 'rgba(201,235,255,0.2)'} strokeWidth={highlight ? 2 : 1} />
      {placed.map((ln, i) => (
        <SvgText
          key={i}
          x={x + pad}
          y={10 + ln.y}
          fill={ln.k === 'title' ? '#70DDF6' : ln.danger ? '#FF7F7F' : ln.k === 'sub' ? '#8FB0C4' : '#EAF2FF'}
          fontSize={ln.k === 'title' ? 10 : ln.k === 'sub' ? 9 : 11.5}
          fontWeight={ln.k === 'sub' ? 'normal' : 'bold'}
        >
          {ln.t}
        </SvgText>
      ))}
    </G>
  );
}

function Tank({ cx, top, height, tankPercent, breathAge }) {
  const tw = 52;
  const th = height;
  const tx = cx - tw / 2;
  const ty = top;
  const inner = th - 10;
  const fillH = (inner * clamp(tankPercent, 0, 100)) / 100;
  const color = tankPercent > 50 ? '#70E2A3' : tankPercent > 20 ? '#F0C84B' : '#FF7F7F';
  const flashing = breathAge != null && breathAge < 0.6;
  return (
    <G>
      <SvgText x={cx} y={ty - 20} textAnchor="middle" fill="#9FC4D8" fontSize="9" fontWeight="bold">TANK PRESSURE</SvgText>
      {/* valve + first stage */}
      <Rect x={cx - 7} y={ty - 14} width={14} height={16} rx={3} fill="#7C8CA0" stroke="#0A1826" strokeWidth="2" />
      <Circle cx={cx + 10} cy={ty - 6} r={5} fill="#5566" stroke="#0A1826" strokeWidth="2" />
      {/* cylinder */}
      <Rect x={tx} y={ty} width={tw} height={th} rx={tw / 2} fill="#0A2233" stroke={flashing ? '#FF7F7F' : '#9FC4D8'} strokeWidth={flashing ? 3.5 : 2} />
      {/* gas column */}
      <Rect x={tx + 5} y={ty + 5 + (inner - fillH)} width={tw - 10} height={fillH} rx={(tw - 10) / 2} fill={color} opacity="0.92" />
      {/* tick marks */}
      {[0.25, 0.5, 0.75].map((f) => (
        <Path key={f} d={`M${tx + 4} ${ty + 5 + inner * (1 - f)} h${tw - 8}`} stroke="#0A1826" strokeWidth="1" opacity="0.35" />
      ))}
      {/* gloss */}
      <Path d={`M${tx + 11} ${ty + 14} v${th - 28}`} stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" opacity="0.18" />
      <SvgText x={cx} y={ty + th + 22} textAnchor="middle" fill={color} fontSize="20" fontWeight="bold">{Math.round(tankPercent)}%</SvgText>
      {flashing ? (
        <SvgText x={cx + tw / 2 + 16} y={ty + th * 0.4 - breathAge * 30} textAnchor="start" fill="#FF7F7F" fontSize="13" fontWeight="bold" opacity={clamp(1 - breathAge / 0.6)}>
          gas out
        </SvgText>
      ) : null}
    </G>
  );
}

export default function BoyleScene({ width, height, depth, onDepth, mode, volume, over, burst, tankPercent, breathId, unit, hudLines = [], hudHighlight = false, locked = false }) {
  const [time, setTime] = useState(0);
  const dragging = useRef(false);
  const burstStart = useRef(null);
  const breathStart = useRef(null);
  const prevBreathId = useRef(breathId);

  useEffect(() => {
    let active = AppState.currentState === 'active';
    const subscription = AppState.addEventListener('change', (state) => { active = state === 'active'; });
    const interval = setInterval(() => { if (active) setTime((t) => t + 0.08); }, 80);
    return () => { clearInterval(interval); subscription.remove(); };
  }, []);

  if (burst && burstStart.current == null) burstStart.current = time;
  if (!burst && burstStart.current != null) burstStart.current = null;
  if (breathId !== prevBreathId.current) { prevBreathId.current = breathId; breathStart.current = time; }
  const burstAge = burstStart.current == null ? 0 : time - burstStart.current;
  const breathAge = breathStart.current == null ? null : time - breathStart.current;

  const H = W * (height / width);
  const TRAVEL = H - TOP - BOTTOM_MARGIN;
  const SEABED = H - BOTTOM_MARGIN;
  const breathing = mode === 'breathing';
  const objectX = breathing ? W * 0.34 : W * 0.57;
  const y = TOP + (clamp(depth, 0, MAX_DEPTH) / MAX_DEPTH) * TRAVEL + Math.sin(time * 0.6) * 2;
  const rulerX = breathing ? 14 : W - 35; // move the ruler aside for the tank

  const setFromTouch = (event) => {
    const py = (event.nativeEvent.locationY * W) / width;
    onDepth(clamp((py - TOP) / TRAVEL) * MAX_DEPTH);
  };

  return (
    <View
      accessibilityLabel="Underwater scene. Drag up or down to change depth, or use the depth slider."
      style={[styles.scene, { width, height }]}
      onStartShouldSetResponder={() => !locked}
      onResponderGrant={(e) => { dragging.current = true; setFromTouch(e); }}
      onResponderMove={(e) => { if (dragging.current) setFromTouch(e); }}
      onResponderRelease={() => { dragging.current = false; }}
      onResponderTerminate={() => { dragging.current = false; }}
      onResponderTerminationRequest={() => false}
    >
      <Svg pointerEvents="none" width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
        <Defs>
          <LinearGradient id="ocean" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#309DB1" /><Stop offset="0.25" stopColor="#105B7A" /><Stop offset="0.7" stopColor="#062C49" /><Stop offset="1" stopColor="#031425" />
          </LinearGradient>
          <RadialGradient id="danger"><Stop offset="0" stopColor="#FF7F7F" stopOpacity="0.55" /><Stop offset="1" stopColor="#FF7F7F" stopOpacity="0" /></RadialGradient>
        </Defs>
        <Rect width={W} height={H} fill="url(#ocean)" />
        <Path d="M90 0L10 315 155 0M155 0L200 300 200 0M235 0L350 350 265 0" fill="#B7FFFF" opacity="0.035" />
        <Path d="M0 30Q30 22 60 30T120 30T180 30T240 30T300 30T360 30" fill="none" stroke="#BDEBF2" opacity="0.6" />

        {/* depth ruler */}
        {[0, 10, 20, 30, 40].map((d) => (
          <G key={d} opacity="0.6">
            <Path d={`M${rulerX} ${TOP + (d / MAX_DEPTH) * TRAVEL} h20`} stroke="#88B6C8" strokeWidth="0.6" />
            <SvgText x={breathing ? rulerX + 24 : rulerX - 4} y={TOP + (d / MAX_DEPTH) * TRAVEL - 5} textAnchor={breathing ? 'start' : 'end'} fill="#CEE6EC" fontSize="9">{unit === 'ft' ? Math.round(d * 3.28084) : d}</SvgText>
          </G>
        ))}

        {/* seabed */}
        <Path d={`M0 ${SEABED - 12}Q65 ${SEABED - 36} 130 ${SEABED - 16}T270 ${SEABED - 20}T360 ${SEABED - 30}V${H}H0Z`} fill="#123A50" opacity="0.9" />

        {breathing ? (
          <>
            <Diver x={objectX} y={y} breathAge={breathAge} />
            <Tank cx={W - 54} top={TOP + 46} height={clamp(TRAVEL - 96, 84, 150)} tankPercent={tankPercent} breathAge={breathAge} />
          </>
        ) : (
          <Balloon x={objectX} y={y} scale={volume} over={over} burst={burst} burstAge={burstAge} />
        )}

        {hudLines.length ? <Hud side={breathing ? 'right' : 'left'} lines={hudLines} highlight={hudHighlight} /> : null}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({ scene: { overflow: 'hidden', backgroundColor: '#062C49' } });
