import { DEVICE_SCREENS } from '../../../lib/virtualDiveComputer';

export const GUIDED_DIVE_ACTIONS = Object.freeze({
  CONTINUE: 'continue',
  OPEN_PRACTICE: 'openPractice',
});

// Only pause the student for a takeaway when the step teaches a meaningful
// concept. Navigation-only steps should flow directly into the next task.
export const GUIDED_REVIEW_STEPS = new Set([
  'button-basics',
  'surface-ready',
  'set-day',
  'activate-dive',
  'accumulate-time',
  'explain-safety-stop',
  'surface',
  'warning-slow-ascent',
  'warning-correct',
  'nitrox-set-ean32',
  'nitrox-mod',
  'nitrox-o2-screen',
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
    actionLabel: 'Practice the two presses',
    body: 'This computer has only two buttons, and each one does two things depending on how long you press it. A quick tap is one command; pressing and holding for about a second is a different command. Almost every convoluted-seeming dive computer works this way — learn the tap-versus-hold habit here and the rest of the menus make sense.',
    completionBody: 'A quick tap and a hold are two separate commands on both buttons. As a rule: a tap moves you forward — next screen, next field, save — and a hold takes you back or out — back to the home screen, cancel an edit. The legend under the computer always shows what each press does on the current screen.',
    eyebrow: 'HOW THE BUTTONS WORK',
    focus: ['display', 'leftButton', 'rightButton'],
    id: 'button-basics',
    instruction: 'Tap ADV once and watch the screen advance. Then press and hold ADV for about a second — it jumps straight back to the home screen.',
    title: 'A tap and a hold are different.',
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
    completionBody: 'We observed the computer activate at approximately 4–5 ft. NDL is your no-decompression limit: the number of minutes you could stay at the current depth and still ascend straight to the surface without a required decompression stop. It counts down as you absorb nitrogen, and it falls faster the deeper you go. If it ever reaches zero the computer switches into decompression mode. Time at the surface between dives lets nitrogen leave your body, which raises the NDL back up.',
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
    completionBody: 'We cycled through the planner’s depth options and compared the NDL at each one. The planner starts from the nitrogen still left in your body from the last dive — your residual nitrogen — so right after a dive its limits are shorter than the computer’s fresh limits. As your surface interval grows, that residual nitrogen falls and the planner’s NDLs climb back toward normal. That is why a longer surface interval buys you more bottom time on the next dive.',
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
    body: 'Note the one exception to the tap-forward rule: inside a dive’s log data pages, ADV goes back to the preview instead of forward — SEL is what moves you deeper through the pages here. It is the only screen on the computer where the buttons swap roles, and the legend under the computer shows it. Now: Advance changes the selected entry; Select opens the entry currently shown.',
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
    actionLabel: 'Start the ascent-rate dive',
    body: 'Every dive computer watches how fast you ascend. Rise faster than its limit — roughly nine metres, or thirty feet, a minute — and it raises an alarm, because a fast ascent does not give dissolved nitrogen time to leave your blood safely. We will trigger that alarm on purpose so you know what it looks like.',
    eyebrow: 'ASCENT-RATE ALARM',
    focus: ['water', 'display', 'depth-18', 'simulation-toggle'],
    id: 'warning-dive',
    instruction: 'Scroll down, choose the highlighted 59 ft / 18 m target, then press START SIMULATION.',
    title: 'Set up a dive to test your ascent rate.',
  },
  {
    action: GUIDED_DIVE_ACTIONS.CONTINUE,
    actionLabel: 'Trigger the ascent alarm',
    body: 'The ascent-rate indicator on the display fills as you rise. When it reaches the top the computer flashes SLOW ASCENT and sounds its alarm. Select the FAST ascent rate and a shallow target so the indicator climbs into its warning band.',
    completionBody: 'The ascent-rate indicator filled into its warning band and the computer raised SLOW ASCENT. An alarm reflects a live condition — the computer is telling you to slow down right now, before you keep rising.',
    eyebrow: 'ASCENT-RATE ALARM',
    focus: ['water', 'display', 'ascent', 'rate-12', 'depth-stop'],
    id: 'warning-slow-ascent',
    instruction: 'Select the FAST ascent rate and the 15 ft / 4.6 m target, then watch the ascent-rate bar and the SLOW ASCENT warning.',
    title: 'Trigger the SLOW ASCENT alarm.',
  },
  {
    action: GUIDED_DIVE_ACTIONS.CONTINUE,
    actionLabel: 'Bring the ascent under control',
    body: 'Press SEL to acknowledge the alarm — the flashing stops, but a small ! stays in the corner and is written into this dive’s log entry. Then select the CONTROLLED ascent rate and surface. The alarm condition clears as soon as your rate drops back under the limit.',
    completionBody: 'Acknowledging silences an alarm; it does not undo it. The ! indicator and the fast ascent rate are recorded in the logbook for this dive. Warnings track a live condition and clear when you fix it — but a more serious one behaves differently: if your no-decompression limit reaches zero, the computer switches into decompression mode and shows a mandatory ceiling you must not ascend past. You can practise that in Free Practice with the Deco response scenario.',
    eyebrow: 'ASCENT-RATE ALARM',
    focus: ['display', 'rightButton', 'rate-6', 'depth-0', 'water'],
    id: 'warning-correct',
    instruction: 'While SLOW ASCENT is flashing, press SEL to acknowledge it. Then select CONTROLLED and 0 ft and surface under control.',
    title: 'Acknowledge, then correct the ascent.',
  },
  {
    action: GUIDED_DIVE_ACTIONS.CONTINUE,
    actionLabel: 'Find SET GAS',
    body: 'Enriched air — nitrox — has more oxygen and less nitrogen than air. Less nitrogen extends your no-decompression limit, but the extra oxygen becomes toxic below a depth called the MOD, the maximum operating depth. You program the computer with the gas in your cylinder so it can track both. Start in the SET GAS menu.',
    eyebrow: 'ENRICHED AIR (NITROX)',
    focus: ['display', 'leftButton'],
    id: 'nitrox-setgas-nav',
    instruction: 'Use ADV from the surface screen until the LCD shows SET GAS.',
    title: 'Open the gas menu.',
  },
  {
    action: GUIDED_DIVE_ACTIONS.CONTINUE,
    actionLabel: 'Program EAN32',
    body: 'SEL opens the gas editor. First choose AIR or EAN — select EAN. Then set the oxygen percentage to 32 with ADV, and accept the PO2 alarm setpoint to save.',
    completionBody: 'The computer is now programmed for EAN32. Its planner and its oxygen tracking will use 32% oxygen instead of 21% until you change it back.',
    eyebrow: 'ENRICHED AIR (NITROX)',
    focus: ['display', 'leftButton', 'rightButton'],
    id: 'nitrox-set-ean32',
    instruction: 'Press SEL to open the editor, select EAN, set the oxygen to 32%, then accept the PO2 alarm to return to SET GAS.',
    title: 'Program EAN32.',
  },
  {
    action: GUIDED_DIVE_ACTIONS.CONTINUE,
    actionLabel: 'Compare limits in the planner',
    body: 'Open the planner and step the depth deeper with ADV. In the shallows the no-decompression limit on EAN32 is longer than it was on air. But once you pass the MOD the planner shows ABOVE MOD and refuses to give a time — that depth is off-limits on this gas.',
    completionBody: 'On EAN32 you gain bottom time in the shallows and lose access to deeper water. That trade-off is the point of choosing a gas: match it to the dive you are planning.',
    eyebrow: 'ENRICHED AIR (NITROX)',
    focus: ['display', 'leftButton', 'rightButton'],
    id: 'nitrox-mod',
    instruction: 'Open PLAN and press ADV to step the depth down past the MOD, until the planner shows ABOVE MOD.',
    title: 'See the MOD in the planner.',
  },
  {
    action: GUIDED_DIVE_ACTIONS.CONTINUE,
    actionLabel: 'Read the oxygen screen',
    body: 'Because a nitrox gas is now programmed, the surface menu has an extra screen — ALT 3, the oxygen status page. It shows your programmed gas, its PO2 alarm setpoint, the MOD, and your accumulated oxygen exposure (O2 SATURATION).',
    completionBody: 'ALT 3 is where the computer summarises everything oxygen-related between dives. On air this screen is hidden; on nitrox it is part of your pre-dive check.',
    eyebrow: 'ENRICHED AIR (NITROX)',
    focus: ['display', 'leftButton', 'rightButton'],
    id: 'nitrox-o2-screen',
    instruction: 'Exit the planner with SEL, then use ADV until the LCD shows ALT 3, the oxygen status screen.',
    title: 'Find the oxygen status screen.',
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
    body: 'Go back to the logbook and find the dive that shows DEEP STOP: YES on LOG DATA 1 — the deeper dive with two stops, which is Dive 2 in the log. Read its LOG DATA 3 page and type the HIGHEST PO2 value exactly as the screen shows it. Your entry is checked against the real saved dive, so it has to match the reading.',
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
    body: 'You have now operated the computer through the tap-versus-hold button model, real surface menus, date and time, dives, the safety stop and the deep stop, a rapid-ascent alarm, the planner and residual nitrogen, nitrox setup and the MOD, the logbook, utility settings, the two-button home shortcut, and an independent knowledge check.',
    eyebrow: 'GUIDED TOUR COMPLETE',
    focus: ['housing', 'profile'],
    id: 'complete',
    instruction: 'Free Practice is your unguided playground for the same instrument — it also has Ascent-control and Deco-response scenarios with live coaching.',
    title: 'You are ready to explore independently.',
  },
]);

export function evaluateGuidedDiveObjective(stepId, {
  device,
  simulation,
  actualTime = new Date(),
  buttonGesturesComplete = false,
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
    case 'button-basics':
      return Boolean(buttonGesturesComplete);
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
    case 'warning-dive':
      return simulation.dive.lifecycle === 'diving'
        && simulation.environment.depthMeters >= 17.5;
    case 'warning-slow-ascent':
      return device.warning.latchedCodes.includes('rapid-ascent');
    case 'warning-correct':
      return simulation.dive.lifecycle === 'postDive';
    case 'nitrox-setgas-nav':
      return device.currentScreen === DEVICE_SCREENS.SET_GAS_LEAD_IN;
    case 'nitrox-set-ean32':
      return device.configuredGas.fo2 === 0.32
        && device.currentScreen === DEVICE_SCREENS.SET_GAS_LEAD_IN;
    case 'nitrox-mod':
      return device.currentScreen === DEVICE_SCREENS.PLAN_ACTIVE
        && device.planner.depthMeters >= 36;
    case 'nitrox-o2-screen':
      return device.currentScreen === DEVICE_SCREENS.ALT_3;
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
