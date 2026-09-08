// Teaching model for the Boyle's Law lab. Mirrors the web applet
// (dmz34705/DMZScuba.com, pages/training/interactive-tools/boyles-law-demo.html):
// seawater pressure rises ~1 ATA every 10 m (33 ft), and a flexible gas space
// obeys P1 * V1 = P2 * V2, so its volume tracks 1 / P.
export const MAX_DEPTH = 40; // metres; matches the depth slider range
// A trapped gas space is treated as rupturing once it reaches this multiple of
// its surface (1x) volume — dramatised for the lab; a real balloon varies.
export const BURST_AT = 2.2;
export const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));

export function pressureAt(depth) {
  return 1 + clamp(depth, 0, MAX_DEPTH) / 10;
}

// gasAtm: how much gas is sealed in the flexible space, expressed as the
// surface volume it would occupy. 1 = filled at the surface; 2 = topped up and
// sealed at 2 ATA; etc. Returned volumes are multiples of one full surface
// balloon.
export function boyle(depth, gasAtm = 1) {
  const pressure = pressureAt(depth);
  const volume = gasAtm / pressure;
  return {
    pressure,
    neutralVolume: 1 / pressure, // a space that was exactly full at the surface
    volume,
    overExpansion: Math.max(0, volume - 1),
  };
}

// Same breathing pattern -> gas molecules used per minute scale with ambient
// pressure. Multiple of the surface consumption rate.
export function gasUseRate(depth) {
  return pressureAt(depth);
}

// One tap = one relaxed breath cycle. Exaggerated for the lab so a few taps
// visibly move the tank: a surface breath is ~3% of a full tank, and deeper the
// same breath costs proportionally more (3 ATA -> ~9%).
export const SURFACE_BREATH_COST = 3; // percent of a full tank
export function breathCost(depth) {
  return SURFACE_BREATH_COST * gasUseRate(depth);
}

// Minutes of gas left at the current depth for a resting diver.
const SURFACE_MINUTES_FULL = 75; // resting AL80 at the surface
export function gasMinutesRemaining(depth, tankPercent) {
  return ((clamp(tankPercent, 0, 100) / 100) * SURFACE_MINUTES_FULL) / gasUseRate(depth);
}

export function depthLabel(depth, unit = 'm') {
  if (unit === 'ft') return `${Math.round(depth * 3.28084)} ft`;
  return `${Math.round(depth)} m`;
}

// "18 m (59 ft)" or, in imperial, "59 ft (18 m)" — the diver's chosen unit
// leads, the other follows in parentheses.
export function depthPhrase(meters, unit = 'm') {
  const m = `${Math.round(meters)} m`;
  const ft = `${Math.round(meters * 3.28084)} ft`;
  return unit === 'ft' ? `${ft} (${m})` : `${m} (${ft})`;
}

// Guided-flow copy stores depths as `{18m}` tokens; expand them to the active
// unit at render time.
export function fillStepText(text, unit = 'm') {
  return typeof text === 'string'
    ? text.replace(/\{(\d+(?:\.\d+)?)m\}/g, (_, n) => depthPhrase(Number(n), unit))
    : text;
}

export function localizeStep(step, unit = 'm') {
  if (!step) return step;
  const f = (s) => fillStepText(s, unit);
  return {
    ...step,
    title: f(step.title),
    body: f(step.body),
    task: f(step.task),
    done: f(step.done),
    feedbackRight: f(step.feedbackRight),
    feedbackWrong: f(step.feedbackWrong),
    gate: step.gate
      ? { ...step.gate, parts: (step.gate.parts || []).map((p) => ({ ...p, label: f(p.label) })) }
      : step.gate,
  };
}

// --- Guided walkthrough -----------------------------------------------------
//
// Step kinds:
//   'info'     — a short read, then Next (kept to the open + close only).
//   'question' — Next locks until an answer is picked.
//   'action'   — Next locks until the student completes `gate` on the real
//                controls. `task` is the imperative shown as a checklist in the
//                ribbon; `highlight` names what glows until the gate is met —
//                'depth' / 'context' / 'mode' controls, or 'law' / 'gas' for
//                the on-scene readout.
//
// `focus` still governs which console controls are even enabled ('none',
// 'depth', 'context', 'mode', 'depth+context', 'all'). depth is in metres.
//
// A gate is { parts: [ { type, value, label } ] }; every part must be true.
// ctx = { depth, mode, gasAtm, volume, burst, burstSeen, tankPercent, breaths }.

function evalGatePart(part, ctx) {
  switch (part.type) {
    case 'depthAtLeast': return ctx.depth >= part.value - 0.001;
    case 'depthAtMost': return ctx.depth <= part.value + 0.001;
    case 'sealed': return ctx.gasAtm > 1.5;
    case 'burstSeen': return Boolean(ctx.burstSeen);
    case 'mode': return ctx.mode === part.value;
    case 'breaths': return ctx.breaths >= part.value;
    case 'breathsShallow': return (ctx.breathsShallow || 0) >= part.value;
    case 'breathsDeep': return (ctx.breathsDeep || 0) >= part.value;
    case 'tankAtMost': return ctx.tankPercent <= part.value;
    default: return true;
  }
}

export function gateParts(step) {
  return step && step.gate && Array.isArray(step.gate.parts) ? step.gate.parts : [];
}

// Progress for the ribbon checklist: each part with whether it is satisfied.
export function gateProgress(step, ctx) {
  return gateParts(step).map((part) => ({ label: part.label, done: evalGatePart(part, ctx) }));
}

export function gateMet(step, ctx) {
  return gateParts(step).every((part) => evalGatePart(part, ctx));
}

export const TOUR_STEPS = [
  {
    kind: 'info', focus: 'none',
    title: 'Pressure and gas volume',
    body: 'Pressure rises about 1 ATA every {10m}. A sealed gas space shrinks going down and grows coming up. The dashed ring marks its surface size — keep an eye on it.',
    depth: 0, mode: 'compression', gasAtm: 1,
  },
  {
    kind: 'question', focus: 'none',
    tag: 'Quick guess',
    title: 'Before we descend',
    body: 'The diver takes a surface-filled balloon down to {10m}. What happens to it?',
    choices: ['It shrinks', 'It grows'], correctIndex: 0,
    feedbackRight: 'Right — double the pressure, half the size.',
    feedbackWrong: 'It shrinks — at {10m} pressure is about 2 ATA, so the volume halves.',
    depth: 0, mode: 'compression', gasAtm: 1,
  },
  {
    kind: 'action', focus: 'depth',
    title: 'Take it down',
    body: 'Drop the balloon to {10m}. Watch the readout in the corner run P₁V₁ = P₂V₂ as you go.',
    task: 'Descend to {10m} or deeper',
    gate: { parts: [{ type: 'depthAtLeast', value: 10, label: 'Reach {10m}' }] },
    done: 'Half the surface size — the readout shows V₂ ≈ 0.50 L.',
    highlight: ['depth', 'law'],
    depth: 0, mode: 'compression', gasAtm: 1,
  },
  {
    kind: 'action', focus: 'depth',
    title: 'Now bring it back up',
    body: 'Return to the surface and watch it refill the dashed ring. Notice where the growth happens.',
    task: 'Ascend to {2m} or shallower',
    gate: { parts: [{ type: 'depthAtMost', value: 2, label: 'Reach the surface' }] },
    done: 'Most of that expansion came in the last {10m} — the shallow part of an ascent moves the most gas.',
    highlight: ['depth', 'law'],
    depth: 10, mode: 'compression', gasAtm: 1,
  },
  {
    kind: 'action', focus: 'context',
    title: 'Seal gas at depth',
    body: 'You are at {16m}. Top the balloon up here and seal it — now it carries more gas than a surface fill.',
    task: 'Tap “Fully inflate here”',
    gate: { parts: [{ type: 'sealed', label: 'Balloon sealed at depth' }] },
    done: 'Sealed at ~2.6 ATA. Watch what that does on the way up.',
    highlight: ['context'],
    depth: 16, mode: 'compression', gasAtm: 1,
  },
  {
    kind: 'question', focus: 'none',
    tag: 'Check yourself',
    title: 'Heading up',
    body: 'That sealed balloon is carried up toward the surface. The trapped gas will…',
    choices: ['Expand', 'Stay the same'], correctIndex: 0,
    feedbackRight: 'Exactly — falling pressure lets sealed gas expand, and it can rupture.',
    feedbackWrong: 'It expands — as pressure drops on the way up, sealed gas grows.',
    depth: 16, mode: 'compression', gasAtm: 2.6,
  },
  {
    kind: 'action', focus: 'depth',
    title: 'Ascend with it sealed',
    body: 'Bring the sealed balloon up. Watch it push past the dashed ring — past 2.2× its surface size it ruptures. A lung that can’t vent tears the same way.',
    task: 'Ascend until the balloon bursts',
    gate: { parts: [{ type: 'burstSeen', label: 'Balloon burst' }] },
    done: 'That is why you never hold your breath on ascent — keep breathing so expanding gas escapes.',
    highlight: ['depth'],
    depth: 16, mode: 'compression', gasAtm: 2.6,
  },
  {
    kind: 'action', focus: 'mode',
    title: 'Switch to Breathing',
    body: 'Same law, but now the gas space is your tank instead of a balloon.',
    task: 'Tap “Breathing” in the dock',
    gate: { parts: [{ type: 'mode', value: 'breathing', label: 'Breathing mode on' }] },
    highlight: ['mode'],
    depth: 6, mode: 'compression',
  },
  {
    kind: 'action', focus: 'context',
    title: 'Breathe near the surface',
    body: 'You are just under the surface. Take 3 breaths here and watch the tank — a breath up top is cheap.',
    task: 'Take 3 breaths near the surface',
    gate: { parts: [{ type: 'breathsShallow', value: 3, label: 'Take 3 breaths (you are at {2m})' }] },
    done: 'The tank barely moved. Now do the same thing deep.',
    highlight: ['context', 'gas'],
    depth: 2, mode: 'breathing',
  },
  {
    kind: 'action', focus: 'depth+context',
    title: 'Now breathe deep',
    body: 'Drop past {18m} and take 3 more breaths — the same size breaths, but watch how much faster the tank falls.',
    task: 'Descend past {18m}, then take 3 breaths there',
    gate: { parts: [{ type: 'breathsDeep', value: 3, label: 'Take 3 breaths past {18m}' }] },
    done: 'Three identical breaths, roughly triple the gas gone. Depth is the multiplier.',
    highlight: ['depth', 'context', 'gas'],
    depth: 6, mode: 'breathing',
  },
  {
    kind: 'question', focus: 'none',
    tag: 'Review',
    title: 'Gas at {20m}',
    body: 'At {20m}, the same breathing pattern uses about…',
    choices: ['3x the surface rate', 'The same as the surface'], correctIndex: 0,
    feedbackRight: 'Right — ~3 ATA means ~3x the gas per minute.',
    feedbackWrong: 'About 3x — pressure at {20m} is ~3 ATA, and gas use scales with it.',
    depth: 20, mode: 'breathing',
  },
  {
    kind: 'info', focus: 'all',
    title: 'That’s the whole picture',
    body: 'Explore on your own — change depth and take breaths here, or switch to the balloon and seal gas at depth.',
    depth: 20, mode: 'breathing', isLast: true,
  },
];
