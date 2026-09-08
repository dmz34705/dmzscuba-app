const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadSourceModule } = require('./lib/load-source-module.cjs');

const root = path.join(__dirname, '..');
const srcRoot = path.join(root, 'src');
const model = loadSourceModule(path.join(srcRoot, 'features/compassNav/model.js'), srcRoot);
const {
  HOLD_ON_COURSE_DEG, RECAP, SECTION_NAMES, STEPS, angularDiff, bezelAim,
  bezelCourse, buildLessonSteps, gateMet, generatePracticeHeadings, holdBearing,
  legBearing, norm360, paceAllowed, reciprocal, stepHeading, turnTo, visibleSteps,
} = model;

// --- heading math ---------------------------------------------------------
assert.equal(norm360(-90), 270);
assert.equal(norm360(370), 10);
assert.equal(reciprocal(0), 180);
assert.equal(reciprocal(270), 90);
assert.equal(angularDiff(350, 10), 20, 'angular distance wraps across north');
assert.equal(angularDiff(10, 190), 180);
assert.equal(turnTo(350, 20), 30, 'signed right turn wraps');
assert.equal(turnTo(20, 350), -30, 'signed left turn wraps');
assert.equal(bezelCourse(240), 120, 'screen rotation 240 stores course 120');

// Random drill headings are rounded to tens and always at least 90 degrees apart.
for (let index = 0; index < 100; index += 1) {
  const [first, second] = generatePracticeHeadings(Math.random);
  assert.equal(first % 10, 0);
  assert.equal(second % 10, 0);
  assert.ok(angularDiff(first, second) >= 90, `${first}/${second} need 90-degree separation`);
}
assert.deepEqual(generatePracticeHeadings(() => 0), [0, 90], 'lower random bound');

// --- lesson shape + requested sequence -----------------------------------
const steps = buildLessonSteps([120, 300]);
const KINDS = new Set(['info', 'learn', 'capture', 'bezel', 'align', 'hold', 'reciprocalBezel', 'recap']);
let section = 0;
const sections = new Set();
for (const step of steps) {
  assert.ok(step.id && step.title && step.body, `${step.id || '?'} needs id + title + body`);
  assert.ok(KINDS.has(step.kind), `bad kind on ${step.id}: ${step.kind}`);
  assert.ok(step.section >= section, `sections must not go backwards (${step.id})`);
  section = step.section;
  sections.add(step.section);
  assert.ok(SECTION_NAMES[step.section], `no section label for ${step.id}`);
  if (step.kind === 'learn') assert.ok(step.observe && step.highlight);
  if (['bezel', 'align', 'reciprocalBezel'].includes(step.kind)) assert.equal(typeof step.tol, 'number');
  if (step.kind === 'hold') assert.equal(step.paces, 10, `${step.id} must use ten steps`);
}
assert.deepEqual([...sections], [1, 2, 3, 4]);
assert.equal(steps[0].kind, 'info');
assert.ok(steps.at(-1).kind === 'recap' && steps.at(-1).isLast);
assert.equal(visibleSteps({ steps }).length, steps.length);
assert.equal(STEPS.filter((step) => step.kind === 'capture').length, 2, 'two surface sighting points');
assert.equal(steps.filter((step) => step.kind === 'reciprocalBezel').length, 2, 'two reciprocal drills');
assert.equal(RECAP.length, 6);

for (const number of [1, 2]) {
  const ids = [
    `reciprocal${number}-set-out`,
    `reciprocal${number}-face-out`,
    `reciprocal${number}-walk-out`,
    `reciprocal${number}-set-back`,
    `reciprocal${number}-face-back`,
    `reciprocal${number}-walk-back`,
  ];
  const positions = ids.map((id) => steps.findIndex((step) => step.id === id));
  assert.ok(positions.every((position) => position >= 0), `drill ${number} has every phase`);
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, `drill ${number} follows physical order`);
}

// --- gating: three-part intro --------------------------------------------
const learn = steps.find((step) => step.kind === 'learn');
assert.equal(gateMet(learn, { observed: {} }), false);
assert.equal(gateMet(learn, { observed: { [learn.id]: true } }), true);

// --- gating: two captured surface points ---------------------------------
const capture = steps.find((step) => step.id === 'surface1-capture');
assert.equal(stepHeading(capture, { headings: {} }), null);
assert.equal(gateMet(capture, { headings: {} }), false);
assert.equal(stepHeading(capture, { headings: { surface1: 123 } }), 123);
assert.equal(gateMet(capture, { headings: { surface1: 123 } }), true);

const surfaceBezel = steps.find((step) => step.id === 'surface1-bezel');
const surfaceCtx = { headings: { surface1: 120 }, heading: 120, bezel: 240 };
assert.equal(bezelAim(surfaceBezel, surfaceCtx), 240);
assert.equal(gateMet(surfaceBezel, surfaceCtx), true, 'surface north is aligned north-to-north');
assert.equal(gateMet(surfaceBezel, { ...surfaceCtx, heading: 170 }), false, 'must keep sighted object under lubber');
assert.equal(gateMet(surfaceBezel, { ...surfaceCtx, bezel: 120 }), false, 'wrong bezel rotation');

const surfaceHold = steps.find((step) => step.id === 'surface1-hold');
assert.equal(holdBearing(surfaceHold, surfaceCtx), 120);
assert.equal(paceAllowed(surfaceHold, surfaceCtx), true);
assert.equal(paceAllowed(surfaceHold, { ...surfaceCtx, heading: 120 + HOLD_ON_COURSE_DEG + 1 }), false);
assert.equal(gateMet(surfaceHold, { paces: { [surfaceHold.id]: 9 } }), false);
assert.equal(gateMet(surfaceHold, { paces: { [surfaceHold.id]: 10 } }), true);

// --- gating: set bezel, turn body, walk, set reciprocal, turn, walk -------
const setOut = steps.find((step) => step.id === 'reciprocal1-set-out');
const faceOut = steps.find((step) => step.id === 'reciprocal1-face-out');
const walkOut = steps.find((step) => step.id === 'reciprocal1-walk-out');
const setBack = steps.find((step) => step.id === 'reciprocal1-set-back');
const faceBack = steps.find((step) => step.id === 'reciprocal1-face-back');
const walkBack = steps.find((step) => step.id === 'reciprocal1-walk-back');

assert.equal(stepHeading(setOut, {}), 120);
assert.equal(legBearing(setOut, {}), 120);
assert.equal(bezelAim(setOut, {}), 240);
assert.equal(gateMet(setOut, { heading: 0, bezel: 240 }), true, 'set heading before body turn');
assert.equal(gateMet(faceOut, { heading: 120, bezel: 240 }), true, 'card N returns to bezel N');
assert.equal(gateMet(faceOut, { heading: 120, bezel: 60 }), false, 'body direction alone is insufficient');
assert.equal(holdBearing(walkOut, {}), 120);

// At the turnaround the body stays on 120 while bezel N rotates to card S.
assert.equal(legBearing(setBack, {}), 300);
assert.equal(bezelAim(setBack, {}), 60);
assert.equal(gateMet(setBack, { heading: 120, bezel: 60 }), true, 'bezel N sits over card S');
assert.equal(gateMet(setBack, { heading: 300, bezel: 60 }), false, 'must not turn body before setting reciprocal');
assert.equal(gateMet(faceBack, { heading: 300, bezel: 60 }), true, 'then turn body until N meets N');
assert.equal(holdBearing(walkBack, {}), 300);
assert.equal(paceAllowed(walkBack, { heading: 300 }), true);
assert.equal(paceAllowed(walkBack, { heading: 120 }), false);

// --- screen wiring: guided + free explore --------------------------------
const screen = fs.readFileSync(path.join(srcRoot, 'screens/CompassNavScreen.js'), 'utf8');
assert.match(screen, /generatePracticeHeadings/);
assert.match(screen, /buildLessonSteps/);
assert.match(screen, /lessonMode/);
assert.match(screen, /EXPLORE/);
assert.match(screen, /FREE PRACTICE/);
assert.match(screen, /GUIDED LESSON/);
assert.match(screen, /reciprocalBezel/);
assert.match(screen, /Bezel north is on card south/);
assert.match(screen, /\+ STEP/);

console.log('Native compass-nav checks passed.');
