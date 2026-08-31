import { BoyleIcon, CalculatorIcon, ColorLossIcon, DiveComputerIcon, LensIcon, LogbookIcon } from '../../components/DiveIllustrations';

const ICONS = {
  boyle: BoyleIcon,
  calculator: CalculatorIcon,
  'color-loss': ColorLossIcon,
  'dive-computer': DiveComputerIcon,
  lens: LensIcon,
  logbook: LogbookIcon,
};

export default function FeatureIcon({ name }) {
  const Icon = ICONS[name] || CalculatorIcon;
  return <Icon />;
}
