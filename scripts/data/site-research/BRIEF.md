# Site research brief — DMZ Scuba Ocean Atlas

## Current ownership

Claude is the sole research-batch owner unless the user explicitly reassigns the work. Other AI agents may build,
verify, audit and publish the existing evidence, but must not start or edit research batches. This keeps two agents
from researching the same queue entry or overwriting one another's evidence.

You research ONE batch of dive sites and write ONE evidence file. You never edit app code, other evidence files,
`queue.json` or `verified.json`.

## Your batch
`scripts/data/site-research/queue.json` → `batches[]` → the entry whose `name` you were given. Each site has
`id, name, lat, lon, place`, what the catalog already `known`s (depth, entry, types, water, Wikipedia article),
`seafloorNearPinM` (a modelled seafloor around the pin — a sanity check, never a source) and `mapSource`.
Fill the gaps; confirm or correct what is known.

## What to find for each site (only what a real source states)
- **depth**: top (shallowest point / top of wreck) and bottom (max depth / depth the wreck lies in)
- **entry**: boat | shore | boat-shore · **types**: reef wall wreck pinnacle cave cavern muck drift
- **level**: beginner | intermediate | advanced | technical (as the source rates it, or as the depth/current imply
  when the source describes it — e.g. "for experienced divers only, strong current" → advanced)
- **current**: none | light | moderate | strong | variable · **vis**: typical visibility range
- **waterTemp**: ONLY when site-specific (springs, quarries, a named site's stated temps) — not regional climate
- **season**: the site's own best months if stated · **mooring** / **access** (permits, fees, park rules, boat-only)
  / **penetration** (wrecks/caves)
- **highlights** (what divers see: features, marine life, ≤ 60 chars each) and **hazards** (≤ 60 chars each)
- **summary**: 1–2 sentences, ≤ 300 characters, IN YOUR OWN WORDS, synthesised from at least two independent
  publishers (or one agency/park). Describe the dive: what it is, where, what makes it worth doing.

## Output file: `scripts/data/site-research/<batch name>.json`
```json
{ "batch": "<name>", "researchedAt": "YYYY-MM-DD", "sites": [ {
  "id": "<id exactly as in the queue>", "name": "<name exactly as in the queue>",
  "sources": {
    "s1": { "url": "https://… exact page (https only)", "publisher": "Who publishes it", "kind": "agency|park|encyclopedia|operator|press",
            "quote": "verbatim words from the page that contain the facts you cite from it (≤ 40 words; join several snippets with ' … ')" }
  },
  "depth": [ { "ref": "s1", "unit": "ft", "top": 15, "bottom": 60 } ],
  "entry": { "value": "boat", "refs": ["s1"] },
  "types": { "value": ["reef", "wall"], "refs": ["s1"] },
  "level": { "value": "intermediate", "refs": ["s2"] },
  "current": { "value": "moderate", "refs": ["s2"] },
  "vis": { "low": 15, "high": 30, "unit": "m", "refs": ["s2"] },
  "waterTemp": { "low": 72, "high": 72, "unit": "F", "note": "spring-fed, constant all year", "refs": ["s1"] },
  "season": { "from": 3, "to": 9, "refs": ["s1"] },
  "mooring": { "value": "Mooring buoys on site", "refs": ["s1"] },
  "access": { "value": "Marine park fee; boat access only", "refs": ["s1"] },
  "highlights": [ { "text": "Hammerhead sharks in winter", "refs": ["s2"] } ],
  "hazards": [ { "text": "Strong down-currents on the outer wall", "refs": ["s2"] } ],
  "summary": { "text": "…your own words…", "refs": ["s1", "s2"] },
  "depthNote": "optional ≤ 120 chars, e.g. 'Bow at 60 ft, sand at 110 ft'"
} ] }
```
Omit any field you have no source for. Include only sites with at least one sourced fact. Save after every few
sites so nothing is lost if you are stopped.

## Rules — legal and quality (the build enforces them; breaking them wastes your work)
1. **Facts, not text.** Record facts and who published them. The quote is evidence only (it is never shipped).
   The summary must be your own words: the build rejects any summary sharing 8 consecutive words with a quote.
2. **Banned as sources** (directory databases — use only to learn a site's other names): padi.com (incl. PADI
   Travel), wannadive.net, divesitedirectory.com, divebuddy.com, divessi.com, scubaboard.com, tripadvisor.*,
   zentacle.com, deepblu.com, diveadvisor.com, dive.site, diveplannerpro.com, sea-seek.com, duikersgids.nl,
   airguide.info, shorediving.com, scubadiving.com/dive-sites.
3. **Good sources, best first**: agency / marine park / sanctuary / preserve pages (`agency`, `park`); Wikipedia
   (`encyclopedia`); dive operators, liveaboards, resorts (`operator`); magazines, newspapers, guidebooks (`press`).
4. **Depth** is accepted with one agency/park claim, or two DIFFERENT websites agreeing within ~20 %. A summary
   needs two different websites (or one agency/park). Try for two.
5. **Open every page** (WebFetch) and copy the quote from the page itself. A verifier re-downloads every page
   and drops any claim whose numbers are not on it. Never rely on search snippets or memory.
6. **Same site?** Same name AND same area as `place`/`lat`/`lon` — names repeat worldwide. Pages that cover many
   sites: make sure the number belongs to this one.
7. **No bulk crawling**: at most ~20 pages from any single website per batch.
8. **Not a dive site?** If a reliable page shows the pin is not something a diver can dive — raised, scrapped,
   buried or on land (`gone`); never found (`unlocated`); closed, military or no-access zone (`restricted`); a whole
   lake, park, river, bay or town rather than one site (`area`); only reachable by ROV / beyond ~150 m (500 ft); wrecks at 60–150 m are technical dives, not too-deep
   (`too-deep`) — write `"notDiveSite": { "kind": "gone", "reason": "Raised in 1969 and scrapped ashore", "refs": ["s1"] }`
   with its source (and nothing else for that site). The build hides the pin. Only do this with a source that says so.
9. **Skip** generic names you cannot pin down ("House Reef", "Dive Site 3") and businesses — leave them out
   (mention them in your report). Towns, parks and whole lakes: mark `notDiveSite` (`area`) when a page shows it.
10. Budget: ~3–5 searches per site. Breadth over perfection — cover the whole batch.

## Check before you finish
```
node scripts/verify-research-quotes.cjs <batch name>
node scripts/build-site-research.cjs --check --verbose 2>&1 | grep -E "<batch name>|automated entries|site research"
```
Fix what the output flags (re-quote from the page, add a second source, reword a summary). Never run the build
without `--check`.

## Final message (short)
Sites in batch · sites with facts · full profiles accepted · depths accepted · held (top reasons) ·
pins that look wrong (name, why) · catalog entries that are not dive sites.
