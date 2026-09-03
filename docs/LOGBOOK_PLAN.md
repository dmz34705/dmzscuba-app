# Dive Logbook — Plan & Handoff

This document is the working spec for the logbook feature and the libdivecomputer
dive-computer download. It exists because the work spans two machines and two
Claude Code sessions (sessions do not transfer between machines — only the repo
and this doc do). Read `docs/ARCHITECTURE.md` first.

## Status (2026-09-03)

**Progress since 2026-08-31:**
- **Real dive-computer download works on hardware.** Shearwater Peregrine TX
  and Suunto EON Core both download over BLE on a physical iPhone. Native model
  resolution (longest BLE-name-prefix descriptor + DEVINFO fallback), Suunto EON
  pairing flow (prime the OS bond, retry, clear-pairing guidance), imperial
  cylinder capacity ("AL80" not "0.4 ft³").
- **B5 done (JS)** — `schemaVersion: 2`: a `Dive` is the canonical counted record;
  each download is a `ComputerLog` attached to it. `migrateToV2` converts v1
  records (keeps v1 keys as a backup). `logAnalytics` computes ascent-rate /
  sawtooth / avg-depth / SAC-RMV / ceiling / safety-score at import.
- **B6+B7 done (JS)** — `matchDives.js` cross-computer matcher (profile
  cross-correlation, clock-offset detection gated on a 15-min-multiple "clean"
  offset). `useDiveLog.importComputerLog` runs it during download; a
  post-download "Review matches" screen resolves conflicts and corrects the
  wrong computer's clock (`timeCorrectionMinutes`, remembered per device).
  - **Split-dive detection** (both download orders): `classifyFragment` (a new
    short log is part of an existing longer dive) + `findSpanningMerge` (a new
    long log spans several separately-logged same-device dives). Handles the
    Suunto-splits-what-Shearwater-sees-as-one case.
  - **Recovery for already-inflated data**: Stats -> "Check for duplicate
    dives" re-runs the matcher over the whole book; multi-select -> "Merge N"
    for a manual fix. `storage.mergeDives` folds dives together.
- **B8 done (JS)** — safety score + `diveTrends` (SAC/safety/avg-depth trend,
  gas-mix histogram) + a "Stats" view.
- **Download/import reworked (JS)** — full read by default (incremental sync
  couldn't recover a deleted dive); dives collected and written in ONE batch
  (`createDivesFromLogs`) — the per-dive index race was silently dropping
  downloads; matching is deferred to a single `recheckDuplicates` pass after
  the transfer, which auto-merges high-confidence + clocks-agree matches and
  only prompts when a clock decision is needed.
- **Whole-trip reconciliation** — `reconcileComputers` aligns two computers'
  full dive sequences (offset voted across every compatible pairing, requiring
  in-order support) instead of matching pairwise; handles split dives in both
  download orders. `sameComputer()` is serial-tolerant everywhere.
- **Computer priority** — rank computers Primary/Secondary/Tertiary on the
  folder grid; the detail view shows the top-ranked computer's data, tap a
  "Recorded by" row to switch; air pressure is attributed per computer (dual
  traces when both have a transmitter).
- Dev tools in Stats: purge deleted dives, erase logbook, re-check duplicates.
- All 16 `npm run test:*` green.

**Remaining:**
- **Native rich capture** (needs `npx expo run:ios --device` rebuild): per-tank
  pressure samples (not just tank 0), `DC_SAMPLE_DECO.tts`, setpoint/ppO2
  sensors, battery + firmware into `deviceMeta`. JS already tolerates their
  absence.
- **Profile overlays**: pressure / temperature / ceiling / ascent-rate lines on
  the detail chart (`profileChart.js` + `ProfileChart`).
- **On-device test of the v2 migration** — first launch after the JS bundle
  updates runs `migrateToV2`; verify existing downloaded dives survive.
- CCR fields — deferred pending real CCR-diver input.

- **Part A shipped** to `main` (commits `50c27c4`, `661e533`, `3e3b65d`): the
  pure-JS logbook (`src/lib/diveLog/*`), `useDiveLog`, `DiveLogScreen`, catalog
  entry + `LogbookIcon`, navigator route, and `npm run test:dive-log`. All
  `npm run test:*` green, `expo-doctor` clean, verified rendering in the
  Simulator.
- **Part B step 1 done** (bare dev build). `npx expo prebuild --platform ios`
  then `npx expo run:ios` → **BUILD SUCCEEDED**, `com.dmzscuba.app` installs and
  the Expo dev client launches on the iPhone 17 Pro simulator and connects to
  Metro. `app.json` now sets `ios.bundleIdentifier` / `android.package`
  (`com.dmzscuba.app`) and `expo-dev-client` is a dependency. `ios/` stays
  generated (gitignored).
- **Part B step 2 done (iOS)** — libdivecomputer 0.9.0 vendored and linked.
  `vendor/libdivecomputer` is a submodule pinned at the v0.9.0 tag. A local Expo
  module, `modules/dive-computer-bridge/`, compiles all 114 POSIX C sources via
  its podspec (with a hand-written `ios/generated/config.h` + `version.h`) and
  exposes `getVersion()` (C `dc_version()` → ObjC shim → Swift → JS). The
  `plugins/withLibDiveComputer.js` config plugin stages the C sources into the
  module (CocoaPods only builds files inside the pod root). Verified in the
  Simulator: the Dive Log screen shows "libdivecomputer 0.9.0" from the native
  call. `npx expo run:ios` → BUILD SUCCEEDED, 0 errors.
  - Deviation from the plan below: no `project.pbxproj` surgery — the module
    podspec does the linking, which is simpler and survives `expo prebuild`.
- **Part B step 3 done (iOS, as far as a simulator can verify)** — BLE via
  **`react-native-ble-plx`** (decided: written once, the Android port becomes an
  NDK build rather than a second BLE stack). `src/features/diveComputerDownload/`
  has `diveComputerBle.js` (manager, Android runtime permissions, adapter-state
  wait, dive-computer name hints), `useDiveComputerDownload.js` (scan / connect /
  disconnect state machine), and `DiveComputerDownloadPanel.js`. The Dive Log
  list gets a "Download from dive computer" button (shown only in a native
  build). The ble-plx config plugin owns the Bluetooth Info.plist / manifest
  permissions. `npx expo run:ios` → BUILD SUCCEEDED; the scan flow runs and
  degrades cleanly ("Turn on Bluetooth…") in the Simulator, which has no BLE
  radio. **Real scan/connect needs a physical iPhone + a dive computer** (and,
  past 7 days on device, the paid Apple Developer account).
- **Part B step 4 written (iOS) — compiles, not yet hardware-verified.** The full
  download path:
  - `modules/dive-computer-bridge/ios/DiveComputerDownloader.m` — a
    `dc_custom_cbs_t` iostream whose `read`/`poll` block on an `NSCondition`
    fed by JS (`provideBytes`) and whose `write` emits an `onDownloadWrite`
    event and blocks until `provideWriteComplete`. Descriptor lookup by
    vendor+product or `dc_descriptor_filter(DC_TRANSPORT_BLE, name)`, then
    `dc_device_open` → `dc_device_set_fingerprint` (incremental) →
    `dc_device_foreach`. Each dive is parsed (`dc_parser_new2` + every
    `DC_FIELD_*` + `dc_parser_samples_foreach` accumulated into rows) into a
    dictionary emitted as `onDownloadDive`.
  - `src/features/diveComputerDownload/downloadRunner.js` — picks the BLE
    write/notify characteristics, pumps notifications into `provideBytes`, and
    services `onDownloadWrite`.
  - `src/features/diveComputerDownload/diveRecordFromComputer.js` — **pure,
    unit-tested** mapper from the raw dive dict to a schema partial (datetime +
    timezone → ISO, gas labels, tanks, sample normalization, `SAMPLE_EVENT_*` →
    our event types).
  - Dedup: `indexRow.computerKey` = `vendor|product|fingerprint`;
    `useDiveLog.knownComputerKeys` skips dives already imported. Newest
    fingerprint is persisted per computer (`loadFingerprint`/`saveFingerprint`)
    for incremental re-downloads.
  `npx expo run:ios` → BUILD SUCCEEDED. **An end-to-end download needs a
  physical iPhone + a real dive computer** — the iostream timing, the
  characteristic-pick heuristic, and per-model parser output are all unverified.

**Decided:**
- Feature lives under **Tools** as "Dive Log".
- Storage is **local-first** (AsyncStorage), schema designed so **account sync**
  can be added later without a migration (every record has a stable id,
  timestamps, soft-delete, and a `sync` block).
- Direct **dive-computer download via libdivecomputer** is the goal (not just
  manual entry). File import (UDDF/CSV) is a cheap complementary path and should
  fall out of the same data model — build it if time allows, it is not blocking.
- The native libdivecomputer integration requires an **Expo development build**
  (Expo Go cannot run it, and cannot run this SDK 57 project anyway). That is a
  permanent change to the run workflow.

**Environment:**
- Repo: `github.com/dmz34705/dmzscuba-app`, branch `main`. Windows working copy
  at `C:\Users\Zachary\dmz-scuba-app`; macOS clone at `/Users/dmz/dmzscuba-app`.
- Expo SDK `~57.0.18`, React Native `0.86.3`, React `19.2.3`.
- macOS: Node 24 + npm 11, Xcode 26.6, iPhone 17 Pro simulator (iOS 26.5).
  **CocoaPods 1.17.0 is installed** but not the usual way: the machine only has
  system Ruby 2.6 (too old) and no admin password was available in-session, so
  Homebrew was cloned into `~/homebrew` (home-dir, no sudo) and CocoaPods was
  `gem install`ed into `~/.local/share/cocoapods-gem` using Homebrew's bundled
  Ruby 4.0. `~/.local/bin/pod` is a wrapper that sets `GEM_HOME` + puts that Ruby
  on `PATH`. **Do not delete `~/homebrew`** — `pod` depends on the Ruby inside
  it. A normal `brew install cocoapods` under `/opt/homebrew` (needs one sudo)
  would be cleaner if you want to redo it.
- No paid Apple Developer account yet. Not required for Simulator builds or for
  all of Part A / most of Part B. Required to run on a physical iPhone for more
  than 7 days, to test real Bluetooth, and to ship.
- libdivecomputer: release tarball at `C:\Users\Zachary\Downloads\libdivecomputer-0.9.0.tar.gz`;
  upstream `https://github.com/libdivecomputer/libdivecomputer.git`. A few headers
  were extracted to `tmp-libdc/` (gitignored) for reference only.

## Two-session coordination

One session drives the code at a time. The macOS session is primary now (it can
build and test). The Windows session should not commit logbook code once the
macOS session has started, to avoid divergent history. Whoever starts work does
`git pull` first.

## Architecture rules (from ARCHITECTURE.md, applied here)

- `src/lib/diveLog/` — framework-independent: schema, validation, storage,
  stats, unit formatting, chart geometry. No React. Node-testable.
- `src/features/diveLog/` — the stateful controller hook (`useDiveLog`).
- `src/screens/DiveLogScreen.js` — full-screen presentation + local form state.
  Lightweight internal view state (`list` / `detail` / `edit`) rather than new
  navigator routes, matching the simulator/calculator screens.
- `src/features/catalog/featureCatalog.js` — one new entry, `area: 'tools'`,
  `routeType: 'dive-log'`.
- `src/features/catalog/FeatureIcon.js` + `src/components/DiveIllustrations.js` —
  add a `LogbookIcon`.
- `src/application/AppNavigator.js` — one new `feature?.routeType === 'dive-log'`
  branch rendering `<DiveLogScreen appSettings={appSettings.settings} onBack={closeDetail} />`.
- `scripts/verify-dive-log.cjs` + a `test:dive-log` script in `package.json`.
  Follow the existing `scripts/verify-*.cjs` style (assert against source text +
  `loadSourceModule` for pure logic). Run every `npm run test:*` before handoff.
- Canonical storage units are **SI**: metres, seconds, °C, bar, litres, kg.
  All unit conversion happens at the presentation edge via `lib/diveLog/format.js`
  honouring `appSettings` (`depthUnit`, `pressureUnit`, `temperatureUnit`,
  `gasVolumeUnit`). This matches `lib/diveSimulation` (stores metres internally).

## Data model — dive record (`schemaVersion: 1`)

```js
{
  schemaVersion: 1,
  id: string,                    // stable local uuid (v4-style, Math.random ok)
  createdAt: string,             // ISO
  updatedAt: string,             // ISO
  deletedAt: string | null,      // soft delete for sync

  sync: {                        // future account sync bookkeeping; unused for now
    status: 'local',             // 'local' | 'pending' | 'synced' | 'conflict'
    remoteId: string | null,
    syncedAt: string | null,
  },

  source: 'manual' | 'import' | 'computer',
  device: null | {               // set for source==='computer'; enables dedupe
    vendor: string, product: string,
    serial: string | null,
    fingerprint: string | null,  // libdivecomputer per-dive fingerprint (hex)
  },

  number: number | null,         // user's running dive number, optional
  startTime: string,             // ISO local dive start ('' if unknown)
  timezoneOffsetMinutes: number | null,
  durationSeconds: number,       // runtime / bottom time
  surfaceIntervalSeconds: number | null,

  site: {
    name: string, location: string, country: string,
    latitude: number | null, longitude: number | null,
  },
  operator: string,              // shop / boat / club
  buddies: string[],

  water: {
    type: 'salt' | 'fresh' | null,
    maxDepthMeters: number,
    avgDepthMeters: number | null,
    tempSurfaceC: number | null,
    tempMinC: number | null,
    tempMaxC: number | null,
    visibilityMeters: number | null,
  },
  atmosphericBar: number | null,

  gas: {
    mixes: [{ o2: number, he: number, label: string }],  // fractions 0..1; default [{o2:0.21,he:0,label:'Air'}]
    tanks: [{ volumeLiters: number|null, workPressureBar: number|null,
              startBar: number|null, endBar: number|null, mixIndex: number }],
  },

  diveMode: 'oc' | 'ccr' | 'scr' | 'gauge' | 'freedive' | null,
  types: string[],               // free-ish tags from DIVE_TYPES: training, fun, night, wreck, drift, deep, deco, boat, shore, cave, ice, altitude, photo
  decoModel: null | { type: 'buhlmann'|'vpm'|'rgbm'|'dciem', gfLow: number|null, gfHigh: number|null },

  gear: { weightKg: number | null, exposureSuit: string, notes: string },

  rating: number | null,         // 1..5
  notes: string,
  tags: string[],

  profile: {
    sampleIntervalSeconds: number | null,
    samples: [{                  // time-ordered
      t: number,                 // seconds from dive start
      depth: number,             // metres
      tempC?: number,
      pressureBar?: number,      // primary tank
      ppo2?: number,
      cns?: number,              // percent
      ndl?: number,              // seconds
      deco?: { type: 'ndl'|'safetystop'|'decostop'|'deepstop', depth: number, seconds: number },
    }],
    events: [{ t: number, type: string, note?: string }],  // gaschange, safetystop, ascent, violation, bookmark, ...
  },
}
```

Storage layout in AsyncStorage (per-record, so sync and large profiles are easy):
- `@dmz-scuba/dive-log/index-v1` → `[{ id, startTime, updatedAt, deletedAt, siteName, maxDepthMeters, durationSeconds, source, rating }]` (lightweight; powers the list + stats without loading every profile)
- `@dmz-scuba/dive-log/entry-v1/<id>` → the full record above

`lib/diveLog/storage.js` exposes async: `loadIndex()`, `loadEntry(id)`, `loadAll()`, `saveEntry(record)` (writes entry + upserts index), `softDeleteEntry(id)`, `clearAll()` (dev/test). Keep them pure functions of AsyncStorage so they are unit-testable with a mock.

## Part A — logbook foundation (pure JS, no native)

Files:
- `src/lib/diveLog/schema.js` — constants (`DIVE_TYPES`, `WATER_TYPES`, `DIVE_MODES`), `createDiveRecord(partial)`, `normalizeDiveRecord(raw)` (defensive — clamp/default every field, drop unknown keys, sort samples by `t`), `touchRecord(record)` (bump `updatedAt`).
- `src/lib/diveLog/validation.js` — `validateDiveRecord(record)` → error string or `''`. Rules: startTime present & parseable; `0 < durationSeconds <= 24h`; `0 <= maxDepthMeters <= 350`; avg ≤ max when both set; each gas `0.18 ≤ o2 ≤ 1`, `he ≥ 0`, `o2+he ≤ 1`; rating 1..5 or null; lat/long in range.
- `src/lib/diveLog/storage.js` — as above.
- `src/lib/diveLog/stats.js` — `computeDiveLogStats(indexRows)` → `{ totalDives, totalBottomTimeSeconds, deepestMeters, longestSeconds, firstDiveDate, lastDiveDate, byYear: [{year, count, bottomTimeSeconds}], bySite: [{name, count}] }`. Ignores `deletedAt`.
- `src/lib/diveLog/format.js` — `formatDepth(m, unit)`, `formatDuration(s)`, `formatTemperature(c, unit)`, `formatPressure(bar, unit)`, `formatVolume(l, unit)`, `formatGasLabel(mix)`, `formatDate(iso)`, plus parse helpers for form inputs (`parseDepthInput(text, unit) → metres`). Reuse conversion constants already in `lib/diveComputer.js` / `lib/divePhysics.js` where sensible.
- `src/lib/diveLog/profileChart.js` — `buildLogProfileGeometry(samples, width, height, { maxDepthMeters })` → `{ linePath, areaPath, depthTicks:[{meters,y}], timeTicks:[{seconds,x}], durationSeconds, maxDepthMeters }`. Simpler than `features/diveComputer/ui/profileGeometry.js` (which is bound to the simulator sample shape); take `[{t, depth}]`.
- `src/lib/diveLog/index.js` — re-exports.
- `src/features/diveLog/useDiveLog.js` — hook: on mount load index (+ lazy-load entries on open); expose `{ loaded, rows, stats, getEntry(id), addDive(partial), updateDive(id, patch), deleteDive(id) }`. Mirrors the load/save-effect style of `features/settings/useAppSettings.js`.
- `src/screens/DiveLogScreen.js` — `ScreenHeader` + internal `view` state:
  - **list**: stats summary card (`Stat` from `components/Ui.js`), reverse-chronological dive cards (date · site · max depth · duration · rating), "Log a dive" primary button, empty state.
  - **detail**: all populated fields grouped in cards; the SVG profile chart when `profile.samples.length`; Edit / Delete actions.
  - **edit**: form (reuse `AccountForm`/`FormField` patterns, `NumberKeyboardAccessory` id for numeric inputs). Sections: When & where / Depths & time / Conditions / Gas / Gear / Notes & tags. Save runs `validateDiveRecord`, shows the error inline.
- Catalog entry + `LogbookIcon` + navigator branch + `scripts/verify-dive-log.cjs` + `package.json` `test:dive-log`.

Keep the manual form pragmatic — it does not need every schema field (profile, deco model, multi-tank come from import/download). Cover: date/time, site (name/location/country/coords), number, duration, water type, max/avg depth, temps, visibility, gas o2%/he%, tank start/end pressure & size, weight, suit, buddies, operator, dive types, rating, notes, tags.

## Part B — libdivecomputer dive-computer download (native, macOS to build)

Staged so each step compiles/runs before the next:

1. **Bare dev build.** ✅ **Done (2026-08-31).** `npx expo prebuild --platform ios`
   then `npx expo run:ios` → BUILD SUCCEEDED, dev client runs on the simulator.
   `ios/` stays generated (`.gitignore` already ignores `/ios` `/android`); the
   config plugin will reproduce it.
2. **Vendor + link libdivecomputer.** ✅ **Done for iOS (2026-08-31).**
   `vendor/libdivecomputer/` is a submodule pinned at v0.9.0. The native module
   `modules/dive-computer-bridge/` (local Expo module, autolinked) owns
   everything:
   - `ios/DiveComputerBridge.podspec` compiles the 114 POSIX C sources
     (`contrib/android/Android.mk` list minus `serial_win32.c`) with
     `HAVE_CONFIG_H=1` + `GCC_WARN_INHIBIT_ALL_WARNINGS`.
   - `ios/generated/config.h` (hand-written for Apple) and
     `ios/generated/libdivecomputer/version.h` (substituted from `version.h.in`)
     replace the autotools-generated headers.
   - `ios/DCLibdivecomputer.{h,m}` is a one-method ObjC shim; the Swift `Module`
     (`getVersion()`) calls it. JS: `getLibdivecomputerVersion()` from
     `modules/dive-computer-bridge`.
   - `plugins/withLibDiveComputer.js` (registered in `app.json`) stages the C
     sources from the submodule into `modules/dive-computer-bridge/ios/libdivecomputer/`
     (gitignored) via `scripts/stage-libdivecomputer.js`, and adds
     `NSBluetoothAlwaysUsageDescription`. It runs during `expo prebuild`; run the
     script by hand before a bare `pod install`.
   Android NDK build (the `Android.mk` route) is still step 5.
3. **BLE scan + connect.** ✅ **Done for iOS (2026-08-31).** `react-native-ble-plx`
   (chosen over native CoreBluetooth so the Android port is an NDK build, not a
   second BLE implementation). See `src/features/diveComputerDownload/`. Scan /
   connect / disconnect work; real hardware verification is pending a physical
   device.
4. **Download.** ⚠️ **Written for iOS (2026-08-31) — compiles, not hardware-tested.**
   `modules/dive-computer-bridge/ios/DiveComputerDownloader.m` +
   `src/features/diveComputerDownload/{downloadRunner,diveRecordFromComputer}.js`.
   The pure mapper is unit-tested; an end-to-end download needs a device. Original
   plan follows:

   Implement a `dc_custom_cbs_t` iostream (`tmp-libdc/custom.h`)
   backed by the BLE read/write from step 3. Then in the native module:
   `dc_context_new` → pick `dc_descriptor_t` (from a user-selected vendor/product,
   or `dc_descriptor_filter` on the advertised BLE name) → `dc_device_open` →
   `dc_device_set_fingerprint` (last downloaded, for incremental) →
   `dc_device_foreach` collecting raw dive blobs, emitting progress events →
   for each blob `dc_parser_new2` + the field/sample mapping below → structured
   record → hand to JS → `useDiveLog.addDive` with `source: 'computer'`,
   `device.fingerprint` set (dedupe: skip if a non-deleted record already has
   that `vendor+product+fingerprint`).
5. **Android** — NDK build via the config plugin (`Android.mk` is already the
   right file), BLE via the same JS/native layer.

### libdivecomputer → schema mapping

`dc_parser_get_field(parser, TYPE, 0, &out)`:

| field | → record |
|---|---|
| `DC_FIELD_DATETIME` (`dc_datetime_t`) | `startTime` (ISO), `timezoneOffsetMinutes` from `.timezone` |
| `DC_FIELD_DIVETIME` (uint sec) | `durationSeconds` |
| `DC_FIELD_MAXDEPTH` (double m) | `water.maxDepthMeters` |
| `DC_FIELD_AVGDEPTH` (double m) | `water.avgDepthMeters` |
| `DC_FIELD_TEMPERATURE_SURFACE/MINIMUM/MAXIMUM` (double °C) | `water.tempSurfaceC` / `tempMinC` / `tempMaxC` |
| `DC_FIELD_SALINITY` (`dc_salinity_t`) | `water.type` = `.type === DC_WATER_SALT ? 'salt' : 'fresh'` |
| `DC_FIELD_ATMOSPHERIC` (double bar) | `atmosphericBar` |
| `DC_FIELD_GASMIX_COUNT` + `DC_FIELD_GASMIX` (`dc_gasmix_t` per index) | `gas.mixes[]` `{ o2: .oxygen, he: .helium, label }` |
| `DC_FIELD_TANK_COUNT` + `DC_FIELD_TANK` (`dc_tank_t`) | `gas.tanks[]` `{ volumeLiters: .volume, workPressureBar: .workpressure, startBar: .beginpressure, endBar: .endpressure, mixIndex: .gasmix }` |
| `DC_FIELD_DIVEMODE` (`dc_divemode_t`) | `diveMode` (`OC`→`'oc'`, `CCR`→`'ccr'`, `SCR`→`'scr'`, `GAUGE`→`'gauge'`, `FREEDIVE`→`'freedive'`) |
| `DC_FIELD_DECOMODEL` (`dc_decomodel_t`) | `decoModel` `{ type, gfLow: params.gf.low||null, gfHigh: params.gf.high||null }` |
| `DC_FIELD_LOCATION` (`dc_location_t`) | `site.latitude/longitude` |

`dc_parser_samples_foreach` — accumulate a "current sample" keyed by the running
`DC_SAMPLE_TIME` (milliseconds → seconds for `t`), flush on the next TIME:

| sample type | → sample field |
|---|---|
| `DC_SAMPLE_TIME` (`.time` ms) | `t` (÷1000); start a new sample row |
| `DC_SAMPLE_DEPTH` (`.depth` m) | `depth` |
| `DC_SAMPLE_TEMPERATURE` (`.temperature` °C) | `tempC` |
| `DC_SAMPLE_PRESSURE` (`.pressure {tank, value bar}`) | `pressureBar` (tank 0; keep others if multi-tank later) |
| `DC_SAMPLE_PPO2` (`.ppo2 {sensor, value}`) | `ppo2` |
| `DC_SAMPLE_CNS` (`.cns` fraction) | `cns` (×100 for percent) |
| `DC_SAMPLE_DECO` (`.deco {type, time, depth, tts}`) | `deco { type: map(DC_DECO_*), depth, seconds: .time }`; `ndl` = `.time` when type is `DC_DECO_NDL` |
| `DC_SAMPLE_GASMIX` (`.gasmix` index) | push `events` `{ t, type: 'gaschange', note: mixLabel }` |
| `DC_SAMPLE_EVENT` (`.event {type, time, flags, value}`) | push `events` `{ t, type: map(SAMPLE_EVENT_*) }` (safetystop, ascent, violation, bookmark, deepstop, …) |

Set `profile.sampleIntervalSeconds` = median Δt. `source: 'computer'`,
`device: { vendor, product, serial, fingerprint }`.

### Licensing (libdivecomputer is LGPL-2.1)

For a paid closed-source app: ship libdivecomputer as a **dynamic** library / its
own framework (not statically linked into the app binary), include its source +
`COPYING` + a note of any modifications in the app or its docs, credit it in an
acknowledgements screen, and be able to provide object files for relinking. This
is a release checkbox, not a code task — flag it before submitting.

## Part B continued — multi-computer logbook (B5–B8)

Decided with Zachary 2026-09-03. Goal: a **dive** is the canonical unit; the
**computer logs** from each physical device attach underneath it. Downloading a
second computer recognises "this log is the same dive as one I already have",
attaches it, and (if the clocks disagree) asks which is right and corrects the
wrong one. Dive count = number of dive records, so diving two computers no longer
inflates the count.

### Prior art being replaced

`schemaVersion: 1` (one flat record per download) and the `buildFolders()`
per-computer grouping in `useDiveLog` are superseded. The "folder" view becomes a
filter over dives, not the storage structure. `computerKey` (vendor|product|
fingerprint) same-device de-dup stays — it prevents re-importing the *same* log;
the new matcher is *cross*-device and fuzzy.

### B5 — data model + rich capture + migration (`schemaVersion: 2`)

**Two record types.**

`Dive` — canonical, user-facing, counted.
```
{
  schemaVersion: 2,
  id, createdAt, updatedAt, deletedAt, sync,          // as before
  startTime, timezoneOffsetMinutes,                    // canonical (post-correction)
  source: 'manual' | 'computer' | 'mixed',
  primaryLogId: string | null,                         // which log drives the summary/profile; null = manual
  logIds: string[],                                     // attached ComputerLog ids

  // summary fields surfaced from the primary log (or hand-entered for manual):
  number, durationSeconds, surfaceIntervalSeconds,
  water { type, maxDepthMeters, avgDepthMeters, tempSurfaceC, tempMinC, tempMaxC, visibilityMeters },
  atmosphericBar,
  gas { mixes[], tanks[] },                             // tanks only when a transmitter was present
  diveMode, decoModel,

  // user-owned, never overwritten by a log:
  site { name, location, country, latitude, longitude },
  operator, buddies[], types[], gear { weightKg, exposureSuit, notes },
  rating, notes, tags[],
}
```

`ComputerLog` — one download from one device, stored separately (profiles are big).
```
{
  id, diveId,
  device { vendor, product, serial },
  deviceKey: 'vendor|product|serial',
  fingerprint,                                          // libdivecomputer per-dive hex
  downloadedAt,
  reportedStartTime,                                    // exactly what the computer said — never mutated
  timeCorrectionMinutes: number,                        // applied offset (0 = clock trusted)
  startTime,                                            // reportedStartTime + correction (convenience)
  durationSeconds, maxDepthMeters, avgDepthMeters,
  tempSurfaceC, tempMinC, tempMaxC, salinity, atmosphericBar,
  gasMixes[], tanks[],                                  // tanks[] entries only kept when .beginPressureBar > 0 (transmitter)
  diveMode, decoModel,
  profile { sampleIntervalSeconds, samples[], events[] },
  analytics {                                           // raw fields for the B8 metrics layer
    gfLow, gfHigh, decoModelType, conservatism,
    ceilingMaxMeters, firstStopMeters, ndlMinAtStartSec,
    cnsStartPct, cnsEndPct, otu,
    ascentRateMaxMPerMin, sawtoothIndex,                // computed at import from samples
  },
  device_meta { firmware, serialRaw, batteryPct, hardwareModel },  // "Device" section, de-emphasised
  splitOf: string | null,                              // sibling ComputerLog id when this device split one dive
}
```

Storage keys: `@dmz-scuba/dive-log/index-v2` (Dive summary rows for list+stats),
`@dmz-scuba/dive-log/dive-v2/<id>`, `@dmz-scuba/dive-log/log-v2/<logId>`,
`@dmz-scuba/dive-log/device-time-corrections-v1` (remembered clock decisions:
`{ deviceKey, appliesFrom, appliesTo, offsetMinutes, decidedAt }[]`).

**Migration v1→v2** (run once, in `storage.js`, keep a `…/backup-v1` copy):
- every v1 record → a `Dive`; `source: 'computer'` records also spawn one
  `ComputerLog` (profile + device moved onto it, `primaryLogId` set).
- `source: 'manual' | 'import'` → `Dive` with `logIds: []`, `source` preserved
  (import stays a distinct source? — treat as manual for now).

**Rich native capture** (`DiveComputerDownloader.m` `parse_dive`):
- pressure sample: keep every tank index, not just 0 (`samples[].pressures: {<tank>: bar}` or `pressureBar` for tank 0 + `pressureBarByTank`).
- add `DC_FIELD_TANK.type`, already done; only surface tank pressure/volume to the
  Dive when `beginpressure > 0` (real transmitter). No transmitter ⇒ omit; the
  cylinder fields stay user-editable on the Dive.
- capture: `DC_FIELD_DECOMODEL` conservatism, per-sample `DC_SAMPLE_DECO.tts`,
  `DC_SAMPLE_SETPOINT`, `DC_SAMPLE_PPO2.sensor` (all sensors), `DC_SAMPLE_GASMIX`
  already, `DC_SAMPLE_RBT`, `DC_SAMPLE_HEARTBEAT`, `DC_SAMPLE_BEARING`.
- housekeeping via events / `DC_EVENT_DEVINFO` (firmware) + any battery field.
- CCR fields (setpoint, diluent, sensor voltages) captured raw, **not surfaced**
  until we review with real CCR divers.

**Analytics computed at import** (pure, `lib/diveLog/logAnalytics.js`): ascent-rate
series + max, sawtooth index, avg depth from samples, CNS/OTU if not given.

### B6 — cross-computer matcher (`lib/diveLog/matchDives.js`, pure, unit-tested)

Runs in the JS layer as each `onDownloadDive` arrives (background, off the UI
thread via `InteractionManager` / batched), building a proposal set. Inputs: the
new `ComputerLog` L, the existing `Dive`+`ComputerLog` store, and the other logs
from the current download session.

1. **Prefilter.** Candidate dives whose window overlaps L's reported start ±30 h
   (covers any tz + date-line). Keep where `abs(durL - durC) ≤ max(120s, 8%)` and
   `abs(maxDepthL - maxDepthC) ≤ max(1.5 m, 8%)`.
   - Split case: also test L against **sums of consecutive candidates** from one
     device separated by a surface gap < ~12 min (Suunto ends a dive sooner than
     Shearwater, so Suunto logs 2 where Shearwater logs 1).
2. **Profile alignment.** Resample both depth series to 10 s. Slide L over the
   candidate across the window; coarse pass at 15-min steps, then refine ±5 min
   at 10 s steps around the best. Score = normalised cross-correlation of the
   depth series (and a shape term: 1 − RMS(normalised depths)).
3. **Classify.**
   - `score ≥ 0.95` **and** best offset within ±90 s of a multiple of 15 min →
     **same dive, auto-attach**. If that clean offset ≠ 0 it is a *clock
     discrepancy* of that size between the two `deviceKey`s.
   - `0.80 ≤ score < 0.95` → **same dive, needs confirmation**.
   - else → not a match.
4. **Split.** If L matches `frag1 + gap + frag2`, attach all fragments to one
   Dive; set `splitOf` on the fragments; primary = the non-split (spanning) log.
5. **Aggregate conflicts.** Group discrepancies by `(deviceKeyA, deviceKeyB,
   offsetMinutes, contiguous date range)` → one prompt each.

Output: `{ attach: [...], confirm: [...], conflicts: [...] }`. Nothing is written
until B7 resolves it.

Known gap: a single computer that split a dive, with no second computer that day,
can't be detected — leave a manual "merge these two logs" action, don't guess.

### B7 — conflict resolution UI + apply

After the download session ends (user stops or all dives read) and returns toward
the log, show a review sheet, one card per conflict cluster (Explorer-copy
style):

> **Dec 1, 2024 · 3 dives** — Peregrine TX 14:30, EON Core 07:30 (−7:00).
> Which clock is right? **[Peregrine TX] [EON Core] [Enter time…] [Not the same dive]**

- Choosing a side sets `timeCorrectionMinutes` on the other device's logs in that
  cluster, recomputes each `Dive.startTime` from its primary log, groups the logs.
- Persist the decision in `device-time-corrections-v1` (deviceKey + date range +
  offset) so a re-download of those dives doesn't re-ask.
- Auto-applied (high-confidence, clean non-zero offset, and a prior matching
  correction already on file) skip the prompt; first-time offsets always ask.
- "Not the same dive" → keep separate, remember as a negative match
  (`fingerprint` pair) so it isn't re-proposed.

### B8 — analytics / "nerd out" layer

`lib/diveLog/logAnalytics.js` (per-dive) + `lib/diveLog/diveTrends.js` (across
dives). Metrics: SAC/RMV per dive and trend, avg-depth trend, cumulative bottom
time, thermal exposure, gas-mix history, **safety score** (weighted: ascent-rate
violations, sawtooth index, safety-stop compliance, NDL/deco margin, rapid-ascent
count). Profile overlays on the detail chart: tank pressure, temperature,
ceiling, ascent-rate shading. New "Stats" view off the logbook.

## Open decisions (need Zachary)

- Which dive computers to support first (drives descriptor/test priorities).
- Sync: when to build the DMZ-account sync endpoint, and whether it is a new
  `dmzscuba.com` Worker route (like `/api/account/app-settings`) or a direct
  Supabase table with RLS.
- ~~BLE library~~ — **decided: `react-native-ble-plx`** (2026-08-31).
- Apple Developer Program: buy when device Bluetooth testing starts (needed now
  to verify step 3 on real hardware and to build step 4).
