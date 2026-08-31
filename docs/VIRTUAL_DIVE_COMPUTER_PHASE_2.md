# Virtual Dive Computer — Phase 2

`src/lib/virtualDiveComputer/` is the deterministic, UI-independent virtual-device domain. It consumes public `DiveSimulationState` snapshots and remains functional without React, screens, components, or training modules.

## Ownership

The device owns lifecycle/display mode, screen selection, menu stack and cursor, settings, `configuredGas.fo2`, planner navigation, logbook navigation, warning presentation and acknowledgement, editing state, button interpretation, and device-time flashing.

The device does not own current physical depth, actual gas, tissues, NDL, decompression calculations, physical ascent rate, or student progress. It never reads the transitional compatibility adapter or `__simulation`.

`configuredGas.fo2` never changes `simulation.environment.actualGas.fo2`. A disagreement between these values is a supported state.

## Screen graph

- Surface: `surface.primary` → `surface.secondary` → `surface.preDive`
- Root menu: `menu.root`
- Settings: `settings.root` → `settings.units`
- Gas: `gas.settings`
- Planner: `planner.main` → `planner.detail`
- Logbook: `logbook.list` → `logbook.detail`
- Dive: `dive.primary` ↔ `dive.secondary`
- Automatic dive presentations: `dive.warning`, `dive.safetyStop`, `dive.decompression`
- Post-dive: `postDive.summary` ↔ `postDive.details`

Automatic presentations enter the graph in response to `SIMULATION_UPDATED`. They do not prevent the diver from cycling to the standard dive pages while the physical condition persists.

## Button behavior

| Context | Left short | Right short | Left long | Right long |
|---|---|---|---|---|
| Surface/pre-dive | Next surface page | Next surface page | Primary surface page | Open menu |
| Menu/settings | Next item | Select item | Back | Exit menu |
| Gas view | — | Edit | Back | Exit menu |
| Gas editing | Increase FO2 | Save | Decrease FO2 | Cancel |
| Planner | Increase depth | Open/close detail | Decrease depth or back from detail | Exit menu |
| Logbook | Next entry | Open/close detail | Back | Exit menu |
| Normal dive | Next dive page | — | Primary dive page | — |
| Unacknowledged warning | View another page | Acknowledge | Primary dive page | Acknowledge |
| Post-dive | Next post-dive page | Next post-dive page | Summary | Open menu |

Presses shorter than 650 ms are short presses. Presses at least 650 ms are long presses.

## Public API

- `createVirtualDiveComputer(config)`
- `transitionVirtualDiveComputer(state, event)`
- `interpretButtonPress(state, button, durationMs)`
- `buildVirtualDiveComputerDisplay(device, simulation)`
- `DEVICE_EVENTS`
- `DEVICE_SCREENS`
- `SCREEN_GRAPH`
- Menu and screen-cycle definitions

## Simulation integration

The only automatic synchronization event is:

```text
{
  type: SIMULATION_UPDATED,
  simulation: publicDiveSimulationState
}
```

The device observes lifecycle, safety-stop state, decompression obligation, and objective warning booleans. It stores only its presentation response. Device acknowledgement never mutates the simulation snapshot.

`TICK` advances device-only behavior such as warning flashing. It does not drive dive physics. Profile history is used only when recording logbook metadata and never drives device transitions.

## Display model

The generated display model includes semantic IDs and structured values for:

- `primary.depth`, `primary.ndl`, `primary.diveTime`, and `primary.timeRemaining`
- `secondary.maximumDepth`, `secondary.temperature`, CNS, tissue load, and surface interval
- `ascentRate`
- `configuredGas`
- `warning`
- `stop`
- `labels`
- `button.left` and `button.right`
- `menu.current`
- `planner`
- `logbook`

The React face renders this model and dispatches button events. It does not select virtual-device screens directly.
