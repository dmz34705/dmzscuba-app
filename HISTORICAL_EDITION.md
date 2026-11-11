# DMZ Origins

Historical source: `2e6f227` (August 30, 2026), first complete source snapshot.
The earlier commits contained the Expo starter screen rather than the diving app.

Installation identity: `com.dmzscuba.app.origins`; URL scheme: `dmzorigins`.
This edition has separate local storage and disabled account API calls.
The original product code is retained except for historical account isolation,
installation branding, and current-iOS scene lifecycle compatibility.
Expo is patched to 57.0.24 for that compatibility; the historical product
features are not upgraded. Original dependency versions remain in the source commit.

Icon: `assets/history-icon.png`, generated with the built-in image tool from
the user's logo. Prompt: nautical DMZ helmet and diver-flag emblem on navy,
antique-gold border and an ORIGINS ribbon; square opaque iOS icon.

Build a Release configuration to embed the historical JavaScript bundle;
do not point this app at the beta's Metro server.
