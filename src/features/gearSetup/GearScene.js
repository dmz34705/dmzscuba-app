import { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import Svg, {
  Circle, Defs, G, Line, LinearGradient, Path, RadialGradient, Rect, Stop, Text as SvgText,
} from 'react-native-svg';
import { PARTS } from './model';

export const VBW = 340;
export const VBH = 460;
const FLOOR = 424;
const TANK = { x: 69, w: 62, top: 162, bot: 400 };
const TANK_CX = TANK.x + TANK.w / 2; // 100

// Current on-screen position of every identifiable / draggable part. Anchors
// move once a piece is assembled onto the unit, and each one sits on the
// matching feature in the art below.
function anchors(asm) {
  const on = asm.bcdOn;
  const reg = asm.regOn;
  return {
    valve: { x: TANK_CX, y: 92 },
    handWheel: { x: 128, y: 106 },
    valveOutlet: { x: 70, y: 108 },
    oring: { x: 62, y: 122 },

    // drop zone for sliding the BCD onto the cylinder
    tank: { x: TANK_CX, y: 250 },

    // draggable-piece home positions
    bcd: { x: 242, y: 236 },
    weight: { x: 150, y: 408 },
    straps: { x: TANK_CX, y: 196 },

    bladder: on ? { x: 40, y: 248 } : { x: 296, y: 232 },
    inflator: on ? { x: 46, y: 214 } : { x: 190, y: 250 },
    corrugatedHose: on ? { x: 60, y: 184 } : { x: 210, y: 198 },
    dumpShoulder: on ? { x: 80, y: 150 } : { x: 272, y: 150 },
    dumpRear: on ? { x: 135, y: 258 } : { x: 240, y: 302 },
    camStrap: on ? { x: TANK_CX, y: 250 } : { x: 240, y: 250 },
    locatorStrap: on ? { x: TANK_CX, y: 130 } : { x: 240, y: 148 },
    weightPocket: on ? { x: 44, y: 340 } : { x: 198, y: 300 },
    trimPocket: on ? { x: 128, y: 300 } : { x: 284, y: 264 },

    firstStage: reg ? { x: TANK_CX, y: 92 } : { x: 244, y: 316 },
    primary: reg ? { x: 180, y: 210 } : { x: 300, y: 372 },
    octo: reg ? { x: 150, y: 252 } : { x: 250, y: 408 },
    hpHose: reg ? { x: 52, y: 296 } : { x: 208, y: 356 },
    lpiHose: asm.lpiOn ? { x: 50, y: 210 } : reg ? { x: 130, y: 176 } : { x: 300, y: 320 },

    spg: reg ? { x: 56, y: 350 } : { x: 196, y: 388 },
    depthGauge: reg ? { x: 56, y: 364 } : { x: 196, y: 402 },
    compass: reg ? { x: 56, y: 378 } : { x: 196, y: 416 },
  };
}

// palette
const P = {
  edge: '#0B1A24',
  aluDark: '#5C6A72',
  chromeSt: '#46555F',
  band: '#1C7A8C',
  decal: '#E8EEF1',
  bcd: '#1C6B5E',
  bcdDark: '#123F39',
  bcdEdge: '#84E3D3',
  bladderE: '#5AAFCB',
  webbing: '#0C1A24',
  hose: '#111E27',
  hoseHi: '#2A3B45',
  reg: '#20303A',
  regE: '#0A141B',
  yellow: '#EAC63C',
  yellowD: '#8A6E12',
  rubber: '#0B141B',
  needle: '#E7EEF2',
  metal: '#5C6E7B',
  good: '#70E2A3',
  goodDk: '#1C5A3E',
  gold: '#F0C84B',
};

function SceneDefs() {
  return (
    <Defs>
      <LinearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#0A2536" />
        <Stop offset="1" stopColor="#04121C" />
      </LinearGradient>
      <LinearGradient id="tankBody" x1="0" y1="0" x2="1" y2="0">
        <Stop offset="0" stopColor="#586A72" />
        <Stop offset="0.16" stopColor="#8D9CA3" />
        <Stop offset="0.4" stopColor="#D7DFE3" />
        <Stop offset="0.62" stopColor="#A9B6BC" />
        <Stop offset="1" stopColor="#525F67" />
      </LinearGradient>
      <LinearGradient id="tankShoulder" x1="0" y1="0" x2="1" y2="0">
        <Stop offset="0" stopColor="#6A7880" />
        <Stop offset="0.45" stopColor="#C3CDD2" />
        <Stop offset="1" stopColor="#5A666E" />
      </LinearGradient>
      <LinearGradient id="chrome" x1="0" y1="0" x2="1" y2="0">
        <Stop offset="0" stopColor="#E2E9EC" />
        <Stop offset="0.4" stopColor="#9DABB3" />
        <Stop offset="0.55" stopColor="#C8D2D7" />
        <Stop offset="1" stopColor="#5E6C75" />
      </LinearGradient>
      <LinearGradient id="chromeV" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#D3DCE0" />
        <Stop offset="0.5" stopColor="#93A2AA" />
        <Stop offset="1" stopColor="#5E6C75" />
      </LinearGradient>
      <LinearGradient id="bcdFill" x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor="#24806F" />
        <Stop offset="1" stopColor="#123F39" />
      </LinearGradient>
      <LinearGradient id="bladderFill" x1="0" y1="0" x2="1" y2="0">
        <Stop offset="0" stopColor="#3A93B6" />
        <Stop offset="1" stopColor="#1C5A76" />
      </LinearGradient>
      <RadialGradient id="purge" cx="38%" cy="32%" r="72%">
        <Stop offset="0" stopColor="#54646E" />
        <Stop offset="1" stopColor="#131D24" />
      </RadialGradient>
      <RadialGradient id="purgeY" cx="38%" cy="32%" r="72%">
        <Stop offset="0" stopColor="#F5DC72" />
        <Stop offset="1" stopColor="#B99B24" />
      </RadialGradient>
    </Defs>
  );
}

function Hotspot({ x, y, n, done }) {
  return (
    <G>
      <Circle cx={x} cy={y} r={14} fill={done ? '#123B2C' : '#0B2C3Ecc'} stroke={done ? '#70E2A3' : '#F0C84B'} strokeWidth={2} />
      <SvgText x={x} y={y + 4} textAnchor="middle" fontSize={11} fontWeight="bold" fill={done ? '#70E2A3' : '#F0C84B'}>{done ? '✓' : n}</SvgText>
    </G>
  );
}

// ---------------------------------------------------------------------------
//  Cylinder + valve
// ---------------------------------------------------------------------------
function Tank() {
  const { x, w, top, bot } = TANK;
  return (
    <G>
      {/* boot */}
      <Path
        d={`M${x - 4} ${bot - 10} q-5 2 -5 13 l0 15 q0 7 7 7 l${w + 4} 0 q7 0 7 -7 l0 -15 q0 -11 -5 -13 z`}
        fill="#12202A"
        stroke={P.edge}
        strokeWidth={1.5}
      />
      <Path d={`M${x + 8} ${bot + 2} l0 22 M${TANK_CX} ${bot + 2} l0 22 M${x + w - 8} ${bot + 2} l0 22`} stroke="#0A151D" strokeWidth={2} />
      {/* body */}
      <Path
        d={`M${x} ${top + 6} q0 -6 6 -6 l${w - 12} 0 q6 0 6 6 l0 ${bot - top - 2} q0 8 -8 8 l${-(w - 16)} 0 q-8 0 -8 -8 z`}
        fill="url(#tankBody)"
        stroke={P.aluDark}
        strokeWidth={1.5}
      />
      {/* shoulder dome */}
      <Path
        d={`M${x} ${top + 16} C ${x} ${top - 28} ${x + 13} ${top - 42} ${TANK_CX} ${top - 42} C ${x + w - 13} ${top - 42} ${x + w} ${top - 28} ${x + w} ${top + 16} Z`}
        fill="url(#tankShoulder)"
        stroke={P.aluDark}
        strokeWidth={1.5}
      />
      {/* specular highlight */}
      <Rect x={x + 10} y={top + 18} width={5} height={bot - top - 44} rx={2.5} fill="#FFFFFF" opacity={0.32} />
      <Rect x={x + 10} y={top - 26} width={5} height={40} rx={2.5} fill="#FFFFFF" opacity={0.22} />
      {/* shoulder id band */}
      <Path d={`M${x} ${top - 8} q${w / 2} 11 ${w} 0 l0 13 q${-(w / 2)} 11 ${-w} 0 z`} fill={P.band} opacity={0.92} />
      {/* viz / hydro decal */}
      <Rect x={TANK_CX - 17} y={top + 42} width={34} height={28} rx={3} fill={P.decal} opacity={0.92} />
      <Path
        d={`M${TANK_CX - 11} ${top + 51} l22 0 M${TANK_CX - 11} ${top + 56} l22 0 M${TANK_CX - 11} ${top + 61} l15 0`}
        stroke="#7C8B94"
        strokeWidth={2}
        strokeLinecap="round"
      />
      {/* neck */}
      <Rect x={TANK_CX - 11} y={top - 56} width={22} height={18} rx={2} fill="url(#chromeV)" stroke={P.chromeSt} strokeWidth={1.2} />
    </G>
  );
}

function Valve({ open }) {
  const y = 104;
  const wheelFill = open ? P.goodDk : 'url(#chrome)';
  const wheelStroke = open ? P.good : P.chromeSt;
  const spoke = open ? P.good : P.needle;
  return (
    <G>
      {/* outlet spud (faces screen-left = the diver's back) */}
      <Rect x={62} y={y - 6} width={24} height={14} rx={2} fill="url(#chrome)" stroke={P.chromeSt} strokeWidth={1.2} />
      <Circle cx={63} cy={y + 1} r={7} fill="#0A1620" stroke={P.chromeSt} strokeWidth={1.4} />
      {/* o-ring seated in the outlet face */}
      <Circle cx={63} cy={y + 1} r={4.8} fill="none" stroke="#0C1116" strokeWidth={3.2} />
      <Circle cx={63} cy={y + 1} r={4.8} fill="none" stroke="#465059" strokeWidth={1} />
      {/* valve body + bonnet */}
      <Rect x={83} y={y - 13} width={32} height={26} rx={5} fill="url(#chrome)" stroke={P.chromeSt} strokeWidth={1.5} />
      <Rect x={92} y={y - 21} width={16} height={10} rx={2} fill="url(#chromeV)" stroke={P.chromeSt} strokeWidth={1.2} />
      {/* burst-disc plug */}
      <Circle cx={99} cy={y + 10} r={3} fill="#2A343D" stroke={P.chromeSt} strokeWidth={1} />
      {/* hand wheel */}
      <Rect x={113} y={y - 4} width={11} height={9} fill="url(#chrome)" stroke={P.chromeSt} strokeWidth={1} />
      <Circle cx={129} cy={y + 1} r={10} fill={wheelFill} stroke={wheelStroke} strokeWidth={2.6} />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
        const rad = (a * Math.PI) / 180;
        return (
          <Line
            key={a}
            x1={129 + Math.cos(rad) * 6.5}
            y1={y + 1 + Math.sin(rad) * 6.5}
            x2={129 + Math.cos(rad) * 10}
            y2={y + 1 + Math.sin(rad) * 10}
            stroke={spoke}
            strokeWidth={2}
          />
        );
      })}
      <Circle cx={129} cy={y + 1} r={3} fill={spoke} />
    </G>
  );
}

// ---------------------------------------------------------------------------
//  BCD shared parts
// ---------------------------------------------------------------------------
function Corrugated({ d }) {
  return (
    <G>
      <Path d={d} fill="none" stroke={P.webbing} strokeWidth={9} strokeLinecap="round" />
      <Path d={d} fill="none" stroke="#21343E" strokeWidth={8} strokeLinecap="round" strokeDasharray="1.4 3.4" />
    </G>
  );
}

function InflatorHead({ x, y }) {
  return (
    <G>
      {/* elbow off the corrugated hose */}
      <Path d={`M${x - 2} ${y - 12} q-9 2 -9 12 l0 8 q0 7 7 7 l10 0 q6 0 6 -6 l0 -16 q0 -6 -6 -7 z`} fill="#28373F" stroke={P.edge} strokeWidth={1.4} />
      {/* buttons */}
      <Circle cx={x + 3} cy={y - 2} r={3.2} fill="#C9D6DE" />
      <Circle cx={x - 4} cy={y + 6} r={2.4} fill="#6E7F8B" />
      {/* oral mouthpiece */}
      <Path d={`M${x - 4} ${y + 15} q-2 7 3 10 l5 0 q4 -3 3 -10 z`} fill={P.rubber} stroke={P.edge} strokeWidth={1} />
    </G>
  );
}

function DumpValve({ x, y, r = 6 }) {
  return (
    <G>
      <Circle cx={x} cy={y} r={r} fill="#93A4B0" stroke={P.edge} strokeWidth={1.5} />
      <Circle cx={x} cy={y} r={r - 2.4} fill="none" stroke="#4A5A64" strokeWidth={1} />
      <Line x1={x} y1={y + r} x2={x} y2={y + r + 4} stroke="#0A151D" strokeWidth={1.6} />
      <Circle cx={x} cy={y + r + 6} r={2.4} fill={P.gold} />
    </G>
  );
}

function Pocket({ x, y, big }) {
  const w = big ? 30 : 19;
  const h = big ? 27 : 18;
  return (
    <G>
      <Path
        d={`M${x - w / 2} ${y - h / 2} q-2 -3 1 -4 l${w - 2} 0 q3 1 1 4 l${-w * 0.12} ${h} q-1 3 -4 3 l${-(w * 0.76)} 0 q-3 0 -4 -3 z`}
        fill="#17453D"
        stroke={P.bcdEdge}
        strokeWidth={1.4}
      />
      {big ? <Rect x={x - 8} y={y - h / 2 - 5} width={16} height={7} rx={2} fill={P.gold} /> : null}
    </G>
  );
}

// Jacket BCD seen from behind (traced from the course manual reference):
//   padded panel + hard backplate, two kidney-shaped air-cell lobes bulging
//   from the sides, a harness up over the shoulders, waist cummerbund, and the
//   corrugated inflator over the left shoulder.
function BcdRig({ mounted, weights = 0 }) {
  const cx = mounted ? TANK_CX : 242;
  const top = mounted ? 164 : 150;         // panel top
  const cumY = mounted ? 300 : 298;        // cummerbund top / panel bottom
  const halfW = 28;
  const pL = cx - halfW;
  const pR = cx + halfW;
  const midY = (top + cumY) / 2;
  const loEdgeL = mounted ? 24 : 176;      // outer edge of the left lobe
  const loEdgeR = mounted ? 176 : 308;
  const strap = '#2E4A44';

  const lobe = (edge, inner) => `M${inner} ${top + 22} C ${inner + (edge - inner) * 0.5} ${top + 8} ${edge} ${top + 26} ${edge} ${midY} C ${edge} ${cumY - 14} ${inner + (edge - inner) * 0.5} ${cumY + 8} ${inner} ${cumY - 6} Z`;

  return (
    <G>
      {/* air-cell lobes */}
      <Path d={lobe(loEdgeL, pL + 6)} fill="url(#bladderFill)" stroke={P.bladderE} strokeWidth={1.4} />
      <Path d={lobe(loEdgeR, pR - 6)} fill="url(#bladderFill)" stroke={P.bladderE} strokeWidth={1.4} />
      {/* lobe baffle seams */}
      <Path d={`M${pL - 2} ${top + 34} q${(loEdgeL - pL) * 0.7} 6 ${(loEdgeL - pL) * 0.7} 40`} fill="none" stroke={P.bladderE} strokeWidth={1} opacity={0.5} />
      <Path d={`M${pR + 2} ${top + 34} q${(loEdgeR - pR) * 0.7} 6 ${(loEdgeR - pR) * 0.7} 40`} fill="none" stroke={P.bladderE} strokeWidth={1} opacity={0.5} />

      {/* padded panel + hard backplate */}
      <Path d={`M${pL} ${top + 12} q0 -12 12 -12 l${halfW * 2 - 24} 0 q12 0 12 12 l0 ${cumY - top - 4} q0 8 -8 8 l${-(halfW * 2 - 16)} 0 q-8 0 -8 -8 z`} fill="url(#bcdFill)" stroke={P.bcdEdge} strokeWidth={1.6} />
      <Rect x={cx - 15} y={top + 16} width={30} height={cumY - top - 30} rx={6} fill="#0A1B22" opacity={0.85} />
      <Rect x={cx - 15} y={top + 16} width={30} height={cumY - top - 30} rx={6} fill="none" stroke={P.bcdEdge} strokeWidth={1} opacity={0.5} />

      {/* shoulder straps up and over, with adjuster hardware */}
      {[-1, 1].map((s) => (
        <G key={s}>
          <Path
            d={`M${cx + s * 14} ${top + 8} C ${cx + s * 15} ${top - 18} ${cx + s * 22} ${top - 40} ${cx + s * 16} ${top - 56} C ${cx + s * 12} ${top - 64} ${cx + s * 6} ${top - 58} ${cx + s * 9} ${top - 48}`}
            fill="none"
            stroke={strap}
            strokeWidth={12}
            strokeLinecap="round"
          />
          <Rect x={cx + s * 14 - 7} y={top + 30} width={14} height={10} rx={2} fill="#33454F" />
          <Circle cx={cx + s * 13} cy={top + 50} r={4.5} fill="none" stroke="#93A4B0" strokeWidth={2} />
        </G>
      ))}
      {/* sternum strap */}
      <Path d={`M${cx - 15} ${top + 20} l30 0`} stroke={P.webbing} strokeWidth={5} strokeLinecap="round" />
      <Rect x={cx - 4} y={top + 15} width={8} height={10} rx={2} fill="#3B4C57" />

      {/* tank locator strap loop over the valve / channel */}
      <Path d={`M${cx - 9} ${top - 2} q0 -18 9 -22 q9 4 9 22`} fill="none" stroke={P.webbing} strokeWidth={6} strokeLinecap="round" />

      {/* cam / tank band + metal cam buckle (buckle to the side so it clears the tank) */}
      <Rect x={pL - 12} y={242} width={halfW * 2 + 24} height={15} rx={3} fill={P.webbing} stroke={P.bcdEdge} strokeWidth={1} />
      <Rect x={pL - 14} y={238} width={16} height={23} rx={2} fill="url(#chrome)" stroke={P.chromeSt} strokeWidth={1} />

      {/* cummerbund + fastex buckle */}
      <Rect x={pL - 16} y={cumY} width={halfW * 2 + 32} height={19} rx={4} fill={P.bcdDark} stroke={P.bcdEdge} strokeWidth={1} />
      <Path d={`M${cx - 9} ${cumY - 1} l9 0 0 21 -9 0 q-4 -10 0 -21 z M${cx + 9} ${cumY - 1} l-9 0 0 21 9 0 q4 -10 0 -21 z`} fill="#43535E" />

      {/* corrugated inflator over the left shoulder */}
      <Corrugated d={`M${cx - 14} ${top - 34} C ${cx - 40} ${top - 12} ${cx - 52} ${top + 6} ${cx - 54} ${top + 30}`} />
      <InflatorHead x={cx - 54} y={top + 44} />

      {/* overpressure / shoulder dump (top-left) + rear kidney dump */}
      <DumpValve x={cx - 22} y={top - 8} />
      <DumpValve x={cx + 22} y={cumY - 44} />

      {/* trim pockets by the cam band */}
      <Pocket x={cx + 40} y={228} />
      <Pocket x={cx - 40} y={228} />

      {/* removable weight pockets on the front sides (peeking round the waist) */}
      <Pocket x={pL - 8} y={cumY + 12} big />
      <Pocket x={pR + 8} y={cumY + 12} big />
      {mounted && weights >= 1 ? <Rect x={pL - 19} y={cumY + 2} width={20} height={22} rx={4} fill="#4A5A64" stroke="#93A4B0" strokeWidth={1.5} /> : null}
      {mounted && weights >= 2 ? <Rect x={pR - 1} y={cumY + 2} width={20} height={22} rx={4} fill="#4A5A64" stroke="#93A4B0" strokeWidth={1.5} /> : null}
    </G>
  );
}

// ---------------------------------------------------------------------------
//  Regulator shared parts
// ---------------------------------------------------------------------------
function FirstStage({ x, y, attached }) {
  return (
    <G>
      {/* turret body */}
      <Rect x={x - 13} y={y - 11} width={26} height={22} rx={7} fill="url(#chrome)" stroke={P.chromeSt} strokeWidth={1.6} />
      <Circle cx={x} cy={y} r={5.5} fill="#39474F" stroke={P.chromeSt} strokeWidth={1} />
      {/* port hex nubs around the base */}
      <Rect x={x - 17} y={y + 2} width={7} height={7} rx={1.5} fill={P.metal} />
      <Rect x={x + 10} y={y + 2} width={7} height={7} rx={1.5} fill={P.metal} />
      <Rect x={x - 4} y={y + 10} width={8} height={7} rx={1.5} fill={P.metal} />
      {attached ? (
        <G>
          {/* yoke clamp reaching over the valve, knob to the rear */}
          <Path d={`M${x - 10} ${y - 10} q-6 -12 4 -20 l12 0 q10 8 4 20`} fill="none" stroke="#7C8B94" strokeWidth={4} />
          <Circle cx={x} cy={y - 24} r={6} fill="url(#chrome)" stroke={P.chromeSt} strokeWidth={1.4} />
        </G>
      ) : (
        <G>
          <Circle cx={x + 22} cy={y - 2} r={7.5} fill="url(#chrome)" stroke={P.chromeSt} strokeWidth={1.5} />
          {[0, 72, 144, 216, 288].map((a) => {
            const rad = (a * Math.PI) / 180;
            return <Line key={a} x1={x + 22} y1={y - 2} x2={x + 22 + Math.cos(rad) * 7.5} y2={y - 2 + Math.sin(rad) * 7.5} stroke={P.chromeSt} strokeWidth={1.4} />;
          })}
          <Path d={`M${x + 12} ${y - 4} l6 -1`} stroke="#7C8B94" strokeWidth={3.5} />
        </G>
      )}
    </G>
  );
}

function SecondStage({ x, y, yellow, ang = 0 }) {
  const body = yellow ? P.yellow : P.reg;
  const bodyE = yellow ? P.yellowD : P.regE;
  const purge = yellow ? 'url(#purgeY)' : 'url(#purge)';
  const hub = yellow ? '#7A6410' : '#0C161D';
  return (
    <G rotation={ang} originX={x} originY={y}>
      {/* hose fitting stub */}
      <Rect x={x - 21} y={y - 5} width={9} height={9} rx={2} fill={P.metal} stroke={bodyE} strokeWidth={1} />
      {/* front housing */}
      <Rect x={x - 14} y={y - 14} width={28} height={26} rx={10} fill={body} stroke={bodyE} strokeWidth={1.7} />
      {/* purge cover with brand ring */}
      <Circle cx={x} cy={y - 1} r={11} fill={purge} stroke={bodyE} strokeWidth={1.5} />
      <Circle cx={x} cy={y - 1} r={7} fill="none" stroke={yellow ? '#C9A828' : '#3C4C56'} strokeWidth={1.4} />
      <Circle cx={x} cy={y - 1} r={3} fill={hub} />
      {/* mouthpiece + exhaust tee */}
      <Path d={`M${x - 7} ${y + 12} q-1 8 7 10 q8 -2 7 -10 z`} fill={P.rubber} stroke={bodyE} strokeWidth={1} />
      <Path d={`M${x - 7} ${y + 13} l14 0 -3 7 -8 0 z`} fill="#0A1218" />
    </G>
  );
}

function Gauge({ x, y, kind, r = 7 }) {
  return (
    <G>
      <Circle cx={x} cy={y} r={r + 1.5} fill={P.rubber} />
      <Circle cx={x} cy={y} r={r} fill="#16242E" stroke={P.chromeSt} strokeWidth={1.2} />
      <Circle cx={x} cy={y} r={r - 2} fill="#0B2230" />
      {kind === 'spg' ? (
        <G>
          <Path d={`M${x - r + 2} ${y + 1} a${r - 3} ${r - 3} 0 0 1 ${2 * (r - 3)} 0`} fill="none" stroke="#70E2A3" strokeWidth={1.3} />
          <Line x1={x} y1={y} x2={x - 2.5} y2={y - 3.5} stroke="#FF7F7F" strokeWidth={1.5} />
        </G>
      ) : null}
      {kind === 'depth' ? <Line x1={x} y1={y} x2={x + 3.5} y2={y + 1.5} stroke={P.needle} strokeWidth={1.5} /> : null}
      {kind === 'compass' ? (
        <G>
          <Line x1={x} y1={y - 4} x2={x} y2={y + 4} stroke="#FF7F7F" strokeWidth={1.5} />
          <Circle cx={x} cy={y} r={1.4} fill={P.needle} />
        </G>
      ) : null}
    </G>
  );
}

// Three-gauge console in a rubber boot, gauges stacked so each is easy to label.
function Console({ x, y }) {
  return (
    <G>
      <Path d={`M${x - 12} ${y - 22} q0 -8 8 -8 l8 0 q8 0 8 8 l0 44 q0 8 -8 8 l-8 0 q-8 0 -8 -8 z`} fill="#101E28" stroke={P.chromeSt} strokeWidth={1.4} />
      <Gauge x={x} y={y - 16} kind="spg" />
      <Gauge x={x} y={y} kind="depth" />
      <Gauge x={x} y={y + 16} kind="compass" />
    </G>
  );
}

// Loose regulator, laid out in the clear zone to the right of the rigged tank.
function LooseReg() {
  return (
    <G>
      {/* hp hose: first stage down to the console */}
      <Path d="M232 320 C 214 338 202 360 198 380" fill="none" stroke={P.hose} strokeWidth={4} strokeLinecap="round" />
      {/* lp hose to the primary */}
      <Path d="M256 320 C 284 332 300 348 300 360" fill="none" stroke={P.hose} strokeWidth={5} strokeLinecap="round" />
      <Path d="M256 320 C 284 332 300 348 300 360" fill="none" stroke={P.hoseHi} strokeWidth={1.6} strokeLinecap="round" />
      {/* lp hose (yellow) to the octo */}
      <Path d="M246 328 C 244 356 250 386 256 398" fill="none" stroke={P.yellow} strokeWidth={5} strokeLinecap="round" />
      {/* lp inflator hose stub with quick-disconnect collar */}
      <Path d="M258 310 C 282 303 296 310 300 318" fill="none" stroke={P.hose} strokeWidth={4} strokeLinecap="round" />
      <Circle cx={300} cy={319} r={4} fill={P.metal} stroke={P.edge} strokeWidth={1} />
      <Console x={192} y={398} />
      <FirstStage x={244} y={316} />
      <SecondStage x={300} y={372} ang={12} />
      <SecondStage x={258} y={406} yellow ang={-8} />
    </G>
  );
}

function AttachedReg({ asm }) {
  return (
    <G>
      <FirstStage x={TANK_CX} y={96} attached />
      {/* primary hose: over the right shoulder to a reg at chest height */}
      <Path d="M111 96 C 150 80 190 132 180 202" fill="none" stroke={P.hose} strokeWidth={4.5} strokeLinecap="round" />
      <Path d="M111 96 C 150 80 190 132 180 202" fill="none" stroke={P.hoseHi} strokeWidth={1.5} strokeLinecap="round" />
      <SecondStage x={182} y={210} ang={16} />
      {/* octo: shorter, hangs in the chest triangle */}
      <Path d="M108 106 C 138 150 150 210 142 244" fill="none" stroke={P.yellow} strokeWidth={4.5} strokeLinecap="round" />
      <SecondStage x={142} y={250} yellow ang={-8} />
      {/* hp hose hugging the left side down to the console */}
      <Path d="M89 100 C 60 138 50 258 56 334" fill="none" stroke={P.hose} strokeWidth={4} strokeLinecap="round" />
      <Console x={56} y={362} />
      {/* lp inflator hose */}
      {asm.lpiOn ? (
        <Path d="M90 104 C 62 140 50 186 50 208" fill="none" stroke={P.hose} strokeWidth={3.5} strokeLinecap="round" />
      ) : (
        <Path d="M92 106 C 108 140 120 164 130 176" fill="none" stroke={P.hose} strokeWidth={3.5} strokeLinecap="round" strokeDasharray="5 4" />
      )}
    </G>
  );
}

// ---------------------------------------------------------------------------
//  Drag ghost
// ---------------------------------------------------------------------------
function DragGhost({ piece, pos, snapping }) {
  const stroke = snapping ? '#70E2A3' : '#F0C84B';
  if (piece === 'bcd') {
    return (
      <G opacity={0.9}>
        <Rect x={pos.x - 26} y={pos.y - 60} width={52} height={128} rx={10} fill="url(#bcdFill)" stroke={stroke} strokeWidth={2.5} />
        <Path d={`M${pos.x - 12} ${pos.y - 58} C ${pos.x - 30} ${pos.y - 90} ${pos.x - 26} ${pos.y - 108} ${pos.x - 14} ${pos.y - 112}`} fill="none" stroke={stroke} strokeWidth={9} strokeLinecap="round" />
        <Path d={`M${pos.x + 12} ${pos.y - 58} C ${pos.x + 30} ${pos.y - 90} ${pos.x + 26} ${pos.y - 108} ${pos.x + 14} ${pos.y - 112}`} fill="none" stroke={stroke} strokeWidth={9} strokeLinecap="round" />
      </G>
    );
  }
  if (piece === 'firstStage') {
    return (
      <G opacity={0.95}>
        <Rect x={pos.x - 13} y={pos.y - 11} width={26} height={22} rx={7} fill="url(#chrome)" stroke={stroke} strokeWidth={2.5} />
        <Circle cx={pos.x} cy={pos.y} r={5.5} fill="#39474F" />
      </G>
    );
  }
  if (piece === 'lpiHose') {
    return (
      <G opacity={0.95}>
        <Circle cx={pos.x} cy={pos.y} r={6} fill={P.metal} stroke={stroke} strokeWidth={2.5} />
      </G>
    );
  }
  if (piece === 'weight') {
    return <Rect x={pos.x - 13} y={pos.y - 12} width={26} height={24} rx={5} fill="#4A5A64" stroke={stroke} strokeWidth={2.5} />;
  }
  return null;
}

const DIST = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export default function GearScene({ width, height, step, asm, choices, identified, onIdentify, onAssemble }) {
  const [t, setT] = useState(0);
  const [drag, setDrag] = useState(null); // { piece, pos:{x,y} }
  const gesture = useRef(null); // { kind, startVb, pieceId }

  useEffect(() => {
    let active = AppState.currentState === 'active';
    const sub = AppState.addEventListener('change', (s) => { active = s === 'active'; });
    const id = setInterval(() => { if (active) setT((v) => v + 1); }, 90);
    return () => { clearInterval(id); sub.remove(); };
  }, []);

  const A = anchors(asm);
  const scale = Math.min(width / VBW, height / VBH);
  const ox = (width - VBW * scale) / 2;
  const oy = (height - VBH * scale) / 2;
  const toVb = (e) => ({ x: (e.nativeEvent.locationX - ox) / scale, y: (e.nativeEvent.locationY - oy) / scale });

  const drag_ = step?.kind === 'assemble' && !step.drag.tap ? step.drag : null;
  const dragPieceId = drag_?.piece;
  const target = drag_
    ? (drag_.piece === 'weight' ? { x: (asm.weights || 0) === 0 ? 44 : 156, y: 340 } : A[drag_.target])
    : null;
  const snapping = drag && target && DIST(drag.pos, target) < 42;

  // identify hotspots, with labels pushed apart so they never overlap
  let hotspots = [];
  if (step?.kind === 'identify') {
    hotspots = step.identify.map((id, i) => ({ id, i, ...A[id], done: identified.has(id), side: A[id].x < VBW / 2 ? 'l' : 'r', labelY: A[id].y }));
    ['l', 'r'].forEach((s) => {
      const g = hotspots.filter((h) => h.side === s).sort((a, b) => a.labelY - b.labelY);
      for (let i = 1; i < g.length; i += 1) {
        if (g[i].labelY - g[i - 1].labelY < 14) g[i].labelY = g[i - 1].labelY + 14;
      }
    });
  }

  const handleGrant = (e) => {
    const p = toVb(e);
    if (dragPieceId) {
      const home = A[dragPieceId];
      if (DIST(p, home) < 48) { gesture.current = { kind: 'drag' }; setDrag({ piece: dragPieceId, pos: home }); return; }
    }
    const hit = hotspots.find((h) => DIST(p, h) < 28);
    if (hit) { gesture.current = { kind: 'tap', id: hit.id }; return; }
    if (step?.kind === 'assemble' && step.drag.tap) {
      const zone = A[step.drag.target];
      if (zone && DIST(p, zone) < 34) { gesture.current = { kind: 'assembleTap' }; return; }
    }
    gesture.current = null;
  };
  const handleMove = (e) => {
    if (gesture.current?.kind !== 'drag') return;
    const pos = toVb(e); // read synchronously — the synthetic event is nulled before the updater runs
    setDrag((d) => (d ? { ...d, pos } : d));
  };
  const handleRelease = (e) => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    if (g.kind === 'tap') { onIdentify(g.id); return; }
    if (g.kind === 'assembleTap') { onAssemble(step.drag.milestone, true); return; }
    if (g.kind === 'drag') {
      const p = toVb(e);
      if (target && DIST(p, target) < 42) {
        if (drag_.need != null) onAssemble(drag_.milestone, Math.min((asm[drag_.milestone] || 0) + 1, drag_.need));
        else onAssemble(drag_.milestone, true);
      }
      setDrag(null);
    }
  };

  const showLooseBcd = step && step.section >= 2 && !asm.bcdOn;
  const showLooseReg = step && step.section >= 4 && !asm.regOn;
  const pulse = 0.4 + 0.35 * Math.sin(t * 0.5);

  return (
    <View
      style={[styles.scene, { width, height }]}
      onStartShouldSetResponder={() => true}
      onResponderGrant={handleGrant}
      onResponderMove={handleMove}
      onResponderRelease={handleRelease}
      onResponderTerminate={handleRelease}
      onResponderTerminationRequest={() => false}
    >
      <Svg pointerEvents="none" width="100%" height="100%" viewBox={`0 0 ${VBW} ${VBH}`}>
        <SceneDefs />
        <Rect width={VBW} height={VBH} fill="url(#bg)" />
        <Line x1={0} y1={FLOOR} x2={VBW} y2={FLOOR} stroke="#15303F" strokeWidth={2} />

        {asm.bcdOn ? <BcdRig mounted weights={asm.weights || 0} /> : null}
        <Tank />
        <Valve open={asm.tankOn} />
        {asm.regOn ? <AttachedReg asm={asm} /> : null}
        {showLooseBcd ? <BcdRig /> : null}
        {showLooseReg ? <LooseReg /> : null}

        {/* remaining loose weights */}
        {step?.section === 5 && (asm.weights || 0) < 2
          ? [0, 1].slice(0, 2 - (asm.weights || 0)).map((k) => (
            <Rect key={k} x={150 + k * 34 - 13} y={396} width={26} height={24} rx={5} fill="#4A5A64" stroke="#93A4B0" strokeWidth={1.5} />
          ))
          : null}

        {/* drag target zone */}
        {drag_ && target ? (
          <Circle cx={target.x} cy={target.y} r={26} fill="none" stroke={snapping ? '#70E2A3' : '#F0C84B'} strokeWidth={2} strokeDasharray="5 5" opacity={0.5 + 0.4 * Math.sin(t * 0.5)} />
        ) : null}
        {step?.kind === 'assemble' && step.drag.tap && A[step.drag.target] && !asm[step.drag.milestone] ? (
          <Circle cx={A[step.drag.target].x} cy={A[step.drag.target].y} r={22} fill="none" stroke="#F0C84B" strokeWidth={2} strokeDasharray="4 4" opacity={0.4 + 0.4 * Math.sin(t * 0.5)} />
        ) : null}

        {drag ? <DragGhost piece={drag.piece} pos={drag.pos} snapping={snapping} /> : null}

        {/* identify hotspots + labels */}
        {hotspots.map((h) => {
          const edgeX = h.side === 'l' ? 18 : VBW - 18;
          return (
            <G key={h.id} opacity={h.done ? 0.92 : 0.6 + 0.4 * Math.sin(t * 0.5 + h.i)}>
              <Path d={`M${h.x} ${h.y} L ${h.side === 'l' ? h.x - 12 : h.x + 12} ${h.labelY} L ${edgeX} ${h.labelY}`} fill="none" stroke={h.done ? '#70E2A3' : '#F0C84B'} strokeWidth={1} opacity={0.45} />
              <Hotspot x={h.x} y={h.y} n={h.i + 1} done={h.done} />
              <SvgText x={edgeX} y={h.labelY - 4} textAnchor={h.side === 'l' ? 'start' : 'end'} fontSize={9} fontWeight="bold" fill={h.done ? '#70E2A3' : '#CFE6F0'}>
                {PARTS[h.id].name}
              </SvgText>
            </G>
          );
        })}

        {/* orientation cue */}
        {step?.id === 'mountOrient' ? (
          <G opacity={pulse + 0.3}>
            <SvgText x={TANK_CX} y={70} textAnchor="middle" fontSize={9} fill="#CFE6F0">↑ back of your head</SvgText>
            <Path d={`M${TANK.x - 8} 104 q-14 -20 -6 -34`} stroke={choices.orientation === 'front' ? '#FF7F7F' : '#70E2A3'} strokeWidth={2.5} fill="none" />
          </G>
        ) : null}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({ scene: { overflow: 'hidden', backgroundColor: '#04121C' } });
