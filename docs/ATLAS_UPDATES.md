# Ocean Atlas updates

The Atlas opens using bundled data and restores the most recent verified
download from persistent device storage. The app checks for updates on launch,
foreground return and network reconnection. If the website remains unreachable,
it retries once a minute while the app is foregrounded and the network is
available. No background-task guarantee is implied when the app is suspended.
On older native clients without NetInfo, launch/foreground checks and minute
retries still work; immediate reconnection checks become available after rebuilding.

## Publishing data

Existing source import/build scripts produce the JSON in
`src/features/oceanAtlas/data`. Then generate a release into the development
website checkout:

```sh
npm run build:atlas-release -- --output-dir /Users/dmz/DMZScuba.com
npm run test:atlas-updates
```

The release contains 24 JSON datasets, retaining source dates and licenses.
`/assets/atlas/v1/manifest.json` lists each file's exact UTF-8 bytes, SHA-256 and
content-addressed URL. The release ID hashes the ordered dataset identities.
The website's `_headers` makes the manifest revalidate and the files immutable.
Keep older files during publication so interrupted/in-flight clients can finish.
Identical release builds preserve their original publication date.

Development builds can point to the development website:

```sh
EXPO_PUBLIC_ATLAS_ORIGIN=https://dmzscuba-com.pages.dev npx expo start --dev-client
```

The normal default is `https://www.dmzscuba.com`. The app never silently fetches
production Atlas data from the development site. Both origins need the download
package published before updates succeed; otherwise bundled/saved data still
works. Live promotion follows the website's existing approval workflow.

## Device storage and activation

Files live under Expo FileSystem's `Paths.document/ocean-atlas/<origin>/files`, rather
than a disposable browser or operating-system cache. The small AsyncStorage
record `@dmz-scuba/ocean-atlas/releases-v1/<origin>` identifies active and previous
releases. Development and production have separate storage. Paths are relative
to the device's current Documents directory, so
backup restoration into a different iOS app container remains valid.

Downloads are written via temporary files. Exact size, SHA-256, JSON structures
and release identity are checked before the active pointer changes. Unchanged
files are reused. Failed downloads and storage errors retain the working
snapshot. A corrupt saved active release falls back to the previous release,
then to bundled data. Unreferenced files are pruned after a transaction;
active and previous files are retained. A first downloaded release falls back
to the app's bundled dataset if no prior downloaded release exists.

Native catalog, search, species, temperature, travel and site-detail consumers
all read live bindings from `datasets.js`. Their derived indexes are reset when
the active release changes. Open Atlas WebViews restart with that same release;
saved layer/view preferences are restored. A complete update does not mix new
map pins with older guide data.

## WebView startup

Native Atlas and location-picker WebViews receive a roughly 317 KB shell
containing bundled JavaScript/CSS. JSON map data follows through acknowledged
chunks. Each actual injection is below 64 KiB including UTF-8 and escaping.
The map starts only once all chunks have arrived. JSON is escaped before
injection; downloaded data cannot inject scripts. The WebView still disallows
fetch/XHR and file access. All website downloads happen on the native side.

Standalone previews and the website's existing rendered Atlas exporter remain
self-contained by default. Their HTML size is no longer the native transport
budget. Map data still consumes memory after startup; the updater limits each
download to 32 MiB and the complete release to 128 MiB.

## Validation

`npm run test:atlas-updates` covers clients missing NetInfo, lifecycle cleanup,
foreground retries, offline startup/restart, reconnect, unchanged
and changed releases, concurrent checks, interruption, bad checksums, storage
failure, rollback, incompatible manifests, malformed datasets, native/search
index refresh and escaped bootstrap payloads larger than 2 MiB.

With Playwright installed, run:

```sh
PLAYWRIGHT_MODULE=/path/to/playwright node scripts/verify-atlas-bootstrap-browser.cjs
```

That check exercises the actual map and picker startup with all network
requests blocked, including acknowledgement order, search and guide requests.
Also rebuild the native development client after installing `expo-crypto` and
`@react-native-community/netinfo`; a Metro reload alone cannot add native modules.
Physical iOS and Android update/restart checks remain required before a live
rollout. Photos and detailed map tiles still depend on internet; deliberate
offline media and downloadable licensed basemaps are subsequent phases.
