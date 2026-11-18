# DMZ Scuba 0.1.0 Beta 2

Git tag: `v0.1.0-beta.2` • Status: prerelease • Prepared November 18, 2026

This source prerelease captures all current app changes, including the previously
unpublished stabilization commits and Claude's uncommitted Dive Lens and interface
work. The native app version remains numeric `0.1.0`, matching Beta 1; the Git tag
and GitHub prerelease distinguish Beta 2. No signed iOS binary is attached.

## Included since Beta 1

- Account sign-up verification and self-service account deletion UI.
- Account-switch and restore safeguards against accidental sync deletions,
  with an explicit choice for paused bulk deletions.
- Phone-only records remain on the device through account changes and are
  covered by complete-backup verification.
- Recoverable interrupted backup restore, accurate Bluetooth failure messages,
  and download baselines that do not skip interrupted history.
- Dive Lens photo resizing based on decoded dimensions, bounded upload size,
  and identification opened from a logged dive's photos.
- Shared readability, accessibility, keyboard, spacing and empty-state
  refinements across the logbook, gear, planner and other screens.
- Windows-compatible Metro/ngrok launcher, explicit port handling, local host
  configuration, child-process cleanup and a trip-host supervisor that retries
  failures. See [Windows hosting](WINDOWS_DEV_HOST.md).

## Validation

- `npm run verify:release`: **42/42 checks passed** on the Mac, including
  Windows launcher simulation, port collision, shutdown and retry checks.
- `npx expo export --platform ios`: passed, 1178 bundled modules.
- Related media API: `node tests/gemini-lens.cjs`, **12/12 passed**.
- `npx expo-doctor`: **20/21 checks passed**. The dependency check recommends
  newer patch releases for 13 Expo packages. Existing package versions and the
  lockfile were retained to preserve compatibility with the installed native
  development client during the host transfer.

## Handoff and limits

Windows hosting is prepared in source. Successful startup on the actual Windows
machine, access through the external tunnel, and a phone reload over cellular
with the Mac offline must still be verified. Do not treat the host transfer as
complete until those checks pass.

The Mac's development backups are outside Git and require a separate private
transfer if historical restore points are wanted on Windows. New hosting does
not move or erase the phone's data.

Related backend source is tracked in the website repository on
`feat/self-service-account-deletion`. It includes sync safeguards, account-deletion
endpoints and Gemini deadline/body handling. Saving the code to Git is separate
from deploying Workers; this release does not change backend deployments.

Physical Bluetooth behavior and compatibility of the installed phone binary
still require device testing. Windows can serve the iOS JavaScript bundle, but
cannot build the iOS native binary locally.
