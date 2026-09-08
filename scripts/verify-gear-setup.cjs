const assert = require('node:assert/strict');
const path = require('node:path');
const { loadSourceModule } = require('./lib/load-source-module.cjs');
const root = path.join(__dirname, '..');
const model = loadSourceModule(path.join(root, 'src/features/gearSetup/model.js'), path.join(root, 'src'));
const { PARTS, STEPS, RECAP, visibleSteps, gateMet, identifyProgress } = model;

// Every step is well-formed and its section only moves forward.
let section = 0;
const SECTIONS = new Set();
for (const step of STEPS) {
  assert.ok(['info', 'identify', 'choice', 'assemble', 'recap'].includes(step.kind), `bad kind on ${step.id}`);
  assert.ok(step.title && step.body, `${step.id} needs title + body`);
  assert.ok(step.section >= section, `sections must not go backwards (${step.id})`);
  section = step.section;
  SECTIONS.add(step.section);
  if (step.kind === 'identify') {
    assert.ok(step.identify.length >= 1);
    for (const id of step.identify) assert.ok(PARTS[id], `${step.id} references unknown part ${id}`);
  }
  if (step.kind === 'choice') {
    assert.ok(step.choice.key && step.choice.options.length >= 2, `${step.id} choice malformed`);
    if (step.choice.correct) assert.ok(step.choice.options.some((o) => o.value === step.choice.correct));
  }
  if (step.kind === 'assemble') {
    assert.ok(step.drag.piece && step.drag.target && step.drag.milestone, `${step.id} drag malformed`);
    assert.ok(step.task, `${step.id} needs a task`);
  }
}
assert.deepEqual([...SECTIONS].sort(), [1, 2, 3, 4, 5, 6], 'all six sections present');
assert.ok(STEPS[0].kind === 'info');
assert.ok(STEPS[STEPS.length - 1].kind === 'recap' && STEPS[STEPS.length - 1].isLast);

// The DIN branch hides the yoke O-ring step; yoke/hybrid keep it.
assert.ok(!visibleSteps({ valveType: 'din' }).some((s) => s.id === 'oring'), 'DIN skips the O-ring step');
assert.ok(visibleSteps({ valveType: 'yoke' }).some((s) => s.id === 'oring'), 'yoke keeps the O-ring step');
assert.ok(visibleSteps({ valveType: 'hybrid' }).some((s) => s.id === 'oring'), 'hybrid keeps the O-ring step');
assert.ok(visibleSteps({}).length === STEPS.length, 'no choice yet -> every step visible');

// Gating.
const idStep = STEPS.find((s) => s.id === 'valve');
assert.equal(gateMet(idStep, { asm: {}, choices: {}, identified: new Set(['valve']) }), false, 'identify needs every part tapped');
assert.equal(gateMet(idStep, { asm: {}, choices: {}, identified: new Set(idStep.identify) }), true);

const orient = STEPS.find((s) => s.id === 'mountOrient');
assert.equal(gateMet(orient, { asm: {}, choices: {}, identified: new Set() }), false, 'no pick -> locked');
assert.equal(gateMet(orient, { asm: {}, choices: { orientation: 'front' }, identified: new Set() }), false, 'wrong pick -> locked');
assert.equal(gateMet(orient, { asm: {}, choices: { orientation: 'back' }, identified: new Set() }), true);

const valveType = STEPS.find((s) => s.id === 'valveType');
assert.equal(gateMet(valveType, { asm: {}, choices: { valveType: 'din' }, identified: new Set() }), true, 'any valid valve choice passes');

const load = STEPS.find((s) => s.id === 'wtLoad');
assert.equal(gateMet(load, { asm: { weights: 1 }, choices: {}, identified: new Set() }), false, 'both pockets required');
assert.equal(gateMet(load, { asm: { weights: 2 }, choices: {}, identified: new Set() }), true);

const mount = STEPS.find((s) => s.id === 'mountSlide');
assert.equal(gateMet(mount, { asm: { bcdOn: false }, choices: {}, identified: new Set() }), false);
assert.equal(gateMet(mount, { asm: { bcdOn: true }, choices: {}, identified: new Set() }), true);

// identifyProgress mirrors the step.
const prog = identifyProgress(idStep, new Set(['valve']));
assert.equal(prog.length, idStep.identify.length);
assert.equal(prog.find((p) => p.id === 'valve').done, true);
assert.equal(prog.find((p) => p.id === 'handWheel').done, false);

assert.ok(RECAP.length >= 6, 'recap covers the whole sequence');

console.log('Native gear-setup checks passed.');
