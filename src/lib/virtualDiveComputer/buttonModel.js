import { DEVICE_SCREENS, FIELD_STEPPERS, LEAD_IN_TARGETS } from './screenGraph';

// What the two physical buttons do on the screen currently shown. This is the
// single source of truth behind the on-screen button legend: it mirrors the
// branches in stateMachine.js so the strip never drifts from real behaviour.
//
// Every entry is a short verb phrase, or null when that press does nothing on
// this screen. `both` is the context-independent two-button return-home hold
// and is the same everywhere on the surface.

const HOME = 'Home screen';
const BOTH_HOLD = 'Hold ADV + SEL together to jump home';

function diveButtons(display) {
  const screenId = display.screenId;
  if (screenId === DEVICE_SCREENS.DIVE_WARNING) {
    return {
      adv: { tap: null, hold: null },
      sel: { tap: 'Acknowledge warning', hold: 'Acknowledge warning' },
      both: null,
    };
  }
  const timerVisible = Boolean(display.timer && display.timer.visible);
  const timerRunning = Boolean(display.timer && display.timer.running);
  return {
    adv: { tap: 'Next data page', hold: timerVisible ? 'Hide timer' : 'Main page, then timer' },
    sel: { tap: timerVisible ? (timerRunning ? 'Stop timer' : 'Start timer') : null, hold: null },
    both: null,
  };
}

export function describeButtons(display) {
  const screenId = display.screenId;

  // Underwater / dive-mode screens are all `dive.*`.
  if (screenId.startsWith('dive.')) return diveButtons(display);

  // Field-stepper settings screens + the gas edit screens.
  const stepper = FIELD_STEPPERS[screenId];
  const gasEdit = Boolean(display.fieldStepper) && screenId.startsWith('setGas.') && screenId !== DEVICE_SCREENS.SET_GAS_LEAD_IN;
  if (stepper || gasEdit) {
    const kind = stepper ? stepper.kind : display.fieldStepper.kind;
    return {
      adv: {
        tap: kind === 'toggle' ? 'Switch value' : 'Change value up',
        hold: kind === 'range' ? 'Change value down' : 'Switch value',
      },
      sel: { tap: 'Save and continue', hold: 'Cancel, no change' },
      both: BOTH_HOLD,
    };
  }

  // Logbook: the one place in the whole interface where ADV means "back".
  if ([DEVICE_SCREENS.LOG_DATA_1, DEVICE_SCREENS.LOG_DATA_2, DEVICE_SCREENS.LOG_DATA_3, DEVICE_SCREENS.LOG_DATA_4].includes(screenId)) {
    return {
      adv: { tap: 'Back to dive list', hold: 'Back to dive list' },
      sel: { tap: 'Next data page', hold: null },
      both: BOTH_HOLD,
    };
  }
  if (screenId === DEVICE_SCREENS.LOG_PREVIEW) {
    return {
      adv: { tap: 'Next logged dive', hold: 'Exit logbook' },
      sel: { tap: 'Open this dive', hold: null },
      both: BOTH_HOLD,
    };
  }

  // Planner: a live depth stepper.
  if (screenId === DEVICE_SCREENS.PLAN_ACTIVE) {
    return {
      adv: { tap: 'Planned depth deeper', hold: 'Planned depth shallower' },
      sel: { tap: 'Exit planner', hold: 'Exit planner' },
      both: BOTH_HOLD,
    };
  }

  // History detail pages.
  if (screenId === DEVICE_SCREENS.TOTAL_HOURS) {
    return { adv: { tap: 'Back', hold: 'Back' }, sel: { tap: 'Next page', hold: null }, both: BOTH_HOLD };
  }
  if (screenId === DEVICE_SCREENS.EXTREMES) {
    return { adv: { tap: 'Back', hold: 'Back' }, sel: { tap: 'Back', hold: null }, both: BOTH_HOLD };
  }

  // Serial-number screen closes the surface loop back to home on SEL.
  if (screenId === DEVICE_SCREENS.SN) {
    return { adv: { tap: 'Next screen', hold: HOME }, sel: { tap: 'Home screen', hold: null }, both: BOTH_HOLD };
  }

  // Surface lead-ins that open a submenu or flow.
  if (LEAD_IN_TARGETS[screenId]) {
    return { adv: { tap: 'Next screen', hold: HOME }, sel: { tap: 'Open menu', hold: null }, both: BOTH_HOLD };
  }

  // Home + read-only ALT / FLY-SAT surface screens.
  return { adv: { tap: 'Next screen', hold: HOME }, sel: { tap: null, hold: null }, both: BOTH_HOLD };
}
