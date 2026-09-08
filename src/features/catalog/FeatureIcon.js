import { BoyleIcon, CalculatorIcon, ColorLossIcon, CompassIcon, DiveComputerIcon, GearIcon, LensIcon, LogbookIcon } from '../../components/DiveIllustrations';

const ICONS = {
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
