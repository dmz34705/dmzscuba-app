import BlueprintLayout from './layouts/BlueprintLayout';
import ClassicLayout from './layouts/ClassicLayout';
import ElegantLayout from './layouts/ElegantLayout';
import MonoLayout from './layouts/MonoLayout';
import NaturalLayout from './layouts/NaturalLayout';
import NeonLayout from './layouts/NeonLayout';
import SunsetLayout from './layouts/SunsetLayout';
import TechyLayout from './layouts/TechyLayout';

// `swatch` is the two-stop chip in the picker; `gradient` is the full
// background the card falls back to when no photo is chosen — the same palette
// carried through, so picking "Plain" still looks like the theme you selected
// rather than a generic empty card. `profileVariant` is the theme's signature
// curve, used while the chart style is left on "auto".
export const SHARE_CARD_THEMES = [
  {
    key: 'classic',
    label: 'Classic',
    swatch: ['#0A2638', '#70DDF6'],
    gradient: ['#15486B', '#0A2438', '#040D16'],
    Layout: ClassicLayout,
    profileVariant: 'line',
  },
  {
    key: 'techy',
    label: 'Techy',
    swatch: ['#020A0F', '#39FFE0'],
    gradient: ['#06323A', '#02171F', '#01080C'],
    Layout: TechyLayout,
    profileVariant: 'glow',
  },
  {
    key: 'elegant',
    label: 'Elegant',
    swatch: ['#241C14', '#F0C84B'],
    gradient: ['#4A3418', '#241A0F', '#110B06'],
    Layout: ElegantLayout,
    profileVariant: 'line',
  },
  {
    key: 'natural',
    label: 'Natural',
    swatch: ['#07211D', '#5CE0C6'],
    gradient: ['#0C5145', '#06312A', '#031310'],
    Layout: NaturalLayout,
    profileVariant: 'wave',
  },
  {
    key: 'sunset',
    label: 'Sunset',
    swatch: ['#3A1B10', '#FFB36A'],
    gradient: ['#8A4321', '#3A1B10', '#160A05'],
    Layout: SunsetLayout,
    profileVariant: 'mirror',
  },
  {
    key: 'mono',
    label: 'Mono',
    swatch: ['#111111', '#FFFFFF'],
    gradient: ['#4A4A4A', '#171717', '#050505'],
    Layout: MonoLayout,
    profileVariant: 'line',
  },
  {
    key: 'neon',
    label: 'Neon',
    swatch: ['#1A0630', '#FF4FD8'],
    gradient: ['#4A1478', '#1A0630', '#08020F'],
    Layout: NeonLayout,
    profileVariant: 'glow',
  },
  {
    key: 'blueprint',
    label: 'Blueprint',
    swatch: ['#062340', '#9FD8FF'],
    gradient: ['#0D4272', '#062340', '#02101F'],
    Layout: BlueprintLayout,
    profileVariant: 'steps',
  },
];

export const DEFAULT_SHARE_CARD_THEME = SHARE_CARD_THEMES[0].key;

export function getShareCardTheme(key) {
  return SHARE_CARD_THEMES.find((t) => t.key === key) || SHARE_CARD_THEMES[0];
}
