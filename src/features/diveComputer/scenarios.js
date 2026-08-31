export const DIVE_COMPUTER_SCENARIOS = Object.freeze([
  {
    id: 'guided-dive',
    label: 'Guided dive',
    shortLabel: 'Guided',
    summary: 'Learn the primary display, make a controlled ascent, complete a safety stop, and surface.',
    seed: null,
  },
  {
    id: 'ascent-control',
    label: 'Ascent control',
    shortLabel: 'Ascent',
    summary: 'Begin at 20 m and intentionally trigger, acknowledge, and correct a rapid-ascent warning.',
    seed: { depthMeters: 20, minutesAtDepth: 10 },
  },
  {
    id: 'decompression-response',
    label: 'Deco response',
    shortLabel: 'Deco',
    summary: 'Practice reading a training ceiling and moving into the indicated stop zone.',
    seed: { depthMeters: 30, minutesAtDepth: 35 },
  },
]);

export function getDiveComputerScenario(scenarioId) {
  return DIVE_COMPUTER_SCENARIOS.find((scenario) => scenario.id === scenarioId) || DIVE_COMPUTER_SCENARIOS[0];
}

export function scenarioGuidance({ computer, scenarioId, stage, travelRateMpm }) {
  if (scenarioId === 'ascent-control') {
    if (stage === 0) {
      return {
        action: 'Choose Fast, then set target depth to 5 m / 15 ft.',
        body: 'Watch the ascent-rate bar build. The computer should issue a SLOW ASCENT alarm above 9 m/min (30 ft/min).',
        title: 'Trigger the ascent warning',
      };
    }
    if (stage === 1) {
      return {
        action: 'Tap ACK on the computer, choose Controlled, and keep the target near 5 m / 15 ft.',
        body: `The current selected travel rate is ${travelRateMpm} m/min. Reduce it to 6 m/min so the warning condition clears.`,
        title: 'Acknowledge and correct',
      };
    }
    if (stage === 2 && computer.mode === 'safety-stop') {
      return {
        action: 'Remain between 3 and 6.5 m until the stop reaches 0:00.',
        body: 'The stop timer only earns credit while the simulated diver remains in the training stop zone.',
        title: 'Hold the safety stop',
      };
    }
    if (stage === 2 && !computer.safetyStopCompleted) {
      return {
        action: 'Keep the target near 5 m / 15 ft and remain at the Controlled rate.',
        body: 'The rapid-ascent condition has cleared. Continue watching the ascent bar as you approach the safety-stop zone.',
        title: 'Continue under control',
      };
    }
    return {
      action: 'Set the target depth to the surface after the safety stop completes.',
      body: 'You recognized the alarm and returned to a controlled ascent rate.',
      title: 'Finish the ascent',
    };
  }

  if (scenarioId === 'decompression-response') {
    if (computer.mode === 'decompression' && computer.depthMeters > computer.stopDepthMeters + 1) {
      return {
        action: `Use Controlled ascent and set the target just deeper than ${Math.max(3, computer.stopDepthMeters).toFixed(0)} m.`,
        body: 'The amber stop depth is a training ceiling. Approach it without crossing shallower than the displayed stop.',
        title: 'Approach the stop zone',
      };
    }
    if (computer.activeAlarm?.code === 'missed-stop') {
      return {
        action: `Move deeper than ${computer.stopDepthMeters.toFixed(0)} m and acknowledge the alarm.`,
        body: 'No stop credit is earned while the simulated diver is shallower than the required stop.',
        title: 'Correct the missed stop',
      };
    }
    return {
      action: 'Hold the indicated stop depth and watch the ceiling and stop-time estimate change.',
      body: 'This scenario teaches display interpretation only; it is not a decompression schedule for a real dive.',
      title: 'Monitor the obligation',
    };
  }

  if (stage === 0) {
    return {
      action: 'Set a target of 18 m / 60 ft, then press Start.',
      body: 'Dive mode activates automatically after five simulated seconds below 1.5 m / 5 ft.',
      title: 'Begin the descent',
    };
  }
  if (stage === 1) {
    return {
      action: 'Continue to approximately 18 m / 60 ft.',
      body: 'Locate current depth, NDL, elapsed dive time, and the nitrogen-loading bar on the main screen.',
      title: 'Read the main display',
    };
  }
  if (stage === 2) {
    return {
      action: 'Stay near 18 m / 60 ft until the coach advances.',
      body: 'Use NEXT to compare the gas and dive-information screens while simulated time advances.',
      title: 'Monitor the dive',
    };
  }
  if (stage === 3) {
    return {
      action: 'Choose Controlled and set a target of 5 m / 15 ft.',
      body: 'The ascent-rate indicator should stay below its final warning segment.',
      title: 'Make a controlled ascent',
    };
  }
  if (stage === 4) {
    return {
      action: 'Keep the target near 5 m / 15 ft until the timer reaches 0:00.',
      body: 'Moving outside the stop zone pauses the countdown. The simulator does not penalize a missed recreational safety stop.',
      title: 'Complete the safety stop',
    };
  }
  if (stage === 5) {
    return {
      action: 'Set the target depth to 0 and remain at a controlled rate.',
      body: 'The computer changes to its post-dive surface display below 0.9 m / 3 ft.',
      title: 'Return to the surface',
    };
  }
  return {
    action: 'Review the event log, then reset or choose another scenario.',
    body: 'You activated dive mode, monitored NDL, controlled the ascent, completed a stop, and surfaced.',
    title: 'Guided dive complete',
  };
}
