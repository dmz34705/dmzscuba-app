# Dive Lens structured profiles

The app and `/api/vision/identify` now support structured gear and marine-life profiles.
The backend working copy is `/Users/dmz/DMZScuba.com`; the implementation is in
`workers/dmz-media-api/src/index.js`. Changes are local, not deployed.

## Contract and rollout

- Keep existing `result` fields for older app builds. The backend adds envelope `schemaVersion: 2`.
- New fields: `identificationLevel`, `evidence`, `uncertainty`, `nextPhoto`, `alternatives`, `gear`, `marineLife`.
- Gear and marine-life profiles are mutually exclusive. Unknown reference values are null, not zero or guessed numbers.
- Brand and model each have separate confidence. Low-confidence values are removed; tentative candidates belong in alternatives.
- Species reference ranges include units and measurement kind; they are not measurements from the photo.
- This is model-generated information, not web-grounded or manufacturer-verified data. No equipment inspection, authenticity, compatibility or operating-limit claims.
- The new client accepts old responses and notes when detailed information was not returned. It does not invent a profile from old prose.
- Deploy the Worker through the website's normal reviewed deployment workflow, then use the updated app. Updating only the app cannot improve the existing server's recognition.

## Validation

App: `npm run test:lens`, `npm run test:dive-log`, `npm run test:architecture`,
`git diff --check`, `npx expo export --platform ios --output-dir /tmp/verify`.

Website: `node tests/dive-lens.test.cjs`, `node tests/customer-accounts.test.cjs`, `git diff --check`.
Endpoint tests mock Gemini; no private images or production secrets are needed.

Before release, test real photos: readable brand/model label, unbranded BCD, several BCD configurations,
blurred labels, well-marked species, ambiguous fish, coral, and a non-dive subject. Check identity against
known labels/expert IDs; verify reference ranges independently. Inspect narrow-screen and large-text
layouts on a working native build. A successful bundle is not proof of recognition quality or runtime UI.
