const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { loadSourceModule } = require('./lib/load-source-module.cjs');

const sourcePath = path.join(__dirname, '..', 'src', 'lib', 'diveComputer.js');
const screenSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'screens', 'DiveComputerSimulatorScreen.js'), 'utf8');
const guidedLessonSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'features', 'diveComputer', 'training', 'guidedDiveLesson.js'), 'utf8');
const lessonHookSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'features', 'diveComputer', 'training', 'useGuidedDiveLesson.js'), 'utf8');
const stepFabricationSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'features', 'diveComputer', 'training', 'guidedStepFabrication.js'), 'utf8');
const guidedReviewBlock = guidedLessonSource.match(/GUIDED_REVIEW_STEPS = new Set\(\[[\s\S]*?\]\);/)[0];
const engine = loadSourceModule(sourcePath, path.join(__dirname, '..', 'src', 'lib'));

let state = engine.createDiveComputerState();
state = engine.stepDiveComputer(state, { depthMeters: 1.2 }, 4);
assert.equal(state.isDive, false, 'Dive mode must not activate shallower than 1.5 m / approximately 5 ft.');
state = engine.stepDiveComputer(state, { depthMeters: 1.5 }, 1);
assert.equal(state.isDive, true, 'Dive mode should activate at approximately 5 ft without continuing to 10 ft.');
assert.equal(state.mode, 'no-decompression');

const seededA = engine.seedDiveComputerState({ depthMeters: 20, minutesAtDepth: 10, fo2Percent: 32 });
const seededB = engine.seedDiveComputerState({ depthMeters: 20, minutesAtDepth: 10, fo2Percent: 32 });
assert.equal(JSON.stringify(seededA), JSON.stringify(seededB), 'Scenario seeding must be deterministic.');
assert.ok(seededA.ndlMinutes < 599, 'A seeded dive should produce a finite training NDL.');
assert.ok(seededA.ppO2 > 0.9 && seededA.ppO2 < 1.1, 'EAN32 at 20 m should produce approximately 0.96 bar PO2.');

let ascent = engine.stepDiveComputer(seededA, { depthMeters: 19.8, fo2Percent: 32 }, 1);
assert.ok(ascent.ascentRateMpm > engine.DIVE_COMPUTER_LIMITS.ascentMetersPerMinute);
assert.equal(ascent.activeAlarm.code, 'rapid-ascent');
ascent = engine.acknowledgeDiveComputerAlarm(ascent);
assert.equal(ascent.activeAlarm.acknowledged, true);
ascent = engine.stepDiveComputer(ascent, { depthMeters: 19.7, fo2Percent: 32 }, 1);
assert.equal(ascent.activeAlarm, null, 'Rapid-ascent alarm should clear after the ascent rate is corrected.');

let stop = engine.seedDiveComputerState({ depthMeters: 12, minutesAtDepth: 5 });
stop = engine.stepDiveComputer(stop, { depthMeters: 5 }, 60);
assert.equal(stop.mode, 'safety-stop');
assert.ok(stop.safetyStopRemainingSeconds < engine.DIVE_COMPUTER_LIMITS.safetyStopSeconds);
stop = engine.stepDiveComputer(stop, { depthMeters: 5 }, stop.safetyStopRemainingSeconds);
assert.equal(stop.safetyStopCompleted, true);

const deco = engine.seedDiveComputerState({ depthMeters: 30, minutesAtDepth: 35 });
assert.equal(deco.mode, 'decompression', 'The decompression scenario should load with a ceiling.');
assert.ok(deco.ceilingMeters > 0);
assert.ok(deco.stopDepthMeters >= 3);

assert.equal(engine.formatSimulationTime(125), '2:05');
assert.equal(engine.formatComputerDepth(10, 'm'), '10 m');
assert.equal(engine.formatComputerDepth(10, 'ft'), '33 ft');
assert.ok(Math.abs(engine.displayDepthToMeters(engine.metersToDisplayDepth(18, 'ft'), 'ft') - 18) < 0.0001);
assert.ok(seededA.__simulation, 'Legacy state should retain its authoritative Phase 1 simulation snapshot.');
assert.equal(seededA.__simulation.environment.actualGas.fo2, 0.32);

// The guided lesson now drives the shared simulator/device engine directly —
// it must not fall back to scripted mock screens or a legacy scripted state
// machine of its own.
assert.doesNotMatch(screenSource, /LESSON_SLIDES/, 'The legacy scripted lesson data should not return once the guided flow is migrated onto the simulator engine.');
assert.doesNotMatch(screenSource, /useLegacyGuidedDiveLesson/, 'The legacy scripted lesson hook should not return once the guided flow is migrated onto the simulator engine.');
assert.match(screenSource, /useGuidedDiveLesson/);
assert.match(screenSource, /SimulatorWorkspace/);
assert.match(screenSource, /DiveProfileViewport/);
assert.match(screenSource, /import \{ SIMULATION_LIMITS, SIMULATION_SPEEDS \} from '\.\.\/lib\/diveSimulation';/, 'The simulator screen must import every domain constant referenced by its module-level practice presets.');
assert.match(screenSource, /focusAreas={step\.focus}/, 'The guided lesson must pass each step\'s focus areas into the shared workspace so it highlights, rather than fakes, the real device.');
assert.doesNotMatch(screenSource, /accessibilityRole="tablist"/);

assert.match(guidedLessonSource, /GUIDED TOUR COMPLETE/);
assert.match(guidedLessonSource, /WHAT IS THIS/);
assert.match(guidedLessonSource, /We will identify the LCD, protective bezel, and the ADV and SEL buttons together\. When you are ready, press START THE GUIDED TOUR\./, 'The opening objective should come before the start instruction.');
assert.match(guidedLessonSource, /The simulator lets you control the diver’s depth and time while the computer responds to the changing environment\./, 'The first simulator-control lesson should explain what the simulator demonstrates.');
assert.match(guidedLessonSource, /instruction: 'Scroll down to choose the highlighted 59 ft \/ 18 m target, then press START SIMULATION\.'/);
assert.match(guidedLessonSource, /The simulation is already running\./, 'Time acceleration should follow directly from the uninterrupted descent.');
assert.match(guidedLessonSource, /Use the 10× or 20× time-acceleration control and wait for elapsed dive time to reach 10 minutes\./);
assert.match(guidedLessonSource, /focus: \['speed-10', 'speed-20'\]/, 'The 20× time step must not highlight Stop Simulation.');
assert.match(guidedLessonSource, /Set 15 ft \/ 4\.6 m with a controlled ascent rate, then observe/);
assert.match(guidedLessonSource, /Set 0 ft with a controlled ascent rate, then observe/);
assert.match(guidedLessonSource, /Set the highlighted 49 ft \/ 15 m target with a controlled ascent rate, then observe/);
assert.match(guidedLessonSource, /Set the highlighted 15 ft \/ 4\.6 m target with a controlled ascent rate, then observe/);
assert.doesNotMatch(guidedLessonSource, /Select 10×, then 20×, and let the dive run until the lesson reaches 10:00/);
assert.match(guidedLessonSource, /completionBody: 'We observed the computer activate/);
assert.match(guidedLessonSource, /completionBody: 'The elapsed dive time is now 10 minutes\./);
assert.match(guidedLessonSource, /completionBody: 'We completed the safety stop by remaining/);
assert.match(guidedLessonSource, /'explain-safety-stop',/, 'The safety-stop explanation must remain visible until the learner continues.');
assert.match(guidedLessonSource, /completionBody: 'We observed the computer hold the diver in the safety-stop band/);
assert.match(guidedLessonSource, /case 'explain-safety-stop':[\s\S]*status === 'active' \|\| simulation\.safetyStop\.status === 'completed'/, 'The safety-stop information step must remain completable after its timer reaches zero.');
assert.ok(guidedLessonSource.indexOf("id: 'complete-safety-stop'") < guidedLessonSource.indexOf("id: 'explain-safety-stop'"), 'Safety-stop completion must precede its informational review.');
assert.match(guidedLessonSource, /Review what the safety-stop timer showed before beginning the ascent to the surface/);
assert.match(screenSource, /step\.id === 'explain-safety-stop' \? 'Continue to surfacing'/, 'The safety-stop review must provide a clear action into the ascent step.');
assert.ok(guidedLessonSource.indexOf("id: 'deep-stop-enter'") < guidedLessonSource.indexOf("id: 'deep-stop-complete'"), 'Deep-stop entry must precede its completion review.');
assert.match(guidedLessonSource, /completionBody: 'We observed the computer enter the deep stop during the ascent/);
assert.match(guidedLessonSource, /completionBody: 'We enabled the DEEP STOP setting/);
assert.doesNotMatch(guidedLessonSource, /completionBody: [^\n]*Next,/);
assert.match(guidedLessonSource, /After a dive, the computer displays the post-dive screen\./);
assert.match(guidedLessonSource, /ongoing off-gassing to provide more accurate limits for planning multiple dives\./);
assert.match(guidedLessonSource, /A longer surface interval allows more time to off-gas, which increases the NDL available for your next dive\./);
assert.match(guidedLessonSource, /cycle through every planner depth, compare each NDL, and continue until the starting depth appears again/);
assert.match(guidedLessonSource, /plannerCycleComplete/);
assert.doesNotMatch(guidedLessonSource, /device\.planner\.depthMeters !== 18/);
assert.doesNotMatch(guidedLessonSource, /the lesson will not open it for you/);
assert.match(screenSource, /step\.completionBody \|\| step\.body/);
assert.doesNotMatch(guidedLessonSource, /Stop the simulation when you see Dive mode activate/);
assert.doesNotMatch(guidedLessonSource, /press START SIMULATION\. Stop when the safety stop appears/);
assert.doesNotMatch(guidedLessonSource, /Press STOP SIMULATION so the explanation can be reviewed/);
assert.doesNotMatch(guidedLessonSource, /press START SIMULATION, then stop once the computer reaches the surface/);
assert.match(guidedLessonSource, /case 'activate-dive':[\s\S]*simulation\.environment\.depthMeters >= 17\.5/);
assert.doesNotMatch(guidedLessonSource, /case 'activate-dive':[\s\S]*clock\.status === 'paused'/);
assert.match(guidedLessonSource, /localizeGuidedDepthCopy/);
assert.match(guidedLessonSource, /guidedDiveStepAt\(index, depthUnit = 'ft'\)/);
assert.match(lessonHookSource, /guidedDiveStepAt\(stepIndex, depthUnit\)/, 'Guided lesson copy should follow the selected depth unit.');
assert.doesNotMatch(guidedLessonSource, /The simulation controls are now available\./, 'The simulator-control introduction should not use redundant availability copy.');
assert.match(screenSource, /REFERENCE DATE &amp; TIME/);
assert.match(guidedLessonSource, /planner-read/);
assert.match(guidedLessonSource, /deep-stop-enable/);
assert.match(guidedLessonSource, /Select saves the value currently shown, even when you leave it unchanged/);
assert.match(guidedLessonSource, /press SEL to retain each unchanged field and advance until DEEP STOP is displayed/);
assert.match(guidedLessonSource, /Press ADV to change DEEP STOP to ON, then press SEL to save it/);
assert.match(guidedLessonSource, /hold ADV and SEL together for about 3 seconds to return home/);
assert.match(guidedLessonSource, /case 'activate-dive':/);
assert.match(guidedLessonSource, /simulation\.dive\.lifecycle === 'diving'/);
assert.match(guidedLessonSource, /withinFiveMinutes/);
assert.match(guidedLessonSource, /simulation\.dive\.runtimeSeconds >= 600/);
assert.match(guidedLessonSource, /DEVICE_SCREENS\.DEEP_STOP/);
assert.match(guidedLessonSource, /deep-stop-start/);
assert.match(guidedLessonSource, /deep-stop-surface/);
assert.match(guidedLessonSource, /id: 'log-nav'/, 'The guided lesson should navigate to the logbook after both dives are complete.');
assert.match(guidedLessonSource, /id: 'log-latest-page-1'/);
assert.match(guidedLessonSource, /id: 'log-latest-page-2'/);
assert.match(guidedLessonSource, /id: 'log-latest-page-3'/);
assert.match(guidedLessonSource, /id: 'log-earlier-page-1'/);
assert.match(guidedLessonSource, /id: 'log-earlier-page-2'/);
assert.match(guidedLessonSource, /id: 'log-earlier-page-3'/);
assert.match(guidedLessonSource, /device\.logbook\.entries\.length >= 2/, 'The logbook lesson should require both completed dives.');
assert.match(guidedLessonSource, /reviewed three detail pages for each entry/, 'The final logbook review should teach both entries and all three pages.');
assert.match(guidedLessonSource, /completionBody: 'We opened the latest dive and reviewed all three pages/);
assert.doesNotMatch(guidedReviewBlock, /'log-open'|'log-latest-page-1'|'log-latest-page-2'|'log-earlier-page-1'|'log-earlier-page-2'/, 'Routine logbook navigation should not interrupt with redundant popups.');
assert.match(guidedLessonSource, /case 'deep-stop-enter':/);
assert.match(guidedLessonSource, /GUIDED_REVIEW_STEPS/);
assert.match(guidedLessonSource, /'surface-ready'/, 'The first ADV menu-navigation lesson should end with a foundational control takeaway.');
assert.match(lessonHookSource, /shouldShowGuidedCompletionReview\(step\.id\)/, 'Completion reviews should be limited to meaningful teaching milestones.');
assert.match(lessonHookSource, /AUTO_ADVANCE_DELAY_MS = 1250/, 'Routine completed steps should advance after a short confirmation pause.');
assert.match(lessonHookSource, /setTimeout\(\(\) => \{\s*advance\(\);/, 'Routine completed steps should reveal the next learning objective automatically.');

assert.doesNotMatch(lessonHookSource, /AUTO_PAUSE_STEPS/, 'Guided lessons must not pause the simulation automatically when an objective completes.');
assert.doesNotMatch(lessonHookSource, /AppState\.addEventListener/, 'The simulator should only stop from explicit user controls.');
assert.match(screenSource, /START SIMULATION/);
assert.match(screenSource, /STOP SIMULATION/);
assert.doesNotMatch(screenSource, /ENVIRONMENT SETUP|ACTUAL BREATHING GAS|PracticeSetupPanel|ScenarioChoice/, 'Free Practice should not expose environment setup or actual breathing-gas controls.');
assert.match(lessonHookSource, /objectiveComplete/);
assert.match(lessonHookSource, /completionVisible/);
assert.match(lessonHookSource, /observedCompletion/);
assert.match(lessonHookSource, /advanceLock/, 'Completion pop-ups must advance only once per lesson step.');
assert.match(lessonHookSource, /setStepIndex\(\(current\) => current \+ 1\);\s*setActionStarted\(false\);\s*observedCompletion\.current = false;/, 'Entering the next step must allow its own review popup to open.');
assert.match(lessonHookSource, /completionVisible && observedCompletion\.current && shouldShowGuidedCompletionReview\(step\.id\)/, 'A safety-stop review must remain readable even if its live timer finishes before Continue.');
assert.match(lessonHookSource, /!objectiveComplete && !completionVisible && !force/, 'An explicitly opened completion review must be allowed to continue once.');
assert.match(screenSource, /<Modal/);
assert.match(screenSource, /'set-hour', 'set-minute', 'set-year', 'set-month', 'set-day'/);
assert.match(guidedLessonSource, /case 'set-date-format':/);
assert.match(guidedLessonSource, /case 'set-day':/);
assert.match(guidedLessonSource, /completionBody: 'We set the computer’s clock and calendar and practiced/);
assert.match(guidedLessonSource, /Advance changes the value being edited, and Select accepts, saves, and progresses/);
assert.match(screenSource, /START HERE/);
assert.match(screenSource, /Welcome to the Dive Computer Trainer\./);
assert.match(screenSource, /no-decompression limit \(NDL\)/);
assert.match(screenSource, /rental computers, which can be less intuitive to operate and read/);
assert.match(screenSource, /Free Practice is separate: it is the unrestricted simulator/);
assert.match(screenSource, /orientationVisible/);
assert.match(screenSource, /Begin guided lesson/);
assert.match(screenSource, /explanationText\}[^]*instructionText\}/, 'Instruction panels should explain the concept before presenting the learning objective.');
assert.match(screenSource, /attentionElapsed/);
assert.match(screenSource, /focusLevel/);
assert.match(screenSource, /Animated\.loop/);
assert.match(screenSource, /Back to previous lesson step/);
assert.match(screenSource, /Next \(DEV\)/);
assert.match(lessonHookSource, /stepSnapshots/);
assert.match(lessonHookSource, /restoreSnapshot/);
assert.match(lessonHookSource, /prepareGuidedStep\(guidedDiveStepAt\(stepIndex \+ 1, depthUnit\)\.id\)/, 'The development skip path should prepare required guided settings.');
assert.match(lessonHookSource, /force = false/);
assert.match(screenSource, /Next \(DEV\)/);
assert.doesNotMatch(screenSource, /What you just did/);
assert.match(screenSource, /floatingObjective/);
assert.match(screenSource, /WHAT YOU JUST LEARNED/);
assert.match(screenSource, /targetIs18m \? 'simulation-toggle' : 'depth-18'/, 'The guided highlight should move from the depth target to Start Simulation after the target is selected.');
assert.match(screenSource, /if \(!controlledRateAcknowledged\) return \['rate-6'\]/, 'Controlled ascent should be invited visually without depending on the default rate value.');
assert.match(screenSource, /if \(control === 'rate-6'\) setControlledRateAcknowledged\(true\)/, 'The Controlled prompt should clear after the learner taps it.');
assert.match(screenSource, /targetMayBeBelowViewport/, 'The guided flow should determine whether a highlighted control is below the visible viewport.');
assert.match(screenSource, /attentionElapsed >= 4/, 'The viewport cue should wait for several seconds of inactivity before appearing.');
assert.match(screenSource, /SCROLL TO CONTROLS/, 'The guided flow should provide an accessible cue for off-screen controls.');
assert.match(screenSource, /lessonScrollRef\.current\?\.scrollTo\(\{ y: 72, animated: !reduceMotion \}\)/, 'Starting the simulation should smoothly recenter the guided viewport while honoring reduced motion.');
assert.match(screenSource, /onControlRegionLayout/, 'The viewport cue should use measured control regions rather than a fixed mobile-only offset.');
assert.match(screenSource, /if \(!targetIsStopDepth\) return \['depth-stop'\]/, 'The ascent lesson should sequence target depth before ascent rate and Start Simulation.');
assert.match(screenSource, /<GuidedLesson depthUnit=\{depthUnit\} onOpenPractice=/, 'The guided lesson should remain mounted when free practice opens so student progress is preserved.');
assert.match(screenSource, /<PracticeMode depthUnit=\{depthUnit\} onReturnToLesson=/, 'Free practice should remain mounted so returning to the lesson does not create a fresh practice session.');
assert.match(screenSource, /visible && completionVisible/, 'A hidden lesson must not leave its completion modal over free practice.');

// ---- Closing knowledge check: three unguided scenarios graded against the
// real device settings, logbook, and live dive data. ----
assert.match(guidedLessonSource, /id: 'quiz-intro'/);
assert.match(guidedLessonSource, /id: 'quiz-bluetooth'/);
assert.match(guidedLessonSource, /id: 'quiz-log-po2'/);
assert.match(guidedLessonSource, /id: 'quiz-dive'/);
assert.ok(
  guidedLessonSource.indexOf("id: 'log-earlier-page-3'") < guidedLessonSource.indexOf("id: 'quiz-intro'"),
  'The knowledge check must come after the guided logbook lesson.',
);
assert.ok(
  guidedLessonSource.indexOf("id: 'quiz-dive'") < guidedLessonSource.indexOf("id: 'complete'"),
  'The knowledge check must finish before the guided tour completion step.',
);
assert.match(guidedLessonSource, /case 'quiz-bluetooth':\s*\n\s*return device\.settings\.bluetooth === true;/, 'Scenario 1 completes only when Bluetooth is actually saved on.');
assert.match(guidedLessonSource, /case 'quiz-log-po2':\s*\n\s*return loggedDivePo2Matches\(device, quizAnswer\);/, 'Scenario 2 checks the entered answer against the saved dive entry.');
assert.match(guidedLessonSource, /case 'quiz-dive':\s*\n\s*return qualifyingQuizDive\(quizDiveObservation\);/, 'Scenario 3 grades the observed independent dive.');
assert.match(guidedLessonSource, /entry\.diveNumber === 2/, 'Scenario 2 reads Dive 2 from the logbook.');
assert.match(guidedLessonSource, /highestPpO2\.toFixed\(2\)/, 'Scenario 2 compares the two-decimal HIGHEST PO2 reading.');
assert.match(guidedLessonSource, /observation\.maxRuntimeSeconds >= 600/, 'A qualifying quiz dive must last at least ten minutes.');
assert.match(guidedLessonSource, /!observation\.deepStopActivated \|\| observation\.deepStopCompleted/, 'A deep stop is only required once the computer activates it.');
assert.match(guidedLessonSource, /!observation\.safetyStopActivated \|\| observation\.safetyStopCompleted/, 'A safety stop is only required once the computer activates it.');
assert.doesNotMatch(guidedLessonSource, /action: GUIDED_DIVE_ACTIONS\.OPEN_PRACTICE,\s*\n\s*action: GUIDED_DIVE_ACTIONS\.CONTINUE,/, 'The quiz-intro step must not declare a duplicate action key.');

const reviewBlock = guidedLessonSource.match(/GUIDED_REVIEW_STEPS = new Set\(\[[\s\S]*?\]\);/)[0];
for (const quizStep of ["'quiz-intro'", "'quiz-bluetooth'", "'quiz-log-po2'", "'quiz-dive'"]) {
  assert.ok(reviewBlock.includes(quizStep), `${quizStep} must pause for an explicit confirmation, not auto-advance.`);
}

assert.match(lessonHookSource, /quizAnswer: quizAnswerSubmitted/, 'The lesson hook must feed the submitted answer into scenario grading.');
assert.match(lessonHookSource, /quizDiveObservation/, 'The lesson hook must accumulate the live quiz-dive observation.');
assert.match(lessonHookSource, /sim\.dive\.diveSessionId !== previous\.sessionId/, 'The quiz-dive observation must reset when a new dive begins.');
assert.match(lessonHookSource, /submitQuizAnswer: \(\) => setQuizAnswerSubmitted\(quizAnswerInput\.trim\(\)\)/);
assert.match(lessonHookSource, /setQuizAnswerSubmitted\(null\)/, 'Editing the answer after a wrong guess must clear the previous verdict.');

assert.match(screenSource, /step\.answerPrompt \? \(/, 'The screen must render an answer field for scenarios that ask for a value.');
assert.match(screenSource, /QuizAnswerPanel/);
assert.match(screenSource, /QuizDiveChecklist/);
assert.match(screenSource, /step\.id === 'quiz-dive' \? <QuizDiveChecklist/);
assert.match(screenSource, /inputAccessoryViewID=\{hasNumberKeyboard \? NUMBER_KEYBOARD_ACCESSORY_ID : undefined\}/, 'The answer field should use the shared number-keyboard accessory.');
assert.match(screenSource, /step\.reviewButtonLabel \|\| \(step\.id === 'explain-safety-stop'/, 'The completion modal must honor a scenario-specific review button label.');
assert.match(screenSource, /step\.reviewLabel \|\| 'WHAT YOU JUST LEARNED'/);
assert.match(screenSource, /step\.reviewHeading \|\| 'What you learned'/);

// ---- DEV "Next" fast-forward: skipping a step must also advance the computer,
// simulation, and logbook to that step's completion state. ----
assert.match(lessonHookSource, /buildGuidedStepCompletionSnapshot\(step\.id, \{ actualTime: currentTime, depthUnit \}\)/, 'The DEV skip must fabricate the leaving step\'s completion state.');
assert.match(lessonHookSource, /if \(fabricated\) simulator\.restoreSnapshot\(fabricated\);/, 'The fabricated state must be applied via restoreSnapshot so Previous can step back to it.');
assert.match(screenSource, /Next \(DEV\)/);
assert.match(screenSource, /__DEV__ && !isLastStep \? <SecondaryButton label="Next \(DEV\)"/, 'The Next skip must stay DEV-only.');
assert.match(screenSource, /label="Previous" onPress=\{goBack\}/, 'Previous must remain a visible control that reverts via goBack.');
assert.match(stepFabricationSource, /export function buildGuidedStepCompletionSnapshot/);
assert.match(stepFabricationSource, /transitionVirtualDiveComputer/, 'Menu positions must be reached by replaying real device events.');
assert.match(stepFabricationSource, /advanceSimulation/, 'Dive states must be run through the real physics engine.');

const srcModule = (relative) => loadSourceModule(
  path.join(__dirname, '..', 'src', relative),
  path.join(__dirname, '..', 'src'),
);
const fabrication = srcModule('features/diveComputer/training/guidedStepFabrication.js');
const guidedLesson = srcModule('features/diveComputer/training/guidedDiveLesson.js');
const now = new Date();
const build = (id) => fabrication.buildGuidedStepCompletionSnapshot(id, { depthUnit: 'ft', actualTime: now });

for (const step of guidedLesson.GUIDED_DIVE_STEPS) {
  if (step.id === 'complete') {
    assert.equal(build('complete'), null, 'The final step has no next state to fabricate.');
    continue;
  }
  const snap = build(step.id);
  assert.ok(snap && snap.device && snap.simulation, `${step.id} must fabricate a usable snapshot.`);
  assert.equal(snap.scenarioId, 'guided-dive');
}

const clockSnap = build('set-day');
assert.equal(clockSnap.device.currentScreen, 'setTime.leadIn');
assert.equal(clockSnap.device.dateTime.year, now.getFullYear());
assert.equal(clockSnap.device.dateTime.month, now.getMonth() + 1);
assert.equal(clockSnap.device.dateTime.day, now.getDate());

const midDive = build('accumulate-time');
assert.equal(midDive.simulation.dive.lifecycle, 'diving');
assert.ok(midDive.simulation.dive.runtimeSeconds >= 600, 'Skipping accumulate-time must leave the dive past ten minutes.');
assert.equal(midDive.simulation.clock.status, 'running', 'A mid-dive skip must leave the simulation running.');

const deepStopSkip = build('deep-stop-enter');
assert.equal(deepStopSkip.simulation.deepStop.status, 'active');
assert.equal(deepStopSkip.device.settings.deepStop, true);

const afterSecondDive = build('deep-stop-surface');
assert.equal(afterSecondDive.device.logbook.entries.length, 2, 'Two logged dives after the deep-stop dive.');
assert.equal(afterSecondDive.simulation.clock.status, 'paused', 'A surfaced skip must leave the simulation paused.');

const logPo2Skip = build('quiz-log-po2');
assert.equal(logPo2Skip.device.currentScreen, 'log.data3');
const deepEntry = logPo2Skip.device.logbook.entries.find((entry) => entry.diveNumber === 2);
assert.ok(deepEntry && deepEntry.deepStopTriggered, 'The deeper logged dive must show a triggered deep stop.');
assert.equal(logPo2Skip.device.logbook.entries[logPo2Skip.device.logbook.selectedIndex].diveNumber, 2, 'quiz-log-po2 must land on the deeper dive entry.');
assert.equal(logPo2Skip.device.settings.bluetooth, true, 'Scenario 1 stays done after skipping into scenario 2.');
assert.ok(
  guidedLesson.evaluateGuidedDiveObjective('quiz-log-po2', {
    device: logPo2Skip.device,
    simulation: logPo2Skip.simulation,
    quizAnswer: deepEntry.highestPpO2.toFixed(2),
  }),
  'The fabricated logbook must accept the displayed HIGHEST PO2 as the scenario-2 answer.',
);

// ---- Warnings chapter: recognize -> acknowledge -> correct a rapid-ascent
// alarm, added between the logbook lesson and the knowledge check. ----
assert.match(guidedLessonSource, /id: 'warning-dive'/);
assert.match(guidedLessonSource, /id: 'warning-slow-ascent'/);
assert.match(guidedLessonSource, /id: 'warning-correct'/);
assert.ok(
  guidedLessonSource.indexOf("id: 'log-exit'") < guidedLessonSource.indexOf("id: 'warning-dive'")
  && guidedLessonSource.indexOf("id: 'warning-correct'") < guidedLessonSource.indexOf("id: 'quiz-intro'"),
  'The warnings chapter sits between the logbook lesson and the knowledge check.',
);
assert.match(guidedLessonSource, /case 'warning-slow-ascent':\s*\n\s*return device\.warning\.latchedCodes\.includes\('rapid-ascent'\);/, 'The alarm step completes when the rapid-ascent warning is raised.');
assert.match(guidedLessonSource, /case 'warning-correct':\s*\n\s*return simulation\.dive\.lifecycle === 'postDive';/);
for (const reviewStep of ["'warning-slow-ascent'", "'warning-correct'"]) {
  assert.ok(guidedReviewBlock.includes(reviewStep), `${reviewStep} must pause for a takeaway.`);
}

const warnedSkip = build('warning-slow-ascent');
assert.equal(warnedSkip.simulation.dive.lifecycle, 'diving');
assert.ok(warnedSkip.device.warning.latchedCodes.includes('rapid-ascent'), 'Skipping the alarm step must leave the rapid-ascent warning raised.');
assert.ok(
  guidedLesson.evaluateGuidedDiveObjective('warning-slow-ascent', { device: warnedSkip.device, simulation: warnedSkip.simulation }),
  'The fabricated alarm state must satisfy the warning objective.',
);
const afterWarning = build('warning-correct');
assert.equal(afterWarning.device.logbook.entries.length, 3, 'The warnings chapter adds a third logged dive.');

// ---- Nitrox chapter: program EAN32, read its MOD in the planner, and the
// oxygen-status screen (ALT 3) that a nitrox gas unlocks. ----
assert.match(guidedLessonSource, /id: 'nitrox-setgas-nav'/);
assert.match(guidedLessonSource, /id: 'nitrox-set-ean32'/);
assert.match(guidedLessonSource, /id: 'nitrox-mod'/);
assert.match(guidedLessonSource, /id: 'nitrox-o2-screen'/);
assert.ok(
  guidedLessonSource.indexOf("id: 'warning-correct'") < guidedLessonSource.indexOf("id: 'nitrox-setgas-nav'")
  && guidedLessonSource.indexOf("id: 'nitrox-o2-screen'") < guidedLessonSource.indexOf("id: 'quiz-intro'"),
  'The nitrox chapter sits between the warnings chapter and the knowledge check.',
);
assert.match(guidedLessonSource, /case 'nitrox-set-ean32':[\s\S]*device\.configuredGas\.fo2 === 0\.32/);
assert.match(guidedLessonSource, /case 'nitrox-mod':[\s\S]*device\.currentScreen === DEVICE_SCREENS\.PLAN_ACTIVE/);
assert.match(guidedLessonSource, /case 'nitrox-o2-screen':\s*\n\s*return device\.currentScreen === DEVICE_SCREENS\.ALT_3;/);

const ean32Skip = build('nitrox-set-ean32');
assert.equal(ean32Skip.device.configuredGas.fo2, 0.32, 'Skipping the EAN32 step must leave the computer programmed for nitrox.');
assert.equal(ean32Skip.device.currentScreen, 'setGas.leadIn');
const modSkip = build('nitrox-mod');
assert.equal(modSkip.device.currentScreen, 'plan.active');
assert.ok(modSkip.device.planner.depthMeters >= 36, 'The MOD step lands past the EAN32 MOD.');
const o2Skip = build('nitrox-o2-screen');
assert.equal(o2Skip.device.currentScreen, 'surface.alt3');
assert.equal(build('quiz-intro').device.configuredGas.fo2, 0.32, 'The nitrox setting carries into the knowledge check.');

// ---- Free Practice scenario picker: the ascent-control and deco scenarios
// are reachable, with live coaching text. ----
assert.match(screenSource, /function ScenarioSelector/);
assert.match(screenSource, /DIVE_COMPUTER_SCENARIOS/);
assert.match(screenSource, /simulator\.setScenarioId/);
assert.match(screenSource, /simulator\.guidance\.title/);
assert.doesNotMatch(screenSource, /accessibilityRole="tablist"/);
const scenarios = srcModule('features/diveComputer/scenarios.js');
assert.deepEqual(scenarios.DIVE_COMPUTER_SCENARIOS.map((s) => s.id), ['guided-dive', 'ascent-control', 'decompression-response']);
for (const scenarioId of ['ascent-control', 'decompression-response']) {
  const seeded = engine.seedDiveComputerState({ depthMeters: 20, minutesAtDepth: 10 });
  const guidance = scenarios.scenarioGuidance({ computer: seeded, scenarioId, stage: 0, travelRateMpm: 6 });
  assert.ok(guidance && guidance.title && guidance.action && guidance.body, `${scenarioId} must return coaching copy.`);
}

// ---- Press-vs-hold drill + concept copy. ----
assert.match(guidedLessonSource, /id: 'button-basics'/);
assert.ok(
  guidedLessonSource.indexOf("id: 'introduction'") < guidedLessonSource.indexOf("id: 'button-basics'")
  && guidedLessonSource.indexOf("id: 'button-basics'") < guidedLessonSource.indexOf("id: 'surface-ready'"),
  'The tap-versus-hold drill comes right after the introduction.',
);
assert.match(guidedLessonSource, /case 'button-basics':\s*\n\s*return Boolean\(buttonGesturesComplete\);/);
assert.ok(guidedReviewBlock.includes("'button-basics'"), 'The button drill pauses for a takeaway.');
assert.match(lessonHookSource, /buttonGesturesComplete/, 'The lesson hook tracks the tap and hold gestures for the drill.');
assert.match(lessonHookSource, /LEFT_SHORT' \|\| event === 'RIGHT_SHORT'/, 'The drill counts a quick tap on either button.');
assert.match(lessonHookSource, /LEFT_LONG' \|\| event === 'RIGHT_LONG'/, 'The drill counts a press-and-hold on either button.');
assert.match(guidedLessonSource, /NDL is your no-decompression limit/, 'The descent step explains what NDL is and what zero means.');
assert.match(guidedLessonSource, /residual nitrogen[\s\S]*longer surface interval buys you more bottom time/, 'The planner review explains residual nitrogen and surface intervals.');
assert.match(guidedLessonSource, /the one screen on the computer where the buttons swap roles|the only screen on the computer where the buttons swap roles/, 'The logbook lesson calls out the ADV-means-back reversal.');

const drillSkip = build('button-basics');
assert.equal(drillSkip.device.currentScreen, 'surface.home');
assert.equal(drillSkip.scenarioId, 'guided-dive');
assert.equal(
  guidedLesson.evaluateGuidedDiveObjective('button-basics', { device: drillSkip.device, simulation: drillSkip.simulation }),
  false,
  'The drill is not complete until both gestures are performed.',
);
assert.ok(
  guidedLesson.evaluateGuidedDiveObjective('button-basics', { device: drillSkip.device, simulation: drillSkip.simulation, buttonGesturesComplete: true }),
  'The drill completes once the hook reports both gestures.',
);

console.log('Dive computer simulator checks passed.');
