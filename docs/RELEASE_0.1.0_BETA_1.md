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

## Known issues and validation limits

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
