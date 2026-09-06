# DMZ Scuba

DMZ Scuba is a dark-themed Expo / React Native app for scuba divers. It combines dive education, planning tools, dive-computer workflows, a local logbook, Dive Lens, account sync, and shareable dive-profile cards in one mobile experience.

The project targets Expo SDK 57, React Native 0.86, and React 19. The primary production target is iOS, with Android and web development support where the underlying feature permits it.

## What the app does

- **Learn:** scuba education and interactive demonstrations.
- **Tools:** calculators and practical dive utilities such as Boyle’s Law, color-loss education, tank profiles, and dive planning.
- **Dive Lens:** identifies marine life or gear from a selected image or camera input through the configured Lens service.
- **Dive logbook:** imports logs from supported dive computers over Bluetooth, supports manual dives, reconciles downloads from multiple computers, and provides filtering, sorting, statistics, trends, exports, and health checks.
- **Virtual dive computer:** runs a deterministic dive simulation and renders a physical-instrument-style training interface with warnings, profiles, and guided lessons.
- **Dive photos:** matches camera-roll photo timestamps to dives, supports manual reassignment, protects against duplicate links, provides a dive gallery, and uses linked photos in share cards.
- **Account:** supports login, profile data, certification information, secure session storage, and authenticated settings synchronization.
- **Sharing:** creates styled dive-profile cards and can save or share them through platform integrations.

## Tech stack

- Expo SDK `~57.0.19`
- React Native `0.86.3`
- React `19.2.3`
- AsyncStorage for local app and logbook data
- SecureStore for account credentials/tokens
- `react-native-ble-plx` and a local Expo module bridge for dive-computer downloads
- Expo Image Picker, Media Library, Image Manipulator, Sharing, Location, and Web Browser integrations

## Getting started

Requirements:

- Node.js compatible with Expo SDK 57 (Node `22.13.x` or newer in the SDK reference)
- npm
- Xcode for iOS development
- Android Studio / Android SDK for Android development
- An Expo-compatible development client for native modules such as Bluetooth

Install and start Metro:

```bash
npm install
npx expo start
```

Useful variants:

```bash
npx expo start --clear   # clear Metro caches
npm run ios              # build/run the iOS native project
npm run android          # build/run Android
npm run web              # run the web target
```

Native folders are generated and intentionally ignored. Native configuration is applied through `app.json` and the plugins in `plugins/`.

## Repository layout

```text
App.js                         Native entry point
src/application/               App shell and navigation
src/components/                Shared UI primitives and layouts
src/features/                  Stateful product capabilities
src/screens/                   Full-screen feature presentation
src/lib/                       Framework-independent domain logic and services
  diveLog/                     Dive schema, storage, reconciliation, photos, exports
  diveSimulation/              Deterministic simulation state and calculations
  virtualDiveComputer/         Device state, warnings, display model, and controls
assets/                        App icons, splash assets, and brand imagery
modules/                       Local native modules, including dive-computer bridge
plugins/                       Expo config plugins
scripts/                       Fast structural and domain regression checks
docs/                          Architecture and feature planning documents
vendor/                        Vendored libdivecomputer source
```

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before adding a screen, feature, or domain module.

## Architectural boundaries

`src/application/` owns top-level composition and navigation. `App.js` remains the native entry point and should not become a second navigation system.

`src/features/` owns cohesive product workflows and stateful controllers. Examples include account sessions, app settings, dive-log state, dive-computer downloads, Dive Lens, share cards, and the feature catalog.

`src/screens/` owns full-screen presentation and screen-local form state. Screens consume operations from feature hooks instead of becoming the source of truth for global state.

`src/components/` contains reusable visual patterns such as cards, headers, buttons, menus, and app-shell layouts.

`src/lib/` contains calculations, schemas, validation, storage, API clients, matching, and other logic that should remain testable without rendering React Native.

## Dive logbook workflow

The logbook uses a v2 data model:

- A **Dive** is the canonical counted/user-facing record.
- A **ComputerLog** is a download from one physical computer attached to a Dive.
- Multiple computer downloads can be reconciled into one dive.
- Manual dives and imported dives share the same normalized schema.
- Canonical measurements are stored in SI units; conversion happens at the presentation edge.

The normal computer workflow is:

1. Discover and connect to a supported dive computer over Bluetooth.
2. Download and parse computer logs through the native bridge.
3. Normalize and persist the logs locally.
4. Reconcile matching dives across computers and surface ambiguous merges for review.
5. Rebuild the lightweight index used for folders, filtering, and fast list rendering.

The logbook also supports manual editing, bulk edits, soft deletion, snapshots/backups, exports, integrity checks, and repair operations.

### Photo handling

Photos are linked to local camera-roll assets; the logbook does not upload image bytes during timestamp matching. The importer:

1. Requests photo-library permission.
2. Reads selected assets and their capture metadata.
3. Matches capture time against dive start/end windows.
4. Removes repeated assets in the current selection.
5. Skips assets already linked anywhere in the active logbook.
6. Shows a review sheet for automatic matches and manual reassignment.
7. Enforces the duplicate check again when links are persisted.

Asset ID, persisted photo ID, and URI are treated as identity signals. This prevents repeated picker selections and repeated imports from creating multiple links to the same camera-roll asset. Removing a link never deletes the underlying camera-roll photo.

## Simulation and virtual computer

The simulation domain in `src/lib/diveSimulation/` owns deterministic environmental, lifecycle, physiological, warning, and profile-history transitions. It uses a one-simulated-second integration step, while canonical profile history is recorded separately at five-second intervals.

The virtual computer in `src/lib/virtualDiveComputer/` consumes public simulation snapshots and produces a semantic display model. It owns device navigation, configuration, warnings, and controls. The physical instrument UI in `src/features/diveComputer/ui/` renders that model and dispatches semantic input events.

Actual breathing gas belongs to the simulation environment. A virtual computer’s configured gas is separate device state and must only affect the simulation through an explicit command.

## Data, services, and permissions

- **Local settings:** AsyncStorage through `src/lib/appSettings.js` and the settings feature.
- **Dive data:** AsyncStorage-backed logbook storage in `src/lib/diveLog/storage.js`.
- **Account credentials:** Expo SecureStore through `src/lib/accountApi.js` and the account feature.
- **Photo library/camera:** Expo Image Picker and Media Library, with permission text configured in `app.json`.
- **Location:** optional background/coarse location for dive-site suggestions.
- **Bluetooth:** dive-computer discovery and transfer through the native bridge.
- **Sharing:** platform sharing and saving of generated dive cards.

Review permission copy in `app.json` whenever a device capability changes. Never commit local credentials, signing files, or environment secrets.

## Verification

The project uses small Node-based verification scripts rather than a single test runner. Run the focused check while developing, then run the full suite before handoff:

```bash
npm run test:architecture
npm run test:account
npm run test:auth
npm run test:settings
npm run test:keyboard
npm run test:calculator
npm run test:integration
npm run test:lens
npm run test:tanks
npm run test:physics
npm run test:dive-simulation
npm run test:virtual-dive-computer
npm run test:dive-computer-ui
npm run test:dive-computer-workspace
npm run test:dive-computer
npm run test:dive-log
```

For a release-oriented check, also run:

```bash
npx expo-doctor
npx expo export --platform ios
```

The verification scripts inspect framework-independent modules, screen wiring, feature boundaries, and important user flows. Native Bluetooth, camera, permission, and visual behavior still require device or simulator validation.

## Development conventions

- Use `npx expo install` for Expo packages so versions stay compatible with the installed SDK.
- Keep calculations and domain rules in `src/lib/`, not inside screens or animation code.
- Keep account tokens in SecureStore and user preferences behind their existing controllers.
- Reuse shared UI primitives and the established dark-blue/cyan/red visual language.
- Preserve safe-area insets and 44-point minimum tap targets.
- Add or update a focused `scripts/verify-*.cjs` check for meaningful domain behavior.
- Update the relevant document in `docs/` when a workflow or architectural boundary changes.

## Further reading

- [Architecture](docs/ARCHITECTURE.md)
- [Logbook plan](docs/LOGBOOK_PLAN.md)
- [Dive Lens](docs/DIVE_LENS.md)
- [Dive simulation phases](docs/DIVE_SIMULATION_PHASE_1.md)
- [Virtual dive computer phases](docs/VIRTUAL_DIVE_COMPUTER_PHASE_2.md)
- [Expo SDK 57 documentation](https://docs.expo.dev/versions/v57.0.0/)
