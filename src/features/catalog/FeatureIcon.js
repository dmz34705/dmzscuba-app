import { BoyleIcon, CalculatorIcon, ColorLossIcon, CompassIcon, DiveComputerIcon, GearIcon, LensIcon, LogbookIcon } from '../../components/DiveIllustrations';
import Svg, { Circle, Path } from 'react-native-svg';

function AtlasIcon() {
  return <Svg width={40} height={40} viewBox="0 0 40 40" fill="none"><Circle cx={20} cy={20} r={16} stroke="#79DAFA" strokeWidth={1.5} /><Path d="M4 20h32M20 4c11 9 11 23 0 32C9 27 9 13 20 4ZM7 11c8 5 18 5 26 0M7 29c8-5 18-5 26 0" stroke="#79DAFA" strokeWidth={1.2} opacity={0.65} /><Circle cx={27} cy={14} r={4} fill="#97E8CC" stroke="#0B1C2E" strokeWidth={2} /></Svg>;
}

function PlannerIcon() {
  return <Svg width={40} height={40} viewBox="0 0 40 40" fill="none"><Path d="M8 11a3 3 0 0 1 3-3h18a3 3 0 0 1 3 3v19a3 3 0 0 1-3 3H11a3 3 0 0 1-3-3V11Z" stroke="#79DAFA" strokeWidth={1.5} /><Path d="M8 15h24M14 5v6M26 5v6" stroke="#79DAFA" strokeWidth={1.5} strokeLinecap="round" /><Path d="M13 25.5 24 21l-2.8 9.2-2.6-3.9L13 25.5Z" fill="#F0C84B" stroke="#0B1C2E" strokeWidth={1} strokeLinejoin="round" /></Svg>;
}

function NitroxIcon() {
  return <Svg width={40} height={40} viewBox="0 0 40 40" fill="none"><Path d="M15 6h10M17 6v4h6V6" stroke="#79DAFA" strokeWidth={1.5} strokeLinecap="round" /><Path d="M13 16a7 7 0 0 1 14 0v16a3 3 0 0 1-3 3h-8a3 3 0 0 1-3-3V16Z" stroke="#79DAFA" strokeWidth={1.5} /><Path d="M13 20h14v4H13z" fill="#70E2A3" opacity={0.85} /><Path d="M31 13c2 2 2 6 0 8M34 10c3.5 3.5 3.5 10.5 0 14" stroke="#70E2A3" strokeWidth={1.4} strokeLinecap="round" /></Svg>;
}

const ICONS = {
  account: () => <Svg width={32} height={32} viewBox="0 0 32 32" fill="none"><Circle cx={16} cy={10} r={5} stroke="#70DDF6" strokeWidth={1.5} /><Path d="M6 27c0-6 4-10 10-10s10 4 10 10" stroke="#70DDF6" strokeWidth={1.5} strokeLinecap="round" /></Svg>,
  settings: () => <Svg width={32} height={32} viewBox="0 0 32 32" fill="none"><Path d="M5 9h22M5 23h22" stroke="#70DDF6" strokeWidth={1.5} strokeLinecap="round" /><Circle cx={12} cy={9} r={4} fill="#0B1C2E" stroke="#70DDF6" strokeWidth={1.5} /><Circle cx={21} cy={23} r={4} fill="#0B1C2E" stroke="#70DDF6" strokeWidth={1.5} /></Svg>,
  atlas: AtlasIcon,
  boyle: BoyleIcon,
  calculator: CalculatorIcon,
  'color-loss': ColorLossIcon,
  compass: CompassIcon,
  'dive-computer': DiveComputerIcon,
  gear: GearIcon,
  lens: LensIcon,
  logbook: LogbookIcon,
  nitrox: NitroxIcon,
  planner: PlannerIcon,
};

export default function FeatureIcon({ name }) {
  const Icon = ICONS[name] || CalculatorIcon;
  return <Icon />;
}
