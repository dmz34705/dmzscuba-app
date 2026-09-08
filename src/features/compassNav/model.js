// "Compass Navigation" lesson model. The physical relationship is the core:
// the lubber line follows the diver, the card stays with magnetic north, and
// the bezel remembers the course. A reciprocal is set bezel-first (bezel N on
// card S), then the diver turns until card N returns to bezel N.

// --- heading math (pure, unit-tested) --------------------------------------

export const norm360 = (degrees) => ((degrees % 360) + 360) % 360;

export const reciprocal = (heading) => norm360(heading + 180);

// Shortest angular distance between two bearings, 0..180.
export function angularDiff(a, b) {
  const distance = Math.abs(norm360(a) - norm360(b));
  return Math.min(distance, 360 - distance);
}

// Signed shortest turn from `a` to `b`, -180..180 (positive = right).
export function turnTo(a, b) {
  const distance = norm360(b - a);
  return distance > 180 ? distance - 360 : distance;
}

export const HOLD_ON_COURSE_DEG = 18;

// Generate two ten-degree practice headings whose shortest separation is at
// least 90 degrees. Each lesson restart produces a fresh pair.
export function generatePracticeHeadings(random = Math.random) {
  const firstRoll = Math.max(0, Math.min(0.999999, random()));
  const offsetRoll = Math.max(0, Math.min(0.999999, random()));
  const first = Math.floor(firstRoll * 36) * 10;
  const offset = 90 + Math.floor(offsetRoll * 19) * 10;
  return [first, norm360(first + offset)];
}

// Captured surface targets live in ctx.headings; reciprocal drills carry a
// generated heading directly on their steps.
export function stepHeading(step, ctx = {}) {
  if (typeof step?.heading === 'number') return norm360(step.heading);
  const captured = step?.courseKey ? ctx.headings?.[step.courseKey] : null;
  return typeof captured === 'number' ? norm360(captured) : null;
}

export function legBearing(step, ctx = {}) {
  const course = stepHeading(step, ctx);
  if (course == null) return null;
  return step.bearing === 'reciprocal' ? reciprocal(course) : course;
}

export function holdBearing(step, ctx = {}) {
  return step?.kind === 'hold' ? legBearing(step, ctx) : null;
}

export function paceAllowed(step, ctx = {}) {
  const wanted = holdBearing(step, ctx);
  if (wanted == null) return true;
  return angularDiff(ctx.heading ?? 0, wanted) <= HOLD_ON_COURSE_DEG;
}

// The card renders at -heading. Storing a 120-degree course therefore places
// bezel N at -120, while the bezel's 120 mark lands under the lubber line.
export function bezelAim(step, ctx = {}) {
  if (step?.kind !== 'bezel' && step?.kind !== 'reciprocalBezel') return null;
  const wanted = legBearing(step, ctx);
  return wanted == null ? null : norm360(-wanted);
}

export function bezelCourse(bezel) {
  return norm360(-bezel);
}

// --- lesson content -------------------------------------------------------

export const SECTION_NAMES = {
  1: 'THE COMPASS',
  2: 'SURFACE NAVIGATION',
  3: 'RECIPROCAL NAVIGATION',
  4: 'RECAP',
};

function surfacePoint(number) {
  const courseKey = `surface${number}`;
  return [
    {
      id: `${courseKey}-capture`, section: 2, kind: 'capture', courseKey,
      title: `Surface point ${number}: sight`,
      body: 'Choose a distinct object in the distance. Point the lubber line straight at it, hold the compass level, then lock that heading.',
      done: 'Heading captured.',
    },
    {
      id: `${courseKey}-bezel`, section: 2, kind: 'bezel', courseKey, bearing: 'target', requireFacing: true, tol: 8,
      title: `Surface point ${number}: set the bezel`,
      body: 'Without turning your body, rotate the bezel until bezel north sits directly over red north on the card. The course number should now sit at the lubber line.',
      done: 'North is aligned with north.',
    },
    {
      id: `${courseKey}-hold`, section: 2, kind: 'hold', courseKey, bearing: 'target', paces: 10,
      title: `Surface point ${number}: hold course`,
      body: 'Move ten steps toward the object. Keep the compass level and keep card north inside bezel north. Correct with your whole body if they separate.',
      done: 'Surface course complete.',
    },
  ];
}

function reciprocalDrill(number, heading) {
  const base = `reciprocal${number}`;
  const label = String(Math.round(heading)).padStart(3, '0');
  const returnLabel = String(Math.round(reciprocal(heading))).padStart(3, '0');
  return [
    {
      id: `${base}-set-out`, section: 3, kind: 'bezel', heading, bearing: 'target', tol: 8,
      title: `Drill ${number}: set ${label}°`,
      body: `Before turning your body, rotate the bezel until ${label}° is at the lubber line. This programs the outbound course into the bezel.`,
      done: `Bezel set to ${label}°.`,
    },
    {
      id: `${base}-face-out`, section: 3, kind: 'align', heading, bearing: 'target', tol: 10,
      title: `Drill ${number}: turn onto course`,
      body: 'Now turn your whole body, keeping the lubber line straight ahead, until red north on the card is centered inside bezel north.',
      done: `Body aligned on ${label}°.`,
    },
    {
      id: `${base}-walk-out`, section: 3, kind: 'hold', heading, bearing: 'target', paces: 10,
      title: `Drill ${number}: ten steps out`,
      body: 'Move ten steps while keeping card north aligned with bezel north. If they separate, correct your body—not the bezel.',
      done: 'Ten steps out.',
    },
    {
      id: `${base}-set-back`, section: 3, kind: 'reciprocalBezel', heading, bearing: 'reciprocal', tol: 8,
      title: `Drill ${number}: set the reciprocal`,
      body: `Keep your body facing outbound. Rotate only the bezel until bezel north sits over south on the card. That sets the exact reciprocal course: ${returnLabel}°.`,
      done: 'Bezel north is aligned with card south.',
    },
    {
      id: `${base}-face-back`, section: 3, kind: 'align', heading, bearing: 'reciprocal', tol: 10,
      title: `Drill ${number}: turn your body`,
      body: 'The reciprocal is set, but you are not facing home yet. Turn your whole body 180° until red card north is centered inside bezel north again.',
      done: `Body aligned on reciprocal ${returnLabel}°.`,
    },
    {
      id: `${base}-walk-back`, section: 3, kind: 'hold', heading, bearing: 'reciprocal', paces: 10,
      title: `Drill ${number}: ten steps back`,
      body: 'Use the same ten-step count while holding north-to-north alignment. You should finish at your starting point.',
      done: 'Back at the start.',
    },
  ];
}

export function buildLessonSteps(practiceHeadings = [40, 220]) {
  const first = norm360(practiceHeadings[0] ?? 40);
  const second = norm360(practiceHeadings[1] ?? 220);
  return [
    {
      id: 'intro', section: 1, kind: 'info',
      title: 'Your dive compass',
      body: 'Three parts work together: your body carries the lubber line, the compass card stays with Earth’s magnetic field, and the bezel remembers the heading you want to travel.',
    },
    {
      id: 'lubber', section: 1, kind: 'learn', observe: 'heading', highlight: 'lubber',
      title: 'The lubber line follows you',
      body: 'The lubber line points straight ahead as an extension of your body. The heading beneath it is the direction you are physically facing.',
    },
    {
      id: 'card', section: 1, kind: 'learn', observe: 'heading', highlight: 'card',
      title: 'The card stays with Earth',
      body: 'The floating card is locked to Earth’s magnetic field. Its red N keeps indicating magnetic north while your body and compass housing turn around it.',
    },
    {
      id: 'bezelIntro', section: 1, kind: 'learn', observe: 'bezel', highlight: 'bezel',
      title: 'The bezel remembers your course',
      body: 'Rotate the bezel to store the heading you want to follow. Once set, steer your body to keep card north aligned with bezel north.',
    },
    {
      id: 'holdLevel', section: 1, kind: 'info', highlight: 'tilt',
      title: 'Keep it level',
      body: 'Cant the compass more than about 20 degrees and the card can bind. Keep the bubble centered so the card can turn freely.',
    },
    {
      id: 'surfaceIntro', section: 2, kind: 'info',
      title: 'Start on the surface',
      body: 'Practice with two different objects you can see in the distance. For each one: sight it with the lubber line, set north over north, and hold that alignment as you move.',
    },
    ...surfacePoint(1),
    ...surfacePoint(2),
    {
      id: 'reciprocalIntro', section: 3, kind: 'info',
      title: 'Out and back',
      body: `Now run two complete reciprocal drills on courses ${String(first).padStart(3, '0')}° and ${String(second).padStart(3, '0')}°. They are separated by at least 90° so each setup feels distinct.`,
    },
    ...reciprocalDrill(1, first),
    ...reciprocalDrill(2, second),
    {
      id: 'recap', section: 4, kind: 'recap', isLast: true,
      title: 'The complete sequence',
      body: 'Use this same physical sequence on every straight-line out-and-back:',
    },
  ];
}

export const STEPS = buildLessonSteps();

export const RECAP = [
  'Keep the compass level with the lubber line extending straight from your body',
  'Set the outbound course on the bezel, then turn your body until card N meets bezel N',
  'Travel the chosen count while steering your body to maintain north-to-north alignment',
  'Before turning around, rotate bezel N onto card S to set the exact reciprocal',
  'Turn your body 180° until card N meets bezel N again',
  'Travel the same count back without moving the bezel',
];

// --- lesson logic (pure, unit-tested) ------------------------------------

export function visibleSteps(ctx = {}) {
  const source = Array.isArray(ctx.steps) ? ctx.steps : STEPS;
  return source.filter((step) => !step.showIf || step.showIf(ctx));
}

// ctx: { heading, bezel, tilt, paces:{}, headings:{}, observed:{} }
export function gateMet(step, ctx = {}) {
  if (!step) return true;
  const paces = ctx.paces || {};
  const observed = ctx.observed || {};
  switch (step.kind) {
    case 'learn':
      return Boolean(observed[step.id]);
    case 'capture':
      return stepHeading(step, ctx) != null;
    case 'bezel': {
      const course = legBearing(step, ctx);
      const wanted = bezelAim(step, ctx);
      const bezelSet = wanted != null && angularDiff(ctx.bezel ?? 0, wanted) <= step.tol;
      return bezelSet && (!step.requireFacing || angularDiff(ctx.heading ?? 0, course) <= step.tol);
    }
    case 'align': {
      const course = legBearing(step, ctx);
      if (course == null) return false;
      return angularDiff(ctx.heading ?? 0, course) <= step.tol
        && angularDiff(ctx.bezel ?? 0, norm360(-course)) <= step.tol;
    }
    case 'hold':
      return (paces[step.id] || 0) >= step.paces;
    case 'reciprocalBezel': {
      const outbound = stepHeading(step, ctx);
      const wanted = bezelAim(step, ctx);
      return outbound != null
        && angularDiff(ctx.heading ?? 0, outbound) <= step.tol
        && angularDiff(ctx.bezel ?? 0, wanted) <= step.tol;
    }
    default:
      return true;
  }
}
