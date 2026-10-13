# First-time personal setup

DMZ Scuba presents personal setup automatically only while the local app setting `firstTimeSetup.status` is `pending`. Finishing writes `complete`; accepting the warning and skipping writes `skipped`. Both states permanently suppress automatic presentation on that installation, including after normal app updates. A settings record from an older app version is migrated to `skipped`, so installing an update does not masquerade as a fresh download. Deleting and reinstalling the app clears local storage, so a genuinely fresh install presents setup again.

The setup can always be opened deliberately from **More → Settings → Preferences → Run personal setup**. A manual rerun does not clear existing answers before it opens.

## Flow

1. **Welcome** explains which connected features benefit from setup.
2. **Account** restores an existing secure session first. If there is no session, the diver can sign in with the normal DMZ account flow or explicitly continue without an account. Successful sign-in fetches account data and applies supported synced settings before the units page appears.
3. **Units** chooses an Imperial or Metric starting set across depth, pressure, gas volume and temperature.
4. **Dive preferences** records thermal tendency, preferred drysuit threshold, motion sensitivity and whether technical/trimix controls should be visible. These are preferences, not certifications.
5. **Temperature preferences** asks whether to connect real Gear Locker exposure items to comfortable water-temperature ranges now or later. A matching personal range replaces the Atlas generic exposure starting point; without a match, the generic planning band remains visible. The editor never creates placeholder gear or changes a saved setup.
6. **Starting baseline** accepts optional SAC, RMV, average depth, duration and minimum-temperature values. Blank fields stay unknown.
7. **Finish** optionally enables location-assisted site matching. OS location permission is requested only when this option is selected and the diver saves.

The Skip action always displays a warning that personalized gas estimates, exposure guidance, site suggestions and consistent unit defaults may be incomplete. The app remains fully usable, and setup remains available in Settings.

## Persistence and precedence

- App settings key: `@dmz-scuba/app-settings-v1`
- Gear/exposure advice key: `@dmz-scuba/gear-advice/v1`
- Automatic gate: `firstTimeSetup.status === 'pending'`
- Legacy install detection: a stored settings object without `firstTimeSetup` is migrated to `skipped`; empty storage keeps the fresh-install `pending` default.
- Account sync is not allowed to overwrite the phone's setup-completed/skipped state, preventing sign-in from reopening onboarding.
- Imported or manually logged dive evidence takes precedence over setup baseline values one measurement at a time. For example, recorded SAC can replace starting SAC while starting temperature remains available until temperature evidence exists.

## Debugging

Run:

```sh
npm run test:onboarding
npm run test:settings
npm run test:dive-intelligence
```

To exercise the automatic path in a development build, clear the app's local data or set `firstTimeSetup` to `{ "version": 0, "status": "pending", "completedAt": "" }`. To test a normal relaunch or update, use either `complete` or `skipped` and confirm setup does not appear. Use **Run personal setup** to verify the explicit rerun independently of the automatic gate.
