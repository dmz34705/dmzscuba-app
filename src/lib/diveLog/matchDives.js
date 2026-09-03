// Cross-computer dive matcher (B6). Pure, framework-independent, unit-tested.
//
// Given a freshly downloaded ComputerLog and the logs already in the book, decide
// which (if any) existing Dive is the *same real dive* recorded by a different
// computer — even when the two computers' clocks disagree (timezone changes, DST,
// a clock never set) — and by how much they disagree.
//
// Nothing here writes: it returns proposals for the B7 conflict UI to apply.

const RESAMPLE_SEC = 10;
const SEARCH_WINDOW_SEC = 30 * 3600;   // ± this around the reported-start difference
const COARSE_STEP_SEC = 15 * 60;       // clock errors are ~timezone-shaped
const FINE_STEP_SEC = RESAMPLE_SEC;
const FINE_SPAN_SEC = 8 * 60;          // refine ± this around the coarse best
const CLEAN_OFFSET_UNIT_MIN = 15;      // a real clock error rounds to a multiple of this
const CLEAN_OFFSET_TOL_SEC = 150;
// A clock set to the wrong timezone is off by <= ~15 h; DST/quarter-hours don't
// change that. Anything past ~26 h means a battery-pull / never-set clock — the
// profile match is the only evidence, so those always need a human.
const TIMEZONE_OFFSET_MAX_MIN = 15 * 60;
const PLAUSIBLE_OFFSET_MAX_MIN = 26 * 60;

const DURATION_TOL_SEC = 120;
const DURATION_TOL_FRAC = 0.08;
const DEPTH_TOL_M = 1.5;
const DEPTH_TOL_FRAC = 0.08;

const AUTO_SCORE = 0.95;
const CONFIRM_SCORE = 0.80;
const MIN_OVERLAP_FRAC = 0.6;

const SPLIT_MAX_GAP_SEC = 12 * 60;     // a surface gap shorter than this can be one dive
const FRAGMENT_MAX_FRAC = 0.9;         // a "fragment" is meaningfully shorter than the whole
const FRAGMENT_MIN_SEC = 120;          // ignore trivially short blips

const clamp01 = (v) => Math.max(0, Math.min(1, v));

const norm = (s) => String(s == null ? '' : s).trim().toLowerCase();

/**
 * Two logs are from the same physical computer when the model matches and either
 * the serials match or one is missing. Tolerant on serial because a download can
 * miss it (partial handshake) or an older import never captured it — and the
 * matcher must NEVER cross-compare two logs from one unit.
 */
export function sameComputer(a, b) {
  const da = a || {};
  const db = b || {};
  if (norm(da.vendor) !== norm(db.vendor) || norm(da.product) !== norm(db.product)) return false;
  const sa = norm(da.serial);
  const sb = norm(db.serial);
  return !sa || !sb || sa === sb;
}

function deviceOf(logOrDive) {
  if (logOrDive?.device) return logOrDive.device;
  const parts = String(logOrDive?.deviceKey || '').split('|');
  return { vendor: parts[0] || '', product: parts[1] || '', serial: parts[2] || '' };
}

function cleanTimeSamples(samples) {
  return (Array.isArray(samples) ? samples : [])
    .filter((s) => s && Number.isFinite(s.t) && Number.isFinite(s.depth) && s.depth >= 0)
    .slice()
    .sort((a, b) => a.t - b.t);
}

/** Depths at 0, interval, 2·interval… seconds (linear interpolation between samples). */
export function resampleDepth(samples, interval = RESAMPLE_SEC) {
  const rows = cleanTimeSamples(samples);
  if (rows.length < 2) return [];
  const end = rows[rows.length - 1].t;
  const out = [];
  let j = 0;
  for (let t = 0; t <= end; t += interval) {
    while (j < rows.length - 1 && rows[j + 1].t < t) j += 1;
    const a = rows[j];
    const b = rows[Math.min(j + 1, rows.length - 1)];
    if (b.t === a.t) { out.push(a.depth); continue; }
    const frac = clamp01((t - a.t) / (b.t - a.t));
    out.push(a.depth + (b.depth - a.depth) * frac);
  }
  return out;
}

function maxOf(arr) {
  let m = 0;
  for (const v of arr) if (v > m) m = v;
  return m;
}

/**
 * Similarity of two resampled depth series where series B is shifted `lagSteps`
 * samples later than A. 1 = identical over the overlap, 0 = nothing alike.
 * Returns null when the overlap is too small to judge.
 */
export function alignmentScore(a, b, lagSteps) {
  const startA = Math.max(0, lagSteps);
  const startB = Math.max(0, -lagSteps);
  const overlap = Math.min(a.length - startA, b.length - startB);
  if (overlap <= 0) return null;
  const shorter = Math.min(a.length, b.length);
  if (overlap < shorter * MIN_OVERLAP_FRAC) return null;

  const ref = Math.max(maxOf(a), maxOf(b), 5);
  let sq = 0;
  for (let i = 0; i < overlap; i += 1) {
    const diff = a[startA + i] - b[startB + i];
    sq += diff * diff;
  }
  const rmse = Math.sqrt(sq / overlap);
  return clamp01(1 - rmse / ref);
}

/**
 * Best time offset (seconds to ADD to logB's clock so it lines up with logA) and
 * its alignment score. `reportedDeltaSec` = startA - startB in wall-clock terms.
 */
export function bestOffset(samplesA, samplesB, reportedDeltaSec = 0) {
  const a = resampleDepth(samplesA);
  const b = resampleDepth(samplesB);
  if (a.length < 3 || b.length < 3) return { offsetSec: 0, score: 0 };

  const scan = (centerSec, stepSec, spanSec) => {
    let best = { offsetSec: centerSec, score: -1 };
    for (let o = centerSec - spanSec; o <= centerSec + spanSec; o += stepSec) {
      const lagSteps = Math.round((o - reportedDeltaSec) / RESAMPLE_SEC);
      const score = alignmentScore(a, b, lagSteps);
      if (score != null && score > best.score) best = { offsetSec: o, score };
    }
    return best;
  };

  const coarse = scan(0, COARSE_STEP_SEC, SEARCH_WINDOW_SEC);
  if (coarse.score < 0) return { offsetSec: 0, score: 0 };
  const fine = scan(coarse.offsetSec, FINE_STEP_SEC, FINE_SPAN_SEC);
  return fine.score >= coarse.score ? fine : coarse;
}

/**
 * Round a raw offset to the nearest "clock-shaped" value (a 15-min multiple
 * within a plausible clock-error range), or null if it isn't one. Snapping alone
 * isn't enough — for a large offset the nearest 15-min grid point is always
 * close, so we also bound the magnitude.
 */
export function cleanOffsetMinutes(offsetSec) {
  if (Math.abs(offsetSec) > PLAUSIBLE_OFFSET_MAX_MIN * 60) return null;
  const unit = CLEAN_OFFSET_UNIT_MIN * 60;
  const snapped = Math.round(offsetSec / unit) * unit;
  return Math.abs(offsetSec - snapped) <= CLEAN_OFFSET_TOL_SEC ? Math.round(snapped / 60) : null;
}

/** A clean offset small enough to be an ordinary timezone error (auto-mergeable). */
function isTimezoneOffset(offsetMinutes) {
  return offsetMinutes != null && Math.abs(offsetMinutes) <= TIMEZONE_OFFSET_MAX_MIN;
}

function durationClose(a, b) {
  return Math.abs(a - b) <= Math.max(DURATION_TOL_SEC, DURATION_TOL_FRAC * Math.max(a, b));
}
function depthClose(a, b) {
  return Math.abs(a - b) <= Math.max(DEPTH_TOL_M, DEPTH_TOL_FRAC * Math.max(a, b));
}

function iso(ms) {
  return Number.isFinite(ms) ? new Date(ms).toISOString() : '';
}

/**
 * Compare one candidate log/dive against the new log. Returns a classification:
 *   verdict: 'auto' | 'confirm' | 'none'
 *   score, offsetSec, offsetMinutes (clean, or raw rounded), clockConflict
 */
export function classifyPair(newLog, candidate) {
  const nDur = newLog.durationSeconds || 0;
  const cDur = candidate.durationSeconds || 0;
  const nDepth = newLog.water?.maxDepthMeters || 0;
  const cDepth = candidate.water?.maxDepthMeters || 0;
  if (!durationClose(nDur, cDur) || !depthClose(nDepth, cDepth)) {
    return { verdict: 'none', score: 0 };
  }

  const startNew = Date.parse(newLog.reportedStartTime || newLog.startTime);
  const startCand = Date.parse(candidate.startTime || candidate.reportedStartTime);
  const reportedDeltaSec = Number.isFinite(startNew) && Number.isFinite(startCand)
    ? (startNew - startCand) / 1000
    : 0;

  const { offsetSec: rawOffsetSec, score } = bestOffset(
    candidate.profile?.samples || candidate.samples,
    newLog.profile?.samples || newLog.samples,
    reportedDeltaSec,
  );
  // Convention: `offsetMinutes` = minutes to ADD to the NEW log's reported start
  // so it lines up with the matched dive. bestOffset returns startNew - startCand;
  // negate it.
  const offsetSec = -rawOffsetSec;
  const clean = cleanOffsetMinutes(offsetSec);
  const offsetMinutes = clean != null ? clean : Math.round(offsetSec / 60);
  const clockConflict = Math.abs(offsetMinutes) >= 1;

  let verdict = 'none';
  if (score >= AUTO_SCORE) verdict = 'auto';
  else if (score >= CONFIRM_SCORE) verdict = 'confirm';
  // Auto-merge only when clocks agree, or disagree by an ordinary timezone-shaped
  // amount. A big offset (battery-pull / never-set clock) is only backed by the
  // profile shape — always confirm.
  if (verdict === 'auto' && clockConflict && !isTimezoneOffset(clean)) verdict = 'confirm';

  return {
    verdict,
    score: Math.round(score * 1000) / 1000,
    offsetSec: Math.round(offsetSec),
    offsetMinutes,
    implausibleClock: clean == null && clockConflict,
    cleanOffset: clean != null,
    clockConflict,
  };
}

function samplesOf(logOrDive) {
  return logOrDive?.profile?.samples || logOrDive?.samples || [];
}
function wallStart(logOrDive) {
  return Date.parse(logOrDive?.reportedStartTime || logOrDive?.startTime);
}

/** Best lag (in samples) at which `short` sits inside `long`, sliding over the whole span. */
function subwindowBestLag(long, short) {
  if (long.length < 3 || short.length < 3 || short.length >= long.length) return { lagSteps: 0, score: -1 };
  const maxLag = long.length - Math.floor(short.length * MIN_OVERLAP_FRAC);
  const scanAt = (center, step, span) => {
    let best = { lagSteps: center, score: -1 };
    for (let lag = Math.max(0, center - span); lag <= Math.min(maxLag, center + span); lag += step) {
      const s = alignmentScore(long, short, lag);
      if (s != null && s > best.score) best = { lagSteps: lag, score: s };
    }
    return best;
  };
  const coarse = scanAt(Math.floor(maxLag / 2), Math.max(1, Math.round(30 / RESAMPLE_SEC)), maxLag);
  if (coarse.score < 0) return coarse;
  return scanAt(coarse.lagSteps, 1, Math.round(60 / RESAMPLE_SEC));
}

/**
 * Is `shortLog` a *fragment* of the longer `longRef` — i.e. one computer ended
 * the dive early / started a new one (Suunto) where the other saw it as one
 * continuous dive (Shearwater)? Aligns the short profile against a window of the
 * long one.
 * @returns { verdict, score, offsetMinutes, cleanOffset, windowStartSec }
 */
export function classifyFragment(shortLog, longRef) {
  const shortDur = shortLog.durationSeconds || 0;
  const longDur = longRef.durationSeconds || 0;
  if (shortDur < FRAGMENT_MIN_SEC) return { verdict: 'none' };
  if (shortDur >= longDur * FRAGMENT_MAX_FRAC) return { verdict: 'none' }; // not shorter -> use classifyPair
  const shortDepth = shortLog.water?.maxDepthMeters || 0;
  const longDepth = longRef.water?.maxDepthMeters || 0;
  if (shortDepth > longDepth + Math.max(DEPTH_TOL_M, DEPTH_TOL_FRAC * longDepth)) return { verdict: 'none' };

  const long = resampleDepth(samplesOf(longRef));
  const short = resampleDepth(samplesOf(shortLog));
  const { lagSteps, score } = subwindowBestLag(long, short);
  if (score < CONFIRM_SCORE) return { verdict: 'none' };

  const lagSec = lagSteps * RESAMPLE_SEC;
  const sShort = wallStart(shortLog); // ms
  const sLong = wallStart(longRef);   // ms
  // minutes to add to the fragment's reported start so it sits where it belongs.
  // wallStart is in ms; convert the wall-clock gap to seconds before adding lagSec.
  const offsetSec = Number.isFinite(sShort) && Number.isFinite(sLong)
    ? (sLong - sShort) / 1000 + lagSec
    : 0;
  const clean = cleanOffsetMinutes(offsetSec);
  const offsetMinutes = clean != null ? clean : Math.round(offsetSec / 60);
  const clockConflict = Math.abs(offsetMinutes) >= 1;

  let verdict = 'confirm';
  if (score >= AUTO_SCORE && (!clockConflict || isTimezoneOffset(clean))) verdict = 'auto';

  return {
    verdict,
    score: Math.round(score * 1000) / 1000,
    offsetSec: Math.round(offsetSec),
    offsetMinutes,
    cleanOffset: clean != null,
    clockConflict,
    implausibleClock: clean == null && clockConflict,
    windowStartSec: lagSec,
    kind: 'fragment',
  };
}

/**
 * Does the new (long) log correspond to two consecutive candidate fragments from
 * one device that were split at the surface? Returns a match when the fragments'
 * combined span and the surface gap fit, and the profile aligns.
 */
export function classifySplit(newLog, fragA, fragB) {
  const aStart = Date.parse(fragA.startTime || fragA.reportedStartTime);
  const bStart = Date.parse(fragB.startTime || fragB.reportedStartTime);
  if (!Number.isFinite(aStart) || !Number.isFinite(bStart) || bStart < aStart) return { verdict: 'none' };
  const gapSec = (bStart - aStart) / 1000 - (fragA.durationSeconds || 0);
  if (gapSec < 0 || gapSec > SPLIT_MAX_GAP_SEC) return { verdict: 'none' };

  const combinedDur = (fragA.durationSeconds || 0) + gapSec + (fragB.durationSeconds || 0);
  if (!durationClose(newLog.durationSeconds || 0, combinedDur)) return { verdict: 'none' };

  // Stitch the two fragment profiles onto one time axis (gap held at ~3 m).
  const stitched = [];
  for (const s of cleanTimeSamples(fragA.profile?.samples || fragA.samples)) stitched.push({ t: s.t, depth: s.depth });
  const gapStart = (fragA.durationSeconds || 0);
  stitched.push({ t: gapStart + gapSec / 2, depth: 1 });
  for (const s of cleanTimeSamples(fragB.profile?.samples || fragB.samples)) {
    stitched.push({ t: gapStart + gapSec + s.t, depth: s.depth });
  }

  const startNew = Date.parse(newLog.reportedStartTime || newLog.startTime);
  const reportedDeltaSec = Number.isFinite(startNew) && Number.isFinite(aStart)
    ? (aStart - startNew) / 1000
    : 0;
  const { offsetSec: rawOffsetSec, score } = bestOffset(stitched, newLog.profile?.samples || newLog.samples, reportedDeltaSec);
  if (score < CONFIRM_SCORE) return { verdict: 'none' };
  const offsetSec = -rawOffsetSec; // minutes to add to the NEW log to meet the fragments
  const clean = cleanOffsetMinutes(offsetSec);
  return {
    verdict: score >= AUTO_SCORE && clean != null ? 'auto' : 'confirm',
    score: Math.round(score * 1000) / 1000,
    offsetMinutes: clean != null ? clean : Math.round(offsetSec / 60),
    cleanOffset: clean != null,
    fragmentIds: [fragA.id, fragB.id],
  };
}

function stitchProfiles(entries) {
  // entries: [{ samples, durationSeconds, wallStart }] in start order
  const out = [];
  let cursor = 0;
  let prevEnd = null;
  for (const e of entries) {
    let gap = 0;
    if (prevEnd != null && Number.isFinite(e.wallStart)) {
      gap = Math.max(0, (e.wallStart - prevEnd) / 1000);
      out.push({ t: cursor + gap / 2, depth: 1 }); // surface point in the gap
    }
    cursor += gap;
    for (const s of cleanTimeSamples(e.samples)) out.push({ t: cursor + s.t, depth: s.depth });
    cursor += e.durationSeconds || 0;
    prevEnd = Number.isFinite(e.wallStart) ? e.wallStart + (e.durationSeconds || 0) * 1000 : null;
  }
  return out;
}

/**
 * Does the new (long) log span a run of 2–3 existing same-device dives that were
 * each logged separately (the splitting computer downloaded first)? Returns a
 * merge proposal covering those dives.
 */
export function findSpanningMerge(newLog, candidates) {
  const longDur = newLog.durationSeconds || 0;
  const newSamples = samplesOf(newLog);
  if (longDur < FRAGMENT_MIN_SEC || resampleDepth(newSamples).length < 3) return null;

  // same-device candidate dives, each much shorter than newLog, sorted by start
  const newDevice = deviceOf(newLog);
  const byDevice = new Map();
  for (const c of candidates) {
    const logs = c.logs || [];
    // fragments belong to a DIFFERENT computer than the one we're spanning with
    if (logs.some((l) => sameComputer(deviceOf(l), newDevice))) continue;
    const ref = logs.find((l) => l.id === c.dive.primaryLogId) || logs[0];
    if (!ref || !ref.deviceKey) continue;
    if ((ref.durationSeconds || 0) >= longDur * FRAGMENT_MAX_FRAC) continue;
    if (!byDevice.has(ref.deviceKey)) byDevice.set(ref.deviceKey, []);
    byDevice.get(ref.deviceKey).push({ dive: c.dive, ref });
  }

  for (const runs of byDevice.values()) {
    runs.sort((a, b) => wallStart(a.ref) - wallStart(b.ref));
    for (let i = 0; i < runs.length - 1; i += 1) {
      for (let n = 2; n <= 3 && i + n <= runs.length; n += 1) {
        const group = runs.slice(i, i + n);
        const entries = group.map((g) => ({
          samples: samplesOf(g.ref),
          durationSeconds: g.ref.durationSeconds || 0,
          wallStart: wallStart(g.ref),
        }));
        // gap between any two fragments must look like a brief surface interval
        let gapsOk = true;
        for (let k = 1; k < entries.length; k += 1) {
          const gap = (entries[k].wallStart - entries[k - 1].wallStart) / 1000 - entries[k - 1].durationSeconds;
          if (!(gap >= 0 && gap <= SPLIT_MAX_GAP_SEC)) gapsOk = false;
        }
        if (!gapsOk) continue;

        const stitched = stitchProfiles(entries);
        const firstStart = entries[0].wallStart;
        const sNew = wallStart(newLog);
        const reportedDeltaSec = Number.isFinite(firstStart) && Number.isFinite(sNew) ? (firstStart - sNew) / 1000 : 0;
        const { offsetSec: rawOffsetSec, score } = bestOffset(stitched, newSamples, reportedDeltaSec);
        if (score < CONFIRM_SCORE) continue;
        const offsetSec = -rawOffsetSec;
        const clean = cleanOffsetMinutes(offsetSec);
        const offsetMinutes = clean != null ? clean : Math.round(offsetSec / 60);
        const clockConflict = Math.abs(offsetMinutes) >= 1;
        return {
          kind: 'spanning-merge',
          verdict: score >= AUTO_SCORE && (!clockConflict || isTimezoneOffset(clean)) ? 'auto' : 'confirm',
          score: Math.round(score * 1000) / 1000,
          diveIds: group.map((g) => g.dive.id),
          offsetSec: Math.round(offsetSec),
          offsetMinutes,
          cleanOffset: clean != null,
          clockConflict,
          implausibleClock: clean == null && clockConflict,
        };
      }
    }
  }
  return null;
}

/**
 * Match a new log against the existing book.
 * @param {object} newLog                the freshly downloaded ComputerLog
 * @param {Array<{dive, logs}>} candidates  existing dives + their logs (caller pre-filters by ~time window)
 * @returns {{ bestMatch: object|null }}
 *   bestMatch.kind: 'pair' | 'fragment' | 'spanning-merge'
 */
export function findMatch(newLog, candidates) {
  let bestMatch = null;
  const consider = (m) => {
    if (!m || m.verdict === 'none') return;
    if (!bestMatch || m.score > bestMatch.score) bestMatch = m;
  };
  const absorb = []; // existing dives that are each a fragment of newLog

  for (const cand of candidates) {
    const dive = cand.dive;
    const logs = cand.logs || [];
    // This exact download is already on this dive (fingerprint) — nothing to do.
    if (newLog.fingerprint && logs.some((l) => l.fingerprint === newLog.fingerprint
        && l.deviceKey === newLog.deviceKey)) {
      continue;
    }
    // Only ever compare against logs from a DIFFERENT computer. Two dives from
    // the same physical unit are never "the same dive with different clocks";
    // same-unit logs are only ever combined by the split-fragment fusion, which
    // needs a different computer's continuous log to anchor it (findSpanningMerge).
    const newDevice = deviceOf(newLog);
    const crossLogs = logs.filter((l) => !sameComputer(deviceOf(l), newDevice));
    if (!crossLogs.length) continue;
    const ref = crossLogs.reduce((a, b) => ((b.durationSeconds || 0) > (a.durationSeconds || 0) ? b : a));
    const sameModel = norm(deviceOf(ref).vendor) === norm(newDevice.vendor)
      && norm(deviceOf(ref).product) === norm(newDevice.product);
    // A years-apart "match" between two units of the same model is almost always
    // a shape-only false positive — a real cross-computer clock error is small.
    const keep = (m) => (m && m.implausibleClock && sameModel ? null : m);

    const pair = classifyPair(newLog, ref);
    consider(keep(pair.verdict === 'none' ? null : { ...pair, diveId: dive.id, kind: 'pair' }));

    // newLog is a fragment of this longer existing dive
    const frag = classifyFragment(newLog, ref);
    consider(keep(frag.verdict === 'none' ? null : { ...frag, diveId: dive.id }));

    // this existing dive is a fragment of the (longer) newLog -> absorb it
    const existingFrag = classifyFragment(ref, newLog);
    if (existingFrag.verdict !== 'none' && !(existingFrag.implausibleClock && sameModel)) {
      absorb.push({ diveId: dive.id, result: existingFrag, deviceKey: ref.deviceKey, start: dive.startTime });
    }
  }

  // Prefer the validated stitch when the new long log spans several
  // separately-logged same-device dives; else fall back to absorbing the
  // individual fragments we found.
  const spanning = findSpanningMerge(newLog, candidates);
  if (spanning) {
    if (!bestMatch || spanning.score >= bestMatch.score) bestMatch = spanning;
  } else if (absorb.length && (!bestMatch || bestMatch.kind !== 'pair')) {
    const best = absorb.reduce((a, b) => (b.result.score > a.result.score ? b : a));
    const worstVerdict = absorb.some((a) => a.result.verdict !== 'auto') ? 'confirm' : 'auto';
    bestMatch = {
      kind: 'spanning-merge',
      verdict: worstVerdict,
      score: best.result.score,
      diveIds: absorb.map((a) => a.diveId),
      // offset corrects the fragments' clock; classifyFragment(ref,newLog) gives
      // "minutes to add to the fragment"
      offsetMinutes: best.result.offsetMinutes,
      cleanOffset: !!best.result.cleanOffset,
      clockConflict: Math.abs(best.result.offsetMinutes) >= 1,
      implausibleClock: !!best.result.implausibleClock,
    };
  }

  return { bestMatch };
}

// ---------------------------------------------------------------------------
// Whole-sequence reconciliation
// ---------------------------------------------------------------------------

const RECONCILE_BUCKET_MS = 5 * 60 * 1000;   // group candidate offsets this coarsely
const OVERLAP_SLACK_MS = 90 * 1000;          // recording-start jitter between computers

/** [start, end] in ms for a dive entry ({ startMs, durationSeconds }). */
function interval(d) {
  return [d.startMs, d.startMs + (d.durationSeconds || 0) * 1000];
}
function intervalsOverlap(a, b, slack = OVERLAP_SLACK_MS) {
  return a[0] - slack <= b[1] && b[0] - slack <= a[1];
}

/** Sum of durations + surface gaps for a consecutive run of entries (ms). */
function runSpanMs(entries) {
  if (!entries.length) return 0;
  const first = entries[0];
  const last = entries[entries.length - 1];
  return (last.startMs - first.startMs) + (last.durationSeconds || 0) * 1000;
}

/**
 * Reconcile two computers' whole dive sequences. Both recorded the same trip, so
 * there is ONE clock offset between them — found from every dive at once, which
 * is far more robust than a single pairwise profile match. Then the dives are
 * grouped into real dives (1:1, or one side split into fragments).
 *
 * @param {Array} a  computer A's dives: { id, startMs, durationSeconds, maxDepthMeters, samples }
 * @param {Array} b  computer B's dives (same shape)
 * @returns null, or {
 *   offsetMinutes,     // minutes to ADD to B's clock so it matches A
 *   cleanOffset,       // the offset snaps to a timezone-shaped value
 *   confidence,        // 'high' (>=2 mutually-consistent anchors) | 'low'
 *   anchors,
 *   groups: [{ aIds, bIds, kind: 'pair'|'a-split'|'b-split' }]  // only multi-member groups
 * }
 */
export function reconcileComputers(a, b) {
  const A = (Array.isArray(a) ? a : []).filter((d) => d && Number.isFinite(d.startMs)).slice().sort((x, y) => x.startMs - y.startMs);
  const B = (Array.isArray(b) ? b : []).filter((d) => d && Number.isFinite(d.startMs)).slice().sort((x, y) => x.startMs - y.startMs);
  if (!A.length || !B.length) return null;

  // 1. candidate clock offsets from every roughly-compatible dive pairing
  const candidates = [];
  const pushCand = (ai, bj, offsetMs, kind) => candidates.push({ ai, bj, offsetMs, kind });
  for (let i = 0; i < A.length; i += 1) {
    for (let j = 0; j < B.length; j += 1) {
      const dA = A[i];
      const dB = B[j];
      if (durationClose(dA.durationSeconds || 0, dB.durationSeconds || 0)
          && depthClose(dA.maxDepthMeters || 0, dB.maxDepthMeters || 0)) {
        pushCand(i, j, dB.startMs - dA.startMs, 'pair');
      }
      // B[j] is A[i] + A[i+1] split at the surface
      if (i + 1 < A.length) {
        const run = [A[i], A[i + 1]];
        const gapSec = (A[i + 1].startMs - A[i].startMs) / 1000 - (A[i].durationSeconds || 0);
        if (gapSec >= 0 && gapSec <= SPLIT_MAX_GAP_SEC
            && durationClose(runSpanMs(run) / 1000, dB.durationSeconds || 0)) {
          pushCand(i, j, dB.startMs - dA.startMs, 'a-split');
        }
      }
      // A[i] is B[j] + B[j+1] split
      if (j + 1 < B.length) {
        const run = [B[j], B[j + 1]];
        const gapSec = (B[j + 1].startMs - B[j].startMs) / 1000 - (B[j].durationSeconds || 0);
        if (gapSec >= 0 && gapSec <= SPLIT_MAX_GAP_SEC
            && durationClose(dA.durationSeconds || 0, runSpanMs(run) / 1000)) {
          pushCand(i, j, dB.startMs - dA.startMs, 'b-split');
        }
      }
    }
  }
  if (!candidates.length) return null;

  // 2. vote: the offset bucket with the most candidates whose (ai, bj) indices
  //    increase together (a genuine sequence alignment, not coincidence)
  const buckets = new Map();
  for (const c of candidates) {
    const key = Math.round(c.offsetMs / RECONCILE_BUCKET_MS);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(c);
  }
  let best = null;
  for (const list of buckets.values()) {
    const ordered = list.slice().sort((x, y) => x.ai - y.ai || x.bj - y.bj);
    let monotonic = [ordered[0]];
    for (const c of ordered.slice(1)) {
      const prev = monotonic[monotonic.length - 1];
      if (c.ai >= prev.ai && c.bj >= prev.bj && (c.ai > prev.ai || c.bj > prev.bj)) monotonic.push(c);
    }
    const medianOffset = list.slice().sort((x, y) => x.offsetMs - y.offsetMs)[Math.floor(list.length / 2)].offsetMs;
    const cand = { support: monotonic.length, all: list, chain: monotonic, offsetMs: medianOffset };
    if (!best || cand.support > best.support) best = cand;
  }
  if (!best) return null;

  // 3. verify + refine with the best anchor's depth-profile alignment
  let offsetMs = best.offsetMs;
  let profileScore = 0;
  let bestKind = 'pair';
  for (const c of best.chain) {
    let sA;
    let sB;
    let deltaSec;
    if (c.kind === 'pair') {
      sA = A[c.ai].samples; sB = B[c.bj].samples;
      deltaSec = (A[c.ai].startMs - B[c.bj].startMs) / 1000;
    } else if (c.kind === 'a-split' && c.ai + 1 < A.length) {
      sA = stitchProfiles([A[c.ai], A[c.ai + 1]].map((d) => ({ samples: d.samples, durationSeconds: d.durationSeconds, wallStart: d.startMs })));
      sB = B[c.bj].samples;
      deltaSec = (A[c.ai].startMs - B[c.bj].startMs) / 1000;
    } else if (c.kind === 'b-split' && c.bj + 1 < B.length) {
      sA = A[c.ai].samples;
      sB = stitchProfiles([B[c.bj], B[c.bj + 1]].map((d) => ({ samples: d.samples, durationSeconds: d.durationSeconds, wallStart: d.startMs })));
      deltaSec = (A[c.ai].startMs - B[c.bj].startMs) / 1000;
    } else {
      continue;
    }
    if (!(sA || []).length || !(sB || []).length) continue;
    const { offsetSec, score } = bestOffset(sA, sB, deltaSec);
    if (score > profileScore) {
      profileScore = score;
      bestKind = c.kind;
      if (score >= CONFIRM_SCORE) offsetMs = -offsetSec * 1000;
    }
  }
  const clean = cleanOffsetMinutes(-offsetMs / 1000);
  const offsetMinutes = clean != null ? clean : Math.round(-offsetMs / 60000);
  // High confidence: several ordered anchors, OR a single anchor whose profiles
  // line up well. A split anchor scores lower (one side surfaced where the other
  // didn't) but the tight duration + surface-gap + sequence-position match is
  // itself strong evidence, so it gets a lower bar.
  const scoreBar = bestKind === 'pair' ? 0.9 : 0.72;
  const confidence = (best.support >= 2 || profileScore >= scoreBar) ? 'high' : 'low';

  // 4. walk both sequences on the shared clock and group them
  //    offsetMs = b.start - a.start; subtract it to bring B onto A's timeline
  const bShift = B.map((d) => ({ ...d, startMs: d.startMs - offsetMs }));
  const groups = [];
  let i = 0;
  let j = 0;
  while (i < A.length && j < bShift.length) {
    const ia = interval(A[i]);
    const ib = interval(bShift[j]);
    if (!intervalsOverlap(ia, ib)) {
      if (ia[1] < ib[0]) i += 1; else j += 1;
      continue;
    }
    // b-split: A[i] covers bShift[j] + bShift[j+1]
    if (j + 1 < bShift.length && intervalsOverlap(ia, interval(bShift[j + 1]))
        && durationClose((A[i].durationSeconds || 0), runSpanMs([bShift[j], bShift[j + 1]]) / 1000)) {
      groups.push({ aIds: [A[i].id], bIds: [bShift[j].id, bShift[j + 1].id], kind: 'b-split' });
      i += 1; j += 2; continue;
    }
    // a-split: bShift[j] covers A[i] + A[i+1]
    if (i + 1 < A.length && intervalsOverlap(interval(A[i + 1]), ib)
        && durationClose((bShift[j].durationSeconds || 0), runSpanMs([A[i], A[i + 1]]) / 1000)) {
      groups.push({ aIds: [A[i].id, A[i + 1].id], bIds: [bShift[j].id], kind: 'a-split' });
      i += 2; j += 1; continue;
    }
    groups.push({ aIds: [A[i].id], bIds: [bShift[j].id], kind: 'pair' });
    i += 1; j += 1;
  }

  return {
    offsetMinutes,
    cleanOffset: clean != null,
    confidence,
    anchors: best.support,
    profileScore: Math.round(profileScore * 1000) / 1000,
    groups: groups.filter((g) => g.aIds.length + g.bIds.length >= 2),
  };
}

/**
 * Roll a set of per-log match results up into conflict clusters for the B7 UI:
 * one entry per (deviceA, deviceB, offsetMinutes) with the affected dives and
 * the contiguous date range.
 */
export function clusterConflicts(matches) {
  const clusters = new Map();
  for (const m of matches) {
    if (!m || !m.clockConflict || !m.offsetMinutes) continue;
    const key = `${m.deviceKeyNew}|${m.deviceKeyExisting}|${m.offsetMinutes}`;
    if (!clusters.has(key)) {
      clusters.set(key, {
        deviceKeyNew: m.deviceKeyNew,
        deviceKeyExisting: m.deviceKeyExisting,
        offsetMinutes: m.offsetMinutes,
        cleanOffset: m.cleanOffset,
        diveIds: [],
        dates: [],
      });
    }
    const c = clusters.get(key);
    c.diveIds.push(m.diveId);
    if (m.date) c.dates.push(m.date);
  }
  return [...clusters.values()].map((c) => ({
    ...c,
    dates: undefined,
    firstDate: c.dates.length ? c.dates.slice().sort()[0] : '',
    lastDate: c.dates.length ? c.dates.slice().sort()[c.dates.length - 1] : '',
    diveCount: c.diveIds.length,
  }));
}

export const _internals = { RESAMPLE_SEC, AUTO_SCORE, CONFIRM_SCORE, iso };
