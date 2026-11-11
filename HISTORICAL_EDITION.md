# DMZ Logbook

Historical source: `fc156e1` (September 10, 2026), refined logbook review,
clock choices, and photo preservation milestone.

Installation identity: `com.dmzscuba.app.logbook`; URL scheme: `dmzlogbook`.
This edition has separate local storage and disabled account API calls.
The original product code is retained except for historical account isolation,
installation branding, and current-iOS scene lifecycle compatibility.
Expo is patched to 57.0.24 for that compatibility; the historical product
features are not upgraded. Original dependency versions remain in the source commit.

Icon: `assets/history-icon.png`, generated with the built-in image tool from
the user's logo. Prompt: nautical DMZ helmet and diver-flag emblem on navy,
cyan-teal accent border and a LOGBOOK ribbon; square opaque iOS icon.

Build a Release configuration to embed the historical JavaScript bundle;
do not point this app at the beta's Metro server.

## Build result

Release build succeeded on November 11, 2026. Signed app:
`/Users/dmz/dmzscuba-logbook-build/Build/Products/Release-iphoneos/DMZLogbook.app`.
Installation is pending: the free developer profile's three-installed-app limit
blocked installation of the first retrospective app. DMZ Scuba, DMZ Light, and
AltStore occupy the slots. No existing app was removed or replaced.
