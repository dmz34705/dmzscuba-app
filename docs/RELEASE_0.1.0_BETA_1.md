# DMZ Scuba 0.1.0 Beta 1

Git tag: `v0.1.0-beta.1` • Status: prerelease

This milestone records DMZ Scuba's transition to beta stabilization. The README's
pre-alpha label had fallen behind development; no intermediate releases have
been retroactively created.

## Included

- Bluetooth nitrox-analyzer feature and navigation integration.
- Native pre-dive setup, supported device operations, and read-only protocol diagnostic support.
- Shearwater packet handling and Bluetooth notification-readiness changes.
- Analyzer and Suunto settings verification scripts and fixtures.
- Product refinement review covering reliability, usability, and connected workflows.

The existing product includes the local-first multi-computer logbook, Ocean Atlas,
Planner, Gear Locker, Dive Lens, personal dive intelligence, and training tools.

## Platform scope

The first release is **iOS only**. The native dive-computer bridge exists only
for Apple platforms; Android is out of scope for this release.

## Stabilization fixes since Beta 1 (November 2026)

Fixed in code and covered by `npm run verify:release` (41 checks). Items marked
*device* still need confirming on a phone with real dive computers.

- Dive Lens is back on paid Gemini: 1280px uploads and a 35-second timeout.
- An interrupted download no longer advances the sync baseline. The next
  "Sync new dives" (or, for an interrupted first import, "Full re-download")
  re-reads the missing range and skips duplicates. *Device*
- Insurance, location history, nitrox analyses and saved sites now move with
  their own account when someone else signs in on the phone.
- Complete-backup restore is journaled and finishes on the next launch if
  interrupted; nothing reads app data until it has.
- Bluetooth write and notification failures stop the transfer and show the
  real cause instead of a later timeout. *Device*
- The planner check failure was a test-fixture date bug, now fixed.
- Account → Delete account (App Store requirement): type the account email to
  confirm; synced records are deleted first, then the login and profile.
  Data on the phone stays as signed-out data.
- Sign-up accepts the 8-digit email verification code (6–10 digits).
- **Sync data-loss fix (found in testing, Nov 17).** Creating then deleting a
  second account left the first account's records set aside on the phone;
  signing back in adopted the empty screen, and the next sync deleted every
  cloud record. Now:
  - signing in to an account with set-aside records brings them back;
  - a sync that would delete at least 10 records and 10% of the account at
    once, in either direction, pauses and asks in Account → Logbook & gear
    sync (Restore / Delete);
  - the sync Worker keeps a deleted record's last contents and refuses
    unconfirmed deletion bursts, so older app versions can't wipe an account;
  - recovery steps: `workers/dmz-account-sync/RECOVERY.md` (website repo).
  *Device*
- Development backup restore downloads only files the phone doesn't have, so
  restoring onto the same phone no longer needs gigabytes of free space.

Still open before App Store submission:

- Deploy `dmz-account-sync` again for the sync safeguards (website branch
  `feat/self-service-account-deletion`, not yet on GitHub). The account-deletion
  endpoints are deployed and Delete account was tested with a throwaway account.
- The sync pause only shows in Account; nothing elsewhere tells the diver.
- Physical-device validation of the Bluetooth items above, including the
  notification-readiness gate.
- Decide whether backup export is account-scoped or whole-device.
- App Store Connect listing and privacy details once the developer account is approved.

## Known issues and validation limits (as of Beta 1)

- Interrupted downloads may save a baseline that skips older, unread history on
  subsequent incremental sync. Full re-download is the current recovery path.
- Backup installation is not yet recoverable across every interruption point.
- Insurance and location history are outside the inspected account-vault boundary.
- Bluetooth errors may be obscured by later timeouts; the notification-readiness
  mitigation is not a confirmed physical-device fix.
- The preceding audit passed 35 of 36 package checks. The planner check failed
  on a date-dependent rental-car/night-coverage assertion. Separate account data
  sync, account vault, and Atlas weather checks passed.
- A successful JavaScript export does not validate physical Bluetooth behavior
  or compilation of all pending native changes. Android has no native
  dive-computer bridge in this repository.

See [the refinement review](PRODUCT_REFINEMENT_REVIEW.md) for acceptance criteria
and the stabilization roadmap. These issues are disclosed, not resolved by the
version change.

## Installation

This is a source prerelease, with no signed app binary attached. Native changes
require rebuilding the app. Pushing this release does not update an installed
phone build or deploy backend services. The app version remains numeric `0.1.0`;
the Git tag and GitHub prerelease identify Beta 1.
