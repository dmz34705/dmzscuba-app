// "Build a scuba unit" — a guided assembly walkthrough. The student drags the
// real pieces together (BCD onto the cylinder, first stage onto the valve, LP
// inflator hose to the BCD, weights into the pockets) and taps parts to learn
// what they are, in the order you'd actually rig a unit on the dock.

export const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));

// Part id -> label + one-line explanation, shown in the ribbon when tapped.
export const PARTS = {
  valve: { name: 'Tank valve', blurb: 'Seals the cylinder and gives the regulator something to attach to.' },
  valveOutlet: { name: 'Valve outlet', blurb: 'The opening the regulator seals against — it has to face the back of your head once the BCD is on.' },
  handWheel: { name: 'Hand wheel', blurb: 'Opens and closes the cylinder. Open it slowly and all the way before the dive.' },
  oring: { name: 'Yoke O-ring', blurb: 'Seats in the valve face on a yoke valve. Missing or nicked = a leak, or a free-flow at the surface.' },

  bladder: { name: 'Air bladder', blurb: 'The air cell you inflate to float and deflate to sink.' },
  inflator: { name: 'Inflator (LPI)', blurb: 'Low-pressure inflator: one button adds tank air, the other vents it. The mouthpiece also inflates it orally.' },
  corrugatedHose: { name: 'Inflate / deflate hose', blurb: 'The wide corrugated hose from the left shoulder down to the bladder.' },
  dumpShoulder: { name: 'Shoulder dump valve', blurb: 'Pull to vent air fast when you are upright — it sits at the high point.' },
  dumpRear: { name: 'Rear / kidney dump', blurb: 'Vents air when you are head-down or horizontal. Always dump from whichever valve is highest.' },
  camStrap: { name: 'Cam / tank strap', blurb: 'The buckled band that clamps the cylinder to the BCD. Wet it first so it does not loosen as it soaks.' },
  locatorStrap: { name: 'Tank locator strap', blurb: 'Loops over the valve to set how high the BCD rides, so the valve clears the back of your head.' },
  weightPocket: { name: 'Removable weight pocket', blurb: 'Slides out and ditches in an emergency. One on each side.' },
  trimPocket: { name: 'Fixed trim pocket', blurb: 'Non-releasable, up near the cam strap. A little weight here stops the tank pulling you head-down.' },

  firstStage: { name: 'First stage', blurb: 'Drops cylinder pressure (3000+ psi) to a steady ~130–145 psi that the second stages breathe from.' },
  primary: { name: 'Primary second stage', blurb: 'What you breathe from. The purge button floods it with air to clear water.' },
  octo: { name: 'Alternate / octopus', blurb: 'Backup second stage for an out-of-air buddy. Bright yellow, longer hose, clipped where it is easy to grab.' },
  hpHose: { name: 'High-pressure hose', blurb: 'Feeds full cylinder pressure to the console gauge.' },
  lpiHose: { name: 'LP inflator hose', blurb: 'Low-pressure feed to the BCD inflator. Connects with a quick-disconnect collar.' },
  spg: { name: 'Pressure gauge (SPG)', blurb: 'How much gas you have left. Check it before the dive and often during.' },
  depthGauge: { name: 'Depth gauge', blurb: 'Your current depth, usually with a max-depth pointer.' },
  compass: { name: 'Compass', blurb: 'Heading — for navigating back to your exit.' },
};

// section: 1 cylinder · 2 BCD · 3 mount · 4 regulator · 5 weights · 6 recap
export const STEPS = [
  {
    id: 'intro', section: 1, kind: 'info',
    title: 'Build a scuba unit',
    body: 'Cylinder, BCD, regulator, weights — in that order. Start with the tank standing where you can reach it.',
  },
  {
    id: 'valve', section: 1, kind: 'identify',
    title: 'The tank valve',
    body: 'Tap each part of the valve.',
    identify: ['valve', 'valveOutlet', 'handWheel'],
  },
  {
    id: 'valveType', section: 1, kind: 'choice',
    title: 'Valve connection',
    body: 'How does the regulator attach? Pick the valve you have.',
    choice: {
      key: 'valveType',
      options: [
        { value: 'yoke', label: 'Yoke (A-clamp)', note: 'The reg clamps over the valve. Needs an O-ring seated in the valve face.' },
        { value: 'din', label: 'DIN', note: 'The reg threads into the valve. The O-ring lives on the first stage instead.' },
        { value: 'hybrid', label: 'Pro / hybrid', note: 'A removable insert lets a DIN valve take a yoke reg. Rig it like yoke here.' },
      ],
    },
  },
  {
    id: 'oring', section: 1, kind: 'identify',
    title: 'Check the O-ring',
    body: 'A yoke reg seals on this O-ring in the valve face. Tap it, and always check it is there and undamaged.',
    identify: ['oring'],
    showIf: (c) => c.valveType !== 'din',
  },
  {
    id: 'wheelNote', section: 1, kind: 'info',
    title: 'Leave the tank closed',
    body: 'You open the hand wheel at the very end — once everything is connected and you have watched the gauge.',
  },

  {
    id: 'bcdIntro', section: 2, kind: 'info',
    title: 'The BCD',
    body: 'The buoyancy compensator: a harness, an air bladder, and the parts to fill it, vent it, and carry the tank.',
  },
  {
    id: 'bcdAir', section: 2, kind: 'identify',
    title: 'Bladder & inflator',
    body: 'Tap the parts that move air.',
    identify: ['bladder', 'inflator', 'corrugatedHose'],
  },
  {
    id: 'bcdDumps', section: 2, kind: 'identify',
    title: 'Dump valves',
    body: 'Tap both. Vent from whichever one is highest at the time.',
    identify: ['dumpShoulder', 'dumpRear'],
  },
  {
    id: 'bcdStraps', section: 2, kind: 'identify',
    title: 'Tank straps',
    body: 'Tap the cam strap and the locator strap.',
    identify: ['camStrap', 'locatorStrap'],
  },
  {
    id: 'bcdPockets', section: 2, kind: 'identify',
    title: 'Weight pockets',
    body: 'Two removable pockets, plus fixed trim pockets by the cam strap. Tap each type.',
    identify: ['weightPocket', 'trimPocket'],
  },

  {
    id: 'mountSlide', section: 3, kind: 'assemble',
    title: 'Slide the BCD on',
    body: 'Wet the cam strap, then drag the BCD onto the cylinder.',
    drag: { piece: 'bcd', target: 'tank', milestone: 'bcdOn' },
    task: 'Drag the BCD onto the tank',
    done: 'On. Now set the direction and the height.',
    highlight: ['scene'],
  },
  {
    id: 'mountOrient', section: 3, kind: 'choice',
    title: 'Which way round?',
    body: 'Wearing it, the valve opening has to reach the back of your head.',
    choice: {
      key: 'orientation',
      correct: 'back',
      options: [
        { value: 'back', label: 'Opening toward my back' },
        { value: 'front', label: 'Opening toward my front' },
      ],
      feedbackRight: 'Right — the reg hose curves over your shoulder from behind.',
      feedbackWrong: 'Turn it around. Facing forward the hose can’t reach your mouth and the valve digs into your neck.',
    },
  },
  {
    id: 'mountHeight', section: 3, kind: 'info',
    title: 'Height, then cinch',
    body: 'Locator strap over the valve, then pull the cam strap tight. The valve sits just below the back of your head — high enough to reach the reg, low enough not to clonk you.',
  },

  {
    id: 'regIntro', section: 4, kind: 'info',
    title: 'The regulator set',
    body: 'One first stage on the tank; hoses out to what you breathe from and what you read.',
  },
  {
    id: 'regStages', section: 4, kind: 'identify',
    title: 'The stages',
    body: 'Tap the first stage and both second stages.',
    identify: ['firstStage', 'primary', 'octo'],
  },
  {
    id: 'regHoses', section: 4, kind: 'identify',
    title: 'The hoses',
    body: 'Tap the high-pressure hose and the LP inflator hose.',
    identify: ['hpHose', 'lpiHose'],
  },
  {
    id: 'regAttach', section: 4, kind: 'assemble',
    title: 'Attach the first stage',
    body: 'Drag the first stage onto the valve. Yoke: hand-tighten the screw, snug not cranked. DIN: thread it in until firm. Never a wrench.',
    drag: { piece: 'firstStage', target: 'valve', milestone: 'regOn' },
    task: 'Drag the first stage onto the valve',
    done: 'Sealed. Point the second stages away before you pressurise it.',
  },
  {
    id: 'regLpi', section: 4, kind: 'assemble',
    title: 'Connect the inflator',
    body: 'Drag the LP inflator hose to the BCD inflator: pull the collar back, push on, release, then tug to check it locked.',
    drag: { piece: 'lpiHose', target: 'inflator', milestone: 'lpiOn' },
    task: 'Connect the LPI hose to the inflator',
    done: 'Locked. Give it a tug every single time.',
  },
  {
    id: 'regRoute', section: 4, kind: 'assemble',
    title: 'Route the hoses',
    body: 'Primary over your right shoulder, octo in the chest triangle on a clip, console tucked left. Nothing dangling.',
    drag: { piece: 'hoses', target: 'straps', milestone: 'hosesRouted', tap: true },
    task: 'Tap to tuck the hoses under the straps',
    done: 'Streamlined — no snag or drag.',
  },
  {
    id: 'regConsole', section: 4, kind: 'identify',
    title: 'The console',
    body: 'A three-gauge console. Tap each dial.',
    identify: ['spg', 'depthGauge', 'compass'],
  },

  {
    id: 'wtLoad', section: 5, kind: 'assemble',
    title: 'Load the weight pockets',
    body: 'Drag a weight block into each removable pocket.',
    drag: { piece: 'weight', target: 'weightPocket', milestone: 'weights', need: 2 },
    task: 'Fill both removable pockets',
    done: 'In and clipped. You’d ditch these first in an emergency.',
  },
  {
    id: 'wtTrim', section: 5, kind: 'info',
    title: 'Trim weight',
    body: 'A little weight in the fixed pockets by the cam strap keeps the tank from pulling you head-down.',
  },
  {
    id: 'tankOn', section: 5, kind: 'assemble',
    title: 'Open the tank & check',
    body: 'Open the hand wheel slowly, all the way. Watch the SPG jump up and hold steady, listen for leaks, then breathe off both second stages while the needle stays put.',
    drag: { piece: 'handWheel', target: 'handWheel', milestone: 'tankOn', tap: true },
    task: 'Tap the hand wheel to open the tank',
    done: 'Gauge is up and steady. The unit is ready to kit up.',
  },

  {
    id: 'recap', section: 6, kind: 'recap', isLast: true,
    title: 'The setup sequence',
    body: 'You can now build a scuba unit start to finish:',
  },
];

export const RECAP = [
  'Stand the cylinder up; check the valve — and, on yoke, the O-ring',
  'Slide the BCD on with the valve opening toward your back',
  'Set the height, then cinch the cam strap tight',
  'Attach the first stage to the valve — snug, no tools',
  'Connect the LP inflator hose to the BCD, and tug it',
  'Route every hose so nothing dangles',
  'Load your weights — removable pockets and trim',
  'Open the tank, check the SPG, breathe-test both regulators',
];

export function visibleSteps(choices = {}) {
  return STEPS.filter((s) => !s.showIf || s.showIf(choices));
}

export function gateMet(step, ctx) {
  if (!step) return true;
  switch (step.kind) {
    case 'identify':
      return (step.identify || []).every((id) => ctx.identified.has(id));
    case 'choice': {
      const chosen = ctx.choices[step.choice.key];
      if (chosen == null) return false;
      return step.choice.correct ? chosen === step.choice.correct : true;
    }
    case 'assemble': {
      const m = ctx.asm[step.drag.milestone];
      return step.drag.need != null ? (m || 0) >= step.drag.need : Boolean(m);
    }
    default:
      return true;
  }
}

// Ribbon checklist for identify steps: one row per part, ticked once tapped.
export function identifyProgress(step, identified) {
  if (step?.kind !== 'identify') return [];
  return (step.identify || []).map((id) => ({ id, label: PARTS[id].name, done: identified.has(id) }));
}
