import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Polygon, Text as SvgText } from 'react-native-svg';

import { norm360 } from './model';

const VB = 300;
const C = VB / 2; // 150

const COL = {
  housing: '#0A1B26',
  ring: '#12303F',
  card: '#0E2431',
  cardEdge: '#2E5468',
  cardLocked: '#3A2A1A',
  tick: '#7FA6B8',
  tickMajor: '#CFE6F0',
  text: '#DCEDF4',
  north: '#FF6B6B',
  lubber: '#7DE0F5',
  bezelEdge: '#5FE3D0',
  gate: '#F0C84B',
  target: '#F0C84B',
  bubbleWell: '#0B2531',
  bubbleOk: '#5FE3D0',
  bubbleBad: '#FFB36A',
  alert: '#FF9A5A',
};

const DEG_TICKS = [];
for (let d = 0; d < 360; d += 5) DEG_TICKS.push(d);

const CARD_LABELS = [
  { d: 0, t: 'N', north: true },
  { d: 90, t: 'E' },
  { d: 180, t: 'S' },
  { d: 270, t: 'W' },
  { d: 30, t: '3' }, { d: 60, t: '6' }, { d: 120, t: '12' }, { d: 150, t: '15' },
  { d: 210, t: '21' }, { d: 240, t: '24' }, { d: 300, t: '30' }, { d: 330, t: '33' },
];
// The bezel keeps its existing 5° tick marks, but every 10° is labeled as a
// full three-digit course. North is represented by the fixed N index gate.
const BEZEL_LABELS = Array.from({ length: 35 }, (_, index) => (index + 1) * 10);

const rad = (d) => (d * Math.PI) / 180;
const px = (d, r) => C + r * Math.sin(rad(d));
const py = (d, r) => C - r * Math.cos(rad(d));

// screen point -> bearing (0 = up, clockwise)
function pointBearing(x, y) {
  return norm360((Math.atan2(x - C, -(y - C)) * 180) / Math.PI);
}
// signed shortest a-b in (-180, 180]
function angleDelta(a, b) {
  const d = norm360(a - b);
  return d > 180 ? d - 360 : d;
}

function CompassCard({ heading, locked }) {
  return (
    <G rotation={-heading} originX={C} originY={C}>
      <Circle cx={C} cy={C} r={103} fill={locked ? COL.cardLocked : COL.card} stroke={COL.cardEdge} strokeWidth={2} />
      {DEG_TICKS.map((d) => {
        const major = d % 30 === 0;
        const mid = d % 10 === 0;
        const r2 = 99;
        const r1 = major ? 84 : mid ? 90 : 94;
        return (
          <Line key={d} x1={px(d, r1)} y1={py(d, r1)} x2={px(d, r2)} y2={py(d, r2)} stroke={major ? COL.tickMajor : COL.tick} strokeWidth={major ? 2 : 1} />
        );
      })}
      {CARD_LABELS.map((l) => (
        <G key={l.d} rotation={l.d} originX={C} originY={C}>
          <SvgText
            x={C} y={C - 64}
            fill={l.north ? COL.north : COL.text}
            fontSize={l.north || l.t.length === 1 ? 15 : 10}
            fontWeight={l.north || l.t.length === 1 ? '900' : '700'}
            textAnchor="middle"
          >
            {l.t}
          </SvgText>
        </G>
      ))}
      <Polygon points={`${C},${C - 90} ${C - 7},${C - 74} ${C + 7},${C - 74}`} fill={COL.north} />
      <Circle cx={C} cy={C} r={4} fill={COL.cardEdge} />
    </G>
  );
}

function Bezel({ bezel }) {
  return (
    <G rotation={bezel} originX={C} originY={C}>
      <Circle cx={C} cy={C} r={139} fill="none" stroke={COL.ring} strokeWidth={2} />
      {DEG_TICKS.map((d) => {
        const major = d % 30 === 0;
        const mid = d % 10 === 0;
        const r1 = major ? 121 : mid ? 127 : 131;
        return (
          <Line key={d} x1={px(d, 139)} y1={py(d, 139)} x2={px(d, r1)} y2={py(d, r1)} stroke={major ? COL.bezelEdge : COL.tick} strokeWidth={major ? 2.5 : mid ? 1.5 : 1} />
        );
      })}
      {BEZEL_LABELS.map((d) => {
        const major = d % 30 === 0;
        return (
          <G key={d} rotation={d} originX={C} originY={C}>
            <SvgText
              x={C}
              y={C - 113}
              fill={COL.bezelEdge}
              fontSize={major ? 8 : 5.5}
              fontWeight={major ? '900' : '700'}
              textAnchor="middle"
            >
              {String(d).padStart(3, '0')}
            </SvgText>
          </G>
        );
      })}
      {/* index gate straddling the bezel's north */}
      <Line x1={px(-9, 147)} y1={py(-9, 147)} x2={px(-9, 117)} y2={py(-9, 117)} stroke={COL.gate} strokeWidth={4} strokeLinecap="round" />
      <Line x1={px(9, 147)} y1={py(9, 147)} x2={px(9, 117)} y2={py(9, 117)} stroke={COL.gate} strokeWidth={4} strokeLinecap="round" />
      <Polygon points={`${C},${C - 150} ${C - 9},${C - 133} ${C + 9},${C - 133}`} fill={COL.gate} />
      <SvgText x={C} y={C - 118} fill={COL.gate} fontSize={11} fontWeight="900" textAnchor="middle">N</SvgText>
    </G>
  );
}

function TiltBubble({ tilt, tiltVec }) {
  const bx = C + (tiltVec?.x || 0) * 22;
  const by = C + (tiltVec?.y || 0) * 22;
  const bad = tilt > 18;
  return (
    <G>
      <Circle cx={C} cy={C} r={14} fill={COL.bubbleWell} stroke={COL.ring} strokeWidth={2} />
      <Circle cx={C} cy={C} r={6} fill="none" stroke={COL.ring} strokeWidth={1} />
      <Circle cx={bx} cy={by} r={5.5} fill={bad ? COL.bubbleBad : COL.bubbleOk} opacity={0.95} />
    </G>
  );
}

// Curved arrow near the lubber showing which way to turn the body back on course.
function TurnCue({ dir, o }) {
  const r = 115;
  const s = dir === 'right' ? 1 : -1;
  const a1 = s * 10;
  const a2 = s * 48;
  return (
    <G opacity={o}>
      <Path
        d={`M${px(a1, r)} ${py(a1, r)} A ${r} ${r} 0 0 ${dir === 'right' ? 1 : 0} ${px(a2, r)} ${py(a2, r)}`}
        fill="none" stroke={COL.alert} strokeWidth={5} strokeLinecap="round"
      />
      <Polygon
        points={`${px(a2 + s * 4, r)},${py(a2 + s * 4, r)} ${px(a2 - s * 3, r + 8)},${py(a2 - s * 3, r + 8)} ${px(a2 - s * 3, r - 8)},${py(a2 - s * 3, r - 8)}`}
        fill={COL.alert}
      />
    </G>
  );
}

export default function CompassRose({
  size = 300,
  heading = 0,
  bezel = 0,
  targetHeading = null,
  tilt = 0,
  tiltVec = { x: 0, y: 0 },
  locked = false,
  mode = 'sensor',
  highlight = null, // 'lubber' | 'card' | 'bezel' | 'tilt' — glow it, dim the rest
  course = null, // { deg, dir:'left'|'right', on:boolean } during a hold step
  onHeadingChange,
  onBezelChange,
}) {
  const gesture = useRef(null);
  const toVb = (e) => ({
    x: (e.nativeEvent.locationX / size) * VB,
    y: (e.nativeEvent.locationY / size) * VB,
  });

  const offCourse = Boolean(course && !course.on);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!highlight && !offCourse) return undefined;
    const id = setInterval(() => setTick((v) => v + 1), 90);
    return () => clearInterval(id);
  }, [highlight, offCourse]);
  const pulse = 0.4 + 0.4 * Math.sin(tick * 0.4);
  const glow = highlight ? 0.35 + 0.4 * Math.sin(tick * 0.4) : 0;
  const dim = (part) => (highlight && highlight !== part ? 0.28 : 1);

  const grant = (e) => {
    const p = toVb(e);
    const r = Math.hypot(p.x - C, p.y - C);
    const a = pointBearing(p.x, p.y);
    if (r >= 107 && r <= 150 && onBezelChange) {
      gesture.current = { kind: 'bezel', startA: a, startVal: bezel };
    } else if (mode === 'manual' && r >= 30 && r <= 104 && onHeadingChange && !locked) {
      gesture.current = { kind: 'card', startA: a, startVal: heading };
    } else {
      gesture.current = null;
    }
  };
  const move = (e) => {
    const g = gesture.current;
    if (!g) return;
    const p = toVb(e);
    const d = angleDelta(pointBearing(p.x, p.y), g.startA);
    if (g.kind === 'bezel') onBezelChange(norm360(g.startVal + d));
    else if (g.kind === 'card') onHeadingChange(norm360(g.startVal + d));
  };
  const end = () => { gesture.current = null; };

  return (
    <View
      style={[styles.wrap, { width: size, height: size }]}
      onStartShouldSetResponder={() => true}
      onResponderGrant={grant}
      onResponderMove={move}
      onResponderRelease={end}
      onResponderTerminate={end}
      onResponderTerminationRequest={() => false}
    >
      <Svg pointerEvents="none" width={size} height={size} viewBox={`0 0 ${VB} ${VB}`}>
        <Circle cx={C} cy={C} r={147} fill={COL.housing} stroke={offCourse ? COL.alert : COL.ring} strokeWidth={offCourse ? 3 : 3} opacity={offCourse ? 0.4 + 0.6 * pulse : 1} />

        <G opacity={dim('bezel')}><Bezel bezel={bezel} /></G>
        <G opacity={dim('card')}><CompassCard heading={heading} locked={locked} /></G>

        {targetHeading != null ? (
          <G rotation={targetHeading - heading} originX={C} originY={C}>
            <Polygon points={`${C},${C - 104} ${C - 6},${C - 114} ${C + 6},${C - 114}`} fill={COL.target} />
          </G>
        ) : null}

        {/* lubber line — fixed, an extension of the diver */}
        <G opacity={dim('lubber')}>
          <Line x1={C} y1={C - 118} x2={C} y2={C + 100} stroke={COL.lubber} strokeWidth={1.5} opacity={0.4} />
          <Line x1={C} y1={C - 118} x2={C} y2={C - 8} stroke={COL.lubber} strokeWidth={3} />
          <Polygon points={`${C},${C - 124} ${C - 6},${C - 112} ${C + 6},${C - 112}`} fill={COL.lubber} />
          <Line x1={C - 8} y1={C + 96} x2={C + 8} y2={C + 96} stroke={COL.lubber} strokeWidth={3.5} />
          <Circle cx={C} cy={C} r={6} fill={COL.lubber} />
        </G>

        {/* part highlight */}
        {highlight === 'bezel' ? <Circle cx={C} cy={C} r={124} fill="none" stroke={COL.bezelEdge} strokeWidth={7} opacity={glow} /> : null}
        {highlight === 'card' ? <Circle cx={C} cy={C} r={100} fill="none" stroke={COL.lubber} strokeWidth={6} opacity={glow} /> : null}
        {highlight === 'lubber' ? <Line x1={C} y1={C - 120} x2={C} y2={C + 100} stroke={COL.lubber} strokeWidth={12} strokeLinecap="round" opacity={glow * 0.6} /> : null}
        {highlight === 'tilt' ? <Circle cx={C} cy={C} r={19} fill="none" stroke={COL.bubbleOk} strokeWidth={5} opacity={glow} /> : null}

        <G opacity={dim('tilt')}><TiltBubble tilt={tilt} tiltVec={tiltVec} /></G>

        {/* off-course redirect */}
        {offCourse ? <TurnCue dir={course.dir} o={0.55 + 0.45 * pulse} /> : null}

        {locked ? (
          <G>
            <Path d={`M${C - 46} ${C + 28} h92 v22 h-92 z`} fill="#3A2A1A" stroke={COL.bubbleBad} strokeWidth={1.5} />
            <SvgText x={C} y={C + 43} fill={COL.bubbleBad} fontSize={11} fontWeight="900" textAnchor="middle">HOLD LEVEL</SvgText>
          </G>
        ) : offCourse ? (
          <G>
            <Path d={`M${C - 62} ${C + 24} h124 v24 h-124 z`} fill="#3A2114" stroke={COL.alert} strokeWidth={1.5} />
            <SvgText x={C} y={C + 40} fill={COL.alert} fontSize={11} fontWeight="900" textAnchor="middle">
              {`TURN ${course.dir.toUpperCase()} ${course.deg}°`}
            </SvgText>
          </G>
        ) : null}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { alignItems: 'center', justifyContent: 'center' } });
