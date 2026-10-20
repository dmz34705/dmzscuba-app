// One dive photo, cropped, with the dive's raw elements laid over it: a small
// depth profile with a pin at the moment the photo was taken (one bottom
// corner), the info the user picked (the other bottom corner), and their
// signature (small, bottom middle).
//
// Deliberately nothing else. Unlike the share card's layouts there is no
// scrim, gradient, grid, or border — only the elements themselves, styled by
// the theme (overlayThemes.js). The one concession to legibility is an
// optional soft shadow under the elements, which the user can switch off.
//
// Everything is sized from the frame's own width, so the small on-screen
// preview and the 1080px off-screen export copy are the same picture.

import { forwardRef, useMemo, useState } from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { buildLogProfileGeometry } from '../../lib/diveLog/profileChart';
import ProfileCurve from '../diveShareCard/layouts/ProfileCurve';
import { resolveProfileVariant } from '../diveShareCard/shareCardOptions';
import { getShareCardTheme } from '../diveShareCard/themes';
import { getOverlayTheme } from './overlayThemes';
import {
  cropLayout,
  getOverlayTextScale,
  getProfileSize,
  getSignatureSize,
  signatureBounds,
  signatureSlot,
  signaturePath,
} from './photoOverlayOptions';

const SCRIPT_FONT = Platform.select({ ios: 'SnellRoundhand-Bold', android: 'cursive', default: 'cursive' });

function shadowFor(theme, enabled, k) {
  if (!enabled) return { text: null, view: null };
  if (theme.glow) {
    return {
      text: { textShadowColor: theme.glow, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8 * k },
      view: { shadowColor: theme.glow, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 4 * k },
    };
  }
  return {
    text: { textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 * k }, textShadowRadius: 4 * k },
    view: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 * k }, shadowOpacity: 0.55, shadowRadius: 3 * k },
  };
}

// The photo pin: a round head on a short stem whose tip sits exactly on the
// profile line at the photo's moment.
function PinMark({ x, y, r, color, core }) {
  const headY = y - r * 2.3;
  // Tangent points of the stem on the head, so the outline is one clean shape.
  const spread = r * 0.78;
  const shoulderY = headY + r * 0.62;
  const stem = `M ${x - spread} ${shoulderY} L ${x} ${y} L ${x + spread} ${shoulderY} Z`;
  return (
    <>
      <Path d={stem} fill={color} />
      <Circle cx={x} cy={headY} fill={color} r={r} />
      <Circle cx={x} cy={headY} fill={core} r={r * 0.42} />
    </>
  );
}

function MiniProfile({ samples, maxDepthMeters, width, height, variant, theme, pin, shadowStyle, strokeWidth }) {
  const pinRadius = Math.max(3, width * 0.042);
  const headroom = pinRadius * 3.4;
  const marker = useMemo(() => {
    if (!pin) return null;
    const geometry = buildLogProfileGeometry(samples, width, height, {
      maxDepthMeters,
      markers: [{ id: 'photo', t: pin.seconds }],
    });
    return geometry.markers[0] || null;
  }, [samples, width, height, maxDepthMeters, pin]);

  return (
    <View style={[{ height: height + headroom, width }, shadowStyle]}>
      <View style={{ marginTop: headroom }}>
        {/* fillOpacity 0: the card's gradient wash under the line is a
            backdrop, and the overlay has none — just the line itself. */}
        <ProfileCurve
          color={theme.line}
          fillOpacity={0}
          height={height}
          maxDepthMeters={maxDepthMeters}
          samples={samples}
          strokeWidth={strokeWidth}
          variant={variant}
          width={width}
        />
      </View>
      {marker ? (
        <Svg height={height + headroom} style={StyleSheet.absoluteFill} width={width}>
          <PinMark color={theme.pin} core={theme.pinCore} r={pinRadius} x={marker.x} y={marker.y + headroom} />
        </Svg>
      ) : null}
    </View>
  );
}

function Signature({ options, theme, slotWidth, maxHeight, k, fontScale, shadow }) {
  const mode = options.signatureMode;
  if (mode === 'typed') {
    const text = (options.signatureText || '').trim();
    if (!text) return null;
    const script = options.signatureFont === 'script';
    const fontSize = (script ? Math.max(11, 15 * k) : Math.max(8, 9.5 * k)) * fontScale;
    return (
      <Text
        adjustsFontSizeToFit
        numberOfLines={1}
        style={[
          styles.signatureText,
          { color: theme.signature, fontSize, maxWidth: slotWidth },
          script
            ? { fontFamily: SCRIPT_FONT }
            : { fontWeight: theme.signatureWeight, letterSpacing: theme.signatureSpacing * k, textTransform: theme.signatureCase },
          shadow.text,
        ]}
      >
        {text}
      </Text>
    );
  }
  if (mode === 'drawn') {
    const strokes = options.signatureStrokes;
    const bounds = signatureBounds(strokes);
    if (!bounds) return null;
    // Fit the ink's own bounding box (not the whole pad) into the slot.
    const scale = Math.min(slotWidth / bounds.width, maxHeight / bounds.height);
    const pad = 2 * k;
    const width = bounds.width * scale + pad * 2;
    const height = bounds.height * scale + pad * 2;
    const d = signaturePath(strokes, scale);
    return (
      <View style={[{ height, width }, shadow.view]}>
        <Svg height={height} width={width}>
          <Path
            d={d}
            fill="none"
            stroke={theme.signature}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={Math.max(1, 1.4 * k * fontScale)}
            transform={`translate(${pad - bounds.x * scale} ${pad - bounds.y * scale})`}
          />
        </Svg>
      </View>
    );
  }
  return null;
}

/**
 * @param {object} props
 * @param {number} props.width             frame width in points
 * @param {number} props.height            frame height in points
 * @param {string} props.photoUri
 * @param {{ width: number, height: number }} props.photoSize  natural size
 * @param {object} props.crop              see photoOverlayOptions.DEFAULT_CROP
 * @param {object} props.options           sanitized overlay settings
 * @param {Array}  props.samples
 * @param {number} [props.maxDepthMeters]
 * @param {object|null} props.pin          from resolvePin
 * @param {Array}  props.infoLines         from resolveInfoLines
 * @param {boolean} [props.showGuides]     crop thirds — on-screen editing only
 */
const PhotoOverlayCard = forwardRef(function PhotoOverlayCard(
  { width, height, photoUri, photoSize, crop, options, samples, maxDepthMeters, pin, infoLines, showGuides = false },
  ref,
) {
  const theme = getOverlayTheme(options.themeKey);
  const variant = resolveProfileVariant(options.profileKey, getShareCardTheme(options.themeKey).profileVariant);
  const layout = photoSize ? cropLayout(crop, photoSize, width, height) : null;

  // k: points per "reference point" on a 360pt-wide frame, so shadow radii and
  // strokes keep their proportions between preview and export.
  const k = width / 360;
  const textScale = getOverlayTextScale(options.textKey);
  const shadow = shadowFor(theme, options.shadow, k);
  const pad = Math.round(width * 0.045);
  const gap = width * 0.03;

  const hasProfile = options.showProfile && Array.isArray(samples) && samples.length > 1;
  const profileWidth = Math.round(width * getProfileSize(options.profileSizeKey).fraction);
  const profileHeight = Math.round(profileWidth * 0.42);
  const infoMaxWidth = width * 0.34;
  const hasInfo = infoLines.length > 0;
  // The info block's real width (it is usually narrower than its limit), so
  // the signature can use the true gap between the corners.
  const [infoMeasured, setInfoMeasured] = useState(null);
  const infoWidth = hasInfo ? Math.min(infoMaxWidth, infoMeasured ?? infoMaxWidth) : 0;
  const profileSide = hasProfile ? profileWidth : 0;

  const signatureSize = getSignatureSize(options.signatureSizeKey);
  const slot = signatureSlot({
    width,
    pad,
    gap,
    leftWidth: options.profileOnRight ? infoWidth : profileSide,
    rightWidth: options.profileOnRight ? profileSide : infoWidth,
    maxWidth: width * signatureSize.width,
  });
  const signatureMaxHeight = width * signatureSize.height;
  const liftBy = slot.lifted
    ? Math.max(hasProfile ? profileHeight + profileWidth * 0.15 : 0, hasInfo ? width * 0.11 * textScale : 0) + gap
    : 0;

  const primarySize = Math.max(11, width * 0.04) * textScale;
  const secondarySize = Math.max(9.5, width * 0.03) * textScale;
  const infoAlign = options.profileOnRight ? 'left' : 'right';

  return (
    <View ref={ref} collapsable={false} style={[styles.frame, { height, width }]}>
      {photoUri && layout ? (
        <Image
          source={{ uri: photoUri }}
          style={{
            height: layout.imageHeight,
            left: layout.left,
            position: 'absolute',
            top: layout.top,
            transform: [
              { translateX: layout.offsetX },
              { translateY: layout.offsetY },
              { rotate: `${layout.rotateDegrees}deg` },
              { scaleX: layout.flipX },
              { scaleY: layout.flipY },
            ],
            width: layout.imageWidth,
          }}
        />
      ) : null}

      {showGuides ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <View style={[styles.guideV, { left: width / 3 }]} />
          <View style={[styles.guideV, { left: (width * 2) / 3 }]} />
          <View style={[styles.guideH, { top: height / 3 }]} />
          <View style={[styles.guideH, { top: (height * 2) / 3 }]} />
        </View>
      ) : null}

      <View
        pointerEvents="none"
        style={[
          styles.bottomRow,
          { bottom: pad, flexDirection: options.profileOnRight ? 'row-reverse' : 'row', left: pad, right: pad },
        ]}
      >
        <View>
          {hasProfile ? (
            <MiniProfile
              height={profileHeight}
              maxDepthMeters={maxDepthMeters}
              pin={pin}
              samples={samples}
              shadowStyle={shadow.view}
              strokeWidth={Math.max(1.6, 2.1 * k)}
              theme={theme}
              variant={variant}
              width={profileWidth}
            />
          ) : null}
        </View>
        {hasInfo ? (
          <View
            onLayout={(event) => {
              const measured = Math.round(event.nativeEvent.layout.width);
              setInfoMeasured((prev) => (prev === measured ? prev : measured));
            }}
            style={{ maxWidth: infoMaxWidth }}
          >
            {infoLines.map((line, index) => {
              const primary = index === 0;
              return (
                <Text
                  key={line.key}
                  numberOfLines={primary ? 2 : 1}
                  style={[
                    {
                      color: primary ? theme.ink : theme.soft,
                      fontSize: primary ? primarySize : secondarySize,
                      // Always an array: switching from a tabular theme to one without
                      // would otherwise hand RN a null fontVariant, which crashes
                      // processFontVariant.
                      fontVariant: theme.tabular ? ['tabular-nums'] : [],
                      fontWeight: primary ? theme.primaryWeight : theme.secondaryWeight,
                      letterSpacing: (primary ? theme.primarySpacing : theme.secondarySpacing) * k,
                      marginTop: primary ? 0 : secondarySize * 0.18,
                      textAlign: infoAlign,
                      textTransform: (primary ? theme.primaryCase : theme.secondaryCase) || 'none',
                    },
                    shadow.text,
                  ]}
                >
                  {line.value}
                </Text>
              );
            })}
          </View>
        ) : null}
      </View>

      <View
        pointerEvents="none"
        style={[styles.signatureSlot, { bottom: pad + liftBy, left: slot.left, width: slot.width }]}
      >
        <Signature
          k={k}
          maxHeight={signatureMaxHeight}
          options={options}
          shadow={shadow}
          fontScale={signatureSize.font}
          slotWidth={slot.width}
          theme={theme}
        />
      </View>
    </View>
  );
});

export default PhotoOverlayCard;

const styles = StyleSheet.create({
  frame: { backgroundColor: '#000', overflow: 'hidden' },
  bottomRow: { alignItems: 'flex-end', justifyContent: 'space-between', position: 'absolute' },
  signatureSlot: { alignItems: 'center', position: 'absolute' },
  signatureText: { textAlign: 'center' },
  guideV: { backgroundColor: 'rgba(255,255,255,0.35)', bottom: 0, position: 'absolute', top: 0, width: StyleSheet.hairlineWidth },
  guideH: { backgroundColor: 'rgba(255,255,255,0.35)', height: StyleSheet.hairlineWidth, left: 0, position: 'absolute', right: 0 },
});
