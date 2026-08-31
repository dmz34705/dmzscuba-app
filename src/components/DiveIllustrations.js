import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Ellipse, G, Line, Path, Rect } from 'react-native-svg';

import { colors } from '../theme';

export function ColorLossIcon({ size = 44 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path d="M24 4C17 14 9 22 9 31a15 15 0 0030 0c0-9-8-17-15-27z" fill="#126899" />
      <Circle cx="19" cy="29" r="5" fill="#E21B23" />
      <Circle cx="28" cy="31" r="5" fill="#F0C84B" opacity=".75" />
      <Circle cx="24" cy="21" r="4" fill="#70DDF6" />
    </Svg>
  );
}

export function BoyleIcon({ size = 44 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Ellipse cx="24" cy="19" rx="12" ry="14" fill="#6DAEFF" stroke="#BFE8FF" strokeWidth="2" />
      <Path d="M21 33l3 4 3-4z" fill="#6DAEFF" />
      <Path d="M24 37c-4 4 3 5-1 8" stroke="#BFE8FF" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <Path d="M17 18c1-5 4-8 8-9" stroke="#EAF7FF" strokeWidth="2" fill="none" strokeLinecap="round" opacity=".7" />
    </Svg>
  );
}

export function CalculatorIcon({ size = 44 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Rect x="9" y="5" width="30" height="38" rx="7" fill="#123650" stroke="#70DDF6" strokeWidth="2" />
      <Rect x="14" y="10" width="20" height="8" rx="2" fill="#071525" stroke="#BFE8FF" strokeWidth="1.5" />
      <Circle cx="17" cy="25" r="2.5" fill="#70DDF6" />
      <Circle cx="24" cy="25" r="2.5" fill="#70DDF6" />
      <Circle cx="31" cy="25" r="2.5" fill="#F0C84B" />
      <Circle cx="17" cy="33" r="2.5" fill="#70DDF6" />
      <Circle cx="24" cy="33" r="2.5" fill="#70DDF6" />
      <Rect x="28.5" y="30.5" width="5" height="5" rx="1.5" fill="#E21B23" />
    </Svg>
  );
}

export function LensIcon({ size = 44 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Rect x="5" y="14" width="38" height="26" rx="7" fill="#123650" stroke="#70DDF6" strokeWidth="2" />
      <Path d="M16 14l3-5h10l3 5z" fill="#123650" stroke="#70DDF6" strokeWidth="2" />
      <Circle cx="24" cy="27" r="9" fill="#071525" stroke="#BFE8FF" strokeWidth="2" />
      <Circle cx="24" cy="27" r="4.5" fill="#70DDF6" opacity=".85" />
      <Circle cx="34" cy="20" r="2" fill="#F0C84B" />
    </Svg>
  );
}

export function DiveComputerIcon({ size = 44 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Rect x="7" y="6" width="34" height="36" rx="12" fill="#071525" stroke="#70DDF6" strokeWidth="2" />
      <Rect x="12" y="11" width="24" height="21" rx="5" fill="#B7D2C9" stroke="#345267" strokeWidth="1.5" />
      <Path d="M17 18h6v-3h-6v3Zm9 0h5v-3h-5v3ZM17 27h14v-5H17v5Z" fill="#092932" />
      <Circle cx="16" cy="37" r="2.5" fill="#E21B23" />
      <Circle cx="32" cy="37" r="2.5" fill="#70DDF6" />
    </Svg>
  );
}

export function LogbookIcon({ size = 44 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Rect x="9" y="6" width="27" height="36" rx="4" fill="#123650" stroke="#70DDF6" strokeWidth="2" />
      <Rect x="14" y="6" width="4" height="36" fill="#071525" opacity=".6" />
      <Path d="M22 14h10M22 20h10M22 26h7" stroke="#BFE8FF" strokeWidth="2" strokeLinecap="round" />
      <Path d="M20 33l3.4 3.4L31 29" stroke="#70E2A3" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx="36" cy="12" r="3" fill="#E21B23" />
    </Svg>
  );
}

export function DiverGraphic({ colors: gear, flashlight = false, width = 180 }) {
  const height = width * 0.58;
  return (
    <Svg accessibilityLabel="Illustrated scuba diver" width={width} height={height} viewBox="0 0 220 128">
      {flashlight && (
        <Path d="M184 56L220 31v50z" fill="#FFF3B0" opacity=".34" />
      )}
      <G transform="translate(2 10) rotate(-8 105 60)">
        <Rect x="58" y="40" width="93" height="35" rx="15" fill={gear.wetsuit} stroke="#02060B" strokeWidth="5" />
        <Rect x="91" y="27" width="68" height="25" rx="11" fill={gear.tank} stroke="#02060B" strokeWidth="5" />
        <Circle cx="164" cy="50" r="19" fill={gear.wetsuit} stroke="#02060B" strokeWidth="5" />
        <Path d="M151 42l28 1 4 13-29 2z" fill={gear.mask} stroke="#02060B" strokeWidth="4" />
        <Path d="M69 68L33 94" stroke={gear.wetsuit} strokeWidth="18" strokeLinecap="round" />
        <Path d="M75 71l-7 36" stroke={gear.wetsuit} strokeWidth="18" strokeLinecap="round" />
        <Path d="M36 91L7 99 29 108 49 100z" fill={gear.fins} stroke="#02060B" strokeWidth="4" />
        <Path d="M70 100l-19 16 32 1 6-9z" fill={gear.fins} stroke="#02060B" strokeWidth="4" />
        <Path d="M136 69l27 22" stroke={gear.wetsuit} strokeWidth="14" strokeLinecap="round" />
        <Path d="M160 90l24-6" stroke="#02060B" strokeWidth="8" strokeLinecap="round" />
        {flashlight && <Rect x="181" y="78" width="18" height="9" rx="4" fill="#F0C84B" stroke="#02060B" strokeWidth="3" />}
        <Circle cx="173" cy="34" r="4" fill="#BFE8FF" opacity=".85" />
        <Circle cx="184" cy="25" r="3" fill="#BFE8FF" opacity=".7" />
      </G>
    </Svg>
  );
}

export function BalloonGraphic({ size = 100, color = '#2F8BFF', overexpanded = false }) {
  const stroke = overexpanded ? colors.danger : '#CBEAFF';
  return (
    <View style={{ width: size, height: size * 1.42, alignItems: 'center' }}>
      <Svg accessibilityLabel="Balloon showing current gas volume" width={size} height={size * 1.42} viewBox="0 0 100 142">
        <Ellipse cx="50" cy="47" rx="40" ry="45" fill={color} stroke={stroke} strokeWidth={overexpanded ? 4 : 2.5} />
        <Path d="M44 90l6 10 6-10z" fill={color} stroke={stroke} strokeWidth="2" />
        <Path d="M50 100c-11 13 12 20 0 40" stroke="#D8EDF8" strokeWidth="2" fill="none" strokeLinecap="round" />
        <Path d="M27 28c5-10 12-16 23-18" stroke="#FFFFFF" strokeWidth="5" fill="none" strokeLinecap="round" opacity=".45" />
      </Svg>
    </View>
  );
}

export function BubbleField() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {[
        [13, 18, 7], [78, 15, 4], [88, 41, 8], [18, 65, 4], [72, 76, 5], [41, 31, 3], [28, 86, 6], [91, 88, 3],
      ].map(([left, top, size], index) => (
        <View key={index} style={[styles.bubble, { left: `${left}%`, top: `${top}%`, width: size, height: size, borderRadius: size }]} />
      ))}
    </View>
  );
}

export function WaveLine() {
  return (
    <Svg width="100%" height={20} viewBox="0 0 360 20" preserveAspectRatio="none">
      <Path d="M0 12c30-12 60 12 90 0s60-12 90 0 60 12 90 0 60-12 90 0" stroke="rgba(216,246,255,.8)" strokeWidth="2" fill="none" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  bubble: { borderColor: 'rgba(216, 246, 255, 0.35)', borderWidth: 1, position: 'absolute' },
});
