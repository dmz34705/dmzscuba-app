const assert = require('node:assert/strict');
const path = require('node:path');
const { loadSourceModule } = require('./lib/load-source-module.cjs');
const root = path.join(__dirname, '..');
const model = loadSourceModule(path.join(root, 'src/features/boylesLaw/model.js'), path.join(root, 'src'));
const { pressureAt, boyle, gasUseRate, breathCost, gasMinutesRemaining, TOUR_STEPS, MAX_DEPTH, BURST_AT, gateMet, gateParts, localizeStep, depthPhrase } = model;

// Pressure: 1 ATA at the surface, +1 ATA per 10 m of seawater.
assert.equal(pressureAt(0), 1);
assert.equal(pressureAt(10), 2);
assert.equal(pressureAt(30), 4);
assert.equal(pressureAt(-5), pressureAt(0), 'Depth is clamped at the surface.');
assert.equal(pressureAt(999), pressureAt(MAX_DEPTH), 'Depth is clamped at MAX_DEPTH.');

// Boyle: a surface-filled space halves by 10 m and the volume tracks 1 / P.
assert.ok(Math.abs(boyle(10).volume - 0.5) < 1e-9, 'Surface fill is half size at 10 m.');
assert.equal(boyle(0, 1).volume, 1);
for (let d = 1; d <= MAX_DEPTH; d++) {
  assert.ok(boyle(d).volume < boyle(d - 1).volume, 'Volume decreases monotonically with depth.');
  assert.ok(boyle(d).overExpansion === 0, 'A surface fill never overexpands at depth.');
}

// Seal gas at depth, then ascend: it must overexpand past a surface fill.
const sealDepth = 18;
const sealedAtm = boyle(sealDepth).pressure; // "fully inflate here"
assert.ok(boyle(sealDepth, sealedAtm).volume - 1 < 1e-9, 'Freshly sealed gas is ~full size at the seal depth.');
assert.ok(boyle(0, sealedAtm).volume > 1.5, 'Sealed-at-depth gas overexpands on the way to the surface.');
assert.ok(boyle(6, sealedAtm).overExpansion > 0, 'Overexpansion is flagged before reaching the surface.');

// Burst threshold: gas sealed at 16 m reaches BURST_AT before the surface but
// is still intact at the seal depth.
assert.ok(BURST_AT > 1.5 && BURST_AT < 3);
const tourSeal = 2.6; // matches the sealed-gas tour steps (~16 m)
assert.ok(boyle(16, tourSeal).volume < BURST_AT, 'Sealed gas is intact at the depth it was sealed.');
assert.ok(boyle(0, tourSeal).volume >= BURST_AT, 'Sealed gas passes the burst threshold before the surface.');

// Breathing: consumption scales with ambient pressure.
assert.equal(gasUseRate(20), 3);
assert.ok(breathCost(20) > breathCost(0) * 2.9 && breathCost(20) < breathCost(0) * 3.1);
assert.ok(gasMinutesRemaining(0, 100) > gasMinutesRemaining(30, 100) * 3.9, 'A full tank lasts ~4x longer at the surface than at 30 m.');
assert.equal(gasMinutesRemaining(10, 0), 0);

// Guided tour is well-formed.
assert.ok(TOUR_STEPS.length >= 6);
assert.equal(TOUR_STEPS[0].kind, 'info');
assert.ok(TOUR_STEPS[TOUR_STEPS.length - 1].isLast);
// The hand-off step must not yank the student into a different mode.
assert.equal(TOUR_STEPS[TOUR_STEPS.length - 1].mode, TOUR_STEPS[TOUR_STEPS.length - 2].mode, 'Closing step keeps the current mode.');
const FOCUS = ['none', 'depth', 'context', 'mode', 'depth+context', 'all'];
const GATE_TYPES = ['depthAtLeast', 'depthAtMost', 'sealed', 'burstSeen', 'mode', 'breaths', 'breathsShallow', 'breathsDeep', 'tankAtMost'];
let actionCount = 0;
let maxClickThroughRun = 0;
let run = 0;
for (const step of TOUR_STEPS) {
  assert.ok(['info', 'question', 'action'].includes(step.kind));
  assert.ok(['compression', 'breathing'].includes(step.mode));
  assert.ok(step.depth >= 0 && step.depth <= MAX_DEPTH);
  assert.ok(FOCUS.includes(step.focus), `Every tour step needs a valid focus (got ${step.focus}).`);
  if (step.kind === 'question') {
    assert.equal(step.choices.length, 2);
    assert.ok(step.correctIndex === 0 || step.correctIndex === 1);
    assert.ok(step.feedbackRight && step.feedbackWrong);
  }
  if (step.kind === 'action') {
    actionCount++;
    assert.ok(step.task && step.task.length > 4, 'Action steps need a task string.');
    const parts = gateParts(step);
    assert.ok(parts.length >= 1, 'Action steps need at least one gate part.');
    for (const part of parts) {
      assert.ok(GATE_TYPES.includes(part.type), `Unknown gate type ${part.type}.`);
      assert.ok(part.label, 'Every gate part needs a checklist label.');
    }
    // A fresh start state must not already satisfy the gate, unless the only
    // requirement is "come back to the surface".
    const fresh = { depth: 0, mode: 'compression', gasAtm: 1, volume: 1, burst: false, burstSeen: false, tankPercent: 100, breaths: 0, breathsShallow: 0, breathsDeep: 0 };
    if (!parts.every((p) => p.type === 'depthAtMost')) {
      assert.ok(!gateMet(step, fresh), `Action step "${step.title}" is already complete on entry.`);
    }
  }
  // No "slideshow": never two plain read-and-click 'info' steps in a row.
  if (step.kind === 'info' && !step.isLast) { run++; maxClickThroughRun = Math.max(maxClickThroughRun, run); } else { run = 0; }
}
assert.ok(actionCount >= 5, 'The tour should be mostly hands-on (>=5 action steps).');
assert.ok(maxClickThroughRun <= 1, 'No two consecutive explain-only steps (avoids a slideshow feel).');

// Gate evaluation behaves.
const seal = TOUR_STEPS.find((s) => gateParts(s).some((p) => p.type === 'sealed'));
assert.ok(!gateMet(seal, { gasAtm: 1, depth: 16, mode: 'compression', volume: 1, burst: false, burstSeen: false, tankPercent: 100, breaths: 0 }));
assert.ok(gateMet(seal, { gasAtm: 2.6, depth: 16, mode: 'compression', volume: 1, burst: false, burstSeen: false, tankPercent: 100, breaths: 0 }));
// The breathing section contrasts shallow vs. deep gas use — both steps exist,
// and each only counts breaths taken at the right depth.
const shallow = TOUR_STEPS.find((s) => gateParts(s).some((p) => p.type === 'breathsShallow'));
const deep = TOUR_STEPS.find((s) => gateParts(s).some((p) => p.type === 'breathsDeep'));
assert.ok(shallow && deep, 'Breathing section needs a shallow step and a deep step.');
assert.ok(TOUR_STEPS.indexOf(shallow) < TOUR_STEPS.indexOf(deep), 'Shallow comes before deep.');
assert.ok(!gateMet(shallow, { breathsShallow: 2, breathsDeep: 9 }), 'Deep breaths do not satisfy the shallow step.');
assert.ok(gateMet(shallow, { breathsShallow: 3, breathsDeep: 0 }));
assert.ok(!gateMet(deep, { breathsDeep: 2, breathsShallow: 9 }), 'Shallow breaths do not satisfy the deep step.');
assert.ok(gateMet(deep, { breathsDeep: 3 }));

// A surface breath really is cheaper than a deep one.
assert.ok(breathCost(2) * 3 < breathCost(20) * 3 * 0.6, 'Three shallow breaths cost well under three deep ones.');

// Guided-flow copy follows the diver's unit setting.
assert.equal(depthPhrase(10, 'm'), '10 m (33 ft)');
assert.equal(depthPhrase(10, 'ft'), '33 ft (10 m)');
for (const raw of TOUR_STEPS) {
  const hadToken = /\{\d+(?:\.\d+)?m\}/.test(JSON.stringify(raw));
  for (const u of ['m', 'ft']) {
    const blob = JSON.stringify(localizeStep(raw, u));
    assert.doesNotMatch(blob, /\{\d+(?:\.\d+)?m\}/, `Unexpanded depth token in step "${raw.title}" (${u}).`);
    if (hadToken && u === 'ft') assert.match(blob, / ft/, `Imperial copy for "${raw.title}" should read in feet.`);
  }
}

console.log('Native Boyle’s Law model checks passed.');
