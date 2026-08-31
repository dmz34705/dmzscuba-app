import { DEVICE_SCREENS } from '../../../lib/virtualDiveComputer';

export const GUIDED_DIVE_ACTIONS = Object.freeze({
  CONTINUE: 'continue',
  OPEN_PRACTICE: 'openPractice',
});

// Only pause the student for a takeaway when the step teaches a meaningful
// concept. Navigation-only steps should flow directly into the next task.
export const GUIDED_REVIEW_STEPS = new Set([
  'surface-ready',
  'set-day',
  'activate-dive',
  'accumulate-time',
  'explain-safety-stop',
  'surface',
  'planner-read',
  'deep-stop-enable',
  'deep-stop-descent',
  'deep-stop-complete',
  'deep-stop-safety-stop',
  'deep-stop-surface',
  'log-latest-page-3',
  'log-earlier-page-3',
  'quiz-intro',
  'quiz-bluetooth',
  'quiz-log-po2',
  'quiz-dive',
]);

const SET_TIME_SCREENS = new Set([
  DEVICE_SCREENS.DATE_FORMAT,
  DEVICE_SCREENS.HOUR_FORMAT,
  DEVICE_SCREENS.SET_HOUR,
  DEVICE_SCREENS.SET_MINUTE,
  DEVICE_SCREENS.SET_YEAR,
  DEVICE_SCREENS.SET_MONTH,
  DEVICE_SCREENS.SET_DAY,
]);

function sameDate(dateTime, actualTime) {
  return dateTime.year === actualTime.getFullYear()
    && dateTime.month === actualTime.getMonth() + 1
    && dateTime.day === actualTime.getDate();
}

function withinFiveMinutes(dateTime, actualTime) {
  const deviceMinutes = dateTime.hour * 60 + dateTime.minute;
  const actualMinutes = actualTime.getHours() * 60 + actualTime.getMinutes();
  const difference = Math.abs(deviceMinutes - actualMinutes);
  return Math.min(difference, 1440 - difference) <= 5;
}

function loggedDiveTwoEntry(device) {
  return device.logbook.entries.find((entry) => entry.diveNumber === 2) || null;
}

// The student reads HIGHEST PO2 straight off LOG DATA 3, which renders the
// stored value at two decimals - so the check accepts the same two-decimal
// reading (a hair of tolerance covers the .toFixed rounding boundary).
function loggedDivePo2Matches(device, answer) {
  const diveTwo = loggedDiveTwoEntry(device);
  const entered = Number.parseFloat(String(answer ?? '').trim().replace(',', '.'));
  if (!diveTwo || !Number.isFinite(entered)) return false;
  return Math.abs(entered - Number(diveTwo.highestPpO2.toFixed(2))) < 0.005;
}

export function loggedDiveTwoPo2Answer(device) {
  const diveTwo = loggedDiveTwoEntry(device);
  return diveTwo ? diveTwo.highestPpO2.toFixed(2) : null;
}

// Scenario 3 is graded against what the computer actually did on the dive the
// student just ran: it must have lasted at least ten minutes, and every stop
// the computer activated must have been completed. A stop that never activates
// is never required. `observation` is accumulated live by the lesson hook.
export function qualifyingQuizDive(observation) {
  if (!observation || observation.lifecycle !== 'postDive') return false;
  const longEnough = observation.maxRuntimeSeconds >= 600;
  const deepStopHonored = !observation.deepStopActivated || observation.deepStopCompleted;
  const safetyStopHonored = !observation.safetyStopActivated || observation.safetyStopCompleted;
  return longEnough && deepStopHonored && safetyStopHonored;
}

export const GUIDED_DIVE_STEPS = Object.freeze([
  {
    action: GUIDED_DIVE_ACTIONS.CONTINUE,
    actionLabel: 'Start the guided tour',
    body: 'A recreational dive computer is a small environmental instrument. It reads depth and time, estimates nitrogen loading, shows no-decompression time, and warns you when your ascent or decompression obligations need attention.',
    eyebrow: 'WHAT IS THIS?',
    focus: ['housing', 'display', 'buttons'],
    id: 'introduction',
    instruction: 'We will identify the LCD, protective bezel, and the ADV and SEL buttons together. When you are ready, press START THE GUIDED TOUR.',
    title: 'Meet your dive computer.',
  },
  {
    action: GUIDED_DIVE_ACTIONS.CONTINUE,
    actionLabel: 'Find SET TIME',
    body: 'ADV is the computer’s scroll button: each short press advances one screen through the surface menu. SEL is the select button—it opens the highlighted menu or accepts a setting.',
    completionBody: 'We used ADV to scroll through the surface menu until SET TIME appeared. This showed how ADV moves through menus and how the computer presents the next available choice.',
    eyebrow: 'SURFACE MENU',
    focus: ['display', 'leftButton'],
    id: 'surface-ready',
    instruction: 'Short-press the highlighted ADV button until the LCD shows SET TIME.',
    title: 'Learn the surface menu.',
  },
  {
    action: GUIDED_DIVE_ACTIONS.CONTINUE,
    actionLabel: 'Open SET TIME',
    body: 'The time menu contains the display format, clock, and calendar fields. SEL enters the highlighted menu; ADV changes the selected field.',
    completionBody: 'We used SEL to open SET TIME. This showed that SEL enters the highlighted menu or accepts the current selection.',
    eyebrow: 'SET TIME',
    focus: ['display', 'rightButton'],
    id: 'enter-set-time',
    instruction: 'Press the highlighted SEL button to enter SET TIME.',
    title: 'Open the clock settings.',
  },
  {
    action: GUIDED_DIVE_ACTIONS.CONTINUE,
    actionLabel: 'Accept date format',
    body: 'The date format is now being edited. Select accepts the value currently shown and advances to the next field; Advance changes it only if you want a different format.',
    eyebrow: 'CLOCK & CALENDAR · 1 OF 7',
    focus: ['display', 'leftButton', 'rightButton'],
    id: 'set-date-format',
    instruction: 'If the displayed date format is correct, press SEL to keep it. Otherwise, press ADV until the format you want appears, then press SEL.',
    title: 'Choose the date format.',
  },
  {
    action: GUIDED_DIVE_ACTIONS.CONTINUE,
    actionLabel: 'Accept time format',
    body: 'The time format is now being edited. Select saves the shown format and moves to the hour; Advance changes the option instead of moving forward.',
    eyebrow: 'CLOCK & CALENDAR · 2 OF 7',
    focus: ['display', 'leftButton', 'rightButton'],
    id: 'set-hour-format',
    instruction: 'If the displayed time format is correct, press SEL to keep it. Otherwise, press ADV to change it, then press SEL.',
    title: 'Choose the time format.',
  },
  {
    action: GUIDED_DIVE_ACTIONS.CONTINUE,
    actionLabel: 'Set the hour',
    body: 'The hour is now being edited. Use Advance to change the hour one value at a time; use Select to accept the shown hour and progress to minutes.',
    eyebrow: 'CLOCK & CALENDAR · 3 OF 7',
    focus: ['display', 'leftButton', 'rightButton'],
    id: 'set-hour',
    instruction: 'Use ADV until the hour matches the reference clock, then press SEL to save it and move to minutes.',
    title: 'Set the hour.',
  },
  {
    action: GUIDED_DIVE_ACTIONS.CONTINUE,
    actionLabel: 'Set the minute',
    body: 'The minute is now being edited. Advance changes the minute; Select accepts it and progresses to the year.',
    eyebrow: 'CLOCK & CALENDAR · 4 OF 7',
    focus: ['display', 'leftButton', 'rightButton'],
    id: 'set-minute',
    instruction: 'Use ADV until the minutes match the reference clock, then press SEL to save them and move to the year.',
    title: 'Set the minute.',
  },
  {
    action: GUIDED_DIVE_ACTIONS.CONTINUE,
    actionLabel: 'Set the year',
    body: 'The year is now being edited. Advance changes the year; Select accepts the shown year and progresses to the month.',
    eyebrow: 'CLOCK & CALENDAR · 5 OF 7',
    focus: ['display', 'leftButton', 'rightButton'],
    id: 'set-year',
    instruction: 'If the displayed year is correct, press SEL to keep it. Otherwise, press ADV until it matches the reference date, then press SEL.',
    title: 'Set the year.',
  },
  {
    action: GUIDED_DIVE_ACTIONS.CONTINUE,
    actionLabel: 'Set the month',
    body: 'The month is now being edited. Advance changes the month; Select accepts the shown month and progresses to the day.',
    eyebrow: 'CLOCK & CALENDAR · 6 OF 7',
    focus: ['display', 'leftButton', 'rightButton'],
    id: 'set-month',
    instruction: 'Use ADV until the month matches the reference date, then press SEL to save it and move to the day.',
    title: 'Set the month.',
  },
  {
    action: GUIDED_DIVE_ACTIONS.CONTINUE,
    actionLabel: 'Finish the calendar',
    body: 'The day is now being edited. Advance changes the day; Select accepts the shown day and saves the completed clock and calendar.',
    completionBody: 'We set the computer’s clock and calendar and practiced how its controls behave while navigating settings: Advance changes the value being edited, and Select accepts, saves, and progresses to the next field.',
    eyebrow: 'CLOCK & CALENDAR · 7 OF 7',
    focus: ['display', 'leftButton', 'rightButton'],
    id: 'set-day',
    instruction: 'Use ADV until the day matches the reference date, then press SEL to save it and finish the clock and calendar.',
    title: 'Set the day.',
  },
  {
    action: GUIDED_DIVE_ACTIONS.CONTINUE,
    actionLabel: 'Watch the activation',
    body: 'The simulator lets you control the diver’s depth and time while the computer responds to the changing environment. Watch the computer activate automatically when the diver reaches approximately 4–5 ft.',
    eyebrow: 'BEGIN THE DIVE',
    focus: ['water', 'display', 'depth-18', 'simulation-toggle'],
    id: 'go-dive',
    instruction: 'Scroll down to choose the highlighted 59 ft / 18 m target, then press START SIMULATION.',
    title: 'Start a real simulated dive.',
  },
  {
    action: GUIDED_DIVE_ACTIONS.CONTINUE,
    actionLabel: 'Observe the descent',
    body: 'Watch the diver descend and observe the computer turn on at approximately 4–5 ft. As depth increases, notice the NDL decrease and the elapsed dive time advance.',
    completionBody: 'We observed the computer activate at approximately 4–5 ft. As the diver descended, the depth increased, the NDL decreased, and the elapsed dive time advanced.',
    eyebrow: 'AUTOMATIC DIVE MODE',
    focus: ['water', 'display', 'depth', 'ndl', 'time'],
    id: 'activate-dive',
    instruction: 'Watch the computer turn on, then observe the depth, NDL, and elapsed dive time as the diver descends to 59 ft / 18 m.',
    title: 'Observe the computer during descent.',
  },
  {
    action: GUIDED_DIVE_ACTIONS.CONTINUE,
    actionLabel: 'Accelerate the dive',
    body: 'The simulation is already running. Use the 10× or 20× time-acceleration control to make the passage of time easier to observe. The lesson will return the simulator to 1× at ten minutes.',
    completionBody: 'The elapsed dive time is now 10 minutes. Time acceleration is useful for simulating longer dives in a short period while keeping the lesson moving.',
    eyebrow: 'TIME ACCELERATION',
    focus: ['speed-10', 'speed-20'],
    id: 'accumulate-time',
    instruction: 'Use the 10× or 20× time-acceleration control and wait for elapsed dive time to reach 10 minutes. The next learning popup will appear automatically.',
    title: 'Accumulate dive time safely.',
  },
  {
    action: GUIDED_DIVE_ACTIONS.CONTINUE,
    actionLabel: 'Begin the controlled ascent',
    body: 'At ten minutes, acceleration returns to 1× so the next event cannot be rushed. While the simulation continues, select the 15 ft target and CONTROLLED ascent rate to begin the ascent.',
    eyebrow: 'CONTROLLED ASCENT',
    focus: ['speed-1', 'depth-stop', 'rate-6', 'simulation-toggle'],
    id: 'enter-safety-stop',
    instruction: 'Set 15 ft / 4.6 m with a controlled ascent rate, then observe the diver enter the safety stop while the simulation continues.',
    title: 'Ascend toward the safety stop.',
  },
  {
    action: GUIDED_DIVE_ACTIONS.CONTINUE,
    actionLabel: 'Complete the safety stop',
    body: 'A safety stop is a preventive pause in shallow water. The computer tracks it because holding the indicated depth gives your body additional time to release inert gas before surfacing. Select 10× while the simulation continues so you can observe the timer complete.',
    completionBody: 'We completed the safety stop by remaining in the highlighted depth band until the timer reached zero. This demonstrated how the computer tracks stop progress before surfacing.',
    eyebrow: 'SAFETY STOP',
    focus: ['display', 'stop', 'water', 'simulation-toggle'],
    id: 'complete-safety-stop',
    instruction: 'Select 10× and remain in the 10–20 ft safety-stop band until the timer reaches zero.',
    title: 'Complete the safety stop.',
  },
  {
    action: GUIDED_DIVE_ACTIONS.CONTINUE,
    actionLabel: 'Continue to surfacing',
    body: 'The completed safety-stop timer confirms that the diver held the required shallow-water pause. Review what the computer tracked before continuing to the surface.',
    completionBody: 'We observed the computer hold the diver in the safety-stop band and count down the required pause. This showed how the computer tracks stop progress before the diver continues toward the surface.',
    eyebrow: 'SAFETY STOP',
    focus: ['display', 'stop', 'water'],
    id: 'explain-safety-stop',
    instruction: 'Review what the safety-stop timer showed before beginning the ascent to the surface.',
    title: 'Understand what the stop showed.',
  },
  {
    action: GUIDED_DIVE_ACTIONS.CONTINUE,
    actionLabel: 'Surface the dive',
    body: 'After the stop is complete, use a controlled ascent to return to 0 ft. The computer will record the dive and keep the residual nitrogen in its planner while the simulation continues.',
    completionBody: 'We completed the simulated dive with a controlled ascent to the surface. The computer recorded the dive and retained the residual nitrogen information for the planner.',
    eyebrow: 'SURFACE',
    focus: ['depth-0', 'rate-6', 'simulation-toggle', 'water'],
    id: 'surface',
    instruction: 'Set 0 ft with a controlled ascent rate, then observe the computer return to the surface.',
    title: 'Finish the simulated dive.',
  },
  {
    action: GUIDED_DIVE_ACTIONS.CONTINUE,
    actionLabel: 'Find PLAN',
    body: 'After a dive, the computer displays the post-dive screen. You can open the planner to check NDLs for different depths as your surface interval progresses. A longer surface interval allows more time to off-gas, which increases the NDL available for your next dive. The planner uses data from the last dive and your ongoing off-gassing to provide more accurate limits for planning multiple dives.',
    eyebrow: 'DIVE PLANNER',
    focus: ['display', 'leftButton'],
    id: 'planner-nav',
    instruction: 'Use ADV to move through the post-dive menu until the LCD shows PLAN, then stop there.',
    title: 'Navigate to the dive planner.',
  },
  {
    action: GUIDED_DIVE_ACTIONS.CONTINUE,
    actionLabel: 'Open PLAN',
    body: 'SEL enters the planner. The planner starts from the current residual nitrogen state and shows the no-decompression limit for a selected depth.',
    eyebrow: 'DIVE PLANNER',
    focus: ['display', 'rightButton'],
    id: 'planner-open',
    instruction: 'Press SEL to open the planner and observe the NDL for the starting depth.',
    title: 'Open the planner.',
  },
  {
    action: GUIDED_DIVE_ACTIONS.CONTINUE,
    actionLabel: 'Continue to deep-stop setup',
    body: 'Press ADV inside PLAN to cycle through the available depths. Compare the NDL at each depth, then continue until the starting depth appears again so you can see how the limit changes across the planner range.',
    completionBody: 'We cycled through the planner’s depth options and compared the NDL at each one. This demonstrated how the available limit changes with depth and how the planner uses residual nitrogen from the previous dive.',
    eyebrow: 'PLANNER READING',
    focus: ['display', 'leftButton'],
    id: 'planner-read',
    instruction: 'Press ADV to cycle through every planner depth, compare each NDL, and continue until the starting depth appears again.',
    title: 'Read residual-nitrogen limits.',
  },
  {
    action: GUIDED_DIVE_ACTIONS.CONTINUE,
    actionLabel: 'Find SET UTIL',
    body: 'SEL exits the planner to its lead-in. Then ADV continues through the real surface menu until SET UTIL appears.',
    eyebrow: 'COMPUTER SETTINGS',
    focus: ['display', 'leftButton', 'rightButton'],
    id: 'planner-exit',
    instruction: 'Press SEL to leave PLAN, then use ADV until the LCD shows SET UTIL.',
    title: 'Return to the utility settings.',
  },
  {
    action: GUIDED_DIVE_ACTIONS.CONTINUE,
    actionLabel: 'Open SET UTIL',
    body: 'SET UTIL contains several fields in sequence. Select saves the value currently shown, even when you leave it unchanged, and advances to the next field.',
    eyebrow: 'DEEP STOP SETUP',
    focus: ['display', 'rightButton'],
    id: 'util-open',
    instruction: 'Press SEL to enter SET UTIL, then press SEL to retain each unchanged field and advance until DEEP STOP is displayed.',
    title: 'Open the utility settings.',
  },
  {
    action: GUIDED_DIVE_ACTIONS.CONTINUE,
    actionLabel: 'Return to the surface screen',
    body: 'When DEEP STOP is displayed, Advance changes the option from OFF to ON. Select saves the new setting. Finally, holding ADV and SEL together returns to the main surface screen from any settings menu.',
    completionBody: 'We enabled the DEEP STOP setting and returned to the main surface screen using the two-button shortcut. This demonstrated how settings are changed, saved, and exited.',
    eyebrow: 'DEEP STOP',
    focus: ['display', 'leftButton', 'rightButton'],
    id: 'deep-stop-enable',
    instruction: 'Press ADV to change DEEP STOP to ON, then press SEL to save it. Finally, hold ADV and SEL together for about 3 seconds to return home.',
    title: 'Enable deep stops.',
  },
  {
    action: GUIDED_DIVE_ACTIONS.CONTINUE,
    actionLabel: 'Start the deep-stop dive',
    body: 'Deep stops add another controlled pause during the ascent from a deeper dive. We will make a second simulated dive so you can observe both a deep stop and the regular safety stop in one continuous ascent.',
    eyebrow: 'DEEP-STOP DIVE',
    focus: ['water', 'display', 'depth-30', 'simulation-toggle'],
    id: 'deep-stop-start',
    instruction: 'Scroll down, choose the highlighted 98 ft / 30 m target, then press START SIMULATION.',
    title: 'Practice a dive with two stops.',
  },
  {
    action: GUIDED_DIVE_ACTIONS.CONTINUE,
    actionLabel: 'Observe the deep descent',
    body: 'The computer activates automatically near the surface and continues tracking depth, NDL, and elapsed dive time as the diver descends toward the deeper training target.',
    completionBody: 'We observed the computer activate and track the deeper descent. The computer is now carrying the dive information it will use to manage the ascent and its required stops.',
    eyebrow: 'DEEP DIVE DISPLAY',
    focus: ['water', 'display', 'depth', 'ndl', 'time'],
    id: 'deep-stop-descent',
    instruction: 'Observe the depth, NDL, and elapsed dive time as the diver descends to 98 ft / 30 m.',
    title: 'Observe the deeper dive.',
  },
  {
    action: GUIDED_DIVE_ACTIONS.CONTINUE,
    actionLabel: 'Enter the deep stop',
    body: 'During the ascent, the computer may require a deep stop based on the depth of the dive. Set the highlighted deep-stop depth and controlled ascent rate, then let the computer guide the diver into the stop.',
    completionBody: 'We observed the computer enter the deep stop during the ascent. This showed how a deeper dive can add an extra pause before the regular safety stop.',
    eyebrow: 'DEEP STOP',
    focus: ['water', 'display', 'depth-deep', 'rate-6'],
    id: 'deep-stop-enter',
    instruction: 'Set the highlighted 49 ft / 15 m target with a controlled ascent rate, then observe the computer enter the deep stop.',
    title: 'Enter the deep stop.',
  },
  {
    action: GUIDED_DIVE_ACTIONS.CONTINUE,
    actionLabel: 'Complete the deep stop',
    body: 'The deep-stop timer represents the required pause during the ascent. Use time acceleration to observe the stop complete while the diver remains at the highlighted depth.',
    completionBody: 'We completed the deep stop before continuing the ascent. This demonstrated how the computer can require an additional pause after a deeper dive, before the regular safety stop.',
    eyebrow: 'DEEP STOP',
    focus: ['display', 'stop', 'depth-deep', 'speed-10'],
    id: 'deep-stop-complete',
    instruction: 'Use 10× time acceleration and wait for the deep-stop timer to reach zero.',
    title: 'Hold the deep stop.',
  },
  {
    action: GUIDED_DIVE_ACTIONS.CONTINUE,
    actionLabel: 'Complete the safety stop',
    body: 'After the deep stop, the ascent continues toward the regular safety stop. Set the highlighted safety-stop depth and controlled ascent rate, then observe the second required pause.',
    eyebrow: 'SAFETY STOP',
    focus: ['water', 'display', 'depth-stop', 'rate-6'],
    id: 'deep-stop-safety-stop',
    instruction: 'Set the highlighted 15 ft / 4.6 m target with a controlled ascent rate, then observe the computer enter the safety stop.',
    title: 'Continue to the safety stop.',
  },
  {
    action: GUIDED_DIVE_ACTIONS.CONTINUE,
    actionLabel: 'Surface the deep-stop dive',
    body: 'The regular safety stop is the final pause before surfacing. Use time acceleration to complete it, then set the surface target and allow the computer to finish the dive.',
    eyebrow: 'FINAL ASCENT',
    focus: ['display', 'stop', 'depth-0', 'speed-10'],
    id: 'deep-stop-surface',
    instruction: 'Use 10× to complete the safety stop, then set 0 ft with a controlled ascent rate and observe the computer return to the surface.',
    title: 'Finish the two-stop dive.',
  },
  {
    action: GUIDED_DIVE_ACTIONS.CONTINUE,
    actionLabel: 'Find the logbook',
    body: 'After a dive, the computer keeps the completed dive in its logbook. The LOG lead-in is where you navigate to those saved entries.',
    eyebrow: 'DIVE LOGBOOK',
    focus: ['display', 'leftButton'],
    id: 'log-nav',
    instruction: 'Use ADV from the surface screen until the LCD shows LOG.',
    title: 'Navigate to the logbook.',
  },
  {
    action: GUIDED_DIVE_ACTIONS.CONTINUE,
    actionLabel: 'Open the latest dive',
    body: 'The log preview shows the most recent recorded dive. Select opens that entry so you can read its detail pages.',
    eyebrow: 'DIVE LOGBOOK · LATEST DIVE',
    focus: ['display', 'rightButton'],
    id: 'log-open',
    instruction: 'Press SEL to open the latest recorded dive.',
    title: 'Open the latest log entry.',
  },
  {
    action: GUIDED_DIVE_ACTIONS.CONTINUE,
    actionLabel: 'Read latest page 2',
    body: 'The first page presents the beginning of the latest dive entry. Select moves forward through the entry one page at a time.',
    eyebrow: 'DIVE LOGBOOK · LATEST · PAGE 1 OF 3',
    focus: ['display', 'rightButton'],
    id: 'log-latest-page-1',
    instruction: 'Read page 1 of the latest dive, then press SEL to continue to page 2.',
    title: 'Read the latest dive, page 1.',
  },
  {
    action: GUIDED_DIVE_ACTIONS.CONTINUE,
    actionLabel: 'Read latest page 3',
    body: 'Page 2 contains another part of the recorded dive information. Notice how the log spreads the entry across several screens.',
    eyebrow: 'DIVE LOGBOOK · LATEST · PAGE 2 OF 3',
    focus: ['display', 'rightButton'],
    id: 'log-latest-page-2',
    instruction: 'Read page 2 of the latest dive, then press SEL to continue to page 3.',
    title: 'Read the latest dive, page 2.',
  },
  {
    action: GUIDED_DIVE_ACTIONS.CONTINUE,
    actionLabel: 'Return to the log preview',
    body: 'Page 3 completes the latest recorded entry. After this review, Advance returns to the log preview, where another dive can be selected.',
    completionBody: 'We opened the latest dive and reviewed all three pages of its log entry. The logbook spreads the recorded dive information across several screens so it can be reviewed after the dive.',
    eyebrow: 'DIVE LOGBOOK · LATEST · PAGE 3 OF 3',
    focus: ['display', 'rightButton'],
    id: 'log-latest-page-3',
    instruction: 'Read page 3 of the latest dive, then press Continue to select the earlier recorded dive.',
    title: 'Read the latest dive, page 3.',
  },
  {
    action: GUIDED_DIVE_ACTIONS.CONTINUE,
    actionLabel: 'Open the earlier dive',
    body: 'The log preview can cycle through recorded dives. Advance changes the selected entry; Select opens the entry currently shown.',
    eyebrow: 'DIVE LOGBOOK · EARLIER DIVE',
    focus: ['display', 'leftButton', 'rightButton'],
    id: 'log-select-earlier',
    instruction: 'Press ADV to return to the log preview, press ADV once to select the earlier recorded dive, then press SEL to open it.',
    title: 'Select the earlier log entry.',
  },
  {
    action: GUIDED_DIVE_ACTIONS.CONTINUE,
    actionLabel: 'Read earlier page 2',
    body: 'The earlier dive is also stored as a multi-page entry. Select moves from its first page to its second page.',
    eyebrow: 'DIVE LOGBOOK · EARLIER · PAGE 1 OF 3',
    focus: ['display', 'rightButton'],
    id: 'log-earlier-page-1',
    instruction: 'Read page 1 of the earlier dive, then press SEL to continue to page 2.',
    title: 'Read the earlier dive, page 1.',
  },
  {
    action: GUIDED_DIVE_ACTIONS.CONTINUE,
    actionLabel: 'Read earlier page 3',
    body: 'Page 2 gives another view of the earlier dive’s recorded information. Continue to the final page when you are ready.',
    eyebrow: 'DIVE LOGBOOK · EARLIER · PAGE 2 OF 3',
    focus: ['display', 'rightButton'],
    id: 'log-earlier-page-2',
    instruction: 'Read page 2 of the earlier dive, then press SEL to continue to page 3.',
    title: 'Read the earlier dive, page 2.',
  },
  {
    action: GUIDED_DIVE_ACTIONS.CONTINUE,
    actionLabel: 'Review the logbook lesson',
    body: 'The final page completes the earlier dive entry. The two recorded dives demonstrate that the logbook keeps each dive available for later review.',
    completionBody: 'We navigated to the logbook, opened the latest and earlier dives, and reviewed three detail pages for each entry. The logbook preserves key dive information so you can review and discuss both completed dives after the lesson.',
    eyebrow: 'DIVE LOGBOOK · EARLIER · PAGE 3 OF 3',
    focus: ['display', 'rightButton'],
    id: 'log-earlier-page-3',
    instruction: 'Read page 3 of the earlier dive, then press Continue to finish the logbook lesson.',
    title: 'Review the earlier dive, page 3.',
  },
  {
    action: GUIDED_DIVE_ACTIONS.CONTINUE,
    actionLabel: 'Leave the logbook',
    body: 'Leave the logbook after reviewing the recorded entry so the computer returns to its normal surface menu.',
    eyebrow: 'DIVE LOGBOOK',
    focus: ['display', 'leftButton'],
    id: 'log-exit',
    instruction: 'Press ADV to return to the log preview, then hold ADV to leave the logbook and return to the surface menu.',
    title: 'Leave the logbook.',
  },
  {
    action: GUIDED_DIVE_ACTIONS.CONTINUE,
    actionLabel: 'Begin the knowledge check',
    body: 'The next three scenarios test how confidently you can apply what you learned without highlighted controls. Nothing on the computer will be highlighted for you. The trainer verifies each scenario against the computer’s real settings, logbook, and live dive data.',
    completionBody: 'Scenario 1: under SET UTIL, turn BLUETOOTH on. Scenario 2: read an exact value from Dive 2 in the logbook and enter it. Scenario 3: run a simulated dive of at least 10 minutes and complete every stop the computer activates. Work at your own pace — you can still step back if you need to.',
    eyebrow: 'KNOWLEDGE CHECK',
    focus: [],
    id: 'quiz-intro',
    instruction: 'Read the three-scenario overview, then begin when you are ready to work independently.',
    reviewButtonLabel: 'Begin scenario 1',
    reviewHeading: 'Three scenarios, no highlights',
    reviewLabel: 'KNOWLEDGE CHECK',
    title: 'Apply what you learned.',
  },
  {
    action: GUIDED_DIVE_ACTIONS.CONTINUE,
    actionLabel: 'Complete scenario 1',
    body: 'This scenario checks whether you can navigate the surface menus and apply the ADV (change the value) and SEL (save and advance) behavior without any guidance highlights.',
    completionBody: 'BLUETOOTH is now ON. You reached it by scrolling the surface menu to SET UTIL with ADV, entering with SEL, advancing through the utility fields, changing BLUETOOTH with ADV, and saving with SEL — the same control pattern the whole lesson used.',
    eyebrow: 'KNOWLEDGE CHECK · 1 OF 3',
    focus: [],
    id: 'quiz-bluetooth',
    instruction: 'Using only the computer’s buttons, go to SET UTIL and turn BLUETOOTH ON, then press SEL to save it.',
    reviewButtonLabel: 'Begin scenario 2',
    reviewHeading: 'Scenario 1 complete',
    reviewLabel: 'KNOWLEDGE CHECK · 1 OF 3',
    title: 'Turn on Bluetooth.',
  },
  {
    action: GUIDED_DIVE_ACTIONS.CONTINUE,
    actionLabel: 'Complete scenario 2',
    answerPrompt: 'On the deeper logged dive (LOG DATA 1 shows DEEP STOP: YES), what was its HIGHEST PO2?',
    body: 'Go back to the logbook and find the dive that shows DEEP STOP: YES on LOG DATA 1 — the deeper dive with two stops, which is the most recent entry. Read its LOG DATA 3 page and type the HIGHEST PO2 value exactly as the screen shows it. Your entry is checked against the real saved dive, so it has to match the reading.',
    completionBody: 'Correct. You found the right dive in the log (the one with a deep stop), read the correct data page, and reported HIGHEST PO2 exactly as the computer recorded it. Reading the log accurately is how you review a dive after you surface.',
    eyebrow: 'KNOWLEDGE CHECK · 2 OF 3',
    focus: [],
    id: 'quiz-log-po2',
    instruction: 'In the logbook, open the entry that shows DEEP STOP: YES, read HIGHEST PO2 on its LOG DATA 3 page, and enter it exactly as displayed.',
    reviewButtonLabel: 'Begin scenario 3',
    reviewHeading: 'Scenario 2 complete',
    reviewLabel: 'KNOWLEDGE CHECK · 2 OF 3',
    title: 'Read the logbook accurately.',
  },
  {
    action: GUIDED_DIVE_ACTIONS.CONTINUE,
    actionLabel: 'Complete scenario 3',
    body: 'Use the simulation controls below to run one more dive on your own. The trainer watches the live dive data and the checklist under this instruction updates as you go. A qualifying dive lasts at least 10 minutes and completes every deep stop or safety stop the computer activates. If the dive is shallow enough that no stop activates, none is required — surface under control once you pass 10 minutes.',
    completionBody: 'You independently changed and saved a utility setting, retrieved an exact value from the real logbook, and completed a dive of at least 10 minutes while honoring every stop the computer activated. That is the full workflow: set the computer up, dive it, and read it back afterward.',
    eyebrow: 'KNOWLEDGE CHECK · 3 OF 3',
    focus: [],
    id: 'quiz-dive',
    instruction: 'Pick a target depth, press START SIMULATION, and run a dive of at least 10 minutes. Complete any deep stop or safety stop the computer shows, then surface under control.',
    reviewButtonLabel: 'Finish the guided lesson',
    reviewHeading: 'Knowledge check complete',
    reviewLabel: 'ASSESSMENT COMPLETE',
    title: 'Complete an independent dive.',
  },
  {
    action: GUIDED_DIVE_ACTIONS.OPEN_PRACTICE,
    actionLabel: 'Open Free Practice',
    body: 'You have now operated the computer through real surface menus, date/time settings, dives, stops, the planner, the logbook, utility settings, the two-button home shortcut, and an independent knowledge check.',
    eyebrow: 'GUIDED TOUR COMPLETE',
    focus: ['housing', 'profile'],
    id: 'complete',
    instruction: 'Free Practice is your unguided playground for exploring the same instrument.',
    title: 'You are ready to explore independently.',
  },
]);

export function evaluateGuidedDiveObjective(stepId, {
  device,
  simulation,
  actualTime = new Date(),
  plannerCycleComplete = false,
  quizAnswer = null,
  quizDiveObservation = null,
}) {
  if (!device || !simulation) return false;
  switch (stepId) {
    case 'introduction':
      return true;
    case 'quiz-intro':
      return true;
    case 'quiz-bluetooth':
      return device.settings.bluetooth === true;
    case 'quiz-log-po2':
      return loggedDivePo2Matches(device, quizAnswer);
    case 'quiz-dive':
      return qualifyingQuizDive(quizDiveObservation);
    case 'surface-ready':
      return device.currentScreen === DEVICE_SCREENS.SET_TIME_LEAD_IN;
    case 'enter-set-time':
      return SET_TIME_SCREENS.has(device.currentScreen);
    case 'set-date-format':
      return device.currentScreen === DEVICE_SCREENS.HOUR_FORMAT;
    case 'set-hour-format':
      return device.currentScreen === DEVICE_SCREENS.SET_HOUR;
    case 'set-hour':
      return device.currentScreen === DEVICE_SCREENS.SET_MINUTE
        && device.dateTime.hour === actualTime.getHours();
    case 'set-minute':
      return device.currentScreen === DEVICE_SCREENS.SET_YEAR
        && device.dateTime.minute === actualTime.getMinutes();
    case 'set-year':
      return device.currentScreen === DEVICE_SCREENS.SET_MONTH
        && device.dateTime.year === actualTime.getFullYear();
    case 'set-month':
      return device.currentScreen === DEVICE_SCREENS.SET_DAY
        && device.dateTime.month === actualTime.getMonth() + 1;
    case 'set-day':
      return device.currentScreen === DEVICE_SCREENS.SET_TIME_LEAD_IN
        && sameDate(device.dateTime, actualTime)
        && withinFiveMinutes(device.dateTime, actualTime);
    case 'go-dive':
      return simulation.clock.status === 'running' || simulation.dive.lifecycle === 'diving';
    case 'activate-dive':
      return simulation.dive.lifecycle === 'diving'
        && simulation.environment.depthMeters >= 17.5
        && simulation.environment.depthMeters <= 18.5;
    case 'accumulate-time':
      return simulation.dive.lifecycle === 'diving'
        && simulation.dive.runtimeSeconds >= 600;
    case 'enter-safety-stop':
      return simulation.safetyStop.status === 'active';
    case 'explain-safety-stop':
      return simulation.safetyStop.status === 'active' || simulation.safetyStop.status === 'completed';
    case 'complete-safety-stop':
      return simulation.safetyStop.status === 'completed';
    case 'surface':
      return simulation.dive.lifecycle === 'postDive';
    case 'planner-nav':
      return device.currentScreen === DEVICE_SCREENS.PLAN_LEAD_IN;
    case 'planner-open':
      return device.currentScreen === DEVICE_SCREENS.PLAN_ACTIVE;
    case 'planner-read':
      return device.currentScreen === DEVICE_SCREENS.PLAN_ACTIVE && plannerCycleComplete;
    case 'planner-exit':
      return device.currentScreen === DEVICE_SCREENS.SET_UTIL_LEAD_IN;
    case 'util-open':
      return device.currentScreen === DEVICE_SCREENS.DEEP_STOP;
    case 'deep-stop-enable':
      return device.settings.deepStop === true && device.currentScreen === DEVICE_SCREENS.SURFACE_HOME;
    case 'deep-stop-start':
      return simulation.clock.status === 'running' || simulation.dive.lifecycle === 'diving';
    case 'deep-stop-descent':
      return simulation.dive.lifecycle === 'diving'
        && simulation.environment.depthMeters >= 29.5
        && simulation.environment.depthMeters <= 30.5;
    case 'deep-stop-enter':
      return simulation.deepStop.status === 'active';
    case 'deep-stop-complete':
      return simulation.deepStop.status === 'completed';
    case 'deep-stop-safety-stop':
      return simulation.safetyStop.status === 'active';
    case 'deep-stop-surface':
      return simulation.dive.lifecycle === 'postDive';
    case 'log-nav':
      return device.currentScreen === DEVICE_SCREENS.LOG_LEAD_IN && device.logbook.entries.length >= 2;
    case 'log-open':
      return device.currentScreen === DEVICE_SCREENS.LOG_PREVIEW && device.logbook.entries.length >= 2;
    case 'log-latest-page-1':
      return device.currentScreen === DEVICE_SCREENS.LOG_DATA_1 && device.logbook.selectedIndex === 0;
    case 'log-latest-page-2':
      return device.currentScreen === DEVICE_SCREENS.LOG_DATA_2 && device.logbook.selectedIndex === 0;
    case 'log-latest-page-3':
      return device.currentScreen === DEVICE_SCREENS.LOG_DATA_3 && device.logbook.selectedIndex === 0;
    case 'log-select-earlier':
      return device.currentScreen === DEVICE_SCREENS.LOG_DATA_1 && device.logbook.selectedIndex === 1;
    case 'log-earlier-page-1':
      return device.currentScreen === DEVICE_SCREENS.LOG_DATA_1 && device.logbook.selectedIndex === 1;
    case 'log-earlier-page-2':
      return device.currentScreen === DEVICE_SCREENS.LOG_DATA_2 && device.logbook.selectedIndex === 1;
    case 'log-earlier-page-3':
      return device.currentScreen === DEVICE_SCREENS.LOG_DATA_3 && device.logbook.selectedIndex === 1;
    case 'log-exit':
      return device.currentScreen === DEVICE_SCREENS.LOG_LEAD_IN;
    case 'complete':
      return true;
    default:
      return false;
  }
}

function localizeGuidedDepthCopy(step, depthUnit = 'ft') {
  const metric = depthUnit === 'm';
  const replacements = metric
    ? [
      ['59 ft / 18 m', '18 m'],
      ['59 ft', '18 m'],
      ['98 ft / 30 m', '30 m'],
      ['98 ft', '30 m'],
      ['49 ft / 15 m', '15 m'],
      ['49 ft', '15 m'],
      ['15 ft / 4.6 m', '4.6 m'],
      ['10–20 ft', '3–6 m'],
      ['0 ft', '0 m'],
      ['4–5 ft', '1.2–1.5 m'],
    ]
    : [
      ['59 ft / 18 m', '59 ft'],
      ['59 ft', '59 ft'],
      ['98 ft / 30 m', '98 ft'],
      ['98 ft', '98 ft'],
      ['49 ft / 15 m', '49 ft'],
      ['49 ft', '49 ft'],
      ['15 ft / 4.6 m', '15 ft'],
      ['10–20 ft', '10–20 ft'],
      ['0 ft', '0 ft'],
      ['4–5 ft', '4–5 ft'],
    ];
  const localize = (value) => replacements.reduce((text, [source, target]) => text.replaceAll(source, target), value);
  return {
    ...step,
    actionLabel: localize(step.actionLabel),
    body: localize(step.body),
    completionBody: step.completionBody ? localize(step.completionBody) : undefined,
    instruction: localize(step.instruction),
    title: localize(step.title),
  };
}

export function guidedDiveStepAt(index, depthUnit = 'ft') {
  const step = GUIDED_DIVE_STEPS[Math.min(GUIDED_DIVE_STEPS.length - 1, Math.max(0, index))];
  return localizeGuidedDepthCopy(step, depthUnit);
}

export function shouldShowGuidedCompletionReview(stepId) {
  return GUIDED_REVIEW_STEPS.has(stepId);
}
