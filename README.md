# DMZ Scuba App

The DMZ Scuba iOS app combines interactive education, dive-planning utilities, Dive Lens, and a synced customer account.

## Development

```powershell
npm install
npx expo start
```

Use `npx expo start --clear` after changing native configuration or when Metro is serving stale modules.

## Project structure

- `src/application/` owns navigation and top-level composition.
- `src/features/` owns feature catalogs and stateful feature controllers.
- `src/screens/` owns complete screens.
- `src/components/` owns reusable visual building blocks.
- `src/lib/` owns framework-independent calculations, validation, and API clients.
- `scripts/` contains fast structural and calculation regression checks.

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) before adding a screen or feature.

## Verification

```powershell
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
npx expo-doctor
```
