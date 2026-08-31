# Dive Simulation Engine — Phase 1

`src/lib/diveSimulation/` is the authoritative, UI-independent simulated-dive domain. It can execute directly in Node and must not import React, React Native, screens, components, training, lessons, or the future virtual dive computer.

## State ownership

- `clock`: paused/running status, simulation speed, and elapsed simulation time.
- `controls`: target depth and deterministic ascent/descent rates.
- `environment`: current/previous depth, signed vertical rate, and actual breathing gas.
- `dive`: lifecycle, activation time, runtime, surface interval, maximum depth, and completed-dive count.
- `physiology`: tissues, NDL, tissue loading, oxygen exposure, and decompression obligation.
- `safetyStop`: status and remaining time. Eligibility is derived from status through `selectSafetyStopEligible` rather than stored twice.
- `warnings`: objective physical facts only. There is no acknowledgement, flashing, sound, or dismissal state.
- `profile`: canonical samples recorded every five simulated seconds.
- `events`: objective lifecycle facts used later by logbook and device layers.

Positive `environment.verticalRateMpm` means ascent. Negative values mean descent. Use the exported selectors when callers need unsigned ascent or descent rates.

`environment.actualGas.fo2` is the gas being breathed. It is permanently independent of the future device's `configuredGas.fo2`; changing a computer setting must never change actual gas.

## Public API

- `createSimulation(config)`
- `stepSimulation(state, elapsedRealSeconds)`
- `advanceSimulation(state, { elapsedSimulationSeconds, depthMeters? })`
- `setTargetDepth(state, depthMeters, rateOptions?)`
- `setDepth(state, depthMeters)`
- `setActualGas(state, { fo2 })`
- `setSimulationSpeed(state, speed)`
- `pauseSimulation(state)`
- `resumeSimulation(state)`
- `surfaceSimulation(state, rateOptions?)`
- `selectAscentRateMpm(state)`
- `selectDescentRateMpm(state)`
- `selectDiveMode(state)`
- `selectDiveTimeRemainingMinutes(state)`
- `selectIsDive(state)`
- `selectSafetyStopEligible(state)`

`stepSimulation` converts real elapsed time using the state's speed. `advanceSimulation` is the explicit simulated-time transition used for deterministic profiles, external scenario setup, and the compatibility adapter.

## Transitional adapter

`src/lib/diveComputer.js` translates domain snapshots into the state shape expected by the existing screen and components. Alarm acknowledgement, warning labels/tones, formatting helpers, and the old scenario seed helper remain there temporarily because they are not simulation-domain concerns.

New code should consume `diveSimulation` directly. The adapter is scheduled for removal after the virtual-computer and lesson migrations.
