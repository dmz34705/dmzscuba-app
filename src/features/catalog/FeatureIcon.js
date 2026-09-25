import { BoyleIcon, CalculatorIcon, ColorLossIcon, CompassIcon, DiveComputerIcon, GearIcon, LensIcon, LogbookIcon } from '../../components/DiveIllustrations';
import Svg, { Circle, Path } from 'react-native-svg';

function AtlasIcon() {
  return <Svg width={40} height={40} viewBox="0 0 40 40" fill="none"><Circle cx={20} cy={20} r={16} stroke="#79DAFA" strokeWidth={1.5} /><Path d="M4 20h32M20 4c11 9 11 23 0 32C9 27 9 13 20 4ZM7 11c8 5 18 5 26 0M7 29c8-5 18-5 26 0" stroke="#79DAFA" strokeWidth={1.2} opacity={0.65} /><Circle cx={27} cy={14} r={4} fill="#97E8CC" stroke="#0B1C2E" strokeWidth={2} /></Svg>;
}

function PlannerIcon() {
  return <Svg width={40} height={40} viewBox="0 0 40 40" fill="none"><Path d="M8 11a3 3 0 0 1 3-3h18a3 3 0 0 1 3 3v19a3 3 0 0 1-3 3H11a3 3 0 0 1-3-3V11Z" stroke="#79DAFA" strokeWidth={1.5} /><Path d="M8 15h24M14 5v6M26 5v6" stroke="#79DAFA" strokeWidth={1.5} strokeLinecap="round" /><Path d="M13 25.5 24 21l-2.8 9.2-2.6-3.9L13 25.5Z" fill="#F0C84B" stroke="#0B1C2E" strokeWidth={1} strokeLinejoin="round" /></Svg>;
}

const ICONS = {
  atlas: AtlasIcon,
  boyle: BoyleIcon,
  calculator: CalculatorIcon,
  'color-loss': ColorLossIcon,
  compass: CompassIcon,
  'dive-computer': DiveComputerIcon,
  gear: GearIcon,
  lens: LensIcon,
  logbook: LogbookIcon,
  planner: PlannerIcon,
};

export default function FeatureIcon({ name }) {
  const Icon = ICONS[name] || CalculatorIcon;
  return <Icon />;
}
