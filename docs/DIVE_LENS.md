# Dive Lens structured profiles

## Gemini reliability update — November 16, 2026

The Worker routes Dive Lens to Gemini independently of the local itinerary
provider. Deployment `72acad42-3c42-47a5-ab69-2bd074ec5ed4` extends the Gemini
deadline to 55 seconds (including response-body reading) and requests low
thinking for Gemini 3 models. The app retains its 70-second network deadline.

Analysis copies now use decoded image dimensions, including logbook photos with
no width/height metadata. Their longest edge is capped at 1280px, with JPEG
compression and a 2,000,000-character base64 ceiling. A second 960px pass handles
larger encodings; failure stops before uploading. Originals and photo links are
preserved. `npm run test:lens` covers these cases. Live photo identification still
requires an authenticated phone test; mocked tests do not verify model accuracy.

The app and `/api/vision/identify` now support structured gear and marine-life profiles.
The backend working copy is `/Users/dmz/DMZScuba.com`; the implementation is in
`workers/dmz-media-api/src/index.js`.

## Contract and rollout

- Keep existing `result` fields for older app builds. The backend adds envelope `schemaVersion: 2`.
- New fields: `identificationLevel`, `evidence`, `uncertainty`, `nextPhoto`, `alternatives`, `gear`, `marineLife`.
- Gear and marine-life profiles are mutually exclusive. Unknown reference values are null, not zero or guessed numbers.
- Brand and model each have separate confidence. Low-confidence values are removed; tentative candidates belong in alternatives.
- Species reference ranges include units and measurement kind; they are not measurements from the photo.
- This is model-generated information, not web-grounded or manufacturer-verified data. No equipment inspection, authenticity, compatibility or operating-limit claims.
- The new client accepts old responses and notes when detailed information was not returned. It does not invent a profile from old prose.
- Deploy the Worker through the website's normal reviewed deployment workflow, then use the updated app. Updating only the app cannot improve the existing server's recognition.

## Provider

Dive Lens runs on Gemini (paid tier) by default: the Worker reads `LENS_AI_PROVIDER = "gemini"`,
`LENS_GEMINI_MODEL` and the `GEMINI_API_KEY` secret. The app uploads 1280px JPEGs and waits up to 35 seconds
(the Worker gives Gemini 25). The local path below is kept as an opt-in fallback only.

## Local fish specialist (opt-in, `LENS_AI_PROVIDER = "local"`)

- Before inference, a photo timestamp is matched to the diver's logbook. When a match exists, the app builds coarse context from the saved water type, month and bundled Atlas sightings. Exact coordinates are used on-device to select taxa and are not sent to the API.
- With `LENS_AI_PROVIDER=local`, the private inference gateway asks the loopback Fishial service to detect and crop the prominent fish and rank its supported scientific names. The original photo, crop, candidates and nearby taxa are then given to Qwen for visual adjudication and explanation.
- Water type comes from the logbook only when it is trustworthy: dives logged by hand, or imported dives where the diver confirmed the water type in the dive editor or bulk edit (`water.typeConfirmed`). Dive computer salinity is a device setting and is ignored; an inland Atlas site or a lake/quarry/river/spring/mine site name marks the dive freshwater, otherwise the context says `unknown`.
- Nearby records add a modest ranking bonus; they never exclude an unusual sighting. Fishial scores are similarities rather than calibrated probabilities.
- A missed detection, unavailable Fishial service or unsupported species falls back to the existing Qwen path. Gear identification therefore does not depend on Fishial.
- Fishial's published model repository and training/inference code are MIT licensed: https://github.com/Wye-Foundation/Fishial-Fish-Identification. Keep its downloaded model bundles out of source control.

## Validation

App: `npm run test:lens`, `npm run test:dive-log`, `npm run test:architecture`,
`git diff --check`, `npx expo export --platform ios --output-dir /tmp/verify`.

Website: `node tests/dive-lens.test.cjs`, `node tests/customer-accounts.test.cjs`, `git diff --check`.
Endpoint tests mock Gemini/Ollama/Fishial; no private images or production secrets are needed.

Before release, test real photos: readable brand/model label, unbranded BCD, several BCD configurations,
blurred labels, well-marked species, ambiguous fish, coral, and a non-dive subject. Check identity against
known labels/expert IDs; verify reference ranges independently. Inspect narrow-screen and large-text
layouts on a working native build. A successful bundle is not proof of recognition quality or runtime UI.
