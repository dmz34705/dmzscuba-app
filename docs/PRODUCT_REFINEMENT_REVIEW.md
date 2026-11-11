# DMZ Scuba: release readiness and product refinement

Working review • November 11, 2026

## Purpose and evidence

Bring DMZ Scuba toward a dependable, cohesive, premium diving product without losing the depth that distinguishes it. This document records technical priorities, usability observations, and proposed connected workflows. It authorizes no implementation or deployment.

Evidence: the current mobile checkout, the preceding source audit and test run, project architecture and Dive Lens/Dive Intelligence documentation, and the supplied Peregrine download screenshot. The complete running app has not received a screen-by-screen usability review. Recommendations below are proposals, not claims that every described connection is currently absent. Backend services, installed phone binaries, and competing products were not independently audited.

## Product assessment

DMZ Scuba is already more connected than a collection of independent utilities. Atlas and logbook connect exploration with personal dive history. Dive Lens uses logbook context to support identification. Planner draws on gear and prior dives, and Dive Intelligence closes the loop with trip debriefs. Location suggestions, clock correction, and multi-computer reconciliation address real friction that divers encounter. Bluetooth nitrox analysis is another opportunity to connect preparation with recorded experience.

These are credible differentiators. Their novelty relative to the market is not established by this review. Nor does feature count alone establish a higher-end experience. The product opportunity is to make those relationships visible at the moment they help, preserve context through each task, and make the result feel trustworthy.

The visual direction visible in the screenshot—navy surfaces, cyan accents, strong type hierarchy, and consistent rounded panels—looks intentional and professional. Overall refinement remains provisional until the principal journeys have been exercised on a phone. Premium should mean less repetition, clearer decisions, dependable feedback, and well-handled exceptions, rather than more decoration or more links.

## 1. Technical issues that need handling

These are primarily client and native integration issues, not findings about the production server. Priorities describe release impact, not implementation order alone.

### T1 — Incomplete downloads become misleading incremental baselines

**High priority; confirmed source behavior.** `src/features/diveComputerDownload/downloadService.js:494` saves the returned fingerprint before checking whether the download was partial. The native bridge returns the newest downloaded dive's fingerprint after interruption. The UI then says that Sync new dives will pick up where the download stopped. For a newest-first driver, that marker stops the next incremental read before older, unread history is recovered.

Required outcome: distinguish a completed synchronization baseline from an interrupted history import. Preserve downloaded records, but retain enough state to recover missing older dives. Do not promise resumability the protocol does not provide.

Acceptance: interrupt a large initial import after several dives; retry using the offered action; verify every expected dive is eventually present without duplicates. Repeat with an existing baseline and with a cancelled full re-download.

### T2 — Backup installation has a destructive interruption window

**High priority; confirmed source behavior.** `src/lib/portableBackup.js:271` clears Documents before moving staged files into place, then clears AsyncStorage before writing replacement batches. Staging validates the input but does not make installation atomic or recoverable.

Required outcome: a recoverable installation journal or equivalent rollback mechanism covering both files and records. Account synchronization must not upload a partially restored state.

Acceptance: simulate failure at each file move and storage batch, restart, and recover either the previous complete dataset or the restored complete dataset. Verify photos, insurance documents, and account ownership together.

### T3 — Sensitive data is outside account-switch isolation

**High priority; confirmed ownership boundary, user-facing behavior needs device validation.** `src/lib/accountDataSync.js:27` includes logbook, gear, planner, and gear advice in account vault switching, but excludes insurance and location-history keys.

Required outcome: explicitly define account-owned versus device-owned data. Insurance and personal location history should not silently carry into another person's account. Define signed-out access separately from account switching.

Acceptance: account A creates insurance and location records, signs out, and account B signs in. Verify what B can see, what is retained for A, and what gets synchronized.

### T4 — Bluetooth failures lose their original cause

**Medium priority; confirmed source behavior.** `src/features/diveComputerDownload/downloadRunner.js` logs failed writes but calls `provideWriteComplete()` in `finally`. Notification failures are logged without directly failing the operation. A subsequent native timeout can obscure the actual problem.

Required outcome: propagate transport failures accurately, clean up the active operation, and offer an appropriate retry path. Keep technical detail available in diagnostics while presenting plain-language guidance.

Acceptance: failed writes, disabled Bluetooth, dropped notifications, and disconnects each produce an accurate outcome without a hanging operation or false success.

### T5 — The recent timeout mitigation remains unproven

**Validation priority.** The new notification-readiness gate waits up to 1.5 seconds before starting the native operation. It affects the shared transport, not only the Peregrine. The earlier claim that the timeout was fixed was too strong: bundle export and unrelated simulator checks do not verify BLE transfer behavior.

Required outcome: validate against supported physical models, including slow subscription establishment and repeated operations. Adjust only from evidence; do not assume the original timeout had one cause.

### T6 — Make release verification repeatable

The preceding audit ran 36 package checks: 35 passed and the planner check failed. The failing rental-car fixture passes a date as a third argument while `planAlerts` reads `context.now`; investigate the date-dependent fixture before classifying this as a user-facing planner defect. Three separately run checks—account data sync, account vaults, and Atlas weather—passed but are not part of the package test list.

Required outcome: one documented release verification entry point covering those checks, plus identifiable native builds. Significant uncommitted native and analyzer work means the marketing version alone does not identify the code installed on a phone.

### Release decisions and verification gaps

- **Cloud sync versus backup:** record sync does not restore all local photos and gear attachments, and insurance is outside the inspected snapshot. Explain coverage explicitly and test migration to a new phone.
- **Portable export scope:** the archive is unencrypted and includes all AsyncStorage and Documents content, potentially including other saved account vaults. Decide whether export is account-scoped or whole-device and disclose it clearly.
- **Account deletion:** no client implementation was located in the searched source. Verify any external deletion path and its effect on local and remote data.
- **Platform scope:** the native dive-computer bridge is Apple-only in this repository. Decide whether the first release is iOS-only or which Android workflows are intentionally unavailable.
- **External review:** production authorization, server retention, privacy disclosures, store submission requirements, and dependency distribution obligations remain outside the verified audit. Treat these as review tasks, not established violations.

## 2. Usability and refinement

### Direct observations from the download screen

| Observation | Why it feels unfinished | Refined behavior |
| --- | --- | --- |
| Raw Swift exception and file location in the main error panel | Makes the user interpret an implementation failure | Explain the failed task and next action; put technical detail in an expandable diagnostic view |
| Long Suunto instructions while Peregrine is connected | The screen does not appear to understand its current context | Show connected-model guidance; keep other-device help behind Help |
| Explanatory panels push download actions low on the screen | The main task competes with documentation | Put device, connection state, and primary action first; reveal detailed help when needed |
| Sync and full re-download are exposed together | Users must understand internal import strategy | Give a clear recommended action and explain recovery options in ordinary language |

Do not remove full re-download until interrupted-history recovery is correct. Simpler presentation must not hide the only effective recovery mechanism.

### App-wide review criteria, not yet confirmed defects

- Each screen should answer: where am I, what can I do here, and what happens next?
- Establish consistent treatment of primary actions, secondary actions, destructive actions, saved state, loading, and recoverable errors.
- Preserve drafts, scroll position, selected dive/site, and return destination when opening a supporting tool.
- Use progressive disclosure for technical depth. Experienced divers should still be able to inspect evidence and adjust decisions.
- Audit typography, touch targets, large-text support, screen-reader labels, contrast, and small-screen layouts on-device.
- Empty states should offer the next meaningful step without requiring a tour of the feature catalog.
- Clearly distinguish facts, suggestions, estimates, and user-confirmed values. Confidence in a species identification is different from certainty about which dive a photo belongs to.
- A calculator can remain a focused calculator. Connect it only when doing so removes repeated input or returns a useful result to an active task.

## 3. Make the dive, rather than the feature, the organizing idea

Use a simple lifecycle: **explore → plan → prepare → dive → import/review → remember → plan again**. This is a workflow model, not a demand to replace the existing navigation tabs.

Shared objects should carry the continuity: site, plan/trip, dive, photo, gear setup, cylinder/gas observation, computer recording, and identification. Features are different views or actions on those objects. A photo opened from a dive should already know that dive; a plan created from a site should already know that site.

Navigation links are only the first layer. A complete connection passes context, performs a useful task, saves to the appropriate record, and returns the user to where they started.

## 4. Proposed connected workflows

### A. Photo → Dive Lens → confirmed dive memory

**First priority; directly addresses the proposed photo button.** In a dive's photo viewer, expose **Identify with Dive Lens**. Reuse the selected image and associated dive context; do not send the user back through image selection.

Show the identification with uncertainty and alternatives. Let the diver confirm or edit the label, save it to the photo, and return to the same dive/gallery position. Keep the original image and distinguish a proposed identification from a confirmed one. Reopening the photo should show the saved result without another inference request.

For an unassigned photo, offer a suggested dive with an explicit confirmation. Do not silently attach it based on timestamp alone. For gear photos, offer **Add to Gear Locker** or **Link to existing gear**, with review of recognized fields.

Offline or unavailable Lens should leave the photo workflow usable and provide a retry route. External processing disclosure should be accessible at the point of identification. Do not publish a personal species observation to a public Atlas dataset automatically.

**Completion test:** from an existing dive photo, identify, correct the result, save, and return without reselecting the photo, losing edits, or duplicating the attachment.

### B. Atlas site → personal history → next plan

Build on the existing Atlas/logbook connection with a consistent site view: site information, **Your dives here**, photos, and **Plan a dive here**. Use a stable site identity so renaming a location does not break the connection.

A linked plan should open the same site, and a logged dive should return to the same location on the map. Where a location is uncertain, display **Suggested site** until confirmed. Distinguish public reference information from the user's observations.

**Completion test:** explore a site, inspect previous personal dives, create a plan using that site, and return to the site without searching again.

### C. Import → one coherent dive review

Make existing multi-computer handling, clock correction, and location suggestions understandable as a single post-import review. Start with a summary such as **8 dives imported · 2 need review**, rather than presenting every internal operation as a separate task.

For each dive needing attention, group relevant choices: site, time correction, recordings believed to represent the same dive, and suggested photos. Explain why a match was suggested. Keep original computer evidence available and make accepted corrections reversible.

Routine, confident outcomes should require little effort. Ambiguous matches must remain reviewable; do not merge merely to make the flow feel automatic.

**Completion test:** import overlapping recordings from two computers and reach a clean logbook with intelligible provenance, reviewable corrections, and no duplicate dives.

### D. Planner → Gear Locker → nitrox analysis

Build on the Planner's existing gear integration. A plan's selected setup should lead directly to its packing and service information. An analyzer result can be explicitly assigned to a selected cylinder and saved as a dated observation, including available device/calibration context.

Keep **measured oxygen**, **planned gas**, **computer configuration**, and **historical logged gas** distinct. A new measurement must not silently rewrite historical dives or a computer's settings. Any supported device configuration action needs its own explicit review and result.

**Completion test:** select a plan and cylinder, record an analysis, revisit it, and see which measurement belongs to which cylinder and when it was taken. Multiple cylinders must not default ambiguously.

### E. Calculator → active planning question

When opened from a plan, prefill compatible values with visible source labels. Let the user change them without changing the plan until they choose **Use in this plan**. Preserve standalone calculator behavior for quick calculations.

Start with one useful integration rather than linking every calculator. Preserve units and distinguish calculated estimates from recorded measurements. A calculation result should not imply a complete dive-safety assessment.

### F. Completed trip → debrief → future preparation

Dive Intelligence already links prior evidence, plans, and trip debriefs. Improve the presentation of this existing loop before building another summary engine. Bring planned versus recorded activity, photos, confirmed observations, and relevant personal trends into a coherent trip recap.

Offer specific, reviewable follow-up actions such as **Use this setup for another trip** or **Plan another dive here**. Do not turn sparse data into authoritative recommendations or label sample-count confidence as safety confidence.

### G. Home → resume the current task

Use Home to surface a small number of timely actions: continue an unfinished import review, open an upcoming plan, finish packing, or revisit a recent dive. Existing feature destinations remain available through navigation.

Prioritize by relevance, allow dismissal, and avoid filling Home with every capability. No history or plans should produce a welcoming starting point, not a wall of empty cards.

## 5. Connection rules

1. **Pass the object, not just the screen name.** Include the relevant dive, photo, plan, site, or gear identifier and return destination.
2. **One authoritative record.** Link to shared objects instead of copying editable versions into multiple sections.
3. **Return with a result.** A supporting workflow should communicate saved, cancelled, or failed outcomes and restore the source screen's context.
4. **Protect drafts.** Navigating to Lens, Atlas, or a calculator must not discard an unfinished edit.
5. **Make automation legible.** Show what was inferred, what evidence supports it, and what the diver confirmed.
6. **Make correction practical.** Unlink, reassign, undo, and retry should be available where mistakes are likely.
7. **Respect offline use.** Core saved records remain usable without inference or network services; retries must not duplicate results.
8. **Keep actions selective.** One useful contextual action is better than a row of links to every feature.

## 6. Suggested delivery order

| Phase | Work | Exit condition |
| --- | --- | --- |
| 1: Trust | Download checkpoints, recoverable restoration, account isolation, accurate BLE errors | Interruption and account-switch scenarios pass with real records and attachments |
| 2: Visible polish | Connected-device screen, error language, consistent action hierarchy, main-journey walkthrough | Users can identify the next action without interpreting technical details |
| 3: First complete connection | Existing dive photo → Lens → saved identification → original photo | Context and drafts survive; uncertainty and confirmation are clear |
| 4: Dive continuity | Atlas/site/plan/history return paths and unified import review | A diver moves through exploration and logging without repeated search or duplicate data |
| 5: Preparation and reflection | Cylinder analysis, selective calculator integration, trip debrief, Home resume actions | Each connection saves meaningful effort and has clear ownership of its result |

Avoid a wholesale navigation redesign before observing users. The current architecture already supports several of these relationships; refine and extend those paths first.

## 7. How to decide whether it feels premium

Run a small moderated usability round with divers unfamiliar with the app and experienced users. Include a first-time import, repeat sync, photo identification from a dive, site-to-plan workflow, gear preparation, and an offline scenario. Separately test large text and assistive navigation.

Record task completion without help, backtracking, repeated data entry, wrong-destination taps, lost drafts, and whether the participant can explain what was saved. Ask participants to distinguish imported facts from suggestions. Time only comparable tasks; faster is not automatically better when confirmation matters.

A competitive assessment should use the same tasks, current versions, and comparable devices across selected diving apps. This document makes no unverified market-ranking claim.

The release goal is concrete: the diver can start from a site, a plan, a computer, or a photo and arrive at one coherent personal diving history—with clear evidence, useful next actions, and confidence that their work is saved.
