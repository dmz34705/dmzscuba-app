// The depth-profile curve, shared by every card layout but drawn differently
// per style — a themed layout passes `variant` and its own palette rather than
// each layout reimplementing the geometry call.
//
// variant:
//   "line"   — a clean single stroke, subtle fill. The neutral default.
//   "glow"   — a soft wide underlay stroke plus a bright thin stroke on top,
//              reading as a lit instrument-panel readout.
//   "wave"   — the stroke fades out and the filled area carries the shape
//              instead, like a swell or current line.
//   "bars"   — the dive resampled into columns hanging from the surface, an
//              equalizer read of how deep you were and when.
//   "steps"  — a staircase, the way a computer's own sample log looks.
//   "mirror" — the trace plus its reflection, a symmetric decorative band.
//   "dots"   — the trace as discrete points, sparse and quiet.

import { useMemo } from 'react';
import Svg, { Circle, Defs, G, LinearGradient as SvgGradient, Path, Rect, Stop } from 'react-native-svg';

import { buildLogProfileGeometry } from '../../../lib/diveLog/profileChart';

// Variants that read the dive as discrete columns rather than a continuous
// trace. Fewer, wider buckets on a small card so the shape stays legible.
function resample(points, width, count) {
  const buckets = [];
  for (let i = 0; i < count; i += 1) {
    const x0 = (i / count) * width;
    const x1 = ((i + 1) / count) * width;
    let deepest = null;
    for (const point of points) {
      if (point.x >= x0 && point.x <= x1) {
        deepest = deepest === null ? point.y : Math.max(deepest, point.y);
      }
    }
    // A bucket narrower than the sample interval can catch nothing; fall back
    // to the trace's own value at the bucket's midpoint so there's no gap.
    buckets.push({ x0, x1, y: deepest === null ? interpolateY(points, (x0 + x1) / 2) : deepest });
  }
  return buckets;
}

function interpolateY(points, x) {
  if (!points.length) return 0;
  if (x <= points[0].x) return points[0].y;
  const last = points[points.length - 1];
  if (x >= last.x) return last.y;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (x <= b.x) {
      const span = b.x - a.x;
      return span <= 0 ? b.y : a.y + ((x - a.x) / span) * (b.y - a.y);
    }
  }
  return last.y;
}

function stepPaths(buckets, width) {
  if (!buckets.length) return { line: '', area: '' };
  let line = `M 0 ${buckets[0].y.toFixed(2)}`;
  buckets.forEach((bucket, index) => {
    line += ` L ${bucket.x1.toFixed(2)} ${bucket.y.toFixed(2)}`;
    const next = buckets[index + 1];
    if (next) line += ` L ${bucket.x1.toFixed(2)} ${next.y.toFixed(2)}`;
  });
  return { line, area: `${line} L ${width.toFixed(2)} 0 L 0 0 Z` };
}

export default function ProfileCurve({
  samples,
  maxDepthMeters,
  width,
  height,
  variant = 'line',
  color,
  fillOpacity = 0.35,
  strokeWidth,
}) {
  // Walking every sample and building path strings is the expensive part of
  // rendering a card, and it depends only on the dive and the chart's size —
  // not on the theme, the text, or anything else the user is tweaking. Without
  // this memo, every keystroke in the signature field rebuilt the geometry for
  // both the preview card and the off-screen export copy.
  const geometry = useMemo(
    () => buildLogProfileGeometry(samples, width, height, { maxDepthMeters }),
    [samples, width, height, maxDepthMeters],
  );

  const bucketCount = Math.max(12, Math.min(44, Math.round(width / 11)));
  const needsBuckets = variant === 'bars' || variant === 'steps' || variant === 'dots';
  const buckets = useMemo(
    () => (needsBuckets ? resample(geometry.points, width, bucketCount) : null),
    [needsBuckets, geometry, width, bucketCount],
  );
  const stepped = useMemo(
    () => (variant === 'steps' && buckets ? stepPaths(buckets, width) : null),
    [variant, buckets, width],
  );

  // Hooks must run unconditionally, so the "nothing to draw" bail-out comes
  // after them, not before.
  if (!geometry.linePath) return null;
  // Unique per variant *and* size: the preview and the off-screen export copy
  // are mounted at the same time, and two gradients sharing an id would have
  // one of them resolve against the other's definition.
  const gradientId = `curveFill-${variant}-${Math.round(width)}x${Math.round(height)}`;
  const baseStroke = strokeWidth ?? Math.max(2, width * 0.0065);
  const fill = `url(#${gradientId})`;

  return (
    <Svg height={height} width={width}>
      <Defs>
        <SvgGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={fillOpacity} />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </SvgGradient>
      </Defs>

      {variant === 'bars' ? (
        buckets.map((bucket, index) => {
          const gap = Math.max(1, (bucket.x1 - bucket.x0) * 0.28);
          const barWidth = Math.max(1, bucket.x1 - bucket.x0 - gap);
          return (
            <Rect
              fill={color}
              fillOpacity={0.42 + (bucket.y / Math.max(1, height)) * 0.5}
              height={Math.max(1, bucket.y)}
              key={index}
              rx={barWidth / 2}
              width={barWidth}
              x={bucket.x0 + gap / 2}
              y={0}
            />
          );
        })
      ) : null}

      {variant === 'dots' ? (
        buckets.map((bucket, index) => (
          <Circle
            cx={(bucket.x0 + bucket.x1) / 2}
            cy={bucket.y}
            fill={color}
            fillOpacity={0.9}
            key={index}
            r={Math.max(1.5, baseStroke * 0.75)}
          />
        ))
      ) : null}

      {variant === 'steps' && stepped ? (
        <>
          <Path d={stepped.area} fill={fill} stroke="none" />
          <Path d={stepped.line} fill="none" stroke={color} strokeLinejoin="miter" strokeWidth={baseStroke} />
        </>
      ) : null}

      {variant === 'mirror' ? (
        <>
          <Path d={geometry.areaPath} fill={fill} stroke="none" />
          <Path d={geometry.linePath} fill="none" stroke={color} strokeLinecap="round" strokeWidth={baseStroke} />
          {/* Reflected about the chart's mid-line: translate down by the full
              height, then flip, so y maps to height - y. */}
          <G transform={`translate(0, ${height}) scale(1, -1)`}>
            <Path
              d={geometry.linePath}
              fill="none"
              stroke={color}
              strokeLinecap="round"
              strokeOpacity={0.4}
              strokeWidth={baseStroke * 0.8}
            />
          </G>
        </>
      ) : null}

      {variant === 'line' || variant === 'glow' || variant === 'wave' ? (
        <>
          <Path d={geometry.areaPath} fill={fill} stroke="none" />
          {variant === 'glow' ? (
            <Path
              d={geometry.linePath}
              fill="none"
              stroke={color}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeOpacity={0.35}
              strokeWidth={baseStroke * 2.6}
            />
          ) : null}
          <Path
            d={geometry.linePath}
            fill="none"
            stroke={color}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeOpacity={variant === 'wave' ? 0.75 : 1}
            strokeWidth={variant === 'wave' ? baseStroke * 0.65 : baseStroke}
          />
        </>
      ) : null}
    </Svg>
  );
}
