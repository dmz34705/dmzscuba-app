import { useId } from 'react';
import { ClipPath, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { colors } from '../../theme';

// A three-quarter equipment study. Deliberately illustrative: the callouts describe
// assigned gear; this drawing is not a plumbing or equipment-configuration diagram.
const SUIT = {
  torso: 'M174 84 L189 80 L196 94 Q209 102 210 119 L203 160 L199 191 L202 214 Q192 237 173 239 L151 224 L150 200 L154 166 L148 127 Q145 106 160 98 Z',
  farArm: 'M155 105 Q142 104 137 122 L124 154 Q119 166 127 176 L149 194 L159 183 L139 164 L153 140 Q162 121 155 105 Z',
  nearArm: 'M204 108 Q218 108 222 126 L233 164 Q237 175 228 189 L214 213 L201 207 L213 177 Q215 174 213 168 L202 142 Q195 121 204 108 Z',
  farLeg: 'M156 220 Q169 219 180 235 L170 280 Q167 293 163 307 L159 349 L145 351 L143 309 Q142 295 147 278 L148 243 Z',
  nearLeg: 'M181 226 Q193 219 202 226 L210 268 Q216 287 209 301 L200 343 L183 345 L187 301 Q189 289 184 281 L170 246 Z',
  hood: 'M174 31 Q193 29 199 45 Q204 59 196 72 L186 83 L171 80 L160 69 L155 54 Q153 35 174 31 Z',
};

function WireSurface({ id, outline, contours, fill, opacity = 1 }) {
  return <G opacity={opacity}>
    <Defs><ClipPath id={id}><Path d={outline} /></ClipPath></Defs>
    <Path d={outline} fill={fill} stroke={colors.cyan} strokeOpacity="0.72" strokeWidth="1" />
    <G clipPath={`url(#${id})`} fill="none" stroke={colors.cyan} strokeWidth="0.55" strokeOpacity="0.24">
      <Path d={contours} />
    </G>
  </G>;
}

export default function DiverArtwork() {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const suitFill = `url(#${id}-suit)`;
  const gearFill = `url(#${id}-gear)`;
  return <G strokeLinecap="round" strokeLinejoin="round">
    <Defs>
      <LinearGradient id={`${id}-suit`} x1="0%" y1="0%" x2="100%" y2="20%">
        <Stop offset="0" stopColor={colors.backgroundRaised} />
        <Stop offset="0.6" stopColor={colors.deepBlue} />
        <Stop offset="1" stopColor={colors.backgroundRaised} />
      </LinearGradient>
      <LinearGradient id={`${id}-gear`} x1="0%" y1="0%" x2="100%" y2="0%">
        <Stop offset="0" stopColor={colors.backgroundRaised} />
        <Stop offset="0.45" stopColor={colors.surfaceSoft} />
        <Stop offset="1" stopColor={colors.background} />
      </LinearGradient>
    </Defs>
    {/* Cylinder, valve and wing sit behind the shoulders, establishing the viewing angle. */}
    <G transform="rotate(7 215 145)" stroke={colors.cyan} fill={gearFill} strokeWidth="1">
      <Path d="M207 87 V80 H221 V87 M210 80 V73 H218 V80 M218 75 H225" strokeOpacity="0.8" />
      <Rect x="204" y="86" width="25" height="119" rx="12" strokeOpacity="0.75" />
      <Path d="M209 96 V194 M224 97 V193 M205 118 H228 M205 169 H228" fill="none" strokeOpacity="0.3" />
      <Path d="M205 122 H228 V129 H205 Z M205 170 H228 V177 H205 Z" fill={colors.backgroundRaised} strokeOpacity="0.5" />
    </G>
    <Path d="M191 91 C214 86 229 105 227 134 L223 179 Q219 207 202 210 L185 200 L190 165 L182 126 Z" fill={gearFill} stroke={colors.cyan} strokeWidth="1.1" strokeOpacity="0.8" />
    <Path d="M200 99 Q222 107 218 143 L213 180 Q211 196 201 199 M209 106 L203 119 M220 130 L208 135 M217 158 L206 158 M212 183 L202 181" fill="none" stroke={colors.cyan} strokeWidth="0.65" strokeOpacity="0.4" />
    <WireSurface id={`${id}-far-arm`} outline={SUIT.farArm} fill={suitFill} opacity={0.7}
      contours="M132 124 Q143 132 155 131 M127 139 Q138 147 148 144 M122 155 Q133 162 140 162 M126 172 L137 160 M136 182 L148 173 M145 190 L154 181 M145 109 Q139 139 131 159 Q128 164 136 171 L156 189" />
    <WireSurface id={`${id}-far-leg`} outline={SUIT.farLeg} fill={suitFill} opacity={0.75}
      contours="M146 242 Q165 251 178 246 M146 260 Q158 269 174 265 M144 279 Q156 288 168 284 M142 299 Q153 307 165 301 M144 317 Q153 322 162 317 M145 335 Q153 339 160 335 M157 229 Q163 255 155 284 Q149 307 152 351 M167 236 Q173 260 163 285 Q156 310 155 349" />
    {/* The far fin is turned outward; the near fin shows the blade's face. */}
    <G stroke={colors.cyan} strokeWidth="1" fill={gearFill} opacity="0.72">
      <Path d="M145 344 L158 346 L155 368 L142 423 Q130 428 119 418 L139 368 Z" />
      <Path d="M144 350 L153 351 L149 367 L140 365 Z M141 372 L126 416 M149 374 L136 420 M137 389 L143 391 M132 403 L139 405" fill="none" strokeWidth="0.65" strokeOpacity="0.65" />
    </G>
    <WireSurface id={`${id}-near-leg`} outline={SUIT.nearLeg} fill={suitFill}
      contours="M174 245 Q190 251 205 242 M179 263 Q195 270 209 260 M185 281 Q199 288 213 278 M187 299 Q198 305 211 295 M185 317 Q195 323 205 315 M183 335 Q194 341 202 333 M187 231 Q185 249 199 278 Q204 289 197 305 L192 344 M178 241 Q184 266 190 281 Q196 291 191 307 L187 344" />
    <Path d="M188 279 Q199 284 207 278 L207 294 Q199 300 188 295 Z" fill={colors.backgroundRaised} stroke={colors.cyan} strokeWidth="0.7" strokeOpacity="0.6" />
    <WireSurface id={`${id}-torso`} outline={SUIT.torso} fill={suitFill}
      contours="M150 108 Q178 123 208 108 M149 125 Q176 141 206 129 M150 145 Q175 159 205 148 M150 164 Q175 177 202 167 M149 185 Q174 197 200 188 M149 205 Q174 217 202 208 M153 222 Q176 233 199 223 M169 91 Q159 133 164 165 Q160 200 165 233 M181 89 Q175 137 179 165 L177 237 M191 95 Q199 127 192 164 L190 232" />
    {/* Harness and waist belt are continuous, rather than floating over the suit. */}
    <G stroke={colors.cyan} strokeWidth="1" fill={gearFill}>
      <Path d="M160 100 L168 100 Q160 129 165 158 L161 192 L153 190 L157 156 Q151 128 160 100 Z M190 94 L198 99 Q194 128 190 153 L190 194 L182 195 L182 152 Z" strokeOpacity="0.85" />
      <Path d="M152 190 Q175 202 199 190 L201 201 Q177 214 151 201 Z" strokeOpacity="0.8" />
      <Path d="M155 203 L171 208 L168 228 L153 223 Z" strokeOpacity="0.65" />
      <Rect x="173" y="197" width="13" height="10" rx="2" strokeOpacity="0.9" />
      <Path d="M160 120 L165 121 M186 116 L193 118 M159 139 Q154 147 160 149 Q166 148 162 141 M187 137 Q182 145 188 147 Q194 145 190 138" fill="none" strokeOpacity="0.75" />
    </G>
    <WireSurface id={`${id}-near-arm`} outline={SUIT.nearArm} fill={suitFill}
      contours="M200 125 Q212 132 224 126 M203 140 Q218 146 229 140 M210 158 Q223 164 233 158 M212 176 Q224 185 232 176 M207 192 Q218 200 224 192 M211 111 Q207 127 220 159 Q226 173 219 188 L207 211 M217 123 Q216 141 227 165 Q231 177 223 190 L213 211" />
    <G stroke={colors.cyan} fill={gearFill} strokeWidth="1">
      <Path d="M202 207 L214 212 L209 225 Q205 233 199 232 L190 226 Q187 223 191 220 L198 221 Z" strokeOpacity="0.85" />
      <Path d="M149 184 L158 182 L168 190 Q172 195 168 199 L158 199 L152 194 L146 193 Z" strokeOpacity="0.65" />
      <Path d="M207 190 L220 196 L215 207 L202 201 Z" strokeOpacity="0.95" />
      <Path d="M208 194 L216 198 L213 203 L205 199 Z" fill={colors.cyan} fillOpacity="0.14" strokeOpacity="0.5" />
    </G>
    <WireSurface id={`${id}-hood`} outline={SUIT.hood} fill={suitFill}
      contours="M155 43 Q175 48 199 41 M155 54 Q176 62 201 52 M162 69 Q179 75 197 65 M170 79 Q187 85 194 72 M170 32 Q159 47 166 65 L178 80 M183 31 Q174 47 181 66 L186 81 M194 39 Q187 53 191 68" />
    <G stroke={colors.cyan} fill={gearFill} strokeWidth="1.1">
      <Path d="M152 47 L171 44 Q181 44 186 50 L184 62 L174 65 L167 58 L154 61 L149 54 Z" strokeOpacity="1" />
      <Path d="M153 49 L166 47 L166 56 L155 58 Z M172 47 L182 51 L180 59 L173 61 Z" fill={colors.cyan} fillOpacity="0.12" strokeOpacity="0.6" strokeWidth="0.7" />
      <Path d="M186 50 L200 48 M185 58 L199 56" fill="none" strokeOpacity="0.7" />
      <Path d="M157 64 Q165 61 172 66 L172 73 Q166 80 157 75 L153 71 Z" strokeOpacity="0.95" />
      <Path d="M158 68 L168 68 M160 71 L168 71" fill="none" strokeOpacity="0.55" strokeWidth="0.7" />
      <Path d="M172 69 C191 72 213 75 213 91 L210 104" fill="none" strokeWidth="1.6" strokeOpacity="0.85" />
      <Path d="M192 97 Q202 107 194 125 L187 143" fill="none" strokeWidth="2" strokeOpacity="0.65" />
    </G>
    <G stroke={colors.cyan} strokeWidth="1.1" fill={gearFill}>
      <Path d="M183 339 L199 339 Q202 351 198 365 L215 423 Q201 437 174 432 L181 367 Q178 353 183 339 Z" strokeOpacity="0.95" />
      <Path d="M185 344 L195 344 L194 362 L183 362 Z M184 371 L179 425 M195 370 L208 420 M188 380 L190 427 M180 401 Q195 407 207 399" fill="none" strokeWidth="0.7" strokeOpacity="0.6" />
    </G>
  </G>;
}
