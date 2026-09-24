import { BoyleIcon, CalculatorIcon, ColorLossIcon, CompassIcon, DiveComputerIcon, GearIcon, LensIcon, LogbookIcon } from '../../components/DiveIllustrations';
import Svg, { Circle, Path } from 'react-native-svg';

function AtlasIcon() {
  return <Svg width={40} height={40} viewBox="0 0 40 40" fill="none"><Circle cx={20} cy={20} r={16} stroke="#79DAFA" strokeWidth={1.5} /><Path d="M4 20h32M20 4c11 9 11 23 0 32C9 27 9 13 20 4ZM7 11c8 5 18 5 26 0M7 29c8-5 18-5 26 0" stroke="#79DAFA" strokeWidth={1.2} opacity={0.65} /><Circle cx={27} cy={14} r={4} fill="#97E8CC" stroke="#0B1C2E" strokeWidth={2} /></Svg>;
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
};

export default function FeatureIcon({ name }) {
  const Icon = ICONS[name] || CalculatorIcon;
  return <Icon />;
}
