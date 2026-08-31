import { BoyleIcon, CalculatorIcon, ColorLossIcon, DiveComputerIcon, LensIcon } from '../../components/DiveIllustrations';

const ICONS = {
  boyle: BoyleIcon,
  calculator: CalculatorIcon,
  'color-loss': ColorLossIcon,
  'dive-computer': DiveComputerIcon,
  lens: LensIcon,
};

export default function FeatureIcon({ name }) {
  const Icon = ICONS[name] || CalculatorIcon;
  return <Icon />;
}
