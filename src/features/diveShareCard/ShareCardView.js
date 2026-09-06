// Dispatches to the selected theme's layout component (see themes.js /
// layouts/*) — this file owns nothing about how a card looks; each layout is
// free to structure itself however that style calls for. Only the ref
// forwarding (for react-native-view-shot's captureRef), the shared data
// contract, and handing the layout its theme's gradient live here.

import { forwardRef } from 'react';

import { resolveProfileVariant } from './shareCardOptions';
import { getShareCardTheme } from './themes';

/**
 * @param {object} props
 * @param {string} props.themeKey        one of SHARE_CARD_THEMES' keys
 * @param {number} props.width           card width in points
 * @param {number} props.height          card height in points (set by the aspect preset)
 * @param {number} props.textScale       from shareCardOptions.getTextScale
 * @param {string} props.detail          'summary' | 'brief'
 * @param {Array}  props.stats           from shareCardOptions.resolveStats
 * @param {string} [props.title]         e.g. "Blue Corner"
 * @param {string} [props.subtitle]      e.g. "Aug 27, 2026 · 11:22"
 * @param {Array}  props.samples
 * @param {number} props.maxDepthMeters
 * @param {string} [props.depthTop]      depth-axis label at the surface
 * @param {string} [props.depthBottom]   depth-axis label at max depth
 * @param {boolean} [props.showDepthAxis]
 * @param {string} [props.photoUri]      absent → the theme's gradient background
 * @param {string} props.profileKey      chart style, 'auto' defers to the theme
 * @param {string} [props.watermark]     signature line; blank hides it
 */
const ShareCardView = forwardRef(function ShareCardView({ themeKey, profileKey, ...cardProps }, ref) {
  const { Layout, gradient, profileVariant } = getShareCardTheme(themeKey);
  return (
    <Layout
      ref={ref}
      gradient={gradient}
      profileVariant={resolveProfileVariant(profileKey, profileVariant)}
      {...cardProps}
    />
  );
});

export default ShareCardView;
