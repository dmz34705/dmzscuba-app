// Line icons for itinerary types and planner actions.
import Svg, { Path } from 'react-native-svg';

import { colors } from '../../theme';

const GLYPHS = {
  flight: 'M3 13.5 21 6l-4.5 15-4.2-6.3L3 13.5Zm9.3 1.2L21 6',
  transfer: 'M5 16.5h14M6.5 16.5 8 11h8l1.5 5.5M5 16.5v2h2.5v-2m9 0v2H19v-2',
  ferry: 'M3 18c2 1.4 4 1.4 6 0s4-1.4 6 0 4 1.4 6 0M5 15l1-5h12l1 5M9.5 10V6.5h5V10',
  stay: 'M3 18V7m0 7h18v4m0-4v-1.5A2.5 2.5 0 0 0 18.5 10H11v4M7 12.5h.01',
  liveaboard: 'M3 18c2 1.4 4 1.4 6 0s4-1.4 6 0 4 1.4 6 0M4 15h16l-2 -4H6l-2 4ZM8 11V7h5l3 4',
  diving: 'M4 9h16v4.5a2.5 2.5 0 0 1-2.5 2.5H15l-3-2-3 2H6.5A2.5 2.5 0 0 1 4 13.5V9Z',
  car: 'M5 16V11.5L7 7h10l2 4.5V16M5 16h14M5 16v2h2.5v-2m9 0v2H19v-2M4 11.5h16M8 13.5h.01M16 13.5h.01',
  activity: 'M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7L12 3Z',
  other: 'M12 8v8M8 12h8',
  check: 'M5 12.5 10 17l9-10',
  import: 'M12 4v11m0 0-4-4m4 4 4-4M5 19h14',
};

export default function Glyph({ name, color = colors.cyan, size = 18 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"><Path d={GLYPHS[name] || GLYPHS.other} stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></Svg>
  );
}
