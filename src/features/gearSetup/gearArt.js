import { G, Path, Rect, Circle, Ellipse, Line } from 'react-native-svg';

// Vector traces of the three course-manual reference drawings the instructor
// supplied (cylinder + valve, jacket BCD front view, regulator set). Each piece
// is drawn in its own local coordinate space starting at (0,0); callers wrap it
// in <G transform="translate(..) scale(..)"> to place it in the scene.
//
// Kept faithful to the originals: the cylinder and regulator are clean line
// art, the BCD is flat colour. Strokes are dark; fills match the references
// (the line-art pieces get a light fill so they read on the dark scene).

const INK = '#12181D';

// ---------------------------------------------------------------------------
//  Cylinder + valve   — local box ~ 200 x 384, cylinder centred on x=100
// ---------------------------------------------------------------------------
export const TANK_ART = { w: 200, h: 384, cx: 100 };

export function TankArt({ open = false }) {
  return (
    <G>
      {/* cylinder body: rounded dome, near-flat base */}
      <Path
        d="M40 98 Q40 58 66 48 Q100 39 134 48 Q160 58 160 98 L160 356 Q160 366 150 366 L50 366 Q40 366 40 356 Z"
        fill="#CFD6DA"
        stroke={INK}
        strokeWidth={5}
        strokeLinejoin="round"
      />
      {/* valve body — the T / cross; its left arm is the outlet (faces the diver's back) */}
      <Path
        d="M66 44 L88 44 L88 24 Q88 17 95 17 Q102 17 102 24 L102 44 L118 44 L118 60 L66 60 Z"
        fill="#C2CACF"
        stroke={INK}
        strokeWidth={4}
        strokeLinejoin="round"
      />
      {/* outlet opening on the left face */}
      <Circle cx={67} cy={52} r={4.5} fill="#0B0E11" stroke={INK} strokeWidth={2} />
      {/* ring on top of the valve */}
      <Circle cx={95} cy={16} r={9} fill="#E8E8E8" stroke={INK} strokeWidth={4} />
      <Circle cx={95} cy={16} r={3.4} fill="none" stroke={INK} strokeWidth={2.4} />
      {/* black valve knob block — turns green when the tank is open */}
      <Rect x={116} y={40} width={40} height={22} rx={2} fill={open ? '#2FA36B' : '#151515'} stroke={INK} strokeWidth={3} />
    </G>
  );
}

// ---------------------------------------------------------------------------
//  Regulator set   — local box ~ 300 x 300, first stage around (170, 145)
// ---------------------------------------------------------------------------
export const REG_ART = {
  w: 300,
  h: 300,
  firstStage: { x: 171, y: 146 },
  primary: { x: 90, y: 162 },
  octo: { x: 114, y: 232 },
  console: { x: 234, y: 250 },
  lpiEnd: { x: 179, y: 233 },
};

function RegSwoosh({ x, y, color = INK }) {
  return <Path d={`M${x - 10} ${y + 6} C ${x - 18} ${y + 10} ${x - 18} ${y + 22} ${x - 8} ${y + 24} C ${x - 2} ${y + 25} ${x + 2} ${y + 21} ${x + 2} ${y + 16}`} fill="none" stroke={color} strokeWidth={4} strokeLinecap="round" />;
}

export function RegArt() {
  return (
    <G>
      {/* primary hose: up-left arc from the first stage */}
      <Path d="M158 126 C 138 104 112 96 100 118 C 92 132 90 150 92 158" fill="none" stroke={INK} strokeWidth={6} strokeLinecap="round" />
      {/* octo hose (yellow) */}
      <Path d="M156 166 C 134 178 118 200 116 224" fill="none" stroke="#EFC53A" strokeWidth={6} strokeLinecap="round" />
      {/* lp inflator hose stub + quick-disconnect */}
      <Path d="M172 172 C 172 196 176 214 178 226" fill="none" stroke={INK} strokeWidth={5} strokeLinecap="round" />
      <Rect x={173} y={225} width={12} height={14} rx={2} fill="#BCC4C9" stroke={INK} strokeWidth={3} />
      {/* console hose */}
      <Path d="M188 150 C 214 160 234 186 233 214" fill="none" stroke={INK} strokeWidth={5} strokeLinecap="round" />

      {/* console */}
      <Rect x={218} y={214} width={32} height={72} rx={10} fill="#F4F4F4" stroke={INK} strokeWidth={4} />
      <Circle cx={234} cy={234} r={9} fill="none" stroke={INK} strokeWidth={3} />
      <Circle cx={234} cy={262} r={9} fill="none" stroke={INK} strokeWidth={3} />

      {/* primary second stage */}
      <Circle cx={90} cy={162} r={13} fill="#F4F4F4" stroke={INK} strokeWidth={4} />
      <RegSwoosh x={90} y={162} />
      {/* octo second stage */}
      <Circle cx={114} cy={232} r={13} fill="#F4F4F4" stroke={INK} strokeWidth={4} />
      <RegSwoosh x={114} y={232} />

      {/* first stage */}
      <Rect x={156} y={120} width={30} height={52} rx={7} fill="#8A8A8A" stroke={INK} strokeWidth={4} />
      <Line x1={156} y1={133} x2={186} y2={133} stroke={INK} strokeWidth={2.5} />
      <Rect x={166} y={112} width={10} height={9} rx={1.5} fill="#8A8A8A" stroke={INK} strokeWidth={2.5} />
    </G>
  );
}

// ---------------------------------------------------------------------------
//  Jacket BCD, front view   — local box ~ 300 x 320
// ---------------------------------------------------------------------------
export const BCD_ART = {
  w: 300,
  h: 320,
  inflator: { x: 214, y: 182 },
  corrugated: { x: 214, y: 100 },
  dumpShoulder: { x: 250, y: 176 },
  chestBuckle: { x: 150, y: 142 },
  waistBuckle: { x: 150, y: 214 },
  pocketL: { x: 56, y: 224 },
  pocketR: { x: 244, y: 224 },
  dRings: { x: 78, y: 100 },
  bladder: { x: 40, y: 150 },
};

export function BcdArt() {
  const RIBS = [];
  for (let y = 66; y <= 150; y += 10) RIBS.push(y);
  return (
    <G>
      {/* grey outer shell */}
      <Path
        d="M64 24 Q40 18 38 46 L38 78 Q36 104 54 128 L64 150 Q26 168 20 214 Q16 250 44 258 Q82 270 100 240 L110 196 L190 196 L200 240 Q218 270 256 258 Q284 250 280 214 Q274 168 236 150 L246 128 Q264 104 262 78 L262 46 Q260 18 236 24 Q208 14 192 26 Q186 44 168 50 L132 50 Q114 44 108 26 Q92 14 64 24 Z"
        fill="#8C8C8C"
        stroke="#5C5C5C"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {/* weight-pocket yellow trim + seams */}
      <Path d="M18 150 Q56 138 100 156" fill="none" stroke="#F2B60C" strokeWidth={5} strokeLinecap="round" />
      <Path d="M282 150 Q244 138 200 156" fill="none" stroke="#F2B60C" strokeWidth={5} strokeLinecap="round" />
      <Path d="M30 168 Q30 224 58 250" fill="none" stroke="#6A6A6A" strokeWidth={2} />
      <Path d="M270 168 Q270 224 242 250" fill="none" stroke="#6A6A6A" strokeWidth={2} />

      {/* dark central panel + inset */}
      <Path
        d="M104 28 L196 28 Q214 32 214 56 L214 188 Q214 214 184 218 L116 218 Q86 214 86 188 L86 56 Q86 32 104 28 Z"
        fill="#2C2C2C"
      />
      <Rect x={108} y={90} width={84} height={74} rx={10} fill="none" stroke="#474747" strokeWidth={2} />

      {/* shoulder straps */}
      <Path d="M72 24 C 62 66 70 116 100 150" fill="none" stroke="#171717" strokeWidth={15} strokeLinecap="round" />
      <Path d="M228 24 C 238 66 230 116 200 150" fill="none" stroke="#171717" strokeWidth={15} strokeLinecap="round" />

      {/* corrugated inflator hose on the right shoulder */}
      <Path d="M196 58 Q196 34 214 34 Q232 34 232 58 L232 156 L196 156 Z" fill="#9E9E9E" stroke="#3A3A3A" strokeWidth={2.5} />
      {RIBS.map((y) => (
        <Line key={y} x1={196} y1={y} x2={232} y2={y} stroke="#3A3A3A" strokeWidth={2} />
      ))}
      <Rect x={214} y={30} width={18} height={10} rx={2} fill="#F2B60C" />
      {/* inflator mechanism */}
      <Path d="M190 156 L238 156 Q250 156 250 170 L250 194 Q250 206 238 206 L190 206 Q178 206 178 192 L178 170 Q178 156 190 156 Z" fill="#2C2C2C" />
      <Path d="M248 176 l18 4 -3 15 -16 -3 z" fill="#2C2C2C" stroke="#171717" strokeWidth={2} />
      <Circle cx={198} cy={168} r={4} fill="#C9D6DE" />
      <Circle cx={210} cy={168} r={3.5} fill="#7A8A94" />

      {/* chest + waist straps and buckles */}
      <Path d="M40 142 L260 142" stroke="#171717" strokeWidth={14} strokeLinecap="round" />
      <Path d="M34 214 L266 214" stroke="#171717" strokeWidth={16} strokeLinecap="round" />
      <Rect x={135} y={132} width={30} height={20} rx={3} fill="#DADADA" stroke="#8A8A8A" strokeWidth={1.5} />
      <Line x1={150} y1={133} x2={150} y2={151} stroke="#8A8A8A" strokeWidth={2} />
      <Rect x={135} y={204} width={30} height={20} rx={3} fill="#DADADA" stroke="#8A8A8A" strokeWidth={1.5} />

      {/* left strap hardware: yellow tabs, D-rings, adjuster */}
      <Rect x={58} y={30} width={20} height={11} rx={2} fill="#F2B60C" />
      <Rect x={58} y={46} width={20} height={11} rx={2} fill="#F2B60C" />
      <Ellipse cx={70} cy={74} rx={9} ry={11} fill="none" stroke="#E4E4E4" strokeWidth={4} />
      <Ellipse cx={77} cy={100} rx={9} ry={11} fill="none" stroke="#E4E4E4" strokeWidth={4} />
      <Rect x={60} y={118} width={20} height={15} rx={2} fill="#9A9A9A" />
      <Ellipse cx={97} cy={150} rx={9} ry={11} fill="none" stroke="#E4E4E4" strokeWidth={4} />
    </G>
  );
}
