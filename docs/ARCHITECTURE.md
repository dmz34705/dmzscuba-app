# DMZ Scuba App Architecture

## Goals

The app should remain easy to understand as education, planning, account, camera, and booking features grow. New features should fit an existing boundary instead of adding another condition to the root app.

## Ownership

### `src/application/`

Owns top-level composition and navigation state. `AppNavigator.js` connects feature controllers to screens but does not implement account storage, calculations, or feature copy.

### `src/features/`

Owns cohesive product capabilities:

- `account/` manages session restoration, profile state, certification changes, and account settings sync.
- `settings/` manages local preference hydration and persistence.
- `catalog/` is the single source of truth for discoverable lessons and tools.

Add a new feature folder when a capability has its own state, API workflow, or reusable domain behavior.

### `src/screens/`

Owns full-screen presentation and local form state. Screens receive navigation and account operations through props. They should not become the source of truth for global sessions or preferences.

### `src/components/`

Owns reusable visual patterns. Use `ScreenHeader`, `ScreenIntro`, `SectionHeading`, `StatusBanner`, `Card`, and the shared buttons before creating one-off layout styles.

### `src/lib/`

Owns API clients, validation, conversions, and calculation functions. Keep these modules independent of screen layout so they can be tested without rendering React Native.

The dive simulator domain lives in `lib/diveSimulation/`. It owns deterministic environmental, lifecycle, physiological, warning-fact, and profile-history transitions and has no React, UI, lesson, or virtual-device dependencies. `lib/diveComputer.js` is a temporary Phase 1 compatibility adapter for the current flat display state; new domain behavior must not be added to that adapter.

Actual breathing gas is always `DiveSimulationState.environment.actualGas`. A future virtual computer's configured gas is independent device state. Never synchronize these values implicitly: only an explicit simulation/environment command changes actual gas.

The dependency direction is simulation domain to future virtual device to presentation. Training may observe both domains but must not be imported by either. Never move simulated-time calculations into an animation, screen, or lesson component.

The virtual device domain lives in `lib/virtualDiveComputer/`. It consumes only public `DiveSimulationState` snapshots through `SIMULATION_UPDATED`, owns navigation/configuration/warning presentation, and produces a semantic display model. It must never import `lib/diveComputer.js`, access `__simulation`, recalculate physical warning conditions, or mutate actual breathing gas.

The physical instrument UI lives in `features/diveComputer/ui/`. It consumes only the semantic device display model and dispatches the existing device input events. Housing geometry must remain independent of device screens and lesson content. The transitional `components/DiveComputerFace.js` is lesson-only until lesson migration.

The simulation uses a deterministic one-simulated-second internal integration step. Canonical profile history remains a separate five-second recorder and is not the timing source for physiology, lifecycle, warnings, safety stops, or device synchronization.

## Adding a lesson or tool

1. Add one entry to `src/features/catalog/featureCatalog.js`.
2. Reuse an icon in `FeatureIcon.js` or add one mapping there.
3. Add a detail renderer in `AppNavigator.js` only when the feature introduces a new route type. Existing web demos, calculators, and lens-style tools reuse their current renderer.
4. Add a focused regression check for the new domain behavior.

Home counts, Learn/Tools listings, labels, summaries, and feature routing all derive from the catalog.

## Navigation rules

- Persistent destinations belong in `APP_TABS`.
- Temporary workflows and feature details use a detail route.
- A detail screen always receives an `onBack` callback.
- Selecting a tab closes the active detail route.
- Do not add navigation conditions to `App.js`; it remains the native entry point.

## State rules

- Account tokens remain in secure storage through `accountApi.js`.
- Account state is owned by `useAccountSession`.
- App preferences are owned by `useAppSettings` and synchronized by the account controller after authentication.
- Form drafts remain inside their screen until saved.
- Calculator math remains in `src/lib/`; screens only gather inputs and present results.

## UI rules

- Use one clear screen title and one short explanatory sentence.
- Group related controls into cards or inset groups.
- Keep the Home tab short; discovery belongs in Learn and Tools.
- Use the bottom tab bar only for stable top-level destinations.
- Use cyan for navigation and information, red for primary actions, green for success, amber for warnings, and the dark blue palette for surfaces.
- Keep tap targets at least 44 points tall and respect safe-area insets.
- Prefer plain, task-oriented labels such as “Save profile” and “Open calculator.”

## Regression expectations

Before handing off a change:

1. Run every `npm run test:*` script.
2. Run `npx expo-doctor`.
3. Export the iOS bundle with `npx expo export --platform ios`.
4. For API-backed changes, run the matching Worker tests and a Wrangler dry run before deployment.
