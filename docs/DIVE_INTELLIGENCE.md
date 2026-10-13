# Dive Intelligence

DMZ Dive Intelligence connects Planner assumptions with prior logbook evidence and automatic trip summaries. It is deliberately deterministic: the same saved records always produce the same brief or debrief, and no generated advice is stored.

## Data flow

1. `usePlanner` loads normalized plans, Gear Locker state and lightweight logbook index rows.
2. `buildDiveBrief(plan, rows, gear, manualBaseline)` selects up to 20 of the most recent earlier dives from the same linked site or matching site name. If none match, it falls back to the 20 most recent earlier personal dives. Optional starting values from personal setup fill only measurements that have no recorded evidence.
3. The Planner shows the baseline sample count, confidence tier and source scope. A gas estimate is gated on explicit depth, time, start-pressure and reserve assumptions plus personal SAC or RMV evidence.
4. The Logbook derives trips from dates. Opening a trip loads every full computer log, rebuilds the rows, loads saved plans and uses `matchPlanToTrip` to find an overlapping plan.
5. `buildTripDebrief` compares the completed trip with earlier same-site history when available, otherwise all earlier history. The current trip is always excluded from its own baseline.

## Confidence

- 1–2 evidence dives: Early estimate
- 3–7: Building confidence
- 8 or more: High confidence

Confidence describes sample size only. It is not a safety rating.

The first-time personal setup can collect optional SAC, RMV, typical depth, duration and minimum-temperature starting values. They are clearly labeled **Starting values**, are local to the phone, and are fallback data only: recorded logbook evidence replaces each measurement independently as soon as it exists.

On the plan overview, **Set up this dive brief** opens a focused sheet for the four plan-specific assumptions: target depth, bottom time, starting pressure and reserve pressure. The card shows `n of 4 set` until they are complete. Cylinder volume is optional because the engine can use the selected setup when it contains exactly one cylinder.

## Gas estimate

The preferred calculation uses personal RMV and cylinder water volume:

`used bar = RMV × (1 + depth metres / 10) × minutes / cylinder litres`

If RMV or cylinder volume is unavailable but personal SAC exists, the fallback is:

`used bar = SAC × (1 + depth metres / 10) × minutes`

The fallback is explicitly labeled as assuming a comparable cylinder. Estimated ending pressure is `start pressure - used pressure`, and reserve margin is `ending pressure - selected reserve`. This is a planning reference, not a decompression calculation or reserve policy.

## Debugging checklist

Run `npm run test:dive-intelligence` first.

For a missing or surprising Planner value, inspect:

1. `plan.startDate` and `plan.destination.siteId/name`.
2. The brief card's `n of 4 set` status, then `plan.diveProfile`; values are stored in metres, minutes and bar.
3. The matching index rows' `siteId`, `siteName`, `avgDepthMeters`, `tempMinC`, `sacBarPerMin` and `rmvLitersPerMin`.
4. The evidence text shown in the card. It states whether the engine selected site history or all personal history and how many dives qualified.
5. The selected setup. Automatic cylinder volume is used only when exactly one cylinder item belongs to it; otherwise enter volume explicitly.
6. `appSettings.diveBaseline` when the diver expects a starting value. If recorded values exist for that measurement, seeing recorded evidence instead is correct.

For a trip debrief, inspect:

1. The automatic trip's first/last dates.
2. Full rows rebuilt by `indexRowFromDive`; this is where secondary-computer transmitter data is recovered.
3. The matched plan's date overlap and destination name.
4. Whether older same-site rows exist before the trip. The trip's own rows are removed from the baseline.

Primary implementation: `src/features/diveIntelligence/model.js`. Planner presentation lives in `src/screens/PlannerScreen.js`; post-trip presentation lives in `src/screens/DiveLogScreen.js`.
